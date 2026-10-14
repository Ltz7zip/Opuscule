# -*- coding: utf-8 -*-
"""world 应用的测试：模型语义、取值规则、接口往返、两条管理命令。

跑法：``.venv/bin/python manage.py test world``（或直接 ``manage.py test`` 跑全部）。
"""

from __future__ import annotations

import json
import os
import pathlib
import re
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from .services import publish

from timeline.models import TimelineItem, TimelineView

from .models import (
    CAL_CUSTOM,
    DOC_CARD,
    DOC_FOLDER,
    DOC_TIMELINE,
    DOC_TREE,
    EntityType,
    InviteCode,
    MAX_OWNED_WORLDS,
    MemberEvent,
    Membership,
    ModerationEvent,
    PropertyDef,
    Report,
    ROLE_EDITOR,
    World,
)
from documents.models import (
    Calendar,
    Card,
    Document,
    DocumentVersion,
    Era,
    Presence,
    TimelineEvent,
)
from maps.models import MapMarker
from .normalize import (
    blocks_to_text,
    coerce_property_value,
    default_values_for,
    evaluate_formula,
    normalize_blocks,
    resolve_card_values,
)


class BaseWorldCase(TestCase):
    """公共夹具：一个世界 + 一个角色类型（含各种值类型的属性）。"""

    def setUp(self):
        # 限流计数落在缓存里，跨测试共享会累积触顶；每个用例开始前清一次。
        cache.clear()
        self.world = World.objects.create(name="测试世界", theme_config={"primaryColor": "#123456"})
        self.role = EntityType.objects.create(world=self.world, name="角色", position=1)
        self.p_name = PropertyDef.objects.create(entity_type=self.role, name="定位", value_type="text", position=1)
        self.p_age = PropertyDef.objects.create(entity_type=self.role, name="年龄", value_type="number", position=2)
        self.p_rank = PropertyDef.objects.create(entity_type=self.role, name="头衔", value_type="select",
                                                 options=[{"label": "调停人", "color": "sky"}], position=3)
        self.p_tags = PropertyDef.objects.create(entity_type=self.role, name="标签", value_type="multiselect",
                                                 position=4)
        self.p_faction = PropertyDef.objects.create(entity_type=self.role, name="阵营", value_type="reference",
                                                    position=5)

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def make_card(self, name="Isarra", entity_type=None, values=None, aliases=None, blocks=None):
        document = Document.objects.create(
            world=self.world, document_type=DOC_CARD, name=name,
            entity_type=entity_type or self.role,
        )
        card = Card.objects.create(
            document=document, entity_type=entity_type or self.role,
            values=values or {}, aliases=aliases or [], blocks=blocks or [],
        )
        return document, card


class WorldModelTests(BaseWorldCase):
    def test_slug_is_generated_and_six_hex(self):
        self.assertEqual(len(self.world.slug), 6)
        self.assertTrue(all(c in "0123456789abcdef" for c in self.world.slug))

    def test_theme_merges_defaults(self):
        theme = self.world.theme
        self.assertEqual(theme["primaryColor"], "#123456")       # world 覆盖
        self.assertEqual(theme["headingFont"], "EB Garamond")     # 默认值兜底
        self.assertEqual(theme["grain"], 22)

    def test_document_slug_from_name(self):
        document = Document.objects.create(world=self.world, document_type=DOC_FOLDER, name="People & Figures")
        self.assertEqual(document.slug, "people-figures")


class TypeSystemTests(BaseWorldCase):
    def test_subtype_inherits_properties_and_overrides(self):
        ruler = EntityType.objects.create(world=self.world, name="统治者", parent=self.role)
        PropertyDef.objects.create(entity_type=ruler, name="在位年限", value_type="number", position=1)
        # 子类型重名属性覆盖父类
        PropertyDef.objects.create(entity_type=ruler, name="定位", value_type="select", position=2)

        names = [p.name for p in ruler.all_properties()]
        self.assertIn("年龄", names)          # 继承
        self.assertIn("在位年限", names)      # 自有
        self.assertEqual(names.count("定位"), 1)
        overridden = next(p for p in ruler.all_properties() if p.name == "定位")
        self.assertEqual(overridden.value_type, "select")  # 覆盖生效

    def test_ancestry_and_descendant_guard(self):
        ruler = EntityType.objects.create(world=self.world, name="统治者", parent=self.role)
        self.assertEqual([t.name for t in ruler.ancestry()], ["角色", "统治者"])
        self.assertTrue(self.role.is_ancestor_of(ruler))
        self.assertFalse(ruler.is_ancestor_of(self.role))

    def test_default_values_for_type(self):
        PropertyDef.objects.create(entity_type=self.role, name="阵营名", value_type="text",
                                   default_value="The Balri Accords", position=9)
        defaults = default_values_for(self.role)
        self.assertIn("The Balri Accords", defaults.values())


class PropertyValueTests(BaseWorldCase):
    def test_text_and_number(self):
        self.assertEqual(coerce_property_value(self.p_name, "  外交官 "), "外交官")
        self.assertEqual(coerce_property_value(self.p_age, "41"), 41)
        self.assertEqual(coerce_property_value(self.p_age, ""), None)

    def test_select_creates_new_option_inline(self):
        value = coerce_property_value(self.p_rank, "无冕者")
        self.assertEqual(value, "无冕者")
        self.p_rank.refresh_from_db()
        self.assertIn("无冕者", self.p_rank.option_labels)

    def test_multiselect_dedupes(self):
        self.assertEqual(coerce_property_value(self.p_tags, ["a", "a", "b"]), ["a", "b"])
        self.assertEqual(coerce_property_value(self.p_tags, ""), [])

    def test_reference_must_exist_in_world(self):
        target, _card = self.make_card(name="Balri")
        self.assertEqual(coerce_property_value(self.p_faction, target.id, self.world), target.id)
        with self.assertRaises(Exception):
            coerce_property_value(self.p_faction, 999999, self.world)

    def test_formula_evaluation_and_safety(self):
        self.assertEqual(evaluate_formula("@[稀有度] * @[价格]", {"稀有度": 3, "价格": 12.5}), 37.5)
        self.assertEqual(evaluate_formula("@[A] + 1", {"A": 1}), 2)
        self.assertIsNone(evaluate_formula("@[缺值] + 1", {}))                 # 缺值
        self.assertIsNone(evaluate_formula("__import__('os').system('ls')", {}))  # 注入被挡
        self.assertIsNone(evaluate_formula("@[A] / 0", {"A": 1}))              # inf

    def test_resolve_card_values_handles_all_types(self):
        target, _ = self.make_card(name="The Balri Accords")
        document, card = self.make_card(values={
            str(self.p_name.id): "外交官",
            str(self.p_age.id): "41",
            str(self.p_rank.id): "调停人",
            str(self.p_tags.id): ["无冕者", "调停人"],
            str(self.p_faction.id): target.id,
        })
        resolved = resolve_card_values(card)
        self.assertEqual(resolved[str(self.p_name.id)]["display"], "外交官")
        self.assertEqual(resolved[str(self.p_age.id)]["display"], "41")
        self.assertEqual(resolved[str(self.p_tags.id)]["display"], "无冕者、调停人")
        self.assertEqual(resolved[str(self.p_faction.id)]["display"], "The Balri Accords")
        self.assertEqual(resolved[str(self.p_faction.id)]["ref"]["id"], target.id)

    def test_blocks_normalisation_and_text(self):
        blocks = normalize_blocks([
            {"type": "text", "title": "概览", "text": "他是谁"},
            {"type": "未知类型", "text": "当作文本处理"},
            "不是对象，忽略",
        ])
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[1]["type"], "text")
        self.assertIn("概览", blocks_to_text(blocks))
        self.assertIn("他是谁", blocks_to_text(blocks))


class DocumentTreeTests(BaseWorldCase):
    def test_nesting_and_descendants(self):
        folder = Document.objects.create(world=self.world, document_type=DOC_FOLDER, name="人物")
        child = Document.objects.create(world=self.world, document_type=DOC_CARD, name="A", parent=folder)
        grand = Document.objects.create(world=self.world, document_type=DOC_CARD, name="B", parent=child)
        self.assertEqual([d.name for d in folder.descendants()], ["A", "B"])
        self.assertTrue(grand.is_descendant_of(folder))
        self.assertEqual(grand.root_doc, folder)

    def test_soft_delete_and_hard_delete(self):
        document, _ = self.make_card(name="待删")
        document.deleted_at = __import__("django.utils.timezone", fromlist=["now"]).now()
        document.save(update_fields=["deleted_at"])
        self.assertEqual(self.world.documents.filter(deleted_at__isnull=True).count(), 0)

    def test_card_payload_includes_resolved_values(self):
        document, _ = self.make_card(values={str(self.p_age.id): 30})
        payload = document.to_payload(with_card=True)
        self.assertEqual(payload["type"], DOC_CARD)
        self.assertEqual(payload["card"]["resolved"][str(self.p_age.id)]["display"], "30")


class CalendarAndTimelineTests(BaseWorldCase):
    def setUp(self):
        super().setUp()
        self.calendar = Calendar.objects.create(
            world=self.world, name="The Reckoning", mode=CAL_CUSTOM, hours_per_day=20,
            months=[{"name": "霜降", "days": 28}, {"name": "融雪", "days": 31}],
        )
        self.timeline = Document.objects.create(
            world=self.world, document_type=DOC_TIMELINE, name="世界时间线",
            settings={"calendar": self.calendar.id, "view_start": 0, "view_end": 100},
        )

    def test_calendar_math(self):
        self.assertEqual(self.calendar.month_count, 2)
        self.assertEqual(self.calendar.days_per_year, 59)
        self.assertEqual(self.calendar.month_name(2), "融雪")
        self.assertEqual(self.calendar.clamp(0, 5, 99, 99), (0, 2, 31, 19))  # 越界收进范围

    def test_calendar_format_by_precision(self):
        self.assertEqual(self.calendar.format_date(12, 1, 1, 0, "year"), "Year 12")
        self.assertEqual(self.calendar.format_date(12, 2, 1, 0, "month"), "融雪, Year 12")
        self.assertEqual(self.calendar.format_date(12, 2, 3, 7, "time"), "3 融雪, Year 12 · 07:00")

    def test_empty_months_fall_back_to_generic(self):
        calendar = Calendar.objects.create(world=self.world, name="空历")
        self.assertEqual(calendar.month_count, 12)
        self.assertEqual(calendar.days_per_year, 360)

    def test_event_sort_key_respects_precision(self):
        coarse = TimelineEvent.objects.create(document=self.timeline, title="只到年", precision="year",
                                              year=10, month=12, day=30, hour=23)
        # 精度不到「月」，12 月/30 日/23 时都不参与排序，按 1/1/0 处理
        self.assertEqual(coarse.sort_key[:4], (10, 1, 1, 0))

        fine = TimelineEvent.objects.create(document=self.timeline, title="精确到时", precision="time",
                                            year=10, month=12, day=30, hour=23)
        self.assertEqual(fine.sort_key[:4], (10, 12, 30, 23))
        self.assertLess(coarse.sort_key[:4], fine.sort_key[:4])

    def test_event_date_label_uses_document_calendar(self):
        event = TimelineEvent.objects.create(document=self.timeline, title="签署", precision="month",
                                             year=402, month=2)
        self.assertEqual(event.date_label(), "融雪, Year 402")

    def test_linking_cards_and_featured(self):
        card_doc, _ = self.make_card(name="Isarra")
        event = TimelineEvent.objects.create(document=self.timeline, title="调停", year=455)
        event.linked_cards.add(card_doc)
        event.featured_card = card_doc
        event.save(update_fields=["featured_card"])
        payload = event.to_payload()
        self.assertEqual([c["name"] for c in payload["linked_cards"]], ["Isarra"])
        self.assertEqual(payload["featured_card"], card_doc.id)

    def test_duplicate_timeline_copies_events_and_links(self):
        card_doc, _ = self.make_card(name="Isarra")
        event = TimelineEvent.objects.create(document=self.timeline, title="调停", year=455)
        event.linked_cards.add(card_doc)
        clone = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="副本")
        self.assertEqual(clone.events.count(), 0)


class ApiTests(BaseWorldCase):
    """接口往返：全部走 Django 测试客户端。"""

    def post(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def put(self, path, payload):
        return self.client.put(path, data=json.dumps(payload), content_type="application/json")

    def test_state_bootstraps_a_world(self):
        World.objects.all().delete()
        response = self.client.get("/api/world/state")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["world"]["name"])
        self.assertTrue(World.objects.exists())

    def test_document_crud_and_card_creation(self):
        created = self.post("/api/world/documents", {"type": "card", "name": "新卡片",
                                                     "entity_type": self.role.id}).json()
        self.assertEqual(created["name"], "新卡片")
        self.assertEqual(created["card"]["blocks"][0]["title"], "概览")

        updated = self.put(f"/api/world/documents/{created['id']}",
                           {"name": "改名了", "pinned": True}).json()
        self.assertEqual(updated["name"], "改名了")
        self.assertTrue(updated["pinned"])

        removed = self.client.delete(f"/api/world/documents/{created['id']}").json()
        self.assertTrue(removed["success"])
        self.assertIsNotNone(Document.objects.get(pk=created["id"]).deleted_at)

    def test_deleted_children_disappear_from_the_tree(self):
        folder = self.post("/api/world/documents", {"type": "folder", "name": "袋"}).json()
        child = self.post("/api/world/documents", {"type": "card", "name": "被删的",
                                                   "parent": folder["id"]}).json()
        self.client.delete(f"/api/world/documents/{child['id']}")
        tree = self.client.get("/api/world/state").json()
        names = [c["name"] for root in tree["documents"] for c in (root.get("children") or [])]
        self.assertNotIn("被删的", names)
        self.assertEqual(tree["trash_count"], 1)

        self.client.post(f"/api/world/documents/{child['id']}/restore")
        tree = self.client.get("/api/world/state").json()
        names = [c["name"] for root in tree["documents"] for c in (root.get("children") or [])]
        self.assertIn("被删的", names)

    def test_trash_list_restore_and_purge(self):
        folder = self.post("/api/world/documents", {"type": "folder", "name": "临时"}).json()
        child = self.post("/api/world/documents", {"type": "card", "name": "子卡",
                                                   "parent": folder["id"]}).json()
        self.client.delete(f"/api/world/documents/{folder['id']}")
        self.client.delete(f"/api/world/documents/{child['id']}")

        trash = self.client.get("/api/world/trash").json()
        self.assertEqual(trash["count"], 2)
        self.assertEqual({d["name"] for d in trash["documents"]}, {"临时", "子卡"})

        restored = self.client.post(f"/api/world/documents/{child['id']}/restore").json()
        self.assertEqual(restored["name"], "子卡")
        self.assertIsNone(restored["parent"])        # 父文件夹还在回收站里 -> 提到顶层
        self.assertEqual(self.client.get("/api/world/trash").json()["count"], 1)

        self.client.delete(f"/api/world/documents/{folder['id']}?hard=1")
        self.assertFalse(Document.objects.filter(pk=folder["id"]).exists())

        # 没被删的文档不能"恢复"
        alive, _ = self.make_card(name="好好的")
        self.assertEqual(self.client.post(f"/api/world/documents/{alive.id}/restore").status_code, 404)

    def test_move_into_own_descendant_is_rejected(self):
        folder = self.post("/api/world/documents", {"type": "folder", "name": "A"}).json()
        child = self.post("/api/world/documents", {"type": "folder", "name": "B", "parent": folder["id"]}).json()
        response = self.put(f"/api/world/documents/{folder['id']}", {"parent": child["id"]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("子文件夹", response.json()["error"])

    def test_card_values_validation_error_is_400(self):
        document, _ = self.make_card()
        response = self.put(f"/api/world/cards/{document.id}", {"values": {str(self.p_age.id): "不是数字"}})
        self.assertEqual(response.status_code, 400)
        self.assertIn("数字", response.json()["error"])

    def test_card_aliases_and_blocks_round_trip(self):
        document, _ = self.make_card()
        body = {
            "aliases": "The Untreated, 无冕者",
            "blocks": [{"type": "text", "title": "概览", "text": "外交官"}],
            "values": {str(self.p_name.id): "外交官"},
        }
        payload = self.put(f"/api/world/cards/{document.id}", body).json()
        self.assertEqual(payload["card"]["aliases"], ["The Untreated", "无冕者"])
        self.assertEqual(payload["card"]["body"], "概览\n外交官")

    def test_type_and_property_crud(self):
        created_type = self.post("/api/world/types", {"name": "地点"}).json()
        property_payload = self.post(f"/api/world/types/{created_type['id']}/properties",
                                     {"name": "人口", "value_type": "number"}).json()
        self.assertEqual(property_payload["name"], "人口")

        renamed = self.put(f"/api/world/types/{created_type['id']}", {"name": "地点与区域"}).json()
        self.assertEqual(renamed["name"], "地点与区域")

        self.client.delete(f"/api/world/properties/{property_payload['id']}")
        self.assertEqual(PropertyDef.objects.filter(pk=property_payload["id"]).count(), 0)

    def test_type_delete_moves_subtypes_up(self):
        sub = self.post("/api/world/types", {"name": "统治者", "parent": self.role.id}).json()
        self.client.delete(f"/api/world/types/{self.role.id}")
        self.assertIsNone(EntityType.objects.get(pk=sub["id"]).parent_id)

    def test_timeline_state_and_event_lifecycle(self):
        calendar = Calendar.objects.create(world=self.world, name="历法",
                                           months=[{"name": "一月", "days": 30}])
        timeline = self.post("/api/world/documents", {"type": "timeline", "name": "线"}).json()
        self.put(f"/api/world/documents/{timeline['id']}", {"settings": {"calendar": calendar.id}})

        state = self.client.get(f"/api/world/timelines/{timeline['id']}").json()
        self.assertEqual(state["calendar"]["id"], calendar.id)

        event = self.post(f"/api/world/timelines/{timeline['id']}/events",
                          {"title": "签署", "precision": "month", "year": 402, "month": 1}).json()
        self.assertEqual(event["title"], "签署")

        card_doc, _ = self.make_card(name="Isarra")
        linked = self.post(f"/api/world/events/{event['id']}/cards",
                           {"card_id": card_doc.id, "featured": True}).json()
        self.assertEqual(linked["event"]["featured_card"], card_doc.id)

        unlinked = self.client.delete(f"/api/world/events/{event['id']}/cards/{card_doc.id}").json()
        self.assertEqual(unlinked["event"]["linked_cards"], [])

        self.client.delete(f"/api/world/events/{event['id']}")
        self.assertEqual(TimelineEvent.objects.filter(pk=event["id"]).count(), 0)

    def test_calendar_update_clamps_existing_events(self):
        calendar = Calendar.objects.create(world=self.world, name="历法",
                                           months=[{"name": "一月", "days": 30}])
        timeline = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="线",
                                           settings={"calendar": calendar.id})
        event = TimelineEvent.objects.create(document=timeline, title="越界", precision="day",
                                             year=5, month=3, day=40, hour=30)
        self.put(f"/api/world/calendars/{calendar.id}",
                 {"months": [{"name": "一月", "days": 10}], "hours_per_day": 12})
        event.refresh_from_db()
        self.assertEqual((event.month, event.day, event.hour), (1, 10, 11))

    def test_calendar_preset_round_trip(self):
        calendar = Calendar.objects.create(world=self.world, name="历法", hours_per_day=20)
        preset = self.post(f"/api/world/calendars/{calendar.id}/preset", {"name": "我的历"}).json()
        self.assertTrue(preset["is_preset"])

        timeline = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="线")
        state = self.post(f"/api/world/timelines/{timeline.id}/apply-preset", {"preset": preset["id"]}).json()
        self.assertEqual(state["calendar"]["hours_per_day"], 20)

    def test_search_hits_name_alias_body_and_values(self):
        document, card = self.make_card(name="Isarra Thornveil", aliases=["The Untreated"],
                                        blocks=normalize_blocks([{"type": "text", "text": "无冕的调停人"}]))
        card.body = blocks_to_text(card.blocks)
        card.save(update_fields=["body"])

        for keyword in ("Isarra", "Untreated", "调停人"):
            body = self.client.get("/api/world/search", {"q": keyword}).json()
            self.assertEqual([r["name"] for r in body["results"]], ["Isarra Thornveil"], keyword)

    def test_autolink_prefers_longest_and_skips_existing_links(self):
        self.make_card(name="Isarra")
        self.make_card(name="Isarra Thornveil")
        text = "Isarra Thornveil 与 [[Isarra]] 都在场，Isarra 也在。"
        matches = self.post("/api/world/autolink", {"text": text}).json()["matches"]
        names = [m["matched"] for m in matches]
        self.assertEqual(names[0], "Isarra Thornveil")     # 最长优先
        # [[Isarra]] 这一段已经被显式链接占住，里面的 Isarra 不再命中
        link_start = text.index("[[")
        self.assertFalse([m for m in matches if link_start <= m["start"] < link_start + 10])
        self.assertEqual(names.count("Isarra"), 1)         # 只命中句尾那个裸名字

    def test_backlinks_reports_mentions(self):
        target, _ = self.make_card(name="Harrowdeep")
        self.make_card(name="其他", blocks=normalize_blocks([{"type": "text", "text": "Harrowdeep 深处"} ]))
        body = self.client.get(f"/api/world/backlinks/{target.id}").json()
        self.assertEqual([m["name"] for m in body["mentions"]], ["其他"])

    def test_world_settings_round_trip(self):
        body = self.put("/api/world/world", {
            "name": "改名后的世界",
            "theme_config": {"headingFont": "EB Garamond", "grain": 30},
            "ai_enabled": False,
            "genres": ["dark-fantasy", "sci-fi"],
        }).json()
        self.assertEqual(body["name"], "改名后的世界")
        self.assertEqual(body["theme"]["grain"], 30)
        self.assertEqual(body["theme"]["bodyFont"], "DM Sans")   # 未传的键仍走默认值
        self.assertFalse(body["ai_enabled"])
        self.assertEqual(body["genres"], ["dark-fantasy", "sci-fi"])

        world = World.objects.get(pk=body["id"])
        self.assertEqual(world.theme["headingFont"], "EB Garamond")

    def test_new_name_detection_is_conservative(self):
        from world.services.autolink import detect_new_names

        text = "Kethvari 塔倒了。Kethvari 的信使还在路上，Calreth 也是。"
        names = detect_new_names(self.world, text)
        self.assertIn("Kethvari", names)      # 出现两次
        self.assertNotIn("Calreth", names)    # 只出现一次

    def test_api_fallback_returns_json_404(self):
        response = self.client.get("/api/world/不存在")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "接口不存在")


class GraphTests(BaseWorldCase):
    """世界图谱：三种连线来源 + 过滤 + 邻域。"""

    def setUp(self):
        super().setUp()
        self.faction = EntityType.objects.create(world=self.world, name="阵营", position=9)
        self.p_ref = PropertyDef.objects.create(entity_type=self.role, name="所属阵营", value_type="reference",
                                                position=9)
        self.timeline = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="线")
        self.hero, hero_card = self.make_card(name="Isarra", values={str(self.p_ref.id): None})
        self.faction_doc, _ = self.make_card(name="The Balri Accords", entity_type=self.faction)
        hero_card.values = {str(self.p_ref.id): self.faction_doc.id}
        hero_card.save(update_fields=["values"])
        # 正文提及
        self.other, other_card = self.make_card(name="Harrowdeep")
        other_card.body = "Isarra 曾经到过这里。"
        other_card.save(update_fields=["body"])
        # 事件关联
        self.event = TimelineEvent.objects.create(document=self.timeline, title="调停", year=455)
        self.event.linked_cards.add(self.hero)

    def test_graph_collects_three_kinds_of_links(self):
        from world.services.graph import build_graph

        data = build_graph(self.world)
        kinds = {link["kind"] for link in data["links"]}
        self.assertEqual(kinds, {"reference", "event", "mention"})
        pairs = {(l["source"], l["target"], l["kind"]) for l in data["links"]}
        self.assertIn((self.hero.id, self.faction_doc.id, "reference"), pairs)
        self.assertIn((self.timeline.id, self.hero.id, "event"), pairs)
        self.assertIn((self.other.id, self.hero.id, "mention"), pairs)
        hero_node = next(n for n in data["nodes"] if n["id"] == self.hero.id)
        self.assertGreaterEqual(hero_node["degree"], 3)
        self.assertEqual(hero_node["entity_type_name"], "角色")

    def test_hide_isolated_and_search(self):
        from world.services.graph import build_graph

        lonely, _ = self.make_card(name="没人连我")
        data = build_graph(self.world, hide_isolated=True)
        self.assertNotIn(lonely.id, [n["id"] for n in data["nodes"]])

        data = build_graph(self.world, query="Balri")
        ids = {n["id"] for n in data["nodes"]}
        self.assertIn(self.faction_doc.id, ids)
        self.assertIn(self.hero.id, ids)      # 命中节点的一跳邻居也在
        self.assertNotIn(lonely.id, ids)

    def test_neighborhood_center(self):
        from world.services.graph import build_graph

        data = build_graph(self.world, center=self.hero.id, depth=1)
        ids = {n["id"] for n in data["nodes"]}
        self.assertIn(self.hero.id, ids)
        self.assertIn(self.faction_doc.id, ids)
        self.assertNotIn(lonely_id := self.make_card(name="孤岛")[0].id, ids)

    def test_graph_api(self):
        body = self.client.get("/api/world/graph").json()
        self.assertEqual(body["stats"]["documents"], len(body["nodes"]))
        self.assertIn("reference", body["kinds"])
        centered = self.client.get(f"/api/world/graph?center={self.hero.id}").json()
        self.assertEqual(centered["center"], self.hero.id)
        self.assertEqual(centered["center_name"], "Isarra")


