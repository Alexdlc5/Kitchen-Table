// Oh Hell bots. decide(view, level, rng, tune) -> { action, reason }, called through ai.decide. Like every bot here they
// see only the view (ohhell.view): their own hand, the bids, the turned trump and what was played. Sins: docs/AI_SPEC.md §6.
// Also home to lookahead(), the Expert/Extreme sampler that Whist shares.
import * as ohhell from "./ohhell.js";
import { know, trickInfo, lowest, highest, legalFor, tracker } from "./ai.js";

const R = (action, reason) => ({ action, reason });
// the turned trump card is face up on the table, out of play: nobody holds it
function knowO(v, memory) {
  const K = know(v, memory);
  if (!v.trumpCard) return K;
  const unseen = K.unseen.filter((c) => c !== v.trumpCard);
  return { ...K, unseen, boss: (c) => !unseen.some((u) => u[1] === c[1] && K.pow(u) > K.pow(c)) };
}
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

// ---------------------------------------------------------------- counting a hand

// tricks a hand of `size` cards should take with `trump` (null: no trump). Small hands make trumps strong and kings weak.
export function estimate(hand, size, trump) {
  const P = ohhell.pow, tr = hand.filter((c) => c[1] === trump).map(P).sort((a, b) => b - a), n = tr.length;
  let t = 0, counted = 0;
  tr.forEach((p, i) => {
    const val = p === 14 ? 1 : p === 13 ? (n >= 2 ? 0.85 : 0.7) : p === 12 ? (n >= 3 ? 0.65 : 0.35) : p === 11 ? (n >= 4 ? 0.5 : 0.2)
      : i >= 3 ? 0.7 : size <= 3 ? 0.45 : size <= 6 ? 0.25 : 0.1;
    if (val >= 0.5) counted++;
    t += val;
  });
  const spare = n - counted;
  for (const s of "SHDC") {
    if (s === trump) continue;
    const cs = hand.filter((c) => c[1] === s).map(P), L = cs.length, has = (x) => cs.includes(x);
    if (has(14)) t += size <= 5 || L <= 4 ? 0.85 : 0.55;
    if (has(13)) t += has(14) ? (L <= 4 ? 0.7 : 0.35) : L >= 2 ? (size <= 5 ? 0.3 : 0.45) : 0.12;
    if (has(12) && has(13) && has(14) && L <= 5) t += 0.45;
    if (!trump && L >= 5 && (has(14) || has(13))) t += 0.4 * (L - 4);
    if (spare > 0 && size >= 4) t += (L === 0 ? Math.min(spare, 2) * 0.5 : L === 1 ? 0.3 : 0) * (size >= 6 ? 1 : 0.5);
    if (!trump && has(12) && L >= 3) t += 0.3;
  }
  // big hands: middling cards and length win tricks nobody counted (tuned on the sim, Tournament preset)
  return t + (size >= 3 ? 0.15 : 0) + (size > 6 ? (size - 6) * (trump ? 0.14 : 0.2) : 0);
}

// what this seat thinks it will take, from its hand and the bids already made (spare tricks drift to everyone)
export function count(v) {
  const est = estimate(v.hand, v.size, v.trump);
  const made = v.bids.filter((b) => b !== null), unbid = 3 - made.length;
  if (!made.length) return est;
  const spare = v.size - made.reduce((a, b) => a + b, 0) - est - unbid * (v.size / 4);
  return Math.max(0, est + Math.max(-0.5, Math.min(0.5, spare * 0.15)));
}

function bid(v, level, rng) {
  const legal = legalFor(v).map((a) => a.bid), c = Math.round(count(v));
  let want = c;
  if (level === "easy" && rng() < 0.35) want += rng() < 0.5 ? -1 : 1; // a human miscount, never two off
  const near = legal.filter((b) => Math.abs(b - c) <= 1); // the hook moves a bid by one at most (O02)
  const b = near.reduce((x, y) => (Math.abs(y - want) < Math.abs(x - want) ? y : x));
  return R({ bid: b }, legal.includes(c) ? "bid_count" : "bid_around_hook");
}

// ---------------------------------------------------------------- playing to the bid

const needOf = (v, s = v.seat) => v.bids[s] - v.tricks[s];
// do I want tricks? Over the bid only "1 a trick + 10" still pays per trick
const wants = (v) => { const n = needOf(v); return n > 0 || (n < 0 && v.rules.scoring === "1 a trick + 10"); };

