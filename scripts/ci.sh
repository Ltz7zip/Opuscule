#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$ROOT/backend/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="python3"
fi

echo "== backend =="
cd "$ROOT/backend"
"$PYTHON" manage.py check
"$PYTHON" manage.py makemigrations --check --dry-run
"$PYTHON" manage.py test

echo "== design =="
cd "$ROOT"
"$PYTHON" scripts/check_design.py

echo "== ui contract =="
"$PYTHON" scripts/check_ui.py

echo "== frontend =="
cd "$ROOT/frontend"
npm run build:all
npm run check:budget

echo "CI gate passed"
