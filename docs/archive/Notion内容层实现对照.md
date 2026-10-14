# Notion 内容层实现对照（REA 逆向证据表）

> **分析对象**：Notion Web 客户端（`app.notion.com` 的 rspack JS 产物，只读采样）
> **分析工具**：REA v3.1.0 —— `rea.javascript-application-analysis/v2` Evidence 契约（每条结论带 `evidence_id` + `subject.digest.sha256`，可复算）
> **采样时间**：2026-10-13 ｜ **分析时间**：2026-10-14
> **分析目的**：把 Notion「内容层」（编辑器 / 集合-数据库 / 本地缓存 / 数据获取）的实现方式，固化为可追溯的结构结论，供本项目（`world/`）改进参考。
>
> **口径与边界（必读）**：
> 1. Notion 服务条款禁止抓取与复制其代码/样式。本文**只写结构结论与证据编号**，**不复制**任何客户端代码、样式或资源；`/tmp/notion-web` 的 6.2 MB 客户端产物**一行都没有进仓库**。
> 2. 分析对象**仅是客户端**。服务端 CRUD / 存储 / 事务模型**不可观测**，本文凡涉及服务端处一律标「未观测」。
> 3. 方法沿用 `docs/design-reference/README.md` 的「**抄结构，不抄样式**」；本文只碰结构层。

---

## 0. 证据分级与命名（沿用《Opuscule功能调研.md》0.2 节）

| 级别 | 来源 | 本文对应 | 说明 |
| --- | --- | --- | --- |
| **A（官方、结构化）** | 官方产物 + 机器可校验 | **REA Evidence v2 包**（`evidence_id` + `subject.digest.sha256`）、`docs/design-reference/` 的 DOM/computed-style 实测 | 最硬证据：来自官方客户端产物，结论可复算 |
| **B（官方、视觉）** | 官方演示视频与图片 | `docs/design-reference/shots/` 截图 | 只覆盖营销片/截图演示到的部分 |
| **C（第三方）** | 目录站、评测、社区讨论 | （本文未采用） | 单独标注 |
| **D（我方推断）** | 由以上证据推出的结论 | 架构意图、分层归类、与 `world/` 的差距推断 | 凡推断都写明「推断」 |

> **本机静态扫描的归属**：本文的「store 注册表」「chunk 注册表」是**本机脚本对官方产物的机械扫描**（非 REA 包，因而无 `evidence_id`），但对象是官方产物、且可复现，按 **A** 级对待，并在 §10 注明其证据文件位置。
>
> **证据标识的两段式**：每条 REA 结论记为 `ev_<sha256>` ＋ `subject.digest.sha256`（产物摘要）。前者标识「这一次分析」，后者标识「被分析的那份产物」；二者配合即可复算。

---

## 1. 结论先说

| # | 结论 | 级别 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 内容层是**纯 SPA**：单页 + React + **rspack** 打包，chunk 运行时挂在 `globalThis.rspackChunknotion_next`，模块以 `.push([[id],{ moduleId(e,t,o){…} }])` 注册 | A | §2.1（22 处运行时常量） |
| 2 | 数据获取自建在 **TanStack Query** 之上：`TanStackQuery` / `NotionQueryClient` / `QueryStore` / `EnsureNotionQueryClient` 是**具名 chunk** | A | §2.3 |
| 3 | 有**本地持久化缓存层**：`opfs-*` 系列 worker（集合/页面/会议纪要）＋ `wasm-sqlite-worker`，即 **OPFS + WASM SQLite** 的离线读模型 | A | §2.4、`ev_30431f04…`（`execSqliteBatch`/`waitForOpfsChunk`/`startSpeculativeDataFetch`） |
| 4 | 状态管理是 **store-per-concern**：43 个 chunk 内共抽到 **193 个 store key、60 个访问器、46 处 store 基类继承**；**没有** `createStore` 这种工厂（`createStore` 出现 0 次） | A | §4 |
| 5 | 集合/数据库层拆得极细：**「集合/数据库层」类 store 就有 66 个**（`collectionStore`/`viewStore`/`rowStore`/`collectionViewBlockStore`/`collectionSchemaStore`…），且 store 以**字符串 key** 被引用，靠 `getXxxStore()`/`findXxxFromStore()` 取用 | A | §4 |
| 6 | 「**行就是页面**」在产物层被再次印证：行级 store 名为 `rowStore` / `currentRowStore` / `pageRecordStore` / `pageCollectionStore`，行与页面共用一个记录模型 | A | §3.2 |
| 7 | **单模块体积**是语义分析成败的真正变量：711,942 B 的单 module factory → 语义图仅 1 个节点（失败）；按顶层语句切成 7 片后**全部成功**（语义节点 13,069–25,191） | A | §6、`ev_30693c24…` vs `ev_92e1fd8c…`…`ev_3355aa09…` |
| 8 | **运行时观测通道已打通**，但当前 CDP profile 未登录 Notion → 只能取到空 target 列表 | A | §7、`ev_cecfd0cd…` |

