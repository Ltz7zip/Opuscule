# 前端快速体检报告 · Opuscule 世界观共建工作台

> 审查技能：`review-frontend-production`（BadbotAI/BadGoods，v0.3.0-beta）
> 审查深度：**quick（快速体检）** —— 不承诺全站覆盖，不构成发布验收
> 审查日期：2026-10-15　审查人：AI 前端审查助手
> 版本基线：体检时 0.5.0-dev（HEAD `33166ab`）→ 修复轮已升到 **0.5.1-dev**
> **首轮不改代码**（按要求只登记问题、给修复顺序与验收方法）；同日修复轮按 §1.1 逐条落地，改动清单见 `CHANGELOG.md`

---

## 1. 范围与基线

| 项 | 内容 |
| --- | --- |
| 项目 | `/Users/ltz2024/PycharmProjects/worldbuilding_timeline`（Django 6.1 + 原生 HTML/CSS/JS，无构建步骤） |
| 版本 | 文档版本 0.5.0-dev，git HEAD `33166ab` |
| 运行基线 | 本机 `manage.py runserver 127.0.0.1:8010`，`DEBUG=1`，SQLite `db.sqlite3` |
| 数据基线 | 3 个用户；世界 7「The Grand Alchemy」已发布（`published_slug=3b9edd`，`audience=public`，`publish_version=13`）；18 份已发布文档；`TimelineItem` 45 行 |
| 访问能力 | 源码可读；HTTP 可实测（含匿名与已登录两种身份，经 Django test client 以 `SERVER_NAME=127.0.0.1` 构造）；**未做浏览器渲染实测**（无截图/无布局测量） |
| 检查对象 | 只读站点 `/s/<slug>/*`、工作区 `/world`、经典时间轴 `/legacy` 与 `/api/timeline`、关系树 `/relationship`、账号页 `/login /register /reset` |
| 样本 | 抽查 `static/*.js`（workspace 10985 行 / script 2230 行 / relationship 1697 行 / auth 997 行）、`templates/**`、`apps/**` 相关视图与权限代码 |

### 一句话结论

**页面与交互层面没有发现"整页崩掉"级别的问题**；真正需要先处理的是三类：**已发布文档因 slug 重复在站点上打不开**、**经典时间轴接口的权限口径**、**世界主题/封面直接进 inline style 的注入面**。其余问题集中在「只读边界的实现方式过于脆弱」和「可访问性细节」。

### 1.1 修复轮状态（0.5.1-dev · 同日）

| 编号 | 状态 | 落地方式（改动位置） | 复验证据 |
| --- | --- | --- | --- |
| F1 slug 冲突 | **已修** | `Document.save()` 去重 + `UniqueConstraint(world, slug)` + slug 索引 + 迁移 `documents.0002` | 6 项单测；真库两篇「未命名」→ `未命名` / `未命名-2`，`/s/3b9edd/未命名*` 两条 URL 各命中一份 |
| F2 经典时间轴口径 | **已修** | `/api/timeline` 进读守门人；`/legacy` 匿名 → `/login`（保留首次安装例外） | 5 项单测；浏览器：匿名 `/api/timeline` 401、登录后 200 |
| F3 内联样式注入面 | **已修** | `constants.py` 新增 `safe_primary_color` / `safe_font_family` / `safe_image_url` / `sanitize_theme`；`Document.cover_safe`；站点 5 处渲染入口统一套用 | 8 项单测（含注入载荷与正常值放行） |
| F4 只读边界 | **已修（与原报告结论不同）** | 删掉 `.is-embed-bar` 词匹配死代码 + `responsive.css` 两条死规则 | 见下方更正：那套机制**从未生效**；浏览器实测只读嵌入里可见写按钮 **0 个** |
| F5 画布页体积 | **部分修复** | 加 `GZipMiddleware`（1 行）；深度拆包登记为后续 | 实测地图数据 **2.79 MB → 488 KB**；总请求 108 条 / 6.2 MB 的现状见下文 |
| F6 底部导航高亮 | **已修** | 新增 `syncBottomNav()`，只由「侧栏开合」驱动 | 源码复核 + 浏览器加载无报错 |
| F7 表单可访问性 | **已修** | 站点搜索框 / 密码框 / 工作区搜索框补 `aria-label`，密码框补 `autocomplete`，错误改 `role="alert"` | 2 项单测 |
| F8 装饰按钮进 Tab 序列 | **已修** | `.auth-ctrl` 加 `aria-hidden` + `tabindex="-1"` | 浏览器实测：Tab 序列里 Hibernate / Reboot **已消失** |
| F9 筛选浮层焦点 | **已修** | Esc 关闭时把焦点还给 `.fc-btn`（鼠标点外面关闭则不抢焦点） | 浏览器实测：Esc 后 `activeElement.className === 'fc-btn'` |
| **F10（新增·实测）窄屏横向溢出** | **已修** | `site.css` 窄屏导航换行；装饰网格 `-10vw → -3vw` | 实测 **389px → 0px**（360 / 390 / 1280px 均 0） |
| **F11（新增·实测）公开页 401 噪音** | **已修** | 只读嵌入态不再挂通知中心（不再请求 `/api/world/activity`） | 匿名嵌入页控制台报错 **1 条 → 0 条** |

