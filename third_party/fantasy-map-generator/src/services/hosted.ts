// 宿主桥：本文件是「Opuscule 当引擎、外壳归 worldbuilding_timeline」这条边界的唯一入口。
//
// 页面由 Django 渲染（templates/map/app.html），上下文放在 #map-ctx 里：
// 看哪一张地图（docId）、能不能改（canEdit）、接口前缀（apiBase）。
// 地图的整包数据（Opuscule 自己的 .map 文本）存在 Document.map_data，
// 读写走 /api/world/maps/<id>/data —— Opuscule 原来的「存到浏览器/下载文件」都退居其次。
import { tip } from "@/components/tooltips";

export interface HostContext {
  view: string;
  docId: number;
  docName: string;
  docMissing: boolean;
  embed: boolean;
  readonly: boolean;
  canEdit: boolean;
  theme: string;
  apiBase: string;
  lang: string;
  //: 三维联动（PLAN §4.4 B）：当前纪元（0 = 全部）+ 要高亮的卡片（0 = 无）
  eraId: number;
  focusCardId: number;
  //: 自定义底图（Document.settings）：url 为空表示不铺底图
  background: { url: string; zoom: number; offset_x: number; offset_y: number };
}

const FALLBACK: HostContext = {
  view: "2d",
  docId: 0,
  docName: "",
  docMissing: false,
  embed: false,
  readonly: true,
  canEdit: false,
  theme: "dark",
  apiBase: "/api/world/maps",
  lang: "zh",
  eraId: 0,
  focusCardId: 0,
  background: { url: "", zoom: 1, offset_x: 0, offset_y: 0 }
};

/** 是否跑在宿主的页面里（由构建期注入的 window.__OPUSCULE_HOSTED__ 标记） */
export function isHosted(): boolean {
  return typeof window !== "undefined" && Boolean((window as { __OPUSCULE_HOSTED__?: boolean }).__OPUSCULE_HOSTED__);
}

let cached: HostContext | null = null;

/** 读一次 #map-ctx；坏数据退回安全默认（只读、无地图） */
export function hostContext(): HostContext {
  if (cached) return cached;
  try {
    const raw = document.getElementById("map-ctx")?.textContent ?? "";
    cached = raw ? { ...FALLBACK, ...(JSON.parse(raw) as Partial<HostContext>) } : FALLBACK;
  } catch (error) {
    ERROR && console.error("[hosted] 无法解析 #map-ctx，按只读处理", error);
    cached = FALLBACK;
  }
  return cached;
}

export function hostDataUrl(): string {
  const { apiBase, docId } = hostContext();
  return `${apiBase}/${docId}/data`;
}

/** 取本世界已存的整包数据；没有（或读失败）返回 null，调用方会去生成新地图 */
export async function loadHostedData(): Promise<string | null> {
  const { docId, docMissing } = hostContext();
  if (!docId) return null;
  // 文档已被删除 / 链接指向了不存在的 id：别再戳它，否则控制台会刷一串 404
  // （顶栏已经写着「地图不存在」）
  if (docMissing) {
    WARN && console.warn("[hosted] 这张地图已不存在，跳过读取");
    return null;
  }
  try {
    const response = await fetch(hostDataUrl(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { data?: string };
    return body.data ? body.data : null;
  } catch (error) {
    ERROR && console.error("[hosted] 读取地图数据失败", error);
    tip("读取已保存的地图失败，先给你生成一张新的", true, "error", 4000);
    return null;
  }
}

/** 文档不存在时只提示一次：自动落库会反复调用，不该反复弹 */
let reportedMissing = false;

/**
 * 把当前地图整包写回宿主。成功才提示；``silent`` 用于首次打开时的自动落库。
 * 动态引入 Save 是为了不把 save.ts 拖进这里的依赖环。
 */
export async function saveHostedMap({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  const { docId, canEdit, docMissing } = hostContext();
  if (!docId || !canEdit) {
    if (!silent) tip("这张地图没有可写权限，无法保存", true, "error", 3000);
    return;
  }
  if (docMissing) {
    if (!reportedMissing) {
      reportedMissing = true;
      tip("这张地图已不存在（可能已被删除），改动不会保存", true, "error", 5000);
    }
    return;
  }
  // 与 Opuscule 独立版一致：编辑中途的 DOM 是临时状态，不能拿它落库
  if (customization) {
    if (!silent) tip("编辑模式下不能保存，请先结束当前编辑", false, "error", 3000);
    return;
  }

  try {
    const { Save } = await import("@/services/io/save");
    const data = await Save.prepareMapData();
    const response = await fetch(hostDataUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    tip(silent ? "地图已保存到这个世界" : "地图已保存", false, "success", 3000);
  } catch (error) {
    ERROR && console.error("[hosted] 保存地图失败", error);
    tip(`保存失败：${(error as Error)?.message || "未知错误"}`, true, "error", 5000);
  }
}
