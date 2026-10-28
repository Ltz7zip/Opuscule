# WorldConcept 写作与发布（Authoring Spec）

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
状态：已确认；M1+M2+M3 媒体/版本历史已实现（2026-10-27）；旧卡表清理待确认；实施计划见 `docs/plans/20261027-world-concept-implementation.md`
视觉稿：[world-concept.html](../../.design/current/world-concept.html)（读页 / 设定集 / 侧窥；M2 已实现；编辑器复用工作区壳）

## 目标

让 owner/editor 在不新增 `Card` 的前提下，写一个世界级的 Tiptap 概念文档：

- 自动保存草稿，显式发布；公开读页只读已发布版本。
- 复用现有编辑器内核、`@` 提及、卡片名自动链接、表格、图片、引用块。
- 概念不是卡片：没有 collection、slug、卡片计数、自动链接目标和设定集树位置。
- 首片就能写、能读：工作区入口 + 概念编辑器 + `/wiki` 读页 + `/wiki/cards` 索引 + 导航与回退。

## 已确认的决定

| 决定 | 取值 |
|---|---|
| 数据归属 | 独立 `WorldConcept`，一世界一篇；不是 `Card` |
| 标题 / 副标题 | 直接用 `World.name` / `World.description`；概念不另存一份 |
| 封面 | 3:4 `ContourPlate` 生成；不提供上传 |
| 图片 | 网络图片 URL + 共享世界媒体库（上传/列表/选择）；卡片编辑器同样使用 |
| 保存 | 自动保存草稿；「发布」把草稿复制为公开版本 |
| 入口 | 工作区左侧「世界概念」；owner/editor 的公开读页小「编辑」 |
| 读页结构 | 左目录 / 中正文 / 右栏；「本页引用」右栏和文末各一份 |
| 索引 | `/wiki/cards`，保留现有卡片网格；树形筛选/引用计数后置 |
| 首片（M1）边界 | 不含编辑器评论、版本历史、ZIP 往返、搜索/RSS；M2 已补侧窥/反链/索引树/引用计数；M3 已补媒体删除/审计与版本历史；旧卡表清理后置 |

## 数据模型

新增 `backend/apps/worlds/models.py::WorldConcept`（迁移 `worlds/0012_worldconcept`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `world` | `OneToOneField(World, related_name="concept")` | 一世界一篇；删除世界级联 |
| `draft_json` | `JSONField(default=dict)` | 自动保存的工作稿 |
| `draft_text` | `TextField(blank=True)` | 服务端从 `draft_json` 重算 |
| `body_json` | `JSONField(default=dict)` | 已发布正文 |
| `body_text` | `TextField(blank=True)` | 服务端从 `body_json` 重算；读页字数/搜索用 |
| `published_at` | `DateTimeField(null=True)` | 有值且正文非空才算「已发布」 |
| `revision` | `PositiveIntegerField(default=0)` | 每次发布 +1；草稿保存不变 |
| `created_by` | `FK(User, null=True, SET_NULL)` | 第一次保存的人；读页「创建者」 |
| `updated_by` | `FK(User, null=True, SET_NULL)` | 最近一次草稿保存/发布的人 |
| `created_at` / `updated_at` | `TimeStampedModel` | 读页「创建于」用 `created_at`；「更新于」用 `published_at`（不是草稿 `updated_at`） |

约定：

- 不存 `title` / `subtitle` / `cover` / `is_public` / `slug`；读页标题/简介/可见性来自 `World`，封面来自 `ContourPlate`。
- 不写 `Card` 行；不进入 `WorldDetail.cards`、`card_count`、搜索、设定集树、自动链接目标。
- `plain_text()` 与 `json_depth()` 从 `apps.cards` 抽到 `apps/common/tiptap.py`，`Card` 与 `WorldConcept` 共用；正文深度上限沿用 64。
- 服务端不信任客户端传来的 `body_text` / `draft_text`，保存/发布时用 `body_json` / `draft_json` 重算。
- 草稿保存不改 `revision`；发布才 +1。首片不做 `WorldConceptRevision`，旧发布版本不保留（已知限制）。

