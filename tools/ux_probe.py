# -*- coding: utf-8 -*-
"""用 Playwright 站在用户角度点一遍工作区，收集报错与体验问题。

跑法（先起好 dev server）：

    .venv/bin/python tools/ux_probe.py

产出：/tmp/ux_report.md —— 每一步的动作、控制台报错、失败请求、耗时与观察。
"""

from __future__ import annotations

import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
REPORT = pathlib.Path("/tmp/ux_report.md")
SHOTS = pathlib.Path("/tmp/ux_shots")
SHOTS.mkdir(exist_ok=True)

issues: list[str] = []
steps: list[str] = []


def note(text: str) -> None:
    steps.append(text)
    print("  ·", text)


def main() -> int:
    # 本机系统代理会拦截 127.0.0.1 的 urllib 请求（curl 不受影响），这里显式绕过
    import urllib.request

    opener = make_opener()   # 带 cookie jar，登录态才留得住
    ensure_login(opener)
    world = json.loads(opener.open(f"{BASE}/api/world/state", timeout=10).read())
    docs = []

    def walk(nodes):
        for node in nodes:
            docs.append(node)
            walk(node.get("children") or [])

    walk(world["documents"])
    by_type = {}
    for doc in docs:
        by_type.setdefault(doc["type"], doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        ensure_login_page(page)
        console_errors: list[str] = []
        page_errors: list[str] = []
        failed: list[str] = []
        page.on("console", lambda msg: console_errors.append(f"{msg.type}: {msg.text}")
                if msg.type in ("error", "warning") else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))
        page.on("requestfailed", lambda req: failed.append(f"{req.method} {req.url} {req.failure}"))
        page.on("response", lambda res: failed.append(f"HTTP {res.status} {res.url}")
                if res.status >= 400 else None)

        # 1) 打开工作区
        t0 = time.time()
        page.goto(f"{BASE}/world", wait_until="networkidle")
        note(f"打开 /w 耗时 {time.time() - t0:.2f}s")

        # 2) 依次打开每种类型的文档
        for doc_type, doc in sorted(by_type.items()):
            before = len(page_errors) + len(console_errors) + len(failed)
            page.goto(f"{BASE}/world#doc={doc['id']}", wait_until="networkidle")
            page.wait_for_timeout(500)
            page.screenshot(path=str(SHOTS / f"doc_{doc_type}.png"))
            after = len(page_errors) + len(console_errors) + len(failed)
            note(f"打开文档 {doc['name']}（{doc_type}）→ 新增报错 {after - before}")

        # 3) 卡片：点属性、加区块、@ 提及
        card = by_type.get("card")
        if card:
            page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
            page.wait_for_timeout(400)
            # 点「＋ 文本」加一个区块
            try:
                page.click("text=＋ 文本", timeout=3000)
                page.wait_for_timeout(700)
                note("点「＋ 文本」加区块：成功")
            except Exception as exc:  # noqa: BLE001
                issues.append(f"加区块失败：{exc}")
                note(f"点「＋ 文本」加区块：失败 {exc}")
            # 在新区块里输入 @ 看看提及选择器
            try:
                blocks = page.query_selector_all(".block-text")
                if blocks:
                    target = blocks[-1]
                    target.click()
                    target.type("@Ha", delay=80)
                    page.wait_for_timeout(800)
                    popup = page.query_selector(".mention-pop")
                    note(f"输入「@Ha」后提及浮层：{'出现' if popup else '没出现'}")
                    if popup:
                        page.screenshot(path=str(SHOTS / "mention.png"))
                    page.keyboard.press("Escape")
            except Exception as exc:  # noqa: BLE001
                issues.append(f"@ 提及失败：{exc}")
            # 属性输入
            try:
                page.fill(".prop-input >> nth=0", "测试值")
                page.keyboard.press("Tab")
                page.wait_for_timeout(500)
                note("属性输入并失焦：成功")
            except Exception as exc:  # noqa: BLE001
                note(f"属性输入失败（可能该类型没有文本属性）：{exc}")

        # 4) 时间线：点空白处、滚动、点工具条
        timeline = by_type.get("timeline")
        if timeline:
            page.goto(f"{BASE}/world#doc={timeline['id']}", wait_until="networkidle")
            page.wait_for_timeout(500)
            try:
                canvas = page.query_selector(".tl-canvas, iframe")
                box = canvas.bounding_box() if canvas else None
                if box:
                    page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
                    page.wait_for_timeout(800)
                    note("时间线画布中央点击：已执行（会新建事件）")
                    page.screenshot(path=str(SHOTS / "timeline_click.png"))
            except Exception as exc:  # noqa: BLE001
                issues.append(f"时间线点击失败：{exc}")

        # 5) 侧栏：搜索、右键菜单、拖拽
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(400)
        try:
            page.fill("#sbSearch", "Har")
            page.wait_for_timeout(400)
            rows = page.query_selector_all("#sbTree .row")
            note(f"侧栏搜索「Har」命中 {len(rows)} 行")
            page.fill("#sbSearch", "")
            page.wait_for_timeout(300)
        except Exception as exc:  # noqa: BLE001
            issues.append(f"侧栏搜索失败：{exc}")

        try:
            row = page.query_selector("#sbTree .row")
            row.click(button="right")
            page.wait_for_timeout(300)
            menu = page.query_selector("#ctxMenu:not([hidden])")
            note(f"侧栏右键菜单：{'出现' if menu else '没出现'}")
            page.screenshot(path=str(SHOTS / "ctx.png"))
            page.keyboard.press("Escape")
        except Exception as exc:  # noqa: BLE001
            issues.append(f"右键菜单失败：{exc}")

        # 6) ⌘K 命令面板
        try:
            page.keyboard.press("Meta+k")
            page.wait_for_timeout(400)
            visible = page.query_selector("#palette:not([hidden])")
            note(f"⌘K 命令面板：{'出现' if visible else '没出现'}")
            if visible:
                page.fill("#plInput", "地图")
                page.wait_for_timeout(500)
                count = len(page.query_selector_all("#plList .pl-item"))
                note(f"⌘K 搜索「地图」命中 {count} 条")
                page.screenshot(path=str(SHOTS / "palette.png"))
            page.keyboard.press("Escape")
        except Exception as exc:  # noqa: BLE001
            issues.append(f"命令面板失败：{exc}")

        # 7) 顶栏每个按钮点一遍
        for label, selector in [("类型", "#typesBtn"), ("纪元", "#erasBtn"), ("主题", "#themeBtn"),
                                ("回收站", "#trashBtn"), ("维基", "text=维基")]:
            try:
                page.click(selector, timeout=3000)
                page.wait_for_timeout(600)
                modal = page.query_selector("#modal:not([hidden])")
                note(f"顶栏「{label}」：{'弹窗出现' if modal else '没有弹窗'}")
                page.keyboard.press("Escape")
                page.wait_for_timeout(200)
            except Exception as exc:  # noqa: BLE001
                issues.append(f"顶栏「{label}」点击失败：{exc}")
                note(f"顶栏「{label}」：失败 {exc}")

        # 8) 经典时间线页面（对照）
        try:
            page.goto(f"{BASE}/world", wait_until="networkidle")
            page.wait_for_timeout(800)
            note("经典时间线 /：已打开")
            page.screenshot(path=str(SHOTS / "classic.png"))
        except Exception as exc:  # noqa: BLE001
            issues.append(f"经典时间线打开失败：{exc}")

        browser.close()

        report = ["# 工作区 UX 自动点测报告", ""]
        report += ["## 步骤", ""] + [f"- {s}" for s in steps]
        report += ["", "## 控制台 error / warning", ""]
        report += [f"- {m}" for m in dict.fromkeys(console_errors)] or ["- （无）"]
        report += ["", "## 页面未捕获异常", ""]
        report += [f"- {m}" for m in dict.fromkeys(page_errors)] or ["- （无）"]
        report += ["", "## 失败 / 4xx 请求", ""]
        report += [f"- {m}" for m in dict.fromkeys(failed)] or ["- （无）"]
        report += ["", "## 汇总的问题", ""]
        report += [f"- {m}" for m in issues] or ["- （无）"]
        REPORT.write_text("\n".join(report))
        print(f"\n报告写入 {REPORT}")
        print(f"控制台问题 {len(set(console_errors))} 条 / 未捕获异常 {len(set(page_errors))} 条 / 失败请求 {len(set(failed))} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
