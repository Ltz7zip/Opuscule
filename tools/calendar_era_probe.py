# -*- coding: utf-8 -*-
"""日历视图 + 纪元分支的验证。"""
from __future__ import annotations
import json, pathlib, sys, urllib.request
import os
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/ux_shots"); SHOTS.mkdir(exist_ok=True)
opener = make_opener(); ensure_login(opener)

def api(path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=20) as r:
        return json.loads(r.read() or b"{}")

def flat(ns, out=None):
    out = out if out is not None else []
    for n in ns:
        out.append(n); flat(n.get("children") or [], out)
    return out

problems = []
state = api("/api/world/state")
tl = next(d for d in flat(state["documents"]) if d["type"] == "timeline")
card = next(d for d in flat(state["documents"]) if d["type"] == "card")
cal = state["calendars"][0]
eras = state["eras"]

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page(viewport={"width": 1500, "height": 950})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    ensure_login_page(page)

    page.goto(f"{BASE}/world#doc={tl['id']}", wait_until="networkidle")
    page.wait_for_timeout(2200)
    page.click(".seg-btn:has-text('日历视图')")
    page.wait_for_timeout(1500)
    cells = page.locator(".cal-cell").count()
    heads = page.locator(".cal-head").count()
    pages = page.locator(".cal-page").count()
    events = page.locator(".cal-event").count()
    moons = page.locator(".cal-moon").count()
    label = page.locator(".cal-label").inner_text() if page.locator(".cal-label").count() else ""
    print(f"日历视图：{pages} 页 · {heads} 列表头 · {cells} 个格子 · {events} 个事件 · {moons} 个月相 · {label}")
    # 轨道里放三页（上个月 / 这个月 / 下个月）做 scroll-snap，所以表头/格子按页算：
    # 每页 7 个表头、至少 28 个格子（4 周）。
    if pages < 1 or heads != pages * 7 or cells < pages * 28:
        problems.append("日历网格不完整")
    if not label:
        problems.append("没有显示年月")
    page.screenshot(path=str(SHOTS / "calendar_view.png"))
    if page.locator(".cal-bar .mini-btn").count() >= 2:
        page.locator(".cal-bar .mini-btn").nth(1).click()
        page.wait_for_timeout(900)
        print("翻月之后：", page.locator(".cal-label").inner_text())

    # 纪元分支：给卡设成"只在第二纪"，切到第一纪后应该标灰
    if len(eras) >= 2:
        second = eras[1]
        api(f"/api/world/cards/{card['id']}", "PUT", {"era_mode": "only", "era_ids": [second["id"]]})
        page.reload(wait_until="networkidle"); page.wait_for_timeout(1500)
        page.click("#eraChipSlot .era-chip")
        page.wait_for_timeout(800)
        page.screenshot(path=str(SHOTS / "era_switcher.png"))
        rows = page.locator("#mdBody .suggest-row").count()
        print("纪元切换面板行数：", rows)
        if rows < 2:
            problems.append("纪元切换面板没列出纪元")
        page.locator("#mdBody .suggest-row", has_text=eras[0]["name"]).locator("button").click()
        page.wait_for_timeout(1200)
        dimmed = page.locator(".row.is-other-era").count()
        print(f"切到「{eras[0]['name']}」后标灰的卡：{dimmed}")
        if dimmed < 1:
            problems.append("切换到别的纪元后没标出不属于它的卡")
        page.screenshot(path=str(SHOTS / "era_dimmed.png"))
        # 卡的纪元对话框
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.click(".badge-row .badge:has-text('纪元：')")
        page.wait_for_timeout(800)
        print("卡纪元对话框：", page.locator(".era-mode-row").count(), "个选项")
        page.screenshot(path=str(SHOTS / "card_era.png"))
        api(f"/api/world/cards/{card['id']}", "PUT", {"era_mode": "universal", "era_ids": []})
    b.close()

print("报错：", errs[:2] or "（无）")
print("问题：", problems or "（无）")
