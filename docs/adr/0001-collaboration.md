# ADR 0001: collaboration and CRDT boundary

- Status: proposed / not implemented
- Date: 2026-10-21

## Context

The current editor autosaves a full Tiptap JSON document per card. Concurrent editing is last-write-wins; comments/notifications are server-side. The old site did not implement true CRDT collaboration either. The remaining parity list includes collaboration, but adding it changes the persistence/transport boundary.

## Options

1. **Yjs + WebSocket provider**
   - Best conflict semantics and presence.
   - Requires a long-lived WebSocket service, awareness protocol, auth, persistence/snapshot strategy, and a new deployment unit.
   - Card body_json becomes a derived snapshot, not source of truth.
2. **Yjs + HTTP sync (y-websocket alternative)**
   - Less infrastructure, still needs update log/compaction and conflict-aware persistence.
   - Higher request volume; no presence without polling.
3. **Polling with optimistic revision checks**
   - Smallest change; can prevent blind overwrite using `revision`.
   - Not collaborative editing/CRDT; cannot merge concurrent text edits.
4. **No collaboration**
   - Honest for current single-user scope; keep revision guard and comments.

## Decision

Do **not** claim collaboration parity in the current slice. Adopt option 3 as a safety improvement now (revision conflict response + reload prompt); defer option 1 until an ADR explicitly approves a WebSocket service and deployment boundary.

## Consequences

- Concurrent edits can still conflict until Yjs/provider work is approved.
- The API already increments `revision`; frontend can detect conflict instead of silently overwriting.
- Comments/notifications remain independent of CRDT.