### 共享媒体库：WorldMedia

首片新增 `WorldMedia`（迁移 `worlds/0012_alter_worldauditevent_action_worldconcept_worldmedia`；旧卡图数据由 `cards/0009_copy_card_images_to_world_media` 复制），世界级，卡片和概念共用；旧 `CardImage` 表/API 保留兼容：

| 字段 | 类型 | 说明 |
|---|---|---|
| `world` | `ForeignKey(World, related_name="media")` | 按世界隔离；不挂卡片 |
| `file` | `FileField(upload_to="world-media/")` | 4 MB 上限；PNG/JPEG/WebP 签名校验，与卡片图片一致 |
| `name` | `CharField(max_length=255)` | 原始文件名；列表展示 |
| `uploaded_by` | `FK(User, null=True, SET_NULL)` | 上传者；显示用 |
| `created_at` | `TimeStampedModel.created_at` | 列表按 `-created_at, -id` |

约定：

- 媒体是 world-scoped；`WorldConcept` 尚未创建行时也能上传（编辑器先建共享库、后写正文）。
- 复用世界媒体库 `WorldMedia`；旧 `CardImage` 数据迁移并保留兼容 API，卡片编辑器改用共享库。
- 图片 URL 是公开 `/media/world-media/...`；首片不做访问控制/删除/回收（已知限制）。
- `name` 默认取文件 basename，允许租户/客户端显式传入；不另建标题字段。

## API

路由加在 `backend/config/urls.py`，实现放 `apps/worlds/views.py` / `serializers.py`。全部按世界成员权限：

| 方法 / 路径 | 权限 | 行为 |
|---|---|---|
| `GET /api/worlds/<slug>/concept/` | `get_world_for_read` | 只返回已发布正文；无发布概念 404；绝不返回 `draft_*` |
| `GET /api/worlds/<slug>/concept/edit/` | `get_world_for_write` | 返回草稿、已发布版本、状态；无行时 `exists:false`，不创建 |
| `PATCH /api/worlds/<slug>/concept/` | `get_world_for_write` | 保存草稿；`body_json` 必填；无行时创建；返回 `draft_*` / `updated_at` / `updated_by` |
| `POST /api/worlds/<slug>/concept/publish/` | `get_world_for_write` | 草稿复制到 `body_json/body_text`；`published_at=now`；`revision+=1`；审计 `concept.published`；空草稿 400 |

响应要点：

`GET /concept/` 返回：

```json
{
  "body_json": { "type": "doc", "content": [] },
  "body_text": "……",
  "published_at": "2026-10-27T01:00:00+08:00",
  "created_at": "2026-10-20T12:00:00+08:00",
  "updated_at": "2026-10-27T01:00:00+08:00",
  "revision": 3,
  "created_by": "traveler",
  "updated_by": "traveler"
}
```

`GET /concept/edit/` 在无行时返回：

```json
{
  "exists": false,
  "draft_json": { "type": "doc", "content": [{ "type": "paragraph" }] },
  "draft_text": "",
  "body_json": null,
  "body_text": "",
  "published_at": null,
  "revision": 0
}
```

校验与边界：

- `PATCH` 只接受 `body_json`（以及未来的可选字段）；`draft_json` 做深度校验；`draft_text = plain_text(draft_json)`。
- 发布要求 `draft_json` 至少有一个非空文本节点；空文档 400，前端禁用发布。
- 公开 GET 的 404 也要走「世界可读」检查：`is_public_read=false` 的世界匿名 404；成员 API 可读。M1 的读页/SSR 只覆盖 `is_public_read=true` 的世界；成员读页（会话 SSR/SPA）后置。
- 读页的公开响应可加 `Cache-Control: public, max-age=60, stale-while-revalidate=300`；首片可不加，后续在 SSR 层统一。
- `created_by` / `updated_by` 只返回 username，不返回用户对象；匿名无编辑权限。
- 审计只记发布，不记每次草稿保存；`concept.published` 加进 `WorldAuditEvent.Action` 和审计筛选，草稿自动保存不进审计。

### 共享媒体库 API

