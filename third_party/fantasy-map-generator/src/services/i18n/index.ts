// 中文界面：宿主页面里 FMG 自带的英文文案，运行时按词典就地换成中文。
//
// 为什么是运行时词典，而不是改源码：FMG 没有 i18n 框架，界面文案硬编码散落在几百个
// 文件里（菜单、面板、对话框、提示…），逐个改源码既不可维护、也没法跟着上游升级。
// 这里换一个思路 —— **只翻「外壳」，不翻「内容」**：
//
//   * 翻：侧栏 / 面板 / 对话框 / 按钮 / 悬停提示 / 图例 / 比例尺（CHROME_ROOTS 之内）；
//   * 不翻：地图本身的东西 —— 地名标签、数据里的名称（svg#map 子树的普通节点一律不碰）。
//
// 键是英文原文（与源码逐字一致），值是中文；命中才换，没命中保留英文。词典可以先粗
// 后细地长，不会因为漏词把界面弄坏。zh.json 由 `tools/extract_ui_strings.mjs` 收词 +
// 人工/模型翻译维护。
import { hostContext, isHosted } from "@/services/hosted";
import dictionary from "./zh.json";

const MESSAGES = dictionary as Record<string, string>;

/** 允许被翻译的外壳容器。三条刻意不在其内：
 *  * `svg#map` —— 地名与图形；
 *  * `#legend` —— 图例条目取自 pack（政权名、文化名、生物群系名…），是内容不是外壳；
 *  * `#notes` —— 笔记正文是用户/世界生成的内容，翻它等于改数据。
 *  `#scaleBar` 只放数字与单位，留着。 */
const CHROME_ROOTS = [
  "#optionsContainer",
  "#dialogs",
  "#tooltip",
  "#mapOverlay",
  "#exitCustomization",
  "#assistantBubble",
  "#scaleBar"
].join(",");

/** 文案也藏在这些属性里（悬停提示、占位符、无障碍标签） */
const ATTRIBUTES = ["data-tip", "title", "placeholder", "aria-label"] as const;

/** 可以出现在「一个词里面」的内联标记（FMG 拿它给快捷键字母加下划线） */
const INLINE_MARKUP = new Set(["u", "b", "i", "em", "strong", "span", "s", "small", "sup", "sub", "br"]);

let started = false;

// --------------------------------------------------------------------------- //
// 词典：精确条目 + 带 `{}` 占位符的模式
//
// 精确条目：键就是界面上的原文。带占位符的模式：键里用 `{}` 表示「运行时才知道的
// 那一段」（`{}: click to toggle, drag to raise or lower the layer`），译文里同样
// 用 `{}` 留位。匹配时把捕获到的片段单独再查一次精确条目 —— 所以图层那行的提示会
// 变成「高程图：点击切换…」而不是「Heightmap：点击切换…」。
// --------------------------------------------------------------------------- //

interface PatternRule {
  /** 原文被占位符切开的静态片段，比占位符多一段 */
  segments: string[];
  /** 译文的静态片段，与 segments 一一对应 */
  translation: string[];
}

/** 模式按「前 8 个字符」和「后 8 个字符」双索引，避免每次遍历整本词典 */
const PATTERN_INDEX = new Map<string, PatternRule[]>();
/** 单个占位符捕获过长的内容就别猜了 —— 那多半是地图数据，不是外壳文案 */
const MAX_CAPTURE = 60;

function indexPattern(rule: PatternRule): void {
  const { segments } = rule;
  const anchors = [segments[0], segments[segments.length - 1]];
  for (const anchor of anchors) {
    const text = anchor.trim();
    if (text.length < 2) continue;
    for (const key of [text.slice(0, 8), text.slice(-8)]) {
      const bucket = PATTERN_INDEX.get(key);
      if (bucket) bucket.push(rule);
      else PATTERN_INDEX.set(key, [rule]);
    }
  }
}

function buildPatterns(): void {
  for (const [key, value] of Object.entries(MESSAGES)) {
    if (!key.includes("{}")) continue;
    const segments = key.split("{}");
    const translation = value.split("{}");
    // 译文里的占位符数量必须与原文一致，否则位置对不上，宁可不翻
    if (translation.length !== segments.length) continue;
    indexPattern({ segments, translation });
  }
}

/** 把一条模式套到文本上；成功返回各占位符捕获到的片段 */
function captureSegments(rule: PatternRule, text: string): string[] | null {
  const { segments } = rule;
  const parts: string[] = [];
  let rest = text;

  if (segments[0]) {
    if (!rest.startsWith(segments[0])) return null;
    rest = rest.slice(segments[0].length);
  }

  for (let index = 1; index < segments.length; index++) {
    const next = segments[index];
    const isLast = index === segments.length - 1;
    if (!next) {
      parts.push(rest);
      rest = "";
      continue;
    }
    if (isLast) {
      if (!rest.endsWith(next)) return null;
      parts.push(rest.slice(0, rest.length - next.length));
      rest = "";
    } else {
      const at = rest.indexOf(next);
      if (at < 0) return null;
      parts.push(rest.slice(0, at));
      rest = rest.slice(at + next.length);
    }
  }
  return parts.length === segments.length - 1 ? parts : null;
}

