# 世界观共建 · 时间轴（Django 后端）

一条可以被共建的时间轴：往轴上添加「事件」（时间点）和「纪元」（时间段），
填写名称与介绍。

后端已从 **Flask 换成 Django**（Django 6.1 + SQLite + Django ORM）。

> 迁移当时的说明是「前端一行没改」。**这一点已经不再成立**：交互改过一次，
> 前端现在是自己维护的（见下面的「怎么添加」）。
>
> **2026-10-05 又改了一次**：前端整个重写成录屏「The Grand Alchemy」时间线编辑区的
> 一比一复刻（见文末「复刻说明」）。旧版的加号入口、详情卡、类型徽标都不在了。
>
> **2026-10-05 再改一次**：加了一整层动效，并做了一轮「站在用户角度」的体验返工
> （见文末「动效与体验」）。**静止态的像素几何没有动**，仍然和录屏对齐。
>
> **2026-10-06 新增 `world` 应用**：按《VVD功能调研.md》第 13 节的优先级做 vvd 式复刻，
> 落地了「卡片 / 类型 / 属性」数据模型与时间线的日历层，前端是一套新的工作区
> （文档树 + 多标签 + 并排面板 + ⌘K + 名字自动识别），挂在 **`/world`**（`/` 与旧的 `/w` 都跳到这里）；
> 原来的 `/` 单时间轴经典视图与它的测试**一行未改**。见文末「vvd 式复刻（world 应用）」。

---

## 怎么添加事件 / 纪元

类型不靠按钮选，而是由**手在哪儿**决定：

| 操作 | 结果 |
| --- | --- |
| 悬停轴线（上下 26px 内） | 轴线上的圆形 **+** 浮出，上方跟着「Month 5, Year −8 · 点击添加」 |
| 点那个圆形 **+**（或直接点轴线） | 在该时刻新建**时间点**（事件），并弹出编辑卡片 |
| 悬停轴线下方 | 浮出一条虚线预览色带 + 「起 – 止 · 点击添加」提示；色带落在**指针所在那一行**，那一行被占了就往下让 |
| 点预览色带的位置 | 以预览范围新建**时间段**（纪元），并弹出编辑卡片 |
| 点已有圆点 / 标签 / 色带 | 选中并把编辑卡片贴在它上方（圆点带光晕、标签反白） |
| 拖拽色带本体 | 整段平移，跟随指针显示当前范围 |
| 拖拽色带两端手柄 | 改这条纪元的起止 |
| 拖拽任意空白处 | 平移画布（轴线下方那半屏也可以了，见「动效与体验」） |
| 滚轮 / 触控板 | 缩放；**Shift** + 滚轮左右平移 |
| 右侧三个按钮 | 放大 / 缩小 / 适应内容（都是**飞**过去，不是瞬移） |
| 底部工具条第 2 个（手型） | 切成「拖画面」模式：点任何东西都不弹编辑卡片、不浮预览，只能平移 |
| **右键框选**（选择模式下） | 拉出选框，松手选中所有相交的时间点 / 纪元；顶部浮出「N 已选择」条（复制 / 删除 / 取消） |
| 拖动已选中的一员 | 整组一起平移，松手后逐条落库 |
| Delete / Backspace | 删除所选（**可以撤销**） |
| Esc | 关浮层 / 取消框选 / **中断正在进行的拖拽**（撤回原位，一条都不落库） |
| 点右下角 **?** | 打开完整的操作指南（鼠标 + 键盘） |

键盘：`?` 指南 · `V` 选择 · `H` 拖画面 · `+` / `−` 缩放 · `F`（或 `0`）适应内容 ·
`←` `→` 平移（按住 Shift 走得更快）· `⌘/Ctrl+Z` 撤销 · `⌘/Ctrl+D` 复制 · `Delete` 删除。

编辑卡片**没有保存按钮**：标题、描述边打边存（失焦或停顿 0.5 秒落库），
点别处即关闭；左下角会浮一个很轻的「保存中 / 已保存」状态点，
所以不用猜到底写进去没有。卡片左上角的方块就是配色：时间点没有配色，
纪元点它会弹出六色色板（录屏里没演到这一步，功能上补的）。

删除是**先删、再用 Toast 上的「撤销」找回来**（不弹确认框）。

配色有六种：灰蓝 / 湛蓝 / 紫罗兰 / 暗红 / 青绿 / 鎏金
（`blue` / `sky` / `violet` / `red` / `teal` / `gold`）。

---

## 快速开始

```bash
# 1) 装依赖（本机 .venv 里已经装好 Django 6.1.1）
.venv/bin/pip install -r requirements.txt

# 2) 建表（db.sqlite3 里已经有数据，这一步是幂等的）
.venv/bin/python manage.py migrate

# 3) 起服务
.venv/bin/python manage.py runserver          # http://127.0.0.1:8000
.venv/bin/python manage.py runserver 8080     # 换端口

# 可选：Django 自带的可视化后台
.venv/bin/python manage.py createsuperuser    # 建管理员
# 然后访问 http://127.0.0.1:8000/admin/
```

要求 Python 3.12+（本机是 3.14.6）。

---

## 目录结构

```
worldbuilding_timeline/
├── manage.py                      # Django 命令行入口
├── db.sqlite3                     # SQLite 数据库：现在唯一的数据存放处（注意备份！）
├── requirements.txt
│
├── worldbuilding_timeline/        # 项目配置
│   ├── settings.py                # 注册 timeline 应用、模板/静态目录、SQLite
│   ├── urls.py                    # /admin/ + 其余交给 timeline
│   ├── wsgi.py / asgi.py          # 部署入口
│
├── timeline/                      # 业务应用
│   ├── models.py                  # TimelineItem（条目）+ TimelineView（视野单例）
│   ├── normalize.py               # 入参规范化（原 app.py 的 _as_float/normalize 等）
│   ├── views.py                   # 5 个视图：页面 + 4 个 JSON 接口
│   ├── urls.py                    # 路由表，路径与 Flask 版完全一致
│   ├── admin.py                   # 后台配置
│   ├── legacy.py                  # 旧 JSON 的解析与导入（给迁移/命令行用）
│   ├── tests.py                   # 27 个接口契约测试
│   ├── migrations/
│   │   ├── 0001_initial.py
│   │   └── 0002_import_legacy_data.py   # 建表时导入旧 JSON 数据
│   └── management/commands/import_legacy_json.py
│
├── world/                         # 本轮新增：vvd 式世界工作区
│   ├── models.py                  # World / EntityType / PropertyDef / Document / Card /
│   │                              #   Calendar / Era / TimelineEvent
│   ├── normalize.py               # 属性取值规则（七种值类型 + 公式求值 + 区块正文）
│   ├── autolink.py                # 名字自动识别（最长匹配 + 跳过已有 [[链接]]）
│   ├── views.py                   # /api/world/* 的 JSON 接口 + /world 页面
│   ├── urls.py                    # 接口路由表
│   ├── admin.py                   # 后台配置
│   ├── graph.py                   # 世界图谱（引用 / 事件关联 / 正文提及三种连线）
│   ├── publish.py                 # 发布与站点取数（含四态发布状态机）
│   ├── site_views.py              # 只读站点：首页 / 页面 / 密码解锁
│   ├── tests.py                   # 100 个测试（模型 + 取值 + 接口 + 图谱 + 关系树 + 地图 + 发布 + 富文本 + 导入导出 + 建议）
│   └── management/commands/
│       ├── seed_demo.py           # 灌一份演示世界（The Grand Alchemy）
│       └── import_timeline.py     # 把 timeline 应用的旧数据迁进来
│
├── templates/
│   ├── index.html                 # 经典时间轴页面（像素级复刻）
│   ├── workspace.html             # 工作区页面（/world）
│   └── site/                      # 发布出来的只读站点（base / home / page / password）
└── static/
    ├── style.css / script.js      # 经典时间轴前端（交互 + 动效层）
    ├── workspace.css / workspace.js  # 工作区前端（文档树 / 标签页 / 卡片 / 时间线 / 图谱 / 关系树 / 地图 / 发布）
    └── site.css                   # 只读站点样式（浅色纸感）
```

