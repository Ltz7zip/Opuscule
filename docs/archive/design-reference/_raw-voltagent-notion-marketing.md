# 归档：VoltAgent 的 Notion 设计语言分析（**营销面，不是产品面**）

> **来源**：<https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md>
> **抓取**：2026-10-13，经 `raw.githubusercontent.com` 取原始文件；原始内容 488 行，**未做任何修改**，附在分隔线之后。

## 这份文件是什么

它分析的是 **notion.com 官网营销页**——首页 / 企业版 / Product AI / Product Agents / Startups / Pricing 六个页面，**不是产品界面**。文首 `version: alpha`、自述 "design-analysis"，是自动生成的设计分析，不是 Notion 官方规范。

## 它是"另一面"：我们核对过

把它的色值逐个丢进 Notion 产品 CSS 里查证：

| 本文档的 token | 值 | 在 Notion 产品 CSS 里 |
| --- | --- | --- |
| `primary`（主 CTA 紫） | `#5645d4` | ❌ 不存在 |
| `brand-navy`（hero 深蓝） | `#0a1530` | ❌ 不存在 |
| `link-blue` | `#0075de` | ❌ 不存在 |
| `charcoal` | `#37352f` | ✅ 以 `rgba(55,53,47,…)` 出现 **17 次** |
| — | `#2383e2` / `#191919` / `#f0efed`（产品实际用色） | ✅ 产品在用，但本文档里**一个都没有** |

**结论：Notion 有意做了品牌 / 产品分离**——官网 CTA 用**紫**，产品内强调色用**蓝**；官网 hero 是深蓝，产品画布是 `#191919`。
我们走的是"产品那一面"，取值一律以 [design-tokens.md](./design-tokens.md) 的实测为准，**不要拿本文档替换产品 token**。

## 它能用的三处

1. **`charcoal: #37352f` 是一次独立交叉验证**——正好等于我们从产品 CSS 挖出的暖调基准 `rgba(55,53,47,…)`。
2. **柔和卡片色板**（peach / rose / mint / lavender / sky / yellow）：文档自述 "echoing the live product database properties"，即它**衍生于**产品标签色，可当标签色板的"亮色 / 营销"对应物。
3. **几何结论一致**：按钮 8px（原文强调 "NOT pills"）、卡片 12px，与实测的 4 / 6 / 12 同一套思路。

## 用途

要复刻 **Notion 官网**（落地页 / 定价页 / 企业版页）时，从这份文件起步最合适。**产品工作区的 UI 复刻不要用它。**

---

<!-- 以下为原始文件内容，未做任何修改 -->

---
version: alpha
name: Notion-design-analysis
description: Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice — anchored by a deep navy hero band ({colors.brand-navy}) decorated with brand-colored sticky-note dots and mesh wire illustrations, a signature purple pill primary CTA ({colors.primary}), and a rich palette of pastel-tinted feature cards that echo the colorful database properties of the live product. The system uses a Notion-Sans (Inter-based) typeface across every UI surface, anchors a 4-tier pricing comparison (Free / Plus / Business / Enterprise), and presents the live workspace UI mockup directly inside the hero band. Coverage spans homepage, Enterprise, Product AI, Product Agents, Startups, and Pricing surfaces.

