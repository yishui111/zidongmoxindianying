/* =====================================================================
 * 风之原 · Winds of Astra
 * 二次元开放世界原型 Demo（纯浏览器，无外部素材，Three.js r147 MIT）
 * 程序化海岛 + 卡通渲染 + 冲刺/跳跃/滑翔/游泳/昼夜循环/收集任务
 * ===================================================================== */
(function () {
'use strict';

window.__errors = [];
window.addEventListener('error', function (e) {
  window.__errors.push(String(e.message || e));
});

/* ---------------- 基础工具 ---------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260906);

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
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ---------------- 地形高度（解析函数，移动采样零开销） ---------------- */
const SEA_LEVEL = 0;
const PLATEAU = { x: 0, z: 0, r: 22, h: 10 };
function baseH(x, z) {
  const d = Math.hypot(x, z);
  const fall = 1 - smoothstep(150, 258, d);
  const n = fbm(x * 0.012 + 31, z * 0.012 - 17, 4);
  const r2 = fbm(x * 0.05 - 73, z * 0.05 + 58, 3);
  let h = fall * (3.5 + n * 31 + r2 * 5) - (1 - fall) * 13 - 3.2;
  const pd = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  const pb = 1 - smoothstep(PLATEAU.r * 0.5, PLATEAU.r, pd);
  h = h * (1 - pb) + PLATEAU.h * pb;
  return h;
}

/* ---------------- 渲染器 / 场景 ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('loadingTip').textContent = '当前浏览器不支持 WebGL，无法运行。';
  throw err;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'webgl';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe8f5, 90, 330);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

const hemi = new THREE.HemisphereLight(0xcfeaff, 0x67ca7a, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

/* 天空穹顶（上下渐变） */
const skyUniforms = {
  top: { value: new THREE.Color(0x4aa7e8) },
  bottom: { value: new THREE.Color(0xbfe8f5) }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 24, 14),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;' +
      'void main(){ float t = pow(max(vP.y / 900.0, 0.0), 0.62); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
  })
);
scene.add(sky);

/* ---------------- 卡通材质辅助 ---------------- */
const gradData = new Uint8Array([
  95, 95, 95, 255, 155, 155, 155, 255, 215, 215, 215, 255, 255, 255, 255, 255
]);
const gradMap = new THREE.DataTexture(gradData, 4, 1, THREE.RGBAFormat);
gradMap.minFilter = THREE.NearestFilter;
gradMap.magFilter = THREE.NearestFilter;
gradMap.needsUpdate = true;

function toonMat(color, opts) {
  return new THREE.MeshToonMaterial(Object.assign({ color: color, gradientMap: gradMap }, opts || {}));
}
function basicMat(color, opts) {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color }, opts || {}));
}

/* 柔光贴图（粒子 / 光晕） */
function glowTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
const softGlow = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

/* =====================================================================
 * 角色 —— 程序化搭建的 Q 版二次元少女（银发蓝瞳 · 双马尾）
 * ===================================================================== */
