# -*- coding: utf-8 -*-
"""「还没有主人」时的登录 / 注册页（AC-02）。

不碰开发库：另起一个临时 SQLite，跑完迁移后**一条用户都不建**，
于是权限层认为这是第一次启动，/login 会 302 到 /register，
注册页显示 OWNER INITIALIZATION 而不是邀请码。

用法：
    .venv/bin/python tools/auth_setup_probe.py

截图落到 .shots/auth-setup-*.png；临时库用完即删。
"""

from __future__ import annotations

import os
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8099
BASE = f"http://127.0.0.1:{PORT}"
OUT = ROOT / ".shots"


def main() -> int:
    db_path = pathlib.Path(tempfile.gettempdir()) / "opuscule-auth-setup-probe.sqlite3"
    if db_path.exists():
        db_path.unlink()

    env = dict(os.environ)
    # 走探针 settings：库落在临时目录，绝不碰 db.sqlite3
    env["DJANGO_SETTINGS_MODULE"] = "worldbuilding_timeline.probe_settings"
    env["OPUSCULE_PROBE_DB"] = str(db_path)
    env["PYTHONPATH"] = str(ROOT)
    venv_python = str(ROOT / ".venv" / "bin" / "python")

    import subprocess
    import sys

    subprocess.run([venv_python, "manage.py", "migrate", "--no-input"],
                   cwd=ROOT, env=env, check=True, capture_output=True)
    server = subprocess.Popen([venv_python, "manage.py", "runserver", str(PORT), "--noreload"],
                              cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    results: list[tuple[str, bool, str]] = []
    try:
        import time

        from playwright.sync_api import sync_playwright

        for _ in range(40):
            try:
                import urllib.request
                urllib.request.urlopen(BASE + "/register", timeout=1).read()
                break
            except Exception:
                time.sleep(0.25)

        OUT.mkdir(exist_ok=True)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome")
            page = browser.new_context(viewport={"width": 1440, "height": 900},
                                       device_scale_factor=2).new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))

            # AC-02：无用户时 /login 自动跳 /register
            page.goto(BASE + "/login", wait_until="networkidle")
            page.wait_for_timeout(800)
            redirected = page.url.rstrip("/").endswith("/register")
            results.append(("AC-02a", redirected, f"/login → {page.url}"))

            fields = page.eval_on_selector_all(
                ".auth-field:not([hidden])", "els => els.map(e => e.dataset.field)")
            results.append(("AC-02b", sorted(fields) == ["invite", "password", "username"],
                            f"OWNER 初始化字段 = {fields}（不该出现邀请码）"))

            # 邀请码那张现在常驻（按产品要求），但不该是 required
            invite_required = page.get_attribute("#id_invite", "required")
            results.append(("AC-02c", invite_required is None,
                            f"AUTHORIZATION KEY 模式下的邀请码 required = {invite_required}"))

            cap_zh = page.text_content("#authCapZh").strip()
            # 按标签取 MODE 那一行的值：原来是 .auth-prow:nth-child(3)，加了表头
            # 之后位置就变了，别再依赖序号
            mode = page.evaluate("""() => {
              const rows = Array.from(document.querySelectorAll('.auth-prow'));
              const hit = rows.find(r => (r.querySelector('.auth-k')||{}).textContent.trim().toUpperCase() === 'MODE');
              return hit ? hit.querySelector('.auth-v').textContent.trim() : '';
            }""")
            results.append(("AC-02d", "还没有主人" in cap_zh and mode.upper() == "OWNER INIT",
                            f"字幕 = {cap_zh!r}，档案 MODE = {mode!r}"))
            page.screenshot(path=str(OUT / "auth-setup-01-register.png"))

            # 表单能真的提交（用户名太短 → 服务端的 NOTICE，不是封锁）
            page.fill("#id_username", "ab")
            page.fill("#id_password", "dev-password-1")
            page.click("#authSubmit")
            page.wait_for_selector(".auth-shell[data-state='notice']", timeout=8000)
            cn = page.text_content("#authWarnCn").strip()
            title = page.text_content("#authWarnTitle").strip()
            l2 = page.text_content("#authWarnL2").strip()
            results.append(("AC-02e", cn.startswith("用户名至少") and title == "Notice",
                            f"NOTICE 面板：{title} / {l2} / {cn!r}"))
            # 提示态不该把字幕换回「加入世界」——这里仍然是 OWNER 初始化
            cap_en = page.text_content("#authCapEn").strip()
            results.append(("AC-02f", cap_en.startswith("NO OWNER YET"),
                            f"提示态英文副字幕 = {cap_en!r}"))
            page.screenshot(path=str(OUT / "auth-setup-02-notice.png"))

            results.append(("ET", not errors, f"JS 错误 = {errors[:2]}"))
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()
        if db_path.exists():
            db_path.unlink()

    ok = 0
    for name, passed, detail in results:
        print(f"{'✓' if passed else '✗'} {name:8s} {detail}")
        ok += bool(passed)
    print(f"\n通过 {ok} / {len(results)}")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
