import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Clock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { createEra, createTimeline, createTimelineEntry, deleteEra, deleteTimelineEntry, fetchWorld, fetchWorldTimeline, updateTimelineEntry } from "../api";
import { useDocumentMeta } from "../lib/meta";
import { confirmAction, promptAction } from "../lib/dialogs";
import type { SessionState, TimelineData, TimelineEntry, WorldDetail } from "../types";
import { TimelineCanvas } from "./TimelineCanvas";
import { Topbar } from "./Topbar";
import { WorldNav } from "./WorldNav";

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
    <div className="app-shell timeline-page">
      <Topbar mode="public" publicLabel="时间线" worldName={world?.name} worldSlug={worldSlug} session={session} onLogout={onLogout} />
      {world && <WorldNav worldSlug={worldSlug} worldName={world.name} active="timeline" />}
      <main id="main-content" tabIndex={-1} className="timeline-shell">
        <header className="timeline-hero">
          <a className="back-link" href={`/w/${worldSlug}/wiki`}>
            <ArrowLeft size={13} /> {world?.name ?? "世界"} Wiki
          </a>
          <span className="eyebrow"><Clock size={13} /> 世界时间线</span>
          <h1>{world?.name ?? "时间线"}</h1>
          <p>{canEdit ? "按年份记录世界的历史；公开页只读。" : "按年份排列的公开世界历史。"}</p>
        </header>

        {loading && <div className="loading"><Loader2 size={16} className="spin" /> 正在展开时间线…</div>}
        {error && <div className="error" role="alert">{error}</div>}

        {!loading && timeline && (
          <div className="timeline-layout">
            <div className="timeline-main">
              <div className="timeline-switcher">
                <label>
                  <span>时间线</span>
                  <select
                    value={timeline.timeline?.slug ?? ""}
                    onChange={(event) => void switchTimeline(event.target.value)}
                    disabled={switchingTimeline}
                  >
                    {timeline.timelines.map((item) => (
                      <option key={item.id} value={item.slug}>{item.name}</option>
                    ))}
                  </select>
                </label>
                {canEdit && (
                  <button type="button" className="btn btn-secondary" onClick={() => void addTimeline()} disabled={switchingTimeline}>
                    + 新时间线
                  </button>
                )}
              </div>

              {eras.length > 0 && (
                <div className="timeline-filters" role="group" aria-label="纪元筛选">
                  <button type="button" className={eraFilter === "all" ? "active" : ""} onClick={() => setEraFilter("all")}>全部纪元</button>
                  {eras.map((item) => (
                    <button key={item} type="button" className={eraFilter === item ? "active" : ""} onClick={() => setEraFilter(item)}>{item}</button>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="timeline-era-tools">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEraEditor((value) => !value)}>
                    {showEraEditor ? "收起纪元" : "管理纪元"}
                  </button>
                  {showEraEditor && (
                    <form className="timeline-era-form" onSubmit={addEra}>
                      <input required maxLength={80} value={eraName} onChange={(event) => setEraName(event.target.value)} placeholder="纪元名" />
                      <input required type="number" value={eraStart} onChange={(event) => setEraStart(event.target.value)} placeholder="起" />
                      <input required type="number" value={eraEnd} onChange={(event) => setEraEnd(event.target.value)} placeholder="止" />
                      <select value={eraColor} onChange={(event) => setEraColor(event.target.value)}>
                        <option value="blue">蓝</option>
                        <option value="green">绿</option>
                        <option value="gold">金</option>
                        <option value="violet">紫</option>
                      </select>
                      <button type="submit" className="btn btn-primary" disabled={eraSaving}>{eraSaving ? "…" : "添加"}</button>
                    </form>
                  )}
                  {showEraEditor && timeline.eras.length > 0 && (
                    <div className="timeline-era-list">
                      {timeline.eras.map((item) => (
                        <span key={item.id}>
                          {item.name} {item.start_year}–{item.end_year}
                          <button type="button" aria-label={`删除 ${item.name}`} onClick={() => void removeEra(item.id)}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <TimelineCanvas
                key={timeline.timeline?.slug ?? "default"}
                entries={visibleEntries}
                eras={timeline.eras}
                selectedId={selectedId}
                canEdit={canEdit}
                onSelect={startEdit}
                onEraClick={(nextEra) => setEraFilter(nextEra)}
                onPickYear={(nextYear) => {
                  setYear(String(nextYear));
                  setEditingId(null);
                  setSelectedId(null);
                  setTitle("");
                  setDescription("");
                  setEndYear("");
                }}
              />
            </div>

            {canEdit && (
              <aside className="timeline-form-panel">
                <form className="timeline-form" onSubmit={submit} autoComplete="off">
                  <span className="eyebrow">{editingId !== null ? <Pencil size={12} /> : <Plus size={12} />} {editingId !== null ? "编辑事件" : "新事件"}</span>
                  <label className="field">
                    <span>年份</span>
                    <input required autoComplete="off" type="number" value={year} onChange={(event) => setYear(event.target.value)} placeholder="487" />
                  </label>
                  <label className="field">
                    <span>月份 / 可选</span>
                    <input autoComplete="off" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(event.target.value)} placeholder="03" />
                  </label>
                  <label className="field">
                    <span>结束年份 / 可选</span>
                    <input autoComplete="off" type="number" value={endYear} onChange={(event) => setEndYear(event.target.value)} placeholder="490" />
                  </label>
                  <label className="field">
                    <span>纪年 / 可选</span>
                    <input autoComplete="off" maxLength={80} value={era} onChange={(event) => setEra(event.target.value)} placeholder="潮汐历" />
                  </label>
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
                    <button type="submit" className="btn btn-primary" disabled={saving || !title.trim() || year === "" || invalidRange}>
                      {saving ? "保存中…" : editingId !== null ? "保存修改" : "加入时间线"}
                    </button>
                    {editingId !== null && (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={reset} disabled={saving}>取消</button>
                        <button
                          type="button"
                          className="btn btn-secondary timeline-delete"
                          onClick={() => {
                            const entry = timeline?.entries.find((item) => item.id === editingId);
                            if (entry) void remove(entry);
                          }}
                          disabled={saving}
                        >
                          <Trash2 size={13} /> 删除
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
  );
}
