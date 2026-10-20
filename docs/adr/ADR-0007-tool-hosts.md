# ADR-0007: 工具宿主与 11/11 对等矩阵

- Status: **Accepted**（宿主模型、视图行默认、11/11 L3 已定；降级需书面签字）
- Date: 2026-10-20
- Deciders: 项目 owner（五项决策）、后端架构 / 前端 / UX / UI / 数据库 / 工程效率评审
- Related: 设计稿 §0.1、§6.2、§7.1、§8.6；ADR-0008、ADR-0012
- Supersedes: 无（旧站没有对应 ADR）

## Context

旧站把 11 种工具都放在 `Document(document_type=...)` 里，但它们的真实数据形态并不相同：

- `table` 的每一行本来就是一张 Card（单元格是 PropertyValue）；`board` / `radar` 是属性视图。
- `canvas` / `soundscape` 是独立的场景 payload；`media` 是资产；`embed` / `dice` 是正文微件。
- 旧站样本有 **971 篇工具文档**，其中 **5 篇活文档**（table/board/radar/todo/dictionary 各 1 篇，均为已发布的“外观巡检”空壳），**966 篇软删**；canvas/soundscape/media/embed/dice/chapter 六类没有活文档。
- 旧站的 `settings` 整包 merge、`map_data` 大字段、工具与 Card 混在同一张表，是 `Document` 万能容器的来源。

如果为 11 种工具各建一个 `ToolDoc`，会把同一个万能容器原样搬回来，并让 `LinkIndex`、`Revision`、`SearchDoc`、`Publish` 四个横切面全部开分支。用户已决定“重建 11 种”，但重建不等于 11 个独立数据模型。

## Decision

### D1. 五类宿主，而不是 11 个 ToolDoc

| 工具 | 宿主 | 数据落点 | 说明 |
|---|---|---|---|
| table / board / radar / todo / dictionary | **视图宿主** | `CollectionView` + Card/PropertyValue | 视图只存筛选、排序、分组、列配置；不另建 5 张工具表 |
| chapter | **卡片宿主** | `Card(kind=content)` + Collection 顺序 | 长文仍是 Tiptap 正文；不另造 Chapter 表 |
| canvas / soundscape | **工具页宿主** | `Card(kind=tool)` + `CardTool.state_json` + `ToolRevision` | 大 payload 不进 Card.body；单独限流与快照 |
| media | **资产宿主** | `Asset` + 媒体库页 | 对象存储 + 哈希去重 + 引用计数 |
| embed / dice | **块宿主** | Tiptap `bookmark` / `embed` / `dice` 节点 | 整篇旧文档迁移为“一张单块 Card”，不建独立文档 |

`ToolKind` 注册表记录 `key`、`host(view|card|page|block|asset)`、`schema_json`、`version`、`is_public`。新增工具先注册，不允许绕过宿主模型直接建表。

### D2. CollectionView 与 CardTool 的边界

- `CollectionView(collection_id, kind, name, config_json, position, is_default)` 只属于视图工具；视图没有独立修订，数据仍在 Card/PropertyValue。
- `CardTool(card_id unique, tool_key, schema_version, state_json, state_bytes)` 只属于页面工具；`Card.kind=tool` 时 `body_json` 必须为空。
- `ToolRevision` 独立于 `CardRevision`；页面工具用快照 + 操作日志，不把 100 KB canvas 塞进块级 diff。
- `Asset` 只存资产元数据；正文只存 `asset_id + alt`，不存二进制。

### D3. 视图行：默认 Card + `is_auxiliary`

旧 table 的行本来就是 Card；为了保留链接、属性、回链与修订，默认继续用 Card：

