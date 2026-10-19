# Review: rules, bots and the fair deal

*2026-10-19. Game-design review, read-only on app code.* Written the way r/spades, r/hearts and r/euchre will read
Kitchen Table on launch day. Inputs: `docs/AI_SPEC.md`, `docs/PLAYER_RESEARCH.md`, `docs/DESIGN.md` §7-8,
`sim/generator.json`, `proto/{spades,hearts,ai,dealer,cards,main}.js`, `site/verify.html`, the sim and both test files,
pagat.com's Spades and Hearts pages (basic rules and listed variants). Evidence comes from:

- `node sim/sim.mjs` at 20,000 hands (Easy, Standard; Standard on the Kitchen preset) and 2,000 hands (Expert), 8 workers;
- a small level ladder (`--ladder --games 120`);
- a probe that scored ~3,000 sampled Standard decisions against a 60-deal public-information look-ahead and grouped the
  big misses by reason code (scratch script, not committed; the real positions it pointed at are now tests);
- **`sim/test_ai_review.mjs`**: 7 new scenarios on real, consistent deals. All 7 fail today, on purpose. It is not in
  `npm run check` or CI. Run `node sim/test_ai_review.mjs`.

## Verdict

The engine is solid. Legal play, follow-suit, first-trick and broken-suit rules, the score sheet's line items and the
shuffle are all correct as written. I found no way for a bot to see a hidden card (§4). The project's own sin list is
clean in the sim: 0 sins at Easy and Standard over 20K hands of each game. The one flag the sim did raise was a
false positive in the detector (AI-H5).

What will get posted on launch day is narrower than that, and fixable before launch:

1. **Spades "Standard" scores a broken nil the house-rule way.** The nil bidder's tricks count toward the partner's
   bid. That is the exact behaviour a one-star reviewer called wrong ("-50 instead of -150"), and it is not pagat's
   basic rule (R1).
2. **Blind nil isn't blind.** The hand is dealt face up and the button says "(before looking)". There is also no
   two-card exchange (R2, R3).
3. **"10 for 200" is all reward and no risk.** Bidding 10+ doubles the score if you make it, but a failed 10 costs only
   -100 (R4).
4. **The fair-deal ledger contradicts itself for Jokers players.** Its "fair" line for nil-able hands is 5× too high
   for the Kitchen deck, and it is computed with a biased `sort(random)` shuffle. One screenshot of that bar on
   r/spades reads as "rigged" (F2, F3).
5. **"Nobody, including us, can steer a deal" can't be proven as built.** The seed proves the deal follows from the
   seed, but not that the app didn't pick the seed. A skeptic on r/euchre will say so in the first reply (F1).
6. **Standard, the default level for every new player, makes six repeatable bad plays** that the look-ahead levels
   don't make. It feeds the Q♠ to a moon runner. It throws the J♦ away and won't take it when it's free. It keeps a
   bare K♠ on its own nil. It ends a Hearts game it is losing (AI-S1 to AI-H4).
7. **Expert and Extreme are honest but narrow.** They bid exactly like Standard, pass exactly like Standard, and value
   one hand at a time, so no level reads the scoreboard (AI-L1, AI-L2).
8. **The Expert/Extreme scenario tests mostly test Standard.** 18 of the 19 play-phase positions in
   `sim/test_ai.mjs` have hidden-card counts that don't add up, so the look-ahead can't sample them and falls back to the
   heuristic (T1).

None of this needs a new system. Nearly every fix is a default flip, a guard clause, or one more input to an existing
function.

## Findings

Severity: **P0** = fix before launch (trust or correctness on screen); **P1** = fix before launch if at all possible
(will be posted about); **P2** = next update.

### Rules and presets (R)

