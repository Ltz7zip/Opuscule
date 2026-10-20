# Opuscule UI 优化美化计划

- 日期：2026-10-21
- 范围：`frontend/`（React 19 + Vite 8 + TS + Tiptap 3）；不含后端功能开发
- 依据：UI 专家团 6 成员独立分析（品牌 / 视觉系统 / 画像走查 / 发布验收 / UX 架构 / 创意），主理人交叉核验后裁决
- 状态：P0 可执行；P1/P2 待范围确认

## 0. 一句话结论

现有功能边界内，**"美化"的第一优先级不是换视觉，而是先让主题可信、组件成套、状态完整**。三份资料指向同一套单色语言（Minimalist README 的 `#2563ef` / 25.2px 与同目录 CSS 矛盾，属过期叙事，以 CSS 为准）；20 屏设计稿中 11 屏已实现，其余 9 屏需显式延期，否则会做成假页面。

## 1. 资料结论（已核验）

| 资料 | 事实 | 用途 |
|---|---|---|
| `~/Downloads/Minimalist/` | `colors_and_type.css` + `css.json` 三层 token，单色、radius 12 / sm 6 / lg 16、阴影 0.04–0.14；README 声称蓝色主色与 25.2px，与 CSS 直接冲突 | token 唯一真源；README 判过期 |
| `~/Downloads/工作区 等 20 个设计/pages/` | 20 页全部 `data-theme="dark"`、0 条 `@media`；依赖 CDN Tailwind/Lucide，`assets/` 为空（34 个图标 404） | 结构与文案基准，不作可复现 golden |
| `~/Downloads/PNG/` | 与 HTML 同源的**浅色**导出（版式/文案/空态按钮一致），不是当前实现截图 | 浅色验收参考 |
| `.design/current/index.html` | 177KB《Opuscule 重构方案 · 设计评审稿》，非 UI 稿 | 从"设计基线"移除 |
| `frontend/src/styles/tokens.css` | 已按 Minimalist 实现一版深色单色；暗色表面比设计暗一档（`#0a0a0a` vs `#18181b`） | 改造起点 |

## 2. 量化基线（前后对照）

| 指标 | 现值 | 目标 |
|---|---|---|
| `app.css` | 1540 行 / 807 规则 / 758 唯一选择器 | 拆 6 层，净减 200–250 行 |
| 字号 | 238–259 条声明、21–35 种取值、约 63% < 12px、28 条 ≤ 9px | ≤ 8 档，正文 ≥ 12px |
| 圆角 | 90 条 / 20 种 | 3 档（8 / 12 / 999） |
| 间距 | 127 种 padding，61% 非 4 的倍数 | 4 基数 7 档 |
| 断点 | 7 个（560/640/720/760/860/900/980），全 max-width | 640 / 900 / 1200，min-width |
| 交互态 | 60 条 `:hover` vs 4 条 `transition`、4 组 `focus-visible` | 过渡统一，focus 全覆盖 |
| 重复 | 59–68 组重复声明块；`tiptap` / `rich-*` 10 组重复且已漂移（h1 1.9 vs 1.85） | 1 套 `.prose` |
| 浅色破损 | 10 处裸 hex（对比度 1.56–1.97:1）+ 6 类固定 `rgba` 浮层 + 未定义 `--danger` | 全部 token 化 |
| 体积 | CSS gzip 15.1 / 40KB；workspace JS 165.4 / 175KB | 不回归 |

> 成员统计口径略有差异（字号 238 vs 259、断点 7 vs 10+），不影响结论；以同一条 `app.css` 为准，实施前用脚本复核一次。

## 3. 范围

**纳入本轮（11 屏 + 4 状态页）**：`/`、`/explore`、`/search`、`/w/:slug/wiki`、`/w/:slug/wiki/:card`、`/w/:slug`（工作区）、`/w/:slug/map`、`/w/:slug/timeline`、`/login`、`/register`、`/worlds/new`、`/u/:username`、`/trash`、邀请页；新增 404 / 500 / 维护 / 缺失世界与卡片。

**显式延期（不承诺）**：关系树（无模型）、时代页（`CardSummary` 无 era）、访问闸门（无口令字段）、重置密码（P5.2 未做）、设计稿里的 ⌘K / 图层 / 画笔 / 三栏地图。

## 4. 采用的默认值（待确认项见 §8）

