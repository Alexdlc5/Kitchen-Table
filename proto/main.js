// Kitchen Table: screens and flow (docs/DESIGN.md §4). Rules live in spades.js / hearts.js, bots in ai.js, the deal in
// dealer.js; this file only shows the table and asks the humans. Every screen is drawn from the save (S) and the game (G).
import { platform, track, setTelemetry } from "./platform.js";
import { LANGS, CHOSEN } from "./i18n.js";
import { newSeed, fingerprint } from "./dealer.js";
import { rulesFor, team, partner, SUITS } from "./cards.js";
import * as spades from "./spades.js";
import * as hearts from "./hearts.js";
import * as euchre from "./euchre.js";
import * as ohhell from "./ohhell.js";
import * as whist from "./whist.js";
import * as more from "./more-games.js";
import { decide } from "./ai.js";
import * as ledger from "./ledger.js";
import { face, cardName, titleProps, tableProp } from "./art.js";
import { THEMES, themeBack, themeStyle } from "./themes.js";
import { speech } from "./speech.js";
import { SCENES, tuckBox, rosette, stamp } from "./scenes.js";
import { sound } from "./sound.js";
import { joinTable } from "./family.js";

const cfg = await (await fetch("../sim/generator.json", { cache: "no-cache" })).json();
const BRAND = cfg.brand.name, MOD = { spades, hearts, euchre, ohhell, whist }, qs = new URLSearchParams(location.search), DEBUG = qs.has("debug");
const GAME_NAME = { hearts: "Hearts", spades: "Spades", euchre: "Euchre", ...more.NAMES };
const LEVEL_NAME = { easy: "Easy", standard: "Standard", expert: "Expert", extreme: "Extreme" };
const PRESET_NAME = { standard: "Standard", kitchen: "Kitchen table", tournament: "Tournament", custom: "Custom" };
const TEAMS = (g) => !!cfg.games[g]?.teams; // partners across the table (Spades, Euchre, Whist)
const BOTS = { easy: ["Dot", "Gus", "Pearl"], standard: ["June", "Earl", "Rosa"], expert: ["Mabel", "Walt", "Hank"], extreme: ["Vera", "Otis", "Dell"] };

// ---------------------------------------------------------------- the save (on this device only; mirrored to Preferences)
const KEY = "kt.save", RESET = 1; // bump RESET for an "as a new player" TestFlight build: wipes the save once per device
const fresh = () => ({
  v: 1, reset: RESET, hands: 0, consentAsked: false,
  opt: { sound: true, loud: false, haptics: true, comfort: false, four: false, confirm: false, speed: "normal", lang: CHOSEN, analytics: null,
    theme: "walnut", back: null, text: "normal", speak: false, speakRate: 1, cut: false },
  last: { game: "hearts", preset: "standard", custom: {}, partner: "standard", opps: "standard", seats: ["you", "bot", "bot", "bot"] },
  cur: null, deals: [], record: {}, best: {}, care: { pin: null, lock: false, games: ["hearts", "spades", "euchre"], straight: false, euchre: 1, cut: false },
});
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); if (S.reset !== RESET) S = fresh(); } catch { S = fresh(); }
const F = fresh();
const seenEuchre = S.care?.euchre; // Euchre arrives on the shelf once; a caregiver may hide it after that
S = { ...F, ...S, opt: { ...F.opt, ...S.opt }, last: { ...F.last, ...S.last }, care: { ...F.care, ...S.care } };
if (!seenEuchre && !S.care.games.includes("euchre")) S.care.games.push("euchre");
if (!S.care.moreGames) S.care = { ...S.care, moreGames: 1, games: [...new Set([...S.care.games, "ohhell", "whist"])] }; // saves from before Oh Hell and Whist
function save() { const j = JSON.stringify(S); try { localStorage.setItem(KEY, j); } catch {} platform.backup(KEY, j); }

// ---------------------------------------------------------------- small helpers
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (v) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v));
const speed = () => (qs.has("fast") ? 0.02 : S.opt.comfort ? 1.7 : { relaxed: 1.7, normal: 1, fast: 0.5 }[S.opt.speed] || 1); // ?fast: tests only
const owns = (game) => cfg.games[game]?.free || platform.owns("everything");
// a switch prints its state beside the track (older eyes don't all read iOS switches); disabled when something else decides it
const sw = (act, on, label, { disabled = false, attrs = "" } = {}) => `<button class="toggle" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-act="${act}" ${attrs} ${disabled ? "disabled" : ""}><i aria-hidden="true">${on ? "On" : "Off"}</i></button>`;
const toggle = (act, on, label, opt = {}) => `<div class="row"><span>${label}${opt.note ? ` <small class="muted">${opt.note}</small>` : ""}</span>${sw(act, on, label, opt)}</div>`;
// a row of choices is one named radio group, so VoiceOver says which question "Standard, selected" answers
let segN = 0;
const seg = (act, val, opts, labelId) => `<div class="seg" data-n="${opts.length}" role="radiogroup" ${labelId ? `aria-labelledby="${labelId}"` : ""}>${opts.map(([v, name]) => `<button role="radio" data-act="${act}" data-v="${v}" aria-checked="${val === v}">${name}</button>`).join("")}</div>`;
const segRow = (label, act, val, opts) => { const id = "sg" + ++segN; return `<div class="row"><span id="${id}">${label}</span>${seg(act, val, opts, id)}</div>`; };
let screen = null;
function show(id) {
  screen = id;
  const sc = $("#scene");
  if (SCENES[id]) sc.style.background = SCENES[id];
  sc.classList.toggle("on", !!SCENES[id]);
  document.querySelectorAll(".screen").forEach((e) => e.classList.toggle("on", e.id === id));
  document.querySelectorAll(".screen:not(.on)").forEach((e) => e.setAttribute("aria-hidden", "true"));
  $("#" + id).removeAttribute("aria-hidden");
  if ($("#dialog").hidden) focusScreen(id);
}
// VoiceOver's cursor and the keyboard start on the new screen's heading, never on a button of a screen that has gone
function focusScreen(id) {
  const sc = $("#" + id), h = $(`#${id} h1`) || sc;
  if (sc.contains(document.activeElement)) return; // already on this screen (it was only redrawn)
  h.tabIndex = -1; h.focus({ preventScroll: true });
}
// a redraw replaces the buttons: the focus goes back to the one that matches the button that had it (same action and value)
const sig = (e) => (e?.dataset ? ["act", "v", "to", "id", "seat", "game"].map((k) => e.dataset[k] ?? "").join("|") : "");
function refocus(s) {
  if (!s || s === "|||||") return false;
  const e = [...document.querySelectorAll(`#dialog:not([hidden]) [data-act], .screen.on [data-act]`)].find((x) => sig(x) === s);
  e?.focus({ preventScroll: true });
  return !!e;
}
function applyLook() {
  const root = document.documentElement;
  root.classList.toggle("comfort", !!S.opt.comfort); root.classList.toggle("four", four());
  root.style.setProperty("--speed", S.opt.speed === "fast" ? 0.6 : 1);
  const theme = trial || (ownsTheme(S.opt.theme) ? S.opt.theme : "walnut"), st = themeStyle(theme), felt = $("#felt"); // trial: a theme tried for one hand
  felt.style.background = st.background; felt.style.boxShadow = st.boxShadow;
  for (const [k, v] of Object.entries(st.vars)) root.style.setProperty(k, v);
  root.classList.toggle("text-l", S.opt.text === "large"); root.classList.toggle("text-xl", S.opt.text === "xl");
  speech.enabled = !!S.opt.speak; speech.rate = S.opt.speakRate || 1;
  sound.enabled = S.opt.sound; sound.setIgnoreSilent(S.opt.loud);
  faces.clear(); look++; M = null; geo = null; tight = false;
  backSvg = themeBack(!trial && ownsTheme(S.opt.back) ? S.opt.back : theme);
  backImg = `<img src="data:image/svg+xml,${encodeURIComponent(backSvg)}" alt="">`; // the plates' little backs: one image node each, not an SVG tree
}
const ownsTheme = (id) => THEMES[id] && (THEMES[id].tier === "free" || platform.owns("theme_" + id));
const faces = new Map();
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches; // no motion, ever, when the phone asks
const four = () => !!(S.opt.four || S.opt.comfort); // Comfort always deals the four-colour deck (DESIGN §6.1)
const svgFor = (c) => { const k = c + four(); if (!faces.has(k)) faces.set(k, face(c, { four: four() })); return faces.get(k); };
let backSvg = "", backImg = ""; // the chosen card back, drawn once per change of theme
let look = 0, M = null, geo = null; // look: bumps with every theme/deck/text change; M: sizes read from the CSS once per look; geo: plate sizes
let tight = false; // too little room (an iPhone SE at Extra large text): the table's compact forms, until the size or look changes

// R2: nothing may pop up between the deal and the last trick. dialog() refuses unless the player opened it themselves.
let handLive = false;
const blocked = []; // ?debug: what tried to interrupt a hand (smoke.mjs fails on any)
// pause: the bots wait while it's open (the menu's "Paused", a Why? answer); kind: what it is, for tests
function dialog(html, { user = false, pause = false, kind = "" } = {}) {
  if (handLive && !user) { blocked.push(html.slice(0, 60)); return Promise.resolve(null); }
  dialog.pause = pause; dialog.kind = kind;
  const a = document.activeElement, opener = $("#dialog").contains(a) ? dialog.opener : a, key = $("#dialog").contains(a) ? dialog.key : sig(a); // a dialog opened from a dialog gives focus back to the first opener
  $("#dialogBody").innerHTML = html; $("#dialog").hidden = false; $("main").inert = true; dialog.opener = opener; dialog.key = key;
  const h = $("#dialogBody h2");
  if (h) { h.id = "dialogTitle"; h.tabIndex = -1; h.focus(); } // labelled by its heading, which VoiceOver reads first
  return new Promise((res) => { dialog.done = (v) => {
    $("#dialog").hidden = true; $("main").inert = false; dialog.done = null; dialog.pause = false; dialog.kind = ""; res(v);
    queueMicrotask(() => { if (!dialog.done) { if (opener?.isConnected && !opener.closest("[aria-hidden=true]")) opener.focus(); else if (!refocus(key)) focusScreen(screen); } });
  }; });
}

let peekOpen = false; // the score sheet opened from the chip; it closes itself when the hand or the game ends
const closePeek = () => { if (peekOpen) dialog.done?.(null); };

// R9: an outbound link only after a grown-up check (press and hold: a finger, or Space or Enter), never while the caregiver
// lock is on. Switch Control can't hold, so a press that arrives without one gets a second, plain "Open" question instead.
async function gate(url, what) {
  if (S.care.lock) return;
  const ok = await dialog(`<h2>Leaving ${BRAND}</h2><p>This opens ${esc(what)} in Safari. Press and hold the button for two seconds.</p>
    <div class="stack"><button class="btn big hold" data-hold="2000">Hold to open<i></i></button><button class="btn" data-dlg="">Stay here</button></div>`, { user: true });
  if (ok === "hold" || (ok === "tap" && (await dialog(`<h2>Open Safari?</h2><p>This leaves ${BRAND} for ${esc(what)}.</p><div class="stack"><button class="btn" data-dlg="open">Open Safari</button><button class="btn big" data-dlg="">Stay here</button></div>`, { user: true })) === "open")) platform.openUrl(url);
}

// ---------------------------------------------------------------- what a bot's play means, for the "Why?" button
const WHY = {
  ...more.WHY,
  cover_nil_lowest_winner: "I covered your nil with my lowest card that beats yours.", cover_nil_ruff: "I trumped so you can stay under me.",
  cover_nil_unblock_high: "I played high so you can duck under it.", cover_nil_lead_boss: "I led a sure winner so you can throw off safely.",
  cover_nil_lead_partner_void: "I led a suit you're out of, so you can throw away a high card.", cover_nil_lead_high: "I led high to keep you under me.",
  duck_partner_winning: "You already had that trick; I kept my good cards.", partner_winning_forced: "Every card I had beat yours.",
  avoid_bags: "We have our books; I'm not taking extra bags.", set_opponents: "Taking this one sets them.", keep_opp_nil_trapped: "Their nil is winning this trick; I let it.",
  set_nil_play_low: "I'm playing low to keep their nil in danger.", set_nil_lead_low: "I led low to test their nil.", win_last_lowest: "I won it as cheaply as I could.",
  win_with_boss: "That was the best card left in the suit.", third_hand_high: "Third hand high, to make them pay for it.", ruff: "I was out of that suit, so I trumped.",
  follow_low: "I couldn't win it, so I kept my bigger cards.", discard_low: "I threw away my least useful card.", lead_boss: "I led a card nobody can beat.",
  lead_short_suit: "I led my short suit so I can trump it later.", lead_low: "I led low to see what's out there.", made_lead_low: "We have our books; leading low.",
  nil_lead_low: "I'm nil: leading my lowest card.", nil_duck_highest_under: "I'm nil: I played the highest card that still loses.",
  nil_discard_danger: "I'm nil: I threw away my most dangerous card.", nil_forced: "I'm nil, but every card I had would win.",
  bid_count: "I counted my sure tricks.", nil_safe_hand: "My hand had no big cards, so I went nil.", bid_beside_nil: "You went nil, so I bid what I can take alone.",
  stop_moon: "Somebody was shooting the moon; I took a point to stop it.", stop_moon_lead_heart: "I led a heart to stop the moon.",
  stop_moon_take_lead: "I took the lead to stop the moon.", no_points_to_shooter: "I didn't hand the shooter any more points.",
  moon_lead_boss: "I'm going for the moon.", moon_take: "I'm going for the moon.", dump_queen_under: "Somebody's ace or king was winning: the queen went there.",
  spade_below_queen: "I kept under the queen of spades.", duck_highest_under: "I got rid of my highest card that still loses.", flush_queen: "I led spades to smoke out the queen.",
  take_clean_trick_high: "No points in it, so I won it with a high card.", forced_win: "I had to win it.", first_trick_high: "No points on the first trick, so I threw a high club.",
  discard_queen: "I was out of the suit: the queen of spades went.", discard_high_spade: "I got rid of a big spade while the queen is out.", discard_heart: "I was out of the suit: a heart went.",
  discard_high: "I threw away a high card.", expert_lookahead: "I played it out a few ways and this came out best.", easy_slip: "Hmm, maybe not my best card.",
  // Euchre
  order_strength: "I had enough trump to order it up.", call_strength: "That suit was my best: I called it.", stuck_dealer: "I was stuck, so I named my best suit.",
  pass_weak: "Not enough trump to call.", pass_canadian: "Ordering you up would have meant going alone; my hand wasn't strong enough.", alone_sure_tricks: "I could count five tricks myself, so I went alone.",
  discard_short: "I threw away my weakest card, to be short in a suit.", farmer_swap: "Nines and tens only: I swapped three with the kitty.",
  defend_alone: "I could stop their loner on my own.", defend_together: "I played it with you.", pull_trump_boss: "I led the best trump left to pull theirs.",
  pull_trump: "I led trump to pull theirs.", lead_off_ace: "I led an ace.", lead_low_off: "I led low in a side suit.", lead_trump_only: "I had nothing but trump left.",
  lead_right_for_partner: "You called it, so I led the right bower to help.", lead_right_strong: "I held both bowers, so I led the right.", secure_trick: "I made sure we kept that trick.",
  trump_in: "I was out of that suit, so I trumped.",
};

// ---------------------------------------------------------------- title, picker, setup
function renderTitle() {
  const lock = S.care.lock, game = owns(S.last.game) && S.care.games.includes(S.last.game) ? S.last.game : "hearts";
  const fan = ["AS", "AH", "AD", "AC"].map((c, i) => `<span class="ace" style="--i:${i}; transform: rotate(${(i - 1.5) * 12}deg) translateY(${Math.abs(i - 1.5) * 6}px)" data-act="flip" aria-hidden="true"><span class="face">${svgFor(c)}</span><span class="back">${backSvg}</span></span>`).join("");
  $("#title").innerHTML = `<div class="stack title">
    <p class="kicker" data-act="kicker"><span>Play a game of cards at…</span></p><h1 class="wordmark">${cfg.brand.wordmark}</h1>
    <div class="hero"><div class="props">${titleProps()}</div><div class="fan">${fan}</div></div>
    <button class="btn big" data-act="deal" data-game="${game}">${S.cur ? "Back to the table" : `Deal: ${GAME_NAME[game]}`}</button>
    <div class="grid2">
      <button class="btn" data-act="go" data-to="picker">Games and rules</button>
      <button class="btn" data-act="go" data-to="boards">Leaderboards</button>
      <button class="btn" data-act="${lock ? "care" : "go"}" data-to="shop">Table shop</button>
      <button class="btn" data-act="go" data-to="stats">Is the deal fair?</button>
      <button class="btn" data-act="go" data-to="howto">How to play</button>
      <button class="btn" data-act="${lock ? "care" : "go"}" data-to="options">Options</button>
    </div>
    <div class="row" style="justify-content:center"><button class="link" data-act="restore">Restore purchases</button><button class="link" data-act="care" aria-label="Caregiver settings">Caregiver</button></div>
    ${familyTest ? `<button class="btn ghost" data-act="family">Family table test</button>` : ""}
  </div>`;
}

