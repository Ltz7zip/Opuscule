---
name: opuscule-dev
description: Use when working in the Opuscule Python workspace; covers the src layout, run/test commands, project conventions, and the .design right-sidebar preview workflow.
---

# Opuscule Dev

## When to use

Working in `/Users/ltz2024/Opuscule`, the small stdlib-first Python project.

## Project map

- `src/opuscule/cli.py` — CLI entry point (`print_hi`, `main`)
- `tests/test_cli.py` — stdlib `unittest` smoke tests
- `main.py` — thin entry point that adds `src/` to `sys.path`
- `.design/current/index.html` — live single-file HTML design draft
- `.design/history/` — snapshots before major edits (git-ignored)
- `.dsh/skills/opuscule-dev/` — this skill

## Commands

```sh
./.venv/bin/python main.py
make test
make compile
make serve-design   # http://127.0.0.1:8000
```

## Design preview loop

1. Write a single-file draft to `.design/current/index.html`; inline CSS/JS.
2. Open it from the DSH file tree; the right-sidebar document preview renders it.
3. With `@guowenzhang/dsh-web-design`, switch to **编辑**, change text/style/
   position or delete blocks, then **保存到文件**.
4. Snapshot before big edits into `.design/history/<timestamp>/`.
5. For runtime checks, run `make serve-design` and use Playwright MCP
   (`mcp__playwright__*`) on `http://127.0.0.1:8000`; check console, network,
   responsive widths, and interactions.
6. Use `modlens_read_image` for screenshot reading and the `superdesign` skill
   for design-direction exploration.
7. For reports or slide decks, use the `dsh-artifact` `artifact` tool; it opens
   in the right sidebar automatically and keeps version history.

## Conventions

- Python 3.12+ syntax; public functions get type hints and short docstrings.
- Runtime is stdlib-only; ask before adding dependencies.
- Tests use `unittest`, no network.
- Never edit `.venv/`, `.idea/`, or `.git/`.
- Run `make test` and `make compile` before claiming completion.

## Pitfalls

- The checked-in venv is Python 3.14; many third-party wheels may not support it.
  Prefer stdlib, or confirm 3.14 support before installing.
- Relative assets in a draft may not load in the sandboxed preview; inline them.
- Design drafts are not part of the Python package; don't import `opuscule` from
  the HTML.
