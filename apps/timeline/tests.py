# -*- coding: utf-8 -*-
"""接口契约测试：把接口应有的行为固化成断言，以后改代码不会悄悄改坏接口。

    python manage.py test

注意：建测试库时会跑数据迁移，所以测试库里可能已有迁移导入的示例数据；
每个用例的 setUp 会清空数据，保证互不影响。
"""

import json
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase
from django.urls import reverse

from apps.documents.models import Document
from apps.timeline.legacy import DEFAULT_ITEMS, parse_legacy
from apps.timeline.models import TimelineItem, TimelineView
from apps.timeline.normalize import as_float, normalize
from apps.world.models import DOC_TIMELINE, Membership, ROLE_OWNER, World


class TimelineApiTests(TestCase):
    def setUp(self):
        TimelineItem.objects.all().delete()
        TimelineView.objects.update_or_create(pk=1, defaults={"start": 1500.0, "end": 1900.0})
        # 经典时间轴页现在挂在世界地址下（/w/<slug>/timeline），得先有个世界
        self.world = World.objects.create(name="时间轴世界")
        self.client = Client()

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def put_json(self, path, payload):
        return self.client.put(path, data=json.dumps(payload), content_type="application/json")

    # ---------------------------------------------------------------- 页面 --
    def test_index_renders_with_static_urls(self):
        resp = self.client.get(f"/w/{self.world.slug}/timeline")
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "/static/style.css")
        self.assertContains(resp, "/static/script.js")

    def test_unknown_page_renders_signal_lost_404(self):
        # 404 不再把用户丢回一个空壳页面，而是给一页"信号丢失"
        resp = self.client.get("/nope")
        self.assertEqual(resp.status_code, 404)
        self.assertContains(resp, "信号丢失", status_code=404)

    # ------------------------------------------------------------ 读全量 --
    def test_timeline_returns_view_and_items(self):
        resp = self.post_json("/api/items", {"kind": "era", "title": "纪元", "start": 10, "end": 20})
        self.assertEqual(resp.status_code, 201)

        data = self.client.get("/api/timeline").json()
        self.assertEqual(set(data), {"view", "items"})
        self.assertEqual(set(data["view"]), {"start", "end"})

        item = data["items"][0]
        self.assertEqual(
            set(item),
            {"id", "kind", "title", "start", "end", "desc", "row", "cover", "cards", "theme"},
        )
        self.assertEqual(item["theme"], "blue")

    def test_event_payload_has_no_theme_key(self):
        """事件不带 theme 键。"""
        self.post_json("/api/items", {"kind": "event", "title": "事件", "start": 5})
        item = self.client.get("/api/timeline").json()["items"][0]
        self.assertNotIn("theme", item)

    # -------------------------------------------------------------- 新建 --
    def test_create_with_empty_payload_uses_defaults(self):
        resp = self.post_json("/api/items", {})
        self.assertEqual(resp.status_code, 201)
        item = resp.json()
        self.assertEqual(item["title"], "新事件")
        self.assertEqual(item["kind"], "event")
        self.assertEqual([item["start"], item["end"], item["row"]], [0.0, 0.0, 0])
        self.assertEqual(item["cover"], "")
        self.assertEqual(item["cards"], [])

    def test_create_era_swaps_range_and_fixes_theme(self):
        item = self.post_json("/api/items", {
            "kind": "era", "title": "纪元", "start": 1800, "end": 1750, "theme": "bogus", "row": -3,
        }).json()
        self.assertEqual(item["kind"], "era")
        self.assertEqual([item["start"], item["end"]], [1750.0, 1800.0])
        self.assertEqual(item["theme"], "blue")
        self.assertEqual(item["row"], 0)

    def test_create_accepts_kind_aliases(self):
        for alias in ("range", "period"):
            item = self.post_json("/api/items", {"kind": alias}).json()
            self.assertEqual(item["kind"], "era", alias)

    def test_create_keeps_all_known_themes(self):
        """四种配色都放行，认不出来的才落到 blue。"""
        for theme in ("blue", "violet", "red", "teal"):
            item = self.post_json("/api/items", {"kind": "era", "theme": theme}).json()
            self.assertEqual(item["theme"], theme)
        self.assertEqual(
            self.post_json("/api/items", {"kind": "era", "theme": "cyan"}).json()["theme"], "blue")

    def test_create_lowercases_kind(self):
        self.assertEqual(self.post_json("/api/items", {"kind": "ERA"}).json()["kind"], "era")

    def test_ids_are_not_recycled_after_delete(self):
        first = self.post_json("/api/items", {"title": "一"}).json()["id"]
        second = self.post_json("/api/items", {"title": "二"}).json()["id"]
        self.client.delete(f"/api/items/{second}")
        third = self.post_json("/api/items", {"title": "三"}).json()["id"]
        self.assertGreater(third, second)
        self.assertNotIn(third, (first, second))

    # -------------------------------------------------------------- 更新 --
    def test_partial_update_keeps_other_fields(self):
        created = self.post_json("/api/items", {
            "kind": "event", "title": "原标题", "start": 100, "desc": "原介绍", "cover": "c.png",
        }).json()

        item = self.put_json(f"/api/items/{created['id']}", {"start": 200}).json()
        self.assertEqual(item["start"], 200.0)
        self.assertEqual(item["end"], 200.0)
        self.assertEqual(item["title"], "原标题")
        self.assertEqual(item["desc"], "原介绍")
        self.assertEqual(item["cover"], "c.png")

    def test_update_can_switch_kind_both_ways(self):
        created = self.post_json("/api/items", {"kind": "event", "title": "x", "start": 1}).json()
        as_era = self.put_json(f"/api/items/{created['id']}", {"kind": "era"}).json()
        self.assertEqual([as_era["kind"], as_era["theme"]], ["era", "blue"])
        back = self.put_json(f"/api/items/{created['id']}", {"kind": "event"}).json()
        self.assertEqual(back["kind"], "event")
        self.assertNotIn("theme", back)

    def test_patch_is_equivalent_to_put(self):
        created = self.post_json("/api/items", {"title": "原标题", "start": 1}).json()
        resp = self.client.patch(
            f"/api/items/{created['id']}",
            data=json.dumps({"title": "改过"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "改过")

    def test_empty_body_update_keeps_everything(self):
        created = self.post_json("/api/items", {"title": "别动我", "start": 42}).json()
        item = self.put_json(f"/api/items/{created['id']}", {}).json()
        self.assertEqual([item["title"], item["start"]], ["别动我", 42.0])

    def test_update_and_delete_missing_item_return_json_404(self):
        for resp in (self.put_json("/api/items/999999", {"title": "x"}),
                     self.client.delete("/api/items/999999")):
            self.assertEqual(resp.status_code, 404)
            self.assertEqual(resp.json(), {"error": "未找到该事件"})

    # -------------------------------------------------------------- 删除 --
    def test_delete_returns_removed_item(self):
        created = self.post_json("/api/items", {"title": "要删的", "start": 7}).json()
        resp = self.client.delete(f"/api/items/{created['id']}")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["removed"]["title"], "要删的")
        self.assertFalse(TimelineItem.objects.filter(pk=created["id"]).exists())

    # -------------------------------------------------------------- 视野 --
    def test_view_state_is_remembered(self):
        resp = self.put_json("/api/view", {"start": 1600, "end": 1700})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"start": 1600.0, "end": 1700.0})
        self.assertEqual(self.client.get("/api/timeline").json()["view"], {"start": 1600.0, "end": 1700.0})

    def test_invalid_view_state_is_ignored_without_error(self):
        self.put_json("/api/view", {"start": 1600, "end": 1700})
        for payload in ({"start": 1800, "end": 1700}, {"start": 1}, {"end": 2}, {}, {"start": None, "end": None}):
            resp = self.put_json("/api/view", payload)
            self.assertEqual(resp.status_code, 200, payload)
            self.assertEqual(resp.json(), {"start": 1600.0, "end": 1700.0}, payload)

    # ------------------------------------------------------------ 404/405 --
    def test_unknown_api_path_returns_json_404(self):
        for path in ("/api/nope", "/api/", "/api/items/abc", "/api/timeline/"):
            resp = self.client.get(path)
            self.assertEqual(resp.status_code, 404, path)
            self.assertEqual(resp.json(), {"error": "接口不存在"}, path)

    def test_wrong_method_returns_405(self):
        for method, path in (("get", "/api/view"), ("put", "/api/items"), ("delete", "/api/view")):
            resp = getattr(self.client, method)(path)
            self.assertEqual(resp.status_code, 405, f"{method} {path}")

    # --------------------------------------------------------------- CSRF --
    def test_writes_do_not_require_csrf_token(self):
        """前端不会带 CSRF token，所以写接口必须豁免 CSRF 才不会被拦成 403。"""
        client = Client(enforce_csrf_checks=True)
        resp = client.post("/api/items", data=json.dumps({"title": "无 token"}),
                           content_type="application/json")
        self.assertEqual(resp.status_code, 201)

    # ------------------------------------------------------------ 规范化 --
    def test_normalize_edge_cases(self):
        self.assertIsNone(as_float(True))          # bool 不算数字
        self.assertEqual(as_float("1642.5abc"), 1642.5)
        self.assertEqual(as_float("-30"), -30.0)
        self.assertEqual(as_float("abc"), None)

        values = normalize({"title": "  " + "长" * 200, "desc": "a\r\nb", "row": "7", "cover": "x" * 5000,
                            "cards": [{"title": "a", "url": "u", "cover": "c", "junk": 1}, "字符串"] + [{}] * 50})
        self.assertEqual(len(values["title"]), 120)
        self.assertEqual(values["desc"], "a\nb")
        self.assertEqual(values["row"], 7)
        self.assertEqual(len(values["cover"]), 1200)
        # 40 条上限是按「原始条目」截断的，非字典条目会被丢掉，所以这里剩 39 条
        self.assertEqual(len(values["cards"]), 39)
        self.assertEqual(values["cards"][0], {"title": "a", "url": "u", "cover": "c"})

    def test_normalize_merges_fallback(self):
        base = {"kind": "era", "title": "原", "start": 1.0, "end": 2.0, "theme": "red"}
        values = normalize({"end": 9}, fallback=base)
        self.assertEqual([values["kind"], values["title"], values["start"], values["end"], values["theme"]],
                         ["era", "原", 1.0, 9.0, "red"])


