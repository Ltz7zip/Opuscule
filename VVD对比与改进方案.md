# 与 VVD World 的深度对比 · 差距清单与改进方案

> 对比时间：2026-10-06
> 对比素材：本机抓取的 VVD 前端产物（`.vvd_research/`，173MB：i18n 字符串 17064 条、
> `changelog.json` 50 条周更、`DEFAULT_SHORTCUTS` 注册表、竞品对比页）
> ＋ 本项目代码审计（`world/`、`static/workspace.js`、`static/script.js`、测试与探针）
> 口径：只写有证据的东西；"没找到证据"就写没找到，不替 VVD 编功能。

---

## 一、结论先说

| 维度 | 我们的水平 | 说明 |
| --- | --- | --- |
| **功能广度** | ★★☆☆☆ | VVD 是 20+ 种文档类型的创作平台（含 Canvas、Board、Quill、Workshop 生态），我们**真正做完**的是：卡片、时间线、地图、关系树、图谱、发布站点。其余是占位或没有 |
| **单点深度（时间线）** | ★★★★☆ | 像素级复刻的经典编辑器 + 工作区外壳，是复刻度最高的部分；差在"日历视图并列"与"月亮/时期"细节 |
| **编辑器手感** | ★★★☆☆ | 本轮补齐撤销/重做、块拖拽、块菜单、块评论、富文本、`/` 菜单后可用；仍缺嵌套块、表格块、toggle、嵌入 |
| **数据进出** | ★★★☆☆ | 本轮补齐 Markdown/zip/JSON 导入导出；仍缺 Notion/Word/PDF 导入与 PDF/图片导出 |
| **美术与 UX** | ★★★☆☆ | 极简语言、圆角、颜色语义、图标系统已统一；但**动效、空状态插画、无障碍、移动端**与 VVD 差距最大 |
| **协作 / 云端** | ☆☆☆☆☆ | 完全没有（单机、无账号、无实时同步、无离线队列） |

**一句话**：世界观建模的骨架已经立住（类型/属性/纪元/日历/关系/地图/时间线/发布），
差距集中在「**编辑器深度**、**导入导出与互操作**、**发布与运营层**、**协作与美术完成度**」四块。

---

## 二、完全没有做到的（按用户可感知程度排序）

| # | 能力 | VVD 的证据（i18n key / 文案） | 我们的现状 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | **协作与多人**：`presence.whoIsHere`（People here）、邀请、`link-view`/`link-edit` 权限、同时编辑 | comments/presence 命名空间；compare 页称"like Google Docs" | 无账号、无推送、无权限 | P2（要后端） |
| 2 | **离线优先**：`You're offline` + "改动存本机，联网自动同步" | connection.txt | 无 | P2 |
| 3 | **Eras 作为"世界版本"**：卡可选 `Universal` / `Only in {era}` / `Hidden in this era`，每纪元独立主题，可"只带部分卡过去" | eras.txt | 只有纪元色带（时间轴上的区间），没有"世界分支"语义 | P2 |
| 4 | **月亮与完整自定义历法**：`moons`、`moonCycleAria`、月相展示 `Every night / Quarters / Full only` | timeline.settings.moons | 有日历/月/卫星的**数据**，无月相计算与展示 | P1 |
| 5 | **Map Maker（图片→3D 地图）**：763 条字符串、真实 km 尺度、biome 笔刷、地形抬升、trade/travel 路线 | atlasTool | 无 | P3 |
| 6 | **手绘图纸风地图（cartographer）**：笔型 Wall/Road/River/Forest…、stamps、Parchment/Ink/Night | cartographerTool | 无 | P3 |
| 7 | **Workshop（用户造工具）**：`.vvd` 包、版本发布、SDK、API keys | workshop 命名空间 | 无插件机制 | P3 |
| 8 | **Quill 出版链**：章节 + drafts（`Publish from this draft`）、每行音频、DOCX/EPUB/PDF、3D 书封 | quill.txt（679 条） | 无 | P3 |
| 9 | **Table 双向绑定**：行=真卡、列=共享属性，改单元格即改卡；CSV 进出 | table 文案 | 表格文档是占位页 | P1 |
| 10 | **Canvas / Board**：tldraw 内核的画布、看板列 | canvas/board 文案 | 占位页（本轮改成"说明 + 可当卡片写 + 可删"） | P2 |
| 11 | **其它文档类型**：Soundscape、Animator、Radar Chart、Dictionary、Voice Memo、Codex/Homebrewery、Dice | editor.contextMenu.toolNames（20 种） | 无 | P3 |
| 12 | **发布运营层**：自定义域名 CNAME 流程、`Paid / entitled` 受众、多 wiki slots、站点分析（countries/devices/section reach）、读者 inbox、SEO、站点版本回滚 | wikiPublish/wikiAnalytics | 有公开/未列出/密码 + 基础主题 + 单站点 | P1（站点版本）／P3（域名/分析/变现） |
| 13 | **文档版本历史**：`Version history` + `Restore` | documents.history | 本轮有**会话内撤销栈**（可撤销到任意步），但没有跨会话的历史版本快照 | **P0** |
| 14 | **块级嵌入与嵌套**：图片/carousel、slides、Contents、Embed 链接卡（GitHub stars）、`Nest anything inside anything` | embedTool、changelog | 区块是平铺的，无嵌套、无嵌入卡 | P1 |
| 15 | **typo-tolerant 提及 + 复数/所有格自动链接** | changelog | 精确匹配 + 别名 | P2 |
| 16 | **快捷键自定义 + 无障碍拖拽播报 + 移动端 App** | DEFAULT_SHORTCUTS 28 条、dnd.txt 播报、iPad/Android 平板 | 本轮有快捷键表（固定），无自定义；无播报；无移动端布局 | P2/P3 |
| 17 | **AI**：`Entity Detection`、`entitySuggestions`（"Mentioned but not in your world yet"）、配额 | worlds.settings.ai | 本轮做了**本地规则版**的实体建议（不上传数据）；无模型、无配额 | P2 |