export function play(v, K = knowO(v)) {
  const legal = legalFor(v), T = trickInfo(v, K), left = v.hand.length, need = needOf(v);
  const winners = legal.filter(T.beats), losers = legal.filter((c) => !T.beats(c));
  const side = (cs) => cs.filter((c) => c[1] !== v.trump), follow = (cs) => cs.filter((c) => c[1] === T.led);

  if (wants(v)) {
    if (!v.trick.length) {
      const bosses = legal.filter(K.boss);
      if (bosses.length) return R(highest(side(bosses).length ? side(bosses) : bosses, K), "lead_boss");
      if (need >= left) return R(highest(legal, K), "need_every_trick");
      const bySuit = {};
      for (const c of side(legal)) (bySuit[c[1]] ??= []).push(c);
      const short = Object.values(bySuit).sort((a, b) => a.length - b.length)[0];
      if (short && legal.some((c) => c[1] === v.trump)) return R(lowest(short, K), "lead_short_suit");
      return R(lowest(legal, K), "lead_low");
    }
    if (winners.length) {
      if (T.last) return R(lowest(winners, K), "win_last_lowest");
      const sure = follow(winners).filter(K.boss);
      if (sure.length) return R(lowest(sure, K), "win_with_boss");
      if (!follow(legal).length) return R(lowest(winners, K), "ruff");
      if (need >= left || v.trick.length === 2) return R(highest(follow(winners), K), "third_hand_high");
    }
    const f = follow(losers);
    if (f.length) return R(lowest(f, K), "follow_low");
    return R(lowest(side(losers).length ? side(losers) : losers.length ? losers : legal, K), "discard_low");
  }

  // at the bid (or past it with nothing to gain): lose every trick from here
  if (!v.trick.length) {
    const pool = side(legal).length ? side(legal) : legal;
    return R(lowest(pool, K), need === 0 ? "exact_lead_low" : "over_lead_low");
  }
  if (losers.length) {
    const f = follow(losers);
    if (f.length) return R(highest(f, K), "duck_highest_under");
    return R(highest(losers, K), "discard_danger");
  }
  return R(T.last ? highest(legal, K) : lowest(legal, K), "forced_win");
}

// ---------------------------------------------------------------- sins (docs/AI_SPEC.md §6)

export function sins(v, action) {
  const out = [];
  if (v.phase === "bid") {
    if (Math.abs(action.bid - Math.round(count(v))) > 1) out.push("O02");
    return out;
  }
  if (v.phase !== "play" || !v.trick.length) return out;
  const K = knowO(v), T = trickInfo(v, K), legal = legalFor(v), need = needOf(v), left = v.hand.length;
  const wins = T.beats(action), canLose = legal.some((c) => !T.beats(c)), canWin = legal.some(T.beats);
  if (need === 0 && T.last && wins && canLose) out.push("O01");
  if (need > 0 && need <= left && T.last && !wins && canWin) out.push("O03");
  if (need > 0 && !canWin && action[1] === T.led) {
    const f = legal.filter((c) => c[1] === T.led);
    if (action !== lowest(f, K)) out.push("O04");
  }
  return out;
}

// ---------------------------------------------------------------- Expert / Extreme: sample hidden hands, play each option out

// deal the unseen cards to the other seats as the table allows: a seat that showed out of a suit gets none of it, and
// pinned cards (Whist's turned trump, still in the dealer's hand) go where everyone saw them. Unplaced cards were never
// dealt (Oh Hell). keep(hands) can reject a world, for Extreme's reading of the bids.
export function sampleHands(v, K, rng, { pinned = [], keep = null, tries = 40 } = {}) {
  const others = [1, 2, 3].map((k) => (v.seat + k) % 4).sort((a, b) => K.voids[b].size - K.voids[a].size);
  let fallback = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const hs = [[], [], [], []], pool = K.unseen.filter((c) => !pinned.some((p) => p.card === c));
    hs[v.seat] = [...v.hand];
    for (const p of pinned) if (p.seat !== v.seat && K.unseen.includes(p.card)) hs[p.seat].push(p.card);
    for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
    const room = (s) => v.sizes[s] - hs[s].length, strict = attempt < tries * 0.75;
    for (const c of pool) {
      const cands = others.filter((s) => room(s) > 0 && (!strict || !K.voids[s].has(K.eff(c))));
      if (cands.length) hs[pick(rng, cands)].push(c);
    }
    if (others.some((s) => room(s) !== 0)) continue;
    if (!keep || keep(hs)) return hs;
    fallback ??= hs;
  }
  return fallback;
}

const peek = (st) => ({ ...st, seat: st.turn, hand: st.hands[st.turn], sizes: st.hands.map((h) => h.length) });

