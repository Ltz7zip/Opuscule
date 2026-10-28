"""World data export as a self-contained ZIP (no external services)."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from django.utils import timezone

from apps.cards.models import Card
from apps.collections.models import Collection

from .models import World, WorldConcept


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def build_world_export(world: World) -> bytes:
    """Return a deterministic-ish ZIP with JSON metadata and Markdown cards."""
    collections = list(Collection.objects.filter(world=world).order_by("position_key", "id"))
    cards = list(Card.objects.filter(world=world).select_related("home_collection").order_by("id"))
    markers = list(world.map_markers.select_related("card").order_by("id"))
    background_path = ""
    background_meta = None
    concept = WorldConcept.objects.filter(world=world).first()
    concept_payload = None
    if concept is not None and (concept.body_json or concept.draft_json):
        concept_payload = {
            "draft_json": concept.draft_json or {},
            "draft_text": concept.draft_text,
            "body_json": concept.body_json or {},
            "body_text": concept.body_text,
            "published_at": _iso(concept.published_at),
            "revision": concept.revision,
            "revisions": [
                {
                    "revision": snapshot.revision,
                    "body_json": snapshot.body_json,
                    "body_text": snapshot.body_text,
                    "published_at": _iso(snapshot.published_at),
                }
                for snapshot in concept.revisions.order_by("revision")
            ],
        }
    if world.map_background:
        suffix = Path(world.map_background.name).suffix.lower() or ".png"
        background_path = f"map/background{suffix}"
        background_meta = {"path": background_path, "filename": Path(world.map_background.name).name}

    data = {
        "format": "opuscule-world-export/v1",
        "exported_at": timezone.now().isoformat(),
        "world": {
            "slug": world.slug,
            "name": world.name,
            "kind": world.kind,
            "description": world.description,
            "is_public_read": world.is_public_read,
            "created_at": _iso(world.created_at),
            "updated_at": _iso(world.updated_at),
            "map_background": background_meta,
        },
        "collections": [
            {
                "slug": collection.slug,
                "name": collection.name,
                "parent": collection.parent.slug if collection.parent else None,
                "icon": collection.icon,
                "description": collection.description,
                "is_public": collection.is_public,
            }
            for collection in collections
        ],
        "cards": [
            {
                "slug": card.slug,
                "title": card.title,
                "type_key": card.type_key,
                "kind": card.kind,
                "collection": card.home_collection.slug if card.home_collection else None,
                "is_public": card.is_public,
                "is_auxiliary": card.is_auxiliary,
                "revision": card.revision,
                "body_text": card.body_text,
                "body_json": card.body_json,
                "created_at": _iso(card.created_at),
                "updated_at": _iso(card.updated_at),
            }
            for card in cards
        ],
        "concept": concept_payload,
        "map_markers": [
            {
                "label": marker.label,
                "kind": marker.kind,
                "x": marker.x,
                "y": marker.y,
                "card": marker.card.slug if marker.card else None,
            }
            for marker in markers
        ],
    }

    readme = (
        f"# {world.name}\n\n"
        f"{world.description or '（没有简介。）'}\n\n"
        f"- slug: `{world.slug}`\n"
        f"- 集合: {len(collections)}\n"
        f"- 卡片: {len(cards)}\n"
        f"- 地图标记: {len(markers)}\n"
        f"- 世界概念: {'有' if concept_payload else '无'}\n\n"
        "`world.json` 保留结构化数据；`concept.md` 与 `wiki/*.md` 是纯文本可读副本。\n"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.md", readme)
        archive.writestr("world.json", json.dumps(data, ensure_ascii=False, indent=2))
        if background_path:
            with world.map_background.open("rb") as background:
                archive.writestr(background_path, background.read())
        if concept_payload:
            body = (concept_payload["body_text"] or concept_payload["draft_text"]).strip()
            archive.writestr(
                "concept.md",
                "# 世界概念\n\n"
                f"- revision: {concept_payload['revision']}\n"
                f"- published_at: {concept_payload['published_at'] or '未发布'}\n"
                f"- 历史版本: {len(concept_payload['revisions'])}\n\n"
                f"{body or '（还没有正文。）'}\n",
            )
        for card in cards:
            body = card.body_text.strip() or "（这张卡片还没有正文。）"
            archive.writestr(
                f"wiki/{card.slug}.md",
                f"# {card.title}\n\n"
                f"- type: `{card.type_key or 'content'}`\n"
                f"- revision: {card.revision}\n\n"
                f"{body}\n",
            )
    return buffer.getvalue()
