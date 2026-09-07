/* =====================================================================
 * Astra 任务 [L2] —— 数据驱动的收集任务（scene.json.quest 配置数量）
 * 阶段1：收集风之晶 → 阶段2：返回祭坛
 * 完成时通过事件总线广播 quest:complete（特效/音效由其他模块响应）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const Q = { crystals: [] };

  A.define({
    id: 'quest', layer: 2, deps: ['engine', 'world', 'ui', 'audio'],
    setup: function () { Q.init(); A.shared.poi = Q.crystals; return Q; },
    update: function (dt, t) {
      if (A.state.mode !== 'play') return;   // 结算/开始界面不判定收集
      Q.update(dt, t);
    }
  });

  Q.init = function () {
    const cfg = (A.world.cfg.quest) || { crystals: 12 };
    const geo = new THREE.OctahedronGeometry(0.42);
    const mat = new THREE.MeshToonMaterial({ color: 0x52e6ff, emissive: 0x1899b3 });
    const glow = A.engine.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const hAt = A.world.heightAt;
    const altar = A.world.altar;
    const rnd = A.world.rng(A.world.cfg.terrain.seed + 11);
    const size = A.world.cfg.terrain.size;
    const list = [];
    for (let k = 0; k < 600 && list.length < cfg.crystals; k++) {
      const x = (rnd() * 2 - 1) * size * 0.37, z = (rnd() * 2 - 1) * size * 0.37;
      const h = hAt(x, z);
      if (h < 3 || h > 26) continue;
      if (altar && Math.hypot(x - altar.x, z - altar.z) < 30) continue;
      if (Math.hypot(x - A.world.spawn.x, z - A.world.spawn.z) < 34) continue;
      if (list.some(function (p) { return Math.hypot(p.x - x, p.z - z) < 42; })) continue;
      list.push({ x: x, z: z, h: h });
    }
    list.forEach(function (p, i) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.h + 1.15, p.z);
      m.castShadow = true;
      const g = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0x7feaff, transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      g.scale.set(2.2, 2.2, 1);
      m.add(g);
      A.engine.scene.add(m);
      Q.crystals.push({ mesh: m, base: p.h + 1.15, collected: false, phase: i * 1.7 });
    });
    Q.stage = 1;
    A.ui.setQuest('收集散落在岛上的风之晶', '◇ 风之晶 0 / ' + Q.crystals.length);
  };

  Q.update = function (dt, t) {
    const p = A.player.root.position;
    Q.crystals.forEach(function (c) {
      if (c.collected) return;
      c.mesh.rotation.y += dt * 1.6;
      c.mesh.position.y = c.base + Math.sin(t * 2 + c.phase) * 0.16;
      if (c.mesh.position.distanceToSquared(p) < 6.76) {
        c.collected = true;
        c.mesh.visible = false;
        A.audio.collect();
        const got = Q.crystals.filter(function (x) { return x.collected; }).length;
        A.ui.setQuest('收集散落在岛上的风之晶', '◇ 风之晶 ' + got + ' / ' + Q.crystals.length);
        if (got >= Q.crystals.length) {
          Q.stage = 2;
          if (A.world.beam) A.world.beam.visible = true;
          A.ui.setQuest('返回风之祭坛', '◇ 风之晶 ' + got + ' / ' + Q.crystals.length);
          A.ui.showToast('✦ 集齐了所有风之晶！返回风之祭坛', 3000);
        } else {
          A.ui.showToast('获得风之晶 ✦ ' + got + ' / ' + Q.crystals.length, 1100);
        }
      }
    });

    if (Q.stage === 2 && A.world.altar) {
      const a = A.world.altar;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      A.ui.setDist('↗ 距离祭坛 ' + (d | 0) + ' m');
      if (A.world.beam) A.world.beam.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
      if (d < 5 && A.state.mode === 'play') Q.win();
    }
  };

  Q.win = function () {
    A.state.mode = 'win';
    const sec = A.state.elapsed | 0;
    A.ui.showWin('风之晶 ' + Q.crystals.length + ' / ' + Q.crystals.length +
      '<br>用时 ' + String((sec / 60) | 0).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'));
    A.audio.win();
    const a = A.world.altar || { x: 0, z: 0, h: 10 };
    /* 广播完成事件：烟花由 effects 模块响应，任务模块不关心细节 */
    A.emit('quest:complete', { x: a.x, z: a.z, h: a.h });
  };
  document.getElementById('continueBtn').addEventListener('click', function () {
    A.ui.hideWin();
    A.state.mode = 'play';
  });

  A.quest = Q;
})();
