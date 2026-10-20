# AI spec: partners and opponents that play like people

*Phase 0, 2026-10-19.* Every sin below was named by a real player in a 1-3 star review (Apple review RSS, last 200 per app,
pulled 2026-10-19; see PLAYER_RESEARCH.md) or in the market research (Mobile-Market-Research `research/games-strategy-sim-idle.md`
#1-2, `research/games-casual-puzzle.md` #1, #3, #5). Each sin is a **scenario test** in `sim/test_ai.mjs`, run against the
same `proto/ai.js` the app ships, that the AI must pass at **every level**, Easy included. Every scenario is a real deal
(four 13-card hands, the bids, passes and plays replayed through the engine with a legality check), so Expert and Extreme
really sample it; the test fails if a look-ahead decision never sampled a world.

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
5. **Levels differ in skill, not in honesty.** All levels pass every scenario in §3-§7.

## 2. Levels

| Level | How it plays | Human-like mistakes it may make | Never |
|---|---|---|---|
| **Easy** | Rule-based heuristics, counts only the last trick, bids from a simple point count | Bids ±1 off; forgets which suits are void after 4+ tricks; plays a middle card where the lowest would do; doesn't count spades left | Any §3-§7 sin; an illegal play |
| **Standard** | Heuristics + full card counting (cards played, known voids), bag awareness, nil cover, moon detection | Occasionally misjudges a finesse; conservative bids | Any sin |
| **Expert** | Standard + Monte Carlo look-ahead: samples 24 deals consistent with everything public (voids, plays, passed cards), plays each candidate out with the Standard policy and scores it with the game end in view (a hand that ends the game is worth ±1000). Card play and **Spades bidding** both look ahead: each candidate bid (within 2.5 of the hand count, never below the spades that can't lose, nil when the hand's nil risk is ≤ 0.45) is bid, the later seats bid like Standard, and the hand is played out | — | Any sin; peeking (samples never use hidden cards) |
| **Extreme** | Expert with 60 samples, and it reads the bids: a sampled deal is kept only if each seat's dealt hand fits what that seat bid (a nil bidder holds no top spades; a 5-bid holds about five tricks). It also **passes by look-ahead** in Hearts (every 3-card pass from the 5 cards most worth passing, 30 deals each) and **calls by look-ahead** in Euchre (every legal call, alone or not, 120 deals that fit the calls so far, the later calls made like Standard; Euchre play also uses 120 deals). For very experienced players (owner request, 2026-10-19) | — | Any sin; peeking (the bids are public; the hands are not) |

A look-ahead **overrules the heuristic only when it is sure**: every option is played out in the same sampled deals, and
another option replaces the heuristic's choice only if its average gain over that choice, deal by deal, is larger than
the gain's own standard error. With 24 samples a 10-point difference is mostly noise; this keeps Expert from trading a
sound heuristic play for a lucky-looking one (review AI-S2), and lets Extreme's larger samples change more decisions.

Extreme is offered from Table setup like the others (four pips on the seat card). Partner and opponents are picked separately at table setup (e.g. Expert partner, Standard opponents). Bots have names and
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
| S09 | **Nil bidder takes a trick it could duck.** "The opponent bid nil and took a diamond trick with the queen of spades." | Own nil: play the highest card that still loses; when void, discard the most dangerous card (danger: few unseen cards above it, a spade more so, low cards held under it less so); never trump when a discard exists. Sin predicate also: void in the led suit and holding a spade that can't win this trick but would win later (no unseen spade above it, e.g. the K♠ under an A♠ already played) → shed that spade now (review AI-S1). |
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
| S20 | **Wrong score.** "My team completes a nil, then the opponent gets credit." "Set a nil and a 5 bid … -50 instead of -150." "The bag count didn't increase." | `sim/test_sim.mjs`: a table of hand outcomes per preset with expected line items; the score sheet prints the same line items. Standard and Tournament: a broken nil's tricks don't count toward the partner's bid (set nil + set 5 = -100 and -50) but are bags, on their own `nilBags` line (+1 each, into the bag count); Kitchen: they count toward the partner. 10 for 200 is +200 / -200; Boston "took 13" +250, "bid 13" +500 / -500; "Lose at" ends the game. |
| S21 | **Blind nil exchange done backwards.** (R3: pagat's basic blind nil swaps two cards) | Rule "Blind nil exchange" 2 / 1 / 0. The nil passes its most dangerous cards, spades first (a spade counts six ranks higher, so the 9♠ and up go before a side ace); the partner passes back its lowest. Sim: blind nil made ≥ 45% (Kitchen, Standard). |

## 4. Hearts sins (v1.0)

| ID | Sin | Scenario test |
|---|---|---|
| H01 | **Nobody stops a moon.** "None of the other players will even attempt to stop each other from shooting the moon." "Has no sense of who is winning." | One player has all points so far, ≥ 8 hearts or Q♠ + 5 hearts taken, AI can win a trick containing a point card → it takes that trick (accepting points) unless doing so costs it the game. Never gives that player the Q♠ (following under their A♠/K♠ or as a discard) when another card will do (review AI-H1). |
| H02 | **Ducks a trick it should take to stop a moon.** (PROPOSAL wording) | Same position on the last 3 tricks: AI holding a winner in the led suit plays it. |
| H03 | **Moon scoring choice against itself.** "It shoots the moon and always subtracts from its own score even though an opponent would lose if he added it to others." | "Shooter chooses" preset: AI picks +26 to others when that ends the game with it lowest; otherwise the option with the better winning chance. |
| H04 | **Targets the human with Q♠.** "AI plays the queen of spades as soon as you only have the king or ace of spades." | Seat-swap test (§1.1); Q♠ dump decisions depend only on public info. |
| H05 | **Passes a moon to the next player.** "If you are receiving from them, there's probably a 50% chance you can shoot the moon." | Sim: moon rate of the receiving seat ≤ baseline + 1 pt; passing never sends A♥ K♥ Q♥ all three plus A♠ to one player. |
| H06 | **Can't read a pass.** "Has no sense … how to read a pass." | Standard+: cards passed to the AI are tracked as known; scenario: AI received Q♠ from the left → never leads a spade into a void it caused. |
| H07 | **Breaks hearts / plays points on trick 1 illegally.** | Engine legality tests per preset. |
| H08 | **Wrong moon/Jack of Diamonds scoring.** | `sim/test_sim.mjs` scoring table (moon add / choose / auto, J♦ on/off, 100/150 end, ties; Tournament: only a heart breaks hearts). |
| H09 | **Ignores the J♦ (Omnibus, Kitchen preset).** "Throws the jack of diamonds away." (review AI-H3, AI-H4) | With the J♦ rule on: never duck the J♦ under someone else's winner or discard it to them when another card will do; take a trick worth less than nothing (the J♦ and fewer points) when last to play or with a card nobody can beat; lead the J♦ when nobody can beat it. |
| H10 | **Ends a game it is losing.** (review AI-H2) | Points that would push the trick's winner to the end score are given only when the bot is lowest; otherwise another card (Standard, every level). Expert and Extreme also score each playout with the game end (±1000). |

## 5. Euchre sins (v1.1)

Bots: `proto/ai-euchre.js` (dispatched from `ai.decide()`/`sins()`/`know()`), same four levels: Easy calls from a
noisy hand count, forgets old tricks and slips a card; Standard counts every card and the upcard's whereabouts;
Expert and Extreme sample the hidden hands (the dealer holds a picked-up upcard until it's played; the rest is the
kitty) and play each card out; Extreme keeps only deals that fit every call and pass, samples twice as many (120), and
calls by look-ahead: each legal call (pass, order or name a suit, alone or not) is made in each deal, the later calls
follow Standard, the hand is played out, and the call changes only when it is surely better. Predicates are in `sins()`;
scenarios in `sim/test_ai_euchre.mjs`, every level (Easy 12 times).

| ID | Sin | Scenario test |
|---|---|---|
| E01 | **Leads the right when the other team called trump.** (PROPOSAL; r/euchre) | Defending and on lead → don't lead the right bower / trump unless holding 3+ trump including both bowers (or only trump is left). |
| E02 | **Trumps a trick partner is winning when last.** "Partner trumping tricks when they were the last player and I had won it." "He will be last to lay on a trick that I am winning, throw trump on it." | Last to play, partner winning → lowest card, never trump. |
| E03 | **Leads a low trump into partner's call.** "I will call something and he will lead with the 10 of trump, totally taking control away from me." | Partner is maker and AI leads: holding the right bower or an off-suit ace, lead one of them; otherwise never a 9/10 of trump. |
| E04 | **Calls trump on nothing.** "My 'partner' calls trump on less than nothing and we often get euchred." "Terrible calls." | Never order up / call with ≤ 1 trump and no bower (the dealer counts the upcard; stick-the-dealer forced call excepted). Sim: maker euchre rate ≤ 20% (Standard). |
| E05 | **Bleeds trump regardless.** "Your AI partner's sole objective is to bleed trump, whether it makes sense or not." | Don't lead trump when defending (E01), or, on the making side, when partner is out of trump (or sitting out) and the opponents have none left, while a losing side card could be led instead. |
| E06 | **Over-trumped by partner.** "Over trumped by the partner multiple times a game." | Same as S04 for Euchre: partner's trump is winning and every opponent still to play is known out of trump → never play a higher trump. |
| E07 | **Goes alone recklessly / never alone.** | Alone only with ≥ 4 sure tricks (the unbroken run of top trump, every trump if that run outlasts the trump still out, plus off aces; the dealer counts the hand after picking up); a hand with both bowers, A K of trump and an off ace goes alone at every level; under Canadian loner an assist-only hand passes. Sim: loner success (all five tricks) ≥ 60%. |
| E08 | **Signals with hidden information.** "Seem to know exactly when to throw off because their partner has the winning card." | §1.1 view test. |
| E09 | **Farmer's hand / stick the dealer applied wrongly.** | Engine tests per preset (`sim/test_euchre.mjs`: stick the dealer, Canadian loner, farmer's hand, defend alone, loner's left leads, 5,000 random hands per preset); a bot with a farmer's hand swaps three and keeps the upcard's suit. |

## 6. Oh Hell sins (v1.1)

Bots in `proto/ai-ohhell.js`; scenarios in `sim/test_ai_family.mjs`. Every seat plays for itself, so "partner" sins become
sins against your own bid: the player at the table should never watch a bot throw away a bid it had made, or bid like it
didn't look at its cards. The turned trump card is public; the undealt cards are not (a bot never learns which they are).

| ID | Sin | Scenario test (must hold at every level) |
|---|---|---|
| O01 | **Busts its own exact bid needlessly.** Sitting exactly on its bid, it takes a trick it could have lost, including overtaking an opponent who is sitting on *their* bid (which saves them and sinks the bot). | Exactly on the bid and last to play with a losing card available → play a losing card (on-suit when following; never trump in when void). |
| O02 | **Wild bid / bidding to hit the hook.** Bids two or more off what its own cards count to; as a hooked dealer jumps far from its count instead of moving one trick. | Every bid is within 1 of the bot's own count (`count(view)`: the hand, the hand size, the trump, the bids so far). A hooked dealer whose count is the barred number bids one either side. A hand of nothing bids 0-1. |
| O03 | **Gives away a sure trick it needs.** Still short of its bid (and the bid still makeable), last to play, holding a winner, it plays a loser. | Short of the bid, last to play, can win → wins (trumping in when void). |
| O04 | **Throws its high card on a trick it can't win.** Short of its bid, can't beat the trick, plays a high card of the suit. | Can't win and still needs tricks → lowest card of the suit led. |
| O05 | **Hook or scoring applied wrongly.** | `sim/test_family.mjs`: the hook bars exactly the number that makes the bids equal the tricks, only for the dealer; every scoring preset (10 + tricks, 1 a trick + 10, minus misses) as a table of line items; a tie for first after the last hand plays one more hand. |

Sim (`node sim/sim.mjs --game ohhell --check`, Standard, 20K hands): exact bids ≥ 50% (Standard preset 57.6%, Kitchen
60.5%, Tournament 53.3% where 10-13 card hands make it harder), average miss ≤ 0.6 tricks, zero sins shipped. Level ladder
(one stronger seat against three weaker, so even is 25%): Standard vs Easy 46.5%, Expert vs Standard 35.0%, Extreme vs
Expert 25.9% (572 games each, 2026-10-19). Extreme is not yet measurably stronger than Expert: open item. Expert samples hidden hands consistent with voids and plays each clean card out; Extreme keeps only
worlds where each seat's hand as dealt counts to within 1.5 of its bid.

## 7. Whist sins (v1.1)

Bots in `proto/ai-whist.js`; scenarios in `sim/test_ai_family.mjs`. Classic partnership manners, the ones a Whist player
learned at the kitchen table: second hand low, third hand high, cover an honour with an honour, return partner's lead.
The turned trump card stays in the dealer's hand until played; every bot knows that (it was turned in front of everyone),
and Expert's sampled worlds put it there.

| ID | Sin | Scenario test (must hold at every level) |
|---|---|---|
| W01 | **Takes a trick off partner.** Last to play, partner winning, it overtakes or trumps. | Last to play and partner winning → a card that loses (lowest of the suit, or a discard; never trump). |
| W02 | **Doesn't return partner's lead.** Partner opened a suit; the bot gets in and leads something else. | On lead, partner's opening suit (not trump) still held and not yet returned → lead it, unless leading a sure winner, drawing trump with 5+ trumps, or an opponent is known out of that suit and may still hold trump (no leading into a ruff). |
| W03 | **Doesn't cover an honour.** Second to play on an opponent's J, Q or K, holding a higher card of the suit, it ducks. | Second hand on a led honour with a higher card of the suit → beat it (lowest card that does). |
| W04 | **Throws its high card on a trick it can't win.** | Opponents winning, nothing beats it, following suit → the lowest card of the suit. |
| W05 | **Trumps partner's sure trick.** Partner's card is the best left in the suit and the last opponent hasn't shown out, and the bot trumps it anyway. | Not last, partner winning with the boss card, last opponent not known void in the suit led, a non-trump discard available → no trump. |
| W06 | **Book, honours or game end scored wrongly.** | `sim/test_family.mjs`: tricks over six score 1 each; honours 4 for all four, 2 for three, off in Standard; tricks score before honours; a side one point from game can't count honours; honours can reach game but not pass it; first side to 5 or 7 wins. |

Sim (`node sim/sim.mjs --game whist --check`, Standard, 20K hands): tricks per team within 0.15 a hand with equal bots
(6.53 / 6.47), team wins 51.6% / 48.4%, zero sins shipped. Level ladder (partnerships, even is 50%; 577-651 games each, 2026-10-19): Standard vs Easy
69.3%, Expert vs Standard 71.9%, Extreme vs Expert 49.3% (measured with an earlier lead-reading Extreme, since removed;
Extreme is not yet measurably stronger than Expert: open item).
Extreme is Expert with 60 samples instead of 24 (a bid-reading filter has nothing to read in Whist: there is no bidding).

## 8. Canasta / Hand and Foot (v2 note)

C01 "My partner will go out without asking me" → AI asks "May I go out?" and waits. C02 "Doesn't pick up a card that
would have given us a canasta" → pick up the pile when it completes or extends a team meld. C03 "Partner plays for the
other team" → never discard a card the opponents' melds show they want when another discard exists.

## 9. The sin detector (runtime and sim)

`proto/ai.js` exports `sins(view, action)` built from the same predicates as the tests. The sim runs it on every
decision of every seat; the game runs it on bot plays only and logs `blame {game, sin}` (opt-in analytics) if one ever
fires. Target: **zero** firings at any level in 100K hands. A play is a sin only when a clean play was there to make
instead: a forced play (every legal card commits it) never counts (review AI-H5).

## 10. Sim report (filled in `docs/RELEASE_REVIEW.md`)

`node sim/sim.mjs --game spades --hands 100000 --level easy|standard|expert` (and hearts, and euchre),
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
| Maker euchre rate (Euchre) | calls where the makers took 2 tricks or fewer | ≤ 20% |
| Loner success (Euchre) | loners that took all five tricks | ≥ 60% |
| Also reported (Euchre) | hands with a maker, thrown in, round-two calls, dealer stuck, marches, points per call, loners per 100 hands | — |
| Blind nil made (Spades, Kitchen) | blind nil bids that took no trick, with the 2-card exchange | ≥ 45% |
| Nil-able hands, plain rule | reported next to the bots' own nil test: ≤ 2 spades, none above the 9, no side ace (DESIGN §7) | — |
| Moon runs, plain rule | reported next to the sim's own: after trick 6 one player has every point card taken, 5 or more | — |
| Partner-blame events | §9 detector firings | 0 |
| Level ladder | `node sim/sim.mjs --ladder --games 2000`: the stronger level against the weaker, seats swapped halfway, stronger side's share of finished games | **Partnerships** (Spades, Euchre, Whist; even is 50%): Extreme vs Expert ≥ 55%, Expert vs Standard ≥ 58%, Standard vs Easy ≥ 58%. **One strong seat vs three** (Hearts, Oh Hell; even is 25%): Extreme vs Expert ≥ 28%, the other steps ≥ 30% |
| Moon rate per level (Hearts) | as above, all four seats at that level | Easy and Standard 1-4% (the check); Expert and Extreme 1-7% (strong players shoot more often, review AI-L4) |
| Fairness | win rate per seat with equal levels | 50% ± 1 pt |

Every run is cut into chunks (500 hands, or 25 whole games for the ladder), each with a seed of its own, so CI and a
laptop play exactly the same hands whatever `--workers` is (review T2).
