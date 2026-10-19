/* ==========================================================================
   关系树（/relationship）
   --------------------------------------------------------------------------
   这是「关系树」页的前端逻辑：把人物之间的关系画成一张能缩放、拖动的卡片图，
   并支持在图上直接新建人物、拉线、改关系。

   页面是一条三屏流程：选模版 → 看模版关系 → 进画布编辑。

   画布上有两条铁律，其余都好商量：
   1. **人物卡片的边框严格贴网格**。卡宽高都是整数格（6 × 3），落点也永远吸附到
      网格整数倍，所以边框天然落在网格线上——不会出现"差两像素"的毛边。
   2. **关系线不贴网格**。线怎么走由几何算（正交 + 圆角），只在需要时经过中点，
      不为了对齐网格把线拗成奇怪的形状。

   关系连线的两种手势都会落到同一个"关系菜单"上：
   点加号 = 在那个方向新建一个人；按住加号拖到另一张卡 = 连到那个人。
   ========================================================================== */
(function () {
  'use strict';

  var app = document.getElementById('rtApp');
  if (!app) return;

  var API = app.dataset.apiBase || '/api/world';
  var PAGE = app.dataset.pageBase || '/w';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------- 状态 */
  /* 只读（游客 / 只读成员 / 发布站点里的嵌入）：写入口整个不发生作用。
     不是"点了再提示"，是干脆不画菜单、不绑定拖拽——对着空气点一下什么都不该发生。 */
  var READONLY = app.dataset.readonly === '1';
  var EMBED = app.dataset.embed === '1';

  var S = {
    grid: { grid: 28, card_cols: 6, card_rows: 3, col_step: 7, row_step: 5 },
    templates: [],
    trees: [],
    pickTemplate: 'family',
    draftRelations: [],       // 模版自带的关系清单（还没落库）
    docId: parseInt(app.dataset.doc, 10) || 0,
    eraId: parseInt(app.dataset.era, 10) || 0,   // ?era=<id>：只过滤，不改数据
    focusCardId: parseInt(app.dataset.focus, 10) || 0,  // ?focus=<card>：只高亮，不跳转
    eras: [],                 // 世界里的时代区间（载入关系树时一起回来）
    eraHidden: {},            // {时代 id: [看不见的 card(document) id]}，服务端算好
    eraEdges: {},             // {时代 id: [该时代有效的边 id]}，服务端算好
    pendingDoc: 0,            // 已经建好、但还没选模版的那棵树（面板里选完就地配置它）
    doc: null,
    variant: null,
    nodes: [],
    edges: [],
    relations: [],
    labels: {},
    view: { x: 0, y: 0, z: 1 },
    selected: null,
    link: null,               // {from: nodeId, side: 'n', to: nodeId|null}
    ctx: null,                // {x, y} 右键落点（画布坐标，已吸附）
    popAnchor: null,
    dirty: Object.create(null),
    saveTimer: null
  };

  function grid() { return S.grid.grid; }
  function cardW() { return S.grid.card_cols * S.grid.grid; }
  function cardH() { return S.grid.card_rows * S.grid.grid; }
  function snap(v) { return Math.round(v / grid()) * grid(); }
  /* 世代 = "第几行卡片"。工作区里那个简版渲染器按 generation 排 y，
     喂它格坐标（0/12/24…）会把整棵树拉成竖着的一条线。 */
  function rowIndex(y) { return Math.round(y / (S.grid.row_step * grid())); }
  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------------- 请求 */
  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    return fetch(path, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var message = (data && data.error) || ('请求失败（' + response.status + '）');
          throw new Error(message);
        }
        return data;
      });
    });
  }

  function toast(message, ms) {
    var box = $('rtToast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.hidden = true; }, ms || 2200);
  }

  /** 把裸错误翻成人话：网络层的 "Failed to fetch" 不原样丢给用户。 */
  function friendly(err, fallback) {
    var raw = (err && err.message) || '';
    if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
      return '连不上服务器——检查一下网络，然后刷新这一页';
    }
    return raw || fallback;
  }

  function saveState(text, mode) {
    var el = $('rtSaveState');
    el.textContent = text;
    el.className = 'rt-save' + (mode ? ' is-' + mode : '');
  }

  /* ---------------------------------------------------------------- 输入浮层 */
  /* window.prompt 在内嵌 WebView（预览面板的 Electron）里直接抛
     "prompt() is not supported"，改名 / 命名这类动作整条失效。改用自建浮层，
     观感与工作区的卡片选择器一致（minimal.css 两页都加载了 .picker 这套样式）。
     askText 返回 Promise<string|null>；askChoice 返回选中项或 null。 */
  function overlayBox() {
    var overlay = document.createElement('div');
    overlay.className = 'picker';
    var box = document.createElement('div');
    box.className = 'picker-box';
    overlay.appendChild(box);
    return { overlay: overlay, box: box };
  }

  function askText(options) {
    options = options || {};
    return new Promise(function (resolve) {
      var built = overlayBox();
      var head = document.createElement('div');
      head.className = 'picker-head';
      head.innerHTML = iconHtml('pen-line', 15);
      var input = document.createElement(options.multiline ? 'textarea' : 'input');
      if (options.multiline) { input.rows = 5; input.style.resize = 'vertical'; }
      else { input.type = 'text'; }
      input.value = options.value == null ? '' : options.value;
      input.placeholder = options.label || '';
      head.appendChild(input);
      built.box.appendChild(head);

      var foot = document.createElement('div');
      foot.className = 'picker-foot';
      var cancel = document.createElement('button');
      cancel.type = 'button'; cancel.className = 'mini-btn'; cancel.textContent = '取消';
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'mini-btn is-primary';
      ok.textContent = options.okLabel || '确定';
      foot.appendChild(cancel); foot.appendChild(ok);
      built.box.appendChild(foot);
      document.body.appendChild(built.overlay);

      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        built.overlay.remove();
        resolve(value);
      }
      cancel.addEventListener('click', function () { finish(null); });
      ok.addEventListener('click', function () { finish(input.value); });
      built.overlay.addEventListener('mousedown', function (event) {
        if (event.target === built.overlay) finish(null);
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        else if (event.key === 'Enter' && (!options.multiline || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish(input.value);
        }
      });
      setTimeout(function () { try { input.focus(); input.select(); } catch (err) { /* 忽略 */ } }, 30);
    });
  }

  function askChoice(options) {
    options = options || {};
    var items = options.options || [];
    return new Promise(function (resolve) {
      var built = overlayBox();
      var head = document.createElement('div');
      head.className = 'picker-head';
      var title = document.createElement('b');
      title.textContent = options.title || '选择';
      head.appendChild(title);
      built.box.appendChild(head);
      var list = document.createElement('div');
      list.className = 'picker-list';
      built.box.appendChild(list);
      var active = Math.max(0, Math.min(options.index || 0, items.length - 1));

      function finish(value) {
        built.overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      }
      function render() {
        list.innerHTML = '';
        items.forEach(function (item, i) {
          var row = document.createElement('div');
          row.className = 'picker-row' + (i === active ? ' is-active' : '');
          var label = document.createElement('b');
          label.textContent = item.label;
          row.appendChild(label);
          row.addEventListener('mousedown', function (event) { event.preventDefault(); finish(item); });
          list.appendChild(row);
        });
      }
      function onKey(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          active = Math.max(0, Math.min(active + (event.key === 'ArrowDown' ? 1 : -1), items.length - 1));
          render();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (items[active]) finish(items[active]);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      }
      document.addEventListener('keydown', onKey, true);
      built.overlay.addEventListener('mousedown', function (event) {
        if (event.target === built.overlay) finish(null);
      });
      render();
      document.body.appendChild(built.overlay);
    });
  }

  /* ================================================================== 图标 */
  /* 图标一律来自设计系统那一套（static/icons.js，Lucide 线条 / 24×24 / stroke 2 /
     currentColor）。这里只负责把"关系种类"和"模版"映射到图标名——
     自己再画一套的话，粗细和圆角迟早跟程序里其它地方对不上。 */
  var RELATION_ICONS = {
    parent: 'user-plus',
    child: 'baby',
    spouse: 'heart',
    ex: 'heart-crack',
    sibling: 'users',
    half_sibling: 'users',
    adoptive: 'heart-handshake',
    step: 'shuffle',
    custom: 'plus'
  };

  function relationIcon(kind) {
    if (RELATION_ICONS[kind]) return RELATION_ICONS[kind];
    return String(kind).indexOf('custom') === 0 ? 'plus' : 'network';
  }

  function icon(kind) {
    return iconHtml(relationIcon(kind), 17);
  }

  /* 模版的图标名由后端给（house / building / shield / crown / plus），
     这里只做一次存在性兜底——查不到就退成加号，绝不让页面出现空白方块。 */
  function templateIcon(name) {
    return iconHtml(ICONS[name] ? name : 'plus', 19);
  }

  /* 模板里的 <span data-icon="..."> 统一在启动时填成真图标，省得 HTML 里抄一串 path */
  function hydrateIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon]'), function (host) {
      if (host.firstElementChild) return;
      host.innerHTML = iconHtml(host.dataset.icon, parseInt(host.dataset.iconSize, 10) || 16);
    });
  }

  /* ========================================================= 几何：正交走线 */
  /* 卡片四边的锚点：关系线只从这四个点出发 / 落到这四个点。 */
  function anchors(node) {
    var w = cardW(), h = cardH();
    return {
      n: { x: node.x + w / 2, y: node.y },
      s: { x: node.x + w / 2, y: node.y + h },
      w: { x: node.x, y: node.y + h / 2 },
      e: { x: node.x + w, y: node.y + h / 2 }
    };
  }

  var TOL = 10;

  /* 给两点之间算一条正交折线。同排直连、同列直连，其余走"横-竖-横"或"竖-横-竖"。
     这里刻意**不对齐网格**：线只服从几何，卡片才贴网格。 */
  function routePoints(a, b) {
    var A = anchors(a), B = anchors(b);
    var acx = a.x + cardW() / 2, acy = a.y + cardH() / 2;
    var bcx = b.x + cardW() / 2, bcy = b.y + cardH() / 2;
    var dx = bcx - acx, dy = bcy - acy;

    if (Math.abs(dy) < TOL) {
      return dx >= 0 ? [A.e, B.w] : [A.w, B.e];
    }
    if (Math.abs(dx) < TOL) {
      return dy >= 0 ? [A.s, B.n] : [A.n, B.s];
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      var east = dx > 0;
      var start = east ? A.e : A.w;
      var end = east ? B.w : B.e;
      var midX = (start.x + end.x) / 2;
      return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    }
    var south = dy > 0;
    var top = south ? A.s : A.n;
    var bottom = south ? B.n : B.s;
    var midY = (top.y + bottom.y) / 2;
    return [top, { x: top.x, y: midY }, { x: bottom.x, y: midY }, bottom];
  }

  /* 折线 → 带圆角的 path。顺手去掉重复点和共线的中间点。 */
  function pathFrom(points, radius) {
    var pts = [];
    points.forEach(function (point) {
      var last = pts[pts.length - 1];
      if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) pts.push(point);
    });
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      return 'M ' + pts[0].x + ' ' + pts[0].y + ' L ' + pts[1].x + ' ' + pts[1].y;
    }
    var r = radius == null ? 12 : radius;
    var d = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length - 1; i++) {
      var prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      var l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      var l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      if (rr < 1) { d += ' L ' + cur.x + ' ' + cur.y; continue; }
      var p1 = { x: cur.x + (prev.x - cur.x) / l1 * rr, y: cur.y + (prev.y - cur.y) / l1 * rr };
      var p2 = { x: cur.x + (next.x - cur.x) / l2 * rr, y: cur.y + (next.y - cur.y) / l2 * rr };
      d += ' L ' + p1.x + ' ' + p1.y + ' Q ' + cur.x + ' ' + cur.y + ' ' + p2.x + ' ' + p2.y;
    }
    var last = pts[pts.length - 1];
    d += ' L ' + last.x + ' ' + last.y;
    return d;
  }

  /* ================================================================= 首屏 */
  function boot() {
    hydrateIcons(document);
    // 触屏捏合缩放：experience.js 在本文件**之后**加载，
    // 所以 Opus 还没就绪时要等 load 再挂（否则这一行是空操作）。
    if (window.Opus && window.Opus.pinch) wirePinch();
    else window.addEventListener('load', wirePinch, { once: true });
    // 宿主/链接指名要的那篇文档打不开（被删了、在回收站里、不是关系树）：
    // 先明说，别掉回模版选择
    if (S.docId && app.dataset.docMissing === '1') {
      showLoadError({ message: '这篇关系树不在了——它可能已经被删掉，或者躺在回收站里。' });
      return;
    }
    Promise.all([
      api(API + '/relationship/templates'),
      api(API + '/relationship/trees')
    ]).then(function (results) {
      S.templates = results[0].templates || [];
      if (results[0].grid) S.grid = results[0].grid;
      S.trees = results[1].trees || [];
      if (S.docId) {
        // 直接进编辑区：模版列（在另一屏）的骨架先撤掉，等真的回到选模版那一屏再画。
        // 不撤的话，用户点「返回」会看到一片永远在闪的占位。
        dropSkeletons();
        openEditor(S.docId);
        return;
      }
      renderPicker();
      showScreen('picker');
    }).catch(function (err) {
      console.error(err);
      toast(friendly(err, '模版没载入出来，刷新这一页再试'), 4000);
    });
  }

  function showScreen(name) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-screen]'), function (el) {
      el.hidden = el.dataset.screen !== name;
    });
    // 回到选模版那一屏：如果骨架还在（boot 直接进了编辑区），这时候补画
    if (name === 'picker' && S.templates.length && document.querySelector('[data-skeleton]')) {
      renderPicker();
    }
  }

  /** 撤掉所有骨架占位（替换成真内容时由各自的渲染函数负责，这里只管"不画了"）。 */
  function dropSkeletons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-skeleton]'), function (node) {
      node.remove();
    });
  }

  /* --------------------------------------------------- 模版列表      */
  function renderPicker() {
    var host = $('rtTemplateList');
    host.innerHTML = '';
    S.templates.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rt-template-item' + (item.id === S.pickTemplate ? ' is-active' : '');
      button.dataset.template = item.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(item.id === S.pickTemplate));
      button.innerHTML =
        '<span class="rt-template-icon">' + templateIcon(item.icon) + '</span>' +
        '<span class="rt-template-text"><b>' + esc(item.name) + '</b><span>' + esc(item.tagline) + '</span></span>';
      button.addEventListener('click', function () {
        S.pickTemplate = item.id;
        renderPicker();
        renderPreview($('rtPickerCanvas'), item.id);
      });
      host.appendChild(button);
    });
    renderPreview($('rtPickerCanvas'), S.pickTemplate);
    renderExisting();
  }

  function renderExisting() {
    var host = $('rtExisting');
    // 嵌在工作区面板里时不列"已有关系树"：左边那条侧栏就是文档树，重复了
    if (EMBED) { host.innerHTML = ''; $('rtExisting').parentNode.hidden = true; return; }
    host.innerHTML = '';
    if (!S.trees.length) {
      host.innerHTML = '<p class="rt-existing-empty">还没有关系树</p>';
      return;
    }
    S.trees.forEach(function (tree) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'rt-existing-row';
      row.innerHTML = '<b>' + esc(tree.name) + '</b><span>' +
        tree.people + ' 人 · ' + tree.kind_label + '</span>';
      row.addEventListener('click', function () { location.href = PAGE + '/relation?doc=' + tree.id; });
      host.appendChild(row);
    });
  }

  /* ------------------------------------------- 模版自带的关系清单      */
  function openTemplateScreen(templateId) {
    var item = S.templates.filter(function (t) { return t.id === templateId; })[0] || S.templates[0];
    if (!item) return;
    S.pickTemplate = item.id;
    // 面板里正在配的是哪一篇，标题上写清楚
    $('rtSideTitle').textContent = S.pendingDoc && S.doc ? S.doc.name : '关系树';
    S.draftRelations = (item.relations || []).map(function (relation) {
      return { kind: relation.kind, label: relation.label, hint: relation.hint || '', style: relation.style || '', enabled: true };
    });
    $('rtTemplateCaption').textContent = item.name + ' 关系';
    $('rtCreate').textContent = S.pendingDoc ? '用这个模版' : '创建关系树';
    $('rtWithDemo').parentNode.style.display = item.id === 'blank' ? 'none' : '';
    renderRelationList();
    renderPreview($('rtTemplateCanvas'), item.id);
    showScreen('template');
  }

  function renderRelationList() {
    var host = $('rtRelationList');
    host.innerHTML = '';
    if (!S.draftRelations.length) {
      host.innerHTML = '<p class="rt-existing-empty" style="padding:14px 16px">还没有关系，点下面的「添加关系」自己定。</p>';
      return;
    }
    S.draftRelations.forEach(function (relation, index) {
      var row = document.createElement('div');
      row.className = 'rt-relation-row' + (relation.enabled === false ? ' is-off' : '');
      row.innerHTML = icon(relation.kind) + '<b>' + esc(relation.label) + '</b>' +
        '<button type="button" class="rt-relation-btn" data-act="toggle" title="' +
        (relation.enabled === false ? '启用' : '暂时停用（快捷菜单里不再出现）') + '">' +
        iconHtml('minus', 16) + '</button>' +
        '<button type="button" class="rt-relation-btn is-danger" data-act="remove" title="删除这条关系">' +
        iconHtml('x', 16) + '</button>';

      row.querySelector('[data-act="toggle"]').addEventListener('click', function () {
        relation.enabled = relation.enabled === false;
        renderRelationList();
      });
      row.querySelector('[data-act="remove"]').addEventListener('click', function () {
        S.draftRelations.splice(index, 1);
        renderRelationList();
      });
      // 双击改名：模版给的是通用叫法，用户想叫"生父"也正常
      row.querySelector('b').addEventListener('dblclick', function () {
        askText({ label: '这条关系叫什么？', value: relation.label }).then(function (value) {
          if (value === null) return;
          relation.label = value.trim() || relation.label;
          renderRelationList();
        });
      });
      host.appendChild(row);
    });
  }

  $('rtAddRelation').addEventListener('click', function () {
    askText({ label: '新关系的名字（例如：教父、世仇、债主）', value: '' }).then(function (value) {
      if (value === null) return;
      var label = value.trim();
      if (!label) return;
      S.draftRelations.push({
        kind: 'custom_' + Date.now().toString(36),
        label: label, hint: '', style: '', enabled: true
      });
      renderRelationList();
    });
  });

  $('rtBack').addEventListener('click', function () { showScreen('picker'); });
  $('rtContinue').addEventListener('click', function () { openTemplateScreen(S.pickTemplate); });

  $('rtCreate').addEventListener('click', function () {
    var button = $('rtCreate');
    var item = S.templates.filter(function (t) { return t.id === S.pickTemplate; })[0] || {};
    var withDemo = $('rtWithDemo').checked;
    button.disabled = true;

    // 面板里那棵树已经建好了，这一步是"就地配模版"；独立页那一步才是真新建
    if (S.pendingDoc) {
      api(API + '/relationship/trees/' + S.pendingDoc + '/setup', {
        method: 'POST',
        body: { template: S.pickTemplate, relations: S.draftRelations, with_demo: withDemo }
      }).then(function () {
        tellHostDocumentChanged();
        return openEditor(S.pendingDoc);
      }).catch(function (err) {
        button.disabled = false;
        toast(friendly(err, '配置失败'), 4000);
      });
      return;
    }

    api(API + '/relationship/trees', {
      method: 'POST',
      body: {
        template: S.pickTemplate,
        name: item.name ? item.name + '关系树' : '关系树',
        with_demo: withDemo
      }
    }).then(function (data) {
      // 用户在左边改过的关系清单要带过去（改名 / 停用 / 新加 / 删掉）
      return api(API + '/relationship/trees/' + data.document.id + '/relations', {
        method: 'PUT', body: { relations: S.draftRelations }
      }).then(function () { return data; });
    }).then(function (data) {
      location.href = PAGE + '/relation?doc=' + data.document.id;
    }).catch(function (err) {
      button.disabled = false;
      toast(friendly(err, '创建失败'), 4000);
    });
  });

  /* 刚配好模版：告诉宿主"这篇文档变了"，让它刷新侧栏 / 标题 */
  function tellHostDocumentChanged() {
    if (window.parent === window || !S.docId) return;
    window.parent.postMessage({ type: 'ws-doc-changed', id: S.docId }, window.location.origin);
  }

  /* ================================================== 预览：示意小画布 */
  /* 预览和编辑区共用同一套走线算法，所以"看到的"就是"建出来的"。 */
  function renderPreview(host, templateId) {
    var item = S.templates.filter(function (t) { return t.id === templateId; })[0];
    host.innerHTML = '';
    var scale = 1;
    if (!item || !item.demo || !item.demo.nodes.length) {
      var hint = document.createElement('p');
      hint.className = 'rt-empty-hint';
      hint.innerHTML = '空白起步：进去以后在画布上 <b>右键</b> 添加第一个人';
      host.appendChild(hint);
      return;
    }

    var g = S.grid.grid;
    var nodes = item.demo.nodes.map(function (node) {
      return { key: node.key, name: node.name, x: node.col * g, y: node.row * g };
    });
    var byKey = {};
    nodes.forEach(function (node) { byKey[node.key] = node; });

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'rt-edges');
    var layer = document.createElementNS(svgNS, 'g');
    svg.appendChild(layer);

    var wrap = document.createElement('div');
    wrap.className = 'rt-grid';
    wrap.appendChild(svg);

    item.demo.edges.forEach(function (edge) {
      var a = byKey[edge.source], b = byKey[edge.target];
      if (!a || !b) return;
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', pathFrom(routePoints(a, b)));
      path.setAttribute('class', edgeClass(edge));
      layer.appendChild(path);

      if (edge.label) {
        var mid = midpointOf(path);
        var text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', mid.x);
        text.setAttribute('y', mid.y - 6);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'rt-edge-label');
        text.textContent = edge.label;
        layer.appendChild(text);
      }
    });

    nodes.forEach(function (node) {
      var el = document.createElement('div');
      el.className = 'rt-node is-empty';
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      el.innerHTML = '<div class="rt-card"></div><div class="rt-name">' + esc(node.name) + '</div>';
      wrap.appendChild(el);
    });

    host.appendChild(wrap);
    fitTo(host, wrap, nodes);
  }

  function midpointOf(path) {
    try {
      var total = path.getTotalLength();
      return path.getPointAtLength(total / 2);
    } catch (error) {
      return { x: 0, y: 0 };
    }
  }

  /* 把 wrap 缩放平移到 host 里居中显示 */
  function fitTo(host, wrap, nodes) {
    if (!nodes.length) return;
    var minX = Math.min.apply(null, nodes.map(function (n) { return n.x; }));
    var minY = Math.min.apply(null, nodes.map(function (n) { return n.y; }));
    var maxX = Math.max.apply(null, nodes.map(function (n) { return n.x + cardW(); }));
    var maxY = Math.max.apply(null, nodes.map(function (n) { return n.y + cardH(); }));
    var pad = 44;
    var width = maxX - minX + pad * 2;
    var height = maxY - minY + pad * 2;

    // 先挂上去量一次，容器尺寸只有布局后才知道
    requestAnimationFrame(function () {
      var rect = host.getBoundingClientRect();
      if (!rect.width) return;
      var scale = Math.min(rect.width / width, rect.height / height, 1.2);
      var tx = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
      var ty = (rect.height - (maxY - minY) * scale) / 2 - minY * scale;
      wrap.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      wrap.style.transformOrigin = '0 0';
    });
  }

  /* ==================================================== 编辑区：载入与渲染 */
  function openFullUrl(docId) {
    return PAGE + '/relation?doc=' + docId + (S.eraId ? '&era=' + S.eraId : '');
  }

  /* 打开一篇关系树。**没选过模版的空树先给模版选择**——不管是在独立页打开，
     还是在工作区面板里打开，都不该把人直接丢到一片空画布上。 */
  function openEditor(docId) {
    api(API + '/relationship/trees/' + docId).then(function (data) {
      var empty = !(data.variant.nodes || []).length && !(data.variant.edges || []).length;
      if (empty && !data.variant.setup && !READONLY) {
        S.pendingDoc = docId;
        S.docId = docId;
        S.doc = data.document;
        S.grid = data.grid || S.grid;
        $('rtDocName').textContent = S.doc.name;
        $('rtOpenFull').href = openFullUrl(docId);
        renderPicker();
        showScreen('picker');
        return;
      }
      S.pendingDoc = null;
      S.docId = docId;
      S.doc = data.document;
      S.grid = data.grid || S.grid;
      S.variant = data.variant;
      S.nodes = (data.variant.nodes || []).map(normalizeNode);
      S.edges = data.variant.edges || [];
      S.eras = data.eras || [];
      S.eraHidden = data.era_hidden || {};
      S.eraEdges = data.era_edges || {};
      S.relations = (data.variant.relations || []);
      S.labels = data.variant.resolved_labels || {};
      S.relationKinds = data.relation_kinds || [];

      $('rtDocName').textContent = S.doc.name;
      $('rtKindChip').textContent = S.variant.kind_label || '';
      $('rtOpenFull').href = openFullUrl(S.docId);
      if (READONLY) {
        $('rtEmptyHint').innerHTML = '这棵关系树还没有人物';
      }
      showScreen('editor');
      render();
      fit();
      // ?focus= 只在首次载入时用一次，之后的重载不能把用户的选择顶掉
      if (!focusApplied) {
        focusApplied = true;
        focusCard(S.focusCardId);
      }
    }).catch(function (err) {
      // 打不开就明说打不开。以前这里悄悄退回模版选择，看着像"我的树
      // 变成了新建向导"——文档只是进了回收站而已，不该这么演。
      showLoadError(err);
    });
  }

  /* 文档不在（被删 / 进了回收站 / 根本没这个 id）时的那一屏 */
  function showLoadError(err) {
    $('rtErrorText').textContent = friendly(err, '它可能已经被删掉了。');
    showScreen('error');
  }

  $('rtErrorRetry').addEventListener('click', function () {
    if (S.docId) openEditor(S.docId); else showScreen('picker');
  });

  function normalizeNode(node) {
    return {
      id: node.id, x: snap(node.x || 0), y: snap(node.y || 0),
      name: node.name || '', note: node.note || '',
      kind: node.kind || 'person',
      generation: node.generation == null ? 0 : node.generation,
      card: node.card, card_name: node.card_name, card_slug: node.card_slug,
      image: node.image || '', subtitle: node.subtitle || '',
      deceased: !!node.deceased, favourite: !!node.favourite
    };
  }

  function nodeById(id) {
    for (var i = 0; i < S.nodes.length; i++) if (S.nodes[i].id === id) return S.nodes[i];
    return null;
  }

  /* ------------------------------------------------------------ 时代过滤 */
  /* §4.5 的统一口径：显不显示只认服务端算好的结果，前端不再自己比区间——
     否则"开放端到底算到哪一年"会有第二份实现。这里只过滤显示，不改数据。 */
  function nodeHidden(node) {
    if (!S.eraId || !node.card) return false;   // 备注节点不属于任何时代，始终显示
    var hidden = S.eraHidden[String(S.eraId)];
    return !!hidden && hidden.indexOf(node.card) >= 0;
  }

  function visibleNodes() {
    return S.nodes.filter(function (node) { return !nodeHidden(node); });
  }

  function edgeActiveInEra(edge) {
    if (!S.eraId) return true;
    var list = S.eraEdges[String(S.eraId)];
    if (!list) return true;   // 时代还没摆到轴上：不过滤
    return list.indexOf(edge.id) >= 0;
  }

  function visibleEdges() {
    var shown = Object.create(null);
    visibleNodes().forEach(function (node) { shown[node.id] = true; });
    return S.edges.filter(function (edge) {
      return edgeActiveInEra(edge) && shown[edge.source] && shown[edge.target];
    });
  }

  function applyView() {
    var g = $('rtGrid');
    g.style.transform = 'translate(' + S.view.x + 'px,' + S.view.y + 'px) scale(' + S.view.z + ')';
    var wrap = $('rtCanvasWrap');
    wrap.style.backgroundSize = (grid() * S.view.z) + 'px ' + (grid() * S.view.z) + 'px';
    wrap.style.backgroundPosition = S.view.x + 'px ' + S.view.y + 'px';
    // 缩得太小时按层级减负：< 0.6 收起名字与加号，< 0.3 只留轮廓。
    // 只切类、不动布局，所以"适应视野"的坐标与拖动命中区都不受影响。
    wrap.classList.toggle('is-zoom-far', S.view.z < 0.6);
    wrap.classList.toggle('is-zoom-far-out', S.view.z < 0.3);
  }

  function render() {
    renderEdges();
    renderNodes();
    applyView();
    $('rtEmptyHint').hidden = visibleNodes().length > 0;
    renderDetail();
    updateStats();
    applyFilter();
  }

  function labelOf(kind, label) {
    if (label) return label;
    for (var i = 0; i < S.relations.length; i++) {
      if (S.relations[i].kind === kind) return S.relations[i].label || '';
    }
    // 没起名字的自定义关系 = 一条"先连上、以后再命名"的线，不印字
    if (String(kind).indexOf('custom') === 0) return '';
    return S.labels[kind] || '';
  }

  /* 关系线的外观。结构保持安静：一律灰阶，只靠"实/虚 + 粗细"区分，
     颜色留给交互（选中、悬停、正在拖的那条）。 */
  function edgeClass(edge) {
    return 'rt-edge'
      + (edge.kind === 'spouse' ? ' rt-edge--strong' : '')
      + (edge.style === 'dashed' ? ' rt-edge--dashed' : '');
  }

  function renderEdges() {
    var svg = $('rtEdges');
    var layer = svg.querySelector('g') || svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    var ns = 'http://www.w3.org/2000/svg';

    visibleEdges().forEach(function (edge) {
      var a = nodeById(edge.source), b = nodeById(edge.target);
      if (!a || !b) return;
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', pathFrom(routePoints(a, b)));
      path.setAttribute('class', edgeClass(edge));
      path.setAttribute('data-edge', edge.id);
      path.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
      path.addEventListener('click', function (event) {
        event.stopPropagation();
        if (READONLY) return;
        editEdge(edge);
      });
      layer.appendChild(path);

      var text = labelOf(edge.kind, edge.label);
      if (text) {
        var mid = midpointOf(path);
        var node = document.createElementNS(ns, 'text');
        node.setAttribute('x', mid.x);
        node.setAttribute('y', mid.y - 6);
        node.setAttribute('text-anchor', 'middle');
        node.setAttribute('class', 'rt-edge-label');
        node.textContent = text;
        layer.appendChild(node);
      }
    });
  }

  function renderNodes() {
    var host = $('rtNodes');
    host.innerHTML = '';
    visibleNodes().forEach(function (node) { host.appendChild(nodeElement(node)); });
  }

  function initial(name) {
    var text = (name || '').trim();
    if (!text) return '?';
    // 拉丁字母取首字母，中文取头一个字
    var first = text[0];
    return /[a-zA-Z]/.test(first) ? first.toUpperCase() : first;
  }

  /* ------------------------------------------------------ 关系派生（详情栏用） */
  var BLOOD_KINDS = { parent: 1, child: 1, sibling: 1, half_sibling: 1, adoptive: 1, step: 1 };
  var MARRIAGE_KINDS = { spouse: 1, ex: 1 };
  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function edgesOf(id) {
    return visibleEdges().filter(function (edge) { return edge.source === id || edge.target === id; });
  }

  function otherEnd(edge, id) { return edge.source === id ? edge.target : edge.source; }

  /* 边的语义：kind 描述 source 相对 target 的身份（见 static/relationship.js 顶部说明） */
  function childrenOf(id) {
    var out = [];
    visibleEdges().forEach(function (edge) {
      if (edge.kind === 'parent' && edge.source === id) out.push(edge.target);
      else if (edge.kind === 'child' && edge.target === id) out.push(edge.source);
    });
    return out;
  }

  function parentsOf(id) {
    var out = [];
    visibleEdges().forEach(function (edge) {
      if (edge.kind === 'parent' && edge.target === id) out.push(edge.source);
      else if (edge.kind === 'child' && edge.source === id) out.push(edge.target);
    });
    return out;
  }

  function spousesOf(id) {
    return edgesOf(id)
      .filter(function (edge) { return MARRIAGE_KINDS[edge.kind]; })
      .map(function (edge) { return otherEnd(edge, id); });
  }

  function nameOf(id) {
    var node = nodeById(id);
    return node ? (node.name || '未命名') : '未命名';
  }

  function roleOf(node) {
    if (node.kind === 'note') return '备注';
    if (node.favourite) return '主角';
    if (childrenOf(node.id).length) return '家长';
    if (spousesOf(node.id).length) return '配偶';
    if (parentsOf(node.id).length) return '子女';
    return '人物';
  }

  function generationOf(node) {
    var value = node.generation == null ? rowIndex(node.y) : Number(node.generation);
    if (!isFinite(value)) value = 0;
    value = Math.max(0, Math.round(value));
    return { index: value, label: CN_NUM[value] || String(value + 1) };
  }

  /* ------------------------------------------------------ 右侧详情栏 */
  function renderDetail() {
    var host = $('rtNodeDetail');
    if (!host) return;
    var node = S.selected != null ? nodeById(S.selected) : null;
    if (!node) {
      host.innerHTML = '<div class="rt-detail-empty">'
        + '<span data-icon="users" data-icon-size="20" aria-hidden="true"></span>'
        + '<strong>还没有选中人物</strong>'
        + '<p>单击一张卡片，这里会显示它的人物简介与关系；双击可打开人物卡片。</p>'
        + '</div>';
      hydrateIcons(host);
      return;
    }

    var edges = edgesOf(node.id);
    var kids = childrenOf(node.id);
    var parents = parentsOf(node.id);
    var spouses = spousesOf(node.id);
    var generation = generationOf(node);
    var role = roleOf(node);
    var avatar = node.image
      ? '<img src="' + esc(node.image) + '" alt="" />'
      : esc(initial(node.name));
    var subtitle = [role, node.card_name || (S.doc && S.doc.name)].filter(Boolean).join(' · ');

    var html = '<div class="rt-detail-head">'
      + '<span class="rt-detail-avatar" aria-hidden="true">' + avatar + '</span>'
      + '<div class="rt-detail-id">'
      + '<h2>' + esc(node.name || '未命名人物') + '</h2>'
      + '<span class="rt-detail-sub">' + esc(subtitle) + '</span>'
      + '</div>'
      + '<span class="rt-detail-state">已选中</span>'
      + '</div>';

    if (node.kind === 'note') {
      html += '<p class="rt-detail-note">' + esc(node.note || '还没有写内容') + '</p>';
    } else {
      html += '<div class="rt-detail-metrics">'
        + '<article class="rt-metric"><span class="rt-eyebrow">直接关系</span>'
        + '<strong>' + (kids.length + parents.length + spouses.length) + '</strong>'
        + '<span class="rt-meta">子女 ' + kids.length + ' · 配偶 ' + spouses.length + '</span></article>'
        + '<article class="rt-metric"><span class="rt-eyebrow">世代</span>'
        + '<strong>' + esc(generation.label) + '</strong>'
        + '<span class="rt-meta">第 ' + (generation.index + 1) + ' 代</span></article>'
        + '</div>'
        + '<dl class="rt-detail-rows">'
        + '<div><dt>归属卡片</dt><dd>' + esc(node.card_name || (S.doc && S.doc.name) || '未关联') + '</dd></div>'
        + '<div><dt>父母</dt><dd>' + esc(namesOrEmpty(parents)) + '</dd></div>'
        + '<div><dt>子女</dt><dd>' + esc(namesOrEmpty(kids)) + '</dd></div>'
        + '<div><dt>状态</dt><dd>' + (node.deceased ? '已故' : '在世') + '</dd></div>'
        + '</dl>'
        + '<div class="rt-detail-chips">'
        + '<span>' + esc(role) + '</span>'
        + (node.card_name ? '<span>' + esc(node.card_name) + '</span>' : '')
        + '<span>' + (node.deceased ? '已故' : '在世') + '</span>'
        + '</div>';
    }

    var relationChips = edges.map(function (edge) {
      var text = labelOf(edge.kind, edge.label) || '关系';
      return '<span>' + esc(text) + ' · ' + esc(nameOf(otherEnd(edge, node.id))) + '</span>';
    }).join('');
    if (relationChips) html += '<div class="rt-detail-chips rt-detail-chips--links">' + relationChips + '</div>';

    if (!READONLY) {
      html += '<div class="rt-detail-actions">'
        + '<button type="button" class="rt-detail-btn is-primary" data-detail-action="edit">'
        + '<span data-icon="pen-line" data-icon-size="14"></span> 编辑</button>'
        + (node.kind === 'note' ? '' :
          '<button type="button" class="rt-detail-btn" data-detail-action="link">'
          + '<span data-icon="arrow-right" data-icon-size="14"></span> 关联人物</button>')
        + '<button type="button" class="rt-detail-btn is-danger" data-detail-action="delete" aria-label="删除">'
        + '<span data-icon="trash-2" data-icon-size="14"></span> 删除</button>'
        + '</div>';
    }

    host.innerHTML = html;
    hydrateIcons(host);
  }

  function namesOrEmpty(ids) {
    if (!ids.length) return '—';
    return ids.map(nameOf).join('、');
  }

  /* ------------------------------------------------------ 搜索 / 筛选 */
  var filterState = { query: '', kind: 'all' };

  function nodeMatches(node) {
    var query = filterState.query;
    if (query) {
      var hay = [node.name, node.note, node.subtitle, node.card_name].join(' ').toLowerCase();
      var viaEdge = edgesOf(node.id).some(function (edge) {
        var text = (labelOf(edge.kind, edge.label) + ' ' + nameOf(otherEnd(edge, node.id))).toLowerCase();
        return text.indexOf(query) >= 0;
      });
      if (hay.indexOf(query) < 0 && !viaEdge) return false;
    }
    var kind = filterState.kind;
    if (kind === 'all') return true;
    if (kind === 'favourite') return !!node.favourite;
    var pool = kind === 'blood' ? BLOOD_KINDS : MARRIAGE_KINDS;
    return edgesOf(node.id).some(function (edge) { return !!pool[edge.kind]; });
  }

  function edgeMatches(edge) {
    var kind = filterState.kind;
    if (kind === 'blood' && !BLOOD_KINDS[edge.kind]) return false;
    if (kind === 'marriage' && !MARRIAGE_KINDS[edge.kind]) return false;
    if (kind === 'favourite') return true;
    var query = filterState.query;
    if (!query) return true;
    var hay = (labelOf(edge.kind, edge.label) + ' ' + nameOf(edge.source) + ' ' + nameOf(edge.target)).toLowerCase();
    return hay.indexOf(query) >= 0;
  }

  function applyFilter() {
    var active = filterState.kind !== 'all' || !!filterState.query;
    var matched = Object.create(null);
    var any = false;
    S.nodes.forEach(function (node) {
      if (nodeMatches(node)) { matched[node.id] = true; any = true; }
    });
    // 筛到一个人都不剩时退回"全部"——空画布比失焦更让人困惑
    if (active && !any) matched = null;

    Array.prototype.forEach.call(document.querySelectorAll('#rtNodes .rt-node'), function (el) {
      el.classList.toggle('is-dim', !!matched && !matched[Number(el.dataset.node)]);
    });

    Array.prototype.forEach.call(document.querySelectorAll('#rtEdges .rt-edge'), function (el) {
      var edge = edgeById(el.getAttribute('data-edge'));
      var ok = edge ? edgeMatches(edge) : true;
      if (ok && edge && matched) ok = !!(matched[edge.source] || matched[edge.target]);
      if (!edge) ok = true;
      el.classList.toggle('is-dim', active && !ok && !!matched);
    });
  }

  function edgeById(id) {
    for (var i = 0; i < S.edges.length; i++) {
      if (String(S.edges[i].id) === String(id)) return S.edges[i];
    }
    return null;
  }

  function updateStats() {
    var host = $('rtTreeStats');
    if (!host) return;
    var people = visibleNodes().filter(function (node) { return node.kind !== 'note'; }).length;
    var active = visibleEdges().length;
    host.textContent = '共 ' + people + ' 位人物 · ' + active + ' 条关系'
      + (S.eraId && active !== S.edges.length ? '（本时代）' : '');
  }

  function nodeElement(node) {
    var el = document.createElement('div');
    el.className = 'rt-node' +
      (node.kind === 'note' ? ' is-note' : '') +
      (node.kind !== 'note' && !node.name ? ' is-empty' : '') +
      (node.id === S.selected ? ' is-selected' : '') +
      (node.deceased ? ' is-deceased' : '');
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.dataset.node = node.id;

    var body;
    if (node.kind === 'note') {
      body = '<div class="rt-card"><div class="rt-note-body">' + esc(node.note || '点两下写点什么') + '</div>' +
        '<div class="rt-name">备注</div></div>';
    } else {
      // 横向三行信息卡：眉标（身份）→ 姓名 → 元信息（归属 · 状态）
      var meta = [node.card_name || (S.doc && S.doc.name), node.deceased ? '已故' : '在世']
        .filter(Boolean).join(' · ');
      body = '<div class="rt-card">'
        + '<span class="rt-eyebrow">' + esc(roleOf(node)) + '</span>'
        + '<span class="rt-name">' + esc(node.name || '添加名称') + '</span>'
        + '<span class="rt-meta">' + esc(meta) + '</span>'
        + '</div>';
    }
    el.innerHTML = body;

    if (node.kind !== 'note') {
      ['n', 'e', 's', 'w'].forEach(function (side) {
        var handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'rt-handle rt-handle--' + side;
        handle.dataset.side = side;
        handle.textContent = '+';
        handle.title = '点：在这个方向新建一个人；拖到另一张卡：直接连过去';
        el.appendChild(handle);
      });
    }

    /* 拖动卡片：松手才吸附 + 落库（拖动过程中不碰后端，也不重排整棵树） */
    el.addEventListener('pointerdown', function (event) {
      if (READONLY) return;                      // 只读：卡片不能拖
      var handle = event.target.closest ? event.target.closest('.rt-handle') : null;
      if (handle) { beginLink(event, node, handle); return; }
      if (event.button !== 0) return;
      beginDrag(event, node, el);
    });

    /* 双击人物：跳到它归属的那张人物卡片；备注没有卡片，双击仍然是改内容。 */
    el.addEventListener('dblclick', function (event) {
      event.stopPropagation();
      if (node.kind === 'note') {
        if (!READONLY) editNote(node, el);
        return;
      }
      openCard(node);
    });

    /* 单击只做一件事：选中并在右侧栏显示简介，不离开当前页面。 */
    el.addEventListener('click', function (event) {
      event.stopPropagation();
      if (event.target.closest && event.target.closest('.rt-handle')) return;
      select(node.id);
    });
    el.addEventListener('contextmenu', function (event) {
      event.preventDefault();
      event.stopPropagation();
      select(node.id);
    });

    return el;
  }

  /* 只切 class、不重建 DOM —— 拖动过程中手里的 el 必须还是页面上那一个。
     刻意**不关菜单**：点加号会先弹关系菜单、随后浏览器才补一个 click 事件，
     这里要是顺手关一下，用户就永远看不到那个菜单。关菜单交给 pointerdown 那条路。 */
  function select(id) {
    S.selected = id;
    Array.prototype.forEach.call(document.querySelectorAll('.rt-node'), function (el) {
      el.classList.toggle('is-selected', Number(el.dataset.node) === id);
    });
    renderCardTools();
    renderDetail();
  }

  /* §4.5 联动：把一张卡对应的节点选中。只改高亮，不缩放、不跳转——
     工作区里翻到哪张卡，这边就亮哪个人，正在看的树不会被拽走。 */
  var focusApplied = false;

  function focusCard(cardId) {
    if (!cardId) return false;
    var nodes = visibleNodes();
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].card === cardId) { select(nodes[i].id); return true; }
    }
    return false;
  }

  /* -------------------------------------------------------- 平移 / 缩放 */
  function beginPan(event) {
    if (event.button === 1 || event.button === 0) {
      var startX = event.clientX, startY = event.clientY;
      var originX = S.view.x, originY = S.view.y;
      var moved = false;
      var wrap = $('rtCanvasWrap');
      wrap.classList.add('is-panning');
      function move(ev) {
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        S.view.x = originX + dx;
        S.view.y = originY + dy;
        applyView();
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        wrap.classList.remove('is-panning');
        if (!moved) select(null);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
  }

  function zoomBy(factor, clientX, clientY) {
    var wrap = $('rtCanvasWrap');
    var rect = wrap.getBoundingClientRect();
    var px = (clientX == null ? rect.width / 2 : clientX - rect.left);
    var py = (clientY == null ? rect.height / 2 : clientY - rect.top);
    var next = Math.min(2.4, Math.max(0.25, S.view.z * factor));
    var ratio = next / S.view.z;
    S.view.x = px - (px - S.view.x) * ratio;
    S.view.y = py - (py - S.view.y) * ratio;
    S.view.z = next;
    applyView();
  }

  function fit() {
    var wrap = $('rtCanvasWrap');
    var rect = wrap.getBoundingClientRect();
    if (!rect.width) { requestAnimationFrame(fit); return; }
    var nodes = visibleNodes();
    if (!nodes.length) {
      S.view = { x: 40, y: 40, z: 1 };
      applyView();
      return;
    }
    var minX = Math.min.apply(null, nodes.map(function (n) { return n.x; }));
    var minY = Math.min.apply(null, nodes.map(function (n) { return n.y; }));
    var maxX = Math.max.apply(null, nodes.map(function (n) { return n.x + cardW(); }));
    var maxY = Math.max.apply(null, nodes.map(function (n) { return n.y + cardH(); }));
    var pad = 70;
    var scale = Math.min(
      (rect.width - pad * 2) / (maxX - minX),
      (rect.height - pad * 2) / (maxY - minY),
      1
    );
    scale = Math.max(0.25, Math.min(scale, 1.6));
    S.view.z = scale;
    S.view.x = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
    S.view.y = (rect.height - (maxY - minY) * scale) / 2 - minY * scale;
    applyView();
  }

  /* ------------------------------------------------------------ 拖动卡片 */
  function beginDrag(event, node, el) {
    event.preventDefault();
    event.stopPropagation();
    select(node.id);
    var startX = event.clientX, startY = event.clientY;
    var originX = node.x, originY = node.y;
    var moved = false;

    function move(ev) {
      var dx = (ev.clientX - startX) / S.view.z;
      var dy = (ev.clientY - startY) / S.view.z;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      node.x = originX + dx;
      node.y = originY + dy;
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      renderEdges();
      positionCardTools();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      node.x = snap(node.x);
      node.y = snap(node.y);
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      renderEdges();
      positionCardTools();
      saveNode(node, { x: node.x, y: node.y, generation: rowIndex(node.y) });
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ------------------------------------------------------ 加号：连线手势 */
  var HANDLE_DIR = {
    n: { dx: 0, dy: -1, side: 'n' },
    s: { dx: 0, dy: 1, side: 's' },
    w: { dx: -1, dy: 0, side: 'w' },
    e: { dx: 1, dy: 0, side: 'e' }
  };

  function beginLink(event, node, handle) {
    event.preventDefault();
    event.stopPropagation();
    var side = handle.dataset.side;
    S.link = { from: node.id, side: side, to: null };
    handle.classList.add('is-armed');
    var live = $('rtLive');
    var layer = live.querySelector('g') || live.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
    var moved = false;
    var startX = event.clientX, startY = event.clientY;

    function toCanvas(clientX, clientY) {
      var rect = $('rtCanvasWrap').getBoundingClientRect();
      return {
        x: (clientX - rect.left - S.view.x) / S.view.z,
        y: (clientY - rect.top - S.view.y) / S.view.z
      };
    }

    function move(ev) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
      var point = toCanvas(ev.clientX, ev.clientY);
      var hit = hitNode(point, 4);
      S.link.to = moved && hit && hit.id !== node.id ? hit.id : null;
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      var a = anchors(node)[side];
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (S.link.to) {
        path.setAttribute('d', pathFrom(routePoints(node, nodeById(S.link.to))));
        path.setAttribute('class', 'rt-edge rt-edge--draft');
      } else {
        var mid = side === 'n' || side === 's'
          ? ' L ' + a.x + ' ' + point.y + ' L ' + point.x + ' ' + point.y
          : ' L ' + point.x + ' ' + a.y + ' L ' + point.x + ' ' + point.y;
        path.setAttribute('d', 'M ' + a.x + ' ' + a.y + mid);
        path.setAttribute('class', 'rt-edge rt-edge--draft');
      }
      layer.appendChild(path);
      highlightTarget(S.link.to);
    }

    function up(ev) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      handle.classList.remove('is-armed');
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      highlightTarget(null);
      var point = toCanvas(ev.clientX, ev.clientY);
      var hit = hitNode(point, 4);
      // 只有"真的拖动过"才算连线：加号手柄就压在卡片边上，
      // 光看落点会把"贴着邻居站的自己"误判成拖到了邻居身上。
      var target = moved && hit && hit.id !== node.id ? hit.id : null;
      S.link = null;
      if (target) {
        openRelations(node.id, side, target, handle, null);
        return;
      }
      // 拖到空白处松手：人落在**松手的地方**（而不是死板地贴在源卡旁边）
      var place = moved
        ? freeSlot(point.x - cardW() / 2, point.y - cardH() / 2, node)
        : neighborSlot(node, side);
      openRelations(node.id, side, null, handle, place);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* 某个方向的"下一格"：正好隔一个走线通道，卡片边框仍然贴网格 */
  function neighborSlot(node, side) {
    var info = HANDLE_DIR[side];
    var w = cardW(), h = cardH();
    if (side === 'e') return { x: node.x + w + S.grid.gap_x * grid(), y: node.y };
    if (side === 'w') return { x: node.x - w - S.grid.gap_x * grid(), y: node.y };
    if (side === 's') return { x: node.x, y: node.y + h + S.grid.gap_y * grid() };
    return { x: node.x, y: node.y - h - S.grid.gap_y * grid() };
  }

  /* 捏合缩放：两指拉开 = 放大整棵树（和滚轮走同一个 S.view.z） */
  function wirePinch() {
    if (!window.Opus || !window.Opus.pinch) return;
    var host = $('rtCanvasWrap');
    var start = S.view.z;
    window.Opus.pinch(host, {
      getScale: function () { return start; },
      limit: function (value) { return Math.max(0.25, Math.min(2.5, value)); },
      onScale: function (value) {
        S.view.z = value;
        applyView();
      },
    });
    host.addEventListener('pointerdown', function () { start = S.view.z; }, { capture: true, passive: true });
    host.addEventListener('pointerup', function () { start = S.view.z; }, { capture: true, passive: true });
  }

  function highlightTarget(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.rt-node'), function (el) {
      el.classList.toggle('is-drop-target', id != null && Number(el.dataset.node) === id);
    });
  }

  /* 落点命中：从最后画的往前找（画面在上面的优先）。
     卡片要**内缩**几个像素才算命中——加号手柄正好压在卡片边上，
     不内缩的话"贴着邻居的那张卡"会把一次普通点击误判成"拖到了邻居身上"。 */
  function hitNode(point, inset) {
    var pad = inset == null ? 0 : inset;
    for (var i = S.nodes.length - 1; i >= 0; i--) {
      var node = S.nodes[i];
      if (point.x >= node.x + pad && point.x <= node.x + cardW() - pad &&
          point.y >= node.y + pad && point.y <= node.y + cardH() - pad) return node;
    }
    return null;
  }

  /* 在期望落点附近找一格不压人的位置（拖到空白处新建时用） */
  function freeSlot(x, y, source) {
    var stepX = S.grid.col_step * grid();
    var stepY = S.grid.row_step * grid();
    var candidate = { x: snap(x), y: snap(y) };
    for (var ring = 0; ring < 12; ring++) {
      for (var ix = -ring; ix <= ring; ix++) {
        for (var iy = -ring; iy <= ring; iy++) {
          if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) continue;
          var spot = { x: candidate.x + ix * stepX, y: candidate.y + iy * stepY };
          if (!overlaps(spot, source)) return spot;
        }
      }
    }
    return candidate;
  }

  function overlaps(spot, source) {
    for (var i = 0; i < S.nodes.length; i++) {
      var node = S.nodes[i];
      if (source && node.id === source.id) continue;
      if (spot.x < node.x + cardW() && spot.x + cardW() > node.x &&
          spot.y < node.y + cardH() && spot.y + cardH() > node.y) return true;
    }
    return false;
  }

  /* ================================================ 右键菜单      */
  function canvasPoint(event) {
    var rect = $('rtCanvasWrap').getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - S.view.x) / S.view.z,
      y: (event.clientY - rect.top - S.view.y) / S.view.z
    };
  }

  $('rtCanvasWrap').addEventListener('contextmenu', function (event) {
    if (READONLY) return;
    if (event.target.closest && event.target.closest('.rt-node')) return;
    event.preventDefault();
    hideMenus();
    var point = canvasPoint(event);
    S.ctx = { x: snap(point.x), y: snap(point.y) };
    var menu = $('rtContextMenu');
    menu.hidden = false;
    var width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = Math.min(event.clientX, window.innerWidth - width - 10) + 'px';
    menu.style.top = Math.min(event.clientY, window.innerHeight - height - 10) + 'px';
  });

  $('rtContextMenu').addEventListener('click', function (event) {
    var button = event.target.closest('[data-menu]');
    if (!button || !S.ctx) return;
    var kind = button.dataset.menu;
    hideMenus();
    createCard({
      x: S.ctx.x, y: S.ctx.y,
      kind: kind === 'note' ? 'note' : 'person',
      generation: rowIndex(S.ctx.y)
    });
  });

  function createCard(body) {
    // 新人物**不带名字**（服务端会保留空名字）：落地就是那张虚线空卡，
    // 紧接着就弹输入框让你起名，而不是先塞一个"新成员"再让你改。
    if (body.kind !== 'note' && body.name === undefined) body.name = '';
    return api(API + '/tree-variants/' + S.variant.id + '/nodes', { method: 'POST', body: body })
      .then(function (data) {
        var node = normalizeNode(data);
        S.nodes.push(node);
        render();
        select(node.id);
        var el = document.querySelector('.rt-node[data-node="' + node.id + '"]');
        if (node.kind === 'note') editNote(node, el); else editName(node, el);
        return node;
      })
      .catch(function (err) { toast(friendly(err, '添加失败')); });
  }

  /* ================================================ 关系菜单      */
  function relationMenuItems() {
    return S.relations.filter(function (relation) { return relation.enabled !== false; });
  }

  function openRelations(fromId, side, targetId, handle, place) {
    hideMenus();
    var from = nodeById(fromId);
    if (!from) return;
    S.popAnchor = {
      from: fromId, side: side, target: targetId,
      place: place || neighborSlot(from, side),
      x: from.x + cardW(), y: from.y
    };
    var pop = $('rtRelationsPop');
    var gridBox = $('rtPopGrid');
    gridBox.innerHTML = '';

    var items = relationMenuItems();
    if (!items.length) {
      gridBox.innerHTML = '<p class="rt-existing-empty" style="grid-column:1/-1;padding:8px 10px">这棵树还没有可用关系，先「创建自定义」。</p>';
    }
    items.forEach(function (relation) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rt-pop-item';
      button.innerHTML = icon(relation.kind) + '<span>' + esc(relation.label) + '</span>';
      button.addEventListener('click', function () { applyRelation(relation); });
      gridBox.appendChild(button);
    });

    pop.hidden = false;
    positionRelations();
  }

  function positionRelations() {
    var pop = $('rtRelationsPop');
    var anchor = S.popAnchor;
    if (!anchor) return;
    var wrap = $('rtCanvasWrap').getBoundingClientRect();
    var x = wrap.left + S.view.x + (anchor.x + 18) * S.view.z;
    var y = wrap.top + S.view.y + anchor.y * S.view.z;
    pop.style.left = Math.min(x, window.innerWidth - pop.offsetWidth - 12) + 'px';
    pop.style.top = Math.min(Math.max(y, 12), window.innerHeight - pop.offsetHeight - 12) + 'px';
  }

  function ensureRelation(kind, label) {
    var found = S.relations.filter(function (relation) { return relation.kind === kind; })[0];
    if (found) return Promise.resolve(found);
    var next = S.relations.concat([{ kind: kind, label: label || kind, style: '', enabled: true }]);
    return api(API + '/relationship/trees/' + S.docId + '/relations', {
      method: 'PUT', body: { relations: next }
    }).then(function (data) {
      S.relations = data.relations || next;
      return S.relations.filter(function (relation) { return relation.kind === kind; })[0];
    });
  }

  /* 关系菜单里真正干活的那个函数：三种出口（新建人 / 连现有的人 / 跳过）都汇到这里 */
  function applyRelation(relation) {
    var anchor = S.popAnchor;
    hideMenus();
    if (!anchor) return;

    var afterNode = function (targetNode) {
      if (!targetNode || !relation) return Promise.resolve(null);
      return api(API + '/tree-variants/' + S.variant.id + '/edges', {
        method: 'POST',
        body: {
          source: anchor.from, target: targetNode.id,
          kind: relation.kind, label: relation.label, style: relation.style || ''
        }
      }).then(function (edge) {
        S.edges.push(edge);
        render();
        return edge;
      });
    };

    if (anchor.target) {
      afterNode(nodeById(anchor.target)).catch(function (err) { toast(friendly(err, '连线失败')); });
      return;
    }
    var place = anchor.place;
    createCard({ x: place.x, y: place.y, generation: rowIndex(place.y) })
      .then(function (node) {
        if (!node) return null;
        return afterNode(node);
      })
      .catch(function (err) { toast(friendly(err, '连线失败')); });
  }

  $('rtRelationsPop').addEventListener('click', function (event) {
    var button = event.target.closest('[data-pop]');
    if (!button) return;
    var action = button.dataset.pop;
    if (action === 'skip') {
      // 暂时跳过：人先放下来，关系以后再补——所以只建卡片，不建边
      var anchor = S.popAnchor;
      hideMenus();
      if (!anchor || anchor.target) return;
      var place = anchor.place;
      createCard({ x: place.x, y: place.y, generation: rowIndex(place.y) });
      return;
    }
    if (action === 'custom') {
      askText({ label: '这条关系叫什么？', value: '' }).then(function (value) {
        if (value === null) return;
        var label = value.trim();
        if (!label) return;
        var kind = 'custom_' + Date.now().toString(36);
        ensureRelation(kind, label).then(function (relation) { applyRelation(relation); });
      });
      return;
    }
    if (action === 'link') { openLinkPicker(); }
  });

  /* 链接现有人员：把世界上已经有的卡片挂到这棵树上，落点用刚才算好的那一格 */
  function openLinkPicker() {
    hideMenus();
    var anchor = S.popAnchor;
    if (!anchor) return;
    pickDocument('要链接哪张卡片？输入名字（留空看全部）').then(function (picked) {
      if (!picked) return null;
      var place = anchor.place || { x: 0, y: 0 };
      return api(API + '/tree-variants/' + S.variant.id + '/nodes', {
        method: 'POST',
        body: { card: picked.id, x: place.x, y: place.y, generation: rowIndex(place.y) }
      }).then(function (data) {
        var node = normalizeNode(data);
        S.nodes.push(node);
        render();
        return api(API + '/tree-variants/' + S.variant.id + '/edges', {
          method: 'POST',
          body: { source: anchor.from, target: node.id, kind: 'parent', label: '' }
        }).then(function (edge) {
          S.edges.push(edge);
          render();
          toast('已链接「' + node.name + '」');
        });
      }).catch(function (err) { toast(friendly(err, '链接失败')); });
    }).catch(function (err) { toast(err.message || '搜索失败'); });
  }

  /* 从世界里的卡片中挑一张（先按名字搜，再按序号选） */
  function pickDocument(question) {
    return askText({ label: question, value: '' }).then(function (name) {
      if (name === null) return null;
      return api(API + '/documents?type=card&q=' + encodeURIComponent(name.trim()))
        .then(function (data) {
          var documents = data.documents || [];
          if (!documents.length) { toast('没找到匹配的卡片'); return null; }
          return askChoice({
            title: question,
            options: documents.slice(0, 12).map(function (item) {
              return { value: item.id, label: item.name, doc: item };
            })
          }).then(function (picked) { return picked ? picked.doc : null; });
        });
    });
  }

  function hideMenus() {
    // 缩回：先放一段缩小动画再藏（减少动效时直接藏）
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ['rtContextMenu', 'rtRelationsPop'].forEach(function (id) {
      var node = $(id);
      if (!node || node.hidden) return;
      if (reduce) { node.hidden = true; return; }
      node.classList.add('is-closing');
      setTimeout(function () {
        node.classList.remove('is-closing');
        node.hidden = true;
      }, 130);
    });
  }

  /* ---------------------------------------------------- 就地编辑名字 / 备注 */
  function editName(node, el) {
    if (!el) return;
    var chip = el.querySelector('.rt-name');
    if (!chip || el.querySelector('.rt-name-input')) return;
    var input = document.createElement('input');
    input.className = 'rt-name-input';
    input.value = node.name || '';
    input.placeholder = '添加名称';
    chip.style.visibility = 'hidden';
    el.appendChild(input);
    input.focus();
    input.select();
    var done = false;
    function commit(save) {
      if (done) return;
      done = true;
      var value = input.value.trim();
      input.remove();
      chip.style.visibility = '';
      if (save && value !== node.name) {
        node.name = value;
        var target = document.querySelector('.rt-node[data-node="' + node.id + '"]');
        if (target) { target.classList.toggle('is-empty', !value); target.querySelector('.rt-name').textContent = value || '添加名称'; }
        saveNode(node, { name: value });
      } else if (!save) {
        renderNodes();
        applyFilter();
      }
      renderDetail();
    }
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); commit(true); }
      if (event.key === 'Escape') { event.preventDefault(); commit(false); }
    });
    input.addEventListener('blur', function () { commit(true); });
    input.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
  }

  function editNote(node, el) {
    if (!el) return;
    var body = el.querySelector('.rt-note-body');
    if (!body || el.querySelector('.rt-note-input')) return;
    var area = document.createElement('textarea');
    area.className = 'rt-note-input';
    area.value = node.note || '';
    area.placeholder = '写点什么…';
    body.style.visibility = 'hidden';
    el.appendChild(area);
    area.focus();
    var done = false;
    function commit(save) {
      if (done) return;
      done = true;
      var value = area.value;
      area.remove();
      body.style.visibility = '';
      if (save && value !== node.note) {
        node.note = value;
        body.textContent = value || '点两下写点什么';
        saveNode(node, { note: value });
      } else if (!save) {
        renderNodes();
      }
    }
    area.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); commit(false); }
    });
    area.addEventListener('blur', function () { commit(true); });
    area.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
  }

  /* -------------------------------------------------------- 卡片工具条（关系菜单顶部） */
  function renderCardTools() {
    var bar = $('rtCardTools');
    if (READONLY) { bar.hidden = true; return; }
    var node = S.selected != null ? nodeById(S.selected) : null;
    if (!node || node.kind === 'note') { bar.hidden = true; return; }
    bar.hidden = false;
    bar.querySelector('[data-card-tool="deceased"]').classList.toggle('is-on', !!node.deceased);
    bar.querySelector('[data-card-tool="favourite"]').classList.toggle('is-on', !!node.favourite);
    positionCardTools();
  }

  function positionCardTools() {
    var bar = $('rtCardTools');
    if (bar.hidden || S.selected == null) return;
    var node = nodeById(S.selected);
    if (!node) { bar.hidden = true; return; }
    var wrap = $('rtCanvasWrap').getBoundingClientRect();
    var x = wrap.left + S.view.x + (node.x + cardW() / 2) * S.view.z;
    var y = wrap.top + S.view.y + node.y * S.view.z - 14;
    bar.style.left = Math.min(Math.max(x - bar.offsetWidth / 2, 12), window.innerWidth - bar.offsetWidth - 12) + 'px';
    bar.style.top = Math.max(y - bar.offsetHeight, 12) + 'px';
  }

  $('rtCardTools').addEventListener('click', function (event) {
    var button = event.target.closest('[data-card-tool]');
    if (!button) return;
    var node = nodeById(S.selected);
    if (!node) return;
    var tool = button.dataset.cardTool;

    if (tool === 'card') {
      api(API + '/tree-nodes/' + node.id + '/card', {
        method: 'POST', body: { name: node.name || '新人物' }
      }).then(function (data) {
        node.card = data.node.card;
        node.card_name = data.document.name;
        render();
        renderCardTools();
        toast('已创建卡片「' + data.document.name + '」');
      }).catch(function (err) { toast(err.message || '创建卡片失败'); });
      return;
    }
    if (tool === 'assign') { assignCard(node); return; }
    if (tool === 'image') {
      askText({ label: '图片地址（留空则用姓名首字）', value: node.image || '' }).then(function (url) {
        if (url === null) return;
        node.image = url.trim();
        saveNode(node, { image: node.image });
        render();
        renderCardTools();
      });
      return;
    }
    if (tool === 'deceased') {
      node.deceased = !node.deceased;
      saveNode(node, { deceased: node.deceased });
      render();
      renderCardTools();
      return;
    }
    if (tool === 'favourite') {
      node.favourite = !node.favourite;
      saveNode(node, { favourite: node.favourite });
      renderNodes();
      renderCardTools();
      renderDetail();
      applyFilter();
      return;
    }
    if (tool === 'delete') { removeNode(node); }
  });

  /* 删除人物 / 备注：卡片工具条与右侧详情栏共用同一条路径 */
  function removeNode(node) {
    if (!node) return;
    if (!window.confirm('删除「' + (node.name || '这张卡') + '」？连在它上面的关系也会一起删掉。')) return;
    api(API + '/tree-nodes/' + node.id, { method: 'DELETE' }).then(function () {
      S.nodes = S.nodes.filter(function (item) { return item.id !== node.id; });
      S.edges = S.edges.filter(function (edge) {
        return edge.source !== node.id && edge.target !== node.id;
      });
      S.selected = null;
      render();
      renderCardTools();
    }).catch(function (err) { toast(err.message || '删除失败'); });
  }

  function assignCard(node) {
    pickDocument('分配哪张现有卡片？输入名字（留空看全部）').then(function (picked) {
      if (!picked) return null;
      return api(API + '/tree-nodes/' + node.id, { method: 'PUT', body: { card: picked.id } })
        .then(function (data) {
          node.card = data.card;
          node.card_name = data.card_name;
          node.name = data.name;
          render();
          renderCardTools();
          toast('已分配给「' + data.card_name + '」');
        });
    }).catch(function (err) { toast(err.message || '分配失败'); });
  }

  /* ------------------------------------------------- 双击人物：打开卡片 */
  /* 独立页：回工作区深链（/w/<slug>#doc=<id>）；
     嵌在宿主里：交给宿主开（发布站点跳站点页，工作区开标签页）。 */
  function openCard(node) {
    if (!node.card) {
      toast((node.name || '这位人物') + '：还没有关联卡片');
      return;
    }
    if (EMBED) { openCardInHost(node); return; }
    location.href = PAGE + '#doc=' + node.card;
  }

  /* 发一条消息给宿主页面：
     · 发布站点认 slug，直接跳那张卡的站点页；
     · 工作区认 id，在自己里面把那张卡开成标签页。
     两种宿主都收得到，同一条消息就够了。 */
  function openCardInHost(node) {
    if (window.parent === window) return;
    if (!node.card) {
      // 没有关联卡片：也得给个回音，不然点一下什么都不发生，像坏了
      window.parent.postMessage({ type: 'ws-node-hint', name: node.name }, window.location.origin);
      return;
    }
    window.parent.postMessage({
      type: 'ws-open-doc',
      id: node.card,
      name: node.name,
      slug: node.card_slug || ''
    }, window.location.origin);
  }

  /* 工作区选中一张卡时广播过来：这边只负责把它亮起来。 */
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data || {};
    if (data.type === 'ws-focus-card') focusCard(Number(data.cardId) || 0);
  });

  /* ------------------------------------------------------------ 落库 */
  var pendingTimers = Object.create(null);

  function saveNode(node, patch) {
    S.dirty[node.id] = Object.assign(S.dirty[node.id] || {}, patch);
    saveState('保存中…', 'busy');
    clearTimeout(pendingTimers[node.id]);
    pendingTimers[node.id] = setTimeout(function () { flushNode(node.id); }, 320);
  }

  function flushNode(nodeId) {
    var patch = S.dirty[nodeId];
    if (!patch) return;
    delete S.dirty[nodeId];
    delete pendingTimers[nodeId];
    api(API + '/tree-nodes/' + nodeId, { method: 'PUT', body: patch })
      .then(function () { saveState('已保存'); })
      .catch(function (err) { saveState('没存上', 'error'); toast(err.message || '保存失败'); });
  }

  function spanTextOf(edge) {
    if (edge.start_year == null && edge.end_year == null) return '';
    return (edge.start_year == null ? '' : edge.start_year)
      + ' ~ ' + (edge.end_year == null ? '' : edge.end_year);
  }

  function parseSpanText(text) {
    var parts = String(text == null ? '' : text).split(/[,，~～]/);
    var toYear = function (raw) {
      var value = String(raw == null ? '' : raw).trim();
      if (!value) return null;
      var num = parseFloat(value);
      return isNaN(num) ? null : num;
    };
    return { start: toYear(parts[0]), end: toYear(parts[1]) };
  }

  function editEdge(edge) {
    var current = labelOf(edge.kind, edge.label);
    askText({ label: '这条关系叫什么？（留空即删除这条关系）', value: current }).then(function (value) {
      if (value === null) return;
      var label = value.trim();
      if (!label) {
        if (!window.confirm('删除这条关系？')) return;
        api(API + '/tree-edges/' + edge.id, { method: 'DELETE' }).then(function () {
          S.edges = S.edges.filter(function (item) { return item.id !== edge.id; });
          render();
        }).catch(function (err) { toast(err.message || '删除失败'); });
        return;
      }
      // 有效区间（§4.4 D）：留空 = 一直有效；只填一端 = 那一端不设限。
      askText({
        label: '有效区间：起始年, 结束年（留空 = 一直有效）',
        value: spanTextOf(edge)
      }).then(function (spanInput) {
        if (spanInput === null) return;
        var span = parseSpanText(spanInput);
        if (span.start != null && span.end != null && span.start > span.end) {
          toast('起始年不能晚于结束年');
          return;
        }
        api(API + '/tree-edges/' + edge.id, {
          method: 'PUT',
          body: { label: label, start_year: span.start, end_year: span.end }
        }).then(function (data) {
          edge.label = data.label;
          edge.start_year = data.start_year;
          edge.end_year = data.end_year;
          render();
        }).catch(function (err) { toast(err.message || '保存失败'); });
      });
    });
  }

  /* ------------------------------------------------------------ 顶栏动作 */
  document.querySelector('.rt-topbar-tools').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.dataset.action;
    if (action === 'fit') { fit(); return; }
    if (action === 'zoom-in') { zoomBy(1.15); return; }
    if (action === 'zoom-out') { zoomBy(1 / 1.15); return; }
    if (action === 'add-person' || action === 'add-note') {
      var wrap = $('rtCanvasWrap').getBoundingClientRect();
      var point = {
        x: (wrap.width / 2 - S.view.x) / S.view.z - cardW() / 2,
        y: (wrap.height / 2 - S.view.y) / S.view.z - cardH() / 2
      };
      // 别叠在已有的卡片上：往下顺延一格
      var candidate = { x: snap(point.x), y: snap(point.y) };
      var guard = 0;
      while (hitNode({ x: candidate.x + 1, y: candidate.y + 1 }) && guard < 60) {
        candidate.y += S.grid.row_step * grid();
        guard++;
      }
      createCard({
        x: candidate.x, y: candidate.y,
        kind: action === 'add-note' ? 'note' : 'person',
        generation: rowIndex(candidate.y)
      });
      return;
    }
    if (action === 'relations') { openRelationEditor(); }
  });

  document.querySelector('.rt-zoom').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'zoom-in') zoomBy(1.15);
    if (button.dataset.action === 'zoom-out') zoomBy(1 / 1.15);
    if (button.dataset.action === 'fit') fit();
  });

  /* 全屏：同标签换页，不再开新标签（新标签会把跨文档过渡整个吃掉）。
     嵌在宿主里时 iframe 自己跳只会换掉一块面板，所以把地址交给宿主，
     由宿主在自己的标签页上走。 */
  var openFull = $('rtOpenFull');
  if (openFull) {
    openFull.addEventListener('click', function (event) {
      if (!EMBED) return;                    // 独立页：交给浏览器原生跳转
      event.preventDefault();
      if (window.parent === window) return;
      window.parent.postMessage({
        type: 'ws-open-page',
        url: new URL(openFull.href, window.location.href).href
      }, window.location.origin);
    });
  }

  /* ------------------------------------------- 搜索 / 筛选 / 右侧详情栏 */
  var searchInput = $('rtSearch');
  if (searchInput) {
    var runSearch = function () {
      filterState.query = searchInput.value.trim().toLowerCase();
      applyFilter();
    };
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('search', runSearch);
  }

  var filterGroup = document.querySelector('.rt-filter-group');
  if (filterGroup) {
    filterGroup.addEventListener('click', function (event) {
      var button = event.target.closest('[data-filter]');
      if (!button) return;
      filterState.kind = button.dataset.filter || 'all';
      Array.prototype.forEach.call(filterGroup.querySelectorAll('[data-filter]'), function (other) {
        var on = other === button;
        other.classList.toggle('is-active', on);
        other.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      applyFilter();
    });
  }

  var detailHost = $('rtNodeDetail');
  if (detailHost) {
    detailHost.addEventListener('click', function (event) {
      if (READONLY) return;
      var button = event.target.closest('[data-detail-action]');
      if (!button) return;
      var node = S.selected != null ? nodeById(S.selected) : null;
      if (!node) return;
      var action = button.dataset.detailAction;
      if (action === 'delete') { removeNode(node); return; }
      var el = document.querySelector('.rt-node[data-node="' + node.id + '"]');
      if (action === 'edit') {
        if (!el) return;
        if (node.kind === 'note') editNote(node, el); else editName(node, el);
        return;
      }
      if (action === 'link') openRelations(node.id, 'e');
    });
  }

  /* 关系清单编辑器：和第二步那个左栏是同一套数据，只是搬到了编辑区里 */
  function openRelationEditor() {
    var choices = S.relations.map(function (r) {
      return { value: r.kind, label: r.label + (r.enabled === false ? '（已停用）' : ''), relation: r };
    });
    choices.push({ value: '', label: '＋ 新增一条关系', relation: null });
    askChoice({ title: '关系清单：选一条改名，或新增', options: choices }).then(function (picked) {
      if (!picked) return null;
      if (!picked.relation) {
        return askText({ label: '新关系的名字（例如：教父、世仇、债主）', value: '' }).then(function (name) {
          if (name === null || !name.trim()) return null;
          S.relations.push({ kind: 'custom_' + Date.now().toString(36), label: name.trim(), style: '', enabled: true });
          return saveRelations();
        });
      }
      return askText({ label: '改叫什么？', value: picked.relation.label }).then(function (next) {
        if (next === null) return null;
        picked.relation.label = next.trim() || picked.relation.label;
        return saveRelations();
      });
    });
  }

  function saveRelations() {
    return api(API + '/relationship/trees/' + S.docId + '/relations', {
      method: 'PUT', body: { relations: S.relations }
    }).then(function (data) { S.relations = data.relations || S.relations; toast('关系清单已更新'); })
      .catch(function (err) { toast(err.message || '更新失败'); });
  }

  /* ------------------------------------------------------------ 事件绑定 */
  var wrap = $('rtCanvasWrap');
  wrap.addEventListener('pointerdown', function (event) {
    if (event.target.closest && event.target.closest('.rt-node')) return;
    hideMenus();
    renderCardTools();
    if (event.button === 0 || event.button === 1) beginPan(event);
  });
  wrap.addEventListener('wheel', function (event) {
    event.preventDefault();
    if (event.shiftKey) {                    // Shift + 滚轮：左右平移
      S.view.x -= (event.deltaY || event.deltaX);
      applyView();
      return;
    }
    zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
  }, { passive: false });

  window.addEventListener('resize', function () { positionRelations(); positionCardTools(); });
  window.addEventListener('scroll', function () { positionRelations(); positionCardTools(); }, true);

  document.addEventListener('pointerdown', function (event) {
    if (event.target.closest && (event.target.closest('.rt-menu') || event.target.closest('.rt-relations-pop') ||
        event.target.closest('.rt-card-tools'))) return;
    hideMenus();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { hideMenus(); select(null); }
    if (event.key === 'f' || event.key === 'F') {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      fit();
    }
  });

  /* ------------------------------------------------------------ 启动 */
  boot();
})();
