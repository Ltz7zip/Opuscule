#!/usr/bin/env bash
# One-shot provisioning for a fresh Ubuntu 24.04 box (2 vCPU / 2 GB is enough).
# Run as root:  bash install.sh [git-url] [branch]
set -euo pipefail

REPO="${1:-https://github.com/Ltz7zip/Opuscule.git}"
BRANCH="${2:-main}"
APP_USER="opuscule"
APP_DIR="/srv/opuscule"
DOMAINS="${DOMAINS:-opuscule.cc lavi.opuscule.cc}"
PRIMARY="${DOMAINS%% *}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
CERT=""
PORT=8000

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
BACKUP="/root/opuscule-deploy-backup-$TS"
log "backing up current nginx/systemd to $BACKUP"
mkdir -p "$BACKUP"
cp -a /etc/nginx "$BACKUP/nginx" 2>/dev/null || true
systemctl list-unit-files > "$BACKUP/systemd-units.txt" 2>/dev/null || true
ls -la /srv > "$BACKUP/srv.txt" 2>/dev/null || true

log "snapshot any existing databases (old deployment)"
find /srv /root /opt -maxdepth 4 -name 'db.sqlite3' -not -path "$APP_DIR/*" 2>/dev/null | while read -r db; do
  echo "  found $db"
  cp -a "$db" "$BACKUP/db-$(echo "$db" | tr '/' '_')" 2>/dev/null || true
done

log "python version"
python3 -c 'import sys; assert sys.version_info >= (3, 12), "need python >= 3.12 (Ubuntu 24.04)"; print(sys.version)'

log "apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip git nginx curl ca-certificates certbot python3-certbot-nginx

log "nodejs 22 (for the frontend build)"
if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v && npm -v

log "app user + checkout"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
OLD_DIR=""
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
elif [[ -d "$APP_DIR" ]]; then
  # A previous (non-git or older) deployment lives there: stop whatever runs
  # from it, move it aside, and clone cleanly.
  log "existing deployment at $APP_DIR — stopping its services"
  for unit in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
    if systemctl show -p WorkingDirectory --value "$unit" 2>/dev/null | grep -q "^$APP_DIR"; then
      log "  stopping $unit"
      systemctl stop "$unit" || true
      systemctl disable "$unit" || true
    fi
  done
  OLD_DIR="/srv/opuscule-old-$TS"
  log "moving it to $OLD_DIR (kept for rollback)"
  mv "$APP_DIR" "$OLD_DIR"
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

log "python venv"
rm -rf "$APP_DIR/backend/.venv"
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/backend/.venv"
sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/pip" install -q --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/backend/.venv/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

if [[ -n "$OLD_DIR" ]]; then
  for media in "$OLD_DIR/backend/media" "$OLD_DIR/media"; do
    if [[ -d "$media" ]]; then
      log "carrying media from $media"
      install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR/backend/media"
      cp -a "$media/." "$APP_DIR/backend/media/" || true
      chown -R "$APP_USER:$APP_USER" "$APP_DIR/backend/media"
      break
    fi
  done
  for db in "$OLD_DIR/backend/db.sqlite3" "$OLD_DIR/db.sqlite3"; do
    if [[ -f "$db" ]]; then
      cp -a "$db" "$BACKUP/previous-db.sqlite3"
      log "previous database saved to $BACKUP/previous-db.sqlite3"
      break
    fi
  done
fi

log "environment file"
ENV_FILE="$APP_DIR/deploy/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
  HOSTS=$(echo "$DOMAINS 43.128.56.200" | tr ' ' '\n' | sort -u | paste -sd, -)
  ORIGINS=$(for d in $DOMAINS; do printf 'https://%s,' "$d"; done)
  cat > "$ENV_FILE" <<EOF
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=$SECRET
DJANGO_ALLOWED_HOSTS=$HOSTS
DJANGO_CSRF_TRUSTED_ORIGINS=${ORIGINS%,}
DJANGO_SESSION_COOKIE_SECURE=0
DJANGO_SECURE_SSL_REDIRECT=0
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

log "frontend build"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR/frontend' && npm ci --no-audit --no-fund && npm run build"

