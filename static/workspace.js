/* ==========================================================================
   世界工作区  —  前端主脚本（/world 页面）
   --------------------------------------------------------------------------
   这是「世界工作区」页面在浏览器里跑的脚本。项目不用任何前端构建工具，
   没有打包、没有转译：浏览器直接加载这个文件，所以它按功能切成若干区块，
   每块用一条横线注释隔开，顺序从上到下大致是——
     常量 / 状态 / 工具函数 → 启动 → 文档树 → 标签与并排面板 → 卡片视图 →
     区块编辑 → 内联数据库 → 撤销重做 → 类型与选择器 → 时间线（含工具）→
     关系树 / 地图 / 世界图谱 → 分享发布 → 各类浮层（模态框 / 命令面板 / 右键菜单）→
     事件绑定与启动引导。

   组织方式（原生 JS，无框架）：
     · 状态集中在全局对象 S 里（世界、文档树、面板、待保存的改动……）；渲染函数只读 S
       并把内容画进 DOM，事件处理器先改 S、再调用渲染函数重画；
     · 事件尽量用委托：在容器上挂一个监听，靠事件目标判断点到了哪一行，避免每画一次
       节点就重新绑一遍；
     · 与后端只通过 JSON API 交互（api() 是统一入口），拿到的数据写回 S 再重画。

   核心数据流：state（S）→ 渲染（render*）→ 用户操作 → 改 S 并回写后端 → 再渲染。

   几个关键机制：
     · 乐观更新：先把改动上屏，再落库；失败时回滚并提示；
     · 自动保存：改动先防抖排队，到点写回后端；⌘S 可立刻把等待中的改动写回去；
     · 撤销 / 重做：每次写之前存一份整卡快照，用栈支持多步回退；
     · 并排面板：同一页面可放多组可拖拽面板，各自带一组标签页；
     · 名字自动识别：正文里写到别的卡片名字时自动变成链接，并记住别名；
     · 块编辑器：卡片正文由一个个「块」组成，支持斜杠菜单、@ 提及、拖拽排序。
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

/** 顶栏面包屑：当前面板激活页的图标 + 名字（对齐顶栏面包屑区域）。 */
function renderBreadcrumb() {
  const box = $('#tbCrumb');
  if (!box) return;
  const panel = S.panels[0];
  const id = panel && panel.tabs.length ? panel.tabs[panel.active] : null;
  const entry = (id === null || id === undefined) ? null : S.docs.get(id);
  if (!entry) { box.hidden = true; return; }
  const doc = entry.document || {};
  const iconBox = $('#crumbIcon');
  if (iconBox) { iconBox.innerHTML = ''; iconBox.appendChild(docIcon(doc.type, 15)); }
  const nameBox = $('#crumbName');
  if (nameBox) nameBox.textContent = doc.name || '未命名';
  box.hidden = false;
}

/** 「设置你的工作空间」进度卡：4 项检查由当前世界数据推导。 */
function renderSetupCard() {
  const list = $('#suList');
  if (!list) return;
  const all = [];
  const walk = (nodes) => (nodes || []).forEach((n) => { all.push(n); walk(n.children); });
  walk(S.tree);
  const has = (t) => all.some((d) => d && d.type === t);
  const checks = [
    ['建第一张卡片', has('card')],
    ['建一条时间线', has('timeline')],
    ['建一张世界地图', has('map')],
    ['发布只读站点', !!(S.world && S.world.published)],
  ];
  const done = checks.filter((c) => c[1]).length;
  const count = $('#suCount');
  if (count) count.textContent = `${done} / ${checks.length}`;
  const bar = $('#suBar');
  if (bar) bar.style.width = `${Math.round((done / checks.length) * 100)}%`;
  list.innerHTML = '';
  checks.forEach(([label, ok]) => list.appendChild(el('span', ok ? 'is-done' : null, label)));
}
const VT_LABEL = {
  text: '文本', select: '单选', multiselect: '多选', number: '数字',
  date: '日期', reference: '引用', formula: '公式',
};
// 属性类型的一句话说明：属性名旁的类型小标签 hover / 聚焦时浮出来
const VT_HINT = {
  text: '自由文本。正文里写到别的卡片名字会自动变成链接。',
  select: '从类型里预先定义好的选项里挑一个。',
  multiselect: '可以同时选多个选项，按标签显示。',
  number: '数字。编辑时可以用上下箭头微调。',
  date: '日期，按这个世界当前纪元的历法显示。',
  reference: '指向另一张卡片：名字会自动补全，改名字这里跟着变。',
  formula: '公式：引用其他属性算出一个值，等宽字体显示。',
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
  worlds: [],          // 我能进的世界（侧栏"我的世界"菜单用）
  tree: [],            // 根文档（含 children）
  docs: new Map(),     // docId -> 详情（document + card / timeline 状态）
  panels: [{ tabs: [], active: -1 }],
  collapsed: new Set(),
  filter: '',
  pending: new Map(),  // 防抖保存（key -> timer）
  pendingFns: new Map(),  // key -> 待执行的保存函数（⌘S 立即落库用）
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
  S.pending.set(key, setTimeout(() => { S.pending.delete(key); S.pendingFns.delete(key); fn(); }, wait));
  // 连函数本体一起记下来：⌘S 要能把这些"还在等"的改动立刻写回去
  if (!S.pendingFns) S.pendingFns = new Map();
  S.pendingFns.set(key, fn);
};

/** 把还在等防抖的改动立刻落库（⌘S）。没有等待中的改动就如实说一声。 */
function flushPending() {
  const keys = Array.from(S.pending.keys());
  keys.forEach((key) => {
    clearTimeout(S.pending.get(key));
    S.pending.delete(key);
    const fn = S.pendingFns ? S.pendingFns.get(key) : null;
    if (S.pendingFns) S.pendingFns.delete(key);
    try { if (fn) fn(); } catch (error) { /* 一处失败不拦其它 */ }
  });
  if (!keys.length) toast('没有等待中的改动，都已经落库了', 1800);
  else toast(`已经写回 ${keys.length} 处改动`, 1800);
  return keys.length;
}
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
  // 底部那条"还剩多久"的进度线（polish.css）按真实时长走，别写死
  box.style.setProperty('--pf-toast-ms', `${ms}ms`);
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

/** 把一份 card payload 摊成"能逐行比的行"。 */
function cardLines(card) {
  const lines = [];
  ((card && card.blocks) || []).forEach((block) => {
    if (block.title) lines.push(`# ${block.title}`);
    const text = (block.text || '').replace(/\r/g, '');
    if (text) text.split('\n').forEach((line) => lines.push(line));
    if (!block.title && !text) lines.push('');
  });
  return lines.length ? lines : ['（空）'];
}

/** 两份文本的行级 diff：返回 [{text, kind}]，kind = same|mine|theirs。 */
function lineDiff(mine, theirs) {
  const rows = [];
  const mineSet = new Set(mine);
  const theirsSet = new Set(theirs);
  const max = Math.max(mine.length, theirs.length);
  for (let i = 0; i < max; i += 1) {
    const a = mine[i];
    const b = theirs[i];
    if (a === b) { if (a !== undefined) rows.push({ text: a, kind: 'same' }); continue; }
    if (a !== undefined) rows.push({ text: a, kind: mineSet.has(a) && !theirsSet.has(a) ? 'mine' : 'same' });
    if (b !== undefined) rows.push({ text: b, kind: theirsSet.has(b) && !mineSet.has(b) ? 'theirs' : 'same' });
  }
  return rows;
}

/** 409 冲突：并排看两个版本，自己选，别默默把谁的内容丢掉。
 *
 * 先弹窗（**不动本地内容**），三个出口——
 *   采用服务端版本 / 保留我的版本（用服务端的新修订号把我的重新写上去）/ 手动合并（把我的复制到剪贴板）。 */
function handleConflict(payload, retry) {
  const entry = payload && payload.document ? S.docs.get(payload.document.id) : null;
  const serverRevision = payload ? payload.revision : undefined;
  const mineCard = retry && retry.body ? retry.body : null;
  const theirsCard = payload ? payload.card : null;

  const adoptServer = (message) => {
    if (entry) {
      if (theirsCard) entry.card = theirsCard;
      if (payload.document) entry.document = payload.document;
      entry.revision = serverRevision;
      renderPanels();
    }
    if (message) toast(message, 2600);
    announce('已采用服务端最新版本');
  };

  // 只有卡片正文冲突才值得并排看；其它字段（别名、属性值）直接给两个按钮
  const canDiff = !!(mineCard && mineCard.blocks && theirsCard && theirsCard.blocks);
  openModal('这份文档刚被别人改过', (body) => {
    body.appendChild(el('p', 'hint',
      '你改的时候别人也存了一版。选一个：用他的、用你的，或者手动合并（会先把你的版本复制到剪贴板）。'));

    if (canDiff) {
      const grid = el('div', 'conflict-grid');
      const column = (title, rows, side) => {
        const box = el('div', 'conflict-col');
        box.appendChild(el('b', null, title));
        const pre = el('div', 'conflict-body');
        rows.forEach((row) => {
          const line = el('div', `conflict-line is-${row.kind}`, row.text || ' ');
          pre.appendChild(line);
        });
        box.appendChild(pre);
        box.dataset.side = side;
        return box;
      };
      const diff = lineDiff(cardLines(mineCard), cardLines(theirsCard));
      grid.appendChild(column('你的版本', diff.filter((r) => r.kind !== 'theirs'), 'mine'));
      grid.appendChild(column('服务端最新', diff.filter((r) => r.kind !== 'mine'), 'theirs'));
      body.appendChild(grid);
    }

    const actions = el('div', 'form-row');
    const keepMine = button('保留我的版本', '用你的内容覆盖，修订号跟着服务端走', async () => {
      adoptServer();
      closeModal();
      if (!retry || !mineCard) return;
      try {
        const saved = await api(retry.path, {
          method: retry.method || 'PUT',
          body: { ...mineCard, revision: serverRevision },
        });
        applyCardResponse(entry, saved);
        renderPanels();
        toast('已保留你的版本', 2400);
        announce('已用你的版本覆盖');
      } catch (error) {
        if (!error || !error.isConflict) toast('这次没写进去，再试一次', 3000);
      }
    });
    keepMine.classList.add('is-primary');

    const useServer = button('采用服务端版本', '', () => {
      adoptServer('已采用服务端最新版本');
      closeModal();
    });

    const manual = button('手动合并', '把你的版本复制到剪贴板，编辑区换成服务端版本', async () => {
      const text = cardLines(mineCard).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        adoptServer();
        closeModal();
        toast('你的版本已复制到剪贴板，编辑区是服务端版本，粘回去合并', 4200);
        announce('你的版本已复制到剪贴板');
      } catch (error) {
        // 剪贴板被拒：别关窗，把文本摊在弹层里让人自己复制
        toast('复制失败，请手动选中弹层里的文字', 3200);
      }
    });

    actions.appendChild(keepMine);
    actions.appendChild(useServer);
    actions.appendChild(manual);
    body.appendChild(actions);
  });
  return payload;
}

async function api(path, { method = 'GET', body, form } = {}) {
  // 写操作统一闸门：只读时不用发请求，直接提示（服务端也会拦，这里是体验层）
  const writing = method !== 'GET'
    && !path.startsWith('/api/world/auth/') && !path.startsWith('/api/world/presence');
  if (writing) {
    if (!guardWrite()) {
      // 只读拦下来的写请求：提示已经弹过了，这里标记一下，让全局处理器安静吞掉
      const blocked = new Error('read-only');
      blocked.isReadonly = true;
      throw blocked;
    }
    // 有未落库的改动 -> 标记 dirty：离线/关页面之前会问一声。
    // 保存成功再标 saved，beforeunload 的监听就自动失效了。
    document.dispatchEvent(new CustomEvent('opus:dirty'));
    markOfflineQueue(1);
  }
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: form ? {} : (body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: form ? form : (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (error) {
    // 网络层挂了：写操作先**排队**，联网后由体验层按顺序补写；
    // 读操作也得吭一声，别让人对着一个空面板猜。给一个「重试」的动作。
    error.isSurfaced = true;
    noteApiFailure(0);
    if (writing) {
      offlineWriteQueued = Boolean(typeof Opus !== 'undefined' && Opus.offline && !form
        && Opus.offline.enqueue({ path, method, body }));
      document.dispatchEvent(new CustomEvent('opus:offline-write'));
    }
    else if (Date.now() - (api._lastNetToast || 0) > 6000) {
      api._lastNetToast = Date.now();
      toast(navigator.onLine ? '加载失败，请检查网络连接' : '网络断了，恢复之后刷新这一页', {
        kind: 'err', action: () => location.reload(), actionLabel: '重试',
      });
    }
    throw error;
  }
  let payload = null;
  try { payload = await response.json(); } catch (e) { payload = null; }
  if (writing) {
    markOfflineQueue(-1);
    if (response.ok) document.dispatchEvent(new CustomEvent('opus:saved'));
  }
  if (response.status === 409 && payload && payload.conflict) {
    handleConflict(payload, { path, method, body });
    const conflict = new Error(payload.error || '这份文档刚被别人改过');
    conflict.isConflict = true;          // 冲突是正常情况，调用方安静处理，别冒泡成未捕获异常
    throw conflict;
  }
  if (!response.ok) {
    const message = (payload && payload.error) || `请求失败（${response.status}）`;
    if (writing) document.dispatchEvent(new CustomEvent('opus:write-error'));
    toast(message, 2600);
    noteApiFailure(response.status);
    throw new Error(message);
  }
  api._failures = 0;
  return payload;
}

/** 连续失败计数：网络层挂了或者服务端在报错，连着三次就别再一条条刷提示了，
 *  直接说"看起来是服务端的问题"。成功一次就清零。 */
function noteApiFailure(status) {
  if (status >= 400 && status < 500) return;         // 4xx 是"你这条请求有问题"，不算服务端故障
  api._failures = (api._failures || 0) + 1;
  if (api._failures === 3) {
    toast('连着几次都没成功，可能是服务端的问题——稍后再试，或者看一下维护说明', {
      kind: 'warn', ms: 6000, actionLabel: '维护说明', action: () => { location.href = '/maintenance'; },
    });
  }
}

/** 在飞的写请求数（只给"正在写"这类状态兜底）。
 *  真正的"待同步"是体验层的离线队列（`Opus.offline.entries`），别再混为一谈。 */
let IN_FLIGHT_WRITES = 0;
let offlineWriteQueued = false;
function markOfflineQueue(delta) {
  IN_FLIGHT_WRITES = Math.max(0, IN_FLIGHT_WRITES + delta);
  if (typeof Opus !== 'undefined' && Opus.offline) Opus.offline.refresh();
}

/* ----------------------------------------------------------------- 主题 */
function applyTheme(theme) {
  const root = document.documentElement.style;
  if (!theme) return;
  // 外壳只有一套暗色形态，嵌入的画布必须同色，
  // 否则工作区里会嵌着一块奶油色的 iframe。世界主题显式设成 light 时仍然尊重它。
  const forcedMode = theme.mode === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = forcedMode;
  if (theme.primaryColor) {
    root.setProperty('--primary', theme.primaryColor);
    root.setProperty('--primary-ink', readableInk(theme.primaryColor));
  }
  if (theme.headingFont) root.setProperty('--heading-font', `"${theme.headingFont}", "Songti SC", Georgia, serif`);
  if (theme.bodyFont) root.setProperty('--body-font', `"${theme.bodyFont}", "PingFang SC", system-ui, sans-serif`);
  // 颗粒噪点：终端语言里一律为 0（噪点污染等宽字的边缘）。世界主题的 grain 不再生效。
  root.setProperty('--grain', '0');
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

/** 用户是不是在系统里关掉了动效（那就别放过渡）。 */
function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    return false;
  }
}

/**
 * 换主题时走一次 View Transition：整页交叉溶解，而不是"啪"地一下换色。
 * 不支持的浏览器、重复触发、以及系统要求减少动效时，都直接切——没有副作用。
 */
function applyThemeAnimated(theme) {
  const start = document.startViewTransition;
  if (typeof start !== 'function' || prefersReducedMotion() || applyThemeAnimated._busy) {
    applyTheme(theme);
    return;
  }
  applyThemeAnimated._busy = true;
  const done = () => { applyThemeAnimated._busy = false; };
  try {
    const transition = start.call(document, () => applyTheme(theme));
    if (transition && transition.finished && transition.finished.then) {
      transition.finished.then(done, done);
    } else {
      done();
    }
  } catch (error) {
    done();
    applyTheme(theme);
  }
}

/* ----------------------------------------------------------------- 启动 */
/* 只读被拦、编辑冲突都是预期情况：界面上已经提示过，不该再冒到控制台 */
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason && (reason.isReadonly || reason.isConflict || reason.isSurfaced)) event.preventDefault();
});

async function boot() {
  // 深链指名道姓的那一篇：跟 /api/world/state **并行**取。
  // 若串行地"先等 state、再取详情、再取卡片"，卡片面板要等三个来回；
  // 地址栏里既然已经写了 id，就没有理由让这两件事排队。
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const embedId = Number(document.body.dataset.embedDoc || 0);
  const first = Number(hash.get('doc')) || embedId || null;
  const second = Number(hash.get('doc2')) || null;
  const preload = first ? fetchEntry(first).catch(() => null) : null;

  const data = await api(stateUrl());
  applyViewer(data.viewer);
  if (typeof Opus !== 'undefined' && Opus.session && data.session_expires_at) {
    Opus.session.check(data.session_expires_at);
  }
  refreshEraChip();
  renderPresence(data.online);
  startPresence();
  S.world = data.world;
  S.worlds = data.worlds || [];
  if (data.publish) {
    S.world.published = Boolean(data.publish.published);
    S.world.site_url = data.publish.url || '';
  }
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
  applyEmptyHint();

  // 深链：/w#doc=<id> 直接打开某份文档（截图与分享都用得上）
  if (first) {
    // 深链（含"上次打开的那一篇"）可能早就被删了。openDoc 遇到打不开的会安静地丢掉，
    // 这里再补一张能开的，别让人对着空面板、也别让整个启动失败。
    await openDoc(first, 0, { preloaded: preload });
    if (!S.panels[0].tabs.length && S.tree.length) await openDoc(firstOpenable(S.tree));
  } else if (S.tree.length) {
    // 自动打开一篇：但如果在等 state 的这段时间里地址栏已经被指到某一篇
    // （用户在启动过程中点了链接、或者改了 hash），那就听地址栏的——
    // 否则会把用户刚点开的那一篇顶掉：地址栏写着 A，面板里却是 B。
    const late = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const wanted = Number(late.get('doc')) || 0;
    await openDoc(wanted && findNode(wanted) ? wanted : firstOpenable(S.tree));
  }
  if (second) {
    // 并排面板：每个标签页各自带一组可拖拽面板
    S.panels.push({ tabs: [], active: -1 });
    S.pendingSqueeze = true;
    await openDoc(second, 1);
  }
  restoreViewState();          // 回到上次读到哪儿
  // 启动屏等这一句：数据到位、首屏画完才收
  document.dispatchEvent(new CustomEvent('opus:booted'));
  // 首次注册后走四步引导：空世界 + 还没走过才弹
  maybeStartOnboard();
}

/** 返回时恢复视图：体验层在 pagehide 里写了 opus.view，这里读回来。
 *  之前只写不读，等于白记。 */
function restoreViewState() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('opus.view') || 'null'); } catch (error) { saved = null; }
  if (!saved) return;
  const stage = $('#panels') || document.scrollingElement;
  const want = Number(saved.scrollTop || 0);
  if (!want) return;
  // 面板内容是异步渲染的：等两帧再滚，别滚了个寂寞
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = $('#panels') || document.scrollingElement;
    if (!target) return;
    target.scrollTop = want;
    if (saved.docId && !S.panels[0].tabs.includes(Number(saved.docId))) return;
    void stage;
  }));
}

/** 取一份文档的全部数据：详情 + （卡片 / 时间线）**并行**。
 *  串行取三个来回是白等的——它们之间没有依赖。 */
