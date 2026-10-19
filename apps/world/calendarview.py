# -*- coding: utf-8 -*-
"""历法计算：月视图网格、月相推算、把事件摆到某一天。

这是一个**纯计算模块**：不碰数据库，只接收 ``Calendar`` 对象与年月日，返回可直接
交给模板渲染的字典。它回答三件事：

* **月相**：某颗卫星在某一天是什么相（``phase_of``）；
* **某天的月相列表**：按每颗卫星自己的展示策略过滤（``moon_phases``）；
* **一个月的网格**：每周一行、每天带月相与当天事件（``month_grid`` / ``place_events``）。

历法规则全部来自 ``Calendar`` 的字段：
* 每个月有自己的天数，一年 = 各月天数之和；
* 每天的小时数可配；
* 卫星（``moons``）给出「周期天数」与「第几天满月」，据此反推月相；要不要画由
  ``shown`` 决定（``every_night`` / ``quarters`` / ``full_only``）。
"""

from __future__ import annotations

import math

PHASE_NAMES = ["新月", "娥眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"]


def phase_of(moon: dict, day_number: float) -> dict:
    """给定「第几天」，算出这颗卫星的月相。

    ``full_on`` 是「该周期里第几天是满月」——比给「新月在第几天」更直观（肉眼好认满月）。
    于是先由满月往回推半周期得到新月，再把天数映射成相位比例：0 = 新月、0.5 = 满月。
    """
    cycle = max(1.0, float(moon.get("cycle_days") or 28))
    full_on = float(moon.get("full_on") or 1)
    # 满月在第 full_on 天 → 新月在 full_on - cycle/2 天
    new_on = full_on - cycle / 2.0
    # 双重取模把结果拉回 [0, cycle)：Python 的 % 对负数返回负值，再取一次模才稳
    offset = ((day_number - new_on) % cycle + cycle) % cycle
    ratio = offset / cycle                       # 0 = 新月，0.5 = 满月
    # 八分之一格 → 八个相名
    index = int((ratio * 8 + 0.5)) % 8
    illumination = (1 - math.cos(ratio * 2 * math.pi)) / 2      # 0..1
    return {
        "name": moon.get("name") or "卫星",
        "color": moon.get("color") or "sky",
        "phase": PHASE_NAMES[index],
        "phase_index": index,
        "ratio": round(ratio, 4),
        "illumination": round(illumination, 3),
    }


def _visible_phases(moons, day_number: float) -> list[dict]:
    """按每颗卫星的 ``shown`` 策略过滤出某天要显示的月相（纯计算，无历法查询）。"""
    out = []
    for moon in moons:
        if not isinstance(moon, dict):
            continue
        info = phase_of(moon, day_number)
        # 展示策略缺省 quarters：只保留 index 为 0 / 2 / 4 / 6 的四个相位
        shown = moon.get("shown") or "quarters"
        if shown == "full_only" and info["phase_index"] != 4:
            continue
        if shown == "quarters" and info["phase_index"] not in (0, 2, 4, 6):
            continue
        out.append(info)
    return out


def moon_phases(calendar, year: int, month: int, day: int) -> list[dict]:
    """某一天的月相列表（按每颗卫星自己的 ``shown`` 策略过滤）。

    ``shown`` 三档：``every_night`` 每晚都画、``quarters`` 只画四相（新月 / 上弦 /
    满月 / 下弦）、``full_only`` 只画满月。缺省 ``quarters``——月视图上密密麻麻全是
    月亮反而看不清日期。
    """
    moons = calendar.moons if isinstance(calendar.moons, list) else []
    if not moons:
        return []
    return _visible_phases(moons, day_of_year(calendar, year, month, day))


def day_of_year(calendar, year: int, month: int, day: int) -> float:
    """从「历法原点」算起的第几天（用来推月相，跨年也连续）。

    做法：``年 × 一年天数 + 该月之前已过天数 + (日 - 1)``。负数年也成立，结果仍然
    连续递减，所以月相能一路往回算，不会每年 1 月 1 日重置。
    """
    months = calendar.month_list()
    month = min(max(int(month or 1), 1), len(months))
    before = sum(m["days"] for m in months[: month - 1])
    return year * calendar.days_per_year + before + (int(day or 1) - 1)


def month_grid(calendar, year: int, month: int) -> dict:
    """一个月的网格数据：每周一行，每天带月相与当天的事件。

    第一天落在第几列由「当年已过天数对 7 取模」决定，保证同一历法下每一年都自洽，
    不会出现某年 1 月 1 日突然换星期几。返回值同时带上月份表与每天小时数，供前端渲染。
    """
    months = calendar.month_list()
    month = min(max(int(month or 1), 1), len(months))
    days = months[month - 1]["days"]
    days_per_year = sum(m["days"] for m in months)
    moons = calendar.moons if isinstance(calendar.moons, list) else []
    rows: list[list[dict | None]] = []
    week: list[dict | None] = [None] * 7
    # 第一天放在第几列：用"当年已过天数"对 7 取模，保证历年一致
    offset = int(year * days_per_year) % 7
    # 该月之前的累计天数只算一次，逐日递增即可，不必每天重算月份表
    day_number = year * days_per_year + sum(m["days"] for m in months[: month - 1])
    for day in range(1, days + 1):
        week[offset] = {
            "day": day,
            "moons": _visible_phases(moons, day_number + day - 1),
            "events": [],
        }
        offset += 1
        if offset == 7:
            rows.append(week)
            week = [None] * 7
            offset = 0
    if any(cell is not None for cell in week):
        rows.append(week)
    return {
        "year": year,
        "month": month,
        "month_name": months[month - 1]["name"],
        "days": days,
        "hours_per_day": calendar.hours_per_day,
        "calendar_id": calendar.id,
        "weeks": rows,
        "months": [{"index": i + 1, "name": m["name"], "days": m["days"]} for i, m in enumerate(months)],
    }


def place_events(grid: dict, events) -> dict:
    """把事件按「年 / 月 / 日」塞进网格。

    只处理与网格同年同月的事件；日期越界会夹回 [1, 当月天数]。粗精度事件（只有年、
    或只有年月）的 day 缺省为 1，因此落在该月第一天——符合「越模糊越靠前」的一贯原则。
    """
    # 先把「日 -> 格子」建好，事件落格就是 O(1)，不必逐周逐格找
    cells_by_day = {}
    for week in grid["weeks"]:
        for cell in week:
            if cell:
                cells_by_day[cell["day"]] = cell
    for event in events:
        month = getattr(event, "month", 1) or 1
        if grid["month"] == month and getattr(event, "year", 0) == grid["year"]:
            day = min(max(int(getattr(event, "day", 1) or 1), 1), grid["days"])
            cell = cells_by_day.get(day)
            if cell is not None:
                cell["events"].append({
                    "id": event.id,
                    "title": event.title,
                    "precision": event.precision,
                    "hour": getattr(event, "hour", 0) or 0,
                })
    return grid
