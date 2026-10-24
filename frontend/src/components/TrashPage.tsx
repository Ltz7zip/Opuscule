import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from "lucide-react";

import { fetchTrash, restoreWorld } from "../api";
import type { SessionState, WorldSummary } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { Topbar } from "./Topbar";

interface TrashPageProps {
  session: SessionState | null;
  onLogout: () => void;
}

export function TrashPage({ session, onLogout }: TrashPageProps) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({ title: "回收站 · Opuscule", canonicalPath: "/trash", noindex: true });

  useEffect(() => {
    let cancelled = false;
    fetchTrash()
      .then((data) => {
        if (!cancelled) setWorlds(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "回收站加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    document.title = "回收站 · Opuscule";
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async (world: WorldSummary) => {
    setBusy(world.id);
    setError(null);
    try {
      await restoreWorld(world.slug);
      window.location.assign(`/w/${world.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败");
      setBusy(null);
    }
  };

  return (
    <div className="app-shell trash-page">
      <Topbar mode="public" publicLabel="回收站" session={session} onLogout={onLogout} />
      <main id="main-content" tabIndex={-1} className="trash-shell">
        <header className="trash-hero">
          <a className="back-link" href="/explore">
            <ArrowLeft size={16} /> 返回探索
          </a>
          <span className="eyebrow"><Trash2 size={16} /> 回收站</span>
          <h1>已删除的世界</h1>
          <p>软删除的世界会留在这里，owner 可以恢复；邀请会失效。</p>
        </header>

        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在读取回收站…
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        {!loading && !error && worlds.length === 0 && (
          <div className="empty">
            <span className="empty-icon"><Trash2 size={20} /></span>
            <div>
              <h2>回收站是空的</h2>
              <p>删除的世界会出现在这里。</p>
            </div>
          </div>
        )}

        {!loading && worlds.length > 0 && (
          <div className="trash-list">
            {worlds.map((world) => (
              <article className="trash-row" key={world.id}>
                <div>
                  <h2>{world.name}</h2>
                  <p>{world.description || "没有简介。"}</p>
                  <span className="trash-meta">
                    /{world.slug}
                    {world.deleted_at ? ` · 删除于 ${new Date(world.deleted_at).toLocaleString()}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy === world.id}
                  onClick={() => void restore(world)}
                >
                  {busy === world.id ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
                  {busy === world.id ? "恢复中…" : "恢复"}
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
