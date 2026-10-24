import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderPlus,
  History,
  Clock,
  Map,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { createCard, deleteCard, fetchCard, updateCard } from "../api";
import { confirmAction, promptAction } from "../lib/dialogs";
import { useSharedSource } from "../lib/viewTransition";
import { buildCollectionTree, filterCards, rootCards } from "../lib/tree";
import type { CollectionTree } from "../lib/tree";
import type { CardSummary, WorldDetail } from "../types";
import { ContextMenu, type ContextMenuEntry, type ContextMenuModel } from "./ContextMenu";

interface SidebarProps {
  world: WorldDetail;
  selectedCardId: number | null;
  open: boolean;
  onClose: () => void;
  onSelectCard: (card: CardSummary) => void;
  onNewCard: (collectionId?: number | null) => void;
  onNewCollection: (parentId?: number | null) => void;
  onWorldChanged: () => Promise<void> | void;
  onCardUpdated: (card: CardSummary) => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onOpenAudit: () => void;
  onOpenPalette: () => void;
  onOpenTrash: () => void;
  onShowVersions: (card: CardSummary) => void;
  onSetEra: (card: CardSummary) => void;
  onCardDeleted: (id: number) => void;
  onError: (message: string) => void;
  canEdit: boolean;
  canManage: boolean;
}

function RowMore({ label, onClick }: { label: string; onClick: (rect: DOMRect) => void }) {
  return (
    <button
      type="button"
      className="tree-more"
      aria-label={label}
      aria-haspopup="menu"
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event.currentTarget.getBoundingClientRect());
      }}
    >
      <MoreHorizontal size={16} />
    </button>
  );
}

function CardRow({
  card,
  active,
  onSelect,
  onMenu,
}: {
  card: CardSummary;
  active: boolean;
  onSelect: (card: CardSummary) => void;
  onMenu: (card: CardSummary, x: number, y: number) => void;
}) {
  const source = useSharedSource("icon", card.slug);
  return (
    <div
      className="tree-item"
      onContextMenu={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(card, event.clientX || rect.left, event.clientY || rect.bottom);
      }}
    >
      <button
        type="button"
        className={`tree-row${active ? " active" : ""}`}
        data-card-id={card.id}
        onClick={() => onSelect(card)}
        onPointerEnter={source.onPointerEnter}
        onPointerLeave={source.onPointerLeave}
        onFocus={source.onFocus}
        onBlur={source.onBlur}
        onTouchStart={source.onTouchStart}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu(card, rect.left, rect.bottom);
        }}
        title={card.title}
        aria-current={active ? "page" : undefined}
      >
        <span className="tree-icon" ref={source.ref} aria-hidden="true">
          <FileText size={16} />
        </span>
        <span className="tree-label">{card.title}</span>
        {card.pinned && <Pin className="tree-pin" size={16} aria-label="已置顶" />}
      </button>
      <RowMore
        label={`更多操作：${card.title}`}
        onClick={(rect) => onMenu(card, rect.left, rect.bottom + 4)}
      />
    </div>
  );
}

function Branch({
  node,
  depth,
  selectedCardId,
  expanded,
  onToggle,
  onSelectCard,
  onCardMenu,
  onCollectionMenu,
}: {
  node: CollectionTree;
  depth: number;
  selectedCardId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelectCard: (card: CardSummary) => void;
  onCardMenu: (card: CardSummary, x: number, y: number) => void;
  onCollectionMenu: (node: CollectionTree, x: number, y: number) => void;
}) {
  const hasChildren = node.children.length > 0 || node.cards.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <div className="tree-group">
      <div
        className="tree-item"
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onCollectionMenu(node, event.clientX || rect.left, event.clientY || rect.bottom);
        }}
      >
        <button
          type="button"
          className="tree-row"
          style={{ paddingLeft: `${7 + depth * 10}px` }}
          onClick={() => hasChildren && onToggle(node.id)}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onCollectionMenu(node, rect.left, rect.bottom);
          }}
          aria-expanded={hasChildren ? isOpen : undefined}
          title={node.name}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="tree-caret" size={16} />
            ) : (
              <ChevronRight className="tree-caret" size={16} />
            )
          ) : (
            <span className="tree-caret" />
          )}
          <Folder className="tree-icon" size={16} />
          <span className="tree-label">{node.name}</span>
          {node.card_count > 0 && <span className="tree-count">{node.card_count}</span>}
        </button>
        <RowMore
          label={`更多操作：${node.name}`}
          onClick={(rect) => onCollectionMenu(node, rect.left, rect.bottom + 4)}
        />
      </div>

      {isOpen && (
        <div className="tree-children">
          {node.cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              active={card.id === selectedCardId}
              onSelect={onSelectCard}
              onMenu={onCardMenu}
            />
          ))}
          {node.children.map((child) => (
            <Branch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedCardId={selectedCardId}
              expanded={expanded}
              onToggle={onToggle}
              onSelectCard={onSelectCard}
              onCardMenu={onCardMenu}
              onCollectionMenu={onCollectionMenu}
            />
          ))}
          {node.cards.length === 0 && node.children.length === 0 && (
            <span className="tree-empty">空集合</span>
          )}
        </div>
      )}
    </div>
  );
}