**一句话**：Notion 内容层 = **单 SPA（React + rspack）＋ TanStack Query 数据层 ＋ OPFS/SQLite 本地缓存 ＋ 极致细分的 store-per-concern**；其集合-数据库能力（视图/筛选/排序/分组/公式/rollup）被拆成几十个各管一件事的 store，而我们的 `world/` 目前把这些收在 `Document.settings_["table"]` 里。

---

## 2. 内容层总体架构

### 2.1 打包与加载：rspack 单 SPA

| 观测项 | 值 | 证据 |
| --- | --- | --- |
| chunk 运行时常量 | `globalThis.rspackChunknotion_next`（产物中出现 **22** 次） | A · 本机 `grep` 复现 |
| 模块注册形制 | `.push([[<numeric id>], { <moduleId>(e,t,o){ … } }])` | A · 本机 `grep`（`29013`/`46790`/`10294` 等） |
| 单个 chunk 可含模块数 | 1（如 `CollectionViewBlock` 的 g03 片）～ **1,974**（`notion-web-big`，`ev_db536810…`） | A · `ev_30693c24…`、`ev_db536810…` |
| 路由/外壳 chunk | `TopbarMoreButton`、`desktop`、`generic-table-virtualization` 等归「外壳/跨端」（G 类 40 个） | A · §5 |

> **D（推断）**：`notion_next` 这一运行时名暗示存在代际更替的构建流水线（`notion` → `notion_next`），即内容层经历过一次打包体系迁移；本文的「内容层」结论取自迁移后的产物。

### 2.2 UI 框架

`node_kinds` 统计里反复出现 `function`/`call-site`/`property-slot` 的高占比，配合 chunk 名 `ClientFramework`（`ev_0c2ae51b…`，208 模块、42,656 语义节点）与函数标签 `getInitialState` / `scheduleFlushAfterNextPaint` / `provide` —— **A**：这是 React 系（含 `getInitialState` 这类类组件初始化、`scheduleFlushAfterNextPaint` 这类调度）的客户端框架层。控件层（`SelectableHoverMenuOverlay`、`TableHeaderCellMenu` 等）按「可选元素 + 浮层」组织。

### 2.3 数据获取：TanStack Query 之上再包一层

- 具名 chunk：`TanStackQuery`、`NotionQueryClient`、`QueryStore`、`EnsureNotionQueryClient`、`sidebarCollectionQueryRefresh`、`createHasSchemaChangedForQueryStore` —— **A**（§5 注册表）。
- `QueryStore` 单文件分析（`ev_061052b6…`，2 模块、8,314 B）抽到的方法标签：`setOptions`、`createResult`、`updateResult`、`fetch`、`fetchOptimistic`、`fetchPreviousPage`、`onSubscribe`、`onUnsubscribe`、`onQueryUpdate`、`shouldFetchOnReconnect`、`trackProp`、`bindMethods`、`destroy`；关系里出现 `returns-task`(2)、`owns`(1)、`creates-promise`(3) —— **A**。
- `createHasSchemaChangedForQueryStore`（`ev_c6993a85…`）—— **A**：存在「schema 是否变化」这条查询失效判据（对应「集合视图的列/公式变了要不要重新取数」）。

> **D（推断）**：Notion 没有直接裸露 TanStack Query，而是用 `QueryStore` 把「订阅/乐观更新/断线重取/上一页」封成自有契约，再套 `/api/v3` 的批式接口。服务端接口形态**未观测**。

### 2.4 本地缓存：OPFS + WASM SQLite

