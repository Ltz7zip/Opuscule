from apps.maps.models import MapMarker
from django.core.files.uploadedfile import SimpleUploadedFile
import zipfile
import json
import io
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.collections.models import Collection

from .models import World, WorldAuditEvent, WorldInvite, WorldMembership


class WorldCreateTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="creator", password="secret"
        )

    def test_create_requires_login(self):
        response = self.client.post(
            "/api/worlds/",
            {"name": "未登录世界"},
            format="json",
        )
        self.assertIn(
            response.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

    def test_create_bootstraps_owner_collections_and_overview(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/worlds/",
            {
                "name": "潮汐档案",
                "description": "一个刚建立的世界",
                "is_public_read": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["slug"])
        self.assertEqual(response.data["role"], "owner")
        world = World.objects.get(slug=response.data["slug"])
        self.assertEqual(world.name, "潮汐档案")
        self.assertFalse(world.is_public_read)
        self.assertTrue(
            WorldMembership.objects.filter(
                world=world,
                user=self.user,
                role=WorldMembership.Role.OWNER,
            ).exists()
        )
        self.assertEqual(
            set(Collection.objects.filter(world=world).values_list("slug", flat=True)),
            {"characters", "places", "events"},
        )
        self.assertEqual(Card.objects.filter(world=world, slug="world-overview").count(), 1)

    def test_owner_can_publish_and_rename_but_editor_cannot(self):
        self.client.force_authenticate(self.user)
        created = self.client.post(
            "/api/worlds/", {"name": "可发布"}, format="json"
        )
        slug = created.data["slug"]
        world = World.objects.get(slug=slug)
        response = self.client.patch(
            f"/api/worlds/{slug}/",
            {"name": "发布后的世界", "is_public_read": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_public_read"])
        self.assertEqual(response.data["name"], "发布后的世界")
        world.refresh_from_db()
        self.assertIsNotNone(world.published_at)

        other = get_user_model().objects.create_user(
            username="editor", password="secret"
        )
        WorldMembership.objects.create(
            world=world,
            user=other,
            role=WorldMembership.Role.EDITOR,
        )
        self.client.force_authenticate(other)
        denied = self.client.patch(
            f"/api/worlds/{slug}/",
            {"is_public_read": False},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_manage_members_and_editor_cannot(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "成员世界"}, format="json")
        slug = created.data["slug"]
        editor = get_user_model().objects.create_user(
            username="new_editor", password="secret"
        )
        added = self.client.post(
            f"/api/worlds/{slug}/members/",
            {"username": "new_editor", "role": "editor"},
            format="json",
        )
        self.assertEqual(added.status_code, status.HTTP_201_CREATED, added.data)
        self.assertEqual(added.data["role"], "editor")
        self.assertEqual(
            self.client.get(f"/api/worlds/{slug}/members/").data.__len__(),
            2,
        )

        duplicate = self.client.post(
            f"/api/worlds/{slug}/members/",
            {"username": "new_editor", "role": "viewer"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        unknown = self.client.post(
            f"/api/worlds/{slug}/members/",
            {"username": "nobody_here", "role": "viewer"},
            format="json",
        )
        self.assertEqual(unknown.status_code, status.HTTP_400_BAD_REQUEST)

        membership_id = added.data["id"]
        changed = self.client.patch(
            f"/api/worlds/{slug}/members/{membership_id}/",
            {"role": "viewer"},
            format="json",
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(changed.data["role"], "viewer")

        self.client.force_authenticate(editor)
        denied = self.client.get(f"/api/worlds/{slug}/members/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.user)
        owner_membership = WorldMembership.objects.get(
            world__slug=slug, user=self.user
        )
        cannot_remove_owner = self.client.delete(
            f"/api/worlds/{slug}/members/{owner_membership.id}/"
        )
        self.assertEqual(cannot_remove_owner.status_code, status.HTTP_400_BAD_REQUEST)
        removed = self.client.delete(f"/api/worlds/{slug}/members/{membership_id}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)

    def test_owner_can_create_and_revoke_invite(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "邀请世界"}, format="json")
        slug = created.data["slug"]
        invite = self.client.post(
            f"/api/worlds/{slug}/invites/",
            {"role": "editor"},
            format="json",
        )
        self.assertEqual(invite.status_code, status.HTTP_201_CREATED, invite.data)
        token = invite.data["token"]
        info = self.client.get(f"/api/invites/{token}/")
        self.assertEqual(info.status_code, status.HTTP_200_OK)
        self.assertTrue(info.data["valid"])
        self.assertTrue(info.data["already_member"])
        revoked = self.client.delete(f"/api/worlds/{slug}/invites/{invite.data['id']}/")
        self.assertEqual(revoked.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.client.get(f"/api/invites/{token}/").data["valid"])

    def test_invite_accept_adds_member_once(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "邀请接受"}, format="json")
        slug = created.data["slug"]
        token = self.client.post(
            f"/api/worlds/{slug}/invites/",
            {"role": "viewer"},
            format="json",
        ).data["token"]

        invitee = get_user_model().objects.create_user(
            username="invitee", password="secret"
        )
        self.client.force_authenticate(invitee)
        accepted = self.client.post(f"/api/invites/{token}/accept/")
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertFalse(accepted.data["already_member"])
        self.assertTrue(
            WorldMembership.objects.filter(
                world__slug=slug, user=invitee, role=WorldMembership.Role.VIEWER
            ).exists()
        )
        reused = self.client.post(f"/api/invites/{token}/accept/")
        self.assertEqual(reused.status_code, status.HTTP_410_GONE)

    def test_expired_invite_is_not_acceptable(self):
        from datetime import timedelta
        from django.utils import timezone

        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "过期邀请"}, format="json")
        slug = created.data["slug"]
        token = self.client.post(
            f"/api/worlds/{slug}/invites/", {"role": "viewer"}, format="json"
        ).data["token"]
        WorldInvite.objects.filter(token=token).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        self.assertFalse(self.client.get(f"/api/invites/{token}/").data["valid"])
        invitee = get_user_model().objects.create_user(
            username="late_invitee", password="secret"
        )
        self.client.force_authenticate(invitee)
        accepted = self.client.post(f"/api/invites/{token}/accept/")
        self.assertEqual(accepted.status_code, status.HTTP_410_GONE)

    def test_invite_accept_requires_login_and_editor_cannot_create(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "邀请权限"}, format="json")
        slug = created.data["slug"]
        token = self.client.post(
            f"/api/worlds/{slug}/invites/", {"role": "viewer"}, format="json"
        ).data["token"]
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.post(f"/api/invites/{token}/accept/").status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

        editor = get_user_model().objects.create_user(
            username="invite_editor", password="secret"
        )
        WorldMembership.objects.create(
            world=World.objects.get(slug=slug),
            user=editor,
            role=WorldMembership.Role.EDITOR,
        )
        self.client.force_authenticate(editor)
        denied = self.client.post(
            f"/api/worlds/{slug}/invites/", {"role": "viewer"}, format="json"
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_transfer_ownership_to_member(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "转移世界"}, format="json")
        slug = created.data["slug"]
        successor = get_user_model().objects.create_user(
            username="successor", password="secret"
        )
        WorldMembership.objects.create(
            world=World.objects.get(slug=slug),
            user=successor,
            role=WorldMembership.Role.EDITOR,
        )
        response = self.client.post(
            f"/api/worlds/{slug}/transfer-ownership/",
            {"username": "successor"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            WorldMembership.objects.get(world__slug=slug, user=successor).role,
            WorldMembership.Role.OWNER,
        )
        self.assertEqual(
            WorldMembership.objects.get(world__slug=slug, user=self.user).role,
            WorldMembership.Role.EDITOR,
        )
        denied = self.client.post(
            f"/api/worlds/{slug}/transfer-ownership/",
            {"username": "successor"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_soft_delete_hides_world_and_restore_brings_it_back(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "软删世界"}, format="json")
        slug = created.data["slug"]
        deleted = self.client.delete(f"/api/worlds/{slug}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(f"/api/worlds/{slug}/").status_code, 404)
        self.assertNotIn(slug, [world["slug"] for world in self.client.get("/api/worlds/").data])
        # The recycled world must also disappear from the session payload that
        # feeds the workspace switcher.
        session_worlds = [world["slug"] for world in self.client.get("/api/auth/session/").data["worlds"]]
        self.assertNotIn(slug, session_worlds)
        trash = self.client.get("/api/worlds/trash/")
        self.assertIn(slug, [world["slug"] for world in trash.data])
        restored = self.client.post(f"/api/worlds/{slug}/restore/")
        self.assertEqual(restored.status_code, status.HTTP_200_OK, restored.data)
        self.assertEqual(self.client.get(f"/api/worlds/{slug}/").status_code, 200)
        session_worlds = [world["slug"] for world in self.client.get("/api/auth/session/").data["worlds"]]
        self.assertIn(slug, session_worlds)

    def test_only_owner_can_delete_or_restore(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "权限删除"}, format="json")
        slug = created.data["slug"]
        editor = get_user_model().objects.create_user(
            username="delete_editor", password="secret"
        )
        WorldMembership.objects.create(
            world=World.objects.get(slug=slug),
            user=editor,
            role=WorldMembership.Role.EDITOR,
        )
        self.client.force_authenticate(editor)
        self.assertEqual(
            self.client.delete(f"/api/worlds/{slug}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(self.user)
        self.client.delete(f"/api/worlds/{slug}/")
        self.client.force_authenticate(editor)
        self.assertEqual(
            self.client.post(f"/api/worlds/{slug}/restore/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_audit_log_records_governance_and_is_owner_only(self):
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/worlds/", {"name": "审计世界"}, format="json")
        slug = created.data["slug"]
        member = get_user_model().objects.create_user(
            username="audit_member", password="secret"
        )
        self.client.post(
            f"/api/worlds/{slug}/members/",
            {"username": "audit_member", "role": "viewer"},
            format="json",
        )
        audit = self.client.get(f"/api/worlds/{slug}/audit/")
        self.assertEqual(audit.status_code, status.HTTP_200_OK)
        actions = [event["action"] for event in audit.data]
        self.assertIn("world.created", actions)
        self.assertIn("member.added", actions)

        self.client.force_authenticate(member)
        self.assertEqual(
            self.client.get(f"/api/worlds/{slug}/audit/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.user)
        self.client.delete(f"/api/worlds/{slug}/")
        self.client.post(f"/api/worlds/{slug}/restore/")
        restored_audit = self.client.get(f"/api/worlds/{slug}/audit/")
        restored_actions = [event["action"] for event in restored_audit.data]
        self.assertIn("world.deleted", restored_actions)
        self.assertIn("world.restored", restored_actions)

        filtered = self.client.get(f"/api/worlds/{slug}/audit/?action=world.restored")
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        self.assertTrue(filtered.data)
        self.assertTrue(all(event["action"] == "world.restored" for event in filtered.data))
        self.assertEqual(
            self.client.get(f"/api/worlds/{slug}/audit/?action=unknown").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_world_owner_quota_is_seven(self):
        self.client.force_authenticate(self.user)
        for index in range(7):
            response = self.client.post(
                "/api/worlds/", {"name": f"配额世界 {index}"}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        eighth = self.client.post(
            "/api/worlds/", {"name": "第八个世界"}, format="json"
        )
        self.assertEqual(eighth.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_world_appears_in_explore_after_publish(self):
        self.client.force_authenticate(self.user)
        created = self.client.post(
            "/api/worlds/",
            {"name": "公开潮汐", "is_public_read": True},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(None)
        explore = self.client.get("/api/explore/")
        self.assertIn(created.data["slug"], [world["slug"] for world in explore.data])
        self.assertIn("max-age=60", explore["Cache-Control"])


class WorldExportTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="export_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="export_editor", password="secret")
        self.world = World.objects.create(slug="export-world", name="导出世界", description="可带走的世界。")
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        self.collection = Collection.objects.create(world=self.world, name="人物", slug="people")
        self.card = Card.objects.create(
            world=self.world,
            home_collection=self.collection,
            title="航海士",
            slug="navigator",
            type_key="character",
            body_json={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "在雾里航行。"}]}]},
            body_text="在雾里航行。",
        )

    def test_owner_downloads_zip_with_metadata_and_markdown(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/worlds/export-world/export/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("export-world-export.zip", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "no-store")

        archive = zipfile.ZipFile(io.BytesIO(response.content))
        self.assertEqual(
            set(archive.namelist()),
            {"README.md", "world.json", "wiki/navigator.md"},
        )
        data = json.loads(archive.read("world.json"))
        self.assertEqual(data["format"], "opuscule-world-export/v1")
        self.assertEqual(data["world"]["slug"], "export-world")
        self.assertEqual(data["cards"][0]["slug"], "navigator")
        self.assertEqual(data["collections"][0]["slug"], "people")
        self.assertNotIn("invites", data)
        self.assertIn("在雾里航行。", archive.read("wiki/navigator.md").decode())

    def test_editor_and_anonymous_cannot_export(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(
            self.client.get("/api/worlds/export-world/export/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get("/api/worlds/export-world/export/").status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

    def test_soft_deleted_world_is_not_exportable(self):
        self.client.force_authenticate(self.owner)
        self.world.deleted_at = timezone.now()
        self.world.save(update_fields=["deleted_at"])
        self.assertEqual(
            self.client.get("/api/worlds/export-world/export/").status_code,
            status.HTTP_404_NOT_FOUND,
        )


class WorldImportTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="import_owner", password="secret")
        self.world = World.objects.create(slug="import-source", name="导入源世界", description="可往返。")
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        self.collection = Collection.objects.create(world=self.world, name="人物", slug="people")
        self.card = Card.objects.create(
            world=self.world,
            home_collection=self.collection,
            title="航海士",
            slug="navigator",
            type_key="character",
            body_json={
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "在雾里航行。"}]}
                ],
            },
            body_text="在雾里航行。",
        )
        MapMarker.objects.create(world=self.world, label="七钟楼", kind="place", x=0.4, y=0.6, card=self.card)

    def test_owner_can_roundtrip_export_zip(self):
        self.client.force_authenticate(self.owner)
        exported = self.client.get("/api/worlds/import-source/export/")
        self.assertEqual(exported.status_code, status.HTTP_200_OK)
        imported = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("export.zip", exported.content, content_type="application/zip")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, status.HTTP_201_CREATED, imported.data)
        world = World.objects.get(slug=imported.data["slug"])
        self.assertNotEqual(world.slug, "import-source")
        self.assertFalse(world.is_public_read)
        self.assertEqual(world.collections.count(), 1)
        self.assertEqual(world.cards.count(), 1)
        self.assertEqual(world.map_markers.count(), 1)
        self.assertEqual(world.cards.get().body_text, "在雾里航行。")
        event = world.audit_events.filter(action="world.imported").first()
        self.assertIsNotNone(event)
        self.assertEqual(event.metadata["filename"], "export.zip")

    def test_invalid_zip_is_rejected(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("bad.zip", b"not a zip", content_type="application/zip")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ZIP", response.data["detail"])

    def test_import_requires_login(self):
        response = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("empty.zip", b"", content_type="application/zip")},
            format="multipart",
        )
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    @staticmethod
    def _payload_zip(payload: dict) -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("world.json", json.dumps(payload, ensure_ascii=False))
        return buffer.getvalue()

    def _import(self, payload: dict):
        return self.client.post(
            "/api/worlds/import/",
            {
                "file": SimpleUploadedFile(
                    "probe.zip", self._payload_zip(payload), content_type="application/zip"
                )
            },
            format="multipart",
        )

    def test_import_ignores_forged_body_text(self):
        self.client.force_authenticate(self.owner)
        response = self._import(
            {
                "format": "opuscule-world-export/v1",
                "world": {"name": "伪造正文"},
                "collections": [],
                "cards": [
                    {
                        "slug": "forged-card",
                        "title": "伪造卡",
                        "body_json": {
                            "type": "doc",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "真实正文"}],
                                }
                            ],
                        },
                        "body_text": "不应进入搜索索引",
                    }
                ],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        card = Card.objects.get(world__slug=response.data["slug"], slug="forged-card")
        self.assertEqual(card.body_text, "真实正文")

    def test_import_rejects_unsafe_card_slug(self):
        self.client.force_authenticate(self.owner)
        response = self._import(
            {
                "format": "opuscule-world-export/v1",
                "world": {"name": "坏 slug"},
                "cards": [{"slug": "../escape", "title": "坏", "body_json": {"type": "doc"}}],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_import_rejects_collection_cycle(self):
        self.client.force_authenticate(self.owner)
        response = self._import(
            {
                "format": "opuscule-world-export/v1",
                "world": {"name": "环"},
                "collections": [
                    {"slug": "a", "name": "A", "parent": "b"},
                    {"slug": "b", "name": "B", "parent": "a"},
                ],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


    def test_background_roundtrip(self):
        import tempfile

        from django.core.files.base import ContentFile
        from django.test import override_settings

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                png = b"\x89PNG\r\n\x1a\n" + b"test" * 8
                self.world.map_background.save("bg.png", ContentFile(png), save=True)
                self.client.force_authenticate(self.owner)
                exported = self.client.get("/api/worlds/import-source/export/")
                imported = self.client.post(
                    "/api/worlds/import/",
                    {"file": SimpleUploadedFile("bg.zip", exported.content, content_type="application/zip")},
                    format="multipart",
                )
                self.assertEqual(imported.status_code, status.HTTP_201_CREATED, imported.data)
                world = World.objects.get(slug=imported.data["slug"])
                self.assertTrue(world.map_background.name)
                world.map_background.open("rb")
                self.assertEqual(world.map_background.read(), png)
                world.map_background.close()



class WorldAuditExportTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="audit_export_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="audit_export_editor", password="secret")
        self.world = World.objects.create(slug="audit-export", name="审计导出")
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        WorldAuditEvent.objects.create(
            world=self.world,
            actor=self.owner,
            action=WorldAuditEvent.Action.CREATED,
            metadata={"source": "test"},
        )
        self.formula_user = get_user_model().objects.create_user(username="+formula", password="secret")
        WorldAuditEvent.objects.create(
            world=self.world,
            actor=self.owner,
            target_user=self.formula_user,
            action=WorldAuditEvent.Action.IMPORTED,
            metadata={"filename": "mini.zip"},
        )

    def test_owner_exports_csv_with_filter(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/worlds/audit-export/audit/export/?action=world.imported")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("audit-export-audit.csv", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "no-store")
        text = response.content.decode("utf-8-sig")
        self.assertIn("时间,动作,操作者,对象,元数据", text)
        self.assertIn("世界导入", text)
        self.assertIn("mini.zip", text)
        self.assertIn("'+formula", text)
        self.assertNotIn("世界创建", text)

    def test_editor_cannot_export_csv(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(
            self.client.get("/api/worlds/audit-export/audit/export/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(None)
        self.assertIn(
            self.client.get("/api/worlds/audit-export/audit/export/").status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )


class WorldImportHistoryTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="history_owner", password="secret")
        self.source = World.objects.create(slug="history-source", name="历史源")
        WorldMembership.objects.create(world=self.source, user=self.owner, role=WorldMembership.Role.OWNER)
        Card.objects.create(
            world=self.source, title="源卡", slug="source-card",
            body_json={"type": "doc", "content": []}, body_text="源。",
        )

    def test_import_history_and_undo(self):
        self.client.force_authenticate(self.owner)
        exported = self.client.get("/api/worlds/history-source/export/")
        imported = self.client.post(
            "/api/worlds/import/",
            {"file": SimpleUploadedFile("history.zip", exported.content, content_type="application/zip")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, status.HTTP_201_CREATED)
        slug = imported.data["slug"]

        history = self.client.get("/api/worlds/imports/")
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history.data), 1)
        self.assertEqual(history.data[0]["world"]["slug"], slug)
        self.assertEqual(history.data[0]["filename"], "history.zip")
        self.assertTrue(history.data[0]["can_undo"])

        undone = self.client.post(f"/api/worlds/{slug}/undo-import/")
        self.assertEqual(undone.status_code, status.HTTP_204_NO_CONTENT)
        world = World.all_objects.get(slug=slug)
        self.assertIsNotNone(world.deleted_at)
        deleted_event = world.audit_events.filter(action=WorldAuditEvent.Action.DELETED).first()
        self.assertEqual(deleted_event.metadata["reason"], "import_undo")

        history = self.client.get("/api/worlds/imports/")
        self.assertFalse(history.data[0]["can_undo"])
        self.assertEqual(self.client.post(f"/api/worlds/{slug}/undo-import/").status_code, 404)

    def test_non_imported_world_cannot_be_undone(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post("/api/worlds/history-source/undo-import/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )


class QueryBudgetTests(APITestCase):
    """List endpoints must not issue a query per row."""

    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            username="budget_owner", password="secret"
        )
        self.world = World.objects.create(slug="budget-base", name="基线世界", is_public_read=True)
        WorldMembership.objects.create(
            world=self.world, user=self.owner, role=WorldMembership.Role.OWNER
        )
        Collection.objects.create(world=self.world, name="人物", slug="people")

    def _count(self, path: str) -> int:
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(path)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return len(captured.captured_queries)

    def _grow(self, count: int) -> None:
        for index in range(count):
            world = World.objects.create(
                slug=f"budget-grow-{index}", name=f"增长 {index}", is_public_read=True
            )
            WorldMembership.objects.create(
                world=world, user=self.owner, role=WorldMembership.Role.OWNER
            )
            Collection.objects.create(
                world=world, name=f"人物 {index}", slug=f"people-{index}"
            )

    def test_explore_query_count_is_constant(self):
        self.client.force_authenticate(self.owner)
        before = self._count("/api/explore/")
        self._grow(4)
        self.assertEqual(self._count("/api/explore/"), before)

    def test_collection_query_count_is_constant(self):
        self.client.force_authenticate(self.owner)
        before = self._count("/api/worlds/budget-base/collections/")
        for index in range(4):
            Collection.objects.create(
                world=self.world, name=f"条目 {index}", slug=f"entry-{index}"
            )
        self.assertEqual(self._count("/api/worlds/budget-base/collections/"), before)


class ImportLegacyCommandTests(TestCase):
    """The old generation stored its content in different tables."""

    def _fixture(self, tmpdir):
        import json
        import sqlite3
        from pathlib import Path

        path = Path(tmpdir) / "legacy.sqlite3"
        con = sqlite3.connect(path)
        con.executescript(
            """
            create table auth_user (id integer primary key, username text, email text,
                first_name text, last_name text, password text, is_staff int,
                is_superuser int, is_active int, date_joined text);
            create table world_world (id integer primary key, owner_id int, name text,
                slug text, description text, theme_config text, is_published int,
                audience text, published_slug text, published_at text);
            create table world_membership (id integer primary key, world_id int,
                user_id int, role text);
            create table world_document (id integer primary key, world_id int,
                document_type text, name text, slug text, icon text, cover text,
                is_published int, pinned int, deleted_at text);
            create table world_card (id integer primary key, document_id int,
                blocks text, body text);
            create table world_mapmarker (id integer primary key, document_id int,
                kind text, name text, x real, y real, card_id int);
            create table world_timeline (id integer primary key, world_id int,
                calendar_id int);
            create table world_calendar (id integer primary key, name text);
            create table world_timelineevent (id integer primary key, timeline_id int,
                year int, title text, description text, era_id int);
            create table world_era (id integer primary key, world_id int, name text,
                start_year int, end_year int);
            """
        )
        con.execute(
            "insert into auth_user values (1,'traveler','t@example.com','','',"
            "'pbkdf2_sha256$x$y=',0,0,1,'2026-01-01 00:00:00')"
        )
        con.execute(
            "insert into world_world values (1,1,'雾海纪年','05841b','简介','{}',1,"
            "'public','wuhai','2026-02-01 00:00:00')"
        )
        con.execute("insert into world_calendar values (1,'主历')")
        con.execute("insert into world_timeline values (1,1,1)")
        con.execute(
            "insert into world_document values (1,1,'card','七钟楼','seven-bells','',"
            "'',1,0,null)"
        )
        con.execute(
            "insert into world_document values (2,1,'card','已删','gone','','',1,0,"
            "'2026-03-01 00:00:00')"
        )
        blocks = json.dumps([{"id": "b1", "type": "text", "title": "概览", "text": "钟声"}])
        con.execute("insert into world_card values (1,1,?,'概览\n钟声')", (blocks,))
        con.execute("insert into world_mapmarker values (1,1,'pin','七钟楼',32.0,48.0,1)")
        con.execute("insert into world_timelineevent values (1,1,532,'钟楼建成','',1)")
        con.execute("insert into world_era values (1,1,'第二纪元',500,600)")
        con.commit()
        con.close()
        return path

    def test_import_maps_legacy_tables(self):
        import tempfile

        from django.core.management import call_command

        from apps.cards.models import Card
        from apps.maps.models import MapMarker
        from apps.timelines.models import TimelineEntry

        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._fixture(tmpdir)
            call_command("import_legacy", db=str(path), verbosity=0)

        world = World.objects.get(slug="wuhai")  # published_slug wins over the hex id
        self.assertEqual(world.name, "雾海纪年")
        self.assertTrue(world.is_public_read)
        self.assertEqual(world.memberships.count(), 1)

        card = Card.objects.get(world=world, slug="seven-bells")
        self.assertIn("钟声", card.body_text)
        self.assertEqual(card.body_json["type"], "doc")
        self.assertFalse(Card.all_objects.filter(world=world, slug="gone").exists())

        marker = MapMarker.objects.get(world=world)
        self.assertEqual((marker.label, marker.kind), ("七钟楼", "place"))
        self.assertAlmostEqual(marker.x, 0.32)  # percent → fraction
        self.assertEqual(marker.card_id, card.id)

        entry = TimelineEntry.objects.get(world=world)
        self.assertEqual((entry.year, entry.title), (532, "钟楼建成"))
        self.assertEqual(entry.timeline.name, "主历")

    def test_bodies_only_keeps_everything_else(self):
        import tempfile

        from django.core.management import call_command

        from apps.cards.models import Card
        from apps.maps.models import MapMarker
        from apps.timelines.models import TimelineEntry

        with tempfile.TemporaryDirectory() as tmpdir:
            path = self._fixture(tmpdir)
            call_command("import_legacy", db=str(path), verbosity=0)
            card = Card.objects.get(slug="seven-bells")
            card.body_json = {}
            card.body_text = ""
            card.save(update_fields=["body_json", "body_text"])
            markers_before = MapMarker.objects.count()
            entries_before = TimelineEntry.objects.count()

            call_command("import_legacy", db=str(path), bodies_only=True, verbosity=0)

        card.refresh_from_db()
        self.assertIn("钟声", card.body_text)
        self.assertEqual(MapMarker.objects.count(), markers_before)
        self.assertEqual(TimelineEntry.objects.count(), entries_before)
