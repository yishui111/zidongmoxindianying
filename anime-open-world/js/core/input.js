/* =====================================================================
 * Astra 输入管理 [L0] —— 键盘 / 鼠标轨道相机（可重映射的输入层）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const I = {
    keys: {},
    spaceEdge: false,          // 空格按下沿（每帧由主循环清除）
    cam: { yaw: Math.PI, pitch: 0.34, dist: 9, dragging: false, lx: 0, ly: 0 }
  };

  A.define({
    id: 'input', layer: 0, deps: ['engine'],
    setup: function (ctx) {
      I.bindCamera(A.engine.renderer.domElement);
      return I;
    }
  });

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    I.keys[e.code] = true;
    if (e.code === 'Space') { I.spaceEdge = true; e.preventDefault(); }
    document.dispatchEvent(new CustomEvent('astra-key', { detail: e.code }));
  });
  window.addEventListener('keyup', function (e) { I.keys[e.code] = false; });

  I.bindCamera = function (dom) {
    dom.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      I.cam.dragging = true; I.cam.lx = e.clientX; I.cam.ly = e.clientY;
    });
    window.addEventListener('pointermove', function (e) {
      if (!I.cam.dragging) return;
      I.cam.yaw -= (e.clientX - I.cam.lx) * 0.0052;
      I.cam.pitch = Math.min(1.02, Math.max(-0.12, I.cam.pitch + (e.clientY - I.cam.ly) * 0.0045));
      I.cam.lx = e.clientX; I.cam.ly = e.clientY;
    });
    window.addEventListener('pointerup', function () { I.cam.dragging = false; });
    dom.addEventListener('wheel', function (e) {
      I.cam.dist = Math.min(18, Math.max(4, I.cam.dist + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  };

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