colors:
 primary: "#5645d4"
 primary-pressed: "#4534b3"
 primary-deep: "#3a2a99"
 on-primary: "#ffffff"
 brand-navy: "#0a1530"
 brand-navy-deep: "#070f24"
 brand-navy-mid: "#1a2a52"
 link-blue: "#0075de"
 link-blue-pressed: "#005bab"
 brand-orange: "#dd5b00"
 brand-orange-deep: "#793400"
 brand-pink: "#ff64c8"
 brand-pink-deep: "#a02e6d"
 brand-purple: "#7b3ff2"
 brand-purple-300: "#d6b6f6"
 brand-purple-800: "#391c57"
 brand-teal: "#2a9d99"
 brand-green: "#1aae39"
 brand-yellow: "#f5d75e"
 brand-brown: "#523410"
 card-tint-peach: "#ffe8d4"
 card-tint-rose: "#fde0ec"
 card-tint-mint: "#d9f3e1"
 card-tint-lavender: "#e6e0f5"
 card-tint-sky: "#dcecfa"
 card-tint-yellow: "#fef7d6"
 card-tint-yellow-bold: "#f9e79f"
 card-tint-cream: "#f8f5e8"
 card-tint-gray: "#f0eeec"
 canvas: "#ffffff"
 surface: "#f6f5f4"
 surface-soft: "#fafaf9"
 hairline: "#e5e3df"
 hairline-soft: "#ede9e4"
 hairline-strong: "#c8c4be"
 ink-deep: "#000000"
 ink: "#1a1a1a"
 charcoal: "#37352f"
 slate: "#5d5b54"
 steel: "#787671"
 stone: "#a4a097"
 muted: "#bbb8b1"
 on-dark: "#ffffff"
 on-dark-muted: "#a4a097"
 semantic-success: "#1aae39"
 semantic-warning: "#dd5b00"
 semantic-error: "#e03131"

typography:
 hero-display:
 fontFamily: Notion Sans
 fontSize: 80px
 fontWeight: 600
 lineHeight: 1.05
 letterSpacing: -2px
 display-lg:
 fontFamily: Notion Sans
 fontSize: 56px
 fontWeight: 600
 lineHeight: 1.10
 letterSpacing: -1px
 heading-1:
 fontFamily: Notion Sans
 fontSize: 48px
 fontWeight: 600
 lineHeight: 1.15
 letterSpacing: -0.5px
 heading-2:
 fontFamily: Notion Sans
 fontSize: 36px
 fontWeight: 600
 lineHeight: 1.20
 letterSpacing: -0.5px
 heading-3:
 fontFamily: Notion Sans
 fontSize: 28px
 fontWeight: 600
 lineHeight: 1.25
 heading-4:
 fontFamily: Notion Sans
 fontSize: 22px
 fontWeight: 600
 lineHeight: 1.30
 heading-5:
 fontFamily: Notion Sans
 fontSize: 18px
 fontWeight: 600
 lineHeight: 1.40
 subtitle:
 fontFamily: Notion Sans
 fontSize: 18px
 fontWeight: 400
 lineHeight: 1.50
 body-md:
 fontFamily: Notion Sans
 fontSize: 16px
 fontWeight: 400
 lineHeight: 1.55
 body-md-medium:
 fontFamily: Notion Sans
 fontSize: 16px
 fontWeight: 500
 lineHeight: 1.55
 body-sm:
 fontFamily: Notion Sans
 fontSize: 14px
 fontWeight: 400
 lineHeight: 1.50
 body-sm-medium:
 fontFamily: Notion Sans
 fontSize: 14px
 fontWeight: 500
 lineHeight: 1.50
 caption:
 fontFamily: Notion Sans
 fontSize: 13px
 fontWeight: 400
 lineHeight: 1.40
 caption-bold:
 fontFamily: Notion Sans
 fontSize: 13px
 fontWeight: 600
 lineHeight: 1.40
 micro:
 fontFamily: Notion Sans
 fontSize: 12px
 fontWeight: 500
 lineHeight: 1.40
 micro-uppercase:
 fontFamily: Notion Sans
 fontSize: 11px
 fontWeight: 600
 lineHeight: 1.40
 letterSpacing: 1px
 button-md:
 fontFamily: Notion Sans
 fontSize: 14px
 fontWeight: 500
 lineHeight: 1.30

rounded:
 xs: 4px
 sm: 6px
 md: 8px
 lg: 12px
 xl: 16px
 xxl: 20px
 xxxl: 24px
 full: 9999px

spacing:
 xxs: 4px
 xs: 8px
 sm: 12px
 md: 16px
 lg: 20px
 xl: 24px
 xxl: 32px
 xxxl: 40px
 section-sm: 48px
 section: 64px
 section-lg: 96px
 hero: 120px

