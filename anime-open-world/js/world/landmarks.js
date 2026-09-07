/* =====================================================================
 * Astra 地标 [L1] —— 鸟居 / 祭坛（含引导光柱）/ 小屋 / 灯柱
 * ===================================================================== */
(function () {
  const A = window.Astra;

  A.define({
    id: 'landmarks', layer: 1, deps: ['engine'],
    setup: function () { return A.landmarks; }
  });

  A.landmarks = {
    build: function (heightAt, cfg) {
      const scene = A.engine.scene;
      const L = cfg.landmarks || {};
      const out = { lamps: [], beacon: null, altar: L.altar || { x: 0, z: 0, h: 10 } };
      const pal = cfg.palette || {};

      function toon(c) { return new THREE.MeshToonMaterial({ color: c }); }
      function basic(c) { return new THREE.MeshBasicMaterial({ color: c }); }
      const glow = A.engine.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

      /* 鸟居 */
      if (L.torii) {
        const g = new THREE.Group();
        const red = toon(pal.torii || 0xd8443c), dark = toon(0x2a2a33);
        [-1.7, 1.7].forEach(function (x) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.6, 10), red);
          p.position.set(x, 1.8, 0); p.castShadow = true; g.add(p);
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10), dark);
          b.position.set(x, 0.15, 0); b.castShadow = true; g.add(b);
        });
        const top = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.34, 0.55), red);
        top.position.y = 3.75; top.rotation.z = 0.015; top.castShadow = true; g.add(top);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.16, 0.7), dark);
        roof.position.y = 3.97; roof.rotation.z = 0.015; roof.castShadow = true; g.add(roof);
        const mid = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.2, 0.4), red);
        mid.position.y = 3.05; mid.castShadow = true; g.add(mid);
        g.position.set(L.torii.x, heightAt(L.torii.x, L.torii.z), L.torii.z);
        g.rotation.y = Math.PI;
        scene.add(g);
      }

      /* 祭坛 */
      if (L.altar) {
        const a = L.altar;
        const g = new THREE.Group();
        const stone = toon(0xc9ced8), stoneDark = toon(0x9aa2b0);
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 20), stone);
        plat.position.y = 0.3; plat.receiveShadow = true; plat.castShadow = true; g.add(plat);
        const plat2 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 16), stoneDark);
        plat2.position.y = 0.82; plat2.castShadow = true; plat2.receiveShadow = true; g.add(plat2);
        const ped = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), toon(0x52e6ff, { emissive: 0x1899b3 }));
        ped.position.y = 2.0; ped.castShadow = true; g.add(ped);
        const pg = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glow, color: 0x7feaff, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        pg.scale.set(2.4, 2.4, 1); pg.position.y = 2.0; g.add(pg);
        out.pedestal = ped;

        /* 灯柱 */
        for (let i = 0; i < 4; i++) {
          const ang = Math.PI / 4 + i * Math.PI / 2;
          const lx = a.x + Math.cos(ang) * 7, lz = a.z + Math.sin(ang) * 7;
          const lh = heightAt(lx, lz);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.9, 8), toon(0x6b4a2f));
          post.position.set(lx, lh + 0.95, lz);
          post.castShadow = true; scene.add(post);
          const lampMat = basic(0x8a8478);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 7), lampMat);
          lamp.position.set(lx, lh + 2.0, lz);
          scene.add(lamp);
          out.lamps.push(lampMat);
        }

        g.position.set(a.x, a.h, a.z);
        scene.add(g);

        /* 引导光柱（任务第二阶段出现） */
        const cv = document.createElement('canvas');
        cv.width = 4; cv.height = 64;
        const bg = cv.getContext('2d');
        const lg = bg.createLinearGradient(0, 0, 0, 64);
        lg.addColorStop(0, 'rgba(120,235,255,0)');
        lg.addColorStop(0.35, 'rgba(120,235,255,0.55)');
        lg.addColorStop(1, 'rgba(120,235,255,0.05)');
        bg.fillStyle = lg; bg.fillRect(0, 0, 4, 64);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 70, 14, 1, true),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.8,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        beam.position.set(a.x, a.h + 35, a.z);
        beam.visible = false;
        scene.add(beam);
        out.beam = beam;
      }

      /* 小屋 */
      (L.houses || []).forEach(function (h) {
        const g = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.7), toon(0xf7ecd7));
        wall.position.y = 1.05; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 1.5, 4), toon(pal.roof || 0xd8703c));
        roof.position.y = 2.85; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 0.08), toon(0x6b4a2f));
        door.position.set(0, 0.58, 1.36); g.add(door);
        g.position.set(h.x, h.y, h.z);
        g.rotation.y = h.rot || 0;
        scene.add(g);
      });

      return out;
    }
  };
})();
