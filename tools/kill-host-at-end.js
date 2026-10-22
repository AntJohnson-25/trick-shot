// For tools/shot.cjs --evalfile on tools/harness.html: the host (frame A) leaves the moment the match ends,
// before its 4.5 s results timer runs out. The new host should still call endGame.
(() => {
  window.__kill = setInterval(() => {
    const f = document.getElementById("fA");
    if (!f) return;
    const w = f.contentWindow;
    if (w.SB && w.SB.Game && w.SB.Game.sim && w.SB.Game.sim.phase === "matchover") {
      clearInterval(window.__kill);
      window.__killedAt = w.SB.Game.S.endT;
      fkLeave("A");
    }
  }, 20);
  return "hooked";
})()