> 回归：全量测试 **420 项通过**（体检前基线 399 项，新增 21 项）。浏览器实测覆盖报告原先标"未验证"的视觉 / 键盘项。

---

## 2. 主要发现（按影响排序）

> 证据类型标注：【实测】= 本机真实请求结果；【源码】= 代码控制流推理；【推断】= 需浏览器/设备复验。

### F1 两份已发布文档共用同一 slug，站点上至少有一份打不开 ★先修

- **定位**：`apps/documents/models/document.py:168`、`apps/world/services/publish.py:392`、`apps/world/models/constants.py:286-295`；实例：doc 2153 与 doc 2155（世界 7，均为已发布 card）。
- **证据**【实测 + 源码】
  - `document.py:168` 生成 slug 时只做 `self.slug = slugify_name(self.name)`，**没有在同世界内去重**；
  - 模型层无约束【实测】：`Document.slug` = `CharField(max_length=80, unique=False, db_index=False)`，`unique_together=()`，无 `constraints`；
  - 数据层已出现冲突【实测】：`world=7 slug='未命名' count=2`（doc 2153、2155 都是 `is_published=True, hidden=False, deleted_at=None`）；
  - 解析层取第一条【源码】：`publish.py:392` `document = query.filter(slug=slug).first()`，站点页 `site_views.py:267` 调用它；
  - 未知地址实测：`GET /s/3b9edd/未命名/` → **200**，返回的是其中一篇（`.first()` 决定，另一篇永不可达）。
- **实际**：两篇都已"发布"，但站点上只有一条 URL；另一篇的入口卡片点进去是**另一篇的内容**（同页 tile 链接指向同一 URL）。
- **预期**：同一世界内每份已发布文档有唯一可达 URL；重名时自动加后缀（`未命名-2`）或改用 id。
- **影响**：读者看到内容与标题不符的页面；作者无法通过站点验证/分享该文档。属**用户可直接感知**的内容可达性故障。
- **优先级**：**P1**（核心阅读路径错误，且随文档增多必然复现；当前库中已存在实例）。置信度：confirmed。
- **修复方向**：① 生成处去重（同 world 内探测已有 slug 后加序号）；② 加 `UniqueConstraint(world, slug)` 迁移并回填历史重复值；③ 顺带把 `slug` 标 `db_index=True` —— 目前每次站点页请求都在无索引列上过滤（`site_views.py:296` 的兜底查询同样）。
- **复验**：新建两张同名卡片并全部发布 → `/s/<slug>/` 首页应出现两个不同 URL；对任一 URL 取页面 `<h1 class="doc-title">`，应与该 tile 的标题一致。回归：`manage.py test`（slug 相关用例）全绿；旧链接仍可达。

### F2 经典时间轴：匿名可读全量内容，且任意登录用户可改全局数据

