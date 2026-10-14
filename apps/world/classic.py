# -*- coding: utf-8 -*-
"""经典时间线编辑器 ⇄ world 时间线文档 的适配层。

工作区里打开一条时间线时，直接把**已有的经典编辑器**整个嵌进来复用——它的拖拽、缩放、
分屏等交互比工作区自带的简版时间线完整得多。做法是：

1. 页面走 ``/w/timeline/<doc_id>``，模板在 ``script.js`` 之前注入一个 fetch 适配层，
   把编辑器写死的 ``/api/timeline``、``/api/items*``、``/api/view`` 指向下面这几个函数；
2. 本模块负责两种数据形态的互转：

   ==========================  ==========================================
   经典编辑器（TimelineItem）   world 时间线文档
   ==========================  ==========================================
   ``kind="event"`` + 浮点年   ``TimelineEvent``（年/月/日/时四级精度）
   ``kind="era"`` + 起止年      ``Era`` + 文档 settings 里的 ``era_spans``
   ``cards: [{title,url,…}]``  事件的 ``linked_cards``（按名字对应卡片）
   ``view: {start,end}``       文档 settings 的 ``view_start`` / ``view_end``
   ==========================  ==========================================

时间在两边都用「浮点年」做桥梁：``start = 年 + (月-1)/12 + (日-1)/360 + 时/8640``，
写回时再按事件自己的精度拆回年/月/日/时——所以拖到哪一年，库里就存哪一年。
"""

from __future__ import annotations

from .models import PRECISION_ORDER, World
from .normalize import as_alias_list, as_int, as_text, blocks_to_text
from apps.documents.models import Document, Era, TimelineEvent

ERA_ID_BASE = 1_000_000          # 纪元的 id 偏移，避免和事件 id 撞车
MONTHS_PER_YEAR = 12
DAYS_PER_MONTH = 30
HOURS_PER_DAY = 24


# --------------------------------------------------------------------------- #
# 时间换算
# --------------------------------------------------------------------------- #
def event_to_float(event: TimelineEvent) -> float:
    """事件 -> 浮点年（精度不到的位不参与）。"""
    value = float(event.year or 0)
    if event.precision in ("month", "day", "time"):
        value += (max(1, event.month or 1) - 1) / MONTHS_PER_YEAR
    if event.precision in ("day", "time"):
        value += (max(1, event.day or 1) - 1) / (MONTHS_PER_YEAR * DAYS_PER_MONTH)
    if event.precision == "time":
        value += (event.hour or 0) / (MONTHS_PER_YEAR * DAYS_PER_MONTH * HOURS_PER_DAY)
    return round(value, 6)


def float_to_parts(value: float, precision: str) -> dict:
    """浮点年 -> 年/月/日/时（按精度决定拆到哪一位）。

    末尾的 epsilon 是为了让「正好落在边界」的值（比如 4/360 这种）稳定地进到下一格，
    否则浮点误差会让第 5 天变成第 4 天。
    """
    year = int(value // 1)
    fraction = value - year + 1e-9
    parts = {"year": year, "month": 1, "day": 1, "hour": 0}
    if precision in ("month", "day", "time"):
        month = int(fraction * MONTHS_PER_YEAR) + 1
        parts["month"] = max(1, min(MONTHS_PER_YEAR, month))
        fraction = fraction * MONTHS_PER_YEAR - (parts["month"] - 1)
    if precision in ("day", "time"):
        day = int(fraction * DAYS_PER_MONTH) + 1
        parts["day"] = max(1, min(DAYS_PER_MONTH, day))
        fraction = fraction * DAYS_PER_MONTH - (parts["day"] - 1)
    if precision == "time":
        parts["hour"] = max(0, min(HOURS_PER_DAY - 1, int(fraction * HOURS_PER_DAY)))
    return parts


# --------------------------------------------------------------------------- #
# 读：world -> 经典编辑器
# --------------------------------------------------------------------------- #

def spans_for(world: World, document: Document) -> dict[int, tuple[float, float]]:
    """纪元在轴上的位置：优先用文档里存过的，其次按长度依次铺开。"""
    saved = {}
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    raw = settings_.get("era_spans")
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, (list, tuple)) and len(value) == 2:
                try:
                    saved[int(key)] = (float(value[0]), float(value[1]))
                except (TypeError, ValueError):
                    continue

    spans: dict[int, tuple[float, float]] = {}
    cursor = 0.0
    for index, era in enumerate(world.eras.all()):
        if era.id in saved:
            spans[era.id] = saved[era.id]
            cursor = max(cursor, saved[era.id][1])
            continue
        length = float(era.length_years or 0) or 50.0
        spans[era.id] = (cursor, cursor + length)
        cursor += length
    return spans