- 具名 chunk（C 数据/网络/存储类）：`opfs-collection-cache-worker`、`opfs-page-cache-worker`、`opfs-meeting-notes-cache-worker`、`wasm-sqlite-worker`、`wasm-sqlite-shared-worker`、`collectionsOpfsCacheComparison`、`offlineSync`、`offlineSettings`、`transport-support`、`qliteCorruptionRecoveryStatusStore`（原文如此） —— **A**（§5）。
- 单文件分析 `notion-web/…/one-app`（`ev_30431f04…`，610,253 B、86,234 语义节点）函数标签含 `execSqliteBatch`、`waitForOpfsChunk`、`startSpeculativeDataFetch`、`readOrStart`、`markRequestFirstChunkEnd` —— **A**；关系图里出现 `request`(1)、`constructs-request`(1)、`supplies-request-field`(1)、`dispatches-candidate`(4) —— **A**。

> **D（推断）**：这是一个**离线优先读模型**：数据先落到 OPFS 上的 SQLite（`execSqliteBatch` 批写），页面按 chunk 取（`waitForOpfsChunk`），并会「投机取数」（`startSpeculativeDataFetch`）；还有一个「opfs 缓存损坏恢复」状态 store（`qliteCorruptionRecoveryStatusStore`）。**服务端写入路径未观测**。

---

## 3. 集合 / 数据库层的实现要点

### 3.1 「数据库是块的一种」，且视图是数据之上的一层壳

- `docs/design-reference/dom-skeleton.md`（A，DOM 实测）：`collection_view-block` 与 `text-block` 是**同级兄弟**；`collection_view-block → collection-view-body → table-view → table-view-row/cell`，换视图只是换这层壳。
- 产物侧佐证（A，§4）：`collectionViewBlockStore`、`collectionViewStore`、`currentCollectionViewStore`、`existingCollectionViewStore`、`newCollectionViewStore`、`dashboardCollectionViewBlockStore`、`instanceCollectionViewBlockStore`、`pageViewBlockStore` —— 「视图」既有「定义（settings）」也有「实例（instance）」，二者分开存。
- 视图种类：`collectionGalleryViewStore`（画廊）、`simpleTableStore`/`tableStore`（表格）、`calendarStore`（日历）、`CollectionChartView`（图表，具名 chunk） —— **A**。

### 3.2 行 = 页面（记录模型层）

- `rowStore`、`currentRowStore`、`startRowStore`、`pageRecordStore`、`pageCollectionStore`、`recordStoreUIParentStore`、`findCellsInRowFromStore`、`findCellsInColumnFromStore` —— **A**（§4）。
- `docs/design-reference/dom-skeleton.md`：行 DOM 同时带 `notion-page-block` + `notion-collection-item` —— **A（实测）**。

> **D（推断）**：行不是「集合里的一条数据」，而是「一个页面被集合视图投影出来」；因此「改单元格=改页面」是天然成立的（对应项目文档里「行即页面」的结论）。

### 3.3 视图配置的细分 store（这是 Notion 与我们差距最大的一块）

| 关注点 | Notion 的 store / chunk（A） | 我们的现状 |
| --- | --- | --- |
| 筛选 | `createFilterSettingsStore`、`filterBarCreateFilterSettingsStore` | 收在 `Document.settings_["table"]` |
| 排序 | `createSortSettingsStore` | 同上 |
| 分组 | `groupsResultStore`、`groupsReducerResultStore`、`groupsLimitStore`、`hoveredGroupStore` | **无分组** |
| 聚合/公式 | `aggregates` / `dispatches-candidate` 关系出现在 `TableHeaderPropertyCreationMenu`（`ev_f7368a46…`，`aggregates`:1）；`normalizedSchemaStore`、`typecheckResultStore`、`collectionSchemaStore` | **无 Rollup/Aggregate**（`world/` 下 `rollup|aggregate` 零匹配） |
| 可见性 | `collectionViewVisibilityStore`、`frozenColumnRepositionStore`、`frozenIndexStore`、`frozenSectionWidthStore` | 无冻结列 |
| 子项（sub-item） | `subitemTreeStore`、`subitemExpandedStore`、`currentSubitemFormatStoreForUiDisplayStore` | 无子项树 |
| 选择/批量 | `bulkSelectionStore`、`normalizedTableSelectionStore`、`activeRangeStore`、`tableSelectionOverlay*` | 无区域选择 |
| 拖拽填充 | `dragAndFillStore`、`dragAndFillStateStore`、`isDraggingViaTimelineItemStore` | 无 |

