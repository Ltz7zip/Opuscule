"""Read-only reference checks for the shared world media library."""

from __future__ import annotations

import json

from apps.cards.models import Card

from .models import WorldConcept, WorldMedia


def _payload_contains(payload, needle: str) -> bool:
    if not payload:
        return False
    try:
        encoded = json.dumps(payload, ensure_ascii=False, default=str)
    except TypeError:
        encoded = str(payload)
    return needle in encoded


def media_references(world, media: WorldMedia) -> list[dict]:
    """Return content references that would break if media were removed.

    The check is intentionally conservative: drafts count, and card
    covers/icons count. A false positive costs one rejected delete; a false
    negative breaks a published page.
    """

    try:
        needle = media.file.url
    except (ValueError, AttributeError):
        return []
    if not needle:
        return []

    references: list[dict] = []
    cards = Card.objects.filter(world=world).only(
        "id", "title", "slug", "cover", "icon", "body_json"
    )
    for card in cards:
        if card.cover and needle in card.cover:
            references.append({"kind": "card", "id": card.id, "title": card.title, "field": "cover"})
        if card.icon and needle in card.icon:
            references.append({"kind": "card", "id": card.id, "title": card.title, "field": "icon"})
        if _payload_contains(card.body_json, needle):
            references.append({"kind": "card", "id": card.id, "title": card.title, "field": "body"})

    concepts = WorldConcept.objects.filter(world=world).only("id", "body_json", "draft_json")
    for concept in concepts:
        if _payload_contains(concept.body_json, needle):
            references.append(
                {"kind": "concept", "id": concept.id, "title": "世界概念", "field": "published"}
            )
        if _payload_contains(concept.draft_json, needle):
            references.append(
                {"kind": "concept", "id": concept.id, "title": "世界概念", "field": "draft"}
            )

    return references
