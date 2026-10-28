# Opuscule 项目约定（AGENTS）

> 给在本仓库工作的 agent。这里只写**长期有效**的约定与现状；里程碑流水账在
> `docs/plans/`、`docs/adr/`，不要往本文件追加。建议阅读顺序：
> 本文件 → `README.md`（跑起来）→ `docs/adr/INDEX.md`（为什么）→
> `docs/ui-review-checklist.md`（UI 怎么验收）。

## 0. 硬约束

- 新增运行时依赖先说明理由；backend 同步 `requirements.txt`，frontend 同步 `package-lock.json`；不要随手升级大版本。
- 不编辑 `.venv/`、`.idea/`、`.git/`；不在工作区外做破坏性操作，**删除/移动前先确认绝对路径**。
- 世界内容（概念、卡片、评论、时间线、媒体）在数据库和 `backend/media/`，**不在 git 里**；不要提交 `db.sqlite3`、`media/`。
- 密钥只放 `deploy/.env` 或环境变量，不进仓库。
- 交付前跑 `make ci`；UI 改动再按 `docs/ui-review-checklist.md` 走查。

## 1. 这是什么

Opuscule 是一个小而完整的写作 / 世界设定产品：

- `src/opuscule/`：小 CLI 脚手架（`main.py` 是薄入口），与后端无关。
- `backend/`：Django + DRF 的 JSON API；本地 SQLite，线上 gunicorn。
- `frontend/`：React 19 + Vite 8 + TypeScript + Tiptap 3；公开站 + 工作区。
- 线上：**https://opuscule.cc/**（另有 `lavi.opuscule.cc`）。

核心领域：`World` → `Collection` → `Card`（设定集），外加世界级
`WorldConcept`（可发布/可回滚的概念文档）、共享媒体库、时间线与纪元、地图、
评论、审计、ZIP 往返、公开搜索/RSS/分享页。

## 2. 技术栈与目录

| 部分 | 说明 |
|---|---|
| `src/opuscule/`、`tests/` | Python 3.12+ 的 CLI 脚手架与 `unittest` |
| `backend/` | Django + DRF + gunicorn；版本见 `backend/requirements.txt`，本机 venv Python 3.14 |
| `frontend/` | React 19 / Vite 8 / TS / Tiptap 3；本机 Node 26 / npm 11 |
| `docs/adr/` | 决策记录，索引 `docs/adr/INDEX.md` |
| `docs/plans/` | 按日期的实现计划 |
| `docs/verification/` | 里程碑验收记录 |
| `deploy/` | 单机部署脚本、nginx/systemd 示例 |
| `.design/current/` | 单文件设计稿；`history/` 快照（git-ignored） |
| `scripts/` | `scripts/ci.sh`、`scripts/check_design.py`、`scripts/check_ui.py` |

后端 apps：

- `worlds`：World/Membership/Invite、WorldConcept(+Revision/Comment)、WorldMedia、WorldAuditEvent；概念/媒体/导出导入/快照命令。
- `cards`：Card/Revision/Comment/Notification；卡片 API 与评论。
- `collections`：Collection 树。
- `timelines`：Timeline/Entry/Era。
- `maps`：MapMarker 与地图 API。
- `identity`：session、登录/注册/改密、Profile、限流。
- `common`：feeds、SEO、share、图片校验、Tiptap 工具、解析器。

前端关键文件：

- `src/app/routes.ts`：手写路由（不用 react-router）。
- `src/ssr/entry-{server,client}.tsx`；`frontend/server.mjs`（5174）/ `frontend/server.prod.mjs`（5175）。
- `frontend/src/components/WorldConceptPage.tsx`：世界概念读页（书页版式）。
- `frontend/src/components/ConceptEditor.tsx`：概念编辑器（自动保存/409 冲突/历史/媒体）。
- `frontend/src/components/{ConceptComments,WorldTimelineBlock,RichText,CardPeek}.tsx`。
- `frontend/src/styles/`：分层见 `frontend/src/styles/README.md`；`frontend/src/styles/world-concept.css` 属于概念读页/编辑器。

## 3. 本地启动

```sh
# 后端
cd backend && .venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000

# 前端
cd frontend && npm ci
npm run dev -- --port 5173                 # SPA / 工作区
npm run dev:ssr                            # 公开页 SSR dev，:5174
npm run build:all && npm run preview:ssr   # 生产 SSR preview，:5175
```

| 端口 | 用途 |
|---|---|
| 8000 | Django API：`/api/`、`/admin/`、`/media/`、feed/robots/sitemap/share |
| 5173 | Vite SPA：全站开发、工作区、登录态 |
| 5174 | SSR dev：Home / Wiki / Explore / Profile |
| 5175 | SSR preview：读 `dist/` + `dist-ssr/` |
| 80/443 | 线上：nginx 静态 `frontend/dist` + `/api` 反代 |

本地演示登录：`traveler` / `opuscule-demo`（`seed_demo` 生成，只用于本机）。