| 方法 / 路径 | 权限 | 行为 |
|---|---|---|
| `GET /api/worlds/<slug>/media/` | `get_world_for_write` | 列出本世界概念图片：`id / url / name / created_at` |
| `POST /api/worlds/<slug>/media/` | `get_world_for_write` | `multipart/form-data`，`file` 必填；4 MB；PNG/JPEG/WebP；201 返回 `id/url/name` |

- 列表/上传只对 owner/editor；viewer 403，匿名 401；图片按 world 隔离，跨世界 404。
- 上传校验沿用卡片图片：4 MB、PNG/JPEG/WebP 文件头；错误 400 并给可操作提示。
- 公开读页只使用正文 `imageBlock.src` 的 URL，不调用图片列表 API；列表不出现在匿名接口。
- 首片不做删除；旧 `CardImage` 删除 API 仍兼容旧客户端；共享媒体 UI 不提供删除。

## 编辑器

### 入口与路由

- 工作区左侧新增「世界概念」项（在卡片树上方），显示 `未写 / 草稿 / 已发布`；点击进入 `/w/:slug/wiki/edit`。
- 公开读页对 `world.can_edit` 的登录用户显示小「编辑」；匿名/viewer 不显示。
- `/w/:slug/wiki/edit` 由 `Workspace` 的 concept 模式承载（不新建一套工作区壳）：Sidebar 选中「世界概念」，主区渲染 `ConceptEditor`，Topbar 显示保存状态、预览、发布。
- 路由解析：`/wiki/edit` → workspace + concept；`/wiki/cards` → 索引；`/wiki/<slug>` → 卡片；`/wiki` → 读页/回退。`cards` / `edit` 为保留 slug，卡片的 slug 生成要避开。

### 编辑器壳

- Topbar：`Opuscule / 世界 / 世界概念 / 世界名`；右侧保存状态、预览、发布；世界公开状态仍由 world settings 控制。
- 主区：世界名 + 世界简介（只读，链接到世界设置）；正文 Tiptap；右侧可折叠目录；底部字数/保存时间。
- 不出现：卡片标题/图标/封面/集合/评论/卡片属性；版本历史在独立历史面板。
- 正文不写 H1；H1 从世界名来；编辑器标题从 H2 开始；模板使用 H2（序 / 历史 / 地理 / 人物 / 未解之谜）。
- 首片保留：斜杠菜单、`@` 提及、卡片名自动链接、表格、引用、图片 URL、共享世界媒体库（上传/列表/选择）、卡片嵌入、分割线、任务列表。
- 首片不做：媒体删除/旧 `CardImage` 表清理；自定义 timeline 数据块（先用普通表格/引用）；评论；拖拽 gutter 可选。

### 媒体库与 URL

- 斜杠菜单「媒体库」打开 `MediaLibraryDialog`：加载 world-scoped 图片；空态/加载/失败/上传中；提供「上传图片」按钮；选中后插入 `imageBlock`。
- 斜杠菜单「网络图片」保留 URL 输入（`http(s)://` 或 `/media/`）；媒体库弹窗提供「使用图片地址」入口，首片可先不做。
- 上传沿用 4 MB / PNG/JPEG/WebP 规则；错误区分文件过大、类型不支持、网络失败；上传中禁用上传按钮，防止重复提交；成功后刷新列表并选中新图或保留焦点。
- 弹窗 `role=dialog` / `aria-modal` / `aria-label`；打开聚焦关闭或上传按钮，Esc 关闭，关闭后焦点回到触发按钮；图片按钮有可读名称；移动端可滚动、无横向溢出。
- 卡片编辑器和概念编辑器共用 `MediaLibraryDialog` / `WorldMedia`；旧 `CardImage` API/表保留兼容。

### 复用与拆分

- 从 `CardEditor.tsx` 抽出共享的编辑器扩展工厂（暂名 `buildDocumentExtensions({ cards, worldSlug, currentSlug?, readOnly? })`），`CardEditor` 与 `ConceptEditor` 共用：
  `StarterKit`、`MarkdownShortcuts`、`Callout`、`ImageBlock`、`BookmarkBlock`、`CardEmbed`、`Column/ColumnList`、`GalleryBlock`、`PlaceholderBlock`、`CommentAnchor`、`NestedBlock`、`ToggleBlock`、`TableKit`、`TaskList/TaskItem`、`CardLinks`、`MentionAuto`、`Mention`。