async function fetchEntry(id) {
  const known = findNode(id);
  const wantChildren = known && known.type === 'folder' ? '?children=1' : '';
  const detail = await api(`/api/world/documents/${id}${wantChildren}`);
  const entry = { document: detail, card: detail.card || null, timeline: null, type: null,
                  revision: detail.revision };
  const jobs = [];
  if (detail.type === 'timeline') {
    jobs.push(api(`/api/world/timelines/${id}`).then((timeline) => { entry.timeline = timeline; }));
  }
  if (detail.type === 'card') {
    jobs.push(api(`/api/world/cards/${id}`).then((payload) => {
      applyCardResponse(entry, payload);
      entry.type = payload.entity_type;
    }));
  }
  await Promise.all(jobs);
  return entry;
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

/** 从文档树里求出从顶层到该节点的整条路径（含自身）。找不到就返回 null。 */
function findPath(id, nodes = S.tree, trail = []) {
  for (const node of nodes) {
    const next = trail.concat(node);
    if (node.id === id) return next;
    const found = findPath(id, node.children || [], next);
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
  renderSetupCard();
  const host = $('#sbTree');
  host.innerHTML = '';
  const filter = S.filter.trim().toLowerCase();

  // 列表长了就截断，末尾给「⋯ 查看全部」
  const CAP = 26;
  let shown = 0;
  let capped = false;

  const pinned = [];
  const walk = (nodes, depth, parentMatched) => {
    for (const node of nodes) {
      if (capped) return;
      const selfMatch = !filter
        || node.name.toLowerCase().includes(filter)
        || (node.children || []).some((c) => c.name.toLowerCase().includes(filter));
      if (!selfMatch && !parentMatched) continue;
      if (node.pinned && depth === 0) pinned.push(node);
      if (!S.treeExpanded && !filter && shown >= CAP) { capped = true; return; }
      host.appendChild(treeRow(node, depth));
      shown += 1;
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
  if (capped) {
    const more = el('button', 'sb-more', '⋯ 查看全部');
    more.type = 'button';
    more.addEventListener('click', () => { S.treeExpanded = true; renderTree(); });
    host.appendChild(more);
  }
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

/** 从文档树打开一份文档：带一次"标题飞过去"的共享元素过渡。
 *
 * 三条纪律：
 *   · 只有**已经加载过**的文档才飞（没加载的要 await 接口，过渡期间 DOM 还没变，
 *     浏览器抓不到目标态，等于白飞）；
 *   · 不支持 View Transitions 或开了减少动效，直接打开；
 *   · 过渡结束一定把 view-transition-name 清掉——同名元素同时存在两张，
 *     浏览器会直接放弃整次过渡。
 */
/** 从文档树单开一篇。
 *
 * 这里**不用 View Transition**：过渡期间那一层快照在 Chrome 里是不可穿透的
 * （实测整段 elementFromPoint 都返回 <html>，pointer-events: none 也拦不住），
 * 而文档树是高频点击的地方——飞行没跑完时的点击会整个丢掉，
 * 表现就是"有些卡片点了没反应"。改成两个不挡输入的反馈：
 *   · 编辑区的扫描线（#xpSweep，独立元素）；
 *   · 新标题"落地"时收进去的一束翠绿光（Opus.switchFx.titleArrive）。
 * 只读站点那边是跨页跳转，冻结几百毫秒无所谓，仍然用真正的共享元素过渡。
 */
/** 飞行期间：起飞处 / 途经处的名字先让开。
 *
 *  用**状态 + CSS 类**而不是直接改 style：飞行途中文档树和标签栏都会被重画，
 *  直接改 style 是改在旧元素上，新画出来的那份照样显示名字（上一版就是这样白改的）。
 *  画的时候问一句 isFlying()，飞完再统一把类摘掉。
 */
function isFlying(docId, where) {
  if (!S.flight || S.flight.docId !== docId) return false;
  if (where && S.flight.where !== where) return false;
  return performance.now() < S.flight.until;
}

function startFlyAway(docId, ms, where) {
  const total = ms + 300;
  S.flight = { docId: docId, where: where || 'row', until: performance.now() + total };
  // 页面上**已经**画着的那一行也立刻打上：文档树不一定会重画（切到已加载的文档时
  // 只是更新一下高亮），只靠 isFlying() 在构建时判断会漏掉这一种。
  if (where !== 'tab') {
    const row = document.querySelector(`#sbTree .row[data-id="${docId}"]`);
    if (row) row.classList.add('is-fly-away');
  }
  setTimeout(() => {
    if (S.flight && S.flight.docId === docId) S.flight = null;
    $$('.is-fly-away').forEach((node) => node.classList.remove('is-fly-away'));
  }, total);
}

function openDocFromTree(node, row) {
  // 两段式飞行：先记下"从左侧栏哪一行起飞"，画完之后第一段飞到标签栏，
  // 第二段再从标签栏飞进编辑区的标题。
  if (row && typeof Opus !== 'undefined' && !Opus.reduced()) {
    startFlyAway(node.id, 480, 'row');     // 起点是树行：让这一行的名字先离开
    const label = row.querySelector('.r-name');
    const rect = (label || row).getBoundingClientRect();
    S.rowFlight = {
      panel: 0, docId: node.id, viaTab: true,
      text: (label || row).textContent.trim(),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      font: parseFloat(getComputedStyle(label || row).fontSize) || 12,
      color: getComputedStyle(row).color,
    };
  }
  openDoc(node.id, 0, { pushHistory: true, fromTree: true });
}

/** 双击文档树：并排分栏（双标签页）功能已去掉，就在当前面板打开。 */
async function openDocBeside(id) {
  await openDoc(id, 0);
  if (window.innerWidth < 900) closeSidebarDrawer();
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
  if (isFolder) row.classList.add('is-folder');
  iconBox.appendChild(docIcon(
    isFolder ? (S.collapsed.has(node.id) ? 'folder' : 'folder-open') : node.type, 15,
  ));
  if (!isFolder && node.entity_type) {
    const type = S.types.find((t) => t.id === node.entity_type);
    if (type && type.color) iconBox.style.color = colorFor(type.color);
  }
  row.appendChild(iconBox);
  row.appendChild(el('span', 'r-name', node.name));
  if (isFlying(node.id, 'row')) row.classList.add('is-fly-away');
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

  // 单击：在左面板打开。标题从树里"飞"进编辑区——
  // 只在文档已经加载过（没有 await）时才走 View Transition，否则直接开，别拿动画换一次卡顿。
  row.addEventListener('click', (event) => {
    if (event.detail > 1) return;              // 双击交给下面的处理器
    openDocFromTree(node, row);
  });
  // 双击：在右边并排打开一格，以点击位置为圆心径向铺开
  row.addEventListener('dblclick', (event) => {
    event.preventDefault();
    openDocBeside(node.id, event.clientX, event.clientY);
  });
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
  const data = await api(stateUrl());
  S.tree = data.documents;
  S.types = data.types;
  S.eras = data.eras;
  S.calendars = data.calendars;
  renderTree();
  applyEmptyHint();
}

/* ============================================================== 标签与面板 */
function activeDocument() {
  const panel = S.panels[0];
  if (!panel || panel.active < 0) return null;
  const id = panel.tabs[panel.active];
  const entry = S.docs.get(id);
  return entry ? entry.document : null;
}

async function openDoc(id, panelIndex = 0, { focus = true, pushHistory = true, preloaded = null, fromTree = false } = {}) {
  const panel = S.panels[panelIndex];
  if (!panel.tabs.includes(id)) panel.tabs.push(id);
  if (focus) panel.active = panel.tabs.indexOf(id);
  if (!S.docs.has(id)) {
    const known = findNode(id);
    // 骨架屏：先把这一格按类型画成占位块，再等接口回来。
    // 关键在"延迟显示"——renderPanels 里那块骨架挂的是 xp-skel-wait，
    // 400ms 内就到的话根本不会浮出来，不会闪。
    panel.loading = { id, type: known ? known.type : 'card' };
    if (focus) renderPanels();
    // preloaded：boot() 在等 state 的时候就已经在取这一篇了。
    // 拿到手要核对一下是不是同一份——地址栏可能在等待期间被改过。
    let entry = preloaded ? await preloaded : null;
    if (!entry || !entry.document || entry.document.id !== id
        || (known && known.type === 'folder' && !Array.isArray(entry.document.children))) {
      try {
        entry = await fetchEntry(id);
      } catch (error) {
        // 这一篇打不开了（被删、被移走）：别把一个坏标签页留在面板上，
        // 也别把异常冒到启动流程去——启动时恢复上次的标签页正好会走到这里。
        panel.tabs = panel.tabs.filter((tabId) => tabId !== id);
        if (panel.active >= panel.tabs.length) panel.active = panel.tabs.length - 1;
        panel.loading = null;
        renderPanels();
        renderTree();
        return;
      }
    }
    S.docs.set(id, entry);
    panel.loading = null;
    entry.justLoaded = true;          // 这一格第一次画出来 -> 走一次扫描线遮罩
  }
  renderPanels();
  renderTree();
  // 从树里点开的：标题"落地"时收一束翠绿的光。纯 WAAPI，不挡任何输入。
  if (fromTree && typeof Opus !== 'undefined') {
    const title = $('.panel[data-panel="' + panelIndex + '"] .panel-body .card-title');
    if (title) Opus.switchFx.titleArrive(title);
  }
  announce(`已打开《${(S.docs.get(id) || {}).document ? S.docs.get(id).document.name : ''}》`);
  if (window.innerWidth < 900) closeSidebarDrawer();
  if (focus) {
    if (pushHistory) syncHash(id);
    // 鼠标点进来的不抢焦点（内容可编辑，一进来就聚焦会让人以为"已经选中了标题"）；
    // **键盘**导航进来的必须把焦点送到正文标题——不然树重画一次，焦点就掉到 body，
    // 读屏用户得从头 Tab 一遍。
    if (pushHistory && typeof Opus !== 'undefined' && Opus.inputMode
        && Opus.inputMode() === 'keyboard') {
      Opus.focusMain();
    }
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
let bootDone = null;   // boot() 的 Promise：启动期间的 hash / 宿主消息等它到位再处理

function bindHistory() {
  // 启动数据（S.world / S.tree）到位之前不能 openDoc：地址栏在启动期间变一次
  // （深链被浏览器当成同文档跳转、或用户点了一个 #doc= 链接）就会拿一篇文档去渲染，
  // 而这时 S.world 还是 null —— 卡片里的自动识别会当场抛错。等 boot() 完成再处理。
  const apply = async () => {
    if (bootDone) { try { await bootDone; } catch (error) { return; } }
    const id = documentIdFromHash();
    const active = activeDocument();
    if (id && (!active || active.id !== id)) openDoc(id, 0, { pushHistory: false });
  };
  window.addEventListener('popstate', apply);
  window.addEventListener('hashchange', apply);
}

function closeTab(panelIndex, id) {
  const panel = S.panels[panelIndex];
  const index = panel.tabs.indexOf(id);
  if (index < 0) return;
  S.closedTabs = S.closedTabs || [];
  S.closedTabs.push(id);
  if (S.closedTabs.length > 20) S.closedTabs.shift();
  // 标签页关闭折叠：宽度收到 0 再真的移除，右边的标签平滑左移。
  // 用 WAAPI（不进 computed style）：renderPanels() 重建时不会重放。
  const strip = $$(`.panel[data-panel="${panelIndex}"] .panel-tabs > .tab`);
  const node = strip[index];
  // 右边那些标签要**平滑左移**填补，所以先把它们现在的位置量下来（FLIP 的 First）
  const before = [];
  if (typeof Opus !== 'undefined' && !Opus.reduced()) {
    strip.forEach((tab, i) => {
      if (i > index) before.push({ i: i, left: tab.getBoundingClientRect().left });
    });
  }
  const drop = () => {
    panel.tabs.splice(index, 1);
    panel.active = Math.min(panel.active, panel.tabs.length - 1);
    if (panel.active < 0 && panel.tabs.length) panel.active = 0;
    renderPanels();
    renderTree();
    // Last → Invert → Play：重画之后把右边的标签从"旧位置"滑到"新位置"
    if (before.length && typeof Opus !== 'undefined' && !Opus.reduced()) {
      requestAnimationFrame(() => {
        const after = $$(`.panel[data-panel="${panelIndex}"] .panel-tabs > .tab`);
        before.forEach((old) => {
          const tab = after[old.i - 1];
          if (!tab || typeof tab.animate !== 'function') return;
          const dx = old.left - tab.getBoundingClientRect().left;
          if (Math.abs(dx) < 1) return;
          tab.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }],
            { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        });
      });
    }
  };
  if (node && typeof Opus !== 'undefined' && !Opus.reduced()) Opus.switchFx.collapse(node, drop);
  else drop();
}

function renderPanels() {
  const host = $('#panels');
  // 面板要重建了：先把现有正文/标题节点标记为"退休"，再清空并重画。
  // 这样它们接下来触发的 input / blur 保存不会再拿旧内容覆盖掉新结构
  // （斜杠菜单刚写好的 <h1> 要小心别被 700ms 后的防抖保存盖回去）。
  $$('.block-text, .block-title', host).forEach((node) => { node.dataset.retired = '1'; });
  parkLiveEmbeds(host);                 // 嵌入的 iframe 先"寄存"，别让它随面板一起销毁
  parkOutgoingPanel(host);              // 旧内容滑出去，新内容滑进来（交叠）
  host.innerHTML = '';
  // 重渲染时清掉可能还挂在 body 上的 @ 提及浮层与格式条（否则会越积越多）
  $$('.mention-pop').forEach((node) => node.remove());
  formatBarHide();
  renderBreadcrumb();
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
      const tab = el('div', `tab${tabIndex === panel.active ? ' is-active' : ''}`
        + (isFlying(id, 'tab') ? ' is-fly-away' : ''));
      const tabIconBox = el('span', 't-icon');
      tabIconBox.appendChild(docIcon(entry ? entry.document.type : 'card', 14));
      tab.appendChild(tabIconBox);
      tab.appendChild(el('span', 't-name', name));
      const close = el('span', 't-close', '✕');
      close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(index, id); });
      tab.appendChild(close);
      tab.addEventListener('click', () => {
        // 切标签页的编排：记下方向 + **从哪儿飞**
        if (tabIndex !== panel.active) {
          S.tabSwitch = { panel: index, dir: tabIndex > panel.active ? 'forward' : 'back' };
          // 共享元素起飞点：点中的这个标签（图标不要，只要名字那一块）
          startFlyAway(id, 480, 'tab');    // 起点是这个标签：让标签上的名字先离开
          const label = tab.querySelector('.t-name');
          const rect = (label || tab).getBoundingClientRect();
          S.tabFlight = {
            panel: index, docId: id,
            text: (label || tab).textContent.trim(), source: label || null,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            font: parseFloat(getComputedStyle(label || tab).fontSize) || 12,
            color: getComputedStyle(tab).color,
          };
        }
        panel.active = tabIndex;
        renderPanels();
      });
      tab.addEventListener('auxclick', (event) => { if (event.button === 1) closeTab(index, id); });
      tab.addEventListener('contextmenu', (event) => {
        // 地图有独立页可跳（面板里嵌的那一份是简化过的），别的类型没有
        if (!entry || entry.document.type !== 'map') return;
        event.preventDefault();
        openCtx(event.clientX, event.clientY, [
          { label: '在独立地图页打开', run: () => openStandaloneMap(id) },
        ]);
      });
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
      // 错误边界：某个文档类型的渲染器炸了，不该让整格变成空白 ——
      // 就地给一个降级块（说清是哪一篇、给重试和导出），别的面板照常工作。
      const paint = () => {
      if (entry.document.type === 'timeline') {
        // 默认直接用已有的经典时间线编辑器；
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
      else if (entry.document.type === 'familyTree') body.appendChild(renderTreeFrame(entry));
      else if (entry.document.type === 'map') body.appendChild(renderMapFrame(entry));
      else if (entry.document.type === 'folder') body.appendChild(renderFolder(entry));
      else body.appendChild(renderPlaceholder(entry.document));
      };
      try {
        paint();
      } catch (error) {
        console.error('渲染这一篇时出错：', error);
        body.appendChild(editorFallback(entry, error));
      }
      // 切换 / 首次打开这一格：内容从一侧轻轻滑进来 + 扫描线揭开。
      // 只在"真的换了标签"或"这一格第一次画出来"时走一次；renderPanels() 的其它调用不触发。
      if (typeof Opus !== 'undefined') {
        const radial = S.pendingRadial && S.pendingRadial.panel === index ? S.pendingRadial : null;
        const pending = S.tabSwitch && S.tabSwitch.panel === index ? S.tabSwitch : null;
        if (radial) {
          // 双击文档树：以点击位置为圆心径向铺开，就不再叠扫描线了
          S.pendingRadial = null;
          Opus.switchFx.radial(pane, radial.x, radial.y);
        } else if (pending || entry.justLoaded) {
          Opus.switchFx.overlap(body, pending ? pending.dir : 'forward');
          Opus.switchFx.sweep();
          Opus.switchFx.treePulse(activeId);
          if (entry) entry.justLoaded = false;
        }
      }
    } else if (activeId && panel.loading && panel.loading.id === activeId
               && typeof Opus !== 'undefined') {
      // 这一份还没到：先按类型画一块骨架（延迟 400ms 才浮出来，快的话根本看不见）
      body.classList.add('is-loading');
      body.appendChild(Opus.skeleton.make(panel.loading.type === 'timeline' ? 'timeline'
        : panel.loading.type === 'familyTree' ? 'graph' : 'card'));
    }
    pane.appendChild(body);
    host.appendChild(pane);

    /* 共享元素收尾：名字从起点**直接**飞进编辑区；
       切换标签时里面的东西打字机式快速显现 */
    if (typeof Opus !== 'undefined') {
      const switchState = S.tabSwitch && S.tabSwitch.panel === index ? S.tabSwitch : null;
      if (switchState && !switchState.at) switchState.at = performance.now();
      // 数据是异步来的：这一帧可能还只有骨架，没有可擦的东西。
      // 那就把"正在切换"这个状态留到下一帧（最多留 1.6s），等真的有内容再擦。
      const isSwitch = Boolean(switchState)
        && performance.now() - (switchState.at || 0) < 1600;
      requestAnimationFrame(() => {
        const flight = (S.rowFlight && S.rowFlight.panel === index ? S.rowFlight : null)
          || (S.tabFlight && S.tabFlight.panel === index ? S.tabFlight : null);
        let flew = false;
        if (flight) {
          const title = body.querySelector('.card-title, h1, .tl-title, .tool-title');
          // 只有**真的起飞了**才把起飞点丢掉：紧接着可能还有一次 renderPanels
          // （异步数据回来），那一次标题还没画出来，提前丢掉这次飞行就无声无息没了。
          flew = Opus.switchFx.nameFlight(flight, title);
          if (flew) {
            if (S.rowFlight === flight) S.rowFlight = null;
            if (S.tabFlight === flight) S.tabFlight = null;
          } else {
            setTimeout(() => {
              if (S.rowFlight === flight) S.rowFlight = null;
              if (S.tabFlight === flight) S.tabFlight = null;
            }, 700);
          }
        }
        // 切换标签：里面的东西打字机式快速擦出来（名字在飞的那一下，标题让给飞行）
        const revealed = isSwitch ? Opus.switchFx.typeReveal(body, flew) : 0;
        if (isSwitch && (revealed > 0 || !switchState || performance.now() - switchState.at >= 1600)) {
          S.tabSwitch = null;          // 擦到了（或等太久了）：这次切换到此为止
        }
      });
    }
  });
  sweepLiveEmbeds();                    // 这一轮没被认领的嵌入（文档关了）才真销毁
  const hasTabs = S.panels.some((p) => p.tabs.length);
  host.classList.toggle('has-tabs', hasTabs);
  // 机械卡扣：并排时左侧文档树跟着向左退让一点，跟 squeeze 的"左面板被挤一下"呼应。
  // 用 transform 而不是改宽度——宽度是用户拖出来的（--sidebar-w），不能替他改。
  const split = S.panels.filter((p) => p.tabs.length).length > 1;
  document.body.classList.toggle('is-split', split);
  // 没有标签页时把面板整体藏掉：否则空面板会盖在空状态上面，按钮点不动
  host.classList.toggle('is-empty', !hasTabs);
  const workspace = $('#workspace');
  if (workspace) workspace.classList.toggle('is-empty', !hasTabs);
  $('#emptyHint').hidden = hasTabs;

  if (!editable()) disableEditing();
  if (S.panels.length > 1) {
    const first = host.querySelector('.panel');
    if (first && S.panelSplit) first.style.flex = `0 0 ${S.panelSplit}%`;
    // 并排面板第一次出现：左面板被"挤"一下、右面板滑进来
    if (S.pendingSqueeze && typeof Opus !== 'undefined') {
      S.pendingSqueeze = false;
      Opus.switchFx.squeeze(Array.prototype.slice.call(host.querySelectorAll('.panel')));
    }
  }
}

/* ------------------------------------------------------- 活着的嵌入 iframe */
/**
 * 面板是"整块重建"的（``host.innerHTML = ''``），而 iframe 一旦被移出文档，
 * 浏览上下文就销毁了——于是每次 renderPanels() 都会把嵌入的编辑器重载一次，
 * 用户在里面的选中 / 平移 / 缩放全丢。
 *
 * 这里的办法很土但很稳：重建前先把带 ``is-live-embed`` 的元素**挪到常驻文档的
 * staging 容器**里（还在文档里，所以 iframe 不会重载），重建时再由渲染函数按
 * key 认领回去；这一轮没被认领的（文档关掉了）才真正删掉。
 */
const LIVE_EMBEDS = new Map();          // key -> 元素

function liveStage() {
  let stage = $('#panelStage');
  if (!stage) {
    stage = el('div', 'panel-stage');
    stage.id = 'panelStage';
    stage.hidden = true;
    document.body.appendChild(stage);
  }
  return stage;
}

/** 交叠式：把**旧的那一格内容**原地"寄存"下来，让它在新的内容滑进来的同时
 *  往左滑出淡出——不这么做的话，只剩"新的滑进来"，看起来就像什么都没发生。
 *
 *  为什么是"寄存 DOM"而不是克隆一份：克隆一个 <iframe> 会把它重新加载一遍
 *  （地图 / 关系树 / 经典时间线都是 iframe），克隆出来的还会是空白。
 *  直接把原来的节点搬到浮层里，内容一点不动。
 *
 *  返回一个收尾函数（旧内容淡出结束后由它把浮层撤掉）。 */
function outgoingStage() {
  let stage = $('#outgoingStage');
  if (!stage) {
    stage = el('div', 'outgoing-stage');
    stage.id = 'outgoingStage';
    document.body.appendChild(stage);
  }
  return stage;
}

/** 交叠式：把**旧的那一格内容**原地"寄存"下来，让它在新的内容滑进来的同时
 *  往左滑出淡出——不这么做的话，只剩"新的滑进来"，看起来就像什么都没发生。
 *
 *  两个必须注意的点：
 *    1. 寄存的是**原来的 DOM**，不是克隆：克隆一个 <iframe> 会把地图 / 关系树 /
 *       经典时间线重新加载一遍，克隆出来的还是空白；
 *    2. 要挂在**面板外面**的浮层上：renderPanels() 紧接着就会 host.innerHTML = ''，
 *       挂在旧面板里的东西会跟着一起被删掉。
 */
function parkOutgoingPanel(host) {
  if (typeof Opus === 'undefined' || Opus.reduced()) return;
  if (!S.tabSwitch && !S.pendingSqueeze) return;
  const pane = host.querySelector('.panel');
  const body = pane && pane.querySelector('.panel-body');
  if (!body || !body.firstChild) return;

  const rect = body.getBoundingClientRect();
  const layer = el('div', 'xp-outgoing');
  layer.setAttribute('aria-hidden', 'true');
  while (body.firstChild) layer.appendChild(body.firstChild);
  layer.style.left = `${rect.left}px`;
  layer.style.top = `${rect.top}px`;
  layer.style.width = `${rect.width}px`;
  layer.style.height = `${rect.height}px`;
  outgoingStage().appendChild(layer);

  const animation = typeof layer.animate === 'function'
    ? layer.animate(
      [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-20px)' }],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' })
    : null;
  const done = () => layer.remove();
  if (animation) animation.finished.then(done).catch(done);
  else done();
  setTimeout(done, 800);        // 兜底：动画没跑也别忘了收
}

function parkLiveEmbeds(host) {
  $$('.is-live-embed', host).forEach((node) => {
    if (node.dataset.liveKey) LIVE_EMBEDS.set(node.dataset.liveKey, node);
    liveStage().appendChild(node);      // 只是换爹，不是销毁
  });
}

function sweepLiveEmbeds() {
  const stage = liveStage();
  Array.prototype.slice.call(stage.children).forEach((node) => {
    if (LIVE_EMBEDS.get(node.dataset.liveKey) === node) LIVE_EMBEDS.delete(node.dataset.liveKey);
    node.remove();
  });
}

/** 取一个"活着"的嵌入元素：有就复用（不重载），没有就用 factory 造一个。 */
function liveEmbed(key, factory) {
  let node = LIVE_EMBEDS.get(key);
  if (!node) {
    node = factory();
    node.classList.add('is-live-embed');
    node.dataset.liveKey = key;
    LIVE_EMBEDS.set(key, node);
  }
  return node;
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

/** 文件夹路径面包屑：从世界根一路点到当前文件夹，回答"我在哪一层"。 */
function folderCrumbs(document_) {
  const crumbs = el('div', 'folder-crumbs');
  crumbs.appendChild(el('span', 'crumb-root', (S.world && S.world.name) || '世界'));
  const path = findPath(document_.id)
    || [{ id: document_.id, name: document_.name, type: 'folder' }];
  path.forEach((node, i) => {
    crumbs.appendChild(el('span', 'crumb-sep', '›'));
    const last = i === path.length - 1;
    const seg = el('button', `crumb-seg${last ? ' is-current' : ''}`, node.name);
    seg.type = 'button';
    seg.prepend(docIcon(node.type || 'folder', 13));
    if (last) {
      seg.disabled = true;
      seg.setAttribute('aria-current', 'page');
    } else {
      seg.addEventListener('click', () => openDoc(node.id));
    }
    crumbs.appendChild(seg);
  });
  return crumbs;
}

/** 文件夹：列出里面的文档（点一下就打开），支持新建、搜索、排序、网格视图与多选批量。 */
function renderFolder(entry) {
  const document_ = entry.document;
  // 搜索词 / 排序 / 视图 / 选择都存回 entry（就是 S.docs 里的那份对象），重画之后还留在原处。
  if (typeof entry.folderQ !== 'string') entry.folderQ = '';
  if (!entry.folderSort) entry.folderSort = { key: 'manual', dir: 'asc' };
  if (entry.folderView !== 'grid') entry.folderView = 'list';
  if (!Array.isArray(entry.folderSel)) entry.folderSel = [];
  const sort = entry.folderSort;
  const all = document_.children || [];
  entry.folderSel = entry.folderSel.filter((id) => all.some((c) => c.id === id));

  const wrap = el('div', 'card-view folder-view');
  wrap.dataset.doc = String(document_.id);
  wrap.appendChild(folderCrumbs(document_));

  const head = el('div', 'folder-head');
  head.appendChild(el('h1', 'card-title', document_.name));
  wrap.appendChild(head);

  const SORTS = [['manual', '手动顺序'], ['name', '名称'], ['type', '类型'], ['updated', '更新时间']];
  const compare = (a, b) => {
    let r;
    if (sort.key === 'name') {
      r = String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');
    } else if (sort.key === 'type') {
      const la = DOC_LABEL[a.type] || a.type;
      const lb = DOC_LABEL[b.type] || b.type;
      r = la.localeCompare(lb, 'zh-Hans-CN') || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');
    } else if (sort.key === 'updated') {
      r = String(a.updated_at || '').localeCompare(String(b.updated_at || ''));
    } else {
      r = (a.position ?? 0) - (b.position ?? 0) || (a.id - b.id);
    }
    return sort.dir === 'desc' ? -r : r;
  };

  const countHost = el('p', 'hint');
  const results = el('div', 'folder-list');
  const batchBar = el('div', 'folder-batch');
  batchBar.hidden = true;

  const isSel = (id) => entry.folderSel.includes(id);

  // 批量操作后：清空选择、重载树、再取回当前文件夹的最新子项
  const refreshFolder = async () => {
    const fresh = await api(`/api/world/documents/${document_.id}?children=1`);
    entry.document = fresh;
    S.docs.set(document_.id, entry);
    renderPanels();
  };
  const runBatch = async (label, worker) => {
    const ids = entry.folderSel.slice();
    if (!ids.length) return;
    const count = ids.length;
    try {
      await worker(ids);
      toast(`${label}了 ${count} 项`);
    } catch (error) {
      toast((error && error.message) || `${label}失败`);
    }
    entry.folderSel = [];
    await reloadTree();
    await refreshFolder();
  };

  const renderBatch = () => {
    batchBar.hidden = !entry.folderSel.length;
    batchBar.innerHTML = '';
    if (!entry.folderSel.length) return;
    const ids = entry.folderSel;
    batchBar.appendChild(el('span', 'fb-count', `已选 ${ids.length} 项`));

    const move = el('select', 'fb-move');
    move.appendChild(new Option('移动到…', ''));
    const walk = (nodes) => nodes.forEach((node) => {
      if (node.type === 'folder' && node.id !== document_.id && !ids.includes(node.id)) {
        move.appendChild(new Option(node.name, String(node.id)));
      }
      if (node.children) walk(node.children);
    });
    walk(S.tree);
    move.value = '';
    move.addEventListener('change', () => {
      const target = Number(move.value);
      move.value = '';
      if (!target) return;
      runBatch('移动', async (list) => {
        await Promise.all(list.map((id) => api(`/api/world/documents/${id}`, {
          method: 'PUT', body: { parent: target },
        })));
      });
    });
    batchBar.appendChild(move);

    const hiddenAll = ids.every((id) => (all.find((c) => c.id === id) || {}).hidden);
    batchBar.appendChild(button(hiddenAll ? '取消隐藏' : '隐藏', '把选中的条目设成隐藏 / 取消隐藏', () => {
      runBatch(hiddenAll ? '取消隐藏' : '隐藏', async (list) => {
        await Promise.all(list.map((id) => api(`/api/world/documents/${id}`, {
          method: 'PUT', body: { hidden: !hiddenAll },
        })));
      });
    }));
    batchBar.appendChild(button('删除', '把选中的条目放进回收站（可恢复）', () => {
      if (!window.confirm(`删除选中的 ${ids.length} 项？会进回收站。`)) return;
      runBatch('删除', async (list) => {
        await Promise.all(list.map((id) => api(`/api/world/documents/${id}`, { method: 'DELETE' })));
      });
    }, false, true));
    batchBar.appendChild(button('取消选择', '清空当前选择', () => { entry.folderSel = []; fill(); }));
  };

  const folderEntry = (child) => {
    const row = el('div', `folder-row${isSel(child.id) ? ' is-selected' : ''}`);
    const check = el('input', 'fr-check');
    check.type = 'checkbox';
    check.checked = isSel(child.id);
    check.title = '选择';
    check.setAttribute('aria-label', `选择「${child.name}」`);
    check.addEventListener('click', (event) => event.stopPropagation());
    check.addEventListener('change', () => {
      const ids = new Set(entry.folderSel);
      if (check.checked) ids.add(child.id); else ids.delete(child.id);
      entry.folderSel = [...ids];
      fill();
    });
    row.appendChild(check);
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
    return row;
  };

  const fill = () => {
    results.className = `folder-list${entry.folderView === 'grid' ? ' is-grid' : ''}`;
    results.innerHTML = '';
    const q = entry.folderQ.trim().toLowerCase();
    const rows = all.filter((c) => !q || String(c.name).toLowerCase().includes(q)).slice().sort(compare);
    rows.forEach((child) => results.appendChild(folderEntry(child)));
    if (q && !rows.length) results.appendChild(el('div', 'folder-none', `没有匹配「${entry.folderQ.trim()}」的项`));
    renderBatch();
    countHost.textContent = q
      ? `${rows.length} / ${all.length} 项 · 文件夹不会出现在发布站点上`
      : `${all.length} 项 · 文件夹不会出现在发布站点上`;
  };

  if (all.length) {
    const tools = el('div', 'folder-tools');
    const search = el('input', 'folder-search');
    search.type = 'search';
    search.placeholder = '在这个文件夹里搜索…';
    search.setAttribute('aria-label', '在这个文件夹里搜索');
    search.value = entry.folderQ;
    search.addEventListener('input', () => { entry.folderQ = search.value; fill(); });
    tools.appendChild(search);

    const sortBar = el('div', 'folder-sort');
    SORTS.forEach(([key, label]) => {
      const on = sort.key === key;
      const btn = button(label, `按${label}排序（再点一下切换升 / 降序）`, () => {
        if (on) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        else { sort.key = key; sort.dir = key === 'updated' ? 'desc' : 'asc'; }
        renderPanels();
      }, on);
      if (on) btn.textContent = `${label} ${sort.dir === 'desc' ? '↓' : '↑'}`;
      sortBar.appendChild(btn);
    });
    tools.appendChild(sortBar);

    const viewBar = el('div', 'folder-view-toggle');
    viewBar.appendChild(button('列表', '按列表显示', () => { entry.folderView = 'list'; renderPanels(); }, entry.folderView === 'list'));
    viewBar.appendChild(button('网格', '按网格显示', () => { entry.folderView = 'grid'; renderPanels(); }, entry.folderView === 'grid'));
    tools.appendChild(viewBar);

    wrap.appendChild(tools);
    wrap.appendChild(batchBar);
    wrap.appendChild(countHost);
    wrap.appendChild(results);
    fill();
  } else {
    countHost.textContent = '0 项 · 文件夹不会出现在发布站点上';
    wrap.appendChild(countHost);
    wrap.appendChild(results);
    results.appendChild(emptyBlock({
      iconName: 'folder-open',
      title: '这个文件夹还是空的',
      text: '可以把已有的文档拖进来，也可以直接在这里新建一张卡片。',
      actionLabel: '新建卡片',
      onAction: async () => {
        const created = await api('/api/world/documents', {
          method: 'POST',
          body: { type: 'card', name: '未命名卡片', parent: document_.id, entity_type: null },
        });
        await reloadTree();
        openDoc(created.id);
      },
    }));
  }

  const actions = el('div', 'insert-bar');
  actions.appendChild(button('＋ 新建卡片', '在这个文件夹里建一张卡片', async () => {
    const name = await askText({ label: '卡片名称', value: '未命名' });
    if (name === null) return;
    const type = S.types.find((t) => !t.hidden) || S.types[0];
    const created = await api('/api/world/documents', {
      method: 'POST',
      body: { type: 'card', name: name.trim() || '未命名', parent: document_.id, entity_type: null },
    });
    await reloadTree();
    const fresh = await api(`/api/world/documents/${document_.id}`);
    entry.document = fresh;
    S.docs.set(document_.id, entry);
    renderPanels();
    toast(`已新建「${created.name}」`);
  }));
  actions.appendChild(button('＋ 新建子文件夹', '', async () => {
    const name = await askText({ label: '文件夹名称', value: '新文件夹' });
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

/** 取一张图：**上传文件** 或 **粘贴链接** 两个页签。
 *  上传走文档媒体端点（POST /api/world/documents/<id>/media，字段 file），
 *  后端回 entry.url = /media/docs/<id>/<name>，直接能当 <img src> 用。
 *  返回可用的图片地址；取消返回 null。 */
function pickImage({ docId, value = '' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const overlay = el('div', 'modal');
    const card = el('div', 'modal-card img-src-card');
    const done = (url) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(url);
    };
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); done(null); } };

    card.appendChild(el('div', 'ms-title', '图片'));

    const tabs = el('div', 'img-src-tabs');
    const tabUp = el('button', 'img-src-tab is-active', '上传文件');
    const tabLk = el('button', 'img-src-tab', '粘贴链接');
    tabUp.type = 'button'; tabLk.type = 'button';
    tabs.append(tabUp, tabLk);

    const paneUp = el('div', 'img-src-pane');
    const paneLk = el('div', 'img-src-pane');
    const show = (which) => {
      const up = which === 'upload';
      tabUp.classList.toggle('is-active', up);
      tabLk.classList.toggle('is-active', !up);
      paneUp.hidden = !up;
      paneLk.hidden = up;
    };
    tabUp.addEventListener('click', () => show('upload'));
    tabLk.addEventListener('click', () => show('link'));

    /* —— 上传页：点选或拖进来 —— */
    const drop = el('label', 'img-src-drop');
    drop.appendChild(el('span', 'img-src-drop-icon', '＋'));
    drop.appendChild(el('span', 'img-src-drop-text', '点击选择图片，或把图片拖到这里'));
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    drop.appendChild(file);
    const status = el('div', 'img-src-status');
    const upload = async (picked) => {
      if (!picked) return;
      if (!/^image\//.test(picked.type || '')) { status.textContent = '只能传图片文件'; return; }
      status.textContent = `上传中…（${Math.round(picked.size / 1024)} KB）`;
      try {
        const form = new FormData();
        form.append('file', picked);
        form.append('kind', 'image');
        form.append('title', picked.name || '图片');
        const res = await api(`/api/world/documents/${docId}/media`, { method: 'POST', form });
        const url = res && res.entry && res.entry.url;
        if (!url) throw new Error('没有拿到文件地址');
        done(url);
      } catch (error) {
        status.textContent = `上传失败：${(error && error.message) || error}`;
      }
    };
    file.addEventListener('change', () => upload(file.files && file.files[0]));
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-over');
      upload(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    paneUp.append(drop, status);

    /* —— 链接页 —— */
    const link = el('input', 'img-src-input');
    link.type = 'url';
    link.placeholder = 'https://…';
    link.value = /^https?:/i.test(value) ? value : '';
    paneLk.appendChild(link);

    const foot = el('div', 'modal-foot');
    const ok = el('button', 'btn btn-primary', '确定');
    const cancel = el('button', 'btn', '取消');
    ok.type = 'button'; cancel.type = 'button';
    ok.addEventListener('click', () => {
      const url = link.value.trim();
      if (!url) { link.focus(); return; }
      done(url);
    });
    cancel.addEventListener('click', () => done(null));
    foot.append(ok, cancel);
    link.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); ok.click(); } });

    card.append(tabs, paneUp, paneLk, foot);
    overlay.appendChild(card);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) done(null); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    show(/^https?:/i.test(value) ? 'link' : 'upload');
  });
}

