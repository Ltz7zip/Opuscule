# -*- coding: utf-8 -*-
"""外观巡检：逐屏截图 + 「文字出框」审计（按钮里的字被容器裁掉/挤出边界）。

跑法（先起好 dev server）：

    .venv/bin/python tools/ui_polish_probe.py
    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/ui_polish_probe.py

产出：/tmp/ui_shots/*.png 与终端报告。退出码非 0 表示发现了出框问题。
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

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
SHOTS = pathlib.Path("/tmp/ui_shots")
SHOTS.mkdir(exist_ok=True)
opener = make_opener()
ensure_login(opener)


def api(path: str, method: str = "GET", payload: dict | None = None):
    """带登录 cookie 的 JSON 调用（照 _auth.make_opener 的登录态）。"""
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=20) as response:
        return json.loads(response.read() or b"{}")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


# 会「装文字」的容器：只要里面的字超出自己的盒子，就是出框
AUDIT_JS = r"""
() => {
  const SEL = [
    '.mini-btn', '.tb-btn', '.tb-view', '.sb-new', '.icon-btn', '.badge', '.chip',
    '.tab', '.sb-icon', '.world-chip', '.user-chip', '.sb-search', '.tl-mini',
    '.sel-btn', '.insert-btn', '.fb-menu button', '.ctx button', '.fb-actions button',
    'button', '.pill', '.state-chip', '.seg-btn', '.era-chip', '.rt-tool', '.rt-btn',
  ].join(',');
  const out = [];
  const seen = new Set();
  document.querySelectorAll(SEL).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
    // 有意省略的（ellipsis / 单行截断）不算 bug
    if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') return;
    const clippedX = el.scrollWidth - el.clientWidth;
    const clippedY = el.scrollHeight - el.clientHeight;
    // 子元素（含文字 span）有没有捅出容器的边框盒
    let worst = 0;
    let worstWho = '';
    const box = el.getBoundingClientRect();
    el.querySelectorAll('*').forEach((kid) => {
      const kr = kid.getBoundingClientRect();
      if (kr.width < 1 || kr.height < 1) return;
      const spill = Math.max(kr.right - box.right, box.left - kr.left,
                             kr.bottom - box.bottom, box.top - kr.top);
      if (spill > worst) { worst = spill; worstWho = (kid.className || kid.tagName).toString(); }
    });
    if (clippedX > 1 || clippedY > 1 || worst > 1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24),
        w: Math.round(rect.width), h: Math.round(rect.height),
        clippedX, clippedY,
        spill: Math.round(worst), spillWho: String(worstWho).slice(0, 40),
        overflow: cs.overflow, whiteSpace: cs.whiteSpace,
      });
    }
  });
  return out;
}
"""

# 盒子几何：圆钮不许被 flex 压成椭圆、侧栏底部那三个动作必须是一行
SHAPE_JS = r"""
() => {
  const problems = [];

  // 1) border-radius: 50% 的盒子，宽高必须相等——不等就是"圆被压成椭圆"
  //    （侧栏那个 32×32 的「⇕」曾经被挤成 9×32）
  const circles = [];
  document.querySelectorAll('button, [class*="avatar"], [class*="icon"], .pr, .b-dot, .mm-dot, .swatch-btn')
    .forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!cs.borderRadius.startsWith('50%')) return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (r.width < 1 || r.height < 1) return;
      if (Math.abs(r.width - r.height) <= 1.5) return;
      circles.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });

  // 2) 侧栏底部三个动作：应该排成一行（竖排 = 折行了，看着像三个散字）
  const foot = document.querySelector('.sb-foot');
  const footRows = foot
    ? new Set([...foot.querySelectorAll('.sb-new')].map((b) => Math.round(b.getBoundingClientRect().top))).size
    : 0;

  return { circles, footRows };
}
"""


def main() -> int:
    state = api("/api/world/state")
    docs = flat(state["documents"])
    by_type = {}
    for doc in docs:
        by_type.setdefault(doc["type"], doc)
    card = by_type.get("card") or docs[0]
    timeline = by_type.get("timeline") or card

    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1000})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        ensure_login_page(page)

        def audit(label):
            found = page.evaluate(AUDIT_JS)
            if found:
                print(f"  ⚠ {label} 出框 {len(found)} 处")
                for item in found[:8]:
                    print(f"      {item}")
                    problems.append(f"{label} · {item['tag']}.{item['cls']} 「{item['text']}」 "
                                    f"裁切 x{item['clippedX']}/y{item['clippedY']} 溢出 {item['spill']}px ({item['spillWho']})")
            else:
                print(f"  ✓ {label} 无出框")

        def visit(label, url, wait=2000, *, full=False):
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(wait)
            page.screenshot(path=str(SHOTS / f"{label}.png"), full_page=full)
            print(f"  截图 → /tmp/ui_shots/{label}.png")
            audit(label)
            shape(label)

        def shape(label):
            """盒子几何：圆钮被压成椭圆 / 侧栏底部折行，都算显示错误。"""
            data = page.evaluate(SHAPE_JS)
            if data["circles"]:
                problems.append(f"{label} · 圆钮被压成椭圆：{data['circles']}")
                print(f"  ⚠ {label} 椭圆：{data['circles']}")
            for key, text in (("footRows", "侧栏底部三个动作折行了"),):
                if data[key] > 1:
                    problems.append(f"{label} · {text}（{data[key]} 行）")
                    print(f"  ⚠ {label} {text}（{data[key]} 行）")

        # ---- 主界面 ----
        graph = by_type.get("graph")
        visits = [
            ("01-工作区-卡片", f"{BASE}/world#doc={card['id']}", 2200),
            ("02-工作区-时间线", f"{BASE}/world#doc={timeline['id']}", 2600),
        ]
        if graph:
            visits.append(("18-世界图谱", f"{BASE}/world#doc={graph['id']}", 2600))
        visits.append(("04-关系树", f"{BASE}/relationship", 2400))
        for label, url, wait in visits:
            visit(label, url, wait)

        # ---- 空状态（一篇都没打开时的引导页）----
        page.goto(f"{BASE}/world", wait_until="networkidle")
        page.evaluate("try { localStorage.clear(); } catch (e) {}")
        page.goto(f"{BASE}/world?empty=1", wait_until="networkidle")
        page.wait_for_timeout(1800)
        page.screenshot(path=str(SHOTS / "19-空状态.png"))
        print("  截图 → /tmp/ui_shots/19-空状态.png")
        audit("19-空状态")

        # ---- 浅色主题（世界主题的另一半也必须好看）----
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.evaluate("document.documentElement.dataset.theme = 'light'")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / "07-浅色-卡片.png"))
        print("  截图 → /tmp/ui_shots/07-浅色-卡片.png")
        audit("07-浅色-卡片")
        page.evaluate("document.documentElement.dataset.theme = 'dark'")   # 切回来，别影响后面的浮层

        # ---- 各种浮层 ----
        for index, (label, opener_js, wait) in enumerate([
            ("08-命令面板", "document.querySelector('#paletteBtn').click()", 800),
            ("09-类型面板", "document.querySelector('#typesBtn').click()", 1200),
            ("10-纪元面板", "document.querySelector('#erasBtn').click()", 1200),
            ("11-回收站", "document.querySelector('#trashBtn').click()", 1200),
            ("12-建议", "document.querySelector('#suggestBtn').click()", 1400),
            ("13-导入导出", "document.querySelector('#exchangeBtn').click()", 1200),
            ("14-模板新建", "document.querySelector('#templateBtn').click()", 1200),
            ("15-世界菜单", "document.querySelector('#worldChip').click()", 1200),
            ("16-账号菜单", "document.querySelector('#userChip').click()", 1200),
            # 「?」在无头浏览器里响不了（合成键盘事件过不了它的事件目标判断），
            # 走真实入口：命令面板 → 快捷键一览
            ("17-快捷键", """(() => {
                document.querySelector('#paletteBtn').click();
                setTimeout(() => {
                  const hit = [...document.querySelectorAll('#plList .pl-item')]
                    .find((el) => el.textContent.includes('快捷键'));
                  if (hit) hit.click();
                }, 400);
            })()""", 1600),
        ]):
            # 带上不同的 query，保证每次都真的重新加载（hash 相同的 goto 不会重载）
            page.goto(f"{BASE}/world?panel={index}#doc={card['id']}", wait_until="networkidle")
            page.wait_for_timeout(1600)
            try:
                page.evaluate(opener_js)
                page.wait_for_timeout(wait)
            except Exception as exc:                       # 面板没开出来也要留个记录
                problems.append(f"{label} 打不开：{exc}")
                continue
            opened = page.evaluate("""() => {
              const box = document.querySelector('#modal:not([hidden]), #palette:not([hidden]), .ctx:not([hidden])');
              if (!box) return '';
              if (box.id === 'palette') return '命令面板';
              const head = box.querySelector('.md-head h2');
              return (head ? head.textContent : '右键菜单').trim();
            }""")
            if not opened:
                problems.append(f"{label} 点开后没有浮层出现")
            page.screenshot(path=str(SHOTS / f"{label}.png"))
            print(f"  截图 → /tmp/ui_shots/{label}.png（{opened or '？？'}）")
            audit(label)
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)

        # ---- 每种文档都过一遍（工具类文档里的按钮最容易挤字）----
        # 缺的文档现建，跑完收进回收站，别把演示数据搞脏
        made: list[dict] = []
        for kind, name in [
            ("table", "巡检表格"), ("board", "巡检看板"), ("canvas", "巡检画布"),
            ("dictionary", "巡检词典"), ("todo", "巡检待办"), ("dice", "巡检骰子"),
            ("radar", "巡检雷达"), ("chapter", "巡检章节"), ("embed", "巡检嵌入"),
            ("soundscape", "巡检环境音"), ("media", "巡检媒体"),
        ]:
            doc = by_type.get(kind)
            if doc is None:
                doc = api("/api/world/documents", "POST", {"type": kind, "name": name})
                made.append(doc)
            by_type[kind] = doc

        sweep = [(f"20-{kind}", by_type[kind]) for kind in
                 ("table", "board", "canvas", "dictionary", "todo", "dice",
                  "radar", "chapter", "embed", "soundscape", "media")]
        for kind in ("map", "familyTree", "folder"):
            if by_type.get(kind):
                sweep.append((f"20-{kind}", by_type[kind]))
        for label, doc in sweep:
            visit(f"{label}-{doc['name']}", f"{BASE}/world#doc={doc['id']}", 1800)

        for doc in made:                                   # 收尾：建出来的临时文档进回收站
            try:
                opener.open(urllib.request.Request(
                    f"{BASE}/api/world/documents/{doc['id']}", method="DELETE"), timeout=20).read()
            except Exception as exc:
                print("  清理临时文档失败：", doc["id"], exc)

        # ---- 小屏 ----
        for label, width, height in [("05-窄屏-1280", 1280, 820), ("06-手机-390", 390, 844)]:
            page.set_viewport_size({"width": width, "height": height})
            visit(label, f"{BASE}/world#doc={card['id']}", 2200)
        page.set_viewport_size({"width": 1680, "height": 1000})

        # ---- 结构性断言：外壳改动最容易踩的两个坑 ----
        # 1) 手机抽屉必须**在遮罩之上**：给 .app 加 z-index 会造出层叠上下文，
        #    把抽屉（fixed 60）压到遮罩（body 下 55）底下，抽屉就点不动了。
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/world?drawer=1#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.click('.bottom-nav button[data-mobile="world"]')
        page.wait_for_timeout(600)
        drawer = page.evaluate("""() => {
          const side = document.querySelector('.sidebar');
          const r = side.getBoundingClientRect();
          const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
          return { open: side.className.includes('is-open'), inside: side.contains(hit),
                   hit: hit ? (hit.className || hit.tagName).toString().slice(0, 30) : null };
        }""")
        if not (drawer["open"] and drawer["inside"]):
            problems.append(f"手机抽屉被遮罩盖住（命中 {drawer['hit']}），点不动")
        else:
            print(f"  ✓ 手机抽屉可点（命中 {drawer['hit']}）")
        page.screenshot(path=str(SHOTS / "21-手机-侧栏抽屉.png"))

        # 2) 页面底不再有装饰性渐变。
        #    终端风格界面不发光，层次全部来自 1px 发丝线与表面明度，
        #    所以这里断言 body 上**没有**渐变，防止哪天又有人在页面底刷一层环境光。
        page.set_viewport_size({"width": 1680, "height": 1000})
        page.goto(f"{BASE}/world#doc={card['id']}", wait_until="networkidle")
        page.wait_for_timeout(1800)
        ambience = page.evaluate("getComputedStyle(document.body).backgroundImage")
        if "gradient" in ambience:
            problems.append(
                "页面底出现了装饰性渐变（%s…）——终端风格界面不允许，"
                "层次应当来自发丝线与表面明度" % ambience[:60])
        else:
            print("  ✓ 页面底没有装饰性渐变（终端风格界面不发光）")

        browser.close()

    print("\n控制台报错：", errors[:3] or "（无）")
    print("出框问题：", len(problems))
    for item in problems:
        print("  -", item)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
