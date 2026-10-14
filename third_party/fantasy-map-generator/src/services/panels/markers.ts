// 左栏的「标注」：读我们库里的 MapMarker（图钉 ↔ 卡片的那座桥），与工作区左栏同一套分布。
// 行为走 /api/world/maps/<id> 那组接口（既有），所以标注与卡片的关系、颜色口径都不另起一套。
import { zoomTo } from "@/components/zoom";
import { hostContext } from "@/services/hosted";
import { createDropdown, type Dropdown } from "@/services/panels/dropdown";
import { openMarkerCard } from "@/services/panels/marker-card";

interface Marker {
  id: number;
  kind: string;
  name: string;
  description?: string;
  color: string;
  scale: number;
  x: number;
  y: number;
  card: number | null;
  card_name: string | null;
}

interface MarkerState {
  layers: unknown[];
  markers: Marker[];
  kinds: { value: string; label: string }[];
  color_hex: Record<string, string>;
}

let list: HTMLElement | null = null;
let count: HTMLElement | null = null;
let state: MarkerState | null = null;
let selected: number | null = null;

/** 新标注的默认外观：记在浏览器里（每张地图一份），只影响之后新建的标注 */
const DEFAULTS_KEY = "tx.markerDefaults";
interface MarkerDefaults {
  color: string;
  scale: number;
}

const defaults: MarkerDefaults = { color: "", scale: 1 };
let defaultColor: Dropdown | null = null;
let defaultScale: HTMLInputElement | null = null;

/** 1 = 标准；列表里的点也按它放大缩小，所以收在看得出来的范围内 */
function clampScale(value: number): number {
  return Math.min(4, Math.max(0.2, Number.isFinite(value) ? value : 1));
}

function defaultsKey(): string {
  return `${DEFAULTS_KEY}:${hostContext().docId}`;
}

function readDefaults(): void {
  try {
    const raw = localStorage.getItem(defaultsKey());
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<MarkerDefaults>;
    if (typeof parsed.color === "string") defaults.color = parsed.color;
    if (typeof parsed.scale === "number") defaults.scale = clampScale(parsed.scale);
  } catch {
    // 隐私模式读不了 / 存进去的是坏数据：用默认值就行
  }
}

function writeDefaults(): void {
  try {
    localStorage.setItem(defaultsKey(), JSON.stringify(defaults));
  } catch {
    // 写不进去也不影响本次会话
  }
}

/** 默认外观的两个控件；颜色要等 state 到了才知道有哪些色 */
function mountDefaults(): void {
  const slot = document.getElementById("tx-marker-default-color");
  if (slot && !defaultColor && state) {
    const colors = Object.keys(state.color_hex);
    if (!colors.includes(defaults.color)) defaults.color = colors[0] ?? "";
    defaultColor = createDropdown({
      items: colors.map(color => ({ value: color, label: color })),
      value: defaults.color,
      swatches: state.color_hex,
      title: "新建标注用什么颜色",
      onChange: value => {
        defaults.color = value;
        writeDefaults();
      }
    });
    slot.append(defaultColor.root);
  }

  const scale = document.getElementById("tx-marker-default-scale") as HTMLInputElement | null;
  if (scale && !defaultScale) {
    defaultScale = scale;
    scale.value = String(defaults.scale);
    scale.addEventListener("change", () => {
      defaults.scale = clampScale(Number(scale.value));
      scale.value = String(defaults.scale);
      writeDefaults();
    });
  }
}

const api = (path: string) => `${hostContext().apiBase}${path}`;

