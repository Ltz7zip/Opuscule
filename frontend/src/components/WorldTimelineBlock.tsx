import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

import { fetchWorldTimeline } from "../api";
import type { TimelineData, TimelineEntry } from "../types";

function yearLabel(entry: TimelineEntry): string {
  const start = `${entry.year} 年`;
  if (entry.month) return `${entry.year} 年 ${entry.month} 月`;
  if (entry.end_year && entry.end_year !== entry.year) return `${entry.year}–${entry.end_year} 年`;
  return start;
}

/** Renders a world timeline inline on the concept read page. */
export function WorldTimelineBlock({
  worldSlug,
  timelineSlug,
  name,
}: {
  worldSlug: string;
  timelineSlug: string;
  name: string;
}) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!worldSlug || !timelineSlug) return;
    let cancelled = false;
    fetchWorldTimeline(worldSlug, timelineSlug)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [timelineSlug, worldSlug]);

  const entries = (data?.entries ?? []).slice().sort((a, b) => a.year - b.year).slice(0, 12);
  const label = data?.timeline?.name || name || timelineSlug;

  return (
    <section className="rich-timeline" aria-label={`时间线：${label}`}>
      <header className="rich-timeline-head">
        <Clock3 size={14} />
        <div>
          <small>世界时间线</small>
          <strong>{label}</strong>
        </div>
        <a href={`/w/${worldSlug}/timeline`}>打开时间线</a>
      </header>
      {error && <p className="rich-timeline-empty">时间线暂时无法加载。</p>}
      {!error && !data && <p className="rich-timeline-empty">正在读取时间线…</p>}
      {!error && data && entries.length === 0 && (
        <p className="rich-timeline-empty">这条时间线还没有条目。</p>
      )}
      {entries.length > 0 && (
        <ol className="rich-timeline-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{yearLabel(entry)}</span>
              <div>
                <b>{entry.title}</b>
                {entry.description && <p>{entry.description}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
