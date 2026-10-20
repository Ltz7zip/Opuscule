// 宿主自己的图层面板。
//
// 这是「制定」而不是「换皮」的第一块：结构、类名、样式全是我们自己的
// （templates/map/panels.html + static/map/panel.css 的 .tx-* 段），
// 只把**行为**接到 FMG 的 Layers registry 上 —— 开关、排序、预设、样式编辑
// 都调它的公开 API，所以快捷键、三维刷新、存档里的图层顺序照样一致。
import { type LayerId, Layers } from "@/components/layers";
import { applyLayersPreset } from "@/components/layers-presets";
import { LAYER_PRESETS } from "@/components/options/tabs/layers-tab";
import { Controllers } from "@/controllers";
import { LAYER_TOGGLES, layerLabel } from "@/data/layer-labels";
import { Styles } from "@/generators/styles";
import { hostText } from "@/services/i18n";
import { createDropdown } from "@/services/panels/dropdown";
import { createSliderRow, type SliderRow } from "@/services/panels/slider";
import { NODE_KEYS, type StyleElement } from "@/types/styles";
import { isCtrlClick } from "@/utils";

/** 项目自己的图标集（static/icons.js 是普通脚本，符号挂在全局） */
declare const icon: (name: string, size?: number) => SVGElement;

/** 面板列出的图层口径与 FMG 一致：有快捷键按钮的那些 */
const listable = (id: LayerId) => LAYER_TOGGLES.has(id) && Layers.has(id);

/** 只有同一父节点（viewbox）内的图层能调顺序，与 FMG 的 `li:not(.solid)` 同义 */
const reorderable = (id: LayerId) => Layers.get(id).params.parent === "viewbox";

/** 分组：把 33 项平铺清单折成 6 组（组内仍按 FMG 的叠放顺序）。
 *  `id` 是稳定键，用来记住「哪一组收起来了」—— 改标签不会让记忆失效。 */
interface LayerGroup {
  id: string;
  label: string;
  icon: string;
  layers: LayerId[];
}

const GROUPS: LayerGroup[] = [
  { id: "base", label: "底图", icon: "image", layers: ["texture", "heightmap"] },
  {
    id: "nature",
    label: "自然",
    icon: "leaf",
    layers: ["lakes", "biomes", "rivers", "relief", "temperature", "ice", "precipitation", "population"]
  },
  {
    id: "political",
    label: "政治",
    icon: "flag",
    layers: ["states", "provinces", "borders", "cultures", "religions", "zones", "military", "rulers", "emblems"]
  },
  { id: "routes", label: "交通", icon: "route", layers: ["routes", "journeys", "trade", "markets", "goods"] },
  { id: "labels", label: "标注", icon: "type", layers: ["labels", "burgIcons", "markers"] },
  {
    id: "aux",
    label: "辅助",
    icon: "crosshair",
    layers: ["cells", "grid", "coordinates", "compass", "scaleBar", "vignette"]
  }
];

/** 每一层的记号：一眼分清「这是哪一层」，不必读名字 */
const LAYER_ICONS: Partial<Record<LayerId, string>> = {
  texture: "image",
  heightmap: "mountain",
  lakes: "droplet",
  biomes: "leaf",
  rivers: "waves",
  relief: "mountain-snow",
  temperature: "thermometer",
  ice: "snowflake",
  precipitation: "cloud-rain",
  population: "users",
  states: "flag",
  provinces: "map",
  borders: "square-dashed",
  cultures: "book",
  religions: "church",
  zones: "funnel",
  military: "swords",
  rulers: "crown",
  emblems: "shield",
  routes: "route",
  journeys: "footprints",
  trade: "ship",
  markets: "coins",
  goods: "box",
  labels: "type",
  burgIcons: "building",
  markers: "map-pin",
  cells: "grid-3x3",
  grid: "hash",
  coordinates: "crosshair",
  compass: "compass",
  scaleBar: "ruler",
  vignette: "aperture"
};

let list: HTMLElement | null = null;
let preset: ReturnType<typeof createDropdown> | null = null;
let opacityRow: SliderRow | null = null;

/* ——— 统一不透明度 ——————————————————————————————————————————————
   图层在样式表里的透明度是**分散**的：有的在顶层 `attrs.opacity`，有的在每个
   `groups.<组>.attrs.opacity`（states 的实体与描边就各有一个）。所以「图层不透明度」
   不能只写一个字段，而是：把这一层所有落点列出来，**按同一个比例**缩放 ——
   这样层与层之间、组与组之间原本的深浅关系都留着，1 个滑杆也不会把设计改走样。

   只碰**本来就声明了 opacity 的 attrs 包**：上游的样式 schema 是 strictObject，
   往没写 opacity 的包里塞会被判非法（cells / temperature / markets 就没有这个字段，
   他们的样式编辑器也不给调这个）。 */

