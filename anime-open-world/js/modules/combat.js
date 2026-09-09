/* =====================================================================
 * Astra 战斗 [L2] —— 史莱姆式怪物 / 追击 AI / 挥剑判定 / 伤害数字 / 掉落
 * - 怪物数量由 scene.json.combat.enemies 配置，死亡 8 秒后换位重生
 * - 玩家攻击事件（player:attack）→ 锥形范围判定 → 伤害/击退/受伤数字
 * - 怪物撞击玩家 → 广播 enemy:hitPlayer（player 模块结算自己的血量）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const C = { enemies: [], kills: 0, orbs: [], slashes: [], sparks: [], projectiles: [] };

  A.define({
    id: 'combat', layer: 2,
    deps: ['engine', 'world', 'ui', 'audio', 'player'],
    setup: function () {
      C.init();
      A.combat = C;
      /* 攻击索敌：提供给 player 模块（同一层，走共享槽） */
      A.shared.aimAssist = function (x, z) {
        let best = null, bd = 3.5;
        C.enemies.forEach(function (en) {
          if (en.dead) return;
          const d = Math.hypot(en.group.position.x - x, en.group.position.z - z);
          if (d < bd) { bd = d; best = en; }
        });
        if (!best) return null;
        return Math.atan2(best.group.position.x - x, best.group.position.z - z);
      };
      return C;
    },
    update: function (dt, t) { C.update(dt, t); }
  });

  const ENEMY_HP = 70, ENEMY_SPEED = 2.3, AGGRO = 11, DEAGGRO = 18,
    ATTACK_RANGE = 1.7, ATTACK_CD = 1.4;

  let glowTexShared = null;
  function glowTex() {
    if (!glowTexShared) glowTexShared = A.engine.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    return glowTexShared;
  }

  function toon(c) { return new THREE.MeshToonMaterial({ color: c }); }

  /* ---------- 史莱姆建模 ---------- */
  function buildSlime(color) {
    const g = new THREE.Group();
    const bodyMat = toon(color);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), bodyMat);
    body.scale.set(1, 0.78, 1);
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    /* 眼睛 */
    const eyeGeo = new THREE.SphereGeometry(0.055, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1c2733 });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(0.16, 0.55, 0.42);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(-0.16, 0.55, 0.42);
    g.add(e1, e2);
    /* 血条 */
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 8;
    const tex = new THREE.CanvasTexture(cv);
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false
    }));
    bar.scale.set(1.0, 0.13, 1);
    bar.position.y = 1.15;
    g.add(bar);
    return {
      group: g, body: body, bodyMat: bodyMat,
      bar: { sprite: bar, cv: cv, ctx: cv.getContext('2d'), tex: tex }
    };
  }

  function drawBar(en) {
    const c = en.bar.ctx;
    if (en.isBoss) {
      c.clearRect(0, 0, 128, 20);
      c.fillStyle = 'rgba(15,25,45,0.85)';
      c.fillRect(0, 0, 128, 20);
      c.fillStyle = '#ffb0b0';
      c.font = 'bold 11px sans-serif';
      c.fillText(en.name || 'Boss', 4, 9);
      c.fillStyle = '#e04747';
      c.fillRect(1, 12, 126 * Math.max(0, en.hp / en.maxHp), 6);
      en.bar.tex.needsUpdate = true;
      return;
    }
    c.clearRect(0, 0, 64, 8);
    c.fillStyle = 'rgba(15,25,45,0.85)';
    c.fillRect(0, 0, 64, 8);
    c.fillStyle = '#58e07a';
    c.fillRect(1, 1, 62 * Math.max(0, en.hp / en.maxHp), 6);
    en.bar.tex.needsUpdate = true;
  }

  /* ---------- 生成 ---------- */
  function spawnSlime(x, z, ranged) {
    const h = A.world.heightAt(x, z);
    const colors = ranged ? [0xb07ae8] : [0x58c1e8, 0x7ecb68, 0xe8b258];
    const colorHex = colors[(Math.random() * colors.length) | 0];
    const parts = buildSlime(colorHex);
    parts.group.position.set(x, h + 0.1, z);
    A.engine.scene.add(parts.group);
    const maxHp = ranged ? 50 : ENEMY_HP;
    const en = {
      group: parts.group, body: parts.body, bodyMat: parts.bodyMat, bar: parts.bar,
      baseColor: colorHex, ranged: !!ranged, speed: ranged ? 1.8 : ENEMY_SPEED,
      baseScaleY: 0.78,
      hp: maxHp, maxHp: maxHp, dead: false,
      phase: Math.random() * Math.PI * 2, hopT: Math.random() * 7,
      vel: { x: 0, z: 0 }, flash: 0, attackCd: 1 + Math.random(), lunge: 0,
      deathT: -1, respawnT: -1
    };
    drawBar(en);
    A.engine.scene.add(en.group);
    C.enemies.push(en);
    return en;
  }

  function spawnSpot(minDistFromPlayer) {
    const p = A.shared.playerPos || { x: 0, z: 0 };
    for (let k = 0; k < 40; k++) {
      const x = (Math.random() * 2 - 1) * A.world.cfg.terrain.size * 0.38;
      const z = (Math.random() * 2 - 1) * A.world.cfg.terrain.size * 0.38;
      const h = A.world.heightAt(x, z);
      if (h < 2 || h > 22) continue;
      if (Math.hypot(x - p.x, z - p.z) < (minDistFromPlayer || 25)) continue;
      return { x: x, z: z };
    }
    return { x: 0, z: 60 };
  }

  /* 远程弹幕 */
  function shootProjectile(en, nx, nz) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc77dff })
    );
    m.position.copy(en.group.position).setY(en.group.position.y + 0.7);
    const p = A.shared.playerPos;
    const dir = new THREE.Vector3(
      p.x - m.position.x,
      (p.y + 0.9) - m.position.y,
      p.z - m.position.z
    ).normalize().multiplyScalar(9);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: 0xc77dff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(0.7, 0.7, 1);
    m.add(halo);
    A.engine.scene.add(m);
    C.projectiles.push({ mesh: m, vel: dir.clone(), life: 3 });
  }

  /* ---------- 精英 Boss：史莱姆之王 ---------- */
  function spawnBoss(x, z) {
    const parts = buildSlime(0xd84a4a);
    parts.group.scale.setScalar(2.1);
    parts.group.position.set(x, A.world.heightAt(x, z) + 0.2, z);
    A.engine.scene.add(parts.group);
    const en = {
      group: parts.group, body: parts.body, bodyMat: parts.bodyMat, bar: parts.bar,
      baseColor: 0xd84a4a, isBoss: true, name: '史莱姆之王',
      ranged: false, speed: 2.6, baseScaleY: 0.78,
      hp: 320, maxHp: 320, dead: false,
      phase: 0, hopT: 0,
      vel: { x: 0, z: 0 }, flash: 0, attackCd: 2, lunge: 0,
      deathT: -1, respawnT: -1,
      slamState: 0, slamT: 0, slamCd: 2
    };
    en.bar.cv.width = 128; en.bar.cv.height = 20;
    en.bar.sprite.scale.set(2.3, 0.38, 1);
    en.bar.sprite.position.y = 1.9;
    drawBar(en);
    A.engine.scene.add(en.group);
    C.enemies.push(en);
    return en;
  }

  function bossUpdate(en, dt, p) {
    const g = en.group;
    const dx = p.x - g.position.x, dz = p.z - g.position.z;
    const d = Math.hypot(dx, dz);
    const gy = A.world.heightAt(g.position.x, g.position.z);
    g.position.x += en.vel.x * dt;
    g.position.z += en.vel.z * dt;
    en.vel.x *= Math.pow(0.02, dt);
    en.vel.z *= Math.pow(0.02, dt);
    if (en.slamState === 1) {
      en.slamT -= dt;
      g.position.y = gy + 0.4 + (0.8 - en.slamT) * 3.5;
      en.body.scale.y = 0.78 - 0.15 * Math.max(0, en.slamT / 0.8);
      if (en.slamT <= 0) en.slamState = 2;
      return;
    }
    if (en.slamState === 2) {
      g.position.y -= 30 * dt;
      if (g.position.y <= gy) {
        g.position.y = gy;
        en.slamState = 0;
        en.slamCd = 3.5;
        A.effects.burst(g.position.x, gy + 0.3, g.position.z, 0xffb0a0, 26, 9, 1.5);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 32),
          new THREE.MeshBasicMaterial({ color: 0xffc0a0, transparent: true, opacity: 0.8,
            side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(g.position.x, gy + 0.15, g.position.z);
        A.engine.scene.add(ring);
        C.rings.push({ mesh: ring, life: 0 });
        if (d < 5.5) A.emit('enemy:hitPlayer', { dmg: Math.round(20 + Math.random() * 10) });
        A.audio.hit();
      }
      return;
    }
    en.slamCd -= dt;
    if (d > 1.4) {
      g.position.x += dx / d * en.speed * dt;
      g.position.z += dz / d * en.speed * dt;
      g.position.y = A.world.heightAt(g.position.x, g.position.z);
      g.rotation.y = Math.atan2(dx, dz);
      en.hopT += dt * 5;
    }
    en.attackCd -= dt;
    if (d < 2.2 && en.attackCd <= 0) {
      en.attackCd = 1.2;
      A.emit('enemy:hitPlayer', { dmg: Math.round(12 + Math.random() * 6) });
    }
    if (d < 6 && d > 2 && en.slamCd <= 0) {
      en.slamState = 1;
      en.slamT = 0.8;
    }
    if (C.rings) {
      for (let i = C.rings.length - 1; i >= 0; i--) {
        const r = C.rings[i];
        r.life += dt;
        r.mesh.scale.setScalar(1 + r.life * 9);
        r.mesh.material.opacity = Math.max(0, 0.8 * (1 - r.life / 0.5));
        if (r.life > 0.5) {
          A.engine.scene.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          C.rings.splice(i, 1);
        }
      }
    }
  }

  /* ---------- 受击 / 死亡 ---------- */
  function damageNumber3D(worldPos, text, color) {
    const v = worldPos.clone().project(A.engine.camera);
    if (v.z > 1) return;
    A.ui.damageNumber(
      (v.x * 0.5 + 0.5) * window.innerWidth,
      (-v.y * 0.5 + 0.5) * window.innerHeight - 24,
      text, color);
  }

  function hurtEnemy(en, dmg, kx, kz) {
    if (en.dead) return;
    en.hp -= dmg;
    A.hitStopT = 0.055;                          // 命中顿帧
    const kb = en.isBoss ? 1.2 : 5.5;
    en.vel.x += kx * kb;
    en.vel.z += kz * kb;
    en.flash = 0.12;
    en.bodyMat.color.setHex(0xffffff);
    A.audio.hit();
    spark(en.group.position.clone().setY(en.group.position.y + 0.7), 0xfff0a0, 0.7);
    damageNumber3D(en.group.position.clone().setY(en.group.position.y + 1.2),
      Math.round(dmg), '#ffd45e');
    drawBar(en);
    if (en.hp <= 0) killEnemy(en);
  }

  /* 命中/击杀 光效 */
  function spark(pos, color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    A.engine.scene.add(s);
    C.sparks.push({ sprite: s, life: 0, size: size });
  }

  function killEnemy(en) {
    en.dead = true;
    en.deathT = 0.55;
    en.bar.sprite.visible = false;
    C.kills++;
    A.shared.kills = C.kills;
    A.emit('enemy:killed', { ranged: en.ranged });
    A.audio.enemyDie();
    if (en.isBoss) {
      A.player.state.atk = (A.player.state.atk || 0) + 15;
      A.effects.burst(en.group.position.x, en.group.position.y + 1, en.group.position.z, 0xffd45e, 40, 8, 1.8);
      A.ui.showToast('击败史莱姆之王！攻击力永久 +15', 3000);
      en.respawnT = 60;
    }
    spark(en.group.position.clone().setY(en.group.position.y + 0.5), 0x9affc0, 1.6);
    A.ui.showToast('击败史莱姆！已击败 ' + C.kills + ' 只', 1200);
    /* 掉落回复球（40% 概率） */
    if (Math.random() < 0.4) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x6ce87a }));
      orb.position.copy(en.group.position).setY(A.world.heightAt(en.group.position.x, en.group.position.z) + 0.5);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex(), color: 0x8aff9a, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(1.2, 1.2, 1);
      orb.add(halo);
      A.engine.scene.add(orb);
      C.orbs.push({ mesh: orb, t: Math.random() * 6 });
    }
    en.respawnT = 8;
  }

  /* ---------- 玩家攻击判定（player 模块广播 player:attack） ---------- */
  function slashEffect(yaw, px, pz, py) {
    const geo = new THREE.RingGeometry(0.7, 1.7, 24, 1, -0.9, 1.8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff3c8, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px + Math.sin(yaw) * 0.5, py + 1.05, pz + Math.cos(yaw) * 0.5);
    m.rotation.x = -Math.PI / 2 + 0.25;
    m.rotation.z = -yaw;
    A.engine.scene.add(m);
    C.slashes.push({ mesh: m, life: 0 });
  }

  function onPlayerAttack(e) {
    if (A.state.mode !== 'play') return;
    const atkBonus = A.player.state.atk || 0;
    slashEffect(e.yaw, e.x, e.z, A.shared.playerPos.y);
    let hitAny = false;
    C.enemies.forEach(function (en) {
      if (en.dead) return;
      const dx = en.group.position.x - e.x, dz = en.group.position.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.4) return;
      const ang = Math.atan2(dx, dz);
      let diff = ang - e.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.4) return;
      hitAny = true;
      hurtEnemy(en, 20 + Math.random() * 12 + atkBonus, dx / (d || 1), dz / (d || 1));
    });
  }

  /* ---------- 回复球 ---------- */
  function updateOrbs(dt, t) {
    const p = A.shared.playerPos;
    for (let i = C.orbs.length - 1; i >= 0; i--) {
      const o = C.orbs[i];
      o.mesh.position.y = A.world.heightAt(o.mesh.position.x, o.mesh.position.z) + 0.5 + Math.sin(t * 3 + o.t) * 0.1;
      o.mesh.rotation.y += dt * 2;
      const d = Math.hypot(o.mesh.position.x - p.x, o.mesh.position.z - p.z);
      if (d < 1.4) {
        const S = A.player.state;
        S.hp = Math.min(S.maxHp, S.hp + 25);
        A.ui.setHP(S.hp, S.maxHp);
        A.audio.heal();
        A.ui.damageNumber(window.innerWidth / 2, window.innerHeight / 2, '+25', '#7dff8a');
        A.engine.scene.remove(o.mesh);
        C.orbs.splice(i, 1);
      }
    }
  }

  /* ---------- 初始化 ---------- */
  C.init = function () {
    try {
      const cfg = A.world.cfg.combat || { enemies: 8 };
      const T = A.world.cfg.terrain;
      const altar = A.world.altar;
      const spots = A.world.sampleSpots(cfg.enemies, A.world.heightAt, {
        seed: T.seed + 21, minH: 2, maxH: 20, maxSlope: 2.5,
        radius: T.size * 0.4,
        keepClear: [
          { x: A.world.spawn.x, z: A.world.spawn.z, r: 22 },
          altar ? { x: altar.x, z: altar.z, r: 12 } : null
        ].filter(Boolean)
      });
      spots.forEach(function (s, i) { spawnSlime(s.x, s.z, i % 3 === 2); });
      /* 精英 Boss：高地上的史莱姆之王 */
      const bSpots = A.world.sampleSpots(1, A.world.heightAt, {
        seed: T.seed + 71, minH: 16, maxH: 24, maxSlope: 1.5,
        radius: T.size * 0.3, keepClear: [{ x: A.world.spawn.x, z: A.world.spawn.z, r: 45 }]
      });
      const bs = bSpots[0] || { x: 90, z: 90 };
      spawnBoss(bs.x, bs.z);
      window.__combatInit = { spots: spots.length, spawned: C.enemies.length, ok: true };
    } catch (e) {
      window.__combatInit = { err: e.message, stack: (e.stack || '').split('\n').slice(0, 3) };
    }

    A.on('player:attack', onPlayerAttack);
    A.ui.setHP(A.player.state.hp, A.player.state.maxHp);
  };

  /* ---------- 每帧 ---------- */
  C.update = function (dt, t) {
    if (A.state.mode !== 'play') return;
    const p = A.shared.playerPos;

    C.enemies.forEach(function (en) {
      if (en.isBoss && !en.dead) { bossUpdate(en, dt, p); return; }
      if (en.isBoss && en.dead) {
        if (en.deathT > 0) {
          en.deathT -= dt;
          en.group.scale.setScalar(Math.max(0.01, (en.deathT / 0.55) * 2.1));
          if (en.deathT <= 0) { A.engine.scene.remove(en.group); en.respawnT = 60; }
        } else if (en.respawnT > 0) {
          en.respawnT -= dt;
          if (en.respawnT <= 0) {
            en.group.scale.setScalar(2.1);
            en.hp = en.maxHp;
            en.dead = false;
            en.group.visible = true;
            en.bar.sprite.visible = true;
            drawBar(en);
          }
        }
        return;
      }
      /* 死亡动画 */
      if (en.dead) {
        if (en.deathT > 0) {
          en.deathT -= dt;
          en.group.scale.setScalar(Math.max(0.01, en.deathT / 0.55));
          en.group.position.y -= dt * 0.8;
          if (en.deathT <= 0) {
            A.engine.scene.remove(en.group);
            en.respawnT = 8;
          }
        } else if (en.respawnT > 0) {
          en.respawnT -= dt;
          if (en.respawnT <= 0) {
            /* 换位重生 */
            const spot = spawnSpot(30);
            const idx = C.enemies.indexOf(en);
            en.group.scale.setScalar(1);
            en.hp = en.maxHp;
            en.dead = false;
            en.group.visible = true;
            en.bar.sprite.visible = true;
            en.group.position.set(spot.x, A.world.heightAt(spot.x, spot.z) + 0.1, spot.z);
            drawBar(en);
          }
        }
        return;
      }

      /* 击退衰减 */
      en.group.position.x += en.vel.x * dt;
      en.group.position.z += en.vel.z * dt;
      en.vel.x *= Math.pow(0.02, dt);
      en.vel.z *= Math.pow(0.02, dt);

      /* 受击闪白恢复 */
      if (en.flash > 0) {
        en.flash -= dt;
        if (en.flash <= 0) en.bodyMat.color.setHex(en.baseColor);
      }

      /* 追击 / 游荡 / 远程拉扯 */
      const dx = p.x - en.group.position.x, dz = p.z - en.group.position.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (en.ranged) {
        /* 远程型：保持 4.5~9 距离，超远程弹幕 */
        if (d < AGGRO) {
          let sx = 0, sz = 0;
          if (d > 9) { sx = dx / d; sz = dz / d; }
          else if (d < 4.5) { sx = -dx / d; sz = -dz / d; }
          en.group.position.x += sx * en.speed * dt;
          en.group.position.z += sz * en.speed * dt;
          en.group.rotation.y = Math.atan2(dx, dz);
          en.hopT += dt * 6;
          moving = true;
          if (d < 11 && en.attackCd <= 0) {
            en.attackCd = 2.4;
            shootProjectile(en, dx / d, dz / d);
          }
        } else {
          en.hopT += dt * 2.5;
        }
      } else if (d < AGGRO && d > 0.6) {
        en.group.position.x += dx / d * en.speed * dt;
        en.group.position.z += dz / d * en.speed * dt;
        en.group.rotation.y = Math.atan2(dx, dz);
        en.hopT += dt * 7;
        moving = true;
      } else if (d >= AGGRO) {
        en.hopT += dt * 2.5;
        en.group.position.x += Math.sin(t * 0.4 + en.phase) * 0.5 * dt;
        en.group.position.z += Math.cos(t * 0.3 + en.phase) * 0.5 * dt;
        moving = true;
      }
      en.group.position.y = A.world.heightAt(en.group.position.x, en.group.position.z)
        + Math.abs(Math.sin(en.hopT)) * (moving ? 0.32 : 0.1);

      /* 攻击前摇：接近攻击距离时下蹲蓄力 + 预警音（仅近战型） */
      en.attackCd -= dt;
      en.lunge = Math.max(0, en.lunge - dt);
      if (!en.ranged && d < ATTACK_RANGE + 0.5 && !en.dead) {
        const ready = 1 - Math.min(1, Math.max(0, en.attackCd / ATTACK_CD));
        en.body.scale.y = 0.78 - ready * 0.1;
        if (en.attackCd < 0.3 && !en._blipped) {
          en._blipped = true;
          A.audio.swing();
        }
        if (en.attackCd > ATTACK_CD * 0.6) en._blipped = false;
      } else {
        en.body.scale.y += (0.78 - en.body.scale.y) * Math.min(1, dt * 8);
        en._blipped = false;
      }
      if (d < ATTACK_RANGE && en.attackCd <= 0 && !en.ranged) {
        en.attackCd = ATTACK_CD;
        en.lunge = 0.22;
        A.emit('enemy:hitPlayer', { dmg: Math.round(8 + Math.random() * 8) });
      }
    });

    /* 远程弹幕 */
    for (let i = C.projectiles.length - 1; i >= 0; i--) {
      const pr = C.projectiles[i];
      pr.life -= dt;
      pr.mesh.position.x += pr.vel.x * dt;
      pr.mesh.position.y += pr.vel.y * dt;
      pr.mesh.position.z += pr.vel.z * dt;
      pr.vel.y -= 5 * dt;
      const pd = Math.hypot(pr.mesh.position.x - p.x, pr.mesh.position.z - p.z);
      const dyOk = Math.abs(pr.mesh.position.y - (p.y + 0.8)) < 1.3;
      if (pd < 0.9 && dyOk && A.player.state.invuln <= 0) {
        A.emit('enemy:hitPlayer', { dmg: Math.round(10 + Math.random() * 5) });
        A.effects.burst(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, 0xc77dff, 10, 4, 0.8);
        A.engine.scene.remove(pr.mesh);
        C.projectiles.splice(i, 1);
        continue;
      }
      const gy = A.world.heightAt(pr.mesh.position.x, pr.mesh.position.z);
      if (pr.life <= 0 || pr.mesh.position.y <= gy + 0.1) {
        A.effects.burst(pr.mesh.position.x, gy + 0.2, pr.mesh.position.z, 0xc77dff, 8, 3, 0.7);
        A.engine.scene.remove(pr.mesh);
        C.projectiles.splice(i, 1);
      }
    }

    updateOrbs(dt, t);

    /* 命中/击杀 光效衰减 */
    for (let i = C.sparks.length - 1; i >= 0; i--) {
      const s = C.sparks[i];
      s.life += dt * 5;
      s.sprite.scale.setScalar(s.size * (1 + s.life * 1.6));
      s.sprite.material.opacity = Math.max(0, 0.9 * (1 - s.life));
      if (s.life >= 1) {
        A.engine.scene.remove(s.sprite);
        s.sprite.material.dispose();
        C.sparks.splice(i, 1);
      }
    }

    /* 挥砍弧光衰减 */
    for (let i = C.slashes.length - 1; i >= 0; i--) {
      const s = C.slashes[i];
      s.life += dt;
      s.mesh.material.opacity = Math.max(0, 0.85 * (1 - s.life / 0.16));
      if (s.life > 0.16) {
        A.engine.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        C.slashes.splice(i, 1);
      }
    }
  };

  C.orbs = [];
  C.slashes = [];
  A.combat = C;
})();
