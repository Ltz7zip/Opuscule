# Opuscule 生产就绪方案（50–100 用户 / 单机）

- 日期：2026-10-22
- 状态：proposed（待批准；P2 之后依赖 D1–D3 决策）
- 范围：部署、配置、数据、备份、性能、观测、发布；**不改领域模型与公开 API 形状**
- 技术栈：Django 6.1 + DRF 3.18 + Postgres 16/17 + gunicorn；React 19 + Vite +
  Node 24 SSR；nginx + systemd
- 依据：`deploy/README.md`、`docs/adr/ADR-0010-runtime-stack.md`、
  `docs/adr/ADR-0020-ssr-production.md`、`docs/plans/20261021-refactor-freeze.md`、
  `manage.py check --deploy` 实测
- 执行：inline；建议在确认当前工作树后从 `refactor/foundation` 切出
  `chore/prod-hardening`，避免与 R0/R1 领域重构混在一起

## Aegis Visibility

这次改的是 `config/settings.py`（全局共享）、数据库持久化、SSR 公开首页和依赖清单，
四者都会影响所有 app 与发布流程，所以需要一份带验收命令和回滚路径的耐久计划，
而不是零散地改配置。

## 0. 结论

当前项目是**“能本地跑的原型”**，不是“能上线的服务”。缺口不在功能，而在五件事：

1. **进程**：`deploy/systemd/opuscule-api.service.example` 调用的 `gunicorn` 不在
   `backend/requirements.txt` 里，照抄会启动失败。
2. **数据**：`deploy/.env.example` 声明了 `DATABASE_URL`，但 `settings.py` 完全不读，
   生产会静默继续用 SQLite；也没有 `STATIC_ROOT`、`LOGGING`、`CACHES`。
3. **安全**：`DEBUG` 默认 `True`，`SECRET_KEY` 有硬编码回退；`check --deploy` 仍有
   4 条警告（HSTS/SSL 重定向/两个 Secure Cookie）。
4. **SSR**：`server.prod.mjs` 首页硬编码 `world=wuhai`；每个 SPA 请求都
   `readFileSync(index.html)`；无缓存、无压缩。
5. **运维**：无备份、无外部探活、无发布/回滚脚本；`deploy/` 自述是“未执行草图”。

按 50–100 用户标准，**不需要** k8s、Redis、CDN、读写分离；一台 2C4G VPS +
nginx + gunicorn + Postgres + 单 Node SSR 进程足够。

## 1. 需求就绪检查

| 项 | 状态 |
|---|---|
| 目标容量 | 已明确：50–100 人。本方案按“50–100 注册用户、10–20 并发峰值”规划 |
| 交付 | 先制定计划；批准后按阶段实施 |
| 不做 | 新功能、11 工具、AI、地图 v2、协作、`/api/v1`、OpenAPI |
| 待定 | D1 部署形态、D2 数据库、D3 新依赖、D4 DEBUG 默认、D5 域名/TLS、D6 规格 |

> 若“50–100 人”指**并发**而非注册用户，规格需升到 4C8G 并引入 Redis；
> 本方案先按注册用户口径，D6 时确认。

## 2. TDD Route

- mode：`off`
- decision：`skipped`
- authority：用户未要求 TDD；本计划以运维/配置为主
- test posture：现有 96 条后端测试 + 前端构建/预算门禁；对新增行为
  （生产配置守卫、SSR 首页解析、缓存）补最小回归测试
- verification：`check --deploy` 0 issues、`manage.py test`、curl 冒烟、
  备份恢复演练、压测报告

## 3. 变更必要性（Change Necessity）

docs/config-only 不够：部署草图引用了不存在的 gunicorn、settings 忽略数据库配置、
没有 `STATIC_ROOT` 导致 `collectstatic` 无法工作、SSR 首页硬编码 demo 世界。
最小代码边界：

- `backend/config/settings.py`：生产守卫、数据库、静态、日志
- `backend/requirements.txt`：`gunicorn`、`psycopg[binary]`
- `frontend/server.prod.mjs`：首页世界解析、启动时缓存、公开页短缓存
- `deploy/` 与 `scripts/`：可执行的 unit/nginx/备份/发布脚本
- 少量测试：配置守卫与 SSR 首页解析

