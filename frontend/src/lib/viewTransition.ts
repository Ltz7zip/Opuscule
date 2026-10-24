import { useCallback, useRef, type CSSProperties } from "react";
import { flushSync } from "react-dom";

export type VtKind = "cover" | "icon" | "avatar" | "title";

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

/** The single naming authority. Both sides of a morph must call this. */
export function vtName(kind: VtKind, id: string): string {
  return `vt-${kind}-${safe(id)}`;
}

/**
 * Static target naming. Render it in the component output (including SSR):
 * a name attached from useEffect is too late for the new-page snapshot.
 */
export function vt(kind: VtKind, id: string): CSSProperties {
  return {
    viewTransitionName: vtName(kind, id),
    // React 19 drops this key (verified in Chrome); refs below set it
    // imperatively before the snapshot. Kept here as the declarative intent.
    viewTransitionClass: kind,
  } as CSSProperties;
}

/** Ref callback that writes the class React cannot. `active` false clears it. */
export function vtClassRef(kind: VtKind, active = true) {
  return (node: HTMLElement | null) => {
    if (!node) return;
    if (active) node.style.setProperty("view-transition-class", kind);
    else node.style.removeProperty("view-transition-class");
  };
}

/** Static target: name in SSR style + class set on hydration. */
export function useVtTarget(kind: VtKind, id: string): {
  ref: (node: HTMLElement | null) => void;
  style: CSSProperties;
} {
  const ref = useCallback((node: HTMLElement | null) => {
    if (node) node.style.setProperty("view-transition-class", kind);
  }, [kind]);
  return { ref, style: vt(kind, id) };
}

/**
 * Run a same-document state change as a view transition when the browser can,
 * and as a plain synchronous commit otherwise. `onDone` lets the caller clear
 * transient target names once the snapshots settle.
 */
export function runViewTransition(
  commit: () => void,
  onDone?: () => void,
  source?: HTMLElement | null,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    commit();
    onDone?.();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("startViewTransition" in document) || reduce || document.hidden) {
    clearVt(source);
    if (!reduce && !document.hidden) {
      const root = document.documentElement;
      root.classList.remove("vt-fallback");
      void root.offsetWidth;
      root.classList.add("vt-fallback");
      commit();
      window.setTimeout(() => root.classList.remove("vt-fallback"), 260);
    } else {
      commit();
    }
    onDone?.();
    return;
  }
  try {
    const transition = document.startViewTransition(() => {
      // Runs after the old snapshot. Removing the source name here keeps the
      // new snapshot free of duplicate names even if focus re-named the row.
      clearVt(source);
      flushSync(commit);
    });
    transition.finished
      .catch(() => undefined)
      .finally(() => {
        clearVt(source);
        onDone?.();
      });
  } catch {
    clearVt(source);
    commit();
    onDone?.();
  }
}

/**
 * Hover/focus source naming. A list page must never statically name its rows:
 * only the row the pointer or keyboard is on may carry the name, so the
 * document never contains two elements with the same view-transition-name.
 * Spread the handlers on the interactive ancestor and put `ref` on the leaf.
 */
export function useSharedSource<T extends HTMLElement = HTMLElement>(
  kind: VtKind,
  id: string,
): {
  ref: React.RefObject<T | null>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onTouchStart: () => void;
  onPointerCancel: () => void;
} {
  const ref = useRef<T>(null);
  const name = vtName(kind, id);
  const set = () => {
    if (!ref.current) return;
    ref.current.style.viewTransitionName = name;
    ref.current.style.setProperty("view-transition-class", kind);
  };
  const clear = () => {
    if (!ref.current) return;
    ref.current.style.viewTransitionName = "";
    ref.current.style.removeProperty("view-transition-class");
  };
  return {
    ref,
    onPointerEnter: set,
    onPointerLeave: clear,
    onFocus: set,
    onBlur: clear,
    onTouchStart: set,
    onPointerCancel: clear,
  };
}

/** Clear a transient name set imperatively inside a transition callback. */
export function clearVt(element: HTMLElement | null | undefined): void {
  if (!element) return;
  element.style.viewTransitionName = "";
  element.style.removeProperty("view-transition-class");
}
