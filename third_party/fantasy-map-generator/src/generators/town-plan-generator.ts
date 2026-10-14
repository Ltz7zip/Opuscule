// 城镇平面生成器：**我们自己的**（上游没有本地城市生成器，图1 那张平面图是 watabou 的外链）。
//
// 输出是矢量 SVG：可存库、可导出、可任意缩放，也能直接当 3D 里的城镇符号。
//
// 布局怎么来的（这一版是重写，之前那版「极坐标扇格」看着像齿轮，已废弃）：
//   1. 城圈：一个被几条谐波揉过的不规则圆（临海时被岸线切一刀）；
//   2. 路网：城门 → 主路贯到城心，再加一圈环路；
//   3. 街区：把城圈**递归切开** —— 每次沿着当前多边形的短轴切一条巷子，
//      切到街区够小为止。切出来的是一批不规则多边形，巷子就是它们之间的缝。
//      这一步是整张图像不像「城市」的关键：K-D 式的交替切割天然生成
//      大小不一、方向随机的四边形街区，而不是同心圆扇格；
//   4. 房子：每个街区先按街巷缩进一圈（留出街面），再沿短轴切成**成排的条带**，
//      条带里再切成一个个山墙相接的房子 —— 联排，而不是一栋栋孤立的小方块；
//   5. 城墙：城圈外扩一点画一圈粗线，每隔一段鼓一个塔楼，城门处断开；
//   6. 城外：主路两侧零散长出郊野聚落，再撒几处孤零零的农舍。
//
// 确定性：同一个种子永远得到同一张图（存库、重开、分享都能复现）。
//
// 配色写成 `var(--tx-*, #hex)` 形式：页面里跟随主题，导出的独立 SVG 也有兜底颜色。

export interface TownPlanInput {
  /** 名字，画在图顶 */
  name: string;
  /** 人口：决定街区密度与城外蔓延的规模 */
  population: number;
  /** 首府：城心是城堡而不是广场 */
  capital?: boolean;
  /** 有城墙 */
  walls?: boolean;
  /** 临河：切一条河，城墙与街区都为它让路 */
  river?: boolean;
  /** 临海：岸线切掉城圈一角，临水侧画码头 */
  coast?: boolean;
  /** 种子：同一个种子同一张图 */
  seed?: string | number;
  /** 规模倍率（1 = 只按人口算） */
  size?: number;
}

/** 城里用的局部坐标系：城圈基准半径。所有几何都按这个尺度算，最后整体缩放进画框 */
const R = 100;
const TWO_PI = Math.PI * 2;
const EPS = 1e-9;

// --------------------------------------------------------------------------- //
// 随机：32 位哈希 + mulberry32（小而稳，够确定）
// --------------------------------------------------------------------------- //

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const f = (value: number) => Math.round(value * 100) / 100;
/**
 * 路径坐标只留一位小数。
 * 几何是在**局部坐标**里写的（城圈半径 100），再整体 scale 到画框上（约 ×2.9）——
 * 所以 0.1 个局部单位 = 屏幕上 0.03px，肉眼绝无差别，而每个坐标能省一个字符。
 * 一张平面有五六千个顶点，这一项就是十几 KB。
 */
const fx = (value: number) => Math.round(value * 10) / 10;

/** 名字是用户可改的，进 SVG 之前必须转义（图上写的不是标记） */
const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );

// --------------------------------------------------------------------------- //
// 平面几何：点 / 向量 / 多边形
// --------------------------------------------------------------------------- //

interface Pt {
  x: number;
  y: number;
}

const v = (x: number, y: number): Pt => ({ x, y });
const add = (a: Pt, b: Pt): Pt => v(a.x + b.x, a.y + b.y);
const sub = (a: Pt, b: Pt): Pt => v(a.x - b.x, a.y - b.y);
const mul = (a: Pt, k: number): Pt => v(a.x * k, a.y * k);
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l);
};
/** 左手法线：逆时针多边形的内侧方向 */
const left = (a: Pt): Pt => v(-a.y, a.x);
const lerp = (a: Pt, b: Pt, t: number): Pt => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const rotate = (a: Pt, angle: number): Pt => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return v(a.x * c - a.y * s, a.x * s + a.y * c);
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 有符号面积：> 0 表示逆时针 */
function signedArea(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

const polyArea = (poly: Pt[]) => Math.abs(signedArea(poly));

function centroid(poly: Pt[]): Pt {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) return poly.length ? poly[0] : v(0, 0);
  let x = 0;
  let y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const w = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * w;
    y += (p.y + q.y) * w;
  }
  return v(x / (6 * a), y / (6 * a));
}

/** 去掉挨在一起的重合点，并保证首尾不重复 */
function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(p, last) > 1e-4) out.push(p);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-4) out.pop();
  return out;
}

