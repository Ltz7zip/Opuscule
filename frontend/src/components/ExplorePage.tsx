import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Compass, Loader2, Plus, Search, Users } from "lucide-react";

import { fetchExplore } from "../api";
import type { SessionState, WorldSummary } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { Topbar } from "./Topbar";
import { SiteFooter } from "./SiteFooter";

interface ExplorePageProps {
  session: SessionState | null;
  onLogout: () => void;
  initialWorlds?: WorldSummary[];
}

export function ExplorePage({ session, onLogout, initialWorlds }: ExplorePageProps) {
  const [worlds, setWorlds] = useState<WorldSummary[]>(initialWorlds ?? []);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!initialWorlds);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: "探索世界 · Opuscule",
    description: "浏览已经公开的世界，进入它们的 Wiki；只展示 public-read 世界。",
    canonicalPath: "/explore",
  });

  useEffect(() => {
    if (initialWorlds) return;
    let cancelled = false;
    fetchExplore()
      .then((data) => {
        if (!cancelled) setWorlds(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "世界列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    document.title = "探索世界 · Opuscule";
    return () => {
      cancelled = true;
    };
  }, [initialWorlds]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return worlds;
    return worlds.filter(
      (world) =>
        world.name.toLowerCase().includes(needle) ||
        world.description.toLowerCase().includes(needle) ||
        world.slug.toLowerCase().includes(needle),
    );
  }, [query, worlds]);

  return (
    <div className="app-shell explore-page">
      <Topbar mode="public" publicLabel="探索" worldSlug={worlds[0]?.slug} session={session} onLogout={onLogout} />

      <main id="main-content" tabIndex={-1} className="explore-shell">
        <header className="explore-hero">
          <span className="eyebrow">
            <Compass size={13} />
            探索
          </span>
          <h1>公开世界</h1>
          <p>这里陈列着已经发布出来的世界。点进去就是它们各自的只读站点——不用账号就能读。</p>
          <p className="explore-meta">{filtered.length} 个世界正在公开</p>
          {session?.authenticated && (
            <a className="btn btn-secondary" href="/worlds/new" style={{ marginTop: 14 }}>
              <Plus size={14} /> 新建世界
            </a>
          )}
          <label className="explore-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索世界名、简介或 slug…"
              aria-label="搜索世界"
            />
          </label>
        </header>

        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" />
            正在读取公开世界…
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            {error}
            <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="empty">
            <span className="empty-icon"><Compass size={22} /></span>
            <div>
              <h2>{query ? "没有匹配的世界" : "还没有公开世界"}</h2>
              <p>{query ? "换一个关键词试试。" : "公开世界会出现在这里。"}</p>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="explore-grid">
            {filtered.map((world) => (
              <article className="explore-card" key={world.id}>
                <div className="explore-card-top">
                  <span className="chip">{world.kind === "private" ? "私人世界 · 公开只读" : "共建世界"}</span>
                  <span className="explore-slug">/{world.slug}</span>
                </div>
                <h2>{world.name}</h2>
                <p>{world.description || "这个世界还没有写简介。"}</p>
                <div className="explore-stats">
                  <span><BookOpen size={12} /> {world.card_count} 张卡片</span>
                  <span><Users size={12} /> {world.collection_count} 个集合</span>
                </div>
                <div className="explore-actions">
                  <a className="btn btn-primary" href={`/w/${world.slug}/wiki`}>
                    浏览 Wiki <ArrowUpRight size={13} />
                  </a>
                  <a className="btn btn-secondary" href={`/w/${world.slug}`}>
                    工作区
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
