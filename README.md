# Opuscule

A small, stdlib-first Python project with a local design-preview loop.

## Quick start

```sh
./.venv/bin/python main.py
# Hi, Opuscule

make test
make compile
```

The checked-in `.venv` uses Python 3.14.6 for this scaffold. The backend venv
also uses 3.14.6 on this host (3.13 preferred when available; see
`docs/adr/ADR-0010-runtime-stack.md`). The package targets Python 3.12+ and
uses only the standard library at runtime.

## P0.1–P5.4 / P2.6 / P4.17 runnable slice

Two local services:

```sh
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000

cd frontend
npm install
npm run dev -- --port 5173
npm run check:budget   # build-gated JS/CSS budget
npm run dev:ssr       # Wiki SSR dev pilot on :5174
npm run build:all     # client + SSR production bundles
npm run preview:ssr   # production SSR preview on :5175
make ci               # backend + design + client/SSR + budget
# CI: .github/workflows/ci.yml (backend tests + build + budget)
```

Open `http://127.0.0.1:5173/` for the public page,
`http://127.0.0.1:5173/login` for the demo login,
`http://127.0.0.1:5173/register` for registration,
`http://127.0.0.1:5173/worlds/new` for creating a world,
`http://127.0.0.1:5173/explore` for public worlds,
`http://127.0.0.1:5173/w/wuhai/wiki` for the public Wiki,
`http://127.0.0.1:5173/trash` for the owner trash,
`http://127.0.0.1:5173/search?q=灯塔` for public search,
`http://127.0.0.1:8000/robots.txt` / `/sitemap.xml` for SEO surfaces,
`http://127.0.0.1:8000/share/w/wuhai/fog-harbor/` for the server-rendered share page,
`http://127.0.0.1:5174/w/wuhai/wiki/fog-harbor/` for the Wiki SSR dev pilot (`npm run dev:ssr`),
`http://127.0.0.1:5175/`, `/w/wuhai/wiki/fog-harbor/`, `/explore` or `/u/traveler` for the production SSR preview (`npm run build:all && npm run preview:ssr`),
`http://127.0.0.1:5173/w/wuhai/map` for the world map MVP,
`http://127.0.0.1:5173/w/wuhai/timeline` for the world timeline MVP,
`http://127.0.0.1:5173/w/wuhai` for the workspace, and
`http://127.0.0.1:5173/u/traveler` for the personal homepage. Local demo login:
`traveler` / `opuscule-demo` (seed-only; not for production). See
`docs/plans/20261020-p0-vertical-slice.md` and
`docs/plans/20261020-p0.2-auth-permissions.md`,
`docs/plans/20261020-p0.3-personal-profile.md` and
`docs/plans/20261020-p0.4-modules-wiki-explore-register.md` and
`docs/plans/20261020-p0.5-world-onboarding.md` and
`docs/plans/20261020-p0.6-world-settings-switcher.md` and
`docs/plans/20261020-p0.7-members.md` and
`docs/plans/20261020-p0.8-invites.md` and
`docs/plans/20261020-p0.9-ownership-trash.md` and
`docs/plans/20261020-p0.10-audit.md` and
`docs/plans/20261020-p1.1-search-cache-budget.md` and
`docs/plans/20261020-p1.2-seo-ci.md` and
`docs/plans/20261020-p1.3-share-ssr.md` and
`docs/plans/20261020-p1.4-ssr-pilot.md` and
`docs/plans/20261020-p1.5-ssr-production.md` and
`docs/plans/20261020-p2.1-world-map.md` and
`docs/plans/20261020-p2.2-map-edit-drag.md` and
`docs/plans/20261020-p1.6-explore-ssr.md` and
`docs/plans/20261020-p1.7-profile-ssr.md` and
`docs/plans/20261020-p1.8-home-ssr.md` and
`docs/plans/20261020-p3.1-ci-deploy.md` and
`docs/plans/20261020-p3.2-world-export.md` and
`docs/plans/20261020-p3.3-world-import.md` and
`docs/plans/20261020-p3.4-import-e2e-audit.md` and
`docs/plans/20261020-p3.5-audit-filter.md` and
`docs/plans/20261020-p3.6-audit-csv.md` and
`docs/plans/20261020-p3.7-csv-injection.md` and
`docs/plans/20261020-p3.8-import-history.md` and
`docs/plans/20261020-p3.9-health.md` and
`docs/plans/20261020-p4.1-timeline.md` and
`docs/plans/20261020-p4.2-timeline-edit.md` and
`docs/plans/20261020-p2.3-map-zoom.md` and
`docs/plans/20261020-p2.4-map-pan.md` and
`docs/plans/20261020-p4.3-timeline-filter.md` and
`docs/plans/20261020-p4.4-rss-feed.md` and
`docs/plans/20261020-p4.5-search-worlds.md` and
`docs/plans/20261020-p4.6-auth-throttle.md` and
`docs/plans/20261020-p4.7-account-lockout.md` and
`docs/plans/20261020-p4.8-proxy-throttle.md` and
`docs/plans/20261020-p4.9-search-users.md` and
`docs/plans/20261020-p4.10-search-ranking.md` and
`docs/plans/20261020-p5.1-prod-settings.md` and
`docs/plans/20261020-p5.2-change-password.md` and
`docs/plans/20261020-timeline-editor-parity.md` for scope and known gaps.

## Layout

```
src/opuscule/        original stdlib package / scaffold
tests/               stdlib unittest tests for the scaffold
backend/             Django 6.1 + DRF P0.1–P0.4
frontend/            React 19 + Vite + Tiptap workspace (P0.1–P0.4)
docs/adr/            architecture decisions
docs/spikes/         read-only legacy data audit
docs/plans/          implementation plans
scripts/             analysis helpers
.design/current/     standalone HTML design drafts
.design/history/     snapshots taken before major edits
.dsh/skills/         project-level DSH skills
```

## Design preview

1. Put a single-file HTML draft at `.design/current/index.html`.
2. Open it from the DSH file tree; it renders in the right-sidebar document
   preview.
3. With `@guowenzhang/dsh-web-design` installed, switch the preview to
   **编辑** to change text, styles, position, or delete blocks, then save back
   to the HTML file.
4. Serve the draft when a real origin is needed:

   ```sh
   make serve-design
   # http://127.0.0.1:8000
   ```

5. Use the Playwright MCP (`mcp__playwright__*`) to check runtime behavior,
   console errors, and responsive layouts.

## Architecture decisions

- `docs/adr/INDEX.md` — accepted ADRs for tool hosts, Collection/IA, Era/Hist,
  runtime, and licensing.
- `docs/spikes/20261020-pre-p0-data-dry-run.md` — read-only legacy data audit.
- `scripts/legacy_audit.py` — reproducible audit script (read-only SQLite).
- `docs/plans/20261020-p0-vertical-slice.md` — P0.1 scope and gaps.
- `docs/verification/20261020-p0.1.md` … `p0.9.md` … `p2.2.md` / `p1.6.md` … `p1.8.md` / `p3.1.md` … `p3.9.md` / `p4.1.md` … `p4.13.md` / `p2.3.md` … `p2.6.md` / `p5.1.md` / `p5.2.md` / `timeline-editor-parity.md` — fresh test/build/browser evidence.

## Notes

- Design drafts are standalone HTML; they do not import the Python package.
- Keep `.design/history/` out of version control; `current/` is the live draft.
- The project skill `opuscule-dev` documents the same workflow for the agent.
- If the right-sidebar **编辑** toggle does not appear, restart the DSH desktop
  app once; client plugins load at startup.
