# -*- coding: utf-8 -*-
"""个人主页（``/u/<username>``）与它的配置接口（``/api/world/profile``）。

仿 GitHub 的个人主页：头像用首字母，资料卡下面是若干可排版的区块
（简介 / 统计 / 链接 / 题材 / 精选世界 / 全部世界 / 动态 / 自定义文字）。
本人登录后进入编辑模式，可增删区块、上下移动、隐藏、改主题色与布局。

数据只有一行 ``UserProfile``；没有就按默认值现建。公开访问时只吐
「已发布 + 公开」的世界，本人则看到自己全部的世界（含草稿）。
"""

from __future__ import annotations

import re

from django.contrib.auth.models import User
from django.db.models import Q
from django.http import Http404
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .. import permissions
from ..models import AUDIENCE_PUBLIC, DOC_FOLDER, UserProfile, World
from ..models.constants import safe_primary_color
from ..models.profile import (
    BLOCK_LABELS,
    BLOCK_REGIONS,
    BLOCK_TYPES,
    DEFAULT_ACCENT,
    LAYOUT_SINGLE,
    LAYOUT_TWO,
    LAYOUTS,
    SINGLETON_BLOCKS,
    default_blocks,
    region_for,
)
from ..normalize import as_int, as_text
from apps.documents.models import Document, TimelineEvent

from .common import error, json_response, parse_json

MAX_BLOCKS = 20
MAX_LINKS = 12
MAX_PINNED = 12
MAX_ACTIVITY = 8

_BLOCK_ID_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
_ACCENT_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_URL_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


# --------------------------------------------------------------------------- #
# 清洗：所有写入都从这里过一遍，前端传脏数据也不会把模型写坏
# --------------------------------------------------------------------------- #
def _clean_url(value, limit: int = 300) -> str:
    """只留 http(s) / mailto / 站内相对路径；裸域名补 https，奇怪协议直接丢。"""
    text = as_text(value, limit)
    if not text:
        return ""
    low = text.lower()
    if low.startswith(("http://", "https://", "mailto:")):
        return text
    if text.startswith("/") and not text.startswith("//"):
        return text
    if _URL_SCHEME_RE.match(text):
        return ""
    return "https://" + text


def _clean_links(raw) -> list[dict]:
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        url = _clean_url(item.get("url"))
        if not url:
            continue
        label = as_text(item.get("label"), 80) or url
        out.append({"label": label, "url": url})
        if len(out) >= MAX_LINKS:
            break
    return out


def _clean_blocks(raw) -> list[dict]:
    """保留合法区块；``note`` 可多份，其余每种只留第一份。"""
    if not isinstance(raw, list):
        return default_blocks()
    result: list[dict] = []
    seen_ids: set[str] = set()
    seen_types: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        block_type = as_text(item.get("type"), 16)
        if block_type not in BLOCK_TYPES:
            continue
        if block_type in SINGLETON_BLOCKS:
            if block_type in seen_types:
                continue
            seen_types.add(block_type)

        block_id = as_text(item.get("id"), 32)
        if not _BLOCK_ID_RE.match(block_id) or block_id in seen_ids:
            base = block_type
            block_id, n = base, 1
            while block_id in seen_ids:
                n += 1
                block_id = f"{base}-{n}"
        seen_ids.add(block_id)

        block = {
            "id": block_id,
            "type": block_type,
            "visible": bool(item.get("visible", True)),
        }
        if block_type == "note":
            block["title"] = as_text(item.get("title"), 80)
            block["content"] = as_text(item.get("content"), 2000)
        result.append(block)
        if len(result) >= MAX_BLOCKS:
            break
    return result or default_blocks()


def _all_blocks(blocks: list[dict]) -> list[dict]:
    """补齐所有单例类型（默认隐藏），编辑模式才有「显示」按钮可用。"""
    present = {block["type"] for block in blocks}
    out = [dict(block) for block in blocks]
    for block_type in BLOCK_TYPES:
        if block_type in SINGLETON_BLOCKS and block_type not in present:
            out.append({"id": block_type, "type": block_type, "visible": False})
    return out


def _decorate(blocks: list[dict]) -> list[dict]:
    out = []
    for block in _all_blocks(blocks):
        item = dict(block)
        item["label"] = BLOCK_LABELS.get(block["type"], block["type"])
        item["region"] = region_for(block["type"])
        out.append(item)
    return out


def _owner_worlds(owner: User):
    """主页归属人自己的世界：只算「拥有 + 受邀加入」，不因超管身份扩到全站。"""
    if not owner or not owner.is_authenticated:
        return World.objects.none()
    return (
        World.objects.filter(Q(owner=owner) | Q(memberships__user=owner))
        .distinct()
        .order_by("id")
    )


def _clean_pinned(raw, user) -> list[int]:
    allowed = {world.id for world in _owner_worlds(user)}
    out: list[int] = []
    for item in raw if isinstance(raw, list) else []:
        world_id = as_int(item, 0)
        if world_id and world_id in allowed and world_id not in out:
            out.append(world_id)
        if len(out) >= MAX_PINNED:
            break
    return out


