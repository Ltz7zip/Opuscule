# WorldConcept M1 实施计划

## As-built amendment (2026-10-27): shared world media

本 amendment 覆盖下文所有旧的 `WorldMedia` / `/media/` / `MediaLibraryDialog` 设计。实现以本 amendment 为准：

- 世界级 `WorldMedia`（`world` / `file` / `name` / `uploaded_by` / `created_at`）是**唯一活跃的共享媒体 owner**；卡片编辑器和概念编辑器都通过 `MediaLibraryDialog` 使用它。
- 不再有概念专属媒体表/API。`WorldConcept` 不持有媒体 FK。
- `GET/POST /api/worlds/<slug>/media/`：owner/editor；4 MB；PNG/JPEG/WebP；返回 `id/url/name/created_at`；首片不做删除。
- 旧 `CardImage` 表/API **保留兼容**：数据迁移复制到 `WorldMedia`（不删旧表、不丢旧文件）；旧卡图 API 双写/双删 `WorldMedia`；卡片编辑器不再走旧 API，改用共享库。
- M1 已完成并通过 `make ci`：`WorldConcept`/`WorldMedia` 模型与迁移、概念 API、共享媒体 API、Workspace 概念编辑、`/wiki` 读页/回退、`/wiki/cards` 索引、导航、`RichText` 阅读提及、SSR 读页/索引、`/wiki/edit` SPA。
- M2（2026-10-27）已完成：正文提及与本页引用 chip 侧窥；侧窥「出现在」开篇/小节反链；卡片页「世界概念反链」；设定集分类树/筛选、被引用次数/未引用标记；SSR 把已发布概念传给设定集/卡片页。
- M3（2026-10-27）：共享媒体引用扫描/用量/受保护删除 + `media.deleted` 审计；旧 `CardImage` 只读审计命令。
- M4（2026-10-27，全部完成）：用户明确确认后删除旧 `CardImage` 表/API/前端/测试（迁移 `cards/0010`，审计 0 行）；
  私有世界成员读页（SPA shell + 客户端 session）；草稿 `expected_updated_at` 并发保护（409）；
  公开搜索增加世界概念分组；站点/世界 RSS 混排概念；ZIP 携带概念与历史快照；
  概念成员评论；`worldTimeline` 编辑器块 + 读页渲染。
- M3 版本历史（2026-10-27）：`WorldConceptRevision` 发布快照、列表/详情、恢复为草稿、编辑器历史面板；已有已发布概念由迁移回填；公开页只读当前发布快照。
- 已知限制：公开 media URL 无访问控制；概念评论无通知；时间线块只渲染前 12 条且按需拉取；私有世界成员读页无 SSR 首屏。

日期：2026-10-27
状态：M1+M2+M3 媒体/版本历史已实现（2026-10-27）；旧卡表清理待确认
Spec：[20261027-world-concept-authoring.md](20261027-world-concept-authoring.md)
视觉稿：[world-concept.html](../../.design/current/world-concept.html)

## Aegis Visibility

这个计划值得落盘：它新增一个世界级文档 owner（`WorldConcept`）、一个世界级媒体 owner（`WorldMedia`）、公开 API、迁移、权限边界、SSR 路由，并会改动 `CardEditor`、`WikiPage`、`RichText` 和世界导航；卡片、卡片媒体、旧 Wiki 回退必须保持兼容。

## 范围与验收

按已确认的 Spec 做 **M1 首片**：

- `WorldConcept` + `WorldMedia` 模型/迁移/API/权限/测试。
- 概念编辑器：Workspace 概念模式、自动保存草稿、发布、模板、目录、媒体库 + URL。
- `/wiki` 读页（有发布概念）+ 无概念回退；`/wiki/cards` 索引；世界导航。
- 读页引用计数（右栏 + 文末）、3:4 封面、公开可读世界的 SSR 读页/索引。
- 编辑器预览（首片用编辑器内只读渲染）。

