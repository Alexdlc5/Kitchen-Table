// Bots for every game. decide(view, level, rng, tune) -> { action, reason }.
// A bot sees only a view (spades.view / hearts.view): its own hand and what was played in the open. It is never told
// the seed, other hands or which seats are human (sim/test_ai.mjs asserts both). Every play is checked against the sin
// list from docs/AI_SPEC.md (sins()); a level may make human mistakes but never a sin.
import * as spades from "./spades.js";
import * as hearts from "./hearts.js";
import * as ohhell from "./ohhell.js";
import * as whist from "./whist.js";
import * as ohhellBot from "./ai-ohhell.js";
import * as whistBot from "./ai-whist.js";
import { newDeck, partner, team, next } from "./cards.js";
import * as euchreAI from "./ai-euchre.js"; // Euchre bots live in their own module; dispatched below

const GAMES = { spades, hearts, ohhell, whist };
const BOTS = { ohhell: ohhellBot, whist: whistBot }; // games whose bots live in their own module (ai-<game>.js)
// what the app plays with (main.js passes no tune); sim/test_ai.mjs asserts it equals generator.json's "ai"
export const DEFAULT_TUNE = { easyNoise: 0.25, easyMemory: 4, expertSamples: 24, nilMaxRisk: { easy: 0.25, standard: 0.22, expert: 0.22, extreme: 0.22 }, bidBias: 0.25, extremeSamples: 60, lookNilRisk: 0.45 };
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

export function legalFor(v) {
  if (v.game === "euchre") return euchreAI.legalFor(v);
  const st = { ...v, turn: v.seat, hands: [], received: [] };
  st.hands[v.seat] = v.hand; st.received[v.seat] = v.received;
  return GAMES[v.game].legal(st);
}

// what this seat can work out from the table: unseen cards and who has shown out of which suit
const DECKS = { false: newDeck(false), true: newDeck(true) };
export function know(v, memory = Infinity) {
  if (v.game === "euchre") return euchreAI.know(v, memory);
  const g = GAMES[v.game], j = v.game === "spades" && !!v.rules.jokers, eff = (c) => g.eff(c, j), pow = (c) => g.pow(c, j);
  const h = v.history, cut = (h.length ? h[h.length - 1].n : -1) - memory;
  const gone = new Set(v.hand), voids = [new Set(), new Set(), new Set(), new Set()];
  let ledN = -1, led = null;
  for (const p of h) {
    if (p.n <= cut) continue; // a forgetful player thinks old cards are still out
    gone.add(p.card);
    if (p.n !== ledN) { ledN = p.n; led = eff(p.card); } else if (eff(p.card) !== led) voids[p.seat].add(led);
  }
  if (v.trick.length) {
    const l = eff(v.trick[0].card);
    for (const t of v.trick) { gone.add(t.card); if (eff(t.card) !== l) voids[t.seat].add(l); }
  }
  const unseen = DECKS[j].filter((c) => !gone.has(c)), top = {};
  for (const u of unseen) { const su = eff(u), p = pow(u); if (!(top[su] >= p)) top[su] = p; }
  const boss = (c) => !(top[eff(c)] > pow(c));
  return { eff, pow, unseen, voids, boss, j };
}

// the trick so far: who is winning, with what, and whether card c would take over
export function trickInfo(v, K) {
  const t = v.trick;
  if (!t.length) return { led: null, winSeat: -1, winCard: null, last: false, beats: () => true };
  const trump = v.game === "spades" ? "S" : v.trump ?? null, led = K.eff(t[0].card);
  let w = t[0];
  for (const p of t.slice(1)) {
    const a = K.eff(w.card), b = K.eff(p.card);
    if (b === a ? K.pow(p.card) > K.pow(w.card) : b === trump) w = p;
  }
  const beats = (c) => {
    const a = K.eff(w.card), b = K.eff(c);
    return b === a ? K.pow(c) > K.pow(w.card) : b === trump;
  };
  return { led, winSeat: w.seat, winCard: w.card, last: t.length === 3, beats, seatsAfter: [1, 2, 3].slice(0, 3 - t.length).map((k) => (v.seat + k) % 4) };
}

export const lowest = (cards, K) => cards.reduce((a, b) => (K.pow(b) < K.pow(a) ? b : a));
export const highest = (cards, K) => cards.reduce((a, b) => (K.pow(b) > K.pow(a) ? b : a));

// ---------------------------------------------------------------- Spades

const nilAlive = (v, s) => v.bids[s] === 0 && v.tricks[s] === 0;
function need(v, t) { // tricks a team still needs for its contract (non-nil bids)
  let bid = 0, took = 0;
  for (const s of [t, t + 2]) {
    if (v.bids[s] > 0) { bid += v.bids[s]; took += v.tricks[s]; } else if (v.rules.nilTricksCount) took += v.tricks[s];
  }
  return { bid, left: bid - took };
}
const isTopTrump = (c, j) => c === "AS" || (j && ["BJ", "LJ", "2D", "2S"].includes(c));

export function estimateTricks(hand, r) {
  const j = r.jokers, E = (c) => spades.eff(c, j), P = (c) => spades.pow(c, j);
  const all = newDeck(j), trumps = hand.filter((c) => E(c) === "S").sort((a, b) => P(b) - P(a)), n = trumps.length;
  let t = 0, valued = 0;
  trumps.forEach((c, i) => {
    const k = all.filter((u) => E(u) === "S" && P(u) > P(c) && !hand.includes(u)).length; // higher spades held by others
    const val = k === 0 ? 1 : k === 1 && n >= 2 ? 0.8 : k === 2 && n >= 3 ? 0.55 : i >= (j ? 5 : 4) ? 0.9 : 0;
    if (val >= 0.55) valued++;
    t += val;
  });
  const side0 = t, ruffed = j ? 0.86 : 1; // with 16 trumps out (jokers deck), side winners get ruffed more often
  for (const s of "HDC") {
    const cs = hand.filter((c) => E(c) === s).map((c) => P(c)), L = cs.length, has = (x) => cs.includes(x);
    if (has(14)) t += L <= 5 ? 0.95 : 0.6;
    if (has(13)) t += has(14) ? (L <= 5 ? 0.85 : 0.4) : L >= 2 && L <= 5 ? 0.6 : L === 1 ? 0.1 : 0.3;
    if (has(12) && L >= 3 && L <= 5) t += has(14) || has(13) ? 0.4 : 0.2;
    const spare = n - valued;
    if (L === 0 && spare > 0) t += Math.min(spare, 2) * 0.75;
    else if (L === 1 && spare > 0) t += 0.45;
  }
  return side0 + (t - side0) * ruffed;
}

