# Old-site editor tool inventory

- Source: `/Users/ltz2024/PycharmProjects/worldbuilding_timeline/frontend/editor/src/main.jsx`
- Source: `/Users/ltz2024/PycharmProjects/worldbuilding_timeline/static/workspace.js`
- Scope: distinguish what exists today from what is still a real gap. No old code is copied.

## Blocks

| Old block/tool | Current | Status |
|---|---|---|
| paragraph / H1–H3 | Tiptap StarterKit | done |
| quote | StarterKit blockquote | done |
| bullet / numbered list | StarterKit | done |
| check list | official TaskList/TaskItem | done |
| code block / divider | StarterKit + divider slash | done |
| toggle list | custom `toggleBlock` (details) | done |
| callout | custom `callout` | done |
| image | upload / URL / media library | done |
| bookmark | custom `bookmarkBlock` | done |
| card embed | custom `cardEmbed` | done |
| collection / inline database | none | **gap** |
| table | official TableKit | done (no column resize) |
| gallery/carousel | custom `galleryBlock` + NodeView | done |

## Inline / selection

| Tool | Current | Status |
|---|---|---|
| bold / italic / strike / code | bubble | done |
| underline / link | bubble | done |
| H1/H2, lists, quote | bubble | done |
| text color / background color | none | **gap** |
| alignment | none | **gap** |
| block indent/outdent | nested wrapper buttons | partial (not arbitrary drop) |
| @mention | official Mention + auto slug/title | done |
| comments | card comments + anchor mark + notification | done (card-level) |

## Page/workspace tools

| Old tool | Current | Status |
|---|---|---|
| page icon / cover | card icon/cover fields + header controls | done |
| page comments | card comment drawer | done (different placement) |
| properties panel | sidebar/settings only | **gap** |
| table card toolbar | table editor bar | done |
| heavy block bridge | native Tiptap nodes | done differently |
| slash heavy dialogs | upload/media prompts | done differently |

## Decision

Implement next, in order:
1. check-list block
2. text color/background + alignment (requires schema marks; budget impact)
3. page icon/cover/properties panel (workspace shell)
4. collection/inline database (requires collection view model; not a single editor node)

Do not copy old BlockNote implementation; use official Tiptap extensions where they exist.
