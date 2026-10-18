# -*- coding: utf-8 -*-
"""世界存档：``WorldArchive`` 把整个世界拍成一份快照（0.7.0 §4.3）。

与文档级 ``DocumentVersion`` 是两套东西：存档自己存一份完整数据（文档树 / 卡片 /
时间线 / 时代 / 地图 / 历法 / 图谱），读档是整包回滚，互不影响。
"""

from __future__ import annotations

import json

from django.db import models

from apps.world.models.constants import ARCHIVE_KINDS, ARCHIVE_MANUAL
from apps.world.models.world import World


class WorldArchive(models.Model):
    """世界的一份全量存档（像游戏存档位：可命名、可多份、上限见 ``MAX_ARCHIVES``）。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="archives")
    name = models.CharField("名称", max_length=80, default="未命名存档")
    note = models.CharField("备注", max_length=200, blank=True, default="")
    kind = models.CharField("来源", max_length=8, choices=ARCHIVE_KINDS, default=ARCHIVE_MANUAL)
    author = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="world_archives")
    payload = models.JSONField("快照", default=dict, blank=True)
    size_bytes = models.PositiveIntegerField("体积", default=0)
    summary = models.CharField("摘要", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("保存于", auto_now_add=True)

    class Meta:
        db_table = "world_archive"
        ordering = ["-created_at", "-id"]
        verbose_name = "世界存档"
        verbose_name_plural = "世界存档"

    def __str__(self):
        return f"{self.world.name} · {self.name}"

    def save(self, *args, **kwargs):
        if self.payload and not self.size_bytes:
            self.size_bytes = len(json.dumps(self.payload, ensure_ascii=False).encode("utf-8"))
        super().save(*args, **kwargs)

    def to_payload(self, with_body: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "note": self.note,
            "kind": self.kind,
            "kind_label": self.get_kind_display(),
            "author": self.author.username if self.author else "",
            "size": self.size_bytes,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }
        if with_body:
            data["payload"] = self.payload
        return data
