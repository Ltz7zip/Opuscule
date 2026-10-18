# -*- coding: utf-8 -*-
"""时间线：事件、历法（含预设）、纪元、日历月视图。

（原 ``world/views.py`` 的「时间线」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

import math

from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from ..models import (
    CAL_CUSTOM,
    CAL_EARTH,
    CONFIDENCES,
    DOC_TIMELINE,
    ERA_THEMES,
    World,
)
from ..classic import axis_origin
from ..normalize import as_int, as_text
from apps.documents.models import Calendar, Document, Era, TimelineEvent, WorldTimeline

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


def _event_owner(event: TimelineEvent):
    """事件属于谁：文档（旧）或世界总时间线（0.7.0 起）。"""
    return event.document or event.timeline


@require_safe
def timeline_state_view(request, doc_id):
    """一条时间线的完整状态：日历 + 时代 + 事件 + 视野。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TIMELINE:
        return error("这个文档不是时间线")
    return json_response(timeline_state(document))


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def world_timeline_state(request):
    """世界总时间线：读完整状态；改默认历法 / 坐标原点 / 视野。

    GET 与旧时间线文档同构（见 ``timeline_state``）；PUT 只接收
    ``calendar / origin_year / view``（也接受扁平的 ``view_start / view_end``）。
    """
    world = current_world()
    timeline = WorldTimeline.for_world(world)
    if request.method == "GET":
        return json_response(timeline_state(timeline))

    payload = parse_json(request)
    settings_ = dict(timeline.settings) if isinstance(timeline.settings, dict) else {}
    update_fields = []

    if "calendar" in payload:
        calendar = world.calendars.filter(pk=as_int(payload.get("calendar"))).first()
        if calendar is None:
            return json_response({"error": "未找到该历法"}, status=404)
        timeline.calendar = calendar
        update_fields.append("calendar")

    if "origin_year" in payload:
        try:
            timeline.origin_year = round(float(payload.get("origin_year") or 0.0), 4)
        except (TypeError, ValueError):
            return error("坐标原点得是数字")
        update_fields.append("origin_year")

    origin = float(timeline.origin_year or 0.0)
    current_view = settings_.get("view")
    if not isinstance(current_view, dict):
        current_view = {
            "start": float(settings_.get("view_start", -100.0) or -100.0),
            "end": float(settings_.get("view_end", 900.0) or 900.0),
        }
    incoming = payload.get("view") if isinstance(payload.get("view"), dict) else {}
    if incoming or "view_start" in payload or "view_end" in payload:
        for key, flat in (("start", "view_start"), ("end", "view_end")):
            if key in incoming:
                value = incoming.get(key)
            elif flat in payload:
                value = payload.get(flat)
            else:
                continue
            try:
                # 前端发来的是显示坐标，落库前加回原点
                current_view[key] = round(float(value) + origin, 4)
            except (TypeError, ValueError):
                return error("视野边界得是数字")
        settings_["view"] = current_view
        update_fields.append("settings")

    if update_fields:
        timeline.settings = settings_
        timeline.save(update_fields=list(dict.fromkeys(update_fields)) + ["updated_at"])
    return json_response(timeline_state(timeline))


def _clean_event_payload(world: World, payload: dict, owner, event: TimelineEvent | None) -> TimelineEvent:
    """把请求体写进事件对象（精度决定哪些字段有意义）。"""
    if event is None:
        event = (TimelineEvent(timeline=owner) if isinstance(owner, WorldTimeline)
                 else TimelineEvent(document=owner))
    if "title" in payload:
        event.title = as_text(payload.get("title"), 200) or "未命名事件"
    precision = as_text(payload.get("precision"), 20)
    if precision in VALID_PRECISIONS:
        event.precision = precision
    # 精度之外的字段一律清零：一个"年"精度的事件不该残留月份
    if "year" in payload:
        # 前端发来的是显示年，落库前加回坐标原点
        try:
            event.year = int(round(float(payload.get("year") or 0) + axis_origin(owner)))
        except (TypeError, ValueError):
            event.year = 0
    for field in ("month", "day", "hour"):
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
    confidence = as_text(payload.get("confidence"), 8)
    if confidence in dict(CONFIDENCES):
        event.confidence = confidence
    if "range_years" in payload:
        try:
            event.range_years = max(0.0, float(payload.get("range_years") or 0.0))
        except (TypeError, ValueError):
            event.range_years = 0.0
    return event


