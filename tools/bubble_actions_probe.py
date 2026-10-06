# -*- coding: utf-8 -*-
"""验证选区气泡的两个动作：创建卡片 / 链接卡片（以及浅色下的极简外观截图）。"""

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


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    card = next(d for d in docs if d["type"] == "card")
    problems: list[str] = []
    before = len([d for d in docs if d["type"] == "card"])

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("dialog", lambda dialog: dialog.accept())

        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1200)

        def select_block(index=0, chars=18):
            page.evaluate("""([i, n]) => {
              const node = document.querySelectorAll('.block-text')[i];
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              const textNode = walker.nextNode();
              const range = document.createRange();
              range.setStart(textNode, 0);
              range.setEnd(textNode, Math.min(n, textNode.length));
              const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
            }""", [index, chars])
            page.wait_for_timeout(600)

        # 1) 创建卡片
        select_block(0, 16)
        text = page.evaluate("() => window.getSelection().toString()")
        page.locator(".fb-actions button").first.click()
        page.wait_for_timeout(1400)
        after_state = api("/api/world/state")
        cards_now = len([d for d in flat(after_state["documents"]) if d["type"] == "card"])
        mentions = page.evaluate("() => document.querySelectorAll('.mentions-inline[data-target]').length")
        print(f"选中「{text}」-> 创建卡片：卡片数 {before} -> {cards_now}，正文里的提及 {mentions} 个")
        if cards_now != before + 1:
            problems.append("创建卡片没有真的建卡")
        if mentions < 1:
            problems.append("创建卡片后没有把选区变成提及")
        page.screenshot(path=str(SHOTS / "bubble_create.png"))

        # 2) 链接卡片（选一段别的文字，链到已有卡片）
        select_block(1, 12)
        page.locator(".fb-actions button").nth(1).click()
        page.wait_for_timeout(600)
        print("选择器出现:", page.evaluate("() => !!document.querySelector('.picker')"))
        page.fill(".picker-head input", "Harrowdeep")
        page.wait_for_timeout(700)
        page.screenshot(path=str(SHOTS / "picker.png"))
        page.locator(".picker-row").first.click()
        page.wait_for_timeout(1400)
        mentions2 = page.evaluate("() => document.querySelectorAll('.mentions-inline[data-target]').length")
        print(f"链接卡片后，正文里的提及 {mentions2} 个")
        if mentions2 <= mentions:
            problems.append("链接卡片没有插入提及")
        page.screenshot(path=str(SHOTS / "bubble_link.png"))

        # 3) 浅色下的极简外观
        api("/api/world/world", "PUT", {"theme_config": {"mode": "light"}})
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(SHOTS / "minimal_light.png"))
        api("/api/world/world", "PUT", {"theme_config": {"mode": "dark"}})

        browser.close()

    print("\n报错：", errors or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