---

## 接口

路径、HTTP 方法、返回结构与 Flask 版完全一致，所以前端不用动。

| 方法 | 路径 | 说明 | 成功返回 |
| --- | --- | --- | --- |
| GET | `/` | 页面 | `index.html` |
| GET | `/api/timeline` | 全量数据 | `{"view": {...}, "items": [...]}` |
| POST | `/api/items` | 新建条目 | `201` + 完整条目 |
| PUT / PATCH | `/api/items/<id>` | 更新条目（只传要改的字段即可） | `200` + 完整条目 |
| DELETE | `/api/items/<id>` | 删除条目 | `200` + `{"success": true, "removed": {...}}` |
| PUT | `/api/view` | 记住浏览范围 | `200` + `{"start": ..., "end": ...}` |
| — | `/admin/` | Django 后台（新增） | — |

* 条目找不到：`404 {"error": "未找到该事件"}`
* `/api/` 下路径不存在：`404 {"error": "接口不存在"}`
* 方法不对：`405`

数据规范化规则（`timeline/normalize.py`，从 Flask 版原样搬来）：
标题最长 120 字、介绍 4000 字、封面 1200 字、卡片 40 张；
纪元起止颠倒会自动交换、配色只认 `blue/violet/red/teal`；
事件强制 `end = start`，且不返回 `theme` 字段。

---

## vvd 式复刻（world 应用）

调研结论见 **《[VVD功能调研.md](VVD功能调研.md)》**；这里只写落地了什么、怎么跑。

### 页面与接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/world` | 工作区页面（文档树 + 多标签 + 并排面板 + ⌘K）；`/` 与 `/w` 302 到这里 |
| GET | `/legacy` | 独立成页的经典时间轴（像素级复刻那一版，工作区里嵌的是同一个模板） |
| GET | `/world/timeline/<doc_id>` | 工作区里嵌入的经典编辑器（同源 iframe，接口走适配层） |
| GET | `/api/world/state` | 启动数据：世界 + 类型 + 纪元 + 日历 + 文档树 |
| GET/PUT | `/api/world/world` | 读写当前世界（名称 / 主题 / AI 与自动识别开关 / 题材） |
| GET/POST | `/api/world/documents` | 文档列表 / 新建（卡片会自动带一张 Card） |
| GET/PUT/DELETE | `/api/world/documents/<id>` | 详情 / 改名移动置顶隐藏 / 软删除（`?hard=1` 彻底删） |
| POST | `/api/world/documents/<id>/duplicate` | 复制文档（卡片带属性与区块，时间线带事件与关联） |
| GET/POST | `/api/world/types`、`/api/world/types/<id>` | 类型 / 子类型（删除时子类型上提、卡片保留） |
| POST/PUT/DELETE | `/api/world/types/<id>/properties`、`/api/world/properties/<id>` | 属性定义（七种值类型、必填、默认值、公式、选项） |
| GET/PUT | `/api/world/cards/<doc_id>` | 卡片内容（别名 / 属性值 / 区块），属性值逐条按类型校验 |
| GET | `/api/world/timelines/<doc_id>` | 时间线状态（日历 + 纪元 + 事件 + 视野） |
| POST/PUT/DELETE | `/api/world/timelines/<id>/events`、`/api/world/events/<id>` | 事件增删改（四级精度） |
| POST/DELETE | `/api/world/events/<id>/cards[/<card_id>]` | 关联 / 取消关联卡片，可设「特色卡片」 |
| GET/POST/PUT/DELETE | `/api/world/calendars[...]` | 日历（月 / 每天小时数 / 卫星 / 默认精度） |
| POST | `/api/world/calendars/<id>/preset`、`/api/world/timelines/<id>/apply-preset` | 日历预设：存下来、应用到任意时间线 |
| GET/POST/PUT/DELETE | `/api/world/eras[...]` | 纪元（各自从 0 年起算，可设长度与配色） |
| GET | `/api/world/search?q=` | 全库搜索（标题 / 别名 / 正文 / 属性值都能命中） |
| POST | `/api/world/autolink` | 正文里的名字识别（最长匹配优先、跳过 `[[已链接]]`） |
| GET | `/api/world/backlinks/<doc_id>` | 谁提到了这张卡 |
| GET | `/api/world/graph` | 世界图谱：`?q=` 关键词、`hide_isolated=1`、`center=<id>&depth=1` |
| GET | `/api/world/trees/<doc_id>` | 关系树状态（变体 + 成员 + 关系） |
| POST | `/api/world/trees/<doc_id>/variants` | 新建变体（带 `fork_from` 则复制当前这棵） |
| PUT/DELETE | `/api/world/tree-variants/<id>` | 改名 / 换模板 / 改关系名 / 删除 |
| POST | `/api/world/tree-variants/<id>/nodes`、`/edges` | 加成员 / 加关系 |
| PUT/DELETE | `/api/world/tree-nodes/<id>`、`/tree-edges/<id>` | 改成员（位置 / 世代 / 交汇点 / 已故）/ 改关系名 / 删除 |
| POST | `/api/world/tree-nodes/<id>/card` | 给这个人**新建一张卡片**并吸附 |
| GET | `/api/world/maps/<doc_id>` | 地图状态（底图 + 图层 + 标注） |
| POST | `/api/world/maps/<doc_id>/background` | 设底图：multipart 上传 或 `{url}` 或 `{clear:1}` |
| POST | `/api/world/maps/<doc_id>/layers`、`/markers` | 加图层 / 加标注（图钉·区域·文字） |
| PUT/DELETE | `/api/world/map-layers/<id>`、`/map-markers/<id>` | 改图层显隐与透明度 / 改标注（位置·多边形·颜色·关联卡片）/ 删除 |
| GET/POST | `/api/world/publish` | 看站点状态 / 发布（重新发布） |
| POST | `/api/world/unpublish` | 下线站点（内容与版本号保留） |

### 数据模型（world 应用）

