# -*- coding: utf-8 -*-
"""AI 应用的模型：供应商凭据、会话、消息与变更集。

设计约定：

- 凭据（``AiCredential``）属于**用户**而不是世界，加密后的 Key 只写不读；
- 会话（``AiConversation``）与变更集（``AiChangeSet``）属于**世界**，
  但记录发起人，便于权限与审计；
- AI 的任何写入都先变成 ``AiChange``，``status`` 从 ``pending`` 出发，
  由用户在界面上 **应用** 或 **拒绝**。
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

PROVIDER_OPENAI = "openai"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_GEMINI = "gemini"
PROVIDER_CUSTOM = "custom"

PROVIDERS = [
    (PROVIDER_OPENAI, "OpenAI"),
    (PROVIDER_ANTHROPIC, "Anthropic"),
    (PROVIDER_GEMINI, "Google Gemini"),
    (PROVIDER_CUSTOM, "自定义（OpenAI 兼容）"),
]

ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"
ROLE_TOOL = "tool"
ROLES = [
    (ROLE_USER, "用户"),
    (ROLE_ASSISTANT, "助手"),
    (ROLE_TOOL, "工具"),
]

STATUS_PENDING = "pending"
STATUS_APPLIED = "applied"
STATUS_REJECTED = "rejected"
STATUS_FAILED = "failed"
CHANGESET_STATUSES = [
    (STATUS_PENDING, "待审阅"),
    (STATUS_APPLIED, "已应用"),
    (STATUS_REJECTED, "已拒绝"),
    (STATUS_FAILED, "应用失败"),
]

CHANGE_CREATE_DOCUMENT = "create_document"
CHANGE_UPDATE_DOCUMENT = "update_document"
CHANGE_EDIT_BLOCKS = "edit_blocks"
CHANGE_CREATE_TIMELINE_EVENT = "create_timeline_event"
CHANGE_KINDS = [
    (CHANGE_CREATE_DOCUMENT, "新建文档"),
    (CHANGE_UPDATE_DOCUMENT, "修改文档"),
    (CHANGE_EDIT_BLOCKS, "编辑正文块"),
    (CHANGE_CREATE_TIMELINE_EVENT, "新建时间线事件"),
]


class AiCredential(models.Model):
    """用户自己的供应商配置（BYOK）。"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_credentials",
        verbose_name="用户",
    )
    provider = models.CharField("供应商", max_length=20, choices=PROVIDERS, default=PROVIDER_OPENAI)
    label = models.CharField("备注名", max_length=60, blank=True, default="")
    base_url = models.CharField("接口地址", max_length=300, blank=True, default="")
    model = models.CharField("模型", max_length=120, blank=True, default="")
    encrypted_key = models.TextField("加密后的密钥")
    key_hint = models.CharField("密钥尾号", max_length=8, blank=True, default="")
    is_default = models.BooleanField("默认", default=False)
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        ordering = ["-is_default", "id"]
        verbose_name = "AI 凭据"
        verbose_name_plural = "AI 凭据"

    def __str__(self):
        return self.label or self.get_provider_display()

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            # 同一用户只保留一个默认凭据，省得每次请求都要挑
            AiCredential.objects.filter(user_id=self.user_id, is_default=True).exclude(
                pk=self.pk
            ).update(is_default=False)

    def to_payload(self) -> dict:
        """前端可见字段：绝不回传密钥本身。"""
        return {
            "id": self.id,
            "provider": self.provider,
            "provider_label": self.get_provider_display(),
            "label": self.label,
            "base_url": self.base_url,
            "model": self.model,
            "key_hint": self.key_hint,
            "has_key": bool(self.encrypted_key),
            "is_default": self.is_default,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AiConversation(models.Model):
    """一个世界里的一个对话线程。"""

    world = models.ForeignKey(
        "world.World", on_delete=models.CASCADE, related_name="ai_conversations",
        verbose_name="世界",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_conversations",
        verbose_name="发起人",
    )
    document = models.ForeignKey(
        "documents.Document", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="ai_conversations", verbose_name="关联文档",
    )
    title = models.CharField("标题", max_length=120, blank=True, default="")
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        verbose_name = "AI 会话"
        verbose_name_plural = "AI 会话"

    def __str__(self):
        return self.title or f"会话 #{self.pk}"

    def to_payload(self, with_messages: bool = False) -> dict:
        payload = {
            "id": self.id,
            "world": self.world_id,
            "document": self.document_id,
            "document_name": self.document.name if self.document_id else None,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if with_messages:
            payload["messages"] = [m.to_payload() for m in self.messages.all()]
        return payload


class AiMessage(models.Model):
    """会话消息。``tool_calls`` 只在 assistant 消息上出现。"""

    conversation = models.ForeignKey(
        AiConversation, on_delete=models.CASCADE, related_name="messages", verbose_name="会话",
    )
    role = models.CharField("角色", max_length=12, choices=ROLES)
    content = models.TextField("内容", blank=True, default="")
    reasoning = models.TextField("思考过程", blank=True, default="")
    # {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, ...}
    usage = models.JSONField("用量", default=dict, blank=True)
    # [{"id": "...", "name": "...", "arguments": {...}}]
    tool_calls = models.JSONField("工具调用", default=list, blank=True)
    tool_call_id = models.CharField("工具调用 ID", max_length=80, blank=True, default="")
    name = models.CharField("工具名", max_length=60, blank=True, default="")
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "AI 消息"
        verbose_name_plural = "AI 消息"

    def __str__(self):
        return f"{self.role}: {self.content[:30]}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "reasoning": self.reasoning,
            "usage": self.usage if isinstance(self.usage, dict) else {},
            "tool_calls": self.tool_calls if isinstance(self.tool_calls, list) else [],
            "tool_call_id": self.tool_call_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AiChangeSet(models.Model):
    """AI 一次回复里提出的全部改动，作为整体审阅。"""

    world = models.ForeignKey(
        "world.World", on_delete=models.CASCADE, related_name="ai_changesets", verbose_name="世界",
    )
    conversation = models.ForeignKey(
        AiConversation, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="changesets", verbose_name="会话",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="ai_changesets", verbose_name="发起人",
    )
    status = models.CharField("状态", max_length=12, choices=CHANGESET_STATUSES, default=STATUS_PENDING)
    summary = models.TextField("摘要", blank=True, default="")
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    reviewed_at = models.DateTimeField("审阅于", null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "AI 变更集"
        verbose_name_plural = "AI 变更集"

    def __str__(self):
        return self.summary[:40] or f"变更集 #{self.pk}"

    def mark_reviewed(self, status: str) -> None:
        self.status = status
        self.reviewed_at = timezone.now()
        self.save(update_fields=["status", "reviewed_at"])

    def to_payload(self, with_changes: bool = True) -> dict:
        payload = {
            "id": self.id,
            "world": self.world_id,
            "conversation": self.conversation_id,
            "user": self.user_id,
            "status": self.status,
            "status_label": self.get_status_display(),
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
        }
        if with_changes:
            payload["changes"] = [c.to_payload() for c in self.changes.all()]
        return payload


class AiChange(models.Model):
    """变更集里的一条改动。"""

    changeset = models.ForeignKey(
        AiChangeSet, on_delete=models.CASCADE, related_name="changes", verbose_name="变更集",
    )
    kind = models.CharField("类型", max_length=32, choices=CHANGE_KINDS)
    payload = models.JSONField("内容", default=dict, blank=True)
    status = models.CharField("状态", max_length=12, choices=CHANGESET_STATUSES, default=STATUS_PENDING)
    error = models.TextField("错误", blank=True, default="")
    result = models.JSONField("结果", default=dict, blank=True)
    position = models.PositiveIntegerField("排序", default=0)

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "AI 变更"
        verbose_name_plural = "AI 变更"

    def __str__(self):
        return f"{self.get_kind_display()} #{self.pk}"

    @property
    def title(self) -> str:
        if self.kind == CHANGE_CREATE_DOCUMENT:
            return self.payload.get("name") or "新建文档"
        if self.kind == CHANGE_UPDATE_DOCUMENT:
            return "修改文档"
        if self.kind == CHANGE_EDIT_BLOCKS:
            return self.payload.get("document_name") or "编辑正文块"
        if self.kind == CHANGE_CREATE_TIMELINE_EVENT:
            return self.payload.get("title") or "新建事件"
        return self.get_kind_display()

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "kind_label": self.get_kind_display(),
            "title": self.title,
            "payload": self.payload if isinstance(self.payload, dict) else {},
            "status": self.status,
            "error": self.error,
            "result": self.result if isinstance(self.result, dict) else {},
            "position": self.position,
        }
