#!/usr/bin/env bash
# Pull, rebuild and restart on the server.
set -euo pipefail
APP_DIR="/srv/opuscule"
cd "$APP_DIR"
sudo -u opuscule git pull --ff-only
sudo -u opuscule bash -lc "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"
sudo -u opuscule bash -lc "set -a; . '$APP_DIR/deploy/.env'; set +a; cd '$APP_DIR/backend' && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"
systemctl restart opuscule
systemctl reload nginx
curl -fsS http://127.0.0.1/api/health/ && echo
