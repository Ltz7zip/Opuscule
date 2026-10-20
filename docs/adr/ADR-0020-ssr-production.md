# ADR-0020：SSR 生产构建与独立 server

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0014（页面边界）、ADR-0019（SSR 试点）、P1.5

## 背景

P1.4 的 SSR 只在 Vite dev middleware 里存在：不能构建、不能独立启动、不能作为部署形态。
公开 Wiki 的 SSR 需要 client hydration bundle、SSR server bundle、静态资产与 API 反代。

## 决策

1. client build 使用 Vite manifest + 多入口：`index.html` 与 `src/ssr/entry-client.tsx`。
2. SSR server 单独构建到 `dist-ssr/entry-server.js`；`build:ssr` / `build:all`。
3. `server.prod.mjs` 不依赖 Vite middleware：静态读 `dist/`，SSR Wiki 读 `dist-ssr/`，SPA fallback 读 `dist/index.html`。
4. 同进程反代 `/api/`、`/robots.txt`、`/sitemap.xml`、`/share/`、`/admin/` 到 Django；生产可换 Nginx。
5. `check:budget` 读 manifest，按 entry transitive imports 汇总，避免只看单个 index chunk。
6. 仍只做 Wiki SSR；不宣称多页 SSR/高可用部署完成。

## 后果

- SSR 可以脱离 Vite dev 启动（`preview:ssr` 5175），有真实 client/SSR 双构建。
- 多了 `dist-ssr` 与 manifest 依赖；构建顺序必须 client → SSR → preview。
- 单 Node 进程既做静态/反代/SSR，生产高可用需要拆层；当前是 preview 形态。
- 预算计算改为 manifest transitive gzip，避免多入口拆分导致误判。
- SSR 仍匿名、单路由，无缓存/流式/监控/E2E。

## 验证

- `npm run build:all`、`preview:ssr`；5175 原始 HTML/hydration/SPA fallback/API 反代/404 均实测。
- budget PASS；43 backend tests 不受影响。
