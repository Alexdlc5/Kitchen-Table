// Kitchen Table: screens and flow (docs/DESIGN.md §4). Rules live in spades.js / hearts.js, bots in ai.js, the deal in
// dealer.js; this file only shows the table and asks the humans. Every screen is drawn from the save (S) and the game (G).
import { platform, track, setTelemetry } from "./platform.js";
import { LANGS, CHOSEN } from "./i18n.js";
import { newSeed } from "./dealer.js";
import { rulesFor, team, partner, newDeck, SUITS } from "./cards.js";
import * as spades from "./spades.js";
import * as hearts from "./hearts.js";
import * as euchre from "./euchre.js";
import * as ohhell from "./ohhell.js";
import * as whist from "./whist.js";
import * as more from "./more-games.js";
import { decide, nilRisk, nilForbidden } from "./ai.js";
import { face, cardName, titleProps } from "./art.js";
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
    theme: "walnut", back: null, text: "normal", speak: false, speakRate: 1 },
  last: { game: "hearts", preset: "standard", custom: {}, partner: "standard", opps: "standard", seats: ["you", "bot", "bot", "bot"] },
  cur: null, deals: [], record: {}, best: {}, care: { pin: null, lock: false, games: ["hearts", "spades", "euchre"], straight: false, euchre: 1 },
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
const toggle = (act, on, label) => `<div class="row"><span>${label}</span><button class="toggle" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-act="${act}"></button></div>`;
let screen = null;
function show(id) {
  screen = id;
  const sc = $("#scene");
  if (SCENES[id]) sc.style.background = SCENES[id];
  sc.classList.toggle("on", !!SCENES[id]);
  document.querySelectorAll(".screen").forEach((e) => e.classList.toggle("on", e.id === id));
  document.querySelectorAll(".screen:not(.on)").forEach((e) => e.setAttribute("aria-hidden", "true"));
  $("#" + id).removeAttribute("aria-hidden");
}
function applyLook() {
  const root = document.documentElement;
  root.classList.toggle("comfort", !!S.opt.comfort);
  root.style.setProperty("--speed", S.opt.speed === "fast" ? 0.6 : 1);
  const theme = ownsTheme(S.opt.theme) ? S.opt.theme : "walnut", st = themeStyle(theme), felt = $("#felt");
  felt.style.background = st.background; felt.style.boxShadow = st.boxShadow;
  for (const [k, v] of Object.entries(st.vars)) root.style.setProperty(k, v);
  root.classList.toggle("text-l", S.opt.text === "large"); root.classList.toggle("text-xl", S.opt.text === "xl");
  speech.enabled = !!S.opt.speak; speech.rate = S.opt.speakRate || 1;
  sound.enabled = S.opt.sound; sound.setIgnoreSilent(S.opt.loud);
  faces.clear();
  backSvg = themeBack(ownsTheme(S.opt.back) ? S.opt.back : theme);
}
const ownsTheme = (id) => THEMES[id] && (THEMES[id].tier === "free" || platform.owns("theme_" + id));
const faces = new Map();
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches; // no motion, ever, when the phone asks
const svgFor = (c) => { const k = c + S.opt.four; if (!faces.has(k)) faces.set(k, face(c, { four: S.opt.four })); return faces.get(k); };
const cardEl = (c, attrs = "", cls = "", label = cardName(c)) => `<button class="card ${cls}" data-card="${c}" aria-label="${label}" ${attrs}>${svgFor(c)}</button>`;
let backSvg = ""; // the chosen card back, drawn once per change of theme

// R2: nothing may pop up between the deal and the last trick. dialog() refuses unless the player opened it themselves.
let handLive = false;
const blocked = []; // ?debug: what tried to interrupt a hand (smoke.mjs fails on any)
function dialog(html, { user = false } = {}) {
  if (handLive && !user) { blocked.push(html.slice(0, 60)); return Promise.resolve(null); }
  $("#dialogBody").innerHTML = html; $("#dialog").hidden = false;
  return new Promise((res) => { dialog.done = (v) => { $("#dialog").hidden = true; dialog.done = null; res(v); }; });
}

// R9: an outbound link only after a grown-up check (press and hold), never while the caregiver lock is on
async function gate(url, what) {
  if (S.care.lock) return;
  const ok = await dialog(`<h2>Leaving ${BRAND}</h2><p>This opens ${esc(what)} in Safari. Press and hold the button for two seconds.</p>
    <div class="stack"><button class="btn big hold" data-hold="2000">Hold to open<i></i></button><button class="btn" data-dlg="">Stay here</button></div>`, { user: true });
  if (ok === "hold") platform.openUrl(url);
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
    <p class="kicker" data-act="kicker">Play a game of cards at…</p><h1 class="wordmark">${cfg.brand.wordmark}</h1>
    <div class="hero"><div class="props">${titleProps()}</div><div class="fan">${fan}</div></div>
    <button class="btn big" data-act="deal" data-game="${game}">${S.cur ? "Back to the table" : `Deal: ${GAME_NAME[game]}`}</button>
    <div class="grid2">
      <button class="btn" data-act="go" data-to="picker">Games and rules</button>
      <button class="btn" data-act="go" data-to="boards">Leaderboards</button>
      <button class="btn" data-act="${lock ? "care" : "go"}" data-to="shop">Table shop</button>
      <button class="btn" data-act="go" data-to="stats">Fair deal</button>
      <button class="btn" data-act="go" data-to="howto">How to play</button>
      <button class="btn" data-act="${lock ? "care" : "go"}" data-to="options">Options</button>
    </div>
    <div class="row" style="justify-content:center"><button class="link" data-act="restore">Restore purchases</button><button class="link" data-act="care" aria-label="Caregiver settings">Caregiver</button></div>
    ${familyTest ? `<button class="btn ghost" data-act="family">Family table test</button>` : ""}
  </div>`;
}

function renderPicker() { // playable games two to a shelf, then the closed boxes of what's coming
  const playable = Object.keys(cfg.games).filter((g) => !cfg.games[g].release && S.care.games.includes(g));
  const coming = [...Object.keys(cfg.games).filter((g) => cfg.games[g].release).map((g) => [g, GAME_NAME[g], `${GAME_NAME[g]}, coming soon, free with Everything`]),
    ...Object.entries(more.ROADMAP).map(([g, [name, said]]) => [g, name, `${said}, coming soon`])];
  const box = (g) => {
    const locked = !owns(g), sub = g === "hearts" ? "Free forever" : locked ? "Part of Everything" : "Ready to play";
    return `<button class="box" data-act="openbox" data-game="${g}" aria-label="${GAME_NAME[g]}, ${sub}${locked ? ", locked" : ""}">${tuckBox(g, GAME_NAME[g], { locked })}<span class="boxcap">${sub}</span></button>`;
  };
  const shelves = [];
  for (let i = 0; i < playable.length; i += 2) shelves.push(`<div class="shelf">${playable.slice(i, i + 2).map(box).join("")}</div>`);
  const rows = shelves.join("") + `<h2 class="shelfsign">Coming to the table</h2><div class="shelf soon">${coming.map(([g, name, said]) => `<div class="box soon" role="img" aria-label="${said}">${tuckBox(g, name, { soon: true })}</div>`).join("")}</div>`;
  const unlockRow = !platform.owns("everything") && !S.opt.comfort && !S.care.lock ? `<button class="btn" data-act="go" data-to="unlock">Unlock everything · $6.99 once</button>` : "";
  $("#picker").innerHTML = `<div class="stack"><h1 class="sign">The game cupboard</h1>${rows}${unlockRow}<button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}

