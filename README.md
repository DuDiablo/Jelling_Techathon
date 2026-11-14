# Harald's Quest

> Runes hidden around the museum guide visitors room by room: press a rune, hear its story, unlock the next.

Techathon 2026 · Kongernes Jelling, Denmark · Theme: *Connecting people, places, and events with tech*

**Live app:** https://dudiablo.github.io/Jelling_Techathon/ (open in **Chrome on Android**)
**Team testing (no hardware):** https://dudiablo.github.io/Jelling_Techathon/?debug=1

## Team

| Name | GitHub | Role |
|------|--------|------|
| TBD | @DuDiablo | TBD |
| TBD | TBD | TBD |
| TBD | TBD | TBD |
| TBD | TBD | TBD |
| TBD | TBD | TBD |
| TBD | TBD | TBD |

## The idea

- **Problem:** Kongernes Jelling has very little written text and no audio guide. School classes rush through and skip rooms, especially the fire room and the Yggdrasil room.
- **Runes as beacons:** 3D-printed rune copies with an ESP32 inside, placed in different rooms (ᚠ → ᚼ → ᛒ).
- **Audio guide:** the visitor's phone plays the story for that room.
- **Game:** runes must be found in order. Each one unlocks the next.
- **Finale:** Harald's runes ᚼ + ᛒ combine into the Bluetooth logo, named after Harald Bluetooth, who lived here.

## How a visit works

1. Open the app and tap **Play game**. The map shows the next rune (orange seal).
2. Tap **Connect rune**. Our own **"Wake a rune"** sheet asks which rune you're next to.
3. Pick it. Chrome's Bluetooth window then lists **only that rune**: tap it, then **Pair**. If the phone already paired with that rune, it reconnects without the window, on Chrome versions that support it.
4. The phone **stays connected**. **Press the physical rune.**
   - **Correct next rune:** the rune LED turns on, a full-screen **"Rune unlocked"** animation plays, then the story screen shows a **Play story** button. The audio only starts when you tap it.
   - **Rune pressed too early:** the LED fast-blinks and a **"Not yet"** note appears.
   - **Rune already collected:** an **"Already collected"** note appears.
5. After rune 3's story, the **finale** shows ᚼ and ᛒ merging into one.