function buildCharacter() {
  const C = {
    skin: 0xffe3c8, hair: 0x8fd8f2, hairDark: 0x6cc0e4,
    dress: 0xf4f8ff, dressBlue: 0x3d6fe0, gold: 0xf0c75e,
    eye: 0x27346b, blush: 0xff9fa8
  };
  const root = new THREE.Group();        // 位置 + 朝向
  const rig = new THREE.Group();         // 身体倾斜 / 下蹲
  root.add(rig);
  const M = {};

  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || rig).add(m);
    return m;
  }

  /* 腿 */
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.4, 4, 8);
  M.legL = new THREE.Group(); M.legL.position.set(0.095, 0.56, 0);
  M.legR = new THREE.Group(); M.legR.position.set(-0.095, 0.56, 0);
  mesh(legGeo, toonMat(C.skin), 0, -0.24, 0, M.legL);
  mesh(legGeo, toonMat(C.skin), 0, -0.24, 0, M.legR);
  rig.add(M.legL, M.legR);

  /* 裙子 + 上身 */
  const skirt = mesh(new THREE.ConeGeometry(0.3, 0.32, 12), toonMat(C.dress), 0, 0.68, 0);
  mesh(new THREE.TorusGeometry(0.27, 0.02, 6, 16), toonMat(C.gold), 0, 0.53, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.145, 0.175, 0.38, 10), toonMat(C.dress), 0, 0.98, 0);
  const collar = mesh(new THREE.TorusGeometry(0.115, 0.035, 6, 14), toonMat(C.dressBlue), 0, 1.15, 0);
  collar.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.045, 8, 6), toonMat(C.gold), 0, 1.1, 0.16); // 领结

  /* 手臂 */
  const armGeo = new THREE.CapsuleGeometry(0.048, 0.36, 4, 8);
  M.armL = new THREE.Group(); M.armL.position.set(0.21, 1.12, 0);
  M.armR = new THREE.Group(); M.armR.position.set(-0.21, 1.12, 0);
  const sleeveGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8);
  mesh(armGeo, toonMat(C.skin), 0, -0.21, 0, M.armL);
  mesh(armGeo, toonMat(C.skin), 0, -0.21, 0, M.armR);
  mesh(sleeveGeo, toonMat(C.dress), 0, -0.04, 0, M.armL);
  mesh(sleeveGeo, toonMat(C.dress), 0, -0.04, 0, M.armR);
  rig.add(M.armL, M.armR);

  /* 头 */
  M.head = new THREE.Group();
  M.head.position.set(0, 1.42, 0);
  rig.add(M.head);
  mesh(new THREE.SphereGeometry(0.34, 18, 14), toonMat(C.skin), 0, 0, 0.01, M.head).scale.set(1, 0.96, 0.93);
  /* 眼睛（不受光，保持明亮；向前凸出头部球面） */
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const eyeL = mesh(eyeGeo, basicMat(C.eye), 0.13, -0.01, 0.33, M.head);
  eyeL.scale.set(0.85, 1.55, 0.4); eyeL.castShadow = false;
  const eyeR = mesh(eyeGeo, basicMat(C.eye), -0.13, -0.01, 0.33, M.head);
  eyeR.scale.set(0.85, 1.55, 0.4); eyeR.castShadow = false;
  const hlGeo = new THREE.SphereGeometry(0.02, 6, 6);
  const hl1 = mesh(hlGeo, basicMat(0xffffff), 0.16, 0.05, 0.365, M.head); hl1.castShadow = false;
  const hl2 = mesh(hlGeo, basicMat(0xffffff), -0.104, 0.05, 0.365, M.head); hl2.castShadow = false;
  const hlGeo2 = new THREE.SphereGeometry(0.009, 5, 5);
  const hl3 = mesh(hlGeo2, basicMat(0xffffff), 0.105, -0.07, 0.37, M.head); hl3.castShadow = false;
  const hl4 = mesh(hlGeo2, basicMat(0xffffff), -0.155, -0.07, 0.37, M.head); hl4.castShadow = false;
  const blushGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const bl1 = mesh(blushGeo, basicMat(C.blush, { transparent: true, opacity: 0.4 }), 0.185, -0.1, 0.305, M.head);
  bl1.scale.set(1, 0.6, 0.4); bl1.castShadow = false;
  const bl2 = mesh(blushGeo, basicMat(C.blush, { transparent: true, opacity: 0.4 }), -0.185, -0.1, 0.305, M.head);
  bl2.scale.set(1, 0.6, 0.4); bl2.castShadow = false;

  /* 头发 */
  const hairMat = toonMat(C.hair);
  const cap = mesh(new THREE.SphereGeometry(0.41, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.40), hairMat, 0, 0.03, -0.01, M.head);
  cap.scale.set(1.06, 1.12, 1.05);
  const back = mesh(new THREE.SphereGeometry(0.35, 14, 10), toonMat(C.hairDark), 0, -0.06, -0.1, M.head);
  back.scale.set(1.07, 1.28, 0.88);
  const bangGeo = new THREE.SphereGeometry(0.095, 8, 6);
  [[0.2, 0.2], [0.1, 0.26], [0, 0.285], [-0.1, 0.26], [-0.2, 0.2]].forEach(function (p) {
    const b = mesh(bangGeo, hairMat, p[0], 0.2, p[1], M.head);
    b.scale.set(1, 0.85, 0.55);
  });
  const ahoge = mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hairMat, 0.04, 0.44, 0.02, M.head);
  ahoge.rotation.z = -0.4;

  /* 双马尾 */
  function tail(side) {
    const g = new THREE.Group();
    g.position.set(0.32 * side, 0.0, -0.1);
    g.rotation.z = -0.18 * side;
    const sizes = [0.135, 0.105, 0.08];
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.SphereGeometry(sizes[i], 8, 7), hairMat, 0.045 * side, y - sizes[i] * 0.7, 0, g);
      s.scale.set(1, 1.18, 1);
      y -= sizes[i] * 1.75;
    }
    const tip = mesh(new THREE.ConeGeometry(0.058, 0.18, 7), toonMat(C.hairDark), 0.045 * side, y - 0.06, 0, g);
    tip.rotation.x = Math.PI;
    M.head.add(g);
    return g;
  }
  M.tailL = tail(1);
  M.tailR = tail(-1);

  /* 风之翼（滑翔翼） */
  const wing = new THREE.Group();
  wing.position.set(0, 1.25, -0.16);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.05);
  wingShape.quadraticCurveTo(0.85, 0.62, 1.95, 0.28);
  wingShape.quadraticCurveTo(1.05, -0.18, 0, -0.14);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 10);
  const wingMat = toonMat(0xf2903a, { side: THREE.DoubleSide });
  const stripeMat = toonMat(0xfff4e0, { side: THREE.DoubleSide });
  function panel(side) {
    const p = new THREE.Group();
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.castShadow = true;
    const st = new THREE.Mesh(wingGeo, stripeMat);
    st.scale.set(0.55, 0.5, 1); st.position.set(0.18, 0.02, 0.01);
    p.add(w, st);
    p.scale.x = side;
    p.rotation.z = side * 0.3;
    return p;
  }
  wing.add(panel(1), panel(-1));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), toonMat(0x8a5a2b));
  bar.rotation.z = Math.PI / 2;
  wing.add(bar);
  wing.rotation.x = -1.15;
  wing.visible = false;
  rig.add(wing);
  M.wing = wing;

  /* 描边（反向外壳，仅裙子，避免头部出现黑圈） */
  const outlineMat = basicMat(0x1c2733, { side: THREE.BackSide });
  [skirt].forEach(function (m) {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.copy(m.scale).multiplyScalar(1.04);
    m.add(o);
  });

  root.userData.parts = M;
  return root;
}

/* 姿态动画 */
function poseCharacter(parts, anim, t, speedRatio) {
  const s1 = Math.sin(t * 11), s2 = Math.sin(t * 2.2);
  switch (anim) {
    case 'run':
      parts.legL.rotation.x = s1 * 0.95 * speedRatio;
      parts.legR.rotation.x = -s1 * 0.95 * speedRatio;
      parts.armL.rotation.x = -s1 * 0.8 * speedRatio;
      parts.armR.rotation.x = s1 * 0.8 * speedRatio;
      parts.armL.rotation.z = 0.12; parts.armR.rotation.z = -0.12;
      parts.head.rotation.x = 0.06;
      parts.head.position.y = 1.42 + Math.abs(Math.cos(t * 11)) * 0.03 * speedRatio;
      parts.tailL.rotation.x = s1 * 0.25; parts.tailR.rotation.x = s1 * 0.25;
      parts.tailL.rotation.z = 0.25 + s2 * 0.1; parts.tailR.rotation.z = -0.25 - s2 * 0.1;
      break;
    case 'idle':
      parts.legL.rotation.x = parts.legR.rotation.x = 0;
      parts.armL.rotation.x = s2 * 0.05; parts.armR.rotation.x = -s2 * 0.05;
      parts.armL.rotation.z = 0.1; parts.armR.rotation.z = -0.1;
      parts.head.rotation.x = Math.sin(t * 0.9) * 0.03;
      parts.head.position.y = 1.42 + s2 * 0.012;
      parts.tailL.rotation.z = 0.25 + s2 * 0.08; parts.tailR.rotation.z = -0.25 - s2 * 0.08;
      parts.tailL.rotation.x = s2 * 0.06; parts.tailR.rotation.x = s2 * 0.06;
      break;
    case 'jump':
      parts.legL.rotation.x = 0.55; parts.legR.rotation.x = -0.25;
      parts.armL.rotation.x = -2.4; parts.armR.rotation.x = -2.4;
      parts.armL.rotation.z = 0.35; parts.armR.rotation.z = -0.35;
      parts.head.rotation.x = -0.1;
      break;
    case 'glide':
      parts.armL.rotation.x = -2.75; parts.armR.rotation.x = -2.75;
      parts.armL.rotation.z = 0.15; parts.armR.rotation.z = -0.15;
      parts.legL.rotation.x = 0.12; parts.legR.rotation.x = 0.12;
      parts.head.rotation.x = -0.15;
      parts.tailL.rotation.x = 0.5 + s1 * 0.1; parts.tailR.rotation.x = 0.5 + s1 * 0.1;
      parts.tailL.rotation.z = 0.35; parts.tailR.rotation.z = -0.35;
      break;
    case 'swim':
      parts.armL.rotation.x = s1 * 1.5 - 0.6; parts.armR.rotation.x = -s1 * 1.5 - 0.6;
      parts.armL.rotation.z = 0.5; parts.armR.rotation.z = -0.5;
      parts.legL.rotation.x = s1 * 0.4; parts.legR.rotation.x = -s1 * 0.4;
      parts.head.rotation.x = -1.2;
      parts.tailL.rotation.z = 0.6; parts.tailR.rotation.z = -0.6;
      break;
  }
}

