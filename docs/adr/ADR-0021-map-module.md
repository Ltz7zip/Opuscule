# ADR-0021：地图作为独立 app/feature

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0007（模块边界）、ADR-0014（页面边界）、P2.1

## 背景

地图是原提案中的未来工具。若把坐标塞进 Card body 或工作区组件，会污染内容模型和编辑器边界，
也让地图无法独立 lazy/公开/权限控制。需要一个小而可扩展的边界。

## 决策

1. 新建 `apps.maps`，独立 `MapMarker` 模型：world、card(optional)、label、kind、x/y、created_by。
2. 坐标存 0..1 归一化浮点；卡片是可选的语义关联，不把坐标写进 Tiptap JSON。
3. 地图读接口复用 `get_world_for_read`；写接口复用 `get_world_for_write`（owner/editor）。
4. 前端 `/w/<world>/map` 是独立 lazy 页面；公开只读，editor/owner 可写；不加载 Tiptap。
5. MVP 只做抽象网格画布，不做瓦片/缩放/背景图；不把 MVP 冒充完整地图。
6. 地图不进 SSR/sitemap；未来可独立扩展。

## 后果

- 地图数据/权限/路由独立，后续可接瓦片、背景图、图层。
- MapMarker 与 Card 关联可选；卡片删除后 marker 保留（SET_NULL），地图不会悬空外键。
- 地图是第二个 feature 面，证明 public shell + lazy chunk 可扩展。
- MVP 没有拖动 E2E、编辑表单、地图 SSR；后续需补。

## 验证

- 47 tests：公开只读、editor 增改删、私有/outsider 拒绝、坐标/跨世界 card 校验。
- 浏览器创建/删除 marker；lazy chunk 不加载 Workspace。