---

## 三、做了、但体验明显不如 VVD 的

| # | 能力 | 我们现在的样子 | VVD 的样子 | 差在哪 |
| --- | --- | --- | --- | --- |
| 1 | **搜索** | `⌘K` 搜文档名 + 类型筛选 | `⌘K` 面板 + "Search inside every card" + 忽略重音 + 筛选排序 | 我们**不搜正文**（后端有 body 字段但没接进搜索），没有高亮与排序权重 |
| 2 | **评论** | 本轮做了块级评论（发送/解决/删除/计数） | 可锚定文档任意位置、`Lost its place` + `Reattach`、屏外方向指示、@提及、快捷键 `C/⇧C/N/P` | 我们只能评"整块"，不能评"某句话"；没有失锚重锚 |
| 3 | **撤销** | 撤销栈覆盖**卡片内容**（区块/属性/别名/评论），有历史面板 | 统一动作日志：归档、重命名、关标签都能撤销，可 `View` | 我们的文档级操作（改名/移动/删除/关标签）不进撤销栈 |
| 4 | **导入** | Markdown 单/多文件、zip（Obsidian 目录）、`world.json` 还原 | Obsidian/Notion/Google Docs/Word/World Anvil/Scrivener，MD/TXT/CSV/JSON/DOCX/PDF/ePub | 我们只吃纯文本类 |
| 5 | **导出** | 世界 zip（各文档 MD + JSON 备份）、单文档 MD/JSON | 世界 zip（含媒体）、单卡 PDF/MD/图片、Quill DOCX/EPUB | 没有 PDF/图片；zip 里媒体只是清单不是文件 |
| 6 | **卡片类型** | 子类型、7 种值类型、必填/默认值/公式/选项 | 属性继承标注、共享属性、`Shown on existing cards` vs `New cards only`、类型级模板、`Freeze from type`、按 genre 播种 | 后端字段有（`reference_type`/`show_on_existing`），**界面上没有控件** |
| 7 | **关系树** | 家族树 + 拖拽 + 变体 | Family/Corporate/Military/Royal court **关系集预设**、junction、关系线型 Solid/Dashed/Dotted 可设、portrait/notes | 我们没有 kinds 预设，线型只能在数据里改；`subtitle` 不能编辑 |
| 8 | **地图** | 图钉/区域/图层/上传底图/关联卡 | zone 图案（Diagonal/Dots…）、`Bring to Front/Send to Back`、文字字体描边旋转、pin icon 库、共享边吸附 | 我们只有 scale 的 ±，`icon`/`rotation` 字段有但没有 UI；文字不能旋转 |
| 9 | **编辑区动效** | 基本是瞬时切换 | reveal/stagger/spring、drag 高亮、面板过渡 | 我们的"手感"偏硬 |
| 10 | **空状态与引导** | 一两行提示 | coach 引导、guided templates（Character/Location/Event）、空状态插画 | 新用户不知道下一步做什么 |
| 11 | **发布站点** | 公开/未列出/密码 + 主题色字体 + 导航 | 4 档受众（含付费）、站点版本回滚、SEO、分析、多 wiki、模板库 | 差在"上线之后"的一整套 |
| 12 | **时间线视图** | 经典编辑器（Line 视图）+ 工作区抽屉里的事件/日历面板 | `Line view` / `Calendar view` 并列、`Go to a date`、月亮月相 | 我们日历是"设置表格"，不是"能看的视图" |

