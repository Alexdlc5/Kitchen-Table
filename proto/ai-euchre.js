// Euchre bots (docs/AI_SPEC.md §5), dispatched from ai.js: decide(view, level, rng, tune) -> { action, reason }, and
// sins(view, action) lists the E-sins an action would commit. Like every bot, it sees only a view (euchre.view): its
// own hand, the upcard, the calls and the cards played; never another hand, the kitty, the seed or who is human.
import * as E from "./euchre.js";
import { SUITS, partner, team, next } from "./cards.js";

const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const DEFAULT = { easyNoise: 0.25, easyMemory: 4, expertSamples: 24, extremeSamples: 60, euchreOrder: 2.5 };

export function legalFor(v) {
  const st = { ...v, turn: v.seat, hands: [] };
  st.hands[v.seat] = v.hand;
  return E.legal(st);
}
const trumpOf = (v, a) => (a.call === "order" ? v.up[1] : a.call);
const pickedUp = (v) => v.calls.some((c) => c.round === 1 && c.call === "order") && !v.out.includes(v.dealer);

// what this seat can work out: unseen cards (other hands and the hidden kitty), who is void in what, the boss cards
export function know(v, memory = Infinity) {
  const t = v.trump, eff = (c) => E.eff(c, t), pow = (c) => E.pow(c, t);
  const h = v.history, cut = (h.length ? h[h.length - 1].n : -1) - memory;
  const gone = new Set(v.hand), voids = [new Set(), new Set(), new Set(), new Set()];
  let ledN = -1, led = null;
  for (const p of h) {
    if (p.n <= cut) continue;
    gone.add(p.card);
    if (p.n !== ledN) { ledN = p.n; led = eff(p.card); } else if (eff(p.card) !== led) voids[p.seat].add(led);
  }
  if (v.trick.length) {
    const l = eff(v.trick[0].card);
    for (const x of v.trick) { gone.add(x.card); if (eff(x.card) !== l) voids[x.seat].add(l); }
  }
  if (v.discard) gone.add(v.discard);
  if (v.phase !== "bid1" && v.phase !== "farmer" && !pickedUp(v)) gone.add(v.up); // turned down (or left in the kitty): out of play
  const unseen = E.DECK.filter((c) => !gone.has(c)), top = {};
  for (const u of unseen) { const su = eff(u), p = pow(u); if (!(top[su] >= p)) top[su] = p; }
  const boss = (c) => !(top[eff(c)] > pow(c));
  // the upcard the dealer picked up is in the dealer's hand until it is played
  const upAt = pickedUp(v) && v.dealer !== v.seat && unseen.includes(v.up) ? v.dealer : -1;
  return { eff, pow, unseen, voids, boss, t, upAt };
}

// the trick so far: who is winning, with what, whether card c would take over, and who still plays after me
function trickInfo(v, K) {
  const tr = v.trick, active = 4 - v.out.length, after = [];
  for (let s = next(v.seat), k = tr.length + 1; k < active; s = next(s)) if (!v.out.includes(s)) { after.push(s); k++; }
  if (!tr.length) return { led: null, winSeat: -1, winCard: null, last: false, beats: () => true, seatsAfter: after };
  const led = K.eff(tr[0].card);
  let w = tr[0];
  const over = (a, b) => (K.eff(b) === K.eff(a) ? K.pow(b) > K.pow(a) : K.eff(b) === K.t);
  for (const p of tr.slice(1)) if (over(w.card, p.card)) w = p;
  return { led, winSeat: w.seat, winCard: w.card, last: tr.length === active - 1, beats: (c) => over(w.card, c), seatsAfter: after };
}
const lowest = (cs, K) => cs.reduce((a, b) => (K.pow(b) < K.pow(a) ? b : a));
const highest = (cs, K) => cs.reduce((a, b) => (K.pow(b) > K.pow(a) ? b : a));

// ---------------------------------------------------------------- hand values for calling trump

const isTrump = (c, t) => E.eff(c, t) === t;
const countTrump = (hand, t) => hand.filter((c) => isTrump(c, t)).length;
const hasBower = (hand, t) => hand.includes("J" + t) || hand.includes("J" + E.MATE[t]);