| # | 议题 | 裁决 |
|---|---|---|
| D1 | 视觉契约 | `tokens.css` + 20 页 CSS 为 v1；README 蓝色/25.2px 标记过期；评审稿降级为架构文档 |
| D2 | 主题 | 暗色保持默认（不改现状，避免闪烁），浅色为一等公民；cookie + SSR 内联初始化 |
| D3 | 色彩 | 单色底；允许 1 个批注色（墨蓝 `#4c6280` / 暗 `#a9bcd4`）+ `success/destructive`；纪元 7 色收敛为单色 4 阶；朱色印章仅品牌态（≤3 处，待拍板） |
| D4 | 几何 | 控件 8 / 卡片 12 / 头像 50%；**按钮不全面胶囊化**（保留设计稿 12px，避免全站 60+ 按钮改观感）；移动端触控 ≥ 44 |
| D5 | 字体 | 保留一个"衬线时刻"（公开世界与文档 H1），锁系统栈（Songti SC / Noto Serif SC / Georgia）；未加载的 DM Serif 声明删除或单独立项 |
| D6 | 组件 | primitives 增量迁移，不重写 1540 行；`app.css` 5 批拆 6 层 |
| D7 | 趣味 | 只做版式层（版本行 / 印记 / 页边），CSS ≤ 2KB，不进正文，`prefers-reduced-motion` 全关 |

## 5. 路线图

### P0 · 1–2 周（约 8–10 人日，先清障）

| # | 问题 | 改法 / 落点 | 验收 | 人日 |
|---|---|---|---|---|
| P0-1 | 主题不可信：Toggle 恒初始化为 dark 并覆盖存储；SSR 硬编码 `data-theme="dark"` | `ThemeToggle.tsx` 惰性读 `documentElement.dataset.theme`、挂载不写存储；`index.html` + `server.mjs:29` + `server.prod.mjs:46` 注入读 cookie 的阻塞式初始化；`theme-color` 随主题 | 浅/深 × 新访客/已存偏好 4 组；首帧=稳定帧；连续跳 4 页不翻转 | 1 |
| P0-2 | 暗色表面比设计暗一档；浅色缺状态色 | `tokens.css`：bg `#18181b`、card/popover/muted `#27272a`、border `#3f3f46`；light 补 success/destructive 四件套；阴影降到 0.04–0.14；新增 `--overlay` | 暗色 border/card ≥ 1.4:1；浅色 `.form-error` 不再是深底 | 1 |
| P0-3 | 约 20 处写死深色 / 裸 hex（编辑器浮层、时间线、通知、错误、表头、纪元 7 色） | 替换 `app.css:1275/1284/1293/1308/1317/1346/1351/1368/1404/1417/1420/1426–1429/1436/1459/1495–1500/1537–1539`；补 `--danger`；纪元色改 4 级单色 | 浅色下浮层/表格/时间线/通知/错误可读，文字 ≥4.5:1；非 token 硬编码色为 0 | 1 |
| P0-4 | 侧栏底部主按钮被挤成竖排；死入口 | `Sidebar.tsx:195–320` + `app.css:306–307`：主按钮独占一行、其余收进"更多"；active 改实心反色；删 `P0.2` 文案与"维基"死项 | 244px 侧栏按钮单行；1024/768 不溢出；无无 handler 按钮 | 1 |
| P0-5 | 内部语汇与死状态上公共面 | `PublicHome.tsx:111/157`、`EmptyState.tsx:15–32`、`Sidebar.tsx:199`、`ProfilePage.tsx:246`、`index.html:8`、`WikiPage.tsx:205`：删 `P0.x`/演示数据/设计参考；空态三入口接真实路由；双 h1 去重；slug/revision 移入详情 | `rg "P[0-9]\.[0-9]\|演示数据\|设计参考 Minimalist"` 为 0；空态无 disabled；侧栏单行 | 1 |
| P0-6 | 无 404/500/维护页；未知路径软回落首页（200）；SSR 404 是内联深色裸页 | 新增 `components/StatusPage.tsx`（404/500/maintenance/not-found-card/world）+ `ErrorBoundary`；`routes.ts` 增 `not-found`；`server.mjs:102/201/215/243` 与 `server.prod.mjs` 同步 | `/definitely-missing` 返回 HTTP 404 且渲染品牌版式；抛错显示 500 态 | 2 |
| P0-7 | 缺世界级导航，地图/时间线只能手输 URL | 新增 `WorldNav.tsx` + `SiteShell`/`WorkspaceShell` 骨架；公开态 `首页/条目/地图/时间线/搜索`，工作区态 `工作台/时间线/地图`；active 由 `route` prop 推导 | 任一世界页 1 次点击到达其余 4 面；SSR/CSR active 一致（可放 P1 首） | 3 |
| P0-8 | 品牌符号三版（Orbit / Box / favicon 圆环），Box 兼作空态图标 | 新建 `BrandMark.tsx`（内联 SVG，24×24，1.25 描边），三处引用；favicon 同源导出 | 三处同源；20/40px 清晰；对比 ≥4.5:1 | 0.5 |

> 若只做一周：P0-1/2/4/5 是"看起来是否活着"的四条，约 3–4 人日。

### P1 · 3–4 周（约 12–15 人日，成体系）

1. **Primitives v1**：Button/IconButton、Field、Card、Segmented、Dialog、SectionHeader；新建 `styles/primitives.css`，`@import` 在 `app.css` 之前，迁移 topbar/sidebar/auth/empty/dialog（2–3 人日）。
2. **token 收敛**：字号 11/12/13/14/16/20/24/28、间距 4/8/12/16/24/32/48、圆角 8/12/999、断点 640/900/1200；`app.css` 分批替换（3.5 人日）。
3. **prose 统一**：`tiptap` 与 `rich-*` 合并为 `.prose`，消除 h1/行高漂移（1 人日）。
4. **Dialog 体系**：替换 11 处 `window.prompt` + 9 处 `window.confirm`，补焦点陷阱/初始焦点/返回焦点/Esc（2 人日）。
5. **编辑器 chrome**：气泡/斜杠/提及/媒体/表格条/评论抽屉统一 `--popover` + `--border-strong` + `--shadow-lg`，去 blur（2 人日）。
6. **地图 / 时间线 chrome**：pin 三态 + 2px ring、缩放 pill、legend 8px dot；事件卡 token 化、选中 ring、纪元单色 4 阶、底部状态条（3 人日）。
7. **公共阅读面**：TOC、上下篇、信息框（待数据）、版本行页脚、衬线 H1（3 人日）。
8. **移动端**：Wiki 侧栏改折叠目录、320/390 无横向溢出、触控 ≥44（2 人日）。
9. **视觉门禁** `scripts/check_ui.py`（stdlib）：未定义 `var()`、裸 hex、字号下限、对比度、路由 smoke；接入 `make ci`（1 人日）。

### P2 · 长期

- `app.css` 拆 `tokens / base / layout / components / prose / pages/*`，删死规则（`.public-nav`、旧时间线列表），净减 200–250 行。
- 双密度 `data-density`（工作区紧凑 / 公开舒适）；地图改沉浸式 `CanvasShell`。
- 档案细节组件：`EditionLine`（修订 rN · 日期 · 公开 vN）、`Seal`（公开/私有/只读，≤3 处）、页边批注栏（≥1200px）。
- 字体策略与品牌资产库；语气 A/B（档案员版 vs 中性版）。
- per-world「藏书票」：复用 `theme_json`（已存在，无需迁移），但需后端 schema 白名单，属功能增量。

## 6. 验收门禁（建议写入发布单）

- [ ] 文字对比 ≥4.5:1，UI 边界 ≥3:1；浅色下浮层/表格/时间线/通知可读。
- [ ] 所有交互元素有可见 `:focus-visible`；键盘可完成顶栏、侧栏、搜索、Wiki、主要弹窗。
- [ ] 无 `P0.x` / 演示数据 / 设计参考 / 本地 demo 凭据等用户可见内部信息。
- [ ] 无死按钮 / 死链接 / `window.prompt|confirm`（合理 fallback 除外）。
- [ ] 所有数据屏具备 loading / empty / error 三态，错误有恢复路径。
- [ ] 404 / 500 / 未知路由 / 缺失世界 / 缺失卡片：品牌化页面 + 正确状态码。
- [ ] SSR 首帧主题正确；匿名 SSR 有登录入口；登录态 header 无 `·` 占位。
- [ ] 截图矩阵：6 代表屏 × 2 主题 × 3 宽度（1440/768/390）+ 320 溢出检查。
- [ ] `check:budget` 不回归（CSS ≤40KB、workspace ≤175KB）。
- [ ] `check_design.py` 只校验标签闭合，**不得**作为 UI 验收依据。

## 7. 风险

| 风险 | 触发 | 缓解 |
|---|---|---|
| token 改动波及全站 | 改 `tokens.css` | 单独分支；先 light/dark 对照；截图基线 |
| 字号收敛伤密度 | 时间线标签/浮层 8–10px | 白名单；先 4 屏验收 |
| 世界导航 hydration 不匹配 | active 由 `window.location` 推导 | active 从 `route` prop 传入 |
| 字体体积/授权 | 自托管中文衬线数 MB | 本轮锁系统栈；字体单独立项 |
| 资料不完整 | PNG 仅抽看、assets 空、无 axe/跨浏览器 | 实施后补验；不以截图推断全部结论 |

## 8. 待确认（6 项，不阻塞 P0）

1. 默认主题：暗色（当前/设计）还是跟随系统？
2. 视觉签收人是谁（当前无设计验收人，无法最终签收）。
3. 范围：确认只承诺 11 屏 + 4 状态页，9 屏延期。
4. 批注色：墨蓝 / 赭石 / 完全单色（只保留 success+destructive）。
5. 字体预算：是否允许自托管 Latin 子集（+20–30KB，影响 LCP）。
6. SSR 登录态是否本轮做（涉及 session cookie / CSRF / 缓存）。

## 9. 两周执行顺序（建议）

- **第 1 周**：P0-1 → P0-2 → P0-3 → P0-4 → P0-5；结束时出 6 屏 × 2 主题截图基线。
- **第 2 周**：P0-6 → P0-8 →（P0-7 若人力允许）→ 补 `check_ui.py` 首版 → 复验 §6 清单。

## 10. 落地状态（2026-10-21）

P0 八项已全部完成，并通过 `make ci`。

| # | 项 | 落点 |
|---|---|---|
| P0-1 | 主题可信 | `ThemeToggle.tsx` 惰性读 DOM、不写存储；`index.html` 首帧脚本；`server.mjs` / `server.prod.mjs` 读 `opuscule-theme` cookie 输出 `data-theme` 与 `theme-color`；toggle 同步写 cookie |
| P0-2 | token 回设计值 | `tokens.css`：bg `#18181b`、card `#27272a`、border `#3f3f46`；浅色补 success/destructive；阴影 0.04–0.14；新增 overlay / ink / era / 字号 / 间距 / 圆角 token；字体改系统栈 |
| P0-3 | 清硬编码 | `app.css` 裸 hex 与固定深色 `rgba` 清零；7 色纪元 → 4 级单色；`--danger` 补定义；浮层统一 `--popover` |
| P0-4 | 侧栏 | 主按钮独占整行；工具收进「更多」菜单；active 实心反色；删除死「维基」tab |
| P0-5 | 文案与死状态 | 删 `P0.x` / 演示数据 / 设计参考；空态三入口接真实路由；Wiki slug 与「重置筛选」移除；编辑器占位文案改写；demo 凭据仅 DEV |
| P0-6 | 状态页 | 新增 `StatusPage.tsx` / `ErrorBoundary.tsx`；`not-found` 路由；dev 与 prod SSR 未知路径返回 **HTTP 404** 品牌页；世界/卡片缺失用专属变体 |
| P0-7 | 世界导航 | 新增 `WorldNav.tsx`，公开首页 / Wiki / 地图 / 时间线各 1 次点击互达 |
| P0-8 | 品牌符号 | 新增 `BrandMark.tsx`，顶栏 / 登录 / 注册 / favicon 同源；空态不再复用 Box |

额外修复（走查中发现并已验证）：**打开卡片会自动 PATCH 并把 `revision` +1**。`CardEditor` 的 `onUpdate` 现在先比较内容 JSON，内容未变则不标脏、不保存。复验：连续 reload 修订号保持 154；真实编辑与撤销各触发一次保存，内容复原。

### 验证证据

- `make ci`：backend check / migrations / tests、design checker、`build:all`、`check:budget` 全绿（entry 74.4/120、workspace 165.3/175、css 14.3/40 kB）。
- `curl /definitely-missing` → `404` + `status-card`；带 `Cookie: opuscule-theme=light` 时 `data-theme="light"`、`theme-color #ffffff`。
- Playwright：深色 `#18181b` / 浅色 `#ffffff`；正文对比 16.97 / 17.72，次要文字 6.91 / 7.73；键盘 Tab 命中 2px 实线焦点环；390px 无横向溢出；侧栏「新建文档」单行（212×32）。
- 浏览器控制台：SSR 页 0 error。

### 仍未覆盖（进入 P1）

- 移动端触控目标 30px（< 44）与 Wiki 移动端侧栏仍占首屏。
- `scripts/check_ui.py` 视觉门禁未落地；`check_design.py` 仍只校验标签闭合。
- 组件 primitives、prose 去重、Dialog 替换 prompt/confirm、地图/时间线 chrome、TOC/上下篇均在 P1。
- 设计稿 `assets/` 仍为空，PNG 仅作参考，未作为截图 golden。

## 11. P1 第一批（2026-10-21）

### 11.1 视觉契约门禁

新增 `scripts/check_ui.py`（stdlib，无依赖），`make ui-check`，并接入 `scripts/ci.sh`：

- `var(--x)` 全部可解析（当前 115 个定义，0 未解析）；
- `tokens.css` 之外禁止裸 hex；
- 深浅两套主题 token 齐全，并按 WCAG 校验正文 / 次要文字 / 主按钮 / 卡片描边对比度；
- 用户文案不得出现 `P0.x`、演示数据、设计参考等内部标记；
- 计划要求的组件文件存在；
- dev / prod SSR 都从主题 cookie 解析 `data-theme`。

### 11.2 移动端

- Wiki 侧栏在 ≤900px 改为单行横向 chip 导航（隐藏分组标题、类型与搜索），不再用整屏列表推走正文：390px 下 H1 顶部从 392px 提前到 231px，导航高度 34px，可横向滚动。
- 顶栏控件与 world nav 在 ≤640px 提升到 44px 触控目标；320px 下无横向溢出；≤380px 时顶栏第二行改为整行右对齐，避免主按钮悬空。
- 实测 320px：`scrollWidth === clientWidth`，文章标题位于 308px（首屏 44%）。

### 11.3 排版统一（prose）

`.tiptap` 与 `.rich-text` 的标题 / 段落 / 列表 / 引用 / 代码 / 表格外框合并为一套共享规则，删除重复的 `.rich-text` 排版块：

- h1 由编辑器的 1.9em 与发布页的 1.85em 统一为 **1.85em**；
- 行高由 1.8 / 1.85 统一为 **1.85**；
- 段落间距、pre 外边距、图片圆角在两端一致，编辑器所见更接近发布所得。

### 11.4 阅读面细节

- 文章页去掉与顶栏重复的页内面包屑，只保留「返回 {世界} Wiki」。
- 文章 H1 改用衬线（Songti / Noto Serif SC / Georgia，500 字重），与公开世界 H1 形成同一条「档案排印」线索。

### 11.5 验证

- `make ci` 全绿；`check_ui.py` 全部 PASS；CSS gzip 14.5/40 kB。
- Playwright：390px Wiki H1 231px、320px 无溢出、触控目标 44px、文章 H1 为衬线 500、编辑器 h1 与发布页同为 27.75px。
- 浏览器控制台 0 error（SSR 页）。

### 11.6 下一步（P1 余项）

1. Primitives v1（button / field / card / segmented / dialog / section-header）与 6 层 CSS 增量迁移。
2. `window.prompt` / `window.confirm` 替换与焦点陷阱。
3. 地图 / 时间线 chrome、Wiki 目录与上下篇。
4. 字体策略与截图回归基线。

## 12. P1 第二批：对话框体系（2026-10-21）

原生 `window.confirm` / `window.prompt` 已全部替换为可访问的应用内对话框：

- 新增 `lib/dialogs.ts`：请求队列 + `confirmAction(options)` / `promptAction(options)`，返回 Promise；无 DOM 依赖，SSR 安全。
- 新增 `components/DialogHost.tsx`：`role="dialog"`、`aria-modal`、标题/描述关联、Tab 焦点陷阱、Escape 取消、关闭后焦点归还触发元素；危险操作默认聚焦「取消」。
- prompt 支持标签、占位符、默认值、提示行、多行（`Cmd/Ctrl+Enter` 提交）；confirm 支持危险态样式与自定义按钮文案。
- 21 处调用点全部迁移：12 个 prompt（图片/书签/折叠块/轮播/图标/封面/链接/分享/时间线/画廊）与 9 个 confirm（删除世界、撤销导入、删除评论、删除标记、删除事件/纪元、移除成员、转移所有权、撤销邀请）。

### 验证

- `make ci` 全绿；`check_ui.py` 新增「禁止原生 confirm/prompt」断言与 `DialogHost` 文件检查，全部 PASS。
- Playwright：prompt 打开后输入框获得焦点；Tab 在输入框 / 取消 / 保存间循环且不逃出；Escape 关闭并把焦点还给触发按钮；confirm 危险操作默认聚焦「取消」，取消后底层世界设置对话框保持打开；Enter 提交后对话框关闭且保存成功、无错误。
- 包体：entry 75.6/120 kB（+1.2 kB），workspace 165.6/175 kB，CSS 14.6/40 kB。

### 12.1 下一步（P1 余项）

1. Primitives v1 与 6 层 CSS 增量迁移。
2. 地图 / 时间线 chrome、Wiki 目录与上下篇。
3. 字体策略与截图回归基线。

## 13. P1 第三批：Wiki 阅读导航（2026-10-21）

- 新增 `lib/toc.ts`：从 `body_json` 按文档顺序提取标题，生成稳定 id `sec-1…N`；`RichText` 渲染标题时使用同一序号，SSR 与 CSR 一致。
- 文章页在标题区与正文之间渲染「目录」（≥2 个标题时显示）；标题设置 `scroll-margin-top: 96px`，锚点跳转不会被 sticky 顶栏遮住。
- `lib/tree.ts` 新增 `flattenCards()`：按集合顺序 + 未归类顺序展平，文章底部渲染「上一篇 / 下一篇」，保持与左侧文档树一致的阅读顺序。
- 移动端：目录与相邻导航自适应单列，390px 无横向溢出。

