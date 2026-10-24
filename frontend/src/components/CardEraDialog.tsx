import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { fetchWorldTimeline, updateCard } from "../api";
import type { CardDetail, TimelineEra } from "../types";

interface CardEraDialogProps {
  worldSlug: string;
  card: CardDetail;
  onClose: () => void;
  onSaved: (card: CardDetail) => void;
}

export function CardEraDialog({ worldSlug, card, onClose, onSaved }: CardEraDialogProps) {
  const [eras, setEras] = useState<TimelineEra[]>([]);
  const [value, setValue] = useState(card.era ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorldTimeline(worldSlug)
      .then((data) => {
        if (!cancelled) setEras(data.eras);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "纪元加载失败");
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

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCard(worldSlug, card.id, { era: value });
      onSaved(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "纪元保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog dialog-compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="era-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="era-title">设置纪元</h2>
            <p>纪元来自世界时间线，用来标记这张卡片所属的年代。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭纪元设置" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}
        {loading ? (
          <div className="loading"><Loader2 size={16} className="spin" /> 正在读取纪元…</div>
        ) : eras.length === 0 ? (
          <p className="dialog-hint">这个世界还没有纪元。先在时间线里创建一个纪元，再回来设置。</p>
        ) : (
          <div className="era-choice-list" role="radiogroup" aria-label="纪元">
            <button
              type="button"
              role="radio"
              aria-checked={value === ""}
              className={value === "" ? "is-active" : ""}
              onClick={() => setValue("")}
            >
              <span className="era-dot" />
              无纪元
              {value === "" && <Check size={16} />}
            </button>
            {eras.map((era) => (
              <button
                key={era.id}
                type="button"
                role="radio"
                aria-checked={value === era.name}
                className={value === era.name ? "is-active" : ""}
                onClick={() => setValue(era.name)}
              >
                <span className="era-dot" style={{ background: era.color }} />
                {era.name}
                <small>{era.start_year}–{era.end_year}</small>
                {value === era.name && <Check size={16} />}
              </button>
            ))}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || loading || eras.length === 0}
            onClick={() => void save()}
          >
            {saving && <Loader2 size={16} className="spin" />}
            保存
          </button>
        </div>
      </section>
    </div>
  );
}
