/* =====================================================================
 * Astra 小地图 [L2] —— 预渲染地形底图 + 角色/收集点/祭坛标注
 * 收集点列表从 Astra.shared.poi 读取（由 quest 模块写入）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const MM = {};

  A.define({
    id: 'minimap', layer: 2, deps: ['engine', 'world', 'ui'],
    setup: function () { MM.init(); return MM; },
    update: function (dt, t) { MM.draw(t); }
  });

  MM.init = function () {
    MM.canvas = document.getElementById('minimap');
    MM.ctx = MM.canvas.getContext('2d');
    MM.pre = document.createElement('canvas');
    MM.pre.width = MM.pre.height = 256;
    const g = MM.pre.getContext('2d');
    const N = 128;
    const size = A.world.cfg.terrain.size;
    const hAt = A.world.heightAt;
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const x = (gx / (N - 1) - 0.5) * size;
        const z = (gy / (N - 1) - 0.5) * size;
        const h = hAt(x, z);
        let col;
        if (h < -2) col = '#256d92';
        else if (h < (A.world.seaLevel || 0)) col = '#3f9fbc';
        else if (h < 0.8) col = '#e3d19a';
        else if (h < 19) col = h > 12 ? '#5a9e46' : '#6cc24a';
        else if (h < 25) col = '#8d9298';
        else col = '#eef4f8';
        g.fillStyle = col;
        g.fillRect(gx * 2, gy * 2, 2, 2);
      }
    }
  };

  function w2m(x, z) {
    const size = A.world.cfg.terrain.size;
    return [(x / size + 0.5) * 158, (z / size + 0.5) * 158];
  }

  MM.draw = function (t) {
    const ctx = MM.ctx;
    ctx.clearRect(0, 0, 158, 158);
    ctx.drawImage(MM.pre, 0, 0, 158, 158);
    const ppos = A.shared.playerPos;
    /* 传送锚点（蓝/灰菱形） */
    (A.waypoints ? A.waypoints.points : []).forEach(function (w) {
      const pt = w2m(w.x, w.z);
      ctx.fillStyle = w.active ? '#4fb3ff' : '#8a94a8';
      ctx.save();
      ctx.translate(pt[0], pt[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    });
    (A.shared.poi || []).forEach(function (c) {
      if (c.collected) return;
      const p = w2m(c.mesh.position.x, c.mesh.position.z);
      ctx.fillStyle = '#7feaff';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.2 + Math.sin(t * 3 + c.phase) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
    const altar = A.world.altar;
    if (altar) {
      const ap = w2m(altar.x, altar.z);
      ctx.fillStyle = '#ffb02e';
      ctx.save();
      ctx.translate(ap[0], ap[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
      ctx.restore();
    }
    const pp = w2m(ppos.x, ppos.z);
    ctx.save();
    ctx.translate(pp[0], pp[1]);
    ctx.rotate(Math.PI - A.player.state.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1d6f80';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  A.minimap = MM;
})();
