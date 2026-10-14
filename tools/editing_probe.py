# -*- coding: utf-8 -*-
"""验证这一轮新增的编辑能力：拖拽排序、撤销/重做、块菜单、块评论。

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
        flatten_children = node.get("children") or []
        flat(flatten_children, out)
    return out


def blocks_of(doc_id):
    return api(f"/api/world/cards/{doc_id}")["card"]["blocks"]


def titles(blocks):
    return [b.get("title") or (b.get("text") or "")[:10] for b in blocks]


def main() -> int:
    docs = flat(api("/api/world/state")["documents"])
    card = next(d for d in docs if d["type"] == "card")
    problems: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1200)

        before = titles(blocks_of(card["id"]))
        print("初始顺序：", before)

        # ---------- 1) 拖拽排序：把第 1 块拖到第 2 块下面 ----------
        blocks = page.query_selector_all(".block")
        if len(blocks) >= 2:
            blocks[0].hover()                      # 工具条只在悬停时出现
            page.wait_for_timeout(300)
            handle = page.query_selector_all(".block-handle")[0]
            handle.hover()
            page.mouse.down()
            box = blocks[1].bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.8, steps=12)
            page.mouse.up()
            page.wait_for_timeout(1200)
        dragged = titles(blocks_of(card["id"]))
        print("拖拽后：", dragged)
        if dragged == before:
            problems.append("拖拽排序没有生效")
        page.screenshot(path=str(SHOTS / "drag_reorder.png"))

        # ---------- 2) 撤销 / 重做 ----------
        page.keyboard.press("Meta+z")
        page.wait_for_timeout(1200)
        undone = titles(blocks_of(card["id"]))
        print("⌘Z 之后：", undone)
        if undone != before:
            problems.append("撤销没有回到原顺序")
        page.keyboard.press("Meta+Shift+z")
        page.wait_for_timeout(1200)
        redone = titles(blocks_of(card["id"]))
        print("⇧⌘Z 之后：", redone)
        if redone != dragged:
            problems.append("重做没有回到拖动后的顺序")
        page.keyboard.press("Meta+z")            # 复原，别把演示数据搅乱
        page.wait_for_timeout(1000)

        # ---------- 3) 块菜单 ----------
        page.query_selector_all(".block")[1].hover()
        page.wait_for_timeout(300)
        page.query_selector_all(".block-handle")[1].click()
        page.wait_for_timeout(600)
        menu = page.query_selector(".block-menu")
        items = [b.inner_text().strip() for b in page.query_selector_all(".block-menu button")] if menu else []
        print("块菜单：", items)
        if not menu:
            problems.append("块菜单没打开")
        else:
            page.screenshot(path=str(SHOTS / "block_menu.png"))
            page.click(".block-menu button:has-text('复制这一块')")
            page.wait_for_timeout(1200)
            duplicated = titles(blocks_of(card["id"]))
            print(f"复制后块数 {len(before)} -> {len(duplicated)}")
            if len(duplicated) != len(before) + 1:
                problems.append("复制区块没生效")
            page.keyboard.press("Meta+z")
            page.wait_for_timeout(1200)
            if len(titles(blocks_of(card["id"]))) != len(before):
                problems.append("撤销复制没生效")

        # ---------- 4) 块评论 ----------
        page.query_selector_all(".block")[1].hover()
        page.wait_for_timeout(300)
        page.query_selector_all(".block-tools button[title*='评论']")[1].click()
        page.wait_for_timeout(700)
        if not page.query_selector(".comment-pop"):
            problems.append("评论区没打开")
        else:
            page.fill(".comment-input", "这条来源要补一下——自动点测留")
            page.click(".comment-pop .mini-btn.is-primary")
            page.wait_for_timeout(1200)
            saved = blocks_of(card["id"])
            target = next((b for b in saved if (b.get("comments") or [])), None)
            count = len(target.get("comments", [])) if target else 0
            print("库里评论数：", count)
            if count < 1:
                problems.append("评论没有落库")
            page.screenshot(path=str(SHOTS / "block_comments.png"))
            # 标记解决
            if page.query_selector(".comment-pop .mini-btn"):
                page.click(".comment-pop .comment-row .mini-btn")
                page.wait_for_timeout(1200)
                saved = blocks_of(card["id"])
                target = next((b for b in saved if (b.get("comments") or [])), None)
                resolved = bool(target and target["comments"][0].get("resolved"))
                print("标记解决：", resolved)
                if not resolved:
                    problems.append("标记解决没生效")

        # 收尾：把自动点测写进去的评论清掉，别污染演示数据
        cleaned = blocks_of(card["id"])
        for block in cleaned:
            block.pop("comments", None)
        api(f"/api/world/cards/{card['id']}", "PUT", {"blocks": cleaned})

        browser.close()

    print("\n报错：", errors[:3] or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
