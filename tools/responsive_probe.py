# -*- coding: utf-8 -*-
"""多尺寸视觉检查：桌面 / 笔记本 / 平板横竖 / 手机，逐档截图并检测溢出。

    .venv/bin/python tools/responsive_probe.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/responsive")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()   # 带 cookie jar，登录态才留得住
ensure_login(opener)

SIZES = [
    ("1920x1080", 1920, 1080),
    ("1440x900", 1440, 900),
    ("1280x800", 1280, 800),
    ("1024x768", 1024, 768),
    ("834x1112", 834, 1112),
    ("390x844", 390, 844),
]


def api(path: str):
    with opener.open(f"{BASE}{path}", timeout=20) as response:
        return json.loads(response.read() or b"{}")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def main() -> int:
    docs = flat(api("/api/world/state")["documents"])
    card = next(d for d in docs if d["type"] == "card")
    timeline = next(d for d in docs if d["type"] == "timeline")
    problems: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for label, width, height in SIZES:
            page = browser.new_page(viewport={"width": width, "height": height})
            ensure_login_page(page)
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
            page.wait_for_timeout(1100)

            metrics = page.evaluate("""() => {
              const de = document.documentElement;
              const overflow = de.scrollWidth - window.innerWidth;
              const box = (sel) => {
                const n = document.querySelector(sel);
                if (!n) return null;
                const r = n.getBoundingClientRect();
                return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
              };
              const wide = [];
              document.querySelectorAll('.topbar *, .card-view *').forEach((n) => {
                const r = n.getBoundingClientRect();
                if (r.width && r.right > window.innerWidth + 2 && n.offsetParent) {
                  wide.push((n.className || n.tagName) + ':' + Math.round(r.right));
                }
              });
              return {
                size: de.dataset.size,
                overflow,
                sidebarVisible: (() => {
                  const s = document.querySelector('.sidebar');
                  if (!s) return false;
                  const r = s.getBoundingClientRect();
                  return r.right > 0 && r.width > 0 && getComputedStyle(s).display !== 'none';
                })(),
                cardView: box('.card-view'),
                topbar: box('.topbar'),
                overflowing: wide.slice(0, 4),
              };
            }""")
            print(f"{label:>10} · 档位 {metrics['size']:<3} 横向溢出 {metrics['overflow']:>4}px "
                  f"侧栏{'显示' if metrics['sidebarVisible'] else '收起'} "
                  f"编辑区 {metrics['cardView']['w'] if metrics['cardView'] else 0}px")
            if metrics["overflow"] > 2:
                problems.append(f"{label} 横向溢出 {metrics['overflow']}px")
            if metrics["overflowing"]:
                problems.append(f"{label} 元素超出右边界：{metrics['overflowing']}")
            if errors:
                problems.append(f"{label} 报错：{errors[:1]}")
            page.screenshot(path=str(SHOTS / f"card-{label}.png"))

            # 手机档：抽屉打开的样子
            if width <= 640:
                page.click("#sidebarBtn")
                page.wait_for_timeout(600)
                page.screenshot(path=str(SHOTS / f"sidebar-{label}.png"))
                page.keyboard.press("Escape")
                page.mouse.click(width - 20, height // 2)

            # 时间线在各档的表现
            page.goto(f"{BASE}/world#doc={timeline['id']}", wait_until="networkidle")
            page.wait_for_timeout(1800)
            tl = page.evaluate("""() => {
              const de = document.documentElement;
              const frame = document.querySelector('.timeline-frame');
              const bar = document.querySelector('.tl-frame-bar');
              return {
                overflow: de.scrollWidth - window.innerWidth,
                frame: frame ? Math.round(frame.getBoundingClientRect().width) : 0,
                barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
              };
            }""")
            print(f"{'':>10}   时间线：画布 {tl['frame']}px · 工具条高 {tl['barHeight']}px · 溢出 {tl['overflow']}px")
            if tl["overflow"] > 2:
                problems.append(f"{label} 时间线横向溢出 {tl['overflow']}px")
            page.screenshot(path=str(SHOTS / f"timeline-{label}.png"))
            page.close()
        browser.close()

    print("\n问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
