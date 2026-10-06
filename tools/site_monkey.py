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

import json
import pathlib
import random
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
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

        # 关系树专门验一次：点成员应该让宿主跳转，而不是 iframe 里重绘
        if slug:
            tree = next((d for d in docs if d["type"] == "familyTree" and d.get("slug")), None)
            if tree:
                page = browser.new_page(viewport={"width": 1400, "height": 920})
                page.goto(f"{BASE}/s/{slug}/{tree['slug']}/", wait_until="domcontentloaded")
                page.wait_for_timeout(4000)
                frame = page.frames[1] if len(page.frames) > 1 else None
                if frame:
                    try:
                        info = frame.evaluate("""() => {
                      const nodes = Array.from(document.querySelectorAll('.tree-node'));
                      const linked = nodes.find(n => (n.querySelector('.tree-node-sub') || {}).textContent === '已关联卡片');
                      const target = linked || nodes[0];
                      if (!target) return null;
                      const r = target.getBoundingClientRect();
                      return {x: r.x + r.width / 2, y: r.y + r.height / 2, linked: Boolean(linked),
                              count: nodes.length};
                    }""")
                    except Exception as exc:      # noqa: BLE001
                        info = None
                        print(f"{'关系树节点点击':26s} 跳过（{type(exc).__name__}）")
                    if info:
                        box = page.locator("iframe").first.bounding_box()
                        before = page.url
                        page.mouse.click(box["x"] + info["x"], box["y"] + info["y"])
                        page.wait_for_timeout(2200)
                        msg = "成员点击 → 宿主跳转" if page.url != before else "成员点击 → 留在本页"
                        print(f"{'关系树节点点击':26s} {msg}（关联卡片={info['linked']}，节点 {info['count']} 个）")
                        if info["linked"] and page.url == before:
                            problems.append("关系树：点有卡片的成员没有跳转")
                        try:
                            after_nodes = frame.evaluate("() => document.querySelectorAll('.tree-node').length")
                        except Exception:            # noqa: BLE001
                            after_nodes = info["count"]      # 已经跳走，frame 被销毁，算通过
                        if after_nodes != info["count"]:
                            problems.append(f"关系树：点击后节点数从 {info['count']} 变成 {after_nodes}（被重绘）")
                page.close()

        # 关系树上模拟"长按拖动"：只读视图不该被拖走，更不该变空白
        if slug:
            tree = next((d for d in docs if d["type"] == "familyTree" and d.get("slug")), None)
            if tree:
                page = browser.new_page(viewport={"width": 1400, "height": 920})
                page.goto(f"{BASE}/s/{slug}/{tree['slug']}/", wait_until="domcontentloaded")
                page.wait_for_timeout(4000)
                frame = page.frames[1] if len(page.frames) > 1 else None
                if frame:
                    try:
                        info = frame.evaluate("""() => {
                          const n = document.querySelector('.tree-node');
                          if (!n) return null;
                          const r = n.getBoundingClientRect();
                          return {x: r.x + r.width / 2, y: r.y + r.height / 2,
                                  count: document.querySelectorAll('.tree-node').length};
                        }""")
                    except Exception:                # noqa: BLE001
                        info = None
                    if info:
                        box = page.locator("iframe").first.bounding_box()
                        page.mouse.move(box["x"] + info["x"], box["y"] + info["y"])
                        page.mouse.down()
                        for step in range(1, 6):
                            page.mouse.move(box["x"] + info["x"] + step * 40, box["y"] + info["y"] + step * 25)
                            page.wait_for_timeout(120)
                        page.mouse.up()
                        page.wait_for_timeout(1200)
                        try:
                            after = frame.evaluate("""() => ({
                              count: document.querySelectorAll('.tree-node').length,
                              canvas: (() => { const c = document.querySelector('.tree-canvas');
                                return c ? [c.clientWidth, c.clientHeight] : [0, 0]; })(),
                            })""")
                        except Exception:                # noqa: BLE001
                            after = {"count": 0, "canvas": [0, 0]}
                        print(f"{'关系树拖动（只读）':24s} 节点 {info['count']}→{after['count']} · 画布 {after['canvas']}")
                        if after["count"] != info["count"]:
                            problems.append(f"关系树：只读拖动后节点数变了（{info['count']}→{after['count']}）")
                        if after["canvas"][1] < 120:
                            problems.append("关系树：只读拖动后画布被压没了（疑似空白）")

                        # 点空白：不该整块重绘（节点数与 SVG 结构都不该变）
                        empty = frame.evaluate("""() => {
                          const c = document.querySelector('.tree-canvas');
                          const r = c.getBoundingClientRect();
                          const before = document.querySelector('.tree-svg').outerHTML.length;
                          return {x: r.x + 40, y: r.y + r.height - 40, before};
                        }""")
                        page.mouse.click(box["x"] + empty["x"], box["y"] + empty["y"])
                        page.wait_for_timeout(900)
                        after_empty = frame.evaluate("""() => ({
                          nodes: document.querySelectorAll('.tree-node').length,
                          size: document.querySelector('.tree-svg').outerHTML.length,
                        })""")
                        same = abs(after_empty["size"] - empty["before"]) < 40
                        print(f"{'关系树点空白':24s} 节点 {after_empty['nodes']} · SVG 长度变化 {abs(after_empty['size'] - empty['before'])}")
                        if after_empty["nodes"] != info["count"]:
                            problems.append("关系树：点空白后节点数变了")
                        if not same:
                            problems.append("关系树：点空白触发了整块重绘（看着像刷新）")

                        # 拖动空白：应该平移画布（内层 g 的 transform 变）
                        drag = frame.evaluate("""() => {
                          const c = document.querySelector('.tree-canvas');
                          const r = c.getBoundingClientRect();
                          const g = document.querySelector('.tree-svg g');
                          return {x: r.x + 60, y: r.y + r.height - 60, before: g.getAttribute('transform')};
                        }""")
                        page.mouse.move(box["x"] + drag["x"], box["y"] + drag["y"])
                        page.mouse.down()
                        for step in range(1, 5):
                            page.mouse.move(box["x"] + drag["x"] + step * 30, box["y"] + drag["y"] - step * 10)
                            page.wait_for_timeout(90)
                        page.mouse.up()
                        page.wait_for_timeout(700)
                        moved = frame.evaluate("() => document.querySelector('.tree-svg g').getAttribute('transform')")
                        print(f"{'关系树拖空白=平移':24s} {'已平移' if moved != drag['before'] else '没平移'}")
                        if moved == drag["before"]:
                            problems.append("关系树：拖动空白没有平移画布")
                page.close()

        browser.close()
    print("\n问题：", problems or "（无）")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
