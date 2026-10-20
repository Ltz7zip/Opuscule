import type { TiptapDoc, TiptapNode } from "../types";

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

function textOf(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

/** Headings in document order, with the same ids RichText assigns. */
export function collectToc(doc: TiptapDoc | null | undefined): TocEntry[] {
  const entries: TocEntry[] = [];
  const walk = (nodes: TiptapNode[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const text = textOf(node).trim();
        if (text) {
          const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)));
          entries.push({ id: `sec-${entries.length + 1}`, level, text });
        }
      } else if (node.content) {
        walk(node.content);
      }
    }
  };
  walk(doc?.content ?? []);
  return entries;
}
