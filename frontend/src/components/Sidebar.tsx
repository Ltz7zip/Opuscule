import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  History,
  Clock,
  Map,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";

import { buildCollectionTree, filterCards, rootCards } from "../lib/tree";
import type { CollectionTree } from "../lib/tree";
import type { CardSummary, WorldDetail } from "../types";

interface SidebarProps {
  world: WorldDetail;
  selectedCardId: number | null;
  open: boolean;
  onClose: () => void;
  onSelectCard: (card: CardSummary) => void;
  onNewCard: () => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onOpenAudit: () => void;
  canEdit: boolean;
  canManage: boolean;
}

function CardRow({
  card,
  active,
  onSelect,
}: {
  card: CardSummary;
  active: boolean;
  onSelect: (card: CardSummary) => void;
}) {
  return (
    <button
      type="button"
      className={`tree-row${active ? " active" : ""}`}
      onClick={() => onSelect(card)}
      title={card.title}
      aria-current={active ? "page" : undefined}
    >
      <FileText className="tree-icon" size={14} />
      <span className="tree-label">{card.title}</span>
    </button>
  );
}

function Branch({
  node,
  depth,
  selectedCardId,
  expanded,
  onToggle,
  onSelectCard,
}: {
  node: CollectionTree;
  depth: number;
  selectedCardId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelectCard: (card: CardSummary) => void;
}) {
  const hasChildren = node.children.length > 0 || node.cards.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <div className="tree-group">
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: `${7 + depth * 10}px` }}
        onClick={() => hasChildren && onToggle(node.id)}
        aria-expanded={hasChildren ? isOpen : undefined}
        title={node.name}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="tree-caret" size={14} />
          ) : (
            <ChevronRight className="tree-caret" size={14} />
          )
        ) : (
          <span className="tree-caret" />
        )}
        <Folder className="tree-icon" size={14} />
        <span className="tree-label">{node.name}</span>
        {node.card_count > 0 && <span className="tree-count">{node.card_count}</span>}
      </button>

      {isOpen && (
        <div className="tree-children">
          {node.cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              active={card.id === selectedCardId}
              onSelect={onSelectCard}
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

export function Sidebar({
  world,
  selectedCardId,
  open,
  onClose,
  onSelectCard,
  onNewCard,
  onOpenSettings,
  onOpenMembers,
  onOpenAudit,
  canEdit,
  canManage,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
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
        <Search size={14} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文档…"
          aria-label="搜索文档"
        />
      </div>

      <div className="sidebar-section-label">{query ? "搜索结果" : "内容"}</div>
      <nav className="tree" aria-label="文档树">
        {query ? (
          results.length > 0 ? (
            results.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                active={card.id === selectedCardId}
                onSelect={select}
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
          <button type="button" className="btn btn-primary" onClick={onNewCard}>
            <Plus size={14} />
            新建文档
          </button>
        ) : (
          <a className="btn btn-secondary" href="/login">
            登录后编辑
          </a>
        )}
        <div className="sidebar-tools">
          <a className="icon-btn" href={`/w/${world.slug}/map`} aria-label="世界地图" title="世界地图">
            <Map size={15} />
          </a>
          <a className="icon-btn" href={`/w/${world.slug}/timeline`} aria-label="世界时间线" title="世界时间线">
            <Clock size={15} />
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
                {canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenAudit();
                    }}
                  >
                    <History size={14} />
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
                    <Users size={14} />
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
                  <Settings2 size={14} />
                  世界设置
                </button>
                <a role="menuitem" href={`/w/${world.slug}/wiki`}>
                  <FileText size={14} />
                  公开 Wiki
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
