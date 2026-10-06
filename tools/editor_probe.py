# -*- coding: utf-8 -*-
"""块嵌套/嵌入 + 模糊提及 + 快捷键自定义 + 无障碍播报 + 移动端的验证。"""
from __future__ import annotations
import json, pathlib, sys, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/ux_shots"); SHOTS.mkdir(exist_ok=True)
opener = make_opener(); ensure_login(opener)

def api(path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=25) as r:
        return json.loads(r.read() or b"{}")

def flat(ns, out=None):
    out = out if out is not None else []
    for n in ns:
        out.append(n); flat(n.get("children") or [], out)
    return out

problems = []
state = api("/api/world/state")
docs = flat(state["documents"])
card = next(d for d in docs if d["type"] == "card")
other = next(d for d in docs if d["type"] == "card" and d["id"] != card["id"])

# 保证这张卡至少有三个块，探针才好操作
_blocks = api(f"/api/world/cards/{card['id']}")["card"]["blocks"] or []
while len(_blocks) < 3:
    _blocks.append({"id": f"probe{len(_blocks)}", "type": "text", "title": f"探针块 {len(_blocks)}",
                    "text": "探针内容"})
api(f"/api/world/cards/{card['id']}", "PUT", {"blocks": _blocks})

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page(viewport={"width": 1500, "height": 950})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    ensure_login_page(page)
    page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
    page.wait_for_timeout(1600)
    print("探针用卡片:", card["id"], card["name"],
          "· DOM 里的正文块:", page.locator(".block-text").count())

    # ---------- 1) 块嵌套：Tab 缩进 + 折叠 + 嵌入卡 ----------
    page.evaluate("""() => {
      const node = document.querySelectorAll('.block-text')[1];
      node.focus();
      const range = document.createRange(); range.selectNodeContents(node);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }""")
    page.keyboard.press("Tab")
    page.wait_for_timeout(1200)
    levels = api(f"/api/world/cards/{card['id']}")["card"]["blocks"]
    print("缩进后的 level：", [b.get("level") for b in levels])
    if not any(b.get("level") for b in levels):
        problems.append("Tab 缩进没生效")
    nested = page.locator(".block.is-nested").count()
    print("界面上带缩进的块：", nested)
    if nested < 1:
        problems.append("缩进没有渲染成嵌套样式")
    page.screenshot(path=str(SHOTS / "nested_blocks.png"))

    # 折叠
    page.query_selector_all(".block")[1].hover(); page.wait_for_timeout(300)
    page.query_selector_all(".block-handle")[1].click(); page.wait_for_timeout(600)
    menu_items = [n.inner_text().strip() for n in page.query_selector_all(".block-menu button")]
    print("块菜单项：", menu_items[:8])
    for wanted in ("缩进一层", "折叠这一块", "嵌入一张卡片…", "插入图片…"):
        if wanted not in menu_items:
            problems.append(f"块菜单缺少「{wanted}」")
    page.keyboard.press("Escape"); page.mouse.click(1200, 320); page.wait_for_timeout(400)

    # 直接通过接口放一个嵌入卡与图片，验证渲染
    blocks = api(f"/api/world/cards/{card['id']}")["card"]["blocks"]
    blocks.append({"id": "bembed", "type": "card", "settings": {"document": other["id"]}, "title": "", "text": ""})
    blocks.append({"id": "bimage", "type": "image", "settings": {"url": "https://example.com/x.png", "caption": "参考图"}, "title": "", "text": ""})
    api(f"/api/world/cards/{card['id']}", "PUT", {"blocks": blocks})
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    try:
        page.wait_for_selector(".embed-card, .embed-image", timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(600)
    print("嵌入卡渲染：", page.locator(".embed-card").count(), "· 图片块：", page.locator(".embed-image").count())
    if page.locator(".embed-card").count() < 1 or page.locator(".embed-image").count() < 1:
        problems.append("嵌入卡或图片块没有渲染")
    page.screenshot(path=str(SHOTS / "embed_blocks.png"))

    # ---------- 2) 模糊提及 ----------
    page.evaluate("""() => {
      const node = document.querySelectorAll('.block-text')[0];
      node.focus();
    }""")
    page.keyboard.press("End")
    page.keyboard.type(" @Harrowdeap", delay=40)
    page.wait_for_timeout(1200)
    rows = page.locator(".mention-pop .mention-row").count()
    hint = page.locator(".mention-pop .mention-row .mr-kind").first.inner_text() if rows else ""
    print(f"模糊提及候选：{rows} 条 · 提示「{hint[:24]}」")
    if rows < 1:
        problems.append("打错的名字没有模糊候选")
    page.screenshot(path=str(SHOTS / "fuzzy_mention.png"))
    page.keyboard.press("Escape")

    # ---------- 3) 快捷键自定义 ----------
    page.keyboard.press("Meta+/")
    page.wait_for_timeout(700)
    page.click("text=自定义快捷键…")
    page.wait_for_timeout(700)
    rows2 = page.locator(".shortcut-list .shortcut-row").count()
    print("快捷键设置行数：", rows2)
    if rows2 < 5:
        problems.append("快捷键设置没有列出条目")
    page.locator(".shortcut-list .shortcut-row button", has_text="改").first.click()
    page.wait_for_timeout(300)
    page.keyboard.down("Control"); page.keyboard.down("Shift")
    page.keyboard.press("KeyJ")
    page.keyboard.up("Shift"); page.keyboard.up("Control")
    page.wait_for_timeout(700)
    stored = page.evaluate("() => localStorage.getItem('ws:keymap')")
    print("自定义键位已存：", (stored or "")[:60])
    if not stored or 'j' not in stored:
        problems.append("自定义快捷键没存下来")
    page.screenshot(path=str(SHOTS / "shortcut_editor.png"))
    page.evaluate("() => localStorage.removeItem('ws:keymap')")

    # ---------- 4) 无障碍播报 ----------
    page.keyboard.press("Escape"); page.mouse.click(1200, 320); page.wait_for_timeout(400)
    page.evaluate("""() => {
      const node = document.querySelectorAll('.block-text')[0];
      node.focus(); node.innerHTML = (node.innerHTML||'') + ' <p>播报测试</p>';
    }""")
    page.click(".card-title"); page.wait_for_timeout(1500)
    page.keyboard.press("Meta+z"); page.wait_for_timeout(1200)
    said = page.locator("#srStatus").inner_text()
    print("播报内容：", said)
    if "撤销" not in said:
        problems.append("撤销没有播报给屏幕阅读器")

    # ---------- 4b) 键盘拖拽（空格拾起 → 方向键 → 空格放下） ----------
    page.goto(f"{BASE}/world?t={id(page)}#doc={card['id']}", wait_until="networkidle")
    page.wait_for_timeout(1800)
    order_before = [b.get("title") or (b.get("text") or "")[:8]
                    for b in api(f"/api/world/cards/{card['id']}")["card"]["blocks"]]
    handle = page.locator(".block-handle").nth(0)
    handle.focus()
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    grabbed = page.locator(".block.is-grabbed").count()
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(1300)
    page.keyboard.press("Space")
    page.wait_for_timeout(600)
    order_after = [b.get("title") or (b.get("text") or "")[:8]
                   for b in api(f"/api/world/cards/{card['id']}")["card"]["blocks"]]
    said2 = page.locator("#srStatus").inner_text()
    print(f"键盘拖拽：拾起 {grabbed} 个 · 顺序 {order_before[:2]} → {order_after[:2]} · 播报「{said2}」")
    if grabbed < 1:
        problems.append("空格没有拾起区块")
    if order_before == order_after:
        problems.append("键盘方向键没有移动区块")
    if "移动" not in said2 and "放下" not in said2:
        problems.append("键盘拖拽没有播报")

    # ---------- 5) 移动端 ----------
    phone = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    ensure_login_page(phone)
    phone.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
    phone.wait_for_timeout(1500)
    nav = phone.locator(".bottom-nav").count()
    visible = phone.evaluate("() => { const n = document.querySelector('.bottom-nav'); return n ? getComputedStyle(n).display : 'none'; }")
    manifest = phone.evaluate("() => !!document.querySelector('link[rel=manifest]')")
    print(f"移动端底部导航：{nav} 个 · display={visible} · manifest={manifest}")
    if nav != 1 or visible == "none":
        problems.append("移动端底部导航没有显示")
    if not manifest:
        problems.append("缺少 PWA manifest")
    phone.locator(".bottom-nav button").nth(1).click()
    phone.wait_for_timeout(700)
    print("底部导航「搜索」打开面板：", phone.locator("#palette:not([hidden])").count() > 0)
    phone.screenshot(path=str(SHOTS / "mobile_nav.png"))
    b.close()

print("报错：", errs[:2] or "（无）")
print("问题：", problems or "（无）")
