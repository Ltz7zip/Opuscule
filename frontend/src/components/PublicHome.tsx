import { useEffect, useState } from "react";
import { ArrowUpRight, Globe2, Loader2 } from "lucide-react";

import { fetchWorld } from "../api";
import type { CardSummary, SessionState, WorldDetail } from "../types";
import { useDocumentMeta } from "../lib/meta";
import { Topbar } from "./Topbar";
import { SiteFooter } from "./SiteFooter";
import { Seal } from "./Seal";
import { WorldNav } from "./WorldNav";

const typeLabels: Record<string, string> = {
  character: "角色",
  place: "地点",
  event: "事件",
  note: "笔记",
  tool: "工具",
};

function CardTile({ card, worldSlug }: { card: CardSummary; worldSlug: string }) {
  return (
    <a className="public-card" href={`/w/${worldSlug}/wiki/${card.slug}`}>
      <span className="type">{typeLabels[card.type_key] ?? (card.type_key || "卡片")}</span>
      <h3>{card.title}</h3>
      <p>{card.body_text || "打开工作区阅读这张卡片。"}</p>
      <span className="arrow">
        打开 <ArrowUpRight size={12} style={{ verticalAlign: "-2px" }} />
      </span>
    </a>
  );
}

interface PublicHomeProps {
  session: SessionState | null;
  onLogout: () => void;
  initialWorld?: WorldDetail;
}

export function PublicHome({ session, onLogout, initialWorld }: PublicHomeProps) {
  const [world, setWorld] = useState<WorldDetail | null>(initialWorld ?? null);
  const [loading, setLoading] = useState(!initialWorld);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: world ? `${world.name} · Opuscule` : "Opuscule",
    description: world?.description,
    canonicalPath: "/",
  });

  useEffect(() => {
    if (initialWorld) return;
    let cancelled = false;
    fetchWorld("wuhai")
      .then((next) => {
        if (!cancelled) {
          setWorld(next);
          document.title = `${next.name} · Opuscule`;
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "世界加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialWorld]);

  const sections = world
    ? world.collections
        .map((collection) => ({
          collection,
          cards: world.cards.filter((card) => card.home_collection === collection.id),
        }))
        .filter((section) => section.cards.length > 0)
    : [];
  const unclassified = world?.cards.filter((card) => card.home_collection === null) ?? [];

  return (
    <div className="app-shell public">
      <Topbar mode="public" publicLabel="世界" worldName={world?.name} worldSlug={world?.slug} session={session} onLogout={onLogout} />
      {world && <WorldNav worldSlug={world.slug} worldName={world.name} />}

      <main id="main-content" tabIndex={-1}>

      {loading && (
        <div className="public-hero">
          <div className="loading">
            <Loader2 size={16} className="spin" />
            正在打开世界…
          </div>
        </div>
      )}

      {error && (
        <div className="public-hero">
          <div className="error" role="alert">
            {error}
            <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
        </div>
      )}

      {world && (
        <>
          <section className="public-hero">
            <span className="eyebrow">
              <Globe2 size={13} />
              公开世界 · 只读
              <Seal>公开</Seal>
            </span>
            <h1>{world.name}</h1>
            <p>{world.description || "这个世界还没有写简介。"}</p>
            <div className="public-meta">
              <span className="chip">{world.kind === "private" ? "私人世界 · 公开只读" : "共建世界"}</span>
              <span className="chip">{world.collections.length} 个集合</span>
              <span className="chip">{world.cards.length} 张卡片</span>
              <a className="btn btn-primary" href={`/w/${world.slug}/wiki`} style={{ marginLeft: 4 }}>
                浏览 Wiki
              </a>
              <a className="btn btn-secondary" href={`/w/${world.slug}`}>
                进入工作区
              </a>
              <a className="btn btn-secondary" href="/explore">
                探索
              </a>
            </div>
          </section>

          {sections.map(({ collection, cards }) => (
            <section className="public-section" key={collection.id}>
              <div className="section-head">
                <h2>{collection.name}</h2>
                <span>{cards.length} 张卡片</span>
              </div>
              <div className="public-grid">
                {cards.map((card) => (
                  <CardTile key={card.id} card={card} worldSlug={world.slug} />
                ))}
              </div>
            </section>
          ))}

          {unclassified.length > 0 && (
            <section className="public-section">
              <div className="section-head">
                <h2>未归类</h2>
                <span>{unclassified.length} 张卡片</span>
              </div>
              <div className="public-grid">
                {unclassified.map((card) => (
                  <CardTile key={card.id} card={card} worldSlug={world.slug} />
                ))}
              </div>
            </section>
          )}

        </>
      )}
      </main>
      {world && (
        <SiteFooter
          worldName={world.name}
          collections={world.collections.length}
          cards={world.cards.length}
        />
      )}
    </div>
  );
}
