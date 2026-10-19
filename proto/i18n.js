// Languages. The English text is the key: lang/<code>.json maps each English string to its translation, and anything
// without one stays English. Keys with {0}, {1}… are patterns ("{0}-day streak"); what fills a gap is translated too.
// Nothing in the game logic sees translated text: the page's text nodes and labels are translated as they appear
// (one MutationObserver), canvas text as it's drawn, and dialogue before it types out (t()).
// ?lang=xx forces a language (tests); ?i18n=collect records every English string the game shows (scripts/i18n.mjs).
export const LANGS = { en: "English", de: "Deutsch", es: "Español", "pt-BR": "Português (Brasil)", ja: "日本語", ko: "한국어", "zh-Hans": "简体中文", hi: "हिन्दी" };
const qs = new URLSearchParams(location.search), COLLECT = qs.get("i18n") === "collect";

// Options' choice (save.opt.lang) wins, then the phone's language list, then English
export const CHOSEN = (() => { try { return JSON.parse(localStorage.getItem("kt.save"))?.opt?.lang || null; } catch { return null; } })();
function pick() {
  const forced = qs.get("lang") || CHOSEN;
  if (LANGS[forced]) return forced;
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const L = l.toLowerCase(), base = L.split("-")[0];
    if (base === "zh") return "zh-Hans"; // Traditional Chinese readers get Simplified until there's a zh-Hant file
    if (base === "pt") return "pt-BR";
    if (LANGS[base]) return base;
  }
  return "en";
}
export const LANG = pick();
document.documentElement.lang = LANG; // also picks the right Han glyph shapes for Chinese vs Japanese

let dict = {};
if (LANG !== "en") try { dict = await (await fetch(new URL(`./lang/${LANG}.json`, import.meta.url))).json(); } catch { /* English it is */ }

const exact = new Map(), pats = [], cache = new Map(), esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [k, v] of Object.entries(dict)) {
  if (!v) continue;
  if (!/\{\d\}/.test(k)) { exact.set(k, v); continue; }
  const parts = k.split(/\{(\d)\}/), order = parts.filter((_, i) => i % 2).map(Number);
  pats.push({ re: new RegExp("^" + parts.map((p, i) => (i % 2 ? "(.+?)" : esc(p))).join("") + "$", "s"), order, v, len: k.length });
}
pats.sort((a, b) => b.len - a.len); // the most specific pattern wins
export const missing = new Set(); // ?i18n=collect: every string shown that has no translation (English: everything)
const made = new Set(); // what t() has produced: seen again (the page watcher re-reads its own writes), it isn't English

// translate one piece of text; leading/trailing spaces are kept
export function t(s) {
  if (s == null || (LANG === "en" && !COLLECT)) return s;
  s = String(s);
  if (cache.has(s)) return cache.get(s);
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2];
  let out = s;
  if (/\p{L}{2}/u.test(core)) {
    const hit = exact.get(core) ?? (() => {
      for (const p of pats) { const g = core.match(p.re); if (g) return p.v.replace(/\{(\d)\}/g, (_, i) => t(g[1 + p.order.indexOf(+i)])); }
    })();
    if (hit != null) { out = m[1] + hit + m[3]; if (COLLECT) for (const piece of [hit, ...hit.split(/<[^>]*>/)]) made.add(piece.trim()); }
    else if (COLLECT && /[A-Za-z]{2}/.test(core) && !made.has(core)) missing.add(core);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(s, out);
  return out;
}
if (COLLECT) window.i18nMissing = missing;

if (LANG !== "en" || COLLECT) {
  // the page: every text node and label, now and whenever the game adds or changes one
  const ATTRS = ["aria-label", "alt", "title", "placeholder"];
  // data-notr: leave alone (already translated, like a typing line, or not text at all, like the language list)
  const skip = (n) => !!(n.nodeType === 3 ? n.parentElement : n)?.closest?.("[data-notr], script, style");
  const walk = (n) => {
    if (skip(n)) return;
    if (n.nodeType === 3) { const v = t(n.data); if (v !== n.data) n.data = v; return; }
    if (n.nodeType !== 1) return;
    for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const w = t(v); if (w !== v) n.setAttribute(a, w); } }
    for (const c of n.childNodes) walk(c);
  };
  const go = () => {
    walk(document.body);
    new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === "childList") m.addedNodes.forEach(walk); else if (m.type === "characterData") walk(m.target);
      else if (!skip(m.target)) { const v = m.target.getAttribute(m.attributeName); if (v) { const w = t(v); if (w !== v) m.target.setAttribute(m.attributeName, w); } }
    } }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  document.body ? go() : addEventListener("DOMContentLoaded", go);
  // the board: text drawn on a canvas, and measured the same way so it still lines up
  const C = CanvasRenderingContext2D.prototype;
  for (const k of ["fillText", "strokeText", "measureText"]) { const f = C[k]; C[k] = function (s, ...rest) { return f.call(this, t(s), ...rest); }; }
}

// typing a line out letter by letter: split into what a reader sees as one letter (Hindi vowel signs stay on their letter)
const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(LANG, { granularity: "grapheme" }) : null;
export const letters = (s) => (seg ? [...seg.segment(s)].map((x) => x.segment) : [...s]);
