# Opuscule backend

Django + DRF 的 JSON API；本地 SQLite，线上 gunicorn。

```sh
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo        # traveler / opuscule-demo（仅本机）
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

测试：`.venv/bin/python manage.py test`（`apps/*/tests.py` 与 `test_*.py`）。

## API 面

完整路由以 `config/urls.py` 为准，主要分组：

- 认证与资料：`/api/auth/{csrf,session,login,register,logout,password}/`、`/api/profile/`、`/api/u/<username>/`
- 世界：`/api/worlds/`、`/api/worlds/<slug>/`、成员、邀请、trash、audit、导出/导入、transfer-ownership
- 设定集：`/api/worlds/<slug>/collections/`、`/cards/`、`/cards/by-slug/<slug>/`
- 世界概念：`/concept/`（读）、`/concept/edit/`（编辑器草稿读写）、`/concept/publish/`、`/concept/revisions/`、`/concept/comments/`
- 卡片评论与通知：`/cards/<id>/comments/`、`/api/notifications/`
- 时间线与地图：`/timelines/`、`/timelines/<id>/`、`/map/`、`/map/markers/`、`/map/background/`、`/map/terrain/`
- 搜索与发现：`/api/search/`、`/api/explore/`
- 公开面：`/feed.xml`、`/w/<slug>/feed.xml`、`/robots.txt`、`/sitemap.xml`、`/share/...`
- 健康：`/api/health/`、`/healthz`

## 权限与约定

- Django session + CSRF；世界内角色 `owner` / `editor` / `viewer`。
- 读用 `get_world_for_read`，写用 `get_world_for_write`；owner-only 操作见仓库根 `AGENTS.md`。
- 分层由 `importlinter`（`backend/pyproject.toml`）约束：models 不得 import serializers/views。

## 生产

当前线上是 SQLite + gunicorn；Postgres 迁移尚未做。部署与内容同步见
`deploy/README.md` 与 `AGENTS.md`。
