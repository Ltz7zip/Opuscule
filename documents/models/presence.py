# -*- coding: utf-8 -*-
"""在线状态：``Presence`` 心跳式在线（20 秒没心跳就算离开了）。

从 ``world/models/membership.py`` 拆出来并随 ``documents`` 走：它同时指向 ``World``
（核心）与 ``Document``（本 app），如果留在 ``world`` 就会让 ``world`` ↔ ``documents``
成为 app 级依赖环。
"""

from __future__ import annotations

from datetime import timedelta

from django.db import models
from django.utils import timezone

from world.models.world import World

from .document import Document


class Presence(models.Model):
    """谁在线（心跳式，不搞长连接）：20 秒没心跳就算离开了。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="presence")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="presence")
    document = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="presence")
    updated_at = models.DateTimeField("最后在线", auto_now=True)

    ONLINE_WINDOW = 60      # 秒

    class Meta:
        db_table = "world_presence"
        unique_together = [("world", "user")]

    @classmethod
    def touch(cls, world, user, document=None) -> "Presence":
        entry, _created = cls.objects.get_or_create(world=world, user=user)
        if document is not None:
            entry.document = document
        entry.save()
        return entry

    @classmethod
    def online(cls, world):
        since = timezone.now() - timedelta(seconds=cls.ONLINE_WINDOW)
        return cls.objects.filter(world=world, updated_at__gte=since).select_related("user", "document")

    def to_payload(self) -> dict:
        return {
            "user_id": self.user_id,
            "username": self.user.get_full_name() or self.user.username,
            "handle": self.user.username,
            "initial": (self.user.get_full_name() or self.user.username)[:1].upper(),
            "document": self.document_id,
            "document_name": self.document.name if self.document else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }
