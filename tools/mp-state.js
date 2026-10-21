// For tools/shot.cjs --evalfile on tools/harness.html: each frame's view of the match, one line each.
(() => [...document.querySelectorAll("iframe")].map((f) => {
  const w = f.contentWindow;
  if (!w.SB || !w.SB.Game || !w.SB.Game.sim) return f.id + ": loading " + ((w.document.getElementById("ld-msg") || {}).textContent || "");
  const s = w.SB.Game.sim;
  return f.id + ": " + s.phase + " turn " + s.turnNo + " " + s.mode + " setter " + s.setter + " shooter " + s.shooter + " goal " + s.goal +
    " | " + s.archers.map((a) => a.id + ":" + a.name + " " + a.kind + " L" + a.letters + (a.out ? " OUT" : "") + " @" + a.x.toFixed(1) + "," + a.y.toFixed(1) + "," + a.z.toFixed(1) + " " + a.state).join(" ; ") +
    (w.__ended ? " ENDED " + JSON.stringify(w.__ended.entries) : "") + (s.winner >= 0 ? " WINNER " + s.winner : "");
}).join("\n"))()