### 验证

- `curl` SSR：`article-toc`、`id="sec-1"`、`id="sec-2"`、上一篇 / 下一篇均出现在首屏 HTML。
- Playwright：目录链接为 `#sec-1` / `#sec-2`，点击后 `location.hash` 更新；上一篇「白塔沉没」、下一篇「潮汐历」与文档树顺序一致；390px 下相邻导航为单列、无溢出。
- `make ci` 全绿；CSS 14.8/40 kB。

### 13.1 下一步（P1 余项）

1. Primitives v1 与 6 层 CSS 增量迁移。
2. 地图 / 时间线 chrome。
3. 字体策略与截图回归基线。

## 14. P1 第四批：地图与时间线 chrome（2026-10-21）

- **地图空态**：画布内新增居中提示（定位图标 +「还没有标记」/「这个世界还没有标注地图」+ 操作提示），可编辑与只读两套文案；不再是一整块无信息的黑画布。
- **地图细节**：hero H1 改衬线；「人物」图例由实心点改为空心环，四类标记在单色体系下可区分。
- **时间线可读性**：事件标题 11.5 → 12px、元信息 9 → 9.5px、年份 8.5 → 9.5px、卡片最大宽度 176 → 184px；纪元标签 10 → 10.5px、提示条 10 → 11px；纪元底色层级拉开（era-1…4 的填充与描边各提高一档）。
- **开发体验**：SSR dev server 增加 `/api`、`/media`、`/static`、`/share` 反向代理到 Django，5174 预览下 SPA 页面（地图/时间线/登录）不再因相对 API 404 而报 JSON 解析错误。

### 验证

- 地图：`map-canvas-empty` 出现且 `pointer-events: none` 不挡放置点击；hero 为 Songti 衬线；图例「人物」为空心环。
- 时间线：5 张事件卡两两无重叠；标题 12px、元信息 9.5px、纪元 10.5px；hero 衬线。
- 5174：`/api/health/` 返回 `200 application/json`；地图页标题、空态正常，控制台 0 error；未知路径仍返回 404。
- `make ci` 全绿；CSS 14.9/40 kB。

### 14.1 下一步（P1 收尾）

1. Primitives v1 与 6 层 CSS 增量迁移。
2. 字体策略与截图回归基线。

## 15. P1 第五批：CSS 分层与 primitives（2026-10-21）

`app.css` 拆成 5 个文件，按依赖方向由 `app.css` 统一 `@import`：

| 文件 | 行数 | 职责 |
|---|---|---|
| `tokens.css` | 245 | 原始色阶、语义 token、字号 / 间距 / 圆角 / 阴影尺度 |
| `base.css` | 12 | reduced-motion 等全局基础规则 |
| `primitives.css` | 195 | 按钮、字段、面板、胶囊、状态、对话框 |
| `prose.css` | 47 | 编辑器与发布页共用的阅读排版 |
| `app.css` | 1387 | 布局与页面规则 |

同时删除已确认无 JSX 引用的死规则：`.public-nav`、`.segmented`、旧时间线列表
（`.timeline-list` / `.timeline-entry` / `.timeline-year` / `.timeline-body` /
`.timeline-link` / `.timeline-empty` / `.timeline-entry-actions`）及其媒体查询，
CSS gzip 从 14.9 kB 降到 **14.6 kB**。

新增 `frontend/src/styles/README.md`：记录分层、token 规则、断点现状与组件新增流程。

### 验证

- `make ci` 全绿；`check_ui.py` 全部 PASS（token 仍全部可解析，裸 hex 为 0）。
- Playwright 计算样式抽查：顶栏按钮 32px / 8px 圆角 / 12.5px；`.panel` 12px / `#27272a`；
  `.rich-text` 15px / 27.75px 行高；`.article-toc` 8px 圆角；工作区侧栏主按钮 34px；
  世界设置对话框 560px / 12px 圆角 / `#27272a`，字段高 38px。与拆分前一致。
- 控制台 0 error。

### 15.1 仍未做

1. 断点收敛：`560 / 760 / 860 / 980` 仍存在，随页面改造迁移到 640 / 900。
2. 字体策略（当前系统栈）与自动化截图回归基线。
3. `app.css` 中剩余的组件规则继续迁往 primitives（编辑器浮层、时间线控件）。

## 16. P1 收尾：断点收敛与验收协议（2026-10-21）

