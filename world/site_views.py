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
from .models import AUDIENCE_PASSWORD, DOC_TIMELINE, DOC_TREE, World


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


def _site_base(world: World) -> dict:
    return {
        "world": world,
        "theme": world.theme,
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "sections": publish_service.site_sections(world),
        "noindex": world.audience != "public",
    }


@require_safe
def home(request, slug):
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated
    context = _site_base(world)
    documents = publish_service.site_documents(world)
    context["cards"] = documents.filter(document_type="card")[:24]
    context["total_documents"] = documents.count()
    return render(request, "site/home.html", context)


@require_safe
def page(request, slug, doc_slug):
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated
    document = publish_service.document_by_slug(world, doc_slug)
    if document is None:
        raise Http404("页面不存在或未发布")

    context = _site_base(world)
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
