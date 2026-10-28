import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowUpRight, BookOpen, Clock3, MessageSquare, PenLine } from "lucide-react";

import { fetchWorld, fetchWorldConcept, type ApiError } from "../api";
import { collectConceptMentions, CONCEPT_TOP_SECTION } from "../lib/conceptMentions";
import { typeLabel } from "../lib/labels";
import { useDocumentMeta } from "../lib/meta";
import type { SessionState, WorldConcept, WorldDetail } from "../types";
import { CardPeek } from "./CardPeek";
import { ConceptComments } from "./ConceptComments";
import { ContourPlate } from "./ContourPlate";
import { RichText } from "./RichText";
import { SiteHeader } from "./SiteHeader";
import { WikiPage } from "./WikiPage";

interface WorldConceptPageProps {
  worldSlug: string;
  session: SessionState | null;
  onLogout: () => void;
  initialWorld?: WorldDetail;
  initialConcept?: WorldConcept;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

export function WorldConceptPage({
  worldSlug,
  session,
  onLogout,
  initialWorld,
  initialConcept,
}: WorldConceptPageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(initialWorld ?? null);
  const [concept, setConcept] = useState<WorldConcept | null>(initialConcept ?? null);
  const [loading, setLoading] = useState(!initialWorld || !initialConcept);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peekSlug, setPeekSlug] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    if (initialWorld && initialConcept) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      initialWorld ? Promise.resolve(initialWorld) : fetchWorld(worldSlug),
      initialConcept
        ? Promise.resolve(initialConcept)
        : fetchWorldConcept(worldSlug).catch((cause: unknown) => {
            if (cause instanceof Error && "status" in cause && (cause as ApiError).status === 404) return null;
            throw cause;
          }),
    ])
      .then(([nextWorld, nextConcept]) => {
        if (cancelled) return;
        setWorld(nextWorld);
        setConcept(nextConcept);
        setNotFound(!nextConcept);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "概念加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialConcept, initialWorld, worldSlug]);

  const published = Boolean(concept?.published_at);
  useDocumentMeta({
    title: world ? `${world.name} · 世界概念` : "世界概念 · Opuscule",
    description: concept?.body_text?.slice(0, 180) || world?.description,
    canonicalPath: `/w/${worldSlug}/wiki`,
    type: "article",
    noindex: !published,
  });

  const publicCards = useMemo(() => (world?.cards ?? []).filter((card) => card.is_public && !card.is_auxiliary), [world]);
  const stats = useMemo(() => collectConceptMentions(concept?.body_json, worldSlug), [concept, worldSlug]);
  const toc = stats.headings;
  const citations = useMemo(
    () =>
      publicCards
        .filter((card) => (stats.mentionCounts[card.slug] ?? 0) > 0)
        .sort(
          (left, right) =>
            (stats.mentionCounts[right.slug] ?? 0) - (stats.mentionCounts[left.slug] ?? 0) ||
            left.title.localeCompare(right.title, "zh-CN"),
        ),
    [publicCards, stats],
  );
  const totalMentions = stats.totalMentions;
  const uncited = Math.max(0, publicCards.length - citations.length);
  const peekAppeared = peekSlug ? (stats.sectionsBySlug[peekSlug] ?? []) : [];
  const charCount = concept?.body_text.replace(/\s/g, "").length ?? 0;
  const readMinutes = Math.max(1, Math.ceil(charCount / 400));
  const canEdit = Boolean(world?.can_edit && session?.authenticated);

  const onArticleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a.rich-mention-reading");
    if (!target) return;
    const match = new URL(target.href, window.location.origin).pathname.match(
      /^\/w\/([^/]+)\/wiki\/([^/]+)\/?$/,
    );
    if (!match || decodeURIComponent(match[1]) !== worldSlug) return;
    event.preventDefault();
    setPeekSlug(decodeURIComponent(match[2]));
  };

  const goSection = (id: string) => {
    setPeekSlug(null);
    if (id === CONCEPT_TOP_SECTION) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (loading) {
    return (
      <div className="concept-shell">
        <SiteHeader worldName={world?.name} worldSlug={worldSlug} active="world" session={session} onLogout={onLogout} />
        <div className="concept-loading" role="status">正在打开世界概念…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="concept-shell">
        <SiteHeader worldName={world?.name} worldSlug={worldSlug} active="world" session={session} onLogout={onLogout} />
        <div className="concept-loading" role="alert">{error}</div>
      </div>
    );
  }

  if (!world || notFound || !concept) {
    return (
      <WikiPage
        worldSlug={worldSlug}
        session={session}
        onLogout={onLogout}
        initialWorld={world ?? undefined}
        mode="read"
        conceptCta={Boolean(world?.can_edit && session?.authenticated)}
      />
    );
  }

  const updated = concept.updated_by ?? concept.created_by;

  return (
    <div className="concept-shell">
      <SiteHeader worldName={world.name} worldSlug={worldSlug} active="world" session={session} onLogout={onLogout} />
      {commentsOpen && (
        <ConceptComments worldSlug={worldSlug} onClose={() => setCommentsOpen(false)} />
      )}
      <main id="main-content" className="concept-main">
        <header className="concept-hero">
          <div className="concept-hero-copy">
            <p className="concept-overline">WORLD CONCEPT · {world.is_public_read ? "OPEN" : "PRIVATE"} WORLD</p>
            <h1>{world.name}</h1>
            {world.description && <p className="concept-lede">{world.description}</p>}
            <div className="concept-meta">
              <span><Clock3 size={13} /> {readMinutes} 分钟阅读</span>
              <span>世界设定 · {publicCards.length} 份文档</span>
              <span>最近发布 {formatDate(concept.published_at)}</span>
            </div>
            <div className="concept-byline">
              <span className="concept-byline-dot" />
              <span>{updated ? `由 ${updated} 维护` : "世界概念"}</span>
              {concept.revision > 1 && <span>第 {concept.revision} 版</span>}
            </div>
            {canEdit && (
              <div className="concept-hero-actions">
                <a className="concept-edit-link" href={`/w/${worldSlug}/wiki/edit`}>
                  <PenLine size={15} /> 编辑这篇世界概念
                </a>
                <button
                  type="button"
                  className="concept-comment-link"
                  onClick={() => setCommentsOpen(true)}
                >
                  <MessageSquare size={15} /> 成员评论
                </button>
              </div>
            )}
          </div>
          <div className="concept-cover" aria-hidden="true">
            <ContourPlate seed={world.slug} />
            <span className="concept-cover-glyph">{world.name.trim().slice(0, 1)}</span>
            <span className="concept-cover-label">A WORLD, READ AS ONE PAGE</span>
          </div>
        </header>

        <div className="concept-columns">
          <nav className="concept-toc" aria-label="本页目录">
            <p className="concept-rail-label">目录</p>
            {toc.length === 0 ? (
              <p className="concept-toc-empty">尚未分节</p>
            ) : (
              <ol>
                {toc.map((item) => (
                  <li key={item.id} className={`level-${item.level}`}>
                    <a href={`#${item.id}`}>{item.text}</a>
                  </li>
                ))}
              </ol>
            )}
            <div className="concept-toc-foot">
              <BookOpen size={14} />
              <span>世界概念不是卡片；它是这个世界的第一篇连续叙事。</span>
            </div>
          </nav>

          <article className="concept-article" onClick={onArticleClick}>
            <RichText
              doc={concept.body_json}
              cards={publicCards}
              worldSlug={worldSlug}
              autoLink={false}
              mentionMode="reading"
            />

            <section className="concept-citations" aria-labelledby="concept-citations-title">
              <div className="concept-citations-head">
                <p className="concept-rail-label" id="concept-citations-title">本页引用</p>
                <span>{citations.length} 个词条 · {totalMentions} 处提及</span>
              </div>
              {citations.length === 0 ? (
                <p className="concept-citations-empty">这篇概念还没有引用卡片。在编辑器里输入 @ 可以引用世界中的设定。</p>
              ) : (
                <>
                  <ul>
                    {citations.map((card) => (
                      <li key={card.id}>
                        <button
                          type="button"
                          className="concept-cited-chip"
                          onClick={() => setPeekSlug(card.slug)}
                        >
                          <span>{card.title}</span>
                          <small>
                            {typeLabel(card.type_key)} · {stats.mentionCounts[card.slug]} 处
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {uncited > 0 && (
                    <p className="concept-citations-more">
                      还有 {uncited} 个词条没有被概念引用；它们仍在设定集里。
                    </p>
                  )}
                </>
              )}
            </section>

            <footer className="concept-article-foot">
              <span>{charCount.toLocaleString("zh-CN")} 字</span>
              <span>最后发布 {formatDate(concept.published_at)}</span>
              <a href={`/w/${worldSlug}/wiki/cards`}>浏览设定索引 →</a>
            </footer>
          </article>

          <aside className="concept-rail" aria-label="概念信息">
            <div className="concept-rail-block">
              <p className="concept-rail-label">
                本页引用 <span className="concept-rail-count">{citations.length} / {publicCards.length}</span>
              </p>
              {citations.length === 0 ? (
                <p className="concept-rail-empty">暂无引用</p>
              ) : (
                <ul>
                  {citations.slice(0, 6).map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        className="concept-rail-cited"
                        onClick={() => setPeekSlug(card.slug)}
                      >
                        {card.title}
                        <small>{stats.mentionCounts[card.slug]}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="concept-rail-block">
              <p className="concept-rail-label">世界</p>
              <p className="concept-rail-world">{world.name}</p>
              <p className="concept-rail-sub">{publicCards.length} 份公开文档 · 最近发布 {formatDate(concept.published_at)}</p>
            </div>
            <a className="concept-rail-link" href={`/w/${worldSlug}/wiki/cards`}>
              进入设定集 <ArrowUpRight size={14} />
            </a>
          </aside>
        </div>
      </main>
      <footer className="concept-site-foot">
        <span>Opuscule · 世界是一篇长文，设定是它的脚注。</span>
        <a href={`/w/${worldSlug}/wiki/cards`}>设定索引</a>
      </footer>

      <CardPeek
        worldSlug={worldSlug}
        slug={peekSlug}
        appeared={peekAppeared}
        onClose={() => setPeekSlug(null)}
        onGoSection={goSection}
      />
    </div>
  );
}
