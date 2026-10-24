import { useEffect, useState } from "react";

import { fetchExplore } from "../api";
import type { SessionState, WorldSummary } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { useSharedSource } from "../lib/viewTransition";
import { SiteFoot } from "./SiteFoot";
import { SiteHeader } from "./SiteHeader";
import { ContourPlate } from "./ContourPlate";

interface ExplorePageProps {
  session: SessionState | null;
  onLogout: () => void;
  initialWorlds?: WorldSummary[];
}

function ExploreTile({ world }: { world: WorldSummary }) {
  const source = useSharedSource("cover", world.slug);
  return (
    <a
      className="site-tile"
      href={`/w/${world.slug}/wiki`}
      onPointerEnter={source.onPointerEnter}
      onPointerLeave={source.onPointerLeave}
      onFocus={source.onFocus}
      onBlur={source.onBlur}
      onTouchStart={source.onTouchStart}
    >
      <span className="site-tile-cover has-contour" ref={source.ref} aria-hidden="true">
        <ContourPlate seed={world.name} />
        <span className="cover-glyph">{world.name.trim().slice(0, 1)}</span>
      </span>
      <span className="site-tile-kind">
        {world.kind === "private" ? "私人世界" : "共建世界"}
      </span>
      <span className="site-tile-name">{world.name}</span>
      {world.description && <span className="site-tile-era">{world.description}</span>}
    </a>
  );
}

export function ExplorePage({ session, onLogout, initialWorlds }: ExplorePageProps) {
  const [worlds, setWorlds] = useState<WorldSummary[]>(initialWorlds ?? []);
  const [loading, setLoading] = useState(!initialWorlds);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: "公开世界 · Opuscule",
    description: "浏览已经发布出来的世界，直接走进它们的只读站点。",
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
    document.title = "公开世界 · Opuscule";
    return () => {
      cancelled = true;
    };
  }, [initialWorlds]);

  return (
    <div className="site-page explore-page">
      <SiteHeader session={session} onLogout={onLogout} active="explore" />

      <main id="main-content" tabIndex={-1} className="site-wrap">
        <section className="site-hero">
          <div className="site-hero-main">
            <h1>公开世界</h1>
            <p className="site-hero-sub">
              这里陈列着已经发布出来的世界。点进去就是它们各自的只读站点——不用账号就能读。
            </p>
            <p className="site-hero-stats">{worlds.length} 个世界正在公开</p>
          </div>
        </section>

        {loading && <p className="site-loading" style={{ marginTop: 24 }}>正在读取公开世界…</p>}

        {error && (
          <p className="site-error" role="alert" style={{ marginTop: 24 }}>
            {error}
            <button type="button" className="site-pager" onClick={() => window.location.reload()}>
              重试
            </button>
          </p>
        )}

        {!loading && !error && worlds.length === 0 && (
          <p className="site-empty" style={{ marginTop: 24 }}>
            还没有公开的世界。
            {session?.authenticated ? (
              "进入工作区后可以把你的世界公开。"
            ) : (
              <><a href="/login">登录</a>之后可以把你的世界发布出来。</>
            )}
          </p>
        )}

        {!loading && !error && worlds.length > 0 && (
          <div className="site-grid" style={{ marginTop: 24 }}>
            {worlds.map((world) => (
              <ExploreTile key={world.id} world={world} />
            ))}
          </div>
        )}
      </main>

      <SiteFoot authenticated={Boolean(session?.authenticated)} />
    </div>
  );
}
