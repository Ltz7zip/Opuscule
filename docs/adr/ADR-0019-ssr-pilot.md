# ADR-0019：公开 Wiki SSR/hydration 试点边界

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0014（页面模块/性能）、ADR-0018（分享页）、P1.4

## 背景

SPA + 动态 meta + Django 分享页解决了部分抓取/预览，但公开 Wiki 首屏仍是空壳。
完整 React SSR 需要数据预取、hydration、Node 进程和部署；直接全站切换风险高。

## 决策

1. 用 Vite dev middleware + Node HTTP server 做 **Wiki 单路由 SSR 试点**（端口 5174）。
2. 服务端预取 world/card，`renderToString(WikiPage)` 输出带正文的 HTML，并嵌入 `window.__INITIAL__`。
3. 客户端 `hydrateRoot` 同一组件树，初始数据复用，不在首屏重复 fetch。
4. 其他路由由同一 server 的 SPA fallback 提供；现有 5173 Vite 开发方式不变。
5. 私有/不存在内容 404；SSR 仅匿名；分享页继续作为无 JS 预览面。
6. **不宣称生产 SSR 完成**：没有生产构建、静态资产、进程管理和 SSR 自动化测试。

## 后果

- Wiki 首屏有真实 HTML/正文；hydration 后可交互，且无首屏数据重复请求。
- 多了一个 5174 dev 进程；生产部署尚未解决，不能把 dev pilot 当上线能力。
- 只有 Wiki SSR；Explore/Profile/Home 仍 CSR；SSR 无登录态/角色。
- 后续生产化需要：SSR client/server 构建、资产 manifest、缓存、错误/超时、监控。

## 验证

- 5174 raw HTML 含 h1/正文/initial data；hydration 0 error；导航/404/SPA fallback 正常。
