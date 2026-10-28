export type Route =
  | { kind: "public" }
  | { kind: "explore" }
  | { kind: "login" }
  | { kind: "register" }
  | { kind: "create-world" }
  | { kind: "invite"; token: string }
  | { kind: "trash" }
  | { kind: "search" }
  | { kind: "map"; worldSlug: string }
  | { kind: "timeline"; worldSlug: string }
  | { kind: "profile"; username: string }
  | { kind: "wiki"; worldSlug: string; cardSlug?: string; mode?: "read" | "cards" }
  | { kind: "workspace"; worldSlug: string; concept?: boolean }
  | { kind: "not-found" };

export function readRoute(pathname = window.location.pathname): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "public" };
  if (parts[0] === "explore") return { kind: "explore" };
  if (parts[0] === "login") return { kind: "login" };
  if (parts[0] === "register") return { kind: "register" };
  if (parts[0] === "worlds" && parts[1] === "new") return { kind: "create-world" };
  if (parts[0] === "trash") return { kind: "trash" };
  if (parts[0] === "search") return { kind: "search" };
  if (parts[0] === "invite" && parts[1]) {
    return { kind: "invite", token: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "u" && parts[1]) {
    return { kind: "profile", username: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "w" && parts[1]) {
    const worldSlug = decodeURIComponent(parts[1]);
    if (parts[2] === "map") return { kind: "map", worldSlug };
    if (parts[2] === "timeline") return { kind: "timeline", worldSlug };
    if (parts[2] === "wiki") {
      if (parts[3] === "edit") return { kind: "workspace", worldSlug, concept: true };
      if (parts[3] === "cards") return { kind: "wiki", worldSlug, mode: "cards" };
      return {
        kind: "wiki",
        worldSlug,
        cardSlug: parts[3] ? decodeURIComponent(parts[3]) : undefined,
        mode: "read",
      };
    }
    return { kind: "workspace", worldSlug };
  }
  return { kind: "not-found" };
}
