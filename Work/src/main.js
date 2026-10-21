// Trick Shot, HopLobby edition: the lobby's players become the archers (their own avatars). This file builds
// the match, talks over the relay and runs the frame loop. HopLobby runs the lobby, the countdown and the
// results/rematch, so there is no menu or end screen of our own (settings live in HopLobby's Esc menu).
//
// Online model: every screen runs the whole sim. Each screen owns its own archer(s) and streams the pose ~15x a
// second; a shot goes out once, with the numbers to fly it, and every screen flies the same arrow in fixed
// steps. The HOST decides turns and letters (sim.isHost) and tells everyone: `turn`, `res`, `over`.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const NOLOCK = Q.has("nolock");
  const DRIVER = "Aj";                                  // the hidden body that plays the clips on every player's avatar
  const BOT_BODIES = ["Ch06", "Ch46", "Ch36", "Ch14"];
  const SEND_EVERY = 1 / 15;
  const S = { sim: null, mode: "load", paused: false, last: 0, now: 0, hold: false, manual: false, me: -1, players: [], sendT: 0, hi: new Set(), over: false, endT: -1, free: false, lockFails: 0, lastInp: null };
  let HL = null;

  // Lobby options (the host picks them in the lobby; the same list is in hoplobby.json).
  const LOBBY_OPTIONS = [
    { key: "letters", label: "Game length", type: "choice", default: "5", choices: [{ value: "5", label: "Full game: A-R-R-O-W (5 letters)" }, { value: "3", label: "Quick game: B-O-W (3 letters)" }] },
    { key: "air", label: "A shot counts", type: "choice", default: "air", choices: [{ value: "air", label: "Only if released in the air" }, { value: "any", label: "From anywhere (easier)" }] },
    { key: "rival", label: "Computer rival when you play alone", type: "choice", default: "1", choices: [{ value: "0", label: "Easy" }, { value: "1", label: "Normal" }, { value: "2", label: "Hard" }] }
  ];
  const DEFAULTS = { letters: "5", air: "air", rival: "1" };

  function progress(f, msg) {
    $("ld-fill").style.width = Math.round(f * 100) + "%";
    if (msg) $("ld-msg").textContent = msg;
    try { if (HL) HL.progress(f, msg); } catch (e) { /* not ready yet */ }
  }
  const clean = (s) => String(s || "Archer").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 14) || "Archer";
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const hostId = () => ((HL.players || []).find((p) => p.isHost) || {}).id || (HL.context && HL.context.hostId);

  // ------------------------------------------------------------------ boot
  async function boot() {
    if (Q.has("fake")) await import("../../tools/fake-hoplobby.js");
    HL = globalThis.HopLobby;
    if (!HL) throw new Error("The HopLobby SDK did not load");
    progress(0.03, "Connecting…");
    const ctx = await HL.init({ lobbyOptions: LOBBY_OPTIONS, options: DEFAULTS });
    const dev = HL.device || {};
    if ((dev.touch || dev.mobile) && !Q.has("desktop")) {
      document.body.classList.add("touch");
      $("loading").classList.add("hidden");
      HL.ready();
      return;
    }
    const opt = Object.assign({}, DEFAULTS, ctx.options || {});
    SB.CFG.LETTERS = String(opt.letters) === "3" ? "BOW" : "ARROW";
    SB.CFG.NEED_AIR = opt.air !== "any";

    // The archers: the lobby's players (up to four), in a fixed order every screen agrees on; alone, a computer rival.
    const humans = (HL.players || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 4);
    S.players = humans.map((p) => ({ id: p.id, name: clean(p.name), bot: false, body: DRIVER, you: p.id === ctx.playerId }));
    if (S.players.length < 2) {
      const R = SB.ROSTER || [];
      const bi = hash(ctx.lobbyCode || "x") % BOT_BODIES.length, id = BOT_BODIES[bi], r = R.find((x) => x.id === id);
      S.players.push({ id: "bot", name: r ? r.name : "Rival", bot: true, body: id, you: false });
    }
    S.me = S.players.findIndex((p) => p.you);
    if (S.me < 0) throw new Error("You are not in this lobby's player list");

    progress(0.08, "Loading archers…");
    const ids = Array.from(new Set(S.players.map((p) => p.body)));
    await SB.Body.load(ids, (d, n) => progress(0.08 + 0.4 * d / n, "Loading archers " + d + "/" + n + "…"));

    progress(0.5, "Building the arena…");
    const sim = SB.createSim({ net: true, host: !!HL.isHost, kinds: S.players.map((p, i) => (p.bot ? "bot" : i === S.me ? "local" : "remote")), local: S.me, difficulty: Math.max(0, Math.min(2, +opt.rival || 1)), seed: hash(ctx.lobbyCode || "x") });
    S.sim = sim;
    sim.archers.forEach((a, i) => { a.body = S.players[i].body; a.name = S.players[i].name; });
    sim.introHold = S.players.some((p, i) => !p.bot && i !== S.me);   // the host waits for everyone's "hi"
    SB.View.init($("c"), HL.graphics ? HL.graphics.antialias : undefined);
    SB.View.applyGraphics(HL.graphics);
    SB.View.menuMode = false;
    SB.View.startMatch(sim);
    SB.View.newStage(sim);
    SB.Hud.init();
    SB.Hud.start(sim);

    // Each human plays as their own HopLobby avatar. One that fails to load keeps the stand-in body.
    progress(0.6, "Loading avatars…");
    const timeout = () => new Promise((res) => setTimeout(() => res(null), 9000));
    const models = S.players.map((p) => (p.bot ? null : Promise.race([HL.avatar(p.id, { format: "glb" }), timeout()]).catch((e) => { console.warn("avatar", p.name, e); return null; })));
    await Promise.all(S.players.map(async function (p, i) {
      // A computer rival wears the HopLobby look too: the player's own model, dressed in other colours.
      const buf = await (p.bot ? models[S.me] : models[i]);
      if (!buf) return;
      try { await SB.Body.useAvatar(SB.View.chars[i], buf, p.bot ? { hue: 0.55 } : null); } catch (e) { console.warn("avatar", p.name, e); }
      progress(0.6 + 0.35 / S.players.length);
    }));

    wire(ctx);
    SB.Input.init($("c"), onLock);
    SB.Input.wantLock = !NOLOCK;
    SB.Input.onFail = onLockFail;
    applySettings();
    SB.Hud.show(true);
    S.mode = "play";
    sim.start();
    $("loading").classList.add("hidden");
    HL.ready();
    if (!HL.isHost) { send({ k: "hi" }); HL.requestState(); }
    else if (!sim.introHold) { /* alone: nothing to wait for */ }
    else setTimeout(function () { sim.introHold = false; }, 12000);    // never wait for a player who is not coming
    if (Q.has("auto")) await new Promise(function (res) { const s = document.createElement("script"); s.src = "../tools/auto.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    if (!NOLOCK && !Q.has("auto")) showClick("Click to aim", "Esc gives the mouse back (HopLobby's menu)");
    $("needClick").addEventListener("click", function () { SB.Audio.init(); SB.Input.lock(); });
    addEventListener("pointerdown", function () { SB.Audio.init(); }, { once: true });
    requestAnimationFrame(loop);
    setInterval(function () { if (document.hidden && S.mode !== "load") { const t = performance.now(); frame(Math.min(0.1, (t - S.last) / 1000 || 0.1)); S.last = t; } }, 100);
  }

  // ------------------------------------------------------------------ HopLobby: settings, graphics, players
  function wire(ctx) {
    HL.menu.set({
      controls: [{ title: "Trick Shot", keys: [
        { keys: ["W", "A", "S", "D"], action: "Move" },
        { keys: ["Mouse"], action: "Aim" },
        { keys: ["Space"], action: "Jump (again in the air: a flip)" },
        { keys: ["W"], action: "Flip forward (hold with the second jump)" },
        { keys: ["S"], action: "Flip back" },
        { keys: ["A", "D"], action: "Flip to the side" },
        { keys: ["Q", "E"], action: "Add a twist" },
        { keys: ["Click"], action: "Tap: draw and shoot. Hold and let go to time it" }
      ] }],
      controlsNote: "Your shot only counts if you are in the air when the arrow leaves the bow."
    }).catch(function (e) { console.warn("menu", e); });
    HL.on("message", onMessage);
    HL.on("graphics", function (g) { SB.View.applyGraphics(g); });
    HL.on("settings", applySettings);
    HL.on("pause", function () { S.paused = true; if (document.pointerLockElement) document.exitPointerLock(); });
    HL.on("resume", function () { S.paused = false; if (!SB.Input.locked && !SB.Input.free && !NOLOCK) showClick("Click to aim", ""); });
    HL.on("players", reconcile);
    HL.on("leave", reconcile);
    HL.on("host", function (h) { if (S.sim) { S.sim.isHost = h === ctx.playerId; reconcile(); } });
    HL.on("state", function (st) {
      // A late or reloaded screen: pick up the turn the host is on.
      const sim = S.sim;
      if (!sim || !st || typeof st !== "object") return;
      if (st.snap && st.phase === "turn" && sim.applyTurn(st.snap) && typeof st.turnT === "number") sim.turnT = st.turnT;
      if (st.snap && st.phase === "matchover") sim.applyOver(st.snap.winner);
      sim.introHold = false;
    });
    HL.syncState(function () { const sim = S.sim; return sim ? { snap: sim.snap(), phase: sim.phase, turnT: sim.turnT } : undefined; });
  }
  function applySettings() {
    const st = HL.settings || {};
    SB.Input.sens = typeof st.sensitivity === "number" ? st.sensitivity : 1;
    SB.Input.invertY = !!st.invertY;
    const au = st.audio || { master: 1, sfx: 1, muted: false };
    SB.Audio.setVolume(au.muted ? 0 : Math.min(1, (au.master === undefined ? 1 : au.master) * (au.sfx === undefined ? 1 : au.sfx)));
  }
  // Someone is no longer in the lobby: they are out of the game (the host also ends their turn if it was theirs).
  function reconcile() {
    const sim = S.sim;
    if (!sim) return;
    const here = new Set((HL.players || []).map((p) => p.id));
    S.players.forEach(function (p, i) {
      if (p.bot || i === S.me || here.has(p.id)) return;
      const a = sim.archers[i];
      if (a.left) return;
      a.left = true;
      S.hi.delete(p.id);
      sim.drop(i);
    });
    checkHi();
  }
  function checkHi() {
    const sim = S.sim;
    if (!sim || !sim.isHost) return;
    const here = new Set((HL.players || []).map((p) => p.id));
    const waiting = S.players.some((p, i) => !p.bot && i !== S.me && here.has(p.id) && !S.hi.has(p.id));
    if (!waiting) sim.introHold = false;
  }

  // ------------------------------------------------------------------ the relay
  const r2 = (v) => Math.round(v * 1000) / 1000;
  function send(m) { try { HL.send(m); } catch (e) { /* relay closed: the SDK reports it */ } }
  const ownerOf = (i) => (S.players[i] && !S.players[i].bot ? S.players[i].id : null);
  function onMessage(m, from) {
    const sim = S.sim;
    if (!sim || !m || typeof m !== "object") return;
    switch (m.k) {
      case "p": {                                   // an archer's pose, from the screen that owns them
        const i = m.i | 0;
        if (i === S.me || ownerOf(i) !== from) return;
        sim.setRemote(i, m);
        break;
      }
      case "shot": {
        const i = m.i | 0;
        if (i === S.me || ownerOf(i) !== from) return;
        const ok = ["x", "y", "z", "vx", "vy", "vz"].every((k) => typeof m[k] === "number" && isFinite(m[k]));
        // (the relay is unchecked: a shot must start inside the arena and not be faster than a bow can send it)
        if (ok && Math.hypot(m.vx, m.vy, m.vz) < 80 && Math.hypot(m.x, m.z) < 40 && m.y >= 0 && m.y < 30) sim.fireRemote(i, m);
        break;
      }
      case "turn": if (from === hostId() && !sim.isHost) sim.applyTurn(m.snap); break;
      case "res": if (from === hostId() && !sim.isHost) sim.applyResult(m); break;
      case "over": if (from === hostId() && !sim.isHost) sim.applyOver(m.w); break;
      case "hi": S.hi.add(from); checkHi(); break;
    }
  }
  function netEvents(events) {
    const sim = S.sim;
    for (const e of events) {
      if (e.t === "shot" && !e.remote) {
        send({ k: "shot", i: e.id, turn: e.turn, x: r2(e.x), y: r2(e.y), z: r2(e.z), vx: r2(e.vx), vy: r2(e.vy), vz: r2(e.vz), air: e.air ? 1 : 0, trick: e.trick, inv: e.inv ? 1 : 0 });
      } else if (sim.isHost && e.t === "turn") send({ k: "turn", snap: e.snap });
      else if (sim.isHost && e.t === "result") send({ k: "res", turnNo: e.snap.turnNo, kind: e.kind, text: e.text, sub: e.sub, over: e.over ? 1 : 0, shooter: e.shooter, snap: e.snap });
      else if (sim.isHost && e.t === "matchover") { send({ k: "over", w: e.winner }); S.endT = 4.5; }
    }
  }
  function sendPoses(dt) {
    S.sendT += dt;
    if (S.sendT < SEND_EVERY) return;
    S.sendT = 0;
    S.sim.archers.forEach(function (a) {
      if (a.kind === "remote" || a.left) return;
      const p = S.sim.poseOf(a); p.k = "p"; p.i = a.id;
      send(p);
    });
  }
  function endGame() {
    const sim = S.sim, L = SB.CFG.LETTERS.length;
    let place = 0;
    const entries = [];
    sim.standings().forEach(function (a) {
      const p = S.players[a.id];
      if (p.bot || a.left) return;
      place++;
      entries.push({ playerId: p.id, place: place, score: Math.max(0, L - a.letters), label: a.id === sim.winner ? "Winner" : a.letters ? SB.CFG.LETTERS.slice(0, a.letters) : "No letters" });
    });
    try { HL.endGame({ title: "Trick Shot", entries: entries }); } catch (e) { console.warn("endGame", e); }
  }

  // ------------------------------------------------------------------ events
  function onEvents(sim) {
    const events = sim.takeEvents();
    netEvents(events);
    for (const e of events) {
      if (e.t === "turn") {
        SB.Input.jumpQ = false; SB.Input.spinQ = 0;
        if (e.shooter === sim.humanId) { const a = sim.archers[e.shooter]; SB.Input.yaw = a.yaw; SB.Input.pitch = a.pitch; }
      }
      if (e.t === "matchover") finish(sim);
      SB.Fx.event(e);
      SB.View.event(sim, e);
      SB.Audio.event(e, sim);
      SB.Hud.event(e, sim);
    }
  }
  function finish(sim) {
    S.mode = "over";
    if (document.pointerLockElement) document.exitPointerLock();
    const w = sim.archers[sim.winner];
    SB.Hud.say(w ? (w.id === sim.humanId ? "YOU WIN!" : w.name.toUpperCase() + " WINS") : "GAME OVER", "HopLobby shows the results next", 60, w && w.id === sim.humanId ? "good" : "bad");
  }

  // ------------------------------------------------------------------ pointer lock
  function showClick(title, sub) {
    $("ncTitle").textContent = title; $("ncSub").textContent = sub || "";
    $("needClick").classList.remove("hidden");
  }
  function onLock(locked) {
    if (locked) { $("needClick").classList.add("hidden"); return; }
    if (S.mode === "play" && !S.paused && !SB.Input.free) showClick("Click to aim", "Esc gives the mouse back (HopLobby's menu)");
  }
  function onLockFail() {
    // A frame that will not give out pointer lock: fall back to the plain mouse.
    if (++S.lockFails >= 2) { SB.Input.free = true; $("needClick").classList.add("hidden"); }
    else if (S.mode === "play") showClick("Click to aim", "");
  }

  // ------------------------------------------------------------------ the frame
  function localInput(sim) {
    const I = SB.Input, a = sim.human();
    if (SB.autopilot && !S.paused) return SB.autopilot(sim);
    const ready = (I.locked || I.free || NOLOCK) && !S.paused;
    if (ready) return (S.lastInp = I.sample());
    // No mouse right now (paused, or lock lost): stand still, and keep a drawn bow drawn.
    return { yaw: I.yaw, pitch: I.pitch, fire: !!a && (a.state === "draw" || a.state === "aim"), mx: 0, mz: 0, jump: false, spin: 0 };
  }
  function frame(dt, noDraw) {
    S.now += dt;
    const sim = S.sim;
    if (!sim || S.mode === "load") return;
    let left = dt;
    while (left > 1e-6) { const h = Math.min(0.05, left); left -= h; sim.step(h, sim.humanId >= 0 ? localInput(sim) : null); onEvents(sim); }
    if (S.mode === "play" || S.mode === "over") sendPoses(dt);
    // Until the host starts the first turn, keep saying hello (the host may have been slower to load than we were).
    if (!sim.isHost && sim.turnNo === 0 && (S.helloT = (S.helloT || 0) + dt) > 1.5) { S.helloT = 0; send({ k: "hi" }); HL.requestState(); }
    // A message from the host that never came (a turn start, a result, the end): ask where it has got to.
    if (!sim.isHost && ((sim.phase === "result" && sim.phaseT < -4) || (sim.phase === "turn" && sim.turnT < -12) || (sim.phase === "turn" && sim.winner >= 0)) && (S.askT = (S.askT || 0) + dt) > 3) { S.askT = 0; HL.requestState(); }
    SB.View.update(sim, dt, S.now);
    SB.Hud.update(sim, dt);
    if (!noDraw) SB.View.render();
    if (S.endT > 0) { S.endT -= dt; if (S.endT <= 0) { S.endT = -1; endGame(); } }
  }
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - S.last) / 1000 || 0.016);
    S.last = t;
    if (S.hold || S.manual || document.hidden) return;
    frame(dt);
  }

  // Test hooks (headless Edge / tools/harness.html drive these).
  SB.Game = {
    S: S,
    get sim() { return S.sim; },
    step: function (n, dt, noDraw) { S.manual = true; for (let i = 0; i < n; i++) frame(dt || 1 / 20, noDraw || i < n - 1); },
    advance: function (sec, step, noDraw) { step = step || 1 / 60; for (let t = 0; t < sec; t += step) frame(step, noDraw || t + step < sec); }
  };

  function start() {
    boot().catch(function (e) {
      console.error(e);
      const m = $("ld-msg"); if (m) m.textContent = "Could not start: " + (e && e.message || e);
      try { if (HL) HL.reportError(e, "boot"); } catch (x) { /* nothing more to do */ }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(globalThis.SB);
