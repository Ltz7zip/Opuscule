// 标注编辑卡片：选中一个标注后，在画布左下浮出的小卡片（工作区那张的同一种）。
// 字段与工作区一致：名称 / 类型 / 颜色 / 描述 / 坐标，外加「在工作区打开」。
// 落库走既有接口 PUT /api/world/map-markers/<id>（kind/name/description/color 都支持）。

import { hostContext } from "@/services/hosted";
import { createDropdown, type Dropdown } from "@/services/panels/dropdown";

declare const icon: (name: string, size?: number) => SVGElement;

export interface CardMarker {
  id: number;
  kind: string;
  name: string;
  description?: string;
  color: string;
  x: number;
  y: number;
  card: number | null;
  card_name: string | null;
}

export interface CardState {
  kinds: { value: string; label: string }[];
  color_hex: Record<string, string>;
}

let card: HTMLElement | null = null;
let current: CardMarker | null = null;
let kindSelect: Dropdown | null = null;
let colorSelect: Dropdown | null = null;
let nameField: HTMLInputElement | null = null;
let descField: HTMLTextAreaElement | null = null;
let coords: HTMLElement | null = null;
let link: HTMLAnchorElement | null = null;
let saveTimer: number | undefined;
let onSaved: (() => void) | null = null;

/** 改字段：攒一下再 PUT，避免每敲一个字发一次请求 */
function save(patch: Partial<CardMarker>): void {
  if (!current) return;
  const id = current.id;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      const response = await fetch(`/api/world/map-markers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onSaved?.();
    } catch (error) {
      ERROR && console.error("[marker-card] 保存标注失败", error);
    }
  }, 400);
}

function build(): HTMLElement {
  const root = document.createElement("div");
  root.className = "tx-card";
  root.id = "tx-marker-card";
  root.hidden = true;

  const head = document.createElement("header");
  head.className = "tx-card__head";
  const title = document.createElement("span");
  title.className = "tx-card__title";
  title.textContent = "这处叫什么";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "tx-card__close";
  close.setAttribute("aria-label", "关掉卡片");
  if (typeof icon === "function") close.append(icon("x", 12));
  close.title = "关掉卡片";
  close.addEventListener("click", () => {
    root.hidden = true;
    current = null;
  });
  head.append(title, close);

  const body = document.createElement("div");
  body.className = "tx-card__body";

  const row = (label: string, ...nodes: (Node | string)[]) => {
    const line = document.createElement("div");
    line.className = "tx-card__row";
    const name = document.createElement("span");
    name.className = "tx-card__label";
    name.textContent = label;
    line.append(name, ...nodes);
    return line;
  };

  nameField = document.createElement("input");
  nameField.className = "tx-input";
  nameField.type = "text";
  nameField.autocomplete = "off";
  nameField.addEventListener("input", () => save({ name: nameField?.value ?? "" }));

  descField = document.createElement("textarea");
  descField.className = "tx-input tx-card__area";
  descField.rows = 3;
  descField.placeholder = "这里发生过什么";
  descField.addEventListener("input", () => save({ description: descField?.value ?? "" }));

  coords = document.createElement("span");
  coords.className = "tx-card__coords";

  const kindSlot = document.createElement("span");
  kindSlot.className = "tx-card__slot";
  kindSlot.dataset.slot = "kind";
  const colorSlot = document.createElement("span");
  colorSlot.className = "tx-card__slot";
  colorSlot.dataset.slot = "color";

  const foot = document.createElement("footer");
  foot.className = "tx-card__foot";
  link = document.createElement("a");
  link.className = "tx-btn";
  link.textContent = "在工作区打开";
  const center = document.createElement("button");
  center.type = "button";
  center.className = "tx-btn";
  center.textContent = "在地图上看";
  foot.append(link, center);

  body.append(
    row("名称", nameField),
    row("类型", kindSlot),
    row("颜色", colorSlot),
    row("描述", descField),
    row("坐标", coords),
    foot
  );
  root.append(head, body);

  center.addEventListener("click", () => {
    if (current) window.dispatchEvent(new CustomEvent("tx:marker-focus", { detail: current.id }));
  });

  return root;
}

/** 打开卡片；`onSaved` 让调用方在保存后刷新列表 */
export function openMarkerCard(marker: CardMarker, state: CardState, after?: () => void): void {
  onSaved = after ?? null;
  card ??= build();
  if (!card.isConnected) document.body.append(card);
  current = marker;

  if (!kindSelect) {
    kindSelect = createDropdown({
      items: state.kinds.map(kind => ({ value: kind.value, label: kind.label })),
      title: "图钉 / 区域 / 文字",
      onChange: value => save({ kind: value })
    });
    card.querySelector('[data-slot="kind"]')?.append(kindSelect.root);
  }
  if (!colorSelect) {
    colorSelect = createDropdown({
      items: Object.keys(state.color_hex).map(color => ({ value: color, label: color })),
      swatches: state.color_hex,
      title: "标注颜色",
      onChange: value => save({ color: value })
    });
    card.querySelector('[data-slot="color"]')?.append(colorSelect.root);
  }

  kindSelect.setValue(marker.kind);
  colorSelect.setValue(marker.color);
  if (nameField) nameField.value = marker.name || marker.card_name || "";
  if (descField) descField.value = marker.description ?? "";
  if (coords) coords.textContent = `${marker.x.toFixed(1)}% , ${marker.y.toFixed(1)}%`;
  if (link) {
    if (marker.card) {
      link.href = `/world#doc=${marker.card}`;
      link.hidden = false;
      link.title = marker.card_name ?? "";
    } else {
      link.hidden = true;
    }
  }

  const canEdit = hostContext().canEdit;
  for (const field of [nameField, descField]) if (field) field.disabled = !canEdit;
  kindSelect.root.dataset.readonly = canEdit ? "" : "1";

  card.hidden = false;
}
