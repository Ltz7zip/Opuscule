# -*- coding: utf-8 -*-
"""发布记录：``PublishLog`` 每次发布留一条（站点页脚与发布面板都用）。

模型原本住在 ``world/models/publishing.py``，R2 拆 app 后搬到 ``publishing``；
``Meta.db_table`` 钉住旧表名（``world_publishlog``）。
"""

from __future__ import annotations

from django.db import models

from world.models.constants import AUDIENCE_PUBLIC, AUDIENCES
from world.models.world import World


class PublishLog(models.Model):
    """每次发布留一条记录：版本、范围、以及这次动了哪些文档（站点页脚与发布面板都用）。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="publish_logs")
    version = models.PositiveIntegerField("版本", default=1)
    audience = models.CharField("访问范围", max_length=10, choices=AUDIENCES, default=AUDIENCE_PUBLIC)
    counts = models.JSONField("统计", default=dict, blank=True)
    added = models.JSONField("新增", default=list, blank=True)
    changed = models.JSONField("更新", default=list, blank=True)
    removed = models.JSONField("移除", default=list, blank=True)
    author = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="publish_logs", verbose_name="发布人")
    author_name = models.CharField("发布人", max_length=150, blank=True, default="")
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        db_table = "world_publishlog"
        ordering = ["-version", "-id"]
        verbose_name = "发布记录"
        verbose_name_plural = "发布记录"

    def __str__(self):
        return f"v{self.version} @ {self.created_at:%Y-%m-%d %H:%M}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "version": self.version,
            "audience": self.audience,
            "counts": self.counts or {},
            "added": self.added or [],
            "changed": self.changed or [],
            "removed": self.removed or [],
            "author": self.author_name or (self.author.username if self.author else "匿名"),
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "added_count": len(self.added or []),
            "changed_count": len(self.changed or []),
            "removed_count": len(self.removed or []),
        }