def _get_profile(user: User) -> UserProfile:
    profile, _created = UserProfile.objects.get_or_create(user=user)
    return profile


# --------------------------------------------------------------------------- #
# 读取：世界裁剪、统计、动态
# --------------------------------------------------------------------------- #
def _relative(dt) -> str:
    if not dt:
        return ""
    seconds = (timezone.now() - dt).total_seconds()
    if seconds < 60:
        return "刚刚"
    if seconds < 3600:
        return f"{int(seconds // 60)} 分钟前"
    if seconds < 86400:
        return f"{int(seconds // 3600)} 小时前"
    if seconds < 86400 * 30:
        return f"{int(seconds // 86400)} 天前"
    return f"{dt.year}-{dt.month:02d}-{dt.day:02d}"


def _visible_worlds(owner: User, *, own: bool):
    """主页上能展示的世界：本人看全部，他人只看已发布的公开世界。"""
    worlds = list(_owner_worlds(owner))
    if not own:
        worlds = [
            world for world in worlds
            if world.is_published
            and world.audience == AUDIENCE_PUBLIC
            and world.published_slug
            and not world.is_banned
        ]
    worlds.sort(key=lambda world: world.updated_at or world.created_at, reverse=True)
    return worlds


def _world_card(world, *, own: bool) -> dict:
    published = bool(world.is_published and world.published_slug)
    if own:
        url = permissions.workspace_path(world)
    else:
        url = world.site_url
    return {
        "id": world.id,
        "name": world.name,
        "slug": world.slug,
        "description": (world.description or "").strip(),
        "genres": [item for item in (world.genres or []) if isinstance(item, str)][:6],
        "color": safe_primary_color(world.theme.get("primaryColor")),
        "published": published,
        "site_url": world.site_url,
        "workspace_url": permissions.workspace_path(world),
        "url": url,
        "updated": _relative(world.updated_at),
    }


def _stats(worlds: list[dict], owner: User, *, own: bool) -> dict:
    ids = [world["id"] for world in worlds]
    documents = Document.objects.filter(world_id__in=ids, deleted_at__isnull=True).exclude(
        document_type=DOC_FOLDER,
    )
    if own:
        events = TimelineEvent.objects.filter(
            Q(timeline__world_id__in=ids) | Q(document__world_id__in=ids),
        )
    else:
        documents = documents.filter(is_published=True, hidden=False)
        events = TimelineEvent.objects.filter(
            document__world_id__in=ids,
            document__is_published=True,
            document__hidden=False,
            document__deleted_at__isnull=True,
        )
    return {
        "worlds": len(ids),
        "documents": documents.count(),
        "events": events.count(),
    }


def _activity(worlds: list[dict], *, own: bool) -> list[dict]:
    ids = [world["id"] for world in worlds]
    if not ids:
        return []
    items: list[dict] = []
    documents = Document.objects.filter(world_id__in=ids, deleted_at__isnull=True).exclude(
        document_type=DOC_FOLDER,
    ).select_related("world")
    if own:
        documents = documents.order_by("-updated_at")[:6]
    else:
        documents = documents.filter(
            is_published=True, hidden=False,
        ).exclude(published_slug="").order_by("-updated_at")[:6]

    for document in documents:
        if own:
            url = f"{permissions.workspace_path(document.world)}#doc={document.id}"
        else:
            url = f"/s/{document.world.published_slug}/{document.published_slug}/"
        items.append({
            "text": f"更新了《{document.name}》",
            "sub": document.world.name,
            "url": url,
            "at": document.updated_at,
        })

    times = dict(World.objects.filter(pk__in=ids).values_list("id", "updated_at"))
    for world in worlds[:6]:
        items.append({
            "text": f"发布了《{world['name']}》" if world["published"] and not own else f"整理了《{world['name']}》",
            "sub": "公开站点" if world["published"] and not own else "工作区",
            "url": world["url"],
            "at": times.get(world["id"]) or timezone.now(),
        })

    items.sort(key=lambda item: item["at"], reverse=True)
    out = []
    for item in items[:MAX_ACTIVITY]:
        out.append({
            "text": item["text"],
            "sub": item["sub"],
            "url": item["url"],
            "time": _relative(item["at"]),
        })
    return out


def _genres(worlds: list[dict]) -> list[str]:
    counts: dict[str, int] = {}
    for world in worlds:
        for genre in world["genres"]:
            counts[genre] = counts.get(genre, 0) + 1
    ordered = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return [name for name, _count in ordered[:12]]


