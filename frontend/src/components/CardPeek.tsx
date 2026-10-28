import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Loader2, RefreshCw, X } from "lucide-react";

import { fetchCardBySlug } from "../api";
import { typeLabel } from "../lib/labels";
import type { CardDetail } from "../types";

interface CardPeekProps {
  worldSlug: string;
  slug: string | null;
  appeared: Array<{ id: string; label: string }>;
  onClose: () => void;
  onGoSection?: (id: string) => void;
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

/** A lightweight world-card peek: enough context to keep reading the concept. */
export function CardPeek({ worldSlug, slug, appeared, onClose, onGoSection }: CardPeekProps) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const open = Boolean(slug);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!slug) {
      setCard(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCardBySlug(worldSlug, slug)
      .then((next) => {
        if (!cancelled) setCard(next);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "词条加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, worldSlug]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("concept-peek-active");
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      document.body.classList.remove("concept-peek-active");
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const retry = () => {
    if (!slug) return;
    setError(null);
    setLoading(true);
    fetchCardBySlug(worldSlug, slug)
      .then(setCard)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "词条加载失败"))
      .finally(() => setLoading(false));
  };

  return createPortal(
    <>
      <div className="concept-peek-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="concept-peek"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concept-peek-title"
      >
        <div className="concept-peek-head">
          <span className="concept-peek-kind">
            {card ? `CARD / ${typeLabel(card.type_key)}` : "CARD / 词条"}
          </span>
          <button ref={closeRef} type="button" className="concept-peek-close" onClick={onClose} aria-label="关闭词条侧窥">
            <X size={18} />
          </button>
        </div>
        <div className="concept-peek-body" aria-busy={loading}>
          {loading && (
            <p className="concept-peek-loading" role="status">
              <Loader2 size={16} className="spin" /> 正在打开词条…
            </p>
          )}
          {error && (
            <div className="concept-peek-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary" onClick={retry}>
                <RefreshCw size={14} /> 重试
              </button>
            </div>
          )}
          {!loading && !error && card && (
            <>
              <h2 id="concept-peek-title">{card.title}</h2>
              <p className="concept-peek-excerpt">
                {card.body_text || "这张词条还没有正文。"}
              </p>
              <p className="concept-peek-meta">
                {typeLabel(card.type_key)} · 修订 {card.revision}
                {card.updated_at ? ` · 更新 ${shortDate(card.updated_at)}` : ""}
              </p>
              <div className="concept-peek-appeared">
                <span>出现在</span>
                {appeared.length === 0 ? (
                  <p className="concept-peek-empty">还没有被概念引用。它仍然在设定集里。</p>
                ) : (
                  appeared.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onGoSection?.(section.id);
                      }}
                    >
                      {section.label}
                    </button>
                  ))
                )}
              </div>
              <div className="concept-peek-actions">
                <a className="concept-peek-open" href={`/w/${worldSlug}/wiki/${card.slug}`} onClick={onClose}>
                  打开完整词条 <ArrowUpRight size={14} />
                </a>
                <p className="concept-peek-hint">Esc 关闭 · 点击空白处关闭</p>
              </div>
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
