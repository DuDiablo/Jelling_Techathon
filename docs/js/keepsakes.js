/* =====================================================================
   HARALD'S QUEST — KEEPSAKES
   Images a visitor can save after the crown ceremony:
   - the rune stone with their name(s) carved in it
   - a "Ruler of the Runes" certificate (names, runes, clan, date, quest time)
   - a rune alphabet card for writing secret messages
   Everything is drawn on a <canvas> in the browser and saved as PNG.
   No libraries, nothing is uploaded.
   ===================================================================== */

const Keepsakes = (function () {
  "use strict";

  const C = {
    night: "#140c07",
    hearth: "#3a2416",
    gold: "#d9ad52",
    paleGold: "#f6e2a0",
    red: "#9e2a1c",
    parchment: "#e9dcc0",
    ink: "#2b1a12",
    inkSoft: "#5a4632",
    blood: "#7a1f1f"
  };
  const F = {
    title: '"Cinzel Decorative", "Cinzel", Georgia, serif',
    head: '"Cinzel", Georgia, serif',
    body: '"EB Garamond", Garamond, Georgia, serif',
    rune: '"Noto Sans Runic", "Segoe UI Historic", "Segoe UI Symbol", sans-serif'
  };
  const PLACE = "Kongernes Jelling";

  /* Make sure the web fonts are loaded before drawing, or the canvas falls back to Arial. */
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 40px "Cinzel Decorative"'),
      document.fonts.load('700 40px "Cinzel"'),
      document.fonts.load('600 40px "Cinzel"'),
      document.fonts.load('400 40px "EB Garamond"'),
      document.fonts.load('italic 400 40px "EB Garamond"'),
      document.fonts.load('40px "Noto Sans Runic"', "ᚼᛅᚱᛅᛚᛏ")
    ]).catch(function () { /* draw with fallbacks */ });
  }

  /* Small seeded random, so the granite looks the same every time. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function canvas(w, h) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    return cv;
  }

  /* Shrink a font until the text fits. */
  function fitFont(ctx, text, maxWidth, size, minSize, family, weight) {
    let s = size;
    do {
      ctx.font = (weight || "") + " " + s + "px " + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      s -= 2;
    } while (s > minSize);
    return s;
  }

  function spaced(ctx, text, x, y, spacing) {
    // letter-spacing by hand (canvas letterSpacing isn't everywhere yet)
    const chars = Array.from(text);
    let w = 0;
    chars.forEach(function (ch) { w += ctx.measureText(ch).width + spacing; });
    w -= spacing;
    let cx = x - w / 2;
    const align = ctx.textAlign;
    ctx.textAlign = "left";
    chars.forEach(function (ch) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; });
    ctx.textAlign = align;
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + amt), g = Math.min(255, (n >> 8 & 255) + amt), b = Math.min(255, (n & 255) + amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  /* The boulder outline from #stone-clip, scaled to a box. */
  function stonePath(ctx, x, y, w, h) {
    const P = function (px, py) { return [x + px * w, y + py * h]; };
    ctx.beginPath();
    ctx.moveTo.apply(ctx, P(.05, .99));
    ctx.bezierCurveTo.apply(ctx, P(.015, .82).concat(P(0, .6), P(.035, .4)));
    ctx.bezierCurveTo.apply(ctx, P(.07, .2).concat(P(.2, .06), P(.38, .025)));
    ctx.bezierCurveTo.apply(ctx, P(.47, .005).concat(P(.55, 0), P(.63, .02)));
    ctx.bezierCurveTo.apply(ctx, P(.78, .055).concat(P(.9, .15), P(.955, .32)));
    ctx.bezierCurveTo.apply(ctx, P(.995, .46).concat(P(1, .7), P(.965, .99)));
    ctx.closePath();
  }

  /* The carved border band (same curve as .runestone__band, in percent). */
  function bandPath(ctx, x, y, w, h) {
    const P = function (px, py) { return [x + px / 100 * w, y + py / 100 * h]; };
    ctx.beginPath();
    ctx.moveTo.apply(ctx, P(11, 93));
    ctx.bezierCurveTo.apply(ctx, P(8, 78).concat(P(7, 58), P(11, 42)));
    ctx.bezierCurveTo.apply(ctx, P(16, 25).concat(P(30, 14), P(47, 12)));
    ctx.bezierCurveTo.apply(ctx, P(64, 10).concat(P(79, 17), P(87, 31)));
    ctx.bezierCurveTo.apply(ctx, P(93, 44).concat(P(93, 69), P(89, 93)));
  }

  function drawGranite(ctx, x, y, w, h, seed) {
    const rand = rng(seed || 7);
    ctx.save();
    stonePath(ctx, x, y, w, h);
    ctx.clip();
    const base = ctx.createLinearGradient(x, y, x + w, y + h);
    base.addColorStop(0, "#9a968e");
    base.addColorStop(.5, "#7b7770");
    base.addColorStop(1, "#5b5852");
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    // soft blotches
    for (let i = 0; i < 70; i++) {
      const bx = x + rand() * w, by = y + rand() * h, r = 30 + rand() * 90;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const dark = rand() < .5;
      g.addColorStop(0, dark ? "rgba(40,36,32,.16)" : "rgba(235,228,214,.14)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    // mica (dark), quartz (light) and feldspar (pink) specks
    const area = w * h;
    for (let i = 0; i < area / 55; i++) {
      const sx = x + rand() * w, sy = y + rand() * h, k = rand();
      const s = k < .02 ? 2 + rand() * 3 : .6 + rand() * 1.6;
      ctx.fillStyle = k < .45 ? "rgba(30,27,24," + (.25 + rand() * .4) + ")"
        : k < .85 ? "rgba(240,236,228," + (.18 + rand() * .35) + ")"
        : "rgba(196,140,120," + (.25 + rand() * .35) + ")";
      ctx.fillRect(sx, sy, s, s);
    }
    // rounded shading: light from the top-left, dark towards the edges and the ground
    const lit = ctx.createRadialGradient(x + w * .35, y + h * .25, w * .05, x + w * .5, y + h * .55, w * .75);
    lit.addColorStop(0, "rgba(255,250,240,.22)");
    lit.addColorStop(.55, "rgba(0,0,0,0)");
    lit.addColorStop(1, "rgba(10,6,3,.55)");
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w, h);
    const ground = ctx.createLinearGradient(0, y + h * .75, 0, y + h);
    ground.addColorStop(0, "rgba(0,0,0,0)");
    ground.addColorStop(1, "rgba(15,9,4,.45)");
    ctx.fillStyle = ground;
    ctx.fillRect(x, y, w, h);
    // carved border band: dark groove + pale lip
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    bandPath(ctx, x, y, w, h);
    ctx.strokeStyle = "rgba(25,18,12,.55)";
    ctx.lineWidth = w * .022;
    ctx.stroke();
    ctx.save();
    ctx.translate(w * .004, h * .004);
    bandPath(ctx, x, y, w, h);
    ctx.strokeStyle = "rgba(255,248,236,.2)";
    ctx.lineWidth = w * .006;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* Draw one carved rune: shadow in the groove, a pale lit edge, then the red paint. */
  function carvedText(ctx, text, x, y, paint) {
    ctx.fillStyle = "rgba(10,6,3,.7)";
    ctx.fillText(text, x - 2, y - 2);
    ctx.fillStyle = "rgba(255,248,236,.28)";
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = paint || C.red;
    ctx.fillText(text, x, y);
  }

  /* Rune lines inside a box: one name per line, runes with their Latin letters below. */
  function drawRuneLines(ctx, lines, box, opts) {
    const o = opts || {};
    const maxCells = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([1]));
    const cellK = .78, latinK = .22, lineK = 1.5;
    let fs = Math.min(o.max || 150, box.w / (maxCells * cellK), box.h / (lines.length * lineK));
    fs = Math.max(fs, 18);
    const lineH = fs * lineK;
    let y = box.y + (box.h - lineH * lines.length) / 2 + fs * .95;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    lines.forEach(function (runes) {
      const widths = runes.map(function (r) { return r.gap ? fs * .4 : fs * cellK; });
      const total = widths.reduce(function (a, b) { return a + b; }, 0);
      let x = box.x + (box.w - total) / 2;
      runes.forEach(function (r, i) {
        const cx = x + widths[i] / 2;
        if (r.gap) {
          ctx.font = (fs * .55) + "px " + F.rune;
          ctx.fillStyle = "rgba(30,20,12,.6)";
          ctx.fillText("᛫", cx, y - fs * .25);
        } else {
          ctx.font = fs + "px " + F.rune;
          carvedText(ctx, r.rune, cx, y, o.paint);
          if (o.latin !== false) {
            ctx.font = "700 " + Math.round(fs * latinK) + "px " + F.head;
            ctx.fillStyle = o.latinColour || "rgba(250,244,230,.9)";
            ctx.fillText(r.latin.toUpperCase(), cx, y + fs * .32);
          }
        }
        x += widths[i];
      });
      y += lineH;
    });
  }

  function joinNames(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  function formatDate(d) {
    try { return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return d.toDateString(); }
  }
  function formatDuration(ms) {
    if (!ms || ms < 0) return "";
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    if (h) return h + " h " + m + " min";
    if (m) return m + " min " + s + " s";
    return s + " s";
  }

  /* ---------------- 1. The rune stone ---------------- */
  function stone(data) {
    const W = 1080, H = 1350;
    const cv = canvas(W, H);
    const ctx = cv.getContext("2d");
    const bg = ctx.createRadialGradient(W / 2, H * .42, 40, W / 2, H * .5, H * .75);
    bg.addColorStop(0, C.hearth);
    bg.addColorStop(1, C.night);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // faint gold rays behind the stone
    ctx.save();
    ctx.translate(W / 2, H * .5);
    for (let i = 0; i < 24; i++) {
      ctx.rotate(Math.PI / 12);
      ctx.fillStyle = "rgba(217,173,82,.035)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30, -H);
      ctx.lineTo(30, -H);
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = C.gold;
    ctx.font = "700 30px " + F.head;
    spaced(ctx, "HARALD'S QUEST", W / 2, 96, 9);
    ctx.font = "700 " + fitFont(ctx, "Ruler of the Runes", W - 160, 64, 30, F.title, "700") + "px " + F.title;
    ctx.fillStyle = C.paleGold;
    ctx.fillText(data.lines.length > 1 ? "Rulers of the Runes" : "Ruler of the Runes", W / 2, 172);

    const sx = 150, sy = 230, sw = W - 300, sh = 820;
    // ground shadow
    ctx.save();
    ctx.translate(W / 2, sy + sh - 6);
    ctx.scale(1, .14);
    const sh0 = ctx.createRadialGradient(0, 0, 10, 0, 0, sw * .62);
    sh0.addColorStop(0, "rgba(0,0,0,.7)");
    sh0.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh0;
    ctx.fillRect(-sw, -sw * .62, sw * 2, sw * 1.24);
    ctx.restore();
    drawGranite(ctx, sx, sy, sw, sh, 1234);
    drawRuneLines(ctx, data.lines, { x: sx + sw * .18, y: sy + sh * .2, w: sw * .64, h: sh * .68 }, { max: 150 });

    ctx.textAlign = "center";
    ctx.fillStyle = C.parchment;
    const names = joinNames(data.names);
    ctx.font = "700 " + fitFont(ctx, names, W - 140, 48, 24, F.head, "700") + "px " + F.head;
    ctx.fillText(names, W / 2, sy + sh + 110);
    if (data.clan) {
      ctx.font = "italic 40px " + F.body;
      ctx.fillStyle = data.clan.gem || C.gold;
      ctx.fillText("of the " + data.clan.name, W / 2, sy + sh + 165);
    }
    ctx.font = "italic 28px " + F.body;
    ctx.fillStyle = "rgba(233,220,192,.7)";
    ctx.fillText(PLACE + " · " + formatDate(data.date || new Date()), W / 2, H - 50);
    return cv;
  }

  /* ---------------- 2. The certificate (A4 landscape, prints well) ---------------- */
  function certificate(data) {
    const W = 1754, H = 1240;
    const cv = canvas(W, H);
    const ctx = cv.getContext("2d");
    const rand = rng(99);
    const many = data.names.length > 1;
    const clanCol = data.clan ? data.clan.colour : C.blood;

    // parchment with fibres and darker edges
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#f5ecd6");
    bg.addColorStop(1, "#e2cfa6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = "rgba(120,86,48," + (rand() * .08) + ")";
      ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 6, 1);
    }
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .62);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(110,70,30,.32)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // frame: ink outer line, gold inner line, clan-coloured corner diamonds
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    ctx.strokeStyle = "#c9a14a";
    ctx.lineWidth = 3;
    ctx.strokeRect(66, 66, W - 132, H - 132);
    [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]].forEach(function (p) {
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = clanCol;
      ctx.fillRect(-16, -16, 32, 32);
      ctx.strokeStyle = "#c9a14a";
      ctx.lineWidth = 3;
      ctx.strokeRect(-16, -16, 32, 32);
      ctx.restore();
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 28px " + F.head;
    spaced(ctx, "HARALD'S QUEST · " + PLACE.toUpperCase(), W / 2, 170, 8);

    ctx.fillStyle = C.blood;
    ctx.font = "700 " + fitFont(ctx, "Ruler of the Runes", W - 300, 104, 50, F.title, "700") + "px " + F.title;
    ctx.fillText(many ? "Rulers of the Runes" : "Ruler of the Runes", W / 2, 290);

    ctx.fillStyle = C.ink;
    ctx.font = "italic 42px " + F.body;
    ctx.fillText(many ? "This certifies that" : "This certifies that", W / 2, 385);

    const names = joinNames(data.names);
    ctx.font = "700 " + fitFont(ctx, names, W - 360, 84, 34, F.head, "700") + "px " + F.head;
    ctx.fillText(names, W / 2, 485);

    // all names in runes on one line, separated by the runic word mark
    const runeLine = data.lines.map(function (runes) {
      return runes.map(function (r) { return r.gap ? " " : r.rune; }).join("");
    }).join("  ᛫  ");
    ctx.font = fitFont(ctx, runeLine, W - 360, 96, 30, F.rune, "") + "px " + F.rune;
    carvedText(ctx, runeLine, W / 2, 610, C.red);

    let y = 700;
    if (data.clan) {
      ctx.font = "italic 44px " + F.body;
      ctx.fillStyle = C.ink;
      const pre = "of the ";
      const preW = ctx.measureText(pre).width;
      ctx.font = "700 46px " + F.head;
      const clanW = ctx.measureText(data.clan.name).width;
      const startX = W / 2 - (preW + clanW) / 2;
      ctx.textAlign = "left";
      ctx.font = "italic 44px " + F.body;
      ctx.fillStyle = C.ink;
      ctx.fillText(pre, startX, y);
      ctx.font = "700 46px " + F.head;
      ctx.fillStyle = clanCol;
      ctx.fillText(data.clan.name, startX + preW, y);
      ctx.textAlign = "center";
      y += 80;
    }
    ctx.fillStyle = C.ink;
    ctx.font = "40px " + F.body;
    ctx.fillText((many ? "found" : "found") + " the three runes ᚲ ᚺ ᛒ in the halls of King Harald Bluetooth", W / 2, y);
    ctx.fillText((many ? "and are" : "and is") + " hailed by all as " + (many ? "Rulers of the Runes." : "Ruler of the Runes."), W / 2, y + 56);
    // gold from the "Sail to Jelling" voyage
    if (data.gold > 0) {
      ctx.font = "italic 32px " + F.body;
      ctx.fillStyle = clanCol;
      ctx.fillText("On the voyage to Jelling the longship won " + data.gold + " gold" +
        (data.clan ? " for the " + data.clan.name : "") + ".", W / 2, y + 100);
    }

    // bottom row: date · wax seal · quest time
    const by = 1010;
    function field(label, value, x) {
      ctx.textAlign = "center";
      ctx.fillStyle = C.ink;
      ctx.font = "italic 40px " + F.body;
      ctx.fillText(value || "—", x, by);
      ctx.strokeStyle = C.inkSoft;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 190, by + 18);
      ctx.lineTo(x + 190, by + 18);
      ctx.stroke();
      ctx.fillStyle = C.inkSoft;
      ctx.font = "600 22px " + F.head;
      spaced(ctx, label.toUpperCase(), x, by + 56, 5);
    }
    field("Date", formatDate(data.date || new Date()), 420);
    field("Quest time", formatDuration(data.durationMs), W - 420);

    // wax seal in the clan colour with the clan's rune
    const cx = W / 2, cy = by - 20, r = 100;
    ctx.save();
    ctx.shadowColor = "rgba(40,20,10,.45)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2, rr = r * (.93 + (i % 2 ? .05 : 0) + rand() * .03);
      ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    const wax = ctx.createRadialGradient(cx - 30, cy - 34, 10, cx, cy, r);
    wax.addColorStop(0, lighten(clanCol, 60));
    wax.addColorStop(.6, clanCol);
    wax.addColorStop(1, data.clan ? data.clan.deep : C.blood);
    ctx.fillStyle = wax;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * .7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,210,.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * .64, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = (data.clan ? 96 : 76) + "px " + F.rune;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillText(data.clan ? data.clan.rune : "ᚼᛒ", cx + 2, cy + 34);
    ctx.fillStyle = "#fbe9c4";
    ctx.fillText(data.clan ? data.clan.rune : "ᚼᛒ", cx, cy + 32);

    ctx.fillStyle = C.inkSoft;
    ctx.font = "italic 28px " + F.body;
    ctx.fillText("Written in the Younger Futhark, the runes King Harald carved on the Jelling stones.", W / 2, H - 110);
    return cv;
  }

  /* ---------------- 3. The rune alphabet card ---------------- */
  function alphabet(data) {
    const W = 1080, H = 1500;
    const cv = canvas(W, H);
    const ctx = cv.getContext("2d");
    const rand = rng(5);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#f5ecd6");
    bg.addColorStop(1, "#e2cfa6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = "rgba(120,86,48," + (rand() * .08) + ")";
      ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 6, 1);
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(34, 34, W - 68, H - 68);
    ctx.strokeStyle = "#c9a14a";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(52, 52, W - 104, H - 104);

    ctx.textAlign = "center";
    ctx.fillStyle = C.inkSoft;
    ctx.font = "600 24px " + F.head;
    spaced(ctx, "HARALD'S QUEST", W / 2, 130, 8);
    ctx.fillStyle = C.blood;
    ctx.font = "700 72px " + F.title;
    ctx.fillText("The Rune Alphabet", W / 2, 220);
    ctx.fillStyle = C.ink;
    ctx.font = "italic 36px " + F.body;
    ctx.fillText("Write secret messages to your friends!", W / 2, 280);

    const cols = 6, cellW = 150, cellH = 150, gx = (W - cols * cellW) / 2, gy = 320;
    data.letters.forEach(function (item, i) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = gx + col * cellW, y = gy + row * cellH;
      ctx.fillStyle = "rgba(255,249,232,.55)";
      ctx.strokeStyle = "rgba(90,70,50,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(x + 10, y + 10, cellW - 20, cellH - 20);
      ctx.fill();
      ctx.stroke();
      ctx.font = (item.rune.length > 1 ? 58 : 82) + "px " + F.rune;
      ctx.fillStyle = C.red;
      ctx.fillText(item.rune, x + cellW / 2, y + 90);
      ctx.font = "700 30px " + F.head;
      ctx.fillStyle = C.ink;
      ctx.fillText(item.latin, x + cellW / 2, y + 128);
    });

    const rows = Math.ceil(data.letters.length / cols);
    let y = gy + rows * cellH + 60;
    ctx.font = "italic 30px " + F.body;
    ctx.fillStyle = C.inkSoft;
    ctx.fillText("The Vikings had only 16 runes, so some letters share one.", W / 2, y);
    ctx.fillText("Put ᛫ between words.", W / 2, y + 42);
    if (data.example) {
      ctx.font = "600 26px " + F.head;
      ctx.fillStyle = C.ink;
      spaced(ctx, "EXAMPLE", W / 2, y + 115, 6);
      ctx.font = fitFont(ctx, data.example.runes, W - 200, 76, 30, F.rune, "") + "px " + F.rune;
      ctx.fillStyle = C.red;
      ctx.fillText(data.example.runes, W / 2, y + 195);
      ctx.font = "italic 32px " + F.body;
      ctx.fillStyle = C.ink;
      ctx.fillText(data.example.latin, W / 2, y + 240);
    }
    ctx.font = "italic 26px " + F.body;
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(PLACE, W / 2, H - 80);
    return cv;
  }

  /* Save a canvas as a PNG. Uses the phone's share sheet when it can share files
     (so it lands in Photos), otherwise a normal download. */
  function save(cv, filename) {
    return new Promise(function (resolve) {
      cv.toBlob(function (blob) {
        if (!blob) { resolve(false); return; }
        try {
          const file = new File([blob], filename, { type: "image/png" });
          const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
          if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: "Harald's Quest" })
              .then(function () { resolve(true); })
              .catch(function () { download(blob, filename); resolve(true); });
            return;
          }
        } catch (e) { /* fall back to download */ }
        download(blob, filename);
        resolve(true);
      }, "image/png");
    });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  return {
    fontsReady: fontsReady,
    stone: stone,
    certificate: certificate,
    alphabet: alphabet,
    save: save,
    formatDuration: formatDuration
  };
})();
