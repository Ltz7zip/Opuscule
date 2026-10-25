import { useEffect, useState } from "react";

import PatternWaves from "./PatternWaves";

function isLight(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
}

/**
 * Page backdrop: the React Bits `Pattern Waves` surface, kept in the monochrome
 * palette and laid over the page as a fixed, non-interactive layer.  Text-heavy
 * pages pass a smaller `opacity` so the surface stays behind the copy.
 */
export default function ExploreBackdrop({ opacity = 1 }: { opacity?: number }) {
  const [light, setLight] = useState(isLight);

  useEffect(() => {
    const observer = new MutationObserver(() => setLight(isLight()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="explore-backdrop" aria-hidden="true">
      <PatternWaves
        className="explore-backdrop-waves"
        preset="silk"
        color={light ? "#18181b" : "#d4d4d8"}
        backgroundColor="rgba(0, 0, 0, 0)"
        spacing={14}
        markSize={0.95}
        depth={1.05}
        light={0}
        shine={0.8}
        contrast={1.2}
        speed={0.35}
        scale={1}
        direction={44}
        fade="edges"
        fadeSize={0.5}
        opacity={opacity}
        interactive
        cursorSize={50}
        cursorStrength={0.6}
        intro
        paused={false}
      />
    </div>
  );
}
