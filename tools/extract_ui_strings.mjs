#!/usr/bin/env node
/**
 * 从地图源码里收「界面文案」，补进中文词典 `src/services/i18n/zh.json`。
 *
 * 只收能吃到的：悬停提示（data-tip / tip()）、占位符、按钮与选项的文字、
 * 对话框的 `title:` / `message`。带 `${...}` 插值的动态文案先跳过（还没做模板匹配）。
 *
 *   node tools/extract_ui_strings.mjs            # 补齐缺失的键（值留空 = 待翻译）
 *   node tools/extract_ui_strings.mjs --report   # 只报数，不改文件
 *
 * 空值的键在运行时会被当成「没翻译」，界面保留英文，所以中途状态是安全的。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "third_party", "fantasy-map-generator", "src");
const DICT = path.join(SRC, "services", "i18n", "zh.json");

const MAX_LENGTH = 140;
/** 明显不是给人看的：类名、URL、选择器、代码片段 */
const REJECT = /^(https?:|\/|#|\.|-|_|\{|\[|\d)|[<>{};=]|\bpx\b|\bpx;|^\S+\.(js|ts|css|png|jpg|svg)$/;

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "e2e"].includes(entry.name)) continue;
      found.push(...walk(full));
    } else if (/\.(ts|html)$/.test(entry.name) && !entry.name.includes(".test.")) {
      found.push(full);
    }
  }
  return found;
}

function keep(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  const text = candidate.trim();
  if (!text || text.length > MAX_LENGTH) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (text.includes("${") || text.includes("\n") || text.includes("\\")) return false;
  return !REJECT.test(text);
}

/** 明显是代码而不是文案的模式：SVG 路径、CSS 值、选择器、XML 头… */
const CODE_PATTERN = new RegExp(
  [
    "^[Mm][\\s\\d{.,-]*[-lhcqvz]", // SVG 路径数据
    "^(?:m |M0|M\\{|M[\\d,])",
    ":scope|::|\\]\\s*\\[|>\\s*[a-z#.]", // 选择器
    "^<\\?xml|^<svg|^g#|^div\\.|^\\s*[a-z]+#",
    "^HTTP \\{|^width=\\{|^\\{[^}]*\\} (?:MB|kB|GB|icons\\.zip|sideButton|\\| null)$",
    "linear-gradient|radial-gradient|matrix\\(|translate\\(|rotate\\(|scale\\(|repeat\\(",
    "\\brgb\\(|\\bhsl\\(|text-shadow|text-transform|^transform|stroke=|^style=",
    "^\\[Data integrity\\]"
  ].join("|")
);

/** 带插值的文案：把 `${...}` 收成 `{}` 占位符，交给运行时按模式匹配。
 *  这类文案是提示语（"X: click to toggle…"），占位符里的内容运行时再单独翻。 */
