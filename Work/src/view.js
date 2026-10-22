// Rendering: the renderer, the over-the-shoulder camera that zooms in at full draw, the
// archers' bodies, the arrows (flying and stuck), the menu flyover, and keeping the
// quality up on weak laptops.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const THREE = globalThis.THREE;
  const V = {};
  const BASE_FOV = 60;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

  V.init = function (canvas, antialias) {
    V.canvas = canvas;
    // Smoothed edges on normal screens (a retina screen's extra pixels already do that job).
    V.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: antialias === undefined ? (devicePixelRatio || 1) < 1.5 : !!antialias, powerPreference: "high-performance" });
    V.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    V.renderer.toneMappingExposure = 0.95;
    V.renderer.shadowMap.enabled = true;
    V.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    V.scene = new THREE.Scene();
    V.scene.background = new THREE.Color(0xe9dcc4);
    V.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 900);
    V.camera.rotation.order = "YXZ";
    V.scene.add(V.camera);
    V.quality = { shadows: true, pr: Math.min(devicePixelRatio || 1, 1.5) };
    V.slow = 0; V.fps = 60; V.fov = BASE_FOV;
    V.chars = []; V.arrows = new Map();
    V.camSm = null; V.camTmp = {}; V.menuT = 0;
    SB.Fx.init(V.scene);
    V.world = SB.World.build(V);
    V.resize();
    addEventListener("resize", V.resize);
  };
  V.resize = function () {
    const w = innerWidth, h = innerHeight;
    V.renderer.setPixelRatio(V.quality.pr);
    V.renderer.setSize(w, h, false);
    V.camera.aspect = w / h;
    V.camera.updateProjectionMatrix();
  };
  // The player's HopLobby graphics preset (potato..ultra) as numbers: resolution, shadows, long grass, fog distance.
  // The step-down below only runs when the player left graphics on Auto; a preset they picked is kept as it is.
  V.applyGraphics = function (g) {
    if (!g) return;
    const sun = V.world.sun, shadows = g.shadows !== "off";
    V.preset = g;
    V.auto = !!g.auto;
    V.quality.pr = Math.max(0.5, Math.min(devicePixelRatio || 1, g.pixelRatio || 1));
    V.quality.shadows = shadows;
    V.renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    if (shadows) {
      const size = g.shadows === "soft" ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      V.renderer.shadowMap.type = g.shadows === "soft" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    }
    if (SB.World.grass) SB.World.grass.visible = g.level !== "potato" && (g.drawDistance === undefined ? 1 : g.drawDistance) >= 0.45;
    if (V.scene.fog) { V.scene.fog.far = 130 + 130 * clamp(g.drawDistance === undefined ? 1 : g.drawDistance, 0, 1); V.scene.fog.near = V.scene.fog.far * 0.27; }
    V.slow = 0; V.downgraded = "";
    V.scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach((x) => { x.needsUpdate = true; }); });
    V.resize();
  };
  V.setQuality = function (shadows, pr) {
    V.quality.shadows = shadows; V.quality.pr = pr;
    V.renderer.shadowMap.enabled = shadows;
    V.world.sun.castShadow = shadows;
    V.scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach((x) => { x.needsUpdate = true; }); });
    V.resize();
  };

  // ------------------------------------------------------------------ a match
  V.startMatch = function (sim) {
    V.sim = sim;
    V.chars.forEach((c) => { if (c) V.scene.remove(c.root); });
    V.chars = [];
    sim.archers.forEach(function (a) {
      const c = SB.Body.make(a, a.body || "Aj", SB.World.LANE_COL[a.lane]);
      if (c) V.scene.add(c.root);
      V.chars[a.id] = c;
    });
    V.camSm = null;
  };
  V.newStage = function (sim) {
    SB.World.buildStage(V, sim);
    V.arrows.forEach((m) => V.scene.remove(m));
    V.arrows.clear();
    SB.Fx.clear();
    V.settle = 3; V.slow = 0; V.fps = 60;
  };
  V.clearMatch = function () {
    V.chars.forEach((c) => { if (c) V.scene.remove(c.root); });
    V.chars = [];
    V.arrows.forEach((m) => V.scene.remove(m));
    V.arrows.clear();
    V.sim = null;
  };

  // ------------------------------------------------------------------ per frame
  const _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  function syncArrows(sim) {
    const seen = new Set();
    for (const ar of sim.arrows) {
      if (ar.gone) continue;
      seen.add(ar.id);
      let m = V.arrows.get(ar.id);
      if (!m) {
        m = SB.Body.arrowMesh(SB.World.LANE_COL[ar.lane]);
        m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        V.scene.add(m); V.arrows.set(ar.id, m);
      }
      if (ar.flying || !m.userData.dir) {
        _d.set(ar.vx, ar.vy, ar.vz).normalize();
        m.quaternion.setFromUnitVectors(_z, _d);
        m.userData.dir = _d.clone();
      }
      // The sim tracks the tip; the mesh's origin is its nock. Stuck arrows sink 10 cm in.
      const dir = m.userData.dir, len = 0.8, sink = ar.flying ? 0 : 0.1;
      m.position.set(ar.x - dir.x * (len - sink), ar.y - dir.y * (len - sink), ar.z - dir.z * (len - sink));
    }
    V.arrows.forEach(function (m, id) { if (!seen.has(id)) { V.scene.remove(m); V.arrows.delete(id); } });
  }

  V.update = function (sim, dt, now) {
    // frame-rate watch: fall back to cheaper rendering if the machine can't keep up
    V.fps += (1 / Math.max(dt, 1e-3) - V.fps) * 0.04;
    // (not in the first seconds of a stage: building it and decoding the bodies' textures hitch)
    V.settle = Math.max(0, (V.settle || 0) - dt);
    if (V.auto && V.fps < 26 && !V.menuMode && V.settle <= 0) V.slow += dt; else V.slow = Math.max(0, V.slow - dt * 0.5);
    if (V.slow > 2.5) {
      V.slow = 0;
      if (V.quality.shadows) { V.setQuality(false, V.quality.pr); V.downgraded = "shadows off"; }
      else if (SB.World.grass && SB.World.grass.visible) { SB.World.grass.visible = false; V.downgraded = "shadows and long grass off"; }
      else if (V.quality.pr > 0.8) { V.setQuality(false, Math.max(0.7, V.quality.pr * 0.75)); V.downgraded = "resolution down"; }
    }
    SB.World.update(V, sim || {}, dt, now);
    SB.Fx.update(dt);
    if (V.inset) V.inset.t -= dt;
    if (V.menuMode || !sim) { V.menuCamera(dt); return; }
    sim.archers.forEach(function (a) {
      const c = V.chars[a.id];
      if (!c) return;
      c.root.visible = !a.left;
      SB.Body.pose(c, a, dt);
      c.tag.visible = !a.human;
      if (a.out) c.tag.material.opacity = 0.45;
    });
    syncArrows(sim);
    V.updateCamera(sim, sim.cur(), dt);
  };

  // How far in the full-draw zoom goes: matching a far target zooms in more, so it reads about the same size.
  V.aimFov = function (sim) {
    const G = sim.goalTarget(), a = sim.cur();
    if (!G) return 38;
    const d = Math.hypot(G.x - a.x, G.z - a.z);
    return clamp(2 * Math.atan(3.6 / Math.max(d, 8)) * 180 / Math.PI, 13, 38);
  };
  V.updateCamera = function (sim, h, dt) {
    const cam = V.camera;
    if (V.freeCam) {
      cam.position.fromArray(V.freeCam.pos); cam.lookAt(V.freeCam.look[0], V.freeCam.look[1], V.freeCam.look[2]); setFov(V.freeCam.fov || BASE_FOV);
      V.chars.forEach((c) => { if (c) c.root.visible = true; });
      return;
    }
    if (!h) {
      // Bots-only (tests): stand behind the middle of the line.
      cam.position.set(0, 2.4, 4.5); cam.lookAt(0, 1.2, -20); setFov(BASE_FOV); return;
    }
    // The sim keeps the camera (the arrow is aimed through it), so what you see is what you shoot.
    const c = sim.cameraOf(h, V.camTmp);
    cam.position.set(c.x, c.y, c.z);
    cam.rotation.set(h.aimPitch, h.aimYaw, 0);
    const z = ease(h.zoom);
    V.zoom = z;
    // Switching shooters swings the view round: snap the zoom to the new shooter's.
    setFov(BASE_FOV + (V.aimFov(sim) - BASE_FOV) * z);
  };
  function setFov(f) {
    if (Math.abs(V.camera.fov - f) > 0.02) { V.camera.fov = f; V.camera.updateProjectionMatrix(); }
    V.fov = f;
  }

  // The menu: a slow drift over the range.
  V.menuCamera = function (dt) {
    V.menuT += dt;
    const t = V.menuT * 0.07, cam = V.camera;
    cam.position.set(Math.sin(t) * 22, 5.5 + Math.sin(t * 1.7) * 1.2, Math.cos(t) * 22);
    cam.lookAt(0, 2.2, -4);
    setFov(BASE_FOV);
  };

  // ------------------------------------------------------------------ target cam
  // After your arrow lands: a close-up of where it went, in a corner, for a couple of seconds
  // (from the line a stuck arrow is a couple of pixels; this is the TV-coverage view).
  V.insetCam = new THREE.PerspectiveCamera(32, 1.4, 0.05, 200);
  V.event = function (sim, e) {
    if (e.t !== "hit") return;
    const T = e.target >= 0 ? sim.targets[e.target] : null, a = sim.archers[e.id];
    let look, from;
    if (T && T.k === "face") { look = [T.x, T.y, T.z]; from = [T.x + T.nx * 2.6 + T.nz * 0.5, T.y + 0.25, T.z + T.nz * 2.6 - T.nx * 0.5]; }
    else {
      // from the shooter's side, a few metres off the hit
      const dx = a.x - e.x, dz = a.z - e.z, l = Math.hypot(dx, dz) || 1, back = T ? 2.6 : 3.4;
      look = [e.x, Math.max(e.y, 0.2), e.z]; from = [e.x + dx / l * back + dz / l * 0.6, Math.max(e.y, 0.3) + 0.5, e.z + dz / l * back - dx / l * 0.6];
    }
    V.inset = { t: 2.4, look: look, from: from, follow: null, label: e.label };
    const el = document.getElementById("inset");
    if (el) { el.classList.add("on"); el.querySelector("b").textContent = e.label === "M" ? "MISS" : e.name || "HIT"; }
  };
  V.render = function () {
    const r = V.renderer;
    r.render(V.scene, V.camera);
    const I = V.inset;
    if (!I) return;
    if (I.t <= 0 || V.menuMode) {
      V.inset = null;
      const el = document.getElementById("inset"); if (el) el.classList.remove("on");
      return;
    }
    const W = innerWidth, H = innerHeight, w = Math.round(Math.min(360, W * 0.3)), h = Math.round(w / 1.4), x = W - w - 16, y = 16 + Math.round(H * 0.0) + 150;
    const c = V.insetCam;
    const dx = I.follow ? I.follow.cx - I.look[0] : 0;
    c.position.set(I.from[0] + dx, I.from[1], I.from[2]);
    c.lookAt(I.look[0] + dx, I.look[1], I.look[2]);
    c.aspect = w / h; c.updateProjectionMatrix();
    r.setScissorTest(true);
    r.setViewport(x, H - y - h, w, h); r.setScissor(x, H - y - h, w, h);
    r.render(V.scene, c);
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  };
  SB.View = V;
})(globalThis.SB);
