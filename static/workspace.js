/* ==========================================================================
   世界工作区  —  前端
   --------------------------------------------------------------------------
   对应调研文档的落地项：
   §2.1 世界 → 文档树 → 卡片 / 时间线        §2.2 顶栏四入口 + 多标签并排面板
   §3.1 卡片 = 标题 + 类型 + 属性 + 区块      §3.2 类型 / 属性（含引用与公式）
   §3.3 左侧文档树（搜索 / 置顶 / 隐藏 / 纪元） §4.2 名字自动识别
   §6.1 时间线：日历 + 纪元 + 事件精度 + 关联卡片
   ========================================================================== */

'use strict';

/* ----------------------------------------------------------------- 常量 */
const DOC_LABEL = {
  folder: '文件夹', card: '卡片', timeline: '时间线', map: '地图', canvas: '画布',
  board: '看板', note: '笔记', table: '表格', familyTree: '关系树', graph: '世界图谱',
  dictionary: '词典', todo: '待办清单', voice: '语音备忘', dice: '骰子',
  soundscape: '环境音', radar: '雷达图', chapter: '章节', media: '媒体库', embed: '链接嵌入',
};
// 文档类型 → 图标名（Minimal 设计系统的线条图标）
const DOC_ICON_NAME = {
  folder: 'folder', card: 'file', timeline: 'align', map: 'map-pin', canvas: 'pen-line',
  dictionary: 'book', todo: 'circle-check', voice: 'message-circle-more', dice: 'box',
  soundscape: 'droplet', radar: 'globe', chapter: 'file', media: 'box', embed: 'external-link',
  board: 'grip', note: 'pen-line', table: 'grip', familyTree: 'user', graph: 'globe',
};
const docIcon = (type, size = 15) => icon(DOC_ICON_NAME[type] || 'file', size);
const VT_LABEL = {
  text: '文本', select: '单选', multiselect: '多选', number: '数字',
  date: '日期', reference: '引用', formula: '公式',
};
const PRECISION_LABEL = { year: '年', month: '月', day: '日', time: '时间' };
const PUBLISH_LABEL = {
  live: '● 已发布', stale: '◐ 有改动未发布', pending: '○ 尚未上线',
  unpublished: '— 未发布站点', excluded: '☾ 已排除',
};
const ERA_COLORS = {
  blue: [98, 105, 128], sky: [52, 117, 243], violet: [82, 81, 193],
  red: [236, 58, 58], teal: [26, 176, 121], gold: [224, 148, 36],
};

/* ----------------------------------------------------------------- 状态 */
const S = {
  world: null, types: [], eras: [], calendars: [],
  tree: [],            // 根文档（含 children）
  docs: new Map(),     // docId -> 详情（document + card / timeline 状态）
  panels: [{ tabs: [], active: -1 }],
  collapsed: new Set(),
  filter: '',
  pending: new Map(),  // 防抖保存
  draggingBlock: null, // 正在拖的区块序号
};

/* ----------------------------------------------------------------- 小工具 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const debounce = (key, fn, wait = 450) => {
  clearTimeout(S.pending.get(key));
  S.pending.set(key, setTimeout(() => { S.pending.delete(key); fn(); }, wait));
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function button(label, title, handler, active = false, danger = false) {
  const node = el('button', `mini-btn${active ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`, label);
  if (title) node.title = title;
  if (danger) node.dataset.danger = '1';
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function toast(message, ms = 1900) {
  const box = $('#toast');
  $('#toastText').textContent = message;
  box.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { box.hidden = true; }, ms);
}

/** 卡片写回的统一处理：内容与修订号一起更新（漏了修订号下一次写就会被 409 拦）。 */
function applyCardResponse(entry, payload) {
  if (!entry || !payload) return;
  if (payload.card) entry.card = payload.card;
  if (payload.document) entry.document = payload.document;
  if (payload.revision !== undefined) entry.revision = payload.revision;
}

/** 409 冲突：不覆盖别人的改动，改成把最新内容拿过来重画。 */
function handleConflict(payload) {
  const entry = payload && payload.document ? S.docs.get(payload.document.id) : null;
  if (entry) {
    if (payload.card) entry.card = payload.card;
    if (payload.document) entry.document = payload.document;
    entry.revision = payload.revision;
    renderPanels();
  }
  toast(payload.error || '这份文档刚被别人改过，已刷新成最新内容', 3200);
  announce('检测到别人先改了这份文档，已刷新为最新内容');
  return payload;
}

async function api(path, { method = 'GET', body, form } = {}) {
  // 写操作统一闸门：只读时不用发请求，直接提示（服务端也会拦，这里是体验层）
  if (method !== 'GET' && !path.startsWith('/api/world/auth/') && !path.startsWith('/api/world/presence')) {
    if (!guardWrite()) throw new Error('read-only');
  }
  const response = await fetch(path, {
    method,
    headers: form ? {} : (body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: form ? form : (body === undefined ? undefined : JSON.stringify(body)),
  });
  let payload = null;
  try { payload = await response.json(); } catch (e) { payload = null; }
  if (response.status === 409 && payload && payload.conflict) {
    handleConflict(payload);
    const conflict = new Error(payload.error || '这份文档刚被别人改过');
    conflict.isConflict = true;          // 冲突是正常情况，调用方安静处理，别冒泡成未捕获异常
    throw conflict;
  }
  if (!response.ok) {
    const message = (payload && payload.error) || `请求失败（${response.status}）`;
    toast(message, 2600);
    throw new Error(message);
  }
  return payload;
}

/* ----------------------------------------------------------------- 主题 */
function applyTheme(theme) {
  const root = document.documentElement.style;
  if (!theme) return;
  // 极简语言的表面色跟着世界主题的明暗走（浅色 = Minimal 的纸白，深色 = #0a0a0a/#171717）
  document.documentElement.dataset.theme = theme.mode === 'light' ? 'light' : 'dark';
  if (theme.primaryColor) {
    root.setProperty('--primary', theme.primaryColor);
    root.setProperty('--primary-ink', readableInk(theme.primaryColor));
  }
  if (theme.headingFont) root.setProperty('--heading-font', `"${theme.headingFont}", "Songti SC", Georgia, serif`);
  if (theme.bodyFont) root.setProperty('--body-font', `"${theme.bodyFont}", "PingFang SC", system-ui, sans-serif`);
  if (typeof theme.grain === 'number') root.setProperty('--grain', String(clamp(theme.grain, 0, 60) / 100));
  if (theme.background) {
    document.body.style.backgroundImage = `linear-gradient(rgba(11,10,9,.88), rgba(11,10,9,.94)), url("${theme.background}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  }
}

function readableInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#e8dcc0';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1b1710' : '#f0e6cf';
}

/* ----------------------------------------------------------------- 启动 */
async function boot() {
  const data = await api('/api/world/state');
  applyViewer(data.viewer);
  refreshEraChip();
  renderPresence(data.online);
  startPresence();
  S.world = data.world;
  S.types = data.types;
  S.eras = data.eras;
  S.calendars = data.calendars;
  S.tree = data.documents;
  applyTheme(S.world.theme);

  $('#worldName').textContent = S.world.name;
  $('#worldAvatar').textContent = (S.world.name || 'W').trim().charAt(0).toUpperCase();
  document.title = `${S.world.name} · 世界工作区`;

  renderTree();
  renderPanels();

  // 深链：/w#doc=<id> 直接打开某份文档（截图与分享都用得上）
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const embedId = Number(document.body.dataset.embedDoc || 0);
  const first = Number(hash.get('doc')) || embedId || null;
  const second = Number(hash.get('doc2')) || null;
  if (first) {
    await openDoc(first);
  } else if (S.tree.length) {
    await openDoc(firstOpenable(S.tree));
  }
  if (second) {
    // 并排面板：VVD 的「每个标签页各自带一组可拖拽面板」（调研文档 §2.2 / §12.1）
    S.panels.push({ tabs: [], active: -1 });
    await openDoc(second, 1);
  }
}

/** 在已加载的文档树里找一份文档（用来判断要不要多取一层子节点）。 */
function findNode(id, nodes = S.tree) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(id, node.children || []);
    if (found) return found;
  }
  return null;
}

function firstOpenable(nodes) {
  for (const node of nodes) {
    if (node.type !== 'folder') return node.id;
    const child = firstOpenable(node.children || []);
    if (child) return child;
  }
  return null;
}

/* ================================================================= 文档树 */
function renderTree() {
  const host = $('#sbTree');
  host.innerHTML = '';
  const filter = S.filter.trim().toLowerCase();

  const pinned = [];
  const walk = (nodes, depth, parentMatched) => {
    for (const node of nodes) {
      const selfMatch = !filter
        || node.name.toLowerCase().includes(filter)
        || (node.children || []).some((c) => c.name.toLowerCase().includes(filter));
      if (!selfMatch && !parentMatched) continue;
      if (node.pinned && depth === 0) pinned.push(node);
      host.appendChild(treeRow(node, depth));
      const isCollapsed = S.collapsed.has(node.id);
      if ((node.children || []).length && (!isCollapsed || filter)) {
        walk(node.children, depth + 1, parentMatched || selfMatch);
      }
    }
  };
  if (pinned.length) {
    host.appendChild(el('div', 'sb-section', '已置顶'));
    walk(pinned, 0, true);
    host.appendChild(el('div', 'sb-section', '全部文档'));
  }
  walk(S.tree, 0, false);
  if (!host.children.length) {
    host.appendChild(el('div', 'sb-section', S.filter ? `没有匹配「${S.filter}」的文档` : '还没有文档'));
    if (S.filter) {
      const clear = el('button', 'mini-btn is-small', '清空搜索');
      clear.style.margin = '4px 10px';
      clear.addEventListener('click', () => { S.filter = ''; const box = $('#sbSearch'); if (box) box.value = ''; renderTree(); });
      host.appendChild(clear);
    }
  }
}

function treeRow(node, depth) {
  const row = el('div', `row depth-${Math.min(depth, 3)}`);
  row.dataset.id = node.id;
  row.draggable = true;
  const activeDoc = activeDocument();
  if (activeDoc && activeDoc.id === node.id) row.classList.add('is-active');
  if (node.pinned) row.classList.add('is-pinned');

  const hasKids = (node.children || []).length > 0;
  const caret = el('span', 'r-caret', hasKids ? (S.collapsed.has(node.id) ? '▸' : '▾') : '');
  if (hasKids) {
    caret.addEventListener('click', (event) => {
      event.stopPropagation();
      if (S.collapsed.has(node.id)) S.collapsed.delete(node.id); else S.collapsed.add(node.id);
      renderTree();
    });
  }
  row.appendChild(caret);
  const iconBox = el('span', 'r-icon');
  const isFolder = node.type === 'folder';
  iconBox.appendChild(docIcon(
    isFolder ? (S.collapsed.has(node.id) ? 'folder' : 'folder-open') : node.type, 15,
  ));
  if (!isFolder && node.entity_type) {
    const type = S.types.find((t) => t.id === node.entity_type);
    if (type && type.color) iconBox.style.color = colorFor(type.color);
  }
  row.appendChild(iconBox);
  row.appendChild(el('span', 'r-name', node.name));
  if (node.hidden) row.appendChild(el('span', 'r-hide', '隐'));
  // 当前纪元（世界版本）里没有这张卡 -> 标灰，一眼看出"这一版没有它"
  if (S.eraId && node.era_mode && node.era_mode !== 'universal'
      && Array.isArray(node.era_ids) && node.era_ids.length) {
    const visible = node.era_mode === 'only'
      ? node.era_ids.includes(S.eraId)
      : !node.era_ids.includes(S.eraId);
    if (!visible) {
      row.classList.add('is-other-era');
      row.title = '这张卡不在当前纪元这一版里';
    }
  }

  row.addEventListener('click', () => openDoc(node.id));
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    docContextMenu(event, node);
  });
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', String(node.id));
    event.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragover', (event) => {
    if (node.type !== 'folder') return;
    event.preventDefault();
    row.classList.add('sb-drop');
  });
  row.addEventListener('dragleave', () => row.classList.remove('sb-drop'));
  row.addEventListener('drop', async (event) => {
    row.classList.remove('sb-drop');
    const dragged = Number(event.dataTransfer.getData('text/plain'));
    if (!dragged || dragged === node.id) return;
    event.preventDefault();
    await api(`/api/world/documents/${dragged}`, { method: 'PUT', body: { parent: node.id } });
    toast(`已移动到「${node.name}」`);
    await reloadTree();
  });
  return row;
}

/** 把颜色按透明度调成 rgba（拿来做"淡色底"的徽章、芯片）。 */
function tint(color, alpha) {
  if (!color) return `rgba(127,127,127,${alpha})`;
  const value = String(color).trim();
  if (value.startsWith('#')) {
    const hex = value.length === 4
      ? value.slice(1).split('').map((c) => c + c).join('')
      : value.slice(1, 7);
    const num = parseInt(hex, 16);
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`;
  }
  const match = value.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return match ? `rgba(${match[1]},${match[2]},${match[3]},${alpha})` : value;
}

function colorFor(key) {
  const rgb = ERA_COLORS[key];
  return rgb ? `rgb(${rgb.join(',')})` : (key && key.startsWith('#') ? key : 'var(--accent)');
}

async function reloadTree() {
  const data = await api('/api/world/state');
  S.tree = data.documents;
  S.types = data.types;
  S.eras = data.eras;
  S.calendars = data.calendars;
  renderTree();
}

/* ============================================================== 标签与面板 */
function activeDocument() {
  const panel = S.panels[0];
  if (!panel || panel.active < 0) return null;
  const id = panel.tabs[panel.active];
  const entry = S.docs.get(id);
  return entry ? entry.document : null;
}

async function openDoc(id, panelIndex = 0, { focus = true, pushHistory = true } = {}) {
  const panel = S.panels[panelIndex];
  if (!panel.tabs.includes(id)) panel.tabs.push(id);
  if (focus) panel.active = panel.tabs.indexOf(id);
  if (!S.docs.has(id)) {
    const known = findNode(id);
    const wantChildren = known && known.type === 'folder' ? '?children=1' : '';
    const detail = await api(`/api/world/documents/${id}${wantChildren}`);
    const entry = { document: detail, card: detail.card || null, timeline: null, type: null,
                    revision: detail.revision };
    if (detail.type === 'timeline') entry.timeline = await api(`/api/world/timelines/${id}`);
    if (detail.type === 'card') {
      const payload = await api(`/api/world/cards/${id}`);
      applyCardResponse(entry, payload);
      entry.type = payload.entity_type;
    }
    S.docs.set(id, entry);
  }
  renderPanels();
  renderTree();
  announce(`已打开《${(S.docs.get(id) || {}).document ? S.docs.get(id).document.name : ''}》`);
  if (window.innerWidth < 900) closeSidebarDrawer();
  if (focus) {
    if (pushHistory) syncHash(id);
    // 不自动聚焦标题：内容可编辑，一进来就聚焦会让人以为"已经选中了标题"；
    // 点击时浏览器自己会给焦点。

  }
}

/** 把当前文档写进地址栏（保留 panel / tl / doc2 这些开关），这样链接可分享、前进后退可用。 */
function syncHash(id) {
  const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  let hash = `#doc=${id}`;
  ['panel', 'tl', 'doc2', 'event'].forEach((key) => {
    if (params.get(key)) hash += `&${key}=${params.get(key)}`;
  });
  if (location.hash !== hash) {
    try { history.pushState({ doc: id }, '', hash); }
    catch (error) { location.hash = hash; }
  }
}

function documentIdFromHash() {
  const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const id = Number(params.get('doc'));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** 浏览器前进 / 后退（以及外部改 hash）时重新打开对应的文档。 */
function bindHistory() {
  window.addEventListener('popstate', () => {
    const id = documentIdFromHash();
    const active = activeDocument();
    if (id && (!active || active.id !== id)) openDoc(id, 0, { pushHistory: false });
  });
  window.addEventListener('hashchange', () => {
    const id = documentIdFromHash();
    const active = activeDocument();
    if (id && (!active || active.id !== id)) openDoc(id, 0, { pushHistory: false });
  });
}

function closeTab(panelIndex, id) {
  const panel = S.panels[panelIndex];
  const index = panel.tabs.indexOf(id);
  if (index < 0) return;
  S.closedTabs = S.closedTabs || [];
  S.closedTabs.push(id);
  if (S.closedTabs.length > 20) S.closedTabs.shift();
  panel.tabs.splice(index, 1);
  panel.active = Math.min(panel.active, panel.tabs.length - 1);
  if (panel.active < 0 && panel.tabs.length) panel.active = 0;
  renderPanels();
  renderTree();
}

function renderPanels() {
  const host = $('#panels');
  // 面板要重建了：先把现有正文/标题节点标记为"退休"，再清空并重画。
  // 这样它们接下来触发的 input / blur 保存不会再拿旧内容覆盖掉新结构
  // （斜杠菜单刚写好的 <h1> 曾经就是这样被 700ms 后的防抖保存盖回去的）。
  $$('.block-text, .block-title', host).forEach((node) => { node.dataset.retired = '1'; });
  host.innerHTML = '';
  // 重渲染时清掉可能还挂在 body 上的 @ 提及浮层与格式条（否则会越积越多）
  $$('.mention-pop').forEach((node) => node.remove());
  formatBarHide();
  const visible = S.panels.filter((p, i) => i === 0 || p.tabs.length);
  S.panels.forEach((panel, index) => {
    if (index > 0 && !panel.tabs.length) return;
    if (index > 0) {
      const grip = el('div', 'panel-grip');
      grip.title = '拖动改变分割 · 双击复位';
      grip.addEventListener('dblclick', () => { S.panelSplit = 50; renderPanels(); });
      grip.addEventListener('mousedown', startGripDrag);
      host.appendChild(grip);
    }
    const pane = el('section', 'panel');
    pane.dataset.panel = String(index);
    const tabs = el('div', 'panel-tabs');
    panel.tabs.forEach((id, tabIndex) => {
      const entry = S.docs.get(id);
      const name = entry ? entry.document.name : '…';
      const tab = el('div', `tab${tabIndex === panel.active ? ' is-active' : ''}`);
      const tabIconBox = el('span', 't-icon');
      tabIconBox.appendChild(docIcon(entry ? entry.document.type : 'card', 14));
      tab.appendChild(tabIconBox);
      tab.appendChild(el('span', 't-name', name));
      const close = el('span', 't-close', '✕');
      close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(index, id); });
      tab.appendChild(close);
      tab.addEventListener('click', () => { panel.active = tabIndex; renderPanels(); });
      tab.addEventListener('auxclick', (event) => { if (event.button === 1) closeTab(index, id); });
      tabs.appendChild(tab);
    });
    const addTab = el('div', 'tab');
    addTab.title = '新标签页';
    addTab.appendChild(el('span', 't-name', '＋'));
    addTab.addEventListener('click', () => openPalette(''));
    tabs.appendChild(addTab);
    pane.appendChild(tabs);

    const body = el('div', 'panel-body');
    const activeId = panel.tabs[panel.active];
    if (activeId && S.docs.has(activeId)) {
      const entry = S.docs.get(activeId);
      if (entry.document.type === 'timeline') {
        // 默认直接用已有的经典时间线编辑器（像素级复刻那一版）；
        // 加 #…&tl=new 可以切回工作区自带的简化渲染器做对比。
        const useNew = new URLSearchParams((location.hash || '').replace(/^#/, '')).get('tl') === 'new';
        body.appendChild(useNew
          ? renderTimeline(entry)
          : (CAL_STATE.view === 'calendar' ? renderCalendarView(entry) : renderTimelineFrame(entry)));
      }
      else if (entry.document.type === 'card') body.appendChild(renderCard(entry, index));
      else if (entry.document.type === 'table') body.appendChild(renderTableTool(entry));
      else if (entry.document.type === 'board') body.appendChild(renderBoardTool(entry));
      else if (entry.document.type === 'canvas') body.appendChild(renderCanvasTool(entry));
      else if (entry.document.type === 'dictionary') body.appendChild(renderDictionaryTool(entry));
      else if (entry.document.type === 'todo') body.appendChild(renderTodoTool(entry));
      else if (entry.document.type === 'dice') body.appendChild(renderDiceTool(entry));
      else if (entry.document.type === 'radar') body.appendChild(renderRadarTool(entry));
      else if (entry.document.type === 'soundscape') body.appendChild(renderSoundscapeTool(entry));
      else if (entry.document.type === 'voice' || entry.document.type === 'media') {
        body.appendChild(renderMediaTool(entry));
      }
      else if (entry.document.type === 'chapter') body.appendChild(renderChapterTool(entry));
      else if (entry.document.type === 'embed') body.appendChild(renderEmbedTool(entry));
      else if (entry.document.type === 'graph') body.appendChild(renderGraph(entry));
      else if (entry.document.type === 'familyTree') {
        body.appendChild(renderTreeTool(entry));
        // 首次渲染时把整棵树缩放到视野中央（画布尺寸要等挂上 DOM 才知道）
        const treeUi = entry.treeUi;
        if (treeUi && !treeUi.fitted && entry.tree) {
          requestAnimationFrame(() => {
            const treeCanvas = body.querySelector('.tree-canvas');
            if (!treeCanvas) return;
            fitTree(entry, treeCanvas);
          });
        }
      }
      else if (entry.document.type === 'map') body.appendChild(renderMapTool(entry));
      else if (entry.document.type === 'folder') body.appendChild(renderFolder(entry));
      else body.appendChild(renderPlaceholder(entry.document));
    }
    pane.appendChild(body);
    host.appendChild(pane);
  });
  const hasTabs = S.panels.some((p) => p.tabs.length);
  host.classList.toggle('has-tabs', hasTabs);
  // 没有标签页时把面板整体藏掉：否则空面板会盖在空状态上面，按钮点不动
  host.classList.toggle('is-empty', !hasTabs);
  const workspace = $('#workspace');
  if (workspace) workspace.classList.toggle('is-empty', !hasTabs);
  $('#emptyHint').hidden = hasTabs;

  if (!editable()) disableEditing();
  if (S.panels.length > 1) {
    const first = host.querySelector('.panel');
    if (first && S.panelSplit) first.style.flex = `0 0 ${S.panelSplit}%`;
  }
}

function startGripDrag(event) {
  event.preventDefault();
  const host = $('#panels');
  const rect = host.getBoundingClientRect();
  const first = host.querySelector('.panel');
  const move = (e) => {
    const pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 22, 78);
    S.panelSplit = pct;
    if (first) first.style.flex = `0 0 ${pct}%`;
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

/** 文件夹：列出里面的文档（点一下就打开），并支持就地新建。 */
function renderFolder(entry) {
  const document_ = entry.document;
  const wrap = el('div', 'card-view folder-view');
  wrap.dataset.doc = String(document_.id);
  const head = el('div', 'folder-head');
  head.appendChild(el('h1', 'card-title', document_.name));
  const count = (document_.children || []).length;
  head.appendChild(el('p', 'hint', `${count} 项 · 文件夹不会出现在发布站点上`));
  wrap.appendChild(head);

  const list = el('div', 'folder-list');
  (document_.children || []).forEach((child) => {
    const row = el('div', 'folder-row');
    const frIcon = el('span', 'fr-icon');
    frIcon.appendChild(docIcon(child.type, 15));
    row.appendChild(frIcon);
    row.appendChild(el('span', 'fr-name', child.name));
    row.appendChild(el('span', 'fr-kind', DOC_LABEL[child.type] || child.type));
    if (child.hidden) row.appendChild(el('span', 'fr-kind', '已隐藏'));
    row.addEventListener('click', () => openDoc(child.id));
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      docContextMenu(event, child);
    });
    list.appendChild(row);
  });
  if (!count) {
    list.appendChild(emptyBlock({
      iconName: 'folder-open',
      title: '这个文件夹还是空的',
      text: '可以把已有的文档拖进来，也可以直接在这里新建一张卡片。',
      actionLabel: '新建卡片',
      onAction: async () => {
        const type = S.types.find((t) => !t.hidden) || S.types[0];
        const created = await api('/api/world/documents', {
          method: 'POST',
          body: { type: 'card', name: '未命名卡片', parent: document_.id, entity_type: type ? type.id : null },
        });
        await reloadTree();
        openDoc(created.id);
      },
    }));
  }
  wrap.appendChild(list);

  const actions = el('div', 'insert-bar');
  actions.appendChild(button('＋ 新建卡片', '在这个文件夹里建一张卡片', async () => {
    const name = window.prompt('卡片名称', '未命名');
    if (name === null) return;
    const type = S.types.find((t) => !t.hidden) || S.types[0];
    const created = await api('/api/world/documents', {
      method: 'POST',
      body: { type: 'card', name: name.trim() || '未命名', parent: document_.id, entity_type: type ? type.id : null },
    });
    await reloadTree();
    const fresh = await api(`/api/world/documents/${document_.id}`);
    entry.document = fresh;
    S.docs.set(document_.id, entry);
    renderPanels();
    toast(`已新建「${created.name}」`);
  }));
  actions.appendChild(button('＋ 新建子文件夹', '', async () => {
    const name = window.prompt('文件夹名称', '新文件夹');
    if (name === null) return;
    await api('/api/world/documents', {
      method: 'POST', body: { type: 'folder', name: name.trim() || '新文件夹', parent: document_.id },
    });
    await reloadTree();
    const fresh = await api(`/api/world/documents/${document_.id}`);
    entry.document = fresh;
    S.docs.set(document_.id, entry);
    renderPanels();
  }));
  wrap.appendChild(actions);
  return wrap;
}

/** 还没做的工具（画布 / 看板 / 表格）：说清楚现状，并给一条出路。 */
function renderPlaceholder(document_) {
  const label = DOC_LABEL[document_.type] || document_.type;
  const wrap = el('div', 'card-view');
  wrap.appendChild(el('h1', 'card-title', document_.name));
  const box = el('div', 'todo-note');
  box.appendChild(icon('circle-alert', 16));
  const text = el('div');
  text.appendChild(el('b', null, `${label}的专用界面还没做`));
  text.appendChild(el('p', 'hint',
    '数据是接上了的（存在这份文档里），只是还没画它的编辑界面。'
    + '你可以先用卡片编辑器把内容写下来——等专用界面做出来，内容还在。'));
  box.appendChild(text);
  wrap.appendChild(box);

  const actions = el('div', 'insert-bar');
  actions.appendChild(button('用卡片编辑器打开', '内容会写成区块，之后能迁移', async () => {
    const payload = await api(`/api/world/cards/${document_.id}`);
    if (!(payload.card.blocks || []).length) {
      await api(`/api/world/cards/${document_.id}`, {
        method: 'PUT',
        body: { blocks: [{ id: 'b1', type: 'text', title: '概览', text: '' }] },
      });
    }
    toast('已按卡片打开，内容会保存在同一份文档里');
    await openDoc(document_.id);
    // 直接把这份文档当卡片渲染：换掉缓存里的类型判断
    const entry = S.docs.get(document_.id);
    if (entry) { entry.document.type = 'card'; renderPanels(); }
  }));
  actions.appendChild(button('删除这份文档', '进回收站，可恢复', async () => {
    if (!window.confirm(`删除「${document_.name}」？会进回收站。`)) return;
    await api(`/api/world/documents/${document_.id}`, { method: 'DELETE' });
    closeTab(0, document_.id);
    await reloadTree();
    toast('已放进回收站');
  }));
  wrap.appendChild(actions);
  return wrap;
}

/* ================================================================ 卡片视图 */
function renderCard(entry, panelIndex) {
  const document_ = entry.document;
  const card = entry.card || { aliases: [], blocks: [], resolved: {} };
  const type = entry.type || S.types.find((t) => t.id === document_.entity_type) || null;

  const wrap = el('div', 'card-view');
  wrap.dataset.doc = String(document_.id);

  /* 头部：标题 + 类型徽标 + 封面 */
  const head = el('div', 'card-head');
  const left = el('div');
  left.style.flex = '1 1 auto';
  left.style.minWidth = '0';

  const title = el('h1', 'card-title', document_.name);
  if (editable()) title.contentEditable = 'true';
  title.spellcheck = false;
  title.addEventListener('blur', () => {
    const value = title.textContent.trim() || '未命名';
    if (value === document_.name) return;
    debounce(`doc:${document_.id}`, async () => {
      await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { name: value } });
      document_.name = value;
      toast('已保存');
      await reloadTree();
      renderPanels();
    });
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  left.appendChild(title);

  const badges = el('div', 'badge-row');
  // 纪元可见性（世界版本）：一眼看出这张卡属于哪一版，点开可改
  const eraBadge = el('button', 'badge');
  eraBadge.type = 'button';
  eraBadge.appendChild(icon('globe', 13));
  const eraModeNow = card.era_mode || 'universal';
  const eraNames = (S.eras || []).filter((e) => (card.era_ids || []).includes(e.id)).map((e) => e.name);
  eraBadge.appendChild(el('span', null,
    eraModeNow === 'universal' ? '纪元：所有'
      : eraModeNow === 'only' ? `纪元：只在 ${eraNames.join('、') || '选定'}`
      : `纪元：在 ${eraNames.join('、') || '选定'}隐藏`));
  eraBadge.title = '这张卡出现在哪些纪元（世界版本）· 点开设置';
  eraBadge.addEventListener('click', () => cardEraDialog(entry));
  badges.appendChild(eraBadge);

  const typeBadge = el('button', 'badge');
  typeBadge.type = 'button';
  const typeColor = type ? colorForType({ entity_type: type.id, type: 'card' }) : null;
  if (typeColor && typeColor !== 'var(--accent)') {
    typeBadge.classList.add('is-typed');
    typeBadge.style.setProperty('--badge-color', typeColor);
    typeBadge.style.background = tint(typeColor, 0.14);
    typeBadge.style.borderColor = tint(typeColor, 0.36);
    typeBadge.style.color = typeColor;
  }
  typeBadge.appendChild(el('span', 'b-dot'));
  if (typeBadge.classList.contains('is-typed')) {
    typeBadge.querySelector('.b-dot').style.background = typeColor;
  }
  typeBadge.appendChild(el('span', null, type ? type.name : '选择类型'));
  typeBadge.addEventListener('click', () => pickType(entry, panelIndex));
  badges.appendChild(typeBadge);
  const vis = el('button', `icon-btn is-pill${document_.hidden ? ' is-off' : ''}`);
  vis.type = 'button';
  vis.appendChild(icon(document_.hidden ? 'eye-off' : 'eye', 14));
  vis.appendChild(el('span', null, document_.hidden ? '站点隐藏' : '站点显示'));
  vis.title = '在维基中显示 / 隐藏';
  vis.addEventListener('click', async () => {
    document_.hidden = !document_.hidden;
    await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { hidden: document_.hidden } });
    renderPanels();
    await reloadTree();
  });
  badges.appendChild(vis);
  const stateChip = el('button', 'badge state-chip', PUBLISH_LABEL[document_.publish_state] || document_.publish_state);
  stateChip.type = 'button';
  stateChip.dataset.state = document_.publish_state || 'unpublished';
  stateChip.title = '发布状态（点开分享面板）';
  stateChip.addEventListener('click', () => publishDialog());
  badges.appendChild(stateChip);
  if (card.aliases && card.aliases.length) {
    const alias = el('span', 'hint', `亦称为：${card.aliases.join('、')}`);
    badges.appendChild(alias);
  }
  left.appendChild(badges);

  /* 属性表 */
  left.appendChild(renderProperties(entry, type, panelIndex));
  head.appendChild(left);

  const cover = el('div', 'card-cover');
  if (document_.cover) {
    const img = el('img');
    img.src = document_.cover;
    img.alt = '';
    cover.appendChild(img);
  } else {
    cover.textContent = '添加封面（点击后粘贴图片地址）';
  }
  cover.addEventListener('click', async () => {
    const url = window.prompt('封面图片地址', document_.cover || '');
    if (url === null) return;
    document_.cover = url.trim();
    await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { cover: document_.cover } });
    renderPanels();
  });
  head.appendChild(cover);
  wrap.appendChild(head);

  /* 区块 */
  const blocks = el('div', 'blocks');
  (card.blocks || []).forEach((block, index) => blocks.appendChild(renderBlock(entry, block, index, panelIndex)));
  wrap.appendChild(blocks);

  /* 底部插入条（对齐 §3.1 截图里的 + Text / + Media / + Map） */
  const bar = el('div', 'insert-bar');
  [['text', '文本', 'type'], ['heading', '标题', 'type'], ['quote', '引用', 'quote'],
   ['callout', '提示框', 'circle-alert'], ['divider', '分隔线', 'circle-minus']]
    .forEach(([kind, label, iconName]) => {
      const button = el('button', 'insert-btn');
      button.type = 'button';
      button.appendChild(icon(iconName, 14));
      button.appendChild(el('span', null, label));
      button.addEventListener('click', () => addBlock(entry, kind, panelIndex));
      bar.appendChild(button);
    });
  wrap.appendChild(bar);

  /* 底部：反向链接（谁提到了这张卡）+ 别名编辑 */
  const note = el('div', 'foot-note');
  note.appendChild(el('div', null, `别名：${(card.aliases || []).join('、') || '（无）'}　`));
  const editAlias = el('button', 'mini-btn', '编辑别名');
  editAlias.addEventListener('click', async () => {
    const value = window.prompt('别名（用逗号分隔）', (card.aliases || []).join(', '));
    if (value === null) return;
    const aliasPayload = await api(`/api/world/cards/${document_.id}`, { method: 'PUT', body: { aliases: value } });
    applyCardResponse(entry, aliasPayload);
    await refreshDoc(document_.id);
    toast('别名已保存');
  });
  note.appendChild(editAlias);
  wrap.appendChild(note);

  api(`/api/world/backlinks/${document_.id}`).then((data) => {
    if (!data.mentions.length) return;
    const line = el('div', 'foot-note');
    line.appendChild(el('b', null, `被 ${data.mentions.length} 处提到：`));
    line.appendChild(el('span', null, data.mentions.map((m) => m.name).join('、')));
    wrap.appendChild(line);
    highlightMentions(wrap);
  });

  return wrap;
}

function renderProperties(entry, type, panelIndex) {
  const document_ = entry.document;
  const card = entry.card;
  const box = el('div', 'props');
  const properties = (type && type.properties) || [];

  properties.forEach((prop) => {
    const row = el('div', 'prop-row');
    const key = el('div', 'prop-key');
    key.appendChild(el('span', null, prop.name));
    key.appendChild(el('span', 'k-kind', VT_LABEL[prop.value_type] || prop.value_type));
    row.appendChild(key);
    const valueBox = el('div', 'prop-val');
    valueBox.appendChild(propertyEditor(entry, prop, panelIndex));
    row.appendChild(valueBox);
    box.appendChild(row);
  });

  const add = el('button', 'prop-add', '＋ 添加属性');
  add.addEventListener('click', () => typeManager(type ? type.id : null));
  box.appendChild(add);
  return box;
}

