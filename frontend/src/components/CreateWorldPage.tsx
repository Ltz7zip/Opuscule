import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Box, Globe2, Loader2, Sparkles, Upload } from "lucide-react";

import { createWorld, fetchImportHistory, importWorld, undoImport } from "../api";
import type { ImportHistoryEntry, SessionState } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { confirmAction } from "../lib/dialogs";
import { Topbar } from "./Topbar";

interface CreateWorldPageProps {
  session: SessionState | null;
  onLogout: () => void;
}

export function CreateWorldPage({ session, onLogout }: CreateWorldPageProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({ title: "新建世界 · Opuscule", canonicalPath: "/worlds/new", noindex: true });

  useEffect(() => {
    document.title = "新建世界 · Opuscule";
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const world = await createWorld({
        name: name.trim(),
        description: description.trim(),
        is_public_read: isPublic,
      });
      const overview = world.cards.find((card) => card.slug === "world-overview");
      window.location.assign(`/w/${world.slug}${overview ? `?card=${overview.id}` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false;
    setHistoryLoading(true);
    fetchImportHistory()
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.authenticated]);

  const undo = async (entry: ImportHistoryEntry) => {
    const confirmed = await confirmAction({
      title: "撤销这次导入？",
      body: `「${entry.world.name}」会进入回收站，可以恢复；本次导入的条目会一并回滚。`,
      confirmLabel: "撤销导入",
      danger: true,
    });
    if (!confirmed) return;
    setUndoing(entry.world.slug);
    setError(null);
    try {
      await undoImport(entry.world.slug);
      setHistory((rows) => rows.filter((row) => row.world.slug !== entry.world.slug));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销导入失败");
    } finally {
      setUndoing(null);
    }
  };

  const importZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const world = await importWorld(file);
      window.location.assign(`/w/${world.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败");
      setImporting(false);
    }
  };

  return (
    <div className="app-shell create-world-page">
      <Topbar
        mode="public"
        publicLabel="新建世界"
        session={session}
        onLogout={onLogout}
      />

      <main id="main-content" tabIndex={-1} className="create-world-shell">
        <header className="create-world-hero">
          <a className="back-link" href="/explore">
            <ArrowLeft size={16} /> 公开世界
          </a>
          <span className="eyebrow">
            <Sparkles size={16} />
            新的世界
          </span>
          <h1>给世界一个名字</h1>
          <p>会先建好「人物 / 地点 / 事件」三个 Collection 和一张世界概览卡，之后可以继续加。</p>
        </header>

        {session === null ? (
          <div className="loading">
            <Loader2 size={16} className="spin" />
            正在确认登录状态…
          </div>
        ) : !session.authenticated ? (
          <section className="panel create-world-gate">
            <h2>登录后才能建世界</h2>
            <p>这个世界会归属于你的账号；登录或注册后即可创建。</p>
            <div className="create-world-actions">
              <a className="btn btn-primary" href="/login">登录</a>
              <a className="btn btn-secondary" href="/register">注册</a>
            </div>
          </section>
        ) : (
          <section className="panel create-world-card">
            <div className="create-world-card-head">
              <div className="brand-mark" aria-hidden="true"><Box size={16} /></div>
              <div>
                <div className="sidebar-title">世界档案</div>
                <div className="sidebar-sub">公开状态可以在创建后从工作区切换；名称编辑暂未开放。</div>
              </div>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}

            <form className="create-world-form" onSubmit={submit}>
              <label className="field">
                <span>世界名</span>
                <input
                  name="name"
                  required
                  maxLength={160}
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：潮汐档案"
                />
              </label>
              <label className="field">
                <span>简介 · 可选</span>
                <textarea
                  name="description"
                  rows={4}
                  maxLength={4000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="一句话说明这个世界。"
                />
              </label>

              <label className="create-world-public">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                />
                <span>
                  <b>立即公开 Wiki</b>
                  <small>公开后匿名访客可以浏览 Wiki；不会公开工作区编辑。</small>
                </span>
              </label>

              <div className="create-world-actions">
                <button className="btn btn-primary" type="submit" disabled={loading || importing}>
                  {loading ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                  {loading ? "创建中…" : "创建世界"}
                </button>
                <a className="btn btn-secondary" href="/explore">取消</a>
              </div>
            </form>

            <div className="create-world-import">
              <div>
                <b>从 ZIP 导入</b>
                <p>导入 Opuscule 导出的世界；新世界默认私有，最多 10 MB。</p>
              </div>
              <label className={`btn btn-secondary${importing ? " disabled" : ""}`}>
                {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                {importing ? "导入中…" : "选择 ZIP"}
                <input type="file" accept=".zip,application/zip" onChange={(event) => void importZip(event)} disabled={importing} hidden />
              </label>
            </div>

            {(history.length > 0 || historyLoading) && (
              <div className="import-history">
                <div className="import-history-head">
                  <b>最近导入</b>
                  {historyLoading && <Loader2 size={16} className="spin" />}
                </div>
                {history.map((entry) => (
                  <div className="import-history-row" key={entry.world.slug}>
                    <div>
                      <b>{entry.world.name}</b>
                      <span>
                        {entry.filename ? `${entry.filename} · ` : ""}
                        {new Date(entry.imported_at).toLocaleDateString()}
                      </span>
                    </div>
                    {entry.can_undo ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void undo(entry)} disabled={undoing === entry.world.slug}>
                        {undoing === entry.world.slug ? "撤销中…" : "撤销导入"}
                      </button>
                    ) : (
                      <span className="import-undone">已撤销</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="create-world-foot">
          <Globe2 size={16} />
          世界创建后默认是私有草稿；你可以在这里直接公开，或进入工作区后切换。
        </footer>
      </main>
    </div>
  );
}
