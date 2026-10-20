// Spades rules: pure functions over a plain state object. House rules come in as `rules` (cards.rulesFor).
// Bids are numbers; 0 is nil. Actions: {bid, blind?} while bidding, [n cards] in the blind nil exchange, a card string
// while playing.
import { newDeck, dealHands, winnerIndex, followable, next, partner, team } from "./cards.js";

const JOKER_POW = { BJ: 20, LJ: 19, "2D": 18, "2S": 17 };
export const eff = (c, j) => (j && (c === "BJ" || c === "LJ" || c === "2D") ? "S" : c[1]);
export const pow = (c, j) => (j && JOKER_POW[c]) || "23456789TJQKA".indexOf(c[0]) + 2;
export const isTrump = (c, j) => eff(c, j) === "S";

export function newHand(rules, seed, dealer, totals = { score: [0, 0], bags: [0, 0] }) {
  return {
    game: "spades", rules, seed, dealer, totals: structuredClone(totals),
    phase: "bid", turn: next(dealer), hands: dealHands(seed, dealer, newDeck(rules.jokers)),
    bids: [null, null, null, null], blind: [false, false, false, false], passes: [null, null, null, null], received: [null, null, null, null],
    trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [], broken: false,
  };
}

// the blind nil exchange (rules.blindSwap cards): each blind nil, from the dealer's left, passes to its partner, then the
// partner passes back. Two blind nils on one team have nothing to swap.
const swapOrder = (st) => [1, 2, 3, 4].map((k) => (st.dealer + k) % 4).filter((s) => st.blind[s] && !st.blind[partner(s)]).flatMap((s) => [s, partner(s)]);
const firstLead = (st) => (st.rules.twoClubsLead ? (st.rules.jokers ? "3C" : "2C") : null);

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
  if (st.phase === "exchange") return st.hands[s].filter((c) => !(st.received[s] || []).includes(c)); // choose any n; never hand back what you got
  if (st.phase !== "play") return [];
  const hand = st.hands[s];
  if (!st.trick.length) {
    if (!st.history.length && firstLead(st)) return [firstLead(st)];
    if (r.spadesBroken && !st.broken) {
      const side = hand.filter((c) => !isTrump(c, j));
      if (side.length) return side;
    }
    return hand;
  }
  return followable(hand, eff(st.trick[0].card, j), (c) => eff(c, j));
}

function startPlay(st) {
  st.phase = "play"; st.turn = next(st.dealer);
  if (firstLead(st)) st.turn = st.hands.findIndex((h) => h.includes(firstLead(st)));
  return st;
}

export function apply(st, a) {
  const s = st.turn, j = st.rules.jokers;
  if (st.phase === "bid") {
    st.bids[s] = a.bid; st.blind[s] = !!a.blind;
    st.turn = next(s);
    if (st.bids.every((b) => b !== null)) {
      const order = st.rules.blindSwap ? swapOrder(st) : [];
      if (order.length) { st.phase = "exchange"; st.turn = order[0]; } else startPlay(st);
    }
    return st;
  }
  if (st.phase === "exchange") {
    const n = st.rules.blindSwap, ok = legal(st), to = partner(s);
    if (a.length !== n || new Set(a).size !== n || a.some((c) => !ok.includes(c))) throw new Error(`pass ${n} of your own cards`);
    st.passes[s] = [...a]; st.received[to] = [...a];
    st.hands[s] = st.hands[s].filter((c) => !a.includes(c)); st.hands[to].push(...a);
    const nxt = swapOrder(st).find((x) => !st.passes[x]);
    if (nxt === undefined) startPlay(st); else st.turn = nxt;
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
    let pts = 0, B = 0, T = 0, over = 0;
    for (const s of seats) {
      if (st.bids[s] === 0) {
        const val = st.blind[s] ? r.blindNil : r.nil, made = st.tricks[s] === 0;
        lines.push({ team: t, seat: s, kind: st.blind[s] ? "blindNil" : "nil", made, pts: made ? val : -val });
        pts += made ? val : -val;
        if (r.nilTricksCount) T += st.tricks[s];
        else if (st.tricks[s]) { // a broken nil's tricks don't help the partner, but they are bags
          lines.push({ team: t, seat: s, kind: "nilBags", took: st.tricks[s], pts: st.tricks[s] });
          pts += st.tricks[s]; over += st.tricks[s];
        }
      } else { B += st.bids[s]; T += st.tricks[s]; }
    }
    if (B > 0) {
      const big = r.boston === "bid 13" && B >= 13 ? 500 : r.tenFor200 && B >= 10 ? 200 : 0; // these bids win or lose a flat amount
      if (T >= B) {
        over += T - B;
        lines.push({ team: t, kind: "made", bid: B, took: T, pts: (big || 10 * B) + T - B });
        pts += (big || 10 * B) + T - B;
      } else {
        lines.push({ team: t, kind: "set", bid: B, took: T, pts: -(big || 10 * B) });
        pts -= big || 10 * B;
      }
    } else if (T > 0) { over += T; lines.push({ team: t, kind: "bags", took: T, pts: T }); pts += T; }
    if (r.boston === "took 13" && st.tricks[t] + st.tricks[t + 2] === 13) { lines.push({ team: t, kind: "boston", pts: 250 }); pts += 250; }
    bags[t] += over;
    while (bags[t] >= r.bagLimit) { bags[t] -= r.bagLimit; lines.push({ team: t, kind: "bagPenalty", pts: -r.bagPenalty }); pts -= r.bagPenalty; }
    score[t] += pts;
  }
  return { lines, totals: { score, bags } };
}

// first to the target wins (ties play on); with "Lose at", a team at or below that score loses at once
export function winner(totals, r) {
  const [a, b] = totals.score, sunk = !!r.loseAt && Math.min(a, b) <= r.loseAt;
  if ((Math.max(a, b) < r.target && !sunk) || a === b) return null;
  return a > b ? 0 : 1;
}

// everything a player at seat could know; never other hands, the seed, or who is human. passed/received: this seat's
// own side of a blind nil exchange
export function view(st, seat) {
  return {
    game: "spades", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn,
    hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), bids: [...st.bids], blind: [...st.blind],
    passed: st.passes[seat] && [...st.passes[seat]], received: st.received[seat] && [...st.received[seat]],
    trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks], history: st.history.map((h) => ({ ...h })),
    broken: st.broken, totals: structuredClone(st.totals),
  };
}
