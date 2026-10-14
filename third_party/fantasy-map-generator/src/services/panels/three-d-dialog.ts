// 三维设置对话框（FMG 自己那个 #options3d）：结构还是它的，排布与皮归我们。
//
// 为什么只插分区标题、不搬控件：这个 dialog 每次打开都是**新建**的
// （view-3d.ts 的 renderOptionsDialog 先 remove 再 insert），而且内部有
// 「地形 / 地球仪」两套、以及「侵蚀段 / 颜色段」按需显隐。一旦我们搬动节点，
// 就得跟这些显隐逻辑保持同步；插几个标题达到了分组的读感，却没有这个风险。
//
// 中文由运行时词典负责（zh.json 里有这些条目），这里不重复存一份文案；
// 分区标题是我们新增的界面，直接写中文。

/** 分区：标题 + 该组第一行的锚点（锚点是那一行里的控件 id） */
interface Section {
  title: string;
  anchor: string;
}

const MESH_SECTIONS: Section[] = [
  { title: "视图", anchor: "options3dMeshRotationRange" },
  { title: "光照与颜色", anchor: "options3dTimeOfDay" },
  { title: "显示", anchor: "options3dMeshLabels3d" },
  { title: "地形细节", anchor: "options3dSubdivide" }
];
const GLOBE_SECTIONS: Section[] = [{ title: "视图", anchor: "options3dGlobeRotationRange" }];

/** 侵蚀那一段是容器，里面的行也要按行排版 */
const NESTED_SECTIONS = ["options3dErosionSection"];
/** 颜色那一段是「标签 色块 标签 色块」一行两对，给它自己的排版 */
const COLOR_ROW = "options3dColorSection";

/** 给容器里的每个孩子打上排布用的类：行 / 嵌套段 / 纯文字说明 */
function markRows(container: HTMLElement): void {
  for (const child of [...container.children] as HTMLElement[]) {
    if (NESTED_SECTIONS.includes(child.id)) {
      child.classList.add("tx-3d-section");
      for (const inner of [...child.children] as HTMLElement[]) inner.classList.add("tx-3d-row");
      continue;
    }
    if (child.id === COLOR_ROW) {
      child.classList.add("tx-3d-row", "tx-3d-row--colors");
      continue;
    }
    child.classList.add(child.querySelector("input, select") ? "tx-3d-row" : "tx-3d-note");
  }
}

function addTitles(sections: Section[]): void {
  for (const { title, anchor } of sections) {
    const row = document.getElementById(anchor)?.closest<HTMLElement>(".tx-3d-row, .tx-3d-section");
    if (!row) continue;
    const heading = document.createElement("div");
    heading.className = "tx-3d__title";
    heading.textContent = title;
    row.before(heading);
  }
}

/** 套上我们的排布；dialog 是新建的，所以每次打开都会重跑 */
function shellDialog(): void {
  const dialog = document.getElementById("options3d");
  if (!dialog || dialog.dataset.txShelled) return;
  dialog.dataset.txShelled = "1";

  const mesh = document.getElementById("options3dMesh");
  if (mesh) {
    markRows(mesh);
    addTitles(MESH_SECTIONS);
  }
  const globe = document.getElementById("options3dGlobe");
  if (globe) {
    markRows(globe);
    addTitles(GLOBE_SECTIONS);
  }
}

export function initThreeDDialog(): void {
  const dialogs = document.getElementById("dialogs");
  if (!dialogs) return;
  // 关闭时它会被销毁，所以盯着「出现」而不是只跑一次
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id !== "options3d" && !node.querySelector("#options3d")) continue;
        shellDialog();
        return;
      }
    }
  }).observe(dialogs, { childList: true, subtree: true });
}