/** 改封面：上传文件 或 粘链接。 */
async function setCover(entry) {
  const document_ = entry.document;
  const url = await pickImage({ docId: document_.id, value: document_.cover || '' });
  if (url === null) return;
  document_.cover = url;
  await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { cover: document_.cover } });
  renderPanels();
}

/** 往正文里粘 / 拖一张图：先上传，再在文末插一个图片块。 */
async function insertImageFromFile(file) {
  if (!file || !/^image\//.test(file.type || '')) return false;
  const panel = S.panels[0];
  const id = panel && panel.tabs.length ? panel.tabs[panel.active] : null;
  const entry = (id === null || id === undefined) ? null : S.docs.get(id);
  if (!entry) { toast('先打开一篇文档'); return true; }
  toast('正在上传图片…');
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'image');
    form.append('title', file.name || '图片');
    const res = await api(`/api/world/documents/${entry.document.id}/media`, { method: 'POST', form });
    const url = res && res.entry && res.entry.url;
    if (!url) throw new Error('没有拿到文件地址');
    // 内存里的 entry.card.blocks 可能已经过期（比如刚用 ＋ 菜单插过块），
    // 这里重新拉一次 entry 再追加，避免把已有的块覆盖掉。
    let blocks = (entry.card && entry.card.blocks) || [];
    try {
      const fresh = await fetchEntry(entry.document.id);
      if (fresh && fresh.card) {
        entry.card = fresh.card;
        blocks = entry.card.blocks || [];
      }
    } catch (error) { /* 拉不到就用内存里的那份，至少不丢 */ }
    blocks.push({ id: `img${Date.now().toString(36)}`, type: 'image', title: '', text: '', settings: { url, caption: '' } });
    await saveBlocks(entry, blocks, '插入图片');
    renderPanels();
  } catch (error) {
    toast(`上传失败：${(error && error.message) || error}`);
  }
  return true;
}