- **定位**：`apps/timeline/views.py:59-121`、`apps/world/middleware.py:19-28`、`apps/world/permissions.py:353-361`。
- **证据**【实测】
  - `apps/timeline/views.py:86-92`：`/api/timeline` 只有 `@require_safe`，**无任何权限判断**；写接口（`views.py:95-121`）`@csrf_exempt` + 无权限判断，只靠中间件兜。
  - `middleware.py:26-28` 注释把 `/api/items`、`/api/view` 归为「经典时间线 demo 模型（与任何世界数据无关）」，读守门人只守 `/api/world/`。
  - 本机实测（45 行真实数据）：
    - 匿名 `GET /api/timeline` → **200**，7192 字节，含事件标题与描述；匿名 `GET /legacy` → **200**。
    - 匿名 `POST /api/items` → **401**；匿名 `DELETE /api/items/999999` → **401**（写守门生效，未污染数据）。
    - **已登录、世界 7 成员** `DELETE /api/items/999999` → **404**（穿过写守门，证明放行）。判据是 `can_edit(user, current_world)`，即"他在**自己那个世界**能否编辑"，与这条全局数据无关。
- **实际**：① 匿名读者可读全量经典时间轴；② 任一世界的可编辑成员，可以删改**所有人共享**的这条全局时间轴（跨世界篡改），而内容对 `/legacy` 的所有访问者可见。
- **预期**：要么该数据集明确只读/隔离（不提供匿名读，或读也要求登录），要么写明"公共草稿本"并在 UI 上标明；写操作应校验"是否这份数据的负责人"，而不是"用户自己有没有可编辑的世界"。
- **影响**：跨世界数据篡改（数据完整性）+ 内容暴露面超出"工作区需登录"的整体印象。属于**后端授权口径**问题，前端只承担"界面不该鼓励这些入口"。
- **优先级**：**P1**（重要一致性/权限缺口；写侧已确认可达，未做破坏性验证故未定为 P0）。置信度：confirmed（授权判据）/ 破坏性结果 probable。
- **修复方向**：先与产品确认 `/legacy` 的定位，再二选一：把 `/api/timeline` 纳入读守门人、把写接口的判据换成"数据负责人/平台角色"；或把 `/legacy` 明确降级为本地演示工具并从公开路由摘掉。**不要**只在前端加一个"只读"提示。
- **复验**：用**另一个世界**的账号执行同样非破坏性探测 `DELETE /api/items/<不存在的 id>`，应得 401/403 而**不是** 404；匿名 `GET /api/timeline` 应不再是 200。回归：`apps/timeline` 既有测试全绿。

### F3 发布站点把「世界主题 / 文档封面」直接写进 inline style（CSS 注入面）

- **定位**：`templates/site/base.html:54`、`templates/site/password.html:15`、`templates/site/page.html:21`、`templates/site/home.html:38`。
- **证据**【源码】
  - `base.html:54`：`style="--site-primary: {{ theme.primaryColor }}; --site-heading: '{{ theme.headingFont }}', Georgia, serif; --site-body: '{{ theme.bodyFont }}', ...;"`；`password.html:15` 同样写 `--site-primary`。
  - `page.html:21` / `home.html:38`：`style="background-image:url('{{ document.cover }}')"`。
  - 数据来源无校验：`apps/world/models/world.py:28-29,56-62`（`theme_config` 是 JSONField，合并时只做 key 白名单，值不过滤）；`apps/documents/models/document.py:50/109/379`（`cover = models.TextField`，无 URL/格式校验）。
  - **同仓库已有两处防御**，说明这是遗漏：`apps/world/site_views.py:119-120` 用 `re.fullmatch(r"#[0-9a-fA-F]{3,8}", color)`，注释「别让主题值变成注入点」；`apps/world/views/site.py:145` 用 `_safe_primary_color()`。
- **机制**：Django 自动转义会把 `'` 写成 `&#x27;`，但这只挡住了 HTML **属性**边界；属性值在交给 CSS 解析前会被 HTML 解码，因此 `'` 会以真身回到 `url('…')` 里 → 可闭合引号并注入任意 CSS 声明。
- **实际**：有编辑权的成员可给世界主题/封面写入 CSS 片段，发布站点的每页都会被贴上（可覆写样式、遮挡内容、伪造覆盖层）。
- **预期**：写入前规范化（颜色只允许 `#rgb/#rrggbb`，字体名只允许字符白名单，封面只允许站内 media 路径/`data:` 图片）。
- **影响**：公开站点（对匿名读者）可被涂改。可控者=该世界的成员，影响面限于该世界自己的站点，不跨站。
- **优先级**：**P2**（可用现有防御同一套机制低成本收敛；当前可控者即站点的内容负责人，故未定为 P1）。置信度：confirmed（源码）/ 浏览器表现 probable。
- **修复方向**：把 `site_views.py:119-120` 的正则与 `_safe_primary_color` 抽成一个共用的规范化函数，在 `_site_base()` 与 `page()` 渲染前统一处理 `theme` 与 `cover`；模板侧保持现有写法即可。
- **复验**：把 `theme_config.primaryColor` 改成 `#fff;position:fixed;inset:0;background:url(//example.com/x)`，刷新 `/s/<slug>/` —— 修好后页面外观不应变化（或该值被丢弃）；同时确认正常主题色仍生效。

