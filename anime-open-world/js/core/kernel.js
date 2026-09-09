/* =====================================================================
 * Astra 内核 —— 模块树 / 拓扑启动 / 事件总线 / 共享状态
 *
 * 架构是一棵树（依赖只允许自上而下，禁止同层/反向依赖）：
 *
 *   L3  game        游戏编排（main.js：选场景、启动、相机收尾）
 *  ──────────────────────────────────────────────
 *   L2  modules     功能模块（player / vrm / sky / minimap / quest / effects）
 *  ──────────────────────────────────────────────
 *   L1  world       场景服务（terrain / props / landmarks / sceneLoader）
 *  ──────────────────────────────────────────────
 *   L0  core        引擎基座（engine / input / ui / audio）
 *
 * 三条规则（kernel.boot 时强制校验）：
 *   1) 模块用 Astra.define 声明 { id, layer, deps }，禁止依赖更高层
 *      （同层依赖允许，启动顺序由拓扑排序保证）
 *   2) 同层模块通信走事件总线 Astra.on/emit，或共享状态 Astra.shared
 *   3) 替换节点 = 相同 id 重新 define（逐层改造，其他层零改动）
 *
 * 生命周期：setup(ctx) 初始化一次 → update(dt,t) 每帧按启动顺序调用
 * ===================================================================== */
window.Astra = {
  VERSION: '0.4.0',

  /* 跨模块共享状态槽（写入方：player；读取方：sky/effects/minimap/follow） */
  shared: {},

  /* 动作提供者钩子：player 每帧调用 pose/tick（VRM 或内置小人注册） */
  poses: [],

  /* 通用更新钩子（轻量插件用） */
  updaters: [],
  onUpdate: function (f) { this.updaters.push(f); },

  /* 全局游戏状态 */
  state: { mode: 'start', elapsed: 0 },

  /* ---------- 事件总线 ---------- */
  _ev: {},
  on: function (ev, fn) {
    (this._ev[ev] = this._ev[ev] || []).push(fn);
  },
  emit: function (ev, data) {
    (this._ev[ev] || []).forEach(function (fn) {
      try { fn(data); } catch (err) { console.error('[事件 ' + ev + '] 处理失败:', err); }
    });
  },

  /* ---------- 模块注册 ---------- */
  _defs: new Map(),
  _inst: {},
  _order: [],
  define: function (def) {
    if (!def || !def.id) throw new Error('Astra.define 缺少 id');
    if (def.layer === undefined) throw new Error('模块 ' + def.id + ' 未声明 layer');
    this._defs.set(def.id, def);
  },
  use: function (id) { return this._inst[id] || null; },

  /* ---------- 启动（按 ids 拓扑排序 + 层级校验 + 依次 setup） ---------- */
  boot: function (ids, ctx) {
    const defs = this._defs;
    const visited = new Set();
    const order = [];
    function visit(id, from) {
      if (visited.has(id)) return;
      if (Astra._inst[id]) { visited.add(id); return; }   // 分阶段启动：已启动的跳过
      const d = defs.get(id);
      if (!d) throw new Error('模块未注册: ' + id + (from ? ('（被 ' + from + ' 依赖）') : ''));
      (d.deps || []).forEach(function (dep) { visit(dep, id); });
      visited.add(id);
      order.push(d);
    }
    ids.forEach(function (id) { visit(id, null); });
    order.forEach(function (d) {
      (d.deps || []).forEach(function (dep) {
        const depLayer = defs.get(dep).layer;
        if (depLayer > d.layer) {
          throw new Error('层级违规: ' + d.id + '(L' + d.layer + ') 依赖了高层模块 ' + dep + '(L' + depLayer + ')');
        }
      });
    });
    order.forEach(function (d) {
      const inst = d.setup ? d.setup(ctx) : {};
      Astra._inst[d.id] = inst || {};
      Astra[d.id] = Astra._inst[d.id];          // 便捷别名 A.<id>
      Astra._order.push(d);
    });
    return order.map(function (d) { return d.id; });
  },

  /* ---------- 每帧按启动顺序调用 update（单模块异常被隔离，不拖垮全局） ---------- */
  tick: function (dt, t) {
    for (let i = 0; i < this._order.length; i++) {
      const d = this._order[i];
      if (!d.update) continue;
      try {
        d.update(dt, t);
      } catch (e) {
        if (!d._err) {
          d._err = true;
          console.error('模块 ' + d.id + ' 异常（已隔离，不影响其他模块）:', e.message);
        }
      }
    }
  }
};

/* 内核命名空间自引用：Astra.kernel.boot / Astra.kernel.tick 与顶层等价 */
window.Astra.kernel = window.Astra;
