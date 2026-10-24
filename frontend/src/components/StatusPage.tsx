import { ArrowLeft, Compass, RefreshCw } from "lucide-react";
import { useDocumentMeta } from "../lib/meta";
import { SkipLink } from "./SkipLink";

export type StatusVariant = "404" | "500" | "maintenance" | "missing-card" | "missing-world";

interface StatusPageProps {
  variant: StatusVariant;
  backHref?: string;
  backLabel?: string;
}

const COPY: Record<
  StatusVariant,
  { code: string; number: string; title: string; body: string; note: string }
> = {
  "404": {
    code: "404 · 信号丢失",
    number: "404",
    title: "这一页被挪走了",
    body: "地址没有对应任何条目。也许它从未存在，也许它已经被更名或收进私有集合。",
    note: "如果你确定这里应该有东西：在地址栏检查世界 slug（形如 /s/3b9edd/）。",
  },
  "500": {
    code: "500 · 内部故障",
    number: "500",
    title: "错不在你",
    body: "页面渲染时出了点问题。你的内容还在库里，没有被写坏。刷新一次通常就够了。",
    note: "opuscule / render-error",
  },
  maintenance: {
    code: "维护中",
    number: "维护中",
    title: "馆舍暂闭",
    body: "正在整理索引与书架，稍后回来。已经发布的内容不会丢失。",
    note: "opuscule / maintenance",
  },
  "missing-card": {
    code: "条目缺失",
    number: "404",
    title: "这一页还没有被写下",
    body: "它可能属于私有集合，或者已经被作者删除。附近还开着的门在 Wiki 索引里。",
    note: "opuscule / card-not-found",
  },
  "missing-world": {
    code: "世界缺失",
    number: "404",
    title: "没有找到这座世界",
    body: "链接可能已经过期，或者这座世界的公开访问已经关闭。",
    note: "opuscule / world-not-found",
  },
};

/** Legacy centered 404 block: big numeral, search row, two ghost actions. */
export function StatusPage({ variant, backHref = "/", backLabel = "回到工作区" }: StatusPageProps) {
  const copy = COPY[variant];
  useDocumentMeta({
    title: variant === "404" ? "页面不存在 · Opuscule" : `${copy.code} · Opuscule`,
    description: copy.body,
    noindex: true,
  });
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="status-page legacy-status">
        <section className="status-terminal" aria-labelledby="status-title">
          <span className="status-code">{copy.code}</span>
          <h1 id="status-title">{copy.number}</h1>
          <p className="status-lead">
            {copy.body}
          </p>

          <form className="status-search" action="/search" method="get" role="search">
            <input type="search" name="q" placeholder="搜一下这个世界里的名字…" aria-label="搜索这个世界" />
            <button type="submit">搜索</button>
          </form>

          <div className="status-actions">
            {variant === "500" || variant === "maintenance" ? (
              <button type="button" className="status-btn" onClick={() => window.location.reload()}>
                <RefreshCw size={16} /> 重新加载
              </button>
            ) : (
              <a className="status-btn" href={backHref}>
                <ArrowLeft size={16} /> {backLabel}
              </a>
            )}
            <a className="status-btn" href="/explore">
              <Compass size={16} /> 打开公开世界
            </a>
          </div>

          <p className="status-note">{copy.note}</p>
        </section>
      </main>
    </>
  );
}
