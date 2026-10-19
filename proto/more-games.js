// The table bits that only Oh Hell and Whist need: names, recipe cards, the bid stepper, the turned trump, score-sheet
// words and what the bots' reasons mean. main.js asks here first and falls back to its own Spades/Hearts code.
import { hookBid } from "./ohhell.js";
import { cardName, SUIT_NAME } from "./art.js";
import { stamp } from "./scenes.js";

export const NAMES = { ohhell: "Oh Hell", whist: "Whist" };
// the closed boxes on the "Coming to the table" shelf: [name on the box, what VoiceOver says]
export const ROADMAP = { cribbage: ["Cribbage", "Cribbage"], ginrummy: ["Gin Rummy", "Gin Rummy"], pinochle: ["Pinochle", "Pinochle"], canasta: ["Canasta", "Canasta and Hand and Foot"] };

export const HOWTO = {
  ohhell: "Everyone plays for themselves. The number of cards changes every hand: down to one each and back up again. After the deal the next card is turned face up, and its suit is trump. Look at your cards and bid exactly how many tricks you'll take; zero is a fine bid. The dealer bids last, and with the hook can't make the bids add up to the tricks, so somebody has to miss. Follow suit if you can; otherwise play anything, and trump beats every other suit. Take exactly your bid to score. With all 52 cards dealt there's nothing left to turn, so that hand has no trump.",
  whist: "Partners sit across. All 52 cards are dealt, and the dealer's last card is turned face up: its suit is trump, and the dealer keeps it to play later. There's no bidding. The player left of the dealer leads. Follow suit if you can, otherwise trump or throw away. Your side's first six tricks are the book; every trick after that is a point. The old manners still win: second hand low, third hand high, cover an honour with an honour, and lead back your partner's suit.",
};
export const SERVES = { ohhell: "about 30 minutes a game", whist: "about 20 minutes a game" };

export const WHY = {
  need_every_trick: "I need every trick that's left.", exact_lead_low: "I have my bid; I led low to stay out of it.",
  over_lead_low: "I'm already past my bid; I led low.", discard_danger: "I threw away a card that could have won a trick I don't want.",
  bid_around_hook: "The hook stopped my count, so I bid one off it.",
  return_partner_lead: "I led back your suit.", draw_trump: "I have plenty of trump, so I drew theirs.",
  lead_top_of_sequence: "I led the top of my run of high cards.", lead_long_suit: "I led from my longest suit.",
  cover_honour: "They led an honour; I covered it with a bigger one.", second_hand_low: "Second hand low: I kept my good cards for later.",
};

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const suitWord = (s) => SUIT_NAME[s];

// spoken when the cards come out
export function handIntro(game, st, names) {
  if (!NAMES[game]) return "";
  const size = game === "ohhell" ? `${plural(st.size, "card")} each. ` : "";
  if (!st.trump) return `${size}No trump this hand.`;
  return `${size}Trump is ${suitWord(st.trump)}: ${game === "whist" ? `${names[st.dealer]} turned` : "the turned card is"} the ${cardName(st.trumpCard)}.`;
}

// the turned card, on the felt by your hand for the whole hand
export function trumpTile(st, svgFor, names) {
  if (st.trump === undefined) return "";
  if (!st.trump) return `<div class="tt none" role="img" aria-label="No trump this hand"><b>No trump</b></div>`;
  const held = st.game === "whist" && st.hands[st.dealer].includes(st.trumpCard) ? `; ${names[st.dealer]} holds it` : "";
  return `<div class="tt" role="img" aria-label="Trump is ${suitWord(st.trump)}. The ${cardName(st.trumpCard)} was turned${held}."><span class="ttc">${svgFor(st.trumpCard)}</span><b>Trump</b></div>`;
}

export function plateStatus(game, st, s) {
  if (game === "ohhell") return st.bids[s] === null ? "" : `<span>Bid ${st.bids[s]}</span><span>took ${st.tricks[s]}</span>`;
  if (game === "whist") return `<span>took ${st.tricks[s]}</span>`;
}

export function bidPrompt(game, st) {
  if (game !== "ohhell") return null;
  const sum = st.bids.reduce((a, b) => a + (b ?? 0), 0), hook = hookBid(st);
  return `Your turn to bid. ${plural(st.size, "card")} each; the bids so far add up to ${sum}.${hook !== null ? ` The hook: you can't bid ${hook}.` : ""}`;
}
export const bidsDone = (game, st) => (game === "ohhell" && st.phase === "play" ? ` The bids add up to ${st.bids.reduce((a, b) => a + b, 0)} for ${plural(st.size, "trick")}.` : "");

// Oh Hell's bid: one stepper whatever the hand size; the hooked number is stepped over, never offered
export function bidPanel(mine, st) {
  const ok = mine.legal.map((a) => a.bid), hook = hookBid(st), dir = mine.dir || 1;
  let v = Math.min(st.size, Math.max(0, mine.step ?? Math.round(st.size / 4)));
  if (!ok.includes(v)) v = ok.includes(v + dir) ? v + dir : v - dir;
  mine.step = v;
  const sum = st.bids.reduce((a, b) => a + (b ?? 0), 0);
  const note = `Bids so far: ${sum} for ${plural(st.size, "trick")}${hook !== null ? `. The hook: you can't bid ${hook}` : ""}.`;
  return `<div class="say">${note}</div><div class="row" style="gap:8px;justify-content:center;flex-wrap:nowrap">
    <button class="btn" data-act="step" data-v="-1" aria-label="One less" ${ok.some((b) => b < v) ? "" : "disabled"}>−</button><b style="font-size:var(--fs-l);min-width:2ch;text-align:center" aria-hidden="true">${v}</b>
    <button class="btn" data-act="step" data-v="1" aria-label="One more" ${ok.some((b) => b > v) ? "" : "disabled"}>+</button><button class="btn big" data-act="bid" data-v="${v}">Bid ${v}</button></div>`;
}

export function sheetLabel(l, who) {
  switch (l.kind) {
    case "exact": return `${who(l)}: bid ${l.bid}, took ${l.took}. Exactly!`;
    case "miss": return `${who(l)}: bid ${l.bid}, took ${l.took}`;
    case "tricks": return `${plural(l.took, "trick")}: ${l.pts} over the book`;
    case "book": return `${plural(l.took, "trick")}: nothing over the book`;
    case "honours": return `Honours: ${l.held} of the four${l.atPoint ? " (one from game: not counted)" : ""}`;
  }
  return null;
}
export function sheetStamp(game, mine) {
  if (game === "ohhell") return mine[0]?.kind === "exact" ? stamp("Exactly!", "#2f7a4f") : stamp("Missed", "#b03a2e");
  if (game === "whist") return mine.some((l) => l.kind === "tricks") ? stamp("Over the book", "#2f7a4f") : "";
  return null;
}
export const goodHand = (game, mine) => (game === "ohhell" ? mine[0]?.kind === "exact" : mine.some((l) => l.pts > 0));
