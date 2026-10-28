import type { TiptapDoc, TiptapNode } from "../types";

export const CONCEPT_TOP_SECTION = "concept-top";

export interface ConceptHeading {
  id: string;
  level: number;
  text: string;
}

export interface ConceptSection {
  id: string;
  label: string;
}

export interface ConceptMentionStats {
  headings: ConceptHeading[];
  mentionCounts: Record<string, number>;
  sectionsBySlug: Record<string, ConceptSection[]>;
  totalMentions: number;
}

function walk(node: TiptapNode | TiptapDoc | null | undefined, visit: (node: TiptapNode) => void) {
  if (!node || typeof node !== "object") return;
  visit(node as TiptapNode);
  const children = (node as TiptapNode).content;
  if (Array.isArray(children)) for (const child of children) walk(child, visit);
}

function nodeText(node: TiptapNode): string {
  const parts: string[] = [];
  const visit = (current: TiptapNode) => {
    if (typeof current.text === "string") parts.push(current.text);
    for (const child of current.content ?? []) visit(child);
  };
  visit(node);
  return parts.join("").trim();
}

/**
 * Mirrors RichText's heading counter so section ids and "appeared" links agree.
 * Mentions before the first heading are attributed to the opening section.
 */
export function collectConceptMentions(
  doc: TiptapDoc | null | undefined,
  worldSlug: string,
): ConceptMentionStats {
  const headings: ConceptHeading[] = [];
  const mentionCounts: Record<string, number> = {};
  const sectionsBySlug: Record<string, ConceptSection[]> = {};
  let totalMentions = 0;
  let headingIndex = 0;
  let currentSection: ConceptSection = { id: CONCEPT_TOP_SECTION, label: "开篇" };

  walk(doc, (node) => {
    if (node.type === "heading") {
      headingIndex += 1;
      currentSection = {
        id: `sec-${headingIndex}`,
        label: nodeText(node) || "未命名小节",
      };
      headings.push({
        id: currentSection.id,
        level: Number(node.attrs?.level ?? 2),
        text: currentSection.label,
      });
      return;
    }
    if (node.type !== "mention") return;
    const [mentionWorld, slug] = String(node.attrs?.id ?? "").split("/");
    if (!slug || mentionWorld !== worldSlug) return;
    mentionCounts[slug] = (mentionCounts[slug] ?? 0) + 1;
    totalMentions += 1;
    const sections = (sectionsBySlug[slug] ??= []);
    if (!sections.some((section) => section.id === currentSection.id)) {
      sections.push(currentSection);
    }
  });

  return { headings, mentionCounts, sectionsBySlug, totalMentions };
}