// tricks this hand should take with t as trump (a club player's count: bowers, trump length, off aces, voids)
export function strength(hand, t) {
  const n = countTrump(hand, t);
  let x = 0;
  for (const c of hand.filter((c) => isTrump(c, t))) {
    const p = E.pow(c, t);
    x += p === 30 ? 1 : p === 29 ? (n >= 2 ? 0.85 : 0.55) : p === 14 ? (n >= 3 ? 0.75 : 0.5) : p === 13 ? (n >= 3 ? 0.6 : 0.35) : n >= 3 ? 0.45 : 0.25;
  }
  for (const s of SUITS) {
    if (s === t) continue;
    const cs = hand.filter((c) => E.eff(c, t) === s);
    if (cs.some((c) => c[0] === "A")) x += cs.length <= 2 ? 0.75 : 0.55;
    if (cs.some((c) => c[0] === "K") && cs.some((c) => c[0] === "A")) x += 0.25;
    if (!cs.length && n >= 2) x += 0.3;
  }
  return x;
}

// tricks that can't be lost: the unbroken run of top trump, every trump if that run outlasts the trump still out, off aces
export function sureTricks(hand, t) {
  const order = ["J" + t, "J" + E.MATE[t], "A" + t, "K" + t, "Q" + t, "T" + t, "9" + t];
  let run = 0;
  while (run < 7 && hand.includes(order[run])) run++;
  const mine = countTrump(hand, t), aces = hand.filter((c) => c[0] === "A" && !isTrump(c, t)).length;
  return (run >= 7 - mine ? mine : run) + aces;
}

// top cards for a loner: both bowers and the ace, king and queen of trump, plus the off-suit aces (AI-E2: a classic loner
// like J♠ A♠ K♠ Q♠ A♥ is missing the left bower, so an unbroken-run count calls it two sure tricks)
export function topTricks(hand, t) {
  const top = ["J" + t, "J" + E.MATE[t], "A" + t, "K" + t, "Q" + t];
  return hand.filter((c) => top.includes(c)).length + hand.filter((c) => c[0] === "A" && !isTrump(c, t)).length;
}
// Standard goes alone with the right bower, two of the left, ace and king of trump, and an off ace (J♠ A♠ K♠ Q♠ A♥),
// or with five trumps (review 2, AI-E2). A hand with a loser and no off ace marches 18-27% of the time and stays with
/// partner; these march 61% in Standard self-play (100K hands), 4.6 loners per 100 hands, and a loner pays from about one
// march in two
function lonerHand(hand, t) {
  if (!hand.includes("J" + t)) return false;
  const more = ["J" + E.MATE[t], "A" + t, "K" + t].filter((c) => hand.includes(c)).length;
  return (more >= 2 && hand.some((c) => c[0] === "A" && !isTrump(c, t))) || countTrump(hand, t) === 5;
}

// the dealer's hand after picking up the upcard and throwing the worst card
function afterPickup(hand, up) {
  const h = [...hand, up], d = discardChoice(h, up[1]);
  return h.filter((c) => c !== d);
}
function discardChoice(hand, t) { // keep trump and aces; throw the lowest card, best of all a singleton (a new void)
  const off = hand.filter((c) => !isTrump(c, t) && c[0] !== "A"), pool = off.length ? off : hand.filter((c) => !isTrump(c, t)).length ? hand.filter((c) => !isTrump(c, t)) : hand;
  const len = (c) => hand.filter((x) => E.eff(x, t) === E.eff(c, t)).length;
  return pool.reduce((a, b) => (len(b) < len(a) || (len(b) === len(a) && E.pow(b, t) < E.pow(a, t)) ? b : a));
}

// how good calling t is for my side, in tricks, counting where the upcard goes in round one
function callValue(v, t, round) {
  const s = v.seat, d = v.dealer;
  if (round === 1 && s === d) return { hand: afterPickup(v.hand, v.up), x: strength(afterPickup(v.hand, v.up), t) };
  let x = strength(v.hand, t);
  if (round === 1) { const up = E.pow(v.up, t) >= 29 ? 0.8 : E.pow(v.up, t) >= 13 ? 0.5 : 0.3; x += team(d) === team(s) ? up : -up; }
  if (round === 2 && s === next(d) && t !== v.up[1]) x += 0.1; // first to speak in round two: a little bolder
  return { hand: v.hand, x };
}

