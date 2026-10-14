# -*- coding: utf-8 -*-
"""验证所见即所得：富文本工具栏、`/` 斜杠菜单、`@` 提及，以及有没有真的写进库。

    .venv/bin/python tools/wysiwyg_probe.py
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
    with opener.open(request, timeout=15) as response:
        body = response.read()
    return json.loads(body) if body else {}


def flatten(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flatten(node.get("children") or [], out)
    return out


def main() -> int:
    docs = flatten(api("/api/world/state")["documents"])
    card = next((d for d in docs if d["type"] == "card"), None)
    if card is None:
        print("没有卡片")
        return 1
    print(f"用卡片「{card['name']}」验证")

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

        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(700)

        # 1) 在正文里输入 `/` —— 应弹出区块菜单
        block = page.query_selector_all(".block-text")[-1]
        block.click()
        page.keyboard.type("这是", delay=40)
        page.keyboard.press("Enter")
        page.keyboard.type("/", delay=40)
        page.wait_for_timeout(700)
        slash = page.query_selector(".slash-pop:not([hidden])")
        items = page.query_selector_all(".slash-pop .mention-row")
        print(f"输入 / 后菜单出现：{bool(slash)}，条目 {len(items)} 个")
        if not slash:
            problems.append("斜杠菜单没出现")
        page.screenshot(path=str(SHOTS / "slash.png"))

        # 2) 过滤到「标题 2」并选中
        if slash:
            page.keyboard.type("标题 2", delay=60)
            page.wait_for_timeout(500)
            page.keyboard.press("Enter")
            page.wait_for_timeout(900)
            html = page.eval_on_selector_all(".block-text", "els => els[els.length-1].innerHTML")
            print("应用后最后一段正文的 HTML：", html[:80])

        # 3) 选中一段文字 -> 出现格式条 -> 点加粗
        block = page.query_selector_all(".block-text")[-1]
        block.click()
        page.keyboard.type("需要加粗的字", delay=30)
        page.keyboard.down("Shift")
        for _ in range(6):
            page.keyboard.press("ArrowLeft")
        page.keyboard.up("Shift")
        page.wait_for_timeout(600)
        bar = page.query_selector(".format-bar:not([hidden])")
        print("选中文字后格式条出现：", bool(bar))
        if not bar:
            problems.append("格式条没出现")
        else:
            page.screenshot(path=str(SHOTS / "format_bar.png"))
            page.click(".format-bar button >> nth=0")     # B
            page.wait_for_timeout(900)

        # 4) 落库检查
        payload = api(f"/api/world/cards/{card['id']}")
        blocks = payload["card"]["blocks"]
        joined = " ".join((b.get("html") or "") for b in blocks)
        print(f"库里共 {len(blocks)} 块：")
        for i, b in enumerate(blocks):
            print(f"  [{i}] {b['type']:<8} {(b.get('html') or b.get('text') or '')[:70]!r}")
        if "<b>" not in joined and "<strong>" not in joined and "<h2>" not in joined:
            problems.append("格式没有写进库（既没有加粗也没有标题）")
        page.screenshot(path=str(SHOTS / "rich_text.png"))

        browser.close()

    print("\n报错：", errors or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
