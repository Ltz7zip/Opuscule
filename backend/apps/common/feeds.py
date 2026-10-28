"""Small RSS 2.0 feeds for public cards and world concepts."""

from __future__ import annotations

from xml.sax.saxutils import escape

from django.http import Http404, HttpResponse
from django.utils import timezone

from apps.cards.models import Card
from apps.worlds.models import World, WorldConcept


def _rfc822(value) -> str:
    return value.astimezone(timezone.UTC).strftime("%a, %d %b %Y %H:%M:%S +0000")


def _base(request) -> str:
    return request.build_absolute_uri("/").rstrip("/")


def _card_items(cards, base: str) -> list[dict]:
    return [
        {
            "title": card.title,
            "link": f"{base}/w/{card.world.slug}/wiki/{card.slug}",
            "guid": f"opuscule:card:{card.id}",
            "description": card.body_text[:600],
            "category": card.type_key or "card",
            "pub_date": _rfc822(card.updated_at),
            "sort_key": card.updated_at,
        }
        for card in cards
    ]


def _concept_items(concepts, base: str) -> list[dict]:
    return [
        {
            "title": f"{concept.world.name} · 世界概念",
            "link": f"{base}/w/{concept.world.slug}/wiki",
            "guid": f"opuscule:concept:{concept.id}",
            "description": concept.body_text[:600],
            "category": "concept",
            "pub_date": _rfc822(concept.published_at),
            "sort_key": concept.published_at,
        }
        for concept in concepts
    ]


def _rss(*, title: str, link: str, description: str, items) -> HttpResponse:
    ordered = sorted(items, key=lambda item: item["sort_key"], reverse=True)[:50]
    rendered = []
    for item in ordered:
        rendered.append(
            "<item>"
            f"<title>{escape(item['title'])}</title>"
            f"<link>{escape(item['link'])}</link>"
            f"<guid isPermaLink=\"false\">{escape(item['guid'])}</guid>"
            f"<description>{escape(item['description'])}</description>"
            f"<category>{escape(item['category'])}</category>"
            f"<pubDate>{item['pub_date']}</pubDate>"
            "</item>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        f"<title>{escape(title)}</title>"
        f"<link>{escape(link)}</link>"
        f"<description>{escape(description)}</description>"
        "<language>zh-CN</language>"
        f"{''.join(rendered)}"
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
    concepts = (
        WorldConcept.objects.filter(
            published_at__isnull=False,
            world__is_public_read=True,
            world__deleted_at__isnull=True,
        )
        .select_related("world")
        .order_by("-published_at")[:50]
    )
    base = _base(request)
    return _rss(
        title="Opuscule · 公开 Wiki",
        link=f"{base}/",
        description="公开世界的最近更新卡片与世界概念。",
        items=_card_items(cards, base) + _concept_items(concepts, base),
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
    concepts = WorldConcept.objects.filter(
        world=world,
        published_at__isnull=False,
    ).select_related("world")
    base = _base(request)
    return _rss(
        title=f"{world.name} · Opuscule",
        link=f"{base}/w/{world.slug}/wiki",
        description=world.description or f"{world.name} 的公开 Wiki 更新。",
        items=_card_items(cards, base) + _concept_items(concepts, base),
    )
