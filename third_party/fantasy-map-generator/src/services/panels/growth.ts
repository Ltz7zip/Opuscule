// 左栏第三块「地图生长」：一张图从纯地形长到有文化、城镇、政权、省份、贸易……
//
// 开局只有地形与自然（见 generators/generation-plan.ts 的 LandOnlyPipeline），
// 每一级都由用户在这里点出来：按钮在前置不齐时禁用并写明缺哪一级，
// 生成完成再把这一级的图层亮出来，否则用户看不到自己刚生成的东西。
import { tip } from "@/components/tooltips";
import { ensureEmptyContainers, growStage, growthState, type StageState } from "@/generators/generation-plan";

declare const icon: (name: string, size?: number) => SVGElement;

/** 每一级的记号；顺序就是面板里的顺序 */
const STAGE_ICONS: Record<string, string> = {
  terrain: "mountain",
  cultures: "users",
  burgs: "building",
  states: "flag",
  provinces: "map",
  routes: "route",
  religions: "church",
  burgsSpecify: "building",
  markets: "coins",
  military: "swords",
  zones: "funnel",
  markers: "map-pin",
  journeys: "footprints"
};

/** 面板里的分区；顺序按依赖走，读者一眼能看出「先有文化才有政权」 */
const SECTIONS: { title: string; stages: string[] }[] = [
  { title: "社会", stages: ["cultures", "burgs", "states", "provinces"] },
  { title: "网络", stages: ["routes", "religions", "burgsSpecify", "markets"] },
  { title: "点缀", stages: ["military", "zones", "markers", "journeys"] }
];

let list: HTMLElement | null = null;

function markFor(name: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "tx-row__icon";
  mark.setAttribute("aria-hidden", "true");
  if (typeof icon === "function") mark.append(icon(STAGE_ICONS[name] ?? "circle-question-mark", 15));
  return mark;
}

function stateText(stage: StageState): string {
  if (!stage.ready) return `需先：${stage.missing.map(id => labelFor(id)).join("、")}`;
  return stage.done ? "已有" : "可生成";
}

function labelFor(id: string): string {
  return growthState().find(item => item.id === id)?.label ?? id;
}

function rowFor(stage: StageState): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `tx-grow${stage.done ? " is-done" : ""}${stage.ready ? "" : " is-locked"}`;
  item.dataset.stage = stage.id;

  const name = document.createElement("span");
  name.className = "tx-grow__name";
  name.textContent = stage.label;

  const state = document.createElement("span");
  state.className = "tx-grow__state";
  state.textContent = stateText(stage);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.grow = stage.id;
  button.textContent = stage.done ? "再生成" : "生成";
  button.disabled = !stage.ready;
  button.title = stage.ready ? stage.hint : `${stage.hint}（需先生成：${stateText(stage).replace("需先：", "")}）`;

  item.append(markFor(stage.id), name, state, button);
  return item;
}

function render(): void {
  if (!list) return;
  const stages = growthState();
  const nodes: HTMLLIElement[] = [];

  const base = document.createElement("li");
  base.className = "tx-grow tx-grow--base";
  base.append(markFor("terrain"));
  const baseName = document.createElement("span");
  baseName.className = "tx-grow__name";
  baseName.textContent = "地形与自然";
  const baseState = document.createElement("span");
  baseState.className = "tx-grow__state";
  baseState.textContent = "开局已生成";
  base.append(baseName, baseState);
  nodes.push(base);

  for (const section of SECTIONS) {
    const title = document.createElement("li");
    title.className = "tx-group__name tx-grow__section";
    title.textContent = section.title;
    nodes.push(title);

    for (const id of section.stages) {
      const stage = stages.find(item => item.id === id);
      if (stage) nodes.push(rowFor(stage));
    }
  }

  list.replaceChildren(...nodes);
}

async function grow(id: string, button: HTMLButtonElement): Promise<void> {
  const label = labelFor(id);
  button.disabled = true;
  button.textContent = "生成中…";
  try {
    await growStage(id);
  } catch (error) {
    ERROR && console.error(error);
    tip(`「${label}」生成失败：${(error as Error)?.message ?? error}`, false, "error");
  }
  render();
}

export function initGrowthPanel(): void {
  const panel = document.getElementById("tx-panel-growth");
  const markers = document.getElementById("tx-panel-markers");
  if (!panel || !markers) return;
  if (panel.dataset.ready) return;
  panel.dataset.ready = "1";

  markers.after(panel); // 左栏顺序：图层 → 标注 → 地图生长
  list = document.getElementById("tx-growth-list");
  list?.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-grow]");
    if (button) void grow(button.dataset.grow as string, button);
  });

  // 「一次生成到齐」：走上游那套完整流水线（会重新生成整张图）
  document.getElementById("tx-growth-all")?.addEventListener("click", () => {
    window.regeneratePrompt?.({ full: true });
  });

  render();
  // 新生成或读档进来的图都要过一遍：只长地形的图里社会要素的数组是不存在的，
  // 图层一开就会把重绘打断（这一步补空容器）；面板状态也跟着刷新。
  // 宿主读档走的是 Load 服务，不一定派发 map:generated，所以这里用一个廉价的
  // 「等 pack 建好」的检查，而不是把时机押在某个事件上。
  window.addEventListener("map:generated", () => {
    ensureEmptyContainers();
    render();
  });

  const waitForMap = window.setInterval(() => {
    if (!pack.cells?.i?.length) return;
    window.clearInterval(waitForMap);
    ensureEmptyContainers();
    render();
    window.dispatchEvent(new CustomEvent("tx:map-ready"));
  }, 300);
}