/* =====================================================================
 * 世界搭建
 * ===================================================================== */
const player = buildCharacter();
scene.add(player);
const P = player.userData.parts;

/* 地形 */
const TERRAIN_SIZE = 620, TERRAIN_SEG = 124;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, baseH(pos.getX(i), pos.getZ(i)));
  }
  terrainGeo.computeVertexNormals();
  const nrm = terrainGeo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xecd9a0), cGrassA = new THREE.Color(0x74c058),
    cGrassB = new THREE.Color(0x4f9e46), cRock = new THREE.Color(0x8a8f96),
    cSnow = new THREE.Color(0xf2f7fb), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    const nz = fbm(x * 0.06 + 9, z * 0.06 + 4, 2);
    tmp.copy(cGrassA).lerp(cGrassB, nz);
    tmp.lerp(cSand, 1 - smoothstep(0.35, 1.6, h));
    if (slope > 0.28) tmp.lerp(cRock, smoothstep(0.28, 0.45, slope));
    if (h > 19) tmp.lerp(cRock, smoothstep(19, 23, h));
    if (h > 25) tmp.lerp(cSnow, smoothstep(25, 28, h));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const terrain = new THREE.Mesh(terrainGeo, toonMat(0xffffff, { vertexColors: true }));
terrain.receiveShadow = true;
scene.add(terrain);

/* 海面（顶点动画） */
const seaGeo = new THREE.PlaneGeometry(1600, 1600, 44, 44);
seaGeo.rotateX(-Math.PI / 2);
const seaBase = seaGeo.attributes.position.array.slice();
const sea = new THREE.Mesh(seaGeo, new THREE.MeshPhongMaterial({
  color: 0x2fb9d6, transparent: true, opacity: 0.82,
  shininess: 130, specular: 0xbdf0ff
}));
sea.position.y = SEA_LEVEL;
sea.renderOrder = 1;
scene.add(sea);

/* 植被摆放（拒绝采样） */
const spots = { trees: [], rocks: [], grass: [], flowers: [] };
function farFromPlateau(x, z, r) { return Math.hypot(x - PLATEAU.x, z - PLATEAU.z) > r; }
(function place() {
  function trySpot(minH, maxH, maxSlope) {
    for (let k = 0; k < 40; k++) {
      const x = (rng() * 2 - 1) * 250, z = (rng() * 2 - 1) * 250;
      const h = baseH(x, z);
      if (h < minH || h > maxH) continue;
      const slope = Math.abs(baseH(x + 1.4, z) - h) + Math.abs(baseH(x, z + 1.4) - h);
      if (slope > maxSlope) continue;
      if (!farFromPlateau(x, z, 26)) continue;
      return { x: x, z: z, h: h };
    }
    return null;
  }
  for (let i = 0; i < 130; i++) { const s = trySpot(1.6, 20, 2.6); if (s) spots.trees.push(s); }
  for (let i = 0; i < 70; i++) { const s = trySpot(0.8, 27, 3.4); if (s) spots.rocks.push(s); }
  for (let i = 0; i < 900; i++) { const s = trySpot(1.2, 18, 2.2); if (s) spots.grass.push(s); }
  for (let i = 0; i < 240; i++) { const s = trySpot(1.4, 15, 1.8); if (s) spots.flowers.push(s); }
})();

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(),
  _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _col = new THREE.Color();
function fillInstanced(im, list, builder, colorFn) {
  list.forEach(function (s, i) {
    builder(s);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    _m4.compose(_v3, _q, _s3);
    im.setMatrixAt(i, _m4);
    if (colorFn) im.setColorAt(i, colorFn(s, i));
  });
  im.castShadow = true;
  im.receiveShadow = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  scene.add(im);
}

/* 树（球状树冠，卡通风） */
{
  const n = spots.trees.length;
  const trunkIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 7), toonMat(0x8a5a37), n);
  const leafIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1.15, 10, 8), toonMat(0xffffff), n);
  const leaf2IM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 9, 7), toonMat(0xffffff), n);
  trunkIM.geometry.translate(0, 0.75, 0);
  leafIM.geometry.translate(0, 2.35, 0);
  leaf2IM.geometry.translate(0, 3.35, 0);
  fillInstanced(trunkIM, spots.trees, function (s) {
    _v3.set(s.x, s.h, s.z); const k = 0.8 + rng() * 0.7; _s3.set(k, k, k);
  });
  fillInstanced(leafIM, spots.trees, function (s) {
    _v3.set(s.x, s.h, s.z); const k = 0.8 + rng() * 0.7; _s3.set(k, k * (0.85 + rng() * 0.3), k);
  }, function () {
    _col.setHex(rng() < 0.3 ? 0x3fae8a : 0x4faf4a);
    _col.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
    return _col;
  });
  fillInstanced(leaf2IM, spots.trees, function (s) {
    _v3.set(s.x, s.h, s.z); const k = 0.8 + rng() * 0.7; _s3.set(k, k, k);
  }, function () {
    _col.setHex(rng() < 0.3 ? 0x46c296 : 0x5cbf45);
    _col.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
    return _col;
  });
}

