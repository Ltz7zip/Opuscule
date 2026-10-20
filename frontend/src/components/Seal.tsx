import type { ReactNode } from "react";

/** A restrained archive stamp. Use at most three per view. */
export function Seal({ children }: { children: ReactNode }) {
  return <span className="seal">{children}</span>;
}