| 模型 | 作用 | 关键字段 |
| --- | --- | --- |
| `World` | 顶层容器 | `theme_config`（mode / grain / headingFont / bodyFont / primaryColor）、`ai_enabled`、`auto_link_enabled`、`genres` |
| `EntityType` | 卡片类型（可嵌套） | `parent`、`icon`、`color`、`hidden`；属性沿类型链继承并可覆盖 |
| `PropertyDef` | 类型上的一条属性 | `value_type`（文本/单选/多选/数字/日期/引用/公式）、`options`、`required`、`default_value`、`formula`、`show_on_existing` |
| `Document` | 文件夹 / 卡片 / 时间线 / … | `document_type`、`parent`+`position`（树）、`era`+`era_ids`、`settings`、`hidden`、`is_published`、`forked_from`、`deleted_at`（软删除） |
| `Card` | 卡片内容（与 Document 一对一） | `aliases`、`values`（按属性 id）、`blocks`、`body`（正文纯文本，供搜索与识别） |
| `Calendar` | 自定义日历 | `mode`（earth/custom）、`hours_per_day`、`months`、`moons`、`default_precision`、`is_preset` |
| `Era` | 纪元 | `position`、`length_years`、`theme`、`icon`、`description`、`cover` |
| `TimelineEvent` | 时间线上的事件 | `precision`（年/月/日/时间）、`year/month/day/hour`、`era`、`linked_cards`、`featured_card`、`row` |

取值规则全部收在 `world/normalize.py`：单选/多选会**就地新建选项**、引用必须指向本世界的卡片、
公式用 AST 白名单求值（`@[稀有度] * @[价格]`，注入与 `inf` 一律算「算不出来」）。

### 发布出来的只读站点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/s/<slug>/` | 站点首页：按卡片类型分区的网格 + 搜索 |
| GET | `/s/<slug>/<doc_slug>/` | 卡片 / 时间线页面（属性表 + 区块 + 相关） |
| POST | `/s/<slug>/unlock` | 密码档解锁（用 session 记住） |

* **站点级**：`is_published`（发布状态）、`published_slug`（地址）、`audience`（`public` / `unlisted` / `password`）、`publish_version`（每次发布 +1，页脚显示）。
* **文档级**：`is_published`（是否进站点）、`hidden`（在维基中隐藏）、`published_at`（上次进入站点的时刻）。
* **状态机**（对齐调研文档 §4.4）：`live` 与站点一致 / `stale` 发布后改过 / `pending` 站点发布后才建 / `excluded` 被排除 /
  `unpublished` 站点还没发布。判断依据是「最后修改时间 > 上次发布时刻」，所以**改一个字就会变成 stale**。
* 图谱、看板、文件夹这类"工作台视图"不出版（对齐 `wikiChrome.pages.docTypes` 的口径）；`unlisted` 会带 `noindex`。

### 时间线：工作区里直接用经典编辑器

工作区打开时间线文档时，**不再用那套简化渲染器，而是把已有的经典编辑器嵌进来**
（`/w/timeline/<doc_id>`，像素级复刻的那一版：点阵、轴线、拖拽、缩放、时间段都在）。

* **编辑器一行代码没改**：模板在 `script.js` 之前注入一段 fetch 适配层，把它写死的
  `/api/timeline`、`/api/items*`、`/api/view` 改写到某条时间线文档上（转换规则见 `world/classic.py`）。
* 两种数据形态的对应关系：`kind="event"` + 浮点年 ⇄ `TimelineEvent`（年/月/日/时四级精度）；
  `kind="era"` + 起止年 ⇄ `Era` + 文档 `settings.era_spans`；`cards[]` ⇄ 事件的 `linked_cards`
  （按名字对应卡片）；`view` ⇄ `settings.view_start / view_end`。
* 精度取舍：经典编辑器是按月在轴上走的，所以**没显式指定精度时新建事件至少存到「月」**，
  拖到年中不会被丢成那年 1 月；面板里可以显式改成「年/月/日/时间」。
* 面板顶部补了经典编辑器没有的两件事：**事件与卡片**（事件精度、纪元归属、关联卡片、特色卡片）
  与 **日历与纪元**（自定义日历、月、卫星、纪元）。
* 想用回工作区自带的简化渲染器做对比：地址后加 `&tl=new`（`/world#doc=<id>&tl=new`）。
* **滚轮 / 触控板 = 左右移动时间轴**；缩放是 `⌘/Ctrl + 滚轮`（触控板双指捏合），按钮缩放照旧。
* 写接口（新建 / 更新）返回的也必须是**经典形状**（`kind/title/start/end/…`）——编辑器会把返回值
  直接 adopt 进本地列表，缺字段会让它把纪元当成事件。
* 同源 iframe 需要放行：`settings.X_FRAME_OPTIONS = "SAMEORIGIN"`（Django 默认 DENY）。

### 视觉：Minimal 设计语言（桌面 Minimalist 设计系统）

外观层在 `static/minimal.css`，依据那套设计系统的权威 token 落地（`css.json` / `colors_and_type.css`）：

| 维度 | 取值 |
| --- | --- |
| 主色 | **灰阶**：`#18181b`（浅色）/ `#fafafa`（深色）——不靠彩色抢注意力 |
| 圆角 | 一档语言：`6px` / `12px` / `16px`（浮层与模态用 24px 的柔化变体） |
| 间距 | `4px` 基准，信息密度偏紧 |
| 阴影 | 基本归零（`0 1px 2px`），靠 1px 边框与表面色阶分层 |
| 字体 | Geist（UI）/ DM Serif Display（强调）/ Geist Mono（数据），本机没装则回退系统字 |
| 图标 | 设计系统自带的 40 个线条图标（`static/icons/`）+ 按同风格补的排版图标，全部 `currentColor` |

* **圆角矩形用在所有区域**：任务栏（胶囊按钮 + 胶囊导航）、侧边栏（圆角行 + 圆形图标按钮）、
  面板标签（圆角 chip）、编辑区（属性行、区块、封面、插入条）、浮层（气泡工具栏 / 下拉 / 选择器 / 模态 / 抽屉）。
* **明暗跟随世界主题**：`world.theme.mode` 写到 `<html data-theme>`；浅色时是 Minimal 的纸白
  （`#ffffff` / `#f5f5f5`），深色时是它的暗阶（`#0a0a0a` / `#171717`）。
* 旧的暗色 token（`--ink / --panel / --line …`）在 `minimal.css` 里被别名到 Minimal 的表面色阶梯，
  这样明暗切换是整体的，不会只变一半。

### 账号 / 协作 / 版本历史

**注册与登录**：`/register`（第一个账号直接成为**所有者**，之后注册需要所有者发的**邀请码**）、
`/login`、`/logout`。**读永远公开**（发布站点照旧给读者看），**写需要登录 + 编辑权限**——
由中间件 `world/middleware.py` 统一拦截，白名单只有登录/注册与在线心跳。

| 角色 | 能做什么 |
| --- | --- |
| 所有者 owner | 编辑 + 管成员 / 发邀请码 / 改角色 |
| 可编辑 editor | 编辑内容 |
| 只读 viewer | 只能看（界面上会收起所有编辑入口并显示只读条） |
| 游客 guest | 只能看，正文不可编辑，顶栏提示登录 |

**协作**：在线状态（心跳式，20 秒窗口）——顶栏显示同伴头像、"谁在这里"；
协作者弹窗可以改角色、移除成员、生成/删除邀请码（复制成邀请链接）。
**编辑冲突保护**：每份文档带一个修订号（每次写入 +1）。客户端写入时带上自己加载时的修订号，
对不上就返回 **409** 并把服务端最新内容一起带回——界面提示"这份文档刚被别人改过，已刷新成最新内容"
并重画，**不覆盖别人的改动**；拿到新修订号后重试即可。没有修订号的老客户端 / 脚本按原行为放行。

