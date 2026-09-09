/* =====================================================================
 * Astra 宝箱 [L2] —— 探索奖励：靠近按 F 开启，随机奖励，小地图标记
 * 数量由 scene.json.chests 配置；奖励类型随机（生命上限/回复/风之晶）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const CH = { chests: [], opened: 0 };

  A.define({
    id: 'chests', layer: 2,
    deps: ['engine', 'world', 'ui', 'audio', 'player'],
    setup: function () { CH.init(); A.chests = CH; return CH; },
    update: function (dt, t) { CH.update(dt, t); }
  });

  const GOLD = 0xf0c75e, WOOD = 0x8a5a37;

  function buildChest(x, z, h, idx) {
    const g = new THREE.Group();
    const wood = new THREE.MeshToonMaterial({ color: WOOD });
    const gold = new THREE.MeshToonMaterial({ color: GOLD });
    /* 箱体 */
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), wood);
    base.position.y = 0.28;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    /* 金边 */
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.66), gold);
    rim.position.y = 0.5; g.add(rim);
    /* 盖子（独立 pivot 便于开盖旋转） */
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.55, -0.3);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.6), wood);
    lid.position.set(0, 0.11, 0.3);
    lid.castShadow = true;
    lidPivot.add(lid);
    const lidRim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.66), gold);
    lidRim.position.set(0, 0.2, 0.3);
    lidPivot.add(lidRim);
    g.add(lidPivot);
    /* 锁扣 */
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), gold);
    lock.position.set(0, 0.52, 0.32); g.add(lock);

    g.position.set(x, h, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    A.engine.scene.add(g);

    /* 光柱提示（未开启时） */
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: A.engine.glowTexture('rgba(255,220,130,0.9)', 'rgba(255,220,130,0)'),
      color: 0xffd45e, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(1.6, 1.6, 1);
    glow.position.y = 1.1;
    g.add(glow);

    return {
      group: g, lidPivot: lidPivot, glow: glow, lock: lock,
      opened: false, openT: 0, hinted: false, idx: idx
    };
  }

  CH.init = function () {
    const cc = A.world.cfg.chests || {};
    const n = typeof cc === 'number' ? cc : (cc.count || 5);
    const T = A.world.cfg.terrain;
    const spots = A.world.sampleSpots(n, A.world.heightAt, {
      seed: T.seed + 31, minH: 2, maxH: 22, maxSlope: 1.8,
      radius: T.size * 0.38,
      keepClear: [
        { x: A.world.spawn.x, z: A.world.spawn.z, r: 15 },
        A.world.altar ? { x: A.world.altar.x, z: A.world.altar.z, r: 14 } : null
      ].filter(Boolean)
    });
    spots.forEach(function (s, i) {
      const c = buildChest(s.x, s.z, s.h, i);
      c.reward = (function () {
        const r = Math.random();
        if (r < 0.4) return 'hp';        // 生命上限 +10 并回满
        if (r < 0.7) return 'stamina';   // 体力瞬间回满
        return 'heal';                   // 全回复
      })();
      CH.chests.push(c);
    });
    CH.total = CH.chests.length;
    A.shared.chestTotal = CH.total;
    window.__chestInit = { total: CH.total, ok: true };
    A.shared.chestOpened = function () { return CH.opened; };

    /* F 键开启（取最近的未开宝箱） */
    document.addEventListener('astra-key', function (e) {
      if (e.detail !== 'KeyF' || A.state.mode !== 'play') return;
      const p = A.shared.playerPos;
      let best = null, bd = 2.3;
      CH.chests.forEach(function (c) {
        if (c.opened) return;
        const d = Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z);
        if (d < bd) { bd = d; best = c; }
      });
      if (best) CH.open(best);
    });
  };

  CH.open = function (c) {
    if (c.opened) return;
    c.opened = true;
    c.openT = 0;
    c.glow.visible = false;
    c.lock.visible = false;
    A.audio.heal();
    CH.opened++;
    const p = A.shared.playerPos;
    const S = A.player.state;
    const r = c.reward;
    if (r === 'hp') {
      S.maxHp += 10; S.hp = S.maxHp;
      A.ui.setHP(S.hp, S.maxHp);
      A.ui.showToast('🎁 生命上限 +10！', 2000);
    } else if (r === 'stamina') {
      S.stamina = 100;
      A.ui.showToast('🎁 体力完全恢复！', 2000);
    } else {
      S.hp = S.maxHp;
      A.ui.setHP(S.hp, S.maxHp);
      A.ui.showToast('🎁 完全回复！', 2000);
    }
    A.ui.setStats(A.combat.kills, CH.opened, CH.total);
  };

  CH.update = function (dt, t) {
    if (A.state.mode !== 'play') return;
    const p = A.shared.playerPos;
    /* HUD 统计（击杀来自 combat 模块共享槽） */
    A.ui.setStats(A.shared.kills || 0, CH.opened, CH.total);
    CH.chests.forEach(function (c) {
      if (c.opened && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 2.2);
        c.lidPivot.rotation.x = -1.15 * c.openT;   // 开盖动画
      }
      if (!c.opened) {
        c.glow.material.opacity = 0.35 + Math.sin(t * 2.5 + c.idx) * 0.2;
        /* 靠近提示一次 */
        const d = Math.hypot(c.group.position.x - p.x, c.group.position.z - p.z);
        if (d < 2.3 && !c.hinted) {
          c.hinted = true;
          A.ui.showToast('按 F 开启宝箱', 1600);
        }
        if (d >= 2.3) c.hinted = false;
      }
    });
  };

  A.chests = CH;
})();