// spades that win no matter what: an unbroken run from the top (A K Q..., or the jokers first)
function sureSpades(hand, r) {
  const j = r.jokers, order = (j ? ["BJ", "LJ", "2D", "2S"] : []).concat(["AS", "KS", "QS", "JS", "TS", "9S", "8S", "7S", "6S", "5S", "4S", "3S"]);
  let n = 0;
  while (n < order.length && hand.includes(order[n])) n++;
  return n;
}

export function nilRisk(hand, r) {
  const j = r.jokers, E = (c) => spades.eff(c, j), P = (c) => spades.pow(c, j);
  let risk = 0;
  const sp = hand.filter((c) => E(c) === "S");
  for (const c of sp) risk += P(c) >= 13 ? 0.6 : P(c) >= 11 ? 0.3 : P(c) >= 9 ? 0.12 : 0.04;
  if (sp.length > 3) risk += 0.25 * (sp.length - 3);
  for (const s of "HDC") {
    const cs = hand.filter((c) => E(c) === s).map((c) => P(c)).sort((a, b) => a - b);
    cs.forEach((p, i) => { // a high card is safer with low cards under it to duck with
      const cover = i >= 3 ? 0.4 : 1;
      if (p === 14) risk += 0.55 * cover; else if (p === 13) risk += 0.35 * cover; else if (p === 12) risk += 0.2 * cover; else if (p === 11) risk += 0.08 * cover;
    });
  }
  return risk;
}

// S01: hands that must never bid nil
export function nilForbidden(hand, r) {
  const j = r.jokers, sp = hand.filter((c) => spades.eff(c, j) === "S"), P = (c) => spades.pow(c, j);
  if (hand.some((c) => isTopTrump(c, j))) return true;
  if (hand.includes("KS") && sp.length < 3) return true;
  if (sp.length >= 4 && sp.some((c) => P(c) >= 12)) return true;
  return false;
}

function spadesBid(v, level, rng, tune) {
  const r = v.rules, s = v.seat, p = partner(s), legal = legalFor(v), pb = v.bids[p];
  const behind = v.totals.score[1 - team(s)] - v.totals.score[team(s)];
  // blind nil is decided on the score alone, before looking at the cards: only when the game is otherwise lost (the
  // opponents are a hand from the target and we can't catch them with a normal bid)
  if (level !== "easy" && legal.some((a) => a.blind) && pb !== 0 && behind >= Math.max(200, r.blindNilDown) && v.totals.score[1 - team(s)] >= r.target - 100)
    return { action: { bid: 0, blind: true }, reason: "blind_nil_comeback" };
  const est = estimateTricks(v.hand, r), risk = nilRisk(v.hand, r);
  const maxRisk = tune.nilMaxRisk[level] ?? 0.22;
  if (pb !== 0 && !nilForbidden(v.hand, r) && est < 2.2 && risk <= maxRisk && (pb === null || pb >= 2))
    return { action: { bid: 0 }, reason: "nil_safe_hand" };
  let bid = Math.max(1, Math.round(est + (pb === 0 ? -0.2 : tune.bidBias)));
  if (level === "easy" && rng() < 0.35) { // a human miscount, but never below the spades that can't lose
    const top = sureSpades(v.hand, r);
    bid = Math.max(1, top, bid + (rng() < 0.5 ? -1 : 1));
  }
  const ok = legal.filter((a) => a.bid > 0 && !a.blind).map((a) => a.bid);
  bid = ok.reduce((a, b) => (Math.abs(b - bid) < Math.abs(a - bid) ? b : a));
  return { action: { bid }, reason: pb === 0 ? "bid_beside_nil" : "bid_count" };
}

// the blind nil exchange: the nil gives away the cards most likely to win a trick, spades first (a spade counts six
// ranks higher, so the 9 of spades and up go before a side ace); the partner sends back its lowest cards
function spadesSwap(v) {
  const j = v.rules.jokers, P = (c) => spades.pow(c, j), n = v.rules.blindSwap, ok = legalFor(v);
  if (v.blind[v.seat]) {
    const danger = (c) => P(c) + (spades.eff(c, j) === "S" ? 6 : 0);
    return { action: [...ok].sort((a, b) => danger(b) - danger(a)).slice(0, n), reason: "swap_nil_high" };
  }
  return { action: [...ok].sort((a, b) => P(a) - P(b)).slice(0, n), reason: "swap_partner_low" };
}