注意：Django 若用 `--noreload`，改后端代码后要重启；改 `server*.mjs` 或重新
构建后要重启 5174/5175（manifest 与资源哈希在启动时读取）。`make serve-design`
占用 8000，和 Django 冲突，先停 Django 或换端口。

## 4. 命令与门禁

```sh
make test        # tests/ 的 unittest
make compile     # 字节码编译
make budget      # 构建 + JS/CSS 预算
make ui-check    # 静态 UI 契约
make serve-design
make ci          # 完整门禁
```

`make ci`（`scripts/ci.sh`）依次做：

1. `manage.py check`、`makemigrations --check --dry-run`、`manage.py test`。
2. 生产 settings 的 `check --deploy`（DEBUG off、TLS/HSTS 等）。
3. `importlinter` 架构契约：models 不得 import 同 app 的 serializers/views；`common` 不得依赖领域 app。
4. `.design/current/index.html` 结构检查。
5. UI 静态契约（`scripts/check_ui.py`）：token 可解析、裸 hex 只在 `tokens.css`、两套主题、WCAG 对比度、用户可见文案无里程碑编号、无原生 `confirm/prompt`、关键组件存在、SSR 主题从 cookie 读。
6. `npm run build:all` 与预算：entry ≤ 120 kB gzip、Workspace ≤ 175 kB、CSS ≤ 40 kB。

超预算先拆 chunk / 复用样式，不要抬阈值。后端测试在 `backend/apps/*/tests.py`
与 `test_*.py`；改 API 必须带测试，测试不得访问网络。

## 5. 后端约定

- 分层：models 最底层；serializers/views 依赖模型；`common` 提供无领域依赖的工具。跨 app 引用走明确模块，避免循环。
- 权限：`WorldMembership`（owner/editor/viewer）；统一用 `get_world_for_read` / `get_world_for_write`。owner-only：设置、成员、邀请、导出/导入、审计、回收站、所有权转移。
- 评论：卡片评论与概念评论都要求**世界写权限**（editor+）；删除限作者或 owner。
- `WorldConcept`：一世界一篇；`draft_json/body_json` 双份；发布写不可变 `WorldConceptRevision`；公开读只读已发布正文；草稿保存带 `expected_updated_at`，过期返回 409、前端停止自动保存；历史只给 owner/editor。
- 媒体：`WorldMedia` 是世界共享库（卡片与概念共用），4 MB，PNG/JPEG/WebP；删除前扫描引用（封面/图标/正文/概念草稿/发布），有引用返回 409。旧 `CardImage` 已删表（`cards/0010`），不要再加回。
- ZIP：导出/导入含集合、卡片、地图标记、地图背景、概念与历史快照；10 MB / 解压 20 MB / 2000 项；导入默认私有并写 `world.imported` 审计；撤销是软删除。
- 审计：`WorldAuditEvent` 记录关键动作；导入/发布/媒体删除等不要绕过。
- 迁移：破坏性迁移先审计（参考 CardImage：只读命令确认 0 行 → 复制 → 删表）；`makemigrations --check` 必须干净。

## 6. 前端约定

- 路由：`src/app/routes.ts` 手写解析。`/w/:slug/wiki` 是概念读页，`/wiki/cards` 是设定索引，`/wiki/:card` 是词条，`/wiki/edit` 进工作区概念编辑器。
- SSR：覆盖 Home / Wiki / Explore / Profile；Workspace 与私有世界成员页是 SPA（私有 `/wiki` 服务端只发 shell，客户端带 session 渲染）。
- 概念读页是「书页」：封面 + 标题书眉、标题生成目录（当前章节高亮）、正文引用是**行内虚线词 + ↗**、右栏统计/本页引用/阅读进度；不要恢复文末引用大表或盒状面板。版式动机见 `docs/adr/ADR-0024-world-concept.md`。
- 提及有两种渲染：阅读模式（`mentionMode="reading"`）是行内词；编辑/卡片模式是 mention 样式。新增节点先看 `src/editor/nodes.ts` 与 `extensions.ts`。
- 样式：语义 token，唯一裸 hex 在 `tokens.css`；字号/间距/圆角走档位；断点按 `styles/README.md`（640/900/380），概念页的 1080/760/390 是历史断点，改动向规范收敛。
- 对话框统一 `lib/dialogs.ts` + `DialogHost`，禁止原生 `confirm/prompt`；异步操作要有加载、错误与恢复路径。
- 复用优先：先找 primitives/现有组件再写新 class；页面类名带页面前缀。

## 7. 数据与内容（容易踩坑）

- 世界内容都在数据库里：改概念/卡片/时间线**不会**产生 git diff。本地改完要同步到线上（第 8 节）。
- 本地 demo：`seed_demo` 生成 `wuhai`（雾海纪年）和演示账号；可以编辑，但不要清库重建。
- 线上数据库独立于本地；账号、评论、媒体都在服务器上，**不要用本地 SQLite 覆盖服务器数据库**。
- 任何就地改库前先备份；`deploy/remote/migrate-db.sh` 是带备份/回滚的旧库迁移脚本。
- 媒体在 `backend/media/`，线上由 nginx `/media/` 直出；URL 公开可访问（已知限制）。

