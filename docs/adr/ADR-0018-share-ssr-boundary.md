# ADR-0018：服务端分享页与完整 SSR 的边界

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0014（页面模块/性能）、P1.2 SEO、P1.3

## 背景

SPA 的动态 meta 对执行 JS 的搜索引擎有效，但社交爬虫/无 JS 客户端通常只读初始 HTML。
完整 React SSR 需要 Node SSR 管线、数据预取、hydration、部署与缓存改造；当前仓库没有生产服务器。

## 决策

1. 增加独立 Django 分享页 `/share/w/<world>/[<card>/]`、`/share/u/<username>/`，服务端输出只读 HTML。
2. 分享页不加载 React/Tiptap，不承担编辑/交互；只显示标题、世界/卡片摘要、canonical/OG。
3. 分享页 `noindex,follow`，canonical 指回 SPA 的公开 URL，避免重复索引。
4. 私有/软删内容 404；分享页缓存 60s。
5. 分享页不是应用 SSR：SPA 仍是客户端渲染；完整 SSR/SSG 需要单独立项。
6. 分享入口在 Wiki 卡片，复制 `/share/...` 链接；不伪造平台分享 API。

## 后果

- 社交/无 JS 客户端能读到真实 HTML 内容；不需要 Node SSR 管线。
- 分享页与 SPA 是两套只读视图，存在样式/正文表达差异；分享页正文退化为纯文本。
- 没有 hydration、没有交互、没有 OG 图片；SEO 主 URL 仍依赖 SPA。
- 后续若做完整 SSR，分享页可作为过渡/预览面，不应与 SSR 混淆。

## 验证

- 43 tests：公开分享页 200 + meta；私有/软删/私卡 404；profile 404。
- 浏览器直连 Django 分享页内容/OG/无控制台错误；Wiki 分享按钮复制链接。
