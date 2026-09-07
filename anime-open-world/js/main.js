/* =====================================================================
 * Astra 启动器 —— 场景选择 / 模块装配 / 主循环 / 调试钩子
 * ===================================================================== */
(function () {
  const A = window.Astra;

  /* 全局错误捕获：任何脚本/循环错误都记录并提示，不让游戏静默卡死 */
  window.__errors = window.__errors || [];
  window.addEventListener('error', function (e) {
    const msg = e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno;
    if (window.__errors.indexOf(msg) === -1) {
      window.__errors.push(msg);
      try { A.ui.showToast('⚠ ' + msg, 4000); } catch (err) { /* ignore */ }
    }
  });

  /* 场景选择：URL ?scene= > localStorage > 默认第一个 */
  function pickScene(list) {
    const q = new URLSearchParams(location.search).get('scene');
    if (q && list.some(function (s) { return s.id === q; })) return q;
    const saved = localStorage.getItem('astra.scene');
    if (saved && list.some(function (s) { return s.id === saved; })) return saved;
    return list[0].id;
  }

  function buildScenePicker(list) {
    const listEl = document.getElementById('sceneList');
    if (!listEl) return;
    listEl.innerHTML = '';
    const current = localStorage.getItem('astra.scene');
    list.forEach(function (s) {
      const btn = document.createElement('button');
      btn.className = 'charBtn' + (s.id === current ? ' active' : '');
      btn.textContent = s.title;
      btn.title = s.desc || s.title;
      btn.onclick = function () {
        localStorage.setItem('astra.scene', s.id);
        location.search = '?scene=' + s.id;
      };
      listEl.appendChild(btn);
    });
  }

  /* 全局按键：H 提示 / M 静音 */
  document.addEventListener('astra-key', function (code) {
    const k = code.detail || code;
    if (k === 'KeyH') {
      const h = document.getElementById('hint');
      h.style.opacity = h.style.opacity === '0' ? '1' : '0';
    }
    if (k === 'KeyM') {
      const muted = A.audio.toggleMute();
      A.ui.showToast(muted ? '🔇 已静音' : '🔊 已开启音效', 1000);
    }
  });

  /* ---------- 启动 ---------- */
  A.sceneLoader.list().then(function (list) {
    A.ui.init();
    const sceneId = pickScene(list);
    const sceneDef = list.find(function (s) { return s.id === sceneId; }) || list[0];
    document.getElementById('gameTitle').textContent = '风 之 原';
    document.getElementById('gameSub').textContent = sceneDef.title + ' · 二次元开放世界原型';
    buildScenePicker(list);
    return A.sceneLoader.load(sceneId);
  }).then(function (cfg) {
    /* ---------- 分层启动（顺序即依赖：L0 基座 → L1 世界 → L2 模块） ---------- */
    A.kernel.boot(['engine', 'input', 'ui', 'audio'], { cfg: cfg });
    A.kernel.boot(['world', 'props', 'landmarks', 'sceneLoader'], { cfg: cfg });
    A.sceneLoader.apply(cfg);
    A.kernel.boot(['player', 'vrm', 'sky', 'minimap', 'quest', 'effects'], { cfg: cfg });

    /* 开始按钮 */
    document.getElementById('startBtn').addEventListener('click', function () {
      A.audio.init();
      A.ui.startOverlay.classList.add('hidden');
      A.ui.hud.classList.remove('hidden');
      A.state.mode = 'play';
      A.input.cam.yaw = Math.PI; A.input.cam.pitch = 0.34;
      A.ui.showToast('收集散落在岛上的 ' + A.quest.crystals.length + ' 枚风之晶吧！', 2600);
      setTimeout(function () {
        document.getElementById('hint').style.opacity = '0';
      }, 16000);
    });

    /* 调试钩子（自动化测试用） */
    window.__game = {
      tp: function (x, z) {
        A.player.root.position.set(x, A.world.heightAt(x, z) + 0.3, z);
        A.player.state.vy = 0;
        A.player.state.onGround = false;
        A.player.state.swimming = false;
      },
      cam: A.input.cam,
      baseH: A.world.heightAt,
      setStamina: function (v) { A.player.state.stamina = v; },
      setCharacter: A.vrm.setCharacter,
      vrmSys: A.vrm,
      setDay: function (t) { A.sky.dayT = ((t % 1) + 1) % 1; },
      state: A.state,
      player: A.player.root,
      crystals: A.quest.crystals
    };

    /* ---------- 主循环 ----------
     * rAF 驱动 + 看门狗：标签页切后台 rAF 停摆时，
     * 自动降级为低帧率模拟（回来恢复满帧），游戏不会假死 */
    const clock = new THREE.Clock();
    let elapsed = 0;
    let lastFrame = performance.now();

    A.step = function (dt, t, skipRender) {
      /* kernel.tick 按模块树启动顺序调用各模块的 update（L1 → L2） */
      A.kernel.tick(dt, t);
      /* 空格按下沿信号：本帧已被 player 消费，必须清零，
         否则按一次跳会每帧重复触发（跳跃音效连响/风之翼反复开合） */
      A.input.spaceEdge = false;
      /* 开始界面：镜头绕角色缓慢旋转 */
      if (A.state.mode === 'start') {
        A.input.cam.yaw += dt * 0.12;
      }
      A.input.follow(A.player.root.position, A.world.heightAt, dt);
      if (!skipRender) A.engine.render();
    };

    (function animate() {
      requestAnimationFrame(animate);
      try {
        const dt = Math.min(clock.getDelta(), 0.05);
        elapsed += dt;
        lastFrame = performance.now();
        A.step(dt, elapsed);
      } catch (e) {
        if (!window.__loopErr) {
          let dump;
          try {
            dump = JSON.stringify({
              name: e && e.name, msg: e && e.message, str: String(e),
              keys: e && Object.getOwnPropertyNames(e),
              stack: e && e.stack
            });
          } catch (e2) { dump = "序列化失败:" + e2.message; }
          window.__loopErr = dump || "(空)";
          console.error('主循环异常:', e);
          window.__errors.push('loop: ' + (e && e.message));
        }
      }
    })();

    /* 看门狗：rAF 超过 250ms 没跑（后台节流），维持 4fps 模拟 */
    setInterval(function () {
      if (performance.now() - lastFrame > 250) {
        elapsed += 0.25;
        lastFrame = performance.now();
        try { A.step(0.25, elapsed); } catch (e) { /* 后台静默 */ }
      }
    }, 250);

    /* 测试钩子：手动推进帧（不依赖 rAF；skipRender 跳过渲染以加速逻辑测试） */
    window.__step = function (frames, dt, skipRender) {
      for (let i = 0; i < frames; i++) {
        elapsed += dt;
        lastFrame = performance.now();
        A.step(dt, elapsed, skipRender && i < frames - 1);
      }
      return elapsed;
    };
  }).catch(function (e) {
    document.getElementById('loadingTip').textContent = '场景加载失败：' + e.message;
    console.error(e);
  });
})();
