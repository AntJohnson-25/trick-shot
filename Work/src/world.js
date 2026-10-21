// The range: an autumn meadow with four lanes, the shooting line, distance boards, wind
// flags and trees; plus each stage's targets (target bosses, apples on posts, pumpkins on
// hay, bottles on a fence, balloons, the running boar), rebuilt per stage from the sim's lanes.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const THREE = globalThis.THREE;
  const W = {};
  W.LANE_COL = [0x3d8bff, 0xffb02e, 0x3fcf6a, 0xc46bff];   // per lane: fletching, bow wrap, name tag
  const rnd = (a, b) => a + Math.random() * (b - a);

  function canvasTex(w, h, draw, repeat) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  // ------------------------------------------------------------------ textures
  let faceTex = null, strawTex = null, grassTex = null, boarRingTex = null;
  function face() {
    if (faceTex) return faceTex;
    // World Archery colours, outside in: white, black, blue, red, gold; ten rings and the inner X.
    faceTex = canvasTex(512, 512, function (g, w) {
      const c = w / 2, R = w / 2 - 2;
      const cols = ["#f4f4f0", "#f4f4f0", "#1d1d1f", "#1d1d1f", "#2a8fe0", "#2a8fe0", "#e2302b", "#e2302b", "#ffd52e", "#ffd52e"];
      g.fillStyle = "#e9e1cf"; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 10; i++) {
        const r = R * (10 - i) / 10;
        g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = cols[i]; g.fill();
        g.lineWidth = 1.6; g.strokeStyle = i === 2 || i === 3 ? "#d8d8d8" : "#222"; g.stroke();
      }
      g.beginPath(); g.arc(c, c, R / 20, 0, Math.PI * 2); g.lineWidth = 1.2; g.strokeStyle = "#222"; g.stroke();
      g.beginPath(); g.moveTo(c - 4, c); g.lineTo(c + 4, c); g.moveTo(c, c - 4); g.lineTo(c, c + 4); g.stroke();
    });
    return faceTex;
  }
  function straw() {
    if (strawTex) return strawTex;
    strawTex = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = "#c9a35a"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 6 + Math.random() * 18;
        g.strokeStyle = Math.random() < 0.5 ? "rgba(255,230,160,0.55)" : "rgba(120,85,30,0.45)";
        g.lineWidth = 1 + Math.random();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }, [1, 1]);
    return strawTex;
  }
  let barkTex = null;
  function bark() {
    if (barkTex) return barkTex;
    // Vertical furrows (cylinder UVs: u round the trunk, v up it).
    barkTex = canvasTex(128, 256, function (g, w, h) {
      g.fillStyle = "#5a3d22"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * w;
        g.strokeStyle = Math.random() < 0.5 ? "rgba(30,18,8,0.55)" : "rgba(140,110,80,0.35)"; g.lineWidth = 1 + Math.random() * 3;
        g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
        g.stroke();
      }
    }, [2, 2]);
    return barkTex;
  }
  function grass() {
    if (grassTex) return grassTex;
    grassTex = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = "#6f9a3c"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        g.fillStyle = Math.random() < 0.5 ? "rgba(40,80,20,0.22)" : "rgba(170,200,90,0.18)";
        g.fillRect(x, y, 1.5, 3 + Math.random() * 4);
      }
      // a few fallen leaves
      for (let i = 0; i < 70; i++) {
        g.fillStyle = ["#d9822b", "#c4561f", "#e8b23a", "#9c3b1a"][i % 4];
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3, 1.8, Math.random() * 3, 0, Math.PI * 2); g.fill();
      }
    }, [40, 40]);
    return grassTex;
  }
  function boarRing() {
    if (boarRingTex) return boarRingTex;
    boarRingTex = canvasTex(128, 128, function (g, w) {
      const c = w / 2;
      g.clearRect(0, 0, w, w);
      g.beginPath(); g.arc(c, c, 60, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = "#f4f0e6"; g.stroke();
      g.beginPath(); g.arc(c, c, 28, 0, Math.PI * 2); g.fillStyle = "#e2302b"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#f4f0e6"; g.stroke();
    });
    return boarRingTex;
  }

  // ------------------------------------------------------------------ smooth geometry helpers
  // Polyhedra come unindexed (every face has its own corners), so normals come out faceted.
  // Weld the shared corners into one vertex and the shading goes smooth.
  function weld(geo) {
    if (geo.index) geo = geo.toNonIndexed();
    const P = geo.attributes.position, seen = new Map(), pos = [], idx = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = Math.round(x * 1e4) + "," + Math.round(y * 1e4) + "," + Math.round(z * 1e4);
      let j = seen.get(k);
      if (j === undefined) { j = pos.length / 3; seen.set(k, j); pos.push(x, y, z); }
      idx.push(j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }
  // A few layered sines: cheap, smooth, repeatable lumps for leaf clumps and hills.
  function lumps(x, y, z, f, s) {
    return Math.sin(x * f + s) * Math.sin(y * f * 1.3 + s * 2) * Math.sin(z * f * 0.9 + s * 3) +
      0.45 * Math.sin(x * f * 2.7 + s * 5) * Math.sin(z * f * 2.3 + y * f * 1.1) +
      0.2 * Math.sin(x * f * 6.1 + y * f * 5.3 + s) * Math.sin(z * f * 5.7);
  }
  // A leafy crown: a lumpy, smooth ball, darker underneath and dappled (vertex colours tint the leaf colour).
  function crownGeometry(detail, seed) {
    const g = weld(new THREE.IcosahedronGeometry(1.7, detail));
    const P = g.attributes.position, v = new THREE.Vector3(), col = [];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const n = lumps(v.x, v.y, v.z, 1.9, seed);
      v.multiplyScalar(1 + 0.16 * n);
      v.y *= 0.88;
      P.setXYZ(i, v.x, v.y, v.z);
      const shade = 0.55 + 0.45 * Math.min(1, Math.max(0, (v.y / 1.7 + 1) / 1.6)), dap = 0.88 + 0.12 * Math.sin(v.x * 7 + v.z * 5 + seed) * Math.sin(v.y * 9);
      col.push(shade * dap, shade * dap, shade * dap * 0.95);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  // A trunk: tapered, a little crooked, flared at the roots.
  function trunkGeometry() {
    const g = new THREE.CylinderGeometry(0.15, 0.24, 3, 14, 8);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), u = (y + 1.5) / 3;
      const flare = 1 + Math.pow(Math.max(0, 0.25 - u) / 0.25, 2) * 0.7 + 0.06 * Math.sin(Math.atan2(z, x) * 5);
      P.setXYZ(i, x * flare + Math.sin(u * 3.2) * 0.08, y, z * flare + Math.sin(u * 2.1 + 1) * 0.05);
    }
    g.computeVertexNormals();
    return g;
  }
  // A grass tuft: four tapered, bent blades, darker at the root and sunlit at the tip.
  function tuftGeometry() {
    const pos = [], col = [], idx = [], base = new THREE.Color(0x4f7424), tip = new THREE.Color(0xc2cf6a), c = new THREE.Color();
    for (let b = 0; b < 4; b++) {
      const a = b / 4 * Math.PI * 2 + 0.3, lean = 0.12 + (b % 3) * 0.07, h = 0.28 + (b % 2) * 0.12, w = 0.026;
      const ca = Math.cos(a), sa = Math.sin(a), ox = ca * 0.035, oz = sa * 0.035, v0 = pos.length / 3;
      const rows = [0, 0.5, 1];
      rows.forEach(function (u) {
        const ww = w * (1 - u * 0.92), bend = lean * u * u, y = h * u;
        // the blade's width runs across (perpendicular to its lean)
        pos.push(ox + ca * bend - sa * ww, y, oz + sa * bend + ca * ww, ox + ca * bend + sa * ww, y, oz + sa * bend - ca * ww);
        c.copy(base).lerp(tip, u);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      });
      for (let r = 0; r < rows.length - 1; r++) { const k = v0 + r * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Grass lit from above reads better than true blade normals (which flip dark on the back faces).
    const N = g.attributes.normal;
    for (let i = 0; i < N.count; i++) N.setXYZ(i, N.getX(i) * 0.3, 1, N.getZ(i) * 0.3);
    return g;
  }
  // The grass sways: a shader tweak on top of the standard material, bending tips by height.
  W.windT = { value: 0 };
  function swayMaterial(mat, amount) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uWindT = W.windT;
      sh.vertexShader = "uniform float uWindT;\n" + sh.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 ip = instanceMatrix[3].xyz;\n#else\nvec3 ip = vec3(0.0);\n#endif\n" +
        "float sw = sin(uWindT * 1.9 + ip.x * 0.6 + ip.z * 0.45) * 0.6 + sin(uWindT * 3.7 + ip.z * 1.3) * 0.4;\n" +
        "transformed.x += sw * " + amount.toFixed(3) + " * transformed.y * transformed.y;");
    };
    return mat;
  }

  let appleTex = null;
  function appleSkin() {
    if (appleTex) return appleTex;
    // Red with yellow streaks running stem to base (the lathe's v runs bottom to top).
    appleTex = canvasTex(256, 128, function (g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#9c1812"); gr.addColorStop(0.5, "#cf2a1e"); gr.addColorStop(1, "#b8301c");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w;
        g.strokeStyle = "rgba(240,190,70," + (0.08 + Math.random() * 0.18) + ")"; g.lineWidth = 1 + Math.random() * 3;
        g.beginPath(); g.moveTo(x, h * 0.1); g.bezierCurveTo(x + 6, h * 0.4, x - 6, h * 0.6, x + 2, h * 0.95); g.stroke();
      }
      for (let i = 0; i < 160; i++) { g.fillStyle = "rgba(255,230,170,0.35)"; g.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2); }
    });
    return appleTex;
  }

  const M = {};
  function mats() {
    if (M.wood) return M;
    M.wood = new THREE.MeshStandardMaterial({ color: 0x8b6239, roughness: 0.85 });
    M.darkWood = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.9 });
    M.straw = new THREE.MeshStandardMaterial({ map: straw(), roughness: 1 });
    M.face = new THREE.MeshStandardMaterial({ map: face(), roughness: 0.8 });
    M.white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 });
    M.apple = new THREE.MeshStandardMaterial({ map: appleSkin(), roughness: 0.38 });
    M.stem = new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.9 });
    M.leaf = new THREE.MeshStandardMaterial({ color: 0x3c8a2a, roughness: 0.8, side: THREE.DoubleSide });
    M.pumpkin = new THREE.MeshStandardMaterial({ color: 0xe8741c, roughness: 0.55, vertexColors: true });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.82 });
    M.boar = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 });
    M.boarDark = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 });
    M.snout = new THREE.MeshStandardMaterial({ color: 0xd9a08a, roughness: 0.7 });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    M.ring = new THREE.MeshBasicMaterial({ map: boarRing(), transparent: true, depthWrite: false });
    M.rail = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.5, metalness: 0.6 });
    M.flag = new THREE.MeshStandardMaterial({ color: 0xff5a2a, roughness: 0.8, side: THREE.DoubleSide });
    M.line = new THREE.MeshBasicMaterial({ color: 0xf6f3e8 });
    return M;
  }

  // ------------------------------------------------------------------ the range (built once)
  W.build = function (V) {
    mats();
    const sim = SB.CFG, g = new THREE.Group();
    // light: low autumn sun from the side-front, a warm sky
    const hemi = new THREE.HemisphereLight(0xd8e8ff, 0x5a4a2a, 0.85);
    g.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
    sun.position.set(-22, 30, 12);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 110;   // follows the shooter (W.update)
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    g.add(sun); g.add(sun.target);
    W.sun = sun;

    // sky dome with a gradient
    const skyGeo = new THREE.SphereGeometry(400, 24, 12);
    const cols = [], P = skyGeo.attributes.position, top = new THREE.Color(0x5d93d6), hor = new THREE.Color(0xf3dcb8), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 400; c.copy(hor).lerp(top, Math.pow(Math.max(0, y), 0.55)); cols.push(c.r, c.g, c.b); }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    V.scene.fog = new THREE.Fog(0xe9dcc4, 70, 260);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grass(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    g.add(ground);
    // the mowed arena: a lighter disc, a white ring on its edge, and a start pad for each archer
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(sim.ARENA_R + 3, 96), new THREE.MeshStandardMaterial({ map: grass(), color: 0xe4f6cc, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.003; lawn.receiveShadow = true;
    g.add(lawn);
    const ring = new THREE.Mesh(new THREE.RingGeometry(sim.ARENA_R + 3, sim.ARENA_R + 3.12, 128), M.line);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; g.add(ring);
    W.flags = [];
    // trees: autumn colours, a ring round the field and a treeline far down range
    // (instanced: one draw call for the trunks and one per leaf colour, not ~400 meshes; the UHD 600 laptop needs it)
    // Crowns are smooth lumpy balls (welded, subdivided); the far treeline uses a lighter version of each.
    const leafCols = [0xd9822b, 0xc4561f, 0xe8b23a, 0x9c3b1a, 0x6f8f2f, 0xb8a032];
    const trunkGeo = trunkGeometry(), crownNear = [crownGeometry(2, 0.7), crownGeometry(2, 2.9)], crownFar = crownGeometry(1, 1.3);
    const trunks = [], near = leafCols.map(() => [[], []]), far = leafCols.map(() => []);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    function tree(x, z, s, isFar) {
      trunks.push(m4.compose(v3.set(x, 1.5 * s, z), q.setFromEuler(e3.set(0, rnd(0, 6.3), 0)), s3.set(s, s, s)).clone());
      const n = 2 + (Math.random() * 2 | 0);
      for (let k = 0; k < n; k++) {
        const cs = rnd(0.75, 1.15) * s, ci = (Math.random() * leafCols.length) | 0;
        const mx = m4.compose(v3.set(x + rnd(-0.7, 0.7) * s, (3.4 + k * 0.7) * s, z + rnd(-0.7, 0.7) * s), q.setFromEuler(e3.set(rnd(-0.3, 0.3), rnd(0, 6.3), rnd(-0.3, 0.3))), s3.set(cs, cs * rnd(0.85, 1.1), cs)).clone();
        if (isFar) far[ci].push(mx); else near[ci][k % 2].push(mx);
      }
    }
    // (a ring all round: the targets sit out to ~45 m, so the near trees start beyond that)
    for (let i = 0; i < 90; i++) { const a = rnd(0, 6.283), r = rnd(72, 110); tree(Math.cos(a) * r, Math.sin(a) * r, rnd(1.4, 2.4), true); }
    for (let i = 0; i < 34; i++) { const a = rnd(0, 6.283), r = rnd(50, 64); tree(Math.cos(a) * r, Math.sin(a) * r, rnd(1.1, 1.8)); }
    function instanced(geo, mat, list, shadow) {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow; im.receiveShadow = true;
      g.add(im);
      return im;
    }
    const barkMat = new THREE.MeshStandardMaterial({ map: bark(), roughness: 0.95 });
    instanced(trunkGeo, barkMat, trunks, true);
    leafCols.forEach(function (col, i) {
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, vertexColors: true });
      instanced(crownNear[0], mat, near[i][0], true);
      instanced(crownNear[1], mat, near[i][1], true);
      instanced(crownFar, mat, far[i], false);
    });
    // distant hills: smooth, gently lumpy domes, greener at the foot and paler at the top
    for (let i = 0; i < 9; i++) {
      const R = rnd(40, 70), hg = new THREE.SphereGeometry(R, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2), P = hg.attributes.position, hc = [];
      const lo = new THREE.Color(0x667a38), hi = new THREE.Color(0xa8a45c), c = new THREE.Color(), seed = rnd(0, 9);
      for (let j = 0; j < P.count; j++) {
        const x = P.getX(j), y = P.getY(j), z = P.getZ(j), k = 1 + 0.07 * lumps(x / R, y / R, z / R, 4, seed);
        P.setXYZ(j, x * k, y * k, z * k);
        c.copy(lo).lerp(hi, Math.min(1, y / R + 0.1 * lumps(x / R, 0, z / R, 9, seed)));
        hc.push(c.r, c.g, c.b);
      }
      hg.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3));
      hg.computeVertexNormals();
      const h = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
      const ha = i / 9 * 6.283 + rnd(-0.2, 0.2), hr = rnd(190, 250);
      h.position.set(Math.cos(ha) * hr, -6, Math.sin(ha) * hr); h.scale.y = rnd(0.25, 0.45);
      g.add(h);
    }
    // Grass tufts off the mowed lanes (the lanes stay short so the targets read), swaying in the wind.
    // (the arena itself stays mowed so the targets read; the grass grows outside it)
    const tufts = [], inner = sim.ARENA_R + 3.6;
    for (let i = 0; i < 2600; i++) {
      const a = rnd(0, 6.283), r = inner + Math.pow(Math.random(), 1.4) * 40, s = rnd(0.7, 1.5);
      tufts.push(m4.compose(v3.set(Math.cos(a) * r, 0, Math.sin(a) * r), q.setFromEuler(e3.set(0, rnd(0, 6.3), 0)), s3.set(s, s * rnd(0.8, 1.3), s)).clone());
    }
    const grassMat = swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), 0.35);
    const grassIM = instanced(tuftGeometry(), grassMat, tufts, false);
    grassIM.receiveShadow = false;
    W.grass = grassIM;
    // round hay bales round the edge of the arena (a few gaps), instanced
    const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 28, 1), bales = [];
    for (let i = 0; i < 48; i++) {
      if (i % 7 === 3) continue;
      const a = i / 48 * 6.283, r = sim.ARENA_R + 4.4;
      bales.push(m4.compose(v3.set(Math.cos(a) * r, 0.75, Math.sin(a) * r), q.setFromEuler(e3.set(0, Math.PI / 2 - a, Math.PI / 2)), s3.set(1, 1, 1)).clone());
    }
    instanced(baleGeo, M.straw, bales, true);
    adBoards(g, sim);

    V.scene.add(g);
    W.group = g;
    W.stage = null;
    return W;
  };

  // Advertising boards round the field (the developer's CTSG seal and the HopLobby primary logo, both drawn
  // unaltered with clear space), plus a banner on THE WALL and one on the tower. Scenery only: arrows fly through.
  function loadImg(src) { return new Promise(function (res) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function adTextures() {
    const mk = function () {
      const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 256;
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const g = cv.getContext("2d");
      g.fillStyle = "#14100b"; g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = "#ffd52e"; g.lineWidth = 10; g.strokeRect(8, 8, 1008, 240);
      return { g: g, t: t };
    };
    const A = mk(), B = mk(), C = mk();
    // draw an image inside a box without stretching it
    const fit = function (g, img, x, y, w, h) { const k = Math.min(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k; g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); };
    Promise.all([loadImg("assets/brand/ctsg-seal-color-512.png"), loadImg("assets/brand/hoplobby-primary-on-dark-800.png")]).then(function (im) {
      const seal = im[0], hop = im[1];
      if (seal) {
        fit(A.g, seal, 34, 28, 200, 200);
        A.g.fillStyle = "#fff4dc"; A.g.textBaseline = "middle"; A.g.font = "bold 62px 'Trebuchet MS', sans-serif"; A.g.fillText("CALAMITY TECH", 262, 98);
        A.g.fillStyle = "#ffd52e"; A.g.fillText("SOLUTIONS GROUP", 262, 166);
        fit(C.g, seal, 60, 32, 192, 192);
      }
      if (hop) { fit(B.g, hop, 112, 48, 800, 160); fit(C.g, hop, 300, 56, 660, 144); }
      [A, B, C].forEach(function (o) { o.t.needsUpdate = true; });
    });
    return [C.t, A.t, B.t];
  }
  function adBoards(g, sim) {
    const tex = adTextures();
    const mats = tex.map(function (t) { return new THREE.MeshBasicMaterial({ map: t }); });
    const back = new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 0.9 });
    const frame = new THREE.BoxGeometry(4.8, 1.3, 0.1), post = new THREE.BoxGeometry(0.1, 1.5, 0.1), face = new THREE.PlaneGeometry(4.6, 1.15);
    const N = 20, r = sim.ARENA_R + 3.3;
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2, b = new THREE.Group();
      const f = new THREE.Mesh(frame, back); f.position.y = 1.0; b.add(f);
      const p = new THREE.Mesh(face, mats[i % 3]); p.position.set(0, 1.0, 0.06); b.add(p);
      [-2.1, 2.1].forEach(function (x) { const s = new THREE.Mesh(post, back); s.position.set(x, 0.75, -0.05); b.add(s); });
      b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      b.lookAt(0, 0, 0);
      g.add(b);
    }
    const banner = function (w, h, x, y, z, ry, mat) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
    };
    banner(5.2, 1.3, 0, 0.67, -15 + 0.37, 0, mats[0]);                                 // THE WALL, the side the archers stand on
    banner(2.0, 0.5, 24 - 1.12, 4.1, 10 + 0.0, -Math.PI / 2, mats[0]);                     // the tower, facing the arena
  }

  function sign(text, w, h, bg, fg) {
    const t = canvasTex(w, h, function (g) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = fg; g.font = "bold " + Math.round(h * 0.55) + "px 'Trebuchet MS', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w / h * 0.5, 0.5), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    return m;
  }
  function bunting(g, x, s) {
    const cols = [0xe2302b, 0xffd52e, 0x2a8fe0, 0xffffff, 0x3fcf6a];
    // One mesh: every pennant's triangle in a single geometry with vertex colours.
    const pos = [], col = [], c = new THREE.Color();
    let k = 0;
    for (let z = 2; z > -9; z -= 0.42, k++) {
      const sag = Math.sin(((z + 9) / 11) * Math.PI) * 0.35, y = 3.0 - sag, xx = x + s * 0.02;
      pos.push(xx, y, z - 0.13, xx, y, z + 0.13, xx, y - 0.26, z);
      c.set(cols[k % cols.length]);
      for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })));
  }

  // ------------------------------------------------------------------ stage props
  let bossGeo = null, pinGeo = null, strapGeo = null;
  function bossGeometry() {
    if (bossGeo) return bossGeo;
    // 1.5 m square, 0.36 m deep, edges rounded off (extruded rounded square with a bevel), centred.
    const s = 0.75 - 0.06 - 0.035, r = 0.06, sh = new THREE.Shape();   // the bevel adds 0.035 all round
    sh.moveTo(-s, -s - r); sh.lineTo(s, -s - r); sh.quadraticCurveTo(s + r, -s - r, s + r, -s);
    sh.lineTo(s + r, s); sh.quadraticCurveTo(s + r, s + r, s, s + r);
    sh.lineTo(-s, s + r); sh.quadraticCurveTo(-s - r, s + r, -s - r, s);
    sh.lineTo(-s - r, -s); sh.quadraticCurveTo(-s - r, -s - r, -s, -s - r);
    bossGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 5, curveSegments: 8 });
    bossGeo.center();
    return bossGeo;
  }
  // A straw boss on an easel, the face pinned on its front. The boss scales with the face (a 0.61 m face sits on the 1.5 m boss);
  // the group's +z is the face's normal (the sim's plane).
  function standFor(it) {
    const g = new THREE.Group(), k = Math.max(0.4, it.r / 0.61);
    const boss = new THREE.Mesh(bossGeometry(), M.straw);
    boss.scale.setScalar(k);
    boss.position.set(0, 0, -0.18 * k); boss.castShadow = boss.receiveShadow = true;
    g.add(boss);
    const f = new THREE.Mesh(new THREE.CircleGeometry(it.r, 128), M.face);
    f.position.z = 0.004; g.add(f);
    // pins at the face's corners and a pair of binding straps round the boss
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) {
      const pin = new THREE.Mesh(pinGeo || (pinGeo = new THREE.SphereGeometry(0.014, 12, 8)), M.rail);
      pin.position.set(p[0] * it.r * 0.74, p[1] * it.r * 0.74, 0.01); g.add(pin);
    });
    [-0.5, 0.5].forEach(function (y) {
      const strap = new THREE.Mesh(strapGeo || (strapGeo = new THREE.BoxGeometry(1.53, 0.05, 0.37)), M.darkWood);
      strap.scale.setScalar(k);
      strap.position.set(0, y * k, -0.186 * k); strap.castShadow = true; g.add(strap);   // its front sits just behind the face
    });
    // legs down to the ground (the face is high up on some of these)
    const h = it.y;
    const legGeo = new THREE.CylinderGeometry(0.04, 0.05, h + 0.3, 12);
    [[-0.6 * k, 0.12], [0.6 * k, 0.12], [0, -0.9]].forEach(function (p, i) {
      const leg = new THREE.Mesh(legGeo, M.wood);
      leg.position.set(p[0], -h / 2 + 0.1, p[1] * (i === 2 ? 1 + h * 0.15 : 1) - 0.2 * k);
      leg.rotation.x = i === 2 ? -Math.min(0.5, 0.42 + h * 0.03) : 0.12;
      leg.castShadow = true;
      g.add(leg);
    });
    g.position.set(it.x, it.y, it.z);
    g.rotation.y = Math.atan2(it.nx, it.nz);
    return g;
  }
  const appleGeos = {};
  function appleGeometry(r) {
    if (appleGeos[r]) return appleGeos[r];
    // Apple profile: fuller at the shoulders, dimpled at the stem and the base.
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 28, c = Math.cos(a), s = Math.sin(a);
      const dip = r * 0.35 * Math.pow(Math.max(0, (Math.abs(s) - 0.75) / 0.25), 2);
      const rr = r * c * (1 + 0.08 * s), y = r * 0.9 * s - Math.sign(s) * dip;
      pts.push(new THREE.Vector2(Math.max(0.0001, rr), y));
    }
    return (appleGeos[r] = new THREE.LatheGeometry(pts, 40));
  }
  let leafGeo = null;
  function leafGeometry() {
    if (leafGeo) return leafGeo;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.quadraticCurveTo(0.012, 0.01, 0.034, 0); sh.quadraticCurveTo(0.012, -0.01, 0, 0);
    return (leafGeo = new THREE.ShapeGeometry(sh, 8));
  }
  function appleFor(it) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, it.cy - it.r, 12), M.wood);
    post.position.y = -(it.cy - it.r) / 2 - it.r; post.castShadow = true; g.add(post);
    const fruit = new THREE.Group();
    const a = new THREE.Mesh(appleGeometry(it.r), M.apple); a.castShadow = true; fruit.add(a);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.004, 0.032, 8), M.stem); st.position.set(0.003, it.r * 0.92, 0); st.rotation.z = -0.25; fruit.add(st);
    const lf = new THREE.Mesh(leafGeometry(), M.leaf); lf.position.set(0.006, it.r * 0.98, 0); lf.rotation.set(0.3, 0.4, 0.6); fruit.add(lf);
    g.add(fruit);
    g.userData.breakable = fruit;
    g.position.set(it.cx, it.cy, it.cz);
    return g;
  }
  function pumpkinFor(it) {
    const g = new THREE.Group();
    if (!it.sits) {
      const bale = new THREE.Mesh(new THREE.BoxGeometry(0.9, it.cy - it.r * 0.8, 0.55, 4, 4, 4), M.straw);
      bale.position.y = -(it.cy - it.r * 0.8) / 2 - it.r * 0.8; bale.castShadow = bale.receiveShadow = true; g.add(bale);
    }
    const p = new THREE.Group();
    // ribbed: a lathe of a bumpy profile
    const pts = [];
    // dimpled top and bottom, like the apple, then ten deep ribs; the grooves shade darker
    for (let i = 0; i <= 32; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 32, s = Math.sin(a), dip = it.r * 0.2 * Math.pow(Math.max(0, (Math.abs(s) - 0.7) / 0.3), 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * it.r), s * it.r * 0.82 - Math.sign(s) * dip));
    }
    const lg = new THREE.LatheGeometry(pts, 80);
    const P = lg.attributes.position, pc = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), ang = Math.atan2(z, x), groove = Math.pow(Math.abs(Math.cos(ang * 5)), 8), k = 1 - 0.09 * groove;
      P.setX(i, x * k); P.setZ(i, z * k);
      const sh = 1 - 0.32 * groove;
      pc.push(sh, sh * (0.96 + 0.04 * Math.sin(ang * 13)), sh);
    }
    lg.setAttribute("color", new THREE.Float32BufferAttribute(pc, 3));
    lg.computeVertexNormals();
    const body = new THREE.Mesh(lg, M.pumpkin); body.castShadow = true; p.add(body);
    // a curled stem
    const sp = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; sp.push(new THREE.Vector3(Math.sin(u * 1.6) * it.r * 0.12, it.r * (0.62 + u * 0.36), Math.sin(u * 2.4) * it.r * 0.04)); }
    const st = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 16, it.r * 0.07, 10, false), M.stem); p.add(st);
    g.add(p);
    g.userData.breakable = p;
    g.position.set(it.cx, it.cy, it.cz);
    return g;
  }
  let bottleGeo = null;
  function bottleFor(it) {
    const g = new THREE.Group();
    if (!bottleGeo) {
      // A smooth wine-bottle profile: rounded heel, body, an S-curved shoulder, the neck and a lip.
      const r = it.r, h = it.h, pts = [new THREE.Vector2(0, 0.004)];
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 * i / 6; pts.push(new THREE.Vector2(r - 0.008 + 0.008 * Math.sin(a), 0.008 - 0.008 * Math.cos(a))); }
      pts.push(new THREE.Vector2(r, h * 0.55));
      for (let i = 1; i <= 12; i++) { const u = i / 12, e = u * u * (3 - 2 * u); pts.push(new THREE.Vector2(r + (r * 0.32 - r) * e, h * (0.55 + 0.25 * u))); }
      pts.push(new THREE.Vector2(r * 0.32, h * 0.95), new THREE.Vector2(r * 0.38, h * 0.955), new THREE.Vector2(r * 0.38, h), new THREE.Vector2(r * 0.25, h));
      bottleGeo = new THREE.LatheGeometry(pts, 40);
      bottleGeo.translate(0, -h / 2, 0);
    }
    const b = new THREE.Mesh(bottleGeo, M.glass); b.castShadow = true;
    g.add(b);
    g.userData.breakable = b;
    g.position.set(it.cx, it.cy, it.cz);
    return g;
  }
  function fenceFor(L, d, y) {
    // A rail fence across the lane the bottles stand on.
    const g = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(SB.CFG.LANE_W - 0.4, 0.06, 0.14), M.wood);
    rail.position.y = y; rail.castShadow = rail.receiveShadow = true; g.add(rail);
    const low = rail.clone(); low.position.y = y * 0.45; g.add(low);
    [-1, 1].forEach(function (s) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, y + 0.1, 0.1), M.darkWood); p.position.set(s * (SB.CFG.LANE_W / 2 - 0.3), (y + 0.1) / 2, 0); p.castShadow = true; g.add(p); });
    g.position.set(L.x, 0, -d);
    return g;
  }
  function boarFor(it) {
    // A foam boar on a little cart; it faces the way it runs (scale.x flips it), the heart ring painted on its side.
    const g = new THREE.Group(), body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), M.boar); torso.scale.set(1.25, 0.68, 0.55); torso.castShadow = true; body.add(torso);
    // a bristly ridge along the back
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), M.boarDark); ridge.scale.set(1.05, 0.3, 0.16); ridge.position.set(0.05, 0.25, 0); body.add(ridge);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 24), M.boar); head.scale.set(1.25, 0.95, 0.9); head.position.set(0.66, 0.04, 0); head.castShadow = true; body.add(head);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.16, 0.3, 24), M.boar); muzzle.rotation.z = -Math.PI / 2; muzzle.position.set(0.88, -0.01, 0); body.add(muzzle);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24), M.snout); snout.rotation.z = Math.PI / 2; snout.position.set(1.045, -0.01, 0); body.add(snout);
    [-1, 1].forEach(function (s) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 12), M.white); tusk.position.set(0.93, -0.06, s * 0.08); tusk.rotation.z = -2.4; body.add(tusk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), M.eye); eye.position.set(0.8, 0.12, s * 0.15); body.add(eye);
    });
    const earGeo = new THREE.ConeGeometry(0.07, 0.16, 16);
    [-1, 1].forEach(function (s) { const e = new THREE.Mesh(earGeo, M.boar); e.position.set(0.56, 0.27, s * 0.12); e.rotation.x = s * 0.35; body.add(e); });
    const legGeo = new THREE.CylinderGeometry(0.055, 0.04, 0.42, 16), hoofGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.06, 16);
    [[0.38, 0.14], [0.38, -0.14], [-0.38, 0.14], [-0.38, -0.14]].forEach(function (p) {
      const l = new THREE.Mesh(legGeo, M.boar); l.position.set(p[0], -0.48, p[1]); l.castShadow = true; body.add(l);
      const hf = new THREE.Mesh(hoofGeo, M.boarDark); hf.position.set(p[0], -0.7, p[1]); body.add(hf);
    });
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 8, 16, Math.PI * 1.5), M.boarDark); tail.position.set(-0.64, 0.12, 0); body.add(tail);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), M.ring); ring.position.set(0.2, 0.02, 0.28); body.add(ring);
    g.add(body);
    g.userData.body = body;
    g.position.set(it.cx, it.cy, it.cz);
    return g;
  }
  function railFor(L, it) {
    const g = new THREE.Group();
    [-0.18, 0.18].forEach(function (z) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(it.span * 2 + 2.6, 0.05, 0.05), M.rail);
      r.position.set(0, 0.03, z); r.receiveShadow = true; g.add(r);
    });
    // straw bales at each end of the run (the boar "hides" behind them as it turns)
    [-1, 1].forEach(function (s) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.8, 3, 3, 3), M.straw);
      b.position.set(s * (it.span + 1.6), 0.45, 0.2); b.castShadow = b.receiveShadow = true; g.add(b);
    });
    g.position.set(L.x + it.x, 0, it.cz);
    return g;
  }

  const balloonCols = [0xe2302b, 0x2a8fe0, 0x3fcf6a, 0xc46bff, 0xff8a1e, 0xff5fa8];

  // Solid boxes: planked wood with a dark cap and corner posts.
  let plankTex = null;
  function planks() {
    if (plankTex) return plankTex;
    plankTex = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = "#9a6c3e"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        const y = i * h / 6;
        g.fillStyle = i % 2 ? "rgba(120,80,40,0.35)" : "rgba(210,160,100,0.22)"; g.fillRect(0, y, w, h / 6);
        g.fillStyle = "rgba(40,24,10,0.7)"; g.fillRect(0, y, w, 2);
        for (let k = 0; k < 14; k++) { g.strokeStyle = "rgba(60,36,14,0.25)"; g.lineWidth = 1; const yy = y + 4 + Math.random() * (h / 6 - 8); g.beginPath(); g.moveTo(Math.random() * w, yy); g.lineTo(Math.random() * w, yy + Math.random() * 2 - 1); g.stroke(); }
      }
    });
    return plankTex;
  }
  function boxMesh(b) {
    const g = new THREE.Group();
    if (!M.plank) M.plank = new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), M.plank);
    body.position.y = b.h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.14, 0.1, b.d + 0.14), M.darkWood);
    cap.position.y = b.h + 0.05; cap.castShadow = cap.receiveShadow = true; g.add(cap);
    const post = new THREE.BoxGeometry(0.16, b.h, 0.16);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      const p = new THREE.Mesh(post, M.darkWood);
      p.position.set(c[0] * (b.w / 2 - 0.02), b.h / 2, c[1] * (b.d / 2 - 0.02)); p.castShadow = true; g.add(p);
    });
    if (b.kind === "wall") {
      const s = sign("THE WALL", 256, 96, "#7a1410", "#ffe9b0");
      s.scale.set(2.2, 2.2, 1); s.position.set(0, b.h * 0.55, b.d / 2 + 0.02); g.add(s);
      const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -b.d / 2 - 0.02; g.add(s2);
    }
    g.position.set(b.x, 0, b.z);
    return g;
  }
  function fenceAt(p) {
    const g = new THREE.Group();
    const len = p.x1 - p.x0;
    [p.y, p.y * 0.45].forEach(function (y) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.12), M.wood);
      rail.position.set((p.x0 + p.x1) / 2, y, p.z); rail.castShadow = rail.receiveShadow = true; g.add(rail);
    });
    for (let i = 0; i <= 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, p.y + 0.15, 0.12), M.darkWood);
      post.position.set(p.x0 + len * i / 3, (p.y + 0.15) / 2, p.z); post.castShadow = true; g.add(post);
    }
    return g;
  }
  // The "this one" marker over the target to match: a bobbing gold arrow, seen through walls.
  function markerSprite() {
    const t = canvasTex(128, 160, function (g, w, h) {
      g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 8;
      g.fillStyle = "#ffd52e"; g.strokeStyle = "#7a4a00"; g.lineWidth = 8; g.lineJoin = "round";
      g.beginPath(); g.moveTo(w * 0.3, 14); g.lineTo(w * 0.7, 14); g.lineTo(w * 0.7, h * 0.45); g.lineTo(w * 0.9, h * 0.45); g.lineTo(w * 0.5, h - 16); g.lineTo(w * 0.1, h * 0.45); g.lineTo(w * 0.3, h * 0.45); g.closePath();
      g.stroke(); g.fill();
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.renderOrder = 12;
    return s;
  }
  W.buildStage = function (V, sim) {
    if (W.stage) { V.scene.remove(W.stage.group); }
    const S = { group: new THREE.Group(), items: [] };
    sim.boxes.forEach((b) => S.group.add(boxMesh(b)));
    sim.props.forEach((p) => { if (p.k === "fence") S.group.add(fenceAt(p)); });
    sim.targets.forEach(function (T) {
      const it = Object.assign({}, T, { cx: T.x, cy: T.y, cz: T.z });
      let m = null;
      if (T.k === "face") m = standFor(it);
      else if (T.k === "apple") m = appleFor(it);
      else if (T.k === "pumpkin") m = pumpkinFor(it);
      else if (T.k === "bottle") m = bottleFor(it);
      else if (T.k === "balloon") { m = balloonMesh(it); m.position.set(T.x, T.y, T.z); }
      if (m) { S.group.add(m); S.items[T.id] = m; }
    });
    S.marker = markerSprite(); S.marker.visible = false; S.group.add(S.marker);
    V.scene.add(S.group);
    W.stage = S;
  };

  // Balloon: a teardrop (narrowing toward the knot), smooth.
  const balloonGeo = (function () {
    const pts = [];
    for (let i = 0; i <= 32; i++) { const a = -Math.PI / 2 + Math.PI * i / 32, s = Math.sin(a); pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * (1 - 0.18 * Math.max(0, -s))), s * 1.18)); }
    return new THREE.LatheGeometry(pts, 40);
  })();
  function balloonMesh(b) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(balloonGeo, new THREE.MeshStandardMaterial({ color: b.gold ? 0xffc93a : balloonCols[b.col !== undefined ? b.col : (Math.random() * balloonCols.length) | 0], roughness: 0.25, metalness: b.gold ? 0.6 : 0.05, emissive: b.gold ? 0x6a4a00 : 0x000000 }));
    m.scale.setScalar(b.r); m.castShadow = true;
    g.add(m);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(b.r * 0.12, b.r * 0.2, 16), m.material); knot.position.y = -b.r * 1.22; knot.rotation.x = Math.PI; g.add(knot);
    const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -b.r * 1.3, 0), new THREE.Vector3(0.03, -b.r * 1.3 - 0.5, 0.02), new THREE.Vector3(-0.02, -b.r * 1.3 - 0.9, 0)]);
    g.add(new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xffffff })));
    return g;
  }

  // Per frame: grass in the wind, balloons bobbing, broken things hidden, the "match this" marker, the sun's shadow box following the shooter.
  const _mp = new THREE.Vector3();
  W.update = function (V, sim, dt, t) {
    W.windT.value = t;
    if (!W.stage || !sim.targets) return;
    for (const T of sim.targets) {
      const m = W.stage.items[T.id];
      if (!m) continue;
      if (T.k === "balloon") {
        m.visible = !T.broken;
        m.position.y = T.y + Math.sin(t * 1.1 + T.id * 1.7) * 0.12;
        m.rotation.z = Math.sin(t * 1.3 + T.id) * 0.1;
      } else if (m.userData.breakable) m.userData.breakable.visible = !T.broken;
    }
    const mk = W.stage.marker, G = sim.goalTarget ? sim.goalTarget() : null;
    mk.visible = !!G && (sim.phase === "turn" || sim.phase === "result");
    if (G) {
      const d = V.camera.position.distanceTo(_mp.set(G.x, G.y, G.z)), s = Math.max(0.9, d * 0.075);
      mk.scale.set(s * 0.8, s, 1);
      mk.position.set(G.x, G.y + G.r + s * 0.75 + Math.sin(t * 3.2) * s * 0.08, G.z);
    }
    const cur = sim.cur ? sim.cur() : null;
    if (cur && W.sun) {
      W.sun.target.position.set(cur.x, 0, cur.z);
      W.sun.position.set(cur.x - 22, 30, cur.z + 12);
    }
  };  SB.World = W;
})(globalThis.SB);
