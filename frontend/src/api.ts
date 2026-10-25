import type {
  CardComment,
  CardDetail,
  CardRevisionDetail,
  CardRevisionSummary,
  CollectionNode,
  ImportHistoryEntry,
  InviteInfo,
  MapData,
  MapMarker,
  TerrainWebResult,
  TerrainWebStyle,
  NotificationItem,
  ProfileData,
  SearchResponse,
  SessionState,
  TrashCard,
  TimelineData,
  TimelineEntry,
  TimelineEra,
  TimelineSummary,
  WorldAuditEvent,
  WorldInvite,
  WorldMember,
  TiptapDoc,
  WorldDetail,
  WorldSummary,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

let csrfToken: string | null = null;

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function messageFrom(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `请求失败（${status}）`;
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(`${BASE}/auth/csrf/`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data, messageFrom(data, response.status));
  }
  csrfToken = (data as { csrfToken: string }).csrfToken;
  return csrfToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRFToken"] = csrfToken ?? (await fetchCsrfToken());
  }

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data, messageFrom(data, response.status));
  }
  return data as T;
}

export function fetchSession(): Promise<SessionState> {
  return request<SessionState>("/auth/session/");
}

export async function login(username: string, password: string): Promise<SessionState> {
  const session = await request<SessionState>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  csrfToken = null;
  await fetchCsrfToken().catch(() => undefined);
  return session;
}

export async function logout(): Promise<void> {
  await request<null>("/auth/logout/", { method: "POST", body: "{}" });
  csrfToken = null;
}

export function fetchWorlds(): Promise<WorldSummary[]> {
  return request<WorldSummary[]>("/worlds/");
}

export function fetchWorld(slug: string): Promise<WorldDetail> {
  return request<WorldDetail>(`/worlds/${encodeURIComponent(slug)}/`);
}

export function fetchCard(world: string, id: number): Promise<CardDetail> {
  return request<CardDetail>(`/worlds/${encodeURIComponent(world)}/cards/${id}/`);
}

