"""Concept and revision snapshots survive an export/import ZIP roundtrip."""

import io
import json
import zipfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.worlds.models import World, WorldConcept, WorldMembership


class WorldConceptZipTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="concept_zip_owner", password="secret")
        self.world = World.objects.create(slug="concept-zip", name="概念往返世界")
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        self.client.force_authenticate(self.owner)
        self._write_concept("第一版正文")
        self.assertEqual(self.client.post("/api/worlds/concept-zip/concept/publish/").status_code, 200)
        self._write_concept("第二版正文")
        self.assertEqual(self.client.post("/api/worlds/concept-zip/concept/publish/").status_code, 200)

    @staticmethod
    def _doc(text: str) -> dict:
        return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}

    def _write_concept(self, text: str) -> None:
        response = self.client.patch(
            "/api/worlds/concept-zip/concept/",
            {"body_json": self._doc(text)},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_export_includes_concept_and_revisions(self):
        exported = self.client.get("/api/worlds/concept-zip/export/")
        self.assertEqual(exported.status_code, status.HTTP_200_OK)
        archive = zipfile.ZipFile(io.BytesIO(exported.content))
        self.assertIn("concept.md", archive.namelist())
        data = json.loads(archive.read("world.json"))
        concept = data["concept"]
        self.assertEqual(concept["revision"], 2)
        self.assertEqual(len(concept["revisions"]), 2)
        self.assertEqual([item["revision"] for item in concept["revisions"]], [1, 2])
        self.assertIn("第二版正文", archive.read("concept.md").decode())

    def test_import_restores_concept_and_revision_history(self):
        exported = self.client.get("/api/worlds/concept-zip/export/")
        imported = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("concept.zip", exported.content, content_type="application/zip")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, status.HTTP_201_CREATED, imported.data)
        world = World.objects.get(slug=imported.data["slug"])
        concept = WorldConcept.objects.get(world=world)
        self.assertEqual(concept.revision, 2)
        self.assertIsNotNone(concept.published_at)
        self.assertEqual(concept.body_text, "第二版正文")
        self.assertEqual(concept.draft_text, "第二版正文")
        self.assertEqual(list(concept.revisions.values_list("revision", flat=True)), [2, 1])
        self.assertEqual(concept.revisions.get(revision=1).body_text, "第一版正文")

    def test_import_rejects_invalid_concept_documents(self):
        exported = self.client.get("/api/worlds/concept-zip/export/")
        source = zipfile.ZipFile(io.BytesIO(exported.content))
        data = json.loads(source.read("world.json"))
        data["concept"]["body_json"] = ["not", "a", "doc"]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("world.json", json.dumps(data, ensure_ascii=False))
        response = self.client.post(
            "/api/worlds/import/",
            {
                "file": SimpleUploadedFile(
                    "broken.zip", buffer.getvalue(), content_type="application/zip"
                )
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("concept", response.data["detail"])

    def test_unpublished_draft_roundtrips_without_revisions(self):
        draft_world = World.objects.create(slug="concept-draft-only", name="草稿世界")
        WorldMembership.objects.create(world=draft_world, user=self.owner, role=WorldMembership.Role.OWNER)
        response = self.client.patch(
            "/api/worlds/concept-draft-only/concept/",
            {"body_json": self._doc("只有草稿")},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        exported = self.client.get("/api/worlds/concept-draft-only/export/")
        data = json.loads(zipfile.ZipFile(io.BytesIO(exported.content)).read("world.json"))
        self.assertIsNone(data["concept"]["published_at"])
        self.assertEqual(data["concept"]["revisions"], [])

        imported = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("draft.zip", exported.content, content_type="application/zip")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, status.HTTP_201_CREATED, imported.data)
        world = World.objects.get(slug=imported.data["slug"])
        concept = WorldConcept.objects.get(world=world)
        self.assertIsNone(concept.published_at)
        self.assertEqual(concept.revision, 0)
        self.assertEqual(concept.draft_text, "只有草稿")
        self.assertEqual(concept.revisions.count(), 0)
