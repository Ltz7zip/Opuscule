import { useEffect, useState } from "react";
import { ArrowRightLeft, Check, Copy, Link2, Loader2, Shield, Trash2, UserPlus, X } from "lucide-react";

import {
  addWorldMember,
  createWorldInvite,
  fetchWorldInvites,
  fetchWorldMembers,
  removeWorldMember,
  revokeWorldInvite,
  transferOwnership,
  updateWorldMember,
} from "../api";
import type { WorldInvite, WorldMember } from "../types";
import { confirmAction } from "../lib/dialogs";
import { SelectMenu } from "./SelectMenu";

interface WorldMembersDialogProps {
  worldSlug: string;
  onClose: () => void;
}

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function WorldMembersDialog({ worldSlug, onClose }: WorldMembersDialogProps) {
  const [members, setMembers] = useState<WorldMember[]>([]);
  const [invites, setInvites] = useState<WorldInvite[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [transferTarget, setTransferTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchWorldMembers(worldSlug), fetchWorldInvites(worldSlug)])
      .then(([nextMembers, nextInvites]) => {
        if (cancelled) return;
        setMembers(nextMembers);
        setInvites(nextInvites);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "成员列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldSlug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const member = await addWorldMember(worldSlug, username.trim(), role);
      setMembers((current) => [...current, member]);
      setUsername("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "添加成员失败");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (member: WorldMember, next: "editor" | "viewer") => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWorldMember(worldSlug, member.id, next);
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改角色失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: WorldMember) => {
    const confirmed = await confirmAction({
      title: "移除这位成员？",
      body: `${member.display_name} 将失去这个世界的访问权限。`,
      confirmLabel: "移除成员",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await removeWorldMember(worldSlug, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除成员失败");
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    const member = members.find((item) => item.username === transferTarget);
    if (!member) return;
    const confirmed = await confirmAction({
      title: "转移世界所有权？",
      body: `转移给 ${member.display_name} 后，你会变成 editor，且无法自行撤回。`,
      confirmLabel: "转移所有权",
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await transferOwnership(worldSlug, member.username);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "转移所有权失败");
      setBusy(false);
    }
  };

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const invite = await createWorldInvite(worldSlug, inviteRole);
      setInvites((current) => [invite, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成邀请失败");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (invite: WorldInvite) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token));
      setCopied(invite.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("复制失败，请手动复制链接");
    }
  };

  const revoke = async (invite: WorldInvite) => {
    const confirmed = await confirmAction({
      title: "撤销这条邀请链接？",
      body: "该链接会立即失效。",
      confirmLabel: "撤销链接",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await revokeWorldInvite(worldSlug, invite.id);
      setInvites((current) =>
        current.map((item) =>
          item.id === invite.id ? { ...item, revoked_at: new Date().toISOString() } : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销邀请失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog members-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="members-title">成员与邀请</h2>
            <p>owner 可以添加已注册用户，或生成一次性邀请链接给其他人。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭成员管理" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}

        <form className="member-add" onSubmit={add}>
          <label className="field">
            <span>已注册用户名</span>
            <input
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="直接添加账号"
            />
          </label>
          <label className="field member-role-field">
            <span>角色</span>
            <SelectMenu
              compact
              value={role}
              onChange={(value) => setRole(value as "editor" | "viewer")}
              ariaLabel="成员角色"
              options={[
                { value: "viewer", label: "viewer · 只读" },
                { value: "editor", label: "editor · 可编辑" },
              ]}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !username.trim()}>
            <UserPlus size={16} /> 添加
          </button>
        </form>

        <div className="member-list">
          {loading && (
            <div className="loading">
              <Loader2 size={16} className="spin" /> 正在读取成员…
            </div>
          )}
          {!loading && members.length === 0 && <p className="member-empty">还没有成员。</p>}
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <span className="avatar">{member.display_name.slice(0, 1).toUpperCase()}</span>
              <div className="member-id">
                <b>{member.display_name}</b>
                <span>@{member.username}</span>
              </div>
              {member.role === "owner" ? (
                <span className="member-owner"><Shield size={16} /> owner</span>
              ) : (
                <>
                  <SelectMenu
                    compact
                    className="member-role"
                    ariaLabel={`修改 ${member.username} 的角色`}
                    value={member.role}
                    disabled={busy}
                    onChange={(value) => void changeRole(member, value as "editor" | "viewer")}
                    options={[
                      { value: "viewer", label: "viewer" },
                      { value: "editor", label: "editor" },
                    ]}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`移除 ${member.username}`}
                    title="移除成员"
                    disabled={busy}
                    onClick={() => void remove(member)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="ownership-transfer">
          <div className="invite-create-head">
            <div>
              <div className="sidebar-title">转移所有权</div>
              <div className="sidebar-sub">转移后你会变成 editor；只能转给现有成员。</div>
            </div>
            <SelectMenu
              compact
              className="member-role"
              ariaLabel="选择新 owner"
              value={transferTarget}
              onChange={setTransferTarget}
              options={[
                { value: "", label: "选择成员…" },
                ...members.filter((member) => member.role !== "owner").map((member) => ({
                  value: member.username,
                  label: `${member.display_name} · ${member.role}`,
                })),
              ]}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !transferTarget}
              onClick={() => void transfer()}
            >
              <ArrowRightLeft size={16} /> 转移
            </button>
          </div>
        </div>

        <div className="invite-create">
          <div className="invite-create-head">
            <div>
              <div className="sidebar-title">邀请链接</div>
              <div className="sidebar-sub">一次性、7 天有效；对方登录/注册后接受。</div>
            </div>
            <SelectMenu
              compact
              className="member-role"
              ariaLabel="邀请角色"
              value={inviteRole}
              onChange={(value) => setInviteRole(value as "editor" | "viewer")}
              options={[
                { value: "viewer", label: "viewer · 只读" },
                { value: "editor", label: "editor · 可编辑" },
              ]}
            />
            <button type="button" className="btn btn-secondary" onClick={() => void createInvite()} disabled={busy}>
              <Link2 size={16} /> 生成链接
            </button>
          </div>

          <div className="invite-list">
            {invites.length === 0 && <p className="member-empty">还没有邀请链接。</p>}
            {invites.map((invite) => {
              const valid =
                !invite.revoked_at &&
                new Date(invite.expires_at) > new Date() &&
                invite.used_count < invite.max_uses;
              return (
                <div className={`invite-row${valid ? "" : " expired"}`} key={invite.id}>
                  <span className="invite-role">{invite.role}</span>
                  <code>{inviteUrl(invite.token)}</code>
                  <span className="invite-state-label">
                    {valid ? `${invite.used_count}/${invite.max_uses} 已用` : invite.revoked_at ? "已撤销" : "已失效"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="复制邀请链接"
                    title="复制链接"
                    onClick={() => void copy(invite)}
                  >
                    {copied === invite.id ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  {!invite.revoked_at && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="撤销邀请"
                      title="撤销"
                      disabled={busy}
                      onClick={() => void revoke(invite)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="member-hint">
          <Link2 size={16} /> 邀请链接只能使用一次；不会通过邮件发送，请手动复制。
        </p>
      </section>
    </div>
  );
}