def cards_payload(event: TimelineEvent) -> list[dict]:
    """事件的关联卡片 -> 经典编辑器的 cards 结构（它只做透传，不渲染）。"""
    return [
        {
            "title": document.name,
            "url": f"/w#doc={document.id}",
            "cover": document.cover or "",
        }
        for document in event.linked_cards.all()
    ]


def event_item(event: TimelineEvent) -> dict:
    """事件 -> 经典编辑器的 item 形状（写接口的返回值也必须是这个形状，
    否则编辑器把新建的记录 adopt 进来时会缺 kind/start，界面上会当成另一种记录）。"""
    value = event_to_float(event)
    settings = event.settings if isinstance(event.settings, dict) else {}
    return {
        "id": event.id,
        "kind": "event",
        "flagged": bool(settings.get("flagged")),
        "title": event.title,
        "start": value,
        "end": value,
        "desc": event.description or "",
        "row": event.row or 0,
        "theme": "",
        "cover": event.cover or "",
        "cards": cards_payload(event),
    }


def era_item(era: Era, span: tuple[float, float]) -> dict:
    """纪元 -> 经典编辑器的 item 形状（id 用偏移量，避免和事件 id 撞车）。"""
    start, end = span
    return {
        "id": ERA_ID_BASE + era.id,
        "kind": "era",
        "title": era.name,
        "start": start,
        "end": end,
        "desc": era.description or "",
        "row": era.position - 1 if era.position else 0,
        "theme": era.theme,
        "cover": era.cover or "",
        "cards": [],
    }


def classic_payload(document: Document) -> dict:
    """整条时间线 -> ``{view, items}``（与 /api/timeline 的返回结构一致）。"""
    world = document.world
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    items: list[dict] = []

    spans = spans_for(world, document)
    for era in world.eras.all():
        items.append(era_item(era, spans.get(era.id, (0.0, 50.0))))

    for event in document.events.select_related("era").prefetch_related("linked_cards"):
        items.append(event_item(event))

    view = {
        "start": float(settings_.get("view_start", 1500.0) or 1500.0),
        "end": float(settings_.get("view_end", 1900.0) or 1900.0),
    }
    if view["end"] <= view["start"]:
        view = {"start": 1500.0, "end": 1900.0}
    return {"view": view, "items": items}


# --------------------------------------------------------------------------- #
# 写：经典编辑器 -> world
# --------------------------------------------------------------------------- #
def link_cards(event: TimelineEvent, world: World, cards) -> None:
    """cards[].title 按名字对应世界里的卡片；对不上的忽略（不偷偷建卡）。"""
    if not isinstance(cards, list):
        return
    titles = [as_text(card.get("title"), 160) for card in cards if isinstance(card, dict)]
    titles = [t for t in titles if t]
    if not titles:
        event.linked_cards.clear()
        return
    matched = list(world.documents.filter(deleted_at__isnull=True, name__in=titles))
    event.linked_cards.set(matched)


