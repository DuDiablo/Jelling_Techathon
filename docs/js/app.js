/* =====================================================================
   HARALD'S QUEST — APP
   Game state, screens, overlays, NFC tags (?rune=N links + Web NFC) and debug (?debug=1).
   Texts live in content.js, Bluetooth in ble.js, audio in audio.js, the longship game in sail.js,
   the joystick (RUNE_CONTROLLER) in controller.js.
   ===================================================================== */

(function () {
  "use strict";

  const KEY_PROGRESS = "haraldProgress";
  // false = every page refresh starts the quest from zero (testing / demos).
  // true  = collected runes are remembered after a refresh. NOTE: the NFC
  //         fallback (?rune=N) opens a fresh page per tag, so it needs true.
  const PERSIST_PROGRESS = false;
  // The visit (progress, house, clan size, quest timer) is saved on the phone so NFC tags work:
  // every scanned tag link opens a new page, which picks the visit up again.
  // Refreshing the page wipes it (hard reset), unless PERSIST_PROGRESS is true.
  const KEY_VISIT = "haraldVisit";
  const VISIT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // a visit older than 6 hours starts fresh
  const KEY_SHOW_TEXT = "haraldShowText";
  const KEY_RATE = "haraldAudioRate";
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
    story: null,             // { rune, fresh, final }
    clan: null,              // chosen house from CLANS (null until picked)
    members: 2,              // people in the clan: one name each on the rune stone
    startedAt: 0,            // when the quest began (for the certificate's quest time)
    finishedAt: 0,           // when the last rune was found
    carved: null,            // { names, lines } of the last carving, for the keepsakes
    gold: 0,                 // best clan gold from "Sail to Jelling"
    sailFrom: "map"          // screen to go back to after sailing
  };

  function clampProgress(n) {
    if (!n || n < 0) return 0;
    return Math.min(n, RUNES.length);
  }
  function setProgress(n) {
    state.progress = clampProgress(n);
    if (PERSIST_PROGRESS) save(KEY_PROGRESS, state.progress);
    saveVisit();
  }

  function saveVisit() {
    save(KEY_VISIT, JSON.stringify({
      progress: state.progress,
      clan: state.clan ? state.clan.id : null,
      members: state.members,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      gold: state.gold,
      savedAt: Date.now()
    }));
  }
  function loadVisit() {
    try {
      const v = JSON.parse(load(KEY_VISIT));
      if (!v || Date.now() - (v.savedAt || 0) > VISIT_MAX_AGE_MS) return null;
      return v;
    } catch (e) { return null; }
  }
  function pageWasReloaded() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) return nav.type === "reload";
      return performance.navigation && performance.navigation.type === 1; // older browsers
    } catch (e) { return false; }
  }
  function clearVisit() {
    try { localStorage.removeItem(KEY_VISIT); } catch (e) { /* ignore */ }
  }
  function restoreVisit(v) {
    state.progress = clampProgress(v.progress);
    state.clan = CLANS.find(function (c) { return c.id === v.clan; }) || null;
    state.members = v.members || state.members;
    state.startedAt = v.startedAt || 0;
    state.finishedAt = v.finishedAt || 0;
    state.gold = v.gold || 0;
    applyClan();
  }
  function isComplete() { return state.progress >= RUNES.length; }

  /* ---------------- Screens ---------------- */
  let transitionTimer = null;
  let finishTransition = null;

  function showScreen(name) {
    if (finishTransition) finishTransition();
    if (name === state.screen) { afterEnter(name); return; }
    if (state.screen === "sail") Sail.stop();

    const from = $("#screen-" + state.screen);
    const to = $("#screen-" + name);
    // Any screen change silences the current story / message.
    AudioPlayer.stop();
    if (name !== "settings") hideConfirms();

    state.previous = state.screen;
    state.screen = name;
    document.body.classList.toggle("is-finale", name === "finale");
    document.body.classList.toggle("is-crown", name === "crown");
    // Finale + crown: the night veil fades in over the map (theme "Jelling Gold").
    document.body.classList.toggle("is-night", name === "finale" || name === "crown");

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
    if (name === "map" && !state.startedAt) state.startedAt = Date.now();
    if (name === "map") animateMap();
    if (name === "sail" && !Sail.isRunning()) Sail.preview();
  }

  /* ---------------- Sail to Jelling (sail.js) ---------------- */
  function openSail() {
    if (!isComplete()) return;   // only after all three runes are found
    if (state.screen !== "sail") state.sailFrom = state.screen;
    $("#sail-intro").hidden = false;
    $("#sail-result").hidden = true;
    renderSailLabel();
    showScreen("sail");
  }
  function renderSailLabel() {
    $("#sail-label").textContent = state.gold ? "Clan gold: " + state.gold : (state.clan ? state.clan.name : "Viking voyage");
  }
  function sailPanelOpen() { return !$("#sail-intro").hidden || !$("#sail-result").hidden; }
  function startSail() {
    if (Controller.isConnected()) Controller.sound("click");
    $("#sail-intro").hidden = true;
    $("#sail-result").hidden = true;
    Sail.start();
  }
  function sailEnded(r) {
    const best = r.gold > state.gold;
    state.gold = Math.max(state.gold, r.gold);
    saveVisit();
    renderSailLabel();
    const house = state.clan ? " for the " + state.clan.name : "";
    $("#sail-gold").textContent = r.gold;
    $("#sail-gold-label").textContent = "gold" + house;
    $("#sail-text").textContent = "You kept " + r.coins + " of " + r.total + " silver coins" +
      (r.hits ? " and bumped into something " + r.hits + (r.hits === 1 ? " time." : " times.") : " and never touched a rock!") +
      (r.bonus ? " Clean voyage bonus: +" + r.bonus + "." : "");
    $("#sail-best").textContent = best ? "A new record for your clan!"
      : state.gold ? "Your best: " + state.gold + " gold" : "Steer around the rocks to keep your coins!";
    $("#sail-result").hidden = false;
    $("#sail-again").focus();
  }
  // Anything can steer: HaraldJoystick(x, y) with numbers from -1 to 1, or a direction like "UL".
  window.HaraldJoystick = function (x, y) { Sail.stick(x, y); };

  /* ---------------- Joystick: RUNE_CONTROLLER (controller.js) ---------------- */
  const CTRL_TEXT = {
    idle: "Connect joystick",
    choosing: "Searching…",
    connecting: "Connecting…",
    connected: "Joystick ready",
    disconnected: "Reconnect joystick",
    failed: "Try joystick again"
  };
  let ctrlState = "idle";
  function renderController(st) {
    if (st) ctrlState = st;
    const btn = $("#ctrl-btn");
    const ok = Controller.supported();
    btn.hidden = !ok;
    $("#ctrl-note").hidden = ok;
    btn.classList.toggle("is-on", ctrlState === "connected");
    btn.classList.toggle("is-busy", ctrlState === "choosing" || ctrlState === "connecting");
    $("#ctrl-text").textContent = CTRL_TEXT[ctrlState] || CTRL_TEXT.idle;
    btn.setAttribute("aria-pressed", ctrlState === "connected" ? "true" : "false");
  }
  async function toggleController() {
    if (Controller.isConnected()) { Controller.disconnect(); return; }
    if (ctrlState === "choosing" || ctrlState === "connecting") return;
    try { await Controller.connect(); } catch (e) { /* the state handler shows what happened */ }
  }
  Controller.on("state", renderController);
  Controller.on("input", function (v) { Sail.stick(v.x, v.y); });
  // The action button only shouts "Row!" while sailing. A voyage starts only from the
  // on-screen Start button, so there's time to connect the joystick first.
  Controller.on("press", function () {
    if (state.screen !== "sail" || sailPanelOpen()) return;
    Sail.action();
  });

  /* ---------------- Clan: choose your house ---------------- */
  // The clan colour replaces the map seal colours (--ember / --moss) and the crown gems (--gem*).
  const CLAN_VARS = ["--ember", "--moss", "--clan", "--gem-hi", "--gem", "--gem-deep", "--gem-dark"];

  function applyClan() {
    const c = state.clan;
    const st = document.body.style;
    if (!c) {
      document.body.removeAttribute("data-clan");
      CLAN_VARS.forEach(function (v) { st.removeProperty(v); });
      return;
    }
    document.body.setAttribute("data-clan", c.id);
    st.setProperty("--ember", c.colour);
    st.setProperty("--moss", c.deep);
    st.setProperty("--clan", c.colour);
    st.setProperty("--gem-hi", c.gem);
    st.setProperty("--gem", c.colour);
    st.setProperty("--gem-deep", c.deep);
    st.setProperty("--gem-dark", "#0e0705");
  }

  function renderClanScreen() {
    $("#clan-title").textContent = CLAN_SCREEN.title;
    $("#clan-label").textContent = CLAN_SCREEN.label;
    $("#clan-ask").textContent = CLAN_SCREEN.ask;
    $("#clan-go").textContent = CLAN_SCREEN.button;
    const list = $("#clan-list");
    list.replaceChildren();
    CLANS.forEach(function (c) {
      const picked = state.clan && state.clan.id === c.id;
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice clan__choice" + (picked ? " is-picked" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", picked ? "true" : "false");
      b.setAttribute("data-action", "pick-clan");
      b.setAttribute("data-clan", c.id);
      b.style.setProperty("--seal-color", c.colour);
      b.innerHTML =
        '<span class="choice__seal" aria-hidden="true">' + escapeHtml(c.rune) + "</span>" +
        '<span class="choice__body"><span class="choice__room">' + escapeHtml(c.name) + "</span>" +
        '<span class="choice__state">' + escapeHtml(c.motto) + "</span></span>" +
        '<span class="clan__tick" aria-hidden="true"><svg><use href="#icon-check"/></svg></span>';
      li.appendChild(b);
      list.appendChild(li);
    });
    renderMembers();
    $("#clan-go").disabled = !state.clan;
  }

  function renderMembers() {
    const max = CLAN_SCREEN.maxMembers || 6;
    state.members = Math.max(1, Math.min(max, state.members));
    $("#clan-count").textContent = String(state.members);
    $("[data-action='clan-less']").disabled = state.members <= 1;
    $("[data-action='clan-more']").disabled = state.members >= max;
    // one little warrior rune (ᛘ, "man") per member
    $("#clan-people").textContent = Array(state.members + 1).join("ᛘ ").trim();
  }

  function pickClan(id) {
    state.clan = CLANS.find(function (c) { return c.id === id; }) || null;
    applyClan();
    renderClanScreen();
    const picked = $("#clan-list [aria-checked='true']");
    if (picked) picked.focus();
  }

  /* Fill {clan} in a text. Without a clan (e.g. opened via NFC) the house part is left out. */
  function clanText(text) {
    if (state.clan) return text.replace(/\{clan\}/g, state.clan.name);
    return text.replace(/ of the \{clan\}/g, "").replace(/, \{clan\}/g, "").replace(/\{clan\}/g, "traveller");
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
      const m = document.createElement("button");
      m.type = "button";
      m.className = "marker" + (rune.mapX < 32 ? " is-edge-left" : rune.mapX > 68 ? " is-edge-right" : "");
      m.id = "marker-" + i;
      m.setAttribute("data-open-rune", String(i));
      m.style.left = rune.mapX + "%";
      m.style.top = rune.mapY + "%";
      m.innerHTML =
        '<svg class="marker__seal" aria-hidden="true"><use href="#seal"/></svg>' +
        '<span class="marker__glyph" aria-hidden="true">' + glyphHtml(rune.symbol) + "</span>" +
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
    $("#map-title").textContent = state.clan ? state.clan.name : "The Quest";
    $("#progress-label").textContent = "Runes found: " + state.progress + " / " + n +
      (state.clan ? " · " + state.members + (state.members === 1 ? " seeker" : " seekers") : "");
    // The longship game is a reward: it opens once all three runes are found.
    $("#map-sail").hidden = !isComplete();

    RUNES.forEach(function (rune, i) {
      const status = i < state.progress ? "collected" : (i === state.progress ? "next" : "locked");
      const m = $("#marker-" + i);
      m.classList.remove("is-locked", "is-next", "is-collected");
      m.classList.add("is-" + status);
      const collected = status === "collected";
      m.disabled = !collected;
      m.setAttribute("aria-label", rune.room + ": " + (collected ? "collected, tap to hear its story again" : status === "next" ? "next rune" : "locked"));

      const t = $("#tile-" + i);
      t.className = "tile" + (collected ? " is-collected" : "") + (status === "next" ? " is-current" : "");
      if (collected) setGlyph(t, rune.symbol); else t.textContent = "?";
      t.setAttribute("aria-label", "Rune " + (i + 1) + ": " + (collected ? "collected, tap to hear its story again" : "not found yet"));
      if (collected) {
        t.setAttribute("data-open-rune", String(i));
        t.setAttribute("role", "button");
        t.tabIndex = 0;
      } else {
        t.removeAttribute("data-open-rune");
        t.removeAttribute("role");
        t.removeAttribute("tabindex");
      }
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
        '<span class="choice__seal" aria-hidden="true">' + glyphHtml(rune.symbol) + "</span>" +
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
    if (isUnlockFxPlaying()) {
      // Don't interrupt the unlock animation; handle this press when it ends.
      if (pendingPress && pendingPress.conn !== conn && !(pendingPress.opts && pendingPress.opts.keepConnected)) {
        RuneBLE.disconnect(pendingPress.conn);
      }
      pendingPress = { id: id, conn: conn, opts: opts };
      return;
    }
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
    // revisit = reopened from the map: no unlock card, no finale afterwards.
    state.story = { rune: rune, fresh: fresh, final: final, revisit: !fresh };

    setGlyph($("#story-glyph"), rune.symbol);
    $("#story-kicker").textContent = "Rune " + (index + 1) + " of " + RUNES.length;
    $("#story-room").textContent = rune.room;
    const p = document.createElement("p");
    p.textContent = rune.text;
    $("#story-text").replaceChildren(p);
    $("#story-next").textContent = final && fresh ? "Continue" : "Back to map";
    resetAudioBar();

    // "Rune unlocked" card: the audio waits until the visitor taps Play.
    // Reopened from the map: straight to the audio bar (paused).
    setGlyph($("#unlocked-glyph"), rune.symbol);
    $("#unlocked-title").textContent = "Rune " + rune.symbol + " unlocked!";
    $("#unlocked-text").textContent = "Tap play to hear the story of " + rune.room + ".";
    $("#unlocked").hidden = !fresh;
    $("#audiobar").hidden = fresh;

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

  let fxPlaying = false;
  let pendingPress = null;   // last rune press received during the animation

  function isUnlockFxPlaying() { return fxPlaying; }

  /* Always runs its full length: no tap, key or rune press can cut it short. */
  function playUnlockFx(rune) {
    const fx = $("#unlockfx");
    clearTimeout(fxTimer);
    fxPlaying = true;
    fx.classList.remove("is-leaving");
    fx.hidden = true;
    void fx.offsetWidth; // restart the CSS animations
    setGlyph($("#unlockfx-glyph"), rune.symbol);
    $("#unlockfx-room").textContent = rune.room;
    fx.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    burstDust($("#unlockfx-dust"), 40, 110, 150, 1300);
    fxTimer = setTimeout(endUnlockFx, UNLOCK_FX_MS);
  }

  function endUnlockFx() {
    const fx = $("#unlockfx");
    clearTimeout(fxTimer);
    if (fx.hidden) { fxPlaying = false; return; }
    fx.classList.add("is-leaving");
    fxTimer = setTimeout(function () {
      fx.hidden = true;
      fx.classList.remove("is-leaving");
      fxPlaying = false;
      const play = document.querySelector("[data-action='start-story']");
      if (play && state.screen === "story" && !$("#unlocked").hidden) play.focus();
      // A rune pressed during the animation is handled now, not dropped.
      const p = pendingPress;
      pendingPress = null;
      if (p) handleRune(p.id, p.conn, p.opts);
    }, reducedMotion ? 0 : 430);
  }

  function hideUnlockFx() {
    clearTimeout(fxTimer);
    fxPlaying = false;
    pendingPress = null;
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
  let dragging = false;
  function setBar(ratio) {
    const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
    $("#audio-fill").style.width = pct + "%";
    $("#audio-knob").style.left = pct + "%";
    $("#audio-track").setAttribute("aria-valuenow", String(Math.round(pct)));
  }
  function resetAudioBar() {
    setBar(0);
    $("#audio-time").textContent = "";
    const bar = $("#audiobar");
    bar.classList.remove("is-tts", "is-dragging");
    bar.classList.add("is-paused");
    dragging = false;
  }

  AudioPlayer.on("progress", function (p) {
    if (!dragging) setBar(p.ratio);
    $("#audio-time").textContent = p.mode === "mp3" ? fmt(p.current) + " / " + fmt(p.duration)
      : p.sentences ? "Part " + p.sentence + " of " + p.sentences : "";
  });
  AudioPlayer.on("state", function (s) {
    const bar = $("#audiobar");
    const tts = s.mode === "tts";
    bar.classList.toggle("is-tts", tts);
    bar.classList.toggle("is-paused", !s.playing);
    $("#audio-toggle").setAttribute("aria-label", s.playing ? "Pause" : "Play");
    $("#audio-back").setAttribute("aria-label", tts ? "Previous sentence" : "Back 10 seconds");
    $("#audio-forward").setAttribute("aria-label", tts ? "Next sentence" : "Forward 10 seconds");
  });

  /* Speed: tap to cycle. Remembered on this phone. */
  const SPEEDS = [1, 1.25, 1.5, 0.75];
  function showRate(r) {
    const label = (r === 1 ? "1" : String(r).replace(/^0/, "")) + "×";
    $("#audio-speed").textContent = label;
    $("#audio-speed").setAttribute("aria-label", "Speed " + label + ". Tap to change.");
  }
  AudioPlayer.on("rate", function (r) { showRate(r.rate); save(KEY_RATE, r.rate); });

  /* Seek bar: tap or drag; keyboard arrows skip. */
  function trackRatio(e) {
    const rect = $("#audio-track").getBoundingClientRect();
    return rect.width ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
  }
  const track = $("#audio-track");
  track.addEventListener("pointerdown", function (e) {
    dragging = true;
    $("#audiobar").classList.add("is-dragging");
    try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setBar(trackRatio(e));
    e.preventDefault();
  });
  track.addEventListener("pointermove", function (e) { if (dragging) setBar(trackRatio(e)); });
  function endDrag(e, commit) {
    if (!dragging) return;
    dragging = false;
    $("#audiobar").classList.remove("is-dragging");
    if (commit) AudioPlayer.seek(trackRatio(e));
  }
  track.addEventListener("pointerup", function (e) { endDrag(e, true); });
  track.addEventListener("pointercancel", function (e) { endDrag(e, false); });
  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      AudioPlayer.skip(e.key === "ArrowLeft" ? -1 : 1);
      e.preventDefault();
    }
  });
  AudioPlayer.on("ended", function () {
    setBar(1);
    const st = state.story;
    if (state.screen === "story" && st && st.final && st.fresh) {
      st.fresh = false;
      setTimeout(function () { if (state.screen === "story") showFinale(); }, 1200);
    } else if (state.screen === "finale" && finaleAutoCrown) {
      // Finale story heard to the end → the crown ceremony follows by itself,
      // but never before the ᚼ + ᛒ animation and text have had time to show.
      finaleAutoCrown = false;
      const wait = Math.max(1500, FINALE_MIN_MS - (Date.now() - finaleShownAt));
      setTimeout(function () { if (state.screen === "finale") showCrown(); }, wait);
    }
  });

  /* ---------------- Finale ---------------- */
  const FINALE_MIN_MS = 6000;
  let finaleShownAt = 0;
  let finaleAutoCrown = false;

  function showFinale() {
    $("#finale-title").textContent = FINISHED.title;
    $("#finale-text").textContent = FINISHED.text;
    finaleShownAt = Date.now();
    if (!state.finishedAt) { state.finishedAt = finaleShownAt; saveVisit(); }
    finaleAutoCrown = true;
    showScreen("finale");
    AudioPlayer.play(FINISHED.audio, FINISHED.text);
  }

  /* ---------------- Crown: congratulations + your name in runes ---------------- */
  /* Younger Futhark (Danish long-branch), the runes on the Jelling stones.
     Old Norse had fewer sounds than English, so several letters share a rune. */
  const RUNE_MAP = {
    a: "ᛅ", b: "ᛒ", c: "ᚴ", d: "ᛏ", e: "ᛁ", f: "ᚠ", g: "ᚴ", h: "ᚼ", i: "ᛁ", j: "ᛁ",
    k: "ᚴ", l: "ᛚ", m: "ᛘ", n: "ᚾ", o: "ᚬ", p: "ᛒ", q: "ᚴ", r: "ᚱ", s: "ᛋ", t: "ᛏ",
    u: "ᚢ", v: "ᚢ", w: "ᚢ", x: "ᚴᛋ", y: "ᛁ", z: "ᛋ",
    "æ": "ᛅ", "ä": "ᛅ", "ø": "ᚬ", "ö": "ᚬ", "å": "ᚬ", "ü": "ᚢ", "þ": "ᚦ", "ð": "ᚦ"
  };
  const RUNE_WORD_GAP = "᛫"; // runic word separator

  /* "Harald Blåtand" → [{latin:"H", rune:"ᚼ"}, …, {gap:true}, …] */
  function toRunes(name) {
    const out = [];
    const s = String(name).trim().replace(/\s+/g, " ");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const lower = ch.toLowerCase();
      if (ch === " " || ch === "-") { if (out.length && !out[out.length - 1].gap) out.push({ gap: true }); continue; }
      // "th" → ᚦ (thurs), as in Thor
      if (lower === "t" && (s[i + 1] || "").toLowerCase() === "h") { out.push({ latin: s.substr(i, 2), rune: "ᚦ" }); i++; continue; }
      // soft c (before e, i, y) sounds like s
      if (lower === "c" && /[eiy]/i.test(s[i + 1] || "")) { out.push({ latin: ch, rune: "ᛋ" }); continue; }
      let rune = RUNE_MAP[lower];
      if (!rune) {
        const base = lower.normalize("NFD").replace(/[̀-ͯ]/g, ""); // é → e, ñ → n
        rune = RUNE_MAP[base];
      }
      if (rune) out.push({ latin: ch, rune: rune });
    }
    while (out.length && out[out.length - 1].gap) out.pop();
    return out;
  }

  function showCrown() {
    finaleAutoCrown = false;
    $("#crown-kicker").textContent = CROWN.kicker;
    $("#crown-title").textContent = CROWN.title;
    const many = memberCount() > 1;
    $("#crown-subtitle").textContent = clanText(many ? CROWN.subtitleMany : CROWN.subtitle);
    $("#crown-ask").textContent = clanText(many ? CROWN.askMany : CROWN.ask);
    $("#crown-form").querySelector("[type=submit]").textContent = many ? CROWN.buttonMany : CROWN.button;
    $("#crown-note").textContent = many ? CROWN.noteMany : CROWN.note;
    $("#crown-result-label").textContent = many ? "Your names in runes" : "Your name in runes";
    buildNameFields();
    resetCrownForm();
    showScreen("crown");
    burstDust($("#crown-dust"), 44, 90, 170, 2400); // sparks drift ~1.9 s + up to 0.16 s delay
    const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && tapped) { try { navigator.vibrate([60, 80, 120]); } catch (e) { /* ignore */ } }
  }

  // Without a chosen clan (NFC / debug) the crown asks for one name, as before.
  function memberCount() { return state.clan ? state.members : 1; }

  function buildNameFields() {
    const box = $("#crown-names");
    const first = $("#crown-name");
    const n = memberCount();
    Array.prototype.slice.call(box.children).forEach(function (el) { if (el !== first) el.remove(); });
    first.placeholder = n > 1 ? "Name 1" : "Your name";
    first.setAttribute("aria-label", n > 1 ? "Name 1" : "Your name");
    first.setAttribute("enterkeyhint", n > 1 ? "next" : "done");
    for (let i = 2; i <= n; i++) {
      const input = first.cloneNode(false);
      input.removeAttribute("id");
      input.value = "";
      input.placeholder = "Name " + i;
      input.setAttribute("aria-label", "Name " + i);
      input.setAttribute("autocomplete", "off");
      input.setAttribute("enterkeyhint", i === n ? "done" : "next");
      box.appendChild(input);
    }
    $("#crown-ask").setAttribute("for", "crown-name");
  }

  function nameInputs() { return $$("#crown-names .crown__input"); }

  function joinNames(names) {
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  function resetCrownForm() {
    $("#crown-form").hidden = false;
    $("#crown-result").hidden = true;
    $("#crown-error").textContent = "";
    $("#runestone").replaceChildren();
  }

  /* Carve every typed name, one line each. Empty fields are skipped. */
  function carveNames(rawNames) {
    const names = [];
    const lines = [];
    for (let i = 0; i < rawNames.length; i++) {
      const clean = String(rawNames[i] || "").trim().replace(/\s+/g, " ");
      if (!clean) continue;
      const runes = toRunes(clean);
      if (!runes.some(function (r) { return !r.gap; })) {
        $("#crown-error").textContent = "Use letters A–Z so the runes can be carved.";
        const bad = nameInputs()[i];
        if (bad) bad.focus();
        return;
      }
      names.push(clean);
      lines.push(runes);
    }
    if (!names.length) {
      $("#crown-error").textContent = memberCount() > 1 ? "Write at least one name to carve." : "Write your name to carve it.";
      $("#crown-name").focus();
      return;
    }
    const stone = $("#runestone");
    stone.replaceChildren();
    // more names → smaller runes, so they all fit on the stone
    stone.style.setProperty("--rune-fs", names.length >= 4 ? "1.75rem" : names.length >= 2 ? "2.15rem" : "2.7rem");
    const STEP = reducedMotion ? 0 : (names.length > 2 ? 170 : 260);
    let n = 0;
    lines.forEach(function (runes, li) {
      if (li > 0) {
        const br = document.createElement("span");
        br.className = "rune-break";
        stone.appendChild(br);
      }
      carveLine(runes);
    });

    function carveLine(runes) {
    runes.forEach(function (r) {
      const cell = document.createElement("span");
      cell.className = "rune-cell" + (r.gap ? " rune-cell--gap" : "");
      cell.style.setProperty("--d", (n * STEP) + "ms");
      const rune = document.createElement("span");
      rune.className = "rune-cell__rune";
      rune.textContent = r.gap ? RUNE_WORD_GAP : r.rune;
      cell.appendChild(rune);
      if (!r.gap) {
        const latin = document.createElement("span");
        latin.className = "rune-cell__latin";
        latin.textContent = r.latin.toUpperCase();
        cell.appendChild(latin);
      }
      stone.appendChild(cell);
      n++;
    });
    }

    stone.setAttribute("aria-label", joinNames(names) + " written in runes: " + lines.map(function (runes) {
      return runes.map(function (r) { return r.gap ? " " : r.rune; }).join("");
    }).join(", "));
    const hail = $("#crown-hail");
    hail.style.setProperty("--hail-delay", (n * STEP + 300) + "ms");
    hail.textContent = clanText(names.length > 1 ? CROWN.hailMany : CROWN.hail).replace("{name}", joinNames(names));
    state.carved = { names: names, lines: lines };
    $("#keep-status").textContent = "";
    $("#crown-form").hidden = true;
    $("#crown-result").hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* ---------------- Take home: keepsakes + rune alphabet ---------------- */
  // Every letter A–Z (and TH) with its rune, built from the same rules as the carving.
  function alphabetLetters() {
    const out = [];
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (ch) {
      const r = toRunes(ch);
      if (r.length) out.push({ latin: ch, rune: r.map(function (x) { return x.rune; }).join("") });
    });
    out.push({ latin: "TH", rune: "ᚦ" });
    return out;
  }

  function buildAlphabet() {
    const grid = $("#alphabet-grid");
    grid.replaceChildren();
    alphabetLetters().forEach(function (l) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="alphabet__rune" aria-hidden="true">' + escapeHtml(l.rune) + "</span>" +
        '<span class="alphabet__latin">' + escapeHtml(l.latin) + "</span>";
      li.setAttribute("aria-label", l.latin + " is " + l.rune);
      grid.appendChild(li);
    });
  }

  function runeString(text) {
    return toRunes(text).map(function (r) { return r.gap ? " ᛫ " : r.rune; }).join("");
  }

  function slug(names) {
    return (names[0] || "rune").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rune";
  }

  async function saveKeepsake(kind, btn) {
    const status = $("#keep-status");
    if (kind !== "alphabet" && !state.carved) { status.textContent = "Carve a name first."; return; }
    btn.disabled = true;
    status.textContent = "Drawing…";
    try {
      await Keepsakes.fontsReady();
      const c = state.carved || { names: [], lines: [] };
      let cv, file;
      if (kind === "stone") {
        cv = Keepsakes.stone({ names: c.names, lines: c.lines, clan: state.clan, date: new Date() });
        file = "rune-stone-" + slug(c.names) + ".png";
      } else if (kind === "certificate") {
        const end = state.finishedAt || Date.now();
        cv = Keepsakes.certificate({
          names: c.names, lines: c.lines, clan: state.clan, date: new Date(),
          durationMs: state.startedAt ? end - state.startedAt : 0,
          gold: state.gold
        });
        file = "ruler-of-the-runes-" + slug(c.names) + ".png";
      } else {
        const ex = c.names[0] || "Harald";
        cv = Keepsakes.alphabet({ letters: alphabetLetters(), example: { latin: ex, runes: runeString(ex) } });
        file = "rune-alphabet.png";
      }
      await Keepsakes.save(cv, file);
      status.textContent = "Saved: " + file;
    } catch (e) {
      status.textContent = "Sorry, the image could not be saved on this device.";
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- Overlay (Not yet / Already) ---------------- */
  let overlayTimer = null;
  function showOverlay(kind, rune) {
    const entry = kind === "notyet" ? NOT_YET : ALREADY;
    const ov = $("#overlay");
    clearTimeout(overlayTimer);
    ov.hidden = true;
    ov.className = "overlay is-" + kind;
    setGlyph($("#overlay-glyph"), rune ? rune.symbol : "");
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
    finaleAutoCrown = false;
    resetCrownForm();
    $("#crown-name").value = "";
    AudioPlayer.stop();
    setProgress(0);
    state.clan = null;
    applyClan();
    state.startedAt = 0;
    state.finishedAt = 0;
    state.carved = null;
    state.gold = 0;
    pendingTagRune = null;
    clearVisit();
    state.drawnProgress = null;
    renderMap();
    setStatus("");
    showScreen("start");
  }

  /* ---------------- NFC tags ----------------
     Each rune has a tag holding the link …/?rune=N.
     - Any phone: scanning opens that link; init() treats it exactly like pressing the rune.
     - Chrome on Android: "Scan NFC tags" (Web NFC) reads tags while the app is open,
       without opening a new page. Both go through onRunePress(), like a Bluetooth press. */
  let pendingTagRune = null;   // tag scanned before a house was chosen
  let nfcOn = false;

  function nfcSupported() { return "NDEFReader" in window; }

  function runeIdFromTag(message) {
    for (const record of message.records) {
      try {
        let text;
        if (record.recordType === "url" || record.recordType === "absolute-url") {
          text = new TextDecoder().decode(record.data);
          const n = parseInt(new URL(text, location.href).searchParams.get("rune"), 10);
          if (n) return n;
        } else if (record.recordType === "text") {
          text = new TextDecoder(record.encoding || "utf-8").decode(record.data);
          const m = /(?:RUNE_?)?(\d)/i.exec(text.trim()); // "RUNE_1" or "1"
          if (m) return parseInt(m[1], 10);
        }
      } catch (e) { /* try the next record */ }
    }
    return 0;
  }

  async function startNfc(fromTap) {
    if (!nfcSupported() || nfcOn) return;
    try {
      const reader = new NDEFReader();
      await reader.scan();
      nfcOn = true;
      reader.addEventListener("reading", function (e) {
        const id = runeIdFromTag(e.message);
        if (!RUNES.some(function (r) { return r.id === id; })) { setStatus("This tag isn't one of the runes.", true); return; }
        if (!state.clan && state.screen !== "map") {
          pendingTagRune = id;
          renderClanScreen();
          showScreen("clan");
          return;
        }
        onRunePress(id, null);
      });
      reader.addEventListener("readingerror", function () { setStatus("Couldn't read that tag. Hold the phone still on it.", true); });
      renderNfcButton();
      if (fromTap) setStatus("NFC is on. Hold the back of your phone to a rune's tag.");
    } catch (e) {
      if (fromTap) {
        setStatus(e && e.name === "NotAllowedError"
          ? "NFC permission was refused. Allow it in Chrome's site settings."
          : "NFC is off. Turn on NFC in your phone's settings and try again.", true);
      }
    }
  }

  function renderNfcButton() {
    const btn = $("#nfc-btn");
    btn.hidden = !nfcSupported();
    btn.disabled = nfcOn;
    btn.classList.toggle("is-on", nfcOn);
    $("#nfc-text").textContent = nfcOn ? "NFC on: tap a rune's tag" : "Scan NFC tags";
  }

  /* Instant screen switch for a page opened from a tag (no fade on load). */
  function jumpTo(name) {
    $$(".screen").forEach(function (sc) { sc.hidden = true; sc.classList.remove("is-active"); });
    $("#screen-" + name).hidden = false;
    state.previous = "start";
    state.screen = name;
    afterEnter(name);
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
      case "play":
        if (state.clan) showScreen("map");
        else { renderClanScreen(); showScreen("clan"); }
        break;
      case "pick-clan": pickClan(el.getAttribute("data-clan")); break;
      case "clan-less": state.members--; renderMembers(); saveVisit(); break;
      case "clan-more": state.members++; renderMembers(); saveVisit(); break;
      case "nfc": startNfc(true); break;
      case "sail": openSail(); break;
      case "ctrl": toggleController(); break;
      case "sail-start": case "sail-again": startSail(); break;
      case "sail-back": showScreen(state.sailFrom || "map"); break;
      case "clan-go":
        if (!state.clan) break;
        if (!state.startedAt) state.startedAt = Date.now();
        saveVisit();
        renderMap();
        showScreen("map");
        setStatus("We ride for the " + state.clan.name + "!");
        // A tag scanned before the house was chosen: wake that rune now.
        if (pendingTagRune) {
          const id = pendingTagRune;
          pendingTagRune = null;
          setTimeout(function () { onRunePress(id, null); }, reducedMotion ? 0 : 700);
        }
        break;
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
        if (state.story && state.story.final && !state.story.revisit) showFinale();
        else showScreen("map");
        break;
      case "crown": showCrown(); break;
      // ?debug=1 shortcuts for testing the ending (collect all runes, then jump).
      case "debug-finale":
        setProgress(RUNES.length); renderMap(); showFinale();
        break;
      case "debug-crown":
        setProgress(RUNES.length); renderMap(); showCrown();
        break;
      case "save-stone": saveKeepsake("stone", el); break;
      case "save-certificate": saveKeepsake("certificate", el); break;
      case "save-alphabet": saveKeepsake("alphabet", el); break;
      case "crown-again":
        resetCrownForm();
        nameInputs().forEach(function (inp) { inp.value = ""; });
        $("#crown-name").focus();
        break;
      case "ask-reset": askReset(el); break;
      case "cancel-reset": hideConfirms(); break;
      case "do-reset": doReset(); break;
    }
  });

  $("#audio-toggle").addEventListener("click", function () { AudioPlayer.toggle(); });
  $("#audio-replay").addEventListener("click", function () { AudioPlayer.replay(); });
  $("#audio-back").addEventListener("click", function () { AudioPlayer.skip(-1); });
  $("#audio-forward").addEventListener("click", function () { AudioPlayer.skip(1); });
  $("#audio-speed").addEventListener("click", function () {
    const i = SPEEDS.indexOf(AudioPlayer.getRate());
    AudioPlayer.setRate(SPEEDS[(i + 1) % SPEEDS.length]);
  });

  $("#toggle-text").addEventListener("change", function (e) {
    state.showText = e.target.checked;
    save(KEY_SHOW_TEXT, state.showText ? "1" : "0");
    applyShowText();
  });

  $("#overlay").addEventListener("click", function () { hideOverlay(true); });
  Sail.init($("#sail-canvas"), {
    getClan: function () { return state.clan; },
    onEnd: sailEnded,
    // sounds on the joystick: coin = click, bump = lose, landing = win
    onSound: function (kind) { Controller.sound(kind === "coin" ? "click" : kind === "hit" ? "lose" : "win"); },
    hint: function () {
      return Controller.isConnected() ? "Steer with the joystick. Button: Row!" : "Drag to steer. Tap to Row!";
    }
  });
  renderController();
  $("#crown-form").addEventListener("submit", function (e) {
    e.preventDefault();
    carveNames(nameInputs().map(function (inp) { return inp.value; }));
  });
  $("#crown-names").addEventListener("input", function () { $("#crown-error").textContent = ""; });
  // Enter in a name field jumps to the next one; the last one carves.
  $("#crown-names").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const inputs = nameInputs();
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); }
  });
  // The unlock animation can't be skipped: swallow every tap/key while it plays.
  ["click", "pointerdown", "touchstart", "contextmenu"].forEach(function (type) {
    $("#unlockfx").addEventListener(type, function (e) { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  });
  document.addEventListener("keydown", function (e) {
    if (isUnlockFxPlaying()) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === "Escape") { hideOverlay(true); closeChooser(); }
  }, true);

  // Collected runes on the map / progress tiles reopen their story.
  function openCollected(target) {
    const el = target.closest("[data-open-rune]");
    if (!el || isUnlockFxPlaying()) return false;
    const i = Number(el.getAttribute("data-open-rune"));
    if (i < state.progress) showStory(RUNES[i], false);
    return true;
  }
  $("#markers").addEventListener("click", function (e) { openCollected(e.target); });
  $("#tiles").addEventListener("click", function (e) { openCollected(e.target); });
  $("#tiles").addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && openCollected(e.target)) e.preventDefault();
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
  // Runes most fonts draw half-height (ᚲ looks like a small "<"): stretched
  // to full height so they match the 3D-printed runes.
  const SHORT_GLYPHS = ["ᚲ"];
  function glyphNode(symbol) {
    const s = document.createElement("span");
    s.className = "glyph" + (SHORT_GLYPHS.indexOf(symbol) >= 0 ? " glyph--tall" : "");
    s.textContent = symbol;
    return s;
  }
  function glyphHtml(symbol) { return glyphNode(symbol).outerHTML; }
  function setGlyph(el, symbol) { if (symbol) el.replaceChildren(glyphNode(symbol)); else el.replaceChildren(); }
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
    buildAlphabet();
    $("#secret-input").addEventListener("input", function (e) { $("#secret-out").textContent = runeString(e.target.value); });
    applyShowText();
    probeAssets();
    const savedRate = parseFloat(load(KEY_RATE));
    if (SPEEDS.indexOf(savedRate) >= 0) AudioPlayer.setRate(savedRate);
    else showRate(1);

    if (params.get("debug") === "1") $("#debug").hidden = false;

    if (!RuneBLE.isSupported()) setStatus(NO_BLE_MSG, true);

    // NFC tag link (…/?rune=N): pick the saved visit up again and treat it like pressing that rune.
    // A refresh is a hard reset (while PERSIST_PROGRESS is false): the saved visit is wiped,
    // so the next tag starts a new quest. Only a page opened *by a tag* continues the visit.
    const tagId = parseInt(params.get("rune"), 10);
    const isReload = pageWasReloaded();
    const tagRune = isReload ? null : RUNES.find(function (r) { return r.id === tagId; });
    if (!PERSIST_PROGRESS && !tagRune) clearVisit();
    if (tagRune || PERSIST_PROGRESS) {
      const visit = loadVisit();
      if (visit) restoreVisit(visit);
    }
    if (isReload && params.has("rune")) {
      params.delete("rune");
      const qs = params.toString();
      try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* ignore */ }
    }
    renderMap();
    renderNfcButton();
    // Already allowed NFC on this site? Start listening without another tap.
    if (nfcSupported() && navigator.permissions) {
      navigator.permissions.query({ name: "nfc" })
        .then(function (p) { if (p.state === "granted") startNfc(false); })
        .catch(function () { /* ignore */ });
    }
    if (tagRune) {
      // Remove ?rune=N so a refresh doesn't scan the rune again.
      params.delete("rune");
      const qs = params.toString();
      try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* ignore */ }
      if (state.clan) {
        jumpTo("map");
        setTimeout(function () { onRunePress(tagRune.id, null); }, reducedMotion ? 0 : 500);
      } else {
        // First tag of the visit: choose a house first, then this rune wakes.
        pendingTagRune = tagRune.id;
        renderClanScreen();
        jumpTo("clan");
        $("#clan-label").textContent = "Choose your house to wake rune " + tagRune.symbol;
      }
    }
    document.body.classList.add("is-mapbg"); // map background on every screen (the night veil covers it for the finale)
  }

  init();
})();
