# -*- coding: utf-8 -*-
"""AI 接口：BYOK 凭据、会话、对话与变更集审阅。

写入边界：``/api/world/ai/`` 在 ``permissions.OPEN_WRITE_PREFIXES`` 里放行，
因为凭据接口属于「用户」而不是某个世界；所以**每个视图自己**做细粒度校验：

* 凭据 / 会话 / 对话：登录即可，凭据只读写自己的；
* 对话与变更集：还要 ``can_read`` / ``can_edit`` 当前世界；
* AI 的写入永远先落到 ``AiChange``，应用时才真正改业务模型。
"""

from __future__ import annotations

import uuid

from django.core.cache import cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.documents.models import Card, Document, TimelineEvent, WorldTimeline
from apps.graph.models import TreeVariant
from apps.world import permissions
from apps.world.models import (
    DOC_CARD,
    DOC_TIMELINE,
    DOC_TREE,
    DOC_TYPES,
    PRECISIONS,
    TREE_KINDS,
)
from apps.world.normalize import (
    as_int,
    as_text,
    blocks_to_text,
    default_values_for,
    doc_to_blocks,
    normalize_blocks,
    normalize_doc,
)
from apps.world.views.common import (
    current_world_or_none,
    get_document,
    json_response,
    parse_json,
    save_document_settings,
    touch_document,
)

from . import providers, services
from .crypto import encrypt_secret, key_hint
from .models import (
    CHANGE_CREATE_DOCUMENT,
    CHANGE_CREATE_TIMELINE_EVENT,
    CHANGE_UPDATE_DOCUMENT,
    PROVIDERS,
    STATUS_APPLIED,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_REJECTED,
    AiChange,
    AiChangeSet,
    AiConversation,
    AiCredential,
)

#: 每个用户每分钟最多发起的对话轮数——AI 调用花的是用户自己的钱，
#: 但限流仍然要防误触与脚本刷接口。
CHAT_RATE_LIMIT = 20
CHAT_RATE_WINDOW = 60

VALID_DOC_TYPES = {value for value, _label in DOC_TYPES}
VALID_PRECISIONS = {value for value, _label in PRECISIONS}


class ChangeError(Exception):
    """一条改动无法应用（文档被删、类型不对等），文案直接回给前端。"""


def _login_required(request):
    if request.user and request.user.is_authenticated:
        return None
    return json_response({"error": "请先登录", "need_login": True}, status=401)


def _world_required(request):
    """取当前世界；不存在时返回 ``(None, 404)``。"""
    world = current_world_or_none()
    if world is None:
        return None, json_response({"error": "世界不存在"}, status=404)
    return world, None


def _readable_world(request):
    world, denied = _world_required(request)
    if denied is not None:
        return None, denied
    if not permissions.can_read(request.user, world):
        if not (request.user and request.user.is_authenticated):
            return None, json_response({"error": "请先登录", "need_login": True}, status=401)
        return None, json_response({"error": "你不在这个世界里"}, status=403)
    return world, None


def _editable_world(request):
    world, denied = _readable_world(request)
    if denied is not None:
        return None, denied
    if not permissions.can_edit(request.user, world):
        return None, json_response({"error": "你在这个世界里是只读权限"}, status=403)
    return world, None


def _rate_limited(user_id) -> bool:
    """简单固定窗口限流：窗口内第一次调用时建键，之后自增。"""
    key = f"ai-chat-rate:{user_id}"
    if cache.add(key, 1, CHAT_RATE_WINDOW):
        return False
    try:
        count = cache.incr(key)
    except ValueError:          # 键刚好过期，重开一个窗口
        cache.set(key, 1, CHAT_RATE_WINDOW)
        return False
    return count > CHAT_RATE_LIMIT


# --------------------------------------------------------------------------- #
# 凭据（BYOK）
# --------------------------------------------------------------------------- #
def _clean_provider(value) -> str:
    provider = as_text(value, 20)
    return provider if provider in dict(PROVIDERS) else ""


