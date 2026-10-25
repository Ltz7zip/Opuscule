#!/usr/bin/env bash
# One-shot provisioning for a fresh Ubuntu 24.04 box (2 vCPU / 2 GB is enough).
# Run as root:  bash install.sh [git-url] [branch]
set -euo pipefail

REPO="${1:-https://github.com/Ltz7zip/Opuscule.git}"
BRANCH="${2:-main}"
APP_USER="opuscule"
APP_DIR="/srv/opuscule"
DOMAIN="${DOMAIN:-_}"          # set to your domain when you have one
PORT=8000

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

log "python version"
python3 -c 'import sys; assert sys.version_info >= (3, 12), "need python >= 3.12 (Ubuntu 24.04)"; print(sys.version)'

log "apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip git nginx curl ca-certificates

log "nodejs 22 (for the frontend build)"
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v && npm -v

log "app user + checkout"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

log "python venv"
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/backend/.venv"
sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/pip" install -q --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

log "environment file"
ENV_FILE="$APP_DIR/deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
  cat > "$ENV_FILE" <<EOF
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=$SECRET
DJANGO_ALLOWED_HOSTS=$DOMAIN
DJANGO_CSRF_TRUSTED_ORIGINS=
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

log "frontend build"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

log "migrate + collectstatic"
sudo -u "$APP_USER" bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR/backend' && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"

log "systemd unit"
install -m 644 "$APP_DIR/deploy/remote/opuscule.service" /etc/systemd/system/opuscule.service
systemctl daemon-reload
systemctl enable --now opuscule
systemctl restart opuscule

log "nginx"
sed "s/__SERVER_NAME__/$DOMAIN/" "$APP_DIR/deploy/remote/nginx.conf" > /etc/nginx/sites-available/opuscule
ln -sf /etc/nginx/sites-available/opuscule /etc/nginx/sites-enabled/opuscule
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "health check"
sleep 2
curl -fsS http://127.0.0.1/api/health/ && echo
curl -fsS -o /dev/null -w 'index: %{http_code}\n' http://127.0.0.1/
log "done — http://$(curl -fsS ifconfig.me || echo SERVER_IP)/"
