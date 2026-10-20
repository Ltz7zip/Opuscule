import { useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import type { TimelineEntry, TimelineEra } from "../types";

interface TimelineCanvasProps {
  entries: TimelineEntry[];
  eras?: TimelineEra[];
  selectedId: number | null;
  canEdit: boolean;
  onSelect: (entry: TimelineEntry) => void;
  onPickYear: (year: number) => void;
  onEraClick: (era: string) => void;
}

const ERA_COLORS = ["blue", "green", "gold", "red", "violet", "teal", "sky"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function yearLabel(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

function entryPosition(entry: TimelineEntry): number {
  return entry.year + (entry.month ? (entry.month - 1) / 12 : 0);
}

function monthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function niceStep(span: number): number {
  const raw = Math.max(1, span / 8);
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidate = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= raw);
  return candidate ?? power * 10;
}

export function TimelineCanvas({
  entries,
  eras: definedEras,
  selectedId,
  canEdit,
  onSelect,
  onPickYear,
  onEraClick,
}: TimelineCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [hover, setHover] = useState<{ x: number; year: number } | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; origin: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const domain = useMemo(() => {
    const values = entries.flatMap((entry) => [entryPosition(entry), entry.end_year ?? entryPosition(entry)]);
    (definedEras ?? []).forEach((era) => values.push(era.start_year, era.end_year));
    if (values.length === 0) return { min: 0, max: 100, span: 100 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(12, Math.round((max - min) * 0.1));
    return { min: min - pad, max: max + pad, span: Math.max(1, max - min + pad * 2) };
  }, [entries, definedEras]);

  const xFor = (year: number) => ((year - domain.min) / domain.span) * 100;

  const ticks = useMemo(() => {
    const step = niceStep(domain.span);
    const start = Math.ceil(domain.min / step) * step;
    const result: number[] = [];
    for (let year = start; year <= domain.max; year += step) result.push(year);
    return result;
  }, [domain]);

  const monthTicks = useMemo(() => {
    if (zoom < 2 || domain.span > 12 || !entries.some((entry) => entry.month)) return [];
    const ticks: Array<{ value: number; label: string }> = [];
    const startYear = Math.floor(domain.min);
    const endYear = Math.ceil(domain.max);
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const value = year + (month - 1) / 12;
        if (value >= domain.min && value <= domain.max && month !== 1) {
          ticks.push({ value, label: monthLabel(year, month) });
        }
      }
    }
    return ticks;
  }, [domain, entries, zoom]);

  const eventRows = useMemo(() => {
    const rows: number[] = [];
    const positions = new Map<number, number>();
    [...entries].sort((a, b) => a.year - b.year || a.id - b.id).forEach((entry) => {
      const x = ((entryPosition(entry) - domain.min) / domain.span) * 100;
      let row = 0;
      while (rows[row] !== undefined && x - rows[row] < 17) row += 1;
      rows[row] = x;
      positions.set(entry.id, row);
    });
    return positions;
  }, [domain, entries]);

  const eras = useMemo(() => {
    if (definedEras && definedEras.length > 0) {
      return definedEras
        .map((era, index) => ({
          name: era.name,
          start: era.start_year,
          end: era.end_year,
          color: ERA_COLORS.includes(era.color) ? era.color : ERA_COLORS[index % ERA_COLORS.length],
          count: entries.filter((entry) => entry.era === era.name).length,
        }))
        .sort((a, b) => a.start - b.start);
    }
    const map = new Map<string, { start: number; end: number; count: number }>();
    entries.forEach((entry) => {
      if (!entry.era) return;
      const start = entry.year;
      const end = entry.end_year ?? entry.year;
      const current = map.get(entry.era);
      map.set(entry.era, {
        start: current ? Math.min(current.start, start) : start,
        end: current ? Math.max(current.end, end) : end,
        count: (current?.count ?? 0) + 1,
      });
    });
    return [...map.entries()].sort((a, b) => a[1].start - b[1].start).map(([name, range], index) => ({
      name,
      ...range,
      color: ERA_COLORS[index % ERA_COLORS.length],
    }));
  }, [definedEras, entries]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".timeline-controls, .timeline-event, .timeline-era")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, origin: pan, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const delta = event.clientX - dragRef.current.startX;
      if (Math.abs(delta) > 3) dragRef.current.moved = true;
      setPan(dragRef.current.origin + delta);
    }
    const axis = axisRef.current;
    if (!axis) return;
    const rect = axis.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const year = Math.round(domain.min + ratio * domain.span);
    setHover({ x: clamp(xFor(year), 0, 100), year });
  };

  const onPointerUp = () => {
    if (dragRef.current?.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  const onViewportClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!canEdit) return;
    if ((event.target as HTMLElement).closest(".timeline-event, .timeline-era, .timeline-controls")) return;
    const axis = axisRef.current;
    if (!axis) return;
    const rect = axis.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    onPickYear(Math.round(domain.min + ratio * domain.span));
  };

  const zoomTo = (next: number) => {
    const value = clamp(next, 1, 3);
    setZoom(value);
    if (value === 1) setPan(0);
  };

  return (
    <div className="timeline-canvas-shell">
      <div className="timeline-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="缩小时间线" onClick={() => zoomTo(zoom - 0.5)} disabled={zoom <= 1}>
          <Minus size={14} />
        </button>
        <span>{zoom.toFixed(1)}×</span>
        <button type="button" aria-label="放大时间线" onClick={() => zoomTo(zoom + 0.5)} disabled={zoom >= 3}>
          <Plus size={14} />
        </button>
        <button type="button" aria-label="适应时间线" onClick={() => { setZoom(1); setPan(0); }}>
          <Maximize2 size={13} />
        </button>
      </div>

      {hintVisible && (
        <div className="timeline-hint">
          <span>{canEdit ? "把指针移到轴线上可新建事件；拖动画布可平移。" : "时间线按年份展开；拖动可平移，右上角可缩放。"}</span>
          <button type="button" onClick={() => setHintVisible(false)}>知道了</button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`timeline-canvas-viewport${canEdit ? " can-edit" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onClick={onViewportClick}
      >
        <div className="timeline-canvas-world" style={{ transform: `translateX(${pan}px) scale(${zoom})` }}>
          <div className="timeline-axis" ref={axisRef} aria-hidden="true" />
          {ticks.map((year) => (
            <div className="timeline-tick" key={year} style={{ left: `${xFor(year)}%` }}>
              <i />
              <span>{yearLabel(year)}</span>
            </div>
          ))}
          {monthTicks.map((tick) => (
            <div className="timeline-month-tick" key={tick.label} style={{ left: `${xFor(tick.value)}%` }}>
              <i />
              <span>{tick.label}</span>
            </div>
          ))}

          {eras.map((era, index) => {
            const left = xFor(era.start);
            const width = Math.max(3, xFor(era.end) - left);
            return (
              <button
                key={era.name}
                type="button"
                className={`timeline-era era-${era.color}`}
                style={{ left: `${left}%`, width: `${width}%`, top: `calc(46% + ${44 + index * 31}px)` }}
                onClick={(event) => { event.stopPropagation(); onEraClick(era.name); }}
                title={`筛选 ${era.name}`}
              >
                <span>{era.name}</span>
                <small>{era.count} 个事件</small>
              </button>
            );
          })}

          {entries.map((entry) => {
            const left = xFor(entryPosition(entry));
            const end = entry.end_year ?? entryPosition(entry);
            const rangeWidth = Math.max(0, xFor(end) - left);
            const row = eventRows.get(entry.id) ?? 0;
            return (
              <div
                className={`timeline-event${selectedId === entry.id ? " selected" : ""}`}
                key={entry.id}
                style={{
                  left: `${left}%`,
                  top: `calc(46% - ${72 + row * 46}px)`,
                }}
              >
                <button
                  type="button"
                  className="timeline-event-card"
                  onClick={(event) => { event.stopPropagation(); onSelect(entry); }}
                  aria-label={`${entry.title}，${entry.year}${entry.end_year ? ` 至 ${entry.end_year}` : ""}`}
                >
                  <span className="timeline-event-title">
                    <strong>{entry.title}</strong>
                    <span className="timeline-event-year">
                      {entry.year}{entry.month ? `-${String(entry.month).padStart(2, "0")}` : ""}{entry.end_year ? `–${entry.end_year}` : ""}
                    </span>
                  </span>
                  {entry.era && <small>{entry.era}</small>}
                </button>
                <i className="timeline-event-stem" aria-hidden="true" />
                <i className="timeline-event-dot" aria-hidden="true" />
                {rangeWidth > 0 && (
                  <i className="timeline-event-range" style={{ width: `${rangeWidth}%` }} aria-hidden="true" />
                )}
              </div>
            );
          })}

          {hover && (
            <div className="timeline-hover" style={{ left: `${hover.x}%` }} aria-hidden="true">
              <span>{hover.year}</span>
            </div>
          )}
          {hover && canEdit && (
            <button
              type="button"
              className="timeline-axis-add"
              style={{ left: `${hover.x}%` }}
              aria-label={`在 ${hover.year} 年新建事件`}
              onClick={(event) => { event.stopPropagation(); onPickYear(hover.year); }}
            >
              <Plus size={11} />
            </button>
          )}

          {entries.length === 0 && (
            <div className="timeline-canvas-empty">
              <div className="eyebrow">时间轴</div>
              <h2>{canEdit ? "在轴线上点一下，写下第一个年份" : "这条时间线还是空的"}</h2>
              <p>{canEdit ? "拖动可平移，右上角可缩放；在画布上点击年份即可填入右侧表单。" : "世界还没有公开时间线。"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