/** 一条样式路径上的不透明度落点（`<id>.attrs.opacity` 之类） */
interface OpacitySite {
  path: string;
  value: number;
}

/** 样式表里一条记录的形状：attrs 包 + 按名分的 groups（组里还能再有组） */
interface StyleNode {
  attrs?: Record<string, unknown>;
  groups?: Record<string, StyleNode | undefined>;
}

/** 样式表里这一层的所有不透明度落点；没写出来的按 1 算 */
function opacitySites(id: LayerId): OpacitySite[] {
  const sites: OpacitySite[] = [];

  /** 递归往下走：有些层是两层分组（burgIcons 的 capital.groups.icons 就是） */
  const walk = (path: string, record: StyleNode | undefined) => {
    if (!record) return;
    const bag = record.attrs;
    // 只碰本来就声明了 opacity 的 attrs 包（见上）
    if (bag && "opacity" in bag) {
      sites.push({ path: `${path}.attrs.opacity`, value: typeof bag.opacity === "number" ? bag.opacity : 1 });
    }
    for (const [group, child] of Object.entries(record.groups ?? {})) {
      if (NODE_KEYS.has(group)) continue; // 上游保留名，不是组
      walk(`${path}.groups.${group}`, child);
    }
  };

  walk(id, (styles as unknown as Record<string, StyleNode | undefined>)[id]);
  return sites;
}

/** 记录「设计里原本的深浅」，第一次动滑杆时抓一次，之后一直按它缩放 */
const originals = new Map<LayerId, OpacitySite[]>();
let opacityPercent = 100;

function applyOpacity(percent: number): void {
  opacityPercent = percent;
  for (const { ids } of displayGroups()) {
    for (const id of ids) {
      const sites = originals.get(id) ?? opacitySites(id);
      if (!sites.length) continue;
      originals.set(id, sites);
      for (const site of sites) {
        try {
          // 上游的 schema 只收 [0,1]，越界会让 setValue 直接抛错
          Styles.setValue(site.path, Math.min(1, Math.max(0, (site.value * percent) / 100)));
        } catch (error) {
          ERROR && console.warn("[layers] 这一层的不透明度写不进去", site.path, error);
        }
      }
      Styles.write(id as StyleElement);
    }
  }
  // 回到 100% 就是「以当前设计为基准」，把基准重抓一遍，
  // 免得下次再拖是拿已经缩过的值当原始值
  if (percent === 100) originals.clear();
}

function mountOpacity(): void {
  const slot = document.getElementById("tx-layers-opacity");
  if (!slot || opacityRow) return;
  opacityRow = createSliderRow({
    label: "图层不透明度",
    min: 0,
    max: 100,
    step: 1,
    value: opacityPercent,
    format: value => `${value}%`,
    onInput: applyOpacity
  });
  slot.append(opacityRow.root);
}

/** 快捷键显示成紧凑的键名：`KeyV` → `V`；FMG 那套 `= (equal sign)` 太长，会把行撑歪 */
const COMPACT_KEYS: Record<string, string> = {
  Semicolon: ";",
  Backquote: "`",
  Equal: "=",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Minus: "-",
  Quote: "'",
  Space: "空格",
  Enter: "回车",
  Escape: "Esc",
  Tab: "Tab",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→"
};

function keyLabel(id: LayerId): string {
  const code = LAYER_TOGGLES.get(id)?.shortcut;
  if (!code) return "";
  return COMPACT_KEYS[code] ?? code.replace(/^Key/, "");
}

/** 一层的记号：图标（拿不到图标集时留空位，保持左边成列对齐） */
function markFor(name: string, size: number, className: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = className;
  mark.setAttribute("aria-hidden", "true");
  if (typeof icon === "function") mark.append(icon(name, size));
  return mark;
}

/* ——— 分组折叠 ————————————————————————————————————————————————
   33 项平铺太长，分组标题就是开关：点一下收起 / 展开，收起的组记在浏览器里。
   只改这一组的行与标题，不整表重画 —— 免得每次折叠都把滚动位置弹回去。 */

const FOLD_KEY = "tx.layerFold";
const folded = new Set<string>();

function readFold(): void {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) folded.add(id);
  } catch {
    // 读不了 / 存的是坏数据：全展开就是了
  }
}

function persistFold(): void {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...folded]));
  } catch {
    // 写不进去只影响「下次还记得」，不影响本次折叠
  }
}

