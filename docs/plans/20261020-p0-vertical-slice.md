# P0.1 垂直切片：可运行的 World / Collection / Card + 工作区

- Date: 2026-10-20
- Status: P0.1 completed (with documented gaps)
- Design refs: `/tmp/opuscule-design-refs/minimalist`、`/tmp/opuscule-design-refs/workspace`
- Related: 设计稿 v0.2、ADR-0007、ADR-0008、ADR-0010

## 目标

先做一个**可运行、可验证的垂直切片**，而不是一次铺开 P0 全部模块：

1. Django 6.1.x + DRF 3.18.x 后端骨架；SQLite 仅本地开发。
2. `World` / `Collection` / `Card` 三个核心模型 + CRUD API。
3. React + Vite + TypeScript 工作区：侧栏 Collection 树、卡片编辑、Tiptap 正文、保存。
4. 公开首页：读取同一套 API，按设计稿的世界首页结构展示。
5. 设计 token 来自 Minimalist：深色中性、12px 圆角、1px 边框、无阴影堆叠、1200px 内容宽度。

## 不在本切片

- 登录/权限/世界密码（本切片 API 为本地 demo，写接口暂开放，P0.2 必须收紧）。
- Timeline / Hist / Map / Graph / 11 工具。
- Postgres / Redis / Celery / S3；本切片用 SQLite，生产前切 Postgres。
- SSR 公开站；本切片用 Vite SPA，P0.2 再拆 SSR 模板。
- BlockNote → Tiptap 的完整迁移器；先保留 `body_json` 原样。

## 验收

```sh
cd backend
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py test
.venv/bin/python manage.py runserver 8000

cd ../frontend
npm run build
npm run dev -- --port 5173
```

- `GET /api/health/` 返回 200。
- `GET /api/worlds/` 返回种子世界。
- `GET /api/worlds/wuhai/` 返回世界、Collection 树、卡片列表。
- 工作区能在 390 / 1280 宽度下使用；侧栏可折叠；卡片正文可编辑并保存。
- 公开首页显示世界标题、纪元/角色/地点/事件分组。
- 前端 `npm run build` 通过；无控制台错误。
- 设计 token 与参考页面一致：深色、灰阶、单色强调、1px 边框、12px 圆角。

## 步骤

1. 建 `backend/` venv，安装 Django 6.1.2 + DRF 3.18.3；建项目与三个 app。
2. 写模型、序列化器、视图、URL、seed 命令、测试；生成迁移。
3. 写 `frontend/` Vite 工程与 token/组件 CSS；做壳层（topbar/sidebar/main）。
4. 接入 API；做 Tiptap 编辑器与保存；做公开首页。
5. 起两个服务，Playwright 截图与响应式检查；把截图/结果写回验证记录。

## 验证记录

- `docs/verification/20261020-p0.1.md`
- 截图：`docs/screenshots/p01-workspace.png`、`p01-public.png`、`p01-mobile.png`

## 风险

- **写接口开放**：只允许本地 demo；P0.2 必须加 session/token + CSRF + 世界权限。
- **SQLite**：JSONField 可用，但并发/索引不代表 Postgres；生产前必须迁移。
- **字体**：参考设计用 Geist / DM Serif / Geist Mono；本切片不引入外部字体，使用系统 fallback；P0.2 决定是否自托管。
- **设计参考是静态 HTML**：不是组件库；需要重新实现为 React 组件，不能直接复制脚本。