/* 粘贴 / 拖拽图片（只在真的带图片文件时接管，不影响块拖动和普通文本粘贴） */
document.addEventListener('paste', (event) => {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && /^image\//.test(item.type)) {
      const picked = item.getAsFile();
      if (picked) { event.preventDefault(); insertImageFromFile(picked); return; }
    }
  }
});
document.addEventListener('dragover', (event) => {
  const items = event.dataTransfer && event.dataTransfer.items;
  if (!items) return;
  const hasImage = [...items].some((item) => item.kind === 'file' && /^image\//.test(item.type));
  if (hasImage) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  const files = event.dataTransfer && event.dataTransfer.files;
  if (files && files.length && /^image\//.test(files[0].type || '')) {
    event.preventDefault();
    insertImageFromFile(files[0]);
  }
});

/** 页面图标备选：给一组世界观向的常用 emoji，外加任意粘贴。 */
const PAGE_EMOJI = ['📄', '📝', '📌', '⭐', '🔥', '💡', '🧭', '🗺️', '🏔️', '🌊', '🌲', '🏛️',
                    '⚔️', '🛡️', '👑', '🐉', '🦅', '🌙', '☀️', '⚗️', '🔮', '📜', '🗝️', '⚖️',
                    '🧬', '🕯️', '🌋', '❄️', '🪐', '🧿'];

/** 页面图标选择器：常用 emoji + 任意输入 + 移除。 */
function openIconPicker(entry, anchor) {
  const document_ = entry.document;
  const save = async (value) => {
    await api(`/api/world/documents/${document_.id}`, { method: 'PUT', body: { icon: value } });
    document_.icon = value;
    renderPanels();
    toast(value ? '页面图标已更新' : '页面图标已移除');
  };

  const pop = el('div', 'fb-menu icon-picker');
  pop.appendChild(el('div', 'ip-head', '页面图标'));
  const grid = el('div', 'ip-grid');
  PAGE_EMOJI.forEach((ch) => {
    const cell = el('button', 'ip-cell', ch);
    cell.type = 'button';
    cell.addEventListener('click', async () => { pop.remove(); await save(ch); });
    grid.appendChild(cell);
  });
  pop.appendChild(grid);

  const input = el('input', 'ip-input');
  input.type = 'text';
  input.placeholder = '或粘贴任意一个 emoji，回车确认';
  input.maxLength = 8;
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    pop.remove();
    await save(value);
  });
  pop.appendChild(input);

  const remove = el('button', 'ip-remove', '移除图标');
  remove.type = 'button';
  remove.addEventListener('click', async () => { pop.remove(); await save(''); });
  pop.appendChild(remove);

  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${clamp(rect.left, 8, window.innerWidth - pop.offsetWidth - 8)}px`;
  pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
  input.focus();
  const close = (event) => {
    if (!pop.contains(event.target)) {
      pop.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/** 页面级评论：标题下方一串评论 + 一个撰写条。 */
function renderPageComments(entry) {
  const card = entry.card || {};
  const comments = Array.isArray(card.comments) ? card.comments : [];
  const box = el('div', 'page-comments');
  box.hidden = comments.length === 0;     // 没评论就先藏着，由「添加评论」按钮展开

  const save = async (list) => {
    card.comments = list;
    await api(`/api/world/cards/${entry.document.id}`, { method: 'PUT', body: { comments: list } });
    renderPanels();
  };

  comments.forEach((comment) => {
    const row = el('div', 'pc-row');
    row.appendChild(el('span', 'pc-avatar', (comment.author || '我').slice(0, 1).toUpperCase()));
    const body = el('div', 'pc-body');
    const meta = el('div', 'pc-meta');
    meta.appendChild(el('b', null, comment.author || '我'));
    meta.appendChild(el('span', 'hint', (comment.at || '').replace('T', ' ').slice(0, 16)));
    const remove = el('button', 'pc-del', '删除');
    remove.type = 'button';
    remove.title = '删除这条评论';
    remove.addEventListener('click', () => save(comments.filter((item) => item !== comment)));
    meta.appendChild(remove);
    body.appendChild(meta);
    body.appendChild(el('div', 'pc-text', comment.text));
    row.appendChild(body);
    box.appendChild(row);
  });

  const composer = el('div', 'pc-composer');
  const input = el('input', 'pc-input');
  input.type = 'text';
  input.placeholder = '添加评论…';
  const send = el('button', 'pc-send', '发送');
  send.type = 'button';
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await save([...comments, { author: '我', at: new Date().toISOString(), text }]);
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
  composer.appendChild(input);
  composer.appendChild(send);
  box.appendChild(composer);
  return box;
}

/** 可插入的区块类型（底部「添加区块」下拉用）。 */
const INSERT_ITEMS = [
  ['text', '文本', 'type'],
  ['heading', '标题', 'type'],
  ['bulleted', '无序列表', 'list'],
  ['numbered', '有序列表', 'list-ordered'],
  ['todo', '待办事项', 'circle-check'],
  ['toggle', '折叠列表', 'chevron-right'],
  ['quote', '引用', 'quote'],
  ['callout', '提示框', 'circle-alert'],
  ['code', '代码', 'hash'],
  ['image', '图片', 'image'],
  ['collection', '内联数据库', 'grid-3x3'],
  ['divider', '分隔线', 'circle-minus'],
];

/** 底部「添加区块」下拉：把这一排类型收在 ＋ 的菜单里，条上只留一颗按钮。 */
function openInsertMenu(anchor, entry, panelIndex) {
  const menu = el('div', 'fb-menu insert-menu');
  INSERT_ITEMS.forEach(([kind, label, iconName]) => {
    const button = el('button');
    button.type = 'button';
    button.appendChild(icon(iconName, 14));
    button.appendChild(el('span', 'bm-label', label));
    button.addEventListener('click', async () => { menu.remove(); await addBlock(entry, kind, panelIndex); });
    menu.appendChild(button);
  });
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
  // 插入条贴在底部，菜单往上弹
  menu.style.top = `${Math.max(8, rect.top - menu.offsetHeight - 6)}px`;
  const close = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

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
  // 标题左侧是页面图标 —— 用户挑的 emoji 优先，没挑才退回按文档类型的默认图标
  const titleRow = el('div', 'card-title-row');
  titleRow.appendChild(document_.icon
    ? el('span', 'page-emoji', document_.icon)
    : docIcon(document_.type, 32));
  titleRow.appendChild(title);
  left.appendChild(titleRow);

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
  // 这一篇在站点上的样子：同标签跳过去，标题会沿着共享元素"飞"进文档页
  // live = 与站点一致；stale = 之后又改过（站点上是上一次发布的版本，但页面确实存在）
  if (S.world && S.world.published && ['live', 'stale'].includes(document_.publish_state) && document_.slug) {
    const onSite = el('a', 'badge site-link', '在维基里看 ↗');
    onSite.href = `/s/${(S.world.site_url || '').replace(/^\/s\/|\/$/g, '')}/${document_.slug}/`;
    onSite.title = '在只读站点里打开这一篇（会走页面过渡）';
    badges.appendChild(onSite);
  }
  const stateChip = el('button', 'badge state-chip', PUBLISH_LABEL[document_.publish_state] || document_.publish_state);
  stateChip.type = 'button';
  stateChip.dataset.state = document_.publish_state || 'unpublished';
  stateChip.title = '发布状态（点开分享面板）';
  stateChip.addEventListener('click', () => publishDialog());
  badges.appendChild(stateChip);
  // 别名做成徽标行里的一枚 —— 和「纪元 / 类型 / 站点显示 / 发布状态」并排，
  // 不再单独在页脚占一块（那块又高又突兀）。
  const aliases = card.aliases || [];
  const aliasBadge = el('button', 'badge');
  aliasBadge.type = 'button';
  aliasBadge.appendChild(icon('tag', 13));
  aliasBadge.appendChild(el('span', null, aliases.length ? `别名：${aliases.join('、')}` : '＋ 别名'));
  aliasBadge.title = '给这张卡加别名（搜索和 @ 提及都会命中）';
  aliasBadge.addEventListener('click', async () => {
    const value = await askText({ label: '别名（用逗号分隔）', value: aliases.join(', ') });
    if (value === null) return;
    const aliasPayload = await api(`/api/world/cards/${document_.id}`, { method: 'PUT', body: { aliases: value } });
    applyCardResponse(entry, aliasPayload);
    await refreshDoc(document_.id);
    toast('别名已保存');
  });
  badges.appendChild(aliasBadge);
  left.appendChild(badges);

  /* 属性表 */
  left.appendChild(renderProperties(entry, type, panelIndex));
  head.appendChild(left);

  /* 封面 + 页面动作行。
     没有封面时不摆一个"添加封面"的大方框占位，而是在标题上方放
     一行小按钮（添加图标 · 添加封面 · 添加评论），有封面时封面才是整幅横幅。 */
  if (document_.cover) {
    const cover = el('div', 'card-cover');
    const img = el('img');
    img.src = document_.cover;
    img.alt = '';
    cover.appendChild(img);
    cover.title = '点击更换封面';
    cover.addEventListener('click', () => setCover(entry));
    wrap.appendChild(cover);
  }
  const actions = el('div', 'page-actions');
  const commentsBox = renderPageComments(entry);      // 先建好：「添加评论」按钮要展开它
  const pageAction = (iconName, label, handler) => {
    const button = el('button', 'page-action');
    button.type = 'button';
    button.appendChild(icon(iconName, 14));
    button.appendChild(el('span', null, label));
    button.addEventListener('click', () => handler(button));
    return button;
  };
  if (!document_.icon) actions.appendChild(pageAction('star', '添加图标', (btn) => openIconPicker(entry, btn)));
  if (!document_.cover) actions.appendChild(pageAction('image', '添加封面', () => setCover(entry)));
  actions.appendChild(pageAction('message-circle-more', '添加评论', () => {
    commentsBox.hidden = false;
    const input = commentsBox.querySelector('.pc-input');
    if (input) input.focus();
  }));
  wrap.appendChild(actions);
  wrap.appendChild(head);
  wrap.appendChild(commentsBox);

  /* 区块 */
  const blocks = el('div', 'blocks');
  (card.blocks || []).forEach((block, index) => blocks.appendChild(renderBlock(entry, block, index, panelIndex)));
  wrap.appendChild(blocks);

  /* 底部插入条：只在**空页面**上出现（有内容就收）。
     有内容之后靠块左边的 ＋ / 回车来加块。 */
  if (!(card.blocks || []).length) {
    const bar = el('div', 'insert-bar');
    const moreBtn = el('button', 'insert-btn');
    moreBtn.type = 'button';
    moreBtn.appendChild(icon('plus', 14));
    moreBtn.appendChild(el('span', null, '添加区块'));
    moreBtn.addEventListener('click', () => openInsertMenu(moreBtn, entry, panelIndex));
    bar.appendChild(moreBtn);
    wrap.appendChild(bar);
  }

  /* 底部：反向链接（谁提到了这张卡）。别名已经挪到标题下的徽标行了。 */

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
    const kind = el('span', 'k-kind', VT_LABEL[prop.value_type] || prop.value_type);
    if (typeof Opus !== 'undefined' && Opus.tip) {
      Opus.tip(kind, VT_HINT[prop.value_type] || '这个属性的取值类型。');
    }
    key.appendChild(kind);
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
  // 注意：容器类名用 block-kind-<type>，不用 block-<type>——
  // 后者在 type=text 时正好等于正文的 .block-text，选择器会命中错元素（块工具条被当成正文）。
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

  // 块左边悬停时只出两个按钮 —— `+`（在下方插一块）和 `⋮⋮`（拖动 / 打开块菜单）。
  // 其余动作（上下移、放到左/右栏、隐藏、评论、删除）都收进块菜单里了。
  const addBelow = el('button', 'block-add');
  addBelow.type = 'button';
  addBelow.title = '在下方插入一块';
  addBelow.setAttribute('aria-label', '在下方插入一块');
  addBelow.appendChild(icon('plus', 14));
  addBelow.addEventListener('click', () => insertBlockAt(entry, index + 1));
  tools.appendChild(addBelow);

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

  // 块没有"区块标题"这一行 —— 块的正文就是它的全部。
  // 老数据里已经写过标题的，退化成一行只读小标题，别让内容凭空消失。
  if (block.title && block.type !== 'divider' && block.type !== 'heading') {
    wrap.appendChild(el('div', 'block-title is-static', block.title));
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

  // 内联数据库：一个块 = 某个实体类型下的卡片集合（表格 / 看板 / 画廊 / 列表 / 日历）
  if (block.type === 'collection') {
    wrap.appendChild(renderCollectionBlock(entry, block, index));
    return wrap;
  }

  // ---------------- 基本区块：列表 / 待办 / 折叠 / 代码 / 书签 ----------------
  if (block.type === 'bulleted' || block.type === 'numbered') {
    const row = el('div', `block-list-row is-${block.type}`);
    row.appendChild(el('span', 'block-marker', block.type === 'bulleted' ? '•' : `${ordinalOf(entry, index)}.`));
    row.appendChild(blockTextField(entry, block, index, 'block-line'));
    wrap.appendChild(row);
    return wrap;
  }

  if (block.type === 'todo') {
    const row = el('div', 'block-list-row is-todo');
    if (block.checked) row.classList.add('is-done');
    const box = el('input', 'block-check');
    box.type = 'checkbox';
    box.checked = !!block.checked;
    box.setAttribute('aria-label', '完成这一项');
    if (!editable()) box.disabled = true;
    box.addEventListener('change', async () => {
      row.classList.toggle('is-done', box.checked);
      await saveBlock(entry, index, { checked: box.checked }, '勾选待办');
    });
    row.appendChild(box);
    row.appendChild(blockTextField(entry, block, index, 'block-line'));
    wrap.appendChild(row);
    return wrap;
  }

  if (block.type === 'toggle') {
    const head = el('button', 'block-toggle-head');
    head.type = 'button';
    head.appendChild(icon(block.collapsed ? 'chevron-right' : 'chevron-down', 14));
    head.appendChild(el('span', 'block-toggle-label', block.title || block.text || '折叠内容'));
    head.setAttribute('aria-expanded', String(!block.collapsed));
    head.addEventListener('click', async () => {
      await saveBlock(entry, index, { collapsed: !block.collapsed }, '折叠区块');
      renderPanels();
    });
    wrap.appendChild(head);
    const body = el('div', 'block-toggle-body');
    if (block.collapsed) body.hidden = true;
    body.appendChild(blockTextField(entry, block, index, 'block-line'));
    wrap.appendChild(body);
    return wrap;
  }

  if (block.type === 'code') {
    const pre = el('pre', 'block-code');
    const code = el('code', 'block-line');
    if (editable()) code.contentEditable = 'true';
    code.dataset.placeholder = '代码…';
    code.textContent = block.text || '';
    code.addEventListener('input', () => {
      debounce(`block:${entry.document.id}:${index}`, () => {
        if (code.dataset.retired === '1' || !code.isConnected) return;
        saveBlock(entry, index, { text: code.textContent });
      }, 700);
    });
    code.addEventListener('blur', () => {
      clearTimeout(S.pending.get(`block:${entry.document.id}:${index}`));
      S.pending.delete(`block:${entry.document.id}:${index}`);
      if (code.dataset.retired === '1' || !code.isConnected) return;
      saveBlock(entry, index, { text: code.textContent });
    });
    pre.appendChild(code);
    wrap.appendChild(pre);
    return wrap;
  }

  if (block.type === 'bookmark') {
    const url = (block.settings && block.settings.url) || '';
    if (url) {
      const link = el('a', 'block-bookmark');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const art = el('span', 'bm-art');
      art.appendChild(icon('link', 14));
      link.appendChild(art);
      const body = el('span', 'bm-body');
      body.appendChild(el('b', null, block.title || (block.settings && block.settings.caption) || url));
      body.appendChild(el('span', 'bm-url', url));
      link.appendChild(body);
      wrap.appendChild(link);
    } else {
      wrap.appendChild(emptyBlock({
        iconName: 'link', title: '还没有链接',
        text: '书签会把一个网址摆成一张可点的卡片。',
      }));
    }
    return wrap;
  }

  /* 图片块：上传文件 或 粘链接（和封面共用 pickImage）。
     后端 normalize 已经放行 image 块和它的 settings.url / settings.caption。 */
  if (block.type === 'image') {
    const url = (block.settings && block.settings.url) || '';
    const caption = (block.settings && block.settings.caption) || '';
    const figure = el('figure', 'block-image');
    const choose = async (label) => {
      const next = await pickImage({ docId: entry.document.id, value: url });
      if (!next) return;
      await saveBlock(entry, index, { type: 'image', settings: { url: next, caption } }, label);
      renderPanels();
    };
    if (url) {
      const img = el('img', 'blk-img');
      img.src = url;
      img.alt = caption || block.title || '图片';
      img.loading = 'lazy';
      img.addEventListener('error', () => { figure.classList.add('is-broken'); });
      figure.appendChild(img);
      const cap = el('input', 'blk-img-cap');
      cap.type = 'text';
      cap.value = caption;
      cap.placeholder = '输入题注…';
      cap.addEventListener('change', async () => {
        await saveBlock(entry, index, { settings: { url, caption: cap.value.trim() } }, '改图片题注');
      });
      figure.appendChild(cap);
      const tools = el('div', 'blk-img-tools');
      const swap = el('button', 'blk-img-act', '更换');
      const drop = el('button', 'blk-img-act', '移除');
      swap.type = 'button'; drop.type = 'button';
      swap.addEventListener('click', () => choose('更换图片'));
      drop.addEventListener('click', async () => {
        await saveBlock(entry, index, { settings: { url: '', caption } }, '移除图片');
        renderPanels();
      });
      tools.append(swap, drop);
      figure.appendChild(tools);
    } else {
      const empty = el('div', 'blk-img-empty');
      const up = el('button', 'blk-img-pick', '上传文件');
      const lk = el('button', 'blk-img-pick', '粘贴链接');
      up.type = 'button'; lk.type = 'button';
      up.addEventListener('click', () => choose('插入图片'));
      lk.addEventListener('click', () => choose('插入图片'));
      empty.append(up, lk);
      empty.appendChild(el('div', 'blk-img-hint', '从本机选一张图（会存到这个文档下），或粘一个图片地址'));
      figure.appendChild(empty);
    }
    wrap.appendChild(figure);
    return wrap;
  }

  wrap.appendChild(blockTextField(entry, block, index, block.type === 'quote' ? 'block-quote' : ''));

  // 提示框的样式由 .block-kind-callout 承担（见 CSS）
  return wrap;
}

/** 块内可编辑正文：引用 / 提示框 / 列表 / 待办 / 折叠 共用同一套行为。 */
function blockTextField(entry, block, index, extraClass) {
  const text = el('div', `block-text${extraClass ? ` ${extraClass}` : ''}`);
  if (editable()) text.contentEditable = 'true';
  text.dataset.placeholder = '按 / 插入区块，或直接开始写…';
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
  // 回车 = 在下面开一块并落光标。列表/待办/引用则续同类型，
  // Shift+回车是块内换行，不拦。
  // 注意：名字补全要在下面的回车处理**之前**挂上，接受候补时才拦得住"回车开新块"。
  attachNameCompleter(text, entry);
  text.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    const keep = ['bulleted', 'numbered', 'todo', 'quote', 'code'].includes(block.type) ? block.type : 'text';
    await saveBlock(entry, index, { html: text.innerHTML });
    await insertBlockAt(entry, index + 1, keep);
  });
  attachMentionPicker(text, entry);
  attachSlashMenu(text, entry, index);
  attachFormatBar(text, entry, index);
  return text;
}

/* ============================================================ 内联数据库
   一个块 = 某个实体类型下的全部卡片。数据源直接用 /api/world/documents?type=card
   （本来就带 card.values），列来自 S.types 里该类型的属性，改单元格 = 改那张卡。 */
const COLLECTION_VIEWS = [
  ['table', '表格', 'list'], ['board', '看板', 'layers'], ['list', '列表', 'align'],
  ['timeline', '时间轴', 'route'], ['calendar', '日历', 'maximize'], ['gallery', '画廊', 'image'],
];

/** 卡片上的某个属性值，转成一行可读文本。 */
function collectionCellText(prop, values) {
  const raw = values[String(prop.id)];
  if (raw === undefined || raw === null || raw === '') return '';
  if (Array.isArray(raw)) return raw.join('、');
  if (prop.value_type === 'reference') {
    const node = findNode(Number(raw) || 0);
    return node ? node.name : String(raw);
  }
  return String(raw);
}

/** 表格里的单元格编辑器：按属性类型给控件，改完直接写回那张卡（双向绑定）。 */
function collectionCellEditor(prop, row, entry) {
  const raw = row.values[String(prop.id)];
  const commit = async (value) => {
    await api(`/api/world/cards/${row.id}`, { method: 'PUT', body: { values: { [String(prop.id)]: value } } });
    toast(`已更新「${row.name}」的 ${prop.name}`);
  };
  const kind = prop.value_type;
  if (kind === 'select') {
    const select = el('select', 'cb-input');
    const empty = el('option', null, '—');
    empty.value = '';
    select.appendChild(empty);
    (prop.options || []).forEach((opt) => {
      const name = typeof opt === 'string' ? opt : (opt.name || opt.value || '');
      const option = el('option', null, name);
      option.value = name;
      select.appendChild(option);
    });
    select.value = raw === undefined || raw === null ? '' : String(raw);
    select.addEventListener('change', () => commit(select.value));
    return select;
  }
  if (kind === 'date') {
    const input = el('input', 'cb-input');
    input.type = 'date';
    input.value = raw ? String(raw).slice(0, 10) : '';
    input.addEventListener('change', () => commit(input.value));
    return input;
  }
  if (kind === 'number' || kind === 'formula') {
    const input = el('input', 'cb-input');
    input.type = 'number';
    input.value = raw === undefined || raw === null ? '' : String(raw);
    input.disabled = kind === 'formula';      // 公式列由后端算，不给人改
    input.addEventListener('change', () => commit(input.value === '' ? null : Number(input.value)));
    return input;
  }
  if (kind === 'multiselect' || kind === 'reference') {
    return el('div', 'cb-ro', collectionCellText(prop, row.values));   // 这两种先只读
  }
  const input = el('input', 'cb-input');
  input.type = 'text';
  input.value = raw === undefined || raw === null ? '' : String(raw);
  input.addEventListener('change', () => commit(input.value));
  return input;
}

function collectionCard(entry, row) {
  const card = el('button', 'cb-card');
  card.type = 'button';
  card.addEventListener('click', () => openDoc(row.id));
  card.appendChild(el('span', 'cb-cicon', row.icon || '📄'));
  card.appendChild(el('span', 'cb-cname', row.name || '未命名'));
  return card;
}

function renderCollectionTable(rows, columns, entry) {
  const table = el('table', 'cb-table');
  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', null, '名称'));
  columns.forEach((prop) => hr.appendChild(el('th', null, prop.name)));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el('tbody');
  rows.forEach((row) => {
    const tr = el('tr');
    tr.appendChild(el('td', null, '')).appendChild(collectionCard(entry, row));
    columns.forEach((prop) => {
      const td = el('td', 'cb-cell');
      td.appendChild(collectionCellEditor(prop, row, entry));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderCollectionBoard(rows, columns, entry) {
  const groupProp = columns.find((p) => p.value_type === 'select') || columns[0];
  const board = el('div', 'cb-board');
  if (!groupProp) { board.appendChild(el('div', 'hint', '这个类型还没有属性，没法分组。')); return board; }
  // 选项里可能有空名（属性定义的"未选"档），空名会造出一个没有标题的列 —— 滤掉
  const options = (groupProp.options || [])
    .map((o) => (typeof o === 'string' ? o : o.name || o.value || ''))
    .filter((name) => name);
  const buckets = new Map();
  options.forEach((name) => buckets.set(name, []));
  rows.forEach((row) => {
    const key = collectionCellText(groupProp, row.values) || '未分组';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  buckets.forEach((list, name) => {
    const col = el('div', 'cb-col');
    const head = el('div', 'cb-colhead');
    head.appendChild(el('span', null, name));
    head.appendChild(el('span', 'hint', `${list.length}`));
    col.appendChild(head);
    list.forEach((row) => {
      const card = collectionCard(entry, row);
      // 拖到别的列 = 改这个分组属性的值（和表格里改单元格是同一条写路径）
      card.draggable = true;
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(row.id));
      });
      col.appendChild(card);
    });
    col.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      col.classList.add('is-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('is-over'));
    col.addEventListener('drop', async (event) => {
      event.preventDefault();
      col.classList.remove('is-over');
      const rowId = Number(event.dataTransfer.getData('text/plain'));
      if (!rowId) return;
      await api(`/api/world/cards/${rowId}`, {
        method: 'PUT',
        body: { values: { [String(groupProp.id)]: name === '未分组' ? '' : name } },
      });
      toast(`已移到「${name}」`);
      renderPanels();
    });
    board.appendChild(col);
  });
  return board;
}

function renderCollectionGallery(rows, columns, entry) {
  const grid = el('div', 'cb-gallery');
  rows.forEach((row) => {
    const cell = el('button', 'cb-tile');
    cell.type = 'button';
    cell.addEventListener('click', () => openDoc(row.id));
    const art = el('span', 'cb-art');
    if (row.cover) {
      const img = el('img');
      img.src = row.cover;
      img.alt = '';
      art.appendChild(img);
    } else {
      art.appendChild(el('span', 'cb-articon', row.icon || '📄'));
    }
    cell.appendChild(art);
    cell.appendChild(el('span', 'cb-tname', row.name || '未命名'));
    grid.appendChild(cell);
  });
  return grid;
}

function renderCollectionList(rows, columns, entry) {
  const list = el('div', 'cb-list');
  rows.forEach((row) => {
    const item = el('div', 'cb-listrow');
    item.appendChild(collectionCard(entry, row));
    const meta = columns.slice(0, 3)
      .map((prop) => collectionCellText(prop, row.values))
      .filter(Boolean).join(' · ');
    item.appendChild(el('span', 'hint', meta));
    list.appendChild(item);
  });
  return list;
}

/** 日历的月份偏移（按块 id 记，不落库，切走再回来会回到当月）。 */
const collectionCalMonths = {};

function renderCollectionCalendar(rows, columns, entry, block) {
  const dateProp = columns.find((p) => p.value_type === 'date') || columns[0];
  const wrap = el('div', 'cb-cal');
  if (!dateProp) { wrap.appendChild(el('div', 'hint', '这个类型没有日期属性，摆不了日历。')); return wrap; }
  const offset = (block && collectionCalMonths[block.id]) || 0;
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const pad = anchor.getDay();

  const head = el('div', 'cb-calhead-row');
  const prev = el('button', 'cb-tab', '‹');
  prev.type = 'button';
  prev.title = '上一个月';
  prev.addEventListener('click', () => { collectionCalMonths[block.id] = offset - 1; renderPanels(); });
  const next = el('button', 'cb-tab', '›');
  next.type = 'button';
  next.title = '下一个月';
  next.addEventListener('click', () => { collectionCalMonths[block.id] = offset + 1; renderPanels(); });
  const title = el('span', 'cb-caltitle', `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`);
  head.appendChild(prev);
  head.appendChild(title);
  head.appendChild(next);
  if (offset) {
    const back = el('button', 'cb-tab', '回到本月');
    back.type = 'button';
    back.addEventListener('click', () => { collectionCalMonths[block.id] = 0; renderPanels(); });
    head.appendChild(back);
  }
  wrap.appendChild(head);

  const grid = el('div', 'cb-calgrid');
  ['日', '一', '二', '三', '四', '五', '六'].forEach((d) => grid.appendChild(el('div', 'cb-calhead', d)));
  for (let i = 0; i < pad; i += 1) grid.appendChild(el('div', 'cb-calcell is-blank'));
  for (let day = 1; day <= days; day += 1) {
    const cell = el('div', 'cb-calcell');
    cell.appendChild(el('span', 'cb-calday', String(day)));
    rows.forEach((row) => {
      const text = String(row.values[String(dateProp.id)] || '');
      if (!text) return;
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return;
      if (parsed.getFullYear() === anchor.getFullYear() && parsed.getMonth() === anchor.getMonth()
          && parsed.getDate() === day) cell.appendChild(collectionCard(entry, row));
    });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}

/** 时间轴：按第一个日期属性落在一条横向轴上（同日期的上下错开半格）。 */
function renderCollectionTimeline(rows, columns, entry) {
  const dateProp = columns.find((p) => p.value_type === 'date') || columns[0];
  const wrap = el('div', 'cb-tl');
  if (!dateProp) { wrap.appendChild(el('div', 'hint', '这个类型没有日期属性，摆不了时间轴。')); return wrap; }
  const points = rows.map((row) => {
    const text = String(row.values[String(dateProp.id)] || '');
    const time = text ? new Date(text).getTime() : NaN;
    return { row, time: Number.isNaN(time) ? null : time };
  }).filter((item) => item.time !== null);
  if (!points.length) { wrap.appendChild(el('div', 'hint', '这些卡片都还没填日期。')); return wrap; }

  points.sort((a, b) => a.time - b.time);
  const min = points[0].time;
  const max = points[points.length - 1].time;
  const span = Math.max(1, max - min);
  const track = el('div', 'cb-tl-track');

  const axis = el('div', 'cb-tl-axis');
  [...new Set(points.map((item) => new Date(item.time).getFullYear()))].forEach((year) => {
    const at = clamp(((new Date(year, 0, 1).getTime() - min) / span) * 100, 0, 100);
    const tick = el('span', 'cb-tl-tick', String(year));
    tick.style.left = `${at}%`;
    axis.appendChild(tick);
  });
  track.appendChild(axis);
  track.appendChild(el('div', 'cb-tl-line'));

  points.forEach((item, i) => {
    const dot = el('div', `cb-tl-dot${i % 2 ? ' is-low' : ''}`);
    dot.style.left = `${clamp(((item.time - min) / span) * 100, 0, 100)}%`;
    dot.appendChild(collectionCard(entry, item.row));
    dot.appendChild(el('span', 'cb-tl-date', String(new Date(item.time).toISOString().slice(0, 10))));
    track.appendChild(dot);
  });
  wrap.appendChild(track);
  return wrap;
}

/** 底部汇总：数值/公式列给 SUM 与计数。 */
function renderCollectionSummary(rows, columns, view) {
  const numeric = columns.filter((p) => p.value_type === 'number' || p.value_type === 'formula');
  const sum = el('div', 'cb-summary');
  sum.appendChild(el('span', 'hint', `${rows.length} 行`));
  numeric.forEach((prop) => {
    let total = 0;
    let filled = 0;
    rows.forEach((row) => {
      const value = Number(row.values[String(prop.id)]);
      if (Number.isFinite(value)) { total += value; filled += 1; }
    });
    sum.appendChild(el('span', 'hint', `${prop.name} 总和 ${Math.round(total * 100) / 100}（${filled} 个值）`));
  });
  if (view === 'board') sum.classList.add('is-compact');
  return sum;
}

/** 集合的视图设置：显示哪些列 / 按谁排序 / 按谁筛选 —— 都写进 block.settings。 */
function openCollectionSettings(anchor, entry, index, block) {
  const settings = block.settings || {};
  const typeId = Number(settings.entity_type) || null;
  const type = (S.types || []).find((t) => t.id === typeId) || null;
  const columns = ((type && type.properties) || []).filter((prop) => !prop.hidden);
  if (!columns.length) { toast('先给这个集合选一个卡片类型'); return; }

  const chosen = Array.isArray(settings.columns) && settings.columns.length
    ? settings.columns.map(String) : null;
  const draft = {
    columns: chosen ? [...chosen] : columns.map((prop) => String(prop.id)),
    sort: settings.sort || null,
    filter: settings.filter || null,
  };
  const save = async () => {
    await saveBlock(entry, index, { settings: { ...settings, ...draft } }, '设置集合视图');
    renderPanels();
  };

  const menu = el('div', 'fb-menu cb-settings');
  menu.appendChild(el('div', 'bm-group', '显示这些列'));
  columns.forEach((prop) => {
    const row = el('label', 'cbs-row');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = draft.columns.includes(String(prop.id));
    box.addEventListener('change', () => {
      const key = String(prop.id);
      draft.columns = box.checked
        ? [...draft.columns, key]
        : draft.columns.filter((item) => item !== key);
      save();
    });
    row.appendChild(box);
    row.appendChild(el('span', null, prop.name));
    menu.appendChild(row);
  });

  const propSelect = (label) => {
    const select = el('select', 'cb-input');
    const none = el('option', null, label);
    none.value = '';
    select.appendChild(none);
    columns.forEach((prop) => {
      const option = el('option', null, prop.name);
      option.value = String(prop.id);
      select.appendChild(option);
    });
    return select;
  };

  menu.appendChild(el('div', 'bm-group', '排序'));
  const sortSel = propSelect('不排序');
  sortSel.value = draft.sort ? String(draft.sort.id) : '';
  const dir = el('button', 'cb-tab', draft.sort && draft.sort.dir === 'desc' ? '降序 ↓' : '升序 ↑');
  dir.type = 'button';
  dir.addEventListener('click', () => {
    if (!draft.sort) { toast('先选一个排序字段'); return; }
    draft.sort = { ...draft.sort, dir: draft.sort.dir === 'desc' ? 'asc' : 'desc' };
    dir.textContent = draft.sort.dir === 'desc' ? '降序 ↓' : '升序 ↑';
    save();
  });
  sortSel.addEventListener('change', () => {
    draft.sort = sortSel.value
      ? { id: Number(sortSel.value), dir: (draft.sort && draft.sort.dir) || 'asc' } : null;
    save();
  });
  const sortRow = el('div', 'cbs-row');
  sortRow.appendChild(sortSel);
  sortRow.appendChild(dir);
  menu.appendChild(sortRow);

  menu.appendChild(el('div', 'bm-group', '筛选'));
  const filterSel = propSelect('不筛选');
  filterSel.value = draft.filter ? String(draft.filter.id) : '';
  const filterText = el('input', 'cb-input');
  filterText.type = 'text';
  filterText.placeholder = '包含…';
  filterText.value = (draft.filter && draft.filter.text) || '';
  const collectFilter = () => {
    draft.filter = filterSel.value && filterText.value
      ? { id: Number(filterSel.value), text: filterText.value } : null;
    save();
  };
  filterSel.addEventListener('change', collectFilter);
  filterText.addEventListener('change', collectFilter);
  const filterRow = el('div', 'cbs-row');
  filterRow.appendChild(filterSel);
  filterRow.appendChild(filterText);
  menu.appendChild(filterRow);

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.right - menu.offsetWidth, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  const close = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/** 内联数据库块。 */
function renderCollectionBlock(entry, block, index) {
  const settings = block.settings || {};
  const typeId = Number(settings.entity_type) || null;
  const view = settings.view || 'table';
  const box = el('div', 'collection-block');

  const head = el('div', 'cb-head');
  const typeSelect = el('select', 'mini-select');
  const blank = el('option', null, '选择卡片类型…');
  blank.value = '';
  typeSelect.appendChild(blank);
  (S.types || []).filter((t) => !t.hidden).forEach((t) => {
    const option = el('option', null, t.name);
    option.value = t.id;
    typeSelect.appendChild(option);
  });
  typeSelect.value = typeId ? String(typeId) : '';
  typeSelect.addEventListener('change', async () => {
    const next = { ...settings, entity_type: Number(typeSelect.value) || null };
    await saveBlock(entry, index, { settings: next }, '设置集合类型');
    renderPanels();
  });
  head.appendChild(typeSelect);

  const tabs = el('div', 'cb-tabs');
  COLLECTION_VIEWS.forEach(([key, label, ico]) => {
    const tab = el('button', `cb-tab${key === view ? ' is-active' : ''}`);
    tab.type = 'button';
    tab.appendChild(icon(ico, 13));
    tab.appendChild(el('span', null, label));
    tab.addEventListener('click', async () => {
      await saveBlock(entry, index, { settings: { ...settings, view: key } }, '切换集合视图');
      renderPanels();
    });
    tabs.appendChild(tab);
  });
  const gear = el('button', 'cb-tab');
  gear.type = 'button';
  gear.title = '视图设置：显示哪些列 / 排序 / 筛选';
  gear.appendChild(icon('sliders', 13));
  gear.addEventListener('click', () => openCollectionSettings(gear, entry, index, block));
  head.appendChild(tabs);
  head.appendChild(gear);
  box.appendChild(head);

  const body = el('div', 'cb-body');
  box.appendChild(body);
  if (!typeId) {
    body.appendChild(emptyBlock({
      iconName: 'grid-3x3', title: '还没选卡片类型',
      text: '集合会把某个类型下的全部卡片摆进来。先在左上角选一个类型。',
    }));
    return box;
  }

  const type = (S.types || []).find((t) => t.id === typeId) || null;
  const allColumns = ((type && type.properties) || []).filter((prop) => !prop.hidden);
  // 视图设置：只显示选中的列（没设置就全显示）
  const chosen = Array.isArray(settings.columns) && settings.columns.length
    ? settings.columns.map(String) : null;
  const columns = chosen ? allColumns.filter((prop) => chosen.includes(String(prop.id))) : allColumns;
  body.appendChild(el('div', 'hint', '载入中…'));
  api('/api/world/documents?type=card').then((data) => {
    let rows = (data.documents || [])
      .filter((doc) => (doc.entity_type || null) === typeId)
      .map((doc) => ({
        id: doc.id, name: doc.name, cover: doc.cover, icon: doc.icon,
        values: (doc.card && doc.card.values) || {},
      }));
    // 筛选：某个属性「包含」某段文字
    const filter = settings.filter;
    if (filter && filter.id && filter.text) {
      const prop = allColumns.find((item) => String(item.id) === String(filter.id));
      const needle = String(filter.text).toLowerCase();
      if (prop) rows = rows.filter((row) => collectionCellText(prop, row.values).toLowerCase().includes(needle));
    }
    // 排序：数字按大小、其余按本地化字符串
    const sort = settings.sort;
    if (sort && sort.id) {
      const prop = allColumns.find((item) => String(item.id) === String(sort.id));
      if (prop) {
        rows = [...rows].sort((a, b) => {
          const av = collectionCellText(prop, a.values);
          const bv = collectionCellText(prop, b.values);
          const an = Number(av);
          const bn = Number(bv);
          const numeric = av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn);
          const cmp = numeric ? an - bn : String(av).localeCompare(String(bv), 'zh');
          return sort.dir === 'desc' ? -cmp : cmp;
        });
      }
    }
    body.innerHTML = '';
    if (!rows.length) {
      body.appendChild(emptyBlock({
        iconName: 'card-plus', title: '没有可显示的卡片',
        text: '要么这个类型下还没有卡片，要么都被筛选条件挡掉了。',
      }));
      return;
    }
    const renderers = {
      table: renderCollectionTable, board: renderCollectionBoard,
      gallery: renderCollectionGallery, list: renderCollectionList,
      calendar: renderCollectionCalendar, timeline: renderCollectionTimeline,
    };
    body.appendChild((renderers[view] || renderCollectionTable)(rows, columns, entry, block, index));
    if (view !== 'calendar' && view !== 'timeline') {
      body.appendChild(renderCollectionSummary(rows, columns, view));
    }
  }).catch(() => {
    body.innerHTML = '';
    body.appendChild(el('div', 'hint', '载入失败，稍后再试。'));
  });
  return box;
}

/** 有序列表的序号：往回数一数前面连着几个同类型的块。 */
function ordinalOf(entry, index) {
  const blocks = entry.card.blocks || [];
  let n = 1;
  for (let i = index - 1; i >= 0; i -= 1) {
    if ((blocks[i] || {}).type !== 'numbered') break;
    n += 1;
  }
  return n;
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
  // 新块一律不带标题（块就是一个正文）
  blocks.push({ id, type: kind, title: '', text: '' });
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

/* 「四向插入」的左右：左右表示并排分栏，这里落成「并排组」标记 */
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

/* ------------------------------------------------- @ 提及 */
/**
 * 在正文里输入 `@` 拉起卡片选择器：
 *  - 输入 `@` 后面的字作为关键词，去 /api/world/search 找卡片；
 *  - 回车或点击就把「@关键词」替换成卡片名；
 *  - 如果输入的词和卡片名不同，顺手把这个词存成它的别名（这样以后用这个词也能指回同一张卡）。
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

/* --------------------------------------------------- 打字补全（精确名字） */
/**
 * 打字时自动弹出「精确名字」候补：把一个词的前缀 / 包含命中列出来，选中即补成正式名字。
 *  - 只认当前光标前的一个词，至少两个字符才触发（避免每敲一个字都蹦）；
 *  - `@` 提及与 `/` 区块菜单在场时让位，各自那套更具体；
 *  - 候选里带类型与描述，回车 / Tab / 点击都能接受（只把词替换成名字，链路由渲染时的识别补上）。
 */
function attachNameCompleter(node, entry) {
  const state = { open: false, query: '', items: [], index: 0 };
  const popup = el('div', 'mention-pop');
  popup.hidden = true;
  document.body.appendChild(popup);

  const close = () => {
    state.open = false;
    popup.hidden = true;
    popup.innerHTML = '';
  };

  // 光标前那一个词（不含空白与标点）；已被 `@` / `/` 接管时返回 null
  const wordBeforeCaret = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer)) return null;
    const text = (range.startContainer.textContent || '').slice(0, range.startOffset);
    if (/[@/][^\s@/]*$/.test(text)) return null;
    const match = /([^\s@/，。、；：！？…—·"'（）()【】\[\]{}<>,.!?;:]{1,20})$/.exec(text);
    return match ? match[1] : null;
  };

  const renderPopup = () => {
    popup.innerHTML = '';
    state.items.forEach((item, index) => {
      const row = el('div', `mention-row${index === state.index ? ' is-active' : ''}`);
      row.appendChild(el('span', 'mr-name', item.name));
      const meta = [item.entity_type, item.description].filter(Boolean).join(' · ');
      if (meta) row.appendChild(el('span', 'mr-kind mr-desc', meta));
      row.addEventListener('mousedown', (event) => { event.preventDefault(); insert(item); });
      popup.appendChild(row);
    });
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const base = rect && rect.width ? rect : node.getBoundingClientRect();
    popup.style.left = `${Math.min(base.left, window.innerWidth - 280)}px`;
    popup.style.top = `${base.bottom + 6}px`;
    popup.hidden = false;
  };

  const insert = (item) => {
    // 退掉已输入的关键词，再插入正式名字（用 execCommand 保住已有格式）
    for (let i = 0; i < state.query.length; i += 1) document.execCommand('delete');
    document.execCommand('insertText', false, item.name);
    close();
    saveBlock(entry, indexOfBlock(node), { html: node.innerHTML });
  };

  const search = debounce_(async () => {
    const query = state.query;
    const data = await api(`/api/world/complete?q=${encodeURIComponent(query)}&exclude=${entry.document.id}&limit=8`);
    if (query !== state.query) return;                 // 结果过期，丢弃
    state.items = data.results || [];
    state.index = 0;
    if (!state.items.length) { close(); return; }
    state.open = true;
    renderPopup();
  }, 140);

  node.addEventListener('input', (event) => {
    if (event.isComposing) return;                     // 中文输入法正在拼字，先别打扰
    const word = wordBeforeCaret();
    if (!word || word.length < 2) { close(); return; }
    state.query = word;
    search();
  });

  // 注册在块自身的回车处理之前（见 blockTextField），这样接受候补能拦下"回车开新块"
  node.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation();
      state.index = clamp(state.index + (event.key === 'ArrowDown' ? 1 : -1), 0, state.items.length - 1);
      renderPopup();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      const item = state.items[state.index];
      if (item) insert(item);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      close();
    }
  });

  node.addEventListener('blur', () => setTimeout(close, 120));
}

/* --------------------------------------------------- `/` 斜杠菜单 */
const SLASH_ITEMS = [
  { key: 'text', label: '文本', hint: '普通段落', type: 'text' },
  { key: 'h1', label: '标题 1', hint: '大章节标题', type: 'heading', html: '<h1>' },
  { key: 'h2', label: '标题 2', hint: '中章节标题', type: 'heading', html: '<h2>' },
  { key: 'h3', label: '标题 3', hint: '小章节标题', type: 'heading', html: '<h3>' },
  { key: 'quote', label: '引用', hint: '带引用样式', type: 'quote' },
  { key: 'callout', label: '提示框', hint: '规则或需要记住的事', type: 'callout' },
  { key: 'divider', label: '分隔线', hint: '水平分隔', type: 'divider' },
  { key: 'ul', label: '无序列表', hint: '圆点列表', type: 'bulleted' },
  { key: 'ol', label: '有序列表', hint: '编号列表', type: 'numbered' },
  { key: 'todo', label: '待办事项', hint: '带复选框', type: 'todo' },
  { key: 'toggle', label: '折叠列表', hint: '可展开收起', type: 'toggle' },
  { key: 'code', label: '代码块', hint: '等宽代码', type: 'code' },
  { key: 'bookmark', label: '网页书签', hint: '把网址摆成卡片', type: 'bookmark' },
  { key: 'inline-code', label: '行内代码', hint: '<code>', command: 'inline', wrap: 'code' },
  { key: 'b', label: '加粗', hint: '⌘B', command: 'bold' },
  { key: 'i', label: '斜体', hint: '⌘I', command: 'italic' },
];

/** 输入 `/` 拉起区块菜单。 */
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
    if (item.type === 'bookmark') {            // 书签：先要个网址
      const url = await askText({ label: '书签网址', value: 'https://' });
      if (url === null || !url.trim()) return;
      await saveBlock(entry, index, { type: 'bookmark', settings: { url: url.trim() } }, '插入书签');
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
 * 选区气泡：上排是**动作**（创建卡片 / 链接卡片），下排是**格式**——
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
  bar.appendChild(fbButton('link', null, '插入 / 取消链接', async (button) => {
    const target = FORMAT_BAR.target;
    const selection = window.getSelection();
    let inside = selection && selection.anchorNode;
    while (inside && inside.nodeType !== 1) inside = inside.parentNode;
    const existing = inside && inside.closest ? inside.closest('a') : null;
    if (existing) { runCommand('unlink'); return; }
    // 浮层会把焦点从正文里拿走——先把选区存下来，插链接前还回去
    const savedRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const url = await askText({ label: '链接地址', value: 'https://' });
    if (url) {
      if (savedRange) {
        const back = window.getSelection();
        back.removeAllRanges();
        back.addRange(savedRange);
      }
      runCommand('createLink', url);
    }
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
    body: { type: 'card', name: text.slice(0, 60), entity_type: null },
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

/** 块类型的中文名（块菜单页脚等处复用）。 */
const BLOCK_LABEL = {
  text: '正文', heading: '标题', quote: '引用', callout: '提示框', divider: '分隔线',
  bulleted: '无序列表', numbered: '有序列表', todo: '待办事项', toggle: '折叠列表',
  code: '代码', bookmark: '网页书签', card: '嵌入卡', image: '图片', embed: '嵌入',
  media: '媒体', tool: '工具', table: '表格',
};

/** 块菜单：转换类型 / 复制 / 上下移 / 隐藏 / 删除（拖动把手点一下打开）。 */
function openBlockMenu(anchor, entry, index) {
  const block = (entry.card.blocks || [])[index];
  if (!block) return;
  const menu = el('div', 'fb-menu block-menu');

  // 块菜单第一行是「搜索操作…」——操作有近 20 项，靠敲比靠眼睛找快。
  const search = el('input', 'bm-search');
  search.type = 'text';
  search.placeholder = '搜索操作…';
  search.setAttribute('aria-label', '搜索操作');
  menu.appendChild(search);

  const list = el('div', 'bm-list');
  menu.appendChild(list);

  const rows = [];
  const item = (label, iconName, run, danger, shortcut) => {
    const button = el('button', danger ? 'is-danger' : null);
    button.type = 'button';
    if (iconName) button.appendChild(icon(iconName, 14));
    button.appendChild(el('span', 'bm-label', label));
    if (shortcut) button.appendChild(el('kbd', 'bm-hint', shortcut));
    button.addEventListener('click', async () => {
      menu.remove();
      document.removeEventListener('keydown', onKey);
      await run();
    });
    list.appendChild(button);
    rows.push({ button, label });
    return button;
  };
  const sep = () => list.appendChild(el('div', 'fb-sep'));
  const group = (text) => list.appendChild(el('div', 'bm-group', text));

  group('转换成');
  const convert = (type, label, iconName) => item(label, iconName, async () => {
    if (block.type === type) return;
    await saveBlock(entry, index, { type }, '转换区块类型');
    renderPanels();
  });
  convert('text', '正文', 'type');
  convert('heading', '标题', 'type');
  convert('bulleted', '无序列表', 'list');
  convert('numbered', '有序列表', 'list-ordered');
  convert('todo', '待办事项', 'circle-check');
  convert('toggle', '折叠列表', 'chevron-right');
  convert('quote', '引用', 'quote');
  convert('callout', '提示框', 'circle-alert');
  convert('code', '代码', 'hash');

  sep();
  group('排版');
  item('上移一块', 'arrow-up', () => moveBlock(entry, index, -1));
  item('下移一块', 'arrow-down', () => moveBlock(entry, index, 1));
  item('缩进一层', 'chevron-right', async () => {
    const level = Math.min(2, (Number(block.level) || 0) + 1);
    await saveBlock(entry, index, { level }, '缩进区块');
    renderPanels();
    announce(`已缩进到第 ${level} 层`);
  });
  item('取消缩进', 'chevron-left', async () => {
    const level = Math.max(0, (Number(block.level) || 0) - 1);
    await saveBlock(entry, index, { level }, '取消缩进');
    renderPanels();
    announce(level ? `已缩进到第 ${level} 层` : '已回到顶层');
  });
  item(block.collapsed ? '展开这一块' : '折叠这一块', block.collapsed ? 'chevron-down' : 'chevron-up', async () => {
    await saveBlock(entry, index, { collapsed: !block.collapsed }, '折叠区块');
    renderPanels();
  });

  sep();
  item('在上面插入一块', 'circle-plus', () => insertBlockAt(entry, index));
  item('在下面插入一块', 'circle-plus', () => insertBlockAt(entry, index + 1));
  item('复制这一块', 'file', () => duplicateBlock(entry, index), null, '⌘D');
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
  item('插入书签…', 'link', async () => {
    const url = await askText({ label: '书签网址', value: 'https://' });
    if (url === null || !url.trim()) return;
    await saveBlock(entry, index, { type: 'bookmark', settings: { url: url.trim() } }, '插入书签');
    renderPanels();
  });
  item(block.hidden ? '在站点上显示' : '在站点上隐藏', block.hidden ? 'eye' : 'eye-off', () => toggleBlockHidden(entry, index));
  const commentCount = (block.comments || []).length;
  item(commentCount ? `评论（${commentCount}）` : '评论…', 'message-circle-more', () => openBlockComments(anchor, entry, index), null, '⌘⇧M');

  sep();
  item('删除这一块', 'trash-2', () => removeBlock(entry, index), true, 'Del');

  // 页脚：这一块的体量（块菜单底部也挂着一行统计）
  const plain = (block.text || '').trim();
  const words = (plain.match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g) || []).length;
  const foot = el('div', 'bm-foot');
  foot.appendChild(el('div', null, `这一块 · ${BLOCK_LABEL[block.type] || block.type}`));
  foot.appendChild(el('div', null, `${words} 个单词，${plain.length} 个字符`));
  menu.appendChild(foot);

  // 顶部搜索直接过滤（打错也别卡住，没匹配就空着）
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    rows.forEach(({ button, label }) => {
      button.hidden = Boolean(query) && !label.toLowerCase().includes(query);
    });
  });

  // 菜单开着时的快捷键（对应右侧那列提示）
  const onKey = async (event) => {
    if (event.key === 'Escape') {
      menu.remove();
      document.removeEventListener('keydown', onKey);
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    if (!mod && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      menu.remove();
      document.removeEventListener('keydown', onKey);
      await removeBlock(entry, index);
      return;
    }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      menu.remove();
      document.removeEventListener('keydown', onKey);
      await duplicateBlock(entry, index);
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      menu.remove();
      document.removeEventListener('keydown', onKey);
      openBlockComments(anchor, entry, index);
    }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${clamp(rect.left, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  search.focus();
  const close = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
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

async function insertBlockAt(entry, index, type = 'text') {
  const blocks = [...(entry.card.blocks || [])];
  blocks.splice(index, 0, { id: `b${Date.now().toString(36)}`, type, title: '', text: '' });
  await saveBlocks(entry, blocks, '插入区块');
  renderPanels();
  // 插完把光标放到新块里（回车换块、块左边的 ＋ 都靠这一句接着往下写）
  setTimeout(() => {
    const node = $(`.card-view[data-doc="${entry.document.id}"] .block[data-index="${index}"] .block-text`);
    if (node) node.focus();
  }, 0);
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
    if (!comments.length) list.appendChild(el('p', 'hint', '还没有评论。'));
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
    // 乐观 UI：先上屏，再落库；**失败要回滚并闪一下琥珀**
    const optimistic = {
      id: `c${Date.now().toString(36)}`,
      author: '我',
      text,
      at: new Date().toISOString(),
      resolved: false,
    };
    comments.push(optimistic);
    input.value = '';
    render();
    try {
      await saveComments();
      render();
      announce('评论已保存');
    } catch (error) {
      // 回滚：把这条从本地列表里拿掉，并把文字还给输入框，别让人重打一遍
      const index_ = comments.indexOf(optimistic);
      if (index_ >= 0) comments.splice(index_, 1);
      input.value = text;
      render();
      const box = pop.querySelector('.comment-list, .comment-rows') || pop;
      if (typeof box.animate === 'function' && typeof Opus !== 'undefined' && !Opus.reduced()) {
        box.animate([
          { boxShadow: 'inset 0 0 0 1px rgba(224, 168, 60, 0.85)' },
          { boxShadow: 'inset 0 0 0 1px rgba(224, 168, 60, 0)' },
        ], { duration: 700, easing: 'ease-out' });
      }
      if (!error || !error.isSurfaced) toast('评论没发出去，先给你留着了', { kind: 'warn' });
      announce('评论没保存成功，已经放回输入框');
    }
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
  render();
  /* 定位按实测尺寸算，别按写死的 320：浮层宽高改了之后写死的数字会把便签
     顶到视口外（窄屏尤其明显）。默认贴在块的右下角，放不下就翻到上方。 */
  const rect = anchor.getBoundingClientRect();
  const box = pop.getBoundingClientRect();
  const margin = 8;
  pop.style.left = `${clamp(rect.right - box.width, margin, Math.max(margin, window.innerWidth - box.width - margin))}px`;
  const below = rect.bottom + margin;
  pop.style.top = `${below + box.height > window.innerHeight - margin
    ? Math.max(margin, rect.top - box.height - margin)
    : below}px`;
  input.focus();
  const dismiss = () => {
    pop.remove();
    document.removeEventListener('mousedown', close);
    document.removeEventListener('keydown', onKey);
  };
  const close = (event) => {
    if (!pop.contains(event.target) && !anchor.contains(event.target)) dismiss();
  };
  // Esc 也能收掉这张"便签"（和外层浮层的约定一致，键盘用户不用去够鼠标）
  const onKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
  }, 0);
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
  const currentIndex = options.findIndex((t) => t.id === entry.document.entity_type);
  const chosen = await askChoice({
    title: '选择类型',
    index: currentIndex >= 0 ? currentIndex : 0,
    options: options.map((t) => ({ value: t.id, label: t.name })),
  });
  if (!chosen) return;
  await api(`/api/world/documents/${entry.document.id}`, { method: 'PUT', body: { entity_type: chosen.value } });
  await refreshDoc(entry.document.id);
  toast(`类型已改为「${chosen.label}」`);
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
 * 复用已有的经典编辑器：面板里直接嵌 `/w/timeline/<doc_id>`，
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

    /* 事件拖动：节点跟手、**原位留一个虚线轮廓**、松手 200ms 回弹。
       横向拖 = 改年份（落库），拖回原地 = 弹回原位。 */
    const nodes = [dot, stem, pill];
    const startDrag = (downEvent) => {
      if (downEvent.button !== 0) return;
      downEvent.stopPropagation();
      downEvent.preventDefault();
      const startX = downEvent.clientX;
      const originX = xFor(event.year);
      let moved = false;
      let dx = 0;
      const ghost = el('div', 'tl-ghost');
      ghost.style.left = `${originX}px`;
      ghost.style.top = dot.style.top;
      canvas.appendChild(ghost);
      const ghostPill = el('div', 'tl-ghost-pill');
      ghostPill.style.left = `${originX}px`;
      ghostPill.style.top = pill.style.top;
      ghostPill.style.width = `${pill.getBoundingClientRect().width}px`;
      canvas.appendChild(ghostPill);
      canvas.classList.add('is-dragging-event');

      const paint = (shift) => { nodes.forEach((node) => { node.style.transform = `translateX(${shift}px)`; }); };
      const onMove = (moveEvent) => {
        dx = moveEvent.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        paint(dx);
      };
      const springBack = (from) => {
        nodes.forEach((node) => {
          if (typeof node.animate !== 'function') { node.style.transform = ''; return; }
          node.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }],
            { duration: 200, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
        });
      };
      const onUp = async (upEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        canvas.classList.remove('is-dragging-event');
        ghost.remove();
        ghostPill.remove();
        if (!moved) { paint(0); return; }              // 没拖动：当成普通点击
        ui.suppressClick = true;
        const shift = upEvent.clientX - startX;
        const newYear = Math.round(yearFor(originX + shift));
        if (newYear === event.year) {                  // 原地放下：弹回去
          springBack(shift);
          nodes.forEach((node) => setTimeout(() => { node.style.transform = ''; }, 220));
          return;
        }
        const payload = await api(`/api/world/events/${event.id}`, {
          method: 'PUT',
          body: { year: newYear, month: event.month || 1, day: event.day || 1 },
        }).catch(() => null);
        if (!payload) { springBack(shift); return; }
        Object.assign(event, payload);
        toast(`「${event.title}」挪到了 ${payload.date_label || newYear}`, 2200);
        entry.timeline.events = entry.timeline.events.map((item) => (item.id === event.id ? event : item));
        renderPanels();                                // 重画之后位置就是新的年份了
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    dot.addEventListener('pointerdown', startDrag);
    pill.addEventListener('pointerdown', startDrag);
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

/* 日历设置面板（settings.* 文案） */
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
    const presetName = await askText({ label: '预设名称', value: `${calendar.name} 预设` });
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

/* 事件卡片：名称 / 精度 / 年月日时 / 纪元 / 描述 / 关联卡片（editor.*） */
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
    const url = await askText({ label: '封面图片地址', value: event.cover || '' });
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

/* 纪元管理（settings.eras / eraLengthYears） */
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
      const name = await askText({ label: '纪元名称', value: '新纪元' });
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
      const name = await askText({ label: '类型名称', value: '新类型' });
      if (!name) return;
      await api('/api/world/types', { method: 'POST', body: { name } });
      closeModal();
      await typeManager();
    });
    left.appendChild(addType);

    const addSub = el('button', 'mini-btn', '＋ 子类型');
    addSub.addEventListener('click', async () => {
      if (!current.id) return;
      const name = await askText({ label: '子类型名称', value: '新子类型' });
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
        renderPanels();
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
        renderPanels();
        await typeManager();
      });
      nameRow.appendChild(del);
      right.appendChild(nameRow);

      const table = el('table', 'prop-table');
      table.innerHTML = `<thead><tr><th>属性</th><th>值类型</th><th>必填</th><th>默认值</th><th>已有卡片</th><th>公式 / 选项</th><th></th></tr></thead>`;
      const tbody = el('tbody');
      type.properties.forEach((prop) => {
        const row = el('tr');
        const nameCell = el('td');
        const input = el('input', 'mini-input');
        input.value = prop.name;
        input.addEventListener('blur', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { name: input.value.trim() } });
          renderPanels();
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
          renderPanels();
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

        const existingCell = el('td');
        const existing = el('input');
        existing.type = 'checkbox';
        existing.checked = !!prop.show_on_existing;
        existing.title = '勾上：以后新建这个属性时，已有卡片也会补上默认值。';
        existing.addEventListener('change', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'PUT', body: { show_on_existing: existing.checked } });
          toast(existing.checked ? '已有卡片会同步补上这个属性' : '不再同步到已有卡片');
        });
        existingCell.appendChild(existing);
        row.appendChild(existingCell);

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
          const ref = el('select', 'mini-select');
          const any = el('option', null, '任意类型');
          any.value = '';
          ref.appendChild(any);
          types.forEach((candidate) => {
            const option = el('option', null, candidate.name);
            option.value = candidate.id;
            ref.appendChild(option);
          });
          ref.value = prop.reference_type == null ? '' : String(prop.reference_type);
          ref.addEventListener('change', async () => {
            await api(`/api/world/properties/${prop.id}`, {
              method: 'PUT', body: { reference_type: ref.value ? Number(ref.value) : null },
            });
            toast('引用目标已保存');
          });
          extraCell.appendChild(ref);
        }
        row.appendChild(extraCell);

        const actionCell = el('td');
        const remove = el('button', 'mini-btn is-danger', '删除');
        remove.dataset.danger = '1';
        remove.addEventListener('click', async () => {
          await api(`/api/world/properties/${prop.id}`, { method: 'DELETE' });
          renderPanels();
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
        renderPanels();
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
 * 关系树面板 = 独立页 ``/relationship`` 的只读/可编辑嵌入。
 *
 * 面板里直接嵌独立页，只保留**一份实现**：同一棵树在两处长得一样，
 * 修一个 bug 不用改两遍，新功能自动两边都有。
 *
 * iframe 用 ``liveEmbed`` 认领：面板整块重建时它不会被销毁，所以点人、切标签
 * 都不会把画布上的选中 / 平移 / 缩放弄丢。
 */
function renderTreeFrame(entry) {
  const wrap = el('div', 'tree-wrap');
  const key = `tree:${entry.document.id}`;
  const frame = liveEmbed(key, () => {
    const node = el('iframe', 'tree-frame');
    node.title = `${entry.document.name} · 关系树`;
    return node;
  });
  // 只读成员看到的也是只读画布；权限变了只换参数，不重建 iframe。
  // 主机（工作区面板）是暗色终端外壳，画布必须同色，所以这里不带 theme=paper：
  // 外壳只有一套暗色形态，没有浅色纸面档，
  // 服务端收到 theme=paper 也会落到暗色（world/relationship.py）。
  const src = `/relationship?doc=${entry.document.id}&embed=1`
    + (editable() && !isEmbedded() ? '&readonly=0' : '&readonly=1');
  if (frame.dataset.src !== src) {
    frame.dataset.src = src;
    frame.src = src;
  }
  wrap.appendChild(frame);
  return wrap;
}

/* ================================================================== 地图 */
/**
 * 跳到独立地图页：面板里嵌的那一份是窄栏版（原本的右栏收掉了，只留左栏三块面板），
 * 要完整外壳（顶栏 + 两条栏）就走这里。入口在标签页与侧栏那一行的右键菜单上。
 */
function openStandaloneMap(id) {
  window.open(`/map/2d?doc=${id}`, '_blank', 'noopener');
}

/**
 * 地图面板 = 独立页 ``/map`` 的嵌入。
 *
 * 面板里直接嵌独立页，只保留**一份实现**：同一个 bug 不用修两遍，
 * 也不会因为挤在一条窄面板里让聚合变形，新功能自动两边都有。
 *
 * 嵌入的是平面档（``/map/2d``）：面板那一块地方放不下地形飞行，也不该放。
 * 想看地形从面板顶栏的「地形」切过去，或者右键标签页「在独立地图页打开」。
 *
 * iframe 用 ``liveEmbed`` 认领：面板整块重建时它不会被销毁，所以拖着看、
 * 切标签、点人，画布上的平移缩放都不会丢。
 */
function renderMapFrame(entry) {
  const wrap = el('div', 'map-wrap');
  const key = `map:${entry.document.id}`;
  const frame = liveEmbed(key, () => {
    const node = el('iframe', 'map-frame');
    node.title = `${entry.document.name} · 地图`;
    return node;
  });
  const src = `/map/2d?doc=${entry.document.id}&embed=1`
    + (editable() && !isEmbedded() ? '&readonly=0' : '&readonly=1');
  if (frame.dataset.src !== src) {
    frame.dataset.src = src;
    frame.src = src;
  }
  wrap.appendChild(frame);
  return wrap;
}

/* ============================================================== 世界图谱 */
/* ==========================================================================
   图谱的"鱼群"物理（Boids：分离 / 对齐 / 内聚 + 连线弹簧）
   --------------------------------------------------------------------------
   拖动一个点的时候，动的**不只是它和它连着的点**——整张图都在轻轻流动，
   和它没有连线的点也会被挤开、被带着走一点，松手之后再自己安定下来。
   这正是鱼群算法那三条局部规则干的事：

     · 分离（separation）：离得太近就互相推开——**和有没有连线无关**，
       所以"没连线的点也会动"是这条给的；
     · 对齐（alignment）：速度向附近点的平均速度靠——让整片像一群鱼一样
       平滑地流动，而不是一根根橡皮筋各弹各的（这是"不生硬"的关键）；
     · 内聚（cohesion）：轻轻往附近点的中心靠，免得越飘越散。

   另外连线仍然是弹簧（保持关系形状），加一点点向心与阻尼。为了几百个点也能
   稳在 60fps：用一个"格子分桶"，每个点只和相邻 9 格里的点算。
   不拖动时整个模拟是**停的**（不烧 CPU），松手后按 alpha 冷却再停。
   ========================================================================== */
function createGraphFlock({ nodes, links, pos, width, height, paint, onSettle }) {
  const ids = nodes.map((node) => node.id).filter((id) => pos.has(id));
  const springs = [];
  links.forEach((link) => {
    const a = pos.get(link.source);
    const b = pos.get(link.target);
    if (!a || !b) return;
    springs.push({ a, b, aId: link.source, bId: link.target,
                   rest: Math.max(26, Math.hypot(b.x - a.x, b.y - a.y)) });
  });

  // 连通分量：用来判断"这个点和被选中的点是不是一伙的"。
  // 一伙的 -> 吃连线弹簧 + 鱼群的对齐/内聚；不是一伙的 -> 只有被挤开的份儿。
  const owner = new Map();
  const find = (id) => {
    let root = id;
    while (owner.get(root) !== root) root = owner.get(root);
    return root;
  };
  ids.forEach((id) => owner.set(id, id));
  links.forEach((link) => {
    if (!owner.has(link.source) || !owner.has(link.target)) return;
    const ra = find(link.source);
    const rb = find(link.target);
    if (ra !== rb) owner.set(ra, rb);
  });

  // 每个点"原来的家"：被挤开之后慢慢飘回来，保证整片不会被挤散、中间变空
  const home = new Map();
  ids.forEach((id) => {
    const point = pos.get(id);
    home.set(id, { x: point.x, y: point.y });
  });

  const SEP_R = 86;        // 分离半径：比这近就互相推开（和有没有连线无关）
  const SEP_K = 0.04;      // 分离强度（越近越硬，像果冻）
  const ALIGN_R = 112;     // 对齐半径
  const ALIGN_K = 0.03;    // 对齐强度
  const COHERE_K = 0.003;  // 内聚强度
  const SPRING_K = 0.062;  // 连线弹簧：把别人拽向选中点
  const HOME_K = 0.009;    // "回家"力度：只给不参与鱼群的点，保证不散也不挤
  const CENTER_K = 0.0006; // 全局向心：兜底，别让整片飘出画布
  const DAMPING = 0.88;
  const MAX_V = 7;
  const DRAG_BOOST = 1.7;  // 被拖的点"个头更大"：挤开周围更明显
  const COOL = 0.96;       // 松手后的冷却速度
  const GLIDE_DAMP = 0.945;// 惯性滑行的阻尼（松手后继续往前滑一段）
  const THROW = 0.8;       // 甩出去的速度系数

  const buckets = new Map();
  let sel = null;          // { id, mode: 'drag' | 'glide' | 'idle', vx, vy }
  let flow = 1;
  let raf = 0;
  let calm = 0;
  let frames = 0;

  function sameCrew(id) {
    return sel && find(id) === find(sel.id);
  }

  function step() {
    // ① 分桶
    buckets.clear();
    for (let i = 0; i < ids.length; i += 1) {
      const point = pos.get(ids[i]);
      if (!point) continue;
      const key = `${Math.floor(point.x / SEP_R)}:${Math.floor(point.y / SEP_R)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(ids[i]); else buckets.set(key, [ids[i]]);
    }

    // ② 每个点受的力
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const point = pos.get(id);
      if (!point) continue;
      const isSel = sel && sel.id === id;
      if (isSel) continue;      // 被选中的点不吃任何力：钉住时跟指针，松手后只靠自己的惯性
                                // （重叠由 relax() 推开**对方**解决，它自己一步不挪）
      const crew = !sel || sameCrew(id);
      const gx = Math.floor(point.x / SEP_R);
      const gy = Math.floor(point.y / SEP_R);
      let sepX = 0; let sepY = 0;
      let alignX = 0; let alignY = 0;
      let cohX = 0; let cohY = 0;
      let seen = 0;
      for (let ox = gx - 1; ox <= gx + 1; ox += 1) {
        for (let oy = gy - 1; oy <= gy + 1; oy += 1) {
          const bucket = buckets.get(`${ox}:${oy}`);
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k += 1) {
            const other = bucket[k];
            if (other === id) continue;
            const mate = pos.get(other);
            if (!mate) continue;
            const dx = point.x - mate.x;
            const dy = point.y - mate.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            const radius = (sel && (other === sel.id || id === sel.id))
              ? SEP_R * DRAG_BOOST : SEP_R;
            if (dist < radius) {
              // 越近越硬：贴上来的时候像果冻一样被挤开，绝不会叠在一起
              const t = (radius - dist) / radius;
              const push = t * t * SEP_K * 3;
              sepX += (dx / dist) * push;
              sepY += (dy / dist) * push;
            }
            // 对齐 / 内聚只给"一伙的"点：没连线的点不跟着鱼群漂
            if (crew && !isSel && dist < ALIGN_R) {
              alignX += mate.vx; alignY += mate.vy;
              cohX += mate.x; cohY += mate.y;
              seen += 1;
            }
          }
        }
      }
      if (seen) {
        point.vx += (alignX / seen - point.vx) * ALIGN_K * flow;
        point.vy += (alignY / seen - point.vy) * ALIGN_K * flow;
        point.vx += (cohX / seen - point.x) * COHERE_K * flow;
        point.vy += (cohY / seen - point.y) * COHERE_K * flow;
      }
      point.vx += sepX;
      point.vy += sepY;
      // 不参与鱼群的点：被挤开之后飘回原位。
      // 注意这一条**不乘 flow**：它是"恢复原状"的力，跟着冷却衰减的话
      // 它们会停在半路挤成一团（实测散布面积从 94k 掉到 24k，画面反而更空）。
      if (!crew) {
        const base = home.get(id);
        if (base) {
          point.vx += (base.x - point.x) * HOME_K;
          point.vy += (base.y - point.y) * HOME_K;
        }
      }
    }

    // ③ 连线弹簧：力只给"另一端"，**被选中的点自己不受影响**
    for (let i = 0; i < springs.length; i += 1) {
      const spring = springs[i];
      const dx = spring.b.x - spring.a.x;
      const dy = spring.b.y - spring.a.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      // 弹簧**不跟着冷却**：它是"把别人拽向选中点"的结构力。
      // 跟着 flow 衰减的话，甩出去之后线就松在那儿了（实测 8 个邻居全被拉远回不来）。
      const force = (dist - spring.rest) * SPRING_K;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const aIsSel = sel && sel.id === spring.aId;
      const bIsSel = sel && sel.id === spring.bId;
      if (!aIsSel) { spring.a.vx += fx; spring.a.vy += fy; }
      if (!bIsSel) { spring.b.vx -= fx; spring.b.vy -= fy; }
    }

    /* ③.5 硬约束：**任何两个点都不许叠在一起**。
       力是软的——钉住的点被指针拖着走时，光靠分离力会直接碾过别人（实测重叠 7px）。
       所以每帧做两遍位置修正：钉住的点不动，把它撞到的那个顶开，
       再给一点向外的速度（"像果冻一样被挤开"的手感就是这么来的）。 */
    function relax() {
      const minDist = 24;                 // 中心距下限：半径最大 8.6，留 ~7px 余量
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          const a = pos.get(id);
          if (!a) continue;
          const gx = Math.floor(a.x / SEP_R);
          const gy = Math.floor(a.y / SEP_R);
          for (let ox = gx - 1; ox <= gx + 1; ox += 1) {
            for (let oy = gy - 1; oy <= gy + 1; oy += 1) {
              const bucket = buckets.get(`${ox}:${oy}`);
              if (!bucket) continue;
              for (let k = 0; k < bucket.length; k += 1) {
                const other = bucket[k];
                if (other === id || other < id) continue;   // 每对只处理一次
                const bpt = pos.get(other);
                if (!bpt) continue;
                let dx = bpt.x - a.x;
                let dy = bpt.y - a.y;
                let dist = Math.hypot(dx, dy);
                if (dist >= minDist) continue;
                if (dist < 0.001) { dx = 0.7; dy = 0.7; dist = 0.99; }
                const ux = dx / dist;
                const uy = dy / dist;
                const overlap = minDist - dist;
                // 被选中的点**任何时候都不被别人推动**（"选中的点不受影响"）：
                // 重叠由对方让开解决，它自己一步都不挪。
                const aPinned = Boolean(sel && sel.id === id);
                const bPinned = Boolean(sel && sel.id === other);
                // 每遍最多推 12px：真实的鼠标是连续移动的，一帧用不着推很远；
                // 限幅之后"挤开"是柔和地推开，而不是一帧弹飞出去
                const shove = Math.min(overlap, 12);
                if (aPinned && !bPinned) {
                  bpt.x += ux * shove; bpt.y += uy * shove;
                  bpt.vx += ux * 1.6; bpt.vy += uy * 1.6;
                } else if (bPinned && !aPinned) {
                  a.x -= ux * shove; a.y -= uy * shove;
                  a.vx -= ux * 1.6; a.vy -= uy * 1.6;
                } else if (!aPinned && !bPinned) {
                  a.x -= ux * shove / 2; a.y -= uy * shove / 2;
                  bpt.x += ux * shove / 2; bpt.y += uy * shove / 2;
                  a.vx -= ux * 0.8; a.vy -= uy * 0.8;
                  bpt.vx += ux * 0.8; bpt.vy += uy * 0.8;
                }
              }
            }
          }
        }
      }
    }

    // ④ 位置积分（被拖的点 = 指针；滑行的点 = 自己的惯性；其余 = 受力积分）
    let fastest = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const point = pos.get(id);
      if (!point) continue;
      const isSelected = !!(sel && sel.id === id);
      if (isSelected && sel.mode === 'drag') {
        point.x = clamp(sel.x, 26, width - 26);
        point.y = clamp(sel.y, 26, height - 26);
        point.vx = 0; point.vy = 0;
        continue;
      }
      if (sel && sel.id === id && sel.mode === 'glide') {
        // 惯性滑行：只受阻尼与边界，不吃弹簧也不吃向心（"选中的点不受影响"）
        sel.vx *= GLIDE_DAMP;
        sel.vy *= GLIDE_DAMP;
        point.vx = sel.vx;
        point.vy = sel.vy;
      } else if (isSelected) {
        // 被选中的点"不受影响"：不吃弹簧、不吃向心，只把被挤开的力慢慢卸掉
        point.vx *= DAMPING;
        point.vy *= DAMPING;
      } else {
        point.vx = clamp((point.vx + (width / 2 - point.x) * CENTER_K) * DAMPING, -MAX_V, MAX_V);
        point.vy = clamp((point.vy + (height / 2 - point.y) * CENTER_K) * DAMPING, -MAX_V, MAX_V);
      }
      let nx = point.x + point.vx;
      let ny = point.y + point.vy;
      if (nx < 22 || nx > width - 22) { point.vx = 0; nx = clamp(nx, 22, width - 22); if (sel && sel.id === id) sel.vx = 0; }
      if (ny < 22 || ny > height - 22) { point.vy = 0; ny = clamp(ny, 22, height - 22); if (sel && sel.id === id) sel.vy = 0; }
      point.x = nx;
      point.y = ny;
      const speed = Math.abs(point.vx) + Math.abs(point.vy);
      if (speed > fastest) fastest = speed;
    }

    // 重建一次格子：被钉住的点是**瞬移**到指针上的（指针一甩就是几百像素），
    // 旧桶里根本没有它新位置附近的那几个点，硬约束会漏判 -> 画面上真叠在一起。
    buckets.clear();
    for (let i = 0; i < ids.length; i += 1) {
      const point = pos.get(ids[i]);
      if (!point) continue;
      const key = `${Math.floor(point.x / SEP_R)}:${Math.floor(point.y / SEP_R)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(ids[i]); else buckets.set(key, [ids[i]]);
    }
    relax();          // 谁也不许叠在谁身上

    // 滑行停下来之后就一直"被选中但静止"：弹簧继续把别人拉过来，它自己不动
    if (sel && sel.mode === 'glide' && Math.abs(sel.vx) + Math.abs(sel.vy) < 0.12) {
      sel.mode = 'idle';
      sel.vx = 0; sel.vy = 0;
    }

    paint();

    frames += 1;
    if (!sel || sel.mode !== 'drag') {
      flow = Math.max(0.04, flow * COOL);
      calm = fastest < 0.25 ? calm + 1 : 0;
      const gliding = sel && sel.mode === 'glide';
      if (!gliding && (calm > 8 || frames > 420)) { stop(); return; }
    }
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (raf) return;
    frames = 0;
    calm = 0;
    raf = requestAnimationFrame(step);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (onSettle) onSettle(pos);
  }

  return {
    /** 按住了：这个点钉在 (x, y) 上，整群开始活起来 */
    pin(id, x, y) {
      sel = { id, mode: 'drag', x, y, vx: 0, vy: 0 };
      flow = 1;
      start();
    },
    /** 指针移动 */
    move(x, y) {
      if (sel && sel.mode === 'drag') { sel.x = x; sel.y = y; }
    },
    /** 松手：按最后那一段指针速度甩出去，让它带惯性继续滑一段 */
    release(vx, vy) {
      if (sel) {
        sel.mode = 'glide';
        sel.vx = clamp(vx * THROW, -10, 10);
        sel.vy = clamp(vy * THROW, -10, 10);
      }
      flow = 1;
      start();
    },
    stop,
    get running() { return !!raf; },
  };
}

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
    pos: null,          // 这一会话里拖过的位置（重画时接着用，不弹回去）
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

  // 画布这时还没进文档（renderGraph 建完树才被 append），clientWidth 是 0：
  // 直接兜底 900×560 会让 viewBox 与实际尺寸不符，整张图被 preserveAspectRatio
  // 缩放着画（实测 1.29 倍），拖动的坐标也就跟着错位。
  // 所以：优先用上次量到的真实尺寸，并在第一帧量到之后重画一次（只重画一次）。
  const width = (ui.size && ui.size[0]) || canvas.clientWidth || 900;
  const height = (ui.size && ui.size[1]) || Math.max(420, canvas.clientHeight || 560);
  // 上限跟后端 world/graph.py 的 MAX_NODES 对齐；截断了就在界面上说明白
  const GRAPH_LIMIT = 400;
  const truncated = ui.data.nodes.length > GRAPH_LIMIT;
  const nodes = ui.data.nodes.slice(0, GRAPH_LIMIT);
  const alive = new Set(nodes.map((n) => n.id));
  const links = ui.data.links.filter((l) => alive.has(l.source) && alive.has(l.target));
  const pos = layoutGraph(nodes, links, width, height);
  // 之前拖过的手感要留着：重画（改标签 / 改透明度）时别让节点弹回原位
  if (ui.pos) {
    pos.forEach((point, id) => {
      const saved = ui.pos.get(id);
      if (saved) { point.x = saved.x; point.y = saved.y; }
    });
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'graph-svg');

  const linkLayer = document.createElementNS(svgNS, 'g');
  links.forEach((link) => {
    const a = pos.get(link.source); const b = pos.get(link.target);
    if (!a || !b) return;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'graph-link');
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
  nodeLayer.setAttribute('class', 'graph-nodes');

  /** 把连线和节点位置画出来（模拟每帧调用）。 */
  function paint() {
    linkLayer.childNodes.forEach((line, index) => {
      const link = links[index];
      if (!link) return;
      const a = pos.get(link.source); const b = pos.get(link.target);
      if (!a || !b) return;
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    });
    nodeLayer.childNodes.forEach((g) => {
      const point = pos.get(Number(g.dataset.node));
      if (point) g.setAttribute('transform', `translate(${point.x} ${point.y})`);
    });
  }

  /** 客户端坐标 -> SVG 用户坐标（viewBox 缩放 / 面板尺寸变化都吃得下）。 */
  function toLocal(clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  /** 把和这个点相连的线点亮、不相干的压暗；同理对待节点（悬停与拖动时用）。 */
  function highlightNeighbors(id, on) {
    const related = new Set([id]);
    linkLayer.childNodes.forEach((line, index) => {
      const link = links[index];
      if (!link) return;
      const touches = link.source === id || link.target === id;
      if (touches) { related.add(link.source); related.add(link.target); }
      line.classList.toggle('is-lit', on && touches);
      line.classList.toggle('is-dim', on && !touches);
    });
    nodeLayer.childNodes.forEach((g) => {
      if (!on) { g.classList.remove('is-dim'); return; }
      g.classList.toggle('is-dim', !related.has(Number(g.dataset.node)));
    });
  }

  /* 层级：每个连通片内部，从度数最高的那个点 BFS 出去，跳数就是层号；
     孤立文档（没有连线）记 -1，单独一档色。 */
  const levelOf = new Map();
  (function computeLevels() {
    const adj = new Map();
    nodes.forEach((node) => adj.set(node.id, []));
    links.forEach((link) => {
      if (adj.has(link.source) && adj.has(link.target)) {
        adj.get(link.source).push(link.target);
        adj.get(link.target).push(link.source);
      }
    });
    const order = nodes.slice().sort((a, b) => b.degree - a.degree || a.id - b.id);
    order.forEach((start) => {
      if (levelOf.has(start.id)) return;
      levelOf.set(start.id, 0);
      if (!adj.get(start.id).length) { levelOf.set(start.id, -1); return; }   // 孤立：自成一片
      const queue = [start.id];
      while (queue.length) {
        const id = queue.shift();
        adj.get(id).forEach((next) => {
          if (levelOf.has(next)) return;
          levelOf.set(next, Math.min(levelOf.get(id) + 1, LEVEL_COLORS.length - 1));
          queue.push(next);
        });
      }
    });
  })();

  // 鱼群物理：拖动时整张图都会流动（不只是连着的点）
  const flock = (typeof createGraphFlock === 'function')
    ? createGraphFlock({
      nodes, links, pos, width, height, paint,
      onSettle: (points) => {
        ui.pos = new Map(Array.from(points.entries()).map(([id, q]) => [id, { x: q.x, y: q.y }]));
      },
    })
    : null;

  nodes.forEach((node) => {
    const p = pos.get(node.id);
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('class', 'graph-node');
    group.dataset.node = String(node.id);
    group.setAttribute('transform', `translate(${p.x} ${p.y})`);
    // 尺寸差距收窄：连线的多少只微调（6.6~8.6），孤立文档 6.2——一整片看起来是均质的
    const level = levelOf.get(node.id);
    const radius = ((level === -1 ? 6.2 : 6.6 + Math.min(node.degree, 5) * 0.4)) * ui.nodeScale;

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', colorForType(node, level));
    circle.setAttribute('stroke', ui.pins.has(node.id) ? '#e0a83c' : 'rgba(0,0,0,.6)');
    circle.setAttribute('stroke-width', ui.pins.has(node.id) ? '2' : '1');
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${node.name}（${node.entity_type_name || DOC_LABEL[node.type] || node.type}）· ${node.degree} 条连线`;
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
      // 嵌在发布站点里时，点节点应该跳到那张卡的站点页面，而不是在工作区里开面板
      if (isEmbedded()) {
        const target = findNode(node.id);
        postToHost('ws-open-doc', { id: node.id, name: node.name, slug: target ? target.slug : '' });
        return;
      }
      openDoc(node.id);
    });
    group.addEventListener('dblclick', () => { ui.center = node.id; renderPanels(); });

    /* 交互：悬停 240ms 点亮 -> 按住 150ms "拿起来" -> 拖着走（整群跟着流动）-> 松手安定。
       干净的单击仍然是打开这一篇。 */
    let hoverTimer = null;
    let holdTimer = null;
    let dragging = false;
    let moved = false;
    let grabbed = false;          // 长按真的"拿起来"过：这一下就不算单击了

    group.addEventListener('pointerenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        group.classList.add('is-hover');
        highlightNeighbors(node.id, true);
      }, 240);
    });
    group.addEventListener('pointerleave', () => {
      clearTimeout(hoverTimer);
      if (dragging) return;                       // 拖着的时候别灭
      group.classList.remove('is-hover');
      highlightNeighbors(node.id, false);
    });

    group.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      moved = false;
      grabbed = false;
      const origin = { x: event.clientX, y: event.clientY };
      // 指针换算到 SVG 用户坐标，并保留"按下的那一下没抓在圆心"的偏移，
      // 这样拖起来不会跳一下。
      const downLocal = toLocal(event.clientX, event.clientY);
      const grab = { x: p.x - downLocal.x, y: p.y - downLocal.y };
      let pointer = { x: p.x, y: p.y };
      const samples = [];                         // 最近几次指针位置 -> 松手时的"甩出去"速度

      function move(e) {
        const dx = e.clientX - origin.x;
        const dy = e.clientY - origin.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        const local = toLocal(e.clientX, e.clientY);
        pointer = { x: local.x + grab.x, y: local.y + grab.y };
        samples.push({ t: performance.now(), x: pointer.x, y: pointer.y });
        if (samples.length > 8) samples.shift();
        if (dragging && flock) flock.move(pointer.x, pointer.y);
      }

      /** 松手速度：只取最后 ~110ms 的位移，换算成"每帧多少"（拿挂钟算，掉帧也不会失真）。 */
      function throwVelocity() {
        if (samples.length < 2) return { vx: 0, vy: 0 };
        const last = samples[samples.length - 1];
        let first = samples[0];
        for (let i = samples.length - 1; i >= 0; i -= 1) {
          if (last.t - samples[i].t > 110) break;
          first = samples[i];
        }
        const frames = Math.max(1, (last.t - first.t) / 16.7);
        return { vx: (last.x - first.x) / frames, vy: (last.y - first.y) / frames };
      }

      function up() {
        clearTimeout(holdTimer);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        if (!dragging) return;
        dragging = false;
        group.classList.remove('is-dragging');
        if (flock) {
          const throwV = throwVelocity();
          flock.release(throwV.vx, throwV.vy);    // 松手：带惯性滑出去，别的点被拉过来
        }
      }

      holdTimer = setTimeout(() => {
        dragging = true;
        grabbed = true;
        group.classList.add('is-dragging');
        highlightNeighbors(node.id, true);
        if (flock) flock.pin(node.id, pointer.x, pointer.y);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      }, 150);

      group.addEventListener('pointermove', move);
    });

    // 拿起来过（长按）或拖动过，就不算单击——否则松手会顺手把文档打开。
    group.addEventListener('click', (event) => {
      if (moved || grabbed) {
        event.stopPropagation();
        event.preventDefault();
        moved = false;
        grabbed = false;
      }
    }, true);
    nodeLayer.appendChild(group);
  });
  svg.appendChild(nodeLayer);
  canvas.appendChild(svg);

  // 孤立节点默认是**画出来**的（图谱就是世界的地图，不该只画连起来的那些），
  // 所以这条"还没连起来"的提示只在用户主动点了「隐藏孤立」之后才有意义。
  if (ui.hideIsolated && ui.data.isolated_suggestions && ui.data.isolated_suggestions.length
      && !ui.query) {
    const tip = el('div', 'graph-tip');
    tip.appendChild(el('b', null, '还没连起来的卡片：'));
    tip.appendChild(el('span', null, ui.data.isolated_suggestions.map((n) => n.name).join('、')));
    tip.appendChild(el('span', 'graph-tip-hint', '（默认会一起画出来，这里是「隐藏孤立」之后剩下的）'));
    canvas.appendChild(tip);
  }
  // 第一帧量到的真实尺寸和这次用的不一样 -> 记下来重画一次（之后尺寸没变就不再重画）。
  // 这也是窗口缩放时"图谱跟着重排"的实现：尺寸变了就重排一次。
  requestAnimationFrame(() => {
    if (!canvas.isConnected) return;
    const w = canvas.clientWidth;
    const h = Math.max(420, canvas.clientHeight);
    if (!w || !h) return;
    if (!ui.size || Math.abs(ui.size[0] - w) > 2 || Math.abs(ui.size[1] - h) > 2) {
      ui.size = [w, h];
      renderPanels();
    }
  });
  return wrap;
}

