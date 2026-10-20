# Review: rules passover 2

*2026-10-20. Playbook Phase 2b, step 4. Game-design review, read-only on app code.* This passover checks the work the
first one asked for and gives Euchre, Oh Hell and Whist their first full review. It is written the way r/euchre,
r/spades and the Whist and Oh Hell regulars will read Kitchen Table on launch day.

**What was reviewed.** `main` (f39c231, with W2 merged) plus PR #16 (W1, `claude/wonderful-solomon-e45dcd`) and PR #15
(Oh Hell/Whist Extreme, `claude/extreme-ohhell-whist`), merged locally with no conflicts. The table code is from PR #18
(W3, `claude/busy-mendel-a7878f`), read but not merged. All runs were made under heavy CPU load from parallel sessions; the seeds don't depend on it.

**Evidence:**

- `node sim/sim.mjs`. Euchre at Standard: 40,000 hands, plus 40,000 more with each of two rule changes. Oh Hell and
  Whist at Standard: 20,000 hands for each preset. Spades at Kitchen: 20,000 hands each with exchange 0 and exchange 2.
- `--ladder --games 2000` for each game. Seeds don't depend on `--workers` (T2), so my Euchre rows reproduce W1's to the
  decimal.
- **A loss probe** (scratch, not committed). It sampled about 30% of the Standard decisions in 100 hands of each new game.
  Where Extreme chose differently, both cards were played out from the same 400 sampled deals with Standard's own policy.
  It kept the cases where the gap beat two standard errors and grouped them by Standard's reason code. The worst cases
  are now tests.
- **A fresh 200,000-deal measurement** of the ledger constants (`node sim/test_fair.mjs --measure 200000`). A fair-player
  simulation of the Fair deal screen: 400 players × 300 hands and 200 × 1,000.
- pagat.com's Euchre, Oh Hell and Whist pages for the rules.
- **`sim/test_ai_review2.mjs`:** 11 scenarios, all of which FAIL today on purpose. It is not in `npm run check` or CI.
  Run `node sim/test_ai_review2.mjs`.

## Verdict

Passover 1 did its job. All seven of the first review's bot positions now play correctly at every level. Every W1 rule
change is in the engine with a test. The ledger's constants match a fresh measurement to within 0.07 points, and the
sim ships **0 sins** at Standard in all five games. On rules and bots, the work left is a short list.

The fair-deal **proof** is where a launch-day thread would start. As built, the cut can't do what the website says:

1. **On a 52-card deck, every cut deals the same four hands, only rotated round the table.** Cards are dealt one at a
   time, and 52 is a multiple of 4, so rotating the deck by the cut only moves each hand to another seat. 52 cuts give 4
   different hands for you, never more (test F1). The app still picks the seed, so it picks all four hands. The cut only
   decides which of them you get, and a player who always taps the middle of the deck always gets the same one. The
   claim "the app can't pick a seed to suit it" holds only in a narrow technical sense. A skeptic with the source will
   show this in one reply.
2. **Three of the five games have no cut at all.** Euchre, Oh Hell and Whist (all paid) ignore it, and #18 rightly
   doesn't offer it there.
3. **The fingerprint is 32 bits,** small enough that "fixed before the cut" can be faked offline.
4. **On a perfectly fair deck, two players in three see a bar outside its "fair" band** on the Fair deal screen, because
   it shows about 25 bands at 95% each. That screenshot will be posted as proof of rigging.

All four have small fixes: the cut mixed into the shuffle by SHA-256, one parameter per engine, 16 characters of
fingerprint, and wider bands.

Three findings would be noticed by a first-time player:

- **The first dealer is always seat 3, an opponent.** In Whist the dealer's side takes 6.84 tricks a hand to the other
  side's 6.16, so on the Kitchen preset the player's side wins 46.7% of games against equal bots.
- **Kitchen's blind nil ships without its exchange.** Blind nils succeed 30% of the time without it and 73% with it.
- **Standard Whist ducks with the boss card in third hand.**

Three findings would be noticed by a strong player: the Euchre partner never goes alone (E07 forbids it), Standard
trumps in with the right bower, and the Oh Hell bot at its bid keeps the trump that later busts it.

