"""Generate terrain on the operator's machine and upload it.

The server only stores the result, so a 2 vCPU box never runs the 12 s
simulation.  Standard library only: urllib + the local generator.
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

from django.core.management.base import BaseCommand, CommandError

from apps.maps.terrain_web import STYLE_NAMES, generate_terrain


def _opener() -> urllib.request.OpenerDirector:
    """Ignore the system proxy: this talks to one known host over the public net.

    macOS routes urllib through the OS proxy settings, which breaks certificate
    verification for local tooling; a direct connection does not.
    """
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes]]) -> tuple[bytes, str]:
    boundary = f"----terrain{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    for name, (filename, payload) in files.items():
        ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode()
        )
        chunks.append(payload)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class Command(BaseCommand):
    help = "本地生成地形并上传到服务器（服务器不跑生成）"

    def add_arguments(self, parser):
        parser.add_argument("--server", required=True, help="例如 http://127.0.0.1:8000")
        parser.add_argument("--token", default=os.environ.get("TERRAIN_TOKEN"), help="wtk_ 令牌，或设 TERRAIN_TOKEN")
        parser.add_argument("--world", required=True, help="世界 slug")
        parser.add_argument("--seed", type=int)
        parser.add_argument("--style", choices=STYLE_NAMES)
        parser.add_argument("--resolution", help="例如 2048x1280")
        parser.add_argument("--label-count", type=int, default=0,
                            help="烘焙到图上的虚构地名数量（默认 0，避免与真实图钉混淆）")
        parser.add_argument("--force", action="store_true", help="忽略 if_version 冲突")

    def handle(self, *args, **options):
        token = options["token"]
        if not token:
            raise CommandError("需要 --token 或环境变量 TERRAIN_TOKEN")
        server = options["server"].rstrip("/")
        base = f"{server}/api/worlds/{options['world']}/map/terrain/"

        current = self._get(base, token)
        seed = options["seed"] if options["seed"] is not None else current.get("seed")
        style = options["style"] if options["style"] else current.get("style")
        width, height = self._resolution(options["resolution"], current)
        if seed is None or style is None:
            raise CommandError("服务器还没有地形配方，请显式指定 --seed 与 --style")
        self.stdout.write(f"生成 {style} {width}x{height} seed={seed} …")

        started = time.perf_counter()
        result = generate_terrain(
            seed=int(seed),
            width=width,
            height=height,
            style=style,
            bake_labels=False,
            label_count=options["label_count"],
        )
        elapsed = time.perf_counter() - started
        self.stdout.write(self.style.SUCCESS(f"本地生成完成：{elapsed:.1f}s"))

        fields = {
            "seed": str(seed),
            "style": style,
            "width": str(width),
            "height": str(height),
        }
        if not options["force"] and current.get("version"):
            fields["if_version"] = current["version"]
        fields["meta"] = json.dumps(
            {
                "labels": [
                    {"name": label.name, "x": round(label.x, 5), "y": round(label.y, 5), "kind": label.kind}
                    for label in result.labels
                ],
                "bake_labels": False,
                "sea_level": result.sea_level,
                "elapsed_ms": int(elapsed * 1000),
                "mesh_width": result.mesh_width,
                "mesh_height": result.mesh_height,
                "texture_width": result.texture_width,
                "texture_height": result.texture_height,
                "heightmap_width": result.heightmap_width,
                "heightmap_height": result.heightmap_height,
            }
        )
        files = {"background": ("terrain.png", result.png)}
        if result.mesh:
            files["mesh"] = ("mesh.bin", result.mesh)
        if result.texture:
            files["texture"] = ("texture.png", result.texture)
        if result.heightmap:
            files["heightmap"] = ("heightmap.bin", result.heightmap)

        body, content_type = _multipart(fields, files)
        request = urllib.request.Request(base, data=body, method="PUT")
        request.add_header("Authorization", f"Bearer {token}")
        request.add_header("Content-Type", content_type)
        try:
            with _opener().open(request, timeout=180) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise CommandError(f"上传失败 {exc.code}：{detail[:300]}") from exc
        self.stdout.write(self.style.SUCCESS(f"上传完成：{payload.get('background_url')}"))

    def _get(self, url: str, token: str) -> dict:
        request = urllib.request.Request(url, method="GET")
        request.add_header("Authorization", f"Bearer {token}")
        try:
            with _opener().open(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise CommandError(f"读取配方失败 {exc.code}：{detail[:300]}") from exc

    def _resolution(self, raw, current) -> tuple[int, int]:
        if raw:
            try:
                width, height = (int(part) for part in raw.lower().split("x"))
            except ValueError as exc:
                raise CommandError("--resolution 需要形如 2048x1280") from exc
            return width, height
        width = current.get("width") or 2048
        height = current.get("height") or 1280
        return int(width), int(height)