## 4. 兼容边界与影响面

- `/api/*` 路径、字段、权限行为不变；不新增 `/api/v1`。
- 前端路由与视觉不变；`Workspace` 仍是唯一 Tiptap chunk。
- 本地开发仍可用 SQLite + `runserver`；生产用 Postgres + gunicorn。
- 新增依赖仅服务端两个：`gunicorn`、`psycopg[binary]`；不引入
  whitenoise/redis/sentry（静态交给 nginx）。
- 数据库迁移只做“空库建表”或 `dumpdata/loaddata`；当前 demo 数据可重建。

Ripple Signal Triage：`config/settings.py` 是全局共享 owner；数据库是持久化边界；
SSR 首页是公开面；`requirements.txt` 是分发面。下游消费者是全部 app、CI、部署脚本。
本计划不改 API 形状、不改表结构，只换运行时与配置，因此不需要迁移兼容分支。

Plan Pressure Test：owner（settings / deploy / server.prod.mjs）清晰；无新契约；
验证由 `check --deploy`、96 条测试、smoke、备份演练、压测五层覆盖；每个阶段
0.5–2.5 人日可独立验收。结论：通过，不返回设计。

## 5. 容量模型与 SLO

| 项 | 目标 |
|---|---|
| 注册用户 | 50–100 |
| 并发峰值 | 10–20 |
| 日均 PV | 1k–3k |
| 数据量 | DB < 100 MB；媒体 < 20 GB（图片 4 MB 上限） |
| 服务器 | 2 vCPU / 4 GB / 60 GB SSD，5 Mbps |
| API p95 | < 300 ms |
| SSR p95 | < 500 ms |
| 可用性 | 99.5%（单机，允许每月约 3.6 h 维护窗口） |
| RPO / RTO | 24 h / 2 h |
| 月成本 | VPS + 备份存储约 $15–25（不含域名） |

## 6. 目标拓扑

```
Internet
  │  :443 TLS（Let's Encrypt）
  ▼
nginx
  ├─ /static/  → alias /srv/opuscule/backend/staticfiles/
  ├─ /media/   → alias /srv/opuscule/backend/media/
  ├─ /api/ /admin/ /share/ /robots.txt /sitemap.xml /feed.xml
  │            → gunicorn 127.0.0.1:8000
  └─ /         → node server.prod.mjs 127.0.0.1:5175
                   └─ 内部 fetch 127.0.0.1:8000/api
Postgres 16/17 127.0.0.1:5432
systemd：opuscule-api / opuscule-web / nginx / postgresql
备份：pg_dump + media → 本机 + 异地对象存储
```

**gunicorn 选 1 worker × 8 threads（gthread）**：当前限流用 LocMem，多 worker 会让
10/min 变成 N×10/min；8 线程足以覆盖 10–20 并发。用户量到 200+ 或需要多 worker 时，
再引入 Redis 并把限流/缓存切过去（见“明确不做”）。

## 7. 现状审计（实测）

| 项 | 现状 | 风险 |
|---|---|---|
| WSGI 服务器 | `requirements.txt` 只有 Django/DRF | systemd 示例引用 gunicorn，启动即失败 |
| 数据库 | SQLite 428 KB；`DATABASE_URL` 未被读取 | 生产误用 SQLite，多进程写锁 |
| 静态文件 | 无 `STATIC_ROOT`；nginx 把 `/static/` 反代给 Django | `collectstatic` 失败，admin 样式 404 |
| 日志 | 无 `LOGGING` | 只有默认 stderr，无访问日志/级别控制 |
| 缓存 | 无 `CACHES`；限流用 LocMem | 多 worker 时计数不共享 |
| 安全 | `DEBUG` 默认 True；`SECRET_KEY` 有硬编码回退；`check --deploy` 4 警告 | 误部署即泄露调试信息/弱密钥 |
| 管理后台 | `/admin/` 直接暴露 | 无 IP 白名单/额外限流 |
| SSR | 单进程；每请求 `readFileSync`；首页硬编码 `wuhai` | 生产首页指向 demo 世界 |
| 媒体 | `backend/media`，当前 0 文件；nginx 指向 `/srv/opuscule/media` | 路径不一致，上传后 404 |
| 备份 | 无 | 磁盘故障即丢数据 |
| 观测 | `/healthz`、`/api/health/` 有 | 无外部探活/磁盘/证书告警 |
| 发布 | 无脚本/回滚 | 手工操作不可复现 |
| 测试 | 96 条后端测试 + 前端快照/预算 | 基线良好，CI 可复用 |

