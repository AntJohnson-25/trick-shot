// Archers' bodies. A body is a packed Mixamo character (SB.BODY, tools/pack-char.py, from
// Snowball Squabble) driven by the longbow clips (SB.CLIPS, tools/build-clips.mjs). Forked from
// Snowball Squabble's body.js: model loading and clip sampling are the same; the posing is the
// archer's draw cycle, and each body carries a longbow, a quiver and an arrow on the string.
//
// Mixamo bodies face +z with +x their left, so the root turns by yaw + PI (the sim's yaw 0
// looks along -z).
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const THREE = globalThis.THREE;
  const Bo = {};
  const HEAD_M = 1.78;          // every body is scaled so its head top is here, metres
  const LOOPS = { idle: 1, idle_look: 1, idle_examine: 1, aim: 0, unarmed: 1, run_f: 1, run_b: 1, run_l: 1, run_r: 1, fall: 1 };
  // Crossfade into a state, seconds (draw -> aim is seamless: the draw ends where the aim starts).
  const BLEND = { idle: 0.28, draw: 0.16, aim: 0.0, recoil: 0.05, run_f: 0.16, run_b: 0.16, run_l: 0.16, run_r: 0.16, fall: 0.12 };
  const RUN_SPEED = { run_f: 2.84, run_b: 2.27, run_l: 2.52, run_r: 2.53 };   // m/s the clip's feet cover (travel / duration)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

  // ------------------------------------------------------------------ model data
  const models = {};
  function buildModel(id) {
    const D = SB.BODY && SB.BODY[id];
    if (!D) return null;
    const M = { id: id, D: D, BN: {} };
    D.bones.forEach(function (b, i) { M.BN[b.name] = i; });
    if (M.BN.Hips === undefined || M.BN.RightHand === undefined || M.BN.LeftHand === undefined || M.BN.Spine === undefined) return null;
    const raw = atob(D.bin), bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    const nv = D.verts, buf = bin.buffer;
    let o = 0;
    function take(Type, n) { const a = new Type(buf, o, n); o += n * Type.BYTES_PER_ELEMENT; return a; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(take(Float32Array, nv * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(take(Float32Array, nv * 2), 2));
    geo.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(take(Int8Array, nv * 4), 4), 3, 0, true));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(take(Uint8Array, nv * 4), 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(take(Uint8Array, nv * 4), 4, true));
    geo.setIndex(new THREE.BufferAttribute(take(D.wideIndex ? Uint32Array : Uint16Array, D.index), 1));
    // Painted bodies (Ant) append RGBA vertex colours after the index.
    if (D.colors) geo.setAttribute("color", new THREE.BufferAttribute(take(Uint8Array, nv * 4), 4, true));
    let start = 0;
    D.groups.forEach(function (count, m) { geo.addGroup(start, count, m); start += count; });
    geo.computeBoundingSphere();
    M.geo = geo;
    M.tex = D.materials.map(function (m) {
      const t = {};
      Object.keys(m.tex).forEach(function (slot) {
        const img = new Image(), tx = new THREE.Texture(img);
        if (slot === "map") tx.colorSpace = THREE.SRGBColorSpace;
        tx.anisotropy = 4;
        img.onload = function () { tx.needsUpdate = true; };
        img.src = m.tex[slot];
        t[slot] = tx;
      });
      return t;
    });
    D.bin = null;
    M.mats = null;
    M.inverses = D.inverses.map(function (e) { return new THREE.Matrix4().fromArray(e); });
    M.nb = D.bones.length;
    M.rest = new Float32Array(M.nb * 4);
    D.bones.forEach(function (b, i) { M.rest.set(b.q, i * 4); });
    M.hipsRest = D.bones[M.BN.Hips].p;
    // Head-top height in the rest pose -> scale to metres.
    const top = M.BN.HeadTop_End !== undefined ? M.BN.HeadTop_End : M.BN.Head;
    const objs = D.bones.map(function (b) {
      const ob = new THREE.Object3D();
      ob.position.fromArray(b.p); ob.quaternion.fromArray(b.q); ob.scale.fromArray(b.s);
      return ob;
    });
    const holder = new THREE.Object3D();
    D.bones.forEach(function (b, i) { (b.parent >= 0 ? objs[b.parent] : holder).add(objs[i]); });
    holder.updateMatrixWorld(true);
    const headY = new THREE.Vector3().setFromMatrixPosition(objs[top].matrixWorld).y;
    M.scale = HEAD_M / (headY > 1 ? headY : (D.height || 180));
    // Clips -> per-bone frame arrays; hips height scaled to this body.
    M.clips = {};
    Object.keys(SB.CLIPS).forEach(function (k) {
      const c = SB.CLIPS[k];
      const cl = { key: k, dur: c.dur, n: c.n, q: [], hp: null, s: M.hipsRest[1] / (c.hipsRest || M.hipsRest[1]), loop: !!LOOPS[k] };
      c.tracks.forEach(function (tr) {
        if (tr.k === "hp") { cl.hp = new Float32Array(tr.v); return; }
        const bi = M.BN[tr.b];
        if (bi !== undefined) cl.q.push({ i: bi, v: new Float32Array(tr.v) });
      });
      M.clips[k] = cl;
    });
    return M;
  }
  function model(id) {
    if (models[id] === undefined) models[id] = buildModel(id) || null;
    return models[id];
  }
  function materials(M) {
    if (!M.mats) {
      M.mats = M.tex.map(function (t) {
        const m = new THREE.MeshStandardMaterial({ map: t.map || null, normalMap: t.normalMap || null, roughness: 0.85, metalness: 0.02, vertexColors: !!M.D.colors });
        if (t.alphaMap) { m.alphaMap = t.alphaMap; m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
        return m;
      });
    }
    return M.mats;
  }

  // ------------------------------------------------------------------ clip sampling
  const QS = new Float32Array(4);
  function frameOf(cl, t) {
    const f = clamp(t * SB.CLIP_FPS, 0, cl.n - 1), a = Math.floor(f);
    return { a: a, b: Math.min(cl.n - 1, a + 1), u: f - a };
  }
  function sample(cl, t, out, w) {
    const F = frameOf(cl, t), a = F.a * 4, b = F.b * 4, u = F.u;
    for (let k = 0; k < cl.q.length; k++) {
      const tr = cl.q[k];
      if (w >= 1) THREE.Quaternion.slerpFlat(out, tr.i * 4, tr.v, a, tr.v, b, u);
      else {
        THREE.Quaternion.slerpFlat(QS, 0, tr.v, a, tr.v, b, u);
        THREE.Quaternion.slerpFlat(out, tr.i * 4, out, tr.i * 4, QS, 0, w);
      }
    }
  }
  function hipsY(cl, t, M) {
    if (!cl.hp) return M.hipsRest[1];
    const F = frameOf(cl, t), v = cl.hp;
    return (v[F.a * 3 + 1] + (v[F.b * 3 + 1] - v[F.a * 3 + 1]) * F.u) * cl.s;
  }
  const _aq = new THREE.Quaternion(), _sq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _av = new THREE.Vector3();
  const _fq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _pv = new THREE.Vector3(0, 0.95, 0), _pv2 = new THREE.Vector3();
  const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1);
  // Rotate a bone about an axis given in the body's own space, whatever its local axes are.
  function turn(c, bone, ax, ay, az, angle) {
    if (!bone || !angle) return;
    const par = bone.parent;
    par.updateWorldMatrix(true, false);
    c.body.getWorldQuaternion(_sq);
    par.getWorldQuaternion(_aq);
    _aq.premultiply(_sq.invert());
    _rq.setFromAxisAngle(_av.set(ax, ay, az), angle);
    bone.quaternion.premultiply(_aq).premultiply(_rq).premultiply(_aq.invert());
  }
  // Pose every bone from a clip frame (used for the gear fitting below).
  function poseAt(c, key, t) {
    const M = c.M, cl = M.clips[key];
    c.q.set(M.rest);
    if (cl) sample(cl, t, c.q, 1);
    for (let i = 0; i < M.nb; i++) c.bones[i].quaternion.fromArray(c.q, i * 4);
    c.bones[M.BN.Hips].position.set(M.hipsRest[0], cl ? hipsY(cl, t, M) : M.hipsRest[1], M.hipsRest[2]);
    c.root.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------ gear: longbow, string, arrow, quiver
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ced6, roughness: 0.35, metalness: 0.8 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.7 });
  const colMats = {};
  const colMat = (col) => colMats[col] || (colMats[col] = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, side: THREE.DoubleSide }));
  const BOW = { half: 0.8, brace: 0.17, limbBend: 0.16 };   // limb length (grip to tip, m), string-to-grip at rest, extra bend at full draw (rad)

  let arrowTipGeo = null, vaneGeo = null;
  // A shield-cut feather, 12 cm long and 3.6 cm tall, centred like the plane it replaces.
  function vaneGeometry() {
    if (vaneGeo) return vaneGeo;
    const sh = new THREE.Shape();
    sh.moveTo(-0.06, -0.018); sh.lineTo(0.06, -0.018); sh.quadraticCurveTo(0.03, 0.022, -0.035, 0.018); sh.quadraticCurveTo(-0.055, 0.012, -0.06, -0.018);
    return (vaneGeo = new THREE.ShapeGeometry(sh, 12));
  }
  // An arrow pointing along +z from its nock (z = 0) to its tip (z = len). Shared by the nocked and flying arrows.
  Bo.arrowMesh = function (col, len) {
    len = len || 0.78;
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, len, 12, 1, true), shaftMat);
    shaft.rotation.x = Math.PI / 2; shaft.position.z = len / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(arrowTipGeo || (arrowTipGeo = new THREE.ConeGeometry(0.011, 0.05, 16)), steel);
    tip.rotation.x = Math.PI / 2; tip.position.z = len + 0.02;
    g.add(tip);
    const vane = vaneGeometry();
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Mesh(vane, colMat(k ? 0xf2f2f2 : col));
      v.rotation.set(0, Math.PI / 2, 0);
      const holder = new THREE.Group();
      holder.rotation.z = k * Math.PI * 2 / 3;
      v.position.set(0, 0.022, 0.085);
      holder.add(v);
      g.add(holder);
    }
    return g;
  };

  function makeBow(col) {
    const g = new THREE.Group();
    // Riser and grip at the origin; limbs are pivoted at the riser ends so a draw can bend them back.
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.26, 0.045), wood);
    g.add(riser);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.11, 24), leather);
    g.add(grip);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.025, 24), colMat(col));
    wrap.position.y = 0.075; g.add(wrap);
    const limbs = [];
    [1, -1].forEach(function (s) {
      const piv = new THREE.Group();
      piv.position.y = 0.12 * s;
      // The limb: a gentle curve back toward the archer (-z), its tip a recurve-ish hook.
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10, y = u * (BOW.half - 0.12); pts.push(new THREE.Vector3(0, y * s, -BOW.brace * Math.pow(u, 1.8))); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 12, false), wood);
      piv.add(tube);
      const nockTip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), colMat(col));
      nockTip.position.copy(pts[10]); piv.add(nockTip);
      piv.userData.tip = pts[10].clone();
      g.add(piv);
      limbs.push(piv);
    });
    g.userData.limbs = limbs;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf6f1e3 }));
    string.frustumCulled = false;
    g.add(string);
    g.userData.string = string;
    return g;
  }

  function makeQuiver(col) {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.52, 28, 1, true), leather);
    tube.material = leather; g.add(tube);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 28, 1, true), colMat(col));
    band.position.y = 0.19; g.add(band);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.05, 28), leather);
    cap.rotation.x = Math.PI / 2; cap.position.y = -0.26; g.add(cap);
    // Arrows poking out of the top (their fletching shows over the shoulder).
    for (let k = 0; k < 6; k++) {
      // Nock up, tip down inside the tube: only the last ~16 cm and the fletching show.
      const a = Bo.arrowMesh(col, 0.6);
      a.rotation.x = Math.PI / 2;
      const ang = k / 6 * Math.PI * 2;
      a.position.set(Math.cos(ang) * 0.026, 0.26 + 0.14 + (k % 2) * 0.03, Math.sin(ang) * 0.026);
      g.add(a);
    }
    return g;
  }

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q1 = new THREE.Quaternion();
  // Put the bow in the bow hand, fitted at full draw: limbs vertical, arrow axis from the string hand through the grip.
  function fitGear(c, col) {
    const M = c.M, B = M.BN, bones = c.bones;
    poseAt(c, "aim", 0);
    const L = bones[B.LeftHand], R = bones[B.RightHand];
    const lp = new THREE.Vector3().setFromMatrixPosition(L.matrixWorld), rp = new THREE.Vector3().setFromMatrixPosition(R.matrixWorld);
    const fwd = lp.clone().sub(rp).normalize();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(fwd, -fwd.y).normalize();
    // A slight cant (top tipped away from the face), as archers hold it.
    up.applyAxisAngle(fwd, -0.12);
    const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
    _m.makeBasis(side, up, fwd);
    const want = new THREE.Quaternion().setFromRotationMatrix(_m);
    const bow = makeBow(col);
    L.add(bow);
    L.getWorldQuaternion(_q1);
    bow.quaternion.copy(_q1.invert().multiply(want));
    L.getWorldScale(_v1);
    bow.scale.setScalar(1 / _v1.x);
    // The grip sits in the palm: part way from the wrist toward the middle knuckle.
    const mid = B.LeftHandMiddle1 !== undefined ? new THREE.Vector3().setFromMatrixPosition(bones[B.LeftHandMiddle1].matrixWorld) : lp.clone().addScaledVector(fwd, 0.06);
    const gripW = lp.clone().lerp(mid, 0.75);
    bow.position.copy(L.worldToLocal(gripW.clone()));
    c.bow = bow;
    c.stringHand = bones[B.RightHandIndex2 !== undefined ? B.RightHandIndex2 : B.RightHandIndex1 !== undefined ? B.RightHandIndex1 : B.RightHand];
    // The arrow on the string lives in the bow's space.
    c.nocked = Bo.arrowMesh(col);
    c.nocked.visible = false;
    bow.add(c.nocked);

    // Quiver on the back, its top over the right shoulder (where the draw reaches).
    poseAt(c, "idle", 0);
    const sp = bones[B.Spine2 !== undefined ? B.Spine2 : B.Spine1 !== undefined ? B.Spine1 : B.Spine];
    const sw = new THREE.Vector3().setFromMatrixPosition(sp.matrixWorld);
    // Body space here = world (root unrotated): the body faces +z, +x is its left.
    const qv = makeQuiver(col);
    sp.add(qv);
    const centre = sw.clone().add(new THREE.Vector3(-0.07, 0.04, -0.17));
    const axis = new THREE.Vector3(-0.42, 1, -0.22).normalize();
    sp.getWorldQuaternion(_q1);
    qv.quaternion.copy(_q1.invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)));
    sp.getWorldScale(_v1);
    qv.scale.setScalar(1 / _v1.x);
    qv.position.copy(sp.worldToLocal(centre));
  }

  // Bend the limbs and lay the string through the nock point (bow space); put the arrow on it.
  function setString(c, drawn, showArrow) {
    const bow = c.bow, limbs = bow.userData.limbs, rest = -BOW.brace;
    let nz = rest, ny = 0;
    if (drawn) {
      c.stringHand.getWorldPosition(_v1);
      bow.worldToLocal(_v1);
      nz = Math.min(rest, _v1.z); ny = clamp(_v1.y, -0.06, 0.06);
    }
    const pull = clamp((rest - nz) / 0.6, 0, 1);
    // (+x rotation swings +y toward +z: the upper limb turns negative so its tip comes back toward the archer)
    limbs[0].rotation.x = -BOW.limbBend * pull;
    limbs[1].rotation.x = BOW.limbBend * pull;
    const P = bow.userData.string.geometry.attributes.position;
    limbs.forEach(function (piv, i) {
      _v2.copy(piv.userData.tip).applyEuler(piv.rotation).add(piv.position);
      P.setXYZ(i * 2, _v2.x, _v2.y, _v2.z);
    });
    P.setXYZ(1, 0, ny, nz);
    P.needsUpdate = true;
    c.nocked.visible = !!showArrow;
    if (showArrow) {
      // Nock on the string, shaft resting on the shelf just above the grip.
      c.nocked.position.set(0, ny, nz);
      _v3.set(0.012, 0.03, 0.2).sub(c.nocked.position).normalize();
      c.nocked.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), _v3);
    }
  }

  function nameTag(name, color) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 64;
    const g = cv.getContext("2d");
    g.font = "bold 34px 'Trebuchet MS', 'Arial Narrow', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.75)"; g.strokeText(name, 128, 34);
    g.fillStyle = "#" + new THREE.Color(color).getHexString(); g.fillText(name, 128, 34);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(1.0, 0.25, 1);
    s.renderOrder = 10;
    return s;
  }

  Bo.model = model;
  Bo.make = function (a, bodyId, color) {
    const M = model(bodyId);
    if (!M) return null;
    const root = new THREE.Group(), body = new THREE.Group();
    body.scale.setScalar(M.scale);
    root.add(body);
    const bones = M.D.bones.map(function (b) {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.fromArray(b.p); bone.quaternion.fromArray(b.q); bone.scale.fromArray(b.s);
      return bone;
    });
    M.D.bones.forEach(function (b, i) { (b.parent >= 0 ? bones[b.parent] : body).add(bones[i]); });
    const mesh = new THREE.SkinnedMesh(M.geo, materials(M));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    body.add(mesh);
    body.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, M.inverses), new THREE.Matrix4());
    const c = { M: M, root: root, body: body, bones: bones, mesh: mesh, q: new Float32Array(M.nb * 4), from: new Float32Array(M.nb * 4),
      key: null, t: 0, blend: 1, blendT: 0, fromHy: 0, hy: 0, aimW: 0, idleKey: "idle", idleN: 0, name: a.name };
    fitGear(c, color);
    c.tag = nameTag(a.name, color);
    c.tag.position.y = 2.15;
    root.add(c.tag);
    c.idleT = Math.random() * 4;
    return c;
  };

  // ------------------------------------------------------------------ posing
  function enter(c, key, t) {
    if (c.key === key) return;
    c.from.set(c.q); c.fromHy = c.hy;
    c.blendT = c.key === null ? 0 : (BLEND[key] !== undefined ? BLEND[key] : 0.28);
    c.blend = c.blendT > 0 ? 0 : 1;
    c.key = key; c.t = t || 0;
  }

  // Pose character c for archer a.
  Bo.pose = function (c, a, dt) {
    const M = c.M, B = M.BN, bones = c.bones, q = c.q, CFG = SB.CFG;
    c.root.position.set(a.x, a.y, a.z);
    // Which clip, and where in it, follows the sim's draw cycle exactly.
    let key, t;
    const speed = Math.hypot(a.vx, a.vz);
    if (a.state === "draw") { key = "draw"; t = a.t; }
    else if (a.state === "aim") { key = "aim"; t = Math.min(a.hold, M.clips.aim.dur - 0.02); }
    else if (a.state === "recoil") { key = "recoil"; t = a.t; }
    else if (!a.ground) {
      key = "fall"; c.runT = (c.runT || 0) + dt; t = c.runT % M.clips.fall.dur;
    } else if (speed > 0.8 && M.clips.run_f) {
      // Running: which way, relative to where the body faces (it faces the aim).
      const sy = Math.sin(a.aimYaw), cy = Math.cos(a.aimYaw);
      const fwd = -sy * a.vx - cy * a.vz, side = cy * a.vx - sy * a.vz;
      key = Math.abs(fwd) >= Math.abs(side) ? (fwd >= 0 ? "run_f" : "run_b") : (side >= 0 ? "run_r" : "run_l");
      const cl1 = M.clips[key];
      c.runT = (c.runT || 0) + dt * clamp(speed / RUN_SPEED[key], 0.6, 1.9);
      t = c.runT % cl1.dur;
    } else {
      // Idling: mostly the standing idle, now and then a look round.
      if (c.key !== "idle" && c.key !== "idle_look") { c.idleKey = "idle"; c.idleT = 0; }
      c.idleT += dt;
      const cl0 = M.clips[c.idleKey];
      if (c.idleT >= cl0.dur) { c.idleT = 0; c.idleKey = c.idleKey === "idle" && Math.random() < 0.35 && M.clips.idle_look ? "idle_look" : "idle"; }
      key = c.idleKey; t = c.idleT;
    }
    enter(c, key, t);
    c.t = t;
    const cl = M.clips[key];
    q.set(M.rest);
    sample(cl, t, q, 1);
    let hy = hipsY(cl, t, M);
    if (c.blend < 1) {
      c.blend = Math.min(1, c.blend + dt / c.blendT);
      const w = ease(c.blend);
      for (let i = 0; i < M.nb; i++) THREE.Quaternion.slerpFlat(q, i * 4, c.from, i * 4, q, i * 4, w);
      hy = c.fromHy + (hy - c.fromHy) * w;
    }
    c.hy = hy;
    for (let i = 0; i < M.nb; i++) bones[i].quaternion.fromArray(q, i * 4);
    bones[B.Hips].position.set(M.hipsRest[0], hy, M.hipsRest[2]);

    // Aim: the body turns so the clip's arrow line points along the aim, and the spine bends for the pitch.
    const aiming = a.state === "draw" || a.state === "aim" || (a.state === "recoil" && a.t < 0.4);
    c.aimW += ((aiming ? 1 : 0) - c.aimW) * Math.min(1, dt * 8);
    const ac = SB.CLIPS.aim;
    c.root.rotation.y = a.aimYaw + Math.PI - (ac.arrowYaw || 0) * c.aimW;
    // Flips and twists: the whole body turns round its middle (x = front/back flip, z = side flip, y = twist).
    const rx = a.rot.x, ry = a.rot.y, rz = a.rot.z, tumbling = rx !== 0 || ry !== 0 || rz !== 0;
    if (tumbling) {
      _fq.setFromAxisAngle(_ax, rx).multiply(_tq.setFromAxisAngle(_az, rz)).multiply(_tq.setFromAxisAngle(_ay, ry));
      c.body.quaternion.copy(_fq);
      c.body.position.copy(_pv).sub(_pv2.copy(_pv).applyQuaternion(_fq));
      // Tuck the knees in while flipping, so it reads as a flip and not a plank.
      const tuck = Math.sin(Math.min(1, Math.abs(rx || rz) / Math.PI / 2) * Math.PI) * (a.state === "idle" || a.state === "recoil" ? 1 : 0.55);
      if (tuck > 0.01) {
        [B.LeftUpLeg, B.RightUpLeg].forEach((i) => { if (i !== undefined) turn(c, bones[i], 1, 0, 0, -1.25 * tuck); });
        [B.LeftLeg, B.RightLeg].forEach((i) => { if (i !== undefined) turn(c, bones[i], 1, 0, 0, 1.5 * tuck); });
      }
    } else if (c.flipped) { c.body.quaternion.identity(); c.body.position.set(0, 0, 0); }
    c.flipped = tumbling;
    const lean = -((a.aimPitch || 0) - (ac.arrowPitch || 0)) * c.aimW / 3;
    turn(c, bones[B.Spine], 1, 0, 0, lean);
    if (B.Spine1 !== undefined) turn(c, bones[B.Spine1], 1, 0, 0, lean);
    if (B.Spine2 !== undefined) turn(c, bones[B.Spine2], 1, 0, 0, lean);
    c.root.updateMatrixWorld(true);

    // The string is held from the nock to the release; the arrow sits on it until it flies.
    const held = (a.state === "draw" && a.t > CFG.NOCK_T - 0.02) || a.state === "aim";
    setString(c, held, held || (a.state === "draw" && a.t > CFG.NOCK_T - 0.12));
    if (c.avatar) c.avatar.follow();   // a player's own avatar copies the (hidden) archer's pose
  };

  // A player's HopLobby avatar (.glb) takes over from the packed body: the body keeps playing the clips, and
  // keeps the bow and quiver, but is hidden; the avatar copies its pose each frame (src/avatar.js).
  Bo.useAvatar = function (c, buffer) {
    if (!SB.Avatar || !c) return Promise.resolve(false);
    const M = c.M, byName = {};
    Object.keys(M.BN).forEach(function (n) { byName[n] = c.bones[M.BN[n]]; });
    const driver = {
      root: c.root,
      bone: function (n) { return byName[n]; },
      // The bind pose: every bone at its rest rotation, hips at rest height, body unturned.
      bindPose: function (fn) {
        const saved = c.bones.map(function (b) { return [b.quaternion.clone(), b.position.clone()]; });
        for (let i = 0; i < M.nb; i++) c.bones[i].quaternion.fromArray(M.rest, i * 4);
        c.bones[M.BN.Hips].position.set(M.hipsRest[0], M.hipsRest[1], M.hipsRest[2]);
        c.root.updateMatrixWorld(true);
        try { fn(); } finally {
          c.bones.forEach(function (b, i) { b.quaternion.copy(saved[i][0]); b.position.copy(saved[i][1]); });
          c.root.updateMatrixWorld(true);
        }
      }
    };
    // It reads the rig with the archer at the origin, unturned, upright.
    const p = c.root.position.clone(), ry = c.root.rotation.y, bq = c.body.quaternion.clone(), bp = c.body.position.clone();
    c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.body.quaternion.identity(); c.body.position.set(0, 0, 0);
    c.root.updateMatrixWorld(true);
    return SB.Avatar.load(buffer, driver).then(function (av) {
      if (av) { c.avatar = av; c.mesh.visible = false; }
      return !!av;
    }).finally(function () {
      c.root.position.copy(p); c.root.rotation.y = ry; c.body.quaternion.copy(bq); c.body.position.copy(bp);
      c.root.updateMatrixWorld(true);
    });
  };

  // Bodies are separate scripts (1-2.5 MB each): load only the ones a match uses.
  const loading = {};
  Bo.ready = function (id) { return !!(SB.BODY && SB.BODY[id]); };
  Bo.load = function (ids, onProgress) {
    let done = 0;
    const tick = function () { done++; if (onProgress) onProgress(done, ids.length); };
    return Promise.all(ids.map(function (id) {
      if (SB.BODY && SB.BODY[id]) { tick(); return Promise.resolve(); }
      if (loading[id]) return loading[id].then(tick);
      return (loading[id] = new Promise(function (res, rej) {
        const s = document.createElement("script");
        s.src = "src/chars/" + id + ".js?v=1";
        s.onload = res;
        s.onerror = function () { rej(new Error("could not load character " + id)); };
        document.head.appendChild(s);
      })).then(tick);
    }));
  };
  SB.Body = Bo;
})(globalThis.SB);
