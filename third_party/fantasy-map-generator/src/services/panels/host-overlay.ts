// 宿主叠加层：自定义底图 + Opuscule 的 MapMarker。
//
// FMG 自己的 markers 层画的是 pack.markers（地图内的图钉），与「标注 ↔ 卡片」
// 那套数据不是一回事；这里单独画，互不覆盖。
//
// 两层都注册成 permanent layer（见 components/layers.ts），所以载入存档、
// 重新生成地图之后 Layers.drawAll() 会自动重画，不需要额外的生命周期钩子。
import { hostContext } from "@/services/hosted";
import { findEl } from "@/utils/nodeUtils";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface HostMarker {
  id: number;
  kind: string;
  name: string;
  description?: string;
  color: string;
  scale: number;
  x: number;
  y: number;
  points?: number[][];
  rotation?: number;
  card?: number | null;
  card_name?: string | null;
}

let markers: HostMarker[] = [];
let colors: Record<string, string> = {};
let selected = 0;

/** 标注数据由 panels/markers.ts 推进来；选中项变化时也要重画 */
export function setHostMarkers(next: HostMarker[] | null, palette?: Record<string, string>, selectedId = 0): void {
  markers = Array.isArray(next) ? next : [];
  if (palette) colors = palette;
  selected = selectedId;
  drawHostMarkers();
}

function ensureGroup(elementId: string): SVGGElement | null {
  const viewbox = findEl<SVGGElement>("viewbox");
  if (!viewbox) return null;
  let group = findEl<SVGGElement>(elementId);
  if (!group) {
    group = document.createElementNS(SVG_NS, "g") as SVGGElement;
    group.id = elementId;
    viewbox.append(group);
  } else if (group.parentNode !== viewbox) {
    // 载入存档时整个 #map 被替换过：旧 group 已经不在了，这里重新挂到新 viewbox
    viewbox.append(group);
  }
  return group;
}

function clampScale(value: number): number {
  return Math.min(4, Math.max(0.2, Number.isFinite(value) ? value : 1));
}

/** 底图的缩放 / 偏移；标注跟着同一套变换走，位置才不会错开 */
function overlayTransform(): string | null {
  const background = hostContext().background;
  if (!background?.url) return null;
  const { width, height } = options.map.graph;
  const zoom = Number(background.zoom);
  const scale = Number.isFinite(zoom) && zoom > 0 ? Math.min(8, Math.max(0.1, zoom)) : 1;
  const offsetX = Number(background.offset_x) || 0;
  const offsetY = Number(background.offset_y) || 0;
  if (scale === 1 && offsetX === 0 && offsetY === 0) return null;
  const cx = width / 2;
  const cy = height / 2;
  return `translate(${cx + offsetX} ${cy + offsetY}) scale(${scale}) translate(${-cx} ${-cy})`;
}

function applyOverlayTransform(group: SVGGElement): void {
  const transform = overlayTransform();
  if (transform) group.setAttribute("transform", transform);
  else group.removeAttribute("transform");
}

/** 底图铺满整张画布：标注存的是百分比，铺满才能与百分比一一对应 */
export function drawHostBackground(): void {
  const group = ensureGroup("tx-host-background");
  if (!group) return;
  group.style.pointerEvents = "none";
  group.replaceChildren();

  const url = hostContext().background?.url?.trim();
  if (!url) {
    group.style.display = "none";
    return;
  }
  group.style.display = "";

  const { width, height } = options.map.graph;
  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", url);
  image.setAttribute("x", "0");
  image.setAttribute("y", "0");
  image.setAttribute("width", String(width));
  image.setAttribute("height", String(height));
  image.setAttribute("preserveAspectRatio", "none");
  image.dataset.hostBackground = "1";
  group.append(image);
  applyOverlayTransform(group);
}

function colorOf(name: string): string {
  return colors[name] || "#e0a83c";
}

function centerOf(marker: HostMarker): [number, number] {
  const { width, height } = options.map.graph;
  return [(marker.x / 100) * width, (marker.y / 100) * height];
}

function labelFor(parent: SVGGElement, text: string, x: number, y: number, size: number, fill: string): void {
  if (!text) return;
  const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", String(Math.max(7, size)));
  label.setAttribute("fill", fill);
  label.setAttribute("stroke", "#0d0c0b");
  label.setAttribute("stroke-width", String(Math.max(2, size * 0.32)));
  label.setAttribute("stroke-linejoin", "round");
  label.setAttribute("paint-order", "stroke");
  label.setAttribute("pointer-events", "none");
  label.textContent = text;
  parent.append(label);
}

