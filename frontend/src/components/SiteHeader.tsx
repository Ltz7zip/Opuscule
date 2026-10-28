import type { Ref } from "react";

import type { SessionState } from "../types";
import { useSharedSource, useVtTarget } from "../lib/viewTransition";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";
import { SkipLink } from "./SkipLink";

interface SiteHeaderProps {
  /** When present the header becomes the world nav (search field + sections). */
  worldName?: string;
  worldSlug?: string;
  sections?: { name: string; slug: string }[];
  active?: string;
  session?: SessionState | null;
  onLogout?: () => void;
  searchValue?: string;
  /** True only on "/", the static target of the brand-mark morph. */
  home?: boolean;
}

/**
 * One-row public navigation. The brand mark is a single leaf and the only
 * element on this chrome that participates in a cross-document transition.
 */
export function SiteHeader({
  worldName,
  worldSlug,
  active,
  session,
  onLogout,
  searchValue = "",
  home = false,
}: SiteHeaderProps) {
  const worldMode = Boolean(worldSlug && worldName);
  const brand = useSharedSource("icon", "brand");
  const brandTarget = useVtTarget("icon", "brand");
  const brandStyle = home ? brandTarget.style : undefined;
  const brandHandlers = home
    ? {}
    : {
        onPointerEnter: brand.onPointerEnter,
        onPointerLeave: brand.onPointerLeave,
        onFocus: brand.onFocus,
        onBlur: brand.onBlur,
        onTouchStart: brand.onTouchStart,
      };

  if (worldMode) {
    const homeHref = `/w/${worldSlug}/wiki`;
    return (
      <header className="site-nav site-nav-world" aria-label="世界导航">
        <SkipLink />
        <div className="site-nav-brand">
          <a
            className="site-brand-mark"
            href="/"
            aria-label="Opuscule 首页"
            ref={(home ? brandTarget.ref : brand.ref) as unknown as Ref<HTMLAnchorElement>}
            style={brandStyle}
            {...brandHandlers}
          >
            <BrandMark size={16} />
          </a>
          <a className="site-nav-brand-name" href={homeHref}>
            {worldName}
          </a>
        </div>
        <nav className="site-nav-links" aria-label="世界页面">
          <a className={active === "world" ? "active" : undefined} href={homeHref}>世界</a>
          <a className={active === "cards" ? "active" : undefined} href={`${homeHref}/cards`}>设定</a>
          <a className={active === "timeline" ? "active" : undefined} href={`/w/${worldSlug}/timeline`}>时间线</a>
          <a className={active === "map" ? "active" : undefined} href={`/w/${worldSlug}/map`}>地图</a>
          {session?.authenticated && (
            <a className={active === "workspace" ? "active" : undefined} href={`/w/${worldSlug}`}>工作区</a>
          )}
        </nav>
        <span className="site-nav-spacer" />
        <ThemeToggle />
        <form className="site-nav-form" action="/search" method="get" role="search">
          <input type="hidden" name="world" value={worldSlug} />
          <input
            className="site-nav-search"
            type="search"
            name="q"
            defaultValue={searchValue}
            placeholder="搜索这个世界…"
            aria-label="搜索这个世界"
          />
        </form>
      </header>
    );
  }

  return (
    <header className="site-nav site-nav-plain" aria-label="站点导航">
      <SkipLink />
      <div className="site-nav-brand">
        <a className="site-nav-brand-link" href="/" aria-label="Opuscule 首页" {...brandHandlers}>
          <span className="site-brand-mark" ref={home ? brandTarget.ref : brand.ref} style={brandStyle}>
            <BrandMark size={16} />
          </span>
          <span className="site-nav-brand-name">Opuscule</span>
        </a>
      </div>
      <nav className="site-nav-links" aria-label="站点页面">
        <a href="/explore">公开世界</a>
        {session?.authenticated && <a href="/w/">我的世界</a>}
      </nav>
      <span className="site-nav-spacer" />
      <ThemeToggle />
      <div className="site-nav-actions">
        {session?.authenticated ? (
          <>
            <a href={`/u/${session.user?.username}`}>{session.user?.username}</a>
            <button type="button" onClick={onLogout}>退出</button>
          </>
        ) : (
          <>
            <a href="/login">登录</a>
            <a href="/register">注册</a>
          </>
        )}
      </div>
    </header>
  );
}
