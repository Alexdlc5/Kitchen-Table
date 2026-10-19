# Kitchen Table quality checklist

*Started 2026-10-19 (Phase 1). The bar for the review build. ✅ done and checked, ⏳ in progress, ⬜ not started.
Each item says how it is checked. Gate = a CI script fails the PR if it breaks.*

## Standards for every screen

| # | Standard | Check | |
|---|---|---|---|
| S1 | Text ≥ 15px on a phone (≥ 19px in Comfort); 4.5:1 contrast, 7:1 in Comfort | measured in smoke shots | ⏳ |
| S2 | Every tap target ≥ 44pt; ≥ 64pt in Comfort; every playable card shows a full target square of its own | **gate**: `smoke.mjs` (+ `--se --comfort`) | ✅ |
| S3 | Nothing under the notch, Dynamic Island or home bar; nothing off screen sideways | **gate**: smoke (off-screen); safe-area padding | ⏳ |
| S4 | iPhone SE (375×667), 17 Pro (402×874), Pro Max (440×956), iPad portrait and landscape | smoke runs SE and 17 Pro; iPad by hand | ⏳ |
| S5 | One look (TABLE.md): crisp vivid cards, painterly props, haze on the felt only | Phase 2 taste pass; `crisp.mjs` | ⬜ |
| S6 | No console errors; 60 fps; no black frames between screens | **gate**: smoke (page errors); `soak.mjs` Phase 3 | ⏳ |

## A. First launch and coming back
- ✅ A1 Cold start: title in under 2 s; a game in progress resumes on the same card with the same seed. *Check:* kill the app mid-hand, reopen.
- ✅ A2 One tap from the title to cards in hand (Deal: last game, last rules, last partner).
- ⏳ A3 Opt-in analytics card appears once, after the first finished game, never during a hand. *Gate:* smoke watches the hand.
- ⬜ A4 `RESET` tag in main.js gives a clean new-player test on TestFlight.

## B. The table
- ✅ B1 Only legal cards are bright and tappable; illegal ones are dimmed, never hidden. Your cards stay readable while bidding.
- ✅ B2 No timers, no auto-play, no inactivity boot. *Gate:* smoke leaves a human turn idle and checks nothing moved.
- ✅ B3 Nothing pops up between the deal and the last trick. *Gate:* smoke watches a whole hand of each game; `dialog()` refuses.
- ✅ B4 "Why?" on a bot's seat explains its last play in one sentence.
- ✅ B5 Pass-and-play: the phone is handed over behind a cover; nobody sees another player's cards.
- ⬜ B6 Card play and trick sweep animate smoothly on device (rAF/WAAPI), relaxed speed in Comfort.
- ⬜ B7 iPad landscape: score sheet docks at the side.

## C. Score sheet and results
- ✅ C1 Every point is a line item (bid, bags, nil, penalty, moon). *Gate:* `test_sim` scoring tables.
- ✅ C2 The seed and the dealer are on every score sheet; verify.html re-deals it. *Gate:* `test_sim` (same dealer.js).
- ✅ C3 Results: one tap to "Deal again".

## D. Fair deal
- ✅ D1 `dealer.js` imports nothing; `deal(seed, n)`; golden deals fixed. *Gate:* `test_sim`.
- ✅ D2 Stats screen: last 1,000 deals vs a fair deck (high cards, shapes, spades, Q♠, nil-able hands).
- ⬜ D3 verify.html live on the site, linked (gated) from the app.

## E. Bots
- ✅ E1 Every AI_SPEC sin is a scenario at every level (Easy, Standard, Expert, Extreme). *Gate:* `test_ai`.
- ✅ E2 Bots see a view only (no other hands, seed, or human flag); decisions are seat-blind. *Gate:* `test_ai`.
- ⏳ E3 100K hands per level per game; zero sins played; targets met. Numbers in RELEASE_REVIEW.md. *Gate:* `sim.mjs --check` (20K at Standard).

## F. Comfort mode and the caregiver
- ✅ F1 Hand cards 1.6×, targets 64pt, tap twice to play, bid stepper, confirm before leaving. *Gate:* `smoke --se --comfort`.
- ✅ F2 Four-color deck option; no outbound link without the hold-to-open gate; none at all under the caregiver lock.
- ✅ F3 Caregiver screen behind a PIN: lock, Comfort, games shown, straight-into-a-game, level, Guided Access steps, Family Sharing note.
- ⬜ F4 VoiceOver reads every card ("queen of hearts") and every seat. *Check:* device pass.

## G. Purchases and trust
- ⏳ G1 Only non-consumables; Family Sharing on; Restore on the title and in Options. *Gate:* `test_sim` (products), store-check (Phase 3).
- ✅ G2 Hearts free with no nags beyond the one unlock row; nothing for sale in Comfort or under the lock.
- ⬜ G3 No ad SDK in the binary; `NSPrivacyTracking` false. *Gate:* `store-check.mjs`.

## H. Sound and haptics
- ⏳ H1 Card snap, shuffle, sweep, made/set chimes; silent switch respected, with the Options override.
- ⬜ H2 Haptic on your own card and trick wins (device).

## I. Languages
- ⬜ I1 en, de, es, pt-BR, ja, ko, zh-Hans, hi with an Options override. *Gate:* `i18n.mjs check`.

## J. Performance
- ⬜ J1 Expert/Extreme decisions under 300 ms on an iPhone 12; table stays 60 fps. *Check:* device + `soak.mjs`.

## K. Store and launch
- ⬜ K1 Listing ×8 under limits; 6 screenshots 1206×2622; 2 previews; search asset. *Gate:* store-check.
- ⬜ K2 SUBMISSION.md: privacy labels match PrivacyInfo.xcprivacy; age 4+; review notes explain the unlock and fairness page.
