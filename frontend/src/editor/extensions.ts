import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Mention } from "@tiptap/extension-mention";

import type { CardSummary } from "../types";
import { createCardMentionSuggestion } from "./mention";
import { CardLinks } from "./cardLinks";
import { MarkdownShortcuts } from "./markdownShortcuts";
import { MentionAuto } from "./mentionAuto";
import {
  BookmarkBlock,
  Callout,
  CardEmbed,
  Column,
  ColumnList,
  CommentAnchor,
  GalleryBlock,
  ImageBlock,
  NestedBlock,
  PlaceholderBlock,
  ToggleBlock,
  WorldTimeline,
} from "./nodes";

export function buildDocumentExtensions({
  cards,
  worldSlug,
  currentSlug,
}: {
  cards: CardSummary[];
  worldSlug: string;
  currentSlug?: string;
}) {
  return [
    StarterKit,
    MarkdownShortcuts,
    Callout,
    ImageBlock,
    BookmarkBlock,
    CardEmbed,
    Column,
    ColumnList,
    GalleryBlock,
    PlaceholderBlock,
    CommentAnchor,
    NestedBlock,
    ToggleBlock,
    WorldTimeline,
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    CardLinks(cards, worldSlug, currentSlug),
    MentionAuto(cards, worldSlug),
    Mention.configure({
      HTMLAttributes: { class: "tiptap-mention" },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id ?? ""}`,
      renderHTML: ({ node }) => [
        "span",
        {
          class: "tiptap-mention",
          "data-type": "mention",
          "data-id": node.attrs.id ?? "",
          "data-label": node.attrs.label ?? "",
        },
        `@${node.attrs.label ?? node.attrs.id ?? ""}`,
      ],
      suggestion: createCardMentionSuggestion(cards, worldSlug) as any,
    }),
  ];
}