不做：版本历史、ZIP 导出导入、公开搜索/RSS、媒体删除/旧 `CardImage` 表清理、`is_public_read=false` 的成员读页、草稿并发控制。

用户已确认：Workspace 概念模式；SSR 接受；媒体库 + URL；私有卡片只允许公开提及；M1 不做侧窥/索引树/索引卡片引用次数（M2 已补）；私域成员读页后置。

## Baseline / Authority

- 设计契约：`docs/plans/20261027-world-concept-authoring.md`（本计划不重复其 API/字段细节，只负责执行顺序与验证）。
- 视觉：`.design/current/world-concept.html`；不要覆盖 `.design/current/index.html`。
- 项目约定：`AGENTS.md`；UI 验收：`docs/ui-review-checklist.md`；CI：`scripts/ci.sh`。
- 关键现有代码：
  - `backend/apps/worlds/models.py`、`serializers.py`、`views.py`、`access.py`、`tests.py`
  - `backend/apps/cards/models.py`、`serializers.py`、`views.py`
  - `backend/config/urls.py`
  - `frontend/src/components/CardEditor.tsx`、`Workspace.tsx`、`Sidebar.tsx`、`Topbar.tsx`、`WikiPage.tsx`、`RichText.tsx`、`SiteHeader.tsx`、`WorldNav.tsx`
  - `frontend/src/app/routes.ts`、`RouteView.tsx`、`frontend/src/api.ts`、`types.ts`
  - `frontend/src/ssr/entry-server.tsx`、`entry-client.tsx`、`frontend/server.mjs`、`server.prod.mjs`

## 架构

- 数据：`World` 1—1 `WorldConcept`；`World` 1—N `WorldMedia`；概念不写 `Card`。
- 读：公开读页只读 `body_json`；编辑器读写 `draft_json`；发布复制草稿到已发布快照。
- 编辑：`/w/:slug/wiki/edit` 进入现有 Workspace 的 concept 模式；复用 Sidebar/Topbar 和 Tiptap 扩展；概念编辑器不渲染卡片属性/评论。
- 媒体：概念图片走 `WorldMedia` + `/api/worlds/<slug>/media/`；卡片 `CardImage` 不动；媒体库在编辑器弹窗内上传/列表/选择，URL 仍可用。
- 读页：`/wiki` 有发布概念时 `WorldConceptPage`，否则 `WikiPage` 网格回退；`/wiki/cards` 用 `WikiPage` 索引；卡片详情仍 `/wiki/:cardSlug`。
- SSR：公开可读世界 SSR `/wiki`、`/wiki/cards`、卡片页；`/wiki/edit` 是 SPA shell；`/wiki/cards`、`/wiki/edit` 保留 slug，不能被当作卡片。

## Compatibility Boundary

- `Card`、`CardImage`、卡片 API、卡片计数/搜索/自动链接/ZIP 导出：不改语义。
- `WorldDetail`、`World` API、公开 `/`、Explore/Profile/Search：保持现有契约（世界导航文案除外）。
- 旧 `/wiki` 无概念仍渲染现有 `WikiPage` 网格；有概念才切读页。
- `world-overview` 卡保留，不迁移/删除。
- 卡片编辑器行为保持；共享扩展工厂只是抽离，不改扩展配置/卡片保存逻辑。
- 现有卡片图片上传 4 MB / PNG/JPEG/WebP 行为保持；概念图片使用同规则但独立 owner。
- 新增 API 不改变现有 URL；新增 `/wiki/cards`、`/wiki/edit`，`cards`/`edit` 为保留 slug。
- 公开图片 URL 与现有 media 一样公开；首片不做鉴权/删除/回收。

## TDD Route

