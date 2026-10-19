// Bots for every game. decide(view, level, rng, tune) -> { action, reason }.
// A bot sees only a view (spades.view / hearts.view): its own hand and what was played in the open. It is never told
// the seed, other hands or which seats are human (sim/test_ai.mjs asserts both). Every play is checked against the sin
// list from docs/AI_SPEC.md (sins()); a level may make human mistakes but never a sin.
import * as spades from "./spades.js";
import * as hearts from "./hearts.js";
import { newDeck, partner, team, next } from "./cards.js";

const GAMES = { spades, hearts };
const DEFAULT_TUNE = { bidBias: 0, easyNoise: 0.25, easyMemory: 4, expertSamples: 24, extremeSamples: 60, nilMaxRisk: { easy: 0.3, standard: 0.22, expert: 0.22, extreme: 0.22 } };
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

export function legalFor(v) {
  const st = { ...v, turn: v.seat, hands: [] };
  st.hands[v.seat] = v.hand;
  return GAMES[v.game].legal(st);
}

// what this seat can work out from the table: unseen cards and who has shown out of which suit
const DECKS = { false: newDeck(false), true: newDeck(true) };
export function know(v, memory = Infinity) {
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
function trickInfo(v, K) {
  const t = v.trick;
  if (!t.length) return { led: null, winSeat: -1, winCard: null, last: false, beats: () => true };
  const trump = v.game === "spades" ? "S" : null, led = K.eff(t[0].card);
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

const lowest = (cards, K) => cards.reduce((a, b) => (K.pow(b) < K.pow(a) ? b : a));
const highest = (cards, K) => cards.reduce((a, b) => (K.pow(b) > K.pow(a) ? b : a));

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
  // blind nil is decided on the score alone, before looking at the cards
  if (level !== "easy" && legal.some((a) => a.blind) && pb !== 0 && behind >= Math.max(200, r.blindNilDown) && v.totals.score[1 - team(s)] >= r.target - 150)
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
      const sp = losers.filter((c) => K.eff(c) === "S");
      const sideL = side(losers);
      if (sideL.length) return R(highest(sideL, K), "nil_discard_danger");
      return R(highest(sp, K), "nil_discard_danger");
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
  if (oppNil.length && T.seatsAfter.some((x) => oppNil.includes(x)) && losers.length && us.left !== left) {
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

  if (shooting) {
    if (!v.trick.length) return R(highest(legal.filter(K.boss).length ? legal.filter(K.boss) : legal, K), "moon_lead_boss");
    if (winners.length) return R(highest(winners, K), "moon_take");
    return R(lowest(legal, K), "moon_lost_trick");
  }
  if (threat >= 0) { // somebody else is running the table: take a point to stop them
    if (!v.trick.length) {
      const hs = legal.filter((c) => c[1] === "H");
      if (hs.length) return R(highest(hs, K), "stop_moon_lead_heart");
      return R(highest(legal, K), "stop_moon_take_lead");
    }
    if (winners.length && (trickPts || T.winSeat === threat)) return R(T.last ? lowest(winners, K) : highest(winners, K), "stop_moon");
    if (!legal.some((c) => K.eff(c) === T.led)) {
      const keep = legal.filter((c) => !HPTS(c));
      if (T.winSeat === threat && keep.length) return R(highest(keep, K), "no_points_to_shooter");
    }
  }

  const first = v.history.length < 4;
  if (!v.trick.length) {
    const qsMine = v.passed?.includes("QS") && qsOut; // I know who has the queen: don't feed my A/K into it
    const safe = legal.filter((c) => c !== "QS" && !((c === "AS" || c === "KS") && (qsOut || qsMine)));
    const pool = safe.length ? safe : legal;
    const sp = pool.filter((c) => c[1] === "S" && P(c) < 12);
    if (qsOut && !v.hand.some((c) => ["AS", "KS", "QS"].includes(c)) && sp.length) return R(highest(sp, K), "flush_queen");
    const bySuit = {};
    for (const c of pool) (bySuit[c[1]] ??= []).push(c);
    const choice = Object.values(bySuit).map((cs) => lowest(cs, K)).sort((a, b) => P(a) - P(b) || bySuit[a[1]].length - bySuit[b[1]].length);
    return R(choice[0], "lead_low");
  }
  const follow = legal.filter((c) => K.eff(c) === T.led);
  if (follow.length) {
    if (first) return R(highest(follow, K), "first_trick_high");
    if (T.led === "S" && v.hand.includes("QS") && (T.winCard === "AS" || T.winCard === "KS")) return R("QS", "dump_queen_under");
    const under = follow.filter((c) => !T.beats(c));
    if (T.led === "S" && qsOut) {
      const below = follow.filter((c) => P(c) < 12);
      if (below.length) return R(highest(below.filter((c) => !T.beats(c)).length ? below.filter((c) => !T.beats(c)) : below, K), "spade_below_queen");
    }
    if (under.length) return R(highest(under.filter((c) => c !== "QS").length ? under.filter((c) => c !== "QS") : under, K), "duck_highest_under");
    const nonQ = follow.filter((c) => c !== "QS");
    if (T.last && !trickPts) return R(highest(nonQ.length ? nonQ : follow, K), "take_clean_trick_high");
    return R(T.last ? highest(nonQ.length ? nonQ : follow, K) : lowest(nonQ.length ? nonQ : follow, K), "forced_win");
  }
  // void: get rid of trouble
  if (legal.includes("QS") && !(threat >= 0 && T.winSeat === threat)) return R("QS", "discard_queen");
  for (const c of ["AS", "KS"]) if (legal.includes(c) && qsOut) return R(c, "discard_high_spade");
  const hs = legal.filter((c) => c[1] === "H");
  if (hs.length && !(threat >= 0 && T.winSeat === threat)) return R(highest(hs, K), "discard_heart");
  const pool = legal.filter((c) => !HPTS(c));
  const p2 = pool.length ? pool : legal, bySuit = {};
  for (const c of p2) (bySuit[c[1]] ??= []).push(c);
  const shortest = Object.values(bySuit).sort((a, b) => a.length - b.length || P(highest(b, K)) - P(highest(a, K)))[0];
  return R(highest(shortest, K), "discard_high");
}

// ---------------------------------------------------------------- sins (docs/AI_SPEC.md §3-§4)

// ids of the sins an action would commit in this view; [] is clean. Shared by tests, the sim and the in-game detector.
export function sins(v, action) {
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
    if (nilAlive(v, p) && !v.trick.some((t) => t.seat === p) && K.eff(c) === T.led) {
      const follow = legal.filter((x) => K.eff(x) === T.led), hi = highest(follow, K);
      if (c !== hi && T.beats(hi)) out.push("S08");
    }
    if (nilAlive(v, s) && wins && canLose) out.push("S09");
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

function sampleWorld(v, K, rng, read = false) {
  const g = GAMES[v.game], sizes = v.sizes, hands = [[], [], [], []];
  hands[v.seat] = [...v.hand];
  for (let attempt = 0; attempt < (read ? 80 : 40); attempt++) {
    const pool = [...K.unseen];
    const known = [[], [], [], []];
    if (v.passed && v.received) { // cards I passed are still with the receiver unless played
      const to = (v.seat + v.dir) % 4;
      for (const c of v.passed) if (pool.includes(c)) { known[to].push(c); pool.splice(pool.indexOf(c), 1); }
    }
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const hs = known.map((k) => [...k]); hs[v.seat] = [...v.hand];
    let ok = true;
    const seats = [0, 1, 2, 3].filter((s) => s !== v.seat).sort((a, b) => K.voids[b].size - K.voids[a].size);
    for (const c of pool) {
      const cands = seats.filter((s) => hs[s].length < sizes[s] && (attempt > 30 || !K.voids[s].has(K.eff(c))));
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

function expertPlay(v, base, rng, tune, extreme = false) {
  const g = GAMES[v.game], legal = legalFor(v).filter((c) => !sins(v, c).length);
  if (legal.length <= 1) return base;
  const K = know(v), totals = new Map(legal.map((c) => [c, 0]));
  const root = { ...structuredClone(v), turn: v.seat, lastTrick: null, passes: [null, null, null, null], moonChoice: null };
  root.passes[v.seat] = v.passed;
  const fork = (hands) => ({ ...root, hands: hands.map((h) => [...h]), trick: [...root.trick], tricks: [...root.tricks],
    history: [...root.history], bids: root.bids && [...root.bids], taken: root.taken && root.taken.map((t) => [...t]) });
  let samples = 0;
  for (let i = 0; i < (extreme ? tune.extremeSamples : tune.expertSamples); i++) {
    const hands = sampleWorld(v, K, rng, extreme);
    if (!hands) continue;
    samples++;
    for (const c of legal) {
      const st = fork(hands);
      g.apply(st, c);
      playOut(st, rng, tune);
      totals.set(c, totals.get(c) + outcome(st, v.seat));
    }
  }
  if (!samples) return base;
  let best = base.action, bestV = totals.get(base.action) ?? -Infinity;
  for (const [c, val] of totals) if (val > bestV + 1e-9) { best = c; bestV = val; }
  return best === base.action ? base : { action: best, reason: "expert_lookahead" };
}

function outcome(st, seat) { // higher is better for seat's side, in points
  if (st.game === "spades") {
    const sc = spades.score(st), t = team(seat);
    const bagCost = (b) => b * (st.rules.bagPenalty / st.rules.bagLimit) * 0.5;
    return sc.totals.score[t] - st.totals.score[t] - bagCost(sc.totals.bags[t]) - (sc.totals.score[1 - t] - st.totals.score[1 - t] - bagCost(sc.totals.bags[1 - t]));
  }
  if (st.phase === "moon") st.moonChoice = "add";
  const sc = hearts.score(st), d = sc.totals.score.map((x, s) => x - st.totals.score[s]);
  return (d.reduce((a, b) => a + b, 0) - d[seat]) / 3 - d[seat];
}

// ---------------------------------------------------------------- entry point

export function decide(v, level = "standard", rng = Math.random, tune = DEFAULT_TUNE) {
  tune = { ...DEFAULT_TUNE, ...tune };
  const easy = level === "easy";
  if (v.game === "spades" && v.phase === "bid") {
    const d = spadesBid(v, level, rng, tune);
    return sins(v, d.action).length ? { action: { bid: Math.max(1, Math.round(estimateTricks(v.hand, v.rules))) }, reason: "bid_count" } : d;
  }
  if (v.game === "hearts" && v.phase === "pass") return heartsPass(v, level, rng);
  if (v.game === "hearts" && v.phase === "moon") return heartsMoonChoice(v);
  const K = know(v, easy ? tune.easyMemory : Infinity);
  let d = v.game === "spades" ? spadesPlay(v, K, rng) : heartsPlay(v, K, level, rng);
  const legal = legalFor(v);
  if (easy && rng() < tune.easyNoise) { // a human slip: another card of the same suit
    const alt = legal.filter((c) => K.eff(c) === K.eff(d.action) && c !== d.action && !sins(v, c).length);
    if (alt.length) d = { action: pick(rng, alt), reason: "easy_slip" };
  }
  if (level === "expert" || level === "extreme") d = expertPlay(v, d, rng, tune, level === "extreme");
  if (sins(v, d.action).length) { // safety net: never ship a sin, whatever the heuristics said
    const clean = legal.filter((c) => !sins(v, c).length);
    if (clean.length) d = { action: lowest(clean, K), reason: `${d.reason}:sin_guard`, guarded: true };
  }
  return d;
}

export const LEVELS = ["easy", "standard", "expert", "extreme"];