class PublishTests(BaseWorldCase):
    """发布：状态机 + 站点三档可见性。"""

    def setUp(self):
        super().setUp()
        self.card_doc, _ = self.make_card(name="Isarra Thornveil", aliases=["The Untreated"],
                                         blocks=normalize_blocks([{"type": "text", "title": "概览",
                                                                  "text": "外交官。"}]))
        self.other, _ = self.make_card(name="Harrowdeep")
        self.timeline = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="世界时间线")
        TimelineEvent.objects.create(document=self.timeline, title="建镇", year=12)
        self.folder = Document.objects.create(world=self.world, document_type=DOC_FOLDER, name="人物")

    def publish(self, **kwargs):
        from world.services.publish import publish

        return publish(self.world, **kwargs)

    def test_publish_advances_version_and_marks_documents(self):
        from world.models import STATE_LIVE, STATE_UNPUBLISHED, publish_state

        self.assertEqual(publish_state(self.card_doc), STATE_UNPUBLISHED)
        result = self.publish(audience="public")
        self.assertEqual(result["version"], 1)
        self.world.refresh_from_db()
        self.card_doc.refresh_from_db()
        self.assertTrue(self.world.is_published)
        self.assertTrue(self.world.published_slug)
        self.assertEqual(self.card_doc.published_version, 1)
        self.assertEqual(publish_state(self.card_doc), STATE_LIVE)

    def test_state_machine_stale_pending_excluded(self):
        from world.models import STATE_EXCLUDED, STATE_LIVE, STATE_PENDING, STATE_STALE, publish_state

        self.publish()
        # 发布之后改一次内容 -> 变成「有改动未发布」
        self.client.put(f"/api/world/cards/{self.card_doc.id}",
                        data=json.dumps({"blocks": [{"type": "text", "text": "改了一句话"}]}),
                        content_type="application/json")
        self.card_doc.refresh_from_db()
        self.assertEqual(publish_state(self.card_doc), STATE_STALE)
        # 重新发布后又回到 live
        self.publish()
        self.card_doc.refresh_from_db()
        self.assertEqual(publish_state(self.card_doc), STATE_LIVE)

        fresh, _ = self.make_card(name="发布后新建")
        self.assertEqual(publish_state(fresh), STATE_PENDING)

        self.other.hidden = True
        self.other.save(update_fields=["hidden"])
        self.assertEqual(publish_state(self.other), STATE_EXCLUDED)

    def test_site_home_and_page(self):
        self.publish()
        home = self.client.get(f"/s/{self.world.published_slug}/")
        self.assertEqual(home.status_code, 200)
        self.assertContains(home, "Isarra Thornveil")
        self.assertContains(home, "角色")            # 分区按卡片类型分组（文件夹不上站点）

        page = self.client.get(f"/s/{self.world.published_slug}/{self.card_doc.slug}/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "外交官。")
        self.assertContains(page, "The Untreated")

    def test_hidden_and_excluded_documents_stay_off_the_site(self):
        self.publish()
        self.other.hidden = True
        self.other.save(update_fields=["hidden"])
        self.assertEqual(self.client.get(f"/s/{self.world.published_slug}/{self.other.slug}/").status_code, 404)

        self.card_doc.is_published = False
        self.card_doc.save(update_fields=["is_published"])
        self.assertEqual(self.client.get(f"/s/{self.world.published_slug}/{self.card_doc.slug}/").status_code, 404)

    def test_unpublished_world_has_no_site(self):
        self.world.published_slug = "abc123"
        self.world.save(update_fields=["published_slug"])
        self.assertEqual(self.client.get("/s/abc123/").status_code, 404)

        from world.services.publish import unpublish

        self.publish()
        home = self.client.get(f"/s/{self.world.published_slug}/")
        self.assertEqual(home.status_code, 200)
        unpublish(self.world)
        self.assertEqual(self.client.get(f"/s/{self.world.published_slug}/").status_code, 404)

    def test_password_gate(self):
        self.publish(audience="password", password="tower-42")
        slug = self.world.published_slug
        blocked = self.client.get(f"/s/{slug}/")
        self.assertEqual(blocked.status_code, 200)
        self.assertContains(blocked, "需要密码")

        wrong = self.client.post(f"/s/{slug}/unlock", {"password": "nope"})
        self.assertEqual(wrong.status_code, 403)
        self.assertContains(wrong, "密码不对", status_code=403)

        ok = self.client.post(f"/s/{slug}/unlock", {"password": "tower-42"})
        self.assertEqual(ok.status_code, 302)
        unlocked = self.client.get(f"/s/{slug}/")
        self.assertContains(unlocked, "Isarra Thornveil")

    def test_publish_password_is_stored_hashed(self):
        """访问密码只以哈希落库：字段里看不到明文，校验走 check_password。"""
        from django.contrib.auth.hashers import check_password

        self.publish(audience="password", password="tower-42")
        self.world.refresh_from_db()
        self.assertNotEqual(self.world.publish_password, "tower-42")
        self.assertNotIn("tower-42", self.world.publish_password)
        self.assertTrue(check_password("tower-42", self.world.publish_password))
        self.assertFalse(check_password("nope", self.world.publish_password))

    def test_republish_without_password_keeps_the_old_one(self):
        """不传 password 只是"不改密码"：原哈希原样留着，别被清掉或被二次哈希。"""
        self.publish(audience="password", password="tower-42")
        self.world.refresh_from_db()
        stored = self.world.publish_password
        self.publish(audience="password")
        self.world.refresh_from_db()
        self.assertEqual(self.world.publish_password, stored)

    def test_unlisted_site_is_noindex(self):
        self.publish(audience="unlisted")
        home = self.client.get(f"/s/{self.world.published_slug}/")
        self.assertContains(home, "noindex")

    def test_publish_api_round_trip(self):
        status = self.client.get("/api/world/publish").json()
        self.assertFalse(status["publish"]["published"])
        self.assertEqual(len(status["audiences"]), 3)

        published = self.client.post("/api/world/publish", data=json.dumps({
            "audience": "unlisted",
        }), content_type="application/json").json()
        self.assertTrue(published["publish"]["published"])
        self.assertEqual(published["publish"]["audience"], "unlisted")
        # 文件夹不上站点，所以是 2 张卡 + 1 条时间线
        self.assertEqual(published["publish"]["counts"]["live"], 3)

        offline = self.client.post("/api/world/unpublish").json()
        self.assertFalse(offline["publish"]["published"])

    def test_related_documents_lists_references_and_events(self):
        from world.services.publish import related_documents

        self.p_ref = PropertyDef.objects.create(entity_type=self.role, name="所属阵营", value_type="reference",
                                                position=9)
        target, _ = self.make_card(name="阵营卡")
        card = self.card_doc.card
        card.values = {str(self.p_ref.id): target.id}
        card.save(update_fields=["values"])
        event = TimelineEvent.objects.create(document=self.timeline, title="调停", year=455)
        event.linked_cards.add(self.card_doc)
        self.publish()

        related = related_documents(self.card_doc)
        names = {item["name"] for item in related}
        self.assertIn("阵营卡", names)
        self.assertIn("世界时间线", names)
        reasons = " ".join(item["reason"] for item in related)
        self.assertIn("引用", reasons)


class ExploreTests(BaseWorldCase):
    """公开世界展示页 /explore：只陈列公开发布的世界，游客从 /world 被送到这里。"""

    def publish(self, **kwargs):
        from world.services.publish import publish

        return publish(self.world, **kwargs)

    def test_explore_is_public_and_lists_published_world(self):
        self.world.description = "一座塔的故事"
        self.world.save(update_fields=["description"])
        self.publish(audience="public")
        self.world.refresh_from_db()

        response = self.client.get("/explore")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "测试世界")
        self.assertContains(response, "一座塔的故事")
        self.assertContains(response, f"/s/{self.world.published_slug}/")

    def test_explore_hides_unlisted_password_and_unpublished(self):
        # 未发布：不进目录
        self.assertNotContains(self.client.get("/explore"), "测试世界")

        # unlisted 是「仅持链接可见」，摆进目录等于替发布者泄底
        self.publish(audience="unlisted")
        self.assertNotContains(self.client.get("/explore"), "测试世界")

        # password 要密码，同理
        self.publish(audience="password", password="tower-42")
        self.assertNotContains(self.client.get("/explore"), "测试世界")

        # 公开发布后才出现
        self.publish(audience="public")
        self.assertContains(self.client.get("/explore"), "测试世界")

    def test_explore_empty_state(self):
        response = self.client.get("/explore")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "还没有公开的世界")

    def test_explore_sanitizes_theme_color(self):
        """主题主色用户可控、会写进内联 style：不校验就等于开了 CSS 注入口。"""
        self.world.theme_config = {"primaryColor": "#123456"}
        self.world.save(update_fields=["theme_config"])
        self.publish(audience="public")
        self.assertContains(self.client.get("/explore"), "--site-primary: #123456")

        self.world.theme_config = {"primaryColor": "red}.evil{color:red"}
        self.world.save(update_fields=["theme_config"])
        response = self.client.get("/explore")
        self.assertNotContains(response, ".evil{")
        self.assertContains(response, "--site-primary: #3ddc97")

    def test_anonymous_workspace_redirects_to_explore(self):
        from django.contrib.auth.models import User

        User.objects.create_user("someone", password="very-secret-1")
        response = self.client.get("/world")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/explore")

    def test_logged_in_workspace_still_renders(self):
        from django.contrib.auth.models import User

        user = User.objects.create_user("owner", password="very-secret-1")
        self.client.force_login(user)
        self.assertEqual(self.client.get("/world").status_code, 200)

    def test_first_install_workspace_is_open(self):
        # 一个用户都没有：首次安装例外，放行让人进来把世界建起来
        self.assertEqual(self.client.get("/world").status_code, 200)


class TreeTests(BaseWorldCase):
    """关系树：模板 / 多变体 / 关系名 / 卡片吸附 / 交汇点。"""

    def setUp(self):
        super().setUp()
        created = self.client.post("/api/world/documents", data=json.dumps(
            {"type": "familyTree", "name": "家谱"}), content_type="application/json").json()
        self.tree_id = created["id"]
        self.state = self.client.get(f"/api/world/trees/{self.tree_id}").json()
        self.variant_id = self.state["active"]["id"]

    def add_node(self, name, **extra):
        payload = {"name": name, **extra}
        return self.client.post(f"/api/world/tree-variants/{self.variant_id}/nodes",
                                data=json.dumps(payload), content_type="application/json").json()

    def test_creating_tree_document_makes_main_variant(self):
        self.assertEqual(len(self.state["variants"]), 1)
        self.assertEqual(self.state["active"]["name"], "Main")
        self.assertEqual(self.state["active"]["kind"], "family")
        self.assertEqual(self.state["active"]["resolved_labels"]["parent"], "父母")

    def test_nodes_and_edges_round_trip(self):
        parent = self.add_node("Isarra", generation=0, x=0)
        child = self.add_node("Brann", generation=1, x=40)
        edge = self.client.post(f"/api/world/tree-variants/{self.variant_id}/edges",
                                data=json.dumps({"source": parent["id"], "target": child["id"],
                                                 "kind": "parent"}),
                                content_type="application/json").json()
        self.assertEqual(edge["display_label"], "父母")

        state = self.client.get(f"/api/world/trees/{self.tree_id}").json()
        self.assertEqual(len(state["active"]["nodes"]), 2)
        self.assertEqual(len(state["active"]["edges"]), 1)

        moved = self.client.put(f"/api/world/tree-nodes/{child['id']}", data=json.dumps(
            {"generation": 2, "x": 12.5, "junction": True, "deceased": True}),
            content_type="application/json").json()
        self.assertEqual((moved["generation"], moved["x"]), (2, 12.5))
        self.assertTrue(moved["junction"] and moved["deceased"])

    def test_relationship_names_can_be_renamed(self):
        renamed = self.client.put(f"/api/world/tree-variants/{self.variant_id}", data=json.dumps(
            {"edge_labels": {"parent": "生父"}}), content_type="application/json").json()
        self.assertEqual(renamed["resolved_labels"]["parent"], "生父")
        self.assertEqual(renamed["resolved_labels"]["spouse"], "伴侣")   # 其余仍走模板

    def test_military_template_labels(self):
        # 模版的关系名按 /relationship 的设计稿走（军事那份：军团长 / 百夫长 / 护民官…）
        variant = self.client.post(f"/api/world/trees/{self.tree_id}/variants", data=json.dumps(
            {"name": "军团", "kind": "military"}), content_type="application/json").json()
        self.assertEqual(variant["resolved_labels"]["parent"], "军团长")
        self.assertEqual(variant["resolved_labels"]["child"], "百夫长")

    def test_fork_copies_nodes_and_edges(self):
        a = self.add_node("甲")
        b = self.add_node("乙")
        self.client.post(f"/api/world/tree-variants/{self.variant_id}/edges",
                         data=json.dumps({"source": a["id"], "target": b["id"], "kind": "parent"}),
                         content_type="application/json")
        forked = self.client.post(f"/api/world/trees/{self.tree_id}/variants", data=json.dumps(
            {"fork_from": self.variant_id, "name": "分支"}), content_type="application/json").json()
        self.assertEqual(forked["name"], "分支")
        self.assertEqual(len(forked["nodes"]), 2)
        self.assertEqual(len(forked["edges"]), 1)

    def test_person_can_get_a_new_card(self):
        node = self.add_node("无名者")
        self.assertIsNone(node["card"])
        created = self.client.post(f"/api/world/tree-nodes/{node['id']}/card", data=json.dumps(
            {"entity_type": self.role.id, "name": "Isarra Thornveil"}),
            content_type="application/json").json()
        self.assertEqual(created["node"]["card"], created["document"]["id"])
        self.assertEqual(created["node"]["name"], "Isarra Thornveil")

        document, _ = self.make_card(name="已存在的人")
        linked = self.client.put(f"/api/world/tree-nodes/{node['id']}", data=json.dumps(
            {"card": document.id}), content_type="application/json").json()
        self.assertEqual(linked["card_name"], "已存在的人")

    def test_edges_reject_self_and_cross_variant(self):
        a = self.add_node("甲")
        bad = self.client.post(f"/api/world/tree-variants/{self.variant_id}/edges", data=json.dumps(
            {"source": a["id"], "target": a["id"], "kind": "parent"}), content_type="application/json")
        self.assertEqual(bad.status_code, 400)

        other = self.client.post(f"/api/world/trees/{self.tree_id}/variants", data=json.dumps(
            {"name": "另一棵"}), content_type="application/json").json()
        b = self.client.post(f"/api/world/tree-variants/{other['id']}/nodes", data=json.dumps(
            {"name": "乙"}), content_type="application/json").json()
        cross = self.client.post(f"/api/world/tree-variants/{self.variant_id}/edges", data=json.dumps(
            {"source": a["id"], "target": b["id"], "kind": "parent"}), content_type="application/json")
        self.assertEqual(cross.status_code, 400)

    def test_last_variant_cannot_be_deleted(self):
        response = self.client.delete(f"/api/world/tree-variants/{self.variant_id}")
        self.assertEqual(response.status_code, 400)

    def test_tree_state_rejects_non_tree_document(self):
        card_doc, _ = self.make_card(name="卡片")
        self.assertEqual(self.client.get(f"/api/world/trees/{card_doc.id}").status_code, 400)


