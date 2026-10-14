# -*- coding: utf-8 -*-
"""地图底图 / 发布 / 兜底。

（原 ``world/views.py`` 的「地图底图 / 发布 / 兜底。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.conf import settings
from django.core.files.storage import default_storage
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
import re

from ..models import AUDIENCES
from ..normalize import as_text
from ..services import publish as publish_service

from .common import (
    ALLOWED_IMAGE_TYPES,
    DOC_NOT_FOUND,
    _upload_problem,
    current_world,
    error,
    get_document,
    json_response,
    parse_json,
    touch_document,
)


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def map_background(request, doc_id):
    """设置底图：上传文件（multipart）或粘贴 URL；``clear=1`` 清空。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    if (request.method == "DELETE" or request.GET.get("clear") in ("1", "true", "yes")
            or parse_json(request).get("clear") is True):
        settings_.pop("background", None)
        document.settings = settings_
        document.save(update_fields=["settings", "updated_at"])
        return json_response({"ok": True, "background": {"url": "", "zoom": 1.0,
                                                         "offset_x": 0.0, "offset_y": 0.0}})

    if request.content_type and request.content_type.startswith("multipart/"):
        upload = request.FILES.get("file")
        if upload is None:
            return error("没有收到文件")
        problem = _upload_problem(upload, ALLOWED_IMAGE_TYPES, label="图片")
        if problem:
            return error(problem)
        safe_name = re.sub(r"[\\/:*?\"<>|]+", "-", (upload.name or "map.png").split("/")[-1])
        path = default_storage.save(f"maps/{document.id}/{safe_name}", upload)
        try:
            url = default_storage.url(path)
        except Exception:
            url = f"{settings.MEDIA_URL}{path}"
        patch = {"background": url}
    else:
        payload = parse_json(request)
        patch = {}
        if "url" in payload:
            patch["background"] = as_text(payload.get("url"), 4000)
        for key in ("zoom", "bg_zoom", "offset_x", "bg_offset_x", "offset_y", "bg_offset_y"):
            if key in payload:
                patch[key] = payload[key]

    settings_.update(patch)
    document.settings = settings_
    document.save(update_fields=["settings", "updated_at"])
    touch_document(document, label="更换地图底图", author=request.user)
    url = settings_.get("background", "")
    return json_response({
        "ok": True,
        "background": {
            "url": url,
            "zoom": float(settings_.get("zoom") or settings_.get("bg_zoom") or 1.0),
            "offset_x": float(settings_.get("offset_x") or settings_.get("bg_offset_x") or 0.0),
            "offset_y": float(settings_.get("offset_y") or settings_.get("bg_offset_y") or 0.0),
        },
        "settings": patch,
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def publish_view(request):
    """GET 看站点状态；POST 发布 / 重新发布。"""
    world = current_world()
    if request.method == "GET":
        return json_response({
            "publish": world.publish_summary(),
            "audiences": [{"value": value, "label": label} for value, label in AUDIENCES],
        })

    payload = parse_json(request)
    audience = as_text(payload.get("audience"), 20) or None
    password = payload.get("password")
    publish_service.publish(world, audience=audience, password=password, author=request.user)
    return json_response({"publish": world.publish_summary(), "version": world.publish_version})


@require_safe
def publish_preview_view(request):
    """发布差异预览：这次发布会新增 / 更新 / 下架哪些文档（前端分享面板直接列名字）。"""
    world = current_world()
    return json_response(publish_service.publish_preview(world))


@require_safe
def publish_log_view(request):
    """发布记录（最近在前）：每次发布会动了哪些文档。"""
    world = current_world()
    logs = world.publish_logs.all()[:30]
    return json_response({"logs": [log.to_payload() for log in logs]})


@csrf_exempt
@require_http_methods(["POST"])
def unpublish_view(request):
    """下线站点：内容保留，站点立刻 404。"""
    world = current_world()
    publish_service.unpublish(world)
    return json_response({"publish": world.publish_summary()})


@csrf_exempt
def api_fallback(request):
    """未知的 /api/world/* 路径：回 JSON 404，别丢一个 HTML 错误页给前端。"""
    return json_response({"error": "接口不存在"}, status=404)
