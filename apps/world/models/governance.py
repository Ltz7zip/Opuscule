# -*- coding: utf-8 -*-
"""平台治理：``ModerationEvent`` 治理审计 + ``Report`` 读者举报。"""

from __future__ import annotations

from django.db import models

from .constants import MODERATION_ACTIONS, REPORT_REASONS, REPORT_STATUSES
from .world import World


class ModerationEvent(models.Model):
    """平台治理审计：站长任命 / 撤销管理员、封禁 / 解封公开 wiki。

    与 ``MemberEvent`` 一样是「只增不改」的留痕表，区别在作用域：``MemberEvent`` 记
    的是**某个世界内部**的成员变更；这张表记的是**平台级**的治理动作（跨世界），所以
    这里 ``world`` 是可空的可选字段——封禁/解封针对某个公开 wiki 时填它，任命/撤销管理员
    针对某个用户时填 ``target`` 而不填 ``world``。``actor`` / ``target`` 用 SET_NULL：
    人删了事件还在，靠 ``actor_name`` / ``target_name`` 兜底。
    """

    actor = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="moderation_events_acted", verbose_name="操作者")
    actor_name = models.CharField("操作者", max_length=150, blank=True, default="")
    target = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="moderation_events_targeted", verbose_name="对象")
    target_name = models.CharField("对象", max_length=150, blank=True, default="")
    world = models.ForeignKey(World, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="moderation_events", verbose_name="涉及世界")
    action = models.CharField("动作", max_length=10, choices=MODERATION_ACTIONS, default="appoint")
    detail = models.CharField("细节", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "治理审计"
        verbose_name_plural = "治理审计"

    def __str__(self) -> str:
        return f"{self.actor_name or '?'} {self.action} {self.target_name or self.detail or '?'}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "action": self.action,
            "action_label": dict(MODERATION_ACTIONS).get(self.action, self.action),
            "actor": self.actor_name or (self.actor.username if self.actor else ""),
            "target": self.target_name or (self.target.username if self.target else ""),
            "world": self.world.name if self.world_id else "",
            "detail": self.detail,
            "when": self.created_at.isoformat() if self.created_at else "",
        }


class Report(models.Model):
    """读者对某个公开 wiki 的举报（批次 C）。

    读者在只读站点上匿名提交；只有站长（``is_privileged``）能看到与处置——管理员
    （moderator）不在举报流转里。``world`` 用 SET_NULL：世界没了举报还在，靠
    ``world_name`` / ``world_slug`` 兜底（与 ``ModerationEvent`` / ``PublishLog`` 同一套路）。
    """

    world = models.ForeignKey(World, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="reports", verbose_name="涉及世界")
    world_name = models.CharField("世界", max_length=120, blank=True, default="")
    world_slug = models.CharField("站点地址", max_length=40, blank=True, default="")
    doc_slug = models.CharField("页面", max_length=200, blank=True, default="")
    reporter = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="reports_filed", verbose_name="举报人")
    reporter_name = models.CharField("举报人", max_length=150, blank=True, default="")
    reason = models.CharField("理由", max_length=20, choices=REPORT_REASONS, default="content")
    detail = models.TextField("说明", blank=True, default="")
    contact = models.CharField("联系方式", max_length=200, blank=True, default="")
    ip = models.CharField("来源 IP", max_length=64, blank=True, default="")
    status = models.CharField("状态", max_length=10, choices=REPORT_STATUSES, default="open")
    handled_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="reports_handled", verbose_name="处置人")
    handled_by_name = models.CharField("处置人", max_length=150, blank=True, default="")
    handled_at = models.DateTimeField("处置于", null=True, blank=True)
    note = models.CharField("处置备注", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "举报"
        verbose_name_plural = "举报"

    def __str__(self) -> str:
        return f"{self.world_name or '?'} · {self.get_reason_display()}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "world": self.world_name or (self.world.name if self.world_id else ""),
            "world_slug": self.world_slug or (self.world.published_slug if self.world_id else ""),
            "world_id": self.world_id or 0,
            "doc_slug": self.doc_slug,
            "reporter": self.reporter_name or (self.reporter.username if self.reporter else "匿名读者"),
            "reason": self.reason,
            "reason_label": self.get_reason_display(),
            "detail": self.detail,
            "contact": self.contact,
            "ip": self.ip,
            "status": self.status,
            "status_label": self.get_status_display(),
            "handled_by": self.handled_by_name or (self.handled_by.username if self.handled_by else ""),
            "handled_at": self.handled_at.isoformat() if self.handled_at else "",
            "note": self.note,
            "when": self.created_at.isoformat() if self.created_at else "",
        }