function bid(v, level, rng, tune) {
  const round = v.phase === "bid1" ? 1 : 2, legal = legalFor(v), canPass = legal.some((a) => a.call === "pass");
  const noise = level === "easy" ? (rng() - 0.5) * 0.8 : 0;
  const opts = round === 1 ? [v.up[1]] : SUITS.split("").filter((t) => t !== v.up[1]);
  let best = null;
  for (const t of opts) { const c = callValue(v, t, round); if (!best || c.x > best.x) best = { t, ...c }; }
  const call = round === 1 ? "order" : best.t;
  const onlyAlone = !legal.some((a) => a.call === call && !a.alone);
  if (lonerHand(best.hand, best.t) && legal.some((a) => a.call === call && a.alone)) return { action: { call, alone: true }, reason: "alone_top_trumps" };
  if (onlyAlone) return { action: { call: "pass" }, reason: "pass_canadian" }; // Canadian loner: only call with a loner hand
  if (!canPass || (best.x + noise >= tune.euchreOrder && !sins(v, { call }).length)) return { action: { call }, reason: canPass ? (round === 1 ? "order_strength" : "call_strength") : "stuck_dealer" };
  return { action: { call: "pass" }, reason: "pass_weak" };
}

// ---------------------------------------------------------------- play

function play(v, K) {
  const s = v.seat, p = partner(s), t = v.trump, legal = legalFor(v), T = trickInfo(v, K);
  const R = (action, reason) => ({ action, reason });
  const ours = team(v.maker) === team(s), opps = [next(s), (s + 3) % 4].filter((o) => !v.out.includes(o));
  const tr = (cs) => cs.filter((c) => K.eff(c) === t), off = (cs) => cs.filter((c) => K.eff(c) !== t);
  const winners = legal.filter(T.beats), losers = legal.filter((c) => !T.beats(c));

  if (!v.trick.length) {
    const myTrump = tr(legal), aces = off(legal).filter(K.boss), offs = off(legal);
    const oppsTrump = K.unseen.some((c) => K.eff(c) === t) && opps.some((o) => !K.voids[o].has(t));
    if (ours && (v.maker === s || v.out.includes(p))) { // my call: pull trump while they still have some
      const bossT = myTrump.filter(K.boss);
      if (oppsTrump && bossT.length) return R(highest(bossT, K), "pull_trump_boss");
      if (oppsTrump && myTrump.length >= 2 && myTrump.length >= offs.length) return R(highest(myTrump, K), "pull_trump");
      if (aces.length) return R(highest(aces, K), "lead_off_ace");
      if (offs.length) return R(lowest(offs, K), "lead_low_off");
      return R(highest(myTrump, K), "lead_trump_only");
    }
    if (ours) { // partner called it: the right bower or an off ace, never a little trump
      if (legal.includes("J" + t)) return R("J" + t, "lead_right_for_partner");
      if (aces.length) return R(highest(aces, K), "lead_off_ace");
      if (offs.length) return R(lowest(offs, K), "lead_low_off");
      const big = myTrump.filter((c) => !"9T".includes(c[0]));
      return R(highest(big.length ? big : myTrump, K), "lead_trump_only");
    }
    // defending: cash an ace, otherwise lead low from a short suit; trump only with both bowers and a third
    const strong = myTrump.length >= 3 && legal.includes("J" + t) && legal.includes("J" + E.MATE[t]);
    if (strong) return R("J" + t, "lead_right_strong");
    if (aces.length) return R(highest(aces, K), "lead_off_ace");
    if (offs.length) {
      const bySuit = {};
      for (const c of offs) (bySuit[K.eff(c)] ??= []).push(c);
      const short = Object.values(bySuit).sort((a, b) => a.length - b.length)[0];
      return R(lowest(short, K), "lead_short_suit");
    }
    return R(lowest(myTrump, K), "lead_trump_only");
  }

  const follow = legal.filter((c) => K.eff(c) === T.led);
  const cheap = (cs) => { const o = off(cs); return lowest(o.length ? o : cs, K); }; // the least useful card: off-suit first
  if (T.winSeat === p) {
    const safe = T.last || K.boss(T.winCard) || (K.eff(T.winCard) === t && T.seatsAfter.every((x) => K.voids[x].has(t)));
    if (losers.length && (safe || !winners.some(K.boss))) return R(follow.length ? lowest(follow.filter((c) => !T.beats(c)).length ? follow.filter((c) => !T.beats(c)) : follow, K) : cheap(losers), "duck_partner_winning");
    if (winners.length) return R(lowest(winners.filter(K.boss).length ? winners.filter(K.boss) : winners, K), "secure_trick");
  }
  if (winners.length) {
    if (T.last) return R(lowest(winners, K), "win_last_lowest");
    // trumping in (AI-E1): the lowest trump that wins, keeping a bower as a sure trick for later, unless an opponent still
    // to play is known out of the suit led as well and may overtrump
    const over = T.seatsAfter.some((x) => team(x) !== team(s) && K.voids[x].has(T.led) && !K.voids[x].has(t));
    if (!follow.length && !over) return R(lowest(winners, K), "trump_in_low");
    const sure = winners.filter(K.boss);
    if (sure.length) return R(lowest(sure, K), "win_with_boss");
    const fw = winners.filter((c) => K.eff(c) === T.led);
    if (fw.length) return R(highest(fw, K), "third_hand_high");
    if (!follow.length) return R(lowest(winners, K), "trump_in");
  }
  if (follow.length) return R(lowest(follow, K), "follow_low");
  return R(cheap(legal), "discard_low");
}

