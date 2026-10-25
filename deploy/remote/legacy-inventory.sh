#!/usr/bin/env bash
# Read-only inventory of the previous deployment's SQLite database.
# Writes a small JSON report and prints a compact summary — nothing is modified.
set -euo pipefail
OUT="/root/opuscule-legacy-inventory.json"
OLD_DIR=$(ls -dt /srv/opuscule-old-* 2>/dev/null | head -1 || true)
[[ -n "$OLD_DIR" ]] || { echo "no /srv/opuscule-old-* directory"; exit 1; }

DB=""
for candidate in "$OLD_DIR/backend/db.sqlite3" "$OLD_DIR/db.sqlite3"; do
  [[ -f "$candidate" ]] && DB="$candidate" && break
done
[[ -n "$DB" ]] || { echo "no sqlite file in $OLD_DIR"; exit 1; }
echo "database: $DB"

python3 - "$DB" "$OUT" <<'PY'
import json, sqlite3, sys

db_path, out_path = sys.argv[1], sys.argv[2]
con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
con.row_factory = sqlite3.Row

tables = [r[0] for r in con.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"
)]

report = {"database": db_path, "tables": {}, "samples": {}}
interesting = []

for name in tables:
    try:
        count = con.execute(f'select count(*) from "{name}"').fetchone()[0]
    except sqlite3.Error:
        count = -1
    cols = [r[1] for r in con.execute(f'pragma table_info("{name}")')]
    report["tables"][name] = {"rows": count, "columns": cols}
    if count > 0:
        interesting.append((name, count))
        try:
            rows = con.execute(f'select * from "{name}" limit 2').fetchall()
            report["samples"][name] = [dict(r) for r in rows]
        except sqlite3.Error:
            pass

# migrations that the old database recorded
try:
    report["migrations"] = [
        f"{r['app']}.{r['name']}" for r in con.execute(
            "select app, name from django_migrations order by id"
        )
    ]
except sqlite3.Error:
    report["migrations"] = []

with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(report, fh, ensure_ascii=False, indent=1, default=str)

print(f"\n{len(tables)} tables, report -> {out_path}\n")
for name, count in interesting:
    print(f"  {name:34s} {count:6d}")
print("\nempty/other tables:", ", ".join(n for n in tables if n not in dict(interesting)))
PY

echo
echo "贴回来的只需要上面这份「表名 + 行数」清单；详细结构在 $OUT。"