def apply_item(document: Document, payload: dict, event: TimelineEvent | None = None) -> dict:
    """新建 / 更新一条事件（经典编辑器发来的结构）。"""
    world = document.world
    is_new = event is None
    event = event or TimelineEvent(document=document)
    if is_new:
        # 经典编辑器本身是按「月」在轴上走的（提示里写的是 Month 5, Year -8），
        # 所以新建事件默认存到月；文档/日历显式指定默认精度时以它为准。
        settings_ = document.settings if isinstance(document.settings, dict) else {}
        fallback = settings_.get("default_precision") or ""
        if not fallback:
            calendar = world.calendars.filter(pk=as_int(settings_.get("calendar"))).first() \
                or world.calendars.order_by("id").first()
            fallback = calendar.default_precision if calendar else "month"
        explicit = as_text(payload.get("precision"), 8)
        if explicit in PRECISION_ORDER:
            # 调用方明确指定就照它办（工作区的事件面板会显式传精度）
            event.precision = explicit
        else:
            # 没指定时的兜底精度：经典编辑器按月在轴上走，所以下限是「月」，
            # 否则拖到年中新建的事件会被悄悄丢成那一年的 1 月。
            fallback = fallback if fallback in PRECISION_ORDER else "month"
            event.precision = (fallback if PRECISION_ORDER[fallback] >= PRECISION_ORDER["month"]
                               else "month")

    start = payload.get("start")
    if start is not None:
        try:
            parts = float_to_parts(float(start), event.precision)
        except (TypeError, ValueError):
            parts = None
        if parts:
            for key, value in parts.items():
                setattr(event, key, value)

    if "title" in payload:
        event.title = as_text(payload.get("title"), 160) or "未命名事件"
    if "desc" in payload:
        event.description = as_text(payload.get("desc"), 20000)
    if "cover" in payload:
        event.cover = as_text(payload.get("cover"), 4000)
    if "row" in payload:
        event.row = as_int(payload.get("row"), event.row)
    if is_new:
        event.position = document.events.count() + 1

    if "flagged" in payload:
        settings = dict(event.settings or {})
        settings["flagged"] = bool(payload.get("flagged"))
        event.settings = settings
    event.save()
    if "cards" in payload:
        link_cards(event, world, payload.get("cards"))
    if not is_new:
        document.save(update_fields=["updated_at"])
    # 注意：返回经典形状（含 kind/start/end），编辑器会直接 adopt 这个对象
    return event_item(event)


def apply_era(document: Document, era_id: int, payload: dict) -> dict:
    """更新纪元本身 + 它在轴上的位置（位置存在文档 settings 里）。"""
    world = document.world
    era = world.eras.filter(pk=era_id).first()
    if era is None:
        return {}
    if "title" in payload:
        era.name = as_text(payload.get("title"), 80) or era.name
    if "desc" in payload:
        era.description = as_text(payload.get("desc"), 4000)
    if "cover" in payload:
        era.cover = as_text(payload.get("cover"), 4000)
    if "theme" in payload:
        theme = as_text(payload.get("theme"), 16)
        if theme in ("blue", "sky", "violet", "red", "teal", "gold"):
            era.theme = theme
    era.save()

    settings_ = dict(document.settings or {})
    spans = dict(settings_.get("era_spans") or {})
    try:
        start = float(payload.get("start"))
        end = float(payload.get("end"))
    except (TypeError, ValueError):
        start = end = None
    if start is not None and end is not None and end > start:
        spans[str(era.id)] = [round(start, 4), round(end, 4)]
        era.length_years = round(end - start, 4)
        era.save(update_fields=["length_years"])
    settings_["era_spans"] = spans
    document.settings = settings_
    document.save(update_fields=["settings", "updated_at"])
    position = spans.get(str(era.id))
    return era_item(era, tuple(position) if position else (0.0, float(era.length_years or 50)))


def create_era(document: Document, payload: dict) -> dict:
    """在轴上新建一个时间段（等同于新建纪元）。"""
    world = document.world
    era = Era.objects.create(
        world=world,
        name=as_text(payload.get("title"), 80) or "新纪元",
        position=world.eras.count() + 1,
        theme=as_text(payload.get("theme"), 16) if as_text(payload.get("theme"), 16) in
        ("blue", "sky", "violet", "red", "teal", "gold") else "blue",
        description=as_text(payload.get("desc"), 4000),
        cover=as_text(payload.get("cover"), 4000),
    )
    return apply_era(document, era.id, payload)


def delete_item(document: Document, item_id: int) -> dict:
    """删除：纪元只解除摆放（纪元本身保留），事件真正删除。"""
    if item_id >= ERA_ID_BASE:
        era_id = item_id - ERA_ID_BASE
        settings_ = dict(document.settings or {})
        spans = dict(settings_.get("era_spans") or {})
        removed = spans.pop(str(era_id), None)
        settings_["era_spans"] = spans
        document.settings = settings_
        document.save(update_fields=["settings", "updated_at"])
        return {"kind": "era", "removed": removed}
    event = document.events.filter(pk=item_id).first()
    if event is None:
        return {}
    payload = event.to_payload()
    event.delete()
    document.save(update_fields=["updated_at"])
    return {"kind": "event", "removed": payload}


def save_view(document: Document, start: float, end: float) -> dict:
    settings_ = dict(document.settings or {})
    settings_["view_start"] = round(float(start), 4)
    settings_["view_end"] = round(float(end), 4)
    document.settings = settings_
    document.save(update_fields=["settings"])
    return {"start": settings_["view_start"], "end": settings_["view_end"]}
