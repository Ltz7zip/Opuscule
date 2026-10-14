// 宿主页面的顶栏：把 FMG 自带的标签条 / 动作栏换成我们的终端风格外壳。
//
// 这里**不复刻 FMG 的逻辑**：每个顶栏按钮只是去点一下 FMG 原本那个元素
// （#layersTab / #saveButton / #viewMesh…），行为完全由 FMG 决定，
// 所以既不会两边行为走偏，也不会因为上游升级而失效。

import { sendMapToEditor } from "@/services/editor-bridge";
import { hostContext, isHosted, saveHostedMap } from "@/services/hosted";
import { initGrowthPanel } from "@/services/panels/growth";
import { initLayersPanel } from "@/services/panels/layers";
import { initMarkersPanel } from "@/services/panels/markers";
import { initParamsPanel } from "@/services/panels/params";
import { initThreeDPanel } from "@/services/panels/three-d";
import { initThreeDDialog } from "@/services/panels/three-d-dialog";
import { openTownPlan } from "@/services/panels/town-plan";

/** 项目自己的图标集（static/icons.js 是普通脚本，符号挂在全局） */
declare const icon: (name: string, size?: number) => SVGElement;

/** 顶栏的分组按钮 → FMG 里对应的元素（保存不走这里：它直连本世界） */
const TAB_TARGETS = ["layersTab", "styleTab", "optionsTab", "toolsTab", "aboutTab"];
const ACTION_TARGETS: Record<string, string> = {
  newMap: "newMapButton",
  load: "loadButton",
  export: "exportButton",
  zoom: "zoomReset",
  search: "searchButton"
};
const VIEW_TARGETS: Record<string, string> = {
  standard: "viewStandard",
  mesh: "viewMesh",
  globe: "viewGlobe"
};

function find<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function clickId(id: string): void {
  find(id)?.click();
}

/**
 * FMG 用 `#viewStandard` 上的 `.pressed` 表示「平面」；三维开着时它被摘掉，
 * 具体是地形还是地球仪看 `#canvas3d` 的 data-type。
 * 三维是异步挂载的：没有画布就不算进了三维，别把「正在加载」说成「已经是地形」。
 */
function currentView(): "standard" | "mesh" | "globe" {
  const canvas = find("canvas3d");
  if (!canvas) return "standard";
  return canvas.dataset.type === "viewGlobe" ? "globe" : "mesh";
}

