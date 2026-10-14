---
version: alpha
name: Terminal-design-analysis
description: |
  一份面向"世界观编辑器"的现代终端语言。它把 VoltAgent 的近黑画布与单一电光绿
  强调色、Ollama 的等宽眉标与极简配色纪律、Warp 的暖调近黑与紧圆角三套方案
  合成一套可落地的系统：暖近黑是唯一的画布，电光绿是唯一的"可交互"信号，
  等宽字只在机器说话时出现，层次由 1px 发丝线而非投影表达。终端的克制就是它的
  世界观——界面像一台调好的机器，而不是一块广告牌。

colors:
  # —— 品牌与强调（唯一的彩色信号）——
  primary: "#3ddc97"
  primary-hover: "#5ee7ae"
  primary-press: "#2bbf7f"
  primary-dim: "#1f8f5f"
  on-primary: "#0d1114"
  primary-wash: "rgba(61,220,151,0.12)"
  primary-line: "rgba(61,220,151,0.32)"

  # —— 表面：暖近黑的三级台阶（Warp 的暖 + VoltAgent 的深）——
  canvas: "#121110"
  canvas-soft: "#1a1917"
  canvas-raised: "#201f1c"
  canvas-sunken: "#0d0c0b"

  # —— 线：层次的全部来源 ——
  hairline: "#2c2a27"
  hairline-strong: "#3d3a36"
  hairline-soft: "#242220"

  # —— 墨色：四级，够用，不多不少 ——
  ink: "#f4f2ee"
  body: "#c9c5be"
  mute: "#8f8b84"
  dim: "#67635d"

  # —— 等宽面上的专用墨色（比正文冷一档）——
  ink-mono: "#e6e3dd"

  # —— 语义：只给状态，不给装饰 ——
  success: "#3ddc97"
  warning: "#e8b055"
  danger: "#f0736a"
  info: "#7cb7e8"

  # —— 焦点 ——
  focus: "#3ddc97"

  # —— 终端窗口的三颗灯（只出现在终端样机里）——
  terminal-red: "#ff5f56"
  terminal-yellow: "#ffbd2e"
  terminal-green: "#27c93f"

typography:
  display-lg:
    fontFamily: Inter, -apple-system, "SF Pro Display", "PingFang SC", system-ui, sans-serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.8px
  display-md:
    fontFamily: Inter, -apple-system, "SF Pro Display", "PingFang SC", system-ui, sans-serif
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.4px
  display-sm:
    fontFamily: Inter, -apple-system, "SF Pro Display", "PingFang SC", system-ui, sans-serif
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.2px
  body-md:
    fontFamily: Inter, -apple-system, "SF Pro Text", "PingFang SC", system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter, -apple-system, "SF Pro Text", "PingFang SC", system-ui, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  body-sm-strong:
    fontFamily: Inter, -apple-system, "SF Pro Text", "PingFang SC", system-ui, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
  ui:
    fontFamily: Inter, -apple-system, "SF Pro Text", "PingFang SC", system-ui, sans-serif
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.4
  eyebrow-mono:
    fontFamily: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 1.2px
    textTransform: uppercase
  caption-mono:
    fontFamily: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  code-strong:
    fontFamily: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5

rounded:
  none: 0px
  xxs: 2px
  sm: 4px
  md: 6px
  pill: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.ui}"
    height: 44px
    padding: "0 {spacing.lg}"
  nav-link:
    backgroundColor: transparent
    textColor: "{colors.mute}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.sm}"
  nav-link-active:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink}"
    indicator: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 30px
    padding: "0 {spacing.md}"
  button-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 30px
    padding: "0 {spacing.md}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 30px
  button-danger:
    backgroundColor: transparent
    textColor: "{colors.danger}"
    borderColor: "rgba(240,115,106,0.32)"
    rounded: "{rounded.sm}"
  text-input:
    backgroundColor: "{colors.canvas-sunken}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 30px
    padding: "0 {spacing.sm}"
  text-input-focus:
    borderColor: "{colors.primary}"
    ring: "0 0 0 2px {colors.primary-wash}"
  card:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  card-interactive:
    backgroundColor: "{colors.canvas-soft}"
    borderColor: "{colors.hairline}"
    hoverBorderColor: "{colors.hairline-strong}"
    hoverBackgroundColor: "{colors.canvas-raised}"
    rounded: "{rounded.md}"
  card-selected:
    backgroundColor: "{colors.primary-wash}"
    borderColor: "{colors.primary-line}"
    indicator: "{colors.primary}"
  panel:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.none}"
  tab-strip:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    typography: "{typography.ui}"
  tab-active:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    indicator: "{colors.primary}"
  sidebar-row:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    height: 26px
    padding: "0 {spacing.sm}"
  data-table-head:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.mute}"
    typography: "{typography.eyebrow-mono}"
    cellPadding: "{spacing.sm} {spacing.md}"
    rowBorder: "{colors.hairline}"
  data-table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    cellPadding: "{spacing.sm} {spacing.md}"
  terminal-card:
    backgroundColor: "{colors.canvas-sunken}"
    textColor: "{colors.ink-mono}"
    borderColor: "{colors.hairline}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  command-chip:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink-mono}"
    borderColor: "{colors.hairline}"
    typography: "{typography.code}"
    rounded: "{rounded.xxs}"
    padding: "{spacing.xxs} {spacing.sm}"
  status-pill:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.mute}"
    borderColor: "{colors.hairline}"
    typography: "{typography.eyebrow-mono}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xxs} {spacing.sm}"
  modal-card:
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.hairline-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
    shadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(148,163,184,0.10) inset"
  toast:
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
  section-band:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    padding: "{spacing.2xl} {spacing.xl}"
  green-divider:
    borderColor: "{colors.primary}"
    width: 1px

  # ─── 场景化（本项目的十个真实面）───
  ex-app-shell:
    description: "工作区外壳：顶栏 + 侧栏 + 面板，三块由发丝线切分，没有投影。"
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
  ex-timeline-canvas:
    description: "时间线画布：比外壳更深一档，轴线上是发丝线，事件点是实心圆。"
    backgroundColor: "{colors.canvas-sunken}"
    axisColor: "{colors.hairline-strong}"
    eventDot: "{colors.body}"
    eventDotActive: "{colors.primary}"
  ex-graph-canvas:
    description: "世界图谱：点阵底纹，节点是带发丝边的方块，选中转成电光绿。"
    backgroundColor: "{colors.canvas-sunken}"
    dotPattern: "{colors.hairline}"
    nodeFill: "{colors.canvas-raised}"
    nodeStroke: "{colors.hairline-strong}"
    nodeStrokeActive: "{colors.primary}"
  ex-relationship-tree:
    description: "关系树网格画布：同图谱语法，连线是发丝线。"
    backgroundColor: "{colors.canvas-sunken}"
    gridLine: "{colors.hairline-soft}"
    edgeStroke: "{colors.hairline-strong}"
  ex-readonly-site:
    description: "发布出来的只读站点：同一套终端语言，标题给世界主色留一个位置。"
    backgroundColor: "{colors.canvas}"
    cardBackground: "{colors.canvas-soft}"
    borderColor: "{colors.hairline}"
  ex-empty-state:
    description: "空状态：等宽眉标 + 一句人话 + 两颗按钮，没有插画。"
    backgroundColor: "{colors.canvas}"
    titleTypography: "{typography.display-md}"
    hintTypography: "{typography.body-sm}"
    hintColor: "{colors.mute}"
  ex-auth-card:
    description: "登录 / 注册卡：外壳上浮一格，一道投影（模态档）。"
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.hairline-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  ex-command-palette:
    description: "命令面板：⌘K 的浮层，等宽眉标分组，选中行是电光绿洗。"
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.hairline-strong}"
    rounded: "{rounded.md}"
    selectedBackground: "{colors.primary-wash}"
    selectedIndicator: "{colors.primary}"
  ex-context-menu:
    description: "右键菜单：紧凑行高 26px，圆角 4px，没有投影只有发丝线。"
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.hairline-strong}"
    rounded: "{rounded.sm}"
    rowHeight: 26px
  ex-import-export:
    description: "导入导出：终端样机里的日志行，成功行用电光绿。"
    backgroundColor: "{colors.canvas-sunken}"
    okColor: "{colors.primary}"
    warnColor: "{colors.warning}"
    errColor: "{colors.danger}"
