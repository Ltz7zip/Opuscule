import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crosshair, ImagePlus, Loader2, MapPin, Plus, Trash2 } from "lucide-react";

import {
  createMapMarker,
  deleteMapMarker,
  fetchWorld,
  fetchWorldMap,
  updateMapMarker,
  uploadWorldMapBackground,
  clearWorldMapBackground,
} from "../api";
import { useDocumentMeta } from "../lib/meta";
import { confirmAction } from "../lib/dialogs";
import type { MapData, MapMarker, SessionState, WorldDetail } from "../types";
import { Topbar } from "./Topbar";
import { WorldNav } from "./WorldNav";

interface MapPageProps {
  worldSlug: string;
  session: SessionState | null;
  onLogout: () => void;
}

const kindLabels: Record<MapMarker["kind"], string> = {
  place: "地点",
  event: "事件",
  character: "人物",
  note: "笔记",
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function MapPage({ worldSlug, session, onLogout }: MapPageProps) {
  const [world, setWorld] = useState<WorldDetail | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"place" | "pan">("place");
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<MapMarker["kind"]>("place");
  const [cardId, setCardId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editKind, setEditKind] = useState<MapMarker["kind"]>("place");
  const [editCard, setEditCard] = useState("");
  const [saving, setSaving] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useDocumentMeta({
    title: world ? `${world.name} · 世界地图` : "世界地图 · Opuscule",
    description: world?.description || "把世界里的地点、事件与人物放到一张地图上。",
    canonicalPath: `/w/${worldSlug}/map`,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchWorld(worldSlug), fetchWorldMap(worldSlug)])
      .then(([nextWorld, nextMap]) => {
        if (cancelled) return;
        setWorld(nextWorld);
        setMap(nextMap);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "地图加载失败");
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
  const selected = map?.markers.find((marker) => marker.id === selectedId) ?? null;
  const canEdit = map?.can_edit ?? false;

  const uploadBackground = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackgroundBusy(true);
    setError(null);
    try {
      const data = await uploadWorldMapBackground(worldSlug, file);
      setMap((current) => (current ? { ...current, background_url: data.background_url } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "背景图上传失败");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const removeBackground = async () => {
    setBackgroundBusy(true);
    setError(null);
    try {
      await clearWorldMapBackground(worldSlug);
      setMap((current) => (current ? { ...current, background_url: null } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "背景图移除失败");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const clampPan = (next: { x: number; y: number }, nextZoom = zoom) => {
    if (!canvasRef.current) return next;
    const rect = canvasRef.current.getBoundingClientRect();
    const maxX = Math.max(0, ((nextZoom - 1) * rect.width) / 2);
    const maxY = Math.max(0, ((nextZoom - 1) * rect.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const changeZoom = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(3, nextZoom));
    setZoom(clamped);
    setPan((current) => clampPan(current, clamped));
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".map-pin, .map-controls")) return;
    if (canEdit && mode === "place") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      startX: event.clientX - pan.x,
      startY: event.clientY - pan.y,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    setPan(clampPan({
      x: event.clientX - panRef.current.startX,
      y: event.clientY - panRef.current.startY,
    }));
  };

  const onCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  };

  const mapPoint = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left - pan.x) / rect.width - 0.5) / zoom + 0.5),
      y: clamp(((clientY - rect.top - pan.y) / rect.height - 0.5) / zoom + 0.5),
    };
  };

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || mode === "pan" || !canvasRef.current) return;
    if ((event.target as HTMLElement).closest(".map-pin")) return;
    setDraft(mapPoint(event.clientX, event.clientY));
    setSelectedId(null);
    setEditing(false);
    setLabel("");
    setCardId("");
    setKind("place");
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const marker = await createMapMarker(worldSlug, {
        label: label.trim(),
        kind,
        x: draft.x,
        y: draft.y,
        card: cardId ? Number(cardId) : null,
      });
      setMap((current) =>
        current ? { ...current, markers: [...current.markers, marker] } : current,
      );
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存标记失败");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !editLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMapMarker(worldSlug, selected.id, {
        label: editLabel.trim(),
        kind: editKind,
        card: editCard ? Number(editCard) : null,
      });
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      setSelectedId(updated.id);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存标记失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setEditing(true);
    setEditLabel(selected.label);
    setEditKind(selected.kind);
    setEditCard(selected.card ? String(selected.card) : "");
  };

  const remove = async () => {
    if (!selected) return;
    const confirmed = await confirmAction({
      title: "删除这个标记？",
      body: `「${selected.label}」会从地图上移除。`,
      confirmLabel: "删除标记",
      danger: true,
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMapMarker(worldSlug, selected.id);
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.filter((item) => item.id !== selected.id) }
          : current,
      );
      setSelectedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除标记失败");
    } finally {
      setSaving(false);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>, marker: MapMarker) => {
    if (!canEdit) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: marker.id, moved: false };
    setEditing(false);
    setSelectedId(marker.id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || !canvasRef.current) return;
    const point = mapPoint(event.clientX, event.clientY);
    const x = point.x;
    const y = point.y;
    dragRef.current.moved = true;
    setMap((current) =>
      current
        ? {
            ...current,
            markers: current.markers.map((item) =>
              item.id === dragRef.current?.id ? { ...item, x, y } : item,
            ),
          }
        : current,
    );
  };

  const onPointerUp = async (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!drag.moved) return;
    const marker = map?.markers.find((item) => item.id === drag.id);
    if (!marker) return;
    try {
      const updated = await updateMapMarker(worldSlug, marker.id, { x: marker.x, y: marker.y });
      setMap((current) =>
        current
          ? { ...current, markers: current.markers.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移动标记失败");
    }
  };

  return (
    <div className="app-shell map-page">
      <Topbar mode="public" publicLabel="地图" worldName={world?.name} worldSlug={worldSlug} session={session} onLogout={onLogout} />
      {world && <WorldNav worldSlug={worldSlug} worldName={world.name} active="map" />}
      <main id="main-content" tabIndex={-1} className={`map-shell immersive${map ? " has-map" : ""}`}>
        <header className="map-hero">
          <a className="back-link" href={`/w/${worldSlug}/wiki`}>
            <ArrowLeft size={13} /> {world?.name ?? "世界"} Wiki
          </a>
          <span className="eyebrow"><Crosshair size={13} /> 世界地图</span>
          <h1>{world?.name ?? "世界地图"}</h1>
          <p>{canEdit ? "点击空白处放一个标记；拖动标记调整位置。" : "公开世界的只读地图。"}</p>
        </header>

        {loading && (
          <div className="loading">
            <Loader2 size={16} className="spin" /> 正在打开地图…
          </div>
        )}
        {error && <div className="error" role="alert">{error}</div>}

        {!loading && map && (
          <div className="map-layout">
            <div className="map-frame">
              <div
                ref={canvasRef}
                className={`map-canvas${canEdit ? " editable" : ""}`}
                onClick={onCanvasClick}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                role={canEdit ? "application" : "img"}
                aria-label={`${world?.name ?? "世界"}地图`}
              >
                <div className="map-controls" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                  <button type="button" aria-label="缩小地图" onClick={() => changeZoom(zoom - 0.5)}>−</button>
                  <span>{zoom.toFixed(1)}×</span>
                  <button type="button" aria-label="放大地图" onClick={() => changeZoom(zoom + 0.5)}>+</button>
                  <button type="button" aria-label="重置缩放" onClick={() => { changeZoom(1); setPan({ x: 0, y: 0 }); }}>重置</button>
                  {canEdit && (
                    <button type="button" className={mode === "place" ? "active" : ""} aria-label="放置标记模式" onClick={() => setMode("place")}>放置</button>
                  )}
                  <button type="button" className={mode === "pan" ? "active" : ""} aria-label="平移地图模式" onClick={() => setMode("pan")}>移动</button>
                  {world?.role === "owner" && (
                    <>
                      <label className={`map-bg-upload${backgroundBusy ? " disabled" : ""}`} title="上传地图背景">
                        {backgroundBusy ? <Loader2 size={12} className="spin" /> : <ImagePlus size={12} />}
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadBackground(event)} disabled={backgroundBusy} hidden />
                      </label>
                      {map.background_url && (
                        <button type="button" aria-label="移除地图背景" onClick={() => void removeBackground()} disabled={backgroundBusy}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="map-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                {map.background_url && <img className="map-background" src={map.background_url} alt="" draggable={false} />}
                <div className="map-grid" aria-hidden="true" />
                {map.markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    className={`map-pin${selectedId === marker.id ? " selected" : ""}`}
                    style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
                    onPointerDown={(event) => onPointerDown(event, marker)}
                    onPointerMove={onPointerMove}
                    onPointerUp={(event) => void onPointerUp(event)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(false);
                      setSelectedId(marker.id);
                    }}
                    aria-label={`${marker.label} · ${kindLabels[marker.kind]}`}
                  >
                    <MapPin size={13} />
                    <span>{marker.label}</span>
                  </button>
                ))}
                {draft && (
                  <span
                    className="map-draft"
                    style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                    aria-hidden="true"
                  />
                )}
                </div>
                {map.markers.length === 0 && !draft && (
                  <div className="map-canvas-empty" aria-hidden="true">
                    <MapPin size={20} />
                    <strong>{canEdit ? "还没有标记" : "这个世界还没有标注地图"}</strong>
                    <span>{canEdit ? "点击画布空白处放下第一个地点" : "地图暂时是空的"}</span>
                  </div>
                )}
              </div>
              <div className="map-legend">
                {(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => (
                  <span key={item}><i className={`map-dot ${item}`} /> {kindLabels[item]}</span>
                ))}
              </div>
            </div>

            <aside className="map-panel">
              {draft ? (
                <form onSubmit={saveDraft} className="map-form">
                  <span className="eyebrow"><Plus size={12} /> 新标记</span>
                  <label className="field">
                    <span>名称</span>
                    <input autoFocus required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如：七钟楼" />
                  </label>
                  <label className="field">
                    <span>类型</span>
                    <select value={kind} onChange={(event) => setKind(event.target.value as MapMarker["kind"])}>
                      {(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => (
                        <option key={item} value={item}>{kindLabels[item]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>关联卡片（可选）</span>
                    <select value={cardId} onChange={(event) => setCardId(event.target.value)}>
                      <option value="">不关联</option>
                      {cards.map((card) => (
                        <option key={card.id} value={card.id}>{card.title}</option>
                      ))}
                    </select>
                  </label>
                  <div className="map-form-actions">
                    <button type="submit" className="btn btn-primary" disabled={saving || !label.trim()}>
                      {saving ? "保存中…" : "放置标记"}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>取消</button>
                  </div>
                </form>
              ) : selected ? (
                editing ? (
                  <form onSubmit={saveEdit} className="map-form">
                    <span className="eyebrow">编辑标记</span>
                    <label className="field">
                      <span>名称</span>
                      <input required maxLength={120} value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>类型</span>
                      <select value={editKind} onChange={(event) => setEditKind(event.target.value as MapMarker["kind"])}>
                        {(Object.keys(kindLabels) as MapMarker["kind"][]).map((item) => (
                          <option key={item} value={item}>{kindLabels[item]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>关联卡片（可选）</span>
                      <select value={editCard} onChange={(event) => setEditCard(event.target.value)}>
                        <option value="">不关联</option>
                        {cards.map((card) => (
                          <option key={card.id} value={card.id}>{card.title}</option>
                        ))}
                      </select>
                    </label>
                    <div className="map-form-actions">
                      <button type="submit" className="btn btn-primary" disabled={saving || !editLabel.trim()}>
                        {saving ? "保存中…" : "保存"}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
                    </div>
                  </form>
                ) : (
                  <div className="map-form">
                    <span className="eyebrow">{kindLabels[selected.kind]}</span>
                    <h2>{selected.label}</h2>
                    {selected.card_slug ? (
                      <a className="btn btn-secondary" href={`/w/${worldSlug}/wiki/${selected.card_slug}`}>打开关联卡片</a>
                    ) : (
                      <p>没有关联卡片。</p>
                    )}
                    {canEdit && (
                      <div className="map-form-actions">
                        <button type="button" className="btn btn-secondary" onClick={startEdit}>编辑</button>
                        <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={saving}>
                          <Trash2 size={14} /> 删除标记
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="map-empty">
                  <span className="eyebrow">地图说明</span>
                  <h2>{canEdit ? "放一个标记" : "还没有标记"}</h2>
                  <p>{canEdit ? "点击地图空白处，再填写名称；已放置的标记可以拖动。" : "这个世界还没有公开地图标记。"}</p>
                  <span className="map-count">{map.markers.length} 个标记</span>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
