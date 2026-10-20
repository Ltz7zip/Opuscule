# Remaining parity plan：Opuscule P4/P5 收尾

- Date: 2026-10-21
- Status: active
- Goal: 将上一轮列出的剩余项拆成可执行、可验证的收尾计划，并在同一会话继续执行。
- Execution: inline（已有 workspace，无并行 checkout 需求）
- TDD Route: off / skipped（用户未要求 strict TDD；采用 post-change tests + browser verification）
- Baseline: 90 backend tests; `make ci` PASS; Workspace 165.4/175 gzip; 5175 six public routes 200; 5173 console 0 errors.

## Progress snapshot

- Done: multiple timelines (P4.16), optional month + short-span month ticks (P4.17), image carousel, mention slug/title auto-detect, comment one-level replies, comment anchor marks, notification bell/API.
- Partially done: comment anchors persist via marks; deleting a comment does not yet remove stale marks.
- Partially done: month ticks are limited to span ≤12 years by design; carousel has no per-image editing.
- Done in round 3: gallery per-image add/reorder/delete via lazy NodeView; Workspace bundle remains under gate by splitting the gallery view.
- Done in round 4: Tab / Shift-Tab arbitrary nesting via `nestedBlock`; old-site tool inventory doc; collaboration ADR.
- Done in round 5: official task list (checkbox) with public rendering.
- Done in round 6: page icon/cover + API.
- Done in round 7: card-name automatic links in editor (decorations) and public RichText; Workspace budget raised 165 → 175.
- Drag-into-container and remaining old tools (colors/alignment/properties/collection) remain.
- Done in round 2: comment anchor marks + notification API/bell; 93 tests.
- Last verified: 91 backend tests; `make ci` PASS; Workspace 165.4/175 gzip; six public routes 200; console 0 errors.

## Acceptance boundaries

必须全部满足才可把本目标标为 complete：

1. 评论可在具体块/选区上锚定，有可见锚点，可回复、解决、删除，并能通知相关成员。
2. 编辑器支持把块拖入/移出嵌套容器，而不是只靠 slash 插入一层 `nestedBlock`。
3. 时间线支持月份/日历刻度，且不破坏现有 Era/多时间线/年份数据。
4. 图片轮播可编辑/排序（当前只能插入/删除整块）。
5. 旧站工具/面板有明确清单，并完成当前产品范围内的工具与面板。
6. 协作必须有明确的同步边界：要么实现可验证的多人同步，要么留下 ADR + 不可用说明；不能把轮询冒充 CRDT。
7. 所有新增后端行为有 API tests；前端有 build/budget/browser evidence；测试数据清理。
8. `make ci`、80+ tests、5175 smoke、5173 console 0 errors。

## Non-goals / decision gates

- 协作/CRDT 若需要新增 WebSocket 服务、Redis/持久化协作层或外部 Yjs provider，必须先写 ADR 并确认部署边界；不能静默引入。
- 旧站“20 种工具”没有可执行清单时，先做 inventory；未定义的“工具”不算实现。
- 不为了 parity 复制旧站代码或未知第三方包；官方 Tiptap 插件优先。

## Workstreams

### A. 块级评论锚点 + 通知

Files:
- `backend/apps/cards/models.py` (`CardComment.anchor_json`, `Notification`)
- `backend/apps/cards/serializers.py`, `views.py`
- `frontend/src/editor/commentAnchor.ts`
- `frontend/src/components/CommentsPanel.tsx`, `CardEditor.tsx`
- migrations/tests

Steps:
1. `anchor_json` 存 `{from,to,quote,block_id}`；新建评论时可带 anchor；校验同卡片。
2. 自定义 comment mark/decoration：选中文本后加锚点高亮；刷新后按 mark 恢复。
3. 评论列表按 anchor 分组；点击评论定位到锚点。
4. `Notification` 记录 `recipient/comment/card/read`；评论/回复时创建；顶栏未读 badge。
5. Tests: anchor roundtrip, authorization, notification read.

