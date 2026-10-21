// TEST ONLY (tools/, not shipped). Loaded by main.js with ?auto=1: drives this screen's archer like a player with a
// perfect crosshair (the autopilot from sim-test.js), so a harness of several frames can play a whole match.
(function (SB) {
  const ap = { turn: -1 };
  SB.autopilot = function (sim) {
    const a = sim.human(), inp = { yaw: a.yaw, pitch: a.pitch, fire: false, mx: 0, mz: 0, jump: false, spin: 0 };
    if (sim.phase !== "turn" || sim.shooter !== a.id || sim.shot) { ap.turn = -1; return inp; }
    if (ap.turn !== sim.turnNo) {
      ap.turn = sim.turnNo; ap.t = 0; ap.step = 0;
      ap.T = sim.goalTarget() || sim.targets[(Math.random() * sim.targets.length) | 0];
      ap.kind = ["front", "back", "left", "right", "none"][(Math.random() * 5) | 0];
    }
    ap.t += 1 / 60;
    const c = sim.cameraOf(a, {}), T = ap.T, dx = T.x - c.x, dz = T.z - c.z;
    inp.yaw = Math.atan2(-dx, -dz); inp.pitch = Math.atan2(T.y - c.y, Math.hypot(dx, dz));
    if (ap.t < 0.2) return inp;
    inp.fire = true;
    if (ap.step === 0 && a.state === "aim") { inp.jump = true; ap.step = 1; }
    else if (ap.step === 1 && !a.ground && a.vy < 3) { inp.jump = true; inp.mz = ap.kind === "front" ? 1 : ap.kind === "back" ? -1 : 0; inp.mx = ap.kind === "right" ? 1 : ap.kind === "left" ? -1 : 0; ap.step = 2; }
    else if (ap.step === 2 && a.vy < 1.2) { inp.fire = false; ap.step = 3; }
    else if (ap.step === 3) inp.fire = false;
    return inp;
  };
})(globalThis.SB);
