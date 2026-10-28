import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, History, Loader2, MessageSquareQuote, Save, Send } from "lucide-react";

import {
  ApiError,
  fetchWorldConceptComments,
  fetchWorldConceptEdit,
  publishWorldConcept,
  saveWorldConceptDraft,
} from "../api";
import { confirmAction } from "../lib/dialogs";
import type { SaveState } from "./Topbar";
import { ConceptComments } from "./ConceptComments";
import { ConceptHistoryDialog } from "./ConceptHistoryDialog";
import { EditorShell } from "./EditorShell";
import type { WorldConcept, WorldConceptEdit, WorldDetail, TiptapDoc } from "../types";

const emptyDoc: TiptapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function contentFor(concept: WorldConceptEdit): TiptapDoc {
  const draft = concept.draft_json?.content;
  if (Array.isArray(draft) && draft.length > 0) return concept.draft_json;
  const published = concept.body_json?.content;
  if (Array.isArray(published) && published.length > 0) return concept.body_json as TiptapDoc;
  return emptyDoc;
}

function textLength(value: string | null | undefined): number {
  return (value ?? "").replace(/\s/g, "").length;
}

interface ConceptEditorProps {
  worldSlug: string;
  world: WorldDetail;
  concept: WorldConceptEdit;
  onSaved: (concept: WorldConceptEdit) => void;
  onPublished: (concept: WorldConcept) => void;
  onStatus: (state: SaveState) => void;
  readOnly: boolean;
}

