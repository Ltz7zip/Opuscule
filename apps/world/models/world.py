# -*- coding: utf-8 -*-
"""``World``：顶层容器，一个世界就是一部作品。"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from .constants import (
    AUDIENCE_PUBLIC,
    AUDIENCES,
    DEFAULT_THEME,
    DOC_FOLDER,
    make_slug,
    publish_state,
)


class World(models.Model):
    """顶层容器：一个世界就是一部作品，可以整体发布成一个只读站点。"""

    owner = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="owned_worlds", verbose_name="所有者",
    )
    name = models.CharField("名称", max_length=120, default="新世界")
    slug = models.CharField("短链", max_length=16, unique=True, blank=True)
    description = models.TextField("简介", blank=True, default="")
    # {"mode", "grain", "headingFont", "bodyFont", "primaryColor", "background"}
    theme_config = models.JSONField("世界主题", default=dict, blank=True)
    ai_enabled = models.BooleanField("AI 功能", default=True)
    auto_link_enabled = models.BooleanField("名字自动识别", default=True)
    link_entrance_enabled = models.BooleanField("链接入口", default=True)
    genres = models.JSONField("题材", default=list, blank=True)
    # 站点发布：是否已发布、站点地址、访问范围与密码、版本与发布时间
    is_published = models.BooleanField("已发布站点", default=False)
    published_slug = models.CharField("站点地址", max_length=40, blank=True, default="")
    audience = models.CharField("访问范围", max_length=10, choices=AUDIENCES, default=AUDIENCE_PUBLIC)
    publish_password = models.CharField("访问密码", max_length=128, blank=True, default="")
    publish_version = models.PositiveIntegerField("发布版本", default=0)
    published_at = models.DateTimeField("发布于", null=True, blank=True)
    # 平台封禁（批次 C）：封的是一个已发布的公开 wiki。到期靠 ``is_banned`` 惰性判断
    # 自动解封，不依赖定时任务；``ban_reason`` 是给被封者看的理由。
    banned_until = models.DateTimeField("封禁至", null=True, blank=True)
    ban_reason = models.CharField("封禁理由", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "世界"
        verbose_name_plural = "世界"

    def __str__(self):
        return self.name or "未命名世界"

    @property
    def theme(self) -> dict:
        """主题与默认值合并后的结果（前端只读这一份）。"""
        merged = dict(DEFAULT_THEME)
        if isinstance(self.theme_config, dict):
            merged.update({k: v for k, v in self.theme_config.items() if v is not None})
        return merged

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = make_slug(self.name, timezone.now().isoformat())
        if self.is_published and not self.published_slug:
            self.published_slug = make_slug("site", self.name, self.slug)
        super().save(*args, **kwargs)

    @property
    def site_url(self) -> str:
        return f"/s/{self.published_slug}/" if self.published_slug else ""

    @property
    def is_banned(self) -> bool:
        """现在是不是处在封禁期——纯惰性判断，到期即自动恢复，不需要定时任务。"""
        return bool(self.banned_until and self.banned_until > timezone.now())

    def ban_summary(self) -> dict:
        return {
            "banned": self.is_banned,
            "until": self.banned_until.isoformat() if self.banned_until else None,
            "reason": self.ban_reason,
        }

    def publish_summary(self) -> dict:
        """站点状态：版本、范围、各状态的文档计数（前端分享面板直接用）。"""
        counts = {"live": 0, "stale": 0, "pending": 0, "excluded": 0, "unpublished": 0}
        for document in self.documents.filter(deleted_at__isnull=True).exclude(document_type=DOC_FOLDER):
            state = publish_state(document, self)
            counts[state] = counts.get(state, 0) + 1
        return {
            "published": self.is_published,
            "url": self.site_url,
            "audience": self.audience,
            "has_password": bool(self.publish_password),
            "version": self.publish_version,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "counts": counts,
        }

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "theme": self.theme,
            "ai_enabled": self.ai_enabled,
            "auto_link_enabled": self.auto_link_enabled,
            "link_entrance_enabled": self.link_entrance_enabled,
            "genres": self.genres if isinstance(self.genres, list) else [],
            "publish": self.publish_summary(),
        }