---

## 四、美术与用户体验：有没有做到最好？

**没有。** 本轮把"系统性与一致性"做到了及格线以上，但"完成度与体感"还差一截。

已经做到的：
- 一套权威 token（灰阶主色 `#18181b`/`#fafafa`、圆角 6/12/16、4px 栅格、阴影归零、Geist 字族）
- 一套图标系统（40 个线条图标 + 补齐的排版图标，全部 `currentColor`）
- 一套按钮系统（文字药丸 / 图标圆角方块 / 徽章 24px，`nowrap` 不折行）
- 颜色语义（强调蓝=可交互、绿=已发布、琥珀=有改动、红=删除、类型色=卡片类型）
- 圆角矩形铺满（侧栏一列圆角块、编辑区一张圆角卡片、浮层圆角、插入条药丸组）

还差得远的：
1. **动效**：没有过渡曲线、没有入场 stagger、拖拽没有"跟手"的反馈；VVD 的界面"会呼吸"。
2. **空状态与插图**：新建世界/空文件夹/空时间线只有一行字，没有引导与插画。
3. **无障碍**：键盘可达性只覆盖了主路径，缺屏幕阅读器播报（VVD 连拖拽都有完整播报）、缺"减少动效"开关。
4. **响应式**：窄屏没有布局（VVD 至少 iPad 横屏有专门布局）。
5. **信息密度节奏**：属性表、类型管理器的留白与分组仍比 VVD 紧，长表单缺少分组标题与折叠。
6. **文案**：部分提示偏长（VVD 是"短标签 + 必要时一句解释"）。

---

## 五、改进方案

### 本轮（第七轮）已执行 —— 直击"可感知度最高"的 8 项

| 方案项 | 做了什么 | 验收 |
| --- | --- | --- |
| **撤销 / 重做** | 整卡快照式撤销栈（80 步）：打字、拖拽排序、块菜单、属性、别名、评论全覆盖；`⌘Z`/`⇧⌘Z`、顶栏按钮（右键出历史）、**撤销历史面板**可跳到任意步 | `tools/editing_probe.py`：拖拽 → ⌘Z 复原 → ⇧⌘Z 重做，全过；打字后按钮变"撤销：编辑正文" |
| **块拖拽排序 + 块菜单** | 拖动把手（按下才可拖，避免误拖）+ 落点指示线；把手点一下出块菜单（正文/标题/引用/提示框、上下插入、复制、隐藏、评论、删除） | 同上探针：3 块拖成 2-1-3，菜单 9 项，复制 3→4 可撤销 |
| **块评论** | 真评论线程：发送（⌘↵）、标记解决、删除、工具条计数徽章；服务端白名单净化、上限 50 条/块 | `world.tests.RichTextTests`：评论往返 + `<script>` 被清洗；探针：落库 + 标记解决 |
| **导入 / 导出** | 世界 **zip**（每文档 Markdown + `world.json` 备份 + 媒体清单）、世界 JSON、单文档 MD/JSON；导入 Markdown 单/多文件、zip（Obsidian 目录结构 → 文件夹/卡片）、`world.json` 还原；`[[双链]]` → 卡片提及 | `world.tests.ExchangeTests` 6 个测试：zip 内容、MD 结构、目录建树、macOS 垃圾跳过、备份往返、**每种文档类型都能导出**；探针跑通 UI 导入 |
| **值得添加（本地智能建议）** | 规则版实体识别（反复出现但还没卡片的名字，挡掉「的洞室」这类碎片）+ 空壳卡片 + 没人引用的文档 + 没关联卡片的事件；联动世界设置的 AI 开关，关掉就提示去开 | `world.tests.SuggestionTests` 2 个：能找出 `Eldoria`、不出现碎片、开关关闭时返回空 |
| **时间线列表视图 + 标记** | 经典编辑器里两颗"死按钮"变成真功能：可搜索的事件清单（点行把视野移过去并选中）、`⚑` 重点标记（落库到事件的 settings）、只看标记 | `ClassicAdapterTests.test_event_flag_round_trip` + `tools/round7_probe.py`：14 行、搜索 2 行、点行视野 444→79、标记 1 条 |
| **快捷键与导航** | `⌘/` 快捷键表（可搜索）、`⌘B` 收起侧栏（记忆状态）、`⌘1…9` 切标签、`⌥⌘T` 找回刚关的标签 | 探针：17 条快捷键、⌘B 生效 |
| **占位文档的出路** | `note` 直接走卡片编辑器；`canvas/board/table` 明确说明"界面没做但数据在"，给"用卡片编辑器打开""删除（进回收站）"两条出路 | 探针 + 手工验证 |

