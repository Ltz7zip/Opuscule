# -*- coding: utf-8 -*-
"""销号 / 数据导出 / 邀请 / 页面 / 成员管理。

（原 ``world/views.py`` 的「销号 / 数据导出 / 邀请 / 页面 / 成员管理。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
import json
import re
import secrets

from .. import permissions
from ..models import (
    InviteCode,
    Membership,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
    World,
)
from documents.models import DocumentVersion
from ..normalize import as_int, as_text

from .accounts import (
    _activate_default_world,
    _log_member_event,
    _login_throttle,
    _login_throttle_reset,
    _register_throttle,
    _register_user,
    _user_payload,
    client_ip,
)
from .canvases import clamp_int
from .common import current_world, current_world_or_none, error, json_response, parse_json


def _owned_worlds(user) -> list[World]:
    """这个用户"说了算"的世界：``owner`` 字段指向他，或有 ``owner`` 角色的成员身份。

    两处都要看：建世界时既写 owner 字段、也补一条 owner 成员身份，但对从没收过
    邀请、自己开号的老数据来说也可能只有其中一边。
    """
    ids = set(World.objects.filter(owner=user).values_list("id", flat=True))
    ids |= set(Membership.objects.filter(user=user, role=ROLE_OWNER).values_list("world_id", flat=True))
    return list(World.objects.filter(pk__in=ids).order_by("id"))


@require_safe
def account_export(request):
    """把我的账号数据打包成一份 JSON 下载（销号前"带走一份"）。

    只导登录者自己的：账号概要 + 我能进的世界（及角色）+ 我留下过版本的文档。
    别人的世界内容不在这里——那是各自的私产。
    """
    if not request.user or not request.user.is_authenticated:
        return error("请先登录", status=401)

    user = request.user

    worlds = []
    for world in permissions.worlds_for(user):
        membership = Membership.objects.filter(world=world, user=user).first()
        is_owner = world.owner_id == user.id or (membership is not None and membership.role == ROLE_OWNER)
        worlds.append({
            "id": world.id,
            "name": world.name,
            "slug": world.slug,
            "role": membership.role if membership is not None else ("owner" if world.owner_id == user.id else ""),
            "is_owner": is_owner,
            "is_published": world.is_published,
            "created_at": world.created_at.isoformat() if world.created_at else "",
        })

    # 我改过哪些文档：从版本快照里认领（author 是我），按文档合并成一条
    authored: dict[int, dict] = {}
    for version in (DocumentVersion.objects.filter(author=user)
                    .select_related("document__world").order_by("document_id", "index")):
        document = version.document
        if document is None:
            continue
        entry = authored.setdefault(document.id, {
            "document_id": document.id,
            "document": document.name,
            "world": document.world.name if document.world_id else "",
            "versions": 0,
            "first_at": "",
            "last_at": "",
        })
        entry["versions"] += 1
        when = version.created_at.isoformat() if version.created_at else ""
        if when and not entry["first_at"]:
            entry["first_at"] = when
        if when:
            entry["last_at"] = when

    payload = {
        "exported_at": timezone.now().isoformat(),
        "account": {
            "id": user.id,
            "username": user.username,
            "display_name": user.get_full_name(),
            "email": user.email,
            "date_joined": user.date_joined.isoformat() if user.date_joined else "",
            "last_login": user.last_login.isoformat() if user.last_login else "",
        },
        "worlds": worlds,
        "authored_documents": list(authored.values()),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    response = HttpResponse(body, content_type="application/json; charset=utf-8")
    safe_name = re.sub(r'[\\/:*?"<>|]+', "-", user.username or "account")
    response["Content-Disposition"] = f'attachment; filename="opuscule-account-{safe_name}.json"'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def account_delete(request):
    """销号：删掉我的账号，连同"只剩我一个人"的世界。

    能毁掉的东西不能一按就没，所以：
      · 必须验当前密码——会话被盗也毁不了号；
      · 我拥有、且**还有别的成员**的世界不删：先把所有权转让出去、或移除他人再来；
      · 只属于我一个人的世界，连同账号一起删（我的成员身份随之级联清掉）。
    """
    from django.contrib.auth import logout

    if not request.user or not request.user.is_authenticated:
        return error("请先登录", status=401)

    payload = parse_json(request)
    if not request.user.check_password(payload.get("current_password") or ""):
        return error("密码不对")
    if not payload.get("confirm"):
        return error("请确认要注销账号")

    owned = _owned_worlds(request.user)
    blocked = [world for world in owned if world.memberships.exclude(user=request.user).exists()]
    if blocked:
        names = "、".join((world.name or f"世界 #{world.id}") for world in blocked[:3])
        return error(f"这些世界里还有别的成员，得先转让所有权或移除他们：{names}")

    user = request.user
    # 只有 owner 字段在我名下的世界才跟着销号一起删；当我只是 owner 角色的成员、
    # 世界归别人（或已无主）时，删掉我的成员身份就够了，别人的东西留着。
    doomed = [world for world in owned if world.owner_id in (user.id, None)]
    with transaction.atomic():
        for world in doomed:
            world.delete()
        logout(request)
        user.delete()
    return json_response({"ok": True})


# 邀请码探测的限流：邀请码是有限集合，不设上限等于把码库交给别人枚举。
INVITE_PROBE_WINDOW = 60      # 秒
INVITE_PROBE_LIMIT = 20       # 每个 IP + 会话，一个窗口内最多探这么多次


def _invite_probe_key(request) -> str:
    session_key = getattr(request.session, "session_key", "") or "anon"
    return f"auth-invite:{client_ip(request)}:{session_key}"


@require_safe
def auth_invite_check(request):
    """邀请码探测（只读）：注册页边输边查。

    刻意只回 ``valid`` 与机器可读的 ``reason``——**不回** role、剩余次数、
    是否存在同名用户等任何可用于枚举的信息；中文文案由前端按 reason 映射，
    真正的裁决仍然是提交时的 ``_register_user()``。
    """
    key = _invite_probe_key(request)
    used = cache.get(key, 0)
    if used >= INVITE_PROBE_LIMIT:
        return json_response({"valid": False, "reason": "rate_limited"}, status=429)
    cache.set(key, used + 1, INVITE_PROBE_WINDOW)

    code = as_text(request.GET.get("code"), 64).strip()
    if not code:
        return json_response({"valid": False, "reason": "empty"})
    if not permissions.users_exist():
        # 还没有任何账号：第一注册不需要邀请码
        return json_response({"valid": True, "reason": "owner_setup"})
    invite = InviteCode.objects.filter(code__iexact=code).first()
    if invite is None:
        return json_response({"valid": False, "reason": "not_found"})
    if not invite.is_valid():
        return json_response({"valid": False, "reason": "exhausted"})
    return json_response({"valid": True, "reason": "ok"})


def _notice_variant(message: str) -> dict:
    """把后端的错误文案映射成面板文案。

    中文一律沿用后端返回值，这里只补英文副行与面板类型；``auth.js`` 里
    有一张同源的表，改文案要一起改。

    顺序很重要：先认「邀请码」，再认两条注册提示，最后才轮到密码强度——
    否则「用户名或密码不对」会被「密码」两个字误判成密码强度问题。
    """
    if not message:
        return {}
    text = message.strip()
    if "邀请码" in text:
        if "需要邀请码" in text:
            l2 = "Invite Key Required · Ask The Owner For A Code"
        elif "不存在" in text:
            l2 = "Invite Key Rejected · This Code Does Not Exist"
        else:
            l2 = "Invite Key Exhausted · Ask The Owner For A New One"
        return {
            "kind": "denied", "title": "Warning", "icon": "⚠",
            "l1": "Registration Halted", "l2": l2, "l3": "Returning To Access Portal",
            "en": "WARNING · INVITE KEY REJECTED · ACCESS DENIED",
        }
    if "用户名已经被用" in text:
        return {
            "kind": "notice", "title": "Notice", "icon": "■",
            "l1": "Registration Halted",
            "l2": "Username Already Claimed · Choose Another Identifier",
            "l3": "",
            "en": "NOTICE · USERNAME ALREADY CLAIMED · CHOOSE ANOTHER IDENTIFIER",
        }
    if text.startswith("用户名至少"):
        return {
            "kind": "notice", "title": "Notice", "icon": "■",
            "l1": "Registration Halted",
            "l2": "Username Too Short · At Least 3 Characters",
            "l3": "",
            "en": "NOTICE · USERNAME TOO SHORT · AT LEAST 3 CHARACTERS",
        }
    if not re.search(r"用户名|或|口令", text) and re.search(r"密码|口令", text):
        return {
            "kind": "notice", "title": "Notice", "icon": "■",
            "l1": "Registration Halted",
            "l2": "Passphrase Too Weak · See Requirements",
            "l3": "",
            "en": "NOTICE · PASSPHRASE TOO WEAK · SEE REQUIREMENTS",
        }
    return {
        "kind": "denied", "title": "Warning", "icon": "⚠",
        "l1": "Authentication Failed",
        "l2": "Credentials Mismatch, Attempt 01 Logged",
        "l3": "Returning To Access Portal",
        "en": "WARNING · AUTHENTICATION FAILED · CREDENTIALS MISMATCH",
    }


def _auth_page(request, mode: str = "login", error: str = "", status: int = 200):
    """登录 / 注册页的公共渲染。"""
    world = current_world_or_none()
    needs_setup = not permissions.users_exist()

    # 终端时钟簇（auth.html）：服务端渲染一次，无 JS 时页面也有一份静态时间
    now = timezone.localtime()
    clock = {
        "hm": now.strftime("%H:%M"),
        "sec": now.strftime("%S"),
        "date": f"{now.strftime('%a').upper()} · {now.strftime('%d %b %Y').upper()}",
        "stamp": now.isoformat(),
    }

    # 邀请链接里带的码：预填 + 先告诉用户它还能不能用（别等提交才说"用完了"）
    invite_hint = ""
    code_from_link = (request.POST.get("invite") or request.GET.get("invite") or "").strip()
    if code_from_link and not needs_setup:
        candidate = InviteCode.objects.filter(code__iexact=code_from_link).first()
        if candidate is None:
            invite_hint = "这个邀请码不存在，检查一下是不是复制少了字符"
        elif not candidate.is_valid():
            invite_hint = "这个邀请码已经用完了，找所有者再要一个"
        else:
            invite_hint = "邀请码有效，填好用户名和密码就能进"

    return render(request, "auth.html", {
        "mode": mode,
        "needs_setup": needs_setup,
        "world": world,
        # 品牌字标 / 访客档案用：没有世界时给一份中性兜底
        "world_name": (world.name if world is not None and world.name else "世界工作区"),
        "world_lead": (world.description.strip() if world is not None and world.description else ""),
        "initial": ((world.name or "W")[:1].upper() if world is not None else "W"),
        "clock": clock,
        # 拒绝 / 提示的英文面板文案（auth.js 里有同一张表，改文案改这两处）
        "notice": _notice_variant(error),
        "page_title": "创建所有者账号" if needs_setup else ("注册" if mode == "register" else "登录"),
        "page_lead": ("第一次使用：这个账号会成为世界的所有者，之后邀请别人来一起写。"
                      if needs_setup else ""),
        "error": error,
        "username": request.POST.get("username", ""),
        "email": request.POST.get("email", ""),
        "invite": request.POST.get("invite") or request.GET.get("invite", ""),
        "invite_hint": invite_hint,
    }, status=status)


@require_http_methods(["GET", "POST"])
def login_page(request):
    """登录页（表单）。已经是登录状态就直接进工作区。"""
    from django.contrib.auth import authenticate, login

    if request.user.is_authenticated:
        return redirect("/world")
    if request.method != "POST":
        if not permissions.users_exist():
            return redirect("/register")
        return _auth_page(request, "login")

    username = as_text(request.POST.get("username"), 150).strip()
    password = request.POST.get("password") or ""
    wait = _login_throttle(request, username)
    if wait is not None:
        return _auth_page(request, "login", "尝试太频繁，请稍后再试", status=429)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return _auth_page(request, "login", "用户名或密码不对", status=400)
    _login_throttle_reset(username)
    login(request, user)
    _activate_default_world(request, user)
    return redirect("/world")


@require_http_methods(["GET", "POST"])
def register_page(request):
    """注册页（表单）。必须有有效邀请码才能注册（首个账号除外）。"""
    if request.user.is_authenticated:
        return redirect("/world")
    if request.method != "POST":
        return _auth_page(request, "register")

    wait = _register_throttle(request)
    if wait is not None:
        return _auth_page(request, "register", "尝试太频繁，请稍后再试", status=429)

    payload = {
        "username": request.POST.get("username"),
        "password": request.POST.get("password"),
        "invite": request.POST.get("invite"),
        "display_name": request.POST.get("display_name"),
        "email": request.POST.get("email"),
    }
    user, message, _created_owner, _world = _register_user(payload, request)
    if user is None:
        return _auth_page(request, "register", message, status=400)
    return redirect("/world")


@require_http_methods(["GET", "POST"])
def logout_page(request):
    """退出并回到工作区（未登录也能看）。"""
    from django.contrib.auth import logout

    logout(request)
    return redirect("/world")


@require_safe
def collaborators(request):
    """成员列表 + 邀请码（有权限的人才能看邀请码）。"""
    world = current_world()
    viewer = permissions.viewer_payload(request.user, world)
    members = []
    for membership in world.memberships.select_related("user").order_by("id"):
        members.append({
            **_user_payload(membership.user),          # id 会被下面覆盖成成员 id
            "id": membership.id,
            "user_id": membership.user_id,
            "role": membership.role,
            "joined_at": membership.created_at.isoformat() if membership.created_at else None,
        })
    # 邀请码只给管理员看；没权限的人拿到空列表（而不是没有这个键，前端就不用分支了）
    data = {"members": members, "viewer": viewer, "invites": []}
    if viewer.get("can_admin"):
        data["invites"] = [
            {
                "id": invite.id,
                "code": invite.code,
                "role": invite.role,
                "note": invite.note,
                "uses": invite.uses,
                "max_uses": invite.max_uses,
                "valid": invite.is_valid(),
            }
            for invite in world.invites.all()[:20]
        ]
    return json_response(data)


@csrf_exempt
@require_http_methods(["POST"])
def invite_create(request):
    """发一个邀请码（只有所有者能发）。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能发邀请码"}, status=403)

    payload = parse_json(request)
    role = as_text(payload.get("role"), 20) or ROLE_EDITOR
    if role not in (ROLE_OWNER, ROLE_EDITOR, ROLE_VIEWER):
        role = ROLE_EDITOR
    code = as_text(payload.get("code"), 64).strip().replace("-", "").replace("_", "")
    if not code:
        code = secrets.token_urlsafe(12)[:12]
    if InviteCode.objects.filter(code__iexact=code).exists():
        return error("这个邀请码已经存在")
    invite = InviteCode.objects.create(
        world=world,
        code=code,
        role=role,
        note=as_text(payload.get("note"), 120),
        max_uses=clamp_int(payload.get("max_uses", 1), 1, 100),
        created_by=request.user if request.user.is_authenticated else None,
    )
    _log_member_event(world, request.user, "invite",
                      detail=f"{invite.code}（{invite.get_role_display()}）")
    return json_response({"id": invite.id, "code": invite.code, "role": invite.role,
                          "url": f"/register?invite={invite.code}"})