> 依据：§4 全表 + §5 注册表 + `ev_f7368a46…`。**D（推断）**：Notion 把「视图 = 一份可序列化的设置对象」拆成若干正交 store，任何一处改动只惊动一个 store；我们把同样的东西压成一个 JSON 字段，改动粒度粗、并发/撤销难做。

### 3.4 属性/表头菜单（一处可观测的「属性即列」证据）

- `TableHeaderPropertyCreationMenu`（`ev_f7368a46…`）：173,593 B、135 模块、语义节点 27,105；关系里含 `aggregates`(1)、`dispatches-candidate`(1)、`returns-task`(6)、`awaits`(37)；函数标签含 `getKey`、`setRestrictedGeoPolicyApplied` —— **A**。
- `TableHeaderCellMenu`（`ev_096c52e8…`）：149,331 B、109 模块 —— **A（仅统计）**；语义图**失败**（见 §6）。
- 失败项：`RelationPropertyMenu` 一次分析返回 `unreadable_output`（详见 §10）。

---

## 4. store 注册表（本机静态扫描 · A 级）

**扫描方法**：对 43 个内容层 chunk 产物做静态扫描，抽取 ① `extends <x>().Store` 形态的基类继承；② 以 `xxxStore` 结尾的标识符；③ `getXxxStore`/`findXxxFromStore` 形态的访问器。脚本产物见 §10。

| 指标 | 数值 |
| --- | --- |
| 扫描 chunk 数 | 43 |
| store 基类继承处（`… .Store`） | **46**（本机 `grep -o "\.Store\b"` 复算 = 46） |
| 抽到的 store key | **193** |
| 访问器（`get*/find*…Store`） | **60** |
| `createStore` 工厂 | **0**（`grep` 复算 = 0） |

**store 按关注点归类**（归类为 D 级推断，key 名为 A 级）：

| 归类 | 数量 | 代表 key |
| --- | --- | --- |
| 集合/数据库层 | 66 | `collectionStore`、`viewStore`、`rowStore`、`collectionViewBlockStore`、`collectionSchemaStore`、`allRowsStore`、`sortedResultsStore`、`groupsResultStore`、`subitemTreeStore` |
| UI 交互层 | 30 | `dragAndFillStore`、`bulkSelectionStore`、`popupStore`、`menuListStore`、`mouseStore`、`frozenIndexStore`、`mainEditorCurrentBlockStore` |
| 其它（块/页面/表单/文件…） | 70 | `blockStore`、`pageStore`、`currentPageStore`、`fileUploadStore`、`formQuestionStore`、`templateStore`、`searchQueryStore` |
| 协作/权限/发布 | 8 | `commentStore`、`threadStore`、`presenceStore`、`replyToCommentStore`、`syncProgressStore` |
| 设置/用户偏好 | 7 | `userSettingsStore`、`settingsStore`、`currentSpaceStore`、`userSettingsStartOfWeekStore` |
| 路由/外壳/主题 | 6 | `abbedRouterStore`（原文如此）、`sidebarSpaceStore`、`normalizedTableSelectionStore` |
| 应用/空间全局 | 3 | `spaceStore`、`spaceUserStore`、`spaceViewStore` |
| AI/自动化/集成 | 3 | `automationStore`、`workflowStore`、`sourceAutomationStore` |

**访问器样本（A）**：`getCollectionStore`、`findCollectionViewBlockFromStore`、`findCellsInColumnFromStore`、`findCellsInRowFromStore`、`getPropertyStore`、`getPropertyFormatsStore`、`getVersionStore`、`getPublishedArtifactStore`、`useSyncExternalStore`…

> **D（推断）**：store 以**字符串 key** 注册、靠访问器取用，是一套「按关注点切分 + 惰性解析」的依赖注入；`useSyncExternalStore` 说明 React 通过它订阅。这套结构让「一个数据库视图同时挂着 schema / 结果 / 分组 / 选择 / 冻结」而互不耦合——**这正是我们单 JSON 字段方案的天花板所在**。

---

## 5. chunk 注册表（本机静态扫描 · A 级）

**扫描方法**：对采到的具名 chunk 列表（1418 条）按名称语义归类。名称为 A 级（来自产物），归类为 D 级。

