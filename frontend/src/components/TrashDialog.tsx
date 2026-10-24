import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2, X } from "lucide-react";

import { purgeCard, fetchCardTrash, restoreCard } from "../api";
import { confirmAction } from "../lib/dialogs";
import type { CardDetail, TrashCard } from "../types";

interface TrashDialogProps {
  worldSlug: string;
  onClose: () => void;
  onRestored: (card: CardDetail) => void;
}

export function TrashDialog({ worldSlug, onClose, onRestored }: TrashDialogProps) {
  const [cards, setCards] = useState<TrashCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [purging, setPurging] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCardTrash(worldSlug)
      .then((data) => {
        if (!cancelled) setCards(data.cards);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "回收站加载失败");
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

  const purge = async (card: TrashCard) => {
    const confirmed = await confirmAction({
      title: "彻底删除这张卡片？",
      body: `「${card.title}」将不可恢复。`,
      confirmLabel: "彻底删除",
      danger: true,
    });
    if (!confirmed) return;
    setPurging(card.id);
    setError(null);
    try {
      await purgeCard(worldSlug, card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "彻底删除失败");
    } finally {
      setPurging(null);
    }
  };

  const restore = async (card: TrashCard) => {
    setRestoring(card.id);
    setError(null);
    try {
      const restored = await restoreCard(worldSlug, card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
      onRestored(restored);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复卡片失败");
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
        aria-labelledby="trash-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="trash-title">回收站</h2>
            <p>被删除的卡片会先留在这里，可随时恢复。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭回收站" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在读取回收站…
          </div>
        )}
        {!loading && !error && cards.length === 0 && (
          <div className="trash-empty">
            <Trash2 size={20} />
            <b>回收站是空的</b>
            <span>删除卡片后会先放到这里。</span>
          </div>
        )}

        <div className="trash-list">
          {cards.map((card) => (
            <div className="trash-row" key={card.id}>
              <div className="trash-info">
                <b>{card.title}</b>
                <span>
                  {card.deleted_at ? `删除于 ${new Date(card.deleted_at).toLocaleString()}` : "已删除"}
                </span>
              </div>
              <div className="trash-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={restoring === card.id || purging === card.id}
                  onClick={() => void restore(card)}
                >
                  {restoring === card.id ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
                  {restoring === card.id ? "恢复中…" : "恢复"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={restoring === card.id || purging === card.id}
                  onClick={() => void purge(card)}
                >
                  {purging === card.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  {purging === card.id ? "删除中…" : "彻底删除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