// ---------------------------------------------------------------- the other decisions

function farmer(v) { // swap the three cards least likely to be trump: keep the upcard's suit and its jack's colour
  const keep = (c) => (c[1] === v.up[1] ? 2 : c[1] === E.MATE[v.up[1]] ? 1 : 0);
  const give = [...v.hand].sort((a, b) => keep(a) - keep(b) || E.pow(a, null) - E.pow(b, null)).slice(0, 3);
  return { action: { swap: give }, reason: "farmer_swap" };
}
function defend(v) {
  const go = sureTricks(v.hand, v.trump) >= 3;
  return { action: { defend: go }, reason: go ? "defend_alone" : "defend_together" };
}

// ---------------------------------------------------------------- sins (docs/AI_SPEC.md §5)

export function sins(v, a) {
  const out = [], s = v.seat, p = partner(s), t = v.trump;
  if (v.phase === "bid1" || v.phase === "bid2") {
    if (a.call === "pass") return out;
    const tt = trumpOf(v, a), hand = v.phase === "bid1" && s === v.dealer ? [...v.hand, v.up] : v.hand;
    const forced = !legalFor(v).some((x) => x.call === "pass");
    if (!forced && countTrump(hand, tt) <= 1 && !hasBower(hand, tt)) out.push("E04");
    const loner = v.phase === "bid1" && s === v.dealer ? afterPickup(v.hand, v.up) : v.hand;
    if (a.alone && (!loner.includes("J" + tt) || topTricks(loner, tt) < 3)) out.push("E07"); // reckless: no right bower, or under 3 top tricks
    return out;
  }
  if (v.phase !== "play") return out;
  const K = know(v), T = trickInfo(v, K), legal = legalFor(v), c = a;
  const ours = team(v.maker) === team(s), trump = K.eff(c) === t, offOk = legal.some((x) => K.eff(x) !== t);
  if (!v.trick.length) {
    const strong = v.hand.filter((x) => K.eff(x) === t).length >= 3 && v.hand.includes("J" + t) && v.hand.includes("J" + E.MATE[t]);
    if (!ours && trump && offOk && !strong) out.push("E01");
    if (v.maker === p) { // partner's call: the right bower or an off ace if I have one; never a little trump
      const good = legal.filter((x) => x === "J" + t || (x[0] === "A" && K.eff(x) !== t));
      if (good.length ? !good.includes(c) : trump && "9T".includes(c[0]) && legal.some((x) => !(K.eff(x) === t && "9T".includes(x[0])))) out.push("E03");
    }
    const opps = [next(s), (s + 3) % 4].filter((o) => !v.out.includes(o));
    const pDry = v.out.includes(p) || K.voids[p].has(t), noneOut = !K.unseen.some((x) => K.eff(x) === t) || opps.every((o) => K.voids[o].has(t));
    if (ours && trump && pDry && noneOut && legal.some((x) => K.eff(x) !== t && !K.boss(x))) out.push("E05");
    return out;
  }
  const wins = T.beats(c), canLose = legal.some((x) => !T.beats(x)), pWin = T.winSeat === p;
  if (pWin && T.last && ((wins && canLose) || (trump && T.led !== t && offOk))) out.push("E02");
  if (pWin && !T.last && K.eff(T.winCard) === t && trump && wins && canLose && T.seatsAfter.every((x) => K.voids[x].has(t))) out.push("E06");
  return out;
}

