# -*- coding: utf-8 -*-
"""请求级的世界作用域 + 读 / 写守门人。

* ``ActiveWorldMiddleware``：每个请求进来先解析"当前世界"（会话选定 → 自己的第一个
  世界 → 兜底），写进 contextvar，请求结束复位。全站 ``current_world()`` 都读它，
  所以多世界不需要改那 87 处调用。
* ``ReadPermissionMiddleware``：读 ``/api/world/*`` 要登录 + 是那个世界的成员；
  只给"发布站点的只读嵌入"开一个口子（游客带 ``?embed=<已发布文档>``）。
* ``EditPermissionMiddleware``：登录 + 有编辑权限才放行写操作。两者都放在世界作用域
  之后，才对着"正确的那一个世界"判权限。守门逻辑见 ``permissions``。
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
READ_METHODS = {"GET", "HEAD"}
#: 读守门人守哪些路径：工作区自己的接口 + 经典时间轴的全量数据接口。
#: ``/api/items``、``/api/view`` 是纯写接口（GET 一律 405），所以只用写守门人管；
#: ``/api/timeline`` 是读接口，漏在读守门外头过——它返回的是全场共用的那份时间轴
#: 数据，匿名访客能整份读走（2026-10-15 体检 F2），所以收进来一起要求登录。
READ_PROTECTED_PREFIXES = ("/api/world/", "/api/timeline")


class ActiveWorldMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        world = permissions.resolve_active_world(request)
        token = permissions.set_active_world(world)
        try:
            return self.get_response(request)
        finally:
            permissions.reset_active_world(token)


class ReadPermissionMiddleware:
    """读守门人：``/api/world/`` 与 ``/api/timeline`` 下的 GET/HEAD 要登录且在那个世界里。

    例外只有一处——发布站点的只读嵌入：游客带着 ``?embed=<已发布文档>`` 能读那一篇
    （见 ``permissions.allow_public_read``），其余一律拦下。未登录回 401（带
    ``need_login``，前端据此弹登录），已登录但不在这个世界回 403。
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in READ_METHODS and request.path.startswith(READ_PROTECTED_PREFIXES):
            world = permissions.current_world_or_none()
            if not permissions.can_read(request.user, world) and not permissions.allow_public_read(request):
                if not request.user or not request.user.is_authenticated:
                    return JsonResponse({"error": "请先登录", "need_login": True}, status=401)
                return JsonResponse({"error": "你不在这个世界里"}, status=403)
        return self.get_response(request)


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
