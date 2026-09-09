/* =====================================================================
 * Astra 存档 [L2] —— localStorage 自动保存/加载
 * 收集：quest(晶体) / combat(击杀) / chests(开启) / waypoints(激活) / player(成长)
 * 触发：关键事件立即保存 + 每 10 秒自动保存
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const SV = { KEY: 'fengzhiyuan-save-v1', timer: null };

  SV.collect = function () {
    const A2 = window.Astra;
    const data = {
      v: 1,
      dayT: A2.sky ? A2.sky.dayT : 0.145,
      kills: A2.combat ? A2.combat.kills : 0,
      crystals: [],
      chests: [],
      waypoints: [],
      atk: A2.player ? (A2.player.state.atk || 0) : 0,
      maxHp: A2.player ? A2.player.state.maxHp : 100,
      huntDone: !!(A2.quest && A2.quest.huntDone)
    };
    (A2.quest ? A2.quest.crystals : []).forEach(function (c, i) {
      if (c.collected) data.crystals.push(i);
    });
    (A2.chests ? A2.chests.chests : []).forEach(function (c, i) {
      if (c.opened) data.chests.push(i);
    });
    (A2.waypoints ? A2.waypoints.points : []).forEach(function (w, i) {
      if (w.active) data.waypoints.push(i);
    });
    return data;
  };

  SV.save = function () {
    try {
      localStorage.setItem(SV.KEY, JSON.stringify(SV.collect()));
      return true;
    } catch (e) { return false; }
  };

  SV.load = function () {
    try {
      const raw = localStorage.getItem(SV.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  SV.clear = function () {
    try { localStorage.removeItem(SV.KEY); } catch (e) { }
  };

  /* ---------- 应用存档到各模块（boot 完成后调用） ---------- */
  SV.apply = function (data) {
    if (!data) return;
    const A2 = window.Astra;
    /* 晶体恢复 */
    if (A2.quest && data.crystals) {
      data.crystals.forEach(function (idx) {
        const c = A2.quest.crystals[idx];
        if (c && !c.collected) {
          c.collected = true;
          c.mesh.visible = false;
        }
      });
      const got = A2.quest.crystals.filter(function (c) { return c.collected; }).length;
      if (got >= A2.quest.crystals.length) {
        A2.quest.stage = 2;
        if (A2.world.beam) A2.world.beam.visible = true;
        A2.ui.setQuest('返回风之祭坛', '◇ 风之晶 ' + got + ' / ' + A2.quest.crystals.length);
      } else {
        A2.ui.setQuest('收集散落在岛上的风之晶', '◇ 风之晶 ' + got + ' / ' + A2.quest.crystals.length);
      }
    }
    /* 宝箱恢复 */
    if (A2.chests && data.chests) {
      data.chests.forEach(function (idx) {
        const c = A2.chests.chests[idx];
        if (c && !c.opened) {
          c.opened = true;
          c.openT = 1;
          c.lidPivot.rotation.x = -1.15;
          c.glow.visible = false;
          c.lock.visible = false;
        }
      });
    }
    /* 锚点恢复 */
    if (A2.waypoints && data.waypoints) {
      data.waypoints.forEach(function (idx) {
        const w = A2.waypoints.points[idx];
        if (w && !w.active) {
          w.active = true;
          w.crystalMat.color.setHex(w.crystalMat.color ? 0x4fb3ff : 0x4fb3ff);
          w.beamMat.color.setHex(0x4fb3ff);
          w.beamMat.opacity = 0.3;
          w.glow.material.color.setHex(0x4fb3ff);
        }
      });
    }
    /* 成长恢复 */
    if (A2.player && data.atk) A2.player.state.atk = data.atk;
    if (A2.player && data.maxHp) {
      A2.player.state.maxHp = data.maxHp;
      A2.player.state.hp = data.maxHp;
      A2.ui.setHP(data.maxHp, data.maxHp);
    }
    if (A2.quest && data.huntDone) A2.quest.huntDone = true;
    if (A2.sky && data.dayT !== undefined) A2.sky.dayT = data.dayT;
  };

  /* ---------- 自动保存 ---------- */
  SV.startAutoSave = function () {
    SV.timer = setInterval(function () {
      if (window.Astra.state.mode === 'play') SV.save();
    }, 10000);
    window.addEventListener('beforeunload', function () { SV.save(); });
  };

  A.save = SV;
})();
