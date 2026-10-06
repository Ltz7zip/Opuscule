# -*- coding: utf-8 -*-
"""「关系树」独立页面（``/relationship``）与它的接口。

为什么单独开一页：工作区里的关系树是"二十个工具之一"，塞在标签页 + 并排面板里，
画布只占中间一条。而画树这件事本身是全屏的活——一大片网格、右键就长人、
从加号拖出去就连线。所以先把这件事做成一个能独立跑通的页面，再收进工作区。

接口都挂在 ``/api/world/relationship/`` 下：

* ``GET  templates``              模版目录（含示意图），左侧列表用它
* ``GET  trees``                  已有的关系树（继续编辑入口）
* ``POST trees``                  按模版建一棵树（可顺手把示例人物一起放进去）
* ``GET  trees/<doc_id>``         编辑区完整状态（当前变体 + 人物 + 关系 + 可用关系）
* ``PUT  trees/<doc_id>/relations`` 整份替换可用关系清单（图2 左侧那一列）

人物与关系的增删改沿用 ``world.views`` 里那套 ``tree-nodes`` / ``tree-edges``
接口——同一个数据模型，没必要为这页再抄一遍。
"""

from __future__ import annotations

from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from . import views as world_views
from .models import DOC_TREE, Document, TreeEdge, TreeNode, TreeVariant
from .relations import (
    GRID,
    RELATION_KIND_VALUES,
    TREE_TEMPLATES,
    grid_payload,
    relation_style,
    template_payload,
    template_relations,
)


def relationship_page(request):
    """关系树页面。``?doc=<id>`` 直接进编辑区，不带就停在模版选择那一步。"""
    doc_id = world_views.as_int(request.GET.get("doc"), 0)
    document = None
    if doc_id:
        document = world_views.get_document(world_views.current_world(), doc_id)
        if document is not None and document.document_type != DOC_TREE:
            document = None
    return render(request, "relationship.html", {
        "doc_id": document.id if document is not None else 0,
    })


# --------------------------------------------------------------------------- #
# 模版目录
# --------------------------------------------------------------------------- #
@csrf_exempt
@require_safe
def template_collection(request):
    """所有起步模版。左侧列表 + 右侧示意图都从这一份数据来。"""
    return world_views.json_response({
        "templates": [template_payload(item["id"]) for item in TREE_TEMPLATES],
        "grid": grid_payload(),
    })


