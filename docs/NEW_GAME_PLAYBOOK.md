# New game playbook: from an idea to TestFlight and a release checklist

Written after shipping Glimmerwood (Alexdlc5/shardgrid, October 2026). Hand this file to Claude together with a one-paragraph
game idea. Claude then builds the game the way Glimmerwood was built, applies the owner's standing taste rules without being asked,
takes it to a TestFlight build the owner can play, and produces the release checklist at the end of this file filled in for the new game.

How to use it, as the first message of a new session:

> Here is my game idea: <idea>. Follow docs/NEW_GAME_PLAYBOOK.md from the Glimmerwood repo. Build it to a TestFlight build and give me
> the release checklist.

Everything below is what worked, what broke, and what the owner changed by hand so it never has to be asked for again.

*Version 2, October 2026: updated after the second game, Kitchen Table (Alexdlc5/Kitchen-Table), with the expert
passover (Phase 2b), the lead's rules for working as a team (§2a), the owner's new taste rules (end of §3) and the traps
met on the way (end of §4).*

---

## 1. The shape of the project (reproduce this)

**Stack (owner's choice; don't re-open it):** a web game wrapped with Capacitor, iPhone first, portrait only. No engine, no framework,
no bundler. Plain ES modules and one `index.html`. Android is "later".

```
proto/            the game: index.html (markup only), main.js (screens, flow), game.js (rules, pure), art.js (procedural SVG art),
                  paint.js (character/shape toolkit), style.css, music.js (synth, no audio assets), ambient.js, story.js,
                  platform.js (ads, IAP, analytics, Game Center behind one object), i18n.js + lang/*.json, daily.js
sim/              generator.json (every tunable number: timers, mine costs, drop weights, values), sim.py + test_sim.py (balance sim)
scripts/          build-web.mjs, crisp.mjs, smoke.mjs, soak.mjs, i18n.mjs, store-check.mjs, store-shots.mjs, search-asset.mjs,
                  scene-check.mjs, play.mjs (LAN dev server), ad/render.mjs (trailers), app-art.mjs (icon/splash)
ios/              Capacitor iOS project (SPM), ios/BUILD = the build number, PrivacyInfo.xcprivacy, Info.plist
docs/             SETUP.md (owner's account steps), STORY.md, ART_STYLE.md, QUALITY_CHECKLIST.md, RELEASE_REVIEW.md,
                  PLAYER_RESEARCH.md, store/ (listing JSONs, screenshots, SUBMISSION.md), ad/ (trailers)
.github/workflows web.yml (gates), ios.yml (TestFlight/App Store upload), android.yml (APK), sim.yml
site/             index.html, privacy.html, terms.html (GitHub Pages: support + privacy URLs the store needs)
```

**Dependencies that are known to work together** (pin to what the Glimmerwood repo has):
`@capacitor/core ios android preferences haptics splash-screen`, `@capacitor-community/admob`, `@capacitor-firebase/analytics
crashlytics remote-config`, `@revenuecat/purchases-capacitor`, `@fontsource/fredoka grandstander`; dev: `playwright`, `@resvg/resvg-js`.

**Principles the code follows (owner-approved, keep them):**
- The dealer/RNG never reacts to ads, purchases or how close the player is to a record. Assert it in a test ("fair dealing" is on the listing).
- No account, save on device (`localStorage` mirrored to Capacitor Preferences; `scripts/check-save-mirror.mjs` keeps the mirror honest).
- All numbers that tune feel live in `sim/generator.json`, read by both the game and the simulator.
- English text is the i18n key. Every player-facing string ships in 8 languages or CI fails.
- Nothing is painted by hand: art is procedural SVG/canvas so it can be re-rendered at any size for icons, screenshots and ads.

---

## 2. Phases, in order

### Phase 0: idea to design doc (one session, before any code)
1. Write `docs/STORY.md` (world, characters, progression rings, what unlocks what, "where the story lives in the game" checklist) and a
   short mechanics spec. Keep names unique: search the App Store for every character and mine name and rename clashes (Glimmerwood
   renamed Pip Gemwalker → Dibble, Bramble → Old Puddock for this reason).
