# AI spec: partners and opponents that play like people

*Phase 0, 2026-10-19.* Every sin below was named by a real player in a 1-3 star review (Apple review RSS, last 200 per app,
pulled 2026-10-19; see PLAYER_RESEARCH.md) or in the market research (Mobile-Market-Research `research/games-strategy-sim-idle.md`
#1-2, `research/games-casual-puzzle.md` #1, #3, #5). Each sin is a **scenario test** in `sim/test_ai.mjs`, run against the
same `proto/ai.js` the app ships, that the AI must pass at **every level**, Easy included.

## 1. Principles

1. **The AI sees only what a player at the table sees.** `ai.decide(view)` gets its own hand, the bids, the cards played,
   the scores and the rules. No other hands, no deck order, no seed, and **no flag saying which seats are human**. Test:
   `view()` is built by one function and a test asserts its keys; a second test swaps human/bot labels and checks every
   decision is identical. (Answers "opponents know exactly what is in everyone's hand", "bots collude against the single
   player", "AI cheats".)
2. **Legal by construction.** The engine computes legal moves; the AI picks from that list. Renege is impossible for every
   seat (test: 1M random legal games, every play checked against follow-suit by an independent checker).
3. **Partners play for the team, opponents play for theirs.** No rubber-banding, no "keep the game close", no reaction to
   streaks, scores of the human, purchases or level-ups. The AI's code has no access to any of that (same import test as
   the dealer).
4. **Every decision has a reason code** (`cover_nil_lowest_winner`, `duck_partner_winning`, `stop_moon`, …). Tests assert
   reason codes; the table's **"Why?"** button (tap the partner's last card) shows the reason in plain words. Players
   asked to "tell your partner they are messing up"; we let them ask instead.
5. **Levels differ in skill, not in honesty.** All levels pass every scenario in §3-§4.

## 2. Levels

| Level | How it plays | Human-like mistakes it may make | Never |
|---|---|---|---|
| **Easy** | Rule-based heuristics, counts only the last trick, bids from a simple point count | Bids ±1 off; forgets which suits are void after 4+ tricks; plays a middle card where the lowest would do; doesn't count spades left | Any §3-§4 sin; an illegal play |
| **Standard** | Heuristics + full card counting (cards played, known voids), bag awareness, nil cover, moon detection | Occasionally misjudges a finesse; conservative bids | Any sin |
| **Expert** | Standard + Monte Carlo determinization: samples 200 deals consistent with everything public (bids, voids, plays), plays each candidate out with the Standard policy, picks the best average | — | Any sin; peeking (samples never use hidden cards) |

Partner and opponents are picked separately at table setup (e.g. Expert partner, Standard opponents). Bots have names and
a fixed style; the player can swap partners ("can't get a new partner" was a complaint).

## 3. Spades sins (v1.0)

