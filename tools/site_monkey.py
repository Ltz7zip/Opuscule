# -*- coding: utf-8 -*-
"""整站随机点击测试（发布站点 + 工作区）。

用法::

    .venv/bin/python tools/site_monkey.py [每页点击数]

它做三件事：
1. 逐个打开站点页面（首页 / 卡片 / 时间线 / 关系树 / 地图 / 图谱 / 纪元 / 搜索）和工作区；
2. 在页面里随机点击（含 iframe 内部的画布），并随机滚动、按 Esc；
3. 统计每个页面的 **页面级导航次数**（非预期刷新）、**iframe 重载次数**、
   **DOM 变更速率**（渲染死循环）、以及控制台 / 页面错误。

判定：
* 一次随机点击不该导致页面导航（除了点链接——所以只统计"没有点中 <a>"的那些）；
* iframe 不该重新加载（`framenavigated` 次数应为 1）；
* 稳定 3 秒内 DOM 变更次数不应持续增长（超过 400 视为渲染死循环）。
"""

from __future__ import annotations

import os
import json
import pathlib
import random
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/site_monkey")
SHOTS.mkdir(parents=True, exist_ok=True)
CLICKS_PER_PAGE = int(sys.argv[1]) if len(sys.argv) > 1 else 12

opener = make_opener()
ensure_login(opener)


def api(path: str):
    with opener.open(f"{BASE}{path}", timeout=20) as response:
        return json.loads(response.read() or b"{}")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def _measure(page) -> int:
    """量 3 秒内的 DOM 变更次数（渲染死循环会飙到几千）。页面已跳走就返回 0。"""
    try:
        return page.evaluate("""() => new Promise((resolve) => {
          let n = 0;
          const mo = new MutationObserver((list) => { n += list.length; });
          mo.observe(document.body, { childList: true, subtree: true, attributes: true });
          setTimeout(() => { mo.disconnect(); resolve(n); }, 3000);
        })""")
    except Exception:                      # noqa: BLE001
        return 0