/* 岩石 */
{
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.75), toonMat(0xffffff), spots.rocks.length);
  fillInstanced(im, spots.rocks, function (s) {
    _v3.set(s.x, s.h + 0.1, s.z);
    const k = 0.5 + rng() * 1.2;
    _s3.set(k, k * 0.7, k);
  }, function () {
    _col.setHex(0x9aa0a8); _col.offsetHSL(0, 0, (rng() - 0.5) * 0.12);
    return _col;
  });
}

/* 草丛 */
{
  const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.42, 5), toonMat(0xffffff), spots.grass.length);
  im.castShadow = false;
  im.geometry.translate(0, 0.2, 0);
  fillInstanced(im, spots.grass, function (s) {
    _v3.set(s.x, s.h, s.z);
    const k = 0.7 + rng() * 0.9; _s3.set(k, k * (0.8 + rng() * 0.8), k);
  }, function () {
    _col.setHex(0x4f9e3c); _col.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.08);
    return _col;
  });
}

/* 花 */
{
  const n = spots.flowers.length;
  const stemIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3, 5), toonMat(0x4c9e3f), n);
  const headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.095, 7, 6), toonMat(0xffffff), n);
  stemIM.geometry.translate(0, 0.15, 0);
  headIM.geometry.translate(0, 0.36, 0);
  const palette = [0xfff6f8, 0xffd1e4, 0x9ecbff, 0xffe9a8, 0xff8f8f];
  stemIM.castShadow = false; headIM.castShadow = false;
  fillInstanced(stemIM, spots.flowers, function (s) { _v3.set(s.x, s.h, s.z); _s3.set(1, 1, 1); });
  fillInstanced(headIM, spots.flowers, function (s) { _v3.set(s.x, s.h, s.z); _s3.set(1, 1, 1); },
    function () { _col.setHex(palette[(rng() * palette.length) | 0]); return _col; });
}

/* 鸟居 */
(function torii() {
  const g = new THREE.Group();
  const red = toonMat(0xd8443c), dark = toonMat(0x2a2a33);
  function pillar(x) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.6, 10), red);
    p.position.set(x, 1.8, 0); p.castShadow = true; g.add(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10), dark);
    base.position.set(x, 0.15, 0); base.castShadow = true; g.add(base);
  }
  pillar(-1.7); pillar(1.7);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.34, 0.55), red);
  top.position.y = 3.75; top.rotation.z = 0.015; top.castShadow = true; g.add(top);
  const topRoof = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.16, 0.7), dark);
  topRoof.position.y = 3.97; topRoof.rotation.z = 0.015; topRoof.castShadow = true; g.add(topRoof);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.2, 0.4), red);
  mid.position.y = 3.05; mid.castShadow = true; g.add(mid);
  g.position.set(0, baseH(0, 13), 13);
  g.rotation.y = Math.PI;
  scene.add(g);
})();

/* 祭坛 */
const beacon = (function altar() {
  const g = new THREE.Group();
  const stone = toonMat(0xc9ced8), stoneDark = toonMat(0x9aa2b0);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 20), stone);
  plat.position.y = 0.3; plat.receiveShadow = true; plat.castShadow = true; g.add(plat);
  const plat2 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 16), stoneDark);
  plat2.position.y = 0.82; plat2.castShadow = true; plat2.receiveShadow = true; g.add(plat2);
  const pedestal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), toonMat(0x52e6ff, { emissive: 0x1899b3 }));
  pedestal.position.y = 2.0; pedestal.castShadow = true; g.add(pedestal);
  const pedGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlow, color: 0x7feaff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  pedGlow.scale.set(2.4, 2.4, 1); pedGlow.position.y = 2.0; g.add(pedGlow);

  /* 灯柱 */
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const lx = Math.cos(a) * 7, lz = Math.sin(a) * 7;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.9, 8), toonMat(0x6b4a2f));
    post.position.set(lx, baseH(lx, lz) + 0.95 - PLATEAU.h, lz);
    post.castShadow = true; g.add(post);
    const lampMat = basicMat(0xfff0c0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 7), lampMat);
    lamp.position.set(lx, baseH(lx, lz) + 2.0 - PLATEAU.h, lz);
    g.add(lamp);
    (window.__lamps = window.__lamps || []).push({ mat: lampMat });
  }

  g.position.set(PLATEAU.x, PLATEAU.h, PLATEAU.z);
  scene.add(g);

  /* 引导光柱（集齐后出现） */
  const beamTexCv = document.createElement('canvas');
  beamTexCv.width = 4; beamTexCv.height = 64;
  const bg = beamTexCv.getContext('2d');
  const lg = bg.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, 'rgba(120,235,255,0)');
  lg.addColorStop(0.35, 'rgba(120,235,255,0.55)');
  lg.addColorStop(1, 'rgba(120,235,255,0.05)');
  bg.fillStyle = lg; bg.fillRect(0, 0, 4, 64);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 70, 14, 1, true),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(beamTexCv), transparent: true, opacity: 0.8,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  beam.position.set(PLATEAU.x, PLATEAU.h + 35, PLATEAU.z);
  beam.visible = false;
  scene.add(beam);
  return { group: g, pedestal: pedestal, beam: beam };
})();

/* 小屋 */
(function houses() {
  [[13, -5, 0.6], [-14, -2, -0.9]].forEach(function (cfg) {
    const x = cfg[0], z = cfg[1], rot = cfg[2];
    const h0 = PLATEAU.h;
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.7), toonMat(0xf7ecd7));
    wall.position.y = 1.05; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 1.5, 4), toonMat(0xd8703c));
    roof.position.y = 2.85; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 0.08), toonMat(0x6b4a2f));
    door.position.set(0, 0.58, 1.36); g.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), basicMat(0xffe9a8));
    win.position.set(1.0, 1.25, 1.36); g.add(win);
    g.position.set(x, h0, z);
    g.rotation.y = rot;
    scene.add(g);
  });
})();

/* 风之晶（收集物） */
const crystals = [];
(function makeCrystals() {
  const geo = new THREE.OctahedronGeometry(0.42);
  const mat = toonMat(0x52e6ff, { emissive: 0x1899b3 });
  const list = [];
  for (let k = 0; k < 400 && list.length < 12; k++) {
    const x = (rng() * 2 - 1) * 230, z = (rng() * 2 - 1) * 230;
    const h = baseH(x, z);
    if (h < 3 || h > 26) continue;
    if (!farFromPlateau(x, z, 30)) continue;
    if (Math.hypot(x, z - 24) < 34) continue;              // 离出生点太近
    if (list.some(function (p) { return Math.hypot(p.x - x, p.z - z) < 42; })) continue;
    list.push({ x: x, z: z, h: h });
  }
  list.forEach(function (p, i) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.h + 1.15, p.z);
    m.castShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlow, color: 0x7feaff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(2.2, 2.2, 1);
    m.add(glow);
    scene.add(m);
    crystals.push({ mesh: m, base: p.h + 1.15, collected: false, phase: i * 1.7 });
  });
})();

