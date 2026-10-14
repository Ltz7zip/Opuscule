# -*- coding: utf-8 -*-
"""平台治理：封禁 / 解封公开 wiki（站长或管理员）。

（原 ``world/views.py`` 的「平台治理」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from datetime import timedelta
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .. import permissions
from ..models import ModerationEvent, World
from ..normalize import as_int, as_text

from .accounts import _display_name, _log_moderation_event
from .common import current_world, json_response, parse_json


MIN_BAN_DAYS = 3
MAX_BAN_DAYS = 7
DEFAULT_BAN_DAYS = 7


def _ban_payload(world: World) -> dict:
    """治理台里的一行：一个已发布世界的封禁状态。"""
    return {
        "id": world.id,
        "name": world.name,
        "slug": world.published_slug,
        "url": world.site_url,
        "owner": _display_name(world.owner),
        "is_banned": world.is_banned,
        "banned_until": world.banned_until.isoformat() if world.banned_until else "",
        "ban_reason": world.ban_reason,
        "updated_at": world.updated_at.isoformat() if world.updated_at else "",
    }


@require_safe
def moderation_console(request):
    """平台治理台：已发布世界及其封禁状态 + 最近治理流水——站长或管理员（``can_moderate``）。

    管理员不是任何世界的成员，读接口会在 ``ReadPermissionMiddleware`` 就 403，
    所以 ``/api/world/moderation`` 已在 ``permissions.PUBLIC_READ_PATHS`` 里放行，
    真正的守门在这里。
    """
    if not permissions.can_moderate(request.user):
        return json_response({"error": "没有治理权限"}, status=403)
    worlds = World.objects.filter(is_published=True).select_related("owner").order_by("-updated_at")
    rows = [_ban_payload(world) for world in worlds]
    events = [event.to_payload() for event in ModerationEvent.objects.all()[:20]]
    return json_response({
        "worlds": rows,
        "events": events,
        "banned_count": sum(1 for row in rows if row["is_banned"]),
        "limits": {"min_days": MIN_BAN_DAYS, "max_days": MAX_BAN_DAYS,
                   "default_days": DEFAULT_BAN_DAYS},
        "viewer": permissions.viewer_payload(request.user, current_world()),
    })


def _moderation_target(payload: dict):
    """从请求体里取要治理的世界：返回 ``(world, error_response)`` 之一为真。"""
    world = World.objects.filter(pk=as_int(payload.get("world_id"))).first()
    if world is None:
        return None, json_response({"error": "世界不存在"}, status=404)
    return world, None


@csrf_exempt
@require_http_methods(["POST"])
def moderation_ban(request):
    """封禁一个已发布的公开 wiki——站长或管理员。

    时长夹在 3–7 日；写 ``banned_until`` 后站点即时不可访问（``site_views._get_world``
    一处拦截），到期由 ``World.is_banned`` 惰性判回**自动解封**——不需要定时任务。
    """
    if not permissions.can_moderate(request.user):
        return json_response({"error": "没有治理权限"}, status=403)
    payload = parse_json(request)
    world, failure = _moderation_target(payload)
    if failure:
        return failure
    if not world.is_published:
        return json_response({"error": "只能封禁已发布的公开站点"}, status=400)

    days = as_int(payload.get("days"), DEFAULT_BAN_DAYS)
    days = max(MIN_BAN_DAYS, min(MAX_BAN_DAYS, days))
    reason = as_text(payload.get("reason"), 200)
    world.banned_until = timezone.now() + timedelta(days=days)
    world.ban_reason = reason
    world.save(update_fields=["banned_until", "ban_reason", "updated_at"])
    _log_moderation_event(request.user, "ban", world=world, target=world.owner,
                          detail=f"{days} 天 · {reason}" if reason else f"{days} 天")
    return json_response({"ok": True, "world": _ban_payload(world)})


@csrf_exempt
@require_http_methods(["POST"])
def moderation_unban(request):
    """提前解除封禁——站长或管理员。清空封禁字段后站点立即恢复。"""
    if not permissions.can_moderate(request.user):
        return json_response({"error": "没有治理权限"}, status=403)
    payload = parse_json(request)
    world, failure = _moderation_target(payload)
    if failure:
        return failure
    was_banned = world.is_banned
    world.banned_until = None
    world.ban_reason = ""
    world.save(update_fields=["banned_until", "ban_reason", "updated_at"])
    if was_banned:
        _log_moderation_event(request.user, "unban", world=world, target=world.owner)
    return json_response({"ok": True, "world": _ban_payload(world)})