**版本历史**：每次内容改动留快照（同一作者 90 秒内的连续编辑合并成一版，每份文档最多 30 版），
命令面板 →「版本历史…」可以查看版本列表、**预览内容**、**回滚**；回滚本身也会先备份一版。

接口：`/api/world/auth/{me,register,login,logout}`、`/api/world/collaborators[/invites]`、
`/api/world/presence`、`/api/world/documents/<id>/versions[/<n>]`。

### 日历视图与纪元分支

* **日历视图**：时间线面板左上角可切「线视图 / 日历视图」。日历视图按自定义历法画月网格
  （月份名与天数、每天小时数都来自日历），格子里有当天的**事件**与**月相**；
  月相按卫星的 `cycle_days` + `full_on` 推算，展示策略支持 `每晚 / 只显示四相 / 只显示满月`。
* **纪元 = 世界的版本**：顶栏的纪元 chip 可以切到某个纪元。每张卡有「纪元可见性」——
  所有纪元 / 只在选定纪元 / 在选定纪元里隐藏；切换纪元后不属于那一版的卡在侧栏标灰，
  纪元还能带自己的主题（切过去时覆盖世界主题）。

接口：`GET /api/world/calendars/<id>/month?year=&month=&document=`；
卡的 `era_mode` / `era_ids` 走 `PUT /api/world/cards/<id>`，纪元主题走 `PUT /api/world/eras/<id>`。

### 块的嵌套与嵌入

* **缩进 / 折叠**：块有 `level`（0–2）与 `collapsed`；正文里按 `Tab` / `⇧Tab` 缩进或取消缩进，
  块菜单里也能改；缩进的块带一条竖参考线，折叠的块收起后随后的子块一起隐藏。
* **嵌入卡**（`type: "card"`）：把另一张卡片做成一张可点的卡片（名称 + 正文摘要 + 打开）。
  块菜单 →「嵌入一张卡片…」，用可搜索的选择器挑。
* **图片块**（`type: "image"`）：块菜单 →「插入图片…」，给地址或**直接上传**（走文档媒体接口），可带图注。
* 服务端会清洗这三类块的 `settings`（卡片嵌入只认数字 id），脏数据不会透传。

### 无障碍

* **播报**：`#srStatus`（`aria-live="assertive"`）会念出撤销 / 重做 / 移动 / 缩进 / 评论 / 打开文档等状态变化。
* **键盘拖拽**：聚焦块把手 → `空格` 拾起 → `↑`/`↓` 移动 → `空格` 放下 / `Esc` 取消，每一步都有播报。
  为了让键盘用户够得着，块工具条改成"常驻布局、视觉淡出"（`opacity: 0` + `:hover`/`:focus-within` 显形），
  不再是 `display: none`。
* `:focus-visible` 焦点环、skip link、模态 `role="dialog"`、`prefers-reduced-motion`。

### 快捷键自定义

命令面板 →「快捷键一览」→「自定义快捷键…」，点「改」再按新组合键即可；存在 `localStorage.ws:keymap`，
只保存改过的项，可一键恢复默认。默认键位：`⌘K` 面板、`⌘Z`/`⇧⌘Z` 撤销重做、`⌘/` 快捷键一览、
`⌘B` 侧栏、`⌥⌘T` 找回刚关的标签、`⌥⌘H` 版本历史、`⌥⌘S` 建议。

### 移动端

* **底部导航**（<640px）：世界 / 搜索 / 新建 / 建议 / 我的，顶栏只剩图标时也有大按钮可按。
* **PWA**：`manifest.webmanifest` + `theme-color`，可以"添加到主屏幕"独立打开。
* **手势**：屏幕左缘右滑拉出侧栏；长按文档行 / 区块 = 右键菜单（触屏没有右键）。
* **安全区**：`env(safe-area-inset-*)` 适配刘海屏与手势条；卡片 / 工具视图底部自动留出导航高度。

### 工具类文档（表格 / 看板 / 画布 / 词典 / 待办 / 骰子 / 雷达 / 环境音 / 语音 / 章节 / 嵌入）

除卡片、时间线、地图、关系树、图谱之外，这一轮补齐了 VVD 文档类型表里剩下的常用工具：

| 工具 | 干什么 | 后端 |
| --- | --- | --- |
| **表格** | 行 = 真卡片、列 = 该类型的属性；改单元格即改卡片（**双向绑定**），支持加/删行、列选择、**CSV 导入导出** | `GET/PUT /api/world/tables/<id>`、`/cell`、`/rows`、`/csv` |
| **看板** | 列 + 卡片，拖到别的列就算改状态；卡片可同时建成真卡片 | `documents/<id>/data` |
| **画布** | 自由摆放的便签：拖动移动、双击改字、删便签 | 同上 |
| **词典** | 造语词条：词形 / 读音 / 词性 / 释义 / 备注，可按词形或释义搜索 | 同上 |
| **待办清单** | 勾选、负责人、截止日期、搜索 | 同上 |
| **骰子** | 骰组（数量 × 面数 + 加值），`crypto.getRandomValues` 掷骰，保留最近 30 条记录 | 同上 |
| **雷达图** | 选几张卡片，把它们的数值属性画成雷达图对比 | 同上 |
| **环境音** | 用 WebAudio 实时合成分层环境音（雨 / 风 / 火 / 嗡鸣 / 人声），可调音量、可叠加 | 同上 |
| **语音 / 媒体库** | 浏览器直接录音（MediaRecorder）或上传文件，列表里回放 | `POST/DELETE documents/<id>/media` |
| **章节** | 按顺序的章节草稿，实时字数 | `documents/<id>/data` |
| **链接嵌入** | 外部资料（参考图 / 帖子 / 维基）挂成可点的清单 | 同上 |

所有工具共用一个数据入口 `GET/PUT /api/world/documents/<id>/data`（存在 `settings.data` 里，上限 400 KB），
文件走 `documents/<id>/media`（落 `MEDIA_ROOT/docs/<id>/`，元数据挂在 `settings.media`）。
新加一个工具只需要写前端一份 spec，后端不用动。

### 编辑能力（撤销 / 拖拽 / 评论 / 导入导出）

| 能力 | 怎么用 |
| --- | --- |
| **撤销 / 重做** | `⌘Z` / `⇧⌘Z`，或顶栏两个按钮；**右键撤销按钮**打开撤销历史（可跳到任意一步）。覆盖打字、拖拽排序、块菜单、属性、别名、评论 |
| **块拖拽排序** | 悬停区块 → 左侧把手按下拖动，落点有指示线；把手**点一下**打开块菜单（正文/标题/引用/提示框、上下插入、复制、隐藏、评论、删除） |
| **块评论** | 块工具条的评论图标（有计数徽章）→ 写评论（`⌘↵` 发送）/ 标记解决 / 删除 |
| **导入** | 顶栏「导入导出」：Markdown 单文件、多选、zip（Obsidian 目录会变成文件夹 + 卡片）、`world.json` 还原；`[[双链]]` 会接成卡片提及 |
| **导出** | 整个世界 zip（每份文档一个 Markdown + `world.json` 备份 + 媒体清单）、世界 JSON、当前文档 Markdown / JSON |
| **值得添加** | 顶栏「建议」：本地规则找出"提到了但还没卡片的名字""空壳卡片""没人引用的文档""没关联卡片的事件"，可一键建卡；跟随世界设置的 AI 开关 |
| **时间线列表视图 / 标记** | 经典编辑器工具栏的列表按钮打开可搜索清单（点行定位并选中），`⚑` 标记重点事件，旗帜按钮只看标记 |
| **快捷键** | `⌘/` 打开快捷键表；`⌘B` 收起侧栏、`⌘1…9` 切标签、`⌥⌘T` 找回刚关的标签 |