## 8. 分阶段计划

### P0 冻结与基线（0.5 人日）

- 与用户确认后，提交或暂存当前工作树改动（46 个已跟踪文件，3069+/1410-，
  另有 `AuthTerminal` 等新组件）。
- 打 tag `pre-prod-hardening`；记录 `make ci` 基线（耗时、bundle 大小、测试数）。
- 从基线切 `chore/prod-hardening` 分支。

验收：`git status` 干净；`make ci` 通过；基线数据记录在 P0 执行记录里。
回滚：不需要（只读基线）。

### P1 配置与安全基线（1.5 人日）

改动：

- `backend/config/settings.py`
  - 生产守卫：`DJANGO_ENV=production` 时，缺 `DJANGO_SECRET_KEY`、`DEBUG=1`、
    空 `ALLOWED_HOSTS`、空 `CSRF_TRUSTED_ORIGINS` 一律 `ImproperlyConfigured`。
  - `DEBUG` 默认改 `False`（D4）；本地用 `DJANGO_DEBUG=1`。
  - `STATIC_ROOT = BASE_DIR / "staticfiles"`；`STATIC_URL = "/static/"`；
    `MEDIA_ROOT` 支持 `DJANGO_MEDIA_ROOT`。
  - `LOGGING`：console（journald 收集），`django.request` WARNING。
  - `DATABASES`：从 `DJANGO_DB_NAME/USER/PASSWORD/HOST/PORT` 读取；默认 SQLite；
    `CONN_MAX_AGE=60`、`CONN_HEALTH_CHECKS=True`。
  - 现有 SSL/HSTS/Secure Cookie 开关保留，生产 env 全部打开。
    **HSTS 先 300 秒，稳定 1–2 周后再升 31536000；`preload` 最后开，开通后很难回退。**
- `backend/requirements.txt`：`gunicorn==23.*`、`psycopg[binary]==3.*`（D3 批准后）。
- `deploy/.env.example`：改为真实变量集；删掉未实现的 `DATABASE_URL` 或改为
  `DJANGO_DB_*`；补 `DJANGO_ENV`、`DJANGO_MEDIA_ROOT`。
- `deploy/nginx.conf.example`：`limit_req`（`/api/auth/login|register`、`/admin/`）、
  安全头、`client_max_body_size 12m`、`/static/`/`/media/` alias、
  `/admin/` IP allowlist（或 basic auth）。
- `README.md`：本地启动改为显式 `DJANGO_DEBUG=1`（`DEBUG` 默认值变更后）。

验收：生产 env 下 `manage.py check --deploy` 0 issues（HSTS preload 开启前允许
`security.W021`）；`manage.py test` 全绿；
`DJANGO_DEBUG=1 runserver` 仍可用；`curl -I` 看到 HSTS/安全头。
回滚：还原 settings 提交；无数据库变更。

### P2 运行时与数据（2.5 人日）

改动：

- `deploy/systemd/opuscule-api.service`（去 `.example`）：gunicorn
  `config.wsgi:application --workers 1 --threads 8 --worker-class gthread
  --timeout 60 --access-logfile - --error-logfile -`；
  `NoNewPrivileges`、`PrivateTmp`、`ProtectSystem=strict`、`ReadWritePaths`。
- `deploy/systemd/opuscule-web.service`：Node SSR，`After=opuscule-api`。
- `deploy/nginx.conf`：TLS、HTTP→HTTPS、gzip、缓存头、上传 12m、超时；
  可选把 `/assets/` 直接 alias 到 `frontend/dist/assets/`，减少 Node 静态压力。
- Postgres：建库/用户、`migrate`；demo 用 `seed_demo` 重建，真实数据用
  `dumpdata/loaddata`。
- 主机基线：ufw 只开 22/80/443；SSH 仅密钥登录；`unattended-upgrades`；
  Postgres 只监听 `127.0.0.1`；时区 `Asia/Shanghai` + NTP。