---

## Overview

这套语言服务的是"编辑一台机器"，不是"逛一个网站"。所以它先把三件事砍掉：**没有第二个强调色**（VoltAgent 的纪律——电光绿只留给"可交互"和"活着"）、**没有投影**（Warp 与 VoltAgent 的共识：层级由 1px 发丝线和表面明度表达）、**没有装饰性渐变**（Ollama 的克制——纸就是纸）。

画布是暖的近黑 `{colors.canvas}`（`#121110`）。这里同时借了两家的判断：VoltAgent 说整站只有一个近黑表面、没有浅色对应物；Warp 说这个黑必须**偏暖**，纯黑会让界面变成一块塑料。`#121110` 的色相角落在 30° 附近、彩度极低，于是它在 OLED 上是一块"有温度的暗"，而不是一个洞。表面只有三级台阶——`canvas` → `canvas-soft` → `canvas-raised`，往下一级是 `canvas-sunken`，给画布和输入框用。

强调色是电光绿 `{colors.primary}`（`#3ddc97`），全系统唯一带彩度的"界面色"。它的用法被严格限制在三处：主 CTA 的填充、焦点环、以及"选中 / 激活"的状态指示。正文永远不吃绿色——绿色是信号，不是油漆。

机器说话的时候用等宽。这是 VoltAgent 的"双字体对比"和 Ollama 的"等宽即文档"合成出来的规则：**凡是"能被敲出来"或"由机器产生"的东西一律等宽**——眉标、ID、日期、计数、类型标签、代码、终端日志、键盘快捷键。凡是人在叙述的东西一律无衬线。这条界线让界面天然带上终端的质感，而不需要把正文也变成代码。

层次靠**发丝线**和**表面明度**。1px 的 `{colors.hairline}` 是这套语言里唯一的"边"，卡片、按钮、输入框、面板分栏、表格行全部用它。唯一允许的投影是模态档（`ex-auth-card` / `ex-command-palette`），因为浮层必须从平面上真的"抬起来"。悬停在卡片上不会抬起，只会换一档表面色。

几何是**紧**的。按钮 4px、卡片 6px、写入框 4px——Warp 的"CTA 从不做胶囊"在这一层继续生效。`{rounded.pill}` 只给状态标签和头像，因为那是"标记"不是"控件"。0px 也是合法值，用在满幅的带子上。

**Key Characteristics:**
- 唯一的彩色界面信号是电光绿 `{colors.primary}`（`#3ddc97`）——只用于主 CTA、焦点、选中指示，绝不用于正文。
- 暖近黑 `{colors.canvas}`（`#121110`）是默认画布；表面只有四级台阶，层级全部由明度差表达。
- 1px 发丝线是唯一的"边"。全系统只有模态档一道投影；卡片悬停不抬起，只换表面色。
- 等宽字承担一切机器语言：眉标（11px / 500 / 1.2px 字距 / 大写）、ID、日期、计数、类型标签、代码、日志、快捷键。
- 圆角只有三档：2px（内联小块）/ 4px（控件）/ 6px（卡片）。胶囊只给状态标签与头像。
- 间距基准 4px，界面密度偏紧（行高 26px），阅读区宽松（正文 15px / 1.6）。
- 三颗终端红黄绿灯只出现在终端样机里，别处一律不用。

## Colors

### Brand & Accent
- **Electric Green** (`{colors.primary}` — `#3ddc97`)：唯一的界面强调色。主 CTA 填充、焦点环、"选中/激活"的指示条与文字。取 VoltAgent 的 `#00d992` 往青绿方向挪了一格，让它落在这个暖画布上时对比更稳（对 `{colors.canvas}` 的对比度 10.4:1）。
- **Primary Hover** (`{colors.primary-hover}` — `#5ee7ae`)：悬停态，提亮而不是压暗。
- **Primary Press** (`{colors.primary-press}` — `#2bbf7f`)：按下态。
- **Primary Dim** (`{colors.primary-dim}` — `#1f8f5f`)：深色面上的次级绿，用于"已发布 / 在线"这类弱提示。
- **Primary Wash** (`{colors.primary-wash}` — `rgba(61,220,151,0.12)`)：选中行的底色。
- **Primary Line** (`{colors.primary-line}` — `rgba(61,220,151,0.32)`)：选中行的边。
- **On Primary** (`{colors.on-primary}` — `#0d1114`)：绿底上的墨色。**不用纯黑**——纯黑压在绿上会有脏边。

