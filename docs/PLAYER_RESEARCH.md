# Player research: why people leave the big card apps, and what makes them switch

*Phase 0, 2026-10-19.* Source: Apple's customer-review RSS feed (`itunes.apple.com/us/rss/customerreviews/…/sortby=mostrecent`),
the **200 most recent written reviews** of each of the top 5 incumbents, pulled 2026-10-19 (Reddit is blocked from this
machine; the r/euchre quotes come from the market research). Theme counts are keyword matches over 1-3 star reviews, so
treat them as rough sizes, not exact numbers. Every quote is verbatim.

## 1. The numbers

| App (US) | Ratings | Window of the 200 | 1-3★ | 1★ | Ads | Booted / timed out | Partner / bot | "Rigged" | Rules / options | Nil |
|---|---|---|---|---|---|---|---|---|---|---|
| Euchre 3D (A Star) | 139K | Apr-Oct 2026 | **145** | 104 | 93 | 47 | 38 | 18 | 11 | — |
| Hearts+ (A Star) | 96K | Jul 2025-Oct 2026 | **150** | 105 | 103 | 59 | 20 | 18 | 8 | — |
| Spades+ (A Star) | 182K | Feb-Oct 2026 | **133** | 89 | 76 | 38 | 38 | 10 | 10 | 10 |
| Spades * (Fiogonia) | 430K | Oct 2025-Oct 2026 | **137** | 87 | 57 | 0 | **53** | 9 | 22 | 16 |
| Spades Classic (MobilityWare) | 275K | Aug-Oct 2026 | 61 | 29 | 24 | 0 | 23 | 13 | 3 | 9 |

Three of five have **two-thirds or more** of their recent reviews at 1-3 stars despite 4.6-4.8 lifetime ratings. A Star's
apps are dominated by ads and getting booted from multiplayer because of ads; Fiogonia's and MobilityWare's by the partner.

## 2. What they hate (clusters, with quotes)

**Ads that end the game.** "Plays hard to close ads in the middle of an online game so player gets booted from the game
for being 'away'" (Euchre 3D). "There's screen with no x or a way to close it" (Euchre 3D). "Every time the candy crush ad
comes on in between hands, I can't click out of it on the X" (Hearts+). "Some ads blast music without option to mute"
(Spades+). "Today I got a pop up saying my apple account had been charged over $500 … to call apple" (Spades+, a scam ad).

**Paid, then taxed again.** "I paid money for no ads. Now they removed it and you have to pay by the day, week or month"
(Hearts+). "Why is my original subscription from over a decade ago not being honored?" (Spades+). "Been playing for years
and paid for ad-free Pro version. Where is that version now?" (Spades+). "App store claims there's a one time $20 no ad
purchase but the app itself only displays subscription options" (Euchre 3D). "I paid for this app and never knew there was
a limit to number of games to play" (Spades+). "$7.99 a month cash option is ridiculous" (Spades *).

**The partner.** "Imagine having the worst Spades partner in the world" (Spades *). "My partner puts a spade on it"
(Spades *). "If you bid NIL it doesn't have the good sense to play higher cards to save you" (Spades *). "Cut with a jack
of spade when he could've used a 2. Then when I needed it to cover my nil later on, it couldn't" (Spades+). "I will call
something and he will lead with the 10 of trump, totally taking control away from me" (Euchre 3D). "My Indiana grandmother
would flip a table playing with these partners" (Euchre 3D). The full list, one test each, is AI_SPEC.md §3-§5.

**"Rigged."** "If you get too far ahead, the game will automatically limit what cards you get" (Spades Classic). "If you
have a lead going into hand 4, you WILL get dealt horrendous cards" (Hearts+). "On the most difficult setting … the
opponents know exactly what is in everyone's hand" (Euchre 3D). "Bots cheat/collude against single player" (Hearts+).
Nobody can prove these claims, and the apps cannot disprove them; the perception alone drives one-star reviews.

**Scoring nobody can follow.** "My team completes a nil then the opponent gets credit for our score! The second issue is
the lack of explanation for the scoring" (Spades *). "Can't make sense of the scoring" (Euchre 3D).

**Rules that aren't theirs.** "No joker, joker, deuce, deuce option. I bet no Boston either" (Spades+). "This doesn't
include the Big and Little Jokers, so how is it even simulating a real game of Spades?" (Spades *). "I would like to play
with jokers and deuces wild" (Spades Classic). "Blind nil should only be allowed to bid if down 100 points" (Spades+).
"You can't modify the gameplay/conventions" (Spades *).

