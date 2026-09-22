/* =====================================================================
 * Astra JSON 脚本遥控 [L2] —— 一段 JSON 驱动全部键鼠操作
 *
 * 数据流：面板粘贴 JSON → parseValidate 校验 → expand 展开 loop
 *   → 每帧 update 按顺序执行各动作的 runner：
 *     移动/冲刺   直写 A.input.keys（等价按住键盘 WASD/Shift）
 *     跳跃/攻击   置 spaceEdge / attackEdge 按下沿（等价点按空格/左键）
 *     功能键      向 window 派发合成 KeyboardEvent（F 开箱/V 传送/C 换人…）
 *     镜头        平滑插值 A.input.cam.yaw/pitch/dist（等价鼠标转视角/滚轮）
 *
 * 注意：main.js 的 boot 列表里 bot 必须排在 player 之前，
 *       这样 bot 置起的按下沿能在同一帧被 player 消费。
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const RAD = Math.PI / 180;
  const PITCH_MIN = -0.12, PITCH_MAX = 1.02;   // 与 input.js 轨道相机俯仰范围一致
  const DIST_MIN = 4, DIST_MAX = 18;           // 与滚轮缩放范围一致
  const MOVE_KEYS = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD' };
  const DIR_ALIAS = { forward: 'forward', backward: 'backward', left: 'left', right: 'right', fwd: 'forward', back: 'backward' };
  const KNOWN_KEYS = ['KeyF', 'KeyV', 'KeyC', 'KeyM', 'KeyH', 'KeyB', 'Space',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
  const DRAFT_KEY = 'astra.botDraft';

  const B = {
    running: false, paused: false,
    queue: [], idx: 0, runner: null,
    elapsed: 0,
    pendingUps: [],        // 合成按键等待 keyup 的队列 {code, t}
    ui: {}
  };

  /* ---------------- 动作注册表：校验与执行共用 ----------------
   * p: 参数表  t: 'n'数字 / 's'字符串 / 'b'布尔  req: 必填
   * min/max: 数字范围  vals: 枚举  def: 默认值 */
  const TYPES = {
    move:       { desc: '按住某方向移动', p: {
      direction: { t: 's', req: 1, vals: ['forward', 'backward', 'left', 'right'] },
      duration:  { t: 'n', req: 1, min: 0.05, max: 60 },
      sprint:    { t: 'b', def: false } } },
    stop:       { desc: '立刻松开所有移动/冲刺键', p: {} },
    wait:       { desc: '原地等待', p: { duration: { t: 'n', req: 1, min: 0.05, max: 60 } } },
    jump:       { desc: '按一次空格（跳跃/攀爬借力跳）', p: {} },
    glide:      { desc: '展开风之翼（在地面会先跳起再展开）', p: {} },
    glide_stop: { desc: '收起风之翼', p: {} },
    attack:     { desc: '挥剑攻击', p: {
      count:    { t: 'n', def: 1, min: 1, max: 30 },
      interval: { t: 'n', def: 0.55, min: 0.15, max: 10 } } },
    key:        { desc: '按一个键', p: {
      code: { t: 's', req: 1 },
      hold: { t: 'n', def: 0.1, min: 0, max: 2 } } },
    interact:   { desc: '按 F 互动（开宝箱/激活锚点/NPC 对话）', p: {} },
    character:  { desc: '切换角色', p: { index: { t: 'n', req: 1, min: 0, max: 9 } } },
    turn:       { desc: '镜头水平转动（度，正=向右）', p: {
      angle:    { t: 'n', req: 1, min: -1080, max: 1080 },
      duration: { t: 'n', def: 0.6, min: 0, max: 30 } } },
    look:       { desc: '镜头俯仰（度，0=平视，正=俯视）', p: {
      pitch:    { t: 'n', req: 1, min: -6, max: 58 },
      duration: { t: 'n', def: 0.5, min: 0, max: 30 } } },
    zoom:       { desc: '镜头远近（4=最近，18=最远）', p: {
      distance: { t: 'n', req: 1, min: DIST_MIN, max: DIST_MAX },
      duration: { t: 'n', def: 0.5, min: 0, max: 30 } } },
    camera:     { desc: '一次性设定镜头（高级；一般用 turn/look/zoom）', p: {
      yaw:      { t: 'n', min: -3600, max: 3600 },
      pitch:    { t: 'n', min: -6, max: 58 },
      dist:     { t: 'n', min: DIST_MIN, max: DIST_MAX },
      duration: { t: 'n', def: 1, min: 0, max: 30 } } },
    teleport:   { desc: '调试传送（无视地形直接落点）', p: {
      x: { t: 'n', req: 1, min: -320, max: 320 },
      z: { t: 'n', req: 1, min: -320, max: 320 } } },
    set_time:   { desc: '设置世界时刻（24 小时制，12=正午）', p: {
      hour: { t: 'n', req: 1, min: 0, max: 24 } } },
    log:        { desc: '在面板与游戏里显示一条消息', p: { text: { t: 's', req: 1 } } }
  };

  /* ============================ 校验 ============================ */
  function isInt(v) { return typeof v === 'number' && isFinite(v) && v === Math.floor(v); }

  function parseValidate(text) {
    const errors = [], warns = [];
    let script;
    try { script = JSON.parse(text); }
    catch (e) { return { ok: false, errors: ['JSON 语法错误: ' + e.message], warns: warns, script: null }; }
    if (!script || typeof script !== 'object' || Array.isArray(script)) {
      errors.push('顶层必须是一个对象，如 {"version":"1.0","actions":[...]}');
      return { ok: false, errors: errors, warns: warns, script: null };
    }
    if (script.version !== undefined && script.version !== '1.0') warns.push('version 建议写 "1.0"');
    if (!Array.isArray(script.actions)) errors.push('缺少 actions 数组（要执行的动作列表）');
    else if (!script.actions.length) errors.push('actions 不能为空数组');
    if (script.loop !== undefined && (!isInt(script.loop) || script.loop < 1 || script.loop > 99))
      errors.push('loop 必须是 1~99 的整数');

    (script.actions || []).forEach(function (a, i) {
      const tag = '动作 #' + (i + 1);
      if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(tag + ': 必须是对象 {"type":...}'); return; }
      const spec = TYPES[a.type];
      if (!spec) { errors.push(tag + ': 未知 type "' + a.type + '"，可用: ' + Object.keys(TYPES).join('、')); return; }
      Object.keys(a).forEach(function (k) {
        if (k === 'type' || k === 'note') return;
        if (!spec.p[k]) warns.push(tag + ' (' + a.type + '): 多余字段 "' + k + '"（可能是拼写错误）');
      });
      Object.keys(spec.p).forEach(function (k) {
        const sp = spec.p[k], v = a[k];
        if (v === undefined || v === null || v === '') {
          if (sp.req) errors.push(tag + ' (' + a.type + '): 缺少必填参数 "' + k + '"');
          return;
        }
        if (sp.t === 'n') {
          if (typeof v !== 'number' || !isFinite(v)) { errors.push(tag + ' (' + a.type + '): 参数 "' + k + '" 必须是数字'); return; }
          if (sp.min !== undefined && (v < sp.min || v > sp.max))
            errors.push(tag + ' (' + a.type + '): "' + k + '" 应在 ' + sp.min + '~' + sp.max + ' 之间，当前 ' + v);
        } else if (sp.t === 's') {
          if (typeof v !== 'string' || !v.trim()) errors.push(tag + ' (' + a.type + '): 参数 "' + k + '" 必须是非空字符串');
          else if (sp.vals && sp.vals.indexOf(v) < 0) errors.push(tag + ' (' + a.type + '): "' + k + '" 只能是 ' + sp.vals.join(' / '));
        } else if (sp.t === 'b' && typeof v !== 'boolean') {
          errors.push(tag + ' (' + a.type + '): 参数 "' + k + '" 必须是 true/false');
        }
      });
      if (a.type === 'key' && typeof a.code === 'string' && KNOWN_KEYS.indexOf(a.code) < 0)
        warns.push(tag + ' (key): "' + a.code + '" 不在常用键列表（' + KNOWN_KEYS.join(' ') + '），游戏可能没有响应');
    });
    return { ok: errors.length === 0, errors: errors, warns: warns, script: script };
  }

  function expand(script) {
    const out = [];
    const loop = Math.max(1, Math.min(99, script.loop | 0 || 1));
    for (let r = 0; r < loop; r++) (script.actions || []).forEach(function (a) { out.push(a); });
    return out.slice(0, 500);
  }

  /* ============================ 执行器 ============================ */
  function clampN(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function releaseAll() {
    const K = A.input.keys;
    Object.keys(MOVE_KEYS).forEach(function (d) { K[MOVE_KEYS[d]] = false; });
    K.ShiftLeft = false; K.ShiftRight = false;
  }
  function synthKeydown(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code })); }
  function synthKeyup(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); }

  /* 为一个动作创建 runner：start() 启动，tick(dt) 返回 true 表示完成，end() 收尾 */
  function startRunner(a) {
    const I = A.input;
    switch (a.type) {

      case 'move': {
        const code = MOVE_KEYS[DIR_ALIAS[a.direction] || a.direction];
        return {
          t: 0,
          start: function () {
            I.keys[code] = true;
            if (a.sprint) { I.keys.ShiftLeft = true; I.keys.ShiftRight = true; }
          },
          tick: function (dt) { this.t += dt; return this.t >= a.duration; },
          end: function () {
            I.keys[code] = false; I.keys.ShiftLeft = false; I.keys.ShiftRight = false;
          }
        };
      }

      case 'stop':
        return { start: function () { releaseAll(); }, tick: function () { return true; } };

      case 'wait':
        return {
          t: 0,
          start: function () { this.t = 0; },
          tick: function (dt) { this.t += dt; return this.t >= a.duration; }
        };

      case 'jump':
      case 'glide_stop':
        return { start: function () { I.spaceEdge = true; }, tick: function () { return true; } };

      case 'glide': {
        /* 地面 → 先跳，等接近最高点再按一次空格展开翼；空中 → 直接展开 */
        let phase = 0, t = 0;
        return {
          start: function () {
            const S = A.player && A.player.state;
            if (!S) { phase = 9; return; }
            if (S.gliding) phase = 9;
            else if (!S.onGround) { I.spaceEdge = true; phase = 9; }
            else { I.spaceEdge = true; phase = 1; }
          },
          tick: function (dt) {
            if (phase === 9) return true;
            const S = A.player.state;
            t += dt;
            if (phase === 1 && ((!S.onGround && S.vy < 1 && t > 0.25) || t > 1.2)) {
              I.spaceEdge = true;
              phase = 9;
            }
            return phase === 9;
          }
        };
      }

      case 'attack': {
        const count = a.count || 1, interval = Math.max(0.15, a.interval || 0.55);
        let n = 0, t = 0;
        return {
          start: function () { I.attackEdge = true; n = 1; },
          tick: function (dt) {
            if (n >= count) return true;
            t += dt;
            if (t >= interval) { t = 0; I.attackEdge = true; n++; }
            return n >= count;
          }
        };
      }

      case 'key': {
        return {
          start: function () {
            synthKeydown(a.code);
            if (a.hold > 0) B.pendingUps.push({ code: a.code, t: a.hold });
            else synthKeyup(a.code);
          },
          tick: function () { return true; }
        };
      }

      case 'interact':
        return {
          start: function () {
            synthKeydown('KeyF');
            B.pendingUps.push({ code: 'KeyF', t: 0.1 });
          },
          tick: function () { return true; }
        };

      case 'character':
        return {
          start: function () {
            const v = A.vrm;
            if (!v || !v.setCharacter) return;
            if (a.index === 0) { v.setCharacter(-1); botLog('· 切换到内置小人'); }
            else if (a.index - 1 < v.chars.length) { v.setCharacter(a.index - 1); botLog('· 切换到角色 #' + a.index); }
            else botLog('△ 角色 #' + a.index + ' 不存在（当前已导入 ' + v.chars.length + ' 个 VRM），跳过', 'err');
          },
          tick: function () { return true; }
        };

      case 'turn': case 'look': case 'zoom': case 'camera': {
        const defDur = a.type === 'camera' ? 1 : (a.type === 'turn' ? 0.6 : 0.5);
        const dur = a.duration === undefined ? defDur : a.duration;
        let from, to;
        return {
          start: function () {
            from = { yaw: I.cam.yaw, pitch: I.cam.pitch, dist: I.cam.dist };
            to = { yaw: from.yaw, pitch: from.pitch, dist: from.dist };
            if (a.type === 'turn') to.yaw = from.yaw - a.angle * RAD;          // 正角=向右转
            if (a.type === 'look') to.pitch = clampN(a.pitch * RAD, PITCH_MIN, PITCH_MAX);
            if (a.type === 'zoom') to.dist = clampN(a.distance, DIST_MIN, DIST_MAX);
            if (a.type === 'camera') {
              if (a.yaw !== undefined) to.yaw = a.yaw * RAD;
              if (a.pitch !== undefined) to.pitch = clampN(a.pitch * RAD, PITCH_MIN, PITCH_MAX);
              if (a.dist !== undefined) to.dist = clampN(a.dist, DIST_MIN, DIST_MAX);
            }
            if (dur <= 0) { I.cam.yaw = to.yaw; I.cam.pitch = to.pitch; I.cam.dist = to.dist; }
            this.t = 0;
          },
          tick: function (dt) {
            if (dur <= 0) return true;
            this.t += dt;
            const p = Math.min(1, this.t / dur), s = p * p * (3 - 2 * p);      // smoothstep 缓动
            I.cam.yaw = from.yaw + (to.yaw - from.yaw) * s;
            I.cam.pitch = from.pitch + (to.pitch - from.pitch) * s;
            I.cam.dist = from.dist + (to.dist - from.dist) * s;
            return p >= 1;
          }
        };
      }

      case 'teleport':
        return {
          start: function () {
            if (window.__game && window.__game.tp) window.__game.tp(a.x, a.z);
            botLog('· 传送到 (' + a.x + ', ' + a.z + ')');
          },
          tick: function () { return true; }
        };

      case 'set_time':
        return {
          start: function () {
            if (A.sky) A.sky.dayT = (((a.hour - 6) % 24 + 24) % 24) / 24;    // sky: hour=(dayT*24+6)%24
            botLog('· 世界时刻设为 ' + a.hour + ' 点');
          },
          tick: function () { return true; }
        };

      case 'log':
        return {
          start: function () {
            botLog('💬 ' + a.text, 'ok');
            try { A.ui.showToast(String(a.text), 2200); } catch (e) { /* 忽略 */ }
          },
          tick: function () { return true; }
        };
    }
    return { start: function () {}, tick: function () { return true; } };   // 不可达兜底
  }

  /* ============================ 日志与状态 ============================ */
  function fmtT(sec) {
    const m = Math.floor(sec / 60), s = (sec - m * 60).toFixed(1);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function botLog(msg, cls) {
    const el = B.ui.log;
    if (!el) { console.log('[bot] ' + msg); return; }
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = '[' + fmtT(B.elapsed) + '] ' + msg;
    el.appendChild(d);
    while (el.children.length > 80) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  function describe(a) {
    let s = a.type;
    if (a.type === 'move') s = 'move ' + a.direction + (a.sprint ? ' +冲刺' : '') + ' ' + a.duration + 's';
    else if (a.type === 'wait') s = 'wait ' + a.duration + 's';
    else if (a.type === 'turn') s = 'turn ' + a.angle + '° ' + (a.duration === undefined ? 0.6 : a.duration) + 's';
    else if (a.type === 'look') s = 'look ' + a.pitch + '°';
    else if (a.type === 'zoom') s = 'zoom → ' + a.distance;
    else if (a.type === 'camera') s = 'camera set';
    else if (a.type === 'attack') s = 'attack ×' + (a.count || 1);
    else if (a.type === 'key') s = 'key ' + a.code;
    else if (a.type === 'teleport') s = 'teleport (' + a.x + ', ' + a.z + ')';
    else if (a.type === 'set_time') s = 'set_time ' + a.hour + '点';
    else if (a.type === 'character') s = 'character #' + a.index;
    else if (a.type === 'log') s = 'log "' + a.text + '"';
    if (a.note) s += '　— ' + a.note;
    return s;
  }
  function setState(st) {
    B.state = st;
    const el = B.ui.state;
    if (!el) return;
    const map = {
      idle: ['待机', ''], waiting: ['等待游戏开始…', 'run'],
      running: ['执行中 ' + Math.min(B.idx + 1, B.queue.length) + '/' + B.queue.length, 'run'],
      paused: ['已暂停', ''], done: ['✔ 完成', 'done'], stopped: ['已停止', ''], error: ['✘ 校验失败', 'err']
    };
    const m = map[st] || map.idle;
    el.textContent = m[0];
    el.className = m[1];
  }
  function updateProgress() {
    if (!B.ui.bar) return;
    B.ui.bar.style.width = B.queue.length ? (B.idx / B.queue.length * 100).toFixed(1) + '%' : '0%';
    if (B.state === 'running' || B.state === 'paused' || B.state === 'waiting') setState(B.state);
  }

  /* ============================ 主流程 ============================ */
  function finish(completed) {
    releaseAll();
    B.pendingUps.forEach(function (u) { synthKeyup(u.code); });
    B.pendingUps.length = 0;
    B.running = false; B.paused = false; B.runner = null;
    setState(completed ? 'done' : 'stopped');
    updateProgress();
    botLog(completed ? '✔ 脚本执行完成，用时 ' + B.elapsed.toFixed(1) + 's' : '⏹ 已停止执行');
    try { A.ui.showToast(completed ? '✔ JSON 脚本执行完成' : '⏹ 脚本已停止', 2200); } catch (e) { /* 忽略 */ }
  }

  function run(text) {
    const res = parseValidate(text);
    if (!res.ok) {
      setState('error');
      res.errors.forEach(function (m) { botLog('✘ ' + m, 'err'); });
      try { A.ui.showToast('JSON 校验未通过，详见面板日志', 2600); } catch (e) { /* 忽略 */ }
      return false;
    }
    res.warns.forEach(function (m) { botLog('△ ' + m, 'err'); });
    B.queue = expand(res.script);
    B.idx = 0; B.runner = null; B.elapsed = 0;
    B.running = true; B.paused = false;
    B.ui.bar.style.width = '0%';
    setState('running');
    botLog('▶ 开始执行「' + (res.script.name || '未命名脚本') + '」共 ' + B.queue.length + ' 步' +
      (A.state.mode !== 'play' ? '（等待点击「开始冒险」…）' : ''));
    return true;
  }
  function stop() { if (B.running || B.paused) finish(false); }
  function pauseToggle() {
    if (!B.running) return;
    B.paused = !B.paused;
    if (B.paused) { releaseAll(); setState('paused'); botLog('⏸ 已暂停（移动键已松开）'); }
    else { setState('running'); botLog('⏯ 继续执行'); }
  }

  /* ---------------- 每帧驱动 ---------------- */
  B.update = function (dt) {
    /* 合成按键到时补 keyup */
    for (let i = B.pendingUps.length - 1; i >= 0; i--) {
      const u = B.pendingUps[i];
      u.t -= dt;
      if (u.t <= 0) { synthKeyup(u.code); B.pendingUps.splice(i, 1); }
    }

    /* 面板实时信息（节流 0.25s） */
    this._acc = (this._acc || 0) + dt;
    if (this._acc > 0.25 && B.ui.pos) {
      this._acc = 0;
      if (A.state.mode === 'play' && A.player && A.player.root) {
        const p = A.player.root.position, S = A.player.state;
        B.ui.pos.textContent = '📍 ' + p.x.toFixed(1) + ', ' + p.z.toFixed(1) +
          ' · ' + S.anim + ' · 体力 ' + Math.round(S.stamina);
      } else {
        B.ui.pos.textContent = '📍 点击「开始冒险」后可执行';
      }
    }

    if (!B.running || B.paused) return;
    if (A.state.mode !== 'play') { setState('waiting'); return; }

    B.elapsed += dt;
    let guard = 0;
    while (guard++ < 1000) {
      if (!B.runner) {
        if (B.idx >= B.queue.length) { finish(true); return; }
        const act = B.queue[B.idx];
        try {
          B.runner = startRunner(act);
          B.runner.start();
        } catch (e) {
          botLog('⚠ 动作 #' + (B.idx + 1) + ' 执行出错: ' + e.message, 'err');
          B.runner = null; B.idx++;
          updateProgress();
          continue;
        }
        botLog('▶ #' + (B.idx + 1) + ' ' + describe(act));
        if (B.runner.tick(dt)) { endRunner(); continue; }
        break;
      } else {
        if (B.runner.tick(dt)) { endRunner(); continue; }
        break;
      }
    }
  };
  function endRunner() {
    if (B.runner && B.runner.end) { try { B.runner.end(); } catch (e) { /* 忽略 */ } }
    B.runner = null;
    B.idx++;
    updateProgress();
  }

  /* ============================ 示例脚本 ============================ */
  const SAMPLES = {
    basic: {
      title: '基础动作演示',
      json: {
        version: '1.0', name: '基础动作演示',
        actions: [
          { type: 'log', text: '开始演示：先向前走' },
          { type: 'move', direction: 'forward', duration: 1.6, note: '向前走一段' },
          { type: 'turn', angle: 90, duration: 0.8, note: '镜头向右转90度' },
          { type: 'move', direction: 'forward', duration: 2, sprint: true, note: '向前冲刺' },
          { type: 'jump', note: '跳一下' },
          { type: 'wait', duration: 0.8 },
          { type: 'attack', count: 3, note: '连挥三剑' },
          { type: 'camera', yaw: 180, pitch: 20, dist: 10, duration: 1, note: '镜头回到默认' },
          { type: 'log', text: '基础演示结束 ✓' }
        ]
      }
    },
    camera: {
      title: '镜头运镜展示',
      json: {
        version: '1.0', name: '镜头运镜展示',
        actions: [
          { type: 'zoom', distance: 16, duration: 1.5, note: '拉远看全景' },
          { type: 'turn', angle: 360, duration: 5, note: '环绕一整圈' },
          { type: 'look', pitch: 45, duration: 1, note: '俯视大地' },
          { type: 'wait', duration: 1 },
          { type: 'look', pitch: 8, duration: 0.8, note: '回到近平视' },
          { type: 'zoom', distance: 7, duration: 1.2, note: '推近角色' },
          { type: 'log', text: '运镜展示结束 ✓' }
        ]
      }
    },
    glide: {
      title: '跳跃与滑翔',
      json: {
        version: '1.0', name: '跳跃与滑翔',
        actions: [
          { type: 'move', direction: 'forward', duration: 2.5, sprint: true, note: '冲刺助跑' },
          { type: 'jump', note: '起跳' },
          { type: 'wait', duration: 0.4 },
          { type: 'glide', note: '空中展开风之翼' },
          { type: 'wait', duration: 2.5, note: '滑翔一会儿' },
          { type: 'glide_stop', note: '收翼下落' },
          { type: 'wait', duration: 1 },
          { type: 'log', text: '滑翔演示结束 ✓' }
        ]
      }
    }
  };

  /* ============================ 面板 UI ============================ */
  function $(id) { return document.getElementById(id); }
  function onClick(id, fn) {
    const el = $(id);
    el.addEventListener('click', function (e) { fn(e); el.blur(); });
  }

  B.setup = function () {
    B.ui = { panel: $('botPanel'), toggle: $('botToggle'), state: $('botState'),
      ta: $('botJson'), bar: $('botProgressBar'), log: $('botLog'), pos: $('botPos') };

    B.ui.ta.value = localStorage.getItem(DRAFT_KEY) || '';
    B.ui.ta.addEventListener('input', function () {
      localStorage.setItem(DRAFT_KEY, B.ui.ta.value);
    });
    /* 面板内敲键盘不能漏进游戏（否则编辑 JSON 时人物乱跑） */
    ['keydown', 'keyup', 'keypress'].forEach(function (ev) {
      B.ui.panel.addEventListener(ev, function (e) { e.stopPropagation(); });
    });

    onClick('botToggle', function () { B.ui.panel.classList.remove('hidden'); B.ui.toggle.classList.add('hidden'); });
    onClick('botClose', function () { B.ui.panel.classList.add('hidden'); B.ui.toggle.classList.remove('hidden'); });
    onClick('botRun', function () {
      if (B.running && !B.paused) { botLog('△ 已有脚本在执行，先「停止」再运行新脚本', 'err'); return; }
      run(B.ui.ta.value);
    });
    onClick('botPause', pauseToggle);
    onClick('botStop', stop);
    onClick('botCheck', function () {
      const res = parseValidate(B.ui.ta.value);
      res.errors.forEach(function (m) { botLog('✘ ' + m, 'err'); });
      res.warns.forEach(function (m) { botLog('△ ' + m, 'err'); });
      if (res.ok) {
        botLog('✔ 校验通过：' + (res.script.actions || []).length + ' 个动作' +
          (res.script.loop > 1 ? ' × loop ' + res.script.loop : ''), 'ok');
        try { A.ui.showToast('✔ JSON 校验通过', 1600); } catch (e) { /* 忽略 */ }
      } else {
        setState('error');
        try { A.ui.showToast('✘ 校验未通过，详见日志', 2200); } catch (e) { /* 忽略 */ }
      }
    });

    const sel = $('botSample');
    Object.keys(SAMPLES).forEach(function (k) {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = SAMPLES[k].title;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      const key = sel.value;
      if (!key) return;
      B.ui.ta.value = JSON.stringify(SAMPLES[key].json, null, 2);
      localStorage.setItem(DRAFT_KEY, B.ui.ta.value);
      sel.value = '';
      sel.blur();
      botLog('📖 已载入示例「' + SAMPLES[key].title + '」，可修改后执行');
    });

    /* B 开关面板；Shift+B 停止脚本（astra-key 由 input.js 在 keydown 时广播） */
    document.addEventListener('astra-key', function (e) {
      const code = e.detail || e;
      if (code !== 'KeyB') return;
      if (A.input.keys.ShiftLeft || A.input.keys.ShiftRight) { stop(); return; }
      const hidden = B.ui.panel.classList.contains('hidden');
      B.ui.panel.classList.toggle('hidden', !hidden);
      B.ui.toggle.classList.toggle('hidden', hidden);
    });

    setState('idle');
    botLog('🤖 JSON 脚本遥控就绪。粘贴脚本 → 校验 → 执行');
    botLog('📄 不知道怎么写？点「模板文档」，或载入示例改一改');
  };

  A.define({
    id: 'bot', layer: 2, deps: ['input', 'ui', 'audio'],
    setup: function () { B.setup(); return B; },
    update: function (dt) {
      try { B.update(dt); }
      catch (e) { console.error('[bot] 执行异常，已自动停止:', e); stop(); }
    }
  });

  /* 调试/自动化测试钩子 */
  window.__bot = {
    run: function (x) { return run(typeof x === 'string' ? x : JSON.stringify(x)); },
    stop: stop, pause: pauseToggle,
    validate: function (x) { return parseValidate(typeof x === 'string' ? x : JSON.stringify(x)); },
    status: function () {
      return { running: B.running, paused: B.paused, idx: B.idx, total: B.queue.length,
        state: B.state || 'idle', elapsed: +B.elapsed.toFixed(2) };
    },
    samples: SAMPLES
  };
  A.bot = B;
})();