class LegacyTimelineAccessTests(TestCase):
    """经典时间轴的访问口径：库里已有账号时，匿名访客读不走这一份数据。

    这份数据是全场共用的（不挂在任何世界上），所以口径是"登录才能看"——
    匿名 `GET /api/timeline` 曾经能整份读走（2026-10-15 体检 F2）。
    库里一个用户都没有时按"首次安装例外"放行，与 /world 的读守门人一致。
    """

    def setUp(self):
        TimelineItem.objects.all().delete()
        TimelineView.objects.update_or_create(pk=1, defaults={"start": 1500.0, "end": 1900.0})
        TimelineItem.objects.create(kind="event", title="不该被匿名读到", start=1600)
        self.anonymous = Client()
        # 默认就处在"库里已有账号"的状态——这正是登录口径生效的前提
        self.founder = self._founder()
        self.world = World.objects.get(owner=self.founder)

    def _founder(self):
        """建一个"有自己世界"的账号——注册即得一个世界（方案 A）。"""
        user = User.objects.create_user("founder", password="pw-Str0ng!23")
        world = World.objects.create(name="创始世界", owner=user)
        Membership.objects.create(world=world, user=user, role=ROLE_OWNER)
        return user

    def _logged_in(self):
        client = Client()
        client.force_login(self.founder)
        return client

    def test_timeline_data_requires_login(self):
        resp = self.anonymous.get("/api/timeline")
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(resp.json()["need_login"])
        self.assertNotIn("不该被匿名读到", resp.content.decode())

    def test_legacy_page_redirects_anonymous_to_login(self):
        resp = self.anonymous.get(f"/w/{self.world.slug}/timeline")
        self.assertEqual(resp.status_code, 302)
        self.assertTrue(resp["Location"].startswith("/login?next="))

    def test_logged_in_user_can_read(self):
        client = self._logged_in()
        page = client.get(f"/w/{self.world.slug}/timeline")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "/static/style.css")
        self.assertEqual(client.get("/api/timeline").status_code, 200)

    def test_first_install_without_users_still_open(self):
        """库里一个账号都没有时照旧放行：否则首次安装的人连演示数据都看不见。"""
        User.objects.all().delete()
        self.assertFalse(User.objects.exists())
        self.assertEqual(self.anonymous.get(f"/w/{self.world.slug}/timeline").status_code, 200)
        self.assertEqual(self.anonymous.get("/api/timeline").status_code, 200)

    def test_embedded_timeline_still_readable_for_published_doc(self):
        """发布站点里嵌的只读时间线不受影响：它走 /api/world/timelines/<id>/classic。"""
        self.world.is_published = True
        self.world.published_slug = "site1"
        self.world.save(update_fields=["is_published", "published_slug"])
        doc = Document.objects.create(
            world=self.world, document_type=DOC_TIMELINE, name="站点时间线", is_published=True,
        )
        resp = self.anonymous.get(f"/api/world/timelines/{doc.id}/classic")
        self.assertEqual(resp.status_code, 200)


