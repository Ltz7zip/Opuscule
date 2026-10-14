// 右栏「参数」：视图与生成两组，行样式与工作区一致 —— 左边标签、右边绿值、下面通栏滑杆。
//
// 每一项都**转达**给 FMG 自己那个（隐藏的）输入控件：读它的 min/max/step 建滑杆，
// 改动时把值写回去并派发 input/change，剩下的交给 FMG 的既有逻辑。
// 所以我们既没有复制它的规则，也不怕上游改范围。
import { changeMapZoom, resetZoom } from "@/components/zoom";
import { getPointsNumber } from "@/data/graph-density";
import { heightmapTemplates } from "@/data/heightmap-templates";
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import { hostText } from "@/services/i18n";
import { createSliderRow, type SliderRow } from "@/services/panels/slider";

/** 一个滑杆项：source 是 FMG 里那个输入控件的 id */
interface SliderSpec {
  label: string;
  source: string;
  /** 显示值（默认原始数字）；滑杆的值就是 source 的值 */
  format?(value: number): string;
  /** 极值缺失时的兜底 */
  fallback?: { min: number; max: number; step?: number };
}

const VIEW_SLIDERS: SliderSpec[] = [
  {
    label: "缩放下限",
    source: "zoomExtentMin",
    fallback: { min: 0.05, max: 5, step: 0.05 },
    format: v => `${v.toFixed(2)}×`
  },
  {
    label: "缩放上限",
    source: "zoomExtentMax",
    fallback: { min: 0.05, max: 200, step: 0.05 },
    format: v => `${v.toFixed(2)}×`
  }
];

/** 先定尺寸 / 密度，再挑地形（模板插在两组之间） */
const GENERATE_SIZE_SLIDERS: SliderSpec[] = [
  { label: "地图宽", source: "mapWidthInput", fallback: { min: 240, max: 4000, step: 1 }, format: v => `${v} px` },
  { label: "地图高", source: "mapHeightInput", fallback: { min: 135, max: 4000, step: 1 }, format: v => `${v} px` },
  {
    label: "点数密度",
    source: "pointsInput",
    // 这一项对用户有意义的是「总点数」，不是档位数字
    format: value => `${Math.round(getPointsNumber(value) / 1000)}K 点`
  }
];

/** 世界长什么样：政权 / 文化 / 省份 / 扩张倾向 */
const GENERATE_SHAPE_SLIDERS: SliderSpec[] = [
  { label: "政权数量", source: "statesNumber", fallback: { min: 0, max: 100, step: 1 } },
  { label: "文化数量", source: "culturesInput", fallback: { min: 1, max: 32, step: 1 } },
  { label: "省份比例", source: "provincesRatio", fallback: { min: 0, max: 100, step: 1 } },
  { label: "大小差异", source: "sizeVariety", fallback: { min: 0, max: 10, step: 0.1 }, format: v => v.toFixed(1) },
  { label: "生长速率", source: "growthRate", fallback: { min: 0.1, max: 2, step: 0.1 }, format: v => v.toFixed(1) }
];

/** FMG 里那个控件：可能是普通 <input>，也可能是 <slider-input> 自定义元素，两者都有 .value */
type SourceControl = HTMLElement & { value: string };
const source = (id: string) => document.getElementById(id) as SourceControl | null;

/**
 * 读控件的极值。自定义元素只把 min/max/step 放在属性上，普通 input 则是属性；
 * 且 FMG 会**改属性**（文化数量的上限随文化集变化），所以属性优先。
 */
function bound(el: SourceControl | null, name: "min" | "max" | "step", fallback: number): number {
  const raw = el?.getAttribute(name) ?? (el as HTMLInputElement | null)?.[name] ?? "";
  const value = Number(raw);
  return raw !== "" && Number.isFinite(value) ? value : fallback;
}

const rows = new Map<string, { row: SliderRow; spec: SliderSpec }>();