export function updateCard(
  world: string,
  id: number,
  payload: {
    title?: string;
    icon?: string;
    cover?: string;
    body_json?: TiptapDoc;
    home_collection?: number | null;
    is_public?: boolean;
    type_key?: string;
    pinned?: boolean;
    era?: string;
  },
): Promise<CardDetail> {
  return request<CardDetail>(`/worlds/${encodeURIComponent(world)}/cards/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createCard(
  world: string,
  payload: {
    title: string;
    home_collection: number | null;
    body_json?: TiptapDoc;
    type_key?: string;
    icon?: string;
    cover?: string;
    is_public?: boolean;
    pinned?: boolean;
    era?: string;
  },
): Promise<CardDetail> {
  return request<CardDetail>(`/worlds/${encodeURIComponent(world)}/cards/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createCollection(
  world: string,
  payload: { name: string; parent?: number | null },
): Promise<CollectionNode> {
  return request<CollectionNode>(`/worlds/${encodeURIComponent(world)}/collections/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function fetchProfile(username: string): Promise<ProfileData> {
  return request<ProfileData>(`/u/${encodeURIComponent(username)}/`);
}

export function fetchMyProfile(): Promise<ProfileData> {
  return request<ProfileData>("/profile/");
}

export function updateMyProfile(payload: {
  display_name?: string;
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  links?: Array<{ label: string; url: string }>;
  pinned?: number[];
  is_public?: boolean;
}): Promise<ProfileData> {
  return request<ProfileData>("/profile/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}


export function fetchExplore(): Promise<WorldSummary[]> {
  return request<WorldSummary[]>("/explore/");
}

export function fetchCardBySlug(world: string, slug: string): Promise<CardDetail> {
  return request<CardDetail>(
    `/worlds/${encodeURIComponent(world)}/cards/by-slug/${encodeURIComponent(slug)}/`,
  );
}

export async function register(
  username: string,
  password: string,
  display_name: string,
): Promise<SessionState> {
  const session = await request<SessionState>("/auth/register/", {
    method: "POST",
    body: JSON.stringify({ username, password, display_name }),
  });
  csrfToken = null;
  await fetchCsrfToken().catch(() => undefined);
  return session;
}


export function createWorld(payload: {
  name: string;
  description?: string;
  is_public_read?: boolean;
}): Promise<WorldDetail> {
  return request<WorldDetail>("/worlds/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorld(
  slug: string,
  payload: { name?: string; description?: string; is_public_read?: boolean },
): Promise<WorldDetail> {
  return request<WorldDetail>(`/worlds/${encodeURIComponent(slug)}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}


export function fetchWorldMembers(slug: string): Promise<WorldMember[]> {
  return request<WorldMember[]>(`/worlds/${encodeURIComponent(slug)}/members/`);
}

export function addWorldMember(
  slug: string,
  username: string,
  role: "editor" | "viewer",
): Promise<WorldMember> {
  return request<WorldMember>(`/worlds/${encodeURIComponent(slug)}/members/`, {
    method: "POST",
    body: JSON.stringify({ username, role }),
  });
}

export function updateWorldMember(
  slug: string,
  memberId: number,
  role: "editor" | "viewer",
): Promise<WorldMember> {
  return request<WorldMember>(
    `/worlds/${encodeURIComponent(slug)}/members/${memberId}/`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeWorldMember(slug: string, memberId: number): Promise<void> {
  return request<void>(`/worlds/${encodeURIComponent(slug)}/members/${memberId}/`, {
    method: "DELETE",
  });
}


export function fetchWorldInvites(slug: string): Promise<WorldInvite[]> {
  return request<WorldInvite[]>(`/worlds/${encodeURIComponent(slug)}/invites/`);
}

export function createWorldInvite(
  slug: string,
  role: "editor" | "viewer",
): Promise<WorldInvite> {
  return request<WorldInvite>(`/worlds/${encodeURIComponent(slug)}/invites/`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function revokeWorldInvite(slug: string, inviteId: number): Promise<void> {
  return request<void>(`/worlds/${encodeURIComponent(slug)}/invites/${inviteId}/`, {
    method: "DELETE",
  });
}

export function fetchInvite(token: string): Promise<InviteInfo> {
  return request<InviteInfo>(`/invites/${encodeURIComponent(token)}/`);
}

export function acceptInvite(token: string): Promise<{
  already_member: boolean;
  world: { slug: string; name: string };
  role: string;
}> {
  return request(`/invites/${encodeURIComponent(token)}/accept/`, { method: "POST" });
}


export function transferOwnership(slug: string, username: string): Promise<WorldDetail> {
  return request<WorldDetail>(
    `/worlds/${encodeURIComponent(slug)}/transfer-ownership/`,
    { method: "POST", body: JSON.stringify({ username }) },
  );
}

export function deleteWorld(slug: string): Promise<void> {
  return request<void>(`/worlds/${encodeURIComponent(slug)}/`, { method: "DELETE" });
}

export function fetchTrash(): Promise<WorldSummary[]> {
  return request<WorldSummary[]>("/worlds/trash/");
}

export function restoreWorld(slug: string): Promise<WorldDetail> {
  return request<WorldDetail>(`/worlds/${encodeURIComponent(slug)}/restore/`, {
    method: "POST",
  });
}


export function fetchWorldAudit(slug: string, action?: string): Promise<WorldAuditEvent[]> {
  const params = action ? `?${new URLSearchParams({ action }).toString()}` : "";
  return request<WorldAuditEvent[]>(`/worlds/${encodeURIComponent(slug)}/audit/${params}`);
}


export function searchCards(query: string, offset = 0): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (offset > 0) params.set("offset", String(offset));
  return request<SearchResponse>(`/search/?${params.toString()}`);
}


export function fetchWorldMap(slug: string): Promise<MapData> {
  // The payload carries the field cache token, so it must never be served
  // from a heuristic HTTP cache after a terrain regeneration.
  return request<MapData>(`/worlds/${encodeURIComponent(slug)}/map/`, { cache: "no-store" });
}

export async function fetchMapFields(slug: string, version: string): Promise<ArrayBuffer> {
  const response = await fetch(
    `${BASE}/worlds/${encodeURIComponent(slug)}/map/fields/?v=${encodeURIComponent(version)}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = null;
    }
    throw new ApiError(response.status, detail, messageFrom(detail, response.status));
  }
  return response.arrayBuffer();
}

export function createMapMarker(
  slug: string,
  input: {
    label: string;
    kind: MapMarker["kind"];
    x: number;
    y: number;
    card?: number | null;
  },
): Promise<MapMarker> {
  return request<MapMarker>(`/worlds/${encodeURIComponent(slug)}/map/markers/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMapMarker(
  slug: string,
  markerId: number,
  input: { x?: number; y?: number; label?: string; kind?: MapMarker["kind"]; card?: number | null },
): Promise<MapMarker> {
  return request<MapMarker>(`/worlds/${encodeURIComponent(slug)}/map/markers/${markerId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMapMarker(slug: string, markerId: number): Promise<void> {
  return request<void>(`/worlds/${encodeURIComponent(slug)}/map/markers/${markerId}/`, {
    method: "DELETE",
  });
}

export async function exportWorld(slug: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${BASE}/worlds/${encodeURIComponent(slug)}/export/`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new ApiError(response.status, null, "世界导出失败");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${slug}-export.zip`;
  return { blob, filename };
}

export async function importWorld(file: File): Promise<WorldDetail> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/worlds/import/`, {
    method: "POST",
    body,
    credentials: "same-origin",
    headers: { "X-CSRFToken": csrfToken ?? (await fetchCsrfToken()) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : "导入世界失败";
    throw new ApiError(response.status, data, message);
  }
  return data as WorldDetail;
}

export async function exportWorldAudit(
  slug: string,
  action?: string,
): Promise<{ blob: Blob; filename: string }> {
  const query = action ? `?${new URLSearchParams({ action }).toString()}` : "";
  const response = await fetch(`${BASE}/worlds/${encodeURIComponent(slug)}/audit/export/${query}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new ApiError(response.status, null, "活动记录导出失败");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${slug}-audit.csv`;
  return { blob, filename };
}


export function fetchImportHistory(): Promise<ImportHistoryEntry[]> {
  return request<ImportHistoryEntry[]>("/worlds/imports/");
}

export async function undoImport(slug: string): Promise<void> {
  await request<null>(`/worlds/${encodeURIComponent(slug)}/undo-import/`, {
    method: "POST",
    body: "{}",
  });
}


export function fetchWorldTimeline(slug: string, timelineSlug?: string): Promise<TimelineData> {
  const query = timelineSlug ? `?timeline=${encodeURIComponent(timelineSlug)}` : "";
  return request<TimelineData>(`/worlds/${encodeURIComponent(slug)}/timeline/${query}`);
}

export async function createTimeline(
  slug: string,
  input: { name: string; slug: string; color?: string; is_default?: boolean },
): Promise<TimelineSummary> {
  return request<TimelineSummary>(`/worlds/${encodeURIComponent(slug)}/timelines/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createTimelineEntry(
  slug: string,
  input: { year: number; month?: number | null; end_year?: number | null; era: string; title: string; description: string; card?: number | null; timeline?: number | null },
): Promise<TimelineEntry> {
  return request<TimelineEntry>(`/worlds/${encodeURIComponent(slug)}/timeline/entries/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTimelineEntry(slug: string, entryId: number): Promise<void> {
  return request<void>(`/worlds/${encodeURIComponent(slug)}/timeline/entries/${entryId}/`, {
    method: "DELETE",
  });
}

export function updateTimelineEntry(
  slug: string,
  entryId: number,
  input: { year?: number; end_year?: number | null; era?: string; title?: string; description?: string; card?: number | null },
): Promise<TimelineEntry> {
  return request<TimelineEntry>(`/worlds/${encodeURIComponent(slug)}/timeline/entries/${entryId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}


export async function generateTerrainWeb(
  slug: string,
  input: {
    seed?: number;
    style?: TerrainWebStyle;
    bake_labels?: boolean;
    width?: number;
    height?: number;
    label_count?: number;
  },
): Promise<TerrainWebResult> {
  return request<TerrainWebResult>(`/worlds/${encodeURIComponent(slug)}/map/terrain-web/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadWorldMapBackground(
  slug: string,
  file: File,
): Promise<{ background_url: string }> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${BASE}/worlds/${encodeURIComponent(slug)}/map/background/`, {
    method: "POST",
    body,
    credentials: "same-origin",
    headers: { "X-CSRFToken": csrfToken ?? (await fetchCsrfToken()) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data, messageFrom(data, response.status));
  }
  return data as { background_url: string };
}

export async function clearWorldMapBackground(slug: string): Promise<void> {
  await request<null>(`/worlds/${encodeURIComponent(slug)}/map/background/`, {
    method: "DELETE",
    body: "{}",
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<null>("/auth/password/", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function uploadCardImage(
  slug: string,
  cardId: number,
  file: File,
): Promise<{ id: number; url: string }> {
  const body = new FormData();
  body.append("file", file);
  const headers: Record<string, string> = { "X-CSRFToken": csrfToken ?? (await fetchCsrfToken()) };
  const response = await fetch(`${BASE}/worlds/${encodeURIComponent(slug)}/cards/${cardId}/images/`, {
    method: "POST",
    body,
    credentials: "same-origin",
    headers,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data, messageFrom(data, response.status));
  }
  return data as { id: number; url: string };
}


export async function createEra(slug: string, input: {
  name: string;
  start_year: number;
  end_year: number;
  color: string;
}): Promise<import("./types").TimelineEra> {
  return request<TimelineEra>(`/worlds/${encodeURIComponent(slug)}/eras/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEra(slug: string, id: number, input: Partial<{
  name: string;
  start_year: number;
  end_year: number;
  color: string;
}>): Promise<import("./types").TimelineEra> {
  return request<TimelineEra>(`/worlds/${encodeURIComponent(slug)}/eras/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEra(slug: string, id: number): Promise<void> {
  await request<void>(`/worlds/${encodeURIComponent(slug)}/eras/${id}/`, { method: "DELETE" });
}


export async function listCardImages(slug: string, cardId: number): Promise<import("./types").CardImageAsset[]> {
  return request<import("./types").CardImageAsset[]>(`/worlds/${encodeURIComponent(slug)}/cards/${cardId}/images/`);
}


export async function fetchCardComments(slug: string, cardId: number): Promise<CardComment[]> {
  return request<CardComment[]>(`/worlds/${encodeURIComponent(slug)}/cards/${cardId}/comments/`);
}

export async function createCardComment(
  slug: string,
  cardId: number,
  input: { body: string; quote?: string; anchor_id?: string; parent?: number },
): Promise<CardComment> {
  return request<CardComment>(`/worlds/${encodeURIComponent(slug)}/cards/${cardId}/comments/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCardComment(
  slug: string,
  cardId: number,
  commentId: number,
  input: { resolved?: boolean; body?: string },
): Promise<CardComment> {
  return request<CardComment>(`/worlds/${encodeURIComponent(slug)}/cards/${cardId}/comments/${commentId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCardComment(slug: string, cardId: number, commentId: number): Promise<void> {
  await request<void>(`/worlds/${encodeURIComponent(slug)}/cards/${cardId}/comments/${commentId}/`, { method: "DELETE" });
}


export async function fetchNotifications(): Promise<NotificationItem[]> {
  return request<NotificationItem[]>("/notifications/");
}

export async function markNotificationRead(id: number): Promise<NotificationItem> {
  return request<NotificationItem>(`/notifications/${id}/read/`, { method: "POST", body: "{}" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request<{ ok: boolean }>("/notifications/read-all/", { method: "POST", body: "{}" });
}


export function deleteCard(world: string, id: number): Promise<void> {
  return request<null>(`/worlds/${encodeURIComponent(world)}/cards/${id}/`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function fetchCardTrash(world: string): Promise<{ count: number; cards: TrashCard[] }> {
  return request<{ count: number; cards: TrashCard[] }>(`/worlds/${encodeURIComponent(world)}/cards/trash/`);
}

export function purgeCard(world: string, id: number): Promise<void> {
  return request<null>(`/worlds/${encodeURIComponent(world)}/cards/${id}/purge/`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function restoreCard(world: string, id: number): Promise<CardDetail> {
  return request<CardDetail>(`/worlds/${encodeURIComponent(world)}/cards/${id}/restore/`, {
    method: "POST",
    body: "{}",
  });
}

export function fetchCardRevisions(
  world: string,
  id: number,
): Promise<{ card: { id: number; title: string; revision: number }; versions: CardRevisionSummary[] }> {
  return request(`/worlds/${encodeURIComponent(world)}/cards/${id}/revisions/`);
}

export function fetchCardRevision(world: string, id: number, index: number): Promise<CardRevisionDetail> {
  return request<CardRevisionDetail>(`/worlds/${encodeURIComponent(world)}/cards/${id}/revisions/${index}/`);
}

export function restoreCardRevision(world: string, id: number, index: number): Promise<CardDetail> {
  return request<CardDetail>(`/worlds/${encodeURIComponent(world)}/cards/${id}/revisions/${index}/restore/`, {
    method: "POST",
    body: "{}",
  });
}
