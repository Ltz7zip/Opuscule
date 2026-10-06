# -*- coding: utf-8 -*-
"""世界工作区的接口层（/api/world/*）与页面。

重建说明
========
这个文件在一次工具事故里被覆盖过，源码丢失；当时应用靠 ``world/views.pyc``
（覆盖前编译的字节码）继续运行。现在按"**逐批重写、每批跑测试**"的方式把源码补回来：

* ``world/views_legacy.pyc`` 是那份字节码，**只作为临时转发源**存在；
* 本文件顶部先用 ``from .views_legacy import *`` 兜住还没重写的部分；
* 每重写完一批（见下面 B1–B9），就用真实实现覆盖同名转发；
* 全部写完后删掉这行转发与 ``views_legacy.pyc``，并删掉 ``views.pyc``。

重写批次（对照 ``docs/views_bytcode_inventory.md`` 的函数清单）::

    B1 基础与启动      json_response / parse_json / error / current_world / get_* / touch_document …
    B2 文档与卡片      workspace / state / document_* / card_detail / apply_card_payload
    B3 类型与属性      type_* / property_*
    B4 时间线          timeline_detail / event_* / calendar_* / era_* / calendar_month
    B5 经典编辑器适配  classic_timeline / classic_items / classic_view / _timeline_document
    B6 关系树 / 地图 / 图谱
    B7 搜索 / 建议 / 导入导出 / 表格 / 通用数据 / 媒体
    B8 账号 / 成员 / 在线 / 版本历史
    B9 发布与站点

注意：转发只是过渡。**新增或修改接口时请直接写在本文件里**，别去动 views_legacy。
"""

from __future__ import annotations

import json
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from . import autolink, classic as classic_service, graph as graph_service, permissions, publish as publish_service
from .models import (
    AUDIENCES,
    CAL_CUSTOM,
    CAL_EARTH,
    DEFAULT_THEME,
    DOC_CARD,
    DOC_FOLDER,
    DOC_MAP,
    DOC_TIMELINE,
    DOC_TREE,
    DOC_TYPES,
    ERA_THEMES,
    MARKER_COLORS,
    MARKER_KINDS,
    MARKER_LABEL,
    MARKER_PIN,
    MAX_VERSIONS,
    ROLE_OWNER,
    TREE_EDGE_KINDS,
    TREE_EDGE_LABELS,
    TREE_KINDS,
    Calendar,
    Card,
    Document,
    DocumentVersion,
    EntityType,
    Era,
    InviteCode,
    MapLayer,
    MapMarker,
    Membership,
    Presence,
    PropertyDef,
    TimelineEvent,
    TreeEdge,
    TreeNode,
    TreeVariant,
    World,
    make_slug,
)
from .normalize import (
    ValueErrorCN,
    as_alias_list,
    as_int,
    as_text,
    blocks_to_text,
    coerce_property_value,
    default_values_for,
    normalize_blocks,
    resolve_card_values,
)

# --------------------------------------------------------------------------- #
# 临时转发：尚未重写的部分仍由 bytecode 提供（见文件头的重建说明）
# --------------------------------------------------------------------------- #
from .views_legacy import *          # noqa: F401,F403,E402
from .views_legacy import _table_config, table_payload, _user_payload  # noqa: F401,E402

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"}
DOC_TYPE_LABEL = {
    "board": "看板", "dictionary": "词典", "todo": "待办清单", "dice": "骰子",
    "soundscape": "环境音", "radar": "雷达图", "canvas": "画布", "voice": "语音备忘",
    "chapter": "章节", "media": "媒体库", "embed": "链接嵌入", "table": "表格",
    "note": "笔记",
}
ITEM_NOT_FOUND = {"error": "未找到该事件"}
DOC_NOT_FOUND = {"error": "未找到该文档"}


