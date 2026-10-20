from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.worlds.models import World, WorldMembership


class MapApiTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="map_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="map_editor", password="secret")
        self.outsider = get_user_model().objects.create_user(username="map_outsider", password="secret")
        self.world = World.objects.create(slug="map-world", name="地图世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        self.card = Card.objects.create(
            world=self.world, title="七钟楼", slug="seven-bells", body_json={"type": "doc", "content": []}
        )
        self.private_world = World.objects.create(
            slug="map-private", name="私有地图", is_public_read=False
        )

    def test_public_map_is_read_only(self):
        response = self.client.get("/api/worlds/map-world/map/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["world"]["slug"], "map-world")
        self.assertFalse(response.data["can_edit"])
        self.assertEqual(response.data["markers"], [])

    def test_editor_can_add_move_and_delete_marker(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(
            "/api/worlds/map-world/map/markers/",
            {"label": "七钟楼", "kind": "place", "x": 0.4, "y": 0.6, "card": self.card.id},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        marker_id = created.data["id"]
        self.assertEqual(created.data["card_title"], "七钟楼")

        moved = self.client.patch(
            f"/api/worlds/map-world/map/markers/{marker_id}/",
            {"x": 0.8, "y": 0.2},
            format="json",
        )
        self.assertEqual(moved.status_code, status.HTTP_200_OK)
        self.assertAlmostEqual(moved.data["x"], 0.8)

        deleted = self.client.delete(f"/api/worlds/map-world/map/markers/{marker_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_private_and_outsider_write_are_rejected(self):
        self.assertEqual(self.client.get("/api/worlds/map-private/map/").status_code, 404)
        self.client.force_authenticate(self.outsider)
        denied = self.client.post(
            "/api/worlds/map-world/map/markers/",
            {"label": "x", "x": 0.5, "y": 0.5},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_coordinates_and_cross_world_card(self):
        self.client.force_authenticate(self.owner)
        bad = self.client.post(
            "/api/worlds/map-world/map/markers/",
            {"label": "越界", "x": 1.5, "y": 0.5},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        other_world = World.objects.create(slug="other-map", name="别的世界")
        other_card = Card.objects.create(
            world=other_world, title="别处", slug="elsewhere", body_json={"type": "doc", "content": []}
        )
        wrong = self.client.post(
            "/api/worlds/map-world/map/markers/",
            {"label": "错卡", "x": 0.5, "y": 0.5, "card": other_card.id},
            format="json",
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)


class MapBackgroundTests(APITestCase):
    def setUp(self):
        import tempfile

        from django.test import override_settings
        from django.contrib.auth import get_user_model

        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.owner = get_user_model().objects.create_user(username="bg_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="bg_editor", password="secret")
        self.world = World.objects.create(slug="bg-world", name="背景世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)

    def _upload(self, name="map.png", content=b"\x89PNG\r\n\x1a\n" + b"x" * 20, content_type="image/png"):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            "/api/worlds/bg-world/map/background/",
            {"file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_owner_uploads_and_removes_background(self):
        self.client.force_authenticate(self.owner)
        uploaded = self._upload()
        self.assertEqual(uploaded.status_code, 200, uploaded.data)
        self.assertIn("/media/world-map-backgrounds/", uploaded.data["background_url"])
        self.world.refresh_from_db()
        self.assertTrue(self.world.map_background.name)
        self.assertEqual(self.client.get("/api/worlds/bg-world/map/").data["background_url"], uploaded.data["background_url"])
        removed = self.client.delete("/api/worlds/bg-world/map/background/")
        self.assertEqual(removed.status_code, 204)
        self.world.refresh_from_db()
        self.assertFalse(self.world.map_background.name)
        self.assertIsNone(self.client.get("/api/worlds/bg-world/map/").data["background_url"])

    def test_editor_and_invalid_images_are_rejected(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(self._upload().status_code, 403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self._upload(content=b"not-an-image").status_code, 400)
        self.assertEqual(self._upload(content_type="text/plain").status_code, 400)
