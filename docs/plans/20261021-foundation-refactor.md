# Opuscule 重构执行方案（R0–R5）

- 日期：2026-10-21
- 状态：active（G0 执行中）
- 范围：`/Users/ltz2024/Opuscule`（新仓）；旧站冻结在 `legacy-0.8.1`，不在本方案内改动。
- 依据：`.design/current/index.html`（v0.2）、`docs/adr/`（0007–0011、0014–0023）、
  `docs/spikes/20261020-pre-p0-data-dry-run.md`。
- 执行：inline（单人）；分支 `refactor/foundation`，基线 tag `slice-0.9`。

## 0. 已拍板（2026-10-21）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 路线 | **原地换地基**：保留原型的行为与页面，替换领域内核与运行时；不二次重写。 |
| 2 | 冻结范围 | 只冻依赖新内核的功能（11 工具、AI、地图 v2、协作）；公开页/壳层 UI 美化可继续。 |
| 3 | `type_key` 退役 | **全部删除**：R1 内数据迁移到 `EntityType` 后同发布删列，不做过渡双模型。 |
| 4 | 前端包结构 | **物理拆多包**：pnpm workspace（`apps/workspace` + `packages/*`）。 |
| 5 | API / 搜索 | 按建议执行：`/api/v1` 与 `/api` 并存一版；R2 切 PG trgm/tsvector，v1 不引 Meilisearch。未反对，可在 R2 前改。 |

## 1. 结论

当前仓库是一份**产品表面完整、领域内核缺失**的可运行切片：94 条测试、13 条前端路由、
公开 SSR 都在；但 v0.2 的四块地基只落地了一块半（Card/Collection 有形状、Tiptap JSON 能存），
引用图、修订与冲突、工具宿主基本为零。在这个状态上加 11 种工具，等于把旧站的
`Document` 万能容器请回来。

路线：**保留原型，替换内核；前端按 feature 重组；G1 门禁通过前，冻结 11 工具、AI 与地图 v2 的新功能。**

## 2. 基线（审计快照）

| 维度 | 审计值 | 含义 |
|---|---|---|
| 后端 | 6,100 行 · 17 模型 · 33 迁移 · 58 条路由 | Django 6.1.2 + DRF 3.18.3；无 OpenAPI、无 outbox、无 worker。 |
| 测试 | 94 个 TestCase · 25.3 s 全绿 | 覆盖真实行为，但多为实现耦合的 TestCase。 |
| 数据 | SQLite 418 KB（seed/demo） | 可硬切、可重建；无生产数据。 |
| 前端 | 11,107 行 · 单包 | `CardEditor` 939、`api.ts` 597、`app.css` 1,653 行。 |
| 构建预算 | 120 / 175 / 40 kB gzip | entry / Workspace / CSS；重构不得回归。 |
| 决策层 | 16 份 ADR | 缺 0012（parity/回滚）、0013（块 schema），R0 补齐。 |
| 仓库 | 基线提交 `fd1d0f7` · tag `slice-0.9` | R0 建立；此前无 HEAD。 |

## 3. 差距

| 地基 | 现状 | 后果 |
|---|---|---|
| 文档格式 | `body_json` 直存；无 blockId / schema / 版本 | 冲突无法按块合并；AI 无法定点；评论锚点脆弱 |
| 引用图 | 无 LinkIndex；引用是编辑器装饰；搜索 `icontains` | 无反链、无重命名传播、大世界 N+1 |
| 实体模型 | `type_key` 字符串；无 EntityType/PropertyDef/PropertyValue | 无法按属性筛选；新增类型要改前端 |
| 冲突模型 | `revision` 自增；无 If-Match/409 | 后写静默覆盖；无历史、无恢复 |
| 工具宿主 | 0/11；无 ToolKind/CollectionView/CardTool/Asset | 做 table 只能塞 body 或建 5 张表 |
| 运行时 | SQLite 单进程；无 outbox/worker/OpenAPI | 索引不能异步；多消费者互相猜字段 |
| 迁移 | 自有格式 ZIP；无 legacy 映射/Era diff/parity | R5 无法对账 |

## 4. 目标与边界

- 目标：把原型抬到能承接 v0.2 的地基上——五条不变量成立、模块 DAG 成立、两个交付面不互相污染。
- 兼容：`/api/*` 保留一版，新增 `/api/v1/*`；路由与视觉不变；demo 数据可丢弃重建。
- 非目标：P4（兵棋/3D/CRDT）、微服务、11 个 ToolDoc、v1 引独立搜索引擎、迁移旧 AI 凭据。
- “重构完成”（G3）≠“产品对等”（G4/G5），两个里程碑分开验收。