### Surface
- **Canvas** (`{colors.canvas}` — `#121110`)：默认画布，界面最大面积的那一层。
- **Canvas Soft** (`{colors.canvas-soft}` — `#1a1917`)：卡片、面板正文、表格表头。
- **Canvas Raised** (`{colors.canvas-raised}` — `#201f1c`)：浮层、命令芯片、悬停态卡片。
- **Canvas Sunken** (`{colors.canvas-sunken}` — `#0d0c0b`)：写入框、画布、终端样机——"凹进去"的表面。

### Line
- **Hairline** (`{colors.hairline}` — `#2c2a27`)：默认的 1px 边。卡片、按钮、输入框、分栏、表格行。
- **Hairline Strong** (`{colors.hairline-strong}` — `#3d3a36`)：需要更明确分隔时（浮层外框、画布轴线、悬停边）。
- **Hairline Soft** (`{colors.hairline-soft}` — `#242220`)：最弱的一道（画布点阵、网格线）。

### Text
- **Ink** (`{colors.ink}` — `#f4f2ee`)：标题与需要读的第一层文字。取 Warp 的 `#f7f5f0` 压 1% 亮度，避免在纯暗面上过曝。
- **Body** (`{colors.body}` — `#c9c5be`)：正文与次级信息。
- **Mute** (`{colors.mute}` — `#8f8b84`)：说明文字、标签、眉标、占位符。
- **Dim** (`{colors.dim}` — `#67635d`)：禁用、计数、时间戳——最低优先级。
- **Ink Mono** (`{colors.ink-mono}` — `#e6e3dd`)：等宽面上的文字，比正文冷半档，让代码块有"另一个表面"的感觉。

### Semantic
只给状态用，不做装饰。语义色在本项目里有真实职责（发布时间冲突、保存失败、危险操作），所以必须存在，但配色纪律要求它们**面积尽量小**。
- **Success** (`{colors.success}` — `#3ddc97`)：与 `{colors.primary}` 同值。这不是偷懒——"成功"和"可交互"在这套语言里是同一件事：系统在告诉你"这里通了"。
- **Warning** (`{colors.warning}` — `#e8b055`)：有改动未发布、可恢复的冲突。
- **Danger** (`{colors.danger}` — `#f0736a`)：删除、不可逆操作、保存失败。
- **Info** (`{colors.info}` — `#7cb7e8`)：唯一的中性提示色，用于系统公告与外部链接。

### Terminal
- **Terminal Red / Yellow / Green** (`#ff5f56` / `#ffbd2e` / `#27c93f`)：macOS 窗口的三颗灯。**只**出现在 `{component.terminal-card}` 的标题栏里，是这套语言里唯一被允许的"怀旧装饰"。别处一律不用。

## Typography

### Font Family
两个面，界线清楚：

1. **Inter**（回退到系统无衬线）——所有叙述性文字：标题、正文、按钮标签、导航、表单标签。字重工作集 400 / 500。中文回落到 PingFang SC / Hiragino Sans GB。
2. **SF Mono**（回退 `ui-monospace` / Menlo / Consolas）——所有机器语言：眉标、ID、日期、计数、类型标签、代码、终端日志、快捷键。字重 400 / 500 / 600；**600 是"强调"的上限**，等宽字一旦到 700 就开始糊。