def _tree_summary(document: Document) -> dict:
    variant = document.tree_variants.order_by("position", "id").first()
    nodes = variant.nodes.all() if variant else []
    people = [node for node in nodes if not node.is_note]
    return {
        "id": document.id,
        "name": document.name,
        "variant": variant.id if variant else 0,
        "kind": variant.kind if variant else "family",
        "kind_label": variant.get_kind_display() if variant else "",
        "people": len(people),
        "notes": len(nodes) - len(people),
        "relations": len(variant.relations()) if variant else 0,
        "updated_at": document.updated_at.isoformat() if document.updated_at else "",
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def tree_collection(request):
    """已有的关系树列表（GET） / 按模版新建一棵（POST）。"""
    world = world_views.current_world()

    if request.method == "GET":
        documents = world.documents.filter(document_type=DOC_TREE, deleted_at__isnull=True)
        return world_views.json_response({
            "trees": [_tree_summary(item) for item in documents.order_by("-updated_at", "-id")[:60]],
        })

    payload = world_views.parse_json(request)
    template_id = world_views.as_text(payload.get("template"), 20) or "family"
    valid = {item["id"] for item in TREE_TEMPLATES}
    if template_id not in valid:
        template_id = "family"

    document = Document.objects.create(
        world=world,
        document_type=DOC_TREE,
        name=world_views.as_text(payload.get("name"), 120) or "关系树",
    )
    variant = TreeVariant.objects.create(
        document=document,
        name="Main",
        kind=template_id,
        position=0,
        settings={"relations": template_relations(template_id)},
    )

    # "同时放入示例人物"：把模版示意图那棵树真的落成数据，省得对着空画布发愣
    if payload.get("with_demo") and template_id != "blank":
        _seed_demo(variant, template_id)

    world_views.save_document_settings(document, {"active_variant": variant.id})
    document.save(update_fields=["settings"])
    world_views.touch_document(document, label="新建关系树", author=request.user)
    return world_views.json_response({
        "document": document.to_payload(),
        "variant": variant.to_payload(with_graph=True),
        "summary": _tree_summary(document),
    })


def _seed_demo(variant: TreeVariant, template_id: str) -> None:
    """把模版示意图落成真实节点与关系。

    示意图给的是**格数**，落库要换成像素（``TreeNode.x/y`` 一直是像素，
    工作区里那个老编辑器也按像素读，两边得对得上）。乘完正好是网格整数倍，
    卡片边框因此严格贴在网格线上。
    """
    demo = template_payload(template_id)["demo"]
    mapping = {}
    for item in demo["nodes"]:
        node = TreeNode.objects.create(
            variant=variant,
            name=item["name"],
            subtitle=item.get("subtitle") or "",
            x=float(item["col"] * GRID),
            y=float(item["row"] * GRID),
            position=len(mapping),
            # 世代用"第几行卡片"而不是格坐标：工作区的简版渲染器按世代排 y
            generation=int(item["row_index"]),
        )
        mapping[item["key"]] = node
    for item in demo["edges"]:
        source = mapping.get(item["source"])
        target = mapping.get(item["target"])
        if source is None or target is None:
            continue
        TreeEdge.objects.create(
            variant=variant,
            source=source,
            target=target,
            kind=item["kind"],
            label=item.get("label") or "",
            style=item.get("style") or relation_style(item["kind"]),
        )


# --------------------------------------------------------------------------- #
# 编辑区状态
# --------------------------------------------------------------------------- #
def _variant_or_default(document: Document) -> TreeVariant:
    variant = document.tree_variants.order_by("position", "id").first()
    if variant is None:
        variant = TreeVariant.objects.create(document=document, name="Main", kind="family", position=0)
    return variant


@csrf_exempt
@require_safe
def tree_detail(request, doc_id):
    """编辑区要的全部东西：当前树 + 人物 + 关系 + 可用关系 + 网格。"""
    world = world_views.current_world()
    document = world_views.get_document(world, doc_id)
    if document is None:
        return world_views.json_response(world_views.DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TREE:
        return world_views.error("这个文档不是关系树")

    variant = _variant_or_default(document)
    return world_views.json_response({
        "document": document.to_payload(),
        "variant": variant.to_payload(with_graph=True),
        "grid": grid_payload(),
        "relation_kinds": [
            {"value": value, "label": label, "style": relation_style(value)}
            for value, label in world_views.TREE_EDGE_KINDS
        ],
    })


def _clean_relations(raw) -> list:
    """把前端传来的关系清单洗一遍：丢掉没名字的、按 kind 去重、补线型。

    ``label`` 允许为空——空的意思是"用这棵树 / 这个模版的默认叫法"，
    ``TreeVariant.relations()`` 会拿 ``label_for()`` 补上。自定义 kind 没名字
    就只好用 kind 本身顶着。
    """
    clean = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            item = {"kind": item}
        if not isinstance(item, dict):
            continue
        kind = world_views.as_text(item.get("kind"), 32).strip()
        if not kind or kind in seen:
            continue
        seen.add(kind)
        builtin = kind in RELATION_KIND_VALUES
        clean.append({
            "kind": kind,
            "label": world_views.as_text(item.get("label"), 40).strip()
                     or ("" if builtin else kind),
            "style": world_views.as_text(item.get("style"), 10)
                     or (relation_style(kind) if builtin else ""),
            "enabled": bool(item.get("enabled", True)),
        })
    return clean


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def tree_relations(request, doc_id):
    """这棵树可用的关系清单（图2 左侧那一列）：读 / 整份替换。"""
    world = world_views.current_world()
    document = world_views.get_document(world, doc_id)
    if document is None:
        return world_views.json_response(world_views.DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TREE:
        return world_views.error("这个文档不是关系树")

    variant = _variant_or_default(document)
    if request.method == "GET":
        return world_views.json_response({"relations": variant.relations()})

    payload = world_views.parse_json(request)
    if not isinstance(payload.get("relations"), list):
        return world_views.error("relations 必须是一个列表")

    variant.set_relations(_clean_relations(payload.get("relations")))
    variant.save(update_fields=["settings"])
    world_views.touch_document(document, label="调整关系清单", author=request.user)
    return world_views.json_response({
        "relations": variant.relations(),
        "resolved_labels": {kind: variant.label_for(kind)
                            for kind, _label in world_views.TREE_EDGE_KINDS},
    })
