# P4.14 / P5.3：时间线视觉 & 编辑器核心对等（旧站回归）

- Date: 2026-10-20
- Status: implemented; parity gaps explicit
- Trigger: 用户指出新站时间线与旧站效果完全不同，且旧 BlockNote 编辑器功能未实现
- Old references:
  - `/Users/ltz2024/PycharmProjects/worldbuilding_timeline/timeline-standalone.html`（旧 `/legacy` 横向时间线）
  - `/Users/ltz2024/PycharmProjects/worldbuilding_timeline/frontend/editor/src/main.jsx`（旧 BlockNote 孤岛）
  - `.shots/legacy-index__1280.png`、`.shots/qa/p2-block-tools.png`

## 问题

1. 新 TimelinePage 是纵向文章列表 + 右侧表单，旧站是横向轴线、事件点、纪元色带、缩放/平移画布；视觉效果不同。
2. CardEditor 只启用 Tiptap StarterKit：没有斜杠菜单、选区格式条、块级 `+`、提示框/图片/书签/嵌入卡等 BlockNote 块；用户无法完成旧站的核心写作动作。

## 本次交付

### 时间线

- `TimelineCanvas`：横向轴线、tick、事件 pill、上下错层、stem、时间范围、纪元色带。
- 指针 hover 显示年份与 `+`，点击轴线/`+` 预填表单年份。
- 拖动平移、1–3× 缩放、适应画布；纪元色带点击筛选。
- 表单下移为全宽编辑区；保留创建/编辑/删除。
- 5 条 demo 事件（潮汐历/雾历）使视觉可验收。
- P4.15：`Era` 独立区间模型/API（480–528 潮汐历、528–570 雾历），画布色带使用真实区间；owner 可在时间线页管理纪元。

### 编辑器

- Slash 菜单：文本、H1–H3、无序/有序列表、引用、提示框、代码块、分隔线、图片、书签、嵌入卡片。
- 选区浮条：加粗/斜体/删除线/行内代码/H1/H2/列表/引用。
- 块级 `+`：在当前块后插入段落。
- 六点拖拽手柄：官方 `@tiptap/extension-drag-handle` + React 封装，`nested: true`；懒加载独立 chunk，自动进入保存。
- 选区浮条补下划线与链接。
- 缩进块 `nestedBlock`（wrapIn/lift）与折叠块 `toggleBlock`（details/summary）。
- 自定义 Tiptap 节点：`callout`、`imageBlock`（上传/URL）、`bookmarkBlock`、`cardEmbed`。
- `CardImage` + `POST/GET/DELETE .../cards/<pk>/images/`（4MB，PNG/JPEG/WebP，magic 校验）。
- 媒体库：已上传图片列表 + 选择插入；输入 URL 自动链接（Tiptap Link 内置 autolink）。
- P5.4 评论 MVP：`CardComment` + GET/POST/PATCH/DELETE，选中文字可带 quote；侧栏可发布/回复/解决/删除；尚未做块级锚点/通知。
- 图片轮播：`galleryBlock`（原子块，多图横向 scroll-snap），slash 多行 URL 插入；公开 RichText 渲染。
- 评论回复：一层 parent。
- 官方 DragHandle 依赖已安装（3.32.0）；官方 TableKit/表格扩展已安装；未采用社区 `@editorcn/block-editor`，避免未知依赖面。
- 表格：`/表格` 插入 3×3 表头表格，底部表格栏支持增删行列/表头/删表；公开 RichText 渲染。
- 多时间线：`Timeline` 模型/API、条目 FK、时间线切换器/新建；demo 主时间线 5 事件 + 航海志 1 事件。
- 月份：条目可选 `month`，画布事件标签 `YYYY-MM`；短跨度（≤12 年）缩放时显示月份 tick。
- 官方 `@tiptap/extension-mention` + `@tiptap/suggestion`：输入 `@` 选择世界卡片，插入可持久化 mention，公开页链接到 Wiki。
- Mention 自动识别：输入 `@fog-harbor `（slug）或卡片标题后自动转 mention；未知 token 保持文本。
- 嵌入卡片选择器读取当前世界 cards；公开 `RichText` 渲染这些节点。
- 自动保存/⌘S/只读逻辑保持。

## 明确未对等（旧 BlockNote/旧站能力）

- 拖拽建立任意嵌套（当前是 wrapIn 一层缩进块）。
- 图片轮播/媒体库；当前单图上传已可用。
- 任意文本自动识别（当前按 slug/标题精确匹配）、自动链接、卡片内联预览/collection 内嵌数据库。
- 块级锚点评论、通知、块级可见性、撤销历史面板、协作/CRDT。
- 纪元区间管理（当前色带由事件 era 聚合，不是旧 Era 独立区间表）；月份/日历刻度。
- 旧站 20 种工具、面板/分屏、属性面板。

## 验收证据

- `docs/verification/20261020-timeline-editor-parity.md`
- 截图 `p29`–`p33`
