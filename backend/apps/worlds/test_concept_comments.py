"""Concept annotations: member-only list/create/resolve/delete."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.worlds.models import World, WorldConcept, WorldConceptComment, WorldMembership


class WorldConceptCommentTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="concept_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="concept_editor", password="secret")
        self.other_editor = get_user_model().objects.create_user(username="concept_editor2", password="secret")
        self.viewer = get_user_model().objects.create_user(username="concept_viewer", password="secret")
        self.world = World.objects.create(slug="concept-comments", name="评论概念世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.other_editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.viewer, role=WorldMembership.Role.VIEWER)
        self.concept = WorldConcept.objects.create(
            world=self.world,
            draft_json={"type": "doc", "content": [{"type": "paragraph"}]},
            draft_text="草稿",
            body_json={
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "潮汐与双月。"}]}
                ],
            },
            body_text="潮汐与双月。",
            revision=1,
        )
        self.url = "/api/worlds/concept-comments/concept/comments/"

    def test_editor_posts_and_lists_comment_with_quote(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(
            self.url,
            {"body": "这里可以补充月相。", "quote": "潮汐与双月。", "anchor_id": "sec-1"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["author_name"], "concept_editor")
        listed = self.client.get(self.url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]["quote"], "潮汐与双月。")

    def test_non_members_cannot_read_or_write(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(self.url, {"body": "看客评论"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get(self.url).status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

    def test_empty_body_is_rejected(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(self.url, {"body": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorldConceptComment.objects.count(), 0)

    def test_replies_stay_within_one_concept(self):
        self.client.force_authenticate(self.owner)
        root = self.client.post(self.url, {"body": "主评论"}, format="json").data
        reply = self.client.post(
            self.url, {"body": "回复", "parent": root["id"]}, format="json"
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED, reply.data)

        other_world = World.objects.create(slug="concept-comments-other", name="另一世界")
        WorldMembership.objects.create(
            world=other_world, user=self.owner, role=WorldMembership.Role.OWNER
        )
        other_concept = WorldConcept.objects.create(world=other_world, draft_json={}, draft_text="")
        foreign = WorldConceptComment.objects.create(
            concept=other_concept, author=self.owner, body="别处的评论"
        )
        rejected = self.client.post(
            self.url, {"body": "越界回复", "parent": foreign.id}, format="json"
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resolve_and_delete_permissions(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(self.url, {"body": "作者评论"}, format="json").data
        detail = f"{self.url}{created['id']}/"
        resolved = self.client.patch(detail, {"resolved": True}, format="json")
        self.assertEqual(resolved.status_code, status.HTTP_200_OK)
        self.assertTrue(resolved.data["resolved"])

        self.client.force_authenticate(self.other_editor)
        denied = self.client.delete(detail)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(WorldConceptComment.objects.count(), 0)