async function load(): Promise<void> {
  const { docId, docMissing } = hostContext();
  if (!docId) return;
  // 文档已不存在（被删掉 / 链接过期）：顶栏写着「地图不存在」，这里也不用去戳那个 id
  if (docMissing) {
    if (count) count.textContent = "—";
    return;
  }
  try {
    const response = await fetch(api(`/${docId}`), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = (await response.json()) as MarkerState;
  } catch (error) {
    ERROR && console.error("[markers] 读取标注失败", error);
    return;
  }
  render();
  mountDefaults();
}

/** 标注的中心点：库里存的是百分比，FMG 的视图坐标是地图单位 */
function centerOf(marker: Marker): [number, number] {
  const { width, height } = options.map.graph;
  return [(marker.x / 100) * width, (marker.y / 100) * height];
}

function rowFor(marker: Marker): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `tx-row tx-marker${marker.id === selected ? " is-selected" : ""}`;
  item.dataset.marker = String(marker.id);

  const main = document.createElement("button");
  main.type = "button";
  main.className = "tx-row__main";
  main.title = "把地图移到这个标注";

  const dot = document.createElement("span");
  dot.className = "tx-dot tx-dot--marker";
  dot.style.background = state?.color_hex[marker.color] ?? "var(--tx-mute)";
  // 大小（scale）在列表里就看得出来，否则这个值在界面上没有任何反馈
  const size = Math.min(14, Math.max(6, 8 * clampScale(marker.scale ?? 1)));
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;

  const name = document.createElement("span");
  name.className = "tx-row__name";
  name.textContent = marker.name || marker.card_name || "未命名";

  const kind = document.createElement("span");
  kind.className = "tx-row__key tx-row__kind";
  kind.textContent = state?.kinds.find(item => item.value === marker.kind)?.label ?? marker.kind;

  main.append(dot, name, kind);
  item.append(main);

  if (hostContext().canEdit) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tx-iconbtn";
    remove.dataset.delete = "1";
    remove.title = "删掉这个标注";
    remove.textContent = "✕";
    item.append(remove);
  }
  return item;
}

function render(): void {
  if (!list || !state) return;
  list.replaceChildren(...state.markers.map(rowFor));
  if (count) count.textContent = String(state.markers.length);
  syncBarStats();
}

/** 顶栏左上的计数与左栏是同一份数据的两种呈现，改完标注就一起更新 */
function syncBarStats(): void {
  const target = document.querySelector<HTMLElement>("#tx-bar .tx-bar__stats");
  if (!target || !state) return;
  const parts = [`${state.layers.length} 层`];
  for (const kind of state.kinds) {
    const total = state.markers.filter(marker => marker.kind === kind.value).length;
    if (total) parts.push(`${total} ${kind.label}`);
  }
  target.textContent = parts.join(" · ");
}

async function add(): Promise<void> {
  const { docId, canEdit } = hostContext();
  if (!docId || !canEdit) return;
  try {
    const response = await fetch(api(`/${docId}/markers`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 用面板上那份「新标注默认」的颜色与大小
      body: JSON.stringify({
        kind: "pin",
        name: "新图钉",
        x: 50,
        y: 50,
        color: defaults.color || undefined,
        scale: defaults.scale
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await load();
  } catch (error) {
    ERROR && console.error("[markers] 新建标注失败", error);
  }
}

async function remove(id: number): Promise<void> {
  try {
    const response = await fetch(`/api/world/map-markers/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (selected === id) selected = null;
    await load();
  } catch (error) {
    ERROR && console.error("[markers] 删除标注失败", error);
  }
}

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLLIElement>("li[data-marker]");
  const id = Number(item?.dataset.marker ?? 0);
  if (!item || !id) return;

  if (target.closest("[data-delete]")) return void remove(id);
  focusMarker(id);
}

/** 选中并定位：列表高亮 + 地图移过去 + 浮出编辑卡片 */
function focusMarker(id: number): void {
  const marker = state?.markers.find(entry => entry.id === id);
  if (!marker || !state) return;
  selected = id;
  render();
  const [x, y] = centerOf(marker);
  zoomTo(x, y, 8, 800); // 与工作区一致的“点标注把地图移过去”
  openMarkerCard(marker, state, () => void load());
}

/** 把「标注」挂进左栏（跟图层同属「图层」标签页） */
export function initMarkersPanel(): void {
  const panel = document.getElementById("tx-panel-markers");
  const content = document.getElementById("layersContent");
  const layers = document.getElementById("tx-panel-layers");
  if (!panel || !content || !layers) return;
  // 骨架是服务端渲染的，别拿「元素存在」当「已经挂载过」——看挂载标记
  if (content.dataset.txMarkers) return;
  content.dataset.txMarkers = "1";

  layers.after(panel); // 左栏顺序：图层 → 标注
  list = document.getElementById("tx-markers-list");
  count = document.getElementById("tx-markers-count");
  list?.addEventListener("click", onClick);
  document.getElementById("tx-marker-add")?.addEventListener("click", () => void add());
  // 卡片里的「在地图上看」把地图移回来
  window.addEventListener("tx:marker-focus", event => focusMarker((event as CustomEvent<number>).detail));
  readDefaults();
  void load();
}
