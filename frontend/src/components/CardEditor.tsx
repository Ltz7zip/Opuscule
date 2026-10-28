import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, Loader2, MessageSquareQuote, Save } from "lucide-react";

import { updateCard } from "../api";
import { promptAction } from "../lib/dialogs";
import { useVtTarget } from "../lib/viewTransition";
import { EditorShell } from "./EditorShell";
import type { CardDetail, CardSummary, TiptapDoc } from "../types";
import type { SaveState } from "./Topbar";

const CommentsPanel = lazy(() =>
  import("./CommentsPanel").then((module) => ({ default: module.CommentsPanel })),
);

const emptyDoc: TiptapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const typeLabels: Record<string, string> = {
  character: "角色",
  place: "地点",
  event: "事件",
  note: "笔记",
  tool: "工具",
};

function contentFor(card: CardDetail): TiptapDoc {
  const content = card.body_json?.content;
  return Array.isArray(content) ? card.body_json : emptyDoc;
}

interface CardEditorProps {
  worldSlug: string;
  card: CardDetail;
  cards: CardSummary[];
  onSaved: (card: CardDetail) => void;
  onStatus: (state: SaveState) => void;
  readOnly: boolean;
  /** Transient target name for the tree-row -> editor-header morph. */
  vtSlug?: string | null;
}