def _event_collection(request, owner):
    """一条时间线下的事件：列表 / 新建（文档与世界总时间线共用）。"""
    world = current_world()
    origin = axis_origin(owner)
    if request.method == "GET":
        return json_response({"events": [event.to_payload(origin) for event in owner.events.all()]})

    event = _clean_event_payload(world, parse_json(request), owner, None)
    event.save()
    touch_document(owner, label="新建事件", author=request.user)
    return json_response(event.to_payload(origin))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def event_collection(request, doc_id):
    """一条时间线文档下的事件：列表 / 新建。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TIMELINE:
        return error("这个文档不是时间线")
    return _event_collection(request, document)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def world_event_collection(request):
    """世界总时间线下的事件：列表 / 新建。"""
    return _event_collection(request, WorldTimeline.for_world(current_world()))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def event_detail(request, event_id):
    """单个事件：读 / 改 / 删。"""
    world = current_world()
    event = get_event(world, event_id)
    if event is None:
        return json_response(ITEM_NOT_FOUND, status=404)

    owner = _event_owner(event)
    origin = axis_origin(owner)
    if request.method == "GET":
        return json_response(event.to_payload(origin))

    if request.method == "DELETE":
        event.delete()
        touch_document(owner, label="删除事件", author=request.user)
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    _clean_event_payload(world, payload, owner, event).save()
    touch_document(owner, label="编辑时间线", author=request.user)
    return json_response(event.to_payload(origin))


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

    origin = axis_origin(_event_owner(event))
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
        touch_document(_event_owner(event), label="编辑时间线", author=request.user)
        return json_response({"success": True, "event": event.to_payload(origin)})

    event.linked_cards.add(document)
    if payload.get("featured"):
        event.featured_card = document
        event.save(update_fields=["featured_card"])
    touch_document(_event_owner(event), label="编辑时间线", author=request.user)
    return json_response({"success": True, "event": event.to_payload(origin)})


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
    touch_document(_event_owner(event), label="编辑时间线", author=request.user)
    return json_response(event.to_payload(axis_origin(_event_owner(event))))


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
    # 生效区间：切换点落在历法自己身上（空 = 不设限）
    for field in ("start_year", "end_year"):
        if field in payload:
            setattr(calendar, field, _optional_year(payload.get(field)))
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
        for timeline in WorldTimeline.objects.filter(world=world, calendar=calendar):
            timeline.calendar = fallback
            timeline.save(update_fields=["calendar", "updated_at"])
        calendar.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    _clean_calendar_payload(payload, calendar)
    calendar.save()
    if "months" in payload or "hours_per_day" in payload:
        # 月份结构 / 一天小时数变了：把越界的事件钳回合法范围，别留下 3 月 40 日这种日期
        months = calendar.months or [{"name": "一月", "days": 30}]
        for event in TimelineEvent.objects.filter(
                Q(document__world=world) | Q(timeline__world=world)):
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
    """把某个预设应用到一条时间线文档。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    return _apply_preset(document, parse_json(request), request)


@csrf_exempt
@require_http_methods(["POST"])
def world_calendar_apply_preset(request):
    """把某个预设应用到世界总时间线。"""
    return _apply_preset(WorldTimeline.for_world(current_world()), parse_json(request), request)


def _apply_preset(owner, payload: dict, request):
    world = owner.world
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
    if isinstance(owner, WorldTimeline):
        owner.calendar = calendar
        owner.save(update_fields=["calendar", "updated_at"])
    else:
        save_document_settings(owner, {"calendar": calendar.id})
        owner.save(update_fields=["settings"])
    touch_document(owner, label="应用历法预设", author=request.user)
    return json_response(timeline_state(owner))


