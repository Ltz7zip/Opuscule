import { useEffect, useState } from "react";

import { renderMath } from "../lib/math";

/**
 * One formula rendered with KaTeX (MathML). While the lazily loaded engine is
 * still on its way — and if it fails — the TeX source is shown instead, so the
 * page never loses the text or jumps to an empty box.
 */
export function MathFormula({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    renderMath(tex, display)
      .then((output) => {
        if (active) setHtml(output);
      })
      .catch(() => {
        // Keep the TeX source visible; a broken formula must not break the page.
      });
    return () => {
      active = false;
    };
  }, [tex, display]);

  if (!html) {
    return <code className="rich-math-pending">{display ? `\\[${tex}\\]` : `\\(${tex}\\)`}</code>;
  }
  // A span in both cases: display math is laid out as a block via CSS, which
  // keeps the markup valid inside the paragraph the formula was authored in.
  return (
    <span
      className={display ? "rich-math-block" : "rich-math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