| 项 | 值 |
|---|---|
| Mode | `off`（Aegis 默认；用户未要求 TDD） |
| Decision | `skipped` |
| Authority | 用户/项目指令；无 strict TDD 授权 |
| Test posture | 后端 `APITestCase` 覆盖新 API/权限/媒体；前端 `npm run build`/`build:all` + Playwright/UI 走查；`make ci` |
| Reason | 本次是已批准 Spec 的实现，不进入 RED/GREEN 强制流程；用回归/验收测试证明结果 |

不写 strict RED/GREEN 步骤；如果用户之后要求 strict TDD，回到本阶段重排任务。

## Requirement Ready Check

- 已批准输入：Authoring Spec（2026-10-27）+ 用户 6 项回答。
- 范围/场景/验收：Spec「首片验收」；媒体库是 #3 的新增范围。
- 决策变更项：无。媒体库已定为概念自己的 world-scoped 库（上传/列表/选择），不改卡片媒体库；删除/共享后置。私域成员读页按 #6 后置。
- 未决项：无阻塞实现的未知；`CardEditor` 抽离、SSR 路由、保留 slug 是执行风险，不是需求缺口。

## Change Necessity

- 不做代码只写文档不够：需要新持久化 owner、公开 API、权限、迁移、编辑器、读页和 SSR。
- 最小代码边界：新 `WorldConcept`/`WorldMedia` + 概念 API + 概念编辑器 + 读页/索引/导航 + SSR；不重构 `Card` 实体，不做世界媒体统一，不引入新依赖。
- 旧的 `WikiPage` 世界网格变成回退/索引，不删除；`world-overview` 卡保留。

## Ripple Signal Triage

触发：新 owner、公开 API、schema/迁移、权限、媒体上传、SSR、共享 `CardEditor` 扩展、`RichText`、导航、保留 slug。

- 新 owner：`WorldConcept`/`WorldMedia`；不复制到 `Card`，不让概念进入卡片计数/搜索/导出。
- 公开契约：`/concept/`、`/concept/edit/`、`/concept/publish/`、`/media/`；新增，不改旧 API。
- 权限：沿用 `get_world_for_read`/`get_world_for_write`；viewer/anonymous 边界要测。
- 媒体：`WorldMedia` 共享 owner；旧 `CardImage` 数据迁移并兼容；卡片编辑器改用共享库；共享 4 MB/类型校验。
- 编辑器：`buildDocumentExtensions` 从 `CardEditor` 抽离；卡片保存/扩展配置回归要测。
- 读页：`RichText` 增加 `mentionMode`/`autoLink`；卡片页默认行为不变。
- 导航：`SiteHeader`/`WorldNav` 新标签；`WikiPage` 的 `sections` 依赖要兼容/移除；公开其他页面不变。
- SSR：`/wiki` 概念数据、`/wiki/cards`、`/wiki/edit` SPA、保留 slug；公开 `/wiki` 回退不能破。
- 迁移：`WorldConcept`、`WorldMedia`、审计 action；`makemigrations --check` 必须干净。

## Existence Check / Minimality

- `WorldConcept` 是新 owner，不能用 `Card` 或 `world-overview` 代替：那会污染 collection/slug/计数/自动链接/导出/卡片页语义（Spec 已论证）。
- `WorldMedia` 是新 owner；旧 `CardImage` 数据复制并保留兼容 API；卡片和概念共用同一个 world-scoped 库。
- 复用：Tiptap 扩展、`RichText`、`WikiPage`、`SiteHeader`、`WorldNav`、`ContourPlate`、`SiteFoot`、现有媒体样式；不新造编辑器或设计系统。
- 最小边界：一个概念一世界；图片一世界 N 张；媒体只上传/列表/选择；无删除/回收/共享。

## Architecture / Plan Pressure