function spadesPlay(v, K, rng) {
  const s = v.seat, p = partner(s), my = team(s), legal = legalFor(v), T = trickInfo(v, K);
  const winners = legal.filter(T.beats), losers = legal.filter((c) => !T.beats(c));
  const left = v.hand.length, us = need(v, my), them = need(v, 1 - my);
  const oppNil = [next(s), (s + 3) % 4].filter((o) => nilAlive(v, o));
  const R = (action, reason) => ({ action, reason });
  const side = (cs) => cs.filter((c) => K.eff(c) !== "S");

  // my own nil: always duck; dump the most dangerous card when I can't follow
  if (nilAlive(v, s)) {
    if (!v.trick.length) return R(lowest(side(legal).length ? side(legal) : legal, K), "nil_lead_low");
    if (losers.length) {
      const follow = losers.filter((c) => K.eff(c) === T.led);
      if (follow.length) return R(highest(follow, K), "nil_duck_highest_under");
      // danger: few unseen cards above it (a boss wins later), a spade (trump) more so, low cards held under it less so
      const mine = (c, f) => v.hand.filter((x) => K.eff(x) === K.eff(c) && f(K.pow(x), K.pow(c))).length;
      const danger = (c) => (K.eff(c) === "S" ? 2 : 0) - K.unseen.filter((u) => K.eff(u) === K.eff(c) && K.pow(u) > K.pow(c)).length - 0.5 * mine(c, (a, b) => a < b) + K.pow(c) / 100;
      return R(losers.reduce((a, b) => (danger(b) > danger(a) ? b : a)), "nil_discard_danger");
    }
    return R(T.last ? highest(legal, K) : lowest(legal, K), "nil_forced");
  }

  // partner's nil: get above partner and stay there
  if (nilAlive(v, p)) {
    if (!v.trick.length) {
      const bosses = legal.filter(K.boss);
      if (bosses.length) return R(highest(bosses, K), "cover_nil_lead_boss");
      const pv = legal.filter((c) => K.voids[p].has(K.eff(c)));
      if (pv.length) return R(highest(pv, K), "cover_nil_lead_partner_void");
      return R(highest(side(legal).length ? side(legal) : legal, K), "cover_nil_lead_high");
    }
    const partnerPlayed = v.trick.some((t) => t.seat === p);
    if (partnerPlayed && T.winSeat === p) {
      if (winners.length) return R(lowest(winners, K), "cover_nil_lowest_winner");
      return R(lowest(legal, K), "cover_nil_cannot");
    }
    if (!partnerPlayed) {
      if (oppNil.includes(T.winSeat) && losers.length) { // their nil is winning: leave it there; partner can duck under it
        const under = losers.filter((c) => K.eff(c) === T.led);
        return R(highest(under.length ? under : losers, K), "keep_opp_nil_trapped");
      }
      const follow = legal.filter((c) => K.eff(c) === T.led);
      if (follow.length) return R(highest(follow, K), "cover_nil_unblock_high");
      const trumps = winners.filter((c) => K.eff(c) === "S");
      if (trumps.length) return R(lowest(trumps, K), "cover_nil_ruff");
      return R(lowest(legal, K), "cover_nil_discard");
    }
    // someone already beat partner: play normally below
  }

  if (!v.trick.length) {
    if (oppNil.length) {
      const o = oppNil[0], ok = side(legal).filter((c) => !K.voids[o].has(K.eff(c)));
      if (ok.length) return R(lowest(ok, K), "set_nil_lead_low");
    }
    const early = v.history.length < 12, trumps = legal.filter((c) => K.eff(c) === "S");
    const strongTrumps = trumps.length >= 5 && trumps.some((c) => K.boss(c));
    const pool = early && !strongTrumps && side(legal).length ? side(legal) : legal;
    if (us.left <= 0) return R(lowest(pool, K), "made_lead_low");
    const bosses = pool.filter((c) => K.boss(c) && (K.eff(c) !== "S" || strongTrumps || !early));
    if (bosses.length) return R(highest(bosses, K), "lead_boss");
    const bySuit = {};
    for (const c of side(pool)) (bySuit[K.eff(c)] ??= []).push(c);
    const short = Object.values(bySuit).sort((a, b) => a.length - b.length)[0];
    if (short && short.length <= 2 && v.hand.some((c) => K.eff(c) === "S")) return R(lowest(short, K), "lead_short_suit");
    return R(lowest(pool, K), "lead_low");
  }

  // an opponent's nil is winning this trick: let it stand unless our own contract needs exactly every trick left
  if (oppNil.includes(T.winSeat) && losers.length && us.left !== left) return R(highest(losers, K), "keep_opp_nil_trapped");
  // their nil plays after me: play low so it may be forced over, unless the nil's partner is already winning (then
  // the nil ducks under that just as easily, and a low card only gives away a trick we need)
  const nilAfter = oppNil.filter((o) => T.seatsAfter.includes(o));
  if (nilAfter.length && nilAfter.every((o) => T.winSeat !== partner(o)) && losers.length && us.left !== left) {
    const follow = losers.filter((c) => K.eff(c) === T.led);
    return R(lowest(follow.length ? follow : side(losers).length ? side(losers) : losers, K), "set_nil_play_low");
  }

  const setThem = them.left > 0 && them.left <= left && them.left >= left - 1 && T.winSeat !== p; // they need (nearly) every trick left
  if (setThem && winners.length) return R(lowest(winners, K), "set_opponents");

  if (T.winSeat === p) {
    const safe = T.last || K.boss(T.winCard) || T.seatsAfter.every((x) => K.voids[x].has("S") && !K.voids[x].has(T.led));
    if (safe || us.left <= 0 || losers.length) {
      if (losers.length) {
        const follow = losers.filter((c) => K.eff(c) === T.led);
        const pool = follow.length ? follow : side(losers).length ? side(losers) : losers;
        return R(us.left <= 0 ? highest(pool, K) : lowest(pool, K), "duck_partner_winning");
      }
    }
    return R(lowest(winners, K), "partner_winning_forced");
  }

  if (us.left <= 0 && losers.length) { // contract made: bags only hurt
    const follow = losers.filter((c) => K.eff(c) === T.led);
    const pool = follow.length ? follow : side(losers).length ? side(losers) : losers;
    return R(highest(pool, K), "avoid_bags");
  }
  if (winners.length && us.left > 0) {
    if (T.last) return R(lowest(winners, K), "win_last_lowest");
    const sure = winners.filter((c) => K.eff(c) === T.led && K.boss(c));
    if (sure.length) return R(lowest(sure, K), "win_with_boss");
    const follow = winners.filter((c) => K.eff(c) === T.led);
    if (follow.length && v.trick.length === 2) return R(highest(follow, K), "third_hand_high");
    if (!follow.length && !legal.some((c) => K.eff(c) === T.led)) return R(lowest(winners, K), "ruff");
  }
  const follow = losers.filter((c) => K.eff(c) === T.led);
  if (follow.length) return R(lowest(follow, K), "follow_low");
  if (losers.length) return R(lowest(side(losers).length ? side(losers) : losers, K), "discard_low");
  return R(lowest(legal, K), "forced_low");
}

