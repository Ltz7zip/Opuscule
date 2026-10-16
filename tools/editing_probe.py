# -*- coding: utf-8 -*-
"""验证这一轮的编辑能力：拖拽排序、撤销 / 重做、块菜单。

0.5.2 起正文由 React + BlockNote 的编辑器孤岛渲染。旧 vanilla 的选择器
（``.block`` / ``.block-handle`` / ``.block-menu`` / ``.block-tools`` / ``.comment-pop``）
已全部失效，这里统一改用 ``tools/_island.py`` 的助手；正文写入一律走 ``blocks_doc``。

**块评论已随旧渲染链下架**（见文件末尾 ``removed``），本探针不再断言它。

    .venv/bin/python tools/editing_probe.py
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


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def doc_of(doc_id):
    """正文的权威存储：BlockNote 原生 JSON。"""
    return api(f"/api/world/cards/{doc_id}")["card"]["blocks_doc"]


def para(bid, text):
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


def put_doc(card_id, doc):
    api(f"/api/world/cards/{card_id}", "PUT", {"blocks_doc": doc})


def block_text(block):
    parts = [item.get("text") or "" for item in (block.get("content") or [])
             if isinstance(item, dict)]
    return "".join(parts).strip()


def titles(doc_id):
    return [block_text(b)[:10] for b in (doc_of(doc_id) or [])]


def main() -> int:
    docs = flat(api("/api/world/state")["documents"])
    card = next((d for d in docs if d["type"] == "card"
                 and (d["name"] or "") == "未命名-编辑探针"), None)
    if card is None:
        card = next(d for d in docs if d["type"] == "card")
    problems: list[str] = []
    removed: list[str] = []

    orig = doc_of(card["id"])
    print("探针用卡片:", card["id"], repr(card["name"]), "· 原块数:", len(orig or []))

    try:
        put_doc(card["id"], [para("ed1", "编辑探针块一"), para("ed2", "编辑探针块二"),
                             para("ed3", "编辑探针块三")])

        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True)
            page = browser.new_page(viewport={"width": 1680, "height": 1000})
            page.set_default_timeout(12000)     # 任何动作卡住都要抛错，别把探针吊死
            ensure_login_page(page)
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

            page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
            page.wait_for_timeout(2400)

            before = titles(card["id"])
            print("孤岛挂载:", isl.has_editor(page), "· 初始顺序:", before)

            # ---------- 1) 拖拽排序：把第 1 块拖到第 2 块下面 ----------
            # 孤岛没有独立的 .block-handle：块菜单那个按钮就是拖拽手柄（draggable=true）。
            isl.hover_block(page, 0)
            if page.locator(isl.BLOCK).count() >= 2:
                # drag_to 会在 BlockNote 的 pointer-capture 拖拽上吊死：手动像素级拖。
                src = page.locator(isl.BLOCK).nth(0).bounding_box()
                dst = page.locator(isl.BLOCK).nth(1).bounding_box()
                handle = page.locator(isl.DRAG_HANDLE).first.bounding_box()
                if src and dst and handle:
                    page.mouse.move(handle["x"] + handle["width"] / 2,
                                    handle["y"] + handle["height"] / 2)
                    page.wait_for_timeout(150)
                    page.mouse.down()
                    page.wait_for_timeout(150)
                    # 分步移动，帮 ProseMirror 累积拖拽阈值
                    for i in range(1, 9):
                        page.mouse.move(handle["x"] + handle["width"] / 2,
                                        handle["y"] + (dst["y"] + dst["height"] + 8 - handle["y"]) * i / 8)
                        page.wait_for_timeout(60)
                    page.mouse.up()
                page.wait_for_timeout(1600)
            dragged = titles(card["id"])
            print("拖拽后：", dragged)
            if dragged == before:
                problems.append("拖拽排序没有生效")
            page.screenshot(path=str(SHOTS / "drag_reorder.png"))

            # ---------- 2) 撤销 / 重做 ----------
            isl.place_cursor(page, 0)
            page.wait_for_timeout(200)
            page.keyboard.press("Meta+z")
            page.wait_for_timeout(1500)
            undone = titles(card["id"])
            print("⌘Z 之后：", undone)
            if undone != before:
                problems.append("撤销没有回到原顺序")
            page.keyboard.press("Meta+Shift+z")
            page.wait_for_timeout(1500)
            redone = titles(card["id"])
            print("⇧⌘Z 之后：", redone)
            if redone != dragged:
                problems.append("重做没有回到拖动后的顺序")
            page.keyboard.press("Meta+z")            # 复原，别把演示数据搅乱
            page.wait_for_timeout(1200)

            # ---------- 3) 块菜单（实测只剩「删除」「颜色」）----------
            menu_ok = isl.open_block_menu(page, 1)
            items = isl.block_menu_items(page)
            print("块菜单：", menu_ok, "· 条目:", items)
            if not menu_ok:
                problems.append("块菜单没打开")
            else:
                page.screenshot(path=str(SHOTS / "block_menu.png"))
            joined = " ".join(items)
            if menu_ok and "删除" not in joined:
                problems.append("块菜单缺少「删除」")
            removed.append("块菜单里的「复制这一块」：旧 vanilla 菜单项，已随旧渲染链下架，"
                           "孤岛块菜单只剩「删除」「颜色」")
            isl.close_menus(page)

            # ---------- 4) 块评论（已下架）----------
            removed.append("块评论（.comment-pop / .comment-list / 块工具条的评论按钮）："
                           "该功能已随旧渲染链下架，workspace.js 里只剩页面级评论"
                           "（.page-comments / .pc-input）")
            if page.locator(".comment-pop").count() > 0 or \
                    page.locator(".block-tools").count() > 0:
                problems.append("旧块评论浮层 / 块工具条不该还在")

            browser.close()

        print("\n报错：", errors[:3] or "（无）")
        print("问题：", problems or "（无）")
        for item in removed:
            print("  ·", item)
    finally:
        put_doc(card["id"], orig)
        print("已还原卡片正文 →", card["id"], "（块数", len(orig or []), "）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
