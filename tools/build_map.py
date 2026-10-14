#!/usr/bin/env python3
"""把 Opuscule 地图前端构建到 ``static/map/vendor``，并生成 Django 模板。

上游源码在 ``third_party/fantasy-map-generator``（TypeScript + Vite）。
本脚本做四件事：

1. 装依赖（首次）；
2. ``tsc`` 类型检查；
3. ``vite`` 打包到 ``static/map/vendor``（产物入库，运行时不需要 Node）；
4. 把 ``dist/index.html`` 转成 Django 模板 ``templates/map/app.html``
   —— 去 GA、相对资源改绝对、注入宿主标记与页面上下文。

只有改了 ``third_party`` 里的 TS/HTML 才需要重跑：

    .venv/bin/python tools/build_map.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "third_party" / "fantasy-map-generator"
OUT = ROOT / "static" / "map" / "vendor"
TPL = ROOT / "templates" / "map" / "app.html"
#: 与 Django STATIC_URL 下的挂载点一致；vite 用它重写 chunk 的绝对地址
BASE = "/static/map/vendor/"

#: 相对资源地址 → 绝对（vite 不会改写 public/ 里的相对引用，Django 页面又在 /map/2d）
_REL_ASSET = re.compile(r'\b(src|href)="(?!https?:|//|/|#|data:|mailto:)([^"]+)"')
#: 上游自带的统计与推广，宿主里一律去掉
_GA = re.compile(r'<script async src="https://www\.googletagmanager\.com[^>]*></script>\s*', re.S)
_GA_INLINE = re.compile(r"<script>\s*window\.dataLayer[\s\S]*?</script>\s*", re.S)
_DROP_LINK = re.compile(r'<link rel="(?:manifest|canonical)"[^>]*>\s*')
_DROP_META = re.compile(r'<meta (?:property|name)="(?:og:|twitter:|application-name|author|description)[^"]*"[^>]*>\s*')

#: 上游的身份信息换成宿主的：浏览器标签、启动屏的标题与加载文案
_TITLE = re.compile(r"<title>[^<]*</title>")
_LOADING_BRAND = re.compile(r'<div id="titleName">[^<]*</div>\s*<div id="title">[^<]*</div>')
_LOADING_TEXT = re.compile(r'(<p id="loading-text">)[^<]*(<span>)')
#: 顶栏在 body 开头（templates/map/shell.html，服务端渲染，embed 时自己让位）
_SHELL_INCLUDE = '{% include "map/shell.html" %}\n'
_BODY_OPEN = re.compile(r"<body[^>]*>")


def run(cmd: list[str], env: dict[str, str] | None = None) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=UPSTREAM, check=True, env=env)


def build_assets() -> None:
    if not (UPSTREAM / "node_modules").is_dir():
        run(["npm", "ci", "--no-audit", "--no-fund"],
            env={**os.environ, "ELECTRON_SKIP_BINARY_DOWNLOAD": "1"})
    run(["npx", "tsc"])  # noEmit：只做类型检查
    run(["npx", "vite", "build"], env={**os.environ, "OPUSCULE_BASE": BASE, "OPUSCULE_OUT": str(OUT)})


def render_template() -> None:
    """把构建出的 index.html 变成 Django 模板。"""
    html = (OUT / "index.html").read_text(encoding="utf-8")

    html = _GA.sub("", html)
    html = _GA_INLINE.sub("", html)
    html = _DROP_LINK.sub("", html)
    html = _DROP_META.sub("", html)
    html = _REL_ASSET.sub(lambda m: f'{m.group(1)}="{BASE}{m.group(2)}"', html)

    # 身份换成宿主的：标签页标题、启动屏标题与加载文案（都由 Django 渲染）
    html = _TITLE.sub(
        "<title>{% if shell.doc_name %}{{ shell.doc_name }} · {% endif %}地图 · {{ shell.world_name }}</title>",
        html,
        count=1,
    )
    html = _LOADING_BRAND.sub(
        '<div id="titleName">{{ shell.world_name }}</div>\n        '
        '<div id="title">{{ shell.doc_name|default:"地图" }}</div>',
        html,
        count=1,
    )
    html = _LOADING_TEXT.sub(r"\1载入中\2", html, count=1)

    # 顶栏：body 的第一个孩子，服务端渲染（embed 时它自己不出现在 markup 里）
    html = _BODY_OPEN.sub(lambda m: f"{m.group(0)}\n{_SHELL_INCLUDE}", html, count=1)

    # 宿主标记 + 页面上下文（mapdoc.py 渲染时填 map_ctx_json）。
    # __OPUSCULE_ASSET_BASE__ 给运行时用：three/jszip/dropbox 这些库是运行时才插 <script> 的，
    # 相对地址会被解析成 /map/libs/…，得由运行时补上静态目录前缀。
    ctx = (
        "<script>window.__OPUSCULE_HOSTED__ = true;</script>\n"
        f'<script>window.__OPUSCULE_ASSET_BASE__ = "{BASE}";</script>\n'
        '<script id="map-ctx" type="application/json">{{ map_ctx_json|safe }}</script>\n'
    )
    html = html.replace("</head>", ctx + "  </head>", 1)

    TPL.parent.mkdir(parents=True, exist_ok=True)
    TPL.write_text(html, encoding="utf-8")
    print(f"模板 -> {TPL.relative_to(ROOT)}")


def main() -> int:
    if not UPSTREAM.is_dir():
        print(f"找不到上游源码：{UPSTREAM}", file=sys.stderr)
        return 1

    build_assets()
    render_template()
    print(f"\n产物 -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
