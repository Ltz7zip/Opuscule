# 单机部署（Ubuntu 24.04 · 2C2G 足够）

## 最快路径：控制台网页终端里粘一行

```bash
curl -fsSL https://raw.githubusercontent.com/Ltz7zip/Opuscule/main/deploy/remote/install.sh | sudo bash
```

脚本会依次完成：装 python3-venv/nginx/git、装 Node 22、建 `opuscule` 用户、
克隆仓库、建 venv 装依赖、生成 `.env`（随机 SECRET_KEY）、`npm ci && npm run build`、
`migrate`、`collectstatic`、写 systemd 与 nginx 配置、启动服务、跑健康检查。

结束后访问 `http://<公网IP>/` 即可。

## 或者：绑定 SSH 密钥后远程执行

控制台「密钥 → 前往绑定」绑定本机公钥后：

```bash
ssh root@<IP> 'bash -s' < deploy/remote/install.sh
```

## 端口

腾讯云轻量需要在「防火墙」里放行 **80**（有域名和证书时再加 443）。
服务器内 `ufw` 默认未启用，无需额外操作。

## 目录布局

```
/srv/opuscule/
├── backend/.venv/          # Django + DRF + gunicorn
├── backend/db.sqlite3      # SQLite（单机足够；要换 Postgres 见 settings）
├── backend/staticfiles/    # collectstatic
├── frontend/dist/          # 前端构建产物，nginx 直接读
├── media/                  # 用户上传（ZIP 导入、地图背景）
└── deploy/.env             # SECRET_KEY / ALLOWED_HOSTS，权限 600
```

## 日常更新

```bash
sudo bash /srv/opuscule/deploy/remote/update.sh
```

## 换域名 / 上 HTTPS

1. `DJANGO_ALLOWED_HOSTS` 与 `DJANGO_CSRF_TRUSTED_ORIGINS` 写进 `deploy/.env`
2. `deploy/remote/nginx.conf` 的 `server_name` 改成域名
3. `certbot --nginx -d 你的域名` 自动改 80→443
4. `.env` 里加 `DJANGO_SECURE_SSL_REDIRECT=1`、`DJANGO_SESSION_COOKIE_SECURE=1`

## 地形生成

服务器**不跑** 12 秒的地形生成：在本地用 `manage.py terrain_push` 推上去即可
（见 `docs/plans/20261026-local-terrain-upload.md`）。
