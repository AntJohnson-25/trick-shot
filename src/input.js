// Mouse + keyboard (pointer lock does the aiming): WASD moves, Space jumps (again in the air =
// a flip, its direction set by W/A/S/D), Q/E twists, hold any mouse button to draw and let go to
// shoot. sample() hands the sim one frame of controls. Headless tests drive it through
// SB.Input.synthetic. Zoomed in at full draw, the look slows down to match (V.fov).
globalThis.SB = globalThis.SB || {};
(function (SB) {
  "use strict";
  const I = { yaw: 0, pitch: 0, keys: {}, down: false, right: false, locked: false, sens: 1, synthetic: null, jumpQ: false, spinQ: 0, tapQ: false, downT: 0 };

  function look(dx, dy) {
    const k = SB.View && SB.View.fov ? Math.max(0.2, SB.View.fov / 60) : 1;
    const C = SB.CFG;
    I.yaw = (I.yaw - dx * k) % (Math.PI * 2);
    I.pitch = Math.max(C.PITCH_MIN, Math.min(C.PITCH_MAX, I.pitch - (I.invertY ? -dy : dy) * k));
  }

  I.init = function (canvas, onLock) {
    I.canvas = canvas;
    document.addEventListener("pointerlockchange", function () {
      I.locked = document.pointerLockElement === canvas;
      if (!I.locked) { I.down = false; I.right = false; I.keys = {}; }
      if (onLock) onLock(I.locked);
    });
    // The browser refuses the lock when it isn't asked for straight from a click (after loading, say): say so.
    document.addEventListener("pointerlockerror", function () { I.locked = false; if (onLock) onLock(false); });
    // A click on the game while it isn't locked asks again (that click counts as the user's gesture).
    canvas.addEventListener("click", function () { if (!I.locked && I.wantLock) I.lock(); });
    // I.free: the browser would not give us pointer lock (a sandboxed frame, say): the plain mouse looks and fires instead.
    document.addEventListener("mousemove", function (e) {
      if (!I.locked && !I.free) return;
      look(e.movementX * 0.0019 * I.sens, e.movementY * 0.0019 * I.sens);
    });
    document.addEventListener("mousedown", function (e) {
      if (!I.locked && !I.free) return;
      if (e.button === 0) { I.down = true; I.downT = performance.now(); }
      if (e.button === 2) I.right = true;
    });
    document.addEventListener("mouseup", function (e) {
      if (e.button === 0) { I.down = false; if ((I.locked || I.free) && performance.now() - I.downT < 250) I.tapQ = true; }   // a quick tap = draw and loose by itself
      if (e.button === 2) I.right = false;
    });
    document.addEventListener("keydown", function (e) {
      if (!I.locked && !I.free && !I.synthetic) return;
      if (!e.repeat) {
        if (e.code === "Space") I.jumpQ = true;
        if (e.code === "KeyQ") I.spinQ = 1;
        if (e.code === "KeyE") I.spinQ = -1;
      }
      I.keys[e.code] = true;
      if (e.code === "Space" || e.code === "Tab" || e.code.indexOf("Arrow") === 0) e.preventDefault();
    });
    document.addEventListener("keyup", function (e) { I.keys[e.code] = false; });
    document.addEventListener("contextmenu", function (e) { if (I.locked) e.preventDefault(); });
  };

  I.lock = function () {
    if (!I.canvas || !I.canvas.requestPointerLock) return;
    try {
      const r = I.canvas.requestPointerLock();
      if (r && r.catch) r.catch(function () { if (I.onFail) I.onFail(); });
    } catch (e) { if (I.onFail) I.onFail(); }
  };
  I.reset = function () { I.yaw = 0; I.pitch = 0.05; I.down = false; I.jumpQ = false; I.spinQ = 0; I.tapQ = false; };

  I.sample = function () {
    if (I.synthetic) {
      const s = I.synthetic;
      if (s.yaw != null) I.yaw = s.yaw;
      if (s.pitch != null) I.pitch = s.pitch;
      const out = { yaw: I.yaw, pitch: I.pitch, fire: !!s.fire, mx: s.mx || 0, mz: s.mz || 0, jump: !!s.jump, spin: s.spin || 0 };
      s.jump = false; s.spin = 0;   // edges
      return out;
    }
    const k = I.keys;
    const mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const out = { yaw: I.yaw, pitch: I.pitch, fire: I.down || I.right, mx: mx, mz: mz, jump: I.jumpQ, spin: I.spinQ, tap: I.tapQ };
    I.jumpQ = false; I.spinQ = 0; I.tapQ = false;
    return out;
  };
  SB.Input = I;
})(globalThis.SB);