接口：`GET /api/world/export[?format=json]`、`GET /api/world/documents/<id>/export[?format=json]`、
`POST /api/world/import`（multipart 或 JSON）、`GET /api/world/suggestions`。

### 响应式 / 动效 / 空状态 / 无障碍

**断点**（`static/responsive.css`，`<html data-size>` 由 JS 标注）：

| 宽度 | 布局 |
| --- | --- |
| ≥1440 | 侧栏 280px、编辑区 940px，最宽松 |
| 1200–1439 | 侧栏 248px、顶栏右侧按钮收成图标 |
| 1024–1199 | 顶栏导航也收成图标（当前视图保留文字） |
| 900–1023 | 侧栏 216px、编辑区内边距收紧 |
| **<900** | 侧栏变**抽屉**（点背景关闭、打开文档自动收起）、**单栏**（只留一个面板、隐藏分割条）、页签横向滚动 |
| **<640** | 顶栏只剩图标（导航收进命令面板）、卡片封面竖排到标题下方、属性行改成"标签在上值在下"、弹窗变全屏、插入条贴底 |
| 触摸设备 | 所有按钮/行高 ≥36px（`@media (pointer: coarse)`） |
| 打印 | 隐藏界面壳，只留正文（导出 PDF 也更干净） |

实测六个尺寸（1920 / 1440 / 1280 / 1024 / 834 / 390）：**横向溢出 0px**，`tools/responsive_probe.py` 每次都会验一遍。

**动效**：统一 token（入场 200ms、退场 140ms、大面片 320ms、`cubic-bezier(.22,1,.36,1)`）；
浮层淡入上浮、文档切换轻微上浮、列表行错峰入场、按钮按下 0.975 缩放；
系统开启「减少动效」时全部关闭（`prefers-reduced-motion`）。

**空状态与引导**：空工作区是一张带图标的卡片 + 四个入口（用模板新建 / 新建卡片 / 新建时间线 / 导入 Markdown）；
文件夹、回收站、撤销历史、侧栏搜索都有对应的空状态与"下一步"；
**引导模板**（`角色 / 地点 / 事件`）问几个问题直接铺成区块结构——对齐 VVD 的 guided templates。

**无障碍**：`:focus-visible` 焦点环、跳转正文的 skip link、模态 `role="dialog" aria-modal`、
提示 `role="status" aria-live`、图标按钮都有 `aria-label`、侧栏按钮有 `aria-expanded`。

**危险操作**：所有删除按钮统一红色（`is-danger` / `data-danger="1"`），悬停有淡红底——
块菜单里的「删除这一块」、回收站的「彻底删除」、类型管理器的「删除类型」、树/地图/事件的删除都算。

### 控件与颜色

* **一套按钮系统**：文字按钮一律药丸（`height 30`、`padding 0 12`、`white-space: nowrap`），
  纯图标按钮是 30×30 圆角方块；徽章 24px 高。控件高度用 `--mn-h / --mn-h-sm / --mn-h-lg` 统一，
  不再出现"圆形按钮里塞文字把「显示」「删除」折成两行"这类错位。
* **颜色只用在有意义的地方**（主色仍是灰阶）：
  | 颜色 | 含义 |
  | --- | --- |
  | 强调蓝 `--mn-accent` | 链接 / 提及 / 当前文档 / 当前页签 / 主按钮 / 焦点环 |
  | 绿 `--mn-success` | 已发布 |
  | 琥珀 `--mn-warning` | 有改动未发布 |
  | 红 `--mn-danger` | 删除等不可逆操作 |
  | 类型自带色 | 卡片类型徽章（淡底 + 实色文字 + 圆点）、侧栏对应图标 |
* **圆角矩形铺满**：侧栏是一列圆角块（当前项整块染色），编辑区是一张圆角卡片
  （外层 16px + 细边框，属性表圆角容器，区块圆角块，插入条浮起药丸组）。

### 富文本与 `/` 斜杠菜单

卡片正文是所见即所得的。选中文字会浮出**气泡工具栏**（两排，图标化）：

* **上排 = 动作**：`创建卡片`（拿选中的文字新建一张卡片，并把选区变成指向它的链接）、
  `链接卡片`（用可搜索的选择器把选区链到已有卡片；写法不同会自动记成别名）；
* **下排 = 格式**：`A▾ 段落样式`（正文 / 标题 1-3 / 引用）、`B I U S`、`引用`、`链接`（再点一次取消）、
  `≡▾ 列表`（无序 / 有序）、`☰▾ 对齐`（左 / 中 / 右）、`A 文字颜色`、`◐ 高亮`、`👁 块在站点显示/隐藏`；
* 输入 `/` 拉起区块菜单，输入 `@` 关联卡片，⌘B / ⌘I / ⌘U 也可以。

* 区块存 `html`（过白名单）并派生一份纯文本 `text`：搜索、字数、名字自动识别都用纯文本，富文本区块不再被自动识别重写（否则会抹掉格式）。
* 白名单在 `world/sanitize.py`：只留排版标签，`script / style / iframe / svg` 连内容一起丢，`href` 只认 `http(s) / mailto / 相对路径`。
* 写入是**防抖自动保存**（700ms）+ 失焦保存；面板重渲染会把旧节点标记为 retired，
  落后的响应也不会覆盖新状态（`entry.saveSeq`），避免"保存把刚做的结构改动盖回去"。

### 回收站、文件夹与世界设置

| 入口 | 行为 |
| --- | --- |
| 顶栏「回收站」 | 列出软删除的文档，可**恢复**（父文件夹也被删则回到顶层）或**彻底删除** |
| 卡片选择器 | 可搜索的浮层（输入即搜、↑↓ 选择、↵ 打开），事件 / 地图 / 关系树 / 正文链接都用它 |
| 侧栏文件夹 | 打开后列出子项（可点开、右键菜单），并能在文件夹里直接新建卡片 / 子文件夹 |
| 左上角世界名牌 | 世界设置：名称、简介、题材、AI 开关、名字自动识别开关，另有跳到主题 / 分享的入口 |
| 地址栏 | 打开文档会写入 `#doc=<id>`，**浏览器前进 / 后退可用**，链接可分享 |

### 关系树（family tree）

* **多变体**：一份文档可以有多棵树（`TreeVariant`），新建时可选择**复制当前这棵**（成员与关系一起复制），
  对齐官方文案里的 "New variant (forks the current one)"。
* **五种起步模板**：家族 / 公司 / 军队 / 王室 / 空白——模板决定默认的**关系名**（父母 / 上级 / 战友 / 先王…），
  每个关系名都能单独覆盖（`edge_labels`），对齐 "rename its relationships"。