/** 统一成逆时针：后面的「内侧法线 = 左手法线」依赖这个约定 */
function ensureCCW(poly: Pt[]): Pt[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

const toPath = (points: Pt[]) => `${points.map((p, i) => `${i ? "L" : "M"}${fx(p.x)} ${fx(p.y)}`).join(" ")}Z`;
const toLine = (points: Pt[]) => points.map((p, i) => `${i ? "L" : "M"}${fx(p.x)} ${fx(p.y)}`).join(" ");
const face = (points: Pt[], fill: string, stroke: string, width = 0) =>
  `<path d="${toPath(points)}" fill="${fill}"${stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="${width}"`}/>`;

/**
 * 把同一类的所有多边形合并进**一个** path（多个子路径拼在同一个 d 里）。
 * 外壳 `<path class="tp-house" d="` + `"/>` 有二十来个字符，而一张平面有几百栋房子 ——
 * 光省这层壳就是十几 KB，画出来的东西一个像素都不变。
 */
const merged = (parts: string[], cls: string, extra = "") =>
  parts.length ? `<path class="${cls}" d="${parts.join(" ")}"${extra}/>` : "";

/** 圆点（塔楼）画成一个子路径的圆，省掉几十个 circle 元素 */
const circlePath = (center: Pt, r: number) =>
  `M${fx(center.x - r)} ${fx(center.y)}a${fx(r)} ${fx(r)} 0 1 0 ${fx(r * 2)} 0a${fx(r)} ${fx(r)} 0 1 0 ${fx(-r * 2)} 0`;

/**
 * 水带：沿折线铺一条**宽度沿程变化**的多边形。
 * 用等宽描边画河，出来是一条上下两条硬边、通篇一样粗的"漆带"，一眼假。
 * 按当地河宽往两侧各偏移一次再合围，才有河的样子（上游细、下游宽）。
 */
function ribbon(points: Pt[], halfWidth: (t: number) => number): Pt[] {
  const leftSide: Pt[] = [];
  const rightSide: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const nrm = left(unit(sub(next, prev)));
    const half = halfWidth(i / Math.max(points.length - 1, 1));
    leftSide.push(add(points[i], mul(nrm, half)));
    rightSide.push(sub(points[i], mul(nrm, half)));
  }
  return [...leftSide, ...rightSide.reverse()];
}

/** Catmull-Rom → 三次贝塞尔：把折线画成柔和的曲线（路、河都用它） */
function curvePath(points: Pt[]): string {
  if (points.length < 2) return "";
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = v(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6);
    const c2 = v(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6);
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** 线段 a→b 穿过了多边形的哪条边（返回交点与边的下标） */
function boundaryHit(poly: Pt[], a: Pt, b: Pt): { point: Pt; edge: number } | null {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const hit = segIntersect(a, b, poly[i], poly[(i + 1) % n]);
    if (hit) return { point: hit, edge: i };
  }
  return null;
}

/** 从 A 沿多边形边界**正向**走到 B（A、B 分别落在这两条边上） */
function walkBoundary(poly: Pt[], edgeA: number, A: Pt, edgeB: number, B: Pt): Pt[] {
  const n = poly.length;
  const out: Pt[] = [A];
  let i = (edgeA + 1) % n;
  let guard = 0;
  while (guard++ <= n) {
    out.push(poly[i]);
    if (i === edgeB) break;
    i = (i + 1) % n;
  }
  out.push(B);
  return out;
}

interface CurveCut {
  /** 曲线落在多边形里的那一段，两端正好在边界上 —— 也就是两半共享的那条缝 */
  seam: Pt[];
  parts: [Pt[], Pt[]];
}

/**
 * 沿一条曲线把多边形切成两半。
 *
 * 这是「弯街」的正解：以前的写法是先用直线切、再给整张图加密一遍然后叠个位移场，
 * 曲线是"揉"出来的 —— 代价是每个多边形都要插进 4 倍的点（一张平面 150KB）。
 * 直接按曲线切，缝本身就是弯的，插 7 个点就够，而且房子该是直边还是直边。
 *
 * 做法：把曲线取样一遍扫出「哪一段在多边形里」，两端的精确交点用二值细分补出来；
 * 两半各自沿着边界正向走一圈再沿曲线缝绕回来，所以拼回去严丝合缝。
 */
function cutByCurve(poly: Pt[], curve: (t: number) => Pt, tFrom = -1.25, tTo = 1.25, scan = 56): CurveCut | null {
  if (poly.length < 3) return null;
  const ts: number[] = [];
  const samples: Pt[] = [];
  for (let i = 0; i <= scan; i++) {
    const t = tFrom + ((tTo - tFrom) * i) / scan;
    ts.push(t);
    samples.push(curve(t));
  }

  let first = -1;
  let last = -1;
  for (let i = 0; i <= scan; i++) {
    if (!pointInPoly(samples[i], poly)) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first <= 0 || last >= scan || first === last) return null;

  const hitA = boundaryHit(poly, samples[first - 1], samples[first]);
  const hitB = boundaryHit(poly, samples[last + 1], samples[last]);
  if (!hitA || !hitB || hitA.edge === hitB.edge) return null;

  // 缝：两端是精确交点，中间按曲线取样 —— 7 个点足够顺
  const seam: Pt[] = [hitA.point];
  const innerSteps = 7;
  for (let k = 1; k < innerSteps; k++) {
    seam.push(curve(ts[first] + ((ts[last] - ts[first]) * k) / innerSteps));
  }
  seam.push(hitB.point);

  const forward = walkBoundary(poly, hitA.edge, hitA.point, hitB.edge, hitB.point);
  const backward = walkBoundary(poly, hitB.edge, hitB.point, hitA.edge, hitA.point);
  const inner = seam.slice(1, -1);
  const partA = [...forward, ...[...inner].reverse()];
  const partB = [...backward, ...inner];
  if (partA.length < 3 || partB.length < 3) return null;
  if (polyArea(partA) < 1e-3 || polyArea(partB) < 1e-3) return null;
  return { seam, parts: [partA, partB] };
}

/** 用一条过 point、法线为 normal 的直线把多边形切开（两侧各留一半） */
function clipHalf(poly: Pt[], point: Pt, normal: Pt): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => dot(sub(p, point), normal);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = side(a);
    const db = side(b);
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      out.push(lerp(a, b, t));
    }
  }
  return dedupe(out);
}

/**
 * 定向包围盒：先取最远点对定出主方向，再把所有点投影上去量出真正的外接范围。
 * 必须用外接盒（而不是「最远点 + 单侧最大距离」）—— 之前就是这么写的，
 * 盒子中心偏掉，于是贴着一角铺房子、大半个街区空着。
 */
function extent(poly: Pt[]): { mid: Pt; dir: Pt; length: number; width: number } | null {
  if (poly.length < 3) return null;
  let best = 0;
  let a = poly[0];
  let b = poly[1];
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 1; j < poly.length; j++) {
      const d = dist(poly[i], poly[j]);
      if (d > best) {
        best = d;
        a = poly[i];
        b = poly[j];
      }
    }
  if (best < EPS) return null;
  const dir = unit(sub(b, a));
  const nrm = left(dir);
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    const u = dot(p, dir);
    const w = dot(p, nrm);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, w);
    maxV = Math.max(maxV, w);
  }
  return {
    mid: add(mul(dir, (minU + maxU) / 2), mul(nrm, (minV + maxV) / 2)),
    dir,
    length: maxU - minU,
    width: maxV - minV
  };
}

/** 多边形内缩：顶点沿角平分线推进 d，斜接长度封顶，免得尖角炸出长刺 */
function insetPoly(poly: Pt[], d: number): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];
    const n1 = left(unit(sub(cur, prev)));
    const n2 = left(unit(sub(next, cur)));
    const bis = unit(add(n1, n2));
    const cosHalf = dot(bis, n1);
    if (!Number.isFinite(bis.x) || !Number.isFinite(bis.y)) {
      out.push(cur);
      continue;
    }
    const k = d / Math.max(cosHalf, 0.4);
    out.push(add(cur, mul(bis, k)));
  }
  return dedupe(out);
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 折线上按弧长取点，返回点与切向（城门就按弧长均分放） */
function alongPolyline(points: Pt[], fraction: number): { point: Pt; tangent: Pt } {
  const total: number[] = [0];
  for (let i = 1; i < points.length; i++) total.push(total[i - 1] + dist(points[i - 1], points[i]));
  const target = clamp(fraction, 0, 1) * total[total.length - 1];
  for (let i = 1; i < points.length; i++) {
    if (total[i] >= target) {
      const t = (target - total[i - 1]) / Math.max(total[i] - total[i - 1], EPS);
      return {
        point: lerp(points[i - 1], points[i], t),
        tangent: unit(sub(points[i], points[i - 1]))
      };
    }
  }
  return { point: points[points.length - 1], tangent: unit(sub(points[points.length - 1], points[points.length - 2])) };
}

/** 到折线的最近距离（河：落在河道里的街区要让开） */
function distToPolyline(p: Pt, points: Pt[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ab = sub(b, a);
    const t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), EPS), 0, 1);
    best = Math.min(best, dist(p, lerp(a, b, t)));
  }
  return best;
}

/** 以城心为原点的极坐标取点（城圈、农田环扇都用它） */
const pointAt = (radius: number, angle: number): Pt => v(Math.cos(angle) * radius, Math.sin(angle) * radius);

/** 城外的一片农田：环扇形。图1 左上角那种斜线地块 */
function farmField(angle: number, span: number, inner: number, outer: number): Pt[] {
  // 按弧长取点（每 ~8 单位一段），不然大半径上的外弧会被画成折线
  const steps = Math.max(6, Math.round((Math.abs(span) * outer) / 8));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) pts.push(pointAt(outer, angle + (span * i) / steps));
  for (let i = steps; i >= 0; i--) pts.push(pointAt(inner, angle + (span * i) / steps));
  return pts;
}

// --------------------------------------------------------------------------- //
// 生成
// --------------------------------------------------------------------------- //

export function buildTownPlanSvg(input: TownPlanInput): string {
  const seedText = `${input.seed ?? input.name}:${input.name}`;
  const seedValue = hash(seedText);
  const random = makeRandom(seedValue);
  const range = (lo: number, hi: number) => lo + random() * (hi - lo);
  const chance = (p: number) => random() < p;

  // 人口只影响密度与城外规模，不影响城圈大小 —— 城圈永远填满画框（之前那版
  // 按人口线性缩半径，结果小村子在画布上只有一小团，很空）
  const population = clamp(input.population || 400, 20, 400000);
  const sizeMul = clamp(input.size ?? 1, 0.4, 3);
  const heft = clamp((population / 3000) ** 0.22 * sizeMul, 0.45, 2.4);

  // ---- 1. 城圈：揉过的不规则圆 ------------------------------------------- //
  // 谐波给得足一点：拆掉全局变形之后，城圈的"不规则"全指望这几个谐波了，
  // 振幅太小会变成一个规规矩矩的圆（图1/图2 的城廓都是有胖有瘦的）
  const harmonicCount = 5;
  const amps = Array.from({ length: harmonicCount }, () => range(0.022, 0.075));
  const phases = Array.from({ length: harmonicCount }, () => range(0, TWO_PI));
  const squash = range(0.8, 1);
  const tilt = range(0, Math.PI);

  const boundaryPoint = (theta: number): Pt => {
    let r = 1;
    for (let k = 0; k < harmonicCount; k++) r += amps[k] * Math.cos((k + 2) * theta + phases[k]);
    const local = v(Math.cos(theta) * r * R, Math.sin(theta) * r * squash * R);
    return rotate(local, tilt);
  };

  let town = ensureCCW(dedupe(Array.from({ length: 200 }, (_, i) => boundaryPoint((i / 200) * TWO_PI))));

  // ---- 2. 临海：岸线切掉一角，陆地一侧留岸线本身 ------------------------ //
  const coastNormal = unit(v(Math.cos(range(0, TWO_PI)), Math.sin(range(0, TWO_PI))));
  const coastOffset = R * range(0.5, 0.78);
  const coastPoint = mul(coastNormal, -coastOffset); // 岸线上的一点
  const onLand = (p: Pt) => !input.coast || dot(sub(p, coastPoint), coastNormal) > 0;
  // 岸线也走曲线切割：直棱棱地切一刀像用裁纸刀裁的，缓弯一下才像海湾
  const coastTangent = left(coastNormal);
  const coastBow = R * range(-0.12, 0.12);
  const coastCurve = (t: number) =>
    add(add(coastPoint, mul(coastTangent, t * R * 1.6)), mul(coastNormal, coastBow * (1 - t * t)));
  let shore: Pt[] | null = null;
  if (input.coast) {
    const cut = cutByCurve(town, coastCurve, -1.7, 1.7);
    if (cut) {
      const landFirst = dot(sub(centroid(cut.parts[0]), coastPoint), coastNormal) > 0;
      town = ensureCCW(dedupe(landFirst ? cut.parts[0] : cut.parts[1]));
      shore = landFirst ? cut.seam : [...cut.seam].reverse();
    } else {
      town = ensureCCW(dedupe(clipHalf(town, coastPoint, coastNormal)));
      shore = shoreEdge(town, coastPoint, coastNormal);
    }
  }
  // 海：沿着岸线弧往外铺一条宽到出画的带子
  const seaArc = Array.from({ length: 17 }, (_, i) => coastCurve(-1.7 + (3.4 * i) / 16));
  const seaD = toPath([
    ...seaArc,
    add(seaArc[seaArc.length - 1], mul(coastNormal, -R * 6)),
    add(seaArc[0], mul(coastNormal, -R * 6))
  ]);

  // ---- 3. 河：从图外穿到图外、贴着城墙外侧流过去 ------------------------ //
  // 关键：河不能压到城里。压上去就变成一条把城劈开的蓝带，城墙上还得开个
  // 没头没脑的缺口；图1 的河就是紧挨着城墙外侧走的，墙是完整的。
  const riverPoints: Pt[] = [];
  let riverWidth = 0;
  if (input.river) {
    const base = unit(v(Math.cos(range(0, TWO_PI)), Math.sin(range(0, TWO_PI))));
    const perp = left(base);
    const offset = R * range(1.1, 1.36) * (chance(0.5) ? 1 : -1);
    const wobble = R * range(0.05, 0.12);
    const meander = R * range(0.04, 0.1);
    // 两层正弦叠出河道该有的弯（只有一层看着像一条直渠）；采密点，之后直接连线画
    for (let step = -40; step <= 40; step++) {
      const t = step / 40;
      const along = mul(base, t * R * 2);
      const lateral = mul(perp, offset + Math.sin(t * 3.1 + 1.2) * wobble + Math.sin(t * 1.35 + 0.4) * meander);
      riverPoints.push(add(along, lateral));
    }
    // 兜底：整体往外推，保证最近处离城心仍有 1.06R（城圈 1.0R + 城墙厚度）
    const clearance = R * 1.06;
    const closest = riverPoints.reduce((min, p) => Math.min(min, len(p)), Number.POSITIVE_INFINITY);
    if (closest < clearance) {
      const push = clearance - closest;
      for (let i = 0; i < riverPoints.length; i++) {
        riverPoints[i] = add(riverPoints[i], mul(unit(riverPoints[i]), push));
      }
    }
    riverWidth = R * range(0.05, 0.075);
  }
  /** 河宽沿程变化的半宽：上游细、下游宽 */
  const riverHalf = (t: number) => (riverWidth / 2) * (0.62 + 0.72 * t + 0.1 * Math.sin(t * 5.2));
  const riverRibbon = riverPoints.length ? ribbon(riverPoints, riverHalf) : [];
  const riverDist = (p: Pt) => (riverPoints.length ? distToPolyline(p, riverPoints) : Number.POSITIVE_INFINITY);
  const inWater = (p: Pt) => !onLand(p);

  // ---- 4. 城门与城心 ----------------------------------------------------- //
  const gateCount = clamp(Math.round(range(input.coast ? 2.6 : 3.2, input.coast ? 4.4 : 5.4)), 3, 6);
  const gateShift = random();
  const gates = Array.from({ length: gateCount }, (_, i) => {
    const at = alongPolyline([...town, town[0]], ((i + 0.5 + gateShift) * 0.998) / gateCount);
    // 城圈是逆时针的，行进方向的左侧是城内 —— 所以朝外要取右法线
    return { point: at.point, outward: unit(mul(left(at.tangent), -1)) };
  }).filter(gate => onLand(gate.point));

  let hub = v(range(-0.14, 0.14) * R, range(-0.14, 0.14) * R);
  while (!onLand(hub)) hub = v(range(-0.14, 0.14) * R, range(-0.14, 0.14) * R);

  // ---- 5. 街区：把城圈递归切开 ------------------------------------------ //
  const blockTarget = R * clamp(0.38 - heft * 0.06, 0.2, 0.36);
  const blocks: Pt[][] = [];
  /** 巷子：每次切割留下的那条曲线缝，直接拿来画街 */
  const lanes: Pt[][] = [];

  const subdivide = (poly: Pt[], depth: number): void => {
    const ex = extent(poly);
    const middle = centroid(poly);
    // 海里的那块直接不要；河不参与裁剪 —— 河是后画的，压在城上就自然把城切开了
    if (inWater(middle)) return;
    if (!ex || depth >= 7 || ex.length < blockTarget * 1.05 || polyArea(poly) < R * R * 0.002) {
      blocks.push(poly);
      return;
    }
    // 切线垂直于主方向（带点抖动），过外接盒中心附近：切出来的街区接近方形而不是长条；
    // 抖动给得偏大，避免上下两刀共线、切出一根笔直贯穿全城的假街。
    // 刀口本身是一条缓弯 —— 弧的挠度写进曲线里，所以切出来的边界天生是弯的。
    const normal = rotate(ex.dir, range(-0.34, 0.34));
    const through = add(ex.mid, mul(ex.dir, range(-0.3, 0.3) * ex.length));
    const tangent = left(normal);
    const span = Math.max(ex.length, ex.width) * 0.8;
    const bow = span * range(-0.2, 0.2);
    const cut = cutByCurve(poly, t => add(add(through, mul(tangent, t * span)), mul(normal, bow * (1 - t * t))));
    if (!cut) {
      blocks.push(poly);
      return;
    }
    // 切出来的两半都得放得下一排房子；否则宁可要一个大街区，也别切出一根细长条
    const thin = R * 0.05;
    const boxA = extent(cut.parts[0]);
    const boxB = extent(cut.parts[1]);
    if (!boxA || !boxB || Math.min(boxA.length, boxA.width) < thin || Math.min(boxB.length, boxB.width) < thin) {
      blocks.push(poly);
      return;
    }
    lanes.push(cut.seam);
    subdivide(cut.parts[0], depth + 1);
    subdivide(cut.parts[1], depth + 1);
  };
  subdivide(town, 0);

  // ---- 6. 房子：街区 → 成排条带 → 山墙相接的联排 ------------------------ //
  // 街宽 / 房缝要拉开档：巷子约 1.4，房与房之间只留 0.4，这样「街」才读得出来
  const streetHalf = R * 0.007;
  const houseDepth = R * range(0.052, 0.066);
  const houseCells: Pt[][] = [];
  const houseBig: Pt[][] = [];
  const openSquares: Pt[][] = [];
  /** 内院：街区里挖出来的空地，最后画在房子之上，像图2 那些露白 */
  const yards: Pt[][] = [];

  /** 把一条条带切成若干房子（联排：彼此只隔一条发丝缝） */
  const fillStrip = (strip: Pt[]): void => {
    const ex = extent(strip);
    if (!ex || ex.length < R * 0.025) return;
    const u = ex.dir;
    // 偶尔整条带就是一栋大房子（行会、仓库、教堂那类体量）
    if (chance(0.07) && ex.length > R * 0.1 && ex.width > R * 0.035) {
      const big = insetPoly(strip, R * 0.005);
      if (big.length >= 3 && polyArea(big) > R * R * 0.0006) houseBig.push(big);
      return;
    }
    const unitW = R * range(0.075, 0.1);
    const count = Math.max(1, Math.round(ex.length / unitW));
    const step = ex.length / count;
    let i = 0;
    while (i < count) {
      const merge = i + 1 < count && chance(0.16);
      const span = merge ? 2 : 1;
      const offset = -ex.length / 2 + step * (i + span / 2);
      const center = add(ex.mid, mul(u, offset));
      const slab = clipHalf(
        clipHalf(strip, add(center, mul(u, (step * span) / 2)), mul(u, -1)),
        add(center, mul(u, -(step * span) / 2)),
        u
      );
      i += span;
      if (slab.length < 3) continue;
      const cell = insetPoly(slab, Math.min(R * 0.002, step * 0.05));
      if (cell.length < 3) continue;
      // 别留细长条：一两单位宽的"房子"看着就是一条亮线，不像建筑
      const cellBox = extent(cell);
      if (!cellBox || Math.min(cellBox.length, cellBox.width) < R * 0.012) continue;
      const area = polyArea(cell);
      if (area < R * R * 0.00035) continue;
      // 留院子：这一格不盖房，改成一块内院
      if (chance(0.12)) {
        yards.push(cell);
        continue;
      }
      if (area > R * R * 0.012) houseBig.push(cell);
      else houseCells.push(cell);
    }
  };

  /** 街区的用地范围（缩进街宽之后）。渲染时还要过一遍变形 */
  const blockPlots: Pt[][] = [];

  for (const block of blocks) {
    const plot = insetPoly(block, streetHalf);
    if (plot.length < 3 || polyArea(plot) < R * R * 0.0007) continue;
    blockPlots.push(plot);
    // 空场：集市、教堂前庭、绿地 —— 整块不盖房，只留一片空地
    if (chance(0.05)) {
      openSquares.push(plot);
      continue;
    }
    const ex = extent(plot);
    if (!ex) continue;

    // 大宅子的院落：在街区心里挖一块大内院（画在房子之上，所以能切开联排）
    if (chance(0.2)) {
      const yard = insetPoly(plot, Math.min(ex.length, ex.width) * range(0.22, 0.32));
      if (yard.length >= 3 && polyArea(yard) > R * R * 0.0012) yards.push(yard);
    }

    // 沿短轴切出一排排条带：条带长边平行于主方向，房子就一排排面朝街
    const rows = Math.max(1, Math.round(ex.width / houseDepth));
    const rowStep = ex.width / rows;
    const normal = left(ex.dir);
    for (let row = 0; row < rows; row++) {
      const offset = -ex.width / 2 + rowStep * (row + 0.5);
      const center = add(ex.mid, mul(normal, offset));
      const half = mul(normal, rowStep / 2);
      const strip = clipHalf(clipHalf(plot, add(center, half), mul(normal, -1)), sub(center, half), normal);
      if (strip.length < 3 || polyArea(strip) < R * R * 0.00025) continue;
      fillStrip(strip);
    }
  }

  // ---- 7. 城外：主路两侧的郊野聚落 + 散落农舍 --------------------------- //
  const suburb: Pt[][] = [];
  const roads: Pt[][] = [];
  const roadWidth = R * 0.021;
  const sprawl = clamp(Math.round(heft * 7 - 1), 2, 16);

  for (const gate of gates) {
    const outward = gate.outward;
    const side = left(outward);
    // 出城那一截画得够长，让它跑出画框 —— 像图2 那样路是从图边进来的
    const outerEnd = add(gate.point, mul(outward, R * range(0.52, 0.82)));
    // 城内那截：城门 → 偏一点的中转 → 城心
    const bend = add(lerp(gate.point, hub, 0.45), mul(side, range(-0.12, 0.12) * R));
    roads.push([outerEnd, gate.point, bend, hub]);

    // 沿出城的路往外撒聚落（不能撒太远，否则画框会被郊野撑大、城就变小了）
    const fringe = add(gate.point, mul(outward, R * 0.34));
    for (let i = 0; i < sprawl; i++) {
      const t = (i + 1) / (sprawl + 1);
      const along = lerp(gate.point, fringe, t * t);
      const lateral = mul(side, range(0.5, 1) * (chance(0.5) ? 1 : -1) * R * range(0.04, 0.11));
      const origin = add(along, lateral);
      if (inWater(origin)) continue;
      const groupSize = clamp(Math.round(range(1, 4.6)), 1, 5);
      for (let g = 0; g < groupSize; g++) {
        const spot = add(origin, v(range(-1, 1) * R * 0.04, range(-1, 1) * R * 0.04));
        if (inWater(spot)) continue;
        const angle = Math.atan2(outward.y, outward.x) + range(-0.6, 0.6);
        const w = R * range(0.03, 0.055);
        const h = R * range(0.02, 0.038);
        suburb.push(box(spot, angle, w, h));
      }
    }
  }

  // 田野里孤零零的农舍
  const farmsteads = clamp(Math.round(heft * 4), 1, 9);
  for (let i = 0; i < farmsteads; i++) {
    const angle = range(0, TWO_PI);
    const radius = R * range(1.08, 1.26);
    const spot = v(Math.cos(angle) * radius, Math.sin(angle) * radius);
    if (inWater(spot)) continue;
    suburb.push(box(spot, range(0, TWO_PI), R * range(0.028, 0.045), R * range(0.02, 0.032)));
  }

  // ---- 7.5 农田：在城门之间的大空档里铺两片斜线地块（图1 的 Farmland） --- //
  const fields: Pt[][] = [];
  const gateBearings = gates.map(gate => Math.atan2(gate.point.y, gate.point.x)).sort((a, b) => a - b);
  const gaps: { mid: number; span: number }[] = [];
  for (let i = 0; i < gateBearings.length; i++) {
    const from = gateBearings[i];
    const to = i + 1 < gateBearings.length ? gateBearings[i + 1] : gateBearings[0] + TWO_PI;
    gaps.push({ mid: (from + to) / 2, span: to - from });
  }
  gaps.sort((a, b) => b.span - a.span);
  const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (const gap of gaps) {
    if (fields.length >= 2) break;
    if (gap.span < 1.05) continue;
    // 图顶那条留给标题：农田压上去会盖住城名
    if (angleGap(gap.mid, -Math.PI / 2) < 0.62) continue;
    const span = gap.span * 0.5;
    const poly = farmField(gap.mid - span / 2, span, R * range(1.06, 1.13), R * range(1.36, 1.56));
    // 泡在水里、或者正压在河上的地块不要
    if (poly.some(p => inWater(p) || riverDist(p) < riverWidth * 1.3)) continue;
    fields.push(poly);
  }

  // ---- 8. 环路：贴着城墙内侧绕一圈 -------------------------------------- //
  const ringScale = 0.885;
  const ring = ensureCCW(town.map(p => mul(p, ringScale)));

  // ---- 9. 城墙：粗线 + 塔楼鼓包 + 城门断口 ------------------------------ //
  let wall = "";
  // 城墙要"厚"：贴着城圈外侧一道粗带。写细了就变成一条串珠链 ——
  // 细线上挂一排点，怎么看都不是墙。厚度也和城圈贴紧，别在房子和墙之间留一圈空壕。
  const wallScale = 1.022;
  const wallWidth = R * 0.042;
  const towerSpots: Pt[] = [];
  const wallSegments: Pt[][] = [];
  if (input.walls) {
    const samples = 220;
    let current: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const p = mul(boundaryPoint((i / samples) * TWO_PI), wallScale);
      const nearGate = gates.some(gate => dist(gate.point, p) < R * 0.085);
      // 河已经在墙外了（见第 3 步的兜底外推），墙上不再为它开口
      if (!onLand(p) || nearGate) {
        if (current.length > 2) wallSegments.push(current);
        current = [];
        continue;
      }
      current.push(p);
    }
    if (current.length > 2) wallSegments.push(current);

    // 墙点本身就是加密采样出来的，直接连线即可 ——
    // 走 curvePath 会把 220 个点变成 220 段三次贝塞尔，白白多出十来个 KB
    const wallLines: string[] = wallSegments.map(toLine);
    // 塔楼：沿墙等距鼓一个圆包。直径只比墙厚一点，才是"墙上的墩"而不是"线上的珠子"；
    // 每段的头尾各钉一个 —— 墙在城门口、在岸边都是"收在塔上"的，不能就那么平着断掉
    const towerGap = R * 0.1;
    for (const segment of wallSegments) {
      let prev: Pt | null = null;
      for (let i = 0; i < segment.length; i++) {
        const p = segment[i];
        const isEnd = i === 0 || i === segment.length - 1;
        if (!isEnd) {
          if (prev && dist(prev, p) < towerGap) continue;
          if (gates.some(gate => dist(gate.point, p) < R * 0.075)) continue;
        }
        towerSpots.push(p);
        prev = p;
      }
    }
    const towerRadius = R * 0.027;
    const towerD = towerSpots.map(spot => circlePath(spot, towerRadius));
    wall = merged(wallLines, "tp-wall", ` stroke-width="${f(wallWidth)}" stroke-linecap="round"`);
    wall += merged(towerD, "tp-tower");
    // 城门：断口处补一座门楼（正好压在河上或水里就不补了）
    for (const gate of gates) {
      const at = mul(gate.point, wallScale);
      if (inWater(at) || riverDist(at) < riverWidth * 1.5) continue;
      const angle = Math.atan2(gate.outward.y, gate.outward.x) + range(-0.2, 0.2);
      wall += face(
        box(at, angle, R * 0.055, R * 0.055),
        "var(--town-house,#45413a)",
        "var(--tx-dim,#67635d)",
        f(R * 0.007)
      );
    }
  }

  // ---- 10. 首府：城心换成城堡 ------------------------------------------- //
  let citadel = "";
  if (input.capital) {
    const holder = blocks.find(block => pointInPoly(hub, block)) ?? blocks[0];
    if (holder) {
      // 城堡圈只占所在街区的一部分，别整块涂黑 —— 那会在城心挖出一个大黑洞
      const box0 = extent(holder);
      const shrink = box0 ? Math.min(box0.length, box0.width) * 0.2 : R * 0.02;
      const keepPoly = insetPoly(holder, shrink);
      const ex = keepPoly.length >= 3 ? extent(keepPoly) : null;
      if (ex) {
        const keepAngle = Math.atan2(ex.dir.y, ex.dir.x);
        const minSide = Math.min(ex.length, ex.width);
        // 城堡圈用凹陷的一档：否则它的填色和周围街块几乎一样，
        // 图上只剩一圈浅色描边，看着像一条凭空多出来的细线
        citadel += face(keepPoly, "var(--town-square,#1b1a17)", "var(--tx-dim,#67635d)", f(R * 0.008));
        // 主楼 + 侧翼 + 一座塔：三块就够读出「城堡」
        citadel += face(
          box(hub, keepAngle, minSide * 0.52, minSide * 0.4),
          "var(--town-house,#45413a)",
          "var(--tx-dim,#67635d)",
          f(R * 0.006)
        );
        citadel += face(
          box(add(hub, mul(left(ex.dir), minSide * 0.36)), keepAngle + range(-0.3, 0.3), minSide * 0.3, minSide * 0.26),
          "var(--town-house,#45413a)",
          "var(--tx-dim,#67635d)",
          f(R * 0.005)
        );
        citadel += face(
          box(add(hub, mul(ex.dir, minSide * 0.42)), 0, minSide * 0.2, minSide * 0.2),
          "var(--tx-canvas-sunken,#0d0c0b)",
          "var(--tx-dim,#67635d)",
          f(R * 0.006)
        );
      }
    }
  }

  // ---- 11. 分区标注：挑几个大区块写名字 --------------------------------- //
  const districtNames: string[] = [];
  const labelBlocks = [...blocks]
    .map(block => ({ block, area: polyArea(block), center: centroid(block) }))
    .filter(item => item.area > R * R * 0.008 && !inWater(item.center) && riverDist(item.center) > riverWidth)
    .sort((a, b) => b.area - a.area);
  const used: Pt[] = [];
  for (const item of labelBlocks) {
    if (districtNames.length >= 4) break;
    if (used.some(p => dist(p, item.center) < R * 0.42)) continue;
    used.push(item.center);
    const at = item.center;
    districtNames.push(
      `<text class="tp-district" x="${f(at.x)}" y="${f(at.y)}" text-anchor="middle" transform="rotate(${f(angleFor(extent(item.block)))} ${f(at.x)} ${f(at.y)})">${districtLabel(random)}</text>`
    );
  }

  // ---- 12. 取景：把内容整体缩放进画框（城镇填满画面） ------------------ //
  // 只按「城 + 郊野」定框：河、出城公路、农田故意不算进来，让它们直接跑出画框，
  // 否则一条长河会把画框撑大、把城挤小（第一版就是这么变空的）
  const framePlots = blockPlots;
  // 城墙是画在城圈外侧的一道粗带，取景要算上它的外沿，否则会被画框切掉一点
  const townOuter = input.walls ? town.map(p => mul(p, wallScale + wallWidth / (2 * R))) : town;
  const bounds: Pt[] = [];
  for (const poly of [townOuter, ...framePlots, ...houseCells, ...houseBig, ...suburb]) {
    for (const p of poly) bounds.push(p);
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of bounds) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const boxW = R * 0.03 + (maxX - minX);
  const boxH = R * 0.03 + (maxY - minY);
  const frame = { x: 46, y: 96, w: 908, h: 780 };
  const scale = Math.min(frame.w / boxW, frame.h / boxH);
  const tx = frame.x + frame.w / 2 - ((minX + maxX) / 2) * scale;
  const ty = frame.y + frame.h / 2 - ((minY + maxY) / 2) * scale;

  // ---- 14. 组装 --------------------------------------------------------- //
  const gridId = `tp-grid-${seedValue.toString(36)}`;
  const farmId = `tp-farm-${seedValue.toString(36)}`;
  const safeName = escapeXml(input.name);
  const traits = [
    input.walls ? "有城墙" : "",
    input.river ? "临河" : "",
    input.coast ? "临海" : "",
    input.capital ? "首府" : "",
    fields.length ? "有农田" : ""
  ].filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" role="img" aria-label="${safeName} 城镇平面">
  <style>
    /* 类名一律带 tp- 前缀：这张样式表内联在页面里时是文档级的，
       通用的 .label / .name / .gate 会与 FMG 自己的规则互相污染。
       注意：这段样式**不能出现尖括号** —— SVG 里的 style 走外部内容解析，
       一个字面量尖括号标签会把后面的图形全部吞进去。 */
    .tp-field { fill: var(--town-field,#171613); }
    .tp-hatch { fill: url(#${farmId}); }
    .tp-face { fill: var(--town-block,#23221e); }
    .tp-yard { fill: var(--town-yard,#171613); }
    .tp-open { fill: var(--town-square,#1b1a17); }
    .tp-green { fill: var(--town-green,#24301f); }
    .tp-house { fill: var(--town-house,#45413a); stroke: var(--town-line,#131210); stroke-width: 0.4; }
    .tp-suburb { fill: var(--town-house,#45413a); stroke: var(--town-line,#131210); stroke-width: 0.5; }
    .tp-big { fill: var(--town-house,#45413a); stroke: var(--town-line,#131210); stroke-width: 0.8; }
    .tp-lane { fill: none; stroke: var(--tx-canvas-sunken,#0d0c0b); }
    .tp-road { fill: none; stroke: var(--tx-canvas-sunken,#0d0c0b); }
    .tp-ring { fill: none; stroke: var(--tx-canvas-sunken,#0d0c0b); }
    .tp-wall { fill: none; stroke: var(--tx-dim,#67635d); }
    .tp-edge { fill: none; stroke: var(--tx-hairline-strong,#3d3a36); }
    .tp-tower { fill: var(--tx-canvas-sunken,#0d0c0b); stroke: var(--tx-dim,#67635d); stroke-width: 0.5; }
    .tp-water { fill: var(--town-water,#1b2a33); }
    .tp-river { fill: var(--town-water,#1b2a33); stroke: var(--tx-hairline-strong,#3d3a36); stroke-width: 0.8; }
    .tp-shore { fill: none; stroke: var(--tx-dim,#67635d); }
    .tp-district { fill: var(--tx-mute,#8f8b84); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 9px; letter-spacing: 0.34em; opacity: 0.8; }
    .tp-farm-label { fill: var(--tx-dim,#67635d); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 8px; letter-spacing: 0.3em; opacity: 0.85; }
    .tp-label { fill: var(--tx-mute,#8f8b84); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 15px; letter-spacing: 0.12em; }
    .tp-name { fill: var(--tx-ink,#f4f2ee); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 44px; font-weight: 500; letter-spacing: 0.2em; }
    .tp-meta { fill: var(--tx-mute,#8f8b84); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 15px; letter-spacing: 0.08em; }
    .tp-credit { fill: var(--tx-dim,#67635d); font-family: var(--tx-mono,ui-monospace,monospace); font-size: 13px; letter-spacing: 0.08em; }
    .tp-legend { fill: none; stroke: var(--tx-hairline,#2c2a27); stroke-width: 1; }
  </style>
  <defs>
    <pattern id="${gridId}" width="46" height="46" patternUnits="userSpaceOnUse">
      <path d="M46 0H0V46" fill="none" stroke="var(--tx-hairline,#2c2a27)" stroke-width="1"/>
    </pattern>
    <pattern id="${farmId}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
      <path d="M0 0V7" fill="none" stroke="var(--tx-hairline-strong,#3d3a36)" stroke-width="1.1"/>
    </pattern>
  </defs>
  <rect width="1000" height="1000" fill="var(--tx-canvas-sunken,#0d0c0b)"/>
  <rect width="1000" height="1000" fill="url(#${gridId})" opacity="0.5"/>
  <g transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})">
    ${input.coast ? `<path class="tp-water" d="${seaD}"/>` : ""}
    ${input.coast && shore ? coastShore(shore, coastNormal) : ""}
    ${merged(fields.map(toPath), "tp-field")}
    ${merged(fields.map(toPath), "tp-hatch")}
    ${merged(blockPlots.map(toPath), "tp-face")}
    ${merged(openSquares.filter((_, i) => i % 3 !== 0).map(toPath), "tp-open")}
    ${merged(openSquares.filter((_, i) => i % 3 === 0).map(toPath), "tp-green")}
    ${merged(houseCells.map(toPath), "tp-house")}
    ${merged(houseBig.map(toPath), "tp-big")}
    ${merged(yards.map(toPath), "tp-yard")}
    ${merged(lanes.map(toLine), "tp-lane", ` stroke-width="${f(streetHalf * 2)}"`)}
    <path class="tp-ring" d="${toLine([...ring, ring[0]])}" stroke-width="${f(R * 0.016)}"/>
    ${merged(roads.map(curvePath), "tp-road", ` stroke-width="${f(roadWidth)}"`)}
    ${citadel}
    ${
      input.river
        ? `<path class="tp-river" d="${toPath(riverRibbon)}"/>
    ${bridges(roads, riverPoints, riverWidth)}`
        : ""
    }
    ${wall}
    ${input.walls ? "" : `<path class="tp-edge" d="${toLine([...town, town[0]])}" stroke-width="${f(R * 0.006)}"/>`}
    ${merged(suburb.map(toPath), "tp-suburb")}
    <g>${districtNames.join("")}</g>
    <g>${fields
      .map(poly => centroid(poly))
      .map(at => `<text class="tp-farm-label" x="${fx(at.x)}" y="${fx(at.y)}" text-anchor="middle">农田</text>`)
      .join("")}</g>
  </g>
  ${label(46, 62, "城镇平面")}
  <text class="tp-name" x="500" y="68" text-anchor="middle" textLength="${f(Math.min(safeName.length * 46 * 0.72, 620))}" lengthAdjust="spacingAndGlyphs">${safeName}</text>
  <text class="tp-meta" x="500" y="96" text-anchor="middle">人口 ${Math.round(population).toLocaleString("zh-CN")} · ${traits.join(" · ") || "普通城镇"}</text>
  <rect class="tp-legend" x="46" y="896" width="188" height="34" rx="3"/>
  <text class="tp-credit" x="60" y="918">种子 ${escapeXml(String(input.seed ?? input.name)).slice(0, 22)}</text>
  <text class="tp-credit" x="954" y="918" text-anchor="end">本世界自绘 · 非外链</text>
</svg>`;
}

