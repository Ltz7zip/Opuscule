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
        calendar = world.calendars.order_by("position", "id").first()
    if calendar is None:
        calendar = Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)
    events = document.events.all().order_by("year", "month", "day", "hour", "id")
    return {
        "document": document.to_payload(),
        "calendar": calendar.to_payload(),
        "calendars": [item.to_payload() for item in world.calendars.order_by("position", "id")],
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
