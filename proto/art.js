// Card faces as SVG strings (docs/TABLE.md); table themes and card backs are in themes.js. Vector, so they stay crisp at any size,
// in the store screenshots and in Comfort mode. Cards are the brightest thing on screen: pure colours, no haze, no grain.
import { curve, ring, shape, mix, stroke, rng } from "./paint.js";

export const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME = { T: "10", J: "jack", Q: "queen", K: "king", A: "ace" };
export const cardName = (c) => (c === "BJ" ? "big joker" : c === "LJ" ? "little joker" : `${RANK_NAME[c[0]] || c[0]} of ${SUIT_NAME[c[1]]}`);
const COLORS = { two: { S: "#16181d", C: "#16181d", H: "#d0182f", D: "#d0182f" }, four: { S: "#16181d", C: "#13894a", H: "#d0182f", D: "#1f5fd6" } };

// suit pips drawn in a 100x100 box, so they never depend on a font
export const PIP = {
  H: "M50 90 C24 70 6 52 6 32 C6 17 17 7 30 7 C40 7 47 13 50 21 C53 13 60 7 70 7 C83 7 94 17 94 32 C94 52 76 70 50 90Z",
  D: "M50 4 C60 20 74 36 90 50 C74 64 60 80 50 96 C40 80 26 64 10 50 C26 36 40 20 50 4Z",
  S: "M50 5 C58 22 92 38 92 60 C92 74 81 82 69 82 C61 82 56 78 53 73 C54 82 58 89 67 95 L33 95 C42 89 46 82 47 73 C44 78 39 82 31 82 C19 82 8 74 8 60 C8 38 42 22 50 5Z",
  // three round lobes and a flared stem (round arcs, so the club never looks pinched at any size)
  C: "M50 8 a19 19 0 1 1 0 38 a19 19 0 1 1 0 -38Z M27 37 a19 19 0 1 1 0 38 a19 19 0 1 1 0 -38Z M73 37 a19 19 0 1 1 0 38 a19 19 0 1 1 0 -38Z M50 40 a12 12 0 1 1 0 24 a12 12 0 1 1 0 -24Z M46 56 L54 56 C55 74 59 86 68 95 L32 95 C41 86 45 74 46 56Z",
};
const pip = (s, x, y, size, col) => `<path d="${PIP[s]}" fill="${col}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})"/>`;
const label = (c) => (c[0] === "T" ? "10" : c[0]);