| ID | Sev | Finding | Evidence | Recommended change | Test |
|---|---|---|---|---|---|
| R1 | P1 | **Broken-nil tricks count toward the partner's bid in Standard.** `nilTricksCount` is on in Standard and Kitchen, so a set nil plus a set partner can score -50 where most players expect -150. With the rule off (Tournament), those tricks vanish completely: not counted toward the bid and **not bags either**. No common ruleset does that. | pagat basic rule: the nil bidder's tricks don't count toward the partner's bid, but they do count as bags for the side. PLAYER_RESEARCH quotes the one-star "Set a nil and a 5 bid … -50 instead of -150". `sim/test_sim.mjs` asserts the -50 as correct for Standard. `spades.js score()`: `if (r.nilTricksCount) T += st.tricks[s]`, with no else branch. | Standard and Tournament: **off**. Kitchen: on. When off, the nil bidder's tricks still add to the team's bags (`over += st.tricks[s]`) and print as their own line, "Nil tricks: 2 bags". New explain text: "Tricks a broken nil takes don't count toward the partner's bid; they count as bags." Update the `test_sim` expectation to -150 for Standard. | rules (S20 table) |
| R2 | P1 | **Blind nil is offered with the cards face up.** The button reads "Blind nil (before looking)", but `dealIn()` has already shown the hand. In pass-and-play and family tables, one human can look and then bid blind for 200. | `main.js` centre(): the bid pad renders the blind button next to the visible hand. Nothing hides the hand while blind nil is legal. Bots decide on the score alone (`spadesBid` "blind_nil_comeback"), so only humans can peek. | When blind nil is legal for a human seat, deal that hand face down and show two buttons: **Look at my cards** and **Bid blind nil**. The choice is locked before the faces turn over. VoiceOver says "Your cards are face down." | UI smoke |
| R3 | P1 | **No blind-nil card exchange.** In pagat's *basic* blind nil, the bidder passes two cards to the partner and gets two back. Without it, bots make blind nil only **25.5%** of the time (730 bids in 20K Kitchen hands), which works out to about -100 points per attempt. | sim: Kitchen, Standard level, 20K hands. | Add a rule "Blind nil exchange: 2 / 1 / 0 cards" (Kitchen 2). Bots pass their two lowest cards to the nil, and the nil passes back its two highest, spades first. Re-run the sim, aiming for 45%+. | sim |
| R4 | P1 | **10-for-200 pays double on any 10+ bid but fails like a normal bid.** Bid 10 and make it: +200. Fail: -100. Bid 13 and make it: +260. | `spades.js score()`: `base = 10 * B * (r.tenFor200 && B >= 10 ? 2 : 1)`. The set branch is always `-10 * B`. pagat: "200 for exactly 10 tricks and loses 200 otherwise" (some groups score it at 10 or more). | Make it **+200 / -200** for bids of 10 or more. Bags count as usual. Explain text: "Bid 10 or more as a team: make it for 200, miss it and lose 200." Add the -200 case to the scoring table. | rules |
| R5 | P2 | **"Boston" pays for taking 13, not for bidding 13.** A team that bid 6 and took all 13 gets +250 on top of 60 + 7 bags. Many tables only pay a Boston (or "Moon") when it was **bid**, at 200 / -200 (500 with 10-for-200). | `score()`: boston when `tricks === 13`. | Keep "took all 13", but say so in the explanation ("whatever you bid"). Add a choice, "Boston: off / took all 13 / bid 13 (500, -500)". | rules |
| R6 | P2 | **No way to lose except by being outscored.** Players ask for a floor: some tables end the game at -200, pagat lists -500 as a variant, and NYC rules lose on two sets in a row. A game can run past 40 hands now (the sim caps at 80). | `winner()` only checks the target. | Rule "Lose at" with choices off / -200 / -500 (Kitchen -200). | rules |
| R7 | P2 | **Hearts: the "hearts broken" text always says the Q♠ breaks hearts.** Q♠-breaks is its own toggle, and it is on in every preset. pagat's basic rule is that only a heart breaks hearts. | `generator.json` heartsBroken.explain: "(or the queen of spades)". | The explanation should follow the toggle. Keep Q♠-breaks on in Kitchen. In Standard and Tournament, either follow pagat's basic rule (only a heart breaks) or say plainly in the how-to that this is our choice. | — |
| R8 | P2 | **Hearts Tournament is identical to Standard,** so it is a preset that does nothing. | `generator.json`: every Hearts rule has the same standard and tournament values. | Either drop it for Hearts or make it meaningful: moon "add 26 unless that would make the shooter lose, then subtract" (a pagat variant), no Q♠ break, end at 100. | — |
| R9 | P2 | **Custom always starts from Standard.** DESIGN §8 says it starts from the last preset. A Kitchen family that wants "Kitchen but to 500" has to rebuild seven rules by hand. | `rulesFor(cfg, g, "custom", …)` falls back to `presets.standard`. The `rule` toggle flips against the standard value. | When Custom is picked, copy the current preset's values into `S.last.custom`. | — |
| R10 | P2 | **Variants people will ask for on day one.** Spades: 2♣ leads the first trick; NYC rules (bids 4-10, no nil); Whiz, Mirror and Suicide (common in the big Spades apps). Hearts: Omnibus with 10♦ instead of J♦; "shooting the sun" (all 13 tricks, 52); pass "scatter". | pagat variant lists; PLAYER_RESEARCH "Rules that aren't theirs". | Add 2♣ first lead and the -200 loss (R6) now, since both are one-liners. Put Mirror and Whiz on the v1.1 list next to Euchre. Name the J♦ rule "Omnibus (J♦ is -10)" so the people who know it by that name can find it. | — |