| ID | Sin (what players wrote) | Scenario test (must hold at every level) |
|---|---|---|
| S01 | **Bids nil holding the A♠.** "One of the opponents bid nil and they are holding the ace of spades." | Never bid nil with A♠, K♠ with < 3 spades total, any Joker / 2♠ / 2♦ (Jokers preset), or 4+ spades including Q♠+. |
| S02 | **Nil after partner's nil.** "How is your partner going to go nil after you bid first and go blind nil?" | If partner bid nil or blind nil, never bid nil. |
| S03 | **Cuts a trick partner is winning.** "I will be taking the trick and my partner puts a spade on it." "Your own partner cuts you like it is nothing." | Last to play and partner is winning → never trump, never overtake; play the lowest legal card (unless partner bid nil: S06). |
| S04 | **Overtrumps partner's trump.** "If you've trumped an opponent's hand, your partner will throw a HIGHER trump." | Partner's spade wins so far and the remaining opponent is known void in spades or already played → never play a higher spade. |
| S05 | **Doesn't cover partner's nil.** "Why would my partner not play spades to beat my high card when I'm playing a nil bid?" "Why did the bot not break the opponent Ace of clubs?" | Partner bid nil and is currently winning the trick → play a card that beats partner's if one exists (trump if void and allowed). |
| S06 | **Sloughs instead of trumping to save nil.** "If you bid NIL and are stuck with a boss, your partner will slough off instead of trumping." | Same as S05 when void in the led suit: trump over partner's card rather than discard. |
| S07 | **Covers with the top spade, then can't later.** "Cut with a jack of spade when he could've used a 2. Then when I needed it to cover my nil later on, it couldn't." | When covering or winning, use the **lowest** card that wins. |
| S08 | **Takes tricks over partner's nil / sets own partner.** "Tries to take tricks over protecting your nil", "Partner intentionally throws low cards when I bid zero, then later higher cards in the same suit." | Partner nil: on partner's suit lead, play high early (unblock above partner), never "duck under" partner when holding a higher card. |
| S09 | **Nil bidder takes a trick it could duck.** "The opponent bid nil and took a diamond trick with the queen of spades." | Own nil: play the highest card that still loses; when void, discard the most dangerous card (highest spade or highest card in a short suit); never trump when a discard exists. |
| S10 | **Breaks an opponent's trapped nil for them.** "We had a nil player totally trapped and my partner trumps the trick." "Misses the chance to let your opponent win a trick when they had bid nil." | Opponent bid nil and is winning the trick → do not overtake unless our team needs this trick to make our bid and it is the last chance. |
| S11 | **Ignores bags.** "When we reach our bid they don't know to play off suit to avoid bags." "The computer players don't consider how many are in the bag." | Team has made its bid and bags + tricks-left would cross the bag limit → prefer losing plays, unless the trick sets the opponents. |
| S12 | **Doesn't set the opponents.** "Allows the opposing team to make books when it could have easily set them." "To win we need to bag the other team and my partner takes the bags." | Opponents need exactly the remaining tricks and AI holds the boss card in the led suit (or a trump while void) → win the trick. When bagging them wins the game, play to give them tricks. |
| S13 | **Throws its high card on a lost trick.** "The partner doesn't keep his higher cards when playing on a trick he isn't taking." | Can't win the trick → play the lowest card of the suit (or the least useful discard). |
| S14 | **Spades early for no reason.** "They'll spade early for no reason." | Don't lead spades before trick 4 unless holding 5+ spades with A or K, or pulling trump to protect a partner's nil. |
| S15 | **Overbids / underbids.** "Partner overbids." "Bid 4 with a hand of 6 high spades cards." "Partner overbids by exactly 1 trick when I go nil." | Scenario: 6 high spades → bid ≥ 6. Sim: Standard team bid accuracy (made exactly to +2) ≥ 70%, set rate ≤ 12%. Partner-of-nil bids are never inflated (sim: their set rate ≤ normal set rate + 3 pts). |
| S16 | **Won't bid 1 when partner bids nil.** "Why when I go nil my partner can't make a bid of 1?" | The bid of a nil-bidder's partner can be any value from 1 up; no floor of 2+ in the bidding code. |
| S17 | **Nil too often.** "Constant bidding Nil with face cards and spades." | Sim: nil bid rate per seat within 1.5× of the expected nil-able-hand rate; scenario S01 covers the worst cases. |
| S18 | **Doesn't take the lead to protect partner's nil.** "Why did my teammate NOT throw the Ace and King of spades to get in the lead?" | Partner nil, AI wins a trick → lead a suit where partner is known void or a boss card, never a low card into partner's long suit. |
| S19 | **Renege.** "The game renege." | §1.2 legality test. |
| S20 | **Wrong score.** "My team completes a nil, then the opponent gets credit." "Set a nil and a 5 bid … -50 instead of -150." "The bag count didn't increase." | `test_rules`: a table of 40 hand outcomes per preset with expected line items; the score sheet prints the same line items. |

## 4. Hearts sins (v1.0)

| ID | Sin | Scenario test |
|---|---|---|
| H01 | **Nobody stops a moon.** "None of the other players will even attempt to stop each other from shooting the moon." "Has no sense of who is winning." | One player has all points so far, ≥ 8 hearts or Q♠ + 5 hearts taken, AI can win a trick containing a point card → it takes that trick (accepting points) unless doing so costs it the game. |
| H02 | **Ducks a trick it should take to stop a moon.** (PROPOSAL wording) | Same position on the last 3 tricks: AI holding a winner in the led suit plays it. |
| H03 | **Moon scoring choice against itself.** "It shoots the moon and always subtracts from its own score even though an opponent would lose if he added it to others." | "Shooter chooses" preset: AI picks +26 to others when that ends the game with it lowest; otherwise the option with the better winning chance. |
| H04 | **Targets the human with Q♠.** "AI plays the queen of spades as soon as you only have the king or ace of spades." | Seat-swap test (§1.1); Q♠ dump decisions depend only on public info. |
| H05 | **Passes a moon to the next player.** "If you are receiving from them, there's probably a 50% chance you can shoot the moon." | Sim: moon rate of the receiving seat ≤ baseline + 1 pt; passing never sends A♥ K♥ Q♥ all three plus A♠ to one player. |
| H06 | **Can't read a pass.** "Has no sense … how to read a pass." | Standard+: cards passed to the AI are tracked as known; scenario: AI received Q♠ from the left → never leads a spade into a void it caused. |
| H07 | **Breaks hearts / plays points on trick 1 illegally.** | Engine legality tests per preset. |
| H08 | **Wrong moon/Jack of Diamonds scoring.** | `test_rules` scoring table (moon both modes, J♦ on/off, 100/150 end, ties). |

