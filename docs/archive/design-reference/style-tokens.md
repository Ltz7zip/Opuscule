# 样式采样（computed style）

> 采集方式：对关键选择器读取 `getComputedStyle`。
> **重要前提**：采样视口约 968 × 750 CSS px（窄视口）；**尺寸类数值（宽/高）随视口变化，不可当固定规格**。字号/字重/行高/颜色相对稳定，可作参照。
> 本页是**深色主题**的采样。浅色主题已于 2026-10-13 补齐，双主题对齐表见 [design-tokens.md](./design-tokens.md)。

## 1. 关键元素

| 元素 | 选择器 | 尺寸 (w×h) | font-size | weight | line-height | 文本色 | 背景色 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 根 | `body` | 968 × 750 | 16px | 400 | normal | — | `#191919` |
| 侧边栏壳 | `.notion-sidebar-container` | 270 × 750 | 16px | 400 | 24px | `#F0EFED` | `#202020` |
| 侧边栏本体 | `.notion-sidebar` | 270 × 750 | 16px | 400 | 24px | `#F0EFED` | 透明 |
| 顶栏 | `.notion-topbar` | 698 × 44 | 16px | 400 | 24px | `#F0EFED` | 透明 |
| 正文容器 | `.notion-frame` | 698 × 706 | 16px | 400 | 24px | `#F0EFED` | `#191919` |
| 滚动容器 | `.notion-scroller` | 270 × 594 | 16px | **500** | 24px | `#BCBAB6` | 透明 |
| 块列表 | `.notion-page-content` | 491 × 609 | 16px | 400 | 24px | `#F0EFED` | 透明 |
| 文本块 | `.notion-text-block` | 491 × 112 | 16px | 400 | 24px | `#F0EFED` | 透明 |
| 数据库 | `.notion-collection_view-block` | 223 × 305 | 16px | 400 | 24px | `#F0EFED` | 透明 |
| 表头单元格 | `.notion-table-view-header-cell` | 276 × 36 | **14px** | 400 | **21px** | `#ADA9A3` | 透明 |
| 数据单元格 | `.notion-table-view-cell` | 275 × 37 | 16px | 400 | 24px | `#F0EFED` | 透明 |

## 2. 从采样反推出的颜色 token

| 角色 | 值 | 出处 |
| --- | --- | --- |
| 画布底色 | `#191919` | `body` / `.notion-frame` 背景 |
| 侧边栏底色 | `#202020` | `.notion-sidebar-container` 背景 |
| 主文本 | `#F0EFED` | 正文、单元格、顶栏 |
| 次级文本 | `#ADA9A3` | 表头单元格 |
| 三级/弱文本 | `#BCBAB6` | 侧边栏滚动区 |
| 边框/分割 | 未采到显式值 | 采样元素多为 `transparent`，Notion 靠极低对比的 `border` / `box-shadow` 分层 |

要点：
- **对比度刻意压低**，正文与次级的差值很小（`#F0EFED` → `#ADA9A3`），层级主要靠字重和留白撑，不靠颜色。
- 侧边栏比画布**还亮一档**（`#202020` > `#191919`），是"浮起"而非"凹陷"。

## 3. 字号 / 行高尺度（已观测部分）

| 角色 | font-size | line-height | weight | 出处 |
| --- | --- | --- | --- | --- |
| 页面大标题 | 40px | — | 700 | 引导页 `h1`「从电脑桌面端开始吧！」 |
| 正文 / 单元格 | 16px | 24px | 400 | `.notion-text-block`、`.notion-table-view-cell` |
| 表头 / 辅助文字 | 14px | 21px | 400 | `.notion-table-view-header-cell` |

> 未采到 H2/H3/引用/代码块等的完整尺度。规律是 **1.5 倍行高**（16/24、14/21），复刻时可直接沿用这个比值。

## 4. 明确不可用的数据

| 项 | 情况 |
| --- | --- |
| `font-family` | 本环境解析结果被归一到 `sans-serif`，**不可信**。Notion 实际用的是自己的无衬线字体栈（含 `ui-sans-serif` / `-apple-system` / `Segoe UI` 等），本次未取到真值 |
| 尺寸/间距（padding/margin/圆角） | 采样元素圆角普遍为 `0px`，间距由无名容器承担；未逐层采样。建议复刻时**不看数值、看比例关系** |
| 浅色主题 | 已补齐，见 [design-tokens.md](./design-tokens.md) |
| 未采样页面 | 看板/日历/画廊/时间线视图、协作状态、版本历史 |

## 5. 对复刻的启示

1. **Notion 的视觉是"低对比 + 大字距比"**：16px 正文配 24px 行高、14px 辅助配 21px，1.5 倍行高是硬规律，套到我们自己的 token 体系里也成立。
2. **层级靠字重与留白，不靠颜色**：主/次文本色差极小。这一点和我们 `DESIGN.md` 里"用颜色表示层级"的思路相反——如果要复现 Notion 的克制感，需要克制配色。
3. **侧边栏比画布亮**：`#202020` vs `#191919`，只有 7 级灰度差。反观我们现有方案（`#0a0e12` 近纯黑 + 青绿强调），风格差异很大，属于**两套设计语言**，不能直接混用。
