import { ArrowLeft, Compass, RefreshCw, Search } from "lucide-react";
import { SkipLink } from "./SkipLink";

export type StatusVariant = "404" | "500" | "maintenance" | "missing-card" | "missing-world";

interface StatusPageProps {
  variant: StatusVariant;
  /** Where "back" points; defaults to the site home. */
  backHref?: string;
  backLabel?: string;
}

const COPY: Record<
  StatusVariant,
  { code: string; title: string; body: string; note: string }
> = {
  "404": {
    code: "404 · 信号丢失",
    title: "这一页被挪走了",
    body: "地址没有对应任何条目。也许它从未存在，也许它已经被更名或收进私有集合。",
    note: "opuscule / not-found",
  },
  "500": {
    code: "500 · 内部故障",
    title: "错不在你",
    body: "页面渲染时出了点问题。你的内容还在库里，没有被写坏。刷新一次通常就够了。",
    note: "opuscule / render-error",
  },
  maintenance: {
    code: "维护中",
    title: "馆舍暂闭",
    body: "正在整理索引与书架，稍后回来。已经发布的内容不会丢失。",
    note: "opuscule / maintenance",
  },
  "missing-card": {
    code: "条目缺失",
    title: "这一页还没有被写下",
    body: "它可能属于私有集合，或者已经被作者删除。附近还开着的门在 Wiki 索引里。",
    note: "opuscule / card-not-found",
  },
  "missing-world": {
    code: "世界缺失",
    title: "没有找到这座世界",
    body: "链接可能已经过期，或者这座世界的公开访问已经关闭。",
    note: "opuscule / world-not-found",
  },
};

export function StatusPage({ variant, backHref = "/", backLabel = "返回首页" }: StatusPageProps) {
  const copy = COPY[variant];
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="status-page">
      <section className="status-card" aria-labelledby="status-title">
        <span className="status-code">{copy.code}</span>
        <h1 id="status-title">{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="status-actions">
          {variant === "500" || variant === "maintenance" ? (
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} />
              重新加载
            </button>
          ) : (
            <a className="btn btn-primary" href={backHref}>
              <ArrowLeft size={14} />
              {backLabel}
            </a>
          )}
          <a className="btn btn-secondary" href="/explore">
            <Compass size={14} />
            探索世界
          </a>
          <a className="btn btn-ghost" href="/search">
            <Search size={14} />
            搜索条目
          </a>
        </div>
        <div className="status-note">{copy.note}</div>
      </section>
      </main>
    </>
  );
}