function renderPicker() { // playable games two to a shelf, then the closed boxes of what's coming
  const playable = Object.keys(cfg.games).filter((g) => !cfg.games[g].release && S.care.games.includes(g));
  const coming = [...Object.keys(cfg.games).filter((g) => cfg.games[g].release).map((g) => [g, GAME_NAME[g], `${GAME_NAME[g]}: coming soon. Included in Everything.`]),
    ...Object.entries(more.ROADMAP).map(([g, [name, said]]) => [g, name, `${said}, coming soon`])];
  const box = (g) => {
    const locked = !owns(g), sub = g === "hearts" ? "Free forever" : locked ? "Part of Everything" : "Ready to play";
    return `<button class="box" data-act="openbox" data-game="${g}" aria-label="${GAME_NAME[g]}, ${sub}${locked ? ", locked" : ""}">${tuckBox(g, GAME_NAME[g], { locked })}<span class="boxcap">${sub}<b class="play" aria-hidden="true">${locked ? "Have a look ›" : "Play ›"}</b></span></button>`;
  };
  const shelves = [];
  for (let i = 0; i < playable.length; i += 2) shelves.push(`<div class="shelf">${playable.slice(i, i + 2).map(box).join("")}</div>`);
  const rows = shelves.join("") + `<h2 class="shelfsign">Coming to the table</h2><div class="shelf soon">${coming.map(([g, name, said]) => `<div class="box soon" role="img" aria-label="${said}">${tuckBox(g, name, { soon: true })}</div>`).join("")}</div>`;
  const unlockRow = !platform.owns("everything") && !S.opt.comfort && !S.care.lock ? `<button class="btn" data-act="go" data-to="unlock">Unlock everything · $6.99 once</button>` : "";
  $("#picker").innerHTML = `<div class="stack"><h1 class="sign">Games and rules</h1>${rows}${unlockRow}<button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}

let setupGame = "hearts";
const explain = (d) => d.explain.replace(/\s*0 (turns it off|means [^.]*)\.$/, ""); // the control itself says "Off"
const customFor = (g) => (S.last.customBy ??= {})[g] ?? {}; // Custom rules are kept per game ("Points to win" isn't the same rule in Spades and Euchre)
const optsOf = (d) => d.type === "choice" ? d.choices : Array.from({ length: (d.range[1] - d.range[0]) / d.step + 1 }, (_, i) => d.range[0] + i * d.step);
function renderSetup() {
  const g = setupGame, L = S.last, defs = cfg.rules[g], r = rulesFor(cfg, g, L.preset, L.preset === "custom" ? customFor(g) : {}), levels = Object.entries(LEVEL_NAME);
  const name = (d) => `${d.name}<br><small class="muted">${esc(explain(d))}</small>`;
  let rules;
  if (L.preset === "custom") rules = defs.map((d) => d.type === "toggle" ? `<div class="row"><span>${name(d)}</span>${sw("rule", r[d.id], d.name, { attrs: `data-id="${d.id}"` })}</div>`
    : `<div class="row"><label for="rule-${d.id}">${name(d)}</label><select id="rule-${d.id}" data-act="rulesel" data-id="${d.id}">${optsOf(d).map((c) => `<option value="${esc(c)}" ${c === r[d.id] ? "selected" : ""}>${esc(fmt(d, c))}</option>`).join("")}</select></div>`).join("");
  else { // a preset: one line that says what it is; every rule is one tap away
    const first = (L.preset === "standard" ? defs : defs.filter((d) => d.presets[L.preset] !== d.presets.standard)).slice(0, 3);
    rules = `<details class="rules"><summary><span><b>${PRESET_NAME[L.preset]} rules</b> · ${first.map((d) => `${esc(d.name)}: ${esc(fmt(d, r[d.id]))}`).join(" · ")}</span><span class="see">See all ${defs.length}</span></summary>
      ${defs.map((d) => `<div class="row"><span>${name(d)}</span><b>${esc(fmt(d, r[d.id]))}</b></div>`).join("")}</details>`;
  }
  const seatRow = [1, 2, 3].map((s) => segRow((TEAMS(g) ? ["", "Left", "Partner", "Right"] : ["", "Left", "Across", "Right"])[s], "seat" + s, L.seats[s] || "bot", [["bot", "Computer"], ["human", "Person here"]])).join("");
  $("#setup").innerHTML = `<div class="stack">
    <h1>${GAME_NAME[g]}</h1>
    <div class="paper"><h2 id="rulesH">House rules</h2>${seg("preset", L.preset, Object.entries(PRESET_NAME), "rulesH").replace('class="seg"', 'class="seg presets"')}${rules}</div>
    <div class="paper"><h2>Players</h2>
      ${TEAMS(g) ? segRow("Partner plays", "partner", L.partner, levels) : ""}${segRow(TEAMS(g) ? "Opponents play" : "Computer players", "opps", L.opps, levels)}
      <p class="muted">Pass and play: pick "Person here" and hand the phone around.</p>${seatRow}</div>
    <div class="dealbar"><button class="btn big" data-act="deal" data-game="${g}">Deal</button></div>
    <button class="btn ghost" data-act="go" data-to="picker">Back</button></div>`;
}
const fmt = (d, v) => (d.type === "toggle" ? (v ? "On" : "Off") : d.id === "moon" ? { add: "+26 to others", choose: "Shooter chooses", auto: "+26, unless that loses", off: "Off" }[v] ?? v
  : d.id === "passing" ? v.replaceAll(",", ", ") : v === 0 || v === "off" ? "Off" : typeof v === "string" ? v[0].toUpperCase() + v.slice(1) : v);

// ---------------------------------------------------------------- the game
let G = null, runId = 0, pending = null, showTrick = null, whyNow = null;
function newGame(game, fixed = null) {
  closePeek(); tight = false;
  const L = S.last;
  L.game = game;
  const rules = rulesFor(cfg, game, L.preset, L.preset === "custom" ? customFor(game) : {});
  const seats = fixed || [0, 1, 2, 3].map((s) => {
    const kind = s === 0 || L.seats[s] === "human" ? "human" : "bot", level = TEAMS(game) && s === 2 ? L.partner : L.opps;
    return { kind, level, name: kind === "human" ? (s === 0 ? "You" : `Player ${s + 1}`) : BOTS[level][s - 1] };
  });
  G = { game, rules, preset: L.preset, seats, totals: undefined, // the first hand starts from its own game's empty totals
    handNo: 0, dealer: 3, history: [], st: null, viewer: 0, reasons: {}, over: null };
  track("game_start", { game, preset: L.preset, level: L.opps });
  startHand();
}
async function startHand() {
  if (net && !net.host) return guestHand();
  const m = MOD[G.game], seed = (G.nextSeed ??= newSeed()); // kept until it's dealt: a fingerprint, once shown, is never swapped for another
  const n = G.game === "euchre" ? 24 : 52, mine = G.seats[G.viewer]?.kind === "human" && !net && ((qs.has("fast") && qs.has("cut")) || (S.opt.comfort ? S.care.cut : S.opt.cut));
  const cut = !cutsDeal(G.game) ? 0 : mine ? await cutDeck(seed, n) : dealerCut(n);
  G.st = m.newHand(G.rules, seed, G.dealer, G.totals, G.handNo, cut);
  G.st.cut ??= cut; delete G.nextSeed;
  G.totals ??= structuredClone(G.st.totals);
  if (net) net.send({ t: "start", seed: G.st.seed, cut, game: G.game, rules: G.rules, preset: G.preset, seats: G.seats, dealer: G.dealer, handNo: G.handNo, totals: G.totals });
  G.reasons = {}; G.looked = {}; whyNow = null; closePeek();
  recordDeal(); // every game, every hand size: the ledger sorts them out
  S.cur = G; save();
  sound.shuffle();
  G.justDealt = true;
  announce(`Hand ${G.handNo + 1}. New cards are dealt.${G.game === "euchre" ? ` ${G.seats[G.st.dealer].name} deals; the upcard is the ${cardName(G.st.up)}.` : ""} ${more.handIntro(G.game, G.st, G.seats.map((x) => x.name))}${faceDown(G.viewer) ? " Your team is behind, so your cards are dealt face down: you may bid blind nil before you look." : ""}`, { interrupt: true });
  run();
}
// F1: the cut. The fingerprint (the seed's SHA-256, cut short) is shown first, so the shuffle is fixed before the player cuts;
// the deal is the shuffle rotated by the cut. Only offered for a game whose newHand(…, handNo, cut) really deals by the cut, so
// the score sheet never prints a cut the website can't reproduce.
const cutWorks = {};
function cutsDeal(game) {
  if (!(game in cutWorks)) { const m = MOD[game], s = newSeed(), deal = (c) => JSON.stringify(m.newHand(G.rules, s, 0, undefined, 0, c).hands); cutWorks[game] = deal(0) !== deal(17); }
  return cutWorks[game];
}
// P1-5 (passover 2): the dealer cuts at random unless you've asked to cut yourself (Options; the caregiver's switch in Comfort).
// Either way the cut and the fingerprint go on the score sheet, so every hand can be checked.
const dealerCut = (n) => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % (n - 1));
async function cutDeck(seed, n) { // on the table itself, before the cards come out
  const fp = fingerprint(seed);
  show("table"); $("#table").classList.add("predeal");
  const v = await dialog(`<h2>Cut the deck</h2><p>The shuffle is fixed before you cut: its fingerprint is <b class="seed fp">${fp.slice(0, 4)} ${fp.slice(4)}</b>, printed on the score sheet. Tap the deck where you'd like to cut it.</p>
    <button class="deck" data-dlg="cut" data-n="${n}" aria-label="Cut the deck">${backImg.repeat(9)}</button>
    <div class="stack"><button class="btn" data-dlg="dealer">Let the dealer cut</button></div>`);
  $("#table").classList.remove("predeal");
  const c = typeof v === "string" && v.startsWith("cut:") ? +v.slice(4) : dealerCut(n);
  announce(v?.startsWith?.("cut:") ? `You cut ${c} cards.` : `The dealer cut ${c} cards.`);
  return c;
}

// R2: when blind nil is open to a person, their cards stay face down until they look or bid it
const canBlind = (s) => G.game === "spades" && !!G.rules.blindNil && G.st.phase === "bid" && G.st.bids[s] === null && G.st.hands[s].length === 13 && G.st.totals.score[1 - team(s)] - G.st.totals.score[team(s)] >= G.rules.blindNilDown;
const faceDown = (s) => G.seats[s].kind === "human" && !G.looked?.[s] && (pending?.seat === s && pending.kind === "bid" ? pending.legal.some((a) => a.blind) : canBlind(s)); // the engine's word once it's asking

const humans = () => G.seats.filter((s) => s.kind !== "bot").length; // "remote": a person at another device
async function run() {
  const my = ++runId, m = MOD[G.game], st = G.st;
  pending = null; // a question from a loop that's been replaced is nobody's to answer, and must not draw this hand's choices
  if (!$("#handoff").hidden) { $("#handoff").hidden = true; cover(false); } // a cover left up by the last game's loop belongs to nobody now
  show("table"); handLive = st.phase !== "done"; drawTable();
  if (G.justDealt) { G.justDealt = false; await dealIn(); }
  while (st.phase !== "done") {
    if (my !== runId) return;
    const s = st.turn, seat = G.seats[s];
    let action = null;
    if (seat.kind === "human") {
      if (s !== G.viewer && humans() > 1) await handoff(s);
      if (my !== runId) return;
      action = await ask(s);
      if (my !== runId) return;
      if (net && !net.host) { net.send({ t: "act", seat: s, a: action }); action = (await net.did(s)) ?? action; }
    } else if (seat.kind === "remote" && net?.alive(seat.player)) { // the host hears the guest; a guest hears the host
      const n = { pass: 3, exchange: G.rules.blindSwap }[st.phase], ok = m.legal(st); // a pass or the blind nil exchange is an array of n of your own cards
      action = net.host ? await net.intent(s, seat.player, (a) => (n ? Array.isArray(a) && a.length === n && new Set(a).size === n && a.every((c) => ok.includes(c)) : ok.includes(a))) : await net.did(s);
      if (my !== runId) return;
    }
    if (action === null) { // a bot, or the seat of someone who left
      await wait((st.phase === "play" ? 520 : 380) * speed());
      await speech.idle(); // when the table is read aloud, the bots wait for the voice to finish
      if (vo) await said.idle(); // and for VoiceOver to finish reading the last thing that happened
      while (dialog.pause && dialog.done) await wait(120); // and while the player reads a Why? answer, or has paused
      if (my !== runId) return;
      const d = decide(m.view(st, s), seat.level);
      action = d.action; G.reasons[s] = d.reason;
    }
    const before = st.history.length, phase = st.phase;
    m.apply(st, action);
    if (net) await net.applied(st, s, action);
    if (phase === "bid") announce(`${seat.name} ${seat.kind === "human" && s === 0 ? "bid" : "bids"} ${action.blind ? "blind nil" : action.bid === 0 ? (G.game === "spades" ? "nil" : "zero") : action.bid}.${more.bidsDone(G.game, st)}`);
    if (G.game === "euchre" && phase !== "play") euchreSay(s, action, phase);
    if (phase === "pass" && st.phase === "play") announce(`Cards passed. You received ${(st.received[G.viewer] || []).map(cardName).join(", ")}.`);
    if (phase === "exchange") { const to = partner(s), n = action.length, me = G.viewer; // R3: the blind nil exchange, said from where you sit
      announce(to === me ? `${seat.name} passed you the ${cardList(action)}.` : s === me ? `You passed the ${cardList(action)} to ${G.seats[to].name}.` : `${seat.name} passed ${n} card${n === 1 ? "" : "s"} to ${G.seats[to].name}.`); }
    if (st.history.length > before) await played(s, action);
    else drawTable();
    save();
  }
  handLive = false;
  if (my !== runId) return;
  if (G.history.at(-1)?.seed === st.seed) { renderSheet(); return show("sheet"); } // reopened on the score sheet: the hand is already scored
  finishHand();
}
async function played(seat, card) {
  sound.card(); if (G.seats[seat].kind === "human" && S.opt.haptics) platform.haptic();
  const st = G.st, done = !st.trick.length, name = G.seats[seat].name;
  whyNow = null; // a Why? answer stays up until the next card
  if (done) { // one sentence for the end of a trick, so the last card is never lost under "takes the trick"
    const w = st.turn, ours = TEAMS(G.game) ? team(w) === team(G.viewer) : w === G.viewer, takes = G.seats[w].name === "You" ? "take" : "takes";
    announce(w === seat ? `${name} played the ${cardName(card)} and ${takes} the trick.` : `${name} played the ${cardName(card)}. ${G.seats[w].name} ${takes} the trick.`);
    if (ours && S.opt.haptics) platform.haptic("medium");
    G.lastWon = w;
  } else announce(`${name} played the ${cardName(card)}.`);
  showTrick = done ? st.lastTrick : st.trick;
  drawTable(seat);
  if (!done) return;
  await wait(900 * speed());
  const w = st.turn, [dx, dy] = offset(pos(w), 3.2);
  const els = [...document.querySelectorAll("#trick .card")];
  sound.sweep();
  await Promise.all(els.map((el) => el.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 }], { duration: 320 * speed(), easing: "ease-in", fill: "forwards" }).finished.catch(() => {})));
  showTrick = null; drawTable();
}

async function dealIn() { // cards fly from the dealer to your hand, one by one
  if (calm()) return;
  const els = [...document.querySelectorAll("#hand .card")], [dx, dy] = offset(pos(G.st.dealer), 3), hand = $("#hand").getBoundingClientRect();
  const fromY = window.innerHeight * 0.42 - hand.top + dy;
  const anims = els.map((el, i) => el.animate([{ transform: `translate(${dx + hand.width / 2 - parseFloat(el.style.left)}px, ${fromY}px) rotate(${-20 + i * 3}deg) scale(.6)`, opacity: 0 }, { transform: "none", opacity: 1 }],
    { duration: 380 * speed(), delay: i * 45 * speed(), easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" }));
  // never hold up the game: if the animations stall (a backgrounded page, a slow device), finish them and carry on
  await Promise.race([Promise.all(anims.map((a) => a.finished.catch(() => {}))), wait((380 + els.length * 45) * speed() + 400)]);
  anims.forEach((a) => { try { a.finish(); } catch {} });
}
function confetti() { // a few cards drift down past the winner's name; decoration only
  const box = document.createElement("div");
  box.className = "confetti"; box.setAttribute("aria-hidden", "true");
  box.innerHTML = ["AH", "KS", "QD", "JC", "AS", "10H".replace("10", "T"), "KD", "QH"].map((c) => `<span>${svgFor(c)}</span>`).join("");
  $("#results").appendChild(box);
  [...box.children].forEach((el, i) => el.animate([{ transform: `translate(${(i * 13) % 100}vw, -20vh) rotate(${i * 40}deg)` }, { transform: `translate(${((i * 13) % 100) + (i % 2 ? 12 : -12)}vw, 110vh) rotate(${i * 40 + 280}deg)` }],
    { duration: 3200 + i * 260, delay: i * 140, easing: "ease-in", fill: "both" }));
  setTimeout(() => box.remove(), 6500);
}

// where each seat sits relative to whoever is holding the phone: 0 bottom, 1 left, 2 top, 3 right
const pos = (seat) => (seat - G.viewer + 4) % 4;
const offset = (p, k = 0.62) => { const cw = sizes().tcw; return [[0, cw * k * 0.9], [-cw * k, 0], [0, -cw * k * 0.9], [cw * k, 0]][p]; };

// ---------------------------------------------------------------- the table, patched in place: the plates are built once per game, viewer
// and look; a played card's node is removed, nothing is rebuilt; every size it needs is read before the first write (scripts/soak.mjs)
const sizes = () => (M ??= { cw: css("--cw"), tcw: css("--tcw"), tap: css("--tap"), fsS: css("--fs-s"), safeB: parseFloat(getComputedStyle($("#hand")).bottom) - 8 });
const tpl = document.createElement("template");
const make = (html) => { tpl.innerHTML = html; return tpl.content.firstElementChild; };
const setHTML = (e, h) => { if (e._h === h) return false; e._h = h; e.innerHTML = h; return true; };
const setText = (e, t) => { if (e.textContent === t) return false; e.textContent = t; return true; };
const setStyle = (e, k, v) => { const c = (e._s ??= {}); if (c[k] !== v) { c[k] = v; if (k[0] === "-") e.style.setProperty(k, v); else e.style[k] = v; } };
const setAttr = (e, k, v) => { if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
let seatKey = "";

function drawTable(justPlayed = -1) {
  if (!G?.st || !$("#handoff").hidden) return; // while the pass-the-phone cover is up, nothing of anyone's hand is drawn under it
  const st = G.st, me = G.viewer, Z = sizes(), comfort = !!S.opt.comfort, mine = pending && pending.seat === me ? pending : null;
  $("#readBtn").hidden = !S.opt.speak;
  // seats: words patched; the plates themselves only when the game, the viewer or the look changes
  const key = `${G.game}|${me}|${look}|${G.seats.map((x) => x.kind + x.level + x.name).join()}`;
  if (key !== seatKey) { seatKey = key; geo = null; $("#seats").innerHTML = [0, 1, 2, 3].map(plateShell).join(""); }
  const plates = $("#seats").children;
  for (let s = 0; s < 4; s++) if (patchPlate(plates[s], s, mine)) geo = null;
  const hh = drawHand(mine, Z);
  // the room between the seats and the hand: plate sizes come from the last layout, unless their words just changed
  const platesMoved = !geo;
  if (!geo) geo = { free0: Math.max(...[2, ...(comfort ? [1, 3] : [])].map((p) => plates[(me + p) % 4].getBoundingClientRect().bottom)), meH: plates[me].offsetHeight,
    sideW: Math.max(plates[(me + 1) % 4].offsetWidth, plates[(me + 3) % 4].offsetWidth) };
  const meBottom = Z.safeB + hh + 18, free1 = innerHeight - meBottom - geo.meH, free0 = geo.free0, ipad = innerWidth >= 700;
  setStyle(plates[me], "bottom", meBottom + "px");
  // the trick: in Comfort a row of named cards under the seats (it never competes with the big hand); on iPad the cards sit out
  // toward their players, with a name under each; elsewhere close around the middle
  let mid, tw = Z.tcw, place;
  if (comfort) {
    tw = Math.max(44, Math.min(Z.tcw, (free1 - free0 - 20 - Z.fsS * 1.3) / 1.4));
    mid = free0 + 8 + tw * 0.7;
    place = (p) => [([3, 0, 1, 2][p] - 1.5) * (tw + 10), 0, 0]; // left, across, right, you
  } else {
    mid = (free0 + free1) / 2;
    const d = ipad ? Math.max(Z.tcw * 0.62, Math.min(innerWidth * 0.17, (free1 - free0) * 0.22)) : Z.tcw * 0.62;
    place = (p) => [...[[0, d * 0.9], [-d, 0], [0, -d * 0.9], [d, 0]][p], 1];
  }
  const tb = $("#table"), box = $("#trick"), tr = showTrick || st.trick;
  setStyle(tb, "--free0", free0 + "px"); setStyle(tb, "--free1", free1 + "px"); setStyle(tb, "--mid", mid + "px"); setStyle(box, "--tw", tw + "px");
  setStyle(tb, "--sideW", geo.sideW + "px"); // your plate is never wider than the gap between the side seats: its words wrap instead
  box.classList.toggle("named", comfort || ipad);
  const keys = new Set(tr.map((t) => t.seat + t.card + look));
  for (const e of [...box.children]) if (!keys.has(e.dataset.k)) e.remove();
  for (const t of tr) {
    const k = t.seat + t.card + look, [x, y, tilt] = place(pos(t.seat)), name = esc(G.seats[t.seat].name);
    let e = box.querySelector(`[data-k="${k}"]`);
    if (!e) {
      e = box.appendChild(make(`<span class="card" role="img" data-k="${k}" aria-label="${name}: ${cardName(t.card)}">${svgFor(t.card)}<span class="who" aria-hidden="true">${name}</span></span>`));
      if (t.seat === justPlayed) { const [fx, fy] = offset(pos(t.seat), 3); e.animate([{ translate: `${fx}px ${fy}px`, opacity: 0.4 }, { translate: "0 0", opacity: 1 }], { duration: 240 * speed(), easing: "ease-out" }); }
    }
    setStyle(e, "transform", `translate(${x}px, ${y}px) rotate(${tilt ? ((t.seat * 7) % 11) - 5 : 0}deg)`);
  }
  // trump, always in sight: a pill in the bar (Euchre once it's called, Oh Hell, Whist), and the turned card itself beside your
  // plate when there's room for it at table size
  const trump = (G.game === "euchre" || more.NAMES[G.game]) && st.trump, pill = $("#trumpPill"), turned = !!more.NAMES[G.game] && st.trumpCard && !comfort && !tight;
  pill.hidden = !(trump || (more.NAMES[G.game] && !st.trump));
  setHTML(pill, trump ? `<small>Trump</small><b class="s${trump}">${SUIT_SIGN[trump]}</b>` : "<small>No trump</small>");
  setAttr(pill, "aria-label", trump ? `Trump is ${SUIT_WORD[trump].toLowerCase()}.` : "No trump this hand.");
  const tt = $("#trump"), c1 = setHTML(tt, turned ? more.trumpTile(st, svgFor, G.seats.map((x) => x.name)) : "");
  setStyle(tt, "bottom", meBottom + "px");
  const c2 = setHTML($("#center"), centre(mine)), say = sayLine(mine, comfort), c3 = setHTML($("#say"), say ? `<div class="say">${esc(say)}</div>` : "");
  // the score chip: what it shows (initials when the words are big and the screen is small), and all of it for VoiceOver
  const sc = G.totals.score, us = team(me), low = G.game === "hearts", rank = 1 + sc.filter((x, s) => s !== me && (low ? x < sc[me] : x > sc[me])).length;
  const c4 = setText($("#scoreChip"), TEAMS(G.game) ? `Us ${sc[us]} · Them ${sc[1 - us]}` : tight ? `You ${sc[me]} · ${["1st", "2nd", "3rd", "4th"][rank - 1]}` : G.seats.map((x, s) => `${s === me ? "You" : x.name} ${sc[s]}`).join(" · "));
  $("#table").classList.toggle("tight", tight);
  setAttr($("#scoreChip"), "aria-label", `Score: ${TEAMS(G.game) ? `us ${sc[us]}, them ${sc[1 - us]}` : G.seats.map((x, s) => `${s === me ? "you" : x.name} ${sc[s]}`).join(", ")}.${trump ? ` ${SUIT_WORD[trump]} are trump.` : ""} Double-tap for details.`);
  // when a panel, the say line, the turned card or the chip lands on a seat, the trick or the hand, switch to the compact forms
  if (!tight && (c1 || c2 || c3 || c4 || platesMoved) && crowded()) { tight = true; geo = null; return drawTable(justPlayed); }
}
function crowded() { // one layout read, only when what's in the middle has just changed
  const box = (e) => e.getBoundingClientRect(), hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  const mine = [...document.querySelectorAll("#center > *, #say > *, #trump > *, #scoreChip")].map(box).filter((q) => q.height);
  const theirs = [...document.querySelectorAll("#seats .seat, #trick .card, #hand"), document.querySelector(".bar #menuBtn")].filter((e) => !e.getAnimations().length).map(box).filter((q) => q.height);
  const touch = (list) => list.some((a, i) => list.some((b, j) => j > i && hit(a, b)));
  const seats = [...document.querySelectorAll("#seats .seat")].map(box), bar = [...document.querySelectorAll(".bar > :not([hidden])")].map(box);
  // and so are two plates that touch (long words at a big text size), pills in the bar that touch, or a chip on two lines
  const lines = document.createRange(); lines.selectNodeContents($("#scoreChip"));
  return new Set([...lines.getClientRects()].map((q) => Math.round(q.top))).size > 1 || mine.some((p) => theirs.some((t) => hit(p, t))) || touch(seats) || touch(bar);
}
// an answer that opens on its own (Why?, a suggestion) where no line fits beside the cards; the bots wait while it's open
const answerBox = (title, text) => dialog(`<h2>${esc(title)}</h2><p class="answer">${esc(text)}</p><button class="btn big" data-dlg="">OK</button>`, { user: true, pause: true, kind: "why" });
const dialogP = (html, o) => dialog(html, { ...o, pause: true });

// a seat plate: name, what they've done, level pips, the backs of their cards, and a Why? tab after a bot plays. Pinned in size:
// nothing that appears later (a bid, the Why? tab) makes it grow. VoiceOver reads one sentence with all of it.
function plateShell(s) {
  const seat = G.seats[s], p = pos(s), bot = seat.kind === "bot", tag = bot ? "button" : "div";
  return `<${tag} class="seat ${["s-me", "s-left", "s-top", "s-right"][p]}"${bot ? ` data-act="why" data-seat="${s}"` : ""}><span class="vh"></span><b aria-hidden="true">${esc(seat.name)}</b><span class="st" aria-hidden="true"></span>${p ? "" : `<span class="ask" aria-hidden="true"></span>`}${bot ? `<span class="pips" aria-hidden="true">${"●".repeat({ easy: 1, standard: 2, expert: 3, extreme: 4 }[seat.level])}</span>` : ""}${p ? `<span class="backs" aria-hidden="true"></span>` : ""}${bot ? `<span class="whytab" aria-hidden="true" hidden>Why?</span>` : ""}</${tag}>`;
}
const whyOf = (s) => G.seats[s].kind === "bot" && G.reasons[s] && WHY[G.reasons[s].split(":")[0]];
function patchPlate(e, s, mine) { // true when its words changed (its size may have)
  const st = G.st, bits = statusBits(s), turn = st.turn === s && st.phase !== "done";
  let moved = false;
  e.classList.toggle("turn", turn);
  const h = bits.map((b) => `<span>${esc(b)}</span>`).join("");
  if (e._st !== h) { e._st = h; e.querySelector(".st").innerHTML = h; moved = true; }
  const bk = e.querySelector(".backs"), n = Math.min(3, st.hands[s].length);
  if (bk && bk._n !== n) { bk._n = n; bk.innerHTML = backImg.repeat(n); }
  const wt = e.querySelector(".whytab");
  if (wt) wt.hidden = !whyOf(s);
  const ask = e.querySelector(".ask"); // Comfort (and a tight table): "Tap a card" rides on your own plate, where the eye already is
  if (ask) { const t = (S.opt.comfort || tight) && mine?.kind === "play" ? (mine.sel?.length ? "Tap it again" : "Tap a card") : ""; if (ask.textContent !== t) { ask.textContent = t; moved = true; } }
  setText(e.querySelector(".vh"), seatSentence(s, bits, turn));
  return moved;
}
function statusBits(s) {
  const st = G.st, tag = TEAMS(G.game) && s === partner(G.viewer) && !S.opt.comfort ? ["Partner"] : [];
  const bits = G.game === "euchre" ? euchreStatus(s) : more.plateStatus(G.game, st, s) ?? (G.game === "spades"
    ? (st.bids[s] === null ? [] : [st.bids[s] === 0 ? (st.blind[s] ? "Blind nil" : "Nil") : `Bid ${st.bids[s]}`, `took ${st.tricks[s]}`])
    : [pts(st.taken[s].reduce((n, c) => n + hearts.points(c, G.rules), 0))]);
  return [...tag, ...bits];
}
const SIGN_WORD = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" };
const pts = (n) => `${n} ${Math.abs(n) === 1 ? "pt" : "pts"}`;
function seatSentence(s, bits, turn) { // "June, opponent, Standard. Bid nil, took 0. June's turn. Double-tap to hear why."
  const seat = G.seats[s], me = G.viewer, name = seat.name;
  const who = s === me ? (name === "You" ? "You" : `${name}, you`)
    : [name, TEAMS(G.game) && s === partner(me) ? "your partner" : "opponent", seat.kind === "bot" ? LEVEL_NAME[seat.level] : seat.kind === "remote" ? "on another phone" : "playing here"].join(", ");
  const state = bits.filter((b) => b !== "Partner").join(", ").replace(/\bpts?\b/, (p) => (p === "pt" ? "point" : "points")).replace(/[♠♥♦♣]/g, (c) => SIGN_WORD[c]);
  return `${who}.${state ? ` ${state[0].toUpperCase()}${state.slice(1)}.` : ""}${turn ? (s === me ? " Your turn." : ` ${name}'s turn.`) : ""}${whyOf(s) ? " Double-tap to hear why." : ""}`;
}
// one line from the table, just above your plate: a Why? answer, whose turn it is, what to tap
function sayLine(mine, comfort) {
  if (whyNow) return whyNow.text;
  if (comfort || tight) return whyNow && !comfort ? whyNow.text : ""; // Comfort and tight tables: the prompt rides on your plate; answers open on their own
  const st = G.st;
  if (mine?.kind === "play") return mine.sel?.length ? "Tap the card again to play it" : "Your turn: tap a card";
  if (G.game !== "euchre" && st.phase === "bid" && G.seats[st.turn].kind === "bot") return `${G.seats[st.turn].name} is thinking…`;
  if (st.phase === "pass" && !mine) return "Passing…";
  return "";
}

const ORDER = { S: 0, H: 1, C: 2, D: 3 };
const sortH = (a, b) => ORDER[a[1]] - ORDER[b[1]] || hearts.pow(a) - hearts.pow(b);
const sortE = (a, b) => { const t = G.st.trump, k = (c) => (euchre.eff(c, t) === t ? -1 : ORDER[euchre.eff(c, t)]); return k(a) - k(b) || euchre.pow(a, t) - euchre.pow(b, t); }; // trump on the left
const sortS = (a, b) => { const j = G.rules.jokers, ea = spades.eff(a, j), eb = spades.eff(b, j); return ORDER[ea] - ORDER[eb] || spades.pow(a, j) - spades.pow(b, j); };

// your hand, patched: rows so every card's visible strip is at least one tap target wide and tall, as even as possible (4-3-3-3,
// not 4-4-4-1). Comfort shows a selection with a brass outline and a tab instead of lifting the card over its neighbours.
function drawHand(mine, Z) {
  const box = $("#hand"), st = G.st, me = G.viewer, down = faceDown(me), kind = mine?.kind;
  const hand = [...st.hands[me]].sort(G.game === "euchre" ? sortE : G.game === "spades" ? sortS : sortH);
  const legal = kind === "play" || kind === "exchange" ? new Set(mine.legal) : null, any = ["pass", "farmer", "discard"].includes(kind);
  const hint = kind === "play" && !mine.sel?.length && S.hands < 3 && !calm(); // the first few hands: the playable cards rise and settle
  for (const e of [...box.children]) if (!hand.includes(e.dataset.card)) e.remove();
  const n = hand.length, W = innerWidth - 24, cw = Z.cw, ch = cw * 1.4, T = Z.tap;
  let per = n;
  while (per > 1 && (W - cw) / (per - 1) < T) per--;
  const rows = Math.max(1, Math.ceil(n / Math.max(1, per)));
  per = Math.ceil(n / rows);
  const step = per > 1 ? Math.min(cw * 0.72, (W - cw) / (per - 1)) : 0, rowStep = Math.max(T, ch * 0.42);
  const size = (r) => Math.floor(n / rows) + (r < n % rows ? 1 : 0), f = (down ? "d" : "u") + look;
  let r = 0, k = 0;
  hand.forEach((c, i) => {
    if (k === size(r)) { r++; k = 0; }
    let e = box.children[i];
    if (e?.dataset.card !== c) box.insertBefore((e = [...box.children].find((x) => x.dataset.card === c) ?? make(`<button class="card" data-card="${c}" data-act="card"></button>`)), box.children[i] ?? null);
    if (e.dataset.f !== f) { e.dataset.f = f; e.innerHTML = down ? backSvg : svgFor(c); }
    const sel = !!mine?.sel?.includes(c), dim = !!legal && !legal.has(c) && !down, on = !down && !!mine && (legal ? legal.has(c) : any);
    if (e.disabled === on) e.disabled = !on;
    e.classList.toggle("sel", sel); e.classList.toggle("dim", dim); e.classList.toggle("hint", hint && on);
    setAttr(e, "aria-label", down ? "Face-down card" : `${cardName(c)}${dim ? ", can't play now" : sel ? ", selected" : ""}`);
    setStyle(e, "left", 12 + (W - (cw + step * (size(r) - 1))) / 2 + k * step + "px"); setStyle(e, "top", r * rowStep + "px"); setStyle(e, "zIndex", String(i));
    k++;
  });
  const h = n ? ch + (rows - 1) * rowStep : 0;
  setStyle(box, "height", h + "px");
  return h;
}

function centre(mine) {
  const st = G.st, me = G.viewer;
  if (faceDown(me)) { // R2: blind nil is open to you, so your cards are still face down
    const now = mine?.kind === "bid";
    return `<div class="say">Your team is behind: you may bid blind nil before you look at your cards${now ? "" : ", when it's your turn"}.</div>
      <div class="callpad" style="--n:${now ? 2 : 1}"><button class="btn big" data-act="look">Look at my cards</button>${now ? `<button class="btn" data-act="bid" data-v="blind">Bid blind nil</button>` : ""}</div>`;
  }
  if (G.game === "euchre") return euchreCentre(mine);
  if (mine?.kind === "bid" && G.game === "ohhell") return S.opt.comfort ? more.bidPanel(mine, st, suggest(mine)) : more.bidPanel(mine, st) + suggest(mine);
  if (mine?.kind === "bid") {
    const nums = mine.legal.filter((a) => !a.blind);
    if (S.opt.comfort || tight) { // a stepper keeps the big hand in view: one row, the number on the brass Bid button itself; below 1 is nil
      const ok = nums.map((a) => a.bid);
      mine.step = Math.min(13, Math.max(0, mine.step ?? 3));
      if (!ok.includes(mine.step)) mine.step = ok.reduce((x, y) => (Math.abs(y - mine.step) < Math.abs(x - mine.step) ? y : x));
      return `<div class="row stepper"><button class="btn" data-act="step" data-v="-1" aria-label="One less">−</button>
        <button class="btn big" data-act="bid" data-v="${mine.step}">Bid ${mine.step === 0 ? "nil" : mine.step}</button><button class="btn" data-act="step" data-v="1" aria-label="One more">+</button>${suggest(mine)}</div>`;
    }
    return `<div class="say">Your bid</div><div class="bidpad">${nums.map((a) => `<button class="btn" data-act="bid" data-v="${a.bid}">${a.bid === 0 ? "Nil" : a.bid}</button>`).join("")}</div>${suggest(mine)}`;
  }
  if (mine?.kind === "pass") {
    const dir = { 1: "left", 2: "across", 3: "right" }[st.dir];
    return `<div class="say">Pick 3 cards to pass ${dir} (${mine.sel.length}/3)</div>${mine.sel.length === 3 ? `<button class="btn big" data-act="pass">Pass ${dir}</button>` : ""}`;
  }
  if (mine?.kind === "exchange") { // R3: the blind nil exchange, N cards across the table to your partner
    const n = G.rules.blindSwap, to = esc(G.seats[partner(me)].name);
    return `<div class="say">Pick ${n} card${n === 1 ? "" : "s"} to pass to ${to} (${mine.sel.length}/${n})</div>${mine.sel.length === n ? `<button class="btn big" data-act="swap">Pass to ${to}</button>` : ""}`;
  }
  if (mine?.kind === "moon") return `<div class="say">You shot the moon!</div><button class="btn big" data-act="moon" data-v="add">Everyone else +26</button><button class="btn" data-act="moon" data-v="sub">Take 26 off my score</button>`;
  return "";
}
// P2-6: a new bidder can ask what a Standard player would bid, and why. Comfort: a "?" at the end of the stepper row (the answer
// shows over the seat row), since an iPhone SE has no room for another row above the big hand
function suggest(mine) {
  if (S.opt.comfort || tight) return `<button class="btn" data-act="suggest" aria-label="Suggest a bid">Hint</button>`;
  if (mine.hint) return `<div class="say small">${esc(mine.hint)}</div>`;
  return `<button class="btn ghost" data-act="suggest">Suggest a bid</button>`;
}

const ASK = { pass: "Choose three cards to pass.", moon: "You shot the moon! Add 26 to everyone else, or take 26 off your score?" };
function ask(seat) { // resolves with the human's action
  const st = G.st, m = MOD[G.game];
  return new Promise((resolve) => {
    const legal = m.legal(st);
    pending = { seat, legal, kind: st.phase === "play" ? "play" : st.phase, sel: [], alone: false, resolve: (a) => { pending = null; resolve(a); } };
    drawTable();
    if (S.opt.haptics) platform.haptic("medium");
    const k = pending.kind, n = G.rules.blindSwap;
    announce(k === "play" ? (S.opt.comfort || S.opt.confirm ? "Your turn: tap a card, then tap it again to play it." : "Your turn: tap a card.")
      : k === "bid" ? (faceDown(seat) ? "Your turn to bid. Your cards are face down: look at your cards, or bid blind nil." : more.bidPrompt(G.game, st) || "Your turn to bid.")
      : k === "exchange" ? `Pass ${n} card${n === 1 ? "" : "s"} to ${G.seats[partner(seat)].name}.` : ASK[k] || EUCHRE_ASK[k]);
    // VoiceOver and the keyboard land where the choice is (your hand, or the panel), unless they're already there
    const a = document.activeElement, t = $("#table");
    if (!a || a === document.body || a === t || !t.contains(a)) (["play", "pass", "discard", "farmer", "exchange"].includes(k) && !faceDown(seat) ? $("#hand") : $("#center button") || $("#hand")).focus({ preventScroll: true });
  });
}
async function handoff(s) {
  const el = $("#handoff");
  $("#hand").replaceChildren(); $("#trick").replaceChildren(); // nothing of the last player's cards stays under the cover
  el.innerHTML = `<h2 class="onfelt">Pass the phone to ${esc(G.seats[s].name)}</h2><button class="btn big" data-act="handoff" data-seat="${s}">I'm ${esc(G.seats[s].name)}: show my cards</button>`;
  el.hidden = false; cover(true); el.querySelector("button").focus();
  await new Promise((r) => (handoff.done = r));
  el.hidden = true; cover(false); G.viewer = s; drawTable();
}
const cover = (on) => { for (const e of $("#table").children) if (e.id !== "handoff") e.inert = on; }; // the cover is the only thing you can reach