export function ConceptEditor({
  worldSlug,
  world,
  concept,
  onSaved,
  onPublished,
  onStatus,
  readOnly,
}: ConceptEditorProps) {
  const [status, setStatus] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState("刚刚");
  const [dirty, setDirty] = useState(false);
  const [charCount, setCharCount] = useState(textLength(concept.draft_text || concept.body_text));
  const [unpublished, setUnpublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [content, setContent] = useState<TiptapDoc>(() => contentFor(concept));
  const [contentKey, setContentKey] = useState(0);

  const draftRef = useRef<TiptapDoc>(contentFor(concept));
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const lastUpdatedAtRef = useRef<string | null>(concept.updated_at ?? null);
  const editorRef = useRef<Editor | null>(null);

  const publicCards = useMemo(() => world.cards.filter((card) => card.is_public), [world.cards]);

  const published = Boolean(concept.published_at) && !unpublished;

  const setSaveState = useCallback(
    (next: SaveState) => {
      setStatus(next);
      onStatus(next);
    },
    [onStatus],
  );

  const save = useCallback(async () => {
    if (readOnly || !dirtyRef.current || savingRef.current || conflict) return;
    savingRef.current = true;
    const versionAtStart = editVersionRef.current;
    setSaveState("saving");
    setError(null);
    try {
      const updated = await saveWorldConceptDraft(worldSlug, draftRef.current, lastUpdatedAtRef.current);
      if (editVersionRef.current === versionAtStart) {
        dirtyRef.current = false;
        setDirty(false);
      } else {
        dirtyRef.current = true;
        setDirty(true);
      }
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      setSaveState("saved");
      lastUpdatedAtRef.current = updated.updated_at;
      onSaved(updated);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflict(true);
        setError("草稿已在别处更新，自动保存已暂停。");
      } else {
        setError(cause instanceof Error ? cause.message : "草稿保存失败");
      }
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) {
        timerRef.current = window.setTimeout(() => {
          saveRef.current();
        }, 500);
      }
    }
  }, [conflict, onSaved, readOnly, setSaveState, worldSlug]);

  useEffect(() => {
    saveRef.current = () => {
      void save();
    };
  }, [save]);

  useEffect(() => {
    lastUpdatedAtRef.current = concept.updated_at ?? null;
  }, [concept.updated_at]);

  const refreshComments = useCallback(async () => {
    if (readOnly) return;
    try {
      const comments = await fetchWorldConceptComments(worldSlug);
      setUnresolvedCount(comments.filter((comment) => !comment.resolved).length);
    } catch {
      // The count is advisory; a failed request leaves the last known value.
    }
  }, [readOnly, worldSlug]);

  useEffect(() => {
    void refreshComments();
  }, [refreshComments]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleUpdate = useCallback(
    (next: TiptapDoc, count: number) => {
      if (JSON.stringify(next) === JSON.stringify(draftRef.current)) {
        setCharCount(count);
        return;
      }
      draftRef.current = next;
      editVersionRef.current += 1;
      dirtyRef.current = true;
      setDirty(true);
      setCharCount(count);
      setUnpublished(true);
      setSaveState("saving");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => saveRef.current(), 850);
    },
    [setSaveState],
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        void save();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const publish = async () => {
    if (readOnly || publishing || conflict || status === "saving" || charCount === 0) return;
    if (dirtyRef.current) await save();
    const confirmed = await confirmAction({
      title: "发布世界概念",
      body: `当前草稿 ${charCount} 字 · 修订 r${concept.revision}。发布会把当前草稿同步到公开 Wiki；读者看到的是发布时的版本，之后再编辑不会自动更新。`,
      confirmLabel: "发布",
    });
    if (!confirmed) return;
    setPublishing(true);
    setError(null);
    try {
      const next = await publishWorldConcept(worldSlug);
      dirtyRef.current = false;
      setDirty(false);
      setUnpublished(false);
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      setNotice("已发布到搜索与 RSS");
      onPublished(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const adoptDraft = (next: WorldConceptEdit, unpublishedAfter: boolean) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    draftRef.current = next.draft_json;
    editVersionRef.current += 1;
    dirtyRef.current = false;
    setDirty(false);
    setContent(next.draft_json);
    setContentKey((value) => value + 1);
    setCharCount(textLength(next.draft_text));
    setUnpublished(unpublishedAfter);
    setSaveState("saved");
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    lastUpdatedAtRef.current = next.updated_at;
    onSaved(next);
  };

  const restoreFromHistory = (restored: WorldConceptEdit) => {
    adoptDraft(restored, true);
    setHistoryOpen(false);
    setError(null);
  };

  const loadLatest = async () => {
    const confirmed = await confirmAction({
      title: "载入最新草稿",
      body: "当前尚未保存的本地修改会丢失，确定载入服务器上的最新草稿吗？",
      confirmLabel: "载入最新",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const latest = await fetchWorldConceptEdit(worldSlug);
      const changedFromPublished = JSON.stringify(latest.draft_json) !== JSON.stringify(latest.body_json);
      adoptDraft(latest, changedFromPublished);
      setConflict(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "载入最新草稿失败");
    }
  };

  const copyMine = async () => {
    const text = editorRef.current?.getText() ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("复制失败，请手动选中正文复制。");
    }
  };

  const handleEditorReady = useCallback((next: Editor | null) => {
    editorRef.current = next;
  }, []);

  const statusText = readOnly
    ? "只读"
    : status === "error"
      ? "保存失败"
      : status === "saving"
        ? "自动保存…"
        : `已保存 ${savedAt}`;

  return (
    <>
      <EditorShell
        ariaLabel="世界概念编辑器"
        worldSlug={worldSlug}
        cards={publicCards}
        readOnly={readOnly}
        icon={<span className="page-icon" aria-hidden="true">◈</span>}
        kicker={
          <>
            <span className="chip">概念</span>
            <span className="chip chip-state">{published ? "已发布" : "草稿"}</span>
            <span>{worldSlug}</span>
          </>
        }
        title={world.name}
        meta={
          <>
            <span>修订 r{concept.revision}</span>
            <span className="dot" />
            <span>{charCount} 字</span>
            <span className="dot" />
            <span>{statusText}</span>
          </>
        }
        actions={(editor) => (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCommentsOpen(true)}>
              <MessageSquareQuote size={16} /> 评论{unresolvedCount > 0 ? ` ${unresolvedCount}` : ""}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void save()}
              disabled={status === "saving"}
            >
              {status === "saving" ? <Loader2 size={16} className="spin" /> : status === "saved" ? <Check size={16} /> : <Save size={16} />}
              保存
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void publish()}
              disabled={readOnly || publishing || conflict || status === "saving" || charCount === 0}
            >
              {publishing ? <Loader2 size={16} className="spin" /> : <Send size={16} />} 发布
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="版本历史"
              title="版本历史"
              onClick={() => setHistoryOpen(true)}
              disabled={!editor || !concept.published_at}
            >
              <History size={16} />
            </button>
          </>
        )}
        content={content}
        contentKey={contentKey}
        error={
          conflict ? (
            <span className="editor-conflict">
              <span>草稿已在别处更新，自动保存已暂停。</span>
              <span className="editor-conflict-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void loadLatest()}>载入最新草稿</button>
                <button type="button" className="btn btn-secondary" onClick={() => void copyMine()}>复制我的正文</button>
              </span>
            </span>
          ) : error
        }
        footerLeft={notice ?? (readOnly ? "只读视图 · 登录后可编辑" : "输入 / 插入块；选中文字出现格式条；⌘S 保存。")}
        footerRight={<>公开：{published ? "已发布" : "否"}</>}
        onUpdate={handleUpdate}
        onEditorReady={handleEditorReady}
        onAddComment={() => setCommentsOpen(true)}
        dialogs={
          <>
            <ConceptHistoryDialog
              worldSlug={worldSlug}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              cards={publicCards}
              currentRevision={concept.revision}
              onRestore={restoreFromHistory}
            />
            {commentsOpen && (
              <ConceptComments
                worldSlug={worldSlug}
                onClose={() => {
                  setCommentsOpen(false);
                  void refreshComments();
                }}
              />
            )}
          </>
        }
      />
    </>
  );
}
