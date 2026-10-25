"""Packaged simulation fields for the GPU terrain renderer.

The container is deliberately small and dependency-free: a magic header, a
JSON manifest, then quantised field blocks.  The whole payload is gzipped and
cached on disk because it is immutable for a given
``(version, seed, style, width, height)`` tuple.

Layout::

    b"OTF1" | uint32 header_len (LE) | header JSON | block bytes

The client (WebGL shader) reads the manifest, slices the blocks and uploads
``surface``/``to_land`` as R16, the other scalar fields as R8, and the two
colour tables as RGB8.
"""

from __future__ import annotations

import gzip
import json
import struct
from array import array
from pathlib import Path

from django.conf import settings

from .terrain_web import (
    _DETAIL_HEIGHT,
    _DETAIL_WIDTH,
    TerrainFields,
    _chaikin,
    _detail_texture_cached,
    _river_branches,
)

MAGIC = b"OTF1"
# Bump when the quantisation, block set or shader contract changes so cached
# payloads are never served against a newer client.
FIELDS_VERSION = 3

_CACHE_DIRNAME = "terrain-fields"


def fields_token(seed: int, style: str, width: int, height: int) -> str:
    """Stable cache key / URL version for one world's field payload."""
    return f"{FIELDS_VERSION}-{int(seed)}-{style}-{int(width)}x{int(height)}"


def _quantize(values: list[float], levels: int) -> tuple[bytes, float, float]:
    """Quantise ``values`` to 0..levels and return (bytes, min, scale)."""
    lo = min(values)
    hi = max(values)
    span = hi - lo
    if span <= 1e-12:
        zeros = bytes(len(values) * (2 if levels > 255 else 1))
        return zeros, lo, 1.0
    scale = span / levels
    if levels > 255:
        data = array("H", (min(levels, max(0, int(round((v - lo) / scale)))) for v in values))
        if array("H").itemsize != 2:  # pragma: no cover - exotic platforms
            raise RuntimeError("unexpected uint16 item size")
        if struct.pack("<H", 1) != struct.pack("=H", 1):  # big-endian host
            data.byteswap()
        return data.tobytes(), lo, scale
    data = array("B", (min(levels, max(0, int(round((v - lo) / scale)))) for v in values))
    return data.tobytes(), lo, scale


_DISTANCE_LIMIT = 64.0


def _quantize_distance(values: list[float], limit: float = _DISTANCE_LIMIT) -> bytes:
    """Distances only matter near the coast; clamp to ``limit`` and use 8 bits."""
    return bytes(
        min(255, max(0, int(round(min(limit, max(0.0, v)) / limit * 255.0))))
        for v in values
    )


def pack_fields(fields: TerrainFields) -> bytes:
    """Serialise one field set into the OTF1 container (uncompressed)."""
    detail = _detail_texture_cached()
    blocks: list[dict] = []
    blobs: list[bytes] = []

    def add(name: str, dtype: str, blob: bytes, n: int, lo: float, scale: float) -> None:
        blocks.append(
            {
                "name": name,
                "dtype": dtype,
                "n": n,
                "offset": sum(len(b) for b in blobs),
                "byteLength": len(blob),
                "min": lo,
                "scale": scale,
            }
        )
        blobs.append(blob)

    surface, s_lo, s_scale = _quantize(fields.surface, 65535)
    add("surface", "u16", surface, len(fields.surface), s_lo, s_scale)

    # Distances beyond the shelf never reach the palette; clamping to 64 keeps
    # the 8-bit quantum at 0.25 instead of the raw field range.
    to_land = _quantize_distance(fields.to_land)
    add("to_land", "u8", to_land, len(fields.to_land), 0.0, _DISTANCE_LIMIT / 255.0)

    for name in ("shade", "moisture", "uplift", "forest"):
        values = getattr(fields, name)
        blob, lo, scale = _quantize(values, 255)
        add(name, "u8", blob, len(values), lo, scale)

    add("detail", "u8", detail, len(detail), 0.0, 1.0)

    # Decoration geometry: main stems are small enough to live in the JSON
    # manifest; tributaries are packed as 5 normalised u16 per branch
    # (x0, y0, x1, y1, bend) to keep the block compact.
    stems = []
    for path in fields.river_paths:
        points = [
            ((i % fields.gw + 0.5) / fields.gw, (i // fields.gw + 0.5) / fields.gh)
            for i in path
        ]
        points = _chaikin(points, 2)
        stems.append(
            {
                "acc": round(fields.accum[path[-1]], 3),
                "pts": [[round(x, 4), round(y, 4)] for x, y in points],
            }
        )
    branches = list(
        _river_branches(
            fields.receivers,
            fields.accum,
            fields.flow_surface,
            fields.sea,
            fields.gw,
            fields.gh,
            fields.river_cut * 1.15,
        )
    )
    tributary = array(
        "H",
        [
            value
            for bx, by, bjx, bjy, bend in branches
            for value in (
                round((bx + 0.5) / fields.gw * 65535),
                round((by + 0.5) / fields.gh * 65535),
                round((bjx + 0.5) / fields.gw * 65535),
                round((bjy + 0.5) / fields.gh * 65535),
                bend + 4,
            )
        ],
    )
    if struct.pack("<H", 1) != struct.pack("=H", 1):  # big-endian host
        tributary.byteswap()
    add("tributaries", "u16", tributary.tobytes(), len(branches) * 5, 0.0, 1.0)

    elev = bytes(channel for color in fields.elev_lut for channel in color)
    add("elev_lut", "u8", elev, len(elev) // 3, 0.0, 1.0)
    ocean = bytes(channel for color in fields.ocean_lut for channel in color)
    add("ocean_lut", "u8", ocean, len(ocean) // 3, 0.0, 1.0)

    header = {
        "version": FIELDS_VERSION,
        "seed": fields.seed,
        "style": fields.style,
        "width": fields.width,
        "height": fields.height,
        "gw": fields.gw,
        "gh": fields.gh,
        "sea": fields.sea,
        "relief": fields.relief,
        "river_cut": fields.river_cut,
        "rivers": stems,
        "tributary_count": len(branches),
        "detail_off_x": (fields.seed * 37) % _DETAIL_WIDTH,
        "detail_off_y": (fields.seed * 17) % _DETAIL_HEIGHT,
        "detail_w": _DETAIL_WIDTH,
        "detail_h": _DETAIL_HEIGHT,
        "forest": list(fields.palette["forest"]),
        "river": list(fields.palette["river"]),
        "paper": list(fields.palette["paper"]),
        "panel": list(fields.palette["panel"]),
        "ink": list(fields.palette["ink"]),
        "blocks": blocks,
    }
    raw_header = json.dumps(header, separators=(",", ":")).encode("utf-8")
    return MAGIC + struct.pack("<I", len(raw_header)) + raw_header + b"".join(blobs)


def encode_fields(fields: TerrainFields) -> bytes:
    """Pack and gzip one field set; deterministic for identical input."""
    return gzip.compress(pack_fields(fields), compresslevel=6, mtime=0)


def cache_path(slug: str, token: str) -> Path:
    """On-disk location of a world's immutable field payload."""
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in token)
    return Path(settings.MEDIA_ROOT) / _CACHE_DIRNAME / f"{slug}-{safe}.otf.gz"


def write_cache(slug: str, token: str, payload: bytes) -> Path:
    """Atomically write a payload so concurrent requests never see a partial file."""
    path = cache_path(slug, token)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(payload)
    tmp.replace(path)
    return path


def read_cache(slug: str, token: str) -> bytes | None:
    try:
        return cache_path(slug, token).read_bytes()
    except FileNotFoundError:
        return None
