# -*- coding: utf-8 -*-
"""把 ``timeline`` 应用的扁平条目迁进 ``world`` 的世界模型。

映射关系：

* ``TimelineItem(kind="era")``   -> ``Era``（theme / cover / desc 直接搬）
* ``TimelineItem(kind="event")`` -> ``TimelineEvent``（start 拆成 年/月，精度取到「年」）
* ``TimelineItem.cards``         -> 每张卡片建一个 ``Document(type=card)`` + ``Card``，并挂到事件上
* 所有事件与纪元                  -> 一条 ``Document(type=timeline)``

用法：

    .venv/bin/python manage.py import_timeline                 # 迁进第一个世界（没有就建）
    .venv/bin/python manage.py import_timeline --world 我的世界  # 指定/新建世界
    .venv/bin/python manage.py import_timeline --dry-run        # 只看会写什么
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from timeline.models import TimelineItem, TimelineView
from world.models import (
    CAL_EARTH,
    DOC_CARD,
    DOC_TIMELINE,
    World,
)
from documents.models import Calendar, Card, Document, Era, TimelineEvent


def split_year(value: float) -> tuple[int, int]:
    """把浮点年拆成 (年, 月)：小数部分按月均分（和前端刻度一致，一年 12 个月）。"""
    year = int(value // 1)
    fraction = value - year
    month = int(round(fraction * 12)) + 1
    if month > 12:
        year += 1
        month -= 12
    return year, max(1, min(12, month))


class Command(BaseCommand):
    help = "把 timeline 应用里的条目迁移到 world 应用（世界 / 纪元 / 时间线 / 事件 / 卡片）"

    def add_arguments(self, parser):
        parser.add_argument("--world", default="", help="目标世界名（不存在就新建）")
        parser.add_argument("--dry-run", action="store_true", help="只统计，不写库")
        parser.add_argument("--clear", action="store_true", help="迁移前清空目标世界的文档与纪元")

    def handle(self, *args, **options):
        items = list(TimelineItem.objects.all())
        eras = [i for i in items if i.kind == "era"]
        events = [i for i in items if i.kind != "era"]
        self.stdout.write(f"源数据：{len(eras)} 个纪元、{len(events)} 个事件")

        if options["dry_run"]:
            for item in items:
                self.stdout.write(f"  [{item.kind}] {item.title} ({item.start} ~ {item.end})")
            return

        with transaction.atomic():
            world = self._world(options["world"])
            if options["clear"]:
                world.documents.all().delete()
                world.eras.all().delete()
                self.stdout.write("已清空目标世界的历史文档与纪元")

            calendar = world.calendars.order_by("id").first()
            if calendar is None:
                calendar = Calendar.objects.create(world=world, name="通用 12 × 30", mode=CAL_EARTH)

            era_map = self._eras(world, eras)
            timeline = Document.objects.create(
                world=world,
                document_type=DOC_TIMELINE,
                name="世界时间线",
                position=world.documents.filter(parent__isnull=True).count() + 1,
                settings={"calendar": calendar.id, "view_start": 1500.0, "view_end": 1900.0},
            )

            created_events = 0
            created_cards = 0
            for item in events:
                year, month = split_year(item.start)
                event = TimelineEvent.objects.create(
                    document=timeline,
                    title=item.title or "未命名事件",
                    precision="year",
                    year=year,
                    month=month,
                    day=1,
                    hour=0,
                    description=item.desc or "",
                    cover=item.cover or "",
                    row=item.row or 0,
                    position=created_events + 1,
                )
                created_events += 1
                for index, raw in enumerate(item.cards or []):
                    if not isinstance(raw, dict):
                        continue
                    document = Document.objects.create(
                        world=world,
                        document_type=DOC_CARD,
                        name=(raw.get("title") or "未命名卡片")[:160],
                        position=world.documents.filter(document_type=DOC_CARD).count() + 1,
                        cover=(raw.get("cover") or "")[:4000],
                    )
                    Card.objects.create(
                        document=document,
                        values={},
                        blocks=[{"id": "b1", "type": "text", "title": "概览", "text": raw.get("url") or ""}],
                        body=raw.get("url") or "",
                    )
                    event.linked_cards.add(document)
                    if index == 0:
                        event.featured_card = document
                        event.save(update_fields=["featured_card"])
                    created_cards += 1

            # 记住原来的视野
            state = TimelineView.load()
            settings = dict(timeline.settings or {})
            settings.update({"view_start": state.start, "view_end": state.end})
            timeline.settings = settings
            timeline.save(update_fields=["settings"])

        self.stdout.write(self.style.SUCCESS(
            f"完成：世界「{world.name}」+ {len(era_map)} 个纪元 + 1 条时间线 + "
            f"{created_events} 个事件 + {created_cards} 张卡片"
        ))

    # -- 内部 -------------------------------------------------------------- #
    def _world(self, name: str) -> World:
        if name:
            world = World.objects.filter(name=name).first()
            return world or World.objects.create(name=name, theme_config={}, genres=["dark-fantasy"])
        world = World.objects.order_by("id").first()
        return world or World.objects.create(name="新世界", theme_config={}, genres=["dark-fantasy"])

    def _eras(self, world: World, items) -> dict:
        era_map = {}
        for index, item in enumerate(items):
            era = Era.objects.create(
                world=world,
                name=item.title or f"纪元 {index + 1}",
                position=index + 1,
                length_years=max(0.0, float(item.end or 0) - float(item.start or 0)),
                theme=item.theme if item.theme in {"blue", "sky", "violet", "red", "teal", "gold"} else "blue",
                description=item.desc or "",
                cover=item.cover or "",
            )
            era_map[item.id] = era
        return era_map