components:
 button-primary:
 backgroundColor: "{colors.primary}"
 textColor: "{colors.on-primary}"
 typography: "{typography.button-md}"
 rounded: "{rounded.md}"
 padding: "10px 18px"
 button-primary-pressed:
 backgroundColor: "{colors.primary-pressed}"
 textColor: "{colors.on-primary}"
 button-primary-disabled:
 backgroundColor: "{colors.hairline}"
 textColor: "{colors.muted}"
 button-dark:
 backgroundColor: "{colors.ink-deep}"
 textColor: "{colors.on-dark}"
 typography: "{typography.button-md}"
 rounded: "{rounded.md}"
 padding: "10px 18px"
 button-secondary:
 backgroundColor: "transparent"
 textColor: "{colors.ink}"
 typography: "{typography.button-md}"
 rounded: "{rounded.md}"
 padding: "10px 18px"
 border: "1px solid {colors.hairline-strong}"
 button-on-dark:
 backgroundColor: "{colors.on-dark}"
 textColor: "{colors.ink}"
 typography: "{typography.button-md}"
 rounded: "{rounded.md}"
 padding: "10px 18px"
 button-secondary-on-dark:
 backgroundColor: "transparent"
 textColor: "{colors.on-dark}"
 typography: "{typography.button-md}"
 rounded: "{rounded.md}"
 padding: "10px 18px"
 border: "1px solid {colors.on-dark-muted}"
 button-ghost:
 backgroundColor: "transparent"
 textColor: "{colors.ink}"
 typography: "{typography.button-md}"
 rounded: "{rounded.sm}"
 padding: "8px 12px"
 button-link:
 backgroundColor: "transparent"
 textColor: "{colors.link-blue}"
 typography: "{typography.body-sm-medium}"
 padding: "0"
 card-base:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xl}"
 border: "1px solid {colors.hairline}"
 card-feature:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 border: "1px solid {colors.hairline}"
 card-feature-yellow-bold:
 backgroundColor: "{colors.card-tint-yellow-bold}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-peach:
 backgroundColor: "{colors.card-tint-peach}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-rose:
 backgroundColor: "{colors.card-tint-rose}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-mint:
 backgroundColor: "{colors.card-tint-mint}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-sky:
 backgroundColor: "{colors.card-tint-sky}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-lavender:
 backgroundColor: "{colors.card-tint-lavender}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-yellow:
 backgroundColor: "{colors.card-tint-yellow}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-feature-cream:
 backgroundColor: "{colors.card-tint-cream}"
 textColor: "{colors.charcoal}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 card-agent-tile:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xl}"
 border: "1px solid {colors.hairline}"
 card-template:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.lg}"
 border: "1px solid {colors.hairline}"
 card-startup-perk:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xl}"
 border: "1px solid {colors.hairline}"
 pricing-card:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 border: "1px solid {colors.hairline}"
 pricing-card-featured:
 backgroundColor: "{colors.surface}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 border: "2px solid {colors.primary}"
 text-input:
 backgroundColor: "{colors.canvas}"
 textColor: "{colors.ink}"
 typography: "{typography.body-md}"
 rounded: "{rounded.md}"
 padding: "{spacing.sm} {spacing.md}"
 border: "1px solid {colors.hairline-strong}"
 height: 44px
 text-input-focused:
 backgroundColor: "{colors.canvas}"
 textColor: "{colors.ink}"
 border: "2px solid {colors.primary}"
 search-pill:
 backgroundColor: "{colors.surface}"
 textColor: "{colors.steel}"
 typography: "{typography.body-md}"
 rounded: "{rounded.md}"
 padding: "{spacing.sm} {spacing.md}"
 height: 44px
 border: "1px solid {colors.hairline}"
 pill-tab:
 backgroundColor: "transparent"
 textColor: "{colors.steel}"
 typography: "{typography.body-sm-medium}"
 rounded: "{rounded.full}"
 padding: "{spacing.xs} {spacing.md}"
 border: "1px solid {colors.hairline}"
 pill-tab-active:
 backgroundColor: "{colors.ink-deep}"
 textColor: "{colors.on-dark}"
 rounded: "{rounded.full}"
 border: "1px solid {colors.ink-deep}"
 segmented-tab:
 backgroundColor: "transparent"
 textColor: "{colors.steel}"
 typography: "{typography.body-sm-medium}"
 padding: "{spacing.sm} {spacing.md}"
 border: "0 0 2px transparent solid"
 segmented-tab-active:
 backgroundColor: "transparent"
 textColor: "{colors.ink}"
 typography: "{typography.body-sm-medium}"
 border: "0 0 2px {colors.ink} solid"
 badge-purple:
 backgroundColor: "{colors.primary}"
 textColor: "{colors.on-primary}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.full}"
 padding: "4px 10px"
 badge-pink:
 backgroundColor: "{colors.brand-pink}"
 textColor: "{colors.on-primary}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.full}"
 padding: "4px 10px"
 badge-orange:
 backgroundColor: "{colors.brand-orange}"
 textColor: "{colors.on-primary}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.full}"
 padding: "4px 10px"
 badge-tag-purple:
 backgroundColor: "{colors.card-tint-lavender}"
 textColor: "{colors.brand-purple-800}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.sm}"
 padding: "2px 8px"
 badge-tag-orange:
 backgroundColor: "{colors.card-tint-peach}"
 textColor: "{colors.brand-orange-deep}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.sm}"
 padding: "2px 8px"
 badge-tag-green:
 backgroundColor: "{colors.card-tint-mint}"
 textColor: "{colors.brand-green}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.sm}"
 padding: "2px 8px"
 badge-popular:
 backgroundColor: "{colors.primary}"
 textColor: "{colors.on-primary}"
 typography: "{typography.caption-bold}"
 rounded: "{rounded.full}"
 padding: "4px 10px"
 promo-banner:
 backgroundColor: "{colors.surface}"
 textColor: "{colors.ink}"
 typography: "{typography.body-sm-medium}"
 padding: "{spacing.sm} {spacing.md}"
 hero-band-dark:
 backgroundColor: "{colors.brand-navy}"
 textColor: "{colors.on-dark}"
 rounded: "0"
 padding: "{spacing.hero}"
 workspace-mockup-card:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "0"
 border: "1px solid {colors.hairline}"
 shadow: "rgba(15, 15, 15, 0.2) 0px 24px 48px -8px"
 cta-banner-light:
 backgroundColor: "{colors.surface}"
 textColor: "{colors.ink}"
 rounded: "{rounded.lg}"
 padding: "{spacing.section}"
 comparison-table:
 backgroundColor: "{colors.canvas}"
 textColor: "{colors.ink}"
 typography: "{typography.body-sm}"
 rounded: "{rounded.md}"
 border: "1px solid {colors.hairline}"
 comparison-row:
 backgroundColor: "{colors.canvas}"
 textColor: "{colors.ink}"
 padding: "{spacing.md} {spacing.lg}"
 border: "0 0 1px {colors.hairline-soft} solid"
 testimonial-card:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.lg}"
 padding: "{spacing.xxl}"
 border: "1px solid {colors.hairline}"
 logo-wall-item:
 backgroundColor: "transparent"
 textColor: "{colors.steel}"
 typography: "{typography.body-md-medium}"
 padding: "{spacing.lg}"
 faq-accordion-item:
 backgroundColor: "{colors.canvas}"
 rounded: "{rounded.md}"
 padding: "{spacing.xl}"
 border: "0 0 1px {colors.hairline} solid"
 stat-row:
 backgroundColor: "{colors.surface}"
 textColor: "{colors.ink}"
 rounded: "{rounded.lg}"
 padding: "{spacing.section-sm}"
 footer-region:
 backgroundColor: "{colors.canvas}"
 textColor: "{colors.charcoal}"
 typography: "{typography.body-sm}"
 padding: "{spacing.section} {spacing.xxl}"
 border: "1px solid {colors.hairline}"
 footer-link:
 backgroundColor: "transparent"
 textColor: "{colors.steel}"
 typography: "{typography.body-sm}"
 padding: "{spacing.xxs} 0"
