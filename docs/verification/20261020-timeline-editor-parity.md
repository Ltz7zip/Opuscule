# P4.14 / P5.3 验证记录：时间线视觉 & 编辑器核心对等

- Date: 2026-10-20
- Scope: TL canvas + editor core vs old site references
- Old refs: `timeline-standalone.html`, `frontend/editor/src/main.jsx`, old screenshots

## 已验证

### 时间线

- 旧站横向画布的核心结构已回归：
  - 水平轴线 + 年份 ticks + 事件点
  - 事件 pill 上下错层 + stem
  - 纪元色带（潮汐历/雾历）+ 事件数 + 点击筛选
  - hover 年份 + `+`；点击轴线/`+` 预填年份
  - 1.5× 缩放生效；拖动平移；适应重置
- 浏览器：5 个事件、2 条纪元带；点击“雾港建镇”表单回填 544/潮汐历；点击轴线回填 556。
- demo 数据：主时间线 5 条精选事件 + 航海志 1 条（多时间线演示）。
- P4.15 真实 Era 区间：`Era` API 返回 480–528 潮汐历（3 事件）、528–570 雾历（2 事件）；画布色带宽度按真实区间；owner “管理纪元”可新增/删除（测试历 570–580 已删除）。

### 编辑器

- Slash 菜单 `/图片` 可打开；点击后插入 `imageBlock`，DOM 为 `<figure class="tiptap-image">`。
- 嵌入卡片菜单打开选择器（当前世界 6 张卡），选择后插入 `cardEmbed`，链接 `/w/wuhai/wiki/world-overview`。
- 选区浮条：三击段落后出现 9 个格式按钮。
- 块级 `+` 可见，点击后顶层块数量 5→6。
- 六点拖拽手柄：官方 DragHandle `nested: true`；拖拽到“当前焦点”标题上，块顺序由 H1/P/H2/UL/P 变为 H1/H2/P/UL/P；嵌套 listItem hover 也显示手柄；测试后已恢复。
- DragHandle 懒加载独立 chunk `EditorDragHandle` 151.77 kB / 48.64 kB gzip；Workspace 保持 134.7 kB。
- 拖拽后曾出现 `no position before top-level node`，已加 depth guard；复测 console 0 errors。
- 选区浮条补下划线与链接按钮。
- 缩进块：三击段落后点浮条“缩进块”，生成 `.tiptap-nested` 容器。
- 折叠块：`/折叠` → 标题提示 → 生成 `<details class="tiptap-toggle"><summary>折叠标题</summary>`。
- 测试后 demo 卡片恢复，无自定义节点残留。
- 自定义节点写入 `body_json` 并经自动保存；公开 `RichText` 新增对应渲染。
- 测试后 demo 卡片已恢复，未保留测试图片/嵌入块。

## 与旧站仍未对等

- 任意嵌套/toggle/table/媒体上传/mention/评论/协作。
- 旧站 20 种工具与面板系统。
- 时间线真实 Era 区间/月刻度/拖拽调整时段；当前色带是事件聚合。
- 无自动 E2E；本轮手工 Playwright。

## 测试/构建

- 94 backend tests OK（新增 CardImage 3 + Era 2 + 评论 4 + 多时间线 2 + 月份 1 + 通知 1 + 外观 1）。
- frontend `tsc --noEmit` + Vite build
- budget：entry 73.0 / Workspace 165.4 / CSS 13.3 kB gzip（Workspace 上限已按用户要求调到 175）
- 旧站 HTML 仅作为只读参照；未复制旧站源文件到新项目（`old-timeline-reference.html` 仅截图证据副本，建议不提交）。

## 结论

- 置信度：**B**。时间线视觉结构和编辑器核心块动作有浏览器证据；完整 BlockNote/旧站对等仍是后续工作，不宣称完成。
