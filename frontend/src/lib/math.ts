/**
 * LaTeX math inside stored text.
 *
 * World text is authored in Markdown-ish prose and often carries formulas as
 * `\( … \)` (inline) or `\[ … \]` (display), copied straight from an AI answer
 * or a LaTeX editor. Nothing in the editor turns them into a node, so the read
 * renderer is the single owner of turning them into typeset math.
 *
 * KaTeX is imported lazily together with its stylesheet: pages without formulas
 * never download either, so the entry bundle and CSS budgets stay untouched.
 * KaTeX's HTML output is used (not MathML) because Chrome's MathML Core drops
 * stretchy braces, so `\underbrace` and friends would lose their braces.
 */

export type MathSegment = { kind: "text" | "inline" | "block"; value: string };

const MATH_PATTERN = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g;

/** Split a text run into plain text and math segments, in document order. */
export function splitMath(text: string): MathSegment[] {
  if (!text) return [];
  const segments: MathSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MATH_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: "text", value: text.slice(cursor, start) });
    const block = match[1] ?? match[2];
    if (block !== undefined) {
      segments.push({ kind: "block", value: block.trim() });
    } else {
      segments.push({ kind: "inline", value: (match[3] ?? "").trim() });
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments;
}

export function hasMath(text: string): boolean {
  return /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/.test(text);
}

type KatexApi = {
  renderToString: (
    tex: string,
    options: {
      displayMode: boolean;
      throwOnError: boolean;
      strict: "ignore";
      trust: boolean;
    },
  ) => string;
};

let loader: Promise<KatexApi> | null = null;
const rendered = new Map<string, string>();
const CACHE_LIMIT = 500;

async function loadKatex(): Promise<KatexApi> {
  loader ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([module]) => {
    const candidate = (module as { default?: KatexApi }).default ?? (module as unknown as KatexApi);
    return candidate;
  });
  return loader;
}

/** Render one formula to MathML. Results are cached per formula + mode. */
export async function renderMath(tex: string, display: boolean): Promise<string> {
  const key = `${display ? "block" : "inline"}:${tex}`;
  const cached = rendered.get(key);
  if (cached) return cached;
  const katex = await loadKatex();
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
  if (rendered.size >= CACHE_LIMIT) rendered.clear();
  rendered.set(key, html);
  return html;
}
