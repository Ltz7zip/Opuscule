# -*- coding: utf-8 -*-
"""块嵌套/嵌入 + 名称识别（原「模糊提及」）+ 快捷键自定义 + 无障碍播报 + 移动端的验证。

0.5.2 起正文由 React + BlockNote 的编辑器孤岛渲染，旧 vanilla 选择器
（``.block-text`` / ``.block-menu`` / ``.slash-pop`` / ``.format-bar`` / ``.block-tools``）
全部失效。所以这里统一改用 ``tools/_island.py`` 的助手取正文 DOM；正文写入一律走
``blocks_doc``（``blocks`` 已是服务端从 ``blocks_doc`` 派生的只读视图）。

    跑法（先起好 dev server）：

        .venv/bin/python tools/editor_probe.py
"""

from __future__ import annotations

import json
import os
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
opener = make_opener()
ensure_login(opener)


def api(path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=25) as r:
        return json.loads(r.read() or b"{}")


def flat(ns, out=None):
    out = out if out is not None else []
    for n in ns:
        out.append(n)
        flat(n.get("children") or [], out)
    return out


def para(bid, text):
    """一个段落块（BlockNote 原生 JSON 形状）。"""
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


def put_doc(card_id, doc):
    """写正文：权威存储是 blocks_doc（blocks 只读，写了也没用）。"""
    api(f"/api/world/cards/{card_id}", "PUT", {"blocks_doc": doc})


def get_card(card_id):
    return api(f"/api/world/cards/{card_id}")["card"]


problems = []
# 已随旧渲染链下架的功能：写进「问题」输出，明确标注，不硬凑断言。
removed = []

state = api("/api/world/state")
docs = flat(state["documents"])
cards = [d for d in docs if d["type"] == "card"]
# 优先挑遗留探针卡（名字以「未命名」开头），别动 Harrowdeep 这些正经卡片。
card = next((d for d in cards if (d["name"] or "").startswith("未命名")), cards[0])
other = next((d for d in cards if d["id"] != card["id"]), None)

orig_doc = get_card(card["id"])["blocks_doc"]
print("探针用卡片:", card["id"], repr(card["name"]), "· 原 blocks_doc 块数:", len(orig_doc or []))

