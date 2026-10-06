# -*- coding: utf-8 -*-
"""世界工作区的接口层（/api/world/*）与页面。

重建说明（已完成）
==================
这个文件在一次工具事故里被覆盖过，源码丢失；当时应用靠 ``world/views.pyc``
（覆盖前编译的字节码）继续运行。之后按"**逐批重写、每批跑测试**"的方式把源码补了回来，
分九批（B1 基础 / B2 文档与卡片 / B3 类型与属性 / B4 时间线 / B5 经典编辑器适配 /
B6 关系树·地图·图谱 / B7 搜索·建议·导入导出·表格·数据·媒体 / B8 账号·成员·在线·版本 /
B9 发布与站点），每批都以 165 个测试全绿为准。

重建时的对照表留在 ``docs/views_bytcode_inventory.md``（从字节码提取的 101 个函数的
签名、docstring 与关键字面量），出问题可以回去比对。
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
    MOON_EVERY_NIGHT,
    MOON_FULL,
    MOON_QUARTERS,
    PRECISIONS,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
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
from .classic import ERA_ID_BASE
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

# 重建完成：不再有 bytecode 转发，本文件就是唯一实现。

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"}
DOC_TYPE_LABEL = {
    "board": "看板", "dictionary": "词典", "todo": "待办清单", "dice": "骰子",
    "soundscape": "环境音", "radar": "雷达图", "canvas": "画布", "voice": "语音备忘",
    "chapter": "章节", "media": "媒体库", "embed": "链接嵌入", "table": "表格",
    "note": "笔记",
}
# 事件精度 / 月相显示策略：模型与日历视图是这两份清单的源头
VALID_PRECISIONS = tuple(value for value, _label in PRECISIONS)
VALID_MOON_SHOWN = (MOON_EVERY_NIGHT, MOON_QUARTERS, MOON_FULL)

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


# --------------------------------------------------------------------------- #
# 类型与属性
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["GET", "POST"])
def type_collection(request):
    """类型列表 / 新建类型（可以做子类型，属性会继承下来）。"""
    world = current_world()
    if request.method == "GET":
        return json_response({"types": [entity_type.to_payload() for entity_type in world.types.all()]})

    payload = parse_json(request)
    name = as_text(payload.get("name"), 60) or "新类型"
    if world.types.filter(name=name).exists():
        return error(f"已经有一个叫「{name}」的类型了")

    parent = get_type(world, payload.get("parent"))
    entity_type = EntityType.objects.create(
        world=world,
        name=name,
        parent=parent,
        icon=as_text(payload.get("icon"), 40),
        color=as_text(payload.get("color"), 20),
        position=as_int(payload.get("position"), world.types.count()),
    )
    return json_response(entity_type.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def type_detail(request, type_id):
    """单个类型：读 / 改（改名、图标、颜色、换父类）/ 删（子类型会被提到上一层）。"""
    world = current_world()
    entity_type = get_type(world, type_id)
    if entity_type is None:
        return json_response({"error": "未找到该类型"}, status=404)

    if request.method == "GET":
        return json_response(entity_type.to_payload())

    if request.method == "DELETE":
        # 删之前把子类型挂到自己的父级上，不能让它们跟着蒸发
        entity_type.children.update(parent=entity_type.parent)
        entity_type.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        name = as_text(payload.get("name"), 60)
        if name and world.types.filter(name=name).exclude(pk=entity_type.pk).exists():
            return error(f"已经有一个叫「{name}」的类型了")
        if name:
            entity_type.name = name
    for field in ("icon", "color"):
        if field in payload:
            setattr(entity_type, field, as_text(payload.get(field), 40))
    if "parent" in payload:
        parent_id = payload.get("parent")
        if parent_id in (None, "", 0, "0"):
            entity_type.parent = None
        else:
            parent = get_type(world, parent_id)
            if parent is not None and parent.pk == entity_type.pk:
                return error("类型不能把自己当父类")
            entity_type.parent = parent
    if "hidden" in payload:
        entity_type.hidden = bool(payload.get("hidden"))
    if "position" in payload:
        entity_type.position = as_int(payload.get("position"), entity_type.position)
    entity_type.save()
    return json_response(entity_type.to_payload())


@csrf_exempt
@require_http_methods(["GET", "POST"])
def property_collection(request, type_id):
    """某个类型下的属性列表 / 新建属性（值类型、选项、引用目标、公式）。"""
    world = current_world()
    entity_type = get_type(world, type_id)
    if entity_type is None:
        return json_response({"error": "未找到该类型"}, status=404)

    if request.method == "GET":
        return json_response({"properties": [prop.to_payload() for prop in entity_type.properties.all()]})

    payload = parse_json(request)
    name = as_text(payload.get("name"), 60) or "新属性"
    if entity_type.properties.filter(name=name).exists():
        return error(f"「{entity_type.name}」已经有「{name}」这个属性了")

    options = payload.get("options") if isinstance(payload.get("options"), list) else []
    reference_type = get_type(world, payload.get("reference_type"))
    prop = PropertyDef.objects.create(
        entity_type=entity_type,
        name=name,
        value_type=as_text(payload.get("value_type"), 20) or "text",
        options=[as_text(item, 60) for item in options if as_text(item, 60)],
        reference_type=reference_type,
        required=bool(payload.get("required")),
        default_value=payload.get("default"),
        formula=as_text(payload.get("formula"), 400),
        position=entity_type.properties.count(),
    )

    # 新属性给已有卡片补上默认值，不然表格 / 卡片里这一列是空的
    if prop.default_value not in (None, ""):
        for card in Card.objects.filter(entity_type=entity_type):
            values = dict(card.values or {})
            values[str(prop.id)] = prop.default_value
            card.values = values
            card.save(update_fields=["values"])
    return json_response(prop.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def property_detail(request, property_id):
    """单个属性：读 / 改 / 删。"""
    world = current_world()
    prop = PropertyDef.objects.filter(pk=as_int(property_id), entity_type__world=world).first()
    if prop is None:
        return json_response({"error": "未找到该属性"}, status=404)

    if request.method == "GET":
        return json_response(prop.to_payload())

    if request.method == "DELETE":
        prop.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        prop.name = as_text(payload.get("name"), 60) or prop.name
    if "value_type" in payload:
        prop.value_type = as_text(payload.get("value_type"), 20) or prop.value_type
    if "options" in payload and isinstance(payload.get("options"), list):
        prop.options = [as_text(item, 60) for item in payload["options"] if as_text(item, 60)]
    if "reference_type" in payload:
        prop.reference_type = get_type(world, payload.get("reference_type"))
    if "required" in payload:
        prop.required = bool(payload.get("required"))
    if "default" in payload:
        prop.default_value = payload.get("default")
    if "formula" in payload:
        prop.formula = as_text(payload.get("formula"), 400)
    if "position" in payload:
        prop.position = as_int(payload.get("position"), prop.position)
    prop.save()
    return json_response(prop.to_payload())


# --------------------------------------------------------------------------- #
# 时间线：状态 / 事件 / 历法 / 纪元
# --------------------------------------------------------------------------- #
def _timeline_document(request, doc_id) -> Document | None:
    """取一条时间线文档（不是时间线就返回 None，调用方各自给错）。"""
    document = get_document(current_world(), doc_id)
    if document is None or document.document_type != DOC_TIMELINE:
        return None
    return document


@csrf_exempt
@require_safe
def timeline_state_view(request, doc_id):
    """一条时间线的完整状态：日历 + 纪元 + 事件 + 视野。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TIMELINE:
        return error("这个文档不是时间线")
    return json_response(timeline_state(document))


def _clean_event_payload(world: World, payload: dict, document: Document, event: TimelineEvent | None) -> TimelineEvent:
    """把请求体写进事件对象（精度决定哪些字段有意义）。"""
    event = event or TimelineEvent(document=document)
    if "title" in payload:
        event.title = as_text(payload.get("title"), 200) or "未命名事件"
    precision = as_text(payload.get("precision"), 20)
    if precision in VALID_PRECISIONS:
        event.precision = precision
    # 精度之外的字段一律清零：一个"年"精度的事件不该残留月份
    for field in ("year", "month", "day", "hour"):
        if field in payload:
            setattr(event, field, as_int(payload.get(field), 0))
    if "era" in payload:
        era_id = as_int(payload.get("era"), 0)
        event.era = world.eras.filter(pk=era_id).first() if era_id else None
    for field, limit in (("description", 20000), ("cover", 4000)):
        if field in payload:
            setattr(event, field, as_text(payload.get(field), limit))
    for field in ("row", "position"):
        if field in payload:
            setattr(event, field, as_int(payload.get(field), 0))
    if "featured_card" in payload:
        card_doc = get_document(world, payload.get("featured_card"))
        event.featured_card = card_doc
    return event


