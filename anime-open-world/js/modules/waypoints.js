/* =====================================================================
 * Astra 传送锚点 [L2] —— 原神式传送网络
 * - 全岛散布锚点，靠近按 F 激活（光柱由灰变蓝）
 * - 按 V 打开传送面板，点击已激活锚点立即传送
 * - 小地图画蓝色菱形标记
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const WP = { points: [], panelOpen: false };


  A.define({
    id: 'waypoints', layer: 2,
    deps: ['engine', 'world', 'ui', 'audio', 'player'],
    setup: function () { WP.init(); return WP; },
    update: function (dt, t) { WP.update(dt, t); }
  });
  const BLUE = 0x4fb3ff, GRAY = 0x9aa2b0;


  function buildAnchor(x, z, h, active) {
    const g = new THREE.Group();
    const stone = new THREE.MeshToonMaterial({ color: 0xb8c0cc });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.35, 18), stone);
    base.position.y = 0.18; base.receiveShadow = true; g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 24), new THREE.MeshToonMaterial({ color: 0x8a94a8 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.38; g.add(ring);
    /* 中央晶体 */
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42),
      new THREE.MeshToonMaterial({ color: active ? BLUE : GRAY, transparent: true, opacity: 0.92 }));
    crystal.position.y = 1.15; crystal.castShadow = true; g.add(crystal);
    /* 光柱 */
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: active ? BLUE : GRAY, transparent: true,
        opacity: active ? 0.3 : 0.08, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    beam.position.y = 30; g.add(beam);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: A.engine.glowTexture('rgba(150,210,255,1)', 'rgba(150,210,255,0)'),
      color: active ? BLUE : GRAY, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(3, 3, 1); glow.position.y = 1.2; g.add(glow);

    g.position.set(x, h, z);
    A.engine.scene.add(g);
    return {
      group: g, crystal: crystal, beam: beam, beamMat: beam.material,
      crystalMat: crystal.material, glow: glow,
      x: x, z: z, h: h, active: active
    };
  }

  WP.init = function () {
    const cfg = A.world.cfg.waypoints || { count: 3 };
    const count = cfg.count || 3;
    const T = A.world.cfg.terrain;
    /* 祭坛旁一个默认激活 + 采样其余 */
    const spots = A.world.sampleSpots(count, A.world.heightAt, {
      seed: T.seed + 41, minH: 3, maxH: 24, maxSlope: 1.2,
      radius: T.size * 0.35,
      keepClear: [
        { x: A.world.spawn.x, z: A.world.spawn.z, r: 30 },
        A.world.altar ? { x: A.world.altar.x, z: A.world.altar.z, r: 18 } : null
      ].filter(Boolean)
    });
    /* 第一个 = 祭坛锚点（默认激活） */
    const ax = A.world.altar ? A.world.altar.x + 8 : A.world.spawn.x;
    const az = A.world.altar ? A.world.altar.z + 8 : A.world.spawn.z;
    WP.points.push(buildAnchor(ax, az, A.world.heightAt(ax, az), true));
    spots.forEach(function (s) {
      WP.points.push(buildAnchor(s.x, s.z, A.world.heightAt(s.x, s.z), false));
    });

    buildPanel();

    /* F 激活最近的未激活锚点 */
    document.addEventListener('astra-key', function (e) {
      if (e.detail !== 'KeyF' || A.state.mode !== 'play') return;
      const p = A.shared.playerPos;
      let best = null, bd = 2.8;
      WP.points.forEach(function (w) {
        if (w.active) return;
        const d = Math.hypot(w.x - p.x, w.z - p.z);
        if (d < bd) { bd = d; best = w; }
      });
      if (best) {
        best.active = true;
        best.crystalMat.color.setHex(BLUE);
        best.beamMat.color.setHex(BLUE);
        best.beamMat.opacity = 0.3;
        best.glow.material.color.setHex(BLUE);
        A.audio.heal();
        A.ui.showToast('传送锚点已激活！按 V 打开传送面板', 2200);
      }
    });
    /* V 打开/关闭传送面板 */
    document.addEventListener('astra-key', function (e) {
      if (e.detail !== 'KeyV' || A.state.mode !== 'play') return;
      togglePanel();
    });
  };

  function buildPanel() {
    const panel = document.getElementById('wpPanel');
    if (!panel) return;
    WP.listEl = document.getElementById('wpList');
    WP.renderList = function () {
      WP.listEl.innerHTML = '';
      WP.points.forEach(function (w, i) {
        const btn = document.createElement('button');
        btn.className = 'charBtn' + (w.active ? '' : ' disabled');
        btn.textContent = w.active ? '锚点 ' + (i + 1) : '未激活';
        btn.disabled = !w.active;
        btn.onclick = function () {
          if (!w.active) return;
          WP.teleport(w);
          togglePanel();
        };
        WP.listEl.appendChild(btn);
      });
    };
    WP.renderList();
  }
  function togglePanel() {
    const panel = document.getElementById('wpPanel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    WP.renderList();
  }
  WP.teleport = function (w) {
    const p = A.player.root.position;
    p.set(w.x, A.world.heightAt(w.x, w.z) + 0.1, w.z);
    A.player.state.vy = 0;
    A.player.state.climbing = false;
    A.player.state.gliding = false;
    A.audio.heal();
    A.effects.burst(p.x, p.y + 1, p.z, 0x7fd4ff, 16);
    A.ui.showToast('已传送到锚点', 1400);
  };

  WP.update = function (dt, t) {
    if (A.state.mode !== 'play') return;
    const p = A.shared.playerPos;
    WP.points.forEach(function (w) {
      w.crystal.rotation.y += dt * (w.active ? 1.2 : 0.3);
      if (w.active) {
        w.beamMat.opacity = 0.25 + Math.sin(t * 2.2) * 0.08;
        w.glow.material.opacity = 0.5 + Math.sin(t * 2.2) * 0.15;
      }
      /* 靠近提示 */
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (!w.active && d < 3 && !w._hinted) {
        w._hinted = true;
        A.ui.showToast('按 F 激活传送锚点', 1600);
      }
      if (w.active) w._hinted = false;
    });
  };

  A.waypoints = WP;
})();
