# Opuscule frontend (P0.1–P2.2 / P1.8)

React 19 + Vite + TypeScript + Tiptap 3. Design tokens follow the supplied
Minimalist reference (dark neutral, 12px radius, 1px borders, 1200px canvas).

```sh
npm install
npm run dev -- --port 5173
```

Open:

- `http://127.0.0.1:5173/` — public world page
- `http://127.0.0.1:5173/w/wuhai` — workspace (anonymous is read-only)
- `http://127.0.0.1:5173/login` — login (`traveler` / `opuscule-demo` locally)
- `http://127.0.0.1:5173/explore` — public world directory
- `http://127.0.0.1:5173/register` — registration
- `http://127.0.0.1:5173/worlds/new` — create a world
- `http://127.0.0.1:5173/w/wuhai/wiki` — public Wiki
- `http://127.0.0.1:5173/w/wuhai/wiki/livia` — public Wiki card
- `http://127.0.0.1:5173/invite/<token>` — one-time world invite
- `http://127.0.0.1:5173/trash` — owner trash / restore
- `http://127.0.0.1:5173/search?q=灯塔` — public Wiki search
- `http://127.0.0.1:5173/u/traveler` — public personal homepage
- `http://127.0.0.1:5173/w/wuhai?card=2` — a specific card

The dev server proxies `/api` to `http://127.0.0.1:8000`; start the backend
first. `npm run build` runs TypeScript and the production build.

P0.2 adds session auth, CSRF and read-only workspace mode. P0.3 adds `/u/<username>` with profile editing. P0.4 adds route-level lazy pages, public Wiki, explore and registration. P0.5 adds `/worlds/new` and the register → create-world → workspace flow. P0.6 adds owner world settings, a world switcher, and a 7-world quota. P0.7 adds owner member management (existing accounts only). P0.8 adds one-time invite links with login/register return. P0.9 adds ownership transfer and soft delete/restore. P0.10 adds the owner audit log dialog. P1.1 adds public search and `check:budget`. P1.2 adds dynamic SEO meta/canonical/noindex. P1.3 adds a Wiki share button for Django-rendered `/share/...` pages. P1.4 adds a Wiki-only SSR/hydration dev pilot on :5174. P1.5 adds client/SSR production builds and `preview:ssr` on :5175. P2.1 adds the `/w/<world>/map` lazy world-map MVP. P2.2 adds marker edit and pointer-drag persistence. P1.6–P1.8 extend SSR to `/explore`, `/u/<username>`, and `/`. The public site is still SPA-only; SSR is pending. Public pages never load Tiptap; `Workspace` is the only editor chunk.

Budget gate: `npm run build && npm run check:budget` (entry ≤120 kB, Workspace ≤160 kB, CSS ≤40 kB gzip).

SEO: public Wiki/profile emit canonical/OG; workspace/trash/invite/login/search are noindex. Sitemap/robots are served by Django (`/robots.txt`, `/sitemap.xml`), not the SPA.

SSR dev pilot: `npm run dev:ssr`; only `/w/<world>/wiki[/:card]` is server-rendered and hydrated, other routes use SPA fallback. Production SSR is not wired.

Production SSR: `npm run build:all && npm run preview:ssr` (5175). It serves `dist/`, SSR bundle from `dist-ssr/`, and proxies `/api`, `/robots.txt`, `/sitemap.xml`, `/share/`, `/admin/` to Django. Single-process preview only.

World map: `/w/<world>/map` (lazy, no Tiptap); public read-only, owner/editor can add/drag/delete markers.

SSR routes: Home + Wiki + Explore + Profile; Workspace/auth remain CSR. Production preview: `npm run build:all && npm run preview:ssr` (5175).
