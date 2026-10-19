# -*- coding: utf-8 -*-
"""基础与启动：JSON 工具、世界作用域、快照 / 版本等公共函数与常量。

（原 ``world/views.py`` 的「基础与启动」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.db import models
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
import json
import logging
import mimetypes
from urllib.parse import quote

from .. import permissions
from ..classic import axis_origin
from ..models import (
    CAL_EARTH,
    DEFAULT_THEME,
    DOC_FOLDER,
    DOC_TIMELINE,
    DOC_TREE,
    EntityType,
    MAX_VERSIONS,
    MOON_EVERY_NIGHT,
    MOON_FULL,
    MOON_QUARTERS,
    PRECISIONS,
    ROLE_OWNER,
    World,
    make_slug,
)
from ..normalize import as_int
from apps.documents.models import (
    Calendar,
    Document,
    DocumentVersion,
    TimelineEvent,
    WorldTimeline,
)


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"}
# 媒体库（``document_media``）放行的内容类型白名单。刻意**不含** SVG / HTML：
# 上传文件经 ``/media/`` 直链打开时，浏览器是按响应的内容类型渲染的，
# ``image/svg+xml``、``text/html`` 里的脚本会跑在本站源下——等于开了存储型 XSS。
# 只留图片（位图）、音视频与少量纯文本文档。
ALLOWED_MEDIA_TYPES = frozenset({
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
    "image/bmp", "image/tiff",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm",
    "audio/wav", "audio/x-wav", "audio/flac", "audio/x-m4a",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    "application/pdf", "text/plain", "text/markdown", "text/csv",
})
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

logger = logging.getLogger(__name__)


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


def _upload_content_type(upload) -> str:
    """读上传文件的内容类型：先信客户端声明；为空或只是通用 ``application/octet-stream``
    时退回按扩展名猜——有些系统（Windows 尤其）对 ``.md``、``.webm`` 就报这个通用类型。"""
    declared = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if declared and declared != "application/octet-stream":
        return declared
    guessed, _encoding = mimetypes.guess_type(getattr(upload, "name", "") or "")
    return (guessed or declared).lower()


def _upload_problem(upload, allowed_types, label: str = "文件") -> str:
    """上传前的统一体检：先看大小，再看内容类型是否落在白名单里。

    返回拒绝理由（文案直接回给前端），放行则返回空串。集中在这里，是因为
    「按内容类型放行」是本项目上传的唯一安全闸：写错了就等于开了存储型 XSS 的门。
    """
    if upload.size > MAX_UPLOAD_BYTES:
        return f"{label}超过 25 MB，建议先压缩"
    content_type = _upload_content_type(upload)
    if content_type not in allowed_types:
        return f"不支持这种文件类型：{content_type or '未知'}"
    return ""


def current_world_or_none():
    return permissions.current_world_or_none()


def current_world() -> World:
    """取"当前世界"（由 ActiveWorldMiddleware 按请求解析）；一个都没有就建一个。"""
    world = permissions.current_world_or_none()
    if world is None:
        world = create_world(name="新世界")
    return world


def page_embed_document(request, world: World | None):
    """页面里点名的已发布文档（``?embed=`` / ``?doc=``）。

    发布站点把地图 / 关系树 / 时间线嵌进 iframe 时，读者是游客、文档在世界之外；
    这类请求能进页面，靠的就是"这篇文档已公开且属于这个 slug 指的世界"。
    """
    if world is None:
        return None
    for key in ("embed", "doc"):
        doc_id = as_int(request.GET.get(key), 0)
        if not doc_id:
            continue
        document = permissions.published_document(doc_id)
        if document is not None and document.world_id == world.id:
            return document
    return None


def world_page_allowed(request, world: World | None) -> bool:
    """能不能打开某世界的页面（工作区 / 次线）。

    放行三种：首次安装；在这个世界里的人；发布站点的只读嵌入（点名了已发布文档）。
    """
    if world is None:
        return False
    if not permissions.users_exist():
        return True
    if permissions.can_access(request.user, world):
        return True
    return page_embed_document(request, world) is not None


def world_page_denied(request, world: World | None):
    """页面守门失败的响应：游客去登录（带 next 回来），登录了但不是成员给 404。

    不给 403，是因为"这个世界存不存在"本身就不该告诉局外人。
    """
    if world is not None and not (request.user and request.user.is_authenticated):
        return redirect(f"/login?next={quote(request.get_full_path(), safe='')}")
    return render(
        request, "404.html",
        {"request_path": request.path, "site_slug": ""},
        status=404,
    )


# 全新世界自带的三个类型：和"用模板新建"里的角色 / 地点 / 事件一一对应。
# 不带属性定义——属性留给用户在"类型"面板里按自己的世界加。
STARTER_TYPES = (
    ("角色", "user", "gold"),
    ("地点", "pin", "teal"),
    ("事件", "clock", "red"),
)


def bootstrap_types(world: World) -> None:
    """给一个刚建出来的世界铺上最基础的三个类型。

    没有这一步的话，新用户看到空状态写着"先落下第一块：一个角色、一个地点"，
    点开却一个类型都没有：卡片建出来没有类型、模板建的"角色"也不是角色。
    """
    if world.types.exists():
        return
    for position, (name, icon, color) in enumerate(STARTER_TYPES, start=1):
        EntityType.objects.create(world=world, name=name, icon=icon, color=color, position=position)


def create_world(*, name: str = "新世界", owner=None, theme_config=None, genres=None) -> World:
    """建一个空世界：默认日历 + 三个起步类型；给了 owner 就把他设成所有者。

    新世界的名字留白（"新世界"），由引导第 1 步或设置面板来起——省得替用户想名字。
    """
    world = World.objects.create(
        name=name or "新世界",
        slug=make_slug("world", name or "新世界", timezone.now().isoformat()),
        theme_config=dict(theme_config or DEFAULT_THEME),
        genres=list(genres) if genres else ["dark-fantasy"],
        owner=owner,
    )
    Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)
    bootstrap_types(world)
    if owner is not None:
        permissions.ensure_membership(owner, world, ROLE_OWNER)
    return world


def get_document(world: World, doc_id) -> Document | None:
    return world.documents.filter(pk=as_int(doc_id), deleted_at__isnull=True).first()


def get_type(world: World, type_id) -> EntityType | None:
    return world.types.filter(pk=as_int(type_id)).first()


def get_event(world: World, event_id) -> TimelineEvent | None:
    """事件可能挂在文档上，也可能直接挂在世界总时间线上（0.7.0 起）。"""
    return (
        TimelineEvent.objects.filter(
            models.Q(document__world=world) | models.Q(timeline__world=world),
            pk=as_int(event_id),
        )
        .select_related("timeline__calendar", "document")
        .prefetch_related("linked_cards")
        .first()
    )


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


def timeline_state(document) -> dict:
    """时间线的完整状态：日历 + 时代 + 事件 + 视野。

    ``document`` 可以是旧的时间线文档，也可以是世界总时间线（``WorldTimeline``）；
    两者暴露同样的 ``world / settings / events``，前端拿到的结构保持一致。

    年份按**显示坐标**下发：显示年 = 存储年 − ``origin_year``。存储层（模型序列化、
    备份 / 导出）始终是世界坐标，只有 UI 接口做这层换算。
    """
    world = document.world
    origin = axis_origin(document)
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    preferred = (document.calendar_id if isinstance(document, WorldTimeline)
                 else as_int(settings_.get("calendar")))
    calendars = list(world.calendars.order_by("id"))
    calendar = next((item for item in calendars if item.pk == preferred), None) if preferred else None
    if calendar is None and calendars:
        calendar = calendars[0]
    if calendar is None:
        calendar = Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)
        calendars = [calendar]
    events = (
        document.events.all()
        .select_related("timeline__calendar", "document")
        .prefetch_related("linked_cards")
        .order_by("year", "month", "day", "hour", "id")
    )
    view = settings_.get("view")
    if not isinstance(view, dict):
        view = {
            "start": float(settings_.get("view_start", -100.0) or -100.0),
            "end": float(settings_.get("view_end", 900.0) or 900.0),
        }
    view = {key: round(float(value) - origin, 4) for key, value in view.items()}
    return {
        "document": document.to_payload(),
        "origin_year": origin,
        "calendar": calendar.to_payload(),
        "calendars": [item.to_payload() for item in calendars],
        "eras": [era.to_payload(origin) for era in world.eras.order_by("position", "id")],
        "events": [event.to_payload(origin) for event in events],
        "view": view,
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
    from ..services import exchange

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
