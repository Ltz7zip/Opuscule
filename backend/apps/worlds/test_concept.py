from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from .models import World, WorldAuditEvent, WorldConcept, WorldMembership


def body(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]},
        ],
    }


class WorldConceptApiTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="concept_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="concept_editor", password="secret")
        self.viewer = get_user_model().objects.create_user(username="concept_viewer", password="secret")
        self.outsider = get_user_model().objects.create_user(username="concept_outsider", password="secret")
        self.world = World.objects.create(
            slug="concept-world",
            name="概念世界",
            description="一篇世界级概念",
            is_public_read=True,
        )
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.viewer, role=WorldMembership.Role.VIEWER)

    def test_public_concept_is_404_before_publish(self):
        response = self.client.get("/api/worlds/concept-world/concept/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_edit_without_row_reports_exists_false_and_does_not_create(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/worlds/concept-world/concept/edit/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data["exists"])
        self.assertEqual(response.data["body_json"], None)
        self.assertEqual(response.data["draft_json"]["type"], "doc")
        self.assertEqual(WorldConcept.objects.count(), 0)

    def test_only_owner_or_editor_can_edit(self):
        response = self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("未登录")},
            format="json",
        )
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        for user in (self.viewer, self.outsider):
            self.client.force_authenticate(user)
            response = self.client.patch(
                "/api/worlds/concept-world/concept/",
                {"body_json": body("无权")},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_draft_and_publish_keep_public_snapshot_separate(self):
        self.client.force_authenticate(self.owner)
        draft = self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("潮汐历的第一版")},
            format="json",
        )
        self.assertEqual(draft.status_code, status.HTTP_200_OK, draft.data)
        self.assertTrue(draft.data["exists"])
        self.assertEqual(draft.data["draft_text"], "潮汐历的第一版")
        self.assertEqual(draft.data["body_json"], None)
        self.assertEqual(self.client.get("/api/worlds/concept-world/concept/").status_code, 404)

        published = self.client.post("/api/worlds/concept-world/concept/publish/")
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        self.assertEqual(published.data["revision"], 1)
        self.assertIsNotNone(published.data["published_at"])
        public = self.client.get("/api/worlds/concept-world/concept/")
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data["body_text"], "潮汐历的第一版")
        self.assertNotIn("draft_json", public.data)
        self.assertTrue(
            self.world.audit_events.filter(action=WorldAuditEvent.Action.CONCEPT_PUBLISHED).exists()
        )

        # A published concept can be edited without leaking the new draft.
        self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("尚未发布的第二版")},
            format="json",
        )
        public = self.client.get("/api/worlds/concept-world/concept/")
        self.assertEqual(public.data["body_text"], "潮汐历的第一版")
        self.assertNotEqual(public.data["body_text"], "尚未发布的第二版")

        second = self.client.post("/api/worlds/concept-world/concept/publish/")
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(second.data["revision"], 2)
        self.assertEqual(second.data["body_text"], "尚未发布的第二版")

    def test_editor_can_publish_and_byline_is_recorded(self):
        self.client.force_authenticate(self.editor)
        self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("编辑者写的")},
            format="json",
        )
        published = self.client.post("/api/worlds/concept-world/concept/publish/")
        self.assertEqual(published.status_code, status.HTTP_200_OK)
        self.assertEqual(published.data["created_by"], "concept_editor")
        self.assertEqual(published.data["updated_by"], "concept_editor")

    def test_empty_or_too_deep_draft_is_rejected(self):
        self.client.force_authenticate(self.owner)
        empty = self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": {"type": "doc", "content": [{"type": "paragraph"}]}},
            format="json",
        )
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post("/api/worlds/concept-world/concept/publish/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        deep = {"type": "doc"}
        cursor = deep
        for _ in range(70):
            child = {"type": "doc"}
            cursor["content"] = [child]
            cursor = child
        response = self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": deep},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_private_world_public_read_is_hidden_from_anonymous(self):
        self.world.is_public_read = False
        self.world.save(update_fields=["is_public_read"])
        self.client.force_authenticate(self.owner)
        self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("私域正文")},
            format="json",
        )
        self.client.post("/api/worlds/concept-world/concept/publish/")
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get("/api/worlds/concept-world/concept/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.client.force_authenticate(self.viewer)
        response = self.client.get("/api/worlds/concept-world/concept/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["body_text"], "私域正文")

    def test_concept_does_not_create_a_card(self):
        self.client.force_authenticate(self.owner)
        self.client.patch(
            "/api/worlds/concept-world/concept/",
            {"body_json": body("不是卡片")},
            format="json",
        )
        self.client.post("/api/worlds/concept-world/concept/publish/")
        self.assertEqual(Card.objects.filter(world=self.world).count(), 0)
        detail = self.client.get("/api/worlds/concept-world/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["cards"], [])
        self.assertEqual(detail.data["card_count"], 0)


class WorldConceptDraftConcurrencyTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="concurrency_owner", password="secret")
        self.world = World.objects.create(slug="concurrency-world", name="并发世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        self.client.force_authenticate(self.owner)

    def test_stale_expected_updated_at_returns_409(self):
        first = self.client.patch(
            "/api/worlds/concurrency-world/concept/",
            {"body_json": body("first")},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        expected = first.data["updated_at"]

        second = self.client.patch(
            "/api/worlds/concurrency-world/concept/",
            {"body_json": body("second"), "expected_updated_at": expected},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)

        stale = self.client.patch(
            "/api/worlds/concurrency-world/concept/",
            {"body_json": body("stale"), "expected_updated_at": expected},
            format="json",
        )
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT, stale.data)
        self.assertIn("别处更新", stale.data["detail"])
        self.assertEqual(stale.data["concept"]["draft_json"], body("second"))
        self.assertEqual(WorldConcept.objects.get(world=self.world).draft_json, body("second"))