## 5. 路线

| 阶段 | 周期（单人） | 交付 | 门禁 |
|---|---|---|---|
| R0 冻结与护栏 | 1.5–2 周 | 基线 tag、冻结清单、ADR-0012/0013、block-schema v0、11 工具范围合同、特征测试、PG 预演、import-linter | G0 |
| R1 领域内核 | 6–8 周 | entities / links / revisions / tools / assets；`type_key` 删除；blockId 与服务端校验；slug registry | G1 |
| R2 运行时与契约 | 2.5–3 周 | settings 拆分、Postgres 17、Redis、outbox + worker、OpenAPI、`/api/v1`、PG 搜索 | G2 |
| R3 前端再架构 | 5–7 周 | pnpm workspace、features 迁移、editor 包、api-client、CSS 分层、快照回归 | G3 |
| R4 产品对等 | 26–34 周 | 11 工具分波、Hist、Graph、AI 建议层、地图 v2、公开工具页、parity 签字 | G4 |
| R5 迁移与切换 | 3–4 周 | legacy ETL、Era diff、LinkIndex 重建、两次演练、回滚、30 天 hypercare | G5 |

合计 43–56 周（不含 20% 缓冲），含缓冲 52–67 周，与蓝图 50–68 周对齐。
原型已交付部分抵掉约 5–8 周，但 2.2–2.4 的横切债并未变成净收益。G1 后按实际速度重估。

## 6. R0 / R1 任务

### R0（本轮）

| # | 任务 | 落点 | 验收 |
|---|---|---|---|
| R0.1 | 基线提交 + tag + 分支 | 仓库根 | `slice-0.9` 可检出；`refactor/foundation` 基于它 |
| R0.2 | 冻结清单与例外流程 | `docs/plans/20261021-refactor-freeze.md` | 冻结/允许/例外三类写清 |
| R0.3 | ADR-0012 | `docs/adr/ADR-0012-refactor-parity-rollback.md` | 路线、parity、迁移验收、回滚、`type_key` 硬删 |
| R0.4 | ADR-0013 | `docs/adr/ADR-0013-block-schema-v2.md` | 白名单、blockId、校验点、未知节点隔离 |
| R0.5 | block-schema v0 | `contracts/block-schema.json` | 覆盖现有节点/标记；可被脚本校验 |
| R0.6 | 11 工具范围合同 | `docs/plans/20261021-tool-parity-matrix.md` | 11 行 × L1/L2/L3 × 验收列，无空项 |
| R0.7 | 新 app 空壳 + import-linter | `backend/apps/{entities,links,tools,assets}`、`.importlinter` | `lint-imports` 通过，违规 import 失败 |
| R0.8 | 特征测试 5 组 | `backend/apps/*/tests_characterization.py` | 冲突（预期失败至 R1）、API 形状、权限矩阵、导入导出保真、公开面 |
| R0.9 | PG 预演 | `config/settings.py` 环境开关 + 本地集群 | 94+ tests 在 PostgreSQL 18 跑通 |
| R0.10 | 门禁接入 | `scripts/ci.sh`、`Makefile` | `make ci` 含 lint-imports 与迁移检查 |

### R1（下一阶段）

1. `entities`：EntityType / PropertyDef / PropertyValue；12 类型 / 43 属性种子。
2. `cards`：`type` 外键；数据迁移后删除 `type_key`（同发布）；属性值写入。
3. `collections`：CollectionPage、环检测、全局 slug registry（world+slug+kind）。
4. `cards/services.py`：`If-Match` 保存、409、CardRevision（delta+snapshot）、恢复。
5. `links`：LinkIndex（多态源/目标、check、NULLS NOT DISTINCT）、解析器、重建命令、反链接口。
6. `block-schema`：blockId 回填、服务端校验、未知节点拒绝。
7. `tools` / `assets`：ToolKind 注册 11 行；CollectionView / CardTool / ToolRevision / Asset。
8. `search`：SearchDoc 最小版（同步），R2 迁 outbox。
9. 12 条不变量测试。

## 7. 前端物理多包（决策 ④ 落地）

目标结构：

