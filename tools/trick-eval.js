// Eval helpers for headless play-tests of Trick Shot (use with tools/shot.js --evalfile=tools/trick-eval.js).
// The page's own loop is stopped (SB.Game.S.hold) so only P.go() moves time.
//   P.start()                   begin a match, run through the intro, stop the loop
//   P.go(sec, targetName, draw) advance sec seconds, keeping the crosshair on the target (by name) if given
//   P.set({...})                change the synthetic controls (fire, mx, mz, jump, spin, yaw, pitch)
//   P.trick(name, kind)         scripted human turn: draw, jump, flip (kind: front|back|left|right|none), release at the apex
//   P.info()                    one-line state
globalThis.P = {
  sim: function () { return SB.Game.S.sim; },
  set: function (o) { Object.assign(SB.Input.synthetic, o); },
  start: function () {
    SB.Input.synthetic = { yaw: 0, pitch: 0.05, fire: false };
    SB.Game.begin();
  },
  ready: function () { SB.Game.S.hold = true; SB.Game.advance(3.4, 1 / 30, true); return P.info(); },
  aim: function (name) {
    const s = P.sim(), a = s.cur(), T = s.targets.find((t) => t.name === name);
    if (!T) return;
    const c = s.cameraOf(a, {});
    const dx = T.x - c.x, dz = T.z - c.z, h = Math.hypot(dx, dz);
    SB.Input.synthetic.yaw = Math.atan2(-dx, -dz);
    SB.Input.synthetic.pitch = Math.atan2(T.y - c.y, h);
  },
  go: function (sec, name, draw) {
    for (let t = 0; t < sec - 1e-6; t += 1 / 30) {
      if (name) P.aim(name);
      SB.Game.advance(1 / 30, 1 / 30, !(draw && t + 1 / 30 >= sec - 1e-6));
    }
  },
  trick: function (name, kind, spin) {
    const s = P.sim(), a = s.archers[0];
    P.set({ fire: true, mx: 0, mz: 0 });
    P.go(0.7, name);
    P.set({ jump: true });
    P.go(0.12, name);
    // the flip direction is read at the second jump
    P.set({ mz: kind === "front" ? 1 : kind === "back" ? -1 : 0, mx: kind === "right" ? 1 : kind === "left" ? -1 : 0 });
    let guard = 0;
    while (a.vy > 3 && guard++ < 60) P.go(1 / 30, name);
    P.set({ jump: true, spin: spin || 0 });
    P.go(1 / 30, name);
    P.set({ mx: 0, mz: 0 });
    guard = 0;
    while (a.vy > 1.2 && guard++ < 60) P.go(1 / 30, name);
    P.set({ fire: false });
    P.go(0.05, name);
    return P.info();
  },
  info: function () {
    const s = P.sim(), a = s.cur();
    return JSON.stringify({ phase: s.phase, mode: s.mode, shooter: s.shooter, goal: s.goal, y: +a.y.toFixed(2), state: a.state, letters: s.archers.map((x) => x.letters), banner: s.banner && s.banner.text + " " + s.banner.sub });
  }
};
"P ok";
