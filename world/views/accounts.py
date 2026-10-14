# -*- coding: utf-8 -*-
"""账号 / 成员 / 在线 / 版本历史：注册登录、邀请码、成员角色、在线心跳、文档版本。

（原 ``world/views.py`` 的「账号 / 成员 / 在线 / 版本历史」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .. import permissions
from ..models import InviteCode, MemberEvent, ModerationEvent, ROLE_OWNER, World
from ..normalize import as_text

from .common import current_world, error, json_response, logger, parse_json


def _user_payload(user) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "handle": user.username,
        "initial": (user.get_full_name() or user.username or "?")[:1].upper(),
        "email": user.email,
    }


def _display_name(user) -> str:
    """成员审计里记人名的统一口径：显示名优先，退到用户名。"""
    if user is None:
        return ""
    return user.get_full_name() or user.username or ""


def _log_member_event(world, actor, action, *, target=None, target_name="", detail=""):
    """记一笔成员变更（A5）。

    审计是"尽力而为"的：写不进去也绝不能拖垮正常操作，所以整段吞异常只落日志。
    """
    from ..models import MemberEvent

    try:
        MemberEvent.objects.create(
            world=world,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            actor_name=_display_name(actor),
            target=target if getattr(target, "is_authenticated", False) else None,
            target_name=target_name or _display_name(target),
            action=action,
            detail=detail,
        )
    except Exception:                        # pragma: no cover - 审计失败不该影响主流程
        logger.exception("记录成员变更失败：%s %s", action, target_name)


def _log_moderation_event(actor, action, *, world=None, target=None, target_name="", detail=""):
    """记一笔平台治理动作（G1 审计基座）。

    与 ``_log_member_event`` 同一套路：只增不改、吞异常只落日志——审计写不进去
    也绝不能拖垮任命 / 封禁这类操作本身。``action`` 取值见
    ``models.MODERATION_ACTIONS``（appoint / dismiss / ban / unban）。
    """
    from ..models import ModerationEvent

    try:
        ModerationEvent.objects.create(
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            actor_name=_display_name(actor),
            world=world,
            target=target if getattr(target, "is_authenticated", False) else None,
            target_name=target_name or _display_name(target),
            action=action,
            detail=detail,
        )
    except Exception:                        # pragma: no cover - 审计失败不该影响主流程
        logger.exception("记录治理动作失败：%s", action)


def _register_user(payload: dict, request=None):
    """注册的公共逻辑：返回 ``(user, error_message, created_owner, world)``。

    第一个账号接管（或创建）第一个世界；此后注册**必须有有效邀请码**才能
    加入邀请码指向的世界——邀请制是强制的，缺邀请码一律拒绝。
    """
    from django.contrib.auth import get_user_model, login
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    User = get_user_model()
    username = as_text(payload.get("username"), 150).strip()
    password = payload.get("password") or ""
    invite_code = as_text(payload.get("invite"), 64).strip()
    display = as_text(payload.get("display_name"), 150).strip()
    email = as_text(payload.get("email"), 254).strip()

    if len(username) < 3:
        return None, "用户名至少 3 个字符", False, None
    if User.objects.filter(username__iexact=username).exists():
        return None, "这个用户名已经被用了", False, None
    if email:
        # 邮箱是可选的（只用来收「忘记密码」的重置信）；填了就得合法、且不能撞别人
        from django.core.exceptions import ValidationError as _VErr
        from django.core.validators import validate_email

        try:
            validate_email(email)
        except _VErr:
            return None, "邮箱格式不对", False, None
        if User.objects.filter(email__iexact=email).exists():
            return None, "这个邮箱已经被用了", False, None
    try:
        # 传入待建用户，让「与用户名 / 邮箱过于相似」的校验也生效
        validate_password(password, User(username=username, email=email))
    except ValidationError as exc:
        return None, "；".join(exc.messages), False, None

    first_user = not User.objects.exists()
    invite = None
    if not first_user:
        # 邀请制是强制的：没有邀请码就不能自助开号，否则等于开放注册
        if not invite_code:
            return None, "需要邀请码才能注册", False, None
        invite = InviteCode.objects.filter(code__iexact=invite_code).first()
        if invite is None or not invite.is_valid():
            return None, "邀请码不对或者已经用完了", False, None

    user = User.objects.create_user(username=username, password=password, email=email)
    if display:
        # 按**任意空白**拆（不只 ASCII 空格）：中文名常带全角空格，原写法会整段
        # 塞进 first_name。只有一段（典型中文名）时整名进 first_name、last_name 留空，
        # get_full_name() 仍能原样取回，不再出现"last_name 永远空"的怪异感。
        parts = display.split(None, 1)
        user.first_name = parts[0][:150]
        user.last_name = (parts[1][:150] if len(parts) > 1 else "")
        user.save(update_fields=["first_name", "last_name"])

    created_owner = False
    if invite is not None:
        # 受邀进来：加入邀请码指向的那个世界，角色由邀请码定
        world = invite.world or current_world()
        membership = permissions.ensure_membership(user, world, invite.role)
        invite.uses += 1
        invite.save(update_fields=["uses"])
        _log_member_event(world, user, "join", target=user, detail=membership.get_role_display())
    else:
        # 第一个账号：接管（或创建）第一个世界，成为所有者
        world = current_world()
        if world.owner_id is None:
            world.owner = user
            world.save(update_fields=["owner"])
        membership = permissions.ensure_membership(user, world, ROLE_OWNER)
        created_owner = True
        _log_member_event(world, user, "join", target=user, detail=membership.get_role_display())

    if request is not None:
        login(request, user)
        request.session["world_id"] = world.id
    return user, "", created_owner, world


@csrf_exempt
@require_http_methods(["GET", "POST"])
def auth_me(request):
    """我是谁、能不能编辑、要不要先做初始化。"""
    world = current_world()
    if request.method == "POST":
        payload = parse_json(request)
        user, message, created_owner, world = _register_user(payload, request)
        if user is None:
            return error(message)
        return json_response({"viewer": permissions.viewer_payload(request.user, world),
                              "created_owner": bool(created_owner)})
    return json_response({
        "viewer": permissions.viewer_payload(request.user, world),
        "needs_setup": not permissions.users_exist(),
        # 会话超时：把到期时间交给前端，好在过期前提醒"续期"而不是
        # 让人敲到一半突然被踢回登录页。未登录时是 null。
        "session_expires_at": _session_expiry(request),
    })


def _session_expiry(request) -> str | None:
    if not request.user or not request.user.is_authenticated:
        return None
    try:
        expiry = request.session.get_expiry_date()
    except Exception:                      # 会话被清掉了
        return None
    return expiry.isoformat() if expiry else None


@csrf_exempt
@require_http_methods(["POST"])
def auth_renew(request):
    """续期：把会话到期时间往后推一轮（超时前提示续期）。"""
    if not request.user or not request.user.is_authenticated:
        return error("会话已经过期了，请重新登录", status=401)
    try:
        request.session.set_expiry(settings.SESSION_COOKIE_AGE)
        request.session.modified = True
    except Exception:
        return error("续期失败，请重新登录", status=401)
    return json_response({"ok": True, "session_expires_at": _session_expiry(request)})


def _activate_default_world(request, user) -> World:
    """登录后把会话切到"这个用户自己的世界"；他一个世界都没有才退回兜底世界。"""
    world = permissions.default_world_for(user) or current_world()
    if world is not None:
        request.session["world_id"] = world.id
    return world


# 登录 / 注册限流：挡暴力破解与批量刷号。计数走 Django 缓存（见 settings.CACHES），
# 用文件后端是为了让 gunicorn 的多个 worker 共享同一份计数——进程内存缓存会各算各的。
LOGIN_IP_WINDOW = 300        # 秒：同一 IP 的登录尝试窗口
LOGIN_IP_LIMIT = 30          # 同一 IP 一个窗口内最多试这么多次
LOGIN_USER_WINDOW = 900      # 秒：同一用户名的登录尝试窗口
LOGIN_USER_LIMIT = 10        # 同一用户名一个窗口内最多试这么多次（登录成功即清零）
REGISTER_IP_WINDOW = 3600    # 秒：注册窗口
REGISTER_IP_LIMIT = 10       # 同一 IP 一小时最多注册这么多次


def client_ip(request) -> str:
    """取访客 IP。

    nginx 用 ``$proxy_add_x_forwarded_for`` 透传：它把「上游给的 XFF」原样带上，
    再在末尾追加真实对端 ``$remote_addr``。客户端可以自己伪造前面的段，所以
    **只信最后一段**（我们这层代理加的那个），拿第一段等于把限流交给攻击者旋转。
    没有 XFF 时退回 ``REMOTE_ADDR``。
    """
    forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")
    if forwarded and forwarded[-1].strip():
        return forwarded[-1].strip()
    return request.META.get("REMOTE_ADDR", "") or "unknown"


def _rate_hit(key: str, limit: int, window: int):
    """记一次访问并判断是否超限。

    返回超限后**还需等待的秒数**（没超则 ``None``）。计数用 ``cache.incr``，
    窗口随首次 ``cache.add`` 写入设定；键过期后 ``incr`` 抛 ``ValueError``，
    这时当作窗口重开、重新计数。阈值语义：允许 ``limit`` 次，第 ``limit + 1`` 次被拒。
    """
    if cache.add(key, 1, window):
        return None
    try:
        used = cache.incr(key)
    except ValueError:
        cache.set(key, 1, window)
        return None
    return window if used > limit else None


def _login_throttle(request, username: str):
    """登录限流：先按 IP 挡批量，再按用户名挡「换 IP 打同一账号」。返回等待秒数或 None。"""
    wait = _rate_hit(f"login-ip:{client_ip(request)}", LOGIN_IP_LIMIT, LOGIN_IP_WINDOW)
    if wait is not None:
        return wait
    name = (username or "").strip().lower()
    if name:
        return _rate_hit(f"login-user:{name}", LOGIN_USER_LIMIT, LOGIN_USER_WINDOW)
    return None


def _login_throttle_reset(username: str) -> None:
    """登录成功后清掉该用户名的尝试计数；按 IP 的计数留着继续挡批量。"""
    name = (username or "").strip().lower()
    if name:
        cache.delete(f"login-user:{name}")


def _register_throttle(request):
    """注册限流：按 IP 计数（注册不像登录有"用户名"这个稳定维度可复用）。"""
    return _rate_hit(f"register-ip:{client_ip(request)}", REGISTER_IP_LIMIT, REGISTER_IP_WINDOW)


def _too_many(wait: int) -> JsonResponse:
    """统一的 429 响应：带 ``Retry-After``，前端可提示「稍后再试」。"""
    response = json_response({"error": "尝试太频繁，请稍后再试", "retry_after": wait}, status=429)
    response["Retry-After"] = str(wait)
    return response


@csrf_exempt
@require_http_methods(["POST"])
def auth_register(request):
    """注册（JSON）。必须有邀请码才能加入对应世界（首个账号除外）。"""
    wait = _register_throttle(request)
    if wait is not None:
        return _too_many(wait)
    user, message, created_owner, world = _register_user(parse_json(request), request)
    if user is None:
        return error(message)
    return json_response({
        "viewer": permissions.viewer_payload(request.user, world),
        "created_owner": bool(created_owner),
    })


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request):
    """登录（JSON）。登录后落到"属于自己的世界"（会话记住它）。"""
    from django.contrib.auth import authenticate, login

    payload = parse_json(request)
    username = as_text(payload.get("username"), 150).strip()
    password = payload.get("password") or ""
    wait = _login_throttle(request, username)
    if wait is not None:
        return _too_many(wait)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return json_response({"error": "用户名或密码不对"}, status=400)
    _login_throttle_reset(username)
    login(request, user)
    world = _activate_default_world(request, user)
    return json_response({"viewer": permissions.viewer_payload(request.user, world)})


@csrf_exempt
@require_http_methods(["POST"])
def auth_logout(request):
    """退出（JSON）。"""
    from django.contrib.auth import logout

    logout(request)
    return json_response({"ok": True})