# =========================================================================== #
# B1 基础与启动
# =========================================================================== #
def json_response(data, status: int = 200) -> JsonResponse:
    """中文直接输出，不转义成 \\uXXXX（与 timeline 应用一致）。

    显式 ``no-store``：这些接口没有 ETag / Last-Modified，浏览器会"启发式缓存"，
    结果是在另一个标签页改了主题或文档后，刷新页面看到的还是旧数据。
    """
    response = JsonResponse(data, status=status, json_dumps_params={"ensure_ascii": False})
    response["Cache-Control"] = "no-store"
    return response


def parse_json(request) -> dict:
    """请求体当 JSON 解；解不出来就当空字典（写接口容错）。"""
    try:
        parsed = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def error(message: str, status: int = 400) -> JsonResponse:
    return json_response({"error": message}, status=status)


def current_world_or_none():
    return permissions.current_world_or_none()


def current_world() -> World:
    """单世界模式：取第一个世界；一个都没有就按调研文档 §16.1 的默认主题建一个。"""
    world = World.objects.order_by("id").first()
    if world is None:
        world = World.objects.create(
            name="新世界",
            slug=make_slug("world", timezone.now().isoformat()),
            theme_config=dict(DEFAULT_THEME),
            genres=["dark-fantasy"],
        )
        Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)
    return world


def get_document(world: World, doc_id) -> Document | None:
    return world.documents.filter(pk=as_int(doc_id), deleted_at__isnull=True).first()


def get_type(world: World, type_id) -> EntityType | None:
    return world.types.filter(pk=as_int(type_id)).first()


def get_event(world: World, event_id) -> TimelineEvent | None:
    return TimelineEvent.objects.filter(pk=as_int(event_id), document__world=world).first()


def save_document_settings(document: Document, patch: dict) -> None:
    """把一小撮设置并进 document.settings（不动其它键）。"""
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    settings_.update(patch or {})
    document.settings = settings_


def _any_document(world: World) -> Document:
    """世界里一份文档都没有时兜底建一个——有些写操作要 touch 一下"最近改动"。"""
    document = world.documents.order_by("id").first()
    if document is None:
        document = Document.objects.create(world=world, document_type=DOC_FOLDER, name="资料")
    return document


def timeline_state(document: Document) -> dict:
    """时间线的完整状态：日历 + 纪元 + 事件 + 视野。"""
    world = document.world
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    calendar = world.calendars.filter(pk=as_int(settings_.get("calendar"))).first()
    if calendar is None:
        calendar = world.calendars.order_by("id").first()
    if calendar is None:
        calendar = Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)
    events = document.events.all().order_by("year", "month", "day", "hour", "id")
    return {
        "document": document.to_payload(),
        "calendar": calendar.to_payload(),
        "calendars": [item.to_payload() for item in world.calendars.order_by("id")],
        "eras": [era.to_payload() for era in world.eras.order_by("position", "id")],
        "events": [event.to_payload() for event in events],
        "view": settings_.get("view") or {"start": -100.0, "end": 900.0},
        "presets": PRESET_CALENDARS if "PRESET_CALENDARS" in globals() else [],
    }


def _summarize(document: Document) -> str:
    """版本列表里那句"改了什么"。"""
    card = getattr(document, "card", None)
    if card is not None:
        blocks = card.blocks or []
        headings = [b.get("title") for b in blocks if isinstance(b, dict) and b.get("title")]
        return f"{len(blocks)} 个区块" + (f"：{'、'.join(headings[:3])}" if headings else "")
    if document.document_type == DOC_TIMELINE:
        return f"{document.events.count()} 个事件"
    if document.document_type == "map":
        return f"{document.map_markers.count()} 个标注"
    if document.document_type == DOC_TREE:
        return "关系树"
    return ""