| 分类 | 数量 | 代表 chunk |
| --- | --- | --- |
| A 集合/数据库视图 | 64 | `XldbTableFullPage`、`CollectionChartView`、`TableHeaderPropertyCreationMenu`、`collectionsOpfsCacheComparison` |
| B 交互/菜单/浮层 | 260 | `SelectableHoverMenuOverlay`、`slashMenu`、`TableHeaderCellMenu` |
| C 数据/网络/存储 | 60 | `TanStackQuery`、`NotionQueryClient`、`QueryStore`、`EnsureNotionQueryClient`、`wasm-sqlite-worker`、`opfs-page-cache-worker`、`offlineSync`、`transport-support` |
| D 编辑器/块 | 121 | `codeBlockValue`、`FormBlock`、`formulaEditor`、`selectableBlockActions` |
| E 空间/设置/权限 | 89 | `TeamStoreLocation`、`ExternalOrgDataStore` |
| F AI/自动化/集成 | 113 | `AIChatStore`、`AgentWorkerRunList`、`WorkerReferenceBlock` |
| G 外壳/跨端 | 40 | `desktop`、`TopbarMoreButton`、`SimpleTableEditUI`、`generic-table-virtualization` |
| H 路由/配置 | 46 | `sidebarClientMode`、`sidebarCollectionClientMode` |
| I 图标 | 368 | （图标集合） |
| K 特性开关 | 1 | `enableSkillPageActions` |
| Z 其它 | 256 | `RecordMap`、`DeferredNotionListeners`、`whiteScreenReporter` |

> 依据：§10 汇编文件。**D（推断）**：**图标 368 个**与**集合/数据库 64 个**并列，说明内容是「用图标系统铺满的表格/视图产品」；`wasm-sqlite-*` × 2、`opfs-*-worker` × 3 共同印证 §2.4 的本地读模型。

---

## 6. 单模块下钻：712 KB 语义图失败 → 切片修复

### 6.1 现象

`CollectionViewBlock` 的 g03 片，是**单个 module**（`module_id 930489`）、factory 正文 **711,942 字节**、**396 个顶层语句**：

| 分析对象 | 字节 | 模块 | AST 节点 | `truncated_scopes` | 语义节点 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 原始 g03（`ev_30693c24…`，sha256 `a272a499…`） | 711,942 | 1 | — | 1 | **1** | **失败**（语义图退化到只有 module 节点） |

### 6.2 修复：按顶层语句切片，逐片再分析

用 acorn 把 g03 的 factory body 按 **60 条顶层语句/片**切成 `p000–p006`（末片 36 条），每片放进**独立目录**单独分析：

| 切片 | 字节 | AST 节点 | `truncated_scopes` | 语义节点 | 语义关系 | 指纹 | evidence_id |
| --- | --- | --- | --- | --- | --- | --- | --- |
| p000 | 77,113 | 20,449 | **1** | 13,069 | 20,450 | 284 | `ev_92e1fd8c…` |
| p001 | 80,287 | 22,820 | 0 | 14,812 | 25,043 | 323 | `ev_27ec29b2…` |
| p002 | 108,119 | 30,632 | 0 | 19,686 | 35,075 | 445 | `ev_acbf2fe7…` |
| p003 | 131,212 | 38,512 | **1** | 25,191 | 43,400 | 537 | `ev_75b1b48e…` |
| p004 | 121,837 | 32,879 | **1** | 21,150 | 38,109 | 476 | `ev_28e95339…` |
| p005 | 94,125 | 26,619 | **1** | 16,786 | 29,353 | 326 | `ev_b2c492ed…` |
| p006 | 99,958 | 28,284 | **1** | 18,230 | 32,268 | 474 | `ev_3355aa09…` |

### 6.3 结论（本轮最重要的方法学结论）

1. **7 片语义图全部成功**（语义节点 13,069–25,191），原始单模块仅 1 → **切片即可解除失败**。
2. **`truncated_scopes: 1` 不是失败的充分条件**：7 片里 **5 片仍 `truncated_scopes:1` 但语义图成功**。它只是「分析器触到某个内部上限」的信号，**不是**语义图退化的判定依据。
3. 真正的变量是**单 module factory 的体积**：711 KB 单工厂会撞上分析器的内部作用域上限，导致语义图只吐根节点。

> **D（推断）**：这与「分析器对单个作用域有节点/耗时预算」一致——顶层语句切分把一个大作用域拆成 7 个小作用域，各自落在预算内。
>
> **可操作的落地**：凡遇到「语义节点数 = 1 且 `truncated_scopes ≥ 1`」，先按**顶层语句数**（而不是字节数）切片重跑，再谈结论。

