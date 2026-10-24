/**
 * Two small pieces of always-on feedback that do not depend on View
 * Transitions: a pointer light and a 2px scroll progress line. They respect
 * prefers-reduced-motion and never capture pointer events.
 */
export function bootMotionChrome(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const force = new URLSearchParams(window.location.search).get("motion") === "force";
  if (force) document.documentElement.classList.add("motion-force");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && !force) return;
  if ((window as Window & { __opusculeMotion?: boolean }).__opusculeMotion) return;

  const start = () => {
    const root = document.documentElement;
    const glow = document.createElement("div");
    glow.className = "pointer-glow";
    glow.setAttribute("aria-hidden", "true");
    const progress = document.createElement("div");
    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    document.body.append(glow, progress);
    (window as Window & { __opusculeMotion?: boolean }).__opusculeMotion = true;
    root.style.setProperty("--pointer-x", "50%");
    root.style.setProperty("--pointer-y", "38%");

    let frame = 0;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let x = window.innerWidth / 2;
    let y = window.innerHeight * 0.38;
    const paint = () => {
      root.style.setProperty("--pointer-x", `${x}px`);
      root.style.setProperty("--pointer-y", `${y}px`);
      glow.classList.add("is-on");
      frame = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (event.clientX === 0 && event.clientY === 0) return;
      if (lastX !== null && lastY !== null && Math.hypot(event.clientX - lastX, event.clientY - lastY) < 4) return;
      lastX = event.clientX;
      lastY = event.clientY;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const onLeave = () => { if (!frame) frame = window.requestAnimationFrame(() => { glow.classList.remove("is-on"); frame = 0; }); };

    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.transform = `scaleX(${ratio})`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
