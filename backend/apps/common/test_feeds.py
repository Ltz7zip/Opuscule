from django.utils import timezone
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.worlds.models import World


class RssFeedTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(slug="feed-world", name="Feed 世界", is_public_read=True)
        self.private = World.objects.create(slug="feed-private", name="私有 Feed", is_public_read=False)
        self.card = Card.objects.create(
            world=self.world, title="公开 <卡片>", slug="public-card",
            type_key="note", body_text="正文 & 内容", is_public=True,
        )
        Card.objects.create(world=self.world, title="私有卡", slug="private-card", is_public=False)
        self.deleted = World.objects.create(slug="feed-deleted", name="删掉", is_public_read=True)
        Card.objects.create(world=self.deleted, title="软删卡", slug="deleted-card", is_public=True)
        self.deleted.deleted_at = timezone.now()
        self.deleted.save(update_fields=["deleted_at"])

    def test_site_feed_lists_only_public_cards_and_escapes(self):
        response = self.client.get("/feed.xml")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/rss+xml", response["Content-Type"])
        text = response.content.decode()
        self.assertIn("公开 &lt;卡片&gt;", text)
        self.assertIn("正文 &amp; 内容", text)
        self.assertNotIn("私有卡", text)
        self.assertNotIn("软删卡", text)

    def test_world_feed_and_private_404(self):
        response = self.client.get("/w/feed-world/feed.xml")
        self.assertEqual(response.status_code, 200)
        self.assertIn("public-card", response.content.decode())
        self.assertEqual(self.client.get("/w/feed-private/feed.xml").status_code, 404)