- Python 3.13 venv + `pip install -r backend/requirements.txt`；
  前端用 `npm ci`（不是 `npm install`）构建。
- `collectstatic --noinput`；统一 media 路径为 `/srv/opuscule/backend/media/`；
  `staticfiles/` 与 `media/` 属主 `opuscule:www-data`、权限 `750`。

验收：`curl` 全路由 200/301；`/api/health/` 返回 `database: ok`；admin 静态加载；
重启机器后两个服务自动恢复；`journalctl -u opuscule-api` 有请求日志。
回滚：nginx upstream 切回旧进程；数据库用 P3 备份恢复。

### P3 备份与恢复（1 人日）

改动：

- `scripts/backup.sh`：`pg_dump -Fc` + media `tar`；保留 7 日/4 周；异地
  `rclone`/S3（D5 确认目标）。
- `scripts/restore.sh`：恢复到临时库 + 媒体解包 + 校验。
- systemd timer 或 cron：每日 03:00。

验收：备份文件 `pg_restore --list` 可读；在临时库完成一次恢复并启动冒烟；
记录 RTO 实测。
回滚：备份脚本失败不影响线上；恢复只写临时目录。

### P4 性能与容量（2.5 人日）

改动：

- `frontend/server.prod.mjs`
  - 启动时缓存 `dist/index.html` 与 manifest，避免每请求 `readFileSync`。
  - 首页世界改为 `OPUSCULE_HOME_WORLD` 环境变量；未设置时取第一个公开世界，
    再退回 `/explore`（修复硬编码 `wuhai`）。
  - 公开页（Home/Wiki/Explore/Profile）加进程内 LRU，key = path + theme，TTL 60 s；
    发布重启即失效。不要给 HTML 加浏览器共享缓存，避免主题 cookie 串色。
  - `fetchJson` 加 3 s `AbortSignal.timeout`：API 卡住时快速返回 502，避免 SSR
    连接堆积。
- 查询审计：`EXPLAIN` 慢查询；`WorldDetailSerializer` 全量 cards 在真实数据上
  评估，必要时加 `prefetch_related` 或分页（分页会改 API 形状，需单独批准）。
- nginx：`gzip on`（JS/CSS/JSON/SVG）；`/assets/` immutable；`/api/` 不缓存。
- 压测：`hey -n 2000 -c 50` 打 `/`、`/w/wuhai/wiki`、`/api/worlds/wuhai/`。

验收：压测 p95 达标；`npm run check:budget` 不回归；96 条测试全绿；
无新增 N+1（抽查 world detail、timeline、map）。
回滚：SSR 单文件回滚；nginx 配置 `nginx -t` 后 reload。

### P5 观测与发布（1.5 人日）

改动：

- 外部探活：`/healthz` + `/api/health/` 每 1–5 min；磁盘/内存/证书到期告警
  （Uptime Kuma / 云监控，二选一）。
- 日志：journald + `logrotate`；gunicorn access log；nginx access/error。
- `scripts/deploy.sh`：备份 → 构建（`npm ci && npm run build:all`）→ `migrate` →
  `collectstatic` → 重启 api → 重启 web → `scripts/smoke.sh`；失败自动回滚上一 release。
  数据库迁移只做向前兼容，**不自动回滚 DB**。
- `scripts/smoke.sh`：`/`、`/explore`、`/w/<slug>/wiki`、`/api/health/`、
  `/api/worlds/`、登录页。
- `.github/workflows/ci.yml`：加生产 env 的 `check --deploy`；部署 job 暂不做。
- `docs/runbook.md`：证书续期、备份恢复、回滚、常见故障。

验收：完整发布一次；故意回滚一次；探活告警触发一次。
回滚：`deploy.sh` 内置上一 release 指针；数据库迁移只做向前兼容。

## 9. 明确不做

k8s / Docker Swarm、多机、CDN、读写分离、Celery/worker、Meilisearch、OpenAPI、
`/api/v1`、Sentry、Redis（200+ 用户再评估）、CSP（先 report-only 观察）、
11 工具 / AI / 地图 v2 / 协作（重构冻结中）。

