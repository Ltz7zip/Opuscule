/* ==========================================================================
   经典时间线（/legacy）— 前端主逻辑
   --------------------------------------------------------------------------
   时间模型：1 年 = 12 个月，1 月 = 30 天，内部统一用浮点年保存
   （Year -13 · Month 11 → -13 + 10/12）。负年份同样成立：
   Math.floor(-13.2) = -14，小数部分 0.8 → Month 11。

   交互（时间线编辑区的操作方式）：
     轴线上悬停        → 圆形「+」入口，点击在该时刻新建时间点
     轴线下方悬停      → 虚线预览带，点击新建时间段
     点击时间点 / 纪元  → 选中，并在旁边浮出编辑卡片（改动实时写回）
     拖拽色带本体 / 两端 → 平移 / 改起止
     空白处拖拽        → 平移画布；滚轮 / 触控板 → 左右移动时间轴；⌘/Ctrl + 滚轮 → 缩放
   ========================================================================== */
(function () {
  'use strict';

  /* 只读画布（发布站点的 wiki 页面）：由模板在脚本之前注入。
     这里必须自己再守一遍——CSS 只能藏控件，藏不住已经绑上的事件。 */
  var READONLY = !!window.CLASSIC_READONLY;

  /* ---------------------------------------------------------------- 日历 */
  var MONTHS = 12;
  var DAYS = 30;

  /** 浮点年 → { year, month(1-12), day(1-30) } */
  function split(t) {
    var year = Math.floor(t);
    var frac = t - year;
    var mFloat = frac * MONTHS;
    var month = Math.floor(mFloat) + 1;
    var day = Math.floor((mFloat - (month - 1)) * DAYS) + 1;
    if (month > MONTHS) { month = MONTHS; day = DAYS; }
    if (month < 1) { month = 1; day = 1; }
    return { year: year, month: month, day: day };
  }

  /** { year, month, day } → 浮点年 */
  function join(year, month, day) {
    return year + (month - 1) / MONTHS + (day - 1) / (MONTHS * DAYS);
  }

  /** 时间点写法：Month 5, Year -8 */
  function fmtPoint(t) {
    var d = split(t);
    return 'Month ' + d.month + ', Year ' + d.year;
  }

  /** 纪元端点写法：10 Month 11, Year -14 */
  function fmtFull(t) {
    var d = split(t);
    return d.day + ' Month ' + d.month + ', Year ' + d.year;
  }

  function fmtRange(a, b) { return fmtFull(a) + ' – ' + fmtFull(b); }

  /* ---------------------------------------------------------------- 常量 */
  var DOT = 8;                 // 时间点圆点直径
  var PILL_H = 24;             // 标签胶囊高度
  var PILL_GAP = 6;            // 相邻层级的空隙
  var PILL_LIFT = 20.5;        // 最底层胶囊底边距轴线的距离
  var GAP_EVENT = 6;           // 同层两个胶囊之间的最小横向间隔
  var ERA_H = 26;              // 纪元色带高度
  var ERA_GAP = 6;             // 行间空隙
  var ERA_TOP = 25.5;          // 第一行顶边距轴线的距离
  var GAP_ERA = 4;             // 同行两条色带之间的最小横向间隔
  var ERA_MIN_W = 24;          // 色带最小宽度
  var AXIS_ZONE = 26;          // 轴线上下多少像素算「时间点区」
  var AXIS_TOP = 0.501;        // 轴线在画布高度上的比例（约在正中）
  var TICK_MIN_PX = 160;       // 主刻度的最小像素间隔
  var TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500,
                    1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  var MIN_SPAN = 0.02;         // 最小视野（年）
  var MAX_SPAN = 400000;       // 最大视野（年）
  var THEMES = ['blue', 'sky', 'violet', 'red', 'teal', 'gold'];
  var DEFAULT_THEME = 'blue';
  var NEW_ERA_SPAN = 3;        // 新建时间段的默认长度（年）
  var EDGE_PAD = 12;           // 浮层与视口边缘的留白
  var TIP_ACTION = '<span class="tip-action"> · 点击添加</span>';

  /* ---------------------------------------------------------------- 状态 */
  var state = {
    items: [],
    view: { start: -20, end: 40 },
    width: 0,
    height: 0,
    axisY: 0,
    selectedId: null,
    hoverId: null,
    selection: [],              // 框选出来的多条记录 id
    tool: 'select',
    editing: null,
    pointer: { x: 0, y: 0 },
    booting: false,             // 开屏编排进行中（记录错峰进场）
    loadFailed: false,          // 首次拉数据失败
    loaded: false,              // 首屏数据已就位（空状态的显隐以此为闸）
    suppressDocClose: false     // 画布上刚打开编辑卡片时，别被同一次 pointerdown 关掉
  };

  var dom = {};
  var nodes = {};              // id → { root, pill, title, era, level, row, x, w }
  var dragging = null;
  var viewTimer = null;
  var commitTimer = null;

  /* ---------------------------------------------------------------- 动效 */
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }

  var EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  var EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
  var EASE_SPRING = 'cubic-bezier(0.34, 1.32, 0.5, 1)';

  /** 浮层显示：从 hidden 里放出来，并播一次进场动画 */
  function showPanel(node) {
    if (!node) return;
    clearTimeout(node.__hideTimer);
    node.classList.remove('is-out');
    if (!node.hidden && node.classList.contains('is-in')) return;
    node.hidden = false;
    if (reducedMotion()) return;
    node.classList.remove('is-in');
    void node.offsetWidth;                 // 逼一次重排，动画才会重播
    node.classList.add('is-in');
  }

  /** 浮层隐藏：先播退场，再落到 hidden，避免「啪」地消失 */
  function hidePanel(node) {
    if (!node || node.hidden) return;
    clearTimeout(node.__hideTimer);
    node.classList.remove('is-in');
    if (reducedMotion()) { node.classList.remove('is-out'); node.hidden = true; return; }
    node.classList.add('is-out');
    node.__hideTimer = setTimeout(function () {
      node.classList.remove('is-out');
      node.hidden = true;
    }, 260);
  }

  /** 记录进场：用行内 animation，render() 重建 className 也冲不掉它 */
  function animateNodeIn(node, index, booting) {
    if (!node || reducedMotion()) return;
    var root = node.root;
    root.style.animation = 'item-in ' + (booting ? 560 : 380) + 'ms ' +
      (booting ? EASE_OUT : EASE_SPRING) + ' both';
    root.style.animationDelay = (booting ? 120 + index * 55 : 0) + 'ms';
    var clear = function () { root.style.animation = ''; root.style.animationDelay = ''; };
    root.addEventListener('animationend', clear, { once: true });
    // 兜底：动画被跳过（比如切到后台标签页）时也要清干净
    setTimeout(clear, (booting ? 120 + index * 55 : 0) + 900);
  }

  /** 记录退场：动画放完再摘节点 */
  function animateNodeOut(root) {
    if (!root || !root.parentNode) return;
    if (reducedMotion()) { root.remove(); return; }
    root.style.pointerEvents = 'none';
    root.style.animation = 'item-out 200ms ' + EASE_IN + ' both';
    var done = function () { root.remove(); };
    root.addEventListener('animationend', done, { once: true });
    setTimeout(done, 420);
  }

  /** 把子节点里带 id 的记录节点找出来（hover 用它，避免闭包里存死 id） */
  function nodeRoot(target) {
    return target.closest ? target.closest('.ev, .era') : null;
  }

  /* ---------------------------------------------------------------- 工具 */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /* --------------------------------------------------------- 视野 ↔ 像素 */
  function viewSpan() { return state.view.end - state.view.start; }
  function pxPerYear() { return state.width / viewSpan(); }
  function yearToX(t) { return (t - state.view.start) * pxPerYear(); }
  function xToYear(x) { return state.view.start + x / pxPerYear(); }

  function isSel(id) {
    if (String(state.selectedId) === String(id)) return true;
    for (var i = 0; i < state.selection.length; i++) {
      if (String(state.selection[i]) === String(id)) return true;
    }
    return false;
  }

  function themeOf(item) {
    if (item.kind !== 'era') return DEFAULT_THEME;
    return THEMES.indexOf(item.theme) >= 0 ? item.theme : DEFAULT_THEME;
  }

  /** 吸附到「月」 */
  function snapTime(t) {
    var d = split(t);
    return join(d.year, d.month, 1);
  }

  /* ================================================================ 布局 */
  /** 时间点：按时间排序，逐个放进最低的、放得下的那一层 */
  function layoutEvents() {
    var list = [];
    state.items.forEach(function (it) {
      if (it.kind !== 'event') return;
      var n = nodes[it.id];
      if (n) list.push({ item: it, node: n });
    });
    list.sort(function (a, b) {
      return a.item.start - b.item.start || a.item.id - b.item.id;
    });

    var levels = [];
    list.forEach(function (rec) {
      var w = rec.node.pill.offsetWidth || 40;
      var x = yearToX(rec.item.start);
      var half = w / 2;
      var level = 0;
      for (;;) {
        var taken = levels[level];
        if (!taken) { levels[level] = [[x - half, x + half]]; break; }
        var clash = false;
        for (var i = 0; i < taken.length; i++) {
          if (x + half + GAP_EVENT > taken[i][0] &&
              x - half - GAP_EVENT < taken[i][1]) { clash = true; break; }
        }
        if (!clash) { taken.push([x - half, x + half]); break; }
        level++;
      }
      rec.node.level = level;
      rec.node.x = x;
      rec.node.w = w;
    });
  }

  /** 纪元：按记录本身的顺序（即创建顺序）逐个放进最低的、放得下的那一行。
      初始状态就是这个顺序的结果：第4次圣战 / 新纪元 在第一行，
      更长的 新时代 被挤到第二行，三条短的顺次落在第三行。 */
  function layoutEras() {
    var list = [];
    state.items.forEach(function (it) {
      if (it.kind !== 'era') return;
      var n = nodes[it.id];
      if (n) list.push({ item: it, node: n });
    });

    var rows = [];
    list.forEach(function (rec) {
      var x0 = yearToX(rec.item.start);
      var x1 = yearToX(rec.item.end);
      var w = Math.max(x1 - x0, ERA_MIN_W);
      var row = 0;
      for (;;) {
        var taken = rows[row];
        if (!taken) { rows[row] = [[x0, x0 + w]]; break; }
        var clash = false;
        for (var i = 0; i < taken.length; i++) {
          if (x0 + w + GAP_ERA > taken[i][0] && x0 - GAP_ERA < taken[i][1]) {
            clash = true; break;
          }
        }
        if (!clash) { taken.push([x0, x0 + w]); break; }
        row++;
      }
      rec.node.row = row;
      rec.node.x = x0;
      rec.node.w = w;
    });
  }

  /* ================================================================ 渲染 */
  function render() {
    state.width = dom.viewport.clientWidth;
    state.height = dom.viewport.clientHeight;
    state.axisY = Math.round(state.height * AXIS_TOP);

    syncNodes();        // 先保证节点都在（量宽度要用）
    layoutEvents();
    layoutEras();
    renderAxis();
    renderItems();
    renderGrid();
    // 把最后一条也删掉之后，空状态要自己回来
    if (state.loaded) syncEmptyState();
    syncShell();
  }

  var bootSeq = 0;             // 开屏时给每条记录排的出场号

  /* 视口裁剪：事件超过 200 条时，只把"视野 ± 两屏"里的记录建成节点。
     记录少的普通时间线完全不走这条路（VIRTUAL_MIN 以下 win 恒为 null），
     所以「静止态排版不变」的前提不受影响。
     布局函数本来就有 `if (!n) return` 的护栏，没建的节点自然不参与排层。 */
  var VIRTUAL_MIN = 200;
  var VIRTUAL_MARGIN = 2;

  function itemWindow() {
    if (state.items.length <= VIRTUAL_MIN) return null;
    var span = Math.max(1e-6, state.view.end - state.view.start);
    return { from: state.view.start - span * VIRTUAL_MARGIN,
             to: state.view.end + span * VIRTUAL_MARGIN };
  }

  function inWindow(it, win) {
    if (!win) return true;
    var end = (it.end === undefined || it.end === null) ? it.start : it.end;
    return Math.max(it.start, end) >= win.from && Math.min(it.start, end) <= win.to;
  }

  /** 增删节点、写入文案，让 DOM 与 state.items 对齐（量宽度要在这一步之后） */
  function syncNodes() {
    var seen = {};
    var win = itemWindow();
    state.items.forEach(function (it) {
      seen[it.id] = true;
      if (!inWindow(it, win)) {
        delete seen[it.id];                  // 视野之外：这一轮不建也不留
        if (nodes[it.id]) dropNode(it.id);
        return;
      }
      var n = nodes[it.id];
      if (!n) {
        n = nodes[it.id] = createNode(it);
        // 刚建立的节点才播进场：开屏时错峰，之后是快速弹出。
        // 裁剪模式下"滚回来"的节点不算新来的，直接落位——否则拖动时边缘会一闪一闪。
        if (!win || state.booting) animateNodeIn(n, bootSeq++, state.booting);
      }
      setNodeText(it, n);
    });
    var alive = {};
    state.items.forEach(function (it) { alive[it.id] = true; });
    Object.keys(nodes).forEach(function (id) {
      if (seen[id] && nodes[id]) return;
      var n = nodes[id];
      delete nodes[id];
      // 只是被移出视野：静默摘下（它在屏幕外，播退场也没人看）
      if (alive[id]) { if (n.root && n.root.parentNode) n.root.parentNode.removeChild(n.root); }
      else animateNodeOut(n.root);
    });
  }

  function dropNode(id) {
    var n = nodes[id];
    if (!n) return;
    delete nodes[id];
    if (n.root && n.root.parentNode) n.root.parentNode.removeChild(n.root);
  }

  function setNodeText(item, n) {
    if (item.kind === 'era') {
      var label = item.title || '未命名';
      if (n.title && n.title.textContent !== label) n.title.textContent = label;
    } else {
      var mark = item.confidence && item.confidence !== 'exact' ? '≈ ' : '';
      var text = mark + (item.title || '未命名');
      if (n.pill && n.pill.textContent !== text) n.pill.textContent = text;
    }
  }

  /** 轴线、主刻度、年份、连接线 */
  function renderAxis() {
    var w = state.width;
    var y = state.axisY;
    var ppy = pxPerYear();
    var parts = [];
    var seq = 0;

    // --len 给开屏的「画线」动画用（stroke-dasharray 需要一个具体长度）
    parts.push('<line class="axis-line" x1="0" y1="' + (y + 0.5) + '" x2="' + w + '" y2="' + (y + 0.5) +
               '" stroke="var(--axis-line)" stroke-width="1" style="--len:' + w + '"/>');

    var step = TICK_STEPS[TICK_STEPS.length - 1];
    for (var i = 0; i < TICK_STEPS.length; i++) {
      if (TICK_STEPS[i] * ppy >= TICK_MIN_PX) { step = TICK_STEPS[i]; break; }
    }
    var first = Math.ceil(state.view.start / step) * step;
    for (var t = first; t <= state.view.end; t += step) {
      var x = Math.round(yearToX(t)) + 0.5;
      parts.push('<line class="axis-tick" style="--i:' + (seq++) + '" x1="' + x + '" y1="' + (y - 4.5) +
                 '" x2="' + x + '" y2="' + (y + 4.5) + '" stroke="var(--tick-line)" stroke-width="1"/>');
      parts.push('<text class="axis-label" style="--i:' + (seq++) + '" x="' + x + '" y="' + (y + 22) +
                 '" fill="var(--tick-label)" font-size="11" text-anchor="middle">' + t + '</text>');
    }

    var stemSeq = 0;
    state.items.forEach(function (it) {
      if (it.kind !== 'event') return;
      var n = nodes[it.id];
      if (!n) return;
      var x = Math.round(n.x) + 0.5;
      var top = y - PILL_LIFT - PILL_H - n.level * (PILL_H + PILL_GAP);
      parts.push('<line class="axis-stem" style="--i:' + (stemSeq++) + '" x1="' + x + '" y1="' + top +
                 '" x2="' + x + '" y2="' + (y - DOT / 2) + '" stroke="var(--stem)" stroke-width="1"/>');
    });

    dom.axisSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + state.height);
    dom.axisSvg.innerHTML = parts.join('');
  }

  /* 背景点阵的视差：以载入时的视野为零点，横向挪一点点，让平移有纵深。
     零点是关键 —— 不在静止态动它，就不会动摇「静止态排版不变」的前提。 */
  var gridOrigin = null;
  function renderGrid() {
    if (gridOrigin === null) gridOrigin = state.view.start;
    var shift = -(state.view.start - gridOrigin) * pxPerYear() * 0.16;
    dom.bgGrid.style.backgroundPosition = (12.5 + Math.round(shift)) + 'px 4px';
  }

  function renderItems() {
    var y = state.axisY;
    state.items.forEach(function (it) {
      var n = nodes[it.id];
      if (n) updateNode(it, n, y);
    });
  }

  function createNode(item) {
    // 主题类在创建时就带上，避免首帧从「无色」过渡到目标色（会闪一下）
    var root = el('div', item.kind === 'era' ? ('era t-' + themeOf(item)) : 'ev');
    var node = { root: root };
    root.dataset.id = item.id;

    if (item.kind === 'era') {
      root.innerHTML = '<span class="era-title"></span>' +
        '<span class="era-handle is-left" data-edge="start"></span>' +
        '<span class="era-handle is-right" data-edge="end"></span>';
      node.era = root;
      node.title = root.querySelector('.era-title');
      bindHover(root, root);
      root.addEventListener('pointerdown', onEraPointerDown);
      dom.erasLayer.appendChild(root);
    } else {
      root.innerHTML = '<span class="ev-range"></span><span class="ev-dot"></span><span class="ev-pill"></span>';
      node.range = root.querySelector('.ev-range');
      node.dot = root.querySelector('.ev-dot');
      node.pill = root.querySelector('.ev-pill');
      bindHover(node.dot, root);
      bindHover(node.pill, root);
      node.dot.addEventListener('pointerdown', onEventPointerDown);
      node.pill.addEventListener('pointerdown', onEventPointerDown);
      dom.eventsLayer.appendChild(root);
    }
    return node;
  }

  /** 悬停只在 DOM 上认 id：草稿落库换成真 id 时节点是复用的，闭包里存死 id 会失效 */
  function bindHover(target, root) {
    target.addEventListener('pointerenter', function () { onEnter(root.dataset.id); });
    target.addEventListener('pointerleave', function () { onLeave(root.dataset.id); });
  }

  function updateNode(item, n, y) {
    // 结构自愈：节点的子元素是按"创建时的类型"建的（事件的 pill vs 纪元色带）。
    // 记录类型变了（并发编辑、接口返回缺 kind…）就重建节点，否则这里会读 undefined。
    var wantsEra = item.kind === 'era';
    if (wantsEra !== !!n.era) {
      if (n.root && n.root.parentNode) n.root.parentNode.removeChild(n.root);
      delete nodes[item.id];
      var fresh = nodes[item.id] = createNode(item);
      fresh.level = n.level; fresh.row = n.row; fresh.x = n.x; fresh.w = n.w;
      n = fresh;
    }
    var selected = isSel(item.id);
    var hovered = String(state.hoverId) === String(item.id);
    n.root.dataset.id = item.id;

    if (item.kind === 'era') {
      n.era.className = 'era t-' + themeOf(item) +
        (selected ? ' is-selected' : '') +
        (hovered && !selected ? ' is-hover' : '') +
        (item.__draft && !selected ? ' is-draft' : '') +
        (n.w < 56 ? ' is-narrow' : '');
      n.era.style.left = n.x + 'px';
      n.era.style.top = (y + ERA_TOP + n.row * (ERA_H + ERA_GAP)) + 'px';
      n.era.style.width = n.w + 'px';
      // 标题不再按「放不放得下」整条显隐：那是个死循环 —— 隐藏后 scrollWidth 变 0，
      // 下一次 render 又判定「放得下」把它显示出来，于是每帧闪一次。
      // 现在交给 CSS：窄带缩内边距并直接裁切，始终稳定。
    } else {
      n.root.className = 'ev' + (selected ? ' is-selected' : '') +
        (hovered && !selected ? ' is-hover' : '');
      // 不确定时间：以事件为心画 ±range_years 的区间条；确信度决定线型
      var range = Number(item.range_years) || 0;
      if (n.range) {
        if (range > 0) {
          var half = range * pxPerYear();
          n.range.style.display = 'block';
          n.range.style.left = (-half) + 'px';
          n.range.style.width = (half * 2) + 'px';
          n.range.className = 'ev-range' +
            (item.confidence && item.confidence !== 'exact' ? ' is-' + item.confidence : '');
        } else {
          n.range.style.display = 'none';
        }
      }
      var ph = PILL_H + n.level * (PILL_H + PILL_GAP);
      n.root.style.left = n.x + 'px';
      n.root.style.top = y + 'px';
      n.pill.style.left = (-n.w / 2) + 'px';
      n.pill.style.top = -(PILL_LIFT + ph) + 'px';
    }
  }

  /* ------------------------------------------------------------ 列表视图 */
  /** 可搜索的事件 / 纪元清单：点一行把视野移过去并选中，旗子切换"重点"。 */
  var listState = { open: false, query: '', onlyFlagged: false, node: null };

  function itemStart(item) {
    return item.kind === 'era' ? Math.min(item.start, item.end) : item.start;
  }

  function listRows() {
    var query = listState.query.trim().toLowerCase();
    return state.items
      .filter(function (it) { return it.kind === 'event' || it.kind === 'era'; })
      .filter(function (it) { return !listState.onlyFlagged || it.flagged; })
      .filter(function (it) {
        if (!query) return true;
        return String(it.title || '').toLowerCase().indexOf(query) >= 0
          || String(it.desc || '').toLowerCase().indexOf(query) >= 0;
      })
      .sort(function (a, b) { return itemStart(a) - itemStart(b); });
  }

  function renderList() {
    if (!listState.node) return;
    var body = listState.node.querySelector('.tl-list-body');
    var rows = listRows();
    body.innerHTML = '';
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'tl-list-empty';
      empty.textContent = listState.onlyFlagged ? '还没有标记过的事件' : '没有匹配的记录';
      body.appendChild(empty);
      return;
    }
    rows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'tl-list-row' + (isSel(item.id) ? ' is-selected' : '');
      if (item.kind === 'event') {
        // 只有事件能标记（时间段是范围，没有"重点"这个语义）
        var flag = document.createElement('button');
        flag.type = 'button';
        flag.className = 'tl-list-flag' + (item.flagged ? ' is-on' : '');
        flag.title = item.flagged ? '取消标记' : '标记为重点';
        flag.textContent = item.flagged ? '⚑' : '⚐';
        flag.addEventListener('click', function (event) {
          event.stopPropagation();
          if (READONLY) return;
          item.flagged = !item.flagged;
          api.update(item.id, payload(item)).then(renderList).catch(function () { toast('标记没保存上'); });
        });
        row.appendChild(flag);
      } else {
        var spacer = document.createElement('span');
        spacer.className = 'tl-list-flag is-blank';
        row.appendChild(spacer);
      }

      var when = document.createElement('span');
      when.className = 'tl-list-when';
      when.textContent = item.kind === 'era' ? fmtRange(item.start, item.end) : fmtPoint(item.start);
      row.appendChild(when);

      var title = document.createElement('span');
      title.className = 'tl-list-title';
      title.textContent = item.title || '未命名';
      row.appendChild(title);

      if (item.kind === 'era') {
        var kind = document.createElement('span');
        kind.className = 'tl-list-kind';
        kind.textContent = '时间段';
        row.appendChild(kind);
      }
      row.addEventListener('click', function () {
        var span = viewSpan();
        var center = item.kind === 'era' ? (item.start + item.end) / 2 : item.start;
        state.view.start = center - span / 2;
        state.view.end = center + span / 2;
        setSelection([item.id]);
        render();
        persistView();
      });
      body.appendChild(row);
    });
  }

  function toggleListView(onlyFlagged) {
    if (listState.open && onlyFlagged) {
      listState.onlyFlagged = !listState.onlyFlagged;
      var toggle = listState.node.querySelector('.tl-list-filter');
      toggle.classList.toggle('is-on', listState.onlyFlagged);
      renderList();
      return;
    }
    if (listState.open) {
      listState.node.remove();
      listState.node = null;
      listState.open = false;
      return;
    }
    var panel = document.createElement('div');
    panel.className = 'tl-list';
    var head = document.createElement('div');
    head.className = 'tl-list-head';
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '搜索事件…';
    search.value = listState.query;
    search.addEventListener('input', function () {
      listState.query = search.value;
      renderList();
    });
    head.appendChild(search);
    var filter = document.createElement('button');
    filter.type = 'button';
    filter.className = 'tl-list-filter' + (onlyFlagged ? ' is-on' : '');
    filter.textContent = '⚑';
    filter.title = '只看标记过的事件';
    filter.addEventListener('click', function () {
      listState.onlyFlagged = !listState.onlyFlagged;
      filter.classList.toggle('is-on', listState.onlyFlagged);
      renderList();
    });
    head.appendChild(filter);
    panel.appendChild(head);
    var body = document.createElement('div');
    body.className = 'tl-list-body';
    panel.appendChild(body);
    // 画布的 pointerdown 会 preventDefault（拖动平移），那会把面板里的 click 一起吞掉，
    // 所以列表里的指针事件不许冒泡到画布。
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel'].forEach(function (type) {
      panel.addEventListener(type, function (event) { event.stopPropagation(); });
    });
    dom.viewport.appendChild(panel);
    listState.node = panel;
    listState.open = true;
    listState.onlyFlagged = !!onlyFlagged;
    filter.classList.toggle('is-on', listState.onlyFlagged);
    renderList();
    search.focus();
  }

  /* --------------------------------------------------------------- 悬停 */
  function onEnter(id) {
    if (String(state.hoverId) === String(id)) return;
    state.hoverId = id;
    hideMarkers();
    renderItems();
    scheduleHint(id);
  }

  function onLeave(id) {
    if (String(state.hoverId) !== String(id)) return;
    state.hoverId = null;
    renderItems();
    hideHint();
  }

  /* 停一会儿才浮出详情：只是路过就别打扰（时间线事件节点 hover 显示
     **事件名 / 时间 / 涉及卡片**）。 */
  var hintTimer = null;
  function scheduleHint(id) {
    hideHint();
    hintTimer = setTimeout(function () {
      var item = byId(id);
      var n = nodes[id];
      if (!item || !n) return;
      if (dragging || (state.editing && String(state.editing.id) === String(id))) return;
      showHint(item, n);
    }, 480);
  }

  function hideHint() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (!dom.hintCard.hidden) hidePanel(dom.hintCard);
  }

  function idFromUrl(url) {
    var matched = /doc=(\d+)/.exec(url || '');
    return matched ? Number(matched[1]) : 0;
  }

  function showHint(item, n) {
    var range = item.kind === 'era' ? fmtRange(item.start, item.end) : fmtFull(item.start);
    dom.hintCard.innerHTML = '';
    var date = el('span', 'hc-date');
    date.textContent = range;
    var title = el('b');
    title.textContent = item.title || '未命名';
    dom.hintCard.appendChild(date);
    dom.hintCard.appendChild(title);
    var desc = (item.desc || '').trim();
    if (desc) {
      var p = el('div');
      p.textContent = desc.length > 120 ? desc.slice(0, 120) + '…' : desc;
      dom.hintCard.appendChild(p);
    }
    // 涉及卡片（点得动，直接跳到那张卡）
    var cards = item.cards || [];
    if (cards.length) {
      var box = el('div', 'hc-cards');
      box.appendChild(el('span', 'hc-cards-label', '涉及卡片'));
      cards.slice(0, 4).forEach(function (card, index) {
        if (index) box.appendChild(el('span', 'hc-sep', '·'));
        var link = el('a', 'hc-card');
        link.textContent = card.title || '未命名';
        link.href = card.url || '#';
        link.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'ws-open-doc', id: idFromUrl(card.url), name: card.title }, '*');
          } else {
            location.href = card.url || '#';
          }
        });
        box.appendChild(link);
      });
      if (cards.length > 4) box.appendChild(el('span', 'hc-more', '等 ' + cards.length + ' 张'));
      dom.hintCard.appendChild(box);
    }
    showPanel(dom.hintCard);

    var w = dom.hintCard.offsetWidth;
    var h = dom.hintCard.offsetHeight;
    var cx = n.x + (n.w || 0) / 2;
    var top;
    if (item.kind === 'era') {
      // 纪元：先试轴线之上那片空地，放不下再退到色带下面
      top = state.axisY - h - 16;
      if (top < EDGE_PAD) top = state.axisY + ERA_TOP + n.row * (ERA_H + ERA_GAP) + ERA_H + 10;
    } else {
      top = state.axisY - PILL_LIFT - PILL_H - n.level * (PILL_H + PILL_GAP) - h - 10;
    }
    if (top + h > state.height - EDGE_PAD) {
      top = state.axisY + ERA_TOP + n.row * (ERA_H + ERA_GAP) + ERA_H + 10;
    }
    dom.hintCard.style.left = Math.round(clamp(cx - w / 2, EDGE_PAD, Math.max(EDGE_PAD, state.width - w - EDGE_PAD))) + 'px';
    dom.hintCard.style.top = Math.round(clamp(top, EDGE_PAD, Math.max(EDGE_PAD, state.height - h - EDGE_PAD))) + 'px';
  }

  /* ============================================================ 悬停标记 */
  function hideMarkers() {
    dom.pointMarker.hidden = true;
    dom.eraMarker.hidden = true;
  }

  function showPointMarker(x, t) {
    dom.eraMarker.hidden = true;
    dom.pointMarker.hidden = false;
    dom.pointMarker.dataset.time = t;
    dom.pointMarker.style.left = Math.round(x) + 'px';
    dom.pointMarker.style.top = state.axisY + 'px';
    dom.pmTip.innerHTML = fmtPoint(t) + TIP_ACTION;

    var tipW = dom.pmTip.offsetWidth;
    var tipH = dom.pmTip.offsetHeight;
    var left = clamp(-tipW / 2, EDGE_PAD - x, state.width - EDGE_PAD - x - tipW);
    dom.pmTip.style.left = Math.round(left) + 'px';
    // 提示条不能压在附近时间点的胶囊上，否则悬停轴线时它会正好盖住
    // 旁边事件的名字
    dom.pmTip.style.top = Math.round(tipTopFor(x, tipW, tipH) - state.axisY) + 'px';
  }

  /** 提示条的底边该落在哪（绝对 y）：抬到附近所有胶囊之上 */
  function tipTopFor(x, tipW, tipH) {
    var bottom = state.axisY - PILL_LIFT - PILL_H;   // 最底层胶囊的顶边
    var x0 = x - tipW / 2, x1 = x + tipW / 2;
    state.items.forEach(function (it) {
      if (it.kind !== 'event') return;
      var n = nodes[it.id];
      if (!n) return;
      if (n.x + n.w / 2 < x0 - 8 || n.x - n.w / 2 > x1 + 8) return;
      var top = state.axisY - PILL_LIFT - PILL_H - n.level * (PILL_H + PILL_GAP);
      if (top < bottom) bottom = top;
    });
    bottom -= 8;
    if (bottom - tipH < EDGE_PAD) return state.axisY - PILL_LIFT - PILL_H - 8;
    return bottom;
  }

  function showEraMarker(x, t, pointerY) {
    var half = NEW_ERA_SPAN / 2;
    var a = snapTime(t - half);
    var b = snapTime(t + half);
    var left = yearToX(a);
    var width = Math.max(yearToX(b) - left, ERA_MIN_W);
    // 先取指针所在的那一行，被占了就往下让
    var row = freeRow(Math.max(0, Math.floor((pointerY - state.axisY - ERA_TOP) / (ERA_H + ERA_GAP))), left, width);
    var top = ERA_TOP + row * (ERA_H + ERA_GAP);

    dom.pointMarker.hidden = true;
    dom.eraMarker.hidden = false;
    dom.eraMarker.style.left = '0px';
    dom.eraMarker.style.top = state.axisY + 'px';
    dom.eraMarker.dataset.start = a;
    dom.eraMarker.dataset.end = b;
    dom.emPreview.className = 'em-preview t-' + pickFreeTheme();
    dom.emPreview.style.left = Math.round(left) + 'px';
    dom.emPreview.style.top = top + 'px';
    dom.emPreview.style.width = Math.round(width) + 'px';
    dom.emTip.innerHTML = fmtRange(a, b) + TIP_ACTION;

    var tipW = dom.emTip.offsetWidth;
    dom.emTip.style.left = Math.round(
      clamp(left, EDGE_PAD, Math.max(EDGE_PAD, state.width - EDGE_PAD - tipW))) + 'px';
    dom.emTip.style.top = (top + ERA_H + 6) + 'px';
  }

  /** 从 startRow 往下找第一条在 [left, left+width] 区间空着的行 */
  function freeRow(startRow, left, width) {
    for (var row = startRow; row < 40; row++) {
      var clash = false;
      state.items.forEach(function (it) {
        if (clash || it.kind !== 'era') return;
        var n = nodes[it.id];
        if (!n || n.row !== row) return;
        if (left + width + GAP_ERA > n.x && left - GAP_ERA < n.x + n.w) clash = true;
      });
      if (!clash) return row;
    }
    return startRow;
  }

  /* ============================================================== 指针交互 */
  function pointerPos(e) {
    var r = dom.viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerMove(e) {
    var p = pointerPos(e);
    state.pointer = p;
    // 只读：不显示「点一下新建」的 + / 时间段预览
    if (READONLY) { hideMarkers(); return; }
    if (dragging || state.hoverId) return;
    if (state.tool === 'hand') { hideMarkers(); return; }

    var dy = p.y - state.axisY;
    if (Math.abs(dy) <= AXIS_ZONE) {
      var t = snapTime(xToYear(p.x));
      showPointMarker(yearToX(t), t);
    } else if (dy > AXIS_ZONE) {
      showEraMarker(p.x, xToYear(p.x), p.y);
    } else {
      hideMarkers();
    }
  }

  function onPointerDown(e) {
    if (e.button === 2) {
      if (!READONLY && state.tool === 'select' && !e.target.closest('.toolbar, .zoom-stack, .help-btn, .editor, .settings, .sel-bar, .help-panel, .empty')) {
        e.preventDefault();
        startMarquee(e, pointerPos(e));
      }
      return;
    }
    if (e.button !== 0) return;
    if (state.selection.length && !e.target.closest('.era') && !e.target.closest('.ev')) {
      clearSelection();
      return;
    }
    if (e.target.closest('.toolbar, .zoom-stack, .help-btn, .editor, .settings, .date-pop, .toast, .empty, .help-panel, .coach, .save-chip, .scrim')) return;
    if (e.target.closest('.era') || e.target.closest('.ev') || e.target.closest('.pm-plus')) return;

    var p = pointerPos(e);
    var dy = p.y - state.axisY;
    cancelViewTween();
    dropCoach();

    if (state.tool === 'hand' || dy < -AXIS_ZONE) {
      hideMarkers();
      startPan(e, p);
      return;
    }

    // 只读：轴线附近 / 下方也不落子，整块画布只用来平移
    if (READONLY) {
      hideMarkers();
      startPan(e, p);
      return;
    }

    // 轴线附近 / 轴线下方：按下先不落子。
    // 拖出去就是平移画布，原地松开才算「点一下新建」——
    // 否则轴线下方那半屏永远只能新建、不能拖画面。
    dragging = {
      mode: 'pending', x0: p.x, y0: p.y, moved: false,
      zone: Math.abs(dy) <= AXIS_ZONE ? 'point' : 'era'
    };
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function startPan(e, p) {
    dragging = { mode: 'pan', x0: p.x, view: { start: state.view.start, end: state.view.end } };
    dom.viewport.classList.add('is-panning');
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
    closeEditor();
  }

  function onPointerMoveGlobal(e) {
    var p = pointerPos(e);
    if (!dragging) { onPointerMove(e); return; }

    var dx = p.x - dragging.x0;

    // 还没决定是「点」还是「拖」：动了 5px 就改成拖画面
    if (dragging.mode === 'pending') {
      if (Math.abs(dx) <= 5 && Math.abs(p.y - dragging.y0) <= 5) return;
      var origin = dragging.x0;
      dragging = {
        mode: 'pan', x0: origin, moved: true,
        view: { start: state.view.start, end: state.view.end }
      };
      hideMarkers();
      hideHint();
      dom.viewport.classList.add('is-panning');
      try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
    }

    if (Math.abs(dx) > 2) dragging.moved = true;

    if (dragging.mode === 'marquee') {
      dragging.x1 = p.x;
      dragging.y1 = p.y;
      drawMarquee();
      return;
    }
    if (dragging.mode === 'group-move') {
      var dts = dx / pxPerYear();
      dragging.snaps.forEach(function (sn) {
        var it = byId(sn.id);
        if (!it) return;
        it.start = snapTime(sn.start + dts);
        if (it.kind === 'era') it.end = snapTime(sn.end + dts);
        else it.end = it.start;
      });
      render();
      var first = dragging.snaps[0] ? byId(dragging.snaps[0].id) : null;
      if (first) showDragTip(p.x, p.y, dragging.snaps.length + ' 条记录');
      return;
    }
    if (dragging.mode === 'pan') {
      var dYear = -dx / pxPerYear();
      state.view.start = dragging.view.start + dYear;
      state.view.end = dragging.view.end + dYear;
      render();
    } else if (dragging.mode === 'era-move') {
      var it = byId(dragging.id);
      if (it) {
        var dt = dx / pxPerYear();
        it.start = snapTime(dragging.start + dt);
        it.end = snapTime(dragging.end + dt);
        render();
        syncEditor();
        showDragTip(p.x, p.y, fmtRange(it.start, it.end));
      }
    } else if (dragging.mode === 'era-resize') {
      var it2 = byId(dragging.id);
      if (it2) {
        var dt2 = dx / pxPerYear();
        if (dragging.edge === 'start') {
          it2.start = Math.min(snapTime(dragging.start + dt2), it2.end - 1 / MONTHS);
          showDragTip(p.x, p.y, fmtFull(it2.start));
        } else {
          it2.end = Math.max(snapTime(dragging.end + dt2), it2.start + 1 / MONTHS);
          showDragTip(p.x, p.y, fmtFull(it2.end));
        }
        render();
        syncEditor();
      }
    } else if (dragging.mode === 'event-move') {
      var it3 = byId(dragging.id);
      if (it3) {
        // 拖动时**节点跟手**（先不吸附），松手才吸到刻度上并 200ms 回弹。
        it3.start = dragging.start + dx / pxPerYear();
        it3.end = it3.start;
        if (!dragging.ghost) dragGhost(dragging, it3);
        render();
        syncEditor();
        showDragTip(p.x, p.y, fmtPoint(snapTime(it3.start)));
      }
    }
  }

  /** 原位留一个虚线轮廓：松手前一直标着"它原来在哪儿"。 */
  function dragGhost(d, item) {
    var ghost = document.createElement('div');
    ghost.className = 'ev-ghost';
    ghost.style.left = yearToX(d.start) + 'px';
    d.ghost = ghost;
    dom.eventsLayer.appendChild(ghost);
    void item;
  }

  function dropGhost(d) {
    if (d && d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (d) d.ghost = null;
  }

  /** 松手回弹：从松手时的位置弹到吸附后的位置，200ms。 */
  function springTo(id, fromX) {
    var node = nodes[id];
    if (!node || !node.root) return;
    var toX = parseFloat(node.root.style.left);
    if (isNaN(toX)) return;
    var delta = fromX - toX;
    if (Math.abs(delta) < 1 || typeof node.root.animate !== 'function') return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    var parts = [node.root];
    if (node.dot) parts.push(node.dot);
    if (node.pill) parts.push(node.pill);
    parts.forEach(function (part) {
      part.animate(
        [{ transform: 'translateX(' + delta + 'px)' }, { transform: 'translateX(0)' }],
        { duration: 200, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' }
      );
    });
  }

  function onPointerUp(e) {
    if (!dragging) return;
    var mode = dragging.mode;
    var moved = dragging.moved;
    var cancelled = e && e.type === 'pointercancel';

    if (mode === 'pending') {
      var zone = dragging.zone;
      var p = pointerPos(e || { clientX: 0, clientY: 0 });
      dragging = null;
      if (cancelled) return;
      if (zone === 'era') createEraAt(snapTime(xToYear(p.x)));
      else createEventAt(snapTime(xToYear(p.x)));
      return;
    }
    if (mode === 'marquee') {
      finishMarquee();
      dragging = null;
      return;
    }
    if (mode === 'group-move') {
      var snaps = dragging.snaps;
      dragging = null;
      hidePanel(dom.dragTip);
      snaps.forEach(function (sn) {
        var it = byId(sn.id);
        if (it && !it.__draft) api.update(it.id, payload(it)).catch(function () {});
      });
      return;
    }
    var dropId = dragging.id;
    var dropped = dragging.start;
    var dropX = e ? pointerPos(e).x : yearToX(dropped);
    dropGhost(dragging);
    dragging = null;
    dom.viewport.classList.remove('is-panning');
    hidePanel(dom.dragTip);
    if (mode === 'pan') { persistView(); }
    else if (moved) {
      // 吸附到刻度 -> 落库 -> 从松手的位置弹到吸附后的位置
      var it = byId(dropId);
      if (it && mode === 'event-move') {
        it.start = snapTime(it.start);
        it.end = it.start;
      }
      commitEditor(true);
      if (mode === 'event-move') springTo(dropId, dropX);
      void dropped;
    }
  }

  function showDragTip(x, y, text) {
    if (dom.dragTip.hidden) showPanel(dom.dragTip);
    dom.dragTip.textContent = text;
    dom.dragTip.style.left = Math.round(
      clamp(x + 14, EDGE_PAD, state.width - dom.dragTip.offsetWidth - EDGE_PAD)) + 'px';
    dom.dragTip.style.top = Math.round(clamp(y - 42, EDGE_PAD, state.height - 40)) + 'px';
  }

  /** Esc：把这次拖拽整个撤回，一条都不落库 */
  function cancelDrag() {
    if (!dragging) return false;
    var d = dragging;
    dragGhost && dropGhost(d);
    dragging = null;
    dom.viewport.classList.remove('is-panning');
    hidePanel(dom.dragTip);
    dom.marquee.hidden = true;
    var restore = function (id, start, end) {
      var it = byId(id);
      if (!it) return;
      it.start = start;
      it.end = end;
    };
    if (d.mode === 'pan') {
      state.view.start = d.view.start;
      state.view.end = d.view.end;
    } else if (d.mode === 'era-move' || d.mode === 'era-resize') {
      restore(d.id, d.start, d.end);
    } else if (d.mode === 'event-move') {
      restore(d.id, d.start, d.start);
    } else if (d.mode === 'group-move') {
      d.snaps.forEach(function (sn) { restore(sn.id, sn.start, sn.end); });
    } else if (d.mode === 'marquee') {
      return true;                         // 框选还没落子，直接丢掉就行
    }
    render();
    syncEditor();
    toast('已取消这次拖拽');
    return true;
  }

  /* ============================================================== 新建记录 */
  function draftId() { return 'draft-' + (draftSeq++); }
  var draftSeq = 1;

  function createEventAt(t) {
    if (READONLY) return;
    var item = {
      id: draftId(), kind: 'event', title: '新事件', start: t, end: t, desc: '',
      row: 0, theme: '', cover: '', cards: [], __draft: true
    };
    state.items.push(item);
    state.selectedId = item.id;
    state.suppressDocClose = true;
    hideMarkers();          // 已经建出来了，别再把「点击添加」的预览挂在那儿
    hidePanel(dom.emptyState);
    dropCoach();
    render();
    openEditor(item);
    focusTitle();
  }

  function createEraAt(t) {
    if (READONLY) return;
    var half = NEW_ERA_SPAN / 2;
    var item = {
      id: draftId(), kind: 'era', title: '新纪元',
      start: snapTime(t - half), end: snapTime(t + half), desc: '',
      row: 0, theme: pickFreeTheme(), cover: '', cards: [], __draft: true
    };
    state.items.push(item);
    state.selectedId = item.id;
    state.suppressDocClose = true;
    hideMarkers();
    hidePanel(dom.emptyState);
    dropCoach();
    render();
    openEditor(item);
    focusTitle();
  }

  function pickFreeTheme() {
    var used = {};
    state.items.forEach(function (it) { if (it.theme) used[it.theme] = 1; });
    for (var i = 0; i < THEMES.length; i++) if (!used[THEMES[i]]) return THEMES[i];
    return THEMES[state.items.length % THEMES.length];
  }

  /* ============================================================ 框选多选 */
  function clearSelection() {
    if (!state.selection.length) return;
    state.selection = [];
    hidePanel(dom.selBar);
    renderItems();
  }

  function setSelection(ids) {
    state.selection = ids.slice();
    if (ids.length) {
      dom.selCount.textContent = ids.length + ' 已选择';
      showPanel(dom.selBar);
    } else {
      hidePanel(dom.selBar);
    }
    hidePanel(dom.editor);
    state.editing = null;
    state.selectedId = null;
    render();
  }

  function startMarquee(e, p) {
    dragging = { mode: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    dom.marquee.hidden = false;
    drawMarquee();
    hideMarkers();
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function drawMarquee() {
    if (!dragging || dragging.mode !== 'marquee') return;
    var x = Math.min(dragging.x0, dragging.x1);
    var y = Math.min(dragging.y0, dragging.y1);
    dom.marquee.style.left = x + 'px';
    dom.marquee.style.top = y + 'px';
    dom.marquee.style.width = Math.abs(dragging.x1 - dragging.x0) + 'px';
    dom.marquee.style.height = Math.abs(dragging.y1 - dragging.y0) + 'px';
  }

  /** 松手：把与矩形相交的时间点 / 纪元都选上 */
  function finishMarquee() {
    var x0 = Math.min(dragging.x0, dragging.x1);
    var x1 = Math.max(dragging.x0, dragging.x1);
    var y0 = Math.min(dragging.y0, dragging.y1);
    var y1 = Math.max(dragging.y0, dragging.y1);
    var hits = [];
    state.items.forEach(function (it) {
      var n = nodes[it.id];
      if (!n) return;
      var bx0, bx1, by0, by1;
      if (it.kind === 'era') {
        bx0 = n.x; bx1 = n.x + n.w;
        by0 = state.axisY + ERA_TOP + n.row * (ERA_H + ERA_GAP);
        by1 = by0 + ERA_H;
      } else {
        var top = state.axisY - PILL_LIFT - PILL_H - n.level * (PILL_H + PILL_GAP);
        bx0 = n.x - n.w / 2; bx1 = n.x + n.w / 2;
        by0 = top; by1 = state.axisY + DOT / 2;
      }
      if (bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1) hits.push(it.id);
    });
    dom.marquee.hidden = true;
    setSelection(hits);
  }

  function deleteSelection() {
    if (READONLY) return;
    var ids = state.selection.slice();
    if (!ids.length) return;
    state.selection = [];
    hidePanel(dom.selBar);
    var snapshots = [];
    var jobs = ids.map(function (id) {
      var item = byId(id);
      if (!item) return Promise.resolve();
      var snapshot = payload(item);
      return api.remove(id).then(function () {
        snapshots.push(snapshot);
        var idx = state.items.indexOf(item);
        if (idx >= 0) state.items.splice(idx, 1);
      }).catch(function () { toast('删除失败'); });
    });
    Promise.all(jobs).then(function () {
      state.selectedId = null;
      render();
      if (snapshots.length) pushUndo({ label: snapshots.length + ' 条记录', items: snapshots });
      toast('已删除 ' + ids.length + ' 条',
        snapshots.length ? { label: '撤销', run: undo } : null);
    });
  }

  function duplicateSelection() {
    if (READONLY) return;
    var ids = state.selection.slice();
    if (!ids.length) return;
    markSaving();
    var jobs = ids.map(function (id) {
      var item = byId(id);
      if (!item) return null;
      var copy = payload(item);
      copy.title = (item.title || '未命名') + ' (copy)';
      return api.create(copy).then(function (saved) { state.items.push(saved); return saved.id; });
    }).filter(Boolean);
    Promise.all(jobs).then(function (saved) {
      render();
      showSaved();
      pushUndo({ created: saved, label: saved.length + ' 条记录' });
      setSelection(saved);
      toast('已复制 ' + saved.length + ' 条', { label: '撤销', run: undo });
    }).catch(function () { showSaveFailed(); toast('复制失败'); });
  }

  /* ============================================================ 拖拽记录 */
  function onEraPointerDown(e) {
    if (READONLY) return;
    var root = e.currentTarget;
    var item = byId(root.dataset.id);
    if (!item) return;
    e.stopPropagation();
    if (state.tool === 'hand') { startPan(e, pointerPos(e)); return; }
    if (state.selection.length > 1 && isSel(item.id)) {
      startGroupDrag(e, pointerPos(e));
      return;
    }
    var edge = e.target.dataset ? e.target.dataset.edge : null;
    var p = pointerPos(e);
    state.hoverId = item.id;
    state.selectedId = item.id;
    render();
    openEditor(item);
    dragging = {
      mode: edge ? 'era-resize' : 'era-move', edge: edge, id: item.id,
      x0: p.x, start: item.start, end: item.end, moved: false
    };
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onEventPointerDown(e) {
    if (READONLY) return;
    var root = e.currentTarget.parentNode;
    var item = byId(root.dataset.id);
    if (!item) return;
    e.stopPropagation();
    if (state.tool === 'hand') { startPan(e, pointerPos(e)); return; }
    if (state.selection.length > 1 && isSel(item.id)) {
      startGroupDrag(e, pointerPos(e));
      return;
    }
    var p = pointerPos(e);
    state.selectedId = item.id;
    render();
    openEditor(item);
    dragging = { mode: 'event-move', id: item.id, x0: p.x, start: item.start, moved: false };
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
  }

  /** 拖整组：所有被选中的记录一起平移 */
  function startGroupDrag(e, p) {
    var snaps = state.selection.map(function (id) {
      var it = byId(id);
      return it ? { id: id, start: it.start, end: it.end } : null;
    }).filter(Boolean);
    dragging = { mode: 'group-move', x0: p.x, snaps: snaps, moved: false };
    try { dom.viewport.setPointerCapture(e.pointerId); } catch (err) {}
  }

  /* ================================================================ 缩放 */
  /* 按钮缩放 / 适应内容都走补间：视野「飞」过去，而不是瞬移。
     平移量按年线性插值，跨度按对数插值 —— 缩放看起来才是匀速的。 */
  var viewTween = null;

  function cancelViewTween() {
    if (viewTween) { cancelAnimationFrame(viewTween); viewTween = null; }
  }

  function applyView(start, end, animate) {
    cancelViewTween();
    if (end <= start) return;
    if (!animate || reducedMotion()) {
      state.view.start = start;
      state.view.end = end;
      render();
      persistView();
      return;
    }
    var s0 = state.view.start, e0 = state.view.end;
    var c0 = (s0 + e0) / 2, c1 = (start + end) / 2;
    var l0 = Math.log(Math.max(e0 - s0, 1e-9)), l1 = Math.log(Math.max(end - start, 1e-9));
    // 进度用挂钟算，不用 rAF 给的时间戳：某些环境下（无显示的 headless、
    // 掉帧的标签页）帧时间戳会原地不动，用它当进度就会永远 k<1、无限重排。
    var t0 = Date.now();
    var frames = 0;
    var DUR = 340;
    viewTween = requestAnimationFrame(function step() {
      frames++;
      var k = Math.min(1, (Date.now() - t0) / DUR);
      if (frames > 240) k = 1;                  // 再兜一层，绝不空转
      var e = 1 - Math.pow(1 - k, 3);           // easeOutCubic
      var center = c0 + (c1 - c0) * e;
      var span = Math.exp(l0 + (l1 - l0) * e);
      state.view.start = center - span / 2;
      state.view.end = center + span / 2;
      render();
      if (k < 1) {
        viewTween = requestAnimationFrame(step);
      } else {
        viewTween = null;
        state.view.start = start;
        state.view.end = end;
        render();
        persistView();
      }
    });
  }

  /** 算出「以 cx 为锚点缩放 factor 倍」之后的目标视野 */
  function zoomTarget(factor, cx) {
    var ppy = pxPerYear();
    var anchor = xToYear(cx == null ? state.width / 2 : cx);
    var next = clamp(ppy * factor, state.width / MAX_SPAN, state.width / MIN_SPAN);
    var newSpan = state.width / next;
    var ratio = (anchor - state.view.start) / viewSpan();
    var start = anchor - ratio * newSpan;
    return { start: start, end: start + newSpan };
  }

  function zoomAt(factor, cx, animate) {
    var target = zoomTarget(factor, cx);
    applyView(target.start, target.end, animate);
  }

  /** 用视野表示「新的起止」，供适应内容用 */
  function fitTarget() {
    if (!state.items.length) return null;
    var min = Infinity, max = -Infinity;
    state.items.forEach(function (it) {
      min = Math.min(min, it.start);
      max = Math.max(max, it.end != null ? it.end : it.start);
    });
    var pad = Math.max((max - min) * 0.08, 0.5);
    return { start: min - pad, end: max + pad };
  }

  function fitToContent(animate) {
    var target = fitTarget();
    var next = target || { start: -20, end: 40 };
    applyView(next.start, next.end, animate !== false);
  }

  /* ============================================================== 编辑弹层 */
  function openEditor(item) {
    if (READONLY) return;
    state.editing = item;
    var isEra = item.kind === 'era';
    var wasOpen = !dom.editor.hidden;

    dom.editor.className = 'editor t-' + themeOf(item);
    dom.edTitle.textContent = item.title || '';
    dom.edDesc.textContent = item.desc || '';
    dom.edEnd.hidden = !isEra;
    dom.edCardsText.textContent = isEra ? '链接卡片' : '添加卡片';
    dom.edCardsIcon.innerHTML = (window.ICONS || {})[isEra ? 'link' : 'plus'] || '';
    applyCover(item);
    hidePanel(dom.palette);
    // 先让卡片可见再 syncEditor：syncEditor 开头有「卡片没开就直接返回」的护栏，
    // 顺序反了日期就永远停在模板里的占位文案上。
    if (wasOpen) {
      dom.editor.hidden = false;     // 已经开着：只换内容，不重播进场
    } else {
      showPanel(dom.editor);
    }
    syncEditor();
  }

  function applyCover(item) {
    var isEra = item.kind === 'era';
    if (item.cover) {
      dom.edCover.dataset.filled = 'true';
      dom.edCover.style.backgroundImage = 'url("' + item.cover + '")';
      dom.edCover.style.backgroundSize = 'cover';
      dom.edCover.style.backgroundPosition = 'center';
      dom.edCover.style.backgroundColor = '';
    } else if (isEra) {
      dom.edCover.dataset.filled = 'true';
      dom.edCover.style.backgroundImage = '';
      dom.edCover.style.backgroundColor = '';
    } else {
      dom.edCover.dataset.filled = 'false';
      dom.edCover.style.backgroundImage = '';
      dom.edCover.style.backgroundColor = '';
    }
  }

  function syncEditor() {
    var item = state.editing;
    if (!item || dom.editor.hidden) return;
    dom.edStartText.textContent = item.kind === 'era' ? fmtFull(item.start) : fmtPoint(item.start);
    dom.edEndText.textContent = fmtFull(item.end != null ? item.end : item.start);
    if (document.activeElement !== dom.edTitle && dom.edTitle.textContent !== (item.title || '')) {
      dom.edTitle.textContent = item.title || '';
    }
    if (document.activeElement !== dom.edDesc && dom.edDesc.textContent !== (item.desc || '')) {
      dom.edDesc.textContent = item.desc || '';
    }
    positionEditor();
  }

  /** 卡片水平居中于锚点，底边距锚点顶边 10px；仅在会超出视口顶部时下压 */
  function positionEditor() {
    var item = state.editing;
    if (!item || dom.editor.hidden) return;
    var n = nodes[item.id];
    var w = dom.editor.offsetWidth || 360;
    var h = dom.editor.offsetHeight || 321;
    var cx = n ? n.x + (n.w || 0) / 2 : state.width / 2;
    var anchorTop = state.axisY + ERA_TOP;
    if (item.kind === 'ev' || item.kind === 'event') {
      var level = n ? n.level : 0;
      anchorTop = state.axisY - PILL_LIFT - PILL_H - level * (PILL_H + PILL_GAP);
    } else if (n) {
      anchorTop = state.axisY + ERA_TOP + n.row * (ERA_H + ERA_GAP);
    }
    var left = Math.round(cx - w / 2);
    var top = Math.round(anchorTop - 10 - h);
    left = clamp(left, 8 - w + 40, state.width - 40);
    if (top < 6) top = 6;
    dom.editor.style.left = left + 'px';
    dom.editor.style.top = top + 'px';
  }

  function openPalette() {
    var item = state.editing;
    if (!item || item.kind !== 'era') return;
    Array.prototype.forEach.call(dom.palette.querySelectorAll('.palette-swatch'), function (b) {
      b.classList.toggle('is-active', b.dataset.theme === themeOf(item));
    });
    var r = dom.edCover.getBoundingClientRect();
    // 调色板是 position:fixed，夹边界要用窗口尺寸而不是画布尺寸
    dom.palette.style.left = Math.round(clamp(r.left, 8, window.innerWidth - 190)) + 'px';
    dom.palette.style.top = Math.round(clamp(r.top - 6, 8, window.innerHeight - 70)) + 'px';
    showPanel(dom.palette);
  }

  function closeEditor() {
    if (dom.editor.hidden) return;
    var item = state.editing;
    // 顺序很重要：commitEditor 读的是 state.editing，
    // 先把它清成 null 的话这次收尾保存就永远不会发生
    // （所以点别处关卡片时最后那几个字其实没落库，全靠防抖和 blur 兜着）。
    if (item && item.__draft) {
      if (!item.title && !item.desc) {
        var idx = state.items.indexOf(item);
        if (idx >= 0) state.items.splice(idx, 1);
      } else {
        commitEditor(true);
      }
    } else if (item) {
      commitEditor(true);
    }
    hidePanel(dom.editor);
    hidePanel(dom.datePop);
    hidePanel(dom.palette);
    hideHint();
    state.editing = null;
    state.selectedId = null;
    render();
  }

  function focusTitle() {
    dom.edTitle.focus();
    var r = document.createRange();
    r.selectNodeContents(dom.edTitle);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /* ============================================================== 记录读写 */
  function byId(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (String(state.items[i].id) === String(id)) return state.items[i];
    }
    return null;
  }

  function payload(item) {
    return {
      kind: item.kind,
      title: item.title || '',
      start: item.start,
      end: item.kind === 'era' ? item.end : item.start,
      desc: item.desc || '',
      row: item.row || 0,
      theme: item.kind === 'era' ? themeOf(item) : '',
      cover: item.cover || '',
      cards: item.cards || [],
      flagged: !!item.flagged          // 事件的重点标记（时间段忽略）
    };
  }

  function scheduleCommit() {
    if (READONLY) return;
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(function () { commitEditor(true); }, 500);
  }

  function commitEditor(silent) {
    if (READONLY) return;
    var item = state.editing;
    if (commitTimer) { clearTimeout(commitTimer); commitTimer = null; }
    if (!item) return;

    item.title = (dom.edTitle.textContent || '').trim();
    item.desc = (dom.edDesc.textContent || '').trim();

    if (item.__draft) {
      if (!item.title && !item.desc) return;   // 空草稿先不落库
      delete item.__draft;
      var snapshot = item;
      markSaving();
      api.create(payload(item)).then(function (saved) {
        adopt(snapshot, saved);
        showSaved();
      }).catch(function () {
        showSaveFailed();
        if (!silent) toast('保存失败，请重试');
      });
    } else {
      markSaving();
      api.update(item.id, payload(item)).then(showSaved).catch(function () {
        showSaveFailed();
        if (!silent) toast('保存失败，请重试');
      });
    }
  }

  /** 用服务端返回的记录替换本地草稿。
      节点是「过户」而不是重建的：草稿 id 换成真 id 时若重建 DOM，
      会看到一次多余的退场 + 进场闪动。 */
  function adopt(oldItem, saved) {
    var idx = state.items.indexOf(oldItem);
    if (idx < 0) return;
    var oldId = oldItem.id;
    state.items[idx] = saved;
    var n = nodes[oldId];
    if (n) {
      delete nodes[oldId];
      nodes[saved.id] = n;
      n.root.dataset.id = saved.id;
    }
    if (String(state.selectedId) === String(oldId)) state.selectedId = saved.id;
    if (state.editing === oldItem) state.editing = saved;
    render();
  }

  function deleteEditing() {
    if (READONLY) return;
    var item = state.editing;
    if (!item) return;
    if (item.__draft) { closeEditor(); return; }
    var snapshot = payload(item);
    api.remove(item.id).then(function () {
      var idx = state.items.indexOf(item);
      if (idx >= 0) state.items.splice(idx, 1);
      pushUndo({ label: item.title || '未命名', items: [snapshot] });
      hidePanel(dom.editor);
      state.editing = null;
      state.selectedId = null;
      render();
      toast('已删除「' + (snapshot.title || '未命名') + '」', { label: '撤销', run: undo });
    }).catch(function () { toast('删除失败'); });
  }

  function duplicateSelected() {
    if (READONLY) return;
    var item = state.selectedId ? byId(state.selectedId) : null;
    if (!item) { toast('先选中一条记录'); return; }
    var copy = payload(item);
    copy.title = (item.title || '未命名') + ' (copy)';
    markSaving();
    api.create(copy).then(function (saved) {
      state.items.push(saved);
      state.selectedId = saved.id;
      pushUndo({ created: [saved.id], label: saved.title });
      render();
      showSaved();
      toast('已复制一份', { label: '撤销', run: undo });
    }).catch(function () { showSaveFailed(); toast('复制失败'); });
  }

  /* ================================================================ 接口 */
  function req(method, url, body) {
    // 只读兜底：任何非 GET 请求都不发出去，直接给一个假成功，
    // 免得某条漏网路径把编辑写进 wiki 背后的世界。
    if (READONLY && method !== 'GET') {
      return Promise.resolve({ ok: true, readonly: true });
    }
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var api = {
    get: function () { return req('GET', '/api/timeline'); },
    create: function (d) { return req('POST', '/api/items', d); },
    update: function (id, d) { return req('PUT', '/api/items/' + id, d); },
    remove: function (id) { return req('DELETE', '/api/items/' + id); },
    view: function (d) { return req('PUT', '/api/view', d); }
  };

  function persistView() {
    if (READONLY) return;
    if (viewTimer) clearTimeout(viewTimer);
    viewTimer = setTimeout(function () {
      api.view({ start: state.view.start, end: state.view.end }).catch(function () {});
    }, 400);
  }

  /* ============================================================ 保存状态 */
  /* 编辑卡片没有保存按钮，改动是「边打边存」的。没有反馈的话，
     用户根本不知道写进去了没有 —— 所以左下角留一个很轻的状态点。 */
  var saveTimer = null;

  function markSaving() {
    clearTimeout(saveTimer);
    dom.saveChipText.textContent = '保存中';
    dom.saveChip.classList.add('is-saving');
    dom.saveChip.classList.remove('is-error');
    showPanel(dom.saveChip);
  }

  function showSaved() {
    clearTimeout(saveTimer);
    dom.saveChipText.textContent = '已保存';
    dom.saveChip.classList.remove('is-saving', 'is-error');
    showPanel(dom.saveChip);
    saveTimer = setTimeout(function () { hidePanel(dom.saveChip); }, 1500);
  }

  function showSaveFailed() {
    clearTimeout(saveTimer);
    dom.saveChipText.textContent = '保存失败';
    dom.saveChip.classList.remove('is-saving');
    dom.saveChip.classList.add('is-error');
    showPanel(dom.saveChip);
    saveTimer = setTimeout(function () { hidePanel(dom.saveChip); }, 4000);
  }

  /* ================================================================ 撤销 */
  /* 只覆盖「删掉」和「复制出来」这两类会凭空多/少一条记录的操作，
     它们是唯一不可逆的。改标题、拖位置这些都能再改回来，不进栈。 */
  var undoStack = [];

  function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > 20) undoStack.shift();
  }

  function undo() {
    if (READONLY) return;
    var entry = undoStack.pop();
    if (!entry) { toast('没有可撤销的操作了'); return; }

    if (entry.items) {                    // 撤销删除：重新建出来
      markSaving();
      Promise.all(entry.items.map(function (p) {
        return api.create(p).then(function (saved) {
          state.items.push(saved);
          return saved;
        });
      })).then(function (saved) {
        render();
        showSaved();
        if (saved.length === 1) {
          state.selectedId = saved[0].id;
          renderItems();
        } else {
          setSelection(saved.map(function (s) { return s.id; }));
        }
        toast('已恢复 ' + saved.length + ' 条记录');
      }).catch(function () { showSaveFailed(); toast('撤销失败'); });
      return;
    }

    if (entry.created) {                  // 撤销复制：把刚建出来的删掉
      var ids = entry.created.slice();
      Promise.all(ids.map(function (id) {
        return api.remove(id).catch(function () {});
      })).then(function () {
        ids.forEach(function (id) {
          for (var i = state.items.length - 1; i >= 0; i--) {
            if (String(state.items[i].id) === String(id)) state.items.splice(i, 1);
          }
        });
        if (ids.indexOf(state.selectedId) >= 0) state.selectedId = null;
        render();
        toast('已撤销');
      });
    }
  }

  /* ================================================================ Toast */
  var toastTimer = null;

  /** action 可选：{ label, run } —— 删除这类破坏性操作配上「撤销」就不必再弹确认框 */
  function toast(text, action) {
    if (dom.toastAct) { dom.toastAct.remove(); dom.toastAct = null; }
    dom.toastText.textContent = text;
    if (action) {
      var btn = el('button', 'toast-act');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', function () {
        hidePanel(dom.toast);
        action.run();
      });
      dom.toast.appendChild(btn);
      dom.toastAct = btn;
    }
    showPanel(dom.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { hidePanel(dom.toast); }, action ? 5200 : 2200);
  }

  /* ============================================================== 日历设置 */
  var settings = { perspective: 'earth', precision: 'month', origin: 'open' };

  function cnDate(d) { return d.year + '年' + d.month + '月' + d.day + '日'; }

  function sampleText() {
    var d = { year: 50, month: 7, day: 12 };
    if (settings.perspective === 'earth') {
      if (settings.precision === 'year') return d.year + '年';
      if (settings.precision === 'month') return d.year + '年' + d.month + '月';
      return cnDate(d);
    }
    if (settings.precision === 'year') return 'Year ' + d.year;
    return fmtFull(join(d.year, d.month, d.day));
  }

  function syncSettings() {
    var s = split(state.view.start);
    var e = split(state.view.end);
    var earth = settings.perspective === 'earth';
    dom.stRangeStartText.textContent = earth ? cnDate(s) : fmtFull(join(s.year, s.month, s.day));
    dom.stRangeEndText.textContent = earth ? cnDate(e) : fmtFull(join(e.year, e.month, e.day));
    dom.stSample.textContent = sampleText();
    dom.stCustom.hidden = earth;
    segSet(dom.stPerspective, settings.perspective);
    segSet(dom.stPrecision, settings.precision);
    segSet(dom.stOrigin, settings.origin);
  }

  function segSet(root, value) {
    Array.prototype.forEach.call(root.querySelectorAll('.st-seg-item'), function (b) {
      b.classList.toggle('is-active', b.dataset.value === value);
    });
  }

  function openSettings() {
    syncSettings();
    // 先放出来再量：hidden 时 offsetHeight 是 0，按 0 算就会把面板推到屏幕外
    showPanel(dom.settings);
    var btn = dom.toolbar.querySelector('[data-tool="calendar"]');
    var w = 316;
    var h = dom.settings.offsetHeight;
    // 面板是 position:fixed（窗口坐标），夹边界必须用窗口尺寸；
    // 用画布尺寸的话，整页壳里右栏会把它挤到左栏上去。
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left = vw / 2 - w / 2;
    var top = Math.max(8, vh - 200 - h);
    if (btn) {
      var br = btn.getBoundingClientRect();
      left = clamp(br.left + br.width / 2 - w / 2, 8, Math.max(8, vw - w - 8));
      top = Math.max(8, br.top - 10 - h);
    }
    left = clamp(left, 8, Math.max(8, vw - w - 8));
    top = clamp(top, 8, Math.max(8, vh - h - 8));
    dom.settings.style.left = Math.round(left) + 'px';
    dom.settings.style.top = Math.round(top) + 'px';
  }

  function closeSettings() { hidePanel(dom.settings); }

  /* ============================================================ 操作指南 */
  function openHelp() {
    showPanel(dom.scrim);
    showPanel(dom.helpPanel);
    dom.helpClose.focus();
  }

  function closeHelp() {
    hidePanel(dom.scrim);
    hidePanel(dom.helpPanel);
  }

  function toggleHelp() {
    if (dom.helpPanel.hidden) openHelp(); else closeHelp();
  }

  function bindSettings() {
    segBind(dom.stPerspective, 'perspective');
    segBind(dom.stPrecision, 'precision');
    segBind(dom.stOrigin, 'origin');
    dom.stFit.addEventListener('click', function () { fitToContent(); syncSettings(); });
    dom.stApply.addEventListener('click', function () { closeSettings(); persistView(); });
    dom.stCancel.addEventListener('click', closeSettings);
    dom.stAddSatellite.addEventListener('click', function () { toast('卫星功能待接入'); });
  }

  function segBind(root, key) {
    Array.prototype.forEach.call(root.querySelectorAll('.st-seg-item'), function (b) {
      b.addEventListener('click', function () {
        settings[key] = b.dataset.value;
        syncSettings();
      });
    });
  }

  /* ============================================================ 日期选择面板 */
  function pickDate(which) {
    var item = state.editing;
    if (!item) return;
    var t = (which === 'end' && item.end != null) ? item.end : item.start;
    var d = split(t);
    dom.datePop.dataset.which = which;
    fillPicker(d);
    var r = (which === 'end' ? dom.edEnd : dom.edStart).getBoundingClientRect();
    dom.datePop.style.left = Math.round(
      clamp(r.left, EDGE_PAD, Math.max(EDGE_PAD, window.innerWidth - 268 - EDGE_PAD))) + 'px';
    dom.datePop.style.top = Math.round(
      clamp(r.bottom + 6, EDGE_PAD, Math.max(EDGE_PAD, window.innerHeight - 250))) + 'px';
    showPanel(dom.datePop);
  }

  function fillPicker(d) {
    var cols = [
      { id: 'dpYear', values: range(d.year - 60, d.year + 60), active: d.year, unit: '年', key: 'year' },
      { id: 'dpMonth', values: range(1, MONTHS), active: d.month, unit: '月', key: 'month' },
      { id: 'dpDay', values: range(1, DAYS), active: d.day, unit: '日', key: 'day' }
    ];
    cols.forEach(function (c) {
      var box = $(c.id).querySelector('.dp-scroll');
      box.innerHTML = '';
      c.values.forEach(function (v) {
        var b = el('button', 'dp-item' + (v === c.active ? ' is-active' : ''));
        b.type = 'button';
        b.textContent = v + ' ' + c.unit;
        b.addEventListener('click', function () { setDatePart(c.key, v); });
        box.appendChild(b);
      });
      var act = box.querySelector('.is-active');
      if (act) $(c.id).scrollTop = act.offsetTop - 90;
    });
  }

  function setDatePart(key, value) {
    var item = state.editing;
    if (!item) return;
    var which = dom.datePop.dataset.which;
    var cur = split(which === 'end' && item.end != null ? item.end : item.start);
    var val = { year: cur.year, month: cur.month, day: cur.day };
    val[key] = value;
    var t = join(val.year, val.month, val.day);
    if (which === 'end') item.end = Math.max(t, item.start + 1 / MONTHS);
    else {
      var span = (item.end != null ? item.end : item.start) - item.start;
      item.start = t;
      if (item.kind === 'era') item.end = t + Math.max(span, 1 / MONTHS);
    }
    render();
    syncEditor();
    commitEditor(true);
  }

  function range(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) out.push(i);
    return out;
  }

  /* ================================================================ 启动 */
  function cacheDom() {
    ['viewport', 'bgGrid', 'axisSvg', 'erasLayer', 'eventsLayer', 'pointMarker', 'pmTip',
     'pmPlus', 'eraMarker', 'emPreview', 'emTip', 'dragTip', 'zoomStack', 'zoomIn', 'zoomOut',
     'zoomFit', 'toolbar', 'helpBtn', 'toast', 'toastText', 'editor', 'edCover', 'edCoverBtn',
     'edTitle', 'edDelete', 'edStart', 'edEnd', 'edStartText', 'edEndText', 'edDesc',
     'edCards', 'edCardsText', 'edCardsIcon', 'palette', 'settings', 'stBody',
     'stRangeStart', 'stRangeEnd', 'stRangeStartText', 'stRangeEndText', 'stPerspective',
     'stPrecision', 'stOrigin', 'stCustom', 'stSample', 'stFit', 'stHours', 'stMonthChip',
     'stSatellites', 'stAddSatellite', 'stCancel', 'stApply', 'datePop', 'hintCard',
     'marquee', 'selBar', 'selCount', 'selCopy', 'selDelete', 'selClose',
     'bootStrip', 'emptyState', 'emptyTitle', 'emptySub', 'emptyNewEvent', 'emptyNewEra',
     'coach', 'coachClose', 'saveChip', 'saveChipText', 'scrim', 'helpPanel', 'helpClose'
     ].forEach(function (id) {
      dom[id] = $(id);
    });
  }

  /* ============================================================== 整页壳 */
  /* 顶层整页（html.tl-shell）的顶栏 / 侧栏 / 右栏都是模板里的静态节点，
     这里只把壳里的按钮接到已有能力上，并在每次渲染后把状态回写进壳。
     iframe 态（html.tl-embed）不做任何事，只把保存提示搬回画布左下角。 */
  var SHELL_ZOOM_BASE = 60;      // 视野跨度 60 年记为 100%（脚本默认视野）
  var shellBound = false;
  var shellEraSig = '';

  function isShell() {
    return document.documentElement.classList.contains('tl-shell');
  }

  function shellNode(id) { return document.getElementById(id); }

  function shellPct() {
    var span = viewSpan();
    if (!isFinite(span) || span <= 0) return 100;
    return Math.max(1, Math.round(SHELL_ZOOM_BASE / span * 100));
  }

  function shellMarkView(view) {
    ['tlxTabs', 'tlxViews'].forEach(function (id) {
      var root = shellNode(id);
      if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (b) {
        b.classList.toggle('is-active', b.dataset.view === view);
      });
    });
  }

  function shellSetView(view) {
    if (!view) return;
    shellMarkView(view);
    if (view === 'canvas') {
      if (listState.open) toggleListView();
      return;
    }
    if (view === 'list') {
      if (!listState.open) toggleListView();
      return;
    }
    if (view === 'calendar') openSettings();
  }

  /** 视野居中到某条记录并打开编辑卡片；zoomIn 时顺手把视野收窄一些 */
  function shellFocusItem(item, zoomIn) {
    if (!item) return;
    var span = viewSpan();
    if (zoomIn) {
      var own = item.kind === 'era' && item.end != null ? Math.abs(item.end - item.start) : 0;
      span = Math.min(span, Math.max(own * 2.4, SHELL_ZOOM_BASE / 8));
    }
    var start = item.start;
    var end = item.end != null ? item.end : item.start;
    var center = (start + end) / 2;
    state.selectedId = item.id;
    applyView(center - span / 2, center + span / 2, true);
    openEditor(item);
  }

  function shellSearch(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return;
    var hit = null;
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if ((it.title || '').toLowerCase().indexOf(q) >= 0) { hit = it; break; }
    }
    if (!hit) { toast('没有找到「' + q + '」'); return; }
    shellFocusItem(hit, true);
  }

  function shellEraButton(id, title, theme) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = id;
    if (theme) b.className = 't-' + theme;
    var dot = document.createElement('span');
    dot.className = 'tlx-dot';
    dot.setAttribute('aria-hidden', 'true');
    b.appendChild(dot);
    b.appendChild(document.createTextNode(title));
    return b;
  }

  function syncShellEras() {
    var list = shellNode('tlxEraList');
    if (!list) return;
    var eras = state.items.filter(function (it) { return it.kind === 'era'; });
    var sig = eras.map(function (it) {
      return it.id + ':' + (it.title || '') + ':' + themeOf(it);
    }).join('|');
    if (sig !== shellEraSig) {
      shellEraSig = sig;
      list.innerHTML = '';
      list.appendChild(shellEraButton('', '全部纪元', ''));
      eras.forEach(function (it) {
        list.appendChild(shellEraButton(it.id, it.title || '未命名', themeOf(it)));
      });
    }
    var active = state.selectedId == null ? '' : String(state.selectedId);
    Array.prototype.forEach.call(list.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', b.dataset.id === active);
    });
  }

  /** 每次 render 之后同步壳内的计数、缩放、精度、选中卡与纪元列表 */
  function syncShell() {
    if (!shellBound || !isShell()) return;

    var evs = 0, eras = 0;
    state.items.forEach(function (it) { if (it.kind === 'era') eras++; else evs++; });
    var count = shellNode('tlxCount');
    if (count) count.textContent = evs + ' 个时间点 · ' + eras + ' 个纪元';

    var pct = shellPct();
    var zoomVal = shellNode('tlxZoomVal');
    if (zoomVal) zoomVal.textContent = pct + '%';
    var zoomFoot = shellNode('tlxZoomFoot');
    if (zoomFoot) zoomFoot.textContent = '缩放 ' + pct + '%';

    var precision = shellNode('tlxPrecision');
    if (precision) {
      precision.textContent = '精度：' +
        (settings.precision === 'year' ? '年' : settings.precision === 'day' ? '日' : '月');
    }

    var item = state.selectedId != null ? byId(state.selectedId) : null;
    var card = shellNode('tlxSelCard');
    var empty = shellNode('tlxDetailEmpty');
    if (card && empty) {
      if (item) {
        card.hidden = false;
        empty.hidden = true;
        shellNode('tlxSelTitle').textContent = item.title || '未命名';
        shellNode('tlxSelMeta').textContent = item.kind === 'era'
          ? fmtRange(item.start, item.end != null ? item.end : item.start)
          : fmtFull(item.start);
        shellNode('tlxSelKind').textContent = item.kind === 'era' ? '纪元' : '时间点';
      } else {
        card.hidden = true;
        empty.hidden = false;
      }
    }

    syncShellEras();
  }

  function bindShell() {
    if (!isShell()) {
      // iframe 态顶栏整体隐藏，保存提示要搬回画布左下角才有地方显示
      if (dom.saveChip && dom.saveChip.parentNode !== dom.viewport) {
        dom.viewport.appendChild(dom.saveChip);
      }
      return;
    }
    if (shellBound) return;
    shellBound = true;

    // 只读整页（发布站点把这一页当画布打开）：顶栏的新建 / 保存 / 日历设置都收起来
    if (READONLY) {
      ['tlxNewEvent', 'tlxSave', 'tlxCalendarBtn', 'tlxPrecision'].forEach(function (id) {
        var node = shellNode(id);
        if (node) node.hidden = true;
      });
    }

    var newNode = shellNode('tlxNewEvent');
    if (newNode) newNode.addEventListener('click', function () { createEventAt(centerTime()); });

    var panLeft = shellNode('tlxPanLeft');
    if (panLeft) panLeft.addEventListener('click', function () { panBy(-0.5); });
    var panRight = shellNode('tlxPanRight');
    if (panRight) panRight.addEventListener('click', function () { panBy(0.5); });

    ['tlxTabs', 'tlxViews'].forEach(function (id) {
      var root = shellNode(id);
      if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (b) {
        b.addEventListener('click', function () { shellSetView(b.dataset.view); });
      });
    });

    var calBtn = shellNode('tlxCalendarBtn');
    if (calBtn) calBtn.addEventListener('click', function () { shellSetView('calendar'); openSettings(); });
    var precision = shellNode('tlxPrecision');
    if (precision) precision.addEventListener('click', function () { openSettings(); });

    var save = shellNode('tlxSave');
    if (save) save.addEventListener('click', function () { commitEditor(false); });

    var openRecord = shellNode('tlxOpenRecord');
    if (openRecord) {
      openRecord.addEventListener('click', function () {
        window.open(location.href, '_blank', 'noopener');
      });
    }

    var share = shellNode('tlxShare');
    if (share) {
      share.addEventListener('click', function () {
        var url = location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { toast('链接已复制'); },
            function () { toast(url); });
        } else {
          toast(url);
        }
      });
    }

    var search = shellNode('tlxSearch');
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        shellSearch(search.value);
      });
    }

    var eraList = shellNode('tlxEraList');
    if (eraList) {
      eraList.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b || !eraList.contains(b)) return;
        if (!b.dataset.id) {
          state.selectedId = null;
          render();
          fitToContent(true);
          return;
        }
        var item = byId(b.dataset.id);
        if (item) shellFocusItem(item, true);
      });
    }

    syncShell();
  }

  /* ============================================================== 空状态 */
  function syncEmptyState() {
    var isEmpty = state.items.length === 0 && !state.loadFailed;
    if (isEmpty) {
      dom.emptyTitle.textContent = '这条时间轴还是空的';
      dom.emptySub.innerHTML = READONLY
        ? '这里还没有内容。'
        : '把指针移到中间的轴线上，会浮出圆形 <b>+</b>；点一下就在那一刻新建时间点。';
      dom.emptyNewEvent.hidden = READONLY;
      dom.emptyNewEra.hidden = READONLY;
      showPanel(dom.emptyState);
    } else {
      hidePanel(dom.emptyState);
    }
  }

  /** 新建的默认落点：视野正中（空轴时用它，免得用户先找轴线） */
  function centerTime() {
    return snapTime((state.view.start + state.view.end) / 2);
  }

  /* ========================================================== 首次引导 */
  var COACH_KEY = 'wbt-coach-dismissed';

  function coachSeen() {
    try { return localStorage.getItem(COACH_KEY) === '1'; } catch (e) { return true; }
  }

  function maybeShowCoach() {
    if (coachSeen() || reducedMotion()) return;
    if (!state.items.length) return;        // 空轴由空状态负责引导，别叠两层
    dom.coach.hidden = false;
  }

  function dropCoach() {
    if (dom.coach.hidden) return;
    hidePanel(dom.coach);
    try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {}
  }

  function bind() {
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(function () { render(); syncEditor(); });
    });

    dom.viewport.addEventListener('pointermove', onPointerMoveGlobal);
    dom.viewport.addEventListener('pointerdown', onPointerDown);
    dom.viewport.addEventListener('pointerleave', function () { hideMarkers(); hideHint(); });
    window.addEventListener('pointerup', onPointerUp);
    dom.viewport.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dom.selDelete.addEventListener('click', deleteSelection);
    dom.selCopy.addEventListener('click', duplicateSelection);
    dom.selClose.addEventListener('click', clearSelection);
    window.addEventListener('pointercancel', onPointerUp);

    /* 滚轮 / 触控板：**左右平移时间轴**（用户最常用的手势），
       ⌘/Ctrl + 滚轮（触控板双指捏合）才是缩放。Shift 也照常平移，方便习惯旧手势的人。 */
    dom.viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      cancelViewTween();
      dropCoach();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.pow(1.0015, -e.deltaY), pointerPos(e).x, false);
        return;
      }
      var dy = ((e.deltaY || 0) + (e.deltaX || 0)) / pxPerYear();
      state.view.start += dy;
      state.view.end += dy;
      render();
      persistView();
    }, { passive: false });

    dom.pmPlus.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      dropCoach();
      createEventAt(Number(dom.pointMarker.dataset.time));
    });

    dom.zoomIn.addEventListener('click', function () { zoomAt(1.25, state.width / 2, true); });
    dom.zoomOut.addEventListener('click', function () { zoomAt(1 / 1.25, state.width / 2, true); });
    dom.zoomFit.addEventListener('click', function () { fitToContent(true); });

    Array.prototype.forEach.call(dom.toolbar.querySelectorAll('.tool-btn'), function (b) {
      b.addEventListener('click', function () {
        var tool = b.dataset.tool;
        if (tool === 'copy') { duplicateSelected(); return; }
        if (tool === 'calendar') { openSettings(); return; }
        // 列表 / 标记：列表视图是右侧的可搜索清单，标记是"重点事件"，
        // 两颗按钮配合使用（标记那颗会打开列表并只筛标记）。
        if (tool === 'list') { toggleListView(); return; }
        if (tool === 'flag') { toggleListView(true); return; }
        Array.prototype.forEach.call(dom.toolbar.querySelectorAll('.tool-btn'), function (o) {
          o.classList.toggle('is-active', o === b);
        });
        state.tool = tool;
        dom.viewport.classList.toggle('tool-hand', tool === 'hand');
      });
    });

    dom.edTitle.addEventListener('input', function () {
      if (!state.editing) return;
      state.editing.title = dom.edTitle.textContent;
      render();
      scheduleCommit();
    });
    dom.edDesc.addEventListener('input', function () {
      if (!state.editing) return;
      state.editing.desc = dom.edDesc.textContent;
      scheduleCommit();
    });
    dom.edTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); dom.edTitle.blur(); }
    });
    dom.edTitle.addEventListener('blur', function () { commitEditor(true); });
    dom.edDesc.addEventListener('blur', function () { commitEditor(true); });
    dom.edDelete.addEventListener('click', deleteEditing);
    dom.edCoverBtn.addEventListener('click', function () {
      var item = state.editing;
      if (!item) return;
      if (item.kind !== 'era') { toast('时间点暂无封面'); return; }
      if (dom.palette.hidden) openPalette(); else hidePanel(dom.palette);
    });
    Array.prototype.forEach.call(dom.palette.querySelectorAll('.palette-swatch'), function (b) {
      b.addEventListener('click', function () {
        var item = state.editing;
        if (!item) return;
        item.theme = b.dataset.theme;
        dom.editor.className = 'editor t-' + item.theme +
          (dom.editor.classList.contains('is-in') ? ' is-in' : '');
        applyCover(item);
        openPalette();
        render();
        commitEditor(true);
      });
    });
    dom.edStart.addEventListener('click', function () { pickDate('start'); });
    dom.edEnd.addEventListener('click', function () { pickDate('end'); });
    dom.edCards.addEventListener('click', function () { toast('卡片功能待接入'); });

    bindSettings();
    dom.helpBtn.addEventListener('click', toggleHelp);
    dom.helpClose.addEventListener('click', closeHelp);
    dom.scrim.addEventListener('click', closeHelp);
    dom.coachClose.addEventListener('click', dropCoach);

    dom.emptyNewEvent.addEventListener('click', function () {
      hidePanel(dom.emptyState);
      createEventAt(centerTime());
    });
    dom.emptyNewEra.addEventListener('click', function () {
      if (state.loadFailed) { location.reload(); return; }
      hidePanel(dom.emptyState);
      createEraAt(centerTime());
    });

    document.addEventListener('keydown', onKeyDown);

    document.addEventListener('pointerdown', function (e) {
      var suppress = state.suppressDocClose;
      state.suppressDocClose = false;
      if (!dom.editor.hidden && !suppress && !e.target.closest('.editor') && !e.target.closest('.date-pop') &&
          !e.target.closest('.ev') && !e.target.closest('.era') &&
          !e.target.closest('.pm-plus')) {
        closeEditor();
      }
      if (!dom.settings.hidden && !e.target.closest('.settings') && !e.target.closest('[data-tool="calendar"]')) {
        closeSettings();
      }
      if (!dom.datePop.hidden && !e.target.closest('.date-pop') && !e.target.closest('.ed-date')) {
        hidePanel(dom.datePop);
      }
      if (!dom.palette.hidden && !e.target.closest('.palette') && !e.target.closest('.ed-cover')) {
        hidePanel(dom.palette);
      }
    });
  }

  /* ============================================================ 快捷键 */
  function inEditable() {
    var a = document.activeElement;
    return !!a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  function setTool(tool) {
    var btn = dom.toolbar.querySelector('[data-tool="' + tool + '"]');
    if (!btn) return;
    state.tool = tool;
    dom.viewport.classList.toggle('tool-hand', tool === 'hand');
    Array.prototype.forEach.call(dom.toolbar.querySelectorAll('.tool-btn'), function (o) {
      o.classList.toggle('is-active', o === btn);
    });
  }

  function panBy(fraction) {
    var d = viewSpan() * fraction;
    applyView(state.view.start + d, state.view.end + d, true);
  }

  function onKeyDown(e) {
    var mod = e.metaKey || e.ctrlKey;

    // ⌘Z 撤销：即使焦点在编辑卡片里也让它生效（输入框自己的撤销交给浏览器）
    if (mod && (e.key === 'z' || e.key === 'Z') && !inEditable()) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelected();
      return;
    }

    if (e.key === 'Escape') {
      if (cancelDrag()) return;
      if (!dom.helpPanel.hidden) { closeHelp(); return; }
      if (!dom.datePop.hidden) { hidePanel(dom.datePop); return; }
      if (!dom.editor.hidden) { closeEditor(); return; }
      if (!dom.settings.hidden) { closeSettings(); return; }
      if (!dom.palette.hidden) { hidePanel(dom.palette); return; }
      if (state.selection.length) { clearSelection(); return; }
      return;
    }

    if (inEditable()) return;

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25, state.width / 2, true); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.25, state.width / 2, true); return; }
    if (e.key === 'f' || e.key === 'F' || e.key === '0') { e.preventDefault(); fitToContent(true); return; }
    if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
    if (e.key === 'h' || e.key === 'H') { setTool('hand'); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); panBy(e.shiftKey ? -0.35 : -0.12); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); panBy(e.shiftKey ? 0.35 : 0.12); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection.length) {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId && !dom.editor.hidden) {
      var item = byId(state.selectedId);
      if (item) { e.preventDefault(); deleteEditing(); }
    }
  }

  function load() {
    cacheDom();
    bind();
    bindShell();

    // 开屏编排：背景、轴线、工具条各自进场；数据没到之前先在轴线上走一道微光
    state.booting = true;
    if (!reducedMotion()) dom.viewport.classList.add('is-booting');
    dom.viewport.classList.add('is-loading');

    state.width = dom.viewport.clientWidth;
    state.height = dom.viewport.clientHeight;

    api.get().then(function (data) {
      state.items = (data.items || []).map(function (it) {
        return {
          id: it.id,
          kind: it.kind === 'era' ? 'era' : 'event',
          title: it.title || '',
          start: Number(it.start) || 0,
          end: it.end != null ? Number(it.end) : (Number(it.start) || 0),
          desc: it.desc || '',
          row: it.row || 0,
          theme: it.theme || '',
          cover: it.cover || '',
          cards: it.cards || []
        };
      });
      var v = data.view || {};
      // 数据到达时若有补间还在跑，它会继续把视野写回旧值，先停掉
      cancelViewTween();
      if (isFinite(v.start) && isFinite(v.end) && Number(v.end) > Number(v.start)) {
        state.view = { start: Number(v.start), end: Number(v.end) };
        render();
      } else {
        fitToContent(false);
      }
      endBoot();
      state.loaded = true;
      syncEmptyState();
      maybeShowCoach();
    }).catch(function () {
      state.loadFailed = true;
      endBoot();
      state.view = { start: -20, end: 40 };
      render();
      dom.emptyTitle.textContent = '数据没能加载出来';
      dom.emptySub.textContent = '接口没有回应。确认服务还在跑，然后再试一次。';
      dom.emptyNewEvent.hidden = true;
      dom.emptyNewEra.hidden = false;
      dom.emptyNewEra.textContent = '重新加载';
      showPanel(dom.emptyState);
      toast('数据加载失败');
    });
  }

  /** 开屏结束：摘掉 is-booting / is-loading，之后的渲染就都是常态了 */
  function endBoot() {
    dom.viewport.classList.remove('is-loading');
    if (reducedMotion()) { state.booting = false; return; }
    setTimeout(function () {
      dom.viewport.classList.remove('is-booting');
      state.booting = false;
    }, 1150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
