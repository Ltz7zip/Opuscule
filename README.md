# Opuscule

一个世界设定写作应用：以「世界」组织设定词条（卡片），再用一篇可发布的世界概念把它们读成一本书。

线上：<https://opuscule.cc/>

## 本地启动

两个本地服务（后端 API + 前端 SPA）：

```sh
# 后端
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000

# 前端（另开终端）
cd frontend
npm ci
npm run dev -- --port 5173
```

打开 <http://127.0.0.1:5173/>。本机演示账号：`traveler` / `opuscule-demo`
（`seed_demo` 生成，仅限本地）。

| 端口 | 用途 |
|---|---|
| 8000 | Django API（`/api/`、`/admin/`、`/media/`、feed/robots/sitemap/share） |
| 5173 | Vite SPA（公开站 + 工作区） |
| 5174 | 公开页 SSR dev：`npm run dev:ssr` |
| 5175 | 生产 SSR preview：`npm run build:all && npm run preview:ssr` |

## 能做什么

- **世界与协作**：创建世界、成员/角色、一次性邀请、7 个世界配额、软删除/回收站、所有权转移、审计日志。
- **设定集**：Collection 树 + Card 词条；Tiptap 编辑器（表格、任务、callout、图片、书签、卡片嵌入、行内提及/自动链接、共享媒体库）；卡片评论带选区锚点与通知。
- **世界概念**：一世界一篇可发布文档；草稿/发布/不可变历史/回滚、409 冲突保护、成员评论；公开页是「书页」版式（封面、目录、行内引用、阅读进度）。
- **时间线与地图**：多时间线 + 纪元、画布缩放/平移、标记与背景图。
- **公开面**：公开 Wiki、搜索（卡片/世界/创作者/概念）、RSS、sitemap/robots、分享页、个人主页。
- **导出导入**：owner ZIP 导出/导入（含概念历史与地图背景），可撤销。
- **工程**：深/浅主题、SSR（本地）、JS/CSS 预算、`make ci`、单机部署。

## 目录

```
src/opuscule/        CLI 脚手架（与后端无关）
tests/               脚手架的 unittest
backend/             Django + DRF API（apps/{worlds,cards,collections,timelines,maps,identity,common}）
frontend/            React 19 + Vite 8 + TS + Tiptap 3
docs/adr/            架构决策（INDEX）
docs/plans/          实现计划
docs/verification/   验收记录
deploy/              单机部署脚本与 nginx/systemd 示例
.design/current/     单文件设计稿
scripts/             ci / design / ui 检查
AGENTS.md            项目约定（先读）
```

## 测试与门禁

```sh
cd backend && .venv/bin/python manage.py test
make ci    # 后端测试 + 生产 settings + import 契约 + 设计稿 + UI 契约 + 构建 + 预算
```

## 部署

线上是 nginx（静态 `frontend/dist`）+ gunicorn（`/api` 等前缀反代），没有 node/SSR；
更新走 `deploy/remote/update.sh`，内容用 `world_snapshot` 同步。细节见
[`deploy/README.md`](deploy/README.md) 与 [`AGENTS.md`](AGENTS.md)。

## 设计稿

1. 单文件 HTML 写到 `.design/current/index.html`（CSS/JS 内联）。
2. 在 DSH 文件树打开，右侧栏预览；装 `@guowenzhang/dsh-web-design` 可编辑并保存回文件。
3. 大改前快照到 `.design/history/<timestamp>/`。
4. 需要真实 origin：`make serve-design`（:8000，先停 Django）。

## 文档

- [`AGENTS.md`](AGENTS.md) — 约定、部署、内容同步
- [`docs/adr/INDEX.md`](docs/adr/INDEX.md) — 决策记录
- `docs/plans/`、`docs/verification/` — 计划与验收
- [`docs/ui-review-checklist.md`](docs/ui-review-checklist.md) — UI 走查
- [`frontend/src/styles/README.md`](frontend/src/styles/README.md) — 样式分层