function drawPin(group: SVGGElement, marker: HostMarker): void {
  const scale = clampScale(marker.scale);
  const [x, y] = centerOf(marker);
  const color = colorOf(marker.color);

  const node = document.createElementNS(SVG_NS, "g") as SVGGElement;
  node.setAttribute("transform", `translate(${x} ${y})`);
  node.style.cursor = "pointer";
  node.dataset.hostMarker = String(marker.id);

  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("r", String(7.5 * scale));
  halo.setAttribute("fill", "#0d0c0b");
  halo.setAttribute("opacity", "0.55");

  const pin = document.createElementNS(SVG_NS, "circle");
  pin.setAttribute("r", String(6 * scale));
  pin.setAttribute("fill", color);
  pin.setAttribute("stroke", "#f4efe6");
  pin.setAttribute("stroke-width", String(1.2 * scale));

  node.append(halo, pin);

  if (marker.id === selected) {
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("r", String(10 * scale));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", color);
    ring.setAttribute("stroke-width", "2");
    ring.setAttribute("opacity", "0.9");
    node.append(ring);
  }

  group.append(node);
  labelFor(
    group,
    marker.name || marker.card_name || "",
    x,
    y + 7.5 * scale + 9,
    Math.max(8, 9 * scale),
    "#f4efe6"
  );
}

function drawZone(group: SVGGElement, marker: HostMarker): void {
  const scale = clampScale(marker.scale);
  const color = colorOf(marker.color);
  const { width, height } = options.map.graph;
  const points = Array.isArray(marker.points)
    ? marker.points
        .filter(point => Array.isArray(point) && point.length >= 2)
        .map(([px, py]) => [(Number(px) / 100) * width, (Number(py) / 100) * height] as [number, number])
        .filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py))
    : [];

  if (points.length >= 3) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("points", points.map(([px, py]) => `${px},${py}`).join(" "));
    polygon.setAttribute("fill", color);
    polygon.setAttribute("fill-opacity", "0.22");
    polygon.setAttribute("stroke", color);
    polygon.setAttribute("stroke-width", String(1.5 * scale));
    polygon.setAttribute("stroke-linejoin", "round");
    polygon.style.cursor = "pointer";
    polygon.dataset.hostMarker = String(marker.id);

    const cx = points.reduce((sum, [px]) => sum + px, 0) / points.length;
    const cy = points.reduce((sum, [, py]) => sum + py, 0) / points.length;
    group.append(polygon);
    labelFor(group, marker.name || marker.card_name || "", cx, cy, Math.max(8, 9 * scale), color);
    return;
  }

  // 没有多边形（points 为空）时不要把标注弄丢：在 x/y 上画一个虚线圈
  const [x, y] = centerOf(marker);
  const node = document.createElementNS(SVG_NS, "g") as SVGGElement;
  node.setAttribute("transform", `translate(${x} ${y})`);
  node.style.cursor = "pointer";
  node.dataset.hostMarker = String(marker.id);

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("r", String(7 * scale));
  circle.setAttribute("fill", color);
  circle.setAttribute("fill-opacity", "0.18");
  circle.setAttribute("stroke", color);
  circle.setAttribute("stroke-width", String(1.4 * scale));
  circle.setAttribute("stroke-dasharray", `${3 * scale} ${2 * scale}`);
  node.append(circle);
  group.append(node);
  labelFor(group, marker.name || marker.card_name || "", x, y + 11 * scale, Math.max(8, 9 * scale), color);
}

function drawText(group: SVGGElement, marker: HostMarker): void {
  const scale = clampScale(marker.scale);
  const [x, y] = centerOf(marker);
  const node = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(y));
  node.setAttribute("text-anchor", "middle");
  node.setAttribute("dominant-baseline", "middle");
  node.setAttribute("font-size", String(Math.max(9, 11 * scale)));
  node.setAttribute("fill", colorOf(marker.color));
  node.setAttribute("stroke", "#0d0c0b");
  node.setAttribute("stroke-width", String(Math.max(2, 3 * scale)));
  node.setAttribute("stroke-linejoin", "round");
  node.setAttribute("paint-order", "stroke");
  node.style.cursor = "pointer";
  node.dataset.hostMarker = String(marker.id);
  node.textContent = marker.name || marker.card_name || "";
  group.append(node);
}

export function drawHostMarkers(): void {
  const group = ensureGroup("tx-host-markers");
  if (!group) return;
  group.replaceChildren();
  for (const marker of markers) {
    if (marker.kind === "zone") drawZone(group, marker);
    else if (marker.kind === "text" || marker.kind === "label") drawText(group, marker);
    else drawPin(group, marker);
  }
  applyOverlayTransform(group);
}

/* 点地图上的标注 = 选中它并浮出编辑卡片（只读时卡片里的字段是禁用的） */
window.addEventListener("click", event => {
  const target = (event.target as Element | null)?.closest?.("[data-host-marker]");
  if (!target) return;
  const id = Number((target as HTMLElement).dataset.hostMarker);
  if (id) window.dispatchEvent(new CustomEvent("tx:marker-focus", { detail: id }));
});
