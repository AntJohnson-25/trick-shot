// Mixamo longbow clips (FBX) -> Work/src/chars/clips.js (SB.CLIPS), shared by every body,
// matched by bone name (the "mixamorig:" / "mixamorig1:" prefix stripped).
// Per clip: quaternion tracks for every bone resampled at 30 fps + the hips
// position relative to the first frame (x/z travel and y height, model units = cm).
// For the draw, also when the hand reaches the string (nock) and when it is fully back (anchor).
// Forked from Snowball Squabble's tools/build-clips.mjs. Borrows War Room's three.js module.
//   node tools/build-clips.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "assets", "animations", "pro-longbow-pack");
const CLIPS = {
  idle: "standing idle 01.fbx",
  idle_look: "standing idle 02 looking.fbx",
  idle_examine: "standing idle 03 examine.fbx",
  equip: "standing equip bow.fbx",
  disarm: "standing disarm bow.fbx",
  draw: "standing draw arrow.fbx",
  aim: "standing aim overdraw.fbx",
  recoil: "standing aim recoil.fbx",
  react: "standing react small from front.fbx",
  unarmed: "unarmed idle 01.fbx",
  // trick shot movement: bow-in-hand runs, aimed walks, the fall loop
  run_f: "standing run forward.fbx",
  run_b: "standing run back.fbx",
  run_l: "standing run left.fbx",
  run_r: "standing run right.fbx",
  walk_f: "standing aim walk forward.fbx",
  walk_b: "standing aim walk back.fbx",
  walk_l: "standing aim walk left.fbx",
  walk_r: "standing aim walk right.fbx",
  fall: "fall a loop.fbx",
  land: "fall a land to standing idle 01.fbx"
};
const OUT = path.join(ROOT, "Work", "src", "chars", "clips.js");
const PKG = path.resolve(ROOT, "..", "war-room", "Work", "node_modules", "three");

globalThis.window = globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
URL.createObjectURL = () => "blob:x";
const mod = (p) => import(pathToFileURL(path.join(PKG, p)).href);
const THREE = await mod("build/three.module.js");
const { FBXLoader } = await mod("examples/jsm/loaders/FBXLoader.js");

const short = (n) => n.replace(/^mixamorig\d*:?/, "");
const FPS = 30;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r2 = (v) => Math.round(v * 100) / 100;

// Some Mixamo files end in a few bytes the loader chokes on ("Unknown property
// type"): trimming them off the end parses fine (X-Parkour's trick).
function loadFbx(file) {
  const buf = fs.readFileSync(file);
  const quiet = console.warn;
  console.warn = () => {};
  try {
    for (let cut = 0; ; cut++) {
      try { return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - cut), ""); }
      catch (e) { if (cut >= 16 || !/Unknown property type/.test(e.message)) throw e; }
    }
  } finally { console.warn = quiet; }
}

const clips = {};
for (const [key, name] of Object.entries(CLIPS)) {
  const file = path.join(SRC, name);
  if (!fs.existsSync(file)) { console.log("MISSING", key, file); continue; }
  let obj;
  try { obj = loadFbx(file); } catch (err) { console.log("SKIP " + key + ": " + err.message); continue; }
  const src = obj.animations.find((a) => a.tracks.length);
  if (!src) { console.log("skip", key, "(no animation)"); continue; }
  const bones = [];
  obj.traverse((o) => { if (o.isBone) bones.push(o); });
  const hips = bones.find((b) => short(b.name) === "Hips");
  const n = Math.max(2, Math.round(src.duration * FPS) + 1);
  const tracks = [];
  for (const t of src.tracks) {
    const bone = short(t.name.split(".")[0]);
    const quat = t.name.endsWith(".quaternion");
    if (!quat && !(bone === "Hips" && t.name.endsWith(".position"))) continue;
    const ip = t.createInterpolant(), v = [];
    let x0 = 0, z0 = 0;
    for (let i = 0; i < n; i++) {
      const s = ip.evaluate(Math.min(src.duration, i / FPS));
      if (quat) v.push(r4(s[0]), r4(s[1]), r4(s[2]), r4(s[3]));
      else {
        if (i === 0) { x0 = s[0]; z0 = s[2]; }
        v.push(r2(s[0] - x0), r2(s[1]), r2(s[2] - z0));
      }
    }
    tracks.push({ b: bone, k: quat ? "q" : "hp", v });
  }
  const clip = { dur: r4(src.duration), n, hipsRest: r4(hips.position.y), tracks };

  // Hand gap over time: the draw's nock (hands closest) and anchor (hands furthest apart afterwards).
  if (key === "draw" || key === "aim" || key === "recoil") {
    const mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(src).play();
    const L = bones.find((b) => short(b.name) === "LeftHand"), R = bones.find((b) => short(b.name) === "RightHand");
    const gap = [];
    for (let i = 0; i < n; i++) {
      mixer.setTime(Math.min(src.duration, i / FPS)); obj.updateMatrixWorld(true);
      gap.push(new THREE.Vector3().setFromMatrixPosition(L.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(R.matrixWorld)));
    }
    let lo = 0;
    for (let i = 0; i < n; i++) if (gap[i] < gap[lo]) lo = i;
    let hi = lo;
    for (let i = lo; i < n; i++) if (gap[i] > gap[hi]) hi = i;
    clip.nock = r4(lo / FPS); clip.anchor = r4(hi / FPS);
    clip.gap = gap.filter((_, i) => i % 3 === 0).map((g) => Math.round(g));
    // Which way the arrow points at the anchor, in the body's own space (it faces +z): string hand -> bow hand.
    mixer.setTime(clip.anchor); obj.updateMatrixWorld(true);
    const d = new THREE.Vector3().setFromMatrixPosition(L.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(R.matrixWorld)).normalize();
    clip.arrowYaw = r4(Math.atan2(d.x, d.z)); clip.arrowPitch = r4(Math.asin(d.y));
  }
  clips[key] = clip;
  const e = (n - 1) * 3, hp = tracks.find((t) => t.k === "hp");
  console.log(key.padEnd(14), String(clip.dur).padEnd(7), "s", String(tracks.length).padEnd(3), "tracks",
    hp ? "travel " + Math.hypot(hp.v[e], hp.v[e + 2]).toFixed(0) + " cm" : "",
    clip.gap ? "nock " + clip.nock + " anchor " + clip.anchor + " arrow yaw/pitch " + clip.arrowYaw + "/" + clip.arrowPitch + " gap(cm) " + clip.gap.join(",") : "");
}
for (const k of Object.keys(clips)) delete clips[k].gap;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, "// Generated by tools/build-clips.mjs. Do not edit.\n" +
  "globalThis.SB = globalThis.SB || {};\nSB.CLIP_FPS = " + FPS + ";\nSB.CLIPS = " + JSON.stringify(clips) + ";\n");
console.log(Object.keys(clips).length, "clips ->", path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024 | 0), "KB");
