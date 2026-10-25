from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.worlds.models import World, WorldMembership


class TimelineApiTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="timeline_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="timeline_editor", password="secret")
        self.outsider = get_user_model().objects.create_user(username="timeline_outsider", password="secret")
        self.world = World.objects.create(slug="timeline-world", name="时间线世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        self.card = Card.objects.create(
            world=self.world, title="白塔", slug="white-tower",
            body_json={"type": "doc", "content": []},
        )
        self.private_world = World.objects.create(slug="timeline-private", name="私有时间线", is_public_read=False)

    def test_public_timeline_is_read_only(self):
        response = self.client.get("/api/worlds/timeline-world/timeline/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["world"]["slug"], "timeline-world")
        self.assertFalse(response.data["can_edit"])
        self.assertEqual(response.data["entries"], [])
        self.assertEqual(self.client.get("/api/worlds/timeline-private/timeline/").status_code, 404)

    def test_editor_can_create_update_and_delete_entry(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(
            "/api/worlds/timeline-world/timeline/entries/",
            {"year": 487, "end_year": 490, "era": "潮汐历", "title": "白塔沉没", "description": "异常涨潮。", "card": self.card.id},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        entry_id = created.data["id"]
        self.assertEqual(created.data["card_title"], "白塔")
        self.assertEqual(created.data["end_year"], 490)

        updated = self.client.patch(
            f"/api/worlds/timeline-world/timeline/entries/{entry_id}/",
            {"year": 488, "title": "白塔沉没之后"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["year"], 488)
        invalid = self.client.patch(
            f"/api/worlds/timeline-world/timeline/entries/{entry_id}/",
            {"end_year": 400},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        deleted = self.client.delete(f"/api/worlds/timeline-world/timeline/entries/{entry_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_outsider_and_invalid_card_are_rejected(self):
        self.client.force_authenticate(self.outsider)
        denied = self.client.post(
            "/api/worlds/timeline-world/timeline/entries/",
            {"year": 1, "title": "x"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        other_world = World.objects.create(slug="timeline-other", name="别处")
        other_card = Card.objects.create(
            world=other_world, title="别卡", slug="other-card",
            body_json={"type": "doc", "content": []},
        )
        self.client.force_authenticate(self.owner)
        wrong = self.client.post(
            "/api/worlds/timeline-world/timeline/entries/",
            {"year": 1, "title": "错卡", "card": other_card.id},
            format="json",
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)


class EraApiTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="era_owner", password="secret")
        self.outsider = get_user_model().objects.create_user(username="era_outsider", password="secret")
        self.world = World.objects.create(slug="era-world", name="纪元世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)

    def test_owner_creates_era_and_public_timeline_includes_it(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post(
            "/api/worlds/era-world/eras/",
            {"name": "潮汐历", "start_year": 480, "end_year": 528, "color": "blue"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        public = self.client.get("/api/worlds/era-world/timeline/")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["eras"][0]["name"], "潮汐历")
        self.assertEqual(public.data["eras"][0]["end_year"], 528)

    def test_era_validation_and_permissions(self):
        self.client.force_authenticate(self.owner)
        invalid = self.client.post(
            "/api/worlds/era-world/eras/",
            {"name": "坏区间", "start_year": 500, "end_year": 400},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.client.force_authenticate(self.outsider)
        denied = self.client.post(
            "/api/worlds/era-world/eras/",
            {"name": "越权", "start_year": 1, "end_year": 2},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)


class MultipleTimelineApiTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="multi_owner", password="secret")
        self.outsider = get_user_model().objects.create_user(username="multi_outsider", password="secret")
        self.world = World.objects.create(slug="multi-world", name="多线世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)

    def test_owner_creates_secondary_timeline_and_entries_are_isolated(self):
        self.client.force_authenticate(self.owner)
        main = self.client.get("/api/worlds/multi-world/timeline/").data["timeline"]
        side = self.client.post(
            "/api/worlds/multi-world/timelines/",
            {"name": "支线", "slug": "side", "is_default": False},
            format="json",
        )
        self.assertEqual(side.status_code, 201, side.data)
        created = self.client.post(
            "/api/worlds/multi-world/timeline/entries/",
            {"year": 10, "title": "支线事件", "timeline": side.data["id"], "era": ""},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        main_view = self.client.get("/api/worlds/multi-world/timeline/").data
        side_view = self.client.get("/api/worlds/multi-world/timeline/?timeline=side").data
        self.assertEqual(main_view["timeline"]["slug"], main["slug"])
        self.assertEqual(main_view["entries"], [])
        self.assertEqual(side_view["timeline"]["slug"], "side")
        self.assertEqual(len(side_view["entries"]), 1)
        self.assertEqual(len(side_view["timelines"]), 2)

    def test_public_cannot_create_timeline(self):
        response = self.client.post(
            "/api/worlds/multi-world/timelines/",
            {"name": "越权", "slug": "nope"},
            format="json",
        )
        self.assertIn(response.status_code, {401, 403})

    def test_duplicate_timeline_slug_is_a_validation_error(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post(
            "/api/worlds/multi-world/timelines/",
            {"name": "支线", "slug": "side"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        duplicate = self.client.post(
            "/api/worlds/multi-world/timelines/",
            {"name": "撞车", "slug": "side"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slug", duplicate.data)


class TimelineMonthTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="month_owner", password="secret")
        self.world = World.objects.create(slug="month-world", name="月份世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)

    def test_month_is_stored_and_validated(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post(
            "/api/worlds/month-world/timeline/entries/",
            {"year": 500, "month": 3, "title": "春季事件"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["month"], 3)
        invalid = self.client.post(
            "/api/worlds/month-world/timeline/entries/",
            {"year": 500, "month": 13, "title": "坏月份"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
