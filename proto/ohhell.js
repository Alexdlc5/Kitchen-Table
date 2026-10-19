// Oh Hell (Up and Down the River): pure functions over a plain state object, same shape as spades.js.
// Every player for themselves. The hand size walks a sequence (13 down to 1 and back, ...); after the deal the next card
// is turned for trump (none when all 52 are dealt). Bid exactly what you'll take. Actions: {bid} while bidding, a card.
import { deal } from "./dealer.js";
import { newDeck, winnerIndex, followable, next } from "./cards.js";

export const eff = (c) => c[1];
export const pow = (c) => "23456789TJQKA".indexOf(c[0]) + 2;

// "13 → 1 → 13" → [13, 12, ..., 1, 2, ..., 13]; "1 → 7" → [1, ..., 7]
export function sequence(rules) {
  const pts = rules.sequence.split("→").map(Number), out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const d = Math.sign(pts[i] - pts[i - 1]); for (let n = pts[i - 1] + d; n !== pts[i] + d; n += d) out.push(n); }
  return out;
}
// a tie for first after the last hand plays on at the last size
export const handSize = (rules, handNo) => { const s = sequence(rules); return s[Math.min(handNo, s.length - 1)]; };

export function newHand(rules, seed, dealer, totals = { score: [0, 0, 0, 0], hands: 0 }, handNo = 0) {
  const size = handSize(rules, handNo), deck = newDeck(), p = deal(seed, 52), hands = [[], [], [], []];
  for (let k = 0; k < 4 * size; k++) hands[(dealer + 1 + k) % 4].push(deck[p[k]]); // round-robin from the dealer's left
  const trumpCard = 4 * size < 52 ? deck[p[4 * size]] : null;
  return {
    game: "ohhell", rules, seed, dealer, handNo, size, totals: structuredClone(totals), trumpCard, trump: trumpCard && trumpCard[1],
    phase: "bid", turn: next(dealer), hands, bids: [null, null, null, null],
    trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [], broken: false,
  };
}

// the dealer's hook: the number the dealer may not bid (bids would add up to the tricks), or null
export function hookBid(st) {
  if (!st.rules.hook || st.turn !== st.dealer || st.phase !== "bid") return null;
  const left = st.size - st.bids.reduce((a, b) => a + (b ?? 0), 0);
  return left >= 0 ? left : null;
}

export function legal(st) {
  const s = st.turn;
  if (st.phase === "bid") {
    const hook = hookBid(st), out = [];
    for (let n = 0; n <= st.size; n++) if (n !== hook) out.push({ bid: n });
    return out;
  }
  if (st.phase !== "play") return [];
  const hand = st.hands[s];
  if (!st.trick.length) {
    if (st.rules.trumpBroken && st.trump && !st.broken) { const side = hand.filter((c) => c[1] !== st.trump); if (side.length) return side; }
    return hand;
  }
  return followable(hand, eff(st.trick[0].card), eff);
}

export function apply(st, a) {
  const s = st.turn;
  if (st.phase === "bid") {
    if (!legal(st).some((x) => x.bid === a.bid)) throw new Error(`seat ${s} may not bid ${a.bid}`);
    st.bids[s] = a.bid; st.turn = next(s);
    if (st.bids.every((b) => b !== null)) { st.phase = "play"; st.turn = next(st.dealer); }
    return st;
  }
  const hand = st.hands[s], i = hand.indexOf(a);
  if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
  hand.splice(i, 1);
  if (a[1] === st.trump) st.broken = true;
  st.history.push({ seat: s, card: a, n: st.size - hand.length - 1 });
  st.trick.push({ seat: s, card: a });
  if (st.trick.length < 4) { st.turn = next(s); return st; }
  const w = st.trick[winnerIndex(st.trick, eff, pow, st.trump)].seat;
  st.tricks[w]++; st.lastTrick = st.trick; st.trick = []; st.turn = w;
  if (!hand.length) st.phase = "done";
  return st;
}

// one line per seat. "exact": bid made on the nose; "miss": over or under
export function points(rules, bid, took) {
  const exact = bid === took;
  if (rules.scoring === "1 a trick + 10") return took + (exact ? 10 : 0);
  if (rules.scoring === "minus misses") return exact ? 10 + bid : -10 * Math.abs(took - bid);
  return exact ? 10 + bid : 0; // "10 + tricks"
}
export function score(st) {
  const lines = [], score = [...st.totals.score];
  for (let s = 0; s < 4; s++) {
    const bid = st.bids[s], took = st.tricks[s], pts = points(st.rules, bid, took);
    lines.push({ seat: s, kind: bid === took ? "exact" : "miss", bid, took, pts });
    score[s] += pts;
  }
  return { lines, totals: { score, hands: (st.totals.hands || 0) + 1 } };
}

// after the last hand of the sequence, the high score wins; a tie for first plays another hand
export function winner(totals, r) {
  if ((totals.hands || 0) < sequence(r).length) return null;
  const sc = totals.score, hi = Math.max(...sc);
  return sc.filter((x) => x === hi).length > 1 ? null : sc.indexOf(hi);
}

export function view(st, seat) {
  return {
    game: "ohhell", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn, handNo: st.handNo, size: st.size,
    trump: st.trump, trumpCard: st.trumpCard, hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), bids: [...st.bids],
    trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks], history: st.history.map((h) => ({ ...h })),
    broken: st.broken, totals: structuredClone(st.totals),
  };
}