// ---------------------------------------------------------------- Expert and Extreme: sample the hidden cards, play it out

// Extreme keeps a sampled deal only if it fits the calls: a maker held a calling hand, a passer didn't
function fitsCalls(v, hs) {
  for (const c of v.calls) {
    if (c.seat === v.seat || !c.call) continue;
    const dealt = [...hs[c.seat], ...v.history.filter((h) => h.seat === c.seat).map((h) => h.card), ...v.trick.filter((x) => x.seat === c.seat).map((x) => x.card)];
    const t = c.call === "pass" ? (c.round === 1 ? v.up[1] : null) : c.call === "order" ? v.up[1] : c.call;
    if (!t) continue;
    const x = strength(dealt, t);
    if (c.call === "pass" ? x > 3.2 : x < 1.4) return false;
  }
  return true;
}

function sampleWorld(v, K, rng, read) {
  for (let attempt = 0; attempt < (read ? 80 : 40); attempt++) {
    const pool = K.unseen.filter((c) => !(K.upAt >= 0 && c === v.up));
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const hs = [[], [], [], []];
    hs[v.seat] = [...v.hand];
    if (K.upAt >= 0) hs[K.upAt].push(v.up);
    const seats = [0, 1, 2, 3].filter((s) => s !== v.seat && !v.out.includes(s)).sort((a, b) => K.voids[b].size - K.voids[a].size);
    let ok = true;
    for (const c of pool) { // seats first, what's left over is the kitty
      const cands = seats.filter((s) => hs[s].length < v.sizes[s] && (attempt > 30 || !K.voids[s].has(K.eff(c))));
      if (cands.length) hs[pick(rng, cands)].push(c);
    }
    for (const s of seats) if (hs[s].length < v.sizes[s]) ok = false;
    if (ok && (!read || attempt >= 60 || fitsCalls(v, hs))) return hs;
  }
  return null;
}

const peek = (st) => ({ ...st, seat: st.turn, hand: st.hands[st.turn], sizes: st.hands.map((h) => h.length) });
function expertPlay(v, base, rng, tune, extreme) {
  const legal = legalFor(v).filter((c) => !sins(v, c).length);
  if (legal.length <= 1) return base;
  const K = know(v), totals = new Map(legal.map((c) => [c, 0]));
  let samples = 0;
  for (let i = 0; i < (extreme ? 2 * tune.extremeSamples : tune.expertSamples); i++) {
    const hands = sampleWorld(v, K, rng, extreme);
    if (!hands) continue;
    samples++;
    for (const c of legal) {
      const st = { ...v, turn: v.seat, hands: hands.map((h) => [...h]), trick: [...v.trick], tricks: [...v.tricks], history: [...v.history], out: [...v.out] };
      E.apply(st, c);
      while (st.phase === "play") { const pv = peek(st); E.apply(st, play(pv, know(pv)).action); }
      const sc = E.score(st).totals.score, me = team(v.seat);
      totals.set(c, totals.get(c) + (sc[me] - v.totals.score[me]) - (sc[1 - me] - v.totals.score[1 - me]));
    }
  }
  if (!samples) return base;
  let best = base.action, bestV = totals.get(base.action) ?? -Infinity;
  for (const [c, val] of totals) if (val > bestV + 1e-9) { best = c; bestV = val; }
  return best === base.action ? base : { action: best, reason: "expert_lookahead" };
}

