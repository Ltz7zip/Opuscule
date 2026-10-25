<!--
  用途：交给 AI（Claude Code / Codex / Cursor 等）执行的一次性前端改造任务书。
  目标项目：Opuscule frontend/（React 19 + Vite 8 + TS 5.x/7.x + Tiptap 3，Django SSR）。
  版本：2026-10-25。与 docs/plans/20261021-ui-beautification-plan.md 配套，
  冲突时以本文件为准（本文件是「极简 + 共享元素」方向的新裁决）。
-->

# 任务

你是一名资深前端视觉工程师兼动效设计师。在不改变任何功能、路由、文案、API 契约与后端行为的前提下，把 `frontend/` 的界面重做为**极简主义**风格，并让页面之间、列表与详情之间、同一页面的状态之间**大量使用共享元素（shared element）转场**。

一次交付，分阶段、可回滚、可验收。不要开新分支之外的破坏性重构。

---

## 0. 先读，别猜

按顺序读，读完后先输出 10 行以内的计划（问题诊断 / 改造顺序 / 风险最高的 3 处），再动手改第一屏：

- `AGENTS.md`、`frontend/src/styles/README.md`（样式分层、token 规则、断点约定）
- `frontend/src/styles/tokens.css`（唯一色值来源）+ `primitives.css` / `prose.css`
- `frontend/src/styles/legacy-site.css`（公开页实际外观）、`legacy-workspace.css`（工作区）
- `frontend/src/app/routes.ts`、`App.tsx`、`RouteView.tsx`、`main.tsx`、`index.html`
- 你要改的屏对应组件（`components/` 下同名文件）
- 门禁：`scripts/check_ui.py`、`scripts/ci.sh`、`frontend/scripts/check-budget.mjs`
- 背景：`docs/plans/20261021-ui-beautification-plan.md`、`docs/plans/20261021-original-parity.md`

**关键事实（不要推翻它）**：这个应用没有客户端路由。所有页面切换都是整页文档导航（`<a href>` / `window.location.assign`），部分页面 SSR 首屏、其余 CSR 水合。因此共享元素的主机制是**跨文档 View Transitions**，不是 SPA 过渡。

---

## 1. 硬约束（违反即回退）

1. **零新依赖**。共享元素只用原生 View Transitions API + CSS，禁止 framer-motion / GSAP / Lottie / 动画组件库。
2. 不使用 `react` 实验通道的 `<ViewTransition>` 组件；只用 `document.startViewTransition` 与 CSS。
3. **不动导航机制**：不引入 React Router、不把整页导航改成 `pushState`。那会同时打坏 SSR 首屏、分享页、404 状态码和按路由 code-split。
4. SSR 行为不变：`server.mjs` / `server.prod.mjs` 的主题 cookie 注入、`data-theme`、404 语义、`manifest` 反代都保持；所有动效在**无 JS**、**JS 未水合**、**API 不支持**三种情况下必须退化为可直接使用的普通页面。
5. 公开页必须支持浅色主题：`site-*` 这层现在只有深色（`legacy-site.css` 无 `[data-theme="light"]` 分支），这是本轮必须修掉的缺陷，不是可选项。
6. 语义 token 只在 `tokens.css` 的 `:root` 与 `[data-theme="light"]` 两处定义；其它样式表里出现裸 hex 会被 `check_ui.py` 拒绝。`--era-1` 等 token 被门禁点名必须保留，只是不再用彩色。
7. 文案、URL、aria 属性、焦点顺序、表单行为一律不变；`window.confirm/prompt` 仍禁用（走 `lib/dialogs.ts`）。
8. 断点只用 `640px` / `900px`（`380px` 仅限顶栏换行例外）；≤640px 触控目标 ≥44px；320px 无横向溢出。
9. `check:budget` 不回归：entry ≤120kB、workspace ≤175kB、CSS ≤40kB（gzip）。本任务的 JS 增量预算 ≤1.5kB，CSS 增量 ≤3kB。
10. 所有动效在 `prefers-reduced-motion: reduce` 下关闭（见 §3.5）。

---

## 2. 视觉方向：极简 = 可判定的规则

用「删」而不是「加」来变好看。下面 9 条是验收判据，不是形容词：