- 历史断点全部收敛：`980 / 860 / 760 / 720 / 560` → `900` 或 `640`；
  现在只保留 `640`（手机）、`900`（平板）、`380`（顶栏换行例外）。
- 抽查：800px Wiki 为单列 + chip 导航、标题在 231px；950px 恢复两列（230 + 648）；
  700px 工作区侧栏转为抽屉、菜单按钮可见、编辑器占满 668px；均无横向溢出。
- 新增 `docs/ui-review-checklist.md`：环境、主题、宽度矩阵、逐屏状态、检查项、
  记录表与已知缺口。像素级自动化因未引入 Playwright 依赖，暂以该协议替代。

### 16.1 字体结论

继续使用系统栈（PingFang / Songti / Noto Serif SC / Georgia）：
中文衬线自托管体积与授权成本高，当前预算下不引入字体文件；衬线只用于
公开世界、Wiki 索引与文章标题。该结论已写入 `frontend/src/styles/README.md`。

### 16.2 P1 完成度

P1 九项中已完成：prose 统一、Dialog 体系、编辑器与地图/时间线 chrome、
公共阅读面（TOC / 上下篇 / 版本行）、移动端、视觉门禁、CSS 分层、断点收敛。
剩余为持续项：继续把组件规则迁出 `app.css`、以及自动化截图基线。

## 17. P2 起步：公共站页脚与 TOC 去重（2026-10-21）

- 新增 `components/SiteFooter.tsx`：品牌 + 世界版次（名称 / 集合数 / 卡片数）+
  站点链接（首页 / 探索 / 搜索 / RSS）；首页、Wiki、探索、搜索、个人主页统一使用。
- 删除各页原来的 `.public-foot` / `.public-version` / `.profile-foot` 三套局部页脚
  与对应 CSS，页脚不再各写一份。
- 目录去重：正文第一个标题若与条目标题相同，则从目录中移除（id 仍保留），
  避免目录第一项紧贴页面 H1 重复；世界概览仍显示目录，人物条目不再显示。
- `check_ui.py` 的必需组件列表加入 `SiteFooter.tsx`。

### 验证

- SSR：首页 / 个人主页 HTML 含 `site-footer` 与站点链接；首页版次为
  「雾海纪年 · 3 个集合 · 6 张卡片」。
- 390px：页脚 136px 高、链接整行、无横向溢出。
- TOC：世界概览 1 个目录，人物条目 0 个（标题重复时隐藏）。
- `make ci` 全绿；CSS 14.7/40 kB。

### 17.1 后续（P2）

1. 档案细节：版本行组件化、`Seal` 印记（≤3 处）、页边批注栏。
2. 双密度 `data-density` 与沉浸式地图画布。
3. 继续迁移 `app.css` 中剩余组件规则；自动化截图基线。

## 18. 浅色主题巡检（2026-10-21）

workspace / 地图 / 时间线 / 对话框逐屏看过浅色后，修掉两个只会在浅色暴露的问题：

1. **选区颜色写死为深色**：`::selection` 用 `--brand-400` / `--brand-900`，
   浅色下变成深灰底 + 深字。新增 `--selection-bg` / `--selection-fg`，
   深色 `#52525b` / `#fafafa`，浅色 `#d4d4d8` / `#18181b`。
2. **编辑器被焦点环包成一圈**：通用 `[tabindex]:focus-visible` 命中
   ProseMirror 容器，浅色下出现整块黑色描边。补 `.tiptap:focus-visible { outline: none }`，
   选区与光标由编辑器自己绘制。

`check_ui.py` 的必需 token 加入 `selection-bg` / `selection-fg`，两套主题都必须定义。

### 验证

- 浅色选区 `#d4d4d8`、深色选区 `#52525b`；编辑器聚焦时 `outline-style: none`。
- 地图：画布白底 + `#e4e4e7` 网格、控件白底、空态可读；图例「人物」空心环可见。
- 时间线：事件卡白底深字、纪元带浅灰、无重叠。
- 世界设置对话框：白底、边框 `#d4d4d8`、输入框 38px、危险按钮红描边。
- `make ci` 全绿。

## 19. P2：档案识别（EditionLine + Seal）（2026-10-21）

- 新增 `components/EditionLine.tsx`：把文章头部原先散落的「修订 rN」「更新于 日期」
  收成一行等宽版次（`修订 r2 · 更新于 2026-10-20 · 公开条目`），补上可见状态。
- 新增 `components/Seal.tsx`：2° 倾斜、1px 当前色描边、75% 不透明的克制印记；
  只用于公开首页与 Wiki 索引两处（控制在 3 处以内）。
- `check_ui.py` 必需组件加入 `EditionLine.tsx` / `Seal.tsx`（共 9 个）。

### 验证