**Ladder.** Euchre, Oh Hell and Spades meet every target. Whist Extreme vs Expert misses (53.6% against 55%). Hearts: HEARTS_VERDICT

## 1. Passover 1, item by item

Evidence is from the merged tree unless the row says otherwise. "#18" means the item is done only in W3's open PR.

| Item | Status | Evidence |
|---|---|---|
| R1 broken nil (P1) | **Fixed** | Standard/Tournament `nilTricksCount` off; the nil's tricks print as a `nilBags` line and count as bags (`spades.js score()`); `test_sim` set nil + set 5 = -150 |
| R2 blind nil face down (P1) | **Fixed in #18** | `faceDown()` / "Look at my cards" / "Bid blind nil" (#18 main.js 283-285, 531-534); main still shows the hand face up |
| R3 blind nil exchange (P1) | **Engine fixed, not shipped** | `exchange` phase, bots and tests are in. But `blindSwap` is 0 in every preset, and #18's generator.json predates W1, so nothing sets it back to 2. Kitchen blind nil: **30.2%** made (467 bids, 20K hands) against **72.6%** with `--custom blindSwap=2`. Acceptance (≥ 45%) is not met as shipped. See R2-1. |
| R4 10 for 200 (P1) | **Fixed** | flat ±200 for team bids of 10+ (`big`), scoring table |
| R5-R8, R10 (P2) | **Fixed** | Boston off / took 13 / bid 13; Lose at (Kitchen -200); explanations follow toggles; Hearts Tournament = moon auto + only hearts break; 2♣ leads; "Omnibus" in the J♦ name |
| R9 Custom from the preset (P2) | **Fixed in #18** | #18 main.js 1032 copies the preset's values into `customBy[game]` |
| AI-H1, AI-S1, AI-H5 (P1) | **Fixed** | the first review's `test_ai_review.mjs`, run on the merged tree: 7 of 7 scenarios pass at every level |
| AI-H3, AI-H4 J♦ (P1) | **Fixed** | same run: Std 4♦ under the K♦; A♦ takes the free J♦ (`take_jack_diamonds`) |
| AI-S2 (P2) | **Fixed** | same run |
| AI-L2, AI-H2 game end (P1) | **Fixed for Spades and Hearts only** | `outcome()` has ±`GAME_END`; H2 plays J♣/Q♥, not Q♠. Oh Hell, Whist and Euchre card play still value one hand at a time (AI-G1). |
| AI-L1 look-ahead bidding (P1) | **Fixed** | `expertBid` (Expert and Extreme), `extremePass`; ladder below |
| AI-L3-L5 (P2) | **Fixed** | nil by look-ahead up to `lookNilRisk` 0.45; moon band 1-7% for Expert+ in AI_SPEC; blind nil only when the opponents are a hand from winning and 200+ ahead |
| T1 real-deal scenarios (P1) | **Fixed** | `test_ai.mjs`: "34 look-ahead decisions, every one sampled real worlds"; `test_ai_review.mjs` deleted |
| T2, T3 (P2) | **Fixed** | 500-hand chunks seeded `seed*100003+k`; plain-rule columns in the report |
| F1 copy (P0) | **Fixed in #18, still live on main** | main.js 837 still says "Nobody, including us, can steer a deal"; #18 replaces it. Ship #18 before any build goes out. |
| F1 the cut (P1) | **Built, but proves less than it says** | `fingerprint()`, `dealOut(…, cut)`, verify.html checks the fingerprint; Spades/Hearts deal by the cut (W1). See F2-1 to F2-3. |
| F2, F3 ledger constants (P0/P1) | **Fixed** | fresh 200K-deal measurement: largest gap 0.07 (plain nil 4.55 vs 4.60); bots' rule nil 1.12% / 0.20% as the first review measured; no `Math.random` in ledger.js |
| F4 ahead/behind chart (P1) | **Fixed** | `standing` section; #18 records `standing(0)` for every deal |
| F5, F6, F7 (P2) | **Fixed** | shapes per deck plus "Other shapes"; 95% bands; hidden under 200 hands with the reason; `site/cards.js` identity test |

