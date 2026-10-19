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

import functools
import pathlib
import re

from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .services import publish as publish_service
from .models import AUDIENCE_PASSWORD, DOC_CARD, DOC_TIMELINE, DOC_TREE, REPORT_REASONS, Report, World
from .models.constants import safe_primary_color, sanitize_theme
from .normalize import as_int, as_text


def _get_world(slug: str) -> World:
    world = World.objects.filter(published_slug=slug).first()
    if world is None or not world.is_published:
        raise Http404("站点不存在或尚未发布")
    if world.is_banned:
        # 平台封禁：到期自动恢复（``is_banned`` 惰性判断）。这里一处拒绝，就覆盖了
        # 首页 / 搜索 / 纪元 / 文档页 / feed / og.svg 全部公开面。
        raise Http404("站点暂时不可用")
    return world


# ----------------------------------------------------------------- 订阅（RSS）
@require_safe
def feed(request, slug: str):
    """只读站点的 RSS：把已发布的文档按更新时间排出来。

    "exit intent 订阅提示"如果没有一个真能订阅的东西，就只是句空话——
    这里给它一个真的：读者把 feed 丢进阅读器就能追更。
    """
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated
    base = request.build_absolute_uri(f"/s/{world.published_slug}/")
    documents = sorted(publish_service.site_documents(world),
                       key=lambda doc: doc.updated_at or doc.created_at, reverse=True)[:80]
    items = []
    for doc in documents:
        link = f"{base}{doc.slug}/"
        updated = doc.updated_at or doc.created_at
        summary = (doc.preview or "").strip()
        items.append(
            "    <item>\n"
            f"      <title>{_xml_escape(doc.name)}</title>\n"
            f"      <link>{_xml_escape(link)}</link>\n"
            f"      <guid isPermaLink=\"true\">{_xml_escape(link)}</guid>\n"
            f"      <pubDate>{updated.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>\n"
            f"      <description>{_xml_escape(summary)}</description>\n"
            "    </item>"
        )
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>\n'
        f"  <title>{_xml_escape(world.name)}</title>\n"
        f"  <link>{_xml_escape(base)}</link>\n"
        f"  <description>{_xml_escape(world.description or world.name)}</description>\n"
        f"  <lastBuildDate>{timezone.now().strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>\n"
        + "\n".join(items)
        + "\n</channel></rss>\n"
    )
    response = HttpResponse(body, content_type="application/rss+xml; charset=utf-8")
    response["Cache-Control"] = "no-store"
    return response


