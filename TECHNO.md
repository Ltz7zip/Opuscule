# Opuscule · 技术架构

> **文档版本：0.5.1-dev**
>
> 这份文档回答一个问题：**这个项目是怎么跑起来的？**
> 它从「一次请求」出发，往下走到数据模型与关键算法，往旁边讲到前端与部署。
> 目标是让一个刚学会 Python、还没写过 Web 应用的人，也能顺着读下来。

如果你只想先跑起来，看 [README.md](README.md) 的「快速开始」。
如果你想改外观，看 [DESIGN.md](DESIGN.md)。

---

## 1. 技术栈与设计取舍

| 层 | 选择 | 为什么这么选 |
| --- | --- | --- |
| 语言 | Python 3.12+（开发用 3.14） | 生态成熟、可读性高 |
| Web 框架 | Django 6.1.1 | 自带 ORM、迁移、admin、CSRF、会话，一个依赖顶一套 |
| 数据库 | SQLite（单文件） | 零配置；一个人写设定的数据量，一个文件足够，备份就是拷文件 |
| 前端 | 原生 HTML/CSS/JS，**无构建** | 不引入 Node/npm/打包器；改一行刷新即见；降低上手门槛 |
| 生产服务器 | gunicorn | 与 Django 标准搭配 |
| 依赖 | 只有 Django + gunicorn | 依赖越少，能坏的地方越少 |

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
├── middleware.py      请求级：世界作用域 + 写操作守门人
├── permissions.py     谁能看、谁能改、"当前世界"是谁
├── normalize.py       取值规则：属性清洗 / 公式求值 / 引用解析 / 区块转换
├── site_views.py      只读站点的页面视图
├── calendarview.py    月视图与月相
├── relations.py       关系树词表（纯数据，无逻辑）
├── relationship.py    关系树逻辑
├── mapdoc.py          /map 独立页
├── classic.py         经典时间轴适配层
├── admin.py           Django admin 注册
└── context.py         静态资源版本号 context processor
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
  ├─ ① ActiveWorldMiddleware        ← apps/world/middleware.py
  │     解析"当前世界"并写进 contextvar
  │     （会话选定 → 自己的第一个世界 → 兜底）
  │
  ├─ ② EditPermissionMiddleware     ← apps/world/middleware.py
  │     这是写操作（POST）吗？是 → 拦下来判权限
  │     没登录 → 401；登录了但没权限 → 403；通过 → 放行
  │
  ├─ ③ CSRF 校验（Django 内置）
  │
  ├─ ④ 路由 → apps/world/urls.py → apps/world/views/ 的某个函数
  │
  └─ ⑤ 视图里：current_world() 取当前世界 → 读写模型 → 返回 JSON
```

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
所以必须先知道"当前世界"（①），才能判权限（②）。顺序不能颠倒。

### 4.3 中间件里的三道判断

`EditPermissionMiddleware` 只对**写方法**（POST/PUT/PATCH/DELETE）且**受保护路径**生效，
然后按顺序问三个问题：

1. 数据库里一个用户都没有？→ 放行（首次安装例外，见 [§6](#6-权限模型)）。
2. 没登录？→ 回 `401 {"need_login": true}`（前端据此弹登录框）。
3. 登录了但在这个世界不能编辑？→ 回 `403`。

白名单路径（`OPEN_WRITE_PREFIXES`）跳过守门：登录/注册（那时还没身份）、
在线心跳（只读成员也要能发）、新建/切换世界（那时还没有自己的世界）。

---

## 5. 数据模型

> 完整的字段清单见 [docs/02-数据模型.md](docs/02-数据模型.md)。这里只讲**结构**。

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

五条规则，实现在 [apps/world/permissions.py](apps/world/permissions.py)：

| 规则 | 说明 |
| --- | --- |
| **读永远公开** | 只读站点给读者看；工作区也允许游客浏览 |
| **写需登录 + 在世界里有权限** | 必须是该世界的 owner / editor |
| **首次安装例外** | 数据库里一个用户都没有时，允许任何人写（好让第一个注册者把世界建起来） |
| **超级管理员无视限制** | 仅 `is_superuser` 通行；`is_staff` 不再穿透（S7） |
| **一人一世界起步** | 注册即得到一个属于自己的世界；受邀注册则加入邀请码指向的世界 |

角色取值：`owner`（所有者）/ `editor`（可编辑）/ `viewer`（只读）/ `guest`（未登录）。

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
- 已有的历史层 [static/script.js](static/script.js) 负责经典时间轴页面。
- `renderPanels()` **每帧重建**面板 DOM。这是一个重要的约束：
  **面板里不许挂有限次 CSS 动画**（会每帧重放），面板内入场一律走
  [Web Animations API](https://developer.mozilla.org/docs/Web/API/Web_Animations_API)，
  且只在"真的切换了标签页"那一次触发。详见 [DESIGN.md §7.5](DESIGN.md)。

### 8.2 前端请求约定

- 所有写请求带 **CSRF token**，后端用 Django 内置校验。
- 后端错误统一回 JSON（`{"error": "...", "need_login": true}`），
  前端据此弹登录框或提示条。
- 资源 URL 带 `?v=<static_version>`，见 [§7.6](#76-静态资源版本号contextpy)。

### 8.3 Service Worker

[static/sw.js](static/sw.js) 做 PWA 离线缓存，**只在非 DEBUG 环境启用**
（`settings.SW_ENABLED`），开发时不注册，避免缓存干扰调试。

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

完整的部署步骤、nginx 配置、systemd 单元、备份脚本与维护模式，
见 [docs/13-部署与运维.md](docs/13-部署与运维.md) 与 [deploy/](deploy/) 目录。

---

## 10. 一张图总结

```
         ┌────────────────────────────── 浏览器 ──────────────────────────────┐
         │  /world（工作区）        /s/<短码>/（只读站点）      /legacy（经典轴） │
         └───────┬──────────────────────┬─────────────────────────┬──────────┘
                 │ JSON over /api/world │ HTML                    │ JSON over /api
                 ▼                      ▼                         ▼
   ┌────────────────────── Django ──────────────────────┐   ┌──────────────┐
   │  middleware: 世界作用域 → 写操作守门人 → CSRF        │   │  timeline app │
   │  views: 编排请求                                     │   └──────┬───────┘
   │  algorithms: normalize / autolink / graph / publish │          │
   │  models: World → Document → Card / Timeline / …     │◄─────────┘
   └──────────────────────┬───────────────────────────────┘   classic 适配层
                          │ ORM
                          ▼
                    SQLite（单文件）
```

---

相关文档：[README.md](README.md) · [DESIGN.md](DESIGN.md) ·
[docs/01-架构总览.md](docs/01-架构总览.md) · [docs/02-数据模型.md](docs/02-数据模型.md)。