- 所有者：`World` 继续拥有 world/card/collection；`WorldConcept` 只拥有概念正文/发布；`WorldMedia` 是世界共享媒体；旧 `CardImage` 表仅作兼容数据，卡片编辑器不再写入/读取旧库。
- 读/写：读页只读发布快照；编辑器只读写草稿；`publish` 是唯一提升点；SSR 不读草稿。
- 顺序：后端模型/API → 媒体 API → 前端契约/扩展抽离 → 编辑器 → 读页/索引/导航 → SSR → 全量验收。
- 验证：后端权限/迁移/媒体/草稿泄漏；前端构建/预算/SSR/UI 宽度/媒体焦点；`make ci`。
- 计划可执行：每个任务有文件、最小改动、兼容项、命令/手动验证；无代码后才发现的空依赖。

## Tasks

### Task 1 — 后端公共文本工具 + 模型 + 迁移

**Files**

- `backend/apps/common/tiptap.py`（新）：`plain_text()`、`json_depth()`、`MAX_BODY_DEPTH`。
- `backend/apps/cards/models.py`、`serializers.py`：改为从 common 导入；不改变行为。
- `backend/apps/worlds/models.py`：`WorldConcept`、`WorldMedia`；`WorldAuditEvent.Action.CONCEPT_PUBLISHED`。
- `backend/apps/worlds/migrations/0012_alter_worldauditevent_action_worldconcept_worldmedia.py`（`WorldConcept`/`WorldMedia`/审计 action）。
- `backend/apps/cards/migrations/0009_copy_card_images_to_world_media.py`（旧 `CardImage` 复制到 `WorldMedia`；非破坏，不删旧表/文件）。

**Change**

- `WorldConcept` 字段按 Spec；`created_by`/`updated_by` 用不同 `related_name`；`WorldMedia.world` 为 `media`，`file` 存 `world-media/`，`uploaded_by` 用独立 `related_name`；`name`/`created_at` 供共享库列表。
- `WorldConcept` 不做 `Card`；不加入 `WorldDetailSerializer`。
- 审计 action 增加 `concept.published`；不在草稿保存时写审计。

**Compatibility**

- `plain_text`/`json_depth` 值/异常行为不变；`Card` 的 `body_text`、嵌套校验回归必须过。
- 不创建/修改任何卡片或卡片媒体；迁移只新增表/choices。

**Verify**

- `cd backend && .venv/bin/python manage.py check`
- `cd backend && .venv/bin/python manage.py makemigrations --check --dry-run`
- `cd backend && .venv/bin/python manage.py test apps.cards`
- 人工/测试确认 `plain_text`/`json_depth` 对现有卡片输入一致。

### Task 2 — 概念 API + 权限 + 发布 + 审计

**Files**

- `backend/apps/worlds/serializers.py`：public/edit/draft serializers；只允许 `body_json`；服务端算 `draft_text`/`body_text`。
- `backend/apps/worlds/views.py`：`WorldConceptView`（GET public、PATCH draft）、`WorldConceptEditView`、`WorldConceptPublishView`。
- `backend/apps/cards/serializers.py`：卡片 slug 生成/校验保留 `cards`/`edit`，新卡/改名不生成这两个 slug；不改已有卡数据。
- `backend/apps/cards/tests.py`、`backend/apps/worlds/tests.py`（或新 `test_concept.py`）：权限/草稿/发布/审计/深度/私有世界/无概念/保留 slug。
- `backend/config/urls.py`：`/concept/`、`/concept/edit/`、`/concept/publish/`。
- `frontend/src/components/WorldAuditDialog.tsx`（如 action 筛选需要）：加入 `concept.published` 标签/筛选。

**Change**

- GET public 只返回已发布；无发布 404；不返回 `draft_*`。
- GET edit 无行返回 `exists:false` + 空文档；不创建。
- PATCH 懒创建；设 `created_by`/`updated_by`；`draft_text` 重算；深度 64；不发布。
- publish 复制草稿、`published_at`、`revision += 1`、审计；空草稿 400。
- 权限用 `get_world_for_read`/`get_world_for_write`；`is_public_read=false` 的成员 API 可读，但读页后置。
- 卡片 slug 增加 `RESERVED_CARD_SLUGS = {"cards", "edit"}` 约束；若已有卡片占用，测试报告并交由用户处理，不自动改名。