## 9.1 退役路径

- P2 完成后删除 `deploy/*.example`，只保留实际在用的 unit/nginx 文件。
- 更新 `deploy/README.md`：去掉“topology sketch / not tested”的声明，改为真实拓扑与 runbook 链接。
- 删除 `.env.example` 中未实现的 `DATABASE_URL`，统一为 `DJANGO_DB_*`。
- `deploy/README` 里“install gunicorn separately”的说明随 requirements 更新而删除。

## 10. 待确认决策

| # | 决策 | 推荐 | 影响 |
|---|---|---|---|
| D1 | 部署形态 | 单台 VPS + systemd + nginx | 决定 P2 产物；Docker/PaaS 需重写 |
| D2 | 数据库 | Postgres 16/17 | 决定 P2/P3；继续 SQLite 则只需 WAL + 单 worker |
| D3 | 新依赖 | 批准 `gunicorn` + `psycopg[binary]` | 不批准则无法上生产 WSGI/ PG |
| D4 | `DEBUG` 默认 | 改 `False`，本地显式 `DJANGO_DEBUG=1` | 更安全，但改本地启动命令 |
| D5 | 域名/TLS | 已有域名？certbot / Cloudflare | 决定 P2 的证书与 DNS 步骤 |
| D6 | 规格 | 2C4G（注册用户口径） | 若 50–100 指并发，升 4C8G + Redis |

## 11. 上线验收清单

- [ ] `manage.py check --deploy` 0 issues（preload 开启后；之前仅允许 W021）
- [ ] `manage.py test` 96 条全绿；`npm run build:all` + `check:budget` 通过
- [ ] 全路由 smoke 通过（含 admin 静态、media 上传/读取）
- [ ] Postgres 只监听 `127.0.0.1`；ufw 只开 22/80/443
- [ ] HSTS 分阶段开启（先 300 s，稳定后再长周期；preload 最后）
- [ ] 重启机器后 API/SSR 自动恢复
- [ ] 备份 + 恢复演练完成，RTO < 2 h
- [ ] 压测 p95 达标（API < 300 ms，SSR < 500 ms）
- [ ] 发布 + 回滚各演练一次
- [ ] 外部探活与磁盘/证书告警生效
- [ ] 密钥只存在于服务器 env 文件（0600），不入库
- [ ] runbook 可被第二个人照着执行

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 当前 46 文件未提交，混入发布 | P0 先确认提交/暂存，切独立分支 |
| SQLite→PG 若已有真实数据需停机 | 当前 demo 可重建；有真实数据则选维护窗口 + `dumpdata` |
| gunicorn 多 worker 与 LocMem 限流冲突 | v1 固定 1 worker × 8 threads；扩容时先上 Redis |
| SSR 首页硬编码 `wuhai` | P4 改为 env + 首个公开世界回退，并加测试 |
| 新依赖与重构冻结冲突 | 按 `refactor-freeze` 例外流程登记，仅这两个服务端依赖 |
| 单机故障 | 每日备份 + 2 h RTO；不承诺 99.9% |

## 13. 估时

| 阶段 | 人日 |
|---|---:|
| P0 冻结与基线 | 0.5 |
| P1 配置与安全 | 1.5 |
| P2 运行时与数据 | 2.5 |
| P3 备份与恢复 | 1 |
| P4 性能与容量 | 2.5 |
| P5 观测与发布 | 1.5 |
| 缓冲（20%） | 1.8 |
| **合计** | **约 11.3 人日** |

建议顺序：P0 → P1 → P2 先形成“可上线最小闭环”，P3/P4/P5 紧随；
D1–D3 未确认前不进入 P2。

## 14. 与现有重构计划的关系

- 不替代 `20261021-foundation-refactor.md` 的 R0–R5；本计划只做“生产就绪”切片。
- Postgres 与依赖选择与 R2 一致；若 R2 提前，P2 的数据库部分合并进 R2，避免两次迁移。
- 不触碰 `type_key`、LinkIndex、`/api/v1` 等领域内核项。
- 冻结清单中的“允许：Bug/安全修复、文档、测试、脚本、无新依赖的性能修复”
  覆盖 P1/P4 的大部分；P2 的两个新依赖按例外流程登记。
