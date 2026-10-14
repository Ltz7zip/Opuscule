# -*- coding: utf-8 -*-
"""关系树 / 地图 / 图谱：三块「画布」各自的节点、连线、图层、标注。

（原 ``world/views.py`` 的「关系树 / 地图 / 图谱」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .. import permissions
from ..models import (
    DOC_CARD,
    DOC_MAP,
    DOC_TREE,
    ERA_COLORS_RGB,
    MARKER_COLORS,
    MARKER_KINDS,
    MARKER_PIN,
    RELATION_LABELS,
    TREE_EDGE_KINDS,
    TREE_KINDS,
    World,
)
from ..normalize import as_int, as_number, as_text, default_values_for, normalize_blocks
from ..relations import relation_style
from ..services import geo as geo_service, graph as graph_service
from documents.models import Card, Document
from graph.models import TreeEdge, TreeNode, TreeVariant
from maps.models import MapLayer, MapMarker

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


def clamp_int(value, low: int, high: int) -> int:
    return max(low, min(high, as_int(value, low)))


def clamp_size(value, fallback: float = 1.0) -> float:
    """标注大小（MapMarker.scale）：0.2–4 之外或认不出的值一律落回 fallback。"""
    number = as_number(value)
    if number is None:
        return fallback
    return max(0.2, min(4.0, float(number)))


def get_variant(world: World, variant_id):
    return TreeVariant.objects.filter(pk=as_int(variant_id), document__world=world).first()


def get_tree_node(world: World, node_id) -> TreeNode | None:
    return TreeNode.objects.filter(pk=as_int(node_id), variant__document__world=world).first()


def get_marker(world: World, marker_id) -> MapMarker | None:
    return MapMarker.objects.filter(pk=as_int(marker_id), document__world=world).first()


def tree_state(document: Document) -> dict:
    """一棵关系树的完整状态：变体列表 + 当前变体（含节点/关系）。"""
    variants = list(document.tree_variants.all())
    if not variants:
        variants = [TreeVariant.objects.create(document=document, name="Main", kind="family")]
    active_id = as_int((document.settings or {}).get("active_variant"), 0)
    active = next((variant for variant in variants if variant.id == active_id), variants[0])
    return {
        "document": document.to_payload(),
        "variants": [variant.to_payload() for variant in variants],
        "active": active.to_payload(with_graph=True),
        "kinds": [{"value": value, "label": label} for value, label in TREE_KINDS],
        "edge_kinds": [{"value": value, "label": label} for value, label in TREE_EDGE_KINDS],
    }


@require_safe
def tree_state_view(request, doc_id):
    """关系树的状态（含当前变体的节点与关系）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TREE:
        return error("这个文档不是关系树")
    return json_response(tree_state(document))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def tree_variant_collection(request, doc_id):
    """新建一棵树；``fork_from`` 给出源 variant 时复制它（对齐 New variant (forks the current one)）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        return json_response({"variants": [variant.to_payload() for variant in document.tree_variants.all()]})

    payload = parse_json(request)
    source = get_variant(world, payload.get("fork_from")) if payload.get("fork_from") else None
    kind = as_text(payload.get("kind"), 20) or (source.kind if source else "family")
    variant = TreeVariant.objects.create(
        document=document,
        name=as_text(payload.get("name"), 60) or (f"{source.name} 副本" if source else f"Variant {document.tree_variants.count() + 1}"),
        kind=kind,
        position=document.tree_variants.count(),
    )
    if source is not None:
        # 复制：节点照搬，边要重新映射到新节点的 id 上
        id_map = {}
        for node in source.nodes.all():
            clone = TreeNode.objects.create(
                variant=variant, card=node.card, name=node.name, subtitle=node.subtitle,
                image=node.image, group=node.group, group_color=node.group_color,
                generation=node.generation, position=node.position, x=node.x, y=node.y,
            )
            id_map[node.id] = clone.id
        for edge in source.edges.all():
            if edge.source_id in id_map and edge.target_id in id_map:
                TreeEdge.objects.create(
                    variant=variant, source_id=id_map[edge.source_id], target_id=id_map[edge.target_id],
                    kind=edge.kind, label=edge.label, style=edge.style,
                )
    save_document_settings(document, {"active_variant": variant.id})
    document.save(update_fields=["settings"])
    return json_response(variant.to_payload(with_graph=True))


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_variant_detail(request, variant_id):
    """单个变体：读 / 改（改名、模板、关系叫法）/ 删（至少要留一棵）。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    if request.method == "GET":
        return json_response(variant.to_payload(with_graph=True))

    if request.method == "DELETE":
        if variant.document.tree_variants.count() <= 1:
            return error("至少要保留一棵树")
        document = variant.document
        variant.delete()
        remaining = document.tree_variants.order_by("position", "id").first()
        save_document_settings(document, {"active_variant": remaining.id if remaining else 0})
        document.save(update_fields=["settings"])
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        variant.name = as_text(payload.get("name"), 60) or variant.name
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in TREE_KINDS}:
            variant.kind = kind
    if "edge_labels" in payload and isinstance(payload.get("edge_labels"), dict):
        merged = dict(variant.edge_labels or {})
        for key, value in payload["edge_labels"].items():
            merged[as_text(key, 40)] = as_text(value, 40)
        variant.edge_labels = merged
    if "settings" in payload and isinstance(payload.get("settings"), dict):
        merged = dict(variant.settings or {})
        merged.update(payload["settings"])
        variant.settings = merged
    variant.save()
    return json_response(variant.to_payload(with_graph=True))