// ---------------------------------------------------------------- Hearts

const HPTS = (c) => c[1] === "H" || c === "QS";
export function moonThreat(v, strict = false) { // a seat that has every point card taken so far
  const counts = v.taken.map((t) => t.filter(HPTS));
  const takers = counts.map((c, s) => (c.length ? s : -1)).filter((s) => s >= 0);
  if (takers.length !== 1) return -1;
  const t = takers[0], cs = counts[t], h = cs.filter((c) => c[1] === "H").length, q = cs.includes("QS");
  const hot = strict ? h >= 8 || (q && h >= 5) : cs.length >= 6;
  return hot ? t : -1;
}

function heartsPass(v, level, rng) {
  const h = v.hand, sp = h.filter((c) => c[1] === "S"), out = [];
  const add = (c) => c && !out.includes(c) && out.length < 3 && out.push(c);
  const P = hearts.pow;
  const highH = h.filter((c) => c[1] === "H" && P(c) >= 12);
  const aces = h.filter((c) => P(c) >= 13).length;
  if (level !== "easy" && highH.length >= 3 && h.filter((c) => c[1] === "H").length >= 6 && aces >= 5) {
    [...h].sort((a, b) => P(a) - P(b)).forEach(add); // going for the moon: pass the small cards
    return { action: out, reason: "pass_low_for_moon" };
  }
  if (sp.length <= 4) ["QS", "AS", "KS"].forEach((c) => h.includes(c) && add(c));
  ["AH", "KH", "QH", "JH"].forEach((c) => h.includes(c) && add(c));
  const bySuit = ["C", "D"].map((s) => h.filter((c) => c[1] === s)).filter((a) => a.length && a.length <= 3 - out.length).sort((a, b) => a.length - b.length);
  if (bySuit.length) bySuit[0].forEach(add);
  [...h].sort((a, b) => P(b) - P(a)).forEach(add);
  if (level === "easy" && rng() < 0.3) { out.pop(); add(pick(rng, h.filter((c) => !out.includes(c)))); }
  return { action: out, reason: "pass_danger" };
}

function heartsMoonChoice(v) {
  const r = v.rules, me = v.seat, sc = v.totals.score;
  const pts = (s) => v.taken[s].includes("JD") && r.jackDiamonds ? -10 : 0;
  const add = sc.map((x, s) => x + pts(s) + (s === me ? 0 : 26));
  const ends = Math.max(...add) >= r.endScore, lowestAdd = add[me] < Math.min(...add.filter((_, s) => s !== me));
  if (ends) return { action: lowestAdd ? "add" : "sub", reason: lowestAdd ? "moon_add_wins_game" : "moon_sub_avoids_loss" };
  const leading = sc[me] <= Math.min(...sc);
  return { action: leading ? "add" : "sub", reason: leading ? "moon_add_while_leading" : "moon_sub_catch_up" };
}

