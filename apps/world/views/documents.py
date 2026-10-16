# -*- coding: utf-8 -*-
"""文档树与卡片：文档增删改查、回收站、卡片正文与属性。

（原 ``world/views.py`` 的「文档树与卡片」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import (
    DOC_CARD,
    DOC_TIMELINE,
    DOC_TREE,
    DOC_TYPES,
    TREE_KINDS,
    World,
)
from ..normalize import (
    ValueErrorCN,
    as_alias_list,
    as_int,
    as_text,
    blocks_to_text,
    coerce_property_value,
    default_values_for,
    doc_to_blocks,
    normalize_block_comments,
    normalize_blocks,
    normalize_doc,
)
from apps.documents.models import Card, Document, TimelineEvent
from apps.graph.models import TreeVariant

from .common import (
    DOC_NOT_FOUND,
    current_world,
    error,
    get_document,
    get_type,
    json_response,
    parse_json,
    save_document_settings,
    touch_document,
)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def document_collection(request):
    """文档列表 / 新建（卡片、时间线、关系树、地图、任意工具型文档都从这里建）。"""
    world = current_world()

    if request.method == "GET":
        query = world.documents.filter(deleted_at__isnull=True)
        doc_type = request.GET.get("type")
        if doc_type:
            query = query.filter(document_type=doc_type)
        parent = request.GET.get("parent")
        if parent not in (None, "", "root"):
            query = query.filter(parent_id=as_int(parent))
        keyword = (request.GET.get("q") or "").strip()
        if keyword:
            query = query.filter(name__icontains=keyword)
        return json_response({
            "documents": [document.to_payload(with_card=True)
                          for document in query.order_by("position", "id")]
        })

    payload = parse_json(request)
    doc_type = as_text(payload.get("type"), 40) or DOC_CARD
    if doc_type not in {value for value, _label in DOC_TYPES}:
        return error("未知的文档类型")

    parent = None
    if payload.get("parent") not in (None, "", "root"):
        parent = get_document(world, payload.get("parent"))
    entity_type = get_type(world, payload.get("entity_type"))
    position = as_int(payload.get("position"), 0)

    document = Document.objects.create(
        world=world,
        document_type=doc_type,
        name=as_text(payload.get("name"), 200) or "未命名",
        parent=parent,
        position=position,
        era_id=as_int(payload.get("era"), 0) or None,
        era_ids=payload.get("era_ids") if isinstance(payload.get("era_ids"), list) else [],
        entity_type=entity_type,
        settings=payload.get("settings") if isinstance(payload.get("settings"), dict) else {},
        cover=as_text(payload.get("cover"), 500),
    )

    if doc_type == DOC_CARD:
        # 新卡片给一块空白"概览"，属性值按类型预填 —— 空白卡片对新手太不友好
        Card.objects.create(
            document=document,
            entity_type=entity_type,
            values=default_values_for(entity_type) if entity_type is not None else {},
            blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": ""}]),
        )
    elif doc_type == DOC_TIMELINE:
        calendar_id = as_int(payload.get("calendar"), 0)
        if not calendar_id:
            calendar = world.calendars.order_by("id").first()
            calendar_id = calendar.id if calendar is not None else 0
        if calendar_id:
            save_document_settings(document, {"calendar": calendar_id})
            document.save(update_fields=["settings"])
    elif doc_type == DOC_TREE:
        kind = as_text(payload.get("kind"), 40) or TREE_KINDS[0][0]
        TreeVariant.objects.create(document=document, kind=kind)

    touch_document(document, label="新建文档", author=request.user)
    return json_response(document.to_payload(with_card=True))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def document_detail(request, doc_id):
    """单篇文档：读 / 改（改名、移动、隐藏、置顶、封面、设置）/ 删（软删或彻底删）。"""
    world = current_world()
    permanent = request.GET.get("hard") in ("1", "true", "yes")
    document = world.documents.filter(pk=as_int(doc_id)).first()
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        with_children = request.GET.get("children") in ("1", "true", "yes")
        payload = document.to_payload(with_card=True, with_children=with_children)
        payload["revision"] = as_int((document.settings or {}).get("revision"), 0)
        return json_response(payload)

    if request.method == "DELETE":
        if permanent:
            document.delete()
        else:
            document.deleted_at = timezone.now()
            document.save(update_fields=["deleted_at"])
        return json_response({"success": True, "removed": permanent})

    payload = parse_json(request)
    if "name" in payload:
        document.name = as_text(payload.get("name"), 200) or document.name
    if "parent" in payload:
        new_parent_id = payload.get("parent")
        parent = None
        if new_parent_id not in (None, "", "root"):
            parent = get_document(world, new_parent_id)
            # 不能把文档挂到自己的子孙下面，否则树就成环了
            if parent is not None:
                walker = parent
                while walker is not None:
                    if walker.id == document.id:
                        return error("不能把文档移动到它自己的子文件夹里")
                    walker = walker.parent
        document.parent = parent
    for field in ("pinned", "hidden"):
        if field in payload:
            setattr(document, field, bool(payload.get(field)))
    if "cover" in payload:
        document.cover = as_text(payload.get("cover"), 500)
    if "icon" in payload:
        document.icon = as_text(payload.get("icon"), 40)
    if "document_type" in payload:
        value = as_text(payload.get("document_type"), 40)
        if value in {item for item, _label in DOC_TYPES}:
            document.document_type = value
    if "era" in payload:
        document.era_id = as_int(payload.get("era"), 0) or None
    if "era_ids" in payload and isinstance(payload.get("era_ids"), list):
        document.era_ids = [as_int(item) for item in payload["era_ids"] if as_int(item)]
    if "entity_type" in payload:
        document.entity_type = get_type(world, payload.get("entity_type"))
    if "settings" in payload and isinstance(payload.get("settings"), dict):
        merged = dict(document.settings or {})
        merged.update(payload["settings"])
        document.settings = merged
    if "position" in payload:
        document.position = as_int(payload.get("position"), document.position)

    card = getattr(document, "card", None)
    if card is not None:
        apply_card_payload(card, world, payload)
        card.save()

    document.save()
    touch_document(document, label="修改文档", author=request.user)
    result = document.to_payload(with_card=True)
    result["revision"] = as_int((document.settings or {}).get("revision"), 0)
    return json_response(result)


@csrf_exempt
@require_http_methods(["POST"])
def document_duplicate(request, doc_id):
    """复制一篇文档（卡片连属性值、时间线连事件一起带走）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    clone = Document.objects.create(
        world=world,
        document_type=document.document_type,
        name=f"{document.name}（副本）",
        parent=document.parent,
        position=document.position,
        era=document.era,
        era_ids=list(document.era_ids or []),
        entity_type=document.entity_type,
        settings=dict(document.settings or {}),
        cover=document.cover,
    )
    card = getattr(document, "card", None)
    if card is not None:
        Card.objects.create(
            document=clone,
            entity_type=card.entity_type,
            aliases=list(card.aliases or []),
            values=dict(card.values or {}),
            blocks=normalize_blocks(card.blocks),
            body=card.body,
        )
    for event in document.events.all():
        TimelineEvent.objects.create(
            document=clone,
            title=event.title,
            precision=event.precision,
            year=event.year,
            month=event.month,
            day=event.day,
            hour=event.hour,
            era=event.era,
            description=event.description,
            cover=event.cover,
            row=event.row,
            position=event.position,
            featured_card=event.featured_card,
        )
    touch_document(clone, label="复制文档", author=request.user)
    return json_response(clone.to_payload(with_card=True))


