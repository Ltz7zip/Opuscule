# -*- coding: utf-8 -*-
"""验证这一轮修掉的体验死角：回收站、文件夹、世界设置、地图底图比例。

    .venv/bin/python tools/ux_fixes_probe.py
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
    # 先把回收站清空，免得"文件夹里唯一的孩子正好在回收站里"造成假象
    for trashed in api("/api/world/trash")["documents"]:
        api(f"/api/world/documents/{trashed['id']}/restore", "POST")

    state = api("/api/world/state")
    docs = flatten(state["documents"])
    # 挑一个真的有子项的文件夹来验
    folder = None
    for node in docs:
        if node["type"] == "folder" and (node.get("children") or []):
            folder = node
            break
    folder = folder or next((d for d in docs if d["type"] == "folder"), None)
    map_doc = next((d for d in docs if d["type"] == "map"), None)
    print(f"文件夹：{folder['name'] if folder else '（无）'} / 地图：{map_doc['name'] if map_doc else '（无）'}")

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

        # 1) 文件夹：应列出子项而不是"工具没实现"
        if folder:
            page.goto(f"{BASE}/world#doc={folder['id']}", wait_until="networkidle")
            page.wait_for_timeout(600)
            rows = page.query_selector_all(".folder-row")
            text = page.inner_text(".card-view")
            print(f"文件夹页列出 {len(rows)} 个子项；含占位文案：{'工具的界面还没实现' in text}")
            if "工具的界面还没实现" in text:
                problems.append("文件夹还在显示占位页")
            if not rows:
                problems.append("文件夹没有列出子项")
            page.screenshot(path=str(SHOTS / "folder.png"))

        # 2) 世界名牌 -> 世界设置
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(500)
        page.click("#worldChip")
        page.wait_for_timeout(600)
        modal = page.query_selector("#modal:not([hidden])")
        title = page.inner_text("#mdTitle") if modal else ""
        print("世界名牌点击 -> 弹窗：", title or "（无）")
        if title != "世界设置":
            problems.append("世界名牌没有打开世界设置")
        else:
            # 改个简介试试保存
            page.fill("#mdBody .mini-input >> nth=1", "由自动点测写入的简介")
            page.click("text=保存")
            page.wait_for_timeout(800)
            world = api("/api/world/world")
            print("保存后世界的 description：", world["description"])
            if world["description"] != "由自动点测写入的简介":
                problems.append("世界设置没有保存成功")
            page.screenshot(path=str(SHOTS / "world_dialog.png"))

        # 3) 回收站：删一个 -> 出现在回收站 -> 恢复
        victim = next((d for d in docs if d["type"] == "card"), None)
        if victim:
            api(f"/api/world/documents/{victim['id']}", "DELETE")
            page.goto(f"{BASE}/world", wait_until="networkidle")
            page.wait_for_timeout(500)
            page.click("#trashBtn")
            page.wait_for_timeout(800)
            rows = page.query_selector_all(".trash-row")
            print(f"回收站里列出 {len(rows)} 行")
            if not rows:
                problems.append("回收站仍然是空的")
            page.screenshot(path=str(SHOTS / "trash.png"))
            if rows:
                before_count = api("/api/world/trash")["count"]
                # 精确点第一行的「恢复」，并等接口真的回来
                with page.expect_response(lambda r: "/restore" in r.url and r.status == 200,
                                          timeout=8000):
                    page.click(".trash-row button.mini-btn.is-primary")
                page.wait_for_timeout(600)
                print(f"回收站 {before_count} -> {api('/api/world/trash')['count']}")
                trash = api("/api/world/trash")
                print("恢复后回收站数量：", trash["count"])
                if trash["count"] != before_count - 1:
                    problems.append(f"恢复没有生效（{before_count} -> {trash['count']}）")

        # 4) 地图底图比例：纸的高度应该跟着图片走
        if map_doc:
            page.goto(f"{BASE}/world#doc={map_doc['id']}", wait_until="networkidle")
            page.wait_for_timeout(1200)
            size = page.evaluate("""() => {
                const paper = document.querySelector('.map-paper');
                if (!paper) return null;
                const rect = paper.getBoundingClientRect();
                return { w: Math.round(rect.width), h: Math.round(rect.height) };
            }""")
            print("地图纸尺寸：", size)
            if size and abs(size["w"] / size["h"] - 1280 / 800) < 0.02:
                print("（当前底图正好是 16:10，比例无法区分——这条只验证代码路径没报错）")
            page.screenshot(path=str(SHOTS / "map_ratio.png"))

        browser.close()

    print("\n报错：", errors or "（无）")
    print("问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