class LegacyImportTests(TestCase):
    """旧格式 JSON 文件的解析兼容性。"""

    def test_array_only_file(self):
        items, view = parse_legacy([{"id": 1, "title": "旧格式"}])
        self.assertEqual(len(items), 1)
        self.assertEqual(view, {"start": 1500.0, "end": 1900.0})

    def test_missing_or_broken_file_falls_back_to_sample_data(self):
        for raw in (None, "坏数据", 42):
            items, view = parse_legacy(raw)
            self.assertEqual(len(items), len(DEFAULT_ITEMS), raw)
            self.assertEqual(view, {"start": 1500.0, "end": 1900.0})

    def test_view_values_are_coerced(self):
        _, view = parse_legacy({"items": [], "view": {"start": "1578.5", "end": 1768.3195967432857}})
        self.assertEqual(view, {"start": 1578.5, "end": 1768.3195967432857})

    def test_items_key_must_be_a_list(self):
        items, _ = parse_legacy({"items": "不是数组"})
        self.assertEqual(len(items), len(DEFAULT_ITEMS))

    def test_urls_reverse(self):
        self.assertEqual(reverse("timeline:timeline"), "/api/timeline")
        self.assertEqual(reverse("timeline:item-detail", args=[7]), "/api/items/7")

    def test_command_refuses_missing_file_instead_of_writing_sample_data(self):
        """命令行读不到文件就该报错，不能往已有库里塞示例数据。"""
        before = TimelineItem.objects.count()
        with self.assertRaises(CommandError):
            call_command("import_legacy_json", "根本不存在的文件.json", stdout=StringIO())
        self.assertEqual(TimelineItem.objects.count(), before)

    def test_command_imports_an_explicit_file(self):
        """显式给路径时照常导入（同 id 覆盖）。"""
        path = Path(tempfile.mkdtemp()) / "backup.json"
        path.write_text(json.dumps({
            "view": {"start": 1000, "end": 2000},
            "items": [{"id": 1, "kind": "era", "title": "从文件导入", "start": 1, "end": 2, "theme": "red"}],
        }), encoding="utf-8")

        call_command("import_legacy_json", str(path), stdout=StringIO())

        item = TimelineItem.objects.get(pk=1)
        self.assertEqual([item.title, item.kind, item.theme], ["从文件导入", "era", "red"])
        self.assertEqual(TimelineView.load().to_payload(), {"start": 1000.0, "end": 2000.0})
