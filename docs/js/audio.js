/* =====================================================================
   HARALD'S QUEST — AUDIO
   Plays an MP3. If the file is missing or fails, the phone reads the
   text aloud with speechSynthesis ("the skald").
   Events (subscribe with AudioPlayer.on(name, fn)):
     "state"    { playing: bool, mode: "mp3" | "tts" | null }
     "progress" { current, duration, ratio, mode, sentence?, sentences? }
     "rate"     { rate }
     "ended"    {}
   Controls: play, prepare, toggle, pause, seek(ratio), skip(±1),
   setRate(r), replay, stop.
   ===================================================================== */

const AudioPlayer = (function () {
  const listeners = { state: [], progress: [], rate: [], ended: [] };
  const SKIP_SEC = 10;
  const TTS_RATE = 0.95;  // the skald's normal pace (multiplied by rate)

  let el = null;          // current HTMLAudioElement
  let mode = null;        // "mp3" | "tts" | null
  let current = null;     // { src, text }
  let token = 0;          // increments on every play/stop, so stale callbacks are ignored
  let rate = 1;           // playback speed chosen by the visitor
  // Speech state. speechSynthesis.pause() is ignored on Android Chrome (the
  // voice keeps talking), so "pause" cancels the speech and "resume" starts
  // a new utterance from the sentence we were in.
  let ttsPaused = false;
  let ttsEnded = false;
  let ttsPos = 0;         // character the voice has reached in current.text

  function on(name, fn) { listeners[name].push(fn); }
  function emit(name, data) { listeners[name].forEach(function (fn) { fn(data || {}); }); }

  function canSpeak() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }

  /* cancel() — twice, because some Android voices ignore a single cancel. */
  function cancelSpeech() {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const t = token;
    setTimeout(function () {
      const speaking = mode === "tts" && !ttsPaused && !ttsEnded;
      if (t === token && !speaking) window.speechSynthesis.cancel();
    }, 150);
  }

  function teardown() {
    token++;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el = null;
    }
    mode = null;
    ttsPaused = false;
    ttsEnded = false;
    ttsPos = 0;
    cancelSpeech();
  }

  /* ---------- Sentences (TTS skip / seek / resume work per sentence) ---------- */
  function sentenceStarts(text) {
    const starts = [0];
    const re = /[.!?…]+["”’']?\s+/g;
    let m;
    while ((m = re.exec(text))) {
      const s = m.index + m[0].length;
      if (s < text.length) starts.push(s);
    }
    return starts;
  }
  function sentenceIndex(starts, pos) {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= pos) i++;
    return i;
  }

  function emitTtsProgress(text) {
    const starts = sentenceStarts(text);
    emit("progress", {
      current: ttsPos, duration: text.length, ratio: text.length ? ttsPos / text.length : 0, mode: "tts",
      sentence: Math.min(sentenceIndex(starts, ttsPos) + 1, starts.length), sentences: starts.length
    });
  }

  /* ---------- Playback ---------- */
  /* at (optional, 0..1): start part-way through. */
  function play(src, text, at) {
    teardown();
    current = { src: src, text: text };
    const myToken = token;
    let fellBack = false;
    at = Math.max(0, Math.min(1, at || 0));

    function fallback() {
      if (fellBack || myToken !== token) return;
      fellBack = true;
      if (el) { el.pause(); el = null; }
      speakFrom(at);
    }
    function speakFrom(ratio) {
      const starts = sentenceStarts(text || "");
      speak(text, myToken, starts[sentenceIndex(starts, Math.floor(ratio * (text || "").length))]);
    }

    if (!src) { speakFrom(at); return; }

    mode = "mp3";
    el = new Audio(src);
    el.preload = "auto";
    el.playbackRate = rate;
    el.addEventListener("error", fallback);
    const sendProgress = function () {
      if (myToken !== token || !el) return;
      const d = isFinite(el.duration) ? el.duration : 0;
      emit("progress", { current: el.currentTime, duration: d, ratio: d ? el.currentTime / d : 0, mode: "mp3" });
    };
    el.addEventListener("timeupdate", sendProgress);
    el.addEventListener("seeked", sendProgress);
    el.addEventListener("loadedmetadata", function () {
      if (myToken !== token || !el) return;
      if (at && isFinite(el.duration)) el.currentTime = at * el.duration;
      el.playbackRate = rate;
      sendProgress();
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

  /* Reads text aloud from character `from`. */
  function speak(text, myToken, from) {
    if (myToken !== token) return;
    if (!canSpeak() || !text) {
      mode = null;
      emit("state", { playing: false, mode: null });
      emit("ended");
      return;
    }
    from = from || 0;
    mode = "tts";
    ttsPaused = false;
    ttsEnded = false;
    ttsPos = from;
    const u = new SpeechSynthesisUtterance(text.slice(from));
    u.lang = "en-GB";
    u.rate = TTS_RATE * rate;
    u.pitch = 0.9;
    u.onstart = function () { if (myToken === token) emit("state", { playing: true, mode: "tts" }); };
    u.onboundary = function (e) {
      if (myToken !== token) return;
      ttsPos = from + e.charIndex;
      emitTtsProgress(text);
    };
    u.onend = function () {
      if (myToken !== token) return;
      ttsEnded = true;
      ttsPos = text.length;
      emitTtsProgress(text);
      emit("state", { playing: false, mode: "tts" });
      emit("ended");
    };
    u.onerror = u.onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    emitTtsProgress(text);
    emit("state", { playing: true, mode: "tts" });
  }

  function pauseTts() {
    token++; // the cancelled utterance's onend/onerror must not count as "ended"
    ttsPaused = true;
    cancelSpeech();
    emit("state", { playing: false, mode: "tts" });
  }

  /* Move the voice to character pos (a sentence start). Keeps paused if paused. */
  function jumpTts(pos) {
    const text = current ? current.text : "";
    if (ttsPaused || ttsEnded) {
      ttsPaused = true;
      ttsEnded = false;
      ttsPos = pos;
      emitTtsProgress(text);
      return;
    }
    token++;
    speak(text, token, pos);
  }

  function toggle() {
    if (mode === "mp3" && el) {
      if (el.paused) el.play().catch(function () {});
      else el.pause();
    } else if (mode === "tts" && canSpeak()) {
      if (ttsEnded) replay();
      else if (ttsPaused) {
        const starts = sentenceStarts(current.text);
        token++;
        speak(current.text, token, starts[sentenceIndex(starts, ttsPos)]); // resume at the sentence start
      }
      else pauseTts();
    } else if (current) {
      replay();
    }
  }

  /* Pauses whatever is playing (used when the page is hidden). */
  function pause() {
    if (mode === "mp3" && el && !el.paused) el.pause();
    else if (mode === "tts" && !ttsPaused && !ttsEnded) pauseTts();
  }

  /* Jump to ratio 0..1 of the story (TTS: to the start of that sentence). */
  function seek(ratio) {
    if (!current) return;
    ratio = Math.max(0, Math.min(1, ratio));
    if (mode === "mp3" && el && isFinite(el.duration)) {
      el.currentTime = Math.min(ratio * el.duration, Math.max(0, el.duration - 0.25));
    } else if (mode === "tts") {
      const starts = sentenceStarts(current.text);
      jumpTts(starts[sentenceIndex(starts, Math.floor(ratio * current.text.length))]);
    } else {
      play(current.src, current.text, ratio);
    }
  }

  /* dir = -1 / +1: 10 s back/forward (MP3) or previous/next sentence (TTS). */
  function skip(dir) {
    if (!current) return;
    if (mode === "mp3" && el && isFinite(el.duration)) {
      el.currentTime = Math.max(0, Math.min(el.currentTime + dir * SKIP_SEC, el.duration - 0.25));
    } else if (mode === "tts") {
      const starts = sentenceStarts(current.text);
      const i = sentenceIndex(starts, ttsPos);
      let target;
      if (dir < 0) target = ttsPos - starts[i] > 12 ? i : Math.max(0, i - 1); // like a music player
      else target = i + 1;
      if (target >= starts.length) return;
      jumpTts(starts[target]);
    } else {
      toggle(); // nothing loaded yet: start the story
    }
  }

  function setRate(r) {
    rate = r;
    if (el) el.playbackRate = r;
    if (mode === "tts" && !ttsPaused && !ttsEnded) {
      const starts = sentenceStarts(current.text);
      jumpTts(starts[sentenceIndex(starts, ttsPos)]); // restart this sentence at the new pace
    }
    emit("rate", { rate: r });
  }
  function getRate() { return rate; }

  function replay() {
    if (current) play(current.src, current.text);
  }

  function stop() {
    teardown();
    emit("state", { playing: false, mode: null });
  }

  /* Loads a clip without playing it; toggle()/replay() will start it. */
  function prepare(src, text) {
    teardown();
    current = { src: src, text: text };
    emit("state", { playing: false, mode: null });
  }

  function getMode() { return mode; }

  // Phones keep speaking after the tab is closed, locked or left: stop it.
  window.addEventListener("pagehide", function () { teardown(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  return {
    on: on, play: play, prepare: prepare, toggle: toggle, pause: pause, seek: seek, skip: skip,
    setRate: setRate, getRate: getRate, replay: replay, stop: stop, getMode: getMode
  };
})();
