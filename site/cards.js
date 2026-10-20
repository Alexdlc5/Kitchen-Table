// Cards are two-letter strings: rank (2-9 T J Q K A) + suit (S H D C). Jokers: "BJ" (big), "LJ" (little).
// Shared table mechanics for every trick-taking game; pure, no state.
import { deal, encode, seedBytes, sha256 } from "./dealer.js";

export const SUITS = "SHDC", RANKS = "23456789TJQKA";
export const rankOf = (c) => RANKS.indexOf(c[0]) + 2; // 2..14 (jokers: 1, games give them their own power)
export const next = (seat) => (seat + 1) % 4;
export const partner = (seat) => (seat + 2) % 4;
export const team = (seat) => seat % 2;

export function newDeck(jokers = false) {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return jokers ? d.filter((c) => c !== "2C" && c !== "2H").concat(["LJ", "BJ"]) : d;
}

// The cut is mixed into the shuffle: cut c (1 or more) shuffles from the first 16 bytes of SHA-256(the seed's 16 bytes,
// then the byte c), so every cut is an unrelated deal. Cut 0 (no cut) shuffles from the seed itself.
export function cutSeed(seed, cut) {
  if (!cut) return seed;
  const h = sha256(Uint8Array.of(...seedBytes(seed), cut));
  return encode([0, 8, 16, 24].map((i) => parseInt(h.slice(i, i + 8), 16)));
}

// `size` cards each, round-robin from the dealer's left; `rest` is what's left in order (Euchre's kitty, Oh Hell's
// trump card). Nothing but the seed and the cut decides who gets what.
export function dealOut(seed, dealer, deck, size, cut = 0) {
  if (!Number.isInteger(cut) || cut < 0 || cut >= deck.length) throw new Error(`A cut is 0 to ${deck.length - 1} cards`);
  const p = deal(cutSeed(seed, cut), deck.length), hands = [[], [], [], []];
  p.slice(0, 4 * size).forEach((ci, k) => hands[(dealer + 1 + k) % 4].push(deck[ci]));
  return { hands, rest: p.slice(4 * size).map((ci) => deck[ci]) };
}

// the whole deck, 13 cards each
export function dealHands(seed, dealer, deck, cut = 0) {
  return dealOut(seed, dealer, deck, deck.length / 4, cut).hands;
}

// index into trick of the card winning so far; eff(c) = suit a card plays as, pow(c) = its strength within that suit
export function winnerIndex(trick, eff, pow, trump) {
  let w = 0;
  for (let i = 1; i < trick.length; i++) {
    const a = trick[w].card, b = trick[i].card, sa = eff(a), sb = eff(b);
    if (sb === sa ? pow(b) > pow(a) : sb === trump) w = i;
  }
  return w;
}

export function followable(hand, led, eff) {
  const same = hand.filter((c) => eff(c) === led);
  return same.length ? same : hand;
}

export function sortHand(hand, eff, pow, order = "SHCD") {
  return [...hand].sort((a, b) => order.indexOf(eff(a)) - order.indexOf(eff(b)) || pow(b) - pow(a));
}

// house rules: one preset from sim/generator.json, with any Custom overrides on top
export function rulesFor(cfg, game, preset = "standard", custom = {}) {
  const r = { preset };
  for (const d of cfg.rules[game]) r[d.id] = d.id in custom ? custom[d.id] : d.presets[preset] ?? d.presets.standard;
  return r;
}
