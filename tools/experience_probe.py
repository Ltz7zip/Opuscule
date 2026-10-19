# -*- coding: utf-8 -*-
"""全链路体验层的回归探针。

这一层最容易被后来的人"顺手改坏"的地方，都在这里用机器判掉：

  启动屏：一次会话只演一次，且 900ms 内必须收（绝不能挡路）
  骨架屏：接口慢的时候才浮出来，快的时候不许闪
  导航进度线：点了站内链接要出线，页面回来要收线
  切标签页：扫描线元素存在，且**不在 #panels 里**（否则每帧重放）
  Ripple：按下要有波纹，减少动效时不许有
  分级 Toast：[OK] / [WARN] / [ERR] 三种符号 + 撤销按钮 + 最多三条
  通知中心：铃铛有未读 badge，点开有行，Esc 能关
  404：说人话（"信号丢失" / "已经不在站点上了"），不是裸错误
  离线徽标：断网时出现，恢复后消失
  滚动显现：首屏不做动画，首屏之下先藏后现
  减少动效：启动屏 / 波纹 / 扫描线全部让路
  地图聚合：挤在一起的图钉聚成数字圆，点一下散开；时间线视口裁剪 / 关系树缩放减负
  性能目标：LCP、CLS 达标；正文对比度 ≥ 7:1

跑法（先起好 dev server）：

    WS_BASE=http://127.0.0.1:8010 .venv/bin/python tools/experience_probe.py

退出码非 0 表示体验层有问题。
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, ensure_login_page, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8010")
SITE_SLUG = os.environ.get("WS_SITE_SLUG", "3b9edd")

# LCP 只能靠 PerformanceObserver 拿到（getEntriesByType 不返回 LCP 条目），
# 所以在页面创建时就把观察器挂上，测量时读 window 上的累计值。
PERF_INIT = """
window.__lcp = 0;
window.__cls = 0;
try {
  new PerformanceObserver(function (list) {
    var entries = list.getEntries();
    if (entries.length) window.__lcp = Math.round(entries[entries.length - 1].startTime);
  }).observe({type: 'largest-contentful-paint', buffered: true});
} catch (error) { /* 没有 LCP 就不测这一项 */ }
try {
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (entry) {
      if (!entry.hadRecentInput) window.__cls += entry.value;
    });
  }).observe({type: 'layout-shift', buffered: true});
} catch (error) { /* 同上 */ }
"""

opener = ensure_login(make_opener())


def api(path: str, method: str = "GET", payload: dict | None = None):
    """带登录态的接口小客户端（建 / 删聚合探针用的临时地图）。"""
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    with opener.open(request, timeout=20) as response:
        body = response.read()
    return json.loads(body) if body else {}


problems: list[str] = []

#: 对比度测量：正文 vs 它下面第一个不透明的背景面
CONTRAST_JS = """(selector) => {
  function parse(color) {
    const m = (color || '').match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return {r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1};
  }
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function over(fg, bg) {
    const a = fg.a;
    return {r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1};
  }
  function bgOf(node) {
    let cur = node;
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0.9) return c;
      cur = cur.parentElement;
    }
    return {r: 18, g: 17, b: 16, a: 1};
  }
  const node = document.querySelector(selector);
  if (!node) return null;
  const fg = parse(getComputedStyle(node).color);
  if (!fg) return null;
  const bg = bgOf(node);
  const text = fg.a >= 1 ? fg : over(fg, bg);
  const l1 = lum(text);
  const l2 = lum(bg);
  return {ratio: Number((((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2)),
          color: getComputedStyle(node).color};
}"""
notes: list[str] = []


def ok(label: str) -> None:
    notes.append(f"  ✓ {label}")


def bad(label: str) -> None:
    problems.append(f"  ✗ {label}")


def check(condition: bool, label: str, detail: str = "") -> None:
    (ok if condition else bad)(label + (f"（{detail}）" if detail and not condition else ""))


def click_tab(page, index: int) -> None:
    """点面板 0 的第 index 个页签。

    新设计把那条面板标签栏整个收掉了（terminal.css：``.panel-tabs{display:none!important}``，
    换页走侧栏树 / ⌘K），``page.click`` 会因为元素不可见而 30s 超时。但标签节点还在 DOM 里，
    ``HTMLElement.click()`` 照样把真实的那段点击处理器跑起来（方向、共享元素起飞、换 active、
    重绘），所以这里改成程序化派发点击，而不是绕开处理器自己重写一遍切换逻辑。
    """
    page.evaluate(
        """(index) => {
          const tabs = document.querySelectorAll('.panel[data-panel="0"] .panel-tabs .tab');
          if (tabs[index]) tabs[index].click();
        }""", index)


# --------------------------------------------------------------------- 探针
def run(pw) -> None:
    # 这个套件会开很多 context，长时间跑偶发渲染进程崩；这条是廉价的保险
    browser = pw.chromium.launch(channel="chrome", headless=True,
                                 args=["--disable-dev-shm-usage"])

    # ---------------------------------------------------- 工作区：启动屏
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    page = ctx.new_page()
    page.add_init_script(PERF_INIT)
    # navigate=False：这一页必须是这个上下文里"第一次进 /world"，
    # 否则 sessionStorage 里的记号会让我们根本测不到启动屏。
    ensure_login_page(page, navigate=False)
    page.goto(f"{BASE}/world", wait_until="domcontentloaded")
    early = page.evaluate("""() => {
      const node = document.querySelector('#osplash');
      if (!node) return {present: false};
      const cs = getComputedStyle(node);
      return {present: true, display: cs.display, opacity: cs.opacity};
    }""")
    check(early.get("present") and early.get("display") != "none",
          "§3.1 首次进入有启动屏", str(early))
    page.wait_for_timeout(1300)
    gone = page.evaluate("() => !document.querySelector('#osplash')")
    check(gone, "§3.1 启动屏在 900ms 内收掉了")

    # 同一次会话再进：不该再演一遍
    page.goto(f"{BASE}/world", wait_until="domcontentloaded")
    again = page.evaluate("""() => {
      const node = document.querySelector('#osplash');
      if (!node) return 'removed';
      return getComputedStyle(node).display;
    }""")
    check(again in ("removed", "none"), "§3.1 同一次会话里启动屏只演一次", str(again))

    # ---------------------------------------------------- 工作区：骨架屏
    # 接口被掐住（abort）：骨架必须浮出来，而且 400ms 之前不许亮。
    ctx_slow = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    slow = ctx_slow.new_page()
    ensure_login_page(slow, navigate=False)
    slow.route("**/api/world/state*", lambda route: route.abort())
    slow.goto(f"{BASE}/world", wait_until="domcontentloaded")
    slow.wait_for_timeout(150)
    before = slow.evaluate("""() => {
      const node = document.querySelector('#sbTree [data-skeleton]');
      return node ? +getComputedStyle(node).opacity : -1;
    }""")
    check(before == 0, "§4.1 骨架屏 400ms 内不显示（延迟显示，防 FOLS）", f"opacity={before}")
    # 等它真的淡入完（400ms 延迟 + 150ms 淡入，别跟时间赛跑）
    slow.wait_for_function("""() => {
      const node = document.querySelector('#sbTree [data-skeleton]');
      return !!node && +getComputedStyle(node).opacity > 0.9;
    }""", timeout=5000)
    after = slow.evaluate("""() => {
      const node = document.querySelector('#sbTree [data-skeleton]');
      if (!node) return {present: false};
      return {present: true, opacity: +getComputedStyle(node).opacity, rows: node.children.length};
    }""")
    check(after.get("present") and after.get("opacity", 0) > 0.5,
          "§4.1 接口慢的时候文档树先给骨架", str(after))
    check(after.get("rows", 0) >= 8, "§4.1 骨架行数与真实树对得上", str(after))
    ctx_slow.close()

    # 快的时候不许闪：400ms 内到的响应不该让骨架浮出来
    page.goto(f"{BASE}/world", wait_until="domcontentloaded")
    page.wait_for_timeout(260)
    flashed = page.evaluate("""() => {
      const node = document.querySelector('#sbTree [data-skeleton]');
      return node ? +getComputedStyle(node).opacity : 0;
    }""")
    check(not flashed, "§4.1 数据快的时候骨架不闪（opacity 0）", f"opacity={flashed}")

    # ---------------------------------------------------- 工作区：双击打开 + 扫描线位置
    # 新设计下架了"右侧并排再开一个面板"：S.panels 恒为 1 个（workspace.js 只初始化
    # 一个，窄屏还会回收成 1），双击和单击一样——都在左面板里开一篇（单面板多标签）。
    page.wait_for_timeout(900)
    page.evaluate("""() => {
      const row = document.querySelector('#sbTree .row');
      row.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, clientX: 140, clientY: 320}));
    }""")
    page.wait_for_timeout(1400)
    beside = page.evaluate("""() => ({
      panels: document.querySelectorAll('#panels .panel').length,
      tabs: document.querySelectorAll('#panels .panel-tabs > .tab').length,
    })""")
    check(beside["panels"] == 1 and beside["tabs"] >= 1,
          "§6.1 双击在左面板里打开（右侧并排面板已按新设计下架，单面板多标签）", str(beside))
    # ------------------------------- 从树里点开：张张生效，且不能挡输入
    # 先把前几行各自点开一次
    boxes = page.evaluate("""() => [...document.querySelectorAll('#sbTree .row')].slice(0, 4).map((row) => {
      const box = row.getBoundingClientRect();
      return {id: Number(row.dataset.id), x: box.x + box.width * 0.5, y: box.y + box.height * 0.5};
    })""")
    for row in boxes:
        page.mouse.click(row["x"], row["y"])
        page.wait_for_timeout(600)

    # 快速连点（每 60ms 一张）：最后一张必须成为激活标签。
    # 这条是回归护栏——工作区曾经用 View Transition 做"标题飞行"，
    # 那一层快照在 Chrome 里不可穿透，飞行没跑完时的点击会整个丢掉。
    for row in boxes[:3]:
        page.mouse.click(row["x"], row["y"])
        page.wait_for_timeout(60)
    page.wait_for_timeout(1000)
    final_tab = page.evaluate("() => S.panels[0].tabs[S.panels[0].active]")
    check(final_tab == boxes[2]["id"],
          "§6.3 连点卡片张张生效（没有会吃掉点击的过渡层）",
          f"最后激活 {final_tab}，期望 {boxes[2]['id']}")

    # 树里点开也不该起全屏过渡（起了就意味着那几百毫秒点哪儿都没反应）
    page.evaluate("""() => {
      window.__vt = 0;
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = function (cb) { window.__vt += 1; return original(cb); };
    }""")
    fresh = page.evaluate("""() => {
      const row = [...document.querySelectorAll('#sbTree .row')].find((r) => {
        const id = Number(r.dataset.id);
        const node = findNode(id);
        return !S.docs.has(id) && node && node.type === 'card';
      });
      if (!row) return null;
      const box = row.getBoundingClientRect();
      return {id: Number(row.dataset.id), x: box.x + box.width * 0.5, y: box.y + box.height * 0.5};
    }""")
    if fresh:
        page.mouse.click(fresh["x"], fresh["y"])
        page.wait_for_timeout(120)
        started = page.evaluate("() => window.__vt")
        glow = page.evaluate("""() => document.getAnimations().filter((a) =>
          a.effect && a.effect.target && String(a.effect.target.className || '').includes('card-title')).length""")
        check(started == 0, "§6.3 从树里点开不起全屏过渡（不会冻结输入）", f"startViewTransition 次数 {started}")
        check(glow >= 1, "§6.3 标题落地时有一束翠绿的光（WAAPI）", f"标题动画 {glow} 条")
        page.wait_for_timeout(900)
    else:
        notes.append("  · 树里没有没打开过的卡片行，§6.3 这一项跳过")

    outside = page.evaluate("""() => {
      const sweep = document.querySelector('#xpSweep');
      const panels = document.querySelector('#panels');
      return {exists: !!sweep, insidePanels: !!(sweep && panels && panels.contains(sweep))};
    }""")
    check(outside["exists"], "§6.1 扫描线元素存在")
    check(not outside["insidePanels"], "§6.1 扫描线挂在 #panels 外面（不被每帧重放）")

    # 标签切换的完整编排：模糊遮罩 + 进场延迟 50ms + 树里那一行脉冲
    rows = page.evaluate("""() => [...document.querySelectorAll('#sbTree .row')].map((r) => r.dataset.id)""")
    if len(rows) >= 2:
        # 先明确停在一篇上，再去点**另一篇**：点当前这一篇不会触发切换编排
        page.goto(f"{BASE}/world#doc={rows[0]}", wait_until="networkidle")
        page.wait_for_timeout(1600)
        rows = page.evaluate("""() => [...document.querySelectorAll('#sbTree .row')].map((r) => r.dataset.id)""")
        page.evaluate("""() => {
          window.__switchTrace = {scrim: 0, blur: null, delay: null, pulse: 0};
          const obs = new MutationObserver((records) => {
            records.forEach((rec) => rec.addedNodes.forEach((node) => {
              if (node.classList && node.classList.contains('xp-tab-scrim')) {
                window.__switchTrace.scrim += 1;
                const cs = getComputedStyle(node);
                window.__switchTrace.blur = cs.backdropFilter || cs.webkitBackdropFilter;
              }
            }));
          });
          obs.observe(document.body, { childList: true, subtree: true });
          document.addEventListener('animationstart', (event) => {
            if (event.target && event.target.classList
                && event.target.classList.contains('row')) window.__switchTrace.pulse += 1;
          }, true);
        }""")
        # 要点**标签页**：只有切标签才会置 S.tabSwitch（树里点开一篇已加载的文档是「再打开一次」，
        # 不是切换，不会有这套编排）。所以先确保这一格有两个标签。
        page.evaluate("""() => {
          const panel = S.panels[0];
          if (panel.tabs.length < 2) {
            const other = [...document.querySelectorAll('#sbTree .row')]
              .map((r) => Number(r.dataset.id))
              .find((id) => !panel.tabs.includes(id));
            if (other) openDoc(other, 0);
          }
        }""")
        page.wait_for_timeout(1200)
        # 新设计把那条面板标签栏整个收掉了（terminal.css：.panel-tabs{display:none!important}，
        # 换页面走侧栏树 / ⌘K），所以没法再点 .tab —— 照标签点击那段代码做一次等价的切换编排。
        tabs_hidden = page.evaluate(
            "() => getComputedStyle(document.querySelector('.panel-tabs')).display === 'none'")
        check(tabs_hidden, "§6.4 面板标签栏按新设计收掉（换页走侧栏树 / ⌘K）")
        next_tab = page.evaluate("""() => {
          const panel = S.panels[0];
          return panel.tabs.findIndex((id, i) => i !== panel.active);
        }""")
        if next_tab >= 0:
            click_tab(page, next_tab)
        page.wait_for_timeout(150)          # 遮罩在切换后 ~100ms 内出现、~450ms 撤掉
        scrim_now = page.evaluate("""() => {
          const node = document.querySelector('.xp-tab-scrim');
          if (!node) return null;
          const cs = getComputedStyle(node);
          return {blur: cs.backdropFilter || cs.webkitBackdropFilter, pointer: cs.pointerEvents};
        }""")
        page.wait_for_timeout(250)
        trace = page.evaluate("""() => {
          const body = document.querySelector('.panel-body');
          const anims = body ? body.getAnimations() : [];
          const waapi = anims.map((a) => a.effect && a.effect.getTiming ? a.effect.getTiming() : {});
          return {
            scrim: window.__switchTrace.scrim,
            blur: window.__switchTrace.blur,
            pulse: window.__switchTrace.pulse,
            delays: waapi.map((t) => t.delay),
            durations: waapi.map((t) => t.duration),
          };
        }""")
        typing = page.evaluate("""() => {
          const body = document.querySelector('.panel-body');
          const nodes = [...body.querySelectorAll('.card-title, .badges, .attr-row, .prose > *, .bn-block-outer, .hint')];
          const started = nodes.filter((n) => n.getAnimations().some((a) => {
            const frames = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
            return frames.some((f) => (f.clipPath || '').includes('inset'));
          }));
          return {nodes: nodes.length, typing: started.length,
                  scrim: document.querySelectorAll('.xp-tab-scrim').length,
                  ink: document.querySelectorAll('.tab-ink').length};
        }""")
        check(typing["scrim"] == 0 and typing["ink"] == 0,
              "§6.4 切换不再有模糊遮罩 / 会走的下划线（按反馈去掉）", str(typing))
        check(50 in (trace["delays"] or []),
              "§6.4 进场内容延迟 50ms（旧的先走）", str(trace))

    # ---------------------------------------------------- 共享元素式的标签切换
    # 两个标签都选**卡片**：共享元素要"两端都有个标题"才飞得起来
    # （图谱 / 地图这类工具面板没有标题，只有下划线和遮罩）。
    page.evaluate("""() => {
      const cards = [...document.querySelectorAll('#sbTree .row')]
        .map((r) => Number(r.dataset.id))
        .filter((id) => { const node = findNode(id); return node && node.type === 'card'; });
      const panel = S.panels[0];
      if (cards.length >= 2) {
        if (!cards.includes(panel.tabs[panel.active])) openDoc(cards[0], 0);
        const other = cards.find((id) => !S.panels[0].tabs.includes(id));
        if (other) openDoc(other, 0);
      }
    }""")
    page.wait_for_timeout(1600)

    cdp_fly = ctx.new_cdp_session(page)
    try:
        cdp_fly.send("Animation.enable")
        cdp_fly.send("Animation.setPlaybackRate", {"playbackRate": 0.12})
    except Exception:                                  # noqa: BLE001
        cdp_fly = None
    # 点哪一个：找一个**不是当前激活、而且是卡片**的标签（按索引点，别按 nth 猜）
    fly_index = page.evaluate("""() => {
      const panel = S.panels[0];
      for (let i = 0; i < panel.tabs.length; i += 1) {
        const node = findNode(panel.tabs[i]);
        if (i !== panel.active && node && node.type === 'card') return i;
      }
      return panel.active === 0 ? 1 : 0;
    }""")
    click_tab(page, fly_index)
    page.wait_for_timeout(150)
    flying = page.evaluate("""() => {
      const ghost = document.querySelector('.xp-fly');
      const active = document.querySelector('.tab.is-active');
      const cs = ghost ? getComputedStyle(ghost) : null;
      return {ghost: ghost ? ghost.textContent : null,
              ghostSize: cs ? Math.round(parseFloat(cs.fontSize)) : null,
              tabText: active ? active.querySelector('.t-name').textContent : null,
              position: cs ? cs.position : null,
              pointer: cs ? cs.pointerEvents : null};
    }""")
    if cdp_fly:
        try:
            cdp_fly.send("Animation.setPlaybackRate", {"playbackRate": 1})
        except Exception:                              # noqa: BLE001
            pass
    check(bool(flying["ghost"]) and flying["ghost"] == flying["tabText"]
          and flying["pointer"] == "none" and flying["position"] == "fixed",
          "§6.3 标签上的名字飞进编辑区（共享元素，且不挡点击）", str(flying))
    page.wait_for_timeout(1500)
    after_fly = page.evaluate("""() => ({
      ghosts: document.querySelectorAll('.xp-fly').length,
      tab: getComputedStyle(document.querySelector('.panel .tab.is-active .t-name')).opacity,
      title: document.querySelector('.panel[data-panel="0"] .card-title')
        ? getComputedStyle(document.querySelector('.panel[data-panel="0"] .card-title')).opacity : null,
      flyAway: document.querySelectorAll('.is-fly-away').length,
    })""")
    check(after_fly["ghosts"] == 0 and after_fly["flyAway"] == 0 and after_fly["tab"] == "1",
          "§6.3 飞完之后幽灵收掉、名字归位（没有卡住不让开的）", str(after_fly))

    # ---------------------------------------------------- 两段式飞行：侧栏 -> 标签栏 -> 标题
    page.goto(f"{BASE}/world", wait_until="networkidle")
    page.wait_for_timeout(1800)
    flight_doc = page.evaluate("""() => {
      const panel = S.panels[0];
      const row = [...document.querySelectorAll('#sbTree .row')].find((r) => {
        const node = findNode(Number(r.dataset.id));
        return node && node.type === 'card' && !panel.tabs.includes(Number(r.dataset.id));
      });
      if (!row) return null;
      const box = row.getBoundingClientRect();
      return {id: Number(row.dataset.id), x: box.x + 60, y: box.y + box.height / 2,
              top: Math.round(box.top), name: (row.querySelector('.r-name') || {}).textContent || ''};
    }""")
    if flight_doc:
        page.evaluate("""(docId) => {
          window.__legs = [];
          const t0 = performance.now();
          const timer = setInterval(() => {
            const g = document.querySelector('.xp-fly');
            if (!g) return;
            const r = g.getBoundingClientRect();
            // 要盯**点中的那一行**：.is-active 未必是它（可能是上一篇还留着高亮）
            const row = document.querySelector('#sbTree .row[data-id="' + docId + '"] .r-name');
            window.__legs.push({t: Math.round(performance.now() - t0), top: Math.round(r.top),
              rowHidden: row ? getComputedStyle(row).opacity === '0' : null});
          }, 24);
          window.__stopLegs = () => clearInterval(timer);
        }""", flight_doc["id"])
        page.mouse.click(flight_doc["x"], flight_doc["y"])
        page.wait_for_timeout(2200)
        page.evaluate("() => window.__stopLegs()")
        legs = page.evaluate("() => window.__legs")
        title_top = page.evaluate("""() => {
          const t = document.querySelector('.panel[data-panel="0"] .card-title');
          return t ? Math.round(t.getBoundingClientRect().top) : null;
        }""")
        tops = [row["top"] for row in legs]
        ended_at_title = bool(title_top is not None and tops
                              and abs(tops[-1] - (title_top + 8)) <= 22)
        hidden_ok = any(row["rowHidden"] for row in legs)
        check(ended_at_title and hidden_ok,
              "§6.3 名字从左侧栏**直接**飞进标题（起飞处那一行的名字先让开）",
              f"起点 top={tops[0] if tops else None}（行 top={flight_doc['top']}）"
              f"·落点 top={tops[-1] if tops else None}（标题 top={title_top}）·名字让开={hidden_ok}")
        page.wait_for_timeout(800)
        settled = page.evaluate("""(docId) => {
          const row = document.querySelector('#sbTree .row[data-id="' + docId + '"] .r-name');
          const tab = document.querySelector('.panel .tab.is-active .t-name');
          return {ghosts: document.querySelectorAll('.xp-fly').length,
                  flyAway: document.querySelectorAll('.is-fly-away').length,
                  row: row ? getComputedStyle(row).opacity : null,
                  tab: tab ? getComputedStyle(tab).opacity : null};
        }""", flight_doc["id"])
        check(settled["ghosts"] == 0 and settled["flyAway"] == 0
              and settled["row"] == "1" and settled["tab"] == "1",
              "§6.3 飞完之后幽灵收干净、名字都归位", str(settled))
    else:
        notes.append("  · 树里没有未打开的卡片，§6.3 从树里起飞这一项跳过")

    # ---------------------------------------------------- 命令面板 / 搜索结果也是起飞点
    page.goto(f"{BASE}/world", wait_until="networkidle")
    page.wait_for_timeout(1800)
    page.keyboard.press("Meta+k")
    page.wait_for_timeout(500)
    page.fill("#plInput", "a")
    page.wait_for_timeout(900)
    palette_rows = page.evaluate("""() => {
      const rows = [...document.querySelectorAll('#plList .pl-item')];
      const index = rows.findIndex((row) => row.querySelectorAll('span').length >= 2
        && !row.querySelector('.pi-kind').textContent.includes('动作'));
      const row = rows[index];
      if (!row) return null;
      const name = row.children[1].getBoundingClientRect();
      return {index: index, name: row.children[1].textContent.trim(),
              rect: {left: Math.round(name.left), top: Math.round(name.top)}};
    }""")
    if palette_rows:
        page.evaluate("""() => {
          window.__pal = [];
          const t = setInterval(() => {
            const g = document.querySelector('.xp-fly');
            if (g) {
              const r = g.getBoundingClientRect();
              window.__pal.push({left: Math.round(r.left), top: Math.round(r.top),
                                 text: g.textContent.trim()});
            }
          }, 30);
          setTimeout(() => clearInterval(t), 2200);
        }""")
        page.click(f"#plList .pl-item >> nth={palette_rows['index']}")
        page.wait_for_timeout(2400)
        pal = page.evaluate("() => window.__pal")
        pal_title = page.evaluate("""() => {
          const t = document.querySelector('.panel[data-panel="0"] .card-title');
          return t ? Math.round(t.getBoundingClientRect().top) : null;
        }""")
        pal_ok = bool(pal) and pal_title is not None and abs(pal[-1]["top"] - (pal_title + 8)) <= 24
        check(pal_ok and abs(pal[0]["left"] - palette_rows["rect"]["left"]) <= 24,
              "§6.3 从命令面板 / 搜索结果点开也飞（从那一行飞进标题）",
              f"起点 ({pal[0]['left'] if pal else None},{pal[0]['top'] if pal else None})"
              f"（那一行 {palette_rows['rect']}）→ 落点 top={pal[-1]['top'] if pal else None}"
              f"（标题 top={pal_title}）")
        check(page.evaluate("() => document.querySelectorAll('.xp-fly').length") == 0,
              "§6.3 面板起飞那次也收干净了")
    else:
        notes.append("  · 命令面板里没找到文档条目，§6.3 面板起飞这一项跳过")

    # ---------------------------------------------------- 交叠式：旧内容滑出去
    # 标签切换时，"旧的这一格"会被寄存到 body 上的浮层里往左滑出——
    # 只有新的滑进来、旧的瞬间消失的话，看起来就像什么都没发生。
    page.evaluate("""() => {
      const panel = S.panels[0];
      if (panel.tabs.length < 2) {
        const other = [...document.querySelectorAll('#sbTree .row')]
          .map((r) => Number(r.dataset.id))
          .find((id) => !panel.tabs.includes(id));
        if (other) openDoc(other, 0);
      }
    }""")
    page.wait_for_timeout(1200)
    cdp_anim = ctx.new_cdp_session(page)
    try:
        cdp_anim.send("Animation.enable")
        cdp_anim.send("Animation.setPlaybackRate", {"playbackRate": 0.12})
    except Exception:                                  # noqa: BLE001
        cdp_anim = None
    # 点**另一个**标签（当前这个点了不算切换，也就不会有交叠）
    active_index = page.evaluate("() => S.panels[0].active")
    click_tab(page, 0 if active_index != 0 else 1)
    page.wait_for_timeout(120)
    overlap = page.evaluate("""() => {
      const layer = document.querySelector('.xp-outgoing');
      return {layers: document.querySelectorAll('.xp-outgoing').length,
              text: layer ? layer.innerText.slice(0, 24) : null,
              stage: !!document.querySelector('#outgoingStage')};
    }""")
    if cdp_anim:
        try:
            cdp_anim.send("Animation.setPlaybackRate", {"playbackRate": 1})
        except Exception:                              # noqa: BLE001
            pass
    page.wait_for_timeout(1200)
    overlap_after = page.evaluate("() => document.querySelectorAll('.xp-outgoing').length")
    check(overlap["layers"] >= 1 and overlap["stage"],
          "§6.2 交叠式：旧内容被寄存并滑出去（不是瞬间消失）", str(overlap))
    check(overlap_after == 0, "§6.2 交叠结束后浮层收干净", f"还剩 {overlap_after}")

    # ---------------------------------------------------- 工作区：Ripple
    # 用默认可见的「新建文档」按钮测：原来那颗「类型」(#typesBtn) 现在被收进右下角
    # 圆形「更多」的浮层里（.sb-menu[hidden]），隐藏元素 rect 为 0，波纹处理器会直接
    # return——拿它测只会得到假阴性。
    page.evaluate("""() => {
      const btn = document.querySelector('#newDocBtn');
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: r.left + 6, clientY: r.top + 6, button: 0, isPrimary: true,
      }));
    }""")
    rippled = page.evaluate("() => !!document.querySelector('.fx-ripple')")
    check(rippled, "§8.1 按下有波纹")
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # ---------------------------------------------------- 工作区：分级 Toast
    kinds = page.evaluate("""() => {
      const out = [];
      window.toast('已保存', {kind: 'ok'});
      out.push([document.querySelector('#toast .toast-ic').textContent,
                document.querySelector('#toast').dataset.kind]);
      return out;
    }""")
    check(kinds and kinds[0][0] == "[OK]" and kinds[0][1] == "ok", "§10.1 成功提示带 [OK]", str(kinds))
    warn = page.evaluate("""() => {
      window.toast('这一步没能撤销', {kind: 'err', action: () => {}, actionLabel: '撤销'});
      const boxes = document.querySelectorAll('.toast-stack .toast:not([hidden])');
      const last = boxes[boxes.length - 1];
      return {mark: last.querySelector('.toast-ic').textContent,
              act: !!last.querySelector('.toast-act')};
    }""")
    check(warn.get("mark") == "[ERR]", "§10.1 错误提示带 [ERR]", str(warn))
    check(warn.get("act"), "§10.1 可撤销的提示带撤销按钮", str(warn))
    page.wait_for_timeout(400)

    # ---------------------------------------------------- 工作区：通知中心
    page.evaluate("() => { document.querySelector('#noticeBtn').click(); }")
    page.wait_for_timeout(900)
    panel = page.evaluate("""() => {
      const node = document.querySelector('#noticePanel');
      if (!node) return {exists: false};
      return {exists: true, hidden: node.hidden, rows: node.querySelectorAll('.notice-row').length,
              text: node.textContent.slice(0, 40)};
    }""")
    check(panel.get("exists") and not panel.get("hidden"), "§10.4 通知中心能打开", str(panel))
    check(panel.get("rows", 0) > 0, "§10.4 通知中心里有内容", str(panel))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    closed = page.evaluate("() => document.querySelector('#noticePanel').hidden")
    check(closed, "§10.4 Esc 能关掉通知中心")

    # ---------------------------------------------------- 工作区：性能目标
    page.goto(f"{BASE}/world", wait_until="networkidle")
    page.wait_for_timeout(1200)
    wperf = page.evaluate("() => ({lcp: window.__lcp || 0, cls: Number((window.__cls || 0).toFixed(4))})")
    check(0 < wperf["lcp"] < 2500, "§4.5 工作区 LCP < 2.5s", str(wperf))
    check(wperf["cls"] < 0.05, "§4.5 工作区 CLS < 0.05", str(wperf))
    # ---------------------------------------------------- 深链不被顶掉
    # 首次加载还没跑完时地址栏被指到某一篇（用户点链接 / 改 hash）：
    # 面板里必须是地址栏那一篇，而不是"自动打开的第一篇"。
    ctx_nav = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    nav = ctx_nav.new_page()
    ensure_login_page(nav)                 # 这一步已经打开了 /world，boot 通常还没跑完
    nav.goto(f"{BASE}/world#doc=115", wait_until="domcontentloaded")
    nav.wait_for_timeout(2000)
    navstate = nav.evaluate("() => ({hash: location.hash, tabs: S.panels[0].tabs, active: S.panels[0].active})")
    opened = None
    if navstate["tabs"] and 0 <= navstate["active"] < len(navstate["tabs"]):
        opened = navstate["tabs"][navstate["active"]]
    check(opened == 115, "§5 启动过程中的深链不会被自动打开顶掉（地址栏写谁就开谁）", str(navstate))
    ctx_nav.close()

    # ---------------------------------------------------- 并行预取
    # 深链 /world#doc=<id>：详情请求必须跟 /api/world/state **同时**发出去，
    # 而不是等 state 回来再排队（以前是"state → 详情 → 卡片"三个来回）。
    # 要另开一个上下文：同一个页面里只有 hash 变了的话根本不会重新加载文档，
    # 走的是 SPA 的 hashchange，测不到"首次进入"的那一组请求。
    marks: list[tuple[str, str, float]] = []
    ctx_deep = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    deep = ctx_deep.new_page()
    ensure_login_page(deep, navigate=False)
    deep.on("request", lambda r: marks.append(("req", r.url, time.perf_counter())))
    deep.on("response", lambda r: marks.append(("res", r.url, time.perf_counter())))
    deep.goto(f"{BASE}/world#doc=109", wait_until="commit")
    deep.wait_for_timeout(1600)
    ctx_deep.close()

    def mark(kind: str, needle: str):
        for entry_kind, url, at in marks:
            if entry_kind == kind and needle in url:
                return at
        return None

    detail_at = mark("req", "/api/world/documents/109")
    state_at = mark("res", "/api/world/state")
    check(detail_at is not None and state_at is not None and detail_at < state_at,
          "§4.3 深链文档与 state 并行取（省掉一个来回）",
          f"detail@{detail_at} state-res@{state_at}")

    work_text = page.evaluate(CONTRAST_JS, ".sb-tree .r-name, .card-view p, .panel-body")
    if work_text:
        check(work_text["ratio"] >= 7, "§13.5 工作区正文对比度 ≥ 7:1（AAA）", str(work_text))
    else:
        notes.append("  · 工作区没找到正文节点，对比度这一项跳过")

    # ---------------------------------------------------- 工作区：读失败说人话 + 重试
    page.route("**/api/world/documents/*", lambda route: route.abort())
    page.evaluate("""() => {
      const row = [...document.querySelectorAll('#sbTree .row')]
        .find((node) => !S.docs.has(Number(node.dataset.id)));
      if (row) openDoc(Number(row.dataset.id));
    }""")
    page.wait_for_timeout(700)
    failed = page.evaluate("""() => {
      const boxes = [...document.querySelectorAll('.toast-stack .toast:not([hidden])')];
      const last = boxes[boxes.length - 1];
      if (!last) return null;
      return {kind: last.dataset.kind, text: last.textContent,
              act: last.querySelector('.toast-act') ? last.querySelector('.toast-act').textContent : ''};
    }""")
    check(bool(failed) and failed.get("kind") == "err", "§11.3 读不到东西时给一条错误提示", str(failed))
    check(bool(failed) and "网络" in (failed.get("text") or ""), "§11.3 提示是人话，不是 Failed to fetch", str(failed))
    check(bool(failed) and failed.get("act") == "重试", "§11.3 错误提示带「重试」", str(failed))
    page.unroute("**/api/world/documents/*")

    # ---------------------------------------------------- 工作区：离线徽标
    # 先把待会儿要动的卡片和它的正文抄下来（断网之后连 GET 都发不出去）
    victim = page.evaluate("""() => {
      const walk = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'card') return node.id;
          const hit = walk(node.children || []);
          if (hit) return hit;
        }
        return null;
      };
      return walk(S.tree);
    }""")
    snapshot = None
    if victim:
        snapshot = page.evaluate("""async (id) => {
          const payload = await api(`/api/world/cards/${id}`);
          return { blocks: payload.card.blocks, revision: payload.revision };
        }""", victim)

    ctx.set_offline(True)
    page.evaluate("() => window.dispatchEvent(new Event('offline'))")
    page.wait_for_timeout(200)
    offline = page.evaluate("""() => {
      const node = document.querySelector('#offlineBadge');
      return node ? {hidden: node.hidden, text: node.textContent} : {missing: true};
    }""")
    check(offline.get("hidden") is False, "§11.4 断网时顶栏出离线徽标", str(offline))

    # 队列与补写：断网时写一张卡 -> 记在本地；联网后按顺序写回服务端
    if victim:
        page.evaluate("() => { localStorage.removeItem('opus.queue'); Opus.offline.refresh(); }")
        page.evaluate("""(id) => api(`/api/world/cards/${id}`, { method: 'PUT', body: {
          blocks: [{ id: 'b1', type: 'text', title: '离线补写验证', text: '断网时写的' }],
        }}).catch(() => {})""", victim)
        page.wait_for_timeout(1200)
        queued = page.evaluate("""() => ({
          entries: Opus.offline.entries.map((e) => `${e.method} ${e.path}`),
          badge: (document.querySelector('#offlineBadge') || {}).textContent || '',
        })""")
        check(len(queued["entries"]) == 1, "§11.4 断网时的写操作进了本地队列", str(queued))
        check("待同步" in queued["badge"], "§11.4 徽标上能看到待同步条数", str(queued))

        ctx.set_offline(False)
        page.evaluate("() => window.dispatchEvent(new Event('online'))")
        page.wait_for_timeout(2500)
        drained = page.evaluate("""() => ({
          left: Opus.offline.entries.length,
          badge: document.querySelector('#offlineBadge').hidden,
        })""")
        check(drained["left"] == 0 and drained["badge"],
              "§11.4 联网后自动补写、队列清空、徽标收起", str(drained))
        # 真的写到服务端了吗（用另一个身份去读，避免只信页面）
        reader = ensure_login(make_opener())
        with reader.open(f"{BASE}/api/world/cards/{victim}", timeout=15) as response:
            card = json.loads(response.read()).get("card") or {}
        titles = [block.get("title") for block in (card.get("blocks") or [])]
        check("离线补写验证" in titles, "§11.4 离线改动真的补写到了服务端", str(titles[:3]))
        # 收尾：用刚才的快照恢复原样（连修订号一起，别再撞 409）
        if snapshot and snapshot.get("blocks") is not None:
            fresh = page.evaluate("""async (id) => (await api(`/api/world/cards/${id}`)).revision""", victim)
            page.evaluate("""([id, blocks, revision]) => api(`/api/world/cards/${id}`, {
              method: 'PUT', body: { blocks, revision },
            }).catch(() => {})""", [victim, snapshot["blocks"], fresh])
            page.wait_for_timeout(600)
    else:
        notes.append("  · 这个世界没有卡片，§11.4 队列与补写这一项跳过")

    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    page.wait_for_timeout(200)
    back = page.evaluate("() => document.querySelector('#offlineBadge').hidden")
    check(back, "§11.4 网络恢复后徽标收起来")

    ctx.close()

    # ---------------------------------------------------- 只读站点：入场与滚动
    ctx_site = browser.new_context(viewport={"width": 1280, "height": 800}, locale="zh-CN")
    site = ctx_site.new_page()
    site.add_init_script(PERF_INIT)
    site.goto(f"{BASE}/s/{SITE_SLUG}/", wait_until="domcontentloaded")
    revealed = site.evaluate("""() => {
      const all = document.querySelectorAll('[data-reveal]');
      const hidden = document.querySelectorAll('.xp-reveal:not(.is-in)');
      return {total: all.length, pending: hidden.length};
    }""")
    check(revealed["total"] > 0, "§7.1 站点元素登记了滚动显现", str(revealed))
    site.wait_for_timeout(1200)
    title = site.evaluate("""() => {
      const h1 = document.querySelector('.site .hero h1');
      return h1 ? {text: h1.textContent.trim(), typed: h1.classList.contains('xp-type')} : null;
    }""")
    check(bool(title and title["text"]), "§3.3 打字机标题最终写满", str(title))
    site.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    site.wait_for_timeout(700)
    left = site.evaluate("() => document.querySelectorAll('.xp-reveal:not(.is-in)').length")
    check(left == 0, "§7.1 滚到底之后没有留在隐藏态的元素", f"剩 {left}")

    # ---------------------------------------------------- 性能目标
    # LCP / CLS 用浏览器自己的条目算（headless 里也有）。阈值按现行性能目标：
    # 只读站点 LCP < 1.5s、工作区 LCP < 2.5s、CLS < 0.05。
    site.goto(f"{BASE}/s/{SITE_SLUG}/", wait_until="networkidle")
    site.wait_for_timeout(1500)
    perf = site.evaluate("() => ({lcp: window.__lcp || 0, cls: Number((window.__cls || 0).toFixed(4))})")
    check(0 < perf["lcp"] < 1500, "§4.5 只读站点 LCP < 1.5s", str(perf))
    check(perf["cls"] < 0.05, "§4.5 只读站点 CLS < 0.05", str(perf))

    # ---------------------------------------------------- 对比度
    # 正文要够 AAA 对比度（7:1）。背景从元素往上找第一个不透明的面。
    site_text = site.evaluate(CONTRAST_JS, ".site .hero-sub, .site .tile-name")
    if site_text:
        check(site_text["ratio"] >= 7, "§13.5 只读站点正文对比度 ≥ 7:1（AAA）", str(site_text))
    else:
        notes.append("  · 站点没找到正文节点，对比度这一项跳过")

    # ---------------------------------------------------- 只读站点：404
    missing = site.goto(f"{BASE}/s/{SITE_SLUG}/no-such-document-xyz/")
    body = site.content()
    check(missing.status == 404, "§11.2 不存在的文档回 404", str(missing.status))
    check("信号丢失" in body or "不在站点上" in body, "§11.2 404 说的是人话")

    # ---------------------------------------------------- 只读站点：列表脚注与目录
    site.goto(f"{BASE}/s/{SITE_SLUG}/search?q=Harrow", wait_until="networkidle")
    foot = site.evaluate("""() => {
      const node = document.querySelector('.list-count');
      return node ? node.textContent.trim() : '';
    }""")
    check("已显示" in foot, "§7.3 搜索结果给出「已显示 x / y 条」", foot or "没有这一行")

    site.goto(f"{BASE}/s/{SITE_SLUG}/isarra-thornveil/", wait_until="networkidle")
    site.wait_for_timeout(600)
    toc = site.evaluate("""() => {
      const node = document.querySelector('.page-toc');
      if (!node) return null;
      return {links: node.querySelectorAll('a').length, target: !!document.querySelector(node.querySelector('a').getAttribute('href'))};
    }""")
    check(bool(toc) and toc["links"] >= 3 and toc["target"], "§5.5 文档页目录锚点指得到位置", str(toc))

    # ---------------------------------------------------- 只读站点：OG 卡片
    og = site.goto(f"{BASE}/s/{SITE_SLUG}/og.svg")
    check(og.status == 200 and "svg" in (og.headers.get("content-type") or ""),
          "§2 分享卡片能取到", str(og.status))

    # ---------------------------------------------------- 维护页
    maint = site.goto(f"{BASE}/maintenance")
    check(maint.status == 503, "§11.5 维护页回 503", str(maint.status))
    check("系统维护中" in site.content(), "§11.5 维护页是终端启动序列")
    ctx_site.close()

    # ---------------------------------------------------- 减少动效
    ctx_rm = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN",
                                 reduced_motion="reduce")
    rm = ctx_rm.new_page()
    ensure_login_page(rm)
    rm.goto(f"{BASE}/world", wait_until="domcontentloaded")
    rm.wait_for_timeout(400)
    calm = rm.evaluate("""() => {
      const splash = document.querySelector('#osplash');
      const splashShown = splash ? getComputedStyle(splash).display !== 'none' : false;
      const sweep = document.querySelector('#xpSweep');
      const sweepShown = sweep ? getComputedStyle(sweep).display !== 'none' : false;
      return {splashShown, sweepShown};
    }""")
    check(not calm["splashShown"], "§13.2 减少动效下没有启动屏", str(calm))
    check(not calm["sweepShown"], "§13.2 减少动效下没有扫描线", str(calm))
    # 同样用默认可见的「新建文档」按钮（#typesBtn 已收进浮层，rect 为 0 会假通过）
    rm.evaluate("""() => {
      const btn = document.querySelector('#newDocBtn');
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: r.left + 6, clientY: r.top + 6, button: 0, isPrimary: true,
      }));
    }""")
    check(not rm.evaluate("() => !!document.querySelector('.fx-ripple')"),
          "§13.2 减少动效下没有波纹")
    # 标签切换的共享元素：减少动效时不许飞
    rm.evaluate("""() => {
      const cards = [...document.querySelectorAll('#sbTree .row')]
        .map((r) => Number(r.dataset.id))
        .filter((id) => { const node = findNode(id); return node && node.type === 'card'; });
      if (cards.length >= 2) {
        openDoc(cards[0], 0);
        openDoc(cards[1], 0);
      }
    }""")
    rm.wait_for_timeout(1500)
    rm_index = rm.evaluate("""() => {
      const panel = S.panels[0];
      for (let i = 0; i < panel.tabs.length; i += 1) {
        const node = findNode(panel.tabs[i]);
        if (i !== panel.active && node && node.type === 'card') return i;
      }
      return panel.active === 0 ? 1 : 0;
    }""")
    click_tab(rm, rm_index)
    rm.wait_for_timeout(120)
    check(rm.evaluate("() => document.querySelectorAll('.xp-fly').length") == 0,
          "§13.2 减少动效下标签名不飞（共享元素让路）")
    ctx_rm.close()

    # ---------------------------------------------------- 编辑区 <-> 维基：视图切换 + 共享元素
    ctx_wiki = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    wk = ctx_wiki.new_page()
    ensure_login_page(wk, navigate=False)
    wk.goto(f"{BASE}/world#doc=109", wait_until="networkidle")
    wk.wait_for_timeout(2200)
    names = wk.evaluate("""() => {
      const world = document.querySelector('#worldName');
      const title = document.querySelector('.panel[data-panel="0"] .card-title');
      return {world: world ? getComputedStyle(world).viewTransitionName : null,
              title: title ? getComputedStyle(title).viewTransitionName : null,
              css: CSS.supports('view-transition-name: xp-world')};
    }""")
    check(names["world"] == "xp-world" and names["title"] == "xp-doc-title",
          "§5.1 工作区把世界名 / 当前标题声明成共享元素", str(names))
    wiki_press = wk.evaluate("""() => {
      const btn = [...document.querySelectorAll('#tbNav .tb-view')].find((b) => b.dataset.nav === 'wiki');
      return {exists: !!btn, site: S.world.site_url || '', published: !!S.world.published};
    }""")
    check(wiki_press["exists"] and wiki_press["published"] and wiki_press["site"],
          "§5.1 顶栏「维基」知道站点地址（发过就跳过去）", str(wiki_press))
    if wiki_press["site"]:
        # 视图药丸现在挂在侧栏（.sb-pills），且**非当前视图那颗的文字被收起来**
        # （workspace.css：.sb-pills .tb-view > span{display:none}），所以按文字点会
        # 命中不可见的 span —— 改按 data-nav 钩子点那颗可见的药丸。
        wk.click('#tbNav [data-nav="wiki"]')
        wk.wait_for_timeout(2500)
        landed = wk.evaluate("""() => {
          const brand = document.querySelector('.nav-brand');
          return {url: location.pathname,
                  world: brand ? getComputedStyle(brand).viewTransitionName : null};
        }""")
        check(landed["url"].startswith("/s/") and landed["world"] == "xp-world",
              "§5.1 点「维基」同标签跳到只读站点，两边共享元素对得上", str(landed))
        wk.goto(f"{BASE}/s/{landed['url'].split('/')[2]}/", wait_until="networkidle")
        wk.wait_for_timeout(1200)
        doc_link = wk.evaluate("""() => {
          const link = document.querySelector('a.tile[href]')      // 站点首页的文档卡片
            || [...document.querySelectorAll('a[href*="/s/"]')]
              .find((a) => a.getAttribute('href').split('/').length > 4);
          return link ? link.getAttribute('href') : null;
        }""")
        if doc_link:
            wk.goto(doc_link if doc_link.startswith("http") else BASE + doc_link, wait_until="networkidle")
            wk.wait_for_timeout(1200)
            # 注意：站内点击（首页 -> 文档页）时，站点自己的脚本会把标题命名成 xp-title
            # （那是卡片->详情的共享元素）。所以这里验的是**样式表里声明了**
            # 工作区 -> 站点那个名字，而不是运行时算出来的值。
            doc_name = wk.evaluate("""() => {
              const h1 = document.querySelector('.doc-title');
              const declared = [];
              for (const sheet of document.styleSheets) {
                let rules = [];
                try { rules = [...sheet.cssRules]; } catch (error) { continue; }
                for (const rule of rules) {
                  if (rule.selectorText === '.site .doc-title' && rule.style
                      && rule.style.viewTransitionName) declared.push(rule.style.viewTransitionName);
                }
              }
              return {hasTitle: !!h1, declared,
                      runtime: h1 ? getComputedStyle(h1).viewTransitionName : null};
            }""")
            check(doc_name["hasTitle"] and "xp-doc-title" in doc_name["declared"],
                  "§5.1 站点文档页的标题接过同一个共享元素名（样式里已声明）", str(doc_name))
            # 方向感知：从工作区过来时，标题要临时改叫 xp-doc-title 才能接住编辑区飞来的那个
            directed = wk.evaluate("""() => ({
              applied: Opus.crossDocName(location.origin + '/world#doc=110'),
              computed: getComputedStyle(document.querySelector('.doc-title')
                || document.querySelector('.page-head h1')).viewTransitionName,
            })""")
            check(directed["applied"] == "xp-doc-title" and directed["computed"] == "xp-doc-title",
                  "§5.1 从工作区过来的那次跳转，站点标题会接住 xp-doc-title", str(directed))
        else:
            notes.append("  · 站点首页没找到文档链接，§5.1 文档页共享元素这一项跳过")
    ctx_wiki.close()

    # ---------------------------------------------------- Service Worker（离线也打得开）
    ctx_sw = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    swp = ctx_sw.new_page()
    ensure_login_page(swp, navigate=False)
    swp.goto(f"{BASE}/world?sw=1", wait_until="networkidle")
    swp.wait_for_timeout(2500)
    reg = swp.evaluate("""async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return {ok: !!window.__swRegistered, failed: !!window.__swFailed, count: regs.length,
              scopes: regs.map((r) => r.scope)};
    }""")
    check(reg["ok"] and reg["count"] >= 1 and reg["scopes"] and reg["scopes"][0].endswith("/"),
          "§2 Service Worker 注册成功且作用域是整个站点", str(reg))
    if reg["ok"]:
        swp.goto(f"{BASE}/world?sw=1", wait_until="networkidle")
        swp.wait_for_timeout(1500)
        swp.evaluate("""async () => {
          const nodes = [...document.querySelectorAll('link[rel=stylesheet], script[src]')];
          for (const node of nodes.slice(0, 4)) await fetch(node.href || node.src).catch(() => {});
        }""")
        swp.wait_for_timeout(1200)
        cached = swp.evaluate("""async () => {
          const out = {};
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            out[name] = (await cache.keys()).map((r) => new URL(r.url).pathname);
          }
          return out;
        }""")
        static_keys = [k for k in cached if "static" in k]
        shell_keys = [k for k in cached if "shell" in k]
        check(bool(static_keys) and any(p.endswith(".css") or p.endswith(".js")
                                        for k in static_keys for p in cached[k]),
              "§2 版本化静态资源进了缓存", str(cached)[:160])
        check(bool(shell_keys) and any(p.endswith("offline.html")
                                       for k in shell_keys for p in cached[k]),
              "§2 离线兜底页预缓存好了", str(cached)[:160])

        # 断网后重新导航：不应当是浏览器的报错页，而是我们的兜底页
        ctx_sw.set_offline(True)
        try:
            swp.goto(f"{BASE}/world", wait_until="domcontentloaded", timeout=8000)
        except Exception:                              # noqa: BLE001
            pass
        swp.wait_for_timeout(1000)
        offline_page = swp.evaluate("""() => ({title: document.title,
          text: document.body.innerText.slice(0, 60)})""")
        ctx_sw.set_offline(False)
        check("离线" in (offline_page.get("title") or "")
              or "离线" in (offline_page.get("text") or ""),
              "§2 断网也能打开页面（走离线兜底页）", str(offline_page))

    # 收尾：注销 + 清缓存，别把后面的检查拖进"被 SW 控制"的状态
    swp.evaluate("""async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      for (const key of await caches.keys()) await caches.delete(key);
    }""")
    swp.wait_for_timeout(600)
    ctx_sw.close()

    # ---------------------------------------------------- 收尾三件
    ctx_last = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    last = ctx_last.new_page()
    ensure_login_page(last, navigate=False)
    last.goto(f"{BASE}/world", wait_until="networkidle")
    last.wait_for_timeout(300)
    # 这条只看"样式里声明了这个入场动画 + 取值对"：跟启动时序赛跑（动画早跑完了）
    # 会偶发假红，而它要保的是"别把这段显现删掉"。
    fade = last.evaluate("""() => {
      const app = document.querySelector('.app');
      if (!app) return null;
      const cs = getComputedStyle(app);
      const rules = [];
      for (const sheet of document.styleSheets) {
        let list = [];
        try { list = [...sheet.cssRules]; } catch (error) { continue; }
        for (const rule of list) {
          if (rule.selectorText && rule.selectorText.includes('xp-workspace-in')
              && rule.style && rule.style.animation) rules.push(rule.style.animation);
          if (rule.cssRules) {
            for (const inner of rule.cssRules) {
              if (inner.selectorText && inner.selectorText.includes('data-surface="workspace"')
                  && inner.style && inner.style.animation) rules.push(inner.style.animation);
            }
          }
        }
      }
      return {name: cs.animationName, dur: cs.animationDuration, declared: rules};
    }""")
    check(bool(fade) and (fade["name"] == "xp-workspace-in" or fade["declared"]),
          "§3.4 工作区页面显现（opacity .6 → 1，200ms）", str(fade))
    last.wait_for_timeout(2600)
    tti = last.evaluate("() => window.__tti || 0")
    check(bool(tti) and tti < 3000,
          "§4.5 TTI（首屏画完 + 主线程静 500ms）< 3s", f"{tti}ms")

    ctx_last.close()

    # ---------------------------------------------------- 编辑器级降级块
    ctx_fb = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    fb = ctx_fb.new_page()
    ensure_login_page(fb, navigate=False)
    fb.goto(f"{BASE}/world", wait_until="networkidle")
    fb.wait_for_timeout(1800)
    fb.evaluate("""() => {
      const id = [...S.docs.keys()][0];
      const entry = S.docs.get(id);
      entry.__boom = true;
      // 直接把降级块画出来：真实触发要靠某个渲染器抛异常，这里验的是"兜底长什么样"
      document.querySelector('.panel-body, #panels').appendChild(
        editorFallback(entry, new Error('探针：故意炸一下')));
    }""")
    fb.wait_for_timeout(400)
    fallback = fb.evaluate("""() => {
      const box = document.querySelector('.editor-fallback');
      if (!box) return null;
      return {text: box.innerText.slice(0, 40),
              retry: !!(box.querySelector('button')),
              exportLink: !!(box.querySelector('a[href*="export"]')),
              role: box.getAttribute('role')};
    }""")
    check(bool(fallback) and fallback["retry"] and fallback["exportLink"] and fallback["role"] == "alert",
          "§11.3 渲染器出错时给降级块（说人话 + 重试 + 导出）", str(fallback))
    ctx_fb.close()

    # ---------------------------------------------------- 捏合缩放（地图 / 关系树）
    touch = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN", has_touch=True)
    tz = touch.new_page()
    ensure_login_page(tz, navigate=False)

    def pinch(cdp_session, x, y, spread):
        cdp_session.send("Input.dispatchTouchEvent", {
            "type": "touchStart", "touchPoints": [{"x": x - 20, "y": y}, {"x": x + 20, "y": y}]})
        for step in range(1, 8):
            half = 20 + (spread - 20) * step / 7
            cdp_session.send("Input.dispatchTouchEvent", {
                "type": "touchMove",
                "touchPoints": [{"x": x - half, "y": y}, {"x": x + half, "y": y}]})
            time.sleep(0.03)
        cdp_session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

    # 地图已经改成**嵌 /map/2d 独立页**（缩放 / 平移都归那张页管，工作区这边只剩一个
    # iframe），父页面里再发捏合手势到不了 iframe 里；所以这一项挪到独立页上，
    # 验它自己的缩放（滚轮）——那才是现在真正生效的机制。
    tz.goto(f"{BASE}/world", wait_until="networkidle")
    tz.wait_for_timeout(1500)
    map_doc = tz.evaluate("""() => {
      const walk = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'map') return node.id;
          const hit = walk(node.children || []);
          if (hit) return hit;
        }
        return null;
      };
      return walk(S.tree);
    }""")
    if map_doc:
        tz.goto(f"{BASE}/map/2d?doc={map_doc}", wait_until="domcontentloaded")
        tz.wait_for_timeout(8000)
        read_scale = ("() => { const el = document.getElementById('viewbox'); "
                      "const t = (el && el.getAttribute('transform')) || ''; "
                      "const m = t.match(/scale\\(([\\d.]+)\\)/); return m ? parseFloat(m[1]) : null; }")
        zoom0 = tz.evaluate(read_scale)
        tz.evaluate("""() => { const svg = document.getElementById('map'); const r = svg.getBoundingClientRect();
          for (let i = 0; i < 5; i += 1) { svg.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true,
            deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2})); } }""")
        tz.wait_for_timeout(700)
        zoom1 = tz.evaluate(read_scale)
        check(bool(zoom0 and zoom1 and zoom1 > zoom0 * 1.05),
              "§8.4 地图能放大（/map/2d 的滚轮缩放）", f"{zoom0} -> {zoom1}")
    else:
        notes.append("  · 这个世界没有地图，§8.4 缩放（地图）这一项跳过")

    # 关系树：捏合改的是画布的 transform
    tree_id = None
    try:
        opener_tree = ensure_login(make_opener())
        with opener_tree.open(f"{BASE}/api/world/relationship/trees", timeout=15) as response:
            trees = json.loads(response.read()).get("trees") or []
        tree_id = trees[0]["id"] if trees else None
    except Exception:                                  # noqa: BLE001
        tree_id = None
    if tree_id:
        tz.goto(f"{BASE}/relationship?doc={tree_id}", wait_until="networkidle")
        tz.wait_for_timeout(2600)
        read = "() => getComputedStyle(document.querySelector('#rtGrid')).transform"
        before = tz.evaluate(read)
        box = tz.evaluate("""() => { const w = document.querySelector('#rtCanvasWrap').getBoundingClientRect();
          return {x: w.x + w.width / 2, y: w.y + w.height / 2}; }""")
        session2 = touch.new_cdp_session(tz)
        pinch(session2, box["x"], box["y"], 150)
        tz.wait_for_timeout(700)
        after_tree = tz.evaluate(read)
        scale_of = lambda text: float(re.findall(r"matrix\(([\d.]+)", text)[0]) if text and "matrix" in text else 1.0
        check(scale_of(after_tree) > scale_of(before) * 1.05,
              "§8.4 关系树上两指捏合能放大",
              f"{scale_of(before):.2f} -> {scale_of(after_tree):.2f}")
    else:
        notes.append("  · 关系树列表里没有可打开的树，§8.4 捏合缩放（关系树）这一项跳过")
    touch.close()

    # ---------------------------------------------------- 时间线事件拖动（经典编辑器）
    tl = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    tp = tl.new_page()
    ensure_login_page(tp, navigate=False)
    tl_doc = None
    tp.goto(f"{BASE}/world", wait_until="networkidle")
    tp.wait_for_timeout(1600)
    tl_doc = tp.evaluate("""() => {
      const walk = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'timeline') return node.id;
          const hit = walk(node.children || []);
          if (hit) return hit;
        }
        return null;
      };
      return walk(S.tree);
    }""")
    if tl_doc:
        tp.goto(f"{BASE}/world#doc={tl_doc}", wait_until="networkidle")
        tp.wait_for_timeout(3000)
        editor = next((fr for fr in tp.frames if fr is not tp.main_frame and fr.query_selector(".ev")), None)
        if editor:
            # 第一次进来有个教练提示挡着画布，先关掉
            close = editor.query_selector("#coachClose")
            if close:
                close.click()
                tp.wait_for_timeout(300)
            target = editor.evaluate("""() => {
              const dots = [...document.querySelectorAll('.ev .ev-dot')].map((d) => {
                const r = d.getBoundingClientRect();
                return {id: d.parentNode.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2,
                        inside: r.x > 20 && r.y > 20 && r.x < innerWidth - 120 && r.y < innerHeight - 20};
              }).filter((d) => d.inside);
              return dots.length ? dots[0] : null;
            }""")
            if not target:
                notes.append("  · 时间线上没有可视范围内的事件，§8.2 事件拖动这一项跳过")
            if target:
                reader = ensure_login(make_opener())
                with reader.open(f"{BASE}/api/world/events/{target['id']}", timeout=15) as response:
                    original = json.loads(response.read())
                # iframe 在页面里的偏移（鼠标坐标是页面坐标）
                offset = tp.evaluate("""() => { const f = document.querySelector('iframe');
                  const r = f.getBoundingClientRect(); return {x: r.x, y: r.y}; }""")
                cx = offset["x"] + target["x"]
                cy = offset["y"] + target["y"]
                tp.mouse.move(cx, cy)
                tp.wait_for_timeout(120)
                tp.mouse.down()
                tp.wait_for_timeout(150)
                for step in range(1, 9):
                    tp.mouse.move(cx + step * 18, cy)
                    tp.wait_for_timeout(35)
                dragging = editor.evaluate("""() => {
                  const ghost = document.querySelector('.ev-ghost');
                  return {ghosts: document.querySelectorAll('.ev-ghost').length,
                          ghostLeft: ghost ? ghost.style.left : null,
                          tip: document.querySelector('.drag-tip').textContent,
                          tipShown: !document.querySelector('.drag-tip').hidden};
                }""")
                check(dragging["ghosts"] == 1 and dragging["tipShown"],
                      "§8.2 拖事件时原位留虚线轮廓、跟着鼠标走", str(dragging))
                tp.mouse.up()
                tp.wait_for_timeout(2000)
                after = editor.evaluate("() => document.querySelectorAll('.ev-ghost').length")
                check(after == 0, "§8.2 松手后虚线轮廓收掉", f"还剩 {after} 个")
                def read_event():
                    with reader.open(f"{BASE}/api/world/events/{target['id']}", timeout=15) as response:
                        return json.loads(response.read())

                # 经典编辑器的保存是"防抖 ~450ms + 一个来回"，固定等待偶尔会早读
                # （看起来像"没落库"，其实只是还没写完）。轮询到变化为止。
                moved = read_event()
                for _ in range(12):
                    if abs(float(moved["year"]) - float(original["year"])) > 0.5:
                        break
                    tp.wait_for_timeout(400)
                    moved = read_event()
                if abs(float(moved["year"]) - float(original["year"])) <= 0.5 and target.get("id"):
                    # 偶尔这一下会落在"没真的拖动"上（比如起手就贴在夹取边界）：
                    # 再拖一次，拖得更远、更干脆，别让偶发把结论带偏
                    dot2 = editor.query_selector(f'.ev[data-id="{target["id"]}"] .ev-dot')
                    box2 = dot2.bounding_box() if dot2 else None
                    if box2 and box2["x"] > 5:
                        cx2 = box2["x"] + box2["width"] / 2
                        cy2 = box2["y"] + box2["height"] / 2
                        tp.mouse.move(cx2, cy2)
                        tp.wait_for_timeout(120)
                        tp.mouse.down()
                        tp.wait_for_timeout(160)
                        for step in range(1, 13):
                            tp.mouse.move(cx2 + step * 16, cy2)
                            tp.wait_for_timeout(30)
                        tp.mouse.up()
                        moved = read_event()
                        for _ in range(12):
                            if abs(float(moved["year"]) - float(original["year"])) > 0.5:
                                break
                            tp.wait_for_timeout(400)
                            moved = read_event()
                check(abs(float(moved["year"]) - float(original["year"])) > 0.5,
                      "§8.2 拖完真的改了时间（落库）",
                      f"事件 {target['id']}：{original['year']} -> {moved['year']}｜"
                      f"拖动中 ghost={dragging.get('ghosts')} tip={dragging.get('tip')!r}")
                # 收尾：把这条事件放回原来的时间
                restore = urllib.request.Request(
                    f"{BASE}/api/world/events/{target['id']}", method="PUT",
                    data=json.dumps({"year": original["year"], "month": original.get("month") or 1,
                                     "day": original.get("day") or 1}).encode(),
                    headers={"Content-Type": "application/json"})
                try:
                    with reader.open(restore, timeout=15):
                        pass
                except Exception:                      # noqa: BLE001
                    pass
            # hover 卡：事件名 / 时间 / 涉及卡片
            if editor.query_selector("#zoomFit"):
                editor.click("#zoomFit")
                tp.wait_for_timeout(900)
            hover_target = editor.evaluate("""() => {
              const nodes = [...document.querySelectorAll('.ev')];
              for (const node of nodes) {
                const inside = node.querySelector('.ev-pill');
                const r = (inside || node).getBoundingClientRect();
                if (r.x > 120 && r.x < innerWidth - 120 && r.y > 80) {
                  return {id: node.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2};
                }
              }
              return null;
            }""")
            if hover_target:
                offset_h = tp.evaluate("""() => { const f = document.querySelector('iframe');
                  const r = f.getBoundingClientRect(); return {x: r.x, y: r.y}; }""")
                tp.mouse.move(offset_h["x"] + hover_target["x"], offset_h["y"] + hover_target["y"])
                tp.wait_for_timeout(900)
                hint = editor.evaluate("""() => {
                  const card = document.getElementById('hintCard');
                  if (!card || card.hidden) return null;
                  return {text: card.innerText.slice(0, 80),
                          cards: [...card.querySelectorAll('.hc-card')].map((a) => a.textContent)};
                }""")
                check(bool(hint) and bool((hint or {}).get("text", "").strip()),
                      "§10.3 时间线事件 hover 浮出卡片（事件名 + 时间）", str(hint))
            else:
                notes.append("  · 时间线上没有可悬停的事件，§10.3 hover 卡这一项跳过")

        else:
            notes.append("  · 经典时间线编辑器没起来，§8.2 事件拖动这一项跳过")
    else:
        notes.append("  · 这个世界没有时间线，§8.2 事件拖动这一项跳过")
    tl.close()

    # ---------------------------------------------------- 日历月份滚动吸附 + ⌘S
    cal = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    cp = cal.new_page()
    ensure_login_page(cp, navigate=False)
    cp.goto(f"{BASE}/world", wait_until="networkidle")
    cp.wait_for_timeout(1800)
    timeline_id = cp.evaluate("""() => {
      const walk = (nodes) => {
        for (const node of nodes) {
          if (node.type === 'timeline') return node.id;
          const hit = walk(node.children || []);
          if (hit) return hit;
        }
        return null;
      };
      return walk(S.tree);
    }""")
    if timeline_id:
        cp.goto(f"{BASE}/world#doc={timeline_id}", wait_until="networkidle")
        cp.wait_for_timeout(2200)
        view = cp.query_selector(".panel-body >> text=日历视图")
        if view:
            view.click()
            cp.wait_for_timeout(1800)
            snap = cp.evaluate("""() => {
              const track = document.querySelector('.cal-track');
              if (!track) return null;
              const cs = getComputedStyle(track);
              const label = document.querySelector('.cal-label');
              return {type: cs.scrollSnapType, pages: track.querySelectorAll('.cal-page').length,
                      label: label ? label.innerText : '', left: Math.round(track.scrollLeft)};
            }""")
            check(bool(snap) and "x" in (snap["type"] or "") and snap["pages"] >= 3,
                  "§7.2 日历月份是横向滚动吸附的（scroll-snap-type: x）", str(snap))
            if snap:
                before_label = snap["label"]
                cp.evaluate("""() => { const t = document.querySelector('.cal-track');
                  t.scrollTo({ left: t.scrollWidth, behavior: 'auto' }); }""")
                cp.wait_for_timeout(1600)
                after = cp.evaluate("""() => ({
                  label: (document.querySelector('.cal-label') || {}).innerText,
                  left: Math.round(document.querySelector('.cal-track').scrollLeft),
                })""")
                check(after["label"] != before_label and after["left"] == snap["left"],
                      "§7.2 滑到边上就翻月，并且轨道自动回到中间",
                      f"{before_label} -> {after['label']}（left {after['left']}）")
        else:
            notes.append("  · 时间线里没有日历视图入口，§7.2 滚动吸附这一项跳过")

        # ⌘S：把等待中的改动立刻写回去（没有等待也要给一句反馈）
        cp.goto(f"{BASE}/world#doc={timeline_id}", wait_until="networkidle")
        cp.wait_for_timeout(1800)
        cp.keyboard.press("Meta+s")
        cp.wait_for_timeout(600)
        saved = cp.evaluate("""() => {
          const rows = [...document.querySelectorAll('.toast:not([hidden])')];
          return rows.length ? rows[rows.length - 1].innerText : null;
        }""")
        check(bool(saved) and ("写回" in saved or "落库" in saved),
              "§8.3 ⌘S 是「立刻保存」并给反馈", str(saved))
    else:
        notes.append("  · 这个世界没有时间线，§7.2 日历吸附与 §8.3 ⌘S 这两项跳过")
    cal.close()

    # ---------------------------------------------------- 新手引导 / 订阅与会话
    ctx_ob = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    ob = ctx_ob.new_page()
    ensure_login_page(ob, navigate=False)
    ob.goto(f"{BASE}/world", wait_until="networkidle")
    ob.wait_for_timeout(1200)
    # 引导平时不该自动弹（这个世界早就有内容了）——顺手验证"只在空世界弹"
    auto = ob.evaluate("() => !!(document.querySelector('#onboard') && !document.querySelector('#onboard').hidden)")
    check(not auto, "§3.2 有内容的世界不会自动弹引导")

    # 手动打开（命令面板里那一项），四步都在，进度写 localStorage
    ob.evaluate("() => { localStorage.removeItem('opus.onboard'); showOnboard(0); }")
    ob.wait_for_timeout(700)
    first = ob.evaluate("""() => {
      const node = document.querySelector('#onboard');
      return node && !node.hidden
        ? {step: node.dataset.step, prompt: node.querySelector('.ob-prompt').innerText.trim(),
           count: (node.querySelector('.ob-count') || {}).innerText,
           hasSkip: !!node.querySelector('.ob-skip'),
           saved: localStorage.getItem('opus.onboard')}
        : null;
    }""")
    check(bool(first) and first["step"] == "0" and "创建你的第一个世界" in first["prompt"],
          "§3.2 四步引导第一步是「创建你的第一个世界」", str(first))
    check(bool(first) and first["hasSkip"], "§3.2 引导可以跳过", str(first))
    check(bool(first) and first["saved"] is not None and '"step":0' in (first["saved"] or ""),
          "§3.2 进度写进 localStorage（下次接着走）", str(first and first["saved"]))

    # 走到第二步：进度要变成 1，并且画出"已完成"的历史块
    ob.evaluate("() => showOnboard(1)")
    ob.wait_for_timeout(500)
    second = ob.evaluate("""() => {
      const node = document.querySelector('#onboard');
      return {step: node.dataset.step,
              done: node.querySelectorAll('.ob-block.is-done').length,
              prompt: (node.querySelector('.ob-block:not(.is-done) .ob-prompt') || {}).innerText.trim(),
              saved: localStorage.getItem('opus.onboard')};
    }""")
    check(second["step"] == "1" and "添加第一张卡片" in second["prompt"] and second["done"] == 1,
          "§3.2 第二步是「添加第一张卡片」，上一步留成已完成的行", str(second))
    check('"step":1' in (second["saved"] or ""), "§3.2 进度跟着走", second["saved"])

    # 跳过之后不再自动弹
    ob.click(".ob-skip")
    ob.wait_for_timeout(400)
    after_skip = ob.evaluate("""() => ({
      hidden: !document.querySelector('#onboard') || document.querySelector('#onboard').hidden,
      saved: localStorage.getItem('opus.onboard'),
    })""")
    check(after_skip["hidden"] and '"done":true' in (after_skip["saved"] or ""),
          "§3.2 跳过之后关掉并记成已完成", str(after_skip))
    ob.evaluate("() => { localStorage.removeItem('opus.onboard'); }")
    ctx_ob.close()

    # 会话到期：喂一个"还剩 3 分钟"的到期时间，提示条要出来，续期按钮要在
    ctx_se = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    se = ctx_se.new_page()
    ensure_login_page(se, navigate=False)
    se.goto(f"{BASE}/world", wait_until="networkidle")
    se.wait_for_timeout(1500)
    se.evaluate("""() => Opus.session.check(new Date(Date.now() + 3 * 60 * 1000).toISOString())""")
    se.wait_for_timeout(600)
    bar = se.evaluate("""() => {
      const node = document.querySelector('.session-bar');
      return node ? {text: node.innerText.slice(0, 90),
                     action: (node.querySelector('.sb-action') || {}).innerText} : null;
    }""")
    check(bool(bar) and "续期" in (bar["action"] or ""),
          "§12 会话快到期时提示续期", str(bar))
    se.click(".session-bar .sb-action")
    se.wait_for_timeout(1200)
    renewed = se.evaluate("""() => ({
      gone: !document.querySelector('.session-bar'),
      expires: Opus.session.expiresAt,
      left: Opus.session.expiresAt ? Opus.session.expiresAt - Date.now() : 0,
    })""")
    check(renewed["gone"] and renewed["left"] > 60 * 60 * 1000,
          "§12 点续期后提示消失、到期时间被推后", str(renewed))
    ctx_se.close()

    # exit intent：只读站点首页，鼠标从顶部离开 -> 出追更卡片，且带真 RSS
    # 站点地址走服务端拿（S.world.slug 是世界内部 slug；而且这时 page 可能正停在站点上，
    # 页面里没有 api() 这个函数）
    site_url = None
    try:
        opener = ensure_login(make_opener())
        with opener.open(f"{BASE}/api/world/publish", timeout=15) as response:
            publish = json.loads(response.read()).get("publish") or {}
        raw = (publish.get("url") or "").strip()
        if publish.get("published") and raw:
            site_url = raw if raw.startswith("http") else BASE + raw
    except Exception as error:                       # noqa: BLE001
        notes.append(f"  · 拿发布地址失败：{error}")
    if not site_url:
        notes.append("  · 这个世界还没发布，§12 退出意图这一项跳过")
    ctx_ei = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    ei = ctx_ei.new_page()
    if site_url:
        ei.goto(site_url, wait_until="networkidle")
        ei.wait_for_timeout(1200)
        published = ei.evaluate("() => !!document.querySelector('.site')")
        if published:
            ei.evaluate("""() => {
              sessionStorage.removeItem('opus.exitIntent');
              const event = new MouseEvent('mouseout', { clientY: 0, bubbles: true });
              document.dispatchEvent(event);
            }""")
            ei.wait_for_timeout(600)
            card = ei.evaluate("""() => {
              const node = document.querySelector('.exit-intent');
              if (!node) return null;
              const feed = node.querySelector('a');
              return {text: node.innerText.slice(0, 90).slice(0, 60), feed: feed ? feed.getAttribute('href') : null};
            }""")
            check(bool(card) and (card["feed"] or "").endswith("/feed.xml"),
                  "§12 站点退出意图提示出现，并且指向真的 RSS", str(card))
            if card and card["feed"]:
                feed_url = card["feed"] if card["feed"].startswith("http") else BASE + card["feed"]
                status = ei.evaluate("""async (url) => (await fetch(url)).status""", feed_url)
                check(status == 200, "§12 订阅地址真的能打开", f"HTTP {status}")
            # 每会话只出现一次
            ei.evaluate("""() => {
              const node = document.querySelector('.exit-intent');
              if (node) node.remove();
              document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0, bubbles: true }));
            }""")
            ei.wait_for_timeout(400)
            again = ei.evaluate("() => !!document.querySelector('.exit-intent')")
            check(not again, "§12 退出意图每会话只出现一次")
        else:
            notes.append("  · 站点还没发布，§12 退出意图这一项跳过")
    ctx_ei.close()

    # ---------------------------------------------------- 图谱：悬停点亮 / 长按拖动联动
    # 找一份图谱文档（没有就跳过）：这一段用真鼠标操作，验的是"好玩"那部分。
    ctx_g = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
    gp = ctx_g.new_page()
    ensure_login_page(gp, navigate=False)
    gp.goto(f"{BASE}/world", wait_until="networkidle")
    gp.wait_for_timeout(1500)
    graph_doc = gp.evaluate("""() => {
      const row = [...document.querySelectorAll('#sbTree .row')].find((r) => {
        const node = findNode(Number(r.dataset.id));
        return node && node.type === 'graph';
      });
      return row ? Number(row.dataset.id) : null;
    }""")
    if graph_doc:
        gp.goto(f"{BASE}/world#doc={graph_doc}", wait_until="networkidle")
        gp.wait_for_timeout(2600)
        # 前面的并排面板检查会留下第二个面板；同一个图谱渲染两份会把坐标量串
        gp.evaluate("""() => { if (S.panels.length > 1) { S.panels.splice(1); renderPanels(); } }""")
        gp.wait_for_timeout(1200)
        hub = gp.evaluate("""() => {
          const uid = [...S.docs.entries()].find(([, e]) => e.document.type === 'graph');
          const nodes = (uid && uid[1].graphUi && uid[1].graphUi.data) ? uid[1].graphUi.data.nodes : [];
          const best = nodes.slice().sort((a, b) => b.degree - a.degree)[0];
          if (!best) return null;
          const g = document.querySelector(`.graph-node[data-node="${best.id}"]`);
          if (!g) return null;
          const c = g.querySelector('circle').getBoundingClientRect();
          return {id: best.id, x: c.x + c.width / 2, y: c.y + c.height / 2, degree: best.degree};
        }""")

        if hub and hub["degree"] > 0:
            # 悬停停一小会儿：点亮（变色 + 连线亮起）
            gp.mouse.move(hub["x"] - 30, hub["y"] - 30)
            gp.wait_for_timeout(120)
            gp.mouse.move(hub["x"], hub["y"])
            gp.wait_for_timeout(120)
            early = gp.evaluate("() => document.querySelectorAll('.graph-node.is-hover').length")
            gp.wait_for_timeout(500)
            lit = gp.evaluate("""() => ({
              hover: document.querySelectorAll('.graph-node.is-hover').length,
              lit: document.querySelectorAll('.graph-link.is-lit').length,
              dimNodes: document.querySelectorAll('.graph-node.is-dim').length,
            })""")
            check(early == 0, "§8.2 悬停不立刻变色（要停一小会儿）", f"120ms 时已亮 {early} 个")
            check(lit["hover"] == 1 and lit["lit"] > 0,
                  "§8.2 悬停一会儿节点变色、相连的线亮起", str(lit))
            check(lit["dimNodes"] > 0, "§8.2 不相干的节点退到后面", str(lit))

            # 长按 -> 拿起来；拖动 -> **跟手** + 整片像鱼群一样流动，且不会打开文档
            before = gp.evaluate("""() => {
              const root = document.querySelectorAll('.graph-canvas')[0] || document;
              return Object.fromEntries([...root.querySelectorAll('.graph-node')]
                .map((g) => [g.dataset.node, g.getAttribute('transform')]));
            }""")
            # 逐帧记录（外部采样会被 Playwright 的调用间隔糊掉，量不出真正的平滑度）
            gp.evaluate("""() => {
              window.__trace = [];
              window.__tracing = true;
              (function tick() {
                const row = {t: performance.now()};
                const root = document.querySelectorAll('.graph-canvas')[0] || document;
                root.querySelectorAll('.graph-node').forEach((g) => {
                  row[g.dataset.node] = g.getAttribute('transform');
                });
                window.__trace.push(row);
                if (window.__tracing) requestAnimationFrame(tick);
              })();
            }""")
            tabs_before = gp.evaluate("() => [...S.panels[0].tabs].length")
            gp.mouse.down()
            gp.wait_for_timeout(240)
            dragging = gp.evaluate("() => document.querySelectorAll('.graph-node.is-dragging').length")
            drift = 0.0
            for step in range(1, 13):
                target = (hub["x"] + step * 26, hub["y"] - step * 15)
                gp.mouse.move(target[0], target[1])
                gp.wait_for_timeout(30)
                # 被拖的点必须就在光标下面（这里是回归护栏：曾经把它算成了"位置 += 总位移"，
                # 于是越拖越飞，用户看到的是"点根本不跟鼠标"）
                pos_now = gp.evaluate("""(id) => {
                  const box = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
                  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
                }""", hub["id"])
                drift = max(drift, ((pos_now["x"] - target[0]) ** 2 + (pos_now["y"] - target[1]) ** 2) ** 0.5)
            check(drift <= 4, "§8.2 拖动时被拖的点严丝合缝跟着指针", f"最大偏差 {drift:.1f}px")
            after = gp.evaluate("""() => {
              const root = document.querySelectorAll('.graph-canvas')[0] || document;
              return Object.fromEntries([...root.querySelectorAll('.graph-node')]
                .map((g) => [g.dataset.node, g.getAttribute('transform')]));
            }""")
            trace = gp.evaluate("() => { window.__tracing = false; return window.__trace; }")
            # 惯性：松手前最后 ~110ms 的指针速度决定"甩"出去多远。
            # 这一段拖动的起点终点都在画布中间，不会撞到边界，量出来的才是真惯性。
            last = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", hub["id"])
            for step in range(1, 6):
                gp.mouse.move(last["x"] - step * 22, last["y"] - step * 12)
                gp.wait_for_timeout(16)
            release_at = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", hub["id"])
            gp.mouse.up()
            gp.wait_for_timeout(300)
            after_release = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", hub["id"])
            glide = (((after_release["x"] - release_at["x"]) ** 2
                      + (after_release["y"] - release_at["y"]) ** 2) ** 0.5)
            check(glide > 12, "§8.2 松手后带惯性继续滑行", f"0.3s 内又滑了 {glide:.0f}px")
            # 甩出去 -> 滑行 -> 弹簧把邻居拽回来 -> "回家"力把被挤开的点送回原位，
            # 整段收敛要几秒（模拟自身 7 秒封顶）。这里等它彻底安静再量。
            gp.wait_for_timeout(8200)

            def offset(text):
                nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", text or "")]
                return (nums[0], nums[1]) if len(nums) >= 2 else (0.0, 0.0)

            moved = []
            for key, value in after.items():
                if key not in before:
                    continue
                dx = offset(value)[0] - offset(before[key])[0]
                dy = offset(value)[1] - offset(before[key])[1]
                if (dx * dx + dy * dy) ** 0.5 > 5:
                    moved.append(key)
            tabs_after = gp.evaluate("() => [...S.panels[0].tabs].length")
            check(dragging == 1, "§8.2 长按之后这个点被拿起来", f"is-dragging {dragging} 个")
            check(len(moved) >= 2, "§8.2 拖动时连着的点被一起拽动（联动）", f"动了 {len(moved)} 个：{moved[:6]}")
            # 邻居应当"滞后跟随"：动，但比被拖的点少（完全跟上就没手感了）
            dragged = offset(after.get(str(hub["id"]), ""))
            dragged0 = offset(before.get(str(hub["id"]), ""))
            dragged_dist = ((dragged[0] - dragged0[0]) ** 2 + (dragged[1] - dragged0[1]) ** 2) ** 0.5
            lags = []
            for key in moved:
                if key == str(hub["id"]):
                    continue
                a0, a1 = offset(before.get(key, "")), offset(after.get(key, ""))
                lags.append((((a1[0] - a0[0]) ** 2 + (a1[1] - a0[1]) ** 2) ** 0.5) / max(dragged_dist, 1))
            # 取中位数：个别的点可能因为向心力 / 弹簧回弹略微超过被拖的点，那不算问题
            median = sorted(lags)[len(lags) // 2] if lags else 1.0
            # 尺寸与配色：差距不能太大；同一层级同一颜色
            look = gp.evaluate("""() => {
              const root = document.querySelectorAll('.graph-canvas')[0] || document;
              const radii = [...root.querySelectorAll('.graph-node circle')].map((c) => Number(c.getAttribute('r')));
              const fills = [...root.querySelectorAll('.graph-node circle')].map((c) => c.getAttribute('fill'));
              return {min: Math.min(...radii), max: Math.max(...radii), colors: [...new Set(fills)].length};
            }""")
            check(look["max"] / max(look["min"], 0.1) <= 1.5,
                  "§8.2 点的大小差距不大（最大 / 最小 ≤ 1.5 倍）",
                  f"{look['min']:.1f} ~ {look['max']:.1f}")
            check(look["colors"] >= 2,
                  "§8.2 按层级上色（同层同色）",
                  f"{look['colors']} 种颜色")

            # 平滑度：逐帧位移（按帧归一化），别一帧一跳
            def xy(text):
                nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", text or "")]
                return (nums[0], nums[1]) if len(nums) >= 2 else None

            per_node = {}
            for first, second in zip(trace, trace[1:]):
                dt = second.get("t", 0) - first.get("t", 0)
                if dt <= 0:
                    continue
                for key, value in second.items():
                    if key == "t" or key == str(hub["id"]):
                        continue
                    one, two = xy(first.get(key)), xy(value)
                    if not one or not two:
                        continue
                    step = (((two[0] - one[0]) ** 2 + (two[1] - one[1]) ** 2) ** 0.5) / dt * 16.7
                    per_node.setdefault(key, []).append(step)
            if per_node:
                # 每个点自己的"典型帧位移"，再看这一群点的中位：
                # 被挤开的那一下单帧会大（果冻就是被推开的），不能当成卡顿
                medians = []
                for key, steps in per_node.items():
                    steps.sort()
                    medians.append(steps[len(steps) // 2])
                medians.sort()
                middle = medians[len(medians) // 2]
                check(middle < 3 and max(medians) < 12,
                      "§8.2 流动是平滑的（每个点的逐帧位移中位 < 3px）",
                      f"中位 {middle:.2f}px · 最跳的点 {max(medians):.2f}px/帧")

            # 松手之后要停下来（不能一直在那儿漂）
            settled = gp.evaluate("""() => {
              const root = document.querySelectorAll('.graph-canvas')[0] || document;
              return Object.fromEntries([...root.querySelectorAll('.graph-node')]
                .map((g) => [g.dataset.node, g.getAttribute('transform')]));
            }""")
            gp.wait_for_timeout(1200)
            still = gp.evaluate("""() => {
              const root = document.querySelectorAll('.graph-canvas')[0] || document;
              return Object.fromEntries([...root.querySelectorAll('.graph-node')]
                .map((g) => [g.dataset.node, g.getAttribute('transform')]));
            }""")
            drift = []
            for key, value in still.items():
                if key not in settled:
                    continue
                a1, a2 = offset(settled[key]), offset(value)
                drift.append((((a2[0] - a1[0]) ** 2 + (a2[1] - a1[1]) ** 2) ** 0.5))
            check(bool(drift) and max(drift) < 3,
                  "§8.2 松手后会安静下来（收敛后就停住）",
                  f"最后 1.2s 里最大位移 {max(drift):.1f}px" if drift else "没测到")

            check(bool(lags) and median < 0.95,
                  "§8.2 邻居是「滞后跟随」而不是硬拽（位移小于被拖的点）",
                  f"邻居/被拖点位移比 {[round(v, 2) for v in sorted(lags)]}")
            check(tabs_after == tabs_before, "§8.2 拖动不会顺手打开文档", f"{tabs_before} -> {tabs_after}")

            # ---- 松手惯性 / 果冻挤开 / 不重合 / 远处的点不受影响 ----
            burst = gp.evaluate("""() => {
              const uid = [...S.docs.entries()].find(([, e]) => e.document.type === 'graph')[1];
              const data = uid.graphUi.data;
              const hub = data.nodes.slice().sort((a, b) => b.degree - a.degree)[0];
              const owner = {};
              data.nodes.forEach((n) => { owner[n.id] = n.id; });
              const find = (x) => { while (owner[x] !== x) x = owner[x]; return x; };
              data.links.forEach((l) => {
                const ra = find(l.source); const rb = find(l.target);
                if (ra !== rb) owner[ra] = rb;
              });
              const at = (id) => {
                const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
                return {x: c.x + c.width / 2, y: c.y + c.height / 2, r: c.width / 2};
              };
              const strangers = data.nodes.filter((n) => find(n.id) !== find(hub.id)).map((n) => ({id: n.id, ...at(n.id)}));
              const me = at(hub.id);
              strangers.sort((a, b) => Math.hypot(b.x - me.x, b.y - me.y) - Math.hypot(a.x - me.x, a.y - me.y));
              const near = strangers[1] || strangers[0];
              const segDist = (q) => {                     // 到"拖动路径"的距离
                const vx = near.x - me.x; const vy = near.y - me.y;
                const len2 = vx * vx + vy * vy || 1;
                let t = Math.max(0, Math.min(1, ((q.x - me.x) * vx + (q.y - me.y) * vy) / len2));
                return Math.hypot(q.x - (me.x + vx * t), q.y - (me.y + vy * t));
              };
              const far = strangers.filter((o) => o.id !== near.id)
                .sort((a, b) => segDist(b) - segDist(a))[0] || near;
              return {hub: hub.id, me, far, near};
            }""")
            # 把被拖的点朝"远处那个不同伙的点"甩过去：路上会撞到 near 那个
            burst_hub = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["hub"])
            far_before = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["far"]["id"])
            target_pt = burst["near"]
            gp.mouse.move(burst_hub["x"], burst_hub["y"])
            gp.wait_for_timeout(300)
            gp.mouse.down()
            gp.wait_for_timeout(200)
            min_gap = 1e9
            # 终点只走到 45% 处：整段拖到底会把指针带出窗口，
            # 出窗口之后 pointermove 不再派发，"最后一段速度"就永远是 0（惯性检查会假红）。
            for step in range(1, 25):
                ratio = (step / 24) * 0.45
                gp.mouse.move(burst_hub["x"] + (target_pt["x"] - burst_hub["x"]) * ratio,
                              burst_hub["y"] + (target_pt["y"] - burst_hub["y"]) * ratio)
                gp.wait_for_timeout(26)
                gaps = gp.evaluate("""(id) => {
                  const root = document.querySelectorAll('.graph-canvas')[0] || document;
                  const me = root.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
                  const mx = me.x + me.width / 2; const my = me.y + me.height / 2; const mr = me.width / 2;
                  let worst = 1e9;
                  root.querySelectorAll('.graph-node circle').forEach((c) => {
                    if (c === me) return;
                    if (c.parentElement.dataset.node === String(id)) return;   // 同 id 的孪生不算
                    const r2 = c.getBoundingClientRect();
                    const gap = Math.hypot(r2.x + r2.width / 2 - mx, r2.y + r2.height / 2 - my) - (mr + r2.width / 2);
                    if (gap < worst) worst = gap;
                  });
                  return worst;
                }""", burst["hub"])
                min_gap = min(min_gap, gaps)
            # 松手：看惯性
            release_at = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["hub"])
            gp.mouse.up()
            gp.wait_for_timeout(200)
            check(min_gap > 0, "§8.2 穿过别的点时不会重合（果冻一样被挤开）", f"最小间隙 {min_gap:.1f}px")
            gp.wait_for_timeout(5000)          # 等它安定
            far_after = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["far"]["id"])
            far_drift = (((far_after["x"] - far_before["x"]) ** 2 + (far_after["y"] - far_before["y"]) ** 2) ** 0.5)
            check(far_drift < 30,
                  "§8.2 没被碰到的点不受鱼群影响（只在被挤到时让开）",
                  f"最远的那个不同伙的点净位移 {far_drift:.0f}px")
            hub_rest = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["hub"])
            gp.wait_for_timeout(1000)
            hub_rest2 = gp.evaluate("""(id) => {
              const c = document.querySelector(`.graph-node[data-node="${id}"] circle`).getBoundingClientRect();
              return {x: c.x + c.width / 2, y: c.y + c.height / 2};
            }""", burst["hub"])
            hold = (((hub_rest2["x"] - hub_rest["x"]) ** 2 + (hub_rest2["y"] - hub_rest["y"]) ** 2) ** 0.5)
            check(hold < 6, "§8.2 被选中的点停住后不被线拽回去（它不受影响）", f"最后 1s 位移 {hold:.1f}px")

            # 干净单击仍然要跳转
            # 挑一个"周围没有别的点压着"的孤立节点：鱼群刚流动过，随便挑一个可能被压在下面，
            # 那样点到的就是别人了（这一步要验的是"单击跳转"，不是命中测试）
            # 光比圆心距离不够——标签画在圆心下方 12px、宽约 80px，能盖住邻点的圆，
            # 所以还要用 elementFromPoint 确认那个点上最上层就是它自己。
            isolated = gp.evaluate("""() => {
              const uid = [...S.docs.entries()].find(([, e]) => e.document.type === 'graph');
              const nodes = (uid && uid[1].graphUi && uid[1].graphUi.data) ? uid[1].graphUi.data.nodes : [];
              const lonely = nodes.filter((n) => n.degree === 0).concat(nodes);
              const centers = [...document.querySelectorAll('.graph-node')].map((g) => {
                const c = g.querySelector('circle').getBoundingClientRect();
                return {id: Number(g.dataset.node), x: c.x + c.width / 2, y: c.y + c.height / 2};
              });
              for (const candidate of lonely) {
                const me = centers.find((c) => c.id === candidate.id);
                if (!me) continue;
                const clash = centers.some((other) => other.id !== me.id
                  && Math.hypot(other.x - me.x, other.y - me.y) < 26);
                if (clash) continue;
                const top = document.elementFromPoint(me.x, me.y);
                const own = top && top.closest ? top.closest('.graph-node') : null;
                if (!own || Number(own.dataset.node) !== me.id) continue;
                return {id: candidate.id, x: me.x, y: me.y};
              }
              return null;
            }""")
            if isolated:
                gp.mouse.click(isolated["x"], isolated["y"])
                gp.wait_for_timeout(1200)
                opened = gp.evaluate("""(id) => S.panels[0].tabs[S.panels[0].active] === id""", isolated["id"])
                check(opened, "§8.2 单击节点跳到对应的那一篇", f"期望 {isolated['id']}")
        else:
            notes.append("  · 图谱里没有带连线的节点，§8.2 图谱交互这一项跳过")
    else:
        notes.append("  · 这个世界没有图谱文档，§8.2 图谱交互这一项跳过")
    ctx_g.close()

    # ---------------------------------------------------- 关系树：骨架与缩放减负
    # 模版接口掐住（abort）：骨架必须浮出来（400ms 之后），数据回来才让位
    ctx_rt = browser.new_context(viewport={"width": 1400, "height": 900}, locale="zh-CN")
    rt = ctx_rt.new_page()
    ensure_login_page(rt, navigate=False)
    rt.route("**/api/world/relationship/templates*", lambda route: route.abort())
    rt.goto(f"{BASE}/relationship", wait_until="domcontentloaded")
    rt.wait_for_function("""() => {
      const node = document.querySelector('#rtTemplateList [data-skeleton]');
      return !!node && +getComputedStyle(node).opacity > 0.9;
    }""", timeout=5000)
    shells = rt.evaluate("""() => {
      const node = document.querySelector('#rtTemplateList [data-skeleton]');
      return node ? +getComputedStyle(node).opacity : -1;
    }""")
    check(shells > 0.5, "§4.1 关系树模版列先给骨架", f"opacity={shells}")
    ctx_rt.close()

    ctx_rt2 = browser.new_context(viewport={"width": 1400, "height": 900}, locale="zh-CN")
    rt2 = ctx_rt2.new_page()
    ensure_login_page(rt2, navigate=False)
    rt2.goto(f"{BASE}/relationship?doc=116", wait_until="domcontentloaded")
    rt2.wait_for_timeout(1800)
    filled = rt2.evaluate("""() => ({
      left: document.querySelectorAll('[data-skeleton]').length,
      nodes: document.querySelectorAll('#rtCanvasWrap .rt-node').length,
    })""")
    check(filled["left"] == 0 and filled["nodes"] > 0, "§4.1 模版到了骨架就让位", str(filled))

    # 缩到很小：名字与加号应当收起来（关系树简化）
    rt2.evaluate("""() => {
      const wrap = document.querySelector('#rtCanvasWrap');
      const rect = wrap.getBoundingClientRect();
      for (let i = 0; i < 16; i += 1) {
        wrap.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, deltaY: 120,
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        }));
      }
    }""")
    rt2.wait_for_timeout(500)
    lod = rt2.evaluate("""() => {
      const wrap = document.querySelector('#rtCanvasWrap');
      const name = wrap.querySelector('.rt-name');
      return {cls: wrap.className, nameOpacity: name ? getComputedStyle(name).opacity : 'n/a',
              nodes: wrap.querySelectorAll('.rt-node').length};
    }""")
    check("is-zoom-far" in lod["cls"], "§7.2 缩小后关系树进入简化档", str(lod))
    check(lod["nameOpacity"] in ("0", 0), "§7.2 简化档里节点名字收起来", str(lod))
    ctx_rt2.close()

    # ---------------------------------------------------- 地图：面板嵌 /map/2d
    # 工作区的地图面板现在是**嵌 /map/2d 独立页**：旧的内嵌渲染器（连同那一版
    # 图钉聚合）已经删掉，图钉/区域/文字的绘制都归独立页管。所以这里不再断言
    # `.map-cluster`（那个类已经没人产出），改验"嵌套契约"是否成立：
    # 面板真的挂上了那张页的 iframe，且独立页能把地图挂起来。
    # 临时建一张地图 + 六个图钉（顺手过一遍图钉接口），验完彻底删。
    scratch = api("/api/world/documents", "POST", {"type": "map", "name": "地图探针 · 临时"})
    scratch_id = scratch["id"]
    try:
        for x, y in [(38, 40), (39.2, 41.5), (40.5, 40.4), (41.6, 41.2), (80, 70), (82, 72)]:
            api(f"/api/world/maps/{scratch_id}/markers", "POST",
                {"kind": "pin", "name": "地图探针点", "x": x, "y": y})

        ctx_map = browser.new_context(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        mp = ctx_map.new_page()
        ensure_login_page(mp, navigate=False)
        # 别等 networkidle：面板里的 iframe（地图）会一直有活动，等不到"完全空闲"，
        # 用 domcontentloaded + 显式等待就够了。
        mp.goto(f"{BASE}/world#doc={scratch_id}", wait_until="domcontentloaded")
        mp.wait_for_timeout(3500)
        frame = mp.evaluate("""() => {
          const f = document.querySelector('iframe.map-frame, iframe.is-live-embed[src*="/map/2d"], iframe[src*="/map/2d"]');
          return f ? {src: f.getAttribute('src'), w: Math.round(f.getBoundingClientRect().width)} : null;
        }""")
        check(bool(frame and "/map/2d" in frame["src"] and frame["w"] > 200),
              "§7.2 工作区地图面板嵌的是 /map/2d 独立页", str(frame))

        mp.goto(f"{BASE}/map/2d?doc={scratch_id}", wait_until="domcontentloaded")
        mp.wait_for_timeout(8000)
        mounted = mp.evaluate("""() => {
          const svg = document.getElementById('map');
          const loading = document.getElementById('loading');
          const bar = document.getElementById('tx-bar');
          return {svg: !!svg, w: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
                  loading: loading ? getComputedStyle(loading).opacity : null,
                  bar: bar ? !!bar.querySelector('.tx-bar__name') : false};
        }""")
        try:
            loading_alpha = float(mounted["loading"])
        except (TypeError, ValueError):
            loading_alpha = 1.0
        check(mounted["svg"] and mounted["w"] > 200 and loading_alpha < 0.05 and mounted["bar"],
              "§7.2 /map/2d 独立页把地图挂起来了（启动屏已收 + 顶栏在）", str(mounted))
        ctx_map.close()
    finally:
        # hard=1：连回收站都不留（软删的话，每跑一次探针就多一篇垃圾）
        try:
            api(f"/api/world/documents/{scratch_id}?hard=1", "DELETE")
        except Exception:                                   # noqa: BLE001
            pass

    browser.close()


def main() -> int:
    with sync_playwright() as pw:
        run(pw)
    print("\n".join(notes))
    if problems:
        print("\n发现问题：")
        print("\n".join(problems))
        return 1
    print("\n体验层检查全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