**Compatibility**

- 新增 API；不改变现有 world/card API。
- 草稿不泄漏到公开 GET/SSR；发布不改变世界公开状态。

**Verify**

- `cd backend && .venv/bin/python manage.py test apps.worlds`
- 覆盖：无发布 404；无 draft 字段；匿名/非成员 401/403；viewer 403；owner/editor 200；exists:false；PATCH 创建；公开 GET 不变；publish 复制/revision/审计；空草稿/深度 400；私有世界匿名 404；不创建 Card；卡片 slug 避开 `cards`/`edit`。

### Task 3 — 共享媒体库 API + 共享图片校验

**Files**

- `backend/apps/common/images.py`（新）：4 MB、PNG/JPEG/WebP 签名校验；错误文案。
- `backend/apps/cards/views.py`：`CardImageUploadView` 改用共享校验，行为不变。
- `backend/apps/worlds/views.py`、`backend/config/urls.py`：`WorldMediaUploadView`（GET 列表、POST 上传）在 `/media/`。
- `backend/apps/worlds/tests.py`（或 `test_media.py`）。

**Change**

- GET 返回本世界图片 `id/url/name/created_at`；POST multipart `file`；201 `id/url/name`；使用 `request.build_absolute_uri`。
- owner/editor only；viewer/anonymous 边界；world 隔离；不创建 `Card`；不改 `CardImage`。
- 无 DELETE（M1）。

**Compatibility**

- 卡片图片上传的 4 MB/类型/错误行为不变；卡片媒体库/API 不动。
- 概念图片列表不公开；读页只用正文 `imageBlock.src`。

**Verify**

- `cd backend && .venv/bin/python manage.py test apps.cards apps.worlds`
- 覆盖：owner/editor GET/POST；viewer 403/匿名 401；跨世界 404；>4 MB/非 PNG/JPEG/WebP 400；返回 URL/name；不创建 Card；卡片上传回归。

### Task 4 — 前端 API/类型 + 共享编辑器扩展

**Files**

- `frontend/src/types.ts`：`WorldConcept`、`WorldConceptEdit`、`ConceptResponse`、`ConceptImageAsset`。
- `frontend/src/api.ts`：`fetchWorldConcept`、`fetchWorldConceptEdit`、`saveWorldConceptDraft`、`publishWorldConcept`、`fetchWorldMedias`、`uploadWorldMedia`。
- `frontend/src/editor/extensions.ts`（新）：`buildDocumentExtensions({ cards, worldSlug, currentSlug?, readOnly? })`。
- `frontend/src/components/CardEditor.tsx`：改用共享工厂，保留现有卡片专属配置/保存逻辑。

**Change**

- 图片上传用 `FormData` + CSRF + `same-origin`；列表 JSON；404 抛 `ApiError` 供读页回退。
- 扩展工厂包含 Spec 列出的现有扩展；`CardLinks`/`MentionAuto`/`Mention` 的 cards/currentSlug 由调用方传入；概念传公开卡片列表、无 currentSlug。
- `CardEditor` 的 `editorProps`、`handleClick`、`onUpdate`、保存/媒体逻辑留在原组件；只抽扩展配置。

**Compatibility**

- 卡片编辑器的扩展配置/保存/媒体/评论不变；`CardEditor` 回归。
- 不新增依赖。

**Verify**

- `cd frontend && npm run build`
- 手工打开一张卡：编辑、自动保存、`@` 提及、自动链接、表格、媒体库、发布状态不回归。

### Task 5 — Workspace 概念模式 + 编辑器 + 媒体库

**Files**