**Not done from passover 1:** R3 as shipped (R2-1), and AI-L2 for the three new games (AI-G1). Everything else is
fixed on the merged tree or in #18.

## 2. Findings

Severity: **P0** = fix before launch (trust or correctness on screen); **P1** = fix before launch if at all possible
(will be posted about); **P2** = next update. Each finding gives the rule or position, the problem, why it matters for
this audience, the fix and the evidence.

### The fair deal (F)

**F2-1 · P0 · The cut only rotates the same four hands (Spades, Hearts, and Whist once wired).**
- *Rule.* `dealOut` rotates the seeded order by the cut, then deals one card at a time from the dealer's left. With 52
  cards, a card at position *k* lands on seat *(k − cut) mod 4* + const. Every cut deals the **same four hands**, and
  only *cut mod 4* decides who gets which.
- *Problem.* The app picks the seed, so it still picks the four hands. The player's tap chooses one of four seatings.
  People tap the same spot, so even that is predictable. If the app closes the dialog without a tap, it picks the cut
  itself (`performance.now()`).
- *Why it matters.* "Before the deal the app shows the seed's fingerprint; then you cut the deck … the app can't pick a
  seed to suit it" (verify.html) reads as "the app can't choose your cards". Anyone who reads `dealOut` can show it is
  only half true, and a half-true fairness claim does more harm than no claim. A real-table cut has exactly this
  property, by the way: it stops a dealer from planting one card, not from stacking all four hands.
- *Fix.* Mix the cut into the shuffle: deal from `seed' = first 16 bytes of SHA-256(seed bytes ‖ cut byte)`, the same in
  `cards.js`, `site/cards.js` and verify.html. Then each of the 51 cuts gives an unrelated deal that the app couldn't
  have known when it committed. Change verify.html's "How the shuffle works" to "your cut is mixed into the shuffle".
  Don't promise more than this (see F2-6): the open source is the real guarantee.
- *Evidence.* Test **F1**: 52 cuts give 4 distinct seat-0 hands and 1 set of four hands.

**F2-2 · P1 · Euchre, Oh Hell and Whist ignore the cut.**
- *Rule.* `euchre.newHand` calls `deal(seed, 24)`, `ohhell.newHand` calls `deal(seed, 52)`, and `whist.newHand` calls
  `dealHands` without a cut. W2's hand-over says these engines "have no owner".
- *Problem.* #18 detects this (`cutsDeal()`) and skips the cut ritual, so these three games have only the seed.
- *Why it matters.* These are the three paid games, and the Fair deal page and the App Store copy describe one ritual.
  Euchre players were the ones asking for "a shuffle audit" (first review, F1).
- *Fix.* Each `newHand` takes a trailing `cut = 0`. Euchre: `dealOut(seed, dealer, DECK, 5, cut)`, rest = kitty. Oh Hell:
  `dealOut(seed, dealer, newDeck(), size, cut)`, rest[0] = trump card. Whist: `dealHands(seed, dealer, newDeck(), cut)`.
  `test_fair` already proves cut 0 is byte-identical. Euchre (24 cards, 20 dealt) and short Oh Hell hands get distinct
  deals per cut even before F2-1. Whist needs F2-1.
- *Evidence.* Test **F2**.

**F2-3 · P1 · A 32-bit fingerprint is not a commitment.**
- *Problem.* The fingerprint is 8 hex characters. Finding a seed with a chosen fingerprint takes about 2³² SHA-256 runs,
  which is seconds on a GPU. A dishonest server could prepare dozens of seeds for one fingerprint and choose among them
  after the cut.
- *Why it matters.* The page says the fingerprint proves "the seed is fixed before anyone knows the cut".
- *Fix.* Show 16 characters (64 bits) in four groups (`A1B2 C3D4 E5F6 7788`), and print the full 64 on the score sheet
  and verify.html. Every fingerprint field and regex (`/^[0-9A-F]{8}$/`) changes with it.
- *Evidence.* Test **F3**.

