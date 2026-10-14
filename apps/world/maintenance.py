# -*- coding: utf-8 -*-
"""维护模式（见 DESIGN.md）。

两件事：

1. ``maintenance_page``——维护页本身（``/maintenance``）。运维把反向代理指到
   这一页，或者本地直接打开看效果。
2. ``MaintenanceMiddleware``——把整个站点临时关掉。**只在环境变量
   ``OPUSCULE_MAINTENANCE=1`` 时生效**，所以测试与日常开发完全不受影响；
   静态资源、维护页自己和 Django 后台仍然放行，否则维护页会连样式都加载不出来。
"""

from __future__ import annotations

import os

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.views.decorators.http import require_safe


def allowed_prefixes() -> tuple[str, ...]:
    """维护期间仍然允许访问的前缀（静态资源、维护页、后台、上传文件）。

    后台前缀跟着 ``settings.ADMIN_URL_PATH`` 走：后台路径改成猜不到的一串之后，
    维护期间运维还得进得去，硬编码 ``/admin/`` 就会把人挡在门外。
    """
    return ("/static/", "/maintenance", f"/{settings.ADMIN_URL_PATH}/", "/media/")


def enabled() -> bool:
    return os.environ.get("OPUSCULE_MAINTENANCE") == "1"


@require_safe
def maintenance_page(request):
    """维护页：终端启动序列风格，逐行显示。"""
    return render(request, "maintenance.html", {
        "eta": os.environ.get("OPUSCULE_MAINTENANCE_ETA", "15 分钟后"),
    }, status=503)


class MaintenanceMiddleware:
    """开着维护开关时，除白名单外一律回维护页（503 + Retry-After）。"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if enabled() and not request.path.startswith(allowed_prefixes()):
            body = render_to_string("maintenance.html", {
                "eta": os.environ.get("OPUSCULE_MAINTENANCE_ETA", "15 分钟后"),
            }, request=request)
            response = HttpResponse(body, status=503, content_type="text/html; charset=utf-8")
            response["Retry-After"] = "900"
            return response
        return self.get_response(request)
