# -*- coding: utf-8 -*-
"""动效层回归探针。

这一层最容易犯的两类错，都在这里用机器判掉：

1. **面板内容不许有"一次性"入场动画。**
   时间线拖动/滚轮缩放时每一帧都会 renderPanels()，把 #panels 整个清空重建。
   谁在里面挂了 animation，动画就会每帧从头发一次——看上去是抖，不是动。
   所以规则是：#panels 里的元素只允许 animation-name:none，或者 infinite 的
   循环动效（循环动画被重放最多是相位跳一下，不会闪）。

2. **浮层必须"进得来也出得去"。**
   靠 hidden 属性收放的浮层，进场谁都会写；退场得靠
   transition-behavior: allow-discrete。这里实测：关掉的一瞬间元素还不能
   立刻 display:none，得先淡出。

跑法（先起好 dev server）：

    .venv/bin/python tools/motion_probe.py
    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/motion_probe.py

退出码非 0 表示动效层有问题。
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
opener = ensure_login(make_opener())

problems: list[str] = []
notes: list[str] = []


def api(path: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=25) as response:
        body = response.read()
        return json.loads(body) if body else {}


# 面板里所有"有限次"动画都算问题
FINITE_IN_PANELS_JS = r"""
() => {
  const host = document.querySelector('#panels');
  if (!host) return {missing: true, hits: []};
  const hits = [];
  host.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    const names = cs.animationName.split(',').map((s) => s.trim()).filter((s) => s && s !== 'none');
    if (!names.length) return;
    const counts = cs.animationIterationCount.split(',').map((s) => s.trim());
    const allInfinite = counts.every((c) => c === 'infinite');
    if (allInfinite) return;
    hits.push({
      cls: (el.getAttribute('class') || el.tagName).slice(0, 70),
      names: names.join(','),
      counts: counts.join(','),
      duration: cs.animationDuration,
    });
  });
  return {missing: false, hits};
}
"""

# 关掉浮层之后，第一个 40ms 里它还得是"在淡出"而不是"已经没了"
EXIT_JS = r"""
(sel) => new Promise((resolve) => {
  const el = document.querySelector(sel);
  if (!el) { resolve({missing: true}); return; }
  el.hidden = true;
  requestAnimationFrame(() => {
    const cs = getComputedStyle(el);
    resolve({missing: false, display: cs.display, opacity: +(+cs.opacity).toFixed(3)});
  });
});
"""


def check_panels(page, label: str):
    result = page.evaluate(FINITE_IN_PANELS_JS)
    if result.get("missing"):
        notes.append(f"  · {label}：没有 #panels（跳过）")
        return
    for hit in result["hits"]:
        problems.append(
            f"  {label} · #panels 里的 .{hit['cls']} 挂了有限次动画 "
            f"{hit['names']} ({hit['duration']} × {hit['counts']})"
            "——renderPanels() 一重建就会重放")


def check_exit(page, sel: str, label: str):
    result = page.evaluate(EXIT_JS, sel)
    if result.get("missing"):
        problems.append(f"  {label}：找不到 {sel}")
        return
    if result["display"] == "none":
        problems.append(
            f"  {label} · {sel} 关掉时是「啪」地消失（display:none 立刻生效），"
            "没有退场过渡——检查 transition-behavior: allow-discrete")
        return
    notes.append(f"  ✓ {label} · {sel} 关掉后仍在淡出（opacity={result['opacity']}）")


def main() -> int:
    scratch: list[tuple[int, str]] = []
    for doc_type in ("table", "board", "radar", "todo", "dictionary", "canvas"):
        try:
            created = api("/api/world/documents", "POST",
                          {"type": doc_type, "name": f"动效探针 · {doc_type}"})
            scratch.append((created["id"], doc_type))
        except Exception as exc:                                   # noqa: BLE001
            print(f"  ! 建 {doc_type} 失败：{exc}")

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True, args=["--disable-dev-shm-usage"])
            ctx = browser.new_context(viewport={"width": 1512, "height": 900},
                                      locale="zh-CN")
            page = ctx.new_page()
            ensure_login_page(page)

            print("· 面板内容不许有一次性动画")
            page.goto(f"{BASE}/world", wait_until="networkidle")
            page.wait_for_timeout(900)
            for doc_id, name in [(109, "card"), (115, "timeline"), (117, "map"),
                                 (160, "graph"), (116, "familyTree")] + \
                                [(i, t) for i, t in scratch]:
                page.goto(f"{BASE}/world#doc={doc_id}", wait_until="networkidle")
                page.wait_for_timeout(1300)
                check_panels(page, name)

            print("· 浮层出入场")
            page.goto(f"{BASE}/world", wait_until="networkidle")
            page.wait_for_timeout(900)

            # 模态框：打开 → 确认在动 → 关掉 → 确认在淡出
            page.evaluate("() => document.querySelector('#typesBtn').click()")
            page.wait_for_timeout(700)
            check_exit(page, "#modal", "模态框")

            page.wait_for_timeout(600)
            page.evaluate("() => document.querySelector('#mdClose').click()")
            page.wait_for_timeout(600)
            page.keyboard.press("Meta+k")
            page.wait_for_timeout(600)
            check_exit(page, "#palette", "命令面板")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)

            page.evaluate("""() => {
              const row = document.querySelector('.sb-tree .row');
              if (!row) return;
              const r = row.getBoundingClientRect();
              row.dispatchEvent(new MouseEvent('contextmenu',
                {bubbles: true, clientX: r.left + 30, clientY: r.top + 10}));
            }""")
            page.wait_for_timeout(500)
            check_exit(page, "#ctxMenu", "右键菜单")
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

            page.evaluate("() => { document.querySelector('#toast').hidden = false; }")
            page.wait_for_timeout(260)
            check_exit(page, "#toast", "提示条")

            print("· 减少动效：系统开关打开后应当全部让路")
            ctx_reduced = browser.new_context(viewport={"width": 1512, "height": 900},
                                              locale="zh-CN", reduced_motion="reduce")
            page_reduced = ctx_reduced.new_page()
            ensure_login_page(page_reduced)
            page_reduced.goto(f"{BASE}/world", wait_until="networkidle")
            page_reduced.wait_for_timeout(900)
            page_reduced.evaluate("() => document.querySelector('#typesBtn').click()")
            page_reduced.wait_for_timeout(400)
            left = page_reduced.evaluate(r"""() => {
              const bad = [];
              document.querySelectorAll('*').forEach((el) => {
                const cs = getComputedStyle(el);
                const names = cs.animationName.split(',').filter((s) => s && s.trim() !== 'none');
                const dur = parseFloat(cs.animationDuration) || 0;
                const tds = cs.transitionDuration.split(',').map((s) => parseFloat(s) || 0);
                if (names.length && dur > 0.01) bad.push('anim ' + el.className);
                if (Math.max.apply(null, tds) > 0.01) bad.push('trans ' + el.className);
              });
              return bad.slice(0, 8);
            }""")
            if left:
                problems.append("  减少动效模式下仍有元素在动：" + "; ".join(left))
            else:
                notes.append("  ✓ 减少动效模式下没有任何动画/过渡在跑")
            ctx_reduced.close()
            browser.close()
    finally:
        for doc_id, _ in scratch:
            try:
                api(f"/api/world/documents/{doc_id}", "DELETE")
            except Exception:                                      # noqa: BLE001
                pass
        print(f"· 已清理 {len(scratch)} 份临时文档")

    print()
    for line in notes:
        print(line)
    if problems:
        print("\n发现问题：")
        print("\n".join(problems))
        return 1
    print("\n动效层检查全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