**F2-4 · P1 · The Fair deal screen shows "unfair" bars on a fair deck.**
- *Problem.* Each row has its own 95% band, and a Spades + Hearts player sees about 23-26 rows. Dealing with
  `dealer.js` itself:
  - 400 fair players × 300 hands: **62-66%** see at least one bar outside its band.
  - 200 fair players × 1,000 hands: **69%** do.
  - At z = 3 (99.7% bands), 7.5% do.
- *Why it matters.* The screen exists to answer "rigged". Most honest players will find a bar that looks like proof,
  and the screen says "the shaded band is where a fair deck lands 95% of the time".
- *Fix.* Either widen the bands to z = 3 (`share()`: 196 → 300; `average()`: 1.96 → 3) and call them "where a fair deck
  almost always lands", or keep 95% and add one line: "With this many bars, one in twenty lands outside its band by
  chance." Both fixes are one line; I'd do both.
- *Evidence.* Test **F4** (150 players × 300 hands: 63% today; it needs < 1 in 7).

**F2-5 · P1 · The first dealer is always an opponent.**
- *Rule.* `G = { …, dealer: 3 }` in #18 (and main). Seat 3 deals hand 1 of every game.
- *Problem.* Dealing is an edge in two of the team games:
  - **Whist:** the dealer's side takes **6.84** tricks a hand to the other side's **6.16** (20,000 Standard hands). The
    dealer also holds a known trump.
  - **Euchre:** the dealing team nets **+0.37** points a hand (20,000 hands).

  Games are short (Kitchen Whist ≈ 2.3 hands), so the first deal decides a lot. With equal bots, the first dealer's
  side wins **53.3%** of Kitchen Whist games (8,834 games), 51.4% of Standard Whist and 52.3% of Euchre (3,088 games).
  In the app that side is always the opponents.
- *Why it matters.* "The computer always deals first and always wins" is a natural rigging thread. It is also true, by
  2-3 points.
- *Fix.* Draw the first dealer from the game's first seed (or show a draw for deal), and print it on the score sheet.
  `sim.mjs --check` for Whist should also run on Kitchen: its "0.15 more tricks" check reads 0.20 there and would fail.
- *Evidence.* sim (Whist Kitchen and Standard, Euchre Standard); a dealer-advantage probe (scratch). At Expert, the dealer's side takes 6.97 tricks (1,500 hands), so this is not a Standard-bot artifact.

