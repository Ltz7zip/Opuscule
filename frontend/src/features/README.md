# Feature modules

新增页面/功能时，按这个顺序落位：

1. `src/features/<name>/index.tsx` — 页面/面板组件，默认导出或具名导出。
2. `src/features/<name>/api.ts` — 只放该功能的 API 适配；共享请求走 `src/api.ts`。
3. `src/app/routes.ts` — 加路径 union 与解析。
4. `src/app/RouteView.tsx` — 用 `React.lazy` 加加载边界。
5. 需要跨页面复用的纯函数放 `src/lib/`；不要 import 页面。

硬约束：

- 公开页不得 import `CardEditor`、`Tiptap`、ProseMirror；公开阅读用 `RichText`。
- `Workspace` 是唯一默认加载编辑器的页面；地图/AI/时间线各自 lazy chunk。
- 每个新页面必须有 loading / empty / error 三态，并在 390/1280 下检查溢出。
- 新 chunk 计入 ADR-0014 的公开首屏预算；超预算先拆，不要直接发布。
