/* =====================================================================
   HARALD'S QUEST — AUDIO
   Plays an MP3. If the file is missing or fails, the phone reads the
   text aloud with speechSynthesis ("the skald").
   Events (subscribe with AudioPlayer.on(name, fn)):
     "state"    { playing: bool, mode: "mp3" | "tts" | null }
     "progress" { current, duration, ratio, mode }
     "ended"    {}
   ===================================================================== */

const AudioPlayer = (function () {
  const listeners = { state: [], progress: [], ended: [] };
  let el = null;          // current HTMLAudioElement
  let utterance = null;   // current SpeechSynthesisUtterance
  let mode = null;        // "mp3" | "tts" | null
  let current = null;     // { src, text }
  let token = 0;          // increments on every play/stop, so stale callbacks are ignored
  let ttsPaused = false;

  function on(name, fn) { listeners[name].push(fn); }
  function emit(name, data) { listeners[name].forEach(function (fn) { fn(data || {}); }); }

  function canSpeak() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }

  function teardown() {
    token++;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el = null;
    }
    if (canSpeak()) window.speechSynthesis.cancel();
    utterance = null;
    ttsPaused = false;
    mode = null;
  }

  function play(src, text) {
    teardown();
    current = { src: src, text: text };
    const myToken = token;
    let fellBack = false;

    function fallback() {
      if (fellBack || myToken !== token) return;
      fellBack = true;
      if (el) { el.pause(); el = null; }
      speak(text, myToken);
    }

    if (!src) { speak(text, myToken); return; }

    mode = "mp3";
    el = new Audio(src);
    el.preload = "auto";
    el.addEventListener("error", fallback);
    el.addEventListener("timeupdate", function () {
      if (myToken !== token || !el) return;
      const d = isFinite(el.duration) ? el.duration : 0;
      emit("progress", { current: el.currentTime, duration: d, ratio: d ? el.currentTime / d : 0, mode: "mp3" });
    });
    el.addEventListener("loadedmetadata", function () {
      if (myToken !== token || !el) return;
      emit("progress", { current: 0, duration: el.duration, ratio: 0, mode: "mp3" });
    });
    el.addEventListener("playing", function () { if (myToken === token) emit("state", { playing: true, mode: "mp3" }); });
    el.addEventListener("pause", function () { if (myToken === token && el && !el.ended) emit("state", { playing: false, mode: "mp3" }); });
    el.addEventListener("ended", function () {
      if (myToken !== token) return;
      emit("state", { playing: false, mode: "mp3" });
      emit("ended");
    });

    el.play().catch(function (err) {
      if (myToken !== token) return;
      // Autoplay blocked: keep the MP3 ready, the visitor can tap play.
      if (err && err.name === "NotAllowedError") emit("state", { playing: false, mode: "mp3" });
      else fallback();
    });
  }

  function speak(text, myToken) {
    if (myToken !== token) return;
    if (!canSpeak() || !text) {
      mode = null;
      emit("state", { playing: false, mode: null });
      emit("ended");
      return;
    }
    mode = "tts";
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.95;
    u.pitch = 0.9;
    u.onstart = function () { if (myToken === token) emit("state", { playing: true, mode: "tts" }); };
    u.onboundary = function (e) {
      if (myToken !== token) return;
      emit("progress", { current: e.charIndex, duration: text.length, ratio: e.charIndex / text.length, mode: "tts" });
    };
    u.onend = function () {
      if (myToken !== token) return;
      emit("progress", { current: text.length, duration: text.length, ratio: 1, mode: "tts" });
      emit("state", { playing: false, mode: "tts" });
      emit("ended");
    };
    u.onerror = u.onend;
    utterance = u;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    emit("state", { playing: true, mode: "tts" });
  }

  function toggle() {
    if (mode === "mp3" && el) {
      if (el.paused) el.play().catch(function () {});
      else el.pause();
    } else if (mode === "tts" && canSpeak()) {
      if (ttsPaused) { window.speechSynthesis.resume(); ttsPaused = false; emit("state", { playing: true, mode: "tts" }); }
      else { window.speechSynthesis.pause(); ttsPaused = true; emit("state", { playing: false, mode: "tts" }); }
    } else if (current) {
      replay();
    }
  }

  function replay() {
    if (current) play(current.src, current.text);
  }

  function stop() {
    teardown();
    emit("state", { playing: false, mode: null });
  }

  function getMode() { return mode; }

  return { on: on, play: play, toggle: toggle, replay: replay, stop: stop, getMode: getMode };
})();
