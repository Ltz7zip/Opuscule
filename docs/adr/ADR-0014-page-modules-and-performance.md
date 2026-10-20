# ADR-0014：页面模块边界与公开站性能预算

- Status: Accepted
- Date: 2026-10-20
- Supersedes: none
- Related: ADR-0008（公开 IA）、ADR-0010（运行时栈）

## 背景

站点不是单一工作区。稳定的一级面至少包括：

- 工作/编辑区（`/w/<world>`）
- Wiki 浏览（`/w/<world>/wiki`、`/w/<world>/wiki/<slug>`）
- 个人主页（`/u/<username>`）
- 登录/注册（`/login`、`/register`）
- 探索公开世界（`/explore`）
- 后续地图、时间线、AI、工具页、账户/邀请页

旧的页面实现把所有页面静态 import 进 `App`，导致公开页也下载 Tiptap/ProseMirror/编辑器代码：production bundle 约 660 kB（gzip 208 kB），公开页没有编辑器却承担全部成本。用户反馈打开网页时风扇持续转；根因优先怀疑编辑器/ProseMirror 在公开页被加载、dev StrictMode 双重执行，以及顶栏 `backdrop-filter` 的 GPU 合成。

## 决策

1. **页面路由注册表 + 路由级 lazy 边界**
   - `src/app/routes.ts` 解析路径，返回 typed `Route`。
   - `src/app/RouteView.tsx` 是唯一页面边界，所有页面用 `React.lazy` 加载。
   - `Workspace` 是唯一静态引用 `CardEditor`/Tiptap 的 chunk；公开页永不加载它。
   - 新增页面先加 route 与 feature 文件，再接入壳；不把页面写进 `App` 的静态 import。

2. **公开阅读与编辑分离**
   - 公开 Wiki 用轻量 `RichText` 递归渲染 Tiptap JSON，不启动 ProseMirror。
   - 编辑器只在 `/w/<world>` 的工作区 chunk 中出现。
   - 公开页不依赖编辑器状态、不启动 editor 的定时器/事务。

3. **性能预算作为验收项**
   - 公开首屏 JS ≤ 120 kB gzip（当前入口 73.37 kB + 页面/共享 chunk，实测公开页无 editor）。
   - 工作区 editor chunk ≤ 160 kB gzip（当前 134.52 kB；只在 `/w/...` 加载）。
   - 公开首屏 CSS ≤ 40 kB gzip（当前 8.53 kB）。
   - 公开页常驻动画 0；顶栏不用毛玻璃；加载 spinner 必须结束。
   - P1 加 Lighthouse/CI budget；本地 LCP ≤ 2.5 s，空闲 CPU 接近 0。
   - 任何“页面变快”的声明必须给出 chunk/网络证据，不能只看截图。

4. **功能模块边界**
   - 前端：`app/`（路由/壳）、`components/`（页面）、`lib/`（纯函数/API 适配）、未来 `features/maps`、`features/ai`、`features/timeline`。
   - 后端：每个领域 app 独立；未来 `maps`、`ai` 各自 app/服务，不跨 app import 模型实现。
   - 共享能力（主题、session、CSRF、Topbar）进共享层；功能页只消费接口。

5. **当前范围的诚实边界**
   - 仍是 SPA；公开页 SSR、边缘缓存、SEO 是 P1，不由 lazy 分块冒充。
   - 探索/搜索是公开世界列表；全文搜索、筛选器、分页是后续。
   - 注册是开放注册的最小版本；邀请、限流、邮箱验证未做。

## 后果

- 公开页首屏成本从约 208 kB gzip 降到约 73–78 kB gzip；Tiptap 只在工作区加载。
- 路由多一层 `Suspense` fallback；每个页面需独立测试加载失败/空态。
- 未来地图/AI 工具可以独立 lazy chunk 与独立权限边界，不会污染公开阅读面。
- 需要持续维护 route registry 和 bundle budget；新增页面若绕过 registry 会重新引入退化。

## 验证

- `npm run build` 输出：入口 `230.68 kB / 73.37 kB gzip`；Workspace `412.54 kB / 134.52 kB gzip`。
- Production preview 首屏传输 JS 约 77.6 kB，资源列表不含 `Workspace`/Tiptap。
- 公开 Wiki/卡片页 DOM 无 `.tiptap`，RichText 正常渲染。
- 390/1280 下 explore、register、wiki、wiki card 无横向溢出。