function finishHand() {
  closePeek();
  const m = MOD[G.game], st = G.st, sc = m.score(st), me = 0;
  const lines = sc.lines;
  if (G.game === "spades") { const mine = lines.filter((l) => l.team === team(me)); if (mine.some((l) => l.kind === "set" || ((l.kind === "nil" || l.kind === "blindNil") && !l.made))) sound.set(); else sound.made(); }
  else if (more.NAMES[G.game]) more.goodHand(G.game, lines.filter((l) => (l.team ?? l.seat) === me)) ? sound.made() : sound.set();
  if (G.game === "euchre" && lines[0].team !== null) { if (lines[0].team === team(me)) sound.made(); else if (lines[0].kind.includes("uchre")) sound.set(); }
  G.history.push({ seed: st.seed, fp: fingerprint(st.seed), cut: st.cut ?? 0, size: st.size, dealer: st.dealer, n: G.handNo + 1, lines, totals: sc.totals, bids: st.bids && [...st.bids], tricks: [...st.tricks], moon: st.moon });
  G.totals = sc.totals; G.handNo++; G.dealer = (G.dealer + 1) % 4; S.hands++;
  G.over = m.winner(G.totals, G.rules);
  if (G.over !== null && net) { net.leave(); net = null; }
  track("hand_end", { game: G.game, preset: G.preset, level: S.last.opps, hands_this_session: ++sessionHands });
  save(); renderSheet(); show("sheet");
}
let sessionHands = 0;
// "First to 500: you need 455 more" (the score sheet and the score pad)
function goalLine() {
  const r = G.rules, sc = G.totals.score;
  if (TEAMS(G.game) && r.target) { const us = sc[team(G.viewer)]; return us >= r.target ? `First to ${r.target}: you're there.` : `First to ${r.target}: you need ${r.target - us} more.`; }
  if (G.game === "hearts") return `The game ends when someone reaches ${r.endScore}. Low score wins.`;
  return "";
}
// a seed breaks only between its groups of letters, never inside one
const seedHTML = (seed) => String(seed).split("-").map((g) => `<span>${esc(g)}</span>`).join("-<wbr>");

