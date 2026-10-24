import { useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, X } from "lucide-react";

import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../api";
import type { NotificationItem } from "../types";

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchNotifications());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const unread = items.filter((item) => !item.read_at).length;

  const read = async (item: NotificationItem) => {
    if (item.read_at) return;
    try {
      const updated = await markNotificationRead(item.id);
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "标记已读失败");
    }
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
      const stamp = new Date().toISOString();
      setItems((current) => current.map((entry) => entry.read_at ? entry : { ...entry, read_at: stamp }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全部已读失败");
    }
  };

  return (
    <div className="notification-wrap">
      <button type="button" className="icon-btn notification-trigger" aria-label={`通知${unread ? `，${unread} 条未读` : ""}`} onClick={() => { setOpen((value) => !value); if (!open) void load(); }}>
        <Bell size={16} />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="通知">
          <div className="notification-head">
            <strong>通知</strong>
            <div>
              <button type="button" onClick={() => void readAll()} aria-label="全部标记已读"><CheckCheck size={16} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭通知"><X size={16} /></button>
            </div>
          </div>
          {loading && <div className="notification-empty"><Loader2 size={16} className="spin" /> 加载中…</div>}
          {error && <div className="notification-empty error-text">{error}</div>}
          {!loading && items.length === 0 && <div className="notification-empty">还没有通知。</div>}
          <div className="notification-list">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`notification-item${item.read_at ? "" : " unread"}`}
                onClick={() => void read(item)}
              >
                <span className="notification-dot" />
                <span>
                  <b>{item.message}</b>
                  <small>{new Date(item.created_at).toLocaleString("zh-CN")}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