/* 光尘粒子（原神式风元素光点） */
let motes;
(function makeMotes() {
  const n = 70;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rng() * 2 - 1) * 40;
    pos[i * 3 + 1] = rng() * 14 + 0.5;
    pos[i * 3 + 2] = (rng() * 2 - 1) * 40;
    vel[i * 3] = 0.8 + rng() * 1.4;
    vel[i * 3 + 1] = (rng() - 0.3) * 0.4;
    vel[i * 3 + 2] = 0.3 + rng() * 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  motes = new THREE.Points(geo, new THREE.PointsMaterial({
    map: softGlow, color: 0xbff4ff, size: 0.85, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  motes.userData.vel = vel;
  scene.add(motes);
})();

/* 云 */
const clouds = [];
(function makeClouds() {
  const mat = toonMat(0xffffff, { transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const k = 2 + rng() * 2;
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
      s.position.set((rng() - 0.5) * 5 * k * 0.4, (rng() - 0.5) * 0.8, (rng() - 0.5) * 2);
      s.scale.set(1.6 + rng(), 0.55 + rng() * 0.3, 1 + rng() * 0.5);
      g.add(s);
    }
    g.position.set((rng() * 2 - 1) * 380, 62 + rng() * 26, (rng() * 2 - 1) * 380);
    g.userData.speed = 0.6 + rng() * 0.8;
    scene.add(g);
    clouds.push(g);
  }
})();

/* 星空 */
let stars;
(function makeStars() {
  const n = 420;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, e = Math.asin(rng() * 0.95 + 0.05);
    const r = 780;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xdfeaff, size: 2.2, sizeAttenuation: false,
    transparent: true, opacity: 0
  }));
  scene.add(stars);
})();

/* 烟花（通关） */
const fireworks = [];
function spawnFirework(x, y, z, colorHex) {
  const n = 130;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 2 - 1), sp = 5 + rng() * 7;
    vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    vel[i * 3 + 1] = Math.cos(ph) * sp;
    vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: softGlow, color: colorHex, size: 1.5, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(pts);
  fireworks.push({ pts: pts, vel: vel, life: 0, maxLife: 1.8 });
}

/* =====================================================================
 * 小地图
 * ===================================================================== */
const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const mapPre = document.createElement('canvas');
mapPre.width = mapPre.height = 256;
(function prerenderMap() {
  const g = mapPre.getContext('2d');
  const N = 128;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const x = (gx / (N - 1) - 0.5) * 600;
      const z = (gy / (N - 1) - 0.5) * 600;
      const h = baseH(x, z);
      let col;
      if (h < -2) col = '#256d92';
      else if (h < SEA_LEVEL) col = '#3f9fbc';
      else if (h < 0.8) col = '#e3d19a';
      else if (h < 19) col = h > 12 ? '#5a9e46' : '#6cc24a';
      else if (h < 25) col = '#8d9298';
      else col = '#eef4f8';
      g.fillStyle = col;
      g.fillRect(gx * 2, gy * 2, 2, 2);
    }
  }
})();
function worldToMap(x, z) {
  return [(x / 600 + 0.5) * 158, (z / 600 + 0.5) * 158];
}
function drawMinimap(t) {
  mapCtx.clearRect(0, 0, 158, 158);
  mapCtx.drawImage(mapPre, 0, 0, 158, 158);
  /* 风之晶 */
  crystals.forEach(function (c) {
    if (c.collected) return;
    const p = worldToMap(c.mesh.position.x, c.mesh.position.z);
    mapCtx.fillStyle = '#7feaff';
    mapCtx.beginPath();
    mapCtx.arc(p[0], p[1], 2.2 + Math.sin(t * 3 + c.phase) * 0.8, 0, Math.PI * 2);
    mapCtx.fill();
  });
  /* 祭坛 */
  const ap = worldToMap(PLATEAU.x, PLATEAU.z);
  mapCtx.fillStyle = '#ffb02e';
  mapCtx.save();
  mapCtx.translate(ap[0], ap[1]);
  mapCtx.rotate(Math.PI / 4);
  mapCtx.fillRect(-3.4, -3.4, 6.8, 6.8);
  mapCtx.restore();
  /* 玩家箭头 */
  const pp = worldToMap(player.position.x, player.position.z);
  mapCtx.save();
  mapCtx.translate(pp[0], pp[1]);
  mapCtx.rotate(Math.PI - state.yaw);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.strokeStyle = '#1d6f80';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -6); mapCtx.lineTo(4.4, 5); mapCtx.lineTo(0, 2.6); mapCtx.lineTo(-4.4, 5);
  mapCtx.closePath();
  mapCtx.fill(); mapCtx.stroke();
  mapCtx.restore();
}

/* =====================================================================
 * 音效（WebAudio 合成，无音频文件）
 * ===================================================================== */
const audio = { ctx: null, master: null, muted: false };
function audioInit() {
  if (audio.ctx) { audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.16;
  audio.master.connect(audio.ctx.destination);
}
function beep(freq, dur, type, delay, slide) {
  if (!audio.ctx || audio.muted) return;
  const t0 = audio.ctx.currentTime + (delay || 0);
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audio.master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function sfxCollect() { beep(660, 0.12, 'sine'); beep(990, 0.2, 'sine', 0.09); }
function sfxJump() { beep(300, 0.12, 'triangle', 0, 420); }
function sfxGlide() { beep(200, 0.35, 'sawtooth', 0, 90); }
function sfxWin() {
  [523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.3, 'sine', i * 0.13); });
  beep(1568, 0.6, 'sine', 0.55);
}

/* =====================================================================
 * 输入
 * ===================================================================== */