function propertyEditor(entry, prop, panelIndex) {
  const document_ = entry.document;
  const card = entry.card;
  const resolved = (card.resolved || {})[prop.id] || {};
  const raw = (card.values || {})[prop.id];
  const save = async (value) => {
    const values = { ...(card.values || {}) };
    values[prop.id] = value;
    const payload = await api(`/api/world/cards/${document_.id}`, { method: 'PUT', body: { values } });
    applyCardResponse(entry, payload);
    applyCardResponse(entry, payload);
    renderPanels();
    renderTree();
  };

  if (prop.value_type === 'formula') {
    const out = el('div', 'prop-formula', `${resolved.display || '—'}　`);
    out.appendChild(el('span', 'hint', `＝ ${prop.formula}`));
    return out;
  }

  if (prop.value_type === 'select') {
    const select = el('select', 'prop-select');
    const empty = el('option', null, '—');
    empty.value = '';
    select.appendChild(empty);
    (prop.options || []).forEach((option) => {
      const label = typeof option === 'string' ? option : option.label;
      const node = el('option', null, label);
      node.value = label;
      select.appendChild(node);
    });
    if (raw && !(prop.options || []).some((o) => (typeof o === 'string' ? o : o.label) === raw)) {
      const extra = el('option', null, raw);
      extra.value = raw;
      select.appendChild(extra);
    }
    select.value = raw || '';
    select.addEventListener('change', () => save(select.value));
    return select;
  }

  if (prop.value_type === 'multiselect') {
    const wrap = el('div');
    const current = Array.isArray(raw) ? raw : [];
    current.forEach((item) => {
      const chip = el('span', 'chip');
      chip.appendChild(el('span', null, item));
      const remove = el('button', null, '✕');
      remove.addEventListener('click', () => save(current.filter((x) => x !== item)));
      chip.appendChild(remove);
      wrap.appendChild(chip);
    });
    const input = el('input', 'prop-input');
    input.placeholder = '输入后回车添加';
    input.style.width = '150px';
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const value = input.value.trim();
      if (!value) return;
      save([...current, value]);
    });
    wrap.appendChild(input);
    return wrap;
  }

  if (prop.value_type === 'reference') {
    const wrap = el('div', 'prop-ref');
    if (resolved.ref) {
      const chip = el('span', 'chip');
      const link = el('button', null, resolved.ref.name);
      link.addEventListener('click', () => openDoc(resolved.ref.id));
      chip.appendChild(link);
      const clear = el('button', null, '✕');
      clear.addEventListener('click', () => save(null));
      chip.appendChild(clear);
      wrap.appendChild(chip);
    } else {
      const pick = el('button', 'mini-btn', '选择卡片…');
      pick.addEventListener('click', () => cardPicker((chosen) => save(chosen.id)));
      wrap.appendChild(pick);
    }
    return wrap;
  }

  const input = el('input', 'prop-input');
  input.value = raw == null ? '' : raw;
  input.placeholder = prop.value_type === 'number' ? '数字' : '输入值…';
  if (prop.value_type === 'number') input.inputMode = 'decimal';
  input.addEventListener('blur', () => {
    const value = input.value.trim();
    if (String(raw == null ? '' : raw) === value) return;
    save(prop.value_type === 'number' ? (value === '' ? null : Number(value)) : value);
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
  return input;
}

/* --------------------------------------------------------------- 区块编辑 */
const grab = { keyboard: false };

function renderBlock(entry, block, index, panelIndex) {
  const document_ = entry.document;
  // 注意：容器以前叫 block-<type>，type=text 时正好等于正文的 .block-text，
  // 选择器会命中错元素（块工具条被当成正文）。这里统一改成 block-kind-<type>。
  const wrap = el('div', `block block-kind-${block.type}`);
  wrap.dataset.index = String(index);
  const level = clamp(Number(block.level) || 0, 0, 2);
  if (level) {
    wrap.dataset.level = String(level);
    wrap.style.marginLeft = `${level * 22}px`;
    wrap.classList.add('is-nested');
  }
  if (block.collapsed) wrap.classList.add('is-collapsed');

  const tools = el('div', 'block-tools');
  const tool = (iconName, title, handler, count) => {
    const button = el('button', null);
    button.title = title;
    button.setAttribute('aria-label', title);
    button.type = 'button';
    button.appendChild(icon(iconName, 14));
    if (count) {
      const badge = el('span', 'tool-count', String(count));
      button.appendChild(badge);
      button.classList.add('has-count');
    }
    button.addEventListener('click', handler);
    tools.appendChild(button);
  };

  // 拖动把手：按下才能拖（避免选中文字时误拖），点一下打开块菜单
  const handle = el('button', 'block-handle');
  handle.type = 'button';
  handle.title = '拖动排序 · 点击打开块菜单';
  handle.appendChild(icon('grip', 14));
  handle.addEventListener('mousedown', () => { wrap.draggable = true; });
  handle.addEventListener('mouseup', () => { wrap.draggable = false; });
  handle.addEventListener('click', () => openBlockMenu(handle, entry, index));
  // 键盘也能拖动：空格拾起 → ↑↓ 移动 → 空格放下 / Esc 取消
  handle.addEventListener('keydown', async (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      grab.keyboard = !grab.keyboard;
      handle.classList.toggle('is-grabbed', grab.keyboard);
      wrap.classList.toggle('is-grabbed', grab.keyboard);
      announce(grab.keyboard ? '已拾起区块，用上下方向键移动，空格放下' : '已放下区块');
      return;
    }
    if (!grab.keyboard) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      const target = index + delta;
      const blocks = entry.card.blocks || [];
      if (target < 0 || target >= blocks.length) { announce('已经到头了'); return; }
      await moveBlockTo(entry, index, target);
      announce(`已移动到第 ${target + 1} 位`);
      const nextHandle = $(`.block[data-index="${target}"] .block-handle`);
      if (nextHandle) nextHandle.focus();
      return;
    }
    if (event.key === 'Escape') {
      grab.keyboard = false;
      handle.classList.remove('is-grabbed');
      wrap.classList.remove('is-grabbed');
      announce('已取消拖动');
    }
  });
  tools.appendChild(handle);

  tool('arrow-up', '上移区块', () => moveBlock(entry, index, -1));
  tool('arrow-down', '下移区块', () => moveBlock(entry, index, 1));
  tool('arrow-left', '放到左栏', () => moveBlockAcross(entry, index, -1));
  tool('arrow-right', '放到右栏', () => moveBlockAcross(entry, index, 1));
  tool(block.hidden ? 'eye-off' : 'eye', '在网站中显示 / 隐藏', () => toggleBlockHidden(entry, index));
  tool('message-circle-more', (block.comments || []).length ? `${(block.comments || []).length} 条评论` : '评论此区块',
       () => openBlockComments(wrap, entry, index), (block.comments || []).length);
  const trashTool = el('button', 'is-danger');
  trashTool.type = 'button';
  trashTool.title = '删除区块';
  trashTool.dataset.danger = '1';
  trashTool.appendChild(icon('trash-2', 14));
  trashTool.addEventListener('click', () => removeBlock(entry, index));
  tools.appendChild(trashTool);
  wrap.appendChild(tools);

  // ---------------- 拖拽排序 ----------------
  wrap.addEventListener('dragstart', (event) => {
    if (!wrap.draggable) { event.preventDefault(); return; }
    S.draggingBlock = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    wrap.classList.add('is-dragging');
  });
  wrap.addEventListener('dragend', () => {
    wrap.draggable = false;
    wrap.classList.remove('is-dragging');
    S.draggingBlock = null;
    $$('.block.drop-before, .block.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  });
  wrap.addEventListener('dragover', (event) => {
    if (S.draggingBlock === null || S.draggingBlock === undefined || S.draggingBlock === index) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = wrap.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    wrap.classList.toggle('drop-after', after);
    wrap.classList.toggle('drop-before', !after);
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-before', 'drop-after'));
  wrap.addEventListener('drop', async (event) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData('text/plain'));
    const rect = wrap.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    let to = index + (after ? 1 : 0);
    if (from < to) to -= 1;
    wrap.classList.remove('drop-before', 'drop-after');
    if (Number.isFinite(from) && from !== to) await moveBlockTo(entry, from, to);
    S.draggingBlock = null;
  });

  if (block.type !== 'divider' && block.type !== 'heading') {
    const title = el('div', 'block-title', block.title || '');
    if (editable()) title.contentEditable = 'true';
    title.dataset.placeholder = '区块标题…';
    title.addEventListener('blur', () => {
      if (title.dataset.retired === '1' || !title.isConnected) return;
      saveBlock(entry, index, { title: title.textContent.trim() });
    });
    wrap.appendChild(title);
  }

  if (block.type === 'divider') {
    wrap.appendChild(el('div', 'block-divider'));
    return wrap;
  }

  // 嵌入卡：把另一张卡片做成一张可点的卡片
  if (block.type === 'card') {
    const targetId = block.settings && block.settings.document;
    const box = el('div', 'embed-card');
    if (!targetId) {
      box.appendChild(emptyBlock({
        iconName: 'file', title: '还没有选卡片',
        text: '嵌入卡会把另一张卡片的内容摘要摆在这里。',
      }));
    } else {
      const known = findNode(targetId);
      const head = el('div', 'embed-head');
      const art = el('span', 'embed-art');
      art.appendChild(docIcon(known ? known.type : 'card', 15));
      head.appendChild(art);
      head.appendChild(el('b', null, known ? known.name : `卡片 #${targetId}`));
      const open = el('button', 'mini-btn is-small', '打开');
      open.addEventListener('click', () => openDoc(targetId));
      head.appendChild(open);
      box.appendChild(head);
      api(`/api/world/cards/${targetId}`).then((payload) => {
        const body = el('div', 'embed-body');
        const summary = (payload.card.body || '').slice(0, 180);
        body.textContent = summary || '（这张卡还没有正文）';
        box.appendChild(body);
      }).catch(() => {});
    }
    wrap.appendChild(box);
    return wrap;
  }

  // 图片块
  if (block.type === 'image') {
    const url = block.settings && block.settings.url;
    const figure = el('figure', 'embed-image');
    if (url) {
      const img = el('img');
      img.src = url;
      img.alt = (block.settings && block.settings.caption) || '图片';
      img.loading = 'lazy';
      figure.appendChild(img);
    } else {
      figure.appendChild(el('div', 'embed-placeholder', '还没有图片：在块菜单里选「插入图片…」'));
    }
    if (block.settings && block.settings.caption) {
      figure.appendChild(el('figcaption', null, block.settings.caption));
    }
    wrap.appendChild(figure);
    return wrap;
  }

  const text = el('div', `block-text${block.type === 'quote' ? ' block-quote' : ''}`);
  if (editable()) text.contentEditable = 'true';
  text.dataset.placeholder = '开始写…（按 / 插入区块，选中文字可加粗）';
  if (block.html) text.innerHTML = block.html;
  else text.textContent = block.text || '';
  text.addEventListener('input', () => {
    debounce(`block:${entry.document.id}:${index}`, () => {
      if (text.dataset.retired === '1' || !text.isConnected) return;   // 已被重渲染换掉
      saveBlock(entry, index, { html: text.innerHTML });
    }, 700);
  });
  text.addEventListener('blur', () => {
    clearTimeout(S.pending.get(`block:${entry.document.id}:${index}`));
    S.pending.delete(`block:${entry.document.id}:${index}`);
    if (text.dataset.retired === '1' || !text.isConnected) return;
    saveBlock(entry, index, { html: text.innerHTML });
  });
  attachMentionPicker(text, entry);
  attachSlashMenu(text, entry, index);
  attachFormatBar(text, entry, index);
  wrap.appendChild(text);

  // 提示框的样式由 .block-kind-callout 承担（见 CSS）
  return wrap;
}

/* ============================================================ 撤销 / 重做
   做法很直接：每次写之前存一份"整卡快照"（别名 + 属性值 + 区块），
   撤销就是把快照 PUT 回去。比逐条反演可靠得多，也不用给每种操作写逆操作。 */
const UNDO = { stack: [], redo: [], limit: 80, applying: false };

function cardSnapshot(entry) {
  const card = entry.card || {};
  return JSON.stringify({
    aliases: card.aliases || [],
    values: card.values || {},
    blocks: card.blocks || [],
  });
}

function labelForPatch(patch) {
  if (patch.title !== undefined) return '修改区块标题';
  if (patch.hidden !== undefined) return patch.hidden ? '隐藏区块' : '显示区块';
  if (patch.comments !== undefined) return '评论区块';
  if (patch.type !== undefined) return '转换区块类型';
  return '编辑正文';
}

function recordAction(entry, before, label) {
  if (UNDO.applying) return;
  const after = cardSnapshot(entry);
  if (after === before) return;
  UNDO.stack.push({ docId: entry.document.id, name: entry.document.name, before, after, label });
  if (UNDO.stack.length > UNDO.limit) UNDO.stack.shift();
  UNDO.redo.length = 0;
  updateUndoUI();
}

async function applyCardSnapshot(docId, json) {
  UNDO.applying = true;
  try {
    const payload = await api(`/api/world/cards/${docId}`, {
      method: 'PUT', body: { ...JSON.parse(json), revision: (S.docs.get(docId) || {}).revision },
    });
    applyCardResponse(S.docs.get(docId), payload);
    renderPanels();
  } catch (error) {
    if (!error || !error.isConflict) toast('这一步没能恢复');
  } finally {
    UNDO.applying = false;
  }
}

async function undoLast() {
  const action = UNDO.stack.pop();
  if (!action) { toast('没有可以撤销的操作'); return; }
  UNDO.redo.push(action);
  await applyCardSnapshot(action.docId, action.before);
  toast(`已撤销：${action.label}`);
  announce(`已撤销${action.label}`);
  updateUndoUI();
}

async function redoLast() {
  const action = UNDO.redo.pop();
  if (!action) { toast('没有可以重做的操作'); return; }
  UNDO.stack.push(action);
  await applyCardSnapshot(action.docId, action.after);
  toast(`已重做：${action.label}`);
  announce(`已重做${action.label}`);
  updateUndoUI();
}

function updateUndoUI() {
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  if (undoBtn) {
    undoBtn.disabled = !UNDO.stack.length;
    undoBtn.title = UNDO.stack.length ? `撤销：${UNDO.stack[UNDO.stack.length - 1].label}（⌘Z）` : '没有可撤销的操作';
  }
  if (redoBtn) {
    redoBtn.disabled = !UNDO.redo.length;
    redoBtn.title = UNDO.redo.length ? `重做：${UNDO.redo[UNDO.redo.length - 1].label}（⇧⌘Z）` : '没有可重做的操作';
  }
}

/** 统一的区块写入：记快照 → PUT → 更新本地 → 重画。 */
async function saveBlocks(entry, blocks, label) {
  const before = cardSnapshot(entry);
  const seq = (entry.saveSeq = (entry.saveSeq || 0) + 1);
  let payload;
  try {
    payload = await api(`/api/world/cards/${entry.document.id}`, {
      method: 'PUT', body: { blocks, revision: entry.revision },
    });
  } catch (error) {
    if (error && error.isConflict) return null;      // 界面已经刷新成最新内容了
    throw error;
  }
  if (seq !== entry.saveSeq) return null;
  applyCardResponse(entry, payload);
  recordAction(entry, before, label);
  return payload.card;
}

async function saveBlock(entry, index, patch, label) {
  const card = entry.card;
  const blocks = (card.blocks || []).map((b, i) => (i === index ? { ...b, ...patch } : b));
  // 统一走 saveBlocks：它会记快照（撤销用）、处理并发写序号、再更新本地副本
  const saved = await saveBlocks(entry, blocks, label || labelForPatch(patch));
  if (!saved) return;
  if (patch.text !== undefined) highlightMentions($(`.card-view[data-doc="${entry.document.id}"]`));
}

async function addBlock(entry, kind, panelIndex) {
  const card = entry.card;
  const blocks = [...(card.blocks || [])];
  const id = `b${Date.now().toString(36)}`;
  blocks.push(kind === 'text'
    ? { id, type: 'text', title: '新小节', text: '' }
    : { id, type: kind, title: kind === 'divider' ? '' : '新小节', text: '' });
  await saveBlocks(entry, blocks, '新增区块');
  renderPanels();
  const view = $(`.card-view[data-doc="${entry.document.id}"]`);
  const last = view && view.querySelectorAll('.block-text');
  if (last && last.length) last[last.length - 1].focus();
}

async function removeBlock(entry, index) {
  const blocks = (entry.card.blocks || []).filter((_, i) => i !== index);
  await saveBlocks(entry, blocks, '删除区块');
  renderPanels();
}

async function moveBlock(entry, index, delta) {
  const target = index + delta;
  await moveBlockTo(entry, index, target);
}

/** 把第 from 块移动到 to 位置（拖拽排序与上下移都走它）。 */
async function moveBlockTo(entry, from, to) {
  const blocks = [...(entry.card.blocks || [])];
  if (from === to || from < 0 || from >= blocks.length || to < 0 || to >= blocks.length) return;
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  await saveBlocks(entry, blocks, '调整区块顺序');
  renderPanels();
}

/* 「四向插入」的左右：VVD 用左右表示并排分栏，这里落成「并排组」标记（§4.1） */
async function moveBlockAcross(entry, index, direction) {
  const blocks = [...(entry.card.blocks || [])];
  const block = { ...blocks[index] };
  const column = clamp((block.column || 1) + direction, 1, 2);
  if (column === (block.column || 1)) { toast(column === 1 ? '已经在左栏' : '已经在右栏'); return; }
  block.column = column;
  blocks[index] = block;
  await saveBlocks(entry, blocks, column === 2 ? '放到右栏' : '放到左栏');
  renderPanels();
  toast(column === 2 ? '已放到右栏' : '已放回左栏');
}

async function toggleBlockHidden(entry, index) {
  const block = (entry.card.blocks || [])[index];
  await saveBlock(entry, index, { hidden: !block.hidden });
  renderPanels();
}

/* ------------------------------------------------- @ 提及（调研文档 §4.2） */
/**
 * 在正文里输入 `@` 拉起卡片选择器：
 *  - 输入 `@` 后面的字作为关键词，去 /api/world/search 找卡片；
 *  - 回车或点击就把「@关键词」替换成卡片名；
 *  - 如果输入的词和卡片名不同，顺手把这个词存成它的别名（对应 VVD「链接一个被识别的
 *    名字会把它存成别名」的行为）。
 */
function attachMentionPicker(node, entry) {
  const state = { open: false, query: '', start: 0, items: [], index: 0 };
  const popup = el('div', 'mention-pop');
  popup.hidden = true;
  document.body.appendChild(popup);

  const close = () => {
    state.open = false;
    popup.hidden = true;
    popup.innerHTML = '';
  };

  const caretInfo = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer)) return null;
    // 同上：用光标所在文本节点的前缀，换行后也能正确算出 @ 的位置
    return { text: (range.startContainer.textContent || "").slice(0, range.startOffset), range };
  };

  const renderPopup = () => {
    popup.innerHTML = '';
    state.items.forEach((item, index) => {
      const row = el('div', `mention-row${index === state.index ? ' is-active' : ''}`);
      row.appendChild(el('span', 'mr-name', item.name));
      if (item.fuzzy) row.appendChild(el('span', 'mr-kind', item.snippet || '≈ 打错了一点'));
      else if (item.entity_type) row.appendChild(el('span', 'mr-kind', item.entity_type));
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        insert(item);
      });
      popup.appendChild(row);
    });
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const base = rect && rect.width ? rect : node.getBoundingClientRect();
    popup.style.left = `${Math.min(base.left, window.innerWidth - 280)}px`;
    popup.style.top = `${base.bottom + 6}px`;
    popup.hidden = false;
  };

  const insert = async (item) => {
    const info = caretInfo();
    if (!info) return;
    const typed = state.query;
    // 退掉「@关键词」，再在光标处插入名字（用 execCommand 保住已有格式）
    for (let i = 0; i <= typed.length; i += 1) document.execCommand('delete');
    document.execCommand('insertText', false, item.name);
    close();
    saveBlock(entry, indexOfBlock(node), { html: node.innerHTML });
    if (typed && typed !== item.name) {
      // 把输入过的写法补成别名，下次不敲 @ 也能被自动识别
      try {
        const payload = await api(`/api/world/cards/${item.id}`);
        const aliases = Array.from(new Set([...(payload.card.aliases || []), typed]));
        await api(`/api/world/cards/${item.id}`, { method: 'PUT', body: { aliases } });
        toast(`已把「${typed}」记为「${item.name}」的别名`);
      } catch (error) { /* 别名失败不影响正文 */ }
    }
  };

  const search = debounce_(async () => {
    const query = state.query;
    const data = await api(`/api/world/search?q=${encodeURIComponent(query)}&limit=8&fuzzy=1`);
    state.items = data.results.filter((r) => r.type === 'card');
    state.index = 0;
    if (!state.items.length) { close(); return; }
    state.open = true;
    renderPopup();
  }, 160);

  node.addEventListener('input', () => {
    const info = caretInfo();
    if (!info) { close(); return; }
    const match = /@([^\s@]{0,20})$/.exec(info.text);
    if (!match) { close(); return; }
    state.query = match[1];
    state.start = info.text.length - match[0].length;
    search();
  });

  node.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      state.index = clamp(state.index + (event.key === 'ArrowDown' ? 1 : -1), 0, state.items.length - 1);
      renderPopup();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const item = state.items[state.index];
      if (item) insert(item);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  node.addEventListener('blur', () => setTimeout(close, 120));
}

/* --------------------------------------------------- `/` 斜杠菜单（§4.1） */
const SLASH_ITEMS = [
  { key: 'text', label: '文本', hint: '普通段落', type: 'text' },
  { key: 'h1', label: '标题 1', hint: '大章节标题', type: 'heading', html: '<h1>' },
  { key: 'h2', label: '标题 2', hint: '中章节标题', type: 'heading', html: '<h2>' },
  { key: 'h3', label: '标题 3', hint: '小章节标题', type: 'heading', html: '<h3>' },
  { key: 'quote', label: '引用', hint: '带引用样式', type: 'quote' },
  { key: 'callout', label: '提示框', hint: '规则或需要记住的事', type: 'callout' },
  { key: 'divider', label: '分隔线', hint: '水平分隔', type: 'divider' },
  { key: 'ul', label: '无序列表', hint: '圆点列表', command: 'insertUnorderedList' },
  { key: 'ol', label: '有序列表', hint: '编号列表', command: 'insertOrderedList' },
  { key: 'code', label: '行内代码', hint: '<code>', command: 'inline', wrap: 'code' },
  { key: 'b', label: '加粗', hint: '⌘B', command: 'bold' },
  { key: 'i', label: '斜体', hint: '⌘I', command: 'italic' },
];

/** 输入 `/` 拉起区块菜单（VVD 的招牌交互）。 */
function attachSlashMenu(node, entry, index) {
  const state = { open: false, query: '', items: [], active: 0 };
  // 面板重渲染会换掉 DOM 节点，闭包里那个 node 会变成"旧节点"。
  // 所有写操作都按「区块序号」实时取当前节点，避免把内容写回旧节点/旧内容。
  const live = () => $(`.card-view[data-doc="${entry.document.id}"] .block[data-index="${index}"] .block-text`) || node;
  const popup = el('div', 'mention-pop slash-pop');
  popup.hidden = true;
  document.body.appendChild(popup);

  const close = () => { state.open = false; popup.hidden = true; popup.innerHTML = ''; };

  const caretText = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer)) return null;
    // 只看「光标所在文本节点」里光标之前的部分：换行（contenteditable 会插 <div>）
    // 之后 node 级文本不带空白，用整段文字判断会漏掉新起的一行。
    return (range.startContainer.textContent || "").slice(0, range.startOffset);
  };

  const render = () => {
    popup.innerHTML = '';
    if (!state.items.length) {
      const row = el('div', 'mention-row is-empty');
      row.appendChild(el('span', 'mr-name', '没有匹配的区块'));
      row.appendChild(el('span', 'mr-kind', 'Esc 关闭'));
      popup.appendChild(row);
    }
    state.items.forEach((item, i) => {
      const row = el('div', `mention-row${i === state.active ? ' is-active' : ''}`);
      row.appendChild(el('span', 'mr-name', item.label));
      row.appendChild(el('span', 'mr-kind', item.hint || ''));
      row.addEventListener('mousedown', (event) => { event.preventDefault(); apply(item); });
      popup.appendChild(row);
    });
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const base = rect && rect.width ? rect : node.getBoundingClientRect();
    popup.style.left = `${Math.min(base.left, window.innerWidth - 280)}px`;
    popup.style.top = `${base.bottom + 6}px`;
    popup.hidden = false;
  };

  /** 精确退掉光标前的 "/关键词"（execCommand('delete') 在换行后的 <div> 里不可靠）。 */
  const deleteTyped = (count) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== 3) return;
    const offset = range.startOffset;
    const from = Math.max(0, offset - count);
    container.deleteData(from, offset - from);
    const caret = document.createRange();
    caret.setStart(container, from);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  };

  const setBlockType = async (type, wrapTag) => {

    const card = entry.card;
    let html = node.innerHTML;
    if (wrapTag !== undefined) {
      // 标题：把内容换成对应标签
      const inner = node.textContent || '';
      html = inner.trim() ? `<${wrapTag}>${inner}</${wrapTag}>` : `<${wrapTag}><br></${wrapTag}>`;
    }
    const blocks = (card.blocks || []).map((b, i) => (i === index ? { ...b, type, html } : b));
    const payload = await api(`/api/world/cards/${entry.document.id}`, { method: 'PUT', body: { blocks } });
    applyCardResponse(entry, payload);
    renderPanels();
  };

  const apply = async (item) => {
    deleteTyped(state.query.length + 1);      // 退掉 "/关键词"
    close();
    const tag = item.html ? item.html.slice(1, -1) : null;
    if (item.command === 'inline') {
      document.execCommand('insertHTML', false, `<${item.wrap}></${item.wrap}>`);
      return;
    }
    if (item.command) {                        // 列表 / 加粗 / 斜体
      document.execCommand(item.command, false, null);
      await saveBlock(entry, index, { html: live().innerHTML });
      return;
    }
    if (item.type === 'divider') {             // 分隔线：在下面插一个新块
      const blocks = [...(entry.card.blocks || [])];
      blocks.splice(index + 1, 0, { id: `b${Date.now().toString(36)}`, type: 'divider', title: '', text: '' });
      const payload = await api(`/api/world/cards/${entry.document.id}`, { method: 'PUT', body: { blocks, revision: entry.revision } });
      applyCardResponse(entry, payload);
      renderPanels();
      return;
    }
    await setBlockType(item.type, tag);
  };

  node.addEventListener('input', () => {
    const before = caretText();
    if (before === null) { close(); return; }
    // 关键词里允许空格（「标题 2」要能过滤），只挡换行与斜杠
    const match = /(?:^|\s)\/([^\n/]{0,16})$/.exec(before);
    if (!match) { close(); return; }
    state.query = match[1];
    const query = state.query.trim();
    state.items = SLASH_ITEMS.filter((item) => !query
      || item.label.includes(query)
      || item.key.startsWith(query.toLowerCase())
      || item.hint.toLowerCase().includes(query.toLowerCase()));
    state.active = 0;
    state.open = true;      // 没匹配时也留着弹层，并给一行提示（不然用户以为卡住）
    render();
  });

  node.addEventListener('keydown', (event) => {
    // Tab / ⇧Tab：缩进与取消缩进（斜杠菜单开着时 Tab 是选中菜单项）
    if (!state.open && event.key === 'Tab') {
      event.preventDefault();
      const current = (Number(entry.card.blocks[index] && entry.card.blocks[index].level) || 0);
      const next = clamp(current + (event.shiftKey ? -1 : 1), 0, 2);
      if (next !== current) {
        saveBlock(entry, index, { level: next }, event.shiftKey ? '取消缩进' : '缩进区块')
          .then(() => { renderPanels(); announce(`第 ${next} 层`); });
      }
      return;
    }
    if (!state.open) {
      if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]);
        debounce(`block:${entry.document.id}:${index}`, () => saveBlock(entry, index, { html: node.innerHTML }), 300);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      state.active = clamp(state.active + (event.key === 'ArrowDown' ? 1 : -1), 0, state.items.length - 1);
      render();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const item = state.items[state.active];
      if (!item) { close(); return; }        // 没得选就让它照常换行
      event.preventDefault();
      apply(item);
    } else if (event.key === 'Escape') {
      close();
    }
  });

  node.addEventListener('blur', () => setTimeout(close, 120));
}

/* ------------------------------- 选中文字浮出的气泡工具栏（全局唯一，图标化） */
/**
 * 对齐 VVD 的选区气泡：上排是**动作**（创建卡片 / 链接卡片），下排是**格式**——
 * A▾ 段落样式、B I U S、引用、链接、≡▾ 列表、☰▾ 对齐、A 文字颜色、◐ 高亮、👁 块可见性。
 * 全部用 Minimal 设计系统的线条图标，圆角矩形浮层。
 */
const FORMAT_BAR = { wrap: null, target: null, range: null, hovering: false, menu: null };

const FB_TEXT_COLORS = ['#0a0a0a', '#525252', '#858585', '#cf001c', '#16a34a', '#2563eb', '#a855f7', '#d97706'];
const FB_HIGHLIGHTS = ['rgba(24,24,27,.10)', 'rgba(37,99,235,.18)', 'rgba(22,163,74,.20)', 'rgba(207,0,28,.16)', 'rgba(217,119,6,.20)', 'rgba(168,85,247,.18)'];

function fbButton(name, label, title, onClick, withCaret = false) {
  const button = el('button', null);
  button.type = 'button';
  button.title = title || label || '';
  if (name) button.appendChild(icon(name, 15));
  if (label) button.appendChild(el('span', null, label));
  if (withCaret) {
    const caret = icon('chevron-down', 12);
    caret.classList.add('fb-caret');
    button.appendChild(caret);
  }
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();          // 保住选区
    onClick(button);
  });
  return button;
}

function closeFbMenu() {
  if (FORMAT_BAR.menu) { FORMAT_BAR.menu.remove(); FORMAT_BAR.menu = null; }
}

function openFbMenu(anchor, build) {
  closeFbMenu();
  const menu = el('div', 'fb-menu');
  build(menu);
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  FORMAT_BAR.menu = menu;
}

function fbMenuButton(menu, label, { iconName, on, run }) {
  const button = el('button', on ? 'is-on' : null);
  button.type = 'button';
  if (iconName) button.appendChild(icon(iconName, 15));
  button.appendChild(el('span', null, label));
  if (on) button.appendChild(icon('check', 14));
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    run();
    closeFbMenu();
  });
  menu.appendChild(button);
  return button;
}

function fbSwatchMenu(anchor, colors, apply) {
  openFbMenu(anchor, (menu) => {
    const box = el('div', 'fb-swatches');
    colors.forEach((color) => {
      const swatch = el('button');
      swatch.type = 'button';
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener('mousedown', (event) => {
        event.preventDefault();
        apply(color);
        closeFbMenu();
      });
      box.appendChild(swatch);
    });
    menu.appendChild(box);
  });
}

/** 当前选区所在的块级标签（用来在「段落样式」里打勾）。 */
function currentBlockTag() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return 'p';
  let node = selection.getRangeAt(0).startContainer;
  while (node && node.nodeType !== 1) node = node.parentNode;
  while (node && node.tagName && !['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'DIV'].includes(node.tagName)) {
    node = node.parentNode;
  }
  return node && node.tagName ? node.tagName.toLowerCase() : 'p';
}

function formatBarElement() {
  if (FORMAT_BAR.wrap) return FORMAT_BAR.wrap;
  const wrap = el('div', 'fb-wrap');
  wrap.hidden = true;

  const runCommand = (command, value) => {
    const target = FORMAT_BAR.target;
    if (!target) return;
    const selection = window.getSelection();
    if (FORMAT_BAR.range) {
      selection.removeAllRanges();
      selection.addRange(FORMAT_BAR.range);
    }
    if (command === 'createLink' && !value) return;
    document.execCommand(command, false, value === undefined ? null : value);
    FORMAT_BAR.range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    saveBlock(target.entry, target.index, { html: target.node.innerHTML });
    formatBarUpdate();
  };

  const setBlockTag = (tag) => {
    document.execCommand('formatBlock', false, tag);
    const target = FORMAT_BAR.target;
    if (target) saveBlock(target.entry, target.index, { html: target.node.innerHTML });
    formatBarUpdate();
  };

  /* 上排：选区动作 */
  const actions = el('div', 'fb-actions');
  actions.appendChild(fbButton('card-plus', '创建卡片', '用选中的文字新建一张卡片', () => createCardFromSelection()));
  actions.appendChild(fbButton('link', '链接卡片', '把选中的文字链到已有卡片', () => linkSelectionToCard()));
  wrap.appendChild(actions);

  /* 下排：格式 */
  const bar = el('div', 'format-bar');
  bar.appendChild(fbButton('type', null, '段落样式', (button) => {
    const tag = currentBlockTag();
    openFbMenu(button, (menu) => {
      [['p', '正文'], ['h1', '标题 1'], ['h2', '标题 2'], ['h3', '标题 3'], ['blockquote', '引用']]
        .forEach(([value, label]) => fbMenuButton(menu, label, {
          on: tag === value, run: () => setBlockTag(value),
        }));
    });
  }, true));

  ['bold', 'italic', 'underline', 'strikeThrough'].forEach((command, index) => {
    const glyph = ['B', 'I', 'U', 'S'][index];
    const button = el('button', null, glyph);
    button.type = 'button';
    button.title = ['加粗 ⌘B', '斜体 ⌘I', '下划线 ⌘U', '删除线'][index];
    button.style.fontWeight = command === 'bold' ? '700' : '500';
    button.style.fontStyle = command === 'italic' ? 'italic' : 'normal';
    button.style.textDecoration = command === 'underline' ? 'underline' : (command === 'strikeThrough' ? 'line-through' : 'none');
    button.addEventListener('mousedown', (event) => { event.preventDefault(); runCommand(command); });
    bar.appendChild(button);
  });

  bar.appendChild(fbButton('quote', null, '引用', () => {
    const tag = currentBlockTag();
    setBlockTag(tag === 'blockquote' ? 'p' : 'blockquote');
  }));
  bar.appendChild(fbButton('link', null, '插入 / 取消链接', (button) => {
    const target = FORMAT_BAR.target;
    const selection = window.getSelection();
    let inside = selection && selection.anchorNode;
    while (inside && inside.nodeType !== 1) inside = inside.parentNode;
    const existing = inside && inside.closest ? inside.closest('a') : null;
    if (existing) { runCommand('unlink'); return; }
    const url = window.prompt('链接地址', 'https://');
    if (url) runCommand('createLink', url);
    void button;
    void target;
  }));
  bar.appendChild(fbButton('list', null, '列表', (button) => {
    openFbMenu(button, (menu) => {
      fbMenuButton(menu, '无序列表', { iconName: 'list', run: () => runCommand('insertUnorderedList') });
      fbMenuButton(menu, '有序列表', { iconName: 'list-ordered', run: () => runCommand('insertOrderedList') });
    });
  }, true));
  bar.appendChild(fbButton('align', null, '对齐', (button) => {
    openFbMenu(button, (menu) => {
      fbMenuButton(menu, '左对齐', { iconName: 'align', run: () => runCommand('justifyLeft') });
      fbMenuButton(menu, '居中', { iconName: 'align', run: () => runCommand('justifyCenter') });
      fbMenuButton(menu, '右对齐', { iconName: 'align', run: () => runCommand('justifyRight') });
    });
  }, true));

  const colorButton = fbButton(null, 'A', '文字颜色', (button) => {
    fbSwatchMenu(button, FB_TEXT_COLORS, (color) => runCommand('foreColor', color));
  });
  colorButton.classList.add('fb-color');
  bar.appendChild(colorButton);

  bar.appendChild(fbButton('droplet', null, '高亮', (button) => {
    fbSwatchMenu(button, FB_HIGHLIGHTS, (color) => runCommand('hiliteColor', color));
  }));

  const eyeButton = fbButton('eye', null, '这块在站点上显示 / 隐藏', async () => {
    const target = FORMAT_BAR.target;
    if (!target) return;
    const block = (target.entry.card.blocks || [])[target.index];
    if (!block) return;
    await saveBlock(target.entry, target.index, { hidden: !block.hidden });
    toast(block.hidden ? '这块已恢复显示' : '这块已从站点隐藏');
    renderPanels();
  });
  eyeButton.dataset.role = 'visibility';
  bar.appendChild(eyeButton);

  wrap.appendChild(bar);
  document.body.appendChild(wrap);
  FORMAT_BAR.wrap = wrap;
  document.addEventListener('selectionchange', formatBarUpdate);
  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.fb-menu') && !event.target.closest('.format-bar') && !event.target.closest('.fb-actions')) {
      closeFbMenu();
    }
  });
  return wrap;
}

