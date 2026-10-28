import { useEffect, useRef, useState } from "react";
import { History, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";

import {
  fetchWorldConceptRevision,
  fetchWorldConceptRevisions,
  restoreWorldConceptRevision,
} from "../api";
import type {
  CardSummary,
  WorldConceptEdit,
  WorldConceptRevisionDetail,
  WorldConceptRevisionSummary,
} from "../types";
import { RichText } from "./RichText";

interface ConceptHistoryDialogProps {
  worldSlug: string;
  open: boolean;
  onClose: () => void;
  cards: CardSummary[];
  currentRevision: number;
  onRestore: (concept: WorldConceptEdit) => void;
}

function shortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

export function ConceptHistoryDialog({
  worldSlug,
  open,
  onClose,
  cards,
  currentRevision,
  onRestore,
}: ConceptHistoryDialogProps) {
  const [rows, setRows] = useState<WorldConceptRevisionSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<WorldConceptRevisionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [detailTick, setDetailTick] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWorldConceptRevisions(worldSlug);
      setRows(next);
      setSelected((current) => {
        if (current !== null && next.some((row) => row.revision === current)) return current;
        return next[0]?.revision ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "版本历史加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setRestoreOpen(false);
    setRestoreError(null);
    setSelected(null);
    setDetail(null);
    void loadList();
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
      previousFocus.current?.focus({ preventScroll: true });
    };
    // load is scoped to the open transition.
  }, [open, worldSlug]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (restoreOpen) {
        setRestoreOpen(false);
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, restoreOpen, onClose]);

  useEffect(() => {
    if (!open || selected === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    fetchWorldConceptRevision(worldSlug, selected)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((cause) => {
        if (!cancelled) setDetailError(cause instanceof Error ? cause.message : "版本加载失败");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailTick, open, selected, worldSlug]);

  if (!open) return null;

  const restore = async () => {
    if (selected === null) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const restored = await restoreWorldConceptRevision(worldSlug, selected);
      onRestore(restored);
      onClose();
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : "恢复失败");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="editor-media-overlay" role="dialog" aria-modal="true" aria-label="世界概念版本历史">
      <div className="editor-media-dialog concept-history-dialog">
        <div className="editor-media-head">
          <strong className="concept-history-title">
            <History size={16} /> 版本历史
          </strong>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭版本历史">
            <X size={18} />
          </button>
        </div>
        {loading && (
          <p className="form-hint">
            <Loader2 size={15} className="spin" /> 正在加载版本…
          </p>
        )}
        {error && (
          <div className="editor-media-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void loadList()}>
              <RefreshCw size={14} /> 重试
            </button>
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="concept-history-empty">发布后才会产生版本记录。当前还没有已发布版本。</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="concept-history-layout">
            <aside className="concept-history-list" aria-label="已发布版本">
              {rows.map((row) => (
                <button
                  key={row.revision}
                  type="button"
                  className={`concept-history-item${selected === row.revision ? " is-active" : ""}`}
                  onClick={() => setSelected(row.revision)}
                  aria-current={selected === row.revision ? "true" : undefined}
                >
                  <span className="concept-history-item-head">
                    <b>修订 {row.revision}</b>
                    {row.revision === currentRevision && <em>当前</em>}
                  </span>
                  <span className="concept-history-meta">
                    {shortDate(row.published_at)} · {row.created_by || "未知作者"} · {row.char_count} 字
                  </span>
                </button>
              ))}
            </aside>
            <section className="concept-history-detail" aria-label="版本内容">
              {detailLoading && (
                <p className="form-hint">
                  <Loader2 size={15} className="spin" /> 正在加载版本内容…
                </p>
              )}
              {detailError && (
                <div className="editor-media-error" role="alert">
                  <span>{detailError}</span>
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailTick((value) => value + 1)}>
                    <RefreshCw size={14} /> 重试
                  </button>
                </div>
              )}
              {!detailLoading && !detailError && detail && (
                <>
                  <div className="concept-history-detail-head">
                    <div>
                      <p className="concept-history-kicker">修订 {detail.revision}</p>
                      <p className="concept-history-meta">
                        {shortDate(detail.published_at)} · {detail.created_by || "未知作者"} · {detail.char_count} 字
                      </p>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => setRestoreOpen(true)}>
                      <RotateCcw size={15} /> 恢复为草稿
                    </button>
                  </div>
                  <div className="concept-history-preview">
                    <RichText
                      doc={detail.body_json}
                      cards={cards}
                      worldSlug={worldSlug}
                      autoLink={false}
                      mentionMode="reading"
                    />
                  </div>
                  {restoreOpen && (
                    <div className="concept-history-confirm" role="alertdialog" aria-label="确认恢复版本">
                      <p>把修订 {detail.revision} 恢复为当前草稿？</p>
                      <p className="form-hint">公开页面不会改变；恢复后需要再次发布才会生效。</p>
                      {restoreError && <p className="editor-media-confirm-error" role="alert">{restoreError}</p>}
                      <div className="concept-history-confirm-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setRestoreOpen(false)} disabled={restoring}>
                          取消
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => void restore()} disabled={restoring}>
                          {restoring ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}
                          {restoring ? "恢复中…" : "恢复为草稿"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
