import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, LockKeyhole } from "lucide-react";

import { login } from "../api";
import { useDocumentMeta } from "../lib/meta";
import { nextPath } from "../lib/navigation";
import type { SessionState } from "../types";
import { BrandMark } from "./BrandMark";

interface LoginPageProps {
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
}

export function LoginPage({ session, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useDocumentMeta({ title: "登录 · Opuscule", canonicalPath: "/login", noindex: true });

  useEffect(() => {
    document.title = "登录 · Opuscule";
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const next = await login(username.trim(), password);
      onLogin(next);
      const target = nextPath(next.worlds[0]?.slug ? `/w/${next.worlds[0].slug}` : "/w/wuhai");
      window.location.assign(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
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
            <LockKeyhole size={13} />
            世界工作区
          </span>
          <h1>开启世界线</h1>
          <p>登录你的工作区。把设定写成卡片、排成时间线，整理好之后一键发布成只读站点。</p>
        </header>

        <section className="panel auth-card" aria-label="登录">
          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button type="button" className="active" role="tab" aria-selected="true">
              登录
            </button>
            <a href="/register" role="tab" aria-selected="false">
              注册
            </a>
          </div>

          {session?.authenticated ? (
            <div className="auth-done">
              <p>已登录为 {session.user?.username}。</p>
              <a className="btn btn-primary" href="/w/wuhai">
                继续工作 <ArrowRight size={14} />
              </a>
            </div>
          ) : (
            <>
              <div className="auth-card-head">
                <span className="title">凭据登录</span>
                {import.meta.env.DEV && <span className="chip">本地演示</span>}
              </div>
              <p className="auth-meta">世界工作区已封存，请出示你的凭据。</p>

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <form className="auth-form" onSubmit={submit}>
                <label className="field">
                  <span>用户名</span>
                  <input
                    name="username"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder="你的用户名"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>密码</span>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="输入登录密码"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                  {loading ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
                  {loading ? "登录中…" : "登录"}
                </button>
              </form>

              {import.meta.env.DEV && (
                <div className="auth-demo">
                  演示账号 <span className="mono">traveler</span> / <span className="mono">opuscule-demo</span>
                </div>
              )}
              <a className="auth-back" href="/">
                <ArrowLeft size={13} />
                返回公开页
              </a>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
