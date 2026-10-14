# -*- coding: utf-8 -*-
"""举报箱（仅站长，管理员不可见）。

（原 ``world/views.py`` 的「举报箱（仅站长，管理员不可见）。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .. import permissions
from ..models import REPORT_STATUSES, Report
from ..normalize import as_int, as_text

from .accounts import _display_name
from .common import json_response, parse_json


@require_safe
def report_collection(request):
    """举报列表——只有站长（``is_privileged``）能看。``?status=`` 可按状态筛选。"""
    if not permissions.is_privileged(request.user):
        return json_response({"error": "只有站长能查看举报"}, status=403)
    wanted = (request.GET.get("status") or "").strip()
    rows = Report.objects.all()
    if wanted in dict(REPORT_STATUSES):
        rows = rows.filter(status=wanted)
    return json_response({
        "reports": [item.to_payload() for item in rows[:200]],
        "open_count": Report.objects.filter(status="open").count(),
        "total": rows.count(),
        "statuses": [{"value": value, "label": label} for value, label in REPORT_STATUSES],
    })


@csrf_exempt
@require_http_methods(["POST"])
def report_detail(request, report_id):
    """处置一条举报（改状态 / 写备注）——只有站长。"""
    if not permissions.is_privileged(request.user):
        return json_response({"error": "只有站长能处置举报"}, status=403)
    report = Report.objects.filter(pk=as_int(report_id)).first()
    if report is None:
        return json_response({"error": "举报不存在"}, status=404)

    payload = parse_json(request)
    wanted = as_text(payload.get("status"), 10)
    if wanted in dict(REPORT_STATUSES):
        report.status = wanted
    if "note" in payload:
        report.note = as_text(payload.get("note"), 200)
    if report.status == "open":                  # 退回待处理：清掉处置痕迹
        report.handled_by = None
        report.handled_by_name = ""
        report.handled_at = None
    else:
        report.handled_by = request.user
        report.handled_by_name = _display_name(request.user)
        report.handled_at = timezone.now()
    report.save(update_fields=["status", "note", "handled_by", "handled_by_name", "handled_at"])
    return json_response({"ok": True, "report": report.to_payload()})