不引入品牌展示字体。系统字体渲染出来的"原生感"正是这套语言想要的——Ollama 把这一点说得很直接：不选字体也是一种设计决定。

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-lg}` | 32px | 400 | 1.2 | -0.8px | 只读站点的页面主标题 |
| `{typography.display-md}` | 24px | 500 | 1.3 | -0.4px | 区块标题、空状态标题 |
| `{typography.display-sm}` | 18px | 500 | 1.4 | -0.2px | 卡片标题、模态框标题 |
| `{typography.body-md}` | 15px | 400 | 1.6 | 0 | 阅读区正文 |
| `{typography.body-sm}` | 13px | 400 | 1.5 | 0 | 界面基准字号 |
| `{typography.body-sm-strong}` | 13px | 500 | 1.5 | 0 | 强调正文、选中行 |
| `{typography.ui}` | 12.5px | 400 | 1.4 | 0 | 按钮、导航、表单、菜单行 |
| `{typography.eyebrow-mono}` | 11px | 500 | 1.4 | 1.2px | 大写等宽眉标，全系统统一的分组标签 |
| `{typography.caption-mono}` | 11px | 400 | 1.5 | 0 | 计数、时间戳、ID |
| `{typography.code}` | 12px | 400 | 1.6 | 0 | 代码块、终端输出 |
| `{typography.code-strong}` | 12px | 600 | 1.5 | 0 | 代码里的强调、命令行提示符 |

### Principles
- **等宽是"机器在说话"的标记，不是风格。** 眉标、ID、日期、计数一律等宽；叙述一律无衬线。这条界线一旦模糊，界面就会退化成"程序员主题"而不是"终端语言"。
- **界面基准 12.5px，阅读基准 15px。** 编辑器的信息密度要求界面字小；但真正要读的正文必须回到 15px / 1.6，否则长时间阅读会累。
- **大写眉标带 1.2px 字距。** 这是 VoltAgent 的 `2.52px@14px` 按比例收到 11px 的结果（约 0.11em），是这套语言最容易被认出来的记号。
- **不用斜体。** 斜体在等宽字里是伪斜体（渲染器强行倾斜），会破坏网格。强调一律靠字重或颜色。
- **中文不套负字距。** 负字距只给拉丁字母的 display 层级；正文的 `letter-spacing: 0` 对中英混排最安全。

### Note on Font Substitutes
- **Sans** —— *Inter*；未安装时回落到 `-apple-system` / `SF Pro Text` / `PingFang SC` / `system-ui`，度量接近，不需要打包字体文件。
- **Mono** —— *SF Mono*；未安装时回落 `ui-monospace` → Menlo → Consolas → monospace。若要跨平台完全一致，**JetBrains Mono** 或 **Geist Mono** 是最接近的免费替代。

## Layout

### Spacing System
- **Base unit**：4px。
- **Tokens**：`{spacing.xxs}` 2 · `{spacing.xs}` 4 · `{spacing.sm}` 8 · `{spacing.md}` 12 · `{spacing.lg}` 16 · `{spacing.xl}` 24 · `{spacing.2xl}` 32 · `{spacing.3xl}` 48。
- **界面密度**：行高 26px（侧栏行、菜单行）、控件高 30px（按钮、输入框）、顶栏 44px。这些数字比常规 Web 界面紧一档——终端的效率来自"一屏能放多少"。
- **阅读区**：正文 15px / 1.6，段落间距 12px。阅读要松，操作要紧，这两件事互不干扰。

### Grid & Container
- 工作区是**三栏外壳**：顶栏 44px + 侧栏（220–420px 可拖）+ 面板区。分栏靠 1px 发丝线，不靠间隙——外壳没有外边距，界面顶到窗口边缘。
- 只读站点是**单列阅读栏**，内容宽度上限约 760px。这是 Ollama 的"把首页当成 Markdown 文档"的直接借用。
- 卡片网格：桌面 2–4 列，平板 2 列，手机 1 列。

### Whitespace Philosophy
留白分两种，不能混：**操作区**的留白只够"分得开"（8–12px），**阅读区**的留白要够"读得下去"（区块之间 48px）。编辑器里最忌讳的是把营销页的 80px 段间距搬过来——那会让一屏只放得下三个控件。

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | 无边框、无投影 | 满幅的带子、画布背景 |
| 1 — Hairline | 1px `{colors.hairline}` | 默认：卡片、按钮、输入框、分栏、表格行 |
| 2 — Surface shift | 换一档表面色（`canvas-soft` → `canvas-raised`） | 悬停、当前位置、次级容器 |
| 3 — Inset | `canvas-sunken` 表面 + hairline | 写入框、终端样机、画布——"凹进去" |
| 4 — Modal | `0 20px 60px rgba(0,0,0,0.7)` + `0 0 0 1px rgba(148,163,184,0.10) inset` | **仅**模态框与命令面板 |

### Decorative Depth
- **画布点阵**：`{component.ex-graph-canvas}` 用 1px `{colors.hairline}` 的点阵表达"这是一个无限平面"。这是唯一被允许的纹理。
- **颗粒噪声关闭**：上一版语言里的 `--grain` 在终端语言里一律为 0。噪点会污染等宽字的边缘，而等宽字的清晰度就是这套语言的脸。
- **发丝绿分隔**：极少数情况下用 1px `{colors.primary}` 的横线标记"区段边界"（VoltAgent 的 `green-divider-band`），整个项目里不应超过两处。

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | 满幅带子、面板分栏 |
| `{rounded.xxs}` | 2px | 内联代码芯片、命令标签 |
| `{rounded.sm}` | 4px | **默认**：按钮、输入框、导航项、菜单、行 |
| `{rounded.md}` | 6px | 卡片、浮层、模态框、终端样机 |
| `{rounded.pill}` | 9999px | 只给状态标签与头像 |

几何只有三档（2 / 4 / 6），中间不插值。**胶囊不做控件**——Warp 的规则：CTA 的半径必须紧，胶囊会让界面立刻变"消费级"。

## Components

### Buttons
- **`button-primary`** —— 电光绿填充的主动作。背景 `{colors.primary}`、字色 `{colors.on-primary}`、`{typography.ui}`、高 30px、圆角 `{rounded.sm}` 4px。**每个视口最多一颗**（含顶栏），这是 Ollama 的"黑色胶囊每屏一颗"纪律。
- **`button-secondary`** —— 描边按钮。`canvas-soft` 底 + 1px `{colors.hairline}` + `{colors.ink}` 字。工具区、次级动作。
- **`button-ghost`** —— 无底无边，`{colors.body}` 字。悬停只换字色与表面色，不加边框。
- **`button-danger`** —— 只给字色 `{colors.danger}` + 30% 透明度的红边。删除、不可逆操作。
- 按下状态统一 `transform: scale(0.97)`；禁用统一 45% 不透明度 + `not-allowed`。

### Inputs & Forms
- **`text-input`** —— `canvas-sunken` 底（凹进去）+ 1px `{colors.hairline}` + `{colors.ink}` 字 + `{typography.ui}`。
- **`text-input-focus`** —— 边换成 `{colors.primary}` + `0 0 0 2px {colors.primary-wash}` 的环。焦点是唯一允许绿色出现而元素本身不是"激活"的地方。
- 搜索框沿用同一语法，前面加一个等宽放大镜符号而不是图标字体。

### Cards & Containers
- **`card`** —— `canvas-soft` 底 + 1px `{colors.hairline}` + `{rounded.md}` 6px + `{spacing.lg}` 内边距。默认没有投影。
- **`card-interactive`** —— 悬停时边换成 `{colors.hairline-strong}`、底换成 `{colors.canvas-raised}`。**不抬起、不位移。**
- **`card-selected`** —— 底换成 `{colors.primary-wash}`、边换成 `{colors.primary-line}`，左侧加一条 2px 的电光绿指示条。这是"选中"在整套语言里唯一的表达。
- **`panel`** —— 满幅容器，靠 1px 发丝线分栏，圆角 0。
- **`terminal-card`** —— 终端样机：`canvas-sunken` 底 + 发丝边 + 标题栏三颗灯 + `{typography.code}` 正文。

### Data
- **`data-table-head`** —— `canvas-soft` 底 + `{colors.mute}` 字 + `{typography.eyebrow-mono}`（大写、1.2px 字距）。表头永远等宽大写，这是"数据面"和"内容面"的分界记号。
- **`data-table-cell`** —— `{colors.ink}` 字 + `{typography.body-sm}` + 1px `{colors.hairline}` 行分隔。数字列右对齐并用等宽。
- **`status-pill`** —— `{rounded.pill}` + `{typography.eyebrow-mono}`。只装状态词（草稿 / 已发布 / 隐藏），不装动作。

### Navigation
- **`nav-bar`** —— 高 44px，`{colors.canvas}` 实底（**不做毛玻璃**——毛玻璃是上一版语言的手法，终端界面不该有透明度），底边 1px `{colors.hairline}`。
- **`nav-link`** —— `{colors.mute}` 字，悬停转 `{colors.ink}` 并给 `{colors.canvas-raised}` 底。
- **`nav-link-active`** —— `canvas-raised` 底 + `{colors.ink}` 字 + 底边 2px `{colors.primary}` 指示条。

### Signature Components
- **`ex-command-palette`** —— ⌘K 命令面板。`canvas-raised` 底 + `hairline-strong` 边 + 模态档投影。分组标题用 `{typography.eyebrow-mono}`，选中行是 `{colors.primary-wash}` + 左侧 2px 电光绿条。
- **`ex-timeline-canvas`** —— 时间线。`canvas-sunken` 底，轴线是 1px `{colors.hairline-strong}`，事件点是实心圆，选中转 `{colors.primary}`。
- **`ex-graph-canvas`** —— 世界图谱。点阵底纹 + 方块节点（发丝边 + `canvas-raised` 填充），选中转电光绿描边。
- **`ex-empty-state`** —— 空状态。等宽大写眉标 + 一行 24px 标题 + 一句 `{colors.mute}` 说明 + 两颗按钮。**不用插画**——VoltAgent 的营销面明确没有插画系统，这里保持一致。

## Do's and Don'ts

### Do
- 把 `{colors.primary}`（`#3ddc97`）只用在主 CTA、焦点环、选中指示三处。它是信号，不是主题色。
- 用 1px `{colors.hairline}` 表达所有的边。层次来自明度，不来自投影。
- 让等宽字承担一切机器语言：眉标、ID、日期、计数、类型标签、代码、日志、快捷键。
- 圆角只用 2 / 4 / 6 三档；`{rounded.pill}` 只给状态标签和头像。
- 界面紧（26px 行高 / 30px 控件），阅读松（15px / 1.6）。
- 悬停只换表面色与边色，绝不位移、绝不抬起。

