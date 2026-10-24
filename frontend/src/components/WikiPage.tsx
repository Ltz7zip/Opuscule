import { useEffect, useMemo, useState, type CSSProperties, type Ref } from "react";

import { fetchCardBySlug, fetchWorld, fetchWorldTimeline } from "../api";
import { typeLabel } from "../lib/labels";
import { useDocumentMeta } from "../lib/meta";
import { useSharedSource, useVtTarget } from "../lib/viewTransition";
import type {
  CardDetail,
  CardSummary,
  SessionState,
  TimelineEra,
  WorldDetail,
} from "../types";
import { RichText } from "./RichText";
import { SiteFoot } from "./SiteFoot";
import { SiteHeader } from "./SiteHeader";
import { TypeIcon } from "./TypeIcon";

interface WikiPageProps {
  worldSlug: string;
  cardSlug?: string;
  session: SessionState | null;
  onLogout: () => void;
  initialWorld?: WorldDetail;
  initialCard?: CardDetail;
  /** The legacy site's anonymous root renders the same world home at /. */
  home?: boolean;
}

const eraTones = ["blue", "teal", "red", "violet", "sky", "gold"] as const;

/** A world surface has no cover image; the initial plate is its stable leaf. */
function WorldCover({ name, className, style, innerRef }: { name: string; className: string; style?: CSSProperties; innerRef?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={innerRef} className={className} style={style} aria-hidden="true">
      {name.trim().slice(0, 1)}
    </span>
  );
}

function Tile({ card, worldSlug }: { card: CardSummary; worldSlug: string }) {
  const source = useSharedSource("cover", card.slug);
  return (
    <a
      className="site-tile"
      href={`/w/${worldSlug}/wiki/${card.slug}`}
      onPointerEnter={source.onPointerEnter}
      onPointerLeave={source.onPointerLeave}
      onFocus={source.onFocus}
      onBlur={source.onBlur}
      onTouchStart={source.onTouchStart}
    >
      <span
        className="site-tile-cover"
        ref={source.ref}
        style={card.cover ? { backgroundImage: `url(${card.cover})` } : undefined}
      >
        {!card.cover && card.title.trim().slice(0, 1)}
      </span>
      <span className="site-tile-kind">{typeLabel(card.type_key)}</span>
      <span className="site-tile-name">{card.title}</span>
    </a>
  );
}

/**
 * Legacy public Wiki: one 1040 column, no sidebar, one navigation row.
 * Index mirrors 0.8.1 site home; article mirrors site/page.html.
 */