// Extreme calls by look-ahead (and with twice the samples): deal the other hands and the kitty's three hidden cards
// (fitting every call so far), let everyone after me call like Standard, play it out, and keep the call, alone or not,
// with the best result in those deals (the game end counts). It overrules the hand count only when it is sure: the
// gain over the count's call must beat its own standard error.
function extremeBid(v, base, rng, tune) {
  const options = legalFor(v).filter((a) => !sins(v, a).length), b = options.findIndex((a) => a.call === base.action.call && !!a.alone === !!base.action.alone);
  if (options.length <= 1 || b < 0) return base;
  const K = know(v), others = [1, 2, 3].map((k) => (v.seat + k) % 4), me = team(v.seat), n = 2 * tune.extremeSamples;
  const sum = options.map(() => 0), sq = options.map(() => 0);
  let samples = 0;
  for (let i = 0; i < n; i++) {
    let hands, pool;
    for (let attempt = 0; attempt < 80; attempt++) {
      pool = K.unseen.filter((c) => c !== v.up);
      for (let j = pool.length - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); [pool[j], pool[k]] = [pool[k], pool[j]]; }
      hands = [[], [], [], []]; hands[v.seat] = [...v.hand];
      others.forEach((s, k) => (hands[s] = pool.slice(5 * k, 5 * k + 5)));
      if (attempt >= 60 || fitsCalls(v, hands)) break;
    }
    samples++;
    const val = options.map((a) => {
      const st = { game: "euchre", rules: v.rules, dealer: v.dealer, handNo: 0, totals: structuredClone(v.totals), phase: v.phase, turn: v.seat,
        hands: hands.map((h) => [...h]), kitty: [v.up, ...pool.slice(15)], up: v.up, trump: null, maker: null, alone: false, defender: null, out: [],
        calls: v.calls.map((c) => ({ ...c })), farmers: [], discard: null, trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [] };
      E.apply(st, a);
      while (st.phase !== "play" && st.phase !== "done") E.apply(st, decide(E.view(st, st.turn), "standard", rng, tune).action);
      while (st.phase === "play") { const pv = peek(st); E.apply(st, play(pv, know(pv)).action); }
      const sc = E.score(st).totals, w = E.winner(sc, v.rules);
      return sc.score[me] - v.totals.score[me] - (sc.score[1 - me] - v.totals.score[1 - me]) + (w === null ? 0 : w === me ? 10 : -10);
    });
    val.forEach((x, k) => { const d = x - val[b]; sum[k] += d; sq[k] += d * d; });
  }
  let best = b;
  for (let k = 0; k < options.length; k++) {
    const m = sum[k] / samples, se = Math.sqrt(Math.max(0, sq[k] / samples - m * m) / samples);
    if (m > se && (best === b || m > sum[best] / samples)) best = k;
  }
  return best === b ? base : { action: options[best], reason: "extreme_lookahead_call" };
}

// ---------------------------------------------------------------- entry point

export function decide(v, level = "standard", rng = Math.random, tune = {}) {
  tune = { ...DEFAULT, ...tune };
  if (v.phase === "farmer") return farmer(v);
  if (v.phase === "defend") return defend(v);
  if (v.phase === "discard") return { action: discardChoice(v.hand, v.trump), reason: "discard_short" };
  if (v.phase === "bid1" || v.phase === "bid2") {
    let d = bid(v, level, rng, tune);
    if (level === "extreme" && !sins(v, d.action).length) d = extremeBid(v, d, rng, tune);
    if (!sins(v, d.action).length) return d;
    const clean = legalFor(v).filter((a) => !a.alone && !sins(v, a).length);
    return { action: clean.find((a) => a.call === "pass") || clean[0], reason: `${d.reason}:sin_guard`, guarded: true };
  }
  const easy = level === "easy", K = know(v, easy ? tune.easyMemory : Infinity), legal = legalFor(v);
  let d = play(v, K);
  if (easy && rng() < tune.easyNoise) { // a human slip: another card of the same suit
    const alt = legal.filter((c) => K.eff(c) === K.eff(d.action) && c !== d.action && !sins(v, c).length);
    if (alt.length) d = { action: pick(rng, alt), reason: "easy_slip" };
  }
  if (level === "expert" || level === "extreme") d = expertPlay(v, d, rng, tune, level === "extreme");
  if (sins(v, d.action).length) {
    const clean = legal.filter((c) => !sins(v, c).length);
    if (clean.length) d = { action: lowest(clean, K), reason: `${d.reason}:sin_guard`, guarded: true };
  }
  return d;
}
