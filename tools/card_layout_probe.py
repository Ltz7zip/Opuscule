# -*- coding: utf-8 -*-
"""卡片编辑器版式巡检：正文是否铺满编辑区 + 引用/评论区块是否虚胖。

跑法（先起好 dev server）：

    .venv/bin/python tools/card_layout_probe.py
    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/card_layout_probe.py

产出：/tmp/card_shots/*.png 与终端报告。
退出码非 0 表示卡片正文没有铺满编辑区，或引用区块高度超预算。
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/card_shots")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()
ensure_login(opener)

# 正文铺满度下限：正文宽度 / 编辑区可用宽度。低于这个值就是"没铺满"。
FILL_MIN = float(os.environ.get("WS_FILL_MIN", "0.94"))
# 单行引用区块的高度上限（px）：一行字却占出一大坨 = 虚胖
QUOTE_MAX_H = float(os.environ.get("WS_QUOTE_MAX_H", "74"))


def api(path: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=20) as response:
        return json.loads(response.read() or b"{}")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


MEASURE_JS = r"""
() => {
  const px = (n) => Math.round(n * 10) / 10;
  const view = document.querySelector('.card-view');
  if (!view) return null;
  const body = view.closest('.panel-body') || view.parentElement;
  const cs = getComputedStyle(body);
  const bodyBox = body.getBoundingClientRect();
  const avail = bodyBox.width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: px(r.width), h: px(r.height), left: px(r.left), right: px(r.right), top: px(r.top) };
  };
  const blocks = [...view.querySelectorAll('.bn-block-outer')].map((el) => ({
    cls: el.className,
    kind: ((el.querySelector('.bn-block-content') || {}).dataset || {}).contentType || '',
    ...box(el),
    text: blockText(el),
  }));
  function blockText(el) {
    const t = el.querySelector('.bn-inline-content');
    return t ? (t.innerText || '').trim().slice(0, 30) : '';
  }
  const blocksBox = view.querySelector('.blocks');
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    panelBody: { w: px(bodyBox.width), avail: px(avail) },
    view: box(view),
    viewCss: { maxWidth: getComputedStyle(view).maxWidth, padding: getComputedStyle(view).padding },
    props: box(view.querySelector('.props')),
    propsCss: (() => { const p = view.querySelector('.props'); return p ? { maxWidth: getComputedStyle(p).maxWidth } : null; })(),
    propRows: [...view.querySelectorAll('.prop-row')].map((el) => ({ ...box(el), key: (el.querySelector('.prop-key') || {}).innerText || '' })),
    head: box(view.querySelector('.card-head')),
    cover: box(view.querySelector('.card-cover')),
    blocksBox: box(blocksBox),
    blocksCls: blocksBox ? blocksBox.className : '',
    blocks,
    insertBar: box(view.querySelector('.insert-bar')),
    scroll: { doc: document.documentElement.scrollHeight },
  };
}
"""

# 编辑区里"只该有一圈边"的地方：多出来的描边、被裁掉的文字都算问题
FRAMES_JS = r"""
() => {
  // 只算"画得出来"的边：宽度 > 0 且颜色不是全透明
  // （透明边是保留几何的常用做法，视觉上等于没边）
  const border = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const widths = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
      .map((k) => parseFloat(cs[k]) || 0);
    const colors = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
    const transparent = colors.every((k) => {
      const m = cs[k].match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(',').map((v) => parseFloat(v));
      return parts.length > 3 && parts[3] === 0;
    });
    return transparent ? 0 : widths.reduce((a, b) => Math.max(a, b), 0);
  };
  const cover = document.querySelector('.card-view .card-cover');
  const empty = cover && cover.querySelector('.cover-empty');
  const clipped = [];
  if (empty) {
    const b = cover.getBoundingClientRect();
    empty.querySelectorAll('b, span').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5) clipped.push(n.textContent);
    });
  }
  const barButtons = [...document.querySelectorAll('.insert-bar > button')];
  return {
    workspaceBorder: border(document.querySelector('.workspace')),
    sidebarBorder: border(document.querySelector('.sidebar')),
    coverBorder: border(cover),
    insertBarBorder: border(document.querySelector('.insert-bar')),
    insertBtnBorders: barButtons.map((b) => border(b)),
    insertBarButtons: barButtons.length,
    coverClipped: clipped,
  };
}
"""


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    by_type = {}
    for doc in docs:
        by_type.setdefault(doc["type"], doc)
    card = by_type.get("card") or docs[0]
    # 带引用块的卡片：找块最多的那张，引用/评论的版式才量得出来
    richest = max((d for d in docs if d["type"] == "card"),
                  key=lambda d: len((d.get("blocks") or [])), default=card)

    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for width in (1680, 1280):
            page = browser.new_page(viewport={"width": width, "height": 1000})
            ensure_login_page(page)
            for tag, doc in (("card", card), ("quote", richest)):
                page.goto(f"{BASE}/world#doc={doc['id']}", wait_until="networkidle")
                page.wait_for_timeout(1800)
                shot = SHOTS / f"{tag}-{width}.png"
                page.screenshot(path=str(shot))
                data = page.evaluate(MEASURE_JS)
                if not data:
                    problems.append(f"{tag}@{width} 卡片视图没渲染出来")
                    print(f"  ⚠ {tag}@{width} 卡片视图没渲染出来")
                    continue
                print(f"\n== {tag}@{width} · {doc['name']} ==")
                print(f"  编辑区可用宽 {data['panelBody']['avail']} · 正文宽 {data['view']['w']} "
                      f"· 铺满 {data['view']['w'] / data['panelBody']['avail']:.3f} "
                      f"· max-width {data['viewCss']['maxWidth']}")
                if data["props"]:
                    print(f"  属性表宽 {data['props']['w']} · max-width {data['propsCss']['maxWidth']}")
                for row in data["propRows"]:
                    print(f"    prop 行 {row['key'].strip()[:12]:<12} 宽 {row['w']}")
                for b in data["blocks"]:
                    print(f"    块 {b['kind'][:14]:<14} {b['w']}×{b['h']} 「{b['text']}」")
                print(f"  截图 → {shot}")

                if "is-island" not in data["blocksCls"]:
                    problems.append(f"{tag}@{width} 正文没有走孤岛渲染（.blocks 缺 is-island：{data['blocksCls']}）")

                fill = data["view"]["w"] / data["panelBody"]["avail"]
                if fill < FILL_MIN:
                    problems.append(f"{tag}@{width} 卡片正文只占编辑区 {fill:.0%}"
                                    f"（{data['view']['w']}/{data['panelBody']['avail']}）")
                if data["props"] and data["propsCss"]["maxWidth"] not in ("none", "100%"):
                    problems.append(f"{tag}@{width} 属性表被 max-width:{data['propsCss']['maxWidth']} 掐窄了")
                for b in data["blocks"]:
                    if b["kind"] == "quote" and b["h"] > QUOTE_MAX_H:
                        problems.append(f"{tag}@{width} 引用块 {b['h']}px 超预算 {QUOTE_MAX_H}px"
                                        f"「{b['text']}」")

                frames = page.evaluate(FRAMES_JS)
                print(f"  描边：工作区 {frames['workspaceBorder']}px · 侧栏 {frames['sidebarBorder']}px "
                      f"· 封面 {frames['coverBorder']}px")
                if frames["workspaceBorder"]:
                    problems.append(f"{tag}@{width} 编辑面板又长出 {frames['workspaceBorder']}px 描边")
                if not frames["sidebarBorder"]:
                    problems.append(f"{tag}@{width} 侧栏的描边没了（侧栏保持圆角卡片 + 细边）")
                if frames["coverBorder"]:
                    problems.append(f"{tag}@{width} 卡片封面框又长出 {frames['coverBorder']}px 描边")
                # 卡片底部插入条（.insert-bar）随 P3 拆链下架：正文加块改由孤岛斜杠菜单负责
                if frames["insertBarBorder"] is not None or frames["insertBtnBorders"]:
                    problems.append(f"{tag}@{width} 卡片视图不该再有插入条："
                                    f"{frames['insertBarButtons']} 键 {frames['insertBtnBorders']}")
                if frames["coverClipped"]:
                    problems.append(f"{tag}@{width} 封面占位文字被裁：{frames['coverClipped']}")
            page.close()
        browser.close()

    print("\n================ 报告 ================")
    if problems:
        for item in problems:
            print(f"  ✗ {item}")
        return 1
    print("  ✓ 卡片正文铺满编辑区，编辑区只有一圈该有的边，区块高度在预算内")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
