/**
 * Small Markdown → Tiptap JSON converter.
 *
 * Authors write long-form world text in Markdown (tables, headings, bold inline
 * emphasis) and paste it into the editor. Tiptap stores whatever the clipboard
 * gives it, so a Markdown paste used to land as a pile of paragraphs with the
 * syntax still visible (`| 世界信息 |`, `## 世界概述`, `**bold**`). This module is
 * the single owner of that conversion: `MarkdownPaste` uses it for the editor,
 * and `scripts/repair-flattened-markdown.mjs` reuses it to repair content that
 * was stored before the converter existed.
 *
 * Supported: ATX headings, paragraphs, bold/italic/strike/inline code, links,
 * bullet/ordered/task lists (nested by indentation), blockquotes, fenced code,
 * horizontal rules, GFM tables. Not supported: reference links, images, nested
 * emphasis, raw HTML — those lines simply stay plain text.
 */

import type { TiptapDoc, TiptapNode } from "../types";

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]*```+[ \t]*([\w+#.-]*)[ \t]*$/;
const HORIZONTAL_RULE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const BLOCKQUOTE = /^[ \t]*>[ \t]?(.*)$/;
const BULLET_ITEM = /^([ \t]*)[-*+][ \t]+(.*)$/;
const ORDERED_ITEM = /^([ \t]*)\d{1,9}[.)][ \t]+(.*)$/;
const TASK_ITEM = /^\[([ xX])\][ \t]+(.*)$/;
const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;

function textNode(text: string, marks: TiptapNode["marks"]): TiptapNode | null {
  if (!text) return null;
  const node: TiptapNode = { type: "text", text };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function withMark(marks: TiptapNode["marks"], mark: string): TiptapNode["marks"] {
  return [...(marks ?? []), { type: mark }];
}

/** Parse one line of inline Markdown into Tiptap text nodes. */
export function parseInlineMarkdown(text: string, marks: TiptapNode["marks"] = []): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    const plain = textNode(text.slice(cursor, start), marks);
    if (plain) nodes.push(plain);
    const doubled = token.startsWith("**") || token.startsWith("__") || token.startsWith("~~");
    const inner = token.slice(doubled ? 2 : 1, doubled ? -2 : -1);
    if (token.startsWith("`")) {
      const node = textNode(token.slice(1, -1), withMark(marks, "code"));
      if (node) nodes.push(node);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(...parseInlineMarkdown(inner, withMark(marks, "bold")));
    } else if (token.startsWith("~~")) {
      nodes.push(...parseInlineMarkdown(inner, withMark(marks, "strike")));
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) {
        nodes.push(...parseInlineMarkdown(link[1], [...(marks ?? []), { type: "link", attrs: { href: link[2] } }]));
      } else {
        const node = textNode(token, marks);
        if (node) nodes.push(node);
      }
    } else if (token.startsWith("*")) {
      nodes.push(...parseInlineMarkdown(inner, withMark(marks, "italic")));
    }
    cursor = start + token.length;
  }
  const tail = textNode(text.slice(cursor), marks);
  if (tail) nodes.push(tail);
  return nodes;
}

function inlineBlock(type: "paragraph" | "heading", text: string, attrs?: Record<string, unknown>): TiptapNode {
  const content = parseInlineMarkdown(text);
  const node: TiptapNode = { type };
  if (attrs) node.attrs = attrs;
  if (content.length) node.content = content;
  return node;
}

function indentOf(line: string): number {
  return line.length - line.replace(/^[ \t]*/, "").length;
}

function isListItem(line: string): boolean {
  return BULLET_ITEM.test(line) || ORDERED_ITEM.test(line);
}

/** True when the line opens a block that ends a running paragraph. */
function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  if (!line.trim()) return true;
  if (HEADING.test(line) || FENCE.test(line) || HORIZONTAL_RULE.test(line) || BLOCKQUOTE.test(line)) return true;
  if (isListItem(line)) return true;
  return isTableStart(lines, index);
}

function isTableStart(lines: string[], index: number): boolean {
  return TABLE_ROW.test(lines[index] ?? "") && TABLE_SEPARATOR.test(lines[index + 1] ?? "");
}

function splitTableCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function tableCell(type: "tableHeader" | "tableCell", cell: string): TiptapNode {
  const inline = parseInlineMarkdown(cell);
  return { type, content: [inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" }] };
}

function parseTable(lines: string[], start: number): { node: TiptapNode; next: number } {
  const header = splitTableCells(lines[start]);
  const rows: TiptapNode[] = [
    {
      type: "tableRow",
      content: header.map((cell) => tableCell("tableHeader", cell)),
    },
  ];
  let index = start + 2;
  while (index < lines.length && TABLE_ROW.test(lines[index])) {
    const cells = splitTableCells(lines[index]);
    while (cells.length < header.length) cells.push("");
    rows.push({
      type: "tableRow",
      content: cells.slice(0, header.length).map((cell) => tableCell("tableCell", cell)),
    });
    index += 1;
  }
  return { node: { type: "table", content: rows }, next: index };
}

type ListKind = "bulletList" | "orderedList" | "taskList";

function listKindOf(line: string): ListKind | null {
  if (ORDERED_ITEM.test(line)) return "orderedList";
  const bullet = BULLET_ITEM.exec(line);
  if (!bullet) return null;
  return TASK_ITEM.test(bullet[2]) ? "taskList" : "bulletList";
}

function itemText(line: string, kind: ListKind): { text: string; checked?: boolean } {
  if (kind === "orderedList") {
    const match = ORDERED_ITEM.exec(line);
    return { text: match ? match[2] : line.trim() };
  }
  const bullet = BULLET_ITEM.exec(line);
  const body = bullet ? bullet[2] : line.trim();
  if (kind === "taskList") {
    const task = TASK_ITEM.exec(body);
    if (task) return { text: task[2], checked: task[1].toLowerCase() === "x" };
  }
  return { text: body };
}

/**
 * Parse consecutive list lines of one indentation level; deeper lines become a
 * nested list inside the item they belong to.
 */
function parseList(lines: string[], start: number, baseIndent: number): { node: TiptapNode; next: number } {
  const kind = listKindOf(lines[start]) ?? "bulletList";
  const items: TiptapNode[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || indentOf(line) !== baseIndent) break;
    if (listKindOf(line) !== kind) break;
    const { text, checked } = itemText(line, kind);
    index += 1;
    const blocks: TiptapNode[] = [inlineBlock("paragraph", text)];
    const nested: string[] = [];
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) break;
      if (indentOf(next) <= baseIndent) break;
      const dedented = next.slice(Math.min(indentOf(next), baseIndent + 2));
      nested.push(dedented);
      index += 1;
    }
    if (nested.length) blocks.push(...parseBlocks(nested));
    if (kind === "taskList") {
      items.push({ type: "taskItem", attrs: { checked: Boolean(checked) }, content: blocks });
    } else {
      items.push({ type: "listItem", content: blocks });
    }
  }
  const node: TiptapNode = { type: kind, content: items };
  if (kind === "orderedList") node.attrs = { start: 1 };
  return { node, next: index };
}

/** Parse a block-level Markdown line range into Tiptap nodes. */
export function parseBlocks(lines: string[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const node: TiptapNode = { type: "codeBlock" };
      if (fence[1]) node.attrs = { language: fence[1] };
      if (code.length) node.content = [{ type: "text", text: code.join("\n") }];
      nodes.push(node);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      nodes.push(inlineBlock("heading", heading[2], { level: heading[1].length }));
      index += 1;
      continue;
    }

    if (HORIZONTAL_RULE.test(line)) {
      nodes.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const quotedLines: string[] = [];
      while (index < lines.length && BLOCKQUOTE.test(lines[index])) {
        quotedLines.push(BLOCKQUOTE.exec(lines[index])?.[1] ?? "");
        index += 1;
      }
      const quoted = parseBlocks(quotedLines);
      nodes.push({ type: "blockquote", content: quoted.length ? quoted : [{ type: "paragraph" }] });
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      nodes.push(table.node);
      index = table.next;
      continue;
    }

    if (isListItem(line)) {
      const list = parseList(lines, index, indentOf(line));
      nodes.push(list.node);
      index = list.next;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) nodes.push(inlineBlock("paragraph", paragraph.join(" ")));
  }
  return nodes;
}

/** Convert a Markdown document into an editor-ready Tiptap document. */
export function markdownToDoc(markdown: string): TiptapDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content = parseBlocks(lines);
  return content.length ? { type: "doc", content } : { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * Heuristic used by the paste handler: only hijack a plain-text paste when it
 * carries structural Markdown. Ordinary prose (including a stray `*` or `-`)
 * keeps the default paste behaviour.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (HEADING.test(line) || FENCE.test(line) || HORIZONTAL_RULE.test(line) || BLOCKQUOTE.test(line)) return true;
    if (isTableStart(lines, index)) return true;
    if (isListItem(line)) return true;
  }
  return /\*\*[^*\n]+\*\*/.test(text) || /~~[^~\n]+~~/.test(text);
}
