import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, Search } from "lucide-react";

import { searchCards } from "../api";
import type { SearchResult, SearchUserResult, SearchWorldResult, SessionState } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { Topbar } from "./Topbar";
import { SiteFooter } from "./SiteFooter";

interface SearchPageProps {
  session: SessionState | null;
  onLogout: () => void;
}

function initialQuery(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
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

export function SearchPage({ session, onLogout }: SearchPageProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [worlds, setWorlds] = useState<SearchWorldResult[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
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
    const q = initialQuery().trim();
    if (!q) return;
    void runSearch(q);
    document.title = `搜索：${q} · Opuscule`;
    // runSearch is intentionally tied to the initial URL only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (value: string) => {
    const q = value.trim();
    if (!q) {
      setResults([]);
      setWorlds([]);
      setUsers([]);
      setActiveQuery("");
      setSearched(false);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchCards(q);
      setWorlds(data.worlds ?? []);
      setUsers(data.users ?? []);
      setResults(data.results);
      setHasMore(data.has_more);
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
      setResults((current) => [...current, ...data.results]);
      setHasMore(data.has_more);
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
    window.history.replaceState(null, "", `/search${q ? `?${params.toString()}` : ""}`);
    void runSearch(q);
  };

  return (
    <div className="app-shell search-page">
      <Topbar mode="public" publicLabel="搜索" session={session} onLogout={onLogout} />
      <main id="main-content" tabIndex={-1} className="search-shell">
        <header className="search-hero">
          <span className="eyebrow"><Search size={13} /> 公开搜索</span>
          <h1>在雾里找一条线索</h1>
          <p>搜索公开世界与 Wiki 卡片；私有世界不会出现在结果里。</p>
          <form className="search-form" onSubmit={submit} role="search">
            <Search size={16} />
            <input
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键词，例如：灯塔、船长、雾港"
              aria-label="搜索公开 Wiki"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
              {loading ? <Loader2 size={14} className="spin" /> : "搜索"}
            </button>
          </form>
        </header>

        {error && <div className="error" role="alert">{error}</div>}

        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在搜索…
          </div>
        )}

        {!loading && searched && results.length === 0 && worlds.length === 0 && users.length === 0 && (
          <div className="empty">
            <span className="empty-icon"><Search size={22} /></span>
            <div>
              <h2>没有找到结果</h2>
              <p>试试更短的关键词，或换一个世界。</p>
            </div>
          </div>
        )}

        {!loading && (results.length > 0 || worlds.length > 0 || users.length > 0) && (
          <>
            {worlds.length > 0 && (
              <section className="search-worlds" aria-label="匹配的世界">
                <div className="search-meta">{worlds.length} 个公开世界</div>
                <div className="search-world-grid">
                  {worlds.map((world) => (
                    <a className="search-world" key={world.slug} href={`/w/${world.slug}/wiki`}>
                      <span className="eyebrow">公开世界 · /{world.slug}</span>
                      <h2><Highlight text={world.name} query={activeQuery} /></h2>
                      {world.description && <p><Highlight text={world.description} query={activeQuery} /></p>}
                      <span className="search-result-path">进入 Wiki →</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
            {users.length > 0 && (
              <section className="search-users" aria-label="公开创作者">
                <div className="search-meta">{users.length} 位公开创作者</div>
                <div className="search-user-grid">
                  {users.map((user) => (
                    <a className="search-user" key={user.username} href={`/u/${user.username}`}>
                      <span className="eyebrow">@{user.username}</span>
                      <b><Highlight text={user.display_name} query={activeQuery} /></b>
                      {user.headline && <p><Highlight text={user.headline} query={activeQuery} /></p>}
                    </a>
                  ))}
                </div>
              </section>
            )}
            {results.length > 0 && <div className="search-meta">{results.length} 条公开卡片</div>}
            {results.length > 0 && <div className="search-results">
              {results.map((result) => (
                <a
                  className="search-result"
                  key={`${result.world_slug}:${result.card_slug}`}
                  href={`/w/${result.world_slug}/wiki/${result.card_slug}`}
                >
                  <div className="search-result-top">
                    <span className="eyebrow">{result.world_name}</span>
                    <ArrowUpRight size={14} />
                  </div>
                  <h2><Highlight text={result.title} query={activeQuery} /></h2>
                  {result.snippet && <p><Highlight text={result.snippet} query={activeQuery} /></p>}
                  <span className="search-result-path">
                    /{result.world_slug}/wiki/{result.card_slug}
                  </span>
                </a>
              ))}
            </div>}
            {hasMore && (
              <div className="search-more">
                <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? <Loader2 size={14} className="spin" /> : null}
                  {loadingMore ? "加载中…" : "加载更多卡片"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
