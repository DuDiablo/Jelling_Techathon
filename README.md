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
- **Runes as beacons:** 3D-printed rune copies with an ESP32 inside, placed in different rooms (ᚠ → ᛒ → ᚼ).
- **Audio guide:** the visitor's phone plays the story for that room.
- **Game:** runes must be found in order. Each one unlocks the next.
- **Finale:** Harald's runes ᚼ + ᛒ (H and B, found in rooms 3 and 2) combine into the Bluetooth logo, named after Harald Bluetooth, who lived here.

## How a visit works

1. Open the app and tap **Play game**, then **choose your house**: House of Gorm, Thyra or Harald, and how many are in your clan (1–6).
   The map seals and the crown jewels take the house colour, and at the end every member carves their name on the rune stone.
   The map shows the next rune (seal in your house colour).
2. Tap **Connect rune**. Our own **"Wake a rune"** sheet asks which rune you're next to.
3. Pick it. Chrome's Bluetooth window then lists **only that rune**: tap it, then **Pair**. If the phone already paired with that rune, it reconnects without the window, on Chrome versions that support it.
4. The phone **stays connected**. **Press the physical rune.**
   - **Correct next rune:** the rune LED turns on, a full-screen **"Rune unlocked"** animation plays, then the story screen shows a **Play story** button. The audio only starts when you tap it.
   - **Rune pressed too early:** the LED fast-blinks and a **"Not yet"** note appears.
   - **Rune already collected:** an **"Already collected"** note appears.
5. After rune 3's story, the **finale** shows ᚼ and ᛒ merging into one.

