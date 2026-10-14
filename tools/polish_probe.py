# -*- coding: utf-8 -*-
"""动效/观感层的布局回归探针。

思路：同一页加载两次——一次正常（带 polish.css），一次把 polish.css 拦掉——
把两棵 DOM 里每个带 class 的元素的盒子量出来做差。动效层只该改颜色、圆角、
阴影、透明度；**任何明显的位移/尺寸变化都值得逐个确认**，因为这一层是最后
加载的，很容易在无意中改掉别人辛苦对齐的排版。

跑法（先起好 dev server）：

    .venv/bin/python tools/polish_probe.py
    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/polish_probe.py

退出码非 0 表示发现了超过阈值的位移。
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

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8010")
SITE_SLUG = os.environ.get("WS_SITE_SLUG", "3b9edd")
TOLERANCE = float(os.environ.get("WS_TOLERANCE", "2"))   # px，超过才算问题

opener = ensure_login(make_opener())


def api(path: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=25) as response:
        body = response.read()
        return json.loads(body) if body else {}


MEASURE_JS = r"""
() => {
  const out = {};
  const seen = new Map();
  document.querySelectorAll('*').forEach((el) => {
    const cls = (el.getAttribute('class') || '').trim();
    if (!cls) return;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) return;
    // 同一个 class 组合可能重复出现，加序号区分
    const n = (seen.get(cls) || 0) + 1;
    seen.set(cls, n);
    out[`${cls}#${n}`] = [Math.round(r.left), Math.round(r.top),
                          Math.round(r.width), Math.round(r.height)];
  });
  return out;
}
"""

# 巡检页面：(名字, URL)
PAGES = [
    ("workspace", "/world"),
    ("relationship", "/relationship"),
    ("site-home", f"/s/{SITE_SLUG}/"),
    ("site-search", f"/s/{SITE_SLUG}/search?q=Harrow"),
    ("login", "/login"),
]


def collect(page, url: str, block: bool):
    page.goto("about:blank")
    page.goto(f"{BASE}{url}", wait_until="networkidle")
    page.wait_for_timeout(1200)
    # 把动画钉在终态上再量，免得量到入场中途的中间值
    page.add_style_tag(content="*,*::before,*::after{animation:none !important;"
                               "transition:none !important;}")
    page.wait_for_timeout(250)
    return page.evaluate(MEASURE_JS)


def compare(label: str, without: dict, with_: dict) -> list[str]:
    problems = []
    for key, box in with_.items():
        base = without.get(key)
        if base is None:
            continue                                   # 新出现的元素（如 ::before 生成的不算）
        delta = max(abs(a - b) for a, b in zip(box, base))
        if delta > TOLERANCE:
            problems.append(f"  {label} · {key}\n      带 polish: {box}\n      不带    : {base}\n      最大偏差 {delta:.0f}px")
    return problems


def main() -> int:
    scratch = []
    for doc_type in ("table", "board", "radar", "todo", "dictionary", "canvas"):
        try:
            created = api("/api/world/documents", "POST",
                          {"type": doc_type, "name": f"布局探针 · {doc_type}"})
            scratch.append(created["id"])
        except Exception as exc:                                   # noqa: BLE001
            print(f"  ! 建 {doc_type} 失败：{exc}")

    pages = list(PAGES) + [(f"doc-{t}", f"/world#doc={i}")
                           for i, t in zip(scratch, ("table", "board", "radar",
                                                     "todo", "dictionary", "canvas"))]

    all_problems: list[str] = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True, args=["--disable-dev-shm-usage"])
            for label, url in pages:
                ctx_off = browser.new_context(viewport={"width": 1512, "height": 900},
                                              locale="zh-CN")
                ctx_off.route("**/polish.css*", lambda route: route.abort())
                page_off = ctx_off.new_page()
                ensure_login_page(page_off)
                without = collect(page_off, url, block=True)
                ctx_off.close()

                ctx_on = browser.new_context(viewport={"width": 1512, "height": 900},
                                             locale="zh-CN")
                page_on = ctx_on.new_page()
                ensure_login_page(page_on)
                with_ = collect(page_on, url, block=False)
                ctx_on.close()

                problems = compare(label, without, with_)
                mark = "✓" if not problems else f"✗ {len(problems)} 处"
                print(f"{mark}  {label}  （元素 {len(without)} → {len(with_)}）")
                all_problems.extend(problems)
            browser.close()
    finally:
        for doc_id in scratch:
            try:
                api(f"/api/world/documents/{doc_id}", "DELETE")
            except Exception:                                      # noqa: BLE001
                pass
        print(f"· 已清理 {len(scratch)} 份临时文档")

    if all_problems:
        print("\n以下元素的盒子变了（阈值 "
              f"{TOLERANCE:g}px），请逐个确认是不是有意为之：\n")
        print("\n".join(all_problems))
        return 1
    print("\n所有巡检页面：加载 polish.css 前后盒子一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
