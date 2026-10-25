import { useEffect, useMemo, useState } from "react";

type RendererMode = "gpu" | "cpu" | "pending";

interface PerfHudProps {
  rendererMode: RendererMode;
  /** `chip` sits on the map canvas; `plain` is for the full-screen loader. */
  variant?: "chip" | "plain";
  /** Terrain recipe currently on screen, when the world has one. */
  terrain?: { seed?: number | null; style?: string | null; width?: number | null; height?: number | null } | null;
}

interface GpuInfo {
  label: string;
  webgl2: boolean;
}

/** Read the unmasked WebGL renderer string, if the browser exposes it. */
function detectGpu(): GpuInfo {
  if (typeof document === "undefined") return { label: "未知", webgl2: false };
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return { label: "不可用", webgl2: false };
  const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const debug = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
  const raw = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "") : "";
  const label = raw
    // Chrome reports "ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version";
    // Firefox often "ANGLE (Apple, ANGLE Metal Renderer: …)". Keep the chip name.
    .replace(/^ANGLE\s*\(/i, "")
    .replace(/\)\s*$/i, "")
    .replace(/ANGLE\s+[A-Za-z ]*Renderer:\s*/i, "")
    .replace(/^Apple,\s*/i, "")
    .replace(/,\s*Unspecified Version.*$/i, "")
    .replace(/,\s*OpenGL.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const context = gl.getExtension("WEBGL_lose_context");
  context?.loseContext();
  return { label: label || "未公开", webgl2 };
}

function formatHeap(bytes: number | null): string {
  if (bytes === null) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Tiny bottom-left diagnostics: cores, RAM, renderer and live frame rate.
 * Everything is client-side; nothing is reported to the server.
 */
export default function PerfHud({ rendererMode, terrain, variant = "chip" }: PerfHudProps) {
  const gpu = useMemo(detectGpu, []);
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || null : null;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  const [fps, setFps] = useState<number | null>(null);
  const [heap, setHeap] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let frame = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      frames += 1;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
        setHeap(perf.memory?.usedJSHeapSize ?? null);
        frames = 0;
        windowStart = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={`perf-hud${variant === "plain" ? " is-plain" : ""}`} aria-hidden="true">
      {terrain?.seed ? (
        <span className="perf-hud-recipe">
          MAP {terrain.style ?? "—"} · {terrain.width ?? "—"}×{terrain.height ?? "—"} · seed {terrain.seed}
        </span>
      ) : null}
      <span>
        CPU {cores ?? "—"}C · RAM {memory ? `${memory} GB` : "—"}
      </span>
      <span>
        GPU {gpu.label} · {gpu.webgl2 ? "WebGL2" : "WebGL1"}
      </span>
      <span>
        渲染 {rendererMode === "gpu" ? "GPU" : rendererMode === "pending" ? "准备中" : "CPU（PNG 回退）"} · {fps ?? "—"} fps · 堆 {formatHeap(heap)}
      </span>
    </div>
  );
}
