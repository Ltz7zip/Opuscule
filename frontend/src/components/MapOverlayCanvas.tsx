import { useEffect, useLayoutEffect, useRef } from "react";
import type { MapMarker } from "../types";

interface MapOverlayCanvasProps {
  markers: MapMarker[];
  selectedId: number | null;
  hoveredId: number | null;
  zoom: number;
  pan: { x: number; y: number };
  view?: { left: number; top: number; width: number; height: number } | null;
}

/** Screen-space selection rings for map pins. */
export default function MapOverlayCanvas({ markers, selectedId, hoveredId, zoom, pan, view = null }: MapOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = useRef({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = dims.current.width || canvas.clientWidth;
      const height = dims.current.height || canvas.clientHeight;
      if (!width || !height) return;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const viewLeft = view?.left ?? 0;
      const viewTop = view?.top ?? 0;
      const viewWidth = view?.width ?? width;
      const viewHeight = view?.height ?? height;
      for (const marker of markers) {
        const active = marker.id === selectedId;
        const hovered = marker.id === hoveredId;
        if (!active && !hovered) continue;
        const x = width / 2 + pan.x + viewLeft + (marker.x - 0.5) * viewWidth * zoom;
        const y = height / 2 + pan.y + viewTop + (marker.y - 0.5) * viewHeight * zoom;
        ctx.save();
        ctx.strokeStyle = active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)";
        ctx.lineWidth = active ? 1.8 : 1;
        ctx.beginPath();
        ctx.arc(x, y, active ? 11 : 8, 0, Math.PI * 2);
        ctx.stroke();
        if (active) {
          ctx.strokeStyle = "rgba(255,255,255,.35)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    const resize = () => {
      dims.current = { width: canvas.clientWidth, height: canvas.clientHeight };
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [markers, selectedId, hoveredId, zoom, pan, view]);

  return <canvas ref={canvasRef} className="map-overlay-canvas" aria-hidden="true" />;
}