/** 以 center 为中心、angle 为朝向的一个矩形（房子、农舍、门楼都用它） */
function box(center: Pt, angle: number, width: number, depth: number): Pt[] {
  const hw = width / 2;
  const hd = depth / 2;
  return [v(-hw, -hd), v(hw, -hd), v(hw, hd), v(-hw, hd)].map(corner => add(center, rotate(corner, angle)));
}

/** 文字跟着街区主方向摆，但压进 ±30°，免得出现竖排或倒着写的街名 */
function angleFor(ex: { dir: Pt } | null): number {
  if (!ex) return 0;
  let angle = (Math.atan2(ex.dir.y, ex.dir.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return clamp(angle, -30, 30);
}

const DISTRICT_A = ["鱼", "盐", "石", "柳", "铁", "磨", "灯", "桥", "牧", "酒", "布", "陶", "船", "谷", "铜", "犁"];
const DISTRICT_B = ["市", "坊", "巷", "埠", "关", "塘", "坡", "园", "渡", "仓"];
function districtLabel(random: () => number): string {
  const a = DISTRICT_A[Math.floor(random() * DISTRICT_A.length) % DISTRICT_A.length];
  const b = DISTRICT_B[Math.floor(random() * DISTRICT_B.length) % DISTRICT_B.length];
  return a + b;
}

/** 岸线：被切掉的那条弦（城圈里唯一落在岸线上的一条边） */
function shoreEdge(town: Pt[], point: Pt, normal: Pt): [Pt, Pt] | null {
  for (let i = 0; i < town.length; i++) {
    const a = town[i];
    const b = town[(i + 1) % town.length];
    if (Math.abs(dot(sub(a, point), normal)) < R * 0.01 && Math.abs(dot(sub(b, point), normal)) < R * 0.01) {
      return [a, b];
    }
  }
  return null;
}

/** 岸线 + 几座探进水里的栈桥。岸线直接用切出来的那条缝（本身就是弯的） */
function coastShore(shore: Pt[], normal: Pt): string {
  if (shore.length < 2) return "";
  let out = `<path class="tp-shore" d="${toLine(shore)}" stroke-width="${f(R * 0.018)}"/>`;
  const docks = clamp(Math.round(dist(shore[0], shore[shore.length - 1]) / (R * 0.1)), 2, 6);
  const angle = Math.atan2(normal.y, normal.x);
  for (let i = 0; i < docks; i++) {
    // 栈桥要**从岸上伸出去**：长边顺着法线、起点压在岸线里侧，不能整根飘在水里
    const at = alongPolyline(shore, (i + 0.5) / docks).point;
    const spot = add(at, mul(normal, -R * 0.018));
    out += face(box(spot, angle, R * 0.082, R * 0.018), "var(--town-house,#45413a)", "var(--tx-dim,#67635d)", 0.6);
  }
  return out;
}

/** 两条线段求交（平行或不相交返回 null） */
function segIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * s.y - (b1.y - a1.y) * s.x) / denom;
  const u = ((b1.x - a1.x) * r.y - (b1.y - a1.y) * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return lerp(a1, a2, t);
}

/**
 * 过河处的桥：只在**路真的跨过河**的地方架。
 * 之前是「离河最近的城门」就架一座，结果桥孤零零浮在水面上、没有路通到它那儿。
 */
function bridges(roadsPre: Pt[][], riverPre: Pt[], riverWidth: number): string {
  let out = "";
  for (const road of roadsPre) {
    for (const [from, to] of [
      [road[1], road[0]],
      [road[1], road[2]]
    ]) {
      for (let i = 1; i < riverPre.length; i++) {
        const hit = segIntersect(from, to, riverPre[i - 1], riverPre[i]);
        // 桥只架在城边那一段，别在下游老远的地方孤零零冒出一座
        if (!hit || dist(hit, road[1]) > R * 0.34) continue;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        out += face(
          box(hit, angle, riverWidth * 2.6, R * 0.05),
          "var(--town-house,#45413a)",
          "var(--tx-dim,#67635d)",
          0.6
        );
        break;
      }
    }
  }
  return out;
}

const label = (x: number, y: number, text: string) => `<text class="tp-label" x="${x}" y="${y}">${text}</text>`;
