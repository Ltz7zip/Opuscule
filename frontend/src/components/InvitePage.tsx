import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldAlert } from "lucide-react";

import { acceptInvite, fetchInvite } from "../api";
import type { InviteInfo, SessionState } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { Topbar } from "./Topbar";

interface InvitePageProps {
  token: string;
  session: SessionState | null;
  onLogout: () => void;
}

const roleLabels = { editor: "editor · 可编辑", viewer: "viewer · 只读" } as const;

export function InvitePage({ token, session, onLogout }: InvitePageProps) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({ title: "世界邀请 · Opuscule", canonicalPath: `/invite/${token}`, noindex: true });

  useEffect(() => {
    let cancelled = false;
    fetchInvite(token)
      .then((data) => {
        if (!cancelled) setInvite(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "邀请加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    document.title = "世界邀请 · Opuscule";
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptInvite(token);
      window.location.assign(`/w/${result.world.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "接受邀请失败");
      setAccepting(false);
    }
  };

  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="app-shell invite-page">
      <Topbar mode="public" publicLabel="邀请" session={session} onLogout={onLogout} />
      <main id="main-content" tabIndex={-1} className="invite-shell">
        <section className="panel invite-card">
          <div className="invite-mark" aria-hidden="true"><Mail size={20} /></div>

          {loading && (
            <div className="loading">
              <Loader2 size={16} className="spin" /> 正在读取邀请…
            </div>
          )}

          {!loading && error && !invite && (
            <>
              <h1>邀请不可用</h1>
              <p className="invite-copy">{error}</p>
              <a className="btn btn-primary" href="/explore">返回探索 <ArrowRight size={16} /></a>
            </>
          )}

          {!loading && invite && (
            <>
              <span className="eyebrow">世界邀请</span>
              <h1>{invite.world.name}</h1>
              <p className="invite-copy">
                邀请你以 <b>{roleLabels[invite.role]}</b> 的身份加入这个世界。
              </p>

              {!invite.valid ? (
                <div className="invite-state" role="status">
                  <ShieldAlert size={16} />
                  {invite.reason || "邀请已失效"}
                </div>
              ) : invite.already_member ? (
                <div className="invite-state">
                  <CheckCircle2 size={16} />
                  你已经是这个世界成员。
                </div>
              ) : !session?.authenticated ? (
                <div className="invite-auth">
                  <p>登录或注册后才能接受邀请。</p>
                  <div className="invite-actions">
                    <a className="btn btn-primary" href={`/login?next=${next}`}>登录</a>
                    <a className="btn btn-secondary" href={`/register?next=${next}`}>注册</a>
                  </div>
                </div>
              ) : (
                <div className="invite-auth">
                  {error && <div className="form-error" role="alert">{error}</div>}
                  <p>接受后可以在工作区协作；角色由邀请决定。</p>
                  <button type="button" className="btn btn-primary" onClick={() => void accept()} disabled={accepting}>
                    {accepting ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                    {accepting ? "加入中…" : "接受邀请"}
                  </button>
                </div>
              )}

              {invite.valid && invite.already_member && (
                <a className="btn btn-secondary" href={`/w/${invite.world.slug}`} style={{ marginTop: 10 }}>
                  进入工作区
                </a>
              )}
              <p className="invite-expiry">
                有效期至 {new Date(invite.expires_at).toLocaleString()} · 一次性邀请
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
