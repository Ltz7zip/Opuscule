import os
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from .models import World, WorldAuditEvent, WorldConcept, WorldMedia, WorldMembership


class WorldMediaDeleteTests(APITestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.owner = get_user_model().objects.create_user(username="media_delete_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="media_delete_editor", password="secret")
        self.viewer = get_user_model().objects.create_user(username="media_delete_viewer", password="secret")
        self.world = World.objects.create(slug="media-delete-world", name="媒体删除世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldMembership.objects.create(world=self.world, user=self.viewer, role=WorldMembership.Role.VIEWER)
        self.card = Card.objects.create(world=self.world, title="媒体删除卡", slug="media-delete-card")

    def _upload(self, content=None):
        return self.client.post(
            "/api/worlds/media-delete-world/media/",
            {
                "file": SimpleUploadedFile(
                    "delete-me.png",
                    content or (b"\x89PNG\r\n\x1a\n" + b"x" * 20),
                    content_type="image/png",
                )
            },
            format="multipart",
        )

    def _media(self):
        self.client.force_authenticate(self.owner)
        uploaded = self._upload()
        self.assertEqual(uploaded.status_code, status.HTTP_201_CREATED, uploaded.data)
        media = WorldMedia.objects.get(pk=uploaded.data["id"])
        return media, uploaded.data["url"]

    @staticmethod
    def _image_doc(url):
        return {"type": "doc", "content": [{"type": "image", "attrs": {"src": url}}]}

    def test_delete_unreferenced_media_and_audit(self):
        media, _ = self._media()
        path = media.file.path
        self.assertTrue(os.path.exists(path))
        self.client.force_authenticate(self.owner)

        listed = self.client.get("/api/worlds/media-delete-world/media/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data[0]["usage"], 0)
        self.assertEqual(listed.data[0]["references"], [])

        deleted = self.client.delete(f"/api/worlds/media-delete-world/media/{media.id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorldMedia.objects.filter(pk=media.id).exists())
        self.assertFalse(os.path.exists(path))
        self.assertEqual(self.client.get("/api/worlds/media-delete-world/media/").data, [])

        audit = WorldAuditEvent.objects.get(action=WorldAuditEvent.Action.MEDIA_DELETED)
        self.assertEqual(audit.actor, self.owner)
        self.assertEqual(audit.metadata["id"], media.id)

    def test_delete_rejects_card_body_cover_icon_and_concept(self):
        media, url = self._media()
        self.card.body_json = self._image_doc(url)
        self.card.cover = url
        self.card.icon = url
        self.card.save()
        WorldConcept.objects.create(
            world=self.world,
            draft_json=self._image_doc(url),
            draft_text="draft",
            body_json=self._image_doc(url),
            body_text="published",
            published_at=timezone.now(),
            revision=1,
            created_by=self.owner,
            updated_by=self.owner,
        )

        self.client.force_authenticate(self.owner)
        listed = self.client.get("/api/worlds/media-delete-world/media/")
        self.assertEqual(listed.data[0]["usage"], 5)
        fields = {(item["kind"], item["field"]) for item in listed.data[0]["references"]}
        self.assertEqual(
            fields,
            {
                ("card", "cover"),
                ("card", "icon"),
                ("card", "body"),
                ("concept", "draft"),
                ("concept", "published"),
            },
        )

        rejected = self.client.delete(f"/api/worlds/media-delete-world/media/{media.id}/")
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(len(rejected.data["references"]), 5)
        self.assertTrue(WorldMedia.objects.filter(pk=media.id).exists())

    def test_delete_permissions_and_cross_world_isolation(self):
        media, _ = self._media()
        endpoint = f"/api/worlds/media-delete-world/media/{media.id}/"

        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.delete(endpoint).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(None)
        self.assertIn(self.client.delete(endpoint).status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        other = World.objects.create(slug="other-media-world", name="其他世界")
        WorldMembership.objects.create(world=other, user=self.owner, role=WorldMembership.Role.OWNER)
        other_media = WorldMedia.objects.create(world=other, file="world-media/other.png", name="other.png")
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.delete(f"/api/worlds/media-delete-world/media/{other_media.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.delete(endpoint).status_code, status.HTTP_204_NO_CONTENT)