## 8. 部署与内容同步

- 线上：`ssh opuscule`（本机 SSH 别名）→ `/srv/opuscule`；systemd `opuscule` 跑 gunicorn，nginx 直接服务 `frontend/dist`。
- **线上没有 node / SSR**：所有页面 CSR；SSR 只是本地能力（5174/5175）。
- 代码部署：

```sh
git push origin main
ssh opuscule 'sudo bash /srv/opuscule/deploy/remote/update.sh'
```

- 内容同步（概念/修订、卡片、集合、时间线、纪元、标记；不含用户与评论）：

```sh
cd backend && .venv/bin/python manage.py world_snapshot --slug wuhai --out /tmp/wuhai.json
scp /tmp/wuhai.json opuscule:/tmp/
ssh opuscule "cd /srv/opuscule/backend && sudo -u opuscule .venv/bin/python manage.py world_snapshot --slug wuhai --in /tmp/wuhai.json"
```

  该命令按自然键原地更新，保留主键与评论；`--prune` 会删掉快照外的卡片与条目，慎用。
- nginx 只把 Django 拥有的前缀转给 gunicorn：`/api`、`/admin`、`/share`、`/robots.txt`、`/sitemap.xml`、`/feed.xml`、`/healthz`、`/w/<slug>/feed.xml`。**新增 Django 根级路由时同步改 `deploy/remote/locations.conf`**，否则会落到 SPA 兜底返回 HTML。
- 健康检查：`/api/health/` 与 `/healthz`。
- 地形生成不在服务器跑：本地 `manage.py terrain_push` 推（见 `docs/plans/20261026-local-terrain-upload.md`）。

## 9. 设计稿与视觉验收

1. 设计稿是**单文件 HTML**：`.design/current/index.html`（另有 `world-concept.html`、`world-concept-editor.html`、`mobile-tablet.html`），CSS/JS 内联。
2. 大改前把 `current/` 复制到 `.design/history/<timestamp>/`（git-ignored）。
3. `make serve-design` 在 8000 提供；也可直接在 DSH 右侧栏预览（装 `@guowenzhang/dsh-web-design` 后可编辑并保存回文件）。
4. 真实渲染用 Playwright MCP；视觉判断用 `modlens_read_image`；截图放 `walkthrough/`（历史截图已入库，注意体积）。
5. 验收按 `docs/ui-review-checklist.md`：深/浅主题、1440/900/700/390/320 宽度、`scrollWidth === clientWidth`、SSR 首帧不翻转。

## 10. 已知边界（不要当 bug 修）

- 线上无 SSR，首屏客户端渲染；私有世界成员页无 SSR 首屏。
- 公开 media URL 无鉴权；媒体无回收站，仅引用保护。
- 概念评论无通知；删除评论不清理正文里的 anchor mark。
- 概念里的时间线块客户端按需拉取，只显示前 20 条，不进入发布快照。
- 搜索：卡片分页；世界/创作者最多 8 条；无 BM25、多关键词。
- RSS 2.0、50 条；无 Atom/分页。
- 无协作编辑、拖入容器、任意文本自动识别。

## 11. 文档、历史与提交

- 决策 `docs/adr/INDEX.md`；计划 `docs/plans/`；验收 `docs/verification/`；UI `docs/ui-review-checklist.md`；样式 `frontend/src/styles/README.md`；部署 `deploy/README.md`、`deploy/remote/README.md`。
- 里程碑 P0–P5 的历史在上面这些文档里；本文件只维护长期约定，不要追加流水账。
- 提交用中文 conventional commits（如 `feat(world-concept): …`、`fix(deploy): …`），一功能一提交。
- 不提交：`deploy/.env`、`backend/db.sqlite3`、`backend/media/`、`.design/history/`、`.vscode/`。

## 12. DSH 工具

- 全局：Playwright MCP、modlens、superdesign、REA。
- 项目 skill：`.dsh/skills/opuscule-dev/SKILL.md`（自动发现）。
- 右侧栏 HTML 预览/编辑：`@guowenzhang/dsh-web-design`；报告/幻灯片用 `artifact` 工具。
- 右侧栏没有「编辑 / 工件」时重启 DSH 桌面端。

## 13. 安全

- 密钥/token/个人路径不进仓库；线上 secrets 在 `deploy/.env`（600）。
- 删除/移动前确认绝对路径；批量删除先 dry-run 或备份。
- 设计稿里的脚本按不可信代码对待，预览使用 sandbox iframe。
- 改域名/HTTPS 先改 `deploy/.env` 与 `deploy/remote/nginx.conf` 的 `server_name`，再 certbot。
