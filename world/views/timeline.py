# -*- coding: utf-8 -*-
"""时间线：事件、历法（含预设）、纪元、日历月视图。

（原 ``world/views.py`` 的「时间线」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from ..models import (
    CAL_CUSTOM,
    CAL_EARTH,
    DOC_TIMELINE,
    ERA_THEMES,
    World,
)
from ..normalize import as_int, as_text
from documents.models import Calendar, Document, Era, TimelineEvent

from .common import (
    DOC_NOT_FOUND,
    ITEM_NOT_FOUND,
    VALID_MOON_SHOWN,
    VALID_PRECISIONS,
    current_world,
    error,
    get_document,
    get_event,
    json_response,
    parse_json,
    save_document_settings,
    timeline_state,
    touch_document,
)


def _timeline_document(request, doc_id) -> Document | None:
    """取一条时间线文档（不是时间线就返回 None，调用方各自给错）。"""
    document = get_document(current_world(), doc_id)
    if document is None or document.document_type != DOC_TIMELINE:
        return None
    return document


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
    """把当前历法存成预设（预设可应用到本世界的任意时间线）。"""
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


@require_safe
def calendar_month(request, calendar_id):
    """某个历法某个月份的网格（含每天月相与落在当天的事件）——日历视图直接渲染它。"""
    from .. import calendarview

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
