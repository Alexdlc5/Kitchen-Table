// Classic partnership Whist, the ancestor of Bridge: pure functions over a plain state object, same shape as spades.js.
// Partners sit across. The dealer's last card is turned for trump and stays in the dealer's hand. No bidding: the first
// six tricks are the book, and each trick over it scores 1. Honours (A K Q J of trump) score if the house plays them.
import { newDeck, dealHands, winnerIndex, followable, next } from "./cards.js";

export const eff = (c) => c[1];
export const pow = (c) => "23456789TJQKA".indexOf(c[0]) + 2;
export const HONOURS = ["A", "K", "Q", "J"];

export function newHand(rules, seed, dealer, totals = { score: [0, 0] }) {
  const hands = dealHands(seed, dealer, newDeck()), trumpCard = hands[dealer][12]; // the 52nd card dealt goes to the dealer
  return {
    game: "whist", rules, seed, dealer, totals: structuredClone(totals), trumpCard, trump: trumpCard[1],
    phase: "play", turn: next(dealer), hands, dealt: hands.map((h) => [...h]),
    trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [],
  };
}

export function legal(st) {
  if (st.phase !== "play") return [];
  const hand = st.hands[st.turn];
  return st.trick.length ? followable(hand, eff(st.trick[0].card), eff) : hand;
}

export function apply(st, a) {
  const s = st.turn, hand = st.hands[s], i = hand.indexOf(a);
  if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
  hand.splice(i, 1);
  st.history.push({ seat: s, card: a, n: 13 - hand.length - 1 });
  st.trick.push({ seat: s, card: a });
  if (st.trick.length < 4) { st.turn = next(s); return st; }
  const w = st.trick[winnerIndex(st.trick, eff, pow, st.trump)].seat;
  st.tricks[w]++; st.lastTrick = st.trick; st.trick = []; st.turn = w;
  if (!hand.length) st.phase = "done";
  return st;
}

// honours held by a side, as dealt: 4 of them score 4, 3 score 2
export function honoursHeld(st, t) {
  return HONOURS.filter((r) => [t, t + 2].some((s) => st.dealt[s].includes(r + st.trump))).length;
}

// Tricks score first. A side that wins the game on tricks ends it there: the other side's honours don't count. A side
// one point from game ("at the point") can't count honours either; it has to win the last point in tricks.
export function score(st) {
  const r = st.rules, lines = [], score = [...st.totals.score];
  for (const t of [0, 1]) {
    const took = st.tricks[t] + st.tricks[t + 2], pts = Math.max(0, took - 6);
    lines.push({ team: t, kind: pts ? "tricks" : "book", took, pts });
    score[t] += pts;
  }
  if (r.honours && Math.max(...score) < r.target)
    for (const t of [0, 1]) {
      const held = honoursHeld(st, t), pts = held === 4 ? 4 : held === 3 ? 2 : 0;
      if (!pts) continue;
      const atPoint = st.totals.score[t] === r.target - 1;
      lines.push({ team: t, kind: "honours", held, pts: atPoint ? 0 : pts, atPoint });
      if (!atPoint) score[t] = Math.min(score[t] + pts, r.target); // honours can take a side to game, not past it
    }
  return { lines, totals: { score } };
}

export function winner(totals, r) {
  const [a, b] = totals.score;
  if (Math.max(a, b) < r.target || a === b) return null;
  return a > b ? 0 : 1;
}

// trumpCard is public: everyone saw it turned, and it stays in the dealer's hand until played
export function view(st, seat) {
  return {
    game: "whist", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn, trump: st.trump, trumpCard: st.trumpCard,
    hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks],
    history: st.history.map((h) => ({ ...h })), totals: structuredClone(st.totals),
  };
}
