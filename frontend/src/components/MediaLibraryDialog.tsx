import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, RefreshCw, Trash2, Upload, X } from "lucide-react";

import { deleteWorldMedia, fetchWorldMedia, uploadWorldMedia } from "../api";
import type { WorldMediaAsset } from "../types";

interface MediaLibraryDialogProps {
  worldSlug: string;
  open: boolean;
  onClose: () => void;
  onSelect: (image: WorldMediaAsset) => void;
  onUseUrl?: () => void;
  autoUpload?: boolean;
  selectAfterUpload?: boolean;
  title?: string;
}

export function MediaLibraryDialog({
  worldSlug,
  open,
  onClose,
  onSelect,
  onUseUrl,
  autoUpload = false,
  selectAfterUpload = false,
  title = "媒体库",
}: MediaLibraryDialogProps) {
  const [images, setImages] = useState<WorldMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorldMediaAsset | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setImages(await fetchWorldMedia(worldSlug));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "媒体库加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setDeleteTarget(null);
    setDeleteError(null);
    void load();
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = overflow;
      previousFocus.current?.focus({ preventScroll: true });
    };
    // load is intentionally scoped to the open/world transition.
  }, [open, worldSlug]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (deleteTarget) {
        setDeleteTarget(null);
        setDeleteError(null);
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, onClose, open]);

  useEffect(() => {
    if (!open || !autoUpload) return;
    const frame = window.requestAnimationFrame(() => fileRef.current?.click());
    return () => window.cancelAnimationFrame(frame);
  }, [open, autoUpload]);

  if (!open) return null;

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const media = await uploadWorldMedia(worldSlug, file);
      if (selectAfterUpload) {
        onSelect(media);
        onClose();
      } else {
        setImages((current) => [media, ...current]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteWorldMedia(worldSlug, deleteTarget.id);
      setImages((current) => current.filter((image) => image.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "图片删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="editor-media-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="editor-media-dialog">
        <div className="editor-media-head">
          <strong>{title}</strong>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭媒体库">
            <X size={18} />
          </button>
        </div>
        <div className="editor-media-actions">
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <RefreshCw size={16} className="spin" /> : <Upload size={16} />}
            {uploading ? "上传中…" : "上传图片"}
          </button>
          {onUseUrl && (
            <button type="button" className="btn btn-secondary" onClick={() => { onClose(); onUseUrl(); }}>
              <ImageIcon size={16} /> 使用图片地址
            </button>
          )}
          <span className="editor-media-hint">PNG / JPEG / WebP，≤ 4 MB</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        {loading && <p className="form-hint">正在加载…</p>}
        {error && (
          <div className="editor-media-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              <RefreshCw size={14} /> 重试
            </button>
          </div>
        )}
        {!loading && !error && images.length === 0 && (
          <p className="form-hint">还没有已上传图片。上传一张，它会出现在这个世界所有卡片的媒体库里。</p>
        )}
        <div className="editor-media-grid">
          {images.map((image) => {
            const usage = image.usage ?? 0;
            const references = image.references ?? [];
            const referenceLabel = references
              .map((reference) => `${reference.title}（${reference.field}）`)
              .join("、");
            return (
              <div className="editor-media-item" key={image.id}>
                <button
                  type="button"
                  className="editor-media-select"
                  onClick={() => { onSelect(image); onClose(); }}
                >
                  <img src={image.url} alt={image.name} loading="lazy" />
                  <small>{image.name}</small>
                </button>
                <div className="editor-media-meta">
                  <span className={usage > 0 ? "editor-media-usage is-used" : "editor-media-usage"}>
                    {usage > 0 ? `${usage} 处引用` : "未使用"}
                  </span>
                  <button
                    type="button"
                    className="editor-media-delete"
                    disabled={usage > 0 || deleteBusy}
                    onClick={() => {
                      setDeleteTarget(image);
                      setDeleteError(null);
                    }}
                    aria-label={`删除 ${image.name}`}
                    title={usage > 0 ? `仍被引用，不能删除：${referenceLabel}` : "删除图片"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {deleteTarget && (
          <div className="editor-media-confirm" role="alertdialog" aria-modal="true" aria-label="确认删除共享图片">
            <p className="editor-media-confirm-title">删除「{deleteTarget.name}」？</p>
            <p className="editor-media-confirm-text">
              会删除该图片文件；如果仍被卡片或世界概念引用，服务器会拒绝并保留文件。
            </p>
            {deleteError && <p className="editor-media-confirm-error" role="alert">{deleteError}</p>}
            <div className="editor-media-confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                取消
              </button>
              <button type="button" className="btn editor-media-confirm-delete" onClick={() => void remove()} disabled={deleteBusy}>
                {deleteBusy ? "删除中…" : "删除图片"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
