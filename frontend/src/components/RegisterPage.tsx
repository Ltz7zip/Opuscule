import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, UserPlus } from "lucide-react";

import { register } from "../api";
import { useDocumentMeta } from "../lib/meta";
import { nextPath } from "../lib/navigation";
import type { SessionState } from "../types";
import { BrandMark } from "./BrandMark";

interface RegisterPageProps {
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
}

export function RegisterPage({ session, onLogin }: RegisterPageProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentMeta({ title: "注册 · Opuscule", canonicalPath: "/register", noindex: true });

  useEffect(() => {
    document.title = "注册 · Opuscule";
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const next = await register(username.trim(), password, displayName.trim());
      onLogin(next);
      window.location.assign(nextPath("/worlds/new"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell auth-page">
      <main id="main-content" tabIndex={-1} className="auth-shell">
        <header className="auth-header">
          <a className="brand" href="/" aria-label="Opuscule 首页">
            <span className="brand-mark">
              <BrandMark size={15} />
            </span>
            <span className="brand-name">Opuscule</span>
          </a>
          <span className="eyebrow" style={{ marginTop: 34 }}>
            <UserPlus size={13} />
            新的作者
          </span>
          <h1>加入世界线</h1>
          <p>先建立一个作者身份。世界、卡片与公开主页会从这里开始。</p>
        </header>

        <section className="panel auth-card" aria-label="注册">
          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <a href="/login" role="tab" aria-selected="false">
              登录
            </a>
            <a className="active" href="/register" role="tab" aria-selected="true">
              注册
            </a>
          </div>

          {session?.authenticated ? (
            <div className="auth-done">
              <p>已登录为 {session.user?.username}。</p>
              <a className="btn btn-primary" href={`/u/${session.user?.username}`}>
                我的主页 <ArrowRight size={14} />
              </a>
            </div>
          ) : (
            <>
              <div className="auth-card-head">
                <span className="title">创建账号</span>
                <span className="chip">开放注册 · 本地</span>
              </div>
              <p className="auth-meta">不要求邮箱。用户名只用于登录与个人主页地址。</p>

              {error && <div className="form-error" role="alert">{error}</div>}

              <form className="auth-form" onSubmit={submit}>
                <label className="field">
                  <span>用户名</span>
                  <input
                    name="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={32}
                    autoComplete="username"
                    placeholder="3–32 位字母、数字或下划线"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>显示名 · 可选</span>
                  <input
                    name="display_name"
                    type="text"
                    maxLength={80}
                    autoComplete="name"
                    placeholder="留空则用用户名"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>密码</span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="至少 8 位"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>确认密码</span>
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="再输入一次"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                  {loading ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
                  {loading ? "创建中…" : "创建账号"}
                </button>
              </form>

              <a className="auth-back" href="/login">
                <ArrowLeft size={13} />
                已有账号？登录
              </a>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
