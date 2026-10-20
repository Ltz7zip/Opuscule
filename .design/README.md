# Design drafts

- `current/index.html` — the live draft. Open it from the DSH file tree; the
  right-sidebar document preview renders it directly.
- `history/<timestamp>/` — snapshots taken before major changes. Ignored by git.

Rules:

- Keep drafts standalone: inline CSS and JS, no relative assets.
- With `@guowenzhang/dsh-web-design` installed, switch the preview to **编辑**
  to change text, styles, position, or delete blocks; **保存到文件** writes the
  HTML back.
- For a real origin, run `make serve-design` and open
  `http://127.0.0.1:8000` (or use Playwright MCP).
- Snapshot before big edits:

  ```sh
  ts=$(date +%Y%m%d-%H%M%S)
  mkdir -p ".design/history/$ts"
  cp .design/current/index.html ".design/history/$ts/"
  ```
