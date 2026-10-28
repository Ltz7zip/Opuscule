import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import { looksLikeMarkdown, markdownToDoc } from "../lib/markdown";

/**
 * Paste Markdown as rich text.
 *
 * Editors receive plain text from terminals, chat windows and code blocks; a
 * Markdown document pasted into Tiptap used to land as literal `## heading` and
 * `| table |` paragraphs. This plugin converts a plain-text paste only when it
 * carries structural Markdown, and leaves rich (text/html) or ordinary pastes
 * to Tiptap's default handlers.
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const data = (event as ClipboardEvent).clipboardData;
            if (!data) return false;
            // A rich paste already carries structure; converting it would lose it.
            if (data.getData("text/html")?.trim()) return false;
            const text = data.getData("text/plain");
            if (!text || !looksLikeMarkdown(text)) return false;
            try {
              const { state } = view;
              const nodes = (markdownToDoc(text).content ?? []).map((node) => state.schema.nodeFromJSON(node));
              if (!nodes.length) return false;
              const transaction = state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0));
              view.dispatch(transaction.scrollIntoView());
              return true;
            } catch {
              // Malformed Markdown must never block the paste; fall back to Tiptap.
              return false;
            }
          },
        },
      }),
    ];
  },
});