```
frontend/
  pnpm-workspace.yaml
  package.json                  # private root，统一脚本
  apps/workspace/               # 应用：路由、features、public SSR server
  packages/
    block-schema/               # 纯 TS：节点类型、校验、版本迁移
    ui/                         # tokens.css、primitives.css、通用组件
    api-client/                 # OpenAPI 生成类型 + fetch 封装
    editor/                     # Tiptap 扩展、节点、菜单、NodeView
    tools/                      # 11 工具宿主注册表（R4 填实现）
```

迁移顺序（每步行为不变，截图/路由回归）：

1. workspace 骨架：`pnpm-workspace.yaml`、根 `package.json`、把应用移入 `apps/workspace`；
   根脚本保留为薄包装（`build` → `pnpm --filter workspace build`），`make ci` 不改。
2. `block-schema`：先落类型与 JSON schema，导出 `validateDoc`；不依赖 React。
3. `ui`：tokens + primitives 先移，页面级 CSS 留在 app；`app.css` 六层拆分最后做。
4. `api-client`：R2 生成 OpenAPI 后切换；手写 `api.ts` 按域保留一版。
5. `editor`：schema / nodes / nodeviews / menus / useSave；`CardEditor` 拆到 6 个文件。
6. `tools`：只定 view/page/block 三类渲染器接口与注册表，不实现工具。

强制约束：

- 公开页不得 import `editor` / `tools`；`editor` 只在 `/w/` 路由加载。
- `entry ≤ 120 kB`、`Workspace ≤ 175 kB`、`CSS ≤ 40 kB`；新增 `tools` chunk ≤ 60 kB。
- CI 跑 `pnpm -r build` + 截图；包之间禁止循环依赖。

## 8. 门禁

| Gate | 证据 | 失败动作 |
|---|---|---|
| G0 | 基线 tag；ADR-0012/0013 Accepted；冻结清单；block-schema v0；11 工具矩阵；5 组特征测试；`lint-imports`；PG 预演 | 不开始 R1 schema 迁移 |
| G1 | 新增类型零迁移；反链 1 查询；并发 409；修订可重放；blockId 100%；LinkIndex 重建可解释 | 不进入 R2 |
| G2 | 94+ tests 在 PG 绿；OpenAPI diff 阻断；import-linter 绿；outbox 幂等；请求链路无索引写 | 不切前端 api-client |
| G3 | 路由/截图不变；预算不回归；editor 只在 /w/；循环依赖 0；pnpm 包边界成立 | 不启动 R4 工具波次 |
| G4 | 11/11 parity 无空项；L3 签字；10k 表格 / 2k canvas / 1k 树达标 | 不进入 R5 演练 |
| G5 | 0 条未解释差异；两次演练一致；301 测试；回滚演练 | 不切 DNS |

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 边重构边加功能 | 冻结清单 + 每周 gate 评审；新需求进 R4 backlog |
| `type_key` 硬删导致前端类型空白 | 同发布切换：后端先迁移并暴露 types API，前端同 PR 改读 API；种子与测试覆盖三种内置类型 |
| 前端多包搬迁回归 | 每步“只搬不改”；Playwright 截图；一次一个包 |
| 94 条测试绑实现 | R0 补行为测试；断言 API/页面，不断言内部结构 |
| PG 迟到暴雷 | R0 就在本地 PG 跑全量；CI 增加 PG job |
| 11 工具范围膨胀 | 分波；冷门工具 L2 书面签字 |
| Django 6.2 窗口 | R2 spike；R4 前升级 |

不做：二次重写、11 个 ToolDoc、微服务、CRDT、R1 前做工具 UI/AI/地图 v2、同时重写 CSS 与组件。

## 10. TDD Route

- Mode：off（Aegis 默认，项目未要求 strict）。
- Decision：skipped。
- Authority：项目约定；重构期以特征测试锁定现有行为，新行为用后置 API 测试。
- Test posture：先补特征测试（R0），再改实现；冲突语义测试先 `expectedFailure`，R1 转绿。
- Verification：`make ci` + `lint-imports` + PG 全量 + 新增特征测试。

## 11. 下一步（14 天）

与 R0 任务表一致：建回滚点 → 冻结清单 → ADR ×2 → block-schema v0 → 11 工具矩阵 →
app 空壳 + import-linter → 5 组特征测试 → PG 预演 → `make ci` 接门禁 → 过 G0。

## 12. 变更记录

- 2026-10-21：v1。五项决策拍板（路线/冻结/`type_key` 全删/物理多包/API 版本），R0 启动。