- `frontend/src/app/routes.ts`、`frontend/src/app/RouteView.tsx`：`/wiki/edit` → Workspace concept；`/wiki/cards` 路由；保留 slug。
- `frontend/src/components/Workspace.tsx`、`Sidebar.tsx`、`Topbar.tsx`：concept 模式、世界概念入口/状态、保存/发布 action、面包屑。
- `frontend/src/components/ConceptEditor.tsx`（新）：正文、目录、模板、自动保存、发布、状态。
- `frontend/src/components/MediaLibraryDialog.tsx`（新）：world-scoped 图片列表/上传/选择；URL 入口。
- `frontend/src/styles/world-concept.css`（新）或现有编辑器 CSS：编辑器壳/媒体弹窗补充；复用 `editor-media-*`。

**Change**

- Workspace 加载 `fetchWorld` + `fetchWorldConceptEdit`；concept 模式跳过卡片选中；Sidebar 选中「世界概念」；Topbar 显示保存状态/发布。
- `ConceptEditor` 使用 `buildDocumentExtensions`；`GET edit` 取草稿/已发布/空；850ms autosave `PATCH`；`Cmd/Ctrl+S`；失败保留/重试；`beforeunload`。
- 模板（序/历史/地理/人物/未解之谜，H2）；目录从 H2/H3 生成；字数。
- 斜杠「媒体库」打开 `MediaLibraryDialog`：加载/空/上传中/失败；上传按钮；选择插入 `imageBlock`；URL 斜杠入口保留；上传中禁用；成功后刷新并选中；Esc/焦点恢复/移动端。
- 发布确认 → `POST publish`；成功状态/公开页链接；后续「未发布的修改」；空内容禁用发布。
- `/wiki/edit` 权限：owner/editor；viewer/匿名被 API 403/401，SPA 显示错误/登录。

**Compatibility**

- 现有 `/w/:slug` 卡片工作区行为不变；Sidebar 卡片树/搜索/设置/成员/审计/回收站不变。
- 概念不使用 `CardEditor` 的 title/icon/cover/comment/collection 逻辑；卡片编辑器也改用共享世界媒体库。

**Verify**

- `cd frontend && npm run build`
- 手工：owner 进入 → 空态/模板 → 写 → 自动保存 → 刷新 → 媒体库上传/选择 → URL → 预览（Task 6 接线）→ 发布；viewer/匿名无入口；移动端 Sidebar/媒体弹窗；`/wiki/edit` 不进入卡片页。

### Task 6 — 读页 + 索引 + 导航 + 引用

**Files**

- `frontend/src/components/WorldConceptPage.tsx`（新）：读页/回退、Hero、TOC、正文、右栏、引用、owner 编辑、预览模式。
- `frontend/src/components/WikiPage.tsx`：`/wiki/cards` 索引模式、无概念回退、卡片页 active/breadcrumb、owner CTA。
- `frontend/src/components/RichText.tsx`：`mentionMode="reading"`（label + 上标，无 `@`）、`autoLink` 开关；默认行为不变。
- `frontend/src/components/SiteHeader.tsx`、`WorldNav.tsx`：世界/设定/时间线/地图/工作区；active；移除/兼容 `sections`。
- `frontend/src/styles/world-concept.css`：读页/索引/导航/媒体响应式样式。
- `ConceptEditor` 的预览入口（Task 6 接线：用 `WorldConceptPage` 只读渲染草稿，不写公开缓存）。

**Change**

- `WorldConceptPage` 数据：world + published concept；无概念 404 → `WikiPage` 回退；owner CTA。
- 版式按视觉稿：3:4 `ContourPlate`、标题/简介、元信息/纪元、左 TOC、正文、右栏统计、本页引用（右栏 + 文末）、`SiteFoot`、owner 编辑。
- 引用：遍历 `body_json` 显式 mention，映射公开卡片去重；未引用数来自公开卡片；不把 `CardLinks` 装饰计入。
- 读页 `RichText` 关闭 autoLink；mention 只显示卡片名 + 上标；非公开/缺失卡片降级纯文本。
- `WikiPage` 索引 `/wiki/cards`：复用现有网格/集合分区，标题「设定集」，`SiteHeader` active cards；卡片页面包屑「世界」。
- 导航：`世界` `/wiki`、`设定` `/wiki/cards`、`时间线`、`地图`、`工作区`；`WorldNav` 同步；读页 active world，索引/卡片 active cards。
- 回退 `/wiki` 无概念：现有世界网格 + owner 写概念入口。
- 预览：编辑器内 `WorldConceptPage` 草稿只读；不产生公开 URL/SSR。

