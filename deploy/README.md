# Opuscule deployment sketch

This is a **topology sketch**, not a tested deployment. No Docker/Nginx/systemd
runtime is available in the local verification environment.

## Processes

| Process | Port | Responsibility |
|---|---:|---|
| Django API | 8000 | `/api/`, `/admin/`, `/static/`, `/share/`, `/robots.txt`, `/sitemap.xml` |
| SSR web | 5175 | `dist/`, `dist-ssr/`, Home/Wiki/Explore/Profile SSR, SPA fallback |

`server.prod.mjs` includes a local reverse proxy for `/api` and Django-owned
paths. In a hardened deployment, route those paths directly from Nginx to the
API process and only send application/static paths to the SSR process.

## Files

- `nginx.conf.example` — TLS/domain placeholders, asset caching, API split.
- `systemd/opuscule-web.service.example` — Node SSR unit.
- `systemd/opuscule-api.service.example` — WSGI unit (install a production WSGI
  server such as gunicorn/uwsgi separately; it is not in requirements yet).
- `.env.example` — environment variable names only, no secrets.

## Not done

- TLS certificate issuance, DNS, firewall, secrets manager.
- Postgres migration/backups.
- Process supervision, health checks, rolling restart, log aggregation.
- SSR cache/CDN, rate limits, observability, load testing.
