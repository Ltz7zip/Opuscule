"""A small, dependency-free Terrain Web renderer.

This is deliberately a *prototype* of the product tier described in the
Terrain research notes: a CPU-side, deterministic local map with coastlines,
relief, rivers and a few baked labels.  It is not the full Terrain GAN /
450-Myr pipeline.  Keeping it stdlib-only lets the feature run in the project's
Python 3.14 environment without adding Pillow or NumPy.
"""

from __future__ import annotations

import math
import random
import struct
import time
import zlib
from dataclasses import dataclass
from functools import lru_cache

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

STYLE_NAMES = ("parchment", "atlas", "topographic")

_PALETTES: dict[str, dict[str, tuple[int, int, int]]] = {
    "atlas": {
        "deep": (7, 34, 64),
        "mid": (13, 65, 108),
        "shallow": (27, 112, 145),
        "foam": (180, 221, 220),
        "beach": (232, 213, 166),
        "grass": (124, 166, 83),
        "forest": (57, 112, 62),
        "rock": (145, 130, 105),
        "snow": (245, 247, 242),
        "river": (30, 112, 140),
        "ink": (18, 30, 28),
        "paper": (245, 236, 209),
        "panel": (14, 20, 20),
    },
    "parchment": {
        "deep": (91, 113, 109),
        "mid": (128, 145, 134),
        "shallow": (171, 181, 158),
        "foam": (226, 219, 194),
        "beach": (218, 202, 166),
        "grass": (160, 164, 124),
        "forest": (111, 124, 92),
        "rock": (158, 145, 121),
        "snow": (222, 222, 207),
        "river": (88, 120, 128),
        "ink": (52, 43, 30),
        "paper": (242, 232, 206),
        "panel": (56, 44, 30),
    },
    "topographic": {
        "deep": (7, 25, 43),
        "mid": (14, 62, 82),
        "shallow": (23, 100, 116),
        "foam": (188, 224, 211),
        "beach": (206, 190, 137),
        "grass": (117, 142, 76),
        "forest": (48, 92, 61),
        "rock": (120, 110, 94),
        "snow": (216, 222, 216),
        "river": (23, 92, 110),
        "ink": (16, 24, 25),
        "paper": (232, 240, 222),
        "panel": (13, 30, 33),
    },
}

_SYLLABLES_A = (
    "Aster",
    "Brine",
    "Cairn",
    "Dun",
    "Elder",
    "Fen",
    "Gale",
    "Harrow",
    "Iron",
    "Kestrel",
    "Lark",
    "Marrow",
    "North",
    "Orin",
    "Pike",
    "Quill",
    "Rook",
    "Sable",
    "Thal",
    "Veyra",
    "Wren",
    "Yarrow",
)
_SYLLABLES_B = (
    "reach",
    "vale",
    "mere",
    "watch",
    "fall",
    "moor",
    "cove",
    "crest",
    "fen",
    "hollow",
    "strand",
    "gate",
    "run",
    "barrow",
    "sound",
    "field",
)

# 5x7 bitmap font.  Only the characters used by the cartouche/labels.
_FONT: dict[str, tuple[str, ...]] = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    "'": ("00100", "00100", "00000", "00000", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "00110", "00110"),
}


@dataclass(frozen=True)
class TerrainLabel:
    name: str
    x: float
    y: float
    kind: str = "city"


@dataclass(frozen=True)
class TerrainResult:
    png: bytes
    width: int
    height: int
    seed: int
    style: str
    labels: tuple[TerrainLabel, ...]
    elapsed_ms: int
    heightmap: bytes = b""
    heightmap_width: int = 0
    heightmap_height: int = 0
    sea_level: float = 0.0
    mesh: bytes = b""
    mesh_width: int = 0
    mesh_height: int = 0
    texture: bytes = b""
    texture_width: int = 0
    texture_height: int = 0
    # The simulation substrate is returned with the render so callers (the
    # field packager) never need to rebuild it.
    fields: "TerrainFields | None" = None


@dataclass(frozen=True)
class TerrainFields:
    """Deterministic simulation substrate for one terrain map.

    Field arrays are flat ``gw * gh`` lists in row-major order; the same arrays
    are shared by the rasterizer, the packaged shader payload and the 3D mesh.
    """

    seed: int
    style: str
    width: int
    height: int
    gw: int
    gh: int
    cell_count: int
    ui: float
    sea: float
    relief: float
    surface: list[float]
    uplift: list[float]
    to_ocean: list[float]
    to_land: list[float]
    moisture: list[float]
    texture: list[float]
    forest: list[float]
    shade: list[float]
    slope: list[float]
    receivers: list[int]
    accum: list[float]
    flow_surface: list[float]
    river_cut: float
    river_color: tuple[int, int, int]
    river_paths: list[list[int]]
    palette: dict[str, tuple[int, int, int]]
    elev_lut: list[tuple[int, int, int]]
    ocean_lut: list[tuple[int, int, int]]
    rng: random.Random


class _GradientNoise:
    """A periodic 2-D gradient (Perlin-style) noise grid.

    Value noise produced visible blocks at low octave counts; gradient noise
    gives the rounded ridges and fractal coastlines needed for a map.
    """

    def __init__(self, rng: random.Random, size: int) -> None:
        self.size = size
        self.gradients = []
        for _ in range(size * size):
            angle = rng.random() * math.tau
            self.gradients.append((math.cos(angle), math.sin(angle)))

    def sample(self, x: float, y: float) -> float:
        size = self.size
        gx = (x % 1.0) * size
        gy = (y % 1.0) * size
        ix = int(gx)
        iy = int(gy)
        fx = gx - ix
        fy = gy - iy
        i0 = ix % size
        j0 = iy % size
        i1 = (i0 + 1) % size
        j1 = (j0 + 1) % size
        g00 = self.gradients[j0 * size + i0]
        g10 = self.gradients[j0 * size + i1]
        g01 = self.gradients[j1 * size + i0]
        g11 = self.gradients[j1 * size + i1]
        n00 = g00[0] * fx + g00[1] * fy
        n10 = g10[0] * (fx - 1.0) + g10[1] * fy
        n01 = g01[0] * fx + g01[1] * (fy - 1.0)
        n11 = g11[0] * (fx - 1.0) + g11[1] * (fy - 1.0)
        sx = fx * fx * (3.0 - 2.0 * fx)
        sy = fy * fy * (3.0 - 2.0 * fy)
        a = n00 + (n10 - n00) * sx
        b = n01 + (n11 - n01) * sx
        return (a + (b - a) * sy) * 1.42


def _fbm(noises: list[_GradientNoise], x: float, y: float) -> float:
    total = 0.0
    amp = 0.54
    norm = 0.0
    for noise in noises:
        total += amp * noise.sample(x, y)
        norm += amp
        amp *= 0.5
    return total / norm


def _ridged(noises: list[_GradientNoise], x: float, y: float, octaves: int = 4) -> float:
    value = 0.0
    amplitude = 0.5
    frequency = 1.0
    total = 0.0
    for _ in range(octaves):
        n = _fbm(noises, x * frequency + 0.13, y * frequency + 0.47)
        r = 1.0 - abs(2.0 * n - 1.0)
        value += amplitude * r * r
        total += amplitude
        amplitude *= 0.5
        frequency *= 2.0
    return value / max(total, 1e-6)


def _smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0 if value < edge0 else 1.0
    t = _clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def _clamp(value: float, low: float, high: float) -> float:
    return low if value < low else high if value > high else value


