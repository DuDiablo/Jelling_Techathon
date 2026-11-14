/* Harald's Quest — "Sail to Jelling"
   A ~30 second longship game on a <canvas>, the reward for finding all three runes.

   The voyage: steer a dragon ship up the fjord to Jelling.
   - Odin's gold rings        +1 gold each
   - Rune skerries, the banks and Jormungandr (the Midgard Serpent): a bump costs 2 rings
   - Mjolnir, Thor's hammer   the ship is safe for 6 seconds and smashes what it hits
   - "Row!"                   a short burst of speed, then the crew rests

   Controls (X = left / right, Y = forward / back on the screen):
   - drag a finger (the ship moves as far as the finger), tap = Row!
   - arrow keys / WASD, Space = Row!
   - the RUNE_CONTROLLER joystick through Sail.stick(x, y) and Sail.action()

   The fjord is built so it can always be sailed without a bump: every row of rocks and
   every serpent leaves a gap of at least MIN_GAP (see newRun).
   Sounds are synthesised with Web Audio (no files). No libraries. */
const Sail = (function () {
  "use strict";

  /* ---------- tuning ---------- */
  const LW = 360;              // logical width; the height follows the canvas shape
  const LENGTH = 5600;         // fjord length in logical units (~30 s)
  const SHORE = LENGTH + 240;  // where the beach at Jelling begins
  const HIT_COST = 2;          // rings lost on a bump
  const MIN_GAP = 76;          // every obstacle row leaves at least this much open water
  const SERPENT_GAP = 86;      // ... and a serpent leaves at least this much
  const SERPENT_SWAY = 10;
  const COIL_R = 15, HEAD_R = 11;
  const BOOST_S = 1.1, BOOST_REST_S = 3.5;
  const SHIELD_S = 6;
  const COUNT_S = 3.6;         // 3, 2, 1 and "Row!"
  const MAX_PARTICLES = 220;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FONT_HEAD = '"Cinzel", Georgia, serif';
  const FONT_BODY = '"EB Garamond", Georgia, serif';
  const FONT_RUNE = '"Noto Sans Runic", "Segoe UI Historic", "Segoe UI Symbol", sans-serif';
  const FUTHARK = ["ᚠ", "ᚢ", "ᚦ", "ᚬ", "ᚱ", "ᚴ", "ᚼ", "ᚾ", "ᛁ", "ᛅ", "ᛋ", "ᛏ", "ᛒ", "ᛘ", "ᛚ", "ᛦ"];
  const TAU = Math.PI * 2;

  /* ---------- state ---------- */
  let cv = null, ctx = null, opts = {};
  let LH = 640, scale = 1, dpr = 1;
  let raf = 0, last = 0;
  let looping = false;         // the animation loop is running (also for the idle fjord)
  let pausedByHide = false;    // the loop stopped because the page was hidden
  let g = null;                // the current run
  let drag = null;             // { id, x0, y0, sx, so, x, y, t } while a finger is down
  let keyX = 0, keyY = 0, stickX = 0, stickY = 0;

  /* ---------- helpers ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A fixed pseudo-random number (0..1) for an integer: the same scenery every frame.
  function hash(n) {
    let t = (Math.imul(n | 0, 0x9E3779B1) + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function isPlaying() { return !!g && (g.phase === "count" || g.phase === "sail" || g.phase === "arrive"); }

  /* ---------- the fjord ---------- */
  function halfW(d) {
    const narrow = lerp(150, 98, smooth((d - 200) / (LENGTH * 0.7)));
    const bay = smooth((d - (LENGTH - 700)) / 600);        // opens into the bay at Jelling
    return lerp(narrow, LW * 0.62, bay);
  }
  function center(d) {
    const hw = Math.min(halfW(d), LW / 2 - 12);
    const amp = Math.max(0, LW / 2 - hw - 12);
    const calm = 1 - smooth((d - (LENGTH - 700)) / 500);  // straightens before the bay
    const start = smooth(d / 500);                          // and starts straight
    return LW / 2 + amp * calm * start * (0.7 * Math.sin(d / 430) + 0.3 * Math.sin(d / 170 + 1.3));
  }

  /* ---------- a new run ----------
     Order matters: serpents first, then rocks (kept away from serpents), then the hammers
     and the rings (kept away from everything solid). */
  function newRun(seed) {
    const r = rng(seed === undefined ? (Date.now() ^ (Math.random() * 0x7fffffff)) : seed);
    const rocks = [], rings = [], serpents = [], hammers = [];

    // Jormungandr: a row of coils from one bank with the head at the open end.
    // n is limited so the open water beside the head is never less than SERPENT_GAP.
    for (let d = 1300 + r() * 300; d < LENGTH - 800; d += 1050 + r() * 350) {
      const fromLeft = r() < 0.5;
      const hw = halfW(d), W = hw * 2;
      const reachOf = function (n) { return 30 * n + 25 + SERPENT_SWAY; };   // bank edge → head tip
      let n = Math.round(W * (0.46 + r() * 0.1) / 30);
      while (n > 2 && W - reachOf(n) < SERPENT_GAP) n--;
      n = Math.max(2, n);
      const dir = fromLeft ? 1 : -1;
      const coils = [];
      for (let i = 0; i < n; i++) coils.push({ ox: dir * (-hw + 8 + 30 * i), r: COIL_R });
      const head = { ox: dir * (-hw + 30 * n + 9), r: HEAD_R };
      const gapMid = dir * (-hw + (30 * n + 25 + W) / 2);                    // middle of the open water
      serpents.push({ d: d, coils: coils, head: head, dir: dir, gapMid: gapMid, gap: W - reachOf(n),
                      phase: r() * 6, seen: false, dived: false, diveT: 0 });
    }
    function nearSerpent(d, margin) {
      return serpents.some(function (sp) { return Math.abs(sp.d - d) < margin; });
    }

    // Rune skerries. One rock always leaves a wide side; a second is only kept if a gap
    // of MIN_GAP remains. A rock never sits so close to a bank that the ship could wedge.
    for (let d = 520; d < LENGTH - 520; d += 150 + r() * 130) {
      if (nearSerpent(d, 140)) continue;
      const hw = halfW(d), c = center(d);
      const make = function (off) {
        const rad = 11 + r() * 10;
        const lim = Math.max(0, hw - rad - 40);
        const pts = [];
        for (let i = 0; i < 8; i++) pts.push(0.78 + r() * 0.34);
        return {
          d: d, x: c + clamp(off, -lim, lim), r: rad, pts: pts, rot: r() * 6, broken: false,
          rune: r() < 0.4 ? FUTHARK[Math.floor(r() * FUTHARK.length)] : null   // a carved skerry
        };
      };
      const a = make((r() * 2 - 1) * hw);
      rocks.push(a);
      if (r() < 0.25) {
        const b = make((a.x > c ? -1 : 1) * (0.25 + r() * 0.6) * hw);
        b.d = d + 30;
        const lo = Math.min(a.x - a.r, b.x - b.r), hi = Math.max(a.x + a.r, b.x + b.r);
        const first = a.x < b.x ? a : b, second = a.x < b.x ? b : a;
        const widest = Math.max(lo - (c - hw), (second.x - second.r) - (first.x + first.r), (c + hw) - hi);
        if (widest >= MIN_GAP) rocks.push(b);
      }
    }

    function clearLane(d0, d1, off) {
      if (nearSerpent(d0, 120) || nearSerpent(d1, 120)) return false;
      return !rocks.some(function (k) {
        return k.d > d0 - 50 && k.d < d1 + 50 && Math.abs(k.x - (center(k.d) + off)) < k.r + 30;
      });
    }
    function findLane(d0, d1) {
      for (let tries = 0; tries < 10; tries++) {
        const off = (r() * 2 - 1) * (Math.min(halfW(d0), halfW(d1)) - 36);
        if (clearLane(d0, d1, off)) return off;
      }
      return null;
    }

    // Mjolnir twice on the way.
    [LENGTH * 0.3, LENGTH * 0.64].forEach(function (target) {
      for (let tries = 0; tries < 6; tries++) {
        const d = target + (r() * 2 - 1) * 160;
        const off = findLane(d - 20, d + 20);
        if (off !== null) { hammers.push({ d: d, x: center(d) + off, phase: r() * 6, taken: false }); return; }
      }
    });
    function nearHammer(d0, d1, off) {
      return hammers.some(function (h) {
        return h.d > d0 - 40 && h.d < d1 + 40 && Math.abs(h.x - (center(h.d) + off)) < 34;
      });
    }

    // Odin's rings: lines of 3–5 in open lanes ...
    for (let d = 380; d < LENGTH - 300; d += 250 + r() * 170) {
      const count = 3 + Math.floor(r() * 3);
      const off = findLane(d, d + count * 34);
      if (off === null || nearHammer(d, d + count * 34, off)) continue;
      for (let i = 0; i < count; i++) {
        const rd = d + i * 34;
        rings.push({ d: rd, x: center(rd) + off, phase: r() * 6, taken: false });
      }
    }
    // ... and a line through each serpent's gap, to show the way.
    serpents.forEach(function (sp) {
      [-51, -17, 17, 51].forEach(function (dd) {
        rings.push({ d: sp.d + dd, x: center(sp.d) + sp.gapMid, phase: r() * 6, taken: false });
      });
    });
    rings.sort(function (p, q) { return p.d - q.d; });

    return {
      d: 0, x: LW / 2, vx: 0, t: 0, playT: 0, speed: 0,
      oy: 0, vy: 0,                 // ship offset above its resting line (Y axis)
      boost: 0, boostRest: 0,       // "Row!" burst and its rest time
      shield: 0,                    // seconds of Thor's protection left
      phase: "count", countT: COUNT_S, hold: 0,
      speedMul: 1, invuln: 0, shake: 0, flash: 0, pulse: 0,
      coins: 0, hits: 0, combo: 0, comboT: 0, smashed: 0,
      rocks: rocks, rings: rings, serpents: serpents, hammers: hammers,
      particles: [], pops: [], trail: [], banner: null, sprayT: 0,
      landed: false, landT: 0, doneT: 0, total: rings.length
    };
  }

  /* ---------- sizing ---------- */
  function resize() {
    if (!cv) return;
    const w = cv.clientWidth || 360, h = cv.clientHeight || 600;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    scale = w / LW;
    LH = h / scale;
    if (!looping) draw();
  }
  // shipY() = the camera's anchor line; boatY() = where the ship actually is on screen.
  function shipY() { return LH - Math.min(130, LH * 0.2); }
  function boatY() { return shipY() - (g ? g.oy : 0); }
  function boatD() { return g.d + g.oy; }            // the ship's position along the fjord
  function oyMax() { return shipY() - LH * 0.4; }    // how far up the screen it may go
  function oyMin() { return -(LH - 64 - shipY()); }  // and how far down
  function sy(d) { return shipY() - (d - g.d); }     // distance along the fjord → screen y

  /* ---------- sound (Web Audio, synthesised) ---------- */
  let ac = null, master = null, noiseBuf = null, muted = false;
  function audioReady() {
    if (muted) return false;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      }
      if (ac.state === "suspended") { const p = ac.resume(); if (p && p.catch) p.catch(function () { /* needs a tap first */ }); }
      return ac.state === "running";
    } catch (e) { return false; }
  }
  function tone(type, f0, f1, dur, vol, delay, lowpass) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (lowpass) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      o.connect(f);
      node = f;
    }
    node.connect(gn);
    gn.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, delay, freq, kind) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime + (delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = kind || "lowpass";
    f.frequency.value = freq;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(gn);
    gn.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }
  const RING_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];   // a rising scale for rings in a row
  function sfx(name, n) {
    if (!audioReady()) return;
    try {
      switch (name) {
        case "tick": tone("triangle", 520, 0, 0.12, 0.25); break;
        case "go":   // a horn
          tone("sawtooth", 147, 0, 0.7, 0.3, 0, 700);
          tone("sawtooth", 220, 0, 0.7, 0.16, 0, 700);
          break;
        case "ring": {
          const f = 784 * Math.pow(2, RING_STEPS[Math.min(n || 0, RING_STEPS.length - 1)] / 12);
          tone("sine", f, 0, 0.16, 0.2);
          tone("sine", f * 1.5, 0, 0.2, 0.09, 0.05);
          break;
        }
        case "hit":
          noise(0.3, 0.5, 0, 500);
          tone("sine", 110, 45, 0.3, 0.5);
          break;
        case "row": noise(0.35, 0.2, 0, 1700, "bandpass"); break;
        case "serpent":
          tone("sawtooth", 82, 55, 0.9, 0.26, 0, 400);
          noise(0.9, 0.1, 0, 3000, "highpass");
          break;
        case "hammer":   // a bright chord and a thunder crack
          tone("sine", 392, 0, 0.6, 0.2);
          tone("sine", 587, 0, 0.7, 0.15, 0.06);
          tone("sine", 784, 0, 0.8, 0.12, 0.12);
          noise(0.5, 0.28, 0, 900);
          break;
        case "smash":
          noise(0.25, 0.45, 0, 1400);
          tone("sine", 160, 60, 0.2, 0.4);
          break;
        case "win":   // horns: D G A D
          [147, 196, 220, 294].forEach(function (f, i) {
            tone("sawtooth", f, 0, i === 3 ? 1.1 : 0.34, 0.26, i * 0.28, 900);
            tone("sawtooth", f * 1.5, 0, i === 3 ? 1.1 : 0.34, 0.1, i * 0.28, 900);
          });
          break;
      }
    } catch (e) { /* sound is optional */ }
  }
  // Sounds on the joystick (the app decides which ones it plays).
  function controllerSound(kind) { if (opts.onSound) { try { opts.onSound(kind); } catch (e) { /* ignore */ } } }
  function buzz(ms) {
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
      try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- particles (in fjord coordinates, so they stay on the water) ---------- */
  function emit(kind, x, d, vx, vd, life, size, colour) {
    if (g.particles.length >= MAX_PARTICLES) g.particles.shift();
    g.particles.push({ kind: kind, x: x, d: d, vx: vx, vd: vd, life: life, max: life, size: size, colour: colour });
  }
  function burst(kind, x, d, count, speed, life, size, colour) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.6);
      emit(kind, x, d, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), colour);
    }
  }
  function pop(text, x, y, colour) { g.pops.push({ text: text, x: x, y: y, life: 0.9, colour: colour }); }
  function banner(text, sub, colour) { g.banner = { text: text, sub: sub, life: 2.2, colour: colour || "95, 174, 143" }; }

  /* ---------- update ---------- */
  function update(dt) {
    g.t += dt;
    // effects run in every phase
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.life -= dt;
      if (p.life <= 0) { g.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.d += p.vd * dt;
      p.vx *= 1 - Math.min(1, dt * 2.5);
      p.vd *= 1 - Math.min(1, dt * 2.5);
    }
    for (let i = g.pops.length - 1; i >= 0; i--) {
      g.pops[i].life -= dt;
      g.pops[i].y -= 34 * dt;
      if (g.pops[i].life <= 0) g.pops.splice(i, 1);
    }
    if (g.banner) { g.banner.life -= dt; if (g.banner.life <= 0) g.banner = null; }
    g.flash = Math.max(0, g.flash - dt * 2.5);
    g.pulse = Math.max(0, g.pulse - dt * 4);
    g.shake = Math.max(0, g.shake - dt);
    g.serpents.forEach(function (sp) { if (sp.dived) sp.diveT += dt; });

    if (g.phase === "idle") return;
    if (g.phase === "done") {
      // gold sparks over the ship while the result is shown
      g.doneT += dt;
      if (g.doneT < 2.4 && Math.random() < dt * 14) {
        burst("spark", g.x + (Math.random() - 0.5) * 70, boatD() + 20 + Math.random() * 90, 5, 70, 0.7, 2.4, "#ffe9a8");
      }
      return;
    }
    if (g.hold > 0) { g.hold -= dt; return; }   // "Ready…" after the page was hidden

    if (g.phase === "count") {
      const before = Math.ceil(g.countT - 0.6);
      g.countT -= dt;
      const after = Math.ceil(g.countT - 0.6);
      if (after !== before) sfx(after > 0 ? "tick" : "go");
      if (g.countT <= 0) g.phase = "sail";
      return;
    }

    g.playT += dt;
    g.boost = Math.max(0, g.boost - dt);
    g.boostRest = Math.max(0, g.boostRest - dt);
    g.shield = Math.max(0, g.shield - dt);
    g.invuln = Math.max(0, g.invuln - dt);
    g.comboT = Math.max(0, g.comboT - dt);
    if (g.comboT === 0) g.combo = 0;

    // speed: picks up along the fjord, slows on a bump, eases to a stop at the beach
    g.speedMul = Math.min(1, g.speedMul + dt * 0.6);
    let speed = lerp(155, 245, clamp(g.d / LENGTH, 0, 1)) * g.speedMul * (g.boost > 0 ? 1.55 : 1);
    if (g.phase === "arrive") {
      const left = SHORE - 46 - boatD();
      speed = Math.max(0, Math.min(speed, left * 1.6));
      if (left < 2 && !g.landed) {
        g.landed = true;
        burst("spray", g.x, boatD() + 30, 14, 80, 0.6, 2.4, "#f3fbff");
      }
    }
    g.speed = speed;
    g.d += speed * dt;

    // steering on both axes
    let wantX, wantY;
    if (g.phase === "arrive") {
      wantX = (LW / 2 - g.x) * 2;
      wantY = (0 - g.oy) * 2;
    } else if (drag) {
      // relative drag: the ship moves as far as the finger does
      const tx = drag.sx + (drag.x - drag.x0) * 1.2;
      const to = drag.so - (drag.y - drag.y0) * 1.2;
      wantX = clamp((tx - g.x) * 6, -280, 280);
      wantY = clamp((to - g.oy) * 6, -240, 240);
    } else {
      wantX = clamp(keyX || stickX, -1, 1) * 250;
      wantY = clamp(keyY || stickY, -1, 1) * 210;
    }
    // a finger gets a quicker response, so the ship settles where it points without overshooting
    const snap = Math.min(1, dt * (drag && g.phase === "sail" ? 22 : 8));
    g.vx += (wantX - g.vx) * snap;
    g.vy += (wantY - g.vy) * snap;
    g.x += g.vx * dt;
    g.oy = clamp(g.oy + g.vy * dt, oyMin(), oyMax());
    if (g.oy === oyMin() || g.oy === oyMax()) g.vy = 0;

    g.trail.push({ x: g.x, d: boatD() });
    if (g.trail.length > 28) g.trail.shift();

    // spray at the bow
    g.sprayT -= dt;
    if (g.sprayT <= 0 && speed > 60) {
      g.sprayT = g.boost > 0 ? 0.025 : 0.06;
      [-1, 1].forEach(function (s) {
        emit("spray", g.x + s * 5, boatD() + 30, s * (25 + Math.random() * 35) + g.vx * 0.3, -10 - Math.random() * 30,
             0.45, 1.4 + Math.random() * 1.2, "#eaf7ff");
      });
    }

    if (g.phase === "sail") {
      collide();
      if (g.d >= LENGTH) g.phase = "arrive";
    }
    if (g.landed) {
      g.landT += dt;
      if (g.landT > 1.6) finish();   // let them see the landing first
    }
  }

  function shipCircles() {
    // front / middle / back of the hull, in fjord coordinates
    const bd = boatD();
    return [{ x: g.x, d: bd + 20, r: 8 }, { x: g.x, d: bd, r: 10 }, { x: g.x, d: bd - 20, r: 8 }];
  }

  function hit() {
    if (g.invuln > 0 || g.shield > 0) return;
    g.hits++;
    const lost = Math.min(HIT_COST, g.coins);
    g.coins -= lost;
    g.invuln = 1.3;
    g.speedMul = 0.45;
    g.shake = reducedMotion ? 0 : 0.3;
    g.flash = 1;
    g.combo = 0; g.comboT = 0;
    for (let i = 0; i < lost; i++) {
      emit("ring", g.x, boatD(), (i ? 1 : -1) * (60 + Math.random() * 40), 40 + Math.random() * 50, 0.8, 7, null);
    }
    burst("spray", g.x, boatD() + 10, 12, 110, 0.5, 2.4, "#f3fbff");
    pop(lost ? "−" + lost : "Ouch!", g.x, boatY() - 30, "#ffb4a8");
    sfx("hit");
    controllerSound("hit");
    buzz(60);
  }

  // Move the ship sideways out of an obstacle (never more than a few pixels per frame).
  // side: +1 / -1 to force the direction, otherwise away from the obstacle's middle.
  function pushOut(c, ox, od, rr, side) {
    const dx = g.x - ox, dd = c.d - od;
    const reach = Math.sqrt(Math.max(0, rr * rr - dd * dd));     // how wide the obstacle is at this height
    const dir = side || (dx >= 0 ? 1 : -1);
    const need = reach - dx * dir + 0.5;
    g.x += dir * clamp(need, 0, 8);
    g.vx *= 0.3;
  }

  function coilX(sp, c) { return center(sp.d) + c.ox + Math.sin(g.t * 1.3 + sp.phase) * SERPENT_SWAY; }

  function collide() {
    const circles = shipCircles();
    const shielded = g.shield > 0;

    // rune skerries
    const bd = boatD();
    for (let i = 0; i < g.rocks.length; i++) {
      const k = g.rocks[i];
      if (k.broken || Math.abs(k.d - bd) > 60) continue;
      for (let j = 0; j < circles.length; j++) {
        const c = circles[j];
        const dx = c.x - k.x, dd = c.d - k.d, rr = c.r + k.r * 0.9;
        if (dx * dx + dd * dd >= rr * rr) continue;
        if (shielded) {
          k.broken = true;
          g.smashed++;
          burst("shard", k.x, k.d, 14, 150, 0.6, 3.4, "#8d877c");
          burst("spark", k.x, k.d, 8, 120, 0.5, 2.2, "#bfe9ff");
          pop("Smash!", k.x, sy(k.d) - 16, "#bfe9ff");
          g.shake = reducedMotion ? 0 : 0.15;
          sfx("smash");
          controllerSound("smash");
          buzz(30);
        } else {
          pushOut(c, k.x, k.d, rr);
          hit();
        }
        break;
      }
    }

    // Jormungandr (the coils sway, so check where they are right now)
    for (let i = 0; i < g.serpents.length; i++) {
      const sp = g.serpents[i];
      if (!sp.seen && sy(sp.d) > -10) {
        sp.seen = true;
        banner("Jörmungandr rises!", "The Midgard Serpent");
        sfx("serpent");
      }
      if (sp.dived || Math.abs(sp.d - bd) > 70) continue;
      const parts = sp.coils.concat([sp.head]);
      let touched = false;
      for (let p = 0; p < parts.length && !touched; p++) {
        const px = coilX(sp, parts[p]);
        for (let j = 0; j < circles.length; j++) {
          const c = circles[j];
          const dx = c.x - px, dd = c.d - sp.d, rr = c.r + parts[p].r;
          if (dx * dx + dd * dd >= rr * rr) continue;
          touched = true;
          if (shielded) {
            sp.dived = true;
            sp.diveT = 0;
            parts.forEach(function (q) { burst("spray", coilX(sp, q), sp.d, 6, 90, 0.6, 2.6, "#f3fbff"); });
            pop("The serpent flees!", g.x, boatY() - 46, "#bfe9ff");
            sfx("smash");
            controllerSound("smash");
            buzz(30);
          } else {
            pushOut(c, px, sp.d, rr, sp.dir);   // always towards the open water
            hit();
          }
          break;
        }
      }
    }

    // the banks come last, so nothing above can leave the ship on land
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const cx = center(c.d), hw = halfW(c.d);
      if (g.x - c.r < cx - hw) { g.x = cx - hw + c.r; g.vx = Math.max(0, g.vx) * 0.3; hit(); }
      else if (g.x + c.r > cx + hw) { g.x = cx + hw - c.r; g.vx = Math.min(0, g.vx) * 0.3; hit(); }
    }

    // Mjolnir
    for (let i = 0; i < g.hammers.length; i++) {
      const h = g.hammers[i];
      if (h.taken || Math.abs(h.d - bd) > 50) continue;
      const dx = g.x - h.x, dd = bd - h.d;
      if (dx * dx + dd * dd < 28 * 28) {
        h.taken = true;
        g.shield = SHIELD_S;
        g.invuln = 0;
        burst("spark", h.x, h.d, 18, 150, 0.7, 2.6, "#bfe9ff");
        banner("Mjölnir!", "Thor guards your ship", "140, 190, 255");
        sfx("hammer");
        controllerSound("hammer");
        buzz(40);
      }
    }

    // Odin's rings
    for (let i = 0; i < g.rings.length; i++) {
      const k = g.rings[i];
      if (k.taken || Math.abs(k.d - bd) > 40) continue;
      const dx = g.x - k.x, dd = bd - k.d;
      if (dx * dx + dd * dd < 24 * 24) {
        k.taken = true;
        g.coins++;
        g.combo = g.comboT > 0 ? g.combo + 1 : 0;
        g.comboT = 1.1;
        g.pulse = 1;
        burst("spark", k.x, k.d, 6, 80, 0.4, 2, "#ffe9a8");
        pop("+1", k.x, sy(k.d), "#ffe9a8");
        sfx("ring", g.combo);
        controllerSound("coin");
      }
    }
  }

  // "Row!": a short burst of speed, then the crew needs a rest.
  function rowHard() {
    if (!g || g.phase !== "sail" || g.hold > 0 || g.boostRest > 0) return false;
    g.boost = BOOST_S;
    g.boostRest = BOOST_REST_S;
    pop("Row!", g.x, boatY() - 46, "#f3e9d2");
    sfx("row");
    return true;
  }

  function rankFor(gold, total) {
    const f = gold / (total + 5);
    return f >= 0.8 ? "Sea-King" : f >= 0.55 ? "Jarl" : f >= 0.3 ? "Viking" : "Rower";
  }

  function finish() {
    if (g.phase === "done") return;
    g.phase = "done";
    g.doneT = 0;
    // gold: the rings you kept, plus a bonus for a clean voyage
    const bonus = g.hits === 0 ? 5 : g.hits <= 2 ? 2 : 0;
    const gold = g.coins + bonus;
    const result = {
      coins: g.coins, total: g.total, hits: g.hits, bonus: bonus, gold: gold,
      rank: rankFor(gold, g.total), smashed: g.smashed,
      timeMs: Math.round(g.playT * 1000)
    };
    sfx("win");
    controllerSound("win");
    if (opts.onEnd) { try { opts.onEnd(result); } catch (e) { /* ignore */ } }
  }

  /* ---------- drawing ---------- */
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.save();
    if (g && g.shake > 0) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
    drawWater();
    if (g) {
      drawAurora();
      drawWaves();
      drawShore();
      drawBanks();
      drawRocks();
      drawSerpents();
      drawRings();
      drawHammers();
      drawWake();
      drawShip();
      drawParticles();
      drawRavens();
      drawPops();
    }
    ctx.restore();
    if (g) {
      drawVeil();
      drawHud();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  function drawWater() {
    const grd = ctx.createLinearGradient(0, 0, 0, LH);
    grd.addColorStop(0, "#102f45");
    grd.addColorStop(0.55, "#17435d");
    grd.addColorStop(1, "#245f78");
    ctx.fillStyle = grd;
    ctx.fillRect(-10, -10, LW + 20, LH + 20);
  }

  // Northern lights reflected on the water: slow green and violet ribbons.
  const AURORA = [
    { c: "111, 227, 176", y: 0.16, a: 0.26, s: 0.11 },
    { c: "164, 128, 255", y: 0.33, a: 0.18, s: 0.08 },
    { c: "111, 227, 176", y: 0.56, a: 0.12, s: 0.13 }
  ];
  function drawAurora() {
    const t = g.t;
    AURORA.forEach(function (b, i) {
      const yc = LH * b.y + Math.sin(t * 0.4 + i) * 10;
      ctx.beginPath();
      ctx.moveTo(-10, yc);
      for (let x = -10; x <= LW + 10; x += 20) {
        ctx.lineTo(x, yc + Math.sin(x / 55 + t * b.s * 6 + i * 2) * 16);
      }
      ctx.lineTo(LW + 10, yc + 70);
      ctx.lineTo(-10, yc + 70);
      ctx.closePath();
      const grd = ctx.createLinearGradient(0, yc - 20, 0, yc + 70);
      grd.addColorStop(0, "rgba(" + b.c + ", 0)");
      grd.addColorStop(0.3, "rgba(" + b.c + ", " + b.a + ")");
      grd.addColorStop(1, "rgba(" + b.c + ", 0)");
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  function drawWaves() {
    ctx.strokeStyle = "rgba(220, 240, 250, .22)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    const step = 34;
    const first = Math.floor((g.d - (LH - shipY()) - 40) / step);
    const lastRow = Math.ceil((g.d + shipY() + 40) / step);
    for (let k = first; k <= lastRow; k++) {
      for (let j = 0; j < 3; j++) {
        const x = hash(k * 7 + j) * LW;
        const y = sy(k * step + hash(k * 13 + j) * step);
        const wob = Math.sin(g.t * 2 + k + j) * 2;
        ctx.beginPath();
        ctx.moveTo(x - 7, y + wob);
        ctx.quadraticCurveTo(x - 3.5, y - 3 + wob, x, y + wob);
        ctx.quadraticCurveTo(x + 3.5, y + 3 + wob, x + 7, y + wob);
        ctx.stroke();
      }
    }
  }

  // The water edge of one bank. The points sit at fixed places along the fjord (every 8
  // units), so the jagged rock edge scrolls smoothly instead of shimmering.
  function bankEdge(side) {
    const STEP = 8;
    const pts = [];
    const top = Math.ceil((g.d + shipY() + 24) / STEP), bottom = Math.floor((g.d - (LH - shipY()) - 24) / STEP);
    for (let k = top; k >= bottom; k--) {
      const d = k * STEP;
      const jag = (hash(k * 3 + (side > 0 ? 1 : 0)) - 0.5) * 5;
      pts.push({ x: center(d) + side * (halfW(d) + jag), y: sy(d) });
    }
    return pts;
  }
  function tracePts(pts, shift) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x + shift, pts[i].y); else ctx.moveTo(pts[i].x + shift, pts[i].y);
    }
  }

  function drawBanks() {
    ctx.lineJoin = "round";
    [-1, 1].forEach(function (side) {
      const pts = bankEdge(side);
      if (pts.length < 2) return;
      const outer = side < 0 ? -20 : LW + 20;
      const y0 = pts[0].y, y1 = pts[pts.length - 1].y;
      // shallows: lighter water along the shore
      ctx.strokeStyle = "rgba(130, 205, 205, .13)";
      ctx.lineWidth = 46;
      tracePts(pts, 0);
      ctx.stroke();
      // foam along the edge
      ctx.strokeStyle = "rgba(235, 248, 255, .55)";
      ctx.lineWidth = 5;
      tracePts(pts, -side * 4);
      ctx.stroke();
      // land
      ctx.beginPath();
      ctx.moveTo(outer, y0);
      for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(outer, y1);
      ctx.closePath();
      ctx.fillStyle = "#47643a";
      ctx.fill();
      // rocky edge
      ctx.strokeStyle = "#6d675c";
      ctx.lineWidth = 7;
      tracePts(pts, 0);
      ctx.stroke();
      ctx.strokeStyle = "#8d8676";
      ctx.lineWidth = 2;
      tracePts(pts, side * 2);
      ctx.stroke();
      // pines, burial mounds, standing runestones and watch-fires on the land
      const step = 70;
      const first = Math.floor((g.d - (LH - shipY()) - 60) / step);
      const lastRow = Math.ceil((g.d + shipY() + 60) / step);
      for (let k = first; k <= lastRow; k++) {
        const d = k * step + hash(k * 5 + side) * 30;
        if (d > LENGTH - 80) continue;                      // the bay at Jelling is drawn by drawShore
        const edge = center(d) + side * halfW(d);
        const x = edge + side * (30 + hash(k * 11 + side) * 70);
        if (x < -20 || x > LW + 20) continue;
        const kind = hash(k * 23 + side * 7);
        const size = 9 + hash(k * 17 + side) * 6;
        if (kind < 0.55) tree(x, sy(d), size);
        else if (kind < 0.75) mound(x, sy(d), size * 1.5);
        else if (kind < 0.9) landStone(x, sy(d), FUTHARK[Math.floor(hash(k * 31 + side) * FUTHARK.length)]);
        else fire(x, sy(d), k);
      }
    });
  }

  function tree(x, y, s) {
    ctx.fillStyle = "rgba(0,0,0,.18)";
    disc(x + 3, y + 3, s);
    ctx.fillStyle = "#2f5128";
    disc(x, y, s);
    ctx.fillStyle = "#3f6a33";
    disc(x - s * 0.25, y - s * 0.25, s * 0.55);
  }
  function mound(x, y, s) {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(x + 4, y + 4, s, s * 0.9, 0, 0, TAU); ctx.fill();
    const grd = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, 1, x, y, s);
    grd.addColorStop(0, "#7c9d55");
    grd.addColorStop(1, "#3d5a2f");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.9, 0, 0, TAU); ctx.fill();
  }
  function landStone(x, y, rune) {
    ctx.fillStyle = "rgba(0,0,0,.25)";
    roundRect(x - 5, y - 8, 13, 19, 5); ctx.fill();
    ctx.fillStyle = "#a39d92";
    roundRect(x - 7, y - 10, 13, 19, 5); ctx.fill();
    ctx.fillStyle = "#b5462f";                       // runestones were painted red
    ctx.font = "11px " + FONT_RUNE;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(rune, x - 0.5, y);
    ctx.textBaseline = "alphabetic";
  }
  function fire(x, y, k) {
    const f = Math.sin(g.t * 9 + k) * 0.5 + 0.5;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 18);
    glow.addColorStop(0, "rgba(255, 190, 90, .55)");
    glow.addColorStop(1, "rgba(255, 140, 40, 0)");
    ctx.fillStyle = glow;
    disc(x, y, 18);
    ctx.fillStyle = "#e0662a";
    disc(x, y, 4.5 + f * 1.5);
    ctx.fillStyle = "#ffd36b";
    disc(x, y - 0.5, 2.2 + f);
  }
  function longhouse(x, y, w) {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    roundRect(x - w / 2 + 3, y - 7 + 3, w, 14, 7); ctx.fill();
    ctx.fillStyle = "#8a6a44";
    roundRect(x - w / 2, y - 7, w, 14, 7); ctx.fill();
    ctx.strokeStyle = "#5e4428";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 5, y); ctx.lineTo(x + w / 2 - 5, y); ctx.stroke();
  }
  function stone(x, y, w, h) {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, w, h, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#9a948a";
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#b8b2a7";
    ctx.beginPath(); ctx.ellipse(x - w * 0.25, y - h * 0.3, w * 0.45, h * 0.4, 0, 0, TAU); ctx.fill();
  }

  // Jelling: the beach, the two great burial mounds inside the stone ship, the church and the rune stones.
  function drawShore() {
    const y = sy(SHORE);
    if (y < -60) return;
    // beach
    ctx.fillStyle = "#d9c38f";
    ctx.beginPath();
    ctx.moveTo(-20, y + 10);
    for (let x = -20; x <= LW + 20; x += 20) ctx.lineTo(x, y + Math.sin(x / 40) * 6);
    ctx.lineTo(LW + 20, -60);
    ctx.lineTo(-20, -60);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(240, 250, 255, .7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = -20; x <= LW + 20; x += 20) {
      const yy = y + Math.sin(x / 40) * 6 + 4 + Math.sin(g.t * 2 + x / 30) * 1.5;
      if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // meadow
    ctx.fillStyle = "#5f8243";
    ctx.fillRect(-20, -60, LW + 40, y - 28 + 60);

    const cx = LW / 2, cy = y - 92;
    // a path from the beach to the church
    ctx.strokeStyle = "rgba(217, 195, 143, .75)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, y - 24); ctx.quadraticCurveTo(cx - 14, y - 50, cx, cy + 16); ctx.stroke();
    // the village behind: longhouses and pines
    for (let i = 0; i < 9; i++) {
      const hx = 24 + hash(900 + i) * (LW - 48), hy = cy - 96 - hash(950 + i) * 190;
      if (i % 3 === 0) longhouse(hx, hy, 34 + hash(970 + i) * 14); else tree(hx, hy, 9 + hash(990 + i) * 6);
    }
    // the stone ship: a long ring of standing stones
    ctx.fillStyle = "#c9c2b4";
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * TAU;
      disc(cx + Math.cos(a) * (LW * 0.46), cy - 4 + Math.sin(a) * 58 * (1 - 0.35 * Math.abs(Math.cos(a))), 2.4);
    }
    mound(cx - LW * 0.3, cy - 8, 34);
    mound(cx + LW * 0.3, cy - 8, 34);
    // the white church
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(cx - 36 + 4, cy - 26 + 4, 72, 40);
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(cx - 36, cy - 26, 72, 40);
    ctx.fillStyle = "#b5462f";
    ctx.beginPath(); ctx.moveTo(cx - 40, cy - 6); ctx.lineTo(cx, cy - 22); ctx.lineTo(cx + 40, cy - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(cx + 36, cy - 22, 20, 32);                  // tower
    ctx.fillStyle = "#8f3624";
    ctx.beginPath(); ctx.moveTo(cx + 34, cy - 22); ctx.lineTo(cx + 46, cy - 36); ctx.lineTo(cx + 58, cy - 22); ctx.closePath(); ctx.fill();
    // Gorm's and Harald's rune stones
    stone(cx - 30, y - 42, 11, 15);
    stone(cx + 30, y - 42, 9, 12);
    ctx.fillStyle = "#b5462f";
    ctx.font = "12px " + FONT_RUNE;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ᚼ", cx - 30, y - 42);
    ctx.fillText("ᚴ", cx + 30, y - 42);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#2b1a12";
    ctx.font = "700 15px " + FONT_HEAD;
    ctx.fillText("JELLING", cx, cy - 46);
  }

  function blob(k, y, s, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < k.pts.length; i++) {
      const a = k.rot + i / k.pts.length * TAU;
      const x = k.x + Math.cos(a) * k.r * k.pts[i] * s, yy = y + Math.sin(a) * k.r * k.pts[i] * s;
      if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
  }
  function drawRocks() {
    for (let i = 0; i < g.rocks.length; i++) {
      const k = g.rocks[i];
      if (k.broken) continue;
      const y = sy(k.d);
      if (y < -40 || y > LH + 40) continue;
      // foam ring
      ctx.strokeStyle = "rgba(235, 248, 255, .45)";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(k.x, y, k.r + 4 + Math.sin(g.t * 3 + k.rot) * 1.2, 0, TAU); ctx.stroke();
      blob(k, y, 1, "#5f5a52");
      blob(k, y - 2, 0.7, "#837d72");
      ctx.fillStyle = "rgba(255,255,255,.18)";
      disc(k.x - k.r * 0.3, y - k.r * 0.35, k.r * 0.25);
      if (k.rune) {
        const glow = 0.6 + Math.sin(g.t * 2.5 + k.rot) * 0.25;
        ctx.save();
        ctx.shadowColor = "rgba(120, 230, 210, .9)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "rgba(170, 245, 225, " + glow + ")";
        ctx.font = Math.round(k.r * 1.35) + "px " + FONT_RUNE;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(k.rune, k.x, y - 1);
        ctx.restore();
      }
    }
  }

  // Jormungandr: scaly coils arching out of the water, the head at the open end.
  function drawSerpents() {
    for (let s = 0; s < g.serpents.length; s++) {
      const sp = g.serpents[s];
      const y = sy(sp.d);
      if (y < -60 || y > LH + 60) continue;
      const sink = sp.dived ? clamp(sp.diveT / 0.6, 0, 1) : 0;   // it dives when Thor's hammer hits
      if (sink >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - sink;
      const bob = Math.sin(g.t * 2 + sp.phase);
      for (let i = 0; i < sp.coils.length; i++) {
        const c = sp.coils[i];
        const x = coilX(sp, c);
        const ry = c.r * 0.75 * (1 + 0.08 * Math.sin(g.t * 2.4 + i)) * (1 - sink * 0.8);
        // ripples where the body meets the water
        ctx.strokeStyle = "rgba(235, 248, 255, .45)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y + 3, c.r + 5, 6, 0, 0, TAU); ctx.stroke();
        // shadow, body, back stripe and scales
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,.3)";
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.ellipse(x + 3, y + 4, c.r, ry, 0, Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = "#1f5546";
        ctx.beginPath(); ctx.ellipse(x, y, c.r, ry, 0, Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = "#6fc2a0";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y - 1.5, c.r, ry, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.fillStyle = "#173f34";
        for (let k = 1; k < 5; k++) {
          const a = Math.PI + k / 5 * Math.PI;
          disc(x + Math.cos(a) * c.r, y + Math.sin(a) * ry + 2.5, 1.4);
        }
      }
      // the head, looking into the gap
      const hx = coilX(sp, sp.head), hy = y - 6 + bob * 2 + sink * 8;
      ctx.translate(hx, hy);
      ctx.scale(sp.dir * 1.35, 1.35);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(3, 4, 12, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1f5546";
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-12, -11); ctx.lineTo(-2, -6); ctx.fill();   // horn / fin
      ctx.fillStyle = "#6fc2a0";
      ctx.beginPath(); ctx.ellipse(1, -2, 7, 2.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffd36b";                                                                  // eye
      disc(4, -2.5, 1.8);
      ctx.fillStyle = "#1a1208";
      ctx.fillRect(3.6, -3.8, 0.9, 2.6);
      ctx.strokeStyle = "#c0392b";                                                                // forked tongue
      ctx.lineWidth = 1.2;
      const flick = Math.sin(g.t * 12 + sp.phase) > 0 ? 4 : 1;
      ctx.beginPath();
      ctx.moveTo(11, 1); ctx.lineTo(13 + flick, 1); ctx.lineTo(15 + flick, -1);
      ctx.moveTo(13 + flick, 1); ctx.lineTo(15 + flick, 3);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Odin's gold rings (like Draupnir), spinning as they float.
  function goldRing(x, y, sx, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    ctx.lineWidth = size * 0.42;
    ctx.strokeStyle = "#8a6420";
    ctx.beginPath(); ctx.arc(0.6, 0.8, size * 0.72, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "#e6c77a";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.72, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "#fff1c4";
    ctx.lineWidth = size * 0.14;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.72, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }
  function drawRings() {
    for (let i = 0; i < g.rings.length; i++) {
      const k = g.rings[i];
      if (k.taken) continue;
      const y = sy(k.d);
      if (y < -20 || y > LH + 20) continue;
      const sx = Math.max(0.25, Math.abs(Math.cos(g.t * 3 + k.phase)));
      const glow = ctx.createRadialGradient(k.x, y, 1, k.x, y, 15);
      glow.addColorStop(0, "rgba(255, 225, 140, .35)");
      glow.addColorStop(1, "rgba(255, 225, 140, 0)");
      ctx.fillStyle = glow;
      disc(k.x, y, 15);
      goldRing(k.x, y, sx, 10);
    }
  }

  // Mjolnir, Thor's hammer.
  function hammerIcon(x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = "#7a5a3a";                                   // handle
    roundRect(-s * 0.12, -s * 0.1, s * 0.24, s * 0.95, s * 0.1); ctx.fill();
    ctx.fillStyle = "#cfd8e3";                                   // head
    roundRect(-s * 0.62, -s * 0.62, s * 1.24, s * 0.58, s * 0.12); ctx.fill();
    ctx.strokeStyle = "#6b7a8c";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#e6c77a";                                   // gold band
    ctx.fillRect(-s * 0.12, -s * 0.62, s * 0.24, s * 0.58);
    ctx.restore();
  }
  function bolt(x0, y0, x1, y1, seed) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < 4; i++) {
      const f = i / 4;
      ctx.lineTo(lerp(x0, x1, f) + (hash(seed + i) - 0.5) * 9, lerp(y0, y1, f) + (hash(seed + i + 9) - 0.5) * 9);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  function drawHammers() {
    for (let i = 0; i < g.hammers.length; i++) {
      const h = g.hammers[i];
      if (h.taken) continue;
      const y = sy(h.d);
      if (y < -30 || y > LH + 30) continue;
      const pulse = 0.5 + 0.5 * Math.sin(g.t * 4 + h.phase);
      const glow = ctx.createRadialGradient(h.x, y, 2, h.x, y, 26);
      glow.addColorStop(0, "rgba(170, 215, 255, " + (0.45 + pulse * 0.25) + ")");
      glow.addColorStop(1, "rgba(170, 215, 255, 0)");
      ctx.fillStyle = glow;
      disc(h.x, y, 26);
      ctx.strokeStyle = "rgba(210, 235, 255, .85)";
      ctx.lineWidth = 1.2;
      const tick = Math.floor(g.t * 10);
      for (let b = 0; b < 2; b++) {
        const a = hash(tick * 5 + b + i * 40) * TAU;
        bolt(h.x + Math.cos(a) * 8, y + Math.sin(a) * 8, h.x + Math.cos(a) * 22, y + Math.sin(a) * 22, tick * 7 + b);
      }
      hammerIcon(h.x, y + Math.sin(g.t * 3 + h.phase) * 1.5, 15, Math.sin(g.t * 1.6 + h.phase) * 0.25);
    }
  }

  function drawWake() {
    if (g.trail.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineWidth = 2.2;
    for (let i = 1; i < g.trail.length; i++) {
      const p = g.trail[i - 1], q = g.trail[i];
      const age = (g.trail.length - i) / g.trail.length;
      const spread = 6 + age * 18;
      ctx.strokeStyle = "rgba(235, 248, 255, " + (0.4 * (1 - age)) + ")";
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(p.x + s * spread, sy(p.d) + 30);
        ctx.lineTo(q.x + s * (spread - 0.6), sy(q.d) + 30);
        ctx.stroke();
      }
    }
  }

  function hull(ox, oy) {
    ctx.beginPath();
    ctx.moveTo(ox, oy - 32);
    ctx.bezierCurveTo(ox + 14, oy - 18, ox + 13, oy + 18, ox, oy + 32);
    ctx.bezierCurveTo(ox - 13, oy + 18, ox - 14, oy - 18, ox, oy - 32);
    ctx.closePath();
  }
  function drawShip() {
    const x = g.x, y = boatY();
    // Thor's protection: a crackling ring of light around the ship
    if (g.shield > 0) {
      const ending = g.shield < 1.5 && Math.floor(g.shield * 6) % 2 === 0;   // flickers before it ends
      if (!ending) {
        const aura = ctx.createRadialGradient(x, y, 14, x, y, 46);
        aura.addColorStop(0, "rgba(170, 215, 255, 0)");
        aura.addColorStop(0.75, "rgba(170, 215, 255, .32)");
        aura.addColorStop(1, "rgba(170, 215, 255, 0)");
        ctx.fillStyle = aura;
        disc(x, y, 46);
        ctx.strokeStyle = "rgba(225, 242, 255, .9)";
        ctx.lineWidth = 1.3;
        const tick = Math.floor(g.t * 14);
        for (let b = 0; b < 3; b++) {
          const a = hash(tick * 3 + b) * TAU, a2 = a + 0.5 + hash(tick + b * 5) * 0.6;
          bolt(x + Math.cos(a) * 38, y + Math.sin(a) * 38, x + Math.cos(a2) * 38, y + Math.sin(a2) * 38, tick * 11 + b);
        }
      }
    }
    if (g.invuln > 0 && Math.floor(g.invuln * 10) % 2 === 0) return;  // blink after a bump
    const clan = opts.getClan ? opts.getClan() : null;
    const sail = clan ? clan.colour : "#7a1f1f";
    const moving = g.phase === "sail" || g.phase === "arrive";
    const bob = moving ? 0 : Math.sin(g.t * 1.6) * 1.2;              // rocks gently at rest
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(clamp(g.vx / 900, -0.25, 0.25));

    // oars, rowing
    const row = moving && !g.landed ? Math.sin(g.t * (g.boost > 0 ? 15 : 7)) * 0.35 : 0;
    ctx.strokeStyle = "#5a3a1e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const oy = -12 + i * 9;
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(s * 8, oy);
        ctx.lineTo(s * 24, oy + 6 + row * 10);
        ctx.stroke();
      }
    }
    // shadow
    ctx.fillStyle = "rgba(0, 0, 0, .25)";
    hull(3, 4);
    ctx.fill();
    // hull
    ctx.fillStyle = "#86542b";
    hull(0, 0);
    ctx.fill();
    ctx.strokeStyle = "#4e2f16";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#a4703f";
    ctx.beginPath(); ctx.ellipse(0, 2, 5.5, 22, 0, 0, TAU); ctx.fill();
    // shields along both sides
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#e6c77a" : sail;
        ctx.beginPath(); ctx.arc((j ? 1 : -1) * 9.2, -14 + i * 8, 3.3, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#3a2412"; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
    // dragon head (with gold eyes) at the bow, curled tail at the stern
    ctx.strokeStyle = "#4e2f16";
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(-4, -36, 0, -40); ctx.stroke();
    ctx.fillStyle = "#6b4220";
    ctx.beginPath(); ctx.ellipse(0, -43, 4.2, 5.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3.5, -46); ctx.lineTo(-6, -51); ctx.lineTo(-1.5, -47.5); ctx.fill();   // horns
    ctx.beginPath(); ctx.moveTo(3.5, -46); ctx.lineTo(6, -51); ctx.lineTo(1.5, -47.5); ctx.fill();
    ctx.fillStyle = "#e6c77a";
    disc(-1.9, -44.5, 1.1);
    disc(1.9, -44.5, 1.1);
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(6, 37, 1, 40); ctx.quadraticCurveTo(-3, 38, 0, 36); ctx.stroke();
    // sail (seen from above: a striped yard across the ship)
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(-21, -1, 42, 9);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#f3e9d2" : sail;
      ctx.fillRect(-21 + i * 7, -6, 7, 9);
    }
    ctx.strokeStyle = "#3a2412";
    ctx.lineWidth = 1;
    ctx.strokeRect(-21, -6, 42, 9);
    ctx.restore();
  }

  function drawParticles() {
    for (let i = 0; i < g.particles.length; i++) {
      const p = g.particles[i];
      const y = sy(p.d);
      if (y < -20 || y > LH + 20) continue;
      const a = clamp(p.life / (p.max * 0.6), 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === "ring") {
        goldRing(p.x, y, 1, p.size);
      } else if (p.kind === "spark") {
        ctx.fillStyle = p.colour;
        disc(p.x, y, p.size);
        ctx.globalAlpha = a * 0.3;
        disc(p.x, y, p.size * 2.4);
      } else {
        ctx.fillStyle = p.colour;
        disc(p.x, y, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Huginn and Muninn, Odin's ravens, cross the sky now and then (just for show).
  function raven(x, y, flap, dir, colour) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill();                   // body
    disc(7, -0.5, 2.3);                                                                  // head
    ctx.beginPath(); ctx.moveTo(9, -1); ctx.lineTo(12, 0); ctx.lineTo(9, 0.8); ctx.fill();       // beak
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, -2.5); ctx.lineTo(-11, 2.5); ctx.fill(); // tail
    const w = 9 + flap * 4;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(0, -w, 4, -w * 1.1); ctx.lineTo(3, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(0, w, 4, w * 1.1); ctx.lineTo(3, 0); ctx.fill();
    ctx.restore();
  }
  function drawRavens() {
    const period = 9;
    const cycle = Math.floor(g.t / period);
    const tt = (g.t % period) / 3.2;               // 0..1 while crossing
    if (tt > 1.1) return;
    const fromLeft = hash(cycle * 3) < 0.5;
    const y0 = LH * (0.15 + hash(cycle * 5) * 0.35);
    for (let i = 0; i < 2; i++) {
      const p = tt - i * 0.08;
      const x = fromLeft ? lerp(-30, LW + 30, p) : lerp(LW + 30, -30, p);
      const y = y0 + i * 22 + Math.sin(p * 6) * 6;
      const flap = Math.sin(g.t * 11 + i * 2);
      const dir = fromLeft ? 1 : -1;
      raven(x + 14, y + 26, flap, dir, "rgba(0,0,0,.22)");   // shadow on the water
      raven(x, y, flap, dir, "#141016");
    }
  }

  function drawPops() {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 18px " + FONT_HEAD;
    for (let i = 0; i < g.pops.length; i++) {
      const p = g.pops[i];
      const half = ctx.measureText(p.text).width / 2 + 6;           // keep long texts on the screen
      const x = clamp(p.x, half, LW - half);
      ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillText(p.text, x + 1, p.y + 1);
      ctx.fillStyle = p.colour;
      ctx.fillText(p.text, x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // Soft dark edges at the top and bottom, and a red flash on a bump.
  function drawVeil() {
    let grd = ctx.createLinearGradient(0, 0, 0, 80);
    grd.addColorStop(0, "rgba(6, 16, 26, .45)");
    grd.addColorStop(1, "rgba(6, 16, 26, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, LW, 80);
    grd = ctx.createLinearGradient(0, LH - 50, 0, LH);
    grd.addColorStop(0, "rgba(6, 16, 26, 0)");
    grd.addColorStop(1, "rgba(6, 16, 26, .3)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, LH - 50, LW, 50);
    if (g.flash > 0) {
      ctx.fillStyle = "rgba(190, 40, 25, " + (0.22 * g.flash) + ")";
      ctx.fillRect(0, 0, LW, LH);
    }
  }

  function centred(text, y, font, colour) {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = font;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillText(text, LW / 2 + 2, y + 2);
    ctx.fillStyle = colour;
    ctx.fillText(text, LW / 2, y);
  }

  function drawHud() {
    const idle = g.phase === "idle";
    if (!idle) {
      // voyage bar, with Harald's rune at the end
      const bx = 16, bw = LW - 116, by = 18;
      ctx.fillStyle = "rgba(20, 12, 8, .6)";
      roundRect(bx - 6, by - 10, bw + 24, 20, 10); ctx.fill();
      ctx.fillStyle = "rgba(243, 233, 210, .25)";
      roundRect(bx, by - 3, bw, 6, 3); ctx.fill();
      const p = clamp(boatD() / (SHORE - 46), 0, 1);
      ctx.fillStyle = "#e6c77a";
      roundRect(bx, by - 3, Math.max(6, bw * p), 6, 3); ctx.fill();
      ctx.fillStyle = "#f3e9d2";
      disc(bx + bw * p, by, 5);
      ctx.fillStyle = "#e6c77a";
      ctx.font = "13px " + FONT_RUNE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ᛒ", bx + bw + 10, by + 0.5);

      // rings
      const cx = LW - 74;
      ctx.fillStyle = "rgba(20, 12, 8, .6)";
      roundRect(cx, by - 13, 62, 26, 13); ctx.fill();
      goldRing(cx + 15, by, 1, 8 * (1 + 0.3 * g.pulse));
      ctx.fillStyle = "#f3e9d2";
      ctx.font = "700 " + Math.round(15 * (1 + 0.25 * g.pulse)) + "px " + FONT_HEAD;
      ctx.textAlign = "left";
      ctx.fillText(String(g.coins), cx + 28, by + 1);
      ctx.textBaseline = "alphabetic";

      if (g.phase === "sail") {
        // "Row!" readiness (green = ready)
        const ready = 1 - g.boostRest / BOOST_REST_S;
        ctx.fillStyle = "rgba(20, 12, 8, .6)";
        roundRect(cx, by + 17, 62, 8, 4); ctx.fill();
        ctx.fillStyle = ready >= 1 ? "#9be38a" : "rgba(243, 233, 210, .55)";
        roundRect(cx + 2, by + 19, Math.max(4, 58 * ready), 4, 2); ctx.fill();
        // Thor's protection left
        if (g.shield > 0) {
          ctx.fillStyle = "rgba(20, 12, 8, .6)";
          roundRect(cx - 22, by + 29, 84, 16, 8); ctx.fill();
          hammerIcon(cx - 12, by + 38, 8, 0);
          ctx.fillStyle = "rgba(170, 215, 255, .3)";
          roundRect(cx, by + 35, 58, 4, 2); ctx.fill();
          ctx.fillStyle = "#bfe1ff";
          roundRect(cx, by + 35, Math.max(4, 58 * g.shield / SHIELD_S), 4, 2); ctx.fill();
        }
      }
    }

    if (g.banner) {
      const a = clamp(g.banner.life / 0.4, 0, 1) * clamp((2.2 - g.banner.life) / 0.25, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(10, 24, 30, .78)";
      roundRect(LW / 2 - 120, 70, 240, 52, 10); ctx.fill();
      ctx.strokeStyle = "rgba(" + g.banner.colour + ", .9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#e9fbf3";
      ctx.font = "700 17px " + FONT_HEAD;
      ctx.fillText(g.banner.text, LW / 2, 93);
      ctx.font = "italic 14px " + FONT_BODY;
      ctx.fillStyle = "#f3e9d2";
      ctx.fillText(g.banner.sub, LW / 2, 112);
      ctx.globalAlpha = 1;
    }

    if (g.phase === "count") {
      const n = Math.ceil(g.countT - 0.6);
      const text = n > 0 ? String(n) : "Row!";
      const f = n > 0 ? (g.countT - 0.6) - (n - 1) : g.countT / 0.6;   // 1 → 0 within each beat
      centred(text, LH * 0.42, "700 " + Math.round(54 + f * 16) + "px " + FONT_HEAD, "#f3e9d2");
      centred(opts.hint ? opts.hint() : "Drag to steer. Tap to Row!", LH * 0.42 + 36, "italic 17px " + FONT_BODY, "#f3e9d2");
    } else if (g.hold > 0) {
      centred("Ready…", LH * 0.42, "700 34px " + FONT_HEAD, "#f3e9d2");
    }
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!looping) return;
    const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
    last = now;
    update(dt);
    draw();
    if (looping) raf = requestAnimationFrame(frame);
  }
  function loop() {
    cancelAnimationFrame(raf);
    looping = true;
    pausedByHide = false;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function halt() {
    looping = false;
    cancelAnimationFrame(raf);
  }

  /* ---------- input ---------- */
  function toLogical(e) {
    const rect = cv.getBoundingClientRect();
    const k = LW / (rect.width || LW);
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  }
  const KEYS_X = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  const KEYS_Y = { ArrowUp: 1, w: 1, W: 1, ArrowDown: -1, s: -1, S: -1 };

  function bindInput() {
    cv.addEventListener("pointerdown", function (e) {
      if (!g || drag) return;                     // one finger steers
      const p = toLogical(e);
      drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, sx: g.x, so: g.oy, t: performance.now() };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      const p = toLogical(e);
      drag.x = p.x; drag.y = p.y;
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (type) {
      cv.addEventListener(type, function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        // a quick tap without moving = "Row!"
        if (type === "pointerup" && performance.now() - drag.t < 220 &&
            Math.abs(drag.x - drag.x0) < 6 && Math.abs(drag.y - drag.y0) < 6) rowHard();
        drag = null;
      });
    });
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });   // no long-press menu while steering
    window.addEventListener("keydown", function (e) {
      if (!isPlaying()) return;
      if (e.key in KEYS_X) { keyX = KEYS_X[e.key]; e.preventDefault(); }
      if (e.key in KEYS_Y) { keyY = KEYS_Y[e.key]; e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { rowHard(); e.preventDefault(); }
    });
    window.addEventListener("keyup", function (e) {
      if (e.key in KEYS_X && keyX === KEYS_X[e.key]) keyX = 0;
      if (e.key in KEYS_Y && keyY === KEYS_Y[e.key]) keyY = 0;
    });
    window.addEventListener("blur", function () { keyX = 0; keyY = 0; });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (looping) { halt(); pausedByHide = true; }
      } else if (pausedByHide) {
        if (isPlaying() && g.phase !== "count") g.hold = 0.9;   // a breath before the ship moves again
        drag = null; keyX = 0; keyY = 0;
        loop();
      }
    });
  }

  /* ---------- public ---------- */
  return {
    init: function (canvas, options) {
      cv = canvas;
      ctx = cv.getContext("2d");
      opts = options || {};
      bindInput();
    },
    // Start a voyage (call from a tap or click, so sound is allowed).
    start: function () {
      drag = null; keyX = 0; keyY = 0;
      g = newRun();
      resize();
      loop();
      sfx("tick");
    },
    // The fjord at rest, gently moving (behind the intro card).
    preview: function () {
      g = newRun();
      g.phase = "idle";
      resize();
      loop();
    },
    stop: function () {
      halt();
      pausedByHide = false;
      drag = null; keyX = 0; keyY = 0;
      if (g && isPlaying()) g.phase = "idle";
    },
    // Joystick: x from -1 (left) to 1 (right), y from -1 (down / back) to 1 (up / forward).
    // Also takes a direction string like "L", "UR", "D", "C".
    stick: function (x, y) {
      if (typeof x === "string") {
        const dir = x.toUpperCase();
        x = /L/.test(dir) ? -1 : /R/.test(dir) ? 1 : 0;
        y = /U/.test(dir) ? 1 : /D/.test(dir) ? -1 : 0;
      }
      stickX = clamp(Number(x) || 0, -1, 1);
      stickY = clamp(Number(y) || 0, -1, 1);
    },
    // The action button: "Row!" while sailing. Returns true if it was used.
    action: function () { return rowHard(); },
    // true from the countdown until the ship has landed
    isRunning: function () { return isPlaying(); },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; },
    LENGTH: LENGTH,
    // For automated tests only: build fjords and step the game without the screen.
    _test: {
      newRun: newRun, halfW: halfW, center: center,
      state: function () { return g; },
      use: function (run) { g = run; },
      step: function (dt) { update(dt); },
      draw: draw,
      MIN_GAP: MIN_GAP, SERPENT_GAP: SERPENT_GAP, SERPENT_SWAY: SERPENT_SWAY, SHORE: SHORE
    }
  };
})();