/* 卡片按**实体类型**上色（类型自己的色），非卡片文档按**文档类型**上色——
   图谱要能一眼看出"这一坨是时间线、那块是地图"，而不是一堆白点。 */
const DOC_TYPE_COLOR = {
  timeline: '#3ddc97',   // 时间线：主色
  familyTree: '#e0a83c', // 关系树：鎏金
  map: '#3475f3',        // 地图：天蓝
  graph: '#8b7bd8',      // 图谱：紫
  board: '#1ab079',
  table: '#626980',
  canvas: '#c96f4a',
  calendar: '#7cb7e8',
  dictionary: '#9aa7b8',
  todo: '#5ec6a5',
  chapter: '#c9a227',
  media: '#b06fbf',
  soundscape: '#4aa3c9',
  dice: '#d18b5a',
  embed: '#7f8c9b',
  note: '#c9c5be',
  voice: '#c96f8a',
  radar: '#6fbf9a',
};

/* 按**层级**上色：同一个连通片里，从"度数最高的那个点"往外做 BFS，
   同一跳数 = 同一层 = 同一个颜色（层越靠后越冷、越淡）。
   孤立的文档（自成一片、没有任何连线）单独一档：灰白。
   这样"链式结构上更靠前的点"颜色一致，一眼能看出层级。 */
