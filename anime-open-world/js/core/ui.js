/* =====================================================================
 * Astra UI 层 [L0] —— HUD 文案 / 提示 / 体力 / 结算卡片（纯 DOM，可换皮）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const U = {};

  A.define({
    id: 'ui', layer: 0, deps: [],
    setup: function () { U.init(); return U; }
  });

  let toastTimer = null;

  U.init = function () {
    U.hud = document.getElementById('hud');
    U.questCount = document.getElementById('questCount');
    U.questDist = document.getElementById('questDist');
    U.questObjective = document.getElementById('questObjective');
    U.staminaWrap = document.getElementById('staminaWrap');
    U.staminaBar = document.getElementById('staminaBar');
    U.toast = document.getElementById('toast');
    U.clock = document.getElementById('clock');
    U.hint = document.getElementById('hint');
    U.startOverlay = document.getElementById('startOverlay');
    U.winCard = document.getElementById('winCard');
    U.winStats = document.getElementById('winStats');
    U.sceneList = document.getElementById('sceneList');
  };

  U.showToast = function (text, dur) {
    U.toast.textContent = text;
    U.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { U.toast.classList.remove('show'); }, dur || 1600);
  };
  U.setQuest = function (obj, countText) {
    U.questObjective.textContent = obj;
    U.questCount.textContent = countText;
  };
  U.setDist = function (text) {
    U.questDist.textContent = text;
    U.questDist.style.display = text ? 'block' : 'none';
  };
  U.setStamina = function (v) {
    U.staminaBar.style.width = v + '%';
    U.staminaWrap.classList.toggle('show', v < 99.5);
  };
  U.setClock = function (text) { U.clock.textContent = text; };
  U.setStats = function (kills, chests, chestsTotal) {
    const el = document.getElementById('statLine');
    if (el) el.textContent = '⚔ 击杀 ' + kills + '　🎁 宝箱 ' + chests + '/' + chestsTotal;
  };
  U.setHP = function (v, max) {
    const bar = document.getElementById('hpBar');
    const txt = document.getElementById('hpText');
    if (bar) bar.style.width = Math.max(0, v / max * 100) + '%';
    if (txt) txt.textContent = Math.max(0, v | 0) + ' / ' + max;
  };
  /* 屏幕坐标处的伤害数字（0.8 秒上浮消散） */
  U.damageNumber = function (sx, sy, text, color) {
    const layer = document.getElementById('dmgLayer');
    if (!layer) return;
    const d = document.createElement('div');
    d.className = 'dmg';
    d.style.left = sx + 'px';
    d.style.top = sy + 'px';
    d.style.color = color || '#ffd45e';
    d.textContent = text;
    layer.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  };
  U.flashHit = function () {
    const el = document.getElementById('hitFlash');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '0.9';
    void el.offsetWidth;
    el.style.transition = 'opacity .5s';
    el.style.opacity = '0';
  };
  U.showWin = function (statsHtml) {
    U.winStats.innerHTML = statsHtml;
    U.winCard.classList.remove('hidden');
  };
  U.hideWin = function () { U.winCard.classList.add('hidden'); };

  A.ui = U;
})();
