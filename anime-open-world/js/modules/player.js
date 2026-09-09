/* =====================================================================
 * Astra 玩家 [L2] —— 内置小人建模 + 动作状态机 + 地形碰撞
 * 动作：待机 / 跑 / 冲刺 / 跳 / 落下 / 落地缓冲 / 滑翔 / 游泳
 * 解耦规则：不直接引用同层模块——
 *   动画钩子走 Astra.poses（vrm 模块注册），位置走 Astra.shared.playerPos
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const PL = { state: null };

  const GRAV = 26, WALK = 7.5, SPRINT = 13.5, SWIM = 4.6, GLIDE = 11, JUMP_V = 11.5;
  const WORLD_R = 320, STEP_MAX = 0.65, SLOPE_MAX = 0.85;   // 约40°以上进入攀爬
  const CLIMB_SPEED = 1.8, CLIMB_WALL = 50;                 // 高度场地形无悬空体，陡壁全部可攀
  const CLIMB_STAM_UP = 12, CLIMB_STAM_SIDE = 6;            // 向上攀爬 / 横向挪动 的体力消耗

  A.define({
    id: 'player', layer: 2,
    deps: ['engine', 'input', 'ui', 'audio', 'world'],
    setup: function () {
      PL.init();
      /* 动画提供者由同层模块注册（如 vrm），player 只面向钩子编程 */
      PL.root.userData.isPlayer = true;
      A.shared.playerPos = PL.root.position;   // 位置引用（原地更新）
      A.shared.playerState = PL.state;
      A.emit('player:ready', { root: PL.root, parts: PL.parts });
      A.ui.setHP(PL.state.hp, PL.state.maxHp);
      /* 敌人伤害由 combat 模块通过事件打入；血量归零回祭坛复苏 */
      A.on('enemy:hitPlayer', function (e) {
        const S = PL.state;
        if (A.state.mode !== 'play' || S.invuln > 0) return;
        S.hp = Math.max(0, S.hp - e.dmg);
        A.ui.setHP(S.hp, S.maxHp);
        A.ui.flashHit();
        A.audio.hurt();
        /* 受击数字（红色，屏幕中上方抖动） */
        A.ui.damageNumber(
          window.innerWidth / 2 + (Math.random() * 80 - 40),
          window.innerHeight / 2 - 60 + (Math.random() * 20 - 10),
          '-' + Math.round(e.dmg), '#ff6b6b');
        if (S.hp <= 0) {
          S.hp = S.maxHp;
          S.stamina = 100;
          S.climbing = false; S.gliding = false; S.swimming = false;
          S.vy = 0; S.onGround = true; S.invuln = 3;
          PL.root.position.set(A.world.spawn.x, A.world.heightAt(A.world.spawn.x, A.world.spawn.z), A.world.spawn.z);
          A.ui.setHP(S.hp, S.maxHp);
          A.ui.showToast('你倒下了…已在风之祭坛苏醒', 2600);
        }
      });
      return PL;
    },
    update: function (dt, t) {
      /* 只在游玩状态模拟；开始界面/结算时冻结 */
      if (A.state.mode !== 'play') return;
      PL.update(dt, t);
    }
  });

  /* ---------- 内置小人（程序化建模，可被 VRM 角色替换显示） ---------- */
  function buildCharacter() {
    const C = {
      skin: 0xffe3c8, hair: 0x8fd8f2, hairDark: 0x6cc0e4,
      dress: 0xf4f8ff, dressBlue: 0x3d6fe0, gold: 0xf0c75e,
      eye: 0x27346b, blush: 0xff9fa8
    };
    const root = new THREE.Group();
    const rig = new THREE.Group();
    root.add(rig);
    const M = {};
    function mesh(geo, mat, x, y, z, parent) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || rig).add(m);
      return m;
    }
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.4, 4, 8);
    M.legL = new THREE.Group(); M.legL.position.set(0.095, 0.56, 0);
    M.legR = new THREE.Group(); M.legR.position.set(-0.095, 0.56, 0);
    mesh(legGeo, new THREE.MeshToonMaterial({ color: C.skin }), 0, -0.24, 0, M.legL);
    mesh(legGeo, new THREE.MeshToonMaterial({ color: C.skin }), 0, -0.24, 0, M.legR);
    rig.add(M.legL, M.legR);

    const skirt = mesh(new THREE.ConeGeometry(0.3, 0.32, 12), new THREE.MeshToonMaterial({ color: C.dress }), 0, 0.68, 0);
    const hem = mesh(new THREE.TorusGeometry(0.27, 0.02, 6, 16), new THREE.MeshToonMaterial({ color: C.gold }), 0, 0.53, 0);
    hem.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.145, 0.175, 0.38, 10), new THREE.MeshToonMaterial({ color: C.dress }), 0, 0.98, 0);
    const collar = mesh(new THREE.TorusGeometry(0.115, 0.035, 6, 14), new THREE.MeshToonMaterial({ color: C.dressBlue }), 0, 1.15, 0);
    collar.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshToonMaterial({ color: C.gold }), 0, 1.1, 0.16);

    const armGeo = new THREE.CapsuleGeometry(0.048, 0.36, 4, 8);
    const sleeveGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8);
    M.armL = new THREE.Group(); M.armL.position.set(0.21, 1.12, 0);
    M.armR = new THREE.Group(); M.armR.position.set(-0.21, 1.12, 0);
    [M.armL, M.armR].forEach(function (arm) {
      mesh(armGeo, new THREE.MeshToonMaterial({ color: C.skin }), 0, -0.21, 0, arm);
      mesh(sleeveGeo, new THREE.MeshToonMaterial({ color: C.dress }), 0, -0.04, 0, arm);
    });
    rig.add(M.armL, M.armR);

    /* 佩剑（挂在右手，攻击时随手臂挥动） */
    const sword = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 8), new THREE.MeshToonMaterial({ color: 0x4a3222 }), 0, 0, 0, sword);
    mesh(new THREE.BoxGeometry(0.14, 0.028, 0.05), new THREE.MeshToonMaterial({ color: 0xf0c75e }), 0, -0.08, 0, sword);
    mesh(new THREE.BoxGeometry(0.045, 0.58, 0.018), new THREE.MeshToonMaterial({ color: 0xd7e3ee }), 0, -0.38, 0, sword);
    M.armR.add(sword);

    M.head = new THREE.Group();
    M.head.position.set(0, 1.42, 0);
    rig.add(M.head);
    const headMesh = mesh(new THREE.SphereGeometry(0.34, 18, 14), new THREE.MeshToonMaterial({ color: C.skin }), 0, 0, 0.01, M.head);
    headMesh.scale.set(1, 0.96, 0.93);
    function flat(geo, color, x, y, z, sx, sy, sz, op) {
      const m = mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: op !== undefined, opacity: op === undefined ? 1 : op }), x, y, z, M.head);
      m.scale.set(sx, sy, sz);
      m.castShadow = false;
      return m;
    }
    const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
    flat(eyeGeo, C.eye, 0.13, -0.01, 0.33, 0.85, 1.55, 0.4);
    flat(eyeGeo, C.eye, -0.13, -0.01, 0.33, 0.85, 1.55, 0.4);
    flat(new THREE.SphereGeometry(0.02, 6, 6), 0xffffff, 0.16, 0.05, 0.365, 1, 1, 1);
    flat(new THREE.SphereGeometry(0.02, 6, 6), 0xffffff, -0.104, 0.05, 0.365, 1, 1, 1);
    flat(new THREE.SphereGeometry(0.009, 5, 5), 0xffffff, 0.105, -0.07, 0.37, 1, 1, 1);
    flat(new THREE.SphereGeometry(0.009, 5, 5), 0xffffff, -0.155, -0.07, 0.37, 1, 1, 1);
    flat(new THREE.SphereGeometry(0.045, 8, 6), C.blush, 0.185, -0.1, 0.305, 1, 0.6, 0.4, 0.4);
    flat(new THREE.SphereGeometry(0.045, 8, 6), C.blush, -0.185, -0.1, 0.305, 1, 0.6, 0.4, 0.4);

    const hairMat = new THREE.MeshToonMaterial({ color: C.hair });
    const cap = mesh(new THREE.SphereGeometry(0.41, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.40), hairMat, 0, 0.03, -0.01, M.head);
    cap.scale.set(1.06, 1.12, 1.05);
    const back = mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshToonMaterial({ color: C.hairDark }), 0, -0.06, -0.1, M.head);
    back.scale.set(1.07, 1.28, 0.88);
    const bangGeo = new THREE.SphereGeometry(0.095, 8, 6);
    [[0.2, 0.2], [0.1, 0.26], [0, 0.285], [-0.1, 0.26], [-0.2, 0.2]].forEach(function (p) {
      const b = mesh(bangGeo, hairMat, p[0], 0.2, p[1], M.head);
      b.scale.set(1, 0.85, 0.55);
    });
    const ahoge = mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hairMat, 0.04, 0.44, 0.02, M.head);
    ahoge.rotation.z = -0.4;
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
      const tip = mesh(new THREE.ConeGeometry(0.058, 0.18, 7), new THREE.MeshToonMaterial({ color: C.hairDark }), 0.045 * side, y - 0.06, 0, g);
      tip.rotation.x = Math.PI;
      M.head.add(g);
      return g;
    }
    M.tailL = tail(1);
    M.tailR = tail(-1);

    /* 风之翼 */
    const wing = new THREE.Group();
    wing.position.set(0, 1.25, -0.16);
    const ws = new THREE.Shape();
    ws.moveTo(0, 0.05);
    ws.quadraticCurveTo(0.85, 0.62, 1.95, 0.28);
    ws.quadraticCurveTo(1.05, -0.18, 0, -0.14);
    const wg = new THREE.ShapeGeometry(ws, 10);
    const wmat = new THREE.MeshToonMaterial({ color: 0xf2903a, side: THREE.DoubleSide });
    const smat = new THREE.MeshToonMaterial({ color: 0xfff4e0, side: THREE.DoubleSide });
    [1, -1].forEach(function (side) {
      const p = new THREE.Group();
      const w = new THREE.Mesh(wg, wmat); w.castShadow = true;
      const st = new THREE.Mesh(wg, smat);
      st.scale.set(0.55, 0.5, 1); st.position.set(0.18, 0.02, 0.01);
      p.add(w, st);
      p.scale.x = side;
      p.rotation.z = side * 0.3;
      wing.add(p);
    });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), new THREE.MeshToonMaterial({ color: 0x8a5a2b }));
    bar.rotation.z = Math.PI / 2;
    wing.add(bar);
    wing.rotation.x = -1.15;
    wing.visible = false;
    rig.add(wing);
    M.wing = wing;
    M.rig = rig;

    root.userData.parts = M;
    return root;
  }

  function poseCharacter(M, anim, t, speedRatio) {
    const s1 = Math.sin(t * 11), s2 = Math.sin(t * 2.2);
    switch (anim) {
      case 'run':
        M.legL.rotation.x = s1 * 0.95 * speedRatio;
        M.legR.rotation.x = -s1 * 0.95 * speedRatio;
        M.armL.rotation.x = -s1 * 0.8 * speedRatio;
        M.armR.rotation.x = s1 * 0.8 * speedRatio;
        M.armL.rotation.z = 0.12; M.armR.rotation.z = -0.12;
        M.head.rotation.x = 0.06;
        M.head.position.y = 1.42 + Math.abs(Math.cos(t * 11)) * 0.03 * speedRatio;
        M.tailL.rotation.x = s1 * 0.25; M.tailR.rotation.x = s1 * 0.25;
        break;
      case 'idle':
        M.legL.rotation.x = M.legR.rotation.x = 0;
        M.armL.rotation.x = s2 * 0.05; M.armR.rotation.x = -s2 * 0.05;
        M.armL.rotation.z = 0.1; M.armR.rotation.z = -0.1;
        M.head.rotation.x = Math.sin(t * 0.9) * 0.03;
        M.head.position.y = 1.42 + s2 * 0.012;
        M.tailL.rotation.x = s2 * 0.06; M.tailR.rotation.x = s2 * 0.06;
        M.tailL.rotation.z = 0.25 + s2 * 0.08; M.tailR.rotation.z = -0.25 - s2 * 0.08;
        break;
      case 'jump':
        M.legL.rotation.x = 0.55; M.legR.rotation.x = -0.25;
        M.armL.rotation.x = -2.4; M.armR.rotation.x = -2.4;
        M.armL.rotation.z = 0.35; M.armR.rotation.z = -0.35;
        M.head.rotation.x = -0.1;
        break;
      case 'glide':
        M.armL.rotation.x = -2.75; M.armR.rotation.x = -2.75;
        M.armL.rotation.z = 0.15; M.armR.rotation.z = -0.15;
        M.legL.rotation.x = 0.12; M.legR.rotation.x = 0.12;
        M.head.rotation.x = -0.15;
        M.tailL.rotation.x = 0.5 + s1 * 0.1; M.tailR.rotation.x = 0.5 + s1 * 0.1;
        M.tailL.rotation.z = 0.35; M.tailR.rotation.z = -0.35;
        break;
      case 'swim':
        M.armL.rotation.x = s1 * 1.5 - 0.6; M.armR.rotation.x = -s1 * 1.5 - 0.6;
        M.armL.rotation.z = 0.5; M.armR.rotation.z = -0.5;
        M.legL.rotation.x = s1 * 0.4; M.legR.rotation.x = -s1 * 0.4;
        M.head.rotation.x = -1.2;
        M.tailL.rotation.z = 0.6; M.tailR.rotation.z = -0.6;
        break;
      case 'climb': {
        const c1 = Math.sin(t * 7);
        M.armL.rotation.x = -2.5 + c1 * 0.35; M.armR.rotation.x = -2.5 - c1 * 0.35;
        M.armL.rotation.z = 0.15; M.armR.rotation.z = -0.15;
        M.legL.rotation.x = 0.5 + c1 * 0.35; M.legR.rotation.x = 0.5 - c1 * 0.35;
        M.head.rotation.x = 0.15;
        break;
      }
      case 'attack1': {
        const k = PL.state ? 1 - PL.state.attackTimer / 0.32 : 1;
        M.armR.rotation.x = -1.7 + k * 1.5;
        M.armR.rotation.z = 0.6 - k * 1.3;
        M.armL.rotation.x = -0.3;
        M.head.rotation.x = 0.05;
        break;
      }
      case 'attack2': {
        const k2 = PL.state ? 1 - PL.state.attackTimer / 0.32 : 1;
        M.armR.rotation.x = -2.7 + k2 * 2.3;
        M.armL.rotation.x = -0.2;
        M.head.rotation.x = k2 * 0.12;
        break;
      }
      case 'land':
        M.legL.rotation.x = -0.4; M.legR.rotation.x = -0.4;
        M.armL.rotation.x = 0.5; M.armR.rotation.x = 0.5;
        M.armL.rotation.z = 0.25; M.armR.rotation.z = -0.25;
        M.head.position.y = 1.38;
        break;
    }
  }

  /* ---------- 初始化 ---------- */
  PL.init = function () {
    PL.root = buildCharacter();
    A.engine.scene.add(PL.root);
    PL.parts = PL.root.userData.parts;
    PL.state = {
      yaw: Math.PI, vy: 0, onGround: true,
      gliding: false, swimming: false, climbing: false, climbBan: 0,
      stamina: 100, staminaIdle: 0,
      hp: 100, maxHp: 100, invuln: 0,
      attackTimer: 0, attackCd: 0, attackIdx: 0,
      anim: 'idle', runPhase: 0, landTimer: 0,
      lastSafe: new THREE.Vector3(0, 10, 24)
    };
    const sp = A.world.spawn;
    PL.root.position.set(sp.x, A.world.heightAt(sp.x, sp.z) + 0.02, sp.z);
    PL.state.lastSafe.set(sp.x, A.world.heightAt(sp.x, sp.z), sp.z);
  };

  /* ---------- 地形碰撞（台阶 + 坡度双重限制） ---------- */
  function blockedAt(nx, nz, py) {
    const nh = A.world.heightAt(nx, nz);
    const dh = nh - py;
    if (dh <= 0) return false;
    if (dh > STEP_MAX) return true;
    const d = Math.hypot(nx - PL.root.position.x, nz - PL.root.position.z);
    return d > 1e-6 && (dh / d) > SLOPE_MAX;
  }
  /* 与 blockedAt 同尺度的坡度信息（攀爬进入判定用它，保证两边一致） */
  function blockInfo(nx, nz, py) {
    const nh = A.world.heightAt(nx, nz);
    const dh = nh - py;
    const d = Math.hypot(nx - PL.root.position.x, nz - PL.root.position.z);
    const slope = d > 1e-6 ? dh / d : 0;
    if (dh <= 0) return { blocked: false, climbable: false };
    if (dh > STEP_MAX) return { blocked: true, climbable: slope < CLIMB_WALL };
    return { blocked: slope > SLOPE_MAX, climbable: slope < CLIMB_WALL };
  }
  function tryMove(dx, dz) {
    const p = PL.root.position;
    let blockedNow = false;
    if (dx !== 0) {
      const info = blockInfo(p.x + dx, p.z, p.y);
      if (!info.blocked) p.x += dx;
      else { blockedNow = true; if (info.climbable) PL.blockInfo = info; }
    }
    if (dz !== 0) {
      const info = blockInfo(p.x, p.z + dz, p.y);
      if (!info.blocked) p.z += dz;
      else { blockedNow = true; if (info.climbable) PL.blockInfo = info; }
    }
    if (!blockedNow) PL.blockInfo = null;   // 能自由走动就清除攀爬候选
  }
  /* 当前位置的坡度（梯度），mag≈tan(坡角)；e 为采样半径 */
  function slopeInfo(e) {
    e = e || 0.15;
    const p = PL.root.position;
    const gH = A.world.heightAt;
    const gx = (gH(p.x + e, p.z) - gH(p.x - e, p.z)) / (2 * e);
    const gz = (gH(p.x, p.z + e) - gH(p.x, p.z - e)) / (2 * e);
    return { gx: gx, gz: gz, mag: Math.hypot(gx, gz) };
  }
  /* 前方 0.6m 是否有可攀爬的陡壁（空中抓墙用） */
  function wallAhead(mx, mz) {
    const p = PL.root.position;
    const d = Math.hypot(mx, mz);
    if (d < 1e-6) return null;
    const nx = p.x + mx / d * 0.6, nz = p.z + mz / d * 0.6;
    const dh = A.world.heightAt(nx, nz) - p.y;
    if (dh < 0.3) return null;
    const gH = A.world.heightAt;
    const gx = gH(nx + 0.2, nz) - gH(nx - 0.2, nz);
    const gz = gH(nx, nz + 0.2) - gH(nx, nz - 0.2);
    const mag = Math.hypot(gx, gz);
    return (mag > SLOPE_MAX && mag < CLIMB_WALL) ? { gx: gx, gz: gz, mag: mag } : null;
  }

  /* ---------- 主更新 ---------- */
  PL.update = function (dt, t) {
    const S = PL.state, p = PL.root.position, P = PL.parts;
    const I = A.input;
    const ground = A.world.heightAt(p.x, p.z);
    const waterDepth = (A.world.seaLevel || 0) - ground;

    const fx = -Math.sin(I.cam.yaw), fz = -Math.cos(I.cam.yaw);
    let ix = (I.keys.KeyD || I.keys.ArrowRight ? 1 : 0) - (I.keys.KeyA || I.keys.ArrowLeft ? 1 : 0);
    let iz = (I.keys.KeyW || I.keys.ArrowUp ? 1 : 0) - (I.keys.KeyS || I.keys.ArrowDown ? 1 : 0);
    let mx = fx * iz - fz * ix, mz = fz * iz + fx * ix;
    const len = Math.hypot(mx, mz);
    const hasInput = len > 0.001;
    if (hasInput) { mx /= len; mz /= len; }
    const wantSprint = (I.keys.ShiftLeft || I.keys.ShiftRight) && hasInput;

    function drainStamina(rate) {
      S.staminaIdle = 0.9;
      S.stamina = Math.max(0, S.stamina - rate * dt);
      return S.stamina > 0;
    }

    if (S.swimming) {
      if (waterDepth < 1.0 && ground > -1.0) {
        S.swimming = false;
        p.y = ground;
      } else {
        drainStamina(8);
        if (S.stamina <= 0) {
          p.copy(S.lastSafe);
          S.vy = 0; S.swimming = false;
          A.ui.setStamina(S.stamina = 40);
          A.ui.showToast('体力耗尽，你被浪冲回了岸边…', 2200);
        } else {
          if (hasInput) {
            p.x += mx * SWIM * dt; p.z += mz * SWIM * dt;
            S.yaw = lerpAngle(S.yaw, Math.atan2(mx, mz), 1 - Math.pow(0.001, dt));
          }
          p.y = (A.world.seaLevel || 0) + 0.12 + Math.sin(t * 2.6) * 0.07;
          S.vy = 0;
          S.anim = 'swim';
          P.wing.visible = false;
          S.gliding = false;
        }
      }
    }

    if (!S.swimming) {
      if (S.landTimer > 0) {
        S.landTimer -= dt;
        S.anim = 'land';
        if (S.landTimer <= 0 && S.onGround) {
          S.anim = hasInput ? 'run' : 'idle';
        }
      } else if (S.onGround) {
        /* 攀爬进入判定：被可攀爬的陡坡挡住（与阻挡判定同一把尺子） */
        if (!S.climbing && hasInput && S.climbBan <= 0 && S.stamina > 5 &&
            PL.blockInfo && PL.blockInfo.climbable) {
          S.climbing = true;
        }
        if (S.climbing) {
          const sl = slopeInfo(0.15);
          if (hasInput && (mx * sl.gx + mz * sl.gz) / sl.mag < -0.45) {
            S.climbing = false;                       // 主动下撤
            PL.blockInfo = null;
          } else if (I.spaceEdge) {
            S.climbing = false; S.climbBan = 0.35;    // 借力起跳
            PL.blockInfo = null;
            S.vy = 8; S.onGround = false;
            A.audio.jump();
          } else if (hasInput) {
            const wall = wallAhead(mx, mz);           // 前方是否仍是陡壁
            p.x += mx * CLIMB_SPEED * dt;
            p.z += mz * CLIMB_SPEED * dt;
            p.y = A.world.heightAt(p.x, p.z);
            const upDot = (mx * sl.gx + mz * sl.gz) / sl.mag;
            if (!drainStamina(upDot > 0.15 ? CLIMB_STAM_UP : CLIMB_STAM_SIDE)) {
              S.climbing = false;
              PL.blockInfo = null;
              S.climbBan = 2;                         // 脱力：短暂无法再攀爬
              A.ui.showToast('体力耗尽，无法继续攀爬！', 1800);
            }
            /* 爬到顶 / 前方变成缓坡 → 恢复行走 */
            if (!wall && sl.mag < SLOPE_MAX) {
              S.climbing = false;
              PL.blockInfo = null;
            }
            S.anim = 'climb';
          } else {
            S.anim = 'climb';                         // 原地扒住（不耗体力）
          }
        }
        if (!S.climbing) {
          /* 攻击（左键 / J）：短促挥剑，期间移速降低 */
          if (S.attackCd > 0) S.attackCd -= dt;
          if (S.attackTimer > 0) {
            S.attackTimer -= dt;
            S.anim = S.attackIdx % 2 ? 'attack2' : 'attack1';
            if (hasInput) tryMove(mx * WALK * 0.25 * dt, mz * WALK * 0.25 * dt);
          } else {
            if (I.spaceEdge) {
              S.vy = JUMP_V;
              S.onGround = false;
              A.audio.jump();
            }
            if (I.attackEdge && S.attackCd <= 0) {
              /* 攻击索敌：3.5m 内最近敌人自动面向 */
              const aim = A.shared.aimAssist ? A.shared.aimAssist(p.x, p.z) : null;
              if (aim !== null) S.yaw = aim;
              S.attackTimer = 0.32;
              S.attackCd = 0.42;
              S.attackIdx++;
              A.audio.swing();
              A.emit('player:attack', { yaw: S.yaw, x: p.x, z: p.z });
            }
            if (wantSprint && S.stamina > 0.5) {
              if (hasInput) tryMove(mx * SPRINT * dt, mz * SPRINT * dt);
              drainStamina(22);
              S.anim = 'run';
              S.runPhase += dt * (SPRINT / WALK);
            } else if (hasInput) {
              tryMove(mx * WALK * dt, mz * WALK * dt);
              S.anim = 'run';
              S.runPhase += dt;
            } else {
              S.anim = 'idle';
            }
          }
        }
      } else {
        if (I.spaceEdge && !S.gliding && S.vy < 1 && S.stamina > 1) {
          S.gliding = true;
          A.audio.glide();
        } else if (I.spaceEdge && S.gliding) {
          S.gliding = false;
        }
        /* 空中抓墙：下落时朝向可攀爬陡壁 → 自动进入攀爬 */
        if (!S.gliding && !S.climbing && hasInput && S.climbBan <= 0 && S.vy < 3 && S.stamina > 5) {
          if (wallAhead(mx, mz)) {
            S.climbing = true;
            S.onGround = true;
            S.vy = 0;
            p.y = A.world.heightAt(p.x, p.z);
          }
        }
        if (S.gliding) {
          if (!drainStamina(7)) S.gliding = false;
          S.vy = Math.max(S.vy - GRAV * dt * 0.12, -3.1);
          if (hasInput) {
            S.yaw = lerpAngle(S.yaw, Math.atan2(mx, mz), 1 - Math.pow(0.002, dt));
          }
          tryMove(Math.sin(S.yaw) * GLIDE * dt, Math.cos(S.yaw) * GLIDE * dt);
          S.anim = 'glide';
        } else {
          S.vy -= GRAV * dt;
          if (hasInput) tryMove(mx * WALK * 1.05 * dt, mz * WALK * 1.05 * dt);
          S.anim = 'jump';
        }
      }

      if (!S.onGround) {
        p.y += S.vy * dt;
        if (p.y <= ground) {
          const hard = S.vy < -13;
          p.y = ground;
          S.vy = 0;
          S.onGround = true;
          if (S.gliding) { S.gliding = false; }
          if (hard && !S.swimming) { S.landTimer = 0.28; }
        }
      }
      if (S.onGround && waterDepth > 1.2) {
        S.swimming = true;
        S.gliding = false;
        S.climbing = false;
        P.wing.visible = false;
        A.ui.showToast('进入游泳状态 · 注意体力', 1400);
      }
      if (S.onGround && ground > 0.6) S.lastSafe.set(p.x, ground, p.z);
    }

    p.x = Math.min(WORLD_R, Math.max(-WORLD_R, p.x));
    p.z = Math.min(WORLD_R, Math.max(-WORLD_R, p.z));

    if (S.climbBan > 0) S.climbBan -= dt;
    if (S.invuln > 0) S.invuln -= dt;
    if (S.staminaIdle > 0) S.staminaIdle -= dt;
    else if (!S.swimming && !S.gliding && !(S.onGround && wantSprint)) {
      S.stamina = Math.min(100, S.stamina + 20 * dt);
    }
    A.ui.setStamina(S.stamina);

    PL.root.rotation.y = S.yaw;
    const rig = P.rig;
    rig.rotation.x = S.anim === 'run' ? 0.1 : S.anim === 'glide' ? 0.32 : S.anim === 'swim' ? 1.25 : S.anim === 'climb' ? 0.12 : 0;
    P.wing.visible = S.gliding;
    poseCharacter(P, S.anim, S.anim === 'run' ? S.runPhase : t,
      S.anim === 'run' ? (wantSprint ? 1.35 : 1) : 1);
    /* 动画提供者钩子：vrm 等同层模块通过 Astra.poses 注册，player 不感知 */
    for (let i = 0; i < A.poses.length; i++) {
      const h = A.poses[i];
      const ratio = S.anim === 'run' ? (wantSprint ? 1.35 : 1) : 1;
      if (h.pose) h.pose(S.anim, S.anim === 'run' ? S.runPhase : t, ratio);
      if (h.tick) h.tick(dt);
    }
  };

  function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }

  A.player = PL;
})();
