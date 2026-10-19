# -*- coding: utf-8 -*-
"""世界存档：列表 / 新建 / 查看 / 删除 / 读档（0.7.0 §4.3）。

触发方式按拍板④：手动存档 + 读档前自动备份，每个世界最多留 ``MAX_ARCHIVES`` 份。
读档是整包回滚（含地图 ``map_data``），与文档级 ``DocumentVersion`` 互相独立。
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from ..models import MAX_ARCHIVES
from ..normalize import as_text
from ..services import archive as archive_service
from apps.documents.models import WorldArchive

from .common import current_world, error, json_response, parse_json


def _get_archive(world, archive_id):
    return WorldArchive.objects.filter(world=world, id=archive_id).first()


@csrf_exempt
@require_http_methods(["GET", "POST"])
def archive_collection(request):
    """GET 存档列表（只给元信息）；POST 手动存一份（201）。"""
    world = current_world()
    if request.method == "GET":
        # 列表只要元信息：别把整份快照（大 JSON）一起读出来；作者一次 join 回来
        archives = world.archives.select_related("author").defer("payload")
        return json_response({
            "archives": [archive.to_payload() for archive in archives],
            "max": MAX_ARCHIVES,
        })

    payload = parse_json(request)
    archive = archive_service.create_archive(
        world,
        name=as_text(payload.get("name"), 80),
        note=as_text(payload.get("note"), 200),
        author=request.user,
    )
    return json_response({"archive": archive.to_payload()}, status=201)


@csrf_exempt
@require_http_methods(["GET", "DELETE"])
def archive_detail(request, archive_id):
    """GET 单份存档（``?body=1`` 时连快照一起给）；DELETE 删掉这存档位。"""
    world = current_world()
    archive = _get_archive(world, archive_id)
    if archive is None:
        return error("存档不存在", status=404)

    if request.method == "DELETE":
        archive.delete()
        return json_response({"deleted": archive_id})

    with_body = request.GET.get("body") in ("1", "true", "yes")
    return json_response({"archive": archive.to_payload(with_body=with_body)})


@csrf_exempt
@require_http_methods(["POST"])
def archive_restore(request, archive_id):
    """整包回滚到这份存档；回滚前自动备份一份（``kind=auto``）。"""
    world = current_world()
    archive = _get_archive(world, archive_id)
    if archive is None:
        return error("存档不存在", status=404)

    try:
        result = archive_service.restore_archive(archive, author=request.user)
    except ValueError as exc:
        return error(str(exc), status=400)
    return json_response(result)
