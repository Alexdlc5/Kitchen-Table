// Store promises gate (run from the repo root): no ad SDK anywhere, no tracking, only permanent family-shareable purchases,
// and, once docs/store/listing.<locale>.json exist, a listing that fits Apple's limits in all 8 languages with 1-10 screenshots.
//   node scripts/store-check.mjs        exit 1 on any problem
// Listing limits from App Store Connect help (as in Glimmerwood): name 30, subtitle 30, promotional_text 170,
// keywords 100 BYTES (UTF-8), description 4000, whats_new 4000. Screenshots: 6.9" iPhone, 1206x2622.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

let bad = 0;
const say = (s) => { console.log(s); bad++; };
const cfg = JSON.parse(readFileSync("sim/generator.json", "utf8"));

// 1. no ad SDK: npm packages (package.json, every name in the lockfile) and the iOS project's pods and Swift packages
const ADS = /admob|google-?mobile-?ads|googlemobileads|applovin|unity-?ads|unityads|iron-?source|audience-?network|fbaudience|appodeal|chartboost|vungle|liftoff|inmobi|mintegral|adcolony|pangle|mopub|startapp|tapjoy|fyber|smaato|ogury|yandex-?ads|appnexus|adjoe|bidmachine|kidoz|superawesome/i;
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) for (const n of Object.keys(pkg[k] || {})) if (ADS.test(n)) say(`package.json: ad SDK ${n}`);
if (existsSync("package-lock.json")) for (const p of Object.keys(JSON.parse(readFileSync("package-lock.json", "utf8")).packages || {})) if (ADS.test(p)) say(`package-lock.json: ad SDK ${p}`);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return f === "node_modules" || f === "Pods" || f === "build" ? [] : statSync(p).isDirectory() ? walk(p) : [p]; });
const iosDeps = existsSync("ios") ? walk("ios").filter((p) => /(^|[\\/])(Podfile(\.lock)?|Package\.resolved|Package\.swift)$/.test(p)) : [];
for (const p of iosDeps) readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (ADS.test(l)) say(`${p}:${i + 1}: ad SDK: ${l.trim().slice(0, 80)}`); });

// 2. no tracking: the app's privacy manifest says so (Apple rejects NSPrivacyTracking true with no domains, ITMS-91064)
const PM = "ios/App/App/PrivacyInfo.xcprivacy";
if (existsSync(PM)) {
  const pm = readFileSync(PM, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, "");
  if (!pm.includes("<key>NSPrivacyTracking</key><false/>")) say(`${PM}: NSPrivacyTracking must be false`);
  if (/<key>NSPrivacyTrackingDomains<\/key><array>(?!<\/array>)/.test(pm)) say(`${PM}: NSPrivacyTrackingDomains must be empty`);
  if (pm.includes("DataTypeTracking</key><true/>")) say(`${PM}: a collected data type is marked as used for tracking`);
}

// 3. only permanent purchases: non-consumable, family-shareable, with a price
for (const p of cfg.products || []) {
  if (p.type !== "non-consumable") say(`product ${p.id}: type is ${p.type}, must be non-consumable`);
  if (p.familyShareable !== true) say(`product ${p.id}: must be family-shareable`);
  if (!/^\d+\.\d\d$/.test(p.price || "") || +p.price <= 0) say(`product ${p.id}: price "${p.price}" is not a price`);
}
if (!cfg.products?.length) say("sim/generator.json: no products");

// 4. the App Store listing, once written
const DIR = "docs/store", LIMITS = { name: 30, subtitle: 30, promotional_text: 170, description: 4000, whats_new: 4000 };
const LOCALES = ["en", "de", "es", "pt-BR", "ja", "ko", "zh-Hans", "hi"];
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^listing\..+\.json$/.test(f)) : [];
let shots = 0;
if (!files.length) console.log(`note: no ${DIR}/listing.<locale>.json yet; listing and screenshot checks skipped`);
else {
  const seen = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); seen.push(d.locale || f.split(".")[1]);
    for (const [k, max] of Object.entries(LIMITS)) { const v = d[k] ?? ""; if ([...v].length > max) say(`${f}: ${k} is ${[...v].length} chars (max ${max})`); if (!v && k !== "whats_new") say(`${f}: ${k} is empty`); }
    const kb = Buffer.byteLength(d.keywords || "", "utf8"); if (!kb) say(`${f}: keywords are empty`); if (kb > 100) say(`${f}: keywords are ${kb} bytes (max 100)`);
    // Apple's "more than two characters" is about Latin words; a 2-character Chinese/Japanese/Korean keyword is a whole word
    for (const w of (d.keywords || "").split(",")) { const t = w.trim(); if (t.length && t.length <= 2 && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(t)) say(`${f}: keyword "${t}" is 2 chars or fewer`); }
    if ((d.keywords || "").toLowerCase().includes(cfg.brand.name.toLowerCase())) say(`${f}: keywords repeat the app name`);
    if (/<[a-z]/i.test(d.description || "")) say(`${f}: description contains HTML`);
    for (const k of ["support_url", "privacy_policy_url"]) if (!/^https?:\/\//.test(d[k] || "")) say(`${f}: ${k} must be a full URL`);
  }
  for (const l of LOCALES) if (!seen.some((s) => s === l || s.startsWith(l + "-"))) say(`missing listing for ${l}`);
  const pngs = existsSync(`${DIR}/screens`) ? readdirSync(`${DIR}/screens`).filter((f) => f.endsWith(".png")) : [];
  shots = pngs.length;
  if (shots < 1 || shots > 10) say(`${shots} screenshots in ${DIR}/screens (Apple: 1 to 10)`);
  for (const f of pngs) { const h = readFileSync(`${DIR}/screens/${f}`).subarray(16, 24), w = h.readUInt32BE(0), ht = h.readUInt32BE(4); if (w !== 1206 || ht !== 2622) say(`${DIR}/screens/${f}: ${w}x${ht}, must be 1206x2622`); }
}
console.log(bad ? `${bad} problem(s)` : `store ok: no ad SDK (${iosDeps.length} iOS dependency files), ${existsSync(PM) ? "privacy manifest says no tracking" : "no privacy manifest yet"}, ${cfg.products.length} permanent products, ${files.length} listings, ${shots} screenshots`);
process.exit(bad ? 1 : 0);