**F2-7 · P1 · The store listing (PR #21) promises a cut on every hand.**
- *Problem.* The listing says "Every hand is shuffled from a random seed and nothing else … then you cut the deck
  yourself … our website re-deals any hand from it." So does site/index.html. Today that is true for Spades and Hearts
  only (F2-2). "Nothing else" also contradicts the cut, and re-dealing a hand takes the cut as well as the seed.
- *Why it matters.* An App Store claim a Euchre player can disprove in their first hand is the worst place for an
  overstatement. App Review may also hold a listing to its literal words.
- *Fix.* Land F2-1/F2-2 before submission, or soften the copy to "Spades and Hearts" for now. Either way, say
  "from a random seed and your cut" and "re-deals any hand from its seed and cut".
- *Evidence.* `docs/store/listing.en-US.json` and `site/index.html` on `claude/jolly-wiles-6ef32d`.

**F2-6 · P2 · Smaller copy and test issues.**
- (a) The #18 seed dialog says "every hand comes from this seed and nothing else", but the deal also takes the cut.
  Say "from this seed and your cut".
- (b) A cut chosen by the app (the dialog closed without a tap) should print as "cut by the app".
- (c) The ledger's "bots' rule" nil row uses Standard's threshold (0.22), but Expert/Extreme now bid nil by look-ahead
  up to 0.45. Label it "Standard bots' rule".
- (d) `test_fair`'s constants check allows 0.2 points absolute, which is 100% of the 0.20% Jokers nil rate. Make it 4
  standard errors of the 50K-deal measurement.
- (e) Network and family tables never cut (`!net`). Say so on the page.
- (f) Only the open source shows the app runs this code. The FAQ should say that plainly. It is the actual guarantee.

### Rules and presets (R)

**R2-1 · P1 · Kitchen blind nil ships without the exchange.**
- *Rule.* The `blindSwap` preset is 0 everywhere (lead's note), so W3 could draw the panel first. #18 draws the panel
  (main.js 553-579) but its generator.json predates W1, so nothing sets it back.
- *Problem.* Kitchen enables blind nil for 200, and without the exchange the bots make it **30.2%** of the time, about
  -80 points a try. With 2 cards it is **72.6%**.
- *Why it matters.* Pagat's basic blind nil has the exchange, and the first review rated its absence P1.
- *Fix.* When #16 and #18 are both in, set `rules.spades` `blindSwap` presets to `{ standard: 2, kitchen: 2,
  tournament: 2 }` (the lead's own plan). It is one line in generator.json.
- *Evidence.* sim, Kitchen, 20K hands each; test **R1**.

**R2-2 · P2 · Euchre: who leads against a loner is a house rule, so say which one this is.**
- *Rule.* pagat: "If one player is playing alone, the person to that player's left leads first." Many American printed
  rules keep the player left of the dealer on lead (skipping a sitting-out partner). The app does the first only in
  Tournament (`lonerLeft`); Standard and Kitchen do the second.
- *Why it matters.* Both are played, and players will argue about it the first time a bot goes alone (once AI-E2 lets
  it).
- *Fix.* Keep the defaults, but show the choice on the setup summary line and in How to play ("Against a loner: left
  of the dealer leads").
- *Evidence.* pagat; printed US rule sheets disagree. The sim shows the choice barely moves loner success (75.8% vs
  76.2%, 40K hands each).

**R2-3 · P1 (copy) · "Whist" means Bid Whist to most American buyers.**
- *Rule.* The app's Whist is classic partnership whist (English Short Whist to 5 with honours; American to 7), with no
  bidding, as on pagat's Whist page.
- *Why it matters.* In the US, Bid Whist (books, uptown/downtown, kitty, jokers) is by far the most-played "Whist", with
  big family and community followings. A buyer who unlocks the $6.99 pack for "Whist" and finds no bidding will leave
  the review that hurts most: "this isn't Whist".
- *Fix.* Call it **Classic Whist** in the tuck box, store copy and How to play. PR #21's subtitle "Euchre, Whist, Oh
  Hell. No ads" is already at 30 characters, so put "classic whist" in the keywords and the description's first line. Say "no bidding: the trump card is
  turned" in the first line. Put Bid Whist at the top of the "Coming to the table" shelf.
- *Evidence.* pagat; the market (not measured here).

**R2-4 · P2 · Oh Hell names and the hook metric.**
- (a) The game is searched for as Up and Down the River, Oh Pshaw, Blackout, Nomination/Contract Whist and Bust (pagat
  lists all of them). Add these as App Store keywords and How to play "also called".
- (b) `sim.mjs`'s "Hands where the hook barred a bid" reports 95.8%. It counts hands where the hook number was between
  0 and the hand size, not hands where the dealer wanted that bid. Rename it or measure the real thing.

**R2-5 · P2 · Euchre house rules people will ask for.**
- Stick the dealer is off in Standard. Pagat calls it a variant, but it is the common Midwest default; 8.3% of hands
  are thrown in today. Keep it, but name it on the setup summary line.
- "No ace, no face, no trump" redeals, and Euchre with the Benny (joker), belong on the v1.1 list.

**R2-6 · P2 · Short Whist honours are mostly luck.** One side holds 3+ honours on **61.3%** of hands (Kitchen sim,
matching the arithmetic), and with a 5-point game honours often decide it. That is the traditional rule and fine for a
"Kitchen" preset, but How to play should say it. Rubbers (best of three, with game points) aren't implemented. Mention
that, or add them in v1.1.

Checked and right: Euchre deals, bowers, the turned-down suit barred in round two, dealer pickup/discard, the
loner's partner sitting out (the dealer doesn't pick up for their own partner's loner), Canadian loner, defend alone
(4), scoring 1 / 2 / 4 / 2 and the game to 10. Oh Hell: bid order, the hook bars exactly one number for the dealer only,
no trump when all 52 are dealt, the three scoring systems, a tie for first plays on at the largest size (pagat's rule).
Whist: the dealer's last card is trump and public, left of the dealer leads, tricks over six, tricks before honours,
and no honours at 4 in Short Whist.

### Bots (AI)

Positions are in `sim/test_ai_review2.mjs`. Each is a real position from Standard self-play, rotated so the bot is seat
0. The gap is the better card's advantage over Standard's, averaged over 400 sampled deals (± one standard error). In
all five positions **Expert and Extreme already play the right card**. These are errors of Standard, the default
partner, so every new player meets them.

**AI-E1 · P1 · Euchre: trumps in with the right bower when the 9 does the job.**
- *Position.* Defending, clubs trump. Partner led the 10♥, the dealer covered with the A♥, and I'm void with
  **J♣ 10♦ Q♦ 9♣**. **Std: J♣** (`win_with_boss`). Expert/Extreme: 9♣.
- *Problem.* `win_with_boss` picks the lowest *boss* winner. The 9♣ wins too unless the last player overtrumps, and the
  right bower is a sure trick later either way.
- *Why it matters.* "Wasted the right bower" is the Euchre complaint, and the loss probe's single biggest
  Standard-level leak: 10 significant cases in 100 hands.
- *Fix.* When ruffing (void in the suit led), play the lowest trump that wins unless a player still to come is likely
  to overtrump it with a trump below my boss. Keep the boss as a sure trick.
- *Evidence.* +0.83 ± 0.07 points a hand; test **AI-E1**.

**AI-E2 · P1 · Euchre: never goes alone on a classic loner (sin E07 forbids it).**
- *Position.* Round two, the 9♦ turned down. I hold **J♠ A♠ K♠ Q♠ A♥**. Every level calls spades with partner.
- *Problem.* AI_SPEC E07 allows alone "only with ≥ 4 sure tricks", counted as the unbroken run from the right bower. So
  a hand missing the left bower can never go alone, and even Extreme's look-ahead can't try it, because the option is
  filtered as a sin. Over 20,000 random deals of this hand:
  - **Alone: +3.31** points a hand; **with partner: +1.77**.
  - J♠ J♣ K♠ Q♠ K♥: alone +2.18, with partner +1.40.

  The sim agrees: **2.2 loners per 100 hands with 75.8% marches**. A threshold that loses only a quarter of its loners
  is far too tight, since a loner pays when it marches about half the time.
- *Why it matters.* "My partner never goes alone" is a Euchre player's first impression of a timid bot.
- *Fix.* Redefine E07 as reckless only: alone with fewer than 3 sure tricks, or without the right bower. Standard goes
  alone on the right bower plus two more top trumps plus an off ace (or 4 trumps with the right). Let Extreme's
  look-ahead choose freely above that. The sim target becomes loner success 55-75% and 4+ loners per 100 hands.
- *Evidence.* scratch probe (20K deals each); sim; test **AI-E2** (it fails on `sins()` first).

**AI-O1 · P1 · Oh Hell: at its bid, throws a side king and keeps the trump that will bust it.**
- *Position 1.* Seven cards, diamonds trump, I'm exactly on my bid (2 of 2). The trick is 8♥, K♦ and I'm void in
  hearts, holding **K♠ 8♠ 8♦**. **Std: K♠** (`discard_danger`). Expert/Extreme: 8♦.
- *Position 2.* Hearts trump, on my bid. The trick is 2♣, 9♥, and I'm void in clubs with **6♥ 2♥ 7♦**. **Std: 7♦.**
  Expert/Extreme: a heart.
- *Problem.* `discard_danger` throws the highest-ranked loser by pip value and ignores that a small trump is the card
  most likely to win a trick later. When a higher trump is already on the trick, it is the one card that can be dumped
  safely now.
- *Why it matters.* In Oh Hell, busting your bid on the last trick with a forgotten trump is *the* mistake players
  remember. This was the costliest pattern in the Oh Hell probe.
- *Fix.* In `discard_danger`, rank trumps above side cards when they lose this trick (a trump under a higher trump).
  Then take the highest side card in a suit where I'm short and the suit is still live.
- *Evidence.* +7.6 ± 0.4 and +4.7 ± 0.3 points (the probe's own scale: my points against the other three's average);
  tests **AI-O1**, **AI-O2**.

**AI-W1 · P1 · Whist: third hand ducks with the boss card.**
- *Position.* Spades trump. Partner leads the 4♥ and the next player discards. I hold **Q♥ 9♥ 7♥ 5♥** (A♥ and K♥ are
  gone, so Q♥ is boss). **Std: 5♥** (`duck_partner_winning`). Expert/Extreme: Q♥.
- *Problem.* In `play()`, when partner is "winning", `!losers.length` sends the bot down the duck branch whenever every
  legal card beats partner's. It then plays the lowest card, which any heart the last player holds will beat.
- *Why it matters.* "Third hand high" is the first thing a Whist player learns, and partner's 4 is not a winner.
- *Fix.* Treat partner's card as winning only if it is boss, or I'm last, or the last player is known to be void without
  trump. Otherwise play as if an opponent were winning (third hand high, win with the lowest boss).
- *Evidence.* +1.5 ± 0.06 tricks; test **AI-W1**.

**AI-W2 · P1 · Whist: lets partner's beatable card ride instead of ruffing.**
- *Position.* Diamonds trump. Partner leads the 9♣ and the dealer discards. I'm void in clubs with **6♦ 8♠ 6♠ J♠ 9♥**;
  10♣, J♣ and 8♣ are unseen, and the last player may hold one. **Std: 6♠** (a discard). Expert/Extreme: 6♦.
- *Problem.* The same branch only considers overtaking with a boss card of the suit led, never ruffing.
- *Fix.* The same fix as AI-W1: when partner's card isn't safe and I can ruff, ruff low.
- *Evidence.* +1.7 ± 0.06 tricks; test **AI-W2**. The Whist probe's top three losses all come from this branch:
  `duck_partner_winning` appears in 40 of 203 sampled decisions, `ruff` in 28 of 124, and some opening leads are
  too passive (`lead_long_suit` 66 of 156).

**AI-G1 · P2 · Oh Hell, Whist and Euchre card play don't know the game score.**
- *Problem.* AI-L2's game-end term reached Spades and Hearts only. Oh Hell's `outcome` is this hand's points against the
  others' average. Whist's is the trick difference (the PR #15 author tried game points and saw no gain). Euchre's
  `expertPlay` is the score difference with no game end; only Extreme's call has ±10.
- *Example.* On the last hand of an Oh Hell game, overtaking a rival who needs exactly this trick can be the only
  winning play. The O01 guard forbids it whenever I'm on my own bid.
- *Fix.* Add the game-end term to the three `outcome()`s. Let O01 stand aside when taking the trick decides the game.

**AI-G2 · P2 · Whist bots ignore honours (Kitchen).** `outcome` counts tricks, never honours, and nothing in play
protects a 3-honour holding. It is minor, since honours are fixed by the deal.

The sim is clean: **0 sins shipped** at Standard in 40K Euchre hands and in 20K hands of every Oh Hell and Whist
preset, with 0 raw sins caught by the guard. Oh Hell Standard bids exactly 57.5% / 60.4% / 53.3% of the time
(Standard / Kitchen / Tournament; the target is ≥ 50%), with an average miss of 0.44-0.55. Euchre Standard: makers
euchred 11.0% (the target is ≤ 20%), marches 22.5%, 0.94 points per call, and 8.3% of hands thrown in. That makes the
bots sound but conservative callers. Human tables run closer to 15-20% euchred.

## 3. The ladder

`node sim/sim.mjs --ladder --game <g> --games 2000` on the merged tree (W1 + #15), sides swapped. Targets (lead's
note): team games Extreme vs Expert ≥ 55%, other steps ≥ 58%; Hearts and Oh Hell (one strong seat against three, even
25%) Extreme vs Expert ≥ 28%, other steps ≥ 30%. At 2,000 games one standard error is about 1.1 points (team) or 1.0
(individual), so a row within 2 points of its target isn't settled either way.

| Game | Match-up | Games | Stronger side won | Target | |
|---|---|---|---|---|---|
| Euchre | Extreme vs Expert | 2000 | 63.8% | ≥ 55% | pass |
| Euchre | Expert vs Standard | 2000 | 58.6% | ≥ 58% | pass, by 0.6 (within noise) |
| Euchre | Standard vs Easy | 2000 | 58.5% | ≥ 58% | pass, by 0.5 (within noise) |
| Whist | Extreme vs Expert | 2000 | **53.6%** | ≥ 55% | **miss** (#15 measured 55.5% on other seeds; pooled about 54.5%) |
| Whist | Expert vs Standard | 2000 | 70.6% | ≥ 58% | pass |
| Whist | Standard vs Easy | 2000 | 69.0% | ≥ 58% | pass |
| Oh Hell | one Extreme vs three Expert | 2000 | 42.5% | ≥ 28% | pass |
| Oh Hell | Expert vs Standard | 2000 | 37.1% | ≥ 30% | pass |
| Oh Hell | Standard vs Easy | 2000 | 39.0% | ≥ 30% | pass |
| Spades | Extreme vs Expert | 2000 | 66.2% | ≥ 55% | pass (W1's run, same seeds and Spades code; not re-run) |
| Spades | Expert vs Standard | 2000 | 84.9% | ≥ 58% | pass (W1) |
| Spades | Standard vs Easy | 2000 | 73.4% | ≥ 58% | pass (W1) |
HEARTS_ROWS

**Whist Extreme vs Expert is the one miss (P1, AI-L-W).** Extreme's edge is its sample count (60 per card, plus 200
on the best two), and #15's author found more samples didn't help. Fixing AI-W1/AI-W2 in the shared `play()` policy
changes both levels' rollouts, so re-measure after those fixes before tuning Extreme further. A cheap next lever is
Extreme reading the opening leads (a side that opened a suit holds length in it), the way Oh Hell Extreme reads bids.
**The Euchre middle steps pass by less than one standard error.** They'll pass or fail with the seed, so treat them as
met but thin.

## 4. The 10 changes I'd make first

1. **Mix the cut into the shuffle** (F2-1) and **wire it into Euchre, Oh Hell and Whist** (F2-2): SHA-256(seed ‖ cut)
   in `cards.js`, `site/cards.js` and verify.html, plus a trailing `cut` in three `newHand`s. Then the verify page's
   claim is true.
2. **Store copy (#21) promises only what's true on submission day** (F2-7). Also a **16-character fingerprint**
   (F2-3) and **z = 3 bands, or the "one in twenty" line** (F2-4): one line each in dealer.js and ledger.js, plus the
   copy.
3. **Merge #18 before any build leaves the building**: main still says "Nobody, including us, can steer a deal".
4. **First dealer from the seed** (F2-5), printed on the score sheet. Run the Whist sim check on Kitchen too.
5. **`blindSwap` back to 2 in every preset** once #16 and #18 are both in (R2-1).
6. **Whist `duck_partner_winning`**: partner's card is safe only when it's boss, I'm last, or the last player can't beat
   it. Otherwise third hand high, or ruff low (AI-W1, AI-W2). Then re-run the Whist Extreme vs Expert ladder, the one
   missed target.
7. **Euchre loners**: redefine E07 so a classic loner is allowed, and lower Standard's bar (AI-E2). Name the
   lead-against-a-loner rule on the setup line (R2-2).
8. **Euchre: ruff with the lowest winning trump, keep the bower** (AI-E1).
9. **Oh Hell `discard_danger` dumps a losing trump first** (AI-O1).
10. **Call it "Classic Whist"** in the box, the store and How to play, with Bid Whist first on the "Coming to the
    table" shelf (R2-3).

## How to re-check

```
node sim/test_ai_review2.mjs                    # 11 scenarios, all FAIL today; each fix flips one to ok
node sim/sim.mjs --game spades --preset kitchen --hands 20000            # blind nil made %, after R2-1
node sim/sim.mjs --game whist --preset kitchen --hands 20000 --check      # team balance, after F2-5
node sim/sim.mjs --game euchre --hands 40000   # loners per 100 hands and loner success, after AI-E2
node sim/sim.mjs --ladder --game <g> --games 2000
```
