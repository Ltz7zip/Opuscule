# -*- coding: utf-8 -*-
"""看一眼截图里到底画了什么（不依赖任何图像库）。

用 macOS 自带的 sips 把 PNG 转成 BMP（未压缩、24 位），然后按区域统计平均色。
探针里需要"这一块是不是全黑"这种判断时用它，比装 Pillow 轻。

    python3 tools/shot_stats.py shot.png [x0,y0,x1,y1] [步长]
"""

from __future__ import annotations

import struct
import subprocess
import sys
import tempfile
from collections import Counter


def load(path: str):
    bmp = tempfile.mktemp(suffix=".bmp")
    subprocess.run(["sips", "-s", "format", "bmp", "--out", bmp, path],
                   check=True, capture_output=True)
    raw = open(bmp, "rb").read()
    off = struct.unpack("<I", raw[10:14])[0]
    w = struct.unpack("<i", raw[18:22])[0]
    h = struct.unpack("<i", raw[22:26])[0]
    bpp = struct.unpack("<H", raw[28:30])[0]
    if bpp != 24:
        raise SystemExit(f"只处理 24 位 BMP，这张是 {bpp} 位")
    topdown = h < 0
    h = abs(h)
    stride = (w * 3 + 3) // 4 * 4
    return raw, off, w, h, stride, topdown


def pixel(raw, off, w, stride, topdown, h, x, y):
    row = y if topdown else (h - 1 - y)
    o = off + row * stride + x * 3
    return raw[o + 2], raw[o + 1], raw[o]          # BMP 是 BGR


def main() -> int:
    path = sys.argv[1]
    step = 4
    box = None
    if len(sys.argv) > 2:
        box = [int(v) for v in sys.argv[2].split(",")]
    if len(sys.argv) > 3:
        step = int(sys.argv[3])
    raw, off, w, h, stride, topdown = load(path)
    x0, y0, x1, y1 = box or (0, 0, w, h)
    cnt = Counter()
    for y in range(y0, min(y1, h), step):
        for x in range(x0, min(x1, w), step):
            cnt[pixel(raw, off, w, stride, topdown, h, x, y)] += 1
    total = sum(cnt.values())
    black = sum(n for c, n in cnt.items() if max(c) < 20)
    print(f"{path}  {w}×{h}  区域 ({x0},{y0})-({x1},{y1})  {total} 个采样")
    print(f"  近黑 {black / total * 100:.1f}%")
    for c, n in cnt.most_common(6):
        print(f"  {c}  {n * 100 / total:.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
