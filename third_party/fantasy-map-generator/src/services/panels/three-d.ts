// 右栏「三维地形」：只在地形 / 地球仪视图下出现。
//
// 侵蚀（Erode terrain）是 **3D 视图**的参数，住在 `options.app.threeD` 里，
// 2D 生成管线根本没有这一项 —— 所以它属于这里，不属于「生成」那一组。
//
// 做法与其它参数一致：不复刻 FMG 那个 #options3d 对话框，只把同一批值
// 转达过去 —— 写 `options.app.threeD` 之后让 View3d 重画。重烘焙地形很贵
// （FMG 自己的滑杆也是等 change 才提交），所以这里的滑杆统一松手才生效。
import { Controllers } from "@/controllers";
import { createDropdown } from "@/services/panels/dropdown";
import { createSliderRow, type SliderRow } from "@/services/panels/slider";

const DETAILS = [256, 512, 1024, 2048];
const OCTAVES = [1, 2, 3, 4];

let rows: SliderRow[] = [];
let shadowRow: SliderRow | null = null;
let panel: HTMLElement | null = null;
let toggle: HTMLInputElement | null = null;
let detail: ReturnType<typeof createDropdown> | null = null;
let octaves: ReturnType<typeof createDropdown> | null = null;
let group: HTMLElement | null = null;

const threeD = () => options.app.threeD;

/** 改一个三维参数：先写进 FMG 的选项，再让它重画（三维没开时什么都别做） */
function apply(patch: Partial<typeof options.app.threeD>): void {
  Options.set(o => Object.assign(o.app.threeD, patch));
  if (!document.getElementById("canvas3d")) return; // 没进三维就别去碰渲染器
  void Controllers.View3d.redraw();
}

/** 边界阴影有多深（0 就是不要影子）：写进 FMG 那个一直没人用的 threeD.shadow */
function applyShadow(value: number): void {
  Options.set(o => (o.app.threeD.shadow = value));
  if (!document.getElementById("canvas3d")) return;
  void Controllers.View3d.setShadowOpacity(value);
}

/** 侵蚀关掉时，下面几个参数没有意义 */
function syncEnabled(): void {
  if (group) group.hidden = !threeD().erosion;
}

/** 外部（FMG 自己的对话框、读档）改了值就对一次；顺带对齐「在不在三维」 */
function syncFromFMG(): void {
  if (panel) {
    const inThreeD = Boolean(document.getElementById("canvas3d"));
    if (panel.hidden === inThreeD) {
      panel.hidden = !inThreeD;
      // 进出三维是异步的（画布挂载完成才算），顶栏的分段高亮跟着这里对齐
      window.dispatchEvent(new CustomEvent("tx:view-changed"));
    }
  }
  if (toggle) toggle.checked = threeD().erosion;
  const values = [threeD().erosionStrength, threeD().erosionRiverDepth];
  rows.forEach((row, index) => {
    row.set(values[index] ?? 0);
  });
  shadowRow?.set(Math.round(threeD().shadow * 100));
  detail?.setValue(String(threeD().erosionDetail));
  octaves?.setValue(String(threeD().erosionOctaves));
  syncEnabled();
}

export function initThreeDPanel(): void {
  panel = document.getElementById("tx-panel-3d");
  const host = document.getElementById("tx-params-erosion");
  if (!panel || !host) return;
  if (panel.dataset.ready) return;
  panel.dataset.ready = "1";

  group = document.getElementById("tx-3d-erosion-params");

  toggle = document.getElementById("tx-3d-erosion") as HTMLInputElement | null;
  toggle?.addEventListener("change", () => {
    apply({ erosion: Boolean(toggle?.checked) });
    syncEnabled();
  });

  rows = [
    createSliderRow({
      label: "侵蚀强度",
      min: 0,
      max: 100,
      step: 1,
      value: threeD().erosionStrength,
      commit: "change",
      onInput: value => apply({ erosionStrength: value })
    }),
    createSliderRow({
      label: "河谷深度",
      min: 0,
      max: 100,
      step: 1,
      value: threeD().erosionRiverDepth,
      commit: "change",
      onInput: value => apply({ erosionRiverDepth: value })
    })
  ];
  host.append(...rows.map(row => row.root));

  detail = createDropdown({
    items: DETAILS.map(value => ({ value: String(value), label: value === 2048 ? "2048［慢］" : String(value) })),
    value: String(threeD().erosionDetail),
    title: "侵蚀网格精度（长边顶点数）",
    onChange: value => apply({ erosionDetail: Number(value) })
  });
  document.getElementById("tx-3d-detail")?.append(detail.root);

  octaves = createDropdown({
    items: OCTAVES.map(value => ({ value: String(value), label: String(value) })),
    value: String(threeD().erosionOctaves),
    title: "侵蚀细节的倍频数，越多沟壑越细",
    onChange: value => apply({ erosionOctaves: Number(value) })
  });
  document.getElementById("tx-3d-octaves")?.append(octaves.root);

  // 边界阴影与侵蚀无关，所以挂在侵蚀组之外：海岸线那圈压暗让陆地与海面的边界读得出来
  shadowRow = createSliderRow({
    label: "边界阴影",
    min: 0,
    max: 100,
    step: 5,
    value: Math.round(threeD().shadow * 100),
    format: value => `${value}%`,
    commit: "change",
    onInput: value => applyShadow(value / 100)
  });
  document.getElementById("tx-params-3d-shadow")?.append(shadowRow.root);

  syncFromFMG();
  // 三维是异步挂载的：进 / 出三维都只是画布的出现与消失，靠轮询对齐显示
  window.setInterval(syncFromFMG, 1000);
}
