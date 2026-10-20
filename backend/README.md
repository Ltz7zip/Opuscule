# Opuscule backend (P0.1–P1.3)

Local vertical slice: World / Collection / Card + DRF JSON API.

```sh
# Python 3.14 on this host (3.13 is preferred when available)
python3.14 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Endpoints:

- `GET /api/health/`
- `GET /api/auth/csrf/` / `GET /api/auth/session/`
- `POST /api/auth/login/` / `POST /api/auth/logout/` / `POST /api/auth/register/`
- `GET /api/u/<username>/` — public personal homepage
- `GET/PATCH /api/profile/` — own profile (session auth)
- `GET /api/explore/` — public world directory
- `GET/POST /api/worlds/` — list / create world
- `PATCH /api/worlds/<slug>/` — owner settings/publish
- `GET/PATCH/DELETE /api/worlds/wuhai/`
- `GET /api/worlds/wuhai/map/` / `POST /api/worlds/wuhai/map/markers/`
- `GET /api/worlds/wuhai/export/` (owner ZIP export)
- `POST /api/worlds/import/` (multipart ZIP import)
- `POST /api/worlds/wuhai/transfer-ownership/`
- `GET /api/worlds/trash/` / `POST /api/worlds/wuhai/restore/`
- `GET /api/worlds/wuhai/audit/`
- `GET /api/search/?q=灯塔`
- `GET /robots.txt` / `GET /sitemap.xml`
- `GET /share/w/wuhai/` / `GET /share/w/wuhai/fog-harbor/` / `GET /share/u/traveler/`
- `GET/POST /api/worlds/wuhai/members/`
- `GET/POST /api/worlds/wuhai/invites/`
- `DELETE /api/worlds/wuhai/invites/<id>/`
- `GET /api/invites/<token>/` / `POST /api/invites/<token>/accept/`
- `PATCH/DELETE /api/worlds/wuhai/members/<id>/`
- `GET/POST /api/worlds/wuhai/collections/`
- `GET /api/worlds/wuhai/cards/by-slug/<card_slug>/`
- `GET/POST /api/worlds/wuhai/cards/`
- `GET/PATCH /api/worlds/wuhai/cards/<id>/`

> P0.1–P0.5 uses Django session auth + CSRF and `WorldMembership` (owner/editor/
> viewer); P0.4 adds public Wiki, explore and registration; P0.5 adds world
> creation and owner publish; P0.6 enforces the 7-world owner quota and supports owner settings; P0.7 adds owner-only member management; P0.8 adds one-time invite tokens; P0.9 adds soft delete/trash/restore and owner transfer; P0.10 adds WorldAuditEvent/audit API; P1.1 adds public search and public cache headers; P1.2 adds robots/sitemap and CI workflow; P1.3 adds Django-rendered share pages. `seed_demo` creates `traveler` / `opuscule-demo` on this host; the
> password is demo-only and can be overridden with `--password` or
> `OPUSCULE_DEMO_PASSWORD`. SQLite is local-only; production uses Postgres
> (ADR-0010).