function keepPattern(candidate) {
  if (!candidate || typeof candidate !== "string") return false;
  const text = candidate.trim();
  if (!text || text.length > MAX_LENGTH) return false;
  if (!text.includes("{}")) return false; // 至少有一个占位符，否则走精确匹配
  if (!/[A-Za-z]/.test(text) || !text.includes(" ")) return false;
  if (text.includes("\\") || text.includes("\n")) return false;
  if (/=>|\?\.|===|!==|\breturn\b|\bfunction\b|`|\bonclick\b/.test(text)) return false;
  if (/^(https?:|\/|#|\d|\$)/.test(text)) return false;
  if (CODE_PATTERN.test(text)) return false;

  // 去掉占位符后不该再剩下代码/CSS 的痕迹：花括号、分号、伪类选择器、变量名…
  const bare = text.replace(/\{\}/g, "");
  if (/[{};@]|:is\(|\*\)|--[\w-]+:|\bvar\(|\bpx\b|\burl\(/.test(bare)) return false;
  // 占位符不该贴着标点当参数用（"Al {}"、"Add {}" 这种多半是名字模板/代码片段）
  if (/^[A-Z][a-z]* \{\}$/.test(text) && text.split(" ").length <= 3) return false;
  return true;
}

/** 把一段带插值的文本里的 `${...}` 换成 `{}`，并折叠多余空白 */
function toPattern(text) {
  return text.replace(/\$\{[^{}]*\}/g, "{}").replace(/\s+/g, " ").trim();
}

/** 收一段文本里所有候选文案 */
function harvest(source, file) {
  const out = [];
  // generators/ 里带插值的长句是「世界生成的物语文本」，属地图内容，不进词典
  const allowPattern = !file.includes("/generators/");
  const push = (value) => {
    if (keep(value)) out.push(value.trim());
  };
  const pushPattern = (value) => {
    if (!allowPattern) return;
    const pattern = toPattern(value);
    if (keepPattern(pattern)) out.push(pattern);
  };

  // 两种文件都收：属性里的提示、以及「标签之间的可见文字」
  // （TS 里的界面都是模板字符串拼 HTML，所以这句对 .ts 同样适用）
  for (const match of source.matchAll(/\s(?:data-tip|placeholder|title)="([^"]*)"/g)) {
    if (match[1].includes("${")) pushPattern(match[1]);
    else push(match[1]);
  }
  const INLINE_TAGS = "button|option|label|legend|summary|th|h[1-6]|p|span|div|strong|em|small|b|i|a|td|caption|li";
  for (const match of source.matchAll(new RegExp(`<(?:${INLINE_TAGS})[^>]*>([^<>{}$]+)<`, "g"))) {
    push(match[1]);
  }

  if (file.endsWith(".html")) return out;

  // TS：tip("…") / tip(`…`) 的第一个参数
  for (const match of source.matchAll(/\btip\(\s*(["'`])((?:[^"'`\\]|\\.)*?)\1/g)) {
    if (match[2].includes("${")) pushPattern(match[2]);
    else push(match[2]);
  }
  // 对话框的按钮与正文：{ title: "…" } / message = "…" / confirm: "…"
  for (const match of source.matchAll(/\b(?:title|message|confirm|cancel)\s*[:=]\s*(["'`])((?:[^"'`\\]|\\.)*?)\1/g)) {
    push(match[2]);
  }
  // 反引号模板里像人话的插值文案（跳过真正拼 HTML 的那些模板）
  for (const match of source.matchAll(/`([^`\n]{0,200})`/g)) {
    if (!match[1].includes("${")) continue;
    if (/<\/?[a-zA-Z]/.test(match[1])) continue; // 模板里有 <div>/</span> 这类标签，是拼 DOM 的，不是文案
    pushPattern(match[1]);
  }
  return out;
}

const arguments_ = new Set(process.argv.slice(2));
const reportOnly = arguments_.has("--report");

const dictionary = JSON.parse(fs.readFileSync(DICT, "utf8"));
const before = Object.keys(dictionary).length;

const candidates = new Map(); // 文案 -> 出现的文件
for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, "utf8");
  for (const text of harvest(source, file)) {
    if (!candidates.has(text)) candidates.set(text, path.relative(SRC, file));
  }
}

const missing = [...candidates.keys()].filter((text) => !(text in dictionary)).sort();

console.log(`源码里的候选文案：${candidates.size}`);
console.log(`其中带占位符的模式：${[...candidates.keys()].filter((text) => text.includes("{}")).length}`);
console.log(`词典现有：${before}（已翻 ${Object.values(dictionary).filter(Boolean).length}）`);
console.log(`本次新增：${missing.length}`);

if (reportOnly) {
  const patterns = missing.filter((text) => text.includes("{}"));
  console.log(`新增里带占位符的模式：${patterns.length}`);
  for (const text of patterns.slice(0, 25)) console.log(`  ~ ${text}`);
  for (const text of missing.filter((text) => !text.includes("{}")).slice(0, 25)) {
    console.log(`  - ${text}   [${candidates.get(text)}]`);
  }
  process.exit(0);
}

if (missing.length) {
  const merged = {};
  // 键按字母排，diff 干净；值留空 = 待翻译（运行时保留英文）
  for (const key of [...new Set([...Object.keys(dictionary), ...missing])].sort((a, b) => a.localeCompare(b))) {
    merged[key] = dictionary[key] ?? "";
  }
  fs.writeFileSync(DICT, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`已写回 ${path.relative(ROOT, DICT)}：${Object.keys(merged).length} 键，待翻译 ${missing.length}`);
}
