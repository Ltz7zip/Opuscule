# Opuscule 项目约定

## 项目定位

Opuscule 是一个小而完整的 Python 项目。运行时保持 **stdlib-first**，不随意引入依赖；结构清晰、可测试、可直接运行。

## 目录

- `src/opuscule/` — 包代码，`cli.py` 是入口
- `tests/` — `unittest` 测试
- `.design/current/` — 当前设计稿（单文件 HTML）
- `.design/history/` — 大改前的快照（不提交）
- `.dsh/skills/opuscule-dev/` — 本工作区的项目级 skill
- `main.py` — 从项目根目录运行的薄入口
- `backend/` — Django 6.1 + DRF P0.1–P2.2 后端
- `frontend/` — React 19 + Vite + Tiptap P0.1–P2.2 工作区
- `docs/adr/`、`docs/spikes/`、`docs/plans/` — 决策、审计与计划

## P0.1–P2.6 / P1.8 / P3.1–P3.9 / P4.1–P4.16 / P5.1–P5.4 后端 / 前端（2026-10-20 经用户批准的例外）

- 技术栈：Django 6.1.2 + DRF 3.18.3；React 19 + Vite 8 + TypeScript + Tiptap 3。
- P0.2：session auth + CSRF + `WorldMembership`；本地 demo 登录 `traveler` / `opuscule-demo`，只用于本机。
- P0.3：`UserProfile` + `/u/<username>` 个人主页；旧 blocks/layout/accent 排版是 P0.4 parity。
- P0.4：route-level lazy、公开 Wiki、探索、注册；`Workspace` 是唯一 Tiptap chunk，公开页不加载编辑器。
- P0.5：`/worlds/new` 创建世界 + owner bootstrap；注册后跳转创建；owner 可在工作区公开 Wiki。
- P0.6：owner 世界设置 dialog、世界切换器、7 个世界配额；editor 不能改设置。
- P0.7：owner 成员管理（已注册账号的 add/role/remove）。
- P0.8：一次性邀请链接（7 天、1 次、可撤销）；登录/注册 next 回跳；邮件邀请未做。
- P0.9：世界软删除/回收站/恢复、所有权转移；物理清除/保留期限未做。
- P0.10：WorldAuditEvent/审计 API/owner 活动记录 dialog；审计保留/导出/不可篡改未做。
- P1.1：公开搜索、公开缓存头、`check:budget` 门禁。
- P1.2：SEO meta/canonical/noindex、robots/sitemap、GitHub Actions。
- P1.3：Django 服务端分享页（noindex/OG/无 JS）。
- P1.4：Wiki 单路由 SSR/hydration dev pilot（5174，`npm run dev:ssr`）。
- P1.5：SSR 生产构建/独立 server（`build:all`、`preview:ssr` 5175、manifest/反代）；部署/高可用/多页 SSR 未做。
- P2.1：独立 `apps.maps` + `/w/<world>/map` lazy 地图 MVP。
- P2.2：地图标记编辑 + pointer 拖动持久化；仍无瓦片/缩放/地图 SSR。
- P1.6：SSR 扩到 Explore（Wiki + Explore）。
- P1.7：SSR 扩到 Profile（Wiki + Explore + Profile）。
- P1.8：SSR 扩到 Home（Home + Wiki + Explore + Profile）；Workspace/登录态仍 CSR。
- P3.1：`make ci` 本地门禁 + design checker + CI workflow；deploy/ 只是未执行的拓扑草图。
- P3.2：owner 世界 ZIP 导出（world.json/README/wiki/*.md）。
- P3.3：owner ZIP 导入（默认私有，保留集合/卡片/地图标记）；无合并/媒体/异步导入。
- P3.4：导入写 `world.imported` 审计；有效 ZIP 浏览器 E2E 已验证并清理。
- P3.5：审计 action 过滤 + dialog 分组筛选。
- P3.6：审计 CSV 导出（owner/BOM/5000 上限）。
- P3.7：审计 CSV 公式注入防护。
- P3.8：导入历史 + 撤销（软删、DELETED reason=import_undo）；无分页/物理清除。
- P3.9：API/SSR health（`/api/health/`、`/healthz`）；无深度 readiness/监控。
- P4.1：独立 `apps.timelines` + `/w/<world>/timeline` lazy 时间线 MVP。
- P4.2：时间线条目编辑 UI（PATCH/重排）；无多时间线/SSR。
- P4.3：时间线客户端纪元筛选；无后端分页/年份范围。
- P4.4：公开 RSS（站点/世界，RSS 2.0，50 条）；无分页/Atom/时间线 feed。
- P4.5：公开搜索加入世界结果（最多 8）；无用户/成员搜索/SSR。
- P4.6：登录 10/min、注册 20/hour 限流（LocMem）。
- P4.7：5 次失败锁账号 15 分钟；成功登录重置；无验证码/2FA/审计。
- P4.8：可信代理 XFF 限流键（默认不信任）；无多级代理/Redis。
- P4.9：公开搜索加入创作者（公开 profile + 至少一个公开世界，最多 8）；无分页/SSR。
- P4.10：搜索标题优先排序（卡片/世界）；无 BM25/分页/高亮。
- P4.11：时间线可选结束年份区间（487–490）；无 Era 区间/多时间线/BCE。
- P4.12：搜索关键词安全高亮（React `<mark>`）；无多关键词/SSR。
- P4.13：搜索卡片 limit/offset/has_more + 加载更多；世界/创作者不分页。
- P4.14：旧站式横向时间线画布（轴线/事件/纪元色带/缩放/平移/轴线新建）。
- P4.15：Era 独立区间模型/API + 画布真实色带 + owner 管理；月刻度未做。
- P4.16：多时间线模型/API/切换器/新建；demo 主时间线 + 航海志。
- P4.17：条目可选月份 + 短跨度月份 tick；长跨度不显示月份。
- P5.1：生产安全 settings env 化（secret/debug/hosts/SSL/HSTS/SMTP）；deploy check 0；无实际编排。
- P5.2：登录用户修改密码（session 保持）；无忘记密码/2FA/强度策略。
- P5.3：Tiptap 对等核心：斜杠菜单、选区浮条（含下划线/链接）、块 +、官方 DragHandle nested 拖拽、Tab/Shift-Tab 任意嵌套、nested/toggle、官方表格、官方 TaskList、官方 Mention @卡片 + slug/标题自动识别、正文卡片名自动链接、左侧 gutter 对齐、媒体库、图片轮播、页面图标/封面、callout/image 上传或 URL/bookmark/card embed；无任意文本自动识别/拖入容器/协作。
- P5.4：卡片评论 + 选区锚点 mark + 回复/解决/删除 + 通知 API/顶栏 badge；删除评论暂不清理锚点 mark。
- P2.3：地图 1–3× 缩放（逆坐标/拖动）。
- P2.4：地图平移/边界夹取/放置-移动模式；无瓦片/触摸/SSR。
- P2.5：owner 地图背景图上传（PNG/JPEG/WebP，4MB，本地 media）；无裁剪/对象存储。
- P2.6：地图背景随 ZIP 往返；ZIP 上限 10MB；无裁剪/对象存储/其他媒体。
- 本地用 `backend/.venv`（Python 3.14.6，当前宿主）与 `npm`；本地 SQLite，生产切 Postgres。
- 运行：
  ```sh
  cd backend && .venv/bin/python manage.py runserver 127.0.0.1:8000
  cd frontend && npm run dev -- --port 5173
  cd frontend && npm run dev:ssr   # 可选：Wiki SSR pilot :5174
  cd frontend && npm run build:all && npm run preview:ssr   # 生产 SSR preview :5175
  ```
- 这是对“运行时只用标准库”的显式例外；原有 `src/opuscule` 仍保持 stdlib。
- 新增依赖仍需说明理由并确认；不要随意升级大版本。

## 常用命令

```sh
./.venv/bin/python main.py                          # 运行
make test                                           # 等价于 PYTHONPATH=src python -m unittest discover -s tests -v
make compile                                        # 字节码编译检查
make serve-design                                   # 在 8000 端口服务 .design/current
```

## 编码约定

- Python 3.12+ 语法；公开函数加类型标注和简短 docstring。
- 运行时只用标准库；新增依赖先说明理由并征得确认。
- 测试用 `unittest`，不访问网络；测试文件放在 `tests/`。
- 不编辑 `.venv/`、`.idea/`、`.git/`。
- 小步修改，改完先跑 `make test` 和 `make compile`。

## 设计稿与右侧栏预览

1. 设计稿写成**单文件 HTML**，放在 `.design/current/index.html`；CSS/JS 内联，避免相对资源在预览中丢失。
2. 在 DSH 文件树中打开该 HTML，右侧栏文档预览会直接渲染。
3. 安装 `@guowenzhang/dsh-web-design` 后，在预览里切到「编辑」，可改文字/样式/位置、删除区块，点「保存到文件」写回 HTML。
4. 大改前把 `current/` 复制到 `.design/history/<timestamp>/`，保留可回滚版本。
5. 需要真实 origin 时运行 `make serve-design`，再用 Playwright MCP 打开 `http://127.0.0.1:8000` 检查交互、控制台和响应式。
6. 视觉检查可用 `modlens_read_image` 读取截图；设计方向探索可用 `superdesign` skill。

## DSH 能力

- 全局可用：Playwright MCP、modlens、superdesign、REA 等（desktop profile）。
- 项目级 skill：`opuscule-dev`，由 `.dsh/skills/opuscule-dev/SKILL.md` 自动发现。
- 右侧栏 HTML 预览/编辑：`@guowenzhang/dsh-web-design`。
- 报告/幻灯片：`dsh-artifact` 的 `artifact` 工具写 HTML 或 slides，右侧栏自动打开，并保留历史版本。
- 如果右侧栏没有出现「编辑」或「工件」，重启一次 DSH 桌面端；客户端插件在启动时加载。

## 安全

- 不把密钥、token、个人路径写进仓库。
- 不在工作区外做破坏性操作；删除/移动前先确认目标路径。
- 设计稿里的脚本按不可信代码对待，预览使用 sandbox iframe。
