/* =====================================================================
 * Astra 音效 [L0] —— WebAudio 实时合成（无音频文件）
 * ===================================================================== */
(function () {
  const A = window.Astra;
  const S = { ctx: null, master: null, muted: false };

  A.define({
    id: 'audio', layer: 0, deps: [],
    setup: function () { return S; }
  });

  S.init = function () {
    if (S.ctx) { S.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    S.ctx = new AC();
    S.master = S.ctx.createGain();
    S.master.gain.value = 0.16;
    S.master.connect(S.ctx.destination);
  };
  function beep(freq, dur, type, delay, slide, vol) {
    if (!S.ctx || S.muted) return;
    const t0 = S.ctx.currentTime + (delay || 0);
    const o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    const peak = vol || 1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(S.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  S.collect = function () { beep(660, 0.12, 'sine'); beep(990, 0.2, 'sine', 0.09); };
  S.jump = function () { beep(300, 0.12, 'triangle', 0, 420); };
  S.glide = function () { beep(200, 0.35, 'sawtooth', 0, 90); };
  S.win = function () {
    [523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.3, 'sine', i * 0.13); });
    beep(1568, 0.6, 'sine', 0.55);
  };
  /* 战斗音效 */
  S.swing = function () { beep(520, 0.09, 'sawtooth', 0, 210); };
  S.hit = function () { beep(165, 0.07, 'square'); beep(110, 0.09, 'square', 0.03); };
  S.enemyDie = function () { beep(420, 0.28, 'sawtooth', 0, 70); };
  S.hurt = function () { beep(140, 0.16, 'square', 0, 90); };
  S.heal = function () { beep(523, 0.1, 'sine'); beep(784, 0.14, 'sine', 0.08); };
  /* ---------- 环境音乐（程序化：和弦垫 + 五声琶音，M 键静音） ---------- */
  S.musicOn = false;
  S._musicTimers = [];
  S.startMusic = function () {
    if (!S.ctx || S.musicOn) return;
    S.musicOn = true;
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66]
    ];
    let bar = 0;
    function padChord() {
      if (!S.musicOn || !S.ctx) return;
      const ch = chords[bar % chords.length];
      const t0 = S.ctx.currentTime + 0.05;
      ch.forEach(function (f, i) {
        const o = S.ctx.createOscillator(), g = S.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = i === 0 ? f / 2 : f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.028, t0 + 1.4);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 3.4);
        o.connect(g); g.connect(S.master);
        o.start(t0); o.stop(t0 + 3.5);
      });
      const b = S.ctx.createOscillator(), bg = S.ctx.createGain();
      b.type = 'sine'; b.frequency.value = ch[0] / 4;
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.linearRampToValueAtTime(0.045, t0 + 0.6);
      bg.gain.linearRampToValueAtTime(0.0001, t0 + 3.2);
      b.connect(bg); bg.connect(S.master);
      b.start(t0); b.stop(t0 + 3.3);
      bar++;
    }
    padChord();
    S._musicTimers.push(setInterval(padChord, 3200));
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    S._musicTimers.push(setInterval(function () {
      if (S.muted || Math.random() < 0.45 || !S.ctx) return;
      beep(scale[(Math.random() * scale.length) | 0], 0.6, 'sine', 0, null, 0.02);
    }, 750));
  };
  S.toggleMute = function () {
    S.muted = !S.muted;
    return S.muted;
  };

  A.audio = S;
})();