What's right and should stay: Spades target 500 / nil 100 / blind nil 200 when down 100 / bags 10 for -100 / first lead
left of the dealer (any non-spade) / spades must be broken. Jokers order BJ > LJ > 2♦ > 2♠ > A♠ with 2♣ 2♥ out. Team
minimum 4 with nil exempt. Hearts to 100 with lowest winning and ties playing on; pass left, right, across, hold; no
points on trick one, with hearts before the Q♠ when you only hold points; moon +26 to the others (shooter's choice in
Kitchen); the J♦ still counts -10 for a shooter who took it (pagat's Omnibus rule). Every Hearts scoring line I checked
by hand matches.

### Bots (AI)

Positions are from `sim/test_ai_review.mjs`. Each is a real deal: four 13-card hands, replayed through `apply()` with a
legality check. Seat 0 is the bot to move. "Std" means the Standard level, the default for partner and opponents
(`main.js` `S.last`).

| ID | Sev | Finding | Position and what each level plays | Recommended change |
|---|---|---|---|---|
| AI-H1 | P1 | **Feeds the Q♠ to a moon runner.** Seat 1 has taken all 9 hearts played so far and holds the other 4. It leads A♠. | Seat 0 holds Q♠ 5♠ 8♠ 9♠ 2♠ T♠ 8♦ 2♦ 7♦; trick A♠ 3♠ 4♠. **Easy/Std: Q♠** (`dump_queen_under`). Expert 5♠, Extreme 8♠. | `heartsPlay`: the `dump_queen_under` line needs the same guard `discard_queen` already has: `&& !(threat >= 0 && T.winSeat === threat)`. |
| AI-H2 | P1 | **Ends a game it is losing.** Scores 60 / 95 / 50 / 70. The bot (60) is void in diamonds and the 95 player is winning the trick. The Q♠ ends the game, and the 50 player wins. | Seat 0 holds Q♠ 5♥ 9♠ 5♣ 8♠ J♣ 6♣ Q♥ 3♥ 6♥ A♠ 4♥; trick A♦ 3♦ 4♦. **Std: Q♠, Extreme: Q♠.** Expert J♣. | Hearts play must read the score: if a card would push the trick winner to the end score while someone other than me is lowest, treat it as worth -50, otherwise prefer it. Also give `outcome()` an end-of-game term (AI-L2). |
| AI-H3 | P1 | **Throws the J♦ (-10) under someone else's winner** (Kitchen preset). | Seat 0 holds J♦ 4♦ …; trick K♦ 5♦ 6♦, last to play. **Std: J♦** (`duck_highest_under`). Expert and Extreme 4♦. | `heartsPlay` knows nothing about the J♦. When `rules.jackDiamonds`: never duck with the J♦ if another card of the suit ducks too, never discard it to another seat, and… |
| AI-H4 | P1 | **…won't take the J♦ when it's free.** | Seat 0 holds A♦ 3♦ …; trick 5♦ J♦ 7♦, last to play, no points in the trick. **Std: 3♦.** Expert and Extreme A♦. | …last to play on a trick with the J♦ and no points: win it with the lowest winner. Not last: win it when the winner is a boss. |
| AI-S1 | P1 | **Nil bidder keeps a bare K♠ when it could dump it for free.** Blind nil; an opponent has ruffed a heart with the A♠, and the bot is void in hearts. | Seat 0 holds K♠ 2♦ 3♦ 4♦ 6♦ 8♦ 9♦ 3♣ 4♣ 5♣ 6♣ 7♣ 9♣; trick 5♥ 7♥ A♠. **Easy/Std: 9♦** (`nil_discard_danger`). Expert and Extreme K♠. | Own nil, can't follow: rank the losing discards by danger, so a spade that can't win (it is under a higher spade already played) beats any side card, and a high card in a short suit beats a low one. That is what AI_SPEC S09 already says. Extend `checkSins` S09 to flag it. |
| AI-S2 | P2 | **"Set the nil" play that can't set anything.** The opponents' nil plays after the bot, but the nil's partner is already winning with the K♦. Playing low doesn't make the nil take anything; it gives away a trick the bot's side needs. | Seat 0 holds A♦ 3♦ …; bids 4 / nil / 4 / 3; trick K♦. **Std: 3♦** (`set_nil_play_low`). Expert and Extreme A♦. | `set_nil_play_low` should apply only when the card winning so far is low enough that the nil might be forced over it, meaning the nil's partner isn't winning the trick. If the nil's partner is winning, play to the bid. |
| AI-H5 | P2 | **The sin detector flags a forced play.** H06 fires when A♠ K♠ are the only cards left. The sim counts that as a shipped sin, so `sim.mjs --check` can fail on an unlucky seed. It happened once in 20,000 Standard hands with 8 workers. CI uses a different worker count, so it hasn't been hit yet. | `sins()`: H06 checks `legal.length > 1`, but both legal cards commit it. | Every sin check should require a clean alternative: `legal.some((x) => x !== action && !sinsRaw(v, x).length)`. Or make H06 require a non-A♠/K♠ legal card. |
| AI-L1 | P1 | **Level separation exists only in card play.** Bidding (`spadesBid`) and passing (`heartsPass`) never look at `level` beyond Easy's noise. Expert and Extreme bid and pass exactly like Standard: no reading of the partner's bid, the total bid, the score, or the opponents' closeness to 500, and no direction-aware pass. | Code. In the sim, Expert's self-play set rate is 11.6% against Standard's 6.7%, with the same bids (2K / 20K hands). | Expert and up: bid with the look-ahead (sample 24 deals, play each candidate bid out with the Standard policy, keep the best by expected points). Endgame: when the opponents will win on any made bid, bid to set them. Passing: score each 3-card pass by a short look-ahead at Extreme. |
| AI-L2 | P1 | **No level knows the game score in play.** `outcome()` scores one hand. Hearts doesn't know who is about to lose, and Spades doesn't know that 10 bags before the target is worth more than 100 points. | AI-H2 (Extreme plays the losing Q♠). `outcome()` in `ai.js`. | Add a game-end term to `outcome()`: if the new totals end the game, return ±1000 by win or loss. Hearts gets the same term in a small "score pressure" check for Standard. |
| AI-L3 | P2 | **Bots bid nil only on near-locks.** Nil success is 91% (Std) and 96% (Kitchen), with about one nil per 100 seat-hands. Strong players bid nil whenever it beats the 1-2 tricks they'd otherwise bid, around a 60-65% chance, so these bots look timid next to people. | sim | Raise `nilMaxRisk` at Expert and up to aim for about 75% success, and measure win rate rather than nil success. |
| AI-L4 | P2 | **Hearts Expert shoots the moon on 6.0% of hands,** outside the AI_SPEC 1-4% band. That's fine for a strong player, but the band is in the spec. | sim, Expert, 2K hands | Either widen the band for Expert and up, or measure stops at Expert vs Expert. |
| AI-L5 | P2 | **Blind nil as a bot tactic.** At 25.5% success (R3), the comeback rule costs about 100 points per attempt. | sim | Re-tune after R3. Bid blind nil only when the win chance without it is under ~10% (needs AI-L2's game term). |

Level ladder (`node sim/sim.mjs --ladder --games 120 --workers 8`, stronger side on both seat pairs):

LADDER_TABLE

Honesty: every bot input is `view()`. The look-ahead samples only from cards the seat can't see, constrained by public
voids and the cards that seat passed. Extreme's bid-reading uses public bids and skips blind bids. Nothing reads the
seed, the other hands, or which seat is human, and the existing view-key and seat-rotation tests hold. Easy feels human
in the right ways: it forgets after four tricks, slips to another card of the same suit, and bids ±1. It also inherits
every Standard bug above, which is fine for Easy and not for Standard.

### Tests and sim (T)

| ID | Sev | Finding | Recommended change |
|---|---|---|---|
| T1 | P1 | **18 of 19 play-phase scenarios in `sim/test_ai.mjs` can't be sampled.** The cards a bot can't see (42-47) don't add up to what the other seats hold (6-18), so `sampleWorld()` returns null every time. `expertPlay` then returns the Standard heuristic's card, which means "all four levels pass" really means "Standard passes, plus the sin guard". Only S14 is samplable. | Build scenarios from real deals, as `sim/test_ai_review.mjs` does with `table()`: four hands, plays replayed through `apply()` with a legality check, and an assert that the hidden-card count adds up. Port the S03-S18 and H01-H06 positions to it. Two lines in `test_ai.mjs` would also catch a regression: count how often `expertPlay` reached `samples > 0`, and fail if that is 0 for any Expert scenario. |
| T2 | P2 | `sim.mjs --check` fails the build on a single false-positive sin (AI-H5) and depends on the worker count (seeds are `seed*1000 + worker`). | After AI-H5, make the seeds independent of `--workers` (derive per-game seeds from a counter), so CI and a laptop play the same hands. |
| T3 | P2 | The sim's "Moon runs stopped" and "Nil bids vs nil-able hands" use the bots' own definitions, so they can't catch a bot that is wrong about what is nil-able. | Add the plain rule as a second column (≤ 2 spades, none above the 9, no side ace), as DESIGN §7 already defines it. |

### Fair deal (F)

The shuffle is right. `dealer.js` is a textbook Fisher-Yates with rejection sampling (no modulo bias) over xoshiro128**.
The four seed words go through a bijective SplitMix-style mix, so distinct seeds give distinct streams. It imports
nothing, the golden deal was cross-checked in Python, and `site/dealer.js` is byte-identical (tested). A skeptic still
has four fair objections:

| ID | Sev | Finding | Recommended change |
|---|---|---|---|
| F1 | P0 (copy) / P1 (fix) | **The seed proves determinism, not that the deal was unsteered.** The app picks the seed, so it could draw seeds until it likes a deal ("seed shopping"), and nothing on verify.html could tell. "Nobody, including us, can steer a deal" (`seedinfo`) is a promise, not a proof. r/euchre asked for "a shuffle audit … anything besides 'deals are fair, trust us'". | **Now (P0):** change the copy to what is provable: "Every hand comes from this seed and nothing else. Type it into our website to see the same four hands." **Next (P1): let the player cut**, the way the person to the dealer's right does at a real table. Before the deal, the table shows a short **fingerprint**: the first 8 characters of SHA-256 of the seed. The human taps the deck to cut (1-51). The deal is the seeded permutation rotated by the cut. The score sheet prints the seed, the cut and the fingerprint, and verify.html checks that SHA-256(seed) matches the fingerprint before it deals. The app commits before it knows the cut, so it cannot pick the deal. No server is needed, it is about 30 lines, and it adds a ritual players already know. |
| F2 | P0 | **The ledger's nil-able "fair" line is wrong for Jokers players.** It is always computed on the plain 52-card deck with Standard rules. For the Kitchen deck, the true rate is **0.20%** against the **1.12%** it shows, so a Jokers player's bar sits at about one fifth of "fair" forever. | Compute the expectation for the deck the player actually played (`j` is already stored per deal), or show the nil chart per deck. |
| F3 | P1 | **The "fair" baseline is computed with a biased shuffle.** `[...deck].sort(() => Math.random() - 0.5)` puts 2♠ in the first 13 cards **39.5%** of the time (fair: 25%) and A♠ 22.8%. It is also random, so the baseline moves each time the screen opens. A reader of the open source will quote this line. | Use the real dealer: `dealHands(newSeed(), …)` for a fixed 20,000 deals, or better, ship the constants (plain deck 1.12%, Jokers 0.20%, measured with `dealer.js` over 200,000 deals). |
| F4 | P1 | **The chart that answers "rigged" isn't there.** The complaints are "if you get too far ahead, the game will limit what cards you get" and "bots get better cards". DESIGN §7 promises "your team's high cards vs the opponents'", which isn't implemented. Seat-0 shapes alone can't answer a rubber-banding claim. | Record, per deal, your high-card count and the average of the other three, plus whether you were **ahead, level or behind** at the deal. Chart "your high cards when ahead / behind" against 4.0, with a ±2σ band at the current sample size. |
| F5 | P2 | The shape chart compares Jokers-deck hands (16 / 12 / 12 / 12 suits) with 52-card shape odds: 4-4-3-2 is 19.7% against the 21.6% shown, and 6-4-2-1 is 5.4% against 4.7%. Only the top 10 shapes are drawn (91%), so the bars never sum to 100. | Filter `j` like the spades chart does, and add an "other shapes 8.9%" bar. |
| F6 | P2 | "Small samples wobble" with a bare black line invites eyeballing. The nil chart has about 11 events per 1,000 deals. | Draw the expected **range** (95% band for n), not a line. Hide a chart until n ≥ 200, and say why. |
| F7 | P2 | verify.html re-implements deck building and the round-robin seat order. Only `dealer.js` is shared and tested, but the page says "using the same code as the app". | Serve `cards.js` alongside it (copy plus identity test, like `dealer.js`), or add a golden full-deal test that runs the page's own functions. Add a FAQ line: "128-bit seeds: 3.4×10³⁸ possible shuffles; not every one of the 8×10⁶⁷ orders is reachable, and no order is more likely than another." |

## The 10 changes I'd make first

1. **F1 copy + F2/F3 ledger math** (P0, one afternoon): say only what the seed proves, compute "fair" with the real
   dealer per deck, and ship the constants.
2. **R1 Standard nil scoring** to pagat's basic rule (tricks don't help the partner; they are bags), and fix the
   off-state so those tricks still count as bags. Flip the `test_sim` expectation.
3. **R2 Blind nil face down** with "Look at my cards" / "Bid blind nil".
4. **AI-H1, AI-S1, AI-H5 guards**: one guard clause each in `ai.js` (`dump_queen_under`, `nil_discard_danger`, the
   `sins()` forced-play check). Move AI-H1/AI-S1 into `test_ai.mjs`.
5. **AI-H3/AI-H4 J♦ awareness** in `heartsPlay` (Kitchen's Hearts preset turns the rule on by default; Standard bots
   ignore it).
6. **R4 10-for-200 = +200 / -200.**
7. **T1 real-deal scenarios**: port `test_ai.mjs` to the `table()` builder, so "every level" means every level.
8. **AI-L2 game-score term** in `outcome()` plus the Hearts end-of-game check (fixes AI-H2 at every level).
9. **F1 the cut**: fingerprint before the deal, the player cuts, and verify.html checks both. Then the fair-deal claim
   is something a stranger can check, not take on trust.
10. **R3 blind-nil exchange (2 cards) + AI-L1 Expert bidding by look-ahead**, then re-run the ladder and target
    Extreme > Expert by a clear margin.

## How to re-check

```
node sim/test_ai_review.mjs            # 7 scenarios, all FAIL today; each fix flips one to ok
node sim/sim.mjs --game spades --preset kitchen --hands 20000   # blind nil made %, after R3
node sim/sim.mjs --ladder --games 400  # level separation, after AI-L1/L2
```
