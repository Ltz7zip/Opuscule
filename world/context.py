# -*- coding: utf-8 -*-
"""模板上下文：给静态资源带上版本号。

Django 的 ``static`` 在开发模式下只发 ``Last-Modified``，浏览器会**启发式缓存**
（通常十分钟到几小时不等），于是"改了 JS 但用户还看到旧行为"。
这里把静态目录里最新的修改时间算成一个短版本号，模板里 ``?v=`` 一带，
文件一改 URL 就变，浏览器必然会重新拉。
"""

from __future__ import annotations

import functools
import pathlib

from django.conf import settings


@functools.lru_cache(maxsize=1)
def _stamp() -> str:
    """取 static 目录下最新修改时间（秒），缓存住，避免每个请求都扫盘。"""
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
    return str(newest or 1)


def static_version(request) -> dict:
    return {"static_version": _stamp()}