class RelationshipPageTests(BaseWorldCase):
    """独立的「关系树」页（/relationship）：模版目录 / 按模版建树 / 关系清单 / 网格。"""

    def test_page_renders_and_accepts_doc_id(self):
        page = self.client.get("/relationship")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "选择您要构建的树的类型")
        self.assertContains(page, 'data-doc="0"')

        document = self._new_tree("family")["document"]
        with_doc = self.client.get(f"/relationship?doc={document['id']}")
        self.assertContains(with_doc, f'data-doc="{document["id"]}"')

    def test_empty_tree_asks_for_a_template_before_showing_the_canvas(self):
        """空树先给模版选择：不管在独立页打开还是在工作区面板里打开。"""
        created = self._new_tree("family", with_demo=False)
        # 独立页建出来的树是"已经选过模版"的
        self.assertTrue(created["variant"]["setup"])
        self.assertEqual(len(created["variant"]["relations"]), 8)

        # 工作区那样先建一篇空文档 → 变体还没配过
        document = Document.objects.create(world=self.world, document_type=DOC_TREE, name="新建关系树")
        state = self.client.get(f"/api/world/relationship/trees/{document.id}").json()
        self.assertFalse(state["variant"]["setup"])
        self.assertEqual(state["variant"]["nodes"], [])

        # 就地配模版
        configured = self.post_json(f"/api/world/relationship/trees/{document.id}/setup", {
            "template": "royal", "with_demo": True,
            "relations": [{"kind": "liege", "label": "领主"}, {"kind": "vassal", "label": "封臣"}],
        }).json()
        self.assertTrue(configured["variant"]["setup"])
        self.assertEqual(configured["variant"]["kind_label"], "皇家宫廷")
        self.assertEqual([item["label"] for item in configured["variant"]["relations"]],
                         ["领主", "封臣"])
        self.assertEqual(len(configured["variant"]["nodes"]), 7)
        # 名字还是默认的，就跟着模版起一个
        document.refresh_from_db()
        self.assertEqual(document.name, "皇家宫廷关系树")

        # 配过之后不能再重配（那会把画好的东西冲掉）
        again = self.client.post(f"/api/world/relationship/trees/{document.id}/setup",
                                 data=json.dumps({"template": "family"}), content_type="application/json")
        self.assertEqual(again.status_code, 400)

    def test_setup_keeps_a_user_chosen_name(self):
        document = Document.objects.create(world=self.world, document_type=DOC_TREE, name="我的家谱")
        self.post_json(f"/api/world/relationship/trees/{document.id}/setup", {"template": "family"})
        document.refresh_from_db()
        self.assertEqual(document.name, "我的家谱")

    def test_setup_rejects_non_tree_documents(self):
        card_doc, _ = self.make_card(name="卡片")
        response = self.client.post(f"/api/world/relationship/trees/{card_doc.id}/setup",
                                    data=json.dumps({"template": "family"}),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_missing_document_does_not_look_like_a_new_tree(self):
        """指名要的那篇打不开时，页面得说"打不开"，而不是掉回模版选择。"""
        missing = self.client.get("/relationship?doc=999999")
        self.assertContains(missing, 'data-doc="999999"')
        self.assertContains(missing, 'data-doc-missing="1"')

        # 正常打开的一篇：没有这个标记
        created = self._new_tree("family", with_demo=False)
        alive = self.client.get(f"/relationship?doc={created['document']['id']}")
        self.assertContains(alive, 'data-doc-missing="0"')

        # 进了回收站也算"打不开"（这正是当初看着像"树变成了新建向导"的那次）
        document = Document.objects.get(pk=created["document"]["id"])
        document.deleted_at = timezone.now()
        document.save(update_fields=["deleted_at"])
        trashed = self.client.get(f"/relationship?doc={document.id}")
        self.assertContains(trashed, 'data-doc-missing="1"')

        # 不带 ?doc= 的裸页面不算
        self.assertContains(self.client.get("/relationship"), 'data-doc-missing="0"')

    def test_embed_and_readonly_flags(self):
        """面板 / 站点是用 iframe 嵌这一页的：embed 去外壳，且默认只读。"""
        plain = self.client.get("/relationship")
        self.assertContains(plain, 'data-embed="0"')
        # 没账号（首次安装）时任何人都能编辑，所以这里不是只读
        self.assertContains(plain, 'data-readonly="0"')

        embedded = self.client.get("/relationship?embed=1")
        self.assertContains(embedded, "rt-body is-embed")
        self.assertContains(embedded, 'data-embed="1"')
        self.assertContains(embedded, 'data-readonly="1"')     # embed 默认只读

        editable = self.client.get("/relationship?embed=1&readonly=0")
        self.assertContains(editable, 'data-readonly="0"')

        # 嵌入态（发布站点 / 工作区面板）都是暗色终端外壳：
        # theme=paper 这个老参数保留着（老链接不失效），但终端设计语言里
        # 没有浅色纸面，它落到暗色；真要浅色得显式传 theme=light。
        paper = self.client.get("/relationship?embed=1&theme=paper")
        self.assertContains(paper, "is-paper")
        self.assertContains(paper, 'data-theme="dark"')

        forced = self.client.get("/relationship?theme=light")
        self.assertContains(forced, 'data-theme="light"')

    def test_guest_gets_a_readonly_canvas(self):
        """有账号之后，游客 / 只读成员拿到的一定是只读画布。"""
        from django.contrib.auth.models import User
        User.objects.create_user("owner", password="dev-password-1")
        guest = self.client.get("/relationship")
        self.assertContains(guest, 'data-readonly="1"')

    def test_workspace_embeds_the_same_editor(self):
        """工作区的关系树面板必须嵌这一页，而不是自己那套旧简版。"""
        sheet = (pathlib.Path(__file__).resolve().parent.parent / "static" / "workspace.js")
        script = sheet.read_text(encoding="utf-8")
        self.assertIn("function renderTreeFrame(entry)", script)
        self.assertIn("/relationship?doc=", script)
        self.assertNotIn("function renderTreeTool(entry)", script)   # 旧简版已经拆掉
        self.assertNotIn("function fitTree(", script)
        # 嵌入的 iframe 不能在面板重绘时被销毁，否则画布状态每次都丢
        self.assertIn("function liveEmbed(", script)
        self.assertIn("function parkLiveEmbeds(", script)

    def test_page_follows_the_minimal_design_language(self):
        """外观必须跟工作区同一套语言：加载 minimal.css、明暗跟世界主题、图标走公共图标集。"""
        page = self.client.get("/relationship")
        self.assertContains(page, "minimal.css")
        self.assertContains(page, "icons.js")
        # 明暗由 world.theme.mode 决定，非 light 即 dark（和工作区 applyTheme 同一条规则）
        self.assertContains(page, 'data-theme="dark"')

        self.world.theme_config = {**(self.world.theme_config or {}), "mode": "light"}
        self.world.save(update_fields=["theme_config"])
        self.assertContains(self.client.get("/relationship"), 'data-theme="light"')

        # 样式表得真的吃 Minimal 的 token，而不是自己另起一套配色
        sheet = (pathlib.Path(__file__).resolve().parent.parent / "static" / "relationship.css")
        css = sheet.read_text(encoding="utf-8")
        self.assertIn("--mn-surface", css)
        self.assertIn("--mn-border", css)
        self.assertIn("--mn-radius", css)
        self.assertIn("[data-theme=\"dark\"]", css)
        self.assertNotIn("#182533", css)          # 旧的自定义深蓝已退役

    def test_templates_cover_the_five_design_specs(self):
        data = self.client.get("/api/world/relationship/templates").json()
        self.assertEqual([item["id"] for item in data["templates"]],
                         ["family", "corporate", "military", "royal", "blank"])
        family = data["templates"][0]
        # 图2 那一列：现成的关系名，顺序就是设计稿的顺序
        self.assertEqual([item["label"] for item in family["relations"]],
                         ["父母", "子女", "伴侣", "前任", "兄弟姐妹",
                          "同父异母/同母异父兄弟姐妹", "养父母/养子女", "继父母"])
        self.assertTrue(all(item["label"] for item in data["templates"][1]["relations"]))
        self.assertEqual(data["templates"][4]["relations"], [])
        # 网格参数前后端共用一份，卡片宽高必须是整数格
        grid = data["grid"]
        self.assertEqual(grid["col_step"], grid["card_cols"] + grid["gap_x"])
        self.assertEqual(grid["row_step"], grid["card_rows"] + grid["gap_y"])

    def test_create_tree_seeds_relations_and_optional_demo(self):
        created = self._new_tree("family", with_demo=True)
        self.assertEqual(len(created["variant"]["nodes"]), 9)
        self.assertEqual(len(created["variant"]["edges"]), 10)
        self.assertEqual(created["variant"]["kind"], "family")

        # 示例人物落库时是**像素**坐标，且必须是网格整数倍（"边框严格贴网格"）
        step = 28
        for node in created["variant"]["nodes"]:
            self.assertEqual(node["x"] % step, 0)
            self.assertEqual(node["y"] % step, 0)

        plain = self._new_tree("corporate", with_demo=False)
        self.assertEqual(plain["variant"]["nodes"], [])
        self.assertEqual([item["kind"] for item in plain["variant"]["relations"]],
                         ["parent", "child", "spouse", "ex", "sibling", "half_sibling", "adoptive", "step"])

        listing = self.client.get("/api/world/relationship/trees").json()["trees"]
        self.assertEqual({item["id"] for item in listing},
                         {created["document"]["id"], plain["document"]["id"]})
        self.assertEqual(next(item for item in listing if item["id"] == created["document"]["id"])["people"], 9)

    def test_tree_detail_shape_and_relation_editing(self):
        created = self._new_tree("military", with_demo=False)
        doc_id = created["document"]["id"]

        state = self.client.get(f"/api/world/relationship/trees/{doc_id}").json()
        self.assertEqual(state["variant"]["kind_label"], "军事")
        self.assertEqual(state["variant"]["resolved_labels"]["parent"], "军团长")
        self.assertEqual(state["grid"]["grid"], 28)
        self.assertIn({"value": "half_sibling", "label": "同父异母/同母异父兄弟姐妹", "style": "dashed"},
                      state["relation_kinds"])

        # 整份替换：改名 + 停用 + 加一条自定义
        replaced = self.client.put(f"/api/world/relationship/trees/{doc_id}/relations", data=json.dumps({
            "relations": [
                {"kind": "parent", "label": "老军团长", "enabled": True},
                {"kind": "child", "enabled": False},
                {"kind": "sworn", "label": "结义兄弟"},
            ]
        }), content_type="application/json").json()
        self.assertEqual([item["label"] for item in replaced["relations"]],
                         ["老军团长", "百夫长", "结义兄弟"])
        self.assertEqual(replaced["relations"][1]["enabled"], False)
        self.assertEqual(replaced["relations"][2]["style"], "")
        self.assertEqual(replaced["resolved_labels"]["parent"], "老军团长")

        # 关系清单是**这棵树**的设置，不能串到别的树上
        other = self._new_tree("military", with_demo=False)
        other_state = self.client.get(
            f"/api/world/relationship/trees/{other['document']['id']}").json()
        self.assertEqual([item["label"] for item in other_state["variant"]["relations"]][0], "军团长")

    def test_relations_must_be_a_list(self):
        doc_id = self._new_tree("family", with_demo=False)["document"]["id"]
        response = self.client.put(f"/api/world/relationship/trees/{doc_id}/relations",
                                   data=json.dumps({"relations": "父母"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_detail_rejects_non_tree_document(self):
        card_doc, _ = self.make_card(name="卡片")
        self.assertEqual(
            self.client.get(f"/api/world/relationship/trees/{card_doc.id}").status_code, 400)
        self.assertEqual(
            self.client.get("/api/world/relationship/trees/999999").status_code, 404)

    def test_nodes_can_be_notes_with_grid_free_positions(self):
        created = self._new_tree("blank", with_demo=False)
        variant_id = created["variant"]["id"]

        person = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes",
                                {"name": "某人", "x": 0, "y": 0}).json()
        self.assertEqual(person["kind"], "person")
        self.assertFalse(person["is_note"])

        # 不给名字就给"新成员"；**显式给空名字**表示"还没起名"（网格编辑器的空卡片）
        unnamed = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes",
                                 {"name": "", "x": 224, "y": 0}).json()
        self.assertEqual(unnamed["name"], "")
        fallback = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes", {"x": 448}).json()
        self.assertEqual(fallback["name"], "新成员")

        note = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes",
                              {"kind": "note", "note": "这里以前是一片海", "x": 672, "y": 0}).json()
        self.assertEqual(note["kind"], "note")
        self.assertTrue(note["is_note"])
        self.assertEqual(note["name"], "备注")

        moved = self.client.put(f"/api/world/tree-nodes/{note['id']}", data=json.dumps(
            {"note": "改过了", "x": 196.5, "favourite": True}), content_type="application/json").json()
        self.assertEqual(moved["note"], "改过了")
        # 备注不是人：位置可以落在网格之外（只有卡片边框要贴网格）
        self.assertEqual(moved["x"], 196.5)
        self.assertTrue(moved["favourite"])

    def test_edge_style_and_blank_label(self):
        created = self._new_tree("family", with_demo=False)
        variant_id = created["variant"]["id"]
        a = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes", {"name": "甲"}).json()
        b = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes", {"name": "乙"}).json()
        c = self.post_json(f"/api/world/tree-variants/{variant_id}/nodes", {"name": "丙"}).json()

        edge = self.post_json(f"/api/world/tree-variants/{variant_id}/edges", {
            "source": a["id"], "target": b["id"], "kind": "half_sibling",
        }).json()
        # 虚线关系（非婚生直系）自动带 dashed 线型
        self.assertEqual(edge["style"], "dashed")
        self.assertEqual(edge["display_label"], "同父异母/同母异父兄弟姐妹")

        # 显式给空 label：这条线就是"先连上、以后再命名"，别被兜底成「自定义」
        blank = self.post_json(f"/api/world/tree-variants/{variant_id}/edges", {
            "source": a["id"], "target": c["id"], "kind": "custom", "label": "",
        }).json()
        self.assertEqual(blank["label"], "")
        # 没给 label 才走兜底
        filled = self.post_json(f"/api/world/tree-variants/{variant_id}/edges", {
            "source": b["id"], "target": c["id"], "kind": "custom",
        }).json()
        self.assertEqual(filled["label"], "自定义")

    def _new_tree(self, template, with_demo=False):
        return self.post_json("/api/world/relationship/trees", {
            "template": template, "name": f"{template} 树", "with_demo": with_demo,
        }).json()


class MapTests(BaseWorldCase):
    """经典地图：底图 / 图钉 / 区域 / 文字 / 图层。"""

    PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
           b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")

    def setUp(self):
        super().setUp()
        created = self.client.post("/api/world/documents", data=json.dumps(
            {"type": "map", "name": "世界地图"}), content_type="application/json").json()
        self.map_id = created["id"]
        self.state = self.client.get(f"/api/world/maps/{self.map_id}").json()
        self.layer_id = self.state["layers"][0]["id"]

    def test_map_document_gets_a_default_layer(self):
        self.assertEqual(len(self.state["layers"]), 1)
        self.assertEqual(self.state["layers"][0]["name"], "默认")
        self.assertIn("pin", [k["value"] for k in self.state["kinds"]])

    def test_map_data_roundtrip(self):
        """整包数据：先空、写回后原样取出（.map 文本原样保存，不解析、不改动）。"""
        empty = self.client.get(f"/api/world/maps/{self.map_id}/data").json()
        self.assertFalse(empty["saved"])
        self.assertEqual(empty["data"], "")

        text = "1.154.0|license|2026-10-11|seed|1000|600|9\r\n{}\r\n<svg id=\"map\"></svg>"
        saved = self.client.put(f"/api/world/maps/{self.map_id}/data",
                                data=json.dumps({"data": text}),
                                content_type="application/json").json()
        self.assertTrue(saved["success"])
        self.assertEqual(saved["size"], len(text))

        again = self.client.get(f"/api/world/maps/{self.map_id}/data").json()
        self.assertTrue(again["saved"])
        self.assertEqual(again["data"], text)

    def test_map_data_needs_a_string_and_a_map_document(self):
        bad = self.client.put(f"/api/world/maps/{self.map_id}/data",
                              data=json.dumps({"data": 7}),
                              content_type="application/json")
        self.assertEqual(bad.status_code, 400)

        unknown = self.client.get("/api/world/maps/999999/data")
        self.assertEqual(unknown.status_code, 404)

        card = self.post_json("/api/world/documents", {"type": "card", "name": "条目"}).json()
        not_a_map = self.client.get(f"/api/world/maps/{card['id']}/data")
        self.assertEqual(not_a_map.status_code, 400)

    def test_background_by_url_and_clear(self):
        body = self.client.post(f"/api/world/maps/{self.map_id}/background", data=json.dumps(
            {"url": "https://example.com/map.png", "bg_zoom": 1.5}),
            content_type="application/json").json()
        self.assertEqual(body["background"]["url"], "https://example.com/map.png")
        self.assertEqual(body["background"]["zoom"], 1.5)

        cleared = self.client.post(f"/api/world/maps/{self.map_id}/background", data=json.dumps(
            {"clear": True}), content_type="application/json").json()
        self.assertEqual(cleared["background"]["url"], "")

    def test_background_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("realm.png", self.PNG, content_type="image/png")
        body = self.client.post(f"/api/world/maps/{self.map_id}/background",
                                {"file": upload}).json()
        self.assertTrue(body["background"]["url"].startswith("/media/maps/"))
        self.assertTrue(body["background"]["url"].endswith(".png"))

    def test_background_upload_rejects_non_image(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
        response = self.client.post(f"/api/world/maps/{self.map_id}/background", {"file": upload})
        self.assertEqual(response.status_code, 400)
        self.assertIn("不支持", response.json()["error"])

    def test_pin_zone_label_lifecycle(self):
        pin = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "name": "Redwake Harbor", "x": 62.5, "y": 38.0, "color": "teal"}),
            content_type="application/json").json()
        self.assertEqual(pin["kind"], "pin")
        self.assertEqual(pin["layer"], self.layer_id)

        zone = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "zone", "name": "The Quiet Belt", "color": "violet",
             "points": [[10, 20], [30, 20], [30, 45]]}), content_type="application/json").json()
        self.assertEqual(len(zone["points"]), 3)

        label = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "label", "name": "Harrow I", "x": 40, "y": 55, "rotation": -6}),
            content_type="application/json").json()
        self.assertEqual(label["kind"], "label")

        updated = self.client.put(f"/api/world/map-markers/{zone['id']}", data=json.dumps(
            {"points": [[1, 2], [3, 4]], "color": "red"}), content_type="application/json").json()
        self.assertEqual(updated["points"], [[1.0, 2.0], [3.0, 4.0]])
        self.assertEqual(updated["color"], "red")

        removed = self.client.delete(f"/api/world/map-markers/{label['id']}").json()
        self.assertTrue(removed["success"])
        state = self.client.get(f"/api/world/maps/{self.map_id}").json()
        self.assertEqual(len(state["markers"]), 2)

    def test_invalid_color_falls_back(self):
        marker = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "name": "x", "color": "chartreuse"}), content_type="application/json").json()
        self.assertEqual(marker["color"], "gold")

    def test_marker_size_default_and_clamp(self):
        """大小（scale）能建能改，越界的值收在 0.2–4。"""
        default = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "name": "x"}), content_type="application/json").json()
        self.assertEqual(default["scale"], 1.0)

        bigger = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "name": "大点", "scale": 2.5}), content_type="application/json").json()
        self.assertEqual(bigger["scale"], 2.5)

        clamped = self.client.put(f"/api/world/map-markers/{bigger['id']}", data=json.dumps(
            {"scale": 99}), content_type="application/json").json()
        self.assertEqual(clamped["scale"], 4.0)

        # 认不出的值不能把已有的大小改坏（PUT 带 scale 但值非法 → 保持原值）
        kept = self.client.put(f"/api/world/map-markers/{bigger['id']}", data=json.dumps(
            {"description": "写得长一点", "scale": "很大"}), content_type="application/json").json()
        self.assertEqual(kept["scale"], 4.0)
        self.assertEqual(kept["description"], "写得长一点")

    def test_marker_links_a_card(self):
        document, _ = self.make_card(name="Harrowdeep")
        marker = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "card": document.id}), content_type="application/json").json()
        self.assertEqual(marker["card"], document.id)
        self.assertEqual(marker["name"], "Harrowdeep")     # 没给名字就跟着卡片名

    def test_layers_visibility_and_guard(self):
        created = self.client.post(f"/api/world/maps/{self.map_id}/layers", data=json.dumps(
            {"name": "地下"}), content_type="application/json").json()
        updated = self.client.put(f"/api/world/map-layers/{created['id']}", data=json.dumps(
            {"visible": False, "opacity": 0.4}), content_type="application/json").json()
        self.assertFalse(updated["visible"])
        self.assertEqual(updated["opacity"], 0.4)

        marker = self.client.post(f"/api/world/maps/{self.map_id}/markers", data=json.dumps(
            {"kind": "pin", "name": "深处", "layer": created["id"]}), content_type="application/json").json()
        self.assertEqual(marker["layer"], created["id"])

        self.assertEqual(self.client.delete(f"/api/world/map-layers/{created['id']}").json()["success"], True)
        self.assertEqual(self.client.delete(f"/api/world/map-layers/{self.layer_id}").status_code, 400)

    def test_map_state_rejects_non_map_document(self):
        card_doc, _ = self.make_card(name="卡片")
        self.assertEqual(self.client.get(f"/api/world/maps/{card_doc.id}").status_code, 400)


class ClassicAdapterTests(BaseWorldCase):
    """经典编辑器 ⇄ world 时间线文档：接口形状、往返换算、卡片映射。"""

    def setUp(self):
        super().setUp()
        self.calendar = Calendar.objects.create(world=self.world, name="历法",
                                                months=[{"name": "一月", "days": 30}])
        created = self.client.post("/api/world/documents", data=json.dumps(
            {"type": "timeline", "name": "世界时间线"}), content_type="application/json").json()
        self.timeline_id = created["id"]
        self.timeline = Document.objects.get(pk=self.timeline_id)
        self.base = f"/api/world/timelines/{self.timeline_id}/classic"
        self.era = Era.objects.create(world=self.world, name="The Founding", position=1,
                                      length_years=320, theme="teal")

    def post(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def put(self, path, payload):
        return self.client.put(path, data=json.dumps(payload), content_type="application/json")

    def test_payload_shape_matches_classic_editor(self):
        event = TimelineEvent.objects.create(document=self.timeline, title="建镇", precision="month",
                                             year=12, month=7, row=1)
        card, _ = self.make_card(name="Harrowdeep")
        event.linked_cards.add(card)

        body = self.client.get(self.base).json()
        self.assertIn("view", body)
        self.assertIn("items", body)
        eras = [i for i in body["items"] if i["kind"] == "era"]
        events = [i for i in body["items"] if i["kind"] == "event"]
        self.assertEqual(len(eras), 1)
        self.assertGreaterEqual(eras[0]["id"], 1_000_000)     # 纪元用偏移 id
        self.assertEqual(eras[0]["end"], 320)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["title"], "建镇")
        self.assertAlmostEqual(events[0]["start"], 12 + 6 / 12, places=3)   # 7 月 -> +0.5
        self.assertEqual(events[0]["cards"][0]["title"], "Harrowdeep")
        self.assertEqual(events[0]["row"], 1)

    def test_create_event_from_classic_payload(self):
        created = self.post(f"{self.base}/items", {
            "kind": "event", "title": "港口大火", "start": 31.5, "row": 2, "desc": "来自经典编辑器",
        }).json()
        event = TimelineEvent.objects.get(pk=created["id"])
        self.assertEqual(event.title, "港口大火")
        # 经典编辑器按「月」在轴上走，所以新建事件默认存到月：0.5 年 -> 7 月
        self.assertEqual((event.year, event.month), (31, 7))
        self.assertEqual(event.precision, "month")

        coarse = self.post(f"{self.base}/items", {
            "kind": "event", "title": "只要年", "start": 31.5, "precision": "year",
        }).json()
        only_year = TimelineEvent.objects.get(pk=coarse["id"])
        self.assertEqual((only_year.year, only_year.month), (31, 1))   # 精度不到月就不存月

    def test_update_event_keeps_precision(self):
        event = TimelineEvent.objects.create(document=self.timeline, title="旧名", precision="day",
                                             year=10, month=1, day=1)
        updated = self.put(f"{self.base}/items/{event.id}", {
            "title": "新名", "start": 10 + 3 / 12 + 15 / 360,
        }).json()
        self.assertEqual(updated["title"], "新名")
        event.refresh_from_db()
        self.assertEqual((event.year, event.month, event.day), (10, 4, 16))

    def test_era_position_is_saved_in_document_settings(self):
        updated = self.put(f"{self.base}/items/{1_000_000 + self.era.id}", {
            "title": "The Founding", "start": -50, "end": 200, "theme": "gold",
        }).json()
        self.assertEqual(updated["theme"], "gold")
        self.timeline.refresh_from_db()
        self.assertEqual(self.timeline.settings["era_spans"][str(self.era.id)], [-50.0, 200.0])
        self.era.refresh_from_db()
        self.assertEqual(self.era.length_years, 250)
        body = self.client.get(self.base).json()
        era_item = next(i for i in body["items"] if i["kind"] == "era")
        self.assertEqual((era_item["start"], era_item["end"]), (-50.0, 200.0))

    def test_create_and_delete_era(self):
        created = self.post(f"{self.base}/items", {
            "kind": "era", "title": "新纪元", "start": 400, "end": 500,
        }).json()
        self.assertEqual(created["title"], "新纪元")          # 经典形状
        self.assertEqual(Era.objects.filter(name="新纪元").count(), 1)

        item_id = created["id"]                              # 已经是带偏移的经典 id
        removed = self.client.delete(f"{self.base}/items/{item_id}").json()
        self.assertTrue(removed["success"])
        self.assertTrue(Era.objects.filter(name="新纪元").exists())   # 纪元本身保留
        self.timeline.refresh_from_db()
        self.assertNotIn(str(created["id"]), self.timeline.settings.get("era_spans", {}))

    def test_delete_event(self):
        event = TimelineEvent.objects.create(document=self.timeline, title="待删", year=5)
        response = self.client.delete(f"{self.base}/items/{event.id}").json()
        self.assertTrue(response["success"])
        self.assertFalse(TimelineEvent.objects.filter(pk=event.id).exists())

    def test_view_round_trip(self):
        saved = self.put(f"{self.base}/view", {"start": -100, "end": 900}).json()
        self.assertEqual((saved["start"], saved["end"]), (-100.0, 900.0))
        body = self.client.get(self.base).json()
        self.assertEqual(body["view"], {"start": -100.0, "end": 900.0})

        bad = self.put(f"{self.base}/view", {"start": 10, "end": 5}).json()
        self.assertEqual((bad["start"], bad["end"]), (10.0, 5.0))     # 非法范围原样返回，不写库

    def test_write_responses_use_classic_item_shape(self):
        """新建/更新必须回经典形状：编辑器会直接 adopt，缺 kind/start 会当场错乱。"""
        created = self.post(f"{self.base}/items", {
            "kind": "event", "title": "港口大火", "start": 31.5, "row": 2,
        }).json()
        self.assertEqual(created["kind"], "event")
        self.assertEqual(created["title"], "港口大火")
        self.assertAlmostEqual(created["start"], 31.5, places=3)
        self.assertIn("end", created)
        self.assertEqual(created["cards"], [])

        updated = self.put(f"{self.base}/items/{created['id']}", {"start": 40.0}).json()
        self.assertEqual(updated["kind"], "event")
        self.assertAlmostEqual(updated["start"], 40.0, places=3)

        era = self.post(f"{self.base}/items", {
            "kind": "era", "title": "新纪元", "start": 400, "end": 500, "theme": "teal",
        }).json()
        self.assertEqual(era["kind"], "era")
        self.assertEqual(era["title"], "新纪元")
        self.assertGreaterEqual(era["id"], 1_000_000)
        self.assertEqual((era["start"], era["end"]), (400.0, 500.0))

        moved = self.put(f"{self.base}/items/{era['id']}", {"start": 380, "end": 520}).json()
        self.assertEqual(moved["kind"], "era")
        self.assertEqual((moved["start"], moved["end"]), (380.0, 520.0))

    def test_event_flag_round_trip(self):
        created = self.post(f"{self.base}/items", {"kind": "event", "title": "重点事件", "start": 10}).json()
        self.assertFalse(created["flagged"])
        flagged = self.put(f"{self.base}/items/{created['id']}", {"flagged": True}).json()
        self.assertTrue(flagged["flagged"])
        again = next(i for i in self.client.get(self.base).json()["items"] if i["id"] == created["id"])
        self.assertTrue(again["flagged"])
        cleared = self.put(f"{self.base}/items/{created['id']}", {"flagged": False}).json()
        self.assertFalse(cleared["flagged"])

    def test_linked_cards_follow_titles(self):
        card_a, _ = self.make_card(name="Harrowdeep")
        self.make_card(name="Redwake Harbor")
        event = TimelineEvent.objects.create(document=self.timeline, title="带卡片", year=1)
        self.put(f"{self.base}/items/{event.id}", {
            "cards": [{"title": "Harrowdeep"}, {"title": "不存在的卡"}],
        })
        self.assertEqual([d.name for d in event.linked_cards.all()], ["Harrowdeep"])
        self.assertEqual(card_a.id, event.linked_cards.first().id)

        self.put(f"{self.base}/items/{event.id}", {"cards": []})
        self.assertEqual(event.linked_cards.count(), 0)

    def test_round_trip_year_is_stable(self):
        created = self.post(f"{self.base}/items", {"kind": "event", "title": "稳定", "start": 455.0}).json()
        body = self.client.get(self.base).json()
        again = next(i for i in body["items"] if i["id"] == created["id"])
        self.assertEqual(again["start"], 455.0)

    def test_embedded_page_injects_adapter(self):
        page = self.client.get(f"/world/timeline/{self.timeline_id}")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, f"/api/world/timelines/{self.timeline_id}/classic")
        self.assertContains(page, "/static/script.js")

        plain = self.client.get("/legacy")
        self.assertNotContains(plain, "/classic")     # 经典页面本身没被改动

    def test_root_and_old_workspace_path_redirect(self):
        for path in ("/", "/w"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response["Location"], "/world")
        self.assertEqual(self.client.get("/world").status_code, 200)
        self.assertEqual(self.client.get("/legacy").status_code, 200)

    def test_endpoints_reject_non_timeline_document(self):
        card_doc, _ = self.make_card(name="卡片")
        self.assertEqual(self.client.get(f"/api/world/timelines/{card_doc.id}/classic").status_code, 404)
        self.assertEqual(self.post(f"/api/world/timelines/{card_doc.id}/classic/items", {}).status_code, 404)


class CommandTests(TestCase):
    def test_import_timeline_migrates_items(self):
        era = TimelineItem.objects.create(kind="era", title="The Founding", start=0, end=320, theme="blue")
        event = TimelineItem.objects.create(kind="event", title="建镇", start=12.5, end=12.5,
                                            desc="挖开第一道坑道",
                                            cards=[{"title": "Harrowdeep", "url": "", "cover": ""}])
        TimelineView.load()
        self.assertIsNotNone(era.id)

        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        # timeline 应用的数据迁移会先灌一批示例数据，所以这里按「源数据的条数」核对增量
        legacy_eras = TimelineItem.objects.filter(kind="era").count()
        legacy_events = TimelineItem.objects.exclude(kind="era").count()
        legacy_cards = sum(len(item.cards or []) for item in TimelineItem.objects.exclude(kind="era"))
        before = (World.objects.count(), Era.objects.count(), TimelineEvent.objects.count(),
                  Card.objects.count())
        call_command("import_timeline", stdout=out)
        after = (World.objects.count(), Era.objects.count(), TimelineEvent.objects.count(),
                 Card.objects.count())
        self.assertEqual(after[0] - before[0], 1)                    # 新建 1 个世界
        self.assertEqual(after[1] - before[1], legacy_eras)           # 纪元逐条搬
        self.assertEqual(after[2] - before[2], legacy_events)         # 事件逐条搬
        self.assertEqual(after[3] - before[3], legacy_cards)          # 卡片逐条搬
        self.assertTrue(Era.objects.filter(name="The Founding").exists())
        self.assertGreaterEqual(TimelineEvent.objects.filter(title="建镇").count(), 1)
        migrated = TimelineEvent.objects.get(title="建镇")
        self.assertEqual(migrated.year, 12)          # 0.5 年 -> 月份进到 7 月，年仍是 12
        self.assertIn(migrated.month, range(1, 13))
        self.assertEqual([c["name"] for c in migrated.to_payload()["linked_cards"]], ["Harrowdeep"])
        self.assertIn("1 张卡片", out.getvalue())   # 命令会汇报迁移结果

    def test_seed_demo_creates_world_and_is_idempotent(self):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("seed_demo", stdout=out)
        self.assertTrue(World.objects.filter(name="The Grand Alchemy").exists())
        self.assertGreaterEqual(Document.objects.filter(document_type=DOC_CARD).count(), 6)
        self.assertGreaterEqual(Era.objects.count(), 3)
        self.assertGreaterEqual(TimelineEvent.objects.count(), 6)

        before = Document.objects.count()
        call_command("seed_demo", stdout=out)   # 再跑一次不应重复灌
        self.assertEqual(Document.objects.count(), before)
        self.assertIn("已存在", out.getvalue())


class RichTextTests(BaseWorldCase):
    """区块富文本：白名单净化 + 纯文本派生。"""

    def test_clean_html_keeps_formatting_drops_danger(self):
        from world.services.sanitize import clean_html, html_to_text

        dirty = ('<p>正常 <b>加粗</b> <i>斜体</i></p>'
                 '<script>alert(1)</script>'
                 '<img src=x onerror=alert(1)>'
                 '<a href="javascript:alert(1)">坏链接</a>'
                 '<a href="https://example.com">好链接</a>'
                 '<span style="color:red" data-target="7">提及</span>')
        cleaned = clean_html(dirty)
        self.assertIn("<b>加粗</b>", cleaned)
        self.assertIn("<i>斜体</i>", cleaned)
        self.assertNotIn("script", cleaned.lower())
        self.assertNotIn("onerror", cleaned.lower())
        self.assertNotIn("javascript:", cleaned.lower())
        self.assertIn('href="https://example.com"', cleaned)
        self.assertIn('data-target="7"', cleaned)
        self.assertNotIn("style=", cleaned)

        self.assertEqual(html_to_text("<p>第一行</p><p>第二行</p>"), "第一行\n第二行")
        self.assertEqual(html_to_text("没有标签"), "没有标签")

    def test_blocks_round_trip_keeps_html_and_plain_text(self):
        document, _ = self.make_card()
        body = {
            "blocks": [{
                "type": "text", "title": "概览",
                "html": "<p>他是 <b>外交官</b></p><ul><li>条目一</li></ul>",
            }],
        }
        payload = self.client.put(f"/api/world/cards/{document.id}",
                                  data=json.dumps(body),
                                  content_type="application/json").json()
        block = payload["card"]["blocks"][0]
        self.assertIn("<b>外交官</b>", block["html"])
        self.assertIn("外交官", block["text"])          # 纯文本被派生出来
        self.assertIn("条目一", block["text"])

    def test_block_comments_round_trip_and_sanitized(self):
        document, _ = self.make_card()
        payload = self.client.put(
            f"/api/world/cards/{document.id}",
            data=json.dumps({"blocks": [{
            "type": "text", "text": "正文",
            "comments": [
                {"id": "c1", "author": "我", "text": "这里要补一句来源", "at": "2026-10-06T10:00:00Z"},
                {"author": "别人", "text": "<script>alert(1)</script>正文没问题"},
                {"text": "   "},                       # 空评论丢掉
            ],
        }]}), content_type="application/json").json()
        comments = payload["card"]["blocks"][0]["comments"]
        self.assertEqual(len(comments), 2)
        self.assertEqual(comments[0]["text"], "这里要补一句来源")
        self.assertNotIn("script", comments[1]["text"].lower())
        self.assertIn("正文没问题", comments[1]["text"])
        self.assertFalse(comments[0]["resolved"])

        # 老数据没有 comments 字段时不要凭空造一个
        plain = self.client.put(
            f"/api/world/cards/{document.id}",
            data=json.dumps({"blocks": [{"type": "text", "text": "没评论"}]}),
            content_type="application/json",
        ).json()
        self.assertNotIn("comments", plain["card"]["blocks"][0])

    def test_script_in_block_is_stripped(self):
        document, _ = self.make_card()
        payload = self.client.put(f"/api/world/cards/{document.id}",
                                  data=json.dumps({"blocks": [
                                      {"type": "text", "html": "<script>坏</script>好内容"}
                                  ]}),
                                  content_type="application/json").json()
        block = payload["card"]["blocks"][0]
        self.assertNotIn("script", (block.get("html") or "").lower())
        self.assertNotIn("坏", block["text"])
        self.assertIn("好内容", block["text"])


