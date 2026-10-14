# -*- coding: utf-8 -*-
"""把软盘模型（SM_Computer_NN_01e.blend）烘焙成登录页用的静态资源。

    "/Applications/Blender.app/Contents/MacOS/Blender" -b <模型.blend> \
        -P tools/bake_floppy_geometry.py

产出（直接写进 static/vendor/three/）：
    floppy_geometry.js          顶点/法线/UV/索引，base64 内联（约 58KB）
    floppy-basecolor.png        albedo，2048² → 256²
    floppy-metalrough.png       glTF 打包的金属度/粗糙度（G=roughness, B=metalness）
    floppy-normal.png           法线

跑完记得把 floppy_geometry.js 里的注释看一遍——里面写了这个模型是干什么用的。
"""

from __future__ import annotations

import base64
import os
import pathlib
import struct
import subprocess
import sys

import bpy  # type: ignore  # 只在 Blender 的 Python 里存在
from mathutils import Vector  # type: ignore

SRC_TEX = os.environ.get("FLOPPY_TEX_DIR", "")     # 贴图目录（默认取 .blend 同级的 textures/）
OUT_DIR = os.environ.get(
    "FLOPPY_OUT_DIR",
    str(pathlib.Path(__file__).resolve().parent.parent / "static" / "vendor" / "three"),
)
TEX_SIZE = int(os.environ.get("FLOPPY_TEX_SIZE", "256"))
# 盘体加厚倍数。源模型是 0.002 厚的薄片，摆成环带时薄得看不见侧面；
# 4 倍之后侧壁才立得住（登录页上就是靠这圈侧壁读成「一叠盘」）。
# **厚度轴是局部 Z**：模型尺寸 x 0.1372 / y 0.1368 / z 0.0020，
# 也就是说它是一块躺在 XY 平面上、朝 +Z 立起来的方块（别按 Y 猜）。
THICKNESS = float(os.environ.get("FLOPPY_THICKNESS", "4"))


def main() -> int:
    ob = bpy.data.objects["SM_Computer_NN_01e"]
    me = ob.data

    # 1) 居中枢轴：直接从网格自身的包围盒求中心（用世界坐标会被父级变换带偏）
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    cx, cy, cz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2

    me.calc_loop_triangles()
    uv = me.uv_layers.active.data          # 贴图对应的是第一层 UVMap

    verts: list[float] = []
    norms: list[float] = []
    uvs: list[float] = []
    idx: list[int] = []
    n_vert = 0                              # 已写入的**顶点数**（不是浮点数个数！）
    for tri in me.loop_triangles:
        base = n_vert
        for li in tri.loops:
            v = me.vertices[me.loops[li].vertex_index]
            verts += [v.co.x - cx, v.co.y - cy, v.co.z - cz]
            norms += [v.normal.x, v.normal.y, v.normal.z]
            uvs += [uv[li].uv[0], uv[li].uv[1]]
            n_vert += 1
        idx += [base, base + 1, base + 2]

    # 1b) 加厚：只放大局部 Z（厚度轴），放在单位化之前，x/y 的归一化不受影响。
    for i in range(2, len(verts), 3):
        verts[i] *= THICKNESS
    # 法线的 Z 分量跟着压回去，否则加厚之后光照还是按薄片算的
    for i in range(2, len(norms), 3):
        norms[i] /= THICKNESS

    # 2) 单位化：最长边缩到 1.0（运行时再乘目标尺寸）
    gx, gy, gz = verts[0::3], verts[1::3], verts[2::3]
    dx, dy, dz = max(gx) - min(gx), max(gy) - min(gy), max(gz) - min(gz)
    scale = 1.0 / max(dx, dy, dz)
    verts = [v * scale for v in verts]
    # UV 直接用 Blender 的值：three 的 TextureLoader 默认 flipY 已经处理了 V 方向，
    # 这里再翻一次会把贴图对错位。

    def b64(values, fmt: str, count: int) -> str:
        return base64.b64encode(struct.pack("<%d%s" % (count, fmt), *values)).decode()

    body = f'''/* 软盘几何：由 SM_Computer_NN_01e.blend 烘焙而来（{len(me.loop_triangles)} 三角面，
   {n_vert} 顶点）。源模型是 3.5" 软盘（黑色方形外壳 + 金属中孔 + 白色滑盖 + 标签区）。
   顶点/法线/UV/索引直接内联，省掉 GLTFLoader 那一整套传递依赖。
   贴图：floppy-basecolor.png / floppy-metalrough.png / floppy-normal.png。
   重新生成：tools/bake_floppy_geometry.py（需要 Blender）。 */
export const FLOPPY = {{
  position: "{b64(verts, "f", len(verts))}",
  normal:   "{b64(norms, "f", len(norms))}",
  uv:       "{b64(uvs, "f", len(uvs))}",
  index:    "{base64.b64encode(struct.pack("<%dH" % len(idx), *idx)).decode()}",
  scale:    {scale:.6f},
  size:     [{dx:.6f}, {dy:.6f}, {dz:.6f}]
}};
'''
    out = pathlib.Path(OUT_DIR)
    out.mkdir(parents=True, exist_ok=True)
    (out / "floppy_geometry.js").write_text(body, encoding="utf-8")
    print(f"[bake] floppy_geometry.js  {len(body)} bytes  tris={len(me.loop_triangles)} verts={n_vert}")

    # 3) 贴图降采样。用 Blender 自己的图像 API：macOS 的 sips 转 webp/png 在这个
    #    场景下会「报告成功但不落盘」，别用它。
    tex_dir = SRC_TEX or str(pathlib.Path(bpy.data.filepath).parent / "textures")
    for src_name, dst_name in (
        ("MI_Computer_NN_01a_BaseColor.png", "floppy-basecolor.png"),
        ("MI_Computer_NN_01a_MetallicRoughness.png", "floppy-metalrough.png"),
        ("MI_Computer_NN_01a_Normal.png", "floppy-normal.png"),
    ):
        src_path = os.path.join(tex_dir, src_name)
        img = bpy.data.images.load(src_path)
        img.pixels[0]                       # 触发真正解码（否则 save 会报「未包含图像数据」）
        img.scale(TEX_SIZE, TEX_SIZE)
        img.file_format = "PNG"
        target = str(out / dst_name)
        img.filepath_raw = target
        img.save()
        print(f"[bake] {dst_name}  {os.path.getsize(target)} bytes  {TEX_SIZE}x{TEX_SIZE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
