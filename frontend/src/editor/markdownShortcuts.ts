import { Extension } from "@tiptap/core";

/**
 * Markdown-first editor shortcuts.
 *
 * Notion's block menu uses several conventions that are not Markdown:
 * `> ` is a toggle there, but it is a blockquote in Markdown; `" ` is its
 * quote shortcut. We keep `> ` as blockquote and do not add `" `. Headings
 * stay 1–6 because this editor renders the full Markdown heading range.
 * Task-list input is already provided by Tiptap's TaskItem rule.
 */
export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addKeyboardShortcuts() {
    const shortcuts: Record<string, () => boolean> = {
      // Browser-safe equivalents of Notion's block-type shortcuts. Ctrl/Cmd+
      // Alt+1..6 cannot be swallowed by tab switching the way Ctrl+1 can.
      "Mod-Alt-0": () => this.editor.chain().focus().setParagraph().run(),
    };
    for (let level = 1; level <= 6; level += 1) {
      shortcuts[`Mod-Alt-${level}`] = () => this.editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
    }
    return shortcuts;
  },
});