export function WikiPage({
  worldSlug,
  cardSlug,
  session,
  onLogout,
  initialWorld,
  initialCard,
  home = false,
}: WikiPageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(initialWorld ?? null);
  const [card, setCard] = useState<CardDetail | null>(initialCard ?? null);
  const [eras, setEras] = useState<TimelineEra[]>([]);
  const [loading, setLoading] = useState(!initialWorld);
  const [error, setError] = useState<string | null>(null);
  const heroCover = useVtTarget("cover", world?.slug ?? "");
  const heroMark = useVtTarget("icon", world?.slug ?? "");
  const articleCover = useVtTarget("cover", card?.slug ?? "");
  const articleMarker = useVtTarget("icon", card?.slug ?? "");

  useDocumentMeta({
    title: card
      ? `${card.title} · ${world?.name ?? worldSlug}`
      : world
        ? world.name
        : "Wiki · Opuscule",
    description: card?.body_text?.slice(0, 180) || world?.description,
    canonicalPath: home ? "/" : `/w/${worldSlug}/wiki${cardSlug ? `/${cardSlug}` : ""}`,
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
          ? `${nextCard.title} · ${nextWorld.name}`
          : nextWorld.name;
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

  useEffect(() => {
    if (cardSlug) return;
    let cancelled = false;
    fetchWorldTimeline(worldSlug)
      .then((data) => {
        if (!cancelled) setEras(data.eras);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cardSlug, worldSlug]);

  const sections = useMemo(
    () =>
      world
        ? world.collections
            .map((collection) => ({
              collection,
              cards: world.cards.filter((item) => item.home_collection === collection.id),
            }))
            .filter((section) => section.cards.length > 0)
        : [],
    [world],
  );
  const unclassified = useMemo(
    () => world?.cards.filter((item) => item.home_collection === null) ?? [],
    [world],
  );

  return (
    <div className="site-page wiki-page">
      <SiteHeader
        worldName={world?.name}
        worldSlug={world?.slug ?? worldSlug}
        sections={world?.collections.map((item) => ({ name: item.name, slug: item.slug })) ?? []}
        active={card ? undefined : "wiki"}
        session={session}
        onLogout={onLogout}
        home={home}
      />

      <main id="main-content" tabIndex={-1} className="site-wrap">
        {loading && <p className="site-loading">正在打开 Wiki…</p>}

        {error && (
          <p className="site-error" role="alert">
            {error}
            <a className="site-pager" href="/explore">返回公开世界</a>
          </p>
        )}

        {!loading && world && !card && (
          <>
            <section className="site-hero">
              <div className="site-hero-main">
                <h1>{world.name}</h1>
                {world.description && <p className="site-hero-sub">{world.description}</p>}
                <p className="site-hero-stats">
                  {sections.length} 个分区 · 共 {world.cards.length} 份文档
                  {world.kind === "private" ? " · 私人世界 · 公开只读" : " · 共建世界"}
                </p>
              </div>
              <div className="site-hero-aside" aria-hidden="true">
                <WorldCover
                  name={world.name}
                  className="site-hero-cover"
                  style={home ? undefined : heroCover.style}
                  innerRef={home ? undefined : heroCover.ref}
                />
                <span className="site-hero-mark" ref={home ? undefined : heroMark.ref} style={home ? undefined : heroMark.style}>
                  {world.name.trim().slice(0, 1)}
                </span>
              </div>
            </section>

            <form className="site-search-inline" action="/search" method="get" role="search">
              <input type="hidden" name="world" value={world.slug} />
              <input
                type="search"
                name="q"
                placeholder="搜名称、正文、属性、事件…"
                aria-label="搜索这个世界"
              />
              <button type="submit">搜索</button>
            </form>

            {eras.length > 0 && (
              <section className="site-section" id="eras">
                <h2>纪元</h2>
                <div className="site-era-row">
                  {eras.map((era, index) => (
                    <a
                      className={`site-era-pill era-t-${eraTones[index % eraTones.length]}`}
                      key={era.id}
                      href={`/w/${world.slug}/timeline?era=${era.id}`}
                    >
                      {era.name}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {sections.map(({ collection, cards }) => (
              <section className="site-section" id={collection.slug} key={collection.id}>
                <h2>{collection.name}</h2>
                <div className="site-grid">
                  {cards.map((item) => (
                    <Tile key={item.id} card={item} worldSlug={world.slug} />
                  ))}
                </div>
              </section>
            ))}

            {unclassified.length > 0 && (
              <section className="site-section" id="unclassified">
                <h2>未分类</h2>
                <div className="site-grid">
                  {unclassified.map((item) => (
                    <Tile key={item.id} card={item} worldSlug={world.slug} />
                  ))}
                </div>
              </section>
            )}

            {world.cards.length === 0 && (
              <p className="site-empty">这个世界还没有发布任何内容。</p>
            )}
          </>
        )}

        {!loading && world && card && (
          <article className="site-article">
            <nav className="site-crumbs" aria-label="面包屑">
              <a href={`/w/${world.slug}/wiki`}>首页</a> / <span>{typeLabel(card.type_key)}</span>
            </nav>

            <header className="site-page-head">
              <div className="site-page-heading">
                <span className="site-page-marker" ref={articleMarker.ref} style={articleMarker.style} aria-hidden="true">
                  <TypeIcon typeKey={card.type_key} />
                </span>
                <div>
                  <h1>{card.title}</h1>
                  <p className="site-page-kind">卡片 · {typeLabel(card.type_key)}</p>
                </div>
              </div>
              <div
                className="site-page-cover"
                ref={articleCover.ref}
                style={{
                  ...articleCover.style,
                  ...(card.cover ? { backgroundImage: `url(${card.cover})` } : {}),
                }}
                aria-hidden="true"
              >
                {!card.cover && card.title.trim().slice(0, 1)}
              </div>
            </header>

            <div className="site-article-body">
              <RichText
                doc={card.body_json}
                cards={world.cards}
                worldSlug={world.slug}
                currentSlug={card.slug}
              />
              {!card.body_json?.content?.length && (
                <p className="site-empty">这张卡片还没有正文。</p>
              )}
            </div>
          </article>
        )}
      </main>

      {world && (
        <SiteFoot
          worldName={world.name}
          worldDescription={world.description}
          publishedAt={world.published_at}
        />
      )}
    </div>
  );
}
