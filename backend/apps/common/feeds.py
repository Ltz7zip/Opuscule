"""Small RSS 2.0 feeds for public cards (server-rendered XML)."""

from __future__ import annotations

from xml.sax.saxutils import escape

from django.http import Http404, HttpResponse
from django.utils import timezone

from apps.cards.models import Card
from apps.worlds.models import World


def _rss(*, title: str, link: str, description: str, cards) -> HttpResponse:
    items = []
    for card in cards:
        body = escape(card.body_text[:600])
        pub_date = card.updated_at.astimezone(timezone.UTC).strftime("%a, %d %b %Y %H:%M:%S +0000")
        items.append(
            "<item>"
            f"<title>{escape(card.title)}</title>"
            f"<link>{escape(link)}/w/{card.world.slug}/wiki/{card.slug}</link>"
            f"<guid isPermaLink=\"false\">opuscule:card:{card.id}</guid>"
            f"<description>{body}</description>"
            f"<category>{escape(card.type_key or 'card')}</category>"
            f"<pubDate>{pub_date}</pubDate>"
            "</item>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        f"<title>{escape(title)}</title>"
        f"<link>{escape(link)}</link>"
        f"<description>{escape(description)}</description>"
        "<language>zh-CN</language>"
        f"{''.join(items)}"
        "</channel></rss>"
    )
    response = HttpResponse(xml, content_type="application/rss+xml; charset=utf-8")
    response["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return response


def site_feed(request):
    cards = (
        Card.objects.filter(
            is_public=True,
            is_auxiliary=False,
            world__is_public_read=True,
            world__deleted_at__isnull=True,
        )
        .select_related("world")
        .order_by("-updated_at", "-id")[:50]
    )
    return _rss(
        title="Opuscule · 公开 Wiki",
        link=request.build_absolute_uri("/"),
        description="公开世界的最近更新卡片。",
        cards=cards,
    )


def world_feed(request, world_slug: str):
    world = World.objects.filter(slug=world_slug, is_public_read=True).first()
    if world is None:
        raise Http404("World not found")
    cards = (
        Card.objects.filter(world=world, is_public=True, is_auxiliary=False)
        .select_related("world")
        .order_by("-updated_at", "-id")[:50]
    )
    return _rss(
        title=f"{world.name} · Opuscule",
        link=request.build_absolute_uri(f"/w/{world.slug}/wiki"),
        description=world.description or f"{world.name} 的公开 Wiki 更新。",
        cards=cards,
    )
