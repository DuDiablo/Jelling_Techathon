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
               Use \n for a line break (handy for riddles).
   - text    : the story. It is shown on screen AND read aloud by the
               phone if the MP3 is missing.
   - audio   : the MP3 file in docs/audio/ (see docs/audio/README.md).
   - mapX/mapY: marker position on the map, in percent
               (0,0 = top-left, 100,100 = bottom-right).

   The clans (houses) and the crown texts are further down.

   After editing, open the app with ?debug=1 to check every rune.

   NOTE: all texts below are PLACEHOLDERS. Check every fact with the
   museum guide before the demo.
   ===================================================================== */

const RUNES = [
  {
    id: 1,
    symbol: "ᚲ",
    room: "The Fire Room",
    hint: "Where hearth-flames roared and the old hall slept,\n" +
          "a rune of fire in shadow is kept.\n" +
          "The dark holds it close; no wandering eye\n" +
          "will find where the torch-rune's embers lie.\n" +
          "So kindle a light, O seeker bold,\n" +
          "and sweep the dark like the torch-bearers of old.\n" +
          "On stone, on timber, on wall and floor —\n" +
          "shine, and keep shining, till the rune wakes once more.",
    text: "Right now you are in the hall, or so to speak, Harald's house. In the middle of the house there is a nice fireplace. So please sit down and listen to the stories in this room. You can also see the stories in the fire.",
    audio: "audio/rune1.mp3",
    mapX: 24,
    mapY: 70
  },
  {
    id: 2,
    symbol: "ᚺ",
    room: "The Yggdrasil Room",
    hint: "Seek the great ash tree whose roots and branches hold the nine worlds together.",
    text: "Right now you are standing in the mythology room. In this room you will see some huge white roots. On them there will be pictures, you will hear stories, and the room will shift colours. So please sit down and enjoy the videos.",
    audio: "audio/rune2.mp3",
    mapX: 74,
    mapY: 56
  },
  {
    id: 3,
    symbol: "ᛒ",
    room: "The Rune Stone Room",
    hint: "Find the stone where a king wrote his own story. Look for the rune ᛒ.",
    text: "You have just finished visiting the museum, and you have probably learned a lot about Harald, Gorm the Old and Queen Thyra. Gorm and Harald are the first in the royal line of Denmark's monarchy. Next, go outside to the monument area and see the two huge rune stones in front of the church. These are the stones that Gorm and Harald placed right here in the Viking Age.",
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

/* The crown screen after the finale: congratulations + every clan member's name in runes.
   {clan} is replaced by the house name, {name} by the name(s) they type.
   The "...Many" lines are used when the clan has more than one member. */
const CROWN = {
  kicker: "Quest complete",
  title: "Congratulations!",
  subtitle: "Hail, {clan}, Ruler of the Runes",
  subtitleMany: "Hail, {clan}, Rulers of the Runes",
  ask: "What is your name, traveller?",
  askMany: "What are your names, {clan}?",
  button: "Carve my name",
  buttonMany: "Carve our names",
  hail: "Welcome, {name} of the {clan}, Ruler of the Runes!",
  hailMany: "Welcome, {name} of the {clan}, Rulers of the Runes!",
  note: "Your name is written in the Younger Futhark, the same runes King Harald carved on the Jelling stones.",
  noteMany: "Your names are written in the Younger Futhark, the same runes King Harald carved on the Jelling stones."
};

/* The houses a group can play as, chosen after "Play game".
   colour: the seals on the map.  deep: collected seals.  gem: the jewels in the crown.
   rune: the house's first letter in the Younger Futhark. */
const CLANS = [
  {
    id: "gorm",
    name: "House of Gorm",
    rune: "ᚴ",
    motto: "Gorm the Old, first king of the Jelling line.",
    colour: "#3f7a3a",
    deep: "#264d23",
    gem: "#9be38a"
  },
  {
    id: "thyra",
    name: "House of Thyra",
    rune: "ᚦ",
    motto: "Queen Thyra, honoured on the Jelling stones.",
    colour: "#a3243b",
    deep: "#6b1426",
    gem: "#ff9aac"
  },
  {
    id: "harald",
    name: "House of Harald",
    rune: "ᚼ",
    motto: "Harald Bluetooth, who united the Danes.",
    colour: "#2a5fae",
    deep: "#183c74",
    gem: "#9cc8ff"
  }
];

/* The "Choose your house" screen. maxMembers = the most names carved on the stone. */
const CLAN_SCREEN = {
  title: "Choose your house",
  label: "Who rides with you?",
  ask: "How many are in your clan?",
  button: "Begin the quest",
  maxMembers: 6
};

/* The finale after the last rune. "hint" is shown on the map once the quest is complete. */
const FINISHED = {
  title: "The two runes become one",
  text: "In Harald's own time the H rune ᚺ was carved more simply, as ᚼ. Put Harald's two runes together, ᚼ and ᛒ, and they make a symbol you see every day. More than a thousand years later, engineers named their wireless technology after Harald Bluetooth, because he united people, just as Bluetooth unites devices. The symbol on your phone is his signature.",
  hint: "Every rune is found. Harald's secret is yours.",
  audio: "audio/finished.mp3"
};