const keys = {};
let spaceEdge = false;
window.addEventListener('keydown', function (e) {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { spaceEdge = true; e.preventDefault(); }
  if (e.code === 'KeyH') {
    const h = document.getElementById('hint');
    h.style.opacity = h.style.opacity === '0' ? '1' : '0';
  }
  if (e.code === 'KeyM') {
    audio.muted = !audio.muted;
    showToast(audio.muted ? '🔇 已静音' : '🔊 已开启音效', 1000);
  }
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

const cam = { yaw: Math.PI, pitch: 0.34, dist: 9, dragging: false, lx: 0, ly: 0 };
renderer.domElement.addEventListener('pointerdown', function (e) {
  if (e.button !== 0) return;
  cam.dragging = true; cam.lx = e.clientX; cam.ly = e.clientY;
});
window.addEventListener('pointermove', function (e) {
  if (!cam.dragging) return;
  cam.yaw -= (e.clientX - cam.lx) * 0.0052;
  cam.pitch = clamp(cam.pitch + (e.clientY - cam.ly) * 0.0045, -0.12, 1.02);
  cam.lx = e.clientX; cam.ly = e.clientY;
});
window.addEventListener('pointerup', function () { cam.dragging = false; });
renderer.domElement.addEventListener('wheel', function (e) {
  cam.dist = clamp(cam.dist + e.deltaY * 0.01, 4, 18);
  e.preventDefault();
}, { passive: false });

/* =====================================================================
 * UI 辅助
 * ===================================================================== */
const ui = {
  hud: document.getElementById('hud'),
  questCount: document.getElementById('questCount'),
  questDist: document.getElementById('questDist'),
  staminaWrap: document.getElementById('staminaWrap'),
  staminaBar: document.getElementById('staminaBar'),
  toast: document.getElementById('toast'),
  clock: document.getElementById('clock'),
  startOverlay: document.getElementById('startOverlay'),
  winCard: document.getElementById('winCard'),
  winStats: document.getElementById('winStats')
};
let toastTimer = null;
function showToast(text, dur) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, dur || 1600);
}

/* =====================================================================
 * 游戏状态与主循环
 * ===================================================================== */
const state = {
  mode: 'start',           // start | play | win
  yaw: Math.PI,            // 角色朝向
  vy: 0, onGround: true,
  gliding: false, swimming: false,
  stamina: 100, staminaIdle: 0,
  collected: 0, stage: 1,
  dayT: 0.145, startTime: 0, elapsed: 0,
  anim: 'idle', runPhase: 0,
  lastSafe: new THREE.Vector3(0, PLATEAU.h, 24)
};

player.position.set(0, baseH(0, 24) + 0.02, 24);

const GRAV = 26, WALK = 7.5, SPRINT = 13.5, SWIM = 4.6, GLIDE = 11, JUMP_V = 11.5;
const WORLD_R = 320;

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
const _camTarget = new THREE.Vector3(), _camPos = new THREE.Vector3();
const _sunDir = new THREE.Vector3();

const PALETTES = {
  day: { top: new THREE.Color(0x4aa7e8), hor: new THREE.Color(0xbfe8f5), sun: new THREE.Color(0xfff1d0), sunI: 1.15, hemiI: 0.58 },
  sunset: { top: new THREE.Color(0x35548e), hor: new THREE.Color(0xffb27a), sun: new THREE.Color(0xffb27a), sunI: 0.85, hemiI: 0.4 },
  night: { top: new THREE.Color(0x0a1230), hor: new THREE.Color(0x1c2c55), sun: new THREE.Color(0x8fa8ff), sunI: 0.22, hemiI: 0.2 }
};
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpPal(key, a, b, t) {
  _c1.copy(PALETTES[a][key]); _c2.copy(PALETTES[b][key]);
  return _c1.lerp(_c2, t);
}

function updateDayNight(dt) {
  state.dayT = (state.dayT + dt / 240) % 1;
  const ang = state.dayT * Math.PI * 2;
  const e = Math.sin(ang);
  _sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();

  let pal;
  if (e > 0.28) pal = 'day';
  else if (e > 0) { // day -> sunset
    skyUniforms.top.value.copy(lerpPal('top', 'day', 'sunset', 1 - e / 0.28));
    skyUniforms.bottom.value.copy(lerpPal('hor', 'day', 'sunset', 1 - e / 0.28));
    sun.color.copy(lerpPal('sun', 'day', 'sunset', 1 - e / 0.28));
    sun.intensity = lerp(PALETTES.day.sunI, PALETTES.sunset.sunI, 1 - e / 0.28);
    hemi.intensity = lerp(PALETTES.day.hemiI, PALETTES.sunset.hemiI, 1 - e / 0.28);
    pal = null;
  } else if (e > -0.3) { // sunset -> night
    const t = clamp(-e / 0.3, 0, 1);
    skyUniforms.top.value.copy(lerpPal('top', 'sunset', 'night', t));
    skyUniforms.bottom.value.copy(lerpPal('hor', 'sunset', 'night', t));
    sun.color.copy(lerpPal('sun', 'sunset', 'night', t));
    sun.intensity = lerp(PALETTES.sunset.sunI, PALETTES.night.sunI, t);
    hemi.intensity = lerp(PALETTES.sunset.hemiI, PALETTES.night.hemiI, t);
    pal = null;
  } else pal = 'night';

  if (pal === 'day') {
    skyUniforms.top.value.copy(PALETTES.day.top);
    skyUniforms.bottom.value.copy(PALETTES.day.hor);
    sun.color.copy(PALETTES.day.sun);
    sun.intensity = PALETTES.day.sunI;
    hemi.intensity = PALETTES.day.hemiI;
  } else if (pal === 'night') {
    skyUniforms.top.value.copy(PALETTES.night.top);
    skyUniforms.bottom.value.copy(PALETTES.night.hor);
    sun.color.copy(PALETTES.night.sun);
    sun.intensity = PALETTES.night.sunI;
    hemi.intensity = PALETTES.night.hemiI;
  }

  scene.fog.color.copy(skyUniforms.bottom.value);
  stars.material.opacity = clamp(-e * 3.2, 0, 0.9);
  /* 阴影跟随玩家 */
  sun.position.copy(player.position).addScaledVector(_sunDir, 130);
  sun.target.position.copy(player.position);
  /* 灯柱夜光 */
  const lampOn = e < 0.1;
  (window.__lamps || []).forEach(function (l) {
    l.mat.color.setHex(lampOn ? 0xffd980 : 0x8a8478);
  });

  /* 时钟文本 */
  const hour = (state.dayT * 24 + 6) % 24;
  const hh = String(hour | 0).padStart(2, '0');
  const mm = String(((hour % 1) * 60) | 0).padStart(2, '0');
  const label = e > 0.28 ? '白天' : (e > -0.1 ? (state.dayT < 0.5 ? '白天' : '黄昏') : '夜晚');
  ui.clock.textContent = label + ' · ' + hh + ':' + mm;
}

