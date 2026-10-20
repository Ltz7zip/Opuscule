import { useEffect, useState } from "react";

import { fetchSession, logout as apiLogout } from "./api";
import { RouteView } from "./app/RouteView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DialogHost } from "./components/DialogHost";
import { readRoute, type Route } from "./app/routes";
import type { SessionState } from "./types";

const anonymous: SessionState = { authenticated: false, user: null, worlds: [] };

export default function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch(() => {
        if (!cancelled) setSession(anonymous);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      setSession(anonymous);
      window.location.assign("/");
    }
  };

  return (
    <ErrorBoundary>
      <RouteView
        route={route}
        session={session}
        onLogin={setSession}
        onLogout={handleLogout}
      />
      <DialogHost />
    </ErrorBoundary>
  );
}
