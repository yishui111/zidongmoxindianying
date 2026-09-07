/* =====================================================================
 * Astra 植被 [L1] —— 树 / 岩石 / 草 / 花（实例化渲染 + 草地风摆 shader）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const P = { updaters: [] };

  A.define({
    id: 'props', layer: 1, deps: ['engine', 'world'],
    setup: function () { return P; },
    update: function (dt, t) { windTime.value = t; }   // 驱动草地/花朵风摆
  });

  let windTime = { value: 0 };
  function toonMat(color) {
    return new THREE.MeshToonMaterial({ color: color });
  }
  /* 给材质注入风摆顶点位移（仅草与花） */
  function addWind(mat, strength) {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uWind = windTime;
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '#ifdef USE_INSTANCING\n' +
        '  float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;\n' +
        '  transformed.x += sin(uWind * 2.0 + ph) * ' + strength + ' * max(transformed.y, 0.0);\n' +
        '  transformed.z += cos(uWind * 1.6 + ph) * ' + strength + ' * 0.6 * max(transformed.y, 0.0);\n' +
        '#endif\n'
      );
    };
  }

  P.build = function (heightAt, cfg, pal, spots) {
    const scene = A.engine.scene;
    const T = cfg.terrain;
    const rnd = A.world.rng(T.seed + 7);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
      v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const UP = new THREE.Vector3(0, 1, 0);

    function fill(im, list, place, colorFn) {
      list.forEach(function (p, i) {
        place(p);
        q.setFromAxisAngle(UP, rnd() * Math.PI * 2);
        m4.compose(v, q, s);
        im.setMatrixAt(i, m4);
        if (colorFn) im.setColorAt(i, colorFn());
      });
      im.castShadow = true;
      im.receiveShadow = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
      return im;
    }
    function placeAt(p, k, ky) {
      v.set(p.x, p.h, p.z);
      s.set(k, ky || k, k);
    }

    /* 树（双层球冠） */
    const trees = spots.trees;
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 7), toonMat(pal.trunk), trees.length);
      const leafA = new THREE.InstancedMesh(new THREE.SphereGeometry(1.15, 10, 8), toonMat(0xffffff), trees.length);
      const leafB = new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 9, 7), toonMat(0xffffff), trees.length);
      trunk.geometry.translate(0, 0.75, 0);
      leafA.geometry.translate(0, 2.35, 0);
      leafB.geometry.translate(0, 3.35, 0);
      const kA = function () { col.set(rnd() < 0.3 ? pal.leafB : pal.leafA); col.offsetHSL(0, 0, (rnd() - 0.5) * 0.08); return col; };
      const kB = function () { col.set(rnd() < 0.3 ? pal.leafB : pal.leafA); col.offsetHSL(0, 0, (rnd() - 0.5) * 0.06); return col; };
      fill(trunk, trees, function (p) { const k = 0.8 + rnd() * 0.7; placeAt(p, k); });
      fill(leafA, trees, function (p) { const k = 0.8 + rnd() * 0.7; placeAt(p, k, k * (0.85 + rnd() * 0.3)); }, kA);
      fill(leafB, trees, function (p) { const k = 0.8 + rnd() * 0.7; placeAt(p, k); }, kB);
    }

    /* 岩石 */
    if (spots.rocks.length) {
      const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75), toonMat(0xffffff), spots.rocks.length);
      fill(rocks, spots.rocks, function (p) {
        const k = 0.5 + rnd() * 1.2;
        v.set(p.x, p.h + 0.1, p.z); s.set(k, k * 0.7, k);
      }, function () { col.set(0x9aa0a8); col.offsetHSL(0, 0, (rnd() - 0.5) * 0.12); return col; });
    }

    /* 草（风摆） */
    if (spots.grass.length) {
      const gmat = toonMat(0xffffff);
      addWind(gmat, 0.1);
      const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.42, 5), gmat, spots.grass.length);
      grass.castShadow = false;
      grass.geometry.translate(0, 0.2, 0);
      fill(grass, spots.grass, function (p) {
        const k = 0.7 + rnd() * 0.9; placeAt(p, k, k * (0.8 + rnd() * 0.8));
      }, function () { col.set(pal.grassTuft || 0x4f9e3c); col.offsetHSL((rnd() - 0.5) * 0.03, 0, (rngJit()) * 0.08); return col; });
    }

    /* 花（风摆） */
    if (spots.flowers.length) {
      const n = spots.flowers.length;
      const smat = toonMat(0x4c9e3f), hmat = toonMat(0xffffff);
      addWind(smat, 0.06); addWind(hmat, 0.06);
      const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3, 5), smat, n);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.095, 7, 6), hmat, n);
      stems.castShadow = false; heads.castShadow = false;
      stems.geometry.translate(0, 0.15, 0);
      heads.geometry.translate(0, 0.36, 0);
      const palette = pal.flowers || [0xfff6f8, 0xffd1e4, 0x9ecbff, 0xffe9a8, 0xff8f8f];
      const noColor = null;
      fill(stems, spots.flowers, function (p) { placeAt(p, 1); });
      fill(heads, spots.flowers, function (p) { placeAt(p, 1); },
        function () { col.set(palette[(rnd() * palette.length) | 0]); return col; });
    }

    function rngJit() { return (rnd() - 0.5); }

    P.updaters.push(function (t) { windTime.value = t; });
  };

  A.props = P;
})();
