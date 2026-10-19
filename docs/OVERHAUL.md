# Overhaul plan (expert passover 1)

*2026-10-19, written by the lead from [REVIEW_UX.md](REVIEW_UX.md) (PR #10) and [REVIEW_RULES.md](REVIEW_RULES.md)
(PR #9), plus two findings from the build sessions (CI gates: the table rebuilds ~430 DOM nodes per card; iOS shell: the
family-table check isn't in CI). Playbook Phase 2b. The passover is done when a second review finds no P0 or P1.*

## Where we stand

The reviewers agree the foundations are right: legal play and scoring are correct, the shuffle is textbook and the bots
can't see hidden cards, the menus already feel like the product, nothing interrupts a hand, and every tap target passes.
Launch risk is concentrated in three things this audience judges hardest:

1. **Trust:** pass-and-play leaks cards; the fair-deal page compares against wrong numbers and promises more than a seed
   can prove; Standard Spades scores a broken nil the way a one-star reviewer called wrong.
2. **Accessibility:** VoiceOver hears seat names but no bids or scores, loses the last card of every trick, and its focus
   is left on hidden screens. Comfort on an iPhone SE has no room for the trick and misses its own 7:1 contrast promise.
3. **The default partner:** Standard makes six repeatable bad plays (feeding the Q♠ to a moon runner, ending a Hearts
   game it's losing, ignoring the J♦, keeping a bare K♠ on its own nil), and Expert/Extreme only differ in card play.

## Order of work

1. **Merge what is ready** (lead): card faces #8 → CI gates #7 → iOS shell #6 → the two reviews #9, #10 (docs and a
   deliberately failing `sim/test_ai_review.mjs`, kept out of CI) → Euchre → Oh Hell and Whist. Main stays green after
   each merge.
2. **Three developer sessions in parallel, one owner per file** (below), each on its own branch from the merged main.
   W2 is small and lands first; W3 wires W2's interface last.
3. **Second passover:** the same two reviewers re-run on the merged result. Remaining P0/P1 go into passover 2.
4. **Lead:** the 100K-hand sim on the final bots, numbers into RELEASE_REVIEW.md.

## W1 · Bots and rules (session `overhaul-bots`)

**Files (owner):** `proto/ai.js`, `proto/spades.js`, `proto/hearts.js`, `sim/generator.json` (`rules.spades`,
`rules.hearts`, `ai`), `sim/test_sim.mjs`, `sim/test_ai.mjs`, `sim/test_ai_review.mjs`, `sim/sim.mjs`, `docs/AI_SPEC.md`.
Euchre, Oh Hell and Whist AI modules are not yours (bug reports to the lead).

| Item | Change | Acceptance |
|---|---|---|
| R1 (P1) | Broken nil: Standard and Tournament OFF (nil tricks don't help the partner) but those tricks still count as **bags** with their own line; Kitchen ON. New explanation text. | scoring table: Standard set nil + set 5 = -150; bags line present |
| R3 (P1) | Rule "Blind nil exchange: 2 / 1 / 0 cards" (Kitchen 2). Engine phase `exchange` after bidding: nil passes N to partner, partner passes N back. Bots: partner sends lowest, nil sends highest (spades first). Expose `legal()` for the exchange so W3 can draw it. | blind nil made ≥ 45% at Standard, Kitchen |
| R4 (P1) | 10-for-200: +200 / -200 for team bids of 10+. | scoring table |
| R5-R8, R10 (P2) | Boston choice (off / took 13 / bid 13 ±500); "Lose at" off / -200 / -500 (Kitchen -200); explanations follow the toggles; Hearts Tournament made distinct (moon add-unless-it-loses, only hearts break hearts) or dropped; 2♣ leads the first trick option; Omnibus naming. | rules tests per preset |
| AI-H1, AI-S1, AI-H5 (P1) | Guards: no Q♠ dump onto a moon runner; own-nil discards ranked by danger (a spade that can't win first); every sin predicate needs a clean alternative. | `test_ai_review.mjs` H1, S1 pass; no shipped sins in 100K |
| AI-H3, AI-H4 (P1) | Hearts J♦ awareness when the rule is on: never duck or discard it to others if avoidable; take it when free. | review H3, H4 pass |
| AI-S2 (P2) | `set_nil_play_low` only when the nil can still be forced. | review S2 passes |
| AI-L2, AI-H2 (P1) | Game-end term in `outcome()` (±1000 on game end) and a score-pressure check in Standard Hearts. | review H2 passes at every level |
| AI-L1 (P1) | Expert and Extreme bid by look-ahead (sample deals, play each candidate bid out, best expected points; endgame bidding to set or to win); Extreme passes by look-ahead. | ladder: Extreme > Expert > Standard > Easy, each ≥ 58% (Extreme vs Expert ≥ 55%) |
| AI-L3-L5 (P2) | Expert+ nil threshold tuned by win rate; moon band per level; blind nil only when the game is otherwise lost. | sim report |
| T1 (P1) | Port every `test_ai.mjs` scenario to real deals (`table()` builder from the review) so Expert/Extreme actually sample; fail if an Expert scenario never sampled. | 0 unsamplable scenarios |
| T2, T3 (P2) | Seeds independent of `--workers`; plain-rule columns next to the bots' own definitions. | CI and laptop play identical hands |

Then move the review scenarios into `sim/test_ai.mjs` and delete `test_ai_review.mjs`.

## W2 · The fair deal (session `overhaul-fairdeal`)

**Files (owner):** `proto/dealer.js`, `proto/cards.js`, new `proto/ledger.js`, `site/verify.html`, `site/dealer.js`,
new `site/cards.js`, new `sim/test_fair.mjs` (add to `npm run check` and sim.yml).

| Item | Change | Acceptance |
|---|---|---|
| F1 (P1) | **The cut.** `dealer.js` gains `fingerprint(seed)` (first 8 hex of SHA-256 of the seed's 16 bytes; a small inline SHA-256, still no imports). `cards.dealHands(seed, dealer, deck, cut = 0)` rotates the seeded order by `cut` (0-51) before dealing. The app shows the fingerprint before the deal and the player cuts (W3); the score sheet prints seed, cut and fingerprint. verify.html takes seed + cut (+ optional fingerprint) and checks SHA-256(seed) against the fingerprint before dealing. | golden tests for fingerprint and cut; verify.html and app produce identical hands |
| F2, F3 (P0) | `ledger.js`: expectations per deck (plain / jokers) and per game, **as constants measured with dealer.js over 200,000 deals** (no `sort(random)`), nil-able by the plain rule (≤ 2 spades, none above the 9, no side ace) and by the bots' rule. | test: constants within 0.2 pts of a fresh 50K-deal measurement |
| F4 (P1) | Per-deal record: your high cards, the other three's average, and whether you were ahead / level / behind; chart "your high cards when ahead vs behind" against 4.0. | ledger view has the section |
| F5, F6 (P2) | Shapes filtered by deck plus an "other shapes" row; 95% bands for the sample size; sections hidden until n ≥ 200 (or the empty state for n < 20). | ledger view model |
| F7 (P2) | `site/cards.js` identical to `proto/cards.js` (identity test like dealer.js); FAQ line on seed space vs deck orders. | test |

**Interface for W3 (fixed now so W3 can build against it):**

```js
// proto/dealer.js
export function fingerprint(seed) -> "A1B2C3D4"            // sync
// proto/cards.js
export function dealHands(seed, dealer, deck, cut = 0)      // cut: 0..deck.length-1
// proto/ledger.js
export function entry({ hand, others, game, rules, standing }) -> object   // standing: "ahead" | "level" | "behind"
export function view(entries) -> { n, empty, sections: [{ id, title, note, rows: [{ label, mine, expected, lo, hi }] }] }
```

## W3 · Table, menus, accessibility, performance (session `overhaul-ux`)

**Files (owner):** `proto/main.js`, `proto/index.html`, `proto/style.css`, `proto/speech.js`, `proto/scenes.js`,
`proto/art.js`, `proto/themes.js`, `scripts/smoke.mjs`, `.github/workflows/web.yml`. Applies to every game on the table,
including Euchre, Oh Hell and Whist after they merge.

| Item | Change | Acceptance (smoke unless noted) |
|---|---|---|
| UX P0-1 | Pass-and-play cover: `#hand` in its own stacking context, hand and trick cleared, table `inert` behind the cover | elementFromPoint over the hand hits the cover |
| UX P0-2 | Full accessible names: seats (role, level, bid, tricks, points, turn, "double-tap to hear why"), score chip, trick cards ("June: ace of diamonds") | no seat name is just the name |
| UX P0-3 | Announcement queue: one sentence per trick end, never overwritten before its reading time; bots wait for the queue when VoiceOver runs (iOS: `isVoiceOverRunning` via the shell); "Last trick" in Read and the menu | log over a hand: nothing replaced early |
| UX P0-4 | Focus: new screen's h1 focused; dialogs labelled, focused, `inert` behind, focus returned | keyboard walk |
| UX P1-1 | Comfort SE: no lift (brass outline + "Selected" tab), one-line You strip, the trick as a labelled row under the seats | trick never covers a seat; no index covered |
| UX P1-2, P1-3 | "Your turn: tap a card" say-box; visible Why? tab; answer in the say-box, plates never resize | |
| UX P1-4, P1-7, P1-11 | Peek closed between hands and games and placed as a sheet; End game always confirms; consent buttons equal, "No thanks" first | |
| UX P1-5, P1-6 | Comfort palette at 7:1 (`--muted` variable), four-colour deck on with Comfort, paper chip under the bid number; switch tracks ≥ 3:1 with On/Off text | contrast check |
| UX P1-8, P1-9 | Setup: full-width presets, pinned Deal bar, collapsed rule summary; `radiogroup` + labels for every segmented control and select | |
| UX P1-10, P1-12 | Named buy buttons; "Try at the table" (one hand dressed in the theme, keep/put back after the hand); kind empty states (Fair deal, Leaderboards) | |
| UX P1-13, P1-14 | Follow iOS text size (Dynamic Type → Text size; pinch-zoom allowed); iPad: trick offsets scale with the table, name tabs, plates ×1.3, lamp pool | |
| UX P2 1-18 | The P2 table in REVIEW_UX.md, with P2-17 (lamp pool and an edge prop on the table) first | |
| R2 (P1) | Blind nil face down: when blind nil is legal for a human, the hand is dealt face down with **Look at my cards** / **Bid blind nil**; R3's exchange drawn when it happens | |
| R9 (P2) | Custom starts from the current preset's values | |
| F1 UI | Fingerprint shown before the deal, the cut ritual (tap the deck; Comfort-friendly; VoiceOver: "Cut the deck"), seed + cut + fingerprint on the score sheet and the "What is the seed?" copy that says only what is provable (UX/F1 P0 copy now, ritual after W2 merges) | |
| F2-F6 UI | Fair deal screen rendered from `ledger.view()` (bands, sections, empty state) after W2 merges | |
| Perf | drawTable patches instead of rebuilding: seat card-backs drawn once per theme/hand size, the played card's node removed, measurements read before writes | soak p95 within budget locally |
| CI | `scripts/check-cards.mjs` (PR #8) and `scripts/family-check.mjs` (PR #6) into web.yml | |

## Not in this passover

Native VoiceOver detection beyond the five-line plugin, "Try a trick" interactive tutorial (P2-16 is in W3 but may
slip), daily deal, family-table UI beyond the spike, 8 languages (after the strings settle), store listing and site.
