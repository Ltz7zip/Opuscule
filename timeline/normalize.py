# -*- coding: utf-8 -*-
"""把前端传来的任意 JSON 规范成一条合法记录。

这段逻辑是从 Flask 版 app.py 原样搬过来的（``_as_float`` / ``_as_int`` /
``_as_text`` / ``_as_cards`` / ``normalize``），一行为改动都没有，
区别只是：不再往 data.json 里写，而是把结果交给调用方存进 TimelineItem。

本模块刻意不 import 任何 Django 东西，方便被数据迁移复用。
"""

# 纪元允许的配色（sky / gold 是照录屏补的）
THEMES = ("blue", "sky", "violet", "red", "teal", "gold")

# 一条记录涉及的模型字段（顺序即写入顺序）
ITEM_FIELDS = ("kind", "title", "start", "end", "desc", "row", "theme", "cover", "cards")


def as_float(value, default=None):
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        token = ""
        for ch in value.strip():
            if ch.isdigit() or (ch == "-" and not token) or ch == ".":
                token += ch
            else:
                break
        try:
            return float(token)
        except ValueError:
            return default
    return default


def as_int(value, default=0):
    number = as_float(value)
    return default if number is None else int(round(number))


def as_text(value, default="", limit=200):
    if value is None:
        return default
    text = str(value).replace("\r\n", "\n").strip()
    return text[:limit]


def as_cards(value):
    """卡片是轻量的链接 / 封面集合，只保留认识的字段。"""
    if not isinstance(value, list):
        return []
    cards = []
    for raw in value[:40]:
        if not isinstance(raw, dict):
            continue
        cards.append({
            "title": as_text(raw.get("title"), limit=120),
            "url": as_text(raw.get("url"), limit=600),
            "cover": as_text(raw.get("cover"), limit=600),
        })
    return cards


def normalize(payload, fallback=None):
    """把任意 JSON 变成一条合法记录，返回可直接赋给 TimelineItem 的字典。

    ``fallback`` 是「原记录」，用于复刻 Flask 版 PUT/PATCH 的合并语义：
    请求里出现的键覆盖原值，没出现的键沿用原值。所以只发 ``{"start": 5}``
    也能改时间而不丢标题。
    """
    source = payload if isinstance(payload, dict) else {}
    base = fallback if isinstance(fallback, dict) else {}

    def pick(key):
        return source[key] if key in source else base.get(key)

    kind = pick("kind") or pick("type")
    kind = "era" if str(kind).lower() in ("era", "range", "period") else "event"

    start = as_float(pick("start"))
    end = as_float(pick("end"))
    if start is None:
        start = 0.0
    if end is None:
        end = start
    if kind == "event":
        end = start
    elif end < start:
        start, end = end, start

    title = as_text(pick("title"), default="新事件" if kind == "event" else "新纪元", limit=120)
    if not title:
        title = "新事件" if kind == "event" else "新纪元"

    theme = pick("theme")
    if kind == "era":
        theme = theme if theme in THEMES else "blue"
    else:
        # 事件没有配色，清空即可（Flask 版是干脆不写这个键）
        theme = ""

    return {
        "kind": kind,
        "title": title,
        "start": start,
        "end": end,
        "desc": as_text(pick("desc"), default="", limit=4000),
        "row": max(0, as_int(pick("row"), 0)),
        "theme": theme,
        "cover": as_text(pick("cover"), default="", limit=1200),
        "cards": as_cards(pick("cards")),
    }


def apply_values(item, values):
    """把 ``normalize()`` 的结果写进模型实例（不保存）。"""
    for field in ITEM_FIELDS:
        setattr(item, field, values[field])
    return item
