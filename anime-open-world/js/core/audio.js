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
  function beep(freq, dur, type, delay, slide) {
    if (!S.ctx || S.muted) return;
    const t0 = S.ctx.currentTime + (delay || 0);
    const o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
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
  S.toggleMute = function () {
    S.muted = !S.muted;
    return S.muted;
  };

  A.audio = S;
})();