@csrf_exempt
@require_http_methods(["DELETE"])
def invite_delete(request, invite_id):
    """作废一个邀请码。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能改邀请码"}, status=403)
    invite = world.invites.filter(pk=as_int(invite_id)).first()
    if invite is None:
        return json_response({"error": "邀请码不存在"}, status=404)
    _log_member_event(world, request.user, "revoke", detail=invite.code)
    invite.delete()
    return json_response({"ok": True})


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def member_detail(request, member_id):
    """改成员角色 / 移除成员（只有所有者能动）。"""
    world = current_world()
    if not permissions.can_admin(request.user, world):
        return json_response({"error": "只有所有者能改成员"}, status=403)

    membership = world.memberships.filter(pk=as_int(member_id)).select_related("user").first()
    if membership is None:
        return json_response({"error": "成员不存在"}, status=404)

    if request.method == "DELETE":
        if membership.role == ROLE_OWNER and world.memberships.filter(role=ROLE_OWNER).count() <= 1:
            return error("至少要留一个所有者")
        _log_member_event(world, request.user, "remove",
                          target=membership.user, detail=membership.get_role_display())
        membership.delete()
        return json_response({"ok": True})

    payload = parse_json(request)
    role = as_text(payload.get("role"), 20)
    if role in (ROLE_OWNER, ROLE_EDITOR, ROLE_VIEWER):
        if membership.role == ROLE_OWNER and role != ROLE_OWNER \
                and world.memberships.filter(role=ROLE_OWNER).count() <= 1:
            return error("至少要留一个所有者")
        if role != membership.role:
            before = membership.get_role_display()
            membership.role = role
            membership.save(update_fields=["role"])
            _log_member_event(world, request.user, "role", target=membership.user,
                              detail=f"{before} → {membership.get_role_display()}")
    return json_response({"ok": True, "role": membership.role})
