// Little bursts: apple and pumpkin chunks, glass, balloon scraps, straw and dust puffs.
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const THREE = globalThis.THREE;
  const F = { bits: [] };
  const MAX = 260;
  let geo = null;
  const mats = {};
  const mat = (col, opts) => mats[col] || (mats[col] = new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.7 }, opts || {})));

  F.init = function (scene) {
    F.scene = scene;
    geo = new THREE.IcosahedronGeometry(1, 1);
  };
  function burst(x, y, z, n, cols, size, speed, opts) {
    for (let i = 0; i < n; i++) {
      if (F.bits.length >= MAX) { const old = F.bits.shift(); F.scene.remove(old.m); }
      const mo = opts ? Object.assign({}, opts) : null;
      if (mo) delete mo.float;
      const m = new THREE.Mesh(geo, mat(cols[i % cols.length], mo));
      const s = size * (0.5 + Math.random());
      m.scale.set(s, s * (0.5 + Math.random() * 0.8), s);
      m.position.set(x, y, z);
      F.scene.add(m);
      const a = Math.random() * Math.PI * 2, up = Math.random();
      F.bits.push({ m: m, vx: Math.cos(a) * speed * (0.3 + Math.random()), vy: speed * (0.4 + up), vz: Math.sin(a) * speed * (0.3 + Math.random()) - speed * 0.3,
        sx: rnd(), sy: rnd(), life: 1.6 + Math.random() * 0.8, g: (opts && opts.float) ? 1.2 : 9.8, s: s });
    }
  }
  const rnd = () => (Math.random() - 0.5) * 14;
  F.event = function (e) {
    if (e.t !== "hit") return;
    const x = e.x, y = e.y, z = e.z;
    switch (e.kind) {
      case "apple": burst(x, y, z, 12, [0xc8231c, 0xf3e7c5, 0xe0c890], 0.016, 2.6); break;
      case "pumpkin": burst(x, y, z, 18, [0xe8741c, 0xf2a14a, 0xf5e0a0], 0.035, 3.2); break;
      case "bottle": burst(x, y, z, 14, [0x2f8a4a, 0x6fd08a], 0.012, 3, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 }); break;
      case "balloon": burst(x, y, z, 10, [0xffffff, 0xff5fa8, 0xffd52e], 0.02, 1.6, { float: true }); break;
      case "face": burst(x, y, z + 0.02, 5, [0xd9b46a, 0xf0d890], 0.008, 1.1); break;
      case "boar": burst(x, y, z + 0.02, 5, [0x8a6a4a, 0xb08a60], 0.01, 1.2); break;
      default: if (e.y < 0.1) burst(x, 0.02, z, 6, [0x7a6040, 0x9c8a5a], 0.012, 0.9);
    }
  };
  F.update = function (dt) {
    for (let i = F.bits.length - 1; i >= 0; i--) {
      const b = F.bits[i];
      b.life -= dt;
      b.vy -= b.g * dt;
      b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
      if (b.m.position.y < 0.01) { b.m.position.y = 0.01; b.vx *= 0.6; b.vz *= 0.6; b.vy = Math.abs(b.vy) * 0.25; }
      b.m.rotation.x += b.sx * dt; b.m.rotation.y += b.sy * dt;
      if (b.life < 0.4) b.m.scale.setScalar(Math.max(0.0001, b.s * b.life / 0.4));
      if (b.life <= 0) { F.scene.remove(b.m); F.bits.splice(i, 1); }
    }
  };
  F.clear = function () { F.bits.forEach((b) => F.scene.remove(b.m)); F.bits = []; };
  SB.Fx = F;
})(globalThis.SB);