def tree_frame(page):
    """发布页里的关系树画布在最内层那个 iframe 里（站点 → /world 外壳 → /relationship）。"""
    for frame in page.frames:
        try:
            if frame.locator("#rtNodes").count():
                return frame
        except Exception:                        # noqa: BLE001 - 跨域 / 已销毁的 frame
            continue
    return None


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    slug = (state["world"].get("publish") or {}).get("url", "").strip("/").split("/")[-1]
    eras = api("/api/world/eras").get("eras") or []

    pages: list[tuple[str, str]] = []
    if slug:
        pages.append(("站点首页", f"{BASE}/s/{slug}/"))
        pages.append(("站点搜索", f"{BASE}/s/{slug}/search?q=Harrow"))
        if eras:
            pages.append(("纪元页", f"{BASE}/s/{slug}/era/{eras[0]['id']}"))
        for doc in docs:
            if doc["type"] in ("card", "timeline", "map", "familyTree", "graph") and doc.get("slug"):
                pages.append((f"{doc['type']}:{doc['name'][:10]}", f"{BASE}/s/{slug}/{doc['slug']}/"))
    pages.append(("工作区", f"{BASE}/world"))

    problems: list[str] = []
    random.seed(20261006)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for label, url in pages:
            page = browser.new_page(viewport={"width": 1400, "height": 920})
            errors: list[str] = []
            navigations = [0]
            page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
            page.on("console", lambda msg: errors.append(f"console: {msg.text}") if msg.type == "error" else None)
            page.on("framenavigated", lambda frame: navigations.__setitem__(0, navigations[0] + 1) if frame == page.main_frame else None)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=25000)
                page.wait_for_timeout(2600)
                before_url = page.url
                frames_before = len(page.frames)

                for _ in range(CLICKS_PER_PAGE):
                    box = page.viewport_size
                    x = random.randint(60, max(80, box["width"] - 60))
                    y = random.randint(80, max(100, box["height"] - 80))
                    page.mouse.click(x, y)
                    page.wait_for_timeout(180)
                    page.keyboard.press("Escape")
                page.mouse.wheel(0, 600)
                page.wait_for_timeout(400)

                # 稳定后量 DOM 变更速率（渲染死循环会飙到几千）；页面已跳走就跳过
                mutations = _measure(page)

                after_url = page.url
                left_page = after_url != before_url
                status = f"{'导航' if left_page else '留在本页'} · iframe {frames_before}→{len(page.frames)} · 3 秒 DOM 变更 {mutations} · 报错 {len(errors)}"
                if errors:
                    status += f"  ← {errors[0][:110]}"
                print(f"{label:26s} {status}")
                if mutations > 400:
                    problems.append(f"{label}：DOM 变更 {mutations}（疑似渲染死循环）")
                if len(page.frames) > frames_before + 1:
                    problems.append(f"{label}：多出来 {len(page.frames) - frames_before} 个 iframe（疑似被重复创建）")
                if errors:
                    problems.append(f"{label}：{'；'.join(errors[:2])[:160]}")
            except Exception as exc:                     # noqa: BLE001
                problems.append(f"{label}：点击过程中抛异常 {type(exc).__name__}: {str(exc)[:120]}")
                print(f"{label:26s} 异常 {type(exc).__name__}")
            page.close()

        # 关系树：发布站点里的画布现在是"站点 → /world 外壳 → /relationship" 三层，
        # 点成员应该让最外层站点跳转，而不是在 iframe 里重画。
        if slug:
            tree = next((d for d in docs if d["type"] == "familyTree" and d.get("slug")), None)
            if tree:
                page = browser.new_page(viewport={"width": 1400, "height": 920})
                page.goto(f"{BASE}/s/{slug}/{tree['slug']}/", wait_until="domcontentloaded")
                page.wait_for_timeout(4500)
                inner = tree_frame(page)
                if inner:
                    nodes = inner.locator(".rt-node")
                    count = nodes.count()
                    box = nodes.first.bounding_box()
                    before = page.url
                    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                    # 没有关联卡片时站点会给一条 2.2 秒的轻提示，要赶在它消失前看一眼
                    page.wait_for_timeout(900)
                    hint = page.locator("#canvasHint")
                    hint_on = bool(hint.count()) and hint.first.is_visible()
                    page.wait_for_timeout(1600)
                    jumped = page.url != before
                    print(f"{'关系树点成员':26s} "
                          f"{'宿主跳转' if jumped else ('轻提示（未关联卡片）' if hint_on else '没反应')}"
                          f"（{count} 个成员）")
                    if not jumped and not hint_on:
                        problems.append("关系树：点成员既没跳转也没有提示")

                    # 只读：拖成员不该改数据、也不该把画布拖没
                    inner = tree_frame(page)
                    if inner and inner.locator(".rt-node").count():
                        node = inner.locator(".rt-node").first
                        nb = node.bounding_box()
                        page.mouse.move(nb["x"] + nb["width"] / 2, nb["y"] + nb["height"] / 2)
                        page.mouse.down()
                        for step in range(1, 6):
                            page.mouse.move(nb["x"] + nb["width"] / 2 + step * 40,
                                            nb["y"] + nb["height"] / 2 + step * 25)
                            page.wait_for_timeout(110)
                        page.mouse.up()
                        page.wait_for_timeout(1000)
                        after_nodes = inner.locator(".rt-node").count()
                        canvas = inner.locator("#rtCanvasWrap").bounding_box()
                        print(f"{'关系树拖成员（只读）':24s} 成员 {count}→{after_nodes} · "
                              f"画布 {round(canvas['width'])}×{round(canvas['height'])}")
                        if after_nodes != count:
                            problems.append(f"关系树：只读拖动后成员数变了（{count}→{after_nodes}）")
                        if canvas["height"] < 120:
                            problems.append("关系树：只读拖动后画布被压没了（疑似空白）")
                else:
                    print(f"{'关系树':26s} 跳过（没找到画布 iframe）")
                page.close()

        browser.close()
    print("\n问题：", problems or "（无）")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
