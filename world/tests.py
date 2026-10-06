# -*- coding: utf-8 -*-
"""world 应用的测试：模型语义、取值规则、接口往返、两条管理命令。

跑法：``.venv/bin/python manage.py test world``（或直接 ``manage.py test`` 跑全部）。
"""

from __future__ import annotations

import json

from django.test import TestCase

from . import publish

from timeline.models import TimelineItem, TimelineView

from .models import (
    DocumentVersion,
    InviteCode,
    Membership,
    Presence,
    MapMarker,
    CAL_CUSTOM,
    DOC_CARD,
    DOC_FOLDER,
    DOC_TIMELINE,
    Calendar,
    Card,
    Document,
    EntityType,
    Era,
    PropertyDef,
    TimelineEvent,
    World,
)
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
        from world.autolink import detect_new_names

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
        from world.graph import build_graph

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
        from world.graph import build_graph

        lonely, _ = self.make_card(name="没人连我")
        data = build_graph(self.world, hide_isolated=True)
        self.assertNotIn(lonely.id, [n["id"] for n in data["nodes"]])

        data = build_graph(self.world, query="Balri")
        ids = {n["id"] for n in data["nodes"]}
        self.assertIn(self.faction_doc.id, ids)
        self.assertIn(self.hero.id, ids)      # 命中节点的一跳邻居也在
        self.assertNotIn(lonely.id, ids)

    def test_neighborhood_center(self):
        from world.graph import build_graph

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
        from world.publish import publish

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

        from world.publish import unpublish

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
        from world.publish import related_documents

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
        self.assertEqual(renamed["resolved_labels"]["spouse"], "配偶")   # 其余仍走模板

    def test_military_template_labels(self):
        variant = self.client.post(f"/api/world/trees/{self.tree_id}/variants", data=json.dumps(
            {"name": "军团", "kind": "military"}), content_type="application/json").json()
        self.assertEqual(variant["resolved_labels"]["parent"], "上级")

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
        self.assertIn("只支持", response.json()["error"])

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
        from world.sanitize import clean_html, html_to_text

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
        from world.models import TreeEdge, TreeNode, TreeVariant

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

    def test_second_user_needs_an_invite(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        denied = self.post_json("/api/world/auth/register",
                                {"username": "friend", "password": "very-secret-2"})
        self.assertEqual(denied.status_code, 400)
        self.assertIn("邀请码", denied.json()["error"])

        invite = self.post_json("/api/world/collaborators/invites", {"role": "editor"}).json()
        allowed = self.post_json("/api/world/auth/register",
                                 {"username": "friend", "password": "very-secret-2", "invite": invite["code"]})
        self.assertEqual(allowed.status_code, 200, allowed.content[:200])
        self.assertEqual(allowed.json()["viewer"]["role"], "editor")
        again = self.post_json("/api/world/auth/register",
                               {"username": "third", "password": "very-secret-3", "invite": invite["code"]})
        self.assertEqual(again.status_code, 400)          # 一次性邀请码用过就废
        self.assertIn("用完", again.json()["error"])

    def test_writes_require_login_once_a_user_exists(self):
        self.post_json("/api/world/auth/register", {"username": "owner", "password": "very-secret-1"})
        card, _card_row = self.make_card(name="已有的卡")
        self.client.post("/api/world/auth/logout")

        blocked = self.post_json("/api/world/documents", {"type": "card", "name": "偷偷建的"})
        self.assertEqual(blocked.status_code, 401)
        self.assertIn("登录", blocked.json()["error"])

        # 读还是公开的（发布站点要靠它）
        self.assertEqual(self.client.get("/api/world/state").status_code, 200)
        self.assertEqual(self.client.get(f"/api/world/cards/{card.id}").status_code, 200)

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


class FuzzyMentionTests(BaseWorldCase):
    """typo-tolerant 提及与复数 / 所有格自动链接。"""

    def setUp(self):
        super().setUp()
        self.document, _card = self.make_card(name="Harrowdeep", aliases=["The Deep Gate"])

    def test_plural_and_possessive_are_linked(self):
        from world import autolink

        text = "Harrowdeeps 的城门，以及 Harrowdeep's 阴影。"
        matches = autolink.find_mentions(self.world, text)
        self.assertEqual(len(matches), 2)
        self.assertEqual(matches[0]["matched"], "Harrowdeeps")
        self.assertEqual(matches[1]["matched"], "Harrowdeep's")

    def test_fuzzy_candidates_catch_a_typo(self):
        from world import autolink

        found = autolink.fuzzy_candidates(self.world, "他们在 Harrowdeap 落脚")
        self.assertTrue(found)
        self.assertEqual(found[0]["name"], "Harrowdeep")
        self.assertEqual(found[0]["matched"], "Harrowdeap")

    def test_short_names_are_not_fuzzy_matched(self):
        from world import autolink

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
        from . import publish
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

    def test_search_paginates_twenty_per_page(self):
        for index in range(25):
            self.make_card(name=f"批量{index:02d}共同词")
        from . import publish
        publish.publish(self.world, audience="public")
        first = self.client.get(f"/s/{self.slug}/search?q=共同词").content.decode()
        self.assertIn("第 1 / 2 页", first)
        second = self.client.get(f"/s/{self.slug}/search?q=共同词&page=2").content.decode()
        self.assertIn("第 2 / 2 页", second)

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
