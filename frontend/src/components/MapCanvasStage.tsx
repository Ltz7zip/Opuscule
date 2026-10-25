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

async function decodeHeightmap(value: string): Promise<ImageData | null> {
  if (!value) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/png;base64,${value}`;
  });
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
  const levelsRef = useRef<ImageData | null>(null);

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      imageRef.current = image;
      drawRef.current();
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

    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    const levels = levelsRef.current;
    if (terrain && levels) {
      const hmWidth = levels.width || heightmapWidth;
      const hmHeight = levels.height || heightmapHeight;
      const detailOpacity = Math.min(0.8, 0.36 + (zoom - 1) * 0.34);
      const stride = zoom < 1.25 ? 2 : 1;
      const displayMapWidth = displayWidth * zoom;
      const displayMapHeight = displayHeight * zoom;
      context.save();
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();

      // The image is drawn inside translate(center) + scale(zoom), so its
      // top-left corner lands at center + zoom * (left - width/2).  The old
      // form forgot to scale the letterbox offset, which drifted the contour
      // layer away from the terrain as soon as you zoomed in.
      const originX = centerX + zoom * (left - width / 2);
      const originY = centerY + zoom * (top - height / 2);
      const px = (x: number) => originX + (x / (hmWidth - 1)) * displayMapWidth;
      const py = (y: number) => originY + (y / (hmHeight - 1)) * displayMapHeight;
      const sample = (x: number, y: number) => {
        const cx = Math.max(0, Math.min(hmWidth - 1, x));
        const cy = Math.max(0, Math.min(hmHeight - 1, y));
        return levels.data[(cy * hmWidth + cx) * 4] / 255;
      };

      // Survey contours: screen-space weight, major every fifth level.
      context.strokeStyle = "rgb(26, 38, 30)";
      let levelIndex = 0;
      for (let level = 0.1; level < 0.94; level += 0.052) {
        const major = levelIndex % 5 === 0;
        context.beginPath();
        for (let y = 0; y < hmHeight - stride; y += stride) {
          for (let x = 0; x < hmWidth - stride; x += stride) {
            const a = sample(x, y);
            const b = sample(x + stride, y);
            const c = sample(x + stride, y + stride);
            const d = sample(x, y + stride);
            const edges: Array<[number, number]> = [];
            if ((a < level) !== (b < level)) edges.push([x + (stride * (level - a)) / (b - a), y]);
            if ((b < level) !== (c < level)) edges.push([x + stride, y + (stride * (level - b)) / (c - b)]);
            if ((d < level) !== (c < level)) edges.push([x + (stride * (level - d)) / (c - d), y + stride]);
            if ((a < level) !== (d < level)) edges.push([x, y + (stride * (level - a)) / (d - a)]);
            if (edges.length >= 2) {
              context.moveTo(px(edges[0][0]), py(edges[0][1]));
              context.lineTo(px(edges[1][0]), py(edges[1][1]));
            }
          }
        }
        context.globalAlpha = detailOpacity * (major ? 1 : 0.55);
        context.lineWidth = major ? 1.1 : 0.7;
        context.stroke();
        levelIndex += 1;
      }

      // A few summit triangles, kept sparse and below the contour weight.
      context.globalAlpha = Math.min(0.7, detailOpacity * 1.25);
      context.fillStyle = "rgba(22, 55, 33, .70)";
      for (let y = 1; y < hmHeight - 1; y += stride * 2) {
        for (let x = 1; x < hmWidth - 1; x += stride * 2) {
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
      const sx = centerX + zoom * (left - width / 2) + selected.x * displayWidth * zoom;
      const sy = centerY + zoom * (top - height / 2) + selected.y * displayHeight * zoom;
      context.save();
      context.strokeStyle = "rgba(255,255,255,.92)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(sx, sy, 10, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    let cancelled = false;
    if (!heightmap) {
      levelsRef.current = null;
      if (canvasRef.current) canvasRef.current.dataset.contours = "none";
      drawRef.current();
      return;
    }
    void decodeHeightmap(heightmap).then((decoded) => {
      if (cancelled) return;
      levelsRef.current = decoded;
      if (canvasRef.current) canvasRef.current.dataset.contours = decoded ? "ready" : "missing";
      drawRef.current();
    });
    return () => {
      cancelled = true;
    };
    // draw is ref-based and intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      dimensionsRef.current = { width: canvas.clientWidth, height: canvas.clientHeight };
      drawRef.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    drawRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan.x, pan.y, heightmap, heightmapWidth, heightmapHeight, selected, mapWidth, mapHeight]);

  return <canvas ref={canvasRef} className={`map-canvas-surface${filterClass}`} aria-hidden="true" />;
}