function formatBarHide() {
  if (FORMAT_BAR.wrap) FORMAT_BAR.wrap.hidden = true;
  closeFbMenu();
}

function formatBarUpdate() {
  const wrap = FORMAT_BAR.wrap;
  const target = FORMAT_BAR.target;
  if (!wrap || !target || FORMAT_BAR.menu) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) { if (!FORMAT_BAR.hovering) wrap.hidden = true; return; }
  const range = selection.getRangeAt(0);
  const inside = target.node.contains(range.commonAncestorContainer);
  if (selection.isCollapsed || !inside) {
    if (!FORMAT_BAR.hovering) wrap.hidden = true;
    return;
  }
  FORMAT_BAR.range = range.cloneRange();
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) { if (!FORMAT_BAR.hovering) wrap.hidden = true; return; }
  wrap.hidden = false;
  // 先显示再量高度：浮层要整块贴在选区上方
  const height = wrap.offsetHeight || 76;
  const above = rect.top - height - 12;
  wrap.style.left = `${clamp(rect.left, 8, window.innerWidth - wrap.offsetWidth - 12)}px`;
  wrap.style.top = `${above > 8 ? above : Math.min(rect.bottom + 12, window.innerHeight - height - 8)}px`;

  // 状态回显：加粗 / 斜体 / 下划线 / 引用 / 块可见性
  const states = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strikeThrough: document.queryCommandState('strikeThrough'),
  };
  $$('.format-bar button', wrap).forEach((button) => {
    const glyph = button.textContent.trim();
    const map = { B: 'bold', I: 'italic', U: 'underline', S: 'strikeThrough' };
    if (map[glyph]) button.classList.toggle('is-on', states[map[glyph]]);
  });
  const block = (target.entry.card.blocks || [])[target.index];
  const eye = $('[data-role="visibility"]', wrap);
  if (eye && block) {
    eye.innerHTML = '';
    eye.appendChild(icon(block.hidden ? 'eye-off' : 'eye', 15));
    eye.title = block.hidden ? '这块在站点上被隐藏了' : '这块在站点上显示';
  }
}

function attachFormatBar(node, entry, index) {
  const wrap = formatBarElement();
  wrap.addEventListener('pointerenter', () => { FORMAT_BAR.hovering = true; });
  wrap.addEventListener('pointerleave', () => { FORMAT_BAR.hovering = false; });
  FORMAT_BAR.target = { node, entry, index };
  node.addEventListener('focus', () => { FORMAT_BAR.target = { node, entry, index }; });
  node.addEventListener('blur', () => { if (!FORMAT_BAR.hovering) formatBarHide(); });
}

/* --------------------------------- 选区动作：创建卡片 / 链接卡片 */
function wrapSelectionAsMention(documentId) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const text = selection.toString();
  const span = document.createElement('span');
  span.className = 'mentions-inline';
  span.dataset.target = String(documentId);
  span.textContent = text;
  range.deleteContents();
  range.insertNode(span);
  selection.removeAllRanges();
  return true;
}

async function createCardFromSelection() {
  const target = FORMAT_BAR.target;
  const selection = window.getSelection();
  if (!target || !selection || selection.isCollapsed) { toast('先选中一段文字'); return; }
  const text = selection.toString().trim();
  if (!text) { toast('先选中一段文字'); return; }

  const type = S.types.find((t) => !t.hidden) || S.types[0];
  const created = await api('/api/world/documents', {
    method: 'POST',
    body: { type: 'card', name: text.slice(0, 60), entity_type: type ? type.id : null },
  });
  // 选中的文字成为新卡片的「概览」
  await api(`/api/world/cards/${created.id}`, {
    method: 'PUT',
    body: { blocks: [{ id: 'b1', type: 'text', title: '概览', text }] },
  });
  wrapSelectionAsMention(created.id);
  await saveBlock(target.entry, target.index, { html: target.node.innerHTML });
  await reloadTree();
  toast(`已创建卡片「${created.name}」，选中的文字已链到它`);
  formatBarHide();
}

async function linkSelectionToCard() {
  const target = FORMAT_BAR.target;
  const selection = window.getSelection();
  if (!target || !selection || selection.isCollapsed) { toast('先选中一段文字'); return; }
  const text = selection.toString().trim();
  const range = selection.getRangeAt(0).cloneRange();

  cardPicker(async (chosen) => {
    selection.removeAllRanges();
    selection.addRange(range);
    wrapSelectionAsMention(chosen.id);
    await saveBlock(target.entry, target.index, { html: target.node.innerHTML });
    if (text && text !== chosen.name) {
      const payload = await api(`/api/world/cards/${chosen.id}`);
      const aliases = Array.from(new Set([...(payload.card.aliases || []), text]));
      await api(`/api/world/cards/${chosen.id}`, { method: 'PUT', body: { aliases } });
      toast(`已链到「${chosen.name}」，并把「${text}」记成别名`);
    } else {
      toast(`已链到「${chosen.name}」`);
    }
    formatBarHide();
  });
}

/** 块菜单：转换类型 / 复制 / 上下移 / 隐藏 / 删除（拖动把手点一下打开）。 */
function openBlockMenu(anchor, entry, index) {
  const block = (entry.card.blocks || [])[index];
  if (!block) return;
  const menu = el('div', 'fb-menu block-menu');
  const item = (label, iconName, run, danger) => {
    const button = el('button', danger ? 'is-danger' : null);
    button.type = 'button';
    if (iconName) button.appendChild(icon(iconName, 14));
    button.appendChild(el('span', null, label));
    button.addEventListener('click', async () => { menu.remove(); await run(); });
    menu.appendChild(button);
    return button;
  };
  const convert = (type, label) => item(label, type === 'heading' ? 'type' : 'file', async () => {
    if (block.type === type) return;
    await saveBlock(entry, index, { type }, '转换区块类型');
    renderPanels();
  });
  item('正文', 'type', async () => { await saveBlock(entry, index, { type: 'text' }, '转换区块类型'); renderPanels(); });
  item('标题', 'type', async () => { await saveBlock(entry, index, { type: 'heading' }, '转换区块类型'); renderPanels(); });
  item('引用', 'quote', async () => { await saveBlock(entry, index, { type: 'quote' }, '转换区块类型'); renderPanels(); });
  item('提示框', 'circle-alert', async () => { await saveBlock(entry, index, { type: 'callout' }, '转换区块类型'); renderPanels(); });
  void convert;
  menu.appendChild(el('div', 'fb-sep'));
  item('缩进一层', 'arrow-right', async () => {
    const level = Math.min(2, (Number(block.level) || 0) + 1);
    await saveBlock(entry, index, { level }, '缩进区块');
    renderPanels();
    announce(`已缩进到第 ${level} 层`);
  });
  item('取消缩进', 'arrow-left', async () => {
    const level = Math.max(0, (Number(block.level) || 0) - 1);
    await saveBlock(entry, index, { level }, '取消缩进');
    renderPanels();
    announce(level ? `已缩进到第 ${level} 层` : '已回到顶层');
  });
  item(block.collapsed ? '展开这一块' : '折叠这一块', block.collapsed ? 'chevron-down' : 'chevron-up', async () => {
    await saveBlock(entry, index, { collapsed: !block.collapsed }, '折叠区块');
    renderPanels();
  });
  item('嵌入一张卡片…', 'file', () => {
    openCardPicker({
      title: '嵌入哪张卡片',
      exclude: entry.document.id,
      onPick: async (chosen) => {
        await saveBlock(entry, index, { type: 'card', settings: { document: chosen.id } }, '嵌入卡片');
        renderPanels();
      },
    });
  });
  item('插入图片…', 'box', () => imageBlockDialog(entry, index));
  item('在上面插入一块', 'circle-plus', () => insertBlockAt(entry, index));
  item('复制这一块', 'file', () => duplicateBlock(entry, index));
  item(block.hidden ? '在站点上显示' : '在站点上隐藏', block.hidden ? 'eye' : 'eye-off', () => toggleBlockHidden(entry, index));
  item('评论…', 'message-circle-more', () => openBlockComments(anchor, entry, index));
  menu.appendChild(el('div', 'fb-sep'));
  item('删除这一块', 'trash-2', () => removeBlock(entry, index), true);

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  const close = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/** 插入图片：给地址，或者直接上传（走文档媒体接口）。 */
async function imageBlockDialog(entry, index) {
  openModal('插入图片', (body) => {
    const urlInput = el('input', 'mini-input');
    urlInput.placeholder = 'https://… 图片地址';
    const captionInput = el('input', 'mini-input');
    captionInput.placeholder = '图注（可选）';
    const row = el('div', 'form-row');
    row.appendChild(el('label', null, '地址'));
    row.appendChild(urlInput);
    body.appendChild(row);
    const row2 = el('div', 'form-row');
    row2.appendChild(el('label', null, '图注'));
    row2.appendChild(captionInput);
    body.appendChild(row2);

    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    body.appendChild(fileInput);
    const actions = el('div', 'form-row');
    const upload = el('button', 'mini-btn', '上传本地图片');
    upload.addEventListener('click', () => fileInput.click());
    actions.appendChild(upload);
    const save = el('button', 'mini-btn is-primary', '插入');
    save.addEventListener('click', async () => {
      if (!urlInput.value.trim()) { toast('先给个地址或上传一张图'); return; }
      await saveBlock(entry, index, {
        type: 'image',
        settings: { url: urlInput.value.trim(), caption: captionInput.value.trim() },
      }, '插入图片');
      closeModal();
      renderPanels();
      announce('已插入图片');
    });
    actions.appendChild(save);
    body.appendChild(actions);

    fileInput.addEventListener('change', async () => {
      const file = (fileInput.files || [])[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('kind', 'image');
      form.append('title', file.name);
      const result = await api(`/api/world/documents/${entry.document.id}/media`, { method: 'POST', form });
      urlInput.value = result.entry.url;
      toast('已上传，点「插入」放进正文');
    });
  });
}

async function insertBlockAt(entry, index) {
  const blocks = [...(entry.card.blocks || [])];
  blocks.splice(index, 0, { id: `b${Date.now().toString(36)}`, type: 'text', title: '', text: '' });
  await saveBlocks(entry, blocks, '插入区块');
  renderPanels();
}

async function duplicateBlock(entry, index) {
  const blocks = [...(entry.card.blocks || [])];
  const source = blocks[index];
  blocks.splice(index + 1, 0, { ...source, id: `b${Date.now().toString(36)}` });
  await saveBlocks(entry, blocks, '复制区块');
  renderPanels();
  toast('已复制这一块');
}

/** 块评论：一个小浮层，能发评论、标记解决、删除。 */
function openBlockComments(anchor, entry, index) {
  const block = (entry.card.blocks || [])[index] || {};
  const comments = [...(block.comments || [])];
  const pop = el('div', 'comment-pop');
  pop.appendChild(el('div', 'comment-head', `评论 · ${block.title || (block.text || '').slice(0, 12) || '这一块'}`));
  const list = el('div', 'comment-list');
  const render = () => {
    list.innerHTML = '';
    if (!comments.length) list.appendChild(el('p', 'hint', '还没有评论。写下第一条，给自己或同伴留个记号。'));
    comments.forEach((comment, i) => {
      const row = el('div', `comment-row${comment.resolved ? ' is-resolved' : ''}`);
      const head = el('div', 'comment-meta');
      head.appendChild(el('b', null, comment.author || '我'));
      head.appendChild(el('span', 'hint', (comment.at || '').replace('T', ' ').slice(0, 16)));
      row.appendChild(head);
      row.appendChild(el('div', 'comment-text', comment.text));
      const actions = el('div', 'comment-actions');
      const resolve = el('button', 'mini-btn is-small', comment.resolved ? '重新打开' : '标记解决');
      resolve.addEventListener('click', async () => {
        comments[i] = { ...comment, resolved: !comment.resolved };
        await saveComments();
        render();
      });
      const remove = el('button', 'mini-btn is-small is-danger', '删除');
      remove.addEventListener('click', async () => {
        comments.splice(i, 1);
        await saveComments();
        render();
      });
      actions.appendChild(resolve);
      actions.appendChild(remove);
      row.appendChild(actions);
      list.appendChild(row);
    });
  };
  const saveComments = async () => {
    await saveBlock(entry, index, { comments }, '评论区块');
    renderPanels();
  };

  const input = el('textarea', 'comment-input');
  input.rows = 2;
  input.placeholder = '写评论…（⌘↵ 发送）';
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    comments.push({
      id: `c${Date.now().toString(36)}`,
      author: '我',
      text,
      at: new Date().toISOString(),
      resolved: false,
    });
    input.value = '';
    await saveComments();
    render();
    announce('评论已保存');
  };
  input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); send(); }
  });
  const foot = el('div', 'comment-foot');
  foot.appendChild(input);
  const sendBtn = el('button', 'mini-btn is-primary', '发送');
  sendBtn.addEventListener('click', send);
  foot.appendChild(sendBtn);

  pop.appendChild(list);
  pop.appendChild(foot);
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${clamp(rect.right - 320, 8, window.innerWidth - 336)}px`;
  pop.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 320)}px`;
  input.focus();
  render();
  const close = (event) => {
    if (!pop.contains(event.target) && !anchor.contains(event.target)) {
      pop.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/** 找到某个区块在它所属卡片里的序号（@ 提及保存时要用）。 */
function indexOfBlock(node) {
  const view = node.closest('.card-view');
  if (!view) return 0;
  const blocks = Array.from(view.querySelectorAll('.block'));
  return Math.max(0, blocks.indexOf(node.closest('.block')));
}

/** 轻量防抖（给搜索用，和 S.pending 那套分开，避免互相清理）。 */
function debounce_(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* --------------------------------------------------------- 类型选择 / 选择器 */
async function pickType(entry, panelIndex) {
  const options = S.types.filter((t) => !t.hidden);
  const id = window.prompt(
    `选择类型（输入编号）：\n${options.map((t, i) => `${i + 1}. ${t.name}`).join('\n')}`,
    String(options.findIndex((t) => t.id === entry.document.entity_type) + 1 || 1),
  );
  const index = Number(id) - 1;
  if (!options[index]) return;
  const chosen = options[index];
  await api(`/api/world/documents/${entry.document.id}`, { method: 'PUT', body: { entity_type: chosen.id } });
  await refreshDoc(entry.document.id);
  toast(`类型已改为「${chosen.name}」`);
}

/**
 * 卡片选择器：一个可搜索的浮层（替换掉原来那套 window.prompt 问编号的做法）。
 * 输入即搜、↑↓ 选择、↵ 或点击确认、Esc 关闭。
 */
function openCardPicker({ title = '选择卡片', exclude = null, onPick }) {
  const overlay = el('div', 'picker');
  const box = el('div', 'picker-box');
  const head = el('div', 'picker-head');
  head.appendChild(icon('search', 15));
  const input = el('input');
  input.type = 'search';
  input.placeholder = title;
  head.appendChild(input);
  box.appendChild(head);
  const list = el('div', 'picker-list');
  box.appendChild(list);
  const foot = el('div', 'picker-foot');
  foot.appendChild(el('span', null, '↑↓ 选择 · ↵ 打开 · esc 关闭'));
  box.appendChild(foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  input.focus();

  let items = [];
  let active = 0;

  const close = () => overlay.remove();

  const render = () => {
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(el('div', 'picker-empty', '没有匹配的卡片'));
      return;
    }
    items.forEach((item, index) => {
      const row = el('div', `picker-row${index === active ? ' is-active' : ''}`);
      row.appendChild(icon('file', 15));
      const text = el('div', 'picker-text');
      text.appendChild(el('b', null, item.name));
      if (item.entity_type) text.appendChild(el('span', 'hint', item.entity_type));
      if (item.snippet) text.appendChild(el('span', 'picker-snippet', item.snippet));
      row.appendChild(text);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(item);
      });
      list.appendChild(row);
    });
  };

  const choose = (item) => {
    close();
    onPick(item);
  };

  const search = debounce_(async () => {
    const query = input.value.trim();
    const data = await api(`/api/world/search?q=${encodeURIComponent(query)}&limit=12&fuzzy=1`);
    items = data.results.filter((r) => r.type === 'card' && r.id !== exclude);
    active = 0;
    render();
  }, 140);

  input.addEventListener('input', search);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = clamp(active + (event.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, items.length - 1));
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (items[active]) choose(items[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
  search();
}

/** 兼容旧调用：打开选择器，选中后回调。 */
function cardPicker(onPick) {
  openCardPicker({ onPick });
}

/* ==================================================== 时间线（经典编辑器） */
/**
 * 复用已有的经典编辑器：面板里直接嵌 `/w/timeline/<doc_id>`（像素级复刻的那一版），
 * 编辑器负责画布、拖拽、缩放、时间段；顶栏补上它没有的两件事——**日历与纪元**、
 * **事件与关联卡片**。适配层见 world/classic.py。
 */
function renderTimelineFrame(entry) {
  const wrap = el('div', 'tl-frame-wrap');
  const ui = entry.frameUi || (entry.frameUi = { panel: null });

  const bar = el('div', 'tl-frame-bar');
  const views = el('div', 'seg');
  [['line', '线视图'], ['calendar', '日历视图']].forEach(([value, label]) => {
    const seg = el('button', `seg-btn${(CAL_STATE.view || 'line') === value ? ' is-on' : ''}`, label);
    seg.type = 'button';
    seg.addEventListener('click', () => {
      CAL_STATE.view = value;
      CAL_STATE.initialized = false;
      renderPanels();
    });
    views.appendChild(seg);
  });
  bar.appendChild(views);
  const toggle = (key, label, title) => {
    const node = button(label, title, async () => {
      ui.panel = ui.panel === key ? null : key;
      if (ui.panel) await ensureTimelineState(entry);
      renderPanels();
    }, ui.panel === key);
    bar.appendChild(node);
  };
  toggle('meta', '事件与卡片', '经典编辑器里看不到的：事件精度、纪元归属、关联卡片');
  toggle('calendar', '日历与纪元', '自定义日历（月 / 卫星 / 精度）与纪元');
  bar.appendChild(button('⟳', '重新载入编辑器', () => {
    const frame = $('.timeline-frame', wrap);
    if (frame) frame.src = `${frame.src.split('#')[0]}#reload=${Date.now()}`;
    toast('已重新载入');
  }));
  bar.appendChild(button('↗', '在新标签页打开', () => {
    window.open(`/world/timeline/${entry.document.id}`, '_blank', 'noopener');
  }));
  bar.appendChild(el('span', 'tl-frame-hint',
    '画布、拖拽、时间段用左侧的经典编辑器；日历与卡片在这里管。'));

  const body = el('div', 'tl-frame-body');
  const frame = el('iframe', 'timeline-frame');
  frame.src = `/w/timeline/${entry.document.id}`;
  frame.title = `${entry.document.name} · 时间线编辑器`;
  body.appendChild(frame);

  if (ui.panel === 'calendar' && entry.timeline) {
    body.appendChild(calendarPanel(entry));
  }
  if (ui.panel === 'meta') {
    body.appendChild(eventMetaPanel(entry));
  }

  wrap.appendChild(bar);
  wrap.appendChild(body);
  return wrap;
}

async function ensureTimelineState(entry) {
  entry.timeline = await api(`/api/world/timelines/${entry.document.id}`);
}

/** 事件面板：经典编辑器管不到的那部分（精度 / 纪元 / 关联卡片）。 */
function eventMetaPanel(entry) {
  const panel = el('div', 'tl-drawer');
  panel.appendChild(el('h3', null, '事件与关联卡片'));
  if (!entry.timeline) {
    panel.appendChild(el('p', 'hint', '载入中…'));
    ensureTimelineState(entry).then(() => renderPanels());
    return panel;
  }
  const events = entry.timeline.events.slice().sort((a, b) => a.year - b.year);
  if (!events.length) {
    panel.appendChild(el('p', 'hint', '还没有事件。在左侧画布上点一下就能加一个。'));
  }
  events.forEach((event) => {
    const row = el('div', 'tl-drawer-row');
    const head = el('div', 'tl-drawer-head');
    head.appendChild(el('b', null, event.title));
    head.appendChild(el('span', 'hint', event.date_label));
    row.appendChild(head);

    const meta = el('div', 'tl-drawer-meta');
    const precision = el('select', 'mini-select');
    [['year', '年'], ['month', '月'], ['day', '日'], ['time', '时间']].forEach(([value, label]) => {
      const option = el('option', null, label);
      option.value = value;
      precision.appendChild(option);
    });
    precision.value = event.precision;
    precision.title = '事件精度';
    precision.addEventListener('change', async () => {
      await api(`/api/world/events/${event.id}`, { method: 'PUT', body: { precision: precision.value } });
      await ensureTimelineState(entry);
      renderPanels();
      toast('精度已保存（重新载入编辑器后位置会跟着变）');
    });
    meta.appendChild(precision);

    const eraSelect = el('select', 'mini-select');
    const none = el('option', null, '不指定纪元');
    none.value = '';
    eraSelect.appendChild(none);
    entry.timeline.eras.forEach((era) => {
      const option = el('option', null, era.name);
      option.value = String(era.id);
      eraSelect.appendChild(option);
    });
    eraSelect.value = event.era ? String(event.era) : '';
    eraSelect.title = '归属纪元';
    eraSelect.addEventListener('change', async () => {
      await api(`/api/world/events/${event.id}`, { method: 'PUT', body: { era: eraSelect.value || null } });
      await ensureTimelineState(entry);
    });
    meta.appendChild(eraSelect);
    row.appendChild(meta);

    const chips = el('div', 'tl-drawer-chips');
    event.linked_cards.forEach((card) => {
      const chip = el('span', 'chip');
      const open = el('button', null, card.name);
      open.addEventListener('click', () => openDoc(card.id));
      chip.appendChild(open);
      const star = el('button', null, event.featured_card === card.id ? '★' : '☆');
      star.title = '设为特色卡片';
      star.addEventListener('click', async () => {
        await api(`/api/world/events/${event.id}/cards`, {
          method: 'POST', body: { card_id: card.id, featured: true },
        });
        await ensureTimelineState(entry);
        renderPanels();
      });
      chip.appendChild(star);
      const remove = el('button', null, '✕');
      remove.addEventListener('click', async () => {
        await api(`/api/world/events/${event.id}/cards/${card.id}`, { method: 'DELETE' });
        await ensureTimelineState(entry);
        renderPanels();
      });
      chip.appendChild(remove);
      chips.appendChild(chip);
    });
    const add = el('button', 'mini-btn', '＋ 关联卡片');
    add.addEventListener('click', () => cardPicker(async (chosen) => {
      await api(`/api/world/events/${event.id}/cards`, { method: 'POST', body: { card_id: chosen.id } });
      await ensureTimelineState(entry);
      toast(`已关联「${chosen.name}」`);
      renderPanels();
    }));
    chips.appendChild(add);
    row.appendChild(chips);
    panel.appendChild(row);
  });

  const actions = el('div', 'tl-row-actions');
  actions.appendChild(button('刷新', '', async () => {
    await ensureTimelineState(entry);
    renderPanels();
  }));
  actions.appendChild(button('关闭', '', () => { entry.frameUi.panel = null; renderPanels(); }));
  panel.appendChild(actions);
  return panel;
}

/* ============================================================ 时间线工具 */
function renderTimeline(entry) {
  const wrap = el('div', 'tl-wrap');
  wrap.dataset.doc = String(entry.document.id);
  const view = { ...(entry.timeline.view || { start: 1500, end: 1900 }) };
  const calendar = entry.timeline.calendar;
  const eras = entry.timeline.eras.slice().sort((a, b) => a.position - b.position);
  const events = entry.timeline.events.slice().sort((a, b) => a.year - b.year);
  const ui = entry.tlUi || (entry.tlUi = { selected: null, panel: null, showSettings: false });
  // 深链参数：#doc=<id>&panel=calendar&event=<id>（截图与分享都用得上）
  const hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  if (hashParams.get('panel') === 'calendar') ui.showSettings = true;
  const hashEvent = Number(hashParams.get('event'));
  if (hashEvent) ui.selected = hashEvent;

  const canvas = el('div', 'tl-canvas');
  canvas.appendChild(el('div', 'tl-dots'));
  const axis = el('div', 'tl-axis');
  canvas.appendChild(axis);

  const width = () => canvas.clientWidth || 900;
  const xFor = (year) => ((year - view.start) / Math.max(1e-6, view.end - view.start)) * width();
  const yearFor = (x) => view.start + (x / width()) * (view.end - view.start);

  /* 年份刻度 */
  const span = view.end - view.start;
  const step = niceStep(span);
  const first = Math.ceil(view.start / step) * step;
  for (let year = first; year <= view.end; year += step) {
    const tick = el('div', 'tl-tick');
    tick.style.left = `${xFor(year)}px`;
    canvas.appendChild(tick);
    const label = el('div', 'tl-year', formatYear(year, calendar));
    label.style.left = `${xFor(year)}px`;
    canvas.appendChild(label);
  }

  /* 纪元色带：贴在顶部按行排列（事件胶囊从轴线往上叠，两者不再互相压住） */
  const eraStrip = el('div', 'tl-era-strip');
  eras.forEach((era) => {
    const band = el('div', 'tl-era-band');
    const rgb = ERA_COLORS[era.theme] || ERA_COLORS.blue;
    band.style.color = `rgb(${rgb.join(',')})`;
    band.style.borderColor = `rgba(${rgb.join(',')}, .45)`;
    band.style.background = 'rgba(20,20,17,.92)';
    band.style.width = `${clamp(150 + era.name.length * 7, 140, 260)}px`;
    band.appendChild(el('span', null, `纪元 · ${era.name}${era.length_years ? `（${era.length_years} 年）` : '（开放）'}`));
    band.title = era.description || '';
    eraStrip.appendChild(band);
  });
  canvas.appendChild(eraStrip);

  /* 事件：圆点 + 竖线 + 胶囊 */
  events.forEach((event) => {
    const x = xFor(event.year);
    if (x < -80 || x > width() + 80) return;
    const dot = el('div', `tl-dot${ui.selected === event.id ? ' is-selected' : ''}`);
    dot.style.left = `${x}px`;
    dot.style.top = '50.1%';
    dot.title = `${event.title} · ${event.date_label}`;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.selected = event.id;
      renderPanels();
    });
    canvas.appendChild(dot);

    const lift = 20.5 + (event.row || 0) * 30;
    const stem = el('div', 'tl-stem');
    stem.style.left = `${x}px`;
    stem.style.top = `calc(50.1% - ${lift + 24}px)`;
    stem.style.height = `${lift}px`;
    canvas.appendChild(stem);

    const pill = el('div', 'tl-pill');
    pill.style.left = `${x}px`;
    pill.style.top = `calc(50.1% - ${lift + 24}px)`;
    pill.appendChild(el('span', null, event.title));
    if (event.linked_cards.length) pill.appendChild(el('span', 'tp-card', `▤${event.linked_cards.length}`));
    pill.addEventListener('click', (e) => { e.stopPropagation(); ui.selected = event.id; renderPanels(); });
    canvas.appendChild(pill);
  });

  /* 空白处点击：把指针位置的年份作为新事件年份 */
  canvas.addEventListener('click', async (event) => {
    if (ui.suppressClick) { ui.suppressClick = false; return; }
    const rect = canvas.getBoundingClientRect();
    const year = Math.round(yearFor(event.clientX - rect.left));
    const created = await api(`/api/world/timelines/${entry.document.id}/events`, {
      method: 'POST',
      body: { title: `Year ${year} 的事件`, precision: calendar.default_precision || 'year', year },
    });
    entry.timeline.events.push(created);
    ui.selected = created.id;
    toast(`已在 Year ${year} 新建事件`);
    renderPanels();
  });

  /* 拖动平移 / 滚轮缩放 */
  let drag = null;
  canvas.addEventListener('mousedown', (event) => {
    if (event.target.classList.contains('tl-dot') || event.target.classList.contains('tl-pill')) return;
    drag = { x: event.clientX, start: view.start, end: view.end, moved: false };
    canvas.classList.add('is-panning');
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    const spanYears = drag.end - drag.start;
    const shift = -(dx / width()) * spanYears;
    view.start = drag.start + shift;
    view.end = drag.end + shift;
    renderPanels();
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    canvas.classList.remove('is-panning');
    if (moved) {
      ui.suppressClick = true;
      saveView(entry, view);
    }
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const at = yearFor(event.clientX - rect.left);
    const factor = event.deltaY > 0 ? 1.12 : 0.89;
    view.start = at - (at - view.start) * factor;
    view.end = at + (view.end - at) * factor;
    renderPanels();
    saveView(entry, view);
  }, { passive: false });

  wrap.appendChild(canvas);

  /* 底部工具条 */
  const tools = el('div', 'tl-tools');
  const addTool = (label, title, handler, active = false) => {
    const button = el('button', `tl-tool${active ? ' is-active' : ''}`, label);
    button.title = title;
    button.type = 'button';
    button.addEventListener('click', handler);
    tools.appendChild(button);
    return button;
  };
  addTool('＋', '在视野中央新建事件', async () => {
    const year = Math.round((view.start + view.end) / 2);
    const created = await api(`/api/world/timelines/${entry.document.id}/events`, {
      method: 'POST', body: { title: `Year ${year} 的事件`, year },
    });
    entry.timeline.events.push(created);
    ui.selected = created.id;
    renderPanels();
  });
  tools.appendChild(el('div', 'tl-sep'));
  addTool('🗓', '日历和范围', () => { ui.showSettings = !ui.showSettings; renderPanels(); }, ui.showSettings);
  addTool('⏳', '纪元', () => erasDialog(entry));
  addTool('▤', '关联卡片到所选事件', () => {
    const event = entry.timeline.events.find((e) => e.id === ui.selected);
    if (!event) { toast('先点一个事件'); return; }
    linkCardDialog(entry, event);
  });
  addTool('⤢', '适应数据', () => {
    const years = entry.timeline.events.map((e) => e.year);
    if (!years.length) { toast('还没有事件'); return; }
    const lo = Math.min(...years) - 20;
    const hi = Math.max(...years) + 20;
    view.start = lo; view.end = hi; saveView(entry, view); renderPanels();
  });
  wrap.appendChild(tools);

  /* 缩放控件 */
  const zoom = el('div', 'tl-zoom');
  const zoomBy = (factor) => {
    const mid = (view.start + view.end) / 2;
    const half = ((view.end - view.start) / 2) * factor;
    view.start = mid - half; view.end = mid + half;
    saveView(entry, view); renderPanels();
  };
  [['＋', () => zoomBy(0.85)], ['−', () => zoomBy(1.18)], ['⤢', () => {
    const years = entry.timeline.events.map((e) => e.year);
    if (!years.length) return;
    view.start = Math.min(...years) - 20; view.end = Math.max(...years) + 20;
    saveView(entry, view); renderPanels();
  }]].forEach(([label, handler]) => {
    const button = el('button', null, label);
    button.addEventListener('click', handler);
    zoom.appendChild(button);
  });
  wrap.appendChild(zoom);

  if (ui.showSettings) wrap.appendChild(calendarPanel(entry));

  const selected = entry.timeline.events.find((e) => e.id === ui.selected);
  if (selected) wrap.appendChild(eventCard(entry, selected, view));

  return wrap;
}

function niceStep(span) {
  const raw = span / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  return candidates.find((c) => c >= raw) || candidates[candidates.length - 1];
}

function formatYear(year, calendar) {
  if (calendar && calendar.mode === 'custom' && calendar.months && calendar.months.length) {
    return `Year ${year}`;
  }
  return String(Math.round(year));
}

async function saveView(entry, view) {
  const rounded = { view_start: Math.round(view.start * 100) / 100, view_end: Math.round(view.end * 100) / 100 };
  entry.timeline.view = { start: rounded.view_start, end: rounded.view_end };
  debounce(`view:${entry.document.id}`, () => {
    api(`/api/world/documents/${entry.document.id}`, { method: 'PUT', body: { settings: rounded } });
  }, 600);
}

/* 日历设置面板（对齐 §6.1 的 settings.* 文案） */
function calendarPanel(entry) {
  const calendar = entry.timeline.calendar;
  const panel = el('div', 'tl-panel');
  panel.appendChild(el('h3', null, '日历设置'));

  const field = (label, node) => {
    const row = el('div', 'tl-field');
    row.appendChild(el('label', null, label));
    row.appendChild(node);
    return row;
  };

  const name = el('input');
  name.value = calendar.name || '';
  panel.appendChild(field('名称', name));

  const mode = el('select');
  [['earth', '地球'], ['custom', '自定义']].forEach(([value, label]) => {
    const option = el('option', null, label);
    option.value = value;
    mode.appendChild(option);
  });
  mode.value = calendar.mode;
  panel.appendChild(field('日历', mode));

  const hours = el('input');
  hours.type = 'number';
  hours.min = '1';
  hours.max = '48';
  hours.value = calendar.hours_per_day;
  panel.appendChild(field('每天小时数', hours));

  const monthsBox = el('div');
  monthsBox.appendChild(el('h4', null, `月份（${(calendar.months || []).length} 个 · 全年 ${calendar.days_per_year} 天）`));
  (calendar.months || []).forEach((month, index) => {
    const row = el('div', 'tl-list-item');
    const monthName = el('input');
    monthName.value = month.name;
    monthName.dataset.month = String(index);
    const days = el('input');
    days.type = 'number';
    days.value = month.days;
    days.style.maxWidth = '72px';
    days.dataset.days = String(index);
    const remove = el('button', 'link-btn', '✕');
    remove.addEventListener('click', () => {
      calendar.months.splice(index, 1);
      updateCalendar(entry, { months: calendar.months });
    });
    row.appendChild(monthName);
    row.appendChild(days);
    row.appendChild(remove);
    monthsBox.appendChild(row);
  });
  const addMonth = el('button', 'tl-mini', '＋ 月份');
  addMonth.addEventListener('click', () => {
    const months = [...(calendar.months || []), { name: `Month ${(calendar.months || []).length + 1}`, days: 30 }];
    updateCalendar(entry, { months });
  });
  monthsBox.appendChild(addMonth);
  panel.appendChild(monthsBox);

  const moonsBox = el('div');
  moonsBox.appendChild(el('h4', null, `卫星（${(calendar.moons || []).length} 个）`));
  (calendar.moons || []).forEach((moon, index) => {
    const row = el('div', 'tl-list-item');
    const moonName = el('input');
    moonName.value = moon.name;
    const cycle = el('input');
    cycle.type = 'number';
    cycle.value = moon.cycle_days;
    cycle.style.maxWidth = '72px';
    cycle.title = '周期（天）';
    const shown = el('select');
    [['every', '每晚'], ['quarters', '四分之一'], ['full', '仅满月']].forEach(([value, label]) => {
      const option = el('option', null, label);
      option.value = value;
      shown.appendChild(option);
    });
    shown.value = moon.shown || 'quarters';
    const remove = el('button', 'link-btn', '✕');
    remove.addEventListener('click', () => {
      calendar.moons.splice(index, 1);
      updateCalendar(entry, { moons: calendar.moons });
    });
    [moonName, cycle, shown, remove].forEach((n) => row.appendChild(n));
    moonsBox.appendChild(row);
  });
  const addMoon = el('button', 'tl-mini', '＋ 卫星');
  addMoon.addEventListener('click', () => {
    const moons = [...(calendar.moons || []), { name: '新卫星', color: 'sky', cycle_days: 28, full_on: 14, shown: 'quarters' }];
    updateCalendar(entry, { moons });
  });
  moonsBox.appendChild(addMoon);
  panel.appendChild(moonsBox);

  panel.appendChild(el('h4', null, '事件精度'));
  const precision = el('select');
  Object.entries(PRECISION_LABEL).forEach(([value, label]) => {
    const option = el('option', null, label);
    option.value = value;
    precision.appendChild(option);
  });
  precision.value = calendar.default_precision;
  panel.appendChild(field('默认精度', precision));

  const actions = el('div', 'tl-row-actions');
  const save = el('button', 'tl-mini', '保存日历');
  save.addEventListener('click', () => {
    updateCalendar(entry, {
      name: name.value.trim() || calendar.name,
      mode: mode.value,
      hours_per_day: Number(hours.value) || 24,
      default_precision: precision.value,
    });
  });
  actions.appendChild(save);
  const preset = el('button', 'tl-mini', '存为预设');
  preset.addEventListener('click', async () => {
    const presetName = window.prompt('预设名称', `${calendar.name} 预设`);
    if (!presetName) return;
    await api(`/api/world/calendars/${calendar.id}/preset`, { method: 'POST', body: { name: presetName } });
    toast('已存为日历预设');
  });
  actions.appendChild(preset);
  const close = el('button', 'tl-mini', '关闭');
  close.addEventListener('click', () => { entry.tlUi.showSettings = false; renderPanels(); });
  actions.appendChild(close);
  panel.appendChild(actions);

  const hint = el('p', 'tl-hint', '改动会立刻写库；月份变短时，落在越界日期上的事件会被收进合法范围。');
  panel.appendChild(hint);
  return panel;
}

async function updateCalendar(entry, patch) {
  const calendar = entry.timeline.calendar;
  const payload = await api(`/api/world/calendars/${calendar.id}`, { method: 'PUT', body: patch });
  entry.timeline.calendar = payload;
  entry.timeline = await api(`/api/world/timelines/${entry.document.id}`);
  toast('日历已保存');
  renderPanels();
}

/* 事件卡片：名称 / 精度 / 年月日时 / 纪元 / 描述 / 关联卡片（§6.1 editor.*） */
function eventCard(entry, event, view) {
  const wrap = el('div', 'tl-event-card');
  const canvasWidth = $('#panels .tl-canvas') ? $('#panels .tl-canvas').clientWidth : 900;
  const x = ((event.year - view.start) / Math.max(1e-6, view.end - view.start)) * canvasWidth;
  const panelOpen = entry.tlUi && entry.tlUi.showSettings;
  wrap.style.left = panelOpen
    ? `${Math.max(8, canvasWidth - 372)}px`
    : `${clamp(x - 170, 8, Math.max(8, canvasWidth - 356))}px`;
  wrap.style.top = '16px';

  const head = el('div', 'ec-head');
  const cover = el('div', 'ec-cover', event.cover ? '' : '封面');
  if (event.cover) {
    const img = el('img');
    img.src = event.cover;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    cover.appendChild(img);
  }
  cover.addEventListener('click', async () => {
    const url = window.prompt('封面图片地址', event.cover || '');
    if (url === null) return;
    await patchEvent(entry, event, { cover: url.trim() });
  });
  head.appendChild(cover);

  const fields = el('div');
  fields.style.flex = '1 1 auto';
  fields.style.minWidth = '0';
  const title = el('input', 'ec-title');
  title.value = event.title;
  title.placeholder = '事件名称';
  title.addEventListener('blur', () => patchEvent(entry, event, { title: title.value.trim() || '未命名事件' }));
  fields.appendChild(title);

  const grid = el('div', 'ec-grid');
  const precision = el('select');
  Object.entries(PRECISION_LABEL).forEach(([value, label]) => {
    const option = el('option', null, label);
    option.value = value;
    precision.appendChild(option);
  });
  precision.value = event.precision;
  precision.addEventListener('change', () => patchEvent(entry, event, { precision: precision.value }));
  grid.appendChild(precision);

  const year = el('input');
  year.type = 'number';
  year.value = event.year;
  year.title = '年';
  year.addEventListener('blur', () => patchEvent(entry, event, { year: Number(year.value) || 0 }));
  grid.appendChild(year);

  if (['month', 'day', 'time'].includes(event.precision)) {
    const month = el('input');
    month.type = 'number';
    month.value = event.month;
    month.title = '月';
    month.addEventListener('blur', () => patchEvent(entry, event, { month: Number(month.value) || 1 }));
    grid.appendChild(month);
  }
  if (['day', 'time'].includes(event.precision)) {
    const day = el('input');
    day.type = 'number';
    day.value = event.day;
    day.title = '日';
    day.addEventListener('blur', () => patchEvent(entry, event, { day: Number(day.value) || 1 }));
    grid.appendChild(day);
  }
  if (event.precision === 'time') {
    const hour = el('input');
    hour.type = 'number';
    hour.value = event.hour;
    hour.title = '时';
    hour.addEventListener('blur', () => patchEvent(entry, event, { hour: Number(hour.value) || 0 }));
    grid.appendChild(hour);
  }
  fields.appendChild(grid);

  const era = el('select');
  const none = el('option', null, '（不指定纪元）');
  none.value = '';
  era.appendChild(none);
  entry.timeline.eras.forEach((item) => {
    const option = el('option', null, item.name);
    option.value = String(item.id);
    era.appendChild(option);
  });
  era.value = event.era ? String(event.era) : '';
  era.addEventListener('change', () => patchEvent(entry, event, { era: era.value || null }));
  fields.appendChild(era);
  head.appendChild(fields);
  wrap.appendChild(head);

  wrap.appendChild(el('div', 'hint', `显示为：${event.date_label}`));

  const desc = el('textarea');
  desc.rows = 2;
  desc.placeholder = '描述';
  desc.value = event.description || '';
  desc.addEventListener('blur', () => patchEvent(entry, event, { description: desc.value }));
  wrap.appendChild(desc);

  const linked = el('div', 'ec-linked');
  event.linked_cards.forEach((card) => {
    const chip = el('span', 'chip');
    const open = el('button', null, card.name);
    open.addEventListener('click', () => openDoc(card.id));
    chip.appendChild(open);
    const star = el('button', null, event.featured_card === card.id ? '★' : '☆');
    star.title = '设为特色卡片';
    star.addEventListener('click', async () => {
      await api(`/api/world/events/${event.id}/cards`, { method: 'POST', body: { card_id: card.id, featured: true } });
      await refreshTimeline(entry);
    });
    chip.appendChild(star);
    const remove = el('button', null, '✕');
    remove.addEventListener('click', async () => {
      await api(`/api/world/events/${event.id}/cards/${card.id}`, { method: 'DELETE' });
      await refreshTimeline(entry);
    });
    chip.appendChild(remove);
    linked.appendChild(chip);
  });
  const link = el('button', 'mini-btn', '＋ 关联卡片');
  link.addEventListener('click', () => linkCardDialog(entry, event));
  linked.appendChild(link);
  wrap.appendChild(linked);

  const actions = el('div', 'ec-actions');
  const remove = el('button', 'link-btn is-danger', '删除事件');
  remove.dataset.danger = '1';
  remove.addEventListener('click', async () => {
    if (!window.confirm(`删除「${event.title}」？`)) return;
    await api(`/api/world/events/${event.id}`, { method: 'DELETE' });
    entry.tlUi.selected = null;
    await refreshTimeline(entry);
  });
  actions.appendChild(remove);

  const rows = el('div', 'tl-row-actions');
  const up = el('button', 'tl-mini', '行 ↑');
  up.addEventListener('click', () => patchEvent(entry, event, { row: Math.max(0, (event.row || 0) - 1) }));
  const down = el('button', 'tl-mini', '行 ↓');
  down.addEventListener('click', () => patchEvent(entry, event, { row: (event.row || 0) + 1 }));
  const close = el('button', 'tl-mini', '关闭');
  close.addEventListener('click', () => { entry.tlUi.selected = null; renderPanels(); });
  rows.appendChild(up); rows.appendChild(down); rows.appendChild(close);
  actions.appendChild(rows);
  wrap.appendChild(actions);
  return wrap;
}

async function patchEvent(entry, event, patch) {
  const payload = await api(`/api/world/events/${event.id}`, { method: 'PUT', body: patch });
  Object.assign(event, payload);
  renderPanels();
}

async function refreshTimeline(entry) {
  entry.timeline = await api(`/api/world/timelines/${entry.document.id}`);
  renderPanels();
}

async function linkCardDialog(entry, event) {
  cardPicker(async (chosen) => {
    await api(`/api/world/events/${event.id}/cards`, {
      method: 'POST',
      body: { card_id: chosen.id, featured: !event.linked_cards.length },
    });
    toast(`已关联「${chosen.name}」`);
    await refreshTimeline(entry);
  });
}

/* 纪元管理（§6.1 settings.eras / eraLengthYears） */
async function erasDialog(entry) {
  const eras = await api('/api/world/eras');
  openModal('纪元', (body) => {
    const list = el('div');
    eras.eras.forEach((era) => {
      const row = el('div', 'form-row');
      const name = el('input', 'mini-input');
      name.value = era.name;
      name.addEventListener('blur', async () => {
        await api(`/api/world/eras/${era.id}`, { method: 'PUT', body: { name: name.value.trim() } });
        await reloadTree();
        if (entry) await refreshTimeline(entry);
      });
      const length = el('input', 'mini-input');
      length.type = 'number';
      length.value = era.length_years;
      length.title = '长度（年），0 表示开放';
      length.style.maxWidth = '120px';
      length.addEventListener('blur', async () => {
        await api(`/api/world/eras/${era.id}`, { method: 'PUT', body: { length_years: Number(length.value) || 0 } });
        if (entry) await refreshTimeline(entry);
      });
      const theme = el('select', 'mini-select');
      Object.keys(ERA_COLORS).forEach((key) => {
        const option = el('option', null, key);
        option.value = key;
        theme.appendChild(option);
      });
      theme.value = era.theme;
      theme.style.maxWidth = '110px';
      theme.addEventListener('change', async () => {
        await api(`/api/world/eras/${era.id}`, { method: 'PUT', body: { theme: theme.value } });
        if (entry) await refreshTimeline(entry);
      });
      const remove = el('button', 'mini-btn is-danger', '删除');
      remove.dataset.danger = '1';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`删除纪元「${era.name}」？`)) return;
        await api(`/api/world/eras/${era.id}`, { method: 'DELETE' });
        closeModal();
        await erasDialog(entry);
      });
      [name, length, theme, remove].forEach((node) => row.appendChild(node));
      list.appendChild(row);
    });
    body.appendChild(list);

    const add = el('button', 'mini-btn is-primary', '＋ 添加纪元');
    add.addEventListener('click', async () => {
      const name = window.prompt('纪元名称', '新纪元');
      if (!name) return;
      await api('/api/world/eras', { method: 'POST', body: { name } });
      closeModal();
      await erasDialog(entry);
    });
    body.appendChild(add);
    body.appendChild(el('p', 'hint', '每个纪元都从自己坐标系的 0 年起算——与官网一致。'));
  });
}

