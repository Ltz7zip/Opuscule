/* ==========================================================================
   个人主页的编辑模式（/u/<username>，仅本人加载）
   --------------------------------------------------------------------------
   页面本身是服务端渲染好的：所有单例区块都在 DOM 里，隐藏的带 is-off。
   这里只做三件事：
   1. 开关编辑模式（露出区块工具栏与右侧「自定义主页」面板）；
   2. 区块上移 / 下移 / 隐藏 / 显示 / 删除，以及自定义文字的内联输入；
   3. 收集面板与 DOM 状态，POST 到 /api/world/profile，成功后刷新。
   ========================================================================== */

(function () {
  'use strict';

  var dataNode = document.getElementById('profile-data');
  var layoutEl = document.getElementById('profileLayout');
  if (!dataNode || !layoutEl) return;

  var profile = {};
  try {
    profile = JSON.parse(dataNode.textContent || '{}') || {};
  } catch (err) {
    profile = {};
  }

  var body = document.body;
  var panel = document.getElementById('profilePanel');
  var sideCol = layoutEl.querySelector('[data-region="side"]');
  var mainCol = layoutEl.querySelector('[data-region="main"]');
  var SIDE_TYPES = ['bio', 'stats', 'links', 'genres'];

  var editToggle = document.getElementById('profileEditToggle');
  var heroToggle = document.getElementById('profileEditToggleHero');
  var panelClose = document.getElementById('panelClose');
  var cancelBtn = document.getElementById('pfCancel');
  var saveBtn = document.getElementById('pfSave');
  var statusEl = document.getElementById('pfStatus');
  var addNoteBtn = document.getElementById('pfAddNote');

  var fields = {
    display: document.getElementById('pfDisplay'),
    headline: document.getElementById('pfHeadline'),
    bio: document.getElementById('pfBio'),
    location: document.getElementById('pfLocation'),
    website: document.getElementById('pfWebsite'),
  };
  var linksWrap = document.getElementById('pfLinks');
  var linkAdd = document.getElementById('pfLinkAdd');
  var layoutButtons = document.querySelectorAll('#pfLayout [data-layout-value]');
  var swatches = document.querySelectorAll('#pfAccent [data-accent]');
  var accentInput = document.getElementById('pfAccentCustom');
  var pinnedWrap = document.getElementById('pfPinned');
  var publicInput = document.getElementById('pfPublic');

  var layout = profile.layout === 'single' ? 'single' : 'two';
  var accent = profile.accent || '#3ddc97';
  // 精选世界的勾选顺序就是展示顺序；已保存的顺序从这里起步。
  var pinOrder = Array.isArray(profile.pinned_ids) ? profile.pinned_ids.map(Number) : [];

  /* ------------------------------------------------------------------ 面板 */
  function fillPanel() {
    if (fields.display) fields.display.value = profile.display_name || '';
    if (fields.headline) fields.headline.value = profile.headline || '';
    if (fields.bio) fields.bio.value = profile.bio || '';
    if (fields.location) fields.location.value = profile.location || '';
    if (fields.website) fields.website.value = profile.website || '';
    renderLinks(profile.links);
    markLayout();
    applyAccent(accent);
    if (publicInput) publicInput.checked = !!profile.is_public;
  }

  /* -------------------------------------------------------------- 外部链接 */
  function linkInput(className, placeholder, maxLength, value) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.value = value || '';
    return input;
  }

  function addLinkRow(link) {
    if (!linksWrap) return null;
    var row = document.createElement('div');
    row.className = 'link-row';
    var label = linkInput('link-label', '名称，如 微博', 80, link && link.label);
    var url = linkInput('link-url', 'https://…', 300, link && link.url);
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-remove';
    remove.title = '删除这条链接';
    remove.setAttribute('aria-label', '删除这条链接');
    remove.innerHTML = iconHtml('x', 14);
    remove.addEventListener('click', function () { row.remove(); });
    row.append(label, url, remove);
    linksWrap.appendChild(row);
    return label;
  }

  function renderLinks(links) {
    if (!linksWrap) return;
    linksWrap.textContent = '';
    (Array.isArray(links) ? links : []).forEach(function (link) {
      addLinkRow(link || {});
    });
  }

  function collectLinks() {
    if (!linksWrap) return [];
    return Array.prototype.slice.call(linksWrap.querySelectorAll('.link-row'))
      .map(function (row) {
        return {
          label: row.querySelector('.link-label').value.trim(),
          url: row.querySelector('.link-url').value.trim(),
        };
      })
      .filter(function (item) { return !!item.url; });
  }

  /* ---------------------------------------------------------------- 主题色 */
  function applyAccent(value) {
    accent = value || '#3ddc97';
    body.style.setProperty('--profile-accent', accent);
    if (accentInput) accentInput.value = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#3ddc97';
    Array.prototype.forEach.call(swatches, function (button) {
      button.classList.toggle(
        'is-active',
        (button.dataset.accent || '').toLowerCase() === accent.toLowerCase()
      );
    });
  }

  /* ------------------------------------------------------------------ 布局 */
  function markLayout() {
    layoutEl.classList.toggle('is-single', layout === 'single');
    Array.prototype.forEach.call(layoutButtons, function (button) {
      button.classList.toggle('is-active', button.dataset.layoutValue === layout);
    });
  }

  /** 切换布局时把区块搬到对应的栏里，避免单栏下侧栏区块被藏起来。 */
  function arrangeBlocks() {
    var blocks = Array.prototype.slice.call(layoutEl.querySelectorAll('.profile-block'));
    blocks.forEach(function (block) {
      if (layout === 'single') {
        mainCol.appendChild(block);
      } else if (SIDE_TYPES.indexOf(block.dataset.blockType) !== -1) {
        sideCol.appendChild(block);
      } else {
        mainCol.appendChild(block);
      }
    });
  }

  /* ------------------------------------------------------------ 区块工具条 */
  function setBlockVisible(block, visible) {
    block.classList.toggle('is-off', !visible);
    block.dataset.visible = visible ? '1' : '0';
  }

  function moveBlock(block, direction) {
    var parent = block.parentNode;
    var sibling = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
    if (!sibling || !sibling.classList.contains('profile-block')) return;
    if (direction < 0) parent.insertBefore(block, sibling);
    else parent.insertBefore(sibling, block);
  }

  function noteBlockId() {
    return 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function addNoteBlock() {
    var template = document.getElementById('noteTemplate');
    if (!template || !template.content.firstElementChild) return;
    var block = template.content.firstElementChild.cloneNode(true);
    block.dataset.blockId = noteBlockId();
    mainCol.appendChild(block);
    var title = block.querySelector('[data-note-title]');
    if (title) title.focus();
  }

  function collectBlocks() {
    var out = [];
    [sideCol, mainCol].forEach(function (col, index) {
      if (!col) return;
      // 单栏时侧栏已经空了；双栏顺序按「侧栏 → 主栏」，与默认排版一致。
      if (index === 0 && layoutEl.classList.contains('is-single')) return;
      Array.prototype.forEach.call(col.querySelectorAll('.profile-block'), function (block) {
        var type = block.dataset.blockType;
        if (!type) return;
        var item = {
          id: block.dataset.blockId || type,
          type: type,
          visible: block.dataset.visible !== '0',
        };
        if (type === 'note') {
          var title = block.querySelector('[data-note-title]');
          var content = block.querySelector('[data-note-content]');
          item.title = title ? title.value.trim() : '';
          item.content = content ? content.value.trim() : '';
          // 什么都没写的空区块不提交，省得主页上留一块空白。
          if (!item.title && !item.content) return;
        }
        out.push(item);
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ 编辑模式 */
  function enterEdit() {
    body.classList.add('is-editing');
    if (editToggle) editToggle.textContent = '退出编辑';
    if (panel) panel.removeAttribute('aria-hidden');
  }

  function leaveEdit() {
    window.location.reload();
  }

  if (editToggle) {
    editToggle.addEventListener('click', function () {
      if (body.classList.contains('is-editing')) leaveEdit();
      else enterEdit();
    });
  }
  if (heroToggle) heroToggle.addEventListener('click', enterEdit);
  if (panelClose) panelClose.addEventListener('click', leaveEdit);
  if (cancelBtn) cancelBtn.addEventListener('click', leaveEdit);

  /* -------------------------------------------------------------- 区块事件 */
  layoutEl.addEventListener('click', function (event) {
    var button = event.target.closest('.block-actions [data-act]');
    if (!button) return;
    var block = button.closest('.profile-block');
    if (!block) return;
    var action = button.dataset.act;
    if (action === 'up') {
      moveBlock(block, -1);
    } else if (action === 'down') {
      moveBlock(block, 1);
    } else if (action === 'hide') {
      setBlockVisible(block, false);
    } else if (action === 'show') {
      setBlockVisible(block, true);
    } else if (action === 'remove') {
      if (window.confirm('删除这个自定义区块？')) block.remove();
    }
  });

  /* ------------------------------------------------------------ 面板事件 */
  if (linkAdd) {
    linkAdd.addEventListener('click', function () {
      var label = addLinkRow({});
      if (label) label.focus();
    });
  }

  Array.prototype.forEach.call(layoutButtons, function (button) {
    button.addEventListener('click', function () {
      layout = button.dataset.layoutValue === 'single' ? 'single' : 'two';
      markLayout();
      arrangeBlocks();
    });
  });

  Array.prototype.forEach.call(swatches, function (button) {
    button.addEventListener('click', function () {
      applyAccent(button.dataset.accent || '#3ddc97');
    });
  });

  if (accentInput) {
    accentInput.addEventListener('input', function () {
      applyAccent(accentInput.value);
    });
  }

  if (pinnedWrap) {
    Array.prototype.forEach.call(
      pinnedWrap.querySelectorAll('input[type="checkbox"]'),
      function (checkbox) {
        checkbox.addEventListener('change', function () {
          var id = Number(checkbox.value);
          var index = pinOrder.indexOf(id);
          if (checkbox.checked && index === -1) pinOrder.push(id);
          if (!checkbox.checked && index !== -1) pinOrder.splice(index, 1);
        });
      }
    );
  }

  if (addNoteBtn) addNoteBtn.addEventListener('click', addNoteBlock);

  /* ------------------------------------------------------------------ 保存 */
  function payloadFromPanel() {
    return {
      display_name: fields.display ? fields.display.value.trim() : '',
      headline: fields.headline ? fields.headline.value.trim() : '',
      bio: fields.bio ? fields.bio.value : '',
      location: fields.location ? fields.location.value.trim() : '',
      website: fields.website ? fields.website.value.trim() : '',
      links: collectLinks(),
      accent: accent,
      layout: layout,
      blocks: collectBlocks(),
      pinned: pinOrder,
      is_public: publicInput ? publicInput.checked : true,
    };
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      if (statusEl) statusEl.textContent = '正在保存…';

      fetch('/api/world/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payloadFromPanel()),
      }).then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data || {} };
        }, function () {
          return { ok: response.ok, data: {} };
        });
      }).then(function (result) {
        if (!result.ok) throw new Error(result.data.error || '保存失败');
        if (statusEl) statusEl.textContent = '已保存，正在刷新…';
        window.location.reload();
      }).catch(function (err) {
        if (statusEl) statusEl.textContent = err.message || '保存失败';
        saveBtn.disabled = false;
      });
    });
  }

  fillPanel();
})();