* **成员**（`TreeNode`）：世代 `generation` + 横向 `x` 决定位置，可拖动；支持**交汇点**（画成圆角）、
  **已故**（虚线 + 变暗）、**分组颜色**；成员可以没有卡片（纯占位），也可以**吸附一张卡片**，
  或者用「新建卡片」当场建一张并自动关联。
* **关系**（`TreeEdge`）：`parent / child / spouse / sibling / custom` 五种，可改自定义关系名与线型；
  关系线悬停显示关系名（也可切成"总是显示 / 隐藏"，对齐官方那三档切换）。
* 界面：变体标签、模板下拉、`＋ 成员`、选择 / 平移、缩放与**自动适应视野**（首次打开自动把整棵树居中）。

### 经典地图（Classic map）

* **底图**：可以**上传**（multipart，25 MB 上限，PNG/JPEG/WebP/GIF/AVIF，存到 `/media/maps/<doc_id>/`）
  或粘贴外链；媒体配置在 `settings.MEDIA_ROOT / MEDIA_URL`，开发态由 Django 直接提供。
* **三种标注**（`MapMarker`，对齐 mapTool 的 Pins / Zones / Text）：
  **图钉**（方块缩略图 + 名称胶囊，可关联卡片）、**区域**（百分比多边形 + 发光描边，可拖点重画）、
  **文字**（世界主题的衬线斜体，可缩放旋转）。
* **图层**（`MapLayer`）：每个标注挂在一层上，可整体显隐、调透明度、改名、增删。
* **交互**：工具条切工具后**在画布上点击即放置**；区域是「逐点点击 + 双击闭合」；
  右键菜单是 **在此放置图钉 / 从此开始画区域 / 在此添加文字 / 图层管理 / 设置底图**；
  选中标注后底部出现标注栏（改名、关联或打开卡片、改颜色、换图层、删除）。

### 世界图谱

连线有三个来源（`world/graph.py`）：**引用属性**（卡片 -> 卡片）、**时间线事件关联**（事件所在文档 -> 卡片）、
**正文提及**（走 `autolink`，虚线）。图谱不落库，只有"钉住哪些节点"存在图谱文档的 `settings.pins` 里。
工作区里的图谱工具支持：搜索（命中节点 + 一跳邻居）、隐藏孤立节点、显示/隐藏标签、节点大小与连线透明度、
拖动节点、双击以某节点为中心看邻域、`⌘/Ctrl + 点击`钉住节点。

### 体验自测脚本（tools/）

用 Playwright + 系统 Chrome 站在用户角度点一遍，收集控制台报错与失败请求：

```bash
.venv/bin/python manage.py runserver          # 另开一个终端
.venv/bin/python tools/ux_probe.py            # 全站乱点：每种文档、右键、⌘K、顶栏按钮
.venv/bin/python tools/ux_fixes_probe.py      # 回收站 / 文件夹 / 世界设置 / 底图比例
.venv/bin/python tools/timeline_embed_probe.py # 嵌入的经典编辑器：点、拖、滚轮、抽屉
.venv/bin/python tools/wysiwyg_probe.py       # 富文本：/ 菜单、格式条、是否真的落库
.venv/bin/python tools/editing_probe.py      # 拖拽排序 / 撤销重做 / 块菜单 / 块评论
.venv/bin/python tools/round7_probe.py       # 列表视图与标记 / 导入导出 / 建议 / 快捷键 / 撤销历史
.venv/bin/python tools/tools_probe.py        # 表格双向绑定 + 11 种工具类文档
.venv/bin/python tools/collab_probe.py       # 账号 / 邀请码 / 只读 / 在线状态 / 版本回滚
.venv/bin/python tools/calendar_era_probe.py # 日历视图（月相、事件）与纪元分支
.venv/bin/python tools/responsive_probe.py   # 六个屏幕尺寸：截图 + 横向溢出检查
.venv/bin/python tools/monkey_probe.py 25     # 猴子测试：每页随机乱点 N 次，统计报错与 5xx
```

### 管理命令

```bash
.venv/bin/python manage.py seed_demo          # 灌演示世界（The Grand Alchemy，可 --reset）
.venv/bin/python manage.py import_timeline    # 把 timeline 应用的数据迁进新模型
```

### 深链（截图 / 分享用）

```
/w#doc=<id>                        打开某份文档
/w#doc=<id>&doc2=<id>              并排打开第二块面板
/w#doc=<id>&panel=calendar         直接展开时间线的「日历设置」
/w#doc=<id>&panel=calendar&event=5 同时选中某个事件
```

上传的地图底图放在 `media/maps/<doc_id>/`（已在 .gitignore 里忽略）。

---

## 数据模型

`TimelineItem`（时间轴条目）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BigAutoField | 主键，数据库自增 |
| `kind` | CharField | `event`（事件）/ `era`（纪元） |
| `title` | CharField(120) | 名称 |
| `start` / `end` | FloatField | 起止时间（年，可为小数） |
| `desc` | TextField | 介绍 |
| `row` | PositiveIntegerField | 显示行 |
| `theme` | CharField | 仅纪元使用：`blue` / `violet` / `red` |
| `cover` | TextField | 封面（URL 或 data URL） |
| `cards` | JSONField | `[{"title","url","cover"}, ...]` |

`TimelineView`（单例，主键固定为 1）：保存 `start` / `end`，即用户最后浏览的范围。

---

## 常用命令

```bash
.venv/bin/python manage.py migrate                    # 建表 / 升级表结构
.venv/bin/python manage.py test                       # 跑测试（29 个）
.venv/bin/python manage.py runserver                  # 起服务
.venv/bin/python manage.py createsuperuser            # 建后台管理员
.venv/bin/python manage.py shell                      # 交互式 ORM 命令行

# 备份 / 还原（Django fixture 格式）
.venv/bin/python manage.py dumpdata timeline --indent 2 -o 备份.json
.venv/bin/python manage.py loaddata 备份.json

# 从「老格式」JSON 导入（必须给路径；同 id 覆盖，--replace 先清空条目表）
.venv/bin/python manage.py import_legacy_json 老的备份.json
.venv/bin/python manage.py import_legacy_json 老的备份.json --replace

# 正式部署时才需要
.venv/bin/python manage.py collectstatic              # 静态文件收集到 staticfiles/
```

`import_legacy_json` 认的是 Flask 版那种 `{"view": ..., "items": [...]}` 结构。
文件读不出来时它会直接报错退出，不会往库里写示例数据——示例数据只在「全新数据库 +
`migrate`」这一条路径上出现。

---

## 从 Flask 迁移过来的说明

`app.py` 已按约定删除，它的各部分搬到了：

| 原 app.py | 现在的位置 |
| --- | --- |
| `load_data()` / `save_data()`（data.json 读写） | 换成 ORM：`timeline/models.py` + SQLite |
| `_as_float` / `_as_int` / `_as_text` / `_as_cards` / `normalize` | `timeline/normalize.py`（逻辑未改） |
| 5 个路由 | `timeline/views.py` + `timeline/urls.py` |
| `errorhandler(404)` | `timeline/views.py:api_fallback` + `page_not_found` |
| `DEFAULT_DATA` | `timeline/legacy.py:DEFAULT_ITEMS` + `TimelineView` 默认值 |

