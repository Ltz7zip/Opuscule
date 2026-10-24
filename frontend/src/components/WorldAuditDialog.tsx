import { useEffect, useState } from "react";
import { Download, History, Loader2, X } from "lucide-react";

import { exportWorldAudit, fetchWorldAudit } from "../api";
import type { WorldAuditEvent } from "../types";

interface WorldAuditDialogProps {
  worldSlug: string;
  onClose: () => void;
}

function detail(event: WorldAuditEvent): string {
  const parts: string[] = [];
  if (event.target_username) parts.push(`对象 @${event.target_username}`);
  const role = event.metadata.role;
  if (typeof role === "string") parts.push(role);
  const from = event.metadata.from;
  const to = event.metadata.to;
  if (typeof from === "string" && typeof to === "string") parts.push(`${from} → ${to}`);
  const filename = event.metadata.filename;
  if (typeof filename === "string") parts.push(`文件：${filename}`);
  return parts.join(" · ");
}

export function WorldAuditDialog({ worldSlug, onClose }: WorldAuditDialogProps) {
  const [events, setEvents] = useState<WorldAuditEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "imported" | "members" | "settings">("all");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorldAudit(worldSlug)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "活动记录加载失败");
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

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportWorldAudit(
        worldSlug,
        filter === "imported" ? "world.imported" : undefined,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出活动记录失败");
    } finally {
      setExporting(false);
    }
  };

  const visible =
    filter === "all"
      ? events
      : events.filter((event) => {
          if (filter === "imported") return event.action === "world.imported";
          if (filter === "members") {
            return event.action.startsWith("member.") || event.action.startsWith("invite.") || event.action === "ownership.transferred";
          }
          return event.action === "world.settings_updated" || event.action === "world.published" || event.action === "world.unpublished";
        });

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog audit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="audit-title">活动记录</h2>
            <p>世界创建、设置、成员、邀请与所有权变更；最近 100 条。</p>
          </div>
          <div className="dialog-head-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void download()} disabled={exporting}>
              {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              {exporting ? "导出中…" : "导出 CSV"}
            </button>
            <button type="button" className="icon-btn" aria-label="关闭活动记录" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="audit-filters" role="group" aria-label="活动类型筛选">
          {([
            ["all", "全部"],
            ["imported", "导入"],
            ["members", "成员/邀请"],
            ["settings", "设置/公开"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在读取活动记录…
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <p className="member-empty">{filter === "all" ? "还没有活动记录。" : "没有这一类活动。"}</p>
        )}

        <div className="audit-list">
          {visible.map((event) => (
            <div className="audit-row" key={event.id}>
              <span className="audit-icon"><History size={16} /></span>
              <div>
                <b>{event.action_label}</b>
                <span>{detail(event)}</span>
                <small>
                  {event.actor_username ? `@${event.actor_username}` : "system"} ·{" "}
                  {new Date(event.created_at).toLocaleString()}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
