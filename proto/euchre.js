// Euchre rules: pure functions over a plain state object, the same shape as spades.js. 24 cards, nine to ace. The jack
// of trump is the right bower, the other jack of the same colour is the left bower and plays as trump.
// Phases and actions: "farmer" {swap: [3 cards] | null} (farmer's hand), "bid1" {call: "pass" | "order", alone?},
// "bid2" {call: "pass" | suit, alone?}, "discard" a card (the dealer, after picking up), "defend" {defend: bool}
// (defend alone), "play" a card string. A hand everyone passes twice ends with no maker (thrown in).
import { deal } from "./dealer.js";
import { SUITS, winnerIndex, followable, next, partner, team } from "./cards.js";

export const DECK = [...SUITS].flatMap((s) => [..."9TJQKA"].map((r) => r + s));
export const MATE = { S: "C", C: "S", H: "D", D: "H" };
export const isLeft = (c, t) => !!t && c[0] === "J" && c[1] === MATE[t];
export const eff = (c, t) => (isLeft(c, t) ? t : c[1]);
export const pow = (c, t) => (t && c === "J" + t ? 30 : isLeft(c, t) ? 29 : "9TJQKA".indexOf(c[0]) + 9);
export const isFarmer = (hand) => hand.every((c) => c[0] === "9" || c[0] === "T");
const combos = (a, k) => (k ? a.flatMap((x, i) => combos(a.slice(i + 1), k - 1).map((c) => [x, ...c])) : [[]]);
const nextIn = (st, s) => { do s = next(s); while (st.out.includes(s)); return s; };

// five cards each, round-robin from the dealer's left; the last four are the kitty, its top card turned up
export function newHand(rules, seed, dealer, totals = { score: [0, 0] }, handNo = 0) {
  const p = deal(seed, 24), hands = [[], [], [], []];
  p.slice(0, 20).forEach((ci, k) => hands[(dealer + 1 + k) % 4].push(DECK[ci]));
  const kitty = p.slice(20).map((ci) => DECK[ci]);
  const st = {
    game: "euchre", rules, seed, dealer, handNo, totals: structuredClone(totals),
    phase: "bid1", turn: next(dealer), hands, kitty, up: kitty[0], trump: null, maker: null, alone: false, defender: null, out: [],
    calls: [], farmers: [], discard: null, trick: [], lastTrick: null, tricks: [0, 0, 0, 0], history: [],
  };
  if (rules.farmersHand) st.farmers = [1, 2, 3, 4].map((k) => (dealer + k) % 4).filter((s) => isFarmer(hands[s]));
  if (st.farmers.length) { st.phase = "farmer"; st.turn = st.farmers[0]; }
  return st;
}

export function legal(st) {
  const s = st.turn, r = st.rules, hand = st.hands[s];
  switch (st.phase) {
    case "farmer": return [{ swap: null }, ...combos(hand, 3).map((swap) => ({ swap }))];
    case "bid1":
      if (r.canadianLoner && s === partner(st.dealer)) return [{ call: "pass" }, { call: "order", alone: true }];
      return [{ call: "pass" }, { call: "order" }, { call: "order", alone: true }];
    case "bid2": {
      const out = s === st.dealer && r.stickDealer ? [] : [{ call: "pass" }];
      for (const t of SUITS) if (t !== st.up[1]) out.push({ call: t }, { call: t, alone: true });
      return out;
    }
    case "discard": return hand;
    case "defend": return [{ defend: false }, { defend: true }];
    case "play":
      if (!st.trick.length) return hand;
      return followable(hand, eff(st.trick[0].card, st.trump), (c) => eff(c, st.trump));
  }
  return [];
}

function startPlay(st) {
  st.phase = "play";
  let lead = st.rules.lonerLeft && st.alone ? next(st.maker) : next(st.dealer);
  while (st.out.includes(lead)) lead = next(lead);
  st.turn = lead;
  return st;
}
function afterCall(st) {
  if (st.alone && st.rules.defendAlone) { st.phase = "defend"; st.turn = next(st.maker); return st; }
  return startPlay(st);
}