**NFC tags (any phone, also iPhone):** each rune has an NFC sticker. Tapping it works exactly like pressing the rune (unlock, "Not yet" or "Already collected"); see [NFC tags](#nfc-tags). The LED only reacts to Bluetooth.

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

**Joystick controller** (`RUNE_CONTROLLER`, firmware built with `CONTROL_MODE 1`). It has its own service, so it never gets mixed up with the runes. Used only by **Sail to Jelling** (`docs/js/controller.js`).

| What | UUID | Direction |
|---|---|---|
| Service | `7a1e0010-5c1d-4b6a-9f2e-6a72756e6500` | – |
| Controls (notify) | `7a1e0011-5c1d-4b6a-9f2e-6a72756e6500` | controller → phone, text `"x,y,a"` |
| Sounds (write) | `7a1e0012-5c1d-4b6a-9f2e-6a72756e6500` | phone writes one character |

- **Controls:** `x` -1 left … 1 right, `y` -1 down … 1 up, `a` 1 = action pressed.
- **In the game the axes are swapped** (the joystick is mounted turned): the controller's `y` steers the ship left / right and its `x` moves it forward / back. Change it in `docs/js/app.js` (`Controller.on("input", …)`).
- **Sounds:** `"1"` click (coin), `"2"` win (landed at Jelling), `"3"` lose (bump).

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

- `false` (current): a normal page refresh starts the quest from 0 / 3. Good for demos and testing.
- `true`: a normal refresh also continues the visit.

NFC tags don't need this switch: a page opened from a tag always continues the saved visit (progress, house, clan size, quest timer). It's saved on the phone and wiped by a **page refresh** (hard reset), **Reset quest**, or after 6 hours.

In the app, **Settings** has a "Show story text" switch and **Reset quest**.

## Project structure

```
docs/                  ← the web app (GitHub Pages serves this folder)
  index.html           all screens + hand-drawn SVG icons
  css/style.css        design tokens, layout, screens, animations, reduced motion
  js/content.js        texts, rooms, map positions  ← content person edits this
  js/ble.js            Web Bluetooth: connect, notifications, LED, reconnect
  js/audio.js          MP3 playback with text-to-speech fallback
  js/app.js            game state, screens, chooser, overlays, NFC tags + debug
  js/keepsakes.js      take-home images: rune stone, certificate, alphabet card
  js/sail.js           "Sail to Jelling" longship mini game (canvas)
  js/controller.js     RUNE_CONTROLLER joystick over Bluetooth (for the game)
  audio/README.md      expected audio file names
  decisions.md         decision log (note: public on GitHub Pages)
design/  src/          placeholders
```

**Works on:** phones from 320px wide, landscape phones (two columns), tablets and desktops (journal page on a leather "desk"). Respects reduced-motion settings.

## Deploy

GitHub Pages is on: **Settings → Pages → `main` → `/docs`**. Every merge to `main` that changes `docs/` goes live in about a minute (reload once on the phone to skip the cache).

**After changing CSS or JS:** bump the `?v=…` number on the `<link>` / `<script>` tags in `docs/index.html` (e.g. `?v=20261114-2`). Otherwise browsers and phones may keep an old cached file, and a mix of old and new files can stop the app from starting. If an app on your laptop acts strange after an update, press **Ctrl + Shift + R**.

## NFC tags

Each rune gets one NFC sticker (NTAG213 or NTAG215) holding a **URL record**:

| Tag | URL |
|---|---|
| Rune 1 ᚠ (Fire Room) | `https://dudiablo.github.io/Jelling_Techathon/?rune=1` |
| Rune 2 ᛒ (Yggdrasil Room) | `https://dudiablo.github.io/Jelling_Techathon/?rune=2` |
| Rune 3 ᚼ (Rune Stone Room) | `https://dudiablo.github.io/Jelling_Techathon/?rune=3` |

**Writing a tag** with the free **NFC Tools** app (Android or iPhone):
1. **Write** → **Add a record** → **URL / URI**, paste the URL for that rune, then **OK**
2. Tap **Write** and hold the phone on the sticker until it says it's done
3. Test it with a second phone. If it's right, lock it: **Other** → **Lock tag** (permanent, so do this last)

**Placing:** stick the tag on or inside the 3D print where visitors will tap. Keep it a few mm away from the ESP32 and its battery, because metal weakens NFC. Label the stickers 1, 2 and 3 before writing so they don't get mixed up.

**How the app uses them:**
- **Any phone:** tapping a tag opens the link. The app continues the saved visit and treats it as pressing that rune.
  - On the first tag of a visit it first asks the visitor to choose a house, then wakes the rune.
- **Chrome on Android:** on the map, tap **Scan NFC tags** once and allow NFC. The app then reads tags while it's open, with no new page.
  - Android remembers the permission, so next time scanning starts by itself.
- **LED:** a tag can't light the rune's LED. Only a Bluetooth press does that.

## Sail to Jelling (mini game)

A longship game of about half a minute, the reward for finding all three runes. **Sail to Jelling** appears on the map and the finale screen once the quest is complete.
- Steer up the fjord to Jelling on **both axes**: left / right, and forward / back on the screen.
  - **Joystick:** tap **Connect joystick** under the game and choose `RUNE_CONTROLLER`. The stick steers. Connect it first, then press **Start** on the screen; the voyage only starts from that button. While sailing, the joystick button shouts **Row!** (a burst of speed, then a 3.5 s rest).
  - **Phone:** drag to steer, tap to row. **Keyboard:** arrows / WASD, Space to row.
- The controller plays its sounds: click on a ring, a hammer or a smashed rock, lose on a bump, win at Jelling.
- Odin's gold rings are gold for your clan. Every bump into a rune skerry, Jörmungandr's coils or the bank costs 2 rings. A clean voyage earns a bonus (+5 with no bumps, +2 with up to 2).
- Norse look: a dragon ship in your house colours, the Midgard Serpent rising in the fjord, Huginn and Muninn flying over, northern lights on the water, burial mounds, runestones and watch-fires on the banks, and Jelling's two mounds and stone ship at the end.
- **Thor's hammer (Mjölnir)** appears twice on the way. Pick it up and nothing can hurt the ship for 6 seconds: rocks shatter and the serpent dives.
- **Always fair:** every fjord is random, but each row of rocks leaves at least 76 px of open water and each serpent at least 86 px, with a line of rings showing the way through. No rock sits so close to a bank that the ship could get stuck.
- **Sound:** the phone plays synthesised sounds (rings, bumps, horn, thunder), made in the browser with no audio files. The speaker button in the top bar turns them off; the choice is remembered.
- **Result:** the card shows the gold and a rank (Rower, Viking, Jarl or Sea-King).
- The clan's best gold is kept with the visit and printed on the **Ruler of the Runes** certificate.
- If the page is hidden mid-voyage (a call, another app), the game pauses and shows "Ready…" for a moment when you come back.

**Testing without the controller:** in the browser console, `HaraldJoystick(1, 0)` steers right, and `Controller._feed("1,0,1")` acts like the controller sending x = 1 (forward in the game, because the axes are swapped) + button.

## Test checklist (real hardware)

- [ ] Each rune visible as `RUNE_n` in nRF Connect
- [ ] Connect rune → pick a card → Chrome's window shows only that rune → connected
- [ ] Press the correct rune → LED on + "Rune unlocked" animation + Play story
- [ ] Press a rune too early → LED fast-blinks + "Not yet"
- [ ] After rune 3 → story, then finale
- [ ] Phone stays connected across presses; a dropped rune shows a reconnect message
- [ ] Second visit: "Paired" runes reconnect without Chrome's window (if supported)
- [ ] Each NFC tag opens the right rune (first tag asks for the house; later tags keep progress)
- [ ] Android: **Scan NFC tags** → tapping tags in order unlocks them without a new page
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
