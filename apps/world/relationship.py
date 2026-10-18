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
* ``PUT  trees/<doc_id>/relations`` 整份替换可用关系清单（编辑区左侧那一列）

人物与关系的增删改沿用 ``world.views`` 里那套 ``tree-nodes`` / ``tree-edges``
接口——同一个数据模型，没必要为这页再抄一遍。
"""

from __future__ import annotations

from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from . import permissions
from . import views as world_views
from .models import DOC_TREE
from .relations import (
    GRID,
    RELATION_KIND_VALUES,
    TREE_TEMPLATES,
    grid_payload,
    relation_style,
    template,
    template_payload,
    template_relations,
)
from apps.documents.models import Card, Document
from apps.graph.models import TreeEdge, TreeNode, TreeVariant

#: 这些名字是"还没起过名"的意思，选完模版可以顺手替掉
DEFAULT_TREE_NAMES = {"", "未命名", "新建关系树", "关系树"}


def relationship_page(request, world_slug=None):
    """关系树页面。``?doc=<id>`` 直接进编辑区，不带就停在模版选择那一步。

    世界由路径 ``/w/<slug>/relation`` 指定（``world_slug`` 形参只是让路由签名对齐，
    真正的解析在中间件里）；没有当前世界就回世界选择页，进不去就让对方登录 / 404。

    明暗跟工作区走同一条规则（``world.theme.mode``，非 light 即 dark），
    这样从工作区点「全屏编辑」跳过来不会有"闪一下换了皮肤"的割裂感。

    ``?embed=1``：被工作区面板 / 发布站点用 iframe 嵌进去时用——去掉外壳的
    留白与圆角边框，让编辑器直接铺满那块地方。``embed`` 默认只读，
    要可编辑得显式给 ``readonly=0``。
    """
    world = permissions.current_world_or_none()
    if world is None:
        return redirect("/w/")
    if not world_views.world_page_allowed(request, world):
        return world_views.world_page_denied(request, world)
    # 原样留着请求的 id（别悄悄归零）：文档打不开时前端要能说"这篇不在了"，
    # 而不是把人丢回模版选择——那看着像"我的树变成了新建向导"。
    doc_id = world_views.as_int(request.GET.get("doc"), 0)
    document = None
    if doc_id:
        document = world_views.get_document(world, doc_id)
        if document is not None and document.document_type != DOC_TREE:
            document = None
    theme = world.theme_config if isinstance(world.theme_config, dict) else {}
    # 明暗两档（终端设计语言外壳只有一套暗色，嵌入时必须跟宿主同色）：
    # light = 世界主题显式设成浅色；其余（含发布站点传来的 theme=paper）一律走暗色。
    theme_mode = request.GET.get("theme", "")
    if theme_mode not in ("paper", "light", "dark"):
        theme_mode = "light" if theme.get("mode") == "light" else "dark"
    is_light = theme_mode == "light"
    embed = request.GET.get("embed", "") not in ("", "0", "false", "no")
    readonly = embed if "readonly" not in request.GET else (
        request.GET.get("readonly", "") not in ("0", "false", "no"))
    # 没编辑权限的人（游客 / 只读成员）看到的也是只读画布
    if not permissions.can_edit(request.user, world):
        readonly = True
    # 三维联动（PLAN §4.4 B）：``?era=`` 只过滤显示；``?focus=`` 高亮一张卡片对应的节点。
    era_id = world_views.as_int(request.GET.get("era"), 0)
    if era_id and not world.eras.filter(id=era_id).exists():
        era_id = 0
    return render(request, "relationship.html", {
        "doc_id": doc_id,
        "doc_missing": bool(doc_id) and document is None,
        "era_id": era_id,
        "focus_card": world_views.as_int(request.GET.get("focus"), 0),
        "theme_mode": "light" if is_light else "dark",
        # 嵌入态：宿主是暗色外壳，画布跟着暗
        "paper": not is_light,
        "embed": embed,
        "readonly": readonly,
        # 页面 / 接口都挂在世界下面，模板里用它拼地址
        "world": world,
        "page_base": f"/w/{world.slug}",
        "api_base": f"/w/{world.slug}/api/world",
    })


# --------------------------------------------------------------------------- #
# 模版目录
# --------------------------------------------------------------------------- #
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
        # 只读成员翻关系树列表时，别把别人没发布的树名字漏出去
        if not permissions.can_edit(request.user, world):
            documents = documents.filter(is_published=True, hidden=False)
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
        # setup：这一步就是"选模版"，选完就打标记，以后打开不再问
        settings={"relations": template_relations(template_id), "setup": True},
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


@csrf_exempt
@require_http_methods(["POST"])
def tree_setup(request, doc_id):
    """给**已经存在**的空树选模版（工作区面板里那一步）。

    和 ``POST /trees`` 的区别只在"树是新建的还是现成的"：那边建文档 + 变体，
    这边把现成的空变体就地配上模版（关系清单 + 可选的示例人物），并打上 setup 标记。
    已经有人物或关系的树不再允许重配——那会把用户画好的东西冲掉。
    """
    world = world_views.current_world()
    document = world_views.get_document(world, doc_id)
    if document is None:
        return world_views.json_response(world_views.DOC_NOT_FOUND, status=404)
    if document.document_type != DOC_TREE:
        return world_views.error("这个文档不是关系树")

    variant = _variant_or_default(document)
    if variant.nodes.exists() or variant.edges.exists():
        return world_views.error("这棵树已经有内容了，不能再用模版重配")

    payload = world_views.parse_json(request)
    template_id = world_views.as_text(payload.get("template"), 20) or "family"
    if template_id not in {item["id"] for item in TREE_TEMPLATES}:
        template_id = "family"

    # 名字还是默认的就跟着模版起一个（"家庭关系树"）；用户自己改过就不动
    if document.name in DEFAULT_TREE_NAMES:
        document.name = f"{template(template_id)['name']}关系树"
        document.save(update_fields=["name"])

    variant.kind = template_id
    relations = payload.get("relations")
    variant.set_relations(
        _clean_relations(relations) if isinstance(relations, list)
        else template_relations(template_id)
    )
    variant.mark_setup()
    variant.save()

    if payload.get("with_demo") and template_id != "blank":
        _seed_demo(variant, template_id)

    world_views.touch_document(document, label="选择关系树模版", author=request.user)
    return world_views.json_response({
        "document": document.to_payload(),
        "variant": variant.to_payload(with_graph=True),
        "grid": grid_payload(),
        "summary": _tree_summary(document),
    })


# --------------------------------------------------------------------------- #
# 编辑区状态
# --------------------------------------------------------------------------- #
def _variant_or_default(document: Document) -> TreeVariant:
    variant = document.tree_variants.order_by("position", "id").first()
    if variant is None:
        variant = TreeVariant.objects.create(document=document, name="Main", kind="family", position=0)
    return variant


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
    eras = list(world.eras.all())
    # 时代可见性只在这里算一次：前端拿结果直接过滤，不再自己实现一遍口径。
    cards = {
        card.document_id: card
        for card in Card.objects.filter(
            document__world=world, document__deleted_at__isnull=True
        )
    }
    era_hidden = {
        str(era.id): [
            doc_id for doc_id, card in cards.items() if not card.visible_in_era(era.id)
        ]
        for era in eras
    }
    edges = list(variant.edges.all())
    era_edges = {}
    for era in eras:
        span = era.filter_span()
        if span is None:            # 时代还没摆到轴上：不过滤
            continue
        era_edges[str(era.id)] = [
            edge.id for edge in edges if edge.active_in_span(*span)
        ]
    return world_views.json_response({
        "document": document.to_payload(),
        "variant": variant.to_payload(with_graph=True),
        "grid": grid_payload(),
        # 时代区间：前端据此判断一条关系是否落在当前时代里（§4.4 D）
        "eras": [era.to_payload() for era in eras],
        # §4.4 B / §4.5：节点与关系在某个时代里显不显示，服务端一次算好
        "era_hidden": era_hidden,
        "era_edges": era_edges,
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
    """这棵树可用的关系清单（编辑区左侧那一列）：GET 读取 / PUT 整份替换。"""
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