**No choice of partner, no way to talk back.** "You can't get a new partner. You can rename them but that doesn't change
the algorithm" (Spades *). "Should be able to tell your partner they are messing up" (Spades Classic).

**Everything else online.** Quitters, slow players, chat bans, nickname bans, ranked-points anger. None of it applies to an
offline-first app with invite-only family tables; it is a reason people want one.

**Small, loud, fiddly.** "I can barely hit the x to close it because it is so small" (Hearts+). "During play this app
highjacks the sound and beeps incessantly" (Hearts+). From the senior research: "The cards are so small I can barely read
them" (Extreme Hand and Foot); seniors' light taps on banners open websites (Vita Jigsaw).

## 3. Why they stay, and what makes them switch

- **Habit**: "I've been playing this app for years" opens a third of the angry reviews. They stay until the app breaks the
  ritual, then search "spades no ads" and read the newest reviews ("Look at the most recent reviews not the 'most
  helpful'"). We have to look familiar in the first ten seconds: a green felt, a fanned hand, the game they know.
- **They will pay**: "charge me $.99 for the app - not $4.00", "Need option to remove ads … for a reasonable price", "This
  should be a paid/ad free app". The objection is to rentals and repeat charges, not to paying.
- **Proof beats promises**: r/euchre asks for "a shuffle audit … anything besides 'deals are fair, trust us'".

## 4. P0: trust fixes (launch blockers)

| # | Fix | Where |
|---|---|---|
| P0-1 | No ad SDK, no ads, ever; the listing says so in the first line | DESIGN R7, store-check |
| P0-2 | One-time purchases only, Family Sharing, Restore on the title screen; Hearts free forever with no hand limit | DESIGN R8, §5 |
| P0-3 | Nothing interrupts a hand; no timers, no boots | R2, R10, smoke |
| P0-4 | Fair deal with the seed on every score sheet, a stats screen and a public verify page | R1, §7 |
| P0-5 | The AI sees only public information; seat-swap test; every sin in AI_SPEC as a test at every level | AI_SPEC §1, §3-§5 |
| P0-6 | Scoring shown line by line, tested against a table of outcomes | AI_SPEC S20/H08 |
| P0-7 | Big targets, no fiddly close buttons anywhere, no outbound link without a gate | R3, R9 |
| P0-8 | Sound respects the silent switch | DESIGN §13 |

## 5. P1: switch-over features (why they move to us and stay)

1. House-rule presets incl. Jokers and deuces, blind nil when down 100, minimum bid 4, Boston, 10-for-200; Hearts moon
   choice and J♦; Euchre stick the dealer and farmer's hand.
2. Pick and swap partners by name and level; separate partner and opponent levels.
3. **"Why?"** on the partner's last card: the AI's reason in one sentence.
4. Pass-and-play and family tables (Game Center invite, bots fill seats).
5. Comfort mode and the caregiver screen.
6. Resume exactly where you left off; one tap to the next deal.
7. Stats that survive (win count reset was a Vita complaint): on-device save mirrored to Preferences.
8. How-to-play generated from the active preset ("no rules or stats" — Spades *).

## 6. P2: polish

Blind nil card exchange (2 cards) as a Kitchen-table option; "Undo last card" in solo games outside family tables; deal of
the day; more felts/backs from player requests; iPad split-view; a printable score sheet.

## 7. Do not do

- No ads in any form, including "optional" rewarded ads or cross-promotion.
- No subscriptions, rentals, VIP, coins, chips, energy, hand or game limits, "free trial" timers.
- No purchase or rating prompt during a hand; no rating prompt after a loss or in Comfort mode.
- No turn timers, inactivity boots or auto-play.
- No rubber-banding, "keep it close" dealing or difficulty that reacts to the player's record.
- No AI that reads hidden cards, even at Expert.
- No chat, nicknames, moderation, ranked play with strangers.
- No changing a rule's default behaviour in an update without a preset that keeps the old one ("forced onto the new
  version" was the Blockudoku lesson in Glimmerwood's research).
- No "AI-generated" art (a Hearts+ one-star: "replaced their perfectly functional achievement images … with ai-generated
  slop"): our art is procedural and hand-directed; say "painted in code" if asked, never "AI art".
