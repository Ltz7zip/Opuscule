<!--
  R2 · 续写提示词：收口 / 证伪 / 补面。
  输入：上一轮交付报告（极简重做 + 跨文档共享元素）。
  定位：这是「第二轮任务书」，不是重写。§0 已验收的项不要重开。
  版本：2026-10-25。
-->

# R2 任务：收口、证伪、补面

你在上一轮把 `frontend/` 做成了「极简单色 + 跨文档共享元素」，并交了一份报告。这一轮**不重做**，只做四件事：把报告里没闭合的规则闭合、把报告里当事实用的三个结论证伪、补上被跳过的那一屏、把一次性手测变成常驻测试。

## 0. 已验收，不重开

以下视为完成，除非你发现新证据，否则不要动：`tokens.css` 新增 duration/ease/measure；`styles/view-transitions.css` 层与 `@import` 顺序；`lib/viewTransition.ts`（`vt` / `runViewTransition` / `useSharedSource`）；SSR shell 内联 opt-in；公开站 `site-*` 重基到语义 token 并补浅色；10 组共享元素配对；`vt-names.spec.ts` 与 `check_ui.py` 新增门禁；16 张基线重建。

## 1. 前置（阻塞项）：先把工作树切干净

当前 `git status` 里同时躺着 `backend/apps/**` 的模型/序列化器/视图/测试改动、`docs/plans/**` 改动与本轮 UI 改动，**全部未提交**。这让「这轮 UI 改了什么」无法回滚、无法审阅，也让 `make ci` 的绿分不清是 UI 还是 backend 带来的。

要求：

1. 输出**本轮 UI 变更的精确文件清单**（相对上一轮开始时的 `git status` 做差集），并明确声明「其余 backend/docs 改动是他人 WIP：不格式化、不顺手修、不纳入本轮提交」。
2. 按 P0 基座 / P1 视觉 / P2 共享元素拆 3 个 commit，每个 commit 单独过门禁。
3. **禁止** `git checkout` / `git stash` / `rebase` / `reset` 处理别人的改动；只做你自己的 `git add <明确路径>` + `commit`。

## 2. 先证伪：这三条结论先别当事实

报告里三条因果/能力判断，都没有给可复现证据。逐条做对照实验，结论写进报告；**证伪了就改实现，不要改叙事**。

**2.1 「Content-Length / no-cache 是跨文档转场 invalid state 的根因」**
- `sendHtml()` 用 `Buffer.byteLength` 是对的，但它同时把 `Cache-Control` 改成了 `no-cache`——这两件事被混为一谈。
- 做对照：只保留内联 opt-in、把 `Content-Length` 去掉（回到 chunked），是否复现？再把 `Cache-Control` 恢复原值，是否复现？
- 若不能证明，就把 `sendHtml()` 记为「独立的服务端响应修正」，单独说明它对 304/ETag/反代缓存的影响；不要写进「转场根因」。

**2.2 「React 19 会丢弃 `viewTransitionClass`」**
- 在 Chrome 里实测：渲染一个 `style={{ viewTransitionClass: "cover" }}` 的元素，读 `getComputedStyle(el).viewTransitionClass` 与 `el.style.getPropertyValue("view-transition-class")`。
- 若为空，用 `ref.current.style.setProperty("view-transition-class", kind)` 兜底；**不要**因为一个未证实的限制，就把「按 kind 分级时序」整条设计丢掉（当前所有命名元素共用一套时序）。
- 顺带：`useSharedSource` 只设了 name、没设 class，如果 class 要用于分级，补上。

**2.3 「根过渡是 cross-fade」**
- 现在 `::view-transition-old(*)` 用 `vt-out`、`::view-transition-new(*)` 用 `vt-in … 40ms both`，并且 `*` 规则也命中 `root`——这意味着根过渡实际是「先淡出、40ms 后再淡入」。
- 用逐帧证据判定：Playwright 录像或在过渡期间每 16ms 截一帧，取中段帧比较中心区域与静止帧；若中段接近纯 `--background`，就是 dip（浅色下会白闪），不是 cross-fade。
- 注意：不要覆盖 UA 给 `::view-transition-old/new` 的 `mix-blend-mode`（additive），否则会把「加性交叉」变成普通 alpha 叠加，透底更明显。

## 3. 本轮范围

### A. 动效正确性（最高优先——现有 44 条测试全绿也发现不了）

1. root：old/new 必须**同时起止**；去掉 `new(root)` 的 40ms 延迟。若做不到真 cross-fade，就让 root 只改时长、old/new 走 UA 默认，**不许出现背景闪**。
2. 共享元素：`cover` / `icon` 的 old/new 同样去延迟，改同步 160ms 交叉；只保留容器 200ms morph。当前 40ms 空隙会让封面 morph 先闪一下卡片底色。
3. 证据：深/浅各一次逐帧采样，给出帧图路径与「中段是否露底」的结论。
4. 若 §2.2 证伪成功，恢复按 kind 的时序：`cover/icon` 同步交叉，`title` 容器瞬移 + 120ms 淡入。

