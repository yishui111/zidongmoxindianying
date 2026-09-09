/* =====================================================================
 * Astra 特效 [L2] —— 风元素光尘（跟随玩家）+ 烟花
 * 光尘跟随 Astra.shared.playerPos；监听 quest:complete 放烟花
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const FX = { fireworks: [] };

  A.define({
    id: 'effects', layer: 2, deps: ['engine'],
    setup: function () {
      FX.init();
      /* 事件总线示例：任务完成 → 放烟花（任务模块不感知特效细节） */
      A.on('quest:complete', function (e) {
        const cols = [0x7feaff, 0xffb02e, 0xff8fb8, 0xffffff];
        for (let i = 0; i < 5; i++) {
          (function (i) {
            setTimeout(function () {
              FX.firework(
                e.x + (Math.random() * 2 - 1) * 14, e.h + 10 + Math.random() * 8,
                e.z + (Math.random() * 2 - 1) * 14,
                cols[i % cols.length]);
            }, i * 380);
          })(i);
        }
      });
      return FX;
    },
    update: function (dt) { FX.update(dt); }
  });

  FX.init = function () {
    const rnd = A.world.rng(55);
    const n = 70;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() * 2 - 1) * 40;
      pos[i * 3 + 1] = rnd() * 14 + 0.5;
      pos[i * 3 + 2] = (rnd() * 2 - 1) * 40;
      vel[i * 3] = 0.8 + rnd() * 1.4;
      vel[i * 3 + 1] = (rnd() - 0.3) * 0.4;
      vel[i * 3 + 2] = 0.3 + rnd() * 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    FX.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: A.engine.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      color: 0xbff4ff, size: 0.85, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    FX.motes.userData.vel = vel;
    A.engine.scene.add(FX.motes);
  };

  FX.firework = function (x, y, z, colorHex) {
    FX.burst(x, y, z, colorHex, 130, 7, 1.5);
  };

  /* 通用小爆裂：count 个光点向外扩散 */
  FX.burst = function (x, y, z, colorHex, count, speed, size) {
    const rnd = Math.random;
    const n = count || 16;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), sp = (speed || 6) * (0.5 + rnd());
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      vel[i * 3 + 1] = Math.cos(ph) * sp;
      vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: A.engine.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      color: colorHex || 0xffffff, size: size || 1, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    A.engine.scene.add(pts);
    FX.fireworks.push({ pts: pts, vel: vel, life: 0, maxLife: 1.2, gravity: 3 });
  };

  FX.update = function (dt) {
    /* 光尘包裹盒跟随玩家 */
    const pp = A.shared.playerPos || { x: 0, z: 0, y: 0 };
    const pos = FX.motes.geometry.attributes.position;
    const arr = pos.array, vel = FX.motes.userData.vel;
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3] += vel[i * 3] * dt;
      arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (arr[i * 3] - pp.x > 45) arr[i * 3] -= 90;
      if (pp.x - arr[i * 3] > 45) arr[i * 3] += 90;
      if (arr[i * 3 + 2] - pp.z > 45) arr[i * 3 + 2] -= 90;
      if (pp.z - arr[i * 3 + 2] > 45) arr[i * 3 + 2] += 90;
      if (arr[i * 3 + 1] > 16) arr[i * 3 + 1] = 0.5;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 15;
    }
    pos.needsUpdate = true;

    /* 烟花 */
    for (let i = FX.fireworks.length - 1; i >= 0; i--) {
      const f = FX.fireworks[i];
      f.life += dt;
      const fp = f.pts.geometry.attributes.position;
      const fa = fp.array;
      for (let j = 0; j < fp.count; j++) {
        f.vel[j * 3 + 1] -= 5 * dt;
        fa[j * 3] += f.vel[j * 3] * dt;
        fa[j * 3 + 1] += f.vel[j * 3 + 1] * dt;
        fa[j * 3 + 2] += f.vel[j * 3 + 2] * dt;
      }
      fp.needsUpdate = true;
      f.pts.material.opacity = Math.max(0, 1 - f.life / f.maxLife);
      if (f.life > f.maxLife) {
        A.engine.scene.remove(f.pts);
        f.pts.geometry.dispose();
        f.pts.material.dispose();
        FX.fireworks.splice(i, 1);
      }
    }
  };

  A.effects = FX;
})();
