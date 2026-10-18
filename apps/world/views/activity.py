# -*- coding: utf-8 -*-
"""活动流 / 在线心跳 / 文档版本历史。

（原 ``world/views.py`` 的「活动流 / 在线心跳 / 文档版本历史。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .. import permissions
from ..models import (
    InviteCode,
    MemberEvent,
    Membership,
)
from ..normalize import as_alias_list, as_int, as_text, blocks_to_text, normalize_blocks, normalize_doc
from apps.documents.models import Card, DocumentVersion, Presence
from apps.publishing.models import PublishLog

from .common import (
    DOC_NOT_FOUND,
    current_world,
    get_document,
    json_response,
    parse_json,
    snapshot_document,
    touch_document,
)


def _member_event_text(event) -> str:
    """把一条成员审计翻译成一句话（活动流的 ``what``）。"""
    actor = event.actor_name or (event.actor.username if event.actor else "有人")
    target = event.target_name or (event.target.username if event.target else "某人")
    if event.action == "role":
        return f"{actor} 把 {target} 的角色改成了 {event.detail}"
    if event.action == "remove":
        return f"{actor} 把 {target} 移出了世界"
    if event.action == "invite":
        return f"{actor} 发了一个邀请码：{event.detail}"
    if event.action == "revoke":
        return f"{actor} 作废了邀请码：{event.detail}"
    return f"{actor} 把 {target} 加进了世界"


@require_safe
def activity(request):
    """最近发生的事——通知中心的数据源。

    数据来源：``PublishLog``（发布了哪一版）、``DocumentVersion``（谁改了哪份文档）、
    ``Membership`` / ``InviteCode``（谁进来了、还留着几个邀请码）以及 ``MemberEvent``
    （改角色 / 移出 / 发码 / 作废的审计留痕——成员被移除后 Membership 行就没了，
    全靠它才追得回来）。

    每条都给 ``when``（ISO 时间），前端按"上次读到哪儿"算未读数。
    """
    world = current_world()
    viewer = request.user if request.user.is_authenticated else None
    rows: list[dict] = []

    for log in PublishLog.objects.filter(world=world).order_by("-version", "-id")[:4]:
        changed = len(log.changed or [])
        added = len(log.added or [])
        rows.append({
            "kind": "publish",
            "what": f"发布了 v{log.version}：新增 {added} · 更新 {changed}",
            "when": log.created_at.isoformat() if log.created_at else "",
            "by": log.author_name or (log.author.username if log.author else ""),
            "url": f"/s/{world.published_slug}/" if world.is_published else "",
        })

    versions = (DocumentVersion.objects
                .filter(document__world=world, document__deleted_at__isnull=True)
                .select_related("document")
                .order_by("-created_at"))
    if viewer is not None:
        versions = versions.exclude(author=viewer)
    # 同一份文档只留最近的一条：不然"改了三次标题"会把整条流刷满
    seen_docs: set[int] = set()
    for version in versions[:60]:
        if version.document_id in seen_docs:
            continue
        seen_docs.add(version.document_id)
        who = version.author_name or (version.author.username if version.author else "有人")
        rows.append({
            "kind": "edit",
            "what": f"{who} 改了《{version.document.name}》"
                    + (f" · {version.label}" if version.label else ""),
            "when": version.created_at.isoformat() if version.created_at else "",
            "by": who,
            "doc": version.document_id,
            "url": f"/w/{world.slug}#doc={version.document_id}",
        })
        if len(seen_docs) >= 6:
            break

    members = Membership.objects.filter(world=world).select_related("user").order_by("-created_at")
    if viewer is not None:
        members = members.exclude(user=viewer)
    for membership in members[:4]:
        who = membership.user.get_full_name() or membership.user.username
        rows.append({
            "kind": "invite",
            "what": f"{who} 加入了这个世界（{membership.get_role_display()}）",
            "when": membership.created_at.isoformat() if membership.created_at else "",
            "by": who,
            "url": "",
        })

    # 成员变更审计：改角色 / 移出 / 发码 / 作废。"加入"交给上面 Membership 那一拨，
    # 这里排除掉免得同一件事出现两行；被移除的人 Membership 行已不在，只剩这里的留痕。
    # 审计不按"是不是本人干的"过滤——留痕就该给管理员看全，包括自己那几笔。
    for event in MemberEvent.objects.filter(world=world).exclude(action="join").select_related("actor", "target")[:6]:
        rows.append({
            "kind": "member",
            "what": _member_event_text(event),
            "when": event.created_at.isoformat() if event.created_at else "",
            "by": event.actor_name,
            "url": "",
        })

    if viewer is not None and permissions.can_edit(viewer, world):
        spare = [code for code in InviteCode.objects.filter(world=world)[:8] if code.is_valid()]
        if spare:
            rows.append({
                "kind": "invite",
                "what": f"还有 {len(spare)} 个邀请码没用出去",
                "when": spare[0].created_at.isoformat() if spare[0].created_at else "",
                "by": "",
                "url": f"/w/{world.slug}",
            })

    def sort_key(row):
        return row.get("when") or ""

    rows.sort(key=sort_key, reverse=True)
    return json_response({"activity": rows[:14], "server_time": timezone.now().isoformat()})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def presence(request):
    """在线状态：GET 看谁在，POST 打一次心跳（``{"leaving": true}`` 是"我走了"）。

    离开那一下来自 ``navigator.sendBeacon()``：只靠心跳的话，关掉标签页后
    要等 60 秒的在线窗口过期，别人才看到你下线；页面隐藏时直接销号则立刻生效。
    """
    world = current_world()
    if request.method == "POST":
        payload = parse_json(request)
        if request.user.is_authenticated and payload.get("leaving"):
            Presence.objects.filter(world=world, user=request.user).delete()
        else:
            document = (get_document(world, payload.get("document"))
                        if payload.get("document") else None)
            if request.user.is_authenticated:
                Presence.touch(world, request.user, document)
    online = Presence.online(world)
    return json_response({
        "online": [entry.to_payload() for entry in online],
        "count": len(online),
    })


@require_safe
def document_versions(request, doc_id):
    """一份文档的版本历史（最近的在前面）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    versions = document.versions.order_by("-index")
    return json_response({
        "document": {"id": document.id, "name": document.name},
        "versions": [version.to_payload() for version in versions],
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def document_version_detail(request, doc_id, index):
    """看某一版的内容 / 回滚到那一版（回滚前会自动备份当前状态）。"""
    from ..services import exchange

    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    version = document.versions.filter(index=as_int(index, 1)).first()
    if version is None:
        return json_response({"error": "没有这一版"}, status=404)

    if request.method == "GET":
        # 顶层就是这一版（含 payload），前端直接预览
        return json_response(version.to_payload(with_body=True))

    # 回滚：先给"现在"留一版，再把快照写回去（名字、设置、卡片正文与属性一起回来）
    snapshot_document(document, label="回滚前的自动备份", author=request.user)
    payload = version.payload if isinstance(version.payload, dict) else {}

    card_payload = payload.get("card")
    if isinstance(card_payload, dict):
        card, _created = Card.objects.get_or_create(
            document=document, defaults={"entity_type": document.entity_type})
        card.aliases = as_alias_list(card_payload.get("aliases"))
        card.blocks = normalize_blocks(card_payload.get("blocks") or [])
        card.body = blocks_to_text(card.blocks)
        # 快照里存的是派生的 blocks，通常没有编辑器文档。不一起回滚的话，孤岛会继续
        # 显示"回滚之前"的正文（editor_doc() 优先用 blocks_doc）。
        card.blocks_doc = normalize_doc(card_payload.get("blocks_doc")) if card_payload.get("blocks_doc") else []
        card.values = card_payload.get("values") or {}
        card.era_mode = card_payload.get("era_mode") or card.era_mode
        card.era_ids = card_payload.get("era_ids") or card.era_ids
        card.save()

    if payload.get("name"):
        document.name = as_text(payload.get("name"), 200)
    if isinstance(payload.get("settings"), dict):
        document.settings = payload["settings"]
    document.save(update_fields=["name", "settings", "updated_at"])
    touch_document(document, label=f"回滚到 v{version.index}", author=request.user)
    return json_response({
        "ok": True,
        "document": document.to_payload(with_card=True),
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })
