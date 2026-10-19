// Card faces, backs and table surfaces as SVG strings (docs/TABLE.md). Vector, so they stay crisp at any size,
// in the store screenshots and in Comfort mode. Cards are the brightest thing on screen: pure colours, no haze, no grain.
import { curve, ring, shape, mix } from "./paint.js";

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
      `<text x="8" y="30" font-family="Grandstander, Fredoka, sans-serif" font-weight="700" font-size="20" fill="${col}" writing-mode="tb" letter-spacing="1">JOKER</text>` +
      `<text x="50" y="128" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="13" fill="${col}">${c === "BJ" ? "BIG" : "LITTLE"}</text></svg>`;
  }
  const s = c[1], col = (four ? COLORS.four : COLORS.two)[s], r = label(c);
  const idx = (flip) => `<g ${flip ? `transform="rotate(180 50 70)"` : ""}><text x="${r === "10" ? 5 : 9}" y="33" font-family="Fredoka, sans-serif" font-weight="700" font-size="${r === "10" ? 28 : 31}" fill="${col}" letter-spacing="${r === "10" ? -2 : 0}">${r}</text>${pip(s, 20, 47, 22, col)}</g>`;
  let mid;
  if ("JQK".includes(c[0])) {
    const panel = mix(col, "#ffffff", 0.82), d = curve(ring(56, 76, 30, 42, 14, 0.06, c.charCodeAt(0) + c.charCodeAt(1)));
    mid = shape(d, panel, mix(col, "#ffffff", 0.55)) + `<text x="56" y="92" text-anchor="middle" font-family="Grandstander, Fredoka, sans-serif" font-weight="700" font-size="46" fill="${col}">${c[0]}</text>` + pip(s, 56, 108, 18, col);
  } else mid = pip(s, 57, 80, c[0] === "A" ? 52 : 40, col);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${base}${mid}${idx(false)}${idx(true)}</svg>`;
}

// card backs: a painted lattice inside a cream border. More come in the cosmetic packs (DESIGN.md §12)
export const BACKS = {
  classic: { name: "Kitchen red", base: "#9c1f2b", ink: "#c43a45" },
  navy: { name: "Sunday navy", base: "#1d3561", ink: "#33558f" },
  quilt: { name: "Quilt", base: "#7a4a2a", ink: "#c98b4d", pack: "backs_porch" },
  lake: { name: "Lake cabin", base: "#245a5c", ink: "#3f8c8a", pack: "backs_porch" },
  fair: { name: "County fair", base: "#b8462f", ink: "#f0b543", pack: "backs_porch" },
  corn: { name: "Corn row", base: "#6d6a24", ink: "#c9b63c", pack: "backs_porch" },
  jukebox: { name: "Jukebox", base: "#5a2a6e", ink: "#e05c8a", pack: "backs_porch" },
  lighthouse: { name: "Lighthouse", base: "#2b4a7a", ink: "#e9e1cc", pack: "backs_porch" },
};
export function back(id = "classic") {
  const b = BACKS[id] || BACKS.classic;
  let lattice = "";
  for (let i = -6; i < 14; i++) lattice += `<path d="M${i * 12} 18 L${i * 12 + 104} 122 M${i * 12 + 104} 18 L${i * 12} 122" stroke="${b.ink}" stroke-width="3" opacity=".75"/>`;
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="bk${id}"><rect x="10" y="10" width="80" height="120" rx="5"/></clipPath></defs>` +
    `<rect x="1" y="1" width="98" height="138" rx="9" fill="#f6ead0" stroke="#c9bfa8" stroke-width="1.5"/><rect x="10" y="10" width="80" height="120" rx="5" fill="${b.base}"/>` +
    `<g clip-path="url(#bk${id})">${lattice}</g><path d="${PIP.H}" transform="translate(38 58) scale(.24)" fill="#f6ead0" opacity=".9"/></svg>`;
}

// table surfaces: CSS backgrounds (a lamp pool over felt or wood); the haze stays off the cards because cards sit above
export const FELTS = {
  green: { name: "Green felt", bg: "radial-gradient(ellipse at 50% 42%, #3d7d52 0%, #2f6b45 45%, #245638 80%, #1b4029 100%)" },
  oak: { name: "Oak kitchen table", bg: "radial-gradient(ellipse at 50% 42%, #c08a52 0%, #a5713e 50%, #7d5228 100%)", pack: "felts_home" },
  porch: { name: "Porch boards", bg: "repeating-linear-gradient(90deg, #8f7a5c 0 46px, #7d6a4f 46px 48px), radial-gradient(ellipse at 50% 42%, #a08a6a, #6e5c42)", pack: "felts_home" },
  diner: { name: "Diner formica", bg: "radial-gradient(ellipse at 50% 42%, #f4e6c4 0%, #e7cf9f 60%, #c9ad78 100%)", pack: "felts_home" },
  plaid: { name: "Cabin plaid", bg: "repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 18px, transparent 18px 36px), repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 18px, transparent 18px 36px), radial-gradient(ellipse at 50% 42%, #b0423a, #7a2620)", pack: "felts_home" },
};
