# ADR-0024：世界概念作为独立世界级文档与共享媒体库

- Status: Accepted（M1+M2+M3 media/version）
- Date: 2026-10-27
- Related: ADR-0014（页面模块与性能预算）、ADR-0022（SSR 公共路由）、P6.1

## 背景

Matrees 的世界页更像一篇可以自上而下连续阅读的文章，而 Opuscule 此前只有
`World → Collection → Card` 的卡片树。把“世界概念”做成一张 `Card` 会立即污染
卡片计数、搜索、ZIP、slug、自动链接和导出；它需要自己的公开读页、草稿/发布
语义和编辑入口。

另一个约束是媒体：现有 `CardImage` 必挂 `card`，卡片编辑器只能看到本卡图片。
用户明确要求概念与卡片共享**世界媒体库**，而不是概念自己的图片库。

## 决策

1. 新建 `WorldConcept`，与 `World` 一对一；字段为 `draft_json/draft_text`、
   `body_json/body_text`、`published_at`、`revision`、`created_by/updated_by`。
   不建 title/subtitle/cover/is_public/slug；标题/描述来自 `World`，封面是 3:4
   `ContourPlate`。概念不是 `Card`，不进入卡片计数/搜索/导出/自动链接。
2. 草稿自动保存（PATCH `/concept/`），显式发布（POST `/concept/publish/`）把草稿
   复制到公开快照并递增 revision；公开 GET 只返回 `published_at` 后的 `body_*`，
   不泄露草稿。发布写 `concept.published` 审计。
3. 路由：`/w/<slug>/wiki` 读页/回退；`/w/<slug>/wiki/cards` 设定索引；
   `/w/<slug>/wiki/<cardSlug>` 单卡；`/w/<slug>/wiki/edit` 概念编辑器（Workspace
   概念模式）。`cards`/`edit` 作为保留 slug，卡片生成/校验避让。
4. 公开读页/索引/单卡 SSR；`/wiki/edit` 保持 CSR/登录态；公开 HTML 不含草稿。
5. 新建世界级 `WorldMedia`（world/file/name/uploaded_by/created_at）作为唯一活跃
   共享媒体 owner；`GET/POST /api/worlds/<slug>/media/`，owner/editor，4 MB，
   PNG/JPEG/WebP。卡片与概念共用 `MediaLibraryDialog`；URL 入口保留。
   旧 `CardImage` 数据复制到 `WorldMedia`，旧表/API 保留兼容并双写/双删；首片
   不删除旧表、不做媒体删除或清理。
6. 读页为 3:4 封面 + 世界导航（世界/设定/时间线/地图/工作区）+ 目录 + 正文 +
   本页引用 rail/footer。
7. M2：正文提及/本页引用 chip 打开 `CardPeek`（焦点陷阱/Esc/空白关闭/移动端底部 sheet）；
   侧窥「出现在」回链到开篇/小节；卡片页显示世界概念反链；`/wiki/cards` 分类筛选、
   每词条的引用次数/未引用标记；引用计数由已发布概念 body 的 mention 统计；SSR 把概念
   传给设定集/卡片页。
8. M3：共享媒体列表返回 `usage`/`references`；owner/editor 删除前扫描卡片正文/封面/图标、
   世界概念草稿/发布 body 和旧 `CardImage` 别名；有引用时 409，无引用才删文件/行并写
   `media.deleted` 审计。旧 `CardImage` 仍保留只读审计命令；旧表/旧行清理不自动执行，
   需要用户明确确认（`confirmation-first`）。
9. M3 版本历史：`WorldConceptRevision` 保存每次发布的不可变 body/text/revision/作者；
   发布在同一事务内写快照；owner/editor 可列出/查看修订并恢复为草稿（不改变公开页）；
   已有已发布概念由数据迁移回填当前快照；编辑器提供历史面板。ZIP/搜索/私有成员读页等
   仍后置。

## 后果