### B. 全站闭合（规则 2/3，报告自己标了 ⚠️）

现状实测：`app.css` 有 **308** 处 `font-size` 字面量、**248** 处非零 `padding`、**228** 处 `gap`、**127** 处 `border-radius`；`primitives.css` / `prose.css` 还各有少量。

1. **先上门禁，再改代码**（红 → 绿）：
   - `check_ui.py` 增加：页面/组件 CSS 中 `font-size`、`padding`、`gap`、`border-radius` 不得出现 `px` 字面量；
   - 白名单必须显式写在脚本里并注释理由（当前只允许：tile 标题 `17px`、结构性的 `0` / `1px`）；
   - 断言输出「字面量计数 = 0」，而不是「没新增」。
2. codemod 分 3 批提交（≤120 处/批），每批后 `make ui-check` + `npm run ui:snapshots`。
3. 半径映射表（禁止就近乱取）：

   | 现值 | 目标 | 场景 |
   |---|---|---|
   | 0–3px | 0 | 细条、分隔、进度 |
   | 4–9px | 8（`--radius-sm`） | 控件、徽标、小卡 |
   | 10–16px | 12（`--radius`） | 面板、卡片、对话框 |
   | 50% | 50% | 头像、圆点 |
   | 999px | 999 | 胶囊 |

4. 字号：维持 11–28 八档；<11px 的标签（地图/时间线/编辑器浮层）必须重排（tooltip / 两行 / 隐藏次要列），不许新增第 9 档。
5. 间距：非 4 倍数就近取 4/8/12/16/20/24/32/48；确需中间值用 `calc(var(--space-N) * 1.5)`。

### C. 补面与常驻覆盖

1. **认证页纳入新视觉**：`auth-terminal.css` 1524 行仍是终端风，且无浅色。收敛到 primitives + 一个 `auth.css`，保留「验证中 / 拒绝 / 通过」三态与现有防抖逻辑；决定并说明是否保留终端隐喻（默认：不保留）。
2. 共享元素第 11 组：登录页 `BrandMark` → 首页 brand（与组 8 同一名字，注意两页只能各一个）。
3. **登录态自动化**：`playwright.config.ts` 增加 `auth` project，用 `POST /api/login/` 拿 `storageState`（本地 demo `traveler` / `opuscule-demo`，仅在 `DEV` 生效）；把组 5（地图 pin）、6（时间线圆点）、9（工作台开卡）、10（灯箱）从「一次性人工验证」变成常驻用例。
4. **禁止再改 demo 数据**：这四组用例必须用 API 建临时世界/卡片/标记/条目，`afterAll` 删除；报告里给出临时 slug 与删除证据。上一轮「修订号 163 → 165」就是手测的代价，这轮不许重演。
5. 浅色矩阵补 4 屏：登录、注册、工作区、地图（`data-theme=light` 下各 1 张，SSR 与 CSR 各覆盖一处）。
6. 跨浏览器冒烟（只查不崩，不做像素）：WebKit 跑 8 路由，断言 0 console error、无重名、`startViewTransition` 缺失时开卡仍可用。
7. 320px 触控目标：从人工检查改成断言（遍历可点元素 `boundingBox`，排除正文内联链接）。

## 4. 新硬约束（叠加，不替换第一轮）

1. 预算：workspace **172.3 / 175 kB**（余 2.7）。本轮必须净减或持平；新增代码只进独立 chunk，不许挤 workspace。
2. 不动 `backend/**`、不改 API、不改 `AGENTS.md`。
3. 每个 commit 独立可回滚、独立过门禁；不许「一个大 commit + 全绿」。
4. 截图基线出现变化必须**逐张说明原因**（哪条规则导致哪张图变），并抽 3 张给 before/after 并排；不许「删基线 → 全量重建 → 16/16 通过」当作证据。
5. demo 数据库任何写入，报告里都要给「影响行 + 还原方式」。

## 5. 验收

```sh
cd backend && .venv/bin/python manage.py check
make test && make compile && make ui-check
cd frontend && npx tsc --noEmit && npm run build:all && npm run check:budget
npx playwright test            # 含新增 auth project
```

新增断言必须包含：
- 字面量门禁：`font-size/padding/gap/border-radius` 的 `px` 计数 = 0（白名单除外）；
- 过渡中段采样：无「接近纯背景」的帧（深浅各一）；
- 组 5/6/9/10 的 auth 常驻用例；
- WebKit 冒烟。

报告格式：先放「§2 三条证伪结论」，再放改动地图、门禁数字、基线变化逐张说明、未覆盖项。

## 6. 不要做

- 不要为了过门禁往白名单里加条目——白名单是本轮最大的作弊口，加一条要在报告里单独列出并说明为什么不能重排。
- 不要顺手美化 backend 模板、admin、邮件。
- 不要重新引入客户端路由去「让动画更好做」。
- 不要把这轮变成「再换一套视觉」；这轮只允许动时序、字面量、认证页。
- 不要把「44 条测试通过」当成本轮结论；那 44 条恰好测不到 §3.A。
