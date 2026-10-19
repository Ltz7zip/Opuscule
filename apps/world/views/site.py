# -*- coding: utf-8 -*-
"""页面与启动数据：工作区页面、``/state`` 首屏、Service Worker、站点杂项。

（原 ``world/views.py`` 的「页面与启动数据」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
import logging
import pathlib

from .. import permissions, version as app_version
from ..models import AUDIENCE_PUBLIC, DOC_TYPES, MAX_OWNED_WORLDS, World
from ..models.constants import safe_primary_color
from ..normalize import as_int, as_text
from apps.documents.models import Card, Presence, WorldTimeline

from .accounts import _session_expiry
from .common import (
    create_world,
    current_world,
    error,
    json_response,
    parse_json,
    world_page_allowed,
    world_page_denied,
)


def service_worker(request):
    """把 Service Worker 从**根路径**发出去。

    放在 /static/sw.js 的话，它最多只能控制 /static/* —— 除非响应带上
    ``Service-Worker-Allowed: /``，而那个头在部署环境还得让 Web 服务器也配一遍。
    干脆由 Django 从根路径发：作用域天然是整个站点。
    """
    path = pathlib.Path(settings.BASE_DIR) / "static" / "sw.js"
    try:
        body = path.read_text(encoding="utf-8")
    except OSError:
        return HttpResponse("", content_type="application/javascript", status=404)
    response = HttpResponse(body, content_type="application/javascript; charset=utf-8")
    # SW 脚本本身永远别缓存：不然改了它要等好久才生效
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response["Service-Worker-Allowed"] = "/"
    return response


@require_safe
def robots_txt(request):
    """爬虫公约（``/robots.txt``）：约束正规搜索引擎，别把工作区 / 接口 / 后台爬走。

    分清两类"蜘蛛"（见推进计划.md §4.3）：
    · 搜索引擎蜘蛛——要它来，好让公开发布的世界能被搜到，所以放行只读站点。
    · 恶意采集——本就无视 robots.txt，真正拦它靠限流 + 登录墙 + 以后上 CDN；
      这里只是"约束正规的"，顺带少让扫描器替人发现后台入口。

    后台路径按 ``settings.ADMIN_URL_PATH`` 动态禁掉，别让人顺着默认的 /admin/ 找门。
    """
    admin_path = settings.ADMIN_URL_PATH
    lines = [
        "User-agent: *",
        # 工作区与全部 JSON 接口：登录后的私有空间，不对外开放
        "Disallow: /api/",
        "Disallow: /world",
        "Disallow: /w",
        "Disallow: /legacy",
        "Disallow: /relationship",
        "Disallow: /map",
        # 上传文件走鉴权，别让爬虫去撞
        "Disallow: /media/",
        # 后台入口（路径可配）
        f"Disallow: /{admin_path}/",
        # 账号相关表单页
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /logout",
        "Disallow: /reset",
        "Disallow: /maintenance",
        # 公开只读站点与展示页：明确放行，让被发布的世界能被搜到
        "Allow: /s/",
        "Allow: /explore",
        "",
    ]
    response = HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")
    response["Cache-Control"] = "public, max-age=3600"
    return response


@require_safe
def meta(request):
    """程序元信息（``/meta``）：版本 / 渠道，公开可读。

    版本号的**唯一来源**是 ``settings.APP_VERSION`` + ``APP_CHANNEL``（约定见
    推进计划.md §8），派生与展示串见 ``world.version.app_info``。页脚、CHANGELOG
    与这里引用同一处，别再另写死版本号。公开给机器探测用，不涉任何用户数据。
    """
    return json_response(app_version.app_info())


@require_safe
def healthz(request):
    """健康检查（``/healthz``）：探针用来判断「进程活着、数据库连得上」。

    给 uptime 监控 / 负载均衡探针用，所以**只做一件事**：发一条最轻的查询
    （``SELECT 1``）确认数据库可达。连不上就回 503，让监控能一眼分辨
    「应用崩了」和「数据库挂了」。不查业务数据、不鉴权、无副作用。
    """
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001 —— 探针要吞掉任何异常并如实上报
        logging.getLogger("world").warning("健康检查失败：%s", exc)
        return JsonResponse({"status": "error", "database": "down"}, status=503)
    return JsonResponse({"status": "ok"})


@require_safe
def explore(request):
    """公开世界展示页（``/explore``）：游客从工作区被送到这里。

    列出所有「公开发布」的世界，点进去就是各自只读站点 ``/s/<slug>/``。
    只列 ``audience=public`` 的：``unlisted`` 是"仅持链接可见"、``password``
    要密码——把它们摆进目录，等于替发布者泄底。
    """
    worlds = (World.objects
              .filter(is_published=True, audience=AUDIENCE_PUBLIC)
              .exclude(published_slug="")
              .order_by("-published_at", "-id"))
    items = []
    for world in worlds:
        items.append({
            "name": world.name,
            "description": (world.description or "").strip(),
            "url": world.site_url,
            "color": safe_primary_color(world.theme.get("primaryColor")),
            "version": world.publish_version,
            "genres": world.genres if isinstance(world.genres, list) else [],
        })
    return render(request, "explore.html", {
        "worlds": items,
        "count": len(items),
        "users_exist": permissions.users_exist(),
    })


@require_safe
def world_picker(request):
    """``/w/``：没有点名世界时的入口——列出我能进的世界让人挑。

    一个世界都没有时（首次安装 / 刚被别人移出）给一张空态卡片，指向新建与注册；
    游客先登录，登录完带着 ``next`` 回到这儿。
    """
    if not permissions.users_exist():
        return redirect("/register")
    if not (request.user and request.user.is_authenticated):
        return redirect("/login?next=%2Fw%2F")

    current = permissions.current_world_or_none()
    items = []
    for world in permissions.worlds_for(request.user):
        items.append({
            "id": world.id,
            "name": world.name,
            "description": (world.description or "").strip(),
            "slug": world.slug,
            "url": permissions.workspace_path(world),
            "color": safe_primary_color(world.theme.get("primaryColor")),
            "is_current": bool(current and world.id == current.id),
        })
    return render(request, "world_picker.html", {
        "worlds": items,
        "current_id": current.id if current else None,
        "display_name": request.user.get_full_name() or request.user.username,
    })


def workspace(request, world_slug=None):
    """世界工作区页面：``/w/<slug>``，前端自己再拉 ``<这个前缀>/api/world/state`` 启动。

    ``?embed=<doc_id>``：发布站点里嵌地图 / 关系树 / 图谱画布时用——
    只渲染那一篇文档，去掉工作区外壳，默认只读。

    读守门人拦的是接口，这一页本身也得挡：游客没带 ``embed``（或那篇没公开）
    送去登录（带 ``next`` 回来），登录了但不是这个世界的人给 404（不泄漏世界存在）。
    库里一个用户都没有时照旧放行：那是"首次安装"，得让人进得来把世界建起来。
    """
    world = permissions.current_world_or_none()
    if world is None:
        # 路径里的 slug 由中间件保证真实存在；走到这里说明库里还没有任何世界。
        return redirect("/w/")

    embed_id = as_int(request.GET.get("embed"), 0)
    document = permissions.published_document(embed_id) if embed_id else None
    if document is not None and document.world_id != world.id:
        document = None
    if document is not None:
        # 让这条会话认准文档所属的世界：嵌进来的地图 / 关系树页靠会话 world_id 取数
        request.session["world_id"] = document.world_id
    elif not world_page_allowed(request, world):
        return world_page_denied(request, world)
    return render(request, "workspace.html", {
        "embed_doc": embed_id,
        "embed_readonly": request.GET.get("readonly", "1") not in ("0", "false", "no"),
        "world": world,
        "world_slug": world.slug,
        "world_base": permissions.workspace_path(world),
    })


# --------------------------------------------------------------------------- #
# 旧地址：一律 302 到 /w/<slug>/…，已经发出去的链接不能断
# --------------------------------------------------------------------------- #
def _keep_query(request, target: str) -> str:
    """把原请求的查询串原样带到跳转目标上（``?embed=`` / ``?doc=`` 都要留着）。"""
    query = request.GET.urlencode()
    return f"{target}?{query}" if query else target


def _redirect_into_world(request, suffix: str = ""):
    """把请求送进"当前世界"的规范地址；没有世界就回选择页。"""
    world = permissions.current_world_or_none()
    if world is None:
        return redirect("/w/")
    return redirect(_keep_query(request, f"/w/{world.slug}{suffix}"))


def legacy_workspace(request):
    """旧入口 ``/world``：游客去公开展示页，登录者去自己世界的规范地址。"""
    embed_id = as_int(request.GET.get("embed"), 0)
    if embed_id:
        document = permissions.published_document(embed_id)
        if document is not None:
            return redirect(_keep_query(request, f"/w/{document.world.slug}"))
    if permissions.users_exist() and not (request.user and request.user.is_authenticated):
        return redirect("/explore")
    return _redirect_into_world(request)


def legacy_timeline(request):
    """旧独立页 ``/legacy`` → ``/w/<slug>/timeline``。"""
    return _redirect_into_world(request, "/timeline")


def legacy_relationship(request):
    """旧关系树页 ``/relationship`` → ``/w/<slug>/relation``。"""
    return _redirect_into_world(request, "/relation")


def legacy_map_home(request):
    """旧地图入口 ``/map`` → ``/w/<slug>/map/2d``（原来就跳到默认那一档）。"""
    return _redirect_into_world(request, "/map/2d")


def legacy_map_page(request, view):
    """旧地图页 ``/map/<view>`` → ``/w/<slug>/map/<view>``。"""
    return _redirect_into_world(request, f"/map/{view}")


def legacy_timeline_embedded(request, doc_id):
    """旧嵌入页 ``/w/timeline/<doc_id>`` → ``/w/<slug>/timeline/<doc_id>``。

    文档已经删了也照跳——地址里记的就是那个世界，页面自己会给出"这篇不在了"。
    """
    from apps.documents.models import Document

    world = (Document.objects.filter(pk=doc_id)
             .values_list("world__slug", flat=True).first())
    if world:
        return redirect(_keep_query(request, f"/w/{world}/timeline/{doc_id}"))
    return _redirect_into_world(request, f"/timeline/{doc_id}")


def legacy_w_entry(request):
    """旧短地址 ``/w`` → ``/w/``。"""
    return redirect(_keep_query(request, "/w/"))


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def world_detail(request):
    """读 / 改当前世界（名称、主题、AI 与自动识别开关、题材）。"""
    world = current_world()
    if request.method == "GET":
        return json_response(world.to_payload())

    payload = parse_json(request)
    if "name" in payload:
        world.name = as_text(payload.get("name"), 120) or world.name
    if "description" in payload:
        world.description = as_text(payload.get("description"), 4000)
    if "theme_config" in payload and isinstance(payload.get("theme_config"), dict):
        theme = dict(world.theme_config or {})
        for key, value in payload["theme_config"].items():
            if key in ("mode", "grain", "headingFont", "bodyFont", "primaryColor", "background"):
                theme[key] = value
        if theme.get("mode") not in ("light", "dark"):
            theme["mode"] = "dark"
        world.theme_config = theme
    if "genres" in payload and isinstance(payload.get("genres"), list):
        world.genres = [as_text(item, 40) for item in payload["genres"] if as_text(item, 40)][:12]
    for field in ("ai_enabled", "auto_link_enabled", "link_entrance_enabled"):
        if field in payload:
            setattr(world, field, bool(payload.get(field)))
    world.save()
    return json_response(world.to_payload())


def _owned_worlds_count(user) -> int:
    """这个用户自己当所有者的世界数——配额按"自建"算，不含被邀请加入的。"""
    return World.objects.filter(owner=user).count()


@csrf_exempt
@require_http_methods(["GET", "POST"])
def world_collection(request):
    """列出"我的世界"（GET）/ 新建一个属于自己的世界（POST）。

    注册即得一个世界；这里让用户之后随时再建。新世界默认空（只带三个起步类型 +
    通用日历），建好就把它切成当前世界，前端刷新即可看到一片干净的工作区。
    自建数量有上限（``MAX_OWNED_WORLDS``）；被邀请加入别人的世界不计入。
    """
    user = request.user
    if request.method == "GET":
        if not user or not user.is_authenticated:
            return json_response({"worlds": [], "current": None, "can_create": False})
        active = permissions.current_world_or_none()
        worlds = [
            {**world.to_payload(), "is_current": bool(active and world.id == active.id)}
            for world in permissions.worlds_for(user)
        ]
        owned = _owned_worlds_count(user)
        return json_response({
            "worlds": worlds,
            "current": active.id if active else None,
            "can_create": owned < MAX_OWNED_WORLDS,
            "owned_count": owned,
            "max_worlds": MAX_OWNED_WORLDS,
        })

    if not user or not user.is_authenticated:
        return error("登录后才能新建世界", status=401)
    if _owned_worlds_count(user) >= MAX_OWNED_WORLDS:
        return error(f"自建世界已达上限（{MAX_OWNED_WORLDS} 个）", status=403)
    payload = parse_json(request)
    world = create_world(
        name=as_text(payload.get("name"), 120) or "新世界",
        owner=user,
        theme_config=payload.get("theme_config") if isinstance(payload.get("theme_config"), dict) else None,
        genres=payload.get("genres") if isinstance(payload.get("genres"), list) else None,
    )
    request.session["world_id"] = world.id
    return json_response(
        {"world": world.to_payload(), "viewer": permissions.viewer_payload(user, world)},
        status=201,
    )


@csrf_exempt
@require_http_methods(["POST"])
def world_switch(request, world_id):
    """切换到某个世界（写进会话，后续请求都作用在它上面）。"""
    user = request.user
    if not user or not user.is_authenticated:
        return error("请先登录", status=401)
    world = World.objects.filter(pk=as_int(world_id)).first()
    if world is None:
        return error("未找到该世界", status=404)
    if not permissions.can_access(user, world):
        return error("你不在这个世界里", status=403)
    request.session["world_id"] = world.id
    return json_response({
        "world": world.to_payload(),
        "viewer": permissions.viewer_payload(user, world),
    })


@require_safe
def state(request):
    """启动数据：世界 + 我是谁 + 在线 + 类型 + 纪元 + 日历 + 文档树。

    能读整棵树的是"登录且属于这个世界"的人。游客（发布站点的只读嵌入）只拿得到
    ``?embed=<id>`` 指名的那一篇——树、在线、回收站一律清空，防止他顺着 state
    把整片未公开的工作区看光。
    """
    world = current_world()

    if not permissions.can_read(request.user, world):
        # 只读嵌入：只回被嵌的那一篇（供前端 findNode 认出它的类型）
        embedded = permissions.published_document(as_int(request.GET.get("embed"), 0))
        documents = [embedded.to_payload(with_children=True)] if embedded is not None else []
        online = []
        trash_count = 0
    else:
        # 一次取回整棵树，在内存里按 parent 分组；避免每个有子节点的文档各查一次。
        # 只取序列化要用的列：地图的 map_data 等大字段不必跟着首屏一起读出来。
        all_documents = list(
            world.documents.filter(deleted_at__isnull=True)
            .only(
                "id", "document_type", "name", "slug", "parent_id", "position",
                "era_id", "era_ids", "entity_type_id", "settings", "cover", "icon",
                "pinned", "hidden", "is_published", "published_slug", "published_version",
                "published_at", "updated_at",
            )
            .order_by("position", "id")
        )
        children_map: dict[int, list] = {}
        for document in all_documents:
            if document.parent_id:
                children_map.setdefault(document.parent_id, []).append(document)
        documents = [
            document.to_payload(with_children=True, world=world, children_map=children_map)
            for document in all_documents if document.parent_id is None
        ]
        online = [entry.to_payload() for entry in Presence.online(world)]
        trash_count = world.documents.filter(deleted_at__isnull=False).count()

    # 每个纪元里看不见的卡片：唯一口径是 Card.visible_in_era（前端不再自己算）
    # 只取判断可见性需要的列，别把卡片正文一起读出来
    cards = list(
        Card.objects.filter(document__world=world, document__deleted_at__isnull=True)
        .only("document_id", "era_mode", "era_ids")
    )
    eras = list(world.eras.all())
    era_hidden = {
        str(era.id): [card.document_id for card in cards if not card.visible_in_era(era.id)]
        for era in eras
    }
    timeline = WorldTimeline.objects.filter(world=world).first()
    return json_response({
        "world": world.to_payload(),
        "viewer": permissions.viewer_payload(request.user, world),
        "online": online,
        "types": [entity_type.to_payload() for entity_type in world.types.all()],
        "eras": [era.to_payload() for era in eras],
        "calendars": [calendar.to_payload() for calendar in world.calendars.all()],
        "documents": documents,
        # 纪元 -> 这一版里看不见的卡片 id（口径见 Card.visible_in_era）
        "era_hidden": era_hidden,
        # 世界总时间线是否有内容：侧栏「设置工作空间」进度卡靠它判断
        "timeline_events": timeline.events.count() if timeline is not None else 0,
        "doc_types": [{"value": value, "label": label} for value, label in DOC_TYPES],
        "trash_count": trash_count,
        # 侧栏世界菜单：我能进的世界 + 现在这个是哪个（一次给全，切菜单不用再请求）
        "worlds": [
            {**item.to_payload(), "is_current": item.id == world.id}
            for item in permissions.worlds_for(request.user)
        ],
        # 会话到期时间随首屏一起给，前端好在过期前提醒续期
        "session_expires_at": _session_expiry(request),
        # 发布摘要：顶栏「维基」靠它决定"跳站点"还是"先发布"
        "publish": world.publish_summary(),
    })
