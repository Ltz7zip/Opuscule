import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { Content } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Bookmark,
  Check,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Save,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";

import { listCardImages, updateCard, uploadCardImage } from "../api";
import { promptAction } from "../lib/dialogs";
import { createCardMentionSuggestion } from "../editor/mention";
import { CardLinks } from "../editor/cardLinks";
import { MentionAuto } from "../editor/mentionAuto";
import { BookmarkBlock, Callout, CardEmbed, CommentAnchor, GalleryBlock, ImageBlock, NestedBlock, ToggleBlock } from "../editor/nodes";
import { Mention } from "@tiptap/extension-mention";
import type { CardDetail, CardImageAsset, CardSummary, TiptapDoc } from "../types";
import type { SaveState } from "./Topbar";

const CommentsPanel = lazy(() =>
  import("./CommentsPanel").then((module) => ({ default: module.CommentsPanel })),
);

const EditorDragHandle = lazy(() =>
  import("./EditorDragHandle").then((module) => ({ default: module.EditorDragHandle })),
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

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

interface SlashState {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

interface BubbleState {
  left: number;
  top: number;
}

interface CardEditorProps {
  worldSlug: string;
  card: CardDetail;
  cards: CardSummary[];
  onSaved: (card: CardDetail) => void;
  onStatus: (state: SaveState) => void;
  readOnly: boolean;
}

export function CardEditor({ worldSlug, card, cards, onSaved, onStatus, readOnly }: CardEditorProps) {
  const [title, setTitle] = useState(card.title);
  const [icon, setIcon] = useState(card.icon ?? "");
  const [cover, setCover] = useState(card.cover ?? "");
  const [status, setStatus] = useState<SaveState>("saved");
  const [charCount, setCharCount] = useState(card.body_text.replace(/\s/g, "").length);
  const [savedAt, setSavedAt] = useState<string>("刚刚");
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [cardPicker, setCardPicker] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [tableActive, setTableActive] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaImages, setMediaImages] = useState<CardImageAsset[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentQuote, setCommentQuote] = useState("");
  const [commentAnchorId, setCommentAnchorId] = useState("");
  const commentRange = useRef<{ from: number; to: number } | null>(null);
  const [blockAdd, setBlockAdd] = useState<{ left: number; top: number } | null>(null);
  const pendingRange = useRef<{ from: number; to: number } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRange = useRef<{ from: number; to: number } | null>(null);
  const titleRef = useRef(card.title);
  const bodyRef = useRef<TiptapDoc>(contentFor(card));
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);

  const closeMenus = useCallback(() => {
    setSlash(null);
    setBubble(null);
  }, []);

  const updateSlash = useCallback((current: Editor) => {
    if (readOnly || !current.isEditable) {
      setSlash(null);
      return;
    }
    const { selection } = current.state;
    if (!selection.empty || !selection.$from.parent.isTextblock) {
      setSlash(null);
      return;
    }
    const { $from } = selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, "\ufffc", "\ufffc");
    const match = before.match(/(?:^|\s)\/([^\s/]*)$/u);
    if (!match) {
      setSlash(null);
      return;
    }
    const coords = current.view.coordsAtPos(selection.from);
    setSlash({
      from: selection.from - match[1].length - 1,
      to: selection.from,
      query: match[1],
      left: Math.min(window.innerWidth - 292, Math.max(12, coords.left)),
      top: Math.min(window.innerHeight - 330, coords.bottom + 6),
    });
  }, [readOnly]);

  const updateBubble = useCallback((current: Editor) => {
    if (readOnly) {
      setBubble(null);
      setBlockAdd(null);
      return;
    }
    setTableActive(current.isActive("table"));
    const { $from } = current.state.selection;
    if ($from.depth < 1) {
      setBlockAdd(null);
      setBubble(null);
      return;
    }
    const blockStart = $from.before($from.depth);
    const coords = current.view.coordsAtPos(blockStart);
    const editorRect = current.view.dom.getBoundingClientRect();
    setBlockAdd({ left: Math.max(8, editorRect.left - 44), top: coords.top });
    if (current.state.selection.empty) {
      setBubble(null);
      return;
    }
    const dom = window.getSelection();
    if (!dom || dom.rangeCount === 0) {
      setBubble(null);
      return;
    }
    const rect = dom.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setBubble(null);
      return;
    }
    setBubble({
      left: Math.min(window.innerWidth - 160, Math.max(160, rect.left + rect.width / 2)),
      top: Math.max(52, rect.top - 10),
    });
  }, [readOnly]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Callout,
      ImageBlock,
      BookmarkBlock,
      CardEmbed,
      GalleryBlock,
      CommentAnchor,
      NestedBlock,
      ToggleBlock,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      CardLinks(cards, worldSlug, card.slug),
      MentionAuto(cards, worldSlug),
      Mention.configure({
        HTMLAttributes: { class: "tiptap-mention" },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id ?? ""}`,
        renderHTML: ({ node }) => [
          "span",
          {
            class: "tiptap-mention",
            "data-type": "mention",
            "data-id": node.attrs.id ?? "",
            "data-label": node.attrs.label ?? "",
          },
          `@${node.attrs.label ?? node.attrs.id ?? ""}`,
        ],
        suggestion: createCardMentionSuggestion(cards, worldSlug) as any,
      }),
    ],
    content: contentFor(card) as Content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap",
        "aria-label": "卡片正文",
      },
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".card-autolink");
        const href = target?.dataset.cardHref;
        if (!href) return false;
        window.location.assign(href);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      if (readOnly) return;
      const next = current.getJSON() as TiptapDoc;
      // Tiptap emits an update while mounting with the already-loaded document.
      // Treat that as a no-op so opening a card no longer bumps its revision.
      if (JSON.stringify(next) === JSON.stringify(bodyRef.current)) return;
      bodyRef.current = next;
      editVersionRef.current += 1;
      setCharCount(current.getText().replace(/\s/g, "").length);
      dirtyRef.current = true;
      setStatus("saving");
      onStatus("saving");
      updateSlash(current);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void save();
      }, 850);
    },
    onSelectionUpdate: ({ editor: current }) => {
      updateSlash(current);
      updateBubble(current);
    },
  });

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
          void save();
        }, 300);
      }
    }
  }, [card.id, cover, icon, onSaved, readOnly, setSaveState, worldSlug]);

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
    if (editor) {
      editor.commands.setContent(contentFor(card) as Content, { emitUpdate: false });
    }
  }, [card.id, editor, setSaveState]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        void save();
      }
      if (event.key === "Escape") {
        setSlash(null);
        setBubble(null);
        setCardPicker(false);
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

  const insertBlockAfter = () => {
    if (!editor || readOnly) return;
    const { $from } = editor.state.selection;
    const position = $from.after($from.depth);
    editor.chain().focus().insertContentAt(position, { type: "paragraph" }).run();
    setBlockAdd(null);
  };

  const onTitleChange = (value: string) => {
    if (readOnly) return;
    setTitle(value);
    titleRef.current = value;
    editVersionRef.current += 1;
    dirtyRef.current = true;
    setSaveState("saving");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void save();
    }, 850);
  };

  const applySlash = (action: (range: { from: number; to: number }) => void) => {
    if (!slash) return;
    const range = { from: slash.from, to: slash.to };
    setSlash(null);
    action(range);
  };

  const insertImageUrl = async (range: { from: number; to: number }) => {
    const value = await promptAction({
      title: "插入网络图片",
      label: "图片地址",
      placeholder: "https://… 或 /media/…",
      confirmLabel: "插入",
    });
    if (!value) return;
    const src = safeHref(value);
    if (!src) {
      setEditorError("图片地址必须以 http(s):// 或 / 开头");
      return;
    }
    editor?.chain().focus().deleteRange(range).insertContent({ type: "imageBlock", attrs: { src } }).run();
  };

  const openMediaLibrary = async (range: { from: number; to: number }) => {
    mediaRange.current = range;
    setMediaOpen(true);
    setMediaLoading(true);
    setMediaError(null);
    try {
      setMediaImages(await listCardImages(worldSlug, card.id));
    } catch (cause) {
      setMediaError(cause instanceof Error ? cause.message : "媒体库加载失败");
    } finally {
      setMediaLoading(false);
    }
  };

  const insertMediaImage = (image: CardImageAsset) => {
    const range = mediaRange.current;
    if (!range) return;
    editor?.chain().focus().deleteRange(range).insertContent({
      type: "imageBlock",
      attrs: { src: image.url, alt: image.name, caption: "" },
    }).run();
    setMediaOpen(false);
    mediaRange.current = null;
  };

  const openImagePicker = (range: { from: number; to: number }) => {
    pendingRange.current = range;
    imageInputRef.current?.click();
  };

  const uploadImageFile = async (file: File) => {
    const range = pendingRange.current;
    pendingRange.current = null;
    if (!range) return;
    setImageUploading(true);
    setEditorError(null);
    try {
      const data = await uploadCardImage(worldSlug, card.id, file);
      editor?.chain().focus().deleteRange(range).insertContent({
        type: "imageBlock",
        attrs: { src: data.url, alt: file.name, caption: "" },
      }).run();
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : "图片上传失败");
    } finally {
      setImageUploading(false);
    }
  };

  const insertBookmark = async (range: { from: number; to: number }) => {
    const value = await promptAction({
      title: "插入书签",
      label: "链接地址",
      hint: "以 http(s):// 或 / 开头。",
      confirmLabel: "继续",
    });
    if (!value) return;
    const href = safeHref(value);
    if (!href) {
      setEditorError("书签地址必须以 http(s):// 或 / 开头");
      return;
    }
    const label =
      (await promptAction({
        title: "书签标题",
        label: "标题（可选）",
        defaultValue: value,
        confirmLabel: "插入",
      })) ?? "";
    editor?.chain().focus().deleteRange(range).insertContent({
      type: "bookmarkBlock",
      attrs: { url: href, title: label || value },
    }).run();
  };

  const openCardPicker = () => {
    if (!slash) return;
    pendingRange.current = { from: slash.from, to: slash.to };
    setSlash(null);
    setCardPicker(true);
  };

  const pickCard = (picked: CardSummary) => {
    const range = pendingRange.current;
    pendingRange.current = null;
    setCardPicker(false);
    if (!range) return;
    editor?.chain().focus().deleteRange(range).insertContent({
      type: "cardEmbed",
      attrs: { cardId: picked.id, title: picked.title, slug: picked.slug, worldSlug },
    }).run();
  };

  const slashItems = useMemo(() => {
    const items = [
      {
        id: "text",
        label: "文本",
        hint: "普通段落",
        keywords: "text paragraph",
        icon: <Pilcrow size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setParagraph().run(),
      },
      {
        id: "h1",
        label: "一级标题",
        hint: "大标题",
        keywords: "heading h1 title",
        icon: <Heading1 size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "二级标题",
        hint: "章节标题",
        keywords: "heading h2",
        icon: <Heading2 size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: "三级标题",
        hint: "小节标题",
        keywords: "heading h3",
        icon: <Heading3 size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
      },
      {
        id: "bullet",
        label: "无序列表",
        hint: "圆点列表",
        keywords: "bullet list",
        icon: <List size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: "有序列表",
        hint: "编号列表",
        keywords: "ordered numbered list",
        icon: <ListOrdered size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleOrderedList().run(),
      },
      {
        id: "task-list",
        label: "任务清单",
        hint: "可勾选的待办列表",
        keywords: "task todo checklist checkbox",
        icon: <span className="editor-slash-text-icon">☑</span>,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).insertContent({
          type: "taskList",
          content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }],
        }).run(),
      },
      {
        id: "quote",
        label: "引用",
        hint: "摘录一段话",
        keywords: "quote blockquote",
        icon: <Quote size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleBlockquote().run(),
      },
      {
        id: "callout",
        label: "提示框",
        hint: "规则或需要记住的事",
        keywords: "callout note tip",
        icon: <MessageSquareQuote size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).insertContent({
          type: "callout",
          content: [{ type: "paragraph" }],
        }).run(),
      },
      {
        id: "code",
        label: "代码块",
        hint: "等宽文本",
        keywords: "code block",
        icon: <Code2 size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setCodeBlock().run(),
      },
      {
        id: "divider",
        label: "分隔线",
        hint: "水平分隔",
        keywords: "divider rule line",
        icon: <Minus size={15} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHorizontalRule().run(),
      },
      {
        id: "nested",
        label: "缩进块",
        hint: "把当前块收进一层缩进",
        keywords: "nested indent block",
        icon: <span className="editor-slash-text-icon">→</span>,
        action: (range: { from: number; to: number }) => {
          editor?.chain().focus().deleteRange(range).run();
          editor?.chain().focus().wrapIn("nestedBlock").run();
        },
      },
      {
        id: "toggle",
        label: "折叠块",
        hint: "带标题、可折叠的块",
        keywords: "toggle fold details",
        icon: <span className="editor-slash-text-icon">▸</span>,
        action: async (range: { from: number; to: number }) => {
          const title = await promptAction({
            title: "插入折叠块",
            label: "标题",
            defaultValue: "折叠块",
            confirmLabel: "插入",
          });
          if (!title) return;
          editor?.chain().focus().deleteRange(range).insertContent({
            type: "toggleBlock",
            attrs: { title },
            content: [{ type: "paragraph" }],
          }).run();
        },
      },
      {
        id: "table",
        label: "表格",
        hint: "3×3 表格，可增删行列",
        keywords: "table grid rows columns",
        icon: <span className="editor-slash-text-icon">▦</span>,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: "image",
        label: "上传图片",
        hint: "PNG/JPEG/WebP，≤4 MB",
        keywords: "image upload picture photo img",
        icon: <ImageIcon size={15} />,
        action: openImagePicker,
      },
      {
        id: "media",
        label: "媒体库",
        hint: "从已上传图片中选择",
        keywords: "media library images",
        icon: <ImageIcon size={15} />,
        action: (range: { from: number; to: number }) => { void openMediaLibrary(range); },
      },
      {
        id: "gallery",
        label: "图片轮播",
        hint: "多张图片横向轮播",
        keywords: "gallery carousel images",
        icon: <ImageIcon size={15} />,
        action: async (range: { from: number; to: number }) => {
          const value = await promptAction({
            title: "插入图片轮播",
            label: "图片地址",
            hint: "每行一个地址；以 http(s):// 或 / 开头。",
            multiline: true,
            confirmLabel: "插入",
          });
          if (!value) return;
          const images = value.split(/\n+/).map((line) => safeHref(line.trim())).filter((src): src is string => Boolean(src)).map((src) => ({ src, alt: "" }));
          if (images.length === 0) { setEditorError("至少需要一个有效图片地址"); return; }
          editor?.chain().focus().deleteRange(range).insertContent({ type: "galleryBlock", attrs: { images } }).run();
        },
      },
      {
        id: "image-url",
        label: "网络图片",
        hint: "输入一个图片地址",
        keywords: "image url picture photo",
        icon: <Link2 size={15} />,
        action: insertImageUrl,
      },
      {
        id: "bookmark",
        label: "书签",
        hint: "把网址摆成卡片",
        keywords: "bookmark link url",
        icon: <Bookmark size={15} />,
        action: insertBookmark,
      },
      {
        id: "card",
        label: "嵌入卡片",
        hint: "引用这个世界的另一张卡",
        keywords: "card embed link",
        icon: <Link2 size={15} />,
        action: openCardPicker,
      },
    ];
    const query = (slash?.query ?? "").toLowerCase();
    return items.filter((item) => !query || item.label.includes(query) || item.keywords.includes(query));
  }, [editor, slash?.query]);

  const typeLabel = typeLabels[card.type_key] ?? (card.type_key || "卡片");

  return (
    <section className="panel editor" aria-label="卡片编辑器">
      {cover && <div className="page-cover" style={{ backgroundImage: `url("${cover}")` }} role="img" aria-label="页面封面" />}
      <header className="editor-head">
        <button type="button" className="page-icon" aria-label="设置页面图标" onClick={async () => {
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
        }}>{icon || "＋"}</button>
        <div className="editor-kicker">
          <span className="chip">{typeLabel}</span>
          <span>{card.slug}</span>
        </div>
        <input
          className="title-input"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="未命名卡片"
          aria-label="卡片标题"
          readOnly={readOnly}
          aria-readonly={readOnly}
        />
        <div className="editor-meta">
          <span>修订 r{card.revision}</span>
          <span className="dot" />
          <span>{charCount} 字</span>
          <span className="dot" />
          <span>{readOnly ? "只读" : status === "error" ? "保存失败" : status === "saving" ? "自动保存…" : `已保存 ${savedAt}`}</span>
          {!readOnly && (
            <span className="editor-actions">
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
                  commentRange.current = editor && from !== to ? { from, to } : null;
                  setCommentQuote(editor && from !== to ? editor.state.doc.textBetween(from, to, " ").slice(0, 300) : "");
                  setCommentAnchorId(crypto.randomUUID());
                  setCommentsOpen(true);
                }}
              >
                <MessageSquareQuote size={13} /> 评论
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void save()}
                disabled={status === "saving"}
              >
                {status === "saving" ? <Loader2 size={14} className="spin" /> : status === "saved" ? <Check size={14} /> : <Save size={14} />}
                保存
              </button>
            </span>
          )}
        </div>
      </header>

      <div
        className="editor-body"
        onClick={() => !readOnly && editor?.commands.focus()}
      >
        {blockAdd && !readOnly && (
          <>
            <button
              type="button"
              className="editor-block-add"
              style={{ left: blockAdd.left, top: blockAdd.top }}
              aria-label="在此块后插入段落"
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertBlockAfter}
            >
              <Plus size={14} />
            </button>
          </>
        )}
        <EditorContent editor={editor} onBlur={() => setBlockAdd(null)} />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadImageFile(file);
          }}
        />
        {editor && (
          <Suspense fallback={null}>
            <EditorDragHandle editor={editor} />
          </Suspense>
        )}
        {tableActive && !readOnly && (
          <div className="editor-table-bar" onMouseDown={(event) => event.preventDefault()}>
            <span>表格</span>
            <button type="button" onClick={() => editor?.chain().focus().addRowBefore().run()}>上插行</button>
            <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}>下插行</button>
            <button type="button" onClick={() => editor?.chain().focus().addColumnBefore().run()}>左插列</button>
            <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()}>右插列</button>
            <button type="button" onClick={() => editor?.chain().focus().deleteRow().run()}>删行</button>
            <button type="button" onClick={() => editor?.chain().focus().deleteColumn().run()}>删列</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>表头</button>
            <button type="button" onClick={() => editor?.chain().focus().deleteTable().run()}>删表</button>
          </div>
        )}
        {bubble && !readOnly && (
          <div className="editor-bubble" style={{ left: bubble.left, top: bubble.top }} onMouseDown={(event) => event.preventDefault()}>
            <button type="button" className={editor?.isActive("bold") ? "active" : ""} aria-label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14} /></button>
            <button type="button" className={editor?.isActive("italic") ? "active" : ""} aria-label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14} /></button>
            <button type="button" className={editor?.isActive("strike") ? "active" : ""} aria-label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></button>
            <button type="button" className={editor?.isActive("code") ? "active" : ""} aria-label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={14} /></button>
            <button type="button" className={editor?.isActive("underline") ? "active" : ""} aria-label="下划线" onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></button>
            <button type="button" className={editor?.isActive("link") ? "active" : ""} aria-label="链接" onClick={async () => {
              const value = await promptAction({
                title: "插入链接",
                label: "链接地址",
                hint: "以 http(s):// 或 / 开头。",
                confirmLabel: "插入",
              });
              if (!value) return;
              const href = safeHref(value);
              if (!href) { setEditorError("链接地址必须以 http(s):// 或 / 开头"); return; }
              editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
            }}><Link2 size={14} /></button>
            <span className="editor-bubble-sep" />
            <button type="button" className={editor?.isActive("heading", { level: 1 }) ? "active" : ""} aria-label="一级标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
            <button type="button" className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} aria-label="二级标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
            <button type="button" className={editor?.isActive("bulletList") ? "active" : ""} aria-label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={14} /></button>
            <button type="button" className={editor?.isActive("orderedList") ? "active" : ""} aria-label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></button>
            <button type="button" aria-label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={14} /></button>
            <span className="editor-bubble-sep" />
            <button type="button" aria-label="缩进块" onClick={() => editor?.chain().focus().wrapIn("nestedBlock").run()}>→</button>
            <button type="button" aria-label="取消缩进" onClick={() => editor?.chain().focus().lift("nestedBlock").run()}>←</button>
          </div>
        )}
        {editorError && <div className="editor-error" role="alert">{editorError}</div>}
        {slash && !readOnly && (
          <div className="editor-slash" style={{ left: slash.left, top: slash.top }} onMouseDown={(event) => event.preventDefault()}>
            <div className="editor-slash-head">插入块 <button type="button" aria-label="关闭插入菜单" onClick={() => setSlash(null)}><X size={12} /></button></div>
            <div className="editor-slash-list">
              {slashItems.length === 0 && <div className="editor-slash-empty">没有匹配的块</div>}
              {slashItems.map((item) => (
                <button type="button" className="editor-slash-item" key={item.id} onClick={() => applySlash(item.action)}>
                  <span className="editor-slash-icon">{item.icon}</span>
                  <span><b>{item.label}</b><small>{item.hint}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {cardPicker && (
        <div className="editor-card-picker" role="dialog" aria-label="选择嵌入卡片">
          <div className="editor-card-picker-head">
            <b>嵌入卡片</b>
            <button type="button" className="icon-btn" aria-label="关闭卡片选择" onClick={() => setCardPicker(false)}><X size={14} /></button>
          </div>
          <div className="editor-card-picker-list">
            {cards.map((item) => (
              <button type="button" key={item.id} onClick={() => pickCard(item)}>
                <span>{item.title}</span>
                <small>{item.slug}</small>
              </button>
            ))}
            {cards.length === 0 && <div className="editor-slash-empty">这个文件夹里还没有卡片</div>}
          </div>
        </div>
      )}

      {mediaOpen && (
        <div className="editor-media-overlay" role="dialog" aria-modal="true" aria-label="媒体库">
          <div className="editor-media-dialog">
            <div className="editor-media-head">
              <strong>媒体库</strong>
              <button type="button" onClick={() => { setMediaOpen(false); mediaRange.current = null; }} aria-label="关闭媒体库">×</button>
            </div>
            {mediaLoading && <p className="form-hint">正在加载…</p>}
            {mediaError && <p className="form-hint error-text">{mediaError}</p>}
            {!mediaLoading && !mediaError && mediaImages.length === 0 && <p className="form-hint">还没有已上传图片。</p>}
            <div className="editor-media-grid">
              {mediaImages.map((image) => (
                <button type="button" key={image.id} className="editor-media-item" onClick={() => insertMediaImage(image)}>
                  <img src={image.url} alt={image.name} loading="lazy" />
                  <small>{image.name}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {commentsOpen && (
        <Suspense fallback={null}>
          <CommentsPanel
            worldSlug={worldSlug}
            cardId={card.id}
            quote={commentQuote}
            anchorId={commentRange.current ? commentAnchorId : ""}
            onCreated={() => {
              const range = commentRange.current;
              if (range && editor) {
                editor.chain().focus().setTextSelection(range).setMark("commentAnchor", { commentId: commentAnchorId }).run();
              }
              commentRange.current = null;
            }}
            onClose={() => { setCommentsOpen(false); commentRange.current = null; }}
          />
        </Suspense>
      )}

      <footer className="save-bar">
        <span>{readOnly ? "只读视图 · 登录后可编辑" : imageUploading ? "正在上传图片…" : "输入 / 插入块；选中文字出现格式条；⌘S 保存。"}</span>
        <span className="spacer" />
        <span>公开：{card.is_public ? "是" : "否"}</span>
      </footer>
    </section>
  );
}