### F4 只读嵌入靠"选择器清单 + 中文词匹配"隐藏写入口（脆弱）

- **定位**：`static/workspace.js:9340-9361`、调用点 `static/workspace.js:9328`、`static/workspace.js:980`。
- **证据**【源码】
  - `workspace.js:9340-9347` `WRITE_CONTROLS` 是硬编码选择器数组，其上注释（9337）自陈：「新增写按钮时记得加进这张表，否则游客点得到、点了才被拦」。
  - `workspace.js:9351-9352` `EMBED_HIDE_WORDS = ['成员','选择','平移','图钉','区域','文字','底图','上传','关系名','变体','新建','添加','删除','清空']`，`tagEmbedControls()` 用 `text.includes(word)` 决定隐藏 —— **按按钮文案判断权限**。
  - 开关点：`workspace.js:9328` `revealWriteControls(Boolean(viewer.can_edit))`。
- **实际**：公开站点里嵌的画布，其"哪些写入口隐藏"取决于两张人工维护的表。漏一处 → 匿名读者看到一个点不动的写按钮（服务端会 401/403，**不伤数据**，但界面误导）；若将来新增的是**纯前端动作**（本地导入、本地排序、导出），则会真的生效。反向风险同样存在：文案含"选择/文字/添加"的**只读**控件会被误藏。
- **预期**：只读态由"数据 + 渲染器"决定（例如给只读元件统一加 `data-readonly`／由渲染函数按 `canEdit` 决定是否生成按钮），而不是由文案与清单决定。
- **影响**：公开页面的可用性与安全性都依赖"后来的人记得改表"，属结构性集成缺陷（不是当前可复现的故障）。
- **优先级**：**P2**（未形成实际越权，但直接决定公开页边界，且会随迭代缓慢劣化）。置信度：confirmed（机制）/ 具体漏项 needs_validation。
- **修复方向**：在渲染画布工具条的同一批函数里按 `isReadOnly()` 决定是否输出按钮；`tagEmbedControls` 仅在过渡期保留，并给 `.is-embed-bar` 的每个按钮补显式 `data-write` 标记。
- **复验**：新增一个写按钮（或把某按钮改文案）后，用**匿名**浏览器打开 `/s/<slug>/<含画布文档>/`，确认没有任何可点的写入口；再用只读账号确认"选择/文字"类只读控件仍然可见。

> **修复轮更正（2026-10-15）**：深查后发现上面这套"词匹配"机制**从未生效**——它的作用域是
> `.is-embed-bar`，而全仓（模板 + 脚本 + 样式）**没有任何元素带这个类**，选择器恒不命中，
> `EMBED_HIDE_WORDS` / `tagEmbedControls()` / `responsive.css` 里那两条规则都是死代码。
> 因此处理方式是**删除死代码**，而不是把它修好。真正管住只读边界的是三条：
> ① 工作区外壳 `WRITE_CONTROLS` + `revealWriteControls(viewer.can_edit)`（带内联 `display` 兜底）；
> ② 关系树页 `rt-write` + `.rt-app[data-readonly="1"] .rt-write { display:none }`；
> ③ 地图页服务端 `{% if shell.can_edit %}` 直接不渲染写面板。再加服务端守门人兜底。
> **实测复核**：匿名打开 `/s/3b9edd/世界地图/`（含只读画布），两个 iframe 里可见的
> `button`/`select` 数量为 **0**；删掉死代码前后行为一致，只读边界没有被削弱。

### F5 只读站点的画布页把整个工作区应用塞进 iframe（体积可测）

