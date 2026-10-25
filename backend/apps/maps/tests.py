import tempfile
from django.contrib.auth import get_user_model
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.cards.models import Card
from apps.maps.models import TerrainUploadToken  # noqa: F401  (imported for tests)
from apps.maps.terrain_tokens import mint_token
from apps.worlds.models import World, WorldAuditEvent, WorldMembership


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
        self.assertIsNone(response.data["terrain_web"])
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
        self.world.terrain_web = {"seed": 7, "labels": []}
        self.world.save(update_fields=["terrain_web"])
        uploaded = self._upload()
        self.assertEqual(uploaded.status_code, 200, uploaded.data)
        self.assertIn("/media/world-map-backgrounds/", uploaded.data["background_url"])
        self.world.refresh_from_db()
        self.assertTrue(self.world.map_background.name)
        self.assertEqual(self.world.terrain_web, {})
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


class TerrainWebGeneratorTests(TestCase):
    def test_png_is_deterministic_and_bounded(self):
        from apps.maps.terrain_web import generate_terrain

        first = generate_terrain(seed=7, width=96, height=60, style="atlas")
        second = generate_terrain(seed=7, width=96, height=60, style="atlas")
        self.assertEqual(first.png, second.png)
        self.assertTrue(first.png.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual((first.width, first.height), (96, 60))
        self.assertTrue(first.heightmap.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual((first.heightmap_width, first.heightmap_height), (512, 320))
        self.assertEqual(first.heightmap, second.heightmap)
        self.assertEqual((first.mesh_width, first.mesh_height), (512, 320))
        self.assertEqual(len(first.mesh), 512 * 320)
        self.assertEqual(first.mesh, second.mesh)
        self.assertTrue(first.labels)
        self.assertLess(first.elapsed_ms, 10000)

        from apps.maps.terrain_web import STYLE_NAMES

        for style in STYLE_NAMES:
            result = generate_terrain(seed=7, width=96, height=60, style=style)
            self.assertTrue(result.png.startswith(b"\x89PNG\r\n\x1a\n"))

        unbaked = generate_terrain(seed=7, width=96, height=60, style="atlas", bake_labels=False)
        self.assertTrue(unbaked.labels)
        self.assertNotEqual(first.png, unbaked.png)

    def test_invalid_style_is_rejected(self):
        from apps.maps.terrain_web import generate_terrain

        with self.assertRaises(ValueError):
            generate_terrain(seed=1, width=96, height=60, style="unknown")


class TerrainWebApiTests(APITestCase):
    def setUp(self):
        import tempfile
        from django.test import override_settings

        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.owner = get_user_model().objects.create_user(username="tw_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="tw_editor", password="secret")
        self.world = World.objects.create(slug="tw-world", name="Terrain 世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)

    def _fake_result(self):
        from apps.maps.terrain_web import TerrainLabel, TerrainResult

        return TerrainResult(
            png=b"\x89PNG\r\n\x1a\n" + b"x" * 500,
            width=2048,
            height=1280,
            seed=42,
            style="atlas",
            labels=(TerrainLabel("Aster Reach", 0.4, 0.5),),
            elapsed_ms=123,
        )

    def test_owner_generates_and_saves_background(self):
        from unittest.mock import patch

        self.client.force_authenticate(self.owner)
        with patch("apps.maps.views.generate_terrain", return_value=self._fake_result()):
            response = self.client.post(
                "/api/worlds/tw-world/map/terrain-web/",
                {"seed": 42, "style": "atlas", "bake_labels": False},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["seed"], 42)
        self.assertEqual(response.data["style"], "atlas")
        self.assertEqual(response.data["labels"][0]["name"], "Aster Reach")
        self.assertFalse(response.data["bake_labels"])
        self.assertIn("/media/world-map-backgrounds/terrain-web-42-atlas.png", response.data["background_url"])
        self.assertIn("?v=", response.data["background_url"])
        self.world.refresh_from_db()
        self.assertTrue(self.world.map_background.name)
        self.assertEqual(self.world.terrain_web["seed"], 42)
        self.assertFalse(self.world.terrain_web["bake_labels"])
        self.assertEqual(self.world.terrain_web["labels"][0]["name"], "Aster Reach")
        refreshed = self.client.get("/api/worlds/tw-world/map/")
        self.assertEqual(refreshed.data["terrain_web"]["style"], "atlas")

    def test_editor_cannot_generate(self):
        self.client.force_authenticate(self.editor)
        response = self.client.post(
            "/api/worlds/tw-world/map/terrain-web/",
            {"seed": 42},
            format="json",
        )
        self.assertEqual(response.status_code, 403)




    def test_invalid_input_is_rejected(self):
        self.client.force_authenticate(self.owner)
        bad_seed = self.client.post(
            "/api/worlds/tw-world/map/terrain-web/",
            {"seed": "abc"},
            format="json",
        )
        self.assertEqual(bad_seed.status_code, 400)
        bad_style = self.client.post(
            "/api/worlds/tw-world/map/terrain-web/",
            {"style": "neon"},
            format="json",
        )
        self.assertEqual(bad_style.status_code, 400)


class TerrainFieldsPackTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from apps.maps.terrain_web import build_fields

        cls.fields = build_fields(7, width=320, height=200, style="atlas")

    def _parse(self, blob):
        import json
        import struct

        self.assertEqual(blob[:4], b"OTF1")
        (header_len,) = struct.unpack("<I", blob[4:8])
        header = json.loads(blob[8 : 8 + header_len])
        return header, blob[8 + header_len :]

    def test_container_is_self_describing(self):
        from apps.maps.terrain_fields import FIELDS_VERSION, pack_fields

        header, body = self._parse(pack_fields(self.fields))
        self.assertEqual(header["version"], FIELDS_VERSION)
        self.assertEqual((header["gw"], header["gh"]), (self.fields.gw, self.fields.gh))
        names = [block["name"] for block in header["blocks"]]
        self.assertEqual(
            names,
            [
                "surface",
                "to_land",
                "shade",
                "moisture",
                "uplift",
                "forest",
                "detail",
                "tributaries",
                "elev_lut",
                "ocean_lut",
            ],
        )
        for block in header["blocks"]:
            if block["dtype"] == "u16":
                stride = 2
            elif block["name"].endswith("_lut"):
                stride = 3
            else:
                stride = 1
            self.assertEqual(block["byteLength"], block["n"] * stride)
            self.assertLessEqual(block["offset"] + block["byteLength"], len(body))
        detail = header["blocks"][names.index("detail")]
        self.assertEqual(detail["n"], 384 * 240)
        self.assertEqual(header["tributary_count"] * 5, header["blocks"][names.index("tributaries")]["n"])
        self.assertGreaterEqual(len(header["rivers"]), 0)
        self.assertEqual(len(header["river"]), 3)
        self.assertEqual(len(header["paper"]), 3)
        self.assertEqual(len(header["panel"]), 3)

    def test_pack_is_deterministic_and_gzip_is_stable(self):
        from apps.maps.terrain_fields import encode_fields, pack_fields

        self.assertEqual(pack_fields(self.fields), pack_fields(self.fields))
        self.assertEqual(encode_fields(self.fields), encode_fields(self.fields))

    def test_quantised_surface_keeps_its_range(self):
        import struct

        from apps.maps.terrain_fields import pack_fields

        header, body = self._parse(pack_fields(self.fields))
        surface = next(block for block in header["blocks"] if block["name"] == "surface")
        raw = body[surface["offset"] : surface["offset"] + surface["byteLength"]]
        values = struct.unpack("<%dH" % surface["n"], raw)
        lo, scale = surface["min"], surface["scale"]
        decoded = [lo + value * scale for value in (min(values), max(values))]
        self.assertAlmostEqual(decoded[0], min(self.fields.surface), places=4)
        self.assertAlmostEqual(decoded[1], max(self.fields.surface), places=4)


class MapFieldsApiTests(APITestCase):
    def setUp(self):
        import tempfile

        from django.test import override_settings

        from apps.maps.terrain_fields import cache_path, fields_token

        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.owner = get_user_model().objects.create_user(username="mf_owner", password="secret")
        self.world = World.objects.create(slug="mf-world", name="字段世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        self.world.terrain_web = {
            "seed": 7,
            "style": "atlas",
            "width": 320,
            "height": 200,
            "labels": [],
            "bake_labels": False,
        }
        self.world.save(update_fields=["terrain_web"])
        self.token = fields_token(7, "atlas", 320, 200)
        self.cache = cache_path(self.world.slug, self.token)
        self.private = World.objects.create(slug="mf-private", name="私有字段", is_public_read=False)
        self.private.terrain_web = dict(self.world.terrain_web)
        self.private.save(update_fields=["terrain_web"])

    def test_missing_terrain_metadata_is_404(self):
        empty = World.objects.create(slug="mf-empty", name="空世界", is_public_read=True)
        response = self.client.get("/api/worlds/mf-empty/map/fields/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(empty.terrain_web, {})

    def test_private_world_is_hidden(self):
        self.assertEqual(self.client.get("/api/worlds/mf-private/map/fields/").status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get("/api/worlds/mf-private/map/fields/").status_code, 404)

    def test_serves_packed_fields_and_caches_them(self):
        self.assertFalse(self.cache.exists())
        response = self.client.get("/api/worlds/mf-world/map/fields/")
        self.assertEqual(response.status_code, 200, response.content[:200])
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        self.assertEqual(response["X-Fields-Version"], self.token)
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertTrue(response.content.startswith(b"OTF1"))
        self.assertTrue(self.cache.exists())

        again = self.client.get("/api/worlds/mf-world/map/fields/")
        self.assertEqual(again.content, response.content)
        self.assertEqual(again["ETag"], response["ETag"])

    def test_gzip_encoding_when_accepted(self):
        import gzip

        response = self.client.get("/api/worlds/mf-world/map/fields/", HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Encoding"], "gzip")
        self.assertTrue(gzip.decompress(response.content).startswith(b"OTF1"))

    def test_version_query_marks_payload_immutable(self):
        response = self.client.get(f"/api/worlds/mf-world/map/fields/?v={self.token}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("immutable", response["Cache-Control"])

    def test_etag_revalidation_returns_304(self):
        first = self.client.get("/api/worlds/mf-world/map/fields/")
        second = self.client.get(
            "/api/worlds/mf-world/map/fields/", HTTP_IF_NONE_MATCH=first["ETag"]
        )
        self.assertEqual(second.status_code, 304)

    def test_regeneration_replaces_cache_key(self):
        from apps.maps.terrain_fields import fields_token

        self.client.get("/api/worlds/mf-world/map/fields/")
        new_token = fields_token(9, "topographic", 320, 200)
        self.assertNotEqual(new_token, self.token)
        self.assertFalse((self.cache.parent / f"{self.world.slug}-{new_token}.otf.gz").exists())

    def test_map_payload_exposes_fields_version(self):
        response = self.client.get("/api/worlds/mf-world/map/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["fields_version"], self.token)

    def test_map_without_terrain_has_no_fields_version(self):
        empty = World.objects.create(slug="mf-plain", name="无地形", is_public_read=True)
        payload = self.client.get(f"/api/worlds/{empty.slug}/map/")
        self.assertIsNone(payload.data["fields_version"])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="terrain-test-"))
class TerrainUploadTokenTests(APITestCase):
    """One card per world: the local machine uploads, the server only stores."""

    def setUp(self):
        self.user = get_user_model().objects.create_user("terrain_owner", password="pw12345678")
        self.world = World.objects.create(slug="terrain-a", name="A", is_public_read=False)
        WorldMembership.objects.create(world=self.world, user=self.user, role=WorldMembership.Role.OWNER)
        self.other = World.objects.create(slug="terrain-b", name="B", is_public_read=False)
        WorldMembership.objects.create(world=self.other, user=self.user, role=WorldMembership.Role.OWNER)
        self.row, self.token = mint_token(self.world, label="test")

    def _png(self, width=1024, height=640):
        # Minimal PNG header: the endpoint only validates the signature and the
        # IHDR dimensions, so no image library is needed here.
        import struct
        import zlib

        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        chunk = struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr
        chunk += struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
        return b"\x89PNG\r\n\x1a\n" + chunk

    def _put(self, token, world_slug="terrain-a", **overrides):
        payload = {
            "seed": "4242",
            "style": "topographic",
            "width": "1024",
            "height": "640",
            "background": SimpleUploadedFile("terrain.png", self._png(), content_type="image/png"),
        }
        payload.update(overrides)
        return APIClient().put(
            f"/api/worlds/{world_slug}/map/terrain/",
            payload,
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def test_missing_token_is_rejected(self):
        response = APIClient().get("/api/worlds/terrain-a/map/terrain/")
        self.assertEqual(response.status_code, 401)

    def test_token_bound_to_its_own_world(self):
        response = self._put(self.token, world_slug="terrain-b")
        self.assertEqual(response.status_code, 401)

    def test_upload_stores_background_and_metadata(self):
        response = self._put(self.token)
        self.assertEqual(response.status_code, 200, response.content)
        self.world.refresh_from_db()
        self.assertEqual(self.world.terrain_web["seed"], 4242)
        self.assertEqual(self.world.terrain_web["generator"], "local")
        self.assertIn("terrain-web-4242-topographic", self.world.map_background.name)
        self.assertTrue(
            WorldAuditEvent.objects.filter(world=self.world, action="terrain.uploaded").exists()
        )

    def test_version_mismatch_conflicts(self):
        self.world.terrain_web = {"seed": 1, "style": "atlas", "width": 2048, "height": 1280}
        self.world.save(update_fields=["terrain_web"])
        response = self._put(self.token, if_version="stale-version")
        self.assertEqual(response.status_code, 409)

    def test_bad_png_is_rejected(self):
        payload = {
            "seed": "4242",
            "style": "topographic",
            "width": "1024",
            "height": "640",
            "background": SimpleUploadedFile("x.png", b"not a png", content_type="image/png"),
        }
        response = APIClient().put(
            "/api/worlds/terrain-a/map/terrain/",
            payload,
            format="multipart",
            HTTP_AUTHORIZATION=f"Bearer {self.token}",
        )
        self.assertEqual(response.status_code, 400)

    def test_get_returns_recipe(self):
        response = APIClient().get(
            "/api/worlds/terrain-a/map/terrain/",
            HTTP_AUTHORIZATION=f"Bearer {self.token}",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("seed", response.json())

    def test_revoked_token_stops_working(self):
        self.row.revoked_at = timezone.now()
        self.row.save(update_fields=["revoked_at"])
        self.assertEqual(self._put(self.token).status_code, 401)