---

## Overview

Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice. The homepage opens with **"Meet the night shift."** rendered centered over a deep navy hero band ({colors.brand-navy}), decorated with brand-colored sticky-note dots and mesh wire illustrations scattered around the headline. The signature **purple pill primary CTA** ({colors.primary}) "Get Notion free" sits at the visual center, paired with an outlined "Request a demo" secondary. Below the buttons, a real Notion workspace UI mockup card (the "Ramp HQ" kanban board) breaks out of the hero band with a deep diffuse drop shadow.

Below the hero, the page cycles through a distinctive sequence of feature sections: a dense sticky-note "Keep work moving 24/7" panel with red/blue/green/purple/teal status icons; a **bold yellow** ({colors.card-tint-yellow-bold}) "Ask your on-demand assistants" banner card flanked by orange/rose/mint pastel feature tiles showing assistant UI mockups; and a "Bring all your work together" 3-column grid with brand-colored mockups (sky-blue tutorial card, light Notion calendar, brown/rust testimonial slate). The pricing page renders 4 tiers (Free / Plus / Business / Enterprise) horizontally with one tier featured (purple-bordered) and a dense feature comparison table running below.

The system uses a Notion-Sans typeface (Inter-based) across every UI surface — humanist-geometric character that pairs naturally with the colorful illustrations. Buttons are `{rounded.md}` (8px) rectangles, NOT pills — distinguishing Notion's sober rectangular geometry from competitors that use pills universally. Cards use `{rounded.lg}` (12px) consistently.

