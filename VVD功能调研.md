# VVD（vvd.world）功能调研文档

> **调研对象**：<https://vvd.world>（应用入口 <https://app.vvd.world>），目标页面 <https://vvd.world/worlds/827442/editor>
> **调研时间**：2026-10-06
> **调研目的**：为「世界观共建 · 时间轴」项目的复刻工作建立一份可比对的功能清单
> **一句话结论**：VVD 不是「一个时间轴工具」，而是**一个以「卡片 + 世界」为数据内核、以二十种「工具文档」为外延、以「可发布的 Wiki」为出口的一体化世界观工作台**；时间轴、地图、关系树只是其中三种工具。

---

## 摘要（先看这 9 条）

1. **VVD 不是"一个时间轴工具"**，而是"卡片数据内核 + 20 种工具文档 + 可发布 Wiki + 写作出版 + 协作/社区/变现"的一体化平台；时间轴只是其中一件工具（2026-06 才全量发布）。
2. **编辑器要登录**，所以本文的证据来自四条公开旁路：官方 changelog 的结构化数据（**50 次更新 / 334 条功能 / 254 条修复**）、两套官方 UI 文案包（含**公开的中文包** `app.vvd.world/locales/zh.json`）、**35 个公开工具页的采用量数据**、官方演示视频截帧（存于 `docs/vvd-shots/`）。
3. **数据模型的核心是 Card / Type / Property**：类型可嵌套、可继承、可定义默认属性与默认区块结构，属性支持文本/单选/多选/数字/日期/**引用其他卡**/**公式计算**，改类型还能选择回填历史卡。文档挂在「世界 → 纪元 → 项目」之下，**文件夹不计入计费**。
4. **工作区形态**是它的手感来源：多 Tab + 每个 Tab 内并排可拖拽面板、左侧文档树（图标/颜色/置顶/隐藏于 Wiki/按纪元）、`⌘K` 全局搜索、区块四向插入、块级站点可见性、正文里**自动识别名字并互链**。
5. **采用量数据**（工具页 "Worlds"）：Cards / Timeline / Maps / Relation tree / Canvas / Notes = **52k**；新地图引擎（Map Maker）3.4k 但版本号最高（0.1.50）；**社区作者工具已过半**（Daggerheart、CoC、5e、Heraldry…）。
6. **发布侧很重**：`<address>.vvd.world` 子域名站点、可选模板（Overworld / Terminal / **Shell** 终端式）、22 套配色、地图视差层、Pin 环境音、**Pro 分析（含阅读深度与粉丝归因）**、读者四层（访客/关注者/支持者/会员）、商店与会员（**平台抽成 10%**）以及读者售后 Inbox。
7. **平台与栈**：明确**不做手机版**（只有平板/桌面横屏编辑）；19 种语言；客户端是 **Tauri**；前端 Next.js App Router，后端 **Supabase**，协作 **Yjs + TipTap**，画布 **tldraw**。
8. **登录后实测补充（第 16 节）**：拿到了世界主题的真实字段（`headingFont: EB Garamond`、`bodyFont: DM Sans`、`primaryColor: #3f3416`、`grain: 22`、`mode: dark`）、`documents` 表的真实字段（含 `era_ids`、`forked_from_id`、`reveal_condition` 等）与**官方中文文案包**；你的世界短链是 `/worlds/a045ca`（原来的 `827442` 不是你的世界）。
9. **对复刻的启示**：先把「卡片 + 类型 + 属性」抽象出来，并给时间轴补上**日历设置 / 事件精度 / 卡片联动**这三层；随后做面板与提及；地图（尤其 Map Maker）放到最后。

---

## 目录

