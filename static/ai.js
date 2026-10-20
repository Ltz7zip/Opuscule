/* ==========================================================================
   AI 助手抽屉
   --------------------------------------------------------------------------
   一个入口，三件事：
   1. 聊天：POST /ai/chat，服务端负责拼 prompt、跑工具循环；
   2. 审阅：AI 的写入不落库，先变成变更集，这里逐份「应用 / 拒绝」；
   3. 设置：BYOK 供应商凭据（Key 只写不读，列表里只回显尾号）。

   独立 IIFE：本文件与 workspace.js 同处全局作用域，不能重复声明
   WORLD / S / $ / el 这些顶层名字。这里要用到的全局能力（当前世界地址、
   当前打开的文档、刷新文档树）都通过 window / typeof 探测拿。
   ========================================================================== */
(function () {
  'use strict';

  const WORLD = window.__WORLD__ || {};
  const API_BASE = WORLD.apiBase || '/api/world';
  const GLOBAL_API = [
    '/api/world/auth/', '/api/world/account/', '/api/world/worlds',
    '/api/world/moderation', '/api/world/presence',
  ];

  const TOOL_LABELS = {
    list_documents: '文档列表',
    get_document: '文档详情',
    search_documents: '搜索',
    list_timeline_events: '时间线',
    list_eras: '纪元',
    list_map_markers: '地图标注',
    list_entity_types: '卡片类型',
    propose_create_document: '提议新建文档',
    propose_update_document: '提议修改文档',
    propose_edit_blocks: '提议调整正文块',
    propose_create_timeline_event: '提议新建事件',
  };

  const DOC_TYPES = {
    card: '卡片',
    timeline: '时间线',
    tree: '关系树',
    map: '地图',
    graph: '图谱',
  };

  const BLOCK_TYPE_LABELS = {
    paragraph: '段落',
    heading: '标题',
    quote: '引用',
    bulleted: '无序列表',
    numbered: '有序列表',
    todo: '待办',
    code: '代码',
    callout: '提示',
    divider: '分隔线',
  };

  const DIFF_LABELS = { update: '修改', delete: '删除', insert: '插入' };

  const ST = {
    open: false,
    view: 'chat',
    booted: false,
    loading: false,
    conversation: null,
    credentials: [],
    providers: [],
    pending: [],
    sending: false,
    error: '',
    noCredential: false,
    optimistic: '',
    // 流式输出中的临时内容：{reasoning, text, tools, usage}
    stream: null,
    form: { provider: 'openai', label: '', model: '', base_url: '', api_key: '' },
  };

  let drawer = null;
  let body = null;
  let sub = null;
  let input = null;
  let sendBtn = null;
  let compose = null;
  // 流式渲染时复用的一组节点，避免每个 token 都整页重绘
  let live = null;

  /* ------------------------------------------------------------ 小工具 */
  function apiPath(path) {
    if (!path.startsWith('/api/world/') && path !== '/api/world') return path;
    if (GLOBAL_API.some((prefix) => path === prefix || path.startsWith(prefix))) return path;
    return API_BASE + path.slice('/api/world'.length);
  }

  async function aiFetch(path, options = {}) {
    const init = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    };
    if (options.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(apiPath(path), init);
    let data = null;
    try { data = await res.json(); } catch (error) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `请求失败（${res.status}）`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data || {};
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function say(message, options) {
    if (typeof window.toast === 'function') window.toast(message, options);
  }

  function viewer() {
    try { return typeof S === 'undefined' ? null : S.viewer; } catch (error) { return null; }
  }

  function world() {
    try { return typeof S === 'undefined' ? null : S.world; } catch (error) { return null; }
  }

  function authenticated() {
    const v = viewer();
    return Boolean(v && v.authenticated);
  }

  function canEdit() {
    const v = viewer();
    return Boolean(v && v.can_edit);
  }

  function currentDoc() {
    try { return typeof activeDocument === 'function' ? activeDocument() : null; } catch (error) { return null; }
  }

  function loginHref() {
    return '/login?next=' + encodeURIComponent(location.pathname + location.search);
  }

  function providerMeta(value) {
    return ST.providers.find((item) => item.value === value) || null;
  }

  /* -------------------------------------------------------------- 骨架 */
  function mount() {
    if (document.getElementById('aiDrawer')) return;
    const btn = document.getElementById('aiBtn');
    if (!btn) return;

    drawer = el('aside', 'ai-drawer');
    drawer.id = 'aiDrawer';
    drawer.hidden = true;
    drawer.setAttribute('aria-label', 'AI 助手');
    drawer.innerHTML = [
      '<header class="ai-head">',
      '  <span class="ai-mark" aria-hidden="true">AI</span>',
      '  <div class="ai-title"><b>AI 助手</b><span class="ai-sub" id="aiSub"></span></div>',
      '  <div class="ai-acts">',
      '    <button class="ai-icon" id="aiNew" type="button" title="新对话"><span data-icon="plus" data-icon-size="15" aria-hidden="true"></span></button>',
      '    <button class="ai-icon" id="aiGear" type="button" title="供应商设置"><span data-icon="settings" data-icon-size="15" aria-hidden="true"></span></button>',
      '    <button class="ai-icon" id="aiClose" type="button" title="关闭（Esc）"><span data-icon="x" data-icon-size="15" aria-hidden="true"></span></button>',
      '  </div>',
      '</header>',
      '<div class="ai-scroll" id="aiBody"></div>',
      '<footer class="ai-compose" id="aiCompose">',
      '  <textarea id="aiInput" rows="1" placeholder="问点什么，或让它改点什么…"></textarea>',
      '  <button class="ai-send" id="aiSend" type="button">发送</button>',
      '</footer>',
    ].join('');
    document.body.appendChild(drawer);
    if (window.hydrateIcons) window.hydrateIcons(drawer);

    body = drawer.querySelector('#aiBody');
    sub = drawer.querySelector('#aiSub');
    input = drawer.querySelector('#aiInput');
    sendBtn = drawer.querySelector('#aiSend');
    compose = drawer.querySelector('#aiCompose');

    btn.addEventListener('click', toggle);
    drawer.querySelector('#aiClose').addEventListener('click', close);
    drawer.querySelector('#aiNew').addEventListener('click', newConversation);
    drawer.querySelector('#aiGear').addEventListener('click', () => openSettings());
    sendBtn.addEventListener('click', send);

    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send();
      }
    });

    body.addEventListener('click', onBodyClick);
    body.addEventListener('input', onBodyInput);
    body.addEventListener('change', onBodyChange);
    body.addEventListener('submit', onBodySubmit);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !ST.open) return;
      // 模态框开着时 Esc 归模态框，别把抽屉一起关掉
      const modal = document.getElementById('modal');
      if (modal && !modal.hidden) return;
      close();
    });

    // 打开页面后静默取一次待审阅数量（未登录 / 无权限时安静失败）
    setTimeout(() => {
      if (!authenticated()) return;
      refreshPending().then(renderBadge).catch(() => {});
    }, 1600);
  }

  /* ------------------------------------------------------------ 开关 */
  function toggle() {
    if (ST.open) close();
    else open();
  }

  // 抽屉打开时收起右下角悬浮球，避免压住输入区
  function launcherAway(away) {
    const btn = document.getElementById('aiBtn');
    if (btn) btn.classList.toggle('is-away', away);
  }

  async function open() {
    ST.open = true;
    drawer.hidden = false;
    launcherAway(true);
    render();
    input.focus();
    if (!ST.booted) {
      ST.booted = true;
      await boot();
    }
  }

  function close() {
    ST.open = false;
    if (drawer) drawer.hidden = true;
    launcherAway(false);
  }

  async function boot() {
    if (!authenticated()) {
      render();
      return;
    }
    ST.loading = true;
    render();
    try {
      await loadCredentials();
    } catch (error) {
      ST.error = error.message;
    }
    try {
      await refreshPending();
    } catch (error) { /* 无权限时只是没有待审阅 */ }
    try {
      await restoreConversation();
    } catch (error) {
      ST.error = error.message;
    }
    ST.loading = false;
    render();
    renderBadge();
  }

  async function loadCredentials() {
    const data = await aiFetch('/api/world/ai/credentials');
    ST.credentials = data.credentials || [];
    ST.providers = data.providers || ST.providers;
    if (!ST.credentials.length) ST.noCredential = true;
    else if (!ST.noCredential) ST.noCredential = false;
  }

  async function refreshPending() {
    const data = await aiFetch('/api/world/ai/changesets?status=pending');
    ST.pending = data.changesets || [];
  }

  function renderBadge() {
    const btn = document.getElementById('aiBtn');
    if (!btn) return;
    const count = ST.pending.length;
    btn.classList.toggle('has-pending', count > 0);
    btn.title = count ? `AI 助手（${count} 份待审阅改动）` : 'AI 助手';
    btn.setAttribute('aria-label', count ? `打开 AI 助手（${count} 份待审阅改动）` : '打开 AI 助手');
  }

  async function restoreConversation() {
    const data = await aiFetch('/api/world/ai/conversations');
    const conversations = data.conversations || [];
    const doc = currentDoc();
    let pick = null;
    if (doc && doc.id) {
      // 卡片里打开 AI：优先接着这张卡片自己的对话
      pick = conversations.find((item) => item.document === doc.id) || null;
    } else {
      pick = conversations[0] || null;
    }
    if (!pick) {
      ST.conversation = null;
      return;
    }
    await openConversation(pick.id);
  }

  async function openConversation(id) {
    ST.conversation = await aiFetch(`/api/world/ai/conversations/${id}`);
  }

  function newConversation() {
    if (ST.sending) return;
    ST.conversation = null;
    ST.view = 'chat';
    ST.error = '';
    ST.optimistic = '';
    if (input) { input.value = ''; autosize(); input.focus(); }
    render();
  }

  /* -------------------------------------------------------------- 渲染 */
  function render() {
    if (!drawer) return;
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
    compose.hidden = ST.view !== 'chat';
    body.replaceChildren();
    live = null;

    if (!authenticated()) {
      body.appendChild(notice(
        '登录后才能使用 AI 助手',
        'AI 会用你自己的 API Key 调用模型。登录后可以在「设置」里配置供应商。',
        [{ label: '去登录', href: loginHref() }],
      ));
      updateSub();
      return;
    }

    if (ST.view === 'settings') {
      renderSettings();
      updateSub();
      return;
    }

    const w = world();
    if (w && w.ai_enabled === false) {
      body.appendChild(notice(
        '这个世界还没开启 AI',
        '到「世界设置」里勾上「AI 功能」，之后就能在这里对话了。',
        [],
      ));
      updateSub();
      return;
    }

    if (ST.noCredential) {
      body.appendChild(notice(
        '还没有配置 AI 供应商',
        'AI 助手使用你自己的 API Key（BYOK）。Key 只保存在服务端，加密后不会回传到浏览器。',
        [{ label: '去配置供应商', onClick: () => openSettings() }],
      ));
    }

    if (ST.loading) {
      body.appendChild(el('p', 'ai-hint', '正在载入对话…'));
    }

    renderMessages();

    if (ST.pending.length) renderPending();

    if (ST.error) body.appendChild(el('p', 'ai-msg is-error', ST.error));

    updateSub();
    autosize();
    sendBtn.disabled = ST.sending || !input.value.trim();
    if (nearBottom || ST.sending) body.scrollTop = body.scrollHeight;
  }

  function updateSub() {
    if (!sub) return;
    if (ST.view === 'settings') { sub.textContent = '供应商设置'; return; }
    if (ST.conversation && ST.conversation.title) {
      sub.textContent = ST.conversation.title;
      return;
    }
    const doc = currentDoc();
    sub.textContent = doc && doc.name ? `关于《${doc.name}》` : '新对话';
  }

  function notice(title, text, actions) {
    const box = el('div', 'ai-notice');
    box.appendChild(el('b', null, title));
    box.appendChild(el('p', 'ai-hint', text));
    if (actions.length) {
      const row = el('div', 'ai-cs-acts');
      actions.forEach((action) => {
        if (action.href) {
          const link = el('a', 'ai-btn', action.label);
          link.href = action.href;
          row.appendChild(link);
        } else {
          const button = el('button', 'ai-btn is-primary', action.label);
          button.type = 'button';
          button.addEventListener('click', action.onClick);
          row.appendChild(button);
        }
      });
      box.appendChild(row);
    }
    return box;
  }

  /* ------------------------------------------------------------ Markdown */
  const SAFE_LINK = /^(https?:\/\/|mailto:|\/|#)/i;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // 行内语法：先把代码 / 链接换成占位符，转义其余文本后再还原，避免 XSS。
  function inlineHtml(text) {
    const stash = [];
    const hold = (html) => `\u0000${stash.push(html) - 1}\u0000`;
    let out = String(text);
    out = out.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
    out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
      if (!SAFE_LINK.test(href)) return whole;
      return hold(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
        `${inlineHtml(label)}</a>`,
      );
    });
    out = escapeHtml(out);
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
    return out.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]);
  }

  function codeBlock(code, lang) {
    const box = el('div', 'ai-code');
    const head = el('div', 'ai-code-head');
    head.appendChild(el('span', 'ai-code-lang', lang || 'text'));
    const copy = el('button', 'ai-code-copy');
    copy.innerHTML = window.iconHtml ? window.iconHtml('copy', 12) : '⧉';
    copy.type = 'button';
    copy.title = '复制代码';
    copy.dataset.act = 'copy-code';
    head.appendChild(copy);
    box.appendChild(head);

    const pre = el('pre', 'ai-code-body');
    const node = el('code');
    node.textContent = code.replace(/\n$/, '');
    pre.appendChild(node);
    box.appendChild(pre);
    return box;
  }

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function tableCells(line) {
    let body = line.trim();
    if (body.startsWith('|')) body = body.slice(1);
    if (body.endsWith('|')) body = body.slice(0, -1);
    return body.split('|').map((cell) => cell.trim());
  }

  function isTableStart(lines, index) {
    if (index + 1 >= lines.length || !lines[index].includes('|')) return false;
    return tableCells(lines[index + 1]).every((cell) => /^:?-{2,}:?$/.test(cell));
  }

  function isBlockStart(lines, index) {
    const line = lines[index];
    if (/^\s*```/.test(line)) return true;
    if (/^\s*(#{1,6})\s+/.test(line)) return true;
    if (/^\s*>/.test(line)) return true;
    if (LIST_RE.test(line)) return true;
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return true;
    return isTableStart(lines, index);
  }

  function renderList(lines, start) {
    const first = lines[start].match(LIST_RE);
    const baseIndent = first[1].length;
    const list = el(/\d/.test(first[2]) ? 'ol' : 'ul', 'ai-md-list');
    let index = start;
    while (index < lines.length) {
      const match = lines[index].match(LIST_RE);
      if (!match) break;
      const indent = match[1].length;
      if (indent < baseIndent) break;
      if (indent > baseIndent + 1) {
        const [sub, next] = renderList(lines, index);
        const last = list.lastElementChild;
        if (last) last.appendChild(sub);
        index = next;
        continue;
      }
      const item = el('li', 'ai-md-li');
      item.innerHTML = inlineHtml(match[3]);
      list.appendChild(item);
      index += 1;
    }
    return [list, index];
  }

  function renderTable(lines, start) {
    const headers = tableCells(lines[start]);
    const wrap = el('div', 'ai-table-wrap');
    const table = el('table', 'ai-md-table');
    const headRow = el('tr');
    headers.forEach((cell) => {
      const th = el('th');
      th.innerHTML = inlineHtml(cell);
      headRow.appendChild(th);
    });
    const thead = el('thead');
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    let index = start + 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      const row = el('tr');
      tableCells(lines[index]).forEach((cell) => {
        const td = el('td');
        td.innerHTML = inlineHtml(cell);
        row.appendChild(td);
      });
      tbody.appendChild(row);
      index += 1;
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return [wrap, index];
  }

  // 够用就好的 Markdown 子集：标题、列表、引用、表格、围栏代码、行内语法。
  function renderMarkdown(text) {
    const root = el('div', 'ai-md');
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      const fence = line.match(/^\s*```+\s*([\w+#.-]*)\s*$/);
      if (fence) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^\s*```+\s*$/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;   // 吃掉收尾围栏
        root.appendChild(codeBlock(code.join('\n'), fence[1]));
        continue;
      }

      if (!line.trim()) { index += 1; continue; }

      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        root.appendChild(el('hr', 'ai-md-hr'));
        index += 1;
        continue;
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const node = el('h' + heading[1].length, 'ai-md-heading');
        node.innerHTML = inlineHtml(heading[2]);
        root.appendChild(node);
        index += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quoted.push(lines[index].replace(/^\s*>\s?/, ''));
          index += 1;
        }
        const quote = el('blockquote', 'ai-md-quote');
        quote.innerHTML = inlineHtml(quoted.join('\n')).replace(/\n/g, '<br>');
        root.appendChild(quote);
        continue;
      }

      if (isTableStart(lines, index)) {
        const [table, next] = renderTable(lines, index);
        root.appendChild(table);
        index = next;
        continue;
      }

      if (LIST_RE.test(line)) {
        const [list, next] = renderList(lines, index);
        root.appendChild(list);
        index = next;
        continue;
      }

      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
        paragraph.push(lines[index]);
        index += 1;
      }
      const node = el('p', 'ai-md-p');
      node.innerHTML = inlineHtml(paragraph.join('\n')).replace(/\n/g, '<br>');
      root.appendChild(node);
    }

    return root;
  }

  // 流式期间按文本比较，只有真的变了才重建；调用方可自行节流。
  function paintMarkdown(host, text) {
    if (host.dataset.raw === text) return;
    host.dataset.raw = text;
    host.replaceChildren(renderMarkdown(text));
  }

  function renderMessages() {
    const messages = (ST.conversation && ST.conversation.messages) || [];
    messages.forEach((message) => {
      if (message.role === 'user') {
        const bubble = el('div', 'ai-msg is-user');
        bubble.textContent = message.content || '';
        body.appendChild(bubble);
        return;
      }
      if (message.role !== 'assistant') return;   // tool 结果不展示
      const text = (message.content || '').trim();
      const thought = (message.reasoning || '').trim();
      if (thought) body.appendChild(thinkBlock(thought));
      if (text) {
        const bubble = el('div', 'ai-msg is-bot');
        const content = el('div', 'ai-msg-text');
        content.appendChild(renderMarkdown(text));
        bubble.appendChild(content);
        body.appendChild(bubble);
      }
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (calls.length) {
        const row = el('div', 'ai-tools');
        calls.forEach((call) => {
          row.appendChild(el('span', 'ai-tool', '已调用：' + (TOOL_LABELS[call.name] || call.name || '工具')));
        });
        body.appendChild(row);
      }
      const stat = statLine(message.usage);
      if (stat) body.appendChild(stat);
    });

    if (ST.optimistic) {
      const bubble = el('div', 'ai-msg is-user');
      bubble.textContent = ST.optimistic;
      body.appendChild(bubble);
    }
    if (ST.stream) {
      renderStream();
    } else if (ST.sending) {
      body.appendChild(el('div', 'ai-msg is-bot is-pending', '思考中…'));
    }
    if (!messages.length && !ST.optimistic && !ST.sending && !ST.noCredential) {
      body.appendChild(el(
        'p', 'ai-hint',
        '可以直接问世界里的设定，也可以让我新建或修改文档——改动会先进「待审阅」，你点应用才会真正生效。',
      ));
    }
  }

  /* ------------------------------------------------------ 思考 / 用量 */
  function thinkBlock(text) {
    const box = el('details', 'ai-think');
    const head = el('summary', 'ai-think-head');
    const caret = el('span', 'ai-think-caret');
    if (window.iconHtml) caret.innerHTML = window.iconHtml('chevron-right', 10);
    head.appendChild(caret);
    head.appendChild(el('span', 'ai-think-title', '推理'));
    head.appendChild(el('span', 'ai-think-meta', `${text.length} 字符`));
    const copy = el('button', 'ai-think-copy');
    copy.innerHTML = window.iconHtml ? window.iconHtml('copy', 12) : '⧉';
    copy.type = 'button';
    copy.title = '复制思考内容';
    copy.dataset.act = 'copy-think';
    head.appendChild(copy);
    box.appendChild(head);
    box.appendChild(el('div', 'ai-think-body', text));
    return box;
  }

  // 把一次调用的用量折成一行小字，缺什么就少显示什么。
  function statsText(usage) {
    if (!usage || typeof usage !== 'object') return '';
    const total = Number(usage.total_tokens) || 0;
    const prompt = Number(usage.prompt_tokens) || 0;
    const completion = Number(usage.completion_tokens) || 0;
    const duration = Number(usage.duration_ms) || 0;
    const ttft = Number(usage.ttft_ms) || 0;
    const bits = [];
    if (total) bits.push(`${total} 个 token`);
    if (completion && duration) {
      const gen = Math.max(duration - ttft, 0) / 1000;
      const rate = gen > 0 ? completion / gen : completion / (duration / 1000);
      bits.push(`${rate.toFixed(1)} t/s`);
    }
    if (prompt && ttft) bits.push(`${(prompt / (ttft / 1000)).toFixed(1)} pp/s（至首个令牌）`);
    if (prompt) bits.push(`提示词 ${prompt}`);
    if (ttft) bits.push(`${(ttft / 1000).toFixed(2)}s TTFT`);
    if (duration) bits.push(`共 ${(duration / 1000).toFixed(1)} 秒`);
    return bits.join(' · ');
  }

  function editPreview(change) {
    const payload = change.payload || {};
    if (change.kind !== 'edit_blocks') return [];
    return Array.isArray(payload.preview) ? payload.preview : [];
  }

  function snapshotLabel(snap) {
    if (!snap) return '（空块）';
    const bits = [];
    if (snap.type) bits.push(BLOCK_TYPE_LABELS[snap.type] || snap.type);
    const text = [snap.title, snap.text].filter(Boolean).join(' / ');
    if (text) bits.push(text);
    return bits.join(' · ') || '（空块）';
  }

  function diffLine(snap, cls) {
    return el('div', `ai-diff-text ${cls}`, snapshotLabel(snap));
  }

  function diffRow(op) {
    const action = (op && op.action) || 'update';
    const row = el('div', `ai-diff-row is-${action}`);
    row.appendChild(el('span', 'ai-diff-tag', DIFF_LABELS[action] || action));
    const bodyNode = el('div', 'ai-diff-body');
    if (action === 'insert') {
      bodyNode.appendChild(diffLine(op.after, 'ai-diff-after'));
    } else {
      bodyNode.appendChild(diffLine(op.before, 'ai-diff-before'));
      if (action === 'update') bodyNode.appendChild(diffLine(op.after, 'ai-diff-after'));
    }
    row.appendChild(bodyNode);
    return row;
  }

  function statLine(usage) {
    const text = statsText(usage);
    return text ? el('div', 'ai-stat', text) : null;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => say('已复制'))
        .catch(() => fallbackCopy(text));
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const area = el('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    area.remove();
    say(ok ? '已复制' : '复制失败，请手动选择文本', ok ? undefined : { kind: 'err' });
  }

  // 流式输出时复用的一组节点，避免每个 token 都整页重绘。
  function renderStream() {
    const stream = ST.stream;
    live = {
      wrap: el('div', 'ai-live'),
      tools: el('div', 'ai-tools'),
      toolCount: 0,
    };

    live.think = thinkBlock(stream.reasoning || '');
    live.think.hidden = !stream.reasoning;
    live.thinkBody = live.think.querySelector('.ai-think-body');
    live.thinkMeta = live.think.querySelector('.ai-think-meta');

    live.bubble = el('div', 'ai-msg is-bot');
    live.text = el('div', 'ai-msg-text');
    live.bubble.appendChild(live.text);
    live.bubble.hidden = !stream.text;

    live.stat = el('div', 'ai-stat');
    live.stat.hidden = true;

    live.typing = el('div', 'ai-msg is-bot is-pending ai-typing', '思考中…');
    live.typing.hidden = Boolean(stream.reasoning || stream.text);

    live.wrap.appendChild(live.think);
    live.wrap.appendChild(live.bubble);
    live.wrap.appendChild(live.tools);
    live.wrap.appendChild(live.stat);
    live.wrap.appendChild(live.typing);
    body.appendChild(live.wrap);

    paintStream(true);
  }

  function paintStream(force) {
    const stream = ST.stream;
    if (!live || !stream) return;
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 90;

    const thought = stream.reasoning || '';
    live.think.hidden = !thought;
    if (live.thinkBody.textContent !== thought) live.thinkBody.textContent = thought;
    live.thinkMeta.textContent = `${thought.length} 字符`;

    const text = stream.text || '';
    live.bubble.hidden = !text;
    // 每来一个 token 都重排 Markdown 太贵，节流到 ~70ms 一次；收尾时整页重绘会补上终态。
    const now = Date.now();
    if (live.text.dataset.raw !== text && (force || now - (live.paintedAt || 0) >= 70)) {
      paintMarkdown(live.text, text);
      live.paintedAt = now;
    }

    if (live.toolCount !== stream.tools.length) {
      for (let i = live.toolCount; i < stream.tools.length; i += 1) {
        const name = stream.tools[i];
        live.tools.appendChild(el('span', 'ai-tool', '已调用：' + (TOOL_LABELS[name] || name || '工具')));
      }
      live.toolCount = stream.tools.length;
    }
    live.tools.hidden = !stream.tools.length;

    const line = statsText(stream.usage);
    live.stat.hidden = !line;
    if (line) live.stat.textContent = line;

    live.typing.hidden = Boolean(thought || text);

    if (force || nearBottom) body.scrollTop = body.scrollHeight;
  }

  function renderPending() {
    ST.pending.forEach((changeset) => {
      const card = el('section', 'ai-changeset');

      const head = el('div', 'ai-cs-head');
      head.appendChild(el('b', null, '待审阅改动'));
      head.appendChild(el('span', 'ai-badge', `${(changeset.changes || []).length} 条`));
      card.appendChild(head);

      if (changeset.summary) {
        card.appendChild(el('p', 'ai-cs-summary', changeset.summary));
      }

      let deletes = 0;
      (changeset.changes || []).forEach((change) => {
        const row = el('div', 'ai-change');
        const line = el('div', 'ai-change-line');
        line.appendChild(el('span', 'ai-change-kind', change.kind_label || '改动'));
        line.appendChild(el('span', 'ai-change-title', change.title || ''));
        row.appendChild(line);

        if (change.status !== 'pending') {
          row.appendChild(el('span', 'ai-state', change.status_label || change.status || ''));
        }
        const meta = changeMeta(change);
        if (meta) row.appendChild(el('div', 'ai-change-note', meta));
        if (change.payload && change.payload.note) {
          row.appendChild(el('div', 'ai-change-note', change.payload.note));
        }
        const preview = editPreview(change);
        if (preview.length) {
          const diff = el('div', 'ai-diff');
          preview.forEach((op) => {
            if (op && op.action === 'delete') deletes += 1;
            diff.appendChild(diffRow(op));
          });
          row.appendChild(diff);
        }
        if (change.error) row.appendChild(el('div', 'ai-change-error', change.error));
        card.appendChild(row);
      });

      if (deletes) {
        card.appendChild(el('p', 'ai-cs-warn', `注意：这份改动会删除 ${deletes} 个块，请确认内容无误。`));
      }

      if (canEdit() && changeset.status === 'pending') {
        const acts = el('div', 'ai-cs-acts');
        const apply = el('button', 'ai-btn is-primary', '应用');
        apply.type = 'button';
        apply.dataset.act = 'apply';
        apply.dataset.id = String(changeset.id);
        if (deletes) apply.dataset.deletes = String(deletes);
        const reject = el('button', 'ai-btn is-danger', '拒绝');
        reject.type = 'button';
        reject.dataset.act = 'reject';
        reject.dataset.id = String(changeset.id);
        acts.appendChild(reject);
        acts.appendChild(apply);
        card.appendChild(acts);
      } else if (changeset.status === 'pending') {
        card.appendChild(el('p', 'ai-hint', '你是只读权限，只有能编辑的人才能应用这些改动。'));
      }
      body.appendChild(card);
    });
  }

  function changeMeta(change) {
    const payload = change.payload || {};
    const bits = [];
    if (change.kind === 'create_document') {
      if (payload.document_type) bits.push(DOC_TYPES[payload.document_type] || payload.document_type);
    } else if (change.kind === 'update_document') {
      if (payload.name) bits.push(`改名为《${payload.name}》`);
      if (payload.append_text) bits.push(`追加 ${String(payload.append_text).length} 字`);
    } else if (change.kind === 'edit_blocks') {
      if (payload.document_name) bits.push(`《${payload.document_name}》`);
      const ops = Array.isArray(payload.operations) ? payload.operations : [];
      if (ops.length) bits.push(`${ops.length} 处块调整`);
    } else if (change.kind === 'create_timeline_event') {
      const parts = [];
      if (payload.year !== undefined && payload.year !== null) parts.push(`${payload.year} 年`);
      if (payload.month) parts.push(`${payload.month} 月`);
      if (payload.day) parts.push(`${payload.day} 日`);
      if (parts.length) bits.push(parts.join(' '));
    }
    return bits.join(' · ');
  }

  /* -------------------------------------------------------------- 设置 */
  function openSettings() {
    ST.view = 'settings';
    ST.error = '';
    render();
    // 未登录时 render() 已经给出登录引导，别再去打接口
    if (!authenticated()) return;
    loadCredentials()
      .then(() => { if (ST.open && ST.view === 'settings') render(); })
      .catch((error) => { ST.error = error.message; render(); });
  }

  function renderSettings() {
    const head = el('div', 'ai-cs-head');
    head.appendChild(el('b', null, '已保存的供应商'));
    body.appendChild(head);

    if (!ST.credentials.length) {
      body.appendChild(el('p', 'ai-hint', '还没有。填一张下表，第一次保存的会自动设为默认。'));
    }
    ST.credentials.forEach((credential) => {
      const card = el('div', 'ai-cred');
      const line = el('div', 'ai-cred-head');
      line.appendChild(el('span', 'ai-cred-name', credential.label || credential.provider_label));
      if (credential.is_default) line.appendChild(el('span', 'ai-badge', '默认'));
      card.appendChild(line);
      card.appendChild(el('div', 'ai-cred-meta',
        `${credential.provider_label} · ${credential.model || '默认模型'} · 尾号 ${credential.key_hint || '····'}`));
      if (credential.base_url) card.appendChild(el('div', 'ai-cred-meta', credential.base_url));

      const acts = el('div', 'ai-cred-acts');
      if (!credential.is_default) {
        const use = el('button', 'ai-btn', '设为默认');
        use.type = 'button';
        use.dataset.act = 'default';
        use.dataset.id = String(credential.id);
        acts.appendChild(use);
      }
      const remove = el('button', 'ai-btn is-danger', '删除');
      remove.type = 'button';
      remove.dataset.act = 'delete';
      remove.dataset.id = String(credential.id);
      acts.appendChild(remove);
      card.appendChild(acts);
      body.appendChild(card);
    });

    const formHead = el('div', 'ai-cs-head');
    formHead.appendChild(el('b', null, '添加供应商'));
    body.appendChild(formHead);

    const form = el('form', 'ai-form');
    form.id = 'aiCredForm';

    const providers = ST.providers.length ? ST.providers : [
      { value: 'openai', label: 'OpenAI', default_base_url: '', default_model: '' },
    ];
    if (!providerMeta(ST.form.provider)) ST.form.provider = providers[0].value;

    const select = el('select');
    select.dataset.field = 'provider';
    providers.forEach((provider) => {
      const option = el('option', null, provider.label);
      option.value = provider.value;
      option.selected = provider.value === ST.form.provider;
      select.appendChild(option);
    });
    form.appendChild(field('供应商', select));

    form.appendChild(field('备注名（可选）', textInput('label', '例如：工作账号')));

    const meta = providerMeta(ST.form.provider);
    form.appendChild(field(
      '模型',
      textInput('model', meta && meta.default_model ? meta.default_model : '例如 gpt-4o-mini'),
    ));
    form.appendChild(field(
      '接口地址（可选）',
      textInput('base_url', meta && meta.default_base_url ? meta.default_base_url : '自定义供应商必填，如 https://api.example.com/v1'),
    ));
    form.appendChild(field('API Key', textInput('api_key', '只写不读，列表里只显示尾号', 'password')));

    const acts = el('div', 'ai-cs-acts');
    const submit = el('button', 'ai-btn is-primary', '保存');
    submit.type = 'submit';
    acts.appendChild(submit);
    form.appendChild(acts);

    form.appendChild(el('p', 'ai-hint',
      'Key 用服务端根密钥加密后存进数据库，接口永远不回传明文；留空的 Key 表示沿用原来的。'));
    body.appendChild(form);
  }

  function field(label, control) {
    const box = el('label', 'ai-field');
    box.appendChild(el('span', null, label));
    box.appendChild(control);
    return box;
  }

  function textInput(name, placeholder, type) {
    const node = el('input');
    node.type = type || 'text';
    node.dataset.field = name;
    node.placeholder = placeholder || '';
    node.value = ST.form[name] || '';
    node.autocomplete = 'off';
    return node;
  }

  function onBodyInput(event) {
    const node = event.target.closest('[data-field]');
    if (!node) return;
    ST.form[node.dataset.field] = node.value;
  }

  function onBodyChange(event) {
    const node = event.target.closest('[data-field]');
    if (!node || node.dataset.field !== 'provider') return;
    ST.form.provider = node.value;
    const meta = providerMeta(node.value);
    if (meta) {
      const defaults = ST.providers.map((item) => item.default_model).filter(Boolean);
      if (!ST.form.model || defaults.includes(ST.form.model)) ST.form.model = meta.default_model || '';
      const urls = ST.providers.map((item) => item.default_base_url).filter(Boolean);
      if (!ST.form.base_url || urls.includes(ST.form.base_url)) ST.form.base_url = meta.default_base_url || '';
    }
    render();
  }

  function onBodySubmit(event) {
    if (event.target.id !== 'aiCredForm') return;
    event.preventDefault();
    saveCredential();
  }

  async function saveCredential() {
    const form = ST.form;
    if (!form.api_key.trim()) {
      say('请填写 API Key', { kind: 'err' });
      return;
    }
    try {
      await aiFetch('/api/world/ai/credentials', {
        method: 'POST',
        body: {
          provider: form.provider,
          label: form.label.trim(),
          model: form.model.trim(),
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim(),
        },
      });
      ST.form.label = '';
      ST.form.api_key = '';
      ST.noCredential = false;
      await loadCredentials();
      say('供应商已保存');
      render();
    } catch (error) {
      ST.error = error.message;
      render();
    }
  }

  async function onBodyClick(event) {
    const codeCopy = event.target.closest('[data-act="copy-code"]');
    if (codeCopy) {
      event.preventDefault();
      event.stopPropagation();
      const box = codeCopy.closest('.ai-code');
      const code = box ? ((box.querySelector('code') || {}).textContent || '') : '';
      if (code) copyText(code);
      return;
    }
    const copy = event.target.closest('[data-act="copy-think"]');
    if (copy) {
      // 按钮在 <summary> 里，别让点击顺带把折叠块收起来
      event.preventDefault();
      event.stopPropagation();
      const box = copy.closest('.ai-think');
      const text = box ? ((box.querySelector('.ai-think-body') || {}).textContent || '') : '';
      if (text) copyText(text);
      return;
    }
    const node = event.target.closest('[data-act]');
    if (!node) return;
    const id = node.dataset.id;
    const act = node.dataset.act;
    if (act === 'apply') return applyChangeset(id, node);
    if (act === 'reject') return rejectChangeset(id, node);
    if (act === 'default') return makeDefault(id, node);
    if (act === 'delete') return removeCredential(id, node);
  }

  async function applyChangeset(id, node) {
    const deletes = Number(node.dataset.deletes || 0);
    if (deletes > 0 && node.dataset.confirmed !== '1') {
      // 删除不可逆，先让按钮变成一次明确的确认动作。
      node.dataset.confirmed = '1';
      node.textContent = `确认删除 ${deletes} 个块`;
      node.classList.remove('is-primary');
      node.classList.add('is-warn');
      return;
    }
    node.disabled = true;
    try {
      const data = await aiFetch(`/api/world/ai/changesets/${id}/apply`, { method: 'POST' });
      const failed = data.failed || 0;
      say(failed ? `已应用 ${data.applied} 条，${failed} 条失败` : `已应用 ${data.applied} 条改动`,
        failed ? { kind: 'err' } : undefined);
      await refreshPending();
      renderBadge();
      // 应用后把受影响的、正开着的文档重新拉一份。工作区缓存了 entry，
      // 不重取的话正文面板仍显示旧内容，看起来就像"改动没落实"。
      if (typeof refreshDoc === 'function') {
        const ids = new Set();
        ((data.changeset && data.changeset.changes) || []).forEach((change) => {
          const payload = change.payload || {};
          const result = change.result || {};
          [payload.document_id, result.document_id].forEach((value) => {
            const docId = Number(value);
            if (docId) ids.add(docId);
          });
        });
        await Promise.all(Array.from(ids).map((docId) => refreshDoc(docId).catch(() => {})));
      }
      if (typeof reloadTree === 'function') {
        reloadTree().catch(() => {});
      }
      render();
    } catch (error) {
      ST.error = error.message;
      render();
    }
  }

  async function rejectChangeset(id, node) {
    node.disabled = true;
    try {
      await aiFetch(`/api/world/ai/changesets/${id}/reject`, { method: 'POST' });
      say('已拒绝这份改动');
      await refreshPending();
      renderBadge();
      render();
    } catch (error) {
      ST.error = error.message;
      render();
    }
  }

  async function makeDefault(id, node) {
    node.disabled = true;
    try {
      await aiFetch(`/api/world/ai/credentials/${id}`, {
        method: 'PATCH',
        body: { is_default: true },
      });
      await loadCredentials();
      render();
    } catch (error) {
      ST.error = error.message;
      render();
    }
  }

  async function removeCredential(id, node) {
    if (!window.confirm('删除这张供应商凭据？删除后需要重新填写 Key。')) return;
    node.disabled = true;
    try {
      await aiFetch(`/api/world/ai/credentials/${id}`, { method: 'DELETE' });
      await loadCredentials();
      if (!ST.credentials.length) ST.noCredential = true;
      say('已删除');
      render();
    } catch (error) {
      ST.error = error.message;
      render();
    }
  }

  /* -------------------------------------------------------------- 发送 */
  async function send() {
    if (ST.sending) return;
    const text = input.value.trim();
    if (!text) return;
    if (!authenticated()) {
      location.href = loginHref();
      return;
    }

    ST.sending = true;
    ST.error = '';
    ST.optimistic = text;
    ST.view = 'chat';
    ST.stream = { reasoning: '', text: '', tools: [], usage: null };
    input.value = '';
    autosize();
    render();

    const payload = { message: text };
    if (ST.conversation && ST.conversation.id) {
      payload.conversation_id = ST.conversation.id;
    } else {
      const doc = currentDoc();
      if (doc && doc.id) payload.document_id = doc.id;
    }

    let finished = null;
    try {
      await streamChat(payload, (event) => {
        if (event.type === 'start') {
          if (event.conversation) ST.conversation = event.conversation;
          return;
        }
        if (event.type === 'reasoning') {
          ST.stream.reasoning += event.text || '';
        } else if (event.type === 'content') {
          ST.stream.text += event.text || '';
        } else if (event.type === 'tool') {
          ST.stream.tools.push(event.name || '');
        } else if (event.type === 'usage') {
          ST.stream.usage = event;
        } else if (event.type === 'done') {
          finished = event;
        } else if (event.type === 'error') {
          const err = new Error(event.error || '生成失败');
          err.code = event.code;
          throw err;
        }
        paintStream();
      });
      ST.optimistic = '';
      if (finished && finished.conversation) {
        ST.conversation = finished.conversation;
      } else if (ST.conversation && ST.conversation.id) {
        await openConversation(ST.conversation.id);
      }
      await refreshPending();
      renderBadge();
    } catch (error) {
      ST.optimistic = '';
      if (error.code === 'no_credential') {
        ST.noCredential = true;
      } else if (error.status === 401) {
        ST.error = '登录状态已失效，请重新登录。';
      } else {
        ST.error = error.message;
      }
      input.value = text;
    } finally {
      ST.stream = null;
      ST.sending = false;
      autosize();
      render();
    }
  }

  // 和 aiFetch 一样处理错误，只是成功时把 SSE 逐块交给回调。
  async function streamChat(payload, onEvent) {
    const res = await fetch(apiPath('/api/world/ai/chat/stream'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (error) { data = null; }
      const err = new Error((data && data.error) || `请求失败（${res.status}）`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    if (!res.body || typeof res.body.getReader !== 'function') {
      consumeSse(await res.text(), onEvent);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        buffer = consumeSse(buffer, onEvent);
      }
      buffer += decoder.decode();
      consumeSse(buffer + '\n\n', onEvent);
    } finally {
      try { await reader.cancel(); } catch (error) { /* 已经读完了 */ }
    }
  }

  // 按 SSE 的空行切块，返回还没收全的尾巴。
  function consumeSse(buffer, onEvent) {
    buffer = buffer.replace(/\r\n/g, '\n');
    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      chunk.split('\n').forEach((line) => {
        if (!line.startsWith('data:')) return;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') return;
        let event = null;
        try { event = JSON.parse(raw); } catch (error) { return; }
        if (event && typeof event === 'object') onEvent(event);
      });
      index = buffer.indexOf('\n\n');
    }
    return buffer;
  }

  function autosize() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
    if (sendBtn) sendBtn.disabled = ST.sending || !input.value.trim();
  }

  /* -------------------------------------------------------------- 启动 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
