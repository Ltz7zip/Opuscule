# 重构冻结清单（2026-10-21）

- 状态：active，至 G1 通过
- 依据：`docs/plans/20261021-foundation-refactor.md` §0 决策 ②
- 原则：**冻的是“依赖新内核的功能”，不是所有工作。**

## 冻结（不做新开发）

| 项 | 原因 | 解冻点 |
|---|---|---|
| 11 种工具 UI（table/board/radar/todo/dictionary/chapter/canvas/soundscape/media/embed/dice） | 宿主表、引用图、修订未就位 | G1 后按波次（R4） |
| AI 建议层 / 网关 / 流式 | 需要 ChangeSet 与引用图 | G1 后 R4 |
| 地图 v2（多图、子图、瓦片、FOV） | 需要 WorldMap/MapLink 模型 | R4 |
| 协作 / CRDT / 实时同步 | v0.2 明确后置 P4 | P4 重新立项 |
| 新编辑器节点/标记（超出 block-schema v2 白名单） | 会扩大未校验的 body_json | R1 之后按 ADR 增加 |
| 新公开站页面/新路由 | 会扩大 SSR 与 API 契约面 | G3 后 |

## 允许（继续做）

| 项 | 约束 |
|---|---|
| 公开页/壳层 UI 美化（`20261021-ui-beautification-plan.md`） | 只动视觉与文案；不改数据模型、不改编辑器 schema |
| Bug 修复、安全修复、依赖补丁 | 必须带回归测试；不得顺手改 schema |
| 文档、ADR、测试、脚本 | 不改变运行时行为 |
| 性能修复 | 不引入新依赖；不改公开 API 形状 |

## 例外流程

1. 在 `docs/plans/20261021-refactor-exceptions.md` 记录：事项、原因、影响面、回滚方式、截止日期。
2. 仅接受“阻塞 G0/G1 的问题”或“线上安全/数据问题”。
3. 例外完成后 5 个工作日内补测试与文档；未补的例外不得再开第二条。

## 与 UI 美化方案的关系

`docs/plans/20261021-ui-beautification-plan.md` 的 P0 可继续，但只限：

- `tokens.css` / 字号 / 圆角 / 间距收敛；
- 公开页与壳层的组件样式；
- 不触碰 `frontend/src/components/CardEditor.tsx` 的结构性改动（等 R3 的 editor 包）；
- 不与前端多包搬迁同一批进行。

## 验收

- G0 检查：本文件存在、冻结/允许/例外三类齐全、团队（当前为单人）确认。
- 每周 gate 评审时复查：是否有未登记的“顺手做了”的冻结项。
