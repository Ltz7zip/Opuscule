import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ContextMenuEntry =
  | {
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      run: () => void | Promise<void>;
    }
  | { separator: true };

export interface ContextMenuModel {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
}

interface ContextMenuProps {
  menu: ContextMenuModel | null;
  onClose: () => void;
  onError?: (message: string) => void;
}

function isSeparator(entry: ContextMenuEntry): entry is { separator: true } {
  return "separator" in entry;
}

/** Legacy-style right-click menu: fixed to the pointer, clamped to viewport,
 * keyboard navigable, and closed by Escape / outside pointer / scroll. */
export function ContextMenu({ menu, onClose, onError }: ContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; menu: ContextMenuModel } | null>(null);

  useLayoutEffect(() => {
    if (!menu) {
      setPosition(null);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;

    const place = () => {
      const margin = 8;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(margin, Math.min(menu.x, window.innerWidth - width - margin));
      const top = Math.max(margin, Math.min(menu.y, window.innerHeight - height - margin));
      setPosition((current) =>
        current && current.menu === menu && current.left === left && current.top === top
          ? current
          : { left, top, menu },
      );
    };

    place();
    const frame = window.requestAnimationFrame(place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(panel);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [menu]);

  const placed = position?.menu === menu ? position : null;

  useEffect(() => {
    if (!menu || !placed) return;
    const first = panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    first?.focus({ preventScroll: true });
  }, [menu, placed]);

  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    const close = () => onClose();
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
      if (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)) {
        previous?.focus({ preventScroll: true });
      }
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="ctx-menu"
      role="menu"
      aria-label="操作菜单"
      style={{
        left: placed?.left ?? menu.x,
        top: placed?.top ?? menu.y,
        visibility: placed ? "visible" : "hidden",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.entries.map((entry, index) =>
        isSeparator(entry) ? (
          <hr key={`sep-${index}`} />
        ) : (
          <button
            key={`${entry.label}-${index}`}
            type="button"
            role="menuitem"
            className={entry.danger ? "is-danger" : undefined}
            disabled={entry.disabled}
            onMouseEnter={(event) => event.currentTarget.focus({ preventScroll: true })}
            onClick={() => {
              onClose();
              Promise.resolve(entry.run()).catch((cause: unknown) => {
                onError?.(cause instanceof Error ? cause.message : "操作失败");
              });
            }}
          >
            {entry.icon && <span className="ctx-icon" aria-hidden="true">{entry.icon}</span>}
            <span>{entry.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
