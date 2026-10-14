# -*- coding: utf-8 -*-
"""工具类文档的验证：表格双向绑定 + 看板 / 画布 / 词典 / 待办 / 骰子 / 雷达 / 章节 / 嵌入。

跑完会把自己建的占用文档收进回收站；想留着看效果就 REUSE=1。
"""
from __future__ import annotations
import json, os, pathlib, sys, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
REUSE = os.environ.get("REUSE") == "1"
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

created = []

def make_doc(kind, name):
    existing = [d for d in flat(api("/api/world/state")["documents"]) if d["type"] == kind]
    if existing:
        return existing[0]
    doc = api("/api/world/documents", "POST", {"type": kind, "name": name})
    created.append(doc)          # 记下来，收尾时清理
    return doc

problems = []
state = api("/api/world/state")
card = next(d for d in flat(state["documents"]) if d["type"] == "card")
table = make_doc("table", "自动点测表格")

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page(viewport={"width": 1500, "height": 950})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    ensure_login_page(page)

    # ---------- 表格 ----------
    page.goto(f"{BASE}/world#doc={table['id']}", wait_until="networkidle")
    page.wait_for_timeout(1800)
    rows = page.locator(".table-grid tbody tr").count()
    cols = page.locator(".table-grid thead th").count()
    print(f"表格：{rows} 行 · {cols} 列（含名称与操作列）")
    if rows < 1 or cols < 3:
        problems.append("表格没有渲染出行列")
    page.screenshot(path=str(SHOTS / "table_tool.png"))

    # 改一个单元格 -> 卡片属性跟着变
    first_input = page.locator(".table-grid tbody tr").first.locator("td input.mini-input").nth(1)
    if first_input.count():
        row_name = page.locator(".table-grid tbody tr").first.locator("input.mini-input").first.input_value()
        first_input.fill("77")
        first_input.press("Enter")
        page.wait_for_timeout(1200)
        row_id = next(r["id"] for r in api(f"/api/world/tables/{table['id']}")["rows"] if r["name"] == row_name)
        payload = api(f"/api/world/cards/{row_id}")
        values = json.dumps(payload["card"]["values"], ensure_ascii=False)
        print(f"改单元格后卡片属性：{values[:60]}")
        if "77" not in values:
            problems.append("改单元格没有写回卡片属性")

    # ---------- 其余工具：能打开、能建数据、能落库 ----------
    for kind, name, action in [
        ("board", "自动点测看板", "看板"),
        ("canvas", "自动点测画布", "画布"),
        ("dictionary", "自动点测词典", "词典"),
        ("todo", "自动点测待办", "待办清单"),
        ("dice", "自动点测骰子", "骰子"),
        ("radar", "自动点测雷达", "雷达图"),
        ("chapter", "自动点测章节", "章节"),
        ("embed", "自动点测嵌入", "链接嵌入"),
        ("soundscape", "自动点测环境音", "环境音"),
        ("media", "自动点测媒体", "媒体库"),
    ]:
        doc = make_doc(kind, name)
        page.goto(f"{BASE}/world#doc={doc['id']}", wait_until="networkidle")
        page.wait_for_timeout(1400)
        has_shell = page.locator(".tool-view").count()
        hint = page.locator(".tool-hint").first.inner_text()[:24] if page.locator(".tool-hint").count() else ""
        print(f"{action}：外壳 {bool(has_shell)} · {hint}")
        if not has_shell:
            problems.append(f"{action} 没有渲染出工具界面")
        # 通用动作：点第一个主按钮（新建/加一列/录音/加一层…）
        primary = page.locator(".tool-actions .mini-btn.is-primary")
        if primary.count():
            try:
                primary.first.click()
                page.wait_for_timeout(600)
                # 新建动作的名字改由应用内浮层问（window.prompt 在内嵌 WebView 里不可用）
                if page.locator(".picker-head input").count():
                    page.fill(".picker-head input", "点测项")
                    page.click(".picker-foot .mini-btn.is-primary")
                page.wait_for_timeout(1400)
            except Exception as exc:
                problems.append(f"{action} 主按钮点不动：{exc}")
        page.screenshot(path=str(SHOTS / f"tool_{kind}.png"))

    # 数据落库检查
    board = make_doc("board", "自动点测看板")
    data = api(f"/api/world/documents/{board['id']}/data")["data"]
    print("看板数据：", json.dumps(data, ensure_ascii=False)[:80])
    if not data.get("columns"):
        problems.append("看板没有把列存下来")
    b.close()

# 收尾：这个探针是拿**真实数据库**当试验场的，跑完必须把自己建的占位文档收进回收站，
# 否则左侧文档树里会堆一排 "自动点测XXX"，看着像一堆没人用的功能入口。
# 只删这次新建的（已有的同名文档是用户的东西，不动）；REUSE=1 时连新建的都留着。
if not REUSE:
    for doc in created:
        try:
            req = urllib.request.Request(f"{BASE}/api/world/documents/{doc['id']}", method="DELETE")
            with opener.open(req, timeout=20) as response:
                response.read()
        except Exception as exc:                       # 清理失败不该掩盖探针结果
            print("清理失败：", doc["id"], exc)
    if created:
        print(f"已把 {len(created)} 篇点测文档收进回收站（回收站里点「还原」就能拿回来）")

print("报错：", errs[:2] or "（无）")
print("问题：", problems or "（无）")