**Compatibility**

- `RichText` 卡片页默认（autoLink on / inline mention）不变；`WikiPage` 卡片页内容不变；旧无概念世界不变。
- `SiteHeader` 非世界页面（Explore/Profile/Search）不变；`WorldNav` 地图/时间线只改标签/active。
- 读页公开页面包不引入 Tiptap；图片/媒体 URL 正常。

**Verify**

- `cd frontend && npm run build`
- 手工 1440/1024/768/390：读页三栏→两栏→单栏；TOC 跟随；引用双份；深浅色；无横向溢出；owner 编辑/匿名隐藏；索引/卡片/回退；媒体图片；无概念回退。

### Task 7 — SSR + 路由 + 保留 slug

**Files**

- `frontend/src/ssr/entry-server.tsx`、`frontend/src/ssr/entry-client.tsx`：`WorldConceptPage` 的 SSR/hydration；`renderConcept`；初始数据类型。
- `frontend/server.mjs`、`frontend/server.prod.mjs`：`/wiki` 概念数据；`/wiki/cards`；`/wiki/edit` SPA；`cards/edit` 不作为卡 slug；canonical/meta。
- `frontend/src/app/routes.ts`、`RouteView.tsx`（与 Task 5 收尾）：`wiki-cards`、concept 路由。

**Change**

- `/w/:slug/wiki`（`is_public_read=true`）：server 取 world + concept；有发布 → `WorldConceptPage`；无 → `WikiPage` 回退。不把 draft 发 HTML。
- `/w/:slug/wiki/cards`：SSR `WikiPage` 索引；`/w/:slug/wiki/:cardSlug`：现有卡片 SSR；`cards`/`edit` 排除。
- `/w/:slug/wiki/edit`：SPA shell（Workspace concept）；不 SSR；登录态 CSR。
- `entry-server` 新增 `renderConcept`；`entry-client` hydration；`initial` kind 携带 concept/fallback。
- 保留 slug：`cards`/`edit`；卡片 slug 生成避开；SSR 正则显式分支。

**Compatibility**

- 现有卡片 SSR/`WikiPage`/`initial` 数据不回归；`/wiki` 无概念回退仍 SSR 旧网格。
- 不改变 `/`、Explore、Profile、Search 的 SSR。
- 公开页 no draft；meta/canonical 用 world/concept 发布数据。

**Verify**

- `cd frontend && npm run build:all`
- `npm run dev:ssr`（5174）与 `npm run preview:ssr`（5175）：
  - `/w/wuhai/wiki` 读页（有发布）/回退（无发布）
  - `/w/wuhai/wiki/cards` 索引
  - `/w/wuhai/wiki/<cardSlug>` 卡片
  - `/w/wuhai/wiki/edit` SPA shell（不被当卡片）
  - 无 `cards`/`edit` 误判；公开 HTML 无 `draft_json`；无 Tiptap 公共 chunk。

### Task 8 — 全量验证与收尾

**Files**：无新增；按需修验证暴露的问题。

**Change**

- 跑完整验收矩阵；记录证据/残留缺口；不扩大 M3。
- 如公开 Wiki 截图基线因 `/wiki` 读页变化，按 `npm run ui:snapshots:update` 更新并说明；否则不更新。
- 交付时说明：M1/M2 已交付；媒体公开 URL/无删除、私域读页、版本/ZIP/搜索等已知限制。

**Verify**

