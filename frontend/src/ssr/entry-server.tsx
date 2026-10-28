import { renderToString } from "react-dom/server";

import { ExplorePage } from "../components/ExplorePage";
import { ProfilePage } from "../components/ProfilePage";
import { PublicHome } from "../components/PublicHome";
import { StatusPage, type StatusVariant } from "../components/StatusPage";
import { WikiPage } from "../components/WikiPage";
import { WorldConceptPage } from "../components/WorldConceptPage";
import type { CardDetail, ProfileData, WorldConcept, WorldDetail, WorldSummary } from "../types";

export interface WikiSsrData {
  worldSlug: string;
  cardSlug?: string;
  mode?: "read" | "cards";
  world: WorldDetail;
  card?: CardDetail;
  concept?: WorldConcept;
}

export function renderWiki(data: WikiSsrData): string {
  return renderToString(
    <WikiPage
      worldSlug={data.worldSlug}
      cardSlug={data.cardSlug}
      session={null}
      onLogout={() => undefined}
      initialWorld={data.world}
      initialCard={data.card}
      initialConcept={data.concept}
      mode={data.mode}
    />,
  );
}


export interface WorldConceptSsrData {
  worldSlug: string;
  world: WorldDetail;
  concept: WorldConcept;
}

export function renderWorldConcept(data: WorldConceptSsrData): string {
  return renderToString(
    <WorldConceptPage
      worldSlug={data.worldSlug}
      session={null}
      onLogout={() => undefined}
      initialWorld={data.world}
      initialConcept={data.concept}
    />,
  );
}


export interface ExploreSsrData {
  worlds: WorldSummary[];
}

export function renderExplore(data: ExploreSsrData): string {
  return renderToString(
    <ExplorePage session={null} onLogout={() => undefined} initialWorlds={data.worlds} />,
  );
}


export interface ProfileSsrData {
  username: string;
  profile: ProfileData;
}

export function renderProfile(data: ProfileSsrData): string {
  return renderToString(
    <ProfilePage
      username={data.username}
      session={null}
      onLogout={() => undefined}
      initialProfile={data.profile}
    />,
  );
}


export interface HomeSsrData {
  world: WorldDetail;
}

export function renderHome(data: HomeSsrData): string {
  return renderToString(
    <PublicHome session={null} onLogout={() => undefined} initialWorld={data.world} />,
  );
}

export function renderStatus(
  variant: StatusVariant,
  backHref = "/",
  backLabel = "返回首页",
): string {
  return renderToString(
    <StatusPage variant={variant} backHref={backHref} backLabel={backLabel} />,
  );
}
