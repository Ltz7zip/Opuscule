import type { ReactNode } from "react";
import {
  AlertCircle,
  Compass,
  Globe2,
  Loader2,
  LogOut,
  Menu,
  PencilLine,
  Search,
} from "lucide-react";

import type { SessionState } from "../types";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";
import { SkipLink } from "./SkipLink";

export type SaveState = "saved" | "saving" | "error";

interface TopbarProps {
  mode: "public" | "workspace";
  publicLabel?: string;
  worldName?: string;
  worldSlug?: string;
  saveState?: SaveState;
  onToggleSidebar?: () => void;
  session?: SessionState | null;
  onLogout: () => void;
  readOnly?: boolean;
  action?: ReactNode;
}

export function Topbar({
  mode,
  publicLabel,
  worldName,
  worldSlug,
  saveState = "saved",
  onToggleSidebar,
  session,
  onLogout,
  readOnly = false,
  action,
}: TopbarProps) {
  const isWorkspace = mode === "workspace";

  return (
    <header className={`topbar ${isWorkspace ? "topbar-workspace" : "topbar-public"}`}>
      <SkipLink />
      <div className="topbar-inner">
        {isWorkspace && (
          <button
            type="button"
            className="icon-btn menu-button"
            aria-label="打开导航"
            onClick={onToggleSidebar}
          >
            <Menu size={16} />
          </button>
        )}

        <a className="brand" href={isWorkspace ? `/w/${worldSlug ?? "wuhai"}` : "/"}>
          <span className="brand-mark"><BrandMark size={16} /></span>
          <span className="brand-name">Opuscule</span>
        </a>

        {isWorkspace && session?.authenticated && (session.worlds?.length ?? 0) > 1 && (
          <select
            className="world-switcher"
            aria-label="切换世界"
            value={worldSlug ?? ""}
            onChange={(event) => window.location.assign(`/w/${event.target.value}`)}
          >
            {session.worlds?.map((world) => (
              <option key={world.slug} value={world.slug}>
                {world.name}
              </option>
            ))}
          </select>
        )}

        {isWorkspace ? (
          <nav className="crumbs" aria-label="面包屑">
            <a href="/explore">世界</a>
            <span className="crumb-sep">/</span>
            <span>文档</span>
            <span className="crumb-sep">/</span>
            <span className="current">{worldName ?? "工作区"}</span>
          </nav>
        ) : (
          <nav className="nav-links" aria-label="站点导航">
            <a href="/explore">公开世界</a>
            <a href="/w/">我的世界</a>
            <a href="/search">搜索</a>
          </nav>
        )}

        <div className="topbar-actions">
          {isWorkspace && (
            <span className="status-pill" aria-live="polite">
              {readOnly ? (
                "只读"
              ) : saveState === "saving" ? (
                <><Loader2 size={16} className="spin" /> 保存中</>
              ) : saveState === "error" ? (
                <><AlertCircle size={16} /> 保存失败</>
              ) : (
                <><span className="status-dot" /> 已保存</>
              )}
            </span>
          )}

          {isWorkspace && action}

          {isWorkspace && (
            <>
              <ThemeToggle />
              <a className="nav-link" href={worldSlug ? `/w/${worldSlug}/wiki` : "/"}>
                公开页
              </a>
              {session?.authenticated && (
                <>
                  <a className="nav-link" href={`/u/${session.user?.username}`}>
                    {session.user?.username}
                  </a>
                  <button type="button" className="nav-link nav-link-button" onClick={onLogout}>
                    退出
                  </button>
                </>
              )}
            </>
          )}

          {mode === "public" && (
            <>
              <ThemeToggle />
              <a className="nav-link" href={`/w/${worldSlug ?? "wuhai"}`}>
                进入工作区
              </a>
              {session?.authenticated ? (
                <>
                  <a className="nav-link" href={`/u/${session.user?.username}`}>
                    {session.user?.username}
                  </a>
                  <button type="button" className="nav-link nav-link-button" onClick={onLogout}>
                    退出
                  </button>
                </>
              ) : (
                <a className="nav-link" href="/login">
                  登录
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
