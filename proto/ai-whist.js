// Whist bots. decide(view, level, rng, tune) -> { action, reason }, called through ai.decide. They see only the view
// (whist.view): their own hand, the turned trump (still in the dealer's hand until played) and what was played.
// Old-school partnership manners: second hand low, third hand high, cover an honour with an honour, return partner's
// lead, never take a trick off partner. Sins: docs/AI_SPEC.md §7.
import * as whist from "./whist.js";
import { know, trickInfo, lowest, highest, legalFor } from "./ai.js";
import { lookahead } from "./ai-ohhell.js";

const R = (action, reason) => ({ action, reason });
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const partnerOf = (s) => (s + 2) % 4;

// the suit partner opened with this hand (their first lead), unless it was trump
function partnerSuit(v) {
  const p = partnerOf(v.seat);
  for (let i = 0; i < v.history.length; i += 4) if (v.history[i].seat === p) return v.history[i].card[1] === v.trump ? null : v.history[i].card[1];
  return null;
}
// have I led that suit since partner opened it?
function returned(v, x) {
  let seen = false;
  for (let i = 0; i < v.history.length; i += 4) {
    const h = v.history[i];
    if (h.seat === partnerOf(v.seat) && h.card[1] === x) seen = true;
    else if (seen && h.seat === v.seat && h.card[1] === x) return true;
  }
  return false;
}
// leading suit x would walk into an opponent's ruff
const ruffable = (v, K, x) => [1, 3].map((k) => (v.seat + k) % 4).some((o) => K.voids[o].has(x) && !K.voids[o].has(v.trump));

// returning partner's lead (W02): due when partner opened a side suit, I still hold it, haven't returned it, and no ruff waits
function returnDue(v, K) {
  const x = partnerSuit(v);
  return x && v.hand.some((c) => c[1] === x) && !returned(v, x) && !ruffable(v, K, x) ? x : null;
}

function leadCard(v, K) {
  const legal = legalFor(v), tr = legal.filter((c) => c[1] === v.trump), side = legal.filter((c) => c[1] !== v.trump);
  const x = returnDue(v, K);
  if (x) {
    const cs = legal.filter((c) => c[1] === x), boss = cs.filter(K.boss);
    return R(boss.length ? highest(boss, K) : cs.length <= 2 ? highest(cs, K) : lowest(cs, K), "return_partner_lead");
  }
  if (tr.length >= 5) return R(tr.some(K.boss) ? highest(tr, K) : lowest(tr, K), "draw_trump");
  const bosses = side.filter((c) => K.boss(c) && !ruffable(v, K, c[1]));
  if (bosses.length) return R(highest(bosses, K), "lead_boss");
  const bySuit = {};
  for (const c of side) (bySuit[c[1]] ??= []).push(c);
  for (const cs of Object.values(bySuit)) { // top of a sequence: K from A-K or K-Q, Q from Q-J
    const p = cs.map(K.pow).sort((a, b) => b - a);
    if (p.length >= 2 && p[0] >= 12 && p[0] - p[1] === 1) return R(cs.find((c) => K.pow(c) === (p[0] === 14 ? 13 : p[0])), "lead_top_of_sequence");
  }
  const long = Object.values(bySuit).sort((a, b) => b.length - a.length)[0];
  if (long) { const s = [...long].sort((a, b) => K.pow(b) - K.pow(a)); return R(s.length >= 4 ? s[3] : s[s.length - 1], "lead_long_suit"); }
  return R(lowest(legal, K), "lead_low");
}

