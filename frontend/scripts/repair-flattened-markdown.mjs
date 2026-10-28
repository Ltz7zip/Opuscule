#!/usr/bin/env node
/**
 * Repair Markdown that was stored as flat paragraphs.
 *
 * Content pasted into the editor before `MarkdownPaste` existed landed as one
 * paragraph per Markdown line, with `**bold**` reduced to a bold mark and the
 * block syntax (`## heading`, `| table |`) left as visible text. This script
 * rebuilds the Markdown source from such a document and re-parses it with the
 * same converter the editor now uses.
 *
 * Usage:
 *   node scripts/repair-flattened-markdown.mjs <card-or-concept.json> [out.json]
 *
 * Input: JSON with a `body_json` string/object (API card or concept payload),
 * or a bare Tiptap document. Output: `{ "markdown", "body_json" }`, plus a text
 * fidelity guard that fails loudly instead of shipping mangled content.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { markdownToDoc } from "../src/lib/markdown.ts";

const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;

function inlineToMarkdown(node) {
  const text = node.text ?? "";
  if (!text) return "";
  let wrapped = text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") wrapped = `**${wrapped}**`;
    else if (mark.type === "italic") wrapped = `*${wrapped}*`;
    else if (mark.type === "strike") wrapped = `~~${wrapped}~~`;
    else if (mark.type === "code") wrapped = `\`${wrapped}\``;
    else if (mark.type === "link") wrapped = `[${wrapped}](${mark.attrs?.href ?? ""})`;
  }
  return wrapped;
}

function childrenToMarkdown(node) {
  return (node.content ?? []).map(inlineToMarkdown).join("");
}

function childrenText(node) {
  return (node.content ?? []).map((child) => child.text ?? "").join("");
}

function blockToMarkdown(block) {
  if (block.type === "paragraph") return childrenToMarkdown(block);
  if (block.type === "heading") {
    return `${"#".repeat(block.attrs?.level ?? 1)} ${childrenToMarkdown(block)}`;
  }
  if (block.type === "codeBlock") {
    return `\`\`\`${block.attrs?.language ?? ""}\n${childrenToMarkdown(block)}\n\`\`\``;
  }
  throw new Error(`unsupported block type in flattened content: ${block.type}`);
}

/** Rebuild Markdown, keeping table rows on consecutive lines. */
function documentToMarkdown(doc) {
  const blocks = doc.content ?? [];
  let markdown = "";
  let previousWasTableRow = false;
  for (const block of blocks) {
    const body = blockToMarkdown(block);
    const isTableRow = TABLE_ROW.test(body);
    if (markdown) markdown += isTableRow && previousWasTableRow ? "\n" : "\n\n";
    markdown += body;
    previousWasTableRow = isTableRow;
  }
  return markdown;
}

function plainText(node) {
  const parts = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (typeof current.text === "string") parts.push(current.text);
    if (Array.isArray(current.content)) stack.push(...[...current.content].reverse());
  }
  return parts.join("");
}

/** Drop inline Markdown syntax so both sides compare as plain text. */
function stripInlineSyntax(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

/**
 * Content-only characters of the flattened document: heading markers, table
 * pipes, table separator rows and inline emphasis are Markdown syntax, not
 * text, so they are dropped before the before/after comparison.
 */
function sourceContent(source) {
  const tokens = [];
  for (const block of source.content ?? []) {
    let text = childrenText(block);
    text = text.replace(/^#{1,6}[ \t]+/, "");
    if (TABLE_SEPARATOR.test(text)) continue;
    if (TABLE_ROW.test(text)) {
      const cells = text.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      text = cells.join("");
    }
    tokens.push(text);
  }
  return stripInlineSyntax(tokens.join("")).replace(/\s+/g, "");
}

const [, , inputPath, outputPath] = process.argv;
if (!inputPath) {
  console.error("usage: node scripts/repair-flattened-markdown.mjs <card-or-concept.json> [out.json]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const bodyJson = raw.body_json ?? raw;
const source = typeof bodyJson === "string" ? JSON.parse(bodyJson) : bodyJson;

const markdown = documentToMarkdown(source);
const repaired = markdownToDoc(markdown);

const before = sourceContent(source);
const after = plainText(repaired).replace(/\s+/g, "");
if (before !== after) {
  console.error("text fidelity check failed: repaired document dropped or reordered characters");
  console.error(`  before ${before.length} chars, after ${after.length} chars`);
  process.exit(2);
}

const target = outputPath ? resolve(outputPath) : undefined;
if (target) {
  writeFileSync(target, JSON.stringify({ markdown, body_json: repaired }, null, 2));
  console.error(`wrote ${target}`);
}
console.log(JSON.stringify({
  blocks_before: (source.content ?? []).length,
  blocks_after: (repaired.content ?? []).length,
  text_chars: after.length,
  preview: (repaired.content ?? []).slice(0, 3).map((node) => node.type),
}, null, 2));