/** 把 FMG 的状态映回顶栏的高亮 */
function syncActive(): void {
  const bar = document.getElementById("tx-bar");
  if (!bar) return;

  for (const button of bar.querySelectorAll<HTMLElement>("[data-tab]")) {
    const target = find(button.dataset.tab ?? "");
    button.setAttribute("aria-pressed", String(Boolean(target?.classList.contains("active"))));
  }

  const view = currentView();
  for (const button of bar.querySelectorAll<HTMLElement>("[data-view-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.viewMode === view));
  }
}

/** FMG 自己改状态时（快捷键、Esc、三维挂载完成…）也跟上 */
function observeState(): void {
  const observer = new MutationObserver(() => syncActive());
  for (const id of ["options", "viewMode"]) {
    const node = find(id);
    if (node) observer.observe(node, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
}

/** 只读世界：把会写数据的入口关掉（其余仍可用） */
function disableWrites(bar: HTMLElement): void {
  for (const action of ["save", "newMap", "toEditor"]) {
    const button = bar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) continue;
    button.disabled = true;
    button.title = "只读：没有修改这个世界的权限";
  }
}

/** `/map/3d`：等地图出来再切三维 —— 三维视图要有地形数据才有意义 */
function open3dWhenReady(): void {
  let waited = 0;
  const timer = window.setInterval(() => {
    waited += 300;
    if (waited > 60000 || !find("viewMesh") || !mapHistory.length) {
      if (waited > 60000) window.clearInterval(timer);
      return;
    }
    window.clearInterval(timer);
    clickId("viewMesh");
    // 三维是异步挂载的，等它落地再对一次高亮
    window.setTimeout(syncActive, 600);
    window.setTimeout(syncActive, 1500);
  }, 300);
}

/** 给带 `data-icon` 的元素塞图标；窄屏时文字由 CSS 收掉，只留图标 */
function injectIcons(root: ParentNode): void {
  if (typeof icon !== "function") return; // 图标集没加载（独立版）就只用文字
  for (const host of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    if (host.querySelector(":scope > svg.icon")) continue;
    const name = host.dataset.icon;
    if (!name) continue;
    host.prepend(icon(name, 15));
  }
}

/** 启动顶栏；只在宿主页面且顶栏存在时生效 */
export function initShellBar(): void {
  if (!isHosted()) return;
  initHostPanels();

  const bar = document.getElementById("tx-bar");
  if (!bar) return;

  const { canEdit, view } = hostContext();
  injectIcons(bar);
  syncActive();
  observeState();
  // 三维画布是异步挂载的：画布真正出现 / 消失时，让右栏的三维面板通知一声，
  // 顶栏的「平面 / 地形 / 地球仪」高亮才对得上（那一刻之前没法从 DOM 判断）
  window.addEventListener("tx:view-changed", () => syncActive());

  bar.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;

    const tab = button.dataset.tab;
    const mode = button.dataset.viewMode;
    const action = button.dataset.action;

    if (tab && TAB_TARGETS.includes(tab)) {
      window.showOptions?.();
      clickId(tab);
      syncActive();
    } else if (mode) {
      clickId(VIEW_TARGETS[mode] ?? "");
    } else if (action === "save") {
      // 宿主里的「保存」就是写回这个世界：不弹 FMG 那个「本机 / Dropbox / 浏览器」三选一
      void saveHostedMap();
    } else if (action === "toEditor") {
      // 把地图上的国家 / 省份 / 城镇 / 河流送进工作区（卡片 + 图钉）
      void sendMapToEditor();
    } else if (action === "townPlan") {
      // 拿地图上的一座城镇，看/存我们自绘的城镇平面（只读，不写这个世界）
      openTownPlan();
    } else if (action && ACTION_TARGETS[action]) {
      clickId(ACTION_TARGETS[action]);
    }

    // 顶栏的菜单点完就收（<details> 原生开合，这里只负责关）
    for (const menu of bar.querySelectorAll<HTMLDetailsElement>("details[open]")) menu.open = false;

    // 三维那类操作是异步的，晚一点再对一次高亮
    window.setTimeout(syncActive, 400);
  });

  if (!canEdit) disableWrites(bar);
  if (view === "3d") open3dWhenReady();
}

/**
 * 宿主页面的**面板与主题**：外壳里与顶栏无关的那一半。
 *
 * 工作区把地图嵌进面板时（``embed=1``）没有顶栏，但那三块面板（图层 / 标注 /
 * 地图生长）和明暗档照样要有 —— 少了它们，嵌进去的图只能退回 FMG 自己的标签条，
 * 于是同一个地图在两个页面上是两副样子。
 */
function initHostPanels(): void {
  document.documentElement.dataset.theme = hostContext().theme;

  // 面板骨架只有在「我们接管外壳」时才渲染（见 templates/map/shell.html）。
  // 没有它就一条都别动 —— 只读嵌入（发布站点那类）的外壳全归 FMG 自己。
  if (!find("tx-panel-layers")) return;

  // FMG 默认把面板收成一个 ► 箭头；两种落地方式下都不要那个中间态
  window.showOptions?.();
  initLayersPanel(); // 我们自己的图层面板（结构是我们的，行为调 FMG 的 API）
  initMarkersPanel(); // 左栏第二块：标注（读我们库里的 MapMarker）
  initGrowthPanel(); // 左栏第三块：地图生长（一级一级按需生成）
  initParamsPanel(); // 右栏：视图 / 生成参数
  initThreeDPanel(); // 右栏第三块：三维地形（侵蚀），只在地形 / 地球仪下出现
  initThreeDDialog(); // FMG 的三维设置对话框：加分区标题 + 我们的皮
  // 面板标题的记号：骨架是服务端渲染的，等面板都落位后再塞图标。
  // 只扫我们自己的容器 —— FMG 的 icon-picker / 标注设置也用 data-icon，别误伤。
  for (const id of ["tx-panel-layers", "tx-panel-markers", "tx-panel-growth", "tx-rail-right"]) {
    const node = find(id);
    if (node) injectIcons(node);
  }
}
