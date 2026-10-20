import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  createCard,
  fetchCard,
  fetchWorld,
  updateWorld,
  type ApiError,
} from "../api";
import type { CardDetail, CardSummary, SessionState, WorldDetail } from "../types";
import { CardEditor } from "./CardEditor";
import { EmptyState } from "./EmptyState";
import { Sidebar } from "./Sidebar";
import { useDocumentMeta } from "../lib/meta";
import { Topbar, type SaveState } from "./Topbar";
import { WorldAuditDialog } from "./WorldAuditDialog";
import { WorldMembersDialog } from "./WorldMembersDialog";
import { WorldSettingsDialog } from "./WorldSettingsDialog";

const NotificationBell = lazy(() => import("./NotificationBell").then((module) => ({ default: module.NotificationBell })));

interface WorkspaceProps {
  worldSlug: string;
  session: SessionState | null;
  onLogout: () => void;
}

export function Workspace({ worldSlug, session, onLogout }: WorkspaceProps) {
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  useDocumentMeta({
    title: world ? `${world.name} · 工作区` : "Opuscule · 工作区",
    canonicalPath: `/w/${worldSlug}`,
    noindex: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const selectCard = useCallback(
    async (summary: CardSummary) => {
      setCardLoading(true);
      setError(null);
      try {
        const detail = await fetchCard(worldSlug, summary.id);
        setCard(detail);
        const url = new URL(window.location.href);
        url.searchParams.set("card", String(detail.id));
        window.history.replaceState({}, "", url);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "卡片加载失败");
      } finally {
        setCardLoading(false);
      }
    },
    [worldSlug],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWorld(worldSlug)
      .then((nextWorld) => {
        if (cancelled) return;
        setWorld(nextWorld);
        const queryCard = Number(new URLSearchParams(window.location.search).get("card"));
        const initial = nextWorld.cards.find((item) => item.id === queryCard) ?? nextWorld.cards[0];
        if (initial) void selectCard(initial);
      })
      .catch((cause: ApiError) => {
        if (!cancelled) setError(cause.message ?? "世界加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectCard, worldSlug]);

  useEffect(() => {
    document.title = world ? `${world.name} · 工作区` : "Opuscule · 工作区";
  }, [world]);

  const togglePublish = async () => {
    if (!world || world.role !== "owner" || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const updated = await updateWorld(worldSlug, {
        is_public_read: !world.is_public_read,
      });
      setWorld(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "切换公开状态失败");
    } finally {
      setPublishing(false);
    }
  };

  const handleNewCard = async () => {
    if (!world || !world.can_edit) return;
    setError(null);
    try {
      const home = world.collections[0]?.id ?? null;
      const created = await createCard(worldSlug, { title: "未命名卡片", home_collection: home });
      const nextWorld = await fetchWorld(worldSlug);
      setWorld(nextWorld);
      setCard(created);
      const url = new URL(window.location.href);
      url.searchParams.set("card", String(created.id));
      window.history.replaceState({}, "", url);
      setSidebarOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新建卡片失败");
    }
  };

  const handleSaved = (updated: CardDetail) => {
    setCard(updated);
    setWorld((current) =>
      current
        ? {
            ...current,
            cards: current.cards.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    title: updated.title,
                    revision: updated.revision,
                    body_text: updated.body_text,
                    updated_at: updated.updated_at,
                  }
                : item,
            ),
          }
        : current,
    );
  };

  return (
    <div className="app-shell">
      <Topbar
        mode="workspace"
        worldName={world?.name}
        worldSlug={worldSlug}
        saveState={saveState}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        session={session}
        onLogout={onLogout}
        readOnly={world ? !world.can_edit : false}
        action={
          <>
            <Suspense fallback={null}><NotificationBell /></Suspense>
            {world?.role === "owner" ? (
              <button type="button" className="btn btn-secondary" onClick={() => void togglePublish()} disabled={publishing}>
                {publishing ? "处理中…" : world.is_public_read ? "取消公开" : "公开 Wiki"}
              </button>
            ) : null}
          </>
        }
      />

      <div className="shell">
        {world && (
          <Sidebar
            world={world}
            selectedCardId={card?.id ?? null}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onSelectCard={(summary) => void selectCard(summary)}
            onNewCard={() => void handleNewCard()}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMembers={() => setMembersOpen(true)}
            onOpenAudit={() => setAuditOpen(true)}
            canEdit={world.can_edit}
            canManage={world.role === "owner"}
          />
        )}
        <button
          type="button"
          className={`mobile-scrim${sidebarOpen ? " show" : ""}`}
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />

        <main id="main-content" tabIndex={-1} className={`main${world ? "" : " full"}`}>
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={16} />
              <span>{error}</span>
              <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto" }} onClick={() => window.location.reload()}>
                重试
              </button>
            </div>
          )}

          {loading && (
            <div className="loading">
              <Loader2 size={16} className="spin" />
              正在打开世界…
            </div>
          )}

          {!loading && world && cardLoading && (
            <div className="loading">
              <Loader2 size={16} className="spin" />
              正在载入卡片…
            </div>
          )}

          {!loading && world && !cardLoading && card && (
            <>
              {!world.can_edit && (
                <div className="readonly-banner" role="status">
                  <span>只读视图。登录后可编辑这个世界。</span>
                  <a className="btn btn-secondary" href="/login">
                    登录
                  </a>
                </div>
              )}
              <CardEditor
                key={card.id}
                worldSlug={worldSlug}
                card={card}
                cards={world.cards}
                onSaved={handleSaved}
                onStatus={setSaveState}
                readOnly={!world.can_edit}
              />
            </>
          )}

          {!loading && world && !cardLoading && !card && !error && (
            <EmptyState worldSlug={world.slug} onNewCard={() => void handleNewCard()} />
          )}
        </main>
      </div>

      {world && world.role === "owner" && settingsOpen && (
        <WorldSettingsDialog
          world={world}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setWorld(updated)}
          onDeleted={() =>
            window.location.assign(
              session?.user?.username ? `/u/${session.user.username}` : "/explore",
            )
          }
        />
      )}
      {world && world.role === "owner" && membersOpen && (
        <WorldMembersDialog worldSlug={world.slug} onClose={() => setMembersOpen(false)} />
      )}
      {world && world.role === "owner" && auditOpen && (
        <WorldAuditDialog worldSlug={world.slug} onClose={() => setAuditOpen(false)} />
      )}
    </div>
  );
}