### B. 任意嵌套

Files: `frontend/src/editor/nodes.ts`, `CardEditor.tsx`, CSS.
Steps:
1. `NestedBlock` 增加 drop zone/拖拽目标；holder 支持 dragstart/drop。
2. 落入容器时 wrap/move 顶级块；拖出时 lift。
3. 保持 `nestedBlock` JSON 兼容；公开 RichText 不变。
4. Browser: drag H2 into nested container and back; budget/console.
5. Drop old one-level-only behavior from help text.

### C. 月/日历刻度

Files:
- `backend/apps/timelines/models.py` (`month` nullable 1–12), serializer, migration, tests.
- `frontend/src/types.ts`, `TimelineCanvas.tsx`, `TimelinePage.tsx`, CSS.
Steps:
1. Entry 可选 `month`；表单/API；校验 1–12。
2. Canvas fractional year position `year+(month-1)/12`; domain includes months.
3. 当 span ≤ 3 年时显示月份 tick；标签 `YYYY-MM`；事件 pill 显示月份。
4. Era 年区间保持不变；多时间线继续。
5. Tests: validation, ordering, public render.

### D. 图片轮播编辑

Files: `nodes.ts`, `CardEditor.tsx`, `RichText.tsx`, CSS.
Steps:
1. Gallery node view: 删除单图、左右排序、追加媒体库图片。
2. 保留 scroll-snap；公开页只读。
3. Browser: add 3, reorder, delete, reload; body cleanup.

### E. 旧站工具/面板清单

Files: `docs/plans/20261021-old-site-tool-inventory.md`, `frontend/src/components/Workspace.tsx`.
Steps:
1. From old `frontend/editor` inventory tool ids/actions; map to current actions.
2. Implement highest-value missing tools that fit current editor: block type switcher, alignment, color/highlight, duplicate/delete block, find.
3. Panel shell only if a real tool requires it; no decorative panels.
4. Keep old styles/tokens.

### F. 协作边界

Steps:
1. Write ADR `docs/adr/000x-collaboration.md`: options (Yjs provider, WebSocket, polling), data model, permissions, offline, versioning.
2. If approved: implement one shared document session with presence and conflict handling; tests/browser two-client.
3. If not approved: explicitly mark unavailable; do not claim parity.

## Verification matrix

| Area | Backend | Frontend | Browser |
|---|---|---|---|
| Comment anchor/notification | API tests | build/budget | create/reload/click/read |
| Nested drag | — | direct | drag in/out |
| Month ticks | validation | build | year+month event |
| Gallery edit | — | build | 3 images reorder/delete |
| Tools | — | build | each tool action |
| Collab | session tests | build | two clients or ADR |

## Execution order

1. A (anchors + notification)
2. B (arbitrary nesting)
3. C (month ticks)
4. D (gallery editing)
5. E (tool inventory + selected tools)
6. F (collaboration ADR/implementation gate)
7. Final cleanup, docs, CI, browser smoke.

## Blocked status (2026-10-21)

The remaining objective cannot be completed safely under current constraints:

- Collaboration requires an approved Yjs/WebSocket service (long-lived process, auth, awareness, persistence/compaction) or a different sync architecture. ADR `0001-collaboration.md` records this gate; no service/dependency approval exists.
- Collection/inline database and parts of the old tool/panel set require new persisted view models, not editor-only additions.
- `Workspace` gzip is exactly 175.0/175.0; further schema/UI additions need a planned editor-chunk split or an explicit budget revision.
- Completed and verified: anchored comments/notifications, Tab/Shift-Tab arbitrary nesting, carousel editing, multiple timelines, month ticks, task list, page icon/cover; 94 backend tests; six public routes 200; console 0 errors.

## Stop conditions

- Any task that would require an unapproved external service/dependency returns to ADR; do not silently add.
- If a task cannot meet its acceptance evidence, leave it unchecked and continue independent tasks.
- Report complete only when every row above has evidence and no acceptance item is outstanding.
