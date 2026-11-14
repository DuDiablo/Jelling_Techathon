/* Harald's Quest — "Sail to Jelling"
   A ~30 second longship game on a <canvas>: steer up the fjord, dodge rune-carved skerries,
   the coils of Jormungandr (the Midgard Serpent) and the banks, grab Odin's gold rings
   and land at Jelling. Hitting something costs 2 rings. Huginn and Muninn fly overhead
   and the northern lights shimmer on the water.
   The ship moves on both axes: X = left / right, Y = forward / back on the screen.
   Controls: drag a finger (the ship follows the drag), arrow keys / WASD + Space,
   or the RUNE_CONTROLLER joystick via Sail.stick(x, y) and Sail.action().
   Action = "Row!": a short burst of speed (then a few seconds to rest). No libraries. */
const Sail = (function () {
  "use strict";

  const LW = 360;           // logical width; the height follows the canvas shape
  const LENGTH = 5600;      // fjord length in logical units (~30 s)
  const HIT_COST = 2;
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FONT_HEAD = '"Cinzel", Georgia, serif';
  const FONT_RUNE = '"Noto Sans Runic", "Segoe UI Historic", "Segoe UI Symbol", sans-serif';
  const FUTHARK = ["ᚠ", "ᚢ", "ᚦ", "ᚬ", "ᚱ", "ᚴ", "ᚼ", "ᚾ", "ᛁ", "ᛅ", "ᛋ", "ᛏ", "ᛒ", "ᛘ", "ᛚ", "ᛦ"];

  let cv = null, ctx = null, opts = {};
  let LH = 640, scale = 1, dpr = 1;
  let raf = 0, last = 0, running = false;
  let g = null;              // the current run
  let drag = null;           // { x0, y0, sx, so, x, y } while a finger is down
  let keyX = 0, keyY = 0, stickX = 0, stickY = 0;
  const BOOST_S = 1.1, BOOST_REST_S = 3.5;

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
  function hash(n) { const r = rng(n * 2654435761); return r(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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
  const SHORE = LENGTH + 240;   // where the beach at Jelling begins

  /* ---------- a new run ---------- */
  function newRun() {
    const r = rng(Date.now());
    const rocks = [], coins = [], serpents = [];
    // Jormungandr rises in a few places: a row of coils from one bank, a gap on the other side
    for (let d = 1300 + r() * 300; d < LENGTH - 800; d += 1050 + r() * 350) {
      const fromLeft = r() < 0.5;
      const hw = halfW(d);
      const span = hw * 2 * (0.5 + r() * 0.12);        // how much of the fjord the coils cover
      const n = Math.max(2, Math.round(span / 36));
      const coils = [];
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        coils.push({ ox: (fromLeft ? -hw + f * span : hw - f * span), r: 15 });
      }
      serpents.push({ d: d, coils: coils, fromLeft: fromLeft, phase: r() * 6, seen: false });
    }
    function nearSerpent(d) { return serpents.some(function (sp) { return Math.abs(sp.d - d) < 110; }); }
    for (let d = 520; d < LENGTH - 520; d += 150 + r() * 130) {
      if (nearSerpent(d)) continue;
      const n = r() < 0.25 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const hw = halfW(d) - 30;
        const rad = 11 + r() * 10;
        const pts = [];
        for (let i = 0; i < 8; i++) pts.push(0.78 + r() * 0.34);
        rocks.push({
          d: d + k * 40, x: center(d) + (r() * 2 - 1) * hw, r: rad, pts: pts, rot: r() * 6,
          rune: r() < 0.4 ? FUTHARK[Math.floor(r() * FUTHARK.length)] : null   // a carved skerry
        });
      }
    }
    for (let d = 380; d < LENGTH - 300; d += 250 + r() * 170) {
      const count = 3 + Math.floor(r() * 3);
      let off = 0, ok = false;
      for (let tries = 0; tries < 8 && !ok; tries++) {
        off = (r() * 2 - 1) * (halfW(d) - 36);
        ok = !nearSerpent(d) && !nearSerpent(d + count * 34) && !rocks.some(function (k) {
          return k.d > d - 50 && k.d < d + count * 34 + 50 && Math.abs(k.x - (center(k.d) + off)) < k.r + 30;
        });
      }
      if (!ok) continue;
      for (let i = 0; i < count; i++) {
        const cd = d + i * 34;
        coins.push({ d: cd, x: center(cd) + off, phase: r() * 6, taken: false });
      }
    }
    return {
      d: 0, x: LW / 2, vx: 0, t: 0,
      oy: 0, vy: 0,              // ship offset above its resting line (Y axis)
      boost: 0, boostRest: 0,    // "Row!" burst and its rest time
      phase: "count", countT: 3.2,
      speedMul: 1, invuln: 0, shake: 0,
      coins: 0, hits: 0, gold: 0,
      rocks: rocks, coinList: coins, serpents: serpents, pops: [], trail: [], banner: null,
      startedAt: 0, endT: 0, total: coins.length
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
    if (!running) draw();
  }
  // shipY() = the camera's anchor line; boatY() = where the ship actually is on screen.
  function shipY() { return LH - Math.min(130, LH * 0.2); }
  function boatY() { return shipY() - (g ? g.oy : 0); }
  function boatD() { return g.d + g.oy; }          // the ship's position along the fjord
  function oyMax() { return shipY() - LH * 0.4; }  // how far up the screen it may go
  function oyMin() { return -(LH - 64 - shipY()); } // and how far down

  /* ---------- update ---------- */
  function update(dt) {
    g.t += dt;
    if (g.phase === "count") {
      g.countT -= dt;
      if (g.countT <= 0) { g.phase = "sail"; g.startedAt = performance.now(); }
      return;
    }

    // speed: picks up along the fjord, slows on a hit, eases to a stop at the beach
    g.speedMul = Math.min(1, g.speedMul + dt * 0.6);
    g.boost = Math.max(0, g.boost - dt);
    g.boostRest = Math.max(0, g.boostRest - dt);
    let speed = lerp(155, 245, g.d / LENGTH) * g.speedMul * (g.boost > 0 ? 1.55 : 1);
    if (g.phase === "arrive") {
      const left = SHORE - 46 - boatD();
      speed = Math.max(0, Math.min(speed, left * 1.6));
      if (left < 2 && !g.endT) { g.endT = g.t; }
    }
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
    g.vx += (wantX - g.vx) * Math.min(1, dt * 8);
    g.vy += (wantY - g.vy) * Math.min(1, dt * 8);
    g.x += g.vx * dt;
    g.oy = clamp(g.oy + g.vy * dt, oyMin(), oyMax());
    if (g.oy === oyMin() || g.oy === oyMax()) g.vy = 0;

    g.trail.push({ x: g.x, d: boatD() });
    if (g.trail.length > 28) g.trail.shift();

    g.invuln = Math.max(0, g.invuln - dt);
    g.shake = Math.max(0, g.shake - dt);

    if (g.phase === "sail") {
      collide();
      if (g.d >= LENGTH) g.phase = "arrive";
    }

    g.pops = g.pops.filter(function (p) { p.life -= dt; p.y -= 34 * dt; return p.life > 0; });
    if (g.banner) { g.banner.life -= dt; if (g.banner.life <= 0) g.banner = null; }

    if (g.endT && g.t - g.endT > 1.6) finish();   // let them see the landing first
  }

  function shipCircles() {
    // front / middle / back of the hull, in world coordinates
    return [{ dy: -20, r: 8 }, { dy: 0, r: 10 }, { dy: 20, r: 8 }].map(function (c) {
      return { x: g.x, d: boatD() - c.dy, r: c.r };
    });
  }

  function hit(text) {
    if (g.invuln > 0) return;
    g.hits++;
    const lost = Math.min(HIT_COST, g.coins);
    g.coins -= lost;
    g.invuln = 1.3;
    g.speedMul = 0.45;
    g.shake = reducedMotion ? 0 : 0.3;
    pop(text || (lost ? "−" + lost : "Ouch!"), g.x, boatY() - 30, "#ffb4a8");
    sound("hit");
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
  }

  function collide() {
    const circles = shipCircles();
    // banks
    circles.forEach(function (c) {
      const cx = center(c.d), hw = halfW(c.d);
      if (c.x - c.r < cx - hw) { g.x += (cx - hw) - (c.x - c.r); g.vx = Math.max(0, g.vx) * 0.3; hit(); }
      else if (c.x + c.r > cx + hw) { g.x -= (c.x + c.r) - (cx + hw); g.vx = Math.min(0, g.vx) * 0.3; hit(); }
    });
    // rocks
    g.rocks.forEach(function (k) {
      if (Math.abs(k.d - boatD()) > 60) return;
      circles.forEach(function (c) {
        const dx = c.x - k.x, dd = c.d - k.d, rr = c.r + k.r * 0.9;
        if (dx * dx + dd * dd < rr * rr) {
          g.x += (dx >= 0 ? 1 : -1) * 6;
          hit();
        }
      });
    });
    // Jormungandr's coils (they sway, so check where they are right now)
    g.serpents.forEach(function (sp) {
      if (!sp.seen && sy(sp.d) > -10) {
        sp.seen = true;
        g.banner = { text: "Jörmungandr rises!", sub: "The Midgard Serpent", life: 2.2 };
      }
      if (Math.abs(sp.d - boatD()) > 70) return;
      sp.coils.forEach(function (c) {
        const cx = coilX(sp, c);
        circles.forEach(function (sc) {
          const dx = sc.x - cx, dd = sc.d - sp.d, rr = sc.r + c.r;
          if (dx * dx + dd * dd < rr * rr) {
            g.x += (dx >= 0 ? 1 : -1) * 7;
            hit();
          }
        });
      });
    });
    // coins
    g.coinList.forEach(function (k) {
      if (k.taken || Math.abs(k.d - boatD()) > 40) return;
      const dx = g.x - k.x, dd = boatD() - k.d;
      if (dx * dx + dd * dd < 24 * 24) {
        k.taken = true;
        g.coins++;
        pop("+1", k.x, sy(k.d), "#ffe9a8");
        sound("coin");
      }
    });
  }

  function coilX(sp, c) { return center(sp.d) + c.ox + Math.sin(g.t * 1.3 + sp.phase) * 12; }

  function sound(kind) { if (opts.onSound) { try { opts.onSound(kind); } catch (e) { /* ignore */ } } }

  // "Row!": a short burst of speed, then the crew needs a rest.
  function rowHard() {
    if (!g || g.phase !== "sail" || g.boostRest > 0) return false;
    g.boost = BOOST_S;
    g.boostRest = BOOST_REST_S;
    pop("Row!", g.x, boatY() - 46, "#f3e9d2");
    return true;
  }

  function pop(text, x, y, colour) { g.pops.push({ text: text, x: x, y: y, life: 0.9, colour: colour }); }

  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    g.phase = "done";
    // gold: the coins you kept, plus a bonus for a clean voyage
    const bonus = g.hits === 0 ? 5 : g.hits <= 2 ? 2 : 0;
    const result = {
      coins: g.coins, total: g.total, hits: g.hits, bonus: bonus,
      gold: g.coins + bonus,
      timeMs: g.startedAt ? performance.now() - g.startedAt : 0
    };
    draw();
    sound("win");
    if (opts.onEnd) opts.onEnd(result);
  }

  /* ---------- drawing ---------- */
  function sy(d) { return shipY() - (d - g.d); }   // world distance → screen y

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
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
      drawCoins();
      drawWake();
      drawShip();
      drawRavens();
      drawPops();
    }
    ctx.restore();
    if (g) drawHud();
  }

  function drawWater() {
    const grd = ctx.createLinearGradient(0, 0, 0, LH);
    grd.addColorStop(0, "#102f45");
    grd.addColorStop(0.55, "#17435d");
    grd.addColorStop(1, "#245f78");
    ctx.fillStyle = grd;
    ctx.fillRect(-10, -10, LW + 20, LH + 20);
  }

  // Northern lights reflected on the water: slow green and violet ribbons.
  function drawAurora() {
    const t = g ? g.t : 0;
    const bands = [
      { c: "111, 227, 176", y: 0.16, a: 0.26, s: 0.11 },
      { c: "164, 128, 255", y: 0.33, a: 0.18, s: 0.08 },
      { c: "111, 227, 176", y: 0.56, a: 0.12, s: 0.13 }
    ];
    bands.forEach(function (b, i) {
      const yc = LH * b.y + Math.sin(t * 0.4 + i) * 10;
      ctx.save();
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
      ctx.restore();
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

  function bankEdge(side) {
    // points of one bank's water edge, from the top of the screen to the bottom
    const pts = [];
    for (let y = -20; y <= LH + 20; y += 8) {
      const d = g.d + (shipY() - y);
      const jag = (hash(Math.floor(d / 8) * 3 + (side > 0 ? 1 : 0)) - 0.5) * 5;
      pts.push({ x: center(d) + side * (halfW(d) + jag), y: y });
    }
    return pts;
  }

  function drawBanks() {
    [-1, 1].forEach(function (side) {
      const pts = bankEdge(side);
      const outer = side < 0 ? -20 : LW + 20;
      // foam along the edge
      ctx.strokeStyle = "rgba(235, 248, 255, .55)";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      pts.forEach(function (p, i) { const x = p.x - side * 4; if (i) ctx.lineTo(x, p.y); else ctx.moveTo(x, p.y); });
      ctx.stroke();
      // land
      ctx.beginPath();
      ctx.moveTo(outer, -20);
      pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(outer, LH + 20);
      ctx.closePath();
      ctx.fillStyle = "#47643a";
      ctx.fill();
      // rocky edge
      ctx.strokeStyle = "#6d675c";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = "#8d8676";
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(function (p, i) { const x = p.x + side * 2; if (i) ctx.lineTo(x, p.y); else ctx.moveTo(x, p.y); });
      ctx.stroke();
      // pines, burial mounds, standing runestones and watch-fires on the land
      const step = 70;
      const first = Math.floor((g.d - (LH - shipY()) - 60) / step);
      const lastRow = Math.ceil((g.d + shipY() + 60) / step);
      for (let k = first; k <= lastRow; k++) {
        const d = k * step + hash(k * 5 + side) * 30;
        const edge = center(d) + side * halfW(d);
        const dist = 30 + hash(k * 11 + side) * 70;
        const x = edge + side * dist;
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
    ctx.beginPath(); ctx.arc(x + 3, y + 3, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f5128";
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3f6a33";
    ctx.beginPath(); ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  function mound(x, y, s) {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(x + 4, y + 4, s, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    const grd = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, 1, x, y, s);
    grd.addColorStop(0, "#7c9d55");
    grd.addColorStop(1, "#3d5a2f");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.9, 0, 0, Math.PI * 2); ctx.fill();
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
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e0662a";
    ctx.beginPath(); ctx.arc(x, y, 4.5 + f * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath(); ctx.arc(x, y - 0.5, 2.2 + f, 0, Math.PI * 2); ctx.fill();
  }

  function drawShore() {
    const y = sy(SHORE);
    if (y < -40) return;
    // beach + grass across the bay
    ctx.fillStyle = "#d9c38f";
    ctx.beginPath();
    ctx.moveTo(-20, y + 10);
    for (let x = -20; x <= LW + 20; x += 20) ctx.lineTo(x, y + Math.sin(x / 40) * 6);
    ctx.lineTo(LW + 20, -40);
    ctx.lineTo(-20, -40);
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
    ctx.fillStyle = "#6a8a45";
    ctx.fillRect(-20, -40, LW + 40, y - 28 + 40);
    // Jelling: the two great burial mounds, the stone ship around them, the church and the stones
    const cy = y - 92, cx = LW / 2;
    // the stone ship: a long ring of standing stones
    ctx.fillStyle = "#c9c2b4";
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2;
      const sx = cx + Math.cos(a) * (LW * 0.46), sy2 = cy - 4 + Math.sin(a) * 58 * (1 - 0.35 * Math.abs(Math.cos(a)));
      ctx.beginPath(); ctx.arc(sx, sy2, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    mound(cx - LW * 0.3, cy - 8, 34);
    mound(cx + LW * 0.3, cy - 8, 34);
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
    stone(cx - 30, y - 42, 11, 15);
    stone(cx + 30, y - 42, 9, 12);
    ctx.fillStyle = "#2b1a12";
    ctx.font = "700 15px " + FONT_HEAD;
    ctx.textAlign = "center";
    ctx.fillText("JELLING", cx, cy - 46);
  }

  function stone(x, y, w, h) {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath(); ctx.ellipse(x + 3, y + 3, w, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9a948a";
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#b8b2a7";
    ctx.beginPath(); ctx.ellipse(x - w * 0.25, y - h * 0.3, w * 0.45, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawRocks() {
    g.rocks.forEach(function (k) {
      const y = sy(k.d);
      if (y < -40 || y > LH + 40) return;
      // foam ring
      ctx.strokeStyle = "rgba(235, 248, 255, .45)";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(k.x, y, k.r + 4 + Math.sin(g.t * 3 + k.rot) * 1.2, 0, Math.PI * 2); ctx.stroke();
      blob(k, y, 1, "#5f5a52");
      blob(k, y - 2, 0.7, "#837d72");
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.arc(k.x - k.r * 0.3, y - k.r * 0.35, k.r * 0.25, 0, Math.PI * 2); ctx.fill();
      if (k.rune) {
        const glow = 0.55 + Math.sin(g.t * 2.5 + k.rot) * 0.25;
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
    });
  }
  function blob(k, y, s, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    k.pts.forEach(function (p, i) {
      const a = k.rot + i / k.pts.length * Math.PI * 2;
      const x = k.x + Math.cos(a) * k.r * p * s, yy = y + Math.sin(a) * k.r * p * s;
      if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
    });
    ctx.closePath();
    ctx.fill();
  }

  // Jormungandr: scaly coils arching out of the water, the head at the open end.
  function drawSerpents() {
    g.serpents.forEach(function (sp) {
      const y = sy(sp.d);
      if (y < -60 || y > LH + 60) return;
      const bob = Math.sin(g.t * 2 + sp.phase);
      sp.coils.forEach(function (c, i) {
        const x = coilX(sp, c);
        const rise = 1 + 0.08 * Math.sin(g.t * 2.4 + i);
        // ripples where the body meets the water
        ctx.strokeStyle = "rgba(235, 248, 255, .45)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y + 3, c.r + 5, 6, 0, 0, Math.PI * 2); ctx.stroke();
        // shadow, body, belly stripe and scales
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,.3)";
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.ellipse(x + 3, y + 4, c.r, c.r * 0.75 * rise, 0, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#1f5546";
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.ellipse(x, y, c.r, c.r * 0.75 * rise, 0, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#6fc2a0";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y - 1.5, c.r, c.r * 0.75 * rise, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.fillStyle = "#173f34";
        for (let k = 1; k < 5; k++) {
          const a = Math.PI + k / 5 * Math.PI;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * c.r, y + Math.sin(a) * c.r * 0.75 * rise + 2.5, 1.4, 0, Math.PI * 2); ctx.fill();
        }
      });
      // the head at the open end of the row, looking at the gap
      const last = sp.coils[sp.coils.length - 1];
      const dir = sp.fromLeft ? 1 : -1;
      const hx = coilX(sp, last) + dir * (last.r + 17), hy = y - 6 + bob * 2;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(dir * 1.35, 1.35);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(3, 4, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#245c4c";
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-12, -11); ctx.lineTo(-2, -6); ctx.fill();   // horn / fin
      ctx.fillStyle = "#5fae8f";
      ctx.beginPath(); ctx.ellipse(1, -2, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd36b";                                                                  // eye
      ctx.beginPath(); ctx.arc(4, -2.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1208";
      ctx.fillRect(3.6, -3.8, 0.9, 2.6);
      ctx.strokeStyle = "#c0392b";                                                                // forked tongue
      ctx.lineWidth = 1.2;
      const flick = Math.sin(g.t * 12 + sp.phase) > 0 ? 4 : 1;
      ctx.beginPath(); ctx.moveTo(11, 1); ctx.lineTo(13 + flick, 1); ctx.lineTo(15 + flick, -1); ctx.moveTo(13 + flick, 1); ctx.lineTo(15 + flick, 3); ctx.stroke();
      ctx.restore();
    });
  }

  // Huginn and Muninn, Odin's ravens, cross the sky now and then (just for show).
  function drawRavens() {
    const period = 9;
    const cycle = Math.floor(g.t / period);
    const tt = (g.t % period) / 3.2;               // 0..1 while crossing
    if (tt > 1) return;
    const fromLeft = hash(cycle * 3) < 0.5;
    const y0 = LH * (0.15 + hash(cycle * 5) * 0.35);
    [0, 1].forEach(function (i) {
      const p = tt - i * 0.08;
      const x = fromLeft ? lerp(-30, LW + 30, p) : lerp(LW + 30, -30, p);
      const y = y0 + i * 22 + Math.sin(p * 6) * 6;
      const flap = Math.sin(g.t * 11 + i * 2);
      const dir = fromLeft ? 1 : -1;
      // shadow on the water
      raven(x + 14, y + 26, flap, dir, "rgba(0,0,0,.22)");
      raven(x, y, flap, dir, "#141016");
    });
  }
  function raven(x, y, flap, dir, colour) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();         // body
    ctx.beginPath(); ctx.arc(7, -0.5, 2.3, 0, Math.PI * 2); ctx.fill();                  // head
    ctx.beginPath(); ctx.moveTo(9, -1); ctx.lineTo(12, 0); ctx.lineTo(9, 0.8); ctx.fill(); // beak
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, -2.5); ctx.lineTo(-11, 2.5); ctx.fill(); // tail
    const w = 9 + flap * 4;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(0, -w, 4, -w * 1.1); ctx.lineTo(3, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(0, w, 4, w * 1.1); ctx.lineTo(3, 0); ctx.fill();
    ctx.restore();
  }

  // Odin's gold rings (like Draupnir), spinning as they float.
  function goldRing(x, y, sx, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    ctx.lineWidth = size * 0.42;
    ctx.strokeStyle = "#8a6420";
    ctx.beginPath(); ctx.arc(0.6, 0.8, size * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#e6c77a";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#fff1c4";
    ctx.lineWidth = size * 0.14;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.72, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }
  function drawCoins() {
    g.coinList.forEach(function (k) {
      if (k.taken) return;
      const y = sy(k.d);
      if (y < -20 || y > LH + 20) return;
      const sx = Math.max(0.25, Math.abs(Math.cos(g.t * 3 + k.phase)));
      const glow = ctx.createRadialGradient(k.x, y, 1, k.x, y, 15);
      glow.addColorStop(0, "rgba(255, 225, 140, .35)");
      glow.addColorStop(1, "rgba(255, 225, 140, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(k.x, y, 15, 0, Math.PI * 2); ctx.fill();
      goldRing(k.x, y, sx, 10);
    });
  }

  function drawWake() {
    if (g.trail.length < 2) return;
    ctx.lineCap = "round";
    for (let i = 1; i < g.trail.length; i++) {
      const p = g.trail[i - 1], q = g.trail[i];
      const age = (g.trail.length - i) / g.trail.length;
      const spread = 6 + age * 18;
      ctx.strokeStyle = "rgba(235, 248, 255, " + (0.4 * (1 - age)) + ")";
      ctx.lineWidth = 2.2;
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(p.x + s * spread, sy(p.d) + 30);
        ctx.lineTo(q.x + s * (spread - 0.6), sy(q.d) + 30);
        ctx.stroke();
      });
    }
  }

  function drawShip() {
    if (g.invuln > 0 && Math.floor(g.invuln * 10) % 2 === 0) return;  // blink after a hit
    const clan = opts.getClan ? opts.getClan() : null;
    const sail = clan ? clan.colour : "#7a1f1f";
    const x = g.x, y = boatY();
    const tilt = clamp(g.vx / 900, -0.25, 0.25);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    // oars, rowing
    const row = g.phase === "sail" || g.phase === "arrive" ? Math.sin(g.t * (g.boost > 0 ? 15 : 7)) * 0.35 : 0;
    ctx.strokeStyle = "#5a3a1e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const oy = -12 + i * 9;
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(s * 8, oy);
        ctx.lineTo(s * 24, oy + 6 + row * 10);
        ctx.stroke();
      });
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
    ctx.beginPath(); ctx.ellipse(0, 2, 5.5, 22, 0, 0, Math.PI * 2); ctx.fill();
    // shields along both sides
    const shieldCols = [sail, "#e6c77a"];
    for (let i = 0; i < 5; i++) {
      const sy0 = -14 + i * 8;
      [-1, 1].forEach(function (s, j) {
        ctx.fillStyle = shieldCols[(i + j) % 2];
        ctx.beginPath(); ctx.arc(s * 9.2, sy0, 3.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#3a2412"; ctx.lineWidth = 0.8; ctx.stroke();
      });
    }
    // dragon head (with gold eyes) at the bow, curled tail at the stern
    ctx.strokeStyle = "#4e2f16";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(-4, -36, 0, -40); ctx.stroke();
    ctx.fillStyle = "#6b4220";
    ctx.beginPath(); ctx.ellipse(0, -43, 4.2, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3.5, -46); ctx.lineTo(-6, -51); ctx.lineTo(-1.5, -47.5); ctx.fill();   // horns
    ctx.beginPath(); ctx.moveTo(3.5, -46); ctx.lineTo(6, -51); ctx.lineTo(1.5, -47.5); ctx.fill();
    ctx.fillStyle = "#e6c77a";
    ctx.beginPath(); ctx.arc(-1.9, -44.5, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1.9, -44.5, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(6, 37, 1, 40); ctx.quadraticCurveTo(-3, 38, 0, 36); ctx.stroke();
    // sail (seen from above: a striped yard across the ship)
    ctx.save();
    ctx.translate(0, -2);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(-21, 1, 42, 9);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#f3e9d2" : sail;
      ctx.fillRect(-21 + i * 7, -4, 7, 9);
    }
    ctx.strokeStyle = "#3a2412";
    ctx.lineWidth = 1;
    ctx.strokeRect(-21, -4, 42, 9);
    ctx.restore();
    ctx.restore();
  }
  function hull(ox, oy) {
    ctx.beginPath();
    ctx.moveTo(ox, oy - 32);
    ctx.bezierCurveTo(ox + 14, oy - 18, ox + 13, oy + 18, ox, oy + 32);
    ctx.bezierCurveTo(ox - 13, oy + 18, ox - 14, oy - 18, ox, oy - 32);
    ctx.closePath();
  }

  function drawPops() {
    ctx.textAlign = "center";
    ctx.font = "700 18px " + FONT_HEAD;
    g.pops.forEach(function (p) {
      ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillText(p.text, p.x + 1, p.y + 1);
      ctx.fillStyle = p.colour;
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    // voyage bar
    const bx = 16, bw = LW - 110, by = 18;
    ctx.fillStyle = "rgba(20, 12, 8, .55)";
    roundRect(bx - 6, by - 10, bw + 12, 20, 10); ctx.fill();
    ctx.fillStyle = "rgba(243, 233, 210, .25)";
    roundRect(bx, by - 3, bw, 6, 3); ctx.fill();
    const p = clamp(g.d / LENGTH, 0, 1);
    ctx.fillStyle = "#e6c77a";
    roundRect(bx, by - 3, Math.max(6, bw * p), 6, 3); ctx.fill();
    ctx.fillStyle = "#f3e9d2";
    ctx.beginPath(); ctx.arc(bx + bw * p, by, 5, 0, Math.PI * 2); ctx.fill();
    // Jelling's bind-rune at the end of the voyage
    ctx.fillStyle = "#e6c77a";
    ctx.font = "13px " + FONT_RUNE;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ᛒ", bx + bw + 1, by);
    ctx.textBaseline = "alphabetic";
    // coins
    const cx = LW - 80;
    ctx.fillStyle = "rgba(20, 12, 8, .55)";
    roundRect(cx, by - 13, 66, 26, 13); ctx.fill();
    goldRing(cx + 15, by, 1, 8);
    ctx.fillStyle = "#f3e9d2";
    ctx.font = "700 15px " + FONT_HEAD;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(g.coins), cx + 28, by + 1);
    ctx.textBaseline = "alphabetic";

    // "Row!" readiness: a small bar under the coins (full = ready)
    if (g.phase === "sail") {
      const ready = 1 - g.boostRest / BOOST_REST_S;
      ctx.fillStyle = "rgba(20, 12, 8, .55)";
      roundRect(cx, by + 17, 66, 8, 4); ctx.fill();
      ctx.fillStyle = ready >= 1 ? "#9be38a" : "rgba(243, 233, 210, .55)";
      roundRect(cx + 2, by + 19, Math.max(4, 62 * ready), 4, 2); ctx.fill();
    }

    if (g.banner) {
      const a = clamp(g.banner.life / 0.4, 0, 1) * clamp((2.2 - g.banner.life) / 0.3, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(10, 30, 26, .7)";
      roundRect(LW / 2 - 120, 44, 240, 52, 10); ctx.fill();
      ctx.strokeStyle = "rgba(95, 174, 143, .9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#bff3df";
      ctx.font = "700 17px " + FONT_HEAD;
      ctx.fillText(g.banner.text, LW / 2, 67);
      ctx.font = "italic 14px " + '"EB Garamond", Georgia, serif';
      ctx.fillStyle = "#f3e9d2";
      ctx.fillText(g.banner.sub, LW / 2, 86);
      ctx.globalAlpha = 1;
    }

    if (g.phase === "count") {
      const n = Math.ceil(g.countT - 0.2);
      const text = n > 0 ? String(n) : "Row!";
      const f = g.countT - Math.floor(g.countT);
      ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(54 + f * 14) + "px " + FONT_HEAD;
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillText(text, LW / 2 + 2, LH * 0.42 + 2);
      ctx.fillStyle = "#f3e9d2";
      ctx.fillText(text, LW / 2, LH * 0.42);
      ctx.font = "italic 17px " + '"EB Garamond", Georgia, serif';
      ctx.fillText(opts.hint ? opts.hint() : "Drag to steer. Beware the serpent!", LW / 2, LH * 0.42 + 36);
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

  /* ---------- loop ---------- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    if (running) { draw(); raf = requestAnimationFrame(frame); }
  }

  /* ---------- input ---------- */
  function toLogical(e) {
    const rect = cv.getBoundingClientRect();
    const k = LW / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  }
  const KEYS_X = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  const KEYS_Y = { ArrowUp: 1, w: 1, W: 1, ArrowDown: -1, s: -1, S: -1 };
  function bindInput() {
    cv.addEventListener("pointerdown", function (e) {
      if (!g) return;
      const p = toLogical(e);
      drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, sx: g.x, so: g.oy, t: performance.now() };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      const p = toLogical(e);
      drag.x = p.x; drag.y = p.y;
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) {
      cv.addEventListener(t, function () {
        // a quick tap without moving = "Row!"
        if (t === "pointerup" && drag && performance.now() - drag.t < 220 &&
            Math.abs(drag.x - drag.x0) < 6 && Math.abs(drag.y - drag.y0) < 6) rowHard();
        drag = null;
      });
    });
    window.addEventListener("keydown", function (e) {
      if (!running) return;
      if (e.key in KEYS_X) { keyX = KEYS_X[e.key]; e.preventDefault(); }
      if (e.key in KEYS_Y) { keyY = KEYS_Y[e.key]; e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { rowHard(); e.preventDefault(); }
    });
    window.addEventListener("keyup", function (e) {
      if (e.key in KEYS_X && keyX === KEYS_X[e.key]) keyX = 0;
      if (e.key in KEYS_Y && keyY === KEYS_Y[e.key]) keyY = 0;
    });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) { running = false; cancelAnimationFrame(raf); g.paused = true; }
      else if (!document.hidden && g && g.paused) { g.paused = false; resume(); }
    });
  }
  function resume() {
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- public ---------- */
  return {
    init: function (canvas, options) {
      cv = canvas;
      ctx = cv.getContext("2d");
      opts = options || {};
      bindInput();
    },
    start: function () {
      cancelAnimationFrame(raf);
      drag = null; keyX = 0; keyY = 0;
      g = newRun();
      resize();
      resume();
    },
    // Draw the fjord standing still (behind the intro card).
    preview: function () {
      cancelAnimationFrame(raf);
      running = false;
      g = newRun();
      g.phase = "idle";
      resize();
      draw();
    },
    stop: function () {
      running = false;
      cancelAnimationFrame(raf);
      if (g) g.paused = false;
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
    isRunning: function () { return running; },
    LENGTH: LENGTH
  };
})();
