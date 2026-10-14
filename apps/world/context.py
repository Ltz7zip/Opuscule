# -*- coding: utf-8 -*-
"""模板上下文：给静态资源带上版本号。

Django 的 ``static`` 在开发模式下只发 ``Last-Modified``，浏览器会**启发式缓存**
（通常十分钟到几小时不等），于是"改了 JS 但用户还看到旧行为"。
这里把静态目录里最新的修改时间算成一个短版本号，模板里 ``?v=`` 一带，
文件一改 URL 就变，浏览器必然会重新拉。
"""

from __future__ import annotations

import pathlib
import time

from django.conf import settings


_STAMP_TTL = 2.0                       # 秒
_stamp_cache: list = [0.0, "1"]        # [算出来的时刻, 版本号]


def _stamp() -> str:
    """取 static 目录下最新修改时间（秒）。

    **不能**用 ``lru_cache``：那个缓存的寿命是整个进程，而开发服务器一开就是
    几小时 —— 改完 JS 版本号还是旧值，``?v=`` 不变，浏览器就一直用缓存里那份
    旧代码。"明明改了却没反应"十有八九是这一条（实测：服务器发的是 6.8 小时前
    的版本号，静态文件早换过好几轮了）。

    改成 2 秒的短缓存：既不会每个请求都扫盘，改完文件两秒内 URL 就换了。

    返回值取**所有**静态文件里最新的修改时间，而不是某一个 —— 只盯一个文件的话，
    改别的文件时版本号不动，同样会漏。
    """
    now = time.monotonic()
    if now - _stamp_cache[0] < _STAMP_TTL:
        return _stamp_cache[1]

    newest = 0
    roots = [pathlib.Path(item) for item in getattr(settings, "STATICFILES_DIRS", [])]
    app_static = pathlib.Path(settings.BASE_DIR) / "timeline" / "static"
    roots.append(app_static)
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in (".js", ".css", ".webmanifest", ".svg"):
                try:
                    newest = max(newest, int(path.stat().st_mtime))
                except OSError:
                    continue
    _stamp_cache[0] = now
    _stamp_cache[1] = str(newest or 1)
    return _stamp_cache[1]


def static_version(request) -> dict:
    """静态版本号 + 要不要注册 Service Worker。

    SW 默认只在**非 DEBUG**（也就是真的部署出去）时注册：开发机上开着它，
    探针看到的就可能不是刚改的代码，护栏会变得不可信。要试就显式加 ``?sw=1``，
    不想用就 ``?nosw=1``。
    """
    from django.conf import settings as django_settings

    enabled = bool(getattr(django_settings, "SW_ENABLED", not django_settings.DEBUG))
    query = request.GET if request is not None else {}
    if query.get("sw") in ("1", "true", "yes"):
        enabled = True
    if query.get("nosw") in ("1", "true", "yes"):
        enabled = False
    return {"static_version": _stamp(), "sw_enabled": enabled}


def app_version(request) -> dict:
    """把程序版本信息塞进模板上下文（页脚用）。

    版本号的唯一来源是 ``settings.APP_VERSION`` + ``APP_CHANNEL``，派生见
    ``world.version.app_info``；模板里用 ``app.display`` / ``app.version_string``
    等取值，别再在模板里拼版本号。
    """
    from apps.world import version

    return {"app": version.app_info()}
