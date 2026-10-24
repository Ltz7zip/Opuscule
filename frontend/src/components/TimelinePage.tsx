import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Clock, ExternalLink, Loader2, Menu, Pencil, Plus, Trash2, X } from "lucide-react";

import { createEra, createTimeline, createTimelineEntry, deleteEra, deleteTimelineEntry, fetchWorld, fetchWorldTimeline, updateTimelineEntry } from "../api";
import { useDocumentMeta } from "../lib/meta";
import { confirmAction, promptAction } from "../lib/dialogs";
import type { SessionState, TimelineData, TimelineEntry, WorldDetail } from "../types";
import { ContextMenu, type ContextMenuEntry, type ContextMenuModel } from "./ContextMenu";
import { TimelineCanvas } from "./TimelineCanvas";

interface TimelinePageProps {
  worldSlug: string;
  session: SessionState | null;
  onLogout: () => void;
}

export function TimelinePage({ worldSlug, session, onLogout }: TimelinePageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [endYear, setEndYear] = useState("");
  const [era, setEra] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cardId, setCardId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [eraFilter, setEraFilter] = useState("all");
  const [showEraEditor, setShowEraEditor] = useState(false);
  const [eraName, setEraName] = useState("");
  const [eraStart, setEraStart] = useState("");
  const [eraEnd, setEraEnd] = useState("");
  const [eraColor, setEraColor] = useState("blue");
  const [eraSaving, setEraSaving] = useState(false);
  const [switchingTimeline, setSwitchingTimeline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuModel | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".timeline-page .sidebar-close")?.focus();
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
      menuRef.current?.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      if (!query.matches) setSidebarOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useDocumentMeta({
    title: world ? `${world.name} · 时间线` : "时间线 · Opuscule",
    description: world?.description || "按年份排列世界的历史。",
    canonicalPath: `/w/${worldSlug}/timeline`,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchWorld(worldSlug), fetchWorldTimeline(worldSlug)])
      .then(([nextWorld, nextTimeline]) => {
        if (cancelled) return;
        setWorld(nextWorld);
        setTimeline(nextTimeline);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "时间线加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldSlug]);

  const cards = useMemo(
    () => (world ? world.cards.filter((card) => !card.is_auxiliary) : []),
    [world],
  );
  useEffect(() => {
    if (!timeline) return;
    const requested = Number(new URLSearchParams(window.location.search).get("era"));
    if (!requested) return;
    const match = timeline.eras.find((item) => item.id === requested);
    if (match) setEraFilter(match.name);
  }, [timeline]);


  const reset = () => {
    setEditingId(null);
    setSelectedId(null);
    setYear("");
    setMonth("");
    setEndYear("");
    setEra("");
    setTitle("");
    setDescription("");
    setCardId("");
  };

  // With the inspector below the canvas on narrow screens, selecting an event
  // must reveal the form instead of silently updating an off-screen panel.
  const revealInspector = (focusForm = false) => {
    if (!window.matchMedia("(max-width: 1240px)").matches) return;
    window.requestAnimationFrame(() => {
      const inspector = inspectorRef.current;
      inspector?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (!focusForm || window.matchMedia("(pointer: coarse)").matches) return;
      // Keep keyboard focus with the form the scroll just revealed instead of
      // leaving it on an event card that may now be off-screen.
      inspector?.querySelector<HTMLInputElement>("#timeline-year")?.focus({ preventScroll: true });
    });
  };

  const startEdit = (entry: TimelineEntry) => {
    setEditingId(entry.id);
    setSelectedId(entry.id);
    setYear(String(entry.year));
    setMonth(entry.month ? String(entry.month) : "");
    setEndYear(entry.end_year ? String(entry.end_year) : "");
    setEra(entry.era);
    setTitle(entry.title);
    setDescription(entry.description);
    setCardId(entry.card ? String(entry.card) : "");
    revealInspector(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedYear = Number(year);
    if (!title.trim() || !Number.isInteger(parsedYear)) return;
    setSaving(true);
    setError(null);
    try {
      const input = {
        year: parsedYear,
        month: month.trim() ? Number(month) : null,
        end_year: endYear.trim() ? Number(endYear) : null,
        era: era.trim(),
        title: title.trim(),
        description: description.trim(),
        card: cardId ? Number(cardId) : null,
        timeline: timeline?.timeline?.id ?? null,
      };
      if (editingId !== null) {
        const updated = await updateTimelineEntry(worldSlug, editingId, input);
        setTimeline((current) =>
          current
            ? {
                ...current,
                entries: current.entries
                  .map((item) => (item.id === updated.id ? updated : item))
                  .sort((a, b) => a.year - b.year || a.id - b.id),
              }
            : current,
        );
      } else {
        const entry = await createTimelineEntry(worldSlug, input);
        setTimeline((current) =>
          current
            ? { ...current, entries: [...current.entries, entry].sort((a, b) => a.year - b.year || a.id - b.id) }
            : current,
        );
      }
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存时间线失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: TimelineEntry) => {
    const confirmed = await confirmAction({
      title: "删除这个事件？",
      body: `「${entry.title}」会从时间线移除。`,
      confirmLabel: "删除事件",
      danger: true,
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTimelineEntry(worldSlug, entry.id);
      setTimeline((current) =>
        current ? { ...current, entries: current.entries.filter((item) => item.id !== entry.id) } : current,
      );
      // The deleted entry may be the one currently loaded in the form.
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除时间线失败");
    } finally {
      setSaving(false);
    }
  };

  const addEra = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!timeline || !eraName.trim() || eraStart === "" || eraEnd === "") return;
    setEraSaving(true);
    setError(null);
    try {
      const created = await createEra(worldSlug, {
        name: eraName.trim(),
        start_year: Number(eraStart),
        end_year: Number(eraEnd),
        color: eraColor,
      });
      setTimeline((current) => current ? { ...current, eras: [...current.eras, created].sort((a, b) => a.start_year - b.start_year) } : current);
      setEraName("");
      setEraStart("");
      setEraEnd("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存纪元失败");
    } finally {
      setEraSaving(false);
    }
  };

  const removeEra = async (id: number) => {
    const removed = timeline?.eras.find((item) => item.id === id);
    const confirmed = await confirmAction({
      title: "删除这个纪元区间？",
      body: "区间内的条目不会被删除，只会移除这一段色带。",
      confirmLabel: "删除区间",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteEra(worldSlug, id);
      setTimeline((current) => current ? { ...current, eras: current.eras.filter((item) => item.id !== id) } : current);
      if (removed && eraFilter === removed.name) setEraFilter("all");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除纪元失败");
    }
  };

  const switchTimeline = async (nextSlug: string) => {
    if (!nextSlug || nextSlug === timeline?.timeline?.slug) return;
    setSwitchingTimeline(true);
    setError(null);
    try {
      const next = await fetchWorldTimeline(worldSlug, nextSlug);
      setTimeline(next);
      reset();
      // A filter from the previous timeline may not exist in the new one.
      setEraFilter("all");
      setSidebarOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "时间线切换失败");
    } finally {
      setSwitchingTimeline(false);
    }
  };

  const addTimeline = async () => {
    if (!timeline) return;
    const name = await promptAction({
      title: "新建时间线",
      label: "名称",
      placeholder: "例如：航海志",
      defaultValue: "新时间线",
      confirmLabel: "继续",
    });
    if (!name?.trim()) return;
    const slug = await promptAction({
      title: "时间线地址",
      label: "slug",
      hint: "用于 URL，建议使用小写字母、数字与连字符。",
      defaultValue: `line-${Date.now()}`,
      confirmLabel: "创建",
    });
    if (!slug?.trim()) return;
    setSwitchingTimeline(true);
    setError(null);
    try {
      const created = await createTimeline(worldSlug, { name: name.trim(), slug: slug.trim() });
      setTimeline((current) => current ? { ...current, timelines: [...current.timelines, created] } : current);
      await switchTimeline(created.slug);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建时间线失败");
    } finally {
      setSwitchingTimeline(false);
    }
  };

  const canEdit = timeline?.can_edit ?? false;
  const invalidRange = endYear.trim() !== "" && Number(endYear) < Number(year);

  const openEntryMenu = (entry: TimelineEntry, x: number, y: number) => {
    const entries: ContextMenuEntry[] = [];
    if (canEdit) {
      entries.push({ label: "编辑事件", icon: <Pencil size={16} />, run: () => startEdit(entry) });
      entries.push({ label: "删除事件", icon: <Trash2 size={16} />, danger: true, run: () => remove(entry) });
    }
    if (entry.card_slug) {
      if (entries.length > 0) entries.push({ separator: true });
      entries.push({
        label: "打开关联卡片",
        icon: <ExternalLink size={16} />,
        run: () => { window.location.href = `/w/${worldSlug}/wiki/${entry.card_slug}`; },
      });
    }
    if (entries.length === 0) {
      entries.push({ label: "此事件只读", icon: <Clock size={16} />, disabled: true, run: () => undefined });
    }
    setMenu({ x, y, entries });
  };

  const eras = useMemo(
    () => [...new Set([
      ...(timeline?.eras ?? []).map((item) => item.name),
      ...(timeline?.entries ?? []).map((entry) => entry.era).filter(Boolean),
    ])],
    [timeline],
  );
  const visibleEntries = (timeline?.entries ?? []).filter(
    (entry) => eraFilter === "all" || entry.era === eraFilter,
  );

  return (
    <div className="ws-app studio-app timeline-page">
      <aside id="timeline-sidebar" className={`sidebar studio-sidebar${sidebarOpen ? " open" : ""}`} aria-label="时间线导航">
        <div className="sidebar-head">
          <div>
            <div className="sidebar-title">{world?.name ?? "世界时间线"}</div>
            <div className="sidebar-sub">世界时间线 · {timeline?.entries.length ?? 0} 个时间点</div>
          </div>
          <div className="sidebar-head-actions">
            <a className="icon-btn" href={`/w/${worldSlug}/wiki`} aria-label="返回 Wiki" title="返回 Wiki">
              <ArrowLeft size={16} />
            </a>
            <button type="button" className="icon-btn sidebar-close" aria-label="关闭时间线导航" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>

        {timeline && (
          <>
            <div className="studio-section">
              <div className="sidebar-section-label">时间线</div>
              <select
                className="studio-select"
                value={timeline.timeline?.slug ?? ""}
                onChange={(event) => void switchTimeline(event.target.value)}
                disabled={switchingTimeline}
                aria-label="切换时间线"
              >
                {timeline.timelines.map((item) => (
                  <option key={item.id} value={item.slug}>{item.name}</option>
                ))}
              </select>
              {canEdit && (
                <button type="button" className="studio-action" onClick={() => void addTimeline()} disabled={switchingTimeline}>
                  <Plus size={16} /> 新时间线
                </button>
              )}
            </div>

            {eras.length > 0 && (
              <div className="studio-section">
                <div className="sidebar-section-label">纪元</div>
                <div className="studio-era-list" role="group" aria-label="纪元筛选">
                  <button
                    type="button"
                    className={eraFilter === "all" ? "active" : ""}
                    aria-pressed={eraFilter === "all"}
                    onClick={() => {
                      setEraFilter("all");
                      setSidebarOpen(false);
                    }}
                  >
                    <i /> 全部纪元
                  </button>
                  {eras.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={eraFilter === item ? "active" : ""}
                      aria-pressed={eraFilter === item}
                      onClick={() => {
                        setEraFilter(item);
                        setSidebarOpen(false);
                      }}
                    >
                      <i /> {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canEdit && (
              <div className="studio-section">
                <button type="button" className="studio-action" onClick={() => setShowEraEditor((value) => !value)}>
                  {showEraEditor ? "收起纪元设置" : "管理纪元"}
                </button>
                {showEraEditor && (
                  <>
                    <form className="timeline-era-form studio-era-form" onSubmit={addEra}>
                      <input required maxLength={80} value={eraName} onChange={(event) => setEraName(event.target.value)} placeholder="纪元名" />
                      <div className="studio-era-numbers">
                        <input required type="number" value={eraStart} onChange={(event) => setEraStart(event.target.value)} placeholder="起" />
                        <input required type="number" value={eraEnd} onChange={(event) => setEraEnd(event.target.value)} placeholder="止" />
                      </div>
                      <select value={eraColor} onChange={(event) => setEraColor(event.target.value)}>
                        <option value="blue">蓝</option>
                        <option value="green">绿</option>
                        <option value="gold">金</option>
                        <option value="violet">紫</option>
                      </select>
                      <button type="submit" className="studio-action" disabled={eraSaving}>{eraSaving ? "…" : "添加纪元"}</button>
                    </form>
                    {timeline.eras.length > 0 && (
                      <div className="studio-era-manage">
                        {timeline.eras.map((item) => (
                          <span key={item.id}>
                            {item.name} {item.start_year}–{item.end_year}
                            <button type="button" aria-label={`删除 ${item.name}`} onClick={() => void removeEra(item.id)}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="studio-foot">
          <a href={`/w/${worldSlug}/wiki`}>返回 Wiki</a>
          <a href={`/w/${worldSlug}`}>工作区</a>
          <a href={`/w/${worldSlug}/map`}>世界地图</a>
        </div>
      </aside>

      <button
        type="button"
        tabIndex={-1}
        className={`mobile-scrim${sidebarOpen ? " show" : ""}`}
        aria-label="关闭时间线导航"
        onClick={() => setSidebarOpen(false)}
      />

      <div className="ws-main" inert={sidebarOpen ? true : undefined}>
        <header className="topbar-workspace studio-topbar">
          <button
            ref={menuRef}
            type="button"
            className="icon-btn menu-button"
            aria-label="打开时间线导航"
            aria-expanded={sidebarOpen}
            aria-controls="timeline-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={16} />
          </button>
          <span className="studio-crumb"><Clock size={16} /> {world?.name ?? "时间线"} / 世界时间线</span>
          <div className="studio-top-actions">
            <span className="studio-count">
              {timeline?.entries.length ?? 0} 个时间点 · {timeline?.eras.length ?? 0} 个纪元
            </span>
            {canEdit && (
              <button
                type="button"
                className="studio-primary"
                onClick={() => {
                  reset();
                  window.setTimeout(() => document.getElementById("timeline-year")?.focus(), 0);
                }}
              >
                <Plus size={16} /> 新建时间点
              </button>
            )}
            <a className="studio-link" href={`/w/${worldSlug}/wiki`}>返回 Wiki</a>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="ws-workspace studio-workspace">
          {loading && <div className="loading"><Loader2 size={16} className="spin" /> 正在展开时间线…</div>}
          {error && <div className="error" role="alert">{error}</div>}

          {!loading && timeline && (
            <div className={`studio-layout${canEdit ? "" : " is-readonly"}`}>
              <div className="studio-canvas">
                {eraFilter !== "all" && visibleEntries.length === 0 && (timeline.entries.length > 0) && (
                  <div className="studio-filter-empty" role="status">
                    <span>「{eraFilter}」下没有事件。</span>
                    <button type="button" onClick={() => setEraFilter("all")}>显示全部事件</button>
                  </div>
                )}
                <TimelineCanvas
                  key={timeline.timeline?.slug ?? "default"}
                  entries={visibleEntries}
                  eras={timeline.eras}
                  selectedId={selectedId}
                  canEdit={canEdit}
                  onSelect={startEdit}
                  onEraClick={(nextEra) => {
                    setEraFilter(nextEra);
                    setSidebarOpen(false);
                  }}
                  onContextMenu={openEntryMenu}
                  onPickYear={(nextYear) => {
                    setYear(String(nextYear));
                    setEditingId(null);
                    setSelectedId(null);
                    setTitle("");
                    setDescription("");
                    setEndYear("");
                    revealInspector();
                  }}
                />
              </div>

              {canEdit && (
                <aside ref={inspectorRef} className="timeline-form-panel studio-inspector">
                  <form className="timeline-form" onSubmit={submit} autoComplete="off">
                    <span className="eyebrow">{editingId !== null ? <Pencil size={16} /> : <Plus size={16} />} {editingId !== null ? "编辑事件" : "新建时间点"}</span>
                    <div className="studio-field-row">
                      <label className="field">
                        <span>年份</span>
                        <input id="timeline-year" required autoComplete="off" type="number" value={year} onChange={(event) => setYear(event.target.value)} placeholder="487" />
                      </label>
                      <label className="field">
                        <span>月份 / 可选</span>
                        <input autoComplete="off" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(event.target.value)} placeholder="03" />
                      </label>
                    </div>
                    <div className="studio-field-row">
                      <label className="field">
                        <span>结束年份 / 可选</span>
                        <input autoComplete="off" type="number" value={endYear} onChange={(event) => setEndYear(event.target.value)} placeholder="490" />
                      </label>
                      <label className="field">
                        <span>纪年 / 可选</span>
                        <input autoComplete="off" maxLength={80} value={era} onChange={(event) => setEra(event.target.value)} placeholder="潮汐历" />
                      </label>
                    </div>
                    <label className="field">
                      <span>标题</span>
                      <input required autoComplete="off" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="白塔沉没" />
                    </label>
                    <label className="field">
                      <span>说明 / 可选</span>
                      <textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>关联卡片 / 可选</span>
                      <select value={cardId} onChange={(event) => setCardId(event.target.value)}>
                        <option value="">不关联</option>
                        {cards.map((card) => (
                          <option key={card.id} value={card.id}>{card.title}</option>
                        ))}
                      </select>
                    </label>
                    <div className="timeline-form-actions">
                      <button type="submit" className="studio-primary" disabled={saving || !title.trim() || year === "" || invalidRange}>
                        {saving ? "保存中…" : editingId !== null ? "保存修改" : "加入时间线"}
                      </button>
                      {editingId !== null && (
                        <>
                          <button type="button" className="studio-link" onClick={reset} disabled={saving}>取消</button>
                          <button
                            type="button"
                            className="studio-link studio-danger"
                            onClick={() => {
                              const entry = timeline?.entries.find((item) => item.id === editingId);
                              if (entry) void remove(entry);
                            }}
                            disabled={saving}
                          >
                            <Trash2 size={16} /> 删除
                          </button>
                        </>
                      )}
                    </div>
                    {invalidRange && <p className="form-hint error-text">结束年份不能早于开始年份。</p>}
                  </form>
                </aside>
              )}
            </div>
          )}
        </main>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} onError={setError} />
    </div>
  );
}
