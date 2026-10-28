import { createRoot, hydrateRoot } from "react-dom/client";

import App from "../App";

import { ExplorePage } from "../components/ExplorePage";
import { ProfilePage } from "../components/ProfilePage";
import { PublicHome } from "../components/PublicHome";
import { WikiPage } from "../components/WikiPage";
import { WorldConceptPage } from "../components/WorldConceptPage";
import type { CardDetail, ProfileData, WorldConcept, WorldDetail, WorldSummary } from "../types";
import { bootMotionChrome } from "../lib/motionChrome";
import { CursorTrail } from "../components/CursorTrail";
import "../styles/app.css";
import "../styles/auth.css";
import "../styles/legacy-workspace.css";
import "../styles/controls.css";
import "../styles/world-concept.css";

type InitialData =
  | {
      kind: "wiki";
      worldSlug: string;
      cardSlug?: string;
      mode?: "read" | "cards";
      world: WorldDetail;
      card?: CardDetail;
      concept?: WorldConcept;
    }
  | { kind: "concept"; worldSlug: string; world: WorldDetail; concept: WorldConcept }
  | { kind: "explore"; worlds: WorldSummary[] }
  | { kind: "profile"; username: string; profile: ProfileData }
  | { kind: "home"; world: WorldDetail };

declare global {
  interface Window {
    __INITIAL__?: InitialData;
  }
}

const data = window.__INITIAL__;
const root = document.getElementById("root");

bootMotionChrome();

if (data && root) {
  if ((document as Document & { startViewTransition?: unknown }).startViewTransition === undefined) {
    document.documentElement.dataset.motion = "css";
  }

  hydrateRoot(
    root,
    <>
      {data.kind === "wiki" ? (
      <WikiPage
        worldSlug={data.worldSlug}
        cardSlug={data.cardSlug}
        mode={data.mode}
        session={null}
        onLogout={() => undefined}
        initialWorld={data.world}
        initialCard={data.card}
        initialConcept={data.concept}
      />
    ) : data.kind === "concept" ? (
      <WorldConceptPage
        worldSlug={data.worldSlug}
        session={null}
        onLogout={() => undefined}
        initialWorld={data.world}
        initialConcept={data.concept}
      />
    ) : data.kind === "explore" ? (
      <ExplorePage session={null} onLogout={() => undefined} initialWorlds={data.worlds} />
    ) : data.kind === "profile" ? (
      <ProfilePage
        username={data.username}
        session={null}
        onLogout={() => undefined}
        initialProfile={data.profile}
      />
    ) : (
      <PublicHome session={null} onLogout={() => undefined} initialWorld={data.world} />
      )}
      <CursorTrail />
    </>,
  );
} else if (root) {
  // Private/member pages are client-rendered: no public SSR data exists, so
  // mount the normal app router and let it fetch with the session.
  createRoot(root).render(<App />);
}
