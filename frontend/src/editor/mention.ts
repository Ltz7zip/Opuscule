import type { CardSummary } from "../types";

type MentionItem = CardSummary;
type RenderProps = {
  items: MentionItem[];
  query: string;
  range: { from: number; to: number };
  command: (item: MentionItem) => void;
  editor: unknown;
  clientRect?: (() => DOMRect | null) | null;
};

function positionPopup(popup: HTMLElement, props: RenderProps) {
  const rect = props.clientRect?.();
  if (!rect) return;
  popup.style.left = `${Math.min(window.innerWidth - 280, Math.max(12, rect.left))}px`;
  popup.style.top = `${Math.min(window.innerHeight - 260, rect.bottom + 6)}px`;
}

export function createCardMentionSuggestion(cards: CardSummary[], worldSlug: string) {
  return {
    char: "@",
    items: ({ query }: { query: string }) =>
      cards
        .filter((card) => {
          const normalized = query.trim().toLowerCase();
          return !normalized
            || card.title.toLowerCase().includes(normalized)
            || card.slug.toLowerCase().includes(normalized);
        })
        .slice(0, 8),
    render: () => {
      let popup: HTMLDivElement | null = null;
      let current: RenderProps | null = null;
      let visibleItems: MentionItem[] = [];

      const choose = (item: MentionItem) => {
        current?.command(item);
      };

      const draw = (props: RenderProps) => {
        current = props;
        visibleItems = props.items;
        if (!popup) {
          popup = document.createElement("div");
          popup.className = "editor-mention-menu";
          popup.setAttribute("role", "listbox");
          popup.addEventListener("mousedown", (event) => event.preventDefault());
          document.body.appendChild(popup);
        }
        popup.replaceChildren();
        if (visibleItems.length === 0) {
          const empty = document.createElement("div");
          empty.className = "editor-mention-empty";
          empty.textContent = "没有匹配的卡片";
          popup.appendChild(empty);
        }
        visibleItems.forEach((item) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "editor-mention-item";
          button.setAttribute("role", "option");
          button.innerHTML = `<b></b><small></small>`;
          button.querySelector("b")!.textContent = item.title;
          button.querySelector("small")!.textContent = `@${item.slug}`;
          button.addEventListener("click", () => choose(item));
          popup?.appendChild(button);
        });
        positionPopup(popup, props);
      };

      return {
        onStart: (props: RenderProps) => draw(props),
        onUpdate: (props: RenderProps) => draw(props),
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (!popup) return false;
          if (event.key === "Escape") {
            popup.remove();
            popup = null;
            return true;
          }
          if (event.key === "Enter") {
            if (visibleItems[0]) choose(visibleItems[0]);
            return true;
          }
          return false;
        },
        onExit: () => {
          popup?.remove();
          popup = null;
        },
      };
    },
    command: ({ editor, range, props }: { editor: any; range: { from: number; to: number }; props: MentionItem }) => {
      editor.chain().focus().insertContentAt(range, [
        {
          type: "mention",
          attrs: {
            id: `${worldSlug}/${props.slug}`,
            label: props.title,
          },
        },
        { type: "text", text: " " },
      ]).run();
    },
  };
}