- **定位**：`templates/site/page.html:24-29`（`iframe src="/world?embed={{ document.id }}&readonly=1"`）、`templates/workspace.html:12-44, 217-221`。
- **证据**【实测 + 浏览器实测体积】
  - 匿名请求该 iframe 地址（`/world?embed=117&readonly=1`）→ **200**，13123 字节，内容是**完整工作区外壳**（顶栏/侧栏/骨架屏/底部导航全在 DOM 里，仅靠 `body.is-embed` 的 CSS 隐藏，见 `static/responsive.css:699-709`）。
  - 实测文件体积：`static/workspace.js` **458.0 KB**（未压缩）、`static/terminal.css` 92.8 KB、`static/workspace.css` 46.0 KB；`templates/workspace.html:25-44` 依次加载 **9 个 CSS 层**，页尾加载 `icons.js` + `workspace.js` + `experience.js`。
  - **浏览器实测（Chromium，本地 runserver，未压缩）**：
    | 页面 | 请求数 | 传输量 | DOMContentLoaded |
    | --- | --- | --- | --- |
    | `/s/3b9edd/`（首页） | 10 | **353.4 KB** | 87 ms |
    | `/s/3b9edd/世界时间线/` | 14 | **524.1 KB** | 104 ms |
    | `/s/3b9edd/世界地图/`（含画布） | **108** | **6369.4 KB（6.2 MB）** | 84 ms |
    地图页里最大的几项：`/api/world/maps/117/data` **2787.6 KB**、`workspace.js` 458 KB、
    map vendor `index-*.js` 298 KB + `d3.min.js` 236 KB + `layers-*.js` 188 KB + `town-plan-*.js` 176 KB；
    而且它是**三层 iframe 套娃**（站点页 → `/world?embed=117` → `/map/2d?doc=117&embed=1&readonly=1`）。
- **实际**：读者只为看一张地图就要 108 个请求 / 6.2 MB（本地未压缩；生产 nginx 会压静态资源但不会消掉解析与请求数），并启动整套工作区 + 一整套第三方地图引擎。
- **预期**：站点内嵌画布只加载该画布所需资源；或至少把工作区脚本按需拆分（画布运行时与工作区外壳分离）。
- **影响**：公开站点流量与首屏（地图页最重；`page.html:49` 的时间线 iframe 同理，但只有 524 KB）。
- **优先级**：**P2**（可测量的性能退化，影响每一个公开页面的读者）。置信度：confirmed（浏览器实测）。
- **修复方向**（已做一半）：**已加 `GZipMiddleware`** —— 实测地图数据 `2.79 MB → 488 KB`（同一份数据）。
  剩余深度拆包**登记为后续任务**：给嵌入态做只装画布的轻量入口（或把画布运行时与工作区外壳拆开），
  并用上表做前后对比验收。**故意不在本轮做**：改动面覆盖工作区启动、地图 / 图谱 / 关系树三条运行时，
  在没有专职回归窗口时风险高于收益。
- **复验**：DevTools 禁用缓存打开 `/s/<slug>/<map 文档>/`，对比上表；目标值 = 只含画布资源。

### F6 移动端底部导航的高亮不反映真实状态

- **定位**：`static/workspace.js:7360-7370`、`static/responsive.css:658-677`、`static/terminal.css:1624`。
- **证据**【源码】：点击即 `other.classList.toggle('is-on', other === node)`；`is-on` 由 `responsive.css:673` 上色。但五个动作里只有 `world`（开合侧栏）近乎"视图"，`search/new/suggest/user` 都是**瞬时浮层**（`openPalette('')`、`guidedTemplatesDialog()`、`suggestionsDialog()`、`userMenu()`）。另：`terminal.css:1624` 给 `.bottom-nav button.is-active` 上色，而 JS 只设 `is-on`，该选择器无人使用。
- **实际**：手机上点「搜索」后，「搜索」被点亮成"当前所在分区"，关掉浮层也不复原。
- **预期**：要么按真实分区高亮（当前视图/是否有浮层打开），要么不高亮。
- **影响**：导航语义误导（非功能故障）。
- **优先级**：**P3**。置信度：confirmed（源码）。
- **复验**：390px 宽下依次点五个按钮，检查上色是否与"当前所在/浮层是否打开"一致，关闭后是否复原。

### F7 表单输入普遍缺可见 `<label>`（多处）

