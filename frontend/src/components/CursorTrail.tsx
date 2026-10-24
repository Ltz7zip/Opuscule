import { useEffect, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
  life: number;
  size: number;
  angle: number;
}

/**
 * A small 2D take on the custom-brush cursor trail: the brush is a velocity-
 * oriented diamond rather than a radial blob. It is deliberately opt-in for
 * fine pointers, skips text fields, and never intercepts a pointer event.
 */
export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const labelText = useRef("");
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const force = new URLSearchParams(window.location.search).get("motion") === "force";
    if (!fine || (reduce && !force)) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points: Point[] = [];
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    let raf = 0;
    let running = false;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let lastTime = performance.now();

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const color = () => getComputedStyle(document.body).color || "rgb(250, 250, 250)";

    const draw = () => {
      raf = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const now = performance.now();
      const delta = Math.min(32, now - lastTime);
      lastTime = now;
      const fade = Math.pow(0.9, delta / 16.67);
      ctx.fillStyle = color();
      for (let index = points.length - 1; index >= 0; index -= 1) {
        const point = points[index];
        point.life *= fade;
        if (point.life < 0.04) {
          points.splice(index, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(0.46, point.life * 0.36);
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(point.angle);
        ctx.beginPath();
        ctx.moveTo(0, -point.size);
        ctx.lineTo(point.size * 0.52, 0);
        ctx.lineTo(0, point.size);
        ctx.lineTo(-point.size * 0.52, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (points.length > 0) {
        raf = window.requestAnimationFrame(draw);
      } else {
        running = false;
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      raf = window.requestAnimationFrame(draw);
    };

    const isTypingTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], .editor-body"));
    };

    const updateLabel = (target: EventTarget | null, x: number, y: number) => {
      const element = target instanceof Element ? target : null;
      const labelled = element?.closest<HTMLElement>("[data-cursor]");
      const articleLink = element?.closest(".site-article-body a, .site-article-body button");
      const next = labelled?.dataset.cursor ?? (articleLink ? "READ" : "");
      if (next !== labelText.current) {
        labelText.current = next;
        setLabel(next);
      }
      if (labelRef.current) {
        const left = Math.min(window.innerWidth - 86, x + 18);
        const top = Math.min(window.innerHeight - 34, y + 18);
        labelRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.clientX === 0 && event.clientY === 0) return;
      if (isTypingTarget(event.target)) {
        lastX = event.clientX;
        lastY = event.clientY;
        if (labelText.current) {
          labelText.current = "";
          setLabel("");
        }
        return;
      }
      updateLabel(event.target, event.clientX, event.clientY);
      const x = event.clientX;
      const y = event.clientY;
      if (lastX === null || lastY === null) {
        lastX = x;
        lastY = y;
      }
      const dx = x - lastX;
      const dy = y - lastY;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.5) return;
      const speed = Math.min(18, distance);
      const steps = Math.min(3, Math.max(1, Math.ceil(distance / 9)));
      const angle = Math.atan2(dy, dx);
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        points.push({
          x: lastX + dx * t,
          y: lastY + dy * t,
          life: 0.72 + Math.min(0.28, speed / 28),
          size: 2.2 + Math.min(3.6, speed * 0.22),
          angle,
        });
      }
      while (points.length > 64) points.shift();
      lastX = x;
      lastY = y;
      start();
    };

    const onLeave = () => {
      lastX = null;
      lastY = null;
      labelText.current = "";
      setLabel("");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
      if (raf) window.cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <canvas ref={canvasRef} className="cursor-trail" aria-hidden="true" />
      <span ref={labelRef} className={`cursor-label${label ? " is-on" : ""}`} aria-hidden="true">{label}</span>
    </>
  );
}