数据是自动搬过来的：建库时数据迁移 `0002_import_legacy_data.py` 会读原 `data.json`，
按原 id 导入条目和视野（已核对：4 条记录逐字段一致）。**迁移完成后 `data.json` 已删除**，
现在数据只存在 `db.sqlite3` 里：

* 新库（没有 `db.sqlite3`）执行 `migrate` 时找不到旧文件，会写入 6 条示例数据
  （`新事件` / `新纪元`，与原 Flask 版 `_blank_data()` 的行为一致），视野回到 1500~1900。
* `db.sqlite3` 在 `.gitignore` 里，**不受版本控制**——请自行定期备份。整个文件复制一份是最省事的做法，
  也可以导出成 JSON 存档（Django 原生格式，用 `loaddata` 导回）：

  ```bash
  .venv/bin/python manage.py dumpdata timeline --indent 2 -o 备份.json   # 导出
  .venv/bin/python manage.py loaddata 备份.json                          # 导回
  ```

  `loaddata` 的 JSON 和 `import_legacy_json` 用的不是同一种格式：前者是 Django 的
  fixture（模型列表），后者认的是 Flask 版 `{"view": ..., "items": [...]}` 那种结构。

### 已知的行为差异

迁移时做了差分测试（同一串请求分别打到 Flask 原版和 Django 版，逐字段比对，
51 项一致），差异只有下面这些：

1. **id 不再回收**：Flask 用「当前最大 id + 1」，删掉最大的那条后新条目会复用它的 id；
   Django 交给数据库自增，永不复用。好处是前端缓存的旧 id 不会突然指向别的记录。
2. **老记录会多出 `cover` / `cards` 空键**：Flask 的 `GET /api/timeline` 是把
   `data.json` 原样吐出来，早期记录没有这两个键；Django 从模型序列化，统一给出
   `""` 和 `[]`。前端的 `normalizeItem` 对「没这个键」和「空值」的处理完全一样，
   所以没有任何实际影响。
3. **请求体解析更宽松**：Flask 的 `get_json()` 要求 `Content-Type: application/json`，
   否则当空对象；Django 版直接解析 JSON 体（用 curl 手测更方便）。
4. **`/api` 这个路径**（不是任何接口）：Flask 回页面 + 404，Django 统一回 JSON 404，
   顺带避免了 Django `APPEND_SLASH` 对带请求体的 POST 抛 500。两边状态码都是 404。
5. **中文不再被转义**：Flask 3 里 `JSON_AS_ASCII = False` 已经失效，响应里的中文是
   `\uXXXX`；Django 版直接输出 UTF-8 中文（语义完全相同，肉眼更好读）。
6. **页面 HTML 末尾多一个换行**：Jinja 会吃掉模板末尾换行，Django 模板保留，其余逐字节一致。

安全上：接口是 `@csrf_exempt` 的（前端不带 CSRF token，且浏览器对跨站 JSON 请求会先发
CORS 预检、Django 不应答预检），`/admin/` 的会话表单仍受 CSRF 保护。

---

## 部署提示

`settings.py` 里已经支持用环境变量覆盖开发默认值：

```bash
export DJANGO_SECRET_KEY='换成随机长字符串'
export DJANGO_DEBUG=0
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python -m gunicorn worldbuilding_timeline.wsgi      # 需要先 pip install gunicorn
```

`DEBUG=0` 时静态文件交给 Nginx 之类的服务器托管，或用 WhiteNoise。
另外 `ALLOWED_HOSTS` 目前只放行了 `127.0.0.1 / localhost`，对外提供服务时要改。

---

## 复刻说明（2026-10-05）

前端按录屏《录屏2026-10-05 下午2.01.58.mov》里「The Grand Alchemy」的**时间线编辑区**
一比一复刻。量取方式：录屏是 2x Retina，CSS 像素 = 原始像素 ÷ 2，逐元素量尺寸与取色。

**量到的关键数值**（都是 CSS px）：

| 元素 | 数值 |
| --- | --- |
| 画布点阵 | 24 × 24 网格，点直径 2，`rgba(255,255,255,.22)`，相位 (12.5, 4) |
| 轴线 | 1px，`rgba(255,255,255,.27)`；主刻度 1×9，年份标签 11px `#8e8a83`（轴下 22） |
| 轴线位置 | 画布高度的 **50.1%**（录屏里正好居中） |
| 时间点圆点 | 直径 8，`#dbd8d6`，外一圈 1.5px 暗描边；选中时加光晕 |
| 标签胶囊 | 高 24、圆角 12、左右内边距 8、字号 10.6；底边距轴线 20.5；层级间距 30 |
| 纪元色带 | 高 26、圆角 10、行距 32（26 + 6）、首行距轴线 25.5 |
| 色带配色 | 文字＝主题色，边框＝主题色约 45%，底色＝不透明深色（会盖住点阵） |
| 底部工具条 | 245 × 48、圆角 14、按钮 34 × 34、分隔线 1 × 20；距底 15.5，水平居中 |
| 缩放控件 | 41 × 114，三个 41 × 38 按钮；距右 25.5、距底 71.5 |
| 帮助按钮 | 37 × 37 圆形；距右 17、距底 11.5 |
| 编辑卡片 | 360 × 321、圆角 27、底色 `#221c11`、无阴影；封面 100 × 100、标题 17px/600、描述 324 × 100、虚线按钮 324 × 34 |
| 卡片定位 | 水平居中于所选记录，底边在其顶边上方 10px |
| 日历设置面板 | 316 宽、圆角 16、底色 `#261f12`；居中于工具条日历按钮上方 10px |

**六种配色**（色板取鲜亮的那一支，色带用暗一档的）：

| key | 色板 / 封面色 | 色带文字 |
| --- | --- | --- |
| `blue` | `98,105,128` | 同左（灰蓝） |
| `sky` | `52,117,243` | 同左 |
| `violet` | `82,81,193` | 同左 |
| `red` | `236,58,58` | 同左 |
| `teal` | `26,176,121` | 同左 |
| `gold` | `224,148,36` | 同左 |

`sky` 与 `gold` 是照录屏补的（后端 `THEMES` 已同步）。

**有意保留的差异**：

1. 背景：录屏背后是一张被压暗模糊的画，这里用几层 `radial-gradient` 近似，
   不是同一张图。
2. 编辑卡片里的**日期行**点了会弹年 / 月 / 日选择器（录屏没演到这一步）。
3. **配色入口**放在封面方块上（录屏里没演到改色的那一刻）。
4. 日历设置的「自定义」模式只做了主要的几行（时间线开始、零点前后、每天小时数、
   月份规格），没做完整的月份表编辑器。
5. 卡片定位只在会超出视口顶部时下压，录屏里没有这个兜底。

**验证方式**：用 headless Chromium 按录屏里画布的 CSS 尺寸（1042 × 749）截图，
与录屏同一帧裁出来的画布逐像素比对。轴线、刻度、胶囊、色带的坐标误差都在 1px 内，
色带边框 / 底色与录屏取样值一致（如灰蓝 `46,51,57` / `20,20,17`，鎏金 `112,68,3` / `38,24,3`）。

---

## 动效与体验（2026-10-05 第二轮）

这一轮做了两件事：**把界面动起来**，以及**站在用户角度把不顺手的地方改掉**。

### 动效层

