/* =====================================================================
 * Astra 向导精灵 [L2] —— 派蒙式漂浮 NPC：靠近按 F 对话
 * 台词根据游戏进度自动切换（引导 → 探索 → 冲刺 → 讨伐 → 传送 → Boss）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const N = { lines: [], lineIdx: 0, open: false, spirit: null };

  A.define({
    id: 'npc', layer: 2, deps: ['engine', 'world', 'ui', 'audio', 'player'],
    setup: function () { N.init(); return N; },
    update: function (dt, t) { N.update(dt, t); }
  });

  function buildSpirit() {
    const g = new THREE.Group();
    function toon(c) { return new THREE.MeshToonMaterial({ color: c }); }
    /* 身体（白色水滴形） */
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), toon(0xf5f9ff));
    body.scale.set(1, 1.28, 1);
    body.position.y = 0.5;
    body.castShadow = true;
    g.add(body);
    /* 斗篷领 */
    const collar = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 12), toon(0xdfe9ff));
    collar.position.y = 0.12; g.add(collar);
    /* 眼睛 + 高光 */
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a3550 });
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(0.1, 0.58, 0.26);
    const e2 = new THREE.Mesh(eyeGeo, eyeMat); e2.position.set(-0.1, 0.58, 0.26);
    g.add(e1, e2);
    /* 金色光环 */
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.025, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd45e })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.0;
    g.add(halo);
    /* 小翅膀（两片半透明，扑扇动画） */
    const wingGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xdfe9ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide
    });
    const w1 = new THREE.Mesh(wingGeo, wingMat); w1.position.set(0.3, 0.55, 0);
    const w2 = new THREE.Mesh(wingGeo, wingMat); w2.position.set(-0.3, 0.55, 0);
    w1.scale.set(0.4, 1.4, 0.9); w2.scale.set(0.4, 1.4, 0.9);
    g.add(w1, w2);
    N.wings = [w1, w2];

    /* 头顶提示叹气光点 */
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: A.engine.glowTexture('rgba(255,220,130,0.9)', 'rgba(255,220,130,0)'),
      color: 0xffd45e, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(0.9, 0.9, 1);
    glow.position.y = 1.05;
    g.add(glow);
    N.glow = glow;

    const spawn = A.world.spawn;
    const hx = A.world.altar ? A.world.altar.x + 5.5 : spawn.x + 5;
    const hz = A.world.altar ? A.world.altar.z + 3 : spawn.z + 3;
    g.position.set(hx, A.world.heightAt(hx, hz) + 1.1, hz);
    A.engine.scene.add(g);
    N.spirit = g;
  }

  /* 台词按游戏进度选择 */
  function currentLines() {
    const got = A.quest ? A.quest.crystals.filter(function (c) { return c.collected; }).length : 0;
    const total = A.quest ? A.quest.crystals.length : 12;
    const S = A.player.state;
    if (A.state.mode === 'win') {
      return ['干得漂亮！这片大地会记住你的名字。', '下次…下次我们去更远的地方冒险吧！'];
    }
    if (A.shared.huntDone && !S.atk) {
      return ['讨伐完成了？好厉害！', '嘿——这部分我说了算，奖励我来发！'];
    }
    if (S.atk) {
      return ['攻击力变强了，去雪山那边看看吧。', '听说山顶有发光的水晶，还有大家伙出没…小心！'];
    }
    if (A.chests && A.chests.opened > 0) {
      return ['宝箱里说不定有好东西，看到就开！', '按 V 打开传送面板，跑图会快很多哦。'];
    }
    if (got >= total) {
      return ['风之晶都收集齐了！回祭坛去！', '风之元素在祝贺你呢。'];
    }
    if (got >= 3) {
      return ['已经收集了不少了，继续加油！', '对了，山坡上的陡壁是可以爬的——只要体力够。', '看到金色的光了吗？那是宝箱！'];
    }
    if (A.state.elapsed > 5) {
      return ['我是小风灵，跟着我就不会迷路啦！', '收集风之晶吧，祭坛需要它们的力量。', '冲刺会消耗体力，悠着点用。'];
    }
    return ['你好呀，旅行者！'];
  }

  N.init = function () {
    buildSpirit();
    buildDialog();
    /* F 对话 */
    document.addEventListener('astra-key', function (e) {
      if (e.detail !== 'KeyF' || A.state.mode !== 'play') return;
      const p = A.shared.playerPos;
      const d = Math.hypot(N.spirit.position.x - p.x, N.spirit.position.z - p.z);
      if (d < 2.6) N.talk();
    });
  };

  function buildDialog() {
    N.el = document.getElementById('npcDialog');
    N.textEl = document.getElementById('npcText');
    N.nextEl = document.getElementById('npcNext');
  }

  N.talk = function () {
    if (!N.open) {
      N.lines = currentLines();
      N.lineIdx = 0;
      N.open = true;
      showDialog(N.lines[0], N.lines.length > 1);
    } else {
      N.lineIdx++;
      if (N.lineIdx >= N.lines.length) { closeDialog(); return; }
      showDialog(N.lines[N.lineIdx], true);
    }
  };
  function showDialog(text, more) {
    N.el.classList.remove('hidden');
    N.textEl.textContent = '';
    N.nextEl.style.visibility = more ? 'visible' : 'hidden';
    let i = 0;
    clearInterval(N.typeTimer);
    N.typeTimer = setInterval(function () {
      if (i >= text.length) { clearInterval(N.typeTimer); return; }
      N.textEl.textContent += text[i++];
    }, 28);
  }
  function closeDialog() {
    N.open = false;
    clearInterval(N.typeTimer);
    N.el.classList.add('hidden');
  }

  N.update = function (dt, t) {
    if (!N.spirit) return;
    const p = A.shared.playerPos;
    /* 漂浮 + 微转 */
    N.spirit.position.y = A.world.heightAt(N.spirit.position.x, N.spirit.position.z) + 1.1 + Math.sin(t * 1.8) * 0.14;
    N.spirit.rotation.y = Math.sin(t * 0.6) * 0.4;
    /* 翅膀扑扇 */
    const flap = Math.sin(t * 9) * 0.5;
    N.wings[0].rotation.z = flap;
    N.wings[1].rotation.z = -flap;
    /* 靠近提示光点呼吸 */
    const d = Math.hypot(N.spirit.position.x - p.x, N.spirit.position.z - p.z);
    N.glow.material.opacity = d < 2.6 ? 0.4 + Math.sin(t * 4) * 0.3 : 0.5;
    /* 对话时面向玩家 */
    if (N.open && d < 4) {
      N.spirit.rotation.y = Math.atan2(p.x - N.spirit.position.x, p.z - N.spirit.position.z);
    }
    /* 走远自动关闭 */
    if (N.open && d > 4.5) closeDialog();
  };

  A.npc = N;
})();
