// Sound, synthesised and kept light (the user's own music matters more than effects): the
// string's twang, the thump of a hit, pops and cracks for the breakables, a few cues.
// Music: drop files in Work/music/ and list them in Work/music/tracks.js; they loop in order.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const A = { ctx: null, master: null, vol: 0.7, musicVol: 0.5 };
  let noiseBuf = null, musicEl = null, tracks = [], trackI = 0;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === "suspended") A.ctx.resume(); return; }
    const C = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!C) return;
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.vol;
    A.master.connect(A.ctx.destination);
    noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate * 1.2, A.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.loadMusic();
  };
  A.setVolume = function (v) { A.vol = v; if (A.master) A.master.gain.value = v; };
  A.setMusicVolume = function (v) { A.musicVol = v; if (musicEl) musicEl.volume = v; };
  A.loadMusic = function () {
    tracks = SB.TRACKS || [];
    if (!tracks.length || musicEl) return;
    musicEl = new Audio();
    musicEl.volume = A.musicVol;
    musicEl.addEventListener("ended", function () { trackI = (trackI + 1) % tracks.length; musicEl.src = "music/" + tracks[trackI]; musicEl.play().catch(function () {}); });
    musicEl.src = "music/" + tracks[0];
    musicEl.play().catch(function () {});
  };

  function noise(t0, dur, type, f0, f1, vol, q) {
    const c = A.ctx;
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q || 0.9;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 0.8); src.stop(t0 + dur + 0.05);
  }
  function tone(t0, dur, f0, f1, vol, type) {
    const c = A.ctx;
    const o = c.createOscillator(); o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  A.event = function (e, sim) {
    const c = A.ctx;
    if (!c) return;
    const t = c.currentTime, mine = sim && e.id === sim.humanId, v = mine ? 1 : 0.25;
    switch (e.t) {
      case "shot": tone(t, 0.16, 190, 120, 0.22 * v, "triangle"); noise(t, 0.09, "bandpass", 2400, 900, 0.18 * v, 2); break;
      case "hit":
        if (!mine && e.kind !== "balloon") break;
        if (e.kind === "face" || e.kind === "boar") noise(t, 0.12, "lowpass", 900, 200, e.label === "M" ? 0.25 : 0.45);
        else if (e.kind === "balloon") noise(t, 0.07, "highpass", 3000, 1500, mine ? 0.4 : 0.1);
        else if (e.kind === "bottle") { tone(t, 0.18, 2800, 2200, 0.12, "sine"); noise(t, 0.16, "highpass", 4000, 2500, 0.2); }
        else if (e.kind === "apple" || e.kind === "pumpkin") noise(t, 0.16, "lowpass", 1600, 300, 0.4);
        else noise(t, 0.08, "lowpass", 700, 200, 0.15);
        if (e.label === "X" || e.label === "10") [880, 1320].forEach((f, i) => tone(t + 0.12 + i * 0.08, 0.2, f, f, 0.1, "sine"));
        break;
      case "count": tone(t, 0.1, 520, 520, 0.12, "sine"); break;
      case "go": tone(t, 0.32, 784, 784, 0.16, "triangle"); break;
      case "tick": tone(t, 0.05, 1000, 1000, 0.07, "sine"); break;
      case "gasp": if (mine) noise(t, 0.4, "bandpass", 900, 500, 0.12); break;
      case "tally": [523, 659, 784].forEach((f, i) => tone(t + i * 0.1, 0.25, f, f, 0.12, "triangle")); break;
      case "matchover": [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.13, 0.35, f, f, 0.14, "triangle")); break;
    }
  };
  SB.Audio = A;
})(globalThis.SB);