/* ============================================================ 类型管理器 */
async function typeManager(focusTypeId = null) {
  const data = await api('/api/world/types');
  const types = data.types;
  const current = { id: focusTypeId || (types[0] && types[0].id) || null };

  openModal('类型与属性', (body) => {
    const grid = el('div', 'type-grid');

    /* 左：类型树 */
    const left = el('div');
    const list = el('div', 'type-list');
    const flatten = (nodes, depth = 0) => {
      nodes.forEach((node) => {
        const row = el('div', `type-item depth-${depth}${node.id === current.id ? ' is-active' : ''}`);
        row.appendChild(el('span', null, node.icon || '▤'));
        row.appendChild(el('span', null, node.name));
        row.appendChild(el('span', 'ti-count', `${node.field_count}`));
        row.addEventListener('click', () => { current.id = node.id; closeModal(); typeManager(node.id); });
        list.appendChild(row);
        const children = types.filter((t) => t.parent === node.id);
        if (children.length) flatten(children, depth + 1);
      });
    };
    flatten(types.filter((t) => !t.parent));
    left.appendChild(list);

    const addType = el('button', 'mini-btn is-primary', '＋ 新类型');
    addType.addEventListener('click', async () => {
      const name = window.prompt('类型名称', '新类型');
      if (!name) return;
      await api('/api/world/types', { method: 'POST', body: { name } });
      closeModal();
      await typeManager();
    });
    left.appendChild(addType);

    const addSub = el('button', 'mini-btn', '＋ 子类型');
    addSub.addEventListener('click', async () => {
      if (!current.id) return;
      const name = window.prompt('子类型名称', '新子类型');
      if (!name) return;
      await api('/api/world/types', { method: 'POST', body: { name, parent: current.id } });
      closeModal();
      await typeManager(current.id);
    });
    left.appendChild(addSub);
    grid.appendChild(left);

    /* 右：属性表 */
    const right = el('div');
    const type = types.find((t) => t.id === current.id);
    if (!type) {
      right.appendChild(el('p', 'hint', '选一个类型，或者新建一个。'));
    } else {
      const nameRow = el('div', 'form-row');
      const nameInput = el('input', 'mini-input');
      nameInput.value = type.name;
      nameInput.addEventListener('blur', async () => {
        await api(`/api/world/types/${type.id}`, { method: 'PUT', body: { name: nameInput.value.trim() } });
        await reloadTree();
        toast('类型已重命名');
      });
      nameRow.appendChild(el('label', null, '类型名'));
      nameRow.appendChild(nameInput);
      const del = el('button', 'mini-btn is-danger', '删除类型');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        if (!window.confirm(`删除「${type.name}」？子类型上提，卡片保留。`)) return;
        await api(`/api/world/types/${type.id}`, { method: 'DELETE' });
        closeModal();
        await typeManager();
      });
      nameRow.appendChild(del);
      right.appendChild(nameRow);

      const table = el('table', 'prop-table');
      table.innerHTML = `<thead><tr><th>属性</th><th>值类型</th><th>必填</th><th>默认值</th><th>公式 / 选项</th><th></th></tr></thead>`;
      const tbody = el('tbody');
      type.properties.forEach((prop) => {
        const row = el('tr');
        const nameCell = el('td');
        const input = el('input', 'mini-input');
        input.value = prop.name;
        input.addEventListener('blur', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { name: input.value.trim() } });
          closeModal(); await typeManager(type.id);
        });
        nameCell.appendChild(input);
        row.appendChild(nameCell);

        const kindCell = el('td');
        const kind = el('select', 'mini-select');
        Object.entries(VT_LABEL).forEach(([value, label]) => {
          const option = el('option', null, label);
          option.value = value;
          kind.appendChild(option);
        });
        kind.value = prop.value_type;
        kind.addEventListener('change', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { value_type: kind.value } });
          closeModal(); await typeManager(type.id);
        });
        kindCell.appendChild(kind);
        row.appendChild(kindCell);

        const requiredCell = el('td');
        const required = el('input');
        required.type = 'checkbox';
        required.checked = prop.required;
        required.addEventListener('change', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { required: required.checked } });
        });
        requiredCell.appendChild(required);
        row.appendChild(requiredCell);

        const defaultCell = el('td');
        const def = el('input', 'mini-input');
        def.value = prop.default == null ? '' : prop.default;
        def.addEventListener('blur', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { default: def.value } });
        });
        defaultCell.appendChild(def);
        row.appendChild(defaultCell);

        const extraCell = el('td');
        if (prop.value_type === 'formula') {
          const formula = el('input', 'mini-input');
          formula.value = prop.formula || '';
          formula.placeholder = '@[稀有度] * @[价格]';
          formula.addEventListener('blur', async () => {
            await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { formula: formula.value } });
            toast('公式已保存');
          });
          extraCell.appendChild(formula);
        } else if (prop.value_type === 'select' || prop.value_type === 'multiselect') {
          const options = el('input', 'mini-input');
          options.value = (prop.options || []).map((o) => (typeof o === 'string' ? o : o.label)).join(', ');
          options.placeholder = '用逗号分隔选项';
          options.addEventListener('blur', async () => {
            const list_ = options.value.split(',').map((s) => s.trim()).filter(Boolean)
              .map((label) => ({ label, color: '' }));
            await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { options: list_ } });
            toast('选项已保存');
          });
          extraCell.appendChild(options);
        } else if (prop.value_type === 'reference') {
          extraCell.appendChild(el('span', 'hint', '引用本世界的卡片'));
        }
        row.appendChild(extraCell);

        const actionCell = el('td');
        const remove = el('button', 'mini-btn is-danger', '删除');
        remove.dataset.danger = '1';
        remove.addEventListener('click', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'DELETE' });
          closeModal(); await typeManager(type.id);
        });
        actionCell.appendChild(remove);
        row.appendChild(actionCell);
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      right.appendChild(table);

      const addRow = el('div', 'form-row');
      const newName = el('input', 'mini-input');
      newName.placeholder = '新属性名，例如「人口」';
      newName.style.maxWidth = '220px';
      const newKind = el('select', 'mini-select');
      Object.entries(VT_LABEL).forEach(([value, label]) => {
        const option = el('option', null, label);
        option.value = value;
        newKind.appendChild(option);
      });
      newKind.style.maxWidth = '130px';
      const add = el('button', 'mini-btn is-primary', '＋ 添加属性');
      add.addEventListener('click', async () => {
        const name = newName.value.trim();
        if (!name) { toast('先填属性名'); return; }
        await api(`/api/world/types/${type.id}/properties`, {
          method: 'POST', body: { name, value_type: newKind.value },
        });
        closeModal(); await typeManager(type.id);
      });
      [newName, newKind, add].forEach((node) => addRow.appendChild(node));
      right.appendChild(addRow);
      right.appendChild(el('p', 'hint', '公式示例：@[稀有度] * @[价格]；单选/多选属性在「公式 / 选项」列里用逗号分隔选项。'));
    }
    grid.appendChild(right);
    body.appendChild(grid);
  });
}

/* ================================================================ 关系树 */
/**
 * 对齐 familyTree：多变体（variant）、世代行、可重命名的关系、交汇点、
 * 卡片吸附（有卡就显示卡片名，没有就纯占位），节点栏里还能"新建一张卡片"。
 */
function renderTreeTool(entry) {
  const wrap = el('div', 'tree-wrap');
  const ui = entry.treeUi || (entry.treeUi = { kind: 'family', zoom: 1, offset: { x: 0, y: 0 },
                                              selected: null, labels: 'hover', mode: 'select' });

  if (!entry.tree) {
    wrap.appendChild(el('p', 'hint', '载入关系树…'));
    loadTree(entry);
    return wrap;
  }
  const state = entry.tree;
  const variant = state.active;

  /* 工具条 */
  const bar = el('div', 'tree-bar');
  const variantBox = el('div', 'variant-tabs');
  state.variants.forEach((item) => {
    const tab = el('button', `variant-tab${item.id === variant.id ? ' is-active' : ''}`,
      `${item.name}${item.node_count ? ` (${item.node_count})` : ''}`);
    tab.addEventListener('click', async () => {
      await api(`/api/world/documents/${entry.document.id}`,
        { method: 'PUT', body: { settings: { active_variant: item.id } } });
      await loadTree(entry);
    });
    variantBox.appendChild(tab);
  });
  const addVariant = el('button', 'variant-tab', '＋ 变体');
  addVariant.title = '新建变体（可选择复制当前这棵）';
  addVariant.addEventListener('click', async () => {
    const name = window.prompt('新变体名称', `Variant ${state.variants.length + 1}`);
    if (!name) return;
    const fork = window.confirm('复制当前这棵树的成员与关系？\n确定 = 复制，取消 = 建一棵空的');
    await api(`/api/world/trees/${entry.document.id}/variants`, {
      method: 'POST', body: { name, kind: variant.kind, fork_from: fork ? variant.id : null },
    });
    await loadTree(entry);
  });
  variantBox.appendChild(addVariant);
  bar.appendChild(variantBox);

  const kindSelect = el('select', 'mini-select');
  state.kinds.forEach((k) => {
    const option = el('option', null, k.label);
    option.value = k.value;
    kindSelect.appendChild(option);
  });
  kindSelect.value = variant.kind;
  kindSelect.title = '起步模板：会改掉默认的关系名';
  kindSelect.addEventListener('change', async () => {
    await api(`/api/world/tree-variants/${variant.id}`, { method: 'PUT', body: { kind: kindSelect.value } });
    await loadTree(entry);
  });
  bar.appendChild(kindSelect);

  bar.appendChild(button('＋ 成员', '添加一位成员', async () => {
    const name = window.prompt('成员名称', '新成员');
    if (!name) return;
    const maxGen = variant.nodes.reduce((acc, n) => Math.max(acc, n.generation), -1);
    const created = await api(`/api/world/tree-variants/${variant.id}/nodes`, {
      method: 'POST', body: { name, generation: maxGen + 1, x: variant.nodes.length * 24 },
    });
    ui.selected = created.id;
    await loadTree(entry);
  }));

  bar.appendChild(button(ui.mode === 'pan' ? '✋ 平移' : '☝ 选择', '选择 / 平移（V / H）', () => {
    ui.mode = ui.mode === 'pan' ? 'select' : 'pan';
    renderPanels();
  }, ui.mode === 'pan'));

  const labelMode = el('button', 'mini-btn', `关系名：${{ hover: '悬停显示', always: '总是显示', never: '隐藏' }[ui.labels]}`);
  labelMode.addEventListener('click', () => {
    ui.labels = ui.labels === 'hover' ? 'always' : ui.labels === 'always' ? 'never' : 'hover';
    renderPanels();
  });
  bar.appendChild(labelMode);

  bar.appendChild(button('＋', '放大', () => { ui.zoom = Math.min(2.4, ui.zoom * 1.15); renderPanels(); }));
  bar.appendChild(button('－', '缩小', () => { ui.zoom = Math.max(0.35, ui.zoom / 1.15); renderPanels(); }));
  bar.appendChild(button('⤢', '缩放到适应', () => {
    ui.fitted = false;
    const target = $('.tree-canvas', wrap) || document.querySelector('.tree-canvas');
    if (target) fitTree(entry, target);
  }));
  wrap.appendChild(bar);

  /* 画布 */
  const canvas = el('div', `tree-canvas${ui.mode === 'pan' ? ' is-pan' : ''}`);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'tree-svg');
  const inner = document.createElementNS(svgNS, 'g');
  inner.setAttribute('transform', `translate(${ui.offset.x} ${ui.offset.y}) scale(${ui.zoom})`);
  svg.appendChild(inner);

  /* 世代行 + 节点坐标（x 为像素，缺省按顺序排开） */
  const rows = new Map();
  variant.nodes.forEach((node, index) => {
    const gen = node.generation || 0;
    const list = rows.get(gen) || [];
    list.push(node);
    rows.set(gen, list);
    node._px = node.x || index * 190;
    node._py = gen * 150;
  });

  rows.forEach((list, gen) => {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', -4000); line.setAttribute('x2', 4000);
    line.setAttribute('y1', gen * 150 + 46); line.setAttribute('y2', gen * 150 + 46);
    line.setAttribute('stroke', 'rgba(255,255,255,.06)');
    inner.appendChild(line);
  });

  const byId = new Map(variant.nodes.map((n) => [n.id, n]));
  variant.edges.forEach((edge) => {
    const a = byId.get(edge.source); const b = byId.get(edge.target);
    if (!a || !b) return;
    const x1 = a._px + 78; const y1 = a._py + 46;
    const x2 = b._px + 78; const y2 = b._py + 46;
    const path = document.createElementNS(svgNS, 'path');
    const mid = (y1 + y2) / 2;
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', edge.kind === 'spouse' ? 'rgba(224,168,60,.75)' : 'rgba(255,255,255,.34)');
    path.setAttribute('stroke-width', '1.4');
    if (edge.style === 'dashed') path.setAttribute('stroke-dasharray', '5 4');
    path.setAttribute('class', 'tree-edge');
    path.addEventListener('click', async (event) => {
      event.stopPropagation();
      const value = window.prompt(`关系名（${edge.kind}）`, edge.display_label);
      if (value === null) return;
      await api(`/api/world/tree-edges/${edge.id}`, { method: 'PUT', body: { label: value.trim() } });
      await loadTree(entry);
    });
    inner.appendChild(path);

    const showLabel = ui.labels === 'always'
      || (ui.labels === 'hover' && false);   // hover 由 CSS class 控制
    if (showLabel || ui.labels === 'always') {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', (x1 + x2) / 2 + 6);
      text.setAttribute('y', mid + 4);
      text.setAttribute('class', 'tree-edge-label');
      text.textContent = edge.display_label;
      inner.appendChild(text);
    } else if (ui.labels === 'hover') {
      const tip = document.createElementNS(svgNS, 'title');
      tip.textContent = edge.display_label;
      path.appendChild(tip);
      path.setAttribute('class', 'tree-edge has-hover-label');
    }
  });

  variant.nodes.forEach((node) => {
    const group = document.createElementNS(svgNS, 'g');
    const selected = ui.selected === node.id;
    group.setAttribute('transform', `translate(${node._px} ${node._py})`);
    group.setAttribute('class', `tree-node${selected ? ' is-selected' : ''}`);

    const rect = document.createElementNS(svgNS, 'rect');
    if (node.image) {
      const avatar = document.createElementNS(svgNS, 'image');
      avatar.setAttribute('href', node.image);
      avatar.setAttribute('x', '10'); avatar.setAttribute('y', '14');
      avatar.setAttribute('width', '50'); avatar.setAttribute('height', '50');
      avatar.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      avatar.setAttribute('style', 'clip-path: inset(0 round 8px)');
      group.appendChild(avatar);
    }
    rect.setAttribute('width', '156'); rect.setAttribute('height', '78');
    rect.setAttribute('rx', node.junction ? '39' : '12');
    rect.setAttribute('fill', node.deceased ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.075)');
    rect.setAttribute('stroke', selected ? '#e0a83c' : (node.group_color ? colorFor(node.group_color) : 'rgba(255,255,255,.14)'));
    rect.setAttribute('stroke-width', selected ? '2' : '1');
    if (node.deceased) rect.setAttribute('stroke-dasharray', '4 3');
    group.appendChild(rect);

    if (node.card) {
      const link = document.createElementNS(svgNS, 'text');
      link.setAttribute('x', '146'); link.setAttribute('y', '14');
      link.setAttribute('class', 'tree-node-card');
      link.textContent = '▤';
      group.appendChild(link);
    }
    const textLeft = node.image ? '70' : '14';
    const name = document.createElementNS(svgNS, 'text');
    name.setAttribute('x', textLeft); name.setAttribute('y', '34');
    name.setAttribute('class', 'tree-node-name');
    const nameLimit = node.image ? 6 : 11;
    name.textContent = node.name.length > nameLimit ? `${node.name.slice(0, nameLimit - 1)}…` : node.name;
    group.appendChild(name);

    const sub = document.createElementNS(svgNS, 'text');
    sub.setAttribute('x', textLeft); sub.setAttribute('y', '56');
    sub.setAttribute('class', 'tree-node-sub');
    sub.textContent = node.subtitle || (node.card_name ? '已关联卡片' : '未关联卡片');
    group.appendChild(sub);

    group.addEventListener('click', (event) => {
      event.stopPropagation();
      ui.selected = ui.selected === node.id ? null : node.id;
      renderPanels();
    });
    group.addEventListener('dblclick', async (event) => {
      event.stopPropagation();
      const value = window.prompt('成员名称', node.name);
      if (value === null) return;
      await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { name: value.trim() } });
      await loadTree(entry);
    });
    group.addEventListener('pointerdown', (event) => {
      if (ui.mode === 'pan') return;
      event.stopPropagation();
      const rectPaper = canvas.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, px: node._px, py: node._py };
      const move = (e) => {
        node._px = start.px + (e.clientX - start.x) / ui.zoom;
        node._py = start.py + (e.clientY - start.y) / ui.zoom;
        node.x = Math.round(node._px);
        node.generation = Math.round(node._py / 150);
        const label = $(`.tree-node[data-id="${node.id}"] .tree-node-sub`, wrap);
        void label; void rectPaper;
        renderPanels();
      };
      const up = async () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        await api(`/api/world/tree-nodes/${node.id}`, {
          method: 'PUT', body: { x: node.x, generation: node.generation },
        });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    group.setAttribute('data-id', String(node.id));
    inner.appendChild(group);
  });

  canvas.appendChild(svg);

  /* 画布平移 */
  canvas.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.tree-node') || event.target.closest('.tree-edge')) return;
    if (ui.mode !== 'pan' && event.button !== 1) return;
    const start = { x: event.clientX, y: event.clientY, ...ui.offset };
    canvas.classList.add('is-grabbing');
    const move = (e) => {
      ui.offset = { x: start.x + (e.clientX - start.x), y: start.y + (e.clientY - start.y) };
      renderPanels();
    };
    const up = () => {
      canvas.classList.remove('is-grabbing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  canvas.addEventListener('click', () => { ui.selected = null; renderPanels(); });

  if (!variant.nodes.length) {
    const empty = el('div', 'tree-empty');
    empty.appendChild(el('h3', null, '这棵树还是空的'));
    empty.appendChild(el('p', 'hint', '点「＋ 成员」加第一个人，拖动可以换行换位，点两个成员之间的关系线可以改关系名。'));
    canvas.appendChild(empty);
  }
  wrap.appendChild(canvas);

  /* 节点栏（选中某人时出现） */
  const selected = byId.get(ui.selected);
  if (selected) wrap.appendChild(treeNodeBar(entry, selected));

  return wrap;
}

/** 把整棵树缩放到视野中央（只在首次打开时做一次）。 */
function fitTree(entry, canvas) {
  const ui = entry.treeUi;
  const nodes = (entry.tree && entry.tree.active.nodes) || [];
  if (!nodes.length) { ui.fitted = true; return; }
  const xs = nodes.map((n, i) => n.x || i * 190);
  const ys = nodes.map((n) => (n.generation || 0) * 150);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + 156;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + 78;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const cw = canvas.clientWidth || 900;
  const ch = canvas.clientHeight || 520;
  const scale = clamp(Math.min((cw - 90) / width, (ch - 90) / height), 0.4, 1.25);
  ui.zoom = scale;
  ui.offset = {
    x: (cw - width * scale) / 2 - minX * scale,
    y: (ch - height * scale) / 2 - minY * scale,
  };
  ui.fitted = true;
  renderPanels();
}

function treeNodeBar(entry, node) {
  const bar = el('div', 'node-bar');
  bar.appendChild(el('b', null, node.name));

  bar.appendChild(button(node.card ? '打开卡片' : '关联卡片', '把这张卡关联到这个人', async () => {
    if (node.card) { openDoc(node.card); return; }
    cardPicker(async (chosen) => {
      await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { card: chosen.id } });
      await loadTree(entry);
    });
  }));

  if (!node.card) {
    bar.appendChild(button('新建卡片', '给这个人建一张新卡片', async () => {
      const type = S.types.find((t) => !t.hidden);
      if (!type) { toast('先去「类型」里建一个类型'); return; }
      const created = await api(`/api/world/tree-nodes/${node.id}/card`, {
        method: 'POST', body: { entity_type: type.id, name: node.name },
      });
      toast(`已建卡片「${created.document.name}」`);
      await reloadTree();
      await loadTree(entry);
    }));
  } else {
    bar.appendChild(button('解除关联', '只解除关系，不删卡片', async () => {
      await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { card: null } });
      await loadTree(entry);
    }));
  }

  bar.appendChild(button(node.image ? '换图片' : '设置图片', '给这个人一张头像（粘贴图片地址）', async () => {
    const url = window.prompt('图片地址（留空则移除）', node.image || '');
    if (url === null) return;
    await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { image: url.trim() } });
    await loadTree(entry);
  }));
  bar.appendChild(button(node.deceased ? '标记在世' : '标记已故', '', async () => {
    await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { deceased: !node.deceased } });
    await loadTree(entry);
  }));
  bar.appendChild(button(node.junction ? '取消交汇点' : '设为交汇点', '交汇点画成圆角，用来表示合并的支系', async () => {
    await api(`/api/world/tree-nodes/${node.id}`, { method: 'PUT', body: { junction: !node.junction } });
    await loadTree(entry);
  }));
  bar.appendChild(button('加子女', '在下一代加一个人并自动连线', async () => {
    const name = window.prompt('新成员名称', '新成员');
    if (!name) return;
    const child = await api(`/api/world/tree-variants/${node.variant}/nodes`, {
      method: 'POST', body: { name, generation: node.generation + 1, x: node.x },
    });
    await api(`/api/world/tree-variants/${node.variant}/edges`, {
      method: 'POST', body: { source: node.id, target: child.id, kind: 'parent' },
    });
    entry.treeUi.selected = child.id;
    await loadTree(entry);
  }));
  bar.appendChild(button('加配偶', '在同一代加一个人并连成对等关系', async () => {
    const name = window.prompt('新成员名称', '新成员');
    if (!name) return;
    const spouse = await api(`/api/world/tree-variants/${node.variant}/nodes`, {
      method: 'POST', body: { name, generation: node.generation, x: node.x + 200 },
    });
    await api(`/api/world/tree-variants/${node.variant}/edges`, {
      method: 'POST', body: { source: node.id, target: spouse.id, kind: 'spouse' },
    });
    entry.treeUi.selected = spouse.id;
    await loadTree(entry);
  }));
  bar.appendChild(button('分组', '给这个人一个颜色 + 分组名', async () => {
    const group = window.prompt('分组名', node.group || '');
    if (group === null) return;
    const color = window.prompt('分组颜色（gold/sky/violet/red/teal/blue）', node.group_color || 'gold');
    await api(`/api/world/tree-nodes/${node.id}`, {
      method: 'PUT', body: { group: group.trim(), group_color: color || '' },
    });
    await loadTree(entry);
  }));
  const remove = button('删除', '从树上移除这个人', async () => {
    if (!window.confirm(`删除「${node.name}」？`)) return;
    await api(`/api/world/tree-nodes/${node.id}`, { method: 'DELETE' });
    entry.treeUi.selected = null;
    await loadTree(entry);
  });
  remove.classList.add('is-danger');
  bar.appendChild(remove);
  return bar;
}

async function loadTree(entry) {
  entry.tree = await api(`/api/world/trees/${entry.document.id}`);
  const variant = entry.tree.active;
  if (entry.treeUi && entry.treeUi.selected
      && !variant.nodes.some((n) => n.id === entry.treeUi.selected)) {
    entry.treeUi.selected = null;
  }
  renderPanels();
}

