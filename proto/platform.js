// Platform services behind one object: purchases, opt-in analytics, Game Center, haptics, the save mirror, gated links.
// No ad SDK, ever (scripts/store-check.mjs fails the build if one appears). In the Capacitor app the native plugins are
// reached through window.Capacitor.Plugins; in a browser everything is a harmless stand-in.
const cap = window.Capacitor, native = !!cap?.isNativePlatform?.(), os = cap?.getPlatform?.() || "web";
const { Purchases, FirebaseAnalytics, FirebaseCrashlytics, Preferences, GameCenter, Haptics } = cap?.Plugins || {};
export const VERSION = "dev"; // scripts/build-web.mjs writes "1.0 (build)" here
export const SITE = "https://alexdlc5.github.io/kitchen-table";
const KEYS = { revenuecat: { ios: "", android: "" } }; // public SDK key from RevenueCat (docs/SETUP.md A11); empty = purchases off
const qs = new URLSearchParams(globalThis.location?.search ?? "");

// entitlements, remembered offline. The browser build (npm run play) has everything unlocked unless ?locked
const OWN_KEY = "kt.owned";
let owned = new Set();
try { owned = new Set(JSON.parse(localStorage.getItem(OWN_KEY) || "[]")); } catch {}
if (!native && !qs.has("locked")) owned = new Set(["everything", "backs_porch", "felts_home"]);
const setOwned = (ids) => { owned = new Set(ids); try { if (native) localStorage.setItem(OWN_KEY, JSON.stringify([...owned])); } catch {} };

const log = [];
let telemetry = false;
export function setTelemetry(on, { first = false } = {}) {
  telemetry = !!on;
  try { FirebaseAnalytics?.setEnabled({ enabled: telemetry }).catch(() => {}); } catch {}
  try { FirebaseCrashlytics?.setEnabled({ enabled: telemetry }).catch(() => {}); } catch {}
  if (first && FirebaseAnalytics) // the answer itself, once, with nothing attached
    FirebaseAnalytics.setEnabled({ enabled: true }).then(() => FirebaseAnalytics.logEvent({ name: "consent", params: { telemetry: telemetry ? "yes" : "no" } }))
      .then(() => { if (!telemetry) return FirebaseAnalytics.setEnabled({ enabled: false }); }).catch(() => {});
}
export function track(name, params = {}) {
  log.push([Date.now(), name, params]); if (log.length > 100) log.shift(); // local debug ring, never sent
  if (telemetry && FirebaseAnalytics) FirebaseAnalytics.logEvent({ name, params }).catch(() => {});
}

let leaderboards = false;
export const platform = {
  native, os, log, version: VERSION, site: SITE,
  owns: (id) => owned.has(id),
  get canBuy() { return native && !!Purchases && !!KEYS.revenuecat[os]; },

  async init() {
    if (!native) return;
    this.gameCenter = GameCenter ? GameCenter.signIn().then((r) => (leaderboards = !!r?.available), () => false) : Promise.resolve(false);
    if (this.canBuy) {
      try { await Purchases.configure({ apiKey: KEYS.revenuecat[os] }); await this.refresh(); }
      catch (e) { track("iap_init_failed", { error: String(e?.message || e).slice(0, 90) }); }
    }
  },
  async refresh() {
    if (!this.canBuy) return;
    const { customerInfo } = await Purchases.getCustomerInfo();
    setOwned(Object.keys(customerInfo.entitlements.active));
  },
  async prices() { // { productId: "$6.99" }; {} when the store can't be reached
    if (!this.canBuy) return {};
    try {
      const o = await Purchases.getOfferings(), out = {};
      for (const p of o.current?.availablePackages || []) out[p.product.identifier] = p.product.priceString;
      return out;
    } catch { return {}; }
  },
  async buy(productId) { // true once the entitlement is active
    if (!this.canBuy) return false;
    try {
      const pkg = (await Purchases.getOfferings()).current?.availablePackages?.find((p) => p.product.identifier === productId);
      if (!pkg) return false;
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      setOwned(Object.keys(customerInfo.entitlements.active));
      track("unlock", { product: productId });
      return owned.has(productId);
    } catch (e) { if (!e?.data?.userCancelled) track("iap_fail", { product: productId, error: String(e?.message || e).slice(0, 90) }); return false; }
  },
  async restore() { // true: something came back; false: nothing to restore; null: the App Store couldn't be reached
    if (!this.canBuy) return native ? null : true;
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      setOwned(Object.keys(customerInfo.entitlements.active));
      track("restore", { found: owned.size });
      return owned.size > 0;
    } catch { return null; }
  },

  gameCenter: Promise.resolve(false),
  get leaderboards() { return leaderboards; },
  submitScore(board, value) { if (leaderboards) GameCenter.submitScore({ board, value: Math.floor(value) }).catch(() => {}); },
  async showLeaderboards() { if (!leaderboards) return false; try { return !!(await GameCenter.showLeaderboards())?.shown; } catch { return false; } },

  haptic(kind = "light") { if (native && Haptics) Haptics.impact({ style: kind === "medium" ? "MEDIUM" : "LIGHT" }).catch(() => {}); },
  openUrl(url) { window.open(url, "_blank"); }, // only ever called after the grown-up gate (main.js gate())

  // localStorage is mirrored to native Preferences; at launch the newer copy wins (restoreSave below)
  backup(key, json) {
    if (!native || !Preferences) return;
    const t = Date.now();
    try { localStorage.setItem(key + "@", t); } catch {}
    Preferences.set({ key, value: JSON.stringify([t, json]) }).catch(() => {});
  },
};

if (native && FirebaseCrashlytics) {
  const report = (message) => telemetry && FirebaseCrashlytics.recordException({ message: String(message).slice(0, 500) }).catch(() => {});
  addEventListener("error", (e) => report(`${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}:${e.colno}`));
  addEventListener("unhandledrejection", (e) => report("unhandled: " + (e.reason?.stack || e.reason)));
}

async function restoreSave(key = "kt.save") {
  try {
    const { value } = await Preferences.get({ key });
    const local = localStorage.getItem(key), localT = +localStorage.getItem(key + "@") || 0;
    if (value) {
      const [t, json] = JSON.parse(value);
      if (!local || t > localT) { localStorage.setItem(key, json); localStorage.setItem(key + "@", t); }
    } else if (local) platform.backup(key, local);
  } catch {}
}
if (native && Preferences) await restoreSave();