function updateSea(t) {
  const pos = seaGeo.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < pos.count; i++) {
    const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
    arr[i * 3 + 1] = 0.14 * Math.sin(t * 1.5 + x * 0.075 + z * 0.05)
      + 0.07 * Math.sin(t * 2.4 - z * 0.11 + x * 0.03);
  }
  pos.needsUpdate = true;
}

function updateMotes(dt) {
  const pos = motes.geometry.attributes.position;
  const arr = pos.array, vel = motes.userData.vel;
  for (let i = 0; i < pos.count; i++) {
    arr[i * 3] += vel[i * 3] * dt;
    arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
    arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
    /* 以玩家为中心的包裹盒 */
    if (arr[i * 3] - player.position.x > 45) arr[i * 3] -= 90;
    if (player.position.x - arr[i * 3] > 45) arr[i * 3] += 90;
    if (arr[i * 3 + 2] - player.position.z > 45) arr[i * 3 + 2] -= 90;
    if (player.position.z - arr[i * 3 + 2] > 45) arr[i * 3 + 2] += 90;
    if (arr[i * 3 + 1] > 16) arr[i * 3 + 1] = 0.5;
    if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 15;
  }
  pos.needsUpdate = true;
}

function updateFireworks(dt) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i];
    f.life += dt;
    const pos = f.pts.geometry.attributes.position;
    const arr = pos.array;
    for (let j = 0; j < pos.count; j++) {
      f.vel[j * 3 + 1] -= 5 * dt;
      arr[j * 3] += f.vel[j * 3] * dt;
      arr[j * 3 + 1] += f.vel[j * 3 + 1] * dt;
      arr[j * 3 + 2] += f.vel[j * 3 + 2] * dt;
    }
    pos.needsUpdate = true;
    f.pts.material.opacity = clamp(1 - f.life / f.maxLife, 0, 1);
    if (f.life > f.maxLife) {
      scene.remove(f.pts);
      f.pts.geometry.dispose();
      f.pts.material.dispose();
      fireworks.splice(i, 1);
    }
  }
}

function setStamina(v) {
  state.stamina = clamp(v, 0, 100);
  ui.staminaBar.style.width = state.stamina + '%';
  ui.staminaWrap.classList.toggle('show', state.stamina < 99.5);
}

function drainStamina(rate, dt) {
  state.staminaIdle = 0.9;
  setStamina(state.stamina - rate * dt);
  return state.stamina > 0;
}

function collectCheck() {
  for (let i = 0; i < crystals.length; i++) {
    const c = crystals[i];
    if (c.collected) continue;
    if (c.mesh.position.distanceToSquared(player.position) < 2.6 * 2.6) {
      c.collected = true;
      c.mesh.visible = false;
      state.collected++;
      ui.questCount.textContent = '◇ 风之晶 ' + state.collected + ' / ' + crystals.length;
      sfxCollect();
      if (state.collected >= crystals.length) {
        state.stage = 2;
        beacon.beam.visible = true;
        document.getElementById('questObjective').textContent = '返回风之祭坛';
        ui.questDist.style.display = 'block';
        showToast('✦ 集齐了所有风之晶！返回风之祭坛', 3000);
      } else {
        showToast('获得风之晶 ✦ ' + state.collected + ' / ' + crystals.length, 1100);
      }
    }
  }
}

function triggerWin() {
  state.mode = 'win';
  const sec = state.elapsed | 0;
  ui.winStats.innerHTML = '风之晶 ' + crystals.length + ' / ' + crystals.length +
    '<br>用时 ' + String((sec / 60) | 0).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  ui.winCard.classList.remove('hidden');
  sfxWin();
  const cols = [0x7feaff, 0xffb02e, 0xff8fb8, 0xffffff];
  for (let i = 0; i < 5; i++) {
    setTimeout(function () {
      spawnFirework(
        PLATEAU.x + (Math.random() * 2 - 1) * 14, PLATEAU.h + 10 + Math.random() * 8,
        PLATEAU.z + (Math.random() * 2 - 1) * 14,
        cols[i % cols.length]);
    }, i * 380);
  }
}

/* ---------------- 玩家更新 ---------------- */
function updatePlayer(dt, t) {
  const p = player.position;
  const ground = baseH(p.x, p.z);
  const waterDepth = SEA_LEVEL - ground;

  /* 相对相机的移动方向 */
  _fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  _right.set(-_fwd.z, 0, _fwd.x);
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  _move.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
  const hasInput = _move.lengthSq() > 0.001;
  if (hasInput) _move.normalize();

  const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && hasInput;

  /* ----- 游泳模式判定 ----- */
  if (state.swimming) {
    if (waterDepth < 1.0 && ground > -1.0) {
      state.swimming = false;
      p.y = ground;
    } else {
      drainStamina(8, dt);
      if (state.stamina <= 0) {
        /* 体力耗尽：冲回岸边 */
        p.copy(state.lastSafe);
        state.vy = 0;
        state.swimming = false;
        setStamina(40);
        showToast('体力耗尽，你被浪冲回了岸边…', 2200);
      } else {
        if (hasInput) {
          p.addScaledVector(_move, SWIM * dt);
          state.yaw = lerpAngle(state.yaw, Math.atan2(_move.x, _move.z), 1 - Math.pow(0.001, dt));
        }
        p.y = 0.12 + Math.sin(t * 2.6) * 0.07;
        state.vy = 0;
        player.rotation.x = 0;
        state.anim = 'swim';
        P.wing.visible = false;
        state.gliding = false;
      }
    }
  }

  if (!state.swimming) {
    /* ----- 空中 / 地面 ----- */
    if (state.onGround) {
      /* 起跳 */
      if (spaceEdge) {
        state.vy = JUMP_V;
        state.onGround = false;
        sfxJump();
      }
      /* 冲刺 */
      if (wantSprint && state.stamina > 0.5) {
        if (hasInput) p.addScaledVector(_move, SPRINT * dt);
        drainStamina(22, dt);
        state.anim = 'run';
        state.runPhase += dt * (SPRINT / WALK);
      } else if (hasInput) {
        p.addScaledVector(_move, WALK * dt);
        state.anim = 'run';
        state.runPhase += dt;
      } else {
        state.anim = 'idle';
      }
    } else {
      /* 空中 */
      if (spaceEdge && !state.gliding && state.vy < 1 && state.stamina > 1) {
        state.gliding = true;
        sfxGlide();
      } else if (spaceEdge && state.gliding) {
        state.gliding = false;
      }
      if (state.gliding) {
        if (!drainStamina(7, dt)) state.gliding = false;
        state.vy = Math.max(state.vy - GRAV * dt * 0.12, -3.1);
        if (hasInput) {
          state.yaw = lerpAngle(state.yaw, Math.atan2(_move.x, _move.z), 1 - Math.pow(0.002, dt));
        }
        p.x += Math.sin(state.yaw) * GLIDE * dt;
        p.z += Math.cos(state.yaw) * GLIDE * dt;
        state.anim = 'glide';
      } else {
        state.vy -= GRAV * dt;
        if (hasInput) {
          p.addScaledVector(_move, WALK * 1.05 * dt);
          state.yaw = lerpAngle(state.yaw, Math.atan2(_move.x, _move.z), 1 - Math.pow(0.005, dt));
        }
        state.anim = 'jump';
      }
    }

    /* 重力与落地 */
    if (!state.onGround) {
      p.y += state.vy * dt;
      if (p.y <= ground) {
        p.y = ground;
        state.vy = 0;
        state.onGround = true;
        state.gliding = false;
      }
    }
    /* 入水 */
    if (state.onGround && waterDepth > 1.2) {
      state.swimming = true;
      state.gliding = false;
      P.wing.visible = false;
      showToast('进入游泳状态 · 注意体力', 1400);
    }
    if (state.onGround && ground > 0.6) state.lastSafe.set(p.x, ground, p.z);
  }

  /* 边界 */
  p.x = clamp(p.x, -WORLD_R, WORLD_R);
  p.z = clamp(p.z, -WORLD_R, WORLD_R);

  /* 体力回复 */
  if (state.staminaIdle > 0) state.staminaIdle -= dt;
  else if (!state.swimming && !state.gliding && !(state.onGround && wantSprint)) {
    setStamina(state.stamina + 20 * dt);
  }

  /* 朝向与姿态 */
  player.rotation.y = state.yaw;
  const rig = player.children[0];
  if (state.anim === 'run') rig.rotation.x = 0.1;
  else if (state.anim === 'glide') rig.rotation.x = 0.32;
  else if (state.anim === 'swim') rig.rotation.x = 1.25;
  else rig.rotation.x = 0;
  P.wing.visible = state.gliding;
  poseCharacter(P, state.anim, state.anim === 'run' ? state.runPhase : t,
    state.anim === 'run' ? (wantSprint ? 1.35 : 1) : 1);

  /* 滑翔时相机拉远一点 */
  cam.dist = clamp(cam.dist, 4, 18);
}

function updateCamera(dt) {
  _camTarget.copy(player.position);
  _camTarget.y += 1.6;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  _camPos.set(
    _camTarget.x + Math.sin(cam.yaw) * cp * cam.dist,
    _camTarget.y + sp * cam.dist,
    _camTarget.z + Math.cos(cam.yaw) * cp * cam.dist
  );
  const minY = Math.max(baseH(_camPos.x, _camPos.z) + 1.3, 0.9);
  if (_camPos.y < minY) _camPos.y = minY;
  camera.position.lerp(_camPos, 1 - Math.pow(0.0001, dt));
  camera.lookAt(_camTarget);
}

/* ---------------- 主循环 ---------------- */
const clock = new THREE.Clock();
let elapsedTotal = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsedTotal += dt;
  const t = elapsedTotal;

  if (state.mode === 'play') {
    state.elapsed += dt;
    updatePlayer(dt, t);
    collectCheck();
    if (state.stage === 2) {
      const d = Math.hypot(player.position.x - PLATEAU.x, player.position.z - PLATEAU.z);
      ui.questDist.textContent = '↗ 距离祭坛 ' + (d | 0) + ' m';
      if (d < 5) triggerWin();
    }
  } else if (state.mode === 'start') {
    /* 开场镜头：绕祭坛缓慢旋转 */
    cam.yaw += dt * 0.12;
  }

  spaceEdge = false;

  /* 全局动画 */
  beacon.pedestal.rotation.y += dt * 0.8;
  beacon.pedestal.position.y = 2.0 + Math.sin(t * 1.8) * 0.12;
  if (beacon.beam.visible) beacon.beam.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
  crystals.forEach(function (c) {
    if (c.collected) return;
    c.mesh.rotation.y += dt * 1.6;
    c.mesh.position.y = c.base + Math.sin(t * 2 + c.phase) * 0.16;
  });
  clouds.forEach(function (c) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 420) c.position.x = -420;
  });
  updateSea(t);
  updateMotes(dt);
  updateFireworks(dt);
  updateDayNight(dt);
  updateCamera(dt);
  drawMinimap(t);

  renderer.render(scene, camera);
}

/* ---------------- 启动 ---------------- */
document.getElementById('startBtn').addEventListener('click', function () {
  audioInit();
  ui.startOverlay.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  state.mode = 'play';
  state.startTime = performance.now();
  cam.yaw = Math.PI; cam.pitch = 0.34;
  showToast('收集散落在岛上的 12 枚风之晶吧！', 2600);
  setTimeout(function () { document.getElementById('hint').style.opacity = '0'; }, 16000);
});
document.getElementById('continueBtn').addEventListener('click', function () {
  ui.winCard.classList.add('hidden');
  state.mode = 'play';
});

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* 调试钩子（测试用） */
window.__game = {
  tp: function (x, z) {
    player.position.set(x, baseH(x, z) + 0.3, z);
    state.vy = 0; state.onGround = false; state.swimming = false;
  },
  cam: cam,
  setDay: function (t) { state.dayT = ((t % 1) + 1) % 1; },
  collectAll: function () {
    crystals.forEach(function (c) {
      if (!c.collected) { c.collected = true; c.mesh.visible = false; state.collected++; }
    });
    ui.questCount.textContent = '◇ 风之晶 ' + state.collected + ' / ' + crystals.length;
    state.stage = 2; beacon.beam.visible = true;
    document.getElementById('questObjective').textContent = '返回风之祭坛';
    ui.questDist.style.display = 'block';
  },
  player: player,
  state: state,
  crystals: crystals
};

animate();
})();
