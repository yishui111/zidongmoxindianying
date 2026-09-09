/* =====================================================================
 * Astra 昼夜与天象 [L2] —— 太阳/天色/雾/星空/云/灯柱（场景可配置时长与起始时刻）
 * 读取 Astra.shared.playerPos（由 player 模块写入），不直接引用 player
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const SK = { dayT: 0.145 };

  A.define({
    id: 'sky', layer: 2, deps: ['engine', 'world', 'ui'],
    setup: function (ctx) { SK.init(ctx.cfg.sky); return SK; },
    update: function (dt) { SK.update(dt); }
  });

  const P = {
    day: { top: new THREE.Color(0x4aa7e8), hor: new THREE.Color(0xbfe8f5), sun: new THREE.Color(0xfff1d0), sunI: 1.15, hemiI: 0.58 },
    sunset: { top: new THREE.Color(0x35548e), hor: new THREE.Color(0xffb27a), sun: new THREE.Color(0xffb27a), sunI: 0.85, hemiI: 0.4 },
    night: { top: new THREE.Color(0x0a1230), hor: new THREE.Color(0x1c2c55), sun: new THREE.Color(0x8fa8ff), sunI: 0.22, hemiI: 0.2 }
  };
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  function lerpPal(key, a, b, t) {
    c1.copy(P[a][key]); c2.copy(P[b][key]);
    return c1.lerp(c2, t);
  }

  SK.init = function (cfg) {
    SK.cfg = cfg || {};
    if (cfg && cfg.startTime !== undefined) SK.dayT = cfg.startTime;
    SK.dayLength = (cfg && cfg.dayLength) || 240;

    /* 星空 */
    const E = A.engine;
    const rnd = A.world.rng(99);
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, e = Math.asin(rnd() * 0.95 + 0.05);
      const r = 780;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    SK.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xdfeaff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0
    }));
    E.scene.add(SK.stars);

    /* 云 */
    SK.clouds = [];
    const cmat = new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const k = 2 + rnd() * 2;
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), cmat);
        s.position.set((rnd() - 0.5) * 2 * k, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 2);
        s.scale.set(1.6 + rnd(), 0.55 + rnd() * 0.3, 1 + rnd() * 0.5);
        g.add(s);
      }
      g.position.set((rnd() * 2 - 1) * 380, 62 + rnd() * 26, (rnd() * 2 - 1) * 380);
      g.userData.speed = 0.6 + rnd() * 0.8;
      E.scene.add(g);
      SK.clouds.push(g);
    }
    SK.sunDir = new THREE.Vector3();

    /* 太阳与月亮（随昼夜交替升落） */
    const glow = A.engine.glowTexture;
    SK.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow('rgba(255,244,200,1)', 'rgba(255,190,80,0)'),
      color: 0xffe9a0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    SK.sunSprite.scale.set(160, 160, 1);
    E.scene.add(SK.sunSprite);
    SK.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow('rgba(235,242,255,1)', 'rgba(150,180,255,0)'),
      color: 0xdfe8ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    SK.moonSprite.scale.set(90, 90, 1);
    E.scene.add(SK.moonSprite);
  };

  SK.update = function (dt) {
    const E = A.engine;
    SK.dayT = (SK.dayT + dt / SK.dayLength) % 1;
    const ang = SK.dayT * Math.PI * 2;
    const e = Math.sin(ang);
    SK.sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const player = A.shared.playerPos;

    if (e > 0.28 || e < -0.3) {
      const k = e > 0 ? 'day' : 'night';
      E.skyU.top.value.copy(P[k].top);
      E.skyU.bottom.value.copy(P[k].hor);
      E.sun.color.copy(P[k].sun);
      E.sun.intensity = P[k].sunI;
      E.hemi.intensity = P[k].hemiI;
    } else if (e > 0) {
      const t = 1 - e / 0.28;
      E.skyU.top.value.copy(lerpPal('top', 'day', 'sunset', t));
      E.skyU.bottom.value.copy(lerpPal('hor', 'day', 'sunset', t));
      E.sun.color.copy(lerpPal('sun', 'day', 'sunset', t));
      E.sun.intensity = P.day.sunI + (P.sunset.sunI - P.day.sunI) * t;
      E.hemi.intensity = P.day.hemiI + (P.sunset.hemiI - P.day.hemiI) * t;
    } else {
      const t = Math.min(1, -e / 0.3);
      E.skyU.top.value.copy(lerpPal('top', 'sunset', 'night', t));
      E.skyU.bottom.value.copy(lerpPal('hor', 'sunset', 'night', t));
      E.sun.color.copy(lerpPal('sun', 'sunset', 'night', t));
      E.sun.intensity = P.sunset.sunI + (P.night.sunI - P.sunset.sunI) * t;
      E.hemi.intensity = P.sunset.hemiI + (P.night.hemiI - P.sunset.hemiI) * t;
    }

    E.scene.fog.color.copy(E.skyU.bottom.value);
    SK.stars.material.opacity = Math.min(0.9, Math.max(0, -e * 3.2));

    /* 太阳 / 月亮位置与可见度 */
    SK.sunSprite.position.copy(player).addScaledVector(SK.sunDir, 700);
    SK.moonSprite.position.copy(player).addScaledVector(SK.sunDir, -700);
    SK.sunSprite.material.opacity = Math.min(0.95, Math.max(0, e * 3 + 0.25));
    SK.moonSprite.material.opacity = Math.min(0.9, Math.max(0, -e * 3 + 0.25));

    E.sun.position.copy(player).addScaledVector(SK.sunDir, 130);
    E.sun.target.position.copy(player);

    /* 灯柱夜光 */
    const lampOn = e < 0.1;
    (A.world.lamps || []).forEach(function (m) {
      m.color.setHex(lampOn ? 0xffd980 : 0x8a8478);
    });

    /* 云漂移 + 时段色调 */
    SK.clouds.forEach(function (c) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 420) c.position.x = -420;
    });

    /* 时钟文本 */
    const hour = (SK.dayT * 24 + 6) % 24;
    const hh = String(hour | 0).padStart(2, '0');
    const mm = String(((hour % 1) * 60) | 0).padStart(2, '0');
    const label = e > 0.28 ? '白天' : (e > -0.1 ? (SK.dayT < 0.5 ? '白天' : '黄昏') : '夜晚');
    A.ui.setClock(label + ' · ' + hh + ':' + mm);
  };

  A.sky = SK;
})();
