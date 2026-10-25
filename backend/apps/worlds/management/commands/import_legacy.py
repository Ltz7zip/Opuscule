"""Import content from the previous-generation Opuscule SQLite database.

The two generations share their models' *meaning*, not their tables
(`world_document` → `cards_card`, …), so this command reads the old file
read-only and writes through the new ORM.  Columns are discovered at runtime,
which keeps it working across the old schema's minor revisions.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.cards.models import Card, plain_text
from apps.maps.models import MapMarker
from apps.timelines.models import Era, Timeline, TimelineEntry
from apps.worlds.models import World, WorldMembership

CARD_TYPES = {"card", "document", "page", "folder"}
MARKER_KINDS = {"place", "city", "event", "character", "note"}


@dataclass
class Report:
    created: dict[str, int] = field(default_factory=dict)
    skipped: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def bump(self, bucket: str, key: str, amount: int = 1) -> None:
        bucket_map = self.created if bucket == "created" else self.skipped
        bucket_map[key] = bucket_map.get(key, 0) + amount


def _json(value, fallback):
    if value in (None, "", b""):
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if isinstance(parsed, type(fallback)) else fallback


def _dt(value):
    """Old rows store naive local datetimes; the new settings run with USE_TZ."""
    if not value:
        return None
    if isinstance(value, (int, float)):
        return timezone.make_aware(
            timezone.datetime.fromtimestamp(value), timezone.get_default_timezone()
        )
    parsed = parse_datetime(str(value).replace("Z", "+00:00"))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_default_timezone())
    return parsed


class LegacyReader:
    """Read-only view of the old database with tolerant column access."""

    def __init__(self, path: Path):
        self.conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        self.conn.row_factory = sqlite3.Row
        self._columns: dict[str, set[str]] = {}

    def has_table(self, name: str) -> bool:
        row = self.conn.execute(
            "select 1 from sqlite_master where type='table' and name=?", (name,)
        ).fetchone()
        return row is not None

    def columns(self, table: str) -> set[str]:
        if table not in self._columns:
            try:
                self._columns[table] = {
                    row[1] for row in self.conn.execute(f'pragma table_info("{table}")')
                }
            except sqlite3.Error:
                self._columns[table] = set()
        return self._columns[table]

    def rows(self, table: str):
        if not self.has_table(table):
            return []
        return self.conn.execute(f'select * from "{table}"').fetchall()

    @staticmethod
    def pick(row, *names, default=None):
        for name in names:
            if name in row.keys() and row[name] not in (None, ""):
                return row[name]
        return default


class Command(BaseCommand):
    help = "从旧版 Opuscule 的 SQLite 库导入世界/卡片/地图/时间线（旧库只读）"

    def add_arguments(self, parser):
        parser.add_argument("--db", required=True, help="旧库路径")
        parser.add_argument("--dry-run", action="store_true", help="只报告，不写数据库")
        parser.add_argument("--worlds", default="", help="只导入这些 slug，逗号分隔")
        parser.add_argument(
            "--reset",
            action="store_true",
            help="先删除现有的世界/卡片/标记/时间线（用户保留），适合重跑修正过的导入",
        )

    def handle(self, *args, **options):
        path = Path(options["db"]).expanduser()
        if not path.is_file():
            raise CommandError(f"旧库不存在：{path}")
        reader = LegacyReader(path)
        only = {slug.strip() for slug in options["worlds"].split(",") if slug.strip()}
        dry = options["dry_run"]
        report = Report()

        with transaction.atomic():
            if options["reset"] and not dry:
                self._reset(report)
            users = self._users(reader, report)
            worlds = self._worlds(reader, report, users, only)
            self._memberships(reader, report, worlds, users)
            cards = self._cards(reader, report, worlds)
            self._markers(reader, report, worlds, cards)
            self._timelines(reader, report, worlds)
            self._eras(reader, report, worlds)
            if dry:
                transaction.set_rollback(True)

        prefix = "[dry-run] " if dry else ""
        if options["reset"] and not dry:
            prefix = "[reset] "
        self.stdout.write(self.style.SUCCESS(f"{prefix}导入结果"))
        for key, count in sorted(report.created.items()):
            self.stdout.write(f"  新建 {key:16s} {count}")
        for key, count in sorted(report.skipped.items()):
            self.stdout.write(f"  跳过 {key:16s} {count}")
        for warning in report.warnings:
            self.stdout.write(self.style.WARNING(f"  ! {warning}"))

    def _reset(self, report: Report) -> None:
        """Delete imported content (users are kept) so a corrected run is clean."""
        from apps.collections.models import Collection

        steps = [
            ("地图标记", MapMarker.objects.all()),
            ("时间线条目", TimelineEntry.objects.all()),
            ("卡片", Card.all_objects.all()),
            ("时间线", Timeline.objects.all()),
            ("纪元", Era.objects.all()),
            ("集合", Collection.objects.all()),
            ("世界", World.all_objects.all()),
        ]
        for label, queryset in steps:
            count = queryset.count()
            queryset.delete()
            if count:
                report.bump("skipped", f"{label}（重置）", count)

    # ---------------------------------------------------------------- users
    def _users(self, reader: LegacyReader, report: Report) -> dict[int, object]:
        model = get_user_model()
        mapping: dict[int, object] = {}
        for row in reader.rows("auth_user"):
            username = reader.pick(row, "username")
            if not username:
                continue
            existing = model.objects.filter(username=username).first()
            if existing:
                mapping[row["id"]] = existing
                report.bump("skipped", "用户（已存在）")
                continue
            user = model(
                username=username,
                email=reader.pick(row, "email", default="") or "",
                first_name=reader.pick(row, "first_name", default="") or "",
                last_name=reader.pick(row, "last_name", default="") or "",
                is_staff=bool(reader.pick(row, "is_staff", default=False)),
                is_superuser=bool(reader.pick(row, "is_superuser", default=False)),
                is_active=bool(reader.pick(row, "is_active", default=True)),
            )
            user.password = reader.pick(row, "password", default="!") or "!"
            joined = _dt(reader.pick(row, "date_joined"))
            if joined:
                user.date_joined = joined
            user.save()
            mapping[row["id"]] = user
            report.bump("created", "用户")
        return mapping

    # --------------------------------------------------------------- worlds
    def _worlds(self, reader, report, users, only) -> dict[int, World]:
        mapping: dict[int, World] = {}
        for row in reader.rows("world_world"):
            raw_slug = (reader.pick(row, "slug") or "").strip()
            published = (reader.pick(row, "published_slug") or "").strip()
            # Old worlds used a 6-hex internal slug; the public address lived in
            # published_slug. Prefer the readable one when present.
            slug = published or raw_slug
            if not slug or (only and slug not in only and raw_slug not in only):
                continue
            if World.all_objects.filter(slug=slug).exists():
                world = World.all_objects.get(slug=slug)
                mapping[row["id"]] = world
                report.bump("skipped", "世界（已存在）")
                continue
            audience = (reader.pick(row, "audience") or "").lower()
            published = bool(reader.pick(row, "is_published", default=False))
            world = World.objects.create(
                slug=slug,
                name=(reader.pick(row, "name") or slug)[:160],
                description=reader.pick(row, "description", default="") or "",
                kind=World.Kind.SHARED if published else World.Kind.PRIVATE,
                is_public_read=published or audience == "public",
                theme_json=_json(reader.pick(row, "theme_config", "theme_json"), {}),
                published_at=_dt(reader.pick(row, "published_at")),
            )
            owner_id = reader.pick(row, "owner_id")
            owner = users.get(owner_id) if owner_id else None
            if owner:
                WorldMembership.objects.create(
                    world=world, user=owner, role=WorldMembership.Role.OWNER
                )
            mapping[row["id"]] = world
            report.bump("created", "世界")
        return mapping

    def _memberships(self, reader, report, worlds, users) -> None:
        if reader.has_table("world_membership"):
            existing = set(
                WorldMembership.objects.values_list("world_id", "user_id")
            )
            for row in reader.rows("world_membership"):
                world = worlds.get(reader.pick(row, "world_id"))
                user = users.get(reader.pick(row, "user_id"))
                if not world or not user or (world.id, user.id) in existing:
                    continue
                role = str(reader.pick(row, "role", default="editor")).lower()
                role = role if role in {"owner", "editor", "viewer"} else "editor"
                WorldMembership.objects.create(world=world, user=user, role=role)
                existing.add((world.id, user.id))
                report.bump("created", "成员")
        else:
            report.bump("skipped", "成员（旧表缺失）")

    # ---------------------------------------------------------------- cards
    def _cards(self, reader, report, worlds) -> dict[int, Card]:
        """`world_document` carries the tree, `world_card` the body."""
        bodies: dict[int, dict] = {}
        if reader.has_table("world_card"):
            cols = reader.columns("world_card")
            for row in reader.rows("world_card"):
                doc_id = reader.pick(row, "document_id", "doc_id")
                if doc_id is None:
                    continue
                body = None
                for key in ("blocks", "body_json", "doc", "content", "body"):
                    if key in cols and row[key]:
                        body = _json(row[key], {})
                        if body:
                            break
                bodies[doc_id] = body or {}

        mapping: dict[int, Card] = {}
        for row in reader.rows("world_document"):
            doc_type = (reader.pick(row, "document_type", default="card") or "card").lower()
            if doc_type not in CARD_TYPES:
                report.bump("skipped", f"文档类型:{doc_type}")
                continue
            world = worlds.get(reader.pick(row, "world_id"))
            if not world:
                report.bump("skipped", "卡片（世界未导入）")
                continue
            title = (reader.pick(row, "name", "title") or "未命名")[:240]
            slug = (reader.pick(row, "slug") or "").strip()[:120]
            if not slug:
                slug = f"card-{row['id']}"
            if Card.all_objects.filter(world=world, slug=slug).exists():
                mapping[row["id"]] = Card.all_objects.get(world=world, slug=slug)
                report.bump("skipped", "卡片（已存在）")
                continue
            body = bodies.get(row["id"], {})
            card = Card.objects.create(
                world=world,
                title=title,
                slug=slug,
                icon=(reader.pick(row, "icon", default="") or "")[:16],
                cover=(reader.pick(row, "cover", default="") or "")[:500],
                body_json=body,
                body_text=plain_text(body),
                is_public=bool(reader.pick(row, "is_published", default=True)),
                pinned=bool(reader.pick(row, "pinned", default=False)),
            )
            mapping[row["id"]] = card
            report.bump("created", "卡片")
        return mapping

    # -------------------------------------------------------------- markers
    def _markers(self, reader, report, worlds, cards) -> None:
        if not reader.has_table("world_mapmarker"):
            report.bump("skipped", "地图标记（旧表缺失）")
            return
        doc_world = {
            row["id"]: row["world_id"]
            for row in reader.rows("world_document")
            if "world_id" in row.keys()
        }
        for row in reader.rows("world_mapmarker"):
            doc_id = reader.pick(row, "document_id")
            world = worlds.get(doc_world.get(doc_id)) if doc_id else None
            if world is None:
                world_id = reader.pick(row, "world_id")
                world = worlds.get(world_id)
            if world is None:
                report.bump("skipped", "标记（无世界）")
                continue
            x = float(reader.pick(row, "x", "left", default=0) or 0)
            y = float(reader.pick(row, "y", "top", default=0) or 0)
            if x > 1 or y > 1:  # stored as percentages in some revisions
                x, y = x / 100.0, y / 100.0
            kind = str(reader.pick(row, "kind", default="place")).lower()
            if kind not in MARKER_KINDS:
                kind = "place"
            MapMarker.objects.create(
                world=world,
                card=cards.get(reader.pick(row, "card_id")),
                label=(reader.pick(row, "label", "name", "title") or "未命名")[:120],
                kind=kind,
                x=min(1.0, max(0.0, x)),
                y=min(1.0, max(0.0, y)),
            )
            report.bump("created", "地图标记")

    # ------------------------------------------------------------ timelines
    def _timelines(self, reader, report, worlds) -> dict[int, Timeline]:
        mapping: dict[int, Timeline] = {}
        world_of_timeline: dict[int, int] = {}
        for row in reader.rows("world_timeline"):
            world_id = reader.pick(row, "world_id")
            world_of_timeline[row["id"]] = world_id
            world = worlds.get(world_id)
            if not world:
                continue
            name = (reader.pick(row, "name", "title") or "时间线")[:80]
            slug = (reader.pick(row, "slug") or "").strip()[:80] or f"timeline-{row['id']}"
            timeline, created = Timeline.objects.get_or_create(
                world=world,
                slug=slug,
                defaults={
                    "name": name,
                    "color": (reader.pick(row, "color", default="blue") or "blue")[:16],
                    "is_default": bool(reader.pick(row, "is_default", default=False)),
                },
            )
            mapping[row["id"]] = timeline
            report.bump("created" if created else "skipped", "时间线")

        # WorldTimeline events carry no world_id: resolve through timeline → document.
        doc_world = {
            row["id"]: row["world_id"]
            for row in reader.rows("world_document")
            if "world_id" in row.keys()
        }
        era_names = {
            row["id"]: (row["name"] if "name" in row.keys() else "")
            for row in reader.rows("world_era")
        }
        for row in reader.rows("world_timelineevent"):
            world_id = reader.pick(row, "world_id")
            if world_id is None:
                timeline_id = reader.pick(row, "timeline_id")
                world_id = world_of_timeline.get(timeline_id) if timeline_id else None
            if world_id is None:
                doc_id = reader.pick(row, "document_id")
                world_id = doc_world.get(doc_id) if doc_id else None
            world = worlds.get(world_id)
            if not world:
                report.bump("skipped", "时间线条目（找不到世界）")
                continue
            year = reader.pick(row, "year", "start_year")
            if year is None:
                report.bump("skipped", "时间线条目（无年份）")
                continue
            era_name = reader.pick(row, "era", "era_name")
            if not era_name:
                era_id = reader.pick(row, "era_id")
                era_name = era_names.get(era_id, "") if era_id else ""
            TimelineEntry.objects.create(
                world=world,
                timeline=mapping.get(reader.pick(row, "timeline_id")),
                year=int(year),
                month=reader.pick(row, "month"),
                end_year=reader.pick(row, "end_year"),
                era=(era_name or "")[:80],
                title=(reader.pick(row, "title", "name") or "未命名")[:160],
                description=reader.pick(row, "description", "summary", default="") or "",
            )
            report.bump("created", "时间线条目")
        return mapping

    # ----------------------------------------------------------------- eras
    def _eras(self, reader, report, worlds) -> None:
        if not reader.has_table("world_era"):
            return
        for row in reader.rows("world_era"):
            world = worlds.get(reader.pick(row, "world_id"))
            if not world:
                continue
            start = reader.pick(row, "start_year")
            end = reader.pick(row, "end_year")
            if start is None or end is None:
                report.bump("skipped", "纪元（无年份）")
                continue
            Era.objects.get_or_create(
                world=world,
                name=(reader.pick(row, "name") or "纪元")[:80],
                defaults={"start_year": int(start), "end_year": int(end)},
            )
            report.bump("created", "纪元")
