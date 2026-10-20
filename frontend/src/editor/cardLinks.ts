import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { CardSummary } from "../types";

const cardLinkKey = new PluginKey("cardLinks");

type LinkTarget = { name: string; slug: string; href: string };

function buildDecorations(doc: ProseMirrorNode, targets: LinkTarget[]): DecorationSet {
  if (targets.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => ["link", "code", "mention"].includes(mark.type.name))) return;
    const text = node.text;
    const taken: Array<[number, number]> = [];
    targets.forEach((target) => {
      let index = 0;
      while (index < text.length) {
        const at = text.indexOf(target.name, index);
        if (at < 0) break;
        const from = pos + at;
        const to = from + target.name.length;
        if (!taken.some(([start, end]) => from < end && to > start)) {
          taken.push([from, to]);
          decorations.push(
            Decoration.inline(from, to, {
              class: "card-autolink",
              "data-card-href": target.href,
              title: `打开卡片：${target.name}`,
            }),
          );
        }
        index = at + target.name.length;
      }
    });
  });
  return DecorationSet.create(doc, decorations);
}

export function CardLinks(cards: CardSummary[], worldSlug: string, currentSlug?: string) {
  const targets = cards
    .filter((card) => card.slug !== currentSlug && !card.is_auxiliary)
    .flatMap((card) => {
      const names = [card.title.trim(), card.slug.trim()].filter((name) => name.length >= 2);
      return names.map((name) => ({ name, slug: card.slug, href: `/w/${worldSlug}/wiki/${card.slug}` }));
    })
    .sort((a, b) => b.name.length - a.name.length);

  return Extension.create({
    name: "cardLinks",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: cardLinkKey,
          state: {
            init: (_config, state) => buildDecorations(state.doc, targets),
            apply: (tr, value) => tr.docChanged ? buildDecorations(tr.doc, targets) : value,
          },
          props: {
            decorations: (state) => cardLinkKey.getState(state),
          },
        }),
      ];
    },
    addOptions() {
      return {};
    },
    addKeyboardShortcuts() {
      return {
        Enter: () => false,
      };
    },
  });
}