def snapshot_document(document: Document, *, label: str = "", author=None) -> DocumentVersion | None:
    """给文档留一版快照。同一作者 90 秒内的连续改动合并成一版（不然打字会刷屏）。"""
    from . import exchange

    payload = exchange.document_payload(document)
    payload.pop("updated_at", None)
    payload.pop("publish_state", None)

    last = document.versions.order_by("-index").first()
    if (last is not None and author is not None
            and last.author_id == getattr(author, "id", None)
            and (timezone.now() - last.created_at).total_seconds() < 90):
        last.payload = payload
        last.label = label or last.label
        last.summary = _summarize(document)
        last.save(update_fields=["payload", "label", "summary"])
        return last

    index = (last.index + 1) if last else 1
    version = DocumentVersion.objects.create(
        document=document,
        index=index,
        author=author if getattr(author, "is_authenticated", False) else None,
        author_name=(author.get_full_name() or author.username) if getattr(author, "is_authenticated", False) else "匿名",
        label=label[:80],
        payload=payload,
        summary=_summarize(document),
    )
    extra = document.versions.order_by("-index").values_list("id", flat=True)[MAX_VERSIONS:]
    if extra:
        DocumentVersion.objects.filter(id__in=list(extra)).delete()
    return version


def touch_document(document: Document | None, label: str = "", author=None) -> None:
    """顶一下文档的 updated_at（auto_now 会在 save 时刷新）——发布状态靠它算 stale。

    顺手把修订号 +1（编辑冲突保护）并留一版快照（版本历史）。同一作者 90 秒内的
    连续改动会合并成一版，所以打字不会把历史刷满。
    """
    if document is None:
        return
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    settings_["revision"] = as_int(settings_.get("revision"), 0) + 1
    document.settings = settings_
    document.save(update_fields=["updated_at", "settings"])
    try:
        snapshot_document(document, label=label or "内容改动", author=author)
    except Exception:      # 版本只是"有更好"，绝不能因为它挡了正文保存
        pass


# --------------------------------------------------------------------------- #
# 页面与启动数据
# --------------------------------------------------------------------------- #
def workspace(request):
    """工作区页面：前端自己再拉 /api/world/state 启动。

    ``?embed=<doc_id>``：发布站点里嵌地图 / 关系树 / 图谱画布时用——
    只渲染那一篇文档，去掉工作区外壳，默认只读。
    """
    embed_id = as_int(request.GET.get("embed"), 0)
    return render(request, "workspace.html", {
        "embed_doc": embed_id,
        "embed_readonly": request.GET.get("readonly", "1") not in ("0", "false", "no"),
    })


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def world_detail(request):
    """读 / 改当前世界（名称、主题、AI 与自动识别开关、题材）。"""
    world = current_world()
    if request.method == "GET":
        return json_response(world.to_payload())

    payload = parse_json(request)
    if "name" in payload:
        world.name = as_text(payload.get("name"), 120) or world.name
    if "description" in payload:
        world.description = as_text(payload.get("description"), 4000)
    if "theme_config" in payload and isinstance(payload.get("theme_config"), dict):
        theme = dict(world.theme_config or {})
        for key, value in payload["theme_config"].items():
            if key in ("mode", "grain", "headingFont", "bodyFont", "primaryColor", "background"):
                theme[key] = value
        if theme.get("mode") not in ("light", "dark"):
            theme["mode"] = "dark"
        world.theme_config = theme
    if "genres" in payload and isinstance(payload.get("genres"), list):
        world.genres = [as_text(item, 40) for item in payload["genres"] if as_text(item, 40)][:12]
    for field in ("ai_enabled", "auto_link_enabled", "link_entrance_enabled"):
        if field in payload:
            setattr(world, field, bool(payload.get(field)))
    world.save()
    return json_response(world.to_payload())