`static/style.css` 末尾是独立的「动效层」，`static/script.js` 顶部是配套的
`showPanel / hidePanel / animateNodeIn / animateNodeOut` 四个助手。

两条纪律：

1. **只动 `transform` 和 `opacity`**，绝不给 `left / top / width` 加过渡 ——
   否则拖拽和缩放会变成「追着指针跑」。
2. **所有动画都收敛回静止态**，所以「静止态与录屏逐像素对齐」的结论不受影响
   （下面有回归验证数据）。

| 位置 | 动效 |
| --- | --- |
| 开屏 | 背景光晕与点阵淡入 → 轴线**从无到有画出来**（`stroke-dashoffset`）→ 刻度 / 年份 / 连接线错峰浮出 → 记录逐条弹入（每条 +55ms）→ 工具条 / 缩放 / 帮助从下方升起 |
| 数据加载 | 轴线位置上一道微光左右扫（`.boot-strip`） |
| 记录 | 新建时从 0.84 倍弹入；删除时缩小淡出后再摘节点；草稿落库是**节点过户**，不会闪 |
| 编辑卡片 | 从锚点往上长（`transform-origin: 50% 100%`），退场更快更轻；已经在屏幕上时换记录只挪位置、不重播 |
| 浮层 | 配色板 / 日期选择器 / 日历设置 / 多选条 / Toast 各有自己的进出方向与时长 |
| 缩放 | 按钮缩放与「适应内容」是 340ms 的补间，锚点按年、跨度按**对数**插值（缩放看起来才匀速） |
| 悬停 | 圆点涨 1.35 倍、胶囊微微上浮、色带浮起并加投影、手柄从 0.55 倍展开 |
| 选中 | 圆点与色带各有一圈 2.6 秒的呼吸光晕 |
| 背景 | 光晕 26 秒一轮极慢呼吸；点阵随平移做 0.16 倍视差（以载入视野为零点，静止态相位不变） |

**`prefers-reduced-motion: reduce` 全程尊重**：CSS 侧统一压掉动画，JS 侧
`reducedMotion()` 会跳过补间、开屏编排和进退场（直接落到位），不会留下「卡在
opacity:0」的元素。

### 这一轮修掉的毛病

都是先量出来、再改的：

1. **画布左上角一直挂着一个空壳**。`.pm-tip / .em-tip / .drag-tip` 这几条规则写了
   `display: flex`，作者样式永远盖过浏览器默认的 `[hidden] { display: none }`，
   于是 `#dragTip` 以 22×26 的空盒子常年贴在左上角。已在基础样式里补
   `[hidden] { display: none !important }` 统一兜住。
2. **纪元的缩放手柄几乎抓不到**。`.era` 上有 `overflow: hidden`（为了裁标题），
   而手柄是 `left: -5px`，被裁得只剩 2px。改成 `overflow: visible`、裁切交给
   `.era-title`，手柄加宽到 8px 并骑在边上。
3. **悬停轴线的提示会盖住旁边事件的名字**。提示条固定在轴上方 44px，正好压在
   第一层胶囊上。现在会先算出与它横向重叠的胶囊，抬到它们上面去。
4. **编辑卡片上的日期显示的是模板占位文案**（`Month 5, Year −8`）。
   `openEditor()` 里 `syncEditor()` 排在 `hidden = false` 之前，而 `syncEditor()`
   开头有「卡片没开就返回」的护栏，于是日期永远不更新。
5. **点别处关卡片时，最后那几个字其实没落库**。`closeEditor()` 先把
   `state.editing` 清成 `null`，紧接着调用的 `commitEditor()` 立刻 `return` 了。
   全靠 500ms 防抖和 blur 兜着才没出事，现在把顺序倒过来了。
6. **窄色带的标题每帧闪一次**。原来的判断是「放不下就 `display: none`」，
   而隐藏之后 `scrollWidth` 变 0，下一次 render 又判定「放得下」把它显示回来 ——
   死循环。现在交给 CSS：窄带缩内边距并直接裁切。
7. **列表 / 标记两颗按钮会切进一个不存在的模式**（按钮亮着、行为没变）。
   现在老实说明「还没做」，并保持当前工具不动。
8. **轴线下方那半屏不能拖画面**：以前在下面按下就立刻新建纪元。
   现在改成「按下先不落子」：拖出去就是平移，原地松开才算点一下新建。
   轴线附近同理。
9. **补间动画可能空转**。进度原来用 rAF 给的时间戳算，在没有显示的 headless /
   掉帧标签页里帧时间戳会原地不动，`k` 永远小于 1，于是一直 `render()`。
   改成用挂钟（`Date.now()`）算，另加 240 帧的兜底。

### 这一轮补上的体验

* **操作指南面板**（右下角 `?`）：以前点帮助只弹一句 Toast，等于没有。
  现在是一份三段的完整说明（鼠标触控板 / 键盘 / 编辑卡片），带遮罩、可 Esc 关闭。
* **撤销**：删除和复制会进撤销栈（最多 20 步），`⌘/Ctrl+Z` 或 Toast 上的
  「撤销」都能找回来；破坏性操作因此不需要再弹确认框。栈里只放**不可逆**的那两类，
  改标题、拖位置不进栈。
* **保存状态点**：编辑卡片没有保存按钮，以前完全看不出有没有存上。
  左下角现在会浮一个「保存中 → 已保存」，失败变红并停留 4 秒。
* **空状态**：一条记录都没有时，轴线上方给出说明和两个按钮（新建时间点 / 新建时间段），
  按钮就在视野正中落点；把最后一条删掉之后它会自己回来。
* **加载与失败**：加载时轴线上走一道微光；接口挂了会给「重新加载」而不是一片黑。
* **首次引导**：第一次打开时在工具条上方浮一条提示，说明「轴线 / 轴线下方」两处入口，
  点「知道了」或开始操作后就不再出现（`localStorage`）。
* **悬停详情卡**（用了原本闲置的 `.hint-card`）：在写了描述的记录上停 0.48 秒，
  浮出起止时间 + 标题 + 描述前 120 字。没写描述的不浮，免得和轴上的标签重复。
* **悬停提示条**：工具条 / 缩放 / 帮助按钮改用自绘的 `data-tip` 提示（原生
  `title` 要等一秒还不能改样式）。
* **Esc 中断拖拽**：拖到一半反悔，撤回原位，一条都不落库。
* **光标与焦点**：`:focus-visible` 有可见描边；缩放 / 工具 / 选择按钮都有按下反馈。

### 回归验证

改完重跑同一套截图比对（headless Chromium，1042 × 749，冻结所有动画后与改动前的
基线逐像素 diff）：

* 差异像素 **2442 / 780458（0.31%）**，且全部有解释：
  * 2341 px ＝ 左上角那个空壳被拿掉（第 1 条）
  * 70 px ＝ 选中的工具按钮图标改成亮白（有意的）
  * 24 px ＝ 去掉 `overflow: hidden` 之后色带圆角的抗锯齿差 1 个色阶
* 交互回归：拖拽平移（轴线上 / 轴线下方都试）、原地点击新建、右键框选、
  删除 + 撤销恢复、`Esc` 中断拖拽、`?` 指南、`V`/`H`/`F` 快捷键、
  `prefers-reduced-motion` 下静态渲染与常态一致（27 px / 色阶 1）。
