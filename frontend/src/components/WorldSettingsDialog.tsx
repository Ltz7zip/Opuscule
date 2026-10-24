import { useEffect, useState } from "react";
import { Download, Loader2, Save, X } from "lucide-react";

import { deleteWorld, exportWorld, updateWorld } from "../api";
import type { WorldDetail } from "../types";
import { confirmAction } from "../lib/dialogs";

interface WorldSettingsDialogProps {
  world: WorldDetail;
  onClose: () => void;
  onSaved: (world: WorldDetail) => void;
  onDeleted: () => void;
}

export function WorldSettingsDialog({ world, onClose, onSaved, onDeleted }: WorldSettingsDialogProps) {
  const [name, setName] = useState(world.name);
  const [description, setDescription] = useState(world.description);
  const [isPublic, setIsPublic] = useState(world.is_public_read);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWorld(world.slug, {
        name: name.trim(),
        description: description.trim(),
        is_public_read: isPublic,
      });
      onSaved(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportWorld(world.slug);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const destroy = async () => {
    const confirmed = await confirmAction({
      title: "删除这个世界？",
      body: `「${world.name}」会进入回收站，可以恢复；已发出的邀请会被撤销。`,
      confirmLabel: "删除世界",
      danger: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteWorld(world.slug);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
      setDeleting(false);
    }
  };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog world-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="world-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="world-settings-title">世界设置</h2>
            <p>名称、简介与公开状态。公开只影响 Wiki/探索，不开放工作区编辑。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭世界设置" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {error && <div className="form-error" role="alert">{error}</div>}

        <form className="dialog-form" onSubmit={save}>
          <label className="field">
            <span>世界名</span>
            <input
              name="name"
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>简介</span>
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            公开 Wiki（匿名可读）
          </label>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || deleting}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {saving ? "保存中…" : "保存设置"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
          </div>

          <div className="export-zone">
            <div>
              <b>导出世界</b>
              <p>下载 ZIP：world.json、README.md 与 wiki/*.md；包含集合、卡片与地图标记。</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void download()} disabled={exporting || saving || deleting}>
              {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              {exporting ? "导出中…" : "导出 ZIP"}
            </button>
          </div>

          <div className="danger-zone">
            <div>
              <b>删除世界</b>
              <p>进入回收站，可恢复；邀请会同时撤销。不会删除其他成员账号。</p>
            </div>
            <button type="button" className="btn btn-danger" onClick={() => void destroy()} disabled={deleting}>
              {deleting ? "删除中…" : "删除世界"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
