# UI 走查与验收清单

用于每次 UI 改动后的自检，以及设计/产品签收。当前没有自动化像素基线，
本清单就是可复现的验收协议。

## 环境

```sh
cd backend && .venv/bin/python manage.py runserver 127.0.0.1:8000
cd frontend && npm run dev -- --port 5173      # SPA / 工作区
cd frontend && npm run dev:ssr                  # SSR 公开页 :5174
```

`make ci` 覆盖静态契约（token、裸色、对比度、内部文案、原生对话框、构建与预算），
不覆盖真实渲染，所以仍需走查。

## 主题

- 深色：默认；浅色：点击顶栏主题按钮，或设置 cookie
  `document.cookie = "opuscule-theme=light; path=/"` 后刷新。
- 每个屏幕都要在深浅两套主题下各看一次；SSR 页刷新两次确认首帧不翻转。

## 宽度

1440（桌面）、900（平板临界）、700（窄平板）、390（手机）、320（极窄）。
每个宽度检查 `document.documentElement.scrollWidth === clientWidth`。

## 屏幕矩阵

| 屏幕 | URL | 必须覆盖的状态 |
|---|---|---|
| 公开首页 | `/` | 正常 / 加载失败 |
| 探索 | `/explore` | 正常 / 空列表 |
| 搜索 | `/search?q=雾` | 结果 / 无结果 |
| Wiki 索引 | `/w/wuhai/wiki` | 正常 / 空世界 |
| Wiki 文章 | `/w/wuhai/wiki/world-overview` | 正常 / TOC / 上一篇下一篇 |
| 工作区 | `/w/wuhai` | 正常 / 空工作区 / 保存中 / 保存失败 |
| 地图 | `/w/wuhai/map` | 空地图 / 有标记 / 只读 |
| 时间线 | `/w/wuhai/timeline` | 正常 / 空时间线 / 纪元筛选 |
| 登录 / 注册 | `/login`、`/register` | 正常 / 错误提示 |
| 个人主页 | `/u/traveler` | 正常 / 未公开 |
| 状态页 | `/definitely-missing`、抛出错误时 | 404 / 500 |

## 每屏检查项

1. **主题**：背景、卡片、边框、浮层在深浅两套下都可读；无固定深色残留。
2. **层级**：一屏一个主标题；标题/正文/元信息三级对比清楚。
3. **交互**：所有按钮有 hover 与 `:focus-visible`；Tab 可到达并看见焦点环。
4. **状态**：loading / empty / error 三态齐全，错误有恢复路径。
5. **文案**：无 `P0.x`、演示数据、设计参考、裸露 slug / 内部路径。
6. **触控**：≤640px 时顶栏与主要动作高度 ≥44px。
7. **溢出**：320/390 无横向滚动；长标题省略而不是撑破布局。
8. **控制台**：0 error（资源 404 与 API 4xx 属预期时需注明）。

## 记录

| 日期 | 屏幕 | 宽度 | 主题 | 结果 | 备注 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 自动截图

公开页有 16 张基线截图（4 屏 × 深浅 × 桌面/手机）：

```sh
cd frontend
npm run ui:snapshots          # 与基线比较，超过 1% 像素差异失败
npm run ui:snapshots:update   # 有意改版后重建基线
```

基线位于 `frontend/tests/ui/__screenshots__/`，请随改动一起提交。
Playwright 使用本机 Chrome（`channel: "chrome"`），首次运行前需保证
`127.0.0.1:8000` 与 `5174` 可用；`playwright.config.ts` 会复用已启动的服务。

## 已知缺口

- 截图基线绑定本机 Chrome 与系统字体；跨系统比较可能误报，暂不放进 `make ci`。
- 无设计签收人；表格中的“结果”暂由实现者自评。
- 读屏、Safari / Firefox、真实移动设备尚未覆盖。