2. Do the player research pass (`docs/PLAYER_RESEARCH.md` pattern): read reviews of the top 5 games in the genre, list the complaints,
   turn them into P0 trust fixes, P1 switch-over features, P2 polish, and a "do not do" list.
3. Trademark check on the title (5 minutes, record the findings in SETUP.md A13).
4. Pick the two trailer hooks now ("one more" and "cozy" for Glimmerwood); the ad script is cheap to write while the design is fresh.

### Phase 1: playable web prototype
- `npm run play` serves it on the LAN so the owner can try it on the phone every evening. Owner tests on the phone, not in a browser.
- Build the balance sim first (`sim/`), tune in JSON, then build the board. `npm run check` = rules tests + save-mirror + sim tests.
- Write rules and AI once, in the game's own JS modules, and point the sim at them (see §4, Kitchen Table): the numbers
  then describe the code that ships.
- Put the quality bar in `docs/QUALITY_CHECKLIST.md` from day one (sections A–M in Glimmerwood: first launch, camp, sheets, board, end
  of dig, story, ads/purchases/trust, sound/haptics, art audit, performance, accessibility, store presence, launch config).

### Phase 2: the owner's taste (apply automatically; see §3)

### Phase 2b: the expert passover (a team review, then an overhaul)

Run it once the game is playable end to end (after Phase 2), and again before the review build (after Phase 5). One person
building alone stops seeing the product the way its community will; a passover of independent experts catches what the
builder can't. It is cheap because the reviewers run in parallel and never touch app code.

1. **The lead starts the reviewers as parallel sessions**, each in its own git worktree on its own branch, cut from the
   latest green branch (even one not yet merged). Each reviewer is read-only on app code and delivers one document:
   - **UX, accessibility and look (community lens):** walks every screen with Playwright at iPhone SE, 17 Pro and iPad,
     Comfort/large text/Reduce Motion on and off, and as a new player (`?locked`); judges against DESIGN.md, the owner's
     taste rules (§3) and the target audience; checks VoiceOver semantics, contrast, tap targets, overlaps, copy tone,
     first-run clarity. Deliverable: `docs/REVIEW_UX.md` with screenshots.
   - **Rules, AI and fairness (genre-expert lens):** compares every rule and preset with how people actually play
     (pagat.com, club and online rules, regional house rules); plays thousands of hands in the sim and prints positions a
     strong player would criticise; looks for new AI "sins"; checks the fair-deal proof. Deliverable:
     `docs/REVIEW_RULES.md` plus `sim/test_ai_review.mjs`, new scenario tests that FAIL until fixed (kept out of CI).
   - Optional, by game: a **monetization and store reviewer** (does the shop feel fair, would the listing convert, any
     dark patterns), a **performance reviewer** (old-iPhone frame times, memory, battery), a **localization reviewer**.
2. **Every finding has the same shape:** P0 (blocks launch) / P1 (fix before launch) / P2 (polish); the screen or rule;
   what's wrong; why it matters *for this audience*; the concrete fix; evidence (screenshot, position, sim number).
   Each review ends with "the 10 changes I'd make first".
3. **The lead turns the reviews into one overhaul plan** (`docs/OVERHAUL.md`): merge duplicates, rank by player impact,
   group by the files they touch, and give each group to one developer session (two writers never share a file).
   The failing review tests become the developers' acceptance tests.
4. **Close the loop:** when the overhaul PRs are green, re-run the reviewers on the merged build; the passover is done
   when no P0/P1 remains. Record the before/after in `RELEASE_REVIEW.md`.

Brief template for a reviewer session (paste and fill in):

> You are the <role> reviewer on a small game team. Review <game> the way its real community will: <audience>. Do NOT
> change app code; your deliverable is <doc> (+ failing tests if any) for the lead to turn into an overhaul plan.
> How: <exact commands: build, debug hooks, sizes, modes>. Judge against: <docs, owner taste rules, product rules>.
> Write findings as P0/P1/P2 with screen/rule, problem, why it matters for this audience, fix, evidence; end with the
> 10 changes you'd make first. Done = <doc> on your branch, PR titled "Review: …", CI green, a 5-line summary in the
> shared notes folder. Do not merge.

