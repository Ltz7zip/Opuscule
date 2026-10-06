# -*- coding: utf-8 -*-
"""账号 + 协作 + 版本历史的全流程验证。

    .venv/bin/python tools/collab_probe.py

流程：
  1) 游客：能读、不能写（界面提示 + 接口 401）
  2) 登录所有者：只读条消失、顶栏显示身份
  3) 所有者发邀请码
  4) 第二个用户用邀请码注册（另一个浏览器上下文）→ 可编辑，双方互相看得到在线状态
  5) 版本历史：两个人各改一次 → 两个版本 → 预览 → 回滚
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import DEV_PASSWORD, DEV_USER, ensure_login, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/collab")
SHOTS.mkdir(parents=True, exist_ok=True)

FRIEND_USER = "friend"
FRIEND_PASSWORD = "friend-password-1"


def api(opener, path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                     headers={"Content-Type": "application/json"})
    try:
        with opener.open(request, timeout=20) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        body = exc.read()
        try:
            return exc.code, json.loads(body or b"{}")
        except ValueError:
            return exc.code, {}


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def main() -> int:
    problems: list[str] = []
    owner = ensure_login(make_opener())
    status, state = api(owner, "/api/world/state")
    if status != 200:
        print("连不上服务，先 runserver")
        return 1
    card = next(d for d in flat(state["documents"]) if d["type"] == "card")

    # ---------------------------------------------------------- 1) 游客
    guest = make_opener()
    status, _payload = api(guest, "/api/world/documents", "POST", {"type": "card", "name": "游客偷偷建的"})
    print(f"游客建文档 -> {status}（应为 401）")
    if status != 401:
        problems.append(f"游客竟然能写（{status}）")
    status, payload = api(guest, f"/api/world/cards/{card['id']}")
    print(f"游客读卡片 -> {status}（应为 200）")
    if status != 200:
        problems.append("游客连读都不行了")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)

        # 游客视角：只读条 + 不能编辑
        guest_page = browser.new_page(viewport={"width": 1440, "height": 900})
        guest_page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        guest_page.wait_for_timeout(1200)
        banner = guest_page.evaluate("() => !document.querySelector('#readonlyBar').hidden")
        editable = guest_page.evaluate("""() => Array.from(document.querySelectorAll('.block-text'))
            .some(n => n.getAttribute('contenteditable') === 'true')""")
        print(f"游客：只读条 {banner} · 正文可编辑 {editable}")
        if not banner:
            problems.append("游客没看到只读提示")
        if editable:
            problems.append("游客的正文还是可编辑的")
        guest_page.screenshot(path=str(SHOTS / "guest-readonly.png"))
        # 试着改正文：contenteditable 已经是 false，改不动才对
        changed = guest_page.evaluate("""() => {
          const node = document.querySelector('.block-text');
          if (!node) return null;
          const before = node.textContent;
          node.focus();
          node.textContent = before + '游客乱敲';
          // 只读时保存路径也被 api() 的闸门挡住，这里检查"没有可编辑入口"
          return { editable: node.getAttribute('contenteditable'),
                   apiGuard: typeof guardWrite === 'function' ? guardWrite() : null,
                   changed: node.textContent !== before };
        }""")
        print("游客改正文：", changed)
        if not changed or changed.get("editable") == "true":
            problems.append("游客的正文仍然是可编辑的")
        if changed and changed.get("apiGuard"):
            problems.append("只读模式下写操作闸门没有拦住")
        guest_page.close()

        # ---------------------------------------------------- 2) 登录所有者
        owner_page = browser.new_page(viewport={"width": 1440, "height": 900})
        owner_page.goto(f"{BASE}/login", wait_until="networkidle")
        owner_page.fill("#username", DEV_USER)
        owner_page.fill("#password", DEV_PASSWORD)
        owner_page.click("button[type=submit]")
        owner_page.wait_for_load_state("networkidle")
        owner_page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        owner_page.wait_for_timeout(1200)
        viewer = owner_page.evaluate("() => document.querySelector('#userName').textContent")
        banner_now = owner_page.evaluate("() => !document.querySelector('#readonlyBar').hidden")
        print(f"所有者登录后：顶栏身份「{viewer}」· 只读条 {banner_now}")
        if banner_now:
            problems.append("所有者登录后仍然是只读")
        owner_page.screenshot(path=str(SHOTS / "owner-logged-in.png"))

        # ---------------------------------------------------- 3) 发邀请码
        status, invite = api(owner, "/api/world/collaborators/invites", "POST", {"role": "editor", "note": "点测"})
        print(f"生成邀请码 -> {status} {invite.get('code')}")
        if status != 200:
            problems.append("所有者发不了邀请码")

        # ------------------------------------- 4) 第二个用户注册并一起编辑
        friend = make_opener()
        status, payload = api(friend, "/api/world/auth/register", "POST",
                             {"username": FRIEND_USER, "password": FRIEND_PASSWORD, "invite": invite["code"]})
        if status != 200:
            # 已经注册过就用登录
            status, payload = api(friend, "/api/world/auth/login", "POST",
                                  {"username": FRIEND_USER, "password": FRIEND_PASSWORD})
        print(f"第二个用户 -> {status} 角色 {payload.get('viewer', {}).get('role')}")
        if status != 200:
            problems.append("第二个用户进不来")

        friend_page = browser.new_page(viewport={"width": 1440, "height": 900})
        friend_page.goto(f"{BASE}/login", wait_until="networkidle")
        friend_page.fill("#username", FRIEND_USER)
        friend_page.fill("#password", FRIEND_PASSWORD)
        friend_page.click("button[type=submit]")
        friend_page.wait_for_load_state("networkidle")
        friend_page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        friend_page.wait_for_timeout(1500)

        # 两边都心跳一次，再看在线状态
        api(owner, "/api/world/presence", "POST", {"document": card["id"]})
        api(friend, "/api/world/presence", "POST", {"document": card["id"]})
        _status, presence = api(friend, "/api/world/presence")
        print(f"在线人数：{presence.get('count')} -> {[p['handle'] for p in presence.get('online', [])]}")
        if presence.get("count", 0) < 2:
            problems.append("在线状态没统计到两个人")
        # 界面上应该看到别人的头像（心跳是定时+聚焦触发的，这里主动催一次）
        owner_page.evaluate("() => window.dispatchEvent(new Event('focus'))")
        owner_page.wait_for_timeout(1200)
        avatars = owner_page.evaluate("() => document.querySelectorAll('#presence .pr').length")
        print(f"所有者顶栏看到的同伴头像：{avatars}")
        if avatars < 1:
            problems.append("顶栏没有显示同伴在线")
        owner_page.screenshot(path=str(SHOTS / "presence.png"))

        # ---------------------------------------------------- 5) 版本历史
        owner_page.evaluate("""() => {
          const node = document.querySelector('.block-text');
          node.focus();
          node.innerHTML = (node.innerHTML || '') + '<p>所有者改的这一版</p>';
        }""")
        owner_page.click(".card-title")
        owner_page.wait_for_timeout(1600)
        friend_page.evaluate("""() => {
          const node = document.querySelector('.block-text');
          node.focus();
          node.innerHTML = (node.innerHTML || '') + '<p>朋友改的这一版</p>';
        }""")
        friend_page.click(".card-title")
        friend_page.wait_for_timeout(1600)

        # 为了让版本历史一定有两条，这里用接口各写一次（界面打字会有 90 秒合并）
        for opener_, mark in ((owner, "所有者这一版"), (friend, "朋友这一版")):
            current = api(opener_, f"/api/world/cards/{card['id']}")[1]
            blocks_now = current["card"]["blocks"]
            blocks_now.append({"id": f"v{len(blocks_now)}", "type": "text", "title": mark, "text": mark})
            api(opener_, f"/api/world/cards/{card['id']}", "PUT",
                {"blocks": blocks_now, "revision": current["revision"]})
        _status, versions = api(owner, f"/api/world/documents/{card['id']}/versions")
        print("版本数：", len(versions.get("versions", [])))
        if len(versions.get("versions", [])) < 2:
            problems.append("两个人改过之后版本数还是 1")

        # 界面上打开版本历史并回滚到最早那版
        owner_page.reload(wait_until="networkidle")
        owner_page.wait_for_timeout(1200)
        owner_page.evaluate("() => { window.__ws_versionDialog = true; }")
        owner_page.keyboard.press("Meta+k")
        owner_page.wait_for_timeout(400)
        owner_page.click("#plInput")
        owner_page.keyboard.type("版本历史", delay=40)
        owner_page.wait_for_timeout(700)
        print("命令面板命中：", owner_page.locator(".pl-item").count())
        owner_page.locator(".pl-item").first.click()
        owner_page.wait_for_timeout(900)
        rows = owner_page.locator("#mdBody .version-row").count()
        print("版本历史面板行数：", rows)
        if rows < 2:
            problems.append("版本历史面板没列出多个版本")
        owner_page.screenshot(path=str(SHOTS / "version-history.png"))
        owner_page.locator("#mdBody .version-row").last.locator("button:has-text('看内容')").click()
        owner_page.wait_for_timeout(700)
        preview = owner_page.evaluate("() => (document.querySelector('.version-preview')||{}).textContent || ''")
        print("预览前 40 字：", preview.strip()[:40].replace("\\n", " "))
        if not preview.strip():
            problems.append("版本预览是空的")
        owner_page.screenshot(path=str(SHOTS / "version-preview.png"))

        owner_page.on("dialog", lambda dialog: dialog.accept())
        owner_page.locator("#mdBody .version-row").last.locator("button:has-text('回滚')").click()
        owner_page.wait_for_timeout(2000)
        after = api(owner, f"/api/world/cards/{card['id']}")[1]
        body = json.dumps(after.get("card", {}).get("blocks", []), ensure_ascii=False)
        print("回滚后是否还留着朋友那一版：", "朋友改的这一版" in body)
        if "朋友改的这一版" in body:
            problems.append("回滚没有生效")

        browser.close()


    # ---------------------------------------------------- 6) 编辑冲突保护（纯接口验证）
    _status, before_versions = api(owner, f"/api/world/documents/{card['id']}/versions")
    stale_revision = api(owner, f"/api/world/cards/{card['id']}")[1]["revision"]
    blocks = api(owner, f"/api/world/cards/{card['id']}")[1]["card"]["blocks"]
    blocks.append({"id": "conflict1", "type": "text", "title": "甲", "text": "甲先写的"})
    ok = api(owner, f"/api/world/cards/{card['id']}", "PUT", {"blocks": blocks, "revision": stale_revision})
    print("甲写入 ->", ok[0])
    blocks2 = list(blocks) + [{"id": "conflict2", "type": "text", "title": "乙", "text": "乙后写的"}]
    conflict = api(friend, f"/api/world/cards/{card['id']}", "PUT",
                   {"blocks": blocks2, "revision": stale_revision})
    print("乙拿旧修订号写入 ->", conflict[0], conflict[1].get("error"))
    if conflict[0] != 409:
        problems.append(f"并发写没有触发冲突保护（{conflict[0]}）")
    body = json.dumps(conflict[1].get("card", {}).get("blocks", []), ensure_ascii=False)
    if "甲先写的" not in body:
        problems.append("冲突时没有把别人的内容带回来")
    if "乙后写的" in body:
        problems.append("冲突时还是把乙的内容写进去了")
    # 拿到新修订号就能写
    fresh = conflict[1]["revision"]
    retry = api(friend, f"/api/world/cards/{card['id']}", "PUT", {"blocks": blocks2, "revision": fresh})
    print("乙用新修订号重试 ->", retry[0])
    if retry[0] != 200:
        problems.append("拿到新修订号后仍然写不进去")


    print("\n问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