**旁证（A）**：同类失败与规模强相关——`CollectionViewBlock` 整文件（`ev_7c4f39c6…`，816,294 B / 100 模块）失败；`TableHeaderCellMenu`（`ev_096c52e8…`，149,331 B）失败；`notion-web-big`（`ev_db536810…`，3,692,071 B / 1,974 模块）失败；`RecordMap`（`ev_97520d3f…`，798,831 B / 320 模块）**触到 100,000 语义节点上限**。反之，几十~十几万字节的多模块文件普遍成功。

---

## 7. 运行时观测（CDP + REA）

| 项 | 值 |
| --- | --- |
| provider | `rea-cdp-browser v2`（REA Chrome DevTools Protocol observation provider） |
| predicate | `rea.browser-target-list/v1` |
| 环境变量 | `REA_BROWSER_OBSERVE_ENABLED=true` ＋ `REA_BROWSER_CDP_ENDPOINTS_JSON='["http://127.0.0.1:9222"]'` ＋ `REA_BROWSER_ALLOWED_ORIGINS_JSON='["https://app.notion.com","https://www.notion.so"]'` |
| 命令 | `rea list-browser-targets http://127.0.0.1:9222 --approved --format json`（endpoint 为**位置参数**） |
| browser.product | `Chrome/155.0.8059.40`（存活） |
| targets.total | **0** |
| evidence_id | `ev_cecfd0cd3134eae5a814c37b0c4cdfb255bb0c8a26cf93319fff3dc7c2471589` |

> **结论（A）**：REA 的浏览器观测**通道已打通并可复现**（返回完整 Evidence v2 包）。
> **边界**：CDP profile（`~/.cache/rea-cdp-profile`）**未登录 Notion**，也没有已打开的 `app.notion.com` 页面 target，因此 `targets.total = 0` —— 运行时（执行期）证据本轮**只能到「工具可用、无 target」**。要取执行期证据需要：在该 profile 登录 Notion 并打开目标页面（涉及账号，未代为登录）。
> **影响**：§2–§6 的结论目前**全部是静态（产物）证据**；运行时行为（真实请求、真实 OPFS 写入、交互时序）**待补**。

---

## 8. 与我们项目（`world/`）的差距对照

> 左列依据 §2–§7 的 **A 级**结论；右列依据本项目源码审计（`world/models.py`、`world/views.py`、`world/publish.py`）。右列结论为 **D（推断）**。

| 维度 | Notion 内容层（A） | 我们的 `world/`（D） | 差距性质 |
| --- | --- | --- | --- |
| 打包/运行 | 单 SPA，rspack，chunk 化按需加载 | Django 模板 + 原生 JS，整页/整脚本 | 架构不同，**不必追** |
| 数据获取 | `QueryStore` 封 TanStack Query：乐观更新/断线重取/分页 | 每次 fetch + 局部重渲染 | 可借鉴：**乐观更新**与**失效判据**（`createHasSchemaChangedForQueryStore` 的思路） |
| 本地缓存 | OPFS + WASM SQLite，`opfs-*-worker` × 3 + 投机取数 | 无本地持久化缓存 | 可选：离线优先（P2） |
| 状态管理 | 193 store key / store-per-concern / 字符串 key + 访问器 | `Document.settings_[...]` 单 JSON 字段（如 `settings_["table"]`） | **核心差距**：视图设置粒度 |
| 集合/数据库视图 | 视图=一层壳；筛选/排序/**分组**/**聚合(Rollup)**/可见性/冻结/子项各有 store | `_table_config(world, document)` 只覆盖表格配置；**无分组、无 Rollup**（`world/` 下 `rollup|aggregate` 零匹配） | **可直接补**：分组 + Rollup（最高性价比） |
| 属性模型 | 属性=列，表头菜单可建属性（`ev_f7368a46…`） | `PropertyDef` 有 `value_type`（7 种）/`options`/`required`/`default`/`formula`/`reference_type`/`show_on_existing` | 后端已具备，**缺 UI 控件**（`reference_type`/`show_on_existing`） |
| 行=页面 | 行 DOM 同带 `notion-page-block`+`notion-collection-item` | `Card` 是独立模型，表格行是卡片投影 | 语义一致，**已对齐** |
| 版本历史 | `getVersionStore`/`getPublishedArtifactStore` | 已有 `DocumentVersion` 模型 + `settings_["revision"]` | **基本对齐** |
| 协作/在线 | `presenceStore`/`commentStore`/`threadStore`/`syncProgressStore` | `Presence`/`Membership` 模型存在，无实时同步 | 架构级，**缓做** |

