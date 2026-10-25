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

echo "== backend production settings =="
# Load the settings the way a deployment does: DEBUG off, real key, TLS on.
# This fails fast on a missing SECRET_KEY and on development-only backends.
DJANGO_DEBUG=False \
DJANGO_SECRET_KEY="$("$PYTHON" -c 'import secrets; print(secrets.token_urlsafe(48))')" \
DJANGO_ALLOWED_HOSTS=example.com \
DJANGO_SECURE_SSL_REDIRECT=True \
DJANGO_SESSION_COOKIE_SECURE=True \
DJANGO_CSRF_COOKIE_SECURE=True \
DJANGO_SECURE_HSTS_SECONDS=31536000 \
DJANGO_TRUST_PROXY_SSL=True \
"$PYTHON" manage.py check --deploy

echo "== import contracts =="
cd "$ROOT/backend"
"$PYTHON" -m importlinter.cli lint-imports

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
