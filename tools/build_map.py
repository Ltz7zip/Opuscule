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

#: 宿主外壳：整页的 html 属性（主题 / 落地方式）由 Django 填
_HTML_OPEN = re.compile(r"<html[^>]*>")
_HTML_ATTRS = (
    '<html lang="en" data-theme="{{ theme|default:\'dark\' }}"'
    ' data-map-host="{% if shell.show_bar %}bar{% else %}embed{% endif %}">'
)
#: 跨文档视图过渡的最小内联样式：外壳样式表在 head 末尾，
#: 浏览器可能在它生效前取首帧快照，所以这几条必须内联。
_VIEW_TRANSITION = """    {# 跨文档视图过渡：外壳样式在 head 末尾，浏览器可能在它生效前就取首帧快照， #}
    {# 所以这里只内联最小的那几条（@view-transition + 共享名），几何仍由 shell.css 决定。 #}
    <style>
      @view-transition { navigation: auto; }
      html[data-map-host='bar'] #tx-bar { view-transition-name: xp-shell-top; }
      html[data-map-host='bar'] .tx-bar__world { view-transition-name: xp-world; }
      @media (min-width: 981px) {
        html[data-map-host='bar'] #options { view-transition-name: xp-shell-side; }
      }
    </style>
    <!-- inline css for loading screen -->"""
_LOADING_COMMENT = "    <!-- inline css for loading screen -->"
#: 外壳样式表放在 head：首帧就要有，否则跨文档过渡会被跳过
_SHELL_CSS = """{# 地图页外壳样式放在 head：跨文档视图过渡要求新页面在**首帧**就带着 @view-transition， #}
{# 放在 body 里的样式表可能赶不上第一次渲染，过渡就会被悄悄跳过。 #}
<link rel="stylesheet" href="{% static 'map/tokens.css' %}?v={{ static_version }}" />
<link rel="stylesheet" href="{% static 'map/shell.css' %}?v={{ static_version }}" />
<link rel="stylesheet" href="{% static 'map/panel.css' %}?v={{ static_version }}" />
<link rel="stylesheet" href="{% static 'opuscule.css' %}?v={{ static_version }}" />
"""
#: 上游英文分页标签换成宿主的中文
_TAB = re.compile(
    r'<button id="(layersTab|styleTab|optionsTab|toolsTab|aboutTab)"'
    r' data-tip="[^"]*" class="([^"]*)">[^<]*</button>'
)
_TABS = {
    "layersTab": ("切换图层", "图层"),
    "styleTab": ("打开样式编辑器", "样式"),
    "optionsTab": ("生成与界面选项", "选项"),
    "toolsTab": ("打开工具", "工具"),
    "aboutTab": ("关于地图生成器", "关于"),
}


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

    # html 标签带上主题与落地方式：外壳 CSS 全靠这两个 data 属性分支
    html = _HTML_OPEN.sub(_HTML_ATTRS, html, count=1)
    # {% static %} 需要先 load，插在 doctype 之前（Django 允许模板标签出现在 doctype 前）
    html = "{% load static %}" + html

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

    # 跨文档视图过渡必须赶在首帧前生效，内联到加载屏样式之前
    html = html.replace(_LOADING_COMMENT, _VIEW_TRANSITION, 1)

    # 分页标签中文化
    def _tab(m: re.Match[str]) -> str:
        tip, label = _TABS[m.group(1)]
        return f'<button id="{m.group(1)}" data-tip="{tip}" class="{m.group(2)}">{label}</button>'

    html = _TAB.sub(_tab, html)

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
    html = html.replace("</head>", _SHELL_CSS + ctx + "  </head>", 1)

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
