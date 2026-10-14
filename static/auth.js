/* ==========================================================================
   auth.js  —  登录 / 注册 / setup 闸门页
   --------------------------------------------------------------------------
   这是「闸门页」（登录 / 注册 / 初始化）的前端增强脚本，负责把表单提交过程
   演成一段"世界线"动画。

   纪律（渐进增强）：
     · 本文件**只做增强**，不承担任何必需功能。它挂了，表单照常原生 POST。
     · 提交走原生 POST（不 fetch、不 JSON），CSRF 与错误回填都留给 Django。
       这里只做一件事：提交前播一段「校验中」，再用 requestSubmit() 放行同一个
       表单 —— 服务端渲染的错误页仍然会正常回来。
     · 口令框始终是真实的 <input type="password">；▮ 方块只是叠在上面的视觉
       镜像（pointer-events:none），密码管理器与读屏不受影响。

   视觉三层兜底：Canvas 2D 世界线 → 静态 SVG 世界线（模板里就有）→ 纯 CSS。
   不用 three.js：世界线是自绘的 2D 引擎，体积小、可降级。
   ========================================================================== */
(function () {
  'use strict';

  var shell = document.getElementById('authShell');
  if (!shell) return;

  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------------------------------------------------------- 配置 */
  var CFG = {
    HOLD_MS: 3200,           // 封锁态驻留
    MIN_VERIFY_MS: 460,      // 校验态最短驻留，避免「闪一下」
    VERIFY_SLOW_MS: 1500,    // 超过这个时间追加一行「仍在比对……」
    UNFOLD_MS: 1000,         // 授权后解绕 → 跳转
    PROBE_DEBOUNCE_MS: 420,  // 邀请码防抖
    LOG_MAX: 12,
    DOTS_GAP: 28             // 点阵间距
  };

  // 状态 → 允许的迁移；不在表里的转移直接忽略
  var NEXT = {
    sealed: { verifying: 1, denied: 1, notice: 1, granted: 1 },
    verifying: { denied: 1, notice: 1, granted: 1, sealed: 1 },
    denied: { sealed: 1 },
    notice: { sealed: 1 },
    granted: { unfold: 1 },
    unfold: {}
  };

  var MODE = shell.getAttribute('data-mode') || 'login';
  var hasError = shell.getAttribute('data-has-error') === '1';
  var rawError = shell.getAttribute('data-error') || '';
  var errVariant = classifyError(rawError);
  var state = shell.getAttribute('data-state') || 'sealed';
  var busy = false;
  var attempt = 0;

  /* ------------------------------------------------------------ 元素引用 */
  var el = {
    canvas: document.getElementById('authCanvas'),
    stage: document.getElementById('authStage'),
    core: document.getElementById('authCore'),
    sparks: document.getElementById('authSparks'),
    panel: document.getElementById('authPanel'),
    boot: document.getElementById('authBoot'),
    bootLines: document.getElementById('authBootLines'),
    engineTag: document.getElementById('authEngineTag'),
    stateChip: document.getElementById('authStateChip'),
    log: document.getElementById('authLog'),
    nameEl: document.getElementById('authName'),
    attempt: document.getElementById('authAttempt'),
    attemptTag: document.getElementById('authAttemptTag'),
    sessionChip: document.getElementById('authSessionChip'),
    elapsed: document.getElementById('authElapsed'),
    clockHM: document.getElementById('authClockHM'),
    clockSec: document.getElementById('authClockSec'),
    capZh: document.getElementById('authCapZh'),
    capEn: document.getElementById('authCapEn'),
    form: document.getElementById('authForm'),
    submit: document.getElementById('authSubmit'),
    submitLabel: document.querySelector('[data-submit-label]'),
    errorBox: document.getElementById('authError'),
    statusMsg: document.getElementById('authStatusMsg'),
    inviteHint: document.getElementById('authInviteHint'),
    invite: document.getElementById('id_invite'),
    verifyBar: document.getElementById('authVerifyBar'),
    verifyPct: document.getElementById('authVerifyPct'),
    warnL2: document.getElementById('authWarnL2'),
    copy: document.getElementById('authCopy')
  };

  var COPY = {};
  if (el.copy) {
    ['sealed', 'setup', 'register', 'verifying', 'denied', 'granted'].forEach(function (k) {
      COPY[k + '_zh'] = el.copy.getAttribute('data-' + k + '-zh') || '';
      COPY[k + '_en'] = el.copy.getAttribute('data-' + k + '-en') || '';
    });
  }

  var CHIP = {
    sealed: 'Sealed',
    verifying: 'Verifying',
    denied: 'Denied',
    notice: 'Notice',
    granted: 'Granted',
    unfold: 'Unfolding'
  };

  /* ======================================================================
     1. 文案变体：后端的中文错误 → 面板的英文副行
        与 world/views.py 的 _notice_variant() 同源，改文案要一起改。
     ====================================================================== */
  function classifyError(text) {
    var t = (text || '').trim();
    if (!t) return null;
    if (t.indexOf('邀请码') >= 0) {
      var invL2 = 'Invite Key Exhausted · Ask The Owner For A New One';
      if (t.indexOf('需要邀请码') >= 0) invL2 = 'Invite Key Required · Ask The Owner For A Code';
      else if (t.indexOf('不存在') >= 0) invL2 = 'Invite Key Rejected · This Code Does Not Exist';
      return { kind: 'denied', title: 'Warning', icon: '!', l1: 'Registration Halted',
               l2: invL2, l3: 'Returning To Access Portal' };
    }
    if (t.indexOf('用户名已经被用') >= 0) {
      return { kind: 'notice', title: 'Notice', icon: '#', l1: 'Registration Halted',
               l2: 'Username Already Claimed · Choose Another Identifier', l3: '' };
    }
    if (t.indexOf('用户名至少') === 0) {
      return { kind: 'notice', title: 'Notice', icon: '#', l1: 'Registration Halted',
               l2: 'Username Too Short · At Least 3 Characters', l3: '' };
    }
    if (!/用户名|或|口令/.test(t) && /密码|口令/.test(t)) {
      return { kind: 'notice', title: 'Notice', icon: '#', l1: 'Registration Halted',
               l2: 'Passphrase Too Weak · See Requirements', l3: '' };
    }
    return { kind: 'denied', title: 'Warning', icon: '!', l1: 'Authentication Failed',
             l2: 'Credentials Mismatch, Attempt 01 Logged', l3: 'Returning To Access Portal' };
  }

  function sealCopy(key) {
    if (MODE === 'setup') return COPY[key === 'zh' ? 'setup_zh' : 'setup_en'];
    if (MODE === 'register') return COPY[key === 'zh' ? 'register_zh' : 'register_en'];
    return COPY[key === 'zh' ? 'sealed_zh' : 'sealed_en'];
  }

  function setCaption(zh, en) {
    if (zh != null && el.capZh) el.capZh.textContent = zh;
    if (en != null && el.capEn) el.capEn.textContent = en;
  }

  function attemptText(text) {
    if (!text || attempt < 2) return text || '';
    return String(text).replace(/Attempt 0?\d+/g, 'Attempt ' + String(attempt).padStart(2, '0'));
  }

  /* ======================================================================
     2. 会话流水：失败不被抹掉，而是被归档
        登录失败是**真的一次页面跳转**（原生 POST），刷新就没了计数器。
        所以 ATTEMPT 与流水寄存在 sessionStorage：同一次会话里连续失败会累加，
        关掉标签页就清空。授权成功时清掉。
     ====================================================================== */
  var STORE_KEY = 'auth.session.' + (window.location.pathname || '/login');

  function persist() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
        a: attempt,
        log: Array.prototype.slice.call(el.log ? el.log.children : []).map(function (li) {
          var cmd = li.querySelector('.auth-log-cmd');
          var val = li.querySelector('.auth-log-val');
          return [cmd ? cmd.textContent : '', val ? val.textContent : '',
                  li.classList.contains('is-error') ? 'error'
                    : (li.classList.contains('is-grant') ? 'grant' : '')];
        })
      }));
    } catch (e) { /* 隐私模式 / 配额满：退回单次会话，不影响可用性 */ }
  }

  function restore() {
    var raw = null;
    try { raw = window.sessionStorage.getItem(STORE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || typeof data !== 'object') return false;
    if (typeof data.a === 'number' && data.a > 0) attempt = data.a;
    if (Array.isArray(data.log) && data.log.length) {
      if (el.log) el.log.innerHTML = '';
      data.log.forEach(function (row) { if (Array.isArray(row)) log(row[0], row[1], row[2]); });
    }
    return true;
  }

  function log(cmd, val, tone) {
    if (!el.log) return;
    if (el.log.getAttribute('data-primed') !== '1') {
      el.log.innerHTML = '';
      el.log.setAttribute('data-primed', '1');
    }
    var text = val == null ? '' : String(val);
    var last = el.log.lastElementChild;
    if (last) {
      var lastCmd = last.querySelector('.auth-log-cmd');
      var lastVal = last.querySelector('.auth-log-val');
      if (lastCmd && lastVal && lastCmd.textContent === cmd && lastVal.textContent === text) return;
    }
    var li = document.createElement('li');
    if (tone === 'error') li.className = 'is-error';
    else if (tone === 'grant') li.className = 'is-grant';
    var a = document.createElement('span'); a.className = 'auth-log-cmd'; a.textContent = cmd;
    var b = document.createElement('span'); b.className = 'auth-log-val'; b.textContent = text;
    li.appendChild(a); li.appendChild(b);
    el.log.appendChild(li);
    while (el.log.children.length > CFG.LOG_MAX) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
    persist();
  }

  /* ======================================================================
     3. 世界线引擎（Canvas 2D）
        画：点阵底纹（离屏预渲染）+ 纪元刻度 + 轴线 + 节点 + 巡游脉冲 + 扫描线。
        状态只改颜色 / 速度 / 抖动，不改几何 —— 和这套语言一样克制。
     ====================================================================== */
  var view = {
    shake: 0,      // 拒绝时的抖动强度（0..1）
    bounce: 0,     // 打字时的轻微脉冲（0..1）
    hold: false,   // 封锁驻留期间按住抖动不衰减
    mouse: { x: 0.5, y: 0.5 }
  };

  function addPulse() {
    if (reduced) return;
    view.bounce = Math.min(0.5, view.bounce + 0.14);
  }

  var NODES = 9;

  function makeEngine() {
    var canvas = el.canvas;
    if (!canvas || !el.stage || !el.core || !el.panel) return null;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var W = 0, H = 0, DPR = 1;
    var grid = null;                     // 离屏点阵
    var geo = { y: 0, x0: 0, x1: 0, cx: 0 };
    var nodes = [];
    var pulses = [];

    // 颜色取自 CSS token，保证唯一的绿还是那一支
    function css(name, fallback) {
      var v = getComputedStyle(shell).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }
    var C = {
      grid: css('--g-line-soft', '#242220'),
      line: css('--g-line-2', '#3d3a36'),
      green: css('--tx-green', '#3ddc97'),
      danger: css('--tx-danger', '#f0736a'),
      warning: css('--tx-warning', '#e8b055')
    };

    function accent() {
      if (state === 'denied') return C.danger;
      if (state === 'notice') return C.warning;
      return C.green;
    }

    function buildGrid() {
      grid = document.createElement('canvas');
      grid.width = Math.round((W + 40) * DPR);
      grid.height = Math.round((H + 40) * DPR);
      var g = grid.getContext('2d');
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.fillStyle = C.grid;
      var gap = CFG.DOTS_GAP;
      for (var y = 0; y <= H + 40; y += gap) {
        for (var x = 0; x <= W + 40; x += gap) {
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    function measure() {
      // 以**画布自身的渲染盒**为坐标原点：桌面它铺满外壳，小屏它被钉成视口背景层，
      // 两种情形下取景都对得上（用 shell 的矩形会在小屏上算错）。
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var resized = Math.abs(r.width - W) > 0.5 || Math.abs(r.height - H) > 0.5;
      W = r.width; H = r.height;
      if (resized) {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      var cr = el.core.getBoundingClientRect();
      var pr = el.panel.getBoundingClientRect();
      var tr = el.stage.getBoundingClientRect();
      var cx = cr.left - r.left + cr.width / 2;
      var cy = cr.top - r.top + cr.height / 2;
      // 轴线只延伸到闸门卡左缘，避免钻到卡片底下
      var x0 = (tr.left - r.left) + 22;
      var x1 = (pr.left - r.left) - 22;
      if (x1 <= x0) { x0 = 22; x1 = W - 22; }
      geo = { y: cy, x0: x0, x1: x1, cx: cx };

      nodes = [];
      for (var i = 0; i < NODES; i++) {
        var t = NODES === 1 ? 0.5 : i / (NODES - 1);
        nodes.push({ x: x0 + (x1 - x0) * t, lit: t < 0.56 });
      }
      if (resized) buildGrid();
      return true;
    }

    function spawnPulse() {
      if (pulses.length > 18) return;
      pulses.push({ x: geo.x0 + Math.random() * (geo.cx - geo.x0) * 0.9, life: 1, sp: 0.10 + Math.random() * 0.16 });
    }

    function render(now) {
      var t = reduced ? 0 : now * 0.001;
      var acc = accent();
      var shaking = view.shake > 0.001;
      var sx = shaking ? Math.sin(now * 0.055) * 7 * view.shake : 0;
      var sy = shaking ? Math.cos(now * 0.071) * 5 * view.shake : 0;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 1) 点阵（带鼠标视差）
      if (grid) {
        var px = (view.mouse.x - 0.5) * -10;
        var py = (view.mouse.y - 0.5) * -10;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(grid, -20 + px, -20 + py, W + 40, H + 40);
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(sx, sy);

      var y = geo.y;
      var stageTop = y - 150, stageBot = y + 150;

      // 2) 纪元竖刻度（发丝线）
      ctx.strokeStyle = C.line;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (var i = 0; i < nodes.length; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.round(nodes[i].x) + 0.5, stageTop + 46);
        ctx.lineTo(Math.round(nodes[i].x) + 0.5, stageBot - 46);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 3) 轴线：左半「已开启」用强调色，右半「封存」用发丝线
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(geo.cx, Math.round(y) + 0.5);
      ctx.lineTo(geo.x1, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.strokeStyle = acc;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(geo.x0, Math.round(y) + 0.5);
      ctx.lineTo(geo.cx, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 4) 闸门竖梁（贴在中轴，给圆环一个「支点」）
      ctx.strokeStyle = acc;
      ctx.globalAlpha = (0.16 + view.bounce * 0.4);
      ctx.beginPath();
      ctx.moveTo(Math.round(geo.cx) + 0.5, y - 128);
      ctx.lineTo(Math.round(geo.cx) + 0.5, y + 128);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 5) 节点：已开启的吃强调色，封存的是发丝方块
      for (i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var on = n.lit || state === 'granted' || state === 'unfold';
        ctx.fillStyle = on ? acc : C.line;
        ctx.globalAlpha = on ? 0.95 : 1;
        ctx.fillRect(Math.round(n.x) - 3, Math.round(y) - 3, 7, 7);
        if (on) {
          ctx.globalAlpha = 0.22;
          ctx.fillRect(Math.round(n.x) - 7, Math.round(y) - 7, 15, 15);
        }
        ctx.globalAlpha = 1;
      }

      // 6) 巡游脉冲（校验中更密、更快）
      if (!reduced) {
        var rate = state === 'verifying' ? 0.55 : 0.12;
        if (Math.random() < rate) spawnPulse();
        ctx.fillStyle = acc;
        for (i = pulses.length - 1; i >= 0; i--) {
          var p = pulses[i];
          var speed = p.sp * (state === 'verifying' ? 3.4 : 1.4);
          p.x += speed * (now - (p.last || now)) * 0.06 + speed;
          p.last = now;
          p.life -= 0.012 * (state === 'verifying' ? 2.4 : 1);
          if (p.life <= 0 || p.x > geo.cx + 12) { pulses.splice(i, 1); continue; }
          ctx.globalAlpha = Math.max(0, p.life) * 0.85;
          ctx.fillRect(Math.round(p.x), Math.round(y) - 1, 12, 2);
        }
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // 7) 扫描线：CRT 刷新，横穿舞台，很淡
      if (!reduced) {
        var span = Math.max(1, stageBot - stageTop + 90);
        var ly = stageTop - 45 + ((t * 46) % span);
        ctx.strokeStyle = acc;
        ctx.globalAlpha = 0.05;
        ctx.beginPath();
        ctx.moveTo(geo.x0 - 30, Math.round(ly) + 0.5);
        ctx.lineTo(geo.x1 + 30, Math.round(ly) + 0.5);
        ctx.stroke();
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(geo.x0 - 30, Math.round(ly) + 0.5);
        ctx.lineTo(geo.x1 + 30, Math.round(ly) + 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    return {
      kind: 'canvas2d',
      resize: function () { return measure(); },
      render: render,
      dispose: function () {}
    };
  }

  /* ======================================================================
     4. 引擎装载 + 主循环
     ====================================================================== */
  var engine = null;
  var rafId = 0, running = false;
  window.__authProbeFrames = 0;

  function loop(now) {
    if (!running) return;
    if (engine) engine.render(now);
    window.__authProbeFrames++;
    if (!view.hold) view.shake *= reduced ? 0 : 0.90;
    view.bounce *= reduced ? 0 : 0.90;
    rafId = window.requestAnimationFrame(loop);
  }

  function startLoop() {
    if (running || reduced) return;
    running = true;
    rafId = window.requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  engine = makeEngine();
  if (engine) {
    if (engine.resize()) {
      if (reduced) engine.render(0);
      else startLoop();
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop(); else startLoop();
    });
    var resizeTimer = null;
    function onResize() {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (engine && engine.resize() && reduced) engine.render(0);
      }, 90);
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(shell);
    else window.addEventListener('resize', onResize);
    // 小屏上画布是「视口背景层」，页面一滚动取景就得跟着重算
    var scrollRaf = 0;
    window.addEventListener('scroll', function () {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(function () {
        scrollRaf = 0;
        if (engine && engine.resize() && reduced) engine.render(0);
      });
    }, { passive: true });
    window.addEventListener('mousemove', function (e) {
      view.mouse.x = e.clientX / Math.max(1, window.innerWidth);
      view.mouse.y = e.clientY / Math.max(1, window.innerHeight);
    }, { passive: true });
    if (el.engineTag) el.engineTag.textContent = 'World Line · Canvas 2D';
  } else {
    shell.classList.add('is-static');
    if (el.engineTag) el.engineTag.textContent = 'World Line · Static';
  }

  /* ======================================================================
     5. 向心脉冲（校验中播撒到闸门中心的火花）
     ====================================================================== */
  var sparkTimer = null;
  function startSparks() {
    if (reduced || !el.sparks || sparkTimer) return;
    sparkTimer = window.setInterval(function () {
      if (state !== 'verifying' || !el.sparks) return;
      var a = Math.random() * Math.PI * 2;
      var r = 120 + Math.random() * 150;
      var s = document.createElement('i');
      s.className = 'g-spark';
      s.style.setProperty('--sx', Math.round(Math.cos(a) * r) + 'px');
      s.style.setProperty('--sy', Math.round(Math.sin(a) * r) + 'px');
      el.sparks.appendChild(s);
      window.setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 950);
    }, 110);
  }
  function stopSparks() {
    if (sparkTimer) window.clearInterval(sparkTimer);
    sparkTimer = null;
    if (el.sparks) el.sparks.innerHTML = '';
  }

  /* ======================================================================
     6. 状态机
     ====================================================================== */
  function setState(next) {
    if (next === state) return;
    if (!NEXT[state] || !NEXT[state][next]) return;
    state = next;
    shell.setAttribute('data-state', next);
    applyState();
  }

  function applyState() {
    var locked = (state === 'denied' || state === 'notice');
    var sealed = shell.querySelector('.auth-mark-sealed');
    var lockdown = shell.querySelector('.auth-mark-lockdown');
    if (sealed) sealed.hidden = locked;
    if (lockdown) lockdown.hidden = !locked;
    if (el.stateChip) el.stateChip.textContent = CHIP[state] || 'Sealed';

    var sessionChip = el.sessionChip;
    if (sessionChip) {
      sessionChip.textContent = state === 'granted' || state === 'unfold'
        ? 'Session Authorized'
        : (state === 'verifying' ? 'Checking…'
          : 'Session ' + (MODE === 'register' && state === 'sealed' ? 'Unjoined' : 'Locked'));
    }

    if (state === 'verifying') {
      setCaption(COPY.verifying_zh, COPY.verifying_en);
      startSparks();
    } else if (state === 'denied') {
      setCaption(COPY.denied_zh, COPY.denied_en);
      stopSparks();
    } else if (state === 'notice') {
      setCaption(sealCopy('zh'), sealCopy('en'));
      stopSparks();
    } else if (state === 'granted' || state === 'unfold') {
      setCaption(COPY.granted_zh, COPY.granted_en);
      stopSparks();
    } else {
      setCaption(sealCopy('zh'), sealCopy('en'));
      stopSparks();
    }
  }

  // 授权 / 拒绝都由服务端的**原生 POST → 跳转或错误页**驱动：
  // 这里只负责把 data-state 预置的每一态翻译成标题、字幕、流水与视觉状态。

  /* ======================================================================
     7. 字段条：真实 input ↔ 视觉镜像
     ====================================================================== */
  var nameDefault = el.nameEl ? el.nameEl.textContent : '未认领';
  var fields = [];
  Array.prototype.forEach.call(shell.querySelectorAll('.auth-field'), function (wrap, index) {
    var input = wrap.querySelector('.auth-input');
    var bar = wrap.querySelector('[data-bar]');
    if (!input || !bar) return;
    wrap.style.setProperty('--i', index);
    var rec = {
      wrap: wrap, input: input, bar: bar,
      name: wrap.getAttribute('data-field'),
      mirror: wrap.querySelector('[data-mirror]'),
      blocks: wrap.querySelector('[data-blocks]'),
      val: wrap.querySelector('[data-val]'),
      under: wrap.querySelector('[data-under]'),
      secret: input.type === 'password'
    };
    fields.push(rec);

    input.addEventListener('focus', function () {
      bar.classList.add('is-focus');
      wrap.classList.add('is-live');
      if (rec.under) rec.under.classList.add('is-focus');
      syncField(input);            // 让光标立刻出现（口令条靠它定位到尾部）
      log('FOCUS', String(rec.name || '').toUpperCase());
    });
    input.addEventListener('blur', function () {
      bar.classList.remove('is-focus');
      wrap.classList.remove('is-live');
      if (rec.under) rec.under.classList.remove('is-focus');
      syncField(input);            // 失焦后收掉光标
    });
    input.addEventListener('input', function () {
      syncField(input);
      addPulse();
      // 用户名的每一次敲击都同步到姓名牌：卡片上「未认领」→ 真实标识
      if (rec.name === 'username' && el.nameEl) {
        var value = input.value.trim();
        el.nameEl.textContent = value || nameDefault;
        el.nameEl.classList.toggle('is-pending', !value);
      }
      if (rec.name === 'invite') return;
      if (rec.name === 'password') log('INPUT', 'PASSPHRASE · ' + '▮'.repeat(Math.min(input.value.length, 8)));
      else log('INPUT', String(rec.name || '').toUpperCase());
    });
  });

  function syncField(input) {
    var rec = null;
    for (var i = 0; i < fields.length; i++) if (fields[i].input === input) rec = fields[i];
    if (!rec) return;
    var value = input.value || '';
    var focused = document.activeElement === input;
    if (rec.secret) {
      if (!rec.blocks) return;
      var html = '';
      for (var k = 0; k < value.length; k++) html += '<i></i>';
      if (focused) html += '<span class="auth-cursor"></span>';
      rec.blocks.innerHTML = html;
      // 超出条身宽度时滚到尾部：看到的永远是「最后敲的那几位」和光标，
      // 而不是被裁掉的光标（容器是 overflow:hidden，仍可程序化滚动）
      rec.blocks.scrollLeft = rec.blocks.scrollWidth;
      return;
    }
    if (!rec.mirror) return;
    rec.mirror.textContent = value;
    if (focused && value) {
      var cursor = document.createElement('span');
      cursor.className = 'auth-cursor';
      rec.mirror.appendChild(cursor);
    }
  }

  function clearFields() {
    fields.forEach(function (rec) {
      if (rec.name === 'username') return;   // 保留用户名：重试不用重打
      rec.input.value = '';
      syncField(rec.input);
    });
    log('RESET', '清空');
  }

  /* ======================================================================
     8. 时钟 / 会话秒数
     ====================================================================== */
  (function clock() {
    var stamp = shell.getAttribute('data-clock');
    var base = stamp ? new Date(stamp) : new Date();
    if (isNaN(base.getTime())) base = new Date();
    var skew = Date.now() - base.getTime();
    function tick() {
      var now = new Date(Date.now() - skew);
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      var ss = String(now.getSeconds()).padStart(2, '0');
      if (el.clockHM) el.clockHM.textContent = hh + ':' + mm;
      if (el.clockSec) el.clockSec.textContent = ss;
    }
    tick();
    window.setInterval(tick, 1000);
  })();

  (function elapsedTimer() {
    var started = Date.now();
    window.setInterval(function () {
      var s = Math.floor((Date.now() - started) / 1000);
      var hh = String(Math.floor(s / 3600)).padStart(2, '0');
      var mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
      var ss = String(s % 60).padStart(2, '0');
      if (el.elapsed) el.elapsed.textContent = hh + ':' + mm + ':' + ss;
    }, 1000);
  })();

  /* ======================================================================
     9. 邀请码：防抖探测（只有注册模式；服务端仍然复核）
     ====================================================================== */
  var probeTimer = null, probeSeq = 0, probeAbort = null, probeDegraded = false;

  function inviteState(tone, text, hint) {
    var field = shell.querySelector('[data-field="invite"]');
    if (!field) return;
    var bar = field.querySelector('[data-bar]');
    var val = field.querySelector('[data-val]');
    var under = field.querySelector('[data-under]');
    if (val) {
      val.className = 'auth-val' + (tone ? ' is-' + tone : '');
      val.textContent = text;
    }
    if (bar) {
      bar.classList.remove('is-ok', 'is-bad');
      if (tone === 'ok') bar.classList.add('is-ok');
      if (tone === 'bad') bar.classList.add('is-bad');
    }
    if (under) {
      under.classList.remove('is-ok', 'is-bad');
      if (tone === 'ok') under.classList.add('is-ok');
      if (tone === 'bad') under.classList.add('is-bad');
    }
    if (el.inviteHint) {
      if (hint) {
        el.inviteHint.hidden = false;
        el.inviteHint.className = 'auth-hint' + (tone ? ' is-' + tone : '');
        el.inviteHint.textContent = hint;
      } else {
        el.inviteHint.hidden = true;
      }
    }
  }

  function hintFor(reason) {
    if (!el.inviteHint) return '';
    if (reason === 'ok') return el.inviteHint.getAttribute('data-ok');
    if (reason === 'exhausted') return el.inviteHint.getAttribute('data-used');
    return el.inviteHint.getAttribute('data-bad');
  }

  function probeInvite() {
    if (!el.invite || probeDegraded) return;
    var code = (el.invite.value || '').trim();
    if (!code) { inviteState('', 'Awaiting', ''); return; }
    inviteState('check', 'Checking', '');
    log('INVITE', 'CHECK');
    var seq = ++probeSeq;
    if (probeAbort) try { probeAbort.abort(); } catch (e) {}
    probeAbort = ('AbortController' in window) ? new AbortController() : null;
    fetch('/api/world/auth/invite?code=' + encodeURIComponent(code), {
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
      signal: probeAbort ? probeAbort.signal : undefined
    }).then(function (response) {
      if (response.status === 429) {
        probeDegraded = true;
        inviteState('', 'Unchecked', '探测次数太多，提交时由服务端校验');
        log('INVITE', 'RATE LIMITED');
        return null;
      }
      return response.json();
    }).then(function (data) {
      if (!data || seq !== probeSeq) return;
      if (data.valid) {
        inviteState('ok', 'Valid', hintFor('ok'));
        log('INVITE', 'VALID · ' + (data.reason || 'ok'));
      } else {
        var reason = data.reason || 'not_found';
        inviteState('bad', reason === 'exhausted' ? 'Exhausted' : 'Invalid',
                    hintFor(reason === 'empty' ? 'not_found' : reason));
        log('INVITE', reason === 'exhausted' ? 'EXHAUSTED' : 'INVALID', 'error');
      }
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      probeDegraded = true;
      inviteState('', 'Unchecked', '');
    });
  }

  if (el.invite && MODE === 'register') {
    el.invite.addEventListener('input', function () {
      if (probeTimer) window.clearTimeout(probeTimer);
      inviteState('check', 'Checking', '');
      probeTimer = window.setTimeout(probeInvite, CFG.PROBE_DEBOUNCE_MS);
    });
    el.invite.addEventListener('blur', function () {
      if (probeTimer) window.clearTimeout(probeTimer);
      probeInvite();
    });
    if ((el.invite.value || '').trim()) {
      var hint = shell.getAttribute('data-invite-hint') || '';
      if (hint.indexOf('有效') >= 0) inviteState('ok', 'Valid', hint);
      else if (hint.indexOf('用完') >= 0) inviteState('bad', 'Exhausted', hint);
      else if (hint) inviteState('bad', 'Invalid', hint);
      window.setTimeout(probeInvite, 240);
    }
  }

  /* ======================================================================
     10. 提交：先播「校验中」，再用 requestSubmit() 放行原生 POST
     ====================================================================== */
  var verifyRaf = 0;

  function runVerifyProgress() {
    var t0 = performance.now();
    var target = 92;
    function step(now) {
      var p = Math.min(1, (now - t0) / (CFG.MIN_VERIFY_MS + 620));
      var ease = 1 - Math.pow(1 - p, 3);
      var pct = Math.round(ease * target);
      if (el.verifyBar) el.verifyBar.style.inlineSize = pct + '%';
      if (el.verifyPct) el.verifyPct.textContent = String(pct).padStart(2, '0') + '%';
      if (p < 1) verifyRaf = window.requestAnimationFrame(step);
    }
    verifyRaf = window.requestAnimationFrame(step);
  }

  function resetVerifyProgress() {
    if (verifyRaf) window.cancelAnimationFrame(verifyRaf);
    verifyRaf = 0;
    if (el.verifyBar) el.verifyBar.style.inlineSize = '0%';
    if (el.verifyPct) el.verifyPct.textContent = '00%';
  }

  function onSubmit() {
    busy = true;
    attempt += 1;
    if (el.attempt) el.attempt.textContent = String(attempt).padStart(2, '0');
    if (el.attemptTag) el.attemptTag.textContent = 'ATTEMPT ' + String(attempt).padStart(2, '0');
    if (el.submitLabel) el.submitLabel.textContent = 'Pending';
    if (el.submit) el.submit.disabled = true;
    if (el.errorBox) el.errorBox.hidden = true;
    if (el.statusMsg) el.statusMsg.hidden = true;
    resetVerifyProgress();
    setState('verifying');
    runVerifyProgress();
    log('ENTER', 'ATTEMPT ' + String(attempt).padStart(2, '0'));
    view.shake = Math.max(view.shake, 0.35);
    view.bounce = 0.5;

    window.setTimeout(function () {
      if (busy) {
        log('VERIFY', 'STILL COMPARING');
        setCaption('仍在比对……', 'STILL COMPARING CREDENTIALS');
      }
    }, CFG.VERIFY_SLOW_MS);
  }

  function releaseForm() {
    if (!el.form) return;
    el.form.removeEventListener('submit', guardSubmit);
    try {
      if (el.form.requestSubmit) el.form.requestSubmit();
      else el.form.submit();
    } catch (e) {
      try { el.form.submit(); } catch (e2) { /* 真放行不了就交给用户再点一次 */ }
    }
  }

  function guardSubmit(event) {
    // 校验交给浏览器：不合法就让它照常拦下
    if (el.form.checkValidity && !el.form.checkValidity()) return;
    // 已经在「验证中」了还收到第二次 submit → fail-open，别让用户「点了没反应」
    if (busy) return;
    event.preventDefault();
    onSubmit();
    window.setTimeout(releaseForm, reduced ? 0 : CFG.MIN_VERIFY_MS);
  }

  if (el.form) el.form.addEventListener('submit', guardSubmit);

  /* ======================================================================
     11. 键盘：Enter 提交 / Esc 清空；不劫持 Tab
     ====================================================================== */
  document.addEventListener('keydown', function (event) {
    if (busy) return;
    if (event.key === 'Escape') { clearFields(); return; }
    if (event.key === 'Enter' && event.target && event.target.classList
        && event.target.classList.contains('auth-input')) {
      event.preventDefault();
      if (el.form) {
        if (el.form.requestSubmit) el.form.requestSubmit();
        else el.form.submit();
      }
    }
  });

  Array.prototype.forEach.call(shell.querySelectorAll('[data-noop]'), function (btn) {
    btn.addEventListener('click', function () {
      log(String(btn.textContent || '').trim().toUpperCase(), 'NOT AVAILABLE');
    });
  });

  /* ======================================================================
     12. 开机序列 → 入场编排
     ====================================================================== */
  var BOOT_LINES = [
    ['> ', '正在连接世界…'],
    ['✓ ', '挂载世界线 · 3 个纪元'],
    ['● ', '闸门已就位 · 等待凭据']
  ];

  function revealShell() {
    fields.forEach(function (rec) { syncField(rec.input); });
    shell.classList.add('is-live');
  }

  function runBoot() {
    if (reduced || !el.boot || !el.bootLines) {
      if (el.boot) el.boot.classList.add('is-done');
      revealShell();
      return;
    }
    el.bootLines.innerHTML = '';
    var i = 0;
    function nextLine() {
      if (i >= BOOT_LINES.length) {
        window.setTimeout(function () {
          el.boot.classList.add('is-done');
          revealShell();
          window.setTimeout(function () { if (el.boot) el.boot.hidden = true; }, 360);
        }, 180);
        return;
      }
      var pair = BOOT_LINES[i++];
      var li = document.createElement('li');
      var tag = document.createElement('b');
      tag.textContent = pair[0];
      var txt = document.createElement('span');
      li.appendChild(tag); li.appendChild(txt);
      el.bootLines.appendChild(li);
      typeText(txt, pair[1], 22, function () {
        window.setTimeout(nextLine, 130);
      });
    }
    nextLine();
  }

  function typeText(node, text, speed, done) {
    var k = 0;
    (function step() {
      if (k > text.length) { done && done(); return; }
      node.textContent = text.slice(0, k);
      k++;
      window.setTimeout(step, speed);
    })();
  }

  /* ======================================================================
     13. 首帧：把服务端预置的状态接过来
     ====================================================================== */
  if (el.statusMsg) el.statusMsg.hidden = true;   // JS 接管后由封锁面板说话
  applyState();

  var hadStored = restore();

  if (hasError && errVariant) {
    if (attempt < 1) attempt = 1;
    log(errVariant.kind === 'notice' ? 'NOTICE' : 'DENIED',
        errVariant.kind === 'notice' ? '注册被拦下' : attemptText(errVariant.l2),
        errVariant.kind === 'notice' ? null : 'error');
    if (el.warnL2 && errVariant.l2) el.warnL2.textContent = attemptText(errVariant.l2);
    // 抖动一直持续到封锁态结束才回正
    view.hold = true;
    (function shakeWhileLocked() {
      if (reduced) return;
      var t0 = performance.now();
      (function tick(now) {
        if (state !== 'denied' && state !== 'notice') { view.shake = 0; view.hold = false; return; }
        view.shake = 1;
        if ((now - t0) / CFG.HOLD_MS >= 1) { view.shake = 0; view.hold = false; return; }
        window.requestAnimationFrame(tick);
      })(t0);
    })();
    window.setTimeout(function () {
      var pw = document.getElementById('id_password');
      if (pw) { pw.value = ''; syncField(pw); try { pw.focus(); } catch (e) {} }
      setState('sealed');
      view.hold = false;
      if (el.submit) el.submit.disabled = false;
    }, reduced ? 800 : CFG.HOLD_MS);
  } else if (!hadStored) {
    // 首次进入才写 SESSION 行；连续失败后的重载里，流水从 sessionStorage 接回来
    window.setTimeout(function () { log('SESSION', 'SEALED · ' + MODE.toUpperCase()); }, 400);
  }

  if (attempt > 0) {
    if (el.attempt) el.attempt.textContent = String(attempt).padStart(2, '0');
    if (el.attemptTag) el.attemptTag.textContent = 'ATTEMPT ' + String(attempt).padStart(2, '0');
  }

  runBoot();

  /* ======================================================================
     14. 供探针 / 调试读取（不影响业务）
     ====================================================================== */
  window.__authDebug = function () {
    return { state: state, engine: engine ? engine.kind : 'static', mode: MODE,
             attempt: attempt, shake: +view.shake.toFixed(3), hold: !!view.hold,
             frames: window.__authProbeFrames };
  };
  window.__authSetState = function (next) { setState(next); };
})();
