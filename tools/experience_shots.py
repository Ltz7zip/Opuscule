# -*- coding: utf-8 -*-
"""体验层逐屏截图（设计验收用，不做判断）。

    .venv/bin/python tools/experience_shots.py            # 全部
    .venv/bin/python tools/experience_shots.py splash     # 只拍名字里带 splash 的

产出：.shots/xp-*.png（.shots/ 不入库）
"""

from __future__ import annotations

import os
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login_page  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8010")
SITE_SLUG = os.environ.get("WS_SITE_SLUG", "3b9edd")
OUT = pathlib.Path(__file__).resolve().parent.parent / ".shots"
OUT.mkdir(exist_ok=True)
WANTED = sys.argv[1:]


def wanted(name: str) -> bool:
    return not WANTED or any(item in name for item in WANTED)


def shoot(page, name: str) -> None:
    target = OUT / f"xp-{name}.png"
    page.screenshot(path=str(target))
    print(f"✓ {name:16s} -> {target.name}")


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)

        # 启动屏：必须是这个上下文的第一次进入
        if wanted("splash"):
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page, navigate=False)
            page.goto(f"{BASE}/world", wait_until="domcontentloaded")
            page.wait_for_timeout(300)   # 标记画完（约 370ms 内）再拍
            shoot(page, "splash")
            ctx.close()

        # 工作区：骨架屏（接口掐住）
        if wanted("skeleton"):
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page, navigate=False)
            page.route("**/api/world/state*", lambda route: route.abort())
            page.goto(f"{BASE}/world", wait_until="domcontentloaded")
            page.wait_for_timeout(800)
            shoot(page, "skeleton")
            ctx.close()

        # 工作区：通知中心 / 三级 Toast / 离线徽标
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        page = ctx.new_page()
        ensure_login_page(page)
        page.wait_for_timeout(900)
        if wanted("notice"):
            page.evaluate("() => document.querySelector('#noticeBtn').click()")
            page.wait_for_timeout(900)
            shoot(page, "notice")
            page.keyboard.press("Escape")
        if wanted("toast"):
            page.evaluate("""() => {
              window.toast('已删除「Harrowdeep 的城门」', {kind: 'ok', action: () => {}, actionLabel: '撤销'});
              window.toast('这一步没能撤销', {kind: 'warn'});
              window.toast('保存失败，请检查网络连接', {kind: 'err'});
            }""")
            page.wait_for_timeout(600)
            shoot(page, "toast")
        if wanted("offline"):
            ctx.set_offline(True)
            page.evaluate("() => window.dispatchEvent(new Event('offline'))")
            page.wait_for_timeout(500)
            shoot(page, "offline")
            ctx.set_offline(False)
        if wanted("tip"):
            # 属性名旁的「?」提示要在开了卡片的面板里才看得到
            page.goto(f"{BASE}/world#doc=109", wait_until="networkidle")
            page.wait_for_timeout(1500)
            page.evaluate("""() => {
              const kind = document.querySelector('.k-kind');
              if (kind) kind.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
            }""")
            page.wait_for_timeout(500)
            shoot(page, "tip")
        ctx.close()

        # 只读站点：404（已移除的文档）/ 首页入场
        if wanted("missing") or wanted("404"):
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="zh-CN")
            page = ctx.new_page()
            page.goto(f"{BASE}/s/{SITE_SLUG}/no-such-doc-xyz/", wait_until="networkidle")
            page.wait_for_timeout(500)
            shoot(page, "missing")
            ctx.close()

        if wanted("maint"):
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="zh-CN")
            page = ctx.new_page()
            page.goto(f"{BASE}/maintenance", wait_until="networkidle")
            page.wait_for_timeout(1200)
            shoot(page, "maint")
            ctx.close()

        if wanted("site"):
            ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            page.goto(f"{BASE}/s/{SITE_SLUG}/", wait_until="networkidle")
            page.wait_for_timeout(1000)
            shoot(page, "site-home")
            page.goto(f"{BASE}/s/{SITE_SLUG}/isarra-thornveil/", wait_until="networkidle")
            page.wait_for_timeout(900)
            shoot(page, "site-toc")
            page.goto(f"{BASE}/s/{SITE_SLUG}/search?q=Harrow", wait_until="networkidle")
            page.wait_for_timeout(700)
            shoot(page, "site-search")
            ctx.close()

        # 工作区：双击文档树 -> 右侧并排打开
        if wanted("beside"):
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page)
            page.wait_for_timeout(1000)
            page.evaluate("""() => {
              // 挑一个"不是当前打开的那一份"，并排起来才看得出是两份
              const rows = [...document.querySelectorAll('#sbTree .row')];
              const row = rows.find((r) => !r.classList.contains('is-active')) || rows[0];
              row.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, clientX: 140, clientY: 320}));
            }""")
            page.wait_for_timeout(1500)
            shoot(page, "beside")
            ctx.close()

        # 关系树：骨架与缩小减负
        if wanted("rt") or wanted("lod"):
            ctx = browser.new_context(viewport={"width": 1400, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page, navigate=False)
            page.route("**/api/world/relationship/templates*", lambda route: route.abort())
            page.goto(f"{BASE}/relationship", wait_until="domcontentloaded")
            page.wait_for_timeout(900)
            shoot(page, "rt-skeleton")
            ctx.close()

        if wanted("rt") or wanted("lod"):
            ctx = browser.new_context(viewport={"width": 1400, "height": 900}, locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page, navigate=False)
            page.goto(f"{BASE}/relationship?doc=116", wait_until="domcontentloaded")
            page.wait_for_timeout(1800)
            page.evaluate("""() => {
              const wrap = document.querySelector('#rtCanvasWrap');
              const rect = wrap.getBoundingClientRect();
              for (let i = 0; i < 16; i += 1) {
                wrap.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: 120,
                  clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2}));
              }
            }""")
            page.wait_for_timeout(600)
            shoot(page, "rt-lod")
            ctx.close()

        # 独立错误页（DEBUG=0 才会真的走 handler404，这里直接把模板拉出来看）
        if wanted("error"):
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="zh-CN")
            page = ctx.new_page()
            page.goto(f"{BASE}/maintenance", wait_until="domcontentloaded")
            page.set_content(f"""
              <link rel="stylesheet" href="{BASE}/static/terminal.css">
              <link rel="stylesheet" href="{BASE}/static/experience.css">
              <body class="xp-standalone"><main class="xp-standalone-box">
                <p class="miss-kicker">404 · 信号丢失</p>
                <h1 class="glitch miss-code" data-text="404">404</h1>
                <p class="xp-standalone-sub">这个地址上没有东西。<br>链接可能抄错了一个字，也可能这一页被挪走了。</p>
                <div class="xp-empty-acts"><a class="te-btn" href="/">回到工作区</a></div>
              </main></body>""")
            page.wait_for_timeout(600)
            shoot(page, "error")
            ctx.close()

        browser.close()
        _ = time  # 保持 import 一致（截图脚本将来可能要等更久）


if __name__ == "__main__":
    main()
