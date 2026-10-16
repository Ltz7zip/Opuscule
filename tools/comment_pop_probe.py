# -*- coding: utf-8 -*-
"""评论巡检：块评论浮层已下架，改测仍在的「页面级评论」。

0.5.2 的 P3 拆链把旧的**块评论浮层**（``.comment-pop`` / ``.comment-list`` /
``.comment-row`` / ``.comment-input``，以及它的入口块工具条 ``.block-tools``）
整条下架了——正文改由 React + BlockNote 的编辑器孤岛渲染，块旁边不再挂「评论」小按钮。

还在的评论是**页面级评论**：标题上方 ``.page-actions`` 里的「添加评论」按钮展开
``.page-comments``（一串 ``.pc-row`` + 撰写条 ``.pc-input`` / ``.pc-send``）。

所以这支探针现在改测：卡片能加一条页面评论、评论行渲染出来、撰写条留在视口内；
并如实记录块评论浮层已下架。

    跑法（先起好 dev server）：

        .venv/bin/python tools/comment_pop_probe.py
        WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/comment_pop_probe.py

产出：/tmp/card_shots/page-comments.png 与终端报告。
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

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/card_shots")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()
ensure_login(opener)

# 页面级评论条的高度上限（别长成一大块挡正文）。宽度不再用固定像素卡——重设计后
# 卡片正文是**铺满编辑区**的（见 card_layout_probe 的 ≥94% 铺满断言），评论条跟着正文列
# 同宽才对；改成"不该比正文列还宽"的相对约束（正文列量不到时才退回这个兜底值）。
MAX_W = float(os.environ.get("WS_PC_MAX_W", "900"))
MAX_H = float(os.environ.get("WS_PC_MAX_H", "260"))


def api(path: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=20) as response:
        return json.loads(response.read() or b"{}")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def para(bid, text):
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


MEASURE = r"""
() => {
  const box = document.querySelector('.page-comments');
  if (!box) return null;
  const px = (n) => Math.round(n * 10) / 10;
  const r = box.getBoundingClientRect();
  const input = box.querySelector('.pc-input');
  const ir = input ? input.getBoundingClientRect() : null;
  const view = document.querySelector('.card-view');
  const vr = view ? view.getBoundingClientRect() : null;
  return {
    hidden: box.hidden,
    w: px(r.width), h: px(r.height), top: px(r.top), bottom: px(r.bottom),
    viewW: vr ? px(vr.width) : null,
    rows: box.querySelectorAll('.pc-row').length,
    texts: [...box.querySelectorAll('.pc-text')].map((e) => e.textContent),
    inputInside: ir ? (ir.top >= -1 && ir.bottom <= window.innerHeight + 1) : false,
    vh: window.innerHeight,
    inside: r.top >= -1 && r.bottom <= window.innerHeight + 1
            && r.left >= -1 && r.right <= window.innerWidth + 1,
  };
}
"""


def over_wide(m: dict) -> str | None:
    """评论条不该比正文列还宽（量不到正文列时退回固定兜底值 MAX_W）。"""
    if m.get("viewW"):
        if m["w"] > m["viewW"] + 1:
            return f"评论区宽 {m['w']}px 比正文列（{m['viewW']}px）还宽"
        return None
    if m["w"] > MAX_W:
        return f"评论区宽 {m['w']}px 超预算 {MAX_W:.0f}px"
    return None


def main() -> int:
    problems: list[str] = []
    removed: list[str] = []

    # 一次性草稿卡，别去动演示世界里的内容（探针要能反复跑）
    card = api("/api/world/documents", "POST", {"type": "card", "name": "评论巡检探针草稿"})
    api(f"/api/world/cards/{card['id']}", "PUT", {
        "blocks_doc": [para("b1", "第一段正文。"), para("b2", "第二段正文。")],
        "comments": [],
    })

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        ensure_login_page(page)
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2000)

        # 1) 旧的块评论浮层 / 块工具条应已下架
        if page.locator(".comment-pop").count():
            problems.append("旧的块评论浮层（.comment-pop）不该还在")
        if page.locator(".comment-tools, .block-tools").count():
            problems.append("旧的块工具条（.block-tools）不该还在")
        removed.append("块评论浮层（.comment-pop / .comment-list / .comment-row）及其入口"
                       "块工具条（.block-tools）：该功能已随 P3 拆链下架")

        # 2) 页面级评论：点「添加评论」展开，撰写条应在视口内
        page.locator(".page-action", has_text="添加评论").first.click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / "page-comments-empty.png"))
        empty = page.evaluate(MEASURE)
        if not empty:
            problems.append("页面评论区没打开")
            print("  ⚠ 页面评论区没打开")
        else:
            if empty["hidden"]:
                problems.append("点了「添加评论」但评论区仍是隐藏的")
            print(f"  空态 {empty['w']}×{empty['h']}（正文列 {empty['viewW']} · 高预算 ≤{MAX_H:.0f}）")
            wide = over_wide(empty)
            if wide:
                problems.append(wide)
            if empty["h"] > MAX_H:
                problems.append(f"空态高 {empty['h']}px 超预算 {MAX_H:.0f}px")
            if not empty["inside"]:
                problems.append(f"评论区跑出视口 top={empty['top']} bottom={empty['bottom']}")
            if not empty["inputInside"]:
                problems.append("评论输入的撰写条不在视口内")

        # 3) 发一条评论，评论行应真的渲染出来
        page.fill(".page-comments .pc-input", "这条来源要补一下——出自《The Balr Accords》第三节。")
        page.click(".page-comments .pc-send")
        page.wait_for_timeout(1600)     # 等保存 + renderPanels 重建
        full = page.evaluate(MEASURE)
        page.screenshot(path=str(SHOTS / "page-comments.png"))
        if not full:
            problems.append("发评论后评论区不见了")
        else:
            print(f"  发评论后：{full['rows']} 行 · {full['w']}×{full['h']} · 文案 {full['texts']}")
            if full["rows"] < 1:
                problems.append("评论没渲染出行（.pc-row 为 0）")
            if not any("Balr Accords" in t for t in full["texts"]):
                problems.append("评论正文没写进去")
            wide = over_wide(full)
            if wide:
                problems.append(wide)
            if full["h"] > MAX_H:
                problems.append(f"有评论时评论区高 {full['h']}px 超预算 {MAX_H:.0f}px")

        # 4) 删掉这条评论（顺带验证删除链），保持探针可反复跑
        if page.locator(".page-comments .pc-del").count():
            page.locator(".page-comments .pc-del").first.click()
            page.wait_for_timeout(1400)
            left = page.locator(".page-comments .pc-row").count()
            print(f"  删除后剩余评论行：{left}")
            if left:
                problems.append("删除评论没生效")

        if errors:
            problems.append(f"控制台报错：{errors[:2]}")
        browser.close()

    api(f"/api/world/documents/{card['id']}?hard=1", "DELETE")

    print(f"  截图 → {SHOTS}/page-comments*.png")
    print("已下架：")
    for item in removed:
        print("  ·", item)
    print("\n================ 报告 ================")
    if problems:
        for item in problems:
            print(f"  ✗ {item}")
        return 1
    print("  ✓ 页面级评论可加可删，撰写条留在视口内；块评论浮层已如实标注下架")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