### Don't
- 不要引入第二个界面强调色。世界自己的主色只能出现在**内容**里（纪元色带、类型徽标），不能变成按钮或链接的颜色。
- 不要把 `{colors.primary}` 用作正文填充色。它是 CTA-only。
- 不要给卡片加投影。全项目只有模态档一道投影。
- 不要做装饰性渐变、毛玻璃、氛围光。终端界面不发光。
- 不要在正文里用斜体。等宽字的伪斜体会破坏网格；强调靠字重和颜色。
- 不要把胶囊用在控件上。按钮半径一旦到 9999px，这套语言就塌了。
- 不要把颗粒噪点打开。它污染等宽字的边缘，而清晰度是这套语言的脸。

## Implementation Notes

本项目的落地方式是**语义 token 重映射 + 关键组件覆写**，而不是重写全部 CSS：

1. 底层的 `minimal.css` 把全站组件都指向 `--mn-*` 这一套语义 token；`workspace.css` / `site.css` / `relationship.css` 里的历史 token（`--panel` / `--line` / `--ink`）在 `minimal.css` 里被别名到了 `--mn-*`。
2. 因此 `terminal.css` 只要在 `:root` 里重定义 `--mn-*`（以及 `--ap-*` 别名），全站的表面 / 墨色 / 边 / 圆角 / 字体就会整体翻过来。
3. 剩下需要逐个覆写的是三类：把**旧语言的硬编码值**（Apple 的 Action Blue、`#0066cc` 系列）换掉；把**机器语言的元素**换成等宽（眉标、表头、计数）；把**旧的毛玻璃与投影**关掉。
4. 加载顺序恒定为 `… → apple.css → terminal.css → polish.css`，`terminal.css` 覆盖颜色与几何，`polish.css` 保留动效。

## Known Gaps

- **不打包字体**。Inter / SF Mono 走系统回落，跨平台会有轻微度量差异；要点是"等宽 vs 无衬线的角色分工"而不是某个具体字体。
- **浅色世界主题**。世界可以把 `theme.mode` 设成 `light`，此时表面台阶会整体反相（见 `{component.ex-readonly-site}` 的实现）。反相后的对比度经过人工校验，但没有做完整的 WCAG 全量扫描。
- **打印样式**未覆盖。本项目是编辑器，没有打印路径。
- **终端三颗灯**只是装饰，不是控件——不要给它们加点击行为。
