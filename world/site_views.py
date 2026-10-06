# -*- coding: utf-8 -*-
"""只读站点（发布出来的那一面）。

路由：

    GET  /s/<slug>/               站点首页（按类型分区的卡片网格）
    GET  /s/<slug>/<doc_slug>/    卡片 / 时间线页面
    POST /s/<slug>/unlock         密码档解锁

站点是公开的（不带 CSRF、不依赖登录），所以这里不使用 ``@csrf_exempt`` 之外的保护；
密码档用 Django session 记住放行状态。未发布 / slug 不存在一律 404。
"""

from __future__ import annotations

from django.http import Http404
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods, require_safe

from . import publish as publish_service
from .models import AUDIENCE_PASSWORD, DOC_CARD, DOC_TIMELINE, DOC_TREE, World
from .normalize import as_int


def _get_world(slug: str) -> World:
    world = World.objects.filter(published_slug=slug).first()
    if world is None or not world.is_published:
        raise Http404("站点不存在或尚未发布")
    return world


def _gate(request, world: World):
    """返回密码页（如果需要），否则返回 None。"""
    if publish_service.can_view(world, request.session):
        return None
    return render(request, "site/password.html", {
        "world": world,
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "error": False,
    })


def _site_base(world: World, sections=None, request=None) -> dict:
    filters = publish_service.site_filters(world)
    return {
        "world": world,
        "theme": world.theme,
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "sections": publish_service.site_sections(world) if sections is None else sections,
        "noindex": world.audience != "public",
        "site_types": filters["types"],
        "site_eras": filters["eras"],
        "query": ((request.GET.get("q") or "").strip() if request is not None else ""),
        "active_filter": (_active_filter(request, world) if request is not None
                          else {"type_slug": "", "era_id": 0, "label": "全部", "active": False}),
    }


def _active_filter(request, world: World) -> dict:
    """解析 ?type= / ?era=，并给出 chip 上显示的名字。"""
    type_slug = (request.GET.get("type") or "").strip()
    era_id = as_int(request.GET.get("era"), 0)
    label = "全部"
    if type_slug:
        match = next((item for item in publish_service.site_filters(world)["types"]
                      if item["slug"] == type_slug), None)
        label = match["name"] if match else type_slug
    elif era_id:
        era = world.eras.filter(pk=era_id).first()
        label = era.name if era is not None else f"纪元 {era_id}"
    return {"type_slug": type_slug, "era_id": era_id, "label": label,
            "active": bool(type_slug or era_id)}


@require_safe
def home(request, slug):
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated
    active = _active_filter(request, world)
    documents = publish_service.filter_documents(
        publish_service.site_documents(world),
        type_slug=active["type_slug"], era_id=active["era_id"],
    )
    keyword = (request.GET.get("q") or "").strip()
    hits = publish_service.search_documents(world, keyword) if keyword else []
    context = _site_base(world, sections=publish_service.site_sections(world, documents=documents), request=request)
    context.update({
        "cards": documents.filter(document_type=DOC_CARD)[:24],
        "total_documents": documents.count(),
        "active_filter": active,
        "query": keyword,
        "hits": hits,
    })
    return render(request, "site/home.html", context)


@require_safe
def search(request, slug):
    """站点全文搜索：名称、别名、正文、属性值、事件标题都能命中。"""
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated

    keyword = (request.GET.get("q") or "").strip()
    active = _active_filter(request, world)
    hits = publish_service.search_documents(world, keyword) if keyword else []
    if active["active"]:
        allowed = set(
            publish_service.filter_documents(
                publish_service.site_documents(world),
                type_slug=active["type_slug"], era_id=active["era_id"],
            ).values_list("id", flat=True)
        )
        hits = [hit for hit in hits if hit["document"].id in allowed]
    context = _site_base(world, request=request)
    context.update({"query": keyword, "hits": hits, "active_filter": active,
                    "total_documents": context["sections"] and sum(len(s["documents"]) for s in context["sections"]) or 0})
    return render(request, "site/search.html", context)


@require_safe
def page(request, slug, doc_slug):
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated
    document = publish_service.document_by_slug(world, doc_slug)
    if document is None:
        raise Http404("页面不存在或未发布")

    context = _site_base(world, request=request)
    context.update({
        "document": document,
        "card": getattr(document, "card", None),
        "related": publish_service.related_documents(document),
        "is_timeline": document.document_type == DOC_TIMELINE,
        # 地图 / 关系树 / 图谱：站点上直接把工作区的只读画布嵌进来
        "canvas_embed": document.document_type in ("map", DOC_TREE, "graph"),
        "events": document.events.all() if document.document_type == DOC_TIMELINE else [],
    })
    if context["card"] is not None:
        context["properties"] = [
            entry for entry in context["card"].resolved_values().values()
            if entry.get("display")
        ]
    return render(request, "site/page.html", context)


@require_http_methods(["POST"])
def unlock(request, slug):
    world = _get_world(slug)
    password = request.POST.get("password", "")
    if publish_service.unlock(world, request.session, password):
        return redirect("site:home", slug=slug)
    return render(request, "site/password.html", {
        "world": world,
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "error": True,
    }, status=403)