- 后端：
  - `cd backend && .venv/bin/python manage.py check`
  - `cd backend && .venv/bin/python manage.py makemigrations --check --dry-run`
  - `cd backend && .venv/bin/python manage.py test`
- 前端：
  - `cd frontend && npm run build`
  - `cd frontend && npm run build:all`
  - `cd frontend && npm run check:budget`
- 总门禁：`make ci`（backend check/migrations/tests、production settings、import contracts、design、UI contract、frontend build/budget）。
- SSR：`npm run dev:ssr`、`npm run build:all && npm run preview:ssr`；见 Task 7 路由矩阵。
- UI 走查：按 `docs/ui-review-checklist.md` 的 1440/900/700/390/320 + 设计稿 1024/768；深浅色；读页/索引/编辑器/媒体库；无横向溢出；焦点/ESC；上传中/失败；公开页无 Tiptap；console 0 error。
- 回归：卡片编辑/保存/媒体/评论；无概念 `/wiki`；卡片详情；Explore/Profile/Search；`WorldDetail`；`world-overview`；卡片计数/搜索/导出不变。

## Risks

1. **`CardEditor` 扩展抽离**：扩展配置/提及/自动链接错位会回归卡片编辑；Task 4 后必须手工回归卡片保存/媒体。
2. **`WikiPage`/SSR 路由**：`/wiki/cards`、`/wiki/edit`、`cards`/`edit` 保留 slug 容易误判；Task 7 做路由矩阵。
3. **`RichText` 双模式**：读页无 `@`/无自动链接，卡片页默认；两处都要看。
4. **媒体库**：上传/列表/选择状态、焦点、移动端、4 MB/类型错误；概念 API 与卡片 API 不可混用。
5. **公开图片 URL**：媒体无鉴权/删除/回收；首片接受，交付时明确。
6. **导航**：`SiteHeader`/`WorldNav` 改动影响地图/时间线/卡片页；旧集合入口移除后只能从 `/wiki/cards` 找，需确认可用。
7. **公开包体**：读页不能拉入 Tiptap；`Workspace` chunk 不能扩大到公开页；`check:budget` 验证。
8. **迁移/审计**：`makemigrations --check` 必须干净；`concept.published` 筛选/标签不能破审计 dialog。
9. **无前端单测**：媒体/编辑器/读页主要靠 Playwright/手工；交付要写清未覆盖的读屏/跨浏览器。
10. **私域/私有卡片**：M1 只公开可读世界；私有卡片只允许公开提及；不把边界做成隐性行为。

## Retirement

- 不删除 `Card`/`CardImage` 表/`world-overview`；旧 `CardImage` 数据复制到 `WorldMedia`，旧表/API 保留兼容。
- `/wiki` 的世界网格从「有概念世界的主页」降为回退/索引；旧 `WikiPage` 保留。
- 世界顶栏不再列集合链接；集合入口移到 `/wiki/cards`；无数据丢失。
- `CardEditor` 的扩展列表集中到 `buildDocumentExtensions`；旧的重复配置移除，但卡片行为保留。
- `plain_text`/`json_depth` 从 cards 移到 common；旧引用更新，不保留重复实现。
- 无旧 API/路由被删除；新增 `/wiki/cards`、`/wiki/edit`。

## Execution Handoff

- 路由：**inline**（`executing-plans`）。任务共享文件多、顺序依赖强（模型→API→扩展→编辑器→读页→SSR），不适合并行 subagent。
- TDD：`off` / `skipped`；按 Task 8 的回归/验收测试；用户若要求 strict TDD 再改。
- 用户确认：计划已写，代码实施需用户确认后从 Task 1 开始；本计划不授权删除/迁移/外部动作。
- 每个 Task 完成后先跑该 Task 的 Verify，再进入下一个；不把未验证的任务标记完成。
- 首次实现前记录 `TaskStartSnapshot`；每个 Task 验证后按项目约定提交，不把多个 Task 混成一个不可审查提交。
