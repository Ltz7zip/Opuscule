import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileText, FolderPlus, Map, Plus, Search, Settings2, Users, Clock, History, Globe2, Trash2 } from "lucide-react";

import type { CardSummary, WorldDetail } from "../types";

interface CommandPaletteProps {
  open: boolean;
  world: WorldDetail;
  onClose: () => void;
  onSelectCard: (card: CardSummary) => void;
  onNewCard: () => void;
  onNewCollection: () => void;
  onOpenWiki: () => void;
  onOpenMap: () => void;
  onOpenTimeline: () => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onOpenAudit: () => void;
  onOpenTrash: () => void;
}

interface PaletteItem {
  key: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  world,
  onClose,
  onSelectCard,
  onNewCard,
  onNewCollection,
  onOpenWiki,
  onOpenMap,
  onOpenTimeline,
  onOpenSettings,
  onOpenMembers,
  onOpenAudit,
  onOpenTrash,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const commands = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      { key: "new-card", label: "新建卡片", hint: "工作区", icon: <Plus size={16} />, run: onNewCard },
      { key: "new-collection", label: "新建集合", hint: "工作区", icon: <FolderPlus size={16} />, run: onNewCollection },
      { key: "wiki", label: "打开公开 Wiki", hint: "导航", icon: <Globe2 size={16} />, run: onOpenWiki },
      { key: "map", label: "打开世界地图", hint: "导航", icon: <Map size={16} />, run: onOpenMap },
      { key: "timeline", label: "打开世界时间线", hint: "导航", icon: <Clock size={16} />, run: onOpenTimeline },
    ];
    if (world.can_edit) {
      base.push({ key: "trash", label: "打开回收站", hint: "管理", icon: <Trash2 size={16} />, run: onOpenTrash });
    }
    if (world.role === "owner") {
      base.push(
        { key: "settings", label: "世界设置", hint: "管理", icon: <Settings2 size={16} />, run: onOpenSettings },
        { key: "members", label: "成员管理", hint: "管理", icon: <Users size={16} />, run: onOpenMembers },
        { key: "audit", label: "活动记录", hint: "管理", icon: <History size={16} />, run: onOpenAudit },
      );
    }
    return base;
  }, [world.role, world.can_edit, onNewCard, onNewCollection, onOpenAudit, onOpenMap, onOpenMembers, onOpenSettings, onOpenTimeline, onOpenWiki, onOpenTrash]);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return world.cards
      .filter((card) => card.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [world.cards, query]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((item) => item.label.toLowerCase().includes(q) || (item.hint ?? "").toLowerCase().includes(q));
  }, [commands, query]);

  const items = useMemo<PaletteItem[]>(() => [
    ...filteredCommands,
    ...cards.map((card) => ({
      key: `card-${card.id}`,
      label: card.title,
      hint: "卡片",
      icon: <FileText size={16} />,
      run: () => onSelectCard(card),
    })),
  ], [cards, filteredCommands, onSelectCard]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => {
          if (items.length === 0) return 0;
          return event.key === "ArrowDown"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
        });
        return;
      }
      if (event.key === "Enter" && items[active]) {
        event.preventDefault();
        const item = items[active];
        onClose();
        item.run();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, items, onClose, open]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  return createPortal(
    <div
      className="command-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="command-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入命令或搜索卡片…"
            aria-label="输入命令或搜索卡片"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-list" ref={listRef} role="listbox" aria-label="命令和卡片">
          {items.length === 0 && <p className="command-empty">没有匹配的命令或卡片</p>}
          {filteredCommands.length > 0 && <span className="command-group">命令</span>}
          {filteredCommands.map((item, index) => (
            <button
              key={item.key}
              type="button"
              data-index={index}
              className={`command-item${active === index ? " is-active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => { onClose(); item.run(); }}
            >
              <span className="command-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
          {cards.length > 0 && <span className="command-group">卡片</span>}
          {cards.map((card, cardIndex) => {
            const index = filteredCommands.length + cardIndex;
            return (
              <button
                key={`card-${card.id}`}
                type="button"
                data-index={index}
                className={`command-item${active === index ? " is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => { onClose(); onSelectCard(card); }}
              >
                <span className="command-icon"><FileText size={16} /></span>
                <span>{card.title}</span>
                <small>卡片</small>
              </button>
            );
          })}
        </div>
        <div className="command-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>esc</kbd> 关闭</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
