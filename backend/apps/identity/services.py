from django.db.models import Count, Q

from apps.cards.models import Card
from apps.worlds.models import World, WorldMembership

from .models import UserProfile
from .serializers import UserProfileSerializer


def profile_for(user) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def _visible_worlds(owner, viewer) -> list[World]:
    is_owner = bool(
        getattr(viewer, "is_authenticated", False)
        and (viewer.pk == owner.pk or getattr(viewer, "is_staff", False))
    )
    qs = (
        World.objects.filter(memberships__user=owner)
        .annotate(
            public_card_count=Count(
                "cards",
                filter=Q(cards__is_public=True, cards__is_auxiliary=False),
            )
        )
        .distinct()
        .order_by("-updated_at", "id")
    )
    if not is_owner:
        qs = qs.filter(is_public_read=True)
    return list(qs)


def _world_payload(world: World) -> dict:
    return {
        "id": world.id,
        "slug": world.slug,
        "name": world.name,
        "kind": world.kind,
        "card_count": getattr(world, "public_card_count", 0),
    }


def profile_payload(profile: UserProfile, viewer) -> dict:
    owner = profile.user
    is_owner = bool(
        getattr(viewer, "is_authenticated", False)
        and (viewer.pk == owner.pk or getattr(viewer, "is_staff", False))
    )
    worlds = _visible_worlds(owner, viewer)
    world_ids = [world.id for world in worlds]
    world_by_id = {world.id: world for world in worlds}

    pinned_ids: list[int] = []
    for item in profile.pinned if isinstance(profile.pinned, list) else []:
        try:
            world_id = int(item)
        except (TypeError, ValueError):
            continue
        if world_id in world_by_id and world_id not in pinned_ids:
            pinned_ids.append(world_id)

    cards = (
        Card.objects.filter(
            world_id__in=world_ids,
            is_public=True,
            is_auxiliary=False,
        )
        .select_related("world", "home_collection")
        .order_by("-updated_at", "-id")[:6]
    )
    recent_cards = [
        {
            "id": card.id,
            "title": card.title,
            "slug": card.slug,
            "type_key": card.type_key,
            "excerpt": card.body_text[:160],
            "world_slug": card.world.slug,
            "world_name": card.world.name,
        }
        for card in cards
    ]

    data = UserProfileSerializer(profile).data
    data.update(
        {
            "is_owner": is_owner,
            # Never send private world ids that the viewer cannot see.
            "pinned": pinned_ids,
            "pinned_worlds": [
                _world_payload(world_by_id[world_id]) for world_id in pinned_ids
            ],
            "worlds": [_world_payload(world) for world in worlds],
            "recent_cards": recent_cards,
            "stats": {
                "worlds": len(worlds),
                "cards": sum(world.public_card_count for world in worlds),
            },
        }
    )
    return data
