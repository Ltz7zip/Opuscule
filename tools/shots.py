# -*- coding: utf-8 -*-
"""截图工具：给设计层改动做视觉验收。

用法：
    .venv/bin/python tools/shots.py            # 全部页面
    .venv/bin/python tools/shots.py workspace  # 只拍某几个（子串匹配）

输出到 .shots/ 下。工作区页需要登录，这里直接用 Django 会话框架造一个
session 塞进 Playwright 的 cookie，不依赖密码。
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
OUT = pathlib.Path(__file__).resolve().parent.parent / ".shots"
OUT.mkdir(exist_ok=True)

WORLD_SLUG = "3b9edd"

# (名字, 路径, 是否需要登录, 视口宽, 视口高)
PAGES = [
    ("login", "/login", False, 1440, 900),
    ("register", "/register", False, 1440, 900),
    ("site-home", f"/s/{WORLD_SLUG}/", False, 1440, 1000),
    ("site-search", f"/s/{WORLD_SLUG}/search?q=Harrowdeep", False, 1440, 900),
    ("site-page", f"/s/{WORLD_SLUG}/harrowdeep/", False, 1440, 1000),
    ("site-era", f"/s/{WORLD_SLUG}/era/47", False, 1440, 1000),
    ("workspace", "/world", True, 1600, 1000),
    ("relationship", "/relationship", True, 1600, 1000),
    ("legacy", "/legacy", True, 1600, 1000),
]


def session_cookie() -> tuple[str, str]:
    user = get_user_model().objects.order_by("id").first()
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
    store["_auth_user_hash"] = user.get_session_auth_hash()
    store.create()
    return "sessionid", store.session_key


def main() -> None:
    wanted = sys.argv[1:]
    from playwright.sync_api import sync_playwright

    key, value = session_cookie()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        for name, path, need_auth, width, height in PAGES:
            if wanted and not any(w in name for w in wanted):
                continue
            ctx = browser.new_context(viewport={"width": width, "height": height},
                                      device_scale_factor=2)
            if need_auth:
                ctx.add_cookies([{
                    "name": key, "value": value, "domain": "127.0.0.1", "path": "/",
                }])
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(BASE + path, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(700)
            target = OUT / f"{name}.png"
            page.screenshot(path=str(target))
            print(f"✓ {name:16s} {path:40s} -> {target.name}"
                  + (f"  JS错误: {errors[:2]}" if errors else ""))
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
