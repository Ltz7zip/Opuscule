# 样式分层与约定

`frontend/src/styles/` 现在按依赖方向分层，`app.css` 是唯一入口：

```
app.css
  @import tokens.css     原始色阶 + 语义 token + 排版尺度
  @import base.css       全局基础规则（reduced motion）
  @import primitives.css 跨页面组件：按钮 / 输入 / 卡片 / 胶囊 / 状态 / 对话框
  @import prose.css      编辑器与发布页共用的阅读排版
  ... 页面与布局规则（仍在 app.css）
```

## 规则

- `tokens.css` 是唯一允许出现裸 hex 的文件；其它 CSS 必须使用 `var(--token)`。
  由 `scripts/check_ui.py` 强制。
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
