# -*- coding: utf-8 -*-
"""「地图」独立页面（``/map`` / ``/map/2d`` / ``/map/3d``）。

地图引擎用 Azgaar 的 **Fantasy Map Generator**（MIT）：源码 vendored 在
``third_party/fantasy-map-generator``，由 ``tools/build_map.py`` 构建到
``static/map/vendor``，构建产物入库 —— **运行时不需要 Node**。

* ``/map/2d``  平面地图：生成 / 编辑 / 图层 / 标注。
* ``/map/3d``  Opuscule 自带的三维视图（Mesh 地形 + Globe 地球仪）。
* ``/map``     302 到默认那一档。

页面模板 ``templates/map/app.html`` 是构建期从上游 ``index.html`` **生成**的
（见 ``tools/build_map.py``），所以结构改动请改上游 ``src/index.html``，
外观改动走我们自己的覆盖样式，**不要手改生成物**。

世界数据（Opuscule 的 ``pack``）整包存在 ``Document.map_data``；``MapMarker``
只保留「图钉 ↔ 卡片」的桥。
"""

from __future__ import annotations

import json

from django.shortcuts import redirect, render
from django.views.decorators.http import require_safe

from . import permissions
from . import views as world_views
from .models import DOC_MAP
from .normalize import as_int
from apps.documents.models import Document

#: 两档（前端顶栏的切换器认这个顺序）
MAP_VIEWS = (
    ("2d", "平面", "生成 / 编辑 / 图层"),
    ("3d", "地形", "三维地形与地球仪"),
)

DEFAULT_VIEW = "2d"
#: 地图数据的读写接口前缀
API_BASE = "/api/world/maps"


def resolve_view(value: str) -> str:
    """把 URL 里那一小段收敛到两个合法值上（认不出的一律回 2d）。"""
    value = (value or "").strip().lower()
    return value if value in {key for key, _label, _hint in MAP_VIEWS} else DEFAULT_VIEW


def map_page(request, view: str = DEFAULT_VIEW):
    """地图页。``?doc=<id>`` 指名看哪一张，不带就挑世界里第一张地图。

    * ``?embed=1``    被工作区面板 / 发布站点用 iframe 嵌进来：去掉外壳留白。
      ``embed`` 默认只读，要可编辑得显式给 ``readonly=0``。
    * ``?theme=``     只有世界主题显式设成浅色才是 light。
    """
    view = resolve_view(view)
    world = world_views.current_world()

    doc_id = as_int(request.GET.get("doc"), 0)
    document = None
    if doc_id:
        document = world_views.get_document(world, doc_id)
        if document is not None and document.document_type != DOC_MAP:
            document = None
    elif not request.GET.get("doc"):
        first = (Document.objects
                 .filter(world=world, document_type=DOC_MAP, deleted_at__isnull=True)
                 .order_by("position", "id")
                 .first())
        if first is not None:
            doc_id, document = first.id, first

    theme = world.theme_config if isinstance(world.theme_config, dict) else {}
    theme_mode = request.GET.get("theme", "")
    if theme_mode not in ("paper", "light", "dark"):
        theme_mode = "light" if theme.get("mode") == "light" else "dark"

    embed = request.GET.get("embed", "") not in ("", "0", "false", "no")
    readonly = embed if "readonly" not in request.GET else (
        request.GET.get("readonly", "") not in ("0", "false", "no"))
    can_edit = permissions.can_edit(request.user, world)
    if not can_edit:
        readonly = True

    ctx = {
        "view": view,
        "views": [{"key": key, "label": label, "hint": hint} for key, label, hint in MAP_VIEWS],
        "docId": doc_id,
        "docName": document.name if document else "",
        "docMissing": bool(doc_id) and document is None,
        "embed": embed,
        "readonly": readonly,
        "canEdit": can_edit,
        "theme": "light" if theme_mode == "light" else "dark",
        "apiBase": API_BASE,
        "lang": "zh",
    }
    # 顶栏是服务端渲染的（脚本被禁用时至少还能看到文档名与只读状态），
    # 所以这些字段单独给模板一份，不塞进 JSON。
    # 计数与「世界地图 ▾」的文档列表也在这里备好 —— 与工作区顶栏同一套分布。
    layer_count = document.map_layers.count() if document else 0
    marker_counts: dict[str, int] = {}
    if document:
        for marker in document.map_markers.all():
            marker_counts[marker.kind] = marker_counts.get(marker.kind, 0) + 1

    stats = [f"{layer_count} 层"]
    for kind, label in (("pin", "图钉"), ("zone", "区域"), ("text", "文字")):
        if marker_counts.get(kind):
            stats.append(f"{marker_counts[kind]} {label}")

    sibling_maps = [
        {"id": doc.id, "name": doc.name, "current": doc.id == doc_id}
        for doc in (Document.objects
                    .filter(world=world, document_type=DOC_MAP, deleted_at__isnull=True)
                    .order_by("position", "id")[:20])
    ]

    shell = {
        "show_bar": not embed,
        "view": view,
        "world_name": world.name,
        "doc_name": document.name if document else "",
        "doc_id": doc_id,
        "doc_missing": bool(doc_id) and document is None,
        "can_edit": can_edit,
        "home_url": "/world",
        "stats": " · ".join(stats),
        "maps": sibling_maps,
    }
    return render(
        request,
        "map/app.html",
        {"map_ctx_json": json.dumps(ctx, ensure_ascii=False), "shell": shell},
    )


@require_safe
def map_home(request):
    """``/map``：进默认那一档。用 302 而不是直接渲染，免得两个地址各有一份页面。"""
    query = request.GET.urlencode()
    target = f"/map/{DEFAULT_VIEW}"
    if query:
        target = f"{target}?{query}"
    return redirect(target, permanent=False)
