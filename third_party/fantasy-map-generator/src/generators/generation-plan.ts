// 地图生长：把「一次生成整张图」拆成一级级的按需生成。
//
// 上游是一条 40 步的固定流水线：画完地形就顺手把文化、城镇、政权、省份、道路、宗教、
// 市场、军事……全造出来。宿主里要的相反 —— **开局只有地形与自然**，往后的每一级由
// 用户自己决定要不要生成。所以这里不动那些阶段的实现，只用同一条流水线的**步骤子集**
// 来表达「生长到哪一级」：顺序与实现都还是上游那一份，避免两套生成逻辑各自漂移。
import { type LayerId, Layers } from "@/components/layers";
import { is3dView } from "@/components/options/view-mode";
import { Controllers } from "@/controllers";
import { type GenerationPipelineStepId, generationPipelineSteps } from "@/generators/generation-pipeline";
import { Pipeline } from "@/generators/pipeline";
import type { GridGraph } from "@/types/GridGraph";

/** 开局就有的：地形、气候、水域、生物群系、冰、人口承载力。
 *  没有任何社会要素 —— 政权、城镇、省份、道路、宗教都是用户按需点出来的。 */
const BASE_STEPS: GenerationPipelineStepId[] = [
  "grid",
  "heightmap",
  "markupGrid",
  "depressionLakes",
  "nearSeaLakes",
  "mapSize",
  "temperatures",
  "precipitation",
  "clearPack",
  "clearGraphOverride",
  "regraph",
  "markupPack",
  "defaultRuler",
  "rivers",
  "biomes",
  "featureGroups",
  "ice",
  "rankCells"
];

/** 新地图默认走这条：只长地形与自然 */
export const LandOnlyPipeline = new Pipeline<GenerationPipelineStepId, { graph?: GridGraph }>(
  "Land Only",
  generationPipelineSteps.filter(step => BASE_STEPS.includes(step.id))
);

/** 一级生长 = 用户按下的一次生成 */
export interface GrowthStage {
  id: string;
  label: string;
  hint: string;
  steps: GenerationPipelineStepId[];
  /** 跑完把这一级的图层亮出来，否则用户看不到自己刚生成的东西 */
  layers: LayerId[];
  /** 需要先有的其它级 */
  needs?: string[];
}

/**
 * 按依赖先后排。这里必须是上游的顺序而不是人们习惯的「国家→省份→城镇」：
 * 上游的政权是从**已有的城镇**里挑首都建起来的，先建国再生成城镇在它这套数据里
 * 做不到，所以面板里把提示写清楚，让顺序是可见的。
 */
const STAGES: GrowthStage[] = [
  {
    id: "cultures",
    label: "文化",
    hint: "族群与文化圈。政权、城镇、宗教都以它为底子，所以它是后面所有级的前提",
    steps: ["cultures", "culturesExpand"],
    layers: ["cultures"]
  },
  {
    id: "burgs",
    label: "城镇",
    hint: "按人口承载力铺城镇，每座城同时定下自己的平面图（在城镇编辑器里直接看）。政权会从城镇里挑首都；图标要等「城镇资料」补齐才画出来",
    steps: ["burgs"],
    layers: ["burgIcons"],
    needs: ["cultures"]
  },
  {
    id: "states",
    label: "政权",
    hint: "以城镇为首府划分国界（也可以在编辑器里自己点着建国）",
    steps: ["states", "stateStatistics", "stateForms", "taxes"],
    layers: ["states", "borders"],
    needs: ["cultures", "burgs"]
  },
  {
    id: "provinces",
    label: "省份",
    hint: "在每个政权内部再分省；一个政权至少要有 2 座城镇",
    steps: ["provinces", "provincePoles"],
    layers: ["provinces", "borders"],
    needs: ["states", "burgs"]
  },
  {
    id: "routes",
    label: "道路",
    hint: "城镇之间连陆路与海路",
    steps: ["routes"],
    layers: ["routes"],
    needs: ["burgs"]
  },
  {
    id: "religions",
    label: "宗教",
    hint: "按文化生成信仰并在人群里传播",
    steps: ["religions"],
    layers: ["religions"],
    needs: ["cultures"]
  },
  {
    // 上游把这一步排在政权与宗教之后，因为城镇的资料（人口/纹章/类型）要读它们。
    // 它单独成一级，好让「城镇还没有图标」这件事在面板上看得见、点得动。
    id: "burgsSpecify",
    label: "城镇资料",
    hint: "补齐城镇的人口、纹章与类型。到这一步城镇图标才会画出来",
    steps: ["burgsSpecify"],
    layers: ["burgIcons", "labels"],
    needs: ["cultures", "burgs", "states", "routes", "religions"]
  },
  {
    id: "markets",
    label: "市场与贸易",
    hint: "资源、市场与商路（贸易是动画层，开着才看得到）",
    steps: ["goods", "markets", "production"],
    layers: ["goods", "markets", "trade"],
    needs: ["burgsSpecify"]
  },
  {
    id: "military",
    label: "军事",
    hint: "按政权体量编成军团",
    steps: ["military"],
    layers: ["military"],
    needs: ["states"]
  },
  {
    id: "zones",
    label: "区域",
    hint: "战乱、疫病、天灾这类事件区域",
    steps: ["zones"],
    layers: ["zones"],
    needs: ["states", "burgs"]
  },
  {
    id: "markers",
    label: "地标",
    hint: "按地形与文化撒下地标（也可以自己钉）",
    steps: ["markers"],
    layers: ["markers"]
  },
  {
    id: "journeys",
    label: "旅程",
    hint: "生成几段旅行故事，画在地图上",
    steps: ["journeys"],
    layers: ["journeys"],
    needs: ["routes"]
  }
];

