// The HUD: the two archers' A-R-R-O-W letters, what the turn is (set a trick / match this one),
// the "match this" pin, the sight with its draw ring, the in-the-air tag, and the banners.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const THREE = globalThis.THREE;
  const $ = (id) => document.getElementById(id);
  const H = {};
  let popT = 0, bigT = 0, lastLetters = "";
  const COLS = () => SB.World.LANE_COL.map((c) => "#" + c.toString(16).padStart(6, "0"));
  const _v = new THREE.Vector3();

  H.init = function () {
    H.el = {};
    ["hud", "plist", "modeTxt", "goalTxt", "timer", "sight", "powerRing",
      "dist", "goalPin", "goalPinTxt", "goalArrow", "airTag", "popup", "big", "sub", "keys", "slowNote"].forEach((id) => { H.el[id] = $(id); });
  };
  H.show = function (on) { H.el.hud.classList.toggle("hidden", !on); };

  function say(big, sub, t, cls) {
    H.el.big.textContent = big; H.el.sub.textContent = sub || "";
    H.el.big.className = cls || "";
    void H.el.big.offsetWidth; H.el.big.classList.add("bounce");
    bigT = t || 1.6;
  }
  H.say = say;
  function popup(text, cls) {
    const p = H.el.popup;
    p.textContent = text; p.className = cls || "";
    void p.offsetWidth; p.classList.add("on");
    popT = 1.6;
  }

  H.start = function (sim) {
    const cols = COLS();
    // One card per archer: colour chip, name (text only: names come from other players), the letters they have.
    H.el.plist.textContent = "";
    H.cards = sim.archers.map(function (a) {
      const card = document.createElement("div"), chip = document.createElement("span"), nm = document.createElement("span"), lt = document.createElement("span");
      card.className = "pcard"; chip.className = "chip"; nm.className = "nm"; lt.className = "letters";
      chip.style.background = cols[a.lane % cols.length];
      nm.textContent = a.name;
      card.appendChild(chip); card.appendChild(nm); card.appendChild(lt);
      H.el.plist.appendChild(card);
      return { card: card, lt: lt };
    });
    lastLetters = "";
    H.el.big.textContent = ""; H.el.sub.textContent = ""; bigT = 0;
  };

  H.event = function (e, sim) {
    const me = sim.humanId, mine = e.id === me || e.shooter === me;
    switch (e.t) {
      case "intro": say("TRICK SHOT", "Jump, flip, shoot. Hit it from the air. Five letters (A-R-R-O-W) and you lose.", 3.2); break;
      case "turn": {
        const sh = sim.archers[e.shooter], you = e.shooter === me;
        if (e.mode === "set") say(you ? "YOUR SET" : sh.name.toUpperCase() + " SETS", you ? "Hit any target while you are in the air" : "Watch the trick, then match it", 1.8);
        else say(you ? "MATCH IT" : sh.name.toUpperCase() + " MATCHES", sim.targets[e.goal].name + ", from the air", 1.8);
        break;
      }
      case "trick": if (e.id === me) popup(e.name, "trick"); break;
      case "hit":
        if (e.id === me && e.label === "M") popup("MISS", "miss");
        else if (e.id === me) popup(e.name, "gold");
        break;
      case "early": popup("keep holding", "miss small"); break;
      case "result": say(e.text, e.sub, 2.7, e.kind === "set" || e.kind === "matched" ? (e.shooter === me ? "good" : "bad") : (e.kind === "letter" && e.shooter !== me ? "good" : "bad")); break;
    }
  };

  function letters(a) {
    const L = SB.CFG.LETTERS;
    let s = "";
    for (let i = 0; i < L.length; i++) s += '<i class="' + (i < a.letters ? "x" : "") + '">' + L.charAt(i) + "</i>";
    return s;
  }

  // The pin for the target to match: over it on screen, or an arrow at the edge pointing to it.
  function pin(sim) {
    const E = H.el, G = sim.goalTarget(), cam = SB.View.camera;
    if (!G || (sim.phase !== "turn" && sim.phase !== "result")) { E.goalPin.classList.remove("on"); return; }
    _v.set(G.x, G.y + G.r + 0.4, G.z);
    const dist = Math.round(cam.position.distanceTo(_v));
    cam.updateMatrixWorld();
    _v.applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > 0;
    _v.applyMatrix4(cam.projectionMatrix);
    let nx = behind ? -_v.x : _v.x, ny = behind ? -_v.y : _v.y;
    const W = innerWidth, Hh = innerHeight;
    let edge = behind || Math.abs(nx) > 0.9 || Math.abs(ny) > 0.82;
    if (edge) {
      const m = Math.max(Math.abs(nx) / 0.9, Math.abs(ny) / 0.82) || 1;
      nx /= m; ny /= m;
      if (behind && Math.abs(nx) < 0.05 && Math.abs(ny) < 0.05) ny = -0.82;
    }
    E.goalPin.style.left = ((nx + 1) / 2 * W) + "px";
    E.goalPin.style.top = ((1 - ny) / 2 * Hh) + "px";
    E.goalPin.classList.add("on");
    E.goalPin.classList.toggle("edge", edge);
    E.goalArrow.style.transform = "rotate(" + (edge ? Math.atan2(-ny, nx) : 0) + "rad)";
    E.goalPinTxt.textContent = G.name + "  ·  " + dist + " m";
  }

  H.update = function (sim, dt) {
    const E = H.el, cur = sim.cur(), h = sim.human();
    const lt = sim.archers.map(letters).join("|");
    if (lt !== lastLetters && H.cards) { lastLetters = lt; sim.archers.forEach(function (a, i) { H.cards[i].lt.innerHTML = letters(a); }); }
    if (H.cards) sim.archers.forEach(function (a, i) {
      H.cards[i].card.classList.toggle("live", sim.phase === "turn" && sim.shooter === i);
      H.cards[i].card.classList.toggle("out", !!a.out);
      H.cards[i].card.classList.toggle("you", i === sim.humanId);
    });
    // what the turn is
    const G = sim.goalTarget();
    E.modeTxt.textContent = sim.phase === "intro" ? "get ready" : sim.mode === "set" ? "set a trick shot" : "match this";
    E.goalTxt.textContent = sim.phase === "intro" ? "" : G ? G.name : (sim.shooter === sim.humanId ? "any target, from the air" : "…");
    if (sim.phase === "turn" && !sim.shot) { const s = Math.max(0, Math.ceil(sim.turnT)); E.timer.textContent = s + "s"; E.timer.classList.toggle("low", s <= 8); }
    else E.timer.textContent = "";
    pin(sim);
    // the sight follows whoever is shooting (a rival's crosshair shows where they aim)
    const drawing = cur.state === "draw" || cur.state === "aim";
    E.sight.classList.toggle("on", drawing || cur.zoom > 0.3);
    E.sight.classList.toggle("full", cur.state === "aim");
    const pw = cur.state === "aim" ? 1 : cur.state === "draw" ? cur.power : 0;
    E.powerRing.style.strokeDashoffset = String((1 - pw) * 157);
    if (drawing || cur.zoom > 0.3) { const ap = sim.aimPoint(cur); E.dist.textContent = ap.dist < 149 ? Math.round(ap.dist) + " m" : ""; } else E.dist.textContent = "";
    // are you in the air? (the shot only counts from the air)
    const mine = h && sim.shooter === h.id && sim.phase === "turn" && !sim.shot;
    E.airTag.classList.toggle("on", !!mine && !h.ground && drawing);
    E.airTag.classList.toggle("ground", !!mine && h.ground && drawing);
    E.airTag.textContent = mine && h.ground ? "JUMP FIRST" : "IN THE AIR";
    popT -= dt; if (popT <= 0) E.popup.classList.remove("on");
    bigT -= dt; if (bigT <= 0) { E.big.textContent = ""; E.sub.textContent = ""; }
    if (SB.View.downgraded) E.slowNote.textContent = "Slow machine: " + SB.View.downgraded;
  };
  SB.Hud = H;
})(globalThis.SB);
