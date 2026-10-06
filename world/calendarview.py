# -*- coding: utf-8 -*-
"""历法计算：月视图、月相、在某天发生的事件。

自定义历法的规则（对齐调研文档 §7.2 的 timeline.settings）：
* 每个月自己的天数，一年 = 各月天数之和
* 每天的小时数可配
* 卫星（moons）：有周期天数与「第几天满月」，据此推算月相；展示策略由 `shown` 决定
  （every_night / quarters / full_only）
"""

from __future__ import annotations

import math

PHASE_NAMES = ["新月", "娥眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"]


def phase_of(moon: dict, day_number: float) -> dict:
    """给定"第几天"，算出这颗卫星的月相。

    `full_on` 表示该周期里第几天是满月；由此反推新月的位置，再取相位比例。
    """
    cycle = max(1.0, float(moon.get("cycle_days") or 28))
    full_on = float(moon.get("full_on") or 1)
    # 满月在第 full_on 天 → 新月在 full_on - cycle/2 天
    new_on = full_on - cycle / 2.0
    offset = ((day_number - new_on) % cycle + cycle) % cycle
    ratio = offset / cycle                       # 0 = 新月，0.5 = 满月
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


def moon_phases(calendar, year: int, month: int, day: int) -> list[dict]:
    """某一天的月相列表（按 `shown` 策略过滤）。"""
    moons = calendar.moons if isinstance(calendar.moons, list) else []
    if not moons:
        return []
    day_number = day_of_year(calendar, year, month, day)
    out = []
    for moon in moons:
        if not isinstance(moon, dict):
            continue
        info = phase_of(moon, day_number)
        shown = moon.get("shown") or "quarters"
        if shown == "full_only" and info["phase_index"] != 4:
            continue
        if shown == "quarters" and info["phase_index"] not in (0, 2, 4, 6):
            continue
        out.append(info)
    return out


def day_of_year(calendar, year: int, month: int, day: int) -> float:
    """从"历法原点"算起的第几天（用来推月相，跨年也连续）。"""
    months = calendar.month_list()
    month = min(max(int(month or 1), 1), len(months))
    before = sum(m["days"] for m in months[: month - 1])
    return year * calendar.days_per_year + before + (int(day or 1) - 1)


def month_grid(calendar, year: int, month: int) -> dict:
    """一个月的网格数据：每周一行，每天带月相与当天的事件。"""
    months = calendar.month_list()
    month = min(max(int(month or 1), 1), len(months))
    days = months[month - 1]["days"]
    rows: list[list[dict | None]] = []
    week: list[dict | None] = [None] * 7
    # 第一天放在第几列：用"当年已过天数"对 7 取模，保证历年一致
    offset = int(year * calendar.days_per_year) % 7
    for day in range(1, days + 1):
        week[offset] = {"day": day, "moons": moon_phases(calendar, year, month, day), "events": []}
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
    """把事件按"年 / 月 / 日"塞进网格（粗精度的事件落在第一天或整月）。"""
    for event in events:
        month = getattr(event, "month", 1) or 1
        if grid["month"] == month and getattr(event, "year", 0) == grid["year"]:
            day = min(max(int(getattr(event, "day", 1) or 1), 1), grid["days"])
            for week in grid["weeks"]:
                for cell in week:
                    if cell and cell["day"] == day:
                        cell["events"].append({
                            "id": event.id,
                            "title": event.title,
                            "precision": event.precision,
                            "hour": getattr(event, "hour", 0) or 0,
                        })
                        break
    return grid
