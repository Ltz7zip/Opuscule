# ADR-0008: Collection 树与公共 IA

- Status: **Accepted**（模型、单一真值与公开站 Collection 导航已定）
- Date: 2026-10-20
- Deciders: 项目 owner、UX / 后端 / 数据库 / 前端评审
- Related: 设计稿 §6.2、§8.2、§9.1；ADR-0007、ADR-0009
- Supersedes: 无（旧站 `Document.parent` 是临时容器，不是正式 ADR）

## Context

提案定义了 Card + EntityType，但没有回答“卡片放在哪里”。旧站用 `Document.parent` 做文档树，且父子关系是 **CASCADE**：删文件夹会连带删卡。样本库有：

- 22 篇活文档：10 张内容卡、3 个 folder、2 棵 familyTree、1 张 map、1 个 graph、5 篇工具空壳。
- 10 张内容卡：6 张在 folder 内，4 张在根级；**没有内容卡带子节点**。
- folder 106（人物与势力）是唯一“容器 + Card 行 + 1 个子卡”的样本；它不是内容卡带子节点，而是旧 `Document` 万能容器的表现。
- `world_card` 共 43 行：14 行挂在活文档上，其中 10 行是内容卡、4 行是 folder/map/graph/familyTree 的容器行；29 行随软删文档丢弃。
- 活文档 slug 无重复；但拆表后 per-table unique 不能保证旧 URL 不串内容。

设计稿 v0.1 同时写了 `Card.collection_id` 与可选 `CollectionItem`，会产生双真值；必须只保留一个。

## Decision

### D1. Collection 只做导航

- `Collection` 只拥有 `id, world_id, parent_id, name, slug, position_key, icon, description, is_public`。
- **`collections` 表不放 Card 外键**；Card 的 `home_collection_id` 在 `cards` app，依赖方向是 `cards → collections`，不是双向。
- Collection 不是权限单元；权限仍是世界级 + Card 级 `is_public`。

### D2. Card 只有一个 home

- `Card.home_collection_id` 可空（Inbox / 未归类），但一张卡最多一个 home。
- v1 **不做 `CollectionItem` 跨集合露出**；如果未来需要“同一张卡出现在多个集合”，再开 ADR，并把引用与副本语义写清。
- 删除 Collection 使用 `PROTECT` / 软删 + 迁移到 Inbox；**禁止 CASCADE 删卡**。

### D3. `CollectionPage` 解决“容器自页”与 FK 环

旧站允许“一个文档既是页面，又有子节点”。新模型用 `cards.CollectionPage(collection_id unique, card_id unique)` 表达：

- Collection 仍是导航节点；
- `CollectionPage` 指向该 Collection 的概览卡；
- 旧 folder 106 这类“容器 + Card 行 + 子节点”迁成 `Collection(name=人物与势力) + CollectionPage(card=106)`；
- 不在 `collections` 表上直接放 Card 外键，避免 `cards ↔ collections` 的模型/迁移环。

### D4. 排序、深度与删除

- 排序用 `position_key`（字符串/分数），不做整数全表重排。
- 深度建议 ≤5；公开站只投影前 2 层。
- `Collection.parent_id` 自引用使用可延迟 FK；写入时做祖先环检测（`pg_advisory_xact_lock` 按 world 串行化移动）。
- 空 Collection 允许；同名 Collection 在同一父级下不允许。

### D5. `CollectionView` 是视图配置，不是内容

- `CollectionView(collection_id, kind, name, config_json, position, is_default)` 承载 table/board/radar/todo/dictionary 的筛选、排序、分组、列配置。
- 视图不拥有 Card；数据仍是 Card/PropertyValue。
- P0 必须进 schema（至少 table 一种），否则 P2 每条 Collection 都要补迁移。

### D6. 全局 slug registry 与旧 URL

- 新增 `SlugRegistry(world_id, slug, kind, object_id, is_tombstone)`，`unique(world_id, slug)`；Card/Collection/工具页/地图/图共用。
- 旧 `Document.slug` 与 `published_slug` 都进 registry；拆表后 per-table unique 不再足够。
- 旧 URL 只用 301 指向新对象或墓碑；**不能把旧 slug 复用给另一篇内容**。
- 样本活文档 slug 无重复，但迁移脚本仍必须做冲突预检。

### D7. 公共 IA：已拍板

当前公开站是“类型分区 + 时间线/地图/图”的分区制，没有树。Collection 树如果直接投影到公开站，会换一套 IA，必须单独设计。用户已于 2026-10-20 拍板：

- **Collection 树作为公开导航权威**；类型分区降为“浏览维度”，不再作为唯一入口。
- 公开 URL 保留 `/s/<world>/<cardSlug>/`；Collection 页用 `/s/<world>/c/<collectionSlug>/`；旧类型页 301。
- 工具页放在 Collection 树之外，作为世界级视图或卡片内的只读块；不把 11 种工具塞进公开树。
- 个人主页 `/u/<username>` 是跨世界作者页，不属于 Collection 树；只投影公开世界与公开卡片，私有主页对他人 404。

该方向已由用户签署；公开 URL 的具体形态仍是实现细节，允许在 P0/P1 调整，但“Collection 树为导航权威”不变。

## Consequences

- P0 必须同时落 `Collection`、`CollectionPage`、`CollectionView`、`SlugRegistry` 的骨架；后补会导致每条 Collection 迁移。
- 旧 `Document.parent` 的 CASCADE 语义必须显式改为 PROTECT/软删；这是安全边界，不是实现细节。
- `cards` app 拥有 `CollectionPage`，`collections` app 只依赖 `worlds/common`；依赖 DAG 不再成环。
- 公开站采用 Collection 权威后，需要新的面包屑、SEO、301 与缓存键；类型分区只保留为浏览维度。
- 样本里 4 条非 card 容器行不能迁成 Card；它们只提供 Collection/Graph/Map 的元数据。

## Validation / Acceptance

1. 迁移 dry-run：3 个 folder、10 张内容卡、4 条非 card 容器行、29 条软删 Card 行分别计数，差异 0 或有解释。
2. 每张内容卡恰好一个 home；folder 106 有且仅有一个 `CollectionPage`；无同名双项。
3. 删除 Collection 不删除任何 Card；CASCADE 测试必须失败。
4. 树无环；移动子树后祖先链正确；深度 ≤5。
5. slug registry 无重复；旧 URL 301 到正确对象/墓碑；抽样外链不串内容。
6. 公开 IA 方案签字前，不用“公开站已定”做实现假设。

## Alternatives considered

- **保留 `Document.parent` 作为唯一树**：会继续 CASCADE、继续万能容器；拒绝。
- **Card.collection_id + CollectionItem 双写**：双真值、反链/搜索/发布口径不一致；拒绝。
- **Collection 表直接放 Card 外键做自页**：形成 `cards ↔ collections` 环；拒绝，改用 `CollectionPage`。
- **公开站直接投影整棵树**：旧站没有树，会改变 IA 与 SEO；暂不作为默认，待 D7 拍板。

## Open questions

- 已批准（2026-10-20）：公开站以 Collection 树为导航权威，类型分区降为浏览维度。
- 是否允许 `CollectionPage` 之外的多集合露出；v1 默认不允许。
- Inbox 是否对所有世界可见，以及未归类卡的公开策略。
- `voice` / `note` 是否进入 Collection 树；默认归档，不进树。

## References

- 设计稿 v0.2：`.design/current/index.html` §6.2、§8.2、§9.1
- 数据审计：`docs/spikes/20261020-pre-p0-data-dry-run.md`
- ADR-0007（工具宿主）、ADR-0009（Hist）
