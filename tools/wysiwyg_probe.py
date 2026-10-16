# -*- coding: utf-8 -*-
"""验证所见即所得：`/` 斜杠菜单、格式条加粗、有没有真的写进库。

0.5.2 起正文由 React + BlockNote 的编辑器孤岛渲染（P3 已拆掉整条旧 vanilla 渲染链）。
旧选择器（``.block-text`` / ``.slash-pop`` / ``.format-bar``，以及正文里直接敲 ``@``
弹出的 ``.mention-pop``）全都失效，这里统一改用 ``tools/_island.py`` 的助手。

**注意**：孤岛里没有 ``@`` 提及弹出菜单——名字识别改由装饰层自动完成
（``.mentions-inline``，见 tools/editor_probe.py 的「名称识别」段）。

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
import _island as isl  # noqa: E402

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


def para(bid, text):
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


def put_doc(card_id, doc):
    """写正文：权威存储是 blocks_doc（写老 blocks 会把孤岛的文档作废）。"""
    api(f"/api/world/cards/{card_id}", "PUT", {"blocks_doc": doc})


def main() -> int:
    docs = flatten(api("/api/world/state")["documents"])
    card = next((d for d in docs if d["type"] == "card"
                 and (d["name"] or "").startswith("未命名")), None)
    if card is None:
        card = next(d for d in docs if d["type"] == "card")
    print(f"用卡片「{card['name']}」验证")

    problems: list[str] = []
    orig = api(f"/api/world/cards/{card['id']}")["card"]["blocks_doc"]

    try:
        put_doc(card["id"], [para("wys1", "所见即所得探针")])

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
            page.wait_for_timeout(2400)
            print("孤岛挂载：", isl.has_editor(page), "· 块数", isl.block_count(page))

            # 1) 打开斜杠菜单（孤岛里靠侧菜单的「添加块」，不再是在正文里敲 `/`）
            slash = isl.open_slash_menu(page, 0)
            items = isl.slash_items(page)
            print(f"斜杠菜单出现：{slash}，条目 {len(items)} 个")
            if not slash:
                problems.append("斜杠菜单没出现")
            page.screenshot(path=str(SHOTS / "slash.png"))

            # 2) 选「二级标题」插入
            if slash:
                page.locator(isl.SLASH_MENU).get_by_text("二级标题", exact=True).first.click()
                page.wait_for_timeout(900)
            isl.place_cursor(page, isl.block_count(page) - 1)
            page.wait_for_timeout(250)
            page.keyboard.type("需要加粗的字", delay=30)
            page.wait_for_timeout(900)

            # 3) 选中一段文字 -> 出现格式条 -> 点加粗（图标按钮只有 aria-label）
            page.keyboard.down("Shift")
            for _ in range(6):
                page.keyboard.press("ArrowLeft")
            page.keyboard.up("Shift")
            page.wait_for_timeout(600)
            bar = isl.formatting_bar_visible(page)
            labels = isl.formatting_bar_items(page) if bar else []
            print("选中文字后格式条出现：", bar, "· 按钮", labels)
            if not bar:
                problems.append("格式条没出现")
            else:
                page.screenshot(path=str(SHOTS / "format_bar.png"))
                page.locator(isl.bar_button("加粗")).first.click()
                page.wait_for_timeout(1000)

            # 4) 落库检查：标题块 + 加粗样式都该在 blocks_doc 里
            doc = api(f"/api/world/cards/{card['id']}")["card"]["blocks_doc"]
            print(f"库里共 {len(doc)} 块：")
            for i, b in enumerate(doc):
                text = "".join((it.get("text") or "") for it in (b.get("content") or [])
                               if isinstance(it, dict))
                print(f"  [{i}] {b.get('type'):<10} {text[:40]!r}")
            has_heading = any(b.get("type") == "heading" for b in doc)
            has_bold = any((it.get("styles") or {}).get("bold")
                           for b in doc for it in (b.get("content") or [])
                           if isinstance(it, dict))
            print("落库：有标题块", has_heading, "· 有加粗样式", has_bold)
            if not has_heading:
                problems.append("斜杠菜单选的标题没写进库")
            if not has_bold:
                problems.append("加粗没写进库")
            page.screenshot(path=str(SHOTS / "rich_text.png"))

            browser.close()

        print("\n报错：", errors or "（无）")
        print("问题：", problems or "（无）")
    finally:
        put_doc(card["id"], orig)
        print("已还原卡片正文 →", card["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