log "migrate + collectstatic"
sudo -u "$APP_USER" bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR/backend' && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput"

if systemctl list-unit-files | grep -q '^opuscule\.service'; then
  log "stopping the previous opuscule.service (rollback files in $BACKUP)"
  systemctl stop opuscule || true
  systemctl disable opuscule || true
  cp -a /etc/systemd/system/opuscule.service "$BACKUP/" 2>/dev/null || true
fi

if ss -ltn 2>/dev/null | grep -q ':8000 '; then
  log "port 8000 busy — stopping the previous API process"
  fuser -k 8000/tcp 2>/dev/null || true
  sleep 1
fi

log "systemd unit"
install -m 644 "$APP_DIR/deploy/remote/opuscule.service" /etc/systemd/system/opuscule.service
systemctl daemon-reload
systemctl enable --now opuscule
systemctl restart opuscule

log "nginx (plain, then TLS if a certificate exists or can be issued)"
sed -e "s/__SERVER_NAME__/$DOMAINS/" \
  "$APP_DIR/deploy/remote/nginx.conf" > /etc/nginx/sites-available/opuscule
ln -sf /etc/nginx/sites-available/opuscule /etc/nginx/sites-enabled/opuscule
# Retire every other enabled site (all of them were copied into $BACKUP above).
for site in /etc/nginx/sites-enabled/*; do
  [[ -e "$site" ]] || continue
  case "$(basename "$site")" in
    opuscule) ;;
    *) log "disabling previous site $(basename "$site")"; rm -f "$site" ;;
  esac
done
nginx -t
systemctl reload nginx

# Reuse any existing certificate whose SAN covers the primary domain: boxes
# often carry a certificate named after an IP or a temporary hostname.
CERT=""
for candidate in /etc/letsencrypt/live/*/cert.pem; do
  [[ -f "$candidate" ]] || continue
  if openssl x509 -in "$candidate" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$PRIMARY\b"; then
    CERT=$(dirname "$candidate")
    break
  fi
done

log "TLS"
if [[ -n "$CERT" && -f "$CERT/fullchain.pem" ]]; then
  log "reusing the existing certificate at $CERT (covers $PRIMARY)"
  sed -e "s/__SERVER_NAME__/$DOMAINS/" \
      -e "s|__CERT__|$CERT/|" \
      "$APP_DIR/deploy/remote/nginx-tls.conf" > /etc/nginx/sites-available/opuscule
  nginx -t && systemctl reload nginx
  sed -i 's/^DJANGO_SESSION_COOKIE_SECURE=.*/DJANGO_SESSION_COOKIE_SECURE=1/' "$ENV_FILE"
  systemctl restart opuscule
elif command -v certbot >/dev/null; then
  log "requesting a certificate for: $DOMAINS"
  CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --redirect
                $(for d in $DOMAINS; do printf -- '-d %s ' "$d"; done))
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    CERTBOT_ARGS+=(-m "$CERTBOT_EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi
  if certbot "${CERTBOT_ARGS[@]}"; then
    sed -i 's/^DJANGO_SESSION_COOKIE_SECURE=.*/DJANGO_SESSION_COOKIE_SECURE=1/' "$ENV_FILE"
    systemctl restart opuscule
  else
    log "certbot failed — the site still works over plain HTTP"
  fi
fi

log "health check"
sleep 2
if ! curl -fsS --max-time 10 -H 'Host: 127.0.0.1' http://127.0.0.1/api/health/ >/dev/null 2>&1; then
  # TLS is on now: plain HTTP answers 301, so probe the real hostname.
  curl -fsS --max-time 10 "https://$PRIMARY/api/health/" && echo
  curl -fsS -o /dev/null --max-time 10 -w "index: %{http_code}\n" "https://$PRIMARY/"
else
  curl -fsS --max-time 10 -H 'Host: 127.0.0.1' http://127.0.0.1/api/health/ && echo
  curl -fsS -o /dev/null --max-time 10 -w 'index: %{http_code}\n' -H 'Host: 127.0.0.1' http://127.0.0.1/
fi
log "done — $DOMAINS (见上方健康检查结果)"