- [0. 文档说明：这份结论是怎么来的](#0-文档说明这份结论是怎么来的)
- [1. 产品概览](#1-产品概览)（定位 / 平台 / 定价与限额）
- [2. 信息架构：一个「世界」是怎么被组织的](#2-信息架构一个世界是怎么被组织的)
- [3. 数据模型：卡片、类型与属性](#3-数据模型卡片类型与属性)
- [4. 编辑器：卡片怎么写](#4-编辑器卡片怎么写)（区块 / 提及与自动识别 / 协作评论）
- [5. 工具清单：二十种「文档类型」](#5-工具清单二十种文档类型)
- [6. 重点工具详解](#6-重点工具详解)（**Timeline** / Map Maker / 关系树与图谱 / 跑团套件）
- [7. Wiki / 发布：把世界变成可读的站点](#7-wiki--发布把世界变成可读的站点)
- [8. 导入、导出与互操作](#8-导入导出与互操作)
- [9. 扩展性与开发者能力](#9-扩展性与开发者能力)（Workshop / API / MCP）
- [10. 发布节奏与产品重心](#10-发布节奏与产品重心基于-50-次更新的量化)
- [11. 上手、养成与留存设计](#11-上手养成与留存设计)
- [12. 视觉与交互语言（复刻参考）](#12-视觉与交互语言复刻参考)
- [13. 对复刻工作的启示（建议优先级）](#13-对复刻工作的启示建议优先级)（含 [13.1 落地记录](#131-落地记录2026-10-06)）
- [14. 外部视角：第三方评价、社区与官方中文渠道](#14-外部视角第三方评价社区与官方中文渠道)
- [15. 证据局限与后续可做的事](#15-证据局限与后续可做的事)
- [16. 登录后实测补充（世界配置 / 数据模型 / 官方中文用词）](#16-登录后实测补充2026-10-06-追加)
- [附录 A：关键术语对照表](#附录-a关键术语对照表) ｜ [附录 B：原始素材清单](#附录-b本文引用的原始素材清单)

---

## 0. 文档说明：这份结论是怎么来的

### 0.1 一个必须先说明的限制（以及后续的突破）

目标 URL（`/worlds/827442/editor`）**需要登录**。未登录访问会被 302 到 `/login`（实测：`https://vvd.world/worlds/827442/editor` → `https://vvd.world/login`，HTTP 200，页面字节数与登录页完全一致）。

因此**本文的主体证据不来自登录后的点击操作**，而来自下面四条公开但信息量极大的旁路，并用「多源交叉 + 逐条标注出处」的方式保证可信度。

> **后续补充（见第 16 节）**：你完成登录后，我借本机 vvd 桌面端的会话只读地取到了编辑器路由 HTML、**155 个编辑器 chunk**、世界配置字段、`documents` 表结构与**官方中文文案包**。但编辑器界面是纯客户端渲染，所以"实际按钮布局"仍需打开应用观察；本文凡未实测之处均已标注。

### 0.2 证据来源与可信度分级

| 级别 | 来源 | 拿到了什么 | 说明 |
| --- | --- | --- | --- |
| **A（官方、结构化）** | `https://vvd.world/whats-new` 页面内嵌的 changelog JSON | **50 次版本更新（2025-10-03 → 2026-10-01）、334 条功能条目、254 条修复条目**，每条都带 `area` 官方分类 | 页面 HTML 里的 RSC payload 直接包含结构化数据，已提取为 `changelog.json` |
| **A（官方、结构化）** | `https://vvd.world/i18n/en.<hash>.json`（712 KB） | **一套完整的 UI 文案表：138 个命名空间、约 1.7 万条字符串**。工具名、按钮名、空状态、错误提示、限额提示全在里面 | 这是「产品把功能叫什么、有哪些按钮」的最硬证据；含 `atlasTool`（Map Maker）、`path`、`shell`、`studio`、`shop`、`inbox` 等**新版**命名空间 |
| **A（官方、结构化）** | `https://app.vvd.world/locales/zh.json`（287 KB，**中文**，另有 18 种语言） | 应用运行版文案包：**51 个命名空间、5864 条中文**，含 `editor.ai`（AI 助手）、`shortcuts`（快捷键表）、`campaigns`、`cmdK`、`documents`、`entityTypes` 等 | 登录墙**没有**挡住文案；这是唯一一份官方中文 UI 词汇表，对复刻命名极有用 |
| **A（官方、结构化）** | `https://vvd.world/sitemap.xml`（44 条）+ 35 个 `/t/<slug>` 工具页 | **公开工具市场**：每个工具的官方 tagline、**采用量（Worlds）**、点赞、版本、作者 | 见 9.1，是判断"哪些工具是主力"的最硬数据 |
| **A（官方、结构化）** | `https://vvd.world/i18n/zh.<hash>.json`（737 KB，**登录后**） | **新版应用的官方中文文案包：142 个命名空间、17536 条中文**（比英文版多 `emailAlerts` / `exclusive` / `newsletter` / `payments` 四个命名空间） | 与英文包内容对应，是复刻时"官方中文用词"的唯一权威来源 |
| **A（实测、登录后）** | 用本机 vvd 桌面端的会话，只读抓取 `https://vvd.world/worlds/a045ca/editor` | 编辑器路由真实 HTML（262 KB）+ **155 个编辑器专属 chunk（13 MB，已下载）**；世界级配置字段；`documents` 表结构 | 详见新增的第 16 节；凭据只存在 `/tmp`，未写入仓库 |
| **B（官方、视觉）** | 官网 CDN 上的产品演示视频与图片：`organize.mp4`、`map.mp4`、`collab1.mp4`、`wikilanding.webm` 等 | 真实界面截图（本文已截帧存档到 `docs/vvd-shots/`） | 只覆盖营销片里演示到的部分 |
| **B（官方、市场）** | `/pricing`、`/worldbuilding-tools`、`/compare/*`、app 首页、`/whats-new` 正文 | 定价与限额、平台、竞品对比口径 | 营销口径，需打折看 |
| **C（第三方）** | 目录站、评测、社区讨论、视频 | 用户口碑与外部视角 | 见 `web_research.md`，单独标注 |
| **D（我方推断）** | 由以上证据推出的结论 | 架构与设计意图的猜测 | 文中凡是推断都写明「推断」 |

> ⚠️ **两套字典的关系**（重要，影响结论归属）：`vvd.world` 的 138 命名空间字典带有 Map Maker（`atlasTool`）、`path`、`shell`、`studio`、`shop`、`inbox` 等**新版功能**；`app.vvd.world` 的 51 命名空间字典带有 `campaigns`（含 `openLegacy`）与 `editor.ai`。前者对应**新版 vvd**，后者对应**仍在运行的旧版应用**。两者不一致处，本文以"当前官网/新版"为准并注明。

> 完整的原始素材：`.vvd_research/`（页面快照、changelog.json、i18n_en.json、locales_zh.json、tools/、演示视频与截帧）
> 分工整理稿：`.vvd_research/notes/features_changelog.md`（changelog 全量梳理）、`.vvd_research/notes/features_i18n.md`（i18n 全量梳理）、`.vvd_research/notes/web_research.md`（第三方来源）、`.vvd_research/notes/app_tech.md`（技术栈与路由探测）

### 0.3 三个「不要误解」

1. **它不只是时间轴**。时间轴（Timeline）在 2026-06-14 才全量发布，是新功能之一，而不是产品核心。产品核心是**卡片（Card）→ 类型（Type）→ 属性（Property）**这套数据模型。
2. **「Boards」和「Canvas」是同一样东西的两种叫法**。changelog 正文叫 Canvas，修复清单的分类前缀叫 Boards（见 0.2 的 A 类证据；2026-03-21 Canvas 全面重写）。
3. **它的野心包含「出版 + 变现」**。Quill 能出 EPUB/PDF/DOCX、能开订阅、能卖会员与商品，还有给创作者处理读者售后的 Inbox（退款、物流、会员）。这部分远超世界观工具的一般范畴。

---

## 1. 产品概览

### 1.1 定位与口号（官方原文）

| 位置 | 原文 |
| --- | --- |
| 首页 title | "vvd — Worldbuilding Platform for Maps, Wikis & Lore" |
| app 首页 hero | "Create, organize, and share your worlds with tools that work as smoothly as imagination."（`landing.hero.description`） |
| app 首页（中文 locale） | "想象力有多快，工具就有多快。用 VVD，创建、管理并分享你的世界。" |
| 中文首页四大卖点 | 整理您的世界 / 互动地图 / 关系图谱 / 活百科 / 实时协作 |
| 竞品页自我定位 | "Our pick for connected, visual worldbuilding. An extensible workspace for your whole world" |

### 1.2 规模与平台

| 项 | 值 | 出处 |
| --- | --- | --- |
| 用户量 | "超过 200,000 位创作者"（中文 app 首页）/ "250,000+ creators"（`/worldbuilding-tools`）/ "over 100k+ writers"（`path.welcome`） | 三处口径不一致，**建议按「十万量级、对外宣称 20–25 万」理解** |
| 网页端 | Web 应用（Next.js + Turbopack 构建），主域名 `vvd.world` / `app.vvd.world` | HTML 与 chunk 清单 |
| 桌面端 | **macOS**（2026-01-31 "vvd comes to the Mac"，含 Intel）、**Windows**（2026-08-20 上线，之后迁到 vvd.world 并自更新；下载页文案曾显示 "almost here"） | changelog 与下载页 |
| 移动/平板 | iPad（2026-08-20 beta，TestFlight，支持 Apple Pencil 60fps 预测笔迹）、Android 平板（含 APK）、"vvd on Google Play"（2026-09-20） | changelog |
| 手机 | **明确不做手机版**：只有横屏/平板布局，i18n 里有专门的 `phoneWarning` 命名空间，标题直译是 "vvd wasn't built for phones" | i18n |
| 客户端技术 | **Tauri** 外壳（页面注入脚本检测 `__TAURI__` / `__TAURI_INTERNALS__`，cookie 写 `vvd_native_shell` = ios / android / desktop），组件名有 `WindowsControlsSlot`、`WindowsResizeEdges`，深链协议 `vvd://` | HTML/JS 探测 |
| 老版本 | 旧版应用曾迁到 `legacy.vvd.world`（旧 Campaigns 与 Quill 一度留在那边）；新版文案里仍有 `openLegacy` 入口 | changelog 2026-01-10 |
| 语言 | changelog 称 2026-01 有 8 种、2026-02 累计 **18 种**；实测 `app.vvd.world/locales/<code>.json` 有 **19 个语言码可公开直链**（en/zh/ja/ko/fr/de/es/pt/pt-PT/it/nl/pl/ru/tr/sv/cs/th/id/hi）；另有支付宝/微信支付与中文应用内浏览器适配 | changelog + 实测 |

### 1.3 定价与限额（`/pricing` 原文核对）

| | Free | Hobbyist | Pro（最热门） | Studio |
| --- | --- | --- | --- | --- |
| 月付 | $0 forever | **$5.75/mo** | **$10.75/mo** | **$29.17/mo** |
| 年付 | — | $69（2 个月免费） | $129 | $350 |
| 世界数 | 1 | 2 | 无限 | 无限 |
| 文档数 | 20 | 无限 | 无限 | 无限 |
| 存储/媒体 | 100 MB | 1 GB | 无限（fair use；i18n 提到 Pro 含 10 GB 媒体） | 无限 |
| Quill 故事 | 1 个故事 / 每故事 1 章 | 3 个故事 / 章节无限 | 无限 | 无限 |
| 工具 | Basic tools | Full tools access | 同左 | 同左 |
| 发布 | — | 私有分享链接、仅邀请发布 | 公开出版、密码保护、**自定义域名** | 同左 |
| 协作 | — | — | **3 名协作者** | 5 名，超出 $5.83/mo/人；角色与权限、Admin 面板与离职移交、世界归工作室所有 |
| 其他 | | | **API** | 同上 |

补充口径（来自 i18n 与 FAQ）：

- **"什么算一个文档"**："Anything a tool makes — a card, a map, a timeline, a page. **Folders don't count.**"（文件夹不计数）
- 免费档可以**试用** Workshop 工具，但"what a tool makes just isn't saved"（做出来的东西不保存）。
- 订阅可暂停：暂停后仍能**查看与分享**已有内容。
- 降级不删内容，只会限制新建。
- 有 Fellowship 资助计划：最高 **$5,000 grant**，不要股权。

**付费矩阵里还有这些容易被忽略的维度**（`pricing.matrix.rows`，共 23 行）：

| 维度 | 说明 |
| --- | --- |
| **AI requests per month** | AI 请求按**月度配额**计（见 4.5） |
| Campaigns / Campaign sessions | 跑团战役与场次数量受套餐限制 |
| **Eras & translations** | **纪元与翻译**并列在同一行 → 暗示"翻译"也是按量计费的资源 |
| Discoverable in vvd | 是否可被平台内发现（曝光位） |
| **Monetization（10% fee）** | 创作者变现抽成 **10%** |
| Workshop 权限 | Free = "Run, can't save"；付费 = "Browse & run"；Pro/Studio = "**Author & sell**"（可发布并售卖工具） |
| Who owns the worlds | 个人拥有 vs **工作室拥有** |
| Invoice · PO · net terms | Studio/企业向：发票、采购单、账期 |
| chapters per Quill story | 每故事章节数 |

### 1.4 技术栈观察（HTTP 头与资源清单实测）

| 项 | 观察 | 证据 |
| --- | --- | --- |
| 前端框架 | **Next.js App Router + Turbopack**（buildId `ByR1PU19gN6hJ5qaBRTqv`；chunk 名为内容哈希） | `x-powered-by: Next.js`；chunk 引用 |
| 部署 | `app.vvd.world` = **Cloudflare + OpenNext**（`x-opennext: 1`、`cf-placement`、`x-country`、`x-locale`）；`vvd.world` = **Cloudflare + Railway** 源站（`x-railway-edge: sjc1`） | 响应头 |
| 后端 | **Supabase** 项目 `mqqkdoceshptklrajtji.supabase.co`（auth / rest / storage / realtime / functions 全套） | chunk 内 URL |
| 实时协作 | **Yjs**（`[yjs-document]`、`PluginKey("y-sync")`）+ **TipTap** 富文本 | chunk 内字符串 |
| 画布 | **tldraw** | chunk 内标识 |
| 静态与媒体域 | `cdn.marketing.vvd.sh`（官网素材）、`mediacontent.vvd.world`（公告与世界媒体）、`publicassets.vvd.sh`（静态视频） | 页面资源 URL |
| API | `api.vvd.world`；`GET /api/health` 返回 `{"status":"ok","stripe":"live","commit":"738a1610…"}` → **支付走 Stripe**，部署带 commit 校验 | 实测 |
| 客户端外壳 | **Tauri**（`__TAURI__`、`core.invoke("plugin:shell｜open")`、`event.listen("deep-link")`；深链 `vvd://`；安装包名 `vvd_0.1.1_aarch64.dmg`），cookie `vvd_native_shell` = ios / android / desktop | HTML 与 chunk |
| 登录方式 | Google / Apple / Discord / Email（+ 邮箱验证码） | 登录页与 i18n |
| 分析与其他三方 | **PostHog**（含 session recording 与 feature flags）、**Crisp** 在线客服 | chunk 内标识 |
| 国际化 | **19 种语言**的文案包可公开直链获取，例如 `https://app.vvd.world/locales/zh.json`（287 KB / 51 命名空间 / 5864 条中文）；营销站另有一套 138 命名空间的字典 `/i18n/en.<hash>.json` | 实测 200 |
| 实时协作端点 | **未确认**（只知道有 presence、协作光标、离线编辑与重连） | — |


---

## 2. 信息架构：一个「世界」是怎么被组织的

### 2.1 五层容器

```
Account（账号）
└── World（世界）                    ← 顶层，可发布成 Wiki / Site
    ├── Era（纪元）                  ← 世界的时间分层；类型与卡片跨纪元共享
    ├── Project / Workspace（项目）   ← "a workspace on a version of your world"，绑定某个纪元
    │   └── Document（文档）          ← 二十种「工具文档」之一；文档 = 计费单位
    │       └── Card（卡片）          ← 数据原子：类型 + 属性 + 区块正文
    └── Tab / Panel（标签页 / 面板）   ← 新版工作区形态：每 Tab 独立并排面板，可 pin
```

关键串证：

- `createProject.description`："A project is a workspace on a version of your world. Pick what it is, name it, and choose the era it works on."
- `worlds.projects.subtitle`："A project is a workspace on a version of your world — its own documents, living in an era."
- `types.manager.description`："Categories your cards belong to — **shared across every era of this world**."
- `editor.workspace.createTypes`：新建文档的六种快捷类型 = Card / Classic map / Note / Canvas / Timeline / Relation tree。

### 2.2 顶层导航

- 2025-10-11 "One navigation bar"：把 **Home、Editor、Wiki、Create、Quill** 合并到一条导航栏。
- 我实测截图里的顶栏形态（`docs/vvd-shots/01-编辑器卡片与分屏.png`）：左侧是当前世界名牌（"Lumia"），中间四个入口 **⌂（Home）/ 🌐 World / W（Wiki）/ 🪶（Quill）**（*图标到名称的对应是我根据 changelog 的"Home / editor / Wiki / Create / Quill"五入口推断的，未必精确*），右侧是 Feedback、收件箱、实时/广播图标、时钟与头像。
- 2026-08-20 "Meet the new vvd" 之后的世界内形态：**Tabs**（每个 Tab 独立并排面板、可 pin 到栏上、新建 Tab 就等于搜索）、世界首页（图谱背景 + 恢复上次 Tab + 最近文档）。

**命令面板（`cmdK`）的官方中文菜单**（来自 `app.vvd.world/locales/zh.json`，等于官方给这套导航的中文命名，复刻时可直接沿用）：

| 分类 | 官方中文 |
| --- | --- |
| 导航（navigation） | 首页 / 世界 / **世界编辑器** / 维基 / **羽毛笔**（Quill） |
| 动作（actions） | 设置 / **实体类型**（Types）/ 编辑主题 / 垃圾箱（Trash） |
| 文档分类（categories） | 卡片 / 地图 / 画布 / 图表 |
| 命令面板文案 | "输入命令或搜索..."、"未找到结果"、"亦称为：{alias}" |

### 2.4 路由结构（实测）

| 路由 | 说明 |
| --- | --- |
| `/worlds` | 世界列表 |
| `/worlds/<name>-<6位hex>` | 世界入口；**307 → `/worlds/<id>/home`**。slug 规则：名称转小写去音标、过滤非 `\w\s-`、截断 50 字符，空则 `untitled`，再接 `-` 与 6 位十六进制 id |
| `/worlds/<id>/home` | 世界首页（世界视图） |
| `/worlds/<id>/editor` | **世界编辑器主界面**（本次调研的目标页） |
| `/wiki/<name>-<id>` | 已发布站点的条目页；地图用 `/wiki/<mapId>` |
| `/cards/<name>-<id>` | 卡片直达链接 |
| `/tools/notifications` | 通知中心（`/tools` 本身重定向到 `/worlds`） |
| `/@<handle>` | 作者主页（`robots.txt` 明确 `Allow: /@`） |
| `/t/<slug>` | **公开工具页/工具市场**（见 9.1） |
| `/transparency` | AI 透明度说明页 |

> ⚠️ 坑：`*.vvd.world` 是泛解析 + 中间件改写，**未知路径也会被改写成 `/login`**，因此"返回 307 → /login"**不能**用来证明某个路径存在。


### 2.3 编排层（Campaign / Adventure 的三层内容模型）

i18n 的 `editor.panel.scopeMenu` 暴露了一套很成熟的「内容层级」设计，用于跑团（Campaign）与模组（Module）场景：

| 层 | 英文 | 含义 |
| --- | --- | --- |
| 正典 | `layer.canon` — "the world's" | 世界本身的版本 |
| 模组 | `layer.module` — "from the adventure" | 来自冒险模组的版本 |
| 覆写 | `layer.override` — "edited here" | 在本项目里改过的版本 |
| 扩展 | `layer.extend` — "made here" | 只在本项目里新增的内容 |

配套动作：`Edit here`（改的只是本地，世界版本不动）、`Hide here`（玩家看不到）、`Move to world`（用本地版替换世界版，历史版本保留）。这套「不改原稿也能按团改设定」的机制，是世界观工具里比较少见的。

---

## 3. 数据模型：卡片、类型与属性

### 3.1 卡片（Card）—— 数据原子

从截图（`docs/vvd-shots/01-编辑器卡片与分屏.png`）可直接读到一张卡片的构成：

1. **标题**（大号斜体衬线字，如 *Isarra Thornveil*）
2. **类型徽标**（带图标的 "Character" / "Location"）+ 右侧一个**眼睛图标**（可见性）
3. **属性区**：`Aliases: The Untreated ×`、`Role: Diplomat`、`Faction: The Balri Accords ×`，底部 `+ Add Property`
4. **封面/头像**（右侧方形立绘；列表里 `Virehold` 用的就是缩略图图标）
5. **区块正文**：`Overview`、`Early Life`、`The Discovery` 等小节，正文里出现的人名地名会被高亮成链接（截图里 `Calreth`、`Elnor` 是带下划线的链接样式）
6. **底部插入条**：`+ Text`、`+ Media`、`+ Map`、`+ Se Block`、`+ Se Character Sheet`（即「往这张卡里加区块/工具」）
7. 卡片顶部的**标签页条**（`○ W ×`）表示它是工作区里的一个可关闭 Tab；两张卡并排时就是**分屏**

### 3.2 类型系统（Types）—— 比一般工具重得多

| 能力 | 证据（i18n key） |
| --- | --- |
| 类型 / **子类型**（可拖拽排序、可嵌套） | `types.manager.addSubtype`、`dragType: Drag to reorder or nest`、`cannotMoveIntoDescendant` |
| 类型的**默认属性表**（新建该类型卡片时自动带出） | `types.properties.description`："Define the default content structure for new cards of this type" |
| 类型的**默认区块结构** | `types.template.description`："Define the block content structure for cards of this type" |
| 类型的**默认设置** | `types.settings.description: Default settings applied when creating new cards of this type` |
| 属性值类型 | Text / **Select** / Multi Select / Number / Date / **Reference（引用另一张卡）** / **Calculate（公式）** |
| 公式示例 | `formulaPlaceholder: @[Price] * @[Rarity]`；`formulaHint: Computed from this card's other properties.` |
| 属性可标必填、可设默认值、可拖拽排序 | `requiredLabel` / `defaultLabel` / `dragProperty` |
| 选项带**颜色**，且颜色是跨卡共享的 | `select.colors`、`select.custom`、`selectHintExtended`："A fixed list of options you pick from. Every card of this type is offered the same list, so a word you add while filling one in is there for the next card too." |
| 改类型会**影响已有卡片**，且会明确警告 | `typeChange.detach`："# {type} cards are attached to this property. Changing its type will detach them." |
| 类型可**隐藏于选择器**（旧卡保留） | `manager.hiddenSetting`、`hiddenBadge` |
| 改一次类型可**同步到所有卡片** | changelog 2026-01-31（"changes to a card type can flow to every card that uses it"） |

> 复刻视角：**「类型 = 一张可配置的表结构」是 VVD 与我们现有时间轴模型最大的差别**。我们的 `Event` / `Era` 是硬编码字段，它的是用户可定义的 schema，且能一键回填历史数据。

### 3.3 文档树（左侧栏）

截图 `docs/vvd-shots/02-左侧文档树.png` 与 `editor.sidebarTree` 文案共同还原出的能力：

- 树形结构：**文件夹 + 文档混排**，文件夹可折叠（截图里的 `People & Figures`、`Factions, Orders & Gr…`）
- 顶部**搜索框（⌘K）**+ `⋮` 菜单；搜索支持命中**正文片段**（changelog 2026-02 全文检索）
- 文件夹可设**图标与颜色**（`folderIcon`、`folderColor`）
- 文档项：重命名、复制、**Pin 置顶**、**设置所属纪元**（`setEra`）、**隐藏于 Wiki**（`hiddenFromWiki`）、置顶/归档/删除
- 多选与批量：`selectedCount`、`moveToFolder`、`groupInto…`（把多选内容**收进新文件夹**）、`deleteSelected`、批量恢复
- 排序/过滤：`filterAndSort`
- 拖拽：`dragToMove`（含「不能把文档拖进自己的子文件夹」校验）
- 空状态与限额：`noDocumentsYet`、`documentLimitReached`（"This world has reached its document limit. Move a document to Trash or upgrade your plan"）

---

## 4. 编辑器：卡片怎么写

### 4.1 区块（Blocks）体系

i18n 的 `editor.slash` 列出了全部块类型，分三组：

| 组 | 块 |
| --- | --- |
| **Basic blocks** | Text（段落）、Heading 1/2/3、Bullet list、Numbered list、Blockquote、**Quote（带署名）**、Divider、**Table（带表头行）**、**Toggle list（可折叠）** |
| **Card blocks** | **Note（可被回复的消息）**、**Question（提问，答案写在下面）**、**Info（事实/规则框，也会出现在 wiki 上）** |
| **Tools（Workshop）** | 从 vvd 工具库直接插入一个工具块（标 `Beta`），"Picking it adds {name} to this world" |

块的交互（`editor.blockControls`）：

- 拖拽排序（`dragToReorder`）
- **四向移动**：Move up / left / right / down（配合 2026-10-01 的 "Add a block where you want it"：右键块标题栏 → Add block → Above / Below / Left / Right）
- **对块评论**（`commentOnBlock`）
- **单独控制某块的站点可见性**（`showInSite` / `hideFromSite`）
- 显示/隐藏**块标题栏**（`showTitleBar`）
- 删除块

### 4.2 输入与链接：这是 VVD 的「手感」所在

| 机制 | 说明 | 证据 |
| --- | --- | --- |
| `/` 斜杠菜单 | 全体块类型 + 工具，2026-09-27 起**指向每一项时会实时预览效果** | `editor.slash`、changelog |
| `@` 提及 | 链接到任意卡片；`mention` 命名空间 | i18n |
| **名字自动识别** | 正文里写到已存在的名字会自动变成链接；可在侧栏过滤菜单**开关**；重新识别只重查改动过的文本 | changelog 2025-10-03 / 2025-10-19 |
| **选中文字 → Create as Card** | 边写边建卡；链接一个被识别的名字会把它**存成别名（alias）** | changelog 2026-01-18 / 2025-10-19 |
| 别名（Aliases） | 卡片的一等属性，截图里 `Aliases: The Untreated` | 截图 + i18n |
| 链接预览 | `linkPreview` 命名空间、wiki 上的 postcard 预览 | i18n / changelog |
| 格式条 | `formatBar`、`tableBar`（表格专用工具条） | i18n |
| 全局命令面板 | `⌘K`，2026-01-10 上线，2026-02 起能搜正文 | changelog |
| 撤销 | 全局 Undo/Redo（2026-01） | changelog |

### 4.3 属性编辑的细节

- 属性行支持直接输入、下拉选择、**实体选择器**（`selectEntity: Select entity...` / `openReference: Open {name}`）、无权限时显示 `unavailableReference: Unavailable card`
- Select 属性可**就地创建选项**（`select.hintCreate: Select an option or create one`），可改色、可拖拽排序
- 属性按类型定义继承：`properties.inherited: Inherited from {parent}`

### 4.4 评论、协作与权限

| 能力 | 证据 |
| --- | --- |
| 卡片 / 地图 / 画布 / 任意工具上**就地评论**，可 `@` 协作者通知 | changelog 2026-09-20（"Leave a comment on a card, map, canvas, or any tool and tag a collaborator"） |
| 右键评论可 Resolve / Delete；`comments` 命名空间 | i18n |
| **实时协作**：多光标、协作头像、presence | changelog 2026-01-10（协作光标）、`presence` |
| **协作广播 Tab**（一起看同一份内容） | changelog 2026-08-20 |
| 权限三档：admin / editor / viewer（i18n，推断） | `editor.permission`（"Your edit access to this document was restored/removed"） |
| 邀请：邮件邀请协作者；**可邀请尚未注册的人**（占位保留席位） | changelog 2026-10-01 |
| 分享面板三标签：**Share / Publish / Export** | `sharePanel.tabs` |
| 离线编辑 + 重连同步 | changelog 2026-09（本地留存 + 重连同步） |

> **分享面板的发布状态机**（很有参考价值）：每张卡片都有自己的发布状态 —— `Not published yet`（有地址但未发布）/ `Not live yet`（站点已发布但此卡是后加的，需 Republish）/ `Live`（与站点一致）/ `Edited since you published`（站点还是旧版）/ `Hidden from your site` / `Excluded from your site`（该类型整体不发布）。站点侧则用版本号：`Live · v{version} · published {when}` + `{count} cards have changed since v{version}`。

### 4.5 AI 能力（changelog 一次没提，但产品里确实是有的）

**这是一个必须纠正的常见误解**：50 次版本更新里**没有任何一条提到 AI**，但应用自己的文案表里有完整的 AI 功能与配额：

| 能力 | 原文 | 出处 |
| --- | --- | --- |
| 官方口径 | "AI helps restructure your content to fit a traditional wiki format, detects entities in your text to suggest new cards, and recommends folders when organizing content. **We never use AI to generate content for you.**" | `landing.faq.questions.ai.answer`（另有 `/transparency` AI 透明度页） |
| 编辑器内 AI 助手 | `askAi: 询问 AI`；支持 **提升写作 / 简化语言 / 修正拼写和语法 / 缩短 / 加长 / 缩写 / 表情符号化 / 完成句子 / 继续写作 / 总结 / 添加摘要 / 调整语气**，语气 30+ 种（学术、商务、随意、自信、创意、幽默…），**翻译** 15+ 种语言 | `editor.ai`（zh 文案表） |
| 实体识别 | "Automatically detect and suggest characters, locations, and other entities in your text"；世界设置里可开关（`Entity Detection`） | `worlds.settings.ai.*` |
| 类型预测 / 文件夹建议 | `typePredictionFailed`、`suggestionFailed`（AI 预测卡片类型、建议文件夹） | `ai.errors.*` |
| 配额与权限 | 按**账户月度请求数 / token 数**计费（"已使用 {count}/{limit} 次请求"）；可按世界禁用 AI；未登录不可用 | `ai.usage.*` / `pricing.matrix.rows.aiRequests`（"AI requests per month"） |
| 信任承诺 | `landing.trust.rights.noAiTraining` = "No AI training"（不用用户内容训练模型） | i18n |

> 复刻视角：**它的 AI 定位是"结构化助手"而不是"代写"**（自动识别实体建卡、把已有文本改造成 wiki 结构、推荐归档），这点比"AI 续写"更贴合世界观工具的真实痛点。

---

## 5. 工具清单：二十种「文档类型」

`editor.contextMenu.toolNames` 一字不差地列出了 20 种工具。下表把「官方名」与「我推断的实际作用」分开标注：

| # | 官方名（en） | 中文理解 | 确认到的能力要点 |
| --- | --- | --- | --- |
| 1 | **Card** | 卡片/词条 | 类型 + 属性 + 区块正文；世界观的基本单位 |
| 2 | **Classic map** (`map`) | 经典地图 | 上传底图 + Pin/Zone/Label/Layer；2026-10-01 起旧地图保留为 Classic map |
| 3 | **Board** (`board`) | 看板 | 列 + 卡片：Add column / Add card / **把侧栏卡片拖进列**（"Drop a card here"）/ 搜索卡片；战役里另有一个 GM 用的"战役面板"（可挂 Campaign / World / Media / Monsters / Spells / Conditions） |
| 4 | **Timeline** | 时间轴 | 自定义日历 + 纪元 + 事件 + 关联卡片（详见 6.1） |
| 5 | **Relation tree** (`family-tree-v2`) | 关系树 | 家族/公司/军队/王室/空白五种模板，可重命名关系、多变体（variant）、junction、卡片吸附 |
| 6 | **Canvas** (`canvas-v2`) | 无限画布 | 画笔/荧光笔/便签/形状/箭头/图片；可放卡片、地图、图谱；quick-create 四向连线、pile（堆叠）、画框、以图谱为背景 |
| 7 | **Note** (`notes`) | 轻量笔记 | 标题 + 封面图 + `/` 唤起标题/列表/图片；可插入世界媒体库的图/视频/音频；字号与对齐 |
| 8 | **Chapter** (`chapter`) | 章节 | 写作单元，可与 Quill 故事绑定 |
| 9 | **Soundscape** | 音效板 | 多**场景**，每场景有 Loop / One-shot 音轨条（Load / Swap / Fire / 强度），可 **Make this scene live**；嵌入卡片时显示开启层数 |
| 10 | **Animator** | 3D 模型动画 | 上传 **rigged .glb**（Blender/Mixamo 导出），多段动画剪辑轮播、循环、播放 |
| 11 | **Radar Chart** | 雷达图 | 由 N 个属性生成形状（"A shape made from {count} properties"），可存 preset |
| 12 | **Dictionary** | 词典 / 造语 | 多语言管理 + **字形（Script）映射** + **在正文中自动检测**：词条含发音、母语写法、词义、例句、词性、短语、派生词、词源、参见、多义词；可**粘贴整份词表**导入；可上传自有字体 |
| 13 | **Homebrewery** (`codex`) | 跑团排版书 | 双栏 book 排版：分页/栏断、read-aloud 框、Note box、Descriptive box、**Drop cap**、条纹表格、**Stat Block / Spell / Item block**、整页图；**从卡片字段映射**填表；导出 PDF、Letter/A4 页；有"页面溢出"提示 |
| 14 | **Table** | 卡片表格 | 卡片即行、列可自定义、**计算列 / 公式**（"Use one formula for every row"）、CSV 互通；**可生成对外 API endpoint 与 API key**（把表格当数据源给外部程序读） |
| 15 | **World Graph** (`graph`) | 世界图谱 | 可作为独立文档保存；搜索节点、隐藏孤立节点、节点大小/连线透明度、pin 节点、**以某节点为中心看邻域**、统计文档数与连接数 |
| 16 | **Map** (`atlas`) | 新地图引擎（Map Maker / Atlas） | 程序化绘制 + 地形/河流/道路/聚落 + 多镜头 + 贸易模拟（详见 6.2） |
| 17 | **Text** | 纯文本 | 独立文本 |
| 18 | **Media** | 媒体 | 世界级媒体库中的图片/音视频 |
| 19 | **To-do List** | 待办 | 勾选清单（"Nothing to do yet. Press + to add the first one."） |
| 20 | **Voice Memo** | 语音备忘 | 录音 + **自动转录**，并把世界里的名字链接进转录文本 |

另有几个**不在工具列表里但成体系**的模块：

| 模块 | 作用 | 证据要点 |
| --- | --- | --- |
| **Embed**（`embedTool`） | 卡片内的嵌入块：YouTube / Spotify / **Apple Music** / 任意网页（2026-09）；可拖底边改高度；能识别 GitHub 仓库（stars / forks） | `embedTool` |

| 模块 | 作用 | 证据要点 |
| --- | --- | --- |
| **Sheet**（`sheetTool`） | **卡片内嵌的电子表格式数据块**：多 sheet 标签（可改名/复制/删除/改色/隐藏）、导入 Excel/CSV/TSV（保留公式、格式与所有标签页，会汇报"Imported N sheets and M cells"与搁浅的特性）、导出 CSV/XLSX；**单元格级实时协作**（"X is editing this cell"、跟随某人视角、离线提示） | `sheetTool` |
| **Player Sheet**（`editor.playersheet`） | D&D 5e 角色卡：HP / AC / 先攻 / 速度 / 豁免 / 全部技能 / 熟练 / 攻击 / 装备 / 性格 / 外貌 / 背景 / **死亡豁免** | `editor.playersheet` |
| **Stat Block**（`editor.statblock`） | 5e 怪物数据块：AC、CR、熟练加值、豁免、技能、易伤/抗性/免疫、状态免疫、感官、语言、Traits / Actions / Bonus Actions / Reactions / **Legendary / Lair / Mythic Actions** | `editor.statblock` |
| **Dice / Compendium** | 骰子（含自然 20/1 反馈）与规则库（怪物 / 法术 / 状态），服务于跑团场景 | `dice` / `compendium` |
| **Eras**（`eras`） | 纪元的集中管理（名称、图标、描述） | `eras` |
| **Paths**（`path`） | 引导式上手路径：写作 / 跑团 / 世界观 / 游戏叙事 / 影视故事五条，逐步引导并给徽章；每条路径属于某个世界 | `path` / `adminPaths` |

### 5.1 会出现在 Wiki 上的文档类型

`wikiChrome.pages.docTypes` 列出了 9 种可在站点上拥有页面/区块的类型：
`Card`、`Map`、`Timeline`、`Family Tree`、`Canvas`、`Note`、`Table`、`Sheet`、`Soundboard`。
其余类型（如 Board、Dictionary、Graph）可以嵌在卡片里，但不单独出版。

---

## 6. 重点工具详解

### 6.1 Timeline（我们的复刻对象，证据最完整）

`timeline` 命名空间 + changelog 拼出的完整能力表：

**（1）日历系统 —— 完全自定义，不假设地球历**

| 设定 | 证据 |
| --- | --- |
| 日历可选 **Earth** 或 **Custom**（"Same data, different lens"） | `settings.earth` / `settings.custom` / `settings.calendarHint` |
| 时间线范围：Start / End、**Fit to data**（按数据自适应） | `settings.rangeTitle` / `fitToData` |
| 起点语义：**Open past**（开放式过去）、`Year 0`、"Before first era / Before zero / After zero" | `settings.openPast` / `yearZero` / `beforeFirstEra` |
| 每天小时数 | `settings.hoursPerDay` |
| 月份名可自定义（`Generic 12 × 30` 提供默认 12 月 30 天） | `settings.generic12x30` / `monthNamePlaceholder` |
| **纪元（Eras）**：每个纪元都从 year 0 起算、有名字/图标/描述/长度，可加图、可调**背景模糊** | `settings.eras`、`erasSummary: each starts at year 0`、`editor.ageAppearance`、`backgroundBlur` |
| **卫星（Moons）**：数量、名称、颜色、周期天数、Full on、显示策略（Every night / Quarters / Full only），日历视图里有月相 | `settings.moons*`、`calendar.moons.full`、`moonsShownFull` |
| **日历预设（Calendar presets）**：把自定义日历存起来，应用到本世界任意时间轴 | `presets.subtitle: Saved calendars you can apply to any timeline in this world` |
| 事件精度：**Year / Month / Day / Time** 四级 | `eventPrecision`、`precisionTime` |

**（2）两种视图**

- **Line view（线视图）**：横轴时间线，这正是我们 README 里逐像素复刻的那个界面（轴、刻度、圆点、标签胶囊、纪元色带、底部工具条、缩放控件）。
- **Calendar view（日历视图）**：月/日网格 + 月相 + `Go to a date`（按年/月/事件跳转）+ 缩放粒度（Days / Months / Years）。

**（3）编辑操作（含快捷键）**

| 操作 | 快捷键 / 交互 |
| --- | --- |
| Add event / Add age | 工具条按钮；**点击时间轴放置**，`Esc` 取消（`placeEventHint` / `placeAgeHint`） |
| 右键菜单 | `Add event here` / `Add age here` |
| 复制 | **⌘D**（`duplicateShortcut`） |
| 删除 | **⌫**（`deleteShortcut`） |
| 清除选择 | **Esc** |
| 平移 | **按住 Space** 可用任意工具拖动画布（changelog 2026-09-27） |
| 缩放 | Zoom in / Zoom out / Fit |
| 触摸屏 | 按住再移动事件（press and hold to move on touch screens） |

**（4）事件 ↔ 卡片联动（重点）**

- 侧栏卡片可以**直接拖到打开的事件上**，或用「按卡片类型过滤的可搜索列表」挑选（`linkCard`、`filterCards`、`cardTypes`、`searchCards`）
- 事件可标记一张**Featured card**（`featureCard: Feature {name}`）
- 卡片也能在时间轴上被拖动改期；事件支持**关联多张卡**（changelog 2026-09）
- 事件可挂图片、描述、名称；纪元可挂图片、描述、名称

**（5）性能与渲染**

- 2026-08-28：**无限缩放**
- 2026-09：事件多卡
- 时间轴可被嵌进 Quill 故事里（changelog 2026-07）

### 6.2 Map Maker / Atlas（2026-10-01 开放 beta，产品里最重的一块）

`atlasTool` 命名空间有 763 条字符串，是**所有工具里最大的**。它的定位原文是：

> "One world drawn at every scale. Paint a continent, zoom into its kingdoms, and down into a city's streets. The map illustrates itself, and it moves."

| 模块 | 能力（证据 key） |
| --- | --- |
| **创建方式** | 空白 / 模板（Islands、Continent，含 4 种尺寸，单位 km）/ **上传图片**：可"as an image"或**"as a 3D map"**（"Built from the land, places and roads in your image"，约 1 分钟，可离开页面） |
| **工具（tool/）** | Select、Pan、**Biome**、**Raise（抬升地形，Shift 反向切削）**、**Path（河流/道路/小径/城墙/边界/街道/悬崖）**、**Stamp（放置聚落）**、**Zone（区域）**、**Label（标签）**、**Measure（测距）**、**Elevation**、**Rivers（画河流，会顺坡而下）**、**Eraser**、**Directions**、**Site** |
| **地貌笔刷（region/）** | 草地、水域、森林、林地、松林、棕榈、丛林、死林、菌林、热带草原、绿林、针叶林、草原、果园、山地、丘陵、农田、沙漠、沼泽、冰原、城区 |
| **聚落图章（glyph/，34 种）** | 房屋、城镇、城市、港口、塔、城堡、教堂、船、废墟、灯塔、树、山峰、首都、村庄、木塔、法师塔、土垒、木堡、护城河要塞、旅店、农场、水井、坟冢、沙丘、火山、洞窟、立石、神龛…（另有 815 个游戏图标包） |
| **建筑/地貌配色方案（scheme/）** | Timber and straw、Stone、Slate、Whitewash and red tile、Sandstone、Dark、Elven、Dwarven（还可自定义 Body / Roof-Accent / Details），山峰可 Snowy/Grey/Bare rock/Red rock/Basalt/Ice/Green/Deep green/Autumn/Pale/Winter/Dead wood |
| **镜头（Lens）** | **Map**（地点/路径/区域/标签）、**Landscape**（生物群系与高度，含河流下坡）、**Travel**（两点间的**旅行时间**，含步行/骑马等多种方式与每天时长设定）、**Trade**（沿线贸易模拟） |
| **贸易模拟（trade/）** | 城镇的产出/聚集/贸易、**市场与价格区间**（"Against its usual price here"）、**粮仓存量**、人口、港口与海陆转运、短缺与月数预测、逐月播放（`chip: Month N · X on the move`） |
| **时间版本（time/）** | 地图的**多版本 = 不同日期**，"A version is the map at a date. Drawing while you are on one changes it from there on."，可 scrub 时间轴、上一版/下一版 |
| **图层（layers/）** | 新建/重命名/删除/显隐图层，每层可设图标，`hiddenCount` 提示隐藏数量 |
| **尺幅与缩放带（band/）** | World / Region / City 三档，`dims: {w} × {h} km`，`cellKm`/`cellM` 网格尺度；**双击城镇/城市/城堡可打开它的城市地图**（`openCity` / `enterHint`） |
| **标注（pill/）** | Pin 可重掷图标、改名、**关联卡片**（link card / create as card / 在图上改名 / 复制 / 桥接） |
| **其他** | 性能报告工具（`perf/`：帧时间与卡顿分阶段报告）、测量（m/km）、从图像识别的检查清单（`fromImage.check`，31 条） |

**Classic map（`cartographerTool` / `mapTool`）** 则是另一套：底图上放 **Pin / Zone / Label / Layer**，Pin 有描述、可链接卡片，Zone 有共享边界、边缘吸附、前后层序。截图 `docs/vvd-shots/03-地图编辑器与浮动工具条.png`、`04-地图右键菜单.png` 展示的就是这类地图：选中区域后浮出的工具条包含 **区域形状、调色板、M（类型/标记）、眼睛（可见性）、关联卡片芯片、自动描边、图层、删除**；右键菜单是 **Pin ▸ / Zone / Text**。

### 6.3 关系树 / 世界图谱

- **Relation tree（v2）**：2026-05-29 出 beta。可选 **Family / Corporate / Military / Royal court / Blank** 五种起步模板，关系名可改；支持 **variant（多变体，如不同家族分支或不同世界线）**、junction、拖拽时卡片自动对齐、任意人可加图片或新建卡；可发布到 wiki。
- **World Graph**：全世界的连接图。属性里选中一张卡（Reference 类型）会**在图谱上画出连线**；有 connections 面板；可固定节点；可作世界首页背景；`graphHint: The shape of this world`。

### 6.4 跑团套件（Campaigns / TTRPG）

`campaign` 是 i18n 里**最大的命名空间（2294 条）**，比地图还大。2025-10-26 上线，2026-01 迁移期间被留在 legacy 站点，之后 changelog 不再提它（现状不确定），但在当前 i18n 里仍然完整存在：

- **开团向导（wizard）**：选规则集 → 选官方冒险（"Library world · read by reference"，需要你拥有该冒险才能跑）或**用自己的世界跑 Homebrew** → 设定邀请方式。
- **邀请函风格（letter.styles）**：Letter（"A wax-sealed parchment delivered by raven"）/ Dream Vision / Terminal（"An encrypted transmission across the wire"）/ Case File / Job Board —— 邀请本身就做成叙事道具。
- **邀请与加入**：链接带角色（player / co-DM）、可**免账号以访客身份加入**、可绑定到指定账号。
- **场次（session）**：排期（时间、时长、**玩家时区**）、标题、会后 **recap**、历史场次批量补录（自动重排编号、可设 GM-only）。
- **桌面工具（plan board）**：可挂 Campaign / World / Media / Monsters / Spells / Conditions 面板；配合骰子、先攻追踪、Compendium 规则库、Player Sheet、Stat Block。
- **内容分层**：跑团内容可用 2.3 的 canon / module / override / extend 四层，做到"改团不改世界"。

---

## 7. Wiki / 发布：把世界变成可读的站点

### 7.1 发布与可见性

| 能力 | 证据 |
| --- | --- |
| 一套世界 → 一个或多个 Wiki（**Pro 可多 Wiki**） | changelog 2026-08-20；`billing.wikiLimit` |
| 发布地址是**子域名**：`<address>.vvd.world`（可绑自定义域名） | `sitePublish.claim.suffix = ".vvd.world"`；pricing 的 custom domain |
| 读者侧门槛文案 | "This site is password protected"、"This site is for members"；站点导航为 Home / Wiki / Pages / Follow；可嵌入 newsletter 订阅（`publishedSite` / `wikiChrome`） |
| 可见性：**Public / Unlisted（仅链接）/ Password（密码）** | `sharePanel.site.audience.*` |
| 仅邀请发布、私密分享链接（Hobbyist 起） | pricing |
| **自定义域名**、自定义子域 | pricing；`subdomainField` |
| 版本化发布 + 变更计数 + 逐卡状态机 | `sharePanel`（见 4.4 末） |
| 类型级与卡片级排除（某类型的卡整类不发布） | `publish.typeExcluded` |
| 每张卡有独立 URL；未发布的卡给出未来的地址 | `publish.unpublished` |

### 7.2 站点外观

- **Wiki 模板（Layout）**：changelog 明确提到的有 `Overworld`（经典奇幻，2026-05-29）、`Terminal`（复古科幻，2026-09-20）、**`Shell`**（终端式：读者靠输入命令探索，颜色可定制，2026-10-01）、`Traditional`、`Synthwave Matrix`。模板是**独立加载的展示模块**（i18n 里 `siteThemeOverworld` 自成一套文案，含 "Overworld panel / Back to map / Expand the world graph"），加载失败有专门容错文案："Your world and its content are untouched."。⚠️ i18n 里查不到完整的模板注册表，所以**模板全集未能确认**。
- **配色（Palette）**：`wiki.customizationLabels` 里登记了 22 套配色：Parchment、Midnight、Verdant、Paper、Sepia、Slate、Nebula、Ember、Tide、Netscape、Terminal、Hot Dog Stand、Enchanted Forest、Mystic Twilight、Nordic Frost、Autumn Ember、Midnight Scholar、Gothic Royal、Wiki Parchment、Wiki Dark、Synthwave Matrix、**Your World（跟随世界主题）**；另有分组：Light / Dark / Serif / Sans-serif / Monospace。
- **主题/配色/字体**：Design 面板里选配色与字体，可**保存多套自定义配色**（`customSchemeName`、`customSchemeEdit`、`customSchemeDelete`）；世界主题可应用到编辑器外观（`quill.editor.worldTheme`）。
- **页面结构**：Wiki 的 Pages 面板可**分区（Sections）**、选图标、改布局、隐藏整节 / 隐藏单页 / 隐藏单块；分组方式可选 **Group by type**（跟随卡片类型自动分组）或 **Group manually**。
- **首页与 Explore**：世界与 Explore 两个区恒定存在；可选卡片与地图展示在简介下方（`exploreLinksDialog`）；首页有网格 / 精选卡片排序。
- **地图美术层（Map artwork）**：上传三张透明 PNG 做**视差**（背景移动最多、中层次之、前景水面最少）。
- **音频（Audio）**：Wiki 背景循环音轨 + **每个 Pin 的环境音**（按聆听半径淡入、可设淡出时长与音量），读者自行开启声音。
- **分析**：`wikiAnalytics`（Dashboard / Home）。

### 7.3 读者侧（Quill & Community）

- **Quill 阅读器**：目录、开始阅读、章节导航、阅读设置（字号 S/M/L/XL、衬线/无衬线/等宽、**Scroll ↔ Pages 翻页**、亮/暗）、Read ↔ **Play** 两种打开方式、浏览量/点赞/章节数、**订阅（newsletter）** 组件。
- **Quill 写作**：章节（可命名为 Prologue / Interlude，不计入章节号）、**草稿与已发布版本分离**（draft 可 duplicate/fork/set default/delete，章节永远保留至少一个草稿）、字数统计、章节排序、写作台外观（可选"我的桌面"或世界主题）。
- **Quill 出版**：封面设计器（装帧 / 书衣 / 文字 / 画笔 / 拖放元素，有"最多 N 个文本、N 条笔画"的限制）、内页排版（缩进、场景分隔符、**drop caps**、**small caps**、行高/字距/段距、标题字号、章节装饰、纸张色调）、导出 **EPUB / PDF / DOCX**（PDF 按书排版：running heads、页码、目录）。
- **Community（社区）**：世界作者可以发帖（标题 + 正文 + 附件：世界文档 / 章节 / 整本书 / 图片 / 视频 / 链接 / 投票），观众可选 **Everyone（关注者）** 或 **Members（会员）**；有草稿、回复（可排序、可折叠）、react、关注者与会员计数、通知邮件（`emailUpdates`）。
- **变现**：`Support`（会员）、`Shop`（商品）、`Perks`（权益）、`Earn`、`Audience`（受众）、**Inbox**（读者售后台：意图分类涵盖退款/取消/物流/未收到/损坏/错件/退货/改地址/下载失败/打不开书/取消会员/账单问题/收据/特殊请求/辱骂/诈骗，可翻译读者来信、可屏蔽读者、可标记完成与重开）。

> 一句话：**VVD 的 wiki 不是"资料库"，而是一个带主题、视差、环境音、分析、订阅与商店的"作品官网"。**

### 7.4 受众分层、分析与变现（这块比多数同类产品走得远）

| 模块 | 要点 |
| --- | --- |
| **受众四层** | `Visitors`（访客）→ `Followers`（关注者）→ `Supporters`（支持者）→ `Members`（会员）；后台 Audience 面板聚合关注者、邮件更新与"关注者权益" |
| **单篇内容访问控制**（storyAccess） | 每篇故事可选 **Everyone / Followers / Members / Buyers** 四档；支持组合销售："Free for followers. Everyone else can buy it."、"Only people who buy it can read it."（一次性购买 + 定价） |
| **站点分析** | **Pro 功能**（有付费墙，列出 7 项）：浏览量/独立读者、Top 页面（可下钻）、国家地区、设备、流量来源、新老读者、**全部 CSV 导出**；另有内容级指标 `reach`（"Share of this page's readers who got this far down"，即阅读深度）与**粉丝归因**（"the page that convinced them"、每个粉丝的阅读轨迹 `Their path`）；有隐私下限设计（样本太少就不细分："Grouped for privacy"、"Country level only."） |
| **创作者协议** | 发布变现前需签署 **Creator Earnings Agreement**（2026-09 更新）：价格含税费与手续费、订阅可随时取消（当期有效）、Shop 实物按成本计运费、争议金额可冻结、著作权归创作者、平台抽成 **10%**（"vvd keeps 10% of each payment — on Shop orders, 10% of the items, never of the shipping — plus payment processing costs."）、Stripe 结算、更新邮件须带退订 |
| **签署流程** | 填 Business name / Country → 手输姓名签名 → 勾选同意 → `Agree & Start Earning`；未发布站点时提示"Your site isn't published yet, so there's nowhere for readers to pay you." |
| **读者售后** | Inbox 把读者来信按意图分类（退款/物流/会员/账单… 共 20+ 类），可翻译、可屏蔽、可标记完成，并有"超过三个工作日未回复"的提示 |

---

## 8. 导入、导出与互操作

### 8.1 Import（421 条字符串，做得非常认真）

- 入口："Import from anywhere"；支持**拖入文件或文件夹**（子目录也会读）：Markdown、纯文本、CSV、JSON、Word、PDF、ePub，以及 zip 等压缩包。
- 明确的**分步向导**：Source → Planning → Review → Import → Done。
- 内置各家迁移指引（含精确点击路径）：**Obsidian**（直接选 vault 文件夹，附件一起搬）、**Notion**（Markdown & CSV + Include subpages 的 zip）、**Google Docs**（下载为 .docx）、**World Anvil**（Export World + API Token，读 HTML 版本）、**Scrivener / 手稿**（先 Compile 成 .docx）、**Microsoft Word**。
- 错误处理粒度很细：扫描版 PDF 需先 OCR、加密文件、损坏文件、超限、压缩包套压缩包、图片过多、重名路径冲突等，各有专门文案。
- 识别自家导出：拖入 vvd 导出包时会说"This is a vvd export of {name}"。
- 有 warn/truncate 机制："Your source was longer than one import can read, so it was cut short."
- **它其实是一个"会提问的 AI 导入代理"**：导入是分步的（Planning → Review），AI 会在写库前**逐条审查**（"Nothing is written until you create."），能识别奇怪格式并为其生成解析器，消耗的是**月度 AI 配额**（见 4.5）。
- **Import 属于付费能力**（`wizard.limitReachedNative: Importing isn't included in your plan.`）

### 8.2 Export

| 对象 | 格式 | 证据 |
| --- | --- | --- |
| 整个世界 | **Markdown zip（+ JSON + 原媒体）** | changelog 2025-10-11 "Export your world" |
| 单张卡片 | Markdown / PDF / Image | `sharePanel.export.*` |
| 地图 | 图片 | changelog |
| Quill 故事 | EPUB / PDF / DOCX | `quill.export.*` |
| Table | CSV（双向） | changelog 2026-08-20 |

---

## 9. 扩展性与开发者能力

| 能力 | 证据 |
| --- | --- |
| **Workshop**：用户可以做工具/应用并发布 | `workshop.developer.subtitle: The tools & apps you make`、`library.subtitle: What this world has added.`、`storefront`、`versions`、`devStream` |
| **两种形态**：Tool vs App | Tool = "Embeds in a document"（像 Timeline 那样嵌在卡片里）；App = "Owns its own space"（像 Shell / Terminal 那样占独立空间） |
| 从终端构建并发布 | `workshop.gettingStarted.subtitle: "Build and ship a vvd app right from your terminal."`，配 **vvd CLI**（`vvd run` 本地预览、`vvd save` 提交），并有从 GitHub 一键部署的流程（Draft / Private / Marketplace update，公开上架需审核） |
| 工具块可插入卡片 | `editor.slash.groupWorkshop: Tools` / `workshopNote`（"Picking it adds {name} to this world"，标 `Beta`） |
| **服务端代码 + 环境变量** | `workshop.envVars.description: Secrets your project's server code reads at run time. Values are write-only and apply to every version instantly.` |
| **能力清单（权限）** | 工具可拿到：世界 id、读者姓名与头像、是否会员、世界角色等 |
| **自埋点** | 提供 `host.analytics.track()` 之类的宿主 API 供工具上报自己的事件 |
| 站点 SDK | `siteSdk` 命名空间（页脚编辑器、404 文案、区块级自定义） |
| **API + MCP** | `apiKeysPage.description: "Keys let scripts, CI jobs and MCP clients work with your worlds through the vvd API and MCP server. A key acts as your account — anything you can do, it can do. Revoke a key to disconnect it instantly."` |
| 付费档限制 | API 从 Pro 起；Workshop 工具 Free 可试但不保存（矩阵值：Free = "Run, can't save"、付费档 = "Browse & run"、Pro/Studio = "**Author & sell**"） |

> 这是 VVD 与 World Anvil / Campfire 等竞品的关键差异之一：**它是可编程的**（工具即插件，站点可换模板，且有 MCP 供 AI 客户端调用）。

### 9.1 实测：公开工具市场（`/t/<slug>`，共 35 个工具页）

`https://vvd.world/sitemap.xml` 里有 **44 条 URL，其中 35 条是公开的工具页**（`robots.txt`：`Allow: /t/`）。每页显示工具名、一句话介绍、**使用它的世界数**、点赞数、版本号、作者（vvd 官方或社区作者），并且有一块 **Live Preview**。下表是 2026-10-06 实测抓取的数据（`Worlds` 反映真实采用量，可作为"哪些工具值得先做"的参考）：

| 工具（slug） | 官方名 | 一句话（官方 tagline） | Worlds | 版本 | 作者 |
| --- | --- | --- | --- | --- | --- |
| cards | Cards | Write characters, places and things | 52k | 0.1.3 | vvd |
| timeline | Timeline | Put events and eras on a timeline | 52k | 0.1.11 | vvd |
| maps | Maps | Pin places and zones on an image | 52k | 0.1.10 | vvd |
| family-tree | Relation tree | Chart how characters are related | 52k | 0.1.11 | vvd |
| canvas | Canvas | Sketch ideas on an infinite board | 52k | 0.1.6 | vvd |
| notes | Notes | Jot quick notes together | 52k | 0.1.5 | vvd |
| heraldry | Heraldry | （无描述，标注 core） | 52k | 0.1.1 | 社区 |
| sprite-viewer | Sprite Viewer | （无描述，标注 core） | 52k | 0.1.5 | 社区 |
| map | Map | （新地图引擎，2026-10 的 Map Maker） | 3.4k | **0.1.50** | 社区 |
| world-graph | World Graph | See the links between your cards | 3.2k | 0.1.2 | vvd |
| conversation | Conversation | Write dialogue at the speed of thought. Choose a speaker… | 2.9k | 0.1.12 | vvd |
| radar-chart | Radar Chart | Shape any character, system, or comparison—then drag the… | 777 | 0.1.10 | vvd |
| table | Table | Keep records in rows and columns | 746 | **0.1.31** | vvd |
| 5e-character-sheet | 5e Character Sheet | （D&D 5e 角色卡） | 723 | 0.1.11 | 社区 |
| dictionary | Dictionary | （造语词典） | 710 | 0.1.9 | 社区 |
| embed | Embed | Embed videos, posts, and files | 595 | 0.1.8 | vvd |
| 3d-model-viewer | 3D Model Viewer | Visualize 3D characters, environments, and items | 551 | 0.1.21 | vvd |
| 5e-stat-block | 5e Stat Block | Author classic 5e creatures from CR 0 to 30 on the ori… | 292 | 0.1.2 | 社区 |
| spotify-embed | Spotify | （Spotify 嵌入） | 265 | 0.1.8 | 社区 |
| amber-archive | Terminal（a vvd app） | （终端风格应用） | 229 | 0.1.11 | 社区 |
| daggerheart-character-sheet | Daggerheart Character Sheet | （Daggerheart 规则角色卡） | 199 | 0.1.8 | 社区 |
| 5e-character-sheet-2 | 5e Character Sheet | The classic collaborative 5e character sheet, exa… | 166 | 0.1.2 | 社区 |
| investigator | CoC Character Sheet | "The paper sheet has 357 boxes, and 132 of them are arithmetic nobody should be doing at the table." | 134 | 0.1.16 | 社区 |
| shell | Shell（a vvd app） | （终端式 wiki 应用） | 129 | 0.1.21 | 社区 |
| daggerheart-adversary | Daggerheart Adversary | （Daggerheart 敌人） | 127 | 0.1.3 | 社区 |
| youtube | YouTube | （YouTube 嵌入） | 93 | 0.1.1 | 社区 |
| voice-memo | Voice Memo | Say it out loud. Keep every word. | 84 | 0.1.11 | vvd |
| travel | Travel | （无描述，标注 core：旅行时间） | 35 | 0.1.0 | 社区 |
| apple-music | Apple Music | （Apple Music 嵌入） | 33 | 0.1.2 | 社区 |
| file-viewer | File Viewer | （无描述，标注 core） | 11 | 0.1.5 | 社区 |
| to-do-list | To-do List | （无描述，标注 core） | 10 | 0.1.1 | 社区 |
| codex | Homebrewery | （无描述，标注 alpha） | 7 | 0.1.1 | 社区 |
| trade | Trade | （无描述，标注 core：贸易） | 6 | 0.1.0 | 社区 |
| camp-wiki | Camp Wiki（a vvd app） | Read the camp world wiki | 5 | 0.1.17 | vvd |
| audio | Audio | （无描述，标注 alpha） | 4 | 0.1.10 | 社区 |

**从这张表能读出来的事**：

1. **核心六件套是绝对主力**：Cards / Timeline / Maps / Relation tree / Canvas / Notes 都是 **52k 世界**在用（`52k` 应是显示上限或平台总世界数）。
2. **社区作者已经成规模**：半数工具作者是社区（Daggerheart、CoC、5e、Heraldry、Dictionary…），且带版本号与点赞 —— Workshop 生态是真的跑起来了。
3. **新引擎（`map`）已迭代到 0.1.50**，是版本号最高的工具，说明 Map Maker 更新极其频繁。
4. **工具页上的名称与编辑器里的名称不完全一致**（例如 `maps` = Maps（旧）、`map` = Map（新）；`amber-archive` 显示为 Terminal）——工具在市场上是可命名的产品。

---

## 10. 发布节奏与产品重心（基于 50 次更新的量化）

| 指标 | 值 |
| --- | --- |
| 更新次数 | **50 次**（2025-10-03 → 2026-10-01，约 364 天） |
| 节奏 | **基本每周一次**（每月 4–5 次）；最长空档 36 天（2026-01 迁移新版） |
| 功能条目 | **334 条**（平均每次 6.7 条） |
| 修复条目 | **254 条**（50/50 次更新都带 Fixes 小节，平均 5.1 条/次） |
| 功能条目按官方分类 | **editor 140**、wiki 32、boards 30、account 28、map 26、quill 18、campaigns 16、performance 15、collaboration 10、apps 9、timelines 6、workshop 4 |
| 修复条目按官方分类 | **editor 118**、wiki 41、boards 21、account 20、map 17、apps 12、performance 7、collaboration 5、timelines 4、quill 3、campaigns 3、workshop 3 |
| 重要的"全量发布"节点 | Relation Trees 2026-05-29 / Timelines 2026-06-14 / Quill 2026-07-12 / 新版重构 2026-08-20 / Map Maker beta 2026-10-01 |

**读法**：功能投入的 **42%（140/334）在编辑器本身**（链接与提及、侧栏、Tab 与面板、上传、图片、区块），说明这家公司把"写卡片的顺滑度"当作核心竞争力；地图与画布长期在"修 bug"状态，与其较晚重写的事实吻合。

---

## 11. 上手、养成与留存设计

这一层常被忽略，但 VVD 做得比多数同类产品重，且直接决定新用户前 10 分钟的体验：

| 机制 | 说明 | 证据 |
| --- | --- | --- |
| **引导式建世界** | 新建世界时先问一堆世界观问题（"Uses only what you write here."），答案直接变成卡片内容；**回答可以口述**（语音） | `guidedTemplates`、changelog 2026-01-25 |
| **Home setup** | "Make yourself at home — Choose what you need. You can change everything later."（选你要的工具组合） | `homeSetup` |
| **世界首页（dashboard）** | 可**加/移/拖拽/缩放磁贴**、选画布、选图、显示笔记、图谱背景、章节笔记；2025-10 起首页轮播世界观冷知识 / 技巧 / 电台选曲 / 社区投票 | `quill.dashboard`、changelog 2025-10-19 |
| **Paths（引导路径）** | 写作 / 跑团 / 世界观 / 游戏叙事 / 影视故事五条路径，逐步跟随并给**徽章**；有内部管理台可预演路径步骤（`adminPaths`） | `path` / `adminPaths` |
| **成就** | 2025-10-19 上线 20 个成就 + 成就环 | changelog |
| **引导教程** | Guided tutorials、getting started、`tutorial`（230 条文案） | i18n / changelog |
| **彩蛋** | 内置**电台**（有隐藏频段，调台时的静电噪声、摩斯码提示）；做旧式交互 | changelog 2025-10-11 / 2025-10-19 |
| **反馈闭环** | 顶栏常驻 Feedback 入口；`connectionCheck` 自检页（让用户截图发给支持） | i18n |

**推断**：这套设计的目的是把"空白画布焦虑"换成"回答问题就有内容"，同时用 Paths 与成就提供长期回访理由。

---

## 12. 视觉与交互语言（复刻参考）

> 以下来自演示视频截帧（`docs/vvd-shots/`），是本项目做 1:1 复刻时最直接的一手材料。

### 12.1 编辑器外壳

- **深色、低对比、少边框**：面板之间靠极窄的深色缝隙分隔，几乎不用描边（见 `01-编辑器卡片与分屏.png`）。
- **顶栏居中四入口 + 右侧工具区**：Home / World / Wiki / Quill，右侧 Feedback、收件箱、广播、时钟、头像。
- **多面板并排**：每个面板有自己的 Tab 条（`○ W ×`），面板之间可拖拽改变分割，双击复位（`resizeHint: Drag to change the split · double-click to reset`）。
- **左侧文档树**：行高紧凑，文件夹行有 chevron，文档行左侧是类型图标（卡片/地图/画布…），顶部是 `⌘K` 搜索框与 `⋮`。
- **卡片阅读节奏**：大标题（**斜体衬线**）→ 类型徽标 → 属性表（label 左、值右）→ 封面图（右浮动）→ 分节正文；正文里链接高亮为**暖色下划线**。
- **底部插入条**：`+ Text`、`+ Media`、`+ Map`、`+ 工具/数据块` 一排胶囊按钮贴在卡片底部。

### 12.2 地图

- 地图本体是**手绘/等距风格**的插画，海面有波纹渐变；区域用**发光描边**表示，聚落用**小缩略图 + 名称胶囊**标注，区域名用**大号斜体衬线字**直接画在地图上。
- 选中区域后浮出一条**紧凑的黑色浮动工具条**（图标 + 分隔线 + 关联卡片芯片），不是固定工具栏。
- 右键画布出**三行菜单**（Pin ▸ / Zone / Text），深色圆角、宽内边距。

### 12.3 与我们已复刻部分的对照

README 里记录的「时间线编辑区」复刻（点阵 24×24、轴线居 50.1%、圆点 8px、标签胶囊高 24 / 圆角 12、纪元色带高 26、底部工具条 245×48、缩放控件 41×114）与本文 6.1 描述的时间轴能力**方向一致**：它确实是"轴线 + 事件点 + 标签胶囊 + 纪元色带 + 浮动控件"的极简形态，交互上则比我们已做的多了**日历设置、精度切换、双视图、卡片联动**四块。

### 12.4 文案与"零风险"话术（低成本但极影响信任感）

VVD 的界面文案有一套非常一致的**降低风险感**的写法，几乎每个危险操作旁都有一句"你不会失去东西"：

| 场景 | 原文 |
| --- | --- |
| 导入 | "**Nothing is written until you create.**" |
| 发布失败 | "Your current live version is unchanged." |
| 移除扩展/工具 | "Nothing is deleted." |
| 删除世界 | "Contact us and we'll restore it." |
| 模板加载失败 | "Your world and its content are untouched." |
| 降级/暂停订阅 | 内容保持可读可分享，只是不能新建 |
| 同步状态 | 本地优先 + 五态状态机（离线可写、重连同步、"Working offline. Your changes are saved here."） |

另外它的**界面文案习惯**也值得抄：把快捷键直接写在提示里（"Drag to resize · double-click to reset"、"Next time, type {shortcut} and a space"）、空状态一律给下一步动作（"Nothing to do yet. Press + to add the first one."）、错误文案给原因而不是报错码（"Your source was longer than one import can read, so it was cut short. Split it up and import the rest separately."）。

---

## 13. 对复刻工作的启示（建议优先级）

> 这一节是**推断与建议**，不是事实陈述。

| 优先级 | 事项 | 理由 |
| --- | --- | --- |
| P0 | 把「卡片 + 类型 + 属性」做成数据模型 | 这是 VVD 的地基，我们目前是硬编码 Event/Era；越早抽象越省事 |
| P0 | 时间轴补齐：**日历设置面板、纪元管理、事件精度、卡片/事件双向关联** | 我们已复刻视觉，缺的是"可配置的日历"这层能力 |
| P1 | 右侧「面板 + Tab + 分屏」工作区 | 这是它和其它工具手感差异最大的地方，也是 changelog 投入最多的区域 |
| P1 | 正文内的**名字自动识别 + `@` 提及 + 别名** | 世界观工具的"活"就来自自动互链 |
| P2 | 简单版 World Graph / 关系树 | 复用同一套卡片数据，边际成本低、观感强 |
| P2 | 发布/分享（只读站点 + 密码 + 未发布状态提示） | 直接对应"共建"需求 |
| P3 | 地图（先做 Classic map 的 Pin/Zone/Label，不碰 Map Maker） | Map Maker 是 763 条文案的巨兽，不适合早期投入 |
| P3 | 导入（Markdown/JSON 先行） | 决定用户愿不愿意把已有设定搬过来 |

**为什么是这个顺序**：9.1 的采用量数据给出了答案 —— 拥有 52k 世界的六个工具（Cards / Timeline / Maps / Relation tree / Canvas / Notes）就是用户真正在用的东西；Table(746)、Radar Chart(777)、Dictionary(710)、Embed(595) 属于第二梯队；而 Map Maker 虽然版本迭代最猛（0.1.50），采用量只有 3.4k，说明**新引擎还在早期**。

### 13.1 落地记录（2026-10-06）

> **五轮落地**：第一轮 P0 + P1，第二轮 P2（图谱 + 发布），第三轮关系树 + 经典地图，
> 第四轮把工作区的时间线换成**已有的经典编辑器**、补上富文本与 `/` 斜杠菜单，并按自动点测修掉一批体验死角（见 13.2）；
第五轮把编辑区工具栏做成图标气泡（含创建 / 链接卡片），外观整体换成桌面 Minimalist 设计系统的极简语言（见 13.3）。
第六轮收口控件一致性与颜色语义、把侧栏与编辑区做成圆角矩形、滚轮改成一屏左右平移时间轴，并把首页并到 `/world`（见 13.4）。代码在 `world/` 应用（工作区 `/world`，接口 `/api/world/*`，
> 只读站点 `/s/<slug>/`），测试 **84 个**（world 54 + timeline 30），
> 截图见 `docs/vvd-shots/08~20`（工作区卡片 / 时间线与日历 / 并排面板 / 世界图谱 / 发布站点首页与卡片页 / 关系树 / 经典地图），
> 测试 **130 个**（world 100 + timeline 30）。

| 优先级 | 事项 | 状态 | 落地位置 |
| --- | --- | --- | --- |
| P0 | 卡片 + 类型 + 属性数据模型 | ✅ 完成 | `world/models.py`（`EntityType` / `PropertyDef` / `Card`，七种值类型含引用与公式，类型可嵌套可继承） |
| P0 | 时间轴日历层：日历设置 / 纪元 / 事件精度 / 卡片联动 | ✅ 完成 | `Calendar`（月 / 每天小时数 / 卫星 / 预设）、`Era`、`TimelineEvent.precision`、`linked_cards` + `featured_card` |
| P1 | 面板 + Tab + 分屏工作区 | ✅ 完成 | `/world` 工作区：多标签、并排面板（拖动分割 / 双击复位）、`⌘\` 新面板 |
| P1 | 名字自动识别 + 别名 | ✅ 完成 | `world/autolink.py` + 卡片正文高亮 + 反向链接面板（`@` 提及的输入侧未做） |
| P1 | ⌘K 全局搜索 | ✅ 完成 | `/api/world/search` 命中标题 / 别名 / 正文 / 属性值 |
| P2 | 世界图谱 | ✅ 完成 | `world/graph.py`：**引用属性 / 事件关联 / 正文提及**三种连线；工作区图谱工具（搜索 + 一跳邻居、隐藏孤立、标签与大小、拖动、双击看邻域、`⌘/Ctrl+点击`钉住） |
| P2 | 发布 / 分享（只读站点） | ✅ 完成 | `world/publish.py` + `site_views.py`：`/s/<slug>/` 站点（首页分区 / 卡片页 / 相关），`public`·`unlisted`·`password` 三档，版本号 + **四态发布状态机**（live / stale / pending / excluded）；工作区里有分享面板 |
| P2 | 关系树（family tree） | ✅ 完成 | `TreeVariant`（多变体、可 fork）+ `TreeNode`（世代/交汇点/已故/分组/卡片吸附/新建卡片）+ `TreeEdge`（五种关系、可改关系名）；界面有变体标签、模板切换、自动适应视野 |
| P3 | 地图（Classic map） | ✅ 完成 | 底图上传/外链 + `MapMarker`（图钉·区域·文字）+ `MapLayer`（显隐/透明度）；右键菜单与标注栏对齐官网截图；**Map Maker（新引擎）仍未做** |
| P3 | 导入（Markdown / JSON） | 🟡 部分 | `import_timeline` 能把上一轮的扁平数据迁进来；通用导入向导未做 |

**第三轮（关系树 + 经典地图）额外落地**：地图底图支持真实**上传**（`/media/maps/`，25 MB 上限），
关系树的变体支持**从当前树复制**（对齐 "forks the current one"），两者都有独立工具条与选中态底部操作栏。

### 13.2 UX 复盘（2026-10-06，自用 + 自动点测）

按"站在用户角度用一遍"的方式，用 Playwright 驱动系统 Chrome 把工作区点了一遍（脚本在 `tools/`），
结论如下。

**先修掉的、确实会被用户撞到的问题**（都是真跑出来的，不是猜的）：

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 时间线面板打开是**空白** | 嵌入页 404（dev server `--noreload` 未重载路由）+ Django 默认 `X-Frame-Options: DENY` 拦掉同源 iframe | 重启服务 + `X_FRAME_OPTIONS = "SAMEORIGIN"` |
| 点画布**没反应** | 同上（iframe 根本没加载） | 同上；修好后点画布能新建事件（7 → 8） |
| 侧栏能看到的文档，点进去 **404 toast** | 树的 `children` 没过滤 `deleted_at`，回收站里的子文档仍显示 | 序列化时过滤软删除的子节点 |
| 回收站是**空壳**（永远显示 0） | 只有软删除，没有列表 / 恢复接口 | 新增 `/api/world/trash` 与 `/documents/<id>/restore`，弹窗里可恢复 / 彻底删除 |
| 打开文件夹显示"工具没实现" | 没写文件夹视图，且详情接口不带 `children` | 新增文件夹视图 + 详情接口支持 `?children=1` |
| 左上角世界名牌**点了没反应** | 没绑事件 | 世界设置弹窗（名称 / 简介 / 题材 / AI 与自动识别开关） |
| 改了 hash（分享链接、前进后退）**不生效** | 只在 boot 读一次 hash | `pushState` + `popstate` / `hashchange`，浏览器前进后退可用 |
| 输入 `/` **菜单不弹**（换行之后） | contenteditable 换行插的是 `<div>`，整段 textContent 里没有空白分隔 | 改成只看"光标所在文本节点"的前缀 |
| `/标题 2` 边打边过滤时**菜单自己关了** | 正则不允许关键词里有空格 | 关键词允许空格 |
| 格式条**一点就消失** / 点到的是隐藏的那条 | 每个区块各建一条格式条（都在 body 里），且失焦即隐藏 | 改成全局单例 + 记住选区 + 悬停不收 |
| 用斜杠菜单设成标题后，**内容被 700ms 后的自动保存盖回去** | 防抖保存读的是被重渲染换掉的旧节点 | 结构性改动前取消该区块的防抖；旧节点打 `retired` 标记；写入加序号防止落后响应覆盖 |
| 斜杠菜单**没匹配时一片空白** | 无结果时直接关掉弹层 | 加一行"没有匹配的区块 · Esc 关闭" |
| 时间线页乱点会**抛 JS 异常 28 次**（`Cannot read properties of undefined`） | 适配层的写接口返回的是 world 形状（没有 `kind/start`），编辑器 adopt 后把新建的纪元当事件，节点结构对不上 | 写接口统一返回经典形状；并给编辑器加一道"结构不匹配就重建节点"的自愈 |
| 经典页面偶尔 404 | 猴子测试里把记录删了，编辑器还在保存它（并发删除） | 编辑器本来就 `.catch` 了；现在只提示"保存失败，请重试"，不再整页崩 |

**仍然粗糙、但已知的地方**（没有假装解决）：

1. **块只能上下移 / 左右分栏**，不能拖拽排序；块类型切换靠 `/` 菜单，没有专门的块菜单按钮（悬浮工具条里有 ↑↓ 与删除）。
2. **没有撤销 / 重做**：改错了只能手动改回来（经典编辑器自己那套撤销不覆盖工作区的编辑）。
3. 块评论（`commentOnBlock`）在界面上还是占位 toast——接口没做。
4. 世界图谱超过 160 个节点只画前 160 个（力导向是简化的 O(n²)）。
5. 时间线的**日历 / 纪元**藏在抽屉里，和经典编辑器不在同一个界面上（两个工具拼在一起，切换要记按钮位置）。

**猴子测试结果**（`tools/monkey_probe.py`：每个页面随机点 25 次 + 随机按键）：
工作区各类型文档、经典时间线页、发布站点全部 **0 未捕获异常、0 个 5xx**；
唯一的 4xx 是"删掉一条记录后编辑器仍在保存它"这种并发竞态，界面会提示重试。

**顺畅、用户能直接上手的部分**：就地编辑（标题 / 属性 / 正文点哪改哪）、`⌘K` 搜索直达文档、
地图直接点着放图钉 / 画区域（右键菜单三行与官网一致）、关系树拖拽换位换行、
时间线拖拽缩放、`@` 提及与名字自动识别、发布状态一眼可读（●已发布 / ◐有改动 / ○尚未上线）。

### 13.3 第五轮：编辑区体验与极简外观（2026-10-06）

**编辑区的工具栏**按官方截图重做成了**图标气泡**：上排是两个动作（`创建卡片` / `链接卡片`），
下排是格式（`A▾ 段落样式`、`B I U S`、引用、链接、`≡▾ 列表`、`☰▾ 对齐`、文字颜色、高亮、块可见性）。
数据落库仍是净化后的 HTML；`创建卡片`会把选中的文字做成新卡片的「概览」并把选区换成链接，
`链接卡片`用可搜索的选择器（替掉了原来那套 `window.prompt` 问编号的做法）。

**外观换成极简风格**：直接采用桌面 `Minimalist` 设计系统的权威 token——灰阶主色（`#18181b` / `#fafafa`）、
一档圆角语言（6/12/16px）、4px 栅格、阴影归零靠边框分层、Geist 字族、40 个线条图标。
任务栏、侧边栏、面板标签、编辑区、浮层全部改成圆角矩形，并且**明暗跟随世界主题**
（浅色是 Minimal 的纸白，深色是它的暗阶）。见截图 `docs/vvd-shots/18~20`。

**这轮又顺手修掉的三个体验问题**：

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 选中的文字会**莫名消失**、格式条不弹 | 后台的"名字自动识别"重写正文 `innerHTML`，把选区连同光标一起吞掉 | 正在编辑 / 选中的块不再重写 |
| 块工具条被当成正文、选区算错 | 容器类名 `block-<type>` 在 `type=text` 时正好等于正文的 `.block-text` | 容器改名 `block-kind-<type>` |
| 气泡工具栏两排叠在一起 | `.format-bar` 旧样式是 `position: fixed`，放进容器后脱层 | 容器内改回文档流，并按量到的高度贴合选区 |

### 13.4 第六轮：控件一致性、颜色语义与路由收口（2026-10-06）

对着用户截图逐条核对后修的：

| 用户看到的问题 | 根因 | 修法 |
| --- | --- | --- |
| 「显示」「删除」被塞进圆形按钮里**折成两行** | `.icon-btn` 是 30×30 的圆，却被当成文字按钮用 | 统一成一号按钮系统：文字按钮一律**药丸**（`padding 0 12px`、`white-space: nowrap`），纯图标按钮才是 30×30 圆角方块 |
| 药丸被挤成 30px 宽、文字被裁 | 旧规则的固定 `width: 30px` 盖住了新内边距 | 基础规则补 `width: auto`，只给 `.is-icon` 变体固定尺寸 |
| 边框与内容**挨得太紧** | 各处 padding 各写各的 | 抽出 `--mn-h / --mn-h-lg` 与统一内边距，按钮、徽章、输入行共用 |
| **颜色几乎没用** | 之前只用了灰阶 | 加语义色：强调蓝（链接 / 提及 / 选中 / 焦点环 / 主按钮）、绿（已发布）、琥珀（有改动）、红（删除）；类型徽章用该类型自己的颜色做淡底；面板当前页签带强调色下划线 |
| 侧边栏、编辑区**没用圆角矩形** | 只有零散圆角 | 侧栏是"一列圆角块"（当前文档整块染色 + 图标变强调色）；编辑区是"一张圆角卡片"（外层 16px 圆角 + 细边框），属性表是圆角容器，区块是圆角块（悬停描边），插入条是浮起的圆角药丸组 |
| 时间线里**滚轮是缩放** | 早期跟录屏对齐时定的 | 改成**滚轮/触控板左右移动时间轴**，缩放改为 `⌘/Ctrl + 滚轮`（触控板捏合）；实测跨度 296.5→296.5（纯平移），⌘滚轮 296.5→162.8（缩放） |
| 首页还是那条单时间轴 | 历史遗留 | `/` 与 `/w` 都 302 到 `/world`；独立成页的经典时间轴挪到 `/legacy`（工作区里嵌的仍是同一个模板） |

另外顺手删掉了自动点测在演示数据里留下的两张垃圾卡片。

### 13.5 第七轮：与 VVD 的深度对比 + 第一批追赶（2026-10-06）

完整对比与路线图另见 **《VVD对比与改进方案.md》**（含"完全没有/体验不如/美术评估"三张清单与 P0–P3 路线图）。
本轮按"用户可感知度"排序，先做了 8 项：

1. **撤销 / 重做**（整卡快照，80 步，覆盖打字/拖拽/菜单/属性/别名/评论）+ 撤销历史面板
2. **块拖拽排序** + 块菜单（类型转换 / 插入 / 复制 / 隐藏 / 评论 / 删除）
3. **块评论**（真实线程：发送、解决、删除、计数徽章）
4. **导入 / 导出**（世界 zip、世界 JSON 备份、单文档 MD/JSON；导入 MD/多文件/zip/Obsidian 目录/备份还原，`[[双链]]` 接成提及）
5. **值得添加**（本地规则实体建议，联动 AI 开关，不上传数据）
6. **时间线列表视图 + 标记**（经典编辑器两颗死按钮变成真功能）
7. **快捷键表与导航**（`⌘/`、`⌘B`、`⌘1…9`、`⌥⌘T`）
8. **占位文档的出路**（`note` 走卡片编辑器；canvas/board/table 给出"用卡片编辑器打开/删除"）

顺带修掉的 6 个真 bug：`saveBlock` 重复定义导致打字不进撤销栈、净化器吞掉提及 class、
导出对树/地图/时间线崩溃（3 个字段名写错）、图谱 160/400 口径不一致、列表面板 pointerdown 被画布吞掉、死代码清理。

### 13.6 第八轮：美术 / UX 收口（响应式 · 动效 · 空状态 · 无障碍 · 危险配色）

对着《VVD对比与改进方案.md》第四节"美术与体感"那张清单逐条做：

1. **响应式**（用户特别要求"不同屏幕大小都要好看"）：新增 `static/responsive.css`，按
   1440 / 1200 / 1024 / 900 / 640 五档收放——顶栏按钮图标化、侧栏在窄屏变抽屉、
   窄屏强制单栏、手机上弹窗变全屏、封面竖排、属性行改成上下布局、触摸目标 ≥36px；
   `tools/responsive_probe.py` 在 1920/1440/1280/1024/834/390 六个尺寸上验证**横向溢出 0px**。
2. **动效**：统一时长与曲线（200ms / `cubic-bezier(.22,1,.36,1)`），浮层淡入上浮、文档切换轻微上浮、
   列表错峰入场、按钮按下微缩；`prefers-reduced-motion` 时全部关闭。
3. **空状态与引导**：空工作区改成"图标 + 解释 + 四个入口"，文件夹/回收站/撤销历史/搜索各有对应空状态；
   新增**引导模板**（角色 / 地点 / 事件）问答式建卡，对齐 VVD 的 guided templates。
4. **无障碍**：`:focus-visible` 焦点环、skip link、`role="dialog" aria-modal`、`aria-live` 提示、
   图标按钮 `aria-label`、侧栏 `aria-expanded`。
5. **危险操作配色**：所有删除按钮统一红色（`is-danger` / `data-danger="1"`）+ 悬停淡红底。

顺带修掉一个**会让人点不动按钮**的真 bug：空状态被空面板盖住且旧样式给了 `pointer-events:none`，
首屏"用模板新建"根本点不到；另外块菜单的按钮没写 `background`，露出了浏览器默认灰底（buttonface）。

### 13.7 第九轮：账号协作、版本历史、历法与纪元分支

对着《VVD对比与改进方案.md》第二节"完全没有做到"的清单开工，第一批四项：

1. **账号体系**：`/register`（首个账号 = 所有者，之后要邀请码）、`/login`、`/logout`；
   写操作由 `world/middleware.py` 统一拦截（读保持公开，发布站点不受影响）；
   中间件白名单只有登录/注册与在线心跳。前端在只读时收起所有编辑入口并显示只读条。
2. **协作与多人**（轻量版）：在线状态心跳（20 秒窗口）+ 顶栏同伴头像 + 谁在这里；
   协作者管理（角色 / 移除 / 邀请码生成与删除，邀请码可复制成链接）。
3. **文档版本历史**：每次内容改动留快照（同作者 90 秒内合并，每文档上限 30 版），
   支持列表 / 预览 / 回滚，回滚前自动备份。
4. **月亮与完整历法 + Eras 世界版本分支**：月相按卫星周期推算（每晚 / 四相 / 只满月三种策略），
   `GET /api/world/calendars/<id>/month` 给月网格 + 当天事件；时间线面板新增**日历视图**；
   纪元从"时间轴上的色带"升级为"世界的版本"——每张卡可设纪元可见性（所有 / 只在 / 隐藏），
   切纪元时侧栏标灰不属于那一版的卡，纪元还能带自己的主题。

新增测试 16 个（权限 6 + 版本 2 + 历法 4 + 纪元 4），合计 **146 个**；新增探针
`tools/collab_probe.py`（游客只读 → 登录 → 邀请码 → 第二个用户 → 在线 → 版本回滚）与
`tools/calendar_era_probe.py`（月相/事件/翻月 + 纪元切换与标灰）。

### 13.8 第十轮：表格双向绑定 + 其余文档类型

5. **Table 双向绑定**：行 = 真卡片、列 = 该类型的属性。改单元格会写回卡片的属性值，改卡片别处也会同步；
   支持加/删行（软删除进回收站）、列选择、**CSV 导入导出**（按"名称"匹配已有行）。
6. **其余文档类型**：看板、画布、词典、待办清单、骰子、雷达图、环境音、语音备忘 / 媒体库、章节、链接嵌入
   共 11 种，全部可用（不是占位页）。它们共用 `documents/<id>/data` 这一个数据入口与
   `documents/<id>/media` 这个文件入口——**加新工具只要写前端一份 spec**，后端不用改。

顺带修的：顶栏按钮变多之后宽屏也会换行（图标化阈值提到 1680px）、表格类型选择器拉满整行、
以及清掉了点测在演示数据里留下的 5 张垃圾卡片。

### 13.9 第十一轮：块嵌套与嵌入、模糊提及、快捷键自定义、无障碍、移动端

7. **块嵌套与嵌入卡**：块带 `level`（Tab / ⇧Tab 缩进，最多两层）与 `collapsed`（折叠）；
   新增 `card`（嵌入一张卡片，带摘要与打开）与 `image`（地址或上传 + 图注）两类块。
8. **typo-tolerant 提及**：自动链接会吃掉复数与所有格（`Harrowdeeps` / `Harrowdeep's`）；
   打错一两个字母的名字（长度 ≥ 5、编辑距离 ≤ 2）会在提及选择器里以 `≈` 提示。
9. **快捷键自定义**：命令面板 →「快捷键一览」→「自定义快捷键…」，点「改」按新键位；
   存 `localStorage.ws:keymap`（只存改动项），可恢复默认。
10. **无障碍播报 + 键盘拖拽**：`aria-live` 播报撤销/重做/移动/缩进/评论/打开文档；
    块把手支持 `空格` 拾起 → `↑↓` 移动 → `空格` 放下 / `Esc` 取消。
    **顺带修掉一个真缺口**：块工具条原本是 `display: none`（只有 hover 才出现），
    键盘用户根本 Tab 不进去——改成"常驻布局 + 视觉淡出 + `:focus-within` 显形"。
11. **移动端**：底部导航（世界/搜索/新建/建议/我的）、PWA manifest 可加到主屏、
    左缘右滑拉出侧栏、长按 = 右键菜单、`env(safe-area-inset-*)` 适配刘海屏。

12. **编辑冲突保护**（补齐第 1 项的最后一块）：文档带修订号，写入时校验；
    对不上返回 409 + 服务端最新内容，界面提示并刷新而不是覆盖。顺带修掉两处因此暴露的真 bug：
    撤销/重做没有更新页面的修订号（导致撤销之后下一次编辑必然冲突）、冲突被当成未捕获异常抛到控制台。

### 13.10 第十二轮：`world/views.py` 事故与九批重建

一次工具脚本写错路径，`world/views.py` 被覆盖成 JS；项目当时没有 git，源码丢失，
应用靠覆盖前编译的 `views.pyc` 继续运行。处理与重建：

1. **先保命**：从 `__pycache__` 取出完好的 `.pyc`（`manage.py check` 干净、165 测试全过证明它是对的），
   放成 `world/views.pyc` 走无源码导入，服务不停；
2. **补版本控制**：`git init` 并**强制把 `views.pyc` 纳入版本库**（`.gitignore` 默认排除 `*.pyc`，
   而它当时是唯一逻辑副本）；同时把从字节码提取的结构清单 `docs/views_bytcode_inventory.md` 一起入库；
3. **九批重写**：`views.py` 先写"星号转发"骨架（未重写部分转发到 `views_legacy.pyc`），
   每批用真实实现覆盖同名函数、跑绿 165 个测试再提交 —— 全程应用不停机；
4. **收尾**：删掉转发与两个 `.pyc`，源码彻底回归。

重建过程中被测试抓出来的真实行为差异（都按字节码与测试对齐了）：`_table_config` 会猜类型、
表格行=卡片、`ensure_membership(user, world)` 的参数顺序、`InviteCode` 没有 `used_by`、
`backlinks` 的键是 `mentions`、`suggestions` 的开关是 `ai_enabled` 且候选名来自
`autolink.detect_new_names`、`calendar_month` 直接返回网格、经典接口只服务时间线文档、
CSV 导入按"名称"匹配、multipart 导入的字段名是 `files`。

### 13.11 第十三轮：wiki 浏览体验（筛选 chip / 全文搜索 / 只读净化）

1. **筛选 chip**：发布站点右上角加了按**类型 / 纪元**筛选的下拉（VVD 左上角那颗"传闻"的同位置），
   选项只列站点上真有的类型与纪元并显示数量；筛选状态跟着 URL（`?type=` / `?era=`），可以分享。
   纪元筛选的语义与工作区一致：文档挂在纪元下，或它的卡片在这一纪元里可见（`era_mode`）。
2. **全文搜索**：`/s/<slug>/search?q=` 搜名称、别名、正文、区块文字、属性值与**事件标题**，
   结果按文档聚合、给出上下文片段与命中的事件；只搜会出版的文档，草稿搜不到。
   首页与导航栏的搜索框都改指这里——之前那只是"按名字前端过滤"，游客会误以为是全文搜索。
3. **只读净化**：`can_edit` 为假时把写操作入口**整个隐藏**（撤销/重做、导入导出、新建、模板、上传底图、
   插入条、块菜单的加号…），而不是"点了才提示登录"；另有一层 `html[data-can-edit="0"]` 的 CSS 兜底。
   新增写按钮要同步加进 `WRITE_CONTROLS`。

### 13.12 第十四轮：纪元页 / 图谱页 / 搜索高亮分页 / 发布差异预览

1. **纪元页**：`/s/<slug>/era/<id>/` —— 用纪元主题色做标题块（跨度 + 说明），下面按时间列出**这个纪元的事件**
   （日期、标题、说明、关联卡片），再列"属于这个纪元的内容"；顶部胶囊切换纪元。首页新增「纪元」区块。
   判定沿用工作区语义：事件挂在这个纪元下，或卡片在这一纪元里可见（`era_mode`）。
2. **图谱页**：`graph` 类型加入站点收录类型，和地图 / 关系树一样以只读画布嵌入。
3. **搜索高亮与分页**：片段按命中处切成 `parts`（`hit=True`）交给模板加 `<mark>`，不用前端再算；
   每页 20 条、带上一页/下一页与页码，筛选条件在翻页时保留。
4. **发布差异预览**：`GET /api/world/publish/preview` 给出 **新增上线 / 内容更新 / 将从站点移除** 三组文档，
   分享与发布面板里直接列名字；发布前就知道这次会动什么（对齐 VVD 发布流程里"改动清单"的位置）。

### 13.13 第十五轮：画布交互 / 搜索排序 / 发布记录 / 纪元双入口

1. **画布交互**：嵌进站点的图谱（以及地图、关系树）里点节点，会 `postMessage` 给宿主页面并跳到那张卡的站点页面。
   只读访客的图谱**只画已发布且会出站点的类型**，避免"点了跳 404"。
   宿主监听原本误放在"时间线嵌入"的 IIFE 里（图谱页没有时间线 → 提前 return，消息永远收不到），已挪到脚本最前面。
2. **搜索排序与兜底**：命中字段加权（名字开头 100 / 名字 80 / 别名 60 / 正文 40 / 事件 35 / 其它 20），
   搜不到时给"你是不是想找"（`difflib` 近似 + 包含关系兜底）。
3. **发布记录**：新增 `PublishLog` 模型（迁移 `0008`），每次发布记下版本、范围、新增/更新/移除清单与发布人；
   发布面板列出最近几条，`GET /api/world/publish/log` 取 30 条。第一次发布把"从未上线"算作**新增**。
4. **纪元双入口**：筛选 chip 里纪元分成两组——「按纪元筛选网格」（`?era=`）与「按纪元浏览时间」（纪元页）；
   纪元页顶部也有"只看这个纪元的内容（网格）"的回链。

### 13.14 第十六轮：嵌入画布与站点统一设计语言

之前嵌进站点的地图 / 关系树 / 图谱是**深色工作区**，还带着"＋ 成员 / 选择 / 关系名 / ＋−"这些编辑控件，
和纸面风格的站点放一起非常突兀。这一轮按 `~/Desktop/Minimalist` 的方案统一：

1. **纸面主题**：嵌入时强制浅色并把工作区 token 换成站点那套（`body.is-embed.is-paper`），
   画布点阵、节点卡、连线、文字全部改成浅色可读；
2. **只读净化**：按按钮文字识别"改内容"的入口并隐藏（三个工具条通用），只留变体页签与缩放控件；
3. **自动适应视野**：等 iframe 尺寸稳定后分三次适应，读者一进来就看到整棵树；
4. **颜色**：节点左侧加分组色色条（无分组按世代轮换柔和色），只读视图也有颜色层次；
5. **自适应**：画布高度 `clamp(420px, 68vh, 760px)`，手机 `clamp(320px, 58vh, 520px)`，宽度 100%。

### 13.15 第十七轮：静态资源版本号与关系树排版

排查"改完还是旧行为"时发现：开发模式下 `/static/` 只发 `Last-Modified`、**没有 `Cache-Control`**，
浏览器启发式缓存会让旧 JS 继续生效。现在所有 JS/CSS 模板标签都带 `?v={{ static_version }}`
（`world/context.py` 用静态目录最新 mtime，`lru_cache` 缓存），一改 URL 就变。

关系树排版也按"像时间线那样透气"调整：嵌入时节点排布放大 1.3 倍、适应视野的边距加到 168px，
并且 **`fitTree()` 的包围盒改用同一个 1.3 系数**（之前只有渲染用了，导致算出的范围偏小、最后一行被裁）。

### 13.16 第十八轮：整站随机点击测试与三个修复

新增 `tools/site_monkey.py`：逐页随机点击 + Esc，量 3 秒 DOM 变更速率、页面导航、iframe 数量与报错。
它抓出四个问题（都已修）：

1. **关系树点成员会整树重绘**（看着像"页面刷新"，叠加自适应重算就是"样式短暂错乱"）——
   嵌入时改成 `postMessage` 让宿主跳到该成员的站点页面；没有关联卡片就给一条轻提示；
2. **只读模式的写请求抛未捕获异常**（控制台一片红）——给 `read-only` 错误打标记，
   全局 `unhandledrejection` 静音"只读 / 冲突"这类预期拒绝；
3. **经典编辑器 `setNodeText` 在节点未建好时崩**（`n.title` 为 undefined）——加空值保护（只加判断，不动几何）；
4. **站点缺 favicon** 导致每个会话一次 404 —— 内联 SVG 图标。

修完复跑：所有页面 **3 秒 DOM 变更 0–1、零报错、无多余 iframe**，关系树点击正确跳转。

### 13.17 第十九轮：关系树拖动导致空白

用户反馈"长按人物拖动，族谱区域变成一片空白"。根因是拖动处理里 **每次 `pointermove` 都调 `renderPanels()`**：
整块面板每帧重建，只读视图下表现为空白闪烁；`pointerup` 还会发一个写请求被只读拦下。

* 站点嵌入（只读）**直接不响应拖动**；
* 工作区里改成拖动时只改该节点的 `transform`，**松手才重绘 + 落库**（顺带解决卡顿）；
* `pointerup` 的写请求带上 `isReadonly` 容错，不再冒未捕获异常；
* `tools/site_monkey.py` 增加"只读拖动"回归：断言节点数不变、画布尺寸不小于 120px。

验证：只读拖动 节点 6→6、画布 1238×578；工作区拖动仍能落库（`x: -48 → 49`）。

### 13.18 第二十轮：只读画布的三处收尾

1. **点空白不再重绘**：原来是"取消选中 + `renderPanels()`"，没选中东西时也重画 →
   嵌入时看着像刷新。现在没选中就直接 return。
2. **嵌入默认"拖动空白 = 平移画布"**（`mode: 'pan'`），读者拖起来更顺手；平移本身也从
   "每帧 `renderPanels()`"改成直接改内层 `g` 的 `transform`，松手再对齐一次。
3. **画布底色**换成和时间线同一个奶油色 `#f7f3e4`（工具条仍是白卡片）。

`tools/site_monkey.py` 增加两条回归：**点空白**（节点数不变、SVG 长度变化 < 40）与
**拖空白**（内层 `g` 的 transform 必须变化）。

**顺带落地的、调研文档里点名的小设计**：

* 四向插入区块（`◧ ◨` 把区块放到左/右栏）+ 块级站点可见性开关（§4.1）；
* 发布态语义的雏形：文档的「在维基中隐藏」开关与 `hidden` 字段（§4.4）；
* 「零风险话术」：界面文案沿用「改动即时保存」「空状态给下一步动作」的写法（§12.4）；
* 世界主题四件套（标题字体 / 正文字体 / 主色 / 颗粒）做成可配置项并即时生效（§16.1）；
* **`@` 提及**：正文里输入 `@` 拉起卡片选择器，选中后插入名字；如果输入的写法和卡片名不同，
  顺手把它记成别名——对应 §4.2 的"链接一个被识别的名字会把它存成别名"（第二轮补上）；
* **发布状态机**按"最后修改时间 > 上次发布时刻"判定，所以改一个字就会显示 `stale`
  （对齐 §4.4 的 "Edited since you published"）。

**另外三个"低投入高观感"的复刻点**（都有本文的一手证据支撑）：

1. **发布状态机**（见 4.4 末）：把"这张卡有没有发布、站点是不是旧版"直接写在界面上，成本很低但显得可靠。
2. **四向插入区块 + `/` 菜单**（见 4.1）：VVD 的 "Add block → Above / Below / Left / Right" 是它区别于 Notion 类工具的小而巧的设计。
3. **面板双击复位 + 拖拽分割**（见 12.1）：一句提示文案（"Drag to change the split · double-click to reset"）就能显著降低新用户的操作焦虑。

---

## 14. 外部视角：第三方评价、社区与官方中文渠道

### 14.1 一个反直觉的结论：几乎没有可用的第三方评价

调研过程中系统性地尝试了各条外部渠道，结果是**几乎拿不到可用的一手用户评价**：

| 渠道 | 结果 |
| --- | --- |
| 评测/目录站 | seektool.ai 显示 "0 Reviews"；extrag.one 显示 "Aucun avis pour le moment"（暂无评价）；AlternativeTo / SaaSHub / Toolify 均 403 |
| 中文社区 | NGA 帖子 `tid=46469425` 在 bbs.nga.cn / ngabbs.com / nga.178.com **全部 403**（"游客不能直接访问"），内容完全不可得 |
| 视频 | YouTube 完全不可达（HTTP 000）；Reddit（含 .json API 与镜像）、Product Hunt 同样不可达 |
| 搜索引擎 | DuckDuckGo / Brave / Mojeek / Startpage 与 r.jina.ai 均失败（只有内置搜索可用） |
| Discord | 官方邀请链接存在（pricing 页给出 `discord.gg/TDXrKDNHdN`），但邀请页不可达 |

**而且目录站的数据不可信**，两条实例：

- extrag.one 标 Hobbyist **$5.99/mo、$59/yr**、"Free 20 images" —— 与官方 **$5.75 / $69 / 100 MB** 不符（过期或错误）。
- SoftRankings 写 "signup from **$129/mo**" —— $129 是**年付总价**，明显错误；该页还带 "Unclaimed / Submitted By" 字样，疑似 AI 生成内容。
- vvd 自己的对比页也声明："We did not score the products through hands-on testing."（未做实测评分）

> 因此本文**没有引用任何第三方评分**；价格与功能一律以官方页面与官方文案包为准。

### 14.2 官方中文渠道：中国是被认真对待的市场

- **Bilibili 官方账号 VVDWORLD**（`mid 3706998696708881`），教程系列（**无字幕，故无法引用口播内容**，只能引用标题与播放数据）：
  - `BV1nA7t6dE2Z`《【VVDWORLD】世界观创作工具教程第一集-界面与编辑器概览》（2026-06-24，79 秒，1543 播放）——正好是界面与编辑器总览，可惜无字幕可提取。
  - `BV1wfYy67EVb`：词典 / 造语工具（2026-09-14，1788 播放）。
  - `BV1hyHh6FE4A`：地图工具更新（2026-10-03，10949 播放，1003 赞）——**视频描述正面确认了**地形笔刷、随海拔流动的河流与湖泊、道路、3D 切换、昼夜行程路线、图片转 3D 地图。
- 付款与运营：**支付宝 / 微信支付**的一次性通行证（pass）与兑换码；社交渠道为抖音 / 小红书 / Bilibili / QQ（而非 YouTube）。
- 这说明其中国区运营是"本地化落地"而非简单翻译（连支付方式都换了）。

### 14.3 开发者文档站与招聘信号

- **docs.vvd.world 可公开访问**，确认提供 **REST API、MCP server、鉴权与 CLI**：安装 `install.sh | sh`，`vvd login` 使用 Workshop → Developer 页给出的一次性代码。→ 与 9.1 的 Workshop 生态互相印证。
- Hacker News 的 "Ask HN: Who is hiring?" 中出现两条 vvd 招聘（2026-05-01、2026-06-05，招 Design Engineer），自述 **"We're AI-native, but not trying to replace human creativity"** —— 注意这是"AI 辅助开发"，与 4.5 的产品内 AI 是两件事，不要混为一谈。

### 14.4 官方自己承认的短板（对我们是机会）

| 短板 | 官方原话/证据 |
| --- | --- |
| 性能历史欠账 | 2026-06 页面切换 "up to 11x faster"、大世界加载 "3x faster"；密集画布/关系树卡顿被反复修 |
| **不做手机版** | iPhone "isn't built yet"；Android 仅平板、仅横屏；手机只能看不能编辑 |
| 专业模板深度不足 | 官方对比页自述 tradeoff："You may still want dedicated software for specialist setting templates or drawing map artwork." |
| 变现抽成 | 平台抽 **10%** + 支付处理费（Shop 订单只对商品抽成，不对运费抽成） |
| 外部口碑薄 | 除官方渠道外几乎搜不到真实用户评测（见 14.1） |

### 14.5 一个容易被忽略的社交层：作者主页 `/@handle`

`robots.txt` 明确 `Allow: /@`，实测 `https://vvd.world/@zied` 是公开作者主页（**不含世界内容**）：显示名、handle、bio、**留言板（guestbook）**、虚拟宠物（"Pip"）、Spotify 嵌入、"shelf"（书架）。这说明 VVD 在"工具"之外还做了一层**创作者社交身份**。

---

## 15. 证据局限与后续可做的事

**没能验证的（诚实清单）**

1. **编辑器界面的实际布局**：虽然已通过会话取到编辑器路由 HTML 与 155 个 chunk（见 16.3），但界面是**纯客户端渲染**——HTML 只有外壳。所以"按钮长什么样、点下去发生什么"仍属推断；不过 chunk 已在本地，**任何具体工具的交互细节都可以继续从代码里挖**（例如把时间线文档打开后新加载的 chunk 抓下来，就能还原它画点阵/轴线/胶囊的真实数值）。另外，本文里的"截图"均来自官方演示视频截帧，不是登录后的截屏。
2. **AI 的实现细节**：AI 功能确实存在（见 4.5），但 50 次更新里**一次都没提 AI**——说明它要么是早期就有的能力、要么被有意低调处理。**具体模型供应商、请求单价、语音转录与图片内容搜索是否同一套 AI，均未获得**；只知道配额按"每月请求数 / token 数"计量，且官方声明"不用 AI 生成内容、不用用户内容训练"。
3. **配额细节**：Pro 的媒体上限在 pricing（Unlimited，fair use）与 i18n（10 GB）之间不一致；"Unlimited media subject to fair use policy" 无量化阈值。
4. **权限模型**：只确认到 admin/editor/viewer 三档与 Studio 的跨世界角色；**未见** 2FA、SSO、审计日志、页面级权限。
5. **Campaigns 现状**：2026-01-10 公告旧 Campaigns 留在 legacy 站点，此后 changelog 再无该模块的功能条目；新版文案里仍有 `openLegacy`。它是否已并入新版主线，**不确定**。
6. **技术细节**：地图是否瓦片化、3D 地图的数据格式、时间线自定义日历的闰年/星期规则、API 端点与速率限制、实时协作的传输端点（Supabase Realtime 还是自建 WS）等均未获得。
7. **价格数字**：来自页面文本的重排（源 HTML 把数字按位拆开渲染，如 `$ $ 5 5 . . 7 7 5 5`），已按位置还原为 $5.75 / $10.75 / $29.17，并与第三方研究独立核对一致；仍建议以线上页面复核。
8. **已发布站点的真实长相**：`robots.txt` 禁止抓 `/worlds/`、`/api/`、`/auth/`、`/c/`、`/invite/`、`/sandbox/`、`/login`、`/profile/`，而发布站点在 `<address>.vvd.world` 的 Cloudflare 泛解析之后**无法枚举**；所以"发布后的 wiki 到底长什么样"只有官方演示视频（`docs/vvd-shots/06`、`07`）可依据。
9. **无法获得用户口碑**：NGA 403、YouTube/Reddit/Product Hunt 不可达、评测站 0 评价（见 14.1）。**本文没有任何真实用户反馈**，所有"好用/难用"的判断都来自官方自述与 changelog 的修复清单。
10. **覆盖不均是本文的已知短板**：`campaign`（2294 条）与 `shop`/`shopSite`（合计 1825 条）这两个最大命名空间只做了抽样（本文对跑团只写了一节、对电商只写了一节），如果要往这两个方向复刻，需要单独深挖。
11. **平台矛盾未解**：changelog 说 Windows 客户端已上线并自更新，而下载页文案里仍有 Windows 登录"does not work there yet"的痕迹——以官方页面为准也难判定。
12. **Workshop 的审核与分成**：知道有"公开上架需 review"、Free 不能保存、Pro 起可 "Author & sell"，但**审核标准、作者能否分成、沙箱技术**均未知。

**如果要把这份文档升级为"可实测版"，需要**

- 一个 VVD 账号（Free 即可，可看编辑器与免费档限额）；
- 或者由你提供编辑器截图/录屏（尤其是：左侧栏右键菜单、卡片属性面板、时间轴日历设置、地图工具条、分享/发布面板）。
- 另外：`https://app.vvd.world/locales/zh.json` 是一份**公开的官方中文文案包**，做界面时可以直接查官方用词，建议放进项目的参考目录。

---

## 16. 登录后实测补充（2026-10-06 追加）

> 这一节是**在你完成登录之后**补的：我借本机 vvd 桌面端的会话，只读地取了编辑器页面、官方中文文案包与数据库表结构。
> **凭据处理**：会话只存在于 `/tmp/vvd_cookies.txt`、`/tmp/vvd_session.json`，**没有写进仓库或本文档**；抓取内容里也没有你的账号信息。若你介意，可在 vvd 设置里「登出所有设备」使该会话失效。
> **一个路由事实**：`/worlds/827442/editor` 这个 id 在登录后会被弹回 `/worlds`（不是你的世界）；**你的世界短链是 `/worlds/a045ca`**，`/worlds/a045ca/editor` 才是编辑器入口。

### 16.1 世界级配置字段（`worlds` 表，实测）

编辑器路由的 RSC payload 直接给出了世界记录，字段如下（**这就是"世界主题"的真实数据结构**）：

| 字段 | 你的世界（The Grand Alchemy）取值 | 说明 |
| --- | --- | --- |
| `id` / `slug` | `9ff50b48-…` / `a045ca` | slug 是 6 位十六进制，路由用 `/worlds/a045ca` |
| `theme_config.mode` | `dark` | 世界主题明暗 |
| `theme_config.grain` | `22` | **颗粒噪声强度**（这个数值解释了深色界面上的质感） |
| `theme_config.headingFont` | **`EB Garamond`** | 标题字体 → 截图里那种**斜体衬线大标题**的来源 |
| `theme_config.bodyFont` | `DM Sans` | 正文字体 |
| `theme_config.primaryColor` | `#3f3416` | 世界主色（暗橄榄/棕金） |
| `theme_config.background.url` | `https://mediacontent.vvd.world/images/…webp` | 世界背景图（存在世界媒体域） |
| `ai_enabled` | `true` | **世界级 AI 开关**（对应 4.5） |
| `auto_link_enabled` | `true` | **名字自动识别/自动互链开关** |
| `link_entrance_enabled` | `true` | 链接入口相关开关 |
| `genres` | `["dark-fantasy"]` | 世界题材标签（用于发现/推荐） |
| `use_cases` | `[]` | 用途标签（写作/跑团等） |
| `parent_world_id` | `null` | 世界复制/派生关系 |
| `role` | `owner` | 当前用户在该世界的角色 |

> 复刻提示：如果要把界面做到"像它"，至少要把 **headingFont / bodyFont / primaryColor / grain / mode** 五个量做成可配置项，而不是写死——VVD 的观感差异几乎全部来自这五个值。

### 16.2 数据模型：`documents` 表的真实字段（实测）

所有工具文档（卡片、地图、时间线、画布、关系树…）**共用一张 `documents` 表**，靠 `document_type` + `tool_id` 区分——这是它"二十种工具"能长在同一套编辑器上的原因：

| 分组 | 字段 |
| --- | --- |
| 身份 | `id`、`name`、`slug`、`document_type`、`tool_id`、`tool_version` |
| 类型系统 | `entity_type_id`、`entity_type_key`、`aliases` |
| 侧栏树 | `parent_id`、`root_doc_id`、`position` |
| 纪元 | `era_id`、**`era_ids`**（可属于多个纪元 → 对应"纪元/时代"分层） |
| 协作审计 | `created_by`、`updated_by`、`created_at`、`updated_at`、`materialized_at` |
| 发布 | `is_published`、`published_slug`、`is_viewable`、`listed` |
| 可见性/剧透 | `hidden`、`hidden_at`、`reveal_condition`（对应"分级揭示/剧透"设计） |
| 派生 | `forked_from_id`（世界复制、战役覆写的底层） |
| 呈现 | `avatar_media_id`、`cover_snapshot`、`preview`、`settings` |
| 软删除 | `deleted_at`（回收站/存档） |
| 变体 | `variant_*`（关系树的 variant） |

**从 chunk 里读到的相关表**（说明模块边界）：

`worlds`、`world_projects`、`world_members`、`world_media`、`world_sites`、`world_site_instances`、`world_suggestions(_open)`、`world_project_hidden`、`world_work_profile`、`documents`、`document_data`、`document_word_counts`、`entity_type_data`、`eras`、`tabs`、`comments`/`comment_reads`、`reactions`、`notifications`、`tools`、`installed_tools`、`profiles`、`team_members`、`radio_stations`、`platform_jobs`、`dev_sessions`、`intention_context`。

> 读法：`documents` + `document_data`（内容 blob）+ `entity_type_data`（类型与属性定义）三张表撑起了整个"卡片/工具"体系；`tools` / `installed_tools` 撑起 Workshop（每个世界"安装"了哪些工具）。

### 16.3 编辑器实测观察

- 编辑器是**标签页式外壳**：顶栏为「世界 / 维基 / 新地图 / 新建 Timeline / 新标签页 / 打开标签页 6 / 反馈」，说明 Tab 上限体验与"新建 Timeline"是一等快捷入口。
- **界面语言跟随账号 locale**（你的界面是中文），所以中文文案包（16.4）就是实际界面上会看到的词。
- 编辑器 HTML 本身只有约 262 KB 的壳，真正的界面全部由 **155 个 chunk（13 MB）** 在客户端渲染——这也解释了为什么直接抓 HTML 看不到功能。（chunk 已存 `.vvd_research/editor_chunks/`，可继续深挖某个工具的实现。）

### 16.4 官方中文用词（复刻时直接照抄）

| 中文 | 对应英文 | 出处 |
| --- | --- | --- |
| 时间线 / 线视图 / 日历视图 | Timeline / Line view / Calendar view | `timeline.*` |
| 事件 / 时代·纪元 / 日历预设 | Event / Age·Era / Calendar presets | `timeline.editor`、`timeline.settings` |
| 事件精度：年 / 月 / 日 / 时间 | Year / Month / Day / Time | `timeline.settings` |
| 时间线范围、开放过去、0年、第一纪元之前 | Range / Open past / Year 0 / Before first era | `timeline.settings` |
| 卫星、满月于、显示于（每晚 / 四分之一 / 仅满月） | Moons / Full on / Shown on | `timeline.settings.moons*` |
| 关联卡片、特色卡片、卡片类型 | Linked card / Featured card / Card types | `timeline.editor` |
| 卡片 / 类型 / 属性 / 区块 | Card / Type / Property / Block | `editor.*` |
| 面板、在独立标签页中打开、固定到栏、拖动以改变分割 · 双击以重置 | Panel / Open in tab / Pin to bar / resize hint | `editor.panel` |
| 文档树：新建文件夹、置顶、在维基中隐藏、设置时代… | Sidebar tree | `editor.sidebarTree` |
| 区块操作：上移/左移/右移/下移区块、评论此区块、从网站中隐藏 | Block controls | `editor.blockControls` |
| 斜杠菜单：段落、标题 1-3、项目符号列表、编号列表、块引用、引用、分隔线、表格、切换列表 | Slash menu basic blocks | `editor.slash` |
| 提示框：备注 / 问题 / 信息 | Note / Question / Info | `editor.slash.callout*` |

⚠️ **一个术语坑**：同一个英文 "era/age" 在中文包里被译成两套——`timeline.settings` 用**纪元**，`timeline.editor` 用**时代**（例如「添加事件 / 添加时代」与「纪元长度（年）」并存）。**我们自己的产品必须统一**，建议统一用「纪元」（与 `settings` 一致）。

### 16.5 新增证据文件

| 文件 | 内容 |
| --- | --- |
| `.vvd_research/editor_auth.html` | 登录后抓到的编辑器路由 HTML（含世界配置 RSC payload） |
| `.vvd_research/editor_chunks/`（155 个，13 MB） | 编辑器专属 JS，可继续深挖任一工具的实现 |
| `.vvd_research/editor_chunks.txt` | chunk 清单 |
| `.vvd_research/i18n_zh.json` | **新版应用官方中文文案包**（142 ns / 17536 条） |

---

## 附录 A：关键术语对照表

| 中文 | 官方英文 | 备注 |
| --- | --- | --- |
| 世界 | World | 顶层容器，可发布 |
| 纪元 | Era | 世界的时间分层 |
| 项目/工作区 | Project / Workspace | 绑定纪元的一份文档集合 |
| 文档 | Document | 计费单位（文件夹不算） |
| 卡片 | Card | 数据原子 |
| 类型 / 子类型 | Type / Subtype | 可嵌套、可拖拽排序 |
| 属性 | Property | Text/Select/Number/Date/Reference/Calculate |
| 区块 | Block | 卡片正文的组成单元 |
| 面板 / 标签页 | Panel / Tab | 可并排、可 pin |
| 时间轴 | Timeline | 两种视图：Line / Calendar |
| 事件 / 纪元 | Event / Age | 时间轴上的两类对象 |
| 日历预设 | Calendar presets | 跨时间轴复用 |
| 地图 | Map（新引擎 atlas）/ Classic map | 2026-10-01 后两者并存 |
| 关系树 | Relation tree | 原 family tree v2 |
| 世界图谱 | World Graph | 全局连接图 |
| 画布 / 白板 | Canvas（分类名 Boards） | 无限画布 |
| 词典/造语 | Dictionary | 含字形与字体映射 |
| 首页/写作 | Quill | 写作 + 出版（EPUB/PDF/DOCX） |
| 维基/站点 | Wiki / Site | 可发布、可加密码、可绑域名 |
| 工坊 | Workshop | 用户自建工具/应用的平台 |
| 路径 | Paths | 引导式上手路径 + 徽章 |
| 成员 / 关注者 | Members / Followers | 变现与社区 |
| 权限层 | canon / module / override / extend | 世界 / 模组 / 本地覆写 / 本地扩展 |

## 附录 B：本文引用的原始素材清单

| 文件 | 内容 |
| --- | --- |
| `.vvd_research/changelog.json` | 50 次更新的结构化数据（含官方 area 分类） |
| `.vvd_research/i18n_en.json` | 新版应用 UI 文案表（138 命名空间，约 1.7 万条） |
| `.vvd_research/i18n_zh.json` | **新版应用官方中文文案包**（142 命名空间 / 17536 条；来自 `/i18n/zh.<hash>.json`） |
| `.vvd_research/editor_auth.html` | **登录后**抓到的编辑器路由 HTML（含世界配置 RSC payload） |
| `.vvd_research/editor_chunks/`（155 个，13 MB） | 编辑器专属 JS chunk，可继续深挖任一工具的实现 |
| `.vvd_research/locales_zh.json` | **官方中文**文案表（51 命名空间，5864 条；来自 `app.vvd.world/locales/zh.json`） |
| `.vvd_research/sitemap_full.xml` | 官方 sitemap（44 条 URL，含 35 个工具页） |
| `.vvd_research/tools/tools.json` + `tools/*.html` | 35 个公开工具页的抓取与解析结果（官方 tagline / 采用量 / 版本 / 作者） |
| `.vvd_research/whats-new.txt` / `.html` | changelog 页面全文与原始 payload |
| `.vvd_research/pricing.txt` / `.html` | 定价与限额 |
| `.vvd_research/worldbuilding-tools.txt` | 官方竞品对比口径 |
| `.vvd_research/app_root.html` | app 外壳（含中文 locale 文案） |
| `.vvd_research/media/` | 演示视频与截帧（organize/map/collab1/wikilanding） |
| `.vvd_research/notes/features_changelog.md` | changelog 全量梳理（含 25–40 条原文摘录） |
| `.vvd_research/notes/features_i18n.md` | i18n 全量梳理 |
| `.vvd_research/notes/web_research.md` | 第三方来源与口碑 |
| `.vvd_research/notes/app_tech.md` | 技术栈、路由与可访问性探测 |
| `docs/vvd-shots/` | 本文使用的界面截帧（7 张） |