function heartsPlay(v, K, level, rng) {
  const legal = legalFor(v), T = trickInfo(v, K), me = v.seat;
  const winners = legal.filter(T.beats), losers = legal.filter((c) => !T.beats(c));
  const R = (action, reason) => ({ action, reason });
  const P = K.pow, threat = moonThreat(v), qsOut = K.unseen.includes("QS");
  const trickPts = v.trick.some((t) => HPTS(t.card));
  const myPts = v.taken[me].filter(HPTS).length;
  const shooting = threat === me || (myPts >= 10 && v.taken.every((t, s) => s === me || !t.some(HPTS)) && v.hand.filter(K.boss).length * 2 >= v.hand.length);
  const jd = v.rules.jackDiamonds, pts = (c) => hearts.points(c, v.rules), trickVal = v.trick.reduce((n, t) => n + pts(t.card), 0);
  // the scoreboard: points that push the trick's winner to the end score finish the game, so give them only when I'm lowest
  const now = v.totals.score.map((x, s) => x + v.taken[s].reduce((n, c) => n + pts(c), 0));
  const iLead = now[me] < Math.min(...now.filter((_, s) => s !== me));
  const noQueenLead = legal.filter((c) => !((c === "AS" || c === "KS") && v.passed?.includes("QS") && qsOut)); // H06
  const endsLosing = (c) => !iLead && T.winSeat >= 0 && T.winSeat !== me && pts(c) > 0 && now[T.winSeat] + trickVal + pts(c) >= v.rules.endScore;

  if (shooting) {
    if (!v.trick.length) { // lead winners, but not the A/K of spades into the queen I passed (H06)
      const pool = noQueenLead.length ? noQueenLead : legal;
      return R(highest(pool.filter(K.boss).length ? pool.filter(K.boss) : pool, K), "moon_lead_boss");
    }
    if (winners.length) return R(highest(winners, K), "moon_take");
    return R(lowest(legal, K), "moon_lost_trick");
  }
  if (threat >= 0) { // somebody else is running the table: take a point to stop them
    if (!v.trick.length) {
      const hs = legal.filter((c) => c[1] === "H");
      if (hs.length) return R(highest(hs, K), "stop_moon_lead_heart");
      return R(highest(noQueenLead.length ? noQueenLead : legal, K), "stop_moon_take_lead");
    }
    if (winners.length && (trickPts || T.winSeat === threat)) return R(T.last ? lowest(winners, K) : highest(winners, K), "stop_moon");
    if (!legal.some((c) => K.eff(c) === T.led)) {
      const keep = legal.filter((c) => !HPTS(c));
      if (T.winSeat === threat && keep.length) return R(highest(keep, K), "no_points_to_shooter");
      const hs = legal.filter((c) => c[1] === "H");
      if (T.winSeat === threat && hs.length) return R(lowest(hs, K), "least_points_to_shooter"); // only points left: one heart, never the queen
    }
  }

  const first = v.history.length < 4;
  if (!v.trick.length) {
    const qsMine = v.passed?.includes("QS") && qsOut; // I know who has the queen: don't feed my A/K into it
    const safe = legal.filter((c) => c !== "QS" && !((c === "AS" || c === "KS") && (qsOut || qsMine)));
    const pool = safe.length ? safe : legal;
    const sp = pool.filter((c) => c[1] === "S" && P(c) < 12);
    if (qsOut && !v.hand.some((c) => ["AS", "KS", "QS"].includes(c)) && sp.length) return R(highest(sp, K), "flush_queen");
    if (jd && pool.includes("JD") && K.boss("JD")) return R("JD", "lead_jack_diamonds"); // nobody can beat it: -10 for me
    const bySuit = {};
    for (const c of pool) (bySuit[c[1]] ??= []).push(c);
    const choice = Object.values(bySuit).map((cs) => lowest(cs, K)).sort((a, b) => P(a) - P(b) || bySuit[a[1]].length - bySuit[b[1]].length);
    return R(choice[0], "lead_low");
  }
  const follow = legal.filter((c) => K.eff(c) === T.led);
  if (follow.length) {
    if (first) return R(highest(follow, K), "first_trick_high");
    if (jd) { // a trick worth less than nothing (the J♦): take it last to play, or with a card nobody can beat
      const takes = winners.filter((c) => trickVal + pts(c) < 0 && (T.last || K.boss(c)));
      if (takes.length) return R(takes.includes("JD") ? "JD" : lowest(takes, K), "take_jack_diamonds");
    }
    if (T.led === "S" && v.hand.includes("QS") && (T.winCard === "AS" || T.winCard === "KS") && !(threat >= 0 && T.winSeat === threat) && !endsLosing("QS"))
      return R("QS", "dump_queen_under");
    const under = follow.filter((c) => !T.beats(c));
    if (T.led === "S" && qsOut) {
      const below = follow.filter((c) => P(c) < 12);
      if (below.length) return R(highest(below.filter((c) => !T.beats(c)).length ? below.filter((c) => !T.beats(c)) : below, K), "spade_below_queen");
    }
    const duck = under.filter((c) => c !== "QS" && !(jd && c === "JD")); // never duck the J♦ (or the queen) to someone else
    if (under.length) return R(highest(duck.length ? duck : under, K), "duck_highest_under");
    const nonQ = follow.filter((c) => c !== "QS");
    if (T.last && !trickPts) return R(highest(nonQ.length ? nonQ : follow, K), "take_clean_trick_high");
    return R(T.last ? highest(nonQ.length ? nonQ : follow, K) : lowest(nonQ.length ? nonQ : follow, K), "forced_win");
  }
  // void: get rid of trouble, but never end the game for someone else and never hand over the J♦
  const keep = legal.filter((c) => !endsLosing(c) && !(jd && c === "JD")), L = keep.length ? keep : legal;
  if (L.includes("QS") && !(threat >= 0 && T.winSeat === threat)) return R("QS", "discard_queen");
  for (const c of ["AS", "KS"]) if (L.includes(c) && qsOut) return R(c, "discard_high_spade");
  const hs = L.filter((c) => c[1] === "H");
  if (hs.length && !(threat >= 0 && T.winSeat === threat)) return R(highest(hs, K), "discard_heart");
  const pool = L.filter((c) => !HPTS(c));
  const p2 = pool.length ? pool : L, bySuit = {};
  for (const c of p2) (bySuit[c[1]] ??= []).push(c);
  const shortest = Object.values(bySuit).sort((a, b) => a.length - b.length || P(highest(b, K)) - P(highest(a, K)))[0];
  return R(highest(shortest, K), "discard_high");
}

// ---------------------------------------------------------------- sins (docs/AI_SPEC.md §3-§4)

