/* 任务栏里的明暗切换。
 *
 * 三个独立页（关系树 / 时间线 / 地图）与 /world 共用同一份世界主题：
 * 点一下先本地生效（切 data-theme），再 PUT 回世界配置；写失败就退回原档。
 * 按钮语义同工作区：显示"点下去会切到的那一档"——深色时是太阳 + 浅色。
 */
(function () {
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
    '<path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>' +
    '<path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
  var MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>';

  var buttons = document.querySelectorAll('[data-theme-toggle]');
  if (!buttons.length) return;

  function currentMode() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function paint() {
    var dark = currentMode() === 'dark';
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'false' : 'true');
      btn.title = dark ? '切换到浅色模式' : '切换到深色模式';
      var glyph = btn.querySelector('.theme-toggle__glyph');
      if (glyph) {
        glyph.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (dark ? SUN : MOON) + '</svg>';
      }
      var label = btn.querySelector('.theme-toggle__text');
      if (label) label.textContent = dark ? '浅色' : '深色';
    });
  }

  function apply(mode) {
    document.documentElement.dataset.theme = mode;
    paint();
  }

  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      var prev = currentMode();
      var next = prev === 'light' ? 'dark' : 'light';
      apply(next);
      var api = btn.getAttribute('data-world-api');
      if (!api) return;
      fetch(api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_config: { mode: next } })
      }).then(function (res) {
        if (!res.ok) throw new Error('theme save failed');
      }).catch(function () {
        apply(prev);
      });
    });
  });

  paint();
})();