try:
    # 先铺三个可控段落，探针才有块可以操作。
    put_doc(card["id"], [para("probe1", "探针块一"), para("probe2", "探针块二"),
                         para("probe3", "探针块三")])

    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        page = b.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        ensure_login_page(page)
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2200)
        print("孤岛挂载:", isl.has_editor(page), "· 块数:", isl.block_count(page),
              "· 类型:", isl.block_types(page), "· 文本:", isl.texts(page))

        # ---------- 1) 块嵌套：Tab 缩进 ----------
        isl.place_cursor(page, 1)
        page.wait_for_timeout(250)
        page.keyboard.press("Tab")
        page.wait_for_timeout(1400)
        doc_now = get_card(card["id"])["blocks_doc"]
        top_ids = [x.get("id") for x in doc_now]
        child_ids = [c.get("id") for x in doc_now for c in (x.get("children") or [])]
        nested_dom = page.locator(f"{isl.BLOCK} {isl.BLOCK}").count()
        print("Tab 后 blocks_doc：顶层", top_ids, "· 子块", child_ids, "· DOM 嵌套块", nested_dom)
        if "probe2" not in child_ids:
            problems.append("Tab 缩进没有把块嵌进上一块（blocks_doc 里没有 children）")
        if nested_dom < 1:
            problems.append("缩进没有渲染成嵌套块样式")
        page.screenshot(path=str(SHOTS / "nested_blocks.png"))

        # ---------- 斜杠菜单：首页菜单现在是斜杠菜单（旧块菜单里的插入入口搬到了这里）----------
        slash_ok = isl.open_slash_menu(page, 2)
        slash = isl.slash_items(page)
        print("斜杠菜单:", slash_ok, "· 条目", len(slash), ":", slash)
        if not slash_ok:
            problems.append("斜杠菜单打不开（侧菜单「添加块」没生效）")
        want_items = ("一级标题", "二级标题", "三级标题", "引用", "无序列表", "代码块",
                      "分隔线", "图片", "书签", "嵌入卡", "内联数据库")
        missing = [w for w in want_items if w not in slash]
        if missing:
            problems.append(f"斜杠菜单缺少 {'/'.join(missing)}")
        isl.close_menus(page)

        # ---------- 块菜单：只剩「删除」「颜色」----------
        menu_ok = isl.open_block_menu(page, 0)
        menu = isl.block_menu_items(page)
        joined = " ".join(menu)
        print("块菜单:", menu_ok, "· 条目:", menu)
        if not menu_ok:
            problems.append("块菜单打不开（侧菜单「打开菜单」没生效）")
        for want_label in ("删除", "颜色"):
            if want_label not in joined:
                problems.append(f"块菜单缺少「{want_label}」")
        removed.append("旧块菜单项（缩进一层 / 折叠这一块 / 复制这一块 / 嵌入一张卡片 / "
                       "插入图片）：该功能已随旧渲染链下架，现块菜单只剩「删除」「颜色」")
        isl.close_menus(page)

        # 侧菜单只有两个按钮（没有旧键盘拖拽手柄）——顺便验证现状
        isl.hover_block(page, 0)
        side_labels = page.eval_on_selector_all(
            f"{isl.SIDE_MENU} button", "els => els.map(e => e.getAttribute('aria-label'))")
        print("侧菜单按钮 aria-label：", side_labels)
        for need in ("添加块", "打开菜单"):
            if need not in side_labels:
                problems.append(f"侧菜单缺少「{need}」按钮")
        removed.append("键盘拖拽块（空格拾起 → 方向键 → 空格放下）及其移动播报："
                       "该功能已随旧渲染链下架（孤岛侧菜单没有拖拽手柄）")

        # ---------- 嵌入卡 / 图片重块：由 blocks_doc 的 card / image 块驱动渲染 ----------
        doc_now = [x for x in get_card(card["id"])["blocks_doc"]
                   if x.get("type") not in ("card", "image")]
        doc_now.append({"id": "probe-card", "type": "card",
                        "props": {"document": other["id"] if other else 0}, "children": []})
        doc_now.append({"id": "probe-img", "type": "image",
                        "props": {"url": "https://example.com/x.png", "caption": "参考图"},
                        "children": []})
        put_doc(card["id"], doc_now)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2200)
        embed = page.locator(".opus-heavy-card .embed-card").count()
        imgb = page.locator(".opus-heavy-image .block-image").count()
        print("重块渲染：嵌入卡", embed, "· 图片块", imgb)
        if embed < 1 or imgb < 1:
            problems.append("嵌入卡或图片重块没有渲染")
        page.screenshot(path=str(SHOTS / "embed_blocks.png"))

        # ---------- 2) 名称识别（原「模糊提及」）----------
        put_doc(card["id"], [para("probe-mention", "他们在 Harrowdeep 落脚")])
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2400)   # 等孤岛就绪 + autolink 往返
        found = isl.mentions(page)
        print("名称自动识别：", found)
        if not any(m.get("target") for m in found):
            problems.append("正文里的已有卡片名（Harrowdeep）没有被识别成链接")
        # 旧的 @ 模糊候选下拉（.mention-pop）在孤岛里没有对应物：孤岛只注册了 `/` 斜杠菜单，
        # 名称识别改由装饰层（.mentions-inline）承担，不再有「打错也给候选」的弹层。
        if page.locator(".mention-pop").count() > 0:
            problems.append("旧的 @ 模糊候选下拉不该还在")
        removed.append("「@」模糊提及候选下拉（打错名字给候选）：该功能已随旧渲染链下架；"
                       "现在只有自动名称识别（装饰层 .mentions-inline）")
        page.screenshot(path=str(SHOTS / "fuzzy_mention.png"))

        # ---------- 3) 快捷键自定义（vanilla 顶栏/对话框，未受孤岛影响）----------
        page.mouse.click(1200, 320)
        page.wait_for_timeout(300)
        page.keyboard.press("Meta+/")
        page.wait_for_timeout(800)
        page.click("text=自定义快捷键…")
        page.wait_for_timeout(800)
        rows2 = page.locator(".shortcut-list .shortcut-row").count()
        print("快捷键设置行数：", rows2)
        if rows2 < 5:
            problems.append("快捷键设置没有列出条目")
        page.locator(".shortcut-list .shortcut-row button", has_text="改").first.click()
        page.wait_for_timeout(300)
        page.keyboard.down("Control")
        page.keyboard.down("Shift")
        page.keyboard.press("KeyJ")
        page.keyboard.up("Shift")
        page.keyboard.up("Control")
        page.wait_for_timeout(700)
        stored = page.evaluate("() => localStorage.getItem('ws:keymap')")
        print("自定义键位已存：", (stored or "")[:80])
        if not stored or "j" not in stored:
            problems.append("自定义快捷键没存下来")
        page.screenshot(path=str(SHOTS / "shortcut_editor.png"))
        page.evaluate("() => localStorage.removeItem('ws:keymap')")

        # ---------- 4) 无障碍播报：撤销仍会念给屏幕阅读器 ----------
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        page.mouse.click(1200, 320)
        page.wait_for_timeout(300)
        isl.place_cursor(page, 0)
        page.wait_for_timeout(200)
        page.keyboard.type("追加", delay=40)
        page.wait_for_timeout(1700)     # 等孤岛防抖保存（450ms）+ recordAction 入栈
        print("撤销按钮可用：", not page.locator("#undoBtn").is_disabled())
        page.locator("#undoBtn").click()
        page.wait_for_timeout(600)
        said = page.locator("#srStatus").inner_text()
        print("播报内容：", repr(said))
        if "撤销" not in said:
            problems.append("撤销没有播报给屏幕阅读器")

        # ---------- 5) 移动端 ----------
        phone = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        ensure_login_page(phone)
        phone.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        phone.wait_for_timeout(2000)
        nav = phone.locator(".bottom-nav").count()
        visible = phone.evaluate(
            "() => { const n = document.querySelector('.bottom-nav'); "
            "return n ? getComputedStyle(n).display : 'none'; }")
        manifest = phone.evaluate("() => !!document.querySelector('link[rel=manifest]')")
        print(f"移动端底部导航：{nav} 个 · display={visible} · manifest={manifest}")
        if nav != 1 or visible == "none":
            problems.append("移动端底部导航没有显示")
        if not manifest:
            problems.append("缺少 PWA manifest")
        phone.locator(".bottom-nav button", has_text="搜索").click()
        phone.wait_for_timeout(800)
        print("底部导航「搜索」打开面板：", phone.locator("#palette:not([hidden])").count() > 0)
        phone.screenshot(path=str(SHOTS / "mobile_nav.png"))
        b.close()

    print("报错：", errs[:2] or "（无）")
    print("问题：")
    if problems:
        for item in problems:
            print("  ✗", item)
    else:
        print("  （无）")
    for item in removed:
        print("  ·", item, "（该功能已随旧渲染链下架）")
finally:
    put_doc(card["id"], orig_doc)
    print("已还原卡片正文 →", card["id"], "（块数", len(orig_doc or []), "）")