1. **结构靠线，不靠影**。卡片/面板边界是 `1px solid var(--border)`；阴影只允许出现在真正悬浮的层（dialog / popover / menu / 拖动中的卡片），且最多 `--shadow-md`。
2. **半径三档**：控件 8（`--radius-sm`）、面 12（`--radius`）、胶囊 999。页面里清空 `--radius-xs`(4) 与 `--radius-lg`(16) 的使用（token 可留）。
3. **字号八档、间距 4 基数**：11/12/13/14/16/20/24/28 与 4/8/12/16/20/24/32/48。页面 CSS 里不允许出现字面量 `font-size`、`padding`、`gap` 数值，一律 `var(--text-*)` / `var(--space-*)`；确需中间值用 `calc(var(--space-2) * 1.5)`。需要 <11px 的地方不要新增档位，改为重排（tooltip / 两行 / 隐藏次要列）。
4. **一屏一个焦点**：每页只有一个「主角」（封面、正文、画布、某个主卡片），其余全部降到 `--muted-foreground`。
5. **单色 + 2 状态色 + 1 批注色**。公开页的 `--legacy-era-*` 七色彩带改单色 4 阶（`--era-1..4`）+ 描边差异；地图四类标记改「灰阶 + 形状 + 图例」，不允许只靠色相区分。
6. **删装饰**：`.app-shell` 的径向渐变背景、装饰性 `backdrop-filter`、霓虹描边、玻璃质感一律删除。`backdrop-filter` 只允许 sticky 导航与模态遮罩。
7. **留白即层级**：段落节奏 24 / 32 / 48；卡片内边距 16；列表行高 44（桌面）/ 48（触控）；正文行宽 ≤ 68ch。
8. **文字层级只有三种灰**：`--foreground`（标题）、`--muted-foreground`（正文与元信息）、`--border` / `--border-strong`（分隔线）。禁止出现第四种灰。
9. **图标**：只用 `lucide-react`，尺寸 16/18/20，`stroke-width: 1.5`，与文字基线对齐；一页最多一种强调式用法。

> 唯一保留的「非极简」反差：`--font-serif`（DM Serif Display / Songti）只用于公开世界 H1 与文章 H1，作为排印记号。

---

## 3. 共享元素系统

### 3.1 两种机制

| 场景 | 机制 | 说明 |
|---|---|---|
| 页面跳转（主流程） | 跨文档 View Transitions：`@view-transition { navigation: auto; }` | 零 JS、SSR 友好、无 API 时自动退化为普通跳转 |
| 同页状态变化（工作台开卡、灯箱、面板） | `document.startViewTransition()` + `flushSync` | 必须同步提交，异步数据不能包在过渡里 |

两者共用同一套命名、时长与降级规则。

### 3.2 命名：静态目标 + 悬停源

新增 `frontend/src/lib/viewTransition.ts`：

```ts
export type VtKind = "cover" | "icon" | "avatar" | "title";

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

/** 目标页（每页只有一个）用静态命名。 */
export function vt(kind: VtKind, id: string) {
  return {
    viewTransitionName: `vt-${kind}-${safe(id)}`,
    viewTransitionClass: kind,
  } as CSSProperties;
}

/** 同文档过渡：无 API / 减少动效 / 页面隐藏时直接提交。 */
export function runViewTransition(commit: () => void): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("startViewTransition" in document) || reduce || document.hidden) return commit();
  try {
    document.startViewTransition(() => flushSync(commit));
  } catch {
    commit();
  }
}
```

**源侧必须用「悬停/聚焦时命名，离开即清除」**，否则网格页会有 N 个同名元素，整次过渡会被浏览器丢弃：

```tsx
function useSharedSource(kind: VtKind, id: string) {
  const ref = useRef<HTMLElement>(null);
  const name = `vt-${kind}-${safe(id)}`;
  const set = () => { if (ref.current) ref.current.style.viewTransitionName = name; };
  const clear = () => { if (ref.current) ref.current.style.viewTransitionName = ""; };
  return { ref, onPointerEnter: set, onPointerLeave: clear, onFocus: set, onBlur: clear, onTouchStart: set };
}
```

