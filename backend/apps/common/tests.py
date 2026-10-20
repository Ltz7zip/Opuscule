from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.identity.models import UserProfile
from apps.worlds.models import World


class SeoTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            username="seo_owner", password="secret"
        )
        UserProfile.objects.create(user=self.owner, display_name="SEO Owner", is_public=True)
        self.world = World.objects.create(
            slug="seo-world", name="SEO 世界", is_public_read=True
        )
        self.card = Card.objects.create(
            world=self.world,
            title="公开卡片",
            slug="public-card",
            body_json={"type": "doc", "content": []},
        )
        self.private_world = World.objects.create(
            slug="seo-private", name="私有世界", is_public_read=False
        )
        Card.objects.create(
            world=self.private_world,
            title="私有卡片",
            slug="private-card",
            body_json={"type": "doc", "content": []},
        )
        self.private_user = get_user_model().objects.create_user(
            username="seo_private", password="secret"
        )
        UserProfile.objects.create(user=self.private_user, is_public=False)

    def test_robots_points_to_sitemap_and_blocks_private_routes(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"Sitemap: http://testserver/sitemap.xml", response.content)
        self.assertIn(b"Disallow: /trash", response.content)
        self.assertIn(b"Disallow: /invite/", response.content)
        self.assertIn("max-age=300", response["Cache-Control"])

    def test_sitemap_includes_public_world_card_and_profile(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"http://testserver/w/seo-world/wiki", response.content)
        self.assertIn(b"http://testserver/w/seo-world/wiki/public-card", response.content)
        self.assertIn(b"http://testserver/u/seo_owner", response.content)

    def test_sitemap_excludes_private_and_deleted(self):
        self.world.deleted_at = timezone.now()
        self.world.save(update_fields=["deleted_at"])
        response = self.client.get("/sitemap.xml")
        self.assertNotIn(b"seo-world", response.content)
        self.assertNotIn(b"seo-private", response.content)
        self.assertNotIn(b"seo_private", response.content)


class SharePageTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            username="share_owner", password="secret"
        )
        UserProfile.objects.create(user=self.owner, display_name="Share Owner", is_public=True)
        self.world = World.objects.create(
            slug="share-world", name="分享世界", description="一个能被分享的世界。", is_public_read=True
        )
        self.card = Card.objects.create(
            world=self.world,
            title="分享卡片",
            slug="share-card",
            body_json={"type": "doc", "content": []},
            body_text="这是服务端分享页正文。",
        )
        self.private_world = World.objects.create(
            slug="share-private", name="私有分享世界", is_public_read=False
        )
        Card.objects.create(
            world=self.private_world,
            title="私有卡片",
            slug="private-card",
            body_text="不应出现。",
        )

    def test_public_card_share_is_server_rendered(self):
        response = self.client.get("/share/w/share-world/share-card/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "分享卡片")
        self.assertContains(response, "这是服务端分享页正文。")
        self.assertContains(response, 'property="og:type" content="article"')
        self.assertContains(response, "noindex,follow")
        self.assertIn("max-age=60", response["Cache-Control"])

    def test_public_profile_share_is_server_rendered(self):
        response = self.client.get("/share/u/share_owner/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Share Owner")
        self.assertEqual(
            self.client.get("/share/u/share_private/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_private_world_and_card_share_are_hidden(self):
        self.assertEqual(
            self.client.get("/share/w/share-private/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get("/share/w/share-private/private-card/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.world.is_public_read = False
        self.world.save(update_fields=["is_public_read"])
        self.assertEqual(
            self.client.get("/share/w/share-world/share-card/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