- 世界概念有独立 owner/API/读页/编辑器；卡片模型保持干净。
- 共享媒体使卡片上传的图片立即出现在概念媒体库，反之亦然。
- 旧 `CardImage` 表已确认删除：行先复制进 `WorldMedia`，只读审计为 0 后 `cards.0010`
  删表，旧卡图 API/前端调用/兼容分支随之下线；`world-media/` 共享媒体不受影响。
- `/wiki/edit` 只对 owner/editor 可用；公开读页不加载 Tiptap。M2 从正文/引用 chip/索引卡
  打开侧窥，卡片页可从反链回到概念的开篇或小节。
- 私有 `is_public_read=false` 世界的成员读页：SSR 无法鉴权，因此服务端只返回 SPA shell，
  由客户端 `App` 携带 session 渲染；公开世界仍走 SSR。
- 草稿并发：`PATCH` 接受 `expected_updated_at`；过期保存返回 409 并停止自动保存，
  不静默覆盖他人修改。
- 概念成员评论（`WorldConceptComment`）读写都要求世界写权限，与卡片评论一致；
  viewer/匿名不可见，避免公开读者看到工作笔记。
- 发布时写不可变 `WorldConceptRevision`；公开页只读当前 `body_json`，历史仅 owner/editor。
- 公开发现：`/api/search/` 增加 `concepts` 分组（只含已发布且公开的世界），站点/世界
  RSS 混排已发布概念条目。
- ZIP 往返：`world.json.concept` 携带草稿/发布正文与全部历史快照，`concept.md` 供人读；
  导入时正文由文档重新推导，历史快照逐条还原。
- SSR 增加世界概念/设定集两条路径；`/wiki/edit` 是 SPA 例外。

## 验证

- 后端 152 tests 通过，包括概念公开/草稿隔离/发布/权限/审计/保留 slug/
  共享媒体/旧卡图双写；`makemigrations --check` 干净。
- `make ci` 通过；`npm run build:all`；budget entry 78.5 kB、workspace 88.1 kB、
  css 37.1 kB。
- SSR `:5174` 与生产 preview `:5175` 均返回世界概念读页/设定集；`/wiki/edit`
  返回 SPA shell。
- M2 浏览器验证：正文提及/引用 chip 侧窥、Escape/焦点恢复、侧窥「出现在」小节回链、
  卡片页反链、设定集分类筛选/引用计数/未引用标记、移动端底部 sheet；SSR 5174/5175 的
  设定集计数和卡片反链。
- M3 验证：162 tests；媒体引用（正文/封面/图标/概念草稿/发布）全部 409；
  无引用删除 204 + 文件移除 + `media.deleted` 审计；
  只读审计命令不改变行/文件；Playwright 媒体库删除确认与“1 处引用”禁用。
- M4 验证：169 tests；旧 `CardImage` 删表后旧路由 404、前端不再引用；
  私有世界 `/wiki` 返回 SPA shell 并以 session 渲染；草稿 409 冲突横幅停止自动保存；
  公开搜索出现“世界概念”分组并链到 `/w/<slug>/wiki`；站点/世界 RSS 混排概念条目；
  ZIP 往返还原概念与两版历史；概念评论成员可读/写、viewer 403、跨概念回复 400；
  时间线块在概念读页按年份渲染条目。`make ci` 通过
  （entry 78.7 kB，workspace 90.2 kB，css 39.3 kB）。

## 替代方案

- 概念做成 `Card`：会污染卡片计数/搜索/导出/slug/自动链接，否决。
- 概念自己的 `WorldConceptImage`：用户明确要求共享世界媒体库，否决。
- 把 `CardImage` 直接改成通用媒体：必挂 `card` 的历史数据/API 兼容成本更高，
  采用新建 `WorldMedia` + 复制 + 兼容 API。

## 开放问题

- 公开 media URL 仍无访问控制；删除评论不清理正文里的 `commentAnchor` mark。
- 概念评论暂无通知（`Notification` 只挂卡片评论）；时间线块按需拉取，不进入发布快照。
- 时间线块只渲染前 12 条，未做分页/展开；概念正文里的区块仍无拖入容器。
- 私有世界成员读页依赖客户端渲染，首屏无 SSR 内容；owner 读页内预览入口未做。
