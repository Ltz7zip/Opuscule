# P0 前数据 Dry-run：旧库只读审计

- Date: 2026-10-20
- Scope: 迁移前数据形态与边界，不执行迁移、不写旧库
- Source: `/Users/ltz2024/PycharmProjects/worldbuilding_timeline/db.sqlite3`（本机样本，12.3 MB）
- Method: SQLite `mode=ro`，stdlib `sqlite3`；脚本 `scripts/legacy_audit.py` 可复现
- Warning: 这是**样本**，不是线上全量；上线前必须在线上只读副本重跑，不能把样本结论当生产结论

## 0. 结论先行

1. **“14 张卡”是旧站 `world_card` 行数，不是 14 张内容卡。** 14 条 live Card 行中只有 **10 条是 `document_type=card` 的内容卡**；另外 4 条属于 folder/map/graph/familyTree，是旧 `Document` 万能容器的容器行，不应迁成 Card。
2. **`blocks_doc` 的“8 张已有”不成立。** 10 张内容卡里只有 **4 张** `blocks_doc` 非空；**6 张是空数组**，但旧 `blocks` 有内容，必须走旧块转换。
3. **Era 的“12/19 归属变化”是粗略说法。** 精确口径是 **3 个一致 + 11 个自动归入 + 3 个显式冲突 + 2 个无区间**。按区间优先会改 14 个事件；按显式优先则 11 个自动归入、3 个人工 override、2 个保持无区间。
4. **没有内容卡带子节点。** 唯一“容器 + Card 行 + 子节点”的样本是 folder 106（人物与势力）；它适合用 `CollectionPage`，不是 Card 下挂 Card。
5. **11 种工具不是 11 种活数据。** 971 篇工具文档中 5 篇活（table/board/radar/todo/dictionary 各 1 篇空壳），966 篇软删；canvas/soundscape/media/embed/dice/chapter 六类没有活文档。重建是产品工程，不是数据迁移。

## 1. 文档与 Card 行

| 项 | 数量 | 说明 |
|---|---:|---|
| 文档总数 | 1,035 | 含软删 |
| 软删文档 | 1,013 | 不进入新库 |
| 活文档 | 22 | 10 内容卡、3 folder、2 familyTree、1 map、1 graph、5 工具空壳 |
| `world_card` 总行数 | 43 | 旧站每个文档都可能有一行 Card |
| live Card 行 | 14 | 10 内容卡 + 4 容器行（folder/map/graph/familyTree） |
| 随软删文档丢弃的 Card 行 | 29 | 43 − 14 |
| 内容卡 | 10 | 6 在 folder 内，4 在根级 |
| 内容卡带子节点 | 0 | 没有 Card 下挂 Card |
| 版本快照 | 1,256 | 每张内容卡约 125 条 |

### 1.1 live Card 行按文档类型

| `document_type` | live Card 行 | 是否迁为 Card |
|---|---:|---|
| card | 10 | 是 |
| folder | 1 | 否；迁为 Collection + CollectionPage |
| map | 1 | 否；迁为 WorldMap |
| graph | 1 | 否；迁为 Graph |
| familyTree | 1 | 否；迁为 Graph |
| **合计** | **14** | 只迁 10 张内容卡 |

### 1.2 内容卡的块格式

| 卡 | `blocks_doc` | 旧 `blocks` | 迁移动作 |
|---|---|---|---|
| 109 Isarra Thornveil | `[]` | 非空 | 旧 blocks → Tiptap |
| 110 Harrowdeep | `[]` | 非空 | 旧 blocks → Tiptap |
| 111 Redwake Harbor | `[]` | 非空 | 旧 blocks → Tiptap |
| 112 The Quiet Belt | `[]` | 非空 | 旧 blocks → Tiptap |
| 113 The Balr Accords | `[]` | 非空 | 旧 blocks → Tiptap |
| 114 The Secnd Watch | 非空 | 非空 | 以 `blocks_doc` 为基线，旧 blocks 对照 |
| 169 Harrowdeep 的城门 | `[]` | 非空 | 旧 blocks → Tiptap |
| 2214 未命名卡片 | 非空 | 非空 | 以 `blocks_doc` 为基线 |
| 2215 未命名 | 非空 | 非空 | 以 `blocks_doc` 为基线 |
| 2216 未命名 | 非空 | 非空 | 以 `blocks_doc` 为基线 |

结论：**4 张已有 BlockNote JSON，6 张需要旧块转换**；没有“两边都为空”的卡。转换器必须以旧 `blocks` 的 `type/title/text` 为输入，不能假设 `blocks_doc` 可用。

### 1.3 树与根级

- 3 个 folder：106 人物与势力、107 地点、108 势力与组织；都在根级。
- 6 张内容卡在 folder：109 在 106；110–112 在 107；113–114 在 108。
- 4 张内容卡在根级：169、2214、2215、2216。
- 8 条根级 Card 行：上面 4 张内容卡 + folder 106 + map 117 + graph 160 + familyTree 116。
- folder 106 有 1 条 Card 行（812）+ 1 个子卡（109）；这是 `CollectionPage` 的唯一真实样本。
- 活文档 slug 无重复；但拆表后仍需全局 slug registry 与墓碑，不能依赖 per-table unique。

## 2. Era 与事件差异

### 2.1 Era 区间

