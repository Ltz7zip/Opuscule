import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  runViewTransition,
  useSharedSource,
  useVtTarget,
} from "../lib/viewTransition";
import { hasMath, splitMath } from "../lib/math";
import type { CardSummary, TiptapDoc, TiptapNode } from "../types";
import { MathFormula } from "./MathFormula";
import { WorldTimelineBlock } from "./WorldTimelineBlock";

function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

type RichContext = {
  cards: CardSummary[];
  worldSlug: string;
  currentSlug?: string;
  autoLink: boolean;
  mentionMode: "inline" | "reading";
  /** Incremented in document order so heading ids match the TOC. */
  headingIndex: number;
  /** Stable id for the thumbnail -> lightbox shared element. */
  imageIndex: number;
  onOpenImage: (target: ImageTarget) => void;
};

interface ImageTarget {
  src: string;
  alt: string;
  id: string;
  source: HTMLElement | null;
  trigger: HTMLElement | null;
}

/** One published image: the thumbnail is the shared-element source. */
function ZoomableImage({
  src,
  alt,
  id,
  onOpen,
}: {
  src: string;
  alt: string;
  id: string;
  onOpen: (target: ImageTarget) => void;
}) {
  const source = useSharedSource<HTMLElement>("cover", id);
  return (
    <button
      type="button"
      className="rich-image-open"
      aria-label={alt ? `查看图片：${alt}` : "查看图片"}
      onPointerEnter={source.onPointerEnter}
      onPointerLeave={source.onPointerLeave}
      onFocus={source.onFocus}
      onBlur={source.onBlur}
      onTouchStart={source.onTouchStart}
      onClick={(event) =>
        onOpen({
          src,
          alt,
          id,
          source: source.ref.current,
          trigger: event.currentTarget,
        })
      }
    >
      <span ref={source.ref} className="rich-image-leaf">
        <img src={src} alt={alt} loading="lazy" />
      </span>
    </button>
  );
}

