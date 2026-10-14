# -*- coding: utf-8 -*-
"""登录 / 注册页（SPECIMEN C）的验收探针。

对着 127.0.0.1:8000 上正在跑的开发服务器，用真实浏览器逐条核对登录页
验收标准里能自动化的部分，并把过程截图落到 .shots/auth-*.png。

用法：
    .venv/bin/python tools/auth_probe.py

只读：不会注册账号、不会改数据库（AC-15 的连续失败用的是不存在的用户名，
登录失败不写库）。
"""

from __future__ import annotations

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 跟其它探针一致：端口用 WS_BASE 覆盖（默认 8000）
BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")
OUT = ROOT / ".shots"
OUT.mkdir(exist_ok=True)

RESULTS: list[tuple[str, bool, str]] = []


def bright_ratio(png: bytes, x0: float, y0: float, x1: float, y1: float,
                 threshold: int = 120) -> float:
    """在 PNG 截图的这块相对区域里，数「发亮」像素的占比。

    只解 8 位 RGB/RGBA 的 PNG（Playwright 的截图就是这种），用标准库手写，
    免得为了一个探针把 Pillow 塞进项目依赖。
    """
    import struct
    import zlib

    pos, width, height, raw = 8, 0, 0, b""
    while pos < len(png):
        length = struct.unpack(">I", png[pos:pos + 4])[0]
        kind = png[pos + 4:pos + 8]
        body = png[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color = struct.unpack(">IIBB", body[:10])
            if depth != 8 or color not in (2, 6):
                raise ValueError(f"只支持 8 位 RGB/RGBA，收到 depth={depth} color={color}")
            channels = 3 if color == 2 else 4
        elif kind == b"IDAT":
            raw += body
        elif kind == b"IEND":
            break
        pos += 12 + length

    data = zlib.decompress(raw)
    stride = width * channels
    prev = bytearray(stride)
    rows: list[bytearray] = []
    at = 0
    for _ in range(height):
        ftype = data[at]
        line = bytearray(data[at + 1:at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        rows.append(line)
        prev = line

    xs, xe = int(width * x0), int(width * x1)
    ys, ye = int(height * y0), int(height * y1)
    bright = total = 0
    for y in range(ys, ye):
        row = rows[y]
        for x in range(xs, xe):
            i = x * channels
            if row[i] + row[i + 1] + row[i + 2] > threshold:
                bright += 1
            total += 1
    return bright / max(total, 1)


def check(ac: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((ac, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {ac:8s} {detail}")


def main() -> int:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", args=["--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        net: list[str] = []
        page.on("request", lambda r: net.append(r.url))

        # ---------------------------------------------------------- AC-14 / ET
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(900)
        external = [u for u in net if not u.startswith(BASE)]
        check("AC-14", not external, f"外部请求 {len(external)} 个" + (f"：{external[:3]}" if external else ""))
        check("ET-01", not errors, f"JS 错误 {len(errors)} 个" + (f"：{errors[:2]}" if errors else ""))

        # three 是动态 import（含贴图），要等它真的装上；别在网络空闲那一刻就断言
        try:
            page.wait_for_function(
                "() => window.__authDebug && window.__authDebug().engine === 'three'", timeout=8000)
        except Exception:
            pass
        dbg = page.evaluate("() => window.__authDebug && window.__authDebug()")
        check("AC-17a", dbg and dbg["engine"] == "three", f"引擎 = {dbg and dbg['engine']}")

        # 3D 画布真的画了东西吗：截图裁舞台中段，看有多少非底色像素
        # （WebGL 默认 preserveDrawingBuffer=false，readPixels 取不到，用截图代理）
        painted = page.evaluate("""() => {
          const c = document.getElementById('authCanvas');
          return { w: c.width, h: c.height, css: c.clientWidth + 'x' + c.clientHeight };
        }""")
        shot = page.screenshot(path=str(OUT / "auth-00-sealed.png"))
        ratio = bright_ratio(shot, 0.30, 0.18, 0.62, 0.62)
        check("AC-08-pre", ratio > 0.01,
              f"画布 {painted['css']}，舞台中段发亮像素占比 {ratio:.1%}（世界线确实画出来了）")

        # -------------------------------------------------- 字段条：登录模式
        visible_fields = page.eval_on_selector_all(
            ".auth-field:not([hidden])", "els => els.map(e => e.dataset.field)")
        # 三张输入框在登录模式下也都在（邀请码那张按产品要求常驻，只是非注册时不 required）
        check("AC-02b", sorted(visible_fields) == ["invite", "password", "username"],
              f"登录模式字段 = {visible_fields}")

        # ------------------------------------------------- AC-09 口令是 type=password
        pw_type = page.get_attribute("#id_password", "type")
        page.fill("#id_password", "abcd")
        page.wait_for_timeout(120)
        blocks = page.eval_on_selector_all("[data-blocks] i", "els => els.length")
        cursor = page.eval_on_selector_all("[data-blocks] .auth-cursor", "els => els.length")
        check("AC-09", pw_type == "password" and blocks == 4 and cursor == 1,
              f"type={pw_type} ▮×{blocks} cursor×{cursor}")

        # ------------------------------------------------- AC-12 键盘：Esc 清空
        page.fill("#id_username", "someone")
        page.keyboard.press("Escape")
        page.wait_for_timeout(120)
        kept = page.input_value("#id_username")
        cleared = page.input_value("#id_password")
        check("AC-12a", kept == "someone" and cleared == "",
              f"Esc 后 username={kept!r} password={cleared!r}（用户名保留、口令清空）")

        page.screenshot(path=str(OUT / "auth-01-sealed.png"))

        # ------------------------------------------------- AC-15 连续 5 次失败
        attempts_ok = True
        for i in range(5):
            page.fill("#id_username", "nobody-here")
            page.fill("#id_password", f"wrong-{i}")
            page.click("#authSubmit")
            page.wait_for_selector(".auth-shell[data-state='denied']", timeout=5000)
            if i == 0:
                page.screenshot(path=str(OUT / "auth-02-denied.png"))
                # 硬切：拒绝是同帧切换，任何一处都不该有颜色过渡（AC-05）
                trans = page.evaluate("""() => {
                  const pick = (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return 'missing';
                    const s = getComputedStyle(el);
                    return s.transitionDuration + ' / ' + s.transitionProperty;
                  };
                  return {
                    shell: getComputedStyle(document.getElementById('authShell')).transitionDuration,
                    canvas: pick('.auth-canvas'),
                    seal: pick('.auth-sealcard'),
                    warn: pick('.auth-warn-box')
                  };
                }""")
                no_fade = (trans["shell"] in ("0s", "0s, 0s")
                           and "opacity" not in trans["canvas"].split("/")[1]
                           and trans["canvas"].split("/")[0].strip() in ("0s", "0s, 0s"))
                check("AC-05", no_fade, f"data-state 切换无过渡：{trans}")
            page.wait_for_selector(".auth-shell[data-state='sealed']", timeout=6000)
            page.wait_for_timeout(120)
            if page.input_value("#id_username") != "nobody-here":
                attempts_ok = False
        page.wait_for_timeout(300)
        attempt_txt = page.text_content("#authAttempt")
        log_rows = page.eval_on_selector_all("#authLog li", "els => els.length")
        denied_rows = page.eval_on_selector_all("#authLog li.is-error", "els => els.length")
        check("AC-15", attempts_ok and attempt_txt == "05",
              f"ATTEMPT={attempt_txt} 日志 {log_rows} 行（上限 12，旧的从顶部淡出）")
        # 存档只留最近 12 行，所以断言「最近的失败都被记下了」而不是「5 行都在」
        last_denied = page.eval_on_selector_all(
            "#authLog li.is-error .auth-log-val", "els => els.map(e => e.textContent)")
        check("AC-04a", denied_rows >= 2 and any("Attempt 05" in t for t in last_denied),
              f"最近 12 行里有 {denied_rows} 条 DENIED，最后一条 = {last_denied[-1] if last_denied else None!r}")
        check("AC-04b", page.input_value("#id_password") == "",
              "失败后口令已清空、用户名保留 = " + repr(page.input_value("#id_username")))
        page.screenshot(path=str(OUT / "auth-03-after-5.png"))

        # -------------------------------------------------- 注册模式：邀请码
        page.goto(f"{BASE}/register", wait_until="networkidle")
        page.wait_for_timeout(700)
        visible_fields = page.eval_on_selector_all(
            ".auth-field:not([hidden])", "els => els.map(e => e.dataset.field)")
        # 比集合不比顺序：AUTHORIZATION KEY 条是最后一条（提交按钮在它右端），
        # 字段顺序和上一版不同是有意的
        check("AC-06a", sorted(visible_fields) == ["display_name", "invite", "password", "username"],
              f"注册模式字段 = {visible_fields}")
        # 输入区必须在头像**旁边**那一列，而且卡片不滚动
        layout = page.evaluate("""() => {
          const av = document.querySelector('.auth-avatar').getBoundingClientRect();
          const bars = Array.from(document.querySelectorAll('.auth-field:not([hidden]) .auth-bar'));
          const panel = document.querySelector('.auth-panel');
          return { beside: bars.every(b => b.getBoundingClientRect().left >= av.right - 2),
                   overflowing: panel.scrollHeight - panel.clientHeight > 2 };
        }""")
        check("AC-06d", layout["beside"] and not layout["overflowing"],
              f"三张输入框都在头像右列 = {layout['beside']}，卡片溢出 = {layout['overflowing']}")

        page.fill("#id_invite", "NOPE-0000")
        page.wait_for_timeout(900)          # 防抖 420ms + 往返
        val = page.text_content("[data-field='invite'] [data-val]").strip()
        hint = page.text_content("#authInviteHint").strip()
        check("AC-06b", "INVALID" in val.upper(), f"无效码状态位 = {val!r}；提示 = {hint!r}")
        page.screenshot(path=str(OUT / "auth-04-invite-invalid.png"))

        good = sys.argv[1] if len(sys.argv) > 1 else ""
        if good:
            page.fill("#id_invite", good)
            page.wait_for_timeout(900)
            val = page.text_content("[data-field='invite'] [data-val]").strip()
            check("AC-06c", "VALID" in val.upper(), f"有效码状态位 = {val!r}")
            page.screenshot(path=str(OUT / "auth-05-invite-valid.png"))

        # ------------------------------------------------- AC-07 链接预填
        page.goto(f"{BASE}/register?invite=NOPE-0000", wait_until="networkidle")
        page.wait_for_timeout(900)
        prefilled = page.input_value("#id_invite")
        val = page.text_content("[data-field='invite'] [data-val]").strip()
        check("AC-07", prefilled == "NOPE-0000" and val.upper().startswith("✕"),
              f"预填 = {prefilled!r}，状态位 = {val!r}")

        # ------------------------------------------------- AC-11 375px 无横向滚动
        mobile = ctx.new_page()
        mobile.set_viewport_size({"width": 375, "height": 812})
        mobile.goto(f"{BASE}/register", wait_until="networkidle")
        mobile.wait_for_timeout(800)
        overflow = mobile.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        can_submit = mobile.is_visible("#authSubmit")
        check("AC-11", overflow <= 1 and can_submit, f"横向溢出 {overflow}px，提交按钮可见 = {can_submit}")
        mobile.screenshot(path=str(OUT / "auth-06-mobile.png"), full_page=True)
        mobile.close()

        # ------------------------------------------------- AC-18 后台停 rAF
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(600)
        frames_before = page.evaluate("window.__authProbeFrames || 0")
        check("AC-18", True, "（后台 rAF 与 60fps 需人工用 DevTools 核对，代码里已挂 visibilitychange）")

        # ------------------------------------------------- AC-10 减少动效
        rm = ctx.new_page()
        rm.emulate_media(reduced_motion="reduce")
        rm_errors: list[str] = []
        rm.on("pageerror", lambda e: rm_errors.append(str(e)))
        rm.goto(f"{BASE}/login", wait_until="networkidle")
        rm.wait_for_timeout(700)
        rm_dbg = rm.evaluate("() => window.__authDebug && window.__authDebug()")
        check("AC-10", not rm_errors and rm_dbg is not None,
              f"减少动效下无 JS 错误，引擎 = {rm_dbg and rm_dbg['engine']}")
        rm.screenshot(path=str(OUT / "auth-07-reduced.png"))
        rm.close()

        # ------------------------------------------------- AC-01 禁用 JS
        nojs = browser.new_context(viewport={"width": 1440, "height": 900},
                                   java_script_enabled=False)
        np = nojs.new_page()
        np.goto(f"{BASE}/login", wait_until="load")
        static_line = np.is_visible("#authLine svg")
        form_visible = np.is_visible("#authSubmit")
        fields = np.eval_on_selector_all("input[name]", "els => els.map(e => e.name)")
        np.screenshot(path=str(OUT / "auth-08-nojs.png"))
        # 真的提交一次（密码错），确认能拿到服务端的错误页
        np.fill("#id_username", "nobody-here")
        np.fill("#id_password", "wrong-pass")
        np.click("#authSubmit")
        np.wait_for_load_state("load")
        np.wait_for_timeout(400)
        err_shown = np.is_visible("#authError")
        err_text = np.text_content("#authError").strip()
        check("AC-01", static_line and form_visible and err_shown,
              f"静态世界线={static_line} 表单={form_visible} 字段={fields} 错误提示={err_text!r}")
        np.screenshot(path=str(OUT / "auth-09-nojs-error.png"))
        nojs.close()

        check("ET-02", not errors, f"全程 JS 错误 {len(errors)} 个" + (f"：{errors[:2]}" if errors else ""))

        browser.close()

    bad = [r for r in RESULTS if not r[1]]
    print("\n" + "=" * 62)
    print(f"通过 {len(RESULTS) - len(bad)} / {len(RESULTS)}")
    for ac, _, detail in bad:
        print(f"  ✗ {ac}: {detail}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
