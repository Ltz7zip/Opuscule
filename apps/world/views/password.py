# -*- coding: utf-8 -*-
"""改密 / 忘记密码。

（原 ``world/views.py`` 的「改密 / 忘记密码。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.conf import settings
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..normalize import as_text

from .accounts import _rate_hit, _too_many, client_ip
from .common import current_world_or_none, error, json_response, logger, parse_json


# 改密限流：挡住「拿到会话后狂试旧密码」这种定向爆破。窗口内允许这么多发。
PASSWORD_CHANGE_WINDOW = 900
PASSWORD_CHANGE_LIMIT = 10
# 忘记密码请求限流：按 IP 计数，别让这个端点被当成「邮件炮」刷别人的信箱。
RESET_REQUEST_WINDOW = 3600
RESET_REQUEST_LIMIT = 5


@csrf_exempt
@require_http_methods(["POST"])
def auth_password(request):
    """登录态改密（方案①）：要旧密码 + 新密码，不依赖邮件。

    改完用 ``update_session_auth_hash`` 把当前会话的鉴权哈希一起换掉——
    否则 Django 会因为「密码变了、会话里的哈希对不上」把这次改动的人自己踢下线。
    """
    from django.contrib.auth import update_session_auth_hash
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    if not request.user or not request.user.is_authenticated:
        return error("请先登录再改密码", status=401)

    wait = _rate_hit(f"pw-change:{request.user.id}", PASSWORD_CHANGE_LIMIT, PASSWORD_CHANGE_WINDOW)
    if wait is not None:
        return _too_many(wait)

    payload = parse_json(request)
    current = payload.get("current_password") or ""
    new = payload.get("new_password") or ""

    if not new:
        return error("新密码不能为空")
    if not request.user.check_password(current):
        return error("当前密码不对")
    if new == current:
        return error("新密码不能和当前密码一样")
    try:
        validate_password(new, request.user)
    except ValidationError as exc:
        return error("；".join(exc.messages))

    request.user.set_password(new)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)          # 改完自己不被踢下线
    return json_response({"ok": True})


@csrf_exempt
@require_http_methods(["POST"])
def auth_email(request):
    """登记 / 修改自己的邮箱（方案②）。

    邮箱只用来收「忘记密码」的重置信。改成非空必须验当前密码——否则会话被
    盗就等于把账号的找回渠道也交出去了。
    """
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    if not request.user or not request.user.is_authenticated:
        return error("请先登录", status=401)

    payload = parse_json(request)
    current = payload.get("current_password") or ""
    email = as_text(payload.get("email"), 254).strip()

    if email:
        if not request.user.check_password(current):
            return error("改邮箱要验一下当前密码")
        try:
            validate_email(email)
        except ValidationError:
            return error("邮箱格式不对")

    request.user.email = email
    request.user.save(update_fields=["email"])
    return json_response({"ok": True, "email": request.user.email})


def _reset_user_from_token(uidb64: str, token: str):
    """从重置信里的 uid + token 反查出用户；无效/过期一律返回 None。"""
    from django.contrib.auth import get_user_model
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.encoding import force_str
    from django.utils.http import urlsafe_base64_decode

    User = get_user_model()
    try:
        user_id = force_str(urlsafe_base64_decode(uidb64 or ""))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    if not default_token_generator.check_token(user, token or ""):
        return None
    return user


def _send_reset_email(request, user) -> None:
    """给用户登记的邮箱寄一封带时效链接的重置信。

    token 由 ``default_token_generator`` 生成，和「密码 / 登录时间」绑定——
    邮件用过一次、或密码一变，旧链接自动失效。
    """
    from django.contrib.auth.tokens import default_token_generator
    from django.core.mail import send_mail
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = request.build_absolute_uri(f"/reset/{uid}/{token}")
    name = user.get_full_name() or user.username
    subject = "重置你的 Opuscule 密码"
    message = (
        f"你好 {name}：\n\n"
        f"有人（大概是你）请求重置这个账号的密码。点下面的链接设置新密码：\n\n"
        f"{link}\n\n"
        f"链接用完即失效；不是你本人点的，忽略这封邮件就好，密码不会被改。\n"
    )
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])


def _find_reset_user(identifier: str):
    """按用户名或邮箱找账号（忘记密码时用户可能记的是用户名，也可能是邮箱）。"""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return (User.objects.filter(username__iexact=identifier).first()
            or User.objects.filter(email__iexact=identifier).first())


def _reset_page(request, *, step: str, error: str = "", sent: bool = False,
                done: bool = False, identifier: str = "", uid: str = "", token: str = "",
                status: int = 200):
    """重置密码页（请求 / 设新密码，两种 step 共用一个模板）。"""
    world = current_world_or_none()
    return render(request, "reset.html", {
        "step": step,
        "error": error,
        "sent": sent,
        "done": done,
        "identifier": identifier,
        "uid": uid,
        "token": token,
        "world_name": (world.name if world is not None and world.name else "世界工作区"),
    }, status=status)


@require_http_methods(["GET", "POST"])
def password_reset_page(request):
    """忘记密码（第一步）：填用户名或邮箱，我们把重置链接寄到登记过的邮箱。"""
    if request.user.is_authenticated:
        return redirect("/w/")
    if request.method != "POST":
        return _reset_page(request, step="request")

    identifier = as_text(request.POST.get("identifier"), 254).strip()
    wait = _rate_hit(f"pw-reset-ip:{client_ip(request)}", RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW)
    if wait is not None:
        return _reset_page(request, step="request", error="尝试太频繁，请稍后再试",
                           identifier=identifier, status=429)
    if not identifier:
        return _reset_page(request, step="request", error="填一下用户名或邮箱",
                           identifier=identifier, status=400)

    user = _find_reset_user(identifier)
    if user is not None and user.email:
        try:
            _send_reset_email(request, user)
        except Exception:                      # SMTP 挂了也不能泄露账号是否存在
            logger.exception("发送密码重置邮件失败：user=%s", user.pk)
    # 无论账号/邮箱是否存在，都回同一句话：不给枚举账号留侧信道。
    return _reset_page(request, step="request", sent=True, identifier=identifier)


@require_http_methods(["GET", "POST"])
def password_reset_confirm_page(request, uidb64, token):
    """忘记密码（第二步）：带着重置信里的 uid + token 来设置新密码。"""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    if request.user.is_authenticated:
        return redirect("/w/")

    user = _reset_user_from_token(uidb64, token)
    if user is None:
        return _reset_page(request, step="confirm",
                           error="这个重置链接无效或者已经过期了，请重新申请。", status=400)
    if request.method != "POST":
        return _reset_page(request, step="confirm", uid=uidb64, token=token)

    new = request.POST.get("new_password") or ""
    confirm = request.POST.get("confirm_password") or ""
    if new != confirm:
        return _reset_page(request, step="confirm", error="两次输入的新密码不一样",
                           uid=uidb64, token=token, status=400)
    try:
        validate_password(new, user)
    except ValidationError as exc:
        return _reset_page(request, step="confirm", error="；".join(exc.messages),
                           uid=uidb64, token=token, status=400)

    user.set_password(new)
    user.save(update_fields=["password"])
    return _reset_page(request, step="confirm", done=True)
