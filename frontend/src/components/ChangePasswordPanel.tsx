import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { changePassword } from "../api";

export function ChangePasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (next !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (next.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage("密码已更新，当前会话保持登录。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改密码失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel password-panel" aria-label="修改密码">
      <div className="password-head">
        <div>
          <div className="sidebar-title"><KeyRound size={16} /> 修改密码</div>
          <div className="sidebar-sub">修改后当前会话保持登录，其他设备需重新登录。</div>
        </div>
      </div>
      <form className="password-form" onSubmit={submit}>
        <label className="field">
          <span>当前密码</span>
          <input required type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        </label>
        <label className="field">
          <span>新密码</span>
          <input required type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
        </label>
        <label className="field">
          <span>确认新密码</span>
          <input required type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={saving || !current || !next || !confirm}>
          {saving ? <Loader2 size={16} className="spin" /> : null}
          {saving ? "更新中…" : "更新密码"}
        </button>
      </form>
      {message && <p className="form-hint">{message}</p>}
      {error && <p className="form-hint error-text" role="alert">{error}</p>}
    </section>
  );
}
