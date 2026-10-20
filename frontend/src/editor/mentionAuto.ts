import { Extension, InputRule } from "@tiptap/core";

import type { CardSummary } from "../types";

export function MentionAuto(cards: CardSummary[], worldSlug: string) {
  return Extension.create({
    name: "mentionAuto",
    addInputRules() {
      return [
        new InputRule({
          find: /@([A-Za-z0-9_-]+)\s$/,
          handler: ({ match, range, chain }) => {
            const token = match[1]?.toLowerCase();
            if (!token) return;
            const card = cards.find(
              (item) => item.slug.toLowerCase() === token || item.title.toLowerCase() === token,
            );
            if (!card) return;
            chain()
              .deleteRange(range)
              .insertContent({
                type: "mention",
                attrs: { id: `${worldSlug}/${card.slug}`, label: card.title },
              })
              .insertContent(" ")
              .run();
          },
        }),
      ];
    },
  });
}
