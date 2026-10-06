# -*- coding: utf-8 -*-
"""探针共用的登录助手。

加了「登录才能编辑」之后，所有会写数据的探针都得先有身份。
这里负责：没有账号就用首次注册流程建一个所有者，有就登录。
本地开发账号默认 owner / dev-password-1（README 里有说明，请自行改密码）。
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
DEV_USER = os.environ.get("WS_DEV_USER", "owner")
DEV_PASSWORD = os.environ.get("WS_DEV_PASSWORD", "dev-password-1")


def make_opener():
    """带 cookie 的 opener（匿名代理绕过本机系统代理）。"""
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPCookieProcessor(jar),
    )


def _post(opener, path: str, payload: dict | None = None, form: dict | None = None):
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        content_type = "application/x-www-form-urlencoded"
    else:
        data = json.dumps(payload or {}).encode()
        content_type = "application/json"
    request = urllib.request.Request(f"{BASE}{path}", data=data, method="POST",
                                     headers={"Content-Type": content_type})
    try:
        with opener.open(request, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def ensure_login(opener=None, *, username: str = DEV_USER, password: str = DEV_PASSWORD):
    """返回一个已登录的 opener；必要时先注册这个开发所有者。"""
    opener = opener or make_opener()
    status, _body = _post(opener, "/api/world/auth/login", {"username": username, "password": password})
    if status == 200:
        return opener

    # 没登录成功：要么没账号（首次注册），要么密码不对（换个用户名注册）
    me = json.loads(opener.open(f"{BASE}/api/world/auth/me", timeout=10).read())
    if me.get("needs_setup"):
        status, body = _post(opener, "/api/world/auth/register",
                             {"username": username, "password": password, "display_name": username})
        if status == 200:
            return opener
        raise RuntimeError(f"注册开发账号失败：{status} {body[:200]}")

    # 已经有人了：发个邀请码再注册一个探针专用账号
    raise RuntimeError(
        "这个数据库已经有账号了，但开发账号登录失败。"
        "请设置 WS_DEV_USER / WS_DEV_PASSWORD 环境变量，或在界面上发一个邀请码后手动注册。"
    )


def ensure_login_page(page, *, username: str = DEV_USER, password: str = DEV_PASSWORD):
    """Playwright 页面登录（把 cookie 落在浏览器上下文里）。"""
    ensure_login(username=username, password=password)      # 保证账号存在
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    if page.url.endswith("/register") or page.query_selector("#invite"):
        # 还没有账号：走注册
        page.goto(f"{BASE}/register", wait_until="domcontentloaded")
        page.fill("#username", username)
        page.fill("#password", password)
    else:
        page.fill("#username", username)
        page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_load_state("networkidle")
    return page
