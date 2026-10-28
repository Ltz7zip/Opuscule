import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";

import { searchCards } from "../api";
import type {
  SearchConceptResult,
  SearchResult,
  SearchUserResult,
  SearchWorldResult,
  SessionState,
} from "../types";
import { typeLabel } from "../lib/labels";
import { useDocumentMeta } from "../lib/meta";
import { useSharedSource } from "../lib/viewTransition";
import { SiteFoot } from "./SiteFoot";
import { SiteHeader } from "./SiteHeader";
import { TypeIcon } from "./TypeIcon";

interface SearchPageProps {
  session: SessionState | null;
  onLogout: () => void;
}

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function SearchHit({ result, query }: { result: SearchResult; query: string }) {
  const source = useSharedSource("icon", result.card_slug);
  return (
    <li className="site-hit">
      <a
        className="site-hit-name site-hit-main"
        href={`/w/${result.world_slug}/wiki/${result.card_slug}`}
        onPointerEnter={source.onPointerEnter}
        onPointerLeave={source.onPointerLeave}
        onFocus={source.onFocus}
        onBlur={source.onBlur}
        onTouchStart={source.onTouchStart}
      >
        <span className="site-hit-icon" ref={source.ref} aria-hidden="true">
          <TypeIcon typeKey={result.type_key} size={16} />
        </span>
        <span className="site-hit-text">
          <span className="site-hit-title">
            <Highlight text={result.title} query={query} />
          </span>
          <span className="site-hit-meta">
            {result.world_name} · {typeLabel(result.type_key)}
          </span>
          {result.snippet && (
            <span className="site-hit-snippet">
              <Highlight text={result.snippet} query={query} />
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

function ConceptHit({ result, query }: { result: SearchConceptResult; query: string }) {
  return (
    <li className="site-hit">
      <a className="site-hit-name site-hit-main" href={`/w/${result.world_slug}/wiki`}>
        <span className="site-hit-icon" aria-hidden="true">
          <BookOpen size={16} />
        </span>
        <span className="site-hit-text">
          <span className="site-hit-title">
            <Highlight text={`${result.world_name} · ${result.title}`} query={query} />
          </span>
          <span className="site-hit-meta">世界概念 · 第 {result.revision} 版</span>
          {result.snippet && (
            <span className="site-hit-snippet">
              <Highlight text={result.snippet} query={query} />
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}

/** Legacy world/site search layout: 25px title, 44px search row, hit rows. */
export function SearchPage({ session, onLogout }: SearchPageProps) {
  const [query, setQuery] = useState(() => readParam("q"));
  const [worldSlug] = useState(() => readParam("world"));
  const [activeQuery, setActiveQuery] = useState(() => readParam("q"));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [worlds, setWorlds] = useState<SearchWorldResult[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [concepts, setConcepts] = useState<SearchConceptResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: query.trim() ? `搜索：${query.trim()} · Opuscule` : "搜索 · Opuscule",
    description: "搜索 Opuscule 公开 Wiki 的卡片标题与正文。",
    canonicalPath: "/search",
    noindex: true,
  });

  useEffect(() => {
    const q = readParam("q").trim();
    if (!q) return;
    void runSearch(q);
    document.title = `搜索：${q} · Opuscule`;
    // runSearch intentionally reads the initial URL only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (value: string) => {
    const q = value.trim();
    if (!q) {
      setResults([]);
      setWorlds([]);
      setUsers([]);
      setConcepts([]);
      setActiveQuery("");
      setSearched(false);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchCards(q);
      const scoped = worldSlug
        ? data.results.filter((item) => item.world_slug === worldSlug)
        : data.results;
      setWorlds(worldSlug ? [] : data.worlds ?? []);
      setUsers(worldSlug ? [] : data.users ?? []);
      const conceptHits = worldSlug
        ? (data.concepts ?? []).filter((item) => item.world_slug === worldSlug)
        : (data.concepts ?? []);
      setConcepts(conceptHits);
      setResults(scoped);
      setHasMore(data.has_more && !worldSlug);
      setActiveQuery(data.query);
      setSearched(true);
      document.title = `搜索：${q} · Opuscule`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    const q = activeQuery.trim();
    if (!q || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await searchCards(q, results.length);
      const scoped = worldSlug
        ? data.results.filter((item) => item.world_slug === worldSlug)
        : data.results;
      setResults((current) => [...current, ...scoped]);
      setHasMore(data.has_more && !worldSlug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (worldSlug) params.set("world", worldSlug);
    window.history.replaceState(null, "", `/search${params.toString() ? `?${params.toString()}` : ""}`);
    void runSearch(q);
  };

  const total = results.length + worlds.length + users.length + concepts.length;

  return (
    <div className="site-page search-page">
      <SiteHeader session={session} onLogout={onLogout} active="search" />

      <main id="main-content" tabIndex={-1} className="site-wrap">
        <nav className="site-crumbs" aria-label="面包屑">
          <a href="/explore">公开世界</a> / 搜索
        </nav>
        <h1 className="site-page-title">搜索</h1>

        <form className="site-search-inline" onSubmit={submit} role="search">
          {worldSlug && <input type="hidden" name="world" value={worldSlug} />}
          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜名称、正文、属性、事件…"
            aria-label="搜索公开 Wiki"
            autoFocus
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? "搜索中…" : "搜索"}
          </button>
        </form>

        {error && <p className="site-error" role="alert">{error}</p>}

        {loading && <p className="site-loading">正在搜索…</p>}

        {!loading && !searched && !query.trim() && (
          <p className="site-empty">
            输入关键词，搜索公开 Wiki 的标题、正文、属性与事件。
          </p>
        )}

        {!loading && searched && total === 0 && (
          <p className="site-empty">
            没找到「{activeQuery}」。换个说法，或者清掉筛选再试。
          </p>
        )}

        {!loading && total > 0 && (
          <>
            {activeQuery && (
              <p className="site-search-count">
                「{activeQuery}」找到 {total} 条结果{worldSlug ? ` · 限定世界 ${worldSlug}` : ""}
              </p>
            )}

            {worldSlug && (
              <p className="site-search-scope">
                当前只看 <b>{worldSlug}</b>
                <a href={`/search${activeQuery ? `?q=${encodeURIComponent(activeQuery)}` : ""}`}>
                  清掉世界筛选
                </a>
              </p>
            )}

            {worlds.length > 0 && (
              <section className="site-section" aria-label="匹配的世界">
                <h2>公开世界</h2>
                <div className="site-grid">
                  {worlds.map((world) => (
                    <a className="site-tile" key={world.slug} href={`/w/${world.slug}/wiki`}>
                      <span className="site-tile-kind">公开世界 · /{world.slug}</span>
                      <span className="site-tile-name">
                        <Highlight text={world.name} query={activeQuery} />
                      </span>
                      {world.description && (
                        <span className="site-tile-era">
                          <Highlight text={world.description} query={activeQuery} />
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {users.length > 0 && (
              <section className="site-section" aria-label="公开创作者">
                <h2>公开创作者</h2>
                <div className="site-grid">
                  {users.map((user) => (
                    <a className="site-tile" key={user.username} href={`/u/${user.username}`}>
                      <span className="site-tile-kind">@{user.username}</span>
                      <span className="site-tile-name">
                        <Highlight text={user.display_name} query={activeQuery} />
                      </span>
                      {user.headline && (
                        <span className="site-tile-era">
                          <Highlight text={user.headline} query={activeQuery} />
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {concepts.length > 0 && (
              <section className="site-section" aria-label="世界概念">
                <h2>世界概念</h2>
                <ul className="site-hit-list">
                  {concepts.map((result) => (
                    <ConceptHit
                      key={`${result.world_slug}:concept`}
                      result={result}
                      query={activeQuery}
                    />
                  ))}
                </ul>
              </section>
            )}

            {results.length > 0 && (
              <section className="site-section" aria-label="公开卡片">
                <h2>卡片</h2>
                <ul className="site-hit-list">
                  {results.map((result) => (
                    <SearchHit
                      key={`${result.world_slug}:${result.card_slug}`}
                      result={result}
                      query={activeQuery}
                    />
                  ))}
                </ul>
              </section>
            )}

            <div className="site-list-foot">
              <span>{results.length > 0 ? `已显示 ${results.length} 张卡片${hasMore ? " · 还有更多" : ""}` : ""}</span>
              <a href="#">回到顶部</a>
            </div>

            {hasMore && (
              <nav className="site-pager" aria-label="加载更多">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "加载中…" : "加载更多"}
                </button>
              </nav>
            )}
          </>
        )}
      </main>

      <SiteFoot authenticated={Boolean(session?.authenticated)} />
    </div>
  );
}