export function apply(st, a) {
  const s = st.turn;
  if (st.phase === "farmer") {
    if (a.swap) {
      if (a.swap.length !== 3 || a.swap.some((c) => !st.hands[s].includes(c))) throw new Error("swap three of your own cards");
      const under = st.kitty.splice(1, 3, ...a.swap); // the three face-down cards; the upcard stays put
      st.hands[s] = st.hands[s].filter((c) => !a.swap.includes(c)).concat(under);
    }
    st.farmers.shift();
    if (st.farmers.length) st.turn = st.farmers[0]; else { st.phase = "bid1"; st.turn = next(st.dealer); }
    return st;
  }
  if (st.phase === "bid1" || st.phase === "bid2") {
    st.calls.push({ seat: s, round: st.phase === "bid1" ? 1 : 2, call: a.call, alone: !!a.alone });
    if (a.call === "pass") {
      if (s !== st.dealer) st.turn = next(s);
      else if (st.phase === "bid1") { st.phase = "bid2"; st.turn = next(s); }
      else st.phase = "done"; // passed twice around: thrown in
      return st;
    }
    st.trump = a.call === "order" ? st.up[1] : a.call; st.maker = s; st.alone = !!a.alone;
    if (st.alone) st.out = [partner(s)];
    if (a.call === "order" && !st.out.includes(st.dealer)) { // the dealer picks up the upcard and discards
      st.hands[st.dealer].push(st.kitty.shift());
      st.phase = "discard"; st.turn = st.dealer;
      return st;
    }
    return afterCall(st);
  }
  if (st.phase === "discard") {
    const i = st.hands[s].indexOf(a);
    if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
    st.hands[s].splice(i, 1); st.kitty.push(a); st.discard = a;
    return afterCall(st);
  }
  if (st.phase === "defend") {
    st.calls.push({ seat: s, defend: !!a.defend });
    if (a.defend) { st.defender = s; st.out.push(partner(s)); return startPlay(st); }
    if (st.calls.filter((c) => "defend" in c).length === 2) return startPlay(st);
    st.turn = partner(s);
    return st;
  }
  const hand = st.hands[s], i = hand.indexOf(a);
  if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
  hand.splice(i, 1);
  st.history.push({ seat: s, card: a, n: st.tricks.reduce((x, y) => x + y, 0) });
  st.trick.push({ seat: s, card: a });
  if (st.trick.length < 4 - st.out.length) { st.turn = nextIn(st, s); return st; }
  const w = st.trick[winnerIndex(st.trick, (c) => eff(c, st.trump), (c) => pow(c, st.trump), st.trump)].seat;
  st.tricks[w]++; st.lastTrick = st.trick; st.trick = []; st.turn = w;
  if (!hand.length) st.phase = "done";
  return st;
}

// one line per hand: who scored, how, and how many tricks the makers took
export function score(st) {
  const r = st.rules, score = [...st.totals.score];
  if (st.maker === null) return { lines: [{ team: null, kind: "thrown", pts: 0 }], totals: { score } };
  const m = team(st.maker), took = st.tricks[m] + st.tricks[m + 2];
  const line = took === 5 ? { team: m, kind: st.alone ? "lonerMarch" : "march", pts: st.alone ? r.aloneScore : 2 }
    : took >= 3 ? { team: m, kind: st.alone ? "loner" : "made", pts: 1 }
    : { team: 1 - m, kind: st.defender !== null ? "loneEuchre" : "euchre", pts: st.defender !== null ? 4 : 2 };
  score[line.team] += line.pts;
  return { lines: [{ ...line, seat: st.maker, trump: st.trump, alone: st.alone, defender: st.defender, took }], totals: { score } };
}

export function winner(totals, r) {
  const [a, b] = totals.score;
  if (Math.max(a, b) < r.target || a === b) return null;
  return a > b ? 0 : 1;
}

// everything a player at seat could know: the upcard, every call, the cards played. The dealer also knows the discard.
export function view(st, seat) {
  return {
    game: "euchre", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn,
    hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), up: st.up, trump: st.trump, maker: st.maker, alone: st.alone,
    defender: st.defender, out: [...st.out], calls: st.calls.map((c) => ({ ...c })), discard: seat === st.dealer ? st.discard : null,
    trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks], history: st.history.map((h) => ({ ...h })), totals: structuredClone(st.totals),
  };
}
