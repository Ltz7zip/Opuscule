# -*- coding: utf-8 -*-
"""交互态截图：打开各类面板 / 浮层，逐个拍下来做视觉验收。

    .venv/bin/python tools/shots_ui.py
"""

from __future__ import annotations

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "worldbuilding_timeline.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.sessions.backends.db import SessionStore  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
OUT = ROOT / ".shots"
OUT.mkdir(exist_ok=True)


def session_key() -> str:
    user = get_user_model().objects.order_by("id").first()
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
    store["_auth_user_hash"] = user.get_session_auth_hash()
    store.create()
    return store.session_key


# 逐类文档视图：直接按文档 id 打开（比在侧栏里按标题找稳）
# id 对应的类型见 db 里的 world_document —— 每个 document_type 挑一个
VIEWS = [
    ("view-timeline", 160),
    ("view-graph", 162),
    ("view-table", 148),
    ("view-board", 149),
    ("view-canvas", 150),
    ("view-dict", 151),
    ("view-todo", 152),
    ("view-dice", 153),
    ("view-radar", 154),
    ("view-chapter", 155),
    ("view-embed", 156),
    ("view-soundscape", 157),
    ("view-media", 158),
]


def shot(page, name: str) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"✓ {name}")


def main() -> None:
    from playwright.sync_api import sync_playwright

    key = session_key()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000},
                                  device_scale_factor=2)
        ctx.add_cookies([{"name": "sessionid", "value": key,
                          "domain": "127.0.0.1", "path": "/"}])
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE + "/world", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)

        # —— 命令面板 ——
        page.click("#paletteBtn")
        page.wait_for_timeout(500)
        page.fill("#plInput", "新")
        page.wait_for_timeout(500)
        shot(page, "ui-palette")
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        # —— 主题 / 类型 / 纪元 / 回收站 四个模态框 ——
        for name, selector in [
            ("ui-modal-theme", "#themeBtn"),
            ("ui-modal-types", "#typesBtn"),
            ("ui-modal-eras", "#erasBtn"),
            ("ui-modal-trash", "#trashBtn"),
            ("ui-modal-exchange", "#exchangeBtn"),
            ("ui-modal-suggest", "#suggestBtn"),
        ]:
            try:
                page.click(selector, timeout=4000)
                page.wait_for_timeout(900)
                if not page.is_hidden("#modal"):
                    shot(page, name)
                    page.click("#mdClose")
                    page.wait_for_timeout(400)
            except Exception as exc:  # noqa: BLE001
                print(f"· 跳过 {name}: {str(exc)[:70]}")

        # —— 右键菜单 ——
        try:
            page.click(".sb-tree .row", button="right", timeout=4000)
            page.wait_for_timeout(500)
            shot(page, "ui-context-menu")
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
        except Exception as exc:  # noqa: BLE001
            print(f"· 跳过 ctx: {str(exc)[:70]}")

        # —— 逐类文档视图：直接调 openDoc(id) ——
        has_open = page.evaluate("() => typeof openDoc === 'function'")
        if not has_open:
            print("· openDoc 不是全局函数，跳过分类视图")
        for name, doc_id in VIEWS:
            if not has_open:
                break
            try:
                page.evaluate(f"() => openDoc({doc_id})")
                page.wait_for_timeout(1800)
                shot(page, name)
            except Exception as exc:  # noqa: BLE001
                print(f"· 跳过 {name}: {str(exc)[:70]}")

        print("JS 错误:", errors[:3] if errors else "无")
        browser.close()


if __name__ == "__main__":
    main()