export function CardEditor({ worldSlug, card, cards, onSaved, onStatus, readOnly, vtSlug }: CardEditorProps) {
  const pageIcon = useVtTarget("icon", vtSlug ?? "");
  const [title, setTitle] = useState(card.title);
  const [icon, setIcon] = useState(card.icon ?? "");
  const [cover, setCover] = useState(card.cover ?? "");
  const [status, setStatus] = useState<SaveState>("saved");
  const [charCount, setCharCount] = useState(card.body_text.replace(/\s/g, "").length);
  const [savedAt, setSavedAt] = useState<string>("刚刚");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentQuote, setCommentQuote] = useState("");
  const [commentAnchorId, setCommentAnchorId] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);

  const commentRange = useRef<{ from: number; to: number } | null>(null);
  const titleRef = useRef(card.title);
  const bodyRef = useRef<TiptapDoc>(contentFor(card));
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const saveRef = useRef<() => void>(() => {});
  const editorRef = useRef<Editor | null>(null);

  const setSaveState = useCallback(
    (next: SaveState) => {
      setStatus(next);
      onStatus(next);
    },
    [onStatus],
  );

  const save = useCallback(async () => {
    if (readOnly || !dirtyRef.current || savingRef.current) return;
    savingRef.current = true;
    const versionAtStart = editVersionRef.current;
    setSaveState("saving");
    try {
      const updated = await updateCard(worldSlug, card.id, {
        title: titleRef.current,
        icon,
        cover,
        body_json: bodyRef.current,
      });
      if (editVersionRef.current === versionAtStart) {
        dirtyRef.current = false;
      } else {
        dirtyRef.current = true;
      }
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      onSaved(updated);
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) {
        timerRef.current = window.setTimeout(() => {
          saveRef.current();
        }, 300);
      }
    }
  }, [card.id, cover, icon, onSaved, readOnly, setSaveState, worldSlug]);

  useEffect(() => {
    saveRef.current = () => {
      void save();
    };
  }, [save]);

  const handleUpdate = useCallback(
    (next: TiptapDoc, count: number) => {
      // Tiptap emits an update while mounting with the already-loaded document.
      // Treat that as a no-op so opening a card no longer bumps its revision.
      if (JSON.stringify(next) === JSON.stringify(bodyRef.current)) {
        setCharCount(count);
        return;
      }
      bodyRef.current = next;
      editVersionRef.current += 1;
      setCharCount(count);
      dirtyRef.current = true;
      setSaveState("saving");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        saveRef.current();
      }, 850);
    },
    [setSaveState],
  );

  useEffect(() => {
    titleRef.current = card.title;
    bodyRef.current = contentFor(card);
    setTitle(card.title);
    setIcon(card.icon ?? "");
    setCover(card.cover ?? "");
    setCharCount(card.body_text.replace(/\s/g, "").length);
    setSavedAt("刚刚");
    setSaveState("saved");
    dirtyRef.current = false;
  }, [card.id, setSaveState]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        void save();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [save]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onTitleChange = (value: string) => {
    if (readOnly) return;
    setTitle(value);
    titleRef.current = value;
    editVersionRef.current += 1;
    dirtyRef.current = true;
    setSaveState("saving");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      saveRef.current();
    }, 850);
  };

  const openComments = (range: { from: number; to: number } | null, quote: string) => {
    commentRange.current = range;
    setCommentQuote(quote);
    setCommentAnchorId(crypto.randomUUID());
    setCommentsOpen(true);
  };

  const handleEditorReady = useCallback((next: Editor | null) => {
    editorRef.current = next;
  }, []);

  const typeLabel = typeLabels[card.type_key] ?? (card.type_key || "卡片");

  return (
    <EditorShell
      ariaLabel="卡片编辑器"
      worldSlug={worldSlug}
      cards={cards}
      currentSlug={card.slug}
      readOnly={readOnly}
      cover={cover || undefined}
      icon={
        <button
          type="button"
          className="page-icon"
          aria-label="设置页面图标"
          ref={vtSlug ? pageIcon.ref : undefined}
          style={vtSlug ? pageIcon.style : undefined}
          onClick={async () => {
            const value = await promptAction({
              title: "页面图标",
              label: "图标",
              hint: "一个字符或 emoji。",
              defaultValue: icon || "✦",
              confirmLabel: "保存",
            });
            if (value === null) return;
            const next = value.trim().slice(0, 4);
            setIcon(next);
            void updateCard(worldSlug, card.id, { icon: next, cover }).then(onSaved).catch(() => setEditorError("图标保存失败"));
          }}
        >{icon || "＋"}</button>
      }
      kicker={
        <>
          <span className="chip">{typeLabel}</span>
          {card.era && <span className="chip chip-era">纪元 · {card.era}</span>}
          <span>{card.slug}</span>
        </>
      }
      title={title}
      titleReadOnly={readOnly}
      onTitleChange={onTitleChange}
      meta={
        <>
          <span>修订 r{card.revision}</span>
          <span className="dot" />
          <span>{charCount} 字</span>
          <span className="dot" />
          <span>{readOnly ? "只读" : status === "error" ? "保存失败" : status === "saving" ? "自动保存…" : `已保存 ${savedAt}`}</span>
        </>
      }
      actions={(editor) => (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const value = await promptAction({
                title: "页面封面",
                label: "封面图片地址",
                hint: "留空并确定可移除封面。",
                defaultValue: cover,
                confirmLabel: "保存",
              });
              if (value === null) return;
              const next = value.trim();
              setCover(next);
              void updateCard(worldSlug, card.id, { icon, cover: next }).then(onSaved).catch(() => setEditorError("封面保存失败"));
            }}
          >
            封面
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const { from, to } = editor?.state.selection ?? { from: 0, to: 0 };
              openComments(editor && from !== to ? { from, to } : null, editor && from !== to ? editor.state.doc.textBetween(from, to, " ").slice(0, 300) : "");
            }}
          >
            <MessageSquareQuote size={16} /> 评论
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
        </>
      )}
      content={contentFor(card)}
      contentKey={card.id}
      error={editorError}
      footerLeft={readOnly ? "只读视图 · 登录后可编辑" : "输入 / 插入块；选中文字出现格式条；⌘S 保存。"}
      footerRight={<>公开：{card.is_public ? "是" : "否"}</>}
      onUpdate={handleUpdate}
      onEditorReady={handleEditorReady}
      onAddComment={(range, quote) => openComments(range, quote)}
      dialogs={commentsOpen && (
        <Suspense fallback={null}>
          <CommentsPanel
            worldSlug={worldSlug}
            cardId={card.id}
            quote={commentQuote}
            anchorId={commentRange.current ? commentAnchorId : ""}
            onCreated={() => {
              const range = commentRange.current;
              const editor = editorRef.current;
              if (range && editor) {
                editor.chain().focus().setTextSelection(range).setMark("commentAnchor", { commentId: commentAnchorId }).run();
              }
              commentRange.current = null;
            }}
            onClose={() => { setCommentsOpen(false); commentRange.current = null; }}
          />
        </Suspense>
      )}
    />
  );
}
