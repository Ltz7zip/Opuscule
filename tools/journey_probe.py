# -*- coding: utf-8 -*-
"""两条用户旅程的体验探查（找问题，不是找通过）：

  A. 新用户：拿着邀请码来注册，然后从零搭自己的世界观
  B. 游客：没注册没登录，逛发布出来的 wiki

跑完会打印"路上遇到的坎"，并给关键页面截图到 /tmp/journey/。

    .venv/bin/python tools/journey_probe.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/journey")
SHOTS.mkdir(parents=True, exist_ok=True)

NEW_USER = f"journey-{int(time.time()) % 100000}"   # 每次跑用新名字，探针才能重复跑
NEW_PASSWORD = "journey-password-1"
friction: list[str] = []


def api(opener, path, method="GET", payload=None, form=None):
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        ctype = "application/x-www-form-urlencoded"
    else:
        data = json.dumps(payload).encode() if payload is not None else None
        ctype = "application/json"
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                     headers={"Content-Type": ctype})
    try:
        with opener.open(request, timeout=25) as response:
            body = response.read()
            return response.status, json.loads(body or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read() or b"{}")
        except ValueError:
            return exc.code, {}


def note(where: str, text: str):
    friction.append(f"[{where}] {text}")
    print(f"  ⚠ {where}：{text}")


def main() -> int:
    # 清掉之前跑剩下的旅程账号，保证可重复
    import os
    import sys as _sys
    import django
    _sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "worldbuilding_timeline.settings")
    django.setup()
    from django.contrib.auth.models import User

    User.objects.filter(username__startswith="journey-").delete()

    owner = ensure_login(make_opener())
    slug = None
    status, state = api(owner, "/api/world/state")
    if status == 200:
        slug = (state["world"].get("publish") or {}).get("url", "").strip("/").split("/")[-1]

    # =====================================================================
    # A. 新用户旅程
    # =====================================================================
    print("\n=== A. 新用户（有邀请码，还没注册） ===")
    status, invite = api(owner, "/api/world/collaborators/invites", "POST",
                         {"role": "editor", "note": "旅程探针"})
    if status != 200:
        print("发不出邀请码，后面的旅程没法走")
        return 1
    code = invite["code"]
    print(f"所有者发出邀请码：{code}")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 950})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1) 拿到链接（邀请码怎么给到用户？）
        link = f"{BASE}/register?invite={code}"
        print(f"邀请链接：{link}")
        page.goto(link, wait_until="networkidle")
        page.wait_for_timeout(600)
        filled = page.evaluate("() => (document.querySelector('#invite')||{}).value || ''")
        if not filled:
            note("注册", "链接里带了 ?invite=…，但注册表单没有自动填上邀请码，用户还得手动复制粘贴")
        else:
            print(f"邀请码自动填好了：{filled}")
        page.screenshot(path=str(SHOTS / "A1_register.png"))

        # 2) 注册
        page.fill("#username", NEW_USER)
        page.fill("#display_name", "旅程用户")
        page.fill("#password", NEW_PASSWORD)
        if not filled and page.locator("#invite").count():
            page.fill("#invite", code)
        page.click("button[type=submit]")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        where = page.url
        print(f"注册后落在：{where}")
        if "/world" not in where:
            note("注册", f"注册成功后没有直接进工作区，而是停在 {where}")

        # 3) 新用户看到什么？有没有引导？
        hint = page.evaluate("""() => ({
          guided: !!document.querySelector('#ehGuide'),
          empty: !document.querySelector('#emptyHint')?.hidden,
          tabs: document.querySelectorAll('.tab').length,
        })""")
        print(f"首屏：引导按钮 {hint['guided']} · 空状态 {hint['empty']} · 标签 {hint['tabs']}")
        page.screenshot(path=str(SHOTS / "A2_first_screen.png"))
        if not hint["guided"] and hint["empty"]:
            note("首屏", "空状态下没有引导入口")

        # 4) 用模板建一张角色卡（新用户最自然的起点）
        # 新用户首屏看不到空状态（应用会自动打开一篇文档），所以走侧栏的常驻入口
        if page.locator("#ehGuide").is_visible():
            page.click("#ehGuide")
        else:
            note("首屏", "新用户一进来就被自动打开了文档，看不到空状态与引导模板——模板入口只在命令面板和侧栏小按钮里")
            page.click("#templateBtn")
        page.wait_for_timeout(600)
        page.click(".guide-card")
        page.wait_for_timeout(500)
        inputs = page.locator(".guide-question input")
        print(f"引导问答：{inputs.count()} 个问题")
        if inputs.count() >= 5:
            inputs.nth(0).fill("试验角色")
            inputs.nth(1).fill("一个铁匠")
            inputs.nth(2).fill("找回被偷的锤子")
            inputs.nth(3).fill("怕高")
            inputs.nth(4).fill("哈罗深")
        page.screenshot(path=str(SHOTS / "A3_guided.png"))
        page.click("#mdBody .mini-btn.is-primary")
        page.wait_for_timeout(2000)
        created = page.evaluate("() => (document.querySelector('.card-title')||{}).textContent")
        print(f"模板建出来的卡：{created}")
        if not created or "试验角色" not in created:
            note("引导模板", "问答填完没有落到新卡片上")

        # 5) 建完这张卡之后，下一步该干嘛？（有没有"回到全局"的引导）
        next_hint = page.evaluate("""() => ({
          insertBar: !!document.querySelector('.insert-bar'),
          props: document.querySelectorAll('.prop-row').length,
          hint: (document.querySelector('.card-view .hint')||{}).textContent || '',
        })""")
        print(f"新卡页面：插入条 {next_hint['insertBar']} · 属性行 {next_hint['props']}")
        page.screenshot(path=str(SHOTS / "A4_new_card.png"))
        if next_hint["props"] == 0:
            note("新卡片", "模板建出来的卡一个属性都没有，新用户不知道该填什么（模板只铺了区块）")

        # 6) 时间线：新用户想加事件，入口好找吗？
        page.keyboard.press("Meta+k")
        page.wait_for_timeout(500)
        page.click("#plInput")
        page.keyboard.type("时间线", delay=30)
        page.wait_for_timeout(600)
        items = page.locator(".pl-item").count()
        page.keyboard.press("Escape")
        print(f"命令面板搜时间线命中 {items} 条")
        if items == 0:
            note("时间线", "命令面板搜不到时间线相关动作")

        # 7) 建时间线 + 加事件（新用户第一次用经典编辑器）
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.wait_for_timeout(1200)
        status, tl = api(owner, "/api/world/documents", "POST", {"type": "timeline", "name": "旅程时间线"})
        page.goto(f"{BASE}/world#doc={tl['id']}", wait_until="networkidle")
        page.wait_for_timeout(2500)
        frame = page.frame_locator(".timeline-frame")
        tip = frame.locator(".coach-text").count()
        toolbar = frame.locator("#toolbar .tool-btn").count()
        print(f"时间线首屏：工具栏 {toolbar} 颗按钮 · 引导提示 {tip}")
        page.screenshot(path=str(SHOTS / "A5_timeline_empty.png"))
        if tip == 0:
            note("时间线", "空时间线上没有操作提示，新用户不知道怎么加第一个事件")

        # 8) 发布：新用户能自己找到发布入口吗？
        page.keyboard.press("Meta+k")
        page.wait_for_timeout(400)
        page.click("#plInput")
        page.keyboard.type("发布", delay=30)
        page.wait_for_timeout(600)
        publish_items = [n.inner_text().strip() for n in page.locator(".pl-item").all()]
        page.keyboard.press("Escape")
        print(f"命令面板搜发布：{publish_items[:3]}")
        if not publish_items:
            note("发布", "命令面板里搜不到发布入口")

        # 9) 收尾：这个新用户建的东西清理掉
        page.close()
        browser.close()

    # 清理新用户建的东西与新账号（不污染演示世界）
    status, docs = api(owner, "/api/world/documents?type=")
    for doc in docs.get("documents", []):
        if doc["name"] in ("试验角色", "旅程时间线"):
            api(owner, f"/api/world/documents/{doc['id']}?hard=1", "DELETE")
    User.objects.filter(username=NEW_USER).delete()

    # =====================================================================
    # B. 游客旅程（没注册没登录，逛 wiki）
    # =====================================================================
    print("\n=== B. 游客（没注册、没登录） ===")
    guest = make_opener()          # 全新 cookie jar = 未登录
    if not slug:
        print("这个世界还没发布，游客旅程跳过")
    else:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome", headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 950})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            failed: list[str] = []
            page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)

            page.goto(f"{BASE}/s/{slug}/", wait_until="networkidle")
            page.wait_for_timeout(1200)
            home = page.evaluate("""() => ({
              title: document.title,
              sections: document.querySelectorAll('section, .type-block, h2').length,
              links: Array.from(document.querySelectorAll('a')).map(a => a.textContent.trim()).slice(0, 14),
              search: !!document.querySelector('input[type=search], .site-search'),
            })""")
            print(f"首页：{home['title']} · 链接 {home['links'][:8]}")
            page.screenshot(path=str(SHOTS / "B1_home.png"))
            if home["search"]:
                note("游客", "首页有搜索框但没人知道它只搜标题（站内搜索的预期是全文）")

            # 1) 卡片页：信息够不够？能不能顺着链接继续逛？
            status, docs = api(owner, "/api/world/state")
            # 游客自己取（不能用 owner 的会话，这里只用来拿 slug 列表）
            guest_state = json.loads(guest.open(f"{BASE}/api/world/state").read())
            pages = []

            def walk(nodes):
                for node in nodes:
                    pages.append(node)
                    walk(node.get("children") or [])

            walk(guest_state["documents"])
            card_doc = next((d for d in pages if d["type"] == "card"), None)
            if card_doc:
                url = f"{BASE}/s/{slug}/{urllib.parse.quote(card_doc['slug'])}/"
                page.goto(url, wait_until="networkidle")
                page.wait_for_timeout(1000)
                card_view = page.evaluate("""() => ({
                  props: document.querySelectorAll('.props tr').length,
                  blocks: document.querySelectorAll('.page-body h2, article h2').length,
                  links: document.querySelectorAll('a[href*="/s/"]').length,
                  headings: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 6),
                })""")
                print(f"卡片页 {card_doc['name']}：属性 {card_view['props']} 行 · 小标题 {card_view['headings']}")
                page.screenshot(path=str(SHOTS / "B2_card.png"))

            # 2) 时间线页：新版嵌入
            tl_doc = next((d for d in pages if d["type"] == "timeline"), None)
            if tl_doc:
                page.goto(f"{BASE}/s/{slug}/{urllib.parse.quote(tl_doc['slug'])}/", wait_until="networkidle")
                page.wait_for_timeout(3200)
                tl_view = page.evaluate("""() => ({
                  embed: !!document.querySelector('#timelineEmbed'),
                  listButton: !!document.querySelector('#timelineListBtn'),
                  fullButton: !!document.querySelector('#timelineFullBtn'),
                  frameHeight: (document.querySelector('.te-frame')||{}).clientHeight || 0,
                  cells: document.querySelectorAll('.tl-list-row').length,
                })""")
                print(f"时间线页：嵌入 {tl_view['embed']} · 高度 {tl_view['frameHeight']} · 列表按钮 {tl_view['listButton']}")
                page.screenshot(path=str(SHOTS / "B3_timeline.png"))
                if not tl_view["embed"]:
                    note("游客", "时间线页没有用画布视图（还在用朴素列表）")

            # 3) 地图 / 关系树 / 图谱：游客看到的还是占位页吗？
            for kind, label in (("map", "地图"), ("familyTree", "关系树"), ("graph", "世界图谱")):
                doc = next((d for d in pages if d["type"] == kind), None)
                if not doc:
                    continue
                page.goto(f"{BASE}/s/{slug}/{urllib.parse.quote(doc['slug'])}/", wait_until="networkidle")
                page.wait_for_timeout(1200)
                shown = page.evaluate("""() => ({
                  html: document.querySelector('main, .page-body, article')?.innerText.slice(0, 80) || '',
                  img: document.querySelectorAll('img, svg, canvas').length,
                })""")
                print(f"{label}页：媒体元素 {shown['img']} · 文字「{shown['html'][:40].replace(chr(10), ' ')}」")
                if shown["img"] == 0:
                    note("游客", f"{label}页只有文字，没有把工作区里的画布渲染出来")
                page.screenshot(path=str(SHOTS / f"B4_{kind}.png"))

            # 4) 游客能不能"顺手编辑"？（点进工作区会怎样）
            page.goto(f"{BASE}/world", wait_until="networkidle")
            page.wait_for_timeout(1500)
            readonly = page.evaluate("""() => ({
              bar: !document.querySelector('#readonlyBar').hidden,
              text: (document.querySelector('#readonlyText')||{}).textContent || '',
              buttons: ['#undoBtn', '#exchangeBtn', '#suggestBtn'].map(s => {
                const n = document.querySelector(s);
                return n ? getComputedStyle(n).display : 'missing';
              }),
            })""")
            print(f"游客进工作区：只读条 {readonly['bar']}「{readonly['text'][:24]}」· 按钮 {readonly['buttons']}")
            page.screenshot(path=str(SHOTS / "B5_guest_workspace.png"))
            if not readonly["bar"]:
                note("游客", "游客进工作区没有看到只读提示")

            # 5) 站内搜索：游客能不能搜到内容？
            if card_doc:
                found = page.evaluate("""async () => {
                  const box = document.querySelector('input[type=search], .site-search input');
                  if (!box) return null;
                  box.value = 'Harrow';
                  box.dispatchEvent(new Event('input', { bubbles: true }));
                  box.form && box.form.requestSubmit ? box.form.requestSubmit() : null;
                  return true;
                }""")
                print(f"站内搜索框可用：{found}")

            print("游客路上的 4xx/5xx：", failed[:3] or "（无）")
            browser.close()

    print("\n=== 遇到的坎 ===")
    for item in friction:
        print(" -", item)
    print(f"\n共 {len(friction)} 条；截图在 {SHOTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
