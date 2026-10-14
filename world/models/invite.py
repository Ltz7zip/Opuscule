# -*- coding: utf-8 -*-
"""邀请码：``InviteCode``。现在注册需要它（第一个账号例外，它就是所有者）。"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from .constants import ROLE_EDITOR, ROLES
from .world import World


class InviteCode(models.Model):
    """邀请码：现在注册需要它（第一个账号例外，它就是所有者）。"""

    code = models.CharField("邀请码", max_length=32, unique=True)
    world = models.ForeignKey(World, null=True, blank=True, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="created_invites")
    note = models.CharField("备注", max_length=120, blank=True, default="")
    role = models.CharField("加入后的角色", max_length=10, choices=ROLES, default=ROLE_EDITOR)
    max_uses = models.PositiveIntegerField("可用次数", default=1)
    uses = models.PositiveIntegerField("已用次数", default=0)
    expires_at = models.DateTimeField("过期时间", null=True, blank=True)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return self.code

    def is_valid(self) -> bool:
        if self.uses >= self.max_uses:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "note": self.note,
            "role": self.role,
            "uses": self.uses,
            "max_uses": self.max_uses,
            "valid": self.is_valid(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }
