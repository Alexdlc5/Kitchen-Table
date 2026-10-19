// Spades rules: pure functions over a plain state object. House rules come in as `rules` (cards.rulesFor).
// Bids are numbers; 0 is nil. Actions: {bid, blind?} while bidding, a card string while playing.
import { newDeck, dealHands, winnerIndex, followable, next, partner, team } from "./cards.js";

const JOKER_POW = { BJ: 20, LJ: 19, "2D": 18, "2S": 17 };
export const eff = (c, j) => (j && (c === "BJ" || c === "LJ" || c === "2D") ? "S" : c[1]);
export const pow = (c, j) => (j && JOKER_POW[c]) || "23456789TJQKA".indexOf(c[0]) + 2;
export const isTrump = (c, j) => eff(c, j) === "S";

export function newHand(rules, seed, dealer, totals = { score: [0, 0], bags: [0, 0] }) {
  return {
    game: "spades", rules, seed, dealer, totals: structuredClone(totals),
    phase: "bid", turn: next(dealer), hands: dealHands(seed, dealer, newDeck(rules.jokers)),
    bids: [null, null, null, null], blind: [false, false, false, false],
    trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [], broken: false,
  };
}

export function legal(st) {
  const s = st.turn, r = st.rules, j = r.jokers;
  if (st.phase === "bid") {
    const p = st.bids[partner(s)];
    let lo = 1;
    if (r.minBid && p !== null && p > 0) lo = Math.max(1, r.minBid - p);
    const out = [{ bid: 0 }];
    for (let n = lo; n <= 13; n++) out.push({ bid: n });
    const behind = st.totals.score[1 - team(s)] - st.totals.score[team(s)];
    if (r.blindNil && behind >= r.blindNilDown && st.hands[s].length === 13) out.push({ bid: 0, blind: true });
    return out;
  }
  if (st.phase !== "play") return [];
  const hand = st.hands[s];
  if (!st.trick.length) {
    if (r.spadesBroken && !st.broken) {
      const side = hand.filter((c) => !isTrump(c, j));
      if (side.length) return side;
    }
    return hand;
  }
  return followable(hand, eff(st.trick[0].card, j), (c) => eff(c, j));
}

export function apply(st, a) {
  const s = st.turn, j = st.rules.jokers;
  if (st.phase === "bid") {
    st.bids[s] = a.bid; st.blind[s] = !!a.blind;
    st.turn = next(s);
    if (st.bids.every((b) => b !== null)) { st.phase = "play"; st.turn = next(st.dealer); }
    return st;
  }
  const hand = st.hands[s], i = hand.indexOf(a);
  if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
  hand.splice(i, 1);
  if (isTrump(a, j)) st.broken = true;
  st.history.push({ seat: s, card: a, n: 13 - hand.length - 1 });
  st.trick.push({ seat: s, card: a });
  if (st.trick.length < 4) { st.turn = next(s); return st; }
  const w = st.trick[winnerIndex(st.trick, (c) => eff(c, j), (c) => pow(c, j), "S")].seat;
  st.tricks[w]++; st.lastTrick = st.trick; st.trick = []; st.turn = w;
  if (!hand.length) st.phase = "done";
  return st;
}

// line items per team, so the score sheet shows exactly how each number was reached
export function score(st) {
  const r = st.rules, lines = [], score = [...st.totals.score], bags = [...st.totals.bags];
  for (const t of [0, 1]) {
    const seats = [t, t + 2];
    let pts = 0, B = 0, T = 0;
    for (const s of seats) {
      if (st.bids[s] === 0) {
        const val = st.blind[s] ? r.blindNil : r.nil, made = st.tricks[s] === 0;
        lines.push({ team: t, seat: s, kind: st.blind[s] ? "blindNil" : "nil", made, pts: made ? val : -val });
        pts += made ? val : -val;
        if (r.nilTricksCount) T += st.tricks[s];
      } else { B += st.bids[s]; T += st.tricks[s]; }
    }
    let over = 0;
    if (B > 0) {
      if (T >= B) {
        over = T - B;
        const base = 10 * B * (r.tenFor200 && B >= 10 ? 2 : 1);
        lines.push({ team: t, kind: "made", bid: B, took: T, pts: base + over });
        pts += base + over;
      } else {
        lines.push({ team: t, kind: "set", bid: B, took: T, pts: -10 * B });
        pts -= 10 * B;
      }
    } else if (T > 0) { over = T; lines.push({ team: t, kind: "bags", took: T, pts: T }); pts += T; }
    if (r.boston && st.tricks[t] + st.tricks[t + 2] === 13) { lines.push({ team: t, kind: "boston", pts: r.boston }); pts += r.boston; }
    bags[t] += over;
    while (bags[t] >= r.bagLimit) { bags[t] -= r.bagLimit; lines.push({ team: t, kind: "bagPenalty", pts: -r.bagPenalty }); pts -= r.bagPenalty; }
    score[t] += pts;
  }
  return { lines, totals: { score, bags } };
}

export function winner(totals, r) {
  const [a, b] = totals.score;
  if (Math.max(a, b) < r.target || a === b) return null;
  return a > b ? 0 : 1;
}

// everything a player at seat could know; never other hands, the seed, or who is human
export function view(st, seat) {
  return {
    game: "spades", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn,
    hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), bids: [...st.bids], blind: [...st.blind],
    trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks], history: st.history.map((h) => ({ ...h })),
    broken: st.broken, totals: structuredClone(st.totals),
  };
}
