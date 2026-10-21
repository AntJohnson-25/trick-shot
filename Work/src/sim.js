// Bow Bullseye: Trick Shot HORSE, as pure logic (no three.js, no DOM), so node can play it
// (tools/sim-test.js). Two archers share one open arena full of targets. The setter runs, jumps
// (a second jump in the air is a flip or a twist) and has to stick an arrow in a target while
// airborne; the other archer must hit that same target from the air. Miss the match and you earn
// a letter of A-R-R-O-W; five letters and you lose.
//
// World: x east, y up, z south (so north / "forward at yaw 0" is -z). Yaw 0 looks along -z;
// positive yaw turns left. An archer's (x, y, z) is the point between their feet.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const CFG = {
    G: 9.81,              // arrows
    SPEED: 62,            // arrow speed at full draw, m/s
    GRAV: 24,             // archers (snappy, so a flip fits in the air)
    RUN: 5.6, RUN_AIM: 3.4,
    JUMP: 8.7, JUMP2: 8.2,
    ARENA_R: 32, RADIUS: 0.32,
    GRIP_FWD: 0.55, GRIP_Y: 1.45,
    DRAW_T: 1.0333,       // the draw clip: reach to the quiver, nock, pull to anchor
    NOCK_T: 0.5667,       // ...when the arrow is on the string (before this a release cancels)
    RECOIL_T: 0.7,
    DRAW_RATE: 2.2, RECOIL_RATE: 1.8,   // the clips play faster so a draw fits into a jump
    FLIP_T: 0.72, SPIN_T: 0.55,
    YAW_MAX: Infinity, PITCH_MIN: -0.75, PITCH_MAX: 0.95,
    LETTERS: "ARROW",
    INTRO_T: 3, RESULT_T: 2.9, TURN_T: 40,
    NEED_AIR: true        // a set shot and a match shot must both be released in the air
  };
  SB.CFG = CFG;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ------------------------------------------------------------------ the arena
  // Boxes are solid (you can stand on their tops, arrows stop in them); targets never move.
  function makeArena() {
    const boxes = [], targets = [], props = [];
    function box(x, z, w, d, h, kind) { boxes.push({ x: x, z: z, w: w, d: d, h: h, kind: kind, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); }
    box(0, -15, 9, 0.7, 2.5, "wall");
    box(-9, -4, 2.4, 2.4, 0.9, "step"); box(-11.8, -4, 2.4, 2.4, 1.7, "step"); box(-14.6, -4, 2.4, 2.4, 2.5, "step");
    box(8, -3, 2, 2, 1.2, "crate"); box(10.5, -4, 2, 2, 2.2, "crate");
    box(24, 10, 2.2, 2.2, 5.0, "tower");
    box(-22, -12, 6, 4, 1.7, "deck");
    box(-3.5, 16, 1.6, 1.6, 1.0, "crate"); box(-6.5, 16, 3, 3, 2.6, "lookout");
    function face(name, x, y, z, r, diff, nx, nz, extra) {
      let ax = nx, az = nz;
      if (ax === undefined) { const l = Math.hypot(x, z) || 1; ax = -x / l; az = -z / l; }
      targets.push(Object.assign({ id: targets.length, k: "face", name: name, x: x, y: y, z: z, r: r, hr: r, diff: diff, nx: ax, nz: az, boss: r * 1.25, broken: false }, extra || {}));
    }
    function ball(k, name, x, y, z, r, diff, extra) {
      targets.push(Object.assign({ id: targets.length, k: k, name: name, x: x, y: y, z: z, r: r, hr: r * 1.25, diff: diff, broken: false }, extra || {}));
    }
    face("Behind the Wall", 0, 1.3, -30, 0.5, 3, 0, 1);
    face("Big Bullseye", -34, 1.7, 4, 0.65, 1);
    face("Far Eye", 30, 3.2, -30, 0.3, 5);
    ball("apple", "Apple Post", 14, 1.3, 8, 0.065, 3);
    ball("pumpkin", "Pumpkin Tower", 24, 5.21, 10, 0.25, 3, { sits: true });
    ball("balloon", "Red Balloon", -16, 7, 14, 0.32, 2, { col: 0 });
    ball("balloon", "Blue Balloon", -24, 10, 22, 0.3, 3, { col: 1 });
    ball("balloon", "Gold Balloon", -6, 12, 26, 0.28, 4, { gold: true });
    [6, 8, 10, 12].forEach(function (x, i) { ball("bottle", "Bottle " + (i + 1), x, 1.25, 28, 0.05, 3, { h: 0.28, sy: 0.5 }); });
    ball("apple", "Back Apple", -2, 1.3, 22, 0.065, 3);
    // scarecrows holding a target on their chest (the face is the target; the body is scenery)
    face("Scarecrow Sam", 18, 1.55, -12, 0.4, 2, undefined, undefined, { scare: true, base: 0, hat: 0 });
    face("Scarecrow Pete", -18, 1.55, 20, 0.4, 2, undefined, undefined, { scare: true, base: 0, hat: 1 });
    face("Farmer Fred", 14, 1.6, -24, 0.34, 3, undefined, undefined, { scare: true, base: 0, hat: 2 });
    face("Old Hank", -26, 1.6, -20, 0.3, 4, undefined, undefined, { scare: true, base: 0, hat: 0 });
    face("Deck Scarecrow", -24.2, 3.3, -10.8, 0.36, 3, undefined, undefined, { scare: true, base: 1.7, hat: 1 });
    ball("pumpkin", "Deck Pumpkin", -22, 1.91, -12, 0.25, 2, { sits: true });
    props.push({ k: "fence", x0: 4.6, x1: 13.4, z: 28, y: 1.08 });
    return { boxes: boxes, targets: targets, props: props, spawn: [{ x: -3, z: 8 }, { x: 3, z: 8 }, { x: -8, z: 10 }, { x: 8, z: 10 }] };
  }

  // ------------------------------------------------------------------ geometry
  function dirOf(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
    return out;
  }
  // Launch angles from o so a full-speed arrow (no wind) lands on p: aim straight, then lift for the drop.
  function solveLaunch(ox, oy, oz, px, py, pz) {
    const h = Math.hypot(px - ox, pz - oz), dy = py - oy, v = CFG.SPEED, g = CFG.G;
    const v2 = v * v, disc = v2 * v2 - g * (g * h * h + 2 * dy * v2);
    const pitch = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * Math.max(h, 0.01))) : Math.atan2(dy, h) + 0.2;
    return { yaw: Math.atan2(-(px - ox), -(pz - oz)), pitch: pitch, t: h / (v * Math.cos(pitch)) };
  }
  // Segment p->q against a sphere (sy < 1 stretches it up): fraction along the segment, or -1.
  function segSphere(px, py, pz, qx, qy, qz, cx, cy, cz, r, sy) {
    sy = sy || 1;
    const ox = px - cx, oy = (py - cy) * sy, oz = pz - cz, dx = qx - px, dy = (qy - py) * sy, dz = qz - pz;
    const A = dx * dx + dy * dy + dz * dz, B = 2 * (ox * dx + oy * dy + oz * dz), C = ox * ox + oy * oy + oz * oz - r * r;
    if (A < 1e-12) return -1;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return -1;
    const u = (-B - Math.sqrt(disc)) / (2 * A);
    return u >= 0 && u <= 1 ? u : -1;
  }
  // Segment against a box: fraction where it enters, -1 for no hit, -2 if the start is already inside.
  function segBox(px, py, pz, qx, qy, qz, b) {
    let t0 = 0, t1 = 1;
    const d = [qx - px, qy - py, qz - pz], p = [px, py, pz], lo = [b.x0, 0, b.z0], hi = [b.x1, b.h, b.z1];
    let inside = true;
    for (let i = 0; i < 3; i++) {
      if (p[i] < lo[i] || p[i] > hi[i]) inside = false;
      if (Math.abs(d[i]) < 1e-9) { if (p[i] < lo[i] || p[i] > hi[i]) return -1; continue; }
      let a = (lo[i] - p[i]) / d[i], c = (hi[i] - p[i]) / d[i];
      if (a > c) { const t = a; a = c; c = t; }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) return -1;
    }
    return inside ? -2 : t0;
  }
  // Segment against a target face (a disc standing on its normal): { u, r, boss } if it crosses the front side.
  function segFace(px, py, pz, qx, qy, qz, f) {
    const s0 = (px - f.x) * f.nx + (pz - f.z) * f.nz, s1 = (qx - f.x) * f.nx + (qz - f.z) * f.nz;
    if (!(s0 > 0 && s1 <= 0)) return null;
    const u = s0 / (s0 - s1), hx = px + (qx - px) * u, hy = py + (qy - py) * u, hz = pz + (qz - pz) * u;
    const du = (hx - f.x) * f.nz + (hz - f.z) * -f.nx, dv = hy - f.y;
    return { u: u, r: Math.hypot(du, dv), boss: Math.abs(du) < f.boss && Math.abs(dv) < f.boss };
  }

  // Bots: aim error (radians, 1 sigma), the hardest target they will set, how long they settle.
  const SKILL = [
    { err: 0.011, maxDiff: 2.4, settle: 0.5 },
    { err: 0.0065, maxDiff: 3.6, settle: 0.35 },
    { err: 0.0042, maxDiff: 5, settle: 0.2 }
  ];
  const ARROW_H = 1 / 240;
  const TRICKS = ["jump", "front", "back", "left", "right", "twist", "flipspin"];

  // ------------------------------------------------------------------ the sim
  SB.createSim = function (opts) {
    opts = opts || {};
    const arena = makeArena();
    const S = {
      cfg: CFG, boxes: arena.boxes, targets: arena.targets, props: arena.props, archers: [], arrows: [],
      phase: "menu", phaseT: 0, t: 0, events: [], humanId: opts.noHuman ? -1 : (opts.local === undefined ? 0 : opts.local),
      difficulty: opts.difficulty === undefined ? 1 : opts.difficulty, winner: -1,
      seed: opts.seed || (Math.random() * 1e9) | 0, nextArrow: 1,
      mode: "set", setter: 0, shooter: 0, goal: -1, goalTrick: "", turnNo: 0, turnT: 0, shot: null, banner: null, queue: [],
      // Online: the host decides turns and letters; every screen flies the same arrows (fixed steps).
      net: !!opts.net, isHost: !opts.net || !!opts.host
    };
    // Who plays archer i: "local" (this keyboard), "bot" (runs on this machine), "remote" (another screen streams it).
    const kinds = opts.kinds || [opts.noHuman ? "bot" : "local", "bot"];
    const R = rng(S.seed);
    const emit = (e) => S.events.push(e);
    S.takeEvents = function () { const e = S.events; S.events = []; return e; };
    S.human = function () { return S.humanId >= 0 ? S.archers[S.humanId] : null; };
    // The archer the camera follows: whoever's turn it is, held through the result banner until the next turn starts.
    S.camId = 0;
    S.cur = function () { return S.archers[S.camId]; };
    S.goalTarget = function () { return S.goal >= 0 ? S.targets[S.goal] : null; };

    for (let i = 0; i < kinds.length; i++) {
      const sp = arena.spawn[i];
      S.archers.push({
        id: i, lane: i, kind: kinds[i], human: kinds[i] === "local", name: kinds[i] === "local" ? "You" : "Rival", body: null,
        x: sp.x, y: 0, z: sp.z, vx: 0, vy: 0, vz: 0, ground: true, jumps: 0, camY: 0, landT: 0,
        yaw: 0, pitch: 0.05, aimYaw: 0, aimPitch: 0.05, swayX: 0, swayY: 0,
        state: "idle", t: 0, hold: 0, power: 0, zoom: 0, needRelease: false, watch: 0, arrowsLeft: 0,
        rot: { x: 0, y: 0, z: 0 }, anims: [], trickName: "", letters: 0, out: false, outTurn: 0, net: null,
        bot: kinds[i] === "bot" ? { plan: "idle", t: 0, T: null, spot: null, kind: "jump", jumpAt: 3, relVy: 1, solved: null, ey: 0, ep: 0 } : null
      });
    }
    const nextAlive = function (from) {
      for (let k = 1; k <= S.archers.length; k++) { const a = S.archers[(from + k) % S.archers.length]; if (!a.out) return a.id; }
      return from;
    };
    const alive = () => S.archers.filter((a) => !a.out);

    // --- surfaces
    // The highest surface under (x, z) that the feet at height fy can be standing on.
    function support(x, z, fy) {
      let h = 0;
      for (const b of S.boxes) {
        if (b.h > h && b.h <= fy + 0.12 && x > b.x0 - 0.12 && x < b.x1 + 0.12 && z > b.z0 - 0.12 && z < b.z1 + 0.12) h = b.h;
      }
      return h;
    }
    S.support = support;
    function clearLine(x0, y0, z0, x1, y1, z1) {
      for (const b of S.boxes) {
        const u = segBox(x0, y0, z0, x1, y1, z1, b);
        if (u >= 0) return false;
      }
      return true;
    }
    S.clearLine = clearLine;
    function inBox(x, z, m) { return S.boxes.some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m); }

    // --- where the over-the-shoulder camera is (the crosshair ray starts here). zoom 0..1 = drawn in.
    S.cameraOf = function (a, out) {
      const z = a.zoom, yaw = a.aimYaw;
      const back = 3.1 + (2.5 - 3.1) * z, right = 0.8 + (0.95 - 0.8) * z, up = 1.95 + (1.75 - 1.95) * z;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      out.x = a.x + rx * right - fx * back; out.y = a.camY + up; out.z = a.z + rz * right - fz * back;
      return out;
    };
    S.gripOf = function (a, out) {
      out.x = a.x - Math.sin(a.aimYaw) * CFG.GRIP_FWD; out.y = a.y + CFG.GRIP_Y + Math.sin(a.aimPitch) * 0.2; out.z = a.z - Math.cos(a.aimYaw) * CFG.GRIP_FWD;
      return out;
    };

    // First thing a segment meets: a target (not broken), a box, or the ground.
    function castSeg(px, py, pz, qx, qy, qz, skipBoxes) {
      let best = { u: 2, target: -1, box: null, ground: false };
      if (qy < 0.02 && py > 0.02) { const u = (py - 0.02) / (py - qy); if (u < best.u) best = { u: u, target: -1, box: null, ground: true }; }
      for (const b of S.boxes) {
        if (skipBoxes && skipBoxes.indexOf(b) >= 0) continue;
        const u = segBox(px, py, pz, qx, qy, qz, b);
        if (u >= 0 && u < best.u) best = { u: u, target: -1, box: b, ground: false };
      }
      for (const T of S.targets) {
        if (T.broken) continue;
        if (T.k === "face") {
          const f = segFace(px, py, pz, qx, qy, qz, T);
          if (f && f.boss && f.u < best.u) best = { u: f.u, target: f.r <= T.hr ? T.id : -1, box: null, ground: false, stuckFace: T, fr: f.r };
        } else {
          const u = segSphere(px, py, pz, qx, qy, qz, T.x, T.y, T.z, T.hr * (T.k === "bottle" ? 1.3 : 1), T.sy);
          if (u >= 0 && u < best.u) best = { u: u, target: T.id, box: null, ground: false };
        }
      }
      return best;
    }
    // What the crosshair is on.
    const _c = {}, _d = {};
    S.aimPoint = function (a) {
      S.cameraOf(a, _c);
      dirOf(a.aimYaw, a.aimPitch, _d);
      const M = 150;
      const skip = S.boxes.filter((b) => _c.x > b.x0 && _c.x < b.x1 && _c.z > b.z0 && _c.z < b.z1 && _c.y < b.h);
      const r = castSeg(_c.x, _c.y, _c.z, _c.x + _d.x * M, _c.y + _d.y * M, _c.z + _d.z * M, skip);
      const t = r.u > 1 ? M : r.u * M;
      return { x: _c.x + _d.x * t, y: _c.y + _d.y * t, z: _c.z + _d.z * t, dist: t, target: r.target };
    };

    // --- tricks: the body turns round its centre while it flies
    function addAnim(a, axis, amp, dur) {
      a.anims = a.anims.filter((n) => n.axis !== axis);
      a.anims.push({ axis: axis, amp: amp, t0: S.t, d: dur });
    }
    function trickLabel(a) {
      const flip = a.flipKind;
      const parts = [];
      if (flip === "front") parts.push("Front Flip"); else if (flip === "back") parts.push("Back Flip");
      else if (flip === "left" || flip === "right") parts.push("Side Flip");
      if (a.spun) parts.push(flip ? "Twist" : (a.jumps >= 2 ? "Double-Jump Twist" : "Corkscrew"));
      return parts.length ? parts.join(" + ") : (a.jumps >= 2 ? "Double Jump" : "Jump Shot");
    }
    function doFlip(a, kind) {
      a.flipKind = kind;
      if (kind === "front") addAnim(a, "x", TAU, CFG.FLIP_T);
      else if (kind === "back") addAnim(a, "x", -TAU, CFG.FLIP_T);
      else if (kind === "right") addAnim(a, "z", TAU, CFG.FLIP_T);
      else if (kind === "left") addAnim(a, "z", -TAU, CFG.FLIP_T);
      else { a.spun = true; addAnim(a, "y", (R() < 0.5 ? -1 : 1) * TAU, CFG.SPIN_T + 0.1); }
    }
    function doSpin(a, dir) {
      if (a.anims.some((n) => n.axis === "y")) return;
      a.spun = true;
      addAnim(a, "y", dir * TAU, CFG.SPIN_T);
    }
    function stepAnims(a) {
      a.rot.x = a.rot.y = a.rot.z = 0;
      for (let i = a.anims.length - 1; i >= 0; i--) {
        const n = a.anims[i], p = clamp((S.t - n.t0) / n.d, 0, 1);
        if (p >= 1) { a.anims.splice(i, 1); continue; }
        a.rot[n.axis] = n.amp * 0.5 * (p + p * p * (3 - 2 * p));
      }
    }

    // --- movement
    function stepMove(a, dt, ctl) {
      const aiming = a.state === "draw" || a.state === "aim";
      const speed = aiming ? CFG.RUN_AIM : CFG.RUN;
      let wx = ctl.wx || 0, wz = ctl.wz || 0;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      const k = Math.min(1, dt * (a.ground ? 12 : 2.2));
      a.vx += (wx * speed - a.vx) * k; a.vz += (wz * speed - a.vz) * k;
      if (ctl.jump) {
        if (a.ground) {
          a.vy = CFG.JUMP; a.ground = false; a.jumps = 1; a.spun = false; a.flipKind = ""; emit({ t: "jump", id: a.id });
        } else if (a.jumps < 2) {
          a.vy = CFG.JUMP2; a.jumps = 2;
          doFlip(a, ctl.flip || "none");
          emit({ t: "trick", id: a.id, name: trickLabel(a) });
        }
      }
      if (ctl.spin && !a.ground) { doSpin(a, ctl.spin); emit({ t: "trick", id: a.id, name: trickLabel(a) }); }
      // sideways, with boxes in the way (a box you are above is not in the way)
      const R0 = CFG.RADIUS;
      let nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
      for (const b of S.boxes) {
        if (a.y >= b.h - 0.1) continue;
        const cx = clamp(nx, b.x0, b.x1), cz = clamp(nz, b.z0, b.z1), dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R0 * R0) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = R0 - d; nx += dx / d * push; nz += dz / d * push; }
        else {
          const ex = Math.min(nx - b.x0, b.x1 - nx), ez = Math.min(nz - b.z0, b.z1 - nz);
          if (ex < ez) nx += (nx < b.x / 1 ? -(ex + R0) : ex + R0); else nz += (nz < b.z ? -(ez + R0) : ez + R0);
        }
      }
      const rr = Math.hypot(nx, nz);
      if (rr > CFG.ARENA_R) { nx *= CFG.ARENA_R / rr; nz *= CFG.ARENA_R / rr; }
      a.x = nx; a.z = nz;
      // up and down
      const prev = a.y;
      a.vy -= CFG.GRAV * dt;
      let ny = prev + a.vy * dt;
      const sup = support(a.x, a.z, prev);
      if (a.vy <= 0 && ny <= sup) {
        ny = sup;
        if (!a.ground) { a.landT = 0.3; a.anims.length = 0; a.rot.x = a.rot.y = a.rot.z = 0; emit({ t: "land", id: a.id }); }
        a.ground = true; a.vy = 0; a.jumps = 0;
      } else if (a.ground && ny > sup + 0.001) { a.ground = false; a.jumps = Math.max(a.jumps, 1); }
      a.y = ny;
      a.landT = Math.max(0, a.landT - dt);
    }

    // --- shooting
    function shoot(a) {
      const o = S.gripOf(a, {});
      let yaw, pitch;
      const inv = Math.cos(a.rot.x) * Math.cos(a.rot.z) < -0.2;
      if (a.bot) {
        const B = a.bot, sk = SKILL[S.difficulty] || SKILL[1];
        const m = a.ground ? 1 : 1.25 + (inv ? 0.9 : 0) + (a.anims.length ? 0.3 : 0);
        const s = B.solved || solveLaunch(o.x, o.y, o.z, B.T.x, B.T.y, B.T.z);
        yaw = s.yaw + gauss(R) * sk.err * m; pitch = s.pitch + gauss(R) * sk.err * m * 0.9;
        B.solved = null;
      } else {
        const p = S.aimPoint(a), L = solveLaunch(o.x, o.y, o.z, p.x, p.y, p.z);
        yaw = L.yaw; pitch = L.pitch;
      }
      const d = dirOf(yaw, pitch, {});
      launch(a, o.x, o.y, o.z, d.x * CFG.SPEED, d.y * CFG.SPEED, d.z * CFG.SPEED, !a.ground, trickLabel(a), inv, false);
    }
    // Put an arrow in the air. The same numbers on every screen fly the same arrow (fixed steps below).
    function launch(a, ox, oy, oz, vx, vy, vz, air, trick, inv, remote) {
      const ar = { id: S.nextArrow++, owner: a.id, lane: a.lane, x: ox, y: oy, z: oz, vx: vx, vy: vy, vz: vz,
        ox: ox, oy: oy, oz: oz, hitDist: 0, flying: true, stuck: null, age: 0, acc: 0, hit: -1, hitAt: 0, air: air, trick: trick, inv: inv,
        skip: S.boxes.filter((b) => ox > b.x0 - 0.05 && ox < b.x1 + 0.05 && oz > b.z0 - 0.05 && oz < b.z1 + 0.05 && oy < b.h + 0.05) };
      S.arrows.push(ar);
      S.shot = ar;
      a.arrowsLeft = 0; a.autoShoot = false;
      a.state = "recoil"; a.t = 0; a.power = 0; a.hold = 0; a.watch = 2.2;
      emit({ t: "shot", id: a.id, arrow: ar.id, x: ox, y: oy, z: oz, vx: vx, vy: vy, vz: vz, air: air, trick: trick, inv: inv, remote: !!remote, turn: S.turnNo });
    }
    // Another screen's archer shot (online): the same arrow, from the numbers it sent.
    S.fireRemote = function (id, m) {
      const a = S.archers[id];
      if (!a || S.phase !== "turn" || S.shooter !== id || S.shot || (m.turn !== undefined && m.turn !== S.turnNo)) return false;
      launch(a, +m.x, +m.y, +m.z, +m.vx, +m.vy, +m.vz, !!m.air, String(m.trick || "Jump Shot").slice(0, 40), !!m.inv, true);
      return true;
    };

    function stepArrow(ar, dt) {
      const px = ar.x, py = ar.y, pz = ar.z;
      ar.vy -= CFG.G * dt;
      ar.x += ar.vx * dt; ar.y += ar.vy * dt; ar.z += ar.vz * dt;
      ar.age += dt;
      const r = castSeg(px, py, pz, ar.x, ar.y, ar.z, ar.skip);
      if (r.u <= 1) {
        const x = px + (ar.x - px) * r.u, y = py + (ar.y - py) * r.u, z = pz + (ar.z - pz) * r.u;
        ar.x = x; ar.y = y; ar.z = z;
        if (r.target >= 0) {
          const T = S.targets[r.target];
          if (ar.hit < 0) { ar.hit = T.id; ar.hitAt = S.t; ar.hitDist = Math.hypot(x - ar.ox, y - ar.oy, z - ar.oz); }
          emit({ t: "hit", id: ar.owner, arrow: ar.id, target: T.id, kind: T.k, label: "HIT", x: x, y: y, z: z, name: T.name, dist: Math.round(Math.hypot(x - ar.ox, y - ar.oy, z - ar.oz)) });
          if (T.k === "face") ar.flying = false, ar.stuck = { item: T.id };
          else { T.broken = true; ar.vx *= 0.7; ar.vy *= 0.7; ar.vz *= 0.7; }
        } else {
          ar.flying = false; ar.stuck = { box: !!r.box, ground: r.ground, item: r.stuckFace ? r.stuckFace.id : undefined };
          if (ar.hit < 0) emit({ t: "hit", id: ar.owner, arrow: ar.id, target: -1, kind: r.stuckFace ? "face" : "ground", label: "M", x: x, y: y, z: z, name: "" });
        }
        return;
      }
      if (ar.y <= 0.02) {
        ar.y = 0.02; ar.flying = false; ar.stuck = { ground: true };
        if (ar.hit < 0) emit({ t: "hit", id: ar.owner, arrow: ar.id, target: -1, kind: "ground", label: "M", x: ar.x, y: 0.02, z: ar.z, name: "" });
      } else if (Math.hypot(ar.x, ar.z) > 140 || ar.age > 6) { ar.flying = false; ar.gone = true; }
    }

    // --- the draw cycle: idle -> draw -> aim (hold) -> release -> recoil -> idle
    function stepArcher(a, dt, ctl) {
      const active = S.phase === "turn" && S.shooter === a.id;
      const want = active && (!!ctl.want || !!a.autoShoot);
      if (!ctl.want) a.needRelease = false;
      a.t += dt * (a.state === "draw" ? CFG.DRAW_RATE : a.state === "recoil" ? CFG.RECOIL_RATE : 1);
      switch (a.state) {
        case "idle":
          if (active && want && !a.needRelease && a.arrowsLeft > 0) { a.state = "draw"; a.t = 0; emit({ t: "draw", id: a.id }); }
          break;
        case "draw":
          a.power = clamp((a.t - CFG.NOCK_T) / (CFG.DRAW_T - CFG.NOCK_T), 0, 1);
          if (!want) {
            // you letting go early just lowers the bow (the arrow isn't wasted)
            a.state = "idle"; a.t = 0; a.power = 0;
            if (a.human && active) emit({ t: "early", id: a.id });
          } else if (a.t >= CFG.DRAW_T) { a.state = "aim"; a.t = 0; a.hold = 0; a.power = 1; }
          break;
        case "aim":
          a.hold += dt; a.power = 1;
          if (!want || !active || a.autoShoot) { if (active) shoot(a); else { a.state = "idle"; a.t = 0; } }
          break;
        case "recoil":
          if (a.t >= CFG.RECOIL_T) { a.state = "idle"; a.t = 0; }
          break;
      }
      archerTail(a, dt);
    }
    // Zoom, camera height and sway: the part of an archer's frame every kind (local, bot, remote) shares.
    function archerTail(a, dt) {
      a.watch = Math.max(0, a.watch - dt);
      const zt = (a.state === "draw" && a.t > CFG.NOCK_T) || a.state === "aim" || a.watch > 0 ? 1 : 0;
      a.zoom += (zt - a.zoom) * Math.min(1, dt * (zt ? 5 : 3.5));
      // The camera follows your height gently, so a jump doesn't shake the view.
      a.camY += (a.y - a.camY) * Math.min(1, dt * 13);

      // Sway: a little drift while drawing, steady at full draw, shakier while you spin.
      let amp = a.state === "aim" ? 0.0012 : a.state === "draw" ? 0.004 : 0.002;
      if (a.anims.length) amp *= 2.4;
      if (a.bot) amp *= 0.4;
      const T = S.t + a.id * 3.7;
      const tx = amp * (Math.sin(T * 1.25) * 0.65 + Math.sin(T * 2.9 + 1.1) * 0.35), ty = amp * (Math.cos(T * 0.95) * 0.6 + Math.sin(T * 2.3 + 0.4) * 0.4);
      a.swayX += (tx - a.swayX) * Math.min(1, dt * 6); a.swayY += (ty - a.swayY) * Math.min(1, dt * 6);
      a.aimYaw = a.yaw + a.swayX; a.aimPitch = a.pitch + a.swayY;
    }

    // --- online: poses of the archers this screen owns go out ~20 times a second, the others' come in
    const ANIM_AXIS = ["x", "y", "z"];
    S.poseOf = function (a) {
      return { x: +a.x.toFixed(3), y: +a.y.toFixed(3), z: +a.z.toFixed(3), vx: +a.vx.toFixed(2), vy: +a.vy.toFixed(2), vz: +a.vz.toFixed(2),
        yaw: +a.yaw.toFixed(3), pitch: +a.pitch.toFixed(3), state: a.state, st: +a.t.toFixed(3), hold: +a.hold.toFixed(2), power: +a.power.toFixed(2),
        ground: a.ground ? 1 : 0, an: a.anims.map((n) => [ANIM_AXIS.indexOf(n.axis), +n.amp.toFixed(3), +(S.t - n.t0).toFixed(3), +n.d.toFixed(3)]) };
    };
    const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
    S.setRemote = function (id, m) {
      const a = S.archers[id];
      if (!a || a.kind !== "remote" || !m) return;
      const first = !a.net;
      a.net = { x: clamp(num(m.x, a.x), -80, 80), y: clamp(num(m.y, a.y), 0, 40), z: clamp(num(m.z, a.z), -80, 80), yaw: num(m.yaw, a.yaw), pitch: clamp(num(m.pitch, a.pitch), CFG.PITCH_MIN, CFG.PITCH_MAX) };
      a.vx = clamp(num(m.vx, 0), -20, 20); a.vy = clamp(num(m.vy, 0), -40, 40); a.vz = clamp(num(m.vz, 0), -20, 20);
      a.ground = !!m.ground;
      const st = ["idle", "draw", "aim", "recoil"].indexOf(m.state) >= 0 ? m.state : "idle";
      if (st !== a.state) { a.state = st; a.t = num(m.st, 0); } else a.t += (num(m.st, a.t) - a.t) * 0.5;
      a.hold = num(m.hold, a.hold); a.power = clamp(num(m.power, 0), 0, 1);
      a.anims = (Array.isArray(m.an) ? m.an : []).slice(0, 3).map((n) => ({ axis: ANIM_AXIS[n[0]] || "x", amp: clamp(num(n[1], 0), -7, 7), t0: S.t - clamp(num(n[2], 0), 0, 2), d: clamp(num(n[3], 0.7), 0.1, 2) }));
      if (first) { a.x = a.net.x; a.y = a.net.y; a.z = a.net.z; a.yaw = a.net.yaw; a.pitch = a.net.pitch; }
    };
    function stepRemote(a, dt) {
      const n = a.net;
      if (n) {
        const k = Math.min(1, dt * 16);
        if (Math.hypot(n.x - a.x, n.z - a.z) > 8) { a.x = n.x; a.z = n.z; }
        a.x += (n.x - a.x) * k; a.y += (n.y - a.y) * k; a.z += (n.z - a.z) * k;
        a.yaw += angDiff(n.yaw, a.yaw) * k; a.pitch += (n.pitch - a.pitch) * k;
      }
      a.t += dt * (a.state === "draw" ? CFG.DRAW_RATE : a.state === "recoil" ? CFG.RECOIL_RATE : 1);
      if (a.state === "aim") a.hold += dt;
      stepAnims(a);
      archerTail(a, dt);
    }

    // --- bots
    function pickTarget(a) {
      const sk = SKILL[S.difficulty] || SKILL[1];
      if (S.mode === "match") return S.targets[S.goal];
      const ok = S.targets.filter((T) => T.diff <= sk.maxDiff);
      // favour harder ones a little: the hardest of two draws
      const p = ok[Math.floor(R() * ok.length)], q = ok[Math.floor(R() * ok.length)];
      return p.diff >= q.diff ? p : q;
    }
    function pickSpot(a, T) {
      const cands = [];
      for (let i = 0; i < 60; i++) {
        const ang = R() * TAU, dist = 5 + R() * 24;
        const x = T.x + Math.cos(ang) * dist, z = T.z + Math.sin(ang) * dist;
        if (Math.hypot(x, z) > CFG.ARENA_R - 1 || inBox(x, z, 1.0)) continue;
        if (T.k === "face" && (x - T.x) * T.nx + (z - T.z) * T.nz < 2) continue;
        // the walk there must be clear
        if (!clearLine(a.x, 0.5, a.z, x, 0.5, z)) continue;
        // and from the air (about 2 m up, eye height on top) the arrow has to see the target
        const los = clearLine(x, 1.45 + 2.2, z, T.x, T.y, T.z);
        cands.push({ x: x, z: z, los: los, d: Math.hypot(x - T.x, z - T.z) });
      }
      const good = cands.filter((c) => c.los);
      const pool = good.length ? good : cands;
      if (!pool.length) return { x: a.x, z: a.z };
      return pool[Math.floor(R() * pool.length)];
    }
    // A trick the bot has to do: flip = second-jump kind ("" none), spin = twist. Both come from the trick label.
    function specOfKind(k) {
      if (k === "jump") return { flip: "", spin: false };
      if (k === "twist") return { flip: "none", spin: false };
      if (k === "flipspin") return { flip: "front", spin: true };
      return { flip: k, spin: false };
    }
    function specOfTrick(label) {
      const flip = /Front Flip/.test(label) ? "front" : /Back Flip/.test(label) ? "back" : /Side Flip/.test(label) ? (R() < 0.5 ? "left" : "right") : "";
      const twist = /Twist|Corkscrew/.test(label), cork = /Corkscrew/.test(label);
      if (flip) return { flip: flip, spin: twist };
      if (cork) return { flip: "", spin: true };
      return /Twist|Double/.test(label) ? { flip: "none", spin: false } : { flip: "", spin: false };
    }
    function botThink(a, dt) {
      const B = a.bot, sk = SKILL[S.difficulty] || SKILL[1], ctl = { wx: 0, wz: 0, want: false, jump: false, spin: 0, flip: "none" };
      if (S.phase !== "turn" || S.shooter !== a.id || a.arrowsLeft <= 0) { if (S.phase !== "turn") B.plan = "idle"; return ctl; }
      B.t += dt;
      if (B.plan === "idle") {
        B.T = pickTarget(a);
        B.spot = pickSpot(a, B.T);
        B.spec = S.mode === "match" && S.goalTrick ? specOfTrick(S.goalTrick) : specOfKind(TRICKS[Math.floor(R() * TRICKS.length)]);
        B.jumpAt = 2 + R() * 3; B.relVy = 0.4 + R() * 1.4;
        B.plan = "goto"; B.t = 0;
      }
      // Face the target all the time (the arrow is solved from wherever the grip is).
      if (B.T) {
        const o = S.gripOf(a, {}), s = solveLaunch(o.x, o.y, o.z, B.T.x, B.T.y, B.T.z);
        a.yaw += angDiff(s.yaw, a.yaw) * Math.min(1, dt * 7);
        a.pitch += (clamp(s.pitch, CFG.PITCH_MIN, CFG.PITCH_MAX) - a.pitch) * Math.min(1, dt * 7);
        B.solved = s;
      }
      if (B.plan === "goto") {
        const dx = B.spot.x - a.x, dz = B.spot.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.6 || B.t > 6) { B.plan = "draw"; B.t = 0; }
        else { ctl.wx = dx / d; ctl.wz = dz / d; }
      }
      if (B.plan === "draw") {
        ctl.want = true;
        if (a.state === "aim" && B.t > sk.settle) { B.plan = "jump1"; B.t = 0; }
      } else if (B.plan === "jump1") {
        ctl.want = true; ctl.jump = true; B.plan = "rise"; B.t = 0;
      } else if (B.plan === "rise") {
        ctl.want = true;
        if (!B.spec.flip && !B.spec.spin) { if (a.vy <= B.relVy * 0.6) B.plan = "release"; }
        else if (a.vy <= B.jumpAt) {
          if (B.spec.flip) { ctl.jump = true; ctl.flip = B.spec.flip; }
          if (B.spec.spin) ctl.spin = R() < 0.5 ? -1 : 1;
          B.plan = "rise2"; B.t = 0;
        }
      } else if (B.plan === "rise2") {
        ctl.want = true;
        if (a.vy <= B.relVy) B.plan = "release";
      }
      if (B.plan === "release") {
        ctl.want = false;
        if (a.state !== "aim") ctl.want = true;   // not drawn yet: keep holding
        else B.plan = "done";
      }
      if (a.ground && (B.plan === "rise2") && B.t > 0.3) B.plan = "release";
      return ctl;
    }

    // The one not shooting walks out of the way (the camera sits right behind the shooter).
    function awayFrom(a, sh) {
      const dx = a.x - sh.x, dz = a.z - sh.z, d = Math.hypot(dx, dz) || 1;
      return d < 9 ? { wx: dx / d, wz: dz / d } : { wx: 0, wz: 0 };
    }

    // --- the rules
    // The whole state of the game that the host decides (sent with every result / turn so any screen can catch up).
    S.snap = function () {
      return { mode: S.mode, setter: S.setter, shooter: S.shooter, goal: S.goal, trick: S.goalTrick, queue: S.queue.slice(), turnNo: S.turnNo, winner: S.winner,
        letters: S.archers.map((a) => a.letters), out: S.archers.map((a) => (a.out ? a.outTurn || 1 : 0)) };
    };
    S.applySnap = function (s) {
      if (!s) return;
      const n = S.archers.length, id = (v, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
      S.mode = s.mode === "match" ? "match" : "set";
      S.setter = id(s.setter, S.setter); S.shooter = id(s.shooter, S.shooter);
      S.goal = Number.isInteger(s.goal) && s.goal < S.targets.length ? s.goal : -1;
      S.goalTrick = S.goal >= 0 && typeof s.trick === "string" ? s.trick.slice(0, 40) : "";
      S.queue = (Array.isArray(s.queue) ? s.queue : []).filter((v) => id(v, -1) >= 0);
      S.winner = Number.isInteger(s.winner) ? s.winner : -1;
      S.archers.forEach((a, i) => {
        a.letters = clamp(num((s.letters || [])[i], a.letters) | 0, 0, CFG.LETTERS.length);
        const o = (s.out || [])[i] | 0; a.out = o > 0; a.outTurn = o;
      });
    };
    function followersOf(setter) {
      const q = [];
      for (let k = 1; k < S.archers.length; k++) { const a = S.archers[(setter + k) % S.archers.length]; if (!a.out) q.push(a.id); }
      return q;
    }
    function startTurn(snap) {
      if (snap) S.applySnap(snap);
      S.turnNo = snap && snap.turnNo ? snap.turnNo : S.turnNo + 1;
      S.arrows = [];
      S.targets.forEach((T) => { T.broken = false; });
      S.shot = null; S.turnT = CFG.TURN_T; S.phase = "turn"; S.camId = S.shooter;
      S.archers.forEach(function (a) {
        a.arrowsLeft = a.id === S.shooter ? 1 : 0;
        a.needRelease = a.human; a.autoShoot = false;
        a.watch = 0;
        if (a.state === "draw" || a.state === "aim") { a.state = "idle"; a.t = 0; a.power = 0; }
        if (a.bot) { a.bot.plan = "idle"; a.bot.t = 0; a.bot.solved = null; }
      });
      emit({ t: "turn", shooter: S.shooter, mode: S.mode, goal: S.goal, trick: S.goalTrick, setter: S.setter, snap: S.snap() });
    }
    // The host (or the offline game) decides what a finished turn means; everyone else is told (applyResult).
    function resolveTurn() {
      const ar = S.shot, sh = S.archers[S.shooter];
      const hit = ar ? ar.hit : -1, air = ar ? ar.air : false;
      const T = hit >= 0 ? S.targets[hit] : null;
      const okAir = air || !CFG.NEED_AIR;
      let res;
      const why = sh.out ? sh.name + " left." : !ar ? "No shot taken." : !T ? "Missed everything." : !okAir ? "Feet on the ground: it has to be released in the air." : "";
      const nm = (id) => S.archers[id].name;
      if (S.mode === "set") {
        if (T && okAir && !sh.out) {
          S.goal = hit; S.goalTrick = ar.trick; S.mode = "match"; S.queue = followersOf(S.setter); S.shooter = S.queue.shift();
          res = { kind: "set", text: "TRICK SET!", sub: sh.name + " hit the " + T.name + " from " + Math.round(ar.hitDist) + " m with a " + ar.trick + ". " + nm(S.shooter) + ": match it exactly!" };
        } else {
          S.setter = nextAlive(S.setter); S.shooter = S.setter; S.goal = -1; S.goalTrick = "";
          res = { kind: "noset", text: "NO SET", sub: why + " " + nm(S.setter) + " sets next." };
        }
      } else {
        const goalT = S.targets[S.goal];
        const sameTrick = !!ar && ar.trick === S.goalTrick;
        if (T && okAir && hit === S.goal && sameTrick && !sh.out) {
          res = { kind: "matched", text: "MATCHED!", sub: sh.name + " hit the " + goalT.name + " from " + Math.round(ar.hitDist) + " m with a " + ar.trick + "." };
        } else if (sh.out) {
          res = { kind: "left", text: "PLAYER LEFT", sub: why };
        } else {
          sh.letters++;
          const L = CFG.LETTERS.charAt(sh.letters - 1);
          const detail = T && okAir && hit === S.goal ? "Wrong trick: it had to be a " + S.goalTrick + ", not a " + ar.trick + "." : T && okAir ? "Hit the " + T.name + " instead of the " + goalT.name + "." : why;
          res = { kind: "letter", text: "MISSED: " + L, sub: detail + " " + sh.name + " gets the letter " + L + "." };
          if (sh.letters >= CFG.LETTERS.length) { sh.out = true; sh.outTurn = S.turnNo; res.sub += " " + sh.name + " is out."; }
        }
        S.queue = S.queue.filter((id) => !S.archers[id].out);
        if (S.queue.length) { S.shooter = S.queue.shift(); res.sub += " " + nm(S.shooter) + " is next."; }
        else {
          S.mode = "set"; S.goal = -1; S.goalTrick = "";
          if (S.archers[S.setter].out) S.setter = nextAlive(S.setter);
          S.shooter = S.setter; res.sub += " " + nm(S.setter) + " sets again.";
        }
      }
      const left = alive();
      if (left.length <= 1) { S.winner = left.length ? left[0].id : S.setter; res.over = true; }
      res.text = String(res.text); res.shooterId = sh.id;
      res.snap = S.snap();
      commitResult(res);
    }
    // Show a result (the host's own, or one it sent). Clients arrive here with the host's snapshot already applied.
    function commitResult(res) {
      S.banner = res;
      emit({ t: "result", kind: res.kind, text: res.text, sub: res.sub, shooter: res.shooterId, over: !!res.over, snap: res.snap });
      S.phase = "result"; S.phaseT = CFG.RESULT_T;
    }
    S.applyResult = function (m) {
      if (!m || S.phase !== "turn" || (m.turnNo !== undefined && m.turnNo !== S.turnNo)) return false;
      S.applySnap(m.snap);
      commitResult({ kind: String(m.kind || "").slice(0, 12), text: String(m.text || "").slice(0, 40), sub: String(m.sub || "").slice(0, 200), over: !!m.over, shooterId: m.shooter, snap: m.snap });
      return true;
    };
    S.applyTurn = function (snap) {
      if (!snap || !Number.isInteger(snap.turnNo) || snap.turnNo <= S.turnNo) return false;
      startTurn(snap);
      return true;
    };
    // A player left (online). The host's call: they are out, and if it was their shot the turn ends now.
    S.drop = function (id) {
      const a = S.archers[id];
      if (!a || a.out) return;
      a.out = true; a.outTurn = S.turnNo || 1; a.left = true;
      S.queue = S.queue.filter((q) => q !== id);
      if (S.phase === "turn" && S.shooter === id && S.isHost) resolveTurn();
    };
    S.start = function () {
      S.archers.forEach((a) => { a.letters = 0; a.out = false; a.outTurn = 0; });
      S.setter = 0; S.shooter = 0; S.mode = "set"; S.goal = -1; S.goalTrick = ""; S.queue = [];
      S.phase = "intro"; S.phaseT = CFG.INTRO_T;
      emit({ t: "intro" });
    };

    // --- one frame. inp (the human's controls): { yaw, pitch, fire, mx, mz, jump, spin }
    S.step = function (dt, inp) {
      if (S.phase === "matchover" || S.phase === "menu") return;
      S.t += dt;
      if (S.phase === "intro") {
        if (!S.introHold) S.phaseT -= dt;   // online: the host waits until everyone's screen has the match built
        if (S.phaseT <= 0 && S.isHost) startTurn();
      }
      for (const a of S.archers) {
        if (a.kind === "remote") { stepRemote(a, dt); continue; }
        let ctl = { wx: 0, wz: 0, want: false, jump: false, spin: 0, flip: "none" };
        const live = S.phase === "turn" && S.shooter === a.id;
        if (a.human && inp && live) {
          a.yaw = inp.yaw; a.pitch = clamp(inp.pitch, CFG.PITCH_MIN, CFG.PITCH_MAX);
          const yw = a.yaw, mz = inp.mz || 0, mx = inp.mx || 0;
          ctl.wx = -Math.sin(yw) * mz + Math.cos(yw) * mx; ctl.wz = -Math.cos(yw) * mz - Math.sin(yw) * mx;
          if (inp.tap && (a.state === "draw" || a.state === "aim")) a.autoShoot = true;
          ctl.want = !!inp.fire; ctl.jump = !!inp.jump; ctl.spin = inp.spin || 0;
          ctl.flip = mz > 0.3 ? "front" : mz < -0.3 ? "back" : mx > 0.3 ? "right" : mx < -0.3 ? "left" : "none";
        } else if (a.bot) ctl = botThink(a, dt);
        if (!live && S.phase === "turn") ctl = awayFrom(a, S.archers[S.shooter]);
        stepMove(a, dt, live || S.phase === "turn" ? ctl : { wx: 0, wz: 0 });
        stepAnims(a);
        stepArcher(a, dt, ctl);
      }
      // Arrows fly in fixed 1/240 s steps, whatever the frame rate, so every screen agrees where they land.
      for (const ar of S.arrows) {
        if (!ar.flying) continue;
        ar.acc += dt;
        for (let k = 0; ar.acc >= ARROW_H && k < 60 && ar.flying; k++) { ar.acc -= ARROW_H; stepArrow(ar, ARROW_H); }
      }
      if (S.phase === "turn") {
        S.turnT -= dt;
        const ar = S.shot;
        if (S.isHost) {
          if (ar && (!ar.flying || (ar.hit >= 0 && S.t - ar.hitAt > 0.35))) resolveTurn();
          else if (!ar && S.turnT <= 0) resolveTurn();
          else if (ar && S.turnT < -8) resolveTurn();
        }
      } else if (S.phase === "result") {
        S.phaseT -= dt;
        if (S.phaseT <= 0 && S.isHost) {
          if (S.winner < 0 && alive().length <= 1) { const l = alive(); S.winner = l.length ? l[0].id : S.setter; }
          if (S.winner >= 0) { S.phase = "matchover"; emit({ t: "matchover", winner: S.winner }); }
          else startTurn();
        }
      }
    };
    // Clients: the host says the match is over (after its result banner).
    S.applyOver = function (winner) {
      if (S.phase === "matchover") return;
      S.winner = Number.isInteger(winner) ? winner : S.winner;
      S.phase = "matchover"; emit({ t: "matchover", winner: S.winner });
    };
    S.skipResult = function () { if (S.phase === "result") S.phaseT = Math.min(S.phaseT, 0.01); };
    // Best first: the winner, then whoever lasted longest (fewest letters among those still in).
    S.standings = function () {
      return S.archers.slice().sort((p, q) => (p.id === S.winner ? -1 : q.id === S.winner ? 1 : 0) || (p.out - q.out) || (q.outTurn - p.outTurn) || (p.letters - q.letters) || (p.id - q.id));
    };
    return S;
  };
  SB.solveLaunch = solveLaunch;
  if (typeof module !== "undefined") module.exports = SB;
})(globalThis.SB);
