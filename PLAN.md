# Opuscule · 项目计划书（0.5.2 → 0.8.0）

> **文档版本：0.7.0-dev**
>
> 这是项目的**单一计划书**：把「现在有什么（现状盘点）」与「接下来四个版本要做什么（计划）」写在一处。
> 本文吸收了此前四份文档的全部有效内容并取而代之：
> `PROJECT-MAP.md`、`docs/14-世界寻址与路径改造.md`、`docs/15-功能设想-时间线·地图·存档.md`、
> `docs/16-时间线·时代·存档-现状与改动.md`（原文件已删除）。
>
> 记录时**只读代码，未改动任何一行产品代码**——等拍板后再开工。
>
> 相关：[README.md](README.md)（简介 · 快速开始）· [TECHNO.md](TECHNO.md)（技术架构）。

---

## 〇、路线图总览

| 版本 | 主题 | 目标（一句话） | 详见 |
| --- | --- | --- | --- |
| **0.5.1** | 体检后修复轮 | 前端体检问题收口 | — |
| **0.5.2** | **布局与 UI 大改** | 重做工作区布局与整体视觉语言；正文编辑器引入 React 孤岛 | [§二](#二052--布局与-ui-大改) |
| **0.6.0** | **AI** | 引入 AI 横切层（BYOK 代理转发），作用于所有模块之上 | [§三](#三060--ai) |
| **0.7.0** | **时间线 · 时代 · 存档** | 总时间线 / 时代=命名时间段 / 世界存档（**当前版本**） | [§四](#四070--时间线--时代--存档) |
| **0.8.0** | **地图功能全面优化** | 地图模块的全面重构与能力升级 | [§五](#五080--地图功能全面优化) |

**关于版本归属：** 上面四个主题由用户明确指定。各版本之下的**具体条目**，
凡用户明确指派的照录；其余条目是本文按主题**就近归置的建议**，均标注「（建议归档）」，
最终归属以你拍板为准。尚未找到明确归属的条目集中列在 [§六](#六其他已登记事项归属待确认)。

---

## 一、现状盘点（仓库里现在有什么）

> 用途：把「这个仓库里到底有什么、每样东西是干什么的」一次讲清楚。
> 分三层看：**① 在跑的骨架**（改了会坏）→ **② 不参与运行的历史产物**（可清理）→ **③ 现状与目标的落差**（还没做）。

### 1.1 一句话与双面孔

同一个 Django 进程里跑着**两张脸**：

| 面孔 | 地址 | 谁在用 | 干什么 | 返回什么 |
| --- | --- | --- | --- | --- |
| **工作区** | `/w/<world_slug>` | 作者（登录） | 建卡、写正文、排时间线、画关系树、标地图、发布 | 一个空壳页面 + 一堆 `/w/<slug>/api/world/*` JSON 接口 |
| **只读站点** | `/s/<短码>/` | 读者（公开 / 密码） | 像读维基一样浏览已发布的内容 | 服务端渲染好的 HTML |

外加一条**次线**：经典横向时间轴 `/legacy`（由 `timeline` 应用提供，可被工作区用 iframe 嵌进"时间线"文档里用）。

### 1.2 六个 Django 应用

拆成六个 app 的原因是**依赖解环**：表名都钉在 `world_*` 没搬，只是代码按主题分家。
app label 取 `name` 的末段名（`apps.world` → `world`），迁移记录与 `ForeignKey(to="world.world")` 一律不受影响。

| app | 是什么 | 里面有什么 |
| --- | --- | --- |
| [apps/world](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world) | **主应用**：世界/类型/属性/成员/治理，以及工作区与只读站点的**全部视图** | `models/`、`views/`（16 个文件）、`services/`、`middleware.py`、`permissions.py`、`normalize.py`、`urls.py`、`site_urls.py`、`site_views.py`、`classic.py`、`calendarview.py`、`relationship.py`、`mapdoc.py`、`relations.py`、`maintenance.py`、`context.py`、`adminconfig.py` |
| [apps/documents](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/documents) | 内容模型 | `Document`（树上唯一节点类型）、`Card`、`Era`、`Calendar`、`TimelineEvent`、`Presence`、`DocumentVersion` |
| [apps/graph](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/graph) | 关系树 | `TreeVariant` / `TreeNode` / `TreeEdge` |
| [apps/maps](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/maps) | 经典地图 | `MapLayer`（图层）/ `MapMarker`（图钉·区域·文字） |
| [apps/publishing](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/publishing) | 发布记录 | `PublishLog`（每次发布留一条） |
| [apps/timeline](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/timeline) | **次应用**：经典横向时间轴 | `TimelineItem`（event/era，浮点年）、`TimelineView`（视野单例）、`/legacy` 页 + `/api/*` |

### 1.3 数据库里的表（模型一览）

| 分组 | 模型 |
| --- | --- |
| 世界与治理（world） | `World`、`EntityType`、`PropertyDef`、`Membership`、`MemberEvent`、`InviteCode`、`ModerationEvent`、`Report` |
| 内容（documents） | `Document`、`Card`、`Era`、`Calendar`、`TimelineEvent`、`Presence`、`DocumentVersion` |
| 关系树（graph） | `TreeVariant`、`TreeNode`、`TreeEdge` |
| 地图（maps） | `MapLayer`、`MapMarker` |
| 发布（publishing） | `PublishLog` |
| 经典时间轴（timeline） | `TimelineItem`、`TimelineView` |

### 1.4 前端

| 路径 | 作用 |
| --- | --- |
| [templates/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/templates) | 服务端渲染页面：`workspace.html`（工作区空壳）、`auth/explore/reset/maintenance`、`404/500`、`relationship.html`、`map/*`、`site/*`（只读站点各页） |
| [static/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static) | 前端资源（**无构建**，Django 直发）：`workspace.js`、`script.js`、`relationship.js`、多套皮肤 CSS、`icons/` 全套 SVG、`brand/`、`sw.js`、`manifest.webmanifest` |
| [static/editor/dist/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/editor/dist) | **正文编辑器孤岛**的构建产物（React + BlockNote），唯一带构建的例外；源码在 [frontend/editor](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/frontend/editor)（Vite），产物提交进仓库，同 [static/map/vendor](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/map/vendor) 的先例 |
| 皮肤分层 | `terminal.css` 是**当前权威**（最后加载）；`minimal.css` / `apple.css` / `polish.css` / `responsive.css` 等是被它覆盖的底层皮肤 |
| 地图素材 | [static/map/vendor/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/map/vendor) —— **Azgaar Fantasy Map Generator** 整包（打包 JS + 纹理 + libs），体量最大 |

### 1.5 部署

| 路径 | 作用 |
| --- | --- |
| [deploy/nginx-opuscule.conf](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/deploy/nginx-opuscule.conf) | nginx 样例 |
| [deploy/opuscule.service](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/deploy/opuscule.service) | systemd 服务 |
| [deploy/opuscule.env.example](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/deploy/opuscule.env.example) | 环境变量样例 |
| [deploy/backup.sh](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/deploy/backup.sh) | 备份脚本 |

### 1.6 核心概念速查

**① "文档"是唯一节点类型，靠 `document_type` 变身。** 整个世界的结构是一棵 `Document` 树：

| 内部名 | 中文 | 内部名 | 中文 |
| --- | --- | --- | --- |
| `folder` | 文件夹 | `dictionary` | 词典 |
| `card` | 卡片 | `todo` | 待办 |
| `timeline` | 时间线 | `voice` | 语音 |
| `map` | 地图 | `dice` | 骰子 |
| `canvas` | 画布 | `soundscape` | 环境音 |
| `board` | 看板 | `radar` | 雷达图 |
| `note` | 笔记 | `chapter` | 章节 |
| `table` | 表格 | `media` | 媒体 |
| `familyTree` | 关系树 | `embed` | 嵌入 |
| `graph` | 图谱 | | |

类型不同会长出不同的附属内容：卡片 → `Card`，时间线 → `TimelineEvent`，关系树 → `TreeVariant/Node/Edge`，地图 → `MapLayer/MapMarker`。

**② 卡片 · 类型 · 属性。** `EntityType`（卡片类型）可嵌套继承，父类型属性被子类型继承并覆盖；
`PropertyDef`（属性）七种值类型：`text` / `select` / `multiselect` / `number` / `date` / `reference` / `formula`。

**③ "版本"其实有四个地方（容易混）：**

| 名字 | 存在哪 | 含义 |
| --- | --- | --- |
| `World.publish_version` | 世界 | **发布版本号**，每点一次"发布" +1 |
| `DocumentVersion` | 文档 | **编辑历史**，每次保存留快照（同作者 90 秒合并，最多 `MAX_VERSIONS=30`，可回滚） |
| `Document.settings["revision"]` | 文档 | **修订号**，每次 `touch_document` 时 +1，用来算发布状态 |
| `Era` | 文档 | 旧概念「纪元」，**用户已明确说不要这个语义**，见 [§四](#四070--时间线--时代--存档) |

发布状态五态（按**时间戳**算，不是版本号）：`unpublished` / `pending` / `live` / `stale` / `excluded`。

**④ "权限"是两条正交的轴：**

| 轴 | 取值 | 管什么 |
| --- | --- | --- |
| **世界角色**（`Membership.role`） | `owner` / `editor` / `viewer` / `guest` | 在这个**世界内部**能干什么 |
| **平台身份**（Django 身份） | `superuser`（站长）/ `moderator`（管理员）/ `staff` / 普通 `user` | **跨世界**的治理权（举报、封禁、任命管理员） |

规则要点（[permissions.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/permissions.py)）：
**读**需登录 + 是世界成员；**写**只有 `owner` / `editor` 能改；特权只认 `superuser`，`staff` **不**穿透；
首次安装例外（库里一个用户都没有时任何人都能编辑）；中间件顺序 `ActiveWorld → ReadPermission → EditPermission → Maintenance`，不可颠倒。

### 1.7 领域服务（`apps/world/services/`）

纯算法层，不碰 `request`，可单独测试：

| 文件 | 作用 |
| --- | --- |
| `publish.py` | 发布状态机 + 只读站点数据组装 |
| `graph.py` | 图谱节点与连线 |
| `geo.py` | 地图 ⇄ 卡片双向桥 |
| `exchange.py` | Markdown / JSON 导入导出 |
| `autolink.py` | 正文里提到名字自动变链接（含 `complete_names` 补全） |
| `sanitize.py` | HTML 白名单净化 |

### 1.8 不参与运行的东西（可清理）

这些东西**不被任何 URL / import 引用**，留着只是占地方：

| 路径 | 是什么 | 建议 |
| --- | --- | --- |
| [opuscule-redesign/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/opuscule-redesign) | 早期 UI 原型（静态 HTML + 设计文件 + 校验报告） | 0.5.2 大改时可作参考，之后存档或删 |
| [.trae-html-share-packages/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/.trae-html-share-packages) | 一个时间线单页的分享 zip | 删 |
| [shots/town-plan/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/shots/town-plan) | 地图素材（城镇平面 PNG/SVG） | 若非运行时用可删 |
| [static/map/vendor/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/map/vendor) | Azgaar FMG 整包 | 0.8.0 要用；在此之前是最大的"体积噪音" |

### 1.9 落差：现状 vs 目标

| 你的定义 | 代码现状 | 落差 |
| --- | --- | --- |
| 时间数据分**时间点**和**时间段** | `TimelineEvent` 只有**单点**（year/month/day/hour + precision），**没有结束时间/跨度** | ❌ 时间段未实现（经典时间轴有 `start/end`，world 主模型没有） |
| **没有"纪元"这个概念** | `Era` 模型、`ERA_*` 常量、`Card.era_mode` 外键、`/s/.../era/<id>/` 纪元页**都还在** | ❌ 需在 0.7.0 清理/重解释 |
| 世界分**私有**和**共建** | `World` **没有"类型"字段** | ❌ 无世界类型 |
| 共建世界**所有人可编辑**（像 wiki） | `can_edit` 只认 `Membership` | ❌ 未实现 |
| 用户创建的共建世界可加**密码锁** | 只有**读密码** `publish_password`，没有"加入/共建密码" | ❌ 未实现 |
| 每个用户最多建 **7 个世界** | `MAX_OWNED_WORLDS = 7` 已实现 | ✅ 一致 |

---

## 二、0.5.2 —— 布局与 UI 大改

> **主题：重做工作区布局与整体视觉语言。**（用户明确指定）

### 2.1 目标

- 重做**工作区布局**（面板体系、导航结构、信息层级）。
- 重做**整体视觉语言**（配色、字体、间距、组件样式）。
- [TECHNO.md §8.2](TECHNO.md) 里"CSS 加载顺序是契约（`terminal.css` 最后权威）"这条会在本版随之调整——**顺序仍是契约，但权威层与分层方式会重排**。
- 前端无构建、`renderPanels()` 每帧重建面板 DOM 的约束不变（面板内不挂有限次 CSS 动画）。
  **唯一例外：正文区编辑器孤岛**（见 §2.x）——它是 React 应用，但靠既有的 `is-live-embed`
  搬迁机制在每帧重建时被"认领"回去，面板重建模型本身一行未改。
- **正文编辑器孤岛**（0.5.2 起）：工作区正文区改用 [BlockNote](https://www.blocknotejs.org/)（React）
  渲染，其余部分（侧栏 / 属性 / 评论 / 顶栏 / 地图）**仍是原生 DOM**；P3 起孤岛是正文的**唯一**
  渲染路径（无开关、无 `?editor=vanilla` 逃生舱），进不去时正文区就地给只读降级提示。文档权威存储为
  `Card.blocks_doc`（BlockNote 原生 JSON），保存时服务端派生 `blocks` / `body`，
  publish / autolink / search / exchange **零改动**。
  移植**已完成三级**：**P1 文本块**（10 种，见 [TECHNO §8.4](TECHNO.md)）；
  **P2** 自定义斜杠菜单 + 重块嵌入——`image` / `bookmark` / `card` / `collection` 四种在孤岛里
  只挂空容器，DOM 由既有 vanilla 渲染器经 `bridge.renderHeavyBlock` 画进来，渲染只读
  （collection 的类型 / 视图 / 单元格 / 拖拽 / 翻月全部封住）、新建经 `bridge.prepareHeavyBlock`
  弹回旧对话框问数据；
  **P3** 拆除整条旧 `renderBlock` 链（斜杠菜单 / 格式栏 / 块工具条 / 拖拽 / 快照），
  文档级类型（`media` / `tool` / `table` / `embed`）走只读降级。见 TECHNO §8.4。

### 2.2 并入：世界寻址与路径改造（原 docs/14）（建议归档）

> 属「布局 / 外壳」层面的改造，与 UI 大改同期做最省事，故建议归入 0.5.2；**归属待你确认**。
> 目标：把"当前世界"从**会话隐式**改成**路径显式**，并让 `/w/` 成为主编辑器。

**为什么改（动机）：** 世界不在 URL 里、靠 session 隐式决定，导致——① 没法用链接分享"某世界的某编辑器"；② 多标签串味；③ 兜底语义模糊。结论：改成路径寻址，**`/w/` = 主编辑器**，次线挂在世界下面。

**目标路径（to-be）：**

| 目标路径 | 是什么 | 对应现状 |
| --- | --- | --- |
| `/w/<world_slug>` | 该世界的**主编辑器**（工作区） | 现 `/world` |
| `/w/<world_slug>/timeline` | 时间线次线 | 现 `/legacy` |
| `/w/<world_slug>/relation` | 关系树次线 | 现 `/relationship` |
| `/w/<world_slug>/map` | 地图次线 | 现 `/map` |
| `/w/` | 主编辑器入口（无 slug 怎么办 → 见拍板 ①） | 现 `/w` 是跳转 |
| `/s/<published_slug>/…` | 只读站点 | **不变** |

旧地址全部保留 302 跳转（已发出的链接不能失效）：`/world`、`/legacy`、`/relationship`、`/map`、`/w/timeline/<doc_id>`。

**待办 checklist：**

- [x] 1. 世界解析改成"URL 优先"：新增 `world_from_path(request, world_slug)`，`resolve_active_world` 顺序改为 **路径 slug → 会话选定 → 自己的第一个世界 → 全场第一个世界**（改在 [permissions.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/permissions.py#L236-L266)）。
- [x] 2. 路由改造（[总路由](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/worldbuilding_timeline/urls.py#L45-L55)）：`/w` 由 RedirectView 改成真实入口；新增 `/w/<str:world_slug>` 与三条次线子路径；旧路径保留 RedirectView（`permanent=False`）。
- [x] 3. 视图接收 `world_slug`：`workspace`、`relationship_page`、`map_home`/`map_page`、`timeline.index` 增加形参，**进页面前先 `can_access` 校验**，不通过给 404 / 登录提示。
- [x] 4. 次线改名：`/legacy` → `/timeline`、`/relationship` → `/relation`；**旧地址 302 保留**。
- [x] 5. 前端链接补 slug：`static/workspace.js` 等里所有硬编码 `/relationship`、`/map`、`/world/timeline/<id>` 都要带上 `world_slug`。
- [x] 6. `/api/world/*` 路径化到 `/w/<slug>/api/world/*`（拍板 ③：全部路径化）。
- [x] 7. Service Worker 复查：`sw.js` 从根路径发（作用域问题），路径变了要重看 scope 与缓存键。
- [x] 8. `robots.txt` 把新路径补进屏蔽名单。
- [x] 9. 测试：[apps/world/tests.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/tests.py) 里所有 `reverse(...)` 与硬编码路径要跟着改。

**必须记住的坑：**

1. **本次不动数据模型**——只改"世界从哪来"，绝不碰 `World` / `Document` 表结构。
2. `/w/timeline/<doc_id>` 现在用 `pattern_name="timeline:classic-embedded"` 跳转，**改路由名会连带断**，要一起改。
3. 必须用 `<str:world_slug>`，**不要用 `<slug:>`**——`slugify_name` 保留中文，`<slug:>` 只吃 `[-a-zA-Z0-9_]`（见 [site_urls.py 注释](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/site_urls.py#L10-L11)）。
4. `World.slug` ≠ `World.published_slug`：前者是工作区寻址，后者是只读站点寻址，`/w/` 必须用 `World.slug`。
5. **`?embed=<id>` 只读嵌入的口子不能破坏**（`permissions.allow_public_read`，见 [middleware.py:46-64](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/middleware.py#L46-L64)）。
6. `resolve_active_world` 的 **session 兜底要保留**：处理 `/`、`/w/`（无 slug）、以及所有旧链接。
7. "全场第一个世界"兜底有**两处实现**，口径要一致：[permissions.py:184](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/permissions.py#L180-L184) 与 [common.py:115](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/views/common.py#L115-L119)。
8. 未登录用户现在会落到"全场第一个世界"；路径化后要明确 `/w/<slug>` 对游客是 404 还是 403。
9. `APPEND_SLASH`：注意 `/w` 与 `/w/` 的区别。项目整体风格是**路径结尾不带斜杠**。
10. **中间件顺序不能反**：`ActiveWorld → ReadPermission → EditPermission → Maintenance`。

### 2.3 参考资产

早期 UI 原型 [opuscule-redesign/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/opuscule-redesign)（含 `workspace.html`、`map-shell.html`、`site-*.html` 等 21 个静态页 + 设计文件）可作为本版布局与视觉的直接参考底稿。

---

## 三、0.6.0 —— AI

> **主题：引入 AI 横切层（BYOK 代理转发），作用于所有模块之上。**（用户明确指定方向）

### 3.1 目标

- AI 作为**横切能力**（像权限、版本一样横跨所有模块），而不是某一个模块里的按钮。
- **BYOK（Bring Your Own Key）**：用户自带 API Key，服务端做**代理转发**（Key 不落前端明文、可做统一限流与日志）。
- 作用于全部模块之上：卡片、时间线、地图、关系树、图谱、发布站点都能调用。

### 3.2 已登记的具体用法（来自原 docs/15 §七）

| 项 | 设想 | 备注 |
| --- | --- | --- |
| **H. AI 助手** | ① 基于已有实体**补全**（"写一下这个城镇的历史" → 生成时间线事件 + 卡片）；② **生成**随机实体（地名/人物/组织）；③ 为一致性检查给**修复建议** | 原文档标注为 **0.6.0 主要方向** |
| **C. 一致性检查** | 事件依赖校验（A 是 B 前置则 B 不能早于 A）；人物生卒 vs 参与事件；时代区间校验（必须是总时间线的非空真子集）；地图 vs 时间线（某国不该出现在尚未成立那年的地图上） | 原文档标注"**适合 AI 做**" |

### 3.3 已拍板

| # | 问题 | 结论 |
| --- | --- | --- |
| ① | 模型 / 供应商 | **多家可切**：OpenAI 兼容 / Anthropic / Gemini / 自定义兼容端点，凭据可配多条并指定默认 |
| ② | BYOK 的 Key 存哪、怎么用 | **服务端加密存储**（Encrypt-then-MAC，密钥由 `SECRET_KEY` 派生；接口只回 `key_hint`） |
| ③ | 代理转发的边界 | **编排 + 工具调用**：服务端拼 system prompt、组织上下文、执行只读工具并回传结果（最多 6 轮） |
| ④ | AI 写入数据的权限与审阅 | **走变更集**：AI 只生成 `AiChangeSet` / `AiChange`，用户确认后由服务端应用 |
| ⑤ | 与 [§六](#六其他已登记事项归属待确认) 中「协作增强 · 变更集」的关系 | **复用变更集**做 AI 改动的审阅通道 |

### 3.4 实施清单

- [x] 1. 新建 `apps/ai`：`crypto`（stdlib Encrypt-then-MAC）、`models`（凭据 / 会话 / 消息 / 变更集 / 变更项）、`providers`（四家适配 + `urllib` 调用）、`tools`（7 只读 + 3 提议）、`services`（system prompt / 工具循环 / 变更集收集）、`views`（9 个接口）。
- [x] 2. 路由与权限：`/w/<slug>/api/world/ai/*` 九条；`OPEN_WRITE_PREFIXES` 放行中间件写闸门，视图内用 `can_read` / `can_edit` 复核；凭据接口进 `PUBLIC_READ_PATHS` 后自行校验登录。
- [x] 3. 限流：固定窗口 `django.core.cache`，默认 20 次 / 60 秒，超限 429。
- [x] 4. 变更集应用：新建文档 / 改名与追加正文（`blocks_doc` 权威）/ 新建时间线事件；部分失败标记 `failed`，重复处理 409，viewer 403。
- [x] 5. 前端：顶栏 `AI` 入口 + 右侧抽屉（聊天 / 变更集审阅 / 供应商设置），`static/ai.css` + `static/ai.js`，只读成员可聊天、应用变更集时才校验写权限。
- [x] 6. 会话上下文：会话可绑定当前打开的文档，服务端在 system prompt 里提示先 `get_document` 读取。
- [x] 7. 测试：`apps/ai/tests.py` 45 条（加密 / 供应商 / 工具 / 凭据 / 会话 / 聊天 / 变更集 / 服务层），全量回归通过。


---

## 四、0.7.0 —— 时间线 · 时代 · 存档

> **主题：前面已拍板的改动。**（用户明确指定；内容来自原 docs/16，含 8 条拍板结论）

### 4.0 本次拍板（原 docs/16 §〇）

| # | 问题 | 结论 |
| --- | --- | --- |
| ① | 总时间线是否每世界唯一？ | **唯一**，每世界只有一根 |
| ② | "0 年自定义"落在哪？ | 时间线的 **`origin_year`**。理由：用户可能**更改历法**（如 A 历，某事件后变更为 B 历） |
| ③ | 时代（Era）是几层？ | 时代 = **命名的时间段**（时间段带名字就是时代） |
| ④ | 世界存档是否含地图整包？ | **包含**（`map_data` 一并存） |
| ⑤ | 总时间线的**载体**？ | **新建独立模型**；总时间线**自动生成**（每世界一根）；**时代（分支时间段）**由用户**自行创建** |
| ⑥ | 时间段的**精度**？ | **年 / 月 / 日 / 时**（四级，与 `TimelineEvent` 对齐） |
| ⑦ | 现有"多份时间线文档"怎么处置？ | **合并**（并入总时间线，不再并行保留多份文档） |
| ⑧ | 存档与 `DocumentVersion` 的关系？ | **独立全量**（存档自己存一份完整数据，不复用文档版本） |

### 4.1 时间线

**现状：** 没有"总时间线"实体——时间线是一份文档（`document_type = "timeline"`），世界里可以有多份。
`TimelineEvent` 是**单点**（只有 year/month/day/hour，无结束时间）；"时间段"现由**经典编辑器**的
`kind="era"` 承担；`Era.start_year` 恒为 `0.0`（每个纪元从 0 年重新起算，是独立坐标系）。

```python
# apps/documents/models/document.py —— TimelineEvent（节选）
document    = FK(Document, related_name="events")
era         = FK(Era, null=True)
title / description / cover / row / position
year / month / day / hour
precision    = "year" | "month" | "day" | "time"
linked_cards = M2M(self)
```

**改动：**

1. **立一根唯一的「总时间线」——新建独立模型。** 每世界**自动生成**一根；核心字段 **`origin_year`**（定义"0 年"对应哪一年）；时间点与时间段都挂它上面、共用同一套年份坐标。
2. **把「时间段」提成一等数据。** 由起点 + 终点表示，**精度年/月/日/时**（四级）。数据自此明确分两类：**时间点** / **时间段**。
3. **合并现有的多份时间线文档** 进总时间线，此后不再并行保留多份；局部视图统一改用**时代**表达。
4. **`origin_year` 与历法**：改它就是"迁轴"。世界**可以有多本历法**（`Calendar` 已支持多本），设想是"A 历 → 某事件后切 B 历"；`origin_year` 负责**坐标原点**，历法切换负责**读数规则**，两者分开。

**影响面：**

| 文件 | 现状相关 | 改动要点 |
| --- | --- | --- |
| [apps/documents/models/document.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/documents/models/document.py) | `TimelineEvent`（单点）、`Era`（`start_year=0`） | 新增总时间线模型 + `origin_year`；时间段建模 |
| [apps/timeline/models.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/timeline/models.py) | `kind="event"` / `kind="era"` | 两类数据语义对齐新的总时间线 |
| [apps/world/classic.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/classic.py) | `spans_for()` 按 `length_years` 铺开、`ERA_ID_BASE` 偏移 | 段的定位改为"总时间线上的起止" |
| **数据迁移** | 世界里可能有多份 `timeline` 文档 + 一批 `Era` | **合并**进总时间线；`Era` 语义迁移为"命名的时间段" |

### 4.2 时代（原 Era / 纪元）

**现状：** `Era`（表 `world_era`）是**独立坐标系**——`start_year` 恒 `0.0`，`length_years`（0 = 开放式），靠 `position` 顺序相连。
挂接点（都在用）：`Document.era`、`Card.era_mode`（`universal`/`only`/`hidden`）+ `Card.era_ids`、`TimelineEvent.era`、
站点 `/s/<slug>/era/<id>/`、经典编辑器 `ERA_ID_BASE = 1_000_000` 偏移、地图 `ERA_COLORS_RGB`。

**改动：时代 = 命名的时间段。** 它本质上就是总时间线上的一段起止区间，只是**多了名字**（以及配色/图标/描述/封面）；因此不再是独立坐标系，天然满足"每个时代都是总时间线的非空真子集"。

**保留不变：** `name`/`theme`/`icon`/`description`/`cover` 以及全部挂接点（`Card.era_mode` 可见性、`/s/<slug>/era/<id>/`、地图配色）。

| 项 | 现在 | 改成 |
| --- | --- | --- |
| 坐标 | `start_year` 恒 `0.0`（各纪元独立） | 总时间线上的**起止年份**（共用一根轴） |
| 长度 | `length_years`（0 = 开放式） | 由起止推出；保留"开放式"作为可选 |
| 与其他段的关系 | 靠 `position` 顺序相连 | 允许**重叠/嵌套**（同一根轴上的区间） |

### 4.3 存档 / 读档

**现状：文档级历史已有。** `DocumentVersion`（表 `world_documentversion`）每次内容变化留一版，可预览、可回滚；
配套：`revision` +1 做**编辑冲突保护**、同作者 **90 秒合并**、**回滚前自动备份**、上限 `MAX_VERSIONS`、
接口 `GET /documents/<doc_id>/versions`、`GET|POST /documents/<doc_id>/versions/<index>`。

**现状：世界级存档 / 读档没有。** "把整个世界拍一张快照、之后一键读回"的能力完全没有。

**改动：新增世界级存档 / 读档。**

- **存档**：把整个世界的数据拍成一份快照，可命名、可多份（像游戏的存档位）。
- **读档**：整包回滚到某个存档。
- **内容**：**包含地图整包 `map_data`**（已拍板）——体积可能很大，存储与压缩策略实现时考虑。
- **与 `DocumentVersion` 的关系（已定）：独立全量**，自己存一份完整数据，不复用文档版本（两者互不影响）。

存档要覆盖的数据面：

| 数据 | 现在存在哪 |
| --- | --- |
| 文档树 / 卡片 / 属性 | `Document` + `Card` |
| 时间点 / 时代 | `TimelineEvent` + `Era`（+ 文档 `settings["era_spans"]`） |
| 地图标注 / 图层 | `MapLayer` + `MapMarker` |
| **地图整包** | `Document.map_data`（**一并存**） |
| 日历 / 关系（图谱） | `Calendar`、图谱相关表 |

### 4.4 并入的其他时间维度条目（建议归档）

| 项 | 设想 | 建议 |
| --- | --- | --- |
| **B. 三维联动** | 切到某**时代** → 地图只显示该时代存在的国家/区域，关系树只显示该时代存在的实体；点地图上某国 → 关系树高亮 → 时间线跳到"建国"事件；反向亦然。地基已在地图⇄卡片双向桥（[geo.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/services/geo.py)） | 归 0.7.0（**时间/时代**是联动锚点）；**须先定联动规则**，见 §4.5 |
| **D. 关系的时间维度** | 亲属/效忠/敌对关系带**有效区间**（"A 是 B 的臣属，第 3–7 纪"），与时代联动；关系从"静态"变"关系史" | 归 0.7.0 |
| **E. 模糊 / 相对时间** | 神话只需"很久以前"、考古写"约公元前 300 年"；时间线要能容纳**不确定时间**（区间 + 置信度），而非逼用户填精确年份 | 归 0.7.0 |

### 4.5 B 的联动规则（请确认，核心是"别串"）

**两条独立通道，互不写对方：**

1. **时间通道**：权威源 = **时间线**（总时间线 + 时代）。切换时代 / 时间点，只广播"当前时间上下文"。
2. **选中通道**：任意视图点中一个实体，只广播"选中实体 ID"，其它视图**高亮**它。

**规则：** 联动 = **视图过滤 + 高亮**，**永不改数据**；地图/关系树**只订阅时间、不写时间**，时间只由时间线决定；
过滤口径**只有一处**——一律调用已有的 `Card.visible_in_era(era_id)`（[document.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/documents/models/document.py#L304-L315)），三视图不各自实现；
关系边（§D）的显隐 = 其**有效区间**与当前时代**是否相交**；当前时间上下文进 URL（如 `?era=<id>`），可分享、刷新不丢，与 [§二 路径化](#二052--布局与-ui-大改) 一致。
**明确不做**：切时代**不**自动改数据；高亮**不**自动跳转（要点才跳）；**不**跨世界联动。

### 4.6 待确认（剩余）

| # | 模块 | 问题 |
| --- | --- | --- |
| ① | 时间线 | 历法**切换点**怎么标：给 `Calendar` 加生效区间，还是在总时间线上标"换历事件"？ |
| ② | 时间线 | 旧时间线文档**合并的具体口径**：文档保留改名？还是数据抽出后文档删除？ |
| ③ | 时代 | 时代与时间段**共表还是分表**？时代是否允许**重叠**（同一根轴上区间可嵌套/重叠）？ |
| ④ | 存档 | 存档的**粒度 / 触发方式**（手动 / 定时）/ **存档位数量** / 命名？ |
| ⑤ | 地图 | **子地图**"对应父图哪片区域"的字段（见 [§五](#五080--地图功能全面优化)） |
| ⑥ | 地图·未来 | 兵棋推演引擎 / FMG 超级魔改 / 画笔编辑器（尚未动工） |

### 4.7 实施清单

- [x] 1. 模型层：`WorldTimeline`（每世界唯一 / `origin_year` / `calendar` / `settings`）、`Era` 起止 + 精度 + 派生长度、`Calendar` 生效区间 + `covers()`、`TimelineEvent` 挂总时间线 + 确信度/区间、`TreeEdge` 有效区间、`WorldArchive`。
- [x] 2. 迁移 0004：为每个世界建总时间线、归并旧时间线文档的事件、回填时代起止、按「抽出数据后删除文档」删除旧时间线文档。
- [x] 3. 后端：总时间线状态接口、经典适配层、世界级路由（`/w/<slug>/api/world/timeline/*`、`eras`）。
- [x] 4. 存档 / 读档：`create_archive` / `restore_archive` / `prune_archives`；手动 + 读档前自动备份、上限 20；整包含 `map_data`，与 `DocumentVersion` 独立全量。
- [x] 5. 前端：侧栏固定行与深链打开世界时间线、时代起止编辑、存档面板、`?era=` 进 URL 的联动（只过滤 + 高亮，不改数据）。
- [x] 6. 收尾：`seed_demo` / `import_timeline` 改用 `WorldTimeline`；`APP_VERSION` → `0.7.0`；`apps.world` 全量 402 条测试通过。

---

## 五、0.8.0 —— 地图功能全面优化

> **主题：地图模块的全面重构与能力升级。**（用户明确指定）

### 5.1 现状

地图是一份文档（`document_type = "map"`），走文档树同一套规则，数据分三块：

| 数据 | 存在哪 | 服务端管不管 |
| --- | --- | --- |
| 地图世界本身（地形/国家网格/样式/图层…） | `Document.map_data`（**一整段文本**） | **完全不管**，只当不透明大字符串 |
| 标注（图钉 / 区域 / 文字） | `MapLayer` + `MapMarker` 两张表 | 完整管理 |
| 底图设置（背景图、缩放、偏移） | `Document.settings`（JSON） | 存取一段配置 |

页面入口：工作区面板（`/w/<slug>` 内 iframe）+ 独立页 `/w/<slug>/map/2d`（平面）/ `/w/<slug>/map/3d`（地形）；
独立页用 `?doc=<id>` 指定看哪张，不带就挑世界里的第一张。
底层引擎 = **Azgaar Fantasy Map Generator**（源码 vendored 在 `third_party/fantasy-map-generator`，构建产物入库，运行时不需要 Node；运行包在 [static/map/vendor/](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/map/vendor)）。

### 5.2 设想（原话）

> 地图不会只有一张，同总时间线和 Era 的关系不同，是可以有很多不同的、相互独立的大地图的。
> 比如说一个世界里设置了天堂、地面、地狱 3 个地图，这 3 个是可以相互独立的。而地图是可以有他的
> **子地图**的——即对现有地图某个区域更加精确的描画，就像世界地图和中国地图、北京地图的关系一样。
>
> **未来**：地图将是 AI 升级后的核心方向。这也意味着我们会对 FMG 进行超级魔改。
> 我们将会引入**兵棋推演引擎**，支持**画笔编辑器**（对 2d 以及 3d 地图编辑）。

### 5.3 落差与要点

- **"多张相互独立的大地图" ✅ 已支持。** 天堂/地面/地狱 = 世界里的 3 份 `map` 文档，彼此独立；现在缺的只是"**并列展示 / 切换**"的界面。
- **"子地图" ⚠️ 结构上有地基，语义要明确。** 文档树本身有 `Document.parent`，任何文档都能挂别的文档下；但：
  - "子地图"的含义是**对父地图某区域的更精细描画**，需要"**对应父地图上哪片区域**"的信息（如父图上某 `MapMarker` 的区域多边形 `points`，或一对范围坐标），现在**没有这个字段**；
  - 子地图有**自己独立的 `map_data`**（自己的一套 FMG 世界），不是父图放大。
- **未来方向（兵棋推演 / FMG 超级魔改 / 2D·3D 画笔编辑器）** 现在**一行都没有**。

### 5.4 待拍板

| # | 问题 |
| --- | --- |
| ① | 子地图的"对应区域"怎么存：复用 `MapMarker.points`？给 `Document.settings` 加 `parent_region`？还是新表？ |
| ② | 子地图是**独立 FMG 世界**（各生成各的地形）还是**共享父图地形再细化**？ |
| ③ | 多地图展示：世界内并列切换即可，还是要做"地图组 / 地图树"导航？ |
| ④ | 兵棋推演引擎：自研还是引第三方？"超级魔改 FMG"的边界在哪？ |
| ⑤ | 画笔编辑器：2D / 3D 分别怎么落（改 FMG 数据模型 vs 图层叠加）？ |

### 5.5 与 0.7.0 的交界

地图的"**订阅时间**"部分（切时代只显示该时代存在的国家/区域）属于三维联动（[§4.4 B](#44-并入的其他时间维度条目建议归档)），锚点在 0.7.0；0.8.0 负责把地图自身的能力（子地图、多图导航、画笔、兵棋）做厚。

---

## 六、其他已登记事项（归属待确认）

> 以下条目已登记，但用户尚未指派版本，先集中在此，等你拍板归属。

| 项 | 设想 | 状态 |
| --- | --- | --- |
| **A. 世界线 / 分支（含 fork 新世界）** | 时间已是**时代**（分支时间段）；同理地图可有平行版本、关系树可有 if 线，统一为"世界线"，并让存档 = 世界线一个点、fork = 分出新世界线 | ❌ **本期不做**（新世界线需求较小，先不用），仅留档 |
| **F. 导出形态扩展 · "世界圣经"** | "World Bible / Series Bible"是编剧与游戏行业术语：把整个世界导出成**一本可通读的书**（PDF/HTML）——封面 → 目录 → 按实体类型分章 → 附时间线年表 → 附地图集。与现有 `/export`（给机器读、可再导入）互补 | ✅ 已采纳，未指派版本 |
| **G. 模板 / 世界骨架** | 新建世界选模板（奇幻/科幻/历史/现代），预置实体类型、时代与属性 schema | ✅ 已采纳（用户标注**很重要**），未指派版本 |
| **I. 协作增强（变更集 / @提及 / 审阅）** | `Card.comments` 已有评论；可加**变更集**（一次改动一组）、@提及、审阅流 | ✅ 已采纳，未指派版本（与 0.6.0 AI 改动的审阅通道可能复用） |
| **关系树** | —— | **维持现状，不改**（`apps/world/relationship.py`，`/relation` 次线） |
| **世界类型：私有 / 共建** | 加"私有 / 共建"世界类型 | 未指派版本 |
| **共建世界可编辑 / 共建密码锁** | 共建世界所有人可编辑 + 可选加入密码 | 未指派版本 |
| **每用户 7 个世界** | `MAX_OWNED_WORLDS = 7` 已实现 | ✅ 无需改 |

---

## 七、待拍板汇总

| # | 模块 | 问题 | 出处 |
| --- | --- | --- | --- |
| 1 | 路径化 | 访问 `/w/`（不带 slug）时：302 到"我的第一个世界" / 列出我所有世界让选？ | §2.2 |
| 2 | 路径化 | 次线新路径确认：`/w/<slug>/timeline`、`/w/<slug>/relation`、`/w/<slug>/map`？ | §2.2 |
| 3 | 路径化 | `/api/world/*` 要不要也路径化（彻底隔离 vs 继续靠 session）？ | §2.2 |
| 4 | 路径化 | 游客访问 `/w/<slug>`：404 还是提示登录？ | §2.2 |
| 5 | AI | 模型/供应商、BYOK 存储、代理边界、AI 写入的权限与审阅 | §3.3 |
| 6 | 时间线 | 历法切换点怎么标？ | §4.6 |
| 7 | 时间线 | 旧时间线文档合并的具体口径？ | §4.6 |
| 8 | 时代 | 时代与时间段共表还是分表？是否允许重叠？ | §4.6 |
| 9 | 存档 | 存档粒度 / 触发方式 / 存档位数量 / 命名？ | §4.6 |
| 10 | 地图 | 子地图"对应父图哪片区域"字段？ | §5.4 |
| 11 | 地图·未来 | 兵棋推演引擎自研还是引第三方？ | §5.4 |
| 12 | 归属 | §六 中各条目的版本归属 | §六 |

---

## 八、相关代码位置索引

| 主题 | 文件 |
| --- | --- |
| 项目配置 | [worldbuilding_timeline/settings.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/worldbuilding_timeline/settings.py) · [urls.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/worldbuilding_timeline/urls.py) |
| 工作区 JSON 接口 | [apps/world/urls.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/urls.py) |
| 只读站点路由 | [apps/world/site_urls.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/site_urls.py) |
| 世界解析 / 权限 | [apps/world/permissions.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/permissions.py) |
| 中间件链 | [apps/world/middleware.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/middleware.py) |
| `current_world` 助手 | [apps/world/views/common.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/views/common.py#L115-L119) |
| 时间线事件 / 日历 / 时代（Era）模型 | [apps/documents/models/document.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/documents/models/document.py) |
| 经典编辑器模型（event / era 两类） | [apps/timeline/models.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/timeline/models.py) |
| 经典编辑器 ⇄ world 适配层 | [apps/world/classic.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/classic.py) |
| 地图图层 / 标注模型 | [apps/maps/models.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/maps/models.py) |
| 地图实体 ⇄ 卡片双向桥 | [apps/world/services/geo.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/services/geo.py) |
| 地图独立页 | [apps/world/mapdoc.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/mapdoc.py) |
| 关系树次线 | [apps/world/relationship.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/relationship.py) |
| 世界图谱算法 | [apps/world/services/graph.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/services/graph.py) |
| 文档版本快照模型 | [apps/documents/models/version.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/documents/models/version.py) |
| 留档 / revision 助手 | [apps/world/views/common.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/views/common.py#L231-L278) |
| 版本历史 / 回滚接口 | [apps/world/views/activity.py](file:///Users/ltz2024/PycharmProjects/worldbuilding_timeline/apps/world/views/activity.py#L169-L228) |

---

## 九、一句话记住它

- **卡片是原子，文档是容器，世界是边界。** 结构靠三样东西长出来：**类型**（是什么）、**时间**（什么时候）、**关系**（和谁）。
- **两套壳、六个 app、一个 SQLite 文件**：`/world` 写，`/s/<短码>/` 读，`/legacy` 经典时间轴兜底。
- **接下来四步**：0.5.2 换脸（布局 UI）→ 0.6.0 加脑（AI）→ 0.7.0 立时间轴与存档 → 0.8.0 做厚地图。