@csrf_exempt
@require_http_methods(["GET", "POST"])
def credential_collection(request):
    """列出 / 新建自己的供应商凭据。GET 顺带给出供应商目录与默认地址。"""
    denied = _login_required(request)
    if denied is not None:
        return denied

    if request.method == "GET":
        credentials = AiCredential.objects.filter(user=request.user)
        return json_response({
            "credentials": [credential.to_payload() for credential in credentials],
            "providers": providers.provider_choices(),
        })

    payload = parse_json(request)
    provider = _clean_provider(payload.get("provider"))
    if not provider:
        return json_response({"error": "请选择供应商"}, status=400)
    api_key = as_text(payload.get("api_key"), 400)
    if not api_key:
        return json_response({"error": "请填写 API Key"}, status=400)

    credential = AiCredential(
        user=request.user,
        provider=provider,
        label=as_text(payload.get("label"), 60),
        base_url=as_text(payload.get("base_url"), 300),
        model=as_text(payload.get("model"), 120),
        encrypted_key=encrypt_secret(api_key),
        key_hint=key_hint(api_key),
    )
    first = not AiCredential.objects.filter(user=request.user).exists()
    credential.is_default = bool(payload.get("is_default")) or first
    credential.save()
    return json_response(credential.to_payload(), status=201)


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "DELETE"])
def credential_detail(request, credential_id):
    """改 / 删自己的凭据；密钥只写不读，留空表示不改。"""
    denied = _login_required(request)
    if denied is not None:
        return denied
    credential = AiCredential.objects.filter(pk=credential_id, user=request.user).first()
    if credential is None:
        return json_response({"error": "未找到该凭据"}, status=404)

    if request.method == "DELETE":
        was_default = credential.is_default
        credential.delete()
        if was_default:
            replacement = AiCredential.objects.filter(user=request.user).order_by("id").first()
            if replacement is not None:
                replacement.is_default = True
                replacement.save(update_fields=["is_default"])
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "provider" in payload:
        provider = _clean_provider(payload.get("provider"))
        if not provider:
            return json_response({"error": "未知的供应商"}, status=400)
        credential.provider = provider
    for field, limit in (("label", 60), ("base_url", 300), ("model", 120)):
        if field in payload:
            setattr(credential, field, as_text(payload.get(field), limit))

    api_key = as_text(payload.get("api_key"), 400)
    if api_key:
        credential.encrypted_key = encrypt_secret(api_key)
        credential.key_hint = key_hint(api_key)
    if "is_default" in payload:
        credential.is_default = bool(payload.get("is_default"))
    credential.save()
    return json_response(credential.to_payload())


# --------------------------------------------------------------------------- #
# 会话
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["GET", "POST"])
def conversation_collection(request):
    """当前世界里的会话（只看自己的）——列表 / 新建。"""
    world, denied = _readable_world(request)
    if denied is not None:
        return denied

    if request.method == "GET":
        conversations = (
            world.ai_conversations.filter(user=request.user)
            .select_related("document")
            .order_by("-updated_at", "-id")[:50]
        )
        return json_response({
            "conversations": [conversation.to_payload() for conversation in conversations],
        })

    payload = parse_json(request)
    document = None
    document_id = as_int(payload.get("document_id"), 0)
    if document_id:
        document = get_document(world, document_id)
        if document is None:
            return json_response({"error": "未找到该文档"}, status=404)
    conversation = AiConversation.objects.create(
        world=world,
        user=request.user,
        document=document,
        title=as_text(payload.get("title"), 120),
    )
    return json_response(conversation.to_payload(with_messages=True), status=201)


@csrf_exempt
@require_http_methods(["GET", "DELETE"])
def conversation_detail(request, conversation_id):
    world, denied = _readable_world(request)
    if denied is not None:
        return denied
    conversation = world.ai_conversations.filter(
        pk=conversation_id, user=request.user,
    ).select_related("document").first()
    if conversation is None:
        return json_response({"error": "未找到该会话"}, status=404)

    if request.method == "DELETE":
        conversation.delete()
        return json_response({"success": True, "removed": True})
    return json_response(conversation.to_payload(with_messages=True))


# --------------------------------------------------------------------------- #
# 对话
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_http_methods(["POST"])
def chat(request):
    """跑一轮对话：服务端编排模型与工具，写入只生成变更集。"""
    world, denied = _readable_world(request)
    if denied is not None:
        return denied
    if not world.ai_enabled:
        return json_response({"error": "这个世界还没有开启 AI 功能"}, status=403)
    if _rate_limited(request.user.id):
        return json_response({"error": "请求太频繁，请稍后再试"}, status=429)

    payload = parse_json(request)
    text = as_text(payload.get("message"), 8000)
    if not text:
        return json_response({"error": "说点什么吧"}, status=400)

    conversation_id = as_int(payload.get("conversation_id"), 0)
    if conversation_id:
        conversation = world.ai_conversations.filter(
            pk=conversation_id, user=request.user,
        ).first()
        if conversation is None:
            return json_response({"error": "未找到该会话"}, status=404)
    else:
        document = None
        document_id = as_int(payload.get("document_id"), 0)
        if document_id:
            document = get_document(world, document_id)
            if document is None:
                return json_response({"error": "未找到该文档"}, status=404)
        conversation = AiConversation.objects.create(
            world=world, user=request.user, document=document,
        )

    try:
        result = services.run_chat(
            world, request.user, conversation, text,
            can_edit=permissions.can_edit(request.user, world),
        )
    except providers.NoCredentialError:
        return json_response({
            "error": "还没有配置 AI 供应商与 API Key",
            "code": "no_credential",
        }, status=400)
    except providers.ProviderError as exc:
        return json_response({"error": str(exc)}, status=502)

    result["conversation"] = conversation.to_payload()
    return json_response(result)


