import base64
import gzip
import json
import hashlib
import logging
import secrets
import threading

from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.worlds.access import get_world_for_owner, get_world_for_read, get_world_for_write
from apps.worlds.audit import log_world_event

from .models import MapMarker, TerrainUploadToken
from apps.worlds.models import World
from .terrain_fields import encode_fields, fields_token, read_cache, write_cache
from .terrain_tokens import authenticate_token
from .terrain_web import STYLE_NAMES, build_fields, generate_terrain
from .serializers import MapMarkerSerializer

logger = logging.getLogger(__name__)

# One cold build per world token: two parallel visitors must not each run the
# ten-second simulation.  The dictionary is tiny (one lock per warm world) and
# is only used to serialise cache misses.
_FIELDS_LOCKS: dict[str, threading.Lock] = {}
_FIELDS_LOCKS_GUARD = threading.Lock()


def _fields_lock(key: str) -> threading.Lock:
    with _FIELDS_LOCKS_GUARD:
        lock = _FIELDS_LOCKS.get(key)
        if lock is None:
            lock = _FIELDS_LOCKS[key] = threading.Lock()
        return lock


def terrain_fields_token(meta: dict | None) -> str | None:
    """Cache/URL version of a world's field payload, or None when absent."""
    if not isinstance(meta, dict):
        return None
    try:
        return fields_token(meta["seed"], meta["style"], meta["width"], meta["height"])
    except (KeyError, TypeError, ValueError):
        return None


class WorldMapView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, world_slug: str):
        world = get_world_for_read(request, world_slug)
        markers = world.map_markers.select_related("card").all()
        return Response(
            {
                "world": {"slug": world.slug, "name": world.name},
                "can_edit": world.can_edit(request.user),
                "background_url": request.build_absolute_uri(world.map_background.url)
                if world.map_background
                else None,
                "terrain_web": world.terrain_web or None,
                "fields_version": terrain_fields_token(world.terrain_web),
                "markers": MapMarkerSerializer(markers, many=True).data,
            }
        )


