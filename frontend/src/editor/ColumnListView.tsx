import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

type Widths = number[];

function normalizedWidths(raw: unknown, count: number): Widths | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const values = raw.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return sum > 0 ? values.map((value) => value / sum) : null;
}

function columnsOf(wrapper: HTMLElement | null): HTMLElement[] {
  if (!wrapper) return [];
  return Array.from(wrapper.querySelectorAll<HTMLElement>(".tiptap-column")).filter(
    (column) => column.closest(".tiptap-columns") === wrapper,
  );
}

function templateOf(widths: Widths): string {
  return widths.map((width) => `minmax(0, ${width}fr)`).join(" ");
}

export function ColumnListView({ node, updateAttributes }: NodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [handles, setHandles] = useState<number[]>([]);
  const dragRef = useRef<{
    index: number;
    startX: number;
    totalWidth: number;
    startWidths: Widths;
    currentWidths: Widths;
  } | null>(null);

  const count = Math.min(4, Math.max(2, Number(node.attrs.layout) || node.content.childCount || 2));
  const widths = normalizedWidths(node.attrs.widths, count);
  const template = widths ? templateOf(widths) : undefined;

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    const columns = columnsOf(wrapper);
    if (!wrapper || columns.length < 2) {
      setHandles([]);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    setHandles(columns.slice(0, -1).map((column, index) => {
      const current = column.getBoundingClientRect();
      const next = columns[index + 1].getBoundingClientRect();
      return (current.right + next.left) / 2 - wrapperRect.left;
    }));
  }, []);

  useEffect(() => {
    measure();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [measure, node]);

  const beginDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const wrapper = wrapperRef.current;
    const columns = columnsOf(wrapper);
    if (!wrapper || columns.length < 2) return;
    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
    const rects = columns.map((column) => column.getBoundingClientRect());
    const totalWidth = rects.reduce((sum, rect) => sum + rect.width, 0);
    if (totalWidth <= 0) return;
    const startWidths = widths ?? rects.map((rect) => rect.width / totalWidth);
    dragRef.current = { index, startX: event.clientX, totalWidth, startWidths, currentWidths: startWidths };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const delta = (event.clientX - drag.startX) / drag.totalWidth;
    const pair = drag.startWidths[drag.index] + drag.startWidths[drag.index + 1];
    const min = Math.min(0.28, Math.max(0.08, 96 / drag.totalWidth));
    const left = Math.max(min, Math.min(pair - min, drag.startWidths[drag.index] + delta));
    const next = [...drag.startWidths];
    next[drag.index] = left;
    next[drag.index + 1] = pair - left;
    drag.currentWidths = next;
    wrapperRef.current?.style.setProperty("--column-template", templateOf(next));
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    updateAttributes({ widths: drag.currentWidths, preset: "custom" });
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudge = (index: number, direction: -1 | 1, shift: boolean) => {
    const wrapper = wrapperRef.current;
    const columns = columnsOf(wrapper);
    const rects = columns.map((column) => column.getBoundingClientRect());
    const totalWidth = rects.reduce((sum, rect) => sum + rect.width, 0);
    if (rects.length < 2 || totalWidth <= 0) return;
    const start = widths ?? rects.map((rect) => rect.width / totalWidth);
    const pair = start[index] + start[index + 1];
    const min = Math.min(0.28, Math.max(0.08, 96 / totalWidth));
    const left = Math.max(min, Math.min(pair - min, start[index] + direction * (shift ? 0.1 : 0.04)));
    const next = [...start];
    next[index] = left;
    next[index + 1] = pair - left;
    updateAttributes({ widths: next, preset: "custom" });
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`tiptap-columns cols-${count}`}
      data-columns={count}
      data-preset={node.attrs.preset ?? "equal"}
      style={template ? ({ "--column-template": template } as CSSProperties) : undefined}
    >
      <NodeViewContent className="tiptap-columns-content" />
      {handles.map((left, index) => (
        <button
          key={index}
          type="button"
          className="tiptap-column-resizer"
          style={{ left }}
          aria-label={`调整第 ${index + 1} 栏与第 ${index + 2} 栏的宽度`}
          title="拖动调整栏宽；聚焦后可用左右方向键微调"
          contentEditable={false}
          onPointerDown={(event) => beginDrag(index, event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            event.stopPropagation();
            nudge(index, event.key === "ArrowLeft" ? -1 : 1, event.shiftKey);
          }}
        />
      ))}
    </NodeViewWrapper>
  );
}
