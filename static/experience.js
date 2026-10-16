/* ==========================================================================
   experience.js  —  全链路体验层的前端运行时
   --------------------------------------------------------------------------
   这是什么：一个"让界面显得有生命"的脚本。它不碰任何业务逻辑（不读写数据、
   也不发业务请求），只负责把"系统正在做事"这件事变得看得见、摸得着——比如
   页面在加载、正在切换、刚收到反馈、网络断了、你正要离开。

   它怎么工作：所有能力都做成方法挂在全局对象 window.Opus 上，业务脚本
   （workspace.js / relationship.js）需要时按名字调用。即使没人调用，它自己
   也会活着，默默接管一批站内通用的细节。

   它管的事（按触发时机大致排列）：
     · 导航进度线（跳转时顶部那条线）· 打字机标题与开场遮罩
     · Ripple 点击波纹与焦点样式     · 滚动到视口时淡入 + 错峰
     · 分级 Toast 提示               · 离线徽标与待同步计数
     · 面板切换动效（扫描线 / 交叠）  · 离开页面时用 beacon 上报
     · 骨架屏工厂（占位块）          · 共享元素与 View Transitions

   三条自我约束（为什么这么克制）：
     1. 只动 opacity / transform / 颜色，不动布局尺寸——避免动画触发重排而卡顿。
     2. #panels 里不挂"有限次"CSS 动画（renderPanels 每帧重建）；面板内入场
        一律走 Web Animations API，而且只在真的切换标签页那次触发。
     3. prefers-reduced-motion 下所有运动性动画让路，且不留下"卡在 opacity:0"
        的元素——入场动画的关键帧只写 from，静止态就是 CSS 原始状态。
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------- 基础设施 */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(motionQuery && motionQuery.matches);
  const store = {
    get(key, fallback) {
      try { const v = sessionStorage.getItem(key); return v === null ? fallback : v; }
      catch (error) { return fallback; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch (error) { /* 隐私模式：算了 */ }
    },
  };
  // 站点模板只给了 body.site（没有 data-surface），这里兜一下——
  // 不然 exit intent 这类只在站点上跑的东西会静默不生效。
  const SURFACE = document.body
    ? (document.body.dataset.surface
       || (document.body.classList.contains('site') ? 'site' : 'workspace'))
    : '';

  /* ======================================================================
     导航进度线
     ----------------------------------------------------------------------
     一条 2px 翠绿线，跳转开始从左侧出现，完成时到右侧并淡出。
     只读站点是 MPA（点链接→换页），工作区是 SPA（pushState→换 hash），
     两条路径都接上。
     ====================================================================== */
  const progress = (function () {
    let bar = null;
    let timer = null;
    function node() {
      if (bar && bar.isConnected) return bar;
      bar = el('div');
      bar.id = 'xpProgress';
      bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bar);
      return bar;
    }
    function start() {
      const box = node();
      clearTimeout(timer);
      box.classList.remove('is-done');
      box.classList.add('is-on');
      // 重放同一条动画：强制 reflow 之后再挂类，否则连续跳转第二次不跑
      void box.offsetWidth;
      box.classList.add('is-run');
      // 兜底：任何情况下 4 秒后收线，绝不留下一条永远爬不完的进度条
      timer = setTimeout(done, 4000);
    }
    function done() {
      const box = node();
      clearTimeout(timer);
      box.classList.remove('is-run');
      box.classList.add('is-done');
      timer = setTimeout(() => {
        box.classList.remove('is-on', 'is-done');
      }, 320);
    }
    return { start, done };
  })();

  // —— MPA：拦下同源站内链接的点击（不改默认行为，只是提前出线）
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || link.target === '_blank'
        || link.hasAttribute('download') || /^(mailto|tel|javascript):/i.test(href)) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;   // 只有 hash 变了
    if (link.dataset.noProgress === '1') return;
    progress.start();
  }, true);
  window.addEventListener('pageshow', () => progress.done());
  window.addEventListener('pagehide', () => progress.done());

  // —— SPA：工作区改 hash / pushState 时给一条短促的线
  (function bindSpaProgress() {
    if (!$('#panels')) return;                     // 不是工作区
    const wrap = (name) => {
      const original = history[name];
      if (typeof original !== 'function') return;
      history[name] = function patched() {
        progress.start();
        setTimeout(progress.done, 260);
        return original.apply(this, arguments);
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('hashchange', () => { progress.start(); setTimeout(progress.done, 240); });
  })();

  /* ======================================================================
     工作区启动屏
     ----------------------------------------------------------------------
     标记写在 workspace.html 里（首帧就在，不用等 JS）。是否显示由 <html> 上的
     .xp-splash 决定——那一位由 <head> 里的内联脚本按 sessionStorage 打上，
     所以"本次会话已经启动过"时既不会闪、也不会白等。
     ====================================================================== */
  const splash = (function () {
    const node = $('#osplash');
    if (!node || !document.documentElement.classList.contains('xp-splash')) {
      return { done() {} };
    }
    const shownAt = Date.now();
    const MIN_MS = 460;          // 最短停留：留够 370ms 的标记绘制 + 一拍停顿，避免一闪而过
    const SAFETY_MS = 20000;     // 兜底：仅当 boot 信号始终没来（如脚本加载失败）时才收屏，防止永久卡住
    let finished = false;
    const safety = setTimeout(() => done(), SAFETY_MS);
    // 收屏的唯一正常条件：程序加载完成（workspace.js 的 boot() 结束派发 opus:booted）
    function done() {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      // 程序已就绪：立刻把指针事件交还给应用。最短停留与淡出只是"好看"，
      // 不能继续把用户的第一下点击挡在启动屏里（首次打开"点了没反应"的根因）。
      node.classList.add('is-ready');
      const wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
      setTimeout(() => {
        node.classList.add('is-out');
        setTimeout(() => node.remove(), 260);
      }, wait);
    }
    return { done };
  })();

  /* ======================================================================
     Ripple：按钮点击从点击位置扩散的翠绿波纹
     ====================================================================== */
  document.addEventListener('pointerdown', (event) => {
    if (reduced() || event.button !== 0) return;
    const host = event.target.closest && event.target.closest(
      'button, .mini-btn, .tb-btn, .sb-new, .tile, [data-ripple]');
    if (!host || host.disabled || host.dataset.noRipple === '1') return;
    if (host.classList.contains('tab') || host.classList.contains('rt-node')) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const span = el('span', 'fx-ripple');
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${event.clientX - rect.left - size / 2}px`;
    span.style.top = `${event.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(span);
    setTimeout(() => span.remove(), 420);
  }, true);

  /* ======================================================================
     滚动显现（只读站点）＋ 错峰
     ----------------------------------------------------------------------
     只把"当前不在视口里"的元素藏起来，再交给 IntersectionObserver 放出来。
     这样 JS 没跑、浏览器不支持、打印、屏幕阅读器——内容永远是可读的。
     ====================================================================== */
  const reveal = (function () {
    let observer = null;
    function ensure() {
      if (observer || typeof IntersectionObserver !== 'function') return observer;
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
      return observer;
    }
    function collect(scope) {
      const host = scope || document;
      const targets = $$('[data-reveal]', host);
      targets.forEach((node, index) => {
        if (node.classList.contains('xp-reveal')) return;
        const rect = node.getBoundingClientRect();
        // 已经在视口里的不做动画（首屏不该"再出现一次"）
        if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) return;
        node.classList.add('xp-reveal');
        node.style.setProperty('--xp-i', String(index % 6));
        const io = ensure();
        if (!io) { node.classList.add('is-in'); return; }
        io.observe(node);
      });
    }
    return { collect };
  })();

  /* ======================================================================
     Hero 视差：背景网格跟滚动走一点点（rAF 节流，只写一个变量）
     ====================================================================== */
  (function heroParallax() {
    const hero = $('.site .hero, .site .era-head');
    if (!hero || reduced()) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.min(window.scrollY || 0, 600);
      hero.style.setProperty('--xp-parallax', `${(y * 0.3).toFixed(1)}px`);   // 系数 0.3
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  })();

  /* ======================================================================
     打字机标题（只读站点首页，一次会话只演一次）
     ====================================================================== */
  (function typewriter() {
    const title = $('.site .hero h1');
    if (!title || reduced()) return;
    if (store.get('opus.typewriter') === '1') return;
    const full = (title.textContent || '').trim();
    if (!full || full.length > 42) return;         // 太长的标题不逐字写，省得等
    store.set('opus.typewriter', '1');
    // 先按"最终文案"把高度钉住，逐字写的时候就不会把下面的内容推来推去
    const height = title.getBoundingClientRect().height;
    title.style.minHeight = `${Math.ceil(height)}px`;
    title.textContent = '';
    title.classList.add('xp-type');
    const caret = el('span', 'xp-caret');
    caret.setAttribute('aria-hidden', 'true');
    title.appendChild(caret);
    const text = document.createTextNode('');
    title.insertBefore(text, caret);
    const step = Math.max(14, Math.min(34, Math.round(620 / full.length)));
    let index = 0;
    (function tick() {
      if (index >= full.length) {
        title.dataset.done = '1';
        title.style.minHeight = '';
        return;
      }
      text.nodeValue = full.slice(0, ++index);
      setTimeout(tick, step);
    })();
  })();

  /* ======================================================================
     骨架屏工厂：跟真实内容布局对齐的块级占位
     ====================================================================== */
  const skeleton = (function () {
    function line(width, cls) {
      const node = el('div', `sk ${cls || ''}`.trim());
      node.style.width = typeof width === 'number' ? `${width}px` : (width || '100%');
      node.style.height = '10px';
      return node;
    }
    function tree(rows) {
      const wrap = el('div', 'sk-tree');
      const count = rows || 9;
      for (let i = 0; i < count; i += 1) {
        const row = el('div', 'skt-row');
        row.style.setProperty('--d', String(i % 3 === 0 ? 0 : (i % 3)));
        row.appendChild(el('div', 'sk skt-box'));
        const bar = el('div', 'sk skt-line');
        bar.style.width = `${44 + ((i * 13) % 46)}%`;
        row.appendChild(bar);
        wrap.appendChild(row);
      }
      return wrap;
    }
    function card() {
      const wrap = el('div', 'sk-card');
      wrap.appendChild(el('div', 'sk skc-title'));
      const grid = el('div', 'skc-grid');
      for (let i = 0; i < 6; i += 1) grid.appendChild(el('div', 'sk'));
      wrap.appendChild(grid);
      [92, 84, 88, 62].forEach((w) => {
        const bar = el('div', 'sk skc-line');
        bar.style.width = `${w}%`;
        wrap.appendChild(bar);
      });
      return wrap;
    }
    function timeline() {
      const wrap = el('div', 'sk-timeline');
      const axis = el('div', 'skt-axis');
      wrap.appendChild(axis);
      [8, 22, 38, 55, 71, 86].forEach((pct, i) => {
        const node = el('div', 'sk skt-node');
        node.style.left = `calc(${pct}% - 6px)`;
        wrap.appendChild(node);
        const label = el('div', 'sk skt-label');
        label.style.left = `calc(${pct}% - 24px)`;
        label.style.width = `${38 + (i % 3) * 12}px`;
        wrap.appendChild(label);
      });
      [[12, 26], [44, 18], [70, 22]].forEach(([left, width]) => {
        const band = el('div', 'sk skt-band');
        band.style.left = `${left}%`;
        band.style.width = `${width}%`;
        wrap.appendChild(band);
      });
      return wrap;
    }
    function graph() {
      const wrap = el('div', 'sk-graph');
      const spots = [[14, 22], [46, 12], [72, 30], [30, 62], [58, 66]];
      spots.forEach(([x, y]) => {
        const node = el('div', 'sk skg-node');
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        wrap.appendChild(node);
      });
      const link = el('div', 'skg-link');
      link.style.left = '22%';
      link.style.top = '40%';
      link.style.width = '40%';
      link.style.transform = 'rotate(6deg)';
      wrap.appendChild(link);
      return wrap;
    }
    function site() {
      const wrap = el('div', 'sk-site');
      wrap.appendChild(el('div', 'sk sks-hero'));
      wrap.appendChild(el('div', 'sk sks-sub'));
      const pills = el('div', 'sks-pills');
      for (let i = 0; i < 4; i += 1) pills.appendChild(el('div', 'sk sks-pill'));
      wrap.appendChild(pills);
      const grid = el('div', 'sks-grid');
      for (let i = 0; i < 3; i += 1) grid.appendChild(el('div', 'sk sks-tile'));
      wrap.appendChild(grid);
      return wrap;
    }
    const KIND = { tree, card, timeline, graph, site };
    /** 造一块骨架。kind: tree|card|timeline|graph|site */
    function make(kind, options) {
      const factory = KIND[kind] || card;
      const node = factory((options || {}).rows);
      node.dataset.skeleton = kind;
      // 延迟显示：400ms 内还没好才浮出来，免得"闪一下就没了"
      node.classList.add('xp-skel-wait');
      return node;
    }
    /** 把某个容器填成骨架（先清空），返回一个"摘掉骨架"的函数。
     *
     * 延迟 400ms 才显示（`xp-skel-wait`），而一旦显示出来，
     * **最短停 300ms**再撤——不然 400~700ms 返回的请求会让骨架闪一下，
     * 比不显示还难看。 */
    function fill(host, kind, options) {
      if (!host) return () => {};
      const node = make(kind, options);
      host.appendChild(node);
      const shownAt = performance.now();
      let visibleAt = 0;
      // 真露过脸才开始计时（没露脸就无所谓最短显示）
      requestAnimationFrame(() => requestAnimationFrame(() => { visibleAt = performance.now(); }));
      let done = false;
      return () => {
        if (done) return;
        done = true;
        if (!node.isConnected) return;
        const start = visibleAt || shownAt;
        const elapsed = performance.now() - start;
        const wait = visibleAt ? Math.max(0, 300 - elapsed) : 0;
        if (wait > 0) setTimeout(() => node.remove(), wait);
        else node.remove();
      };
    }
    return { make, fill };
  })();

  /* ======================================================================
     标签页切换的三段动效
     ----------------------------------------------------------------------
     扫描线遮罩 / 水平交叠 / 面板挤压。全部走 Web Animations API：
       · 只有"用户真的切了标签页"那一次才触发（业务侧显式调用）
       · WAAPI 不写进 computed style，renderPanels() 重建也不会重放
     ====================================================================== */
  const switchFx = (function () {
    const SWEEP_MS = 250;
    const SLIDE_MS = 300;

    function sweepHost() {
      let node = $('#xpSweep');
      if (node && node.isConnected) return node;
      const workspace = $('.workspace') || document.body;
      node = el('div');
      node.id = 'xpSweep';
      node.setAttribute('aria-hidden', 'true');
      workspace.appendChild(node);
      return node;
    }
    /** 一条 2px 翠绿线从上往下扫过编辑区 */
    function sweep() {
      if (reduced()) return;
      const host = sweepHost();
      const height = host.getBoundingClientRect().height || 600;
      host.style.setProperty('--xp-sweep-h', `${Math.round(height)}px`);
      host.classList.remove('is-on');
      void host.offsetWidth;
      host.classList.add('is-on');
      setTimeout(() => host.classList.remove('is-on'), SWEEP_MS + 80);
    }
    /** 旧内容向左淡出、新内容从右淡入。只位移 20px，且只动编辑区。 */
    function overlap(body, direction) {
      if (reduced() || !body || typeof body.animate !== 'function') return null;
      const from = direction === 'back' ? -20 : 20;
      // 编排：进场这一侧 200ms + **延迟 50ms**（旧的先动，新的再跟上来）
      return body.animate(
        [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 200, delay: 50, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      );
    }

    /** 共享元素（核心动效）：名字**直接**飞到编辑区，落成那一篇的标题。
     *
     *  起点可以是：左侧文档树的某一行 / 命令面板（含搜索结果）的某一条 / 标签栏的某个标签。
     *  一段直达，中间不在标签栏停留（停留会显得啰嗦）。
     *
     *  三条原则：字号平滑变大 + 颜色变翠绿 + 飞行时带一层光。
     *  让它"真的看得见"的几个细节：
     *    · 全程几乎不透明，只在最后 12% 交还给真标题——眼睛跟的是一个连续的东西；
     *    · 起点那个名字先让开（workspace.js 的 startFlyAway 打 .is-fly-away），
     *      否则屏幕上同时有两份名字；
     *    · 半程就转绿、亮起来，而不是到终点才变（那会儿已经淡出了）；
     *    · 数据是异步来的，标题可能还没画出来——先在起点等一会儿（最多 1.2s）再飞。
     *
     *  用 WAAPI 手写而不是 View Transitions API：过渡期间那层快照在 Chrome 里吞点击，
     *  而文档树 / 标签栏 / 命令面板都是高频点击的地方。幽灵 pointer-events: none。
     */
    function nameFlight(flight, title) {
      if (reduced() || !flight || !flight.rect) return false;
      const startRect = flight.rect;
      const startColor = flight.color || '#cfcbc4';
      const ghost = document.createElement('div');
      ghost.className = 'xp-fly';
      ghost.textContent = flight.text;
      ghost.style.left = `${startRect.left}px`;
      ghost.style.top = `${startRect.top}px`;
      ghost.style.fontSize = `${flight.font}px`;
      ghost.style.color = startColor;
      document.body.appendChild(ghost);

      const restore = () => {
        document.querySelectorAll('.is-fly-away').forEach((node) => node.classList.remove('is-fly-away'));
      };
      const done = () => { ghost.remove(); restore(); };
      if (typeof ghost.animate !== 'function') { done(); return false; }

      const flyTo = (target, box) => {
        const toFont = parseFloat(getComputedStyle(target).fontSize) || 20;
        const scale = Math.max(1, toFont / Math.max(1, flight.font));
        const baseY = startRect.top + startRect.height / 2;
        const dx = box.left - startRect.left;
        const dy = (box.top + box.height / 2) - baseY;
        // 远一点的飞行稍微久一点（跨半屏和跨两行的观感不该一样）
        const span = Math.sqrt(dx * dx + dy * dy);
        const duration = Math.min(560, Math.max(380, Math.round(span * 0.95)));
        const hop = (fraction) => ({
          transform: `translate(${dx * fraction}px, ${dy * fraction}px) scale(${1 + (scale - 1) * fraction})`,
        });
        ghost.animate([
          { ...hop(0), opacity: 1, color: startColor, textShadow: '0 0 0 rgba(61, 220, 151, 0)' },
          { ...hop(0.55), opacity: 1, color: '#9fe9c6', textShadow: '0 0 14px rgba(61, 220, 151, 0.65)' },
          { ...hop(0.88), opacity: 1, color: '#3ddc97', textShadow: '0 0 18px rgba(61, 220, 151, 0.5)' },
          { ...hop(1), opacity: 0, color: '#3ddc97', textShadow: '0 0 4px rgba(61, 220, 151, 0)' },
        ], { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' })
          .finished.then(done).catch(done);
        const reveal = target.animate(
          [{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 240, delay: Math.round(duration * 0.58), easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards' });
        reveal.finished.then(() => reveal.cancel()).catch(() => reveal.cancel());
      };

      const boxOf = title ? title.getBoundingClientRect() : null;
      if (boxOf && boxOf.width && boxOf.height) {
        flyTo(title, boxOf);
      } else {
        // 标题还没画出来（先显示的是骨架）：让幽灵停在起点等，标题一出现就飞
        let tries = 0;
        const waitForTitle = () => {
          tries += 1;
          const root = '.panel[data-panel="' + (flight.panel || 0) + '"] ';
          const fresh = document.querySelector(root + '.card-title, ' + root + 'h1, '
            + root + '.tl-title, ' + root + '.tool-title');
          const box = fresh ? fresh.getBoundingClientRect() : null;
          if (box && box.width && box.height) { flyTo(fresh, box); return; }
          if (tries > 30) { setTimeout(done, 140); return; }
          setTimeout(waitForTitle, 40);
        };
        setTimeout(waitForTitle, 40);
      }
      setTimeout(done, 1400 + 700);       // 兜底（含等标题的时间）
      return true;
    }

    /** 第 4 步：新内容**打字机式**快速显现。
     *
     *  从上到下挨个"擦"出来——左边先出现、往右铺开（clip-path 从左往右推），
     *  像正在被逐字写出来，但比真逐字快得多，也不动 DOM（内容照样可选中、可编辑）。
     *  图片也一样擦，看起来像正在加载。 */
    function typeReveal(host, skipTitle) {
      if (reduced() || !host || typeof host.querySelectorAll !== 'function') return 0;
      const selector = '.card-title, .badges, .attr-row, .prose > *, .block, .media-card, '
        + '.tl-title, .tool-title, .hint';
      const nodes = Array.prototype.slice.call(host.querySelectorAll(selector))
        .filter((node) => {
          if (node.dataset.retired) return false;
          // 名字正飞进来时，标题那一下交给飞行（它管着标题的透明度），别两边抢
          if (skipTitle && node.matches('.card-title, .tl-title, .tool-title, h1')) return false;
          const box = node.getBoundingClientRect();
          return box.width > 4 && box.height > 4;
        })
        .slice(0, 16);
      if (!nodes.length) return 0;
      let longest = 0;
      nodes.forEach((node, index) => {
        const delay = index * 24;
        longest = Math.max(longest, delay + 170);
        const animation = node.animate([
          { clipPath: 'inset(0 100% 0 0)', opacity: 0.35 },
          { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        ], { duration: 170, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
        animation.finished.then(() => animation.cancel()).catch(() => animation.cancel());
      });
      return longest;
    }

    /** 第 6 步：左侧树里对应的那一行脉冲一下 1.0 → 1.02 → 1.0（300ms）。 */
    function treePulse(docId) {
      if (reduced() || !docId) return;
      const row = document.querySelector(`#sbTree .row[data-id="${docId}"]`);
      if (!row || typeof row.animate !== 'function') return;
      row.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
        { duration: 300, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)' },
      );
    }
    /** 标题"落地"的那一下：一束翠绿的光收进标题里。
     *
     *  为什么不用 View Transition 做这件事：过渡期间那一层快照在 Chrome 里
     *  **不可穿透**（实测整段 elementFromPoint 都返回 <html>，pointer-events: none
     *  也拦不住），点得勤一点就会丢点击——文档树恰恰是高频率点击的地方。
     *  所以工作区里换成这个不挡任何输入的版本；只读站点那边是跨页跳转，
     *  冻结几百毫秒无所谓，仍然用真正的共享元素过渡。 */
    function titleArrive(node) {
      if (reduced() || !node || typeof node.animate !== 'function') return null;
      const ink = getComputedStyle(node).color;
      return node.animate([
        { opacity: 0.25, translate: '0 -6px', color: 'rgb(61, 220, 151)', textShadow: '0 0 12px rgba(61, 220, 151, 0.85)' },
        { opacity: 1, translate: '0 0', color: ink, textShadow: '0 0 0 rgba(61, 220, 151, 0)' },
      ], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    /** 标签页关闭：宽度收到 0 再移除 */
    function collapse(node, done) {
      if (!node || reduced() || typeof node.animate !== 'function') { if (done) done(); return; }
      const width = node.getBoundingClientRect().width;
      const animation = node.animate(
        [{ width: `${width}px`, opacity: 1 }, { width: '0px', opacity: 0 }],
        { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },   // 250ms
      );
      animation.finished.then(() => { if (done) done(); }).catch(() => { if (done) done(); });
    }
    return { sweep, overlap, collapse, titleArrive, treePulse,
             nameFlight, typeReveal };
  })();

  /* ======================================================================
     过渡编排：有 View Transitions 就用它，没有就直接改
     ====================================================================== */
  function withTransition(update, options) {
    const can = document.startViewTransition && !reduced()
      && !(options && options.skip);
    if (!can) { update(); return Promise.resolve(); }
    const transition = document.startViewTransition(update);
    return transition.finished.catch(() => {});
  }

  /** 把某个元素的共享名字临时打开（文档树 → 编辑区的标题飞行） */
  function shareAs(node, name, run) {
    if (!node || !document.startViewTransition || reduced()) { run(); return Promise.resolve(); }
    const previous = node.style.viewTransitionName;
    node.style.viewTransitionName = name;
    return withTransition(run).then(() => { node.style.viewTransitionName = previous; });
  }

  /* ======================================================================
     分级 Toast
     ----------------------------------------------------------------------
     [OK] 翠绿 / [WARN] 琥珀 / [ERR] 红；成功 3s、警告 5s、错误不自动消失；
     最多同时 3 条；可带一个「撤销」动作。首条复用 #toast（它已经接好了
     polish.css 的进出场与底部剩余时间线），多出来的进 #toastStack。
     ====================================================================== */
  const toast = (function () {
    const KIND = {
      ok: { mark: '[OK]', ms: 3000 },
      warn: { mark: '[WARN]', ms: 5000 },
      err: { mark: '[ERR]', ms: 0 },
      info: { mark: '[..]', ms: 3000 },
    };
    const FAIL_WORDS = /失败|没能|不能|错误|打不开|挂了|不存在|无权限|被拒绝|冲突/;
    const WARN_WORDS = /没有|还没|已经|请先|仅|无法撤销|空/;
    const live = [];

    function guessKind(message) {
      const text = String(message || '');
      if (FAIL_WORDS.test(text)) return 'err';
      if (WARN_WORDS.test(text)) return 'warn';
      return 'ok';
    }
    function stack() {
      let node = $('#toastStack');
      if (!node) {
        node = el('div', 'toast-stack');
        node.id = 'toastStack';
        document.body.appendChild(node);
      }
      // 首条提示还是模板里那个 #toast（polish.css 的进出场接在它身上），
      // 只是把它挪进栈里，这样多条提示是叠起来而不是互相盖住。
      const first = $('#toast');
      if (first && first.parentNode !== node) node.appendChild(first);
      return node;
    }
    function buildBox() {
      let node = $('#toast');
      const free = node && node.hidden && !node.dataset.busy;
      if (free) { stack(); return node; }
      if (!node) {
        node = el('div', 'toast');
        node.id = 'toast';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        stack().appendChild(node);
        return node;
      }
      const clone = el('div', 'toast');
      clone.setAttribute('role', 'status');
      clone.setAttribute('aria-live', 'polite');
      stack().appendChild(clone);
      return clone;
    }
    function dismiss(box) {
      if (!box) return;
      box.dataset.busy = '';
      box.hidden = true;
      const index = live.indexOf(box);
      if (index >= 0) live.splice(index, 1);
      if (box.id !== 'toast') setTimeout(() => box.remove(), 400);
    }
    /**
     * 弹一条提示。
     * @param {string} message 文案
     * @param {number|object} options 毫秒数（老签名）或 { kind, ms, action, actionLabel }
     */
    function show(message, options) {
      const opts = typeof options === 'number' ? { ms: options } : (options || {});
      const kind = opts.kind || guessKind(message);
      const meta = KIND[kind] || KIND.ok;
      const box = buildBox();
      box.textContent = '';
      box.dataset.kind = kind;
      box.dataset.busy = '1';
      box.hidden = false;

      const mark = el('span', 'toast-ic', meta.mark);
      mark.setAttribute('aria-hidden', 'true');
      const text = el('span', 'toast-text', message);
      if (box.id === 'toast') text.id = 'toastText';
      box.appendChild(mark);
      box.appendChild(text);
      if (opts.action) {
        const act = el('button', 'toast-act', opts.actionLabel || '撤销');
        act.type = 'button';
        act.addEventListener('click', () => {
          dismiss(box);
          try { opts.action(); } catch (error) { /* 撤销自己炸了不该再弹一条 */ }
        });
        box.appendChild(act);
      }
      const ms = opts.ms != null ? opts.ms : meta.ms;
      // 底部剩余时间线（polish.css）按真实时长走
      box.style.setProperty('--pf-toast-ms', `${ms || 6000}ms`);
      if (box.id === 'toast' && ms === 0) box.style.setProperty('--pf-toast-ms', '6000ms');

      // 最多 3 条：超出的先把最老的收掉
      live.push(box);
      while (live.length > 3) dismiss(live[0]);

      clearTimeout(box._timer);
      if (ms > 0) box._timer = setTimeout(() => dismiss(box), ms);
      return { dismiss: () => dismiss(box) };
    }
    return { show, dismiss, guessKind };
  })();

  // 兼容满地的 toast('…', 1900) 调用：签名一致，另多了 kind / action
  window.toast = function patchedToast(message, options) { return toast.show(message, options); };

  /* ======================================================================
     离线模式：徽标 + 待同步计数
     ====================================================================== */
  const offline = (function () {
    /* 断网时写失败的操作先压本地，联网后按顺序补写。
       它统计的是真正失败落底的写操作（而不是"在飞的请求数"），断网时改动不会丢。 */
    const QUEUE_KEY = 'opus.queue';
    const MAX_ENTRIES = 200;
    const MAX_BODY = 200000;                 // 单条改动别超过 ~200KB，超了不排队
    let badge = null;
    let queue = 0;
    let wasOffline = !navigator.onLine;
    let draining = false;

    function read() {
      try {
        const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (error) { return []; }
    }
    function write(list) {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list)); } catch (error) { /* 满了就算了 */ }
      queue = list.length;
      sync();
    }
    /** 排队一条写操作（只在网络层失败时调用）。 */
    function enqueue(entry) {
      if (!entry || !entry.path || !entry.method) return false;
      let body = entry.body;
      try { body = body === undefined ? undefined : JSON.parse(JSON.stringify(body)); } catch (error) { return false; }
      const size = body === undefined ? 0 : JSON.stringify(body).length;
      if (size > MAX_BODY) return false;
      const list = read();
      // 同一份文档的连续修改只留最后一条（前面那条会被覆盖，没必要补写两次）
      const key = `${entry.method} ${entry.path}`;
      const kept = list.filter((item) => `${item.method} ${item.path}` !== key);
      kept.push({ path: entry.path, method: entry.method, body, key, at: Date.now() });
      write(kept.slice(-MAX_ENTRIES));
      return true;
    }

    function node() {
      if (badge && badge.isConnected) return badge;
      const host = $('.tb-right') || $('.nav-links') || document.body;
      badge = el('span', 'offline-badge');
      badge.id = 'offlineBadge';
      badge.appendChild(el('i'));
      badge.appendChild(el('span', null, '离线模式'));
      badge.hidden = true;
      host.appendChild(badge);
      return badge;
    }
    function sync() {
      const box = node();
      box.hidden = navigator.onLine && queue === 0;
      if (queue > 0) {
        box.lastChild.textContent = navigator.onLine
          ? `${queue} 个操作待同步`
          : `离线模式 · ${queue} 个操作待同步`;
        box.dataset.pending = String(queue);
      } else {
        box.lastChild.textContent = navigator.onLine ? '正在同步…' : '离线模式';
        delete box.dataset.pending;
      }
    }

    /** 按顺序补写：网络又断了就停下留着；4xx 说明这条服务端不认，丢掉并说一声。 */
    async function drain() {
      if (draining || !navigator.onLine) return { done: 0, left: read().length };
      const list = read();
      if (!list.length) { sync(); return { done: 0, left: 0 }; }
      draining = true;
      let done = 0;
      let rejected = 0;
      let conflicts = 0;
      for (const entry of list) {
        let response = null;
        try {
          response = await fetch(entry.path, {
            method: entry.method,
            headers: entry.body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
          });
        } catch (error) {
          break;                                     // 还是没网：剩下的留着
        }
        const current = read().filter((item) => item.key !== entry.key);
        write(current);
        if (response.ok) { done += 1; continue; }
        if (response.status === 409) {
          conflicts += 1;
          let payload = null;
          try { payload = await response.json(); } catch (error) { payload = null; }
          // 交给界面问用户（保留我的 / 采用服务端）
          document.dispatchEvent(new CustomEvent('opus:conflict', {
            detail: { payload, retry: { path: entry.path, method: entry.method, body: entry.body } },
          }));
          continue;
        }
        if (response.status >= 500) {                // 服务端的锅：留着下次再试
          write(read().concat([entry]));
          break;
        }
        rejected += 1;
      }
      draining = false;
      sync();
      if (done) toast.show(`补写完成：${done} 个操作已经写回去了`, { kind: 'ok' });
      if (rejected) toast.show(`${rejected} 个操作服务端没接受，已经跳过`, { kind: 'warn', ms: 5000 });
      if (conflicts) toast.show('有离线改动和别人冲突了，请看弹窗选择保留哪一版', { kind: 'warn', ms: 5000 });
      document.dispatchEvent(new CustomEvent('opus:synced', { detail: { done, rejected, conflicts } }));
      return { done, left: read().length };
    }

    window.addEventListener('online', () => {
      sync();
      if (wasOffline) {
        toast.show('网络恢复了，正在同步…', { kind: 'ok' });
        document.dispatchEvent(new CustomEvent('opus:online'));
      }
      wasOffline = false;
      drain();
    });
    window.addEventListener('offline', () => {
      wasOffline = true;
      sync();
      toast.show('网络断了，改动会先存在本地', { kind: 'warn' });
    });
    // 启动时先把上次没写完的接着写
    if (navigator.onLine) setTimeout(() => drain(), 1200);
    queue = read().length;
    sync();
    return {
      get queued() { return queue; },
      set queued(count) { queue = Math.max(0, count | 0); sync(); },
      refresh: sync,
      enqueue,
      drain,
      get entries() { return read(); },
    };
  })();

  /* ======================================================================
     Service Worker：离线也打得开（版本化静态资源 cache-first，
     HTML network-first，/api/* 完全不碰）
     ----------------------------------------------------------------------
     默认**只在部署环境**注册（模板上的 data-sw="1"，由 SW_ENABLED 决定）；
     开发机上开着它，探针看到的可能就不是刚改的代码了。
     `?nosw=1` 可以按这一次访问强制关掉。
     ====================================================================== */
  (function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const params = new URLSearchParams(location.search);
    if (params.get('nosw') === '1') return;
    const allowed = document.body.dataset.sw === '1'
      || params.get('sw') === '1'
      || params.get('sw') === 'true';
    if (!allowed) return;
    // 只在安全上下文（https / localhost）注册——别的地方浏览器自己也会拒
    if (!window.isSecureContext) return;
    window.addEventListener('load', () => {
      // 从根路径注册：/static/sw.js 的作用域最大只到 /static/
      const url = `/sw.js?v=${encodeURIComponent(document.body.dataset.swVersion || '1')}`;
      navigator.serviceWorker.register(url, { scope: '/' })
        .then((registration) => { window.__swRegistered = true; void registration; })
        .catch(() => { window.__swFailed = true; });
    });
  })();

  /* ======================================================================
     TTI：首屏"真的能用了"的时间
     ----------------------------------------------------------------------
     口径写在明处：**首屏画完（opus:booted）之后，主线程连续 500ms 没有超过
     50ms 的长任务**，那一刻算可交互。用 PerformanceObserver 盯 longtask，
     结果挂在 window.__tti 上给探针读（也顺手在控制台留一条 [perf]）。
     ====================================================================== */
  (function tti() {
    let bootedAt = 0;
    let lastLongTaskAt = 0;
    let settledAt = 0;
    try {
      if (typeof PerformanceObserver === 'function') {
        new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => { lastLongTaskAt = entry.startTime + entry.duration; });
        }).observe({ entryTypes: ['longtask'] });
      }
    } catch (error) { /* 不支持就算了 */ }

    const settleCheck = () => {
      if (!bootedAt || settledAt) return;
      const now = performance.now();
      if (now - Math.max(bootedAt, lastLongTaskAt) >= 500) {
        settledAt = now;
        window.__tti = Math.round(settledAt);
        try { console.debug(`[perf] TTI ≈ ${window.__tti}ms`); } catch (error) { /* 忽略 */ }
        return;
      }
      setTimeout(settleCheck, 120);
    };
    document.addEventListener('opus:booted', () => {
      bootedAt = performance.now();
      setTimeout(settleCheck, 120);
    }, { once: true });
    // 兜底：8 秒还没"静下来"就按当前时间记一笔，别让探针永远等
    setTimeout(() => {
      if (!settledAt) {
        settledAt = performance.now();
        window.__tti = Math.round(settledAt);
      }
    }, 8000);
  })();

  /* ======================================================================
     捏合缩放：给画布类界面用（地图 / 关系树 / 时间线）
     ----------------------------------------------------------------------
     两根手指按下 -> 按两指距离的比例缩放，围绕两指中点。
     单指仍然走各自的平移逻辑（这里只在第二根手指落下后才接管）。
     ====================================================================== */
  function pinch(host, options) {
    if (!host || typeof host.addEventListener !== 'function') return () => {};
    const opts = options || {};
    const getScale = opts.getScale || (() => 1);
    const onScale = opts.onScale || (() => {});
    const limit = opts.limit || ((value) => value);
    const points = new Map();
    let startDistance = 0;
    let startScale = 1;

    const distance = () => {
      const list = Array.from(points.values());
      if (list.length < 2) return 0;
      return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    };
    const middle = () => {
      const list = Array.from(points.values());
      if (list.length < 2) return null;
      return { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
    };

    const down = (event) => {
      if (event.pointerType && event.pointerType !== 'touch') return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size === 2) {
        startDistance = distance();
        startScale = getScale();
      }
    };
    const move = (event) => {
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size !== 2 || !startDistance) return;
      const ratio = distance() / startDistance;
      onScale(limit(startScale * ratio), middle());
      if (event.cancelable) event.preventDefault();
    };
    const end = (event) => {
      points.delete(event.pointerId);
      if (points.size < 2) startDistance = 0;
    };
    // **捕获阶段**监听：卡片 / 节点自己会 stopPropagation（它们要处理拖动和点击），
    // 冒泡阶段收不到两指落下，捏合就永远不触发。捕获阶段谁也拦不住。
    const optsCapture = { capture: true, passive: true };
    host.addEventListener('pointerdown', down, optsCapture);
    host.addEventListener('pointermove', move, { capture: true, passive: false });
    host.addEventListener('pointerup', end, optsCapture);
    host.addEventListener('pointercancel', end, optsCapture);
    return () => {
      host.removeEventListener('pointerdown', down, true);
      host.removeEventListener('pointermove', move, true);
      host.removeEventListener('pointerup', end, true);
      host.removeEventListener('pointercancel', end, true);
    };
  }

  /* ======================================================================
     exit intent：只读站点首页 / 纪元页，每会话一次，"追更"提示
     ----------------------------------------------------------------------
     设计里写的是"订阅提示"。这个应用没有邮件订阅，所以给它一个**真能订阅**的
     东西：站点的 RSS（/s/<slug>/feed.xml）。提示里还能直接复制链接。
     只在鼠标从**顶部**离开窗口时触发，且一个会话只出现一次。
     ====================================================================== */
  (function exitIntent() {
    if (SURFACE !== 'site') return;
    if (document.body.classList.contains('is-embed')) return;
    const path = location.pathname.replace(/\/+$/, '');
    const isHome = /^\/s\/[^/]+$/.test(path);
    const isEra = /^\/s\/[^/]+\/era\/\d+$/.test(path);
    if (!isHome && !isEra) return;                       // 只在首页与纪元页
    if (document.body.classList.contains('is-gated')) return;
    const KEY = 'opus.exitIntent';
    try { if (sessionStorage.getItem(KEY)) return; } catch (error) { return; }

    let shown = false;
    function show() {
      if (shown) return;
      shown = true;
      try { sessionStorage.setItem(KEY, '1'); } catch (error) { /* 忽略 */ }
      const slug = (location.pathname.split('/')[2] || '');
      const feedUrl = `${location.origin}/s/${slug}/feed.xml`;
      const card = el('div', 'exit-intent');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', '追更这个世界的更新');
      card.appendChild(el('b', null, '要追这个世界的更新吗？'));
      card.appendChild(el('p', null, '把站点加进阅读器，之后每次发布都会出现在那里。'));
      const actions = el('div', 'ei-actions');
      const feed = el('a', 'mini-btn is-primary', '订阅 RSS');
      feed.href = feedUrl;
      feed.target = '_blank';
      feed.rel = 'noopener';
      actions.appendChild(feed);
      const copy = el('button', 'mini-btn', '复制站点链接');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.origin + location.pathname);
          toast.show('站点链接已复制', { kind: 'ok' });
        } catch (error) {
          toast.show('复制失败，直接选中地址栏吧', { kind: 'warn' });
        }
      });
      actions.appendChild(copy);
      const close = el('button', 'mini-btn', '不用了');
      close.type = 'button';
      close.addEventListener('click', () => card.remove());
      actions.appendChild(close);
      card.appendChild(actions);
      document.body.appendChild(card);
      // 键盘用户：焦点进第一个动作，Esc 关掉
      const first = card.querySelector('a, button');
      if (first) first.focus();
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') card.remove();
      });
      setTimeout(() => { if (card.isConnected) card.remove(); }, 30000);
    }

    document.addEventListener('mouseout', (event) => {
      if (event.clientY > 4) return;                     // 只认从顶部离开
      if (event.relatedTarget || event.toElement) return;
      show();
    });
    // 触屏没有鼠标离开：滚到页面底部也算"要走了"
    window.addEventListener('scroll', () => {
      const nearBottom = window.scrollY + window.innerHeight > document.body.scrollHeight - 120;
      if (nearBottom) show();
    }, { passive: true });
  })();

  /* ======================================================================
     会话超时：到期前提醒续期，而不是让人敲到一半被踢回登录页
     ====================================================================== */
  const session = (function () {
    const WARN_MS = 5 * 60 * 1000;          // 剩 5 分钟开始提醒
    let bar = null;
    let expiresAt = null;
    let timer = 0;
    let renewing = false;
    let dismissed = false;

    function fmt(ms) {
      const minutes = Math.max(1, Math.round(ms / 60000));
      return minutes >= 60 ? `${Math.round(minutes / 60)} 小时` : `${minutes} 分钟`;
    }

    function hide() {
      if (bar) bar.remove();
      bar = null;
    }

    function show(text, actionLabel, onAction) {
      if (bar) bar.remove();
      bar = el('div', 'session-bar');
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.appendChild(el('span', 'sb-text', text));
      if (actionLabel) {
        const act = el('button', 'sb-action', actionLabel);
        act.type = 'button';
        act.addEventListener('click', onAction);
        bar.appendChild(act);
      }
      const close = el('button', 'sb-close', '知道了');
      close.type = 'button';
      close.addEventListener('click', () => { dismissed = true; hide(); });
      bar.appendChild(close);
      document.body.appendChild(bar);
    }

    async function renew() {
      if (renewing) return;
      renewing = true;
      try {
        const response = await fetch('/api/world/auth/renew', { method: 'POST' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error((payload && payload.error) || '续期失败');
        expiresAt = payload && payload.session_expires_at ? new Date(payload.session_expires_at).getTime() : null;
        dismissed = false;
        hide();
        toast.show('会话已经续上了', { kind: 'ok' });
        schedule();
      } catch (error) {
        show('续期没成功，可能已经过期了——重新登录一下最稳。', '去登录', () => { location.href = '/login'; });
      } finally {
        renewing = false;
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (!expiresAt) return;
      const left = expiresAt - Date.now();
      if (left <= 0) {
        show('会话已过期，重新登录后接着写。', '去登录', () => { location.href = '/login'; });
        return;
      }
      if (left > WARN_MS) {
        timer = setTimeout(schedule, left - WARN_MS);
        return;
      }
      if (dismissed) { timer = setTimeout(schedule, 60000); return; }
      show(`会话还有约 ${fmt(left)} 到期，点一下续期就不用重新登录。`, '续期', renew);
      timer = setTimeout(schedule, 30000);
    }

    /** 界面层每次拿到 auth/me / state 都喂进来（ISO 字符串或整个 payload 都收）。 */
    function check(input) {
      const raw = typeof input === 'string' ? input : (input && input.session_expires_at);
      expiresAt = raw ? new Date(raw).getTime() : null;
      dismissed = false;
      if (!expiresAt || Number.isNaN(expiresAt)) { hide(); return; }
      schedule();
    }

    /** 401/403：会话真的没了。 */
    function expired() {
      clearTimeout(timer);
      show('会话已过期，重新登录后接着写。', '去登录', () => { location.href = '/login'; });
    }

    return { check, renew, expired, get expiresAt() { return expiresAt; } };
  })();

  /* 输入方式：键盘用户导航后要把焦点送到主标题，鼠标用户别抢焦点。 */
  let inputMode = 'pointer';
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey
        || ['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      inputMode = 'keyboard';
    }
  }, true);
  document.addEventListener('pointerdown', () => { inputMode = 'pointer'; }, true);

  /* ======================================================================
     离开 / 退出：pagehide + beacon，不碰 unload（保 bfcache）
     ====================================================================== */
  (function leave() {
    let dirty = false;
    const markDirty = () => { dirty = true; };
    const markClean = () => { dirty = false; };
    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });
    document.addEventListener('opus:dirty', markDirty);
    document.addEventListener('opus:saved', markClean);
    // 网络断了导致的写失败：改动还在页面上，先说清楚"没丢"，别让每个失败的请求都弹一条
    let warned = false;
    document.addEventListener('opus:offline-write', () => {
      markDirty();
      if (warned) return;
      warned = true;
      toast.show(offline.queued > 0
        ? '网络断了：这一步已经记在本地，联网后自动写回去'
        : '这一步没发出去，改动还在页面上；网络回来再试一次', { kind: 'warn', ms: 5000 });
      setTimeout(() => { warned = false; }, 8000);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      // 视图状态留给下一次进入（bfcache 回来时用得着）
      try {
        const view = {};
        const active = document.querySelector('.panel.is-active, .panel');
        if (active) {
          const body = active.querySelector('.panel-body');
          if (body) view.scroll = body.scrollTop;
        }
        sessionStorage.setItem('opus.view', JSON.stringify({ hash: location.hash, view }));
      } catch (error) { /* 存不下就算了 */ }
      document.querySelectorAll('audio, video').forEach((media) => {
        if (!media.paused) { media.dataset.opusPaused = '1'; media.pause(); }
      });
    });
    window.addEventListener('pagehide', () => {
      // 不是"上报一个假指标"：这一下真的把自己从在线名单里摘掉，
      // 否则要等 60 秒的在线窗口过期，别人才看到你下线。
      if (document.body && !document.body.classList.contains('is-embed') && $('#presence')) {
        const payload = JSON.stringify({ leaving: true, path: location.pathname });
        if (navigator.sendBeacon) {
          try { navigator.sendBeacon('/api/world/presence', new Blob([payload], { type: 'application/json' })); }
          catch (error) { /* 上报失败不该影响离开 */ }
        }
      }
    });
  })();

  /* ======================================================================
     焦点管理：过渡结束后把焦点送到主标题，浮层关掉后还给触发元素
     ====================================================================== */
  function focusMain() {
    const main = $('#panels .panel-body h1, .site main h1, main h1');
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    try { main.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ }
  }

  /** 简易焦点陷阱：给浮层用（模态框自己那份在 workspace.js 里） */
  function trapFocus(container) {
    if (!container) return () => {};
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea,'
      + ' [tabindex]:not([tabindex="-1"])';
    const onKey = (event) => {
      if (event.key !== 'Tab') return;
      const items = $$(selector, container).filter((node) => node.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKey);
    return () => container.removeEventListener('keydown', onKey);
  }

  /** 屏幕阅读器播报（工作区里已经有 #srStatus，没有就造一个） */
  function announce(message, urgent) {
    let node = $('#srStatus');
    if (!node) {
      node = el('div', 'sr-only xp-sr-only');
      node.id = 'srStatus';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
      document.body.appendChild(node);
    }
    node.textContent = '';
    setTimeout(() => { node.textContent = message; }, 30);
  }

  /* ======================================================================
     通知中心
     ----------------------------------------------------------------------
     顶栏铃铛：有未读就挂一个 badge，点开是一份"最近发生的事"。
     数据来自 /api/world/activity（发布记录 / 版本快照 / 成员加入 / 邀请码），
     未读数按 localStorage 里记的"上次读到哪儿"算。
     ====================================================================== */
  const notice = (function () {
    const SEEN_KEY = 'opus.notice.seen';
    let button = null;
    let panel = null;
    let rows = [];
    let unread = 0;
    let loaded = false;

    function fmtWhen(iso) {
      if (!iso) return '';
      const then = new Date(iso);
      if (Number.isNaN(then.getTime())) return '';
      const diff = (Date.now() - then.getTime()) / 1000;
      if (diff < 60) return '刚刚';
      if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
      if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
      return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(then.getDate()).padStart(2, '0')}`;
    }
    function seenAt() {
      try { return localStorage.getItem(SEEN_KEY) || ''; } catch (error) { return ''; }
    }
    function markSeen() {
      const newest = rows.length ? (rows[0].when || '') : '';
      try { localStorage.setItem(SEEN_KEY, newest || new Date().toISOString()); } catch (error) { /* 忽略 */ }
      unread = 0;
      paintBadge();
    }
    function paintBadge() {
      if (!button) return;
      const badge = button.querySelector('.notice-badge');
      if (!badge) return;
      badge.hidden = unread <= 0;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      button.setAttribute('aria-label', unread ? `通知中心（${unread} 条未读）` : '通知中心');
    }
    function render() {
      if (!panel) return;
      panel.textContent = '';
      const head = el('div', 'notice-head');
      head.appendChild(el('span', null, '最近发生的事'));
      const mark = el('button', null, '全部标记已读');
      mark.type = 'button';
      mark.addEventListener('click', () => { markSeen(); render(); });
      head.appendChild(mark);
      panel.appendChild(head);
      if (!loaded) {
        panel.appendChild(skeleton.make('tree', { rows: 4 }));
        return;
      }
      if (!rows.length) {
        panel.appendChild(el('div', 'notice-empty', '还没有什么新鲜事。别人改了文档、发布了站点，这里会记一笔。'));
        return;
      }
      rows.forEach((row) => {
        const line = el('div', 'notice-row');
        const kind = el('span', 'notice-kind',
          { publish: '发布', edit: '改动', invite: '成员' }[row.kind] || '动态');
        kind.dataset.kind = row.kind || 'edit';
        line.appendChild(kind);
        const body = el('div', 'notice-body');
        body.appendChild(el('div', 'notice-what', row.what || ''));
        body.appendChild(el('div', 'notice-when', fmtWhen(row.when)));
        line.appendChild(body);
        if (row.doc) {
          line.style.cursor = 'pointer';
          line.addEventListener('click', () => {
            hide();
            if (typeof window.openDoc === 'function') window.openDoc(row.doc);
            else if (row.url) location.href = row.url;
          });
        } else if (row.url) {
          line.style.cursor = 'pointer';
          line.addEventListener('click', () => { hide(); location.href = row.url; });
        }
        panel.appendChild(line);
      });
    }
    async function load() {
      try {
        const response = await fetch('/api/world/activity', { credentials: 'same-origin' });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        rows = data.activity || [];
        const seen = seenAt();
        unread = rows.filter((row) => (row.when || '') > seen).length;
        loaded = true;
        paintBadge();
        render();
      } catch (error) {
        loaded = true;
        rows = [];
        render();
      }
    }
    function place() {
      if (!panel || !button) return;
      const rect = button.getBoundingClientRect();
      const width = panel.offsetWidth || 340;
      panel.style.top = `${Math.round(rect.bottom + 8)}px`;
      panel.style.left = `${Math.round(Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12))}px`;
    }
    function show() {
      if (!panel) return;
      panel.hidden = false;
      place();
      render();
      document.addEventListener('keydown', onKey);
      setTimeout(() => document.addEventListener('click', onOutside), 0);
    }
    function hide() {
      if (!panel) return;
      panel.hidden = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onOutside);
      if (unread > 0) { markSeen(); render(); }
    }
    function onKey(event) { if (event.key === 'Escape') hide(); }
    function onOutside(event) {
      if (panel.contains(event.target) || button.contains(event.target)) return;
      hide();
    }
    function mount() {
      const host = $('.tb-right');
      if (!host || $('#noticeBtn')) return false;
      // 只读嵌入（发布站点里嵌的画布）里顶栏整块是 display:none —— 挂上也看不见，
      // 却会在公开页面上打一次 401 的 /api/world/activity，还每 90 秒再来一次
      // （2026-10-15 体检实测：匿名嵌入页唯一的控制台报错就是它）。所以直接不挂。
      if (document.body.classList.contains('is-embed')) return false;
      button = el('button', 'tb-btn is-icon notice-btn');
      button.id = 'noticeBtn';
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', '通知中心');
      if (typeof icon === 'function') button.appendChild(icon('bell', 15));
      else button.textContent = '动态';
      const badge = el('span', 'notice-badge');
      badge.hidden = true;
      button.appendChild(badge);
      // 放在"谁在这里"前面：都是"关于这个世界正在发生什么"
      const presence = $('#presence');
      if (presence && presence.parentNode === host) host.insertBefore(button, presence);
      else host.insertBefore(button, host.firstChild);
      panel = el('div', 'notice-panel');
      panel.id = 'noticePanel';
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', '通知中心');
      document.body.appendChild(panel);
      panel.addEventListener('click', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = panel.hidden;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) { show(); if (!loaded) load(); } else { hide(); }
      });
      window.addEventListener('resize', () => { if (panel && !panel.hidden) place(); });
      return true;
    }
    return { mount, load, show, hide, get unread() { return unread; } };
  })();

  /* ======================================================================
     Popover / Tooltip
     ----------------------------------------------------------------------
     原生 title 要等一秒、还改不了样式；属性名旁的「?」、时间线节点的悬停卡
     都走这一条：鼠标进 / 键盘聚焦都出，离开就收。内容只放文本与 <b>。
     ====================================================================== */
  const tip = (function () {
    let node = null;
    let pending = null;
    function box() {
      if (node && node.isConnected) return node;
      node = el('div', 'xp-pop');
      node.hidden = true;
      node.setAttribute('role', 'tooltip');
      document.body.appendChild(node);
      return node;
    }
    function place(anchor) {
      const host = box();
      const rect = anchor.getBoundingClientRect();
      const width = host.offsetWidth || 220;
      const height = host.offsetHeight || 40;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
      let top = rect.top - height - 8;
      if (top < 8) top = rect.bottom + 8;
      host.style.left = `${Math.round(left)}px`;
      host.style.top = `${Math.round(top)}px`;
    }
    function hide() {
      clearTimeout(pending);
      if (node) node.hidden = true;
    }
    /** 给一个元素挂提示。text 可以是字符串或返回字符串的函数。 */
    function attach(anchor, text) {
      if (!anchor || !text) return;
      anchor.classList.add('xp-has-tip');
      const show = () => {
        clearTimeout(pending);
        pending = setTimeout(() => {
          const host = box();
          host.textContent = typeof text === 'function' ? text() : text;
          host.hidden = false;
          place(anchor);
        }, 120);
      };
      anchor.addEventListener('mouseenter', show);
      anchor.addEventListener('focus', show);
      anchor.addEventListener('mouseleave', hide);
      anchor.addEventListener('blur', hide);
      anchor.addEventListener('click', hide);
    }
    return attach;
  })();

  /* ======================================================================
     只读站点：卡片 → 详情的共享元素
     ----------------------------------------------------------------------
     跨文档过渡（@view-transition: navigation: auto）已经在 CSS 里，这里只负责
     在**被点的那一张**上临时挂名字：一页几十张卡片如果都叫 xp-title，
     浏览器会判定重名，整次过渡直接放弃。
     ====================================================================== */
  (function siteSharedElement() {
    if (!$('.site')) return;
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const tile = event.target.closest && event.target.closest('.tile, .hit');
      if (!tile) return;
      const link = tile.tagName === 'A' ? tile : tile.querySelector('a[href]');
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      const cover = tile.querySelector('.tile-cover');
      const name = tile.querySelector('.tile-name, .hit-name');
      if (cover) cover.style.viewTransitionName = 'xp-cover';
      if (name) name.style.viewTransitionName = 'xp-title';
      // 万一这次跳转没发生（预渲染失败 / 被拦下），别把名字留在页面上
      setTimeout(() => {
        if (cover) cover.style.viewTransitionName = '';
        if (name) name.style.viewTransitionName = '';
      }, 3000);
    }, true);
  })();

  /* ======================================================================
     跨文档共享元素：按"从哪儿来"决定接住哪个名字
     ----------------------------------------------------------------------
     站点文档页的标题**静态**挂的是 xp-title（站内 卡片→详情 那套用得上）。
     但如果是**从工作区**跳过来的，编辑区那边飞出去的是 xp-doc-title ——
     接不上名字，标题就只会淡一下。所以用 pagereveal 的 activation.from 判断来源，
     把新页面标题的名字临时改成对方飞过来的那个。
     ====================================================================== */
  function crossDocName(fromUrl) {
    let from = null;
    try { from = fromUrl ? new URL(fromUrl, location.href) : null; } catch (error) { from = null; }
    const fromWorkspace = Boolean(from && from.pathname.startsWith('/world'));
    const fromSite = Boolean(from && from.pathname.startsWith('/s/'));
    if (document.body && document.body.classList.contains('site')) {
      const title = $('.site .page-head h1, .site .doc-title');
      if (title && fromWorkspace) {
        title.style.viewTransitionName = 'xp-doc-title';
        return 'xp-doc-title';
      }
      return null;
    }
    // 反向：从站点回到工作区，接住站点的卡片标题
    const cardTitle = $('.panel[data-panel="0"] .card-title');
    if (cardTitle && fromSite) {
      cardTitle.style.viewTransitionName = 'xp-title';
      return 'xp-title';
    }
    return null;
  }
  window.addEventListener('pagereveal', (event) => {
    const from = event && event.activation && event.activation.from;
    crossDocName(from && from.url);
  });

  /* ======================================================================
     文档页目录锚点 + scrollspy
     ----------------------------------------------------------------------
     正文里的小标题够多才值得加目录；高亮用 IntersectionObserver，不监听滚动。
     ====================================================================== */
  (function pageToc() {
    const article = $('.site article.page');
    if (!article) return;
    const heads = $$('h2', article).filter((node) => node.textContent.trim()
      && !node.closest('.related') && !node.closest('.timeline-embed'));
    if (heads.length < 3) return;
    const nav = el('nav', 'page-toc');
    nav.setAttribute('aria-label', '这一页的目录');
    nav.appendChild(el('span', 'page-toc-title', '目录'));
    const links = [];
    heads.forEach((head, index) => {
      if (!head.id) head.id = `sec-${index + 1}`;
      const link = el('a', null, head.textContent.trim());
      link.href = `#${head.id}`;
      nav.appendChild(link);
      links.push({ link, head });
    });
    const head = $('.page-head', article);
    if (head && head.parentNode) head.parentNode.insertBefore(nav, head.nextSibling);
    else article.insertBefore(nav, article.firstChild);
    if (typeof IntersectionObserver !== 'function') return;
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const hit = links.find((item) => item.head === entry.target);
        if (!hit) return;
        links.forEach((item) => item.link.classList.toggle('is-on', item === hit));
      });
    }, { rootMargin: '-72px 0px -70% 0px', threshold: 0 });
    links.forEach((item) => spy.observe(item.head));
  })();

  /* ======================================================================
     移动端手势：只读站点左右滑动切换纪元
     ----------------------------------------------------------------------
     只认"横向明显大于纵向"的滑动，免得把正常的上下滚动吃掉；
     目标就是纪元页上那排 .era-switch 里的上/下一个。
     ====================================================================== */
  (function swipeEras() {
    const switcher = $('.site .era-switch');
    if (!switcher) return;
    const current = switcher.querySelector('.era-pill.is-on');
    if (!current) return;
    const pills = $$('.era-pill', switcher);
    const index = pills.indexOf(current);
    const target = { next: pills[index + 1], prev: pills[index - 1] };
    let start = null;
    document.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) { start = null; return; }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', (event) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = Date.now() - start.at < 700;
      start = null;
      if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
      const go = dx < 0 ? target.next : target.prev;
      if (!go) return;
      progress.start();
      location.href = go.href;
    }, { passive: true });
  })();

  /* ======================================================================
     对外接口
     ====================================================================== */
  window.Opus = {
    reduced,
    progress,
    splash,
    toast: toast.show,
    skeleton,
    switchFx,
    withTransition,
    shareAs,
    reveal,
    focusMain,
    inputMode: () => inputMode,
    session,
    pinch,
    crossDocName,
    trapFocus,
    announce,
    offline,
    notice,
    tip,
    store,
    version: 1,
  };

  /* ======================================================================
     自启动：哪些活儿不需要业务代码打招呼
     ====================================================================== */
  function autoStart() {
    document.documentElement.classList.add('xp-ready');
    if (SURFACE === 'site' || document.body.classList.contains('site')) {
      document.body.classList.add('xp-page-enter');
      setTimeout(() => document.body.classList.remove('xp-page-enter'), 520);
      $$('.site .section, .site .era-pill, .site .search-inline, .site .tile').forEach((node) => {
        node.dataset.reveal = '1';
      });
      reveal.collect(document);
    }
    // 工作区：启动屏一直留到程序加载完成——由 boot() 结束派发的 opus:booted 收掉
    document.addEventListener('opus:booted', () => splash.done());
    // 通知中心：只在有顶栏的页面上挂（工作区 / 关系树独立页）
    if (notice.mount()) {
      setTimeout(() => notice.load(), 1200);
      setInterval(() => notice.load(), 90000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }
})();
