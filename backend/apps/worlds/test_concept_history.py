from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import World, WorldConcept, WorldConceptRevision, WorldMembership


def doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "章节"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": text}]},
        ],
    }


class WorldConceptHistoryTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="history_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="history_editor", password="secret")
        self.viewer = get_user_model().objects.create_user(username="history_viewer", password="secret")
        self.outsider = get_user_model().objects.create_user(username="history_outsider", password="secret")
        self.world = World.objects.create(slug="history-world", name="历史世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.viewer, role=WorldMembership.Role.VIEWER)

    def _draft(self, text: str):
        self.client.force_authenticate(self.owner)
        return self.client.patch(
            "/api/worlds/history-world/concept/",
            {"body_json": doc(text)},
            format="json",
        )

    def _publish(self):
        self.client.force_authenticate(self.owner)
        return self.client.post("/api/worlds/history-world/concept/publish/", {}, format="json")

    def _revisions(self):
        return self.client.get("/api/worlds/history-world/concept/revisions/")

    def test_publish_creates_snapshot_and_list(self):
        first = self._draft("alpha")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        published = self._publish()
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        self.assertEqual(published.data["revision"], 1)
        self.assertEqual(WorldConceptRevision.objects.count(), 1)

        listed = self._revisions()
        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.data)
        self.assertEqual(len(listed.data), 1)
        row = listed.data[0]
        self.assertEqual(row["revision"], 1)
        self.assertEqual(row["is_current"], True)
        self.assertEqual(row["created_by"], "history_owner")
        self.assertGreater(row["char_count"], 0)
        self.assertIn("published_at", row)

        detail = self.client.get("/api/worlds/history-world/concept/revisions/1/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        self.assertEqual(detail.data["body_json"], doc("alpha"))
        self.assertIn("alpha", detail.data["body_text"])

    def test_second_publish_and_restore_older_snapshot(self):
        self._draft("alpha")
        self._publish()
        self._draft("beta")
        second = self._publish()
        self.assertEqual(second.data["revision"], 2)

        listed = self._revisions()
        self.assertEqual([row["revision"] for row in listed.data], [2, 1])
        self.assertEqual([row["is_current"] for row in listed.data], [True, False])

        restored = self.client.post("/api/worlds/history-world/concept/revisions/1/restore/", {}, format="json")
        self.assertEqual(restored.status_code, status.HTTP_200_OK, restored.data)
        self.assertEqual(restored.data["draft_json"], doc("alpha"))
        self.assertEqual(restored.data["body_json"], doc("beta"))
        self.assertEqual(restored.data["revision"], 2)
        concept = WorldConcept.objects.get(world=self.world)
        self.assertEqual(concept.draft_json, doc("alpha"))
        self.assertEqual(concept.body_json, doc("beta"))

        third = self._publish()
        self.assertEqual(third.status_code, status.HTTP_200_OK, third.data)
        self.assertEqual(third.data["revision"], 3)
        self.assertEqual(WorldConceptRevision.objects.count(), 3)
        self.assertEqual(WorldConceptRevision.objects.get(revision=3).body_json, doc("alpha"))

    def test_permissions_and_cross_world_isolation(self):
        self._draft("alpha")
        self._publish()
        endpoints = [
            "/api/worlds/history-world/concept/revisions/",
            "/api/worlds/history-world/concept/revisions/1/",
        ]
        self.client.force_authenticate(self.viewer)
        for endpoint in endpoints:
            self.assertEqual(self.client.get(endpoint).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post("/api/worlds/history-world/concept/revisions/1/restore/", {}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(None)
        for endpoint in endpoints:
            self.assertIn(
                self.client.get(endpoint).status_code,
                {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
            )

        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.get(endpoints[0]).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post("/api/worlds/history-world/concept/revisions/1/restore/", {}, format="json").status_code,
            status.HTTP_200_OK,
        )

        other = World.objects.create(slug="other-history-world", name="其他历史世界")
        WorldMembership.objects.create(world=other, user=self.owner, role=WorldMembership.Role.OWNER)
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.get("/api/worlds/other-history-world/concept/revisions/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get("/api/worlds/history-world/concept/revisions/99/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_empty_publish_creates_no_snapshot(self):
        empty = self._draft("")
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        # PATCH accepts an empty draft; publish must reject it.
        self.client.patch(
            "/api/worlds/history-world/concept/",
            {"body_json": {"type": "doc", "content": [{"type": "paragraph"}]}},
            format="json",
        )
        published = self._publish()
        self.assertEqual(published.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorldConceptRevision.objects.count(), 0)