## 5. Euchre sins (v1.1; specified now so the sim and tests exist before the UI)

| ID | Sin | Scenario test |
|---|---|---|
| E01 | **Leads the right when the other team called trump.** (PROPOSAL; r/euchre) | Defending and on lead → don't lead the right bower / trump unless holding 3+ trump including both bowers. |
| E02 | **Trumps a trick partner is winning when last.** "Partner trumping tricks when they were the last player and I had won it." "He will be last to lay on a trick that I am winning, throw trump on it." | Last to play, partner winning → lowest card, never trump. |
| E03 | **Leads a low trump into partner's call.** "I will call something and he will lead with the 10 of trump, totally taking control away from me." | Partner is maker and AI leads: lead an off-suit ace or the right bower; never a 9/10 of trump. |
| E04 | **Calls trump on nothing.** "My 'partner' calls trump on less than nothing and we often get euchred." "Terrible calls." | Never order up / call with ≤ 1 trump and no bower (stick-the-dealer forced call excepted). Sim: maker euchre rate ≤ 20% (Standard). |
| E05 | **Bleeds trump regardless.** "Your AI partner's sole objective is to bleed trump, whether it makes sense or not." | Don't lead trump when defending, or when partner is known out of trump and we hold the last trump. |
| E06 | **Over-trumped by partner.** "Over trumped by the partner multiple times a game." | Same as S04 for Euchre. |
| E07 | **Goes alone recklessly / never alone.** | Alone only with ≥ 4 sure tricks (both bowers + ace, etc.); sim: loner success ≥ 60%. |
| E08 | **Signals with hidden information.** "Seem to know exactly when to throw off because their partner has the winning card." | §1.1 view test. |
| E09 | **Farmer's hand / stick the dealer applied wrongly.** | Engine tests per preset. |

## 6. Canasta / Hand and Foot (v2 note)

C01 "My partner will go out without asking me" → AI asks "May I go out?" and waits. C02 "Doesn't pick up a card that
would have given us a canasta" → pick up the pile when it completes or extends a team meld. C03 "Partner plays for the
other team" → never discard a card the opponents' melds show they want when another discard exists.

## 7. The sin detector (runtime and sim)

`proto/ai.js` exports `checkSins(view, action)` built from the same predicates as the tests. The sim runs it on every
decision of every seat (bots and a random-legal "human"); the game runs it on bot plays only and logs `blame {game, sin}`
(opt-in analytics) if one ever fires. Target: **zero** firings at any level in 100K hands.

## 8. Sim report (filled in `docs/RELEASE_REVIEW.md`)

`node sim/sim.mjs --game spades --hands 100000 --level easy|standard|expert` (and hearts, and euchre once it exists),
each preset, partner and opponents at the same level, plus "Expert partner vs Standard opponents" and "Easy partner vs
Expert opponents":

| Metric | Definition | Target (Standard) |
|---|---|---|
| Bid accuracy | team made its bid with 0-2 bags | ≥ 70% |
| Set rate | team took fewer tricks than bid | ≤ 12% |
| Nil success | nil bids made | ≥ 70% |
| Bags per hand | per team | ≤ 1.5 |
| Moon rate (Hearts) | hands where someone shot the moon | 1-4% |
| Moon stops | runs where one seat holds every point taken so far, at least 10, after trick 6, that end without a moon | ≥ 60% |
| Partner-blame events | §7 detector firings | 0 |
| Level ladder | win rate of Expert team vs Standard team, Standard vs Easy | ≥ 58% each |
| Fairness | win rate per seat with equal levels | 50% ± 1 pt |
