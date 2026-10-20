import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Loader2, Search, Share2 } from "lucide-react";

import { fetchCardBySlug, fetchWorld } from "../api";
import { typeLabel } from "../lib/labels";
import { useDocumentMeta } from "../lib/meta";
import { promptAction } from "../lib/dialogs";
import { buildCollectionTree, flattenCards, rootCards } from "../lib/tree";
import { collectToc } from "../lib/toc";
import type { CardDetail, CardSummary, SessionState, WorldDetail } from "../types";
import { RichText } from "./RichText";
import { Topbar } from "./Topbar";
import { SiteFooter } from "./SiteFooter";
import { EditionLine } from "./EditionLine";
import { Seal } from "./Seal";
import { WorldNav } from "./WorldNav";

interface WikiPageProps {
  worldSlug: string;
  cardSlug?: string;
  session: SessionState | null;
  onLogout: () => void;
  initialWorld?: WorldDetail;
  initialCard?: CardDetail;
}

function WikiLink({ worldSlug, card, active }: { worldSlug: string; card: CardSummary; active: boolean }) {
  return (
    <a
      className={`wiki-nav-link${active ? " active" : ""}`}
      href={`/w/${worldSlug}/wiki/${card.slug}`}
      aria-current={active ? "page" : undefined}
    >
      <span>{card.title}</span>
      <span className="wiki-nav-type">{typeLabel(card.type_key)}</span>
    </a>
  );
}