不变量：
- 任意时刻，同名元素**全页只能有一个**。重名 = 浏览器丢弃整次过渡并报 `Unexpected duplicate view-transition-name`。
- 命名只挂在**叶子级**：封面 `<img>` / 图标方框 / 头像 / H1。禁止挂在容器、网格、`<main>`、`canvas`、`video`、`html`/`body`/`#root`（`root` 是保留名）。
- 名字前缀固定 `vt-`；`id` 用 slug/username/world slug，稳定且两侧一致。
- **目标侧命名必须写在渲染输出里**：SSR 页面（首页 / Wiki / Explore / Profile）由 `renderToString` 输出，命名要用组件上的静态 `style={vt(...)}` 进入服务端 HTML；不要在 `useEffect` 里后挂，否则新页快照拍不到名字，动画静默失效。
- 列表页**默认不静态命名任何行**；只有指针/焦点落在哪一行，那一行才有名字。列表里同时出现同一实体的地方（如 Wiki 文章页左侧树）**一律不命名**。
- 触屏在 `touchstart` 命名；键盘进入已有 `focusin` 命名。浏览器前进/后退时目标页没有悬停源，就只保留根淡入淡出——不要为了这个给整页网格命名。

### 3.3 配对表（至少这 10 组）

| # | 从 | 到 | 共享元素 | kind |
|---|---|---|---|---|
| 1 | `/` 世界卡 | `/w/:slug/wiki` | `.site-tile-cover` → `.site-page-cover` | cover |
| 2 | `/explore` 卡 | `/w/:slug/wiki` | 卡片封面 → hero 封面 | cover |
| 3 | `/w/:slug/wiki` 卡 | `/w/:slug/wiki/:card` | 卡片封面 → 文章头封面 | cover |
| 4 | `/search` 结果 | `/w/:slug/wiki/:card` | 类型图标方块 → 文章类型标记 | icon |
| 5 | `/w/:slug/map` 标记 | `/w/:slug/wiki/:card` | pin → 文章类型标记 | icon |
| 6 | `/w/:slug/timeline` 事件卡 | `/w/:slug/wiki/:card` | 事件圆点 → 文章类型标记 | icon |
| 7 | `/u/:username` 世界行 | `/w/:slug/wiki` | 首字母方块 → hero 标记 | icon |
| 8 | 任意页顶栏 `.brand-mark` | `/` | 品牌方块 | icon |
| 9 | 工作区侧栏 `.tree-row` | 编辑器头部 | 卡片图标（**同文档**，`runViewTransition`） | icon |
| 10 | 灯箱缩略图 | 大图 | `<img>`（**同文档**） | cover |

> 第 4–7 组用 24–32px 的方块做空间桥接，比让标题缩放稳定得多。**标题永远不做尺寸 morph**；确实要共享标题时用 `title` 类，只做 120ms 交叉淡入。

### 3.4 时间与缓动

在 `tokens.css` 两套主题里补 token：

```css
--duration-fast: 120ms;
--duration-base: 200ms;
--duration-slow: 320ms;
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

新建 `frontend/src/styles/view-transitions.css`，在 `app.css` 里 `@import` 于 `base.css` 之后、`primitives.css` 之前：

```css
@view-transition { navigation: auto; }

/* 根：默认 250ms 太慢，压到 140ms */
::view-transition-group(root) { animation-duration: 140ms; }
::view-transition-old(root),
::view-transition-new(root) { animation-duration: 140ms; }

/* 图形型：容器 morph + 新旧快照错峰淡入 */
::view-transition-group(*.cover),
::view-transition-group(*.icon),
::view-transition-group(*.avatar) {
  animation-duration: var(--duration-base);
  animation-timing-function: var(--ease-out);
}
::view-transition-old(*.cover),
::view-transition-old(*.icon),
::view-transition-old(*.avatar) { animation: vt-out var(--duration-fast) var(--ease-in) both; }
::view-transition-new(*.cover),
::view-transition-new(*.icon),
::view-transition-new(*.avatar) {
  animation: vt-in calc(var(--duration-base) * 0.8) var(--ease-out) 40ms both;
}

/* 文字型：容器瞬移，只做交叉淡入 */
::view-transition-group(*.title) { animation: none; }
::view-transition-old(*.title),
::view-transition-new(*.title) { animation-duration: var(--duration-fast); }