**顺便修掉的真 bug**（都是这轮跑出来的）：
1. `saveBlock` **重复定义** → 打字这条路径根本没进撤销栈（静默失效，最难查的一个）
2. 净化器把提及的 `class="mentions-inline"` 丢掉 → 导入的 `[[双链]]` 点了没反应（改成白名单放行 class + 前端用 `[data-target]`）
3. 导出对 **关系树 / 地图 / 时间线** 崩溃（`tree_edges`、`linked_card`、`sort_key` 三个字段名写错）
4. 图谱节点上限前端 160 / 后端 400 口径不一致（统一为 400 并标注截断）
5. 列表面板的 `pointerdown` 被画布手势 `preventDefault` 吞掉 → 面板内点击全失效
6. 死代码 `default_era_span()` 清理

### 后续路线图（按性价比排序）

**P0（下一轮，1 个会话内可完成）**
1. **文档版本历史**：每次保存留快照（限 30 版/文档），`documents.history` 面板可 diff + 回滚 —— 验收：改 3 次后能回到第 1 版，`world/tests.py` 覆盖。
2. **搜索升级**：`/api/world/search` 纳入 `Card.body`，返回带高亮的片段；`⌘K` 分组（文档/正文命中）—— 验收：搜正文里的词能命中该卡片。
3. **评论锚定到选区**：选区 → 评论，存 `range` 文本 + 前后文；目标消失时显示"位置丢了"并允许重新锚定 —— 对齐 VVD 的 `Lost its place / Reattach`。

**P1（2–3 轮）**
4. 编辑器块嵌套 + `toggle list` + `checklist` + 表格块（对齐 VVD 的基本块清单）
5. 日历**视图**（可看的月份表 + 月相计算与展示策略）
6. 关系树 kinds 预设（家族/公司/军队/王室）+ 线型 UI + subtitle 编辑
7. 地图：zone 图案、图层前后序、pin 图标库、文字旋转（把已有字段接上 UI）
8. 发布站点：站点版本回滚 + SEO 字段 + 主题库（3–5 套）
9. 导出 PDF / 图片（用无头 Chrome 打印，复用现有 Playwright 能力）
10. 卡片类型：`reference_type` / `show_on_existing` 控件 + 类型模板

**P2（需要更多投入）**
11. Eras 世界分支语义（卡在纪元里的可见性 + 纪元独立主题）
12. 表格双向绑定（行=卡、列=共享属性）+ CSV 进出
13. 协作与离线（需要账号/推送/本地队列，属于架构级）
14. AI：接一个可选的模型端点（保持"不上传就不上传"的默认）

**P3（长期 / 生态级）**
15. Map Maker、手绘地图工具、Quill 出版链、Workshop 插件机制、Canvas/Board 真工具、移动端布局、无障碍播报与自定义快捷键

### 美术与体感专项（与功能并行，每轮挤一点）
- 空状态插画 + 引导模板（Character/Location/Event 三套问答式模板）
- 动效基线：150–220ms `cubic-bezier(.22,1,.36,1)`、列表换页 stagger、拖拽跟手反馈
- 无障碍：所有浮层键盘可达（Tab 环 + Esc）、拖拽播报、`prefers-reduced-motion` 支持
- 响应式：≥1024 保持双栏，768–1024 侧栏可收起为图标栏，<768 单栏（面板切换）

---

## 六、本轮的验证证据

```
manage.py test              → 130 个测试全绿（world 100 + timeline 30）
tools/editing_probe.py      → 拖拽排序 / 撤销 / 重做 / 块菜单 / 块评论：问题（无）
tools/round7_probe.py       → 列表视图 / 标记 / 导入导出 / 建议 / 快捷键 / 侧栏 / 撤销历史：问题（无）
tools/wysiwyg_probe.py      → 富文本 / 斜杠菜单落库：问题（无）
tools/bubble_actions_probe.py → 创建卡片 / 链接卡片：问题（无）
tools/timeline_embed_probe.py → 嵌入编辑器点/拖/滚轮：问题（无）
tools/monkey_probe.py 16    → 每页随机乱点：0 未捕获异常 / 0 个 5xx
```

截图：`docs/vvd-shots/21~23`（极简深/浅色、类型面板），本轮新增见 `docs/vvd-shots/24~28`。