/* ============================================================== 经典地图 */
function renderMapTool(entry) {
  const wrap = el('div', 'map-wrap');
  const ui = entry.mapUi || (entry.mapUi = {
    tool: 'select', activeLayer: null, selected: null, showLabels: true,
    zoom: 1, pan: { x: 0, y: 0 }, labelMode: 'hover',
  });

  if (!entry.map) {
    wrap.appendChild(el('p', 'hint', '载入地图…'));
    loadMap(entry);
    return wrap;
  }
  const state = entry.map;
  if (ui.activeLayer === null && state.layers.length) ui.activeLayer = state.layers[0].id;

  /* 工具条 */
  const bar = el('div', 'map-bar');
  const tools = [['select', '☝ 选择'], ['pin', '📍 图钉'], ['zone', '⬠ 区域'], ['label', 'T 文字']];
  tools.forEach(([value, label]) => {
    const button = el('button', `mini-btn${ui.tool === value ? ' is-primary' : ''}`, label);
    button.title = '在画布上点击以放置';
    button.addEventListener('click', () => { ui.tool = value; ui.draft = null; renderPanels(); });
    bar.appendChild(button);
  });
  bar.appendChild(el('div', 'map-sep'));

  const layerSelect = el('select', 'mini-select');
  state.layers.forEach((layer) => {
    const option = el('option', null, `${layer.name}${layer.visible ? '' : '（隐藏）'}`);
    option.value = String(layer.id);
    layerSelect.appendChild(option);
  });
  if (ui.activeLayer) layerSelect.value = String(ui.activeLayer);
  layerSelect.title = '新标注放进哪一层';
  layerSelect.addEventListener('change', () => { ui.activeLayer = Number(layerSelect.value); renderPanels(); });
  bar.appendChild(layerSelect);

  const toggleLabels = el('button', `mini-btn${ui.showLabels ? ' is-primary' : ''}`, '显示标签');
  toggleLabels.addEventListener('click', () => { ui.showLabels = !ui.showLabels; renderPanels(); });
  bar.appendChild(toggleLabels);

  bar.appendChild(button('层次', '图层管理', () => mapLayersDialog(entry)));
  bar.appendChild(button('底图', '上传或粘贴底图', () => mapBackgroundDialog(entry)));
  bar.appendChild(el('div', 'map-sep'));
  bar.appendChild(button('＋', '放大', () => { ui.zoom = Math.min(4, ui.zoom * 1.2); renderPanels(); }));
  bar.appendChild(button('－', '缩小', () => { ui.zoom = Math.max(0.3, ui.zoom / 1.2); renderPanels(); }));
  bar.appendChild(button('⤢', '适应窗口', () => { ui.zoom = 1; ui.pan = { x: 0, y: 0 }; renderPanels(); }));
  const stats = el('span', 'map-stats', `${state.markers.length} 个标注 · ${state.layers.length} 层`);
  bar.appendChild(stats);
  wrap.appendChild(bar);

  /* 画布：一张"纸"（底图 + 标注），整体做平移缩放 */
  const canvas = el('div', `map-canvas tool-${ui.tool}`);
  const paper = el('div', 'map-paper');
  // 底图按真实宽高比铺，非 16:10 的图不会被裁掉一角（标注是百分比坐标，自动跟着走）
  const ratio = ui.imageRatio || (1280 / 800);
  const paperWidth = 1280;
  const paperHeight = Math.round(paperWidth / ratio);
  paper.style.width = `${paperWidth}px`;
  paper.style.height = `${paperHeight}px`;
  paper.style.margin = `${-paperHeight / 2}px 0 0 ${-paperWidth / 2}px`;
  if (state.background.url && !ui.imageRatio && !ui.ratioLoading) {
    ui.ratioLoading = true;
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth && probe.naturalHeight) {
        ui.imageRatio = probe.naturalWidth / probe.naturalHeight;
        renderPanels();
      }
    };
    probe.onerror = () => { ui.imageRatio = 1280 / 800; };
    probe.src = state.background.url;
  }
  paper.style.transform = `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom})`;
  if (state.background.url) {
    paper.style.backgroundImage = `url("${state.background.url}")`;
  } else {
    paper.classList.add('is-blank');
    paper.appendChild(el('div', 'map-blank-hint', '还没有底图 — 点工具条上的「底图」上传或粘贴一张'));
  }

  const visibleMarkers = state.markers.filter((marker) => {
    const layer = state.layers.find((l) => l.id === marker.layer);
    return !layer || layer.visible;
  });

  /* 区域多边形（SVG，百分比坐标自动跟着纸缩放） */
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'map-overlay');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  visibleMarkers.filter((m) => m.kind === 'zone').forEach((zone) => {
    if (!zone.points || zone.points.length < 3) return;
    const polygon = document.createElementNS(svgNS, 'polygon');
    polygon.setAttribute('points', zone.points.map((p) => `${p[0]},${p[1]}`).join(' '));
    polygon.setAttribute('fill', `rgba(${(ERA_COLORS[zone.color] || ERA_COLORS.gold).join(',')},.16)`);
    polygon.setAttribute('stroke', `rgb(${(ERA_COLORS[zone.color] || ERA_COLORS.gold).join(',')})`);
    polygon.setAttribute('stroke-width', String(0.35 / ui.zoom));
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    const layer = state.layers.find((l) => l.id === zone.layer);
    polygon.setAttribute('opacity', String(layer ? layer.opacity : 1));
    polygon.addEventListener('click', (event) => {
      event.stopPropagation();
      ui.selected = zone.id;
      renderPanels();
    });
    svg.appendChild(polygon);
  });
  if (ui.draft && ui.draft.points && ui.draft.points.length) {
    const draft = document.createElementNS(svgNS, 'polyline');
    draft.setAttribute('points', ui.draft.points.map((p) => `${p[0]},${p[1]}`).join(' '));
    draft.setAttribute('fill', 'none');
    draft.setAttribute('stroke', '#e0a83c');
    draft.setAttribute('stroke-dasharray', '1.2 1');
    draft.setAttribute('stroke-width', '0.4');
    svg.appendChild(draft);
  }
  paper.appendChild(svg);

  /* 图钉 / 文字 */
  visibleMarkers.filter((m) => m.kind !== 'zone').forEach((marker) => {
    const node = el('div', `map-marker kind-${marker.kind}${ui.selected === marker.id ? ' is-selected' : ''}`);
    node.style.left = `${marker.x}%`;
    node.style.top = `${marker.y}%`;
    const rgb = ERA_COLORS[marker.color] || ERA_COLORS.gold;
    node.style.color = `rgb(${rgb.join(',')})`;
    const layer = state.layers.find((l) => l.id === marker.layer);
    node.style.opacity = String(layer ? layer.opacity : 1);
    if (marker.kind === 'label') {
      node.style.fontSize = `${13 * (marker.scale || 1)}px`;
      node.style.transform = `translate(-50%,-50%) rotate(${marker.rotation || 0}deg)`;
      node.appendChild(el('span', 'mm-text', marker.name));
    } else {
      const pin = el('span', 'mm-pin');
      if (marker.card_name) pin.appendChild(el('span', 'mm-thumb', (marker.card_name || '?').charAt(0)));
      else pin.appendChild(el('span', 'mm-dot'));
      node.appendChild(pin);
      if (ui.showLabels && marker.name) node.appendChild(el('span', 'mm-chip', marker.name));
    }
    node.title = marker.name || '';
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      ui.selected = marker.id;
      renderPanels();
    });
    node.addEventListener('pointerdown', (event) => {
      if (ui.tool !== 'select') return;
      event.stopPropagation();
      const rect = paper.getBoundingClientRect();
      const move = (e) => {
        marker.x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
        marker.y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
        node.style.left = `${marker.x}%`;
        node.style.top = `${marker.y}%`;
      };
      const up = async () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        await api(`/api/world/map-markers/${marker.id}`, {
          method: 'PUT', body: { x: Math.round(marker.x * 100) / 100, y: Math.round(marker.y * 100) / 100 },
        });
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    paper.appendChild(node);
  });

  /* 放置标注 / 绘制区域 */
  paper.addEventListener('click', async (event) => {
    if (event.target.closest('.map-marker') || ui.tool === 'select') return;
    const rect = paper.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    if (ui.tool === 'zone') {
      ui.draft = ui.draft || { points: [] };
      ui.draft.points.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      renderPanels();
      return;
    }
    const name = window.prompt(ui.tool === 'pin' ? '图钉名称' : '文字内容',
      ui.tool === 'pin' ? '新地点' : '区域名');
    if (!name) return;
    const created = await api(`/api/world/maps/${entry.document.id}/markers`, {
      method: 'POST',
      body: { kind: ui.tool, name, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
              layer: ui.activeLayer },
    });
    ui.selected = created.id;
    await loadMap(entry);
  });
  paper.addEventListener('dblclick', async () => {
    if (ui.tool !== 'zone' || !ui.draft || ui.draft.points.length < 3) return;
    const name = window.prompt('区域名称', '新区域');
    if (!name) { ui.draft = null; renderPanels(); return; }
    await api(`/api/world/maps/${entry.document.id}/markers`, {
      method: 'POST',
      body: { kind: 'zone', name, points: ui.draft.points, layer: ui.activeLayer },
    });
    ui.draft = null;
    await loadMap(entry);
  });

  /* 平移 / 滚轮缩放 */
  paper.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.map-marker') || ui.tool !== 'select') return;
    const start = { x: event.clientX, y: event.clientY, ...ui.pan };
    canvas.classList.add('is-grabbing');
    const move = (e) => {
      ui.pan = { x: start.x + (e.clientX - start.x), y: start.y + (e.clientY - start.y) };
      paper.style.transform = `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom})`;
    };
    const up = () => {
      canvas.classList.remove('is-grabbing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    ui.zoom = clamp(ui.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.3, 4);
    paper.style.transform = `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom})`;
  }, { passive: false });

  /* 右键菜单：对齐截图里的 Pin / Zone / Text 三行 */
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const rect = paper.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    const create = (kind, label) => async () => {
      const name = window.prompt(label, kind === 'label' ? '文字' : '新地点');
      if (!name) return;
      await api(`/api/world/maps/${entry.document.id}/markers`, {
        method: 'POST',
        body: { kind, name, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
                layer: ui.activeLayer },
      });
      await loadMap(entry);
    };
    openCtx(event.clientX, event.clientY, [
      { label: '📍 在此放置图钉', run: create('pin', '图钉名称') },
      { label: '⬠ 从此开始画区域', run: async () => {
        ui.tool = 'zone';
        ui.draft = { points: [[Math.round(x * 100) / 100, Math.round(y * 100) / 100]] };
        renderPanels();
        toast('继续点击加点，双击结束');
      } },
      { label: 'T 在此添加文字', run: create('label', '文字内容') },
      '-',
      { label: '图层管理…', run: () => mapLayersDialog(entry) },
      { label: '设置底图…', run: () => mapBackgroundDialog(entry) },
    ]);
  });

  canvas.appendChild(paper);
  wrap.appendChild(canvas);

  const selected = state.markers.find((m) => m.id === ui.selected);
  if (selected) wrap.appendChild(mapMarkerBar(entry, selected, state));
  return wrap;
}

function mapMarkerBar(entry, marker, state) {
  const bar = el('div', 'node-bar map-node-bar');
  bar.appendChild(el('b', null, `${marker.kind === 'zone' ? '区域' : marker.kind === 'label' ? '文字' : '图钉'}：${marker.name || '未命名'}`));

  bar.appendChild(button('改名', '', async () => {
    const name = window.prompt('名称', marker.name);
    if (name === null) return;
    await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { name: name.trim() } });
    await loadMap(entry);
  }));

  if (marker.kind === 'pin') {
    bar.appendChild(button(marker.card ? '打开卡片' : '关联卡片', '', async () => {
      if (marker.card) { openDoc(marker.card); return; }
      cardPicker(async (chosen) => {
        await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { card: chosen.id } });
        await loadMap(entry);
      });
    }));
    if (marker.card) {
      bar.appendChild(button('解除关联', '', async () => {
        await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { card: null } });
        await loadMap(entry);
      }));
    }
  }

  const colors = el('div', 'color-row');
  (state.colors || []).forEach((key) => {
    const swatch = el('button', `swatch-btn${marker.color === key ? ' is-active' : ''}`);
    const rgb = ERA_COLORS[key] || ERA_COLORS.gold;
    swatch.style.background = `rgb(${rgb.join(',')})`;
    swatch.title = key;
    swatch.addEventListener('click', async () => {
      await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { color: key } });
      await loadMap(entry);
    });
    colors.appendChild(swatch);
  });
  bar.appendChild(colors);

  if (marker.kind === 'label') {
    bar.appendChild(button('更大', '', async () => {
      await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { scale: (marker.scale || 1) * 1.15 } });
      await loadMap(entry);
    }));
    bar.appendChild(button('更小', '', async () => {
      await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { scale: Math.max(0.4, (marker.scale || 1) / 1.15) } });
      await loadMap(entry);
    }));
  }

  const layerSelect = el('select', 'mini-select');
  state.layers.forEach((layer) => {
    const option = el('option', null, layer.name);
    option.value = String(layer.id);
    layerSelect.appendChild(option);
  });
  layerSelect.value = String(marker.layer || (state.layers[0] && state.layers[0].id));
  layerSelect.addEventListener('change', async () => {
    await api(`/api/world/map-markers/${marker.id}`, { method: 'PUT', body: { layer: Number(layerSelect.value) } });
    await loadMap(entry);
  });
  bar.appendChild(layerSelect);

  const remove = button('删除', '', async () => {
    await api(`/api/world/map-markers/${marker.id}`, { method: 'DELETE' });
    entry.mapUi.selected = null;
    await loadMap(entry);
  });
  remove.classList.add('is-danger');
  bar.appendChild(remove);
  return bar;
}

async function loadMap(entry) {
  entry.map = await api(`/api/world/maps/${entry.document.id}`);
  renderPanels();
}

function mapLayersDialog(entry) {
  const state = entry.map;
  openModal('图层', (body) => {
    const list = el('div');
    state.layers.forEach((layer) => {
      const row = el('div', 'form-row');
      const name = el('input', 'mini-input');
      name.value = layer.name;
      name.addEventListener('blur', async () => {
        await api(`/api/world/map-layers/${layer.id}`, { method: 'PUT', body: { name: name.value.trim() } });
        await loadMap(entry);
      });
      row.appendChild(name);

      const visible = el('button', `mini-btn${layer.visible ? ' is-primary' : ''}`, layer.visible ? '显示中' : '已隐藏');
      visible.addEventListener('click', async () => {
        await api(`/api/world/map-layers/${layer.id}`, { method: 'PUT', body: { visible: !layer.visible } });
        closeModal();
        await loadMap(entry);
        mapLayersDialog(entry);
      });
      row.appendChild(visible);

      const opacity = el('input');
      opacity.type = 'range'; opacity.min = '0.1'; opacity.max = '1'; opacity.step = '0.05';
      opacity.value = String(layer.opacity);
      opacity.addEventListener('change', async () => {
        await api(`/api/world/map-layers/${layer.id}`, { method: 'PUT', body: { opacity: Number(opacity.value) } });
        await loadMap(entry);
      });
      row.appendChild(opacity);

      const remove = el('button', 'mini-btn is-danger', '删除');
      remove.dataset.danger = '1';
      remove.addEventListener('click', async () => {
        await api(`/api/world/map-layers/${layer.id}`, { method: 'DELETE' });
        closeModal();
        await loadMap(entry);
      });
      row.appendChild(remove);
      list.appendChild(row);
    });
    body.appendChild(list);

    const add = el('button', 'mini-btn is-primary', '＋ 新图层');
    add.addEventListener('click', async () => {
      const name = window.prompt('图层名称', `图层 ${state.layers.length + 1}`);
      if (!name) return;
      await api(`/api/world/maps/${entry.document.id}/layers`, { method: 'POST', body: { name } });
      closeModal();
      await loadMap(entry);
    });
    body.appendChild(add);
  });
}

function mapBackgroundDialog(entry) {
  openModal('底图', (body) => {
    const url = el('input', 'mini-input');
    url.placeholder = '粘贴图片地址（https://…）';
    url.value = (entry.map.background && entry.map.background.url) || '';
    body.appendChild(url);

    const row = el('div', 'form-row');
    const apply = el('button', 'mini-btn is-primary', '使用这个地址');
    apply.addEventListener('click', async () => {
      await api(`/api/world/maps/${entry.document.id}/background`, { method: 'POST', body: { url: url.value.trim() } });
      closeModal();
      await loadMap(entry);
    });
    row.appendChild(apply);

    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.addEventListener('change', async () => {
      if (!file.files || !file.files[0]) return;
      const form = new FormData();
      form.append('file', file.files[0]);
      const response = await fetch(`/api/world/maps/${entry.document.id}/background`, { method: 'POST', body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        toast(payload.error || '上传失败', 2600);
        return;
      }
      closeModal();
      toast('底图已更新');
      await loadMap(entry);
    });
    row.appendChild(file);
    body.appendChild(row);

    const clear = el('button', 'mini-btn', '移除底图');
    clear.addEventListener('click', async () => {
      await api(`/api/world/maps/${entry.document.id}/background`, { method: 'POST', body: { clear: true } });
      closeModal();
      await loadMap(entry);
    });
    body.appendChild(clear);
    body.appendChild(el('p', 'hint', '上传上限 25 MB，支持 PNG / JPEG / WebP / GIF / AVIF；也可以直接粘贴外链。'));
  });
}

/* ============================================================== 世界图谱 */
function layoutGraph(nodes, links, width, height) {
  const pos = new Map();
  const radius = Math.min(width, height) * 0.34;
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    pos.set(node.id, {
      x: width / 2 + Math.cos(angle) * radius * (0.6 + (index % 3) * 0.18),
      y: height / 2 + Math.sin(angle) * radius * (0.6 + (index % 3) * 0.18),
      vx: 0, vy: 0,
    });
  });

  const ticks = nodes.length > 90 ? 90 : 200;
  for (let tick = 0; tick < ticks; tick += 1) {
    const alpha = 1 - tick / ticks;
    // 斥力（节点不多时直接 O(n²)，够用）
    for (let i = 0; i < nodes.length; i += 1) {
      const a = pos.get(nodes[i].id);
      for (let k = i + 1; k < nodes.length; k += 1) {
        const b = pos.get(nodes[k].id);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); dist2 = 1; }
        const force = (2600 * alpha) / dist2;
        const dist = Math.sqrt(dist2);
        a.vx += (dx / dist) * force; a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force; b.vy -= (dy / dist) * force;
      }
    }
    // 弹簧
    links.forEach((link) => {
      const a = pos.get(link.source);
      const b = pos.get(link.target);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const force = (dist - 120) * 0.012 * alpha;
      a.vx += (dx / dist) * force; a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force; b.vy -= (dy / dist) * force;
    });
    // 向心 + 阻尼
    pos.forEach((p) => {
      p.vx += (width / 2 - p.x) * 0.0022 * alpha;
      p.vy += (height / 2 - p.y) * 0.0022 * alpha;
      p.x += clamp(p.vx, -22, 22);
      p.y += clamp(p.vy, -22, 22);
      p.vx *= 0.72; p.vy *= 0.72;
      const pad = 42;
      p.x = clamp(p.x, pad, width - pad);
      p.y = clamp(p.y, pad, height - pad);
    });
  }
  return pos;
}

function renderGraph(entry) {
  const wrap = el('div', 'graph-wrap');
  const ui = entry.graphUi || (entry.graphUi = {
    query: '', hideIsolated: false, showLabels: true, nodeScale: 1, linkOpacity: 0.5,
    center: null, data: null, pins: new Set((entry.document.settings || {}).pins || []),
  });

  const controls = el('div', 'graph-controls');
  const search = el('input');
  search.type = 'search';
  search.placeholder = '搜索节点';
  search.value = ui.query;
  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ui.query = search.value; loadGraph(entry, wrap); }, 200);
  });
  controls.appendChild(search);

  const toggle = (label, key, title) => {
    const button = el('button', `mini-btn${ui[key] ? ' is-primary' : ''}`, label);
    button.title = title || '';
    button.addEventListener('click', () => { ui[key] = !ui[key]; renderPanels(); });
    controls.appendChild(button);
  };
  toggle('隐藏孤立', 'hideIsolated', 'Hide unconnected');
  toggle('显示标签', 'showLabels');

  const sizeLabel = el('label', 'graph-slider');
  sizeLabel.appendChild(el('span', null, '节点大小'));
  const size = el('input');
  size.type = 'range'; size.min = '0.6'; size.max = '1.8'; size.step = '0.1'; size.value = String(ui.nodeScale);
  size.addEventListener('input', () => { ui.nodeScale = Number(size.value); renderPanels(); });
  sizeLabel.appendChild(size);
  controls.appendChild(sizeLabel);

  const opacityLabel = el('label', 'graph-slider');
  opacityLabel.appendChild(el('span', null, '连线透明度'));
  const opacity = el('input');
  opacity.type = 'range'; opacity.min = '0.15'; opacity.max = '1'; opacity.step = '0.05'; opacity.value = String(ui.linkOpacity);
  opacity.addEventListener('input', () => { ui.linkOpacity = Number(opacity.value); renderPanels(); });
  opacityLabel.appendChild(opacity);
  controls.appendChild(opacityLabel);

  if (ui.pins.size) {
    const clearPins = el('button', 'mini-btn', `清除钉住（${ui.pins.size}）`);
    clearPins.addEventListener('click', async () => {
      ui.pins.clear();
      await saveGraphPins(entry, ui);
      renderPanels();
    });
    controls.appendChild(clearPins);
  }
  if (ui.center) {
    const back = el('button', 'mini-btn is-primary', '返回全图');
    back.addEventListener('click', () => { ui.center = null; renderPanels(); });
    controls.appendChild(back);
  }
  const stats = el('span', 'graph-stats', ui.data
    ? `显示 ${ui.data.stats.documents} / ${ui.data.stats.total_documents} 份文档 · ${ui.data.stats.links} 条连线`
    : '载入中…');
  controls.appendChild(stats);
  wrap.appendChild(controls);

  const canvas = el('div', 'graph-canvas');
  wrap.appendChild(canvas);

  if (!ui.data) {
    canvas.appendChild(el('p', 'hint', '载入图谱…'));
    loadGraph(entry, wrap);
    return wrap;
  }
  if (!ui.data.nodes.length) {
    const empty = el('div', 'graph-empty');
    empty.appendChild(el('h3', null, '还没有可连的东西'));
    empty.appendChild(el('p', 'hint', '建几张卡片，用「引用」属性或正文提及把它们连起来，图就长出来了。'));
    canvas.appendChild(empty);
    return wrap;
  }

  const width = canvas.clientWidth || 900;
  const height = Math.max(420, canvas.clientHeight || 560);
  // 上限跟后端 world/graph.py 的 MAX_NODES 对齐；截断了就在界面上说明白
  const GRAPH_LIMIT = 400;
  const truncated = ui.data.nodes.length > GRAPH_LIMIT;
  const nodes = ui.data.nodes.slice(0, GRAPH_LIMIT);
  const alive = new Set(nodes.map((n) => n.id));
  const links = ui.data.links.filter((l) => alive.has(l.source) && alive.has(l.target));
  const pos = layoutGraph(nodes, links, width, height);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'graph-svg');

  const linkLayer = document.createElementNS(svgNS, 'g');
  links.forEach((link) => {
    const a = pos.get(link.source); const b = pos.get(link.target);
    if (!a || !b) return;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', link.kind === 'reference' ? 'rgba(224,168,60,.85)'
      : link.kind === 'event' ? 'rgba(120,170,255,.7)' : 'rgba(255,255,255,.5)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', link.kind === 'mention' ? '3 4' : '');
    line.setAttribute('opacity', String(ui.linkOpacity));
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${link.kind === 'reference' ? '引用' : link.kind === 'event' ? '时间线关联' : '正文提及'}：${link.label}`;
    line.appendChild(title);
    linkLayer.appendChild(line);
  });
  svg.appendChild(linkLayer);

  const nodeLayer = document.createElementNS(svgNS, 'g');
  nodes.forEach((node) => {
    const p = pos.get(node.id);
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('class', 'graph-node');
    group.setAttribute('transform', `translate(${p.x} ${p.y})`);
    const radius = (5 + Math.sqrt(node.degree) * 2.6) * ui.nodeScale;

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', node.entity_type_name ? colorForType(node) : 'rgba(255,255,255,.55)');
    circle.setAttribute('stroke', ui.pins.has(node.id) ? '#e0a83c' : 'rgba(0,0,0,.6)');
    circle.setAttribute('stroke-width', ui.pins.has(node.id) ? '2' : '1');
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${node.name}（${node.entity_type_name || node.type}）· ${node.degree} 条连线`;
    circle.appendChild(title);
    group.appendChild(circle);

    if (ui.showLabels) {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('y', String(radius + 12));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'graph-label');
      label.textContent = node.name.length > 14 ? `${node.name.slice(0, 13)}…` : node.name;
      group.appendChild(label);
    }

    group.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey) {
        if (ui.pins.has(node.id)) ui.pins.delete(node.id); else ui.pins.add(node.id);
        saveGraphPins(entry, ui);
        renderPanels();
        return;
      }
      openDoc(node.id);
    });
    group.addEventListener('dblclick', () => { ui.center = node.id; renderPanels(); });

    group.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const start = { x: event.clientX, y: event.clientY, px: p.x, py: p.y };
      const move = (e) => {
        p.x = clamp(start.px + (e.clientX - start.x), 30, width - 30);
        p.y = clamp(start.py + (e.clientY - start.y), 30, height - 30);
        group.setAttribute('transform', `translate(${p.x} ${p.y})`);
        linkLayer.childNodes.forEach((line, index) => {
          const link = links[index];
          if (!link) return;
          const a = pos.get(link.source); const b = pos.get(link.target);
          if (!a || !b) return;
          line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
          line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        });
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    nodeLayer.appendChild(group);
  });
  svg.appendChild(nodeLayer);
  canvas.appendChild(svg);

  if (ui.data.isolated_suggestions && ui.data.isolated_suggestions.length && !ui.query) {
    const tip = el('div', 'graph-tip');
    tip.appendChild(el('b', null, '还没连起来的卡片：'));
    tip.appendChild(el('span', null, ui.data.isolated_suggestions.map((n) => n.name).join('、')));
    canvas.appendChild(tip);
  }
  return wrap;
}

function colorForType(node) {
  const type = S.types.find((t) => t.id === node.entity_type);
  const palette = { gold: '#e0a83c', teal: '#1ab079', violet: '#5251c1', blue: '#626980', red: '#ec3a3a', sky: '#3475f3' };
  if (type && palette[type.color]) return palette[type.color];
  return 'rgba(236,232,225,.72)';
}

async function loadGraph(entry, wrap) {
  const ui = entry.graphUi;
  const params = new URLSearchParams();
  if (ui.query) params.set('q', ui.query);
  if (ui.hideIsolated) params.set('hide_isolated', '1');
  if (ui.center) params.set('center', String(ui.center));
  const data = await api(`/api/world/graph?${params.toString()}`);
  ui.data = data;
  renderPanels();
}

async function saveGraphPins(entry, ui) {
  const settings = { ...(entry.document.settings || {}), pins: Array.from(ui.pins) };
  entry.document.settings = settings;
  await api(`/api/world/documents/${entry.document.id}`, { method: 'PUT', body: { settings } });
}

/* ============================================================ 分享 / 发布 */
async function publishDialog() {
  const data = await api('/api/world/publish');
  const summary = data.publish;
  const audiences = data.audiences;

  openModal('分享与发布', (body) => {
    const state = el('div', 'publish-state');
    state.appendChild(el('b', null, summary.published ? `已发布 · v${summary.version}` : '未发布'));
    if (summary.published) {
      const url = `${location.origin}${summary.url}`;
      const link = el('a', null, url);
      link.href = summary.url;
      link.target = '_blank';
      link.rel = 'noopener';
      state.appendChild(link);
      const copy = el('button', 'mini-btn', '复制链接');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast('链接已复制'); }
        catch (e) { window.prompt('手动复制：', url); }
      });
      state.appendChild(copy);
    }
    body.appendChild(state);

    if (summary.published) {
      const counts = summary.counts || {};
      const line = el('p', 'hint',
        `已上线 ${counts.live || 0} · 有改动未发布 ${counts.stale || 0} · 尚未上线 ${counts.pending || 0} · 已排除 ${counts.excluded || 0}`);
      body.appendChild(line);
    }

    const row = (label, node) => {
      const wrap = el('div', 'form-row');
      wrap.appendChild(el('label', null, label));
      wrap.appendChild(node);
      return wrap;
    };

    const audience = el('select', 'mini-select');
    audiences.forEach((item) => {
      const option = el('option', null, item.label);
      option.value = item.value;
      audience.appendChild(option);
    });
    audience.value = summary.audience;
    body.appendChild(row('访问范围', audience));

    const password = el('input', 'mini-input');
    password.type = 'text';
    password.placeholder = summary.has_password ? '已设置密码（留空则不改）' : '需要密码时填写';
    body.appendChild(row('访问密码', password));

    const actions = el('div', 'form-row');
    const publishButton = el('button', 'mini-btn is-primary', summary.published ? '重新发布' : '发布');
    publishButton.addEventListener('click', async () => {
      const payload = { audience: audience.value };
      if (password.value.trim()) payload.password = password.value.trim();
      const result = await api('/api/world/publish', { method: 'POST', body: payload });
      toast(`已发布 v${result.version}`);
      closeModal();
      await reloadTree();
      renderPanels();
      publishDialog();
    });
    actions.appendChild(publishButton);

    if (summary.published) {
      const offline = el('button', 'mini-btn', '下线站点');
      offline.addEventListener('click', async () => {
        if (!window.confirm('下线后站点立刻 404，内容与版本号保留。')) return;
        await api('/api/world/unpublish', { method: 'POST' });
        toast('已下线');
        closeModal();
        await reloadTree();
        renderPanels();
      });
      actions.appendChild(offline);
    }
    body.appendChild(actions);

    body.appendChild(el('p', 'hint',
      '状态含义：已发布 = 与当前版本一致；有改动未发布 = 这张卡在发布后被改过；尚未上线 = 站点发布后才新建的卡；已排除 = 在维基中隐藏。'));

    const list = el('div', 'publish-list');
    S.panels[0].tabs.forEach((id) => {
      const entry = S.docs.get(id);
      if (!entry) return;
      const line = el('div', 'publish-row');
      line.appendChild(el('span', null, entry.document.name));
      const chip = el('span', 'badge state-chip', PUBLISH_LABEL[entry.document.publish_state] || entry.document.publish_state);
      chip.dataset.state = entry.document.publish_state;
      line.appendChild(chip);
      list.appendChild(line);
    });
    if (list.children.length) {
      body.appendChild(el('h4', 'hint', '当前打开的文档'));
      body.appendChild(list);
    }
  });
}

