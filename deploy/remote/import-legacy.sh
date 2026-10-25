#!/usr/bin/env bash
# Pull the importer, run it against the previous deployment's database.
# Dry-run first; the real import only runs when the dry-run looks sane.
set -euo pipefail

APP_DIR="/srv/opuscule"
PY="$APP_DIR/backend/.venv/bin/python"
ENV_FILE="$APP_DIR/deploy/.env"
TS=$(date +%Y%m%d-%H%M%S)

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

OLD_DIR=$(ls -dt /srv/opuscule-old-* 2>/dev/null | head -1 || true)
[[ -n "$OLD_DIR" ]] || { echo "no /srv/opuscule-old-*"; exit 1; }
OLD_DB=""
for candidate in "$OLD_DIR/backend/db.sqlite3" "$OLD_DIR/db.sqlite3"; do
  [[ -f "$candidate" ]] && OLD_DB="$candidate" && break
done
[[ -n "$OLD_DB" ]] || { echo "no sqlite in $OLD_DIR"; exit 1; }

log "updating code"
sudo -u opuscule git -C "$APP_DIR" pull --ff-only

log "safety copy of the current database"
cp -a "$APP_DIR/backend/db.sqlite3" "/root/opuscule-before-import-$TS.sqlite3"

run_import() {
  sudo -u opuscule bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR/backend' && \
    '$PY' manage.py import_legacy --db '$OLD_DB' $1"
}

log "dry run (nothing is written)"
run_import --dry-run | tee "/root/opuscule-import-dryrun-$TS.log"

log "importing for real"
run_import "" | tee "/root/opuscule-import-$TS.log"

log "restoring ownership and restarting"
chown -R opuscule:opuscule "$APP_DIR/backend"
systemctl restart opuscule
sleep 2
curl -fsS --max-time 10 -H 'Host: 127.0.0.1' http://127.0.0.1/api/health/ && echo

log "worlds now in the new database:"
sudo -u opuscule bash -lc "set -a; . '$ENV_FILE'; set +a; cd '$APP_DIR/backend' && \
  '$PY' - <<'PY'
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from apps.worlds.models import World
from apps.cards.models import Card
from apps.maps.models import MapMarker
from apps.timelines.models import TimelineEntry
for w in World.objects.all():
    print(f'  {w.slug:12s} cards={w.cards.count():3d} markers={w.map_markers.count():3d} '
          f'entries={w.timeline_entries.count():3d} public={w.is_public_read}')
print(f'  total cards={Card.objects.count()} markers={MapMarker.objects.count()} entries={TimelineEntry.objects.count()}')
PY"

log "rollback copy: /root/opuscule-before-import-$TS.sqlite3"