function renderSheet() {
  const h = G.history[G.history.length - 1], sp = TEAMS(G.game), bags = G.game === "spades";
  const who = (l) => G.seats[l.seat].name;
  const label = (l) => {
    switch (l.kind) {
      case "made": if (G.game === "euchre") return euchreLine(l); return `Bid ${l.bid}, took ${l.took}`;
      case "set": return `Bid ${l.bid}, took ${l.took}: set`;
      case "nil": return `${who(l)}: nil ${l.made ? "made" : "broken"}`;
      case "blindNil": return `${who(l)}: blind nil ${l.made ? "made" : "broken"}`;
      case "nilBags": return `${who(l)}'s broken nil: ${l.took} bag${l.took === 1 ? "" : "s"}`;
      case "bags": return `No bid, ${l.took} bags`;
      case "boston": return "Boston: all 13 tricks";
      case "bagPenalty": return "Too many bags: penalty";
      case "moon": return `${who(l)} shot the moon (${l.choice === "sub" ? "took 26 off" : "everyone else +26"})`;
      case "march": case "loner": case "lonerMarch": case "euchre": case "loneEuchre": case "thrown": return euchreLine(l);
      default: return more.sheetLabel(l, who) ?? who(l);
    }
  };
  const groups = sp ? [0, 1].map((t) => ({ name: t === 0 ? `You and ${G.seats[2].name}` : `${G.seats[1].name} and ${G.seats[3].name}`, rows: h.lines.filter((l) => l.team === t || (l.team === null && t === 0)), total: h.totals.score[t], bags: h.totals.bags?.[t] }))
    : [{ name: "This hand", rows: h.lines, total: null }];
  const table = groups.map((g) => `<h3>${esc(g.name)}</h3><table>${g.rows.map((l) => `<tr><td>${esc(label(l))}</td><td class="n ${l.pts < 0 ? "neg" : ""}">${l.pts > 0 ? "+" : ""}${l.pts}</td></tr>`).join("")}
    ${g.total !== null ? `<tr><th>Total${bags ? ` · ${g.bags} bag${g.bags === 1 ? "" : "s"}` : ""}</th><td class="n">${g.total}</td></tr>` : ""}</table>`).join("");
  const totals = sp ? "" : `<table>${G.seats.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="n">${h.totals.score[i]}</td></tr>`).join("")}</table>`;
  const mine = sp ? h.lines.filter((l) => l.team === 0) : h.lines.filter((l) => l.seat === 0);
  const st = G.game === "euchre" ? euchreStamp(h.lines[0]) : more.sheetStamp(G.game, mine) ?? (sp ? (mine.some((l) => l.kind === "set") ? stamp("Set", "#b03a2e") : mine.some((l) => l.kind === "boston") ? stamp("Boston!", "#2f5fa8") : mine.some((l) => l.kind === "nil" && l.made) ? stamp("Nil made", "#2f7a4f") : mine.some((l) => l.kind === "made") ? stamp("Made it", "#2f7a4f") : "")
    : h.moon === 0 ? stamp("Moon!", "#2f5fa8") : mine[0]?.pts === 0 ? stamp("Clean hand", "#2f7a4f") : "");
  const goal = G.over === null ? goalLine() : "";
  $("#sheet").innerHTML = `<div class="stack"><div class="paper pad spiral">${st}<h1>Hand ${h.n}</h1>${table}${sp ? "" : `<h3>Game</h3>${totals}`}${goal ? `<p class="goal">${esc(goal)}</p>` : ""}
    <p class="muted">Deal #${S.hands} · dealer: ${esc(G.seats[h.dealer].name)} (${["you", "left of you", "across from you", "right of you"][h.dealer]}) · seed <span class="seed">${seedHTML(h.seed)}</span>${h.cut ? ` · cut ${h.cut}` : ""} · fingerprint <span class="seed">${h.fp ?? fingerprint(h.seed)}</span></p>
    <button class="link" style="color:var(--ink)" data-act="seedinfo">What is the seed?</button></div>
    ${trialPlate()}<button class="btn big" data-act="next">${G.over !== null ? "See who won" : "Next hand"}</button></div>`;
}
// P1-10: a table theme tried for one hand asks, after the hand, whether to keep it (never during the hand)
let trial = null;
function trialPlate() {
  if (!trial) return "";
  const t = THEMES[trial], price = priceOf(t.tier);
  return `<div class="paper"><h2>How was ${esc(t.name)}?</h2><p>You played that hand on it. Keep it for ${price}, or put it back.</p>
    <div class="grid2"><button class="btn" data-act="trialback">Put it back</button><button class="btn big" data-act="trialkeep" aria-label="Keep ${esc(t.name)} for ${price}">Keep it, ${price}</button></div></div>`;
}

function renderResults() {
  const sp = TEAMS(G.game), w = G.over, won = w === 0;
  const who = sp ? (w === 0 ? `You and ${G.seats[2].name} win!` : `${G.seats[1].name} and ${G.seats[3].name} win.`) : w === 0 ? "You win!" : `${G.seats[w].name} wins.`;
  const rec = (S.record[G.game] ??= { played: 0, won: 0, streak: 0, best: null });
  rec.played++; if (won) { rec.won++; rec.streak++; } else rec.streak = 0;
  rec.bestStreak = Math.max(rec.bestStreak || 0, rec.streak);
  if (G.game === "hearts" && won) rec.best = rec.best === null ? G.totals.score[0] : Math.min(rec.best, G.totals.score[0]);
  const solo = humans() === 1, extreme = G.seats.filter((x, s) => x.kind === "bot" && (!sp || s % 2 === 1)).every((x) => x.level === "extreme");
  const newBest = solo ? postScores(won, extreme) : [];
  S.newBest = newBest;
  announce(`${who} Final score: ${(sp ? [0, 1] : [0, 1, 2, 3]).map((i) => G.totals.score[i]).join(" to ")}.`);
  track("game_end", { game: G.game, won: won ? 1 : 0, hands: G.handNo });
  const consent = S.opt.analytics === null && !S.care.lock ? `<div class="paper" id="consentCard"><h2>Help make ${cfg.brand.wordmark} better?</h2>
    <p>Share anonymous numbers like how many hands you play and which rules you pick. No ads, no tracking, nothing about you. You can change this in Options.</p>
    <div class="grid2"><button class="btn" data-act="consent" data-v="no">No thanks</button><button class="btn" data-act="consent" data-v="yes">Yes, share</button></div></div>` : "";
  // P2-8: playing for yourself, the table is ranked, winner on top (low score wins Hearts)
  const order = sp ? [0, 1] : [0, 1, 2, 3].sort((a, b) => (G.game === "hearts" ? G.totals.score[a] - G.totals.score[b] : G.totals.score[b] - G.totals.score[a]));
  const place = (k) => (sp ? "" : `<td class="place">${["1st", "2nd", "3rd", "4th"][k]}</td>`);
  S.cur = null; save();
  if (won && !calm()) setTimeout(confetti, 300);
  $("#results").innerHTML = `<div class="stack">${won ? `<div class="ribbon">${rosette(sp ? "Win!" : "1st")}</div>` : `<p class="kicker">Good game. There's always the next deal.</p>`}<h1>${who}</h1>${newBest.length ? `<p class="say" style="justify-self:center">New personal best: ${esc(newBest.join(", "))}</p>` : ""}
    <div class="paper pad"><table>${order.map((i, k) => `<tr>${place(k)}<td>${sp ? (i === 0 ? "You and " + esc(G.seats[2].name) : esc(G.seats[1].name) + " and " + esc(G.seats[3].name)) : esc(G.seats[i].name)}</td><td class="n">${G.totals.score[i]}</td></tr>`).join("")}</table>
    <p class="muted">${G.handNo} hand${G.handNo === 1 ? "" : "s"} · ${PRESET_NAME[G.preset]} rules · ${rec.won} won of ${rec.played}</p></div>
    <button class="btn big" data-act="again">Deal again</button>
    ${consent}
    <div class="grid2"><button class="btn" data-act="go" data-to="boards">Leaderboards</button><button class="btn" data-act="go" data-to="stats">Fair deal</button></div>
    <button class="btn ghost" data-act="go" data-to="title">Done</button></div>`;
}

// ---------------------------------------------------------------- the fair deal, shown (DESIGN.md §7): drawn from ledger.view()
// Each section compares your deals with constants measured from the real dealer; the shaded band is where a fair deck lands
// 95% of the time for that many hands, so "in the band" is the honest answer, not "on the line".
function standing(seat) { // where the score stood for this seat when the cards were dealt
  const sc = G.totals.score, low = G.game === "hearts", better = (a, b) => (low ? a < b : a > b);
  if (TEAMS(G.game)) { const us = sc[team(seat)], them = sc[1 - team(seat)]; return us === them ? "level" : us > them ? "ahead" : "behind"; }
  const mine = sc[seat], best = sc.filter((_, s) => s !== seat).reduce((a, b) => (better(a, b) ? a : b));
  return mine === best ? "level" : better(mine, best) ? "ahead" : "behind";
}
function recordDeal() { // every deal, as dealt (before any pass): yours, the other three, the game, and the score at the deal
  const st = G.st;
  S.deals.push(ledger.entry({ hand: [...st.hands[0]], others: [1, 2, 3].map((s) => [...st.hands[s]]), game: G.game, rules: G.rules, standing: standing(0) }));
  if (S.deals.length > 1000) S.deals.splice(0, S.deals.length - 1000);
}
function renderStats() {
  const v = ledger.view(S.deals);
  const intro = `<div class="paper"><p>Every hand comes from its seed and nothing else. The seed is on every score sheet: type it into our website to see the same four hands.</p>${S.care.lock ? "" : `<button class="btn" data-act="verify">Check a deal on our website</button>`}</div>`;
  const num = (x, unit) => (unit === "%" ? `${x.toFixed(1)}%` : x.toFixed(2));
  const section = (s) => {
    if (s.hidden) return `<div class="paper"><h2>${esc(s.title)}</h2><p class="muted">${esc(s.note)}</p></div>`;
    const top = Math.max(...s.rows.flatMap((r) => [r.mine ?? 0, r.hi ?? 0, r.expected ?? 0])) * 1.15 || 1, at = (x) => Math.min(100, (100 * x) / top);
    const row = (r) => `<div class="b"><span>${esc(r.label)}</span><span class="t" aria-hidden="true"><s style="left:${at(r.lo)}%;width:${at(r.hi) - at(r.lo)}%"></s>${r.mine == null ? "" : `<i style="width:${at(r.mine)}%"></i>`}<u style="left:${at(r.expected)}%"></u></span><span>${r.mine == null ? "—" : num(r.mine, s.unit)}</span>
      <span class="vh">${esc(r.label)}: ${r.mine == null ? "no hands yet" : num(r.mine, s.unit)}. A fair deck: ${num(r.expected, s.unit)}, usually between ${num(r.lo, s.unit)} and ${num(r.hi, s.unit)}.</span></div>`;
    return `<div class="paper"><h2>${esc(s.title)}</h2><p class="muted">${esc(s.note)}</p><div class="bars">${s.rows.map(row).join("")}</div></div>`;
  };
  const rec = Object.entries(S.record).map(([g, r]) => `<tr><td>${GAME_NAME[g]}</td><td class="n">${r.won} of ${r.played}</td><td class="n">${g === "hearts" ? (r.best ?? "—") : "streak " + r.streak}</td></tr>`).join("");
  $("#stats").innerHTML = `<div class="stack ledger"><h1>Is the deal fair?</h1>${intro}
    ${v.empty ? `<div class="paper"><h2>Your deals go here</h2><p>Play a few hands and your own deals appear here, next to what a fair deck gives${v.n ? ` (${v.n} so far; they show from 20)` : ""}.</p>
      <p>A fair deck gives each 13-card hand <b>4.00</b> aces, kings, queens and jacks on average, and the queen of spades lands in one Hearts hand in four.</p></div>`
    : `<p class="paper muted">Your last ${v.n} deals. The green bar is you, the black line is a fair deck's average, and the shaded band is where a fair deck lands 95% of the time for that many hands.</p>${v.sections.map(section).join("")}`}
    ${rec ? `<div class="paper pad"><h2>Your games</h2><table>${rec}</table></div>` : ""}
    <button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}
// ---------------------------------------------------------------- options, caregiver, unlock, how to play
const TEXT_SIZES = [["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]];
// P1-13: the phone's own text size (Dynamic Type), read through WebKit's system body font (17px at the default size). Followed
// on every launch until the player picks a size in Options. null where the font isn't known (other browsers).
function phoneText() {
  const e = document.createElement("span");
  e.style.font = "-apple-system-body";
  if (!e.style.font) return null;
  document.body.appendChild(e); const px = parseFloat(getComputedStyle(e).fontSize); e.remove();
  return !px ? null : px >= 23 ? "xl" : px >= 20 ? "large" : "normal";
}
function renderOptions() {
  const o = S.opt, owned = Object.keys(THEMES).filter(ownsTheme), c = !!o.comfort, part = { disabled: true, note: "(part of Comfort)" };
  $("#options").innerHTML = `<div class="stack"><h1>Options</h1>
    <div class="paper"><h2>Accessibility</h2>
      ${segRow("Text size", "textsize", o.text || "normal", TEXT_SIZES)}<p class="muted">Starts at your iPhone's text size. Change it here.</p>
      ${toggle("opt:comfort", c, "Comfort mode: bigger cards, tap twice to play, slower table")}
      ${toggle("opt:four", o.four || c, "Four-color deck (♦ blue, ♣ green)", c ? part : {})}${toggle("opt:confirm", o.confirm || c, "Tap twice to play a card", c ? part : {})}
      ${toggle("opt:speak", o.speak, "Read the table aloud")}
      <div class="${o.speak ? "" : "dimmed"}">${segRow("Reading speed", "speakrate", o.speakRate || 1, [[0.8, "Slower"], [1, "Normal"], [1.2, "Faster"]])}</div>
      ${toggle("opt:haptics", o.haptics, "Vibrate on your turn and when you win a trick")}
      <p class="muted">Blind or low-vision? ${BRAND} works with VoiceOver: every card, bid and play is announced, one at a time, and the table waits while VoiceOver reads. "Read the table aloud" speaks the same things with the phone's own voice if you don't use VoiceOver, and adds a Read button at the table.</p></div>
    <div class="paper"><h2>Table</h2>
      ${segRow("Speed", "speed", o.speed, [["relaxed", "Relaxed"], ["normal", "Normal"], ["fast", "Fast"]])}
      ${toggle("opt:cut", o.cut, "Cut the deck myself before each deal", c ? { disabled: true, note: "(in Comfort, the caregiver decides)" } : {})}
      <p class="muted">Off, the dealer cuts at random. Either way the score sheet prints the cut and the deck's fingerprint, so any hand can be checked on our website.</p>
      <div class="row"><label for="optBack">Card back</label><select id="optBack" data-act="back"><option value="">Matches the table</option>${owned.map((id) => `<option value="${id}" ${o.back === id ? "selected" : ""}>${esc(THEMES[id].name)}</option>`).join("")}</select></div>
      <div class="row"><span>Table theme</span><button class="btn" data-act="go" data-to="shop">${esc(THEMES[ownsTheme(o.theme) ? o.theme : "walnut"].name)} ›</button></div></div>
    <div class="paper">${toggle("opt:sound", o.sound, "Sound")}${toggle("opt:loud", o.loud, "Play sound when the phone is on silent")}
      <div class="row"><label for="optLang">Language</label><select id="optLang" data-act="lang"><option value="">Phone setting</option>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${o.lang === k ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
    <div class="paper">${toggle("opt:analytics", o.analytics === true, "Share anonymous usage numbers")}
      <div class="row"><button class="btn" data-act="restore">Restore purchases</button></div>
      ${S.care.lock ? "" : `<div class="row"><button class="link" style="color:var(--ink)" data-act="link" data-url="privacy.html">Privacy</button><button class="link" style="color:var(--ink)" data-act="link" data-url="terms.html">Terms</button><button class="link" style="color:var(--ink)" data-act="link" data-url="index.html">Support</button></div>`}
      <p class="muted">${BRAND} ${platform.version}. No ads, ever. No account. Your games stay on this device.</p></div>
    <button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}

function renderCaregiver() {
  const c = S.care;
  $("#caregiver").innerHTML = `<div class="stack"><h1 class="dark">Caregiver</h1>
    <div class="paper note">${toggle("care:lock", c.lock, "Lock settings and purchases behind the PIN")}${toggle("opt:comfort", S.opt.comfort, "Comfort mode")}
      ${segRow("Text size", "textsize", S.opt.text || "normal", TEXT_SIZES)}<p class="preview">This is how big the words will be.</p>
      ${toggle("care:straight", c.straight, "Open straight into a game")}
      ${toggle("care:cut", c.cut, "In Comfort, let them cut the deck before each deal")}
      ${segRow("Computer players", "carelevel", S.last.opps, Object.entries(LEVEL_NAME))}
      ${["hearts", "spades", "euchre", "ohhell", "whist"].map((g) => toggle("care:game:" + g, c.games.includes(g), `Show ${GAME_NAME[g]}`)).join("")}</div>
    <div class="paper"><h2>Keep the game on screen</h2><p>Guided Access stops accidental swipes out of the game:</p>
      <ol><li>Settings › Accessibility › Guided Access: turn it on and set a passcode (different from this PIN).</li>
      <li>Open ${BRAND} and triple-click the side (or home) button, then tap Start.</li>
      <li>To finish, triple-click again and enter the Guided Access passcode.</li></ol></div>
    <div class="paper"><h2>Buying it for someone</h2><p>Buy Everything on your own Apple Account with Family Sharing on; it appears on their iPad too. There are no subscriptions and nothing renews.</p>
      ${platform.owns("everything") ? "<p><b>Everything is unlocked on this device.</b></p>" : `<button class="btn" data-act="go" data-to="unlock">Unlock everything · $6.99 once</button>`}</div>
    <div class="paper"><div class="row"><button class="btn" data-act="pinchange">Change PIN</button><button class="btn" data-act="resetstats">Reset stats</button></div>
      <p class="muted">Forgot the PIN? Delete and reinstall the app. Purchases come back with Restore purchases; stats don't.</p></div>
    <button class="btn ghost" data-act="go" data-to="title">Done</button></div>`;
}

async function pin(mode) { // "check" | "set": a large keypad, four digits
  let entered = "", first = null;
  const draw = (msg) => `<h2>${msg}</h2><div class="pinshow" role="img" aria-label="${entered.length} of 4 digits">${"●".repeat(entered.length)}${"○".repeat(4 - entered.length)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => (k === "" ? "<span></span>" : `<button class="btn" data-pin="${k}" ${k === "⌫" ? `aria-label="Delete"` : ""}>${k}</button>`)).join("")}</div>
    ${mode === "check" ? `<p class="muted">Forgot it? Delete and reinstall the app. Purchases come back with Restore purchases; stats don't.</p>` : ""}
    <button class="btn ghost" style="color:var(--ink);margin-top:10px" data-dlg="">Cancel</button>`;
  let msg = mode === "set" ? "Choose a 4-digit PIN" : "Caregiver PIN";
  const p = dialog(draw(msg), { user: true });
  pin.key = (k) => {
    const was = msg;
    if (k === "⌫") entered = entered.slice(0, -1); else if (entered.length < 4) entered += k;
    if (entered.length === 4) {
      if (mode === "check") { if (entered === S.care.pin) return dialog.done("ok"); msg = "Wrong PIN, try again"; entered = ""; }
      else if (first === null) { first = entered; entered = ""; msg = "Type it again"; }
      else if (first === entered) { S.care.pin = entered; save(); return dialog.done("ok"); }
      else { first = null; entered = ""; msg = "They didn't match. Choose a PIN"; }
    }
    $("#dialogBody").innerHTML = draw(msg); $("#dialogBody h2").id = "dialogTitle";
    $(`#dialogBody [data-pin="${k}"]`)?.focus(); // the keyboard stays on the key it pressed
    if (msg !== was) announce(msg); // "Wrong PIN" is heard, not just shown
  };
  return (await p) === "ok";
}

