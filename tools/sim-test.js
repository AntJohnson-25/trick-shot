// Plays whole Trick Shot HORSE matches between two bots in the pure-logic sim.
//   node tools\sim-test.js [matches] [difficulty 0-2] [human] [players 2-4]
globalThis.SB = {};
require("../Work/src/sim.js");
const SB = globalThis.SB;
const N = +process.argv[2] || 4, diff = process.argv[3] === undefined ? 1 : +process.argv[3];
let ok = true;
const HUMAN = process.argv[4] === "human";   // archer 0 is driven like a player (keys + crosshair) by a small autopilot
function autopilot(sim, ap) {
  const a = sim.archers[0], inp = { yaw: a.yaw, pitch: a.pitch, fire: false, mx: 0, mz: 0, jump: false, spin: 0 };
  if (sim.phase !== "turn" || sim.shooter !== 0) { ap.turn = -1; return inp; }
  if (ap.turn !== sim.turnNo) { ap.turn = sim.turnNo; ap.t = 0; ap.step = 0; ap.T = sim.goalTarget() || sim.targets[(Math.random() * sim.targets.length) | 0]; ap.kind = ["front", "back", "left", "right", "none"][(Math.random() * 5) | 0]; }
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
}
for (let m = 0; m < N; m++) {
  const NP = +process.argv[5] || 2, kinds = [HUMAN ? "local" : "bot"]; while (kinds.length < NP) kinds.push("bot");
  const sim = SB.createSim({ noHuman: !HUMAN, kinds: kinds, difficulty: diff, seed: 1000 + m * 77 });
  const ap = { turn: -1 };
  sim.start();
  const st = { turns: 0, sets: 0, noset: 0, matched: 0, letters: 0, ground: 0, miss: 0, tricks: {}, targets: {} };
  let frames = 0;
  while (sim.phase !== "matchover" && frames < 60 * 3000) {
    sim.step(1 / 60, HUMAN ? autopilot(sim, ap) : null);
    frames++;
    for (const e of sim.takeEvents()) {
      if (e.t === "turn") st.turns++;
      if (e.t === "shot") st.tricks[e.trick] = (st.tricks[e.trick] || 0) + 1;
      if (e.t === "result") { st[{ set: "sets", noset: "noset", matched: "matched", letter: "letters" }[e.kind]]++; if (/ground/.test(e.sub)) st.ground++; if (/Missed everything/.test(e.sub)) st.miss++; }
      if (e.t === "hit" && e.target >= 0) st.targets[e.name] = (st.targets[e.name] || 0) + 1;
    }
  }
  const done = sim.phase === "matchover";
  if (!done) ok = false;
  console.log("match", m, done ? "OVER" : "STUCK", "after", (frames / 60).toFixed(0) + "s", "winner", sim.winner, "letters", sim.archers.map((a) => a.letters).join("-"),
    JSON.stringify({ turns: st.turns, sets: st.sets, noset: st.noset, matched: st.matched, letters: st.letters, ground: st.ground, miss: st.miss }));
  if (m === 0) { console.log("  tricks:", JSON.stringify(st.tricks)); console.log("  hits:", JSON.stringify(st.targets)); }
}
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
