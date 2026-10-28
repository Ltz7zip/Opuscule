import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Clock3, MessageSquare, PenLine } from "lucide-react";

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const articleRef = useRef<HTMLElement | null>(null);

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
  const typeStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of publicCards) {
      counts.set(card.type_key, (counts.get(card.type_key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([key, count]) => ({ label: typeLabel(key), count }));
  }, [publicCards]);
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

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const update = () => {
      const headings = Array.from(node.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
      let active: string | null = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 130) active = heading.id;
        else break;
      }
      setActiveId((prev) => (prev === active ? prev : active));
      const rect = node.getBoundingClientRect();
      const span = Math.max(rect.height - window.innerHeight * 0.6, 1);
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const percent = Math.round(((-rect.top + 140) / span) * 100);
      const next = atEnd ? 100 : Math.min(100, Math.max(0, percent));
      setProgress((prev) => (prev === next ? prev : next));
    };
    let ticking = false;
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [concept]);

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
          <div className="concept-cover" aria-hidden="true">
            <ContourPlate seed={world.slug} />
            <span className="concept-cover-glyph">{world.name.trim().slice(0, 1)}</span>
          </div>
          <div className="concept-hero-copy">
            <p className="concept-overline">世界概念 · {world.is_public_read ? "公开世界" : "私有世界"}</p>
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
        </header>

        <div className="concept-columns">
          <nav className="concept-toc" aria-label="本页目录">
            <p className="concept-rail-label">目录</p>
            {toc.length === 0 ? (
              <p className="concept-toc-empty">尚未分节</p>
            ) : (
              <ol>
                {toc.map((item) => (
                  <li
                    key={item.id}
                    className={`level-${item.level}${activeId === item.id ? " is-active" : ""}`}
                  >
                    <a href={`#${item.id}`} aria-current={activeId === item.id ? "location" : undefined}>
                      {item.text}
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <div className="concept-toc-foot">
              <a className="concept-toc-index" href={`/w/${worldSlug}/wiki/cards`}>
                设定集 · {publicCards.length} 个词条 →
              </a>
              <span className="concept-toc-note">
                {citations.length} 个词条被本文引用
                {uncited > 0 ? `，其余 ${uncited} 个留在设定集里` : ""}。
              </span>
            </div>
          </nav>

          <article className="concept-article" onClick={onArticleClick} ref={articleRef}>
            <RichText
              doc={concept.body_json}
              cards={publicCards}
              worldSlug={worldSlug}
              autoLink={false}
              mentionMode="reading"
            />

            <footer className="concept-article-foot">
              <span>{charCount.toLocaleString("zh-CN")} 字 · 第 {concept.revision} 版</span>
              <span>更新于 {formatDate(concept.updated_at)}</span>
              <a href={`/w/${worldSlug}/wiki/cards`}>设定索引 →</a>
            </footer>
          </article>

          <aside className="concept-rail" aria-label="世界统计与引用">
            <p className="concept-rail-label">这座世界</p>
            <div className="concept-stat-grid">
              <div className="concept-stat">
                <b>{publicCards.length}</b>
                <span>词条</span>
              </div>
              {typeStats.map((item) => (
                <div key={item.label} className="concept-stat">
                  <b>{item.count}</b>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="concept-rail-block">
              <p className="concept-rail-label">
                本页引用 <span className="concept-rail-count">{citations.length} / {publicCards.length}</span>
              </p>
              {citations.length === 0 ? (
                <p className="concept-rail-empty">暂无引用</p>
              ) : (
                <div className="concept-rail-refs">
                  {citations.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="concept-rail-ref"
                      onClick={() => setPeekSlug(card.slug)}
                      title={`${typeLabel(card.type_key)} · ${stats.mentionCounts[card.slug]} 处`}
                    >
                      {card.title}
                    </button>
                  ))}
                </div>
              )}
              <p className="concept-rail-note">{totalMentions} 处提及 · 点词条可在原位侧窥</p>
            </div>

            <div className="concept-rail-block">
              <p className="concept-rail-label">
                阅读进度 <span className="concept-rail-count">{progress}%</span>
              </p>
              <div
                className="concept-progress"
                role="progressbar"
                aria-label="阅读进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
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