export function play(v, K = know(v)) {
  if (!v.trick.length) return leadCard(v, K);
  const legal = legalFor(v), T = trickInfo(v, K), p = partnerOf(v.seat), pos = v.trick.length; // pos 1: second hand
  const winners = legal.filter(T.beats), losers = legal.filter((c) => !T.beats(c));
  const follow = (cs) => cs.filter((c) => c[1] === T.led), side = (cs) => cs.filter((c) => c[1] !== v.trump);
  const low = (cs) => { const f = follow(cs); return f.length ? lowest(f, K) : lowest(side(cs).length ? side(cs) : cs, K); };

  if (T.winSeat === p) { // partner has it: stay out of the way unless partner's card can still be beaten and mine can't
    if (T.last || K.boss(T.winCard) || !losers.length) return R(losers.length ? low(losers) : lowest(legal, K), "duck_partner_winning");
    const mine = follow(winners).filter(K.boss);
    if (mine.length) return R(lowest(mine, K), "third_hand_high");
    return R(low(losers), "duck_partner_winning");
  }
  if (pos === 1) { // second hand low, but cover an honour with an honour
    const led = v.trick[0].card;
    if (K.pow(led) >= 11 && K.pow(led) <= 13 && follow(winners).length) return R(lowest(follow(winners), K), "cover_honour");
    if (follow(legal).length) return R(lowest(follow(legal), K), "second_hand_low");
  }
  if (winners.length) {
    if (T.last) return R(lowest(winners, K), "win_last_lowest");
    const f = follow(winners);
    if (f.length) { const boss = f.filter(K.boss); return R(boss.length ? lowest(boss, K) : highest(f, K), "third_hand_high"); }
    if (!follow(legal).length) return R(lowest(winners, K), "ruff");
  }
  return R(low(losers.length ? losers : legal), losers.length && follow(losers).length ? "follow_low" : "discard_low");
}

// ---------------------------------------------------------------- sins (docs/AI_SPEC.md §7)

export function sins(v, action) {
  const out = [];
  if (v.phase !== "play") return out;
  const K = know(v), legal = legalFor(v);
  if (!v.trick.length) {
    const x = returnDue(v, K), tr = v.hand.filter((c) => c[1] === v.trump).length;
    if (x && action[1] !== x && !K.boss(action) && !(action[1] === v.trump && tr >= 5)) out.push("W02");
    return out;
  }
  const T = trickInfo(v, K), p = partnerOf(v.seat), wins = T.beats(action), losers = legal.filter((c) => !T.beats(c));
  const pWin = T.winSeat === p;
  if (pWin && T.last && wins && losers.length) out.push("W01");
  if (pWin && !T.last && wins && action[1] === v.trump && T.led !== v.trump && K.boss(T.winCard) && losers.some((c) => c[1] !== v.trump)) {
    const after = (v.seat + 1) % 4; // the opponent still to play: if they can't ruff, partner's card is good
    if (!K.voids[after].has(T.led)) out.push("W05");
  }
  const led = v.trick[0].card;
  if (v.trick.length === 1 && K.pow(led) >= 11 && K.pow(led) <= 13 && !wins && legal.some((c) => c[1] === T.led && T.beats(c))) out.push("W03");
  if (!pWin && !legal.some(T.beats) && action[1] === T.led && action !== lowest(legal.filter((c) => c[1] === T.led), K)) out.push("W04");
  return out;
}

// ---------------------------------------------------------------- entry point (ai.decide sends Whist views here)

const outcome = (st, seat) => { const t = seat % 2; return st.tricks[t] + st.tricks[t + 2] - st.tricks[1 - t] - st.tricks[3 - t]; };

export function decide(v, level, rng, tune) {
  const easy = level === "easy", K = know(v, easy ? tune.easyMemory : Infinity), legal = legalFor(v);
  let d = play(v, K);
  if (easy && rng() < tune.easyNoise) {
    const alt = legal.filter((c) => c[1] === d.action[1] && c !== d.action && !sins(v, c).length);
    if (alt.length) d = R(pick(rng, alt), "easy_slip");
  }
  if (level === "expert" || level === "extreme") {
    const x = level === "extreme", pinned = v.seat === v.dealer ? [] : [{ seat: v.dealer, card: v.trumpCard }];
    d = lookahead(v, d, rng, { K: know(v), engine: whist, n: x ? tune.extremeSamples : tune.expertSamples, policy: play, outcome, sins, pinned }); // Extreme: more samples
  }
  if (sins(v, d.action).length) {
    const clean = legal.filter((c) => !sins(v, c).length);
    if (clean.length) d = { action: lowest(clean, K), reason: `${d.reason}:sin_guard`, guarded: true };
  }
  return d;
}