@require_http_methods(["GET"])
def trash_collection(request):
    """回收站：软删掉的文档，可以还原或彻底删。"""
    world = current_world()
    documents = world.documents.filter(deleted_at__isnull=False).order_by("-deleted_at", "id")
    return json_response({
        "documents": [document.to_payload() for document in documents],
        "count": documents.count(),
    })


@csrf_exempt
@require_http_methods(["POST"])
def document_restore(request, doc_id):
    """从回收站还原一篇文档（父级已经被删的话，挂回根上）。"""
    world = current_world()
    document = world.documents.filter(pk=as_int(doc_id), deleted_at__isnull=False).first()
    if document is None:
        # 不在回收站里的文档谈不上"恢复"
        return json_response(DOC_NOT_FOUND, status=404)

    document.deleted_at = None
    if document.parent is not None and document.parent.deleted_at is not None:
        document.parent = None      # 父文件夹还在回收站里 -> 提到顶层，不然还原完就看不见了
    document.save(update_fields=["deleted_at", "parent"])
    touch_document(document, label="从回收站还原", author=request.user)
    return json_response(document.to_payload(with_card=True))


def apply_card_payload(card: Card, world: World, payload: dict) -> None:
    """把请求体里的别名 / 属性值 / 区块写进卡片（属性值逐条按类型校验）。"""
    if "aliases" in payload:
        card.aliases = as_alias_list(payload.get("aliases"))

    if "era_mode" in payload:
        raw = payload.get("era_mode")
        mode = raw if raw in ("universal", "only", "hidden") else ""
        card.era_mode = mode or "universal"
    if "era_ids" in payload:
        incoming = payload.get("era_ids")
        card.era_ids = [as_int(item) for item in incoming if as_int(item)] if isinstance(incoming, list) else []
        if card.era_mode == "only" and not card.era_ids:
            card.era_mode = "hidden"      # "只在某些纪元出现"却一个都没选 = 哪儿都不出现

    if "blocks_doc" in payload:
        # 编辑器孤岛的文档是权威：区块与正文都由它派生，三者从此保持一致。
        card.blocks_doc = normalize_doc(payload.get("blocks_doc"))
        card.blocks = normalize_blocks(doc_to_blocks(card.blocks_doc))
        card.body = blocks_to_text(card.blocks)
    elif "blocks" in payload:
        # 旧的 vanilla 编辑器写入：区块变了，编辑器文档就作废，
        # 不然下次读到的还是那份陈旧副本，等于把这次编辑吃掉。
        card.blocks = normalize_blocks(payload.get("blocks"))
        card.body = blocks_to_text(card.blocks)
        card.blocks_doc = []
    if "body" in payload and "blocks" not in payload and "blocks_doc" not in payload:
        card.body = as_text(payload.get("body"), 20000)
    if "comments" in payload:
        card.comments = normalize_block_comments(payload.get("comments"))

    if "entity_type" in payload:
        card.entity_type = get_type(world, payload.get("entity_type"))

    if "values" in payload:
        values = payload.get("values")
        if not isinstance(values, dict):
            values = {}
        entity_type = card.entity_type
        if entity_type is None:
            if values:
                raise ValueErrorCN("请先给这张卡片选一个类型，再填属性")
        else:
            # 属性值的键是"属性 id 的字符串"（见 normalize.resolve_card_values）
            resolved = dict(card.values or {})
            for prop in entity_type.all_properties():
                prop_key = str(prop.id)
                if prop_key in values:
                    resolved[prop_key] = coerce_property_value(prop, values.get(prop_key), world)
            card.values = resolved


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def card_detail(request, doc_id):
    """一张卡片的正文与属性。PUT 会校验修订号：对不上说明别人先改了，回 409。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    card, _created = Card.objects.get_or_create(document=document, defaults={"entity_type": document.entity_type})

    if request.method == "GET":
        return json_response({
            "document": document.to_payload(),
            "card": card.to_payload(with_doc=True),
            "entity_type": (card.effective_type().to_payload() if card.effective_type() else None),
            "revision": as_int((document.settings or {}).get("revision"), 0),
        })

    payload = parse_json(request)
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    current_revision = as_int(settings_.get("revision"), 0)
    incoming = payload.get("revision")
    if incoming is not None and as_int(incoming, -1) != current_revision:
        return json_response({
            "error": "这份文档刚被别人改过，已经刷新成最新内容",
            "conflict": True,
            "revision": current_revision,
            "document": document.to_payload(),
            "card": card.to_payload(with_doc=True),
        }, status=409)

    try:
        apply_card_payload(card, world, payload)
    except ValueErrorCN as exc:
        return error(str(exc))
    card.save()
    touch_document(document, label="编辑卡片", author=request.user)
    return json_response({
        "document": document.to_payload(),
        "card": card.to_payload(with_doc=True),
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })
