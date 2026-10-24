import { useEffect, useState } from "react";
import { Eye, History, Loader2, RotateCcw, X } from "lucide-react";

import { fetchCardRevision, fetchCardRevisions, restoreCardRevision } from "../api";
import { confirmAction } from "../lib/dialogs";
import type { CardDetail, CardRevisionDetail, CardRevisionSummary } from "../types";

interface VersionHistoryDialogProps {
  worldSlug: string;
  card: CardDetail;
  onClose: () => void;
  onRestored: (card: CardDetail) => void;
}

export function VersionHistoryDialog({ worldSlug, card, onClose, onRestored }: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<CardRevisionSummary[]>([]);
  const [currentRevision, setCurrentRevision] = useState(card.revision);
  const [preview, setPreview] = useState<CardRevisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [peeking, setPeeking] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCardRevisions(worldSlug, card.id)
      .then((data) => {
        if (cancelled) return;
        setVersions(data.versions);
        setCurrentRevision(data.card.revision);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "版本历史加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldSlug, card.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const peek = async (version: CardRevisionSummary) => {
    setPeeking(version.index);
    setError(null);
    try {
      setPreview(await fetchCardRevision(worldSlug, card.id, version.index));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "版本读取失败");
    } finally {
      setPeeking(null);
    }
  };

  const restore = async (version: CardRevisionSummary) => {
    const confirmed = await confirmAction({
      title: `回滚到 v${version.index}？`,
      body: "当前内容会先存成一个新版本，回滚后仍可再找回。",
      confirmLabel: "回滚",
    });
    if (!confirmed) return;
    setRestoring(version.index);
    setError(null);
    try {
      const restored = await restoreCardRevision(worldSlug, card.id, version.index);
      onRestored(restored);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回滚失败");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog audit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="versions-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="versions-title">版本历史 · {card.title}</h2>
            <p>当前 r{currentRevision}；每次内容改动会留下上一版的快照。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭版本历史" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在读取版本…
          </div>
        )}
        {!loading && !error && versions.length === 0 && (
          <div className="trash-empty">
            <History size={20} />
            <b>还没有历史版本</b>
            <span>改动正文、标题或封面后，这里会出现上一版的快照。</span>
          </div>
        )}

        {preview && (
          <div className="version-preview">
            <div>
              <b>v{preview.index} · {preview.snapshot.title}</b>
              <span>{preview.snapshot.body_text || "（空白正文）"}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreview(null)}>
              收起
            </button>
          </div>
        )}

        <div className="version-list">
          {versions.map((version) => (
            <div className="version-row" key={version.index}>
              <span className="version-index">v{version.index}</span>
              <div className="version-main">
                <b>{version.summary || "内容改动"}</b>
                <span>
                  {version.author_name ? `@${version.author_name}` : "system"} ·{" "}
                  {new Date(version.created_at).toLocaleString()}
                </span>
              </div>
              <div className="version-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={peeking === version.index}
                  onClick={() => void peek(version)}
                >
                  {peeking === version.index ? <Loader2 size={16} className="spin" /> : <Eye size={16} />}
                  看内容
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={restoring === version.index}
                  onClick={() => void restore(version)}
                >
                  {restoring === version.index ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
                  回滚
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