function Lightbox({
  image,
  vtId,
  onClose,
}: {
  image: ImageTarget;
  vtId: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const target = useVtTarget("cover", image.id);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      (image.trigger ?? previous)?.focus({ preventScroll: true });
    };
  }, [image.trigger, onClose]);

  return (
    <div className="rich-lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={onClose}>
      <button
        type="button"
        className="rich-lightbox-close"
        aria-label="关闭图片预览"
        ref={closeRef}
        onClick={onClose}
      >
        ×
      </button>
      <img
        src={image.src}
        alt={image.alt}
        ref={vtId === image.id ? target.ref : undefined}
        style={vtId === image.id ? target.style : undefined}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function linkifyText(text: string, key: string, context: RichContext): ReactNode {
  if (!context.autoLink) return text;
  const targets = context.cards
    .filter((card) => card.slug !== context.currentSlug && !card.is_auxiliary)
    .flatMap((card) => [card.title.trim(), card.slug.trim()].filter((name) => name.length >= 2).map((name) => ({ name, slug: card.slug })))
    .sort((a, b) => b.name.length - a.name.length);
  if (targets.length === 0) return text;
  const spans: Array<{ from: number; to: number; slug: string }> = [];
  targets.forEach((target) => {
    let index = 0;
    while (index < text.length) {
      const at = text.indexOf(target.name, index);
      if (at < 0) break;
      const from = at;
      const to = at + target.name.length;
      if (!spans.some((span) => from < span.to && to > span.from)) spans.push({ from, to, slug: target.slug });
      index = to;
    }
  });
  spans.sort((a, b) => a.from - b.from);
  if (spans.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.from > cursor) parts.push(text.slice(cursor, span.from));
    parts.push(
      <a className="rich-card-autolink" key={`${key}-${index}`} href={`/w/${context.worldSlug}/wiki/${span.slug}`}>
        {text.slice(span.from, span.to)}
      </a>,
    );
    cursor = span.to;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * Render a text run, typesetting `\(…\)` / `\[…\]` formulas. Code marks keep
 * their source verbatim, so a formula inside inline code stays code.
 */
function renderInlineText(text: string, key: string, context: RichContext, linkify: boolean): ReactNode {
  if (!hasMath(text)) return linkify ? linkifyText(text, key, context) : text;
  return (
    <Fragment key={key}>
      {splitMath(text).map((segment, index) =>
        segment.kind === "text" ? (
          <Fragment key={`${key}-${index}`}>
            {linkify ? linkifyText(segment.value, `${key}-${index}`, context) : segment.value}
          </Fragment>
        ) : (
          <MathFormula key={`${key}-${index}`} tex={segment.value} display={segment.kind === "block"} />
        ),
      )}
    </Fragment>
  );
}

function renderText(node: TiptapNode, key: string, context: RichContext): ReactNode {
  const marks = node.marks ?? [];
  const isCode = marks.some((mark) => mark.type === "code");
  let content: ReactNode = renderInlineText(node.text ?? "", key, context, marks.length === 0 && !isCode);
  for (const mark of node.marks ?? []) {
    const type = mark.type;
    if (type === "bold") content = <strong>{content}</strong>;
    else if (type === "italic") content = <em>{content}</em>;
    else if (type === "strike") content = <s>{content}</s>;
    else if (type === "code") content = <code>{content}</code>;
    else if (type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (href) {
        content = (
          <a href={href} target="_blank" rel="noreferrer">
            {content}
          </a>
        );
      }
    }
  }
  return <Fragment key={key}>{content}</Fragment>;
}

/** Verbatim text of a subtree: code blocks never typeset or link their content. */
function nodePlainText(node: TiptapNode): string {
  const parts: string[] = [];
  const stack: TiptapNode[] = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    if (typeof current.text === "string") parts.push(current.text);
    if (Array.isArray(current.content)) stack.push(...[...current.content].reverse());
  }
  return parts.join("");
}

function renderChildren(node: TiptapNode, context: RichContext): ReactNode {
  return (node.content ?? []).map((child, index) => renderNode(child, `${index}`, context));
}

function renderNode(node: TiptapNode, key: string, context: RichContext): ReactNode {
  if (!node || typeof node !== "object") return null;
  if (node.type === "text") return renderText(node, key, context);
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "horizontalRule") return <hr key={key} />;
  if (node.type === "paragraph") return <p key={key}>{renderChildren(node, context)}</p>;
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)));
    const Tag = (`h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
    context.headingIndex += 1;
    return <Tag id={`sec-${context.headingIndex}`} key={key}>{renderChildren(node, context)}</Tag>;
  }
  if (node.type === "bulletList") return <ul key={key}>{renderChildren(node, context)}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{renderChildren(node, context)}</ol>;
  if (node.type === "listItem") return <li key={key}>{renderChildren(node, context)}</li>;
  if (node.type === "blockquote") return <blockquote key={key}>{renderChildren(node, context)}</blockquote>;
  if (node.type === "columnList") {
    const layout = Math.min(4, Math.max(2, Number(node.attrs?.layout ?? 2)));
    const rawWidths = node.attrs?.widths;
    const widths = Array.isArray(rawWidths) && rawWidths.length === layout ? rawWidths.map(Number) : null;
    const template = widths && widths.every((width) => Number.isFinite(width) && width > 0)
      ? widths.map((width) => `minmax(0, ${width}fr)`).join(" ")
      : null;
    return (
      <div
        className={`rich-columns cols-${layout}`}
        data-columns={layout}
        data-preset={String(node.attrs?.preset ?? "equal")}
        style={template ? ({ "--column-template": template } as CSSProperties) : undefined}
        key={key}
      >
        {renderChildren(node, context)}
      </div>
    );
  }
  if (node.type === "column") return <div className="rich-column" key={key}>{renderChildren(node, context)}</div>;
  if (node.type === "placeholderBlock") {
    return (
      <div className="rich-placeholder" key={key}>
        <small>占位 · 尚未实现</small>
        <strong>{String(node.attrs?.label ?? "未完成功能")}</strong>
        <p>{String(node.attrs?.detail ?? "该内容类型尚未实现。")}</p>
      </div>
    );
  }
  if (node.type === "codeBlock") return <pre key={key}><code>{nodePlainText(node)}</code></pre>;
  if (node.type === "image") {
    const src = safeHref(node.attrs?.src);
    if (!src) return null;
    context.imageIndex += 1;
    return (
      <ZoomableImage
        key={key}
        src={src}
        alt={String(node.attrs?.alt ?? "")}
        id={`img-${context.imageIndex}`}
        onOpen={context.onOpenImage}
      />
    );
  }
  if (node.type === "imageBlock") {
    const src = safeHref(node.attrs?.src);
    if (!src) return null;
    const caption = String(node.attrs?.caption ?? "");
    context.imageIndex += 1;
    return (
      <figure className="rich-image" key={key}>
        <ZoomableImage
          src={src}
          alt={String(node.attrs?.alt ?? "")}
          id={`img-${context.imageIndex}`}
          onOpen={context.onOpenImage}
        />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }
  if (node.type === "mention") {
    const [mentionWorld, mentionSlug] = String(node.attrs?.id ?? "").split("/");
    const label = String(node.attrs?.label ?? mentionSlug ?? "");
    if (!/^[A-Za-z0-9_-]+$/.test(mentionWorld) || !/^[A-Za-z0-9_-]+$/.test(mentionSlug)) {
      return <span className="rich-mention" key={key}>{context.mentionMode === "reading" ? label : `@${label}`}</span>;
    }
    if (context.mentionMode === "reading") {
      const card = context.cards.find(
        (item) => item.slug === mentionSlug && !item.is_auxiliary,
      );
      if (!card) {
        return <span className="rich-mention rich-mention-plain" key={key}>{label}</span>;
      }
      return (
        <a className="rich-mention rich-mention-reading" key={key} href={`/w/${mentionWorld}/wiki/${mentionSlug}`}>
          {label}<sup aria-hidden="true">↗</sup>
        </a>
      );
    }
    return <a className="rich-mention" key={key} href={`/w/${mentionWorld}/wiki/${mentionSlug}`}>@{label}</a>;
  }
  if (node.type === "callout") {
    return <aside className="rich-callout" key={key}>{renderChildren(node, context)}</aside>;
  }
  if (node.type === "nestedBlock") {
    return <div className="rich-nested" key={key}>{renderChildren(node, context)}</div>;
  }
  if (node.type === "taskList") return <ul className="rich-task-list" key={key}>{renderChildren(node, context)}</ul>;
  if (node.type === "taskItem") {
    return (
      <li className="rich-task-item" data-checked={node.attrs?.checked ? "true" : "false"} key={key}>
        <span className="rich-task-check" aria-hidden="true">{node.attrs?.checked ? "✓" : ""}</span>
        <div>{renderChildren(node, context)}</div>
      </li>
    );
  }
  if (node.type === "galleryBlock") {
    const images = Array.isArray(node.attrs?.images) ? node.attrs.images : [];
    return (
      <div className="rich-gallery" key={key}>
        {images.map((image: { src: string; alt?: string }, index: number) => {
          context.imageIndex += 1;
          return (
            <figure key={`${image.src}-${index}`}>
              <ZoomableImage
                src={image.src}
                alt={image.alt ?? ""}
                id={`img-${context.imageIndex}`}
                onOpen={context.onOpenImage}
              />
            </figure>
          );
        })}
      </div>
    );
  }
  if (node.type === "table") {
    return (
      <div className="rich-table-wrap" key={key}>
        <table className="rich-table">
          <tbody>{renderChildren(node, context)}</tbody>
        </table>
      </div>
    );
  }
  if (node.type === "tableRow") return <tr key={key}>{renderChildren(node, context)}</tr>;
  if (node.type === "tableCell") return <td key={key}>{renderChildren(node, context)}</td>;
  if (node.type === "tableHeader") return <th key={key}>{renderChildren(node, context)}</th>;
  if (node.type === "toggleBlock") {
    return (
      <details className="rich-toggle" key={key}>
        <summary>{String(node.attrs?.title ?? "折叠块")}</summary>
        <div className="rich-toggle-body">{renderChildren(node, context)}</div>
      </details>
    );
  }
  if (node.type === "bookmarkBlock") {
    const href = safeHref(node.attrs?.url);
    if (!href) return null;
    return (
      <a className="rich-bookmark" key={key} href={href} target="_blank" rel="noreferrer">
        <strong>{String(node.attrs?.title ?? href)}</strong>
        <small>{href}</small>
      </a>
    );
  }
  if (node.type === "worldTimeline") {
    const timelineSlug = String(node.attrs?.slug ?? "");
    if (!timelineSlug) return null;
    return (
      <WorldTimelineBlock
        key={key}
        worldSlug={context.worldSlug}
        timelineSlug={timelineSlug}
        name={String(node.attrs?.name ?? "")}
      />
    );
  }
  if (node.type === "cardEmbed") {
    const worldSlug = String(node.attrs?.worldSlug ?? "");
    const slug = String(node.attrs?.slug ?? "");
    if (!/^[A-Za-z0-9_-]+$/.test(worldSlug) || !/^[A-Za-z0-9_-]+$/.test(slug)) return null;
    return (
      <a className="rich-card-embed" key={key} href={`/w/${worldSlug}/wiki/${slug}`}>
        <small>嵌入卡片</small>
        <strong>{String(node.attrs?.title ?? slug)}</strong>
      </a>
    );
  }
  return <Fragment key={key}>{renderChildren(node, context)}</Fragment>;
}

export function RichText({ doc, cards = [], worldSlug = "", currentSlug, autoLink = true, mentionMode = "inline" }: {
  doc: TiptapDoc | null | undefined;
  cards?: CardSummary[];
  worldSlug?: string;
  currentSlug?: string;
  autoLink?: boolean;
  mentionMode?: "inline" | "reading";
}) {
  const [image, setImage] = useState<ImageTarget | null>(null);
  const [vtId, setVtId] = useState<string | null>(null);
  const closeImage = useCallback(() => setImage(null), []);

  if (!doc || !Array.isArray(doc.content)) return null;

  const openImage = (target: ImageTarget) => {
    runViewTransition(
      () => {
        setVtId(target.id);
        setImage(target);
      },
      () => setVtId(null),
      target.source,
    );
  };

  const context: RichContext = {
    cards,
    worldSlug,
    currentSlug,
    autoLink,
    mentionMode,
    headingIndex: 0,
    imageIndex: 0,
    onOpenImage: openImage,
  };
  return (
    <>
      <div className="rich-text">{doc.content.map((node, index) => renderNode(node, `${index}`, context))}</div>
      {image && <Lightbox image={image} vtId={vtId} onClose={closeImage} />}
    </>
  );
}
