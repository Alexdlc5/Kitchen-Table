# Kitchen Table: design

*Phase 0, 2026-10-19. Name decided 2026-10-19: **Kitchen Table** (store: "Kitchen Table: Spades, Hearts"). It lives in one place:
`sim/generator.json` → `brand` (the game, the listing scripts and the site read it from there).*

Classic American card games for iPhone and iPad. Spades and Hearts at launch, Euchre next, Canasta / Hand and Foot later.
Hearts free forever; one $6.99 **Everything** unlock for the rest; cosmetic packs. **No ads ever, no subscriptions, no
accounts, no server.** A provably fair deal, partners built from real review complaints, a Comfort mode for older eyes and
hands, and Game Center family tables.

Read with: `docs/PLAYER_RESEARCH.md` (why each rule exists), `docs/AI_SPEC.md` (how the bots must play), `docs/TABLE.md` (the
look), `docs/SETUP.md` (the owner's steps). Source proposal: Mobile-Market-Research `docs/PROPOSAL.md`.

---

## 1. Who it is for, and the moment

- **The player**, 45-75, plays 20-50 hands a night after dinner on an iPad or phone. Wants a fair hand, a partner who plays
  like a person, house rules that match the family's, and nothing on top of the score.
- **The caregiver**, 40-65, set up a parent's iPad and wants zero surprises: no pop-ups, no charges, no links out, big cards.
- **The family**: "a few hands with Mom on Sunday" from two states away.

**The moment:** open the app and have cards in hand in under two seconds, in the game played last night, with the same
partner and the same house rules. Nothing else on screen.

## 2. Product rules (non-negotiable; each one is a test and a line on the listing)

| # | Rule | Enforced by |
|---|---|---|
| R1 | **Fair deal.** Fisher-Yates over a CSPRNG seed. The seed is printed on the score sheet. `deal(seed, deckSize)` takes nothing else. | `test_sim`: same seed → same deal; golden deals cross-checked by an independent implementation; `dealer.js` imports nothing; stats screen; `site/verify.html` |
| R2 | **Never interrupt a hand.** No modal, toast, rating prompt, purchase prompt or consent card between the deal and the last trick. | `smoke.mjs` plays a full hand per game and fails on any overlay; `ui.overlay()` refuses while `handInProgress` |
| R3 | **Comfort mode** (§6). | `smoke.mjs --comfort`: target sizes measured on and off |
| R4 | **House rules are presets, not constants.** Every rule lives in `sim/generator.json` with a name and an explanation. | Rules tests read only the JSON; a rule with no `explain` fails `npm run check` |
| R5 | **AI quality bar** (AI_SPEC.md). Four levels: Easy, Standard, Expert, Extreme (for very experienced players). Every named sin is a scenario test at every level; the AI sees only what a player at the table could see. | `test_ai` scenarios; `view()` isolation test; 100K-hand sim per level |
| R6 | **Save on device, no accounts.** localStorage mirrored to Capacitor Preferences. Game Center is the only identity. | `check-save-mirror.mjs` |
| R7 | **No ad SDK in the binary, ever.** No AdMob, UMP, ATT, `app-ads.txt`. `NSPrivacyTracking` false, no tracking domains. | `store-check.mjs` fails on an ad SDK in package.json / SPM graph / Podfile |
| R8 | **Purchases are permanent.** Only non-consumables. No subscriptions, rentals, coins, energy, hand limits. Restore on the title screen. Family Sharing on. | `store-check.mjs` checks `generator.json → products` (all `non-consumable`, `familyShareable: true`) |
| R9 | **No outbound link without a gate** (hold-to-open "grown-up check", off entirely when the caregiver lock is on). | Smoke: every `a[href^=http]` / `platform.openUrl` goes through `gate()` |
| R10 | **No timers anywhere.** No turn clock, no auto-play, no inactivity boot, including on family tables. | Smoke: a human seat left idle for 10 minutes (fake clock) is still waiting, nothing auto-played |

## 3. Games and scope

| Game | Release | Price | Seats | Notes |
|---|---|---|---|---|
| **Hearts** | v1.0 | Free forever | 4, no partners | Full game, all presets, all AI levels, stats, leaderboards. Never nagged. |
| **Spades** | v1.0 | Everything | 4, two teams | Nil, blind nil, bags, Jokers/deuces, 10-for-200, minimum bid presets |
| **Euchre** | v1.1 | Everything | 4, two teams | 24 cards, bowers, order up / name trump, the dealer picks up and discards, going alone, stick the dealer, Canadian loner, farmer's hand, defend alone, loner's left leads, 10/11 points. Engine `proto/euchre.js`, bots `proto/ai-euchre.js` (E01-E09, AI_SPEC §5), tests `sim/test_euchre.mjs` + `sim/test_ai_euchre.mjs`, `sim.mjs --game euchre`. At the table: the kitty with its upcard on the felt during the calls, a calling pad in the middle (order up / pick up, the three other suits, Go alone, Pass; nothing pops up), the trump suit on the score chip and the maker's plate, score sheet lines for points, euchres, marches and loners. |
| Canasta / Hand and Foot | v2 | Everything | 4, two teams | Partner asks "May I go out?" (the #1 complaint) |

Every mode: solo vs 3 bots, pass-and-play (any mix of humans and bots on one device), family table (Game Center, §9).

## 4. Screens and flow

```
cold launch ──► resume? ──yes──► Table (hand restored exactly, same seed)
                  │no
                  ▼
               Title ── [Deal: <last game>] (big, top) ──────────────► Table
                  ├── Game picker ── Hearts / Spades / Euchre / [Unlock everything] row
                  ├── Family table (Game Center; hidden if not signed in or the gate failed)
                  ├── Stats (fair-deal proof) ── Options ── Caregiver (PIN) ── How to play
                  └── Restore purchases (small text button, always visible)

Table ── last trick ──► Score sheet (line-by-line scoring, seed, "Next hand") ──► … ──► Results ("Deal again" one tap)
```

| Screen | What is on it | Notes |
|---|---|---|
| **Title** | Wordmark on the table art; **Deal: Spades** (last game, last rules, last partner) as the one big button; Games; Family table; Stats; Options; Restore purchases | Caregiver entry is a small key icon (PIN). First launch: the big button reads **Deal: Hearts**. |
| **Game picker** | One card per game with its rules preset and AI level chips; locked games show a small padlock and open the unlock screen; **one row** "Unlock everything, $6.99 once" at the bottom | The only purchase surface besides the cosmetics shelf and Options. No badges, no countdowns, no "sale". |
| **Table setup** (sheet, skippable) | Seats (you / bot / pass-and-play human per seat), partner bot by name and level, house-rules preset (Standard / Kitchen table / Tournament / Custom), target score | Remembers everything. "Custom" opens sliders and toggles, each with its one-line explanation from `generator.json`. |
| **Table** | Your hand (fanned, bottom), three seats with name + bid + tricks, the trick in the middle, score chip top-right (tap = score sheet peek, no overlay), menu button top-left | Portrait on iPhone; on iPad landscape the score sheet docks at the side. Bidding is a big number pad on the felt (no modal). |
| **Score sheet** (between hands) | Per team: bid, tricks, nil, bags, line items ("Bid 5, took 6: +51", "Nil made: +100", "10 bags: -100"); running totals; **"Deal #4821 · seed K7QF-2MZ9-…"** with a copy button; "Next hand" | Tapping the seed explains the fair deal and links (gated) to verify.html. Hearts: points per player, moon notice. |
| **Results** | Winner, final score, a one-line game summary, **Deal again** (same seats, rules, new seed) as the big button; Stats; Change game | The only screen that may show the one-time consent card (after the first finished game) or the system rating prompt (§11). |
| **Stats** | Fair-deal proof for the last 1,000 deals (§7); win/loss per game and level; bid accuracy; moons; nils | Plain charts drawn in SVG; "what to expect" line on each. |
| **Options** | Sound, sound on silent, haptics, card size, four-color deck, Comfort mode, animation speed, language, analytics on/off, card back and felt (owned cosmetics), Restore purchases, About (privacy, terms, support: gated links) | |
| **Caregiver** (PIN) | §6.2 | |
| **Unlock** | What Everything opens (Spades and Euchre now, every future game), "$6.99 once. Yours on every device in your Family Sharing group." Buy / Restore / Not now | Opened only by a tap on a locked game or the unlock row. Never on a timer, never after a loss. |
| **Cosmetics shelf** | Card backs and felts, owned ones selectable, packs with price | In Options › Look. |
| **How to play** | Per game: rules for the current preset, generated from `generator.json` explanations; a 5-card "try a trick" walkthrough | |
| **Family table lobby** | §9 | |

**Flow rules**
- A hand in progress is saved after every card; killing the app and reopening lands on the same card with the same seed.
- "Leave game?" confirm only in Comfort mode or when a family table is live (in normal mode the menu has "Save and leave").
- One tap from the results screen to the next deal. One tap from cold launch to the next deal.

## 5. Monetization

| Product | Type | Price | Contents |
|---|---|---|---|
| `everything` | Non-consumable, Family Sharing | $6.99 | Spades, Euchre (v1.1), every future game and rules pack |
| `theme_<id>` × 13 | Non-consumable, Family Sharing | $2.99 Classic · $4.99 Signature · $9.99 Luxe | A table theme: surface, card back, accent (the Table shop, SHOP_AND_ENGAGEMENT.md §2) |

- Hearts, every rule preset, every AI level, Comfort mode, the four-color and jumbo decks, stats and pass-and-play are free.
  **Accessibility is never sold.**
- RevenueCat (as in Glimmerwood; the `purchases-capacitor` plugin and the owner's account already work). Entitlements:
  `everything` and one per theme (`theme_gingham` …). Free tables: Walnut (default) and green, blue, red, orange, pink felt.
- Restore purchases on the title screen and in Options.
- Pricing anchor on the listing: "$6.99 once. The ad apps charge $9.99 for 30 days."
- The shop thanks the player at the top and after every purchase. More income ideas, all within the rules: SHOP_AND_ENGAGEMENT.md §3.

## 6. Comfort mode and the caregiver screen

### 6.0 Accessibility (Options › Accessibility)
Text size (Normal / Large / Extra large), Comfort, four-colour deck, vibration on your turn and on tricks won. For blind
and low-vision players: every card, seat and score is labelled for VoiceOver and every bid, play and trick is announced in
a live region; **Read the table aloud** speaks the same with the phone's voice (the bots wait for it), adds a Read button
(the table, then your hand by suit) and speaks the selected card before you confirm it.

### 6.1 Comfort mode (Options toggle; also set from the caregiver screen; default off)
- Cards drawn at **≥ 1.6×** the default size; the hand becomes two rows if needed (never overlapping indices). Rank and suit
  glyphs ≥ 28 px; every tap target ≥ 64 pt (default mode ≥ 44 pt).
- **High-contrast suits**: four-color deck (♠ black, ♥ red, ♦ blue, ♣ green) and heavier glyphs; a 7:1 text contrast floor.
- **No timers anywhere** (true in every mode; Comfort also slows bot animations to "relaxed").
- **Tap to select, tap again to play** (the selected card lifts and shows "Tap again to play"); no drag, no swipe. A tap
  elsewhere cancels. A tremor's double tap within 300 ms on a *different* card only moves the selection.
- **Confirm before leaving** a game; the Home/menu button needs a confirm.
- **No outbound links** except through the grown-up gate; with the caregiver lock on, none at all.
- No rating prompt, no unlock row (the caregiver unlocks from their screen), no animations that flash.
- Score sheet text and buttons at Comfort size; reduced motion respected automatically.

### 6.2 Caregiver screen (key icon on the title → 4-digit PIN; PIN set on first open; reset by reinstall only)
- **Lock**: Comfort on; purchases, Options and links hidden behind the PIN; Restore purchases still visible.
- **What they see**: which games appear; default game, AI level and preset; "Open straight into a game" (skip title).
- **Guided Access instructions** (Settings › Accessibility › Guided Access, triple-click to start, the passcode is separate
  from ours), with the reasons ("keeps the app on screen, stops accidental swipes home").
- **Family Sharing note**: "Buy Everything on your own Apple Account; it appears on their iPad through Family Sharing."
- Stats reset, sound and haptic defaults, text size preview.

## 7. Fair deal

- `proto/dealer.js` (pure, imports nothing): `newSeed()` = 128 bits from `crypto.getRandomValues`, shown as 26 base-32
  characters in groups (`K7QF-2MZ9-…`); `deal(seed, deckSize)` → a permutation. The PRNG is **xoshiro128\*\*** seeded by
  SplitMix32 over the four seed words; Fisher-Yates with rejection sampling (no modulo bias). The algorithm is ~40 lines,
  published on verify.html. Golden deals in `sim/test_sim.mjs` were cross-checked against an independent re-implementation,
  so the algorithm can never drift from what the page publishes. The sim (`sim/sim.mjs`) runs the game's own JS modules: the
  numbers it reports are for the exact code that ships.
- The game maps the permutation onto its deck (built from the rule preset: 52, 54 with Jokers minus 2♣ 2♥, 24 for Euchre)
  and deals round-robin from the dealer's left. **Nothing else enters the deal**: not purchases, streaks, scores, level,
  which seats are human. A test asserts `dealer.js` has no imports and `deal.length === 2`.
- Every hand gets a fresh seed. Family tables: the host's seed is broadcast before the deal. Deal of the day (later): seed =
  the date's hash, the same for everyone.
- **Stats screen** (last 1,000 deals, stored as counters, not seeds): honor cards (A K Q J) per hand vs 4.0; suit-shape
  frequencies (4-4-3-2, 5-3-3-2, 4-3-3-3, …) vs the exact combinatorial values; spades per hand vs the hypergeometric curve;
  nil-able hands (Spades: ≤ 2 spades below the 9 and no A/K) vs the sim's expectation; Q♠ dealt to you vs 25% (Hearts);
  your team's high cards vs the opponents'. Each chart has a one-line "what you'd expect" and the sample size.
- **site/verify.html**: paste a seed and the game/deck → it shows all four hands, dealer and seats. Same code as the app.

## 8. House rules (presets in `sim/generator.json`)

Every rule: `{ "id", "name", "explain", "type": "toggle|number|choice", "range", "presets": { standard, kitchen, tournament } }`.
"Custom" starts from the last preset and shows every rule with its explanation.

**Spades**

| Rule | Standard | Kitchen table | Tournament |
|---|---|---|---|
| Target score | 500 | 300 | 500 |
| Nil value | 100 | 100 | 100 |
| Blind nil | off | 200, only when down 100+ | off |
| Bags: count / penalty | 10 / -100 | 10 / -100 | 10 / -100 |
| Spades lead only after broken | on | on | on |
| 10-for-200 (bid 10+ and make it) | off | on | off |
| Jokers and deuces (Big Joker, Little Joker, 2♠, 2♦ high; 2♣ 2♥ out) | off | on | off |
| Minimum team bid | none | 4 | none |
| Boston (13 tricks) bonus | off | +250 | off |

**Hearts**

| Rule | Standard | Kitchen table | Tournament |
|---|---|---|---|
| Game ends at | 100 | 100 | 100 (choices 50 / 100 / 150) |
| Shoot the moon | +26 to others | shooter chooses +26 to others or −26 to self | +26 to others (or off) |
| Jack of Diamonds −10 | off | on | off |
| Passing | left, right, across, hold | left, right, across, hold | left, right, across, hold (choices: left only, left-right-hold, none) |
| Hearts must be broken to lead | on | on | on |
| Points on the first trick | no | no | no |
| Q♠ breaks hearts | on | on | on |

**Euchre (v1.1)**

| Rule | Standard | Kitchen table | Tournament |
|---|---|---|---|
| Points to win | 10 | 10 | 10 (choice 11) |
| Stick the dealer | off | on | on |
| Canadian loner (dealer's partner orders up → must go alone) | off | off | off |
| Farmer's hand (all 9s and 10s → swap three with the kitty) | off | on | off |
| Going alone, all 5 tricks | 4 | 4 | 4 |
| Defend alone (a defender may go alone against a loner; a euchre scores 4) | off | off | off |
| Loner's left leads (against a loner, the opponent on the loner's left leads instead of the dealer's left) | off | off | on |

Scoring, every preset: makers take 3 or 4 tricks: 1; all 5: 2 (a march); alone, 3 or 4: 1; alone, all 5: the
"going alone" value; makers take 2 or fewer: the defenders score 2 (euchred), 4 if a defender went alone. A hand
everyone passes twice is thrown in and the deal moves on (unless stick the dealer is on).

The sim plays every preset (balance check: no preset makes a seat or a strategy dominate; reported in RELEASE_REVIEW.md).

## 9. Family tables (Game Center) and the GameKit spike

**v1.0 if the spike passes by the end of week 4; otherwise the v1.1 headline. Never delays the review build.**

- Invite-only real-time matches (`GKMatchmakerViewController`, `matchmakingMode = .inviteOnly`), 2-4 humans, bots fill
  empty seats at the host's AI level. No automatch with strangers, no chat, no nicknames beyond Game Center.
- **Host-authoritative**: the host (lowest `gamePlayerID`) runs the rules engine and the bots, makes the seed, broadcasts
  `{deal, seed, rules, seats}`; guests send intents (`bid`, `play card`); the host validates and broadcasts events. Every
  trick ends with a state hash so a desync is caught and the host's state is resent.
- A guest who drops is replaced by a bot for the rest of the game; nobody is ever booted for being slow (R10).
- Pass-and-play is the fallback and ships regardless.

**Spike plan (week 1-4)**
1. `ios/App/App/FamilyTablePlugin.swift`: a local Capacitor plugin registered from a `CAPBridgeViewController` subclass.
   Methods: `authenticate()`, `invite({min, max})`, `send({data})` (reliable), `leave()`; events: `invited` (from
   `GKLocalPlayerListener.player(_:didAccept:)`), `matched({players, host})`, `data({from, data})`, `playerState`.
2. `proto/platform.js` wraps it as `platform.table` with a web stub (two browser tabs over `BroadcastChannel`) so the whole
   protocol is tested in `smoke.mjs` without a phone.
3. Built by `ios.yml` on every push (simulator) and uploaded to TestFlight with the first app build; a hidden
   `?debug` menu item "Family table test" plays Hearts with 2 humans + 2 bots.
4. **Pass criteria** (owner + one family member on two devices, two Apple Accounts, both with Game Center): invite →
   connected in < 30 s; 3 complete hands with no desync (hash check); a mid-hand disconnect hands the seat to a bot and the
   game finishes; 10 sessions with no crash. Result recorded here and in SETUP.md.
5. **Needs from the owner**: Game Center capability on the bundle ID (ASC), a second device or a family member willing to
   install TestFlight.

**Spike result:** *pending.*

## 10. Game Center

- Leaderboards (`generator.json → leaderboards`): **Hearts: best game** (lowest winning score), **Hearts: games won**,
  **Spades: longest win streak**, **Spades: games won**, **Wins against Extreme**; later **Deal of the day**. Only solo games
  against the bots post scores (pass-and-play shares one Apple Account). The in-app Leaderboards screen shows your bests and
  opens Game Center's own boards on iPhone and iPad.
- Achievements (10): First moon · Stopped a moon · Nil made · Blind nil made · Set them three times in one game · Boston ·
  100 hands · 1,000 hands · Won with every preset · Family table win.
- Never shown during a hand; the Game Center access point is hidden on the table.

## 11. Analytics (opt-in only)

- Consent card once, on the first finished game's results screen ("Help make <name> better?" / "Yes, share" / "No thanks"),
  toggle in Options. Firebase Analytics + Crashlytics start **off** in Info.plist; enabled only after yes. No IDFA, no ATT.
- Events: `consent`, `hand_end {game, preset, level, hands_this_session}`, `game_end`, `paywall_view {from}`,
  `unlock {product}`, `restore`, `comfort {on}`, `blame {game, sin}` (the in-game sin detector, AI_SPEC §5),
  `family_table {humans, bots, ok}`. These are the PROPOSAL §6 leading indicators.
- Rating prompt: `SKStoreReviewController` only on the results screen after a win, at most once per 30 days, never in
  Comfort mode or under the caregiver lock.

## 12. Cosmetics plan

The Table shop (`proto/themes.js`): 19 themes, each a procedural surface, card back and accent, so the shop paints its own
previews and the store-shots script can stage any of them. Free: Walnut and five felts. Paid: Classic $2.99, Signature
$4.99, Luxe collection $9.99 (SHOP_AND_ENGAGEMENT.md §2). Card faces never change. Never time-limited, never a loot box.

**The look (owner, 2026-10-19):** warm, comforting, a little nostalgic, quietly luxurious, for people unwinding after work;
modern enough for younger players. Walnut and ivory, brushed-brass accents. One type family: Alegreya for titles, Alegreya Sans
for reading, with even (lining) figures. Every surface is a real material under one lamp: card stock with grain and a
printed inner rule, letterpress buttons with a little thickness, an engraved brass plate for the main action, brass
slider switches, tent-card seat plates, drawn icons (no emoji). Sounds are soft and airy: filtered breath, slow swells.
The title reads "Play a game of cards at… The Kitchen Table" over a painted teacup, cookies and a score pad.

## 13. Sound and haptics

Shuffle riffle, card snap, trick sweep, a soft chime for a made bid, a low thud for a set. Synthesised (Glimmerwood
`music.js` approach), no audio assets. Respects the silent switch by default, with Options › "Play sound when the phone
is on silent" and a one-time tip. Haptics: light on card play, medium on trick win.

## 14. Trailer hooks

1. **"No ads, ever."** Split screen: left, an incumbent-style hand interrupted by a full-screen ad and "You were removed
   for inactivity"; right, our table, the same hand finishing. Caption: "Pay once. Play forever. No ads, ever."
   (Store previews drop the comparison and the price; Apple disallows them.)
2. **"Sunday with Mom."** A son in Ohio, his mother in Florida, an iPad on her kitchen table. Game Center invite, two bots
   fill the seats, she shoots the moon. Caption: "Your family's table, wherever they are." (Pass-and-play cut if the
   family-table gate fails.)

## 15. Not in scope, ever

Ads, subscriptions, rentals, chips, coins, energy, hand limits, timers that fail you, accounts, a server, chat, ranked
matchmaking with strangers, loot boxes, push notifications for engagement.
