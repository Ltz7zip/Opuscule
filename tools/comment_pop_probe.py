# -*- coding: utf-8 -*-
"""块评论浮层巡检：它只是一张"贴在块旁边的小便签"，不许长成一大块挡正文。

跑法（先起好 dev server）：

    .venv/bin/python tools/comment_pop_probe.py
    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/comment_pop_probe.py

产出：/tmp/card_shots/comment-pop*.png 与终端报告。
退出码非 0 表示浮层超预算，或它跑出了视口。

量三件事：
  1. **空态**（刚点开、还没有评论）的宽高；
  2. **有内容**（浮层里塞两条评论）的高度——超过上限就该靠列表滚动，而不是继续长高；
  3. 贴在**最后一块**（页面底部）时，浮层要不要翻到块上方才不会掉出视口。

注：第 2 条用注入 DOM 的方式造两条评论行，只量版式，不往库里写评论
（真发表评论的那条链路由 tools/editing_probe.py 覆盖）。
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

# 预算：写死的数字就是"太大"的判据（320×164 那一版就是被这几条挡下来的）
MAX_W = float(os.environ.get("WS_POP_MAX_W", "280"))
MAX_EMPTY_H = float(os.environ.get("WS_POP_MAX_EMPTY_H", "140"))
MAX_FULL_H = float(os.environ.get("WS_POP_MAX_FULL_H", "320"))
MAX_LIST_H = float(os.environ.get("WS_POP_MAX_LIST_H", "200"))


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


MEASURE = r"""
() => {
  const pop = document.querySelector('.comment-pop');
  if (!pop) return null;
  const px = (n) => Math.round(n * 10) / 10;
  const r = pop.getBoundingClientRect();
  const inner = (sel) => {
    const el = pop.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: px(b.width), h: px(b.height), maxH: cs.maxHeight };
  };
  return {
    w: px(r.width), h: px(r.height), top: px(r.top), bottom: px(r.bottom),
    list: inner('.comment-list'), input: inner('.comment-input'),
    rows: pop.querySelectorAll('.comment-row').length,
    vh: window.innerHeight,
    inside: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
  };
}
"""

# 造两条评论量版式（纯 DOM，不落库）
INJECT_ROWS = r"""
() => {
  const list = document.querySelector('.comment-list');
  if (!list) return false;
  list.innerHTML = '';
  const make = (who, when, text, resolved) => {
    const row = document.createElement('div');
    row.className = 'comment-row' + (resolved ? ' is-resolved' : '');
    row.innerHTML = `<div class="comment-meta"><b>${who}</b><span class="hint">${when}</span></div>`
      + `<div class="comment-text">${text}</div>`
      + `<div class="comment-actions"><button class="mini-btn is-small">${resolved ? '重新打开' : '标记解决'}</button>`
      + `<button class="mini-btn is-small is-danger">删除</button></div>`;
    return row;
  };
  list.appendChild(make('我', '2026-10-07 03:40', '这条来源要补一下——出自《The Balr Accords》第三节。', false));
  list.appendChild(make('owner', '2026-10-07 03:41', '已补。', true));
  return true;
}
"""


def open_popover(page, *, last: bool) -> None:
    if last:
        page.evaluate("() => document.querySelector('.panel-body').scrollTo(0, 99999)")
        page.wait_for_timeout(400)
    blocks = page.locator(".card-view .block")
    target = blocks.nth(blocks.count() - 1 if last else 0)
    target.hover()
    page.wait_for_timeout(250)
    target.locator(".block-tools button[title*='评论']").click()
    page.wait_for_timeout(450)


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    card = next((d for d in docs if d["type"] == "card"), docs[0])

    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        ensure_login_page(page)
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1800)

        # 1) 空态
        open_popover(page, last=False)
        page.screenshot(path=str(SHOTS / "comment-pop-empty.png"))
        empty = page.evaluate(MEASURE)
        if not empty:
            problems.append("浮层没打开")
            print("  ⚠ 浮层没打开")
        else:
            print(f"  空态 {empty['w']}×{empty['h']}（预算 ≤{MAX_W:.0f}×{MAX_EMPTY_H:.0f}）")
            if empty["w"] > MAX_W:
                problems.append(f"浮层宽 {empty['w']}px 超预算 {MAX_W:.0f}px")
            if empty["h"] > MAX_EMPTY_H:
                problems.append(f"空态高 {empty['h']}px 超预算 {MAX_EMPTY_H:.0f}px")
            if not empty["inside"]:
                problems.append(f"空态浮层跑出视口 top={empty['top']} bottom={empty['bottom']}")

            # 2) 有两条评论时：靠列表滚动，别继续长高
            if page.evaluate(INJECT_ROWS):
                page.wait_for_timeout(200)
                page.screenshot(path=str(SHOTS / "comment-pop-rows.png"))
                full = page.evaluate(MEASURE)
                print(f"  两条评论 {full['w']}×{full['h']} · 列表 {full['list']['h']}（max-height {full['list']['maxH']}）")
                if full["h"] > MAX_FULL_H:
                    problems.append(f"有评论时浮层高 {full['h']}px 超预算 {MAX_FULL_H:.0f}px")
                if full["list"]["h"] > MAX_LIST_H:
                    problems.append(f"评论列表高 {full['list']['h']}px 超预算 {MAX_LIST_H:.0f}px")

        # 3) 贴底的块：浮层必须翻到上方（或至少整块留在视口内）
        #    收掉浮层用 Esc —— 别用固定坐标点空白：卡片头部有"＋ 属性"这类按钮，
        #    盲点会误开"类型与属性"弹窗，把后面的 hover 全挡住（探针自己踩过这个坑）。
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        if page.locator(".comment-pop").count():
            problems.append("Esc 没能收掉块评论浮层")
        open_popover(page, last=True)
        page.screenshot(path=str(SHOTS / "comment-pop-bottom.png"))
        bottom = page.evaluate(MEASURE)
        if bottom:
            print(f"  贴底块 {bottom['w']}×{bottom['h']} · top {bottom['top']} bottom {bottom['bottom']} / 视口 {bottom['vh']}")
            if not bottom["inside"]:
                problems.append(f"贴底时浮层跑出视口 top={bottom['top']} bottom={bottom['bottom']} 视口高 {bottom['vh']}")

        if errors:
            problems.append(f"控制台报错：{errors[:2]}")
        browser.close()

    print(f"  截图 → {SHOTS}/comment-pop-*.png")
    print("\n================ 报告 ================")
    if problems:
        for item in problems:
            print(f"  ✗ {item}")
        return 1
    print("  ✓ 评论浮层是一张小便签：空态够小、有评论靠滚动、贴底不越界")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
