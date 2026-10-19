# Kitchen Table (working title): everything you set up, step by step

The owner's step list. Same shape as Glimmerwood's SETUP.md, minus everything about ads (no AdMob, no `app-ads.txt`, no UMP,
no ATT). You don't need a Mac: GitHub's Macs build and upload the app.

**Never paste these into chat:** App Store Connect `.p8` key files. They go straight into GitHub secrets (A6) or RevenueCat.

## Status

| | Step | Wait | Status |
|---|---|---|---|
| ✅ | Contact email | — | pubshiftsupport@gmail.com (same as Glimmerwood; change if you want a separate inbox) |
| ⬜ | Public website | — | `site/` (privacy, terms, support, verify.html) on GitHub Pages; Phase 5 |
| ✅ | A1. Apple Developer Program | — | already active (Glimmerwood) |
| ✅ | A2. Agreements, tax, banking | — | already active (Paid Apps agreement) |
| ⬜ | **A13. Name check** | 5 minutes | **your choice of name needed now** (below) |
| ⬜ | A3. Bundle ID + app record | 10 minutes | after A13; tick **Game Center** on the bundle ID |
| ⬜ | A4-A6. CI key + GitHub secrets | 10 minutes | reuse the Glimmerwood API key: add the same 4 secrets to this repo |
| ⬜ | A7. First TestFlight build | ~30 minutes | after A3/A6; carries the GameKit spike |
| ⬜ | A8. Second device for the family-table spike | — | a family member with an iPhone/iPad and their own Apple Account, willing to install TestFlight |
| ⬜ | A9. Firebase (iOS app) | 10 minutes | new iOS app in your Firebase project; Analytics + Crashlytics (off until the player says yes) |
| ⬜ | A10. In-app purchases | 15 minutes | `everything` $6.99, `backs_porch` $1.99, `felts_home` $2.99; all **Non-Consumable**, **Family Sharing on** |
| ⬜ | A11. RevenueCat (iOS) | 10 minutes | new project or app; entitlements `everything`, `backs_porch`, `felts_home` |
| ⬜ | A12. Listing, privacy labels, review | 1-2 days review | Phase 6 |
| ⬜ | A14. Game Center leaderboards and achievements | 15 minutes | 2 leaderboards + 10 achievements (DESIGN §10) |

---

## A13. Name check

The working title "Kitchen Table" sounds warm but doesn't say "card games". Five candidates that do, each checked on
**2026-10-19** by Claude (App Store search API, US; USPTO trademark search, live marks in classes 9 software, 28 games,
41 entertainment). *A desk search, not legal advice; before spending on a filing or a launch push a trademark attorney
should confirm.*

The App Store name would be "**<Name>: Spades, Hearts**" (≤ 30 characters), changing to "…: Spades, Hearts, Euchre" in the
subtitle when Euchre ships.

| # | Name | App Store (US) | USPTO (live, 9/28/41) | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **Hometown Card Games** ("Hometown Cards: Spades, Hearts") | nothing named Hometown in cards | "HOMETOWN CARD(S)": none live. "HOMETOWN" alone: reg. 90655924, Rush Street Interactive, online sports betting (41); other Hometown marks are films/podcasts | Low-medium | **Claude's pick.** Says "the games you grew up with" without a regional slant; works for Spades, Hearts, Euchre, Canasta alike. |
| 2 | **Kitchen Table Cards** ("Kitchen Table: Spades, Hearts") | nothing in Card | "KITCHEN TABLE CARDS": none. "THE KITCHEN TABLE" reg. 99308960 (seminars, 41); "THE DIGITAL KITCHEN TABLE" 99867124 (AI software, 9, pending publication) | Low | Warmest; the existing art direction is built on it. Least explicit about "American". |
| 3 | **Americana Card Club** | nothing | "AMERICANA CARD": none. "AMERICANA" reg. 97184020, IGT, wagering gaming machines (28) | Medium | Most literal "American". IGT's mark is casino hardware, but it is class 28. |
| 4 | **Card Night America** | nothing named Card Night (closest: "Poker Night in America", 4.5K) | "CARD NIGHT": no live marks | Low | Explicit, plain; slightly generic, harder to protect. |
| 5 | **Sunday Card Table** | "Solitaire Sunday" (30K ratings) is adjacent | "SUNDAY CARD": one live mark, not in 9/28/41 | Low-medium | Matches the "Sunday with Mom" hook; less clearly American. |

**Rejected:** "Front Porch Cards" (the PROPOSAL backup): live **FRONT PORCH CLASSICS**, reg. 86508113, University Games,
*board and parlor games* (class 28), plus FRONT PORCH reg. 87183402, *computer training for seniors* (41): too close on both
counts. "Stars & Spades": "Spades Stars" on the App Store (50K ratings). "House Rules": live HOUSE RULES reg. 86895306,
*game cards* (28). "All-American Card…": live "MIXED COMPANY THE ALL-AMERICAN CARD GAME!" (28). Anything "Trick-"
(Trickster, TrickSmith, Trickpad exist).

**Your step (5 minutes):** pick one (or send your own and Claude checks it the same way). Optionally confirm on
**tmsearch.uspto.gov** by searching the exact name. **Send Claude:** the name.

---

## A3-A7, A9-A11, A14

Same click paths as Glimmerwood's SETUP.md (shardgrid `docs/SETUP.md`), with these differences:

- **A3**: bundle ID `io.github.alexdlc5.<name>`; capabilities: **Game Center**, **In-App Purchase**. Category Games › Card,
  secondary Games › Board. Age rating 4+.
- **A6**: the four secrets (`APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`) go in this repo:
  github.com/Alexdlc5/Kitchen-Table → Settings → Secrets and variables → Actions. The Glimmerwood key works for both apps.
- **A10**: three **Non-Consumable** products (never Auto-Renewable, never Consumable), each with **Family Sharing** turned on.
- **No** AdMob, `app-ads.txt`, UMP or ATT steps.

Detailed steps are written into this file as each phase reaches them.

## What Claude does with each answer

| You send / do | Claude does |
|---|---|
| the name | puts it in `sim/generator.json → brand`, the listing, the site, the icon wordmark |
| "objections" / "go" on DESIGN.md + AI_SPEC.md | adjusts, then starts Phase 1 (sim and rules engines) |
| "secrets added" + app record | builds the iOS shell with the GameKit spike and uploads to TestFlight |
| a second tester's Apple Account email (for TestFlight) | adds them to the internal group for the family-table test |
| `GoogleService-Info.plist` | adds opt-in Analytics + Crashlytics |
| RevenueCat `appl_…` key | turns on the unlock, cosmetics and Restore; sandbox test |

## Repo visibility

Private at rest. Public during build days (GitHub Actions minutes), **private again before stopping** (playbook §3).