**建议优先级（D）**
1. **P0 · 视图设置正交化**：把 `settings_["table"]` 拆成 `filter/sort/group/hidden-props/widths` 子对象，为「分组 + Rollup + 冻结列」留位。
2. **P1 · 分组视图 + Rollup/聚合**：Notion 的 `groupsResultStore`/`aggregates` 能力，我们完全空白。
3. **P1 · 属性控件补齐**：把 `reference_type` / `show_on_existing` 接上 UI（对齐 Notion 表头菜单）。
4. **P2 · 乐观更新与失效判据**：借鉴 `QueryStore`（乐观写 + `shouldFetchOnReconnect`）与 `createHasSchemaChangedForQueryStore`。
5. **P2 · 离线缓存**：仅在确实需要离线时引入（OPFS/WASM SQLite 的完整成本高）。

---

## 9. 证据索引（可追溯）

**A · REA Evidence v2 包**（`predicate_type = rea.javascript-application-analysis/v2`）

| 主体 | evidence_id（前缀） | subject.digest.sha256（前缀） | 关键统计 | 支撑结论 |
| --- | --- | --- | --- | --- |
| E-CollectionViewBlock | `ev_7c4f39c6…` | `74ef9009…` | 816,294 B / 100 mod / 语义节点 1 | §6.3 失败规模 |
| E-TableHeaderCellMenu | `ev_096c52e8…` | `1e1faac9…` | 149,331 B / 109 mod / 语义节点 1 | §6.3、§3.4 |
| E-TableHeaderPropertyCreationMenu | `ev_f7368a46…` | `dd6ccfc4…` | 173,593 B / 135 mod / 27,105 节点 / `aggregates`1 | §3.3、§3.4 |
| E-comments | `ev_a6ba6ace…` | `b44be8a2…` | 155,504 B / 36 mod / 26,716 节点 | §2.2 |
| E-SelectableHoverMenuOverlay | `ev_889da34e…` | `614088113…` | 126,996 B / 97 mod / 21,164 节点 | §2.2 |
| E-XldbTableFullPage | `ev_5fa876cc…` | `4dca60f3…` | 92,397 B / 86 mod / 16,876 节点 | §3.1 |
| E-SimpleTableEditUI | `ev_c8540fc2…` | `cd12ab0d…` | 29,764 B / 8 mod / 5,803 节点 | §3.1 |
| E-slashMenu | `ev_c62958c2…` | `dc81ee90…` | 51,019 B / 26 mod / 5,420 节点 | §2.2 |
| E-xldbCollectionView | `ev_cb867b47…` | `c5c0c20c…` | 22,540 B / 23 mod / 3,559 节点 | §3.1 |
| E-QueryStore | `ev_061052b6…` | `5525c06d…` | 8,314 B / 2 mod / 1,661 节点 / `returns-task`2 | §2.3、§8 |
| E-createHasSchemaChangedForQueryStore | `ev_c6993a85…` | `dbafa0b4…` | 4,503 B / 1 mod / 910 节点 | §2.3、§8 |
| E-RelationPropertyMenu | **无**（`unreadable_output`） | — | 一次分析失败 | §10 |
| cur2（CollectionViewBlock-g03） | `ev_30693c24…` | `a272a499…` | 711,942 B / 1 mod / 语义节点 1 | §6.1 |
| one-app | `ev_30431f04…` | `23568320…` | 610,253 B / 86,234 节点 / `execSqliteBatch` | §2.1、§2.4 |
| notion-web-big | `ev_db536810…` | `51779be6…` | 3,692,071 B / 1,974 mod / 语义节点 1 | §6.3 |
| one-ClientFramework | `ev_0c2ae51b…` | `ae53674a…` | 223,316 B / 208 mod / 42,656 节点 | §2.2 |
| one-RecordMap | `ev_97520d3f…` | `8ab45f01…` | 798,831 B / 320 mod / 100,000 节点（触顶） | §6.3 |
| client_placeholder | `ev_d425295d…` | `5223f3e1…` | 764,150 B / 3 文件 / 48,246 节点 | §2.2 |
| tabs | `ev_9c6ff42f…` | `4b050018…` | 1,045,059 B / 81,512 节点 | §2.2 |
| 切片 p000–p006 | `ev_92e1fd8c` / `ev_27ec29b2` / `ev_acbf2fe7` / `ev_75b1b48e` / `ev_28e95339` / `ev_b2c492ed` / `ev_3355aa09` | — | 见 §6.2 | §6.2、§6.3 |
| S3 分片 g01–g06（CollectionViewBlock） | `ev_4e6cec1c` / `ev_75cb97e3` / `ev_30693c24` / `ev_430106ab` / `ev_e42367a1` / `ev_75dba384` | — | 语义节点 722–5,561（g02/g03 失败） | §6.3 |
| S3 分片 g01–g05（RelationPropertyMenu） | `ev_7e96a7fe` / `ev_a0d575ce` / `ev_178fae23` / `ev_cde7f42b` / `ev_b9cda2ed` | — | 语义节点 1,292–15,045（全成功） | §6.3 |
| S3 分片 g01–g05（TableHeaderCellMenu） | `ev_d8847c03` / `ev_8c03af0b` / `ev_d93c80b5` / `ev_1283d6bf` / `ev_9968b4b1` | — | 语义节点 2,644–5,623（g02 失败） | §6.3 |
| 浏览器 target 列表 | `ev_cecfd0cd…` | — | `targets.total = 0` | §7 |