// try each clean card in `n` worlds sampled from what K knows, playing the rest of the hand with `policy(view, K)`; keep the
// best average outcome. more: the two best cards then play on through that many more worlds (Extreme: samples where they count)
export function lookahead(v, base, rng, { K, engine, n, more = 0, policy, outcome, sins, pinned, keep, out = [] }) {
  let legal = legalFor(v).filter((c) => !sins(v, c).length);
  if (legal.length <= 1) return base;
  const totals = new Map(legal.map((c) => [c, 0]));
  const root = { ...structuredClone(v), turn: v.seat, lastTrick: null }, trk = tracker(v, out);
  const run = (cards, worlds) => {
    let got = 0;
    for (let i = 0; i < worlds; i++) {
      const hands = sampleHands(v, K, rng, { pinned, keep });
      if (!hands) continue;
      got++;
      for (const c of cards) {
        const st = { ...root, hands: hands.map((h) => [...h]), trick: [...root.trick], tricks: [...root.tricks], history: [...root.history], bids: root.bids && [...root.bids] };
        const t = trk.copy();
        engine.apply(st, c); t.see(st);
        while (st.phase === "play") { const pv = peek(st); engine.apply(st, policy(pv, t.K(pv.hand)).action); t.see(st); }
        totals.set(c, totals.get(c) + outcome(st, v.seat));
      }
    }
    return got;
  };
  if (!run(legal, n)) return base;
  if (more && legal.length > 2) run((legal = [...legal].sort((a, b) => totals.get(b) - totals.get(a)).slice(0, 2)), more);
  let best = legal.includes(base.action) ? base.action : legal[0], bestV = totals.get(best);
  for (const c of legal) if (totals.get(c) > bestV + 1e-9) { best = c; bestV = totals.get(c); }
  return best === base.action ? base : R(best, "expert_lookahead");
}

// my points this hand against the average of the other three
function outcome(st, seat) {
  const pts = ohhell.score(st).lines.map((l) => l.pts);
  return pts[seat] - (pts.reduce((a, b) => a + b, 0) - pts[seat]) / 3;
}

// Extreme reads the bids: a world is kept only if each other seat's hand as dealt fits what it bid
const fitsBids = (v) => (hs) => {
  for (let s = 0; s < 4; s++) {
    if (s === v.seat || v.bids[s] === null) continue;
    const dealt = [...hs[s], ...v.history.filter((h) => h.seat === s).map((h) => h.card)]; // the history holds the trick in progress too
    if (Math.abs(estimate(dealt, v.size, v.trump) - v.bids[s]) > 1.5) return false;
  }
  return true;
};

// Extreme bids by playing the hand out: for each bid within 1 of its count (O02), deal the unseen cards n ways that fit
// the bids so far, let the seats after it bid as Standard does, play every world out, keep the bid that scores best
function bidAhead(v, d, rng, n) {
  const c = Math.round(count(v)), cands = legalFor(v).map((a) => a.bid).filter((b) => Math.abs(b - c) <= 1);
  if (cands.length <= 1) return d;
  const K = knowO(v), totals = new Map(cands.map((b) => [b, 0])), root = { ...structuredClone(v), turn: v.seat, lastTrick: null };
  const trk = tracker(v, v.trumpCard ? [v.trumpCard] : []);
  for (let i = 0; i < n; i++) {
    const hands = sampleHands(v, K, rng, { keep: fitsBids(v) });
    if (!hands) continue;
    for (const b of cands) {
      const st = { ...root, hands: hands.map((h) => [...h]), bids: [...root.bids], tricks: [...root.tricks], trick: [], history: [] };
      ohhell.apply(st, { bid: b });
      while (st.phase === "bid") ohhell.apply(st, bid(peek(st), "standard").action);
      const t = trk.copy();
      while (st.phase === "play") { const pv = peek(st); ohhell.apply(st, play(pv, t.K(pv.hand)).action); t.see(st); }
      totals.set(b, totals.get(b) + outcome(st, v.seat));
    }
  }
  let best = d.action.bid;
  for (const [b, val] of totals) if (val > totals.get(best) + 1e-9) best = b;
  return best === d.action.bid ? d : R({ bid: best }, "extreme_bid_ahead");
}

// ---------------------------------------------------------------- entry point (ai.decide sends Oh Hell views here)

export function decide(v, level, rng, tune) {
  if (v.phase === "bid") return level === "extreme" ? bidAhead(v, bid(v, level, rng), rng, tune.extremeSamples) : bid(v, level, rng);
  const easy = level === "easy", K = knowO(v, easy ? tune.easyMemory : Infinity), legal = legalFor(v);
  let d = play(v, K);
  if (easy && rng() < tune.easyNoise) {
    const alt = legal.filter((c) => c[1] === d.action[1] && c !== d.action && !sins(v, c).length);
    if (alt.length) d = R(pick(rng, alt), "easy_slip");
  }
  if (level === "expert" || level === "extreme") {
    const x = level === "extreme";
    d = lookahead(v, d, rng, { K: knowO(v), engine: ohhell, n: x ? tune.extremeSamples : tune.expertSamples, policy: play, outcome, sins, keep: x ? fitsBids(v) : null, out: v.trumpCard ? [v.trumpCard] : [] });
  }
  if (sins(v, d.action).length) {
    const clean = legal.filter((c) => !sins(v, c).length);
    if (clean.length) d = { action: lowest(clean, K), reason: `${d.reason}:sin_guard`, guarded: true };
  }
  return d;
}
