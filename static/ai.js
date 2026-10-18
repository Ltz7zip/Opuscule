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
    propose_create_timeline_event: '提议新建事件',
  };

  const DOC_TYPES = {
    card: '卡片',
    timeline: '时间线',
    tree: '关系树',
    map: '地图',
    graph: '图谱',
  };

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
    form: { provider: 'openai', label: '', model: '', base_url: '', api_key: '' },
  };

  let drawer = null;
  let body = null;
  let sub = null;
  let input = null;
  let sendBtn = null;
  let compose = null;

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
      '    <button class="ai-icon" id="aiNew" type="button" title="新对话">＋</button>',
      '    <button class="ai-icon" id="aiGear" type="button" title="供应商设置">⚙</button>',
      '    <button class="ai-icon" id="aiClose" type="button" title="关闭（Esc）">✕</button>',
      '  </div>',
      '</header>',
      '<div class="ai-scroll" id="aiBody"></div>',
      '<footer class="ai-compose" id="aiCompose">',
      '  <textarea id="aiInput" rows="1" placeholder="问点什么，或让它改点什么…"></textarea>',
      '  <button class="ai-send" id="aiSend" type="button">发送</button>',
      '</footer>',
    ].join('');
    document.body.appendChild(drawer);

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

  async function open() {
    ST.open = true;
    drawer.hidden = false;
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
      if (text) {
        const bubble = el('div', 'ai-msg is-bot');
        bubble.textContent = text;
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
    });

    if (ST.optimistic) {
      const bubble = el('div', 'ai-msg is-user');
      bubble.textContent = ST.optimistic;
      body.appendChild(bubble);
    }
    if (ST.sending) {
      body.appendChild(el('div', 'ai-msg is-bot is-pending', '思考中…'));
    }
    if (!messages.length && !ST.optimistic && !ST.sending && !ST.noCredential) {
      body.appendChild(el(
        'p', 'ai-hint',
        '可以直接问世界里的设定，也可以让我新建或修改文档——改动会先进「待审阅」，你点应用才会真正生效。',
      ));
    }
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
        if (change.error) row.appendChild(el('div', 'ai-change-error', change.error));
        card.appendChild(row);
      });

      if (canEdit() && changeset.status === 'pending') {
        const acts = el('div', 'ai-cs-acts');
        const apply = el('button', 'ai-btn is-primary', '应用');
        apply.type = 'button';
        apply.dataset.act = 'apply';
        apply.dataset.id = String(changeset.id);
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
    node.disabled = true;
    try {
      const data = await aiFetch(`/api/world/ai/changesets/${id}/apply`, { method: 'POST' });
      const failed = data.failed || 0;
      say(failed ? `已应用 ${data.applied} 条，${failed} 条失败` : `已应用 ${data.applied} 条改动`,
        failed ? { kind: 'err' } : undefined);
      await refreshPending();
      renderBadge();
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

    try {
      const data = await aiFetch('/api/world/ai/chat', { method: 'POST', body: payload });
      ST.optimistic = '';
      const conversation = data.conversation;
      if (conversation && conversation.id) {
        await openConversation(conversation.id);
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
      ST.sending = false;
      autosize();
      render();
    }
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
