# ADR-0009: Era → 区间 Hist

- Status: **Accepted**（区间模型、迁移规则、展示字段与 Card presence 已定）
- Date: 2026-10-20
- Deciders: 项目 owner、后端 / 数据库 / UX 评审
- Related: 设计稿 §6.5、§8.2、§8.7；ADR-0008、ADR-0012
- Supersedes: 旧站 `Era` 的“命名区间 + 文档分支”混合语义

## Context

旧站 `Era` 同时承担两件事：

1. **命名区间**：`start_year/end_year/length_years/theme/icon/cover`；有“画多长”和“开放端”两套展示语义。
2. **文档可见性分支**：`Card.era_mode = universal | only | hidden`、`Card.era_ids`、`Document.era_id` / `Document.era_ids`。

新 `Hist` 是“策展的视角”，提案要求“非空真子集”。把 Era 直接压成“按区间派生成员的 Hist”，会丢两样东西：

- 色带/主题/封面等展示层；
- “某张卡在某时期是否出现”的可见性语义。

样本库实测（只读）：

| 项 | 数量 |
|---|---:|
| Era | 4（0–320 / 320–500 / 500–550 / 550–553） |
| 时间事件 | 19 |
| 事件 `era_id` 为空 | 13 |
| 显式 `era_id` 分布 | era47=1、era48=3、era49=2、era61=0 |
| 区间成员（半开 `[start,end)`） | era47=0、era48=5、era49=10、era61=0 |
| 显式 FK 与区间一致 | 3 |
| 无归属事件会被区间自动归入 | 11 |
| 显式 FK 与区间冲突 | 3（event 69 的 544 在 era47；event 72 的 565 在 era48；event 73 的 581 在 era49） |
| 落在所有 Era 之外 | 2（event 103 的 554、event 101 的 555） |
| `Card.era_mode` | 14 条 live Card 行全部 `universal`；无 `era_ids` |

因此，之前“12/19 归属变化”的粗略说法不准确：精确口径是 **3 一致 + 11 自动归入 + 3 冲突 + 2 无区间**。如果按区间优先，会改动 14 个事件；如果按显式优先，则 11 个自动归入、3 个冲突需要人工 override、2 个保持无区间。

## Decision

### D1. Hist 增加区间与展示字段

```text
Hist:
  id, timeline_id, name, slug, description
  kind = interval | curated
  start_value, end_value        # interval 使用；半开 [start, end)
  theme, icon, cover            # 旧 Era 展示层，不丢
  status = draft | active | archived
  calendar_version
```

- `curated`：显式 `HistMembership`，保持“非空真子集”的旧约束。
- `interval`：成员由 `start/end` 派生；草稿允许空/全量，**发布为 active 时才要求非空真子集**。
- 空区间/全量区间：允许 `status=archived` 或只做展示带；不为了满足约束硬塞成员。
- `TimelineBand` 不在 v1 单独引入；展示字段先放 Hist。若未来需要独立于视角的“命名时期”，再开 ADR，不要继续把语义塞进 Hist。

### D2. 迁移以显式 FK 为第一权威，冲突人工 override

1. 显式 `era_id` 且落在该 Era 区间内：保留（3 个 match）。
2. 显式 `era_id` 但落在区间外，或落在另一个 Era：**不自动改**；进入冲突表，由人工在迁移报告上选择“保留旧 FK / 改为区间 / 置空”（3 个）。
3. 无 `era_id` 且落在某个区间：自动归入该 interval Hist（11 个），并在报告中逐条列出。
4. 无 `era_id` 且不在任何区间：保持无 Hist（2 个），不硬塞到最近 Era。
5. 只有人工 override 才能覆盖上述规则；override 表要带旧值、新值、理由、操作者、时间。

### D3. 区间边界与精度

- 统一用半开区间 `[start, end)`；最后一个 Era 的 `end` 是展示端点，不改变半开语义。
- 事件有 day/hour 精度时，区间比较仍以 `year` 的 `epoch_day` 为准；同一年的边界事件（320/500/550）需要人工确认归属，不靠浮点四舍五入。
- `calendar_version` 变更时重算；旧成员/重复算结果不得静默覆盖。