### Phase 3: gates and CI (before the first TestFlight build)
`web.yml` on every PR: `crisp.mjs --check 2` (block edges ≤ 2 device px at 3x, measured with bevel off), `smoke.mjs` (13 screens ×
WebKit + Chromium, also `--se` for iPhone SE and `--lang xx`), `soak.mjs --minutes 10` (memory/FPS over time), `i18n.mjs check`,
`store-check.mjs` (listing limits, 8 locales, screenshot count, privacy manifest sanity). `ios.yml` builds the simulator app on every
push to main. A PR is merged only when all are green.

### Phase 4: Capacitor + TestFlight
- `ios.yml` with `workflow_dispatch` inputs `upload` (sign + upload) and `appstore` (real ads instead of test ads). Build number comes
  from the file `ios/BUILD`, bumped in the PR that needs a new build; a guard refuses a number ≤ the last one Apple saw.
- Secrets the owner adds in GitHub (never pasted in chat): `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`.
- Upload: `gh workflow run ios.yml --ref main -f upload=true` (test ads, for the owner) or `-f upload=true -f appstore=true` (the
  review build). ~20 min on the macOS runner, then 5–10 min of Apple processing before it appears in TestFlight.
- The owner's internal TestFlight group gets every build automatically.
- For an "as a new player" test: bump the one-off `RESET` tag in `main.js` (wipes the save once per device, keeps coin-pack payouts).

### Phase 5: store listing and assets (all generated from the game)
- `docs/store/listing.<locale>.json` ×8, kept under Apple's limits by `store-check.mjs` (name 30, subtitle 30, promo 170, keywords
  100 bytes, description 4000).
- `store-shots.mjs` renders 6 screenshots from staged game states with a painted caption band: `--size 6.1` (1206×2622) is the size
  App Store Connect's "iPhone with Dynamic Island (medium display)" slot requires; 6.9" (1320×2868) is not accepted there.
- `scripts/ad/render.mjs` renders two 9:16 trailers (TikTok/Shorts), 16:9 (YouTube), and the 886×1920 App Store previews with no
  store line (Apple disallows price/store references in previews).
- `search-asset.mjs` renders the 3840×2560 "Search Results" asset (wordmark + tagline + hero + phone with a staged board).
- `app-art.mjs` renders the icon and splash from the character art.
- `docs/store/SUBMISSION.md`: privacy-label answers (must match `PrivacyInfo.xcprivacy` and the SDKs), age rating answers, App Review
  notes, IAP review screenshot, guideline pre-check, owner's click-by-click steps.

### Phase 6: submission (details and traps in §4)
### Phase 7: ads and launch (§4, "Google Ads")

---

## 2a. Working as a team (the lead's rules)

When the owner says "delegate" or "think like a team leader", Claude becomes the lead and splits independent work into
parallel sessions. What made that work on Kitchen Table:

