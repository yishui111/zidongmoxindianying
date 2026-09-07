/* =====================================================================
 * Astra 地形 [L1] —— 确定性噪声 / 高度函数工厂 / 地形网格 / 海面
 * 场景参数全部来自 scene.json，换配置即换地形
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const W = {};

  A.define({
    id: 'world', layer: 1, deps: ['engine'],
    setup: function () { return W; }
  });

  /* ---------- 确定性随机与噪声 ---------- */
  W.rng = function (seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function hash2(ix, iz) {
    const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  function fbm(x, z, oct) {
    let v = 0, amp = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) {
      v += amp * vnoise(x * f, z * f);
      tot += amp; amp *= 0.5; f *= 2.03;
    }
    return v / tot;
  }
  function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }
  W.smoothstep = smoothstep;

  /* ---------- 高度函数工厂（scene.json.terrain 驱动） ---------- */
  W.makeHeightFn = function (T) {
    const plateau = T.plateau || null;
    return function (x, z) {
      let h;
      if (T.island === false) {
        h = T.base + fbm(x * T.scale + 31, z * T.scale - 17, 4) * T.amplitude
              + fbm(x * T.scale * 4 - 73, z * T.scale * 4 + 58, 3) * T.detail;
      } else {
        const d = Math.hypot(x, z);
        const fall = 1 - smoothstep(T.falloffStart, T.falloffEnd, d);
        const n = fbm(x * T.scale + 31, z * T.scale - 17, 4);
        const r2 = fbm(x * T.scale * 4 - 73, z * T.scale * 4 + 58, 3);
        h = fall * (T.base + n * T.amplitude + r2 * T.detail) - (1 - fall) * 13 - 3.2;
      }
      if (plateau) {
        const pd = Math.hypot(x - plateau.x, z - plateau.z);
        const pb = 1 - smoothstep(plateau.r * 0.5, plateau.r, pd);
        h = h * (1 - pb) + plateau.h * pb;
      }
      return h;
    };
  };

  /* ---------- 地形网格（顶点着色按海拔/坡度） ---------- */
  W.buildTerrain = function (heightAt, T, pal) {
    const geo = new THREE.PlaneGeometry(T.size, T.size, T.segments, T.segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const cSand = new THREE.Color(pal.sand), cA = new THREE.Color(pal.grassA),
      cB = new THREE.Color(pal.grassB), cRock = new THREE.Color(pal.rock),
      cSnow = new THREE.Color(pal.snow || pal.rock), tmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
      const slope = 1 - nrm.getY(i);
      const nz = fbm(x * 0.06 + 9, z * 0.06 + 4, 2);
      tmp.copy(cA).lerp(cB, nz);
      tmp.lerp(cSand, 1 - smoothstep(T.sandLine || 0.35, (T.sandLine || 0.35) + 1.25, h));
      if (slope > 0.28) tmp.lerp(cRock, smoothstep(0.28, 0.45, slope));
      if (h > 19) tmp.lerp(cRock, smoothstep(19, 23, h));
      if (pal.snow && h > 25) tmp.lerp(cSnow, smoothstep(25, 28, h));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshToonMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  };

  /* ---------- 海面（顶点波浪动画） ---------- */
  W.buildSea = function (T, pal) {
    const geo = new THREE.PlaneGeometry(T.size * 2.6, T.size * 2.6, 44, 44);
    geo.rotateX(-Math.PI / 2);
    const base = geo.attributes.position.array.slice();
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(pal.water || 0x2fb9d6),
      transparent: true, opacity: 0.82,
      shininess: 130, specular: 0xbdf0ff
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = T.seaLevel || 0;
    mesh.renderOrder = 1;
    return {
      mesh: mesh,
      update: function (t) {
        const pos = geo.attributes.position, arr = pos.array;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], z = base[i * 3 + 2];
          arr[i * 3 + 1] = 0.14 * Math.sin(t * 1.5 + x * 0.075 + z * 0.05)
            + 0.07 * Math.sin(t * 2.4 - z * 0.11 + x * 0.03);
        }
        pos.needsUpdate = true;
      }
    };
  };

  /* ---------- 植被/岩石落点（拒绝采样：坡度与水深检查） ---------- */
  W.sampleSpots = function (count, heightAt, opts) {
    const rnd = W.rng(opts.seed || 1);
    const out = [];
    for (let k = 0; k < count * 30 && out.length < count; k++) {
      const x = (rnd() * 2 - 1) * (opts.radius || 250);
      const z = (rnd() * 2 - 1) * (opts.radius || 250);
      const h = heightAt(x, z);
      if (h < opts.minH || h > opts.maxH) continue;
      const slope = Math.abs(heightAt(x + 1.4, z) - h) + Math.abs(heightAt(x, z + 1.4) - h);
      if (slope > opts.maxSlope) continue;
      if (opts.keepClear && opts.keepClear.some(function (c) {
        return Math.hypot(x - c.x, z - c.z) < c.r;
      })) continue;
      out.push({ x: x, z: z, h: h });
    }
    return out;
  };

  A.world = W;
})();