### D4. Card presence

- 旧 `Card.era_mode` / `Card.era_ids` / `Document.era_id(s)` 迁到 `Card.presence_json`；即使样本全是 `universal`，字段也必须在 P0 进 schema。
- 语义：`universal`（所有时期出现）、`only`（只在列出的 Hist 出现）、`hidden`（不出现）；不得把 `only` 简化为“只在某个区间”。
- P2 再做可见性 UI；迁移阶段只保数据与校验，不做自动过滤。

### D5. 空/全量 Era 与公开 URL

- era61（550–553）区间成员 0：创建 `Hist(kind=interval, status=archived)` 保留名称/色带/封面与 301，不创建 active 成员集。
- era47 的区间成员 0，但显式 event 69 冲突；冲突解决后若仍 0，按空区间处理，不硬造成员。
- 全量覆盖的 Era：不创建 active Hist；用 `Timeline` 总览或归档视图表达，避免“整条时间线”变成 Hist。
- 旧 `/s/<world>/era/<id>` 301 到 Hist 页；无 Hist 的 Era 到归档/时间线页，并保留说明。

### D6. 不重建 `TimelineBand` 作为 v1 依赖

`Hist` 的展示字段足以覆盖旧 Era 的色带/封面；`TimelineBand` 只在“独立于视角的命名时期”成为真实需求时再引入。这个决定避免同时维护两套区间模型。

## Consequences

- `Hist` 比 v0.1 多 5 个字段；`HistMembership` 只服务 curated；interval 成员是查询派生。
- 迁移报告必须列出 19 个事件的逐条分类；3 个冲突必须人工签字，不能静默。
- 2 个空区间 Era 会有 Hist 记录但 `status=archived`；公开页可展示色带，但不影响“非空真子集”的 active 校验。
- `Card.presence_json` 增加存储与校验成本，但避免“某角色在某时期不存在”这类世界构建语义丢失。
- 公开 URL 需要 301 表；旧 Era 链接不会 404。

## Validation / Acceptance

1. 19 个事件逐条分类：3 match、11 auto、3 conflict、2 unassigned；报告可复现。
2. 3 个冲突有 override 记录；未 override 的冲突阻断切换。
3. 区间成员计数：era47=0、era48=5、era49=10、era61=0；与报告一致。
4. 空/全量 Era 不产生 active 的非法 Hist；archived Hist 可展示、不可发布为“真子集”。
5. `Card.presence_json` 对 14 条 live Card 行保留 `universal`；未来 `only/hidden` 有单元测试。
6. 旧 era URL 301 到正确 Hist/归档页；抽样 3 条外链。
7. 不允许只凭“样本很小”跳过 3 个冲突；线上库必须重跑审计。

## Alternatives considered

- **Era 直接映射为 HistMembership**：会改动 14 个事件、丢掉展示层与卡可见性；拒绝。
- **新增 TimelineBand 作为唯一区间模型**：需要两套模型与双写；v1 拒绝，保留未来选项。
- **按区间优先，显式 FK 全部覆盖**：会把 event 69/72/73 静默改到别的 Era；拒绝。
- **空/全量 Era 也建 active Hist**：违反“非空真子集”，后续所有校验都会修不正；拒绝。
- **丢弃 Card.era_mode/era_ids**：样本虽全是 universal，但这是产品语义回退；拒绝。

## Open questions

- 已批准（2026-10-20）：保留 `Hist` 展示字段与 `Card.presence_json`；P2/P3 上线时点待排期。
- 空区间 Hist 是否在公开站显示为“色带但无事件”，还是只保留 301。
- 冲突 event 69 的最终归属（旧 FK era47 / 区间 era49 / 置空）需要人工签字。
- `voice` / `note` 是否影响 Era 语义；默认不重建。

## References

- 设计稿 v0.2：`.design/current/index.html` §6.5、§8.2、§8.7
- 数据审计：`docs/spikes/20261020-pre-p0-data-dry-run.md`
- ADR-0008（Collection）、ADR-0012（迁移验收）
