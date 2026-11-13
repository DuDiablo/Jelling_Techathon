# Audio files

Put the recorded MP3s in this folder with exactly these names:

| File | Plays when |
|------|-----------|
| `rune1.mp3` | Rune 1 is collected |
| `rune2.mp3` | Rune 2 is collected |
| `rune3.mp3` | Rune 3 is collected |
| `notyet.mp3` | A rune is scanned too early ("Not yet") |
| `already.mp3` | A rune is scanned again ("Already collected") |
| `finished.mp3` | The finale after the last rune |

If a file is missing or can't play, the phone reads the matching text from `docs/js/content.js` aloud instead.

Tips: MP3, mono, 64–128 kbps is plenty. Keep each clip under about 60 seconds. If you change a story, update its text in `content.js` too, so the on-screen transcript matches.
