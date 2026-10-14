// 城镇平面：把地图上的一座城镇翻成一张自绘的平面图。
//
// 这一层是**数据层**：凡是想要某座城平面图的地方都走这里（☰ 里的预览窗口、
// 城镇编辑器里的预览格、以后的批量导出），免得每处各写一遍「从 burg 里凑输入」。
//
// 一条要紧的约定：**平面图不落库**。生成器是纯函数、只吃一个种子，而种子沿用
// 上游给城镇定的那套（地图种子 + 补零的城镇号，见 Burgs.createWatabouCityLinks）——
// 所以同一个世界、同一座城，什么时候打开都是同一张图，不用往 .map 里多写一个字节。
import type { Burg } from "@/generators/burgs-generator";
import { buildTownPlanSvg, type TownPlanInput } from "@/generators/town-plan-generator";
import { getFileName, loadScript } from "@/utils";

/** 一座城出平面图需要的全部信息 */
export interface TownSubject {
  id: number;
  name: string;
  population: number;
  capital: boolean;
  river: boolean;
  coast: boolean;
  walls: boolean;
  /** 这座城自己的种子 —— 不动它就是这座城的"官方"平面 */
  seed: string;
}

/**
 * 上游给城镇种子定的规矩：`地图种子 + 四位补零的城镇号`。
 * 直接用它的好处是：这就是 FMG 自己认的「这座城的种子」，而它又已经随地图存下来了，
 * 所以我们不需要新字段、不需要改存读档，重开世界照样是同一张平面。
 * `burg.MFCG` 是用户手填的种子（历史上从 MFCG 带回来的），有就优先。
 */
export function townSeedOf(burg: Burg): string {
  return burg.MFCG || `${options.map.seed ?? ""}${String(burg.i).padStart(4, "0")}`;
}

/** 一座城能不能出平面：要有号、没被删、有名字 */
export function townSubjectAt(id: number): TownSubject | null {
  const burg = pack.burgs?.[id];
  if (!burg?.i || burg.removed || !burg.name) return null;
  return {
    id: burg.i,
    name: burg.name,
    population: Math.round(burg.population ?? 0),
    capital: Boolean(burg.capital),
    // 临河 / 临海直接从地图数据推：镇子所在格子有河流编号，或者它是个港口
    river: Boolean(pack.cells?.r?.[burg.cell]),
    coast: Boolean(burg.port),
    walls: Boolean(burg.walls),
    seed: townSeedOf(burg)
  };
}

/** 全部城镇，按人口从大到小 */
export function townSubjects(): TownSubject[] {
  const out: TownSubject[] = [];
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i) continue;
    const subject = townSubjectAt(burg.i);
    if (subject) out.push(subject);
  }
  return out.sort((a, b) => b.population - a.population);
}

/**
 * 出图。`tweak` 是**这一次观看**的临时改动（换个种子、拉规模、勾河海），
 * 不改城本身 —— 所以关掉窗口，这座城还是它自己那张平面。
 */
export function townPlanSvg(subject: TownSubject, tweak: Partial<TownPlanInput> = {}): string {
  return buildTownPlanSvg({
    name: subject.name,
    population: subject.population,
    capital: subject.capital,
    walls: subject.walls,
    river: subject.river,
    coast: subject.coast,
    seed: subject.seed,
    ...tweak
  });
}

/** 存一张平面下来：浏览器直接下载，不经过服务器 */
export function downloadTownPlan(svg: string, name: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}-城镇平面.svg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** 文件名里不能出现的字符：城镇名是用户数据，什么都可能有 */
function fileSafe(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "town";
}

/**
 * 导出的两个阶段。第二段（压缩）在四百多张图上要十几秒，
 * 而且它是**整段**的，不给进度的话界面看着就像死了 —— 所以两段都要报。
 */
export type TownPlanExportProgress = { stage: "plans" | "archive"; done: number; total: number };

/**
 * 把**世界里每一座城镇**的平面打进一个 zip（一座城一个 .svg）存下来。
 *
 * 四百多座城连着算会把界面冻住好几秒，所以每算若干座就让出一次主线程，
 * 并把两段进度都报给调用方显示。返回打进包里的城镇数与包体字节数
 * （没有城镇时为 0 —— 那种情况下不会生成包）。
 */
export async function exportTownPlansArchive(
  onProgress?: (progress: TownPlanExportProgress) => void
): Promise<{ count: number; bytes: number }> {
  const subjects = townSubjects();
  if (!subjects.length) return { count: 0, bytes: 0 };

  if (!window.JSZip) await loadScript("libs/jszip.min.js");
  const zip = new window.JSZip();

  for (let index = 0; index < subjects.length; index++) {
    const subject = subjects[index];
    zip.file(`${String(subject.id).padStart(4, "0")}-${fileSafe(subject.name)}.svg`, townPlanSvg(subject));
    onProgress?.({ stage: "plans", done: index + 1, total: subjects.length });
    if (index % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
  }

  const blob = await zip.generateAsync(
    {
      type: "blob",
      // level 1：这堆 SVG 是纯文本、本身重复度极高，默认的 6 级要压十几秒，
      // 而 1 级的速度快好几倍、体积只大一点 —— 导出这种一次性活儿，等待更要紧
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
      // 逐文件成流：默认是把四百多份攒成一整块再压，主线程会被一段段长任务占住，
      // 进度写在状态行上却刷不出来（看着像卡死）。成流后每个文件单独压，间隙能回到 UI
      streamFiles: true
    },
    // window.JSZip 是 any，回调参数得自己写形状
    (metadata: { percent: number }) =>
      onProgress?.({ stage: "archive", done: Math.round(metadata.percent), total: 100 })
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${getFileName("Town Plans")}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
  return { count: subjects.length, bytes: blob.size };
}
