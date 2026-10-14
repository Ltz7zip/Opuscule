// 「城镇平面」窗口：拿地图上的一座城镇，看看它的平面长什么样，也可以改参数、存下来。
//
// 默认展示的是这座城**自己的**平面（种子沿用上游给城镇定的那套），
// 所以同一个世界重开还是同一张图；换了种子也只是这一次观看的效果，不动城本身。
// 数据怎么来在 services/town-plans.ts，画怎么画在 generators/town-plan-generator.ts。
import { createDropdown, type Dropdown } from "@/services/panels/dropdown";
import { downloadTownPlan, type TownSubject, townPlanSvg, townSubjects } from "@/services/town-plans";

declare const icon: (name: string, size?: number) => SVGElement;

let modal: HTMLElement | null = null;
let picker: Dropdown | null = null;
let view: HTMLElement | null = null;
let sizeInput: HTMLInputElement | null = null;
let wallsInput: HTMLInputElement | null = null;
let riverInput: HTMLInputElement | null = null;
let coastInput: HTMLInputElement | null = null;
let seedInput: HTMLInputElement | null = null;
let current: TownSubject | null = null;
/** Esc 的两个半场只需要挂一次：挂一次而每次打开都挂，会随着反复开关越积越多 */
let escapeHooked = false;

function paint(): void {
  if (!view || !current) return;
  view.innerHTML = townPlanSvg(current, {
    walls: Boolean(wallsInput?.checked),
    river: Boolean(riverInput?.checked),
    coast: Boolean(coastInput?.checked),
    seed: seedInput?.value.trim() || current.seed,
    size: Number(sizeInput?.value ?? 1)
  }); // 内容是我们自己拼的 SVG，名字已转义
}

function adopt(town: TownSubject): void {
  current = town;
  if (sizeInput) sizeInput.value = "1";
  if (wallsInput) wallsInput.checked = town.walls;
  if (riverInput) riverInput.checked = town.river;
  if (coastInput) coastInput.checked = town.coast;
  // 种子回到这座城自己的那一串：想换回官方平面，在下方重新选一次这座城即可
  if (seedInput) seedInput.value = town.seed;
  paint();
}

function downloadSvg(): void {
  if (!view || !current) return;
  downloadTownPlan(view.innerHTML, current.name);
}

/** 拼窗口：一行控制 + 一块画布 */
function buildModal(): HTMLElement {
  const root = document.createElement("div");
  root.className = "tx-modal";
  root.id = "tx-townplan";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "城镇平面");

  const panel = document.createElement("div");
  panel.className = "tx-modal__panel";

  const head = document.createElement("header");
  head.className = "tx-modal__head";
  const mark = document.createElement("span");
  mark.className = "tx-panel__icon";
  mark.setAttribute("aria-hidden", "true");
  if (typeof icon === "function") mark.append(icon("building", 15));
  const title = document.createElement("span");
  title.className = "tx-field__label";
  title.textContent = "城镇平面";
  const spacer = document.createElement("span");
  spacer.className = "tx-modal__spacer";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "tx-grow__all";
  close.dataset.close = "1";
  close.textContent = "关闭";
  head.append(mark, title, spacer, close);

  const controls = document.createElement("div");
  controls.className = "tx-modal__controls";

  const pickerSlot = document.createElement("span");
  pickerSlot.id = "tx-townplan-picker";
  pickerSlot.className = "tx-dd-slot";

  const size = document.createElement("label");
  size.className = "tx-param";
  const sizeName = document.createElement("span");
  sizeName.className = "tx-param__name";
  sizeName.textContent = "规模";
  sizeInput = document.createElement("input");
  sizeInput.id = "tx-townplan-size";
  sizeInput.type = "range";
  sizeInput.min = "0.6";
  sizeInput.max = "3";
  sizeInput.step = "0.1";
  sizeInput.value = "1";
  size.append(sizeName, sizeInput);

  const seed = document.createElement("label");
  seed.className = "tx-param";
  const seedName = document.createElement("span");
  seedName.className = "tx-param__name";
  seedName.textContent = "种子";
  seedInput = document.createElement("input");
  seedInput.id = "tx-townplan-seed";
  seedInput.className = "tx-input";
  seedInput.type = "text";
  seedInput.autocomplete = "off";
  seedInput.spellcheck = false;
  seed.append(seedName, seedInput);

  const toggles: Array<[string, string]> = [
    ["tx-townplan-walls", "城墙"],
    ["tx-townplan-river", "临河"],
    ["tx-townplan-coast", "临海"]
  ];
  const boxes: HTMLElement[] = [];
  for (const [id, text] of toggles) {
    const box = document.createElement("label");
    box.className = "tx-param";
    const boxName = document.createElement("span");
    boxName.className = "tx-param__name";
    boxName.textContent = text;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "tx-check";
    check.id = id;
    box.append(boxName, check);
    boxes.push(box);
    if (id === "tx-townplan-walls") wallsInput = check;
    if (id === "tx-townplan-river") riverInput = check;
    if (id === "tx-townplan-coast") coastInput = check;
  }

  const roll = document.createElement("button");
  roll.type = "button";
  roll.className = "tx-grow__all";
  roll.id = "tx-townplan-roll";
  roll.textContent = "换个种子";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "tx-grow__all is-primary";
  save.id = "tx-townplan-save";
  save.textContent = "下载 SVG";

  controls.append(pickerSlot, size, seed, ...boxes, roll, save);

  view = document.createElement("div");
  view.className = "tx-modal__view";
  view.id = "tx-townplan-view";

  panel.append(head, controls, view);
  root.append(panel);
  return root;
}

