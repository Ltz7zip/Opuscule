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


def ensure_login_page(page, *, username: str = DEV_USER, password: str = DEV_PASSWORD,
                      navigate: bool = True):
    """让一个 Playwright 页面处于登录态。

    **不用表单登录**，直接造一个 Django 会话塞进浏览器 cookie —— 和
    ``tools/shots.py`` 的办法一样（那边也是这么绕开密码的）：

      * ``_auth.ensure_login()`` 的 cookie 在 urllib 的 CookieJar 里，
        Playwright 的浏览器上下文看不到，两者不共享；
      * 想省掉这一步、改在页面里敲用户名口令的话，注意 ``page.add_cookies``
        只在 ``BrowserContext`` 上有（``Browser.new_page()`` 拿不到），
        而且不要在 Playwright 的事件回调里同步发 urllib 请求。

    ``navigate=False`` 时只塞 cookie、不打开页面——需要"第一次进入"这种
    时机敏感的探针（启动屏、首屏骨架）自己 ``page.goto()``。
    """
    import os
    import sys
    from pathlib import Path

    root = str(Path(__file__).resolve().parent.parent)
    if root not in sys.path:
        sys.path.insert(0, root)                 # 让 Django 找得到 settings 模块
    os.chdir(root)

    import django
    from django.apps import apps as django_apps

    if not os.environ.get("DJANGO_SETTINGS_MODULE"):
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "worldbuilding_timeline.settings")
    # Playwright 的同步 API 底下跑着 asyncio 事件循环，Django 默认会拦下 ORM 调用
    # （SynchronousOnlyOperation）。这里是探针脚本的单线程短查询，显式放行。
    os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "1")
    if not django_apps.ready:
        django.setup()

    from django.contrib.auth import get_user_model
    from django.contrib.sessions.backends.db import SessionStore

    # 账号只要在库里，就直接造会话——**不要**再打一次登录接口。这里用不到
    # HTTP 登录发的那个 cookie（见上文），而 ``ensure_login_page`` 在探针里有
    # 几十处调用，每处都登录会把 ``login-ip`` 限流（30 次 / 300s）烧光，一支
    # 脚本就能打爆它。只有账号还不存在（首次注册）时才需要 HTTP 那条路建号。
    user = get_user_model().objects.filter(username=username).first()
    if user is None:
        ensure_login(username=username, password=password)
        user = get_user_model().objects.filter(username=username).first()
    if user is None:
        raise RuntimeError(f"账号 {username!r} 不存在")

    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
    store["_auth_user_hash"] = user.get_session_auth_hash()
    store.create()

    host = BASE.split("//", 1)[1].split(":", 1)[0]
    context = page.context
    context.add_cookies([{
        "name": "sessionid", "value": store.session_key, "domain": host, "path": "/",
    }])
    if navigate:
        page.goto(f"{BASE}/world", wait_until="domcontentloaded")
    return page