let setupGame = "hearts";
function renderSetup() {
  const g = setupGame, L = S.last, defs = cfg.rules[g];
  const seg = (act, val, opts, names) => `<div class="seg">${opts.map((o) => `<button data-act="${act}" data-v="${o}" aria-pressed="${val === o}">${names[o]}</button>`).join("")}</div>`;
  const seatRow = [1, 2, 3].map((s) => {
    const who = TEAMS(g) ? (s === 2 ? "Partner" : s === 1 ? "Left" : "Right") : ["", "Left", "Across", "Right"][s];
    return `<div class="row"><span>${who}</span>${seg("seat" + s, L.seats[s] || "bot", ["bot", "human"], { bot: "Computer", human: "Person here" })}</div>`;
  }).join("");
  const custom = L.preset === "custom" ? defs.map((d) => {
    const v = L.custom[d.id] ?? d.presets.standard;
    const ctl = d.type === "toggle" ? `<button class="toggle" role="switch" aria-checked="${!!v}" data-act="rule" data-id="${d.id}"></button>`
      : d.type === "choice" ? `<select data-act="rulesel" data-id="${d.id}">${d.choices.map((c) => `<option ${c === v ? "selected" : ""}>${c}</option>`).join("")}</select>`
      : `<select data-act="rulesel" data-id="${d.id}">${Array.from({ length: (d.range[1] - d.range[0]) / d.step + 1 }, (_, i) => d.range[0] + i * d.step).map((c) => `<option ${c === v ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    return `<div class="row"><span>${d.name}<br><small class="muted">${d.explain}</small></span>${ctl}</div>`;
  }).join("") : defs.filter((d) => d.presets[L.preset] !== d.presets.standard || L.preset === "standard").slice(0, 6).map((d) => `<div class="row"><span>${d.name}<br><small class="muted">${d.explain}</small></span><b>${fmt(d, rulesFor(cfg, g, L.preset)[d.id])}</b></div>`).join("");
  $("#setup").innerHTML = `<div class="stack">
    <h1>${GAME_NAME[g]}</h1>
    <div class="paper"><h2>House rules</h2><div class="grid2">${seg("preset", L.preset, ["standard", "kitchen", "tournament", "custom"], PRESET_NAME)}</div>${custom}</div>
    <div class="paper"><h2>Players</h2>
      ${TEAMS(g) ? `<div class="row"><span>Partner plays</span>${seg("partner", L.partner, ["easy", "standard", "expert", "extreme"], LEVEL_NAME)}</div>` : ""}
      <div class="row"><span>${TEAMS(g) ? "Opponents play" : "Computer players"}</span>${seg("opps", L.opps, ["easy", "standard", "expert", "extreme"], LEVEL_NAME)}</div>
      <p class="muted">Pass and play: pick "Person here" and hand the phone around.</p>${seatRow}</div>
    <button class="btn big" data-act="deal" data-game="${g}">Deal</button>
    <button class="btn ghost" data-act="go" data-to="picker">Back</button></div>`;
}
const fmt = (d, v) => (d.type === "toggle" ? (v ? "On" : "Off") : d.id === "moon" ? { add: "+26 to others", choose: "Shooter chooses", off: "Off" }[v] : d.id === "passing" ? v.replaceAll(",", ", ") : v === 0 ? "Off" : v);

// ---------------------------------------------------------------- the game
let G = null, runId = 0, pending = null, showTrick = null, why = {};
function newGame(game, fixed = null) {
  const L = S.last;
  L.game = game;
  const rules = rulesFor(cfg, game, L.preset, L.preset === "custom" ? L.custom : {});
  const seats = fixed || [0, 1, 2, 3].map((s) => {
    const kind = s === 0 || L.seats[s] === "human" ? "human" : "bot", level = TEAMS(game) && s === 2 ? L.partner : L.opps;
    return { kind, level, name: kind === "human" ? (s === 0 ? "You" : `Player ${s + 1}`) : BOTS[level][s - 1] };
  });
  G = { game, rules, preset: L.preset, seats, totals: undefined, // the first hand starts from its own game's empty totals
    handNo: 0, dealer: 3, history: [], st: null, viewer: 0, reasons: {}, over: null };
  track("game_start", { game, preset: L.preset, level: L.opps });
  startHand();
}
function startHand() {
  if (net && !net.host) return guestHand();
  const m = MOD[G.game];
  G.st = m.newHand(G.rules, newSeed(), G.dealer, G.totals, G.handNo);
  G.totals ??= structuredClone(G.st.totals);
  if (net) net.send({ t: "start", seed: G.st.seed, game: G.game, rules: G.rules, preset: G.preset, seats: G.seats, dealer: G.dealer, handNo: G.handNo, totals: G.totals });
  G.reasons = {}; why = {};
  if (G.st.hands[0].length === 13) recordDeal(G.st.hands[0], G.game, G.rules); // the ledger compares full 13-card hands
  S.cur = G; save();
  sound.shuffle();
  G.justDealt = true;
  announce(`Hand ${G.handNo + 1}. New cards are dealt.${G.game === "euchre" ? ` ${G.seats[G.st.dealer].name} deals; the upcard is the ${cardName(G.st.up)}.` : ""} ${more.handIntro(G.game, G.st, G.seats.map((x) => x.name))}`, { interrupt: true });
  run();
}
function recordDeal(hand, game, rules) { // the stats screen's last 1,000 deals (seat 0 only, as dealt)
  if (game === "euchre") return; // the ledger compares 13-card hands with a full deck; five from twenty-four would skew it
  const j = game === "spades" && rules.jokers, E = (c) => spades.eff(c, j);
  const len = "SHDC".split("").map((s) => hand.filter((c) => (game === "spades" ? E(c) : c[1]) === s).length);
  S.deals.push({ g: game[0], j: j ? 1 : 0, hc: hand.filter((c) => "AKQJ".includes(c[0])).length, sh: [...len].sort((a, b) => b - a).join(""), sp: len[0],
    qs: hand.includes("QS") ? 1 : 0, nil: game === "spades" && !nilForbidden(hand, rules) && nilRisk(hand, rules) <= 0.22 ? 1 : 0 });
  if (S.deals.length > 1000) S.deals.splice(0, S.deals.length - 1000);
}

const humans = () => G.seats.filter((s) => s.kind !== "bot").length; // "remote": a person at another device
async function run() {
  const my = ++runId, m = MOD[G.game], st = G.st;
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
      action = net.host ? await net.intent(s, seat.player, (a) => (st.phase === "pass" ? Array.isArray(a) && new Set(a).size === 3 && a.every((c) => st.hands[s].includes(c)) : m.legal(st).includes(a))) : await net.did(s);
      if (my !== runId) return;
    }
    if (action === null) { // a bot, or the seat of someone who left
      await wait((st.phase === "play" ? 520 : 380) * speed());
      await speech.idle(); // when the table is read aloud, the bots wait for the voice to finish
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
    if (st.history.length > before) await played(s, action);
    else drawTable();
    save();
  }
  handLive = false;
  if (my === runId) finishHand();
}
async function played(seat, card) {
  sound.card(); if (G.seats[seat].kind === "human" && S.opt.haptics) platform.haptic();
  const st = G.st, done = !st.trick.length;
  announce(`${G.seats[seat].name} played the ${cardName(card)}.`);
  if (done) {
    const w = st.turn, ours = TEAMS(G.game) ? team(w) === team(G.viewer) : w === G.viewer;
    announce(`${w === G.viewer ? "You take" : G.seats[w].name + " takes"} the trick.`);
    if (ours && S.opt.haptics) platform.haptic("medium");
  }
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
const offset = (p, k = 0.62) => { const cw = css("--tcw"); return [[0, cw * k * 0.9], [-cw * k, 0], [0, -cw * k * 0.9], [cw * k, 0]][p]; };

function drawTable(justPlayed = -1) {
  if (!G) return;
  const st = G.st, m = MOD[G.game], me = G.viewer, isSp = G.game === "spades", isEu = G.game === "euchre";
  // seats
  const plate = (s) => {
    const p = pos(s), seat = G.seats[s], cls = ["s-me", "s-left", "s-top", "s-right"][p];
    const bid = isSp ? (st.bids[s] === null ? "" : st.bids[s] === 0 ? (st.blind[s] ? "Blind nil" : "Nil") : `Bid ${st.bids[s]}`) : "";
    const status = isEu ? euchreStatus(s) : more.plateStatus(G.game, st, s) ?? (isSp ? (bid ? `<span>${bid}</span><span>took ${st.tricks[s]}</span>` : "") : `<span>${st.taken[s].reduce((n, c) => n + hearts.points(c, G.rules), 0)} pts</span>`);
    const pips = seat.kind === "bot" ? `<span class="pips" aria-label="${LEVEL_NAME[seat.level]}">${"●".repeat({ easy: 1, standard: 2, expert: 3, extreme: 4 }[seat.level])}</span>` : "";
    const tag = TEAMS(G.game) && s === partner(me) && !S.opt.comfort ? "<span>Partner</span>" : "";
    const whyLine = why[s] && G.reasons[s] ? `<span class="why">${WHY[G.reasons[s].split(":")[0]] || ""}</span>` : "";
    return `<button class="seat ${cls} ${st.turn === s && st.phase !== "done" ? "turn" : ""}" data-act="why" data-seat="${s}" aria-label="${esc(seat.name)}"><b>${esc(seat.name)}</b>${tag || status ? `<span class="st">${tag}${status}</span>` : ""}${pips}${p ? `<span class="backs" aria-hidden="true">${backSvg.repeat(Math.min(3, st.hands[s].length))}</span>` : ""}${whyLine}</button>`;
  };
  $("#readBtn").hidden = !S.opt.speak;
  $("#seats").innerHTML = [0, 1, 2, 3].map(plate).join("");
  // trick
  const tr = showTrick || st.trick;
  $("#trick").innerHTML = tr.map((t) => { const [x, y] = offset(pos(t.seat)); return cardEl(t.card, `tabindex="-1" style="transform: translate(${x}px, ${y}px) rotate(${(t.seat * 7) % 11 - 5}deg)"`); }).join("");
  if (justPlayed >= 0) {
    const el = [...document.querySelectorAll("#trick .card")].find((e, i) => tr[i].seat === justPlayed);
    if (el) { const [x, y] = offset(pos(justPlayed), 3); el.animate([{ translate: `${x}px ${y}px`, opacity: 0.4 }, { translate: "0 0", opacity: 1 }], { duration: 240 * speed(), easing: "ease-out" }); }
  }
  // hand
  const hand = [...st.hands[me]].sort(isEu ? sortE : isSp ? sortS : sortH);
  const mine = pending && pending.seat === me ? pending : null;
  const legal = mine?.kind === "play" ? new Set(mine.legal) : null;
  $("#hand").innerHTML = hand.map((c) => {
    const enabled = mine && (["pass", "farmer", "discard"].includes(mine.kind) || (legal && legal.has(c))), dim = legal && !legal.has(c); // dim only what you can't play now
    return cardEl(c, `data-act="card" ${enabled ? "" : "disabled"}`, `${mine?.sel?.includes(c) ? "sel" : ""} ${dim ? "dim" : ""}`, `${cardName(c)}${dim ? ", can't play now" : mine?.sel?.includes(c) ? ", selected" : ""}`);
  }).join("");
  const hh = layoutHand();
  const mePlate = document.querySelector(".s-me");
  mePlate.style.bottom = `calc(var(--safe-b) + ${hh + 18}px)`;
  $("#trump").innerHTML = more.trumpTile(st, svgFor, G.seats.map((x) => x.name)); $("#trump").style.bottom = mePlate.style.bottom;
  // the trick and the side seats sit in the middle of whatever room the top seat and the hand leave
  const free0 = Math.max(...[".s-top", ...(S.opt.comfort ? [".s-left", ".s-right"] : [])].map((q) => document.querySelector(q).getBoundingClientRect().bottom)), free1 = mePlate.getBoundingClientRect().top;
  $("#table").style.setProperty("--free0", free0 + "px"); $("#table").style.setProperty("--mid", (free0 + free1) / 2 + "px");
  // centre: bids, passing, the moon choice, or a word from the table
  $("#center").innerHTML = centre(mine);
  // score chip
  $("#scoreChip").textContent = TEAMS(G.game) ? `Us ${G.totals.score[team(me)]} · Them ${G.totals.score[1 - team(me)]}${isEu && st.trump ? ` · ${SUIT_SIGN[st.trump]} trump` : ""}` : G.seats.map((x, s) => `${s === me ? "You" : x.name[0]} ${G.totals.score[s]}`).join(" · ");
}
const ORDER = { S: 0, H: 1, C: 2, D: 3 };
const sortH = (a, b) => ORDER[a[1]] - ORDER[b[1]] || hearts.pow(a) - hearts.pow(b);
const sortE = (a, b) => { const t = G.st.trump, k = (c) => (euchre.eff(c, t) === t ? -1 : ORDER[euchre.eff(c, t)]); return k(a) - k(b) || euchre.pow(a, t) - euchre.pow(b, t); }; // trump on the left
const sortS = (a, b) => { const j = G.rules.jokers, ea = spades.eff(a, j), eb = spades.eff(b, j); return ORDER[ea] - ORDER[eb] || spades.pow(a, j) - spades.pow(b, j); };

function layoutHand() { // rows so every card's visible strip is at least one tap target wide and tall
  const el = $("#hand"), cards = [...el.children], n = cards.length, W = el.clientWidth - 24;
  const cw = css("--cw"), ch = cw * 1.4, T = css("--tap");
  let per = n;
  while (per > 1 && (W - cw) / (per - 1) < T) per--;
  const rows = Math.max(1, Math.ceil(n / Math.max(1, per)));
  per = Math.ceil(n / rows);
  const step = per > 1 ? Math.min(cw * 0.72, (W - cw) / (per - 1)) : 0, rowStep = Math.max(T, ch * 0.42);
  const size = (r) => Math.floor(n / rows) + (r < n % rows ? 1 : 0); // rows as even as possible: 4-3-3-3, not 4-4-4-1
  let r = 0, k = 0;
  cards.forEach((c, i) => {
    if (k === size(r)) { r++; k = 0; }
    const x0 = 12 + (W - (cw + step * (size(r) - 1))) / 2;
    c.style.left = x0 + k * step + "px"; c.style.top = r * rowStep + "px"; c.style.zIndex = i;
    k++;
  });
  const h = n ? ch + (rows - 1) * rowStep : 0;
  el.style.height = h + "px";
  return h;
}

function centre(mine) {
  const st = G.st, seatName = (s) => G.seats[s].name;
  if (G.game === "euchre") return euchreCentre(mine);
  if (mine?.kind === "bid" && G.game === "ohhell") return more.bidPanel(mine, st);
  if (mine?.kind === "bid") {
    const nums = mine.legal.filter((a) => !a.blind), blind = mine.legal.some((a) => a.blind) ? `<button class="btn" data-act="bid" data-v="blind">Blind nil (before looking)</button>` : "";
    if (S.opt.comfort) { // a stepper keeps the big hand in view: one row instead of fourteen buttons; below 1 is nil
      const ok = nums.map((a) => a.bid);
      mine.step = Math.min(13, Math.max(0, mine.step ?? 3));
      if (!ok.includes(mine.step)) mine.step = ok.reduce((x, y) => (Math.abs(y - mine.step) < Math.abs(x - mine.step) ? y : x));
      const v = mine.step === 0 ? "Nil" : mine.step;
      return `<div class="row" style="gap:8px;justify-content:center;flex-wrap:nowrap">
        <button class="btn" data-act="step" data-v="-1" aria-label="One less">−</button><b style="font-size:var(--fs-l);min-width:2ch;text-align:center">${v}</b>
        <button class="btn" data-act="step" data-v="1" aria-label="One more">+</button><button class="btn big" data-act="bid" data-v="${mine.step}">Bid ${v === "Nil" ? "nil" : v}</button></div>${blind}`;
    }
    return `<div class="say">Your bid</div><div class="bidpad">${nums.map((a) => `<button class="btn" data-act="bid" data-v="${a.bid}">${a.bid === 0 ? "Nil" : a.bid}</button>`).join("")}</div>
      ${mine.legal.some((a) => a.blind) ? `<button class="btn" data-act="bid" data-v="blind">Blind nil (before looking)</button>` : ""}`;
  }
  if (mine?.kind === "pass") {
    const dir = { 1: "left", 2: "across", 3: "right" }[st.dir];
    return `<div class="say">Pick 3 cards to pass ${dir} (${mine.sel.length}/3)</div>${mine.sel.length === 3 ? `<button class="btn big" data-act="pass">Pass ${dir}</button>` : ""}`;
  }
  if (mine?.kind === "moon") return `<div class="say">You shot the moon!</div><button class="btn big" data-act="moon" data-v="add">Everyone else +26</button><button class="btn" data-act="moon" data-v="sub">Take 26 off my score</button>`;
  if (mine?.kind === "play" && mine.sel?.length) return `<div class="say">Tap the card again to play it</div>`;
  if (st.phase === "bid" && G.seats[st.turn].kind === "bot") return `<div class="say">${esc(seatName(st.turn))} is thinking…</div>`;
  if (st.phase === "pass" && !mine) return `<div class="say">Passing…</div>`;
  return "";
}

function ask(seat) { // resolves with the human's action
  const st = G.st, m = MOD[G.game];
  return new Promise((resolve) => {
    const legal = m.legal(st);
    pending = { seat, legal, kind: st.phase === "play" ? "play" : st.phase, sel: [], alone: false, resolve: (a) => { pending = null; resolve(a); } };
    drawTable();
    if (S.opt.haptics) platform.haptic("medium");
    announce({ play: "Your turn.", bid: more.bidPrompt(G.game, st) || "Your turn to bid.", pass: "Choose three cards to pass.", moon: "You shot the moon! Add 26 to everyone else, or take 26 off your score?", ...EUCHRE_ASK }[pending.kind]);
  });
}
async function handoff(s) {
  const el = $("#handoff");
  el.innerHTML = `<h2 class="onfelt">Pass the phone to ${esc(G.seats[s].name)}</h2><button class="btn big" data-act="handoff" data-seat="${s}">I'm ${esc(G.seats[s].name)}: show my cards</button>`;
  el.hidden = false;
  await new Promise((r) => (handoff.done = r));
  el.hidden = true; G.viewer = s; drawTable();
}

function finishHand() {
  const m = MOD[G.game], st = G.st, sc = m.score(st), me = 0;
  const lines = sc.lines;
  if (G.game === "spades") { const mine = lines.filter((l) => l.team === team(me)); if (mine.some((l) => l.kind === "set" || ((l.kind === "nil" || l.kind === "blindNil") && !l.made))) sound.set(); else sound.made(); }
  else if (more.NAMES[G.game]) more.goodHand(G.game, lines.filter((l) => (l.team ?? l.seat) === me)) ? sound.made() : sound.set();
  if (G.game === "euchre" && lines[0].team !== null) { if (lines[0].team === team(me)) sound.made(); else if (lines[0].kind.includes("uchre")) sound.set(); }
  G.history.push({ seed: st.seed, dealer: st.dealer, n: G.handNo + 1, lines, totals: sc.totals, bids: st.bids && [...st.bids], tricks: [...st.tricks], moon: st.moon });
  G.totals = sc.totals; G.handNo++; G.dealer = (G.dealer + 1) % 4; S.hands++;
  G.over = m.winner(G.totals, G.rules);
  if (G.over !== null && net) { net.leave(); net = null; }
  track("hand_end", { game: G.game, preset: G.preset, level: S.last.opps, hands_this_session: ++sessionHands });
  save(); renderSheet(); show("sheet");
}
let sessionHands = 0;

function renderSheet() {
  const h = G.history[G.history.length - 1], sp = TEAMS(G.game), bags = G.game === "spades";
  const who = (l) => G.seats[l.seat].name;
  const label = (l) => {
    switch (l.kind) {
      case "made": if (G.game === "euchre") return euchreLine(l); return `Bid ${l.bid}, took ${l.took}`;
      case "set": return `Bid ${l.bid}, took ${l.took}: set`;
      case "nil": return `${who(l)}: nil ${l.made ? "made" : "broken"}`;
      case "blindNil": return `${who(l)}: blind nil ${l.made ? "made" : "broken"}`;
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
  $("#sheet").innerHTML = `<div class="stack"><div class="paper pad spiral">${st}<h2>Hand ${h.n}</h2>${table}${sp ? "" : `<h3>Game</h3>${totals}`}
    <p class="muted">Deal #${S.hands} · dealer: ${esc(G.seats[h.dealer].name)} (${["you", "left of you", "across from you", "right of you"][h.dealer]}) · seed <span class="seed">${h.seed}</span></p>
    <button class="link" style="color:var(--ink)" data-act="seedinfo">What is the seed?</button></div>
    <button class="btn big" data-act="next">${G.over !== null ? "See who won" : "Next hand"}</button></div>`;
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
    <div class="row"><button class="btn" data-act="consent" data-v="no">No thanks</button><button class="btn big" data-act="consent" data-v="yes">Yes, share</button></div></div>` : "";
  S.cur = null; save();
  if (won && !calm()) setTimeout(confetti, 300);
  $("#results").innerHTML = `<div class="stack">${won ? `<div class="ribbon">${rosette(sp ? "Win!" : "1st")}</div>` : `<p class="kicker">Good game. There's always the next deal.</p>`}<h1>${who}</h1>${newBest.length ? `<p class="say" style="justify-self:center">New personal best: ${esc(newBest.join(", "))}</p>` : ""}
    <div class="paper pad"><table>${(sp ? [0, 1] : [0, 1, 2, 3]).map((i) => `<tr><td>${sp ? (i === 0 ? "You and " + esc(G.seats[2].name) : esc(G.seats[1].name) + " and " + esc(G.seats[3].name)) : esc(G.seats[i].name)}</td><td class="n">${G.totals.score[i]}</td></tr>`).join("")}</table>
    <p class="muted">${G.handNo} hand${G.handNo === 1 ? "" : "s"} · ${PRESET_NAME[G.preset]} rules · ${rec.won} won of ${rec.played}</p></div>
    <button class="btn big" data-act="again">Deal again</button>
    ${consent}
    <div class="grid2"><button class="btn" data-act="go" data-to="boards">Leaderboards</button><button class="btn" data-act="go" data-to="stats">Fair deal</button></div>
    <button class="btn ghost" data-act="go" data-to="title">Done</button></div>`;
}

// ---------------------------------------------------------------- the fair deal, shown (DESIGN.md §7)
const SHAPES = { 4432: 21.55, 5332: 15.52, 5431: 12.93, 5422: 10.58, 4333: 10.54, 6322: 5.64, 6421: 4.7, 6331: 3.45, 5521: 3.17, 4441: 2.99 };
function choose(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
let nilExpect = null;
function renderStats() {
  const d = S.deals, n = d.length, pct = (x) => (n ? ((100 * x) / n).toFixed(1) : "—");
  const bar = (label, mine, exp, max = 30) => `<div class="b"><span>${label}</span><span class="t"><i style="width:${Math.min(100, (mine / max) * 100)}%"></i><u style="left:${Math.min(100, (exp / max) * 100)}%"></u></span><span>${mine.toFixed(1)}%</span></div>`;
  const hc = n ? d.reduce((a, x) => a + x.hc, 0) / n : 0;
  const shapes = Object.entries(SHAPES).map(([sh, e]) => bar(sh.split("").join("-"), n ? (100 * d.filter((x) => x.sh === sh).length) / n : 0, e)).join("");
  const plain = d.filter((x) => !x.j), np = plain.length;
  const spades = [0, 1, 2, 3, 4, 5, 6].map((k) => bar(`${k}${k === 6 ? "+" : ""} spades`, np ? (100 * plain.filter((x) => (k === 6 ? x.sp >= 6 : x.sp === k)).length) / np : 0,
    k === 6 ? 100 * (1 - [0, 1, 2, 3, 4, 5].reduce((a, j) => a + (choose(13, j) * choose(39, 13 - j)) / choose(52, 13), 0)) : (100 * choose(13, k) * choose(39, 13 - k)) / choose(52, 13), 35)).join("");
  const h = d.filter((x) => x.g === "h"), s = d.filter((x) => x.g === "s");
  if (nilExpect === null) { // expected share of nil-able hands, from 20,000 fresh deals
    const r = rulesFor(cfg, "spades", "standard"), deck = newDeck(); let k = 0;
    for (let i = 0; i < 20000; i++) { const hand = [...deck].sort(() => Math.random() - 0.5).slice(0, 13); if (!nilForbidden(hand, r) && nilRisk(hand, r) <= 0.22) k++; }
    nilExpect = (100 * k) / 20000;
  }
  const rec = Object.entries(S.record).map(([g, r]) => `<tr><td>${GAME_NAME[g]}</td><td class="n">${r.won} of ${r.played}</td><td class="n">${g === "hearts" ? (r.best ?? "—") : "streak " + r.streak}</td></tr>`).join("");
  $("#stats").innerHTML = `<div class="stack ledger"><h1>The fair deal ledger</h1>
    <div class="paper"><p>Every hand is shuffled from a random seed and nothing else: not your score, your streak, what you bought, or who is winning. The seed is on every score sheet, and our website re-deals any hand from it.</p>${S.care.lock ? "" : `<button class="btn" data-act="verify">Check a deal on our website</button>`}
    <p class="muted">Your last ${n} deal${n === 1 ? "" : "s"}. The green bar is you; the black line is what a fair deck gives on average. Small samples wobble.</p></div>
    <div class="paper"><h2>High cards</h2><p>Aces, kings, queens and jacks per hand: <b>${hc.toFixed(2)}</b> (a fair deck averages <b>4.00</b>)</p></div>
    <div class="paper"><h2>Hand shapes</h2><div class="bars">${shapes}</div></div>
    <div class="paper"><h2>Spades in your hand</h2><div class="bars">${spades}</div></div>
    <div class="paper"><h2>Hearts</h2><p>Queen of spades dealt to you: <b>${h.length ? ((100 * h.filter((x) => x.qs).length) / h.length).toFixed(1) : "—"}%</b> of ${h.length} hands (fair: 25%)</p></div>
    <div class="paper"><h2>Spades</h2><p>Hands you could bid nil on: <b>${s.length ? ((100 * s.filter((x) => x.nil).length) / s.length).toFixed(1) : "—"}%</b> of ${s.length} (fair: ${nilExpect.toFixed(1)}%)</p></div>
    ${rec ? `<div class="paper pad"><h2>Your games</h2><table>${rec}</table></div>` : ""}
    <button class="btn ghost" data-act="go" data-to="title">Back</button></div>`;
}

// ---------------------------------------------------------------- options, caregiver, unlock, how to play
function renderOptions() {
  const o = S.opt, seg = (act, val, opts) => `<div class="seg">${opts.map(([v, label]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${val === v}">${label}</button>`).join("")}</div>`;
  const owned = Object.keys(THEMES).filter(ownsTheme);
  $("#options").innerHTML = `<div class="stack"><h1>Options</h1>
    <div class="paper"><h2>Accessibility</h2>
      <div class="row"><span>Text size</span>${seg("textsize", o.text || "normal", [["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]])}</div>
      ${toggle("opt:comfort", o.comfort, "Comfort mode: bigger cards, tap twice to play, slower table")}
      ${toggle("opt:four", o.four, "Four-color deck (♦ blue, ♣ green)")}${toggle("opt:confirm", o.confirm || o.comfort, "Tap twice to play a card")}
      ${toggle("opt:speak", o.speak, "Read the table aloud")}
      ${o.speak ? `<div class="row"><span>Reading speed</span>${seg("speakrate", o.speakRate || 1, [[0.8, "Slower"], [1, "Normal"], [1.2, "Faster"]])}</div>` : ""}
      ${toggle("opt:haptics", o.haptics, "Vibrate on your turn and when you win a trick")}
      <p class="muted">Blind or low-vision? ${BRAND} works with VoiceOver: every card, bid and play is announced. "Read the table aloud" speaks the same things with the phone's own voice if you don't use VoiceOver, and adds a Read button at the table.</p></div>
    <div class="paper"><h2>Table</h2>
      <div class="row"><span>Speed</span>${seg("speed", o.speed, [["relaxed", "Relaxed"], ["normal", "Normal"], ["fast", "Fast"]])}</div>
      <div class="row"><span>Card back</span><select data-act="back"><option value="">Matches the table</option>${owned.map((id) => `<option value="${id}" ${o.back === id ? "selected" : ""}>${esc(THEMES[id].name)}</option>`).join("")}</select></div>
      <div class="row"><span>Table theme</span><button class="btn" data-act="go" data-to="shop">${esc(THEMES[ownsTheme(o.theme) ? o.theme : "walnut"].name)} ›</button></div></div>
    <div class="paper">${toggle("opt:sound", o.sound, "Sound")}${toggle("opt:loud", o.loud, "Play sound when the phone is on silent")}
      <div class="row"><span>Language</span><select data-act="lang"><option value="">Phone setting</option>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${o.lang === k ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
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
      ${toggle("care:straight", c.straight, "Open straight into a game")}
      <div class="row"><span>Computer players</span><div class="seg">${["easy", "standard", "expert", "extreme"].map((v) => `<button data-act="carelevel" data-v="${v}" aria-pressed="${S.last.opps === v}">${LEVEL_NAME[v]}</button>`).join("")}</div></div>
      ${["hearts", "spades", "euchre", "ohhell", "whist"].map((g) => toggle("care:game:" + g, c.games.includes(g), `Show ${GAME_NAME[g]}`)).join("")}</div>
    <div class="paper"><h2>Keep the game on screen</h2><p>Guided Access stops accidental swipes out of the game:</p>
      <ol><li>Settings › Accessibility › Guided Access: turn it on and set a passcode (different from this PIN).</li>
      <li>Open ${BRAND} and triple-click the side (or home) button, then tap Start.</li>
      <li>To finish, triple-click again and enter the Guided Access passcode.</li></ol></div>
    <div class="paper"><h2>Buying it for someone</h2><p>Buy Everything on your own Apple Account with Family Sharing on; it appears on their iPad too. There are no subscriptions and nothing renews.</p>
      ${platform.owns("everything") ? "<p><b>Everything is unlocked on this device.</b></p>" : `<button class="btn" data-act="go" data-to="unlock">Unlock everything · $6.99 once</button>`}</div>
    <div class="paper"><div class="row"><button class="btn" data-act="pinchange">Change PIN</button><button class="btn" data-act="resetstats">Reset stats</button></div></div>
    <button class="btn ghost" data-act="go" data-to="title">Done</button></div>`;
}

async function pin(mode) { // "check" | "set": a large keypad, four digits
  let entered = "", first = null;
  const draw = (msg) => `<h2>${msg}</h2><div class="pinshow">${"●".repeat(entered.length)}${"○".repeat(4 - entered.length)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => (k === "" ? "<span></span>" : `<button class="btn" data-pin="${k}">${k}</button>`)).join("")}</div>
    <button class="btn ghost" style="color:var(--ink);margin-top:10px" data-dlg="">Cancel</button>`;
  let msg = mode === "set" ? "Choose a 4-digit PIN" : "Caregiver PIN";
  const p = dialog(draw(msg), { user: true });
  pin.key = (k) => {
    if (k === "⌫") entered = entered.slice(0, -1); else if (entered.length < 4) entered += k;
    if (entered.length === 4) {
      if (mode === "check") { if (entered === S.care.pin) return dialog.done("ok"); msg = "Wrong PIN, try again"; entered = ""; }
      else if (first === null) { first = entered; entered = ""; msg = "Type it again"; }
      else if (first === entered) { S.care.pin = entered; save(); return dialog.done("ok"); }
      else { first = null; entered = ""; msg = "They didn't match. Choose a PIN"; }
    }
    $("#dialogBody").innerHTML = draw(msg);
  };
  return (await p) === "ok";
}

async function renderUnlock() {
  const prices = await platform.prices(), price = prices.everything || "$6.99";
  $("#unlock").innerHTML = `<div class="stack"><h1>Everything</h1>
    <div class="paper"><h2>${price}, once</h2><p>Opens Spades, Euchre, Oh Hell and Whist now, and every game we add after that. No ads, no subscription, nothing that renews.</p>
      <p>Shared with your family through Family Sharing. Hearts stays free either way.</p>
      <p class="muted">For comparison: the big card apps charge $9.99 for 30 days without ads.</p>
      ${platform.owns("everything") ? "<p><b>You have Everything. Thank you!</b></p>" : platform.native ? `<button class="btn big" data-act="buy" data-v="everything">Unlock for ${price}</button>` : `<p class="muted">This test build in the browser has everything unlocked.</p>`}
      <button class="btn" data-act="restore">Restore purchases</button></div>
    <button class="btn ghost" data-act="go" data-to="picker">Not now</button></div>`;
}

const HOWTO = {
  hearts: "Avoid points. Each heart is 1 point and the queen of spades is 13. Follow the suit that was led if you can; otherwise play anything. The highest card of the suit led wins the trick. Before most hands you pass three cards. The two of clubs leads the first trick. Take every heart and the queen to shoot the moon.",
  ...more.HOWTO,
  spades: "Partners sit across. Everyone bids how many tricks they'll take; nil means none. Follow suit if you can; spades are trump and beat any other suit. Make your team's bid for 10 points a trick; each extra trick is a bag, and too many bags cost points. Miss the bid and you lose 10 a trick.",
  euchre: "Partners sit across, five cards each from a deck of nines to aces. The dealer turns up one card: in turn, anyone may order it up, and its suit is trump (the dealer picks it up and throws one away). If everyone passes, anyone may name another suit. The jack of trump is the highest card, the right bower; the other jack of the same colour is next, the left bower, and counts as trump. Follow suit if you can. The side that chose trump needs three of the five tricks for 1 point, all five for 2. Fall short and the other side scores 2: you've been euchred. Go alone, with your partner sitting out, and all five tricks score 4. First to 10 wins.",
};
function renderHowto() {
  const g = HOWTO[setupGame] && setupGame !== "hearts" ? setupGame : HOWTO[S.last.game] ? S.last.game : "hearts", r = rulesFor(cfg, g, S.last.preset, S.last.custom);
  $("#howto").innerHTML = `<div class="stack"><h1 class="sign">How to play</h1>
    <div class="seg">${Object.keys(HOWTO).map((x) => `<button data-act="howto" data-v="${x}" aria-pressed="${x === g}">${GAME_NAME[x]}</button>`).join("")}</div>
    <div class="paper recipe"><p class="from">From the kitchen table</p><h2>${GAME_NAME[g]}</h2><p class="serves">Serves 4 · ${more.SERVES[g] || (g === "spades" ? "about 25 minutes a game" : "about 15 minutes a game")}</p><p>${HOWTO[g]}</p></div>
    <div class="paper recipe"><p class="from">House rules</p><h2>${PRESET_NAME[S.last.preset]}</h2>${cfg.rules[g].map((d) => `<div class="row"><span>${d.name}<br><small class="muted">${d.explain}</small></span><b>${fmt(d, r[d.id])}</b></div>`).join("")}</div>
    <button class="btn ghost" data-act="${G && S.cur ? "resume" : "go"}" data-to="title">Back</button></div>`;
}

// ---------------------------------------------------------------- the table shop (themes) and leaderboards
const TIER_ORDER = ["classic", "signature", "luxe"];
const priceOf = (tier) => `$${cfg.shop.tiers[tier].price}`;
function themeTile(id, big = false) {
  const t = THEMES[id], mine = ownsTheme(id), using = (S.opt.theme || "walnut") === id;
  const action = using ? `<span class="tag">In use</span>` : mine ? `<button class="btn" data-act="usetheme" data-v="${id}">Use</button>`
    : `<button class="btn big" data-act="buytheme" data-v="${id}">${priceOf(t.tier)}</button>`;
  return `<div class="tile ${big ? "luxe" : ""} ${using ? "using" : ""}"><span class="tprev" data-theme="${id}" aria-hidden="true"><span class="tback">${themeBack(id)}</span><span class="tface">${svgFor("AH")}</span></span>
    <span class="tname">${esc(t.name)}</span><span class="tblurb">${esc(t.blurb)}</span>${action}</div>`;
}
function paintPreviews(root) { // backgrounds are set from JS: their SVG data URLs carry quotes an attribute can't hold
  for (const el of root.querySelectorAll("[data-theme]")) { const st = themeStyle(el.dataset.theme); el.style.background = st.background; el.style.boxShadow = st.boxShadow; }
}
function renderShop() {
  const ids = (tier) => Object.keys(THEMES).filter((k) => THEMES[k].tier === tier);
  const mine = Object.keys(THEMES).filter(ownsTheme), table = ownsTheme(S.opt.theme) ? S.opt.theme : "walnut", backNow = ownsTheme(S.opt.back) ? S.opt.back : null;
  const swatch = (id) => `<button class="swatch ${table === id ? "on" : ""}" data-act="usetheme" data-v="${id}" aria-label="${esc(THEMES[id].name)} table${table === id ? ", in use" : ""}"><span class="tprev" data-theme="${id}"></span><small>${esc(THEMES[id].name.replace(" felt", ""))}</small></button>`;
  // the card backs you own, fanned out like a hand: tap one to play with it
  const backs = [null, ...mine].map((id, i) => {
    const on = backNow === id, label = id ? THEMES[id].name : "Matches the table";
    return `<button class="backpick ${on ? "on" : ""}" style="--i:${i}" data-act="useback" data-v="${id || ""}" aria-label="Card back: ${esc(label)}${on ? ", selected" : ""}">${themeBack(id || table)}<small>${esc(id ? THEMES[id].name.replace(" felt", "") : "Match table")}</small></button>`;
  }).join("");
  const forSale = TIER_ORDER.map((tier) => [tier, ids(tier).filter((id) => !ownsTheme(id))]).filter(([, list]) => list.length);
  $("#shop").innerHTML = `<div class="stack"><h1 class="sign">The table shop</h1>
    <div class="paper thanks"><h2>Thank you for being here</h2>
      <p>${cfg.brand.wordmark} has no ads and never will. It's made by one small team, and every theme you pick up is what keeps the cards coming: new games, new rules, and a table that stays calm. We're truly grateful. Thank you for supporting us.</p>
      <p class="muted">Every theme is yours to keep, on every device in your Family Sharing group. Nothing renews.</p></div>
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
    <div class="pins">${cfg.leaderboards.map((b, i) => `<div class="paper pin" style="--tilt:${[-2, 1.5, -1, 2, -1.5][i % 5]}deg"><h3>${esc(b.name)}</h3><p class="best">${fmt(b, S.best[b.id])}</p><small class="muted">${esc(b.explain)}</small>${(S.newBest || []).includes(b.name) ? `<span class="minirib">${rosette("New!")}</span>` : ""}</div>`).join("")}</div>
    <p class="paper pin small" style="--tilt:1deg">Scores count for games you play alone against the computer. Pass-and-play games don't post scores.</p>
    ${platform.leaderboards ? `<button class="btn big" data-act="gc">See the Game Center leaderboards</button>`
      : `<p class="corknote">${platform.native ? "Sign in to Game Center in Settings to compare with friends and family." : "Game Center leaderboards open from the iPhone and iPad app."}</p>`}
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
  if (g === "euchre") set("euchre_wins", rec.won);
  if (more.NAMES[g]) set(`${g}_wins`, rec.won);
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
  return bits.map((b) => `<span>${b}</span>`).join("");
}
function kittyEl() { // the kitty on the felt: face-down cards under the upcard; after round one the upcard lies turned down, sideways
  const st = G.st, down = st.phase === "bid2";
  return `<div class="kitty ${down ? "down" : ""}" role="img" aria-label="${down ? `The ${cardName(st.up)} was turned down` : `Upcard: the ${cardName(st.up)}`}"><span class="kb">${backSvg}</span><span class="kb">${backSvg}</span><span class="up">${svgFor(st.up)}</span></div>`;
}
function euchreCentre(mine) { // the kitty sits beside the prompt; Comfort drops it (the prompt names the upcard) to keep the big hand clear
  const st = G.st, big = S.opt.comfort, kitty = ["bid1", "bid2", "farmer"].includes(st.phase) && !big ? kittyEl() : "";
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
    return `${top(say)}<div class="callpad" style="--n:${row.length}">${row.map((t) => (t === "pass" ? pass : callBtn(t))).join("")}</div>
      <div class="callpad" style="--n:${big && !r1 && pass ? 2 : 1}">${toggle}${big && !r1 ? pass : ""}</div>`;
  }
  if (mine?.kind === "discard") return `<div class="say">${mine.sel?.length ? "Tap it again to throw it away" : `You picked up the ${cardName(st.up)}. Tap a card to throw away.`}</div>`;
  if (mine?.kind === "farmer") return `${top(`Farmer's hand! Pick three cards to swap with the kitty (${mine.sel.length}/3)`)}
    <div class="callpad" style="--n:2">${mine.sel.length === 3 ? `<button class="btn big" data-act="farmer" data-v="swap">Swap these three</button>` : ""}<button class="btn" data-act="farmer" data-v="keep">Keep my hand</button></div>`;
  if (mine?.kind === "defend") return `<div class="say">${esc(G.seats[st.maker].name)} is going alone. Defend alone?</div>
    <div class="callpad" style="--n:2"><button class="btn big" data-act="defend" data-v="yes">Defend alone</button><button class="btn" data-act="defend" data-v="no">With my partner</button></div>`;
  if (mine?.kind === "play" && mine.sel?.length) return `<div class="say">Tap the card again to play it</div>`;
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
function announce(text, { interrupt = false } = {}) {
  $("#announce").textContent = text; // VoiceOver reads the live region
  speech.say(text, { interrupt });
}
function describeHand(seat) {
  const st = G.st, j = G.game === "spades" && G.rules.jokers, eff = (c) => (G.game === "spades" ? spades.eff(c, j) : G.game === "euchre" ? euchre.eff(c, st.trump) : c[1]);
  return "SHDC".split("").map((s) => { const cs = st.hands[seat].filter((c) => eff(c) === s); return cs.length ? `${SUIT_WORD[s]}: ${cs.map((c) => cardName(c).replace(/ of \w+$/, "")).join(", ")}.` : `No ${SUIT_WORD[s].toLowerCase()}.`; }).join(" ");
}
function describeTable() {
  const st = G.st, parts = [];
  if (st.trick.length) parts.push(st.trick.map((t) => `${G.seats[t.seat].name} played the ${cardName(t.card)}`).join(", ") + ".");
  else parts.push("No cards on the table.");
  if (G.game === "euchre") parts.push(euchreTable());
  if (more.NAMES[G.game]) parts.push(st.trump ? `Trump is ${SUIT_WORD[st.trump].toLowerCase()}.` : "No trump this hand.");
  if (G.game === "spades" || G.game === "ohhell") parts.push(G.seats.map((x, s) => `${x.name} bid ${st.bids[s] === null ? "nothing yet" : st.bids[s] === 0 ? "nil" : st.bids[s]} and has ${st.tricks[s]}`).join(". ") + ".");
  if (pending && pending.seat === G.viewer && EUCHRE_ASK[pending.kind]) parts.push(EUCHRE_ASK[pending.kind]);
  else if (pending && pending.seat === G.viewer) parts.push(pending.kind === "play" ? `Your turn. You can play ${pending.legal.length === st.hands[G.viewer].length ? "any card" : pending.legal.map(cardName).join(", ")}.` : pending.kind === "bid" ? "Your turn to bid." : pending.kind === "pass" ? "Choose three cards to pass." : "");
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
  preset: (el) => { S.last.preset = el.dataset.v; save(); renderSetup(); },
  partner: (el) => { S.last.partner = el.dataset.v; save(); renderSetup(); },
  opps: (el) => { S.last.opps = el.dataset.v; save(); renderSetup(); },
  seat1: (el) => setSeat(1, el), seat2: (el) => setSeat(2, el), seat3: (el) => setSeat(3, el),
  rule: (el) => { const d = cfg.rules[setupGame].find((x) => x.id === el.dataset.id); S.last.custom[d.id] = !(S.last.custom[d.id] ?? d.presets.standard); save(); renderSetup(); },
  card: (el) => {
    if (!pending || el.disabled) return;
    const c = el.dataset.card;
    if (pending.kind === "pass") { const i = pending.sel.indexOf(c); if (i >= 0) pending.sel.splice(i, 1); else if (pending.sel.length < 3) pending.sel.push(c); return drawTable(); }
    if (pending.kind === "farmer") { const i = pending.sel.indexOf(c); if (i >= 0) pending.sel.splice(i, 1); else if (pending.sel.length < 3) pending.sel.push(c); return drawTable(); }
    if (pending.kind === "discard" && (S.opt.comfort || S.opt.confirm) && pending.sel[0] !== c) { pending.sel = [c]; speech.say(cardName(c) + ". Tap again to discard it.", { interrupt: true }); return drawTable(); }
    if (pending.kind === "discard") return pending.resolve(c);
    if (pending.kind !== "play" || !pending.legal.includes(c)) return;
    if ((S.opt.comfort || S.opt.confirm) && pending.sel[0] !== c) { pending.sel = [c]; speech.say(cardName(c) + ". Tap again to play.", { interrupt: true }); return drawTable(); } // tap to pick, tap again to play
    pending.resolve(c);
  },
  step: (el) => { if (pending?.kind === "bid") { pending.dir = +el.dataset.v; pending.step += pending.dir; drawTable(); } },
  bid: (el) => pending?.kind === "bid" && pending.resolve(el.dataset.v === "blind" ? { bid: 0, blind: true } : { bid: +el.dataset.v }),
  pass: () => pending?.kind === "pass" && pending.sel.length === 3 && pending.resolve([...pending.sel]),
  moon: (el) => pending?.kind === "moon" && pending.resolve(el.dataset.v),
  // Euchre: calling trump, going alone, defending alone, a farmer's hand
  call: (el) => { if (pending?.kind !== "bid1" && pending?.kind !== "bid2") return; const call = el.dataset.v, alone = call !== "pass" && (pending.alone || !pending.legal.some((a) => a.call === call && !a.alone)); pending.resolve(call === "pass" ? { call } : { call, alone }); },
  alone: () => { if (pending?.kind === "bid1" || pending?.kind === "bid2") { pending.alone = !pending.alone; announce(pending.alone ? "Going alone: your partner will sit out." : "Playing with your partner."); drawTable(); } },
  defend: (el) => pending?.kind === "defend" && pending.resolve({ defend: el.dataset.v === "yes" }),
  farmer: (el) => pending?.kind === "farmer" && (el.dataset.v === "keep" ? pending.resolve({ swap: null }) : pending.sel.length === 3 && pending.resolve({ swap: [...pending.sel] })),
  handoff: () => handoff.done?.(),
  why: (el) => { const s = +el.dataset.seat; if (G.seats[s].kind !== "bot") return; why[s] = !why[s]; drawTable(); },
  peek: () => { const p = $("#peek"); if (!p.hidden) { p.hidden = true; return; } const last = G.history.slice(-5).reverse();
    p.innerHTML = `<div class="pad"><h3>Score</h3><table>${TEAMS(G.game) ? [0, 1].map((t) => `<tr><td>${t === 0 ? "Us" : "Them"}</td><td class="n">${G.totals.score[t]}</td>${G.totals.bags ? `<td class="n">${G.totals.bags[t]} bags</td>` : ""}</tr>`).join("") : G.seats.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="n">${G.totals.score[i]}</td></tr>`).join("")}</table>
      ${last.length ? `<p class="muted">Last seed: <span class="seed">${last[0].seed}</span></p>` : ""}<button class="btn" data-act="peek">Close</button></div>`; p.hidden = false; },
  menu: async () => {
    const v = await dialog(`<h2>Paused</h2><div class="stack"><button class="btn big" data-dlg="">Keep playing</button><button class="btn" data-dlg="howto">How to play</button><button class="btn" data-dlg="leave">Save and leave</button>${S.care.lock ? "" : `<button class="btn" data-dlg="quit">End this game</button>`}</div>`, { user: true });
    if (v === "howto") { runId++; renderHowto(); show("howto"); }
    if (v === "leave" || v === "quit") {
      if (S.opt.comfort && !(await dialog(`<h2>Leave the table?</h2><div class="stack"><button class="btn big" data-dlg="yes">Yes, leave</button><button class="btn" data-dlg="">No, keep playing</button></div>`, { user: true }))) return;
      runId++; pending = null; handLive = false; net?.leave(); net = null;
      if (v === "quit") { S.cur = null; G = null; }
      save(); go("title");
    }
  },
  resume: () => run(),
  kicker: () => { if (++kickerTaps === 7) { familyTest = true; renderTitle(); } },
  family: () => familyTable(),
  next: () => { if (G.over !== null) { renderResults(); show("results"); } else startHand(); },
  again: () => newGame(G.game),
  seedinfo: () => dialog(`<h2>The seed</h2><p>Each hand is shuffled from this code and nothing else. Type it into the "verify a deal" page on our website and you'll see exactly the same four hands. Nobody, including us, can steer a deal.</p><button class="btn big" data-dlg="">Got it</button>`, { user: true }),
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
  usetheme: (el) => { S.opt.theme = el.dataset.v; save(); applyLook(); renderShop(); },
  buytheme: async (el) => {
    const id = el.dataset.v;
    if (!platform.native) return ACT.usetheme(el);
    if (await platform.buy("theme_" + id)) {
      S.opt.theme = id; save(); applyLook(); renderShop();
      await dialog(`<h2>Thank you!</h2><p><b>${esc(THEMES[id].name)}</b> is yours to keep, on every device in your family. Your support keeps ${cfg.brand.wordmark} free of ads and helps us bring the next game to the table. We're so grateful.</p><button class="btn big" data-dlg="">Back to the shop</button>`, { user: true });
    }
  },
  textsize: (el) => { S.opt.text = el.dataset.v; save(); applyLook(); renderOptions(); },
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
  const d = e.target.closest("[data-dlg]");
  if (d) return dialog.done?.(d.dataset.dlg || null);
  const p = e.target.closest("[data-pin]");
  if (p) return pin.key?.(p.dataset.pin);
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act.startsWith("opt:")) { const k = act.slice(4); S.opt[k] = k === "analytics" ? !(S.opt.analytics === true) : !S.opt[k]; if (k === "analytics") setTelemetry(S.opt.analytics); save(); applyLook(); return screen === "caregiver" ? renderCaregiver() : renderOptions(); }
  if (act.startsWith("care:")) { const k = act.slice(5); if (k.startsWith("game:")) { const g = k.slice(5), a = S.care.games; S.care.games = a.includes(g) ? a.filter((x) => x !== g) : [...a, g]; if (!S.care.games.length) S.care.games = ["hearts"]; } else S.care[k] = !S.care[k]; save(); return renderCaregiver(); }
  ACT[act]?.(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target, act = el.dataset.act;
  if (act === "rulesel") { const d = cfg.rules[setupGame].find((x) => x.id === el.dataset.id); S.last.custom[d.id] = typeof d.presets.standard === "number" ? +el.value : el.value; save(); }
  if (act === "back") { S.opt.back = el.value || null; save(); applyLook(); }
  if (act === "lang") { S.opt.lang = el.value || null; save(); location.reload(); }
});
// press-and-hold buttons (the grown-up gate)
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest("[data-hold]");
  if (!el) return;
  const ms = +el.dataset.hold, bar = el.querySelector("i"), t0 = performance.now();
  let raf;
  const tick = (t) => { const k = (t - t0) / ms; bar.style.width = Math.min(100, k * 100) + "%"; if (k >= 1) { stop(); dialog.done?.("hold"); } else raf = requestAnimationFrame(tick); };
  const stop = () => { cancelAnimationFrame(raf); bar.style.width = "0"; removeEventListener("pointerup", stop); removeEventListener("pointercancel", stop); };
  addEventListener("pointerup", stop); addEventListener("pointercancel", stop);
  raf = requestAnimationFrame(tick);
});
addEventListener("resize", () => { if (screen === "table") drawTable(); });

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
  G.st = MOD[G.game].newHand(G.rules, h.seed, G.dealer, G.totals, G.handNo);
  S.cur = G; save(); sound.shuffle(); G.justDealt = true;
  run();
}

// ---------------------------------------------------------------- boot
applyLook();
setTelemetry(S.opt.analytics === true);
platform.init();
if (S.cur) { G = S.cur; G.viewer = G.viewer ?? 0; run(); } // cards back in hand, exactly where they were
else if (S.care.straight) newGame(owns(S.last.game) && S.care.games.includes(S.last.game) ? S.last.game : "hearts");
else go("title");
window.Capacitor?.Plugins?.SplashScreen?.hide();

if (DEBUG) window.kt = { S, cfg, blocked, applyLook, get net() { return net; }, get pending() { return pending; }, get G() { return G; }, get screen() { return screen; }, go, newGame, ACT, dialog,
  // smoke tests: let a bot sit in seat 0 so a whole hand plays itself
  autoplay(level = "standard") { if (G) G.seats.forEach((s) => { if (s.kind === "human") { s.kind = "bot"; s.level = level; } }); if (pending) { const p = pending, m = MOD[G.game]; p.resolve(decide(m.view(G.st, p.seat), level).action); } } };
