# Notion 结构化参照采样

> 目的：在动手复刻前，先把 Notion 的**信息架构 / 结构词汇 / 视觉尺度 / 交互行为**固化成可查阅的参照物。
> 这份东西是**参照**，不是源码，也不是拿来直接抄的代码。

## 采样信息

| 项 | 值 |
| --- | --- |
| 采样时间 | 2026-10-13 |
| 采样方式 | TRAE 内置浏览器（已登录状态），只读抓取 |
| 采样对象 | `app.notion.com` 工作区 `La vi.的工作空间` |
| 采样页面 | `从电脑桌面端开始吧！`（引导/教程页）、`Monthly Budget`（含内联数据库）、`Weekly To-do List` |
| 采样视口 | 约 968 × 750 CSS px（窄视口；宽屏下正文列会更宽） |
| 是否产生改动 | 无。未修改 Notion 工作区内容，未修改本项目代码 |

## 目录

| 文件 | 内容 |
| --- | --- |
| [dom-skeleton.md](./dom-skeleton.md) | DOM 骨架树 + 语义类名词汇表 + 数据模型结论 |
| [style-tokens.md](./style-tokens.md) | 关键元素 computed style 采样表 |
| [design-tokens.md](./design-tokens.md) | **浅色/深色双主题 token 对齐表 + 替换方案（A 方案 · 默认深色）** |
| [interactions.md](./interactions.md) | 交互行为清单（附对应 DOM 钩子证据） |
| [_raw-voltagent-notion-marketing.md](./_raw-voltagent-notion-marketing.md) | 归档：VoltAgent 的 Notion 分析 —— **官网营销面，不是产品面**，勿用于产品 token |
| [shots/](./shots) | 参照截图 |

## 截图索引

| 文件 | 内容 |
| --- | --- |
| `shots/guide-fullpage.png` | 引导页整页（标题/待办/折叠块/行内 code） |
| `shots/budget-fullpage.png` | 数据库页整页（深色主题） |
| `shots/budget-light-fullpage.png` | 数据库页整页（浅色主题） |
| `shots/budget-database-view.jpg` | 数据库页视口（封面 + 两张带 SUM 的表格） |
| `shots/slash-menu.jpg` | `/` 斜杠命令菜单展开态 |
| `shots/search-palette.jpg` | `⌘K` 搜索 / 提问面板 |

## 核心结论速览

1. **一切皆块**：页面正文是 `notion-page-content`，里面每个块都是 `notion-selectable` + `notion-<类型>-block`。已观测到的块类型有 `text-block`、`to_do-block`、`toggle-block`、`column_list-block`、`column-block`、`collection_view-block`、`page-block`。
2. **数据库不是模块，是块的一种**：`collection_view-block` 和 `text-block` 是同级兄弟。
3. **"行即页面"在 DOM 层被证实**：表格每一行同时带着 `notion-page-block` 和 `notion-collection-item` 两个类——行本身就是一个页面，可以点进去。
4. **视图是数据库的一层壳**：`collection_view-block` → `collection-view-body` → `table-view` → `table-view-row` / `table-view-cell`。换视图就是换这层壳，数据不动。
5. **样式不可复制**：类名绝大多数是原子化哈希（`x1lliihq`、`x1heor9g`…），只有 `notion-*` 这层语义钩子可读。**抄结构，不抄样式。**
6. **数据来自私有 API**：`/api/v3/etClient`、`saveTransactionsFanout`、`syncRecordValuesSpaceInitial`，带登录态、未公开、会变。不能作为数据源。

## 边界与注意事项

- **法律**：Notion 服务条款禁止抓取与复制其代码/样式，本采样仅用于学习其信息架构，不得照搬其代码、样式与资源。
- **完整性**：这是"某一瞬间的渲染快照"，只覆盖我实际操作过的路径（侧边栏、正文编辑区、表格视图、斜杠菜单、搜索）。看板/日历/画廊/时间线视图、协作、版本历史等未采样。
- **视口相关**：宽度/高度类数值强依赖采样视口，不能当固定规格用；字号、颜色、圆角相对稳定。
- **方法提醒**：`browser_evaluate` 在本环境只接受**纯表达式**脚本，带块语句（`{ ... }`）的函数体会静默返回 `undefined`。后续再采样要注意这一点。
