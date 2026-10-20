"""Import a world ZIP produced by the P3.2 exporter."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

from django.core.files.base import ContentFile
from django.db import transaction

from apps.cards.models import Card
from apps.collections.models import Collection

from .models import World, WorldMembership
from .services import _unique_slug

MAX_ZIP_BYTES = 10 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
MAX_ENTRIES = 2000
MAX_BACKGROUND_BYTES = 4 * 1024 * 1024
IMAGE_SIGNATURES = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".webp": (b"RIFF",),
}


class WorldImportError(ValueError):
    pass


def _zip_bytes(upload) -> bytes:
    if upload.size > MAX_ZIP_BYTES:
        raise WorldImportError("ZIP 不能超过 10 MB")
    return upload.read()


def _safe_name(name: str) -> str:
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or ".." in normalized.split("/"):
        raise WorldImportError("ZIP 包含不安全路径")
    return normalized


def _payload(raw: bytes) -> dict[str, Any]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise WorldImportError("不是有效的 ZIP 文件") from exc

    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise WorldImportError("ZIP 文件过多")
    if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
        raise WorldImportError("ZIP 解压后过大")
    for info in infos:
        _safe_name(info.filename)

    try:
        data = json.loads(archive.read("world.json").decode("utf-8"))
    except KeyError as exc:
        raise WorldImportError("缺少 world.json") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WorldImportError("world.json 不是有效 JSON") from exc
    if data.get("format") != "opuscule-world-export/v1":
        raise WorldImportError("不支持的导出格式")
    if not isinstance(data.get("world"), dict):
        raise WorldImportError("world.json 缺少 world")
    return data, archive


def _required_str(value: object, field: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise WorldImportError(f"{field} 无效")
    return value.strip()


@transaction.atomic
def import_world(*, owner, upload) -> World:
    data, archive = _payload(_zip_bytes(upload))
    source = data["world"]
    name = _required_str(source.get("name"), "world.name", 160)
    description = source.get("description", "")
    if not isinstance(description, str) or len(description) > 4000:
        raise WorldImportError("world.description 无效")

    world = World.objects.create(
        slug=_unique_slug(name),
        name=name,
        description=description,
        kind=World.Kind.PRIVATE,
        is_public_read=False,
    )
    WorldMembership.objects.create(world=world, user=owner, role=WorldMembership.Role.OWNER)

    background = source.get("map_background")
    if isinstance(background, dict) and background.get("path"):
        background_path = _safe_name(str(background["path"]))
        suffix = Path(background_path).suffix.lower()
        if suffix not in IMAGE_SIGNATURES:
            raise WorldImportError("背景图格式不支持")
        try:
            raw = archive.read(background_path)
        except KeyError as exc:
            raise WorldImportError("背景图文件缺失") from exc
        if len(raw) > MAX_BACKGROUND_BYTES:
            raise WorldImportError("背景图不能超过 4 MB")
        if not any(raw.startswith(prefix) for prefix in IMAGE_SIGNATURES[suffix]):
            raise WorldImportError("背景图内容无效")
        world.map_background.save(
            Path(str(background.get("filename") or background_path)).name,
            ContentFile(raw),
            save=True,
        )

    collection_map: dict[str, Collection] = {}
    parent_links: list[tuple[Collection, str]] = []
    for index, item in enumerate(data.get("collections") or []):
        if not isinstance(item, dict):
            raise WorldImportError("collections 项无效")
        slug = _required_str(item.get("slug"), "collections.slug", 80)
        if slug in collection_map:
            raise WorldImportError("collection slug 重复")
        collection = Collection.objects.create(
            world=world,
            name=_required_str(item.get("name"), "collections.name", 160),
            slug=slug,
            icon=str(item.get("icon") or "")[:40],
            description=str(item.get("description") or "")[:4000],
            is_public=bool(item.get("is_public", True)),
            position_key=f"a{index + 1:03d}",
        )
        collection_map[slug] = collection
        parent = item.get("parent")
        if isinstance(parent, str) and parent:
            parent_links.append((collection, parent))
    for collection, parent_slug in parent_links:
        parent = collection_map.get(parent_slug)
        if parent is None:
            raise WorldImportError("collection parent 不存在")
        collection.parent = parent
        collection.save(update_fields=["parent"])

    card_map: dict[str, Card] = {}
    for item in data.get("cards") or []:
        if not isinstance(item, dict):
            raise WorldImportError("cards 项无效")
        slug = _required_str(item.get("slug"), "cards.slug", 120)
        if slug in card_map:
            raise WorldImportError("card slug 重复")
        body_json = item.get("body_json") or {}
        if not isinstance(body_json, dict):
            raise WorldImportError("card body_json 无效")
        collection_slug = item.get("collection")
        collection = collection_map.get(collection_slug) if isinstance(collection_slug, str) else None
        if collection_slug and collection is None:
            raise WorldImportError("card collection 不存在")
        card = Card.objects.create(
            world=world,
            home_collection=collection,
            kind=Card.Kind.TOOL if item.get("kind") == "tool" else Card.Kind.CONTENT,
            type_key=str(item.get("type_key") or "")[:80],
            title=_required_str(item.get("title"), "cards.title", 240),
            slug=slug,
            body_json=body_json,
            body_text=str(item.get("body_text") or ""),
            is_public=bool(item.get("is_public", True)),
            is_auxiliary=bool(item.get("is_auxiliary", False)),
        )
        card_map[slug] = card

    for item in data.get("map_markers") or []:
        if not isinstance(item, dict):
            raise WorldImportError("map_markers 项无效")
        try:
            x = float(item.get("x"))
            y = float(item.get("y"))
        except (TypeError, ValueError) as exc:
            raise WorldImportError("marker 坐标无效") from exc
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise WorldImportError("marker 坐标越界")
        card_slug = item.get("card")
        card = card_map.get(card_slug) if isinstance(card_slug, str) else None
        if card_slug and card is None:
            raise WorldImportError("marker 卡片不存在")
        world.map_markers.create(
            card=card,
            label=_required_str(item.get("label"), "map_markers.label", 120),
            kind=item.get("kind") if item.get("kind") in {"place", "event", "character", "note"} else "place",
            x=x,
            y=y,
            created_by=owner,
        )
    return world
