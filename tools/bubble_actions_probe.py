# -*- coding: utf-8 -*-
"""选区气泡的接班人验证：名字自动识别（以及浅色下的极简外观截图）。

0.5.2 的 P3 拆链把旧的选区气泡（``.fb-actions``，两个动作「创建卡片 / 链接卡片」）
整条下架了——正文改由 React + BlockNote 的编辑器孤岛渲染，选区上不再浮动作条。
它的接班人**不是**气泡，而是**自动名字识别**：正文里出现已有卡片名时，装饰层会把它
贴上 ``.mentions-inline`` 链接（点击跳转）。

所以这支探针现在改测：写一段含已有卡片名的正文 → 等孤岛取名字 → 确认名字成链接、
点得动；并如实记录选区气泡已下架。

    跑法（先起好 dev server）：

        .venv/bin/python tools/bubble_actions_probe.py
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


def para(bid, text):
    """一个段落块（BlockNote 原生 JSON 形状）。"""
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    cards = [d for d in docs if d["type"] == "card"]
    problems: list[str] = []
    removed: list[str] = []

    # 找一张有名字的卡当作被识别 / 跳转的目标
    named = [d for d in cards if (d.get("name") or "").strip()]
    if not named:
        print("没有可用的具名卡片，跳过")
        return 0
    target = named[0]

    # 用一张一次性的草稿卡，别去动演示世界里的内容（探针要能反复跑）
    card = api("/api/world/documents", "POST", {"type": "card", "name": "选区气泡探针草稿"})
    # 正文权威存储是 blocks_doc（旧的 {"blocks": ...} 已无效，且会把 blocks_doc 清空）
    api(f"/api/world/cards/{card['id']}", "PUT", {"blocks_doc": [
        para("b1", f"{target['name']} 的城门在夜里会发光，守夜人都记下来了。"),
        para("b2", "Isarra 曾经在这里停留过三天，然后往北去了。"),
        para("b3", "矿带的铁脉一直延伸到 Redwake Harbor。"),
    ]})

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("dialog", lambda dialog: dialog.accept())

        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2400)     # 等孤岛挂载 + autolink 往返

        # 1) 旧的选区气泡（.fb-actions）应已下架
        if page.query_selector(".fb-actions"):
            problems.append("旧的选区气泡（.fb-actions）不该还在")
        removed.append("选区气泡「创建卡片 / 链接卡片」（.fb-actions）："
                       "该功能已随 P3 拆链下架")

        # 2) 接班人：名字自动识别
        print("孤岛挂载:", isl.has_editor(page), "· 块数:", isl.block_count(page))
        found = isl.mentions(page)
        print(f"正文里的卡片名「{target['name']}」→ 识别出 {len(found)} 处：", found)
        if not any(m.get("target") for m in found):
            problems.append(f"正文里的卡片名「{target['name']}」没有被识别成链接")
        page.screenshot(path=str(SHOTS / "name_link.png"))

        # 3) 点击识别出的名字应跳到目标卡片（原「链接卡片」的接班人）
        if found:
            page.locator(isl.MENTION).first.click()
            page.wait_for_timeout(1200)
            hash_now = page.evaluate("() => location.hash")
            print("点名字后的 hash：", hash_now)
            if str(target["id"]) not in hash_now:
                problems.append(f"点名字没有跳到目标卡片（hash={hash_now!r}）")

        # 4) 浅色下的极简外观
        api("/api/world/world", "PUT", {"theme_config": {"mode": "light"}})
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2200)
        page.screenshot(path=str(SHOTS / "minimal_light.png"))
        api("/api/world/world", "PUT", {"theme_config": {"mode": "dark"}})

        browser.close()

    print("\n报错：", errors[:2] or "（无）")
    api(f"/api/world/documents/{card['id']}?hard=1", "DELETE")

    print("已下架：")
    for item in removed:
        print("  ·", item)
    print("问题：")
    if problems:
        for item in problems:
            print("  ✗", item)
        return 1
    print("  （无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