@csrf_exempt
@require_http_methods(["GET", "POST"])
def event_collection(request, doc_id):
    """一条时间线下的事件：列表 / 新建。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TIMELINE:
        return error("这个文档不是时间线")

    if request.method == "GET":
        return json_response({"events": [event.to_payload() for event in document.events.all()]})

    event = _clean_event_payload(world, parse_json(request), document, None)
    event.save()
    touch_document(document, label="新建事件", author=request.user)
    return json_response(event.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def event_detail(request, event_id):
    """单个事件：读 / 改 / 删。"""
    world = current_world()
    event = get_event(world, event_id)
    if event is None:
        return json_response(ITEM_NOT_FOUND, status=404)

    if request.method == "GET":
        return json_response(event.to_payload())

    if request.method == "DELETE":
        document = event.document
        event.delete()
        touch_document(document, label="删除事件", author=request.user)
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    document = event.document
    _clean_event_payload(world, payload, document, event).save()
    touch_document(document, label="编辑时间线", author=request.user)
    return json_response(event.to_payload())


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def event_cards(request, event_id, card_id=None):
    """把一张卡片挂到事件上 / 摘下来（"关联卡片"）。

    POST ``/events/<id>/cards``（body 带 ``card_id``）挂上，
    DELETE ``/events/<id>/cards/<card_id>`` 摘掉。
    """
    world = current_world()
    event = get_event(world, event_id)
    if event is None:
        return json_response(ITEM_NOT_FOUND, status=404)

    payload = parse_json(request)
    target_id = card_id if card_id is not None else payload.get("card_id")
    document = get_document(world, target_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "DELETE":
        event.linked_cards.remove(document)
        if event.featured_card_id == document.id:
            event.featured_card = None
            event.save(update_fields=["featured_card"])
        touch_document(event.document, label="编辑时间线", author=request.user)
        return json_response({"success": True, "event": event.to_payload()})

    event.linked_cards.add(document)
    if payload.get("featured"):
        event.featured_card = document
        event.save(update_fields=["featured_card"])
    touch_document(event.document, label="编辑时间线", author=request.user)
    return json_response({"success": True, "event": event.to_payload()})


@csrf_exempt
@require_http_methods(["POST"])
def event_featured(request, event_id):
    """把某个关联卡片设成/取消"封面卡"。"""
    world = current_world()
    event = get_event(world, event_id)
    if event is None:
        return json_response(ITEM_NOT_FOUND, status=404)

    payload = parse_json(request)
    card_doc = get_document(world, payload.get("card_id")) if payload.get("card_id") else None
    event.featured_card = card_doc
    event.save(update_fields=["featured_card"])
    touch_document(event.document, label="编辑时间线", author=request.user)
    return json_response(event.to_payload())


def _clean_calendar_payload(payload: dict, calendar: Calendar) -> Calendar:
    """历法字段清洗（月份结构交给 normalize，别让脏数据进库）。"""
    if "name" in payload:
        calendar.name = as_text(payload.get("name"), 120) or calendar.name
    if "mode" in payload:
        value = as_text(payload.get("mode"), 20)
        if value in (CAL_EARTH, CAL_CUSTOM):
            calendar.mode = value
    if "hours_per_day" in payload:
        calendar.hours_per_day = max(1, as_int(payload.get("hours_per_day"), calendar.hours_per_day))
    if "months" in payload and isinstance(payload.get("months"), list):
        months = []
        for item in payload["months"][:36]:
            if not isinstance(item, dict):
                continue
            months.append({
                "name": as_text(item.get("name"), 40) or f"第{len(months) + 1}月",
                "days": max(1, as_int(item.get("days"), 30)),
            })
        if months:
            calendar.months = months
    if "moons" in payload and isinstance(payload.get("moons"), list):
        moons = []
        for item in payload["moons"][:12]:
            if not isinstance(item, dict):
                continue
            shown = as_text(item.get("shown"), 20)
            moons.append({
                "name": as_text(item.get("name"), 40) or f"卫星{len(moons) + 1}",
                "period": max(0.1, float(item.get("period") or 29.5)),
                "offset": float(item.get("offset") or 0),
                "shown": shown if shown in VALID_MOON_SHOWN else VALID_MOON_SHOWN[0],
            })
        calendar.moons = moons
    for field in ("open_past",):
        if field in payload:
            setattr(calendar, field, bool(payload.get(field)))
    if "default_precision" in payload:
        value = as_text(payload.get("default_precision"), 20)
        if value in VALID_PRECISIONS:
            calendar.default_precision = value
    return calendar


@csrf_exempt
@require_http_methods(["GET", "POST"])
def calendar_collection(request):
    """历法列表 / 新建历法。"""
    world = current_world()
    if request.method == "GET":
        return json_response({"calendars": [calendar.to_payload() for calendar in world.calendars.order_by("id")]})

    payload = parse_json(request)
    calendar = Calendar.objects.create(world=world, name=as_text(payload.get("name"), 120) or "新日历")
    _clean_calendar_payload(payload, calendar)
    calendar.save()
    return json_response(calendar.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def calendar_detail(request, calendar_id):
    """单个历法：读 / 改 / 删（换上别的历法时要顺手换算事件日期）。"""
    world = current_world()
    calendar = world.calendars.filter(pk=as_int(calendar_id)).first()
    if calendar is None:
        return json_response({"error": "未找到该历法"}, status=404)

    if request.method == "GET":
        return json_response(calendar.to_payload())

    if request.method == "DELETE":
        if world.calendars.count() <= 1:
            return error("至少要保留一个日历")
        # 用它的时间线换到另一个历法上，事件日期不动（不换算，保持原样最好解释）
        fallback = world.calendars.exclude(pk=calendar.pk).order_by("id").first()
        for document in Document.objects.filter(world=world, document_type=DOC_TIMELINE):
            if as_int((document.settings or {}).get("calendar"), 0) == calendar.id:
                save_document_settings(document, {"calendar": fallback.id})
                document.save(update_fields=["settings"])
        calendar.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    _clean_calendar_payload(payload, calendar)
    calendar.save()
    if "months" in payload or "hours_per_day" in payload:
        # 月份结构 / 一天小时数变了：把越界的事件钳回合法范围，别留下 3 月 40 日这种日期
        months = calendar.months or [{"name": "一月", "days": 30}]
        for event in TimelineEvent.objects.filter(document__world=world):
            month = min(max(as_int(event.month, 1), 1), len(months))
            days = max(1, as_int(months[month - 1].get("days"), 30))
            day = min(max(as_int(event.day, 1), 1), days)
            hour = min(max(as_int(event.hour, 0), 0), max(0, calendar.hours_per_day - 1))
            if (month, day, hour) != (event.month, event.day, event.hour):
                event.month, event.day, event.hour = month, day, hour
                event.save(update_fields=["month", "day", "hour"])
    return json_response(calendar.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def calendar_preset(request, calendar_id):
    """把当前日历存成预设（调研文档 §6.1：预设可应用到本世界任意时间线）。"""
    world = current_world()
    calendar = world.calendars.filter(pk=as_int(calendar_id)).first()
    if calendar is None:
        return json_response({"error": "未找到该历法"}, status=404)

    payload = parse_json(request)
    preset = Calendar.objects.create(
        world=world,
        name=as_text(payload.get("name"), 120) or f"{calendar.name} 预设",
        mode=calendar.mode,
        hours_per_day=calendar.hours_per_day,
        months=calendar.months,
        moons=calendar.moons,
        open_past=calendar.open_past,
        default_precision=calendar.default_precision,
        is_preset=True,
    )
    return json_response(preset.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def calendar_apply_preset(request, doc_id):
    """把某个预设应用到一条时间线。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    preset = world.calendars.filter(pk=as_int(payload.get("preset")), is_preset=True).first()
    if preset is None:
        return json_response({"error": "未找到该预设"}, status=404)

    # 预设是模板：复制一份挂到这条时间线上，改预设不影响已应用的时间线
    calendar, _created = Calendar.objects.get_or_create(
        world=world,
        name=preset.name,
        is_preset=False,
        defaults={
            "mode": preset.mode,
            "hours_per_day": preset.hours_per_day,
            "months": preset.months,
            "moons": preset.moons,
            "open_past": preset.open_past,
            "default_precision": preset.default_precision,
        },
    )
    save_document_settings(document, {"calendar": calendar.id})
    document.save(update_fields=["settings"])
    touch_document(document, label="应用历法预设", author=request.user)
    return json_response(timeline_state(document))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def era_collection(request):
    """纪元列表 / 新建纪元（纪元就是"世界版本分支"）。"""
    world = current_world()
    if request.method == "GET":
        return json_response({"eras": [era.to_payload() for era in world.eras.all()]})

    payload = parse_json(request)
    theme = as_text(payload.get("theme"), 20)
    era = Era.objects.create(
        world=world,
        name=as_text(payload.get("name"), 120) or "新纪元",
        position=as_int(payload.get("position"), world.eras.count()),
        length_years=float(payload.get("length_years") or 0.0),
        theme=theme if theme in ERA_THEMES else "blue",
        icon=as_text(payload.get("icon"), 40),
        description=as_text(payload.get("description"), 4000),
        cover=as_text(payload.get("cover"), 500),
    )
    return json_response(era.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def era_detail(request, era_id):
    """单个纪元：读 / 改 / 删。"""
    world = current_world()
    era = world.eras.filter(pk=as_int(era_id)).first()
    if era is None:
        return json_response({"error": "未找到该纪元"}, status=404)

    if request.method == "GET":
        return json_response(era.to_payload())

    if request.method == "DELETE":
        era.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        era.name = as_text(payload.get("name"), 120) or era.name
    if "length_years" in payload:
        era.length_years = float(payload.get("length_years") or 0)
    if "theme" in payload:
        theme = as_text(payload.get("theme"), 20)
        if theme in ERA_THEMES:
            era.theme = theme
    for field, limit in (("icon", 40), ("description", 4000), ("cover", 500)):
        if field in payload:
            setattr(era, field, as_text(payload.get(field), limit))
    if "theme_config" in payload and isinstance(payload.get("theme_config"), dict):
        era.theme_config = payload["theme_config"]
    if "position" in payload:
        era.position = as_int(payload.get("position"), era.position)
    era.save()
    return json_response(era.to_payload())


@csrf_exempt
@require_safe
def calendar_month(request, calendar_id):
    """某个历法某个月份的网格（含每天月相与落在当天的事件）——日历视图直接渲染它。"""
    from . import calendarview

    world = current_world()
    calendar = world.calendars.filter(pk=as_int(calendar_id)).first()
    if calendar is None:
        return json_response({"error": "未找到该历法"}, status=404)

    year = as_int(request.GET.get("year"), 1)
    month = as_int(request.GET.get("month"), 1)
    grid = calendarview.month_grid(calendar, year, month)

    document_id = as_int(request.GET.get("document"), 0)
    if document_id:
        document = get_document(world, document_id)
        events = list(document.events.all()) if document is not None else []
    else:
        events = list(TimelineEvent.objects.filter(document__world=world))
    calendarview.place_events(grid, events)      # 就地塞进对应格子
    return json_response(grid)


# --------------------------------------------------------------------------- #
# 经典编辑器适配层（编辑器本身一行没改，这里把它的老接口映射到时间线文档上）
# --------------------------------------------------------------------------- #
def _document_or_404(doc_id: int) -> Document | None:
    """经典编辑器的接口只服务时间线文档；别的文档一律当作"没有"。"""
    document = get_document(current_world(), doc_id)
    if document is None or document.document_type != DOC_TIMELINE:
        return None
    return document


@csrf_exempt
@require_http_methods(["GET"])
def classic_timeline(request, doc_id):
    """整条时间线，结构与传统 /api/timeline 完全一致。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    return json_response(classic_service.classic_payload(document))


@csrf_exempt
@require_http_methods(["POST"])
def classic_items(request, doc_id):
    """新建：``kind="era"`` 走纪元，其余走事件。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    if payload.get("kind") == "era":
        item = classic_service.create_era(document, payload)
    else:
        item = classic_service.apply_item(document, payload, None)
    touch_document(document, label="在时间线里新建", author=request.user)
    return json_response(item)      # 编辑器直接吃这一条（要有 id）


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def classic_item_detail(request, doc_id, item_id):
    """更新 / 删除：id ≥ 1_000_000 的是纪元，其余是事件。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "DELETE":
        removed = classic_service.delete_item(document, item_id)
        if not removed:
            return json_response({"error": "未找到该条目"}, status=404)
        touch_document(document, label="在时间线里删除", author=request.user)
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if item_id >= ERA_ID_BASE:
        era = document.world.eras.filter(pk=item_id - ERA_ID_BASE).first()
        if era is None:
            return json_response({"error": "未找到该纪元"}, status=404)
        item = classic_service.apply_era(document, era.id, payload)
    else:
        event = document.events.filter(pk=item_id).first()
        if event is None:
            return json_response(ITEM_NOT_FOUND, status=404)
        item = classic_service.apply_item(document, payload, event)
    touch_document(document, label="在时间线里编辑", author=request.user)
    return json_response(item)


@csrf_exempt
@require_http_methods(["PUT"])
def classic_view(request, doc_id):
    """记住视野（编辑器滑到哪儿，下次回来还在哪儿）。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    start = float(payload.get("start") or 0.0)
    end = float(payload.get("end") or 1.0)
    if end <= start:
        # 非法范围：原样回给编辑器，但不写库（不然下次打开视野就坏了）
        return json_response({"start": start, "end": end})
    return json_response(classic_service.save_view(document, start, end))


# --------------------------------------------------------------------------- #
# 关系树 / 地图 / 图谱
# --------------------------------------------------------------------------- #
def clamp_int(value, low: int, high: int) -> int:
    return max(low, min(high, as_int(value, low)))


def get_variant(world: World, variant_id):
    return TreeVariant.objects.filter(pk=as_int(variant_id), document__world=world).first()


def get_tree_node(world: World, node_id) -> TreeNode | None:
    return TreeNode.objects.filter(pk=as_int(node_id), variant__document__world=world).first()


def get_marker(world: World, marker_id) -> MapMarker | None:
    return MapMarker.objects.filter(pk=as_int(marker_id), document__world=world).first()


def tree_state(document: Document) -> dict:
    """一棵关系树的完整状态：变体列表 + 当前变体（含节点/关系）。"""
    variants = list(document.tree_variants.all())
    if not variants:
        variants = [TreeVariant.objects.create(document=document, name="Main", kind="family")]
    active_id = as_int((document.settings or {}).get("active_variant"), 0)
    active = next((variant for variant in variants if variant.id == active_id), variants[0])
    return {
        "document": document.to_payload(),
        "variants": [variant.to_payload() for variant in variants],
        "active": active.to_payload(with_graph=True),
        "kinds": [{"value": value, "label": label} for value, label in TREE_KINDS],
        "edge_kinds": [{"value": value, "label": label} for value, label in TREE_EDGE_KINDS],
    }


@csrf_exempt
@require_safe
def tree_state_view(request, doc_id):
    """关系树的状态（含当前变体的节点与关系）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TREE:
        return error("这个文档不是关系树")
    return json_response(tree_state(document))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def tree_variant_collection(request, doc_id):
    """新建一棵树；``fork_from`` 给出源 variant 时复制它（对齐 New variant (forks the current one)）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        return json_response({"variants": [variant.to_payload() for variant in document.tree_variants.all()]})

    payload = parse_json(request)
    source = get_variant(world, payload.get("fork_from")) if payload.get("fork_from") else None
    kind = as_text(payload.get("kind"), 20) or (source.kind if source else "family")
    variant = TreeVariant.objects.create(
        document=document,
        name=as_text(payload.get("name"), 60) or (f"{source.name} 副本" if source else f"Variant {document.tree_variants.count() + 1}"),
        kind=kind,
        position=document.tree_variants.count(),
    )
    if source is not None:
        # 复制：节点照搬，边要重新映射到新节点的 id 上
        id_map = {}
        for node in source.nodes.all():
            clone = TreeNode.objects.create(
                variant=variant, card=node.card, name=node.name, subtitle=node.subtitle,
                image=node.image, group=node.group, group_color=node.group_color,
                generation=node.generation, position=node.position, x=node.x, y=node.y,
            )
            id_map[node.id] = clone.id
        for edge in source.edges.all():
            if edge.source_id in id_map and edge.target_id in id_map:
                TreeEdge.objects.create(
                    variant=variant, source_id=id_map[edge.source_id], target_id=id_map[edge.target_id],
                    kind=edge.kind, label=edge.label, style=edge.style,
                )
    save_document_settings(document, {"active_variant": variant.id})
    document.save(update_fields=["settings"])
    return json_response(variant.to_payload(with_graph=True))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_variant_detail(request, variant_id):
    """单个变体：读 / 改（改名、模板、关系叫法）/ 删（至少要留一棵）。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    if request.method == "GET":
        return json_response(variant.to_payload(with_graph=True))

    if request.method == "DELETE":
        if variant.document.tree_variants.count() <= 1:
            return error("至少要保留一棵树")
        document = variant.document
        variant.delete()
        remaining = document.tree_variants.order_by("position", "id").first()
        save_document_settings(document, {"active_variant": remaining.id if remaining else 0})
        document.save(update_fields=["settings"])
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        variant.name = as_text(payload.get("name"), 60) or variant.name
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in TREE_KINDS}:
            variant.kind = kind
    if "edge_labels" in payload and isinstance(payload.get("edge_labels"), dict):
        merged = dict(variant.edge_labels or {})
        for key, value in payload["edge_labels"].items():
            merged[as_text(key, 40)] = as_text(value, 40)
        variant.edge_labels = merged
    if "settings" in payload and isinstance(payload.get("settings"), dict):
        merged = dict(variant.settings or {})
        merged.update(payload["settings"])
        variant.settings = merged
    variant.save()
    return json_response(variant.to_payload(with_graph=True))


@csrf_exempt
@require_http_methods(["POST"])
def tree_node_collection(request, variant_id):
    """往树上加一个人（可以顺手吸附一张已有卡片）。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    payload = parse_json(request)
    card = get_document(world, payload.get("card")) if payload.get("card") else None
    node = TreeNode.objects.create(
        variant=variant,
        card=card,
        name=as_text(payload.get("name"), 120) or (card.name if card else "新成员"),
        subtitle=as_text(payload.get("subtitle"), 120),
        image=as_text(payload.get("image"), 4000),
        group=as_text(payload.get("group"), 60),
        group_color=as_text(payload.get("group_color"), 24),
        generation=as_int(payload.get("generation"), 0),
        position=variant.nodes.count(),
        x=float(payload.get("x") or 0.0),
        y=float(payload.get("y") or 0.0),
    )
    return json_response(node.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_node_detail(request, node_id):
    """树上一个人：读 / 改（姓名、头像、分组、位置…）/ 删。"""
    world = current_world()
    node = get_tree_node(world, node_id)
    if node is None:
        return json_response({"error": "未找到这个成员"}, status=404)

    if request.method == "GET":
        return json_response(node.to_payload())

    if request.method == "DELETE":
        node.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "card" in payload:
        node.card = get_document(world, payload.get("card")) if payload.get("card") else None
    for field, limit in (("name", 120), ("subtitle", 120), ("image", 4000), ("group", 60), ("group_color", 24)):
        if field in payload:
            setattr(node, field, as_text(payload.get(field), limit))
    for field in ("generation", "position"):
        if field in payload:
            setattr(node, field, as_int(payload.get(field), getattr(node, field)))
    for field in ("x", "y"):
        if field in payload:
            setattr(node, field, float(payload.get(field) or 0.0))
    for field in ("junction", "deceased"):
        if field in payload:
            setattr(node, field, bool(payload.get(field)))
    if node.card is not None and node.name != node.card.name:
        node.name = node.card.name      # 吸了卡片就以卡片名为准
    node.save()
    return json_response(node.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def tree_node_card(request, node_id):
    """给树上的人**新建一张卡片**并吸附上去（对齐 "any person can get ... a new card"）。"""
    world = current_world()
    node = get_tree_node(world, node_id)
    if node is None:
        return json_response({"error": "未找到这个成员"}, status=404)

    payload = parse_json(request)
    entity_type = get_type(world, payload.get("entity_type"))
    document = Document.objects.create(
        world=world,
        document_type=DOC_CARD,
        name=as_text(payload.get("name"), 200) or node.name,
        entity_type=entity_type,
    )
    Card.objects.create(
        document=document,
        entity_type=entity_type,
        values=default_values_for(entity_type) if entity_type is not None else {},
        blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": ""}]),
    )
    node.card = document
    node.name = document.name
    node.save(update_fields=["card", "name"])
    touch_document(document, label="从关系树新建卡片", author=request.user)
    return json_response({"node": node.to_payload(), "document": document.to_payload(with_card=True)})


@csrf_exempt
@require_http_methods(["POST"])
def tree_edge_collection(request, variant_id):
    """连一条关系（两端必须都是这棵树上的人）。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    payload = parse_json(request)
    source = get_tree_node(world, payload.get("source"))
    target = get_tree_node(world, payload.get("target"))
    if source is None or target is None:
        return error("关系的两端必须是树上的两个人")
    if source.id == target.id:
        return error("不能把一个人连到他自己")
    if source.variant_id != variant.id or target.variant_id != variant.id:
        return error("两个人不在同一棵树上")

    kind = as_text(payload.get("kind"), 20) or "parent"
    label = as_text(payload.get("label"), 40) or dict(TREE_EDGE_LABELS).get(kind, "")
    edge, created = TreeEdge.objects.get_or_create(
        variant=variant, source=source, target=target, kind=kind,
        defaults={"label": label, "style": as_text(payload.get("style"), 20)},
    )
    return json_response(edge.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_edge_detail(request, edge_id):
    """一条关系：读 / 改（种类、叫法、样式）/ 删。"""
    world = current_world()
    edge = TreeEdge.objects.filter(pk=as_int(edge_id), variant__document__world=world).first()
    if edge is None:
        return json_response({"error": "未找到这条关系"}, status=404)

    if request.method == "GET":
        return json_response(edge.to_payload())

    if request.method == "DELETE":
        edge.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in TREE_EDGE_KINDS}:
            edge.kind = kind
    if "label" in payload:
        edge.label = as_text(payload.get("label"), 40)
    if "style" in payload:
        edge.style = as_text(payload.get("style"), 20)
    edge.save()
    return json_response(edge.to_payload())


def map_state(document: Document) -> dict:
    """一张地图的完整状态：图层 + 标注 + 背景与视野。"""
    layers = list(document.map_layers.all())
    if not layers:
        layers = [MapLayer.objects.create(document=document, name="默认", position=0)]
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    return {
        "document": document.to_payload(),
        "layers": [layer.to_payload() for layer in layers],
        "markers": [marker.to_payload() for marker in document.map_markers.all()],
        "background": {
            "url": as_text(settings_.get("background"), 4000),
            "zoom": float(settings_.get("zoom") or settings_.get("bg_zoom") or 1.0),
            "offset_x": float(settings_.get("offset_x") or settings_.get("bg_offset_x") or 0.0),
            "offset_y": float(settings_.get("offset_y") or settings_.get("bg_offset_y") or 0.0),
        },
        "kinds": [{"value": value, "label": label} for value, label in MARKER_KINDS],
        "colors": MARKER_COLORS,
    }


@csrf_exempt
@require_safe
def map_state_view(request, doc_id):
    """地图状态（图层、标注、背景与视野）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_MAP:
        return error("这个文档不是地图")
    return json_response(map_state(document))


@csrf_exempt
@require_http_methods(["POST"])
def map_layer_collection(request, doc_id):
    """加一个图层。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    layer = MapLayer.objects.create(
        document=document,
        name=as_text(payload.get("name"), 60) or f"图层 {document.map_layers.count() + 1}",
        position=document.map_layers.count(),
    )
    return json_response(layer.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def map_layer_detail(request, layer_id):
    """单个图层：读 / 改（名字、显隐、不透明度）/ 删（至少要留一个）。"""
    world = current_world()
    layer = MapLayer.objects.filter(pk=as_int(layer_id), document__world=world).first()
    if layer is None:
        return json_response({"error": "未找到这个图层"}, status=404)

    if request.method == "GET":
        return json_response(layer.to_payload())

    if request.method == "DELETE":
        if layer.document.map_layers.count() <= 1:
            return error("至少要保留一个图层")
        layer.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        layer.name = as_text(payload.get("name"), 60) or layer.name
    if "visible" in payload:
        layer.visible = bool(payload.get("visible"))
    if "opacity" in payload:
        layer.opacity = max(0.0, min(1.0, float(payload.get("opacity") or 0.0)))
    layer.save()
    return json_response(layer.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def map_marker_collection(request, doc_id):
    """加一个标注（点 / 区域 / 路线，可以吸附一张卡片）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    kind = as_text(payload.get("kind"), 20) or MARKER_PIN
    layer_id = as_int(payload.get("layer"), 0)
    layer = document.map_layers.filter(pk=layer_id).first() or document.map_layers.order_by("position", "id").first()
    card = get_document(world, payload.get("card")) if payload.get("card") else None
    color = as_text(payload.get("color"), 24)
    if color not in MARKER_COLORS:
        color = MARKER_COLORS[0]        # 认不出的颜色一律回落到默认色
    points = payload.get("points") if isinstance(payload.get("points"), list) else []
    marker = MapMarker.objects.create(
        document=document,
        layer=layer,
        kind=kind if kind in {value for value, _label in MARKER_KINDS} else MARKER_PIN,
        card=card,
        color=color,
        name=as_text(payload.get("name"), 120) or (card.name if card else ""),
        description=as_text(payload.get("description"), 4000),
        x=float(payload.get("x") or 0.0),
        y=float(payload.get("y") or 0.0),
        points=points,
    )
    return json_response(marker.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def map_marker_detail(request, marker_id):
    """单个标注：读 / 改（位置、形状、颜色、吸附的卡）/ 删。"""
    world = current_world()
    marker = get_marker(world, marker_id)
    if marker is None:
        return json_response({"error": "未找到这个标注"}, status=404)

    if request.method == "GET":
        return json_response(marker.to_payload())

    if request.method == "DELETE":
        marker.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    document = marker.document
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in MARKER_KINDS}:
            marker.kind = kind
    if "name" in payload:
        marker.name = as_text(payload.get("name"), 120)
    if "description" in payload:
        marker.description = as_text(payload.get("description"), 4000)
    if "card" in payload:
        marker.card = get_document(world, payload.get("card")) if payload.get("card") else None
    if "layer" in payload:
        marker.layer = document.map_layers.filter(pk=as_int(payload.get("layer"))).first() or marker.layer
    if "color" in payload:
        color = as_text(payload.get("color"), 24)
        marker.color = color if color in MARKER_COLORS else MARKER_COLORS[0]
    for field in ("x", "y"):
        if field in payload:
            setattr(marker, field, float(payload.get(field) or 0.0))
    if "points" in payload and isinstance(payload.get("points"), list):
        marker.points = payload["points"]
    marker.save()
    return json_response(marker.to_payload())


@csrf_exempt
@require_safe
def graph_view(request):
    """世界图谱：节点 + 连线（引用 / 事件关联 / 正文提及）。

    查询参数：``q`` 关键词、``hide_isolated=1`` 隐藏孤立节点、``center=<doc_id>&depth=1``
    只看某张卡的邻域。
    """
    world = current_world()
    payload = graph_service.build_graph(
        world,
        query=(request.GET.get("q") or "").strip(),
        hide_isolated=request.GET.get("hide_isolated") in ("1", "true", "yes"),
        center=as_int(request.GET.get("center"), 0) or None,
        depth=clamp_int(request.GET.get("depth"), 1, 3),
        limit=clamp_int(request.GET.get("limit"), 1, 400),
    )
    center_doc = get_document(world, request.GET.get("center")) if request.GET.get("center") else None
    payload["center_name"] = center_doc.name if center_doc is not None else ""
    payload["isolated_suggestions"] = graph_service.suggestions(world)
    return json_response(payload)


# --------------------------------------------------------------------------- #
# 账号 / 成员 / 在线 / 版本历史
# --------------------------------------------------------------------------- #
def _user_payload(user) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "handle": user.username,
        "initial": (user.get_full_name() or user.username or "?")[:1].upper(),
        "email": user.email,
    }


def _register_user(payload: dict, request=None):
    """注册的公共逻辑：返回 ``(user, error_message)``。

    第一个账号直接成为所有者；之后的账号必须带一个还能用的邀请码。
    """
    from django.contrib.auth import get_user_model, login
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    User = get_user_model()
    username = as_text(payload.get("username"), 150).strip()
    password = payload.get("password") or ""
    invite_code = as_text(payload.get("invite"), 64).strip()
    display = as_text(payload.get("display_name"), 150).strip()

    if len(username) < 3:
        return None, "用户名至少 3 个字符"
    if User.objects.filter(username__iexact=username).exists():
        return None, "这个用户名已经被用了"
    try:
        validate_password(password)
    except ValidationError as exc:
        return None, "；".join(exc.messages)

    first_user = not User.objects.exists()
    invite = None
    if not first_user:
        invite = InviteCode.objects.filter(code__iexact=invite_code).first()
        if invite is None or not invite.is_valid():
            return None, "邀请码不对或者已经用完了"

    user = User.objects.create_user(username=username, password=password)
    if display:
        parts = display.split(" ", 1)
        user.first_name = parts[0][:150]
        user.last_name = (parts[1][:150] if len(parts) > 1 else "")
        user.save(update_fields=["first_name", "last_name"])

    world = current_world()
    role = ROLE_OWNER if first_user else (invite.role if invite else ROLE_VIEWER)
    permissions.ensure_membership(user, world, role)
    if first_user and world.owner_id is None:
        world.owner = user
        world.save(update_fields=["owner"])
    if invite is not None:
        invite.uses += 1
        invite.save(update_fields=["uses"])
    if request is not None:
        login(request, user)
    return user, ""


@csrf_exempt
@require_http_methods(["GET", "POST"])
def auth_me(request):
    """我是谁、能不能编辑、要不要先做初始化。"""
    world = current_world()
    if request.method == "POST":
        payload = parse_json(request)
        user, message = _register_user(payload, request)
        if user is None:
            return error(message)
        return json_response({"viewer": permissions.viewer_payload(request.user, world),
                              "created_owner": not permissions.users_exist()})
    return json_response({
        "viewer": permissions.viewer_payload(request.user, world),
        "needs_setup": not permissions.users_exist(),
    })


@csrf_exempt
@require_http_methods(["POST"])
def auth_register(request):
    """注册（JSON）。第一个账号直接成为所有者；之后必须带有效的邀请码。"""
    world = current_world()
    created_owner = not permissions.users_exist() or world.memberships.count() <= 1
    user, message = _register_user(parse_json(request), request)
    if user is None:
        return error(message)
    return json_response({
        "viewer": permissions.viewer_payload(request.user, world),
        "created_owner": bool(created_owner),
    })


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request):
    """登录（JSON）。"""
    from django.contrib.auth import authenticate, login

    world = current_world()
    payload = parse_json(request)
    username = as_text(payload.get("username"), 150).strip()
    password = payload.get("password") or ""
    user = authenticate(request, username=username, password=password)
    if user is None:
        return json_response({"error": "用户名或密码不对"}, status=400)
    login(request, user)
    permissions.ensure_membership(user, world, ROLE_OWNER if world.owner_id in (None, user.id) else ROLE_VIEWER)
    return json_response({"viewer": permissions.viewer_payload(request.user, world)})


@csrf_exempt
@require_http_methods(["POST"])
def auth_logout(request):
    """退出（JSON）。"""
    from django.contrib.auth import logout

    logout(request)
    return json_response({"ok": True})


def _auth_page(request, mode: str = "login", error: str = "", status: int = 200):
    """登录 / 注册页的公共渲染。"""
    world = current_world_or_none()
    needs_setup = not permissions.users_exist()

    # 邀请链接里带的码：预填 + 先告诉用户它还能不能用（别等提交才说"用完了"）
    invite_hint = ""
    code_from_link = (request.POST.get("invite") or request.GET.get("invite") or "").strip()
    if code_from_link and not needs_setup:
        candidate = InviteCode.objects.filter(code__iexact=code_from_link).first()
        if candidate is None:
            invite_hint = "这个邀请码不存在，检查一下是不是复制少了字符"
        elif not candidate.is_valid():
            invite_hint = "这个邀请码已经用完了，找所有者再要一个"
        else:
            invite_hint = "邀请码有效，填好用户名和密码就能进"

    return render(request, "auth.html", {
        "mode": mode,
        "needs_setup": needs_setup,
        "world": world,
        "page_title": "创建所有者账号" if needs_setup else ("注册" if mode == "register" else "登录"),
        "page_lead": ("第一次使用：这个账号会成为世界的所有者，之后邀请别人来一起写。"
                      if needs_setup else ""),
        "error": error,
        "username": request.POST.get("username", ""),
        "invite": request.POST.get("invite") or request.GET.get("invite", ""),
        "invite_hint": invite_hint,
    }, status=status)


@require_http_methods(["GET", "POST"])
def login_page(request):
    """登录页（表单）。已经是登录状态就直接进工作区。"""
    from django.contrib.auth import authenticate, login

    if request.user.is_authenticated:
        return redirect("/world")
    if request.method != "POST":
        if not permissions.users_exist():
            return redirect("/register")
        return _auth_page(request, "login")

    username = as_text(request.POST.get("username"), 150).strip()
    password = request.POST.get("password") or ""
    user = authenticate(request, username=username, password=password)
    if user is None:
        return _auth_page(request, "login", "用户名或密码不对", status=400)
    login(request, user)
    world = current_world()
    permissions.ensure_membership(user, world, ROLE_OWNER if world.owner_id in (None, user.id) else ROLE_VIEWER)
    return redirect("/world")


@require_http_methods(["GET", "POST"])
def register_page(request):
    """注册页（表单）。第一个账号不需要邀请码。"""
    from django.contrib.auth import login

    if request.user.is_authenticated:
        return redirect("/world")
    if request.method != "POST":
        return _auth_page(request, "register")

    payload = {
        "username": request.POST.get("username"),
        "password": request.POST.get("password"),
        "invite": request.POST.get("invite"),
        "display_name": request.POST.get("display_name"),
    }
    user, message = _register_user(payload, None)
    if user is None:
        return _auth_page(request, "register", message, status=400)
    login(request, user)
    return redirect("/world")


@require_http_methods(["GET", "POST"])
def logout_page(request):
    """退出并回到工作区（未登录也能看）。"""
    from django.contrib.auth import logout

    logout(request)
    return redirect("/world")


@csrf_exempt
@require_safe
def collaborators(request):
    """成员列表 + 邀请码（有权限的人才能看邀请码）。"""
    world = current_world()
    viewer = permissions.viewer_payload(request.user, world)
    members = []
    for membership in world.memberships.select_related("user").order_by("id"):
        members.append({
            **_user_payload(membership.user),          # id 会被下面覆盖成成员 id
            "id": membership.id,
            "user_id": membership.user_id,
            "role": membership.role,
            "joined_at": membership.created_at.isoformat() if membership.created_at else None,
        })
    # 邀请码只给管理员看；没权限的人拿到空列表（而不是没有这个键，前端就不用分支了）
    data = {"members": members, "viewer": viewer, "invites": []}
    if viewer.get("can_admin"):
        data["invites"] = [
            {
                "id": invite.id,
                "code": invite.code,
                "role": invite.role,
                "note": invite.note,
                "uses": invite.uses,
                "max_uses": invite.max_uses,
                "valid": invite.is_valid(),
            }
            for invite in world.invites.all()[:20]
        ]
    return json_response(data)


@csrf_exempt
@require_http_methods(["POST"])
def invite_create(request):
    """发一个邀请码（只有所有者能发）。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能发邀请码"}, status=403)

    payload = parse_json(request)
    role = as_text(payload.get("role"), 20) or ROLE_EDITOR
    if role not in (ROLE_OWNER, ROLE_EDITOR, ROLE_VIEWER):
        role = ROLE_EDITOR
    code = as_text(payload.get("code"), 64).strip().replace("-", "").replace("_", "")
    if not code:
        code = secrets.token_urlsafe(12)[:12]
    if InviteCode.objects.filter(code__iexact=code).exists():
        return error("这个邀请码已经存在")
    invite = InviteCode.objects.create(
        world=world,
        code=code,
        role=role,
        note=as_text(payload.get("note"), 120),
        max_uses=clamp_int(payload.get("max_uses", 1), 1, 100),
        created_by=request.user if request.user.is_authenticated else None,
    )
    return json_response({"id": invite.id, "code": invite.code, "role": invite.role,
                          "url": f"/register?invite={invite.code}"})


@csrf_exempt
@require_http_methods(["DELETE"])
def invite_delete(request, invite_id):
    """作废一个邀请码。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能改邀请码"}, status=403)
    invite = world.invites.filter(pk=as_int(invite_id)).first()
    if invite is None:
        return json_response({"error": "邀请码不存在"}, status=404)
    invite.delete()
    return json_response({"ok": True})


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def member_detail(request, member_id):
    """改成员角色 / 移除成员（只有所有者能动）。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能改成员"}, status=403)

    membership = world.memberships.filter(pk=as_int(member_id)).select_related("user").first()
    if membership is None:
        return json_response({"error": "成员不存在"}, status=404)

    if request.method == "DELETE":
        if membership.role == ROLE_OWNER and world.memberships.filter(role=ROLE_OWNER).count() <= 1:
            return error("至少要留一个所有者")
        membership.delete()
        return json_response({"ok": True})

    payload = parse_json(request)
    role = as_text(payload.get("role"), 20)
    if role in (ROLE_OWNER, ROLE_EDITOR, ROLE_VIEWER):
        if membership.role == ROLE_OWNER and role != ROLE_OWNER \
                and world.memberships.filter(role=ROLE_OWNER).count() <= 1:
            return error("至少要留一个所有者")
        membership.role = role
        membership.save(update_fields=["role"])
    return json_response({"ok": True, "role": membership.role})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def presence(request):
    """在线状态：GET 看谁在，POST 打一次心跳。"""
    world = current_world()
    if request.method == "POST":
        payload = parse_json(request)
        document = get_document(world, payload.get("document")) if payload.get("document") else None
        if request.user.is_authenticated:
            Presence.touch(world, request.user, document)
    online = Presence.online(world)
    return json_response({
        "online": [entry.to_payload() for entry in online],
        "count": len(online),
    })


@csrf_exempt
@require_safe
def document_versions(request, doc_id):
    """一份文档的版本历史（最近的在前面）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    versions = document.versions.order_by("-index")
    return json_response({
        "document": {"id": document.id, "name": document.name},
        "versions": [version.to_payload() for version in versions],
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def document_version_detail(request, doc_id, index):
    """看某一版的内容 / 回滚到那一版（回滚前会自动备份当前状态）。"""
    from . import exchange

    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    version = document.versions.filter(index=as_int(index, 1)).first()
    if version is None:
        return json_response({"error": "没有这一版"}, status=404)

    if request.method == "GET":
        # 顶层就是这一版（含 payload），前端直接预览
        return json_response(version.to_payload(with_body=True))

    # 回滚：先给"现在"留一版，再把快照写回去（名字、设置、卡片正文与属性一起回来）
    snapshot_document(document, label="回滚前的自动备份", author=request.user)
    payload = version.payload if isinstance(version.payload, dict) else {}

    card_payload = payload.get("card")
    if isinstance(card_payload, dict):
        card, _created = Card.objects.get_or_create(
            document=document, defaults={"entity_type": document.entity_type})
        card.aliases = as_alias_list(card_payload.get("aliases"))
        card.blocks = normalize_blocks(card_payload.get("blocks") or [])
        card.body = blocks_to_text(card.blocks)
        card.values = card_payload.get("values") or {}
        card.era_mode = card_payload.get("era_mode") or card.era_mode
        card.era_ids = card_payload.get("era_ids") or card.era_ids
        card.save()

    if payload.get("name"):
        document.name = as_text(payload.get("name"), 200)
    if isinstance(payload.get("settings"), dict):
        document.settings = payload["settings"]
    document.save(update_fields=["name", "settings", "updated_at"])
    touch_document(document, label=f"回滚到 v{version.index}", author=request.user)
    return json_response({
        "ok": True,
        "document": document.to_payload(with_card=True),
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })


# --------------------------------------------------------------------------- #
# 工具数据 / 媒体 / 表格 / 搜索 / 导入导出
# --------------------------------------------------------------------------- #
def _document_or_json_404(doc_id):
    return get_document(current_world(), doc_id)


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def document_data(request, doc_id):
    """文档的"工具数据"：存在 ``settings.data`` 里，各工具自己解释结构。

    统一一个入口的好处：新工具只要定一份前端 spec，后端不用改。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    if request.method == "GET":
        return json_response({
            "document": {"id": document.id, "name": document.name, "type": document.document_type},
            "data": settings_.get("data") or {},
            "media": settings_.get("media") or [],
            "revision": as_int(settings_.get("revision"), 0),
        })

    payload = parse_json(request)
    incoming = payload.get("data")
    if not isinstance(incoming, dict):
        return error("data 必须是对象")
    encoded = json.dumps(incoming, ensure_ascii=False)
    if len(encoded) > 400 * 1024:
        return error("这份数据太大了（上限约 400 KB）")
    merged = dict(settings_)
    merged["data"] = incoming
    document.settings = merged
    document.save(update_fields=["settings", "updated_at"])
    touch_document(document, label="编辑", author=request.user)
    return json_response({
        "document": {"id": document.id, "name": document.name, "type": document.document_type},
        "data": incoming,
        "media": merged.get("media") or [],
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def document_media(request, doc_id):
    """文档里的媒体（语音、图片…）：文件落盘，元数据挂在 ``settings.media``。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    media = list(settings_.get("media") or [])

    if request.method == "DELETE":
        target_id = as_text(request.GET.get("id"), 80) or as_text(parse_json(request).get("id"), 80)
        kept = []
        for item in media:
            if item.get("id") == target_id:
                path = item.get("path") or ""
                if path:
                    try:
                        default_storage.delete(path)
                    except Exception:
                        pass
                continue
            kept.append(item)
        settings_["media"] = kept
        document.settings = settings_
        document.save(update_fields=["settings", "updated_at"])
        return json_response({"ok": True, "media": kept, "entry": None})

    upload = request.FILES.get("file")
    if upload is None:
        return error("没有收到文件")
    if upload.size > MAX_UPLOAD_BYTES:
        return error("文件超过 25 MB")

    name = as_text(upload.name, 200) or "file"
    safe_name = re.sub(r"[\\/:*?\"<>|]+", "-", name.split("/")[-1])
    path = default_storage.save(f"docs/{document.id}/{safe_name}", upload)
    entry = {
        "id": secrets.token_urlsafe(8),
        "name": name,
        "title": as_text(request.POST.get("title"), 200) or name,
        "kind": as_text(request.POST.get("kind"), 20) or "file",
        "path": path,
        "size": upload.size,
        "content_type": getattr(upload, "content_type", "") or "",
        "created_at": timezone.now().isoformat(),
    }
    if request.POST.get("duration"):
        try:
            entry["duration"] = float(request.POST.get("duration"))
        except (TypeError, ValueError):
            entry["duration"] = 0.0
    try:
        entry["url"] = default_storage.url(path)
    except Exception:
        entry["url"] = f"{settings.MEDIA_URL}{path}"
    media.append(entry)
    settings_["media"] = media
    document.settings = settings_
    document.save(update_fields=["settings", "updated_at"])
    return json_response({"ok": True, "media": media, "item": entry, "entry": entry})


def _table_config(world: World, document: Document) -> dict:
    """表格配置；没配过类型就猜一个（第一张卡的类型 / 世界的第一个类型），
    这样新建的表格不会是一张空表。
    """
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    config = settings_.get("table") if isinstance(settings_.get("table"), dict) else {}
    entity_type = get_type(world, config.get("entity_type")) if config.get("entity_type") else None
    if entity_type is None:
        sample = Document.objects.filter(
            world=world, document_type=DOC_CARD, deleted_at__isnull=True,
        ).exclude(entity_type=None).order_by("position", "id").first()
        entity_type = sample.entity_type if sample is not None else world.types.order_by("position", "id").first()
    columns = config.get("columns") if isinstance(config.get("columns"), list) else []
    return {"entity_type": entity_type, "columns": columns}


def table_payload(world: World, document: Document) -> dict:
    """表格内容：列（属性）+ 行（这一类型的卡片）。"""
    config = _table_config(world, document)
    entity_type = config["entity_type"]
    properties = entity_type.all_properties() if entity_type is not None else []
    wanted = [as_int(item) for item in config["columns"] if as_int(item)]
    if wanted:
        by_id = {prop.id: prop for prop in properties}
        properties = [by_id[item] for item in wanted if item in by_id]

    documents = Document.objects.filter(
        world=world, deleted_at__isnull=True, document_type=DOC_CARD,
    )
    if entity_type is not None:
        documents = documents.filter(entity_type=entity_type)

    rows = []
    for doc in documents.order_by("position", "id")[:400]:
        card = getattr(doc, "card", None)
        values = dict(card.values or {}) if card is not None else {}
        rows.append({
            "id": doc.id,
            "name": doc.name,
            "values": {str(prop.id): values.get(str(prop.id)) for prop in properties},
            "cover": doc.cover,
        })
    return {
        "document": {"id": document.id, "name": document.name, "type": document.document_type},
        "entity_type": entity_type.to_payload() if entity_type is not None else None,
        "columns": [
            {"id": prop.id, "name": prop.name, "value_type": prop.value_type,
             "options": prop.options, "required": prop.required}
            for prop in properties
        ],
        "rows": rows,
    }


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def table_detail(request, doc_id):
    """读表格 / 改它的类型与要显示的列。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        return json_response(table_payload(world, document))

    payload = parse_json(request)
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    config = settings_.get("table") if isinstance(settings_.get("table"), dict) else {}
    if "entity_type" in payload:
        entity_type = get_type(world, payload.get("entity_type"))
        config["entity_type"] = entity_type.id if entity_type is not None else None
    if "columns" in payload and isinstance(payload.get("columns"), list):
        config["columns"] = [as_int(item) for item in payload["columns"] if as_int(item)]
    settings_["table"] = config
    document.settings = settings_
    document.save(update_fields=["settings"])
    return json_response(table_payload(world, document))


@csrf_exempt
@require_http_methods(["PUT"])
def table_cell(request, doc_id):
    """改一个单元格 = 改那张卡片的属性值（这就是"双向绑定"）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    row_document = get_document(world, payload.get("row"))
    if row_document is None:
        return json_response({"error": "找不到这一行对应的卡片"}, status=404)

    card, _created = Card.objects.get_or_create(
        document=row_document, defaults={"entity_type": row_document.entity_type})

    if "name" in payload:
        row_document.name = as_text(payload.get("name"), 200) or row_document.name
        row_document.save(update_fields=["name", "updated_at"])
        touch_document(document, label="改表格行名", author=request.user)
        return json_response(table_payload(world, document))

    entity_type = card.effective_type()
    column_id = as_int(payload.get("column") or payload.get("property"), 0)
    prop = None
    if entity_type is not None:
        prop = next((item for item in entity_type.all_properties() if item.id == column_id), None)
    if prop is None:
        return error("找不到这一列（属性）")

    try:
        value = coerce_property_value(prop, payload.get("value"), world)
    except ValueErrorCN as exc:
        return error(str(exc))
    values = dict(card.values or {})
    values[str(prop.id)] = value
    card.values = values
    card.save(update_fields=["values"])
    row_document.save(update_fields=["updated_at"])
    touch_document(document, label="编辑表格单元格", author=request.user)
    return json_response(table_payload(world, document))


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def table_rows(request, doc_id):
    """加一行（= 建一张卡片）或删一行。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    config = _table_config(world, document)
    payload = parse_json(request)

    if request.method == "DELETE":
        row_document = get_document(world, payload.get("row"))
        if row_document is None:
            return json_response({"error": "找不到这一行对应的卡片"}, status=404)
        row_document.deleted_at = timezone.now()      # 软删，回收站里能还原
        row_document.save(update_fields=["deleted_at"])
        touch_document(document, label="删表格行", author=request.user)
        return json_response(table_payload(world, document))

    entity_type = config["entity_type"]
    row_document = Document.objects.create(
        world=world,
        document_type=DOC_CARD,
        name=as_text(payload.get("name"), 200) or "新行",
        parent=document.parent if payload.get("parent") is None else get_document(world, payload.get("parent")),
        entity_type=entity_type,
    )
    Card.objects.create(
        document=row_document,
        entity_type=entity_type,
        values=default_values_for(entity_type) if entity_type is not None else {},
        blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": ""}]),
    )
    touch_document(document, label="加表格行", author=request.user)
    return json_response(table_payload(world, document))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def table_csv(request, doc_id):
    """CSV 进出：导出当前视图；导入按"名称"匹配已有行并更新。"""
    import csv as csv_module
    import io as io_module

    from django.http import HttpResponse

    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        payload_data = table_payload(world, document)
        columns = payload_data["columns"]
        buffer = io_module.StringIO()
        writer = csv_module.writer(buffer)
        writer.writerow(["名称"] + [column["name"] for column in columns])
        for row in payload_data["rows"]:
            writer.writerow([row["name"]] + [
                "" if row["values"].get(str(column["id"])) is None else row["values"][str(column["id"])]
                for column in columns
            ])
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{document.name}.csv"'
        return response

    payload = parse_json(request)
    text = payload.get("csv") or ""
    entity_type = _table_config(world, document)["entity_type"]
    props = entity_type.all_properties() if entity_type is not None else []
    by_name = {prop.name: prop for prop in props}
    reader = csv_module.reader(io_module.StringIO(text))
    header = next(reader, None) or []
    created = updated = 0
    for record in reader:
        if not record:
            continue
        title = (record[0] or "").strip()
        if not title:
            continue
        row_document = Document.objects.filter(
            world=world, deleted_at__isnull=True, document_type=DOC_CARD, name=title,
        ).first()
        card = None
        if row_document is None:
            row_document = Document.objects.create(
                world=world, document_type=DOC_CARD, name=title, parent=document.parent,
                entity_type=entity_type,
            )
            card = Card.objects.create(document=row_document, entity_type=entity_type, values={})
            created += 1
        else:
            card, _ = Card.objects.get_or_create(
                document=row_document, defaults={"entity_type": entity_type})
            updated += 1
        values = dict(card.values or {})
        for index, cell in enumerate(record[1:], start=1):
            if index >= len(header):
                break
            prop = by_name.get((header[index] or "").strip())
            if prop is None:
                continue
            try:
                values[str(prop.id)] = coerce_property_value(prop, cell, world)
            except ValueErrorCN:
                continue
        card.values = values
        card.save(update_fields=["values"])
    touch_document(document, label="导入 CSV", author=request.user)
    return json_response({"created": created, "updated": updated,
                          "table": table_payload(world, document)})


@csrf_exempt
@require_safe
def search(request):
    """全库搜索：标题、别名、正文、属性值都能命中（⌘K 用它）。"""
    world = current_world()
    keyword = (request.GET.get("q") or "").strip()
    limit = clamp_int(request.GET.get("limit", 20), 1, 100)
    if not keyword:
        return json_response({"results": [], "query": ""})

    lowered = keyword.lower()
    results = []
    for document in Document.objects.filter(world=world, deleted_at__isnull=True).select_related("card"):
        haystack_parts = [document.name]
        card = getattr(document, "card", None)
        if card is not None:
            haystack_parts.extend(card.aliases or [])
            haystack_parts.append(card.body or "")
            for value in (card.values or {}).values():
                if isinstance(value, (str, int, float)):
                    haystack_parts.append(str(value))
        haystack = "\n".join(part for part in haystack_parts if part)
        position = haystack.lower().find(lowered)
        if position < 0:
            continue
        snippet = haystack[max(0, position - 30):position + len(keyword) + 40].replace("\n", " ")
        results.append({
            "id": document.id,
            "name": document.name,
            "type": document.document_type,
            "snippet": snippet,
            "position": position,
        })
        if len(results) >= limit:
            break

    if request.GET.get("fuzzy") in ("1", "true", "yes"):
        seen = {item["id"] for item in results}
        for match in autolink.fuzzy_candidates(world, keyword, limit=6):
            if match.get("document_id") in seen:
                continue
            results.append({
                "id": match.get("document_id"),
                "name": match.get("name"),
                "type": match.get("type") or DOC_CARD,
                "snippet": f"≈ 你是不是想找「{match.get('name')}」",
                "fuzzy": True,
            })
    return json_response({"results": results, "query": keyword})


@csrf_exempt
@require_safe
def suggestions(request):
    """「值得添加」：本地规则统计，不调用任何外部模型。

    四类：正文里反复出现但还没有卡片的名字 / 空壳卡片 / 没人引用的文档 /
    还没关联卡片的时间线事件。跟世界设置里的「AI 功能」开关联动——
    关掉就只回空的建议列表（界面上会提示去打开）。
    """
    world = current_world()
    if not world.ai_enabled:
        # 关掉 AI/自动识别：只回空建议，界面上提示去打开（别偷偷还是算一遍）
        return json_response({"enabled": False, "entities": [], "empty_cards": [],
                              "orphans": [], "events": []})

    cards = list(Card.objects.filter(document__world=world).select_related("document"))
    counted: dict[str, int] = {}
    for card in cards:
        body = card.body or blocks_to_text(card.blocks)
        for name in autolink.detect_new_names(world, body, exclude_document_id=card.document_id):
            name = (name or "").strip()
            if len(name) < 2 or name.startswith("的") or name == world.name:
                continue
            counted[name] = counted.get(name, 0) + 1
    entities = [{"name": name, "count": count}
                for name, count in sorted(counted.items(), key=lambda item: (-item[1], item[0]))[:12]]

    empty_cards = [
        {"id": card.document_id, "name": card.document.name}
        for card in cards
        if not (card.body or "").strip() and not [b for b in (card.blocks or []) if isinstance(b, dict) and (b.get("text") or "").strip()]
    ][:12]

    referenced = set()
    for card in cards:
        for value in (card.values or {}).values():
            if isinstance(value, int):
                referenced.add(value)
    orphans = [
        {"id": card.document_id, "name": card.document.name}
        for card in cards
        if card.document_id not in referenced and (card.body or blocks_to_text(card.blocks)).strip()
    ][:12]

    events = [
        {"id": event.id, "title": event.title, "document": event.document_id}
        for event in TimelineEvent.objects.filter(document__world=world, featured_card__isnull=True)[:12]
    ]
    return json_response({"enabled": True, "entities": entities, "empty_cards": empty_cards,
                          "orphans": orphans, "events": events})


@csrf_exempt
@require_http_methods(["POST"])
def autolink_view(request):
    """正文里的名字识别：返回命中的卡片与位置（前端据此渲染链接）。"""
    world = current_world()
    payload = parse_json(request)
    text = as_text(payload.get("text"), 200000)
    exclude = payload.get("exclude")
    return json_response({
        "matches": autolink.find_mentions(world, text, exclude_document_id=as_int(exclude, 0) or None),
    })


@csrf_exempt
@require_safe
def backlinks(request, doc_id):
    """谁提到了这张卡（按名字/别名在正文与标题里出现来算）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    card = getattr(document, "card", None)
    names = [document.name] + list((card.aliases if card is not None else []) or [])
    found = []
    for other in Document.objects.filter(world=world, deleted_at__isnull=True).exclude(pk=document.pk):
        other_card = getattr(other, "card", None)
        body = (other_card.body if other_card is not None else "") or ""
        if other_card is not None and not body.strip():
            body = blocks_to_text(other_card.blocks)
        haystack = f"{other.name}\n{body}"
        matched = next((name for name in names if name and name in haystack), "")
        if not matched:
            continue
        found.append({"id": other.id, "name": other.name,
                      "type": other.document_type, "matched": matched,
                      "snippet": haystack[max(0, haystack.find(matched) - 20):
                                         haystack.find(matched) + len(matched) + 30].replace("\n", " ")})
    return json_response({"mentions": found, "count": len(found)})


def _clock_stamp() -> str:
    return timezone.localtime().strftime("%Y%m%d-%H%M")


@csrf_exempt
@require_safe
def export_world(request):
    """导出整个世界的 zip（Markdown + JSON 备份），或只要 JSON。"""
    from django.http import HttpResponse

    from . import exchange

    world = current_world()
    fmt = request.GET.get("format") or "zip"
    safe_name = re.sub(r'[\\/:*?"<>|]+', "-", world.name or "world")
    stamp = _clock_stamp()

    if fmt == "json":
        body = json.dumps(exchange.world_backup(world), ensure_ascii=False, indent=2)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}-{stamp}.json"'
        return response
    body = exchange.world_zip(world)
    response = HttpResponse(body, content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{safe_name}-{stamp}.zip"'
    return response


@csrf_exempt
@require_safe
def export_document(request, doc_id):
    """单份文档导出：Markdown（默认）或 JSON。"""
    from django.http import HttpResponse

    from . import exchange

    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    safe_name = re.sub(r'[\\/:*?"<>|]+', "-", document.name or "document")
    if (request.GET.get("format") or "markdown") == "json":
        body = json.dumps(exchange.document_payload(document), ensure_ascii=False, indent=2)
        content_type = "application/json; charset=utf-8"
        filename = f"{safe_name}.json"
    else:
        body = exchange.document_markdown(document)
        content_type = "text/markdown; charset=utf-8"
        filename = f"{safe_name}.md"
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def import_files(request):
    """导入 Markdown / zip / world.json。

    两种请求体都收：``multipart/form-data``（上传文件，支持 zip 递归）与 JSON
    （``{files: [{name, content}], mode, parent}``，方便脚本与探针）。
    """
    import io as io_module
    import zipfile

    from . import exchange

    world = current_world()
    is_multipart = bool(request.content_type and request.content_type.startswith("multipart/"))
    body_payload = {} if is_multipart else parse_json(request)   # multipart 读了 body 会炸
    parent = get_document(world, request.POST.get("parent")) if is_multipart and request.POST.get("parent") else None
    as_type = (request.POST.get("as_type") if is_multipart else body_payload.get("as_type")) or None
    files: list[dict] = []

    if is_multipart:
        uploads = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not uploads:
            return error("没有收到文件")
        for upload in uploads:
            raw = upload.read()
            name = upload.name or "file.md"
            if name.lower().endswith(".zip"):
                try:
                    archive = zipfile.ZipFile(io_module.BytesIO(raw))
                except zipfile.BadZipFile:
                    return error(f"{name} 不是有效的 zip")
                for info in archive.infolist():
                    if info.is_dir() or "__MACOSX" in info.filename or "/._" in info.filename:
                        continue
                    inner = archive.read(info)
                    files.append({"name": info.filename,
                                  "content": inner.decode("utf-8", errors="replace")})
            else:
                files.append({"name": name, "content": raw.decode("utf-8", errors="replace")})
    else:
        if body_payload.get("parent"):
            parent = get_document(world, body_payload.get("parent"))
        files = [item for item in (body_payload.get("files") or []) if isinstance(item, dict)]
        if not files and (body_payload.get("markdown") or "").strip():
            # 前端"粘贴 Markdown"走的就是这条路：当成一个虚拟文件
            files = [{"name": "粘贴的文档.md", "content": body_payload["markdown"]}]

    # world.json 形式的备份走另一条路（multipart 上传的 .json，或 JSON 体里的 mode=backup）
    backup_text = ""
    if not files and not is_multipart:
        body_payload = parse_json(request)
    if not is_multipart:
        if body_payload.get("mode") == "backup" or body_payload.get("backup"):
            raw_backup = body_payload.get("content") or body_payload.get("backup")
            backup_text = raw_backup if isinstance(raw_backup, str) else json.dumps(raw_backup or {})
    if not backup_text:
        backup_files = [item for item in files if (item.get("name") or "").lower().endswith(".json")
                        and '"documents"' in (item.get("content") or "")]
        if backup_files:
            backup_text = backup_files[0]["content"]
    if backup_text:
        try:
            payload = json.loads(backup_text)
        except ValueError:
            return error("备份 JSON 解析失败")
        return json_response(exchange.import_backup(world, payload) | {"mode": "backup"})

    md_files = [item for item in files if (item.get("name") or "").lower().endswith((".md", ".markdown", ".txt"))]
    if as_type:
        result = exchange.import_markdown_files(world, md_files, parent=parent, as_type=as_type)
    else:
        result = exchange.import_markdown_files(world, md_files, parent=parent)
    touch_document(_any_document(world), label="导入文件", author=request.user)
    return json_response({"summary": result, "mode": "markdown"})


# --------------------------------------------------------------------------- #
# 地图底图 / 发布 / 兜底
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def map_background(request, doc_id):
    """设置底图：上传文件（multipart）或粘贴 URL；``clear=1`` 清空。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    if (request.method == "DELETE" or request.GET.get("clear") in ("1", "true", "yes")
            or parse_json(request).get("clear") is True):
        settings_.pop("background", None)
        document.settings = settings_
        document.save(update_fields=["settings", "updated_at"])
        return json_response({"ok": True, "background": {"url": "", "zoom": 1.0,
                                                         "offset_x": 0.0, "offset_y": 0.0}})

    if request.content_type and request.content_type.startswith("multipart/"):
        upload = request.FILES.get("file")
        if upload is None:
            return error("没有收到文件")
        if upload.size > MAX_UPLOAD_BYTES:
            return error("图片超过 25 MB，建议先压缩")
        if (getattr(upload, "content_type", "") or "") not in ALLOWED_IMAGE_TYPES:
            return error("只支持 PNG / JPEG / WebP / GIF / AVIF")
        safe_name = re.sub(r"[\\/:*?\"<>|]+", "-", (upload.name or "map.png").split("/")[-1])
        path = default_storage.save(f"maps/{document.id}/{safe_name}", upload)
        try:
            url = default_storage.url(path)
        except Exception:
            url = f"{settings.MEDIA_URL}{path}"
        patch = {"background": url}
    else:
        payload = parse_json(request)
        patch = {}
        if "url" in payload:
            patch["background"] = as_text(payload.get("url"), 4000)
        for key in ("zoom", "bg_zoom", "offset_x", "bg_offset_x", "offset_y", "bg_offset_y"):
            if key in payload:
                patch[key] = payload[key]

    settings_.update(patch)
    document.settings = settings_
    document.save(update_fields=["settings", "updated_at"])
    touch_document(document, label="更换地图底图", author=request.user)
    url = settings_.get("background", "")
    return json_response({
        "ok": True,
        "background": {
            "url": url,
            "zoom": float(settings_.get("zoom") or settings_.get("bg_zoom") or 1.0),
            "offset_x": float(settings_.get("offset_x") or settings_.get("bg_offset_x") or 0.0),
            "offset_y": float(settings_.get("offset_y") or settings_.get("bg_offset_y") or 0.0),
        },
        "settings": patch,
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def publish_view(request):
    """GET 看站点状态；POST 发布 / 重新发布。"""
    world = current_world()
    if request.method == "GET":
        return json_response({
            "publish": world.publish_summary(),
            "audiences": [{"value": value, "label": label} for value, label in AUDIENCES],
        })

    payload = parse_json(request)
    audience = as_text(payload.get("audience"), 20) or None
    password = payload.get("password")
    publish_service.publish(world, audience=audience, password=password)
    return json_response({"publish": world.publish_summary(), "version": world.publish_version})


@csrf_exempt
@require_http_methods(["POST"])
def unpublish_view(request):
    """下线站点：内容保留，站点立刻 404。"""
    world = current_world()
    publish_service.unpublish(world)
    return json_response({"publish": world.publish_summary()})


@csrf_exempt
def api_fallback(request):
    """未知的 /api/world/* 路径：回 JSON 404，别丢一个 HTML 错误页给前端。"""
    return json_response({"error": "接口不存在"}, status=404)
