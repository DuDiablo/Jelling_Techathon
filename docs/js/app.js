/* =====================================================================
   HARALD'S QUEST — APP
   Game state, screens, overlays, NFC (?rune=N) and debug (?debug=1).
   Texts live in content.js, Bluetooth in ble.js, audio in audio.js.
   ===================================================================== */

(function () {
  "use strict";

  const KEY_PROGRESS = "haraldProgress";
  // false = every page refresh starts the quest from zero (testing / demos).
  // true  = collected runes are remembered after a refresh. NOTE: the NFC
  //         fallback (?rune=N) opens a fresh page per tag, so it needs true.
  const PERSIST_PROGRESS = false;
  const KEY_SHOW_TEXT = "haraldShowText";
  const OVERLAY_MS = 4000;
  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------------- Storage (always wrapped: may throw in private mode) ---------------- */
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* ignore */ }
  }

  /* ---------------- State ---------------- */
  const state = {
    progress: PERSIST_PROGRESS ? clampProgress(parseInt(load(KEY_PROGRESS), 10)) : 0, // runes collected, in order
    showText: load(KEY_SHOW_TEXT) !== "0",
    busy: false,
    screen: "start",
    previous: "start",
    drawnProgress: null,     // progress the map route/seals were last drawn for
    story: null              // { rune, fresh, final }
  };

  function clampProgress(n) {
    if (!n || n < 0) return 0;
    return Math.min(n, RUNES.length);
  }
  function setProgress(n) {
    state.progress = clampProgress(n);
    if (PERSIST_PROGRESS) save(KEY_PROGRESS, state.progress);
  }
  function isComplete() { return state.progress >= RUNES.length; }

  /* ---------------- Screens ---------------- */
  let transitionTimer = null;
  let finishTransition = null;

  function showScreen(name) {
    if (finishTransition) finishTransition();
    if (name === state.screen) { afterEnter(name); return; }

    const from = $("#screen-" + state.screen);
    const to = $("#screen-" + name);
    if (state.screen === "story" || state.screen === "finale") AudioPlayer.stop();
    if (name !== "settings") hideConfirms();

    state.previous = state.screen;
    state.screen = name;
    document.body.classList.toggle("is-finale", name === "finale");
    document.body.classList.toggle("is-mapbg", name !== "finale");

    to.hidden = false;
    to.classList.add("is-entering");
    from.classList.add("is-leaving");
    window.scrollTo(0, 0);

    finishTransition = function () {
      clearTimeout(transitionTimer);
      finishTransition = null;
      from.hidden = true;
      from.classList.remove("is-leaving");
      to.classList.remove("is-entering");
      afterEnter(name);
    };
    transitionTimer = setTimeout(finishTransition, reducedMotion ? 0 : 320);
  }

  function afterEnter(name) {
    if (name === "map") animateMap();
  }

  /* ---------------- Map ---------------- */
  const MAP_W = 400, MAP_H = 500;
  const ENTRANCE = { x: 200, y: 444 };

  function runePoint(rune) { return { x: rune.mapX / 100 * MAP_W, y: rune.mapY / 100 * MAP_H }; }

  function routePath(points) {
    let d = "M" + points[0].x.toFixed(1) + " " + points[0].y.toFixed(1);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const bend = (i % 2 ? 0.22 : -0.22);
      const cx = mx - dy * bend, cy = my + dx * bend;
      d += " Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + b.x.toFixed(1) + " " + b.y.toFixed(1);
    }
    return d;
  }

  function buildMap() {
    const markers = $("#markers");
    const tiles = $("#tiles");
    RUNES.forEach(function (rune, i) {
      const m = document.createElement("div");
      m.className = "marker" + (rune.mapX < 32 ? " is-edge-left" : rune.mapX > 68 ? " is-edge-right" : "");
      m.id = "marker-" + i;
      m.setAttribute("role", "img");
      m.style.left = rune.mapX + "%";
      m.style.top = rune.mapY + "%";
      m.innerHTML =
        '<svg class="marker__seal" aria-hidden="true"><use href="#seal"/></svg>' +
        '<span class="marker__glyph" aria-hidden="true">' + rune.symbol + "</span>" +
        '<span class="marker__badge" aria-hidden="true"><svg class="i-lock"><use href="#icon-lock"/></svg><svg class="i-check"><use href="#icon-check"/></svg></span>' +
        '<span class="marker__name" aria-hidden="true">' + escapeHtml(rune.room) + "</span>";
      markers.appendChild(m);

      const t = document.createElement("li");
      t.className = "tile";
      t.id = "tile-" + i;
      tiles.appendChild(t);
    });

    const all = [ENTRANCE].concat(RUNES.map(runePoint));
    $("#route-ghost").setAttribute("d", routePath(all));
  }

  function renderMap() {
    const n = RUNES.length;
    $("#progress-label").textContent = "Runes found: " + state.progress + " / " + n;

    RUNES.forEach(function (rune, i) {
      const status = i < state.progress ? "collected" : (i === state.progress ? "next" : "locked");
      const m = $("#marker-" + i);
      m.classList.remove("is-locked", "is-next", "is-collected");
      m.classList.add("is-" + status);
      m.setAttribute("aria-label", rune.room + ": " + (status === "collected" ? "collected" : status === "next" ? "next rune" : "locked"));

      const t = $("#tile-" + i);
      t.className = "tile" + (status === "collected" ? " is-collected" : "") + (status === "next" ? " is-current" : "");
      t.textContent = status === "collected" ? rune.symbol : "?";
      t.setAttribute("aria-label", "Rune " + (i + 1) + ": " + (status === "collected" ? "collected" : "not found yet"));
    });

    const next = RUNES[state.progress];
    $("#hint-text").textContent = next ? next.hint : (FINISHED.hint || FINISHED.title);
  }

  function animateMap() {
    renderMap();
    const target = Math.min(state.progress, RUNES.length - 1);
    const points = [ENTRANCE].concat(RUNES.slice(0, target + 1).map(runePoint));
    const d = routePath(points);
    const drawn = $("#route-drawn");
    const reveal = $("#route-reveal");
    const changed = state.drawnProgress !== state.progress;
    drawn.setAttribute("d", d);
    reveal.setAttribute("d", d);

    if (changed) {
      // Stamp seals collected since the last time the map was shown.
      if (state.drawnProgress !== null) {
        for (let i = state.drawnProgress; i < state.progress; i++) {
          const m = $("#marker-" + i);
          if (!m) continue;
          m.classList.remove("is-stamping");
          void m.offsetWidth;
          m.classList.add("is-stamping");
          setTimeout(m.classList.remove.bind(m.classList, "is-stamping"), 800);
        }
      }
      reveal.classList.remove("is-drawing");
      void reveal.getBoundingClientRect();
      reveal.classList.add("is-drawing");
      state.drawnProgress = state.progress;
    }
  }

  /* ---------------- Status line ---------------- */
  let statusTimer = null;
  function setStatus(text, isError) {
    const el = $("#status");
    clearTimeout(statusTimer);
    el.classList.add("is-changing");
    statusTimer = setTimeout(function () {
      el.textContent = text || "";
      el.classList.toggle("is-error", !!isError);
      el.classList.remove("is-changing");
    }, reducedMotion ? 0 : 200);
  }

  /* ---------------- Scan button ---------------- */
  function setScanBusy(stage) {
    const btn = $("#scan-btn");
    const text = $("#scan-text");
    if (stage) {
      btn.classList.add("is-busy");
      btn.setAttribute("aria-busy", "true");
      text.textContent = stage === "connecting" ? "Connecting…" : "Searching for runes…";
    } else {
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
      text.textContent = connections.size ? "Connect another rune" : "Connect rune";
    }
  }

  const NO_BLE_MSG = "Use Chrome on Android, or tap the rune's NFC tag.";

  /* ---------------- "Press the rune" connections ----------------
     The phone connects to each rune once and stays connected.
     Pressing the physical rune sends its number → handleRune(). */
  const connections = new Map(); // device.id → conn
  const lastPress = {};          // rune id → time, to ignore double notifications
  const PRESS_DEBOUNCE_MS = 1500;

  function runeForName(name) {
    const n = parseInt(String(name || "").replace(RUNE_NAME_PREFIX, ""), 10);
    return RUNES.find(function (r) { return r.id === n; }) || null;
  }

  function renderConnections() {
    const el = $("#connected");
    const list = Array.from(connections.values()).map(function (c) {
      const r = runeForName(c.name);
      return r ? r.symbol : c.name;
    });
    el.textContent = list.length ? "Connected runes: " + list.join(" · ") : "";
    el.hidden = !list.length;
    setScanBusy(false);
  }

  function onRunePress(id, conn) {
    const now = Date.now();
    if (lastPress[id] && now - lastPress[id] < PRESS_DEBOUNCE_MS) return;
    lastPress[id] = now;
    handleRune(id, conn, { keepConnected: true });
  }

  function onRuneDisconnect(conn) {
    if (!connections.has(conn.device.id)) return;
    connections.delete(conn.device.id);
    renderConnections();
    const r = runeForName(conn.name);
    setStatus((r ? "Rune " + r.symbol : conn.name) + " lost connection. Tap Connect rune to reconnect.", true);
  }

  /* ---------------- Rune chooser sheet ----------------
     Our own themed step before the browser's Bluetooth window (which
     cannot be styled). Picking a rune narrows that window to one entry,
     or skips it entirely when the phone already knows the rune. */
  let knownByName = {};          // "RUNE_2" → BluetoothDevice (already paired on this site)
  const quietFailed = {};        // name → true once a quiet reconnect failed

  function isRuneConnected(id) {
    return Array.from(connections.values()).some(function (c) {
      const r = runeForName(c.name);
      return r && r.id === id && RuneBLE.isConnected(c);
    });
  }

  function renderChooser() {
    const list = $("#chooser-list");
    list.replaceChildren();
    RUNES.forEach(function (rune, i) {
      const connected = isRuneConnected(rune.id);
      const status = i < state.progress ? "collected" : (i === state.progress ? "next" : "locked");
      const stateText = connected ? "Connected. Press the rune."
        : status === "next" ? "Your next rune"
        : status === "collected" ? "Already collected"
        : "Not found yet";
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice is-" + status;
      b.setAttribute("data-choose", String(rune.id));
      b.disabled = connected;
      b.innerHTML =
        '<span class="choice__seal" aria-hidden="true">' + rune.symbol + "</span>" +
        '<span class="choice__body"><span class="choice__room">' + escapeHtml(rune.room) + "</span>" +
        '<span class="choice__state">' + stateText + "</span></span>" +
        (connected ? '<span class="choice__tag">● Linked</span>'
          : knownByName[RUNE_NAME_PREFIX + rune.id] && !quietFailed[RUNE_NAME_PREFIX + rune.id] ? '<span class="choice__tag">Paired</span>' : "");
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  async function openChooser() {
    if (state.busy) return;
    if (!RuneBLE.isSupported()) { setStatus(NO_BLE_MSG, true); return; }
    renderChooser();
    const sheet = $("#chooser");
    sheet.classList.remove("is-leaving");
    sheet.hidden = false;
    focusFirstChoice();
    // Look up runes this phone already paired with (async; refresh tags when known).
    const known = await RuneBLE.knownDevices();
    knownByName = {};
    known.forEach(function (d) { knownByName[d.name] = d; });
    if (!sheet.hidden && known.length) { renderChooser(); focusFirstChoice(); }
  }

  function focusFirstChoice() {
    const sheet = $("#chooser");
    const first = sheet.querySelector(".choice.is-next:not(:disabled)") || sheet.querySelector(".choice:not(:disabled)") || sheet.querySelector(".sheet__close");
    if (first) first.focus();
  }

  function closeChooser() {
    const sheet = $("#chooser");
    if (sheet.hidden) return;
    sheet.classList.add("is-leaving");
    setTimeout(function () { sheet.hidden = true; sheet.classList.remove("is-leaving"); $("#scan-btn").focus(); }, reducedMotion ? 0 : 180);
  }

  /* id = 1/2/3 to connect a specific rune, or null for "show all runes". */
  async function connectRune(id) {
    if (state.busy) return;
    if (!RuneBLE.isSupported()) { setStatus(NO_BLE_MSG, true); return; }
    const name = id ? RUNE_NAME_PREFIX + id : null;
    const known = name && knownByName[name] && !quietFailed[name] ? knownByName[name] : null;
    $("#chooser").hidden = true;
    state.busy = true;
    setScanBusy(known ? "connecting" : "searching");
    const rune = id ? RUNES.find(function (r) { return r.id === id; }) : null;
    setStatus(known ? "Calling rune " + rune.symbol + "…"
      : rune ? "Tap " + name + " in the window, then Pair." : "Choose the rune in the list…");
    const handlers = {
      onStage: function (stage) {
        setScanBusy(stage);
        if (stage === "connecting") setStatus("Waking the rune…");
      },
      onPress: onRunePress,
      onDisconnect: onRuneDisconnect
    };
    try {
      const conn = known
        ? await RuneBLE.reconnect(known, handlers, 5000)
        : await RuneBLE.connect(handlers, { name: name });
      const old = connections.get(conn.device.id);
      if (old && old !== conn) RuneBLE.disconnect(old);
      connections.set(conn.device.id, conn);
      renderConnections();
      const r = runeForName(conn.name);
      setStatus((r ? "Rune " + r.symbol : conn.name) + " connected. Press the rune to hear its story.");
    } catch (err) {
      console.warn(err);
      if (known) {
        // Quiet reconnect failed: next tap opens the browser window instead
        // (a fresh tap is needed for that window).
        quietFailed[name] = true;
        setStatus("Rune " + rune.symbol + " didn't answer. Tap Connect rune and choose it again.", true);
      } else if (err && err.name === "NotFoundError") {
        setStatus("No rune chosen. Tap Connect rune to try again.");
      } else {
        setStatus("Could not reach the rune. Move closer and try again.", true);
      }
    } finally {
      state.busy = false;
      setScanBusy(false);
    }
  }

  /* ---------------- Game logic ----------------
     correct next rune → LED "1" + story + unlock next
     earlier rune      → LED "1" + ALREADY
     later rune        → LED "2" + NOT_YET
     after last rune   → story, then FINISHED
     conn may be null (NFC / debug): LED writes are skipped.
     opts.keepConnected: true for button presses (stay connected). */
  async function handleRune(id, conn, opts) {
    try {
      const index = RUNES.findIndex(function (r) { return r.id === Number(id); });
      if (index < 0) { setStatus("This rune is not part of the quest.", true); return; }
      const rune = RUNES[index];

      if (index === state.progress) {
        await RuneBLE.writeLed(conn, LED_COLLECTED);
        setProgress(index + 1);
        renderMap();
        setStatus("Rune " + rune.symbol + " collected.");
        showStory(rune, true);
      } else if (index < state.progress) {
        await RuneBLE.writeLed(conn, LED_COLLECTED);
        setStatus("Rune " + rune.symbol + " is already yours.");
        showOverlay("already", rune);
      } else {
        await RuneBLE.writeLed(conn, LED_WRONG);
        setStatus("Rune " + rune.symbol + " is still sleeping.");
        showOverlay("notyet", rune);
      }
    } finally {
      if (!(opts && opts.keepConnected)) RuneBLE.disconnect(conn);
    }
  }

  /* ---------------- Story ---------------- */
  function showStory(rune, fresh) {
    hideOverlay(true);
    const index = RUNES.indexOf(rune);
    const final = index === RUNES.length - 1;
    state.story = { rune: rune, fresh: fresh, final: final };

    $("#story-glyph").textContent = rune.symbol;
    $("#story-kicker").textContent = "Rune " + (index + 1) + " of " + RUNES.length;
    $("#story-room").textContent = rune.room;
    const p = document.createElement("p");
    p.textContent = rune.text;
    $("#story-text").replaceChildren(p);
    $("#story-next").textContent = final ? "Continue" : "Back to map";
    resetAudioBar();

    // "Rune unlocked" card: the audio waits until the visitor taps Play.
    $("#unlocked-glyph").textContent = rune.symbol;
    $("#unlocked-title").textContent = "Rune " + rune.symbol + " unlocked!";
    $("#unlocked-text").textContent = "Tap play to hear the story of " + rune.room + ".";
    $("#unlocked").hidden = false;
    $("#audiobar").hidden = true;

    showScreen("story");
    if (fresh) {
      playUnlockFx(rune);
      const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (navigator.vibrate && tapped) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
    }
    AudioPlayer.prepare(rune.audio, rune.text);
  }

  /* Visitor tapped "Play story": swap the unlocked card for the audio bar and start. */
  function startStory() {
    const st = state.story;
    if (!st) return;
    $("#unlocked").hidden = true;
    $("#audiobar").hidden = false;
    AudioPlayer.play(st.rune.audio, st.rune.text);
    $("#audio-toggle").focus();
  }

  /* ---------------- Full-screen "rune unlocked" moment ---------------- */
  const UNLOCK_FX_MS = 2600;
  let fxTimer = null;

  function playUnlockFx(rune) {
    const fx = $("#unlockfx");
    clearTimeout(fxTimer);
    fx.classList.remove("is-leaving");
    fx.hidden = true;
    void fx.offsetWidth; // restart the CSS animations
    $("#unlockfx-glyph").textContent = rune.symbol;
    $("#unlockfx-room").textContent = rune.room;
    fx.hidden = false;
    burstDust($("#unlockfx-dust"), 40, 110, 150, 1300);
    fxTimer = setTimeout(endUnlockFx, reducedMotion ? 1400 : UNLOCK_FX_MS);
  }

  function endUnlockFx() {
    const fx = $("#unlockfx");
    clearTimeout(fxTimer);
    if (fx.hidden) return;
    fx.classList.add("is-leaving");
    fxTimer = setTimeout(function () {
      fx.hidden = true;
      fx.classList.remove("is-leaving");
      const play = document.querySelector("[data-action='start-story']");
      if (play && state.screen === "story" && !$("#unlocked").hidden) play.focus();
    }, reducedMotion ? 0 : 430);
  }

  function hideUnlockFx() {
    clearTimeout(fxTimer);
    $("#unlockfx").hidden = true;
    $("#unlockfx").classList.remove("is-leaving");
  }

  function burstDust(box, count, distMin, distRange, lifeMs) {
    if (reducedMotion) return;
    box = box || $("#dust");
    count = count || 22;
    distMin = distMin || 70;
    distRange = distRange || 60;
    box.replaceChildren();
    for (let i = 0; i < count; i++) {
      const s = document.createElement("i");
      const angle = Math.random() * Math.PI * 2;
      const dist = distMin + Math.random() * distRange;
      s.style.setProperty("--x", (Math.cos(angle) * dist).toFixed(0) + "px");
      s.style.setProperty("--y", (Math.sin(angle) * dist).toFixed(0) + "px");
      s.style.setProperty("--d", Math.round(Math.random() * 160) + "ms");
      s.style.setProperty("--sz", (2 + Math.random() * 4).toFixed(1) + "px");
      box.appendChild(s);
    }
    setTimeout(function () { box.replaceChildren(); }, lifeMs || 1100);
  }

  /* ---------------- Audio bar ---------------- */
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function setBar(ratio) {
    const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
    $("#audio-fill").style.width = pct + "%";
    $("#audio-knob").style.left = pct + "%";
  }
  function resetAudioBar() {
    setBar(0);
    $("#audio-time").textContent = "0:00 / 0:00";
    const bar = $("#audiobar");
    bar.classList.remove("is-tts");
    bar.classList.add("is-paused");
  }

  AudioPlayer.on("progress", function (p) {
    setBar(p.ratio);
    if (p.mode === "mp3") $("#audio-time").textContent = fmt(p.current) + " / " + fmt(p.duration);
  });
  AudioPlayer.on("state", function (s) {
    const bar = $("#audiobar");
    bar.classList.toggle("is-tts", s.mode === "tts");
    bar.classList.toggle("is-paused", !s.playing);
    $("#audio-toggle").setAttribute("aria-label", s.playing ? "Pause" : "Play");
  });
  AudioPlayer.on("ended", function () {
    setBar(1);
    const st = state.story;
    if (state.screen === "story" && st && st.final && st.fresh) {
      st.fresh = false;
      setTimeout(function () { if (state.screen === "story") showFinale(); }, 1200);
    }
  });

  /* ---------------- Finale ---------------- */
  function showFinale() {
    $("#finale-title").textContent = FINISHED.title;
    $("#finale-text").textContent = FINISHED.text;
    showScreen("finale");
    AudioPlayer.play(FINISHED.audio, FINISHED.text);
  }

  /* ---------------- Overlay (Not yet / Already) ---------------- */
  let overlayTimer = null;
  function showOverlay(kind, rune) {
    const entry = kind === "notyet" ? NOT_YET : ALREADY;
    const ov = $("#overlay");
    clearTimeout(overlayTimer);
    ov.hidden = true;
    ov.className = "overlay is-" + kind;
    $("#overlay-glyph").textContent = rune ? rune.symbol : "";
    $("#overlay-title").textContent = entry.title;
    $("#overlay-text").textContent = entry.text;
    void ov.offsetWidth;
    ov.hidden = false;
    AudioPlayer.play(entry.audio, entry.text);
    overlayTimer = setTimeout(function () { hideOverlay(false); }, OVERLAY_MS);
  }
  function hideOverlay(stopAudio) {
    clearTimeout(overlayTimer);
    const ov = $("#overlay");
    if (ov.hidden) return;
    ov.hidden = true;
    if (stopAudio) AudioPlayer.stop();
  }

  /* ---------------- Settings / reset ---------------- */
  function applyShowText() {
    document.body.classList.toggle("hide-text", !state.showText);
    $("#toggle-text").checked = state.showText;
  }
  function hideConfirms() { $$("[data-confirm]").forEach(function (c) { c.hidden = true; }); }

  function askReset(btn) {
    const box = btn.closest(".screen").querySelector("[data-confirm]");
    box.hidden = false;
    const yes = box.querySelector("[data-action='do-reset']");
    if (yes) yes.focus();
  }
  function doReset() {
    hideConfirms();
    hideOverlay(true);
    hideUnlockFx();
    AudioPlayer.stop();
    setProgress(0);
    state.drawnProgress = null;
    renderMap();
    setStatus("");
    showScreen("start");
  }

  /* ---------------- Events ---------------- */
  document.addEventListener("click", function (e) {
    const choice = e.target.closest("[data-choose]");
    if (choice) { connectRune(Number(choice.getAttribute("data-choose"))); return; }
    if (e.target.id === "chooser") { closeChooser(); return; } // tap on the dimmed backdrop
    const sim = e.target.closest("[data-sim]");
    if (sim) { handleRune(Number(sim.getAttribute("data-sim")), null); return; }

    const el = e.target.closest("[data-action]");
    if (!el) return;
    switch (el.getAttribute("data-action")) {
      case "play": showScreen("map"); break;
      case "home": showScreen("start"); break;
      case "settings": showScreen("settings"); break;
      case "back": showScreen(state.previous && state.previous !== "settings" ? state.previous : "start"); break;
      case "scan": openChooser(); break;
      case "close-chooser": closeChooser(); break;
      case "choose-any": connectRune(null); break;
      case "start-story": startStory(); break;
      case "replay":
        if (state.screen === "story" && !$("#unlocked").hidden) startStory();
        else AudioPlayer.replay();
        break;
      case "story-next":
        if (state.story && state.story.final) showFinale();
        else showScreen("map");
        break;
      case "ask-reset": askReset(el); break;
      case "cancel-reset": hideConfirms(); break;
      case "do-reset": doReset(); break;
    }
  });

  $("#audio-toggle").addEventListener("click", function () { AudioPlayer.toggle(); });
  $("#audio-replay").addEventListener("click", function () { AudioPlayer.replay(); });

  $("#toggle-text").addEventListener("change", function (e) {
    state.showText = e.target.checked;
    save(KEY_SHOW_TEXT, state.showText ? "1" : "0");
    applyShowText();
  });

  $("#overlay").addEventListener("click", function () { hideOverlay(true); });
  $("#unlockfx").addEventListener("click", endUnlockFx);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hideOverlay(true); endUnlockFx(); closeChooser(); }
  });

  /* ---------------- Optional assets ---------------- */
  function probeAssets() {
    // Bluetooth logo slot: shown only if docs/assets/bluetooth-logo.svg exists.
    const logo = $("#bt-logo");
    logo.addEventListener("load", function () { logo.hidden = false; });
    logo.addEventListener("error", function () { logo.hidden = true; });
    if (logo.complete && logo.naturalWidth > 0) logo.hidden = false;

    // Antique map behind the start screen (docs/assets/map-bg.png); skipped if the file is missing.
    const img = new Image();
    img.onload = function () {
      // Absolute URL: a relative one would resolve against css/style.css.
      document.body.style.setProperty("--map-bg", "url('" + img.src + "')");
      document.body.classList.add("has-map-bg");
    };
    img.src = "assets/map-bg.png";
  }

  /* ---------------- Helpers ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    if (!PERSIST_PROGRESS) { try { localStorage.removeItem(KEY_PROGRESS); } catch (e) { /* ignore */ } }
    buildMap();
    renderMap();
    applyShowText();
    probeAssets();

    if (params.get("debug") === "1") $("#debug").hidden = false;

    if (!RuneBLE.isSupported()) setStatus(NO_BLE_MSG, true);

    // NFC fallback: ?rune=N shows a "Hear rune N" button (no Bluetooth needed).
    const nfcId = parseInt(params.get("rune"), 10);
    const nfcRune = RUNES.find(function (r) { return r.id === nfcId; });
    if (nfcRune) {
      const btn = $("#nfc-btn");
      btn.textContent = "Hear rune " + nfcRune.id;
      btn.hidden = false;
      btn.addEventListener("click", function () {
        btn.hidden = true;
        params.delete("rune");
        const qs = params.toString();
        try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* ignore */ }
        handleRune(nfcRune.id, null);
      });
      $("#screen-start").hidden = true;
      $("#screen-start").classList.remove("is-active");
      $("#screen-map").hidden = false;
      state.screen = "map";
      state.previous = "start";
      animateMap();
      setStatus("You found rune " + nfcRune.symbol + ". Tap the button to hear it.");
    }
    document.body.classList.toggle("is-mapbg", state.screen !== "finale");
  }

  init();
})();