/** 这一级已经有东西了吗（按 pack 里的数据判断，所以读档进来的图也认） */
const DONE: Record<string, () => boolean> = {
  cultures: () => (pack.cultures?.length ?? 0) > 1,
  burgs: () => (pack.burgs?.length ?? 0) > 1,
  states: () => (pack.states?.length ?? 0) > 1,
  provinces: () => (pack.provinces?.length ?? 0) > 1,
  routes: () => (pack.routes?.length ?? 0) > 0,
  religions: () => (pack.religions?.length ?? 0) > 1,
  burgsSpecify: () =>
    (pack.burgs?.length ?? 0) > 1 && (pack.burgs ?? []).every(burg => !burg || !burg.i || burg.group !== undefined),
  markets: () => (pack.markets?.length ?? 0) > 1,
  military: () => Boolean(pack.states?.some(state => state.military?.length)),
  zones: () => (pack.zones?.length ?? 0) > 0,
  markers: () => (pack.markers?.length ?? 0) > 0,
  journeys: () => (pack.journeys?.length ?? 0) > 0
};

const isDone = (id: string) => DONE[id]?.() ?? false;

/**
 * 上游把这几个步骤排在文化之后，因为它们的实现会去读 pack.cells.culture / pack.states /
 * pack.routes。它们不能进 BASE（不然后面的层没数据会崩），但也不该永远不跑：
 * 一旦前置齐了，就在下一次生长里顺手补上。
 */
const PENDING: { step: GenerationPipelineStepId; needs: string[]; done: () => boolean }[] = [
  {
    step: "riversSpecify",
    needs: ["cultures"],
    done: () => !pack.rivers?.length || pack.rivers.every(river => river.basin !== undefined)
  },
  {
    step: "featureNames",
    needs: ["cultures"],
    done: () => (pack.features ?? []).every(feature => !feature || Boolean(feature.name))
  }
];

/** 面板要的状态 */
export interface StageState extends GrowthStage {
  done: boolean;
  ready: boolean;
  /** 缺哪几级（按钮禁用时显示给用户看） */
  missing: string[];
}

export function growthState(): StageState[] {
  return STAGES.map(stage => {
    const missing = (stage.needs ?? []).filter(need => !isDone(need));
    return { ...stage, done: isDone(stage.id), ready: missing.length === 0, missing };
  });
}

function stepsFor(ids: GenerationPipelineStepId[]) {
  const set = new Set(ids);
  return generationPipelineSteps.filter(step => set.has(step.id));
}

async function run(ids: GenerationPipelineStepId[], context: { graph?: GridGraph } = {}): Promise<void> {
  const steps = stepsFor(ids);
  if (!steps.length) return;
  await new Pipeline<GenerationPipelineStepId, { graph?: GridGraph }>("地图生长", steps).run(context);
  Options.persist();
}

/** 只长地形与自然（新地图的默认） */
export async function growBase(context: { graph?: GridGraph } = {}): Promise<void> {
  await run(BASE_STEPS, context);
  ensureEmptyContainers();
}

/**
 * 上游的渲染器与统计都假定社会要素的数组都在（它从来只跑完整流水线）。只长地形时
 * 这些字段压根没被创建，任何一次重绘都会以「pack.burgs is not iterable」把整条链路
 * 打断 —— 所以这里给它们空容器：图层开着也只是画不出东西，而不是崩。
 * 读档进来的「纯陆地」图同样要过这一道。
 */
export function ensureEmptyContainers(): void {
  const bag = pack as unknown as Record<string, unknown>;
  const cells = pack.cells as unknown as Record<string, unknown>;
  if (!cells?.i) return; // 还没建图：无从下手

  const total = (cells.i as number[]).length;
  const zeros = () => new Uint16Array(total);

  for (const key of [
    "cultures",
    "burgs",
    "states",
    "provinces",
    "routes",
    "religions",
    "markets",
    "deals",
    "zones",
    "markers",
    "journeys",
    "addedLabels",
    "goods",
    "relief"
  ]) {
    bag[key] ??= [];
  }

  for (const key of ["culture", "burg", "state", "province", "religion", "good", "market"]) {
    cells[key] ??= zeros();
  }
  cells.routes ??= {};
}

/** 生长到某一级：跑它自己的步骤，再把「前置刚齐、还没跑过」的补上 */
export async function growStage(id: string): Promise<void> {
  const stage = STAGES.find(item => item.id === id);
  if (!stage) return;

  const steps = [...stage.steps];
  for (const pending of PENDING) {
    // 这一级自己的步骤也算「马上就有」：不然生成文化这一次，那条「需要文化才能跑」的
    // riversSpecify 会被判为不满足，得等到下一次生长才补上
    const ready = pending.needs.every(need => need === stage.id || isDone(need));
    if (pending.done() || !ready) continue;
    steps.push(pending.step);
  }

  await run(steps);
  ensureEmptyContainers();
  Layers.show(...stage.layers);
  if (is3dView()) Controllers.View3d.redraw();
}