| Era | 名称 | 区间 | 显式 FK 成员 | 区间成员 `[start,end)` |
|---|---|---:|---:|---:|
| 47 | The Founding | 0–320 | 1 | 0 |
| 48 | The Quiet Century | 320–500 | 3 | 5 |
| 49 | The Broken Accord | 500–550 | 2 | 10 |
| 61 | 新纪元 | 550–553 | 0 | 0 |

### 2.2 19 个事件的逐条分类

| 事件 | 年 | 显式 era | 区间 era | 分类 |
|---|---:|---:|---:|---|
| 71 Balri 协定签署 | 481 | 48 | 48 | 一致 |
| 98 新事件 | 487 | — | 48 | 自动归入 |
| 100 新事件 | 496 | — | 48 | 自动归入 |
| 70 发现深层洞室 | 498 | 48 | 48 | 一致 |
| 113 新事件 | 498 | — | 48 | 自动归入 |
| 74 守夜人接管矿带 | 512 | 49 | 49 | 一致 |
| 107 新事件 | 516 | — | 49 | 自动归入 |
| 109 新事件 | 516 | — | 49 | 自动归入 |
| 105 新事件 | 526 | — | 49 | 自动归入 |
| 112 新事件 | 528 | — | 49 | 自动归入 |
| 111 新事件 | 536 | — | 49 | 自动归入 |
| 81 abc | 539 | — | 49 | 自动归入 |
| 69 Harrowdeep 建镇 | 544 | 47 | 49 | **冲突** |
| 106 新事件 | 544 | — | 49 | 自动归入 |
| 108 新事件 | 544 | — | 49 | 自动归入 |
| 103 新事件 | 554 | — | — | 无区间 |
| 101 新事件 | 555 | — | — | 无区间 |
| 72 Isarra 出任调停人 | 565 | 48 | — | **冲突（超出区间）** |
| 73 港口大火 | 581 | 49 | — | **冲突（超出区间）** |

### 2.3 精确计数

| 分类 | 数量 |
|---|---:|
| 显式 FK 与区间一致 | 3 |
| 无归属事件被区间自动归入 | 11 |
| 显式 FK 与区间冲突 | 3 |
| 落在所有 Era 之外 | 2 |
| 合计 | 19 |

- 按**区间优先**：14 个事件的成员集与旧显式 FK 不同（11 自动 + 3 冲突）。
- 按**显式优先**：11 个自动归入；3 个冲突人工 override；2 个保持无区间；3 个保持一致。
- 2 个 Era 的区间成员为 0（47、61）；其中 47 有 1 个显式事件但冲突，61 完全为空。不能硬造 active Hist。
- `Card.era_mode`：14 条 live Card 行全部 `universal`，没有 `era_ids`；`Document.era_id/era_ids` 全空。样本没有可见性分支，但 schema 仍要保留 `Card.presence_json`。

> 旧评审里的“12/19”不再使用；以本节计数为准。**冲突 69/72/73 必须人工签字**，不能按区间静默覆盖。

## 3. 工具文档

| 项 | 数量 |
|---|---:|
| 工具文档总数（11 类） | 971 |
| 活工具文档 | 5 |
| 软删工具文档 | 966 |
| 六类无活文档 | canvas / soundscape / media / embed / dice / chapter |

5 篇活工具全部是 `外观巡检 · <type>` 空壳、`settings` 15 B、已发布：

| 类型 | 文档 ID | slug |
|---|---:|---|
| table | 2228 | 外观巡检-table-13 |
| board | 2229 | 外观巡检-board-13 |
| radar | 2230 | 外观巡检-radar-13 |
| todo | 2231 | 外观巡检-todo-13 |
| dictionary | 2232 | 外观巡检-dictionary-13 |

含义：**重建 11 工具的成本在实现与验收，不在数据迁移**。表中 5 篇空壳仍有公开 URL（`is_published=1`），不能直接 404；需要只读页或 301/归档页。

## 4. 对 ADR 的直接输入

- **ADR-0007**：五类宿主；视图行默认 `Card + is_auxiliary`；表格 10k 行、canvas 2k 节点要做基准。
- **ADR-0008**：只迁 10 张内容卡；4 条容器行丢弃；folder 106 用 `CollectionPage`；无内容卡带子节点；slug 无重复但需 registry。
- **ADR-0009**：显式优先；11 自动 + 3 冲突 + 2 无区间；空 Era 用 archived Hist；`Card.presence_json` 保留。
- **ADR-0010**：迁移量很小，瓶颈在 11 工具实现与 6.1/6.2 支持窗口，不是 ETL 吞吐。

## 5. 复现

```sh
cd /Users/ltz2024/Opuscule
python scripts/legacy_audit.py \
  --db /Users/ltz2024/PycharmProjects/worldbuilding_timeline/db.sqlite3 \
  > /tmp/opuscule-audit.json
```

脚本只读打开 SQLite，不执行写入；输出 JSON 含文档/Card/工具/Era 分类。报告中的表格由该输出整理。

## 6. 未验证 / 上线前必须重跑

- 线上库可能远大于样本（尤其软删工具文档、版本表、媒体）；本报告只证明形态，不证明规模。
- 旧 `settings` / `map_data` 的二进制或超大 payload 没有逐条解析；迁移时要单独统计失败率。
- 旧 `blocks` 的节点类型白名单未穷举；6 张旧块卡需要 dry-run 转换报告。
- 旧 URL 的 301 目标未逐条请求；上线前抽样外链。
- 线上是否存在 `Card` 下挂 Card、跨世界 parent、slug 冲突；样本为 0，不等于线上为 0。