function paintFold(group: LayerGroup): void {
  const isFolded = folded.has(group.id);
  // 收起整块（行由 .tx-group__body 包着），不是逐行隐藏
  list?.querySelector<HTMLElement>(`li.tx-group[data-group="${group.id}"]`)?.classList.toggle("is-folded", isFolded);
  const head = list?.querySelector<HTMLElement>(`li.tx-group[data-group="${group.id}"] .tx-group__head`);
  head?.setAttribute("aria-expanded", String(!isFolded));
  if (head) head.title = isFolded ? `展开「${group.label}」` : `收起「${group.label}」`;
}

function toggleFold(group: LayerGroup): void {
  if (folded.has(group.id)) folded.delete(group.id);
  else folded.add(group.id);
  persistFold();
  paintFold(group);
}

/** 组标题：图标 + 组名 + 「开着几层 / 共几层」+ 折叠箭头，与下面的行对齐 */
function headerFor(group: LayerGroup, ids: LayerId[]): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `tx-group${folded.has(group.id) ? " is-folded" : ""}`;
  item.dataset.group = group.id;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "tx-group__head";
  const isFolded = folded.has(group.id);
  head.setAttribute("aria-expanded", String(!isFolded));
  head.title = isFolded ? `展开「${group.label}」` : `收起「${group.label}」`;
  head.addEventListener("click", () => toggleFold(group));

  const mark = markFor(group.icon, 12, "tx-group__icon");
  const name = document.createElement("span");
  name.className = "tx-group__name";
  name.textContent = group.label;

  const count = document.createElement("span");
  count.className = "tx-group__count";
  // 注意不能写 ids.filter(Layers.isOn)：类方法丢掉 this 会在初始化时抛错
  count.textContent = `${ids.filter(id => Layers.isOn(id)).length}/${ids.length}`;

  // 行装在自己的容器里：外面这条竖线 + 缩进就是「这些条目属于上面那一栏」的全部来源
  const body = document.createElement("ul");
  body.className = "tx-group__body";
  for (const id of ids) body.append(rowFor(id));

  head.append(mark, name, count, markFor("chevron-down", 12, "tx-group__chev"));
  item.append(head, body);
  return item;
}

function rowFor(id: LayerId): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `tx-row${Layers.isOn(id) ? " is-on" : ""}`;
  item.dataset.layer = id;

  const main = document.createElement("button");
  main.type = "button";
  main.className = "tx-row__main";
  main.setAttribute("aria-pressed", String(Layers.isOn(id)));
  main.title = rowTip(id);

  const mark = markFor(LAYER_ICONS[id] ?? "circle-question-mark", 15, "tx-row__icon");
  const name = document.createElement("span");
  name.className = "tx-row__name";
  // 直接翻好再上屏：交给观察者翻会先闪一下英文
  name.textContent = hostText(layerLabel(id));
  const key = document.createElement("span");
  key.className = "tx-row__key";
  key.textContent = keyLabel(id);
  main.append(mark, name, key);

  item.append(main);
  for (const [direction, label] of [
    ["up", "上移"],
    ["down", "下移"]
  ] as const) {
    const move = document.createElement("button");
    move.type = "button";
    move.className = "tx-iconbtn";
    move.dataset.move = direction;
    move.append(markFor(direction === "up" ? "arrow-up" : "arrow-down", 12, "tx-iconbtn__icon"));
    move.title = `把这一层${label}一层`;
    move.disabled = !reorderable(id);
    item.append(move);
  }
  return item;
}

function rowTip(id: LayerId): string {
  const name = hostText(layerLabel(id));
  return reorderable(id) ? `${name}：点击开关，Ctrl + 点击编辑样式` : `${name}：点击开关（这层不参与排序）`;
}

/** 分组后的显示顺序：组内按 FMG 的叠放顺序 */
function displayGroups(): { group: LayerGroup; ids: LayerId[] }[] {
  return GROUPS.map(group => ({ group, ids: group.layers.filter(listable) })).filter(entry => entry.ids.length > 0);
}

function render(): void {
  if (!list) return;
  list.replaceChildren(...displayGroups().map(({ group, ids }) => headerFor(group, ids)));
  syncPresetSelection();
}

/** 预设的真源是 FMG 自己那个（隐藏的）下拉：别处换了预设（快捷键、存档）这里要跟上 */
function syncPresetSelection(): void {
  const source = document.getElementById("layersPreset") as HTMLSelectElement | null;
  if (preset && source?.value) preset.setValue(source.value);
}

