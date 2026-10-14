# -*- coding: utf-8 -*-
"""账号协作：``Membership`` 成员 / ``MemberEvent`` 成员审计。

``Presence``（在线心跳）同时指向 ``World`` 与 ``Document``，R2 拆 app 时随
``documents`` 走，见 ``documents/models/presence.py``。
"""

from __future__ import annotations

from django.db import models

from .constants import MEMBER_ACTIONS, ROLE_EDITOR, ROLE_OWNER, ROLES
from .world import World


class Membership(models.Model):
    """谁可以动这个世界。第一个注册的人自动成为 owner。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField("角色", max_length=10, choices=ROLES, default=ROLE_EDITOR)
    invited_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="invited_memberships")
    created_at = models.DateTimeField("加入于", auto_now_add=True)

    class Meta:
        unique_together = [("world", "user")]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.user.username}@{self.world.name}:{self.role}"

    def can_edit(self) -> bool:
        return self.role in (ROLE_OWNER, ROLE_EDITOR)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.user.get_full_name() or self.user.username,
            "handle": self.user.username,
            "role": self.role,
            "role_label": dict(ROLES).get(self.role, self.role),
            "joined_at": self.created_at.isoformat() if self.created_at else "",
        }


class MemberEvent(models.Model):
    """成员变更审计：谁、对谁、做了什么。

    成员被移除后 ``Membership`` 行就没了，事后无从查起；这张表只增不改，专门留痕。
    ``actor`` / ``target`` 用 SET_NULL：人删了事件还在，靠 ``actor_name`` /
    ``target_name`` 兜底（与 ``PublishLog`` 同一套路）。
    """

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="member_events")
    actor = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="member_events_acted", verbose_name="操作者")
    actor_name = models.CharField("操作者", max_length=150, blank=True, default="")
    target = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="member_events_targeted", verbose_name="对象")
    target_name = models.CharField("对象", max_length=150, blank=True, default="")
    action = models.CharField("动作", max_length=10, choices=MEMBER_ACTIONS, default="join")
    detail = models.CharField("细节", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "成员变更"
        verbose_name_plural = "成员变更"

    def __str__(self) -> str:
        return f"{self.actor_name or '?'} {self.action} {self.target_name or '?'}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "action": self.action,
            "action_label": dict(MEMBER_ACTIONS).get(self.action, self.action),
            "actor": self.actor_name or (self.actor.username if self.actor else ""),
            "target": self.target_name or (self.target.username if self.target else ""),
            "detail": self.detail,
            "when": self.created_at.isoformat() if self.created_at else "",
        }
