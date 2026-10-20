from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.cards.models import Card
from apps.collections.models import Collection

from .models import World, WorldMembership


def _unique_slug(name: str) -> str:
    base = slugify(name, allow_unicode=False)[:60] or "world"
    candidate = base
    suffix = 1
    while World.all_objects.filter(slug=candidate).exists():
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


def _overview_body(name: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": name}],
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "这是新世界的入口卡片。从这里开始写第一条设定，或者先整理 Collection。",
                    }
                ],
            },
        ],
    }


@transaction.atomic
def create_world(*, owner, name: str, description: str = "", is_public_read: bool = False) -> World:
    world = World.objects.create(
        slug=_unique_slug(name),
        name=name,
        description=description,
        kind=World.Kind.PRIVATE,
        is_public_read=is_public_read,
        published_at=timezone.now() if is_public_read else None,
    )
    WorldMembership.objects.create(
        world=world,
        user=owner,
        role=WorldMembership.Role.OWNER,
    )

    for position, (label, slug, icon) in enumerate(
        [
            ("人物", "characters", "user"),
            ("地点", "places", "map-pin"),
            ("事件", "events", "calendar"),
        ],
        start=1,
    ):
        Collection.objects.create(
            world=world,
            name=label,
            slug=slug,
            icon=icon,
            position_key=f"a{position:03d}",
        )

    Card.objects.create(
        world=world,
        home_collection=None,
        type_key="note",
        title="世界概览",
        slug="world-overview",
        body_json=_overview_body(name),
        is_public=True,
    )
    return world
