# -*- coding: utf-8 -*-
"""写操作守门人：登录 + 有编辑权限才放行。

放在中间件里统一拦，而不是给每个视图挂装饰器——写接口太多（卡片、事件、地图、
关系树、类型、导入…），漏一个就是一个洞。白名单见 permissions.OPEN_WRITE_PREFIXES。
"""

from __future__ import annotations

from django.http import JsonResponse

from . import permissions

PROTECTED_PREFIXES = (
    "/api/world/",     # 工作区自己的接口
    "/api/items",      # 经典时间线编辑器的写接口（工作区里嵌着它）
    "/api/view",
)
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class EditPermissionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in WRITE_METHODS:
            path = request.path
            protected = any(path.startswith(prefix) for prefix in PROTECTED_PREFIXES)
            open_write = any(path.startswith(prefix) for prefix in permissions.OPEN_WRITE_PREFIXES)
            if protected and not open_write:
                world = permissions.current_world_or_none()
                if not permissions.can_edit(request.user, world):
                    if not permissions.users_exist():
                        return JsonResponse({"error": "还没有账号，先完成初始化"}, status=403)
                    if not request.user or not request.user.is_authenticated:
                        return JsonResponse({"error": "请先登录再编辑", "need_login": True}, status=401)
                    return JsonResponse({"error": "你在这个世界里是只读权限"}, status=403)
        return self.get_response(request)