@csrf_exempt
@require_http_methods(["POST"])
def tree_node_collection(request, variant_id):
    """往树上加一格：一个人（可以顺手吸附一张已有卡片），或者一张备注。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    payload = parse_json(request)
    card = get_document(world, payload.get("card")) if payload.get("card") else None
    kind = as_text(payload.get("kind"), 8)
    if kind not in {value for value, _label in TreeNode.NODE_KINDS}:
        kind = TreeNode.NODE_PERSON
    note = as_text(payload.get("note"), 4000)
    # 显式传了 name 就照办，**空字符串也算数**——网格编辑器右键长出来的新卡片
    # 就是"还没有名字"的状态（虚线空卡 + 添加名称），那时该由前端就地起名。
    if "name" in payload:
        name = as_text(payload.get("name"), 120)
    elif kind == TreeNode.NODE_NOTE:
        name = "备注"
    else:
        name = card.name if card else "新成员"
    node = TreeNode.objects.create(
        variant=variant,
        card=card,
        kind=kind,
        note=note,
        name=name,
        subtitle=as_text(payload.get("subtitle"), 120),
        image=as_text(payload.get("image"), 4000),
        group=as_text(payload.get("group"), 60),
        group_color=as_text(payload.get("group_color"), 24),
        generation=as_int(payload.get("generation"), 0),
        position=variant.nodes.count(),
        x=float(payload.get("x") or 0.0),
        y=float(payload.get("y") or 0.0),
    )
    return json_response(node.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_node_detail(request, node_id):
    """树上的一格：读 / 改（姓名、头像、分组、位置、备注、已故…）/ 删。"""
    world = current_world()
    node = get_tree_node(world, node_id)
    if node is None:
        return json_response({"error": "未找到这个成员"}, status=404)

    if request.method == "GET":
        return json_response(node.to_payload())

    if request.method == "DELETE":
        node.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "card" in payload:
        node.card = get_document(world, payload.get("card")) if payload.get("card") else None
    for field, limit in (("name", 120), ("subtitle", 120), ("image", 4000),
                         ("group", 60), ("group_color", 24), ("note", 4000)):
        if field in payload:
            setattr(node, field, as_text(payload.get(field), limit))
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 8)
        if kind in {value for value, _label in TreeNode.NODE_KINDS}:
            node.kind = kind
    for field in ("generation", "position"):
        if field in payload:
            setattr(node, field, as_int(payload.get(field), getattr(node, field)))
    for field in ("x", "y"):
        if field in payload:
            setattr(node, field, float(payload.get(field) or 0.0))
    for field in ("junction", "deceased", "favourite"):
        if field in payload:
            setattr(node, field, bool(payload.get(field)))
    # 吸了卡片就以卡片名为准（备注没有卡片，不受这条约束）
    if node.card is not None and not node.is_note and node.name != node.card.name:
        node.name = node.card.name
    node.save()
    return json_response(node.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def tree_node_card(request, node_id):
    """给树上的人**新建一张卡片**并吸附上去（对齐 "any person can get ... a new card"）。"""
    world = current_world()
    node = get_tree_node(world, node_id)
    if node is None:
        return json_response({"error": "未找到这个成员"}, status=404)

    payload = parse_json(request)
    entity_type = get_type(world, payload.get("entity_type"))
    document = Document.objects.create(
        world=world,
        document_type=DOC_CARD,
        name=as_text(payload.get("name"), 200) or node.name,
        entity_type=entity_type,
    )
    Card.objects.create(
        document=document,
        entity_type=entity_type,
        values=default_values_for(entity_type) if entity_type is not None else {},
        blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "", "text": ""}]),
    )
    node.card = document
    node.name = document.name
    node.save(update_fields=["card", "name"])
    touch_document(document, label="从关系树新建卡片", author=request.user)
    return json_response({"node": node.to_payload(), "document": document.to_payload(with_card=True)})


@csrf_exempt
@require_http_methods(["POST"])
def tree_edge_collection(request, variant_id):
    """连一条关系（两端必须都是这棵树上的人）。"""
    world = current_world()
    variant = get_variant(world, variant_id)
    if variant is None:
        return json_response({"error": "未找到这棵树"}, status=404)

    payload = parse_json(request)
    source = get_tree_node(world, payload.get("source"))
    target = get_tree_node(world, payload.get("target"))
    if source is None or target is None:
        return error("关系的两端必须是树上的两个人")
    if source.id == target.id:
        return error("不能把一个人连到他自己")
    if source.variant_id != variant.id or target.variant_id != variant.id:
        return error("两个人不在同一棵树上")

    kind = as_text(payload.get("kind"), 20) or "parent"
    # 显式传了 label 就照办，**空字符串也算数**——"暂时跳过"留下的那条线就是
    # "先连上、以后再命名"，不该被兜底成「自定义」印在线上。
    label = (as_text(payload.get("label"), 40) if "label" in payload
             else RELATION_LABELS.get(kind, ""))
    edge, created = TreeEdge.objects.get_or_create(
        variant=variant, source=source, target=target, kind=kind,
        defaults={"label": label, "style": as_text(payload.get("style"), 20)
                  or relation_style(kind)},
    )
    return json_response(edge.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def tree_edge_detail(request, edge_id):
    """一条关系：读 / 改（种类、叫法、样式）/ 删。"""
    world = current_world()
    edge = TreeEdge.objects.filter(pk=as_int(edge_id), variant__document__world=world).first()
    if edge is None:
        return json_response({"error": "未找到这条关系"}, status=404)

    if request.method == "GET":
        return json_response(edge.to_payload())

    if request.method == "DELETE":
        edge.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in TREE_EDGE_KINDS}:
            edge.kind = kind
    if "label" in payload:
        edge.label = as_text(payload.get("label"), 40)
    if "style" in payload:
        edge.style = as_text(payload.get("style"), 20)
    edge.save()
    return json_response(edge.to_payload())


def map_state(document: Document) -> dict:
    """一张地图的完整状态：图层 + 标注 + 背景与视野。"""
    layers = list(document.map_layers.all())
    if not layers:
        layers = [MapLayer.objects.create(document=document, name="默认", position=0)]
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    return {
        "document": document.to_payload(),
        "layers": [layer.to_payload() for layer in layers],
        "markers": [marker.to_payload() for marker in document.map_markers.all()],
        "background": {
            "url": as_text(settings_.get("background"), 4000),
            "zoom": float(settings_.get("zoom") or settings_.get("bg_zoom") or 1.0),
            "offset_x": float(settings_.get("offset_x") or settings_.get("bg_offset_x") or 0.0),
            "offset_y": float(settings_.get("offset_y") or settings_.get("bg_offset_y") or 0.0),
        },
        "kinds": [{"value": value, "label": label} for value, label in MARKER_KINDS],
        "colors": MARKER_COLORS,
        # 名字 → 十六进制：颜色的真源是 models.ERA_COLORS_RGB，前端直接用它画圆点
        "color_hex": {
            name: "#{:02x}{:02x}{:02x}".format(*ERA_COLORS_RGB.get(name, (128, 128, 128)))
            for name in MARKER_COLORS
        },
    }


@require_safe
def map_state_view(request, doc_id):
    """地图状态（图层、标注、背景与视野）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_MAP:
        return error("这个文档不是地图")
    return json_response(map_state(document))


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def map_data_view(request, doc_id):
    """地图整包数据：GET 取整段 ``map_data`` 文本，PUT 覆盖写回。

    这就是「``pack`` 整包存」的落点：地图引擎的完整状态（pack / grid / styles / layers…）
    原样存成一段文本，服务端只当它是不透明的大字符串 —— 不解析、不拆字段；
    前端交给地图引擎的 save / load 直接吞吐，这样上游升级改了内部结构，
    也不会因为我们这边拆过字段而对不上。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_MAP:
        return error("这个文档不是地图")

    if request.method == "GET":
        data = document.map_data or ""
        return json_response({"data": data, "saved": bool(data), "size": len(data)})

    # 整包覆盖是不可逆的写，权限比照其它写接口收紧一点
    if not permissions.can_edit(request.user, world):
        return error("没有修改这个世界的权限", status=403)

    payload = parse_json(request)
    data = payload.get("data")
    if not isinstance(data, str):
        return error("缺少地图数据")
    document.map_data = data
    document.save(update_fields=["map_data", "updated_at"])
    return json_response({"success": True, "size": len(data)})


@csrf_exempt
@require_http_methods(["POST"])
def map_import_entities(request, doc_id):
    """把地图上的国家 / 省份 / 城镇 / 河流导入工作区：一个条目一张卡片 + 一个图钉。

    载荷由**前端**从地图引擎的 pack 里抽好（服务端仍然不解析 ``map_data``）：

        {"nodes": [{"kind": "国家", "name": …, "x": …, "y": …, "attrs": {…},
                    "children": [{"kind": "省份", …, "children": [{"kind": "城镇", …}]}]}],
         "flat":  [{"kind": "河流", "name": …, "x": …, "y": …, "attrs": {…}}]}

    同名同级是「就地更新」，所以长完地图再导一次不会把树复制一遍。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_MAP:
        return error("这个文档不是地图")

    payload = parse_json(request)
    if not isinstance(payload.get("nodes"), list) and not isinstance(payload.get("flat"), list):
        return error("没有要导入的条目")

    try:
        result = geo_service.import_entities(document, payload)
    except Exception as exc:  # noqa: BLE001 —— 导入中途出错要整批回滚，并把原因说清楚
        return error(f"导入失败：{exc}", 500)

    touch_document(document, label="从地图导入条目", author=request.user)
    return json_response({"success": True, **result})


