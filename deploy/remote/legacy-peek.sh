#!/usr/bin/env bash
# Read-only peek at the tables the importer maps. Prints at most 5 rows each,
# long text truncated — enough to tune the mapping without dumping the database.
set -euo pipefail
OLD_DIR=$(ls -dt /srv/opuscule-old-* 2>/dev/null | head -1 || true)
[[ -n "$OLD_DIR" ]] || { echo "no /srv/opuscule-old-*"; exit 1; }
DB=""
for candidate in "$OLD_DIR/backend/db.sqlite3" "$OLD_DIR/db.sqlite3"; do
  [[ -f "$candidate" ]] && DB="$candidate" && break
done
[[ -n "$DB" ]] || { echo "no sqlite in $OLD_DIR"; exit 1; }

python3 - "$DB" <<'PY'
import json, sqlite3, sys
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
con.row_factory = sqlite3.Row
for table in ("world_world", "world_document", "world_card",
              "world_timeline", "world_timelineevent", "world_mapmarker"):
    try:
        rows = con.execute(f'select * from "{table}" limit 5').fetchall()
    except sqlite3.Error as exc:
        print(f"\n## {table}: {exc}")
        continue
    cols = [r[1] for r in con.execute(f'pragma table_info("{table}")')]
    print(f"\n## {table}  columns={cols}")
    for row in rows:
        slim = {}
        for key in row.keys():
            value = row[key]
            if isinstance(value, str) and len(value) > 60:
                value = value[:60] + "…"
            slim[key] = value
        print("  " + json.dumps(slim, ensure_ascii=False, default=str))
PY
