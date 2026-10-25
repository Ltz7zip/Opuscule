#!/usr/bin/env bash
# Bring the previous deployment's SQLite database into the new deployment.
# Everything is reversible: the current DB is copied aside first and restored
# automatically if the migration fails.
set -euo pipefail

APP_DIR="/srv/opuscule"
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="/root/opuscule-db-migration-$TS"
DB="$APP_DIR/backend/db.sqlite3"
PY="$APP_DIR/backend/.venv/bin/python"
ENV_FILE="$APP_DIR/deploy/.env"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; }

[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE (run install.sh first)"; exit 1; }

OLD_DIR=$(ls -dt /srv/opuscule-old-* 2>/dev/null | head -1 || true)
[[ -n "$OLD_DIR" ]] || { echo "no /srv/opuscule-old-* directory found"; exit 1; }
OLD_DB=""
for candidate in "$OLD_DIR/backend/db.sqlite3" "$OLD_DIR/db.sqlite3"; do
  [[ -f "$candidate" ]] && OLD_DB="$candidate" && break
done
[[ -n "$OLD_DB" ]] || { echo "no sqlite database inside $OLD_DIR"; exit 1; }

log "previous deployment: $OLD_DIR"
log "previous database:   $OLD_DB ($(du -h "$OLD_DB" | cut -f1))"
log "backup directory:    $BACKUP"
mkdir -p "$BACKUP"
cp -a "$DB" "$BACKUP/current-empty.sqlite3" 2>/dev/null || true
for extra in "$OLD_DB-wal" "$OLD_DB-shm"; do
  [[ -f "$extra" ]] && cp -a "$extra" "$BACKUP/" || true
done

log "counting what the old database holds"
sudo -u opuscule bash -lc "cd '$APP_DIR/backend' && set -a && . '$ENV_FILE' && set +a && \
  '$PY' - <<'PY'
import sqlite3, sys
con = sqlite3.connect('$OLD_DB')
try:
    for label, sql in (
        ('users', 'select count(*) from auth_user'),
        ('worlds', 'select count(*) from worlds_world'),
        ('cards', 'select count(*) from cards_card'),
        ('markers', 'select count(*) from maps_mapmarker'),
    ):
        try:
            print(f'  {label}: {con.execute(sql).fetchone()[0]}')
        except sqlite3.Error:
            print(f'  {label}: (table missing)')
finally:
    con.close()
PY"

restore() {
  fail "migration failed — restoring the empty database"
  cp -a "$BACKUP/current-empty.sqlite3" "$DB"
  chown opuscule:opuscule "$DB"
  systemctl restart opuscule || true
  fail "site is back on the empty database; backup kept at $BACKUP"
}
trap restore ERR

log "stopping the API"
systemctl stop opuscule

log "installing the previous database"
cp -a "$OLD_DB" "$DB"
rm -f "$DB-wal" "$DB-shm"
chown opuscule:opuscule "$DB"

log "applying migrations (--fake-initial tolerates tables that already exist)"
sudo -u opuscule bash -lc "cd '$APP_DIR/backend' && set -a && . '$ENV_FILE' && set +a && \
  '$PY' manage.py migrate --noinput --fake-initial" | tee "$BACKUP/migrate.log" | tail -20

log "starting the API"
systemctl start opuscule
trap - ERR
sleep 2

log "health + data check"
curl -fsS --max-time 10 -H 'Host: 127.0.0.1' http://127.0.0.1/api/health/ && echo
WORLDS=$(curl -fsS --max-time 10 -H 'Host: 127.0.0.1' http://127.0.0.1/api/worlds/ | head -c 400)
echo "  /api/worlds/ -> ${WORLDS:0:300}"

log "done — rollback copy: $BACKUP/current-empty.sqlite3"
