# Kitchen Table: App Store submission

Everything App Store Connect (ASC) asks for, in the order it asks, with the answers ready to paste. The owner does the
clicks; nothing here needs a Mac. Listing text: [listing.en-US.json](listing.en-US.json). Screenshots:
[screens/](screens/) (iPhone 6.1", 1206×2622) and [screens/ipad/](screens/ipad/) (13" iPad, 2064×2752). Search Results asset:
[search-asset.png](search-asset.png) (3840×2560).

Re-render after any change to the table (W3's PR #18, a theme, a caption):

```
node scripts/store-shots.mjs        # both sizes; --size 6.1 or --size ipad for one
node scripts/search-asset.mjs
node scripts/store-check.mjs
```

Look at each PNG at full size before uploading (Glimmerwood's search asset once went to Apple with black bands).

---

## Decisions for the owner before submitting

1. **Support email.** `site/support.html` has the placeholder `OWNER_EMAIL` (twice). `docs/SETUP.md` lists
   pubshiftsupport@gmail.com as the contact; put the address you want players to write to. The Pages workflow refuses
   to publish while the placeholder is there.
2. **Where the site lives while the repo is private.** GitHub Pages on a private repo needs a paid plan (GitHub Pro);
   on the free plan the support and privacy URLs go dark whenever the repo goes private at night, and App Review
   checks both. Either turn on GitHub Pro for the account, or keep the site in a small public repo (then the URLs and
   `SITE` in `proto/platform.js` change to match; repo names are case-insensitive, so it can't be called
   `kitchen-table` next to `Kitchen-Table`). The listing and the app assume `https://alexdlc5.github.io/kitchen-table/`.
3. **Age rating and the "Whiskey & shells" theme.** Its name and art refer to whiskey (and shotgun shells and 9mm
   brass). An honest answer to "Alcohol, Tobacco, or Drug Use or References" is *Infrequent/Mild*, which raises the
   rating above 4+ (13+ in Apple's current scale). To stay 4+, rename/redraw the theme (for example "Barrel & brass")
   before submitting. The answers below assume one or the other; pick before step 6.
4. **The hidden "Family table test".** Tapping "Play a game of cards at…" seven times on the title opens a test mode.
   Guideline 2.3.1 forbids hidden or undocumented features: either hide it in release builds (W3/lead, `proto/main.js`
   `familyTest`) or describe it in the review notes. The notes below assume it is hidden.

---

## Step by step in App Store Connect

**0. Before you start.** Decisions 1-4 above made; a build with `appstore` settings uploaded
(`gh workflow run ios.yml --ref main -f upload=true`) and visible in TestFlight; RevenueCat key in `proto/platform.js`
(SETUP A11) and Firebase plist in the app (SETUP A9), since the privacy answers below describe them.

**1. Publish the site.** GitHub › Kitchen-Table › Settings › Pages › Build and deployment › Source: **GitHub Actions**.
Then `gh workflow run pages.yml --ref main`. Open `https://alexdlc5.github.io/kitchen-table/privacy.html` and
`/support.html` on your phone; both must load.

**2. App record** (SETUP A3, if not done). Apps › **+** › New App › iOS · Name `Kitchen Table: Spades, Hearts` ·
Primary language English (U.S.) · Bundle ID `io.github.alexdlc5.kitchentable` · SKU `kitchentable` · Full Access › Create.

**3. App Information** (left menu, General).
- Subtitle: `Euchre, Whist, Oh Hell. No ads`
- Category: Primary **Games**, subcategories **Card** and **Board**; Secondary **Entertainment** (optional).
- Content Rights: **Yes**, it contains third-party content and I have the rights (open-source fonts Alegreya and
  Alegreya Sans, SIL Open Font License; everything else is our own code and art).
- Age Rating › Edit: answers in "Age rating" below.
- License Agreement: Apple's standard EULA (leave as is).
- Privacy Policy URL: `https://alexdlc5.github.io/kitchen-table/privacy.html` (App Privacy page).
- Save.

**4. Pricing and Availability.** Price **$0.00 (Free)** › Next › Next › Confirm. Availability: **All countries or
regions** › Confirm. Tax category: leave the default (Games... software). Save.

**5. App Privacy.** Privacy Policy URL as in step 3. Get Started › answers in "Privacy label" below › Publish.

**6. Game Center** (Services › Game Center, or Features › Game Center): add the 8 leaderboards below, each with an
English localization; leave them "Prepare for Submission" (they travel with the version).

**7. In-App Purchases** (Monetization › In-App Purchases › **+**): 15 products below, all **Non-Consumable**. For
each: Reference Name, Product ID, then › Availability: all countries › Price schedule: the price › App Store
Localization (English U.S.): Display Name and Description from the table › Review Information: screenshot + note ›
**Family Sharing: Turn On** (it can't be turned off later) › Save. Then in RevenueCat attach each product to the
entitlement of the same name and add it to the current offering.

**8. The version page** (iOS App › 1.0 Prepare for Submission).
- Previews and Screenshots: **iPhone 6.9" Display** tab is not needed when the **6.1"/6.3" (Dynamic Island, medium)**
  slot is filled; drag `docs/store/screens/1-title.png` … `6-themes.png` into the iPhone slot (order = file order).
  **iPad 13" Display**: drag `docs/store/screens/ipad/*.png`.
- Promotional Text, Description, Keywords, Support URL, Marketing URL: paste from `listing.en-US.json`
  (`promotional_text`, `description`, `keywords`, `support_url`, `marketing_url`). If Description won't keep its text,
  click into it, ctrl+End and type/paste again (Glimmerwood trap).
- Version: `1.0`. Copyright: `2026 <your legal name>`.
- Build › Add Build › the newest `appstore` build › Done.
- Game Center: on (the leaderboards are picked up automatically).
- App Review Information: **Sign-in required: untick** (it starts ticked with empty fields). Contact: your name,
  phone, email. Notes: paste "App Review notes" below.
- Version Release: **Manually release this version**.
- Save.

**9. Product page extras.** App Store › (version) › the "Search Results" / custom asset slot if offered for your
account: `docs/store/search-asset.png`.

**10. One submission with everything** (order matters, playbook §4):
1. In-App Purchases › `everything` › **Add for Review** › **Create New Submission** (a draft opens; don't submit yet).
2. Each theme product › Add for Review › choose that **Draft Submission**.
3. The 1.0 version page › **Add for Review** › that same draft.
4. App Review › the draft (16 items: the version and 15 IAPs) › **Submit for Review**.

Apple's automated binary check takes ~4 minutes; "Invalid Binary" is explained only in Apple's email to the account.
Human review: 1-2 days. Approval does not publish (manual release): press **Release** when ready.

---

## Privacy label (must match `ios/App/App/PrivacyInfo.xcprivacy`)

**Do you or your third-party partners collect data from this app?** Yes.

| Data type (ASC wording) | Collected by | Used for | Linked to the user? | Used for tracking? |
|---|---|---|---|---|
| Usage Data › **Product Interaction** | Firebase Analytics, only after the player says yes | **Analytics** | No | No |
| Diagnostics › **Crash Data** | Firebase Crashlytics, only after yes | **App Functionality** | No | No |
| Diagnostics › **Performance Data** | Firebase Crashlytics, only after yes | **App Functionality** | No | No |
| Purchases › **Purchase History** | RevenueCat (to confirm and restore what you own) | **App Functionality** | No | No |

Everything else: **not collected** (no contact info, location, contacts, user content, browsing or search history,
identifiers for ads, financial info, health, sensitive info). No ads; no tracking; no data brokers.

Notes:
- "Opt-in" doesn't exempt data from the label (Apple's "optional disclosure" exception doesn't cover analytics), so it
  is declared, and the privacy policy says it is off until yes.
- Firebase and RevenueCat ship their own privacy manifests. Before submitting, open the archive's **privacy report**
  (Xcode › Organizer › archive › Generate Privacy Report, or ask Claude to read it from the CI archive) and make sure
  no SDK declares a type missing from the table above (for example Identifiers › Device ID). If one does, add that row
  here, in `PrivacyInfo.xcprivacy` and in `site/privacy.html` together.
- In the Firebase console set Analytics data retention to **14 months** or less (Admin › Data Settings › Data
  Retention), as the privacy policy says.

## Age rating

Apple's questionnaire (ASC › App Information › Age Rating). Answer:

| Question | Answer |
|---|---|
| Parental controls (in-app controls) | **Yes**: a caregiver PIN locks settings and purchases |
| Age assurance | No |
| Unrestricted web access | No (two outbound links, held behind a 2-second press, open in Safari) |
| User-generated content | No |
| Messaging and chat | No |
| Advertising | No |
| Cartoon or fantasy violence; realistic violence; prolonged graphic violence | None |
| Profanity or crude humor | None ("Oh Hell" is the traditional name of the game) |
| Mature or suggestive themes; horror/fear; sexual content or nudity | None |
| Alcohol, tobacco or drug use or references | **None** if the whiskey theme is renamed; **Infrequent/Mild** if it ships as "Whiskey & shells" (decision 3) |
| Medical or treatment information | None |
| Gambling (real money) | No |
| Simulated gambling | **None**: trick-taking games, no betting, no chips, no casino games |
| Contests | None |
| Made for Kids | No |

Expected rating: **4+** (or 13+ with the whiskey theme as is).

## App Review notes (paste into "Notes")

```
Thank you for reviewing Kitchen Table.

No sign-in: the app has no accounts. Game Center is optional (leaderboards only).

Free vs paid: Hearts is free. One non-consumable "Everything" unlock adds Spades, Euchre, Oh Hell and Whist.
To test it: on the title screen tap "Games and rules", pick Spades, and tap the unlock button; or Options >
"Unlock everything". Table themes (non-consumable, cosmetic only) are in "Table shop". "Restore purchases"
is on the title screen. All purchases are non-consumable with Family Sharing on. There are no ads, no
subscriptions and no consumables.

Fair deal: every hand is shuffled from a random seed and the player's cut, and nothing else. The seed is
printed on each score sheet (shown after every hand). Our website re-deals any seed, card for card:
https://alexdlc5.github.io/kitchen-table/verify.html

Privacy: on the first game the app asks whether to share anonymous usage numbers and crash reports (Firebase).
Nothing is sent unless the player says yes; Options has a switch to turn it off.

Caregiver page (title screen > Caregiver): an optional 4-digit PIN that locks settings and purchases. No PIN is
set on a fresh install.
```

## In-app purchases (from `sim/generator.json` › `products`)

All **Non-Consumable**, **Family Sharing on**. Product ID = RevenueCat entitlement ID (the app reads entitlements by
these exact names). Display names stay under 30 characters, descriptions under 45.

| Product ID | Reference name | Price | Display name | Description |
|---|---|---|---|---|
| `everything` | Everything unlock | $6.99 | Everything | Spades, Euchre, Oh Hell, Whist and more |
| `theme_gingham` | Theme: Sunday gingham | $2.99 | Sunday gingham | A red check tablecloth table |
| `theme_cabin` | Theme: Lake cabin | $2.99 | Lake cabin | Buffalo plaid and pine card backs |
| `theme_diner` | Theme: Diner '57 | $2.99 | Diner '57 | Mint formica with a chrome edge |
| `theme_garden` | Theme: Garden party | $2.99 | Garden party | Chintz roses on a linen cloth |
| `theme_parlor` | Theme: Antique parlor | $4.99 | Antique parlor | Green leather and gold tooling |
| `theme_leopard` | Theme: Leopard lounge | $4.99 | Leopard lounge | Leopard print, black lacquer edge |
| `theme_midcentury` | Theme: Mid-century | $4.99 | Mid-century | Teak, mustard and atomic stars |
| `theme_leather` | Theme: Leather & brass | $4.99 | Leather & brass | Oxblood leather and brass studs |
| `theme_whiskey` | Theme: Whiskey & shells | $4.99 | Whiskey & shells | Barrel staves and amber light |
| `theme_gilded` | Theme: Gilded | $9.99 | Gilded | Black velvet and gold leaf |
| `theme_sterling` | Theme: Sterling | $9.99 | Sterling | Midnight velvet, silver filigree |
| `theme_deco` | Theme: Art deco | $9.99 | Art deco | Black lacquer and gold sunbursts |
| `theme_memphis` | Theme: Postmodern '86 | $9.99 | Postmodern '86 | Squiggles and confetti |
| `theme_marble` | Theme: Marble & brass | $9.99 | Marble & brass | Carrara marble, brass rail |

**Review screenshot** (one per product, at least 640×920; a phone screenshot is fine): take them on a TestFlight
build with the sandbox account, before buying.
- `everything`: the "Unlock everything" screen with its price button (title › Games and rules › Spades).
- each theme: the Table shop scrolled to that theme's tile with its price.

**Review note** (same for all): `Non-consumable, cosmetic table theme. Buy it in Table shop on the title screen;
it applies at once and is restored with "Restore purchases".` For `everything`: `Non-consumable. Unlocks Spades,
Euchre, Oh Hell and Whist (and future games). Buy from Games and rules > any locked game, or Options.`

## Game Center leaderboards (from `sim/generator.json` › `leaderboards`)

Classic leaderboards, **Integer** score format, Leaderboard ID = the ID below (the app submits to exactly these).
English localization: Display Name = Name; Score format suffix as listed.

| Leaderboard ID | Name | Sort | Suffix |
|---|---|---|---|
| `hearts_best` | Hearts: best game | **Low to High** | points |
| `hearts_wins` | Hearts: games won | High to Low | wins |
| `spades_streak` | Spades: longest win streak | High to Low | games |
| `spades_wins` | Spades: games won | High to Low | wins |
| `euchre_wins` | Euchre: games won | High to Low | wins |
| `ohhell_wins` | Oh Hell: games won | High to Low | wins |
| `whist_wins` | Whist: games won | High to Low | wins |
| `extreme_wins` | Wins against Extreme | High to Low | wins |

Score range: 0 to 100000 (optional; leave empty if ASC allows). `docs/SETUP.md` A14 still says "2 leaderboards + 10
achievements"; the game ships these 8 leaderboards and no achievements.

## Guideline pre-check

| Guideline | Status |
|---|---|
| 2.1 Completeness | Every screen and a whole hand of each game pass `smoke.mjs` on WebKit/Chromium, SE, Comfort, iPad. Test the IAPs in sandbox on the review build. |
| 2.3.1 Hidden features | **Open**: the 7-tap "Family table test" (decision 4). |
| 2.3.3 Screenshots | Real app screens from staged hands, framed with a caption; no prices, no store wording. |
| 2.3.7 Metadata | Name/subtitle/keywords name only games the app has; no prices there; keywords don't repeat the name. |
| 2.3.8 Age rating honest | See decision 3. |
| 3.1.1 IAP | All unlocks through Apple IAP; Restore purchases on the title screen. |
| 3.1.2 Subscriptions | None. |
| 4.2 Minimum functionality | Five full games, rules presets, bots at four levels. |
| 5.1.1 Privacy | Policy URL live (decision 2); opt-in analytics; no account; label as above. |
| 5.1.2 Data use | No tracking; `NSPrivacyTracking` false (store-check enforces it). |
| 5.3 Gaming, gambling | No betting or prizes. |
| Ads | No ad SDK in the binary (store-check enforces it). |
| Accessibility labels (optional) | Declare only what passes Apple's criteria on a device: VoiceOver is the strongest candidate; check Larger Text, Sufficient Contrast, Reduced Motion before ticking them. |

**Also noticed (for the lead, not blocking this file):** the Options and Games buttons say "Unlock everything ·
$6.99 once" with a hard-coded US price, while the unlock screen shows the App Store's local price. Outside the US
the two disagree; take the price from `platform.prices()` everywhere.

## Other languages

Only `listing.en-US.json` exists. Its `"locales_pending": true` lets `store-check.mjs` pass without the other 7
(de, es, pt-BR, ja, ko, zh-Hans, hi); remove that line when the translations land, and check every keyword list stays
under 100 bytes.
