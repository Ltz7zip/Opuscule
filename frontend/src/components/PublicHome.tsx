import type { SessionState, WorldDetail } from "../types";
import { WikiPage } from "./WikiPage";

interface PublicHomeProps {
  session: SessionState | null;
  onLogout: () => void;
  initialWorld?: WorldDetail;
}

/**
 * The legacy site has no anonymous marketing home: the reader-facing root is
 * the world's Wiki home. Keep the new "/" route and render the same 0.8.1
 * world home used by /w/<slug>/wiki.
 */
export function PublicHome({ session, onLogout, initialWorld }: PublicHomeProps) {
  return (
    <WikiPage
      worldSlug="wuhai"
      session={session}
      onLogout={onLogout}
      initialWorld={initialWorld}
      home
    />
  );
}