def _build_detail_texture(width: int = 512, height: int = 320) -> bytearray:
    """Static high-frequency relief texture, sampled at output resolution.

    It is seed-independent and built once at module import; the generator
    offsets it by seed so the same texture does not appear in the same place
    on every world.
    """
    rng = random.Random(20261023)
    ridge = [_GradientNoise(rng, 8) for _ in range(3)]
    grain = [_GradientNoise(rng, 8) for _ in range(3)]
    data = bytearray(width * height)
    for y in range(height):
        v = y / height
        row = y * width
        for x in range(width):
            u = x / width
            r = _ridged(ridge, u * 7.0 + 0.21, v * 7.0 + 0.63, octaves=3)
            g = _fbm(grain, u * 19.0 + 0.11, v * 19.0 + 0.37)
            value = _clamp(0.68 * r + 0.32 * g, 0.0, 1.0)
            data[row + x] = int(value * 255)
    return data


_DETAIL_WIDTH = 384
_DETAIL_HEIGHT = 240


@lru_cache(maxsize=1)
def _detail_texture_cached() -> bytes:
    """The seed-independent relief texture, built once per process."""
    return bytes(_build_detail_texture(_DETAIL_WIDTH, _DETAIL_HEIGHT))


def _mix(c0: tuple[int, int, int], c1: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return (
        int(c0[0] + (c1[0] - c0[0]) * t),
        int(c0[1] + (c1[1] - c0[1]) * t),
        int(c0[2] + (c1[2] - c0[2]) * t),
    )


def _png(width: int, height: int, rgb: bytearray) -> bytes:
    """Encode an RGB bytearray as a PNG without external image libraries."""
    stride = width * 3
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        raw.extend(rgb[y * stride : (y + 1) * stride])
    compressed = zlib.compress(bytes(raw), 6)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def _draw_pixel(rgb: bytearray, width: int, height: int, x: int, y: int, color: tuple[int, int, int]) -> None:
    if 0 <= x < width and 0 <= y < height:
        idx = (y * width + x) * 3
        rgb[idx] = color[0]
        rgb[idx + 1] = color[1]
        rgb[idx + 2] = color[2]


def _blend_pixel(
    rgb: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    color: tuple[int, int, int],
    alpha: float,
) -> None:
    if not (0 <= x < width and 0 <= y < height):
        return
    idx = (y * width + x) * 3
    a = _clamp(alpha, 0.0, 1.0)
    rgb[idx] = int(rgb[idx] * (1.0 - a) + color[0] * a)
    rgb[idx + 1] = int(rgb[idx + 1] * (1.0 - a) + color[1] * a)
    rgb[idx + 2] = int(rgb[idx + 2] * (1.0 - a) + color[2] * a)


def _line(
    rgb: bytearray,
    width: int,
    height: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int],
    thickness: int = 1,
) -> None:
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    radius = max(0, thickness // 2)
    while True:
        if radius:
            for oy in range(-radius, radius + 1):
                for ox in range(-radius, radius + 1):
                    if ox * ox + oy * oy <= radius * radius + 1:
                        _draw_pixel(rgb, width, height, x0 + ox, y0 + oy, color)
        else:
            _draw_pixel(rgb, width, height, x0, y0, color)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def _text_width(text: str, scale: int) -> int:
    return max(0, len(text) * 6 * scale - scale)


def _text(
    rgb: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    text: str,
    color: tuple[int, int, int],
    *,
    scale: int = 2,
    shadow: tuple[int, int, int] | None = None,
) -> None:
    cx = x
    for ch in text.upper():
        glyph = _FONT.get(ch)
        if glyph is None:
            cx += 6 * scale
            continue
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit != "1":
                    continue
                px = cx + col * scale
                py = y + row * scale
                if shadow is not None:
                    for dy in range(scale):
                        for dx in range(scale):
                            _blend_pixel(rgb, width, height, px + dx + max(1, scale // 2), py + dy + max(1, scale // 2), shadow, 0.72)
                for dy in range(scale):
                    for dx in range(scale):
                        _draw_pixel(rgb, width, height, px + dx, py + dy, color)
        cx += 6 * scale


def _hydraulic_erosion(
    heights: list[float],
    gw: int,
    gh: int,
    sea: float,
    rng: random.Random,
    droplets: int = 14000,
) -> None:
    """Carve valleys and alluvial fans with a bounded droplet simulation."""
    for _ in range(droplets):
        x = rng.uniform(2.0, gw - 2.0)
        y = rng.uniform(2.0, gh - 2.0)
        ix = int(x)
        iy = int(y)
        if heights[iy * gw + ix] <= sea + 0.012:
            continue
        dx = 0.0
        dy = 0.0
        speed = 1.0
        water = 1.0
        sediment = 0.0
        for _step in range(32):
            ix = int(x)
            iy = int(y)
            if ix < 1 or iy < 1 or ix >= gw - 1 or iy >= gh - 1:
                break
            i = iy * gw + ix
            h = heights[i]
            if h <= sea:
                break
            gx = (heights[i + 1] - heights[i - 1]) * 0.5 * gw
            gy = (heights[i + gw] - heights[i - gw]) * 0.5 * gh
            dx = dx * 0.66 - gx * 0.28
            dy = dy * 0.66 - gy * 0.28
            length = math.hypot(dx, dy)
            if length < 1e-7:
                angle = rng.random() * math.tau
                dx = math.cos(angle)
                dy = math.sin(angle)
            else:
                dx /= length
                dy /= length
            nx = x + dx
            ny = y + dy
            if nx < 1 or ny < 1 or nx >= gw - 1 or ny >= gh - 1:
                break
            nix = int(nx)
            niy = int(ny)
            ni = niy * gw + nix
            h2 = heights[ni]
            dh = h2 - h
            capacity = max(-dh, 0.0004) * speed * water * 2.8
            if sediment > capacity or dh > 0.0:
                amount = min(sediment, dh) if dh > 0.0 else sediment * 0.28
                heights[i] += amount
                sediment -= amount
            else:
                amount = min((capacity - sediment) * 0.36, -dh * 0.55, 0.004)
                if amount > 0.0:
                    heights[i] -= amount
                    sediment += amount
            water *= 0.988
            speed = math.sqrt(max(0.01, speed * speed - dh * 3.6))
            x = nx
            y = ny
            if water < 0.04:
                break


def _fill_depressions(
    heights: list[float], gw: int, gh: int
) -> list[float]:
    """Priority-flood fill so D8 rivers can reach the sea instead of dying in pits."""
    import heapq

    n = gw * gh
    filled = heights[:]
    visited = [False] * n
    heap: list[tuple[float, int]] = []
    for x in range(gw):
        for y in (0, gh - 1):
            i = y * gw + x
            if not visited[i]:
                visited[i] = True
                heapq.heappush(heap, (filled[i], i))
    for y in range(gh):
        for x in (0, gw - 1):
            i = y * gw + x
            if not visited[i]:
                visited[i] = True
                heapq.heappush(heap, (filled[i], i))
    while heap:
        level, i = heapq.heappop(heap)
        x = i % gw
        y = i // gw
        for j in (i - 1, i + 1, i - gw, i + gw):
            if j < 0 or j >= n or visited[j]:
                continue
            jx = j % gw
            if abs(jx - x) > 1:
                continue
            visited[j] = True
            if filled[j] < level:
                filled[j] = level
            heapq.heappush(heap, (filled[j], j))
    return filled


def _distance_fields(
    heights: list[float], gw: int, gh: int, sea: float
) -> tuple[list[float], list[float]]:
    """Return (distance-to-ocean on land, distance-to-land in ocean)."""
    from collections import deque

    n = gw * gh
    land = [h > sea for h in heights]
    inf = 10**9
    to_land = [inf] * n
    to_ocean = [inf] * n
    queue: deque[int] = deque()
    for i, is_land in enumerate(land):
        if is_land:
            to_land[i] = 0
            queue.append(i)
    while queue:
        i = queue.popleft()
        d = to_land[i] + 1
        x = i % gw
        y = i // gw
        for j in (i - 1, i + 1, i - gw, i + gw):
            if j < 0 or j >= n:
                continue
            jx = j % gw
            if abs(jx - x) > 1:
                continue
            if not land[j] and d < to_land[j]:
                to_land[j] = d
                queue.append(j)

    queue.clear()
    for i, is_land in enumerate(land):
        if not is_land:
            to_ocean[i] = 0
            queue.append(i)
    while queue:
        i = queue.popleft()
        d = to_ocean[i] + 1
        x = i % gw
        y = i // gw
        for j in (i - 1, i + 1, i - gw, i + gw):
            if j < 0 or j >= n:
                continue
            jx = j % gw
            if abs(jx - x) > 1:
                continue
            if land[j] and d < to_ocean[j]:
                to_ocean[j] = d
                queue.append(j)
    return to_ocean, to_land


def _chaikin(points: list[tuple[float, float]], iterations: int = 2) -> list[tuple[float, float]]:
    for _ in range(iterations):
        if len(points) < 3:
            break
        smoothed = [points[0]]
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            smoothed.append((x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25))
            smoothed.append((x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75))
        smoothed.append(points[-1])
        points = smoothed
    return points


def _river_paths(
    receivers: list[int],
    accum: list[float],
    heights: list[float],
    sea: float,
    gw: int,
    gh: int,
    limit: int = 8,
) -> list[list[int]]:
    mouths: list[tuple[float, int]] = []
    for y in range(1, gh - 1):
        for x in range(1, gw - 1):
            i = y * gw + x
            if heights[i] <= sea:
                continue
            if any(
                heights[ny * gw + nx] <= sea
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
            ):
                mouths.append((accum[i], i))
    mouths.sort(reverse=True)
    paths: list[list[int]] = []
    for _score, mouth in mouths:
        path = [mouth]
        current = mouth
        for _ in range(180):
            best = -1
            best_score = -1.0
            x = current % gw
            y = current // gw
            for ny in (y - 1, y, y + 1):
                if ny < 0 or ny >= gh:
                    continue
                for nx in (x - 1, x, x + 1):
                    if nx < 0 or nx >= gw or (nx == x and ny == y):
                        continue
                    n = ny * gw + nx
                    if receivers[n] == current and heights[n] > sea and accum[n] > best_score:
                        best = n
                        best_score = accum[n]
            if best < 0:
                break
            path.append(best)
            current = best
        if len(path) >= 22:
            path.reverse()
            paths.append(path)
        if len(paths) >= limit:
            break
    return paths


def _river_branches(
    receivers: list[int],
    accum: list[float],
    heights: list[float],
    sea: float,
    gw: int,
    gh: int,
    threshold: float,
) -> list[tuple[int, int, int, int, int]]:
    """Return curved tributary segments (x0, y0, x1, y1, bend_code)."""
    branches: list[tuple[int, int, int, int, int]] = []
    for y in range(1, gh - 1):
        for x in range(1, gw - 1):
            i = y * gw + x
            if heights[i] <= sea or accum[i] < threshold:
                continue
            j = receivers[i]
            if j < 0:
                continue
            branches.append((x, y, j % gw, j // gw, (x * 73856093 ^ y * 19349663) % 9 - 4))
    return branches


def _bilinear(
    values: list[float],
    r0: int,
    ix0: int,
    ix1: int,
    r1: int,
    fx: float,
    fy: float,
) -> float:
    a = values[r0 + ix0] + (values[r0 + ix1] - values[r0 + ix0]) * fx
    b = values[r1 + ix0] + (values[r1 + ix1] - values[r1 + ix0]) * fx
    return a + (b - a) * fy


def _compass(
    rgb: bytearray,
    width: int,
    height: int,
    paper: tuple[int, int, int],
    ink: tuple[int, int, int],
    scale: float = 1.0,
) -> None:
    """A small cartographic compass rose for the hand-drawn map."""
    cx = int(width * 0.90)
    cy = int(height * 0.16)
    radius = max(12, int(22 * scale))
    for step in range(32):
        a0 = math.tau * step / 32
        a1 = math.tau * (step + 1) / 32
        _line(
            rgb,
            width,
            height,
            int(cx + math.cos(a0) * radius),
            int(cy + math.sin(a0) * radius),
            int(cx + math.cos(a1) * radius),
            int(cy + math.sin(a1) * radius),
            paper,
            1,
        )
    _line(rgb, width, height, cx, cy + radius - 4, cx, cy - radius + 3, ink, 1)
    _line(rgb, width, height, cx - 5, cy - radius + 8, cx, cy - radius + 2, ink, 1)
    _line(rgb, width, height, cx + 5, cy - radius + 8, cx, cy - radius + 2, ink, 1)
    _line(rgb, width, height, cx - radius + 4, cy, cx + radius - 4, cy, paper, 1)
    _text(rgb, width, height, cx - 3, cy - radius - 14, "N", ink, scale=max(1, int(round(scale))))


def _choose_labels(
    rng: random.Random,
    heights: list[float],
    sea: float,
    accum: list[float],
    gw: int,
    gh: int,
    limit: int = 7,
) -> tuple[TerrainLabel, ...]:
    candidates: list[tuple[float, int, int]] = []
    for y in range(2, gh - 2):
        row = y * gw
        for x in range(2, gw - 2):
            i = row + x
            h = heights[i]
            if h <= sea + 0.025:
                continue
            # Prefer river mouths / high-accumulation land but avoid tiny islands.
            score = math.log1p(accum[i]) + h * 6.0
            candidates.append((score, x, y))
    candidates.sort(reverse=True)
    picked: list[tuple[int, int]] = []
    used_names: set[str] = set()
    labels: list[TerrainLabel] = []
    min_dist2 = 0.16 * 0.16
    for _, x, y in candidates:
        nx = (x + 0.5) / gw
        ny = (y + 0.5) / gh
        # Keep labels inside a safe area: the map page uses a tall canvas and
        # crops wide images with object-fit: cover on desktop.
        if nx < 0.24 or nx > 0.68 or ny < 0.18 or ny > 0.82:
            continue
        if any((nx - px) ** 2 + (ny - py) ** 2 < min_dist2 for px, py in picked):
            continue
        picked.append((nx, ny))
        title = ""
        for _ in range(12):
            candidate = f"{rng.choice(_SYLLABLES_A)} {rng.choice(_SYLLABLES_B)}"
            if candidate not in used_names:
                title = candidate
                break
        if not title:
            continue
        used_names.add(title)
        labels.append(TerrainLabel(title, nx, ny))
        if len(labels) >= limit:
            break
    return tuple(labels)


def _build_elevation_lut(palette: dict[str, tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    """A clean hypsometric ramp: beach -> grass -> forest -> rock -> snow."""
    lut: list[tuple[int, int, int]] = []
    for i in range(256):
        t = i / 255.0
        if t < 0.05:
            color = _mix(palette["beach"], palette["grass"], _smoothstep(0.006, 0.05, t))
        elif t < 0.34:
            color = palette["grass"]
        elif t < 0.54:
            color = _mix(palette["grass"], palette["forest"], _smoothstep(0.34, 0.54, t))
        elif t < 0.68:
            color = _mix(palette["forest"], palette["rock"], _smoothstep(0.54, 0.68, t) * 0.55)
        elif t < 0.82:
            color = _mix(palette["rock"], (104, 100, 94), _smoothstep(0.68, 0.82, t))
        else:
            color = _mix((104, 100, 94), palette["snow"], _smoothstep(0.82, 0.94, t))
        lut.append(color)
    return lut


def _build_land_lut(palette: dict[str, tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    """Quantized elevation x moisture x slope palette for output-resolution shading."""
    lut: list[tuple[int, int, int]] = []
    for tb in range(64):
        t = (tb + 0.5) / 64.0
        for mb in range(8):
            mo = (mb + 0.5) / 8.0
            for sb in range(8):
                sl = (sb + 0.5) / 8.0
                forest = _smoothstep(0.18, 0.58, mo)
                color = _mix(palette["grass"], palette["forest"], forest)
                if t < 0.06:
                    color = _mix(palette["beach"], color, _smoothstep(0.008, 0.06, t))
                rock = _smoothstep(0.52, 0.88, sl)
                color = _mix(color, palette["rock"], rock * 0.58)
                high = _smoothstep(0.42, 0.78, t)
                color = _mix(color, palette["rock"], high * 0.46)
                snow = _smoothstep(0.70, 0.84, t) * (1.0 - _smoothstep(0.76, 0.98, sl) * 0.45)
                color = _mix(color, palette["snow"], snow * 0.94)
                lut.append(color)
    return lut


def _build_plate_field(
    gw: int, gh: int, rng: random.Random
) -> tuple[list[float], list[float], list[float], float, list[float], list[float], list[int], list[float], list[int]]:
    """Build a schematic plate-tectonic height field.

    Returns heights, uplift, sea level, surface, filled flow surface,
    receivers, accumulation and a lake mask.
    """
    from collections import deque

    n = gw * gh
    plate_count = rng.randint(7, 9)
    seeds: list[tuple[float, float, bool, float, float]] = []
    for idx in range(plate_count):
        # At least two continental plates and two oceanic plates.
        continental = (idx < 2) or (rng.random() < 0.35 and idx < plate_count - 2)
        angle = rng.random() * math.tau
        speed = rng.uniform(0.35, 1.0)
        seeds.append((
            rng.uniform(0.12, 0.88),
            rng.uniform(0.14, 0.86),
            continental,
            angle,
            speed,
        ))
    cores = [
        (rng.uniform(0.18, 0.82), rng.uniform(0.20, 0.80), rng.uniform(0.11, 0.24))
        for _ in range(rng.randint(4, 6))
    ]
    warp_x = [_GradientNoise(rng, size) for size in (8, 16, 32, 64)]
    warp_y = [_GradientNoise(rng, size) for size in (8, 16, 32, 64)]
    broad = [_GradientNoise(rng, size) for size in (8, 16, 32, 64)]
    ridge = [_GradientNoise(rng, size) for size in (16, 32, 64, 128)]
    detail = [_GradientNoise(rng, size) for size in (32, 64, 128, 256)]

    plate = [0] * n
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            wx = u + 0.055 * _fbm(warp_x, u + 0.11, v + 0.29)
            wy = v + 0.055 * _fbm(warp_y, u + 0.67, v + 0.43)
            best = 0
            best_distance = 1e9
            for idx, (sx, sy, _continental, _angle, _speed) in enumerate(seeds):
                dx = wx - sx
                dy = wy - sy
                d2 = dx * dx + dy * dy
                if d2 < best_distance:
                    best_distance = d2
                    best = idx
            plate[row + x] = best

    heights = [0.0] * n
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            # Continental cores give the map readable peninsulas and islands;
            # plates below supply the orogenic belts, not the land outline.
            blob = 0.0
            for cx, cy, radius in cores:
                d2 = (u - cx) ** 2 + (v - cy) ** 2
                blob = max(blob, math.exp(-d2 / (2.0 * radius * radius)))
            base = 0.50 * blob
            base += 0.26 * (_fbm(broad, u * 1.1 + 0.2, v * 1.1 + 0.6) - 0.5)
            base += 0.10 * (_fbm(broad, u * 2.7 + 0.8, v * 2.7 + 0.1) - 0.5)
            heights[row + x] = base

    # Classify each inter-plate edge by relative velocity and boundary normal.
    conv = [False] * n
    div = [False] * n
    conv_amp = [0.0] * n
    div_amp = [0.0] * n
    for y in range(gh):
        for x in range(gw):
            i = y * gw + x
            a = plate[i]
            ax, ay, acont, aangle, aspeed = seeds[a]
            avx = math.cos(aangle) * aspeed
            avy = math.sin(aangle) * aspeed
            for j, nx, ny in (
                (i + 1, 1.0, 0.0) if x + 1 < gw else (-1, 0.0, 0.0),
                (i + gw, 0.0, 1.0) if y + 1 < gh else (-1, 0.0, 0.0),
            ):
                if j < 0:
                    continue
                b = plate[j]
                if a == b:
                    continue
                bx, by, bcont, bangle, bspeed = seeds[b]
                bvx = math.cos(bangle) * bspeed
                bvy = math.sin(bangle) * bspeed
                conv_value = -((avx - bvx) * nx + (avy - bvy) * ny)
                if conv_value > 0.18:
                    conv[i] = True
                    conv[j] = True
                    amp = 1.0 if (acont and bcont) else 0.55 if (acont or bcont) else 0.28
                    conv_amp[i] = max(conv_amp[i], amp)
                    conv_amp[j] = max(conv_amp[j], amp)
                elif conv_value < -0.18:
                    div[i] = True
                    div[j] = True
                    div_amp[i] = max(div_amp[i], 1.0 if (acont and bcont) else 0.35)
                    div_amp[j] = max(div_amp[j], 1.0 if (acont and bcont) else 0.35)

    def distance_to(mask: list[bool], limit: int = 40) -> list[float]:
        dist = [1e9] * n
        q: deque[int] = deque()
        for i, flag in enumerate(mask):
            if flag:
                dist[i] = 0
                q.append(i)
        while q:
            i = q.popleft()
            d = dist[i] + 1
            if d > limit:
                continue
            x = i % gw
            for j in (i - 1, i + 1, i - gw, i + gw):
                if j < 0 or j >= n:
                    continue
                if abs((j % gw) - x) > 1:
                    continue
                if d < dist[j]:
                    dist[j] = d
                    q.append(j)
        return dist

    conv_dist = distance_to(conv)
    div_dist = distance_to(div)
    uplift_field = [0.0] * n
    peak_mask = [0.0] * n
    peaks: list[tuple[int, int, float, float]] = []
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            i = row + x
            uplift = 0.0
            if conv_dist[i] < 1e8:
                d = conv_dist[i]
                width = 9.0 + 4.0 * (_fbm(ridge, u * 0.7 + 0.3, v * 0.7 + 0.1))
                belt = math.exp(-(d / max(4.0, width)) ** 2)
                peak = 1.0 - abs(2.0 * _fbm(ridge, u * 2.1 + 0.2, v * 2.1 + 0.7) - 1.0)
                # Convergent belts are the alpine spine.  The previous
                # boundary-cell amplitude was zero just one cell inland, which
                # reduced the range to a dark crease; use a belt amplitude.
                amp = 1.55
                uplift = amp * belt * (0.56 + 0.44 * peak)
                uplift += 0.18 * amp * math.exp(-(d / 24.0) ** 2)
                heights[i] += uplift
            if div_dist[i] < 1e8:
                d = div_dist[i]
                belt = math.exp(-(d / 10.0) ** 2)
                heights[i] -= 0.055 * div_amp[i] * belt

            # Small hotspot chains / seamounts.
            uplift_field[i] = uplift

    # A handful of sharp summit cones on the orogenic belts.  The broad
    # uplift belt supplies the range; these bumps give the skyline recognizable
    # high peaks instead of a uniform white plateau.
    high = [i for i in range(n) if uplift_field[i] > 0.08]
    for _ in range(18):
        if not high:
            break
        center = high[rng.randrange(len(high))]
        cx = center % gw
        cy = center // gw
        radius = rng.uniform(2.8, 6.0)
        peak_amp = rng.uniform(0.14, 0.30)
        for y in range(max(0, cy - 6), min(gh, cy + 7)):
            for x in range(max(0, cx - 6), min(gw, cx + 7)):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                peak = math.exp(-d2 / (2.0 * radius * radius))
                heights[y * gw + x] += peak_amp * peak
                peak_mask[y * gw + x] = max(peak_mask[y * gw + x], peak)
        peaks.append((cx, cy, radius, peak_amp))

    # Fractal detail on top of the plate structure.
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            detail_value = _fbm(detail, u * 2.6 + 0.17, v * 2.6 + 0.33) - 0.5
            heights[row + x] += 0.040 * detail_value
            if uplift_field[row + x] > 0.025:
                crest = _ridged(ridge, u * 2.8 + 0.51, v * 2.8 + 0.23)
                heights[row + x] += uplift_field[row + x] * (crest - 0.28) * 0.72

    # A few hotspot islands, biased away from the central continent.
    for _ in range(rng.randint(2, 4)):
        cx = rng.uniform(0.12, 0.88)
        cy = rng.uniform(0.12, 0.88)
        radius = rng.uniform(0.018, 0.045)
        amplitude = rng.uniform(0.16, 0.30)
        for y in range(gh):
            v = (y + 0.5) / gh
            row = y * gw
            for x in range(gw):
                u = (x + 0.5) / gw
                d2 = (u - cx) ** 2 + (v - cy) ** 2
                heights[row + x] += amplitude * math.exp(-d2 / (2.0 * radius * radius))

    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            edge = min(u, 1.0 - u, v, 1.0 - v)
            heights[row + x] *= _smoothstep(0.0, 0.06, edge)

    sorted_h = sorted(heights)
    sea = sorted_h[int(len(sorted_h) * 0.66)]

    _hydraulic_erosion(heights, gw, gh, sea, rng, droplets=5500)

    # Light smoothing keeps the surface readable while preserving plate belts.
    surface = [0.0] * n
    for y in range(gh):
        y0 = max(0, y - 1)
        y1 = min(gh - 1, y + 1)
        for x in range(gw):
            x0 = max(0, x - 1)
            x1 = min(gw - 1, x + 1)
            surface[y * gw + x] = (
                heights[y * gw + x] * 3.0
                + heights[y * gw + x0] + heights[y * gw + x1]
                + heights[y0 * gw + x] + heights[y1 * gw + x]
            ) / 7.0

    # Add the sharp crests after erosion; if they are eroded too they become
    # rounded hills instead of the intended alpine skyline.
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            i = row + x
            if uplift_field[i] > 0.025:
                u = (x + 0.5) / gw
                crest = _ridged(ridge, u * 3.6 + 0.31, v * 3.6 + 0.77)
                surface[i] += uplift_field[i] * (crest - 0.32) * 0.62

    flow_surface = _fill_depressions(surface, gw, gh)
    lake_mask = [0] * n
    for i in range(n):
        if surface[i] > sea and flow_surface[i] - surface[i] > 0.0012:
            lake_mask[i] = 1
    # Keep only connected lakes large enough to read; the priority-flood pass
    # also fills tiny upland pits that should not become blue specks.
    seen = [False] * n
    from collections import deque
    for i in range(n):
        if not lake_mask[i] or seen[i]:
            continue
        q = deque([i])
        seen[i] = True
        component: list[int] = []
        while q:
            k = q.popleft()
            component.append(k)
            kx = k % gw
            for j in (k - 1, k + 1, k - gw, k + gw):
                if j < 0 or j >= n or seen[j] or not lake_mask[j]:
                    continue
                if abs((j % gw) - kx) > 1:
                    continue
                seen[j] = True
                q.append(j)
        if len(component) < 18:
            for k in component:
                lake_mask[k] = 0

    receivers = [-1] * n
    for y in range(1, gh - 1):
        for x in range(1, gw - 1):
            i = y * gw + x
            h = flow_surface[i]
            best_j = -1
            best_drop = 0.0
            for oy, ox, dist in (
                (-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
                (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414),
            ):
                nx = x + ox
                ny = y + oy
                if nx < 0 or ny < 0 or nx >= gw or ny >= gh:
                    continue
                j = ny * gw + nx
                drop = (h - flow_surface[j]) / dist
                if drop > best_drop:
                    best_drop = drop
                    best_j = j
            receivers[i] = best_j

    accum = [1.0] * n
    for i in sorted(range(n), key=lambda k: flow_surface[k], reverse=True):
        if flow_surface[i] <= sea:
            continue
        j = receivers[i]
        if j >= 0:
            accum[j] += accum[i]

    return heights, uplift_field, peak_mask, peaks, sea, surface, flow_surface, receivers, accum, lake_mask


def build_fields(
    seed: int = 1,
    *,
    width: int = 2048,
    height: int = 1280,
    style: str = "atlas",
) -> TerrainFields:
    """Build the deterministic simulation fields for one terrain map.

    This is the low-frequency substrate shared by the PNG rasterizer, the
    packaged ``/map/fields`` payload and the WebGL shader.  It performs no
    output-pixel work, so callers can build fields once and render many sizes.

    Args:
        seed: Deterministic world seed.
        width/height: Requested output size; the simulation grid is derived
            from them and capped for a bounded CPU budget.
        style: One of ``atlas``, ``parchment``, ``topographic``.
    """
    if style not in _PALETTES:
        raise ValueError(f"unknown style: {style}")
    width = int(_clamp(width, 64, 4096))
    height = int(_clamp(height, 40, 2560))
    rng = random.Random(int(seed) & 0x7FFFFFFF)
    palette = _PALETTES[style]
    ui = max(1.0, width / 1280.0)

    # More cells than the old 512x320 renderer: the coast and river banks need
    # enough samples to survive bilinear upscaling without looking pixelated.
    gw = int(_clamp(width // 2.9, 128, 700))
    gh = int(_clamp(height // 2.9, 80, 438))
    cell_count = gw * gh

    # Plate-tectonic field: warped Voronoi plates, classified boundaries and
    # uplift belts, followed by hydraulic erosion and filled-depression flow.
    (
        heights,
        uplift_field,
        peak_mask,
        peaks,
        sea,
        surface,
        flow_surface,
        receivers,
        accum,
        lake_mask,
    ) = _build_plate_field(gw, gh, rng)

    moisture_noises = [_GradientNoise(rng, size) for size in (8, 16, 32, 64)]
    texture_noises = [_GradientNoise(rng, size) for size in (32, 64, 128, 256)]

    sorted_surface = sorted(surface)
    relief = max(0.08, sorted_surface[int(len(sorted_surface) * 0.995)] - sea)

    # Distances to coast: the ocean is colored by shelf depth, not by raw fBm.
    to_ocean, to_land = _distance_fields(surface, gw, gh, sea)

    moisture = [0.0] * cell_count
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            moisture[row + x] = _clamp(
                0.5 + 0.5 * _fbm(moisture_noises, u * 0.92 + 0.11, v * 0.92 + 0.37),
                0.0,
                1.0,
            )

    texture = [0.0] * cell_count
    for y in range(gh):
        v = (y + 0.5) / gh
        row = y * gw
        for x in range(gw):
            u = (x + 0.5) / gw
            texture[row + x] = 0.5 + 0.5 * _fbm(texture_noises, u * 1.7 + 0.23, v * 1.7 + 0.51)

    forest_field = [0.0] * cell_count
    for i in range(cell_count):
        forest_field[i] = _smoothstep(
            0.18, 0.58, moisture[i] + (texture[i] - 0.5) * 0.24
        )

    # Hillshade, slope and a normal-ish light from the north-west.
    shade = [0.0] * cell_count
    slope = [0.0] * cell_count
    for y in range(gh):
        y0 = max(0, y - 1)
        y1 = min(gh - 1, y + 1)
        for x in range(gw):
            x0 = max(0, x - 1)
            x1 = min(gw - 1, x + 1)
            i = y * gw + x
            dx = (surface[y * gw + x1] - surface[y * gw + x0]) * 18.0
            dy = (surface[y1 * gw + x] - surface[y0 * gw + x]) * 16.0
            light = (0.72 - 0.58 * dx - 0.44 * dy) / math.sqrt(1.0 + dx * dx + dy * dy)
            shade[i] = _clamp(0.62 + 0.56 * light, 0.44, 1.28)
            slope[i] = _clamp(math.hypot(dx, dy) * 1.8, 0.0, 1.0)

    # D8 flow was computed together with the tectonic field.

    sorted_acc = sorted(accum)
    river_cut = sorted_acc[int(len(sorted_acc) * 0.975)]
    river_color = palette["river"]
    river_paths = _river_paths(receivers, accum, flow_surface, sea, gw, gh, limit=30)

    # Output-resolution terrain color.  Height/moisture/slope are sampled from
    # the simulation, but hue, snowline, rock and hillshade are evaluated on
    # every 2048 output pixel.  The palette is a small LUT so this stays within
    # the web budget.
    elev_lut = _build_elevation_lut(palette)
    ocean_lut: list[tuple[int, int, int]] = []
    for ob in range(33):
        d = ob / 2.0
        shade_col = _mix(palette["shallow"], palette["mid"], _smoothstep(0.0, 1.7, d))
        shade_col = _mix(shade_col, palette["deep"], _smoothstep(1.7, 12.0, d))
        if d < 0.9:
            shade_col = _mix(shade_col, palette["foam"], 0.055 * (1.0 - _smoothstep(0.0, 0.9, d)))
        ocean_lut.append(shade_col)

    return TerrainFields(
        seed=int(seed),
        style=style,
        width=width,
        height=height,
        gw=gw,
        gh=gh,
        cell_count=cell_count,
        ui=ui,
        sea=sea,
        relief=relief,
        surface=surface,
        uplift=uplift_field,
        to_ocean=to_ocean,
        to_land=to_land,
        moisture=moisture,
        texture=texture,
        forest=forest_field,
        shade=shade,
        slope=slope,
        receivers=receivers,
        accum=accum,
        flow_surface=flow_surface,
        river_cut=river_cut,
        river_color=river_color,
        river_paths=river_paths,
        palette=palette,
        elev_lut=elev_lut,
        ocean_lut=ocean_lut,
        rng=rng,
    )


def generate_terrain(
    seed: int = 1,
    *,
    width: int = 2048,
    height: int = 1280,
    style: str = "atlas",
    bake_labels: bool = True,
    label_count: int = 7,
    fields: "TerrainFields | None" = None,
) -> TerrainResult:
    """Render a deterministic local terrain map as PNG bytes.

    Args:
        seed: Deterministic world seed.
        width/height: Output pixels.  The internal simulation grid is derived
            from these and capped for a bounded CPU budget.
        style: One of ``atlas``, ``parchment``, ``topographic``.
        bake_labels: Draw the selected place labels into the PNG.  The UI sets
            this to false and returns the labels as data for a vector overlay.
    """
    started = time.perf_counter()
    if fields is None:
        fields = build_fields(seed=seed, width=width, height=height, style=style)
    detail_texture = _detail_texture_cached()

    seed = fields.seed
    style = fields.style
    width, height = fields.width, fields.height
    gw, gh, cell_count, ui = fields.gw, fields.gh, fields.cell_count, fields.ui
    sea, relief = fields.sea, fields.relief
    surface, uplift_field = fields.surface, fields.uplift
    to_ocean, to_land = fields.to_ocean, fields.to_land
    moisture, texture, forest_field = fields.moisture, fields.texture, fields.forest
    shade, slope = fields.shade, fields.slope
    receivers, accum, flow_surface = fields.receivers, fields.accum, fields.flow_surface
    river_cut, river_color, river_paths = fields.river_cut, fields.river_color, fields.river_paths
    palette, elev_lut, ocean_lut = fields.palette, fields.elev_lut, fields.ocean_lut
    rng = fields.rng

    rgb = bytearray(width * height * 3)
    x0s: list[int] = []
    x1s: list[int] = []
    xfs: list[float] = []
    for ox in range(width):
        gx = (ox + 0.5) / width * gw - 0.5
        ix = int(math.floor(gx))
        fx = gx - ix
        x0s.append(max(0, min(gw - 1, ix)))
        x1s.append(max(0, min(gw - 1, ix + 1)))
        xfs.append(fx)

    detail_off_x = (seed * 37) % _DETAIL_WIDTH
    detail_off_y = (seed * 17) % _DETAIL_HEIGHT

    for oy in range(height):
        gy = (oy + 0.5) / height * gh - 0.5
        iy = int(math.floor(gy))
        fy = gy - iy
        iy0 = max(0, min(gh - 1, iy))
        iy1 = max(0, min(gh - 1, iy + 1))
        r0 = iy0 * gw
        r1 = iy1 * gw
        row_base = oy * width * 3
        for ox in range(width):
            ix0 = x0s[ox]
            ix1 = x1s[ox]
            fx = xfs[ox]
            i = r0 + ix0
            h = _bilinear(surface, r0, ix0, ix1, r1, fx, fy)
            sh = _bilinear(shade, r0, ix0, ix1, r1, fx, fy)
            d_land = to_land[i]
            t = _clamp((h - sea) / relief, 0.0, 1.0)
            if h <= sea:
                color = ocean_lut[min(32, int(d_land * 2))]
                factor = 0.90 + sh * 0.08
            else:
                uplift = uplift_field[i]
                mountain = _clamp((uplift - 0.04) * 5.0, 0.0, 1.0)
                dx_i = (ox + detail_off_x) % _DETAIL_WIDTH
                dy_i = (oy + detail_off_y) % _DETAIL_HEIGHT
                di = dy_i * _DETAIL_WIDTH + dx_i
                dv = detail_texture[di]
                dvx = detail_texture[dy_i * _DETAIL_WIDTH + (dx_i + 1) % _DETAIL_WIDTH]
                dvy = detail_texture[((dy_i + 1) % _DETAIL_HEIGHT) * _DETAIL_WIDTH + dx_i]
                ridge = (dv - 127.5) / 127.5
                ridge_dx = (dvx - dv) / 127.5
                ridge_dy = (dvy - dv) / 127.5
                t = _clamp(t + ridge * (0.020 + 0.052 * mountain), 0.0, 1.0)
                # A local normal from the ridge texture gives the mountain
                # surface directional highlight/shadow instead of a flat decal.
                sh = sh + ridge * (0.050 + 0.07 * mountain)
                sh = sh - (ridge_dx * 0.58 + ridge_dy * 0.38) * (0.16 + 0.55 * mountain)
                color = elev_lut[min(255, int(t * 256.0))]
                mo = moisture[i]
                if mo > 0.48 and t < 0.72:
                    forest_tint = _smoothstep(0.48, 0.72, mo) * 0.38
                    color = _mix(color, palette["forest"], forest_tint)
                factor = _clamp(0.74 + (sh - 0.78) * 1.85, 0.60, 1.28)
            # Coast blend and surf line, evaluated with the output-resolution
            # interpolated height.
            land_t = _smoothstep(sea - 0.0022, sea + 0.0022, h)
            if h > sea and d_land < 1.5:
                ocean = ocean_lut[min(32, int(d_land * 2))]
                color = _mix(ocean, color, land_t)
            r_out = color[0] * factor
            g_out = color[1] * factor
            b_out = color[2] * factor
            if h > sea:
                r_out = min(255, r_out * 1.02)
                b_out = max(0, b_out * 0.98)
            j = row_base + ox * 3
            rgb[j] = max(0, min(255, int(r_out)))
            rgb[j + 1] = max(0, min(255, int(g_out)))
            rgb[j + 2] = max(0, min(255, int(b_out)))

    # Output-resolution detail symbols.  These are intentionally small, but
    # they break up the broad LUT bands the same way tree/rock stipple does in
    # an illustrated atlas.
    if style == "atlas":
        tree_dark = (32, 76, 43)
        tree_light = (91, 137, 63)
        rock_dark = (69, 65, 57)
        rock_light = (176, 165, 142)
        for y in range(1, gh - 1):
            row = y * gw
            for x in range(1, gw - 1):
                i = row + x
                if surface[i] <= sea:
                    continue
                hsh = (x * 73856093 ^ y * 19349663) & 0xFFFFFFFF
                t = (surface[i] - sea) / relief
                if forest_field[i] > 0.58 and slope[i] < 0.40 and t < 0.70:
                    if hsh % 2 == 0:
                        px = int((x + 0.5 + ((hsh >> 7) % 7 - 3) * 0.055) / gw * width)
                        py = int((y + 0.5 + ((hsh >> 11) % 7 - 3) * 0.055) / gh * height)
                        _draw_pixel(rgb, width, height, px, py - 1, tree_dark)
                        _draw_pixel(rgb, width, height, px - 1, py, tree_dark)
                        _draw_pixel(rgb, width, height, px + 1, py, tree_dark)
                        _draw_pixel(rgb, width, height, px, py + 1, tree_dark)
                        _draw_pixel(rgb, width, height, px - 1, py - 1, tree_light)
                elif t > 0.62 and slope[i] > 0.34 and hsh % 5 == 0:
                    px = int((x + 0.5) / gw * width)
                    py = int((y + 0.5) / gh * height)
                    _line(rgb, width, height, px - 2, py + 1, px + 2, py - 1, rock_dark, 1)
                    _line(rgb, width, height, px - 1, py - 1, px + 1, py + 2, rock_light, 1)

    # Sparse deep-water strokes.  Keeps the open ocean from reading as a flat
    # vector fill at 2048 without introducing a full-screen noise pass.
    if style == "atlas":
        wave_color = (14, 43, 66)
        for y in range(2, gh - 2):
            row = y * gw
            for x in range(2, gw - 2):
                i = row + x
                if surface[i] > sea or to_land[i] < 2.0:
                    continue
                hsh = (x * 83492791 ^ y * 2971215073) & 0xFFFFFFFF
                if hsh % 19 != 0:
                    continue
                px = int((x + 0.5) / gw * width)
                py = int((y + 0.5) / gh * height)
                _line(rgb, width, height, px - 2, py, px + 2, py, wave_color, 1)

    # Curved tributaries.  The main stems below get a wider stroke; this pass
    # fills the dendritic network without exposing the D8 grid.
    for bx, by, bjx, bjy, bend_code in _river_branches(
        receivers, accum, flow_surface, sea, gw, gh, river_cut * 1.15
    ):
        x0 = (bx + 0.5) / gw * width
        y0 = (by + 0.5) / gh * height
        x1 = (bjx + 0.5) / gw * width
        y1 = (bjy + 0.5) / gh * height
        dx = x1 - x0
        dy = y1 - y0
        length = math.hypot(dx, dy) or 1.0
        bend = (bend_code / 9.0) * length * 0.28
        cx = (x0 + x1) * 0.5 - dy / length * bend
        cy = (y0 + y1) * 0.5 + dx / length * bend
        prev_x = int(x0)
        prev_y = int(y0)
        for step in (0.33, 0.66, 1.0):
            inv = 1.0 - step
            px = int(inv * inv * x0 + 2.0 * inv * step * cx + step * step * x1)
            py = int(inv * inv * y0 + 2.0 * inv * step * cy + step * step * y1)
            _line(rgb, width, height, prev_x, prev_y, px, py, river_color, 1)
            prev_x, prev_y = px, py

    # Rivers: trace main stems from the sea inland, then smooth the D8 path
    # with Chaikin so it reads as a river rather than a grid edge.
    for path in river_paths:
        points = [
            ((i % gw + 0.5) / gw * width, (i // gw + 0.5) / gh * height)
            for i in path
        ]
        points = _chaikin(points, 2)
        mouth_acc = accum[path[-1]]
        base_width = 4 + int(_clamp(math.log10(max(1.0, mouth_acc / max(1.0, river_cut))) * 1.5, 0.0, 3.0))
        for k, (p0, p1) in enumerate(zip(points, points[1:])):
            frac = k / max(1, len(points) - 1)
            width_now = max(2, int(base_width * (0.55 + 0.45 * frac)))
            _line(rgb, width, height, int(p0[0]), int(p0[1]), int(p1[0]), int(p1[1]), river_color, width_now)

    # The 3D land mask must come from the unlabelled terrain.  Sampling the
    # final image would turn the scale bar / cartouche into islands.
    clean_rgb = bytearray(rgb)

    # Labels and cartouche.  Labels are intentionally Latin to avoid shipping a
    # CJK font; the API returns the same data for a vector overlay.
    labels = _choose_labels(rng, surface, sea, accum, gw, gh, limit=max(0, min(12, int(label_count))))
    ink = palette["ink"]
    paper = palette["paper"]
    panel = palette["panel"]
    label_scale = max(2, int(round(2 * ui)))
    for label in (labels if bake_labels else ()):
        cx = int(label.x * width)
        cy = int(label.y * height)
        _blend_pixel(rgb, width, height, cx, cy, panel, 0.72)
        dot_r = max(3, int(round(3 * ui)))
        for oy in range(-dot_r, dot_r + 1):
            for ox in range(-dot_r, dot_r + 1):
                if ox * ox + oy * oy <= dot_r * dot_r + 1:
                    _draw_pixel(rgb, width, height, cx + ox, cy + oy, paper)
        _draw_pixel(rgb, width, height, cx, cy, ink)
        label_gap = int(10 * ui)
        lx = min(width - _text_width(label.name, label_scale) - 10, cx + label_gap)
        ly = max(10, cy - int(12 * ui))
        _text(rgb, width, height, lx, ly, label.name, paper, scale=label_scale, shadow=panel)

    # Cartouche + scale bar.  Keep both inside the central safe area because
    # the map page crops wide images on a tall studio canvas.
    cartouche_x = int(width * 0.27)
    cartouche_y = int(24 * ui)
    cartouche_w = int(310 * ui)
    cartouche_h = int(52 * ui)
    _blend_pixel(rgb, width, height, cartouche_x, cartouche_y, panel, 0.84)
    for yy in range(cartouche_y, cartouche_y + cartouche_h):
        for xx in range(cartouche_x, cartouche_x + cartouche_w):
            _blend_pixel(rgb, width, height, xx, yy, panel, 0.82)
    cart_scale = max(2, int(round(2 * ui)))
    _text(rgb, width, height, cartouche_x + int(14 * ui), cartouche_y + int(10 * ui), "TERRAIN WEB", paper, scale=cart_scale, shadow=ink)
    _text(rgb, width, height, cartouche_x + int(14 * ui), cartouche_y + int(28 * ui), f"SEED {seed % 100000:05d}  /  {style.upper()}", paper, scale=max(1, int(round(ui))), shadow=ink)

    scale_x = int(width * 0.27)
    scale_y = height - int(34 * ui)
    scale_w = int(170 * ui)
    scale_tick = int(5 * ui)
    _line(rgb, width, height, scale_x, scale_y, scale_x + scale_w, scale_y, paper, 1)
    _line(rgb, width, height, scale_x, scale_y - scale_tick, scale_x, scale_y + scale_tick, paper, 1)
    _line(rgb, width, height, scale_x + scale_w, scale_y - scale_tick, scale_x + scale_w, scale_y + scale_tick, paper, 1)
    _text(rgb, width, height, scale_x, scale_y + int(9 * ui), "500 KM", paper, scale=max(1, int(round(ui))), shadow=panel)
    if style == "parchment":
        _compass(rgb, width, height, paper, ink, ui)

    png = _png(width, height, rgb)

    # A compact heightmap for the real-time Three.js preview.  Water is 0;
    # land is normalised to the same relief scale as the 2D palette.
    hm_w, hm_h = 512, 320
    hm_levels = bytearray(hm_w * hm_h)
    land_heights = sorted(surface[i] - sea for i in range(cell_count) if surface[i] > sea)
    land_lo = land_heights[int(len(land_heights) * 0.03)] if land_heights else 0.0
    land_hi = land_heights[int(len(land_heights) * 0.99)] if land_heights else relief
    land_span = max(1e-6, land_hi - land_lo)
    for hy in range(hm_h):
        gy = min(gh - 1, int((hy + 0.5) / hm_h * gh))
        row = gy * gw
        for hx in range(hm_w):
            gx = min(gw - 1, int((hx + 0.5) / hm_w * gw))
            h_delta = surface[row + gx] - sea
            if h_delta <= 0.002:
                v = 0.0
            else:
                # Normalise land independently of the ocean so the broad
                # lowland plain is visible in 3D, not just mountain spines.
                t = _clamp((h_delta - land_lo) / land_span, 0.0, 1.0)
                # Keep a continuous land surface; no flat pedestal, otherwise
                # the coast becomes a vertical wall in the 3D mesh.
                v = 0.025 + 0.975 * (t ** 0.70)
            hm_levels[hy * hm_w + hx] = int(_clamp(v, 0.0, 1.0) * 255)
    # Two small box blurs remove the one-cell cliffs that turn into vertical
    # curtains in a shaded 3D mesh.
    for _ in range(2):
        smoothed = bytearray(hm_levels)
        for hy in range(1, hm_h - 1):
            row = hy * hm_w
            for hx in range(1, hm_w - 1):
                i = row + hx
                smoothed[i] = (
                    hm_levels[i] * 4
                    + hm_levels[i - 1] + hm_levels[i + 1]
                    + hm_levels[i - hm_w] + hm_levels[i + hm_w]
                ) // 8
        hm_levels = smoothed
    hm_rgb = bytearray(hm_w * hm_h * 3)
    for i, level in enumerate(hm_levels):
        j = i * 3
        hm_rgb[j] = level
        # Green channel is a land mask.  The Three.js mesh uses it to keep a
        # visible lowland shelf even where the elevation quantises to zero.
        hm_rgb[j + 1] = 255 if level > 0 else 0
        hm_rgb[j + 2] = 0
    heightmap = _png(hm_w, hm_h, hm_rgb)

    # Direct signed height grid for Three.js.  Water is 0; land starts at a
    # small positive shelf, so the mesh does not need a land-mask channel or
    # PNG decoding in the browser.
    mesh_w, mesh_h = 512, 320
    mesh_levels = bytearray(mesh_w * mesh_h)
    for my in range(mesh_h):
        gy = min(gh - 1, int((my + 0.5) / mesh_h * gh))
        row = gy * gw
        for mx in range(mesh_w):
            gx = min(gw - 1, int((mx + 0.5) / mesh_w * gw))
            # Classify land from the rendered colour, not only from the
            # heightfield: the lowland plain is close to sea level and often
            # quantises to zero, which left holes in the 3D mesh.
            px = min(width - 1, int((mx + 0.5) / mesh_w * width))
            py = min(height - 1, int((my + 0.5) / mesh_h * height))
            ci = (py * width + px) * 3
            rr, gg, bb = clean_rgb[ci], clean_rgb[ci + 1], clean_rgb[ci + 2]
            is_water = bb > rr + 18 and bb > gg + 8
            if is_water:
                level = 0
            else:
                h_delta = max(0.0, surface[row + gx] - sea)
                t = _clamp((h_delta - land_lo) / land_span, 0.0, 1.0)
                # Lowland detail: the heightfield itself is almost flat away
                # from the mountain belts.  Mix in the same fine texture used
                # by the 2D pass so the 3D plain has gentle relief.
                detail = (texture[row + gx] - 0.5) * 0.045
                coast = _clamp(to_ocean[row + gx] / 3.0, 0.0, 1.0)
                coast = coast * coast * (3.0 - 2.0 * coast)
                h = (0.018 + 0.982 * (t ** 0.72)) + detail
                h = 0.004 + (h - 0.004) * coast
                level = int(_clamp(h, 0.0, 1.0) * 255)
            mesh_levels[my * mesh_w + mx] = level

    # Thermal erosion: material above the talus angle is moved downhill.
    # This is what turns isolated height-map spikes into readable slopes.
    heights = [float(value) for value in mesh_levels]
    talus = 5.0
    for _ in range(4):
        for my in range(1, mesh_h - 1):
            row = my * mesh_w
            for mx in range(1, mesh_w - 1):
                i = row + mx
                h = heights[i]
                for n in (i - 1, i + 1, i - mesh_w, i + mesh_w):
                    diff = h - heights[n]
                    if diff > talus:
                        move = (diff - talus) * 0.30
                        heights[i] -= move
                        h -= move
                        heights[n] += move
    mesh_levels = bytearray(max(0, min(255, int(round(h)))) for h in heights)

    # Final smoothing: at 512 cells a few passes are not enough to remove the
    # vertical curtain look on steep slopes.
    for _ in range(4):
        smoothed = bytearray(mesh_levels)
        for my in range(1, mesh_h - 1):
            row = my * mesh_w
            for mx in range(1, mesh_w - 1):
                i = row + mx
                smoothed[i] = (
                    mesh_levels[i] * 4
                    + mesh_levels[i - 1] + mesh_levels[i + 1]
                    + mesh_levels[i - mesh_w] + mesh_levels[i + mesh_w]
                ) // 8
        mesh_levels = smoothed
    mesh = bytes(mesh_levels)

    # Satellite-like albedo for the 3D surface: a clean, label-free 1024 copy
    # of the rendered terrain.
    tex_w, tex_h = 1024, 640
    step_x = width / tex_w
    step_y = height / tex_h
    tex_rgb = bytearray(tex_w * tex_h * 3)
    for ty in range(tex_h):
        sy = min(height - 1, int(ty * step_y))
        src_row = sy * width * 3
        dst_row = ty * tex_w * 3
        for tx in range(tex_w):
            sx = min(width - 1, int(tx * step_x))
            si = src_row + sx * 3
            di = dst_row + tx * 3
            tex_rgb[di] = clean_rgb[si]
            tex_rgb[di + 1] = clean_rgb[si + 1]
            tex_rgb[di + 2] = clean_rgb[si + 2]
    texture = _png(tex_w, tex_h, tex_rgb)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return TerrainResult(
        png=png,
        width=width,
        height=height,
        seed=int(seed),
        style=style,
        labels=labels,
        elapsed_ms=elapsed_ms,
        heightmap=heightmap,
        heightmap_width=hm_w,
        heightmap_height=hm_h,
        sea_level=0.0,
        mesh=mesh,
        mesh_width=mesh_w,
        mesh_height=mesh_h,
        texture=texture,
        texture_width=tex_w,
        texture_height=tex_h,
        fields=fields,
    )
