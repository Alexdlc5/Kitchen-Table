# Copyright, privacy and tracking check

*2026-10-20. A pre-launch check of what ships in the app, read from the code. This is an engineering review, not legal
advice. Before submitting, have someone qualified read the privacy policy and the App Privacy answers.*

## Verdict

Nothing in the app is copied from anyone else, and nothing leaves the phone unless the player says yes. This check made
three fixes (listed below). Five things are still owed before launch. The biggest is the privacy policy page: the Options
links point at it, and it doesn't exist yet.

## Copyright and trademarks

| What | Source | Status |
|---|---|---|
| Card faces, card backs, table themes, the title still life, the app icon and splash | Drawn in code (`proto/art.js`, `proto/paint.js`, `proto/themes.js`, `scripts/app-art.mjs`). No stock art and no third-party images | ✅ original |
| Sounds | Synthesised at run time (`proto/sound.js`). No audio files | ✅ original |
| Fonts | Alegreya and Alegreya Sans (Huerta Tipográfica), SIL Open Font License 1.1, bundled from `@fontsource` | ✅ **Fixed:** `build-web.mjs` now ships each font's OFL licence beside it (`www/fonts/OFL-*.txt`), which the licence requires |
| Fonts in the browser build | `proto/index.html` loads Google Fonts for local testing only. `build-web.mjs` swaps in the bundled fonts and fails if the Google link survives | ✅ The app never contacts Google Fonts |
| Game names and rules | Hearts, Spades, Euchre, Oh Hell and Whist are traditional games. Rules aren't copyrightable, and the rule text is our own | ✅ |
| Shop copy | "Mint formica" named a registered trademark | ✅ **Fixed:** "Mint laminate" |
| Apple names (VoiceOver, Game Center, Family Sharing, iPhone) | Used descriptively, with the correct names | ✅ Keep it that way (Apple's trademark guidelines) |
| Code libraries | Capacitor (MIT), RevenueCat (MIT), Firebase iOS SDK (Apache 2.0) | ⚠️ **Owed:** an Acknowledgements page (Options › About) with their licence texts. Apache 2.0 and MIT ask for the notice to travel with the app |

**Age rating note (not copyright):** the "Whiskey & shells" theme mentions whiskey, shotgun shells and 9mm brass. Answer
the App Store age questionnaire with "infrequent/mild alcohol references", or soften the copy.

## Data and tracking

| Area | What the code does | Status |
|---|---|---|
| Ads and tracking | No ad SDK (`store-check.mjs` enforces it). No IDFA and no ATT prompt. `PrivacyInfo.xcprivacy` declares no tracking. Firebase Analytics is linked **without ad-ID support** (`AnalyticsWithoutAdIdSupport` in `CapApp-SPM/Package.swift`) | ✅ Re-check that trait after every `npx cap sync`, which regenerates that file |
| Analytics and crash reports | Off by default (`FIREBASE_ANALYTICS_COLLECTION_ENABLED` and `FirebaseCrashlyticsCollectionEnabled` are false in Info.plist, and `FIREBASE = false` until the config file lands). They turn on only after "Yes, share" on an opt-in card whose two buttons have equal weight. Options can turn them off again | ✅ |
| The "No thanks" answer | Used to switch Analytics on for a moment to log `consent: no`, then switch it off. That sent an event to Google after a refusal, which GDPR and ePrivacy don't allow | ✅ **Fixed** (`platform.js`): only a "yes" is logged. A "no" sends nothing |
| Event contents | `game_start`, `hand_end`, `game_end`, `unlock`, `restore`, `iap_*`: game, rules, level and counts. No name, no free text, no identifiers of ours | ✅ |
| Purchases | RevenueCat handles App Store receipts under an anonymous app user ID. It is needed for the purchase itself (contract), so no consent is required. It has its own privacy manifest | ✅ List it in the privacy policy |
| Game Center, family tables | Apple's services; family tables are peer-to-peer through GameKit, with no server of ours | ✅ List them in the privacy policy |
| Save game | On the device only (localStorage mirrored to UserDefaults); iOS backs it up with the phone | ✅ |
| verify.html | Loads nothing from other hosts | ✅ |
| Children | The app is made for adults (40-70) and isn't directed to children, so COPPA doesn't apply. Don't pick the Kids category | ✅ |

## Owed before launch

1. **Privacy policy, terms and support pages** in `site/`. Options already links to them; App Review (guideline 5.1.1) and
   GDPR Art. 13 need them. Name Firebase Analytics and Crashlytics (opt-in), RevenueCat, Game Center, what each one
   receives, how to withdraw consent (the Options switch), and a contact address. The `store-and-site` session is
   building `site/`.
2. **App Privacy answers in App Store Connect** that match `PrivacyInfo.xcprivacy`: product interaction, crash data and
   performance data (all opt-in, not linked, not tracking), plus purchase history. Add a user ID for RevenueCat's
   anonymous ID if its manifest lists one. Use Xcode's privacy report (Product › Archive › Generate Privacy Report).
3. **In the Firebase console:** accept the Google data processing terms, set data retention to 2 months, and turn off
   Google signals and ads personalisation.
4. **An Acknowledgements page** with the OFL, MIT and Apache licence texts (see above).
5. **A legal read** of the privacy policy and these answers by someone qualified, especially for EU players.
