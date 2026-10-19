# The table: look and feel

*Phase 0, 2026-10-19. Takes the place of Glimmerwood's STORY.md. The owner's art rules (playbook §3) apply; the toolkit is
Glimmerwood's `proto/paint.js`, copied and extended.*

## One idea

**Cards on a warm kitchen table after dinner.** A worn felt or wood surface lit by a pendant lamp; painted storybook props
sit at the edges (a coffee mug, a tin of pencils and a score pad, a plate of cookies, a reading-glasses case, a radio);
the cards are the brightest, crispest thing on screen.

## Rules

1. **Cards are fully saturated and crisp.** Pure red `#d0182f`, near-black `#16181d`, the four-color deck's blue `#1f5fd6` and
   green `#13894a`, on a clean warm-white face `#fffdf7`. No haze, no grain, no texture on the face. Drawn at device
   pixels (canvas rebuilt at `devicePixelRatio`), measured by `crisp.mjs --check 2` with haze off.
2. **Haze on backdrops only.** The lamp's golden-hour wash grades the felt edges, the props and the menus. Never the cards,
   the bid chips or the score.
3. **Painterly props, Glimmerwood style**: curved shapes, tinted shadow-side lines in each prop's own darker colour (no black
   ink), soft two-light shading (warm lamp top-left, cool window fill right), a soft contact shadow under each prop, no
   stray seams or back shadows.
4. **Nothing important behind UI.** Props live in the outer 12% of the table and slide off-screen in Comfort mode or on
   iPhone SE so cards, seats and scores always have the room. Sheets stack above every prop.
5. **People are seats, not portraits.** Each bot is a painted name card propped on the table (a monogram in a little frame,
   their name, their level as one, two or three pips). No faces to judge, no cartoon expressions mocking a set.
6. **Smooth.** Deals, card throws and trick sweeps run on `requestAnimationFrame` with eased arcs; no black boxes in
   transitions (one canvas cross-fade between screens). Reduced motion swaps arcs for fades.
7. **Readable.** Index corners large; rank glyphs in a sturdy slab (Glimmerwood's Grandstander for headings, Fredoka for
   UI; card indices in a heavier custom-drawn set so 6/9 and Q/0 never confuse). Comfort mode per DESIGN §6.

## Palette

| Use | Colours |
|---|---|
| Felt (default) | `#2f6b45` → `#245638`, lamp pool `#3d7d52` |
| Wood rail and props | oak `#a5713e`, walnut `#6b4426`, enamel cream `#efe3c8` |
| Lamp light / haze | `#ffd89a` at 10-18% over backdrops only |
| UI paper (score sheet) | `#fbf4e2` with pencil-grey `#4a4a52` rules and red `#c0392b` for sets and penalties |
| Interactive gold | `#f0b543` (buttons), `#ffd27a` (highlight) |
| Card back (default) | deep red `#9c1f2b` with a cream border and a painted lattice |

## Screens in the look

- **Title**: top-down table, the wordmark painted on a wooden sign leaning against the mug, a fanned hand of four aces in the
  middle, the big **Deal** button on a paper tag.
- **Table**: felt fills the screen; your hand fanned along the bottom; three seat cards; the trick in the lamp pool.
- **Score sheet**: a real score pad (ruled paper, pencil handwriting font for numbers, team columns), the seed printed in a
  typewriter face at the bottom like a receipt.
- **Stats**: the same paper, with hand-drawn-looking bar charts.
- **Caregiver**: plain and calm; a paper card with large text and a key icon.

## Icon and splash

Icon: an ace of spades and an ace of hearts crossed on green felt, painted, no text. Splash: the title table without UI.
Both rendered by `scripts/app-art.mjs` from the same SVG as the game.