// ids of the sins an action would commit in this view; [] is clean. Shared by tests, the sim and the in-game detector.
// A play is only a sin when a clean one was there to make instead: a forced play never counts (AI-H5).
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
export function sins(v, action) {
  const raw = sinsRaw(v, action);
  return raw.length && legalFor(v).some((x) => !same(x, action) && !sinsRaw(v, x).length) ? raw : [];
}
function sinsRaw(v, action) {
  if (BOTS[v.game]) return BOTS[v.game].sins(v, action);
  if (v.game === "euchre") return euchreAI.sins(v, action);
  const out = [];
  if (v.game === "spades") {
    const s = v.seat, p = partner(s), r = v.rules;
    if (v.phase === "bid") {
      if (action.bid === 0 && !action.blind && nilForbidden(v.hand, r)) out.push("S01");
      if (action.bid === 0 && v.bids[p] === 0) out.push("S02");
      return out;
    }
    if (v.phase !== "play") return out;
    const K = know(v), T = trickInfo(v, K), legal = legalFor(v), c = action;
    const wins = v.trick.length ? T.beats(c) : false, canLose = legal.some((x) => !T.beats(x));
    const us = need(v, team(s)), them = need(v, 1 - team(s)), left = v.hand.length;
    const opps = [next(s), (s + 3) % 4];
    if (!v.trick.length) {
      if (K.eff(c) === "S" && v.history.length < 12 && legal.some((x) => K.eff(x) !== "S") && !nilAlive(v, p)) {
        const tr = v.hand.filter((x) => K.eff(x) === "S");
        if (!(tr.length >= 5 && tr.some((x) => K.boss(x)))) out.push("S14");
      }
      if (nilAlive(v, p) && legal.some(K.boss) && !K.boss(c) && !K.voids[p].has(K.eff(c))) out.push("S18");
      return out;
    }
    const pWinning = T.winSeat === p;
    if (pWinning && T.last && wins && canLose && !nilAlive(v, p)) out.push("S03");
    if (pWinning && !T.last && wins && canLose && K.eff(T.winCard) === "S" && K.eff(c) === "S" && !nilAlive(v, p) &&
      T.seatsAfter.every((x) => K.voids[x].has("S"))) out.push("S04");
    if (nilAlive(v, p) && pWinning && v.trick.some((t) => t.seat === p)) {
      if (!wins && legal.some(T.beats)) out.push(legal.some((x) => K.eff(x) === T.led) ? "S05" : "S06");
      if (wins && legal.some((x) => T.beats(x) && K.eff(x) === K.eff(c) && K.pow(x) < K.pow(c))) out.push("S07");
    }
    // S08 yields when an opponent's live nil is winning: keeping it trapped matters more, and partner can still duck under it
    if (nilAlive(v, p) && !v.trick.some((t) => t.seat === p) && K.eff(c) === T.led && !opps.some((o) => nilAlive(v, o) && T.winSeat === o)) {
      const follow = legal.filter((x) => K.eff(x) === T.led), hi = highest(follow, K);
      if (c !== hi && T.beats(hi)) out.push("S08");
    }
    if (nilAlive(v, s) && wins && canLose) out.push("S09");
    if (nilAlive(v, s) && !legal.some((x) => K.eff(x) === T.led)) { // can't follow: a spade that would win later goes now, for free
      const shed = legal.filter((x) => K.eff(x) === "S" && !T.beats(x) && K.boss(x));
      if (shed.length && !shed.includes(c)) out.push("S09");
    }
    if (opps.some((o) => nilAlive(v, o) && T.winSeat === o) && wins && canLose && us.left !== left) out.push("S10");
    if (us.left <= 0 && T.last && wins && canLose && !(them.left > 0 && them.left <= left && them.left >= left - 1) && !nilAlive(v, s) && !nilAlive(v, p)) out.push("S11");
    if (them.left > 0 && them.left === left && !nilAlive(v, s) && T.last && !pWinning && !wins && legal.some(T.beats) && !opps.some((o) => nilAlive(v, o))) out.push("S12");
    if (!nilAlive(v, s) && !nilAlive(v, p) && !opps.some((o) => nilAlive(v, o)) && us.left > 0 && !legal.some(T.beats) && K.eff(c) === T.led) {
      const follow = legal.filter((x) => K.eff(x) === T.led);
      if (c !== lowest(follow, K)) out.push("S13");
    }
    if (T.last && wins && !nilAlive(v, p) && !nilAlive(v, s) && legal.some((x) => T.beats(x) && K.eff(x) === K.eff(c) && K.pow(x) < K.pow(c))) out.push("S07");
    return [...new Set(out)];
  }
  if (v.game === "hearts") {
    if (v.phase === "moon") {
      const best = heartsMoonChoice(v);
      if (best.reason.startsWith("moon_add_wins") && action === "sub") out.push("H03");
      if (best.reason.startsWith("moon_sub_avoids") && action === "add") out.push("H03");
      return out;
    }
    if (v.phase !== "play") return out;
    const K = know(v), T = trickInfo(v, K), legal = legalFor(v), threat = moonThreat(v, true);
    if (!v.trick.length) {
      if ((action === "AS" || action === "KS") && v.passed?.includes("QS") && K.unseen.includes("QS") && legal.length > 1) out.push("H06");
      return out;
    }
    if (threat >= 0 && threat !== v.seat && !T.beats(action) && legal.some(T.beats)) {
      if (v.trick.some((t) => HPTS(t.card))) out.push("H01");
      else if (v.hand.length <= 3 && T.winSeat === threat) out.push("H02");
    }
    if (threat >= 0 && threat !== v.seat && action === "QS" && T.winSeat === threat && !T.beats("QS")) out.push("H01"); // the queen fed to the runner
    return out;
  }
  return out;
}

// ---------------------------------------------------------------- Expert: sample hidden hands, play each option out

// Extreme reads the bids the way a strong player does: a dealt world is kept only if every other seat's hand, as it was
// dealt (cards held now plus cards already played), fits what that seat bid. Public information only.
function fitsBids(v, hs) {
  if (v.game !== "spades") return true;
  for (let s = 0; s < 4; s++) {
    if (s === v.seat || v.bids[s] === null || v.blind[s]) continue;
    const dealt = [...hs[s], ...v.history.filter((h) => h.seat === s).map((h) => h.card), ...v.trick.filter((t) => t.seat === s).map((t) => t.card)];
    if (v.bids[s] === 0 ? nilForbidden(dealt, v.rules) || nilRisk(dealt, v.rules) > 0.45 : Math.abs(estimateTricks(dealt, v.rules) - v.bids[s]) > 1.5) return false;
  }
  return true;
}

// Extreme reads the play in Hearts the way a strong player does. A player who can't follow sheds the Q♠ first, then a
// heart, and only then anything else; and nobody keeps the Q♠ under a winning A♠ or K♠. So, while the queen is out: a
// discard other than the queen, or another spade under the A♠/K♠, means no queen; a discard of a non-point card means
// no hearts either. Tricks a moon runner was winning don't count (then everyone keeps their points).
function readPlay(v) {
  const noQ = new Set(), noH = new Set();
  if (v.game !== "hearts") return { noQ, noH };
  const last = v.history.length ? v.history[v.history.length - 1].n + 1 : 0;
  const plays = [...v.history, ...v.trick.map((t) => ({ ...t, n: last }))], took = [[], [], [], []];
  let gone = v.hand.includes("QS"), n = -1, led = null, top = null, trick = [];
  const end = () => { if (trick.length === 4) took[top.seat].push(...trick.filter((p) => HPTS(p.card))); };
  for (const p of plays) {
    if (p.n !== n) { end(); n = p.n; led = p.card[1]; top = p; trick = []; }
    else {
      const runner = took.filter((t) => t.length).length === 1 && took[top.seat].length >= 6;
      const off = p.card[1] !== led, under = led === "S" && (top.card === "AS" || top.card === "KS") && hearts.pow(p.card) < hearts.pow(top.card);
      if (n > 0 && !runner && !gone && p.card !== "QS" && (off || under)) noQ.add(p.seat);
      if (n > 0 && !runner && off && !HPTS(p.card) && !((p.card === "AS" || p.card === "KS") && !gone)) noH.add(p.seat);
      if (p.card[1] === led && hearts.pow(p.card) > hearts.pow(top.card)) top = p;
    }
    trick.push(p);
    if (p.card === "QS") gone = true;
  }
  return { noQ, noH };
}