- `CardEditor` 现有的卡片专属逻辑（title/icon/cover、comments、media、save bar）不进入 `ConceptEditor`；`ConceptEditor` 只保留正文、目录、保存/发布。
- 提及选择器只列 `is_public=true` 的卡片（首片策略）；已发布正文里若某卡片后来转私有，公开读页把该提及降级为纯文本、不计数、不链接。编辑器对非公开卡片不提供提及；`CardLinks`/`MentionAuto` 也用公开卡片列表，避免 `@` 自动链接到读者打不开的卡。
- 引用只来自显式 `mention` 节点，不来自 `CardLinks` 的自动链接装饰；编辑器里保留自动链接作为导航提示，但「本页引用」只数 `@` 提及。读页关闭 `RichText` 的自动链接（新增 `autoLink` 开关），只渲染显式提及。

### 保存与发布

沿用 `CardEditor` 的自动保存节奏（850ms debounce、`dirtyRef`、`savingRef`、版本号、失败重试）：

1. 首次打开：`GET /concept/edit/`；有 `draft_json` 用草稿，否则用 `body_json`，都为空则空文档。
2. 编辑：本地更新 + 850ms 后 `PATCH /concept/`；状态 `saving → saved`；失败 `error`，保留本地内容，显示「重试」。
3. 离开页面前有未保存内容：`beforeunload` 提示；`Cmd/Ctrl+S` 立即保存。
4. 预览：首片在编辑器内用 `WorldConceptPage` 的只读渲染预览草稿（不写公开缓存）；公开 `?preview=1` URL 后置。
5. 发布：确认「公开读页会更新」；`POST /concept/publish/`；成功后 `body_json=草稿`，状态「已发布」，公开读页切换；后续编辑显示「未发布的修改」。
6. 冲突：首片最后写入者胜；不做 `If-Match` / 多标签页锁；在编辑器提示「另一个标签页可能覆盖」，后续再加草稿版本号。
7. 发布失败：保留草稿与弹窗；不把失败状态显示成已发布。

### 状态

| 状态 | UI |
|---|---|
| 首次进入 / 无概念 | 空文档 + 「从模板开始」+ 世界名/简介 |
| 已保存 | Topbar「已保存 HH:MM」/ 已发布 |
| 保存中 | 「自动保存…」+ spinner |
| 保存失败 | 「保存失败 · 重试」+ 本地内容保留 |
| 草稿 | 「草稿」+ 未发布提示 |
| 已发布 | 「已发布」+ 公开页链接 |
| 发布中 | 「发布中…」+ 禁用按钮 |
| 空内容发布 | 按钮禁用，提示「先写一点内容」 |
| 只读 / 无权限 | 不进入编辑器；viewer 走公开读页 |
| 未保存离开 | `beforeunload` 提示 |

## 读页、索引与导航

### `/w/:slug/wiki`

- 有已发布概念：`WorldConceptPage` 按视觉稿渲染；无：回退现有 `WikiPage` 网格，owner/editor 看到「写下第一篇概念」入口。
- 读页数据：`fetchWorld` + `fetchWorldConcept`（SSR 时由 server 预取）；只使用 `body_json`，不读草稿。
- 版式按视觉稿：3:4 封面、标题/简介、元信息/纪元、左目录、正文、右栏统计、本页引用（右栏 + 文末）、owner 编辑入口、`SiteFoot`。
- TOC 由 `RichText` 的标题 `sec-N` 生成；首屏滚动跟随、进度线；移动端折叠为「目录 · N 节」。
- 引用：从 `body_json` 的显式 `mention` 节点取卡片 id，按公开卡片去重计数；右栏显示 `本页引用 x / y`，文末列出 chips；未引用数量来自公开卡片总数。
- 排版数据块：首片用普通表格/引用呈现设计稿里的潮汐历数据块；自定义 `worldTimeline` 节点后置。
- 读页 overline：`is_public_read=true` 时按设计稿写「WORLD CONCEPT · 公开阅读」；`is_public_read=false` 的成员读页不在 M1，匿名仍 404（API 层成员可读，读页后置）。
- 「本页引用」右栏 + 文末双份是已确认设计；不要合并。

