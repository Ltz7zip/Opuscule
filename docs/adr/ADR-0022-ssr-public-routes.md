# ADR-0022：SSR 公共路由扩展（Wiki + Explore）

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0019/0020（SSR 试点/生产）、P1.6

## 背景

Wiki SSR 已验证 renderToString + hydrateRoot + 独立 server。公开 Explore 是第二个高频入口，
若仍 CSR，首屏 HTML 只有壳。需要在不复制管线的前提下扩展到第二个公共路由。

## 决策

1. `ExplorePage` 接受 `initialWorlds`；SSR 时跳过初始 fetch。
2. 同一个 SSR client/server entry 用 `initial.kind` 区分 `wiki`/`explore`，不新增第二套构建。
3. dev/prod server 对 `/explore` 增加 SSR 分支；其他路由继续 SPA fallback。
4. SSR 仍匿名；Profile/Home/Workspace 不纳入本切片。
5. 生产 preview 单进程；部署/缓存/流式仍是后续。

## 后果

- Explore 首屏有真实世界卡片 HTML，hydration 后搜索可用。
- SSR bundle 增大约 6 kB gzip；公共 JS 预算不变。
- 多路由 SSR 的路由分支在 server.mjs/server.prod.mjs 各维护一份，需后续抽 router/SSR manifest。
- 仍不是全站 SSR；Profile/Home/Workspace 仍 CSR。

## 验证

- 5175 `/explore` real HTML + hydration 0 errors；Wiki 回归；47 tests；budget PASS。
