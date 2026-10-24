import { useEffect, useLayoutEffect, useRef } from "react";
import type { MapMarker } from "../types";

interface MapCanvasStageProps {
  src: string;
  heightmap?: string;
  heightmapWidth: number;
  heightmapHeight: number;
  mapWidth: number;
  mapHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  filterClass: string;
  selected?: MapMarker | null;
  terrain: boolean;
}

function decodeHeightmap(value: string): Uint8Array | null {
  if (!value) return null;
  try {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function hash2(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export default function MapCanvasStage({
  src,
  heightmap,
  heightmapWidth,
  heightmapHeight,
  mapWidth,
  mapHeight,
  zoom,
  pan,
  filterClass,
  selected,
  terrain,
}: MapCanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const levels = heightmap ? decodeHeightmap(heightmap) : null;

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      imageRef.current = image;
      draw();
    };
    image.src = src;
    return () => {
      image.onload = null;
      imageRef.current = null;
    };
    // draw is intentionally read through the ref-based function below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = dimensionsRef.current.width || canvas.clientWidth;
    const height = dimensionsRef.current.height || canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const aspect = mapWidth / Math.max(1, mapHeight);
    const canvasAspect = width / height;
    const displayWidth = canvasAspect > aspect ? width : height * aspect;
    const displayHeight = canvasAspect > aspect ? width / aspect : height;
    const left = (width - displayWidth) / 2;
    const top = (height - displayHeight) / 2;
    const image = imageRef.current;
    if (image) {
      context.save();
      context.translate(width / 2 + pan.x, height / 2 + pan.y);
      context.scale(zoom, zoom);
      context.drawImage(image, left - width / 2, top - height / 2, displayWidth, displayHeight);
      context.restore();
    }

    if (terrain && levels && zoom > 1.02) {
      const detailOpacity = Math.min(0.9, (zoom - 1) * 0.46);
      const centerX = width / 2 + pan.x;
      const centerY = height / 2 + pan.y;
      const displayMapWidth = displayWidth * zoom;
      const displayMapHeight = displayHeight * zoom;
      context.save();
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      context.globalAlpha = detailOpacity;

      const px = (x: number) => centerX + left + (x / (heightmapWidth - 1) - 0.5) * displayMapWidth;
      const py = (y: number) => centerY + top + (y / (heightmapHeight - 1) - 0.5) * displayMapHeight;
      const sample = (x: number, y: number) =>
        levels[(Math.max(0, Math.min(heightmapHeight - 1, y)) * heightmapWidth + Math.max(0, Math.min(heightmapWidth - 1, x))) * 3] / 255;

      // Contours are drawn in screen space, so their weight does not grow with zoom.
      context.lineWidth = 0.7;
      context.strokeStyle = "rgba(26, 38, 30, .28)";
      context.beginPath();
      for (let level = 0.1; level < 0.95; level += 0.055) {
        for (let y = 0; y < heightmapHeight - 1; y += 1) {
          for (let x = 0; x < heightmapWidth - 1; x += 1) {
            const a = sample(x, y);
            const b = sample(x + 1, y);
            const c = sample(x + 1, y + 1);
            const d = sample(x, y + 1);
            const edges: Array<[number, number]> = [];
            if ((a < level) !== (b < level)) edges.push([x + (level - a) / (b - a), y]);
            if ((b < level) !== (c < level)) edges.push([x + 1, y + (level - b) / (c - b)]);
            if ((d < level) !== (c < level)) edges.push([x + (level - d) / (c - d), y + 1]);
            if ((a < level) !== (d < level)) edges.push([x, y + (level - a) / (d - a)]);
            if (edges.length >= 2) {
              context.moveTo(px(edges[0][0]), py(edges[0][1]));
              context.lineTo(px(edges[1][0]), py(edges[1][1]));
            }
          }
        }
      }
      context.stroke();

      context.fillStyle = "rgba(22, 55, 33, .60)";
      for (let y = 1; y < heightmapHeight - 1; y += 2) {
        for (let x = 1; x < heightmapWidth - 1; x += 2) {
          const h = sample(x, y);
          if (h < 0.02 || h > 0.46 || hash2(x, y) > 0.24) continue;
          const sx = px(x);
          const sy = py(y);
          if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;
          const size = 2.4 + hash2(y, x) * 2.6;
          context.beginPath();
          context.moveTo(sx, sy - size);
          context.lineTo(sx - size * 0.55, sy + size * 0.55);
          context.lineTo(sx + size * 0.55, sy + size * 0.55);
          context.closePath();
          context.fill();
        }
      }
      context.restore();
    }

    if (selected) {
      const sx = width / 2 + pan.x + (selected.x - 0.5) * width * zoom;
      const sy = height / 2 + pan.y + (selected.y - 0.5) * height * zoom;
      context.save();
      context.strokeStyle = "rgba(255,255,255,.92)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(sx, sy, 10, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      dimensionsRef.current = { width: canvas.clientWidth, height: canvas.clientHeight };
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan.x, pan.y, heightmap, heightmapWidth, heightmapHeight, selected, mapWidth, mapHeight]);

  return <canvas ref={canvasRef} className={`map-canvas-surface${filterClass}`} aria-hidden="true" />;
}