### `/w/:slug/wiki/cards`

- 首片：复用现有 `WikiPage` 网格（`site-hero` 世界信息 + 集合分区 + 卡片格），标题显示「设定集」，`SiteHeader` 的「设定」active；卡片点击仍进卡片页。
- 第二阶段（M2，已完成）：视觉稿的树形筛选、被引用次数、未被概念引用标记。
- `/wiki/cards` 不能被当作卡片 slug；卡片详情路由要在 SSR/客户端路由层排除。

### 导航

- `SiteHeader` 世界模式：`世界 / 设定 / 时间线 / 地图 / 工作区`；`世界` → `/wiki`，`设定` → `/wiki/cards`；不再在顶栏列人物/地点/事件集合。
- `WorldNav`（地图/时间线页）同步这组标签：`世界 / 设定 / 时间线 / 地图 / 工作区`。
- 读页 active=`world`，索引/卡片 active=`cards`，编辑器由 Workspace 自己承载。
- 卡片页面包屑「首页」改「世界」；卡片页仍属「设定」。

## 前端文件与组件

| 文件 | 变更 |
|---|---|
| `frontend/src/types.ts` | `WorldConcept` / `WorldConceptEdit` / `ConceptResponse` / `ConceptImageAsset` 类型 |
| `frontend/src/api.ts` | `fetchWorldConcept` / `fetchWorldConceptEdit` / `saveWorldConceptDraft` / `publishWorldConcept` / `fetchWorldMedias` / `uploadWorldMedia` |
| `frontend/src/app/routes.ts` | `wiki-cards`、`concept-edit`（或 workspace + concept 标志）；保留 slug |
| `frontend/src/app/RouteView.tsx` | 懒加载 `WorldConceptPage`；Workspace concept 入口；SSR initial |
| `frontend/src/components/WorldConceptPage.tsx`（新） | 读页/回退；Hero、TOC、正文、右栏、引用、owner 编辑 |
| `frontend/src/components/ConceptEditor.tsx`（新） | 正文 Tiptap、目录、保存/发布/预览、模板、媒体库入口；复用共享扩展 |
| `frontend/src/components/MediaLibraryDialog.tsx`（新） | world-scoped 图片列表/上传/选择；URL 入口；加载/空/失败/上传中状态 |
| `frontend/src/components/Workspace.tsx` / `Sidebar.tsx` / `Topbar.tsx` | 世界概念入口、concept 模式、状态、发布 action、面包屑 |
| `frontend/src/components/WikiPage.tsx` | 索引模式、卡片页 active/breadcrumb、回退 CTA；保留现有网格 |
| `frontend/src/components/SiteHeader.tsx` / `WorldNav.tsx` | 新世界导航；移除 `sections` 依赖或兼容 |
| `frontend/src/components/RichText.tsx` | `mentionMode="reading"`（label + 上标，无 `@`）、`autoLink` 开关 |
| `frontend/src/editor/extensions.ts`（新） | 从 CardEditor 抽出的共享扩展工厂 |
| `frontend/src/components/CardEditor.tsx` | 改用共享扩展工厂，行为不变（回归风险最高） |
| `frontend/src/styles/world-concept.css`（新） | 读页/索引/编辑器壳样式；沿用 tokens/字体/ContourPlate |
| `frontend/src/ssr/entry-server.tsx` / `entry-client.tsx` | `WorldConceptPage` 的 SSR/hydration；`renderConcept`；初始数据类型 |
| `frontend/server.mjs` / `server.prod.mjs` | `/wiki` 概念数据、`/wiki/cards`、`/wiki/edit` SPA、`cards/edit` 保留 slug |
| `frontend/src/components/WikiPage.tsx` / `SiteFoot` | owner 编辑入口/CTA；不改变公开页脚 |

## 权限与审计