def _optional_year(value):
    """可空年份：空串 / None / 非法值一律当「还没摆放」。"""
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def _world_axis_origin(world) -> float:
    """世界总时间线的展示原点；没有总时间线时按 0（旧文档口径）。"""
    timeline = WorldTimeline.objects.filter(world=world).first()
    return float(timeline.origin_year or 0.0) if timeline is not None else 0.0


def _to_storage_year(value, origin: float):
    """显示年 → 存储年；``None``（没摆放）保持 ``None``。"""
    return None if value is None else round(float(value) + origin, 4)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def era_collection(request):
    """时代列表 / 新建时代（总时间线上的一段命名区间）。"""
    world = current_world()
    origin = _world_axis_origin(world)
    if request.method == "GET":
        return json_response({"eras": [era.to_payload(origin) for era in world.eras.all()]})

    payload = parse_json(request)
    theme = as_text(payload.get("theme"), 20)
    era = Era.objects.create(
        world=world,
        name=as_text(payload.get("name"), 120) or "新纪元",
        position=as_int(payload.get("position"), world.eras.count()),
        start_year=_to_storage_year(_optional_year(payload.get("start_year")), origin),
        end_year=_to_storage_year(_optional_year(payload.get("end_year")), origin),
        start_precision=as_text(payload.get("start_precision"), 8) or "year",
        end_precision=as_text(payload.get("end_precision"), 8) or "year",
        length_years=float(payload.get("length_years") or 0.0),
        theme=theme if theme in ERA_THEMES else "blue",
        icon=as_text(payload.get("icon"), 40),
        description=as_text(payload.get("description"), 4000),
        cover=as_text(payload.get("cover"), 500),
    )
    return json_response(era.to_payload(origin))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def era_detail(request, era_id):
    """单个纪元：读 / 改 / 删。"""
    world = current_world()
    origin = _world_axis_origin(world)
    era = world.eras.filter(pk=as_int(era_id)).first()
    if era is None:
        return json_response({"error": "未找到该纪元"}, status=404)

    if request.method == "GET":
        return json_response(era.to_payload(origin))

    if request.method == "DELETE":
        era.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        era.name = as_text(payload.get("name"), 120) or era.name
    if "start_year" in payload:
        era.start_year = _to_storage_year(_optional_year(payload.get("start_year")), origin)
    if "end_year" in payload:
        era.end_year = _to_storage_year(_optional_year(payload.get("end_year")), origin)
    if "length_years" in payload:
        era.length_years = float(payload.get("length_years") or 0)
    for field in ("start_precision", "end_precision"):
        if field in payload:
            value = as_text(payload.get(field), 8)
            if value in VALID_PRECISIONS:
                setattr(era, field, value)
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
    return json_response(era.to_payload(origin))


@require_safe
def calendar_month(request, calendar_id):
    """某个历法某个月份的网格（含每天月相与落在当天的事件）——日历视图直接渲染它。"""
    from .. import calendarview

    world = current_world()
    calendar = world.calendars.filter(pk=as_int(calendar_id)).first()
    if calendar is None:
        return json_response({"error": "未找到该历法"}, status=404)

    # 前端按显示年请求；网格与事件比较都用存储年，回显时再换回显示年
    try:
        display_year = float(request.GET.get("year"))
    except (TypeError, ValueError):
        display_year = 1.0
    if not math.isfinite(display_year):
        display_year = 1.0
    month = as_int(request.GET.get("month"), 1)
    grid = calendarview.month_grid(calendar, int(round(display_year + _world_axis_origin(world))), month)

    document_id = as_int(request.GET.get("document"), 0)
    if document_id:
        document = get_document(world, document_id)
        events = list(document.events.all()) if document is not None else []
    else:
        events = list(TimelineEvent.objects.filter(
            Q(document__world=world) | Q(timeline__world=world)))
    calendarview.place_events(grid, events)      # 就地塞进对应格子
    grid["year"] = int(display_year) if display_year.is_integer() else round(display_year, 4)
    return json_response(grid)
