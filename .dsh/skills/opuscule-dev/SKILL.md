---
name: opuscule-dev
description: Use when working in the Opuscule workspace (a Django/React worldbuilding app); covers layout, run/test commands, conventions, deploy/content sync entry points, and the .design preview workflow.
---

# Opuscule Dev

## When to use

Working in `/Users/ltz2024/Opuscule`: a Django 6.1 + React 19 worldbuilding app
plus a small CLI scaffold in `src/opuscule`.

## Project map

- `backend/` — Django + DRF API（`apps/worlds`、`cards`、`collections`、`timelines`、`maps`、`identity`、`common`）
- `frontend/` — React 19 + Vite + TypeScript + Tiptap；公开站与工作区
- `src/opuscule/` + `main.py` — 与后端无关的 CLI 脚手架
- `tests/` — 脚手架的 `unittest`
- `.design/current/` — 单文件设计稿；`.design/history/` 快照（git-ignored）
- `deploy/` — 单机部署脚本与 nginx/systemd 示例
- `AGENTS.md` — 项目约定（先读）；`docs/adr/INDEX.md` — 决策记录

## Commands

```sh
# 后端
cd backend && .venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver 127.0.0.1:8000
.venv/bin/python manage.py test

# 前端
cd frontend && npm ci
npm run dev -- --port 5173
npm run dev:ssr                            # :5174
npm run build:all && npm run preview:ssr   # :5175

# 仓库根
make ci        # 后端测试 + 生产 settings + import 契约 + 设计稿 + UI 契约 + 构建 + 预算
make serve-design   # .design/current，:8000（与 Django 冲突）
```

## Conventions

- `AGENTS.md` 是约定的唯一来源：分层、权限、评论、媒体、ZIP、部署与内容同步都以它为准。
- 后端测试是 Django `manage.py test`；前端静态契约由 `make ci` 里的 `check_ui.py` 与预算检查覆盖。
- 新依赖：说明理由，并同步 `backend/requirements.txt` 或 `frontend/package-lock.json`。
- 世界内容在数据库里，不在 git 里；改完内容用 `world_snapshot` 同步（见 `AGENTS.md` 第 8 节）。
- 不使用原生 `confirm` / `prompt`；走 `lib/dialogs.ts`。
- 永不编辑 `.venv/`、`.idea/`、`.git/`。

## Design preview loop

1. Write a single-file draft to `.design/current/index.html`; inline CSS/JS.
2. Open it from the DSH file tree; the right-sidebar document preview renders it.
3. With `@guowenzhang/dsh-web-design`, switch to **编辑**, change text/style/
   position or delete blocks, then **保存到文件**.
4. Snapshot before big edits into `.design/history/<timestamp>/`.
5. For runtime checks, run `make serve-design` and use Playwright MCP on
   `http://127.0.0.1:8000`; check console, network and responsive widths.
6. Use `modlens_read_image` for screenshots; `superdesign` for design exploration.
7. For reports or slide decks, use the `artifact` tool.

## Pitfalls

- `make serve-design` and Django both want 8000; stop Django or change the port.
- Restart 5174/5175 after `server*.mjs` changes or a rebuild (manifest is read at startup).
- Django with `--noreload` needs a restart for backend edits.
- Production has no SSR: nginx serves `frontend/dist` and every page is client-rendered.
- Relative assets in a draft may not load in the sandboxed preview; inline them.