function translatePattern(text: string): string | null {
  const key = text.trim();
  if (key.length < 12) return null;

  const candidates = new Set<PatternRule>();
  for (const anchor of [key.slice(0, 8), key.slice(-8)]) {
    const bucket = PATTERN_INDEX.get(anchor);
    if (bucket) for (const rule of bucket) candidates.add(rule);
  }

  for (const rule of candidates) {
    const parts = captureSegments(rule, key);
    if (!parts || parts.some(part => part.length > MAX_CAPTURE)) continue;
    // 捕获到的片段单独查一次精确条目；查不到就原样保留（多半是专名或地图数据）
    const filled = parts.map(part => MESSAGES[part.trim()] ?? part);
    const translated = rule.translation.map((segment, index) => segment + (filled[index] ?? "")).join("");
    return text.replace(key, () => translated);
  }
  return null;
}

/** 「X. Shortcut: F2」这种后缀由工具提示追加，先拆出来再各自翻 */
function translateShortcutSuffix(text: string): string | null {
  const match = /^([\s\S]+)\. Shortcut: ([\s\S]+)$/.exec(text);
  if (!match) return null;
  const template = MESSAGES[". Shortcut: {}"];
  if (!template) return null;
  return translate(match[1]) + template.replace("{}", match[2]);
}

/** 一段文案换中文；没命中原样返回，因此重复调用不会二次翻译。
 *  用函数式替换：译文里的 `$&` 之类不会被当成替换模式。 */
function translate(text: string): string {
  const key = text.trim();
  // 单字符不翻：那是键盘助记符、坐标轴符号、表格里的 Y/N 之类，翻错的代价大于收益
  if (key.length < 2) return text;

  if (key.includes(". Shortcut: ")) {
    const withSuffix = translateShortcutSuffix(text);
    if (withSuffix !== null) return withSuffix;
  }

  const hit = MESSAGES[key];
  if (hit) return text.replace(key, () => hit);

  return translatePattern(text) ?? text;
}

/**
 * 整词替换：FMG 常把快捷键字母用 `<u>` 包进词里（`Ri<u>v</u>ers`、`<u>H</u>eightmap`），
 * 一个词被切成好几个文本节点，逐节点匹配永远匹配不上。这里对「只由一个词 + 内联标记
 * 组成」的元素整体换成译文（中文界面里那个下划线字母本来也没有意义）。
 */
function translateInlineLabel(element: Element): void {
  const children = element.children;
  if (!children.length) return; // 纯文本的元素交给文本节点那条路
  for (const child of children) {
    if (!INLINE_MARKUP.has(child.tagName.toLowerCase()) || child.children.length) return;
  }
  const text = element.textContent?.trim() ?? "";
  const hit = text.length > 1 ? MESSAGES[text] : undefined;
  if (hit) element.textContent = hit;
}

function translateNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? "";
    const next = translate(text);
    if (next !== text) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  for (const attribute of ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const next = translate(value);
    if (next !== value) element.setAttribute(attribute, next);
  }
  translateInlineLabel(element);
}

/** 翻译一棵子树（含自身）；调用方负责确认它在外壳容器之内 */
function translateTree(root: Node): void {
  translateNode(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) translateNode(node);
}

/** 节点是否落在外壳容器里（地名等地图内容在这里被挡掉） */
function inChrome(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!element) return false;

  // 固定提示（tip(msg, main = true)）里放的是地图实体的名称与详情 —— 那是内容，不翻
  const tooltip = element.closest<HTMLElement>("#tooltip");
  if (tooltip?.getAttribute("data-main")) return false;

  return Boolean(element.closest(CHROME_ROOTS));
}

/** 盯着 DOM，把后出现的界面文案也换成中文（图例、对话框、提示都是动态渲染的） */
function observeChrome(): void {
  const pending = new Set<Node>();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const batch = [...pending];
    pending.clear();
    for (const node of batch) {
      if (node.isConnected && inChrome(node)) translateTree(node);
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  };

  const collect = (node: Node) => {
    // 地图重绘很频繁：不在外壳里的节点在收集阶段就丢掉，别留到 flush 再逐个判断
    if (!inChrome(node)) return;
    pending.add(node);
    schedule();
  };

  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "characterData") {
        collect(record.target);
        continue;
      }
      for (const node of record.addedNodes) collect(node);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

/** 启动中文化；宿主页面且语言是中文时才生效（独立版 FMG 保持英文） */
export function initI18n(): void {
  if (started) return;
  started = true;
  if (!isHosted() || !hostContext().lang?.startsWith("zh")) return;

  buildPatterns();
  for (const root of document.querySelectorAll(CHROME_ROOTS)) translateTree(root);
  observeChrome();
}

/**
 * 主动翻一句：宿主自己写界面时用，免得走观察者先闪一下英文。
 * 语言不是中文（或词典没这句）时原样返回。
 */
export function hostText(text: string): string {
  if (!started || !hostContext().lang?.startsWith("zh")) return text;
  return translate(text);
}
