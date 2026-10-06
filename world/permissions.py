# -*- coding: utf-8 -*-
"""权限：谁能看、谁能改。

规则（对齐调研文档 §6 的分享权限模型，但收敛到"单世界 + 邀请制"）：

1. **读**：永远公开——发布站点是给读者看的，工作区也允许游客浏览。
2. **写**：需要登录，并且在这个世界里是 owner / editor。
3. **首次安装例外**：数据库里一个用户都没有时，允许任何人写，好让第一个注册者
   把世界建起来（这也是"第一个注册的人成为所有者"的落地方式）。
4. 超级管理员无视一切限制。
"""

from __future__ import annotations

from django.contrib.auth.models import User

from .models import ROLE_EDITOR, ROLE_OWNER, ROLE_VIEWER, Membership, World

# 这些写接口不要求编辑权限（登录即可，甚至匿名也放行）：
# 登录/注册发生在"还没有身份"的时候；在线心跳连只读成员也要能发。
OPEN_WRITE_PREFIXES = (
    "/api/world/auth/",
    "/api/world/presence",
)


def users_exist() -> bool:
    return User.objects.exists()


def current_world_or_none() -> World | None:
    return World.objects.order_by("id").first()


def membership_for(user, world: World | None):
    if not user or not getattr(user, "is_authenticated", False) or world is None:
        return None
    return Membership.objects.filter(world=world, user=user).first()


def role_of(user, world: World | None) -> str:
    """返回 owner / editor / viewer / guest（未登录）／admin（超级管理员）。"""
    if user and getattr(user, "is_authenticated", False):
        if user.is_superuser or user.is_staff:
            return ROLE_OWNER
        membership = membership_for(user, world)
        if membership:
            return membership.role
        return ROLE_VIEWER if world is not None else ROLE_VIEWER
    return "guest"


def can_edit(user, world: World | None) -> bool:
    if not users_exist():
        return True                     # 首次安装：先让人把世界建起来
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user.is_staff:
        return True
    membership = membership_for(user, world)
    return bool(membership and membership.can_edit())


def can_admin(user, world: World | None) -> bool:
    """能管成员与邀请码：所有者或超级管理员。"""
    if not users_exist():
        return True
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user.is_staff:
        return True
    membership = membership_for(user, world)
    return bool(membership and membership.role == ROLE_OWNER)


def ensure_membership(user, world: World, role: str = ROLE_EDITOR, invited_by=None) -> Membership:
    membership, created = Membership.objects.get_or_create(
        world=world, user=user, defaults={"role": role, "invited_by": invited_by},
    )
    if created and world.owner_id is None and role == ROLE_OWNER:
        world.owner = user
        world.save(update_fields=["owner"])
    return membership


def viewer_payload(user, world: World | None) -> dict:
    """给前端的"我是谁、我能干什么"。"""
    authenticated = bool(user and getattr(user, "is_authenticated", False))
    role = role_of(user, world)
    membership = membership_for(user, world)
    return {
        "authenticated": authenticated,
        "needs_setup": not users_exist(),
        "username": (user.get_full_name() or user.username) if authenticated else "",
        "handle": user.username if authenticated else "",
        "initial": ((user.get_full_name() or user.username)[:1].upper() if authenticated else ""),
        "role": role,
        "role_label": dict(Membership._meta.get_field("role").choices).get(role, "游客"),
        "can_edit": can_edit(user, world),
        "can_admin": can_admin(user, world),
        "joined": bool(membership),
    }