# ----------------------------------------------------------------- OG 分享卡片
@functools.lru_cache(maxsize=1)
def _og_template() -> str:
    """分享卡片的 SVG 模板（仓库里的静态件，进程内读一次就够）。"""
    path = pathlib.Path(settings.BASE_DIR) / "static" / "brand" / "opuscule-og.svg"
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _xml_escape(text: str) -> str:
    return (str(text or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


@require_safe
def og_card(request, slug: str):
    """只读站点的分享卡片（SVG，1200×630）。

    设计稿在 ``static/brand/opuscule-og.svg``：暗色画布 + 网格 + 炼金术标记，
    标题是世界名、副标题是一句话简介、标记取世界主色。

    为什么是 SVG：这个项目不引图片库（requirements 里只有 Django），没有 Pillow
    就描不出 PNG。Slack / Telegram 这类现代预览器认 SVG，Facebook 只认 PNG——
    真要上 FB，得再挂一个渲染步骤。
    """
    world = _get_world(slug)
    template = _og_template()
    if not template:
        raise Http404("卡片模板缺失")
    theme = world.theme or {}
    color = safe_primary_color(theme.get("primaryColor"))    # 别让主题值变成注入点
    subtitle = world.description or f"{world.published_slug} · 只读站点"
    body = (template
            .replace("__TITLE__", _xml_escape((world.name or "")[:26]))
            .replace("__SUB__", _xml_escape(subtitle[:34]))
            .replace("var(--era, #3ddc97)", color))
    response = HttpResponse(body, content_type="image/svg+xml; charset=utf-8")
    response["Cache-Control"] = "public, max-age=600"
    return response


def _password_context(world: World, error: bool = False) -> dict:
    """密码页的上下文（``_gate`` 与 ``unlock`` 失败时共用一份）。

    这一页也把主题色写进内联 ``style``，所以主题同样要过一遍清洗。
    """
    theme = sanitize_theme(world.theme)
    return {
        "world": world,
        "theme": theme,
        "theme_mode": "light" if theme.get("mode") == "light" else "dark",
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "error": error,
    }


def _gate(request, world: World):
    """返回密码页（如果需要），否则返回 None。"""
    if publish_service.can_view(world, request.session):
        return None
    return render(request, "site/password.html", _password_context(world))


def _site_base(world: World, sections=None, request=None, filters=None, eras=None) -> dict:
    # 首页 / 搜索 / 纪元页 / 文档页都要同一份站点文档：这里只取一次，
    # 让 filters、sections 共用 QuerySet 缓存，避免同一页反复扫全表。
    documents = None
    if filters is None or sections is None:
        documents = publish_service.site_documents(world)
    if filters is None:
        filters = publish_service.site_filters(world, documents=documents)
    if sections is None:
        sections = publish_service.site_sections(world, documents=documents)
    if eras is None:
        eras = publish_service.site_eras(world, counts=filters["eras"])
    # 主题值会被写进 <body style> 与内联 style：这里是站点唯一的出口，统一清洗一遍
    # （主色只放行 #rgb..rrggbbaa，字体名只放行安全字符）。见 2026-10-15 体检 F3。
    theme = sanitize_theme(world.theme)
    return {
        "world": world,
        "theme": theme,
        # 只读站点的明暗跟随世界主题；没配就是终端语言的默认暗色。
        # 模板把它写到 <html data-theme>，terminal.css 按它切表面台阶。
        "theme_mode": "light" if theme.get("mode") == "light" else "dark",
        "audience_label": publish_service.AUDIENCE_LABELS.get(world.audience, ""),
        "sections": sections,
        "noindex": world.audience != "public",
        "site_types": filters["types"],
        "site_eras": eras,
        "query": ((request.GET.get("q") or "").strip() if request is not None else ""),
        "active_filter": (_active_filter(request, world, filters["types"]) if request is not None
                          else {"type_slug": "", "era_id": 0, "label": "全部", "active": False}),
    }


def _active_filter(request, world: World, types=None) -> dict:
    """解析 ?type= / ?era=，并给出 chip 上显示的名字。"""
    type_slug = (request.GET.get("type") or "").strip()
    era_id = as_int(request.GET.get("era"), 0)
    label = "全部"
    if type_slug:
        type_options = types if types is not None else publish_service.site_filters(world)["types"]
        match = next((item for item in type_options if item["slug"] == type_slug), None)
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
    filters = publish_service.site_filters(world)
    active = _active_filter(request, world, filters["types"])
    documents = publish_service.filter_documents(
        publish_service.site_documents(world),
        type_slug=active["type_slug"], era_id=active["era_id"],
    )
    keyword = (request.GET.get("q") or "").strip()
    hits = publish_service.search_documents(world, keyword) if keyword else []
    eras = publish_service.site_eras(world, counts=filters["eras"])
    context = _site_base(
        world,
        # 筛选时不再塞「世界时间线」那一格：它不参与按类型 / 纪元过滤，
        # 留在列表里会让"筛过了"的观感失真。
        sections=publish_service.site_sections(
            world, documents=documents, include_timeline=not active["active"]
        ),
        request=request,
        filters=filters,
        eras=eras,
    )
    context.update({
        "cards": documents.filter(document_type=DOC_CARD)[:24],
        "total_documents": documents.count(),
        "active_filter": active,
        "query": keyword,
        "hits": hits,
        "eras": eras,
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
    filters = publish_service.site_filters(world)
    active = _active_filter(request, world, filters["types"])
    hits = publish_service.search_documents(world, keyword) if keyword else []
    if active["active"]:
        allowed = set(
            publish_service.filter_documents(
                publish_service.site_documents(world),
                type_slug=active["type_slug"], era_id=active["era_id"],
            ).values_list("id", flat=True)
        )
        hits = [hit for hit in hits if hit["document"].id in allowed]
    similar = publish_service.suggest_similar(world, keyword) if (keyword and not hits) else []
    # 站点列表用「加载更多」而不是翻页——每次多给 20 条，
    # 按钮上方写清"已显示 x / y 条"。
    per_page = max(20, min(200, as_int(request.GET.get("show"), 20) or 20))
    paged = publish_service.paginate(hits, page=1, per_page=per_page)
    context = _site_base(world, request=request, filters=filters)
    context.update({
        "query": keyword,
        "hits": paged["items"],
        "pager": paged,
        "shown": len(paged["items"]),
        "can_load_more": paged["total"] > len(paged["items"]),
        "next_show": per_page + 20,
        "similar": similar,
        "active_filter": active,
        "total_documents": sum(len(section["documents"]) for section in context["sections"]),
    })
    return render(request, "site/search.html", context)


@require_safe
def era_page(request, slug, era_id):
    """一个纪元的站点页：说明 + 这个纪元里的事件（按时间排）。"""
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated

    era = world.eras.filter(pk=as_int(era_id)).first()
    if era is None:
        raise Http404("纪元不存在")
    context = _site_base(world, request=request)
    context.update(publish_service.era_summary(world, era))
    context["all_eras"] = context["site_eras"]
    return render(request, "site/era.html", context)


@require_safe
def page(request, slug, doc_slug):
    world = _get_world(slug)
    gated = _gate(request, world)
    if gated:
        return gated

    # 0.7.0：时间线不再是文档，但站点上仍要有 ``/s/<slug>/timeline/`` 这一页
    if doc_slug == publish_service.TIMELINE_SITE_SLUG:
        timeline = publish_service.world_timeline(world)
        if timeline is not None:
            return _timeline_page(request, world, timeline)

    document = publish_service.document_by_slug(world, doc_slug)
    if document is None:
        return _missing_document(request, world, doc_slug)

    context = _site_base(world, request=request)
    context.update({
        "document": document,
        "card": getattr(document, "card", None),
        "related": publish_service.related_documents(document, world),
        "is_timeline": document.document_type == DOC_TIMELINE,
        # 地图 / 关系树 / 图谱：站点上直接把工作区的只读画布嵌进来
        "canvas_embed": document.document_type in ("map", DOC_TREE, "graph"),   # 地图 / 关系树 / 图谱都嵌只读画布
        "events": document.events.all() if document.document_type == DOC_TIMELINE else [],
        # 旧的时间线文档还能嵌工作区；世界总时间线的接口要登录，公开站点只给事件列表
        "timeline_embed": (
            f"/w/{world.slug}/timeline/{document.id}?readonly=1&paper=1"
            if document.document_type == DOC_TIMELINE else ""
        ),
    })
    if context["card"] is not None:
        context["properties"] = [
            entry for entry in context["card"].resolved_values(world=world).values()
            if entry.get("display")
        ]
    return render(request, "site/page.html", context)


def _timeline_page(request, world: World, timeline):
    """站点上的世界总时间线：默认嵌只读画布，事件列表作为可切换的备份视图。"""
    context = _site_base(world, request=request)
    context.update({
        "document": publish_service.SiteTimeline(),
        "card": None,
        "related": [],
        "is_timeline": True,
        "canvas_embed": False,
        # 只读画布读世界级 classic 接口；allow_public_read 已对游客放行这条读路径。
        "timeline_embed": (
            f"/w/{world.slug}/timeline?readonly=1&paper=1"
            f"&theme={context['theme_mode']}"
        ),
        "events": publish_service.timeline_events(world),
        "timeline": timeline,
        "eras": context["site_eras"],
    })
    return render(request, "site/page.html", context)


def _missing_document(request, world: World, doc_slug: str):
    """站点上找不到这份文档（见 docs/09-发布与只读站点.md）。

    分两种：**曾经有、现在没了**（slug 在库里还对得上号，只是没发布 / 被隐藏 /
    进了回收站）——那就告诉读者这儿原来是什么、附近还有什么开着；否则就是
    纯粹的"信号丢失"，给一个 glitch 的 404 和搜索框。
    """
    ghost = world.documents.filter(slug=doc_slug).first()
    if ghost is None and doc_slug.isdigit():
        ghost = world.documents.filter(pk=as_int(doc_slug, 0)).first()
    context = _site_base(world, request=request)
    context.update({
        "removed": ghost is not None,
        "ghost_name": ghost.name if ghost is not None else "",
        "related": publish_service.related_documents(ghost, world)[:6] if ghost is not None else [],
    })
    return render(request, "site/missing.html", context, status=404)


@require_http_methods(["POST"])
def unlock(request, slug):
    world = _get_world(slug)
    password = request.POST.get("password", "")
    if publish_service.unlock(world, request.session, password):
        return redirect("site:home", slug=slug)
    return render(request, "site/password.html", _password_context(world, error=True), status=403)


@csrf_exempt
@require_http_methods(["POST"])
def report(request, slug):
    """读者在只读站点上举报某个公开 wiki（批次 C）。

    匿名可提交——这是「读者发现有问题」的入口，不该先逼人登录。落库后只有站长
    （``is_privileged``）能在治理台看到与处置（见 ``views.report_collection``）。
    站点是公开的，所以这里 ``@csrf_exempt``，与项目里其他 JSON 写接口一致。
    """
    world = _get_world(slug)                       # 未发布 / 被封禁一律 404
    payload = request.POST if request.POST else _json_body(request)
    valid_reasons = {value for value, _label in REPORT_REASONS}
    reason = as_text(payload.get("reason"), 20)
    if reason not in valid_reasons:
        reason = "content"
    detail = as_text(payload.get("detail"), 4000)
    if not detail:
        return JsonResponse({"ok": False, "error": "请填写举报内容"}, status=400)
    from .views import client_ip                   # 懒导入，避免与 views 形成导入环

    report_row = Report.objects.create(
        world=world,
        world_name=world.name,
        world_slug=world.published_slug,
        doc_slug=as_text(payload.get("doc"), 200),
        reporter=request.user if request.user.is_authenticated else None,
        reporter_name=request.user.username if request.user.is_authenticated else "",
        reason=reason,
        detail=detail,
        contact=as_text(payload.get("contact"), 200),
        ip=client_ip(request),
    )
    return JsonResponse({"ok": True, "id": report_row.id})


def _json_body(request):
    """举报也接受 JSON 体（前端 fetch 两种都发得出来，容错取用）。"""
    import json

    try:
        parsed = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}