def _payload(profile: UserProfile, viewer) -> dict:
    owner = profile.user
    own = bool(
        viewer
        and getattr(viewer, "is_authenticated", False)
        and viewer.pk == owner.pk
    )
    private = not profile.is_public

    worlds = _visible_worlds(owner, own=own)
    cards = [_world_card(world, own=own) for world in worlds]
    by_id = {card["id"]: card for card in cards}
    pinned_ids = [world_id for world_id in (profile.pinned or []) if world_id in by_id]
    pinned = [by_id[world_id] for world_id in pinned_ids]
    for card in pinned:
        card["pinned"] = True

    accent = profile.accent if _ACCENT_RE.match(profile.accent or "") else DEFAULT_ACCENT
    layout = profile.layout if profile.layout in dict(LAYOUTS) else LAYOUT_TWO
    display_name = (profile.display_name or "").strip() or owner.get_full_name() or owner.username

    return {
        "username": owner.username,
        "display_name": profile.display_name,
        "name": display_name,
        "initial": (display_name[:1] or "?").upper(),
        "headline": profile.headline,
        "bio": profile.bio,
        "location": profile.location,
        "website": profile.website,
        "website_url": _clean_url(profile.website),
        "links": profile.links if isinstance(profile.links, list) else [],
        "accent": accent,
        "layout": layout,
        "is_public": profile.is_public,
        "private": private,
        "joined": f"{owner.date_joined.year} 年 {owner.date_joined.month} 月",
        "joined_iso": owner.date_joined.isoformat(),
        "editable": own,
        "stats": _stats(cards, owner, own=own),
        "worlds": cards,
        "pinned_worlds": pinned,
        "pinned_ids": pinned_ids,
        "genres": _genres(cards),
        "activity": _activity(cards, own=own),
        "blocks": _decorate(profile.blocks if isinstance(profile.blocks, list) else []),
        "layout_single": layout == LAYOUT_SINGLE,
    }


# --------------------------------------------------------------------------- #
# 视图
# --------------------------------------------------------------------------- #
@require_safe
def profile_page(request, username):
    """``/u/<username>``：公开个人主页；本人登录后可进入编辑模式。"""
    owner = User.objects.filter(username__iexact=username, is_active=True).first()
    if owner is None:
        raise Http404

    profile = _get_profile(owner)
    viewer = request.user
    own = bool(viewer and viewer.is_authenticated and viewer.pk == owner.pk)
    if not profile.is_public and not own and not permissions.is_privileged(viewer):
        raise Http404

    payload = _payload(profile, viewer)
    blocks = payload["blocks"]
    if not own:
        blocks = [block for block in blocks if block["visible"]]
    if payload["layout_single"]:
        side_blocks, main_blocks = [], blocks
    else:
        side_blocks = [block for block in blocks if block["region"] == "side"]
        main_blocks = [block for block in blocks if block["region"] != "side"]

    return render(request, "profile.html", {
        "profile": payload,
        "side_blocks": side_blocks,
        "main_blocks": main_blocks,
        "viewer_name": viewer.get_full_name() or viewer.username if own else "",
    })


@csrf_exempt
@require_http_methods(["GET", "POST", "PUT"])
def profile_data(request):
    """``/api/world/profile``：GET 读资料与排版；POST/PUT 由本人保存。"""
    if request.method == "GET":
        username = as_text(request.GET.get("username"), 150)
        if username:
            owner = User.objects.filter(username__iexact=username, is_active=True).first()
        elif request.user and request.user.is_authenticated:
            owner = request.user
        else:
            owner = None
        if owner is None:
            return error("未找到该用户", status=404)
        profile = _get_profile(owner)
        own = bool(
            request.user and request.user.is_authenticated and request.user.pk == owner.pk
        )
        if not profile.is_public and not own and not permissions.is_privileged(request.user):
            return error("未找到该用户", status=404)
        return json_response(_payload(profile, request.user))

    if not (request.user and request.user.is_authenticated):
        return error("请先登录", status=401)

    profile = _get_profile(request.user)
    payload = parse_json(request)

    for field, limit in (
        ("display_name", 80),
        ("headline", 120),
        ("location", 80),
    ):
        if field in payload:
            setattr(profile, field, as_text(payload.get(field), limit))
    if "bio" in payload:
        profile.bio = as_text(payload.get("bio"), 4000)
    if "website" in payload:
        profile.website = _clean_url(payload.get("website"))
    if "links" in payload:
        profile.links = _clean_links(payload.get("links"))
    if "accent" in payload:
        accent = as_text(payload.get("accent"), 16)
        if _ACCENT_RE.match(accent):
            profile.accent = accent.lower()
    if "layout" in payload:
        layout = as_text(payload.get("layout"), 8)
        if layout in dict(LAYOUTS):
            profile.layout = layout
    if "blocks" in payload:
        profile.blocks = _clean_blocks(payload.get("blocks"))
    if "pinned" in payload:
        profile.pinned = _clean_pinned(payload.get("pinned"), request.user)
    if "is_public" in payload:
        profile.is_public = bool(payload.get("is_public"))

    profile.save()
    return json_response(_payload(profile, request.user))