const LEVEL_COLORS = ['#3ddc97', '#3475f3', '#e0a83c', '#8b7bd8', '#1ab079', '#c96f8a', '#7cb7e8', '#c9a227'];

function colorForType(node, level) {
  if (level === undefined || level === null || level < 0) return 'rgba(236,232,225,.55)';
  return LEVEL_COLORS[level % LEVEL_COLORS.length];
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
      link.href = summary.url;               // 同标签：走跨文档视图过渡（世界名 / 标题会飞过去）
      link.title = '在当前标签打开（会走页面过渡）';
      state.appendChild(link);
      const fresh = el('button', 'mini-btn is-small', '新标签');
      fresh.title = '在新标签打开（没有过渡动效）';
      fresh.addEventListener('click', () => window.open(summary.url, '_blank', 'noopener'));
      state.appendChild(fresh);
      const copy = el('button', 'mini-btn', '复制链接');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast('链接已复制'); }
        catch (e) { await askText({ label: '复制失败，手动复制这个链接：', value: url, okLabel: '关闭' }); }
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

    // 发布记录：每次发布动了什么（最近几条）
    const logBox = el('details', 'publish-log');
    logBox.appendChild(el('summary', null, '发布记录'));
    body.appendChild(logBox);
    api('/api/world/publish/log').then((data) => {
      if (!data.logs || !data.logs.length) {
        logBox.appendChild(el('p', 'hint', '还没有发布记录。'));
        return;
      }
      data.logs.slice(0, 6).forEach((log) => {
        const row = el('div', 'pl-row');
        row.appendChild(el('b', null, `v${log.version}`));
        row.appendChild(el('span', 'pl-time', new Date(log.created_at).toLocaleString()));
        row.appendChild(el('span', 'pl-who', log.author));
        row.appendChild(el('span', 'pl-diff',
          `+${log.added_count} ~${log.changed_count} -${log.removed_count}`));
        logBox.appendChild(row);
      });
    }).catch(() => {});

    // 发布差异预览：列清楚这次发布会新增 / 更新 / 下架哪些文档
    const preview = el('div', 'publish-preview');
    preview.appendChild(el('p', 'hint', '正在算这次发布会改什么…'));
    body.appendChild(preview);
    api('/api/world/publish/preview').then((data) => {
      preview.innerHTML = '';
      const groups = [
        ['新增上线', data.added, 'is-add'],
        ['内容更新', data.changed, 'is-update'],
        ['将从站点移除', data.removed, 'is-remove'],
      ];
      const total = (data.summary.added + data.summary.changed + data.summary.removed);
      if (!total) {
        preview.appendChild(el('p', 'hint', summary.published
          ? '站点已经是最新的，这次发布不会有变化。'
          : '第一次发布，站点上会出现下面这些内容。'));
      }
      groups.forEach(([label, rows, cls]) => {
        if (!rows || !rows.length) return;
        const box = el('div', `pp-group ${cls}`);
        box.appendChild(el('b', null, `${label}（${rows.length}）`));
        const list = el('ul', 'pp-list');
        rows.slice(0, 8).forEach((row) => {
          const item = el('li');
          item.appendChild(el('span', null, row.name));
          item.appendChild(el('span', 'pp-type', row.type));
          list.appendChild(item);
        });
        if (rows.length > 8) list.appendChild(el('li', 'pp-more', `…还有 ${rows.length - 8} 份`));
        box.appendChild(list);
        preview.appendChild(box);
      });
    }).catch(() => { preview.innerHTML = ''; });

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
    password.type = 'password';
    password.autocomplete = 'new-password';
    password.placeholder = summary.has_password ? '已设置密码（留空则不改）' : '需要密码时填写';
    body.appendChild(row('访问密码', password));

    const actions = el('div', 'form-row');
    const publishButton = el('button', 'mini-btn is-primary', summary.published ? '重新发布' : '发布');
    publishButton.addEventListener('click', async () => {
      const payload = { audience: audience.value };
      if (password.value.trim()) payload.password = password.value.trim();
      // 发布是有等待感的动作，按钮要进"发布中"（转圈 + 禁用），别让人重复点
      const label = publishButton.textContent;
      publishButton.disabled = true;
      publishButton.classList.add('is-busy');
      publishButton.textContent = '';
      publishButton.appendChild(el('i', 'btn-spinner'));
      publishButton.appendChild(el('span', null, '正在发布…'));
      try {
        const result = await api('/api/world/publish', { method: 'POST', body: payload });
        toast(`已发布 v${result.version}`);
        closeModal();
        await reloadTree();
        renderPanels();
        publishDialog();
      } catch (error) {
        // 失败就把按钮还原，别留一个永远转圈的按钮
        publishButton.disabled = false;
        publishButton.classList.remove('is-busy');
        publishButton.textContent = label;
      }
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
/* 模态框的焦点管理：打开时记下触发者，关掉还回去 */
let MODAL_OPENER = null;
let MODAL_UNTRAP = null;

function openModal(title, build) {
  $('#mdTitle').textContent = title;
  const body = $('#mdBody');
  body.innerHTML = '';
  build(body);
  const box = $('#modal .md-box');
  // 焦点管理：记住是谁打开的，打开时把焦点送进去，
  // 关掉再还回去——不然键盘用户会掉到页面顶端重新找路。
  MODAL_OPENER = document.activeElement;
  $('#modal').hidden = false;
  if (typeof Opus !== 'undefined') {
    if (MODAL_UNTRAP) MODAL_UNTRAP();
    MODAL_UNTRAP = Opus.trapFocus(box);
  }
  const first = box.querySelector('input:not([type="hidden"]), textarea, select, button:not(.md-close)');
  if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ } }, 40);
}
function closeModal() {
  $('#modal').hidden = true;
  if (typeof Opus !== 'undefined' && MODAL_UNTRAP) { MODAL_UNTRAP(); MODAL_UNTRAP = null; }
  if (MODAL_OPENER && MODAL_OPENER.isConnected && MODAL_OPENER.focus) {
    try { MODAL_OPENER.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ }
  }
  MODAL_OPENER = null;
}

/* ========================================================== 输入浮层 */
/* window.prompt 在内嵌 WebView（预览面板）里会直接抛 "prompt() is not supported"，
   于是改名 / 命名这一类动作整条失效。这里改用自建浮层（与卡片选择器同一套
   .picker 观感，两页都加载了 minimal.css，所以不用新增样式）。
   askText 返回 Promise<string|null>（取消 = null）；askChoice 返回选中项或 null。 */

function askText({ label = '', value = '', okLabel = '确定', multiline = false } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', 'picker');
    const box = el('div', 'picker-box');
    const head = el('div', 'picker-head');
    head.appendChild(icon('pen-line', 15));
    const input = el(multiline ? 'textarea' : 'input');
    if (multiline) { input.rows = 5; input.style.resize = 'vertical'; } else { input.type = 'text'; }
    input.value = value == null ? '' : value;
    input.placeholder = label || '';
    head.appendChild(input);
    box.appendChild(head);
    const foot = el('div', 'picker-foot');
    const cancel = el('button', 'mini-btn', '取消');
    const ok = el('button', 'mini-btn is-primary', okLabel);
    cancel.type = 'button'; ok.type = 'button';
    foot.appendChild(cancel);
    foot.appendChild(ok);
    box.appendChild(foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => finish(input.value));
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) finish(null); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finish(input.value);
      }
    });
    setTimeout(() => { try { input.focus(); input.select(); } catch (error) { /* 忽略 */ } }, 30);
  });
}

/** 从一组选项里挑一个（替代"输入编号"式的 window.prompt）。取消返回 null。 */
function askChoice({ title = '选择', options = [], index = 0 } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', 'picker');
    const box = el('div', 'picker-box');
    const head = el('div', 'picker-head');
    head.appendChild(el('b', null, title));
    box.appendChild(head);
    const list = el('div', 'picker-list');
    box.appendChild(list);
    let active = clamp(index, 0, Math.max(0, options.length - 1));
    const finish = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const render = () => {
      list.innerHTML = '';
      options.forEach((option, i) => {
        const row = el('div', `picker-row${i === active ? ' is-active' : ''}`);
        row.appendChild(el('b', null, option.label));
        if (option.hint) row.appendChild(el('span', 'hint', option.hint));
        row.addEventListener('mousedown', (event) => { event.preventDefault(); finish(option); });
        list.appendChild(row);
      });
    };
    const onKey = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active = clamp(active + (event.key === 'ArrowDown' ? 1 : -1), 0, options.length - 1);
        render();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (options[active]) finish(options[active]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) finish(null); });
    render();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

/* ============================================================ 命令面板 */
/* --- 搜索面板（⌘K）：双栏 + 右侧预览 ---------------------------------------
   搜索：左边结果（按类型分组）+ 右边预览（封面/图标/标题/摘录）。
   「仅搜索标题」在客户端过滤（名字里包含关键词），不额外打后端。 */
let paletteTitlesOnly = false;
const palettePreviewCache = new Map();

/** 搜索结果的时间分组（「今天 / 昨天 / …」）。 */
function paletteTimeGroup(iso) {
  if (!iso) return '更早';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '更早';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const at = when.getTime();
  if (at >= startOfToday) return '今天';
  if (at >= startOfToday - day) return '昨天';
  if (at >= startOfToday - 7 * day) return '过去 7 天';
  if (at >= startOfToday - 30 * day) return '过去 30 天';
  return '更早';
}

