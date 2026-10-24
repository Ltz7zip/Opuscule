import { useEffect, useRef } from "react";

interface ContourPlateProps {
  seed: string;
  className?: string;
  detail?: boolean;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic survey plate: seeded terrain contours drawn with marching
 * squares. It replaces the flat initial glyph plate without shipping a DEM,
 * texture, or 3D renderer.
 */
export function ContourPlate({ seed, className = "", detail = false }: ContourPlateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;

    const random = mulberry32(hashSeed(seed));
    const phaseA = random() * Math.PI * 2;
    const phaseB = random() * Math.PI * 2;
    const phaseC = random() * Math.PI * 2;
    const tilt = (random() - 0.5) * 0.5;
    const hills = Array.from({ length: 3 }, () => ({
      x: 0.15 + random() * 0.7,
      y: 0.15 + random() * 0.7,
      amplitude: 0.12 + random() * 0.2,
      spread: 0.08 + random() * 0.16,
    }));

    const field = (x: number, y: number) => {
      let value = 0.46;
      value += 0.15 * Math.sin(x * 6.4 + Math.sin(y * 4.2 + phaseA) * 1.35 + phaseB);
      value += 0.09 * Math.cos(y * 6.9 - x * 1.9 + phaseC);
      value += 0.04 * Math.sin((x + y) * 13.1 + phaseA);
      value += tilt * (x - 0.5);
      for (const hill of hills) {
        const dx = x - hill.x;
        const dy = y - hill.y;
        value += hill.amplitude * Math.exp(-(dx * dx + dy * dy) / (hill.spread * hill.spread));
      }
      return value;
    };

    let frame = 0;
    const draw = () => {
      frame = 0;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(canvas).color || "currentColor";
      const cols = 66;
      const rows = 42;
      const values = new Float32Array(cols * rows);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          values[y * cols + x] = field(x / (cols - 1), y / (rows - 1));
        }
      }

      const lx = (x: number) => (x / (cols - 1)) * width;
      const ly = (y: number) => (y / (rows - 1)) * height;
      let levelIndex = 0;
      for (let level = 0.17; level < 0.82; level += 0.047) {
        const major = levelIndex % 5 === 0;
        ctx.beginPath();
        for (let y = 0; y < rows - 1; y += 1) {
          for (let x = 0; x < cols - 1; x += 1) {
            const a = values[y * cols + x];
            const b = values[y * cols + x + 1];
            const c = values[(y + 1) * cols + x + 1];
            const d = values[(y + 1) * cols + x];
            const edges: Array<[number, number]> = [];
            if ((a < level) !== (b < level)) edges.push([x + (level - a) / (b - a), y]);
            if ((b < level) !== (c < level)) edges.push([x + 1, y + (level - b) / (c - b)]);
            if ((d < level) !== (c < level)) edges.push([x + (level - d) / (c - d), y + 1]);
            if ((a < level) !== (d < level)) edges.push([x, y + (level - a) / (d - a)]);
            if (edges.length >= 2) {
              ctx.moveTo(lx(edges[0][0]), ly(edges[0][1]));
              ctx.lineTo(lx(edges[1][0]), ly(edges[1][1]));
            }
          }
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = major ? 0.42 : 0.22;
        ctx.lineWidth = major ? 0.9 : 0.55;
        ctx.stroke();
        levelIndex += 1;
      }

      // Keep the central glyph legible: dissolve the lines under a soft
      // summit-like clearing instead of laying text over raw hatching.
      const clearing = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.34);
      clearing.addColorStop(0, "rgba(0,0,0,.92)");
      clearing.addColorStop(0.55, "rgba(0,0,0,.55)");
      clearing.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = clearing;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      // Survey frame ticks and a small centre mark.
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let index = 1; index < 8; index += 1) {
        const x = (index / 8) * width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, index % 2 === 0 ? 4 : 2);
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - (index % 2 === 0 ? 4 : 2));
      }
      for (let index = 1; index < 6; index += 1) {
        const y = (index / 6) * height;
        ctx.moveTo(0, y);
        ctx.lineTo(index % 2 === 0 ? 4 : 2, y);
        ctx.moveTo(width, y);
        ctx.lineTo(width - (index % 2 === 0 ? 4 : 2), y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 5, height / 2);
      ctx.lineTo(width / 2 + 5, height / 2);
      ctx.moveTo(width / 2, height / 2 - 5);
      ctx.lineTo(width / 2, height / 2 + 5);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (detail) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = color;
        ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.letterSpacing = "0.08em";
        ctx.fillText("SURVEY PLATE", 8, height - 8);
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(`${Math.round(1800 + (hashSeed(seed) % 1400))} M`, width - 8, 7);
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

    const force = new URLSearchParams(window.location.search).get("motion") === "force";
    const canParallax = detail
      && window.matchMedia("(pointer: fine)").matches
      && (force || !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = host.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
      const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
      canvas.style.setProperty("--plate-x", `${x * 5}px`);
      canvas.style.setProperty("--plate-y", `${y * 4}px`);
    };
    const onPointerLeave = () => {
      canvas.style.setProperty("--plate-x", "0px");
      canvas.style.setProperty("--plate-y", "0px");
    };
    if (canParallax) {
      host.addEventListener("pointermove", onPointerMove);
      host.addEventListener("pointerleave", onPointerLeave);
    }
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      if (canParallax) {
        host.removeEventListener("pointermove", onPointerMove);
        host.removeEventListener("pointerleave", onPointerLeave);
      }
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [detail, seed]);

  return <canvas ref={canvasRef} className={`contour-cover ${className}`.trim()} aria-hidden="true" />;
}
