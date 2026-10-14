# -*- coding: utf-8 -*-
"""平台治理：任命 / 撤销管理员（仅站长）。

（原 ``world/views.py`` 的「平台治理」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .. import permissions
from ..normalize import as_int

from .accounts import _display_name, _log_moderation_event, _user_payload
from .common import current_world, error, json_response, parse_json


def _moderator_payload(user, *, is_self: bool = False) -> dict:
    """管理员名单里的一行。平台身份只读，不在这里改。"""
    return {
        **_user_payload(user),
        "display_name": _display_name(user),
        "platform_role": permissions.platform_role_of(user),
        "is_moderator": permissions.is_moderator(user),
        "is_superuser": user.is_superuser,
        "is_self": is_self,
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def moderator_collection(request):
    """管理员名单 / 任命管理员——仅站长（``is_privileged``）。

    · GET  列出当前所有管理员；
    · POST ``{"user_id": <id>}`` 把某个用户任命为管理员（写进 moderators 组）。
    """
    if not permissions.is_privileged(request.user):
        return json_response({"error": "只有站长能管理管理员"}, status=403)

    if request.method == "GET":
        viewer = permissions.viewer_payload(request.user, current_world())
        rows = [
            _moderator_payload(user, is_self=(user.pk == request.user.pk))
            for user in permissions.moderators()
        ]
        return json_response({"moderators": rows, "viewer": viewer})

    from django.contrib.auth import get_user_model

    user_id = as_int(parse_json(request).get("user_id"))
    target = get_user_model().objects.filter(pk=user_id).first() if user_id else None
    if target is None:
        return json_response({"error": "用户不存在"}, status=404)
    if target.is_superuser:
        return error("站长本身就是最高权限，无需任命")
    if permissions.set_moderator(target, True):
        _log_moderation_event(request.user, "appoint", target=target, target_name=_display_name(target))
    return json_response({"ok": True, "moderator": _moderator_payload(target)})


@csrf_exempt
@require_http_methods(["DELETE"])
def moderator_detail(request, user_id):
    """撤销某个管理员——仅站长。"""
    if not permissions.is_privileged(request.user):
        return json_response({"error": "只有站长能管理管理员"}, status=403)

    from django.contrib.auth import get_user_model

    target = get_user_model().objects.filter(pk=as_int(user_id)).first()
    if target is None:
        return json_response({"error": "用户不存在"}, status=404)
    if permissions.set_moderator(target, False):
        _log_moderation_event(request.user, "dismiss", target=target, target_name=_display_name(target))
    return json_response({"ok": True, "moderator": _moderator_payload(target)})
