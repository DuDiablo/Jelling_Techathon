/* =====================================================================
   HARALD'S QUEST — CONTENT
   ---------------------------------------------------------------------
   This is the ONLY file the content person needs to edit.

   How to edit safely:
   - Change the text between the quotes "like this". Keep the quotes,
     the commas at the end of lines and the { } brackets.
   - If your text contains a double quote ", write it as \" instead.
   - The runes are collected in the order they appear in RUNES.
   - id      : must match the number the physical rune sends (1, 2, 3).
   - symbol  : the rune glyph shown in the app (must match the 3D print).
   - room    : the room name shown on the map and the story screen.
   - hint    : shown on the map while this rune is the next one to find.
   - text    : the story. It is shown on screen AND read aloud by the
               phone if the MP3 is missing.
   - audio   : the MP3 file in docs/audio/ (see docs/audio/README.md).
   - mapX/mapY: marker position on the map, in percent
               (0,0 = top-left, 100,100 = bottom-right).

   After editing, open the app with ?debug=1 to check every rune.

   NOTE: all texts below are PLACEHOLDERS. Check every fact with the
   museum guide before the demo.
   ===================================================================== */

const RUNES = [
  {
    id: 1,
    symbol: "ᚠ",
    room: "The Fire Room",
    hint: "Find the room where the flames never sleep. Look for the rune ᚠ near the hearth.",
    text: "Welcome, traveller. You stand where the fire burned day and night. In a Viking hall the hearth was the heart of the home: it gave light, warmth and food, and around it people told the stories you are about to hear. The rune ᚠ, fehu, means wealth, and in a cold northern winter, fire was wealth. Your quest has begun. Seek the great tree that holds up the nine worlds.",
    audio: "audio/rune1.mp3",
    mapX: 24,
    mapY: 70
  },
  {
    id: 2,
    symbol: "ᚼ",
    room: "The Yggdrasil Room",
    hint: "Seek the great ash tree whose roots and branches hold the nine worlds together.",
    text: "This is Yggdrasil, the world tree. The Vikings believed its branches held up the sky and its roots reached the land of the dead. Gods, giants and humans all lived somewhere on this one tree. The rune ᚼ, hagall, is the first letter of a great king's name. Remember it well. Now go and find where that king left his mark in stone.",
    audio: "audio/rune2.mp3",
    mapX: 74,
    mapY: 56
  },
  {
    id: 3,
    symbol: "ᛒ",
    room: "The Rune Stone Room",
    hint: "Find the stone where a king wrote his own story. Look for the rune ᛒ.",
    text: "King Harald raised a great stone here at Jelling. On it he wrote that he won all of Denmark and Norway, and made the Danes Christian. People called him Harald Bluetooth. The rune ᛒ, bjarkan, is the first letter of his nickname. You have now found both of his runes: ᚼ for Harald and ᛒ for Bluetooth.",
    audio: "audio/rune3.mp3",
    mapX: 42,
    mapY: 24
  }
];

/* Shown when a visitor scans a rune that comes later in the quest. */
const NOT_YET = {
  title: "Not yet, traveller",
  text: "This rune is still sleeping. Follow the map and find the runes in order to wake it.",
  audio: "audio/notyet.mp3"
};

/* Shown when a visitor scans a rune they have already collected. */
const ALREADY = {
  title: "Already collected",
  text: "You have already heard this rune's story. Follow the map to the next one.",
  audio: "audio/already.mp3"
};

/* The crown screen after the finale: congratulations + the visitor's name in runes.
   "{name}" in hail is replaced by the name they type. */
const CROWN = {
  kicker: "Quest complete",
  title: "Congratulations!",
  subtitle: "Hail, Ruler of the Runes",
  ask: "What is your name, traveller?",
  button: "Carve my name",
  hail: "Welcome, {name}, Ruler of the Runes!",
  note: "Your name is written in the Younger Futhark, the same runes King Harald carved on the Jelling stones."
};

/* The finale after the last rune. "hint" is shown on the map once the quest is complete. */
const FINISHED = {
  title: "The two runes become one",
  text: "Put Harald's two runes together, ᚼ and ᛒ, and they make a symbol you see every day. More than a thousand years later, engineers named their wireless technology after Harald Bluetooth, because he united people, just as Bluetooth unites devices. The symbol on your phone is his signature.",
  hint: "Every rune is found. Harald's secret is yours.",
  audio: "audio/finished.mp3"
};