function rowFor(spec: SliderSpec): HTMLElement {
  const el = source(spec.source);
  const min = bound(el, "min", spec.fallback?.min ?? 0);
  const max = bound(el, "max", spec.fallback?.max ?? 100);
  // 注意：DOM 的 input.step 在没写 step 属性时返回空串，别拿它当兜底——
  // 兜底给 1（整数），否则拖一下就把 FMG 的 610 吸成 620
  const step = bound(el, "step", spec.fallback?.step ?? 1);

  const row = createSliderRow({
    label: spec.label,
    min,
    max,
    step,
    value: Number(el?.value || min),
    format: spec.format,
    onInput(value) {
      // 写回 FMG 的控件并通知它 —— 之后的动作由 FMG 自己完成
      const target = source(spec.source);
      if (!target) return;
      target.value = String(value);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  rows.set(spec.source, { row, spec });
  return row.root;
}

/** 高程图模板：不自己复刻那张预览图墙，直接开 FMG 的选择窗口，这里只显示当前值 */
function templateRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "tx-param";

  const name = document.createElement("span");
  name.className = "tx-param__name";
  name.textContent = "高度图模板";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "tx-template";
  button.className = "tx-dd__btn";
  button.title = "打开高程图选择窗口（带预览）";
  const label = document.createElement("span");
  label.className = "tx-dd__label";
  const chev = document.createElement("span");
  chev.className = "tx-chev";
  chev.setAttribute("aria-hidden", "true");
  chev.textContent = "▾";
  button.append(label, chev);
  // 转达：FMG 的入口就是那个容器，点它走 Controllers.HeightmapSelection.open()
  button.addEventListener("click", () => document.getElementById("templateInputContainer")?.click());

  row.append(name, button);
  return row;
}

function templateName(): string {
  const id = options.generation.template;
  if (!id) return "随机";
  return heightmapTemplates[id]?.name ?? precreatedHeightmaps[id]?.name ?? id;
}

function paintTemplate(): void {
  const label = document.querySelector<HTMLElement>("#tx-template .tx-dd__label");
  if (label) label.textContent = hostText(templateName());
}

/** FMG 自己改了这些值（重新生成、读档、改尺寸）时要跟上 */
function syncFromFMG(): void {
  for (const [id, entry] of rows) {
    const el = source(id);
    if (!el) continue;
    // 范围也会变（文化数量上限随文化集变化），跟着对齐
    entry.row.setBounds(
      bound(el, "min", entry.spec.fallback?.min ?? 0),
      bound(el, "max", entry.spec.fallback?.max ?? 100)
    );
    entry.row.set(Number(el.value));
  }
  paintTemplate();

  const seed = document.getElementById("tx-seed") as HTMLInputElement | null;
  if (seed && document.activeElement !== seed) seed.value = options.map.seed;
}

/** 用输入的种子重新生成：交给 FMG 自己的流程（会弹它的确认框） */
function regenerateWithSeed(): void {
  const seed = document.getElementById("tx-seed") as HTMLInputElement | null;
  const wanted = seed?.value.trim();
  const fmInput = source("seedInput");
  if (!wanted || !fmInput) return;
  fmInput.value = wanted;
  window.generateMapWithSeed?.();
}

/** 换个随机种子重新生成：点 FMG 自己的「新建地图」按钮 */
function regenerate(): void {
  document.getElementById("newMapButton")?.click();
}

/** 挂上右栏 */
export function initParamsPanel(): void {
  const view = document.getElementById("tx-params-view");
  const generate = document.getElementById("tx-params-generate");
  const rail = document.getElementById("tx-rail-right");
  if (!view || !generate || !rail) return;
  if (rail.dataset.ready) return;
  rail.dataset.ready = "1";

  // 模板插在「尺寸 / 密度」与「世界形态」之间：先定尺寸，再挑地形，最后调世界
  generate.append(...GENERATE_SIZE_SLIDERS.map(rowFor), templateRow(), ...GENERATE_SHAPE_SLIDERS.map(rowFor));
  view.append(...VIEW_SLIDERS.map(rowFor));
  syncFromFMG();

  rail.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-zoom]");
    if (button) {
      const kind = button.dataset.zoom;
      if (kind === "in") changeMapZoom(1.4);
      else if (kind === "out") changeMapZoom(1 / 1.4);
      else resetZoom(600);
      return;
    }
    if ((event.target as HTMLElement).closest("#tx-regenerate")) regenerate();
    else if ((event.target as HTMLElement).closest("#tx-regenerate-seed")) regenerateWithSeed();
  });

  window.setInterval(syncFromFMG, 1500);
}