- **定位**：`templates/site/base.html:66`（顶栏搜索）、`templates/site/home.html:11`、`templates/site/search.html:8`、`templates/site/password.html:22`（访问密码）、`templates/workspace.html:103`（`#sbSearch`）。
- **证据**【源码】：以上均为 placeholder-only 的 `<input>`，无 `<label for>`、无 `aria-label`、无 `aria-describedby`。对照 `templates/auth.html:260-318`（登录/注册/邀请码）**全部**用 `aria-label`，是合规写法 —— 说明只是这两类页面漏了。
- **实际**：placeholder 一输入即消失；读屏得到的名字质量差；错误/说明与字段无程序化关联。
- **预期**：每个输入具可访问名称（可见 `<label>` 或 `aria-label`），站点密码页另加 `autocomplete="current-password"` 以支持密码管理器。
- **影响**：读屏与键盘用户体验；站点密码页还影响到自动填充。
- **优先级**：**P3**（类型正确、`autocomplete` 多数已对，例如 `auth.html:261/299`）。置信度：confirmed。
- **复验**：逐页用无障碍检查工具（或读屏）确认每个输入都有可访问名称与必要 `autocomplete`。

### F8 登录页放了两个"装饰性"可聚焦按钮

- **定位**：`templates/auth.html:356-359`；行为在 `static/auth.js:882-886`。
- **证据**【源码】：`<button type="button" class="auth-ctrl-btn" data-noop>Hibernate</button>` / `Reboot`，点击只往会话日志写一行「… NOT AVAILABLE」。它们不在 `auth.html:351` 的 `aria-hidden` 容器内，因此进入 Tab 序列。
- **实际**：键盘/读屏用户会撞到两个永远无效、且文案有歧义的按钮（视觉上是终端趣味装饰）。
- **预期**：纯装饰元素不该进入可聚焦序列（改 `aria-hidden="true"` + `tabindex="-1"`，或用 `disabled`）。
- **影响**：登录页是陌生用户第一站，误导性可供性对信任度有影响。
- **优先级**：**P3**。置信度：confirmed。
- **复验**：Tab 遍历 `/login`，无效按钮不应出现在焦点序列中。

### F9 站点筛选浮层无键盘导航、关闭后不归还焦点

- **定位**：`templates/site/_filter.html:2-29`；交互在 `templates/site/base.html:115-128`。
- **证据**【源码】：菜单是 `<div class="fc-menu">` + 一串 `<a>`，无 `role="menu"`/方向键处理；`close()` 只设 `menu.hidden=true` 与 `aria-expanded`，**不把焦点还给 `.fc-btn`**。`aria-expanded`/`aria-haspopup`、Esc 关闭、点外部关闭都已实现（这部分是好的）。
- **实际**：键盘用户 Tab 进菜单项后按 Esc，焦点落回文档流起点附近而非触发按钮；分组标题（"按类型"/"按纪元筛选网格"）无法被跳读。
- **预期**：关闭后焦点回到触发按钮；分组的可访问结构明确。
- **影响**：键盘用户体验（过滤是站点主要浏览方式之一）。
- **优先级**：**P3**。置信度：confirmed（源码）。
- **复验**：只用键盘打开筛选 → 关掉 → 焦点应回到 `.fc-btn`。

### F10 发布站点窄屏横向溢出（修复轮新增 · 浏览器实测）

- **定位**：`static/site.css`（`.nav` 一行放不下）、`static/experience.css:227-232`（`.site .hero::before` 的 `inset: -40px -10vw auto`）。
- **证据**【浏览器实测】：390px 视口下站点**每一页**都横向溢出 —— `scrollWidth 779` vs `clientWidth 390`（首页 / 画布页 / 时间线页都中，登录页与探索页正常）。
  隐藏哪一块能消掉溢出：`.nav` → 归零；`.er-row` / `.grid` / `.foot` 无关。
  修完导航后仍有 11px，逐层二分定位到 `.hero`：`.wrap` 的内容列宽 334px，而 `.hero::before` 左右各外扩 `10vw`（390px 下 = 39px）把文档顶宽。
- **实际**：读者在手机上打开任何站点页面都能左右摇晃，接近翻开一屏的 2 倍宽。
- **预期**：窄屏无横向滚动；装饰性背景不外扩出视口。
- **影响**：**移动端阅读体验**（公开站点的绝大多数访客场景）。
- **优先级**：**P2**（每个窄屏访客都会遇到）。置信度：confirmed（浏览器实测 + 逐层二分）。
- **修复方向**：站点导航窄屏换行（`order` 重排，搜索框独占一行）；装饰网格窄屏收窄到 `-3vw`。
- **复验**：360 / 390 / 1280px 三个宽度下 `documentElement.scrollWidth - clientWidth` 应为 **0**。
  修复后实测：**0 / 0 / 0**（首页与画布页均通过）。

