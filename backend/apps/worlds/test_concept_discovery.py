"""Public discovery of published world concepts: search hits and RSS items."""

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.worlds.models import World, WorldConcept


class ConceptDiscoveryTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(slug="discover-world", name="发现世界", is_public_read=True)
        self.private = World.objects.create(slug="discover-private", name="私有世界", is_public_read=False)
        self.concept = WorldConcept.objects.create(
            world=self.world,
            draft_json={"type": "doc", "content": [{"type": "paragraph"}]},
            draft_text="草稿里的潮汐",
            body_json={"type": "doc", "content": [{"type": "paragraph"}]},
            body_text="这片大陆的潮汐由双月牵引。",
            published_at=timezone.now(),
            revision=2,
        )
        WorldConcept.objects.create(
            world=self.private,
            draft_json={},
            draft_text="",
            body_json={"type": "doc", "content": [{"type": "paragraph"}]},
            body_text="私有世界的潮汐秘闻。",
            published_at=timezone.now(),
            revision=1,
        )
        self.draft_world = World.objects.create(
            slug="discover-draft", name="草稿世界", is_public_read=True
        )
        WorldConcept.objects.create(
            world=self.draft_world,
            draft_json={},
            draft_text="还没发布的潮汐",
            body_json={},
            body_text="草稿里的潮汐不该被搜到。",
        )
        Card.objects.create(world=self.world, title="潮汐表", slug="tide-card", is_public=True, body_text="潮汐")

    def test_search_lists_only_published_public_concepts(self):
        response = self.client.get("/api/search/?q=潮汐")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["concepts"]), 1)
        hit = response.data["concepts"][0]
        self.assertEqual(hit["world_slug"], "discover-world")
        self.assertEqual(hit["title"], "世界概念")
        self.assertEqual(hit["revision"], 2)
        self.assertIn("潮汐", hit["snippet"])
        self.assertNotIn("discover-draft", [item["world_slug"] for item in response.data["concepts"]])

    def test_search_world_scope_and_empty_query_shape(self):
        scoped = self.client.get("/api/search/?q=潮汐&world=discover-private")
        self.assertEqual(scoped.data["concepts"], [])
        empty = self.client.get("/api/search/?q=")
        self.assertEqual(empty.data["concepts"], [])

    def test_site_feed_includes_concept_item(self):
        text = self.client.get("/feed.xml").content.decode()
        self.assertIn("opuscule:concept:", text)
        self.assertIn("这片大陆的潮汐由双月牵引。", text)
        self.assertNotIn("私有世界的潮汐秘闻。", text)
        self.assertNotIn("草稿里的潮汐不该被搜到。", text)
        self.assertIn("/w/discover-world/wiki<", text)

    def test_world_feed_includes_concept_and_private_is_404(self):
        text = self.client.get("/w/discover-world/feed.xml").content.decode()
        self.assertIn("opuscule:concept:", text)
        self.assertEqual(self.client.get("/w/discover-private/feed.xml").status_code, 404)
