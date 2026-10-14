// 把地图上的实体交给工作区：一个条目一张卡片 + 一个图钉。
//
// 服务端**不解析** `.map`（那串文本对它是不透明的），所以抽数据在这里做：只读 pack，
// 不改地图。国家 → 省份 → 城镇 的层级走 nodes，河流这种没有上级的走 flat。
// 属性名必须与 world/geo.py 的 GEO_PROPERTIES 对齐，否则落不进卡片。
import { tip } from "@/components/tooltips";
import type { Burg } from "@/generators/burgs-generator";
import type { Province } from "@/generators/provinces-generator";
import { hostContext } from "@/services/hosted";

/** 地图坐标（地图单位）→ 百分比（库里 MapMarker 用的就是百分比） */
function percent(x: number, y: number): [number, number] {
  const { width, height } = options.map.graph;
  const round = (value: number) => Math.round(value * 100) / 100;
  return [round((x / width) * 100), round((y / height) * 100)];
}

/** 单元格中心，拿不到就退回 pole（两个都是地图坐标） */
function anchor(cell?: number, pole?: [number, number]): [number, number] {
  const point = typeof cell === "number" ? pack.cells?.p?.[cell] : undefined;
  if (point) return percent(point[0], point[1]);
  if (pole) return percent(pole[0], pole[1]);
  return [50, 50];
}

interface Node {
  kind: string;
  name: string;
  x: number;
  y: number;
  attrs: Record<string, string | number>;
  children?: Node[];
}

const number = (value: unknown) => Math.round(Number(value) || 0);
const stateName = (id: number) => pack.states?.[id]?.fullName || pack.states?.[id]?.name || "无名政权";
const provinceName = (id: number) => pack.provinces?.[id]?.fullName || pack.provinces?.[id]?.name || "无名省";

function townNode(burg: Burg, stateId: number, provinceId: number): Node {
  const [x, y] = anchor(burg.cell, [burg.x, burg.y]);
  return {
    kind: "城镇",
    name: burg.name ?? "",
    x,
    y,
    attrs: {
      所属国家: stateName(stateId),
      所属省份: provinceId ? provinceName(provinceId) : "",
      人口: number(burg.population),
      类型: burg.type ?? "",
      分组: burg.group ?? "",
      坐标: `${x}, ${y}`
    }
  };
}

function provinceNode(province: Province, children: Node[]): Node {
  const [x, y] = anchor(province.center, province.pole as [number, number] | undefined);
  return {
    kind: "省份",
    name: province.fullName || province.name,
    x,
    y,
    attrs: {
      所属国家: stateName(province.state),
      省会: pack.burgs?.[province.burg]?.name ?? "",
      面积: number(province.area),
      人口: number((province.rural ?? 0) + (province.urban ?? 0))
    },
    children
  };
}

/** 国家 → 省份 → 城镇 的层级树 */
function stateNodes(): Node[] {
  const states: Node[] = [];
  for (const state of pack.states ?? []) {
    if (!state || !state.i || state.removed || !state.name) continue;

    const [x, y] = anchor(state.center, state.pole as [number, number] | undefined);
    const provinces: Node[] = [];
    for (const provinceId of state.provinces ?? []) {
      const province = pack.provinces?.[provinceId];
      if (!province || province.removed || !province.name) continue;

      const towns: Node[] = [];
      for (const burg of pack.burgs ?? []) {
        if (!burg || !burg.i || burg.removed || !burg.name) continue;
        if ((pack.cells?.province?.[burg.cell] ?? 0) !== provinceId) continue;
        if ((burg.state ?? 0) !== state.i) continue;
        towns.push(townNode(burg, state.i, provinceId));
      }
      provinces.push(provinceNode(province, towns));
    }

    states.push({
      kind: "国家",
      name: state.fullName || state.name,
      x,
      y,
      attrs: {
        全称: state.fullName ?? state.name,
        政体: state.formName ?? state.form ?? "",
        首都: pack.burgs?.[state.capital]?.name ?? "",
        文化: pack.cultures?.[state.culture]?.name ?? "",
        面积: number(state.area),
        人口: number((state.rural ?? 0) + (state.urban ?? 0)),
        颜色: state.color ?? ""
      },
      children: provinces
    });
  }
  return states;
}

/** 没进省的城镇、没进国的省、有名字的河流 —— 都是没有上级的散件 */
function looseNodes(): Node[] {
  const placedProvinces = new Set<number>();
  const placedTowns = new Set<number>();
  for (const state of pack.states ?? []) {
    for (const id of state?.provinces ?? []) placedProvinces.add(id);
  }
  for (const burg of pack.burgs ?? []) {
    if (burg && burg.i && (pack.cells?.province?.[burg.cell] ?? 0)) placedTowns.add(burg.i);
  }

  const nodes: Node[] = [];

  for (const province of pack.provinces ?? []) {
    if (!province || province.removed || !province.name || placedProvinces.has(province.i)) continue;
    nodes.push(provinceNode(province, []));
  }

  for (const burg of pack.burgs ?? []) {
    if (!burg || !burg.i || burg.removed || !burg.name || placedTowns.has(burg.i)) continue;
    nodes.push(townNode(burg, burg.state ?? 0, 0));
  }

  for (const river of pack.rivers ?? []) {
    if (!river || !river.name) continue;
    const [x, y] = anchor(river.mouth);
    nodes.push({
      kind: "河流",
      name: river.name,
      x,
      y,
      attrs: { 长度: number(river.length), 流域: river.parent ? "支流" : "干流", 坐标: `${x}, ${y}` }
    });
  }

  return nodes;
}

/** 把当前地图上的实体整包送到工作区 */
export async function sendMapToEditor(): Promise<void> {
  const { docId, apiBase, canEdit } = hostContext();
  if (!docId) {
    tip("这张地图不在任何世界里，无法导入工作区", false, "error", 4000);
    return;
  }
  if (!canEdit) {
    tip("这张地图只读，无法导入工作区", false, "error", 4000);
    return;
  }

  const payload = { nodes: stateNodes(), flat: looseNodes() };
  if (!payload.nodes.length && !payload.flat.length) {
    tip("地图上还没有可导入的条目：先用左栏「地图生长」长出文化、城镇与政权", false, "error", 5000);
    return;
  }

  tip("正在把地图上的条目送进工作区…", false, "info", 3000);
  try {
    const response = await fetch(`${apiBase}/${docId}/import-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      counts?: Record<string, number>;
      created?: number;
      updated?: number;
      markers?: number;
    };
    const summary = Object.entries(body.counts ?? {})
      .map(([kind, count]) => `${count} 个${kind}`)
      .join("、");
    // 地图上同名的同级条目会并成一张卡，所以要说明「有几处是就地更新」，
    // 否则用户会奇怪为什么卡片数比地图上的条目少
    const merged = body.updated ? `，其中 ${body.updated} 处同名已并入既有卡片` : "";
    tip(
      `已导入工作区：${summary || "没有变化"}（${body.markers ?? 0} 个图钉）${merged}，都在「地理」文件夹里`,
      false,
      "success",
      7000
    );
  } catch (error) {
    ERROR && console.error("[editor] 导入工作区失败", error);
    tip(`导入失败：${(error as Error)?.message ?? error}`, false, "error", 5000);
  }
}