@keyframes vt-out { to { opacity: 0; } }
@keyframes vt-in { from { opacity: 0; } }
```

规则：
- 一次导航最多 **2 个**参与 morph 的命名元素（1 主 + 1 辅），加上可选的持久 chrome。
- `::view-transition-*` 是文档级伪元素，必须写在**顶层**，不能嵌在组件选择器里（`.x::view-transition-group(...)` 无效），也不要塞进新的 `@layer`。
- 封面必须两侧同 `object-fit: cover`、同宽高比（3:2），否则 morph 时图片会「游」。
- 默认**不命名**顶栏/页脚等持久 chrome；如果 140ms 根淡入里能看出闪烁，再给顶栏命名并 `animation: none`。

### 3.5 降级与边界

- **不支持 API**：什么都不做，导航照常；不引入 polyfill。
- **减少动效**：同文档直接 commit（不调用 API）；跨文档用
  ```css
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) {
      animation-duration: 0.01ms !important;
    }
  }
  ```
  不要写 `animation: none`——那会让新旧快照同时可见。
- **重页面逃生门**：地图（`MapCanvasStage` / `Terrain3DPreview`）绝不命名画布。若 Performance 面板显示一次导航快照造成 >1 帧卡顿，给该路由在 SSR 注入 `@view-transition { navigation: none }`，只保留普通跳转；把判定与数字写进报告。
- **首屏不演**：刷新、直接打开深链、首次 SSR 水合都不播放任何入场动画。
- **主题切换不做动画**：不做圆形扩散 / 擦除 / 翻页；正确性 = 首帧正确、无闪烁。
- **对话框不走共享元素**：`DialogHost` 的开合只保留遮罩 120ms 淡入，避免与焦点陷阱、`aria-modal`、返回焦点冲突。
- **StrictMode 已开启**：只在事件处理器里触发过渡，不要在 `useEffect` 里触发（会双跑）。

---

## 4. 实施顺序（每步独立可验收、可回滚）

**P0 基座（不改视觉结构）**
1. `tokens.css` 补 duration/ease；顺手记录当前 `check:budget` 三个数字作为基线。
2. 新建 `styles/view-transitions.css` 并接入 `app.css` 的 `@import` 顺序。
3. `lib/viewTransition.ts`（`vt` / `runViewTransition` / `useSharedSource`）；验证无 API 与 reduce 时原样 commit。

**P1 极简单屏（先公开页，再工作区）**
4. `site-*` 重基到语义 token：删掉 `--site-*` 对 `--legacy-*` 的依赖，补 `[data-theme="light"]` 分支；七色纪元 → `--era-1..4`；地图标记 → 灰阶 + 形状。
5. 删装饰：`.app-shell` 径向渐变、多余 blur、卡片阴影 → 1px 线。
6. 网格与卡片：`.site-grid` / `.site-tile`（间距 24、内边距 16、封面 3:2、标题 17/1.45、hover 只改边框色，不做位移）。
7. 文章页：`site-page-head` 行宽 ≤68ch、标题/元信息/目录/上下篇的垂直节奏。
8. 工作台：侧栏与工具栏降噪（一个主按钮，其余 icon-btn），编辑器 chrome 统一 `--popover` + `--border-strong`。

**P2 共享元素（按组落地）**
9. 先 cover 组（1–3）→ 再同文档（9–10）→ 最后 icon 组（4–8）。
10. 每落地一组，就在 `frontend/tests/ui/vt-names.spec.ts` 里加一条路由断言（见 §5）。

**P3 收口**
11. 重建截图基线：`cd frontend && npm run ui:snapshots:update`，在报告里列出被改的基线文件。
12. 更新 `frontend/src/styles/README.md`（新增 `view-transitions.css` 层、命名规范）与美化计划的状态表。

---

## 5. 验收（要证据，不要「我看过了」）

**命令**

```sh
cd backend && .venv/bin/python manage.py check
make test && make compile && make ui-check
cd frontend && npx tsc --noEmit && npm run build:all && npm run check:budget
```

**新增自动化（最小集）** `frontend/tests/ui/vt-names.spec.ts`：

```ts
// 遍历 8 条路由，断言：同一页面内 view-transition-name 无重名、每页非 none 的命名 ≤2、
// 命名元素不是 canvas/video；并在网格页 hover 第一张卡后断言恰好 1 个命名元素。
const names = await page.$$eval("*", (els) =>
  els.map((el) => getComputedStyle(el).viewTransitionName).filter((n) => n && n !== "none"),
);
expect(new Set(names).size).toBe(names.length);
```

**浏览器手测矩阵**（`cd frontend && npm run dev` + `npm run dev:ssr`）

- 6 屏 × 2 主题 × 3 宽度（1440 / 768 / 390）：`/`、`/explore`、`/w/x/wiki`、`/w/x/wiki/:card`、`/w/x/map`、`/w/x` 工作台。
- 控制台 0 error；320px 下 `scrollWidth === clientWidth`。
- 键盘：Tab 顺序不变，动画结束后 `:focus-visible` 环仍可见；跳转后焦点不被吞。
- 动效：DevTools → Performance 录一次导航，主线程无 >50ms 长任务；过渡期间无布局抖动。
- 系统开启「减少动态效果」后：导航、灯箱、工作台开卡全部无动画，功能正常。
- 浅色：公开页、文章页、地图、工作台、对话框全部可读（文字 ≥4.5:1，边界 ≥3:1）。

**报告里必须有的数字**：`check:budget` 的 entry / workspace / css 三个 gzip 值（改造前后）。

---

## 6. 交付报告格式

1. **改动地图**：文件 → 一句话意图，按 P0/P1/P2 分组。
2. **视觉规则对照**：§2 的 9 条逐条给证据（截图路径或计算样式）。
3. **共享元素对照**：§3.3 的 10 组逐组给「源页与目标页都存在同名元素」的证据（`getComputedStyle` 值 / 截图）。
4. **门禁输出**：四条命令的结果摘要 + 包体三个数字。
5. **我替你做的决定**：需要产品拍板但你按默认值执行的点。
6. **未覆盖 / 主动放弃**：原因 + 建议的下一步。

---

## 7. 不要做（越界即回退）

- 不新增页面、路由、API、依赖、字体、图标库；不重构 `Workspace` / `CardEditor` 的功能逻辑。
- 不重写 `legacy-site.css` 的整体版式与文案，只做色彩 / 材质 / 间距的 token 重基。
- 不做：玻璃拟态、渐变光晕、霓虹描边、全站胶囊按钮、滚动视差、鼠标跟随、自动播放视频、`transition: all`、超过 2 个 morph 元素、给网格每一项静态加 `view-transition-name`。
- 不用动效掩盖加载；`RouteView` 的 `route-loading` 保持语义，最多把 spinner 换成 1px 线条。
- 不为了让动画好看而改变 DOM 层级、焦点顺序或 SSR 输出结构。

---

## 附录 A · 精简版（短上下文模型用）

> 在 `frontend/` 做一次「极简 + 共享元素」改造，不改功能与路由（整页导航，无客户端路由）。
>
> 极简：单色 token 体系，结构用 1px `--border` 不用阴影；半径 8/12/999；字号 11–28 八档、间距 4 基数，禁止字面量；`.app-shell` 的渐变、多余 blur、卡片阴影删掉；公开页 `site-*` 重基到语义 token 并补浅色分支；纪元/地图标记去彩色，改灰阶 + 形状。
>
> 共享元素：用原生跨文档 View Transitions（`@view-transition { navigation: auto }`）做主流程，同页状态用 `startViewTransition` + `flushSync`。目标页静态命名 `vt-<kind>-<slug>`，列表源在 hover/focus 时才命名、离开即清除；同页同名只能有一个；命名只挂叶子元素，不挂 canvas/列表容器。实现 `/`、`/explore`、`/wiki`、`/search`、`/map`、`/timeline`、`/u/:name` → 文章页的封面或图标桥接，共 ≥10 组。根过渡压到 140ms，morph 200ms `cubic-bezier(.22,1,.36,1)`；reduce 下同页跳过、跨页 0.01ms。
>
> 验收：`make ci` + `npx tsc --noEmit` + `npm run check:budget` 不回归；新增 `vt-names` Playwright 断言无重名；6 屏 × 2 主题 × 3 宽度手测；浅色对比度通过。零新依赖。
