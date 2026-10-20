from django.http import Http404
from django.shortcuts import render

from apps.cards.models import Card
from apps.identity.models import UserProfile
from apps.worlds.models import World


def _share_response(request, template: str, context: dict):
    response = render(request, template, context)
    response["Cache-Control"] = "public, max-age=60"
    return response


def _public_world(world_slug: str) -> World:
    world = World.objects.filter(slug=world_slug, is_public_read=True).first()
    if world is None:
        raise Http404("World not found")
    return world


def world_share(request, world_slug: str):
    world = _public_world(world_slug)
    cards = (
        Card.objects.filter(world=world, is_public=True, is_auxiliary=False)
        .order_by("id")[:40]
    )
    canonical = request.build_absolute_uri(f"/w/{world.slug}/wiki")
    return _share_response(
        request,
        "share/world.html",
        {
            "world": world,
            "cards": cards,
            "canonical_url": canonical,
            "meta_title": f"{world.name} · Opuscule",
            "meta_description": world.description or f"{world.name} 的公开世界 Wiki。",
        },
    )


def card_share(request, world_slug: str, card_slug: str):
    world = _public_world(world_slug)
    card = Card.objects.filter(
        world=world, slug=card_slug, is_public=True, is_auxiliary=False
    ).first()
    if card is None:
        raise Http404("Card not found")
    canonical = request.build_absolute_uri(f"/w/{world.slug}/wiki/{card.slug}")
    description = " ".join(card.body_text.split())[:180] or world.description
    return _share_response(
        request,
        "share/card.html",
        {
            "world": world,
            "card": card,
            "canonical_url": canonical,
            "meta_title": f"{card.title} · {world.name}",
            "meta_description": description or f"{card.title} 的公开 Wiki 卡片。",
        },
    )


def profile_share(request, username: str):
    profile = (
        UserProfile.objects.filter(
            user__username=username,
            user__is_active=True,
            is_public=True,
        )
        .select_related("user")
        .first()
    )
    if profile is None:
        raise Http404("Profile not found")
    canonical = request.build_absolute_uri(f"/u/{profile.user.username}")
    return _share_response(
        request,
        "share/profile.html",
        {
            "profile": profile,
            "canonical_url": canonical,
            "meta_title": f"{profile.name} · Opuscule",
            "meta_description": profile.bio[:180] or profile.headline or f"{profile.name} 的 Opuscule 主页。",
        },
    )