**Key Characteristics:**
- Deep navy hero band ({colors.brand-navy}) with scattered sticky-note dots + mesh wire decorative illustrations
- **Signature purple pill** ({colors.primary}) primary CTA — Notion's recognizable "Get Notion free" button color
- Real Notion workspace UI mockup card embedded in the hero with deep drop shadow
- Bold yellow feature banner ({colors.card-tint-yellow-bold}) for high-emphasis content sections
- Pastel feature card palette (peach, rose, mint, lavender, sky, yellow) echoing the live product database properties
- Notion-Sans (Inter-based) across every UI surface
- 8px-rounded buttons (NOT pills), 12px-rounded cards — sober editorial geometry
- 4-tier pricing comparison with dense feature table
- Centered hero layout (different from the left-aligned norm of most B2B SaaS)

## Colors

> Source pages: notion.com/ (homepage), /enterprise, /product/ai, /product/agents, /startups, /pricing. Token coverage was identical across all six pages.

### Brand & Primary
- **Notion Purple** ({colors.primary}): Signature primary CTA color — the unmistakable "Get Notion free" pill button. Reserved for the dominant CTA only.
- **Purple Pressed** ({colors.primary-pressed}): Pressed-state variant
- **Purple Deep** ({colors.primary-deep}): Deeper variant for emphasis
- **Brand Navy** ({colors.brand-navy}): Hero band background — deep navy
- **Brand Navy Deep** ({colors.brand-navy-deep}): Deeper navy for promo banner
- **Brand Navy Mid** ({colors.brand-navy-mid}): Mid-spectrum navy
- **Link Blue** ({colors.link-blue}): Inline text link blue (NOT primary CTA)
- **Link Blue Pressed** ({colors.link-blue-pressed}): Pressed-state link blue

### Brand Color Spectrum (echoes live product database properties)
- **Brand Pink** ({colors.brand-pink}): Pink accent
- **Brand Pink Deep** ({colors.brand-pink-deep}): Deeper pink
- **Brand Orange** ({colors.brand-orange}): Orange accent
- **Brand Orange Deep** ({colors.brand-orange-deep}): Deeper orange-rust
- **Brand Purple** ({colors.brand-purple}): Purple accent variant
- **Brand Purple 300** ({colors.brand-purple-300}): Light purple
- **Brand Purple 800** ({colors.brand-purple-800}): Deep purple for tag text
- **Brand Teal** ({colors.brand-teal}): Teal accent
- **Brand Green** ({colors.brand-green}): Bright green
