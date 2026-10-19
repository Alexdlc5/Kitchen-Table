# Kitchen Table: everything you set up, step by step

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
| ✅ | A13. Name check | decided 2026-10-19 | **Kitchen Table** (store name "Kitchen Table: Spades, Hearts") |
| ✅ | iOS app shell (Claude) | — | Capacitor app, Game Center, family-table spike, icon and splash; simulator build green on CI (PR #6) |
| ⬜ | A3. Bundle ID + app record | 10 minutes | **next**: `io.github.alexdlc5.kitchentable`, Game Center on |
| ⬜ | A4-A6. CI key + GitHub secrets | 10 minutes | reuse the Glimmerwood API key: add the same 4 secrets to this repo; then the first upload is one command |
| ⬜ | A7. First TestFlight build | ~30 minutes | after A3 + A6: `gh workflow run ios.yml --ref main -f upload=true`; carries the GameKit spike |
| ⬜ | A8. Second device for the family-table spike | — | a family member with an iPhone/iPad, their own Apple Account and Game Center; added as a tester |
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

**Owner decision, 2026-10-19: Kitchen Table** (#2). App Store name "Kitchen Table: Spades, Hearts" (29 characters).

---

## A3. Bundle ID and app record, with Game Center (10 minutes)

1. **developer.apple.com/account** → **Certificates, IDs & Profiles** → **Identifiers** → **+** → **App IDs** → **App** → Continue.
   - Description: `Kitchen Table`
   - Bundle ID: **Explicit** → **`io.github.alexdlc5.kitchentable`** (exactly this; the app is built with it)
   - Capabilities: check **Game Center** is ticked (it is by default; In-App Purchase is always included) → **Continue** → **Register**.
2. **App Store Connect** → **Apps** → **+** → **New App**:
   - Platform **iOS** · Name **Kitchen Table: Spades, Hearts** · Language **English (U.S.)**
   - Bundle ID: pick `io.github.alexdlc5.kitchentable` · SKU `kitchentable-ios` · User access **Full Access** → **Create**.
3. Still in App Store Connect, your new app → **Services** (or **Features**) → **Game Center** → turn it **on** for the app.
   (Leaderboards come later, A14; the family-table test only needs Game Center on.)
4. **App Information** → Category **Games**, subcategories **Card** and **Board**. Age rating later (A12).

**Send Claude:** "app record made" (and the exact name, if Apple made you change it).

## A4-A6. The API key and the four GitHub secrets (10 minutes)

The **Glimmerwood key works for this app too** (one key per team, not per app). If you still have its `.p8` file and its three values,
skip straight to step 3.

1. *(Only if you need a new key)* **App Store Connect** → **Users and Access** → **Integrations** → **App Store Connect API** →
   **Team Keys** → **+** → Name `GitHub CI`, access **Admin** (so it can make signing certificates) → **Generate** → **Download** the
   `.p8` (only once!) → note the **Key ID** and, at the top of the page, the **Issuer ID**.
2. **developer.apple.com/account** → **Membership details** → copy the **Team ID** (10 characters).
3. **github.com/Alexdlc5/Kitchen-Table** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, four times:

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | Team ID (step 2) |
   | `ASC_KEY_ID` | Key ID |
   | `ASC_ISSUER_ID` | Issuer ID |
   | `ASC_KEY_P8` | open the `.p8` file in Notepad, copy **everything** (including the BEGIN/END lines), paste |

**Never paste any of these into chat.** **Send Claude:** "secrets added."

## A7. First TestFlight build (~30 minutes, mostly waiting)

1. Claude starts it (or you: **github.com/Alexdlc5/Kitchen-Table** → **Actions** → **ios** → **Run workflow** → branch `main` →
   tick **Sign and upload to TestFlight** → **Run**). From a terminal it is one command:
   `gh workflow run ios.yml --ref main -f upload=true`
2. The run first asks App Store Connect for the highest build number it has seen and stops at once if `ios/BUILD` isn't higher
   (a repeat would be rejected after a 20-minute build). Then it archives, signs and uploads (~20 minutes).
3. **App Store Connect** → the app → **TestFlight**: the build shows *Processing*, then *Ready to Test* (5-30 minutes).
   Answer the export-compliance question if asked: the app uses only standard HTTPS (`ITSAppUsesNonExemptEncryption` is already `NO`).
4. **TestFlight → Internal Testing → +** → group `Family` → add yourself. On your iPhone: **TestFlight** app → accept → **Install**.

There are no ads in this build or any other: one kind of build for testing and for the store.

## A8. A second device for the family-table test

The first TestFlight build carries the GameKit spike (DESIGN.md §9): a hidden **Family table test** that plays Hearts with two
people on two devices and two computer players, over Game Center. To open it: on the title screen, tap **"Play a game of cards at…"**
(the line above the name) **seven times**; the button appears at the bottom.

**What you need:** a family member with an iPhone or iPad, their own Apple Account, and Game Center signed in
(**Settings → Game Center**) on both devices.

1. **Add them as a tester** (no Apple review needed this way): **App Store Connect → Users and Access → +** → their Apple Account email,
   role **Customer Support** (sees nothing about money or settings) → **Invite**. Once they accept the email,
   **TestFlight → Internal Testing → Family → +** → tick them.
   *(Or: TestFlight → External Testing → new group → add their email. That needs Apple's beta review once, about a day.)*
2. They install **TestFlight** from the App Store, accept the invite, install Kitchen Table.
3. Both open the hidden **Family table test**. One taps **Invite someone** and picks the other (a Game Center friend, or by phone
   number / email in Apple's sheet); the other taps **Wait for an invitation** and accepts the notification.
4. **Pass criteria** (write down what happened and send it to Claude): connected in under 30 seconds; 3 whole hands with no "out of
   step" problems (both phones show the same scores on every score sheet); one of you leaves mid-hand (**menu → Save and leave**, or
   swipe the app away): a computer player takes that seat and the other phone finishes the hand; 10 sessions with no crash.

**Send Claude:** the result of each criterion (and screenshots of anything odd).

## A9-A11, A14

Same click paths as Glimmerwood's SETUP.md (shardgrid `docs/SETUP.md`), with these differences:

- **A9**: download `GoogleService-Info.plist` for bundle ID `io.github.alexdlc5.kitchentable` and send it to Claude (it is not a
  secret, but keep it out of chat if you can: put it in Google Drive). Until it is in the app, Firebase is never called
  (`FIREBASE = false` in `proto/platform.js`); the app builds and runs without it.
- **A10**: three **Non-Consumable** products (never Auto-Renewable, never Consumable), each with **Family Sharing** turned on.
- **A11**: RevenueCat's public `appl_…` key goes into `proto/platform.js` (`KEYS.revenuecat.ios`); empty = purchases off.
- **No** AdMob, `app-ads.txt`, UMP or ATT steps.

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
