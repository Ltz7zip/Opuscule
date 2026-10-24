import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface MapLensProps {
  hostRef: RefObject<HTMLElement | null>;
  src: string | null;
  zoom: number;
  disabled?: boolean;
}

const LENS_SIZE = 190;
const MAGNIFY = 1.9;

/**
 * A square magnifier over the rendered map. It reads the live <canvas> when
 * the terrain stage provides one, otherwise the background image, and draws a
 * magnified copy around the pointer. This is a 2D analogue of the square
 * lens technique; it adds no renderer or asset.
 */
export function MapLens({ hostRef, src, zoom, disabled = false }: MapLensProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (disabled || !src) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const force = new URLSearchParams(window.location.search).get("motion") === "force";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && !force) return;
    const host = hostRef.current;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!host || !wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = LENS_SIZE * dpr;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${LENS_SIZE}px`;
    canvas.style.height = `${LENS_SIZE}px`;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let active = false;
    let raf = 0;
    let image: HTMLImageElement | null = null;
    let imageReady = false;

    const load = () => {
      image = new Image();
      image.onload = () => { imageReady = true; };
      image.src = src;
    };
    load();

    const findSource = (): HTMLCanvasElement | HTMLImageElement | null => {
      const canvasSource = Array.from(host.querySelectorAll<HTMLCanvasElement>("canvas")).find(
        (node) => node !== canvas && node.width > 1 && node.height > 1,
      );
      if (canvasSource) return canvasSource;
      const img = host.querySelector<HTMLImageElement>(".map-background");
      if (img && img.complete) return img;
      return image && imageReady ? image : null;
    };

    const drawFrame = () => {
      raf = 0;
      if (!active) return;
      x += (targetX - x) * 0.28;
      y += (targetY - y) * 0.28;
      wrap.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

      const source = findSource();
      const hostRect = host.getBoundingClientRect();
      if (source) {
        const sourceRect = source.getBoundingClientRect();
        const isCanvas = source instanceof HTMLCanvasElement;
        const sourceW = isCanvas ? source.width : source.naturalWidth;
        const sourceH = isCanvas ? source.height : source.naturalHeight;
        if (sourceRect.width < 1 || sourceRect.height < 1) {
          raf = window.requestAnimationFrame(drawFrame);
          return;
        }
        const spanCss = LENS_SIZE / MAGNIFY;
        const spanX = (spanCss / sourceRect.width) * sourceW;
        const spanY = (spanCss / sourceRect.height) * sourceH;
        const sourceX = ((x + hostRect.left - sourceRect.left) / sourceRect.width) * sourceW - spanX / 2;
        const sourceY = ((y + hostRect.top - sourceRect.top) / sourceRect.height) * sourceH - spanY / 2;
        ctx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);
        ctx.fillStyle = "#0b0b0d";
        ctx.fillRect(0, 0, LENS_SIZE, LENS_SIZE);
        ctx.imageSmoothingEnabled = true;
        try {
          ctx.drawImage(source, sourceX, sourceY, spanX, spanY, 0, 0, LENS_SIZE, LENS_SIZE);
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.12;
          ctx.drawImage(source, sourceX + spanX * 0.008, sourceY, spanX, spanY, 1, 0, LENS_SIZE, LENS_SIZE);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        } catch {
          /* A canvas that is not origin-clean cannot be magnified. */
        }
      }
      if (metaRef.current) {
        metaRef.current.textContent = `${MAGNIFY.toFixed(1)}× · ${((x / hostRect.width) * 100).toFixed(1)} / ${((y / hostRect.height) * 100).toFixed(1)}`;
      }
      raf = window.requestAnimationFrame(drawFrame);
    };

    const show = () => {
      if (active) return;
      active = true;
      wrap.classList.add("is-on");
      x = targetX;
      y = targetY;
      raf = window.requestAnimationFrame(drawFrame);
    };

    const hide = () => {
      active = false;
      wrap.classList.remove("is-on");
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = host.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      show();
    };
    const onLeave = () => hide();
    const onDown = (event: PointerEvent) => { if (event.button === 2) hide(); };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      hide();
      image = null;
    };
  }, [disabled, hostRef, src, zoom]);

  if (!src) return null;
  return (
    <div ref={wrapRef} className="map-lens" aria-hidden="true">
      <canvas ref={canvasRef} />
      <span className="map-lens-meta" ref={metaRef}>1.9×</span>
    </div>
  );
}