function sampleWorld(v, K, rng, read = false) {
  const sizes = v.sizes, R = read ? readPlay(v) : { noQ: new Set(), noH: new Set() };
  for (let attempt = 0; attempt < (read ? 80 : 40); attempt++) {
    const pool = [...K.unseen];
    const known = [[], [], [], []];
    if (v.passed && v.received) { // cards I passed are still with the receiver unless played (Spades: the blind nil exchange)
      const to = v.game === "spades" ? partner(v.seat) : (v.seat + v.dir) % 4;
      for (const c of v.passed) if (pool.includes(c)) { known[to].push(c); pool.splice(pool.indexOf(c), 1); }
    }
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const hs = known.map((k) => [...k]); hs[v.seat] = [...v.hand];
    let ok = true;
    const seats = [1, 2, 3].map((k) => (v.seat + k) % 4).sort((a, b) => K.voids[b].size - K.voids[a].size); // from my left: any chair samples alike
    for (const c of pool) {
      const cands = seats.filter((s) => hs[s].length < sizes[s] && (attempt > 30 || (!K.voids[s].has(K.eff(c)) && !(c === "QS" && R.noQ.has(s)) && !(c[1] === "H" && R.noH.has(s)))));
      if (!cands.length) { ok = false; break; }
      hs[pick(rng, cands)].push(c);
    }
    if (ok && (!read || attempt >= 60 || fitsBids(v, hs))) return hs; // after 60 misses, take any consistent world
  }
  return null;
}

// a sampled world is not the real table, so playouts read it directly instead of copying a view per card
const peek = (st) => ({ ...st, seat: st.turn, hand: st.hands[st.turn], sizes: st.hands.map((h) => h.length), passed: st.passes[st.turn], received: null });
function playOut(st, rng, tune) {
  const g = GAMES[st.game];
  while (st.phase === "play") {
    const v = peek(st), K = know(v);
    g.apply(st, (st.game === "spades" ? spadesPlay(v, K, rng) : heartsPlay(v, K, "standard", rng)).action);
  }
  return st;
}

// the best of `options` by its outcome over sampled worlds; run(world, option) plays one out and returns the final state.
// Every option sees the same worlds, and the heuristic's choice is kept unless another option beats it in those worlds
// by more than its own standard error: a look-ahead overrules the heuristic only when it is sure. x: score like Extreme.
function lookahead(v, base, options, n, rng, read, run, x = read) {
  const K = know(v), b = options.findIndex((o) => same(o, base.action)), sum = options.map(() => 0), sq = options.map(() => 0);
  let samples = 0;
  for (let i = 0; i < n; i++) {
    const hands = sampleWorld(v, K, rng, read);
    if (!hands) continue;
    samples++;
    const val = options.map((o) => outcome(run(hands, o), v.seat, x));
    val.forEach((x, k) => { const d = b < 0 ? x : x - val[b]; sum[k] += d; sq[k] += d * d; });
  }
  if (!samples) return { ...base, samples };
  let best = b;
  for (let k = 0; k < options.length; k++) {
    const m = sum[k] / samples, se = Math.sqrt(Math.max(0, sq[k] / samples - m * m) / samples);
    if (b < 0 ? best < 0 || m > sum[best] / samples : m > se && (best === b || m > sum[best] / samples)) best = k;
  }
  return best === b ? { ...base, samples } : { action: options[best], reason: "expert_lookahead", samples };
}

function expertPlay(v, base, rng, tune, extreme = false) {
  const g = GAMES[v.game], clean = legalFor(v).filter((c) => !sins(v, c).length), K = know(v);
  // cards of one suit and the same points with no unseen card between them play alike: try one of each run
  const pts = (c) => (v.game === "hearts" ? hearts.points(c, v.rules) : 0);
  const alike = (a, b) => K.eff(a) === K.eff(b) && pts(a) === pts(b) &&
    !K.unseen.some((u) => K.eff(u) === K.eff(a) && K.pow(u) > Math.min(K.pow(a), K.pow(b)) && K.pow(u) < Math.max(K.pow(a), K.pow(b)));
  const legal = [];
  for (const c of clean.includes(base.action) ? [base.action, ...clean] : clean) if (!legal.some((x) => alike(x, c))) legal.push(c);
  if (legal.length <= 1) return base;
  const root = { ...structuredClone(v), turn: v.seat, lastTrick: null, passes: [null, null, null, null], moonChoice: null };
  root.passes[v.seat] = v.passed;
  return lookahead(v, base, legal, extreme ? tune.extremeSamples : tune.expertSamples, rng, extreme, (hands, c) => {
    const st = { ...root, hands: hands.map((h) => [...h]), trick: [...root.trick], tricks: [...root.tricks],
      history: [...root.history], bids: root.bids && [...root.bids], taken: root.taken && root.taken.map((t) => [...t]) };
    g.apply(st, c);
    return playOut(st, rng, tune);
  });
}

// Expert and Extreme bid by look-ahead (AI-L1): deal the hidden cards, let the seats after me bid like Standard, play the
// hand out, keep the bid with the best average (the game end included). Nil is tried up to tune.lookNilRisk (looser than
// the heuristic's nilMaxRisk), and taken only when the playouts are sure it beats the counted bid.
function expertBid(v, base, rng, tune, extreme) {
  if (base.action.blind) return base; // blind nil is a score decision, made before looking
  const r = v.rules, est = estimateTricks(v.hand, r);
  const options = legalFor(v).filter((a) => !a.blind && !sins(v, a).length && // never below the spades that can't lose (S15)
    (a.bid === 0 ? nilRisk(v.hand, r) <= tune.lookNilRisk && est < 3 : (Math.abs(a.bid - est) <= 2.5 && a.bid >= sureSpades(v.hand, r)) || a.bid === base.action.bid));
  if (options.length <= 1) return base;
  return lookahead(v, base, options, extreme ? tune.extremeSamples : tune.expertSamples, rng, extreme, (hands, a) => {
    const st = { game: "spades", rules: r, dealer: v.dealer, totals: structuredClone(v.totals), phase: "bid", turn: v.seat, hands: hands.map((h) => [...h]),
      bids: [...v.bids], blind: [...v.blind], passes: [null, null, null, null], received: [null, null, null, null], trick: [], lastTrick: null,
      tricks: [0, 0, 0, 0], history: [], broken: false };
    spades.apply(st, a);
    while (st.phase === "bid" || st.phase === "exchange") spades.apply(st, decide(spades.view(st, st.turn), "standard", rng, tune).action);
    return playOut(st, rng, tune);
  });
}

