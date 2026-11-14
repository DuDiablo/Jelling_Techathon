# Jelling Gold

A night-in-the-king's-hall theme for Harald's Quest's final moments (the ᚼ + ᛒ finale and the crown ceremony): deep hearth browns lit by burnished gold, with the red paint of the Jelling rune stones.

## Color Palette

- **Night Hall**: `#140c07` – deepest background, edges of the screen
- **Hearth Brown**: `#3a2416` – centre glow of the background
- **Burnished Gold**: `#d9ad52` – crown, rays, rings, primary accent
- **Pale Gold**: `#f6e2a0` – highlights, sparks, titles on dark
- **Runestone Red**: `#9e2a1c` – carved runes, gems, the "Quest complete" seal
- **Parchment**: `#e9dcc0` – body text on dark, the name card

## Typography

- **Display**: Cinzel Decorative Bold – "Congratulations!", big moments
- **Headers & labels**: Cinzel – titles, buttons, small caps labels
- **Body**: EB Garamond (italic for asides)
- **Runes**: Noto Sans Runic – the carved name

## Motion

- **One easing family.** Entrances use *settle* `cubic-bezier(.22, 1, .36, 1)`: fast start, long soft landing. Moves use *glide* `cubic-bezier(.65, 0, .35, 1)`. No bouncy overshoots.
- **Unhurried.** 0.8–1.6 s entrances, staggered about 120 ms apart, never all at once.
- **Smooth on phones.** Only `opacity` and `transform` animate. Glows breathe by fading a blurred layer, not by animating `filter` or shadows.
- **Dark arrives gently.** A night veil fades in (0.8 s) instead of the background jumping from parchment to dark.
- **Reduced motion.** Everything shows its final state with no movement.

## Best Used For

The finale, the crown ceremony, and any future "big reward" moment in the app.
