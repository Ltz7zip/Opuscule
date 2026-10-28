# Opuscule 单机部署

线上：<https://opuscule.cc/>（`lavi.opuscule.cc` 同一实例）。Ubuntu 26.04 单机，无容器。

## 拓扑

| 进程 | 端口 | 职责 |
|---|---:|---|
| nginx | 80/443 | TLS、静态 `frontend/dist`、`/media/`、`/static/`，以及把 Django 拥有的前缀反代给 gunicorn |
| gunicorn `opuscule`（systemd） | 127.0.0.1:8000 | Django API、`/admin/`、share、feed、robots/sitemap、health |
| SQLite | — | `/srv/opuscule/backend/db.sqlite3` |

**线上没有 node / SSR 进程**：nginx 直接服务前端构建产物，所有页面客户端渲染；
SSR（`server.mjs` / `server.prod.mjs`）只是本地能力。

反代前缀：`/api`、`/admin`、`/share`、`/robots.txt`、`/sitemap.xml`、`/feed.xml`、
`/healthz`、`/w/<slug>/feed.xml`。新增 Django 根级路由时必须同步
`deploy/remote/locations.conf`，否则会被 SPA 的 `try_files` 兜底成 HTML。

## 文件

- `remote/install.sh` — 首次安装（系统包、Node、venv、构建、migrate、systemd、nginx、证书）。
- `remote/update.sh` — 日常更新（pull、`npm ci && npm run build`、pip、migrate、collectstatic、重启、reload）。
- `remote/locations.conf` — nginx 反代与静态规则（被站点配置 include）。
- `remote/migrate-db.sh` — 旧库迁移（带备份与失败回滚）。
- `systemd/opuscule-*.service.example` — systemd 单元示例。
- `nginx.conf.example` — TLS/域名占位示例。
- `../deploy/.env` — 线上 secrets（600，不进仓库）。

## 更新

```sh
git push origin main
ssh opuscule 'sudo bash /srv/opuscule/deploy/remote/update.sh'
```

内容（概念、卡片、时间线等）不在 git 里，用 `world_snapshot` 同步：

```sh
cd backend && .venv/bin/python manage.py world_snapshot --slug wuhai --out /tmp/wuhai.json
scp /tmp/wuhai.json opuscule:/tmp/
ssh opuscule "cd /srv/opuscule/backend && sudo -u opuscule .venv/bin/python manage.py world_snapshot --slug wuhai --in /tmp/wuhai.json"
```

## 维护

- 备份：迁移脚本会备份 DB；日常备份/保留策略尚未自动化。
- 健康检查：`/api/health/`、`/healthz`。
- 媒体：`backend/media/`，nginx `/media/` 直出（公开 URL，无鉴权）。
- 地形：不在服务器生成，本地 `manage.py terrain_push` 推送。

## 未做

- Postgres 迁移与数据库备份策略。
- 监控、告警、日志轮转、边缘限流。
- 对象存储/CDN、零停机发布、负载测试。