- SSR：首页与 Wiki 索引各 1 个 `seal`；文章页 1 个 `edition-line`。
- 计算样式：edition line 为等宽字体；seal `matrix(0.9994, -0.0349, …)`（−2°）、
  颜色 `#52525b`、左边距 8px。
- 浅色下两枚印记与版次行均可读；文章页无目录（标题与条目名重复时隐藏）。
- `make ci` 全绿；CSS 14.8/40 kB。

### 19.1 P2 剩余（产品决策已回复，2026-10-21）

1. 双密度 `data-density`：**不做**。
2. 沉浸式地图画布：**做**（见 §21）。
3. 页边批注栏：**不做**。
4. 自动化截图基线：**做**（见 §22）。

## 20. 无障碍基础：跳过导航与主内容地标（2026-10-21）

- 新增 `components/SkipLink.tsx`：每个页面的第一个 Tab 停靠点是「跳到正文」，
  聚焦时以固定胶囊出现，其余时间隐藏在视口外。
- 14 个 `<main>` 全部补 `id="main-content"` 与 `tabIndex={-1}`；
  激活跳转后焦点真正落到 `main`，继续 Tab 直接进入正文。
- 发现并修复公共首页**完全没有 `<main>` 地标**：内容区补上 `main`，
  页脚移到 `main` 之外。
- `Topbar` 统一渲染跳过链接（所有带顶栏的页面），`StatusPage` 自行渲染；
  `check_ui.py` 要求 `SkipLink.tsx` 存在、且每个含 `<main>` 的组件都带 `id="main-content"`。

### 验证

- SSR：首页 / Wiki / 404 均输出 `class="skip-link"` 与 `<main id="main-content" tabindex="-1">`。
- 键盘：首屏 Tab 命中 `A.skip-link`（transform 归零、top 12px）；Enter 后
  `location.hash="#main-content"`、`document.activeElement === main`、页面滚动 98px。
- `make ci` 全绿；entry 75.7/120 kB、CSS 14.8/40 kB。






## 21. P2：沉浸式地图画布（2026-10-21）

按批准方案把地图改成全视口舞台（≥1100px）：

- `.map-shell.immersive` 取消 1200 容器与左右 padding，画布高度
  `calc(100vh - 97px)`、无圆角、左右无边框，直接铺满视口。
- Hero 变为左上浮层卡片（毛玻璃 + 边框，400px），链接恢复可点击；
  `has-map` 才启用浮层，加载/错误态仍是普通 hero。
- 地图说明面板浮在右上（300px，低于缩放控件），图例浮在左下，控件右对齐 1100 内容线。
- `<1100px` 完全回退到原流式布局（hero 在上、面板在卡片内、画布 4:3），
  900px 实测 519px 高、无横向溢出。

### 验证

- 1440×900：画布 1440×803、页面高度 901、图例 bottom 885（首屏可见）；
  hero `position: absolute` / top 18；面板 absolute / right 170；无横向溢出。
- 深色与浅色各截图确认可读；空态仍居中。

## 22. P2：自动化截图基线（2026-10-21）

- 新增 devDependency `@playwright/test@1.64.1`（唯一新增依赖，用于截图回归）。
- `frontend/playwright.config.ts`：复用本机 Chrome（`channel: "chrome"`），
  `webServer` 自动复用/启动 Django 8000 与 SSR 5174；desktop 1440×900 + mobile 390×844。
- `frontend/tests/ui/public.spec.ts`：首页 / Wiki / 文章 / 探索 × 深浅主题，共 16 张全页基线。
- `npm run ui:snapshots` 比对（1% 像素容差），`npm run ui:snapshots:update` 重建基线。
- 基线存于 `frontend/tests/ui/__screenshots__/`（1.7 MB）；临时产物已加入 `.gitignore`。
- 不并入 `make ci`：基线绑定本机 Chrome 与系统字体，跨系统比较会误报。

### 验证

- 首次 `--update-snapshots` 生成 16 张；随后直接比对 16/16 通过（17s）。
- 抽查 `home-light-desktop.png` 为 1440×1509 浅色全页，页脚、版次行、卡片齐全。
- `npx tsc --noEmit` 通过；`make ci` 全绿。

## 23. 转向：原站视觉复刻（2026-10-21）

用户确认以 https://opuscule.cc 为基准全站复刻原站风格，保留现有功能，
以“同内容视觉一致”为验收。已建立独立规格 `docs/plans/20261021-original-parity.md`，
并完成基座第一步：自托管 Geist / Geist Mono / DM Serif Display，字体 token 切换。
后续按 全局壳 → 个人页 → 公共页 → 工作区 → 地图/时间线 顺序推进。
