/* =====================================================================
 * Astra 输入管理 [L0] —— 键盘 / 鼠标视角（指针锁定 + 拖动双模式）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const I = {
    keys: {},
    spaceEdge: false,          // 空格按下沿（每帧由主循环清除）
    attackEdge: false,         // 左键/J 攻击按下沿（每帧由主循环清除）
    pointerLocked: false,
    cam: { yaw: Math.PI, pitch: 0.34, dist: 9, dragging: false, lx: 0, ly: 0 }
  };

  A.define({
    id: 'input', layer: 0, deps: ['engine'],
    setup: function (ctx) {
      I.bindCamera(A.engine.renderer.domElement);
      return I;
    }
  });

  function rotate(dx, dy) {
    I.cam.yaw -= dx * 0.0026;
    I.cam.pitch = Math.min(1.02, Math.max(-0.12, I.cam.pitch + dy * 0.0022));
  }

  I.bindCamera = function (dom) {
    /* 模式一：点击画面 → 指针锁定，移动鼠标自由环视（原神式），Esc 释放 */
    dom.addEventListener('click', function () {
      if (!I.pointerLocked && dom.requestPointerLock) {
        try { dom.requestPointerLock(); } catch (e) { /* 忽略 */ }
      }
    });
    document.addEventListener('pointerlockchange', function () {
      I.pointerLocked = (document.pointerLockElement === dom);
    });
    document.addEventListener('mousemove', function (e) {
      if (I.pointerLocked) rotate(e.movementX || 0, e.movementY || 0);
    });
    /* 模式二（备用）：未锁定时按住左键拖动也能转；原地点击 = 攻击 */
    dom.addEventListener('pointerdown', function (e) {
      if (I.pointerLocked) {
        if (e.button === 0) I.attackEdge = true;   // 锁定模式：左键即攻击
        return;
      }
      if (e.button !== 0) return;
      I.cam.dragging = true; I.cam.lx = e.clientX; I.cam.ly = e.clientY;
      I._dragMoved = 0;
    });
    window.addEventListener('pointermove', function (e) {
      if (!I.cam.dragging || I.pointerLocked) return;
      const dx = e.clientX - I.cam.lx, dy = e.clientY - I.cam.ly;
      I._dragMoved += Math.abs(dx) + Math.abs(dy);
      rotate(dx, dy);
      I.cam.lx = e.clientX; I.cam.ly = e.clientY;
    });
    window.addEventListener('pointerup', function (e) {
      if (I.cam.dragging && !I.pointerLocked && (I._dragMoved || 0) < 6 && e.button === 0) {
        I.attackEdge = true;                       // 原地点击（没有拖动）＝ 攻击
      }
      I.cam.dragging = false;
    });
    dom.addEventListener('wheel', function (e) {
      I.cam.dist = Math.min(18, Math.max(4, I.cam.dist + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  };

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    I.keys[e.code] = true;
    if (e.code === 'Space') { I.spaceEdge = true; e.preventDefault(); }
    if (e.code === 'KeyJ') I.attackEdge = true;    // J 键攻击（备用）
    document.dispatchEvent(new CustomEvent('astra-key', { detail: e.code }));
  });
  window.addEventListener('keyup', function (e) { I.keys[e.code] = false; });

  /* 相机跟随（绕玩家轨道 + 地形防穿） */
  I.follow = function (target, heightAt, dt) {
    const c = I.cam;
    const ty = target.y + 1.6;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const px = target.x + Math.sin(c.yaw) * cp * c.dist;
    const pz = target.z + Math.cos(c.yaw) * cp * c.dist;
    let py = ty + sp * c.dist;
    const minY = Math.max(heightAt(px, pz) + 1.3, 0.9);
    if (py < minY) py = minY;
    const cam = A.engine.camera;
    cam.position.lerp(new THREE.Vector3(px, py, pz), 1 - Math.pow(0.0001, dt));
    cam.lookAt(new THREE.Vector3(target.x, ty, target.z));
  };

  A.input = I;
})();