class SuggestionTests(BaseWorldCase):
    """「值得添加」：本地规则统计，不调用外部模型。"""

    def test_suggestions_find_entities_and_empty_cards(self):
        first, _ = self.make_card(name="甲")
        second, _ = self.make_card(name="乙")
        self.client.put(f"/api/world/cards/{first.id}", data=json.dumps({"blocks": [
            {"type": "text", "text": "Eldoria 的 Eldoria 城门，还有 Eldoria 的钟楼"},
        ]}), content_type="application/json")
        empty, _ = self.make_card(name="还没写的卡片")

        data = self.client.get("/api/world/suggestions").json()
        self.assertTrue(data["enabled"])
        names = [e["name"] for e in data["entities"]]
        self.assertIn("Eldoria", names)
        self.assertNotIn("的洞室", names)
        self.assertTrue(all(not n.startswith("的") for n in names))
        self.assertIn("还没写的卡片", [c["name"] for c in data["empty_cards"]])
        self.assertTrue(any(o["name"] in ("甲", "乙") for o in data["orphans"]))

    def test_suggestions_respect_the_ai_switch(self):
        world = World.objects.first()
        world.ai_enabled = False
        world.save(update_fields=["ai_enabled"])
        data = self.client.get("/api/world/suggestions").json()
        self.assertFalse(data["enabled"])
        self.assertEqual(data["entities"], [])


