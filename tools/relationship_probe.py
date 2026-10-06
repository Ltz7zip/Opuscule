# -*- coding: utf-8 -*-
"""关系树（/relationship）的端到端探针。

走一遍真实用户路径，每一步都断言"看得见的结果"，而不是"接口返回了 200"：

1. 模版选择屏：五种模版都在，点一下右侧示意图真的跟着换；
2. 模版关系屏：图2 那份关系清单在，能停用 / 删除 / 加一条自己的；
3. 创建：勾了"示例人物"之后画布上真的有那 9 个人、10 条线；
4. 网格：每张卡片的 left/top 都是网格整数倍（"边框严格贴网格"），拖完仍然吸附；
5. 右键菜单：空白处右键能长出"在此添加人物 / 在此处添加备注"；
6. 卡片四面加号：点一下弹关系菜单（图6），选一条就长出一个人；
7. 拖加号连线：按住加号拖到另一张卡上，连出一条线；
8. 关系线不被网格约束：线端点落在卡片锚点上，允许不是网格整数倍。

用法：先跑 ``manage.py runserver 8000``，再 ``.venv/bin/python tools/relationship_probe.py``。
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = "http://127.0.0.1:8000"
SHOTS = pathlib.Path("/tmp/relationship_shots")
SHOTS.mkdir(exist_ok=True)

opener = make_opener()
ensure_login(opener)

problems: list[str] = []
passed = 0


def api(path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                     headers={"Content-Type": "application/json"})
    with opener.open(request, timeout=25) as response:
        return json.loads(response.read() or b"{}")


def check(condition, message):
    """message 写成"应该成立的事实"，成功失败都读得通。"""
    global passed
    if condition:
        passed += 1
        print("  ok  " + message)
    else:
        problems.append(message)
        print("  !!  " + message)


def has_offgrid(path_d: str, step: int) -> bool:
    """路径里有没有"不是网格整数倍"的坐标——有，说明线没被网格绑住。"""
    for raw in re.findall(r"-?\d+(?:\.\d+)?", path_d or ""):
        value = float(raw) % step
        if value > 0.01 and abs(value - step) > 0.01:
            return True
    return False


def _scale_of(page) -> float:
    transform = page.evaluate("() => document.getElementById('rtGrid').style.transform")
    hit = re.search(r"scale\(([\d.]+)\)", transform or "")
    return float(hit.group(1)) if hit else 1.0


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1560, "height": 960})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
    ensure_login_page(page)

    # ---------------------------------------------------------- 1) 模版选择屏
    page.goto(f"{BASE}/relationship", wait_until="networkidle")
    page.wait_for_timeout(500)
    print("\n[1] 模版选择屏")
    items = page.locator(".rt-template-item")
    check(items.count() == 5, f"左侧列出 5 个模版（实际 {items.count()}）")
    labels = [items.nth(i).inner_text().split("\n")[0] for i in range(items.count())]
    check(labels == ["家庭", "公司", "军事", "皇家宫廷", "从空白开始"], f"模版顺序：{labels}")
    check(page.locator("#rtPickerCanvas .rt-node").count() == 9, "家庭模版示意图画出 9 个人")
    check(page.locator("#rtPickerCanvas .rt-edge").count() == 10, "家庭模版示意图画出 10 条关系")
    page.screenshot(path=str(SHOTS / "1-picker.png"))

    items.nth(2).click()
    page.wait_for_timeout(300)
    check(page.locator("#rtPickerCanvas .rt-node").count() == 7, "切到「军事」后示意图换成 7 个人")
    items.nth(0).click()
    page.wait_for_timeout(250)

    # ------------------------------------------------------ 2) 模版关系屏（图2）
    print("\n[2] 模版关系屏")
    page.click("#rtContinue")
    page.wait_for_timeout(400)
    rows = page.locator(".rt-relation-row")
    check(rows.count() == 8, f"家庭模版自带 8 条现成关系（实际 {rows.count()}）")
    texts = [rows.nth(i).inner_text().split("\n")[0] for i in range(rows.count())]
    check(texts == ["父母", "子女", "伴侣", "前任", "兄弟姐妹",
                    "同父异母/同母异父兄弟姐妹", "养父母/养子女", "继父母"],
          f"关系清单与设计稿一致：{texts}")
    page.screenshot(path=str(SHOTS / "2-template.png"))

    # 停用一条 + 删一条 + 加一条自定义
    rows.nth(0).locator('[data-act="toggle"]').click()
    page.wait_for_timeout(150)
    check(page.locator(".rt-relation-row.is-off").count() == 1, "停用后有一条关系变灰")
    rows.nth(7).locator('[data-act="remove"]').click()
    page.wait_for_timeout(150)
    check(page.locator(".rt-relation-row").count() == 7, "删掉一条后剩 7 条")
    page.once("dialog", lambda d: d.accept("教父"))
    page.click("#rtAddRelation")
    page.wait_for_timeout(250)
    check(page.locator(".rt-relation-row").count() == 8, "加完自定义关系回到 8 条")
    check("教父" in page.locator(".rt-relation-list").inner_text(), "自定义关系「教父」出现在清单里")

    # ------------------------------------------------------------ 3) 创建
    print("\n[3] 创建关系树（带示例人物）")
    page.click("#rtCreate")
    page.wait_for_url("**/relationship?doc=*", timeout=15000)
    page.wait_for_timeout(1200)
    doc_id = int(page.url.split("doc=")[-1])
    check(page.locator("#rtNodes .rt-node").count() == 9, "编辑区画布上有 9 个人")
    check(page.locator("#rtEdges .rt-edge").count() == 10, "编辑区画布上有 10 条关系线")
    state = api(f"/api/world/relationship/trees/{doc_id}")
    relations = state["variant"]["relations"]
    check(len(relations) == 8, "创建后关系清单带着第二步改过的 8 条")
    check(any(r["label"] == "教父" for r in relations), "自定义关系落库了")
    check(relations[0]["kind"] == "parent" and relations[0]["enabled"] is False,
          "被停用的「父母」落库时保留 enabled=False")
    page.screenshot(path=str(SHOTS / "3-editor.png"))

    # ------------------------------------------------------- 4) 网格吸附
    print("\n[4] 卡片边框严格贴网格")
    step = state["grid"]["grid"]
    boxes = page.eval_on_selector_all(
        "#rtNodes .rt-node",
        "els => els.map(e => ({left: parseFloat(e.style.left), top: parseFloat(e.style.top)}))")
    bad = [b for b in boxes if b["left"] % step or b["top"] % step]
    check(not bad, f"每张卡片的落点都是网格整数倍（网格 {step}px，越界 {len(bad)} 张）")
    scale = _scale_of(page)
    # offsetWidth 是**布局尺寸**，不受画布缩放影响，所以直接拿它比网格
    size = page.eval_on_selector("#rtNodes .rt-node", "e => ({w: e.offsetWidth, h: e.offsetHeight})")
    check(size["w"] % step == 0 and size["h"] % step == 0,
          f"卡片宽高是网格整数倍（{size['w']}×{size['h']}px，网格 {step}px，当前缩放 {scale:.3f}）")

    first = page.locator("#rtNodes .rt-node").first
    box = first.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 30)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2 + 61, box["y"] + 30 + 47, steps=8)
    page.mouse.up()
    page.wait_for_timeout(900)
    moved = page.eval_on_selector("#rtNodes .rt-node",
                                  "e => ({left: parseFloat(e.style.left), top: parseFloat(e.style.top)})")
    check(moved["left"] % step == 0 and moved["top"] % step == 0,
          f"拖动松手后卡片吸附回网格：{moved}")

    # ------------------------------------------------- 5) 右键菜单（图5）
    print("\n[5] 右键添加人物 / 备注")
    wrap = page.locator("#rtCanvasWrap").bounding_box()
    page.mouse.click(wrap["x"] + wrap["width"] - 150, wrap["y"] + wrap["height"] - 120, button="right")
    page.wait_for_timeout(300)
    check(page.locator("#rtContextMenu").is_visible(), "空白处右键弹出菜单")
    menu_text = page.locator("#rtContextMenu").inner_text()
    check("在此添加人物" in menu_text and "在此处添加备注" in menu_text, "菜单两项文案与图5 一致")
    page.screenshot(path=str(SHOTS / "4-context-menu.png"))
    before = page.locator("#rtNodes .rt-node").count()
    page.locator('#rtContextMenu [data-menu="person"]').click()
    page.wait_for_timeout(900)
    after = page.locator("#rtNodes .rt-node").count()
    check(after == before + 1, f"「在此添加人物」长出一张新卡片（{before} → {after}）")
    check(page.locator(".rt-name-input").count() == 1, "新卡片直接进入命名状态")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # --------------------------------------------------- 6) 加号 → 关系菜单
    print("\n[6] 点加号新建人物并选关系")
    host = page.locator("#rtNodes .rt-node").first
    host.hover()
    page.wait_for_timeout(200)
    host.locator('.rt-handle[data-side="e"]').click(force=True)
    page.wait_for_timeout(400)
    check(page.locator("#rtRelationsPop").is_visible(), "点加号弹出关系菜单（图6）")
    pop_text = page.locator("#rtRelationsPop").inner_text()
    check("创建自定义" in pop_text and "链接现有人员" in pop_text and "暂时跳过" in pop_text,
          "关系菜单底部三项齐全")
    entries = page.locator("#rtRelationsPop .rt-pop-item").count()
    check(entries == 7, f"被停用的「父母」不进快捷菜单（7 条可用 + 教父 = 7，实际 {entries}）")
    page.screenshot(path=str(SHOTS / "5-relations-pop.png"))
    before = page.locator("#rtNodes .rt-node").count()
    page.locator("#rtRelationsPop .rt-pop-item").first.click()
    page.wait_for_timeout(1200)
    after = page.locator("#rtNodes .rt-node").count()
    check(after == before + 1, f"选一条关系后长出新的人（{before} → {after}）")

    # ------------------------------------------------ 7) 拖加号连线（图6/7）
    print("\n[7] 按住加号拖到另一张卡上连线")
    nodes = page.locator("#rtNodes .rt-node")
    source_el, target_el = nodes.nth(1), nodes.nth(2)
    source_el.hover()
    page.wait_for_timeout(200)
    before_edges = page.locator("#rtEdges .rt-edge").count()
    handle = source_el.locator('.rt-handle[data-side="s"]')
    hbox, tbox = handle.bounding_box(), target_el.bounding_box()
    page.mouse.move(hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2)
    page.mouse.down()
    page.mouse.move(tbox["x"] + tbox["width"] / 2, tbox["y"] + tbox["height"] / 2, steps=14)
    page.wait_for_timeout(150)
    check(page.locator(".rt-node.is-drop-target").count() >= 1, "拖到目标卡上时目标卡高亮")
    page.mouse.up()
    page.wait_for_timeout(400)
    check(page.locator("#rtRelationsPop").is_visible(), "在目标卡上松手弹出关系菜单")
    page.locator("#rtRelationsPop .rt-pop-item").nth(2).click()
    page.wait_for_timeout(1000)
    after_edges = page.locator("#rtEdges .rt-edge").count()
    check(after_edges == before_edges + 1, f"选完关系连出新线（{before_edges} → {after_edges}）")
    page.screenshot(path=str(SHOTS / "6-linked.png"))

    # ------------------------------------- 8) 关系线不被网格约束（图7 的意思）
    print("\n[8] 关系线落在卡片锚点，允许非网格坐标")
    paths = page.eval_on_selector_all("#rtEdges .rt-edge", "els => els.map(e => e.getAttribute('d'))")
    check(len(paths) == after_edges, f"每条边都画出来了（{len(paths)} 条）")
    check(any(has_offgrid(d, step) for d in paths),
          "线的坐标不全在网格上——说明线没被网格绑住，和设计稿一致")

    page.wait_for_timeout(400)
    check(not errors, f"整轮操作没有 JS 报错（{errors[:3]}）")

    browser.close()
    # 探针自己建的树用完就删，别把开发库堆满
    try:
        api(f"/api/world/documents/{doc_id}?hard=1", "DELETE")
    except Exception as exc:                      # noqa: BLE001 - 清理失败不影响结论
        print("（清理探针文档失败：%s）" % exc)

print(f"\n通过 {passed} 项；截图在 {SHOTS}")
if problems:
    print(f"失败 {len(problems)} 项：")
    for item in problems:
        print(" - " + item)
    sys.exit(1)
print("全部通过 ✅")