async function syncPalettePreview() {
  const pane = $('#plPreview');
  if (!pane) return;
  const active = $('#plList .pl-item.is-active');
  const docId = active && active.dataset.docId ? Number(active.dataset.docId) : 0;
  if (!docId) { pane.hidden = true; pane.innerHTML = ''; return; }
  pane.hidden = false;
  pane.innerHTML = '';
  pane.appendChild(el('div', 'pv-empty', '载入中…'));
  let doc = palettePreviewCache.get(docId);
  if (!doc) {
    try {
      doc = await api(`/api/world/documents/${docId}`);
      palettePreviewCache.set(docId, doc);
    } catch (error) { doc = null; }
  }
  if (docId !== (Number(($('#plList .pl-item.is-active') || {}).dataset?.docId) || 0)) return;  // 选中项已经换人
  pane.innerHTML = '';
  if (!doc) { pane.appendChild(el('div', 'pv-empty', '读不到这一篇')); return; }
  const card = el('div', 'pv-card');
  if (doc.cover) {
    const img = el('img', 'pv-cover');
    img.src = doc.cover;
    img.alt = '';
    card.appendChild(img);
  }
  const body = el('div', 'pv-body');
  const head = el('div', 'pv-head');
  head.appendChild(doc.icon ? el('span', 'pv-icon', doc.icon) : docIcon(doc.type, 22));
  head.appendChild(el('b', null, doc.name || '无标题'));
  body.appendChild(head);
  const snippet = active.querySelector('.pi-snippet');
  if (snippet && snippet.textContent) body.appendChild(el('div', 'pv-text', snippet.textContent));
  card.appendChild(body);
  pane.appendChild(card);
}

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
    // 新建一棵空树，面板里直接就是模版选择（不用再另开标签页）
    { kind: '动作', name: '新建关系树', run: async () => { await createDoc('familyTree'); } },
    { kind: '动作', name: '新建地图', run: async () => { await createDoc('map'); } },
    { kind: '动作', name: '分享与发布', run: () => publishDialog() },
    { kind: '动作', name: '类型与属性', run: () => typeManager() },
    { kind: '动作', name: '纪元', run: () => erasDialog(S.docs.get(activeIdOfTimeline())) },
    { kind: '动作', name: '回收站', run: () => showTrash() },
    { kind: '动作', name: '用模板新建（角色 / 地点 / 事件）', run: () => guidedTemplatesDialog() },
    { kind: '动作', name: '新手引导（重新看一遍）', run: () => showOnboard(0) },
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

  // 「仅搜索标题」：名字里不含关键词的结果直接剔掉
  if (paletteTitlesOnly && query.trim()) {
    const needle = query.trim().toLowerCase();
    results = results.filter((r) => String(r.name || '').toLowerCase().includes(needle));
  }

  // 筛选条（搜索第二行）：第一枚是真开关，其余先做占位
  const box = list.parentNode;
  const stale = box.querySelector('.pl-filters');
  if (stale) stale.remove();
  const filters = el('div', 'pl-filters');
  const titlesChip = el('button', `pl-chip${paletteTitlesOnly ? ' is-on' : ''}`);
  titlesChip.type = 'button';
  titlesChip.title = '只看标题命中，不搜正文';
  titlesChip.appendChild(el('span', 'pl-chip-mark', 'Aa'));
  titlesChip.appendChild(el('span', null, '仅搜索标题'));
  titlesChip.addEventListener('click', () => {
    paletteTitlesOnly = !paletteTitlesOnly;
    runPalette($('#plInput').value);
  });
  filters.appendChild(titlesChip);
  [['创建者', '所有'], ['在页面中', '所有']].forEach(([label, value]) => {
    const chip = el('button', 'pl-chip is-static');
    chip.type = 'button';
    chip.disabled = true;
    chip.title = '这一维还没接';
    chip.appendChild(el('span', null, label));
    chip.appendChild(el('span', 'pl-chip-val', value));
    filters.appendChild(chip);
  });
  box.insertBefore(filters, list);

  const render = (entries) => {
    list.innerHTML = '';
    const rows = el('div', 'pl-rows');
    let lastGroup = null;
    entries.forEach((entry, index) => {
      if (entry.group && entry.group !== lastGroup) {
        rows.appendChild(el('div', 'pl-group', entry.group));
        lastGroup = entry.group;
      }
      const row = el('div', `pl-item${index === 0 ? ' is-active' : ''}`);
      if (entry.docId) row.dataset.docId = String(entry.docId);
      row.appendChild(el('span', 'pi-kind', entry.kind));
      row.appendChild(el('span', null, entry.name));
      if (entry.snippet) row.appendChild(el('span', 'pi-snippet', entry.snippet));
      row.addEventListener('mouseenter', () => {
        $$('#plList .pl-item').forEach((node) => node.classList.remove('is-active'));
        row.classList.add('is-active');
        syncPalettePreview();
      });
      row.addEventListener('click', async () => {
        // 从命令面板 / 搜索结果点开一篇——记下这一行的位置，让名字从这里飞进标题。
        // 面板接着就关了，所以起飞点要**现在**量好。
        if (entry.docId && typeof Opus !== 'undefined' && !Opus.reduced()) {
          const label = row.querySelector('.pi-snippet') && !row.children[1] ? row : (row.children[1] || row);
          const box = (label || row).getBoundingClientRect();
          S.tabFlight = {
            panel: 0, docId: entry.docId,
            text: (row.children[1] ? row.children[1].textContent : row.textContent).trim().slice(0, 40),
            rect: { left: box.left, top: box.top, width: box.width, height: box.height },
            font: parseFloat(getComputedStyle(row).fontSize) || 13,
            color: getComputedStyle(row).color,
          };
          startFlyAway(entry.docId, 480, 'none');   // 面板要关了，没有需要让开的名字
        }
        closePalette();
        await entry.run();
      });
      rows.appendChild(row);
    });
    list.appendChild(rows);
    const pane = el('div', 'pl-preview');
    pane.id = 'plPreview';
    pane.hidden = true;
    list.appendChild(pane);
    syncPalettePreview();
  };

  const entries = [
    ...items.map((a) => ({ kind: a.kind, name: a.name, run: a.run })),
    ...results.map((r) => ({
      group: paletteTimeGroup(r.updated_at),
      kind: DOC_LABEL[r.type] || r.type,
      name: r.name,
      snippet: r.snippet,
      docId: r.id,
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

/* 地理层级：国家 → 省份 → 城镇 → 地点（与 world/geo.py 的 GEO_LEVELS 同一张表）。
   地图导入的条目就是这几类，卡片的右键菜单据此给出「自动铺开下级」。 */
const GEO_CHILD_KIND = { 国家: '省份', 省份: '城镇', 城镇: '地点' };

/** 给一个地理条目铺开下一级：卡片 + 地图图钉（数量留空则按面积自动算） */
async function distributeDialog(node, childKind) {
  const answer = await askText({ label: `铺开几个${childKind}？（留空 = 按面积自动算）`, value: '' });
  if (answer === null) return;
  const text = answer.trim();
  const count = text ? Number(text) : 0;
  if (!Number.isFinite(count) || count < 0) { toast('数量要填一个数字'); return; }
  try {
    const out = await api(`/api/world/documents/${node.id}/distribute`, { method: 'POST', body: { count } });
    toast(`已铺开 ${out.count} 个${out.child_kind}（含地图图钉）`);
  } catch (error) {
    toast(error.message || '铺开失败');
    return;
  }
  await reloadTree();
  renderPanels();
}

function docContextMenu(event, node) {
  const typeName = node.entity_type ? (S.types.find((t) => t.id === node.entity_type) || {}).name : '';
  const childKind = GEO_CHILD_KIND[typeName];
  const entries = [
    { label: '重命名', run: async () => {
      const name = await askText({ label: '新名称', value: node.name });
      if (!name) return;
      await api(`/api/world/documents/${node.id}`, { method: 'PUT', body: { name } });
      await reloadTree(); renderPanels();
    } },
    { label: '复制', run: async () => {
      await api(`/api/world/documents/${node.id}/duplicate`, { method: 'POST' });
      toast('已复制'); await reloadTree();
    } },
    ...(childKind ? [{ label: '自动铺开下级…', run: () => distributeDialog(node, childKind) }] : []),
    ...(node.type === 'map'
      ? [{ label: '在独立地图页打开', run: () => openStandaloneMap(node.id) }]
      : []),
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
  const currentIndex = node.era ? data.eras.findIndex((e) => e.id === node.era) : -1;
  const picked = await askChoice({
    title: '归属纪元',
    index: currentIndex + 1,
    options: [{ value: 0, label: '无（不属于任何纪元）' }]
      .concat(data.eras.map((e) => ({ value: e.id, label: e.name }))),
  });
  if (!picked) return;
  await api(`/api/world/documents/${node.id}`, {
    method: 'PUT', body: { era: picked.value || null },
  });
  toast('已更新纪元');
  await reloadTree();
}

/* ============================================================ 新建 / 回收站 */
async function createDoc(type, parent = null) {
  // 关系树不在这里问名字：下一步就是模版选择，名字跟着模版走（建完还能改）
  let name = '新建关系树';
  if (type !== 'familyTree') {
    name = await askText({
      label: type === 'folder' ? '文件夹名称' : '文档名称',
      value: type === 'timeline' ? '世界时间线' : type === 'folder' ? '新文件夹' : '未命名',
    });
    if (name === null) return;
    name = name.trim() || '未命名';
  }
  const body = { type, name };
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

/* ====================================================== 名字自动识别 */
async function highlightMentions(root) {
  if (!root || !S.world || !S.world.auto_link_enabled) return;
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
  // 侧栏贯通整屏（顶栏只压在编辑区上）。DOM 里侧栏原本嵌在 .body 里、
  // 被顶栏压着头，这里把它提到 .app 这一层；.body 随即变成「顶栏 + 编辑区」的一列。
  const appNode = document.querySelector('.app');
  const sidebarNode = document.querySelector('.sidebar');
  const bodyNode = document.querySelector('.body');
  if (appNode && sidebarNode && bodyNode && sidebarNode.parentElement === bodyNode) {
    appNode.insertBefore(sidebarNode, bodyNode);
    document.documentElement.classList.add('has-rail-sidebar');
  }
  [['#sidebarBtn', 'grip', '收起或展开侧栏'], ['#undoBtn', 'arrow-left', '撤销'],
   ['#redoBtn', 'arrow-right', '重做'], ['#sbComposeBtn', 'pen-line', '更多']].forEach(([selector, name, label]) => {
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
  // 主按钮尾部带键盘提示徽章（如「新对话 ⌘O」）。
  // 键位取自 keymap，所以用户在「快捷键设置」里改过也会跟着变。
  const newDocBtn = $('#newDocBtn');
  const km = keymap();
  if (newDocBtn && km.newdoc && km.newdoc.combo) {
    newDocBtn.appendChild(el('kbd', 'sb-kbd', comboLabel(km.newdoc.combo)));
  }
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

/** 空状态分两种：
 *  · 世界是空的——"这里还是一片虚空"，摆出炼金术标记与第一张卡的入口；
 *  · 只是没开文档——原来的说明就够了。
 *  两者共用一块 .empty-hint，只换文案、图形与一个 is-void 类。 */
function applyEmptyHint() {
  const hint = $('#emptyHint');
  if (!hint) return;
  const empty = !S.tree.length;
  hint.classList.toggle('is-void', empty);
  const art = $('#ehArt');
  const title = hint.querySelector('h2');
  const text = hint.querySelector('p');
  if (empty) {
    if (art) {
      art.textContent = '';
      art.appendChild(opusculeMark(46));
    }
    if (title) title.textContent = '这里还是一片虚空';
    if (text) {
      text.innerHTML = '先落下第一块：一个角色、一个地点，或者一条时间线。<br />'
        + '不知道从哪开始？用引导模板问几个问题就能起一张卡。';
    }
  } else {
    if (art && !art.querySelector('.icon')) {
      art.textContent = '';
      art.appendChild(icon('book', 40));
    }
    if (title) title.textContent = '还没有打开任何文档';
    if (text) {
      text.innerHTML = '从左侧点一张卡片，或者按 <kbd>⌘K</kbd> 搜索。<br />'
        + '不知道从哪开始？用引导模板问几个问题就能起一张卡。';
    }
  }
}

/** 标记（圆 + 内接三角 + 节点），空状态与启动屏共用同一枚符号。 */
function opusculeMark(size = 40) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('opuscule-mark');
  const parts = [
    ['circle', { cx: '16', cy: '16', r: '9.6', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2' }],
    ['path', { d: 'M16 8.4 22.6 19.8H9.4Z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2',
               'stroke-linejoin': 'round' }],
    ['circle', { cx: '16', cy: '16', r: '2.4', fill: 'currentColor' }],
  ];
  parts.forEach(([tag, attrs]) => {
    const node = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    svg.appendChild(node);
  });
  return svg;
}

function bindEvents() {
  $('#worldChip').addEventListener('click', () => worldMenu());
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
      method: 'POST', body: { type: 'card', name: '未命名卡片', entity_type: null },
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
  /* 保存状态：样式层早就写好了 .save-state，这里把它接上事件。
     dirty = 有改动还没写回；saved = 写回成功；offline-write = 断网时的写请求失败。
     没有"保存"按钮，所以这个指示器就是用户唯一的安心来源。 */
  // 离线补写撞上冲突：还是走三选一，别偷偷丢掉离线时写的那一版
  document.addEventListener('opus:conflict', (event) => {
    const detail = (event && event.detail) || {};
    if (detail.payload) handleConflict(detail.payload, detail.retry);
  });

  const saveState = $('#saveState');
  const saveStateText = $('#saveStateText');
  if (saveState) {
    let savedTimer = null;
    const setState = (kind, text) => {
      saveState.dataset.kind = kind;
      if (saveStateText) saveStateText.textContent = text;
    };
    document.addEventListener('opus:dirty', () => {
      clearTimeout(savedTimer);
      setState('saving', '保存中…');
    });
    document.addEventListener('opus:saved', () => {
      clearTimeout(savedTimer);
      setState('saved', '已保存');
      // 3 秒后淡成"已保存"的静默态（还是这行字，只是不再强调）
      savedTimer = setTimeout(() => setState('saved', '已保存'), 3000);
    });
    document.addEventListener('opus:offline-write', () => {
      clearTimeout(savedTimer);
      setState('offline', '离线，等联网再写');
    });
    document.addEventListener('opus:write-error', () => {
      clearTimeout(savedTimer);
      setState('error', '没写进去');
    });
  }

  $('#userChip').addEventListener('click', () => userMenu());
  // 手机底部导航：只有「世界」（侧栏开合）对应真实状态，
  // 搜索 / 新建 / 建议 / 我的 都是弹一下就走的浮层，不该留下高亮——
  // 留着等于对用户谎报"你现在在搜索这一区"（2026-10-15 体检 F6）。
  $$('.bottom-nav button').forEach((node) => {
    node.addEventListener('click', () => {
      const action = node.dataset.mobile;
      if (action === 'world') { closeSidebarDrawer(); toggleSidebar(); }
      else if (action === 'search') openPalette('');
      else if (action === 'new') guidedTemplatesDialog();
      else if (action === 'suggest') suggestionsDialog();
      else if (action === 'user') userMenu();
      syncBottomNav();
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
  // 侧栏「更多」浮层：把工具收在圆形按钮的浮层里（点外面 / Esc 关掉）
  const composeBtn = $('#sbComposeBtn');
  const composeMenu = $('#sbMenuPop');
  if (composeBtn && composeMenu) {
    // 开着的时候按钮变成 ✕——否则图标一直是 ✎，看不出"再点一下能收起"
    const setComposeState = (open) => {
      composeBtn.innerHTML = '';
      if (open) composeBtn.appendChild(el('span', 'sb-compose-x', '✕'));
      else composeBtn.appendChild(icon('pen-line', 15));
      composeBtn.setAttribute('aria-expanded', String(open));
      composeBtn.setAttribute('aria-label', open ? '收起' : '更多');
      composeBtn.title = open ? '收起' : '更多';
    };
    const closeCompose = () => {
      composeMenu.hidden = true;
      setComposeState(false);
    };
    composeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = composeMenu.hidden;
      composeMenu.hidden = !open;
      setComposeState(open);
    });
    // 点菜单里的任一项之后收起（各项自己的 handler 照常跑）
    composeMenu.addEventListener('click', (event) => { if (event.target.closest('.sb-act')) closeCompose(); });
    document.addEventListener('click', (event) => {
      if (composeMenu.hidden) return;
      if (event.target.closest('#sbMenuPop, #sbComposeBtn')) return;
      closeCompose();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCompose(); });
  }
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

  // 搜索是侧栏快捷药丸行里的一个放大镜（排在行尾，和那几个视图分开），
  // 不再只挂在顶栏那颗 ⌘K 按钮上。
  const navRow = $('#tbNav');
  if (navRow && !$('#sbSearchPill')) {
    const searchPill = el('button', 'tb-view is-search');
    searchPill.id = 'sbSearchPill';
    searchPill.type = 'button';
    searchPill.dataset.nav = 'search';
    searchPill.title = '搜索（⌘K）';
    searchPill.setAttribute('aria-label', '搜索');
    searchPill.appendChild(icon('search', 14));
    navRow.appendChild(searchPill);
  }
  $('#tbNav').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    const nav = button.dataset.nav;
    if (nav === 'search') { openPalette(); return; }   // 搜索不是"视图"，不动高亮
    $$('#tbNav .tb-view').forEach((node) => node.classList.toggle('is-active', node === button));
    if (nav === 'new-timeline') await createDoc('timeline');
    else if (nav === 'new-card') await createDoc('card');
    else if (nav === 'world') { /* 世界视图：保持文档树 */ }
    else if (nav === 'wiki') {
      // 「维基」是**视图切换**：编辑区 <-> 只读站点。
      // 发布过就用**同一个标签**跳过去——Chrome 的跨文档视图过渡需要它
      // （@view-transition: navigation: auto），
      // 新标签会把这套过渡整个吃掉。没发布过才退回发布面板。
      const site = S.world && S.world.published ? (S.world.site_url || '') : '';
      if (site) {
        // 让世界名 / 当前这篇的标题成为共享元素，飞过去而不是"啪"地换页
        document.documentElement.classList.add('xp-leaving-to-site');
        window.location.href = site;
      } else {
        toast('这个世界还没发布，先把站点发出去，读者才看得到', { kind: 'warn', ms: 3200 });
        await publishDialog();
      }
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
  window.addEventListener('message', onCanvasMessage);

  /* 侧栏空白处右键：在根级新建 */
  $('#sbTree').addEventListener('contextmenu', (event) => {
    if (event.target.closest('.row')) return;
    event.preventDefault();
    openCtx(event.clientX, event.clientY, [
      { label: '新建卡片', run: () => createDoc('card') },
      { label: '新建时间线', run: () => createDoc('timeline') },
      { label: '新建关系树', run: () => createDoc('familyTree') },
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
    if (matchesShortcut(event, 'publish')) { event.preventDefault(); publishDialog(); return; }
    if (matchesShortcut(event, 'save')) { event.preventDefault(); flushPending(); return; }
    if (matchesShortcut(event, 'newdoc')) { event.preventDefault(); createDoc('card'); return; }
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

  /* ------- 本地 Rollup：乐观更新后立刻能算，不等服务器 ------- */
  const round2 = (value) => Math.round(value * 100) / 100;
  const localAggregates = (rows, columns) => {
    const byColumn = {};
    columns.forEach((column) => {
      const key = String(column.id);
      if (column.value_type === 'number' || column.value_type === 'formula') {
        const numbers = rows.map((row) => Number(row.values[key])).filter((value) => Number.isFinite(value));
        const total = numbers.reduce((a, b) => a + b, 0);
        byColumn[key] = {
          count: numbers.length,
          sum: numbers.length ? round2(total) : null,
          avg: numbers.length ? round2(total / numbers.length) : null,
          min: numbers.length ? Math.min(...numbers) : null,
          max: numbers.length ? Math.max(...numbers) : null,
        };
      } else {
        byColumn[key] = {
          count: rows.filter((row) => {
            const value = row.values[key];
            return !(value === null || value === undefined || value === ''
              || (Array.isArray(value) && !value.length));
          }).length,
        };
      }
    });
    return { total: rows.length, by_column: byColumn };
  };
  const recomputeAggregates = () => {
    const data = state.data;
    if (!data) return;
    data.aggregates = localAggregates(data.rows, data.columns);
    if (data.groups) {
      const byId = new Map(data.rows.map((row) => [row.id, row]));
      data.groups.forEach((group) => {
        const rows = group.row_ids.map((id) => byId.get(id)).filter(Boolean);
        group.aggregates = localAggregates(rows, data.columns);
        group.count = rows.length;
      });
    }
  };

  const saveView = async (patch) => {
    state.data = await api(`/api/world/tables/${entry.document.id}`, { method: 'PUT', body: { view: patch } });
    renderAll();
  };

  const propSelect = (label, columns, current) => {
    const select = el('select', 'cb-input');
    const none = el('option', null, label);
    none.value = '';
    select.appendChild(none);
    columns.forEach((prop) => {
      const option = el('option', null, prop.name);
      option.value = String(prop.id);
      select.appendChild(option);
    });
    select.value = current ? String(current) : '';
    return select;
  };

  /** 视图设置：分组 / 排序 / 筛选 / 显示列 —— 全写进 settings.table.view。 */
  const openTableSettings = (anchor) => {
    const data = state.data;
    if (!data) return;
    const view = data.view || {};
    const columns = data.all_columns || data.columns;
    const menu = el('div', 'fb-menu cb-settings');

    menu.appendChild(el('div', 'bm-group', '分组'));
    const groupSel = propSelect('不分组', columns, view.group && view.group.id);
    groupSel.addEventListener('change', () => {
      saveView({ group: groupSel.value ? { id: Number(groupSel.value) } : null });
    });
    menu.appendChild(groupSel);

    menu.appendChild(el('div', 'bm-group', '排序'));
    const sortSel = propSelect('不排序', columns, view.sort && view.sort.id);
    const dirBtn = el('button', 'cb-tab', view.sort && view.sort.dir === 'desc' ? '降序 ↓' : '升序 ↑');
    dirBtn.type = 'button';
    dirBtn.addEventListener('click', () => {
      const current = state.data.view.sort;
      if (!current) { toast('先选一个排序字段'); return; }
      const next = current.dir === 'desc' ? 'asc' : 'desc';
      dirBtn.textContent = next === 'desc' ? '降序 ↓' : '升序 ↑';
      saveView({ sort: { id: current.id, dir: next } });
    });
    sortSel.addEventListener('change', () => {
      const current = state.data.view.sort;
      saveView({ sort: sortSel.value ? { id: Number(sortSel.value), dir: (current && current.dir) || 'asc' } : null });
    });
    const sortRow = el('div', 'cbs-row');
    sortRow.appendChild(sortSel);
    sortRow.appendChild(dirBtn);
    menu.appendChild(sortRow);

    menu.appendChild(el('div', 'bm-group', '筛选'));
    const filter = state.data.view.filter || null;
    const filterSel = propSelect('不筛选', columns, filter && filter.id);
    const opSel = el('select', 'cb-input');
    [['contains', '包含'], ['is', '等于'], ['is_not', '不等于'], ['gt', '大于'], ['lt', '小于'], ['empty', '为空'], ['not_empty', '不为空']]
      .forEach(([value, label]) => {
        const option = el('option', null, label);
        option.value = value;
        opSel.appendChild(option);
      });
    opSel.value = (filter && filter.op) || 'contains';
    const filterText = el('input', 'cb-input');
    filterText.type = 'text';
    filterText.placeholder = '值…';
    filterText.value = (filter && filter.text) || '';
    const syncOp = () => { filterText.disabled = opSel.value === 'empty' || opSel.value === 'not_empty'; };
    syncOp();
    const commitFilter = () => {
      if (!filterSel.value) { saveView({ filter: null }); return; }
      const blank = opSel.value === 'empty' || opSel.value === 'not_empty';
      saveView({ filter: { id: Number(filterSel.value), op: opSel.value, text: blank ? '' : filterText.value } });
    };
    filterSel.addEventListener('change', commitFilter);
    opSel.addEventListener('change', () => { syncOp(); commitFilter(); });
    filterText.addEventListener('change', commitFilter);
    const filterRow1 = el('div', 'cbs-row');
    filterRow1.appendChild(filterSel);
    menu.appendChild(filterRow1);
    const filterRow2 = el('div', 'cbs-row');
    filterRow2.appendChild(opSel);
    menu.appendChild(filterRow2);
    const filterRow3 = el('div', 'cbs-row');
    filterRow3.appendChild(filterText);
    menu.appendChild(filterRow3);

    menu.appendChild(el('div', 'bm-group', '显示列'));
    columns.forEach((prop) => {
      const row = el('label', 'cbs-row');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !(state.data.view.hidden || []).includes(prop.id);
      box.addEventListener('change', () => {
        const next = new Set(state.data.view.hidden || []);
        if (box.checked) next.delete(prop.id); else next.add(prop.id);
        saveView({ hidden: Array.from(next) });
      });
      row.appendChild(box);
      row.appendChild(el('span', null, prop.name));
      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${clamp(rect.right - menu.offsetWidth, 8, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
    const close = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  };

  /* ------- 单元格保存：先改本地（乐观），再用服务器回执校正 / 回滚 ------- */
  const saveCell = async (row, column, value) => {
    const key = String(column.id);
    const previous = row.values[key];
    row.values[key] = value;
    recomputeAggregates();
    renderAll();
    try {
      const result = await api(`/api/world/tables/${entry.document.id}/cell`, {
        method: 'PUT', body: { row: row.id, column: column.id, value },
      });
      // 结构变了（列增删改名）或处于分组视图（值可能改变归属）→ 整表重载最稳
      if (state.data.groups || (result.schema && result.schema !== state.data.schema)) {
        await load();
        return;
      }
      Object.assign(row.values, result.row.values);   // 用服务器算出的公式值校正本行
      row.name = result.row.name;
      recomputeAggregates();
      renderAll();
    } catch (error) {
      row.values[key] = previous;
      recomputeAggregates();
      renderAll();
      toast('保存失败，已回滚');
    }
  };

  const buildRow = (row, columns) => {
    const tr = el('tr', 'table-row');
    const nameCell = el('td');
    const nameInput = el('input', 'mini-input');
    nameInput.value = row.name;
    nameInput.addEventListener('blur', async () => {
      const next = nameInput.value.trim();
      if (next === row.name) return;
      const previous = row.name;
      row.name = next;                                // 乐观
      try {
        await api(`/api/world/tables/${entry.document.id}/cell`, { method: 'PUT', body: { row: row.id, name: next } });
        await reloadTree();
        renderAll();
      } catch (error) {
        row.name = previous;
        renderAll();
        toast('改名失败，已回滚');
      }
    });
    nameCell.appendChild(nameInput);
    tr.appendChild(nameCell);

    columns.forEach((column) => {
      const cell = el('td');
      const key = String(column.id);
      const raw = row.values[key];
      const save = (value) => saveCell(row, column, value);
      if (column.value_type === 'formula') {
        const empty = raw === null || raw === undefined || raw === '';
        const span = el('span', 'table-formula', empty ? '—' : String(raw));
        span.title = column.formula ? `公式：${column.formula}` : '公式列（自动算）';
        cell.appendChild(span);
      } else if (column.value_type === 'number') {
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
          const node = el('option', null, option);     // option 已是字符串标签
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
          ? input.value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
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
    open.type = 'button';
    open.addEventListener('click', () => openDoc(row.id));
    actions.appendChild(open);
    const remove = el('button', 'mini-btn is-small is-danger', '删');
    remove.type = 'button';
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
    return tr;
  };

  const buildRollupRow = (aggregates, columns, label) => {
    const tr = el('tr', label ? 'table-rollup' : 'table-rollup is-group');
    tr.appendChild(el('td', 'table-rollup-label', label || ''));
    columns.forEach((column) => {
      const cell = el('td');
      const info = aggregates && aggregates.by_column ? aggregates.by_column[String(column.id)] : null;
      if (info && info.sum !== undefined && info.sum !== null) {
        cell.appendChild(el('span', 'table-rollup-sum', `Σ ${info.sum}`));
        if (info.count) cell.title = `${info.count} 个值 · 平均 ${info.avg}`;
      } else if (info && info.count) {
        cell.appendChild(el('span', 'hint', `${info.count} 值`));
      }
      tr.appendChild(cell);
    });
    tr.appendChild(el('td'));
    return tr;
  };

  const renderAll = () => {
    const data = state.data;
    if (!data) return;
    body.innerHTML = '';
    const view = data.view || {};
    const widths = view.widths || {};

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
    const settingsBtn = button('视图设置', '筛选 / 排序 / 分组 / 显示列', () => openTableSettings(settingsBtn));
    toolbar.appendChild(settingsBtn);
    toolbar.appendChild(el('span', 'hint', `${data.rows.length} 行 · ${data.columns.length} 列`));
    body.appendChild(toolbar);

    if (!(data.all_columns || []).length) {
      body.appendChild(emptyBlock({
        iconName: 'tag', title: '这个类型还没有属性',
        text: '表格的列来自卡片类型的属性。先去「类型」里给它加几个属性（比如 年龄、阵营）。',
        actionLabel: '打开类型与属性', onAction: () => typeManager(),
      }));
      return;
    }
    if (!data.columns.length) {
      body.appendChild(el('p', 'hint', '所有列都被隐藏了。点「视图设置」→「显示列」把列打开。'));
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
      if (view.group && view.group.id === column.id) th.classList.add('is-grouped');
      const width = widths[String(column.id)];
      if (width) th.style.width = `${width}px`;
      const grip = el('span', 'col-resize');
      grip.title = '拖动改列宽';
      grip.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = th.offsetWidth;
        const onMove = (move) => { th.style.width = `${clamp(startWidth + move.clientX - startX, 60, 900)}px`; };
        const onUp = async () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          await saveView({ widths: { [column.id]: Math.round(th.offsetWidth) } });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      th.appendChild(grip);
      headRow.appendChild(th);
    });
    headRow.appendChild(el('th', null, ''));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    const byId = new Map(data.rows.map((row) => [row.id, row]));
    if (data.groups) {
      data.groups.forEach((group) => {
        const head = el('tr', 'table-group-head');
        const cell = el('th');
        cell.colSpan = data.columns.length + 2;
        cell.appendChild(el('span', 'tgh-label', group.label));
        cell.appendChild(el('span', 'hint', `${group.count} 行`));
        head.appendChild(cell);
        tbody.appendChild(head);
        group.row_ids.forEach((id) => {
          const row = byId.get(id);
          if (row) tbody.appendChild(buildRow(row, data.columns));
        });
        tbody.appendChild(buildRollupRow(group.aggregates, data.columns, ''));
      });
    } else {
      data.rows.forEach((row) => tbody.appendChild(buildRow(row, data.columns)));
      if (data.rows.length) tbody.appendChild(buildRollupRow(data.aggregates, data.columns, '合计'));
    }
    table.appendChild(tbody);

    const scroller = el('div', 'table-scroll');
    scroller.appendChild(table);
    body.appendChild(scroller);
    if (!data.rows.length) {
      body.appendChild(el('p', 'hint', '还没有行。点「＋ 加一行」开始，或者导入一份 CSV。'));
    }
  };

  const load = async () => {
    state.data = await api(`/api/world/tables/${entry.document.id}`);
    renderAll();
  };
  state.reload = load;
  load();
  return wrap;
}

/* ---------------------------------------------------------------- 看板 */
function renderBoardTool(entry) {
  const wrap = toolShell(entry, { iconName: 'grip', title: '看板', hint: '列 + 卡片，拖到别的列就算改状态。' });
  const board = el('div', 'board');
  wrap.appendChild(board);
  wrap.querySelector('.tool-actions').appendChild(button('＋ 加一列', '', async () => {
    const name = await askText({ label: '这一列叫什么？', value: '新列' });
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
        const title = await askText({ label: '卡片内容？（会同时建一张真卡片）', value: '' });
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

  /* 月份用横向 scroll-snap 排（日历视图月份用 scroll-snap-type）。
     轨道里放三页（上个月 / 这个月 / 下个月），滑到边上就把相邻月份接上来，
     所以左右滑和 ‹ › 两种操作是同一套状态。 */
  const track = el('div', 'cal-track');
  const pageEls = [0, 1, 2].map(() => {
    const page = el('div', 'cal-page');
    page.appendChild(el('div', 'cal-grid'));
    track.appendChild(page);
    return page;
  });
  wrap.appendChild(track);
  const foot = el('div', 'cal-foot');
  wrap.appendChild(foot);

  /** 相对当前月份偏移 n 个月（跨年也算对）。 */
  const shift = (delta) => {
    const count = (calendar.months || []).length || 12;
    let month = CAL_STATE.month + delta;
    let year = CAL_STATE.year;
    while (month < 1) { month += count; year -= 1; }
    while (month > count) { month -= count; year += 1; }
    return { year, month };
  };

  const fillGrid = (page, data) => {
    const grid = page.firstChild;
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
    return data;
  };

  let centering = false;
  const centerTrack = () => {
    centering = true;
    track.scrollLeft = pageEls[1].offsetLeft - track.offsetLeft;
    requestAnimationFrame(() => { centering = false; });
  };

  const load = async () => {
    const monthUrl = (spot) => `/api/world/calendars/${calendar.id}/month?year=${spot.year}`
      + `&month=${spot.month}&document=${document_.id}`;
    const [before, now, after] = await Promise.all([
      api(monthUrl(shift(-1))), api(monthUrl({ year: CAL_STATE.year, month: CAL_STATE.month })),
      api(monthUrl(shift(1))),
    ]);
    label.textContent = `${now.year} 年 · ${now.month_name}`;
    fillGrid(pageEls[0], before);
    fillGrid(pageEls[1], now);
    fillGrid(pageEls[2], after);
    const total = now.weeks.reduce((sum, week) => sum + week.filter((c) => c && c.events.length).length, 0);
    foot.textContent = `这个月有 ${total} 天安排了事件`;
    centerTrack();
  };

  // 滑到相邻那页 -> 月份跟着翻，然后再把轨道拉回中间
  let settle = 0;
  track.addEventListener('scroll', () => {
    if (centering) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const middle = pageEls[1];
      const width = middle.offsetWidth || 1;
      const index = Math.round((track.scrollLeft - (middle.offsetLeft - track.offsetLeft)) / width) + 1;
      if (index === 1) return;
      step(index < 1 ? -1 : 1);
    }, 140);
  }, { passive: true });

  const step = (delta) => {
    const spot = shift(delta);
    CAL_STATE.month = spot.month;
    CAL_STATE.year = spot.year;
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
      'Opuscule 里的纪元不只是时间轴上的分段，它还是"世界的版本"：同一个世界在不同纪元里可以有不同的一批卡。'
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
  applyThemeAnimated(era && era.theme_config && Object.keys(era.theme_config).length
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
   新增写按钮时记得加进这张表，否则游客点得到、点了才被拦。
   顶栏那几颗「类型 / 纪元 / 主题 / 回收站 / 建议」打开的也是写控制台
   （新类型、添加纪元、保存主题、恢复/彻底删除、建为卡片……），一并对游客收起来。 */
const WRITE_CONTROLS = [
  '#undoBtn', '#redoBtn', '#exchangeBtn', '#newDocBtn', '#newFolderBtn', '#templateBtn',
  '#typesBtn', '#erasBtn', '#themeBtn', '#trashBtn', '#suggestBtn',
  '#tbNav [data-nav="new-timeline"]', '#tbNav [data-nav="new-card"]',
  '.bottom-nav [data-mobile="new"]',
  '#mapUploadBtn', '#mapBgBtn', '#insertBlockBtn', '#addEventBtn', '#calendarEditBtn',
  '#cardEraBtn', '#coverBtn', '#memberInviteBtn', '#publishBtn', '#tableAddRowBtn',
];

/* 只读嵌入里"写入口"的三种关法，各有适用范围（2026-10-15 体检 F4 核对过）：
   1. 工作区外壳：上面这张 WRITE_CONTROLS 表 + revealWriteControls(viewer.can_edit)；
   2. 关系树页：模板里给写控件标 `rt-write`，由 `.rt-app[data-readonly="1"] .rt-write{display:none}` 关；
   3. 地图页：服务端 `{% if shell.can_edit %}` 直接不渲染写面板。
   曾经这里还有一套"按按钮中文释义（成员 / 添加 / 删除…）识别写入口"的兜底，
   写在 `.is-embed-bar` 里——那套从来没生效过：全仓没有任何元素带这个类，
   于是选择器恒不命中（死代码）。真正管住只读边界的是上面三种机制 + 服务端守门人，
   所以那套兜底已删除，别再照着它的样子加回来。 */
function revealWriteControls(show) {
  // `[hidden]` 只是 UA 的 display:none —— 作者样式里 `.tb-btn { display:flex }` 之类一句就把它盖掉了
  // （导入导出 / 撤销 / 重做 之前就是这么漏在游客眼前的）。所以藏的时候补一条内联 display 兜底，
  // 显示的时候再把内联清掉、交还给样式表。
  const apply = (node) => {
    node.hidden = !show;
    if (show) node.style.removeProperty('display');
    else node.style.setProperty('display', 'none', 'important');
  };
  WRITE_CONTROLS.forEach((selector) => {
    $$(selector).forEach(apply);
  });
  // 插入条 / 新建类按钮：只读时整块收起来，界面干净，也不会误导
  $$('.insert-bar, .block-menu-add, .tool-add-row').forEach(apply);
  // 地图 / 图谱的编辑控件（关系树的编辑入口现在在嵌入页里，由那边自己判只读）
  $$('.map-tool-edit, .graph-tool-edit').forEach(apply);
  document.documentElement.classList.toggle('is-readonly-mode', !show);
}

/** 嵌在发布站点里吗？（/world?embed=<id>） */
function isEmbedded() {
  return Boolean(document.body.dataset.embedDoc);
}

/** 拉启动数据的地址：嵌入态必须带上 ?embed=<id>，否则游客会被读守门人拦在门外。 */
function stateUrl() {
  const embedId = Number(document.body.dataset.embedDoc || 0);
  return embedId ? `/api/world/state?embed=${embedId}` : '/api/world/state';
}

/** 跟宿主页面（发布站点）说一句话。 */
/* 嵌在工作区里面的画布（关系树）点了人：把那张卡开成标签页。
   自己也是被站点嵌着的时候，就继续往上抛给站点（那边按 slug 跳页面）。 */
async function onCanvasMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  // 嵌入的面板可能在启动数据到位前就发消息（选完模版 → ws-doc-changed）：
  // 那时 S.tree / S.world 还是空的，reloadTree / openDoc 会渲染出一篇没有世界的文档。
  if (bootDone) { try { await bootDone; } catch (error) { return; } }
  if (data.type === 'ws-node-hint') {          // 画布上这个人没有关联卡片
    // 自己也被站点嵌着的时候继续往上抛：这条提示该由读者看得见的**站点**说，
    // 在被嵌的工作区里弹 toast 读者根本看不见（整块工作区外壳都是藏起来的）
    if (isEmbedded()) { postToHost('ws-node-hint', data); return; }
    toast(`${data.name || '这位成员'}：还没有关联卡片`);
    return;
  }
  if (data.type === 'ws-doc-changed') {        // 面板里刚选完模版 / 改过内容
    // 只刷"文档树的元信息"和标签页标题——**千万别把 S.docs 里的条目删掉**：
    // 那等于把这篇文档从打开的标签页里摘出去，下一次 renderPanels() 就不会
    // 再认领那个 iframe，嵌入的编辑器会被当成垃圾清掉（然后就白屏了）。
    reloadTree().then(() => {
      const names = new Map();
      (function walk(nodes) {
        (nodes || []).forEach((node) => { names.set(node.id, node.name); walk(node.children); });
      })(S.tree);
      S.docs.forEach((entry) => {
        const fresh = names.get(entry.document.id);
        if (fresh && fresh !== entry.document.name) entry.document.name = fresh;
      });
      renderPanels();
    });
    return;
  }
  if (data.type !== 'ws-open-doc') return;
  if (isEmbedded()) { postToHost('ws-open-doc', data); return; }
  if (data.id) openDoc(data.id);
  else if (data.name) toast(`${data.name}：这位成员还没有关联卡片`);
}

function postToHost(type, payload) {
  if (window.parent === window) return;
  window.parent.postMessage({ type, ...(payload || {}) }, window.location.origin);
}

/** 写操作的统一闸门：没权限就别发请求，直接告诉用户为什么。 */
function guardWrite() {
  if (S.viewer && S.viewer.can_edit) return true;
  toast(S.viewer && S.viewer.needs_setup ? '先创建所有者账号再编辑' : '登录后才能编辑', 2600);
  return false;
}

/** 退出：清掉本地缓存（只清这个应用自己的键，别动别人的）。 */
function clearLocalState() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('opus.') || key.startsWith('ws:'))) keys.push(key);
  }
  keys.forEach((key) => { try { localStorage.removeItem(key); } catch (error) { /* 忽略 */ } });
  try { sessionStorage.removeItem('opus.view'); } catch (error) { /* 忽略 */ }
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
    actions.appendChild(button('修改密码…', '改完当前设备保持登录', () => accountPasswordDialog()));
    actions.appendChild(button('设置邮箱…', '忘记密码时用来收重置链接', () => accountEmailDialog()));
    actions.appendChild(button('导出我的数据', '下载一份我自己的账号数据（JSON）',
      () => { window.location.href = '/api/world/account/export'; }));
    actions.appendChild(button('注销账号…', '删除账号与只属于我的世界，不可恢复',
      () => accountDeleteDialog(), false, true));
    actions.appendChild(button('退出登录', '', async () => {
      await api('/api/world/auth/logout', { method: 'POST', body: {} });
      clearLocalState();          // 退出时把自己的本地痕迹也清掉
      window.location.href = '/world';
    }, false, true));
    body.appendChild(actions);
  });
}

/** 改密（方案①）：旧密码 + 新密码，不依赖邮件。 */
function accountPasswordDialog() {
  openModal('修改密码', (body) => {
    body.appendChild(el('p', 'hint', '改完之后当前这台设备保持登录，其他设备要用新密码重新登录。'));
    const field = (label, autocomplete) => {
      const row = el('div', 'form-row');
      row.appendChild(el('label', null, label));
      const input = el('input', 'mini-input');
      input.type = 'password';
      input.autocomplete = autocomplete;
      row.appendChild(input);
      return { row, input };
    };
    const current = field('当前密码', 'current-password');
    const next = field('新密码', 'new-password');
    const confirm = field('确认新密码', 'new-password');
    body.appendChild(current.row);
    body.appendChild(next.row);
    body.appendChild(confirm.row);

    const actions = el('div', 'form-row');
    const save = el('button', 'mini-btn is-primary', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      if (!next.input.value) { toast('请填写新密码'); return; }
      if (next.input.value !== confirm.input.value) { toast('两次输入的新密码不一样'); return; }
      await api('/api/world/auth/password', {
        method: 'POST',
        body: { current_password: current.input.value, new_password: next.input.value },
      });
      toast('密码已更新');
      closeModal();
    });
    actions.appendChild(save);
    actions.appendChild(button('取消', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/** 登记 / 修改邮箱（方案②）：改成非空要验当前密码，用于找回密码。 */
function accountEmailDialog() {
  const viewer = S.viewer || {};
  openModal('设置邮箱', (body) => {
    body.appendChild(el('p', 'hint', '留一个能收信的邮箱，忘记密码时可以自助重置；不填也不影响使用。'));
    const emailRow = el('div', 'form-row');
    emailRow.appendChild(el('label', null, '邮箱'));
    const email = el('input', 'mini-input');
    email.type = 'email';
    email.autocomplete = 'email';
    email.value = viewer.email || '';
    email.placeholder = 'you@example.com';
    emailRow.appendChild(email);
    body.appendChild(emailRow);

    const pwRow = el('div', 'form-row');
    pwRow.appendChild(el('label', null, '当前密码'));
    const pw = el('input', 'mini-input');
    pw.type = 'password';
    pw.autocomplete = 'current-password';
    pw.placeholder = '登记邮箱需要验证';
    pwRow.appendChild(pw);
    pwRow.appendChild(el('span', 'hint', '只有留空邮箱时不用填'));
    body.appendChild(pwRow);

    const actions = el('div', 'form-row');
    const save = el('button', 'mini-btn is-primary', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const payload = await api('/api/world/auth/email', {
        method: 'POST',
        body: { email: email.value.trim(), current_password: pw.value },
      });
      if (S.viewer) S.viewer.email = payload.email || '';
      toast(email.value.trim() ? '邮箱已保存' : '邮箱已清空');
      closeModal();
    });
    actions.appendChild(save);
    actions.appendChild(button('取消', '', () => closeModal()));
    body.appendChild(actions);
  });
}

/** 销号（A4）：验当前密码 + 勾选确认，连同"只剩我一个人"的世界一起删。 */
function accountDeleteDialog() {
  openModal('注销账号', (body) => {
    body.appendChild(el('p', 'hint',
      '这会永久删除你的账号，以及只属于你一个人的世界（不可恢复）。'
      + '如果某个世界里还有别的成员，得先去转让所有权或移除他们。'));
    body.appendChild(el('p', 'hint', '想留个底的话，先点「导出我的数据」把内容带走。'));

    const pwRow = el('div', 'form-row');
    pwRow.appendChild(el('label', null, '当前密码'));
    const pw = el('input', 'mini-input');
    pw.type = 'password';
    pw.autocomplete = 'current-password';
    pwRow.appendChild(pw);
    body.appendChild(pwRow);

    const confirmRow = el('label', 'cbs-row');
    const confirmBox = el('input');
    confirmBox.type = 'checkbox';
    confirmRow.appendChild(confirmBox);
    confirmRow.appendChild(el('span', null, '我知道这会永久删除账号，且无法恢复'));
    body.appendChild(confirmRow);

    const actions = el('div', 'form-row');
    const remove = el('button', 'mini-btn is-danger', '永久注销');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirmBox.checked) { toast('请先勾选确认'); return; }
      await api('/api/world/account/delete', {
        method: 'POST',
        body: { current_password: pw.value, confirm: true },
      });
      toast('账号已注销');
      clearLocalState();
      setTimeout(() => { window.location.href = '/world'; }, 600);
    });
    actions.appendChild(remove);
    actions.appendChild(button('取消', '', () => closeModal()));
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
              catch (error) { await askText({ label: '复制失败，手动复制这个链接：', value: link, okLabel: '关闭' }); }
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
          catch (error) { await askText({ label: '复制失败，手动复制这个链接：', value: link, okLabel: '关闭' }); }
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
  window.addEventListener('focus', () => {
    presenceBeat();
    refreshDocTreeSoon();
  });
  // 回到这个标签页时也刷一下：关系树是"另开一个标签页选模版建出来的"，
  // 不刷的话这边侧栏里看不到刚建好的那棵（点了会以为没建成）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshDocTreeSoon();
  });
}

/** 切回工作区时刷一次文档树；1.5 秒内连着触发只刷一次，别刷屏。 */
function refreshDocTreeSoon() {
  const now = Date.now();
  if (now - (S.treeRefreshedAt || 0) < 1500) return;
  S.treeRefreshedAt = now;
  reloadTree();
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
/** 编辑器级降级块：这一篇渲染不出来时，至少让人知道是哪一篇、能做什么。 */
function editorFallback(entry, error) {
  const box = el('div', 'editor-fallback');
  box.setAttribute('role', 'alert');
  const art = el('div', 'ef-art');
  art.appendChild(icon('circle-alert', 26));
  box.appendChild(art);
  box.appendChild(el('b', null, `《${entry.document.name}》这一篇没能画出来`));
  box.appendChild(el('p', 'hint',
    '不是你的数据没了——是这一种文档的渲染出了岔子。可以重试一次，或者先导出这篇的 JSON 保底。'));
  const detail = el('details', 'ef-detail');
  detail.appendChild(el('summary', null, '技术细节'));
  detail.appendChild(el('pre', null, String((error && error.stack) || error || '未知错误')));
  box.appendChild(detail);
  const actions = el('div', 'form-row');
  actions.appendChild(button('重试', '', () => renderPanels(), true));
  const link = el('a', 'mini-btn', '导出这一篇');
  link.href = `/api/world/documents/${entry.document.id}/export`;
  link.rel = 'noopener';
  actions.appendChild(link);
  box.appendChild(actions);
  return box;
}

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
 * 引导模板：不给你一张空卡，而是问几个问题，
 * 然后把答案铺成"概览 / 细节 / 关系 / 备注"的区块结构。
 */
const GUIDED_TEMPLATES = [
  {
    key: 'character', label: '角色', typeName: '角色', icon: 'user',
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
    key: 'location', label: '地点', typeName: '地点', icon: 'map-pin',
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
    key: 'event', label: '事件', typeName: '事件', icon: 'align',
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
        method: 'POST', body: { type: 'card', name: '未命名卡片', entity_type: null },
      });
      closeModal();
      await reloadTree();
      openDoc(created.id);
    }));
    body.appendChild(actions);
  });
}

/** 模板对应类型的"有则用、无则建"。 */
async function ensureTemplateType(template) {
  const wanted = template && template.typeName;
  if (wanted) {
    const hit = S.types.find((t) => t.name === wanted);
    if (hit) return hit;
    try {
      const created = await api('/api/world/types', { method: 'POST', body: { name: wanted } });
      S.types = await api('/api/world/types').then((data) => data.types);
      toast(`顺手建了「${wanted}」这个类型`, 2200);
      return created;
    } catch (error) {
      /* 建不出来就退回默认类型，别把建卡拦下来 */
    }
  }
  return S.types.find((t) => !t.hidden) || S.types[0] || null;
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
      // 用模板对应的类型（角色模板 -> 角色），没有就现建一个：
      // 不能随便挑"第一个可见类型"，否则"用角色模板建的卡"其实不是角色。
      const entityType = await ensureTemplateType(template);
      const created = await api('/api/world/documents', {
        method: 'POST',
        body: { type: 'card', name: answers.name, entity_type: entityType ? entityType.id : null },
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

/** 窄屏下侧栏是抽屉：打开时加一层可点的背景。
 *  遮罩挂在 **.app 里面**（不是 body）：.app 挂着入场动画，一直是个层叠上下文，
 *  抽屉（fixed z-index:60）和遮罩（z-index:55）必须同处一个上下文里比较，
 *  挂在 body 下的话遮罩会反过来盖住抽屉，抽屉就点不动了。 */
function openSidebarDrawer() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  sidebar.classList.add('is-open');
  syncBottomNav();
  if (!$('.sb-backdrop')) {
    const backdrop = el('div', 'sb-backdrop');
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      removeSidebarBackdrop();
    });
    (document.querySelector('.app') || document.body).appendChild(backdrop);
  }
}

function closeSidebarDrawer() {
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.remove('is-open');
  removeSidebarBackdrop();
  syncBottomNav();
}

/** 底部导航的高亮跟着真实状态走：「世界」= 侧栏（抽屉）开着，其余一律不亮。 */
function syncBottomNav() {
  const sidebar = $('#sidebar');
  const open = Boolean(sidebar && sidebar.classList.contains('is-open'));
  $$('.bottom-nav button').forEach((node) => {
    node.classList.toggle('is-on', node.dataset.mobile === 'world' && open);
  });
}

/** 侧栏收起 / 展开（⌘B）。 */

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
  // 发布给一个顺手的键位（工作区里最高频的"仪式性"动作）
  publish: { combo: 'mod+shift+p', label: '发布站点' },
  // 手动保存。这个应用是自动保存的，⌘S 的语义是"别等了，现在就写回去"
  save: { combo: 'mod+s', label: '立即保存（把等待中的改动写回去）' },
  // 新建文档：侧栏底部主按钮上的键盘提示徽章就取这个键位
  newdoc: { combo: 'mod+n', label: '新建文档' },
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
  ['通用', '⌘S', '保存（其实一直是即时保存）'],
  ['通用', '⇧⌘P', '发布站点'],
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

/** 世界设置：改名 / 简介 / 题材 / AI 与自动识别开关。 */
/* =============================================================== 我的世界 */
/* 侧栏世界名牌点开：列出"我能进的世界"，可切换、可新建、可进设置。
   游客没有"自己的世界"，直接落到只读的世界设置面板。 */
function worldMenu() {
  if (!S.viewer || !S.viewer.authenticated) { worldDialog(); return; }
  openModal('我的世界', (body) => {
    const list = el('div', 'world-list');
    const worlds = S.worlds && S.worlds.length
      ? S.worlds
      : [{ ...(S.world || {}), is_current: true, name: S.world ? S.world.name : '世界' }];
    worlds.forEach((world) => {
      const item = el('button', `world-item${world.is_current ? ' is-current' : ''}`);
      item.type = 'button';
      item.appendChild(el('span', 'wi-avatar', (world.name || 'W').trim().charAt(0).toUpperCase()));
      const meta = el('span', 'wi-meta');
      meta.appendChild(el('span', 'wi-name', world.name || '未命名世界'));
      const published = world.publish && world.publish.published;
      meta.appendChild(el('span', 'wi-sub', world.is_current ? '当前世界'
        : (published ? '已发布站点' : '未发布')));
      item.appendChild(meta);
      if (world.is_current) {
        item.appendChild(el('span', 'wi-check', '✓'));
      } else {
        item.addEventListener('click', () => switchWorld(world.id));
      }
      list.appendChild(item);
    });
    body.appendChild(list);

    const actions = el('div', 'form-row');
    actions.appendChild(button('＋ 新建世界', '', () => createWorldFlow()));
    actions.appendChild(button('世界设置…', '', () => { closeModal(); worldDialog(); }));
    body.appendChild(actions);
    body.appendChild(el('p', 'hint', '每个世界各有自己的文档、类型、纪元与发布时间线，互不打扰。'));
  });
}

/** 切到另一个世界：写进会话，然后整页重载（工作区所有数据都跟着换）。 */
async function switchWorld(id) {
  try {
    await api(`/api/world/worlds/${id}/switch`, { method: 'POST', body: {} });
    closeModal();
    // 丢掉 #doc= 这类旧深链——它属于上一个世界，留着只会弹"未找到该文档"
    location.replace('/world');
  } catch (error) { /* api() 已经提示过 */ }
}

/** 新建一个属于自己的世界：问名字 -> 落库 -> 它会自动成为当前世界。 */
async function createWorldFlow() {
  const name = await askText({ label: '新世界的名字（可留空）', value: '', okLabel: '创建' });
  if (name == null) return;                 // 取消
  try {
    await api('/api/world/worlds', { method: 'POST', body: { name: (name || '').trim() || '新世界' } });
    closeModal();
    location.replace('/world');
  } catch (error) { /* api() 已经提示过 */ }
}

async function worldDialog() {
  const world = await api('/api/world/world');
  // 世界名牌还担着"显示世界名"的活儿，不能整个藏掉；但里面这份设置是写控制台，
  // 游客点开只能是"看得见、改不动"——那就干脆按只读渲染，别摆一堆点了没用的输入框。
  const canEdit = editable();
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

    if (!canEdit) {
      [name, description, genres, ai, auto].forEach((node) => { node.disabled = true; });
      body.insertBefore(el('p', 'hint', '只读模式：登录后才能修改世界设置。'), body.firstChild);
    }

    const actions = el('div', 'form-row');
    if (canEdit) {
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
        applyThemeAnimated(updated.theme);
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
    } else {
      actions.appendChild(button('关闭', '', () => closeModal()));
    }
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
  applyThemeAnimated(world.theme);
  toast('主题已保存');
}

/* ================================================================== 启动 */
decorateChrome();
applyResponsive();
window.addEventListener('resize', debounce('responsive', () => applyResponsive(), 160));
window.addEventListener('orientationchange', () => setTimeout(applyResponsive, 120));
bindEvents();
bindHistory();
bootDone = boot();
bootDone.catch((error) => {
  console.error(error);
  toast('载入失败，请刷新重试', 3200);
  // 启动屏无论如何都要收掉——不能因为接口挂了就把人关在启动屏里
  document.dispatchEvent(new CustomEvent('opus:booted'));
});

/* ==========================================================================
   Onboarding：首次注册后的四步引导
   --------------------------------------------------------------------------
   参考 Warp 的"块"：每一步是**独立一个终端块**，块头是 `❯ 步骤名`，
   做完一步就在下面留一条已完成的行（像终端里滚动出来的历史），
   四步分别是：建世界 -> 加卡片 -> 放事件 -> 发布。
   可跳过；进度写 localStorage['opus.onboard']，下次打开接着走；
   走完（或跳过）就再也不自动弹，命令面板里随时能重看。
   ========================================================================== */
const ONBOARD_KEY = 'opus.onboard';
const ONBOARD_STEPS = [
  { key: 'world', label: '创建你的第一个世界' },
  { key: 'card', label: '添加第一张卡片' },
  { key: 'event', label: '把事件放到时间线上' },
  { key: 'publish', label: '发布给读者' },
];
const ONBOARD_COLORS = ['#3ddc97', '#e0a83c', '#3475f3', '#8b7bd8', '#c96f8a', '#7ab8a0'];

function onboardState() {
  try {
    const raw = JSON.parse(localStorage.getItem(ONBOARD_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch (error) { /* 坏数据当没走过 */ }
  return { step: 0, done: false, skipped: false };
}

function saveOnboardState(patch) {
  const next = { ...onboardState(), ...patch };
  try { localStorage.setItem(ONBOARD_KEY, JSON.stringify(next)); } catch (error) { /* 隐私模式 */ }
  return next;
}

/** 这个世界是不是"刚开张"：一份内容文档都没有（文件夹不算）。 */
function isFreshWorld() {
  return !S.tree.some((node) => node.type !== 'folder');
}

/** 引导面板：整块浮层，不抢编辑区的焦点（可跳过、可续）。 */
function onboardOverlay() {
  let node = $('#onboard');
  if (!node) {
    node = el('div', 'onboard');
    node.id = 'onboard';
    node.hidden = true;
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', '新手引导');
    document.body.appendChild(node);
  }
  return node;
}

function closeOnboard() {
  const node = $('#onboard');
  if (node) node.hidden = true;
  document.documentElement.classList.remove('xp-onboard');
}

/** 走引导：index 从 0 开始；带 `history` 时把之前的步骤画成已完成的行。 */
function showOnboard(index) {
  const state = onboardState();
  const step = Math.max(0, Math.min(index, ONBOARD_STEPS.length - 1));
  saveOnboardState({ step, done: false, skipped: false });
  const overlay = onboardOverlay();
  overlay.innerHTML = '';
  document.documentElement.classList.add('xp-onboard');

  const card = el('div', 'ob-card');
  const head = el('div', 'ob-head');
  // 注意：el() 的第三个参数是 **textContent**，所以进度点要一个个建，不能塞 HTML 字符串
  const dots = el('span', 'ob-dots');
  ONBOARD_STEPS.forEach((item, i) => {
    const dot = document.createElement('i');
    if (i < step) dot.className = 'is-done';
    else if (i === step) dot.className = 'is-now';
    dot.title = item.label;
    dots.appendChild(dot);
  });
  head.appendChild(dots);
  head.appendChild(el('span', 'ob-count', `${step + 1} / ${ONBOARD_STEPS.length}`));
  const skip = el('button', 'ob-skip', '跳过引导');
  skip.type = 'button';
  skip.addEventListener('click', () => {
    saveOnboardState({ done: true, skipped: true, step: 0 });
    closeOnboard();
    toast('随时可以在命令面板里再打开「新手引导」', 2600);
  });
  head.appendChild(skip);
  card.appendChild(head);

  const log = el('div', 'ob-log');
  ONBOARD_STEPS.slice(0, step).forEach((item, i) => {
    const line = el('div', 'ob-block is-done');
    line.appendChild(el('div', 'ob-prompt', `❯ ${item.label}`));
    line.appendChild(el('div', 'ob-note', ['世界已经起好名字', '第一张卡片已经落库', '时间线上有一条事件'][i] || '完成'));
    log.appendChild(line);
  });
  card.appendChild(log);

  const block = el('div', 'ob-block');
  block.appendChild(el('div', 'ob-prompt', `❯ ${ONBOARD_STEPS[step].label}`));
  const body = el('div', 'ob-body');
  block.appendChild(body);
  card.appendChild(block);

  const actions = el('div', 'ob-actions');
  block.appendChild(actions);
  overlay.appendChild(card);
  overlay.hidden = false;
  overlay.dataset.step = String(step);

  const finish = () => {
    saveOnboardState({ done: true, skipped: false, step: 0 });
    closeOnboard();
    toast('引导走完了，之后随时在命令面板里重看', 3000);
  };
  const next = (label = '下一步') => {
    if (step + 1 >= ONBOARD_STEPS.length) { finish(); return; }
    showOnboard(step + 1);
  };
  const back = () => showOnboard(Math.max(0, step - 1));

  /* ---- 第 1 步：世界名字 + 主题色 ---- */
  if (step === 0) {
    body.appendChild(el('p', 'ob-text', '先给这个世界起个名字，再挑一个主色——卡片、时间线、站点都会跟着它走。'));
    const nameInput = el('input', 'mini-input ob-input');
    nameInput.value = S.world.name === '新世界' ? '' : S.world.name;
    nameInput.placeholder = '比如：灰烬纪年';
    body.appendChild(nameInput);
    const swatches = el('div', 'ob-colors');
    let picked = (S.world.theme && S.world.theme.primaryColor) || ONBOARD_COLORS[0];
    ONBOARD_COLORS.forEach((color) => {
      const dot = el('button', `ob-color${color === picked ? ' is-active' : ''}`);
      dot.type = 'button';
      dot.style.background = color;
      dot.setAttribute('aria-label', `主色 ${color}`);
      dot.addEventListener('click', () => {
        picked = color;
        $$('.ob-color', swatches).forEach((other) => other.classList.toggle('is-active', other === dot));
      });
      swatches.appendChild(dot);
    });
    body.appendChild(swatches);
    actions.appendChild(button('就用这个名字', '', async () => {
      const name = nameInput.value.trim() || S.world.name;
      const payload = await api('/api/world/world', {
        method: 'PUT', body: { name, theme_config: { primaryColor: picked } },
      });
      S.world = payload;
      applyTheme(S.world.theme);
      $('#worldName').textContent = S.world.name;
      document.title = `${S.world.name} · 世界工作区`;
      toast(`世界已命名为「${name}」`, 2200);
      next();
    }, true));
    actions.appendChild(button('先跳过这步', '', next));
    setTimeout(() => nameInput.focus(), 80);
  }

  /* ---- 第 2 步：第一张卡片 ---- */
  if (step === 1) {
    body.appendChild(el('p', 'ob-text', '挑一个类型，写个名字。卡片就是这个世界的最小单位：人物、地点、事件、物品都行。'));
    const chips = el('div', 'ob-chips');
    let picked = S.types.find((t) => !t.hidden) || S.types[0] || null;
    S.types.filter((t) => !t.hidden).forEach((type) => {
      const chip = el('button', `ob-chip${picked && type.id === picked.id ? ' is-active' : ''}`, type.name);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        picked = type;
        $$('.ob-chip', chips).forEach((other) => other.classList.toggle('is-active', other === chip));
      });
      chips.appendChild(chip);
    });
    body.appendChild(chips);
    const nameInput = el('input', 'mini-input ob-input');
    nameInput.placeholder = '比如：Isarra Thornveil';
    body.appendChild(nameInput);
    actions.appendChild(button('建这张卡', '', async () => {
      const name = nameInput.value.trim();
      if (!name) { toast('先给它起个名字'); nameInput.focus(); return; }
      const created = await api('/api/world/documents', {
        method: 'POST', body: { type: 'card', name, entity_type: picked ? picked.id : null },
      });
      await reloadTree();
      renderTree();
      toast(`「${name}」已经落库`, 2200);
      next();
    }, true));
    actions.appendChild(button('上一步', '', back));
    setTimeout(() => nameInput.focus(), 80);
  }

  /* ---- 第 3 步：往时间线上放一条事件 ---- */
  if (step === 2) {
    body.appendChild(el('p', 'ob-text', '事件挂着卡片，时间线才有内容。先放一条：写清发生了什么、大概什么时候。'));
    const titleInput = el('input', 'mini-input ob-input');
    titleInput.placeholder = '发生了什么？比如：Harrowdeep 建镇';
    const whenInput = el('input', 'mini-input ob-input');
    whenInput.placeholder = '什么时候？比如：1240';
    body.appendChild(titleInput);
    body.appendChild(whenInput);
    actions.appendChild(button('放到时间线上', '', async () => {
      const title = titleInput.value.trim();
      if (!title) { toast('先写一句发生了什么'); titleInput.focus(); return; }
      let timelineId = null;
      const existing = [];
      const walk = (nodes) => nodes.forEach((node) => {
        if (node.type === 'timeline') existing.push(node.id);
        walk(node.children || []);
      });
      walk(S.tree);
      if (existing.length) timelineId = existing[0];
      else {
        const created = await api('/api/world/documents', { method: 'POST', body: { type: 'timeline', name: '世界时间线' } });
        timelineId = created.id;
        await reloadTree();
      }
      const year = Number((whenInput.value.match(/\d+/) || [])[0]) || 1000;
      await api(`/api/world/timelines/${timelineId}/events`, {
        method: 'POST',
        body: { title, sort_year: year, sort_month: 1, sort_day: 1, precision: 'year' },
      });
      await reloadTree();
      await openDoc(timelineId);
      toast('时间线上已经有第一条事件了', 2400);
      next();
    }, true));
    actions.appendChild(button('上一步', '', back));
    setTimeout(() => titleInput.focus(), 80);
  }

  /* ---- 第 4 步：发布 ---- */
  if (step === 3) {
    body.appendChild(el('p', 'ob-text', '发布出去，读者就能用浏览器直接看——不用登录，也不会看到编辑界面。'));
    const out = el('div', 'ob-site');
    body.appendChild(out);
    actions.appendChild(button('发布', '', async () => {
      const result = await api('/api/world/publish', { method: 'POST', body: {} });
      // 站点地址要用发布返回的那个（S.world.slug 是**世界内部** slug，
      // 发布出去的是 published_slug，两者不一样——用错了会 404）
      const path = (result.publish && result.publish.url) || '';
      const url = path.startsWith('http') ? path : `${location.origin}${path}`;
      S.world.published = true;
      S.world.site_url = path;
      out.innerHTML = '';
      out.appendChild(el('span', null, '站点地址：'));
      const link = el('a', 'ob-link', url);
      link.href = url;                       // 同标签打开：跨文档过渡才会跑
      out.appendChild(link);
      actions.replaceChildren(
        button('打开站点看看', '', () => { window.location.href = url; }, true),
        button('完成引导', '', finish),
      );
    }, true));
    actions.appendChild(button('上一步', '', back));
  }

  // 焦点进第一块（引导是模态性质的浮层，键盘用户要能直接开始）
  setTimeout(() => {
    const focusable = overlay.querySelector('input, button');
    if (focusable) focusable.focus();
  }, 60);
}

/** 该不该自动弹引导：刚注册的所有者 + 空世界 + 没走过（或没走完）。 */
function maybeStartOnboard() {
  const state = onboardState();
  if (state.done) return false;
  if (!S.viewer || !S.viewer.can_edit || !S.viewer.authenticated) return false;
  if (S.viewer.role !== 'owner') return false;
  if (!isFreshWorld()) { saveOnboardState({ done: true, step: 0 }); return false; }
  showOnboard(state.step || 0);
  return true;
}
