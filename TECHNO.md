# Opuscule · 技术架构

> **文档版本：0.5.1-dev**
>
> 这份文档回答一个问题：**这个项目是怎么跑起来的？**
> 它从「一次请求」出发，往下走到数据模型与关键算法，往旁边讲到前端与部署。
> 目标是让一个刚学会 Python、还没写过 Web 应用的人，也能顺着读下来。

如果你只想先跑起来，看 [README.md](README.md) 的「快速开始」。
如果你想知道仓库里每样东西是干什么的、接下来怎么走，看 [PLAN.md](PLAN.md)。
如果你关心接下来要做什么，看 [README.md](README.md) 的「路线图」——
0.5.2 布局与 UI 大改 → 0.6.0 AI → 0.7.0 时间线·时代·存档 → 0.8.0 地图全面优化。

---

## 1. 技术栈与设计取舍

| 层 | 选择 | 为什么这么选 |
| --- | --- | --- |
| 语言 | Python 3.12+（开发用 3.14） | 生态成熟、可读性高 |
| Web 框架 | Django 6.1.1 | 自带 ORM、迁移、admin、CSRF、会话，一个依赖顶一套 |
| 数据库 | SQLite（单文件） | 零配置；一个人写设定的数据量，一个文件足够，备份就是拷文件 |
| 前端 | 原生 HTML/CSS/JS，**无构建** | 不引入 Node/npm/打包器；改一行刷新即见；降低上手门槛。**唯一例外**：正文编辑器孤岛（React + BlockNote），见 [§8.4](#84-正文编辑器孤岛唯一带构建的地方) |
| 生产服务器 | gunicorn | 与 Django 标准搭配 |
| 依赖 | Django + gunicorn + django-otp | 依赖越少，能坏的地方越少；`django-otp` 是唯一的第三方功能依赖（后台两步验证） |

**一句话概括这套取舍：** 用「Django 提供后端骨架 + 原生前端提供界面」，
换掉一切构建链与微服务，让整个项目是一个**能被一个人读完并改懂**的整体。

---

## 2. 六个 Django 应用：`world` / `timeline` + 四个内容 app

一个 Django 项目可以包含多个 **app**（应用），每个 app 是一组相关的模型 + 视图 + 路由。
Opuscule 有六个，全部收在 `apps/` 包下：

```
worldbuilding_timeline/      ← 项目配置（settings / 总路由）
├── apps/                    ← 本项目自己的 app 都收在这里
│   ├── world/               ← 【主应用】世界 / 类型与属性 / 成员 / 治理 + 工作区与只读站点的视图
│   ├── timeline/            ← 【次应用】经典横向时间轴（/legacy）
│   ├── documents/           ← 内容模型：文档树 / 卡片 / 纪元 / 日历 / 事件 / 协作
│   ├── graph/               ← 内容模型：关系树
│   ├── maps/                ← 内容模型：经典地图
│   └── publishing/          ← 内容模型：发布记录
```

> app label 取 `name` 的末段名（`apps.world` → `world`），所以表名、迁移记录、
> `ForeignKey(to="world.world")` 这类 **app label 引用**一律不受归拢影响。

### 2.1 `world`（主应用）

承载**骨架与治理概念**：世界、类型与属性、成员、邀请码、治理；工作区（`/api/world/*`）
与 `/s/<短码>/` 只读站点的**视图与路由**都收在它的 `views/` 里。

### 2.2 `timeline`（次应用）

它只做一件事：提供那条 **经典横向时间轴**（一个纯编辑器，可通过 `/legacy` 独立访问，
也可以被工作区以 iframe 内嵌）。

### 2.3 `documents` / `graph` / `maps` / `publishing`（内容模型）

这四个 app **只装模型**（视图与路由仍集中在 `world` / `timeline`）：

- `documents`：文档树上的内容——`Document`、`Card`、`Era`、`Calendar`、`TimelineEvent`，
  外加协作所需的 `Presence` 与 `DocumentVersion`。
- `graph`：关系树——`TreeVariant` / `TreeNode` / `TreeEdge`。
- `maps`：经典地图——`MapLayer` / `MapMarker`。
- `publishing`：发布记录——`PublishLog`。

### 2.4 为什么分成六个 app

**`world` 和 `timeline` 为什么分开？** 因为这两块的**「时间模型」不一样**：

- `world` 的时间是**卡片/事件挂在世界里**，多世界、多历法、多纪元。
- `timeline` 的时间是**一条从 1500 到 1900 的固定横轴**，它自己有 `TimelineView` 单例。

把它们塞进一个 app 会让「时间」这个概念出现两套彼此打架的实现。
分成两个 app，各自管好自己的时间模型，通过一个很薄的**适配层**
（[apps/world/classic.py](apps/world/classic.py)）让工作区能内嵌经典时间轴，互不污染。

**`documents` / `graph` / `maps` / `publishing` 为什么从 `world` 里拆出来？**
它们原本全摊在一个 `world/models.py` 里，模型之间的**导入依赖**容易缠成环
（「文档」要用「世界」，「图谱」「地图」「发布」又要用「文档」）。按主题拆成独立 app 后，
跨 app 的引用方向变成**单向**的、**依赖环被解开**；而且拆 app 只动**代码组织**、不动**数据**
（表名用 `Meta.db_table` 钉在原处，仍是 `world_*`，数据库里一行都不会搬）。

---

## 3. 目录与分层

```
apps/world/
├── models/            数据模型（拆成子模块：world / entity / membership / invite / governance / constants）
├── views/             工作区的全部 JSON 接口（按主题拆成子模块，业务编排）
├── services/          领域服务：publish / graph / geo / exchange / autolink / sanitize
├── urls.py            /api/world/* 路由表
├── middleware.py      请求级：世界作用域 + 读/写守门人
├── permissions.py     谁能看、谁能改、"当前世界"是谁
├── normalize.py       取值规则：属性清洗 / 公式求值 / 引用解析 / 区块转换
├── site_views.py      只读站点的页面视图
├── calendarview.py    月视图与月相
├── relations.py       关系树词表（纯数据，无逻辑）
├── relationship.py    关系树逻辑
├── mapdoc.py          /map 独立页
├── classic.py         经典时间轴适配层
├── admin.py           Django admin 注册
├── adminconfig.py     后台站点定制（收紧 + 2FA）
└── context.py         静态资源版本号 / 程序版本 context processor
```

**分层的规则：**

- **models** 只管存储与最贴身的读取方法，不做业务编排。
- **views** 做编排：解析请求 → 调模型/算法模块 → 返回 JSON。
- **算法模块**（autolink / graph / normalize / geo / publish …）是纯函数式的工具层，
  不碰 `request`，方便单独测试。
- **permissions / middleware** 横切一切请求。

这样切，是为了让「一个功能出问题」时，你能立刻知道该翻哪个文件。

---

## 4. 一次请求发生了什么

这是理解整个后端最重要的一段。以工作区保存一张卡片（`POST /api/world/documents/12`）为例：

```
浏览器
  │  POST /api/world/documents/12  (带 session cookie + CSRF token)
  ▼
Django 请求管道
  │
  ├─ Django 内置中间件（GZip / Security / Session / Common / CSRF /
  │  Auth / OTP / Message / XFrameOptions）
  │
  ├─ ① ActiveWorldMiddleware        ← apps/world/middleware.py
  │     解析"当前世界"并写进 contextvar
  │     （会话选定 → 自己的第一个世界 → 兜底）
  │
  ├─ ② ReadPermissionMiddleware     ← apps/world/middleware.py
  │     这是读操作（GET/HEAD）吗？且落在受保护前缀？→ 判读权限
  │
  ├─ ③ EditPermissionMiddleware     ← apps/world/middleware.py
  │     这是写操作（POST）吗？是 → 拦下来判权限
  │     没登录 → 401；登录了但没权限 → 403；通过 → 放行
  │
  ├─ ④ 路由 → apps/world/urls.py → apps/world/views/ 的某个函数
  │
  └─ ⑤ 视图里：current_world() 取当前世界 → 读写模型 → 返回 JSON
```

> 三个自定义中间件在 `settings.MIDDLEWARE` 中排在 Django 内置链的**末尾**，
> 顺序是 `ActiveWorldMiddleware → ReadPermissionMiddleware → EditPermissionMiddleware`。
> 维护模式 (`MaintenanceMiddleware`) 也挂在这一段。

### 4.1 为什么把「当前世界」放进 contextvar

`current_world()` 在全站有大量调用点，如果每个视图都要从 `request` 里把世界传下去，
签名会变得很啰嗦。于是 `ActiveWorldMiddleware` 在请求一开始解析好世界，
存进一个 **`contextvars.ContextVar`**（一个"当前请求内随处可读"的变量），
请求结束再复位。

`contextvar`（而不是全局变量）的关键好处是：**它对每个请求是隔离的**，
并发的两个请求不会互相看到对方的世界。

### 4.2 为什么权限中间件要排在世界作用域之后

因为「有没有编辑权限」这件事**依赖"是哪个世界"**——
在 A 世界你是作者，在 B 世界你可能只是访客。
所以必须先知道"当前世界"（①），才能判权限（②③）。顺序不能颠倒。

### 4.3 中间件里的三道判断

守门人只对**受保护前缀**生效（写：`/api/world/`、`/api/items`、`/api/view`；
读：`/api/world/`、`/api/timeline`），然后按顺序问三个问题：

1. 数据库里一个用户都没有？→ 放行（首次安装例外，见 [§6](#6-权限模型)）。
2. 没登录？→ 回 `401 {"need_login": true}`（前端据此弹登录框）。
3. 登录了但在这个世界不能读 / 不能改？→ 回 `403`。

读守门人有一个例外：**发布站点的只读嵌入**（`?embed=<已发布文档>`），
它只放行**已经发布**的文档，游客可见。

白名单路径（`OPEN_WRITE_PREFIXES`）跳过写守门：登录/注册（那时还没身份）、
在线心跳（只读成员也要能发）、新建/切换世界（那时还没有自己的世界）。

---

## 5. 数据模型

> 完整的字段清单与目录地图见 [PLAN.md](PLAN.md)。这里只讲**结构**。

### 5.1 一张关系图

```
World（世界 = 一部作品）
├── owner ─────────────→ User
├── memberships ───────→ Membership（user + role）   ← 谁能进这个世界
├── invite_codes ──────→ InviteCode                  ← 邀请码
├── types ─────────────→ EntityType ─→ PropertyDef   ← 类型与它的属性定义（可继承）
├── eras ──────────────→ Era                          ← 纪元（世界版本）
├── calendars ─────────→ Calendar                     ← 自定义历法
├── documents ─────────→ Document（树）               ← 一切内容都是文档
│   ├── parent/children（自引用，构成树）
│   ├── card ──────────→ Card（当 document_type = card）
│   │   ├── values       （属性值，键值对）
│   │   └── blocks       （区块正文）
│   ├── events ────────→ TimelineEvent（当 = timeline）
│   │   └── linked_cards（多对多，关联卡片）
│   ├── layers ────────→ MapLayer ─→ MapMarker（当 = map）
│   ├── tree_variants ─→ TreeVariant ─→ TreeNode / TreeEdge（当 = tree）
│   └── versions ──────→ DocumentVersion（历史快照）
├── publish_logs ──────→ PublishLog                   ← 发布记录
└── presences ─────────→ Presence                     ← 谁在线
```

### 5.2 三个关键设计决定

**决定一：一切内容都是 `Document`。**
文件夹、卡片、时间线、地图、看板、笔记……全都是 `Document` 这个模型，
用一个 `document_type` 字段区分。好处是：

- 文档树只有一种节点，**可以任意嵌套**（卡片里放文件夹、文件夹里放时间线都行）。
- 所有文档共享一套通用字段（名字、slug、位置、发布状态、隐藏、纪元、删除时间）。
- 版本、回收站、发布这些横切能力，写一次就作用于所有文档类型。

代价是 `Document` 上会有一些"只对某种类型有意义"的字段。
这是**用一点点冗余换巨大的统一性**，非常划算。

**决定二：卡片有「类型」，类型可以继承。**
`EntityType`（实体类型，如"人物""地点""组织"）可以指定 `parent`，
子类型自动继承父类型的全部 `PropertyDef`。
这样「人物」定义了"姓名/生卒年"，「王室成员」继承它再加"继承顺序"，
不用重复定义。

**决定三：连线不落库。**
世界图谱的节点与连线是**每次请求即时算出来的**（见 [§7.3](#73-世界图谱)），
数据库里只存"钉住了哪些节点"这种视图状态。
好处是：任意时刻的图谱**永远和数据一致**，不会出现"改了卡片但图谱还是旧的"。
代价是每次要重算，所以有 `MAX_NODES` / `MAX_MENTION_SCAN` 这类上限兜住性能。

---

## 6. 权限模型

实现在 [apps/world/permissions.py](apps/world/permissions.py)，两条轴：

**世界角色**（在这个世界里能干什么）：

| 规则 | 说明 |
| --- | --- |
| **读需登录 + 是世界成员** | 工作区 `/api/world/*` 的读默认只给"登录且是该世界成员"（`?embed=` 只读嵌入是例外） |
| **写需登录 + 在世界里有权限** | 必须是该世界的 owner / editor |
| **首次安装例外** | 数据库里一个用户都没有时，允许任何人写（好让第一个注册者把世界建起来） |
| **超级管理员无视限制** | 仅 `is_superuser` 通行；`is_staff` 不再穿透 |
| **一人一世界起步** | 注册即得到一个属于自己的世界；受邀注册则加入邀请码指向的世界 |

角色取值：`owner`（所有者）/ `editor`（可编辑）/ `viewer`（只读）/ `guest`（未登录）。

**平台身份**（跨越所有世界的身份）：`superuser`（站长）/ `moderator`（管理员）/
`staff` / `user`。管理员身份存在 Django 内置 `Group` 里，由站长任命。

`permissions.viewer_payload()` 会把「我是谁、我能干什么」打包给前端，
前端据此决定哪些按钮可见、哪些输入框只读。

---

## 7. 关键算法

这些是这个项目里"有点意思"的部分。每个都给出了**输入 → 处理 → 输出**与**为什么这么做**。

### 7.1 属性值清洗与公式求值（`normalize.py`）

**输入：** 前端传来的任意 JSON（字符串、数字、数组、对象……）。
**输出：** 保证合法、长度受限、类型正确的 Python 值。

**为什么要有这一层：** 模型只负责"存"，不该负责"什么算合法"。
把所有校验收在 `normalize.py`，写入路径（接口 / admin / 导入脚本）拿到的结果就始终一致。

**公式求值（公式属性）：**
公式长这样：`@[attack] * 2 + @[bonus]`。求值过程：

1. 用正则 `@\[([^\]\n]{1,60})\]` 把 `@[名字]` 替换成该属性的值。
2. 用 Python 的 `ast` 模块解析成一个**语法树**。
3. 递归遍历这棵树，**只允许**数字、加减乘除、取余、乘方、正负号。

**为什么不用 `eval()`：** `eval("__import__('os').system('rm -rf /')")` 会执行任意代码。
用 `ast` 白名单遍历，只放行算术节点，其余一律报错——
这是"宁可少支持功能，也不留注入口子"的取舍。

### 7.2 名字自动识别（`autolink.py`）

**目标：** 在卡片正文里找出"已经存在的卡片名 / 别名"，前端把它渲染成链接。

**难点：** 中文没有空格分词，不能像英文那样按词切。

**策略：最长匹配优先 + 不重叠 + 跳过链接区间。**

```
候选名字按长度从长到短排序
  → 对每个名字，在正文里找它的每次出现
    → 若该区间不与已命中的区间重叠，且不在已有的 [[链接]] 里
      → 记为一次命中
```

**为什么要"最长匹配优先"：** 若同时存在「亚历山大」和「亚历山大图书馆」，
先试更长的，才能把「亚历山大图书馆」整体识别出来，而不是只认出「亚历山大」。

**额外两个细节：**

- **复数/所有格吞并：** 英文里 `Harrowdeep` 的复数 `Harrowdeeps` 也算命中，
  所以命中时会往后多吃一个 `s` / `es` / `'s`。
- **模糊匹配（typo-tolerant）：** 用 **Levenshtein 编辑距离**（带上限、提前退出）
  容忍拼写错误。但只对**长度 ≥ 5 的拉丁词**、距离 ≤ 2 才启用——
  太短的词做模糊匹配会到处误链。

`detect_new_names()` 还做一个保守启发式：正文里**出现两次以上、但还不是卡片**的名字，
作为"创建为卡片"的候选，并用一组中文虚词（`的了在和与…`）过滤掉"的洞室"这种碎片。

另有一个**名字补全**接口 `autolink.complete_names`（`GET /api/world/complete`）：
NFKC + casefold 归一化 → 前缀优先、包含兜底 → 带类型与描述返回，供输入框打字自动弹候选。

### 7.3 世界图谱（`graph.py`）

**目标：** 把世界画成一张"节点 + 连线"的图。

**连线的三个来源**（对应 Opuscule「属性引用也会画成线」的行为）：

| 来源 | kind | 规则 |
| --- | --- | --- |
| 引用属性 | `reference` | 卡片上 `value_type="reference"` 的属性值 → 一条线 |
| 事件关联 | `event` | 时间线事件挂的卡片 → 一条线（时间是另一种边） |
| 正文提及 | `mention` | 卡片正文写到别的卡片名 → 一条线（走 autolink） |

**处理流程：**

1. 取世界内未删除、非文件夹的文档（可选：只取已发布的，给访客用）。
2. 按三种来源收集连线，用 `(source, target, kind, label)` 去重。
3. **邻域裁剪：** 若指定了中心节点，用 **BFS** 只保留 `depth` 跳以内的节点。
4. 统计每个节点的**度数**（degree，即连了几条线）。
5. 支持 `hide_isolated`（隐藏孤立点）、`query`（搜索命中节点 + 一跳邻居）。

`degree` 用来决定节点大小——连得越多的卡片，在图里越"重"。

### 7.4 发布状态机（`publish.py` + `models.publish_state`）

发布不是"存一份快照"，而是**即时渲染 + 版本号推进**。每份文档有四个状态：

| 状态 | 含义 |
| --- | --- |
| `unpublished` | 没包含进站点 |
| `pending` | 包含了但还没上过站（新增） |
| `live` | 已上站且之后没改过 |
| `stale` | 上过站但之后改过（就是界面上那句 "Edited since you published"） |
| `excluded` | 被排除 |

**判断逻辑：** 比较 `published_at` 与 `updated_at` 的时间先后。
`updated_at` 比 `published_at` 新 → `stale`。

**发布动作：** `publish_version + 1` → 把该上站的文档打上这个版本号 → 写一条 `PublishLog`。
因为站点是即时渲染的，"重新发布"只是推进版本号；**下线**（unpublish）也不删数据，
只是让站点立刻 404，内容与版本号都保留。

`publish_preview()` 会先算出这次发布会**新增 / 更新 / 下架**哪些文档，供界面做差异提示。

### 7.5 版本快照（`models.DocumentVersion`）

每次保存文档时留一个快照，但做了两处优化：

- **90 秒内同一作者的连续保存会合并**成一条——否则打字时每敲几秒就存一条，历史会爆。
- **`MAX_VERSIONS = 30`**：超过上限裁剪最旧的。

这样"历史"既可用，又不会无限膨胀。

### 7.6 静态资源版本号（`context.py`）

**问题：** 无构建的前端，改了 CSS/JS 后浏览器可能还在用缓存。
**解法：** 一个 context processor 扫描 `static/` 目录里所有 `.js/.css/.webmanifest/.svg`
的**最新修改时间**，作为 `static_version` 注入模板；模板把它拼在资源 URL 后面（`?v=…`）。

**为什么用 2 秒缓存（`_STAMP_TTL`）而不是 `lru_cache`：**
`lru_cache` 会永久缓存，开发时改了文件也不会更新；
2 秒的短缓存既避免同一请求内重复扫盘，又能让改动很快生效。

---

## 8. 前端架构

前端是**无构建**的原生 HTML/CSS/JS。核心约定：

### 8.1 状态与渲染

- 工作区所有状态由 [static/workspace.js](static/workspace.js) 持有，
  它通过 `/api/world/*` 与后端通信。
- 经典时间轴页面由历史层脚本负责。
- `renderPanels()` **每帧重建**面板 DOM。这是一个重要的约束：
  **面板里不许挂有限次 CSS 动画**（会每帧重放），面板内入场一律走
  [Web Animations API](https://developer.mozilla.org/docs/Web/API/Web_Animations_API)，
  且只在"真的切换了标签页"那一次触发。

### 8.2 CSS 加载顺序是契约

多个皮肤层按固定顺序加载，**后加载的覆盖先加载的**，其中 `terminal.css` 是
当前权威的视觉语言（最后加载、覆盖下层皮肤）。改样式时不要打乱这个顺序。
（0.5.2 将整体重做布局与视觉语言，届时这条顺序会随之调整。）

### 8.3 前端请求约定

- 所有写请求带 **CSRF token**，后端用 Django 内置校验。
- 后端错误统一回 JSON（`{"error": "...", "need_login": true}`），
  前端据此弹登录框或提示条。
- 资源 URL 带 `?v=<static_version>`，见 [§7.6](#76-静态资源版本号contextpy)。

### 8.4 正文编辑器孤岛（唯一带构建的地方）

工作区的**正文区**是全区唯一的例外：它由 [frontend/editor](frontend/editor)（Vite + React +
[BlockNote](https://www.blocknotejs.org/)）渲染，其余一切（侧栏 / 属性 / 评论 / 顶栏 / 地图）
仍是原生 DOM。之所以能两套并存，靠的是既有的 `is-live-embed` 机制：

- `renderPanels()` 重建面板前，把带 `is-live-embed` 的节点**搬进** `#panelStage`（DOM 不销毁
  → React root、编辑器状态、光标都在），重建后由 `renderCardBody()` 按 key 认领回去。
  **于是"每帧重建面板"这个模型一行都没改。**
- 孤岛是**唯一**的正文渲染路径（P3 起）：没有开关、没有 `?editor=vanilla` 逃生舱，旧的
  vanilla 块渲染链（`renderBlock` / 斜杠菜单 / 格式栏 / 块工具条 / 拖拽 / 快照）已整体删除。
  资源在**首次渲染正文时按需注入** `editor.js` / `editor.css`。
- 文档的**权威存储**是 `Card.blocks_doc`（BlockNote 原生 JSON）。保存走
  `PUT /api/world/cards/<id> {blocks_doc}`，`blocks` / `body` 全由服务端派生
  （`normalize.doc_to_blocks`），因此 publish / autolink / search / exchange **零改动**。
  读取时若 `blocks_doc` 为空则惰性升格（`Card.editor_doc()` → `blocks_to_doc`）；升格不了的
  这一篇**不再回退 vanilla 渲染**（已无这条路），正文区就地给一块**只读降级提示**
  （`renderCardBody()` / `degradeBlock()`：说明原因 + 正文纯文本 + 「导出这一篇」），
  数据原样留着、可导出保底。
- 产物输出到 [static/editor/dist](static/editor/dist) 并**提交进仓库**（同
  [static/map/vendor](static/map/vendor) 的先例），部署机只要 Python，不需要 Node。
  改用 `?v=<static_version>` 引用。
- **一期（P1）放行 10 种文本块**：`paragraph` / `heading` / `quote` / `bulletListItem` /
  `numberedListItem` / `checkListItem` / `codeBlock` / `divider` / `toggleListItem` /
  `callout`。两端**共用同一份白名单**（`normalize._DOC_BLOCK_TYPES`），孤岛注册的
  blockSpec 与后端清洗的表必须一致，否则菜单里放出的块一保存就被丢掉。
  BlockNote 没有 `callout` 块，孤岛里用 `createReactBlockSpec` 自定义（外观在
  [frontend/editor/src/editor.css](frontend/editor/src/editor.css)）。
- **自定义斜杠菜单（P2）**：BlockNote 默认菜单是硬编码列表，放不出自定义的 `callout`，
  所以孤岛关掉自带菜单（`BlockNoteView slashMenu={false}`），改用
  [main.jsx](frontend/editor/src/main.jsx) 里的 `SuggestionMenuController`——默认项
  取自 `getDefaultReactSlashMenuItems`，再补一项「提示框」（文案对齐旧 vanilla 菜单），
  插在「段落」后面、同归「基础」组。点它走 `insertOrUpdateBlockForSlashMenu`。
  自定义项图标只能自画 SVG：`react-icons` 非直接依赖（被 `@blocknote/react` 内联进产物）。
- **重块嵌入 + collection 只读（P2）**：`image` / `bookmark` / `card` / `collection` 这四种是
  「重块」——它们的 DOM（图床、卡片预览、内联数据库表格）是一大坨 vanilla DOM，用 React 重写
  一遍不划算。做法是**嵌现有渲染器**：孤岛给它们注册 `content:'none'` 的 blockSpec，只渲染一个
  空容器 `div.opus-heavy.opus-heavy-<kind>`；`mount` 时工作区传入
  `options.bridge.renderHeavyBlock(container, kind, data)`，回调里调 `renderIslandHeavyBlock()`
  把**旧的 vanilla 渲染器**画进容器（复用 `renderCollectionBlock` / `block-image` 等既有类名，
  视觉零漂移）。桥接端口靠 `BridgeContext` 在 `BlockNoteView` 外层 Provide，`createPortal`
  穿透到自定义块。白名单 `normalize._DOC_BLOCK_TYPES` 随之从 10 种扩到 14 种。
- **重块：渲染只读、插入回写**。嵌进孤岛的**既有**重块不接任何写事件（改地址 / 换图 /
  改单元格 / 拖看板全部不挂），只保留跳转型交互（书签链接、嵌入卡的「打开」）。collection 用一个
  `readonly` 布尔贯穿类型选择 / 视图切换 / 视图设置齿轮 / 表格单元格 / 看板拖拽 / 日历翻月这六处，
  全部封住写与重画——**绝不能走 `saveBlock`**，那会 PUT 旧 `blocks` 把 `blocks_doc` 的权威性打掉。
  反过来，**新建**重块走孤岛斜杠菜单：这四项点了以后经 `bridge.prepareHeavyBlock(kind)` 回调
  **弹回旧的 vanilla 对话框**（图片地址 + 上传、卡片选择器、集合设置）问数据，拿到 props 再由孤岛
  把它写进文档（`onChange` 防抖落库）。
  另：`media` / `tool` / `table` / `embed` 是**文档级**类型（整篇即一张表 / 一个嵌入工具），没有
  块级渲染分支，`blocks_to_doc` 遇到它们**整体返回 `None`**，整卡走上面的只读降级提示，零数据丢失。
- 缩进（Tab）在 `blocks_doc` 里是 `children` **嵌套**；派生旧 `blocks` 时递归拍平，
  把嵌套深度回写成 `level`（截到 `0..2`）。

---

## 9. 部署

生产环境用 gunicorn 起 Django，前面挂 nginx 处理静态资源与 TLS。
关键环境变量：

| 变量 | 作用 |
| --- | --- |
| `DJANGO_SECRET_KEY` | 生产必须设置（不设会用本地兜底密钥） |
| `DJANGO_DEBUG` | 生产必须为空（默认关） |
| `DJANGO_ALLOWED_HOSTS` | 允许的域名，逗号分隔 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 允许的跨站来源 |
| `OPUSCULE_MAINTENANCE` | 置 `1` 开启维护模式 |
| `OPUSCULE_ADMIN_PATH` | 后台路径（不从默认 `admin` 出发） |
| `OPUSCULE_LOG_FILE` | 可选：按大小轮转的日志文件（10 MB × 5） |
| `OPUSCULE_VERSION` / `OPUSCULE_CHANNEL` / `OPUSCULE_BUILD` | 版本展示串的覆盖与构建号 |

完整的部署步骤、nginx 配置、systemd 单元、备份脚本与维护模式，
见 [deploy/](deploy/) 目录（`nginx-opuscule.conf` / `opuscule.service` /
`opuscule.env.example` / `backup.sh`）。

**版本单一来源：** `settings.APP_NAME` / `APP_VERSION` / `APP_CHANNEL` / `APP_CHANNEL_SEQ`，
派生展示串集中在 [apps/world/version.py](apps/world/version.py) 的 `app_info()`，
页脚与 `/meta` 接口都引用它。

---

## 10. 一张图总结

```
         ┌────────────────────────────── 浏览器 ──────────────────────────────┐
         │  /world（工作区）        /s/<短码>/（只读站点）      /legacy（经典轴） │
         └───────┬──────────────────────┬─────────────────────────┬──────────┘
                 │ JSON over /api/world │ HTML                    │ JSON over /api
                 ▼                      ▼                         ▼
   ┌────────────────────── Django ──────────────────────┐   ┌──────────────┐
   │  middleware: 世界作用域 → 读/写守门人 → CSRF        │   │  timeline app │
   │  views: 编排请求                                     │   └──────┬───────┘
   │  algorithms: normalize / autolink / graph / publish │          │
   │  models: World → Document → Card / Timeline / …     │◄─────────┘
   └──────────────────────┬───────────────────────────────┘   classic 适配层
                          │ ORM
                          ▼
                    SQLite（单文件）
```

---

相关文档：[README.md](README.md) · [PLAN.md](PLAN.md)。