async function renderUnlock() {
  const prices = await platform.prices(), price = prices.everything || "$6.99", box = (g) => `<span class="ubox">${tuckBox(g, GAME_NAME[g])}</span>`;
  $("#unlock").innerHTML = `<div class="stack"><h1>All games, ${price} once</h1>
    <div class="paper"><div class="uboxes" aria-hidden="true">${["spades", "euchre", "ohhell", "whist"].map(box).join("")}</div>
      <p>Opens Spades, Euchre, Oh Hell and Whist now, and every game we add after that. No ads, no subscription, nothing that renews.</p>
      <p>Shared with your family through Family Sharing. Hearts stays free either way.</p>
      ${platform.owns("everything") ? "<p><b>You have Everything. Thank you!</b></p>" : platform.native ? `<button class="btn big" data-act="buy" data-v="everything">Unlock all games for ${price}</button>` : `<p class="muted">This test build in the browser has everything unlocked.</p>`}
      <button class="btn" data-act="restore">Restore purchases</button></div>
    <button class="btn ghost" data-act="go" data-to="picker">Not now</button></div>`;
}

// How to play: five short steps per game, and a drawn trick to show who takes it
const HOWTO = {
  hearts: ["Everyone plays for themselves. Points are bad: each heart is 1, and the queen of spades is 13.",
    "Before most hands you pass three cards: left, right, then across. Every fourth hand you keep them.",
    "The two of clubs leads the first trick. Follow the suit that was led if you can; if you can't, play anything.",
    "The highest card of the suit led takes the trick, with any points in it. Nobody leads a heart until hearts are broken.",
    "Take every heart and the queen of spades to shoot the moon: everyone else gets 26. When someone reaches the end score, the lowest score wins."],
  ...more.HOWTO,
  spades: ["Partners sit across. Spades are trump: any spade beats any other suit.",
    "Look at your cards and bid how many tricks you'll take. Your bid and your partner's make your team's bid. Nil means none at all.",
    "Follow the suit that was led if you can; otherwise play anything, a spade included. Nobody leads a spade until spades are broken.",
    "Make your team's bid for 10 points a trick. Each trick over the bid is a bag worth 1, and too many bags cost points.",
    "Miss the bid and lose 10 a trick. A nil made scores 100; a nil broken loses 100. The first team to the target wins."],
  euchre: ["Partners sit across, five cards each, from a deck of nines to aces.",
    "The dealer turns up a card. In turn, anyone may order it up: its suit is trump, and the dealer picks it up and throws one away. If everyone passes, anyone may name another suit.",
    "The jack of trump is the highest card (the right bower). The other jack of the same colour is next (the left bower), and counts as trump.",
    "Follow suit if you can. The side that chose trump needs three of the five tricks for 1 point, all five for 2. Fall short and the others score 2: you've been euchred.",
    "Go alone, with your partner sitting out, and all five tricks score 4. The first side to 10 wins."],
};
const EXAMPLE = { // [left, across, right, you], the winner, what it shows
  plain: [["2C", "KC", "9C", "5C"], 1, "Clubs were led, so the highest club takes the trick: the king."],
  trump: [["9H", "KH", "TS", "AH"], 2, "Hearts were led, but spades are trump this time: the 10 of spades takes the trick."],
};
function renderHowto() {
  const g = HOWTO[setupGame] && setupGame !== "hearts" ? setupGame : HOWTO[S.last.game] ? S.last.game : "hearts", r = rulesFor(cfg, g, S.last.preset, S.last.preset === "custom" ? customFor(g) : {});
  const [cards, w, says] = EXAMPLE[g === "hearts" ? "plain" : "trump"];
  $("#howto").innerHTML = `<div class="stack"><h1 class="sign">How to play</h1>
    ${seg("howto", g, Object.keys(HOWTO).map((x) => [x, GAME_NAME[x]]), "")}
    <div class="paper recipe"><p class="from">From the kitchen table</p><h2>${GAME_NAME[g]}</h2><p class="serves">Serves 4 · ${more.SERVES[g] || (g === "spades" ? "about 25 minutes a game" : "about 15 minutes a game")}</p>
      <ol class="steps">${HOWTO[g].map((s) => `<li>${s}</li>`).join("")}</ol>
      <div class="minitrick" aria-hidden="true">${cards.map((c, i) => `<span class="card p${i} ${i === w ? "win" : ""}">${svgFor(c)}</span>`).join("")}</div><p class="muted">${says}</p></div>
    <div class="paper recipe"><p class="from">House rules</p><h2>${PRESET_NAME[S.last.preset]}</h2>${cfg.rules[g].map((d) => `<div class="row"><span>${d.name}<br><small class="muted">${esc(explain(d))}</small></span><b>${esc(fmt(d, r[d.id]))}</b></div>`).join("")}</div>
    <button class="btn ghost" data-act="${G && S.cur ? "resume" : "go"}" data-to="title">Back</button></div>`;
}

// ---------------------------------------------------------------- the table shop (themes) and leaderboards
const TIER_ORDER = ["classic", "signature", "luxe"];
const priceOf = (tier) => `$${cfg.shop.tiers[tier].price}`;
function themeTile(id, big = false) {
  const t = THEMES[id], mine = ownsTheme(id), using = (S.opt.theme || "walnut") === id;
  const action = using ? `<span class="tag">In use</span>` : mine ? `<button class="btn" data-act="usetheme" data-v="${id}" aria-label="Use ${esc(t.name)}">Use</button>`
    : `<button class="btn" data-act="buytheme" data-v="${id}" aria-label="Buy ${esc(t.name)}, ${priceOf(t.tier)}">${priceOf(t.tier)}</button><button class="btn ghost ink" data-act="trytheme" data-v="${id}" aria-label="Try ${esc(t.name)} at the table">Try at the table</button>`;
  return `<div class="tile ${big ? "luxe" : ""} ${using ? "using" : ""}"><span class="tprev" data-theme="${id}" aria-hidden="true"><span class="tback">${themeBack(id)}</span><span class="tface">${svgFor("AH")}</span></span>
    <span class="tname">${esc(t.name)}</span><span class="tblurb">${esc(t.blurb)}</span>${action}</div>`;
}
function paintPreviews(root) { // backgrounds are set from JS: their SVG data URLs carry quotes an attribute can't hold
  for (const el of root.querySelectorAll("[data-theme]")) { const st = themeStyle(el.dataset.theme); el.style.background = st.background; el.style.boxShadow = st.boxShadow; }
}
let showBacks = false;
function renderShop() {
  const ids = (tier) => Object.keys(THEMES).filter((k) => THEMES[k].tier === tier);
  const mine = Object.keys(THEMES).filter(ownsTheme), table = ownsTheme(S.opt.theme) ? S.opt.theme : "walnut", backNow = ownsTheme(S.opt.back) ? S.opt.back : null;
  const swatch = (id) => `<button class="swatch ${table === id ? "on" : ""}" data-act="usetheme" data-v="${id}" aria-label="${esc(THEMES[id].name)} table${table === id ? ", in use" : ""}"><span class="tprev" data-theme="${id}"></span><small>${esc(THEMES[id].name.replace(" felt", ""))}</small></button>`;
  // the card backs you own, fanned out like a hand: tap one to play with it
  const row = innerWidth >= 700 ? 7 : S.opt.comfort ? 2 : 3, all = [null, ...mine], few = !showBacks && all.length > row + 1; // P2-9: one row of backs, the rest a tap away
  const backs = (few ? all.slice(0, row) : all).map((id, i) => {
    const on = backNow === id, label = id ? THEMES[id].name : "Matches the table";
    return `<button class="backpick ${on ? "on" : ""}" style="--i:${i}" data-act="useback" data-v="${id || ""}" aria-label="Card back: ${esc(label)}${on ? ", selected" : ""}">${themeBack(id || table)}<small>${esc(id ? THEMES[id].name.replace(" felt", "") : "Match table")}</small></button>`;
  }).join("") + (few ? `<button class="btn showall" data-act="allbacks">Show all ${all.length}</button>` : "");
  const forSale = TIER_ORDER.map((tier) => [tier, ids(tier).filter((id) => !ownsTheme(id))]).filter(([, list]) => list.length);
  $("#shop").innerHTML = `<div class="stack"><h1 class="sign">The table shop</h1>
    <div class="paper thanks"><p>No ads, ever: every table you pick up keeps the cards coming. Thank you. <span class="muted">Yours to keep on every device in your Family Sharing group; nothing renews.</span></p></div>
    <div class="paper"><h2>Your card backs</h2><p class="muted">Tap a card to deal with it. Any back goes with any table.</p><div class="backfan">${backs}</div></div>
    <div class="paper"><h2>Your tables</h2><div class="swatches">${mine.map(swatch).join("")}</div></div>
    ${forSale.map(([tier, list]) => `<div class="paper ${tier === "luxe" ? "luxebox" : ""}"><h2>${cfg.shop.tiers[tier].name} <span class="muted">· ${priceOf(tier)} each</span></h2>
      <div class="tiles ${tier === "luxe" ? "one" : ""}">${list.map((id) => themeTile(id, tier === "luxe")).join("")}</div></div>`).join("")}
    ${forSale.length ? "" : `<div class="paper thanks"><p>You have every table in the shop. Thank you, truly.</p></div>`}
    <button class="btn" data-act="restore">Restore purchases</button>
    <button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
  paintPreviews($("#shop"));
}

// Game Center is the only identity (no accounts, no server). Scores count for solo games against the bots only.
function renderBoards() {
  const fmt = (b, v) => (v == null ? "—" : b.unit ? `${v} ${b.unit}` : v);
  $("#boards").innerHTML = `<div class="stack"><h1 class="sign">The leaderboard</h1>
    <div class="pins">${cfg.leaderboards.map((b, i) => `<div class="paper pin" style="--tilt:${[-2, 1.5, -1, 2, -1.5][i % 5]}deg"><h3>${esc(b.name)}</h3>${S.best[b.id] == null ? `<p class="none">No games yet. Your first win goes here.</p>` : `<p class="best">${fmt(b, S.best[b.id])}</p>`}<small class="muted">${esc(b.explain)}</small>${(S.newBest || []).includes(b.name) ? `<span class="minirib">${rosette("New!")}</span>` : ""}</div>`).join("")}</div>
    <p class="paper pin small" style="--tilt:1deg">Scores count for games you play alone against the computer. Pass-and-play games don't post scores.</p>
    ${platform.leaderboards ? `<button class="btn big" data-act="gc">See the Game Center leaderboards</button>`
      : `<p class="paper corknote">${platform.native ? "Sign in to Game Center in Settings to compare with friends and family." : "Game Center leaderboards open from the iPhone and iPad app."}</p>`}
    <button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}
// after a solo game: update the bests and post them (best = lowest for Hearts, highest elsewhere)
function postScores(won, extreme) {
  const g = G.game, rec = S.record[g], set = (id, v) => {
    const b = cfg.leaderboards.find((x) => x.id === id), old = S.best[id];
    if (old == null || (b.order === "low" ? v < old : v > old)) { S.best[id] = v; newBest.push(b.name); }
    platform.submitScore(id, v);
  };
  const newBest = [];
  if (g === "hearts") { if (won) set("hearts_best", G.totals.score[0]); set("hearts_wins", rec.won); }
  if (g === "spades") { set("spades_streak", rec.bestStreak || 0); set("spades_wins", rec.won); }
  if (more.NAMES[g]) set(`${g}_wins`, rec.won);
  if (g === "euchre") set("euchre_wins", rec.won);
  if (won && extreme) set("extreme_wins", (S.best.extreme_wins || 0) + 1);
  return newBest;
}