/* ================================================================= 模态框 */
function openModal(title, build) {
  $('#mdTitle').textContent = title;
  const body = $('#mdBody');
  body.innerHTML = '';
  build(body);
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

/* ============================================================ 命令面板 */
function openPalette(seed = '') {
  const box = $('#palette');
  box.hidden = false;
  const input = $('#plInput');
  input.value = seed;
  input.focus();
  runPalette('');
}

async function runPalette(query) {
  const list = $('#plList');
  list.innerHTML = '';
  const actions = [
    { kind: '动作', name: '新建卡片', run: async () => { await createDoc('card'); } },
    { kind: '动作', name: '新建时间线', run: async () => { await createDoc('timeline'); } },
    { kind: '动作', name: '新建文件夹', run: async () => { await createDoc('folder'); } },
    { kind: '动作', name: '新建世界图谱', run: async () => { await createDoc('graph'); } },
    { kind: '动作', name: '用新渲染器打开时间线（对比用）', run: async () => {
      const doc = activeDocument();
      if (!doc || doc.type !== 'timeline') { toast('先打开一条时间线'); return; }
      location.hash = `doc=${doc.id}&tl=new`;
      S.docs.delete(doc.id);
      await openDoc(doc.id);
    } },
    { kind: '动作', name: '新建关系树', run: async () => { await createDoc('familyTree'); } },
    { kind: '动作', name: '新建地图', run: async () => { await createDoc('map'); } },
    { kind: '动作', name: '分享与发布', run: () => publishDialog() },
    { kind: '动作', name: '类型与属性', run: () => typeManager() },
    { kind: '动作', name: '纪元', run: () => erasDialog(S.docs.get(activeIdOfTimeline())) },
    { kind: '动作', name: '回收站', run: () => showTrash() },
    { kind: '动作', name: '用模板新建（角色 / 地点 / 事件）', run: () => guidedTemplatesDialog() },
    { kind: '动作', name: '导入 / 导出…', run: () => exchangeDialog() },
    { kind: '动作', name: '看看值得添加什么', run: () => suggestionsDialog() },
    { kind: '动作', name: '撤销历史…', run: () => undoHistoryDialog() },
    { kind: '动作', name: '版本历史…', run: () => versionHistoryDialog() },
    { kind: '动作', name: '协作者与邀请…', run: () => collaboratorsDialog() },
    { kind: '动作', name: '账号…', run: () => userMenu() },
    { kind: '动作', name: '快捷键一览', run: () => shortcutsDialog() },
  ];
  const items = actions.filter((a) => !query || a.name.includes(query));

  let results = [];
  if (query.trim()) {
    const data = await api(`/api/world/search?q=${encodeURIComponent(query.trim())}`);
    results = data.results;
  }

  const render = (entries) => {
    list.innerHTML = '';
    entries.forEach((entry, index) => {
      const row = el('div', `pl-item${index === 0 ? ' is-active' : ''}`);
      row.appendChild(el('span', 'pi-kind', entry.kind));
      row.appendChild(el('span', null, entry.name));
      if (entry.snippet) row.appendChild(el('span', 'pi-snippet', entry.snippet));
      row.addEventListener('click', async () => { closePalette(); await entry.run(); });
      list.appendChild(row);
    });
  };

  const entries = [
    ...items.map((a) => ({ kind: a.kind, name: a.name, run: a.run })),
    ...results.map((r) => ({
      kind: DOC_LABEL[r.type] || r.type,
      name: r.name,
      snippet: r.snippet,
      run: () => openDoc(r.id),
    })),
  ];
  render(entries);
  runPalette._entries = entries;
}

function activeIdOfTimeline() {
  const doc = activeDocument();
  return doc && doc.type === 'timeline' ? doc.id : null;
}

function closePalette() { $('#palette').hidden = true; }

/* ============================================================ 右键菜单 */
function openCtx(x, y, entries) {
  const menu = $('#ctxMenu');
  menu.innerHTML = '';
  entries.forEach((entry) => {
    if (entry === '-') { menu.appendChild(document.createElement('hr')); return; }
    const button = el('button', entry.danger ? 'is-danger' : null, entry.label);
    button.addEventListener('click', async () => {
      menu.hidden = true;
      await entry.run();
    });
    menu.appendChild(button);
  });
  menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
  menu.hidden = false;
}

function docContextMenu(event, node) {
  const entries = [
    { label: '重命名', run: async () => {
      const name = window.prompt('新名称', node.name);
      if (!name) return;
      await api(`/api/world/documents/${node.id}`, { method: 'PUT', body: { name } });
      await reloadTree(); renderPanels();
    } },
    { label: '复制', run: async () => {
      await api(`/api/world/documents/${node.id}/duplicate`, { method: 'POST' });
      toast('已复制'); await reloadTree();
    } },
    { label: node.pinned ? '取消置顶' : '置顶', run: async () => {
      await api(`/api/world/documents/${node.id}`, { method: 'PUT', body: { pinned: !node.pinned } });
      await reloadTree();
    } },
    { label: node.hidden ? '在维基中显示' : '在维基中隐藏', run: async () => {
      await api(`/api/world/documents/${node.id}`, { method: 'PUT', body: { hidden: !node.hidden } });
      await reloadTree(); renderPanels();
    } },
    '-',
    { label: '设置纪元…', run: () => setEraDialog(node) },
    { label: '版本历史…', run: () => versionHistoryDialog(node.id) },
    '-',
    { label: '移到回收站', danger: true, run: async () => {
      await api(`/api/world/documents/${node.id}`, { method: 'DELETE' });
      S.docs.delete(node.id);
      S.panels.forEach((panel) => {
        panel.tabs = panel.tabs.filter((id) => id !== node.id);
        panel.active = clamp(panel.active, -1, panel.tabs.length - 1);
      });
      toast('已移到回收站'); await reloadTree(); renderPanels();
    } },
  ];
  openCtx(event.clientX, event.clientY, entries);
}

async function setEraDialog(node) {
  const data = await api('/api/world/eras');
  if (!data.eras.length) { toast('还没有纪元，先在顶栏「纪元」里建一个'); return; }
  const answer = window.prompt(
    `归属纪元（输入编号，0 = 无）：\n${data.eras.map((e, i) => `${i + 1}. ${e.name}`).join('\n')}`,
    node.era ? String(data.eras.findIndex((e) => e.id === node.era) + 1) : '0',
  );
  if (answer === null) return;
  const index = Number(answer) - 1;
  await api(`/api/world/documents/${node.id}`, {
    method: 'PUT', body: { era: index >= 0 ? data.eras[index].id : null },
  });
  toast('已更新纪元');
  await reloadTree();
}

/* ============================================================ 新建 / 回收站 */
async function createDoc(type, parent = null) {
  const name = window.prompt(type === 'folder' ? '文件夹名称' : '文档名称',
    type === 'timeline' ? '世界时间线' : type === 'folder' ? '新文件夹' : '未命名');
  if (name === null) return;
  const body = { type, name: name.trim() || '未命名' };
  if (parent) body.parent = parent;
  if (type === 'card') {
    const type_ = S.types.find((t) => !t.hidden) || S.types[0];
    if (type_) body.entity_type = type_.id;
  }
  const created = await api('/api/world/documents', { method: 'POST', body });
  await reloadTree();
  await openDoc(created.id);
  toast(`已新建「${created.name}」`);
}

async function showTrash() {
  const data = await api('/api/world/trash');
  openModal('回收站', (body) => {
    if (!data.count) {
      body.appendChild(emptyBlock({
        iconName: 'trash-2',
        title: '回收站是空的',
        text: '删除文档会先放到这里，随时能恢复；彻底删除才不可逆。',
      }));
      return;
    }
    body.appendChild(el('p', 'hint', `${data.count} 份文档在回收站里，恢复后会回到原来的位置（父文件夹也被删了就放回顶层）。`));
    const list = el('div', 'trash-list');
    data.documents.forEach((doc) => {
      const row = el('div', 'trash-row');
      const info = el('div', 'trash-info');
      info.appendChild(el('b', null, doc.name));
      info.appendChild(el('span', 'hint', `${DOC_LABEL[doc.type] || doc.type}${doc.entity_type ? '' : ''}`));
      row.appendChild(info);

      const restore = el('button', 'mini-btn is-primary', '恢复');
      restore.addEventListener('click', async () => {
        await api(`/api/world/documents/${doc.id}/restore`, { method: 'POST' });
        toast(`已恢复「${doc.name}」`);
        await reloadTree();
        closeModal();
        await showTrash();
      });
      row.appendChild(restore);

      const purge = el('button', 'mini-btn is-danger', '彻底删除');
      purge.dataset.danger = '1';
      purge.addEventListener('click', async () => {
        if (!window.confirm(`彻底删除「${doc.name}」？这一步不可撤销。`)) return;
        await api(`/api/world/documents/${doc.id}?hard=1`, { method: 'DELETE' });
        toast('已彻底删除');
        closeModal();
        await showTrash();
      });
      row.appendChild(purge);
      list.appendChild(row);
    });
    body.appendChild(list);
    const actions = el('div', 'form-row');
    actions.appendChild(button('关闭', '', closeModal));
    body.appendChild(actions);
  });
}

/* ====================================================== 名字自动识别（§4.2） */
async function highlightMentions(root) {
  if (!root || !S.world.auto_link_enabled) return;
  const texts = $$('.block-text', root);
  if (!texts.length) return;
  const joined = texts.map((node) => node.textContent).join('\n');
  if (!joined.trim()) return;
  const docId = Number(root.dataset.doc);
  const data = await api('/api/world/autolink', { method: 'POST', body: { text: joined, exclude: docId } });
  if (!data.matches.length) return;

  const names = Array.from(new Set(data.matches.map((m) => m.matched)));
  const pattern = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const idFor = new Map(data.matches.map((m) => [m.matched, m.document_id]));

  // 用户正在编辑 / 选中的块绝对不要动：重写 innerHTML 会把选区连同光标一起吞掉
  const activeSelection = window.getSelection();
  const anchorNode = activeSelection && activeSelection.rangeCount ? activeSelection.anchorNode : null;
  texts.forEach((node) => {
    if (node.dataset.linked === '1') return;
    if (/<[a-z][\s\S]*>/i.test(node.innerHTML)) return;   // 富文本区块不重写（会把格式抹掉）
    if (anchorNode && node.contains(anchorNode)) return;   // 正在这里打字 / 选字
    const html = esc(node.textContent).replace(pattern, (match) => (
      `<span class="mentions-inline" data-target="${idFor.get(match) || ''}">${match}</span>`
    ));
    node.innerHTML = html;
    node.dataset.linked = '1';
  });

  $$('.mentions-inline', root).forEach((span) => {
    span.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = Number(span.dataset.target);
      if (target) openDoc(target);
    });
  });
}

/* ================================================================ 事件绑定 */
/** 给顶栏、侧栏的文字按钮配上 Minimal 图标（只在启动时做一次）。 */
function decorateChrome() {
  [['#sidebarBtn', 'grip', '收起或展开侧栏'], ['#undoBtn', 'arrow-left', '撤销'],
   ['#redoBtn', 'arrow-right', '重做']].forEach(([selector, name, label]) => {
    const node = $(selector);
    if (!node) return;
    node.classList.add('is-icon');
    node.innerHTML = '';
    node.appendChild(icon(name, 15));
    node.setAttribute('aria-label', label);
  });
  const buttons = [
    ['#paletteBtn', 'search', '⌘K'],
    ['#suggestBtn', 'star', '建议'],
    ['#exchangeBtn', 'box', '导入导出'],
    ['#typesBtn', 'tag', '类型'],
    ['#erasBtn', 'globe', '纪元'],
    ['#themeBtn', 'droplet', '主题'],
    ['#trashBtn', 'trash-2', '回收站'],
    ['#newDocBtn', 'circle-plus', '新建文档'],
    ['#newFolderBtn', 'folder', '文件夹'],
    ['#templateBtn', 'star', '用模板新建'],
  ];
  buttons.forEach(([selector, name, label]) => {
    const node = $(selector);
    if (!node) return;
    node.innerHTML = '';
    node.appendChild(icon(name, 15));
    node.appendChild(el('span', null, label));
  });
  const nav = { world: 'globe', wiki: 'book', 'new-timeline': 'align', 'new-card': 'file' };
  $$('#tbNav .tb-view').forEach((button) => {
    const name = nav[button.dataset.nav];
    if (!name) return;
    const label = button.textContent;
    button.innerHTML = '';
    button.appendChild(icon(name, 15));
    button.appendChild(el('span', null, label));
  });
}

function bindEvents() {
  $('#worldChip').addEventListener('click', () => worldDialog());
  const ehArt = $('#ehArt');
  if (ehArt) ehArt.appendChild(icon('book', 40));
  const wire = (selector, handler) => {
    const node = $(selector);
    if (node) node.addEventListener('click', handler);
  };
  wire('#ehGuide', () => guidedTemplatesDialog());
  wire('#templateBtn', () => guidedTemplatesDialog());
  wire('#ehCard', async () => {
    const type = S.types.find((t) => !t.hidden) || S.types[0];
    const created = await api('/api/world/documents', {
      method: 'POST', body: { type: 'card', name: '未命名卡片', entity_type: type ? type.id : null },
    });
    await reloadTree();
    openDoc(created.id);
  });
  wire('#ehTimeline', async () => {
    const created = await api('/api/world/documents', { method: 'POST', body: { type: 'timeline', name: '新时间线' } });
    await reloadTree();
    openDoc(created.id);
  });
  wire('#ehImport', () => exchangeDialog());
  $('#userChip').addEventListener('click', () => userMenu());
  // 手机底部导航
  $$('.bottom-nav button').forEach((node) => {
    node.addEventListener('click', () => {
      const action = node.dataset.mobile;
      $$('.bottom-nav button').forEach((other) => other.classList.toggle('is-on', other === node));
      if (action === 'world') { closeSidebarDrawer(); toggleSidebar(); }
      else if (action === 'search') openPalette('');
      else if (action === 'new') guidedTemplatesDialog();
      else if (action === 'suggest') suggestionsDialog();
      else if (action === 'user') userMenu();
    });
  });

  // 手机上从屏幕左缘往右滑 = 拉出侧栏（触屏没有 ⌘B）
  let edgeSwipe = null;
  document.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (!touch || window.innerWidth >= 900) return;
    if (touch.clientX > 28) return;
    if (event.target.closest('.canvas-stage, .tl-list, .picker, .palette')) return;
    edgeSwipe = { x: touch.clientX, y: touch.clientY, moved: false };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!edgeSwipe) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - edgeSwipe.x;
    const dy = Math.abs(touch.clientY - edgeSwipe.y);
    if (dy > 60 && !edgeSwipe.moved) { edgeSwipe = null; return; }
    if (dx > 40) { edgeSwipe.moved = true; openSidebarDrawer(); }
  }, { passive: true });
  document.addEventListener('touchend', () => { edgeSwipe = null; }, { passive: true });

  // 长按 = 右键菜单（触屏没有右键）
  let longPress = null;
  document.addEventListener('touchstart', (event) => {
    const row = event.target.closest('.row, .folder-row, .block');
    if (!row) return;
    const touch = event.touches[0];
    longPress = setTimeout(() => {
      if (row.classList.contains('row')) {
        const node = findNode(Number(row.dataset.id));
        if (node) docContextMenu({ preventDefault() {}, clientX: touch.clientX, clientY: touch.clientY }, node);
      } else if (row.classList.contains('block')) {
        const handle = $('.block-handle', row);
        if (handle) openBlockMenu(handle, S.docs.get(Number(row.closest('[data-doc]').dataset.doc)),
                                  Number(row.dataset.index));
      }
      longPress = null;
    }, 550);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((type) => {
    document.addEventListener(type, () => { if (longPress) { clearTimeout(longPress); longPress = null; } }, { passive: true });
  });
  // 顶栏的纪元 chip：切换"世界的版本"（登录/只读都看得到）
  const eraSlot = $('#eraChipSlot');
  if (eraSlot) { eraSlot.innerHTML = ''; eraSlot.appendChild(eraChip()); }
  $('#suggestBtn').addEventListener('click', () => suggestionsDialog());
  $('#exchangeBtn').addEventListener('click', () => exchangeDialog());
  $('#sidebarBtn').addEventListener('click', () => toggleSidebar());
  $('#undoBtn').addEventListener('click', () => undoLast());
  $('#undoBtn').addEventListener('contextmenu', (event) => { event.preventDefault(); undoHistoryDialog(); });
  $('#redoBtn').addEventListener('click', () => redoLast());
  $('#paletteBtn').addEventListener('click', () => openPalette(''));
  $('#typesBtn').addEventListener('click', () => typeManager());
  $('#erasBtn').addEventListener('click', () => erasDialog(S.docs.get(activeIdOfTimeline())));
  $('#themeBtn').addEventListener('click', themeDialog);
  $('#trashBtn').addEventListener('click', showTrash);
  $('#mdClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });
  $('#palette').addEventListener('click', (event) => { if (event.target.id === 'palette') closePalette(); });

  $('#newDocBtn').addEventListener('click', () => createDoc('card'));
  $('#newFolderBtn').addEventListener('click', () => createDoc('folder'));
  $('#sbMenu').addEventListener('click', () => {
    const folders = [];
    const collect = (nodes) => nodes.forEach((n) => { if ((n.children || []).length) { folders.push(n.id); collect(n.children); } });
    collect(S.tree);
    const allCollapsed = folders.every((id) => S.collapsed.has(id));
    S.collapsed = new Set(allCollapsed ? [] : folders);
    renderTree();
  });
  let searchTimer = null;
  $('#sbSearch').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => { S.filter = value; renderTree(); }, 160);
  });

  $('#tbNav').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    const nav = button.dataset.nav;
    $$('#tbNav .tb-view').forEach((node) => node.classList.toggle('is-active', node === button));
    if (nav === 'new-timeline') await createDoc('timeline');
    else if (nav === 'new-card') await createDoc('card');
    else if (nav === 'world') { /* 世界视图：保持文档树 */ }
    else if (nav === 'wiki') {
      await publishDialog();
    }
  });

  $('#plInput').addEventListener('input', (event) => runPalette(event.target.value));
  $('#plInput').addEventListener('keydown', async (event) => {
    const items = $$('#plList .pl-item');
    const active = items.findIndex((node) => node.classList.contains('is-active'));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = clamp(active + (event.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
      items.forEach((node, index) => node.classList.toggle('is-active', index === next));
      if (items[next]) items[next].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = (runPalette._entries || [])[active < 0 ? 0 : active];
      closePalette();
      if (entry) await entry.run();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#ctxMenu')) $('#ctxMenu').hidden = true;
    const mention = event.target.closest('[data-target]');
    if (mention) {
      event.preventDefault();
      const target = Number(mention.dataset.target);
      if (target) openDoc(target);
    }
  });
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.row')) event.preventDefault();
  });

  /* 侧栏空白处右键：在根级新建 */
  $('#sbTree').addEventListener('contextmenu', (event) => {
    if (event.target.closest('.row')) return;
    event.preventDefault();
    openCtx(event.clientX, event.clientY, [
      { label: '新建卡片', run: () => createDoc('card') },
      { label: '新建时间线', run: () => createDoc('timeline') },
      { label: '新建文件夹', run: () => createDoc('folder') },
    ]);
  });

  document.addEventListener('keydown', (event) => {
    // 快捷键走 S.keymap（可以在「快捷键设置」里改）
    const mod = event.metaKey || event.ctrlKey;
    if (matchesShortcut(event, 'undo')) {
      event.preventDefault();
      if (event.shiftKey) redoLast(); else undoLast();
      return;
    }
    if (matchesShortcut(event, 'redo') || (mod && event.key.toLowerCase() === 'y')) {
      event.preventDefault(); redoLast(); return;
    }
    if (matchesShortcut(event, 'reopen')) {
      event.preventDefault();
      const id = (S.closedTabs || []).pop();
      if (id) openDoc(id); else toast('没有刚关掉的标签');
      return;
    }
    if (matchesShortcut(event, 'version')) { event.preventDefault(); versionHistoryDialog(); return; }
    if (matchesShortcut(event, 'suggest')) { event.preventDefault(); suggestionsDialog(); return; }
    if (mod && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      const panel = S.panels[0];
      const id = panel.tabs[Number(event.key) - 1];
      if (id) { event.preventDefault(); panel.active = Number(event.key) - 1; openDoc(id); }
      return;
    }
    if (matchesShortcut(event, 'sidebar')) { event.preventDefault(); toggleSidebar(); return; }
    if (matchesShortcut(event, 'shortcuts')) { event.preventDefault(); shortcutsDialog(); return; }
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPalette('');
      return;
    }
    if (event.key === 'Escape') {
      closePalette();
      closeModal();
      $('#ctxMenu').hidden = true;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      toast('全部改动都是即时保存的');
    }
    if (meta && event.key === '\\') {
      event.preventDefault();
      S.panels.push({ tabs: [], active: -1 });
      renderPanels();
    }
  });
}


/* ==========================================================================
   工具类文档：表格 / 看板 / 画布 / 词典 / 待办 / 骰子 / 雷达 / 环境音 / 语音 / 章节 / 嵌入
   --------------------------------------------------------------------------
   它们共用两个后端入口：
     GET/PUT /api/world/documents/<id>/data   —— settings.data 里的工具数据
     POST    /api/world/documents/<id>/media  —— 文件（语音、图片）
   表格是例外：它双向绑定卡片属性，走后端专用接口。
   ========================================================================== */
function toolShell(entry, { iconName, title, hint, actions = [] }) {
  const document_ = entry.document;
  const wrap = el('div', 'tool-view');
  wrap.dataset.doc = String(document_.id);
  const head = el('div', 'tool-head');
  const titleBox = el('div', 'tool-title');
  const art = el('span', 'tool-art');
  art.appendChild(icon(iconName, 18));
  titleBox.appendChild(art);
  const nameNode = el('h1', 'tool-name', document_.name);
  if (editable()) {
    nameNode.contentEditable = 'true';
    nameNode.addEventListener('blur', async () => {
      const value = nameNode.textContent.trim() || '未命名';
      if (value === document_.name) return;
      await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { name: value } });
      document_.name = value;
      await reloadTree();
      renderPanels();
    });
  }
  titleBox.appendChild(nameNode);
  head.appendChild(titleBox);
  const bar = el('div', 'tool-actions');
  actions.forEach((node) => bar.appendChild(node));
  head.appendChild(bar);
  wrap.appendChild(head);
  if (hint) wrap.appendChild(el('p', 'tool-hint', hint));
  return wrap;
}

async function loadToolData(entry) {
  const data = await api(`/api/world/documents/${entry.document.id}/data`);
  entry.toolData = data.data || {};
  entry.toolMedia = data.media || [];
  return entry.toolData;
}

async function saveToolData(entry, data, options = {}) {
  entry.toolData = data;
  const payload = await api(`/api/world/documents/${entry.document.id}/data`, {
    method: 'PUT', body: { data },
  });
  if (!options.silent) toast(options.label || '已保存');
  return payload.data;
}

const toolId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/* ---------------------------------------------------------------- 表格 */
function renderTableTool(entry) {
  const wrap = toolShell(entry, {
    iconName: 'grip',
    title: '表格',
    hint: '每一行就是一张真卡片，每一列是它的一个属性。改单元格 = 改那张卡，别处也会跟着变。',
  });
  const state = entry.tableState || (entry.tableState = {});
  const body = el('div', 'table-tool');
  wrap.appendChild(body);

  const csvButton = button('导出 CSV', '下载当前视图', () => {
    download(`/api/world/tables/${entry.document.id}/csv`);
  });
  const importInput = el('input');
  importInput.type = 'file';
  importInput.accept = '.csv,text/csv';
  importInput.style.display = 'none';
  importInput.addEventListener('change', async () => {
    const file = (importInput.files || [])[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    const result = await api(`/api/world/tables/${entry.document.id}/csv`, { method: 'POST', form });
    toast(`CSV 导入：新增 ${result.created} 行，更新 ${result.updated} 行`);
    renderPanels();
  });
  wrap.appendChild(importInput);
  wrap.querySelector('.tool-actions').appendChild(csvButton);
  wrap.querySelector('.tool-actions').appendChild(button('导入 CSV', '按"名称"匹配已有行', () => importInput.click()));

  const load = async () => {
    const data = await api(`/api/world/tables/${entry.document.id}`);
    state.data = data;
    body.innerHTML = '';

    const typeSelect = el('select', 'mini-select');
    (data.available_types || []).forEach((type) => {
      const option = el('option', null, type.name);
      option.value = type.id;
      typeSelect.appendChild(option);
    });
    if (data.entity_type) typeSelect.value = data.entity_type.id;
    typeSelect.addEventListener('change', async () => {
      await api(`/api/world/tables/${entry.document.id}`, { method: 'PUT', body: { entity_type: Number(typeSelect.value) } });
      renderPanels();
    });

    const toolbar = el('div', 'table-toolbar');
    toolbar.appendChild(el('span', 'hint', '卡片类型'));
    toolbar.appendChild(typeSelect);
    const addRow = button('＋ 加一行', '新建一张卡片并放进来', async () => {
      await api(`/api/world/tables/${entry.document.id}/rows`, { method: 'POST', body: { name: '新行' } });
      await reloadTree();
      renderPanels();
    }, true);
    toolbar.appendChild(addRow);
    toolbar.appendChild(el('span', 'hint', `${data.rows.length} 行 · ${data.columns.length} 列`));
    body.appendChild(toolbar);

    if (!data.columns.length) {
      body.appendChild(emptyBlock({
        iconName: 'tag', title: '这个类型还没有属性',
        text: '表格的列来自卡片类型的属性。先去「类型」里给它加几个属性（比如 年龄、阵营）。',
        actionLabel: '打开类型与属性', onAction: () => typeManager(),
      }));
      return;
    }

    const table = el('table', 'prop-table table-grid');
    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', null, '名称'));
    data.columns.forEach((column) => {
      const th = el('th');
      th.appendChild(el('span', null, column.name));
      th.appendChild(el('span', 'hint', VT_LABEL[column.value_type] || column.value_type));
      headRow.appendChild(th);
    });
    headRow.appendChild(el('th', null, ''));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    data.rows.forEach((row) => {
      const tr = el('tr');
      const nameCell = el('td');
      const nameInput = el('input', 'mini-input');
      nameInput.value = row.name;
      nameInput.addEventListener('blur', async () => {
        if (nameInput.value.trim() === row.name) return;
        await api(`/api/world/tables/${entry.document.id}/cell`, {
          method: 'PUT', body: { row: row.id, name: nameInput.value.trim() },
        });
        await reloadTree();
      });
      nameCell.appendChild(nameInput);
      tr.appendChild(nameCell);

      data.columns.forEach((column) => {
        const cell = el('td');
        const raw = row.values[String(column.id)];
        const save = async (value) => {
          await api(`/api/world/tables/${entry.document.id}/cell`, {
            method: 'PUT', body: { row: row.id, column: column.id, value },
          });
        };
        if (column.value_type === 'number' || column.value_type === 'formula') {
          const input = el('input', 'mini-input');
          input.type = 'number';
          input.value = raw === null || raw === undefined ? '' : raw;
          input.addEventListener('change', () => save(input.value === '' ? '' : Number(input.value)));
          cell.appendChild(input);
        } else if (column.options && column.options.length) {
          const select = el('select', 'mini-select');
          const blank = el('option', null, '—');
          blank.value = '';
          select.appendChild(blank);
          column.options.forEach((option) => {
            const node = el('option', null, option);
            node.value = option;
            select.appendChild(node);
          });
          select.value = raw || '';
          select.addEventListener('change', () => save(select.value));
          cell.appendChild(select);
        } else if (column.value_type === 'select' || column.value_type === 'multiselect') {
          const input = el('input', 'mini-input');
          input.value = Array.isArray(raw) ? raw.join('、') : (raw || '');
          input.placeholder = column.value_type === 'multiselect' ? '用逗号分隔' : '';
          input.addEventListener('change', () => save(column.value_type === 'multiselect'
            ? input.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
            : input.value));
          cell.appendChild(input);
        } else {
          const input = el('input', 'mini-input');
          input.value = raw === null || raw === undefined ? '' : String(raw);
          input.addEventListener('change', () => save(input.value));
          cell.appendChild(input);
        }
        tr.appendChild(cell);
      });

      const actions = el('td', 'table-row-actions');
      const open = el('button', 'mini-btn is-small', '打开');
      open.addEventListener('click', () => openDoc(row.id));
      actions.appendChild(open);
      const remove = el('button', 'mini-btn is-small is-danger', '删');
      remove.dataset.danger = '1';
      remove.title = '把这一行移出表格（卡片进回收站）';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`删除「${row.name}」这张卡片？会进回收站。`)) return;
        await api(`/api/world/tables/${entry.document.id}/rows`, { method: 'DELETE', body: { row: row.id } });
        await reloadTree();
        renderPanels();
      });
      actions.appendChild(remove);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const scroller = el('div', 'table-scroll');
    scroller.appendChild(table);
    body.appendChild(scroller);
    if (!data.rows.length) {
      body.appendChild(el('p', 'hint', '还没有行。点「＋ 加一行」开始，或者导入一份 CSV。'));
    }
  };
  load();
  return wrap;
}

/* ---------------------------------------------------------------- 看板 */
function renderBoardTool(entry) {
  const wrap = toolShell(entry, { iconName: 'grip', title: '看板', hint: '列 + 卡片，拖到别的列就算改状态。' });
  const board = el('div', 'board');
  wrap.appendChild(board);
  wrap.querySelector('.tool-actions').appendChild(button('＋ 加一列', '', async () => {
    const name = window.prompt('这一列叫什么？', '新列');
    if (!name) return;
    const data = entry.toolData || { columns: [] };
    data.columns = data.columns || [];
    data.columns.push({ id: toolId('col'), name, items: [] });
    await saveToolData(entry, data, { label: '已加列' });
    renderPanels();
  }, true));

  const paint = () => {
    const data = entry.toolData || { columns: [] };
    board.innerHTML = '';
    (data.columns || []).forEach((column, columnIndex) => {
      const box = el('div', 'board-col');
      const head = el('div', 'board-col-head');
      const nameNode = el('b', null, column.name);
      nameNode.contentEditable = editable() ? 'true' : 'false';
      nameNode.addEventListener('blur', async () => {
        column.name = nameNode.textContent.trim() || column.name;
        await saveToolData(entry, data, { silent: true });
      });
      head.appendChild(nameNode);
      head.appendChild(el('span', 'hint', String((column.items || []).length)));
      const del = el('button', 'mini-btn is-small is-danger', '删');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        if (!window.confirm(`删掉「${column.name}」这一列？卡不会删。`)) return;
        data.columns.splice(columnIndex, 1);
        await saveToolData(entry, data, { label: '已删列' });
        renderPanels();
      });
      head.appendChild(del);
      box.appendChild(head);

      const list = el('div', 'board-list');
      (column.items || []).forEach((item, itemIndex) => {
        const card = el('div', 'board-card');
        card.draggable = editable();
        const title = el('span', 'bc-title', item.title || '未命名');
        if (item.document) {
          title.classList.add('is-link');
          title.addEventListener('click', () => openDoc(item.document));
          title.title = '打开这张卡片';
        }
        card.appendChild(title);
        const del2 = el('button', 'bc-del', '✕');
        del2.title = '从这一列移走';
        del2.addEventListener('click', async () => {
          column.items.splice(itemIndex, 1);
          await saveToolData(entry, data, { silent: true });
          paint();
        });
        card.appendChild(del2);
        card.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', JSON.stringify({ columnIndex, itemIndex }));
        });
        list.appendChild(card);
      });
      list.addEventListener('dragover', (event) => event.preventDefault());
      list.addEventListener('drop', async (event) => {
        event.preventDefault();
        try {
          const { columnIndex: fromColumn, itemIndex } = JSON.parse(event.dataTransfer.getData('text/plain'));
          if (fromColumn === columnIndex) return;
          const [moved] = data.columns[fromColumn].items.splice(itemIndex, 1);
          data.columns[columnIndex].items.push(moved);
          await saveToolData(entry, data, { label: '已移动卡片' });
          paint();
        } catch (error) { /* 拖的不是卡片 */ }
      });
      box.appendChild(list);

      const add = el('button', 'board-add', '＋ 加一张');
      add.addEventListener('click', async () => {
        const title = window.prompt('卡片内容？（会同时建一张真卡片）', '');
        if (title === null) return;
        let documentId = null;
        if (title.trim()) {
          const created = await api('/api/world/documents', {
            method: 'POST', body: { type: 'card', name: title.trim() },
          });
          documentId = created.id;
          await reloadTree();
        }
        column.items = column.items || [];
        column.items.push({ id: toolId('it'), title: title.trim() || '未命名', document: documentId });
        await saveToolData(entry, data, { label: '已加卡片' });
        paint();
      });
      list.appendChild(add);
      board.appendChild(box);
    });
    if (!(data.columns || []).length) {
      board.appendChild(emptyBlock({
        iconName: 'grip', title: '还没有列',
        text: '看板适合推进度：待办 / 进行中 / 完成，或者按人物、按地点分组。',
        actionLabel: '＋ 加一列', onAction: async () => {
          const data2 = entry.toolData || {};
          data2.columns = [{ id: toolId('col'), name: '待办', items: [] }];
          await saveToolData(entry, data2);
          renderPanels();
        },
      }));
    }
  };

  loadToolData(entry).then(paint);
  return wrap;
}

/* ---------------------------------------------------------------- 画布 */
function renderCanvasTool(entry) {
  const wrap = toolShell(entry, { iconName: 'pen-line', title: '画布', hint: '自由摆放的便签与文字：拖动移动，双击改字。' });
  const stage = el('div', 'canvas-stage');
  wrap.appendChild(stage);
  wrap.querySelector('.tool-actions').appendChild(button('＋ 便签', '', async () => {
    const data = entry.toolData || { items: [] };
    data.items = data.items || [];
    data.items.push({ id: toolId('n'), type: 'note', x: 40 + data.items.length * 24, y: 40 + data.items.length * 18, w: 180, h: 120, text: '新便签', color: 'gold' });
    await saveToolData(entry, data, { label: '已加便签' });
    renderPanels();
  }, true));

  const paint = () => {
    const data = entry.toolData || { items: [] };
    stage.innerHTML = '';
    (data.items || []).forEach((item, index) => {
      const node = el('div', `canvas-item is-${item.type || 'note'} color-${item.color || 'gold'}`);
      node.style.left = `${item.x || 0}px`;
      node.style.top = `${item.y || 0}px`;
      node.style.width = `${item.w || 180}px`;
      node.style.height = `${item.h || 120}px`;
      const text = el('div', 'ci-text', item.text || '');
      if (editable()) {
        text.contentEditable = 'true';
        text.addEventListener('blur', async () => {
          item.text = text.textContent;
          await saveToolData(entry, data, { silent: true });
        });
      }
      node.appendChild(text);
      const del = el('button', 'ci-del', '✕');
      del.title = '删掉这个便签';
      del.addEventListener('click', async () => {
        data.items.splice(index, 1);
        await saveToolData(entry, data, { silent: true });
        paint();
      });
      node.appendChild(del);
      let drag = null;
      node.addEventListener('pointerdown', (event) => {
        if (!editable() || event.target === del || event.target.isContentEditable) return;
        drag = { x: event.clientX - (item.x || 0), y: event.clientY - (item.y || 0) };
        node.setPointerCapture(event.pointerId);
        node.classList.add('is-dragging');
      });
      node.addEventListener('pointermove', (event) => {
        if (!drag) return;
        item.x = Math.max(0, event.clientX - drag.x);
        item.y = Math.max(0, event.clientY - drag.y);
        node.style.left = `${item.x}px`;
        node.style.top = `${item.y}px`;
      });
      node.addEventListener('pointerup', async () => {
        if (!drag) return;
        drag = null;
        node.classList.remove('is-dragging');
        await saveToolData(entry, data, { silent: true });
      });
      stage.appendChild(node);
    });
    if (!(data.items || []).length) {
      stage.appendChild(emptyBlock({
        iconName: 'pen-line', title: '空画布',
        text: '放几个便签，把线索、关系、待定的事摊开来看。',
        actionLabel: '＋ 便签', onAction: async () => {
          const data2 = entry.toolData || {};
          data2.items = [{ id: toolId('n'), type: 'note', x: 60, y: 60, w: 180, h: 120, text: '新便签', color: 'sky' }];
          await saveToolData(entry, data2);
          renderPanels();
        },
      }));
    }
  };
  loadToolData(entry).then(paint);
  return wrap;
}

/* ---------------------------------------------------------------- 通用清单（词典 / 待办 / 章节 / 嵌入） */
function renderListTool(entry, spec) {
  const wrap = toolShell(entry, { iconName: spec.icon, title: spec.title, hint: spec.hint });
  const list = el('div', 'list-tool');
  wrap.appendChild(list);
  const addButton = button(`＋ 新建${spec.itemName}`, '', async () => {
    const data = entry.toolData || {};
    data.items = data.items || [];
    data.items.unshift(spec.blank());
    await saveToolData(entry, data, { label: `已新建${spec.itemName}` });
    renderPanels();
  }, true);
  wrap.querySelector('.tool-actions').appendChild(addButton);

  const search = el('input', 'mini-input list-search');
  search.placeholder = `搜索${spec.itemName}…`;
  wrap.insertBefore(search, list);

  const paint = () => {
    const data = entry.toolData || {};
    const keyword = search.value.trim().toLowerCase();
    const items = (data.items || []).filter((item) => !keyword
      || spec.searchText(item).toLowerCase().includes(keyword));
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(emptyBlock({
        iconName: spec.icon,
        title: keyword ? `没有匹配「${search.value}」的${spec.itemName}` : `还没有${spec.itemName}`,
        text: spec.emptyText,
        actionLabel: `＋ 新建${spec.itemName}`, onAction: () => addButton.click(),
      }));
      return;
    }
    items.forEach((item) => {
      const row = el('div', `list-row${item.done ? ' is-done' : ''}`);
      const index = data.items.indexOf(item);
      if (spec.toggle) {
        const box = el('input');
        box.type = 'checkbox';
        box.checked = Boolean(item.done);
        box.addEventListener('change', async () => {
          item.done = box.checked;
          await saveToolData(entry, data, { silent: true });
          paint();
        });
        row.appendChild(box);
      }
      spec.fields.forEach((field) => {
        const value = field.render
          ? field.render(item, data, { save: () => saveToolData(entry, data, { silent: true }), paint })
          : (() => {
              const node = el(field.multiline ? 'textarea' : 'input', field.multiline ? 'list-input is-area' : `list-input ${field.cls || ''}`);
              node.value = item[field.key] || '';
              node.placeholder = field.placeholder || field.label;
              if (field.multiline) node.rows = 3;
              if (editable()) {
                node.addEventListener('change', async () => {
                  item[field.key] = node.value;
                  await saveToolData(entry, data, { silent: true });
                  if (field.repaint) paint();
                });
              } else {
                node.disabled = true;
              }
              return node;
            })();
        const box = el('div', `list-field ${field.wide ? 'is-wide' : ''}`);
        box.appendChild(value);
        row.appendChild(box);
      });
      const actions = el('div', 'list-actions');
      (spec.actions || []).forEach((action) => {
        const node = el('button', 'mini-btn is-small', action.label);
        node.addEventListener('click', () => action.run(item, data, { renderPanels }));
        actions.appendChild(node);
      });
      const del = el('button', 'mini-btn is-small is-danger', '删除');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        data.items.splice(index, 1);
        await saveToolData(entry, data, { label: '已删除' });
        paint();
      });
      actions.appendChild(del);
      row.appendChild(actions);
      list.appendChild(row);
    });
  };
  search.addEventListener('input', paint);
  loadToolData(entry).then(paint);
  return wrap;
}

const renderDictionaryTool = (entry) => renderListTool(entry, {
  icon: 'book', title: '词典', itemName: '词条',
  hint: '造语词条：词形、读音、词性、释义。可以按词形或释义搜索。',
  emptyText: '给你的语言建第一批词：人名、地名、日常用语都行。',
  searchText: (item) => `${item.word || ''} ${item.meaning || ''} ${item.notes || ''}`,
  fields: [
    { key: 'word', label: '词形', placeholder: '词形', cls: 'is-narrow' },
    { key: 'ipa', label: '读音', placeholder: '/iˈsar.ra/', cls: 'is-narrow' },
    { key: 'pos', label: '词性', placeholder: '名词 / 动词…', cls: 'is-narrow' },
    { key: 'meaning', label: '释义', placeholder: '释义' },
    { key: 'notes', label: '备注', placeholder: '词源、用法…', wide: true, multiline: true },
  ],
  blank: () => ({ id: toolId('w'), word: '', ipa: '', pos: '', meaning: '', notes: '' }),
});