/** 换顺序：只在同一组内挪一格（跨组没有意义 —— 显示顺序按组排，叠放顺序按组内排） */
function move(id: LayerId, direction: "up" | "down"): void {
  if (!reorderable(id)) return;
  const ids = displayGroups().find(entry => entry.ids.includes(id))?.ids;
  if (!ids) return;
  const at = ids.indexOf(id);

  if (direction === "up") {
    const previous = ids[at - 1];
    // 上一层不能排序（solid 层）时不动：否则 FMG 会把它甩到同父节点的末尾
    if (previous && reorderable(previous)) Layers.move(id, previous);
    return;
  }
  const next = ids[at + 1];
  if (next) Layers.move(next, id);
}

function onListClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLLIElement>("li[data-layer]");
  const id = item?.dataset.layer as LayerId | undefined;
  if (!id || !Layers.has(id)) return;

  const moveButton = target.closest<HTMLButtonElement>("[data-move]");
  if (moveButton) {
    move(id, moveButton.dataset.move === "up" ? "up" : "down");
    return;
  }
  if (isCtrlClick(event)) {
    // 与 FMG 一致：Ctrl + 点击打开该层的样式编辑
    void Controllers.StyleEditor.open(id);
    return;
  }
  Layers.toggle(id);
}

function readStoredPreset(): string | null {
  try {
    return localStorage.getItem("preset");
  } catch {
    return null; // 隐私模式读不了：当作没选过
  }
}

/**
 * 会点亮社会要素的预设：这类预设在一张「还没有政权」的图上什么都没得画，
 * 打开时不该用它（其余预设——自然地图 / 群系地图 / 高程图 / 纯陆地——尊重用户的选择）。
 */
const SOCIAL_PRESETS = new Set([
  "political",
  "cultural",
  "religions",
  "provinces",
  "goods",
  "trade",
  "military",
  "emblems"
]);

/**
 * 开局那张图只有地形与自然（见 generators/generation-plan.ts）：预设落在「纯陆地」，
 * 别让一堆还没生成的图层挡着画面。地图没到位时什么都不做 —— 挂载那一刻 pack 还是空的，
 * 早判断会把有政权的图也判成纯陆地。
 */
function applyOpeningPresetIfPossible(): void {
  if (!pack.cells?.i?.length) return;
  if ((pack.states?.length ?? 0) > 1) return;
  const stored = readStoredPreset();
  if (stored !== null && !SOCIAL_PRESETS.has(stored)) return;
  try {
    localStorage.setItem("preset", "landmass");
  } catch {
    // 写不进去：applyLayersPreset 会退回下拉框里的当前值
  }
  applyLayersPreset();
}

/** 预设下拉：我们自己的（原生 select 的弹层是系统画的，管不到），值仍写回 FMG 那个 */
function mountPreset(): void {
  const slot = document.getElementById("tx-preset-dd");
  if (!slot || preset) return;

  const source = document.getElementById("layersPreset") as HTMLSelectElement | null;
  preset = createDropdown({
    items: Object.entries(LAYER_PRESETS).map(([value, label]) => ({ value, label })),
    value: source?.value || "political",
    title: "一套现成的图层组合",
    onChange: value => {
      // 走 FMG 读档时用的那条路：它先看 localStorage 里的 preset，所以先把新值写进去，
      // 再调 applyLayersPreset()。直接用 applyPreset(name) 试过，点下去没反应（未深究其因），
      // 这条路的语义是确定的：写值 → restore 预设的图层集合。
      try {
        localStorage.setItem("preset", value);
      } catch {
        // 隐私模式下写不了 localStorage：那就退化成只改下拉，不影响其它功能
      }
      applyLayersPreset();
      render();
    }
  });
  slot.append(preset.root);
}

/** 把面板搬进「图层」标签页，并让 FMG 自己那份内容不再渲染 */
export function initLayersPanel(): void {
  const panel = document.getElementById("tx-panel-layers");
  const content = document.getElementById("layersContent");
  if (!panel || !content) return;
  // 骨架是服务端渲染的，所以不能拿「元素存在」当「已经挂载过」——看挂载标记
  if (content.dataset.txOwned) return;

  content.dataset.txOwned = "1"; // CSS 据此隐藏 FMG 的模板内容（元素留着，它的代码还在用）
  content.prepend(panel);

  list = document.getElementById("tx-layers-list");

  readFold();
  list?.addEventListener("click", onListClick);
  mountPreset();
  mountOpacity();
  render();
  // 快捷键、预设、三维等任何一处改了图层，这里跟着重画
  Layers.subscribe(render);
  // 开局那张图只有地形与自然：预设落在「纯陆地」。要等地图真的到位（挂载时 pack 还是空的），
  // 两个时机都听：新生成走 map:generated，宿主读档走地图生长面板发的 tx:map-ready。
  applyOpeningPresetIfPossible();
  window.addEventListener("map:generated", () => applyOpeningPresetIfPossible());
  window.addEventListener("tx:map-ready", () => applyOpeningPresetIfPossible());
}