// ---------------------------------------------------------------- Euchre at the table: the kitty, calling trump, the score sheet
const SUIT_SIGN = { S: "♠", H: "♥", D: "♦", C: "♣" };
const EUCHRE_ASK = {
  bid1: "Your call: order up the upcard, or pass.", bid2: "Your call: name trump, or pass.", discard: "You picked up the upcard. Choose a card to throw away.",
  farmer: "Farmer's hand: choose three cards to swap with the kitty, or keep your hand.", defend: "The other side is going alone. Defend alone, or play with your partner?",
};
function euchreStatus(s) { // the seat plate: dealer, the call, sitting out, tricks
  const st = G.st, bits = [];
  if (s === st.dealer) bits.push("Dealer");
  if (st.out.includes(s)) bits.push("Sitting out");
  else if (st.maker === s) bits.push(`Called ${SUIT_SIGN[st.trump]}${st.alone ? " alone" : ""}`);
  else if (st.defender === s) bits.push("Defends alone");
  else if (st.maker === null && st.calls.some((c) => c.seat === s && c.call === "pass")) bits.push("Passed");
  if ((st.phase === "play" || st.phase === "done") && st.maker !== null && !st.out.includes(s)) bits.push(`took ${st.tricks[s]}`);
  return bits;
}
function kittyEl() { // the kitty on the felt: face-down cards under the upcard; after round one the upcard lies turned down, sideways
  const st = G.st, down = st.phase === "bid2";
  return `<div class="kitty ${down ? "down" : ""} ${tight ? "small" : ""}" role="img" aria-label="${down ? `The ${cardName(st.up)} was turned down` : `Upcard: the ${cardName(st.up)}`}"><span class="kb">${backSvg}</span><span class="kb">${backSvg}</span><span class="up">${svgFor(st.up)}</span></div>`;
}
function euchreCentre(mine) { // the upcard sits beside the prompt at hand-card size (smaller on a tight table); Comfort lays the pad out in wide rows
  const st = G.st, big = S.opt.comfort || tight, kitty = ["bid1", "bid2", "farmer"].includes(st.phase) ? kittyEl() : "";
  const top = (say) => `<div class="eurow">${kitty}<div class="say">${say}</div></div>`;
  if (mine?.kind === "bid1" || mine?.kind === "bid2") {
    const r1 = mine.kind === "bid1", canPass = mine.legal.some((a) => a.call === "pass");
    const calls = r1 ? ["order"] : [...SUITS].filter((t) => mine.legal.some((a) => a.call === t));
    const onlyAlone = !mine.legal.some((a) => a.call !== "pass" && !a.alone), alone = onlyAlone || mine.alone;
    const say = r1 ? `${st.dealer === mine.seat ? "Pick up" : "Order up"} the ${cardName(st.up)}?` : `${canPass ? "Name trump, or pass" : "Stuck: name trump"}${big ? ` · ${SUIT_SIGN[st.up[1]]} down` : ""}`;
    const callBtn = (t) => t === "order" ? `<button class="btn ${big ? "" : "big"}" data-act="call" data-v="order">${st.dealer === mine.seat ? "Pick it up" : "Order it up"}${alone ? ", alone" : ""}</button>`
      : `<button class="btn suit" data-act="call" data-v="${t}" aria-label="${SUIT_WORD[t]}${alone ? ", alone" : ""}"><span class="sym s${t}">${SUIT_SIGN[t]}</span><small>${SUIT_WORD[t]}</small></button>`;
    const pass = canPass ? `<button class="btn" data-act="call" data-v="pass">Pass</button>` : "";
    const toggle = onlyAlone ? `<span class="say">${r1 ? "Ordering your partner up means going alone" : "Alone"}</span>` : `<button class="btn" data-act="alone" aria-pressed="${mine.alone}">Go alone: ${mine.alone ? "yes" : "no"}</button>`;
    const row = big && !r1 ? calls : [...calls, ...(pass ? ["pass"] : [])]; // Comfort: three wide suit buttons; Pass moves down beside Go alone
    const first = tight ? `<div class="callpad" style="--n:${row.length + 1}">${kitty}${row.map((t) => (t === "pass" ? pass : callBtn(t))).join("")}</div>` // tight: the upcard leads the row; the buttons say the rest
      : `${top(say)}<div class="callpad" style="--n:${row.length}">${row.map((t) => (t === "pass" ? pass : callBtn(t))).join("")}</div>`;
    return `${first}<div class="callpad" style="--n:${big && !r1 && pass ? 2 : 1}">${toggle}${big && !r1 ? pass : ""}</div>`;
  }
  if (mine?.kind === "discard") return `<div class="say">${mine.sel?.length ? "Tap it again to throw it away" : `You picked up the ${cardName(st.up)}. Tap a card to throw away.`}</div>`;
  if (mine?.kind === "farmer") return `${top(`Farmer's hand! Pick three cards to swap with the kitty (${mine.sel.length}/3)`)}
    <div class="callpad" style="--n:2">${mine.sel.length === 3 ? `<button class="btn big" data-act="farmer" data-v="swap">Swap these three</button>` : ""}<button class="btn" data-act="farmer" data-v="keep">Keep my hand</button></div>`;
  if (mine?.kind === "defend") return `<div class="say">${esc(G.seats[st.maker].name)} is going alone. Defend alone?</div>
    <div class="callpad" style="--n:2"><button class="btn big" data-act="defend" data-v="yes">Defend alone</button><button class="btn" data-act="defend" data-v="no">With my partner</button></div>`;
  if (st.phase !== "play" && st.phase !== "done" && G.seats[st.turn].kind === "bot") return top(`${esc(G.seats[st.turn].name)} is thinking…`);
  return kitty;
}
function euchreSay(s, a, phase) { // VoiceOver (and the spoken table) hears every call
  const st = G.st, you = G.seats[s].kind === "human" && s === 0, who = you ? "You" : G.seats[s].name, v = (y, o) => (you ? y : o);
  if (phase === "farmer") return announce(a.swap ? `${who} ${v("swap", "swaps")} three cards with the kitty: a farmer's hand.` : `${who} ${v("keep", "keeps")} a farmer's hand.`);
  if (phase === "discard") return announce(you ? `You threw away the ${cardName(a)}.` : `${who} picks up the ${cardName(st.up)} and throws away a card.`);
  if (phase === "defend") return announce(`${who} ${a.defend ? v("defend", "defends") + " alone" : v("play", "plays") + " with a partner"}.`);
  if (a.call === "pass") return announce(`${who} ${v("pass", "passes")}.${st.phase === "bid2" && phase === "bid1" ? ` The ${cardName(st.up)} is turned down.` : st.phase === "done" ? " Everyone passed: the cards are thrown in." : ""}`);
  const what = a.call === "order" ? `${s === st.dealer ? v("pick", "picks") : v("order", "orders")} up the ${cardName(st.up)}` : `${v("call", "calls")} ${SUIT_WORD[a.call].toLowerCase()}`;
  announce(`${who} ${what}${a.alone ? `, going alone; ${G.seats[partner(s)].name} sits out` : ""}. ${SUIT_WORD[st.trump]} are trump.`);
}
function euchreTable() {
  const st = G.st, us = team(G.viewer);
  if (st.maker === null) return st.phase === "bid2" ? `The ${cardName(st.up)} was turned down.` : `The upcard is the ${cardName(st.up)}.`;
  const took = (t) => st.tricks[t] + st.tricks[t + 2];
  return `${SUIT_WORD[st.trump]} are trump, called by ${G.seats[st.maker].name}${st.alone ? ", alone" : ""}. We have ${took(us)} tricks, they have ${took(1 - us)}.`;
}
function euchreLine(l) { // a score sheet line, in words
  const who = l.seat != null ? G.seats[l.seat].name : "", s = l.trump ? SUIT_WORD[l.trump].toLowerCase() : "";
  return { made: `${who} called ${s}: took ${l.took}`, march: `${who} called ${s}: all 5, a march`, loner: `${who} alone in ${s}: took ${l.took}`,
    lonerMarch: `${who} alone in ${s}: all 5 tricks`, euchre: `Euchred ${who} (${s}, took ${l.took})`,
    loneEuchre: `${l.defender != null ? G.seats[l.defender].name : ""} defended alone: euchred ${who}`, thrown: "Everyone passed: thrown in" }[l.kind];
}
function euchreStamp(l) { // from the side of whoever holds the phone first (seat 0's team)
  if (l.team === null) return stamp("Thrown in", "#8a6f3e");
  const set = l.kind === "euchre" || l.kind === "loneEuchre";
  if (l.team !== 0) return set ? stamp("Euchred", "#b03a2e") : "";
  return set ? stamp("Euchred them!", "#2f7a4f") : l.kind === "lonerMarch" ? stamp("Loner!", "#2f5fa8") : l.kind === "march" ? stamp("March!", "#2f5fa8") : stamp("Made it", "#2f7a4f");
}

// ---------------------------------------------------------------- spoken table and VoiceOver announcements

const SUIT_WORD = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
const cardList = (cs) => cs.map(cardName).join(cs.length === 2 ? " and " : ", ");
// VoiceOver reads the live region: one sentence at a time, each left up for as long as it takes to read (about 60 ms a
// character), so a new one waits its turn instead of replacing the last. With VoiceOver on, the bots wait for the queue (run()).
const said = { q: [], log: [], dropped: 0, busy: false, idle: () => new Promise((done) => { const t = () => (said.busy ? setTimeout(t, 100) : done()); t(); }) };
const readMs = (t) => Math.max(1000, 60 * t.length);
// whether VoiceOver is running: @capacitor/screen-reader on the phone (asked at start, told when it's switched on or off, and
// asked again whenever the app comes back to the front); ?vo in tests
let vo = qs.has("vo");
const SR = window.Capacitor?.Plugins?.ScreenReader, voCheck = () => { try { SR?.isEnabled?.().then((r) => (vo = !!r?.value || qs.has("vo")), () => {}); } catch {} };
try { voCheck(); SR?.addListener?.("stateChange", (r) => (vo = !!r?.value || qs.has("vo"))); addEventListener("visibilitychange", () => document.hidden || voCheck()); } catch {}
function announce(text, { interrupt = false } = {}) {
  if (!text) return;
  speech.say(text, { interrupt });
  if (interrupt) said.q.length = 0; // a new hand: what's waiting from the last one goes; what's being read finishes
  said.q.push(text);
  if (!vo && said.q.length > 4) said.dropped += said.q.splice(0, said.q.length - 4).length; // ponytail: nothing waits on the queue without VoiceOver, so its backlog stays short
  if (!said.busy) (async () => { said.busy = true; while (said.q.length) { const t = said.q.shift(); $("#announce").textContent = t; if (DEBUG) said.log.push([performance.now(), t]); await wait(readMs(t)); } said.busy = false; })();
}
function lastTrick() { // the Read button and the menu: the trick that was just swept away
  const t = G.st.lastTrick;
  if (!t?.length) return "No trick has been played yet this hand.";
  return `Last trick: ${t.map((x) => `${G.seats[x.seat].name}, the ${cardName(x.card)}`).join("; ")}. ${G.seats[G.lastWon ?? t[0].seat].name} took it.`;
}
function describeHand(seat) {
  if (faceDown(seat)) return "Your cards are face down.";
  const st = G.st, j = G.game === "spades" && G.rules.jokers, eff = (c) => (G.game === "spades" ? spades.eff(c, j) : G.game === "euchre" ? euchre.eff(c, st.trump) : c[1]);
  return "SHDC".split("").map((s) => { const cs = st.hands[seat].filter((c) => eff(c) === s); return cs.length ? `${SUIT_WORD[s]}: ${cs.map((c) => cardName(c).replace(/ of \w+$/, "")).join(", ")}.` : `No ${SUIT_WORD[s].toLowerCase()}.`; }).join(" ");
}
function describeTable() {
  const st = G.st, parts = [];
  if (st.trick.length) parts.push(st.trick.map((t) => `${G.seats[t.seat].name} played the ${cardName(t.card)}`).join(", ") + ".");
  else parts.push(`No cards on the table. ${lastTrick()}`);
  if (G.game === "euchre") parts.push(euchreTable());
  else if (st.trump !== undefined) parts.push(st.trump ? `Trump is ${SUIT_WORD[st.trump].toLowerCase()}.` : "No trump this hand.");
  if (st.bids) parts.push(G.seats.map((x, s) => `${x.name} bid ${st.bids[s] === null ? "nothing yet" : st.bids[s] === 0 ? "nil" : st.bids[s]} and has ${st.tricks[s]}`).join(". ") + ".");
  if (pending && pending.seat === G.viewer && EUCHRE_ASK[pending.kind]) parts.push(EUCHRE_ASK[pending.kind]);
  else if (pending && pending.seat === G.viewer) parts.push(pending.kind === "play" ? `Your turn. You can play ${pending.legal.length === st.hands[G.viewer].length ? "any card" : pending.legal.map(cardName).join(", ")}.` : pending.kind === "bid" ? "Your turn to bid." : pending.kind === "pass" ? "Choose three cards to pass." : pending.kind === "exchange" ? `Pass ${G.rules.blindSwap} cards to your partner.` : "");
  return parts.join(" ");
}

// ---------------------------------------------------------------- taps
const RENDER = { shop: renderShop, boards: renderBoards, title: renderTitle, picker: renderPicker, setup: renderSetup, options: renderOptions, caregiver: renderCaregiver, stats: renderStats, unlock: renderUnlock, howto: renderHowto };
async function go(to) { await RENDER[to]?.(); show(to); }
const ACT = {
  go: (el) => go(el.dataset.to),
  noop: () => {},
  deal: (el) => { if (S.cur && G) return run(); const g = el.dataset.game; if (!owns(g)) return go("unlock"); newGame(g); },
  setup: (el) => { setupGame = el.dataset.game; go("setup"); },
  preset: (el) => { // R9: Custom starts from the rules of the preset you were on
    const v = el.dataset.v, L = S.last;
    if (v === "custom" && L.preset !== "custom") { const { preset, ...vals } = rulesFor(cfg, setupGame, L.preset); (L.customBy ??= {})[setupGame] = vals; }
    L.preset = v; save(); renderSetup();
  },
  partner: (el) => { S.last.partner = el.dataset.v; save(); renderSetup(); },
  opps: (el) => { S.last.opps = el.dataset.v; save(); renderSetup(); },
  seat1: (el) => setSeat(1, el), seat2: (el) => setSeat(2, el), seat3: (el) => setSeat(3, el),
  rule: (el) => { const d = cfg.rules[setupGame].find((x) => x.id === el.dataset.id), c = ((S.last.customBy ??= {})[setupGame] ??= {}); c[d.id] = !(c[d.id] ?? d.presets.standard); save(); renderSetup(); },
  card: (el) => {
    if (!pending || el.disabled) return;
    const c = el.dataset.card;
    if (pending.kind === "pass") { const i = pending.sel.indexOf(c); if (i >= 0) pending.sel.splice(i, 1); else if (pending.sel.length < 3) pending.sel.push(c); return drawTable(); }
    if (pending.kind === "exchange" && pending.legal.includes(c)) { const i = pending.sel.indexOf(c); if (i >= 0) pending.sel.splice(i, 1); else if (pending.sel.length < G.rules.blindSwap) pending.sel.push(c); return drawTable(); }
    if (pending.kind === "farmer") { const i = pending.sel.indexOf(c); if (i >= 0) pending.sel.splice(i, 1); else if (pending.sel.length < 3) pending.sel.push(c); return drawTable(); }
    if (pending.kind === "discard" && (S.opt.comfort || S.opt.confirm) && pending.sel[0] !== c) { pending.sel = [c]; speech.say(cardName(c) + ". Tap again to discard it.", { interrupt: true }); return drawTable(); }
    if (pending.kind === "discard") return pending.resolve(c);
    if (pending.kind !== "play" || !pending.legal.includes(c)) return;
    if ((S.opt.comfort || S.opt.confirm) && pending.sel[0] !== c) { pending.sel = [c]; speech.say(cardName(c) + ". Tap again to play.", { interrupt: true }); return drawTable(); } // tap to pick, tap again to play
    pending.resolve(c);
  },
  step: (el) => { if (pending?.kind === "bid") { pending.dir = +el.dataset.v; pending.step += pending.dir; drawTable(); } },
  bid: (el) => { if (pending?.kind !== "bid") return; whyNow = null; pending.resolve(el.dataset.v === "blind" ? { bid: 0, blind: true } : { bid: +el.dataset.v }); },
  pass: () => pending?.kind === "pass" && pending.sel.length === 3 && pending.resolve([...pending.sel]),
  swap: () => pending?.kind === "exchange" && pending.sel.length === G.rules.blindSwap && pending.resolve([...pending.sel]),
  look: () => { (G.looked ??= {})[G.viewer] = true; announce("Your cards are face up."); drawTable(); $("#hand").focus(); },
  suggest: () => { // what a Standard player would bid with this hand, and why
    const p = pending;
    if (p?.kind !== "bid") return;
    const d = decide(MOD[G.game].view(G.st, p.seat), "standard"), b = d.action.bid, why = WHY[String(d.reason).split(":")[0]];
    p.hint = `A Standard player would bid ${b === 0 ? (G.game === "spades" ? "nil" : "0") : b}${why ? `: “${why}”` : "."}`; p.step = b;
    drawTable();
    if (S.opt.comfort || tight) return answerBox("A suggestion", p.hint); // no room beside the pad: it opens on its own, and the table waits
    announce(p.hint);
  },
  moon: (el) => pending?.kind === "moon" && pending.resolve(el.dataset.v),
  // Euchre: calling trump, going alone, defending alone, a farmer's hand
  call: (el) => { if (pending?.kind !== "bid1" && pending?.kind !== "bid2") return; const call = el.dataset.v, alone = call !== "pass" && (pending.alone || !pending.legal.some((a) => a.call === call && !a.alone)); pending.resolve(call === "pass" ? { call } : { call, alone }); },
  alone: () => { if (pending?.kind === "bid1" || pending?.kind === "bid2") { pending.alone = !pending.alone; announce(pending.alone ? "Going alone: your partner will sit out." : "Playing with your partner."); drawTable(); } },
  defend: (el) => pending?.kind === "defend" && pending.resolve({ defend: el.dataset.v === "yes" }),
  farmer: (el) => pending?.kind === "farmer" && (el.dataset.v === "keep" ? pending.resolve({ swap: null }) : pending.sel.length === 3 && pending.resolve({ swap: [...pending.sel] })),
  handoff: () => handoff.done?.(),
  why: (el) => { // the bot's reason, in the line above your plate until the next card (never inside the plate, which would grow);
    const s = +el.dataset.seat, r = whyOf(s), name = G.seats[s].name; // where that line would cover a seat, it opens on its own
    if (!r) return;
    if (S.opt.comfort || tight) return answerBox(name, `“${r}”`);
    const w = (whyNow = { seat: s, text: `${name}: “${r}”` });
    drawTable();
    if (tight) { whyNow = null; drawTable(); return answerBox(name, `“${r}”`); } // it didn't fit after all
    announce(w.text);
    setTimeout(() => { if (whyNow === w) { whyNow = null; drawTable(); } }, 6000);
  },
  peek: async () => { // the score pad as a sheet of its own: it never sits over a seat, and it's closed when the hand ends
    const sc = G.totals.score, last = G.history.at(-1), goal = goalLine();
    const rows = TEAMS(G.game) ? [0, 1].map((t) => `<tr><td>${t === team(G.viewer) ? "Us" : "Them"}</td><td class="n">${sc[t]}</td>${G.totals.bags ? `<td class="n">${G.totals.bags[t]} bag${G.totals.bags[t] === 1 ? "" : "s"}</td>` : ""}</tr>`).join("")
      : G.seats.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="n">${sc[i]}</td></tr>`).join("");
    peekOpen = true;
    await dialog(`<h2>Score</h2><div class="pad"><table>${rows}</table>${goal ? `<p>${esc(goal)}</p>` : ""}<p class="muted">Hand ${G.handNo + 1}${last ? ` · last seed <span class="seed">${seedHTML(last.seed)}</span>` : ""}</p></div>
      <button class="btn big" data-dlg="">Back to the table</button>`, { user: true });
    peekOpen = false;
  },
  menu: async () => {
    const v = await dialogP(`<h2>Paused</h2><div class="stack"><button class="btn big" data-dlg="">Keep playing</button><button class="btn" data-dlg="last">Last trick</button><button class="btn" data-dlg="howto">How to play</button><button class="btn" data-dlg="leave">Save and leave</button>${S.care.lock ? "" : `<button class="btn" data-dlg="quit">End this game</button>`}</div>`, { user: true });
    if (v === "last") {
      const t = G.st.lastTrick || [];
      return dialog(`<h2>Last trick</h2>${t.length ? `<div class="lasttrick" aria-hidden="true">${t.map((x) => `<span><span class="card">${svgFor(x.card)}</span><small>${esc(G.seats[x.seat].name)}</small></span>`).join("")}</div>` : ""}<p>${esc(lastTrick())}</p><button class="btn big" data-dlg="">Back to the table</button>`, { user: true });
    }
    if (v === "howto") { runId++; renderHowto(); show("howto"); }
    if (v === "leave" || v === "quit") {
      if (v === "quit" && !(await dialog(`<h2>End this game?</h2><p>Scores for this game are lost. "Save and leave" keeps your place instead.</p><div class="stack"><button class="btn" data-dlg="yes">End the game</button><button class="btn big" data-dlg="">Keep playing</button></div>`, { user: true }))) return;
      if (v === "leave" && S.opt.comfort && !(await dialog(`<h2>Leave the table?</h2><div class="stack"><button class="btn big" data-dlg="yes">Yes, leave</button><button class="btn" data-dlg="">No, keep playing</button></div>`, { user: true }))) return;
      runId++; pending = null; handLive = false; net?.leave(); net = null; if (trial) { trial = null; applyLook(); }
      if (v === "quit") { S.cur = null; G = null; }
      save(); go("title");
    }
  },
  resume: () => run(),
  kicker: () => { if (++kickerTaps === 7) { familyTest = true; renderTitle(); } },
  family: () => familyTable(),
  next: () => { if (G.over !== null) { renderResults(); show("results"); } else startHand(); },
  again: () => newGame(G.game),
  seedinfo: async () => { // the hand's own check: verify.html deals it again from the seed and the cut, and checks the fingerprint first
    const h = G.history.at(-1), game = G.game === "spades" && G.rules.jokers ? "jokers" : G.game;
    const url = `${platform.site}/verify.html?seed=${h.seed}&cut=${h.cut ?? 0}&fp=${h.fp ?? fingerprint(h.seed)}&game=${game}&dealer=${h.dealer}${h.size ? `&size=${h.size}` : ""}`;
    const v = await dialog(`<h2>The seed</h2><p>Every hand comes from this seed and nothing else. Type it into our website to see the same four hands.</p>
      <p>The fingerprint is the seed's SHA-256, cut short. Our website checks it against the seed before it deals.</p>
      <div class="stack">${S.care.lock ? "" : `<button class="btn" data-dlg="check">Check this hand on our website</button>`}<button class="btn big" data-dlg="">Got it</button></div>`, { user: true });
    if (v === "check") gate(url, "the check-a-deal page on our website");
  },
  allbacks: () => { showBacks = true; renderShop(); },
  trytheme: (el) => { // dress the next hand in this theme; after it, the sheet asks whether to keep it
    trial = el.dataset.v; applyLook();
    if (S.cur && G) return run();
    const g = owns(S.last.game) && S.care.games.includes(S.last.game) ? S.last.game : "hearts";
    newGame(g);
  },
  trialback: () => { trial = null; applyLook(); renderSheet(); announce("Put back. Your own table is out again."); },
  trialkeep: async () => { const id = trial; if (!platform.native || (await platform.buy("theme_" + id))) { S.opt.theme = id; save(); } trial = null; applyLook(); renderSheet(); },
  verify: () => gate(platform.site + "/verify.html", "our verify-a-deal page"),
  link: (el) => gate(platform.site + "/" + el.dataset.url, "our website"),
  consent: (el) => { S.opt.analytics = el.dataset.v === "yes"; setTelemetry(S.opt.analytics, { first: true }); save(); $("#consentCard")?.remove(); },
  openbox: async (el) => {
    const g = el.dataset.game;
    el.classList.add("open"); sound.card();
    if (!calm()) await wait(420);
    if (!owns(g)) return go("unlock");
    setupGame = g; go("setup");
  },
  flip: async (el) => {
    sound.card();
    if (calm()) return el.classList.toggle("flipped");
    await el.animate([{ scale: "1 1" }, { scale: "0 1" }], { duration: 140, easing: "ease-in" }).finished.catch(() => {});
    el.classList.toggle("flipped");
    el.animate([{ scale: "0 1" }, { scale: "1 1" }], { duration: 160, easing: "ease-out" });
  },
  useback: async (el) => { // the chosen back lifts out of the fan and flips over
    S.opt.back = el.dataset.v || null; save(); applyLook(); sound.card();
    if (!calm()) await el.animate([{ transform: "translateY(0) rotateY(0)" }, { transform: "translateY(-18px) rotateY(90deg)" }, { transform: "translateY(-12px) rotateY(0)" }], { duration: 360, easing: "ease-out" }).finished.catch(() => {});
    renderShop(); speech.say("Card back chosen.");
  },
  usetheme: (el) => { S.opt.theme = el.dataset.v; trial = null; save(); applyLook(); renderShop(); },
  buytheme: async (el) => {
    const id = el.dataset.v;
    if (!platform.native) return ACT.usetheme(el);
    if (await platform.buy("theme_" + id)) {
      S.opt.theme = id; save(); applyLook(); renderShop();
      await dialog(`<h2>Thank you!</h2><p><b>${esc(THEMES[id].name)}</b> is yours to keep, on every device in your family. Your support keeps ${cfg.brand.wordmark} free of ads and helps us bring the next game to the table. We're so grateful.</p><button class="btn big" data-dlg="">Back to the shop</button>`, { user: true });
    }
  },
  textsize: (el) => { S.opt.text = el.dataset.v; S.opt.textAuto = false; save(); applyLook(); if (screen === "caregiver") renderCaregiver(); else renderOptions(); },
  speakrate: (el) => { S.opt.speakRate = +el.dataset.v; save(); applyLook(); renderOptions(); speech.say("This is how fast I'll read.", { interrupt: true }); },
  gc: () => platform.showLeaderboards(),
  read: () => speech.say(describeTable() + " " + describeHand(G.viewer), { interrupt: true }),
  speed: (el) => { S.opt.speed = el.dataset.v; save(); applyLook(); renderOptions(); },
  carelevel: (el) => { S.last.opps = S.last.partner = el.dataset.v; save(); renderCaregiver(); },
  howto: (el) => { setupGame = el.dataset.v; renderHowto(); },
  restore: async () => { const r = await platform.restore(); await dialog(`<h2>Restore purchases</h2><p>${r === null ? "The App Store couldn't be reached. Try again with a connection." : r ? "Your purchases are back on this device." : "There was nothing to restore on this Apple Account."}</p><button class="btn big" data-dlg="">OK</button>`, { user: true }); if (screen !== "table") go(screen); },
  buy: async (el) => { if (await platform.buy(el.dataset.v)) go("picker"); else renderUnlock(); },
  care: async () => { if (!S.care.pin) { if (await pin("set")) go("caregiver"); } else if (await pin("check")) go("caregiver"); },
  pinchange: async () => { if (await pin("set")) renderCaregiver(); },
  resetstats: async () => { if (await dialog(`<h2>Reset stats?</h2><p>This clears the deal history and game records on this device.</p><div class="stack"><button class="btn" data-dlg="yes">Reset</button><button class="btn big" data-dlg="">Keep them</button></div>`, { user: true })) { S.deals = []; S.record = {}; save(); } },
};
function setSeat(s, el) { S.last.seats[s] = el.dataset.v; save(); renderSetup(); }

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-hold]")) { if (performance.now() - pressed > 600) dialog.done?.("tap"); return; }
  const d = e.target.closest("[data-dlg]");
  if (d?.dataset.dlg === "cut") { // where you tap along the deck is where it's cut; a tap with no place (keyboard, Switch Control) cuts by the moment
    const r = d.getBoundingClientRect(), n = +d.dataset.n, k = e.detail && e.clientX ? (e.clientX - r.left) / r.width : (performance.now() * 7919 % 1000) / 1000;
    return dialog.done?.("cut:" + Math.min(n - 1, Math.max(1, Math.round(k * (n - 2)) + 1)));
  }
  if (d) return dialog.done?.(d.dataset.dlg || null);
  const p = e.target.closest("[data-pin]");
  if (p) return pin.key?.(p.dataset.pin);
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const act = el.dataset.act, s = sig(el);
  queueMicrotask(() => { const a = document.activeElement; if (!a || a === document.body || !a.isConnected) refocus(s); });
  if (act.startsWith("opt:")) { const k = act.slice(4); S.opt[k] = k === "analytics" ? !(S.opt.analytics === true) : !S.opt[k]; if (k === "analytics") setTelemetry(S.opt.analytics); save(); applyLook(); return screen === "caregiver" ? renderCaregiver() : renderOptions(); }
  if (act.startsWith("care:")) { const k = act.slice(5); if (k.startsWith("game:")) { const g = k.slice(5), a = S.care.games; S.care.games = a.includes(g) ? a.filter((x) => x !== g) : [...a, g]; if (!S.care.games.length) S.care.games = ["hearts"]; } else S.care[k] = !S.care[k]; save(); return renderCaregiver(); }
  ACT[act]?.(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target, act = el.dataset.act;
  if (act === "rulesel") { const d = cfg.rules[setupGame].find((x) => x.id === el.dataset.id); ((S.last.customBy ??= {})[setupGame] ??= {})[d.id] = typeof d.presets.standard === "number" ? +el.value : el.value; save(); }
  if (act === "back") { S.opt.back = el.value || null; save(); applyLook(); }
  if (act === "lang") { S.opt.lang = el.value || null; save(); location.reload(); }
});
// press-and-hold buttons (the grown-up gate): a finger held down, or Space or Enter held down
let pressed = -1e9; // when a real press last began or ended: a click that comes without one is Switch Control (or VoiceOver)
function hold(el, ends) {
  const ms = +el.dataset.hold, bar = el.querySelector("i"), t0 = performance.now();
  let raf;
  const tick = (t) => { const k = (t - t0) / ms; bar.style.width = Math.min(100, k * 100) + "%"; if (k >= 1) { stop(); dialog.done?.("hold"); } else raf = requestAnimationFrame(tick); };
  const stop = () => { pressed = performance.now(); cancelAnimationFrame(raf); bar.style.width = "0"; ends.forEach((x) => removeEventListener(x, stop)); };
  ends.forEach((x) => addEventListener(x, stop));
  raf = requestAnimationFrame(tick);
}
document.addEventListener("pointerdown", (e) => { const el = e.target.closest("[data-hold]"); if (el) { pressed = performance.now(); hold(el, ["pointerup", "pointercancel"]); } });
document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.("[data-hold]");
  if (!el || (e.key !== " " && e.key !== "Enter")) return;
  e.preventDefault(); pressed = performance.now();
  if (!e.repeat) hold(el, ["keyup", "blur"]);
});
addEventListener("resize", () => { M = null; geo = null; tight = false; if (screen === "table") drawTable(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && dialog.done) dialog.done(null); }); // a keyboard can always close a dialog

