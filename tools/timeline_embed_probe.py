# -*- coding: utf-8 -*-
"""验证工作区里的时间线面板：嵌入的经典编辑器能不能真用（点、拖、缩放）。

    .venv/bin/python tools/timeline_embed_probe.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/ux_shots")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()   # 带 cookie jar，登录态才留得住
ensure_login(opener)


def api(path: str, method: str = "GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                     headers={"Content-Type": "application/json"})
    with opener.open(request, timeout=15) as response:
        body = response.read()
    return json.loads(body) if body else {}


def main() -> int:
    state = api("/api/world/state")

    def find(nodes):
        for node in nodes:
            if node["type"] == "timeline":
                return node
            found = find(node.get("children") or [])
            if found:
                return found
        return None

    timeline = find(state["documents"])
    if timeline is None:
        print("没有时间线文档，先跑 seed_demo")
        return 1
    doc_id = timeline["id"]
    before = len(api(f"/api/world/timelines/{doc_id}")["events"])
    print(f"时间线「{timeline['name']}」id={doc_id}，现有事件 {before} 个")

    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                if msg.type == "error" else None)
        page.on("response", lambda res: errors.append(f"HTTP {res.status} {res.url}")
                if res.status >= 400 else None)

        # 1) 工作区里打开时间线 -> 应该看到 iframe 里的经典编辑器
        page.goto(f"{BASE}/world#doc={doc_id}", wait_until="networkidle")
        page.wait_for_timeout(1500)
        frame_el = page.query_selector("iframe.timeline-frame")
        print("面板里出现 iframe：", bool(frame_el))
        if not frame_el:
            problems.append("工作区没有把经典编辑器嵌进来")
        page.screenshot(path=str(SHOTS / "timeline_panel.png"))

        frame = page.frame_locator("iframe.timeline-frame")
        has_axis = frame.locator("#viewport").count()
        print("iframe 里出现 #viewport（编辑器画布）：", has_axis > 0)
        if not has_axis:
            problems.append("iframe 里的编辑器没渲染出来")

        # 2) 画布上点一下：经典编辑器会新建一个时间点
        box = page.query_selector("iframe.timeline-frame").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.5)
        page.wait_for_timeout(1200)
        page.screenshot(path=str(SHOTS / "timeline_after_click.png"))
        after = len(api(f"/api/world/timelines/{doc_id}")["events"])
        print(f"点击画布后事件数：{before} -> {after}")
        if after <= before:
            problems.append("在嵌入的编辑器里点画布没有新建事件")

        # 3) 拖一下（平移）与滚轮（左右移动时间轴；缩放要 ⌘/Ctrl + 滚轮），看有没有报错
        page.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
        page.mouse.down()
        page.mouse.move(box["x"] + box["width"] * 0.62, box["y"] + box["height"] * 0.5, steps=8)
        page.mouse.up()
        page.wait_for_timeout(800)
        before_wheel = page.evaluate("() => document.querySelector('#viewport') ? 1 : 0")
        page.mouse.wheel(0, -400)                 # 滚轮 = 平移
        page.wait_for_timeout(600)
        page.keyboard.down("Meta")
        page.mouse.wheel(0, -400)                 # ⌘ + 滚轮 = 缩放
        page.keyboard.up("Meta")
        page.wait_for_timeout(800)
        print(f"滚轮平移 + ⌘滚轮缩放已执行（viewport {before_wheel}）")
        page.screenshot(path=str(SHOTS / "timeline_after_drag.png"))

        # 4) 打开「事件与卡片」抽屉（经典编辑器没有的能力）
        try:
            page.click("text=事件与卡片", timeout=3000)
            page.wait_for_timeout(1000)
            drawer = page.query_selector(".tl-drawer")
            print("事件与卡片抽屉：", bool(drawer))
            if not drawer:
                problems.append("事件与卡片面板没打开")
            page.screenshot(path=str(SHOTS / "timeline_drawer.png"))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"打开事件面板失败：{exc}")

        # 5) 日历面板
        try:
            page.click("text=日历与纪元", timeout=3000)
            page.wait_for_timeout(1000)
            print("日历面板：", bool(page.query_selector(".tl-panel")))
            page.screenshot(path=str(SHOTS / "timeline_calendar.png"))
        except Exception as exc:  # noqa: BLE001
            problems.append(f"打开日历面板失败：{exc}")

        browser.close()

    print("\n报错：", errors or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
