# -*- coding: utf-8 -*-
"""AI 服务层：拼 system prompt、跑工具调用循环、收集变更集。

这里刻意不碰 Django 视图：视图只负责鉴权、参数校验与限流，真正的编排
（模型 → 工具 → 模型 → …）全部收在这一个函数里。
"""

from __future__ import annotations

import json
import logging

from apps.documents.models import Document, Era
from apps.world.models import DOC_TYPES, EntityType

from . import providers
from .crypto import decrypt_secret
from .models import (
    ROLE_ASSISTANT,
    ROLE_TOOL,
    ROLE_USER,
    AiChange,
    AiChangeSet,
    AiConversation,
    AiCredential,
    AiMessage,
    STATUS_PENDING,
)
from .tools import ToolRunner

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 6
HISTORY_LIMIT = 40

_SYSTEM_PROMPT = """你是「{world_name}」这个虚构世界的创作助手。

世界概况：
- 简介：{description}
- 题材：{genres}
- 文档：共 {doc_count} 篇（{type_summary}）
- 纪元：{era_summary}
- 卡片类型：{type_names}

工作规则：
1. 需要细节时先调用只读工具查证，不要凭空编造世界里已有的设定。
2. 任何新建或修改都必须调用 propose_* 工具。改动不会立刻生效，会进入「变更集」
   由用户逐条确认，所以一次只提议真正必要的最小改动。
3. 用简体中文回答，简洁、具体；不要声称自己已经直接改动了数据。
4. 如果用户只是提问或讨论，不要调用提议工具。"""


def build_system_prompt(world) -> str:
    """把世界的骨架信息压成一段 system prompt（不含正文，省 token）。"""
    documents = Document.objects.filter(world=world, deleted_at__isnull=True)
    counts: dict[str, int] = {}
    for document in documents.only("document_type"):
        counts[document.document_type] = counts.get(document.document_type, 0) + 1
    labels = dict(DOC_TYPES)
    type_summary = "、".join(
        f"{labels.get(key, key)} {value}" for key, value in sorted(counts.items(), key=lambda kv: -kv[1])
    ) or "暂无"
    eras = list(Era.objects.filter(world=world).order_by("position", "id")[:12])
    era_summary = "、".join(
        f"{era.name}{'（' + str(era.length_years) + '年）' if era.length_years else ''}" for era in eras
    ) or "暂无"
    type_names = "、".join(
        EntityType.objects.filter(world=world).order_by("position", "id").values_list("name", flat=True)
    ) or "暂无"
    genres = world.genres if isinstance(world.genres, list) else []
    return _SYSTEM_PROMPT.format(
        world_name=world.name or "未命名世界",
        description=(world.description or "（未填写）").strip()[:500],
        genres="、".join(str(item) for item in genres) or "未填写",
        doc_count=documents.count(),
        type_summary=type_summary,
        era_summary=era_summary,
        type_names=type_names,
    )


def get_credential(user) -> AiCredential | None:
    """优先默认凭据，其次最近更新的那条。"""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    queryset = AiCredential.objects.filter(user=user)
    return queryset.order_by("-is_default", "-updated_at", "-id").first()


def _wire_message(message: AiMessage) -> dict:
    if message.role == ROLE_ASSISTANT:
        return {
            "role": "assistant",
            "content": message.content,
            "tool_calls": message.tool_calls if isinstance(message.tool_calls, list) else [],
        }
    if message.role == ROLE_TOOL:
        return {
            "role": "tool",
            "tool_call_id": message.tool_call_id,
            "name": message.name,
            "content": message.content,
        }
    return {"role": "user", "content": message.content}


def _history(conversation: AiConversation) -> list[dict]:
    messages = list(conversation.messages.order_by("-id")[:HISTORY_LIMIT])
    return [_wire_message(message) for message in reversed(messages)]


def _conversation_document(world, conversation: AiConversation) -> Document | None:
    """会话绑定的「当前打开文档」；已删除 / 跨世界时当作没有。"""
    if not conversation.document_id:
        return None
    return Document.objects.filter(
        pk=conversation.document_id, world=world, deleted_at__isnull=True
    ).first()


def _save_changeset(world, conversation, user, runner: ToolRunner) -> AiChangeSet | None:
    if not runner.changes:
        return None
    summary = "\n".join(f"- {change['summary']}" for change in runner.changes)
    changeset = AiChangeSet.objects.create(
        world=world,
        conversation=conversation,
        user=user,
        status=STATUS_PENDING,
        summary=summary,
    )
    for position, change in enumerate(runner.changes):
        AiChange.objects.create(
            changeset=changeset,
            kind=change["kind"],
            payload=change["payload"],
            position=position,
        )
    return changeset


def run_chat(world, user, conversation: AiConversation, user_text: str,
             can_edit: bool = False) -> dict:
    """跑一轮完整对话；返回最后一条助手消息与（可能有的）变更集。

    抛 ``providers.NoCredentialError`` / ``providers.ProviderError``。
    """
    credential = get_credential(user)
    if credential is None:
        raise providers.NoCredentialError("还没有配置 AI 供应商与 API Key")
    try:
        api_key = decrypt_secret(credential.encrypted_key)
    except ValueError as exc:
        raise providers.ProviderError("保存的 API Key 无法解密，请重新填写") from exc

    AiMessage.objects.create(conversation=conversation, role=ROLE_USER, content=user_text)
    if not conversation.title:
        conversation.title = user_text.strip()[:40] or "新对话"
        conversation.save(update_fields=["title", "updated_at"])

    system = build_system_prompt(world)
    document = _conversation_document(world, conversation)
    if document is not None:
        system += (
            f"\n\n用户当前打开的文档是《{document.name}》"
            f"（id={document.id}，类型：{document.get_document_type_display()}）。"
            "问题与它相关时，先用 get_document 读取正文再回答。"
        )
    wire = _history(conversation)
    runner = ToolRunner(world, user=user, can_edit=can_edit)
    assistant_message: AiMessage | None = None

    for _round in range(MAX_TOOL_ROUNDS):
        result = providers.chat(
            credential.provider,
            api_key,
            credential.base_url,
            credential.model,
            system,
            wire,
            runner.schemas(),
        )
        assistant_message = AiMessage.objects.create(
            conversation=conversation,
            role=ROLE_ASSISTANT,
            content=result.text,
            tool_calls=result.tool_calls,
        )
        wire.append(_wire_message(assistant_message))
        if not result.tool_calls:
            break
        for call in result.tool_calls:
            output = runner.run(call.get("name") or "", call.get("arguments") or {})
            content = json.dumps(output, ensure_ascii=False)
            tool_message = AiMessage.objects.create(
                conversation=conversation,
                role=ROLE_TOOL,
                content=content,
                tool_call_id=call.get("id") or "",
                name=call.get("name") or "",
            )
            wire.append(_wire_message(tool_message))
    else:
        # 轮次用尽：再给模型一次不带工具的收尾机会
        result = providers.chat(
            credential.provider, api_key, credential.base_url, credential.model,
            system, wire, [],
        )
        assistant_message = AiMessage.objects.create(
            conversation=conversation, role=ROLE_ASSISTANT, content=result.text,
        )

    conversation.save(update_fields=["updated_at"])
    changeset = _save_changeset(world, conversation, user, runner)
    return {
        "message": assistant_message.to_payload() if assistant_message else None,
        "changeset": changeset.to_payload() if changeset else None,
    }
