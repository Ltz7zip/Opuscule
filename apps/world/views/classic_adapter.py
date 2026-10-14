# -*- coding: utf-8 -*-
"""经典编辑器适配层：把经典横向时间轴的接口映射到时间线文档上。

（原 ``world/views.py`` 的「经典编辑器适配层」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .. import classic as classic_service
from ..classic import ERA_ID_BASE
from ..models import DOC_TIMELINE
from apps.documents.models import Document

from .common import (
    DOC_NOT_FOUND,
    ITEM_NOT_FOUND,
    current_world,
    get_document,
    json_response,
    parse_json,
    touch_document,
)


def _document_or_404(doc_id: int) -> Document | None:
    """经典编辑器的接口只服务时间线文档；别的文档一律当作"没有"。"""
    document = get_document(current_world(), doc_id)
    if document is None or document.document_type != DOC_TIMELINE:
        return None
    return document


@require_http_methods(["GET"])
def classic_timeline(request, doc_id):
    """整条时间线，结构与传统 /api/timeline 完全一致。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    return json_response(classic_service.classic_payload(document))


@csrf_exempt
@require_http_methods(["POST"])
def classic_items(request, doc_id):
    """新建：``kind="era"`` 走纪元，其余走事件。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    if payload.get("kind") == "era":
        item = classic_service.create_era(document, payload)
    else:
        item = classic_service.apply_item(document, payload, None)
    touch_document(document, label="在时间线里新建", author=request.user)
    return json_response(item)      # 编辑器直接吃这一条（要有 id）


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def classic_item_detail(request, doc_id, item_id):
    """更新 / 删除：id ≥ 1_000_000 的是纪元，其余是事件。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "DELETE":
        removed = classic_service.delete_item(document, item_id)
        if not removed:
            return json_response({"error": "未找到该条目"}, status=404)
        touch_document(document, label="在时间线里删除", author=request.user)
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if item_id >= ERA_ID_BASE:
        era = document.world.eras.filter(pk=item_id - ERA_ID_BASE).first()
        if era is None:
            return json_response({"error": "未找到该纪元"}, status=404)
        item = classic_service.apply_era(document, era.id, payload)
    else:
        event = document.events.filter(pk=item_id).first()
        if event is None:
            return json_response(ITEM_NOT_FOUND, status=404)
        item = classic_service.apply_item(document, payload, event)
    touch_document(document, label="在时间线里编辑", author=request.user)
    return json_response(item)


@csrf_exempt
@require_http_methods(["PUT"])
def classic_view(request, doc_id):
    """记住视野（编辑器滑到哪儿，下次回来还在哪儿）。"""
    document = _document_or_404(doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    start = float(payload.get("start") or 0.0)
    end = float(payload.get("end") or 1.0)
    if end <= start:
        # 非法范围：原样回给编辑器，但不写库（不然下次打开视野就坏了）
        return json_response({"start": start, "end": end})
    return json_response(classic_service.save_view(document, start, end))
