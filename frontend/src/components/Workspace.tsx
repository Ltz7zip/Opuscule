import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";

import {
  createCard,
  createCollection,
  fetchCard,
  fetchWorld,
  fetchWorldConceptEdit,
  updateWorld,
  type ApiError,
} from "../api";
import type { CardDetail, CardSummary, SessionState, WorldConcept, WorldConceptEdit, WorldDetail } from "../types";
import { CardEditor } from "./CardEditor";
import { ConceptEditor } from "./ConceptEditor";
import { CardEraDialog } from "./CardEraDialog";
import { CommandPalette } from "./CommandPalette";
import { TrashDialog } from "./TrashDialog";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { EmptyState } from "./EmptyState";
import { Sidebar } from "./Sidebar";
import { promptAction } from "../lib/dialogs";
import { clearVt, runViewTransition } from "../lib/viewTransition";
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
  conceptMode?: boolean;
}

export function Workspace({ worldSlug, session, onLogout, conceptMode = false }: WorkspaceProps) {
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [concept, setConcept] = useState<WorldConceptEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [versionCard, setVersionCard] = useState<CardDetail | null>(null);
  const [eraCard, setEraCard] = useState<CardDetail | null>(null);

  useDocumentMeta({
    title: world ? `${world.name} · 工作区` : "Opuscule · 工作区",
    canonicalPath: `/w/${worldSlug}`,
    noindex: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [vtCardSlug, setVtCardSlug] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPaletteOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The workspace sidebar is a mobile drawer. Close it with Escape, move focus
  // into it when it opens, and return focus to the trigger when it closes.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".ws-app .sidebar .sidebar-close")?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);

  // A drawer left open while resizing to desktop would otherwise keep the
  // main column inert.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      if (!query.matches) setSidebarOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const selectCard = useCallback(
    async (summary: CardSummary, options?: { animate?: boolean }) => {
      if (conceptMode) {
        window.location.assign(`/w/${worldSlug}?card=${summary.id}`);
        return;
      }
      const animate = options?.animate ?? true;
      setCardLoading(true);
      setError(null);
      try {
        const detail = await fetchCard(worldSlug, summary.id);
        const source = document.querySelector<HTMLElement>(
          `.tree-row[data-card-id="${summary.id}"] .tree-icon`,
        );
        const clearRows = () => {
          document
            .querySelectorAll<HTMLElement>(".tree-row .tree-icon")
            .forEach((icon) => clearVt(icon));
        };
        const commit = () => {
          if (animate) setVtCardSlug(summary.slug);
          setCard(detail);
          const url = new URL(window.location.href);
          url.searchParams.set("card", String(detail.id));
          window.history.replaceState({}, "", url);
        };
        if (animate) {
          runViewTransition(
            commit,
            () => {
              clearRows();
              setVtCardSlug(null);
            },
            source,
          );
        } else {
          commit();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "卡片加载失败");
      } finally {
        setCardLoading(false);
      }
    },
    [conceptMode, worldSlug],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWorld(worldSlug)
      .then(async (nextWorld) => {
        if (cancelled) return;
        setWorld(nextWorld);
        if (conceptMode) {
          const nextConcept = await fetchWorldConceptEdit(worldSlug);
          if (cancelled) return;
          setConcept(nextConcept);
          setCard(null);
          return;
        }
        const queryCard = Number(new URLSearchParams(window.location.search).get("card"));
        const initial = nextWorld.cards.find((item) => item.id === queryCard) ?? nextWorld.cards[0];
        if (initial) void selectCard(initial, { animate: false });
      })
      .catch((cause: ApiError) => {
        if (!cancelled) setError(cause.message ?? (conceptMode ? "概念加载失败" : "世界加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conceptMode, selectCard, worldSlug]);

  useEffect(() => {
    document.title = world
      ? conceptMode
        ? `世界概念 · ${world.name}`
        : `${world.name} · 工作区`
      : "Opuscule · 工作区";
  }, [conceptMode, world]);

  const handleSavedConcept = (updated: WorldConceptEdit) => {
    setConcept(updated);
  };

  const handlePublishedConcept = (published: WorldConcept) => {
    setConcept((current) =>
      current
        ? {
            ...current,
            exists: true,
            draft_json: published.body_json,
            draft_text: published.body_text,
            body_json: published.body_json,
            body_text: published.body_text,
            published_at: published.published_at,
            created_at: published.created_at,
            updated_at: published.updated_at,
            revision: published.revision,
            created_by: published.created_by,
            updated_by: published.updated_by,
          }
        : current,
    );
  };

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

  const handleNewCard = async (collectionId?: number | null) => {
    if (!world || !world.can_edit) return;
    setError(null);
    try {
      const home = collectionId === undefined ? (world.collections[0]?.id ?? null) : collectionId;
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

  const refreshWorld = async () => {
    const nextWorld = await fetchWorld(worldSlug);
    setWorld(nextWorld);
  };

  const handleNewCollection = async (parentId?: number | null) => {
    if (!world || !world.can_edit) return;
    const name = await promptAction({
      title: parentId ? "新建子集合" : "新建集合",
      label: "集合名称",
      placeholder: "例如：势力、地点、事件",
      defaultValue: "新集合",
      confirmLabel: "创建",
    });
    if (name === null || !name.trim()) return;
    setError(null);
    try {
      await createCollection(worldSlug, { name: name.trim(), parent: parentId ?? null });
      await refreshWorld();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新建集合失败");
    }
  };

  const handleCardUpdated = (updated: CardSummary) => {
    setWorld((current) =>
      current
        ? {
            ...current,
            cards: current.cards.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    title: updated.title,
                    home_collection: updated.home_collection,
                    is_public: updated.is_public,
                    pinned: updated.pinned,
                    era: updated.era,
                    icon: updated.icon,
                    cover: updated.cover,
                    revision: updated.revision,
                    updated_at: updated.updated_at,
                  }
                : item,
            ),
          }
        : current,
    );
    setCard((current) =>
      current && current.id === updated.id
        ? {
            ...current,
            title: updated.title,
            home_collection: updated.home_collection,
            is_public: updated.is_public,
            pinned: updated.pinned,
            era: updated.era,
            revision: updated.revision,
            updated_at: updated.updated_at,
          }
        : current,
    );
  };

  const handleCardDeleted = (id: number) => {
    setWorld((current) =>
      current ? { ...current, cards: current.cards.filter((item) => item.id !== id) } : current,
    );
    setCard((current) => (current?.id === id ? null : current));
    const url = new URL(window.location.href);
    if (url.searchParams.get("card") === String(id)) {
      url.searchParams.delete("card");
      window.history.replaceState({}, "", url);
    }
  };

  const openCardDialog = async (summary: CardSummary, kind: "versions" | "era") => {
    setError(null);
    try {
      const detail = card?.id === summary.id ? card : await fetchCard(worldSlug, summary.id);
      if (kind === "versions") setVersionCard(detail);
      else setEraCard(detail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "卡片加载失败");
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
    <div className="ws-app">
      {world && (
        <Sidebar
          world={world}
          selectedCardId={card?.id ?? null}
          conceptActive={conceptMode}
          conceptStatus={!concept || !concept.exists ? "none" : concept.published_at ? "published" : "draft"}
          onSelectConcept={() => window.location.assign(`/w/${worldSlug}/wiki/edit`)}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectCard={(summary) => void selectCard(summary)}
          onNewCard={(collectionId) => void handleNewCard(collectionId)}
          onNewCollection={(parentId) => void handleNewCollection(parentId)}
          onWorldChanged={refreshWorld}
          onCardUpdated={handleCardUpdated}
          onOpenSettings={() => {
            setSidebarOpen(false);
            setSettingsOpen(true);
          }}
          onOpenMembers={() => {
            setSidebarOpen(false);
            setMembersOpen(true);
          }}
          onOpenAudit={() => {
            setSidebarOpen(false);
            setAuditOpen(true);
          }}
          onOpenPalette={() => {
            setSidebarOpen(false);
            setPaletteOpen(true);
          }}
          onOpenTrash={() => {
            setSidebarOpen(false);
            setTrashOpen(true);
          }}
          onShowVersions={(summary) => void openCardDialog(summary, "versions")}
          onSetEra={(summary) => void openCardDialog(summary, "era")}
          onCardDeleted={handleCardDeleted}
          onError={setError}
          canEdit={world.can_edit}
          canManage={world.role === "owner"}
        />
      )}
      {world && (
        <button
          type="button"
          tabIndex={-1}
          className={`mobile-scrim${sidebarOpen ? " show" : ""}`}
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="ws-main" inert={sidebarOpen ? true : undefined}>
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
              <button
                type="button"
                className="icon-btn command-trigger"
                aria-label="命令面板（⌘K）"
                aria-keyshortcuts="Meta+K Control+K"
                title="命令面板（⌘K）"
                onClick={() => setPaletteOpen(true)}
              >
                <Search size={16} />
              </button>
              <Suspense fallback={null}><NotificationBell /></Suspense>
              {world?.role === "owner" ? (
                <button type="button" className="btn btn-secondary" onClick={() => void togglePublish()} disabled={publishing}>
                  {publishing ? "处理中…" : world.is_public_read ? "取消公开" : "公开 Wiki"}
                </button>
              ) : null}
            </>
          }
        />

        <main id="main-content" tabIndex={-1} className={`ws-workspace${world ? "" : " full"}`}>
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

          {!loading && world && conceptMode && concept && (
            <ConceptEditor
              worldSlug={worldSlug}
              world={world}
              concept={concept}
              onSaved={handleSavedConcept}
              onPublished={handlePublishedConcept}
              onStatus={setSaveState}
              readOnly={!world.can_edit}
            />
          )}

          {!loading && world && !conceptMode && cardLoading && (
            <div className="loading">
              <Loader2 size={16} className="spin" />
              正在载入卡片…
            </div>
          )}

          {!loading && world && !conceptMode && !cardLoading && card && (
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
                vtSlug={vtCardSlug}
              />
            </>
          )}

          {!loading && world && !conceptMode && !cardLoading && !card && !error && (
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
      {world && world.can_edit && trashOpen && (
        <TrashDialog
          worldSlug={world.slug}
          onClose={() => setTrashOpen(false)}
          onRestored={(restored) => {
            setTrashOpen(false);
            handleCardUpdated(restored);
            void selectCard(restored, { animate: false });
            void refreshWorld();
          }}
        />
      )}
      {versionCard && (
        <VersionHistoryDialog
          worldSlug={worldSlug}
          card={versionCard}
          onClose={() => setVersionCard(null)}
          onRestored={(updated) => {
            handleCardUpdated(updated);
            void refreshWorld();
          }}
        />
      )}
      {eraCard && (
        <CardEraDialog
          worldSlug={worldSlug}
          card={eraCard}
          onClose={() => setEraCard(null)}
          onSaved={(updated) => {
            handleCardUpdated(updated);
            void refreshWorld();
          }}
        />
      )}
      {world && (
        <CommandPalette
          open={paletteOpen}
          world={world}
          onClose={() => setPaletteOpen(false)}
          onSelectCard={(summary) => {
            setPaletteOpen(false);
            void selectCard(summary);
          }}
          onNewCard={() => {
            setPaletteOpen(false);
            void handleNewCard();
          }}
          onNewCollection={() => {
            setPaletteOpen(false);
            void handleNewCollection();
          }}
          onOpenWiki={() => window.location.assign(`/w/${worldSlug}/wiki`)}
          onOpenMap={() => window.location.assign(`/w/${worldSlug}/map`)}
          onOpenTimeline={() => window.location.assign(`/w/${worldSlug}/timeline`)}
          onOpenSettings={() => {
            setPaletteOpen(false);
            setSettingsOpen(true);
          }}
          onOpenMembers={() => {
            setPaletteOpen(false);
            setMembersOpen(true);
          }}
          onOpenAudit={() => {
            setPaletteOpen(false);
            setAuditOpen(true);
          }}
          onOpenTrash={() => {
            setPaletteOpen(false);
            setTrashOpen(true);
          }}
        />
      )}
    </div>
  );
}
