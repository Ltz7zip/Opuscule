# ADR-0023：世界时间线作为独立 app

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0007（模块边界）、ADR-0021（地图 app）、P4.1

## 背景

时间线是世界观的自然 feature，但若把年份塞进 Tiptap/Card 字段，会污染内容模型，
也无法独立 lazy/公开/权限控制。

## 决策

1. 新建 `apps.timelines` + `TimelineEntry`：world、card(optional)、year、era、title、description、created_by。
2. 卡片是可选语义关联，不在 Card body 里塞年份。
3. 读复用 `get_world_for_read`；写复用 `get_world_for_write`。
4. `/w/<world>/timeline` 是独立 lazy 页面；公开只读，editor/owner 可写。
5. MVP 只做创建/删除/按年排序；编辑/多时间线/纪元区间后续。
6. 不纳入 SSR/sitemap；未来可独立扩展。

## 后果

- 时间线数据/权限/路由独立，后续可接纪元、分支时间线、可视化。
- 与地图一样，公开 shell + lazy chunk 可扩展；Workspace 仍不加载这些页面。
- 卡片删除后时间线条目保留（SET_NULL），不会悬空。
- MVP 无编辑 UI、无自动化 E2E。

## 验证

- 61 tests：公开只读、editor 增改删、私有/outsider 拒绝、跨世界卡校验。
- 浏览器创建/删除；lazy chunk 不加载 Tiptap。
