# -*- coding: utf-8 -*-
"""猴子测试：在每个页面上随机乱点，统计控制台报错与失败请求。

    .venv/bin/python tools/monkey_probe.py [轮数]
"""

from __future__ import annotations

import json
import pathlib
import random
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
opener = make_opener()   # 带 cookie jar，登录态才留得住
ensure_login(opener)


def api(path: str):
    with opener.open(f"{BASE}{path}", timeout=15) as response:
        return json.loads(response.read() or b"{}")


def flatten(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flatten(node.get("children") or [], out)
    return out


def main() -> int:
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    state = api("/api/world/state")
    docs = [d for d in flatten(state["documents"]) if d["type"] != "folder"][:8]
    pages = [f"{BASE}/world"] + [f"{BASE}/world#doc={d['id']}" for d in docs] + [f"{BASE}/world"]

    random.seed(7)
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        ensure_login_page(page)
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
        page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                if msg.type == "error" else None)
        page.on("response", lambda res: errors.append(f"HTTP {res.status} {res.url}")
                if res.status >= 500 else None)          # 4xx 在乱点里可能是正常的

        for url in pages:
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(600)
            before = len(errors)
            for _ in range(rounds):
                box = page.viewport_size
                x = random.randint(280, box["width"] - 20)
                y = random.randint(50, box["height"] - 20)
                try:
                    page.mouse.click(x, y)
                    if random.random() < 0.3:
                        page.keyboard.press(random.choice(["Enter", "Escape", "Tab", "Backspace"]))
                    if random.random() < 0.2:
                        page.keyboard.type(random.choice(["abc", "/", "@", "  "]), delay=10)
                except Exception as exc:  # noqa: BLE001
                    problems.append(f"{url} 点击异常：{exc}")
                page.wait_for_timeout(60)
            new = errors[before:]
            print(f"{url:52s} 新增报错 {len(new)}")
            for item in dict.fromkeys(new):
                problems.append(f"{url} -> {item[:160]}")
        browser.close()

    print("\n=== 汇总 ===")
    print("\n".join(problems) if problems else "乱点没有触发任何报错")
    return 0


if __name__ == "__main__":
    sys.exit(main())