### F11 只读嵌入页在公开站点上打出 401 与每 90 秒重试（修复轮新增 · 浏览器实测）

- **定位**：`static/experience.js:1438-1444`（`mount()`）与 `1708-1711`（`setTimeout(load, 1200)` + `setInterval(load, 90000)`）、`experience.js:1396`（`fetch('/api/world/activity')`）。
- **证据**【浏览器实测】：匿名打开 `/world?embed=117&readonly=1`（发布站点里嵌的画布就是它）唯一的控制台报错是
  `Failed to load resource: 401 (Unauthorized) → /api/world/activity`。
- **实际**：通知中心被挂进 `.tb-right`（嵌入态下整块顶栏 `display:none`），于是每次加载都匿名请求一次受保护接口、
  每 90 秒再来一次——读者看不见这个按钮，却白付请求与报错。
- **预期**：看不见的东西不要去请求。
- **影响**：公开页面的控制台噪音 + 无谓请求（不影响功能）。
- **优先级**：**P3**。置信度：confirmed（浏览器实测）。
- **修复方向**：嵌入态（`body.is-embed`）不挂通知中心。
- **复验**：匿名打开 `/world?embed=117&readonly=1`，控制台报错应为 **0 条**（修复后实测 0 条）。

---

## 3. 修复顺序（建议）

| 阶段 | 内容 | 为什么排这里 | 前置依赖 | 本轮状态 |
| --- | --- | --- | --- | --- |
| **0. 口径确认** | 确认 `/legacy` 与 `/api/timeline` 的定位（公开演示工具 还是 私有内容） | F2 的修法取决于产品决定，写错方向会白做 | 产品/作者决定 | 按**保守默认**落地（要求登录），并在 CHANGELOG 写明口径变更 |
| **1. 数据可达性** | F1：slug 去重 + 唯一约束迁移 + 回填 + `db_index` | 唯一会**让读者看到错误页面**的问题，且数据里已存在 | 无（可立即做） | ✅ 已完成 |
| **2. 权限口径** | F2：读守门人纳入 `/api/timeline` | 涉及**共享数据的完整性**，风险面最大 | 阶段 0 的决定 | ✅ 已完成（写侧"数据负责人"模型未引入，见 §6.3） |
| **3. 注入面收敛** | F3：抽出共用规范化函数，统一处理 `theme` 与 `cover` | 已有现成正则可复用，改动小、收益明确 | 无 | ✅ 已完成 |
| **4. 只读边界** | F4：删掉从未生效的词匹配，改为依赖三条真实机制 | 决定公开页边界的长期健壮性 | 阶段 3 之后 | ✅ 已完成（结论已更正） |
| **5. 性能** | F5：先量化，再决定轻量嵌入模板 / 拆包 | 收益最大但改动面也最大，需要测量支撑 | 浏览器测量基线 | ⏳ 已量化 + 已加 gzip；深度拆包待排期 |
| **6. 窄屏与一致性** | F10（移动端溢出）优先，再 F7 → F8 → F9 → F6 / F11 | 各自独立、低风险，可批量小步提交 | 无 | ✅ 已完成 |

**顺序依据**：先"读者已经看得到的错误"（F1 / F10），再"数据/权限完整性"（F2），再"安全暴露面"（F3、F4），最后才是体验与性能。每个阶段独立可发布，不必等前一个阶段完全验完。

---

## 4. 已检查、未发现问题的部分（避免把"没查到"当成"没有"）