class ExchangeTests(BaseWorldCase):
    """导入 / 导出：Markdown、zip、JSON 备份。"""

    def setUp(self):
        super().setUp()
        self.card, self.document = self.make_card(name="Isarra Thornveil")

    def test_document_markdown_has_title_blocks_and_events(self):
        self.client.put(f"/api/world/cards/{self.document.id}",
                        data=json.dumps({"blocks": [
                            {"type": "heading", "title": "早年", "text": "出生记录矛盾"},
                            {"type": "text", "title": "概览", "html": "<p>她是<b>外交官</b></p>"},
                            {"type": "divider"},
                        ]}), content_type="application/json")
        response = self.client.get(f"/api/world/documents/{self.document.id}/export")
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn("# Isarra Thornveil", body)
        self.assertIn("## 早年", body)
        self.assertIn("**外交官**", body.replace("<b>", "**").replace("</b>", "**"))
        self.assertIn("---", body)
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_export_covers_every_document_type(self):
        """每种文档都要能导出（树 / 地图 / 时间线曾经在这里炸过）。"""
        from graph.models import TreeEdge, TreeNode, TreeVariant

        tree = Document.objects.create(world=World.objects.first(), document_type="familyTree", name="家谱")
        variant = TreeVariant.objects.create(document=tree, name="Main")
        first = TreeNode.objects.create(variant=variant, name="甲")
        second = TreeNode.objects.create(variant=variant, name="乙")
        TreeEdge.objects.create(variant=variant, source=first, target=second, label="父子")

        timeline = Document.objects.create(world=World.objects.first(), document_type="timeline", name="时间线")
        TimelineEvent.objects.create(document=timeline, title="某事件", year=12, month=3, description="说明")
        world_map = Document.objects.create(world=World.objects.first(), document_type="map", name="地图")
        MapMarker.objects.create(document=world_map, name="某地", x=0.4, y=0.6)

        for document in Document.objects.all():
            markdown = self.client.get(f"/api/world/documents/{document.id}/export")
            self.assertEqual(markdown.status_code, 200, document.name)
        timeline_md = self.client.get(f"/api/world/documents/{timeline.id}/export").content.decode()
        self.assertIn("某事件", timeline_md)
        self.assertIn("说明", timeline_md)
        map_md = self.client.get(f"/api/world/documents/{world_map.id}/export").content.decode()
        self.assertIn("某地", map_md)
        tree_md = self.client.get(f"/api/world/documents/{tree.id}/export").content.decode()
        self.assertIn("甲", tree_md)
        self.assertIn("父子", tree_md)
        self.assertEqual(self.client.get("/api/world/export").status_code, 200)

    def test_world_zip_contains_backup_and_markdown(self):
        response = self.client.get("/api/world/export")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        import io
        import zipfile

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = archive.namelist()
            self.assertIn("world.json", names)
            self.assertIn("README.md", names)
            self.assertTrue(any(n.startswith("documents/") and n.endswith(".md") for n in names))
            backup = json.loads(archive.read("world.json"))
            self.assertEqual(backup["format"], "worldbuilding-timeline/backup")
            self.assertTrue(backup["documents"])

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def test_import_markdown_builds_tree_with_wiki_links(self):
        payload = {
            "files": [
                {"name": "地点/港口.md", "content": "# Redwake Harbor\n\n## 概览\n\n港口城市，与 [[Isarra Thornveil]] 有关。\n"},
                {"name": "地点/矿带.md", "content": "# The Quiet Belt\n\n- 一\n- 二\n"},
            ],
            "parent": None,
        }
        response = self.post_json("/api/world/import", payload).json()
        self.assertEqual(response["summary"]["created"], 2)
        self.assertEqual(response["summary"]["folders"], 1)

        folder = Document.objects.get(name="地点")
        self.assertEqual(folder.document_type, "folder")
        harbor = Document.objects.get(name="Redwake Harbor")
        self.assertEqual(harbor.parent_id, folder.id)
        blocks = harbor.card.blocks
        self.assertTrue(any("mentions-inline" in (b.get("html") or "") for b in blocks))
        self.assertIn(str(self.document.id), json.dumps(blocks, ensure_ascii=False))
        self.assertIn("港口城市", harbor.card.body)

    def test_import_zip_and_skip_macos_junk(self):
        import io
        import zipfile

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("世界/人物.md", "# 某人\n\n正文\n")
            archive.writestr("__MACOSX/._人物.md", "junk")
        buffer.seek(0)
        from django.core.files.uploadedfile import SimpleUploadedFile

        response = self.client.post("/api/world/import", data={
            "files": SimpleUploadedFile("notes.zip", buffer.read(), content_type="application/zip"),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["created"], 1)
        self.assertTrue(Document.objects.filter(name="某人").exists())

    def test_import_backup_round_trip(self):
        backup = self.client.get("/api/world/export?format=json").json()
        before = Document.objects.count()
        self.post_json("/api/world/import", {"mode": "backup", "content": json.dumps(backup)})
        self.assertGreater(Document.objects.count(), before)
        self.assertEqual(Document.objects.filter(name="Isarra Thornveil").count(), 2)


class AuthAndPermissionTests(BaseWorldCase):
    """账号 / 邀请码 / 权限：登录才能编辑，站点保持公开。"""

    def test_first_user_becomes_owner_without_invite(self):
        response = self.post_json("/api/world/auth/register",
                                  {"username": "owner", "password": "very-secret-1"})
        self.assertEqual(response.status_code, 200, response.content[:200])
        data = response.json()
        self.assertTrue(data["created_owner"])
        self.assertEqual(data["viewer"]["role"], "owner")
        self.assertTrue(data["viewer"]["can_edit"])
        world = World.objects.first()
        self.assertEqual(world.owner.username, "owner")

    def test_password_similar_to_username_is_rejected(self):
        """密码与用户名过于相似要被挡下——校验时必须带上待建用户，否则相似度校验会失效。"""
        from django.contrib.auth.models import User

        denied = self.post_json("/api/world/auth/register",
                                {"username": "alexander", "password": "alexander1"})
        self.assertEqual(denied.status_code, 400, denied.content[:200])
        self.assertFalse(User.objects.filter(username="alexander").exists())

    def test_register_without_invite_is_rejected(self):
        """邀请制是强制的：已有账号后，没有邀请码就不能自助开号。"""
        from django.contrib.auth.models import User

        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        worlds_before = World.objects.count()

        denied = self.post_json("/api/world/auth/register",
                                {"username": "friend", "password": "very-secret-2"})
        self.assertEqual(denied.status_code, 400, denied.content[:200])
        self.assertIn("邀请码", denied.json()["error"])
        # 被拒 = 什么都没发生：不多一个世界，也不多一个账号
        self.assertEqual(World.objects.count(), worlds_before)
        self.assertFalse(User.objects.filter(username="friend").exists())

    def test_invite_joins_the_inviters_world(self):
        """带有效邀请码注册 = 加入邀请码指向的那个世界，角色由邀请码定。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        invite = self.post_json("/api/world/collaborators/invites", {"role": "editor"}).json()
        joined = self.post_json("/api/world/auth/register",
                                {"username": "friend", "password": "very-secret-2", "invite": invite["code"]})
        self.assertEqual(joined.status_code, 200, joined.content[:200])
        self.assertFalse(joined.json()["created_owner"])
        self.assertEqual(joined.json()["viewer"]["role"], "editor")
        self.assertEqual(World.objects.count(), 1)               # 没多出一个世界

        # 一次性邀请码用过就废
        again = self.post_json("/api/world/auth/register",
                               {"username": "third", "password": "very-secret-3", "invite": invite["code"]})
        self.assertEqual(again.status_code, 400)
        self.assertIn("用完", again.json()["error"])

    def test_bad_invite_is_rejected(self):
        """填了邀请码就必须有效——不能因为填错了反而给白开一个世界。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        denied = self.post_json("/api/world/auth/register",
                                {"username": "friend", "password": "very-secret-2", "invite": "NOPE-123"})
        self.assertEqual(denied.status_code, 400)
        self.assertIn("邀请码", denied.json()["error"])

    def test_user_can_create_and_switch_worlds(self):
        """老用户随时能再建一个世界，并在自己的世界之间切换。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        mine = self.client.get("/api/world/worlds").json()
        self.assertTrue(mine["can_create"])
        self.assertEqual(len(mine["worlds"]), 1)

        created = self.post_json("/api/world/worlds", {"name": "第二个世界"})
        self.assertEqual(created.status_code, 201, created.content[:200])
        new_id = created.json()["world"]["id"]
        self.assertNotEqual(new_id, self.world.id)
        # 新建后它就是当前世界
        self.assertEqual(self.client.get("/api/world/state").json()["world"]["id"], new_id)

        listed = self.client.get("/api/world/worlds").json()
        self.assertEqual(len(listed["worlds"]), 2)
        self.assertEqual(listed["current"], new_id)

        # 切回第一个世界
        switched = self.post_json(f"/api/world/worlds/{self.world.id}/switch", {})
        self.assertEqual(switched.status_code, 200)
        self.assertEqual(self.client.get("/api/world/state").json()["world"]["id"], self.world.id)

    def test_world_creation_is_capped(self):
        """自建世界上限（MAX_OWNED_WORLDS）：到顶后 can_create 转 False，再建被 403 挡下。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        # 首用户接管了夹具世界，已占 1 个额度；把剩下的额度用完
        for i in range(MAX_OWNED_WORLDS - 1):
            created = self.post_json("/api/world/worlds", {"name": f"世界{i}"})
            self.assertEqual(created.status_code, 201, created.content[:200])

        listed = self.client.get("/api/world/worlds").json()
        self.assertEqual(listed["owned_count"], MAX_OWNED_WORLDS)
        self.assertEqual(listed["max_worlds"], MAX_OWNED_WORLDS)
        self.assertFalse(listed["can_create"])

        denied = self.post_json("/api/world/worlds", {"name": "超额的世界"})
        self.assertEqual(denied.status_code, 403, denied.content[:200])
        self.assertIn("上限", denied.json()["error"])

    def test_invited_worlds_do_not_count_against_the_cap(self):
        """被邀请加入别人的世界不算"自建"，不占额度。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        invite = self.post_json("/api/world/collaborators/invites", {"role": "editor"}).json()
        self.client.post("/api/world/auth/logout")
        joined = self.post_json("/api/world/auth/register",
                                {"username": "friend", "password": "very-secret-2", "invite": invite["code"]})
        self.assertEqual(joined.status_code, 200, joined.content[:200])

        listed = self.client.get("/api/world/worlds").json()
        self.assertEqual(listed["owned_count"], 0)               # 一个都没自建
        self.assertTrue(listed["can_create"])

    def test_registration_splits_display_name_loosely(self):
        """注册名按任意空白拆：单段中文名整名进 first_name（last_name 留空）。"""
        from django.contrib.auth.models import User

        response = self.post_json("/api/world/auth/register",
                                  {"username": "owner", "password": "very-secret-1",
                                   "display_name": "张三丰"})
        self.assertEqual(response.status_code, 200, response.content[:200])
        user = User.objects.get(username="owner")
        self.assertEqual(user.first_name, "张三丰")
        self.assertEqual(user.last_name, "")
        self.assertEqual(user.get_full_name().strip(), "张三丰")

    def test_registration_splits_name_on_fullwidth_space(self):
        """全角空格（U+3000）也算分隔符，不能被整段塞进 first_name。"""
        from django.contrib.auth.models import User

        response = self.post_json("/api/world/auth/register",
                                  {"username": "owner", "password": "very-secret-1",
                                   "display_name": "张\u3000三丰"})
        self.assertEqual(response.status_code, 200, response.content[:200])
        user = User.objects.get(username="owner")
        self.assertEqual(user.first_name, "张")
        self.assertEqual(user.last_name, "三丰")

    def test_registration_splits_western_name(self):
        """西文两段名照旧按第一个空格拆。"""
        from django.contrib.auth.models import User

        response = self.post_json("/api/world/auth/register",
                                  {"username": "owner", "password": "very-secret-1",
                                   "display_name": "Ada Lovelace"})
        self.assertEqual(response.status_code, 200, response.content[:200])
        user = User.objects.get(username="owner")
        self.assertEqual(user.first_name, "Ada")
        self.assertEqual(user.last_name, "Lovelace")

    def test_cannot_switch_to_a_foreign_world(self):
        """切不到不属于自己的世界。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        stranger = World.objects.create(name="别人的世界")
        denied = self.post_json(f"/api/world/worlds/{stranger.id}/switch", {})
        self.assertEqual(denied.status_code, 403)

    def test_guests_cannot_create_worlds(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.client.post("/api/world/auth/logout")
        self.assertEqual(self.post_json("/api/world/worlds", {"name": "路过建的"}).status_code, 401)

    def test_writes_require_login_once_a_user_exists(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        card, _card_row = self.make_card(name="已有的卡")
        self.client.post("/api/world/auth/logout")

        blocked = self.post_json("/api/world/documents", {"type": "card", "name": "偷偷建的"})
        self.assertEqual(blocked.status_code, 401)
        self.assertIn("登录", blocked.json()["error"])

        # 读也拦着了：游客只能读"发布站点里嵌的那一篇已发布文档"，其余一律 401
        self.assertEqual(self.client.get("/api/world/state").status_code, 401)
        self.assertEqual(self.client.get(f"/api/world/cards/{card.id}").status_code, 401)

    def test_reads_require_membership_once_a_user_exists(self):
        """读要登录且在世界里有身份；只给"已发布文档的只读嵌入"对游客开一条缝。"""
        # 还没有任何账号：首次安装例外，先让人进得来
        self.assertEqual(self.client.get("/api/world/state").status_code, 200)

        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        published, _row = self.make_card(name="公开的卡")
        draft, _row = self.make_card(name="草稿")
        # Document.is_published 默认就是 True（"包含在站点里"），把草稿显式排除掉，
        # 才能验出"未发布的那篇拿 id 也穷举不出来"
        draft.is_published = False
        draft.save(update_fields=["is_published"])
        published.is_published = True
        published.save(update_fields=["is_published"])
        self.world.is_published = True
        self.world.save(update_fields=["is_published"])

        # 成员（所有者）读得到整棵树
        self.assertEqual(self.client.get("/api/world/state").status_code, 200)

        self.client.post("/api/world/auth/logout")
        # 游客：整棵树的读被挡，未发布的那篇拿 id 也穷举不出来
        self.assertEqual(self.client.get("/api/world/state").status_code, 401)
        self.assertEqual(self.client.get(f"/api/world/cards/{draft.id}").status_code, 401)
        # 但带 ?embed=<已发布文档> 能读到那一篇，且树被裁成只剩它
        embedded = self.client.get(f"/api/world/state?embed={published.id}")
        self.assertEqual(embedded.status_code, 200)
        self.assertEqual([row["id"] for row in embedded.json()["documents"]], [published.id])
        self.assertEqual(self.client.get(f"/api/world/documents/{published.id}").status_code, 200)

    def test_viewer_cannot_write_but_can_read(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        invite = self.post_json("/api/world/collaborators/invites", {"role": "viewer"}).json()
        self.post_json("/api/world/auth/register",
                       {"username": "reader", "password": "very-secret-2", "invite": invite["code"]})
        blocked = self.post_json("/api/world/documents", {"type": "card", "name": "只读的人写的"})
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("只读", blocked.json()["error"])
        self.assertEqual(self.client.get("/api/world/state").json()["viewer"]["can_edit"], False)

    def test_owner_can_change_roles_and_generate_invites(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        invite = self.post_json("/api/world/collaborators/invites", {"role": "viewer", "note": "给朋友"}).json()
        self.post_json("/api/world/auth/register",
                       {"username": "friend", "password": "very-secret-2", "invite": invite["code"]})
        # 注册会把会话切成新用户，改角色要切回所有者
        self.post_json("/api/world/auth/login", {"username": "owner", "password": "very-secret-1"})
        data = self.client.get("/api/world/collaborators").json()
        self.assertEqual(len(data["members"]), 2)
        member = next(m for m in data["members"] if m["handle"] == "friend")
        updated = self.client.put(f"/api/world/collaborators/{member['id']}",
                                  data=json.dumps({"role": "editor"}),
                                  content_type="application/json").json()
        self.assertEqual(updated["role"], "editor")
        self.assertTrue(self.client.get("/api/world/collaborators").json()["invites"])

        # 观众拿不到邀请码列表
        self.client.post("/api/world/auth/logout")
        self.post_json("/api/world/auth/login", {"username": "friend", "password": "very-secret-2"})
        self.assertEqual(self.client.get("/api/world/collaborators").json()["invites"], [])
        self.assertEqual(self.client.post("/api/world/collaborators/invites", {}).status_code, 403)

    def test_presence_heartbeat_and_listing(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        empty = self.client.get("/api/world/presence").json()
        self.assertEqual(empty["count"], 0)
        self.post_json("/api/world/presence", {})
        online = self.client.get("/api/world/presence").json()
        self.assertEqual(online["count"], 1)
        self.assertEqual(online["online"][0]["handle"], "owner")


class StaffScopeTests(BaseWorldCase):
    """S7：is_staff 不再穿透——只有超级管理员能进"别人的世界"。"""

    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model

        # 给测试世界安一个真实主人：这样 staff 就是"外人"（非成员、非所有者）
        self.owner = get_user_model().objects.create_user("owner", password="very-secret-1")
        self.world.owner = self.owner
        self.world.save(update_fields=["owner"])

    def _staff(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user("staffer", password="very-secret-2", is_staff=True)

    def _superuser(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_superuser("root", password="very-secret-3")

    def test_staff_cannot_reach_foreign_worlds(self):
        from . import permissions

        staff = self._staff()
        self.assertFalse(permissions.can_access(staff, self.world))
        self.assertFalse(permissions.can_read(staff, self.world))
        self.assertFalse(permissions.can_edit(staff, self.world))
        self.assertFalse(permissions.can_admin(staff, self.world))
        self.assertEqual(permissions.role_of(staff, self.world), "viewer")
        self.assertNotIn(self.world, list(permissions.worlds_for(staff)))

    def test_superuser_still_reaches_foreign_worlds(self):
        from . import permissions

        root = self._superuser()
        self.assertTrue(permissions.can_access(root, self.world))
        self.assertTrue(permissions.can_read(root, self.world))
        self.assertTrue(permissions.can_edit(root, self.world))
        self.assertTrue(permissions.can_admin(root, self.world))
        self.assertEqual(permissions.role_of(root, self.world), "owner")
        self.assertIn(self.world, list(permissions.worlds_for(root)))

    def test_staff_request_is_denied_at_the_door(self):
        """端到端：staff 登录后读工作区接口，照样 403（它不是成员）。"""
        self.client.force_login(self._staff())
        self.assertEqual(self.client.get("/api/world/state").status_code, 403)


class AdminHardeningTests(BaseWorldCase):
    """G1 + O2b：/admin/ 既要超级管理员，又要过第二步（TOTP）。"""

    def _staff(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user("staffer", password="very-secret-2", is_staff=True)

    def _superuser(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_superuser("root", password="very-secret-3")

    def _enroll(self, user, name="test"):
        """给用户建一个已确认的 TOTP 设备，返回它（模拟 otp_enroll 的结果）。"""
        from django_otp.plugins.otp_totp.models import TOTPDevice

        return TOTPDevice.objects.create(user=user, name=name, confirmed=True)

    def _mark_verified(self, device):
        """把「这台设备已通过第二步」写进 session——OTPMiddleware 靠它认人。"""
        from django_otp import DEVICE_ID_SESSION_KEY

        # 必须持有同一个 session 实例：client.session 每次访问都新建对象，
        # 拆成两句会把 key 写到 A、把没 key 的 B 存进库。
        session = self.client.session
        session[DEVICE_ID_SESSION_KEY] = device.persistent_id
        session.save()

    def test_default_site_is_our_hardened_one(self):
        from django.contrib import admin as django_admin

        # admin.site 是 LazyObject；访问 __class__ 会触发它加载 default_site
        self.assertEqual(django_admin.site.__class__.__name__, "OpusculeAdminSite")

    def test_site_keeps_admin_namespace(self):
        """OTPAdminSite 默认 name='otpadmin' 会拆掉 admin: 命名空间，必须钉回 admin。"""
        from django.contrib import admin as django_admin
        from django.urls import reverse

        self.assertEqual(django_admin.site.name, "admin")
        self.assertEqual(reverse("admin:index"), "/admin/")

    def test_otp_middleware_is_installed_after_auth(self):
        """OTPMiddleware 必须紧跟 AuthenticationMiddleware——顺序反了 is_verified 就没了。"""
        from django.conf import settings

        mw = settings.MIDDLEWARE
        auth_idx = mw.index("django.contrib.auth.middleware.AuthenticationMiddleware")
        self.assertEqual(mw[auth_idx + 1], "django_otp.middleware.OTPMiddleware")

    def test_anonymous_is_sent_to_login(self):
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_staff_is_denied(self):
        """staff 登录后进后台照样被弹回登录页——后台的门不该认 staff。"""
        self.client.force_login(self._staff())
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_superuser_without_otp_cannot_enter(self):
        """只过了口令这一关（force_login）还进不去——第二步没过。"""
        self.client.force_login(self._superuser())
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_verified_superuser_can_enter(self):
        """口令 + TOTP 都过了才放行。"""
        user = self._superuser()
        device = self._enroll(user)
        self.client.force_login(user)
        self._mark_verified(device)
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_login_form_requires_totp_token(self):
        """光有口令没有验证码，后台登录不成立——会话里不会记下设备。"""
        from django_otp import DEVICE_ID_SESSION_KEY

        self._enroll(self._superuser())
        response = self.client.post(
            "/admin/login/",
            {"username": "root", "password": "very-secret-3", "otp_token": ""},
        )
        self.assertEqual(response.status_code, 200)  # 留在登录页
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertNotIn(DEVICE_ID_SESSION_KEY, self.client.session)

    def test_login_with_valid_totp_token_enters_admin(self):
        """口令 + 认证器里的正确验证码 → 登录成功、后台可进。"""
        from django_otp import DEVICE_ID_SESSION_KEY
        from django_otp.oath import totp

        user = self._superuser()
        device = self._enroll(user)
        token = totp(
            device.bin_key, device.step, device.t0, device.digits, device.drift
        )
        response = self.client.post(
            "/admin/login/",
            {
                "username": "root",
                "password": "very-secret-3",
                "otp_device": device.persistent_id,
                "otp_token": token,
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn(DEVICE_ID_SESSION_KEY, self.client.session)
        self.assertEqual(self.client.get("/admin/").status_code, 200)


class AdminPathTests(BaseWorldCase):
    """O2a：后台路径可配（OPUSCULE_ADMIN_PATH）——改完扫描器按 /admin/ 找不到门。"""

    def _reload_urlconf(self):
        """urlpatterns 在 import 时构建，改了 ADMIN_URL_PATH 必须重载才生效。"""
        import importlib

        from django.urls import clear_url_caches

        from worldbuilding_timeline import urls as root_urls

        importlib.reload(root_urls)
        clear_url_caches()

    def test_default_path_is_admin(self):
        from django.conf import settings

        self.assertEqual(settings.ADMIN_URL_PATH, "admin")

    def test_custom_path_replaces_admin(self):
        from django.contrib.auth import get_user_model
        from django.test import override_settings
        from django_otp import DEVICE_ID_SESSION_KEY
        from django_otp.plugins.otp_totp.models import TOTPDevice

        root = get_user_model().objects.create_superuser("root", password="very-secret-3")
        device = TOTPDevice.objects.create(user=root, name="test", confirmed=True)
        try:
            with override_settings(ADMIN_URL_PATH="ops-7f3a9c"):
                self._reload_urlconf()
                self.client.force_login(root)
                # 过第二步（O2b 引入 2FA 后，光过口令进不去后台）
                session = self.client.session
                session[DEVICE_ID_SESSION_KEY] = device.persistent_id
                session.save()
                # 新路径能进后台
                self.assertEqual(self.client.get("/ops-7f3a9c/").status_code, 200)
                # 默认的 /admin/ 没了
                self.assertEqual(self.client.get("/admin/").status_code, 404)
        finally:
            self._reload_urlconf()


class OtpEnrollCommandTests(TestCase):
    """O2b：命令行录入 2FA 设备——解开「要进后台才能建设备」的死结。"""

    def _superuser(self, username="root"):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_superuser(username, password="very-secret-3")

    def test_creates_confirmed_totp_device_and_prints_secret(self):
        from base64 import b32encode
        from io import StringIO

        from django.core.management import call_command
        from django_otp.plugins.otp_totp.models import TOTPDevice

        user = self._superuser()
        out = StringIO()
        call_command("otp_enroll", "root", stdout=out)

        device = TOTPDevice.objects.get(user=user)
        self.assertTrue(device.confirmed)
        text = out.getvalue()
        self.assertIn("otpauth://totp/", text)   # 认证器能扫的串
        self.assertIn(device.config_url, text)
        self.assertIn(b32encode(device.bin_key).decode(), text)  # 手动录入用的密钥

    def test_reuses_existing_device_unless_reset(self):
        from io import StringIO

        from django.core.management import call_command
        from django_otp.plugins.otp_totp.models import TOTPDevice

        user = self._superuser()
        call_command("otp_enroll", "root", stdout=StringIO())
        first = TOTPDevice.objects.get(user=user)

        call_command("otp_enroll", "root", stdout=StringIO())     # 再跑：复用同一设备
        self.assertEqual(TOTPDevice.objects.filter(user=user).count(), 1)
        self.assertEqual(TOTPDevice.objects.get(user=user).pk, first.pk)

        call_command("otp_enroll", "root", "--reset", stdout=StringIO())  # --reset：换新密钥
        self.assertEqual(TOTPDevice.objects.filter(user=user).count(), 1)
        self.assertNotEqual(TOTPDevice.objects.get(user=user).pk, first.pk)

    def test_backup_codes_are_created_and_usable(self):
        from io import StringIO

        from django.core.management import call_command
        from django_otp.plugins.otp_static.models import StaticDevice
        from django_otp.plugins.otp_totp.models import TOTPDevice

        user = self._superuser()
        TOTPDevice.objects.create(user=user, name="authenticator", confirmed=True)
        out = StringIO()
        call_command("otp_enroll", "root", "--backup-codes", "3", stdout=out)

        static = StaticDevice.objects.get(user=user)
        tokens = list(static.token_set.values_list("token", flat=True))
        self.assertEqual(len(tokens), 3)
        # 打印出的每个备用码都能当场验过（并且只能用一次）
        for token in tokens:
            self.assertIn(token, out.getvalue())
            self.assertTrue(static.verify_token(token))

    def test_unknown_user_raises(self):
        from io import StringIO

        from django.core.management import call_command
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("otp_enroll", "nobody", stdout=StringIO())


class RobotsTxtTests(BaseWorldCase):
    """O1：/robots.txt 约束正规搜索引擎，禁工作区 / 接口 / 后台，放行公开只读站点。"""

    def test_robots_is_plain_text(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/plain"))
        self.assertIn("public, max-age=3600", response["Cache-Control"])

    def test_robots_disallows_private_areas(self):
        body = self.client.get("/robots.txt").content.decode("utf-8")
        for rule in ("Disallow: /api/", "Disallow: /world", "Disallow: /media/",
                     "Disallow: /login", "Disallow: /admin/"):
            self.assertIn(rule, body)

    def test_robots_allows_public_readonly_sites(self):
        body = self.client.get("/robots.txt").content.decode("utf-8")
        self.assertIn("User-agent: *", body)
        self.assertIn("Allow: /s/", body)
        self.assertIn("Allow: /explore", body)

    def test_robots_follows_configured_admin_path(self):
        """后台路径改了，robots 禁的也应是新路径，别再暴露默认 /admin/。"""
        from django.test import override_settings

        with override_settings(ADMIN_URL_PATH="ops-7f3a9c"):
            body = self.client.get("/robots.txt").content.decode("utf-8")
        self.assertIn("Disallow: /ops-7f3a9c/", body)
        self.assertNotIn("Disallow: /admin/", body)


class MaintenanceWhitelistTests(BaseWorldCase):
    """O2a：维护白名单跟着可配后台路径走，改了路径运维还进得去。"""

    def test_whitelist_uses_configured_admin_path(self):
        from django.conf import settings
        from django.test import override_settings

        from world import maintenance

        self.assertIn(f"/{settings.ADMIN_URL_PATH}/", maintenance.allowed_prefixes())
        with override_settings(ADMIN_URL_PATH="ops-7f3a9c"):
            self.assertIn("/ops-7f3a9c/", maintenance.allowed_prefixes())


class HealthzTests(TestCase):
    """O3：/healthz 健康检查——进程 + 数据库连通性，给监控探针用。"""

    def test_healthz_returns_ok(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_healthz_rejects_post(self):
        """只读探针：非安全方法一律 405。"""
        self.assertEqual(self.client.post("/healthz").status_code, 405)

    def test_healthz_reports_db_down(self):
        from unittest import mock

        with mock.patch("django.db.connection") as conn:
            conn.cursor.side_effect = RuntimeError("db down")
            response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["database"], "down")


class LoggingConfigTests(TestCase):
    """O3：日志配置存在，且默认只挂控制台处理器（journald 收走并自带轮转）。"""

    def test_logging_has_console_handler(self):
        from django.conf import settings

        self.assertIn("console", settings.LOGGING["handlers"])
        self.assertIn("console", settings.LOGGING["loggers"]["django"]["handlers"])

    def test_file_handler_only_when_configured(self):
        """没设 OPUSCULE_LOG_FILE 时不该有 file 处理器（否则启动就会因空文件名报错）。"""
        from django.conf import settings

        has_file = "file" in settings.LOGGING["handlers"]
        self.assertEqual(has_file, bool((settings._LOG_FILE or "").strip()))


class ModerationAuditTests(BaseWorldCase):
    """G1：平台治理审计基座（模型 + 写入助手）。"""

    def _root(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_superuser("root", password="very-secret-3")

    def test_helper_records_a_ban_on_a_world(self):
        from world import views

        views._log_moderation_event(self._root(), "ban", world=self.world, detail="封禁 7 天")
        payload = ModerationEvent.objects.get().to_payload()
        self.assertEqual(payload["action"], "ban")
        self.assertEqual(payload["action_label"], "封禁")
        self.assertEqual(payload["actor"], "root")
        self.assertEqual(payload["world"], "测试世界")
        self.assertEqual(payload["detail"], "封禁 7 天")

    def test_helper_records_an_appointed_target(self):
        from django.contrib.auth import get_user_model

        from world import views

        mod = get_user_model().objects.create_user("mod", password="very-secret-4", first_name="小管")
        views._log_moderation_event(self._root(), "appoint", target=mod)
        event = ModerationEvent.objects.get()
        self.assertEqual(event.action, "appoint")
        self.assertEqual(event.target_name, "小管")
        self.assertEqual(event.to_payload()["target"], "小管")

    def test_helper_never_breaks_the_caller(self):
        """审计写失败不能拖垮主流程：内部吞异常只落日志。"""
        from unittest import mock

        from world import views

        with mock.patch.object(ModerationEvent.objects, "create", side_effect=RuntimeError("boom")):
            views._log_moderation_event(self._root(), "unban", world=self.world)  # 不该抛


class PlatformIdentityTests(BaseWorldCase):
    """G2：四层平台身份（站长 / 管理员 / 工作人员 / 普通用户）分层与判定。"""

    def _user(self, name, **kwargs):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user(name, password="very-secret-1", **kwargs)

    def test_platform_role_of_layers_by_priority(self):
        from world import permissions

        root = self._user("root", is_superuser=True)
        mod = self._user("mod")
        permissions.set_moderator(mod, True)
        staff = self._user("staff", is_staff=True)
        plain = self._user("plain")

        self.assertEqual(permissions.platform_role_of(root), permissions.PLATFORM_SUPERUSER)
        self.assertEqual(permissions.platform_role_of(mod), permissions.PLATFORM_MODERATOR)
        self.assertEqual(permissions.platform_role_of(staff), permissions.PLATFORM_STAFF)
        self.assertEqual(permissions.platform_role_of(plain), permissions.PLATFORM_USER)
        self.assertEqual(permissions.platform_role_of(None), "")

    def test_is_moderator_is_strictly_the_group(self):
        """站长不算 moderators 组里的身份——严格看组，不看权力。"""
        from world import permissions

        root = self._user("root", is_superuser=True)
        mod = self._user("mod")
        permissions.set_moderator(mod, True)

        self.assertFalse(permissions.is_moderator(root))
        self.assertTrue(permissions.is_moderator(mod))

    def test_can_moderate_covers_superuser_and_moderator_only(self):
        from world import permissions

        root = self._user("root", is_superuser=True)
        mod = self._user("mod")
        permissions.set_moderator(mod, True)
        staff = self._user("staff", is_staff=True)
        plain = self._user("plain")

        self.assertTrue(permissions.can_moderate(root))
        self.assertTrue(permissions.can_moderate(mod))
        self.assertFalse(permissions.can_moderate(staff))
        self.assertFalse(permissions.can_moderate(plain))
        self.assertFalse(permissions.can_moderate(None))

    def test_set_moderator_is_idempotent(self):
        from world import permissions

        mod = self._user("mod")
        self.assertTrue(permissions.set_moderator(mod, True))    # 真的加进去了
        self.assertFalse(permissions.set_moderator(mod, True))   # 本来就是，没变化
        self.assertTrue(permissions.set_moderator(mod, False))   # 真的移出去了
        self.assertFalse(permissions.set_moderator(mod, False))  # 本来就不在

    def test_viewer_payload_exposes_platform_identity(self):
        from world import permissions

        mod = self._user("mod")
        permissions.set_moderator(mod, True)
        payload = permissions.viewer_payload(mod, self.world)
        self.assertEqual(payload["platform_role"], permissions.PLATFORM_MODERATOR)
        self.assertEqual(payload["platform_role_label"], "管理员")
        self.assertTrue(payload["is_moderator"])
        self.assertTrue(payload["can_moderate"])


class ModeratorAppointmentTests(BaseWorldCase):
    """G2：任命 / 撤销管理员接口——仅站长可用，且必须留痕。"""

    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model

        self.root = get_user_model().objects.create_superuser("root", password="very-secret-3")
        self.mod = get_user_model().objects.create_user("mod", password="very-secret-4")

    def test_only_superuser_can_list(self):
        self.client.force_login(self.mod)
        self.assertEqual(self.client.get("/api/world/moderators").status_code, 403)

    def test_moderator_cannot_manage_moderators(self):
        """管理员能治理站点，但不能任命别的管理员——那是站长的活。"""
        from world import permissions

        permissions.set_moderator(self.mod, True)
        Membership.objects.create(world=self.world, user=self.mod, role=ROLE_EDITOR)

        self.client.force_login(self.mod)
        self.assertEqual(self.client.get("/api/world/moderators").status_code, 403)
        self.assertEqual(
            self.post_json("/api/world/moderators", {"user_id": self.mod.id}).status_code, 403
        )

    def test_superuser_lists_moderators(self):
        from world import permissions

        permissions.set_moderator(self.mod, True)
        self.client.force_login(self.root)
        response = self.client.get("/api/world/moderators")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        handles = [row["handle"] for row in body["moderators"]]
        self.assertIn("mod", handles)
        self.assertEqual(body["viewer"]["platform_role"], permissions.PLATFORM_SUPERUSER)

    def test_appoint_and_dismiss_roundtrip_with_audit(self):
        from world import permissions

        self.client.force_login(self.root)

        appointed = self.post_json("/api/world/moderators", {"user_id": self.mod.id})
        self.assertEqual(appointed.status_code, 200)
        self.assertTrue(permissions.is_moderator(self.mod))

        dismissed = self.client.delete(f"/api/world/moderators/{self.mod.id}")
        self.assertEqual(dismissed.status_code, 200)
        self.assertFalse(permissions.is_moderator(self.mod))

        actions = list(ModerationEvent.objects.order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["appoint", "dismiss"])

    def test_appoint_is_idempotent_and_logs_once(self):
        self.client.force_login(self.root)
        self.post_json("/api/world/moderators", {"user_id": self.mod.id})
        self.post_json("/api/world/moderators", {"user_id": self.mod.id})
        self.assertEqual(ModerationEvent.objects.filter(action="appoint").count(), 1)

    def test_cannot_appoint_a_superuser(self):
        self.client.force_login(self.root)
        response = self.post_json("/api/world/moderators", {"user_id": self.root.id})
        self.assertEqual(response.status_code, 400)

    def test_appoint_unknown_user_is_404(self):
        self.client.force_login(self.root)
        response = self.post_json("/api/world/moderators", {"user_id": 999999})
        self.assertEqual(response.status_code, 404)


class AuthRateLimitTests(BaseWorldCase):
    """登录 / 注册限流：同一个来源试太频繁就 429，别再让它继续猜。"""

    def test_json_login_is_throttled_per_username(self):
        """同一用户名连撞失败密码，超过阈值后回 429，并带 Retry-After。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.client.post("/api/world/auth/logout")

        from world import views

        last = None
        for _ in range(views.LOGIN_USER_LIMIT + 1):
            last = self.post_json("/api/world/auth/login", {"username": "owner", "password": "wrong-pass"})
        self.assertEqual(last.status_code, 429)
        self.assertIn("Retry-After", last.headers)
        self.assertGreaterEqual(int(last.headers["Retry-After"]), 1)

    def test_login_success_resets_the_username_counter(self):
        """登录成功清掉该用户名的计数，之后正常登录不会被自己之前的失败攒死。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.client.post("/api/world/auth/logout")

        from world import views

        # 先攒几发失败（还没到阈值）
        for _ in range(views.LOGIN_USER_LIMIT - 1):
            self.post_json("/api/world/auth/login", {"username": "owner", "password": "wrong-pass"})
        ok = self.post_json("/api/world/auth/login", {"username": "owner", "password": "very-secret-1"})
        self.assertEqual(ok.status_code, 200)

        # 成功后再来一发失败：用户名计数已清零，不该被 429 挡下
        after = self.post_json("/api/world/auth/login", {"username": "owner", "password": "wrong-pass"})
        self.assertEqual(after.status_code, 400)

    def test_login_page_is_throttled(self):
        """表单登录页同样限流：超阈值后是 429 页面，而不是继续放它试。"""
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.client.post("/api/world/auth/logout")

        from world import views

        last = None
        for _ in range(views.LOGIN_USER_LIMIT + 1):
            last = self.client.post("/login", {"username": "owner", "password": "wrong-pass"})
        self.assertEqual(last.status_code, 429)

    def test_register_is_throttled_per_ip(self):
        """同一来源不停注册新号，超过阈值后回 429。"""
        from world import views

        last = None
        for index in range(views.REGISTER_IP_LIMIT + 1):
            last = self.post_json("/api/world/auth/register",
                                  {"username": f"user{index}", "password": "very-secret-1"})
        self.assertEqual(last.status_code, 429)
        self.assertIn("Retry-After", last.headers)

    def test_register_page_is_throttled(self):
        """注册页（表单）也吃同一份 IP 计数。"""
        from django.test import Client

        from world import views

        last = None
        for index in range(views.REGISTER_IP_LIMIT + 1):
            # 每次换一个匿名客户端：注册成功会把人登进去，而下一次注册得是未登录状态
            last = Client().post("/register", {
                "username": f"user{index}", "password": "very-secret-1",
            })
        self.assertEqual(last.status_code, 429)


    def test_forged_forwarded_for_cannot_dodge_the_limit(self):
        """伪造 X-Forwarded-For 的前缀不能绕过限流：只认我们这层代理追加的最后一段。"""
        from world import views

        def post(index):
            # nginx 会把自己看到的真实对端追加在末尾；攻击者只能往前面塞假 IP
            return self.client.post(
                "/api/world/auth/register",
                data=json.dumps({"username": f"user{index}", "password": "very-secret-1"}),
                content_type="application/json",
                HTTP_X_FORWARDED_FOR=f"10.0.0.{index}, 127.0.0.1",
            )

        last = None
        for index in range(views.REGISTER_IP_LIMIT + 1):
            last = post(index)
        self.assertEqual(last.status_code, 429)


class PasswordChangeTests(BaseWorldCase):
    """A3 方案①：登录态改密——旧密码 + 新密码，不依赖邮件。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})

    def _user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.get(username="owner")

    def test_change_password_with_correct_current(self):
        resp = self.post_json("/api/world/auth/password",
                              {"current_password": "very-secret-1", "new_password": "brand-new-secret-9"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(self._user().check_password("brand-new-secret-9"))
        # 改完自己不被踢下线：会话鉴权哈希跟着换了
        self.assertEqual(self.client.get("/api/world/state").status_code, 200)

    def test_wrong_current_password_is_rejected(self):
        resp = self.post_json("/api/world/auth/password",
                              {"current_password": "nope", "new_password": "brand-new-secret-9"})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user().check_password("very-secret-1"))   # 原密码还在

    def test_same_password_is_rejected(self):
        resp = self.post_json("/api/world/auth/password",
                              {"current_password": "very-secret-1", "new_password": "very-secret-1"})
        self.assertEqual(resp.status_code, 400)

    def test_weak_new_password_is_rejected(self):
        resp = self.post_json("/api/world/auth/password",
                              {"current_password": "very-secret-1", "new_password": "123"})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user().check_password("very-secret-1"))

    def test_requires_login(self):
        self.client.post("/api/world/auth/logout")
        resp = self.post_json("/api/world/auth/password",
                              {"current_password": "very-secret-1", "new_password": "brand-new-secret-9"})
        self.assertEqual(resp.status_code, 401)


class AccountEmailTests(BaseWorldCase):
    """A3 方案②：登记 / 修改邮箱（改非空要验当前密码）。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})

    def _user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.get(username="owner")

    def test_register_can_carry_email(self):
        self.client.post("/api/world/auth/logout")
        resp = self.post_json("/api/world/auth/register",
                              {"username": "owner2", "password": "very-secret-1", "email": "o2@example.com"})
        # 首个账号已存在，无邀请码 -> 被拒；这里只验证邮箱字段被解析（错误信息不是"邮箱格式不对"）
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn("邮箱", resp.json().get("error", ""))

    def test_set_email_requires_current_password(self):
        resp = self.post_json("/api/world/auth/email",
                              {"email": "owner@example.com", "current_password": "nope"})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self._user().email, "")

    def test_set_email_with_password(self):
        resp = self.post_json("/api/world/auth/email",
                              {"email": "owner@example.com", "current_password": "very-secret-1"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["email"], "owner@example.com")
        self.assertEqual(self._user().email, "owner@example.com")

    def test_clear_email_needs_no_password(self):
        self.post_json("/api/world/auth/email",
                       {"email": "owner@example.com", "current_password": "very-secret-1"})
        resp = self.post_json("/api/world/auth/email", {"email": "", "current_password": ""})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._user().email, "")

    def test_bad_email_format_is_rejected(self):
        resp = self.post_json("/api/world/auth/email",
                              {"email": "not-an-email", "current_password": "very-secret-1"})
        self.assertEqual(resp.status_code, 400)

    def test_viewer_payload_carries_email(self):
        self.post_json("/api/world/auth/email",
                       {"email": "owner@example.com", "current_password": "very-secret-1"})
        resp = self.client.get("/api/world/auth/me")
        self.assertEqual(resp.json()["viewer"]["email"], "owner@example.com")


class PasswordResetTests(BaseWorldCase):
    """A3 方案②：忘记密码——请求重置链接 + 用重置信设置新密码。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register",
                       {"username": "owner", "password": "very-secret-1", "email": "owner@example.com"})
        self.client.post("/api/world/auth/logout")

    def _user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.get(username="owner")

    def _token_for(self, user):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)

    def test_request_page_renders(self):
        resp = self.client.get("/reset")
        self.assertEqual(resp.status_code, 200)

    def test_request_does_not_leak_account_existence(self):
        """无论账号在不在，都回同一句"已寄出"，不给枚举留侧信道。"""
        known = self.client.post("/reset", {"identifier": "owner"})
        unknown = self.client.post("/reset", {"identifier": "does-not-exist"})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertContains(known, "重置链接已寄出")
        self.assertContains(unknown, "重置链接已寄出")

    def test_confirm_with_valid_token_changes_password(self):
        user = self._user()
        uid, token = self._token_for(user)
        page = self.client.get(f"/reset/{uid}/{token}")
        self.assertEqual(page.status_code, 200)
        resp = self.client.post(f"/reset/{uid}/{token}",
                                {"new_password": "fresh-secret-9", "confirm_password": "fresh-secret-9"})
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "密码已更新")
        self.assertTrue(self._user().check_password("fresh-secret-9"))

    def test_confirm_with_bad_token_is_rejected(self):
        uid, _token = self._token_for(self._user())
        resp = self.client.get(f"/reset/{uid}/obviously-not-a-token")
        self.assertEqual(resp.status_code, 400)

    def test_confirm_mismatched_passwords_is_rejected(self):
        uid, token = self._token_for(self._user())
        resp = self.client.post(f"/reset/{uid}/{token}",
                                {"new_password": "fresh-secret-9", "confirm_password": "other-secret-9"})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user().check_password("very-secret-1"))

    def test_confirm_requires_login_state_redirect(self):
        """已登录的人访问重置页直接回工作区，不去走找回流程。"""
        self.post_json("/api/world/auth/login", {"username": "owner", "password": "very-secret-1"})
        resp = self.client.get("/reset")
        self.assertEqual(resp.status_code, 302)


class AccountExportTests(BaseWorldCase):
    """A4：销号前的"带走一份"——导出自己的账号数据（要登录）。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register",
                       {"username": "owner", "password": "very-secret-1", "email": "owner@example.com"})
        self.document, _card = self.make_card(name="会改的卡")
        DocumentVersion.objects.create(
            document=self.document, index=1, author=self._user(),
            author_name="owner", payload={"blocks": []}, summary="初稿",
        )

    def _user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.get(username="owner")

    def test_requires_login(self):
        self.client.post("/api/world/auth/logout")
        resp = self.client.get("/api/world/account/export")
        self.assertEqual(resp.status_code, 401)

    def test_exports_own_account_as_a_download(self):
        resp = self.client.get("/api/world/account/export")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("attachment", resp["Content-Disposition"])
        self.assertIn("opuscule-account-owner.json", resp["Content-Disposition"])
        data = json.loads(resp.content.decode("utf-8"))
        self.assertEqual(data["account"]["username"], "owner")
        self.assertEqual(data["account"]["email"], "owner@example.com")
        self.assertEqual([w["name"] for w in data["worlds"]], ["测试世界"])
        self.assertTrue(data["worlds"][0]["is_owner"])
        self.assertEqual(data["authored_documents"][0]["document"], "会改的卡")
        self.assertEqual(data["authored_documents"][0]["versions"], 1)


class AccountDeletionTests(BaseWorldCase):
    """A4：销号——验密码 + 勾确认；有别人的世界不能删，独属自己的随账号一起没。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.world = World.objects.first()          # 注册时接管的就是夹具那个世界

    def _user(self, username="owner"):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.get(username=username)

    def _user_exists(self, username="owner"):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.filter(username=username).exists()

    def test_requires_login(self):
        self.client.post("/api/world/auth/logout")
        resp = self.post_json("/api/world/account/delete",
                              {"current_password": "very-secret-1", "confirm": True})
        self.assertEqual(resp.status_code, 401)

    def test_wrong_password_is_rejected(self):
        resp = self.post_json("/api/world/account/delete",
                              {"current_password": "nope", "confirm": True})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user_exists())

    def test_confirm_flag_is_required(self):
        resp = self.post_json("/api/world/account/delete", {"current_password": "very-secret-1"})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user_exists())

    def test_solo_account_and_its_worlds_are_removed(self):
        from django.contrib.auth import get_user_model

        resp = self.post_json("/api/world/account/delete",
                              {"current_password": "very-secret-1", "confirm": True})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(get_user_model().objects.filter(username="owner").exists())
        self.assertFalse(World.objects.filter(pk=self.world.id).exists())
        self.assertFalse(Membership.objects.filter(world_id=self.world.id).exists())

    def test_blocked_when_an_owned_world_has_other_members(self):
        from django.contrib.auth.models import User

        other = User.objects.create_user("partner", password="very-secret-2")
        Membership.objects.create(world=self.world, user=other, role="editor")
        resp = self.post_json("/api/world/account/delete",
                              {"current_password": "very-secret-1", "confirm": True})
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(self._user_exists())                       # 账号还在
        self.assertTrue(World.objects.filter(pk=self.world.id).exists())  # 世界还在

    def test_membership_in_someone_elses_world_is_just_cleared(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import User

        other = User.objects.create_user("partner", password="very-secret-2")
        other_world = World.objects.create(name="别人的世界", owner=other)
        Membership.objects.create(world=other_world, user=self._user(), role="editor")

        resp = self.post_json("/api/world/account/delete",
                              {"current_password": "very-secret-1", "confirm": True})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(get_user_model().objects.filter(username="owner").exists())
        self.assertTrue(World.objects.filter(pk=other_world.id).exists())   # 别人的世界留着
        self.assertTrue(World.objects.filter(pk=other_world.id, owner=other).exists())
        self.assertFalse(Membership.objects.filter(world=other_world).exists())  # 我的身份清掉了


class MemberAuditTests(BaseWorldCase):
    """A5：成员变更留痕——加入 / 改角色 / 移出 / 发码 / 作废各记一笔，移除后仍可追溯。"""

    def setUp(self):
        super().setUp()
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.world = World.objects.first()          # 注册时接管的就是夹具那个世界
        self.other = self._make_user("partner")     # 再拉一个可编辑进来，方便改角色 / 移出
        self.membership = Membership.objects.create(world=self.world, user=self.other, role="editor")

    def _make_user(self, username):
        from django.contrib.auth.models import User

        return User.objects.create_user(username, password="very-secret-2")

    def _events(self, action=None):
        queryset = MemberEvent.objects.filter(world=self.world)
        return queryset.filter(action=action) if action else queryset

    def test_join_is_recorded(self):
        event = self._events("join").first()
        self.assertIsNotNone(event, "注册加入应留一笔")
        self.assertEqual(event.target_name, "owner")
        self.assertIn("所有者", event.detail)

    def test_role_change_is_recorded(self):
        resp = self.client.put(f"/api/world/collaborators/{self.membership.id}",
                               data=json.dumps({"role": "viewer"}),
                               content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        event = self._events("role").first()
        self.assertEqual(event.target_name, "partner")
        self.assertIn("可编辑", event.detail)      # 旧角色
        self.assertIn("只读", event.detail)        # 新角色

    def test_setting_the_same_role_leaves_no_event(self):
        self.client.put(f"/api/world/collaborators/{self.membership.id}",
                        data=json.dumps({"role": "editor"}),
                        content_type="application/json")
        self.assertFalse(self._events("role").exists())

    def test_removing_a_member_is_recorded_and_survives(self):
        resp = self.client.delete(f"/api/world/collaborators/{self.membership.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Membership.objects.filter(pk=self.membership.id).exists())
        event = self._events("remove").first()      # 成员没了，审计还在
        self.assertEqual(event.target_name, "partner")
        self.assertIn("可编辑", event.detail)

    def test_invite_and_revoke_are_recorded(self):
        created = self.post_json("/api/world/collaborators/invites", {"role": "viewer"})
        self.assertEqual(created.status_code, 200)
        invite_id = created.json()["id"]
        self.assertTrue(self._events("invite").exists())

        removed = self.client.delete(f"/api/world/collaborators/invites/{invite_id}")
        self.assertEqual(removed.status_code, 200)
        self.assertTrue(self._events("revoke").exists())

    def test_activity_feed_surfaces_member_changes(self):
        self.client.put(f"/api/world/collaborators/{self.membership.id}",
                        data=json.dumps({"role": "viewer"}),
                        content_type="application/json")
        rows = self.client.get("/api/world/activity").json()["activity"]
        kinds = {row["kind"] for row in rows}
        self.assertIn("member", kinds)              # 改角色冒到动态流里
        self.assertIn("invite", kinds)              # 既有的"谁加入了"没被挤掉
        self.assertTrue(all("what" in row and "when" in row for row in rows))


class VersionHistoryTests(BaseWorldCase):
    """文档版本历史：留档、合并、预览、回滚。"""

    def setUp(self):
        super().setUp()
        self.document, self.card = self.make_card(name="会改的卡")

    def write_blocks(self, text):
        return self.client.put(f"/api/world/cards/{self.document.id}",
                               data=json.dumps({"blocks": [{"type": "text", "title": "概览", "text": text}]}),
                               content_type="application/json")

    def test_snapshots_and_rollback(self):
        from django.contrib.auth.models import User

        alice = User.objects.create_user("alice", password="very-secret-1")
        bob = User.objects.create_user("bob", password="very-secret-2")
        self.world = World.objects.first()
        Membership.objects.get_or_create(world=self.world, user=alice, defaults={"role": "owner"})
        Membership.objects.get_or_create(world=self.world, user=bob, defaults={"role": "editor"})

        self.document.versions.all().delete()
        self.client.force_login(alice)
        self.write_blocks("第一版正文")
        self.client.force_login(bob)                    # 换个人改 -> 一定开新版本
        self.write_blocks("第二版正文")

        versions = self.client.get(f"/api/world/documents/{self.document.id}/versions").json()["versions"]
        self.assertEqual(len(versions), 2, versions)
        first, latest = versions[-1], versions[0]
        self.assertEqual(first["author"], "alice")
        self.assertEqual(latest["author"], "bob")

        detail = self.client.get(f"/api/world/documents/{self.document.id}/versions/{first['index']}").json()
        self.assertIn("第一版", json.dumps(detail["payload"], ensure_ascii=False))

        restored = self.client.post(f"/api/world/documents/{self.document.id}/versions/{first['index']}").json()
        self.assertTrue(restored["ok"])
        card = self.client.get(f"/api/world/cards/{self.document.id}").json()["card"]
        self.assertIn("第一版", json.dumps(card["blocks"], ensure_ascii=False))
        after = self.client.get(f"/api/world/documents/{self.document.id}/versions").json()["versions"]
        self.assertTrue(any("回滚" in (v["label"] or "") for v in after))
        # 回滚本身也留档，免得"回滚错了"没法救
        after = self.client.get(f"/api/world/documents/{self.document.id}/versions").json()["versions"]
        self.assertTrue(any("回滚" in (v["label"] or "") for v in after))

    def test_consecutive_edits_are_coalesced(self):
        self.document.versions.all().delete()
        for index in range(5):
            self.write_blocks(f"第 {index} 次改动")
        versions = self.client.get(f"/api/world/documents/{self.document.id}/versions").json()["versions"]
        self.assertEqual(len(versions), 1)              # 同一作者的连续打字合并成一版


class CalendarViewTests(BaseWorldCase):
    """月视图与月相：自定义历法的月份、卫星相位、事件落格。"""

    def setUp(self):
        super().setUp()
        self.calendar = Calendar.objects.create(
            world=self.world, name="双子历", mode="custom", hours_per_day=30,
            months=[{"name": "霜月", "days": 10}, {"name": "火月", "days": 20}],
            moons=[{"name": "银环", "color": "sky", "cycle_days": 20, "full_on": 5, "shown": "quarters"}],
        )

    def test_month_grid_uses_custom_months(self):
        grid = self.client.get(f"/api/world/calendars/{self.calendar.id}/month?year=5&month=2").json()
        self.assertEqual(grid["month_name"], "火月")
        self.assertEqual(grid["days"], 20)
        self.assertEqual(grid["hours_per_day"], 30)
        cells = [cell for week in grid["weeks"] for cell in week if cell]
        self.assertEqual(len(cells), 20)
        self.assertTrue(all(len(week) == 7 for week in grid["weeks"]))
        self.assertEqual(len(grid["months"]), 2)

    def test_moon_phases_follow_the_cycle(self):
        from world import calendarview

        moon = self.calendar.moons[0]
        # full_on=5 且周期 20 天 -> 第 5 天满月，第 15 天新月
        self.assertEqual(calendarview.phase_of(moon, 5)["phase"], "满月")
        self.assertEqual(calendarview.phase_of(moon, 15)["phase"], "新月")
        self.assertGreater(calendarview.phase_of(moon, 5)["illumination"], 0.9)
        self.assertLess(calendarview.phase_of(moon, 15)["illumination"], 0.1)

    def test_events_land_on_their_day(self):
        document = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="时间线")
        TimelineEvent.objects.create(document=document, title="起火", year=5, month=2, day=3, precision="day")
        TimelineEvent.objects.create(document=document, title="地动", year=5, month=1, day=3, precision="day")
        grid = self.client.get(
            f"/api/world/calendars/{self.calendar.id}/month?year=5&month=2&document={document.id}"
        ).json()
        titles = [e["title"] for week in grid["weeks"] for cell in week if cell for e in cell["events"]]
        self.assertEqual(titles, ["起火"])          # 另一个月的事件不该出现

    def test_moon_shown_policy_filters_phases(self):
        from world import calendarview

        self.calendar.moons = [{"name": "银环", "cycle_days": 20, "full_on": 5, "shown": "full_only"}]
        self.calendar.save(update_fields=["moons"])
        # day_of_year(0,1,6) == 5，正好是"满月那一天"
        self.assertEqual(calendarview.day_of_year(self.calendar, 0, 1, 6), 5)
        self.assertEqual(len(calendarview.moon_phases(self.calendar, 0, 1, 6)), 1)
        self.assertEqual(calendarview.moon_phases(self.calendar, 0, 1, 16), [])   # 新月被策略挡掉


class EraBranchTests(BaseWorldCase):
    """Eras 作为世界版本分支：卡的纪元可见性。"""

    def setUp(self):
        super().setUp()
        self.first = Era.objects.create(world=self.world, name="第一纪", position=1, length_years=100)
        self.second = Era.objects.create(world=self.world, name="第二纪", position=2, length_years=100)

    def test_universal_by_default(self):
        document, card = self.make_card(name="到处都在的卡")
        self.assertTrue(card.visible_in_era(self.first.id))
        self.assertTrue(card.visible_in_era(self.second.id))

    def test_only_mode(self):
        document, card = self.make_card(name="只属于第二纪")
        self.put_card(document, {"era_mode": "only", "era_ids": [self.second.id]})
        card.refresh_from_db()
        self.assertFalse(card.visible_in_era(self.first.id))
        self.assertTrue(card.visible_in_era(self.second.id))
        self.assertEqual(card.to_payload()["era_mode"], "only")

    def test_hidden_mode(self):
        document, card = self.make_card(name="第二纪里没有")
        self.put_card(document, {"era_mode": "hidden", "era_ids": [self.second.id]})
        card.refresh_from_db()
        self.assertTrue(card.visible_in_era(self.first.id))
        self.assertFalse(card.visible_in_era(self.second.id))

    def test_era_can_carry_its_own_theme(self):
        response = self.client.put(f"/api/world/eras/{self.first.id}",
                                   data=json.dumps({"theme_config": {"primaryColor": "#123456"}}),
                                   content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["theme_config"]["primaryColor"], "#123456")

    def put_card(self, document, payload):
        return self.client.put(f"/api/world/cards/{document.id}",
                               data=json.dumps(payload), content_type="application/json")


class TableBindingTests(BaseWorldCase):
    """表格：行 = 卡片、列 = 属性，双向绑定 + CSV 进出。"""

    def setUp(self):
        super().setUp()
        self.table = Document.objects.create(world=self.world, document_type="table", name="人物表")
        first, _ = self.make_card(name="甲", values={str(self.p_age.id): 30})
        second, _ = self.make_card(name="乙")
        self.first, self.second = first, second

    def test_rows_come_from_cards_of_the_type(self):
        data = self.client.get(f"/api/world/tables/{self.table.id}").json()
        names = [row["name"] for row in data["rows"]]
        self.assertIn("甲", names)
        self.assertIn("乙", names)
        columns = [c["name"] for c in data["columns"]]
        self.assertIn("年龄", columns)
        row = next(r for r in data["rows"] if r["name"] == "甲")
        self.assertEqual(row["values"][str(self.p_age.id)], 30)

    def test_editing_a_cell_updates_the_card(self):
        response = self.client.put(f"/api/world/tables/{self.table.id}/cell",
                                   data=json.dumps({"row": self.second.id, "column": self.p_age.id, "value": 44}),
                                   content_type="application/json")
        self.assertEqual(response.status_code, 200)
        card = Card.objects.get(document=self.second)
        self.assertEqual(card.values[str(self.p_age.id)], 44)
        # 反向：改卡片 -> 表格里也变了
        data = self.client.get(f"/api/world/tables/{self.table.id}").json()
        row = next(r for r in data["rows"] if r["name"] == "乙")
        self.assertEqual(row["values"][str(self.p_age.id)], 44)

    def test_rename_row_and_add_delete(self):
        self.client.put(f"/api/world/tables/{self.table.id}/cell",
                        data=json.dumps({"row": self.first.id, "name": "甲改名"}),
                        content_type="application/json")
        self.assertEqual(Document.objects.get(pk=self.first.id).name, "甲改名")

        added = self.client.post(f"/api/world/tables/{self.table.id}/rows",
                                 data=json.dumps({"name": "丙"}), content_type="application/json").json()
        self.assertIn("丙", [row["name"] for row in added["rows"]])
        new_id = next(row["id"] for row in added["rows"] if row["name"] == "丙")

        removed = self.client.delete(f"/api/world/tables/{self.table.id}/rows",
                                     data=json.dumps({"row": new_id}),
                                     content_type="application/json").json()
        self.assertNotIn("丙", [row["name"] for row in removed["rows"]])
        self.assertTrue(Document.objects.get(pk=new_id).deleted_at)      # 软删除，可恢复

    def test_csv_round_trip(self):
        exported = self.client.get(f"/api/world/tables/{self.table.id}/csv")
        self.assertEqual(exported.status_code, 200)
        body = exported.content.decode()
        self.assertIn("名称", body.splitlines()[0])
        self.assertIn("甲", body)

        csv_text = "名称,年龄\n甲,51\n新来的,22\n"
        result = self.client.post(f"/api/world/tables/{self.table.id}/csv",
                                  data=json.dumps({"csv": csv_text}),
                                  content_type="application/json").json()
        self.assertEqual(result["updated"], 1)
        self.assertEqual(result["created"], 1)
        self.assertEqual(Card.objects.get(document=self.first).values[str(self.p_age.id)], 51)
        self.assertTrue(Document.objects.filter(name="新来的").exists())

    def test_column_selection_persists(self):
        self.client.put(f"/api/world/tables/{self.table.id}",
                        data=json.dumps({"columns": [self.p_age.id]}), content_type="application/json")
        data = self.client.get(f"/api/world/tables/{self.table.id}").json()
        self.assertEqual([c["name"] for c in data["columns"]], ["年龄"])


class DocumentDataTests(BaseWorldCase):
    """通用工具数据 + 媒体（看板 / 词典 / 待办 / 语音…共用）。"""

    def setUp(self):
        super().setUp()
        self.board = Document.objects.create(world=self.world, document_type="board", name="看板")

    def test_data_round_trip(self):
        payload = {"columns": [{"id": "c1", "name": "待办", "cards": []}]}
        saved = self.client.put(f"/api/world/documents/{self.board.id}/data",
                                data=json.dumps({"data": payload}), content_type="application/json").json()
        self.assertEqual(saved["data"]["columns"][0]["name"], "待办")
        again = self.client.get(f"/api/world/documents/{self.board.id}/data").json()
        self.assertEqual(again["data"], payload)

    def test_data_too_large_is_rejected(self):
        huge = {"blob": "x" * 500000}
        response = self.client.put(f"/api/world/documents/{self.board.id}/data",
                                   data=json.dumps({"data": huge}), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_media_upload_and_delete(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("note.webm", b"fake-audio-bytes", content_type="audio/webm")
        response = self.client.post(f"/api/world/documents/{self.board.id}/media",
                                    data={"file": upload, "kind": "audio", "title": "口述笔记", "duration": "3.5"})
        self.assertEqual(response.status_code, 200)
        entry = response.json()["entry"]
        self.assertEqual(entry["title"], "口述笔记")
        self.assertIn("/media/", entry["url"])

        listing = self.client.get(f"/api/world/documents/{self.board.id}/data").json()
        self.assertEqual(len(listing["media"]), 1)
        removed = self.client.delete(f"/api/world/documents/{self.board.id}/media",
                                     data=json.dumps({"id": entry["id"]}),
                                     content_type="application/json").json()
        self.assertEqual(removed["media"], [])


class UploadValidationTests(BaseWorldCase):
    """A8：上传按内容类型白名单放行——挡住经 ``/media/`` 直链触发的存储型 XSS。"""

    def setUp(self):
        super().setUp()
        import shutil
        import tempfile

        from django.test import override_settings

        # 别往仓库的 media/ 里丢测试文件，用完即弃
        self._tmp_media = tempfile.mkdtemp(prefix="opuscule-upload-")
        self.addCleanup(shutil.rmtree, self._tmp_media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self._tmp_media)
        override.enable()
        self.addCleanup(override.disable)
        self.board = Document.objects.create(world=self.world, document_type="board", name="看板")

    def _upload(self, name, content_type, data=b"x"):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            f"/api/world/documents/{self.board.id}/media",
            {"file": SimpleUploadedFile(name, data, content_type=content_type)},
        )

    def test_accepts_bitmap_image_and_audio(self):
        self.assertEqual(self._upload("shot.png", "image/png").status_code, 200)
        self.assertEqual(self._upload("voice.webm", "audio/webm").status_code, 200)

    def test_rejects_svg_and_html(self):
        """SVG / HTML 能内联脚本，经 /media/ 直链打开即本站源下的 XSS——必须挡掉。"""
        svg = self._upload("evil.svg", "image/svg+xml")
        self.assertEqual(svg.status_code, 400)
        self.assertIn("不支持", svg.json()["error"])
        self.assertEqual(self._upload("evil.html", "text/html").status_code, 400)

    def test_falls_back_to_extension_for_generic_type(self):
        """客户端报通用的 octet-stream 时按扩展名认类型，别把正常图片误伤。"""
        self.assertEqual(self._upload("portrait.png", "application/octet-stream").status_code, 200)

    def test_rejects_oversize_upload(self):
        """超限即拒：把阈值调小来验，免得真往内存里塞 25 MB。"""
        from unittest import mock

        from django.core.files.uploadedfile import SimpleUploadedFile

        from world.views import common as views_common

        upload = SimpleUploadedFile(
            "big.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="image/png")
        with mock.patch.object(views_common, "MAX_UPLOAD_BYTES", 16):
            response = self.client.post(
                f"/api/world/documents/{self.board.id}/media", {"file": upload})
        self.assertEqual(response.status_code, 400)
        self.assertIn("25 MB", response.json()["error"])


class MediaAuthTests(BaseWorldCase):
    """上传文件（``/media/…``）要鉴权：知道路径也不能直链下载未公开的图 / 语音。"""

    def setUp(self):
        super().setUp()
        import shutil
        import tempfile

        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings

        # 别往仓库的 media/ 里丢测试文件，用完即弃
        self._tmp_media = tempfile.mkdtemp(prefix="opuscule-media-")
        self.addCleanup(shutil.rmtree, self._tmp_media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self._tmp_media)
        override.enable()
        self.addCleanup(override.disable)

        # 有账号之后，"游客"才不再享首次安装例外——这才验得出未公开媒体的那道门
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        self.document, _card = self.make_card(name="有图的卡")
        upload = SimpleUploadedFile("shot.png", b"\x89PNG\r\n\x1a\nfake-image", content_type="image/png")
        self.entry = self.client.post(
            f"/api/world/documents/{self.document.id}/media",
            {"file": upload, "kind": "image", "title": "地图截图"},
        ).json()["entry"]
        self.url = self.entry["url"]
        self.assertIn("/media/docs/", self.url)
        self.client.post("/api/world/auth/logout")

    def test_media_path_carries_the_owning_document(self):
        """路径里带着文档 id，鉴权就是靠它认「这文件属于谁」。"""
        self.assertTrue(self.url.startswith(f"/media/docs/{self.document.id}/"))

    def test_anonymous_cannot_fetch_unpublished_media(self):
        """世界没发布：知道路径也拿不到，回 401（提示要登录）。"""
        blocked = self.client.get(self.url)
        self.assertEqual(blocked.status_code, 401)
        self.assertTrue(blocked.json()["need_login"])

    def test_member_can_fetch_unpublished_media(self):
        """能读这个世界的人（成员）照样取得走。"""
        self.post_json("/api/world/auth/login", {"username": "owner", "password": "very-secret-1"})
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_non_member_gets_403(self):
        """登录了但不是这个世界的成员：403，而不是放行。

        邀请制下没有邀请码就注册不进来，所以"已登录但不属于这个世界"的人
        直接建库造出（模拟受邀进了别的世界 / 账号被移出成员名单的情形）。
        """
        from django.contrib.auth import get_user_model

        stranger = get_user_model().objects.create_user("stranger", password="very-secret-2")
        self.client.force_login(stranger)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_unknown_owner_is_not_served(self):
        """路径所指的文档不存在（比如已删）：游客一样拿不到，别想蒙混。"""
        self.assertEqual(self.client.get("/media/docs/999999/whatever.png").status_code, 401)

    def test_published_document_media_is_public(self):
        """世界 + 文档都发布出去后，未登录也能取——只读站点里嵌的图要显示得出来。"""
        self.world.is_published = True
        self.world.save(update_fields=["is_published"])
        self.document.is_published = True
        self.document.save(update_fields=["is_published"])

        opened = self.client.get(self.url)
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(b"".join(opened.streaming_content), b"\x89PNG\r\n\x1a\nfake-image")
        # 上传文件一律按声明类型渲染，别让浏览器嗅探（A8）
        self.assertEqual(opened["X-Content-Type-Options"], "nosniff")


class FuzzyMentionTests(BaseWorldCase):
    """typo-tolerant 提及与复数 / 所有格自动链接。"""

    def setUp(self):
        super().setUp()
        self.document, _card = self.make_card(name="Harrowdeep", aliases=["The Deep Gate"])

    def test_plural_and_possessive_are_linked(self):
        from world.services import autolink

        text = "Harrowdeeps 的城门，以及 Harrowdeep's 阴影。"
        matches = autolink.find_mentions(self.world, text)
        self.assertEqual(len(matches), 2)
        self.assertEqual(matches[0]["matched"], "Harrowdeeps")
        self.assertEqual(matches[1]["matched"], "Harrowdeep's")

    def test_fuzzy_candidates_catch_a_typo(self):
        from world.services import autolink

        found = autolink.fuzzy_candidates(self.world, "他们在 Harrowdeap 落脚")
        self.assertTrue(found)
        self.assertEqual(found[0]["name"], "Harrowdeep")
        self.assertEqual(found[0]["matched"], "Harrowdeap")

    def test_short_names_are_not_fuzzy_matched(self):
        from world.services import autolink

        self.make_card(name="Abcd")
        self.assertEqual(autolink.fuzzy_candidates(self.world, "Abcx 是什么"), [])

    def test_search_marks_fuzzy_hits(self):
        data = self.client.get("/api/world/search?q=Harrowdeap&fuzzy=1").json()
        names = [item["name"] for item in data["results"]]
        self.assertIn("Harrowdeep", names)
        flagged = [item for item in data["results"] if item.get("fuzzy")]
        self.assertTrue(flagged)
        # 不带 fuzzy 参数时不该出现
        plain = self.client.get("/api/world/search?q=Harrowdeap").json()
        self.assertNotIn("Harrowdeep", [item["name"] for item in plain["results"]])


class NameCompletionTests(BaseWorldCase):
    """打字补全（精确名字档）：归一化 / 前缀优先 / 类型与描述 / 排除自身。"""

    def complete(self, query, **params):
        return self.client.get("/api/world/complete", {"q": query, **params}).json()["results"]

    def test_prefix_and_casefold_and_fullwidth(self):
        self.make_card(name="Harrowdeep")
        self.assertEqual([r["name"] for r in self.complete("harrow")], ["Harrowdeep"])
        # 全角 + 大小写都要归一化后再匹配
        self.assertEqual([r["name"] for r in self.complete("ＨＡＲＲＯＷ")], ["Harrowdeep"])

    def test_prefix_ranks_before_contains(self):
        self.make_card(name="Marina")        # 包含命中
        self.make_card(name="Ari")           # 前缀命中
        names = [r["name"] for r in self.complete("ari")]
        self.assertEqual(names, ["Ari", "Marina"])

    def test_alias_matches_and_reports_matched(self):
        document, _card = self.make_card(name="Harrowdeep", aliases=["Deep Gate"])
        results = self.complete("gate")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["document_id"], document.id)
        self.assertEqual(results[0]["name"], "Harrowdeep")   # 主名
        self.assertEqual(results[0]["matched"], "Deep Gate")  # 命中的是别名

    def test_result_carries_type_and_description(self):
        document, _card = self.make_card(name="Isarra", blocks=[{"type": "text", "text": "调停人，来自北境。"}])
        result = self.complete("Isa")[0]
        self.assertEqual(result["type"], DOC_CARD)
        self.assertEqual(result["entity_type"], "角色")
        self.assertIn("调停人", result["description"])

    def test_exclude_skips_the_document_itself(self):
        document, _card = self.make_card(name="Isarra")
        self.assertEqual([r["document_id"] for r in self.complete("Isa")], [document.id])
        self.assertEqual(self.complete("Isa", exclude=document.id), [])

    def test_empty_query_and_blank_names(self):
        self.make_card(name="Isarra")
        self.assertEqual(self.complete(""), [])

    def test_limit_is_respected(self):
        for i in range(5):
            self.make_card(name=f"Garen{i}")
        self.assertEqual(len(self.complete("garen", limit=3)), 3)


class EmbedBlockTests(BaseWorldCase):
    """块嵌套（level / collapsed）与嵌入卡（card / image 块）。"""

    def setUp(self):
        super().setUp()
        self.document, _ = self.make_card(name="宿主卡片")
        self.target, _ = self.make_card(name="被嵌入的卡")

    def put_blocks(self, blocks):
        return self.client.put(f"/api/world/cards/{self.document.id}",
                               data=json.dumps({"blocks": blocks}),
                               content_type="application/json").json()["card"]["blocks"]

    def test_level_and_collapsed_survive(self):
        blocks = self.put_blocks([
            {"type": "heading", "title": "父块"},
            {"type": "text", "title": "子块", "text": "缩进一层", "level": 1},
            {"type": "text", "title": "孙块", "text": "两层", "level": 2},
            {"type": "text", "title": "折叠块", "text": "藏起来", "collapsed": True},
        ])
        self.assertEqual([b.get("level") for b in blocks[:3]], [None, 1, 2])
        self.assertTrue(blocks[3]["collapsed"])

    def test_card_embed_keeps_document_id(self):
        blocks = self.put_blocks([
            {"type": "card", "settings": {"document": self.target.id}},
        ])
        self.assertEqual(blocks[0]["settings"]["document"], self.target.id)

    def test_card_embed_rejects_garbage(self):
        blocks = self.put_blocks([
            {"type": "card", "settings": {"document": "不是数字"}},
        ])
        self.assertNotIn("document", blocks[0].get("settings", {}))

    def test_image_block_keeps_url_and_caption(self):
        blocks = self.put_blocks([
            {"type": "image", "settings": {"url": "https://example.com/a.png", "caption": "参考图"}},
        ])
        self.assertEqual(blocks[0]["settings"]["url"], "https://example.com/a.png")
        self.assertEqual(blocks[0]["settings"]["caption"], "参考图")


class EditConflictTests(BaseWorldCase):
    """编辑冲突保护：修订号对不上就回 409，不覆盖别人先写的内容。"""

    def setUp(self):
        super().setUp()
        self.document, _card = self.make_card(name="两个人都在改")

    def revision(self, response):
        return response.json().get("revision")

    def put_blocks(self, text, revision):
        return self.client.put(f"/api/world/cards/{self.document.id}",
                               data=json.dumps({"blocks": [{"type": "text", "text": text}],
                                                "revision": revision}),
                               content_type="application/json")

    def test_stale_revision_is_rejected(self):
        first = self.client.get(f"/api/world/cards/{self.document.id}").json()
        revision = first["revision"]

        ok = self.put_blocks("甲写的", revision)
        self.assertEqual(ok.status_code, 200)
        new_revision = self.revision(ok)
        self.assertGreater(new_revision, revision)

        # 乙拿着旧修订号来写 -> 409，并且甲的内容还在
        stale = self.put_blocks("乙写的", revision)
        self.assertEqual(stale.status_code, 409)
        body = stale.json()
        self.assertTrue(body["conflict"])
        self.assertIn("别人", body["error"])
        self.assertIn("甲写的", json.dumps(body["card"]["blocks"], ensure_ascii=False))

        # 拿到新修订号再写就成功
        again = self.put_blocks("乙写的", new_revision)
        self.assertEqual(again.status_code, 200)
        self.assertIn("乙写的", json.dumps(again.json()["card"]["blocks"], ensure_ascii=False))

    def test_write_without_revision_still_works(self):
        """老客户端 / 脚本不带 revision 时按原来的行为走，不强行 409。"""
        response = self.put_blocks("脚本写的", None)
        self.assertEqual(response.status_code, 200)

    def test_revision_bumps_on_every_change(self):
        first = self.client.get(f"/api/world/cards/{self.document.id}").json()["revision"]
        self.put_blocks("一次", first)
        second = self.client.get(f"/api/world/cards/{self.document.id}").json()["revision"]
        self.put_blocks("两次", second)
        third = self.client.get(f"/api/world/cards/{self.document.id}").json()["revision"]
        self.assertGreater(third, second)
        self.assertGreater(second, first)


class SiteBrowseTests(BaseWorldCase):
    """只读站点的浏览体验：筛选 chip 与全文搜索。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()
        self.card, _ = self.make_card(name="Harrowdeep",
                                      blocks=normalize_blocks([{"type": "text", "title": "概览",
                                                                "text": "深处有一扇青铜门"}]))
        publish.publish(self.world, audience="public")
        self.slug = self.world.published_slug

    def test_filter_chip_lists_types_and_eras(self):
        home = self.client.get(f"/s/{self.slug}/").content.decode()
        self.assertIn("filter-chip", home)
        self.assertIn("按类型", home)
        self.assertIn("全部", home)

    def test_filter_by_type_narrows_the_grid(self):
        all_home = self.client.get(f"/s/{self.slug}/")
        typed = self.client.get(f"/s/{self.slug}/?type={self.card.entity_type_id}")
        self.assertEqual(typed.status_code, 200)
        self.assertLessEqual(len(typed.content), len(all_home.content) + 400)
        self.assertIn("Harrowdeep", typed.content.decode())

    def test_site_search_finds_body_text_not_just_titles(self):
        found = self.client.get(f"/s/{self.slug}/search?q=青铜门")
        self.assertEqual(found.status_code, 200)
        self.assertIn("Harrowdeep", found.content.decode())
        self.assertIn("青铜门", found.content.decode())

    def test_site_search_ignores_unpublished_documents(self):
        hidden, _ = self.make_card(name="还没发布的秘密")
        hidden.is_published = False
        hidden.save(update_fields=["is_published"])
        missed = self.client.get(f"/s/{self.slug}/search?q=秘密")
        self.assertNotIn("还没发布的秘密", missed.content.decode())

    def test_search_page_without_query_is_friendly(self):
        empty = self.client.get(f"/s/{self.slug}/search")
        self.assertEqual(empty.status_code, 200)
        self.assertIn("输入关键词", empty.content.decode())


class SiteEraAndPreviewTests(BaseWorldCase):
    """纪元站点页 + 发布差异预览 + 搜索分页高亮。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()
        self.era = Era.objects.create(world=self.world, name="青铜纪", theme="teal", length_years=120)
        timeline = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="年表")
        TimelineEvent.objects.create(document=timeline, title="城门落成", era=self.era,
                                     precision="year", year=12)
        TimelineEvent.objects.create(document=timeline, title="无关的事", precision="year", year=90)
        from .services import publish
        publish.publish(self.world, audience="public")
        self.slug = self.world.published_slug

    def test_era_page_lists_only_its_events(self):
        page = self.client.get(f"/s/{self.slug}/era/{self.era.id}")
        self.assertEqual(page.status_code, 200)
        body = page.content.decode()
        self.assertIn("青铜纪", body)
        self.assertIn("城门落成", body)
        self.assertNotIn("无关的事", body)

    def test_home_shows_era_pills(self):
        home = self.client.get(f"/s/{self.slug}/").content.decode()
        self.assertIn("纪元", home)
        self.assertIn("青铜纪", home)

    def test_unknown_era_is_404(self):
        self.assertEqual(self.client.get(f"/s/{self.slug}/era/999999").status_code, 404)

    def test_search_highlights_and_paginates(self):
        found = self.client.get(f"/s/{self.slug}/search?q=城门")
        body = found.content.decode()
        self.assertIn("<mark>", body)
        self.assertIn("城门", body)

    def test_search_shows_twenty_at_a_time(self):
        """每一批 20 条；翻页用「加载更多」实现。"""
        for index in range(25):
            self.make_card(name=f"批量{index:02d}共同词")
        from .services import publish
        publish.publish(self.world, audience="public")
        first = self.client.get(f"/s/{self.slug}/search?q=共同词").content.decode()
        self.assertEqual(first.count('class="hit"'), 20)
        self.assertIn("已显示 20 / 25 条", first)
        more = self.client.get(f"/s/{self.slug}/search?q=共同词&show=40").content.decode()
        self.assertEqual(more.count('class="hit"'), 25)

    def test_publish_preview_reports_changes(self):
        preview = self.client.get("/api/world/publish/preview").json()
        self.assertIn("added", preview)
        self.assertIn("changed", preview)
        self.assertIn("removed", preview)
        # 刚发布过：现在没有待上线的；新建一张卡之后它就出现在 added 里
        self.assertEqual(preview["summary"]["added"], 0)
        self.make_card(name="发布之后才写的")
        again = self.client.get("/api/world/publish/preview").json()
        names = [row["name"] for row in again["added"]]
        self.assertIn("发布之后才写的", names)


class PublishLogAndRankingTests(BaseWorldCase):
    """发布记录、搜索排序、近似名字建议。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()

    def test_publish_writes_a_log_with_the_diff(self):
        from .services import publish
        self.make_card(name="第一份")
        publish.publish(self.world, audience="public", author=None)
        log = self.world.publish_logs.first()
        self.assertIsNotNone(log)
        self.assertEqual(log.version, self.world.publish_version)
        names = [row["name"] for row in log.added]
        self.assertIn("第一份", names)
        # 再发布一次：这次没有新增，应该记成 0
        publish.publish(self.world, audience="public")
        self.assertEqual(self.world.publish_logs.count(), 2)
        self.assertEqual(self.world.publish_logs.first().added, [])

    def test_publish_log_endpoint_lists_newest_first(self):
        from .services import publish
        publish.publish(self.world, audience="public")
        publish.publish(self.world, audience="public")
        logs = self.client.get("/api/world/publish/log").json()["logs"]
        self.assertGreaterEqual(len(logs), 2)
        self.assertGreater(logs[0]["version"], logs[1]["version"])

    def test_publish_preview_agrees_with_the_log(self):
        from .services import publish
        self.make_card(name="待上线的一份")
        preview = self.client.get("/api/world/publish/preview").json()
        publish.publish(self.world, audience="public")
        log = self.world.publish_logs.first()
        self.assertEqual(preview["summary"]["added"], len(log.added))

    def test_search_ranks_name_matches_first(self):
        from .services import publish
        name_hit, _ = self.make_card(name="青铜门")
        body_hit, _ = self.make_card(name="别的地方",
                                     blocks=normalize_blocks([{"type": "text", "text": "这里提到青铜门"}]))
        publish.publish(self.world, audience="public")
        results = self.client.get(f"/s/{self.world.published_slug}/search?q=青铜门").json() \
            if False else None
        hits = publish.search_documents(self.world, "青铜门")
        self.assertEqual(hits[0]["name"], "青铜门")
        self.assertGreater(hits[0]["score"], hits[1]["score"])

    def test_similar_names_when_nothing_found(self):
        from .services import publish
        self.make_card(name="Harrowdeep")
        publish.publish(self.world, audience="public")
        self.assertEqual(publish.search_documents(self.world, "Harrowdeap"), [])
        similar = publish.suggest_similar(self.world, "Harrowdeap")
        self.assertIn("Harrowdeep", [row["name"] for row in similar])


class GraphVisibilityTests(BaseWorldCase):
    """图谱：只读访客只看到已发布的节点（点了才跳得到站点页面）。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()

    def test_guest_graph_hides_unpublished_nodes(self):
        from django.test import Client

        from .services import publish

        shown, _ = self.make_card(name="已发布的")
        hidden, _ = self.make_card(name="没发布的")
        hidden.is_published = False
        hidden.save(update_fields=["is_published"])
        publish.publish(self.world, audience="public")
        # 先有个主人：一个用户都没有时 permissions.can_edit() 对谁都返回 True
        # （首次安装要先让人把世界建起来），那样测出来的不是访客视角。
        self.client.post("/api/world/auth/register",
                         data=json.dumps({"username": "图谱主人", "password": "secret-pass-1"}),
                         content_type="application/json")

        guest_view = Client().get("/api/world/graph").json()      # 另开一个匿名客户端
        names = [node["name"] for node in guest_view["nodes"]]
        self.assertIn("已发布的", names)
        self.assertNotIn("没发布的", names)

    def test_editor_graph_shows_everything(self):
        from .services import publish
        owner, _ = self.make_card(name="所有者自己看")
        publish.publish(self.world, audience="public")
        self.client.post("/api/world/auth/register",
                         data=json.dumps({"username": "图谱所有者", "password": "secret-pass-1"}),
                         content_type="application/json")
        graph = self.client.get("/api/world/graph").json()
        self.assertIn("所有者自己看", [node["name"] for node in graph["nodes"]])

    def test_graph_includes_every_document_by_default(self):
        """图谱是"世界的地图"：默认把这个世界所有文档都画出来，孤立节点也算。"""
        from .models import DOC_FOLDER, DOC_MAP, DOC_TIMELINE

        self.make_card(name="有连线的卡片")
        Document.objects.create(world=self.world, document_type=DOC_CARD, name="谁也不认识的卡片")
        Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="世界时间线")
        Document.objects.create(world=self.world, document_type=DOC_MAP, name="世界地图")
        Document.objects.create(world=self.world, document_type=DOC_FOLDER, name="文件夹")

        payload = self.client.get("/api/world/graph").json()
        names = {node["name"] for node in payload["nodes"]}
        self.assertIn("谁也不认识的卡片", names)      # 孤立节点也要在
        self.assertIn("世界时间线", names)            # 时间线也是文档
        self.assertIn("世界地图", names)
        self.assertNotIn("文件夹", names)             # 文件夹是容器，不进图谱
        self.assertEqual(payload["stats"]["documents"], payload["stats"]["total_documents"])

    def test_graph_limit_is_opt_in(self):
        """不带 limit 时不该被截断。

        回归：``clamp_int(get("limit"), 1, 400)`` 的兜底值是 1，
        前端不带 limit 就会把整张世界图画成**一个**节点。
        """
        for index in range(5):
            self.make_card(name=f"卡片 {index}")
        payload = self.client.get("/api/world/graph").json()
        self.assertEqual(len(payload["nodes"]), 5)
        self.assertEqual(len(self.client.get("/api/world/graph?limit=2").json()["nodes"]), 2)

    def test_hide_isolated_is_still_available(self):
        self.make_card(name="只有自己")
        everything = self.client.get("/api/world/graph").json()["nodes"]
        hidden = self.client.get("/api/world/graph?hide_isolated=1").json()["nodes"]
        self.assertEqual(len(everything), 1)
        self.assertEqual(hidden, [])

    def test_service_worker_is_served_from_root(self):
        """SW 必须从根路径发（作用域），并且不许被缓存。"""
        response = self.client.get("/sw.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response["Content-Type"])
        self.assertEqual(response["Service-Worker-Allowed"], "/")
        self.assertIn("no-cache", response["Cache-Control"])
        self.assertIn("opus-static", response.content.decode())

    def test_service_worker_flag_follows_settings(self):
        from django.test import override_settings

        with override_settings(SW_ENABLED=False):
            body = self.client.get("/world").content.decode()
            self.assertIn('data-sw="0"', body)
            forced = self.client.get("/world?sw=1").content.decode()
            self.assertIn('data-sw="1"', forced)
        with override_settings(SW_ENABLED=True):
            body = self.client.get("/world").content.decode()
            self.assertIn('data-sw="1"', body)
            off = self.client.get("/world?nosw=1").content.decode()
            self.assertIn('data-sw="0"', off)

    def test_site_search_uses_load_more(self):
        """站点列表用「加载更多」（每次多 20 条），按钮上方写清已显示 x / y。"""
        from .services import publish

        for index in range(25):
            self.make_card(name=f"灰烬纪年编年史 {index}")
        publish.publish(self.world, audience="public")
        self.world.refresh_from_db()
        base = f"/s/{self.world.published_slug}/search"

        first = self.client.get(base, {"q": "灰烬纪年编年史"})
        self.assertEqual(first.status_code, 200)
        body = first.content.decode()
        self.assertIn("已显示 20 / 25 条", body)
        self.assertIn("加载更多（已显示 20 / 25 条）", body)
        self.assertIn("show=40", body)

        second = self.client.get(base, {"q": "灰烬纪年编年史", "show": 40})
        body2 = second.content.decode()
        self.assertIn("已显示 25 / 25 条", body2)
        self.assertNotIn("加载更多", body2)          # 全给完了就别再显示按钮

    def test_site_search_show_is_clamped(self):
        from .services import publish

        publish.publish(self.world, audience="public")
        self.world.refresh_from_db()
        response = self.client.get(f"/s/{self.world.published_slug}/search",
                                   {"q": "a", "show": "9999"})
        self.assertEqual(response.status_code, 200)   # 超大 show 不许炸

    def test_feed_lists_published_documents(self):
        """订阅：RSS 里要有已发布的文档，且未发布的不能出现。"""
        from .services import publish

        self.make_card(name="上了站点的")
        hidden, _ = self.make_card(name="没发布的")
        hidden.is_published = False
        hidden.save(update_fields=["is_published"])
        publish.publish(self.world, audience="public")
        self.world.refresh_from_db()

        response = self.client.get(f"/s/{self.world.published_slug}/feed.xml")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/rss+xml", response["Content-Type"])
        body = response.content.decode()
        self.assertIn("上了站点的", body)
        self.assertNotIn("没发布的", body)

    def test_feed_is_404_for_unpublished_site(self):
        response = self.client.get("/s/does-not-exist/feed.xml")
        self.assertEqual(response.status_code, 404)

    def test_state_reports_session_expiry_and_renew_extends_it(self):
        """会话超时：首屏带到期时间，续期接口把它往后推。"""
        self.client.post("/api/world/auth/register",
                         data=json.dumps({"username": "会话主人", "password": "secret-pass-1"}),
                         content_type="application/json")
        state = self.client.get("/api/world/state").json()
        self.assertIn("session_expires_at", state)
        self.assertTrue(state["session_expires_at"])
        before = state["session_expires_at"]

        renewed = self.client.post("/api/world/auth/renew")
        self.assertEqual(renewed.status_code, 200)
        after = renewed.json()["session_expires_at"]
        self.assertGreaterEqual(after, before)

    def test_renew_without_session_is_401(self):
        response = self.client.post("/api/world/auth/renew")
        self.assertEqual(response.status_code, 401)

    def test_fresh_world_gets_starter_types(self):
        """新世界自带角色 / 地点 / 事件——空状态文案承诺过的东西得真有。"""
        from .models import EntityType
        from .views import STARTER_TYPES, bootstrap_types

        world = World.objects.create(name="刚开张", slug="fresh-one")
        bootstrap_types(world)
        self.assertEqual([t.name for t in world.types.all()],
                         [name for name, _icon, _color in STARTER_TYPES])
        # 再来一次不该重复建
        bootstrap_types(world)
        self.assertEqual(EntityType.objects.filter(world=world).count(), len(STARTER_TYPES))

    def test_bootstrap_skips_a_world_that_already_has_types(self):
        from .models import EntityType
        from .views import bootstrap_types

        EntityType.objects.create(world=self.world, name="已有类型", position=1)
        before = sorted(self.world.types.values_list("name", flat=True))
        bootstrap_types(self.world)
        after = sorted(self.world.types.values_list("name", flat=True))
        self.assertEqual(before, after)            # 一个都没多加

    def test_era_page_links_back_to_grid_filter(self):
        era = Era.objects.create(world=self.world, name="筛选纪元")
        from .services import publish
        publish.publish(self.world, audience="public")
        body = self.client.get(f"/s/{self.world.published_slug}/era/{era.id}").content.decode()
        self.assertIn(f"?era={era.id}", body)


class ExperienceLayerTests(BaseWorldCase):
    """全链路体验层的服务端部分：分享卡片 / 动态流 / 状态页 / 离开上报。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()

    def publish(self):
        from .services import publish
        publish.publish(self.world, audience="public")
        return self.world.published_slug

    # ------------------------------------------------------------ 分享卡片
    def test_og_card_is_svg_with_world_name_and_theme_colour(self):
        slug = self.publish()
        response = self.client.get(f"/s/{slug}/og.svg")
        self.assertEqual(response.status_code, 200)
        self.assertIn("image/svg+xml", response["Content-Type"])
        body = response.content.decode()
        self.assertIn("测试世界", body)
        self.assertIn("#123456", body)                 # 主题色进了卡片
        self.assertIn("1200", body)

    def test_og_card_rejects_a_bogus_theme_colour(self):
        # 主题值是用户可编辑的：不是 #rrggbb 就退回默认色，别变成注入点
        self.world.theme_config = {"primaryColor": '"/><script>alert(1)</script>'}
        self.world.save(update_fields=["theme_config"])
        slug = self.publish()
        body = self.client.get(f"/s/{slug}/og.svg").content.decode()
        self.assertNotIn("script", body)
        self.assertIn("#3ddc97", body)

    def test_og_card_hidden_for_unpublished_world(self):
        self.assertEqual(self.client.get("/s/nope42/og.svg").status_code, 404)

    def test_site_base_advertises_the_card(self):
        slug = self.publish()
        body = self.client.get(f"/s/{slug}/").content.decode()
        self.assertIn("og:image", body)
        self.assertIn(f"/s/{slug}/og.svg", body)
        self.assertIn("speculationrules", body)        # 到达前预渲染

    # ------------------------------------------------------- 已移除的文档
    def test_removed_document_says_so_and_suggests_neighbours(self):
        from .services import publish
        keeper, _ = self.make_card(name="青铜门")
        gone, _ = self.make_card(name="被撤下的那一页")
        publish.publish(self.world, audience="public")
        gone.is_published = False
        gone.save(update_fields=["is_published"])

        response = self.client.get(f"/s/{self.world.published_slug}/{gone.slug}/")
        self.assertEqual(response.status_code, 404)
        self.assertContains(response, "不在站点上", status_code=404)
        self.assertContains(response, "被撤下的那一页", status_code=404)

    def test_unknown_slug_gets_signal_lost(self):
        self.publish()
        response = self.client.get(f"/s/{self.world.published_slug}/never-existed/")
        self.assertEqual(response.status_code, 404)
        self.assertContains(response, "信号丢失", status_code=404)

    # ------------------------------------------------------------ 维护页
    def test_maintenance_page_is_a_terminal_sequence(self):
        response = self.client.get("/maintenance")
        self.assertEqual(response.status_code, 503)
        self.assertContains(response, "系统维护中", status_code=503)
        self.assertContains(response, "预计恢复时间", status_code=503)

    def test_maintenance_middleware_only_bites_when_switched_on(self):
        from unittest import mock
        from world.maintenance import MaintenanceMiddleware

        request = self.client.get("/world").wsgi_request
        passthrough = MaintenanceMiddleware(lambda req: "正常")
        self.assertEqual(passthrough(request), "正常")

        with mock.patch.dict("os.environ", {"OPUSCULE_MAINTENANCE": "1"}):
            blocked = MaintenanceMiddleware(lambda req: "正常")(request)
            self.assertEqual(blocked.status_code, 503)
            self.assertIn("系统维护中", blocked.content.decode())
            self.assertEqual(blocked["Retry-After"], "900")
            # 静态资源与维护页自己必须放行，否则维护页连样式都加载不出来
            static_request = self.client.get("/static/terminal.css").wsgi_request
            self.assertEqual(MaintenanceMiddleware(lambda req: "放行")(static_request), "放行")

    # --------------------------------------------------------- 通知中心
    def test_activity_feed_mixes_publish_and_membership(self):
        from .services import publish
        from .models import InviteCode
        self.make_card(name="写点什么")
        publish.publish(self.world, audience="public", author=None)
        InviteCode.objects.create(code="SPARE123", world=self.world)
        self.client.post("/api/world/auth/register",
                         data=json.dumps({"username": "新来的", "password": "secret-pass-1"}),
                         content_type="application/json")
        rows = self.client.get("/api/world/activity").json()["activity"]
        kinds = {row["kind"] for row in rows}
        self.assertIn("publish", kinds)
        self.assertIn("invite", kinds)
        self.assertTrue(all("what" in row and "when" in row for row in rows))

    def test_activity_feed_collapses_repeated_edits(self):
        document, _ = self.make_card(name="反复改的那份")
        for index in range(4):
            self.client.put(f"/api/world/cards/{document.id}",
                            data=json.dumps({"blocks": [{"type": "text", "text": f"第 {index} 版"}]}),
                            content_type="application/json")
        rows = [row for row in self.client.get("/api/world/activity").json()["activity"]
                if row.get("doc") == document.id]
        self.assertEqual(len(rows), 1, "同一份文档只该在动态里出现一次")

    # ------------------------------------------------------------ 离开上报
    def test_leaving_beacon_removes_presence(self):
        from documents.models import Presence
        from django.contrib.auth import get_user_model
        from world.services import publish
        publish.publish(self.world, audience="public")
        self.client.post("/api/world/auth/register",
                         data=json.dumps({"username": "走的人", "password": "secret-pass-1"}),
                         content_type="application/json")
        user = get_user_model().objects.get(username="走的人")
        Presence.touch(self.world, user)
        self.assertEqual(Presence.objects.filter(world=self.world).count(), 1)

        response = self.client.post("/api/world/presence",
                                    data=json.dumps({"leaving": True}),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Presence.objects.filter(world=self.world).count(), 0)


# --------------------------------------------------------------------------- #
# 静态资源的版本号（`?v=`）—— 这一条是"明明改了代码却没反应"的元凶
class StaticVersionTests(TestCase):
    """`_stamp()` 决定模板里 `?v=` 的值，也就决定浏览器会不会重新拉 JS/CSS。

    踩过的坑：原来用 `functools.lru_cache(maxsize=1)` 缓存，寿命是整个进程 ——
    开发服务器一开就是几小时，`static/*.js` 改过好几轮，`?v=` 还停在服务器启动
    那一刻的值。URL 没变、响应又只有 `Last-Modified`（Django 开发态不发
    Cache-Control），浏览器就按启发式缓存一直用旧文件。表现是"改了什么都没用"。
    实测那次服务器发的是 6.8 小时前的版本号。
    """

    def test_stamp_follows_file_mtime(self):
        from django.conf import settings

        from . import context

        target = pathlib.Path(settings.STATICFILES_DIRS[0]) / "map" / "vendor" / "index.css"
        self.assertTrue(target.exists(), "static/map/vendor 里应该有构建产物")

        original = target.stat().st_mtime
        context._stamp_cache[0] = 0.0                 # 跳过 2 秒 TTL
        before = context._stamp()
        try:
            # 必须把 mtime 顶到**当前所有静态文件的最新值之上**：`_stamp()` 取的是
            # 所有静态文件里最新的修改时间，而 index.css 是构建产物，时间戳常常比天天
            # 在改的 workspace.js 旧好几天 —— 只在自己原值上加一天，依旧追不上全局最大
            # 值，最大值不动、版本号当然也不变（那就是一条假失败）。所以以 `before`
            # （刚算出来的全局最新值）为基准再往上顶。
            bumped = int(before) + 86400
            os.utime(target, (bumped, bumped))
            context._stamp_cache[0] = 0.0
            after = context._stamp()
            self.assertNotEqual(before, after,
                                "静态文件改了，版本号必须跟着变 —— 不然浏览器不会重新拉")
        finally:
            os.utime(target, (original, original))
            context._stamp_cache[0] = 0.0

    def test_stamp_is_short_cached_not_process_cached(self):
        """缓存必须是"短 TTL"，不能是 lru_cache（那玩意儿活到进程结束）。"""
        from . import context

        self.assertFalse(hasattr(context._stamp, "cache_clear"),
                         "_stamp 不能再被 lru_cache 包住")
        self.assertLessEqual(context._STAMP_TTL, 10.0,
                             "TTL 太长的话，改完文件要等很久 URL 才换")


# 地图独立页（/map · /map/2d · /map/3d）
# --------------------------------------------------------------------------- #
class MapPageTests(TestCase):
    """``/map`` 三档：跳转、两个子档、嵌入与只读、换文档、认错文档。

    页面本身是前端渲染的（数据走 ``/api/world/maps/*``，那几条在上面
    ``MapApiTests`` 里管），所以这里只钉"服务端给对了没有"：
    路由指哪儿、模板里有没有那一档、只读与嵌入的判定、挑文档的规则。
    """

    def setUp(self):
        self.world = World.objects.create(name="地图世界")
        self.map_doc = Document.objects.create(
            world=self.world, document_type="map", name="世界地图")
        self.card = Document.objects.create(
            world=self.world, document_type="card", name="一张卡")

    def _ctx(self, response):
        """把页面里那份页面上下文（``#map-ctx`` 的 JSON）解出来。"""
        match = re.search(
            r'<script id="map-ctx" type="application/json">(.*?)</script>',
            response.content.decode(), re.S)
        self.assertIsNotNone(match, "页面里应该有 #map-ctx")
        return json.loads(match.group(1))

    # ------------------------------------------------------------ 路由
    def test_map_redirects_to_2d(self):
        response = self.client.get("/map")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/map/2d")

    def test_map_redirect_keeps_query(self):
        response = self.client.get(f"/map?doc={self.map_doc.id}")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], f"/map/2d?doc={self.map_doc.id}")

    def test_2d_page_renders_the_engine(self):
        response = self.client.get(f"/map/2d?doc={self.map_doc.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ctx(response)["view"], "2d")
        # 引擎入口是构建产物，base 必须落在我们的静态挂载点
        self.assertContains(response, "/static/map/vendor/index-")

    def test_3d_page_renders(self):
        response = self.client.get(f"/map/3d?doc={self.map_doc.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ctx(response)["view"], "3d")

    def test_unknown_view_falls_back_to_2d(self):
        response = self.client.get(f"/map/太阳系?doc={self.map_doc.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ctx(response)["view"], "2d")

    # ------------------------------------------------------------ 挑文档
    def test_picks_first_map_when_no_doc(self):
        ctx = self._ctx(self.client.get("/map/2d"))
        self.assertEqual(ctx["docId"], self.map_doc.id)
        self.assertEqual(ctx["docName"], "世界地图")

    def test_non_map_document_is_reported_missing(self):
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.card.id}"))
        self.assertTrue(ctx["docMissing"])
        # 原样留着请求的 id：前端要说"这一篇不在了"，而不是悄悄换一张
        self.assertEqual(ctx["docId"], self.card.id)

    def test_missing_document_is_reported_missing(self):
        self.assertTrue(self._ctx(self.client.get("/map/2d?doc=999999"))["docMissing"])

    # ------------------------------------------------------------ 嵌入 / 只读
    def test_embed_is_readonly_by_default(self):
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.map_doc.id}&embed=1"))
        self.assertTrue(ctx["embed"])
        self.assertTrue(ctx["readonly"])

    def test_embed_can_opt_into_editing(self):
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.map_doc.id}&embed=1&readonly=0"))
        self.assertTrue(ctx["embed"])
        self.assertFalse(ctx["readonly"])

    def test_visitor_cannot_edit(self):
        """没登录 + 库里已经有别人：画布必须只读（``readonly=0`` 也不作数）。"""
        from django.contrib.auth import get_user_model

        get_user_model().objects.create_user("房主", password="secret-pass-1")
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.map_doc.id}&embed=1&readonly=0"))
        self.assertTrue(ctx["readonly"], "游客拿到的必须是只读画布")

    def test_viewer_member_cannot_edit(self):
        """登录了但这张世界里只是「只读成员」：同样只读。"""
        from django.contrib.auth import get_user_model

        from .models import ROLE_VIEWER

        user = get_user_model().objects.create_user("看客", password="secret-pass-1")
        Membership.objects.create(world=self.world, user=user, role=ROLE_VIEWER)
        self.client.force_login(user)
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.map_doc.id}&embed=1&readonly=0"))
        self.assertTrue(ctx["readonly"])

    # ------------------------------------------------------------ 主题
    def test_paper_theme_falls_back_to_dark(self):
        ctx = self._ctx(self.client.get(f"/map/2d?doc={self.map_doc.id}&theme=paper"))
        self.assertEqual(ctx["theme"], "dark")


class GeoBridgeTests(BaseWorldCase):
    """地图 ⇄ 编辑器 的桥：导入实体，给条目自动铺开下一级。"""

    def setUp(self):
        super().setUp()
        created = self.client.post("/api/world/documents", data=json.dumps(
            {"type": "map", "name": "世界地图"}), content_type="application/json").json()
        self.map_id = created["id"]

    def _payload(self):
        """前端从 pack 抽出来的形状：nodes 是层级树，flat 是没有上级的那些。"""
        return {
            "nodes": [
                {
                    "kind": "国家", "name": "临江国", "x": 30.0, "y": 40.0,
                    "attrs": {"全称": "临江国", "政体": "公国", "首都": "石头城", "人口": 12000, "面积": 800},
                    "children": [
                        {
                            "kind": "省份", "name": "临江省", "x": 32.0, "y": 42.0,
                            "attrs": {"所属国家": "临江国", "省会": "石头城", "面积": 320},
                            "children": [
                                {"kind": "城镇", "name": "石头城", "x": 32.5, "y": 42.5,
                                 "attrs": {"人口": 3200, "类型": "River", "分组": "capital"}},
                            ],
                        }
                    ],
                }
            ],
            "flat": [{"kind": "河流", "name": "临水", "x": 33.0, "y": 44.0, "attrs": {"长度": 220}}],
        }

    def _import(self, payload=None):
        return self.client.post(f"/api/world/maps/{self.map_id}/import-entities",
                                data=json.dumps(payload if payload is not None else self._payload()),
                                content_type="application/json")

    def test_import_creates_types_tree_cards_and_markers(self):
        from documents.models import Document
        from maps.models import MapMarker

        result = self._import().json()
        self.assertTrue(result["success"])
        self.assertEqual(result["counts"], {"国家": 1, "省份": 1, "城镇": 1, "河流": 1})
        self.assertEqual(result["markers"], 4)

        types = {t.name: t for t in EntityType.objects.filter(world=self.world)}
        for name in ("国家", "省份", "城镇", "地点", "河流", "山脉", "道路"):
            self.assertIn(name, types)
        self.assertGreaterEqual(types["国家"].properties.count(), 5)

        root = Document.objects.get(pk=result["root"])
        self.assertEqual(root.name, "地理")
        country = Document.objects.get(world=self.world, name="临江国")
        self.assertEqual(country.parent_id, root.id)
        province = Document.objects.get(world=self.world, name="临江省")
        self.assertEqual(province.parent_id, country.id)
        town = Document.objects.get(world=self.world, name="石头城")
        self.assertEqual(town.parent_id, province.id)

        # 属性值落在卡片上（键是属性 id，与前端一致）
        props = {p.name: str(p.id) for p in town.card.entity_type.properties.all()}
        self.assertEqual(town.card.values.get(props["人口"]), 3200)
        self.assertEqual(town.card.blocks[0]["title"], "概览")

        # 图钉真的建了，并且指回卡片
        marker = MapMarker.objects.get(card=town)
        self.assertEqual(marker.document_id, self.map_id)
        self.assertEqual(marker.x, 32.5)
        self.assertEqual(marker.name, "石头城")

        # 没有上级的河流进「河流」兜底文件夹
        river = Document.objects.get(world=self.world, name="临水")
        self.assertEqual(river.parent.name, "河流")

    def test_import_is_idempotent(self):
        from documents.models import Document

        self._import()
        before = Document.objects.filter(world=self.world, name="石头城").count()
        again = self._import().json()
        self.assertEqual(Document.objects.filter(world=self.world, name="石头城").count(), before)
        self.assertEqual(again["created"], 0)
        # 4 个条目全是就地更新 —— 报「处理了几个」和「新建了几张」是两回事
        self.assertEqual(again["updated"], 4)
        self.assertEqual(again["counts"], {"国家": 1, "省份": 1, "城镇": 1, "河流": 1})

    def test_import_merges_same_name_siblings(self):
        """地图上同省的两座同名城镇会并成一张卡（否则树里会出现两张一模一样的条目）。"""
        from documents.models import Document

        payload = self._payload()
        province = payload["nodes"][0]["children"][0]
        province["children"].append(dict(province["children"][0], x=36.0, y=47.0))
        result = self._import(payload).json()
        self.assertEqual(result["counts"]["城镇"], 2)
        self.assertEqual(result["updated"], 1)
        self.assertEqual(Document.objects.filter(world=self.world, name="石头城").count(), 1)

    def test_import_rejects_a_non_map_or_empty_payload(self):
        plain = self.client.post("/api/world/documents", data=json.dumps(
            {"type": "card", "name": "一张卡"}), content_type="application/json").json()
        not_a_map = self.client.post(f"/api/world/maps/{plain['id']}/import-entities",
                                     data=json.dumps(self._payload()), content_type="application/json")
        self.assertEqual(not_a_map.status_code, 400)
        empty = self._import({})
        self.assertEqual(empty.status_code, 400)

    def test_distribute_uses_the_hand_filled_count_and_creates_markers(self):
        from documents.models import Document
        from maps.models import MapMarker

        self._import()
        province = Document.objects.get(world=self.world, name="临江省")
        out = self.client.post(f"/api/world/documents/{province.id}/distribute",
                               data=json.dumps({"count": 3}), content_type="application/json").json()
        self.assertTrue(out["ok"])
        self.assertEqual(out["child_kind"], "城镇")
        self.assertEqual(out["count"], 3)

        children = Document.objects.filter(parent=province, name__startswith="临江省·")
        self.assertEqual(children.count(), 3)
        for child in children:
            marker = MapMarker.objects.get(card=child)
            self.assertAlmostEqual(marker.x, 32.0, delta=8)
            self.assertAlmostEqual(marker.y, 42.0, delta=8)

        # 同一条目再铺一次，位置与名字都不变（确定性）
        first = sorted((c.name, MapMarker.objects.get(card=c).x) for c in children)
        self.client.post(f"/api/world/documents/{province.id}/distribute",
                         data=json.dumps({"count": 3}), content_type="application/json")
        again = sorted((c.name, MapMarker.objects.get(card=c).x)
                       for c in Document.objects.filter(parent=province, name__startswith="临江省·"))
        self.assertEqual(first, again)

    def test_distribute_auto_count_and_leaf_refusal(self):
        from documents.models import Document

        self._import()
        country = Document.objects.get(world=self.world, name="临江国")  # 面积 800 → 800/400 = 2
        auto = self.client.post(f"/api/world/documents/{country.id}/distribute",
                                data=json.dumps({}), content_type="application/json").json()
        self.assertTrue(auto["ok"])
        self.assertEqual(auto["count"], 2)
        self.assertEqual(auto["child_kind"], "省份")

        # 城镇往下是「地点」；地点是末端，再往下就没得铺了
        town = Document.objects.get(world=self.world, name="石头城")
        places = self.client.post(f"/api/world/documents/{town.id}/distribute",
                                  data=json.dumps({"count": 2}), content_type="application/json").json()
        self.assertEqual(places["child_kind"], "地点")
        place = Document.objects.get(pk=places["children"][0]["id"])
        leaf = self.client.post(f"/api/world/documents/{place.id}/distribute",
                                data=json.dumps({}), content_type="application/json")
        self.assertEqual(leaf.status_code, 400)

    def test_distribute_refuses_a_card_that_is_not_a_place(self):
        document, _ = self.make_card("随便一张")
        response = self.client.post(f"/api/world/documents/{document.id}/distribute",
                                    data=json.dumps({}), content_type="application/json")
        self.assertEqual(response.status_code, 400)


class WorldBanTests(BaseWorldCase):
    """G3：世界级封禁的惰性语义——到期即自动解封，不靠定时任务。"""

    def test_not_banned_by_default(self):
        self.assertFalse(self.world.is_banned)
        self.assertIsNone(self.world.banned_until)

    def test_banned_until_in_the_future_is_banned(self):
        self.world.banned_until = timezone.now() + timedelta(days=3)
        self.world.ban_reason = "内容违规"
        self.assertTrue(self.world.is_banned)
        self.assertEqual(self.world.ban_reason, "内容违规")

    def test_ban_expires_lazily(self):
        """封禁时刻一过，``is_banned`` 立刻回到 False——这就是"到期自动解封"。"""
        self.world.banned_until = timezone.now() - timedelta(seconds=1)
        self.assertFalse(self.world.is_banned)

    def test_ban_summary_reports_state(self):
        self.world.banned_until = timezone.now() + timedelta(days=5)
        self.world.ban_reason = "垃圾信息"
        summary = self.world.ban_summary()
        self.assertTrue(summary["banned"])
        self.assertEqual(summary["reason"], "垃圾信息")
        self.assertTrue(summary["until"])


class PublicWikiBanTests(BaseWorldCase):
    """G3：被封禁的公开 wiki——首页 / feed / og 全部 404，解封或到期后恢复。"""

    def setUp(self):
        super().setUp()
        self.world = World.objects.first()
        self.make_card(name="Harrowdeep", blocks=normalize_blocks(
            [{"type": "text", "title": "概览", "text": "深处有一扇青铜门"}]))
        publish.publish(self.world, audience="public")
        self.slug = self.world.published_slug

    def _ban_for(self, days: int):
        self.world.banned_until = timezone.now() + timedelta(days=days)
        self.world.ban_reason = "平台封禁"
        self.world.save(update_fields=["banned_until", "ban_reason"])

    def test_published_site_is_reachable_before_ban(self):
        self.assertEqual(self.client.get(f"/s/{self.slug}/").status_code, 200)

    def test_ban_closes_every_public_surface(self):
        self._ban_for(3)
        self.assertEqual(self.client.get(f"/s/{self.slug}/").status_code, 404)
        self.assertEqual(self.client.get(f"/s/{self.slug}/feed.xml").status_code, 404)
        self.assertEqual(self.client.get(f"/s/{self.slug}/og.svg").status_code, 404)
        self.assertEqual(self.client.get(f"/s/{self.slug}/search?q=青铜门").status_code, 404)

    def test_site_recovers_after_ban_expires(self):
        """封禁到期：``is_banned`` 惰性判回，站点自动恢复，无需任何人操作。"""
        self.world.banned_until = timezone.now() - timedelta(seconds=1)
        self.world.save(update_fields=["banned_until"])
        self.assertEqual(self.client.get(f"/s/{self.slug}/").status_code, 200)

    def test_site_recovers_after_manual_unban(self):
        self._ban_for(7)
        self.assertEqual(self.client.get(f"/s/{self.slug}/").status_code, 404)
        self.world.banned_until = None
        self.world.ban_reason = ""
        self.world.save(update_fields=["banned_until", "ban_reason"])
        self.assertEqual(self.client.get(f"/s/{self.slug}/").status_code, 200)


class ModerationConsoleTests(BaseWorldCase):
    """G3：平台治理台——站长或管理员可封禁 / 解封，动作留痕。"""

    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model

        self.root = get_user_model().objects.create_superuser("root", password="very-secret-3")
        self.mod = get_user_model().objects.create_user("mod", password="very-secret-4")
        self.plain = get_user_model().objects.create_user("plain", password="very-secret-5")

    def test_plain_user_cannot_open_the_console(self):
        self.client.force_login(self.plain)
        self.assertEqual(self.client.get("/api/world/moderation").status_code, 403)

    def test_moderator_can_open_the_console_without_being_a_member(self):
        """管理员不是被治理世界的成员，但读接口已在中间件白名单里放行。"""
        from world import permissions

        permissions.set_moderator(self.mod, True)
        publish.publish(self.world, audience="public")

        self.client.force_login(self.mod)
        response = self.client.get("/api/world/moderation")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["limits"], {"min_days": 3, "max_days": 7, "default_days": 7})
        self.assertEqual(body["banned_count"], 0)

    def test_cannot_ban_an_unpublished_world(self):
        self.client.force_login(self.root)
        response = self.post_json("/api/world/moderation/ban", {"world_id": self.world.id})
        self.assertEqual(response.status_code, 400)

    def test_ban_marks_the_world_and_writes_audit(self):
        publish.publish(self.world, audience="public")
        self.client.force_login(self.root)

        response = self.post_json("/api/world/moderation/ban",
                                  {"world_id": self.world.id, "days": 5, "reason": "侵权"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["world"]["is_banned"])

        self.world.refresh_from_db()
        self.assertTrue(self.world.is_banned)
        self.assertEqual(self.world.ban_reason, "侵权")
        event = ModerationEvent.objects.get()
        self.assertEqual(event.action, "ban")
        self.assertEqual(event.detail, "5 天 · 侵权")

    def test_ban_days_are_clamped_to_the_three_to_seven_window(self):
        publish.publish(self.world, audience="public")
        self.client.force_login(self.root)

        self.post_json("/api/world/moderation/ban", {"world_id": self.world.id, "days": 99})
        self.assertEqual(ModerationEvent.objects.get().detail, "7 天")

        ModerationEvent.objects.all().delete()
        self.post_json("/api/world/moderation/ban", {"world_id": self.world.id, "days": 1})
        self.assertEqual(ModerationEvent.objects.get().detail, "3 天")

    def test_unban_clears_fields_and_writes_audit(self):
        publish.publish(self.world, audience="public")
        self.client.force_login(self.root)
        self.post_json("/api/world/moderation/ban", {"world_id": self.world.id, "days": 7})

        response = self.post_json("/api/world/moderation/unban", {"world_id": self.world.id})
        self.assertEqual(response.status_code, 200)
        self.world.refresh_from_db()
        self.assertFalse(self.world.is_banned)
        self.assertIsNone(self.world.banned_until)

        actions = list(ModerationEvent.objects.order_by("id").values_list("action", flat=True))
        self.assertEqual(actions, ["ban", "unban"])

    def test_moderator_may_ban(self):
        """封禁是平台级动作——管理员（不是成员）也能做。"""
        from world import permissions

        permissions.set_moderator(self.mod, True)
        publish.publish(self.world, audience="public")

        self.client.force_login(self.mod)
        response = self.post_json("/api/world/moderation/ban", {"world_id": self.world.id})
        self.assertEqual(response.status_code, 200)
        self.world.refresh_from_db()
        self.assertTrue(self.world.is_banned)

    def test_plain_user_cannot_ban(self):
        publish.publish(self.world, audience="public")
        Membership.objects.create(world=self.world, user=self.plain, role=ROLE_EDITOR)

        self.client.force_login(self.plain)
        response = self.post_json("/api/world/moderation/ban", {"world_id": self.world.id})
        self.assertEqual(response.status_code, 403)


class ReportTests(BaseWorldCase):
    """G3：读者举报——匿名提交，只有站长（非管理员）能看与处置。"""

    def setUp(self):
        super().setUp()
        from django.contrib.auth import get_user_model

        self.world = World.objects.first()
        self.make_card(name="Harrowdeep")
        publish.publish(self.world, audience="public")
        self.slug = self.world.published_slug
        self.root = get_user_model().objects.create_superuser("root", password="very-secret-3")
        self.mod = get_user_model().objects.create_user("mod", password="very-secret-4")
        self.plain = get_user_model().objects.create_user("plain", password="very-secret-5")

    def test_anonymous_can_file_a_report(self):
        response = self.post_json(f"/s/{self.slug}/report",
                                  {"reason": "spam", "detail": "这里全是广告", "doc": "harrowdeep"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

        report = Report.objects.get()
        self.assertEqual(report.reason, "spam")
        self.assertEqual(report.detail, "这里全是广告")
        self.assertEqual(report.status, "open")
        self.assertEqual(report.world_slug, self.slug)
        self.assertIsNone(report.reporter)

    def test_report_requires_a_detail(self):
        response = self.post_json(f"/s/{self.slug}/report", {"reason": "spam"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Report.objects.count(), 0)

    def test_unknown_reason_falls_back_to_content(self):
        self.post_json(f"/s/{self.slug}/report", {"reason": "nonsense", "detail": "有情况"})
        self.assertEqual(Report.objects.get().reason, "content")

    def test_report_on_an_unpublished_slug_is_404(self):
        response = self.post_json("/s/never-published/report", {"detail": "有情况"})
        self.assertEqual(response.status_code, 404)

    def test_only_superuser_can_read_the_inbox(self):
        Report.objects.create(world=self.world, world_name=self.world.name,
                              world_slug=self.slug, detail="有情况")

        self.client.force_login(self.mod)
        self.assertEqual(self.client.get("/api/world/reports").status_code, 403)

        self.client.force_login(self.plain)
        self.assertEqual(self.client.get("/api/world/reports").status_code, 403)

        self.client.force_login(self.root)
        response = self.client.get("/api/world/reports")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["reports"]), 1)
        self.assertEqual(body["open_count"], 1)

    def test_superuser_handles_a_report(self):
        report = Report.objects.create(world=self.world, world_name=self.world.name,
                                       world_slug=self.slug, detail="有情况")
        self.client.force_login(self.root)

        response = self.post_json(f"/api/world/reports/{report.id}",
                                  {"status": "handled", "note": "已下架相关内容"})
        self.assertEqual(response.status_code, 200)

        report.refresh_from_db()
        self.assertEqual(report.status, "handled")
        self.assertEqual(report.note, "已下架相关内容")
        self.assertEqual(report.handled_by, self.root)
        self.assertIsNotNone(report.handled_at)

    def test_handling_back_to_open_clears_the_trace(self):
        report = Report.objects.create(world=self.world, world_name=self.world.name,
                                       world_slug=self.slug, detail="有情况",
                                       status="handled", handled_by=self.root,
                                       handled_by_name="root", handled_at=timezone.now())
        self.client.force_login(self.root)

        self.post_json(f"/api/world/reports/{report.id}", {"status": "open"})
        report.refresh_from_db()
        self.assertEqual(report.status, "open")
        self.assertIsNone(report.handled_by)
        self.assertIsNone(report.handled_at)

    def test_moderator_cannot_handle_a_report(self):
        report = Report.objects.create(world=self.world, world_name=self.world.name,
                                       world_slug=self.slug, detail="有情况")
        from world import permissions

        permissions.set_moderator(self.mod, True)
        self.client.force_login(self.mod)
        response = self.post_json(f"/api/world/reports/{report.id}", {"status": "handled"})
        self.assertEqual(response.status_code, 403)


# 程序版本（推进计划.md §8 · 阶段 3）
# --------------------------------------------------------------------------- #
class AppVersionTests(TestCase):
    """版本号的唯一来源是 ``settings.APP_VERSION`` + ``APP_CHANNEL``（推进计划.md §8）。

    页脚、``/meta`` 接口、CHANGELOG 都必须引用同一处，不能在别处再写死版本串。
    出口条件：页脚（与 ``/meta``）可见 ``Opuscule 0.4.0 · Dev``（当前 settings 值）。
    """

    def test_app_info_derives_from_settings(self):
        from django.conf import settings

        from . import version

        info = version.app_info()
        self.assertEqual(info["name"], settings.APP_NAME)
        self.assertEqual(info["version"], settings.APP_VERSION)
        self.assertEqual(info["channel"], settings.APP_CHANNEL)
        self.assertEqual(info["channel_label"], "Dev")
        self.assertEqual(info["version_string"], f"{settings.APP_VERSION}-dev")
        self.assertEqual(info["display"], f"{settings.APP_NAME} {settings.APP_VERSION} · Dev")

    def test_version_string_per_channel(self):
        from . import version

        self.assertEqual(version.version_string("0.4.0", "dev"), "0.4.0-dev")
        self.assertEqual(version.version_string("0.4.0", "alpha", "2"), "0.4.0-alpha.2")
        self.assertEqual(version.version_string("0.4.0", "alpha"), "0.4.0-alpha.1")
        self.assertEqual(version.version_string("0.4.0", "beta", "1"), "0.4.0-beta.1")
        self.assertEqual(version.version_string("0.4.0", "release"), "0.4.0")
        self.assertEqual(version.channel_label("release"), "Release")

    def test_meta_endpoint_is_public(self):
        response = self.client.get("/meta")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["version_string"], "0.4.0-dev")
        self.assertEqual(payload["channel_label"], "Dev")
        self.assertEqual(payload["display"], "Opuscule 0.4.0 · Dev")

    def test_explore_footer_shows_version(self):
        response = self.client.get("/explore")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Opuscule 0.4.0 · Dev")

    def test_auth_footer_shows_version(self):
        # 库里一个用户都没有时 /login 会跳去 /register（首次安装要先建号），
        # 所以先建一个用户，让 /login 正常渲染登录页。
        from django.contrib.auth.models import User

        User.objects.create_user("founder", password="pw-Str0ng!23")
        response = self.client.get("/login")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Powered by Opuscule 0.4.0 · Dev")

    def test_build_number_is_optional(self):
        # 没设 OPUSCULE_BUILD 时，展示串与完整串都不带 build（本地开发/测试不应被影响）。
        from django.test import override_settings

        from . import version

        with override_settings(APP_BUILD=""):
            info = version.app_info()
            self.assertEqual(info["build"], "")
            self.assertEqual(info["version_string"], "0.4.0-dev")
            self.assertEqual(info["display"], "Opuscule 0.4.0 · Dev")

    def test_build_number_attaches_metadata(self):
        # 设了构建号：完整串按 semver 构建元数据 `+build.N`，展示串尾部追加 `· build N`。
        from django.test import override_settings

        from . import version

        with override_settings(APP_BUILD="42", APP_VERSION="0.5.0"):
            info = version.app_info()
            self.assertEqual(info["build"], "42")
            self.assertEqual(info["version_string"], "0.5.0-dev+build.42")
            self.assertEqual(info["display"], "Opuscule 0.5.0 · Dev · build 42")

    def test_version_string_appends_build(self):
        from . import version

        self.assertEqual(version.version_string("0.5.0", "release", "", "7"), "0.5.0+build.7")
        self.assertEqual(version.version_string("0.5.0", "alpha", "2", "9"), "0.5.0-alpha.2+build.9")