// face: 100 x 140. Big corner index (rank over suit) for reading at a glance. Everything else stays in the clear centre
// column (x 32-68) between the two indices, so nothing ever sits on a rank or suit (scripts/check-cards.mjs)
export function face(c, { four = false } = {}) {
  const W = 100, H = 140, cream = "#fffdf7";
  const base = `<rect x="1" y="1" width="98" height="138" rx="9" fill="${cream}" stroke="#c9bfa8" stroke-width="1.5"/>`;
  if (c === "BJ" || c === "LJ") {
    const col = c === "BJ" ? "#d0182f" : "#16181d", star = curve(ring(50, 70, 26, 26, 10, 0, 3).map(([x, y], i) => (i % 2 ? [50 + (x - 50) * 0.45, 70 + (y - 70) * 0.45] : [x, y])));
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${base}<path d="${star}" fill="${col}"/>` +
      `<g data-idx>${[..."JOKER"].map((ch, i) => `<text x="14" y="${24 + i * 16}" text-anchor="middle" font-family="Alegreya Sans, system-ui, sans-serif" font-weight="700" font-size="16" fill="${col}">${ch}</text>`).join("")}</g>` +
      `<text x="50" y="128" text-anchor="middle" font-family="Alegreya Sans, system-ui, sans-serif" font-weight="700" font-size="13" fill="${col}">${c === "BJ" ? "BIG" : "LITTLE"}</text></svg>`;
  }
  const s = c[1], col = (four ? COLORS.four : COLORS.two)[s], r = label(c);
  const idx = (flip) => `<g data-idx ${flip ? `transform="rotate(180 50 70)"` : ""}><text x="${r === "10" ? 5 : 9}" y="33" font-family="Alegreya Sans, system-ui, sans-serif" font-weight="700" font-size="${r === "10" ? 28 : 31}" fill="${col}" letter-spacing="${r === "10" ? -2 : 0}">${r}</text>${pip(s, 20, 47, 22, col)}</g>`;
  let mid;
  if ("JQK".includes(c[0])) {
    // a framed court portrait: cream panel, brass rule, a crown (K), a tiara (Q) or a feathered cap (J), the letter, the suit
    const brass = "#b8903f", hat = {
      K: `<path d="M38 45 L36 29 L43 36 L50 25 L57 36 L64 29 L62 45Z" fill="${brass}"/><rect x="38" y="43" width="24" height="4" rx="1" fill="${mix(brass, "#000000", 0.25)}"/><circle cx="50" cy="38" r="2.4" fill="${col}"/>`,
      Q: `<path d="M38 45 C38 37 41 33 44 31 C45 35 47 36 50 30 C53 36 55 35 56 31 C59 33 62 37 62 45Z" fill="${brass}"/>` + [40, 44.5, 50, 55.5, 60].map((x, i) => `<circle cx="${x}" cy="${[33, 30, 27, 30, 33][i]}" r="1.8" fill="#fbf3dc"/>`).join("") + `<circle cx="50" cy="40" r="2.4" fill="${col}"/>`,
      J: `<path d="M38 46 C38 37 43 33 50 33 C57 33 62 37 62 46Z" fill="${col}"/><path d="M38 46 L62 46" stroke="${brass}" stroke-width="3"/><path d="M53 34 C56 28 59 25 62 23 C60 27 58 31 55 35Z" fill="${brass}"/>`,
    }[c[0]];
    mid = `<rect x="34" y="16" width="32" height="108" rx="5" fill="#f6ecd4" stroke="${brass}" stroke-width="1.5"/><rect x="37" y="19" width="26" height="102" rx="3" fill="none" stroke="${mix(col, "#ffffff", 0.45)}" stroke-width="1"/>` +
      hat + `<text x="50" y="82" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="700" font-size="30" fill="${col}">${c[0]}</text>` + pip(s, 50, 100, 15, col);
  } else mid = pip(s, 50, 70, c[0] === "A" ? 38 : 34, col);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${base}${mid}${idx(false)}${idx(true)}</svg>`;
}

// the title's still life around the four aces: a teacup on its saucer, cookies on a plate, a score pad and pencil.
// Painted like everything else (tinted shadow side, warm light from the top left, a soft contact shadow under each prop).
export function titleProps() {
  const shade = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#1a0c04" opacity=".32" filter="url(#tpBlur)"/>`;
  const china = "#f7f1e6", rim = "#c9a45c";
  // teacup and saucer (left)
  const cup = shade(70, 178, 58, 12) +
    shape(curve(ring(70, 168, 56, 14, 18, 0.02, 4)), china, mix(china, "#5a3a20", 0.35)) +
    `<ellipse cx="70" cy="166" rx="44" ry="9" fill="none" stroke="${rim}" stroke-width="1.6" opacity=".9"/>` +
    shape(curve([[34, 118], [106, 118], [100, 150], [86, 164], [54, 164], [40, 150]]), china, mix(china, "#5a3a20", 0.35)) +
    `<path d="M105 128 C124 126 126 150 102 152" fill="none" stroke="${mix(china, "#5a3a20", 0.3)}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M105 128 C121 127 122 148 102 150" fill="none" stroke="${china}" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="70" cy="118" rx="36" ry="8" fill="#6b3f22"/><ellipse cx="66" cy="117" rx="20" ry="3" fill="#8a5a34" opacity=".7"/>` +
    `<path d="M36 118 L104 118" stroke="${rim}" stroke-width="2"/><path d="M42 140 C60 146 82 146 98 140" stroke="${rim}" stroke-width="1.4" fill="none" opacity=".8"/>` +
    `<g class="steam">` + stroke(60, 104, -1.75, 26, 2.2, "#fff", 0.35, 0.35) + `</g><g class="steam s2">` + stroke(78, 102, -1.4, 22, 1.8, "#fff", 0.28, -0.4) + `</g>`;
  // cookies on a plate (right)
  const r = rng(5);
  let cookies = "";
  for (const [x, y, k] of [[318, 164, 1], [348, 156, 0.9], [334, 140, 0.95]]) {
    cookies += shape(curve(ring(x, y, 20 * k, 15 * k, 12, 0.08, x)), "#d39a5a", "#8a5a30") + `<path d="${curve(ring(x - 4, y - 4, 10 * k, 6 * k, 9, 0.2, y))}" fill="#e3b277" opacity=".6"/>`;
    for (let i = 0; i < 4; i++) cookies += `<path d="${curve(ring(x - 10 + r() * 20, y - 6 + r() * 12, 2.6, 2.2, 7, 0.3, x + i))}" fill="#4a2a16"/>`;
  }
  const plate = shade(336, 182, 66, 12) + shape(curve(ring(336, 168, 64, 18, 20, 0.02, 9)), china, mix(china, "#5a3a20", 0.35)) +
    `<ellipse cx="336" cy="166" rx="50" ry="12" fill="none" stroke="${rim}" stroke-width="1.6" opacity=".9"/>` + cookies;
  // score pad and pencil (front)
  const pad = shade(200, 226, 70, 8) + shape("M138 197 L262 192 Q265 192 265 195 L267 227 Q267 230 264 230 L142 233 Q139 233 139 230 Z", "#fbf6ea", "#8f7a5a") +
    [0, 1, 2].map((i) => `<path d="M146 ${206 + i * 8} L256 ${203 + i * 8}" stroke="#b9c6d6" stroke-width="1"/>`).join("") +
    `<path d="M196 197 L198 230" stroke="#d98585" stroke-width="1"/>` +
    `<text x="152" y="212" font-family="Alegreya, Georgia, serif" font-style="italic" font-size="9" fill="#5a4a3a" transform="rotate(-1.5 152 212)">Us 320 · Them 285</text>` +
    shape(curve([[168, 236], [292, 214], [296, 220], [172, 242]]), "#e2b24a", "#8a6420") + `<path d="M292 214 L306 214 L296 220Z" fill="#e8c9a0"/><path d="M302 214 L306 214 L303 216Z" fill="#3a3a3a"/>` +
    `<path d="M168 236 L160 238 L164 244 L172 242Z" fill="#d98a9a"/>`;
  return `<svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><filter id="tpBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs>${cup}${plate}${pad}</svg>`;
}