- **转义卫生**：抽查 `static/relationship.js` 21 处 `innerHTML` 与 `static/script.js` 10 处，用户数据（节点名、树名、关系名、事件标题/描述）均走 `esc()` 或 `textContent`（例如 `relationship.js:425/460/606/1213`、`script.js:543/548/672/1386-1387`）。**未发现未转义的服务端数据拼接**。
- **图标注入**：`static/icons.js:162-164` `iconHtml()` 用 `ICONS[name] || ''` 白名单；模板里的 `data-icon` 全是字面量。无注入面。
- **匿名写请求**：实测 `POST /api/items`、`DELETE /api/items/999999`、`PUT /api/view` 均 401 —— 世界接口的写守门人是有效的。
- **嵌入入口的访问控制**：匿名 `GET /world?embed=99999&readonly=1` → 302（未发布的 / 不存在的文档不会把工作区露给游客）；匿名 `/api/world/maps/99999/data` → 401；匿名 `/api/world/maps/117/data`（已发布）→ 200（符合设计）。
- **浮层焦点**：工作区模态框实现了"记住打开者 → 送焦点进去 → 关闭归还"（`workspace.js:6643-6661`，含 `Opus.trapFocus`），命令面板与 `askText/askChoice` 也有 Esc/Enter 处理。这部分做得比多数项目好。
- **`postMessage` 跨文档通信**：站点与 iframe 两侧都校验 `event.origin === window.location.origin`（`templates/site/base.html:90,167`、`workspace.js:9397`）。
- **只读边界的实际效果（修复轮实测补上）**：匿名打开含画布的站点页，两个 iframe 里可见的 `button`/`select` 计数为 **0**；
  删掉那套死代码前后一致 —— 也就是说，原先 F4 担心的"误导性写入口"在真实页面上并不存在。

---

## 5. 未检查 / 阻塞的范围（本次不覆盖）

| 范围 | 原因 |
| --- | --- |
| **颜色对比度、焦点环可见性、动效合规** | 修复轮已补浏览器实测（溢出 / Tab 序列 / 焦点归还 / 控制台报错），但**对比度需要专门测量**（渲染取值 + WCAG 计算），本次未做 |
| **读屏实际朗读、触摸手势、点击目标尺寸** | 需要辅助技术与真机；本次只做了 DOM/焦点层面的验证 |
| ~~窄屏横向溢出~~ | **已补实测并修复**（F10：389px → 0px） |
| **`templates/map/app.html`（985 行）与 `static/map/vendor/*`** | 引入的第三方（Azgaar Fantasy Map Generator）应用，属外部资产，本次未审（只测了它的传输量） |
| **`third_party/fantasy-map-generator`** | 同上 |
| **Django admin 后台** | 本次只审面向用户的前端页面 |
| **Service Worker / 离线行为**（`static/sw.js`、`static/offline.html`、`experience.js` 的离线分支） | 需要浏览器与网络条件模拟 |
| **邮件 / OTP / 密码重置全链路**（`otp_enroll`、`/reset/<uid>/<token>`） | 需要邮箱与令牌环境；仅审了渲染结构 |
| **写侧"数据负责人"模型** | F2 只把读与页面口径收紧到"要求登录"；"哪个账号拥有全局经典时间轴"这一层**没有引入**（需产品决定，见 §6.3） |
| **生产环境的压缩与缓存** | gzip 是在 Django 层加的；nginx 侧的静态资源压缩 / 缓存策略本次未验（docs/13 有部署说明） |

---

## 6. 下一步

1. **本轮已全部落地**（F1–F4、F6–F11 已修 + 回归；F5 已量化并加了 gzip）。
   回归：全量 `manage.py test` **420 项通过**（体检前 399 项）。
2. **F5 深度拆包**（唯一剩下的 P2）：按 §F5 的表做前后对比，给嵌入态一个"只装画布"的轻量入口，
   或把画布运行时从 `workspace.js`（458 KB）里拆出来。建议单独一轮、带浏览器回归窗口做。
3. **需要产品拍板的一件事**：全局经典时间轴这份数据"谁拥有"。当前口径是"登录即可读写"
   （与项目既有的"首次安装例外 + 世界角色"惯例一致），但**没有**引入"某个人拥有这份数据"的模型；
   若它将来要装真实内容，应补上负责人 / 平台角色判据。
4. **未验完的最后一项**：颜色对比度与真机触摸（见 §5 首两行），可在 `runserver` 上再补一轮测量 ——
   样本世界 `/s/3b9edd/` 仍在（公开、18 份已发布文档、含 map/tree/graph/timeline 各一份）。

---

> 本报告为部分审查（部分页面 / 部分维度），**不代表产品已通过上线验收**。首轮结论基于 2026-10-15 本机
> `DEBUG=1` 基线；修复轮补充的浏览器实测（Chromium 1194，本地 runserver）同样只代表本机环境，
> 换环境或换数据后需重测。