const renderTodoTool = (entry) => renderListTool(entry, {
  icon: 'circle-check', title: '待办清单', itemName: '待办',
  hint: '写世界时的杂事：要补的设定、要画的图、要问的问题。',
  emptyText: '把"还得补一句"的事记下来，别靠脑子记。',
  searchText: (item) => `${item.text || ''} ${item.owner || ''}`,
  toggle: true,
  fields: [
    { key: 'text', label: '内容', placeholder: '要做的事', wide: true },
    { key: 'owner', label: '负责人', placeholder: '谁', cls: 'is-narrow' },
    { key: 'due', label: '截止', placeholder: '日期', cls: 'is-narrow' },
  ],
  blank: () => ({ id: toolId('t'), text: '', owner: '', due: '', done: false }),
});

const renderChapterTool = (entry) => renderListTool(entry, {
  icon: 'file', title: '章节', itemName: '章节',
  hint: '按顺序的章节草稿：先写小节，之后再排版。字数是实时统计的。',
  emptyText: '第一章写什么？先起个标题，正文慢慢补。',
  searchText: (item) => `${item.title || ''} ${item.body || ''}`,
  fields: [
    { key: 'title', label: '标题', placeholder: '章节标题' },
    { key: 'body', label: '正文', placeholder: '正文…（支持 Markdown）', wide: true, multiline: true },
    {
      key: 'count', label: '字数', cls: 'is-narrow',
      render: (item) => el('span', 'hint', `${(item.body || '').replace(/\s/g, '').length} 字`),
    },
  ],
  blank: () => ({ id: toolId('ch'), title: '新章节', body: '' }),
});

const renderEmbedTool = (entry) => renderListTool(entry, {
  icon: 'external-link', title: '链接嵌入', itemName: '链接',
  hint: '把外部资料（参考图、论坛帖、维基页）挂在这里，写的时候随手能点开。',
  emptyText: '粘一个链接进来，配上标题与说明。',
  searchText: (item) => `${item.title || ''} ${item.url || ''} ${item.note || ''}`,
  fields: [
    { key: 'title', label: '标题', placeholder: '标题' },
    { key: 'url', label: '地址', placeholder: 'https://…' },
    { key: 'note', label: '说明', placeholder: '为什么留着它', wide: true },
  ],
  blank: () => ({ id: toolId('em'), title: '', url: '', note: '' }),
  actions: [{
    label: '打开', run: (item) => window.open(item.url, '_blank', 'noopener'),
  }],
});

/* ---------------------------------------------------------------- 骰子 */
function renderDiceTool(entry) {
  const wrap = toolShell(entry, { iconName: 'box', title: '骰子', hint: '骰组存下来，随手掷一把；结果留在下面的记录里。' });
  const board = el('div', 'dice-board');
  wrap.appendChild(board);
  wrap.querySelector('.tool-actions').appendChild(button('＋ 新骰组', '', async () => {
    const data = entry.toolData || {};
    data.sets = data.sets || [];
    data.sets.push({ id: toolId('d'), name: '新骰组', dice: [{ count: 1, sides: 20 }], modifier: 0 });
    await saveToolData(entry, data, { label: '已加骰组' });
    renderPanels();
  }, true));

  const rollOnce = (sides) => {
    const buffer = new Uint32Array(1);
    (window.crypto || {}).getRandomValues?.(buffer);
    return 1 + ((buffer[0] || Math.floor(Math.random() * 4294967296)) % sides);
  };

  const paint = () => {
    const data = entry.toolData || {};
    board.innerHTML = '';
    (data.sets || []).forEach((set, index) => {
      const card = el('div', 'dice-card');
      const head = el('div', 'dice-head');
      const name = el('input', 'mini-input');
      name.value = set.name || '骰组';
      name.addEventListener('change', async () => { set.name = name.value; await saveToolData(entry, data, { silent: true }); });
      head.appendChild(name);
      const roll = el('button', 'mini-btn is-primary', '掷！');
      roll.addEventListener('click', async () => {
        const rolls = [];
        (set.dice || []).forEach((group) => {
          for (let i = 0; i < (group.count || 1); i += 1) {
            rolls.push({ sides: group.sides, value: rollOnce(group.sides || 6) });
          }
        });
        const total = rolls.reduce((sum, item) => sum + item.value, 0) + (set.modifier || 0);
        data.log = data.log || [];
        data.log.unshift({ id: toolId('r'), at: new Date().toISOString(), name: set.name, rolls, total });
        data.log = data.log.slice(0, 30);
        await saveToolData(entry, data, { silent: true });
        toast(`${set.name}：${rolls.map((r) => r.value).join(' + ')}`
          + `${set.modifier ? ` ${set.modifier > 0 ? '+' : '−'} ${Math.abs(set.modifier)}` : ''} = ${total}`, 2600);
        paint();
      });
      head.appendChild(roll);
      const del = el('button', 'mini-btn is-small is-danger', '删');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        data.sets.splice(index, 1);
        await saveToolData(entry, data, { silent: true });
        paint();
      });
      head.appendChild(del);
      card.appendChild(head);

      const diceRow = el('div', 'dice-row');
      (set.dice || []).forEach((group) => {
        const count = el('input', 'mini-input is-tiny');
        count.type = 'number';
        count.min = '1';
        count.value = group.count;
        count.addEventListener('change', async () => { group.count = Number(count.value) || 1; await saveToolData(entry, data, { silent: true }); });
        const times = el('span', 'hint', '×');
        const sides = el('select', 'mini-select');
        [4, 6, 8, 10, 12, 20, 100].forEach((value) => {
          const option = el('option', null, `d${value}`);
          option.value = value;
          sides.appendChild(option);
        });
        sides.value = group.sides || 6;
        sides.addEventListener('change', async () => { group.sides = Number(sides.value); await saveToolData(entry, data, { silent: true }); });
        diceRow.appendChild(count);
        diceRow.appendChild(times);
        diceRow.appendChild(sides);
      });
      const modifier = el('input', 'mini-input is-tiny');
      modifier.type = 'number';
      modifier.value = set.modifier || 0;
      modifier.title = '固定加值';
      modifier.addEventListener('change', async () => { set.modifier = Number(modifier.value) || 0; await saveToolData(entry, data, { silent: true }); });
      diceRow.appendChild(el('span', 'hint', '加值'));
      diceRow.appendChild(modifier);
      card.appendChild(diceRow);
      board.appendChild(card);
    });

    const log = el('div', 'dice-log');
    log.appendChild(el('h4', 'form-title', `掷骰记录 · ${(data.log || []).length}`));
    (data.log || []).slice(0, 10).forEach((entryLog) => {
      const row = el('div', 'dice-log-row');
      row.appendChild(el('span', 'hint', (entryLog.at || '').replace('T', ' ').slice(5, 16)));
      row.appendChild(el('b', null, entryLog.name || ''));
      row.appendChild(el('span', null, (entryLog.rolls || []).map((r) => `d${r.sides}:${r.value}`).join(' ')));
      row.appendChild(el('b', 'dice-total', String(entryLog.total)));
      log.appendChild(row);
    });
    board.appendChild(log);
  };
  loadToolData(entry).then(paint);
  return wrap;
}

/* ---------------------------------------------------------------- 雷达图 */
function renderRadarTool(entry) {
  const wrap = toolShell(entry, {
    iconName: 'globe', title: '雷达图',
    hint: '把几张卡片的数值属性放在一起比：适合对比人物能力、势力强弱。',
  });
  const holder = el('div', 'radar-holder');
  wrap.appendChild(holder);
  const controls = el('div', 'radar-controls');
  wrap.insertBefore(controls, holder);

  const paint = async () => {
    const data = entry.toolData || {};
    const cards = await api('/api/world/search?q=' + encodeURIComponent(data.query || '') + '&limit=40');
    const rows = (cards.results || []).filter((r) => r.type === 'card');
    controls.innerHTML = '';
    holder.innerHTML = '';
    const picker = el('select', 'mini-select');
    const blank = el('option', null, '选择要对比的卡片…');
    blank.value = '';
    picker.appendChild(blank);
    rows.forEach((row) => {
      const option = el('option', null, row.name);
      option.value = row.id;
      picker.appendChild(option);
    });
    const chosen = data.cards || [];
    const addCard = async () => {
      if (!picker.value) return;
      if (!chosen.includes(Number(picker.value))) chosen.push(Number(picker.value));
      data.cards = chosen;
      await saveToolData(entry, data, { silent: true });
      paint();
    };
    picker.addEventListener('change', addCard);
    controls.appendChild(picker);
    controls.appendChild(el('span', 'hint', `${chosen.length} 张卡片参与对比`));

    if (!chosen.length) {
      holder.appendChild(emptyBlock({
        iconName: 'globe', title: '还没有选卡片',
        text: '从上面的下拉里挑几张卡片，它们的数值属性会画成雷达图。',
      }));
      return;
    }

    const payloads = await Promise.all(chosen.map((id) => api(`/api/world/cards/${id}`)));
    const axes = [];
    const series = [];
    payloads.forEach((payload) => {
      const values = {};
      Object.values(payload.card.resolved || {}).forEach((item) => {
        if (typeof item === 'number') {
          values[item.name] = item.value;
          if (!axes.includes(item.name)) axes.push(item.name);
        }
      });
      series.push({ name: payload.document.name, values });
    });

    if (axes.length < 3) {
      holder.appendChild(emptyBlock({
        iconName: 'tag', title: '数值属性不够',
        text: `雷达图至少要 3 个数值属性，现在只有 ${axes.length} 个。给这些卡片加几个数字属性吧。`,
        actionLabel: '打开类型与属性', onAction: () => typeManager(),
      }));
      return;
    }

    const size = 380;
    const canvas = el('canvas', 'radar-canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    holder.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const cx = size;
    const cy = size;
    const radius = size * 0.72;
    const maxValue = Math.max(1, ...series.flatMap((s) => axes.map((axis) => s.values[axis] || 0)));
    const colors = ['#2563ef', '#16a34a', '#d97706', '#a855f7', '#cf001c'];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(127,127,127,.35)';
    ctx.fillStyle = 'rgba(127,127,127,.9)';
    ctx.font = '13px system-ui';
    for (let ring = 1; ring <= 4; ring += 1) {
      ctx.beginPath();
      axes.forEach((axis, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        const r = (radius * ring) / 4;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    axes.forEach((axis, index) => {
      const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
      ctx.fillText(axis, cx + Math.cos(angle) * (radius + 22) - 12, cy + Math.sin(angle) * (radius + 22));
    });
    series.forEach((serie, serieIndex) => {
      ctx.beginPath();
      axes.forEach((axis, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        const r = (radius * (serie.values[axis] || 0)) / maxValue;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = colors[serieIndex % colors.length];
      ctx.fillStyle = `${colors[serieIndex % colors.length]}33`;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });

    const legend = el('div', 'radar-legend');
    series.forEach((serie, index) => {
      const item = el('span', 'radar-legend-item');
      const dot = el('span', 'rd-dot');
      dot.style.background = colors[index % colors.length];
      item.appendChild(dot);
      item.appendChild(el('span', null, serie.name));
      const del = el('button', 'bc-del', '✕');
      del.addEventListener('click', async () => {
        data.cards = (data.cards || []).filter((id) => id !== chosen[index]);
        await saveToolData(entry, data, { silent: true });
        paint();
      });
      item.appendChild(del);
      legend.appendChild(item);
    });
    holder.appendChild(legend);
  };
  paint();
  return wrap;
}

/* ---------------------------------------------------------------- 环境音 */
const SOUND_KINDS = {
  rain: { label: '雨', filter: 'highpass', freq: 900 },
  wind: { label: '风', filter: 'lowpass', freq: 400 },
  fire: { label: '火', filter: 'bandpass', freq: 700 },
  hum: { label: '低频嗡鸣', filter: 'lowpass', freq: 160 },
  birds: { label: '远方人声', filter: 'bandpass', freq: 1800 },
};

function renderSoundscapeTool(entry) {
  const wrap = toolShell(entry, {
    iconName: 'droplet', title: '环境音',
    hint: '用浏览器实时合成的分层环境音（白噪 + 滤波），给写作找点氛围。不用音频文件。',
  });
  const board = el('div', 'sound-board');
  wrap.appendChild(board);
  const audio = { ctx: null, nodes: new Map() };

  const ensureCtx = () => {
    if (!audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
    }
    return audio.ctx;
  };

  const stopAll = () => {
    audio.nodes.forEach((node) => { try { node.stop(); } catch (error) { /* 已停 */ } });
    audio.nodes.clear();
  };

  const play = (layer) => {
    const ctx = ensureCtx();
    const kind = SOUND_KINDS[layer.kind] || SOUND_KINDS.rain;
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = kind.filter;
    filter.frequency.value = kind.freq;
    const gain = ctx.createGain();
    gain.gain.value = (layer.volume || 40) / 100 * 0.5;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    audio.nodes.set(layer.id, source);
  };

  const paint = () => {
    const data = entry.toolData || {};
    data.layers = data.layers || [];
    board.innerHTML = '';
    data.layers.forEach((layer, index) => {
      const row = el('div', 'sound-row');
      const kindSelect = el('select', 'mini-select');
      Object.entries(SOUND_KINDS).forEach(([value, info]) => {
        const option = el('option', null, info.label);
        option.value = value;
        kindSelect.appendChild(option);
      });
      kindSelect.value = layer.kind || 'rain';
      kindSelect.addEventListener('change', async () => {
        layer.kind = kindSelect.value;
        if (audio.nodes.has(layer.id)) { audio.nodes.get(layer.id).stop(); audio.nodes.delete(layer.id); play(layer); }
        await saveToolData(entry, data, { silent: true });
      });
      row.appendChild(kindSelect);

      const volume = el('input', 'sound-volume');
      volume.type = 'range';
      volume.min = '0';
      volume.max = '100';
      volume.value = layer.volume || 40;
      volume.addEventListener('input', () => {
        layer.volume = Number(volume.value);
        const node = audio.nodes.get(layer.id);
        if (node) node.gain = layer.volume;
      });
      volume.addEventListener('change', () => saveToolData(entry, data, { silent: true }));
      row.appendChild(volume);

      const toggle = el('button', `mini-btn is-small${layer.playing ? ' is-primary' : ''}`, layer.playing ? '停止' : '播放');
      toggle.addEventListener('click', async () => {
        layer.playing = !layer.playing;
        if (layer.playing) play(layer); else if (audio.nodes.has(layer.id)) {
          audio.nodes.get(layer.id).stop();
          audio.nodes.delete(layer.id);
        }
        await saveToolData(entry, data, { silent: true });
        paint();
      });
      row.appendChild(toggle);

      const del = el('button', 'mini-btn is-small is-danger', '删');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        if (audio.nodes.has(layer.id)) { audio.nodes.get(layer.id).stop(); audio.nodes.delete(layer.id); }
        data.layers.splice(index, 1);
        await saveToolData(entry, data, { silent: true });
        paint();
      });
      row.appendChild(del);
      board.appendChild(row);
    });
    board.appendChild(button('＋ 加一层', '再叠一层声音', async () => {
      data.layers.push({ id: toolId('s'), kind: 'wind', volume: 40, playing: false });
      await saveToolData(entry, data, { silent: true });
      paint();
    }, true));
  };
  loadToolData(entry).then(paint);
  wrap.addEventListener('remove', stopAll);
  return wrap;
}

/* ---------------------------------------------------------------- 语音 / 媒体 */
function renderMediaTool(entry) {
  const wrap = toolShell(entry, {
    iconName: 'message-circle-more', title: DOC_LABEL[entry.document.type] || '媒体',
    hint: '浏览器直接录音（也可以传图片 / 文件），文件存在服务器上，列表里能回放。',
  });
  const holder = el('div', 'media-grid');
  wrap.appendChild(holder);
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  wrap.appendChild(fileInput);
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    for (const file of files) {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('kind', (file.type || '').split('/')[0] || 'file');
      form.append('title', file.name);
      await api(`/api/world/documents/${entry.document.id}/media`, { method: 'POST', form });
    }
    toast(`已上传 ${files.length} 个文件`);
    renderPanels();
  });
  wrap.querySelector('.tool-actions').appendChild(button('＋ 上传文件', '', () => fileInput.click()));

  let recorder = null;
  let chunks = [];
  const recordButton = button('● 录音', '用麦克风录一段', async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('这个浏览器不支持录音');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      const startedAt = Date.now();
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('file', blob, `voice-${Date.now()}.webm`);
        form.append('kind', 'audio');
        form.append('title', `口述 ${new Date().toLocaleTimeString()}`);
        form.append('duration', String(Math.round((Date.now() - startedAt) / 1000)));
        await api(`/api/world/documents/${entry.document.id}/media`, { method: 'POST', form });
        toast('录音已保存');
        renderPanels();
      });
      recorder.start();
      recordButton.textContent = '■ 停止';
      recordButton.classList.add('is-danger');
    } catch (error) {
      toast('拿不到麦克风权限');
    }
  });
  wrap.querySelector('.tool-actions').appendChild(recordButton);

  const paint = () => {
    const media = entry.toolMedia || [];
    holder.innerHTML = '';
    if (!media.length) {
      holder.appendChild(emptyBlock({
        iconName: 'message-circle-more', title: '还没有录音或文件',
        text: '按住「● 录音」说一段想法，或者上传参考图、PDF。',
        actionLabel: '● 录音', onAction: () => recordButton.click(),
      }));
      return;
    }
    media.forEach((item) => {
      const card = el('div', 'media-card');
      if ((item.kind || '').startsWith('audio')) {
        const audio = el('audio');
        audio.controls = true;
        audio.src = item.url;
        card.appendChild(audio);
      } else if ((item.kind || '').startsWith('image')) {
        const img = el('img');
        img.src = item.url;
        img.alt = item.title || '';
        card.appendChild(img);
      } else {
        const link = el('a', 'mini-btn', item.title || '文件');
        link.href = item.url;
        link.target = '_blank';
        card.appendChild(link);
      }
      card.appendChild(el('span', 'media-title', item.title || ''));
      card.appendChild(el('span', 'hint', `${Math.round((item.size || 0) / 1024)} KB`
        + (item.duration ? ` · ${Math.round(item.duration)} 秒` : '')));
      const del = el('button', 'mini-btn is-small is-danger', '删除');
      del.dataset.danger = '1';
      del.addEventListener('click', async () => {
        if (!window.confirm('删掉这个文件？')) return;
        await api(`/api/world/documents/${entry.document.id}/media`, { method: 'DELETE', body: { id: item.id } });
        renderPanels();
      });
      card.appendChild(del);
      holder.appendChild(card);
    });
  };
  loadToolData(entry).then(paint);
  return wrap;
}

/* ============================================================ 日历视图 */
/**
 * 时间线的另一种看法：一个月一张网格，格子里是当天的事件与月相。
 * 和线视图共用同一份数据（事件来自 /api/world/timelines/<id>）。
 */
const CAL_STATE = { year: 0, month: 1, view: 'line' };

function moonDot(moon) {
  const dot = el('span', 'cal-moon');
  const size = 4 + Math.round((moon.illumination || 0) * 6);
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.background = moon.illumination > 0.7 ? 'var(--mn-warning)' : 'var(--mn-ink-dim)';
  dot.title = `${moon.name} · ${moon.phase}（${Math.round((moon.illumination || 0) * 100)}%）`;
  return dot;
}

function renderCalendarView(entry, panelIndex) {
  const document_ = entry.document;
  const wrap = el('div', 'cal-view');
  wrap.dataset.doc = String(document_.id);

  const calendars = S.calendars || [];
  const calendar = calendars.find((c) => c.id === (entry.timeline && entry.timeline.calendar))
    || calendars[0];
  if (!calendar) {
    wrap.appendChild(emptyBlock({ iconName: 'align', title: '还没有日历', text: '先在「日历与纪元」里建一个日历。' }));
    return wrap;
  }
  const events = (entry.timeline && entry.timeline.events) || [];
  // 默认跳到事件最多的那年那月
  if (!CAL_STATE.initialized) {
    const first = events.slice().sort((a, b) => (a.year || 0) - (b.year || 0))[0];
    CAL_STATE.year = first ? first.year : 0;
    CAL_STATE.month = first ? (first.month || 1) : 1;
    CAL_STATE.initialized = true;
  }

  const bar = el('div', 'cal-bar');
  const prev = el('button', 'mini-btn is-small', '‹');
  const next = el('button', 'mini-btn is-small', '›');
  const label = el('b', 'cal-label');
  const switcher = el('select', 'mini-select');
  calendars.forEach((item) => {
    const option = el('option', null, item.name);
    option.value = item.id;
    switcher.appendChild(option);
  });
  switcher.value = calendar.id;
  switcher.addEventListener('change', async () => {
    await api(`/api/world/timelines/${document_.id}`, { method: 'PUT', body: { calendar: Number(switcher.value) } });
    entry.timeline.calendar = Number(switcher.value);
    CAL_STATE.initialized = false;
    renderPanels();
  });
  bar.appendChild(switcher);
  bar.appendChild(prev);
  bar.appendChild(label);
  bar.appendChild(next);
  bar.appendChild(el('span', 'hint', `${calendar.hours_per_day} 小时/天 · ${(calendar.moons || []).length} 颗卫星`));
  wrap.appendChild(bar);

  const grid = el('div', 'cal-grid');
  wrap.appendChild(grid);
  const foot = el('div', 'cal-foot');
  wrap.appendChild(foot);

  const load = async () => {
    const data = await api(`/api/world/calendars/${calendar.id}/month?year=${CAL_STATE.year}`
      + `&month=${CAL_STATE.month}&document=${document_.id}`);
    label.textContent = `${data.year} 年 · ${data.month_name}`;
    grid.innerHTML = '';
    ['一', '二', '三', '四', '五', '六', '日'].forEach((name) => {
      grid.appendChild(el('div', 'cal-head', name));
    });
    data.weeks.forEach((week) => {
      week.forEach((cell) => {
        if (!cell) { grid.appendChild(el('div', 'cal-cell is-blank')); return; }
        const box = el('div', 'cal-cell');
        const head = el('div', 'cal-day');
        head.appendChild(el('span', null, String(cell.day)));
        const moons = el('span', 'cal-moons');
        (cell.moons || []).forEach((moon) => moons.appendChild(moonDot(moon)));
        head.appendChild(moons);
        box.appendChild(head);
        (cell.events || []).forEach((event) => {
          const chip = el('button', `cal-event p-${event.precision}`);
          chip.type = 'button';
          chip.appendChild(el('span', 'ce-time', event.precision === 'time' ? `${event.hour}:00` : ''));
          chip.appendChild(el('span', 'ce-title', event.title));
          chip.addEventListener('click', () => {
            toast(`${event.title} · ${data.year} 年 ${data.month_name} ${cell.day} 日`, 2600);
          });
          box.appendChild(chip);
        });
        grid.appendChild(box);
      });
    });
    const total = data.weeks.reduce((sum, week) => sum + week.filter((c) => c && c.events.length).length, 0);
    foot.textContent = `这个月有 ${total} 天安排了事件`;
  };

  const step = (delta) => {
    let month = CAL_STATE.month + delta;
    let year = CAL_STATE.year;
    const count = (calendar.months || []).length || 12;
    if (month < 1) { month = count; year -= 1; }
    if (month > count) { month = 1; year += 1; }
    CAL_STATE.month = month;
    CAL_STATE.year = year;
    load();
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  load();          // 先同步把骨架交给调用方，数据到了再填
  return wrap;
}

/* ============================================================ 纪元分支 */
/** 当前写作纪元：切了之后，不属于这个纪元的卡会被标出来（发布站点也会过滤）。 */
function refreshEraChip() {
  const slot = $('#eraChipSlot');
  if (!slot) return;
  slot.innerHTML = '';
  slot.appendChild(eraChip());
}

function eraChip() {
  const eras = S.eras || [];
  const chip = el('button', 'era-chip');
  chip.type = 'button';
  const active = eras.find((e) => e.id === S.eraId);
  chip.classList.toggle('is-on', Boolean(active));
  chip.appendChild(icon('globe', 14));
  chip.appendChild(el('span', null, active ? active.name : '所有纪元'));
  chip.title = active
    ? `当前按「${active.name}」这一版看世界；点一下切换`
    : '当前显示所有纪元的内容；点一下切到某个纪元';
  chip.addEventListener('click', () => eraSwitcherDialog());
  return chip;
}

function eraSwitcherDialog() {
  const eras = S.eras || [];
  openModal('世界版本（纪元）', (body) => {
    body.appendChild(el('p', 'hint',
      'VVD 里的纪元不只是时间轴上的分段，它还是"世界的版本"：同一个世界在不同纪元里可以有不同的一批卡。'
      + '选一个纪元，界面上会标出不属于它的卡；发布站点也会按它过滤。'));
    const list = el('div', 'suggest-list');
    const addRow = (id, name, hint, themeConfig) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, name));
      row.appendChild(el('span', 'hint', hint));
      if (themeConfig && themeConfig.primaryColor) {
        const swatch = el('span', 'era-swatch');
        swatch.style.background = themeConfig.primaryColor;
        row.appendChild(swatch);
      }
      const use = el('button', `mini-btn is-small${S.eraId === id ? ' is-primary' : ''}`, S.eraId === id ? '当前' : '切到这一版');
      use.addEventListener('click', () => {
        setActiveEra(id);
        closeModal();
      });
      row.appendChild(use);
      list.appendChild(row);
    };
    addRow(null, '所有纪元', '不做过滤，看到全部内容');
    eras.forEach((era) => {
      const hidden = countEraHidden(era.id);
      addRow(era.id, era.name, `${era.length_years ? `${era.length_years} 年 · ` : ''}`
        + (hidden ? `${hidden} 张卡不在这一版` : '全部卡都在这一版'), era.theme_config);
    });
    body.appendChild(list);
    const actions = el('div', 'form-row');
    actions.appendChild(button('管理纪元…', '改名 / 长度 / 配色 / 给纪元自己的主题', () => {
      closeModal();
      erasDialog(S.docs.get(activeIdOfTimeline()));
    }));
    body.appendChild(actions);
  });
}

function countEraHidden(eraId) {
  let hidden = 0;
  (S.tree || []).forEach((node) => {
    const walk = (item) => {
      const card = item.card;
      if (card && card.era_mode && card.era_mode !== 'universal'
          && Array.isArray(card.era_ids) && card.era_ids.length) {
        const visible = card.era_mode === 'only'
          ? card.era_ids.includes(eraId)
          : !card.era_ids.includes(eraId);
        if (!visible) hidden += 1;
      }
      (item.children || []).forEach(walk);
    };
    walk(node);
  });
  return hidden;
}

function setActiveEra(eraId) {
  S.eraId = eraId || null;
  if (S.eraId) localStorage.setItem('ws:era', String(S.eraId));
  else localStorage.removeItem('ws:era');
  // 纪元可以有自己的主题：有就盖在世界主题上
  const era = (S.eras || []).find((e) => e.id === S.eraId);
  const base = (S.world && S.world.theme) || {};
  applyTheme(era && era.theme_config && Object.keys(era.theme_config).length
    ? { ...base, ...era.theme_config }
    : base);
  renderPanels();
  renderTree();
  refreshEraChip();
  toast(S.eraId ? `已切到「${era.name}」这一版` : '显示所有纪元的内容');
}

/** 卡的纪元可见性（在卡片徽章行里点开）。 */
function cardEraDialog(entry) {
  const card = entry.card || {};
  const eras = S.eras || [];
  openModal('这张卡出现在哪些纪元', (body) => {
    if (!eras.length) {
      body.appendChild(emptyBlock({ iconName: 'globe', title: '还没有纪元', text: '先在「纪元」里建几个，再来分配卡片。' }));
      return;
    }
    const mode = card.era_mode || 'universal';
    let selected = Array.isArray(card.era_ids) ? card.era_ids.slice() : [];
    const modes = [
      ['universal', '所有纪元都出现', '默认：哪个版本里都有它'],
      ['only', '只在选定的纪元里出现', '比如"这条设定是新纪元才有的"'],
      ['hidden', '在选定的纪元里隐藏', '比如"这一版里它已经不存在了"'],
    ];
    modes.forEach(([value, title, hint]) => {
      const row = el('label', 'era-mode-row');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'era-mode';
      radio.value = value;
      radio.checked = mode === value;
      row.appendChild(radio);
      const text = el('div');
      text.appendChild(el('b', null, title));
      text.appendChild(el('span', 'hint', hint));
      row.appendChild(text);
      row.addEventListener('click', () => { radio.checked = true; });
      body.appendChild(row);
    });
    body.appendChild(el('h4', 'form-title', '选纪元'));
    const picks = el('div', 'era-picks');
    eras.forEach((era) => {
      const label = el('label', 'era-pick');
      const box = el('input');
      box.type = 'checkbox';
      box.value = era.id;
      box.checked = selected.includes(era.id);
      label.appendChild(box);
      label.appendChild(el('span', null, era.name));
      picks.appendChild(label);
    });
    body.appendChild(picks);
    const actions = el('div', 'form-row');
    actions.appendChild(button('保存', '', async () => {
      const chosen = Array.from(picks.querySelectorAll('input:checked')).map((n) => Number(n.value));
      const picked = body.querySelector('input[name="era-mode"]:checked');
      await api(`/api/world/cards/${entry.document.id}`, {
        method: 'PUT', body: { era_mode: picked ? picked.value : 'universal', era_ids: chosen },
      });
      const fresh = await api(`/api/world/cards/${entry.document.id}`);
      entry.card = fresh.card;
      closeModal();
      renderPanels();
      await reloadTree();
      toast('纪元可见性已保存');
    }, true));
    body.appendChild(actions);
  });
}

/* ==================================================== 无障碍播报 / 键盘拖拽 */
/** 把状态变化念给屏幕阅读器听（视觉用户看不到这个区域）。 */
function announce(message) {
  const box = $('#srStatus');
  if (!box) return;
  box.textContent = '';
  setTimeout(() => { box.textContent = message; }, 30);
}

/* ====================================================== 账号与只读模式 */
/** 把"我是谁、能不能编辑"落到界面上：只读时收起编辑入口，顶栏显示身份。 */
/** 现在能不能编辑（只读模式下所有就地编辑都要关掉）。 */
function editable() {
  return !S.viewer || S.viewer.can_edit !== false;
}

function applyViewer(viewer) {
  if (!viewer) return;
  S.viewer = viewer;
  document.documentElement.dataset.canEdit = viewer.can_edit ? '1' : '0';

  const chip = $('#userChip');
  const avatar = $('#userAvatar');
  const name = $('#userName');
  if (chip && avatar && name) {
    if (viewer.authenticated) {
      chip.classList.remove('is-guest');
      avatar.textContent = viewer.initial || '·';
      name.textContent = viewer.username || viewer.handle;
      chip.title = `${viewer.username}（${viewer.role_label}）· 点开账号菜单`;
    } else {
      chip.classList.add('is-guest');
      avatar.textContent = '?';
      name.textContent = viewer.needs_setup ? '创建账号' : '登录';
      chip.title = viewer.needs_setup ? '第一次使用：先创建所有者账号' : '登录后才能编辑';
    }
  }

  const bar = $('#readonlyBar');
  const text = $('#readonlyText');
  if (bar && text) {
    if (viewer.can_edit) {
      bar.hidden = true;
    } else {
      bar.hidden = false;
      text.textContent = viewer.needs_setup
        ? '还没有账号：先创建所有者账号，之后所有编辑都需要登录。'
        : (viewer.authenticated
            ? '你在这个世界里是只读权限，看看就好。'
            : '只读模式：登录后才能编辑（发布出来的站点一直是公开的）。');
    }
  }
  // 只读时把正文的可编辑关掉（重画之后 renderPanels 会再兜一次），
  // 并把写操作入口整个藏起来——"点了才提示登录"对读者是骗点击
  revealWriteControls(Boolean(viewer.can_edit));
  if (!viewer.can_edit) disableEditing();
}

function disableEditing() {
  $$('[contenteditable="true"]').forEach((node) => node.setAttribute('contenteditable', 'false'));
}

/* 只读时要"藏起来"的写操作入口（不是靠点了再提示——那是骗点击）。
   新增写按钮时记得加进这张表，否则游客点得到、点了才被拦。 */
const WRITE_CONTROLS = [
  '#undoBtn', '#redoBtn', '#exchangeBtn', '#newDocBtn', '#newFolderBtn', '#templateBtn',
  '#mapUploadBtn', '#mapBgBtn', '#insertBlockBtn', '#addEventBtn', '#calendarEditBtn',
  '#cardEraBtn', '#coverBtn', '#memberInviteBtn', '#publishBtn', '#tableAddRowBtn',
];

function revealWriteControls(show) {
  WRITE_CONTROLS.forEach((selector) => {
    $$(selector).forEach((node) => { node.hidden = !show; });
  });
  // 插入条 / 新建类按钮：只读时整块收起来，界面干净，也不会误导
  $$('.insert-bar, .block-menu-add, .tool-add-row').forEach((node) => { node.hidden = !show; });
  document.documentElement.classList.toggle('is-readonly-mode', !show);
}

/** 写操作的统一闸门：没权限就别发请求，直接告诉用户为什么。 */
function guardWrite() {
  if (S.viewer && S.viewer.can_edit) return true;
  toast(S.viewer && S.viewer.needs_setup ? '先创建所有者账号再编辑' : '登录后才能编辑', 2600);
  return false;
}

function userMenu() {
  const viewer = S.viewer || {};
  openModal('账号', (body) => {
    if (!viewer.authenticated) {
      body.appendChild(el('p', 'hint', viewer.needs_setup
        ? '这是第一次启动。注册的第一个账号会成为这个世界的所有者，之后邀请别人一起写。'
        : '登录后才能编辑；浏览不需要登录。'));
      const actions = el('div', 'form-row');
      const login = el('a', 'mini-btn is-primary', viewer.needs_setup ? '创建所有者账号' : '登录');
      login.href = viewer.needs_setup ? '/register' : '/login';
      actions.appendChild(login);
      if (!viewer.needs_setup) {
        const register = el('a', 'mini-btn', '用邀请码注册');
        register.href = '/register';
        actions.appendChild(register);
      }
      body.appendChild(actions);
      return;
    }
    const card = el('div', 'member-row');
    const avatar = el('span', 'mr-avatar', viewer.initial || '·');
    card.appendChild(avatar);
    const main = el('div', 'mr-main');
    main.appendChild(el('b', null, viewer.username));
    main.appendChild(el('span', null, `@${viewer.handle} · ${viewer.role_label}`));
    card.appendChild(main);
    body.appendChild(card);

    const actions = el('div', 'form-row');
    actions.appendChild(button('协作者与邀请…', '谁能进来、谁能改', () => collaboratorsDialog()));
    actions.appendChild(button('退出登录', '', async () => {
      await api('/api/world/auth/logout', { method: 'POST', body: {} });
      window.location.href = '/world';
    }, false, true));
    body.appendChild(actions);
  });
}