**A（实测）· `docs/design-reference/`**：`README.md`、`dom-skeleton.md`、`style-tokens.md`、`design-tokens.md`、`interactions.md`、`shots/*`。

**A（本机静态扫描，非 REA 包）**：`/tmp/xs/stores.json`（§4）、`/tmp/xs/chunkreg.json`（§5）、`/tmp/xs/slices.json`（§6.2）、`/tmp/xs/{j,r,w,s3}.json`（§3、§9 汇编）。

> ⚠️ **原始证据为临时文件**：`/tmp/xs/*.json`、`/tmp/slice-*.json`、`/tmp/iso/*` 属临时目录，可能被系统清理。复算依据是**每条结论的 `evidence_id` + `subject.digest.sha256`**（产物摘要），可在同一份 `app.notion.com` 产物上重跑 REA 复现；本表已内联关键数值，故不依赖临时文件仍可追溯。

---

## 10. 边界与未解

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | **服务端不可观测** | 只分析客户端；`/api/v3/*`、事务、存储模型**未观测**，不做结论。 |
| 2 | **运行时证据缺失** | CDP profile 未登录 Notion，`targets.total=0`（§7）；真实请求/OPFS 写入/交互时序待补。 |
| 3 | `unreadable_output` | `RelationPropertyMenu` 一次分析返回不可读结果（`ev` 未产出）；重试或 `rea doctor`。 |
| 4 | 语义图失败项 | `CollectionViewBlock` 整文件、`TableHeaderCellMenu`、`notion-web-big` 语义节点=1（§6）；`RecordMap` 触 100,000 上限。 |
| 5 | `truncated_scopes` 语义 | 已证伪其充分性（§6.3）；它是「触到分析器内部上限」的信号，不是失败判据。 |
| 6 | 归类口径 | §4/§5 的分类由本机脚本给出（D 级）；key/chunk **名称**为 A 级。 |
| 7 | 产物版本 | 采样为 2026-10-13 的 `app.notion.com` 产物；`evidence_id` 与 `sha256` 仅对**该份产物**有效。 |

---

## 附录 · 复现命令（不复制任何产物内容）

```bash
# 1) 单文件/多文件分析（产物放独立目录 + --artifact-format directory）
REA_INVESTIGATION_INPUT_ROOTS_JSON='["/tmp/iso"]' \
  node .../rea.mjs analyze-javascript-application /tmp/iso/s0 \
  --artifact-format directory --approved --format json

# 2) 浏览器观测（两个端点变量必须同时设置；endpoint 是位置参数）
REA_BROWSER_OBSERVE_ENABLED=true \
REA_BROWSER_CDP_ENDPOINTS_JSON='["http://127.0.0.1:9222"]' \
REA_BROWSER_ALLOWED_ORIGINS_JSON='["https://app.notion.com","https://www.notion.so"]' \
  node .../rea.mjs list-browser-targets http://127.0.0.1:9222 --approved --format json
```

> 限额备忘：`--max-parse-milliseconds` 上限 300000；graph 契约约 100,000 节点 / 200,000 边；
> 多片**合并**分析会触发 CLI 的 `RangeError: Invalid string length`（正文成功、输出序列化溢出）→ **每片独立目录**分别分析。