- owner/editor：读草稿、保存、发布；viewer：只读公开读页；匿名：`is_public_read=true` 的世界只读，`is_public_read=false` 的世界 404。M1 读页/SSR 只覆盖公开可读世界。
- 表单沿用 session auth + CSRF；API 用 `get_world_for_read` / `get_world_for_write`。
- 世界可见性仍由 `World.is_public_read` 控制；概念「发布」不等于公开世界。
- 发布写 `WorldAuditEvent.Action.CONCEPT_PUBLISHED`（`concept.published`），metadata 带 `revision`；草稿保存不记审计。
- 不新增 `WorldConcept` 成员/权限表；沿用 `WorldMembership`。
- 概念图片 GET/POST 仅 owner/editor；viewer 403、匿名 401；按 world 隔离，不跨世界；图片 URL 公开，列表不公开。

## SSR 与路由

- `/w/:slug/wiki`：`is_public_read=true` 的世界 SSR；server 预取 world + concept；有发布概念渲染 `WorldConceptPage`，否则 `WikiPage` 回退。`is_public_read=false` 的成员读页不在 M1。
- `/w/:slug/wiki/cards`：SSR `WikiPage` 索引；server 预取 world。
- `/w/:slug/wiki/:cardSlug`：现有卡片 SSR；`cards` / `edit` 排除。
- `/w/:slug/wiki/edit`：SPA shell（Workspace concept 模式），不 SSR；未登录/无权限走现有 SPA 403/登录。
- `entry-server` 新增 `renderConcept` / 初始数据 kind；`entry-client` 对应 hydration；`WikiPage` 保留卡片/索引。
- `server.mjs` / `server.prod.mjs` 的 `/wiki` 正则要显式分支 `/wiki/cards`、`/wiki/edit`，不能把 `cards`/`edit` 当卡 slug。
- SSR 只取已发布概念；不把 `draft_json` 发到公开 HTML；编辑器预览用 `GET edit` 的草稿在客户端渲染，公开 `?preview=1` 后置。

## 首片验收

### 后端

- 无发布会话读 `/concept/` → 404；有发布 → 200，且响应不含 `draft_*`。
- 匿名/非成员 PATCH/POST → 401/403；viewer → 403；owner/editor → 200。
- 无概念时 `GET edit` → `exists:false`；PATCH 创建；草稿保存不改变公开 GET。
- 发布后公开 GET 返回正文；`revision` +1；`published_at` 非空；审计 `concept.published` 存在。
- 空草稿发布 → 400；超过 64 层正文 → 400；`is_public_read=false` 匿名 GET → 404；成员 API 可读，但 M1 不承诺成员读页/SSR。
- 概念不创建 `Card`；`world.cards` 计数不变；`WorldDetail.cards` 不含概念。
- 概念图片：owner/editor GET/POST 200；viewer 403、匿名 401；跨世界 404；>4 MB 或非 PNG/JPEG/WebP 400；上传返回 URL；不创建 `Card`。
- 测试放 `apps/worlds/tests.py`（或新 `test_concept.py`）；跑 `cd backend && .venv/bin/python manage.py test`，`make ci` 覆盖前后端。

### 前端 / 浏览器

- owner 从工作区「世界概念」进入：空态 → 写 → 自动保存 → 刷新仍在 → 预览 → 发布。
- 发布后匿名 `/wiki` 看到读页；未发布草稿不出现在匿名读页；修改草稿后公开页不变，再次发布才更新。
- viewer 不能进入编辑器；公开读页 owner 有「编辑」、匿名没有。
- `/wiki/cards` 索引可打开；`/wiki/edit` 不被当成卡片；`/wiki/cards` 不被当成卡片。
- 回退：无发布概念的世界 `/wiki` 仍是现有网格，owner 看到写概念入口。
- 读页按视觉稿在 1440 / 1024 / 768 / 390 检查：三栏→两栏→单栏、目录折叠、无横向溢出、浅/深色、TOC 跟随、引用双份。
- 公开读页面包不引入 Tiptap；编辑器仍在 Workspace chunk；`npm run build` 与 `npm run build:all` 通过；`make ci` 通过。
- SSR dev（`npm run dev:ssr`）与 prod（`npm run build:all && npm run preview:ssr`）的 `/wiki`、`/wiki/cards`、卡片页、`/wiki/edit` 各验一次。
- 编辑器：`@` 提及、卡片名自动链接、表格、引用、图片 URL、媒体库、模板、`Cmd/Ctrl+S`、保存失败重试、发布确认、未保存离开提示。
- 媒体库：加载 / 空 / 上传 / 选择 / URL；上传中禁用、失败可重试；图片插入读页；焦点/ESC/移动端。

