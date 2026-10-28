"""Dump or load one world's authored content as JSON.

This is the content-deployment tool for a single world: it moves the world
concept, cards, collections, timelines, eras and map markers between a local
database and a server without touching users, memberships, comments, invites,
audit history or uploaded media.

    manage.py world_snapshot --slug wuhai --out wuhai.json
    manage.py world_snapshot --slug wuhai --in wuhai.json

Loading matches rows by natural keys (card slug, timeline slug, era name,
marker label, concept revision), updates them in place, and preserves the
primary keys — so comments attached to the concept survive a content sync.
Use ``--prune`` to delete cards and timeline entries that the snapshot does
not contain (off by default: a server may hold content the local copy lacks).
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.cards.models import Card, plain_text
from apps.collections.models import Collection
from apps.maps.models import MapMarker
from apps.timelines.models import Era, Timeline, TimelineEntry
from apps.worlds.models import World, WorldConcept, WorldConceptRevision

FORMAT = "opuscule-world-snapshot/v1"


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _aware(value):
    parsed = parse_datetime(str(value)) if value else None
    if parsed is not None and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.UTC)
    return parsed


def dump_world(world: World) -> dict:
    concept = WorldConcept.objects.filter(world=world).first()
    timelines = list(world.timelines.order_by("id"))
    return {
        "format": FORMAT,
        "dumped_at": timezone.now().isoformat(),
        "world": {
            "slug": world.slug,
            "name": world.name,
            "kind": world.kind,
            "description": world.description,
            "is_public_read": world.is_public_read,
        },
        "collections": [
            {
                "slug": collection.slug,
                "name": collection.name,
                "parent": collection.parent.slug if collection.parent else None,
                "icon": collection.icon,
                "description": collection.description,
                "is_public": collection.is_public,
                "position_key": collection.position_key,
            }
            for collection in world.collections.order_by("position_key", "id")
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
                "body_json": card.body_json,
            }
            for card in world.cards.order_by("id")
        ],
        "concept": None
        if concept is None
        else {
            "draft_json": concept.draft_json or {},
            "body_json": concept.body_json or {},
            "published_at": _iso(concept.published_at),
            "revision": concept.revision,
            "revisions": [
                {
                    "revision": snapshot.revision,
                    "body_json": snapshot.body_json,
                    "published_at": _iso(snapshot.published_at),
                }
                for snapshot in concept.revisions.order_by("revision")
            ],
        },
        "timelines": [
            {
                "slug": timeline.slug,
                "name": timeline.name,
                "color": timeline.color,
                "is_default": timeline.is_default,
                "entries": [
                    {
                        "year": entry.year,
                        "month": entry.month,
                        "end_year": entry.end_year,
                        "era": entry.era,
                        "title": entry.title,
                        "description": entry.description,
                        "card": entry.card.slug if entry.card else None,
                    }
                    for entry in world.timeline_entries.filter(timeline=timeline).order_by("year", "id")
                ],
            }
            for timeline in timelines
        ],
        "eras": [
            {
                "name": era.name,
                "start_year": era.start_year,
                "end_year": era.end_year,
                "color": era.color,
            }
            for era in world.eras.order_by("start_year", "id")
        ],
        "markers": [
            {
                "label": marker.label,
                "kind": marker.kind,
                "x": marker.x,
                "y": marker.y,
                "card": marker.card.slug if marker.card else None,
            }
            for marker in world.map_markers.order_by("id")
        ],
    }


def _owner(world: World, username: str | None):
    memberships = world.memberships.select_related("user").order_by("id")
    if username:
        membership = memberships.filter(user__username=username).first()
        if membership is None:
            raise CommandError(f"{username} 不是 {world.slug} 的成员")
        return membership.user
    membership = memberships.first()
    return membership.user if membership else None


def _upsert_collections(world: World, rows: list[dict]) -> dict[str, Collection]:
    collections: dict[str, Collection] = {}
    parents: list[tuple[Collection, str]] = []
    for row in rows:
        collection, _ = Collection.objects.update_or_create(
            world=world,
            slug=row["slug"],
            defaults={
                "name": row["name"],
                "icon": row.get("icon", ""),
                "description": row.get("description", ""),
                "is_public": row.get("is_public", True),
                "position_key": row.get("position_key", "m"),
            },
        )
        collections[row["slug"]] = collection
        if row.get("parent"):
            parents.append((collection, row["parent"]))
    for collection, parent_slug in parents:
        parent = collections.get(parent_slug)
        if parent is None:
            raise CommandError(f"collection {collection.slug} 的 parent 不存在: {parent_slug}")
        collection.parent = parent
        collection.save(update_fields=["parent"])
    return collections


def _upsert_cards(world: World, rows: list[dict], collections, user, prune: bool) -> dict[str, Card]:
    cards: dict[str, Card] = {}
    for row in rows:
        body_json = row.get("body_json") or {}
        card, _ = Card.objects.update_or_create(
            world=world,
            slug=row["slug"],
            defaults={
                "title": row["title"],
                "type_key": row.get("type_key", ""),
                "kind": row.get("kind", Card.Kind.CONTENT),
                "home_collection": collections.get(row.get("collection") or ""),
                "is_public": row.get("is_public", True),
                "is_auxiliary": row.get("is_auxiliary", False),
                "body_json": body_json,
                "body_text": plain_text(body_json),
            },
        )
        cards[row["slug"]] = card
    if prune:
        extra = world.cards.exclude(slug__in=list(cards))
        extra.delete()
    return cards


def _upsert_concept(world: World, payload: dict | None, user):
    if not payload:
        return
    draft_json = payload.get("draft_json") or {}
    body_json = payload.get("body_json") or {}
    concept, _ = WorldConcept.objects.update_or_create(
        world=world,
        defaults={
            "draft_json": draft_json,
            "draft_text": plain_text(draft_json),
            "body_json": body_json,
            "body_text": plain_text(body_json),
            "published_at": _aware(payload.get("published_at")),
            "revision": int(payload.get("revision") or 0),
            "updated_by": user,
        },
    )
    if concept.created_by_id is None:
        concept.created_by = user
        concept.save(update_fields=["created_by"])
    for snapshot in payload.get("revisions") or []:
        published_at = _aware(snapshot.get("published_at"))
        if published_at is None:
            continue
        snapshot_json = snapshot.get("body_json") or {}
        WorldConceptRevision.objects.update_or_create(
            concept=concept,
            revision=int(snapshot["revision"]),
            defaults={
                "body_json": snapshot_json,
                "body_text": plain_text(snapshot_json),
                "published_at": published_at,
                "created_by": user,
            },
        )


def _upsert_timelines(world: World, rows: list[dict], cards, user, prune: bool) -> None:
    seen_entries: list[int] = []
    for row in rows:
        timeline, _ = Timeline.objects.update_or_create(
            world=world,
            slug=row["slug"],
            defaults={
                "name": row["name"],
                "color": row.get("color", "blue"),
                "is_default": row.get("is_default", False),
            },
        )
        for entry_row in row.get("entries") or []:
            entry, _ = TimelineEntry.objects.update_or_create(
                world=world,
                timeline=timeline,
                year=entry_row["year"],
                month=entry_row.get("month"),
                end_year=entry_row.get("end_year"),
                title=entry_row["title"],
                defaults={
                    "era": entry_row.get("era", ""),
                    "description": entry_row.get("description", ""),
                    "card": cards.get(entry_row.get("card") or ""),
                    "created_by": user,
                },
            )
            seen_entries.append(entry.id)
    if prune:
        world.timeline_entries.exclude(id__in=seen_entries).delete()


def _upsert_eras(world: World, rows: list[dict]) -> None:
    for row in rows:
        Era.objects.update_or_create(
            world=world,
            name=row["name"],
            defaults={
                "start_year": row["start_year"],
                "end_year": row["end_year"],
                "color": row.get("color", "blue"),
            },
        )


def _upsert_markers(world: World, rows: list[dict], cards, user) -> None:
    for row in rows:
        MapMarker.objects.update_or_create(
            world=world,
            label=row["label"],
            defaults={
                "kind": row.get("kind", MapMarker.Kind.PLACE),
                "x": row["x"],
                "y": row["y"],
                "card": cards.get(row.get("card") or ""),
                "created_by": user,
            },
        )


class Command(BaseCommand):
    help = "按 slug 导出/载入一个世界的正文内容（概念、卡片、时间线、纪元、地图标记）。"

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True, help="世界 slug")
        parser.add_argument("--out", help="导出到 JSON 文件")
        parser.add_argument("--in", dest="source", help="从 JSON 文件载入")
        parser.add_argument("--user", help="创建行时使用的用户名（默认世界 owner）")
        parser.add_argument("--prune", action="store_true", help="删除快照里没有的卡片与时间线条目")

    def handle(self, *args, **options):
        slug = options["slug"]
        out = options.get("out")
        source = options.get("source")
        if bool(out) == bool(source):
            raise CommandError("请二选一：--out 或 --in")

        if out:
            world = World.objects.filter(slug=slug).first()
            if world is None:
                raise CommandError(f"没有世界 {slug}")
            payload = dump_world(world)
            with open(out, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
            self.stdout.write(
                self.style.SUCCESS(
                    f"{slug}: {len(payload['cards'])} 卡片, {len(payload['collections'])} 集合, "
                    f"{len(payload['timelines'])} 时间线, {len(payload['markers'])} 标记 -> {out}"
                )
            )
            return

        with open(source, encoding="utf-8") as handle:
            payload = json.load(handle)
        if payload.get("format") != FORMAT:
            raise CommandError("快照格式不受支持")
        world_data = payload["world"]
        with transaction.atomic():
            world, created = World.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": world_data["name"],
                    "kind": world_data.get("kind", World.Kind.PRIVATE),
                    "description": world_data.get("description", ""),
                    "is_public_read": world_data.get("is_public_read", False),
                },
            )
            if not created:
                world.name = world_data["name"]
                world.kind = world_data.get("kind", world.kind)
                world.description = world_data.get("description", "")
                world.is_public_read = world_data.get("is_public_read", world.is_public_read)
                world.save(update_fields=["name", "kind", "description", "is_public_read", "updated_at"])

            user = _owner(world, options.get("user"))
            collections = _upsert_collections(world, payload.get("collections") or [])
            cards = _upsert_cards(
                world, payload.get("cards") or [], collections, user, options["prune"]
            )
            _upsert_concept(world, payload.get("concept"), user)
            _upsert_timelines(world, payload.get("timelines") or [], cards, user, options["prune"])
            _upsert_eras(world, payload.get("eras") or [])
            _upsert_markers(world, payload.get("markers") or [], cards, user)

        concept = WorldConcept.objects.filter(world=world).first()
        self.stdout.write(
            self.style.SUCCESS(
                f"{world.slug}: {world.cards.count()} 卡片, "
                f"{world.timeline_entries.count()} 时间线条目, "
                f"概念第 {getattr(concept, 'revision', 0)} 版"
            )
        )
