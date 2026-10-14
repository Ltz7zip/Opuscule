# -*- coding: utf-8 -*-
"""动效 / 外观改版的逐屏截图工具。

跑法（先起好 dev server）：

    .venv/bin/python tools/polish_shots.py before
    .venv/bin/python tools/polish_shots.py after

产出：/tmp/polish_shots/<label>/*.png

它只负责「把界面拍下来」，不判断好坏；判断交给人和 before/after 对比。
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

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8010")
LABEL = sys.argv[1] if len(sys.argv) > 1 else "shot"
OUT = pathlib.Path("/tmp/polish_shots") / LABEL
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 1512, "height": 900}

# 演示库里活着、且有内容的文档：(id, 截图名)
DOCS = [
    (109, "02-card"),
    (115, "02d-timeline"),
    (117, "02f-map"),
    (160, "02e-graph"),
    (116, "02g-tree"),
]
SITE_SLUG = os.environ.get("WS_SITE_SLUG", "3b9edd")

# 巡检用的临时文档：库里这些类型的示例都在回收站，现场建几份，拍完就删
SCRATCH_TYPES = [
    ("table", "02b-table"),
    ("board", "02c-board"),
    ("radar", "02h-chart"),
    ("todo", "02i-todo"),
    ("dictionary", "02j-dictionary"),
]


class Api:
    """带登录 cookie 的小接口客户端（建 / 删临时文档用）。"""

    def __init__(self):
        self.opener = ensure_login(make_opener())

    def __call__(self, path: str, method: str = "GET", payload: dict | None = None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            f"{BASE}{path}", data=data, method=method,
            headers={"Content-Type": "application/json"} if data else {})
        with self.opener.open(request, timeout=25) as response:
            body = response.read()
            return json.loads(body) if body else {}


def make_scratch(api: Api) -> list[tuple[int, str]]:
    """建几张临时文档，返回 (id, 截图名) 供主流程使用。"""
    made = []
    for doc_type, shot_name in SCRATCH_TYPES:
        try:
            payload = {"type": doc_type, "name": f"外观巡检 · {doc_type}"}
            if doc_type == "card":
                payload["entity_type"] = None
            created = api("/api/world/documents", "POST", payload)
            made.append((created["id"], shot_name))
            print(f"  · 临时文档 {doc_type} #{created['id']}")
        except Exception as exc:                                  # noqa: BLE001
            print(f"  ! 建 {doc_type} 失败：{exc}")
    return made


def drop_scratch(api: Api, made: list[tuple[int, str]]):
    for doc_id, _ in made:
        try:
            api(f"/api/world/documents/{doc_id}", "DELETE")
        except Exception as exc:                                  # noqa: BLE001
            print(f"  ! 删 #{doc_id} 失败：{exc}")
    print(f"  · 已清理 {len(made)} 份临时文档")


def shot(page, name: str, full: bool = False):
    page.wait_for_timeout(450)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print(f"  ✓ {name}.png")


def main() -> int:
    api = Api()
    scratch = make_scratch(api)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=2,
                                  locale="zh-CN")
        page = ctx.new_page()
        ensure_login_page(page)

        # 深链打开各类文档（id 由 DB 决定，见 DOCS / SCRATCH_TYPES）。
        # 这些 id 指的是演示库里那几篇真文档——先确认它们还在（没被别的探针
        # 收进回收站），否则会安静地拍出一张"未找到该文档"的空图。
        print("· 工作区")
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(700)
        shot(page, "01-workspace")

        live = []
        for doc_id, name in DOCS:
            try:
                api(f"/api/world/documents/{doc_id}")
                live.append((doc_id, name))
            except Exception:                                      # noqa: BLE001
                print(f"  ! 文档 #{doc_id}（{name}）打不开——可能被收进回收站了，跳过。"
                      f"先跑 tools/clean_probe_docs.py 看看，或到回收站点「还原」")

        for doc_id, name in live + scratch:
            page.goto(f"{BASE}/world#doc={doc_id}", wait_until="networkidle")
            page.wait_for_timeout(1400)
            shot(page, name)
        drop_scratch(api, scratch)

        # 空状态：关掉所有标签
        for _ in range(8):
            close = page.query_selector(".tab .t-close")
            if not close:
                break
            close.click()
            page.wait_for_timeout(220)
        page.wait_for_timeout(500)
        shot(page, "03-empty")

        print("· 命令面板 / 模态框")
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(600)
        page.keyboard.press("Meta+k")
        page.wait_for_timeout(600)
        shot(page, "04-palette")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        for btn, name in (("#typesBtn", "05-modal-types"),
                          ("#erasBtn", "06-modal-eras"),
                          ("#suggestBtn", "07-modal-suggest"),
                          ("#exchangeBtn", "08-modal-exchange")):
            el = page.query_selector(btn)
            if not el:
                continue
            el.click()
            page.wait_for_timeout(700)
            if page.query_selector("#modal:not([hidden])"):
                shot(page, name)
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

        # 主题切换（浅 / 深）
        print("· 深色 / 浅色")
        page.evaluate("() => document.documentElement.setAttribute('data-theme','dark')")
        page.wait_for_timeout(500)
        shot(page, "09-dark-workspace")
        page.evaluate("() => document.documentElement.setAttribute('data-theme','light')")
        page.wait_for_timeout(500)
        shot(page, "09b-light-workspace")
        # 交还给世界主题：删掉强制值，后面的截图才反映真实主题
        page.evaluate("() => document.documentElement.removeAttribute('data-theme')")
        page.wait_for_timeout(300)

        print("· 关系树")
        page.goto(f"{BASE}/relationship", wait_until="networkidle")
        page.wait_for_timeout(1000)
        shot(page, "10-relationship")

        print("· 站点")
        page.goto(f"{BASE}/s/{SITE_SLUG}/", wait_until="networkidle")
        page.wait_for_timeout(700)
        shot(page, "11-site-home")
        first = page.query_selector(".site-card a, .sc-link, .card a")
        if first:
            first.click()
            page.wait_for_timeout(900)
            shot(page, "11b-site-page")
        page.goto(f"{BASE}/s/{SITE_SLUG}/search?q=Harrow", wait_until="networkidle")
        page.wait_for_timeout(700)
        shot(page, "11c-site-search")

        print("· 经典时间轴")
        page.goto(f"{BASE}/legacy", wait_until="networkidle")
        page.wait_for_timeout(1200)
        shot(page, "12-legacy")

        print("· 登录页（未登录上下文）")
        anon = browser.new_context(viewport=VIEWPORT, device_scale_factor=2, locale="zh-CN")
        anon_page = anon.new_page()
        anon_page.goto(f"{BASE}/login", wait_until="networkidle")
        anon_page.wait_for_timeout(600)
        anon_page.screenshot(path=str(OUT / "13-auth.png"))
        print("  ✓ 13-auth.png")
        anon.close()

        print("· 窄屏 1024 / 手机 390")
        page.set_viewport_size({"width": 1024, "height": 820})
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(800)
        shot(page, "14-narrow-1024")
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(800)
        shot(page, "15-mobile-390")

        browser.close()
    print(f"\n截图目录：{OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