@csrf_exempt
@require_safe
def state(request):
    """启动数据：世界 + 我是谁 + 在线 + 类型 + 纪元 + 日历 + 文档树。"""
    world = current_world()
    roots = world.documents.filter(parent__isnull=True, deleted_at__isnull=True).order_by("position", "id")
    documents = [document.to_payload(with_children=True) for document in roots]

    # 树节点带上卡片的"纪元可见性"：前端要按当前纪元标出不属于它的卡
    era_map = {
        card.document_id: (card.era_mode, card.era_ids if isinstance(card.era_ids, list) else [])
        for card in Card.objects.filter(document__world=world)
    }

    def annotate(nodes):
        for node in nodes:
            mode, ids = era_map.get(node["id"], (None, None))
            if mode is not None:
                node["era_mode"] = mode
                node["era_ids"] = ids
            annotate(node.get("children") or [])

    annotate(documents)
    return json_response({
        "world": world.to_payload(),
        "viewer": permissions.viewer_payload(request.user, world),
        "online": [entry.to_payload() for entry in Presence.online(world)],
        "types": [entity_type.to_payload() for entity_type in world.types.all()],
        "eras": [era.to_payload() for era in world.eras.all()],
        "calendars": [calendar.to_payload() for calendar in world.calendars.all()],
        "documents": documents,
        "doc_types": [{"value": value, "label": label} for value, label in DOC_TYPES],
        "trash_count": world.documents.filter(deleted_at__isnull=False).count(),
    })


# --------------------------------------------------------------------------- #
# 文档树与卡片
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["GET", "POST"])
def document_collection(request):
    """文档列表 / 新建（卡片、时间线、关系树、地图、任意工具型文档都从这里建）。"""
    world = current_world()

    if request.method == "GET":
        query = world.documents.filter(deleted_at__isnull=True)
        doc_type = request.GET.get("type")
        if doc_type:
            query = query.filter(document_type=doc_type)
        parent = request.GET.get("parent")
        if parent not in (None, "", "root"):
            query = query.filter(parent_id=as_int(parent))
        keyword = (request.GET.get("q") or "").strip()
        if keyword:
            query = query.filter(name__icontains=keyword)
        return json_response({
            "documents": [document.to_payload(with_card=True)
                          for document in query.order_by("position", "id")]
        })

    payload = parse_json(request)
    doc_type = as_text(payload.get("type"), 40) or DOC_CARD
    if doc_type not in {value for value, _label in DOC_TYPES}:
        return error("未知的文档类型")

    parent = None
    if payload.get("parent") not in (None, "", "root"):
        parent = get_document(world, payload.get("parent"))
    entity_type = get_type(world, payload.get("entity_type"))
    position = as_int(payload.get("position"), 0)

    document = Document.objects.create(
        world=world,
        document_type=doc_type,
        name=as_text(payload.get("name"), 200) or "未命名",
        parent=parent,
        position=position,
        era_id=as_int(payload.get("era"), 0) or None,
        era_ids=payload.get("era_ids") if isinstance(payload.get("era_ids"), list) else [],
        entity_type=entity_type,
        settings=payload.get("settings") if isinstance(payload.get("settings"), dict) else {},
        cover=as_text(payload.get("cover"), 500),
    )

    if doc_type == DOC_CARD:
        # 新卡片给一块空白"概览"，属性值按类型预填 —— 空白卡片对新手太不友好
        Card.objects.create(
            document=document,
            entity_type=entity_type,
            values=default_values_for(entity_type) if entity_type is not None else {},
            blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": ""}]),
        )
    elif doc_type == DOC_TIMELINE:
        calendar_id = as_int(payload.get("calendar"), 0)
        if not calendar_id:
            calendar = world.calendars.order_by("id").first()
            calendar_id = calendar.id if calendar is not None else 0
        if calendar_id:
            save_document_settings(document, {"calendar": calendar_id})
            document.save(update_fields=["settings"])
    elif doc_type == DOC_TREE:
        kind = as_text(payload.get("kind"), 40) or TREE_KINDS[0][0]
        TreeVariant.objects.create(document=document, kind=kind)

    touch_document(document, label="新建文档", author=request.user)
    return json_response(document.to_payload(with_card=True))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def document_detail(request, doc_id):
    """单篇文档：读 / 改（改名、移动、隐藏、置顶、封面、设置）/ 删（软删或彻底删）。"""
    world = current_world()
    permanent = request.GET.get("hard") in ("1", "true", "yes")
    document = world.documents.filter(pk=as_int(doc_id)).first()
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        with_children = request.GET.get("children") in ("1", "true", "yes")
        payload = document.to_payload(with_card=True, with_children=with_children)
        payload["revision"] = as_int((document.settings or {}).get("revision"), 0)
        return json_response(payload)

    if request.method == "DELETE":
        if permanent:
            document.delete()
        else:
            document.deleted_at = timezone.now()
            document.save(update_fields=["deleted_at"])
        return json_response({"success": True, "removed": permanent})

    payload = parse_json(request)
    if "name" in payload:
        document.name = as_text(payload.get("name"), 200) or document.name
    if "parent" in payload:
        new_parent_id = payload.get("parent")
        parent = None
        if new_parent_id not in (None, "", "root"):
            parent = get_document(world, new_parent_id)
            # 不能把文档挂到自己的子孙下面，否则树就成环了
            if parent is not None:
                walker = parent
                while walker is not None:
                    if walker.id == document.id:
                        return error("不能把文档移动到它自己的子文件夹里")
                    walker = walker.parent
        document.parent = parent
    for field in ("pinned", "hidden"):
        if field in payload:
            setattr(document, field, bool(payload.get(field)))
    if "cover" in payload:
        document.cover = as_text(payload.get("cover"), 500)
    if "document_type" in payload:
        value = as_text(payload.get("document_type"), 40)
        if value in {item for item, _label in DOC_TYPES}:
            document.document_type = value
    if "era" in payload:
        document.era_id = as_int(payload.get("era"), 0) or None
    if "era_ids" in payload and isinstance(payload.get("era_ids"), list):
        document.era_ids = [as_int(item) for item in payload["era_ids"] if as_int(item)]
    if "entity_type" in payload:
        document.entity_type = get_type(world, payload.get("entity_type"))
    if "settings" in payload and isinstance(payload.get("settings"), dict):
        merged = dict(document.settings or {})
        merged.update(payload["settings"])
        document.settings = merged
    if "position" in payload:
        document.position = as_int(payload.get("position"), document.position)

    card = getattr(document, "card", None)
    if card is not None:
        apply_card_payload(card, world, payload)
        card.save()

    document.save()
    touch_document(document, label="修改文档", author=request.user)
    result = document.to_payload(with_card=True)
    result["revision"] = as_int((document.settings or {}).get("revision"), 0)
    return json_response(result)


