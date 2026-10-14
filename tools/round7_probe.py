# -*- coding: utf-8 -*-
"""验证这一轮新增的能力：列表视图 / 标记、导入导出、建议、快捷键、撤销历史、侧栏开关。

    .venv/bin/python tools/round7_probe.py
"""

from __future__ import annotations

import os
import json
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/ux_shots")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()   # 带 cookie jar，登录态才留得住
ensure_login(opener)


def api(path: str, method: str = "GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                     headers={"Content-Type": "application/json"})
    return opener.open(request, timeout=20)


def json_api(path: str):
    response = api(path)
    try:
        return json.loads(response.read())
    finally:
        response.close()


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def main() -> int:
    docs = flat(json_api("/api/world/state")["documents"])
    timeline = next(d for d in docs if d["type"] == "timeline")
    card = next(d for d in docs if d["type"] == "card")
    problems: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        # ---------------- 1) 时间线列表视图 + 标记 ----------------
        page.goto(f"{BASE}/world#doc={timeline['id']}", wait_until="networkidle")
        page.wait_for_timeout(2200)
        frame = page.frame_locator(".timeline-frame")
        before_view = json_api(f"/api/world/timelines/{timeline['id']}/classic")["view"]
        frame.locator('[data-tool="list"]').click()
        page.wait_for_timeout(800)
        rows = frame.locator(".tl-list-row").count()
        print(f"列表视图行数：{rows}")
        if rows < 3:
            problems.append("列表视图没有列出事件")
        page.screenshot(path=str(SHOTS / "timeline_list.png"))

        frame.locator(".tl-list-head input").fill("Harrow")
        page.wait_for_timeout(500)
        filtered = frame.locator(".tl-list-row").count()
        print(f"搜索 Harrow 之后：{filtered} 行")
        if filtered >= rows:
            problems.append("列表搜索没有过滤")
        frame.locator(".tl-list-head input").fill("")
        page.wait_for_timeout(400)

        # 点一行 -> 视野应该移过去。视野是持久化的，所以要挑一个离当前视野远的行，
        # 否则"本来就在视野里"，点了也不会动（这不是 bug）。
        after_view = before_view
        for index in (rows - 1, 0):
            frame.locator(".tl-list-row").nth(index).click()
            page.wait_for_timeout(1400)
            after_view = json_api(f"/api/world/timelines/{timeline['id']}/classic")["view"]
            if abs(after_view["start"] - before_view["start"]) > 1:
                break
        print(f"点行后视野：{round(before_view['start'])} → {round(after_view['start'])}")
        if abs(after_view["start"] - before_view["start"]) < 1:
            problems.append("点列表行没有移动视野")

        # 标记（⚑）
        frame.locator(".tl-list-flag:not(.is-blank)").first.click()
        page.wait_for_timeout(1200)
        items = json_api(f"/api/world/timelines/{timeline['id']}/classic")["items"]
        flagged = [i for i in items if i.get("flagged")]
        print(f"标记后带旗子的事件：{len(flagged)}")
        if not flagged:
            problems.append("标记没有落库")
        frame.locator(".tl-list-filter").click()
        page.wait_for_timeout(600)
        only = frame.locator(".tl-list-row").count()
        print(f"只看标记：{only} 行")
        if only != len(flagged):
            problems.append("只看标记过滤不对")
        page.screenshot(path=str(SHOTS / "timeline_list_flag.png"))

        # ---------------- 2) 导出 / 导入面板 ----------------
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.click("#exchangeBtn")
        page.wait_for_timeout(700)
        if not page.query_selector("#mdBody .drop-zone"):
            problems.append("导入导出面板没打开")
        page.screenshot(path=str(SHOTS / "exchange.png"))
        # 粘贴 Markdown 走一遍导入
        page.fill("#mdBody textarea", "# 自动点测导入的文档\n\n## 概览\n\n这是导入的正文。\n")
        page.click("#mdBody .mini-btn.is-primary")
        page.wait_for_timeout(2000)
        names = [d["name"] for d in flat(json_api("/api/world/state")["documents"])]
        print("导入后是否存在新文档：", "自动点测导入的文档" in names)
        if "自动点测导入的文档" not in names:
            problems.append("Markdown 导入没生效")

        # 导出接口本身
        response = api("/api/world/export")
        content_type = response.headers.get("Content-Type") or ""
        size = len(response.read())
        response.close()
        print("世界 zip：", content_type, f"{size} 字节")
        if "zip" not in content_type or size < 500:
            problems.append("世界导出不可用")

        # ---------------- 3) 建议面板 ----------------
        page.click("#suggestBtn")
        page.wait_for_timeout(1200)
        has_sections = page.query_selector("#mdBody .suggest-list")
        print("建议面板：", bool(has_sections))
        if not has_sections:
            problems.append("建议面板没有内容")
        page.screenshot(path=str(SHOTS / "suggestions.png"))
        page.keyboard.press("Escape")
        page.mouse.click(20, 500)
        page.wait_for_timeout(400)

        # ---------------- 4) 快捷键 / 撤销历史 / 侧栏 ----------------
        page.keyboard.press("Meta+/")
        page.wait_for_timeout(700)
        shortcuts = page.query_selector_all("#mdBody .shortcut-row")
        print("快捷键条数：", len(shortcuts))
        if len(shortcuts) < 10:
            problems.append("快捷键窗口内容太少")
        page.screenshot(path=str(SHOTS / "shortcuts.png"))
        page.keyboard.press("Escape")
        page.mouse.click(20, 500)
        page.wait_for_timeout(400)

        page.keyboard.press("Meta+b")
        page.wait_for_timeout(500)
        collapsed = page.evaluate("() => document.querySelector('.sidebar').classList.contains('is-collapsed')")
        print("⌘B 收起侧栏：", collapsed)
        if not collapsed:
            problems.append("⌘B 没有收起侧栏")
        page.keyboard.press("Meta+b")
        page.wait_for_timeout(400)

        # 撤销按钮在没有可撤销内容时是 disabled 的：先制造一次编辑，再右键看历史
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.evaluate("""() => {
          const node = document.querySelectorAll('.block-text')[0];
          node.focus();
          node.innerHTML = (node.innerHTML || '') + ' ';
        }""")
        page.keyboard.press("End")
        page.keyboard.type("x", delay=30)
        page.wait_for_timeout(1400)
        page.click("#undoBtn", button="right")
        page.wait_for_timeout(700)
        opened = bool(page.query_selector("#mdBody"))
        print("撤销历史面板：", opened)
        if not opened:
            problems.append("撤销历史面板没打开")
        page.screenshot(path=str(SHOTS / "undo_history.png"))

        # 收尾：删掉自动导入的文档
        for doc in flat(json_api("/api/world/state")["documents"]):
            if doc["name"] == "自动点测导入的文档":
                api(f"/api/world/documents/{doc['id']}?hard=1", "DELETE").close()

        browser.close()

    print("\n报错：", errors[:3] or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