class WorldMapFieldsView(APIView):
    """Immutable, gzipped simulation fields for the WebGL terrain renderer.

    The payload is a pure function of ``(version, seed, style, width, height)``
    and is cached on disk, so repeat requests are a file read.  A cold request
    has to rebuild the simulation grid (about ten seconds at 2048x1280); worlds
    generated through the owner endpoint pre-fill the cache during generation.
    """

    permission_classes = [AllowAny]

    def get(self, request, world_slug: str):
        world = get_world_for_read(request, world_slug)
        meta = world.terrain_web or {}
        token = terrain_fields_token(meta)
        if token is None:
            return Response({"detail": "这个世界还没有 Terrain Web 地形"}, status=status.HTTP_404_NOT_FOUND)

        payload = read_cache(world.slug, token)
        if payload is None:
            with _fields_lock(f"{world.slug}:{token}"):
                payload = read_cache(world.slug, token)
                if payload is None:
                    fields = build_fields(
                        seed=int(meta["seed"]),
                        width=int(meta["width"]),
                        height=int(meta["height"]),
                        style=str(meta["style"]),
                    )
                    payload = encode_fields(fields)
                    try:
                        write_cache(world.slug, token, payload)
                    except OSError:  # cache is an optimisation, never a hard dependency
                        logger.warning(
                            "terrain field cache write failed for %s", world.slug, exc_info=True
                        )

        etag = hashlib.sha256(payload).hexdigest()[:32]
        if request.headers.get("If-None-Match", "").strip('"') == etag:
            not_modified = HttpResponse(status=status.HTTP_304_NOT_MODIFIED)
            not_modified["ETag"] = f'"{etag}"'
            return not_modified

        accepts_gzip = "gzip" in request.headers.get("Accept-Encoding", "")
        body = payload if accepts_gzip else gzip.decompress(payload)
        response = HttpResponse(body, content_type="application/octet-stream")
        response["ETag"] = f'"{etag}"'
        response["Vary"] = "Accept-Encoding"
        response["X-Fields-Version"] = token
        if accepts_gzip:
            response["Content-Encoding"] = "gzip"
        if request.GET.get("v") == token:
            response["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response["Cache-Control"] = "no-cache"
        return response


class MapMarkerListCreateView(generics.ListCreateAPIView):
    serializer_class = MapMarkerSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().map_markers.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        serializer.save(world=self.get_world(), created_by=self.request.user)


class MapMarkerDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MapMarkerSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().map_markers.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context


class WorldMapBackgroundView(APIView):
    parser_classes = [MultiPartParser]

    MAX_BYTES = 4 * 1024 * 1024
    SIGNATURES = {
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/webp": (b"RIFF",),
    }

    def post(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "请选择图片"}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > self.MAX_BYTES:
            return Response({"detail": "背景图不能超过 4 MB"}, status=status.HTTP_400_BAD_REQUEST)
        prefixes = self.SIGNATURES.get(upload.content_type)
        head = upload.read(12)
        upload.seek(0)
        if prefixes is None or not any(head.startswith(prefix) for prefix in prefixes):
            return Response({"detail": "仅支持 PNG/JPEG/WebP 图片"}, status=status.HTTP_400_BAD_REQUEST)
        if world.map_background:
            world.map_background.delete(save=False)
        world.map_background.save(upload.name, upload)
        world.terrain_web = {}
        world.save(update_fields=["terrain_web", "updated_at"])
        return Response({"background_url": request.build_absolute_uri(world.map_background.url)})

    def delete(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        if world.map_background:
            world.map_background.delete(save=False)
            world.map_background = ""
            world.terrain_web = {}
            world.save(update_fields=["map_background", "terrain_web", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TerrainWebGenerateView(APIView):
    """Owner-only Terrain Web MVP: generate a deterministic local map.

    This endpoint is intentionally synchronous for the first integration.  The
    CPU renderer is bounded (2048x1280).  The balanced 700x438 simulation
    takes roughly twelve seconds locally; the fast 480x300 mode used to fit the
    eight-second budget remains available in the generator.  Production should
    move this to the GPU/worker path described in the research notes and return
    a job id.
    """

    def post(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        raw_seed = request.data.get("seed", "")
        if raw_seed in ("", None):
            seed = secrets.randbelow(100000)
        else:
            try:
                seed = int(raw_seed)
            except (TypeError, ValueError):
                return Response({"detail": "seed 必须是整数"}, status=status.HTTP_400_BAD_REQUEST)
            if not 0 <= seed <= 2_147_483_647:
                return Response({"detail": "seed 超出范围"}, status=status.HTTP_400_BAD_REQUEST)

        style = str(request.data.get("style") or "atlas")
        if style not in STYLE_NAMES:
            return Response({"detail": "不支持的地图风格"}, status=status.HTTP_400_BAD_REQUEST)

        bake_labels = request.data.get("bake_labels", True)
        if isinstance(bake_labels, str):
            bake_labels = bake_labels.lower() not in ("0", "false", "no", "off")
        else:
            bake_labels = bool(bake_labels)

        try:
            width = int(request.data.get("width", 2048))
            height = int(request.data.get("height", 1280))
            label_count = int(request.data.get("label_count", 7))
        except (TypeError, ValueError):
            return Response({"detail": "width/height/label_count 必须是整数"}, status=status.HTTP_400_BAD_REQUEST)
        if width not in (1024, 1536, 2048, 4096) or height not in (640, 960, 1280, 2560):
            return Response({"detail": "不支持的分辨率"}, status=status.HTTP_400_BAD_REQUEST)
        if not 0 <= label_count <= 12:
            return Response({"detail": "label_count 必须在 0–12"}, status=status.HTTP_400_BAD_REQUEST)

        result = generate_terrain(
            seed=seed,
            width=width,
            height=height,
            style=style,
            bake_labels=bake_labels,
            label_count=label_count,
        )
        if world.map_background:
            world.map_background.delete(save=False)
        filename = f"terrain-web-{seed}-{style}.png"
        world.map_background.save(filename, ContentFile(result.png), save=True)
        labels = [
            {"name": label.name, "x": round(label.x, 5), "y": round(label.y, 5), "kind": label.kind}
            for label in result.labels
        ]
        heightmap = base64.b64encode(result.heightmap).decode("ascii") if result.heightmap else ""
        mesh = base64.b64encode(result.mesh).decode("ascii") if result.mesh else ""
        texture = base64.b64encode(result.texture).decode("ascii") if result.texture else ""
        world.terrain_web = {
            "seed": result.seed,
            "style": result.style,
            "width": result.width,
            "height": result.height,
            "elapsed_ms": result.elapsed_ms,
            "labels": labels,
            "bake_labels": bake_labels,
            "heightmap": heightmap,
            "heightmap_width": result.heightmap_width,
            "heightmap_height": result.heightmap_height,
            "sea_level": result.sea_level,
            "mesh": mesh,
            "mesh_width": result.mesh_width,
            "mesh_height": result.mesh_height,
            "texture": texture,
            "texture_width": result.texture_width,
            "texture_height": result.texture_height,
            "generated_at": timezone.now().isoformat(),
        }
        world.save(update_fields=["terrain_web", "updated_at"])
        if result.fields is not None:
            token = fields_token(result.seed, result.style, result.width, result.height)
            try:
                write_cache(world.slug, token, encode_fields(result.fields))
            except OSError:  # generation must not fail because the cache is read-only
                logger.warning("terrain field cache write failed for %s", world.slug, exc_info=True)
        return Response(
            {
                # Same seed/style writes a stable filename; a version query
                # keeps the browser from showing the previous PNG.
                "background_url": request.build_absolute_uri(world.map_background.url)
                + f"?v={secrets.token_hex(4)}",
                "seed": result.seed,
                "style": result.style,
                "width": result.width,
                "height": result.height,
                "elapsed_ms": result.elapsed_ms,
                "labels": labels,
                "bake_labels": bake_labels,
                "heightmap": heightmap,
                "heightmap_width": result.heightmap_width,
                "heightmap_height": result.heightmap_height,
                "sea_level": result.sea_level,
                "mesh": mesh,
                "mesh_width": result.mesh_width,
                "mesh_height": result.mesh_height,
                "texture": texture,
                "texture_width": result.texture_width,
                "texture_height": result.texture_height,
                "prototype": False,
            }
        )



PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_BACKGROUND_BYTES = 8 * 1024 * 1024
MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024


def _png_size(payload: bytes) -> tuple[int, int] | None:
    """Read width/height straight from the IHDR chunk (no Pillow)."""
    if len(payload) < 24 or not payload.startswith(PNG_SIGNATURE) or payload[12:16] != b"IHDR":
        return None
    width = int.from_bytes(payload[16:20], "big")
    height = int.from_bytes(payload[20:24], "big")
    if width <= 0 or height <= 0:
        return None
    return width, height


def _terrain_version(meta: dict) -> str | None:
    try:
        return fields_token(meta["seed"], meta["style"], meta["width"], meta["height"])
    except (KeyError, TypeError, ValueError):
        return None


class TerrainUploadView(APIView):
    """Fetch the terrain recipe, or upload terrain generated on the operator's machine.

    GET  -> current seed/style/resolution + version (Bearer token or owner session)
    PUT  -> multipart upload of the finished artefacts (Bearer token or owner)

    The server never runs the generator here; it validates, stores and bumps the
    version so browsers pick the new PNG up immediately.
    """

    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser]

    def _resolve_world(self, request, world_slug: str):
        # Token holders are authenticated by the token itself, so private worlds
        # must resolve without going through the anonymous read check.
        world = get_object_or_404(World, slug=world_slug)
        if authenticate_token(request, world) is not None:
            return world
        if not getattr(request.user, "is_authenticated", False):
            return None
        if not world.can_edit(request.user):
            return None
        return world

    def get(self, request, world_slug: str):
        world = self._resolve_world(request, world_slug)
        if world is None:
            return Response({"detail": "需要地形上传令牌或登录会话"}, status=status.HTTP_401_UNAUTHORIZED)
        meta = world.terrain_web or {}
        return Response(
            {
                "seed": meta.get("seed"),
                "style": meta.get("style"),
                "width": meta.get("width"),
                "height": meta.get("height"),
                "version": _terrain_version(meta),
                "generated_at": meta.get("generated_at"),
            }
        )

    def put(self, request, world_slug: str):
        world = self._resolve_world(request, world_slug)
        if world is None:
            return Response({"detail": "需要地形上传令牌或登录会话"}, status=status.HTTP_401_UNAUTHORIZED)

        raw_seed = request.data.get("seed", "")
        try:
            seed = int(raw_seed)
        except (TypeError, ValueError):
            return Response({"detail": "seed 必须是整数"}, status=status.HTTP_400_BAD_REQUEST)
        if not 0 <= seed <= 2_147_483_647:
            return Response({"detail": "seed 超出范围"}, status=status.HTTP_400_BAD_REQUEST)

        style = str(request.data.get("style") or "")
        if style not in STYLE_NAMES:
            return Response({"detail": "不支持的地图风格"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            width = int(request.data.get("width", 0))
            height = int(request.data.get("height", 0))
        except (TypeError, ValueError):
            return Response({"detail": "width/height 必须是整数"}, status=status.HTTP_400_BAD_REQUEST)
        if width not in (1024, 1536, 2048, 4096) or height not in (640, 960, 1280, 2560):
            return Response({"detail": "不支持的分辨率"}, status=status.HTTP_400_BAD_REQUEST)

        background = request.FILES.get("background")
        if background is None:
            return Response({"detail": "缺少 background 文件"}, status=status.HTTP_400_BAD_REQUEST)
        if background.size > MAX_BACKGROUND_BYTES:
            return Response({"detail": "background 超过 8MB"}, status=status.HTTP_400_BAD_REQUEST)
        payload = background.read()
        size = _png_size(payload)
        if size is None:
            return Response({"detail": "background 不是有效的 PNG"}, status=status.HTTP_400_BAD_REQUEST)
        if size != (width, height):
            return Response(
                {"detail": f"background 尺寸 {size[0]}x{size[1]} 与声明 {width}x{height} 不一致"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wanted = request.data.get("if_version")
        current = _terrain_version(world.terrain_web or {})
        if wanted and current and wanted != current:
            return Response(
                {"detail": "世界地形已更新，请重新拉取配方后再上传", "version": current},
                status=status.HTTP_409_CONFLICT,
            )

        attachments: dict[str, bytes] = {}
        for field in ("mesh", "texture", "heightmap"):
            upload = request.FILES.get(field)
            if upload is None:
                continue
            if upload.size > MAX_ATTACHMENT_BYTES:
                return Response({"detail": f"{field} 过大"}, status=status.HTTP_400_BAD_REQUEST)
            attachments[field] = upload.read()

        meta_raw = request.data.get("meta") or "{}"
        try:
            meta = json.loads(meta_raw) if isinstance(meta_raw, str) else dict(meta_raw)
        except (TypeError, ValueError):
            return Response({"detail": "meta 必须是 JSON 对象"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(meta, dict):
            return Response({"detail": "meta 必须是 JSON 对象"}, status=status.HTTP_400_BAD_REQUEST)

        if world.map_background:
            world.map_background.delete(save=False)
        filename = f"terrain-web-{seed}-{style}.png"
        world.map_background.save(filename, ContentFile(payload), save=False)

        def b64(name: str) -> str:
            raw = attachments.get(name)
            return base64.b64encode(raw).decode("ascii") if raw else ""

        world.terrain_web = {
            "seed": seed,
            "style": style,
            "width": width,
            "height": height,
            "elapsed_ms": int(meta.get("elapsed_ms") or 0),
            "labels": meta.get("labels") or [],
            "bake_labels": bool(meta.get("bake_labels", False)),
            "heightmap": b64("heightmap"),
            "heightmap_width": int(meta.get("heightmap_width") or 0),
            "heightmap_height": int(meta.get("heightmap_height") or 0),
            "sea_level": meta.get("sea_level"),
            "mesh": b64("mesh"),
            "mesh_width": int(meta.get("mesh_width") or 0),
            "mesh_height": int(meta.get("mesh_height") or 0),
            "texture": b64("texture"),
            "texture_width": int(meta.get("texture_width") or 0),
            "texture_height": int(meta.get("texture_height") or 0),
            "generated_at": timezone.now().isoformat(),
            "generator": "local",
        }
        world.save(update_fields=["map_background", "terrain_web", "updated_at"])
        log_world_event(
            world,
            request.user,
            "terrain.uploaded",
            metadata={
                "seed": seed,
                "style": style,
                "width": width,
                "height": height,
                "bytes": len(payload),
                "generator": "local",
            },
        )
        return Response(
            {
                "background_url": request.build_absolute_uri(world.map_background.url)
                + f"?v={secrets.token_hex(4)}",
                "version": _terrain_version(world.terrain_web),
                "seed": seed,
                "style": style,
                "width": width,
                "height": height,
            }
        )
