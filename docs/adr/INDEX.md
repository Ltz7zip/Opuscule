# Opuscule ADR Index

本目录记录已经执行、且会约束后续实现的架构决策。设计稿
[`.design/current/index.html`](../../.design/current/index.html) 是 v0.2 的当前状态基线；
ADR 只解释“为什么这样定”和“验收边界”，不复制整份设计稿。

## Conventions

- 一条 ADR 只记录一个可独立撤销/替代的决策。
- 状态：`Proposed` / `Accepted` / `Superseded` / `Deprecated`。
- 进入 `Accepted` 前必须通过 ADR gate：
  - 难以回退（hard to reverse）
  - 没有上下文会显得意外（surprising without context）
  - 存在真实取舍（real trade-off）
- 每条 ADR 必须写：Context、Decision、Consequences、Validation、Alternatives、Open questions。
- 架构基线变更时，先更新设计稿或本目录的“Baseline”段，再写 ADR；不能只写 ADR 而让基线过期。
- 项目此前没有 ADR 系统；本目录是 v0.2 建立的最小约定，不引入额外工具依赖。

## Status

| ADR | 标题 | 状态 | 日期 | 设计稿对应 | 仍未定 |
|---|---|---|---|---|---|
| [0007](ADR-0007-tool-hosts.md) | 工具宿主与 11/11 对等矩阵 | Accepted（宿主模型 + 视图行默认） | 2026-10-20 | §0.1 / §6.2 / §8.6 | 冷门工具是否降级；ToolItem 仅在基准失败后替代 |
| [0008](ADR-0008-collection-public-ia.md) | Collection 树与公共 IA | Accepted（模型 + 公开 IA） | 2026-10-20 | §6.2 / §8.2 | Collection 公开 URL 形态；多集合露出 |
| [0009](ADR-0009-era-interval-hist.md) | Era → 区间 Hist | Accepted（区间 + 展示） | 2026-10-20 | §6.5 / §8.2 | 展示字段上线时点；冲突 event 69 归属 |
| [0010](ADR-0010-runtime-stack.md) | 运行时与依赖 | Accepted | 2026-10-20 | §4.4 / §10.2 | 6.2 LTS 日期；`django.tasks` 替代范围；对象存储 |
| [0011](ADR-0011-license-and-dependencies.md) | 许可证与依赖边界 | Accepted（策略） | 2026-10-20 | §0.2 / §4.4 / §10.2 | 项目 LICENSE 版权主体；字体/资产清单 |
| [0014](ADR-0014-page-modules-and-performance.md) | 页面模块边界与公开站性能预算 | Accepted | 2026-10-20 | §4.6 / §9 | SSR/缓存时点；CI budget 阈值 |
| [0015](ADR-0015-invite-tokens.md) | 一次性邀请令牌 | Accepted | 2026-10-20 | §6.1 | 邮件/多次邀请/审批 |
| [0016](ADR-0016-soft-delete-ownership.md) | 世界软删除与所有权转移 | Accepted | 2026-10-20 | §6.1 | 保留期限/审计/硬删 |
| [0017](ADR-0017-governance-audit.md) | 世界治理审计事件 | Accepted | 2026-10-20 | §6.1 | 保留/导出/不可篡改 |
| [0018](ADR-0018-share-ssr-boundary.md) | 服务端分享页与完整 SSR 边界 | Accepted | 2026-10-20 | §4.6 | 完整 SSR/OG 图 |
| [0019](ADR-0019-ssr-pilot.md) | 公开 Wiki SSR/hydration 试点 | Accepted | 2026-10-20 | §4.6 | 生产 SSR/多页 SSR |
| [0020](ADR-0020-ssr-production.md) | SSR 生产构建与独立 server | Accepted | 2026-10-20 | §4.6 | 部署/高可用/多页 SSR |
| [0021](ADR-0021-map-module.md) | 地图作为独立 app/feature | Accepted | 2026-10-20 | §4.6 | 瓦片/缩放/编辑/SSR |
| [0022](ADR-0022-ssr-public-routes.md) | SSR 公共路由扩展（Wiki + Explore） | Accepted | 2026-10-20 | §4.6 | 全站 SSR/部署 |
| [0023](ADR-0023-timeline-module.md) | 世界时间线作为独立 app | Accepted | 2026-10-20 | §4.6 | 编辑/SSR/多时间线 |

## Baseline

- 当前设计基线：v0.2（2026-10-20），五项决策已定。
- v0.1 快照：`.design/history/20261020-171122/index.html`。
- 数据审计：`docs/spikes/20261020-pre-p0-data-dry-run.md`。
- P0.1 垂直切片：`backend/` + `frontend/`；验证见 `docs/verification/20261020-p0.1.md`。
- P0.2 安全边界：session auth + CSRF + `WorldMembership`；验证见 `docs/verification/20261020-p0.2.md`。
- P0.3 个人主页：`/u/<username>` + `UserProfile`；验证见 `docs/verification/20261020-p0.3.md`。
- P0.4 页面模块与性能：route-level lazy、公开 Wiki、探索、注册；见 ADR-0014。
- P0.9 治理：软删除/回收站/恢复、所有权转移；见 ADR-0016。
- P0.10 审计：治理事件 + 审计 dialog；见 ADR-0017。
- P1.3 分享页：Django 只读 HTML/OG；见 ADR-0018。
- P1.4 SSR 试点：Wiki 单路由 SSR/hydration；见 ADR-0019。
- P1.5 SSR 生产构建：独立 server/静态/反代；见 ADR-0020。
- P2.1 地图：独立 maps app + lazy map 页面；见 ADR-0021。
- P1.6 SSR 扩容：Wiki + Explore 公共路由；见 ADR-0022。
- P4.1 时间线：独立 timelines app + lazy 页面；见 ADR-0023。
- P0.9 治理：软删除/回收站/所有权转移；见 ADR-0016。
- 本轮 ADR 不改变“绿地重建 + 一次性单向迁移 + 旧站只读并行”的总体路线，只细化五类工具宿主、Collection 导航、区间 Hist 与运行时。
