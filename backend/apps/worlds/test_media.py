from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from .models import World, WorldMedia, WorldMembership


class WorldMediaApiTests(APITestCase):
    def setUp(self):
        import tempfile

        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.owner = get_user_model().objects.create_user(username="media_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="media_editor", password="secret")
        self.viewer = get_user_model().objects.create_user(username="media_viewer", password="secret")
        self.outsider = get_user_model().objects.create_user(username="media_outsider", password="secret")
        self.world = World.objects.create(slug="media-world", name="媒体世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.viewer, role=WorldMembership.Role.VIEWER)
        self.card = Card.objects.create(world=self.world, title="媒体卡", slug="media-card")

    def _upload(self, content=b"\x89PNG\r\n\x1a\n" + b"x" * 20, content_type="image/png"):
        return self.client.post(
            "/api/worlds/media-world/media/",
            {"file": SimpleUploadedFile("photo.png", content, content_type=content_type)},
            format="multipart",
        )

    def test_owner_and_editor_upload_and_list_shared_media(self):
        self.client.force_authenticate(self.editor)
        uploaded = self._upload()
        self.assertEqual(uploaded.status_code, status.HTTP_201_CREATED, uploaded.data)
        self.assertIn("/media/world-media/", uploaded.data["url"])
        self.assertEqual(uploaded.data["name"], "photo.png")
        self.assertEqual(WorldMedia.objects.count(), 1)

        self.client.force_authenticate(self.owner)
        listed = self.client.get("/api/worlds/media-world/media/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]["id"], uploaded.data["id"])

    def test_permissions_and_validation(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self._upload().status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get("/api/worlds/media-world/media/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get("/api/worlds/media-world/media/").status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(self._upload(content=b"not-an-image").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._upload(content_type="text/plain").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorldMedia.objects.count(), 0)

