import { hydrateRoot } from "react-dom/client";

import { ExplorePage } from "../components/ExplorePage";
import { ProfilePage } from "../components/ProfilePage";
import { PublicHome } from "../components/PublicHome";
import { WikiPage } from "../components/WikiPage";
import type { CardDetail, ProfileData, WorldDetail, WorldSummary } from "../types";
import { bootMotionChrome } from "../lib/motionChrome";
import "../styles/app.css";
import "../styles/auth.css";
import "../styles/legacy-workspace.css";
import "../styles/controls.css";

type InitialData =
  | {
      kind: "wiki";
      worldSlug: string;
      cardSlug?: string;
      world: WorldDetail;
      card?: CardDetail;
    }
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
    data.kind === "wiki" ? (
      <WikiPage
        worldSlug={data.worldSlug}
        cardSlug={data.cardSlug}
        session={null}
        onLogout={() => undefined}
        initialWorld={data.world}
        initialCard={data.card}
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
    ),
  );
}
