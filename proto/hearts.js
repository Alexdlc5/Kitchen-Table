// Hearts rules: pure functions over a plain state object. Actions: [3 cards] while passing, a card string while
// playing, "add" | "sub" when the shooter chooses how to score a moon (moon rule "choose"; "auto" picks for them).
import { newDeck, dealHands, winnerIndex, followable, next } from "./cards.js";

export const eff = (c) => c[1];
export const pow = (c) => "23456789TJQKA".indexOf(c[0]) + 2;
export const points = (c, r) => (c[1] === "H" ? 1 : c === "QS" ? 13 : c === "JD" && r.jackDiamonds ? -10 : 0);
const isPoint = (c) => c[1] === "H" || c === "QS";
const DIR = { left: 1, across: 2, right: 3, hold: 0, none: 0 };

export function passDir(rules, handNo) {
  const cycle = rules.passing.split(",");
  return DIR[cycle[handNo % cycle.length]];
}

export function newHand(rules, seed, dealer, totals = { score: [0, 0, 0, 0] }, handNo = 0, cut = 0) {
  const dir = passDir(rules, handNo), hands = dealHands(seed, dealer, newDeck(), cut);
  const st = {
    game: "hearts", rules, seed, dealer, handNo, totals: structuredClone(totals), dir,
    phase: dir ? "pass" : "play", turn: next(dealer), hands, passes: [null, null, null, null], received: [null, null, null, null],
    trick: [], lastTrick: null, tricks: [0, 0, 0, 0], taken: [[], [], [], []], history: [], broken: false, moon: null, moonChoice: null,
  };
  if (!dir) st.turn = hands.findIndex((h) => h.includes("2C"));
  return st;
}

export function legal(st) {
  const r = st.rules, s = st.turn, hand = st.hands[s];
  if (st.phase === "pass") return hand; // choose any 3
  if (st.phase === "moon") return ["add", "sub"];
  if (st.phase !== "play") return [];
  const first = st.history.length < 4;
  if (!st.trick.length) {
    if (!st.history.length) return ["2C"];
    if (r.heartsBroken && !st.broken) {
      const side = hand.filter((c) => c[1] !== "H");
      if (side.length) return side;
    }
    return hand;
  }
  const f = followable(hand, eff(st.trick[0].card), eff);
  if (first && !r.firstTrickPoints) {
    const clean = f.filter((c) => !isPoint(c));
    if (clean.length) return clean;
    const noQ = f.filter((c) => c !== "QS"); // only point cards left: hearts first, the queen last
    if (noQ.length) return noQ;
  }
  return f;
}

export function apply(st, a) {
  const s = st.turn, r = st.rules;
  if (st.phase === "pass") {
    if (a.length !== 3 || a.some((c) => !st.hands[s].includes(c))) throw new Error("pass three of your own cards");
    st.passes[s] = [...a];
    st.turn = next(s);
    if (st.passes.every(Boolean)) {
      st.passes.forEach((p, from) => {
        const to = (from + st.dir) % 4;
        st.hands[from] = st.hands[from].filter((c) => !p.includes(c));
        st.received[to] = [...p];
      });
      st.received.forEach((p, to) => st.hands[to].push(...p));
      st.phase = "play"; st.turn = st.hands.findIndex((h) => h.includes("2C"));
    }
    return st;
  }
  if (st.phase === "moon") { st.moonChoice = a; st.phase = "done"; return st; }
  const hand = st.hands[s], i = hand.indexOf(a);
  if (i < 0) throw new Error(`seat ${s} does not hold ${a}`);
  hand.splice(i, 1);
  if (a[1] === "H" || (a === "QS" && r.queenBreaks)) st.broken = true;
  st.history.push({ seat: s, card: a, n: 13 - hand.length - 1 });
  st.trick.push({ seat: s, card: a });
  if (st.trick.length < 4) { st.turn = next(s); return st; }
  const w = st.trick[winnerIndex(st.trick, eff, pow, null)].seat;
  st.tricks[w]++; st.taken[w].push(...st.trick.map((t) => t.card)); st.lastTrick = st.trick; st.trick = []; st.turn = w;
  if (!hand.length) {
    const shooter = st.taken.findIndex((t) => t.filter(isPoint).length === 14);
    st.phase = "done";
    if (shooter >= 0 && r.moon !== "off") {
      st.moon = shooter;
      if (r.moon === "choose") { st.phase = "moon"; st.turn = shooter; } else st.moonChoice = "add";
      if (r.moon === "auto") { const w = winner(score(st).totals, r); if (w !== null && w !== shooter) st.moonChoice = "sub"; } // add, unless that loses
    }
  }
  return st;
}

export function score(st) {
  const r = st.rules, lines = [], score = [...st.totals.score];
  for (let s = 0; s < 4; s++) {
    let pts = st.taken[s].reduce((n, c) => n + points(c, r), 0);
    if (st.moon !== null) {
      const jd = r.jackDiamonds && st.taken[s].includes("JD") ? -10 : 0;
      if (s === st.moon) pts = jd + (st.moonChoice === "sub" ? -26 : 0);
      else pts = jd + (st.moonChoice === "add" ? 26 : 0);
    }
    lines.push({ seat: s, kind: st.moon === s ? "moon" : "points", choice: st.moon === s ? st.moonChoice : undefined, pts });
    score[s] += pts;
  }
  return { lines, totals: { score } };
}

export function winner(totals, r) {
  const sc = totals.score, lo = Math.min(...sc);
  if (Math.max(...sc) < r.endScore || sc.filter((x) => x === lo).length > 1) return null;
  return sc.indexOf(lo);
}

export function view(st, seat) {
  return {
    game: "hearts", rules: st.rules, seat, dealer: st.dealer, phase: st.phase, turn: st.turn, dir: st.dir,
    hand: [...st.hands[seat]], sizes: st.hands.map((h) => h.length), passed: st.passes[seat] && [...st.passes[seat]],
    received: st.phase !== "pass" && st.received[seat] ? [...st.received[seat]] : null,
    trick: st.trick.map((t) => ({ ...t })), tricks: [...st.tricks], taken: st.taken.map((t) => [...t]),
    history: st.history.map((h) => ({ ...h })), broken: st.broken, moon: st.moon, totals: structuredClone(st.totals),
  };
}