- **One owner per file.** Give each session a disjoint set of files (a new game in new modules; the iOS shell in `ios/`;
  CI gates in `scripts/` and `web.yml`). Where they must share a file (main.js's game registry, generator.json, sim.mjs),
  tell both to keep those edits small and self-contained; the lead resolves the merges.
- **Branch from the newest green work**, even an unmerged PR (`source_branch`), so nobody builds on an old look.
- **The lead owns the repo's visibility and the merge order.** Sessions never change visibility and never merge.
  Merge order: shared foundations first (look, gates, platform), then features, then games; re-run the full gate after
  each merge.
- **Every brief is self-contained:** the task, the files, what "done" is, the product rules, the owner's taste rules,
  the process (own branch, PR, CI green, co-author line), the OneDrive traps, and which other sessions run in parallel.
- **A shared notes folder** for 5-line summaries and hand-overs, so results don't live only in chat.
- **Keep CPU-heavy work in one place.** Several sessions plus a long sim on one PC slow every smoke run; tell sessions to
  use `--workers 8` and other ports than the LAN server's.
- **Stacked PRs:** deleting a PR's head branch on merge *closes* a PR stacked on it (it does not retarget). Merge the
  base without `--delete-branch`, or retarget the stacked PR to main first.

## 3. The owner's standing preferences (do these without being asked)

These are the things the owner changed by hand on Glimmerwood. Apply them from the start on the next game.

**Art and look**
- Painterly storybook, not rubber-hose: curved shapes, tinted shadow-side lines instead of black ink, soft two-light shading, fur
  tufts in the silhouette, simple slightly-small pie eyes (the owner rejected glossy "higher quality" eyes), soft nose, no outline on
  the muzzle. The toolkit is `proto/paint.js`; reuse it.
- Lighting: a lo-fi "golden hour haze" graded into backdrops and menus only. **The playing pieces stay fully saturated and must stand
  out** ("keep the blocks vibrant as ever").
- No stray shadows or seams on props (the camp stump had a back shadow and a line at the roots; the owner spotted both on the phone).
- Nothing important behind the UI: the hero character and the fire must not sit behind the tent or under a card. Cards/sheets opened
  over the title must stack above the title hero (`body:has(.sheet.show, #rescueOffer.show) #dibbleArt { z-index: auto }`).
- Characters that stand together at camp are drawn at the same height (Granny and Puddock were scaled to Dibble's box).
- Crisp on iPhone: the board canvas is rebuilt at device pixels; a WebKit 1x layer blurred it once. CI measures edges.
- Smooth: every looping animation runs on `requestAnimationFrame`, never a 24 fps `setInterval` (the embers looked choppy next to
  the pets). Skip work for hidden layers instead of lowering the rate.
- Menus: no black boxes during transitions, no choppy screen wipes (the iris wipe is one canvas, not a huge box-shadow element).

**Feel and systems**
- Sound works with the ring/silent switch respected by default, plus Options › "Play sound when the phone is on silent"; a one-time
  tip explains it. Audio context is rebuilt on the first tap after backgrounding.
- Performance pass before release: cache static backdrops, lazy-load reverb, measure with `soak.mjs`.
- Collectible pacing: rare finds get a little rarer as the player collects more (15% → 10% per tray over the set), "not by much".
- Tell the player when something unlocks (a toast "New map at Old Puddock's: X" when a gated mine becomes buyable). Silent unlocks
  were a complaint.
- Daily mode, calm (no timer) mode, Game Center leaderboards (3: best run, collectibles, daily), optional rewarded ads only, one
  "Remove ads" purchase, consumable coin packs that never touch the dealer.
- Languages: en, de, es, pt-BR, ja, ko, zh-Hans, hi with an Options override. Keep 2-character CJK keywords allowed in store-check.

**Telemetry and trust**
- Opt-in analytics: a consent card on the first Play ("Help make <game> better?" / "Yes, share" / "No thanks"), a toggle in Options,
  Firebase Analytics + Crashlytics start OFF in Info.plist and are enabled only after "yes"; the answer itself is logged once as
  `consent`. Log `banner_failed` with the AdMob code so "no banner" can be diagnosed.
- ATT prompt and the UMP consent form stay separate from the telemetry card.
- Privacy policy page on the site lists analytics and crash reports.

**Process**
- Owner tests on the phone; send screenshots of bugs to Google Drive, Claude reads them from there.
- Merge via PRs with green CI; the owner says when to merge or "merge all branches". Commits end with the Claude co-author line.
- Repo is private at rest. GitHub Actions won't run on this account's private repo (billing), so: make it public for the working day,
  **private again before stopping**. Say so in the wrap-up every time.
- The owner's legal name is the App Store seller (individual account). A studio name needs an LLC + D-U-N-S + Apple conversion;
  the owner chose to launch under the legal name. Don't re-raise it.
- Keep `docs/SETUP.md` as the owner's step list with a status table, and a `RELEASE_REVIEW.md` for each release pass (P1/P2/checked).

---


**Added after Kitchen Table (October 2026): taste and product rules the owner gave on the second game**
- **Warm, comforting, a little nostalgic, quietly luxurious**: "people getting home from work, make them feel pampered".
  Luxury means fine materials and calm, never gold everywhere.
- **Real materials, not generic app UI.** Panels are card stock (paper grain, a printed rule inset from the edge), buttons
  are letterpress with a little thickness and a pressed state, the main action is an engraved brass plate, switches are
  brass knobs in a recessed track, labels are tent cards. One shadow scale for everything, so it all sits on one table
  under one lamp. The owner called the first, rounded-pill version "AI generated".
- **One type family with character**, not the stock serif-plus-sans pair (Fraunces + Figtree read as generic). Kitchen
  Table uses Alegreya + Alegreya Sans. Use **lining figures** for scores and numbers (old-style figures looked uneven).
- **Drawn icons, never emoji**, in the UI.
- **Menus are places** where the activity really happens (a games cupboard of tuck boxes, a corkboard leaderboard, a
  spiral score pad with a rubber stamp, recipe cards for rules, a note on the fridge for the caregiver), and **every
  screen has a small moment of joy** (steam from a cup, a box lid that tips open, a rosette on a win).
- **Accessibility for every feature**: text size, Comfort mode, VoiceOver labels and a live region announcing every
  play, a "read aloud" mode with the phone's voice for blind players who don't use VoiceOver, vibration cues, Reduce
  Motion respected, 44pt (64pt in Comfort) targets, nothing important hidden in a sideways scroller.
- **Sounds soft and airy** ("windy"): filtered breath and slow swells, never clicks or beeps.
- **Shop structure**: a thank-you note at the top and after each purchase; "Your tables" (everything unlocked, never
  labelled "free"); a mix-and-match picker for owned card backs, front and centre; only unowned items for sale; tiers
  ($2.99 / $4.99 / a luxe row at $9.99). Themes the audience actually likes (gingham, cabin, diner, chintz, antique
  parlor, leopard, mid-century, leather & brass, whiskey & shells, gold, silver, art deco, postmodern, marble). Patterns
  must look like the real thing (leopard = broken black rosettes around tawny cores).
- **A no-ads variant of the business model** (Kitchen Table): free core game, one permanent "Everything" unlock, cosmetic
  non-consumables, Family Sharing on, no ad SDK in the binary (`store-check` enforces it), opt-in analytics only.

## 4. Problems met repeatedly, and the fix that worked

**Build and CI**
- *CI "fails" in 2 s right after the repo goes public*: the runs were queued while private. `gh run rerun <id>` for each.
- *WebKit smoke flakes on "iris not shown"*: fixed sleeps raced the screen wipes (a wipe asked while one runs is dropped). Wait on
  what the game shows (`until(() => shown && wipeSettled)`), never on fixed timers.
- *`gh run watch` dies on GitHub 502s*: poll `gh run view --json status` in a loop instead.
- *Logs of a failed job are unavailable until the whole run finishes*: `gh api repos/.../actions/jobs/<id>/logs --allow-escape-sequences`.
- *The crisp gate flaked once the haze landed*: measure edges with the bevel/haze off.
- *Build numbers only go up*: 111 was burned by an old run-counter; `ios/BUILD` is explicit and guarded.
- *macOS minutes*: a private repo bills 10× for macOS; another reason the repo is public during build days.

**Code gotchas (Windows + OneDrive checkout)**
- Files are CRLF in the working copy; `perl -0pi` with `\n` anchors silently doesn't match. Use a Node script and detect `\r\n`.
- `node --check` passed a file whose line comment swallowed the rest of a ternary (`? // comment` + template literal). Put comments at
  the end of the line, then run the real boot test (`console_probe`: load `www/index.html?debug`, assert `window.gw`).
- `export const` must be top level; an `export` pasted inside a function is a syntax error only at runtime in the bundle.
- `git` prints "failed to delete .git/worktrees/..: Permission denied" on OneDrive; harmless. Never bare `git stash` (shared stack):
  use `git stash push -u -m tag`, apply by SHA, drop by tag.
- JSON lang files use 1-space indent; `JSON.stringify(d, null, 1)` or the diff touches every line.
- A new DOM id used by `main.js` must exist in `index.html` (`optRow` only fills existing buttons); otherwise `onclick of null` at boot.
- Reusing a shared card (`#rescueOffer`) for a new dialog: save and restore its button handlers and text, and hide the card
  explicitly (`show(null)` doesn't touch it). The smoke gate caught both.

**App Store Connect (Claude in Chrome)**
- Accessibility refs go stale after every re-render; `find` again before each click. Screenshots of some ASC tabs time out
  ("renderer frozen"); use `get_page_text`/`find`, or open a fresh tab. Small windows break layouts; use a maximized tab.
- `file_upload` needs files inside the repo (Desktop/Drive paths are refused). Keep assets under `docs/store/` and `docs/ad/`.
- The build row's remove button is hover-only: hover the row, zoom, click the red minus by coordinate. Then "Add Build" → radio → Done → Save.
- Saving a textarea with `form_input` didn't register for Description; click into it, `ctrl+End`, type.
- "Add for Review" on a version or an IAP opens a chooser: pick the existing **Draft Submission** so the version and all IAPs go as
  **one** submission (a first consumable IAP must ship with a version; 5 IAPs sat alone in a draft and blocked "Submit").
- **Order matters:** with no draft open, "Add for Review" on the version submits it straight away, alone. Put the IAPs in a draft first
  (IAP page → Add for Review → Create New Submission, then the others → that draft), then the version → that draft → Submit (6 items).
- Product-page assets lock while the version is Waiting for Review; to change one, cancel the submission, change it, resubmit.
- Check every generated store asset **at full size** (shrink the real PNG to look at it). The 3840×2560 search asset went to Apple
  with black bands and no wordmark while its 1x preview looked fine (2x capture over the running game; fixed in search-asset.mjs).
- A rejected submission must be **cancelled** (submission page → Cancel Submission → Confirm) before the version can rejoin a draft.
- Validation at "Add for Review" asked for: a screenshot in the Dynamic Island (medium) slot (1206×2622), a price tier (Add Pricing →
  $0.00 → Next → Next → Confirm; Set Up Availability → All countries → Confirm), and "Sign-in required" unticked (it was ticked by
  default with empty fields).
- Leaderboards live on /distribution/gamecenter as "Prepare for Submission" and travel with the version; nothing to attach on the version page.
- "Invalid Binary" after submission is explained **only by Apple's email** to the ASC account (not in ASC). Glimmerwood's was
  **ITMS-91064**: `NSPrivacyTracking true` with empty `NSPrivacyTrackingDomains`. Our manifest now says `false` and leaves the ad
  SDK's tracking to the SDK's own manifest; `store-check.mjs` guards it.
- Test ads vs real ads: TestFlight builds use test units; the review build is built with `appstore=true`. Real units show "no fill"
  until the app is live and linked in AdMob, and the owner's own sandbox account owns "Remove ads", so the owner won't see banners.
- Apple processing: 5–10 min; automated binary checks: ~4 min after submit. Human review: 1–2 days. "Manual release" means approval
  does not publish; the owner presses Release.

**Google Ads**
- An App campaign cannot find an app until it is live on the App Store (lookup by store ID returns nothing). Publish first.
- Use the owner's second Google Ads account (not the PubShift one); $50 lifetime cap = daily budget × end date; create paused.
- Identity/D&B verification forms are the owner's to fill; leave them open with autocomplete, don't submit.

**Session hygiene**
- Usage limits hit mid-batch: keep a resume point in memory (what's saved, what's unconfirmed, exact next clicks).
- Drive screenshots: open the `viewUrl` in Chrome and screenshot it (cheaper than downloading base64).

---


**Added after Kitchen Table (October 2026)**

*Research and naming*
- Apple's new App Store pages no longer list in-app purchases; the review RSS still works
  (`itunes.apple.com/us/rss/customerreviews/page=N/id=ID/sortby=mostrecent/json`, 50 per page, 10 pages).
- USPTO trademark search: `POST /prod-stage-v1-0-0/tmsearch` with an Elasticsearch body (field `WM`), run from a
  tmsearch.uspto.gov page in the browser (same origin); plain curl is refused.
- Reddit is blocked from this machine; quote r/ threads from earlier research instead of fetching.

*Game logic and bots*
- **Write the rules and bots once, in JS**, and run the sim on the game's own modules (Node `worker_threads` on all
  cores). A second Python implementation measures a different AI than the one that ships.
- **Bot "sins" as predicates + a guard.** Every complaint from reviews becomes `sins(view, action)`; the bot's choice is
  replaced by a clean one if it sins. A predicate must only fire when a clean alternative exists, or the sim reports
  phantom "sins". Track both "raw sins the guard caught" and "sins shipped": shipped > 0 means two predicates
  contradict each other in some position (Spades: cover partner's nil vs keep the opponent's nil trapped).
- **Bots see a view, never the state**: whitelist the view's keys in a test, assert no other hand's card appears in it,
  and assert decisions don't change when the table is rotated (no "which seat is human").
- **Golden deals**: cross-check the shuffle against an independent re-implementation once, then pin a few outputs in
  tests so the public verify page can never drift.

*Web UI*
- `[hidden] { display: none !important; }`: a class with `display: grid` otherwise beats the hidden attribute (an
  empty dialog covered the title).
- An object literal of template strings evaluates every entry (``{ nil: `${seat.name}` }[kind]`` crashed on lines
  without a seat); use a switch.
- The CSS `font` shorthand resets `font-variant-numeric`; set lining figures with `* { … !important }` or after it.
- Never let an animation block the game loop: race `animation.finished` against a timeout and `finish()` it
  (headless WebKit on CI stalled the deal animation and the hand was measured mid-flight).
- Smoke gates that paid for themselves: no overlapping controls, nothing covering the hand or the trick, every hand
  card shows a full tap-target square and a readable corner, a whole hand per game with no overlay, sizes default /
  `--se` / `--comfort` / `--ipad`, and measure only once the game is waiting for the player.
- Sideways-scrolling rows hide content from older players and fail the off-screen check; wrap them instead.

*Windows / OneDrive / scripting*
- Node edit scripts: inside a bash heredoc, `${…}` in template literals and `\r\n` escapes get mangled; write the
  script to a file with the editor tool, then run it. Normalise CRLF (`.replace(/\r\n/g, "\n")`) before matching.
- `npm run play -- --watch` rebuilds `www/` on every edit and races a manual build (EPERM on `rmSync`): retry after a
  pause, or stop the watcher.

## 5. Tools and commands (cheat sheet)

```
npm run play                                   LAN dev server for phone testing
npm run build                                  www/ bundle (build-web.mjs; GW_APPSTORE=1 turns test ads off)
npm run check                                  rules + save mirror + sim tests
node scripts/crisp.mjs --check 2               edge sharpness gate
node scripts/smoke.mjs [--se] [--lang ja]      every screen, WebKit + Chromium
node scripts/smoke.mjs --se --comfort | --ipad (Kitchen Table) + overlap, covered-hand, tap-square and no-overlay checks
node sim/sim.mjs --all --hands 100000         (Kitchen Table) bots vs bots on all cores; --ladder, --custom rule=value
node scripts/soak.mjs --minutes 10 --check     long-run stability
node scripts/i18n.mjs extract | check          string keys → lang/*.json; untranslated text fails
node scripts/store-check.mjs                   listing limits, locales, screenshots, privacy manifest
node scripts/store-shots.mjs --size 6.1        6 App Store screenshots (1206×2622)
node scripts/search-asset.mjs                  3840×2560 search-results asset
node scripts/ad/render.mjs [--cut cozy]        trailers + App Store previews
gh workflow run ios.yml --ref main -f upload=true [-f appstore=true]
gh run watch <id> --exit-status                (fall back to polling gh run view --json status)
gh repo edit <repo> --visibility public|private --accept-visibility-change-consequences
```

Throwaway Playwright proofs (serve `www/`, load `index.html?debug`, use `window.gw`) are the fastest way to verify a change: boot with
no page errors, a count of distinct animation frames, a stubbed Firebase that counts `logEvent`, a seeded save (`reset` tag must match)
that triggers one flow. Keep them in `$TEMP`, not the repo, unless they become a gate.

Owner-facing: `docs/SETUP.md` (accounts, keys, what to paste where), `docs/store/SUBMISSION.md` (click-by-click), the TestFlight app.

---

## 6. What the owner does (accounts, money, identity; Claude cannot)

Apple Developer Program ($99), Agreements/tax/banking (needed for IAP), App Store Connect API key → GitHub secrets, AdMob app + 3 units
+ `app-ads.txt` on the site, Firebase project + `GoogleService-Info.plist`, RevenueCat app + products + sandbox tester, Game Center
leaderboards in ASC, App Privacy "nutrition labels" published, signing in to ASC/Google in Chrome, pasting Apple's rejection emails,
Google Ads identity verification, pressing Release. All listed with status in `docs/SETUP.md`.

---

## 7. Release checklist (Glimmerwood v1.0, as done and as planned; fill in for the next game)

**Done before the review build**
- [x] Design: STORY.md, player research brief, unique names, trademark check
- [x] Core loop, 11 mines, daily mode, calm mode, story/memories, pets, camp, wardrobe, market
- [x] Balance sim in `sim/`, generator ad-blind (asserted)
- [x] Art: painterly storybook pass, lo-fi haze (pieces vivid), crisp canvas, camp layout fixes, same-height characters
- [x] Animation on rAF; perf pass (backdrop cache, lazy reverb); sound on silent switch option
- [x] 8 languages + Options override; i18n gate
- [x] Opt-in telemetry (consent card, Options toggle, SDKs off until yes, `consent` + `banner_failed` events)
- [x] Ads: banner (menus only), paced interstitials (grace 3, every 2nd, 90 s gap, Remote Config), rewarded (optional); UMP + ATT
- [x] IAP: Remove ads + 4 coin packs via RevenueCat; Restore purchases; sandbox-tested
- [x] Game Center: 3 leaderboards
- [x] CI gates: check, crisp, smoke (+SE, +lang), soak, i18n, store-check (incl. privacy manifest)
- [ ] Expert passover (Phase 2b): REVIEW_UX.md and REVIEW_RULES.md written by parallel reviewers, OVERHAUL.md
  from the lead, overhaul PRs merged, a second passover with no P0/P1 left
- [x] TestFlight loop: 95 → 116; owner tested 113 as a returning player and 114 as a new player (RESET tag)
- [x] Site: privacy policy (analytics named), terms, support page

**Store (App Store Connect)**
- [x] App record, bundle ID, SKU, categories Games/Puzzle/Casual, age rating 4+, Content Rights yes
- [x] Listing text ×8 locales under limits; owner's indie-developer note in the English description
- [x] 6 screenshots (1206×2622) + 2 previews (886×1920) in the Dynamic Island slot; search-results asset 3840×2560
- [x] App Privacy published; `PrivacyInfo.xcprivacy` consistent (tracking false; ad SDK declares its own)
- [x] Price Free; availability 175 countries; Sign-in required off; review notes + contact; IAP review screenshot
- [x] Build 116 (real ads, `appstore=true`) attached; version + 5 IAPs in one submission; Manual release
- [x] Submitted 2026-10-18 12:07 PM PT, Waiting for Review

**Planned after approval**
- [ ] Owner presses Release (manual) when ready
- [ ] AdMob: link the store listing, `app-ads.txt` check, confirm real fill
- [ ] Google Ads App campaign in the owner's second account, iOS, $50 lifetime cap, paused until verified; YouTube uses the 16:9 cuts
- [ ] Watch Crashlytics and the opt-in analytics (first_open, consent rate, round_start, haul_sold, banner_failed) for the first week
- [ ] Respond to reviews; `RELEASE_REVIEW.md` pass 3 from real-player feedback
- [ ] Android (Phase B in SETUP.md): Play account exists; APK workflow already builds
- [ ] Optional: LLC + D-U-N-S → organization account → studio name as seller

**Standing rules at every stop**
- [ ] Repo private before the day ends; all branches merged or pushed; memory resume point written