function item(
  label: string,
  icon: ReactNode,
  run: () => void | Promise<void>,
  options: { danger?: boolean; disabled?: boolean } = {},
): ContextMenuEntry {
  return { label, icon, run, ...options };
}

export function Sidebar({
  world,
  selectedCardId,
  open,
  onClose,
  onSelectCard,
  onNewCard,
  onNewCollection,
  onWorldChanged,
  onCardUpdated,
  onOpenSettings,
  onOpenMembers,
  onOpenAudit,
  onOpenPalette,
  onOpenTrash,
  onShowVersions,
  onSetEra,
  onCardDeleted,
  onError,
  canEdit,
  canManage,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuModel | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(world.collections.map((collection) => collection.id)),
  );

  useEffect(() => {
    setExpanded(new Set(world.collections.map((collection) => collection.id)));
  }, [world.id, world.collections.length]);

  const tree = useMemo(
    () => buildCollectionTree(world.collections, world.cards),
    [world.collections, world.cards],
  );
  const roots = useMemo(() => rootCards(world.cards), [world.cards]);
  const results = useMemo(() => filterCards(world.cards, query), [world.cards, query]);

  const toggle = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const select = (card: CardSummary) => {
    onSelectCard(card);
    onClose();
  };

  const openCardMenu = (card: CardSummary, x: number, y: number) => {
    const collection = world.collections.find((item) => item.id === card.home_collection);
    const entries: ContextMenuEntry[] = [
      item("打开", <FileText size={16} />, () => select(card)),
    ];
    if (canEdit) {
      entries.push(
        item("重命名…", <Pencil size={16} />, async () => {
          const title = await promptAction({
            title: "重命名卡片",
            label: "标题",
            defaultValue: card.title,
            confirmLabel: "保存",
          });
          if (title === null || !title.trim() || title.trim() === card.title) return;
          const updated = await updateCard(world.slug, card.id, { title: title.trim() });
          onCardUpdated(updated);
        }),
        item("复制卡片", <Copy size={16} />, async () => {
          const source = await fetchCard(world.slug, card.id);
          const copy = await createCard(world.slug, {
            title: `${source.title} 副本`,
            home_collection: source.home_collection,
            body_json: source.body_json,
            type_key: source.type_key,
            icon: source.icon,
            cover: source.cover,
            is_public: source.is_public,
          });
          await onWorldChanged();
          onSelectCard(copy);
        }),
        item(
          card.is_public ? "在 Wiki 中隐藏" : "在 Wiki 中显示",
          card.is_public ? <EyeOff size={16} /> : <Eye size={16} />,
          async () => {
            const updated = await updateCard(world.slug, card.id, { is_public: !card.is_public });
            onCardUpdated(updated);
            await onWorldChanged();
          },
        ),
        item(card.pinned ? "取消置顶" : "置顶", <Pin size={16} />, async () => {
          const updated = await updateCard(world.slug, card.id, { pinned: !card.pinned });
          onCardUpdated(updated);
          await onWorldChanged();
        }),
        item("设置纪元…", <Clock size={16} />, () => onSetEra(card)),
        item("版本历史…", <History size={16} />, () => onShowVersions(card)),
      );
      if (world.collections.length > 0) {
        entries.push({ separator: true });
        for (const target of world.collections) {
          entries.push(
            item(
              `移到「${target.name}」`,
              <Folder size={16} />,
              async () => {
                if (target.id === card.home_collection) return;
                const updated = await updateCard(world.slug, card.id, { home_collection: target.id });
                onCardUpdated(updated);
                await onWorldChanged();
              },
              { disabled: target.id === card.home_collection },
            ),
          );
        }
        if (card.home_collection !== null) {
          entries.push(
            item("移到「未归类」", <Folder size={16} />, async () => {
              const updated = await updateCard(world.slug, card.id, { home_collection: null });
              onCardUpdated(updated);
              await onWorldChanged();
            }),
          );
        }
      }
      entries.push({ separator: true });
      entries.push(
        item("在此集合新建卡片", <Plus size={16} />, () => onNewCard(card.home_collection)),
      );
    }
    if (card.is_public && world.is_public_read) {
      entries.push({ separator: true });
      entries.push(
        item("打开公开页", <ExternalLink size={16} />, () => {
          window.location.href = `/w/${world.slug}/wiki/${card.slug}`;
        }),
      );
    }
    entries.push({ separator: true });
    entries.push(
      item("复制 Wiki 链接", <Copy size={16} />, async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/w/${world.slug}/wiki/${card.slug}`);
      }, { disabled: !card.is_public || !world.is_public_read }),
    );
    if (collection) {
      entries.push(item("打开所属分区", <ExternalLink size={16} />, () => {
        window.location.href = `/w/${world.slug}/wiki#${collection.slug}`;
      }));
    }
    if (canEdit) {
      entries.push({ separator: true });
      entries.push(item("移到回收站", <Trash2 size={16} />, async () => {
        const confirmed = await confirmAction({
          title: "移到回收站？",
          body: `「${card.title}」会从工作区移走，可在回收站恢复。`,
          confirmLabel: "移到回收站",
          danger: true,
        });
        if (!confirmed) return;
        await deleteCard(world.slug, card.id);
        onCardDeleted(card.id);
        await onWorldChanged();
      }, { danger: true }));
    }
    setMenu({ x, y, entries });
  };

  const openCollectionMenu = (node: CollectionTree, x: number, y: number) => {
    const entries: ContextMenuEntry[] = [];
    if (canEdit) {
      entries.push(
        item("在此新建卡片", <Plus size={16} />, () => onNewCard(node.id)),
        item("新建子集合", <FolderPlus size={16} />, () => onNewCollection(node.id)),
      );
    }
    entries.push(
      item("展开 / 收起", <ChevronDown size={16} />, () => toggle(node.id), {
        disabled: node.children.length === 0 && node.cards.length === 0,
      }),
      item("打开分区", <ExternalLink size={16} />, () => {
        window.location.href = `/w/${world.slug}/wiki#${node.slug}`;
      }),
    );
    setMenu({ x, y, entries });
  };

  const openBlankMenu = (x: number, y: number) => {
    const entries: ContextMenuEntry[] = [];
    if (canEdit) {
      entries.push(
        item("新建卡片", <Plus size={16} />, () => onNewCard(null)),
        item("新建集合", <FolderPlus size={16} />, () => onNewCollection(null)),
        { separator: true },
      );
    }
    entries.push(
      item("打开世界时间线", <Clock size={16} />, () => {
        window.location.href = `/w/${world.slug}/timeline`;
      }),
      item("打开世界地图", <Map size={16} />, () => {
        window.location.href = `/w/${world.slug}/map`;
      }),
    );
    setMenu({ x, y, entries });
  };

  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="文档导航">
      <div className="sidebar-head">
        <div>
          <div className="sidebar-title">{world.name}</div>
          <div className="sidebar-sub">工作区 · {world.cards.length} 张卡片</div>
        </div>
        <button type="button" className="icon-btn sidebar-close" aria-label="关闭导航" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="search">
        <Search size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文档…"
          aria-label="搜索文档"
        />
      </div>

      <div className="sidebar-section-label">{query ? "搜索结果" : "内容"}</div>
      <nav
        className="tree"
        aria-label="文档树"
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest(".tree-item")) return;
          event.preventDefault();
          openBlankMenu(event.clientX, event.clientY);
        }}
      >
        {query ? (
          results.length > 0 ? (
            results.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                active={card.id === selectedCardId}
                onSelect={select}
                onMenu={openCardMenu}
              />
            ))
          ) : (
            <span className="tree-empty">没有匹配的卡片</span>
          )
        ) : (
          <>
            {tree.map((node) => (
              <Branch
                key={node.id}
                node={node}
                depth={0}
                selectedCardId={selectedCardId}
                expanded={expanded}
                onToggle={toggle}
                onSelectCard={select}
                onCardMenu={openCardMenu}
                onCollectionMenu={openCollectionMenu}
              />
            ))}
            {roots.length > 0 && (
              <>
                <div className="sidebar-section-label" style={{ marginTop: 8 }}>
                  未归类
                </div>
                {roots.map((card) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    active={card.id === selectedCardId}
                    onSelect={select}
                    onMenu={openCardMenu}
                  />
                ))}
              </>
            )}
            {tree.length === 0 && roots.length === 0 && (
              <span className="tree-empty">还没有卡片</span>
            )}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        {canEdit ? (
          <button type="button" className="btn btn-primary" onClick={() => onNewCard()}>
            <Plus size={16} />
            新建文档
          </button>
        ) : (
          <a className="btn btn-secondary" href="/login">
            登录后编辑
          </a>
        )}
        <div className="sidebar-tools">
          <a className="icon-btn" href={`/w/${world.slug}/map`} aria-label="世界地图" title="世界地图">
            <Map size={16} />
          </a>
          <a className="icon-btn" href={`/w/${world.slug}/timeline`} aria-label="世界时间线" title="世界时间线">
            <Clock size={16} />
          </a>
          <div
            className="sidebar-more"
            onKeyDown={(event) => {
              if (event.key === "Escape") setMoreOpen(false);
            }}
          >
            <button
              type="button"
              className="icon-btn"
              aria-label="更多工具"
              title="更多工具"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div className="sidebar-more-menu" role="menu" aria-label="世界工具">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenPalette();
                  }}
                >
                  <Search size={16} />
                  命令面板
                  <kbd>⌘K</kbd>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenTrash();
                    }}
                  >
                    <Trash2 size={16} />
                    回收站
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenAudit();
                    }}
                  >
                    <History size={16} />
                    活动记录
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenMembers();
                    }}
                  >
                    <Users size={16} />
                    成员管理
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenSettings();
                  }}
                  disabled={!canManage}
                >
                  <Settings2 size={16} />
                  世界设置
                </button>
                <a role="menuitem" href={`/w/${world.slug}/wiki`}>
                  <FileText size={16} />
                  公开 Wiki
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} onError={onError} />
    </aside>
  );
}
