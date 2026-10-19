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
  C: "M50 6 C61 6 70 15 70 26 C70 33 67 38 63 42 C67 40 71 39 75 39 C86 39 95 48 95 59 C95 70 86 79 75 79 C66 79 59 74 55 67 C56 80 60 88 67 95 L33 95 C40 88 44 80 45 67 C41 74 34 79 25 79 C14 79 5 70 5 59 C5 48 14 39 25 39 C29 39 33 40 37 42 C33 38 30 33 30 26 C30 15 39 6 50 6Z",
};
const pip = (s, x, y, size, col) => `<path d="${PIP[s]}" fill="${col}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})"/>`;
const label = (c) => (c[0] === "T" ? "10" : c[0]);

// face: 100 x 140. Big corner index (rank over suit) for reading at a glance; a large centre pip; courts get a painted panel
export function face(c, { four = false } = {}) {
  const W = 100, H = 140, cream = "#fffdf7";
  const base = `<rect x="1" y="1" width="98" height="138" rx="9" fill="${cream}" stroke="#c9bfa8" stroke-width="1.5"/>`;
  if (c === "BJ" || c === "LJ") {
    const col = c === "BJ" ? "#d0182f" : "#16181d", star = curve(ring(50, 70, 26, 26, 10, 0, 3).map(([x, y], i) => (i % 2 ? [50 + (x - 50) * 0.45, 70 + (y - 70) * 0.45] : [x, y])));
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${base}<path d="${star}" fill="${col}"/>` +
      `<text x="8" y="30" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="20" fill="${col}" writing-mode="tb" letter-spacing="1">JOKER</text>` +
      `<text x="50" y="128" text-anchor="middle" font-family="Figtree, system-ui, sans-serif" font-weight="700" font-size="13" fill="${col}">${c === "BJ" ? "BIG" : "LITTLE"}</text></svg>`;
  }
  const s = c[1], col = (four ? COLORS.four : COLORS.two)[s], r = label(c);
  const idx = (flip) => `<g ${flip ? `transform="rotate(180 50 70)"` : ""}><text x="${r === "10" ? 5 : 9}" y="33" font-family="Figtree, system-ui, sans-serif" font-weight="700" font-size="${r === "10" ? 28 : 31}" fill="${col}" letter-spacing="${r === "10" ? -2 : 0}">${r}</text>${pip(s, 20, 47, 22, col)}</g>`;
  let mid;
  if ("JQK".includes(c[0])) {
    const panel = mix(col, "#ffffff", 0.82), d = curve(ring(56, 76, 30, 42, 14, 0.06, c.charCodeAt(0) + c.charCodeAt(1)));
    mid = shape(d, panel, mix(col, "#ffffff", 0.55)) + `<text x="56" y="92" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="46" fill="${col}">${c[0]}</text>` + pip(s, 56, 108, 18, col);
  } else mid = pip(s, 57, 80, c[0] === "A" ? 52 : 40, col);
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
    `<text x="152" y="212" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="9" fill="#5a4a3a" transform="rotate(-1.5 152 212)">Us 320 · Them 285</text>` +
    shape(curve([[168, 236], [292, 214], [296, 220], [172, 242]]), "#e2b24a", "#8a6420") + `<path d="M292 214 L306 214 L296 220Z" fill="#e8c9a0"/><path d="M302 214 L306 214 L303 216Z" fill="#3a3a3a"/>` +
    `<path d="M168 236 L160 238 L164 244 L172 242Z" fill="#d98a9a"/>`;
  return `<svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><filter id="tpBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs>${cup}${plate}${pad}</svg>`;
}