**iPhone / no Bluetooth:** each rune has an NFC sticker that opens `…/?rune=1`, `=2` or `=3`, which shows a **Hear rune N** button (see the note on [saving progress](#settings-for-testing)).

## Hardware ↔ app protocol

Must match `firmware/rune/rune.ino`. Device names: `RUNE_1`, `RUNE_2`, `RUNE_3` (the app filters on `RUNE_`).

| What | UUID | Direction |
|---|---|---|
| Service | `7a1e0001-5c1d-4b6a-9f2e-6a72756e6500` | – |
| Rune ID / press (notify) | `7a1e0002-5c1d-4b6a-9f2e-6a72756e6500` | rune → phone |
| LED mode | `7a1e0003-5c1d-4b6a-9f2e-6a72756e6500` | phone writes one character |
| Button press (notify, preferred) | `7a1e0004-5c1d-4b6a-9f2e-6a72756e6500` | rune → phone |

- **Press-the-rune mode:** the app subscribes to `0004` (or `0002` if `0004` doesn't exist). It ignores `"0"` and reacts to `"1"`, `"2"` and `"3"` sent as plain text. Repeat presses within 1.5 s are ignored.
- **LED codes:** `"0"` idle · `"1"` collected (solid) · `"2"` wrong order (fast blink).
- The phone does **not** disconnect after a press. If a rune drops out, the app says so and you can reconnect.

## Run it locally

No install or build step: plain HTML, CSS and JavaScript.

```bash
python -m http.server 8000 -d docs
```

Then open http://localhost:8000/?debug=1

- `?debug=1` shows **Simulate rune 1 / 2 / 3** buttons, so you can play without hardware.
- To use the real runes from a laptop, open `http://localhost:8000/` in **Chrome** (the laptop needs Bluetooth). Web Bluetooth works on localhost and HTTPS only.
- Phones can't reach your laptop's localhost, so use the live link instead.

## Edit the texts

Only edit **[docs/js/content.js](docs/js/content.js)**: rune names, rooms, hints, stories and map positions (`mapX`/`mapY` in %). The guide at the top explains each field.
⚠️ The current texts are **placeholders**. Check them with the museum guide.

**Audio:** put MP3s in [docs/audio/](docs/audio/README.md) (`rune1.mp3`, `rune2.mp3`, `rune3.mp3`, `notyet.mp3`, `already.mp3`, `finished.mp3`). If a file is missing, the phone reads the text aloud.

**Optional assets** (shown automatically if present):
- `docs/assets/bluetooth-logo.svg`: official logo on the finale screen
- `docs/assets/map-bg.png`: antique map behind the start screen (included; remove it for a plain background)

## Settings for testing

At the top of [docs/js/app.js](docs/js/app.js):

```js
const PERSIST_PROGRESS = false;
```

- `false` (current): every page refresh starts the quest from 0 / 3. Good for demos and testing.
- `true`: collected runes are remembered. **Needed for the NFC stickers**, because each tag tap opens a fresh page.

In the app, **Settings** has a "Show story text" switch and **Reset quest**.

## Project structure

```
docs/                  ← the web app (GitHub Pages serves this folder)
  index.html           all screens + hand-drawn SVG icons
  css/style.css        design tokens, layout, screens, animations, reduced motion
  js/content.js        texts, rooms, map positions  ← content person edits this
  js/ble.js            Web Bluetooth: connect, notifications, LED, reconnect
  js/audio.js          MP3 playback with text-to-speech fallback
  js/app.js            game state, screens, chooser, overlays, NFC + debug
  audio/README.md      expected audio file names
  decisions.md         decision log (note: public on GitHub Pages)
design/  src/          placeholders
```

**Works on:** phones from 320px wide, landscape phones (two columns), tablets and desktops (journal page on a leather "desk"). Respects reduced-motion settings.

## Deploy

GitHub Pages is on: **Settings → Pages → `main` → `/docs`**. Every merge to `main` that changes `docs/` goes live in about a minute (reload once on the phone to skip the cache).

**After changing CSS or JS:** bump the `?v=…` number on the `<link>` / `<script>` tags in `docs/index.html` (e.g. `?v=20261114-2`). Otherwise browsers and phones may keep an old cached file, and a mix of old and new files can stop the app from starting. If an app on your laptop acts strange after an update, press **Ctrl + Shift + R**.

**NFC stickers** (write with the NFC Tools app):
`https://dudiablo.github.io/Jelling_Techathon/?rune=1` (and `=2`, `=3`)

## Test checklist (real hardware)

- [ ] Each rune visible as `RUNE_n` in nRF Connect
- [ ] Connect rune → pick a card → Chrome's window shows only that rune → connected
- [ ] Press the correct rune → LED on + "Rune unlocked" animation + Play story
- [ ] Press a rune too early → LED fast-blinks + "Not yet"
- [ ] After rune 3 → story, then finale
- [ ] Phone stays connected across presses; a dropped rune shows a reconnect message
- [ ] Second visit: "Paired" runes reconnect without Chrome's window (if supported)
- [ ] NFC tags open the right rune (with `PERSIST_PROGRESS = true`)
- [ ] Full walk-through 3× without errors

## Getting started in 2 minutes (git)

**1. Get the code (once):**
```bash
git clone https://github.com/DuDiablo/Jelling_Techathon.git
cd Jelling_Techathon
```

**2. Start a new task, always from a fresh `main`:**
```bash
git checkout main
git pull
git checkout -b feat/my-task
```

**3. Save your work:**
```bash
git add .
git commit -m "feat: short description of what you did"
```

**4. Upload it:**
```bash
git push -u origin feat/my-task
```

**5. Open a Pull Request:** on GitHub, click **"Compare & pull request"**, fill in the template, and merge. `main` only accepts changes through pull requests (0 approvals needed).

Stuck? Read [CONTRIBUTING.md](CONTRIBUTING.md) or ask in the team chat.

## Tech stack

Plain HTML + CSS + JavaScript (no framework, no build step) · Web Bluetooth · Web Speech API (text-to-speech fallback) · GitHub Pages hosting · ESP32 runes (Arduino firmware). Decisions go in [docs/decisions.md](docs/decisions.md).
