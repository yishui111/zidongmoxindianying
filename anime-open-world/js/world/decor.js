/* =====================================================================
 * Astra 场景装饰 [L1] —— 瀑布 / 石板路 / 山谷雾气 / 岸外浪涌 / 水晶矿簇
 * 全部程序化生成，由 decor.build(cfg) 在场景装配后调用
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const D = {};

  D.build = function (cfg) {
    const H = A.world.heightAt;
    buildWaterfall(H, cfg);
    buildStonePath(H);
    buildMist(H, cfg);
    buildSwellBands();
    buildCrystalClusters(H, cfg);
  };

  /* ---------- 瀑布：找落差最大的临海崖壁 ---------- */
  function buildWaterfall(H, cfg) {
    let best = null;
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      for (let r = 70; r <= 140; r += 5) {
        const cx = dx * r, cz = dz * r;
        const hTop = H(cx, cz);
        if (hTop < 14 || hTop > 26) continue;
        const bx = cx + dx * 10, bz = cz + dz * 10;
        const hBot = H(bx, bz);
        const drop = hTop - hBot;
        if (drop > (best ? best.drop : 9)) {
          best = { cx: cx, cz: cz, dx: dx, dz: dz, drop: drop, hTop: hTop, hBot: hBot };
        }
      }
    }
    if (!best || best.drop < 8) return;

    /* 水流纹理（竖向白色条纹画布） */
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(210,240,255,0.35)';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 128;
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.4).toFixed(2) + ')';
      g.fillRect(x, 0, 1.5 + Math.random() * 3.5, 256);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);

    const drop = best.drop;
    const geo = new THREE.PlaneGeometry(4.5, drop * 1.06);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false
    });
    const wf = new THREE.Mesh(geo, mat);
    const midY = (best.hTop + best.hBot) / 2;
    wf.position.set(best.cx + best.dx * 4.5, midY, best.cz + best.dz * 4.5);
    wf.lookAt(wf.position.x + best.dx * 10, midY, wf.position.z + best.dz * 10);
    A.engine.scene.add(wf);

    /* 底部雾气 + 泡沫池 */
    for (let i = 0; i < 3; i++) {
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({
        map: A.engine.glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
        color: 0xeaf6ff, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      mist.scale.set(7 + i * 2.5, 3 + i, 1);
      mist.position.set(best.cx + best.dx * (9.5 + i * 1.5), best.hBot + 0.8 + i * 0.5, best.cz + best.dz * (9.5 + i * 1.5));
      A.engine.scene.add(mist);
      (D.misters = D.misters || []).push(mist);
    }
    const foam = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.22 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(best.cx + best.dx * 9.5, best.hBot + 0.15, best.cz + best.dz * 9.5);
    A.engine.scene.add(foam);

    D.update = function (dt) {
      tex.offset.y = (tex.offset.y - dt * 0.9) % 1;
    };
  }

  /* ---------- 石板路：出生点 → 鸟居 → 祭坛 ---------- */
  function buildStonePath(H) {
    const pts = [];
    for (let z = 24; z >= 3; z -= 0.9) {
      pts.push({ x: (Math.random() - 0.5) * 0.35, z: z + (Math.random() - 0.5) * 0.2 });
    }
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 10);
    const mat = new THREE.MeshToonMaterial({ color: 0xb8bfc9 });
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
      v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    pts.forEach(function (pt, i) {
      const y = H(pt.x, pt.z);
      v.set(pt.x, y + 0.04, pt.z);
      s.set(0.8 + Math.random() * 0.5, 1, 0.8 + Math.random() * 0.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m4.compose(v, q, s);
      im.setMatrixAt(i, m4);
      col.set(0xb8bfc9); col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      im.setColorAt(i, col);
    });
    im.receiveShadow = true;
    A.engine.scene.add(im);
  }

  /* ---------- 山谷雾气 ---------- */
  function buildMist(H, cfg) {
    const T = cfg.terrain;
    const spots = A.world.sampleSpots(8, H, {
      seed: T.seed + 51, minH: 3, maxH: 12, maxSlope: 9,
      radius: T.size * 0.35, keepClear: []
    });
    const glow = A.engine.glowTexture('rgba(230,240,250,0.85)', 'rgba(230,240,250,0)');
    spots.forEach(function (s, i) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0xe6f0fa, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      m.scale.set(34 + (i % 3) * 12, 14 + (i % 2) * 6, 1);
      m.position.set(s.x, s.h + 2.2, s.z);
      m.userData.drift = 0.3 + (i % 4) * 0.15;
      A.engine.scene.add(m);
      (D.mistSprites = D.mistSprites || []).push(m);
    });
  }

  /* ---------- 岸外浪涌带 ---------- */
  function buildSwellBands() {
    const bands = [
      { r0: 268, r1: 288, y: 0.05, o: 0.10 },
      { r0: 294, r1: 312, y: 0.09, o: 0.07 },
      { r0: 318, r1: 336, y: 0.13, o: 0.05 }
    ];
    D.bands = [];
    bands.forEach(function (b, i) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(b.r0, b.r1, 64),
        new THREE.MeshBasicMaterial({
          color: 0xeaf6ff, transparent: true, opacity: b.o,
          side: THREE.DoubleSide, depthWrite: false
        }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = b.y;
      m.userData.baseO = b.o;
      m.userData.ph = i * 1.8;
      A.engine.scene.add(m);
      D.bands.push(m);
    });
  }

  /* ---------- 发光水晶矿簇 ---------- */
  function buildCrystalClusters(H, cfg) {
    const T = cfg.terrain;
    const spots = A.world.sampleSpots(10, H, {
      seed: T.seed + 61, minH: 12, maxH: 26, maxSlope: 2.8,
      radius: T.size * 0.38, keepClear: [
        { x: A.world.altar.x, z: A.world.altar.z, r: 20 }
      ].filter(Boolean)
    });
    const glow = A.engine.glowTexture('rgba(140,240,230,0.8)', 'rgba(140,240,230,0)');
    const cMat = new THREE.MeshToonMaterial({ color: 0x7de0d8, emissive: 0x1a8f96 });
    spots.forEach(function (s, i) {
      const g = new THREE.Group();
      const n = 3 + (i % 2);
      for (let k = 0; k < n; k++) {
        const size = 0.28 + Math.random() * 0.3;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(size), cMat);
        c.position.set((Math.random() - 0.5) * 0.8, size * 0.7, (Math.random() - 0.5) * 0.8);
        c.rotation.set(Math.random() * 0.7 - 0.35, Math.random() * Math.PI, Math.random() * 0.5 - 0.25);
        c.castShadow = true;
        g.add(c);
      }
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0x7de0d8, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(2.2, 2.2, 1);
      halo.position.y = 0.7;
      g.add(halo);
      g.position.set(s.x, s.h, s.z);
      A.engine.scene.add(g);
    });
  }

  A.decor = D;
})();