@csrf_exempt
@require_http_methods(["POST"])
def document_duplicate(request, doc_id):
    """复制一篇文档（卡片连属性值、时间线连事件一起带走）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    clone = Document.objects.create(
        world=world,
        document_type=document.document_type,
        name=f"{document.name}（副本）",
        parent=document.parent,
        position=document.position,
        era=document.era,
        era_ids=list(document.era_ids or []),
        entity_type=document.entity_type,
        settings=dict(document.settings or {}),
        cover=document.cover,
    )
    card = getattr(document, "card", None)
    if card is not None:
        Card.objects.create(
            document=clone,
            entity_type=card.entity_type,
            aliases=list(card.aliases or []),
            values=dict(card.values or {}),
            blocks=normalize_blocks(card.blocks),
            body=card.body,
        )
    for event in document.events.all():
        TimelineEvent.objects.create(
            document=clone,
            title=event.title,
            precision=event.precision,
            year=event.year,
            month=event.month,
            day=event.day,
            hour=event.hour,
            era=event.era,
            description=event.description,
            cover=event.cover,
            row=event.row,
            position=event.position,
            featured_card=event.featured_card,
        )
    touch_document(clone, label="复制文档", author=request.user)
    return json_response(clone.to_payload(with_card=True))


@csrf_exempt
@require_http_methods(["GET"])
def trash_collection(request):
    """回收站：软删掉的文档，可以还原或彻底删。"""
    world = current_world()
    documents = world.documents.filter(deleted_at__isnull=False).order_by("-deleted_at", "id")
    return json_response({
        "documents": [document.to_payload() for document in documents],
        "count": documents.count(),
    })


@csrf_exempt
@require_http_methods(["POST"])
def document_restore(request, doc_id):
    """从回收站还原一篇文档（父级已经被删的话，挂回根上）。"""
    world = current_world()
    document = world.documents.filter(pk=as_int(doc_id), deleted_at__isnull=False).first()
    if document is None:
        # 不在回收站里的文档谈不上"恢复"
        return json_response(DOC_NOT_FOUND, status=404)

    document.deleted_at = None
    if document.parent is not None and document.parent.deleted_at is not None:
        document.parent = None      # 父文件夹还在回收站里 -> 提到顶层，不然还原完就看不见了
    document.save(update_fields=["deleted_at", "parent"])
    touch_document(document, label="从回收站还原", author=request.user)
    return json_response(document.to_payload(with_card=True))


def apply_card_payload(card: Card, world: World, payload: dict) -> None:
    """把请求体里的别名 / 属性值 / 区块写进卡片（属性值逐条按类型校验）。"""
    if "aliases" in payload:
        card.aliases = as_alias_list(payload.get("aliases"))

    if "era_mode" in payload:
        raw = payload.get("era_mode")
        mode = raw if raw in ("universal", "only", "hidden") else ""
        card.era_mode = mode or "universal"
    if "era_ids" in payload:
        incoming = payload.get("era_ids")
        card.era_ids = [as_int(item) for item in incoming if as_int(item)] if isinstance(incoming, list) else []
        if card.era_mode == "only" and not card.era_ids:
            card.era_mode = "hidden"      # "只在某些纪元出现"却一个都没选 = 哪儿都不出现

    if "blocks" in payload:
        card.blocks = normalize_blocks(payload.get("blocks"))
        card.body = blocks_to_text(card.blocks)      # 正文由区块推导，保证两者一致
    if "body" in payload and "blocks" not in payload:
        card.body = as_text(payload.get("body"), 20000)

    if "entity_type" in payload:
        card.entity_type = get_type(world, payload.get("entity_type"))

    if "values" in payload:
        values = payload.get("values")
        if not isinstance(values, dict):
            values = {}
        entity_type = card.entity_type
        if entity_type is None:
            if values:
                raise ValueErrorCN("请先给这张卡片选一个类型，再填属性")
        else:
            # 属性值的键是"属性 id 的字符串"（见 normalize.resolve_card_values）
            resolved = dict(card.values or {})
            for prop in entity_type.all_properties():
                prop_key = str(prop.id)
                if prop_key in values:
                    resolved[prop_key] = coerce_property_value(prop, values.get(prop_key), world)
            card.values = resolved


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def card_detail(request, doc_id):
    """一张卡片的正文与属性。PUT 会校验修订号：对不上说明别人先改了，回 409。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    card, _created = Card.objects.get_or_create(document=document, defaults={"entity_type": document.entity_type})

    if request.method == "GET":
        return json_response({
            "document": document.to_payload(),
            "card": card.to_payload(),
            "entity_type": (card.effective_type().to_payload() if card.effective_type() else None),
            "revision": as_int((document.settings or {}).get("revision"), 0),
        })

    payload = parse_json(request)
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    current_revision = as_int(settings_.get("revision"), 0)
    incoming = payload.get("revision")
    if incoming is not None and as_int(incoming, -1) != current_revision:
        return json_response({
            "error": "这份文档刚被别人改过，已经刷新成最新内容",
            "conflict": True,
            "revision": current_revision,
            "document": document.to_payload(),
            "card": card.to_payload(),
        }, status=409)

    try:
        apply_card_payload(card, world, payload)
    except ValueErrorCN as exc:
        return error(str(exc))
    card.save()
    touch_document(document, label="编辑卡片", author=request.user)
    return json_response({
        "document": document.to_payload(),
        "card": card.to_payload(),
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })
