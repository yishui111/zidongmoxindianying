/* =====================================================================
 * Astra VRM 角色系统 [L2] —— 加载 VRoid Studio 捏的 .vrm 模型（three-vrm，MIT）
 * - models/manifest.json 声明角色，启动自动加载
 * - 面板 / 数字键 / C 键切换，也可"导入 .vrm"加载任意文件
 * - 通过 Astra.poses 钩子向 player 提供程序化人形骨骼动画
 * - 预留 VRMA 动作剪辑接口（见 README）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const V = { chars: [], active: -1, loaded: 0, total: 0, failed: 0 };

  A.define({
    id: 'vrm', layer: 2, deps: ['engine', 'ui', 'player'],
    setup: function () {
      /* ---------- VRMA 真实动作（idle 动作剪辑，存在时接管待机） ---------- */
  V.vrmaIdle = null;
  V.idleVRMAOn = false;

  V.initVRMA = function () {
    if (!gltfLoader || !window.THREE_VRM_ANIMATION) return;
    gltfLoader.register(function (p) { return new THREE_VRM_ANIMATION.VRMAnimationLoaderPlugin(p); });
    /* 带重试的加载（网络/解析偶发失败自动重试两次） */
    function tryLoad(k) {
      gltfLoader.loadAsync('models/anims/idle.vrma?v=' + Date.now()).then(function (g) {
        const list = g.userData.vrmAnimations;
        if (list && list.length) {
          V.vrmaIdle = list[0];
          console.log('VRMA 待机动作已加载');
        } else if (k > 0) {
          setTimeout(function () { tryLoad(k - 1); }, 1500);
        } else {
          window.__vrmaErr = 'vrmAnimations 为空';
        }
      }).catch(function (e) {
        if (k > 0) { setTimeout(function () { tryLoad(k - 1); }, 1500); }
        else { window.__vrmaErr = 'VRMA 加载失败: ' + e.message; }
      });
    }
    tryLoad(2);
  };

  function ensureIdleAction(c) {
    if (!c.idleAction) {
      c.mixer = new THREE.AnimationMixer(c.vrm.scene);
      const clip = window.THREE_VRM_ANIMATION.createVRMAnimationClip(V.vrmaIdle, c.vrm);
      c.idleAction = c.mixer.clipAction(clip);
      c.idleAction.play();
    }
    if (!V.idleVRMAOn) {
      c.idleAction.reset().play();
    }
  }
  function stopIdleAction(c) {
    if (c.idleAction) { c.idleAction.stop(); c.idleAction = null; }
    if (c.mixer) { c.mixer.stopAllAction(); c.mixer = null; }
  }

  V.init();
      A.poses.push({ pose: V.pose, tick: V.tick });
      return V;
    }
  });

  let gltfLoader = null;
  try {
    gltfLoader = new THREE.GLTFLoader();
    gltfLoader.register(function (parser) { return new THREE_VRM.VRMLoaderPlugin(parser); });
  } catch (e) { console.warn('VRM 支持不可用：', e); }

  let holder = null;

  V.init = function () {
    holder = new THREE.Group();
    holder.visible = false;
    A.player.root.add(holder);
    V.buildPanel();
    V.initVRMA();
    if (gltfLoader) {
      fetch('models/manifest.json?v=' + Date.now()).then(function (r) { return r.json(); }).then(function (list) {
        V.total = list.length;
        /* 按清单顺序依次加载，保证面板顺序稳定 */
        let chain = Promise.resolve();
        list.forEach(function (m) {
          chain = chain.then(function () {
            return V.load('models/' + encodeURIComponent(m.file), m.name).then(function () {
              V.loaded++;
              A.ui.showToast('角色 ' + m.name + ' 已就绪', 1000);
              V.refreshPanel();
            }).catch(function (e) {
              V.failed++;
              console.warn('VRM 加载失败:', m.name, e);
              V.refreshPanel();
            });
          });
        });
      }).catch(function () { /* 无清单则跳过 */ });
    }
  };

  V.load = function (url, name) {
    if (!gltfLoader) return Promise.reject(new Error('VRM 支持不可用'));
    return gltfLoader.loadAsync(url).then(function (gltf) {
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error('不是有效的 VRM 文件');
      THREE_VRM.VRMUtils.rotateVRM0(vrm);
      fitVRM(vrm);
      attachSword(vrm);
      const charNode = new THREE.Group();      // 每个角色一个节点
      charNode.add(vrm.scene);
      charNode.visible = false;
      holder.add(charNode);                    // 挂到玩家根节点下的容器
      V.chars.push({ name: name, holder: charNode, vrm: vrm });
      return vrm;
    });
  };

  /* 给 VRM 挂一把剑（右手骨骼） */
  function attachSword(vrm) {
    const hand = vrm.humanoid.getNormalizedBoneNode('rightHand');
    if (!hand || !hand.isObject3D) return;
    const sword = new THREE.Group();
    function mm(geo, c) {
      const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: c }));
      m.castShadow = true;
      return m;
    }
    sword.add(mm(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), 0x4a3222));
    const guard = mm(new THREE.BoxGeometry(0.13, 0.026, 0.05), 0xf0c75e);
    guard.position.y = -0.075; sword.add(guard);
    const blade = mm(new THREE.BoxGeometry(0.04, 0.52, 0.016), 0xd7e3ee);
    blade.position.y = -0.35; sword.add(blade);
    sword.position.set(0, -0.05, 0.02);
    sword.rotation.x = -Math.PI * 0.5;
    hand.add(sword);
  }

  function fitVRM(vrm) {
    const s = vrm.scene;
    s.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    const box = new THREE.Box3().setFromObject(s);
    const h = Math.max(0.001, box.max.y - box.min.y);
    const k = 1.66 / h;
    s.scale.setScalar(k);
    s.position.y = -box.min.y * k;
  }

  V.setCharacter = function (idx) {
    const rig = A.player.parts.rig;
    if (idx === undefined || idx === null || idx >= V.chars.length || idx < -1) {
      idx = (idx < -1) ? V.chars.length - 1 : -1;
    }
    V.chars.forEach(function (c) { c.holder.visible = false; });
    if (idx < 0) {
      V.active = -1;
      rig.visible = true;
      holder.visible = false;
    } else {
      V.active = idx;
      rig.visible = false;
      holder.visible = true;
      V.chars[idx].holder.visible = true;
    }
    V.refreshPanel();
  };

  /* 程序化人形骨骼动画（与内置小人同一状态机） */
  V.pose = function (anim, t, speedRatio) {
    if (V.active < 0) return;
    /* VRMA 真实待机动作：存在时接管待机状态（异常自动回退程序化） */
    if (anim === 'idle' && V.vrmaIdle) {
      try {
        ensureIdleAction(V.chars[V.active]);
        V.idleVRMAOn = true;
        return;
      } catch (e) {
        console.warn('VRMA 待机失败，回退程序化动作:', e.message);
        V.vrmaIdle = null;
      }
    }
    if (V.idleVRMAOn) {
      /* 离开待机 → 停掉 VRMA，恢复程序化驱动 */
      V.chars.forEach(stopIdleAction);
      V.idleVRMAOn = false;
    }
    const vrm = V.chars[V.active].vrm;
    const H = vrm.humanoid;
    const b = function (n) { const x = H.getNormalizedBoneNode(n); return (x && x.isObject3D) ? x : null; };
    const lua = b('leftUpperArm'), rua = b('rightUpperArm');
    const lul = b('leftUpperLeg'), rul = b('rightUpperLeg');
    const spine = b('spine');
    if (!lua) return;
    const s1 = Math.sin(t * 11), s2 = Math.sin(t * 2.2);
    switch (anim) {
      case 'run':
        lua.rotation.set(-s1 * 0.7 * speedRatio, 0, -1.15);
        if (rua) rua.rotation.set(s1 * 0.7 * speedRatio, 0, 1.15);
        if (lul) lul.rotation.set(s1 * 0.75 * speedRatio, 0, 0);
        if (rul) rul.rotation.set(-s1 * 0.75 * speedRatio, 0, 0);
        if (spine) spine.rotation.set(0.06, 0, 0);
        break;
      case 'idle':
        lua.rotation.set(s2 * 0.04, 0, -1.22);
        if (rua) rua.rotation.set(-s2 * 0.04, 0, 1.22);
        if (lul) lul.rotation.set(0, 0, 0);
        if (rul) rul.rotation.set(0, 0, 0);
        if (spine) spine.rotation.set(s2 * 0.02, 0, 0);
        break;
      case 'jump':
        lua.rotation.set(-0.4, 0, -0.7);
        if (rua) rua.rotation.set(-0.4, 0, 0.7);
        if (lul) lul.rotation.set(0.5, 0, 0);
        if (rul) rul.rotation.set(-0.25, 0, 0);
        break;
      case 'glide':
        lua.rotation.set(-2.6, 0, -0.35);
        if (rua) rua.rotation.set(-2.6, 0, 0.35);
        if (lul) lul.rotation.set(0.08, 0, 0);
        if (rul) rul.rotation.set(0.08, 0, 0);
        if (spine) spine.rotation.set(0.1, 0, 0);
        break;
      case 'swim':
        lua.rotation.set(-1.3 + s1 * 1.1, 0, -0.5);
        if (rua) rua.rotation.set(-1.3 - s1 * 1.1, 0, 0.5);
        if (lul) lul.rotation.set(s1 * 0.35, 0, 0);
        if (rul) rul.rotation.set(-s1 * 0.35, 0, 0);
        break;
      case 'climb':
        lua.rotation.set(-2.5 + s1 * 0.4, 0, -0.3);
        if (rua) rua.rotation.set(-2.5 - s1 * 0.4, 0, 0.3);
        if (lul) lul.rotation.set(0.4 + s1 * 0.3, 0, 0);
        if (rul) rul.rotation.set(0.4 - s1 * 0.3, 0, 0);
        if (spine) spine.rotation.set(0.1, 0, 0);
        break;
      case 'attack1': {
        const k = window.Astra.player.state ? 1 - window.Astra.player.state.attackTimer / 0.32 : 1;
        lua.rotation.set(-0.3, 0, -1.1);
        if (rua) rua.rotation.set(-1.6 + k * 1.4, 0, 0.6 - k * 1.1);
        break;
      }
      case 'attack2': {
        const k2 = window.Astra.player.state ? 1 - window.Astra.player.state.attackTimer / 0.32 : 1;
        if (rua) rua.rotation.set(-2.6 + k2 * 2.1, 0, 0.3);
        if (lua) lua.rotation.set(-0.2, 0, -1.15);
        break;
      }
      case 'land':
        lua.rotation.set(0.3, 0, -0.5);
        if (rua) rua.rotation.set(0.3, 0, 0.5);
        if (lul) lul.rotation.set(-0.35, 0, 0);
        if (rul) rul.rotation.set(-0.35, 0, 0);
        break;
    }
  };
  V.tick = function (dt) {
    if (V.active < 0) return;
    const c = V.chars[V.active];
    if (c.mixer) c.mixer.update(dt);   // VRMA 动作 mixer
    c.vrm.update(dt);
  };

  /* ---------- 角色面板 ---------- */
  V.buildPanel = function () {
    V.listEl = document.getElementById('charList');
    V.refreshPanel();
    const fileInput = document.getElementById('charFile');
    if (fileInput) fileInput.addEventListener('change', function () {
      Array.prototype.forEach.call(fileInput.files, function (f) {
        const url = URL.createObjectURL(f);
        V.load(url, f.name.replace(/\.vrm$/i, '')).then(function () {
          V.setCharacter(V.chars.length - 1);
          A.ui.showToast('已加载角色 ' + f.name, 1800);
        }).catch(function () {
          A.ui.showToast('导入失败：不是有效的 VRM 文件', 2000);
        });
      });
      fileInput.value = '';
    });
  };
  V.refreshPanel = function () {
    if (!V.listEl) return;
    const items = [{ idx: -1, name: '默认小人' }].concat(
      V.chars.map(function (c, i) { return { idx: i, name: c.name }; }));
    V.listEl.innerHTML = '';
    items.forEach(function (it) {
      const btn = document.createElement('button');
      btn.className = 'charBtn' + (V.active === it.idx ? ' active' : '');
      btn.textContent = it.name;
      btn.onclick = function () { V.setCharacter(it.idx); };
      V.listEl.appendChild(btn);
    });
  };

  /* 键盘切换（数字键 1-4，C 循环） */
  document.addEventListener('astra-key', function (e) {
    const code = e.detail;
    if (!A.player || !A.player.root) return;
    if (code === 'KeyC') {
      V.setCharacter(V.active + 1 >= V.chars.length ? -1 : V.active + 1);
    }
    const dm = /^Digit([1-9])$/.exec(code);
    if (dm) V.setCharacter(parseInt(dm[1], 10) - 2);
  });

  A.vrm = V;
})();
