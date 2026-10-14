# -*- coding: utf-8 -*-
"""设计层审计：把页面上**真正算出来的**颜色/圆角/阴影全捞出来，按出现次数排序。

用途：改了 CSS 之后，用这个确认没有漏网的旧语言（Apple 蓝、旧圆角、投影）。

    .venv/bin/python tools/audit.py                 # 默认页面
    .venv/bin/python tools/audit.py site-home login # 指定
"""

from __future__ import annotations

import collections
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "worldbuilding_timeline.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.sessions.backends.db import SessionStore  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
WORLD = "3b9edd"

PAGES = {
    "login": ("/login", False),
    "site-home": (f"/s/{WORLD}/", False),
    "site-search": (f"/s/{WORLD}/search?q=", False),
    "workspace": ("/world", True),
    "relationship": ("/relationship", True),
    "legacy": ("/legacy", True),
}

# 允许的"新语言"取值：命中这些就不算漏网
PROPS = [
    "color", "backgroundColor", "borderTopColor", "borderTopWidth",
    "borderTopLeftRadius", "boxShadow", "fontFamily", "fontSize", "fontWeight",
    "letterSpacing", "textTransform",
]

JS = """
(props) => {
  const out = [];
  const els = document.querySelectorAll('*');
  els.forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;      // 看不见的不算
    if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') {
      if (r.width < 2) return;
    }
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const tag = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string'
      ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
    props.forEach((p) => out.push([p, cs[p], tag]));
  });
  return out;
}
"""


def session_cookie():
    user = get_user_model().objects.order_by("id").first()
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store["_auth_user_backend"] = "django.contrib.auth.backends.ModelBackend"
    store["_auth_user_hash"] = user.get_session_auth_hash()
    store.create()
    return store.session_key


def main() -> None:
    wanted = sys.argv[1:] or list(PAGES)
    from playwright.sync_api import sync_playwright

    key = session_cookie()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        for name in wanted:
            path, auth = PAGES[name]
            ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
            if auth:
                ctx.add_cookies([{"name": "sessionid", "value": key,
                                  "domain": "127.0.0.1", "path": "/"}])
            page = ctx.new_page()
            page.goto(BASE + path, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(900)
            rows = page.evaluate(JS, PROPS)
            ctx.close()

            buckets: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
            where: dict[tuple, str] = {}
            for prop, value, tag in rows:
                buckets[prop][value] += 1
                where.setdefault((prop, value), tag)

            print(f"\n{'=' * 78}\n{name}  ({path})\n{'=' * 78}")
            for prop in PROPS:
                counter = buckets.get(prop)
                if not counter:
                    continue
                print(f"\n-- {prop} --")
                for value, count in counter.most_common(14):
                    print(f"   {count:5d}  {value:52s} @{where[(prop, value)][:44]}")
        browser.close()


if __name__ == "__main__":
    main()