## 分阶段

| 阶段 | 内容 |
|---|---|
| M1（首片） | `WorldConcept` / `WorldMedia` 模型/迁移/API/测试；共享媒体库（上传/列表/选择）；共享编辑器扩展；Workspace 概念模式 + Sidebar 入口；`/wiki` 读页/回退；`/wiki/cards` 索引；导航；`RichText` 读页提及；SSR 读页/索引；读页引用计数（本页引用 x/y；索引卡片计数 M2 已补） |
| M2 | 词条侧窥 + 「出现在」反链；索引树/被引用次数/未引用标记；读页 `本页引用` 交互打磨 | ✅ 2026-10-27 |
| M4 | 全部完成：旧 `CardImage` 删表；ZIP 概念/历史往返；公开搜索/RSS；`worldTimeline` 块；概念评论；草稿并发控制；私有成员读页 |

## 已知限制

1. M1 只有一个草稿 + 一个已发布快照；M3 已补 `WorldConceptRevision` 版本历史（公开页仍只读当前快照）。
2. 草稿保存最后写入者胜；多标签页可能互相覆盖。
3. 概念已进入 ZIP 导出/导入（含历史快照）、公开搜索与 RSS；审计 CSV 仍只导出世界审计事件。
4. 共享世界媒体库首片只做上传/列表/选择；删除、旧 `CardImage` 表清理后置。图片 URL 是公开 media URL（与现有卡片图片一致），首片不做访问控制/回收。
5. 首片不渲染视觉稿的潮汐历自定义数据块；先用表格/引用。
6. 首片不做词条侧窥；正文提及先链接到卡片页；M2 已补侧窥/反链。
7. 私有卡片提及策略：首片只允许提及公开卡片；已发布后卡片转私有会降级为纯文本、不计数；不做“私有提及”产品决策。
8. `world-overview` 特殊卡仍是旧数据；不把它当概念，首片不删除/迁移。
9. 概念标题/简介直接来自世界；如果以后需要单独标题，再加字段/迁移。
10. 编辑器复用 Workspace 壳；不是独立的无侧栏全屏编辑器；视觉稿的读页先落地，编辑器壳后续可再调。
11. `is_public_read=false` 的成员读页不在 M1；首片只落地公开可读世界的读页/SSR。
12. 首片编辑器内预览；公开 `?preview=1` 预览 URL 后置。

## 已确认的取舍（2026-10-27）

1. 编辑器放在 Workspace 的概念模式。
2. 首片接受「读页/索引 SSR + 编辑器 CSR」。
3. 图片：共享世界媒体库 + URL；卡片/概念编辑器共用上传/列表/选择；删除/旧卡表清理后置。
4. 私有卡片首片只允许公开提及。
5. M1 不做侧窥/索引树/索引卡片的被引用次数；M2 已补；读页「本页引用 x/y」保留并加入处数。
6. `is_public_read=false` 的成员读页后置；M1 只做公开可读世界。

已确认的 3:4 封面、世界/设定导航、「本页引用」右栏 + 文末双份继续按上表执行。

## ADR 信号

这是一个新的世界级文档 owner：

- 新增 `WorldConcept` 持久化与公开契约；
- 明确「概念不是 Card」，不进入卡片计数/搜索/自动链接；
- 草稿/发布双版本与公开读页边界；
- 新增 `/wiki` 读页、`/wiki/cards` 索引、`/wiki/edit` 编辑入口。

设计通过后、实现完成时补 `docs/adr/ADR-0024-world-concept.md`，记录 owner、边界、draft/publish 和后续兼容/导出问题。本 spec 只定作者体验与首片范围，不替代 ADR。