- `Card.is_auxiliary = true` 表示该卡是视图行/表格行，**默认不进 Collection 树、不进公开搜索、不出现在公开站**。
- 视图查询必须显式带 `is_auxiliary` 过滤；公开页与搜索使用同一过滤。
- 若 10k 行表格或 500 张看板卡的基准失败，才允许为该工具单独切换为 `ToolItem`；切换必须新开 ADR，禁止同一工具混用两种行模型。
- 选择理由：旧数据已经证明 table 行是 Card；新建 `ToolItem` 会让链接、回链、修订、权限全部再写一遍。`is_auxiliary` 的代价是 Card 行数增长，需要用复合索引、键集分页和 `is_auxiliary=false` 的部分索引控制。

### D4. P3 对等：默认 11/11 L3，降级必须显式记录

对等刻度：

- **L1**：数据/配置不丢；有只读页或导出；不可编辑。
- **L2**：最小可编辑 + 保存 + 权限；不承诺旧站全部交互。
- **L3**：逐工具验收清单全部通过：公开只读、编辑/保存、权限、搜索、修订、空态/冲突、移动端降级。

P3 的默认目标是 **11/11 全部 L3**。若某工具要降为 L1/L2，必须由用户在本 ADR 的“Open questions”中明确签署；降级项在 parity matrix 中记为已知差距，不能宣称“P3 功能对等已完成”。冷门工具可以排在 P3 后段，但不能用“归档”替代重建。

### D5. 公开面

所有 11 种工具都必须有只读 SSR 页面或只读块渲染；公开页不加载工作区工具包。table/board/radar 的公开页读取 `CollectionView` 配置；canvas/soundscape 的公开页读取 `CardTool.state_json` 的只读投影；embed/dice 在卡片正文内渲染。

## Consequences

- 新增 `tools` / `assets` 两个 app；新增 `CollectionView`、`CardTool`、`ToolRevision`、`Asset`、`ToolKind` 五类模型。
- 11 种工具不再各建表；横切面（链接、搜索、修订、发布、权限）可以复用。
- 相对 v0.1 约 **+18–24 人周**；P3 从 12–16 周升到 21–27 周（单人）。
- `Card` 行数会增加；`is_auxiliary` 的部分索引、公开/搜索过滤、表格键集分页是必须的。
- canvas/soundscape 的大 payload 需要单独限流；不能把 2 MB 图塞进 Card.body。
- 公开页必须为 11 种工具补只读渲染，否则 P3 对等不成立。

## Validation / Acceptance

1. 11/11 parity matrix 每一格都有 L1/L2/L3 结论，无空项。
2. 每个 L3 工具通过：公开页、编辑保存、权限、搜索命中、修订/恢复、空态/错误态、移动端降级。
3. 旧站 5 篇活工具空壳与 6 类无活文档分别有处置记录；不把“没有活数据”当成“不需要验收”。
4. table 10k 行、canvas 2k 节点、board 500 卡的基准达到设计稿 §7.9。
5. 视图行查询不带 `is_auxiliary` 过滤时，CI 合同测试失败。

## Alternatives considered

- **11 个独立 ToolDoc**：迁移与横切面成本最高；等于复活 Document 万能容器。拒绝。
- **所有工具都塞进 Card.body**：会毁掉块 schema、diff 与公开渲染；拒绝。
- **全部归档，不重建**：与用户“重建 11 种”的决策冲突；拒绝。
- **视图行一律用 ToolItem**：数据更干净，但链接/回链/修订/权限要重做；作为基准失败后的 fallback，不作为默认。

## Open questions

- 已批准（2026-10-20）：默认 11/11 全 L3；任何 L1/L2 降级需后续书面签署。
- `voice` / `note` 是否在 11 项之外重建；默认归档。
- `is_auxiliary` 的部分索引与分页策略需要在 P1 基准中验证。

## References

- 设计稿 v0.2：`.design/current/index.html` §0.1、§6.2、§7.1、§8.6
- 数据审计：`docs/spikes/20261020-pre-p0-data-dry-run.md`
- ADR-0008（Collection）、ADR-0012（parity 与回滚）
