# -*- coding: utf-8 -*-
"""账号 + 协作 + 版本历史的全流程验证。

    .venv/bin/python tools/collab_probe.py

流程：
  1) 游客：进 /world 被送去 /explore，读得到卡片、写不了（接口 401）
  2) 登录所有者：只读条消失、顶栏显示身份、正文走孤岛且可编辑
  3) 所有者发邀请码
  4) 第二个用户用邀请码注册（另一个浏览器上下文）→ 可编辑，双方互相看得到在线状态
  5) 版本历史：两个人各改一次 → 两个版本 → 预览 → 回滚
"""

from __future__ import annotations

import os
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import (  # noqa: E402
    DEV_PASSWORD, DEV_USER, ensure_login, ensure_login_page, make_opener,
)
import _island as isl  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
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


def para(bid, text):
    """一个段落块（BlockNote 原生 JSON 形状）。"""
    return {"id": bid, "type": "paragraph", "props": {}, "children": [],
            "content": [{"type": "text", "text": text, "styles": {}}]}


def doc_of(opener, doc_id):
    """正文的权威存储：BlockNote 原生 JSON。"""
    return api(opener, f"/api/world/cards/{doc_id}")[1]["card"]["blocks_doc"]


def put_doc(opener, doc_id, doc, revision=None):
    """写正文：必须走 blocks_doc——写老 ``blocks`` 会把孤岛的文档一并作废。"""
    payload = {"blocks_doc": doc}
    if revision is not None:
        payload["revision"] = revision
    return api(opener, f"/api/world/cards/{doc_id}", "PUT", payload)


def doc_text(doc):
    parts = []
    for block in doc or []:
        for item in (block.get("content") or []):
            if isinstance(item, dict):
                parts.append(item.get("text") or "")
    return " ".join(parts)


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

        # 游客视角：匿名访客进 /world 会被送去公开世界展示页 /explore——工作区（连
        # 只读条 #readonlyBar 一起）只给登录用户。真正的"只读正文"由 /s/ 站点与
        # ?embed= 只读嵌入承担，不再有"游客进工作区看只读条"这条路径。
        guest_page = browser.new_page(viewport={"width": 1440, "height": 900})
        guest_page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        guest_page.wait_for_timeout(1200)
        print(f"游客进 /world 落到：{guest_page.url}")
        if "/explore" not in guest_page.url:
            problems.append(f"游客没有被送去公开展示页（{guest_page.url}）")
        if guest_page.evaluate("() => !!document.querySelector('#readonlyBar')"):
            problems.append("匿名访客不该看到工作区的只读条")
        guest_page.screenshot(path=str(SHOTS / "guest-explore.png"))
        guest_page.close()

        # ---------------------------------------------------- 2) 登录所有者
        #    用 _auth.ensure_login_page()：它在服务端造一个会话再塞进浏览器 cookie。
        #    别在这里手敲表单——urllib 登出来的 cookie 和浏览器上下文不共享，
        #    敲完顶栏还是「登录」。
        owner_page = browser.new_page(viewport={"width": 1440, "height": 900})
        ensure_login_page(owner_page, username=DEV_USER, password=DEV_PASSWORD)
        owner_page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        owner_page.wait_for_timeout(1200)
        viewer = owner_page.evaluate("() => document.querySelector('#userName').textContent")
        banner_now = owner_page.evaluate("() => !document.querySelector('#readonlyBar').hidden")
        # 正文由孤岛渲染：编辑态看 .bn-editor 的 contenteditable（P3 起没有 .block-text）。
        editable = owner_page.evaluate("""() => Array.from(document.querySelectorAll('.bn-editor'))
            .some(n => n.getAttribute('contenteditable') === 'true')""")
        print(f"所有者登录后：顶栏身份「{viewer}」· 只读条 {banner_now} · "
              f"孤岛挂载 {isl.has_editor(owner_page)} · 正文可编辑 {editable}")
        if banner_now:
            problems.append("所有者登录后仍然是只读")
        if not editable:
            problems.append("所有者的正文不可编辑")
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
        ensure_login_page(friend_page, username=FRIEND_USER, password=FRIEND_PASSWORD)
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
        # 正文的权威存储是 blocks_doc：直接往 DOM 里塞 innerHTML 不会落库（孤岛只认
        # 自己的文档），所以这里改用接口各写一次——顺带保证版本历史一定有两个版本。
        stamp = str(int(time.time()))          # 每轮唯一，免得读到上一次运行留下的文本
        mark_owner, mark_friend = f"所有者这一版{stamp}", f"朋友这一版{stamp}"
        for opener_, mark in ((owner, mark_owner), (friend, mark_friend)):
            current = api(opener_, f"/api/world/cards/{card['id']}")[1]
            doc_now = [b for b in (current["card"]["blocks_doc"] or [])
                       if "这一版" not in doc_text([b])]
            doc_now.append(para(f"v{len(doc_now)}", mark))
            put_doc(opener_, card["id"], doc_now, revision=current["revision"])
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
        body = doc_text(doc_of(owner, card["id"]))
        print("回滚后是否还留着朋友那一版：", mark_friend in body)
        if mark_friend in body:
            problems.append("回滚没有生效")

        browser.close()


    # ---------------------------------------------------- 6) 编辑冲突保护（纯接口验证）
    _status, before_versions = api(owner, f"/api/world/documents/{card['id']}/versions")
    stale_revision = api(owner, f"/api/world/cards/{card['id']}")[1]["revision"]
    doc = api(owner, f"/api/world/cards/{card['id']}")[1]["card"]["blocks_doc"]
    doc.append(para("conflict1", "甲先写的"))
    ok = api(owner, f"/api/world/cards/{card['id']}", "PUT",
             {"blocks_doc": doc, "revision": stale_revision})
    print("甲写入 ->", ok[0])
    doc2 = list(doc) + [para("conflict2", "乙后写的")]
    conflict = api(friend, f"/api/world/cards/{card['id']}", "PUT",
                   {"blocks_doc": doc2, "revision": stale_revision})
    print("乙拿旧修订号写入 ->", conflict[0], conflict[1].get("error"))
    if conflict[0] != 409:
        problems.append(f"并发写没有触发冲突保护（{conflict[0]}）")
    body = doc_text(conflict[1].get("card", {}).get("blocks_doc"))
    if "甲先写的" not in body:
        problems.append("冲突时没有把别人的内容带回来")
    if "乙后写的" in body:
        problems.append("冲突时还是把乙的内容写进去了")
    # 拿到新修订号就能写
    fresh = conflict[1]["revision"]
    retry = api(friend, f"/api/world/cards/{card['id']}", "PUT",
                {"blocks_doc": doc2, "revision": fresh})
    print("乙用新修订号重试 ->", retry[0])
    if retry[0] != 200:
        problems.append("拿到新修订号后仍然写不进去")


    print("\n问题：", problems or "（无）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
