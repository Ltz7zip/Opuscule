import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { Content } from "@tiptap/core";
import {
  Bold,
  Bookmark,
  Check,
  ClipboardPaste,
  Code2,
  Copy,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  Quote,
  Scissors,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import type { Node as PMNode } from "@tiptap/pm/model";

import { promptAction } from "../lib/dialogs";
import { buildDocumentExtensions } from "../editor/extensions";
import { ContextMenu, type ContextMenuEntry, type ContextMenuModel } from "./ContextMenu";
import { MediaLibraryDialog } from "./MediaLibraryDialog";
import type { CardSummary, TiptapDoc, WorldMediaAsset } from "../types";
import type { HoveredBlock } from "./EditorDragHandle";

const EditorDragHandle = lazy(() =>
  import("./EditorDragHandle").then((module) => ({ default: module.EditorDragHandle })),
);

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

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

export interface EditorShellProps {
  ariaLabel: string;
  worldSlug: string;
  cards: CardSummary[];
  currentSlug?: string;
  readOnly: boolean;
  cover?: string;
  icon?: ReactNode;
  kicker: ReactNode;
  title: string;
  titlePlaceholder?: string;
  titleReadOnly?: boolean;
  onTitleChange?: (value: string) => void;
  meta: ReactNode;
  actions?: (editor: Editor | null) => ReactNode;
  content: TiptapDoc;
  contentKey?: string | number;
  error?: ReactNode;
  footerLeft: ReactNode;
  footerRight: ReactNode;
  onUpdate: (doc: TiptapDoc, charCount: number) => void;
  onEditorReady?: (editor: Editor | null) => void;
  onAddComment?: (range: { from: number; to: number }, quote: string) => void;
  dialogs?: ReactNode;
}

/**
 * Shared writing surface for cards and the world concept: header, Tiptap body,
 * slash menu, selection bubble, drag handle, media library and save bar.
 */
export function EditorShell({
  ariaLabel,
  worldSlug,
  cards,
  currentSlug,
  readOnly,
  cover,
  icon,
  kicker,
  title,
  titlePlaceholder = "未命名卡片",
  titleReadOnly,
  onTitleChange,
  meta,
  actions,
  content,
  contentKey,
  error,
  footerLeft,
  footerRight,
  onUpdate,
  onEditorReady,
  onAddComment,
  dialogs,
}: EditorShellProps) {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [cardPicker, setCardPicker] = useState(false);
  const [tableActive, setTableActive] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaAutoUpload, setMediaAutoUpload] = useState(false);
  const [mediaSelectAfterUpload, setMediaSelectAfterUpload] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuModel | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [columnDropLine, setColumnDropLine] = useState<{ left: number; top: number; height: number } | null>(null);

  const mediaRange = useRef<{ from: number; to: number } | null>(null);
  const pendingRange = useRef<{ from: number; to: number } | null>(null);
  const contextRange = useRef<{ from: number; to: number } | null>(null);
  const columnDragSourceRef = useRef<HoveredBlock | null>(null);
  const readOnlyRef = useRef(readOnly);
  const onUpdateRef = useRef(onUpdate);
  const contentRef = useRef(content);
  const onAddCommentRef = useRef(onAddComment);

  readOnlyRef.current = readOnly;
  onUpdateRef.current = onUpdate;
  contentRef.current = content;
  onAddCommentRef.current = onAddComment;

  const closeMenus = useCallback(() => {
    setSlash(null);
    setBubble(null);
  }, []);

  const restoreContextSelection = (range: { from: number; to: number }) => {
    editor?.chain().focus().setTextSelection(range).run();
  };

  const copySelection = async (range: { from: number; to: number }) => {
    if (!editor) return;
    const text = editor.state.doc.textBetween(range.from, range.to, "\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
  };

  const openEditorMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !editor) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".tiptap")) return;
    // Keep native link/image actions (open in new tab, save image) available.
    if (target.closest("a, img, video")) return;
    event.preventDefault();
    const { from, to } = editor.state.selection;
    const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
    const range = pos !== undefined && pos !== null && (pos < from || pos > to)
      ? { from: pos, to: pos }
      : { from, to };
    if (range.from !== from || range.to !== to) editor.commands.setTextSelection(range);
    contextRange.current = range;
    const hasSelection = range.from !== range.to;
    const entries: ContextMenuEntry[] = [
      { label: "剪切", icon: <Scissors size={16} />, disabled: !hasSelection, run: async () => {
        await copySelection(range);
        restoreContextSelection(range);
        editor.chain().focus().deleteSelection().run();
      } },
      { label: "复制", icon: <Copy size={16} />, disabled: !hasSelection, run: () => copySelection(range) },
      { label: "粘贴", icon: <ClipboardPaste size={16} />, run: async () => {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        editor.chain().focus().setTextSelection(range.to).insertContent(text).run();
      } },
      { separator: true },
      { label: "加粗", icon: <Bold size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().toggleBold().run(); } },
      { label: "斜体", icon: <Italic size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().toggleItalic().run(); } },
      { label: "下划线", icon: <UnderlineIcon size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().toggleUnderline().run(); } },
      { label: "删除线", icon: <Strikethrough size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().toggleStrike().run(); } },
      { label: "行内代码", icon: <Code2 size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().toggleCode().run(); } },
      { separator: true },
      { label: "插入链接…", icon: <Link2 size={16} />, run: async () => {
        const value = await promptAction({
          title: "插入链接",
          label: "链接地址",
          hint: "以 http(s):// 或 / 开头。",
          confirmLabel: "插入",
        });
        if (!value) return;
        const href = safeHref(value);
        if (!href) { setLocalError("链接地址必须以 http(s):// 或 / 开头"); return; }
        restoreContextSelection(range);
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      } },
      ...(onAddCommentRef.current
        ? [{ label: "添加评论…", icon: <MessageSquareQuote size={16} />, disabled: !hasSelection, run: () => {
            const quote = editor.state.doc.textBetween(range.from, range.to, " ").slice(0, 300);
            onAddCommentRef.current?.(range, quote);
          } }]
        : []),
      { separator: true },
      { label: "全选", icon: <Check size={16} />, run: () => editor.chain().focus().selectAll().run() },
      { label: "清除格式", icon: <Eraser size={16} />, run: () => { restoreContextSelection(range); editor.chain().focus().unsetAllMarks().run(); } },
    ];
    setContextMenu({ x: event.clientX, y: event.clientY, entries });
  };

  const updateSlash = useCallback((current: Editor) => {
    if (readOnlyRef.current || !current.isEditable) {
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
  }, []);

  const updateBubble = useCallback((current: Editor) => {
    if (readOnlyRef.current) {
      setBubble(null);
      return;
    }
    setTableActive(current.isActive("table"));
    const { $from } = current.state.selection;
    if ($from.depth < 1) {
      setBubble(null);
      return;
    }
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
  }, []);

  const editor = useEditor({
    extensions: buildDocumentExtensions({ cards, worldSlug, currentSlug }),
    content: contentRef.current as Content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap",
        "aria-label": ariaLabel,
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
      if (readOnlyRef.current) return;
      onUpdateRef.current(current.getJSON() as TiptapDoc, current.getText().replace(/\s/g, "").length);
      updateSlash(current);
    },
    onSelectionUpdate: ({ editor: current }) => {
      updateSlash(current);
      updateBubble(current);
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    // Re-seed the document when the container switches card or restores history.
    if (!editor) return;
    editor.commands.setContent(contentRef.current as Content, { emitUpdate: false });
  }, [contentKey, editor]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSlash(null);
        setBubble(null);
        setCardPicker(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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
      setLocalError("图片地址必须以 http(s):// 或 / 开头");
      return;
    }
    editor?.chain().focus().deleteRange(range).insertContent({ type: "imageBlock", attrs: { src } }).run();
  };

  const openMediaLibrary = (
    range: { from: number; to: number },
    options?: { autoUpload?: boolean; selectAfterUpload?: boolean },
  ) => {
    mediaRange.current = range;
    setMediaAutoUpload(Boolean(options?.autoUpload));
    setMediaSelectAfterUpload(Boolean(options?.selectAfterUpload));
    setMediaOpen(true);
  };

  const closeMediaLibrary = () => {
    setMediaOpen(false);
    mediaRange.current = null;
  };

  const insertMediaImage = (image: WorldMediaAsset) => {
    const range = mediaRange.current;
    if (!range) return;
    editor?.chain().focus().deleteRange(range).insertContent({
      type: "imageBlock",
      attrs: { src: image.url, alt: image.name, caption: "" },
    }).run();
    setMediaOpen(false);
    mediaRange.current = null;
  };

  const useMediaUrl = () => {
    const range = mediaRange.current;
    setMediaOpen(false);
    mediaRange.current = null;
    if (range) void insertImageUrl(range);
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
      setLocalError("书签地址必须以 http(s):// 或 / 开头");
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

  const openCardPicker = (range: { from: number; to: number }) => {
    pendingRange.current = range;
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
    const insertPlaceholder = (label: string, detail: string) => (range: { from: number; to: number }) => {
      editor?.chain().focus().deleteRange(range).insertContent({
        type: "placeholderBlock",
        attrs: { label, detail },
      }).run();
    };
    const placeholderItems = [
      ["page", "子页面", "▤"],
      ["db-table", "数据库 · 表格视图", "▦"],
      ["db-board", "数据库 · 看板", "▤"],
      ["db-gallery", "数据库 · 画廊", "▥"],
      ["db-list", "数据库 · 列表", "☰"],
      ["db-calendar", "数据库 · 日历", "▣"],
      ["video", "视频", "▶"],
      ["audio", "音频", "♪"],
      ["file", "文件", "⌘"],
      ["formula", "行内公式", "Σ"],
      ["button", "按钮", "◉"],
      ["breadcrumb", "面包屑", "›"],
      ["toc", "目录", "☷"],
      ["person", "人员提及", "@"],
      ["date", "日期 / 提醒", "◷"],
      ["emoji", "表情", "☺"],
    ].map(([id, label, glyph]) => ({
      id: `placeholder-${id}`,
      label: `${label}（占位）`,
      hint: "尚未实现",
      keywords: label,
      icon: <span className="editor-slash-text-icon">{glyph}</span>,
      action: insertPlaceholder(label, "该内容类型尚未实现。"),
    }));
    const items = [
      {
        id: "text",
        label: "文本",
        hint: "普通段落",
        keywords: "text paragraph",
        icon: <Pilcrow size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setParagraph().run(),
      },
      {
        id: "h1",
        label: "一级标题",
        hint: "大标题",
        keywords: "heading h1 title 标题1 标题 1 一级标题",
        icon: <Heading1 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
      },
      {
        id: "h2",
        label: "二级标题",
        hint: "章节标题",
        keywords: "heading h2 标题2 标题 2 二级标题",
        icon: <Heading2 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
      },
      {
        id: "h3",
        label: "三级标题",
        hint: "小节标题",
        keywords: "heading h3 标题3 标题 3 三级标题",
        icon: <Heading3 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
      },
      {
        id: "h4",
        label: "四级标题",
        hint: "Markdown H4",
        keywords: "heading h4 标题4 标题 4 四级标题",
        icon: <Heading4 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 4 }).run(),
      },
      {
        id: "h5",
        label: "五级标题",
        hint: "Markdown H5",
        keywords: "heading h5 标题5 标题 5 五级标题",
        icon: <Heading5 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 5 }).run(),
      },
      {
        id: "h6",
        label: "六级标题",
        hint: "Markdown H6",
        keywords: "heading h6 标题6 标题 6 六级标题",
        icon: <Heading6 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setHeading({ level: 6 }).run(),
      },
      {
        id: "bullet",
        label: "无序列表",
        hint: "圆点列表",
        keywords: "bullet list",
        icon: <List size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleBulletList().run(),
      },
      {
        id: "ordered",
        label: "有序列表",
        hint: "编号列表",
        keywords: "ordered numbered list",
        icon: <ListOrdered size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleOrderedList().run(),
      },
      {
        id: "task-list",
        label: "任务清单",
        hint: "可勾选的待办列表",
        keywords: "task todo checklist checkbox 待办 待办清单 任务",
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
        keywords: "quote blockquote 引用 引用块",
        icon: <Quote size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).toggleBlockquote().run(),
      },
      {
        id: "callout",
        label: "提示框",
        hint: "规则或需要记住的事",
        keywords: "callout note tip",
        icon: <MessageSquareQuote size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).insertContent({
          type: "callout",
          content: [{ type: "paragraph" }],
        }).run(),
      },
      {
        id: "code",
        label: "代码块",
        hint: "等宽文本",
        keywords: "code block 代码 代码块",
        icon: <Code2 size={16} />,
        action: (range: { from: number; to: number }) => editor?.chain().focus().deleteRange(range).setCodeBlock().run(),
      },
      {
        id: "divider",
        label: "分隔线",
        hint: "水平分隔",
        keywords: "divider rule line 分隔线 分割线",
        icon: <Minus size={16} />,
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
          const titleValue = await promptAction({
            title: "插入折叠块",
            label: "标题",
            defaultValue: "折叠块",
            confirmLabel: "插入",
          });
          if (!titleValue) return;
          editor?.chain().focus().deleteRange(range).insertContent({
            type: "toggleBlock",
            attrs: { title: titleValue },
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
        hint: "PNG/JPEG/WebP，≤4 MB；进入世界媒体库",
        keywords: "image upload picture photo img",
        icon: <ImageIcon size={16} />,
        action: (range: { from: number; to: number }) => openMediaLibrary(range, { autoUpload: true, selectAfterUpload: true }),
      },
      {
        id: "media",
        label: "媒体库",
        hint: "世界共享图片：卡片与概念共用",
        keywords: "media library images shared",
        icon: <ImageIcon size={16} />,
        action: (range: { from: number; to: number }) => openMediaLibrary(range),
      },
      {
        id: "gallery",
        label: "图片轮播",
        hint: "多张图片横向轮播",
        keywords: "gallery carousel images",
        icon: <ImageIcon size={16} />,
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
          if (images.length === 0) { setLocalError("至少需要一个有效图片地址"); return; }
          editor?.chain().focus().deleteRange(range).insertContent({ type: "galleryBlock", attrs: { images } }).run();
        },
      },
      {
        id: "image-url",
        label: "网络图片",
        hint: "输入一个图片地址",
        keywords: "image url picture photo",
        icon: <Link2 size={16} />,
        action: insertImageUrl,
      },
      {
        id: "bookmark",
        label: "书签",
        hint: "把网址摆成卡片",
        keywords: "bookmark link url",
        icon: <Bookmark size={16} />,
        action: insertBookmark,
      },
      {
        id: "card",
        label: "嵌入卡片",
        hint: "引用这个世界的另一张卡",
        keywords: "card embed link",
        icon: <Link2 size={16} />,
        action: openCardPicker,
      },
      ...placeholderItems,
    ];
    const query = (slash?.query ?? "").toLowerCase();
    return items.filter((item) => !query || item.label.includes(query) || item.keywords.includes(query));
  }, [editor, slash?.query]);

  const columnDropAt = (event: DragEvent<HTMLDivElement>) => {
    const source = columnDragSourceRef.current;
    if (!editor || readOnly || !source || source.node.type.name === "columnList") return null;
    const dom = editor.view.dom;
    if (!(event.target instanceof Element)) return null;
    let element: Element | null = event.target;
    while (element && element.parentElement !== dom) element = element.parentElement;
    if (!(element instanceof HTMLElement)) return null;
    const targetIndex = Array.from(dom.children).indexOf(element);
    if (targetIndex < 0) return null;
    let sourceIndex = -1;
    editor.state.doc.forEach((node, offset, index) => {
      if (offset === source.pos || (sourceIndex < 0 && node.eq(source.node))) sourceIndex = index;
    });
    if (sourceIndex < 0 || sourceIndex === targetIndex) return null;
    const targetNode = editor.state.doc.child(targetIndex);
    if (targetNode.type.name === "columnList") return null;
    const rect = element.getBoundingClientRect();
    const side = event.clientX < rect.left + rect.width * 0.22
      ? "left"
      : event.clientX > rect.right - rect.width * 0.22
        ? "right"
        : null;
    if (!side) return null;
    return {
      sourceIndex,
      targetIndex,
      side,
      line: { left: side === "left" ? rect.left : rect.right, top: rect.top, height: rect.height },
    };
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>) => {
    const drop = columnDropAt(event);
    setColumnDropLine(drop?.line ?? null);
    if (!drop) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  };

  const handleColumnDrop = (event: DragEvent<HTMLDivElement>) => {
    const drop = columnDropAt(event);
    setColumnDropLine(null);
    if (!drop || !editor) {
      columnDragSourceRef.current = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const blocks: PMNode[] = [];
    editor.state.doc.forEach((node) => blocks.push(node));
    const source = blocks[drop.sourceIndex];
    const target = blocks[drop.targetIndex];
    const columnType = editor.schema.nodes.column;
    const listType = editor.schema.nodes.columnList;
    if (!source || !target || !columnType || !listType) {
      columnDragSourceRef.current = null;
      return;
    }
    const rest = blocks.filter((_, index) => index !== drop.sourceIndex && index !== drop.targetIndex);
    const pair = drop.side === "left" ? [source, target] : [target, source];
    const list = listType.create(
      { layout: 2, preset: "equal" },
      pair.map((node) => columnType.create(null, node)),
    );
    rest.splice(Math.min(drop.sourceIndex, drop.targetIndex), 0, list);
    const nextDoc = editor.state.doc.type.create(editor.state.doc.attrs, rest, editor.state.doc.marks);
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nextDoc.content));
    columnDragSourceRef.current = null;
  };

  const shownError = error ?? localError;

  return (
    <section className="panel editor" aria-label={ariaLabel}>
      {cover && <div className="page-cover" style={{ backgroundImage: `url("${cover}")` }} role="img" aria-label="页面封面" />}
      <header className="editor-head">
        {icon}
        <div className="editor-kicker">{kicker}</div>
        <input
          className="title-input"
          value={title}
          onChange={(event) => onTitleChange?.(event.target.value)}
          placeholder={titlePlaceholder}
          aria-label="卡片标题"
          readOnly={titleReadOnly ?? !onTitleChange}
          aria-readonly={titleReadOnly ?? !onTitleChange}
        />
        <div className="editor-meta">
          {meta}
          {!readOnly && actions && <span className="editor-actions">{actions(editor)}</span>}
        </div>
      </header>

      <div
        className="editor-body"
        onClick={() => !readOnly && editor?.commands.focus()}
        onContextMenu={openEditorMenu}
        onDragOverCapture={handleColumnDragOver}
        onDropCapture={handleColumnDrop}
        onDragLeaveCapture={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          setColumnDropLine(null);
        }}
        onDragEndCapture={() => {
          setColumnDropLine(null);
          columnDragSourceRef.current = null;
        }}
      >
        {shownError && <div className="editor-error" role="alert" onClick={() => setLocalError(null)}>{shownError}</div>}
        <EditorContent editor={editor} />
        {columnDropLine && !readOnly && <div className="editor-column-drop-line" style={columnDropLine} />}
        {editor && (
          <Suspense fallback={null}>
            <EditorDragHandle
              editor={editor}
              onBlockDragStart={(block) => {
                columnDragSourceRef.current = readOnly ? null : block;
              }}
            />
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
            <button type="button" className={editor?.isActive("bold") ? "active" : ""} aria-label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button>
            <button type="button" className={editor?.isActive("italic") ? "active" : ""} aria-label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
            <button type="button" className={editor?.isActive("strike") ? "active" : ""} aria-label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></button>
            <button type="button" className={editor?.isActive("code") ? "active" : ""} aria-label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={16} /></button>
            <button type="button" className={editor?.isActive("underline") ? "active" : ""} aria-label="下划线" onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></button>
            <button type="button" className={editor?.isActive("link") ? "active" : ""} aria-label="链接" onClick={async () => {
              const value = await promptAction({
                title: "插入链接",
                label: "链接地址",
                hint: "以 http(s):// 或 / 开头。",
                confirmLabel: "插入",
              });
              if (!value) return;
              const href = safeHref(value);
              if (!href) { setLocalError("链接地址必须以 http(s):// 或 / 开头"); return; }
              editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
            }}><Link2 size={16} /></button>
            <span className="editor-bubble-sep" />
            <button type="button" className={editor?.isActive("heading", { level: 1 }) ? "active" : ""} aria-label="一级标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
            <button type="button" className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} aria-label="二级标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
            <button type="button" className={editor?.isActive("bulletList") ? "active" : ""} aria-label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></button>
            <button type="button" className={editor?.isActive("orderedList") ? "active" : ""} aria-label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></button>
            <button type="button" aria-label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} /></button>
            <span className="editor-bubble-sep" />
            <button type="button" aria-label="缩进块" onClick={() => editor?.chain().focus().wrapIn("nestedBlock").run()}>→</button>
            <button type="button" aria-label="取消缩进" onClick={() => editor?.chain().focus().lift("nestedBlock").run()}>←</button>
          </div>
        )}
        {slash && !readOnly && (
          <div className="editor-slash" style={{ left: slash.left, top: slash.top }} onMouseDown={(event) => event.preventDefault()}>
            <div className="editor-slash-head">插入块 <button type="button" aria-label="关闭插入菜单" onClick={() => setSlash(null)}><X size={16} /></button></div>
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

      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onError={setLocalError} />

      {cardPicker && (
        <div className="editor-card-picker" role="dialog" aria-label="选择嵌入卡片">
          <div className="editor-card-picker-head">
            <b>嵌入卡片</b>
            <button type="button" className="icon-btn" aria-label="关闭卡片选择" onClick={() => setCardPicker(false)}><X size={16} /></button>
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

      <footer className="save-bar">
        <span>{footerLeft}</span>
        <span className="spacer" />
        <span>{footerRight}</span>
      </footer>

      <MediaLibraryDialog
        worldSlug={worldSlug}
        open={mediaOpen}
        onClose={closeMediaLibrary}
        onSelect={insertMediaImage}
        onUseUrl={useMediaUrl}
        autoUpload={mediaAutoUpload}
        selectAfterUpload={mediaSelectAfterUpload}
      />

      {dialogs}
    </section>
  );
}