// Extreme passes by look-ahead: every three-card pass from the five cards most worth passing, each played out
const combos = (a, k) => (k ? a.flatMap((x, i) => combos(a.slice(i + 1), k - 1).map((c) => [x, ...c])) : [[]]);
function extremePass(v, base, rng, tune) {
  const rank = (c) => (c === "QS" ? 40 : c === "AS" || c === "KS" ? 30 : 0) + (c[1] === "H" ? 3 : 0) + hearts.pow(c);
  const top = [...new Set([...base.action, ...[...v.hand].sort((a, b) => rank(b) - rank(a))])].slice(0, 5);
  const key = (p) => [...p].sort().join(), options = combos(top, 3);
  const mine = options.find((p) => key(p) === key(base.action)) ?? (options.push(base.action), base.action);
  return lookahead(v, { ...base, action: mine }, options, Math.round(tune.extremeSamples / 2), rng, false, (hands, pass) => {
    const st = { game: "hearts", rules: v.rules, dealer: v.dealer, handNo: 0, totals: structuredClone(v.totals), dir: v.dir, phase: "pass", turn: v.seat,
      hands: hands.map((h) => [...h]), passes: [null, null, null, null], received: [null, null, null, null], trick: [], lastTrick: null,
      tricks: [0, 0, 0, 0], taken: [[], [], [], []], history: [], broken: false, moon: null, moonChoice: null };
    for (let k = 0; k < 4; k++) {
      const s = (v.seat + k) % 4;
      st.turn = s;
      hearts.apply(st, s === v.seat ? pass : heartsPass(hearts.view(st, s), "standard", rng).action);
    }
    return playOut(st, rng, tune);
  }, true);
}

// higher is better for seat's side, in points; a hand that ends the game is worth ±1000 on top (AI-L2). Extreme Hearts
// reads the scoreboard: points it gives away count more the closer that player is to winning (the weight falls by e for
// every 10 points above the lowest rival), so it hits the leader the way a strong player does.
const GAME_END = 1000;
function outcome(st, seat, extreme = false) {
  if (st.game === "spades") {
    const sc = spades.score(st), t = team(seat), w = spades.winner(sc.totals, st.rules);
    const bagCost = (b) => b * (st.rules.bagPenalty / st.rules.bagLimit) * 0.5;
    return sc.totals.score[t] - st.totals.score[t] - bagCost(sc.totals.bags[t]) - (sc.totals.score[1 - t] - st.totals.score[1 - t] - bagCost(sc.totals.bags[1 - t])) +
      (w === null ? 0 : w === t ? GAME_END : -GAME_END);
  }
  if (st.phase === "moon") st.moonChoice = "add";
  const sc = hearts.score(st), d = sc.totals.score.map((x, s) => x - st.totals.score[s]), w = hearts.winner(sc.totals, st.rules);
  const T = st.totals.score, lo = Math.min(...T.filter((_, s) => s !== seat));
  const wt = T.map((x, s) => (s === seat ? 0 : extreme ? Math.exp(-(x - lo) / 10) : 1)), W = wt.reduce((a, b) => a + b, 0);
  return d.reduce((a, x, s) => a + (wt[s] / W) * x, 0) - d[seat] + (w === null ? 0 : w === seat ? GAME_END : -GAME_END);
}

// ---------------------------------------------------------------- entry point

export function decide(v, level = "standard", rng = Math.random, tune = DEFAULT_TUNE) {
  if (v.game === "euchre") return euchreAI.decide(v, level, rng, tune);
  tune = { ...DEFAULT_TUNE, ...tune };
  if (BOTS[v.game]) return BOTS[v.game].decide(v, level, rng, tune);
  const easy = level === "easy", deep = level === "expert" || level === "extreme";
  if (v.game === "spades" && v.phase === "bid") {
    let d = spadesBid(v, level, rng, tune);
    if (deep) d = expertBid(v, d, rng, tune, level === "extreme");
    return sins(v, d.action).length ? { action: { bid: Math.max(1, Math.round(estimateTricks(v.hand, v.rules))) }, reason: "bid_count" } : d;
  }
  if (v.game === "spades" && v.phase === "exchange") return spadesSwap(v);
  if (v.game === "hearts" && v.phase === "pass") {
    const d = heartsPass(v, level, rng);
    return level === "extreme" ? extremePass(v, d, rng, tune) : d;
  }
  if (v.game === "hearts" && v.phase === "moon") return heartsMoonChoice(v);
  const K = know(v, easy ? tune.easyMemory : Infinity);
  let d = v.game === "spades" ? spadesPlay(v, K, rng) : heartsPlay(v, K, level, rng);
  const legal = legalFor(v);
  if (easy && rng() < tune.easyNoise) { // a human slip: another card of the same suit (dropping the Q♠ or J♦ is no slip)
    const alt = legal.filter((c) => K.eff(c) === K.eff(d.action) && c !== d.action && !(v.game === "hearts" && (c === "QS" || c === "JD")) && !sins(v, c).length);
    if (alt.length) d = { action: pick(rng, alt), reason: "easy_slip" };
  }
  if (deep) d = expertPlay(v, d, rng, tune, level === "extreme");
  if (sins(v, d.action).length) { // safety net: never ship a sin, whatever the heuristics said
    const clean = legal.filter((c) => !sins(v, c).length);
    if (clean.length) d = { action: lowest(clean, K), reason: `${d.reason}:sin_guard`, guarded: true };
  }
  return d;
}

export const LEVELS = ["easy", "standard", "expert", "extreme"];
