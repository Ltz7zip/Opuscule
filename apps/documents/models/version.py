# -*- coding: utf-8 -*-
"""文档版本：``DocumentVersion`` 每次内容变化留一版，可预览、可回滚。"""

from __future__ import annotations

import json

from django.db import models

from apps.world.models.constants import MAX_VERSIONS

from .document import Document


class DocumentVersion(models.Model):
    """文档版本快照：每次内容变化留一版，可预览、可回滚。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="versions")
    index = models.PositiveIntegerField("第几版", default=1)
    author = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="versions")
    author_name = models.CharField("作者", max_length=80, blank=True, default="")
    label = models.CharField("做了什么", max_length=80, blank=True, default="")
    payload = models.JSONField("内容快照", default=dict, blank=True)
    summary = models.CharField("摘要", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("保存于", auto_now_add=True)

    class Meta:
        db_table = "world_documentversion"
        ordering = ["-index", "-id"]
        unique_together = [("document", "index")]

    def __str__(self) -> str:
        return f"{self.document.name} v{self.index}"

    def to_payload(self, with_body: bool = False) -> dict:
        data = {
            "id": self.id,
            "index": self.index,
            "author": self.author_name or (self.author.username if self.author else "匿名"),
            "label": self.label,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "size": len(json.dumps(self.payload, ensure_ascii=False)) if self.payload else 0,
        }
        if with_body:
            data["payload"] = self.payload
        return data