function closeModal(): void {
  modal?.remove();
  modal = null;
  picker = null;
  view = null;
  sizeInput = wallsInput = riverInput = coastInput = seedInput = null;
  current = null;
}

/**
 * 关掉这一层就够，别把底下那层也关上：捕获阶段拦住 Esc 的两个半场，
 * 收在 keyup 上关（和应用级热键同一个时机，用户感觉不出差别）。
 */
function swallowEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !modal) return;
  event.stopPropagation();
  if (event.type === "keyup") closeModal();
}

export function openTownPlan(townId?: number): void {
  if (!modal) {
    const host = document.getElementById("dialogs");
    if (!host) return;
    modal = buildModal();
    host.append(modal);

    modal.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.dataset.close || target === modal) {
        closeModal();
        return;
      }
      if (target.id === "tx-townplan-roll") {
        if (seedInput) seedInput.value = `t${Math.floor(Math.random() * 1e6)}`;
        paint();
        return;
      }
      if (target.id === "tx-townplan-save") downloadSvg();
    });
    modal.addEventListener("input", () => paint());
    // Esc 在这个应用里是**两半分别有人管**的：jQuery UI 关对话框看 keydown，
    // 应用自己的 Esc 热键（components/hotkeys.ts）看 keyup。这个窗口会叠在别人上面
    // （例如从「城镇概览」的平面列点进来），所以两半都得在捕获阶段拦下 ——
    // 只拦一半，底下那层照样会被关掉。
    if (!escapeHooked) {
      escapeHooked = true;
      document.addEventListener("keydown", swallowEscape, true);
      document.addEventListener("keyup", swallowEscape, true);
    }

    const choices = townSubjects();
    if (!choices.length) {
      if (view) view.textContent = "地图上还没有城镇：先用左栏「地图生长」长出文化和城镇。";
      return;
    }
    const preferred = townId ? (choices.find(choice => choice.id === townId) ?? choices[0]) : choices[0];
    picker = createDropdown({
      items: choices
        .slice(0, 200)
        .map(choice => ({ value: String(choice.id), label: `${choice.name}（${choice.population}）` })),
      value: String(preferred.id),
      title: "挑一座城镇看平面",
      onChange: value => {
        const next = choices.find(choice => choice.id === Number(value));
        if (next) adopt(next);
      }
    });
    document.getElementById("tx-townplan-picker")?.append(picker.root);
    adopt(preferred);
    return;
  }

  if (townId) {
    const town = townSubjects().find(choice => choice.id === townId);
    if (town) {
      picker?.setValue(String(town.id));
      adopt(town);
    }
  }
}
