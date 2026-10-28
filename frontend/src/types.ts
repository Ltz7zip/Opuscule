export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
};

export type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
} & Record<string, unknown>;

export interface SessionUser {
  id: number;
  username: string;
}

export interface SessionWorld {
  slug: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export interface SessionState {
  authenticated: boolean;
  user: SessionUser | null;
  worlds: SessionWorld[];
}

export interface WorldSummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  kind: "shared" | "private";
  is_public_read: boolean;
  published_at: string | null;
  theme_json: Record<string, unknown>;
  role: "owner" | "editor" | "viewer" | null;
  can_edit: boolean;
  card_count: number;
  collection_count: number;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CollectionNode {
  id: number;
  parent: number | null;
  name: string;
  slug: string;
  position_key: string;
  icon: string;
  description: string;
  is_public: boolean;
  card_count: number;
  children_count: number;
  created_at: string;
  updated_at: string;
}

export interface CardSummary {
  id: number;
  kind: "content" | "tool";
  type_key: string;
  title: string;
  slug: string;
  icon: string;
  cover: string;
  home_collection: number | null;
  is_public: boolean;
  is_auxiliary: boolean;
  body_text: string;
  revision: number;
  pinned: boolean;
  era: string;
  updated_at: string;
}

export interface CardDetail extends CardSummary {
  body_json: TiptapDoc;
  body_text: string;
  presence_json: Record<string, unknown>;
  created_at: string;
}

export interface WorldDetail extends WorldSummary {
  collections: CollectionNode[];
  cards: CardSummary[];
}


export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileWorld {
  id: number;
  slug: string;
  name: string;
  description: string;
  kind: "shared" | "private";
  card_count: number;
}

export interface ProfileCard {
  id: number;
  title: string;
  slug: string;
  type_key: string;
  excerpt: string;
  world_slug: string;
  world_name: string;
}

export interface ProfileData {
  username: string;
  name: string;
  display_name: string;
  headline: string;
  bio: string;
  location: string;
  website: string;
  links: ProfileLink[];
  pinned: number[];
  is_public: boolean;
  accent: string;
  avatar_initial: string;
  is_owner: boolean;
  pinned_worlds: ProfileWorld[];
  worlds: ProfileWorld[];
  recent_cards: ProfileCard[];
  stats: { worlds: number; cards: number };
}


export interface WorldMember {
  id: number;
  user_id: number;
  username: string;
  display_name: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}


export interface WorldInvite {
  id: number;
  token: string;
  role: "editor" | "viewer";
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked_at: string | null;
  created_at: string;
}

export interface InviteInfo {
  world: { slug: string; name: string };
  role: "editor" | "viewer";
  valid: boolean;
  reason: string;
  expires_at: string;
  already_member: boolean;
}


export interface WorldAuditEvent {
  id: number;
  action: string;
  action_label: string;
  actor_username: string | null;
  target_username: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}


export interface SearchResult {
  world_slug: string;
  world_name: string;
  card_slug: string;
  title: string;
  type_key: string;
  snippet: string;
  updated_at: string;
}

export interface SearchWorldResult {
  slug: string;
  name: string;
  description: string;
  kind: string;
  updated_at: string;
}

export interface SearchUserResult {
  username: string;
  display_name: string;
  headline: string;
}

export interface SearchConceptResult {
  world_slug: string;
  world_name: string;
  title: string;
  snippet: string;
  revision: number;
  published_at: string;
}

export interface SearchResponse {
  query: string;
  worlds: SearchWorldResult[];
  users: SearchUserResult[];
  concepts: SearchConceptResult[];
  results: SearchResult[];
  total: number;
  has_more: boolean;
}


export interface MapMarker {
  id: number;
  label: string;
  kind: "place" | "city" | "event" | "character" | "note";
  x: number;
  y: number;
  card: number | null;
  card_title: string | null;
  card_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface MapData {
  world: { slug: string; name: string };
  can_edit: boolean;
  background_url: string | null;
  terrain_web: TerrainWebMeta | null;
  /** Cache key of the packed field payload, null when there is no terrain. */
  fields_version: string | null;
  markers: MapMarker[];
}

export type TerrainWebStyle = "atlas" | "parchment" | "topographic";

export interface TerrainWebLabel {
  name: string;
  x: number;
  y: number;
  kind: string;
}

export interface TerrainWebMeta {
  seed: number;
  style: TerrainWebStyle;
  width: number;
  height: number;
  elapsed_ms: number;
  labels: TerrainWebLabel[];
  bake_labels: boolean;
  heightmap?: string;
  heightmap_width?: number;
  heightmap_height?: number;
  sea_level?: number;
  mesh?: string;
  mesh_width?: number;
  mesh_height?: number;
  texture?: string;
  texture_width?: number;
  texture_height?: number;
  generated_at?: string;
}

export interface TerrainWebResult extends TerrainWebMeta {
  background_url: string;
  prototype: boolean;
}


export interface ImportHistoryEntry {
  world: { slug: string; name: string; deleted_at: string | null };
  imported_at: string;
  filename: string | null;
  can_undo: boolean;
}


export interface TimelineEntry {
  id: number;
  timeline: number | null;
  year: number;
  month: number | null;
  end_year: number | null;
  era: string;
  title: string;
  description: string;
  card: number | null;
  card_title: string | null;
  card_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  kind: string;
  message: string;
  actor_name: string | null;
  card_title: string | null;
  card_slug: string | null;
  card_id: number | null;
  world_slug: string | null;
  read_at: string | null;
  created_at: string;
}

export interface CardComment {
  id: number;
  body: string;
  quote: string;
  anchor_id: string;
  resolved: boolean;
  parent: number | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export type WorldMediaReferenceKind = "card" | "concept";

export interface WorldMediaReference {
  kind: WorldMediaReferenceKind;
  id: number;
  title: string;
  field: string;
}

/** A world-wide image asset shared by the card and concept editors. */
export interface WorldMediaAsset {
  id: number;
  url: string;
  name: string;
  created_at?: string;
  /** Number of content references that would block deletion. */
  usage?: number;
  references?: WorldMediaReference[];
}

export interface WorldConcept {
  body_json: TiptapDoc;
  body_text: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface WorldConceptComment {
  id: number;
  body: string;
  quote: string;
  anchor_id: string;
  resolved: boolean;
  parent: number | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorldConceptEdit {
  exists: boolean;
  draft_json: TiptapDoc;
  draft_text: string;
  body_json: TiptapDoc | null;
  body_text: string;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface WorldConceptRevisionSummary {
  revision: number;
  published_at: string;
  created_at: string;
  created_by: string | null;
  char_count: number;
  is_current: boolean;
}

export interface WorldConceptRevisionDetail extends WorldConceptRevisionSummary {
  body_json: TiptapDoc;
  body_text: string;
}

export interface TimelineEra {
  id: number;
  name: string;
  start_year: number;
  end_year: number;
  color: string;
}

export interface TimelineSummary {
  id: number;
  name: string;
  slug: string;
  color: string;
  is_default: boolean;
  entry_count: number;
}

export interface TimelineData {
  world: { slug: string; name: string };
  can_edit: boolean;
  timelines: TimelineSummary[];
  timeline: TimelineSummary | null;
  eras: TimelineEra[];
  entries: TimelineEntry[];
}


export interface TrashCard {
  id: number;
  title: string;
  slug: string;
  type_key: string;
  home_collection: number | null;
  revision: number;
  deleted_at: string;
}

export interface CardRevisionSnapshot {
  title: string;
  body_json: TiptapDoc;
  body_text: string;
  icon: string;
  cover: string;
  type_key: string;
  era: string;
}

export interface CardRevisionSummary {
  index: number;
  summary: string;
  author_name: string | null;
  created_at: string;
}

export interface CardRevisionDetail extends CardRevisionSummary {
  snapshot: CardRevisionSnapshot;
}
