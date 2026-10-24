import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { login, register } from "../api";
import { useVtTarget } from "../lib/viewTransition";
import { BrandMark } from "./BrandMark";
import { useDocumentMeta } from "../lib/meta";
import type { SessionState } from "../types";

type AuthMode = "login" | "register";
type Phase = "sealed" | "verifying" | "denied" | "unfold";

interface AuthTerminalProps {
  mode: AuthMode;
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
}

const VERSION = "0.1.0-dev";
const WORLD_LABEL = "World Workspace";

const captions = {
  login: {
    zh: "登录你的账号，继续整理世界。",
    en: "SIGN IN TO CONTINUE.",
  },
  register: {
    zh: "创建账号，开始整理你的世界。",
    en: "CREATE AN ACCOUNT TO BEGIN.",
  },
} as const;

function stateLabel(phase: Phase): string {
  if (phase === "verifying") return "验证中";
  if (phase === "denied") return "已拒绝";
  if (phase === "unfold") return "已通过";
  return "未验证";
}

/**
 * 0.8.1 terminal gate, ported into a React page. The legacy auth.css stays
 * mostly intact; only the input mirror/blocks are replaced by real inputs so
 * the native password manager and the new JSON API keep working.
 */
export function AuthTerminal({ mode, session, onLogin }: AuthTerminalProps) {
  const brand = useVtTarget("icon", "brand");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [phase, setPhase] = useState<Phase>("sealed");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [clock, setClock] = useState<{ hm: string; sec: string } | null>(null);

  const isRegister = mode === "register";

  useDocumentMeta({
    title: isRegister ? "注册 · Opuscule" : "登录 · Opuscule",
    canonicalPath: isRegister ? "/register" : "/login",
    noindex: true,
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hm = now.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const sec = String(now.getSeconds()).padStart(2, "0");
      setClock({ hm, sec });
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phase !== "denied") return;
    const timer = window.setTimeout(() => setPhase("sealed"), 4200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const resetPhase = () => {
    if (phase === "denied") {
      setPhase("sealed");
      setError(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phase === "verifying" || phase === "unfold") return;
    const name = username.trim();
    if (!name || !password) return;
    setError(null);
    setPhase("verifying");
    setAttempt((value) => value + 1);
    const started = Date.now();
    try {
      const next = isRegister
        ? await register(name, password, displayName.trim() || name)
        : await login(name, password);
      onLogin(next);
      await new Promise((resolve) =>
        window.setTimeout(resolve, Math.max(0, 520 - (Date.now() - started))),
      );
      setPhase("unfold");
      await new Promise((resolve) => window.setTimeout(resolve, 720));
      if (isRegister) {
        const token = invite.trim();
        window.location.assign(token ? `/invite/${encodeURIComponent(token)}` : "/worlds/new");
      } else {
        const slug = next.worlds[0]?.slug;
        window.location.assign(slug ? `/w/${slug}` : "/w/");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : isRegister ? "注册失败" : "登录失败";
      setError(message);
      setPhase("denied");
    }
  };

  const caption = captions[mode];
  const warningCn = error || (isRegister ? "注册请求没有通过，请检查填写内容。" : "凭据不符，访问已被拒绝。");
  const warningEn = isRegister ? "注册失败" : "登录失败";

  return (
    <div className="auth-terminal">
      <div
        className="auth-shell"
        data-state={phase}
        data-mode={mode}
        data-has-error={error ? "1" : "0"}
      >
        <div className="auth-line" aria-hidden="true">
          <svg viewBox="0 0 720 300" role="img" aria-label="世界线">
            <path d="M20 150 H700" stroke="#2c2a27" strokeWidth="1" />
            <path d="M20 150 H360" stroke="#1f8f5f" strokeWidth="1" />
            <g fill="#3ddc97">
              <rect x="118" y="146" width="8" height="8" />
              <rect x="246" y="146" width="8" height="8" />
              <rect x="360" y="146" width="8" height="8" opacity=".85" />
            </g>
            <g fill="#2c2a27">
              <rect x="474" y="146" width="8" height="8" />
              <rect x="588" y="146" width="8" height="8" />
            </g>
          </svg>
        </div>

        <header className="auth-top">
          <span className="auth-top-mark">
            <a className="auth-top-brand" href="/" aria-label="Opuscule 首页">
              <span className="auth-brand-glyph" ref={brand.ref} style={brand.style} aria-hidden="true">
                <BrandMark size={20} />
              </span>
              Opuscule
            </a>
            <span className="auth-top-ver">{VERSION}</span>
          </span>
          <span className="auth-top-rule" aria-hidden="true" />
          <span className="auth-top-world">{WORLD_LABEL}</span>
          <span className="auth-top-spacer" />
          <span className="auth-top-chip">{stateLabel(phase)}</span>
          <span className="auth-top-clock">
            <b>{clock?.hm ?? "--:--"}</b><i>{clock?.sec ?? "00"}</i>
          </span>
        </header>

        <aside className="auth-rail">
          <div className="auth-brand">
            <div className="auth-secttl"><span>World Workspace</span></div>
            <h1 className="auth-brand-mark">{WORLD_LABEL}</h1>
            <div className="auth-brand-sub">Sealed · {isRegister ? "注册" : "登录"}</div>
          </div>

          <p className="auth-note">
            把设定写成卡片、排成时间线、连成关系树、画成地图；整理好之后，
            一键发布成读者可以直接浏览的只读站点。
          </p>

          <div className="auth-logwrap">
            <div className="auth-secttl"><span>Session Stream</span></div>
            <ul className="auth-log" role="log" aria-label="会话流水">
              {error ? (
                <li className="is-error">
                  <span className="auth-log-cmd">DENIED</span>
                  <span className="auth-log-val">{error}</span>
                </li>
              ) : phase === "unfold" ? (
                <li className="is-grant">
                  <span className="auth-log-cmd">GRANTED</span>
                  <span className="auth-log-val">UNFOLDING</span>
                </li>
              ) : (
                <li>
                  <span className="auth-log-cmd">SESSION</span>
                  <span className="auth-log-val">{phase === "verifying" ? "VERIFYING" : "SEALED"}</span>
                </li>
              )}
            </ul>
          </div>

          <div className="auth-foot">
            <div className="auth-keys">
              <span><b>ENTER</b> 提交</span>
              <span><b>ESC</b> 清空</span>
              <span><b>TAB</b> 换字段</span>
            </div>
            <div className="auth-sealmark auth-mark-sealed">World · Sealed Section</div>
            <div className="auth-elapsed">Uptime <b>00:00:00</b></div>
          </div>
        </aside>

        <main className="auth-stage" id="main-content" tabIndex={-1} data-auth-stage="stage">
          <div className="auth-core" aria-hidden="true">
            <svg className="auth-core-svg" viewBox="0 0 260 260">
              <circle className="g-ring g-a" cx="130" cy="130" r="122" />
              <circle className="g-ring g-b" cx="130" cy="130" r="104" />
              <circle className="g-ring g-c" cx="130" cy="130" r="78" />
              <g className="g-ticks">
                <line x1="130" y1="6" x2="130" y2="16" />
                <line x1="254" y1="130" x2="244" y2="130" />
                <line x1="130" y1="254" x2="130" y2="244" />
                <line x1="6" y1="130" x2="16" y2="130" />
                <line x1="217" y1="43" x2="210" y2="50" />
                <line x1="217" y1="217" x2="210" y2="210" />
                <line x1="43" y1="217" x2="50" y2="210" />
                <line x1="43" y1="43" x2="50" y2="50" />
              </g>
              <circle className="g-scan" cx="130" cy="130" r="92" />
              <g className="g-glyph">
                <circle cx="130" cy="130" r="27" />
                <path d="M130 101 L158 149 H102 Z" />
                <circle className="g-dot" cx="130" cy="130" r="6.4" />
              </g>
            </svg>
          </div>

          <div className="auth-anno auth-anno-tl" aria-hidden="true">
            <span className="auth-anno-tag">Sealed Sect</span>
            <b>Terminal Node</b>
            <span className="auth-anno-sub">{WORLD_LABEL} · Local Access</span>
          </div>
          <div className="auth-anno auth-anno-br" aria-hidden="true">
            <span className="auth-anno-tag">Sealed Sect</span>
            <b>Session Seal</b>
            <span className="auth-anno-sub">Opened {clock?.hm ?? "--:--"} · 1 World Unopened</span>
          </div>

          <div className="auth-verify" aria-hidden="true">
            <div className="auth-verify-box">
              <div className="auth-verify-name">Verifying Identity</div>
              <div className="auth-verify-bar"><i /></div>
              <div className="auth-verify-pct">00%</div>
            </div>
          </div>

          <div className="auth-warn" role="alert" aria-live="assertive">
            <div className="auth-warn-box">
              <div className="auth-warn-t"><span>!</span><span>{warningEn}</span></div>
              <div className="auth-warn-lines">
                <div><b>{isRegister ? "Registration Failed" : "Authentication Failed"}</b></div>
                <div>{isRegister ? "CHECK THE INVITE OR IDENTITY FIELDS" : "CREDENTIALS MISMATCH"}</div>
                <div>{isRegister ? "REQUEST REJECTED" : "ACCESS DENIED"}</div>
                <div className="auth-cn">{warningCn}</div>
              </div>
            </div>
          </div>

          <div className="auth-grant" role="status" aria-live="polite">
            <div className="auth-grant-box">
              <span className="g-blink" />
              <span>Permission Authorized · Unfolding The World Line</span>
            </div>
          </div>
        </main>

        <section className="auth-panel" aria-label="访问契约">
          <header className="auth-panel-head">
            <span className="auth-secttl"><span>Access Contract</span></span>
            <span className="auth-headmeta">
              <span className="auth-headmeta-line">General Access</span>
              <span className="auth-headmeta-badge">OPUSCULE</span>
            </span>
          </header>

          <div className="auth-id-body">
            <div className="auth-heading">
              <h1>{isRegister ? "注册" : "登录"}</h1>
              <p>{isRegister ? "创建账号，开始整理你的世界。" : "继续进入你的世界工作区。"}</p>
            </div>
            <div className="auth-id-head">
              <span className="auth-op">Operator</span>
              <span className="auth-chip">{phase === "unfold" ? "Session Unsealed" : "Session Locked"}</span>
              <span className="auth-attempt">Attempt <b>{String(attempt).padStart(2, "0")}</b></span>
            </div>

            <div className="auth-nameplate">
              <span className={`auth-name${username ? "" : " is-pending"}`}>
                {username || (session?.authenticated ? session.user?.username : "未认领")}
              </span>
            </div>

            <div className="auth-infostrip">
              <span className="auth-infostrip-logo">∞</span>
              <span className="auth-infostrip-txt">Personal Information Loaded</span>
              <span className="auth-infostrip-row"><span>■ SESSION-01</span><span>SEALED</span></span>
            </div>

            <form className="auth-creds" onSubmit={submit} data-mode={mode}>
              <div className="auth-field" data-field="username">
                <div className="auth-fl">
                  <span className="auth-dash" />用户名<span className="auth-r">账号</span>
                </div>
                <div className="auth-bar">
                  <input
                    className="auth-input"
                    id="id_username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                    autoFocus
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      resetPhase();
                    }}
                    aria-label="用户名"
                  />
                </div>
                <div className="auth-under" />
              </div>

              {isRegister && (
                <div className="auth-field" data-field="display_name">
                  <div className="auth-fl">
                    <span className="auth-dash" />显示名<span className="auth-r">可选</span>
                  </div>
                  <div className="auth-bar">
                    <input
                      className="auth-input"
                      id="id_display_name"
                      name="display_name"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      aria-label="显示名（可选）"
                    />
                  </div>
                  <div className="auth-under" />
                </div>
              )}

              <div className="auth-field" data-field="password">
                <div className="auth-fl">
                  <span className="auth-dash" />密码
                  <span className="auth-r"><span className="auth-level">必填</span></span>
                </div>
                <div className="auth-bar has-action">
                  <input
                    className="auth-input is-secret"
                    id="id_password"
                    name="password"
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      resetPhase();
                    }}
                    aria-label="密码"
                  />
                </div>
                <div className="auth-under" />
              </div>

              <div className="auth-field" data-field="invite">
                <div className="auth-fl">
                  <span className="auth-dash" />邀请码<span className="auth-r">可选</span>
                </div>
                <div className="auth-bar">
                  <input
                    className="auth-input"
                    id="id_invite"
                    name="invite"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                    placeholder={isRegister ? "填写邀请码可加入对应世界；当前开放注册" : "注册时使用"}
                    aria-label="邀请码"
                  />
                </div>
                <div className="auth-under" />
              </div>

                  <button className="auth-submit" id="authSubmit" type="submit" disabled={phase === "verifying" || phase === "unfold"}>
                    <span className="auth-submit-fill" aria-hidden="true" />
                    <span className="auth-submit-label">
                      {phase === "verifying" ? "验证中" : isRegister ? "注册" : "登录"}
                    </span>
                    <ArrowRight className="auth-submit-arrow" size={16} aria-hidden="true" />
                  </button>

              {error && <p className="auth-hint" data-state="bad">{error}</p>}
            </form>

            <div className="auth-switch">
              {isRegister ? (
                <>
                  <a href="/login">已有账号 · 去登录</a>
                  <a href="/explore">先看看 →</a>
                </>
              ) : (
                <>
                  <a href="/register">没有账号 · 注册</a>
                  <a href="/explore">先看看 →</a>
                </>
              )}
            </div>

            <footer className="auth-panel-foot">
              <div className="auth-lamps" aria-hidden="true">
                <span className="auth-lamp"><i />Caps</span>
                <span className="auth-lamp is-on"><i />Num</span>
                <span className="auth-lamp is-on"><i />Key</span>
              </div>
              <div className="auth-ctrl" aria-hidden="true">
                <button type="button" className="auth-ctrl-btn" tabIndex={-1}>Hibernate</button>
                <button type="button" className="auth-ctrl-btn" tabIndex={-1}>Reboot</button>
              </div>
            </footer>
          </div>
        </section>

        <footer className="auth-bottom">
          <div className="auth-cap" role="status" aria-live="polite">
            <span className="auth-cap-zh">
              {phase === "verifying"
                ? "正在比对凭据……"
                : phase === "denied"
                  ? "凭据不符，访问已被拒绝。"
                  : phase === "unfold"
                    ? "授权通过，世界线正在展开。"
                    : caption.zh}
            </span>
            <span className="auth-cap-en">
              {phase === "verifying"
                ? "VERIFYING IDENTITY · COMPARING CREDENTIALS"
                : phase === "denied"
                  ? "WARNING · AUTHENTICATION FAILED · CREDENTIALS MISMATCH"
                  : phase === "unfold"
                    ? "PERMISSION AUTHORIZED · UNFOLDING THE WORLD LINE"
                    : caption.en}
            </span>
          </div>
          <div className="auth-statusline">
            <a href="/explore">浏览</a> ·{" "}
            {isRegister ? <a href="/login">登录</a> : <a href="/register">注册</a>}
            {" "}｜ Powered by Opuscule
          </div>
        </footer>
      </div>
    </div>
  );
}