function collaboratorsDialog() {
  api('/api/world/collaborators').then((data) => {
    openModal('协作者', (body) => {
      const viewer = data.viewer || {};
      body.appendChild(el('p', 'hint',
        `「${S.world ? S.world.name : '这个世界'}」目前有 ${data.members.length} 位成员。`
        + (viewer.can_admin ? '你可以调整角色、发邀请码。' : '只有所有者能调整成员。')));

      const list = el('div', 'suggest-list');
      data.members.forEach((member) => {
        const row = el('div', 'member-row');
        row.appendChild(el('span', 'mr-avatar', (member.username || '?').slice(0, 1).toUpperCase()));
        const main = el('div', 'mr-main');
        main.appendChild(el('b', null, member.username));
        main.appendChild(el('span', null, `@${member.handle} · 加入于 ${(member.joined_at || '').slice(0, 10)}`));
        row.appendChild(main);
        if (viewer.can_admin && member.handle !== viewer.handle) {
          const select = el('select', 'mini-select');
          [['owner', '所有者'], ['editor', '可编辑'], ['viewer', '只读']].forEach(([value, label]) => {
            const option = el('option', null, label);
            option.value = value;
            select.appendChild(option);
          });
          select.value = member.role;
          select.addEventListener('change', async () => {
            await api(`/api/world/collaborators/${member.id}`, { method: 'PUT', body: { role: select.value } });
            toast('角色已更新');
            collaboratorsDialog();
          });
          row.appendChild(select);
          const remove = el('button', 'mini-btn is-small is-danger', '移除');
          remove.dataset.danger = '1';
          remove.addEventListener('click', async () => {
            if (!window.confirm(`把 ${member.username} 移出这个世界？`)) return;
            await api(`/api/world/collaborators/${member.id}`, { method: 'DELETE' });
            toast('已移除');
            collaboratorsDialog();
          });
          row.appendChild(remove);
        } else {
          row.appendChild(el('span', 'badge', member.role_label));
        }
        list.appendChild(row);
      });
      body.appendChild(list);

      if (viewer.can_admin) {
        body.appendChild(el('h4', 'form-title', '邀请码'));
        if (data.invites && data.invites.length) {
          const invites = el('div', 'suggest-list');
          data.invites.forEach((invite) => {
            const row = el('div', 'suggest-row');
            const code = el('span', 'invite-code', invite.code);
            row.appendChild(code);
            row.appendChild(el('span', 'hint',
              `${invite.note || '未备注'} · ${invite.uses}/${invite.max_uses} 次 · ${invite.valid ? '可用' : '已失效'}`));
            const copy = el('button', 'mini-btn is-small', '复制');
            copy.addEventListener('click', async () => {
              const link = `${location.origin}/register?invite=${invite.code}`;
              try { await navigator.clipboard.writeText(link); toast('邀请链接已复制'); }
              catch (error) { window.prompt('复制这个链接：', link); }
            });
            row.appendChild(copy);
            const del = el('button', 'mini-btn is-small is-danger', '删除');
            del.dataset.danger = '1';
            del.addEventListener('click', async () => {
              await api(`/api/world/collaborators/invites/${invite.id}`, { method: 'DELETE' });
              collaboratorsDialog();
            });
            row.appendChild(del);
            invites.appendChild(row);
          });
          body.appendChild(invites);
        } else {
          body.appendChild(el('p', 'hint', '还没有邀请码。发一个，把链接给朋友就能一起写。'));
        }
        const actions = el('div', 'form-row');
        actions.appendChild(button('生成邀请码', '默认可编辑、用一次', async () => {
          const invite = await api('/api/world/collaborators/invites', { method: 'POST', body: { role: 'editor' } });
          const link = `${location.origin}/register?invite=${invite.code}`;
          try { await navigator.clipboard.writeText(link); toast(`邀请码 ${invite.code} 已复制`); }
          catch (error) { window.prompt('把这个链接给朋友：', link); }
          collaboratorsDialog();
        }, true));
        body.appendChild(actions);
      }
      const foot = el('div', 'form-row');
      foot.appendChild(button('关闭', '', () => closeModal()));
      body.appendChild(foot);
    });
  });
}

/* ------------------------------------------------------------- 在线状态 */
function renderPresence(online) {
  const box = $('#presence');
  if (!box) return;
  box.innerHTML = '';
  const people = (online || []).filter((p) => p.handle !== (S.viewer && S.viewer.handle));
  const active = activeDocument();
  people.slice(0, 5).forEach((person) => {
    const dot = el('span', `pr${active && person.document === active.id ? '' : ' is-elsewhere'}`,
                   person.initial || '?');
    dot.title = active && person.document === active.id
      ? `${person.username} 也在看这份文档`
      : `${person.username} 在看《${person.document_name || '别的文档'}》`;
    box.appendChild(dot);
  });
  if (people.length > 5) box.appendChild(el('span', 'pr pr-more', `+${people.length - 5}`));
  if (!people.length) box.title = '目前只有你在线';
}

async function presenceBeat() {
  if (!S.viewer || !S.viewer.authenticated) return;
  const active = activeDocument();
  try {
    const data = await api('/api/world/presence', {
      method: 'POST', body: { document: active ? active.id : null },
    });
    renderPresence(data.online);
  } catch (error) { /* 掉线就下次再说 */ }
}

function startPresence() {
  if (S.presenceTimer) clearInterval(S.presenceTimer);
  presenceBeat();
  S.presenceTimer = setInterval(presenceBeat, 25000);
  window.addEventListener('focus', presenceBeat);
}

/* ------------------------------------------------------------- 版本历史 */
async function versionHistoryDialog(docId) {
  const id = docId || (activeDocument() && activeDocument().id);
  if (!id) { toast('先打开一份文档'); return; }
  const data = await api(`/api/world/documents/${id}/versions`);
  openModal(`版本历史 · ${data.document.name}`, (body) => {
    if (!data.versions.length) {
      body.appendChild(emptyBlock({
        iconName: 'arrow-left',
        title: '还没有历史版本',
        text: '改动内容之后，这里会按时间留下快照（同一段连续编辑会合并成一版）。',
      }));
      return;
    }
    body.appendChild(el('p', 'hint', `${data.versions.length} 个版本，点一个看内容，确认了再回滚。回滚本身也会留档。`));
    const list = el('div', 'version-list');
    data.versions.forEach((version, index) => {
      const row = el('div', `version-row${index === 0 ? ' is-current' : ''}`);
      row.appendChild(el('span', 'vr-index', `v${version.index}`));
      const main = el('div', 'vr-main');
      main.appendChild(el('b', null, version.label || '内容改动'));
      main.appendChild(el('span', null,
        `${version.author} · ${(version.created_at || '').replace('T', ' ').slice(0, 16)}`
        + (version.summary ? ` · ${version.summary}` : '')));
      row.appendChild(main);
      const peek = el('button', 'mini-btn is-small', '看内容');
      peek.addEventListener('click', async () => {
        const detail = await api(`/api/world/documents/${id}/versions/${version.index}`);
        const preview = $('.version-preview', body);
        if (preview) preview.remove();
        const box = el('div', 'version-preview');
        box.textContent = describeVersion(detail.payload);
        body.insertBefore(box, list);
        box.scrollIntoView({ block: 'nearest' });
      });
      row.appendChild(peek);
      if (index !== 0 && (S.viewer ? S.viewer.can_edit : true)) {
        const restore = el('button', 'mini-btn is-small is-primary', '回滚到这一版');
        restore.addEventListener('click', async () => {
          if (!window.confirm(`回滚到 v${version.index}？当前内容会先存一版。`)) return;
          await api(`/api/world/documents/${id}/versions/${version.index}`, { method: 'POST', body: {} });
          const fresh = await api(`/api/world/documents/${id}`);
          const entry = S.docs.get(id);
          if (entry) {
            entry.document = fresh.document;
            if (fresh.card) entry.card = fresh.card;
          }
          closeModal();
          renderPanels();
          await reloadTree();
          toast(`已回滚到 v${version.index}`);
        });
        row.appendChild(restore);
      }
      list.appendChild(row);
    });
    body.appendChild(list);
    const actions = el('div', 'form-row');
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/** 把一版快照描述成人能读的几行字。 */
function describeVersion(payload) {
  if (!payload) return '（空版本）';
  const lines = [`《${payload.name || '未命名'}》`];
  const card = payload.card;
  if (card && card.blocks) {
    lines.push(`区块 ${card.blocks.length} 个：`);
    card.blocks.forEach((block, index) => {
      const title = block.title || `#${index + 1}`;
      const text = (block.text || '').slice(0, 80);
      lines.push(`  ${index + 1}. [${block.type}] ${title}${text ? ` — ${text}` : ''}`);
    });
    if (card.aliases && card.aliases.length) lines.push(`别名：${card.aliases.join('、')}`);
  }
  if (payload.events) lines.push(`事件 ${payload.events.length} 个`);
  if (payload.markers) lines.push(`标注 ${payload.markers.length} 个`);
  if (payload.nodes) lines.push(`关系树节点 ${payload.nodes.length} 个`);
  return lines.join('\n');
}

/* ============================================================ 空状态 */
/**
 * 统一的空状态块：一个图标、一句标题、一句解释、可选的行动按钮。
 * 用它替换各处的"一行灰字"，让空页面也看得出下一步该做什么。
 */
function emptyBlock({ iconName = 'file', title, text, actionLabel, onAction, secondaryLabel, onSecondary }) {
  const box = el('div', 'empty-block');
  const art = el('div', 'eb-art');
  art.appendChild(icon(iconName, 30));
  box.appendChild(art);
  if (title) box.appendChild(el('b', null, title));
  if (text) box.appendChild(el('p', null, text));
  if (actionLabel) {
    const actions = el('div', 'eh-actions');
    actions.appendChild(button(actionLabel, '', onAction, true));
    if (secondaryLabel) actions.appendChild(button(secondaryLabel, '', onSecondary));
    box.appendChild(actions);
  }
  return box;
}

/* ====================================================== 引导模板（guided） */
/**
 * 对齐 VVD 的 guided templates：不给你一张空卡，而是问几个问题，
 * 然后把答案铺成"概览 / 细节 / 关系 / 备注"的区块结构。
 */
const GUIDED_TEMPLATES = [
  {
    key: 'character', label: '角色', icon: 'user',
    blurb: '一个人：他想要什么、怕什么、和谁有关。',
    questions: [
      ['name', '他叫什么？'],
      ['role', '一句话说清他是谁（身份 / 职业）'],
      ['want', '他想要什么？'],
      ['flaw', '他有什么毛病或软肋？'],
      ['tie', '和谁关系最深？（可留空）'],
    ],
    build: (answers) => [
      { type: 'text', title: '概览', text: `${answers.name}——${answers.role}。${answers.want ? `想要：${answers.want}。` : ''}` },
      { type: 'text', title: '性格与软肋', text: answers.flaw || '' },
      { type: 'callout', title: '可以用的钩子', text: answers.want ? `把"${answers.want}"推到极端，他会做什么？` : '' },
      { type: 'text', title: '关系', text: answers.tie ? `与「${answers.tie}」关系最深。` : '' },
    ],
  },
  {
    key: 'location', label: '地点', icon: 'map-pin',
    blurb: '一个地方：长什么样、谁在这儿、藏着什么。',
    questions: [
      ['name', '它叫什么？'],
      ['look', '一眼看过去是什么样？'],
      ['who', '谁在这里出没？'],
      ['secret', '这里藏着什么秘密？'],
    ],
    build: (answers) => [
      { type: 'text', title: '概览', text: `${answers.name}：${answers.look || ''}` },
      { type: 'text', title: '谁在这里', text: answers.who || '' },
      { type: 'callout', title: '秘密', text: answers.secret || '' },
    ],
  },
  {
    key: 'event', label: '事件', icon: 'align',
    blurb: '一件发生过的事：什么时候、谁在场、留下了什么。',
    questions: [
      ['name', '发生了什么？'],
      ['when', '什么时候（年份 / 大致时间）'],
      ['who', '谁在场？'],
      ['after', '它改变了什么？'],
    ],
    build: (answers) => [
      { type: 'text', title: '概览', text: `${answers.name}（${answers.when || '时间待定'}）` },
      { type: 'text', title: '在场的人', text: answers.who || '' },
      { type: 'callout', title: '留下的影响', text: answers.after || '' },
    ],
  },
];

function guidedTemplatesDialog() {
  openModal('用模板新建', (body) => {
    body.appendChild(el('p', 'hint', '挑一个模板，回答几个问题——它会直接铺成区块结构，之后随便改。'));
    const grid = el('div', 'guide-grid');
    GUIDED_TEMPLATES.forEach((template) => {
      const card = el('button', 'guide-card');
      card.type = 'button';
      const art = el('div', 'gc-art');
      art.appendChild(icon(template.icon, 22));
      card.appendChild(art);
      card.appendChild(el('b', null, template.label));
      card.appendChild(el('span', null, template.blurb));
      card.addEventListener('click', () => guidedQuestions(template));
      grid.appendChild(card);
    });
    body.appendChild(grid);
    const actions = el('div', 'form-row');
    actions.appendChild(button('从空白卡片开始', '', async () => {
      const type = S.types.find((t) => !t.hidden) || S.types[0];
      const created = await api('/api/world/documents', {
        method: 'POST', body: { type: 'card', name: '未命名卡片', entity_type: type ? type.id : null },
      });
      closeModal();
      await reloadTree();
      openDoc(created.id);
    }));
    body.appendChild(actions);
  });
}

function guidedQuestions(template) {
  openModal(`新建${template.label}`, (body) => {
    const inputs = {};
    template.questions.forEach(([key, label]) => {
      const wrap = el('div', 'guide-question');
      wrap.appendChild(el('label', null, label));
      const input = el('input', 'mini-input');
      input.dataset.key = key;
      wrap.appendChild(input);
      inputs[key] = input;
      body.appendChild(wrap);
    });
    const actions = el('div', 'form-row');
    const create = el('button', 'mini-btn is-primary', '创建');
    create.addEventListener('click', async () => {
      const answers = {};
      Object.entries(inputs).forEach(([key, input]) => { answers[key] = input.value.trim(); });
      if (!answers.name) { toast('先给它起个名字'); inputs.name.focus(); return; }
      create.disabled = true;
      const type = S.types.find((t) => !t.hidden) || S.types[0];
      const created = await api('/api/world/documents', {
        method: 'POST',
        body: { type: 'card', name: answers.name, entity_type: type ? type.id : null },
      });
      const blocks = template.build(answers)
        .filter((block) => (block.text || '').trim() || block.title)
        .map((block, index) => ({ id: `b${index + 1}`, ...block }));
      await api(`/api/world/cards/${created.id}`, { method: 'PUT', body: { blocks } });
      closeModal();
      await reloadTree();
      openDoc(created.id);
      toast(`已按${template.label}模板建好，接着改就行`);
    });
    actions.appendChild(create);
    actions.appendChild(button('返回', '', () => guidedTemplatesDialog()));
    body.appendChild(actions);
    setTimeout(() => inputs.name && inputs.name.focus(), 60);
  });
}

/* ====================================================== 导入 / 导出面板 */
function download(url) {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60000);
}

async function exchangeDialog() {
  const current = activeDocument();
  openModal('导入 / 导出', (body) => {
    body.appendChild(el('p', 'hint',
      '导出是 Markdown 为主、JSON 为完整备份；导入支持 Markdown 单文件 / 多个文件 / zip（Obsidian 目录也行），'
      + '`[[双链]]` 会尽量接成卡片链接。'));

    // ---------------- 导出 ----------------
    body.appendChild(el('h4', 'form-title', '导出'));
    const exportRow = el('div', 'form-row');
    exportRow.appendChild(button('整个世界（zip）', 'Markdown + world.json 备份', () => {
      download('/api/world/export');
      toast('正在打包整个世界…');
    }));
    exportRow.appendChild(button('世界备份（JSON）', '可以用下面的导入原样还原', () => {
      download('/api/world/export?format=json');
      toast('正在导出世界备份…');
    }));
    if (current) {
      exportRow.appendChild(button(`当前文档 Markdown`, current.name, () => {
        download(`/api/world/documents/${current.id}/export`);
        toast(`正在导出「${current.name}」…`);
      }));
      exportRow.appendChild(button('当前文档 JSON', '给脚本用', () => {
        download(`/api/world/documents/${current.id}/export?format=json`);
      }));
    }
    body.appendChild(exportRow);

    // ---------------- 导入 ----------------
    body.appendChild(el('h4', 'form-title', '导入'));
    const pickRow = el('div', 'form-row');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.md,.markdown,.txt,.json,.zip';
    fileInput.style.display = 'none';
    body.appendChild(fileInput);
    pickRow.appendChild(button('选择文件…', 'Markdown / txt / json / zip', () => fileInput.click()));
    const scope = el('select', 'mini-select');
    [['', '导入到顶层'], ['current', '导入到当前文档下']].forEach(([value, label]) => {
      const option = el('option', null, label);
      option.value = value;
      scope.appendChild(option);
    });
    pickRow.appendChild(scope);
    body.appendChild(pickRow);

    const drop = el('div', 'drop-zone', '把 Markdown / zip 拖到这里，或者直接粘贴到下面');
    body.appendChild(drop);
    const paste = el('textarea', 'comment-input');
    paste.rows = 5;
    paste.placeholder = '# 一个新文档\n\n## 概览\n\n正文…（也可以粘 Obsidian 的笔记）';
    body.appendChild(paste);

    let pendingFiles = [];
    const fileLabel = el('p', 'hint', '');
    body.appendChild(fileLabel);
    const setFiles = (files) => {
      pendingFiles = files;
      fileLabel.textContent = files.length
        ? `待导入 ${files.length} 个文件：${files.slice(0, 4).map((f) => f.name).join('、')}${files.length > 4 ? '…' : ''}`
        : '';
    };
    fileInput.addEventListener('change', () => setFiles(Array.from(fileInput.files || [])));
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', (event) => {
      const items = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
      if (items.length) setFiles(items);
    });

    const actions = el('div', 'form-row');
    const runImport = el('button', 'mini-btn is-primary', '开始导入');
    runImport.addEventListener('click', async () => {
      const parent = scope.value === 'current' && current ? current.id : null;
      runImport.disabled = true;
      runImport.textContent = '导入中…';
      try {
        let data;
        if (pendingFiles.length) {
          const form = new FormData();
          pendingFiles.forEach((file) => form.append('files', file, file.name));
          if (parent) form.append('parent', String(parent));
          data = await api('/api/world/import', { method: 'POST', form });
        } else if (paste.value.trim()) {
          data = await api('/api/world/import', { method: 'POST', body: { markdown: paste.value, parent } });
        } else {
          toast('先选文件或粘一段 Markdown');
          runImport.disabled = false;
          runImport.textContent = '开始导入';
          return;
        }
        const summary = data.summary || { created: 0, folders: 0 };
        toast(`导入完成：${summary.created} 份文档${summary.folders ? ` · ${summary.folders} 个文件夹` : ''}`);
        closeModal();
        await reloadTree();
        if (summary.documents && summary.documents.length) openDoc(summary.documents[0].id);
      } catch (error) {
        toast('导入失败，看看文件是不是 UTF-8 文本');
        runImport.disabled = false;
        runImport.textContent = '开始导入';
      }
    });
    actions.appendChild(runImport);
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/* ========================================================== 值得添加（建议） */
async function suggestionsDialog() {
  const data = await api('/api/world/suggestions');
  openModal('值得添加', (body) => {
    if (!S.world || S.world.ai_enabled === false) {
      body.appendChild(el('p', 'hint', '智能建议是关着的（世界设置里打开「AI 功能」即可）。这里只做本地规则统计，不会把内容发到任何地方。'));
    }
    const section = (title, hint, rows, render) => {
      if (!rows.length) return;
      body.appendChild(el('h4', 'form-title', `${title} · ${rows.length}`));
      if (hint) body.appendChild(el('p', 'hint', hint));
      const list = el('div', 'suggest-list');
      rows.slice(0, 12).forEach((row) => list.appendChild(render(row)));
      body.appendChild(list);
    };

    const type = S.types.find((t) => !t.hidden) || S.types[0];
    section('提到了但还没有卡片', '正文里反复出现的名字，点一下就建成卡片', data.entities || [], (item) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, item.name));
      row.appendChild(el('span', 'hint', `${item.count} 次 · 出现在《${item.where}》`));
      const create = el('button', 'mini-btn is-primary is-small', `建为${type ? type.name : '卡片'}`);
      create.addEventListener('click', async () => {
        const created = await api('/api/world/documents', {
          method: 'POST', body: { type: 'card', name: item.name, entity_type: type ? type.id : null },
        });
        toast(`已创建「${created.name}」`);
        await reloadTree();
        closeModal();
        await suggestionsDialog();
      });
      row.appendChild(create);
      return row;
    });

    section('空壳卡片', '建好了但没写内容', data.empty_cards || [], (item) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, item.name));
      row.appendChild(el('span', 'hint', '还没有正文'));
      const open = el('button', 'mini-btn is-small', '去写');
      open.addEventListener('click', () => { closeModal(); openDoc(item.id); });
      row.appendChild(open);
      return row;
    });

    section('没人引用的文档', '正文和事件里都没有提到它', data.orphans || [], (item) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, item.name));
      row.appendChild(el('span', 'hint', DOC_LABEL[item.type] || item.type));
      const open = el('button', 'mini-btn is-small', '打开');
      open.addEventListener('click', () => { closeModal(); openDoc(item.id); });
      row.appendChild(open);
      return row;
    });

    section('没关联卡片的事件', '时间线上还没链到任何卡片', (data.events || []), (item) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, item.title));
      row.appendChild(el('span', 'hint', item.when));
      const open = el('button', 'mini-btn is-small', '打开时间线');
      open.addEventListener('click', () => { closeModal(); openDoc(item.document); });
      row.appendChild(open);
      return row;
    });

    const actions = el('div', 'form-row');
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/* ====================================================== 响应式（尺寸档位） */
/** 按宽度给 <html> 打档位，并处理"窄屏侧栏变抽屉、面板只留一个"。 */
function applyResponsive() {
  const width = window.innerWidth;
  const size = width >= 1440 ? 'xl' : width >= 1200 ? 'lg' : width >= 900 ? 'md' : width >= 640 ? 'sm' : 'xs';
  document.documentElement.dataset.size = size;
  const sidebar = $('#sidebar');
  if (!sidebar) return;

  const isNarrow = width < 900;
  sidebar.classList.toggle('is-narrow', isNarrow);
  // 窄屏默认不展开抽屉；宽屏恢复用户上次的选择
  const stored = localStorage.getItem('ws:sidebar');
  if (isNarrow) {
    sidebar.classList.remove('is-open');
    sidebar.classList.remove('is-collapsed');
    removeSidebarBackdrop();
  } else {
    sidebar.classList.toggle('is-collapsed', stored === 'off');
  }
  // 窄屏只留一个面板，别把内容挤成两条
  if (isNarrow && S.panels.length > 1) {
    const keep = S.panels[0];
    S.panels = [keep];
    renderPanels();
  }
}

function removeSidebarBackdrop() {
  const existing = $('.sb-backdrop');
  if (existing) existing.remove();
}

/** 窄屏下侧栏是抽屉：打开时加一层可点的背景。 */
function openSidebarDrawer() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  sidebar.classList.add('is-open');
  if (!$('.sb-backdrop')) {
    const backdrop = el('div', 'sb-backdrop');
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      removeSidebarBackdrop();
    });
    document.body.appendChild(backdrop);
  }
}

function closeSidebarDrawer() {
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.remove('is-open');
  removeSidebarBackdrop();
}

/** 侧栏收起 / 展开（⌘B，和 VVD 的 toggle sidebar 对齐）。 */

function toggleSidebar() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('is-narrow')) {
    // 窄屏：抽屉式开关
    const opening = !sidebar.classList.contains('is-open');
    if (opening) openSidebarDrawer(); else closeSidebarDrawer();
    const drawerBtn = $('#sidebarBtn');
    if (drawerBtn) drawerBtn.classList.toggle('is-on', opening);
    return;
  }
  const hidden = sidebar.classList.toggle('is-collapsed');
  localStorage.setItem('ws:sidebar', hidden ? 'off' : 'on');
  const button = $('#sidebarBtn');
  if (button) {
    button.classList.toggle('is-on', !hidden);
    button.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }
}

const DEFAULT_KEYMAP = {
  palette: { combo: 'mod+k', label: '命令面板 / 搜索' },
  undo: { combo: 'mod+z', label: '撤销' },
  redo: { combo: 'mod+shift+z', label: '重做' },
  shortcuts: { combo: 'mod+/', label: '快捷键一览' },
  sidebar: { combo: 'mod+b', label: '收起 / 展开侧栏' },
  reopen: { combo: 'mod+alt+t', label: '重新打开刚关掉的标签' },
  version: { combo: 'mod+alt+h', label: '当前文档的版本历史' },
  suggest: { combo: 'mod+alt+s', label: '看看值得添加什么' },
};

function keymap() {
  if (!S.keymap) {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('ws:keymap') || '{}'); } catch (error) { stored = {}; }
    S.keymap = { ...DEFAULT_KEYMAP, ...stored };
  }
  return S.keymap;
}

/** 把键盘事件归一成 "mod+shift+z" 这样的串，好比较也好显示。 */
function comboOf(event) {
  const parts = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  const key = (event.key || '').toLowerCase();
  if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

function comboLabel(combo) {
  return combo.split('+').map((part) => ({
    mod: '⌘', alt: '⌥', shift: '⇧', space: '空格', escape: 'Esc', enter: '↵',
  }[part] || part.toUpperCase())).join('');
}

function matchesShortcut(event, id) {
  const entry = keymap()[id];
  return Boolean(entry && comboOf(event) === entry.combo);
}

function saveKeymap(patch) {
  S.keymap = { ...keymap(), ...patch };
  const custom = {};
  Object.entries(S.keymap).forEach(([id, entry]) => {
    if (DEFAULT_KEYMAP[id] && entry.combo !== DEFAULT_KEYMAP[id].combo) custom[id] = entry;
  });
  localStorage.setItem('ws:keymap', JSON.stringify(custom));
}

function shortcutEditorDialog() {
  openModal('快捷键设置', (body) => {
    body.appendChild(el('p', 'hint', '点「改」然后按下新的组合键。浏览器占用的组合（比如 ⌘W）可能不生效。'));
    const list = el('div', 'shortcut-list');
    const render = () => {
      list.innerHTML = '';
      Object.entries(keymap()).forEach(([id, entry]) => {
        const row = el('div', 'shortcut-row');
        row.appendChild(el('span', 'sc-group', id === 'undo' || id === 'redo' ? '编辑' : '通用'));
        row.appendChild(el('span', 'sc-what', entry.label));
        row.appendChild(el('kbd', 'sc-key', comboLabel(entry.combo)));
        const change = el('button', 'mini-btn is-small', '改');
        change.addEventListener('click', () => {
          change.textContent = '按下…';
          const capture = (event) => {
            event.preventDefault();
            const combo = comboOf(event);
            const last = combo.split('+').pop();
            if (!combo || ['mod', 'alt', 'shift'].includes(last)) return;   // 只有修饰键，等真正的按键
            saveKeymap({ [id]: { ...entry, combo } });
            document.removeEventListener('keydown', capture, true);
            render();
            toast(`「${entry.label}」现在是 ${comboLabel(combo)}`);
          };
          document.addEventListener('keydown', capture, true);
        });
        row.appendChild(change);
        list.appendChild(row);
      });
    };
    render();
    body.appendChild(list);
    const actions = el('div', 'form-row');
    actions.appendChild(button('恢复默认', '', () => {
      localStorage.removeItem('ws:keymap');
      S.keymap = null;
      render();
      toast('已恢复默认快捷键');
    }));
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

const SHORTCUTS = [
  ['通用', '⌘K', '命令面板 / 搜索'],
  ['通用', '⌘Z', '撤销'],
  ['通用', '⇧⌘Z', '重做'],
  ['通用', '⌘/', '快捷键一览'],
  ['通用', 'Esc', '关闭浮层'],
  ['导航', '⌘B', '收起 / 展开侧栏'],
  ['导航', '⌘1…9', '切换到第 N 个标签'],
  ['导航', '⌥⌘T', '重新打开刚关掉的标签'],
  ['编辑', '⌘B', '加粗（在正文里）'],
  ['编辑', '⌘I', '斜体（在正文里）'],
  ['编辑', '⌘U', '下划线（在正文里）'],
  ['编辑', '/', '插入区块（正文行首）'],
  ['编辑', '@', '关联卡片'],
  ['编辑', '⌘↵', '发送评论'],
  ['地图', '拖拽', '平移画布'],
  ['地图', '滚轮 / 触控板', '左右移动时间轴'],
  ['地图', '⌘ + 滚轮', '缩放'],
];

function shortcutsDialog() {
  openModal('快捷键', (body) => {
    const searchBox = el('input', 'mini-input');
    searchBox.placeholder = '搜索快捷键…';
    body.appendChild(searchBox);
    const list = el('div', 'shortcut-list');
    const render = (query = '') => {
      list.innerHTML = '';
      SHORTCUTS.filter(([, key, what]) => !query
        || key.toLowerCase().includes(query) || what.includes(query)).forEach(([group, key, what]) => {
        const row = el('div', 'shortcut-row');
        row.appendChild(el('span', 'sc-group', group));
        row.appendChild(el('span', 'sc-what', what));
        row.appendChild(el('kbd', 'sc-key', key));
        list.appendChild(row);
      });
    };
    searchBox.addEventListener('input', () => render(searchBox.value.trim().toLowerCase()));
    render();
    body.appendChild(list);
    const actions = el('div', 'form-row');
    actions.appendChild(button('自定义快捷键…', '可以改键位', () => shortcutEditorDialog(), true));
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/* ========================================================== 撤销历史 */
async function undoHistoryDialog() {
  openModal('撤销历史', (body) => {
    if (!UNDO.stack.length && !UNDO.redo.length) {
      body.appendChild(emptyBlock({
        iconName: 'arrow-left',
        title: '还没有可以撤销的编辑',
        text: '改动正文、拖拽区块、改属性之后，这里会记下每一步。',
      }));
    }
    const list = el('div', 'suggest-list');
    [...UNDO.stack].reverse().forEach((action, index) => {
      const row = el('div', 'suggest-row');
      row.appendChild(el('b', null, action.label));
      row.appendChild(el('span', 'hint', `${action.name} · 第 ${UNDO.stack.length - index} 步`));
      const jump = el('button', 'mini-btn is-small', '撤销到这一步');
      jump.addEventListener('click', async () => {
        const steps = index + 1;
        for (let i = 0; i < steps; i += 1) await undoLast();
        closeModal();
      });
      row.appendChild(jump);
      list.appendChild(row);
    });
    body.appendChild(list);
    if (UNDO.redo.length) {
      body.appendChild(el('h4', 'form-title', `可重做 · ${UNDO.redo.length}`));
      body.appendChild(el('p', 'hint', UNDO.redo.map((a) => a.label).slice(-6).reverse().join(' · ')));
    }
    const actions = el('div', 'form-row');
    actions.appendChild(button('全部撤销', '', async () => {
      while (UNDO.stack.length) await undoLast();
      closeModal();
    }));
    actions.appendChild(button('关闭', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/** 世界设置：改名 / 简介 / 题材 / AI 与自动识别开关（点左上角世界名牌打开）。 */
async function worldDialog() {
  const world = await api('/api/world/world');
  openModal('世界设置', (body) => {
    const field = (label, node, hint) => {
      const row = el('div', 'form-row');
      row.appendChild(el('label', null, label));
      row.appendChild(node);
      if (hint) row.appendChild(el('span', 'hint', hint));
      return row;
    };
    const name = el('input', 'mini-input');
    name.value = world.name;
    body.appendChild(field('名称', name));

    const description = el('input', 'mini-input');
    description.value = world.description || '';
    description.placeholder = '一句话简介（会显示在发布站点的首页）';
    body.appendChild(field('简介', description));

    const genres = el('input', 'mini-input');
    genres.value = (world.genres || []).join(', ');
    genres.placeholder = 'dark-fantasy, sci-fi';
    body.appendChild(field('题材', genres, '逗号分隔'));

    const ai = el('input');
    ai.type = 'checkbox';
    ai.checked = world.ai_enabled;
    body.appendChild(field('AI 功能', ai, '实体识别与建议'));

    const auto = el('input');
    auto.type = 'checkbox';
    auto.checked = world.auto_link_enabled;
    body.appendChild(field('名字自动识别', auto, '正文里出现已存在的名字会自动变成链接'));

    const actions = el('div', 'form-row');
    const save = el('button', 'mini-btn is-primary', '保存');
    save.addEventListener('click', async () => {
      const updated = await api('/api/world/world', {
        method: 'PUT',
        body: {
          name: name.value.trim() || world.name,
          description: description.value.trim(),
          genres: genres.value.split(',').map((g) => g.trim()).filter(Boolean),
          ai_enabled: ai.checked,
          auto_link_enabled: auto.checked,
        },
      });
      S.world = updated;
      applyTheme(updated.theme);
      $('#worldName').textContent = updated.name;
      $('#worldAvatar').textContent = (updated.name || 'W').trim().charAt(0).toUpperCase();
      document.title = `${updated.name} · 世界工作区`;
      closeModal();
      toast('世界设置已保存');
      renderPanels();
    });
    actions.appendChild(save);
    actions.appendChild(button('主题外观…', '', () => { closeModal(); themeDialog(); }));
    actions.appendChild(button('分享与发布…', '', () => { closeModal(); publishDialog(); }));
    body.appendChild(actions);
  });
}

/* ================================================================ 主题面板 */
async function themeDialog() {
  const theme = S.world.theme;
  openModal('世界主题', (body) => {
    const field = (label, node) => {
      const row = el('div', 'form-row');
      row.appendChild(el('label', null, label));
      row.appendChild(node);
      return row;
    };
    const heading = el('input', 'mini-input');
    heading.value = theme.headingFont || '';
    body.appendChild(field('标题字体', heading));
    const bodyFont = el('input', 'mini-input');
    bodyFont.value = theme.bodyFont || '';
    body.appendChild(field('正文字体', bodyFont));
    const color = el('input', 'mini-input');
    color.type = 'color';
    color.value = theme.primaryColor || '#3f3416';
    color.style.maxWidth = '80px';
    body.appendChild(field('主色', color));
    const grain = el('input', 'mini-input');
    grain.type = 'number';
    grain.value = theme.grain;
    grain.style.maxWidth = '90px';
    body.appendChild(field('颗粒', grain));
    const background = el('input', 'mini-input');
    background.value = theme.background || '';
    background.placeholder = '背景图地址（可留空）';
    body.appendChild(field('背景图', background));

    const save = el('button', 'mini-btn is-primary', '保存主题');
    save.addEventListener('click', async () => {
      const theme_config = {
        ...theme,
        headingFont: heading.value.trim(),
        bodyFont: bodyFont.value.trim(),
        primaryColor: color.value,
        grain: Number(grain.value) || 0,
        background: background.value.trim(),
      };
      await saveWorldTheme(theme_config);
      closeModal();
    });
    body.appendChild(save);
    body.appendChild(el('p', 'hint', '这四个值（标题字体 / 正文字体 / 主色 / 颗粒）就是官网 §16.1 里 theme_config 的可见部分。'));
  });
}

async function saveWorldTheme(theme) {
  const world = await api('/api/world/world', { method: 'PUT', body: { theme_config: theme } });
  S.world = world;
  applyTheme(world.theme);
  toast('主题已保存');
}

/* ================================================================== 启动 */
decorateChrome();
applyResponsive();
window.addEventListener('resize', debounce('responsive', () => applyResponsive(), 160));
window.addEventListener('orientationchange', () => setTimeout(applyResponsive, 120));
bindEvents();
bindHistory();
boot().catch((error) => {
  console.error(error);
  toast('载入失败，请刷新重试', 3200);
});
