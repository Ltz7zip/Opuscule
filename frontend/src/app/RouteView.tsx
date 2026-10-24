import { lazy, Suspense, type ReactNode } from "react";

import type { Route } from "./routes";
import type { SessionState } from "../types";
import { StatusPage } from "../components/StatusPage";

// Every page is a lazy boundary. In particular, Workspace is the only chunk
// that pulls in Tiptap/ProseMirror, so public pages never pay that cost.
const PublicHome = lazy(() =>
  import("../components/PublicHome").then((module) => ({ default: module.PublicHome })),
);
const ExplorePage = lazy(() =>
  import("../components/ExplorePage").then((module) => ({ default: module.ExplorePage })),
);
const LoginPage = lazy(() =>
  import("../components/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("../components/RegisterPage").then((module) => ({ default: module.RegisterPage })),
);
const CreateWorldPage = lazy(() =>
  import("../components/CreateWorldPage").then((module) => ({ default: module.CreateWorldPage })),
);
const InvitePage = lazy(() =>
  import("../components/InvitePage").then((module) => ({ default: module.InvitePage })),
);
const TrashPage = lazy(() =>
  import("../components/TrashPage").then((module) => ({ default: module.TrashPage })),
);
const SearchPage = lazy(() =>
  import("../components/SearchPage").then((module) => ({ default: module.SearchPage })),
);
const MapPage = lazy(() =>
  import("../components/MapPage").then((module) => ({ default: module.MapPage })),
);
const TimelinePage = lazy(() =>
  import("../components/TimelinePage").then((module) => ({ default: module.TimelinePage })),
);
const ProfilePage = lazy(() =>
  import("../components/ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const WikiPage = lazy(() =>
  import("../components/WikiPage").then((module) => ({ default: module.WikiPage })),
);
const Workspace = lazy(() =>
  import("../components/Workspace").then((module) => ({ default: module.Workspace })),
);

interface RouteViewProps {
  route: Route;
  session: SessionState | null;
  onLogin: (session: SessionState) => void;
  onLogout: () => void;
}

export function RouteView({ route, session, onLogin, onLogout }: RouteViewProps) {
  let page: ReactNode;
  switch (route.kind) {
    case "public":
      page = <PublicHome session={session} onLogout={onLogout} />;
      break;
    case "explore":
      page = <ExplorePage session={session} onLogout={onLogout} />;
      break;
    case "login":
      page = <LoginPage session={session} onLogin={onLogin} />;
      break;
    case "register":
      page = <RegisterPage session={session} onLogin={onLogin} />;
      break;
    case "create-world":
      page = <CreateWorldPage session={session} onLogout={onLogout} />;
      break;
    case "invite":
      page = <InvitePage token={route.token} session={session} onLogout={onLogout} />;
      break;
    case "trash":
      page = <TrashPage session={session} onLogout={onLogout} />;
      break;
    case "search":
      page = <SearchPage session={session} onLogout={onLogout} />;
      break;
    case "map":
      page = <MapPage worldSlug={route.worldSlug} session={session} onLogout={onLogout} />;
      break;
    case "timeline":
      page = <TimelinePage worldSlug={route.worldSlug} session={session} onLogout={onLogout} />;
      break;
    case "profile":
      page = <ProfilePage username={route.username} session={session} onLogout={onLogout} />;
      break;
    case "wiki":
      page = (
        <WikiPage
          worldSlug={route.worldSlug}
          cardSlug={route.cardSlug}
          session={session}
          onLogout={onLogout}
        />
      );
      break;
    case "workspace":
      page = <Workspace worldSlug={route.worldSlug} session={session} onLogout={onLogout} />;
      break;
    case "not-found":
      page = <StatusPage variant="404" />;
      break;
    default:
      page = <StatusPage variant="404" />;
  }

  return (
    <Suspense
      fallback={
        <div className="route-loading">
          <span className="route-loading-mark" aria-hidden="true" />
          正在加载页面…
        </div>
      }
    >
      {page}
    </Suspense>
  );
}
