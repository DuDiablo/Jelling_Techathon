# Harald's Quest: brainstorm brief

> Paste this whole file into a new Claude chat, then ask for ideas.
> It describes everything we have built so far (14 Nov 2026).

## Who we are

- A team of 6 students at **Techathon 2026**, a 48-hour hackathon.
- The location is **Kongernes Jelling**, a Viking museum in Denmark about King Harald Bluetooth.
- The theme is *"Connecting people, places, and events with tech"*. Our angle is **Bluetooth**, which is named after Harald.

## The problem

- The museum has very little written text and no audio guide.
- School classes rush through and skip rooms, especially the Fire Room and the Yggdrasil Room.

## Our idea in one sentence

3D-printed rune stones hidden around the museum act as Bluetooth beacons. A visitor's phone connects to each rune, plays that room's story, and unlocks the next one, like a treasure hunt.

## How a visit works today

1. **Main menu:** an old explorer's-map look. The visitor taps **Play game**.
2. **Map screen:**
   - A parchment map shows three rooms. The next room has a glowing orange seal; later rooms are locked.
   - Three "?" tiles show progress.
   - A **hint card** tells you where to go.
3. **Connect rune:** our own themed sheet asks which rune you are standing next to. Chrome then shows its Bluetooth pair window. Websites cannot skip that window; only a native app could.
4. **Press the physical rune:** the phone stays connected and listens for the button press.
   - **Right rune:** the rune's LED lights up, a full-screen "Rune unlocked" animation plays, then the story screen shows a **Play story** button. Audio starts only on tap.
   - **Too early:** the LED fast-blinks and a "Not yet, traveller" note appears.
   - **Already found:** an "Already collected" note appears.
5. **After all 3 runes (the finale):**
   - The night falls, and Harald's two runes **ᚼ + ᛒ glide together** into the Bluetooth symbol.
   - The text explains that Bluetooth is named after him.
6. **Crown ceremony:**
   - A golden crown descends and the screen says "Congratulations! Hail, Ruler of the Runes".
   - The visitor types their **name**, and it is **carved letter by letter in Viking runes** (Younger Futhark) onto a granite rune stone.

## The three runes (in order)

| # | Rune | Room | Hint today |
|---|------|------|------------|
| 1 | ᚲ (kenaz, the torch) | The Fire Room | An 8-line riddle: *kindle a light and sweep the dark until the rune wakes* (the rune is hidden somewhere dark, so you search with a light) |
| 2 | ᚺ (hagalaz, H for Harald) | The Yggdrasil Room | Plain sentence; **riddle still to write** |
| 3 | ᛒ (bjarkan, B for Bluetooth) | The Rune Stone Room | Plain sentence; **riddle still to write** |

Each room has a short story, about 30 seconds read aloud. The story texts are placeholders that still need checking with the museum guide.

## Tech (keep ideas within this)

- **Website, not an app:** plain HTML, CSS and JavaScript, hosted free on GitHub Pages. No frameworks, no backend, no build step.
- **Runes:** ESP32 boards inside 3D-printed runes. Each has a button and an LED. They use Web Bluetooth (works in **Chrome on Android**, not iPhone).
- **iPhone fallback:** an NFC sticker on each rune opens the site for that rune.
- **Audio:** MP3s per room are planned but not recorded yet. Until then the phone reads the story aloud (text-to-speech).
- **Progress resets on reload** for now (handy for testing; switch it on before the real demo).
- **Debug mode:** add `?debug=1` to simulate rune presses and skip to the ending without hardware.

## Look and feel

- **Main game:** antique map on parchment. Fonts are Cinzel (titles) and EB Garamond (body). Brown ink with orange-red seals.
- **Ending ("Jelling Gold" theme):**
  - Night-hall browns, burnished gold and runestone red.
  - Slow, smooth animations with no bouncing.
- **Browser tab icon:** a gold bind-rune of ᚼ + ᛒ.

## Not done yet / known gaps

- Riddles for rooms 2 and 3
- Recorded audio (voice actor or narrator?)
- Testing with the real ESP32 runes and on real phones
- Story facts checked with the museum
- 7-letter names wrap the last rune onto a new line on the stone
- No iPhone Bluetooth (NFC only)

## What we want from you

Brainstorm ideas we could add in the time left. For each idea, give us:

- **What it is**
- **Why visitors (especially school kids) would love it**
- **How hard it is with our tech**, as easy / medium / hard

Areas to think about:

- Making the hunt more fun or competitive (teams, timers, scores?)
- Riddles for the Yggdrasil and Rune Stone rooms
- Better use of the LEDs, buttons and Bluetooth on the runes
- Something to take home after the visit (the carved name?)
- Making the hackathon pitch/demo memorable for the judges