// ---------------------------------------------------------------- family table test (DESIGN.md §9 spike): Hearts with two people on two
// devices and two bots. Hidden: ?debug, or tap "Play a game of cards at…" seven times. The protocol is family.js.
let net = null, familyTest = DEBUG, kickerTaps = 0;
async function familyTable() {
  const n = await joinTable(platform.table, (n) => {
    dialog.done?.(null);
    net = n;
    if (!n.host) return guestHand();
    const guest = n.players.find((p) => p.id !== n.me), bot = (i) => ({ kind: "bot", level: S.last.opps, name: BOTS[S.last.opps][i] });
    newGame("hearts", [{ kind: "human", level: "standard", name: n.name, player: n.me }, bot(0), { kind: "remote", level: "standard", name: guest.name, player: guest.id }, bot(2)]);
  });
  if (!n) return dialog(`<h2>Family table</h2><p>Sign in to Game Center in Settings first.</p><button class="btn big" data-dlg="">OK</button>`, { user: true });
  const v = await dialog(`<h2>Family table test</h2><p>Two people on two devices, two computer players. One of you invites; the other waits for the invitation.</p>
    <div class="stack"><button class="btn big" data-dlg="invite">Invite someone</button><button class="btn" data-dlg="wait">Wait for an invitation</button><button class="btn ghost" data-dlg="">Cancel</button></div>`, { user: true });
  if (v === "invite") platform.table.invite({ min: 2, max: 2 }).catch(() => {});
  if (v === "wait") await dialog(`<h2>Waiting for an invitation…</h2><button class="btn" data-dlg="">Cancel</button>`, { user: true });
  if (!net && v !== "invite") n.leave();
}
async function guestHand() { // a guest plays the host's deal from its own seat; every other seat is the host's to move
  const h = await net?.take((x) => x.t === "start", net.hostId);
  if (!h) { net = null; return go("title"); }
  const mine = h.seats.findIndex((x) => x.player === net.me);
  G = { game: h.game, rules: h.rules, preset: h.preset, totals: h.totals, handNo: h.handNo, dealer: h.dealer, history: h.handNo && G ? G.history : [], viewer: mine, reasons: {}, over: null,
    seats: h.seats.map((x, i) => (i === mine ? { ...x, kind: "human" } : { ...x, kind: "remote", player: net.hostId })) };
  G.st = MOD[G.game].newHand(G.rules, h.seed, G.dealer, G.totals, G.handNo, h.cut ?? 0);
  G.st.cut ??= h.cut ?? 0;
  S.cur = G; save(); sound.shuffle(); G.justDealt = true;
  run();
}

// ---------------------------------------------------------------- boot
if (S.opt.textAuto !== false) { const t = phoneText(); if (t) S.opt.text = t; } // follows the iPhone's text size until you pick one
applyLook();
$("#prop").innerHTML = tableProp();
setTelemetry(S.opt.analytics === true);
platform.init();
if (S.cur) { G = S.cur; G.viewer = G.viewer ?? 0; run(); } // cards back in hand, exactly where they were
else if (S.care.straight) newGame(owns(S.last.game) && S.care.games.includes(S.last.game) ? S.last.game : "hearts");
else go("title");
window.Capacitor?.Plugins?.SplashScreen?.hide();

if (DEBUG) window.kt = { S, cfg, blocked, applyLook, readMs, said, get dialogKind() { return dialog.kind; }, get tight() { return tight; }, get net() { return net; }, get pending() { return pending; }, get G() { return G; }, get screen() { return screen; }, get peekOpen() { return peekOpen; }, go, newGame, ACT, dialog,
  // smoke tests: let a bot sit in seat 0 so a whole hand plays itself
  autoplay(level = "standard") { if (G) G.seats.forEach((s) => { if (s.kind === "human") { s.kind = "bot"; s.level = level; } }); if (pending) { const p = pending, m = MOD[G.game]; p.resolve(decide(m.view(G.st, p.seat), level).action); } } };