export function WikiPage({
  worldSlug,
  cardSlug,
  session,
  onLogout,
  initialWorld,
  initialCard,
}: WikiPageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(initialWorld ?? null);
  const [card, setCard] = useState<CardDetail | null>(initialCard ?? null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(!initialWorld);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: card
      ? `${card.title} · ${world?.name ?? worldSlug} Wiki`
      : world
        ? `${world.name} · Wiki`
        : "Wiki · Opuscule",
    description: card?.body_text?.slice(0, 180) || world?.description,
    canonicalPath: `/w/${worldSlug}/wiki${cardSlug ? `/${cardSlug}` : ""}`,
    type: card ? "article" : "website",
  });

  useEffect(() => {
    if (initialWorld) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWorld(worldSlug),
      cardSlug ? fetchCardBySlug(worldSlug, cardSlug) : Promise.resolve(null),
    ])
      .then(([nextWorld, nextCard]) => {
        if (cancelled) return;
        setWorld(nextWorld);
        setCard(nextCard);
        document.title = nextCard
          ? `${nextCard.title} · ${nextWorld.name} Wiki`
          : `${nextWorld.name} · Wiki`;
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Wiki 加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardSlug, initialWorld, worldSlug]);

  const copyShare = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/share/w/${worldSlug}/${card.slug}/`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      await promptAction({
        title: "分享链接",
        body: "自动复制失败，请手动复制下面的链接。",
        defaultValue: `${window.location.origin}/share/w/${worldSlug}/${card.slug}/`,
        confirmLabel: "完成",
      });
    }
  };

  const tree = useMemo(
    () => (world ? buildCollectionTree(world.collections, world.cards) : []),
    [world],
  );
  const roots = useMemo(() => (world ? rootCards(world.cards) : []), [world]);
  const toc = useMemo(() => {
    const entries = collectToc(card?.body_json);
    // A body h1 equal to the page title would repeat the heading right above
    // the table of contents; drop it from the list (its id stays on the node).
    return entries.filter(
      (entry, index) =>
        !(index === 0 && entry.text.trim() === card?.title.trim()),
    );
  }, [card?.body_json, card?.title]);
  const ordered = useMemo(() => flattenCards(tree, roots), [tree, roots]);
  const currentIndex = card ? ordered.findIndex((item) => item.slug === card.slug) : -1;
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null;
  const filtered = useMemo(() => {
    if (!world) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return world.cards.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        typeLabel(item.type_key).includes(needle) ||
        item.slug.toLowerCase().includes(needle),
    );
  }, [query, world]);

  return (
    <div className={`app-shell wiki-page${card ? "" : " wiki-index"}`}>
      <Topbar mode="public" publicLabel="Wiki" worldName={world?.name} worldSlug={world?.slug} session={session} onLogout={onLogout} />
      {world && <WorldNav worldSlug={world.slug} worldName={world.name} active="wiki" />}

      <div className="wiki-shell">
        {world && (
          <aside className="wiki-sidebar" aria-label="Wiki 导航">
            <div className="wiki-sidebar-head">
              <span className="sidebar-title">{world.name}</span>
              <span className="sidebar-sub">公开 Wiki</span>
            </div>
            <div className="search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Wiki…"
                aria-label="搜索 Wiki"
              />
            </div>
            <nav className="wiki-nav" aria-label="Wiki 文档">
              {query ? (
                filtered.length > 0 ? (
                  filtered.map((item) => (
                    <WikiLink key={item.id} worldSlug={world.slug} card={item} active={item.slug === cardSlug} />
                  ))
                ) : (
                  <span className="tree-empty">没有匹配的文档</span>
                )
              ) : (
                <>
                  {tree.map((node) => (
                    <div className="wiki-nav-group" key={node.id}>
                      <div className="wiki-nav-heading">{node.name}</div>
                      {node.cards.map((item) => (
                        <WikiLink key={item.id} worldSlug={world.slug} card={item} active={item.slug === cardSlug} />
                      ))}
                    </div>
                  ))}
                  {roots.length > 0 && (
                    <div className="wiki-nav-group">
                      <div className="wiki-nav-heading">未归类</div>
                      {roots.map((item) => (
                        <WikiLink key={item.id} worldSlug={world.slug} card={item} active={item.slug === cardSlug} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </nav>
            <a className="btn btn-primary wiki-workspace-link" href={`/w/${world.slug}`}>
              进入工作区
            </a>
          </aside>
        )}

        <main id="main-content" tabIndex={-1} className="wiki-main">
          {loading && (
            <div className="loading">
              <Loader2 size={16} className="spin" />
              正在打开 Wiki…
            </div>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
              <a className="btn btn-secondary" style={{ marginLeft: "auto" }} href="/explore">
                返回探索
              </a>
            </div>
          )}

          {!loading && world && !card && (
            <>
              <header className="wiki-hero">
                <span className="eyebrow">
                  <BookOpen size={13} />
                  公开 Wiki · 只读
                  <Seal>公开</Seal>
                </span>
                <h1>{world.name}</h1>
                <p className="wiki-meta">
                  {world.collections.length} 个分区 · 共 {world.cards.length} 份文档 · 公开只读
                </p>
                <p>{world.description || "这个世界还没有写简介。"}</p>
                <div className="wiki-hero-actions">
                  <a className="btn btn-primary" href={`/w/${world.slug}`}>进入工作区</a>
                  <a className="btn btn-secondary" href={`/w/${world.slug}/map`}>世界地图</a>
                  <a className="btn btn-secondary" href={`/w/${world.slug}/timeline`}>时间线</a>
                </div>
              </header>

              {tree.map((node) => {
                if (node.cards.length === 0) return null;
                return (
                  <section className="wiki-section" key={node.id}>
                    <div className="section-head">
                      <h2>{node.name}</h2>
                      <span>{node.cards.length} 篇</span>
                    </div>
                    <div className="wiki-card-list">
                      {node.cards.map((item) => (
                        <a className="wiki-card" key={item.id} href={`/w/${world.slug}/wiki/${item.slug}`}>
                          <span className="type">{typeLabel(item.type_key)}</span>
                          <h3>{item.title}</h3>
                          <p>{item.body_text || "打开阅读。"}</p>
                          <ArrowUpRight size={13} />
                        </a>
                      ))}
                    </div>
                  </section>
                );
              })}

              {roots.length > 0 && (
                <section className="wiki-section">
                  <div className="section-head"><h2>未归类</h2><span>{roots.length} 篇</span></div>
                  <div className="wiki-card-list">
                    {roots.map((item) => (
                      <a className="wiki-card" key={item.id} href={`/w/${world.slug}/wiki/${item.slug}`}>
                        <span className="type">{typeLabel(item.type_key)}</span>
                        <h3>{item.title}</h3>
                        <p>{item.body_text || "打开阅读。"}</p>
                        <ArrowUpRight size={13} />
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && world && card && (
            <article className="wiki-article">
              <div className="wiki-breadcrumb">
                <a href={`/w/${world.slug}/wiki`}>
                  <ArrowLeft size={12} /> 返回 {world.name} Wiki
                </a>
              </div>
              <header>
                <span className="eyebrow">{typeLabel(card.type_key)}</span>
                <h1>{card.title}</h1>
                <div className="wiki-article-meta">
                  <EditionLine revision={card.revision} updatedAt={card.updated_at} />
                  <a href={`/w/${world.slug}?card=${card.id}`}>在工作区打开 <ArrowUpRight size={12} /></a>
                  <button type="button" className="wiki-share" onClick={() => void copyShare()}>
                    {copied ? <Check size={12} /> : <Share2 size={12} />}
                    {copied ? "已复制分享链接" : "分享"}
                  </button>
                </div>
              </header>
              {toc.length >= 2 && (
                <nav className="article-toc" aria-label="文章目录">
                  <span className="article-toc-title">目录</span>
                  <ol>
                    {toc.map((entry) => (
                      <li key={entry.id} className={`toc-level-${entry.level}`}>
                        <a href={`#${entry.id}`}>{entry.text}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <RichText doc={card.body_json} cards={world.cards} worldSlug={world.slug} currentSlug={card.slug} />
              {(previous || next) && (
                <nav className="article-nav" aria-label="相邻条目">
                  {previous ? (
                    <a className="article-nav-link" href={`/w/${world.slug}/wiki/${previous.slug}`}>
                      <span>← 上一篇</span>
                      <strong>{previous.title}</strong>
                    </a>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <a className="article-nav-link next" href={`/w/${world.slug}/wiki/${next.slug}`}>
                      <span>下一篇 →</span>
                      <strong>{next.title}</strong>
                    </a>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </article>
          )}
        </main>
      </div>
      <SiteFooter
        worldName={world?.name}
        collections={world?.collections.length}
        cards={world?.cards.length}
      />
    </div>
  );
}