@csrf_exempt
@require_http_methods(["POST"])
def document_distribute(request, doc_id):
    """给一个地理条目自动铺开下一级（真建卡片 + 真建图钉）。

    body ``{"count": N}``：N > 0 用手填的数量，否则按父级的「面积」自动算。
    位置以父级的图钉为锚点、按固定角度摊开，所以同一个父级每次铺出来的位置都一样。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    kind = geo_service.kind_of(document)
    if not kind:
        return error("这个条目不在「地理」层级里（国家 / 省份 / 城镇 / 地点）")

    payload = parse_json(request)
    count = clamp_int(payload.get("count"), 0, 200)

    # 新图钉挂到父级已经在用的那张地图上；没有就退回世界里的第一张地图
    anchor = MapMarker.objects.filter(card=document).select_related("document").first()
    map_doc = anchor.document if anchor is not None else (
        Document.objects.filter(world=world, document_type=DOC_MAP, deleted_at__isnull=True)
        .order_by("position", "id")
        .first()
    )

    result = geo_service.distribute_children(map_doc, document, count)
    if not result.get("ok"):
        return error(result.get("reason") or "这一级没有可铺开的下一级")

    touch_document(document, label="自动铺开下级", author=request.user)
    if map_doc is not None and map_doc.pk != document.pk:
        touch_document(map_doc, label="自动铺开下级", author=request.user)
    return json_response({"success": True, **result})


@csrf_exempt
@require_http_methods(["POST"])
def map_layer_collection(request, doc_id):
    """加一个图层。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    layer = MapLayer.objects.create(
        document=document,
        name=as_text(payload.get("name"), 60) or f"图层 {document.map_layers.count() + 1}",
        position=document.map_layers.count(),
    )
    return json_response(layer.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def map_layer_detail(request, layer_id):
    """单个图层：读 / 改（名字、显隐、不透明度）/ 删（至少要留一个）。"""
    world = current_world()
    layer = MapLayer.objects.filter(pk=as_int(layer_id), document__world=world).first()
    if layer is None:
        return json_response({"error": "未找到这个图层"}, status=404)

    if request.method == "GET":
        return json_response(layer.to_payload())

    if request.method == "DELETE":
        if layer.document.map_layers.count() <= 1:
            return error("至少要保留一个图层")
        layer.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        layer.name = as_text(payload.get("name"), 60) or layer.name
    if "visible" in payload:
        layer.visible = bool(payload.get("visible"))
    if "opacity" in payload:
        layer.opacity = max(0.0, min(1.0, float(payload.get("opacity") or 0.0)))
    layer.save()
    return json_response(layer.to_payload())


@csrf_exempt
@require_http_methods(["POST"])
def map_marker_collection(request, doc_id):
    """加一个标注（点 / 区域 / 路线，可以吸附一张卡片）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    kind = as_text(payload.get("kind"), 20) or MARKER_PIN
    layer_id = as_int(payload.get("layer"), 0)
    layer = document.map_layers.filter(pk=layer_id).first() or document.map_layers.order_by("position", "id").first()
    card = get_document(world, payload.get("card")) if payload.get("card") else None
    color = as_text(payload.get("color"), 24)
    if color not in MARKER_COLORS:
        color = MARKER_COLORS[0]        # 认不出的颜色一律回落到默认色
    points = payload.get("points") if isinstance(payload.get("points"), list) else []
    marker = MapMarker.objects.create(
        document=document,
        layer=layer,
        kind=kind if kind in {value for value, _label in MARKER_KINDS} else MARKER_PIN,
        card=card,
        color=color,
        name=as_text(payload.get("name"), 120) or (card.name if card else ""),
        description=as_text(payload.get("description"), 4000),
        x=float(payload.get("x") or 0.0),
        y=float(payload.get("y") or 0.0),
        points=points,
        # 面板上的「新标注默认大小」就落在这里
        scale=clamp_size(payload.get("scale")),
    )
    return json_response(marker.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def map_marker_detail(request, marker_id):
    """单个标注：读 / 改（位置、形状、颜色、吸附的卡）/ 删。"""
    world = current_world()
    marker = get_marker(world, marker_id)
    if marker is None:
        return json_response({"error": "未找到这个标注"}, status=404)

    if request.method == "GET":
        return json_response(marker.to_payload())

    if request.method == "DELETE":
        marker.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    document = marker.document
    if "kind" in payload:
        kind = as_text(payload.get("kind"), 20)
        if kind in {value for value, _label in MARKER_KINDS}:
            marker.kind = kind
    if "name" in payload:
        marker.name = as_text(payload.get("name"), 120)
    if "description" in payload:
        marker.description = as_text(payload.get("description"), 4000)
    if "card" in payload:
        marker.card = get_document(world, payload.get("card")) if payload.get("card") else None
    if "layer" in payload:
        marker.layer = document.map_layers.filter(pk=as_int(payload.get("layer"))).first() or marker.layer
    if "color" in payload:
        color = as_text(payload.get("color"), 24)
        marker.color = color if color in MARKER_COLORS else MARKER_COLORS[0]
    if "scale" in payload:
        marker.scale = clamp_size(payload.get("scale"), marker.scale)
    for field in ("x", "y"):
        if field in payload:
            setattr(marker, field, float(payload.get(field) or 0.0))
    if "points" in payload and isinstance(payload.get("points"), list):
        marker.points = payload["points"]
    marker.save()
    return json_response(marker.to_payload())


@require_safe
def graph_view(request):
    """世界图谱：节点 + 连线（引用 / 事件关联 / 正文提及）。

    查询参数：``q`` 关键词、``hide_isolated=1`` 隐藏孤立节点、``center=<doc_id>&depth=1``
    只看某张卡的邻域、``limit`` 最多画几个节点（缺省 = 全画，上限 400）。

    **默认把这个世界里所有文档都画出来**（卡片 / 时间线 / 地图 / 关系树 / 图谱…，
    孤立节点也在）：图谱是"世界的地图"，不该只显示已经连起来的那些。
    """
    world = current_world()
    payload = graph_service.build_graph(
        world,
        query=(request.GET.get("q") or "").strip(),
        hide_isolated=request.GET.get("hide_isolated") in ("1", "true", "yes"),
        center=as_int(request.GET.get("center"), 0) or None,
        depth=clamp_int(request.GET.get("depth"), 1, 3),
        # 注意 clamp_int 的 low 是"兜底值"：缺省时给 MAX_NODES，
        # 给 1 的话前端不带 limit 就会把整张图画成 1 个节点（"图谱里只有一张卡"）。
        limit=clamp_int(request.GET.get("limit") or graph_service.MAX_NODES,
                        1, graph_service.MAX_NODES),
        # 只读访客（含发布站点里嵌的画布）只画已发布的节点
        published_only=not permissions.can_edit(request.user, world),
    )
    center_doc = get_document(world, request.GET.get("center")) if request.GET.get("center") else None
    payload["center_name"] = center_doc.name if center_doc is not None else ""
    payload["isolated_suggestions"] = graph_service.suggestions(world)
    return json_response(payload)
