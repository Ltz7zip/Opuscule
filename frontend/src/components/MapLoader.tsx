import type { ReactNode } from "react";

import Topography from "./Topography";

interface MapLoaderProps {
  label: string;
  /** Bottom-left machine readout; hidden when omitted. */
  hud?: ReactNode;
  detail?: string;
  /** 0–100 for a determinate bar, `null` for an indeterminate sweep. */
  progress?: number | null;
}

/**
 * Full-screen loading screen for the map.
 *
 * The background is the React Bits `Topography` scene (real WebGL terrain with
 * bloom); the splash is always dark so the blue relief reads the way the
 * reference does, and the hairline progress bar uses the light ink colour.
 */
export default function MapLoader({ label, detail = "", progress = null, hud = null }: MapLoaderProps) {
  const determinate = progress !== null;
  const percent = determinate ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <div
      className="map-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-indeterminate={determinate ? "false" : "true"}
    >
      {/* React Bits "Mono" preset, values taken from the playground. */}
      <Topography
        className="map-loader-topography"
        color="#d4d4d8"
        lineCount={22}
        lineWidth={1}
        elevation={1}
        foreground={0.2}
        scale={1}
        detail={0.35}
        tilt={32}
        speed={0.25}
        direction="forward"
        morph={0.2}
        glow={0.15}
        depthOfField={0}
        fog={0.35}
        brightness={1.1}
        glitch={0.17}
        mouseInteraction
        hoverEffect="light"
        mouseRadius={1}
        mouseStrength={0.6}
        trail={0.3}
        parallax={0.5}
        clickEffect="pulse"
        markers="none"
        intro
        lightMode={false}
        dpr={1.5}
      />
      <div className="map-loader-scrim" aria-hidden="true" />
      {hud}
      <div className="map-loader-centre">
        <span className="map-loader-eyebrow">Terrain Web</span>
        <strong className="map-loader-label">{label}</strong>
        <div
          className="map-loader-track"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          <span className="map-loader-fill" style={determinate ? { width: `${percent ?? 0}%` } : undefined} />
        </div>
        <div className="map-loader-meta">
          <span>{detail || (determinate ? "处理中…" : "准备中…")}</span>
          <span>{percent === null ? "" : `${percent}%`}</span>
        </div>
      </div>
    </div>
  );
}