# --------------------------------------------------------------------------- #
# 变更集
# --------------------------------------------------------------------------- #
@require_http_methods(["GET"])
def changeset_collection(request):
    world, denied = _readable_world(request)
    if denied is not None:
        return denied
    queryset = world.ai_changesets.all()
    status = as_text(request.GET.get("status"), 20)
    if status in (STATUS_PENDING, STATUS_APPLIED, STATUS_REJECTED, STATUS_FAILED):
        queryset = queryset.filter(status=status)
    changesets = queryset.order_by("-id")[:50]
    return json_response({
        "changesets": [changeset.to_payload() for changeset in changesets],
    })


@require_http_methods(["GET"])
def changeset_detail(request, changeset_id):
    world, denied = _readable_world(request)
    if denied is not None:
        return denied
    changeset = world.ai_changesets.filter(pk=changeset_id).first()
    if changeset is None:
        return json_response({"error": "未找到该变更集"}, status=404)
    return json_response(changeset.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def changeset_apply(request, changeset_id):
    """逐条应用改动；失败的条目记下原因，成功的条目立即生效。"""
    world, denied = _editable_world(request)
    if denied is not None:
        return denied
    changeset = world.ai_changesets.filter(pk=changeset_id).first()
    if changeset is None:
        return json_response({"error": "未找到该变更集"}, status=404)
    if changeset.status != STATUS_PENDING:
        return json_response({"error": "这个变更集已经审阅过了"}, status=409)

    applied = 0
    failed = 0
    for change in changeset.changes.all():
        if change.status != STATUS_PENDING:
            continue
        try:
            result = _apply_change(change, world, request.user)
        except ChangeError as exc:
            change.status = STATUS_FAILED
            change.error = str(exc)
            change.save(update_fields=["status", "error"])
            failed += 1
        else:
            change.status = STATUS_APPLIED
            change.result = result
            change.error = ""
            change.save(update_fields=["status", "result", "error"])
            applied += 1

    changeset.mark_reviewed(STATUS_APPLIED if failed == 0 else STATUS_FAILED)
    return json_response({
        "changeset": changeset.to_payload(),
        "applied": applied,
        "failed": failed,
    })


@csrf_exempt
@require_http_methods(["POST"])
def changeset_reject(request, changeset_id):
    """整份拒绝：未处理的条目全部标为 ``rejected``，不碰业务数据。"""
    world, denied = _editable_world(request)
    if denied is not None:
        return denied
    changeset = world.ai_changesets.filter(pk=changeset_id).first()
    if changeset is None:
        return json_response({"error": "未找到该变更集"}, status=404)
    if changeset.status != STATUS_PENDING:
        return json_response({"error": "这个变更集已经审阅过了"}, status=409)

    changeset.changes.filter(status=STATUS_PENDING).update(status=STATUS_REJECTED)
    changeset.mark_reviewed(STATUS_REJECTED)
    return json_response(changeset.to_payload())


# --------------------------------------------------------------------------- #
# 应用一条改动
# --------------------------------------------------------------------------- #
def _apply_change(change: AiChange, world, user) -> dict:
    payload = change.payload if isinstance(change.payload, dict) else {}
    if change.kind == CHANGE_CREATE_DOCUMENT:
        return _apply_create_document(world, user, payload)
    if change.kind == CHANGE_UPDATE_DOCUMENT:
        return _apply_update_document(world, user, payload)
    if change.kind == CHANGE_CREATE_TIMELINE_EVENT:
        return _apply_create_timeline_event(world, user, payload)
    raise ChangeError("不认识的改动类型")


def _apply_create_document(world, user, payload: dict) -> dict:
    doc_type = as_text(payload.get("document_type"), 40) or DOC_CARD
    if doc_type not in VALID_DOC_TYPES:
        raise ChangeError(f"未知的文档类型：{doc_type}")
    name = as_text(payload.get("name"), 200) or "未命名"

    parent = None
    parent_id = as_int(payload.get("parent_id"), 0)
    if parent_id:
        parent = get_document(world, parent_id)
        if parent is None:
            raise ChangeError("父文档不存在或已删除")

    era = None
    era_id = as_int(payload.get("era_id"), 0)
    if era_id:
        era = world.eras.filter(pk=era_id).first()
        if era is None:
            raise ChangeError("纪元不存在")

    entity_type = None
    if doc_type == DOC_CARD:
        entity_type_id = as_int(payload.get("entity_type"), 0)
        if entity_type_id:
            entity_type = world.types.filter(pk=entity_type_id).first()
            if entity_type is None:
                raise ChangeError("卡片类型不存在")

    document = Document.objects.create(
        world=world,
        document_type=doc_type,
        name=name,
        parent=parent,
        position=world.documents.filter(parent=parent).count(),
        era=era,
        entity_type=entity_type,
    )
    if doc_type == DOC_CARD:
        Card.objects.create(
            document=document,
            entity_type=entity_type,
            values=default_values_for(entity_type) if entity_type is not None else {},
            blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": ""}]),
        )
    elif doc_type == DOC_TIMELINE:
        calendar = world.calendars.order_by("id").first()
        if calendar is not None:
            save_document_settings(document, {"calendar": calendar.id})
            document.save(update_fields=["settings"])
    elif doc_type == DOC_TREE:
        TreeVariant.objects.create(document=document, kind=TREE_KINDS[0][0])

    touch_document(document, label="AI 新建文档", author=user)
    return {"document_id": document.id, "name": document.name, "document_type": doc_type}


def _append_card_text(card: Card, text: str) -> None:
    """把一段文字追加到卡片正文末尾。

    ``blocks_doc`` 是孤岛编辑器的权威存储：它非空时必须往它里面加块，
    否则只改 ``blocks`` 不会显示在编辑器里。
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()] or [text.strip()]

    if isinstance(card.blocks_doc, list) and card.blocks_doc:
        blocks = list(card.blocks_doc)
        for line in lines:
            blocks.append({
                "id": f"ai{uuid.uuid4().hex[:10]}",
                "type": "paragraph",
                "content": [{"type": "text", "text": line, "styles": {}}],
                "children": [],
            })
        card.blocks_doc = normalize_doc(blocks)
        card.blocks = normalize_blocks(doc_to_blocks(card.blocks_doc))
        card.body = blocks_to_text(card.blocks)
        card.save(update_fields=["blocks_doc", "blocks", "body"])
        return

    blocks = list(card.blocks or [])
    for line in lines:
        blocks.append({
            "id": f"ai{uuid.uuid4().hex[:10]}",
            "type": "text",
            "title": "",
            "text": line,
        })
    card.blocks = normalize_blocks(blocks)
    card.body = blocks_to_text(card.blocks)
    card.blocks_doc = []
    card.save(update_fields=["blocks", "body", "blocks_doc"])


def _apply_update_document(world, user, payload: dict) -> dict:
    document = get_document(world, as_int(payload.get("document_id"), 0))
    if document is None:
        raise ChangeError("文档不存在或已删除")
    name = as_text(payload.get("name"), 200)
    append_text = as_text(payload.get("append_text"), 8000)
    if not name and not append_text:
        raise ChangeError("没有要修改的内容")
    if append_text and document.document_type != DOC_CARD:
        raise ChangeError("只有卡片的正文可以直接追加")

    if name:
        document.name = name
        document.save(update_fields=["name"])
    if append_text:
        card, _created = Card.objects.get_or_create(
            document=document, defaults={"entity_type": document.entity_type},
        )
        _append_card_text(card, append_text)

    touch_document(document, label="AI 修改文档", author=user)
    return {"document_id": document.id, "name": document.name}


def _apply_create_timeline_event(world, user, payload: dict) -> dict:
    # 0.7.0：没指定旧时间线文档时，事件直接落到世界总时间线
    document = None
    document_id = as_int(payload.get("document_id"), 0)
    if document_id:
        document = get_document(world, document_id)
        if document is None:
            raise ChangeError("文档不存在或已删除")
        if document.document_type != DOC_TIMELINE:
            raise ChangeError("目标文档不是时间线")
        timeline = None
    else:
        timeline = WorldTimeline.for_world(world)
    title = as_text(payload.get("title"), 160)
    if not title:
        raise ChangeError("事件标题不能为空")

    precision = as_text(payload.get("precision"), 20)
    if precision not in VALID_PRECISIONS:
        precision = "day"
    era = None
    era_id = as_int(payload.get("era_id"), 0)
    if era_id:
        era = world.eras.filter(pk=era_id).first()
        if era is None:
            raise ChangeError("纪元不存在")

    event = TimelineEvent.objects.create(
        timeline=timeline,
        document=document,
        title=title,
        precision=precision,
        year=as_int(payload.get("year"), 0),
        month=max(1, min(as_int(payload.get("month"), 1), 12)),
        day=max(1, min(as_int(payload.get("day"), 1), 31)),
        era=era,
        description=as_text(payload.get("description"), 2000),
        position=(document.events.count() if document is not None else timeline.events.count()),
    )
    if document is not None:
        touch_document(document, label="AI 新建事件", author=user)
    return {"event_id": event.id, "document_id": document.id if document is not None else None,
            "title": event.title}


__all__ = [
    "chat",
    "changeset_apply",
    "changeset_collection",
    "changeset_detail",
    "changeset_reject",
    "conversation_collection",
    "conversation_detail",
    "credential_collection",
    "credential_detail",
]
