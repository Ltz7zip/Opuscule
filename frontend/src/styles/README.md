# 样式分层与约定

`frontend/src/styles/` 现在按依赖方向分层，`app.css` 是唯一入口：

```
app.css
  @import tokens.css           原始色阶 + 语义 token + 排版/间距/时长尺度
  @import base.css             全局基础规则（reduced motion）
  @import view-transitions.css 跨文档共享元素的文档级伪元素规则
  @import primitives.css       跨页面组件：按钮 / 输入 / 卡片 / 胶囊 / 状态 / 对话框
  @import prose.css            编辑器与发布页共用的阅读排版
  @import legacy-site.css      公开站版式（已重基到语义 token）
  ... 页面与布局规则（仍在 app.css）
```

`auth.css` 与 `legacy-workspace.css` 由 `src/main.tsx` 在 `app.css`
之后加载，工作区/地图/时间线属于这一层。

## 规则

- `tokens.css` 是唯一允许出现裸 hex 的文件；其它 CSS 必须使用 `var(--token)`。
  由 `scripts/check_ui.py` 强制。
- 页面 CSS 不再使用 `--brand-*` 原始灰阶；文字只有三档：
  `--foreground` / `--muted-foreground` / `--border`（`--border-strong` 用于控件边界）。
- 结构用 `1px solid var(--border)`；阴影只用于 dialog / popover / menu /
  拖动中的卡片。`backdrop-filter` 只允许 sticky 导航与模态遮罩。
- Lucide 图标只用 16/20px，`base.css` 统一 `stroke-width: 1.5`。
- 圆角只用 `--radius-sm`(8) / `--radius`(12) / `--radius-pill`(999)；
  页面里不再出现 `--radius-xs` 或 `--radius-lg`。
- 字号八档 `--text-2xs…--text-3xl`（11–28），间距 4 基数 `--space-1…8`
  （4–48）；公开站与工作区外壳已全部 token 化，新选择器不允许写死
  字号/内边距/间隙。`app.css` 的编辑器/地图/时间线深层规则仍待迁移。
- 语义 token 必须在 `:root`（深色）与 `[data-theme="light"]` 两处都成立；
  正文 / 次要文字 / 主按钮 / 卡片描边会做 WCAG 对比度检查。
- 字号使用 `--text-2xs … --text-3xl`，间距使用 4 基数，圆角只用
  `--radius-xs / sm / radius / lg / pill`。新增取值前先确认现有档位不够用。
- 页面级覆盖留在 `app.css`，且应晚于 primitives；不要为了一个页面去改
  primitives 的默认值。
- 原生 `window.confirm` / `window.prompt` 禁止使用，统一走
  `lib/dialogs.ts` + `DialogHost`（`check_ui.py` 会拒绝）。
- 断点：只用 `640px`（手机）、`900px`（平板）；`380px` 是顶栏换行的
  xs 例外。历史断点 `560 / 720 / 760 / 860 / 980` 已全部收敛，不要新增。

## 共享元素（View Transitions）

- 跨文档主流程用 `@view-transition { navigation: auto; }`；同页状态用
  `lib/viewTransition.ts` 的 `runViewTransition()`（`startViewTransition` +
  `flushSync`）。两者共用 `--duration-*` / `--ease-*`。
- 名字只由 `vt()` / `useSharedSource()` 产生，格式 `vt-<kind>-<slug>`；
  `kind` 为 `cover` / `icon` / `avatar` / `title`。
- 目标页用静态 `style={vt(...)}` 进入 SSR HTML；列表源只在
  hover/focus/touch 时命名，离开即清除。任意时刻同名元素全页只能有一个。
- 命名只挂叶子：封面 / 图标方块 / 头像 / H1。禁止挂 canvas、video、
  网格、列表容器、`<main>`、`#root`。
- 一次导航最多两个命名元素（1 主 + 1 辅 / 持久品牌）；根过渡 140ms，
  图形 morph 200ms `--ease-out`，文字仅 120ms 交叉淡入。
- 无 API、`prefers-reduced-motion: reduce`、页面隐藏时同页直接 commit；
  跨文档在 reduce 下压到 0.01ms。不要为降级引入 polyfill。
- `scripts/check_ui.py` 校验：lib/layer 存在、import 顺序、CSS 不得声明
  `view-transition-name`、index/SSR shell 必须带早期 opt-in。
- 回归：`frontend/tests/ui/vt-names.spec.ts`（8 路由 × 2 视口、hover 唯一性、
  6 组跨文档配对、禁止 canvas/video 命名）。

## 组件新增流程

1. 先判断是否已有 primitive 可复用（按钮、字段、卡片、对话框）。
2. 新 primitive 进入 `primitives.css`，用 token，写出两套主题下的状态。
3. 页面专属布局放 `app.css`，类名带页面前缀（如 `timeline-*`、`map-*`）。
4. 跑 `make ui-check`；它同时检查 token 引用、裸色、对比度、内部文案与原生对话框。

## 已知边界

- 字体仍使用系统栈（PingFang / Songti / Noto Serif SC），未自托管；
  衬线只用于公开世界、Wiki 与文章标题。
- 公开页截图基线：`cd frontend && npm run ui:snapshots`（基线见
  `tests/ui/__screenshots__/`，绑定本机 Chrome 与系统字体）。
