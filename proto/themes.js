// Table themes: a surface, a card back and an accent palette. All procedural (CSS + SVG), so every theme renders its
// own shop preview and store screenshot at any size. Card faces never change: they stay crisp and readable.
// Tiers and prices live in sim/generator.json → themes; this file only paints.
import { curve, ring, rng, mix } from "./paint.js";

const svgURL = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;
const lamp = (a = 0.28) => `radial-gradient(ellipse 70% 55% at 50% 38%, rgba(255,222,170,${a}), transparent 70%)`;
const vignette = (a = 0.5) => `radial-gradient(ellipse 120% 90% at 50% 45%, transparent 55%, rgba(20,10,4,${a}) 100%)`;
const felt = (c) => `${lamp(0.18)}, radial-gradient(ellipse at 50% 42%, ${mix(c, "#ffffff", 0.12)} 0%, ${c} 50%, ${mix(c, "#000000", 0.35)} 100%)`;
const hexRGB = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
function grain(base, dark) { // stretched fractal noise tinted to the wood, with soft plank seams
  const [r, g, b] = hexRGB(dark);
  const tile = svgURL(360, 360, `<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".09 .006" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 .9 -.22"/></filter><rect width="360" height="360" filter="url(#g)"/><rect x="179" width="1.5" height="360" fill="${dark}" opacity=".35"/>`);
  return `${tile}, linear-gradient(180deg, ${mix(base, "#ffffff", 0.06)}, ${base})`;
}
const frame = (inner, outer, w = 10) => `inset 0 0 0 ${w}px ${outer}, inset 0 0 0 ${w + 2}px ${inner}`;

// ---------------------------------------------------------------- patterns (SVG tiles)
function leopard(seed = 7) {
  const r = rng(seed); let s = "";
  for (let i = 0; i < 26; i++) {
    const x = r() * 220, y = r() * 220, rx = 9 + r() * 8, ry = 7 + r() * 6, rot = r() * 3;
    s += `<path d="${curve(ring(x, y, rx * 0.55, ry * 0.55, 9, 0.25, seed + i, rot))}" fill="#b4793c"/>`;
    for (let k = 0; k < 4; k++) { const a = rot + k * 1.6 + r() * 0.5; s += `<path d="${curve(ring(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 4 + r() * 3, 2.5 + r() * 2, 8, 0.35, seed * 7 + i * 4 + k, a))}" fill="#2a1a10"/>`; }
  }
  return svgURL(220, 220, `<rect width="220" height="220" fill="#d9a86a"/>${s}`);
}
function roses(seed = 3) { // chintz: soft cabbage roses and leaves on linen
  const r = rng(seed); let s = "";
  for (let i = 0; i < 7; i++) {
    const x = 20 + r() * 200, y = 20 + r() * 200, k = 0.8 + r() * 0.5;
    for (let l = 0; l < 3; l++) { const a = r() * 6.3; s += `<path d="${curve(ring(x + Math.cos(a) * 20 * k, y + Math.sin(a) * 20 * k, 12 * k, 5 * k, 8, 0.2, seed + i * 9 + l, a))}" fill="#9fb48c" opacity=".85"/>`; }
    s += `<path d="${curve(ring(x, y, 16 * k, 15 * k, 12, 0.18, seed + i))}" fill="#e9a9a6"/><path d="${curve(ring(x + 2, y - 1, 10 * k, 9 * k, 10, 0.25, seed + i + 50))}" fill="#d98583"/><path d="${curve(ring(x + 3, y - 2, 4.5 * k, 4 * k, 8, 0.3, seed + i + 90))}" fill="#c4686a"/>`;
  }
  return svgURL(240, 240, `<rect width="240" height="240" fill="#efe6d6"/>${s}`);
}
function atomic() { // mid-century starbursts and boomerangs
  const star = (x, y, r, c) => Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a) * r}" y2="${y + Math.sin(a) * r}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`; }).join("") + `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`;
  return svgURL(200, 200, `<rect width="200" height="200" fill="#8a5a34"/><path d="M20 150 q40 -60 80 0 q-40 -30 -80 0z" fill="#d9a43a" opacity=".55"/><path d="M110 60 q40 -50 75 5 q-38 -25 -75 -5z" fill="#4f8c86" opacity=".55"/>${star(150, 140, 14, "#e9d7b0")}${star(50, 50, 10, "#e9d7b0")}${star(170, 30, 7, "#d9a43a")}`);
}
function decoFans() { // art deco: gold sunburst fans on black
  let s = "";
  for (const [x, y] of [[0, 60], [80, 60], [40, 0], [40, 120], [-40, 0], [120, 0], [-40, 120], [120, 120]]) {
    s += `<path d="M${x} ${y} m-38 0 a38 38 0 0 1 76 0z" fill="#16130f" stroke="#c9a45c" stroke-width="1.6"/>`;
    for (let k = 1; k < 7; k++) { const a = Math.PI + (k * Math.PI) / 7; s += `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a) * 34}" y2="${y + Math.sin(a) * 34}" stroke="#c9a45c" stroke-width="1" opacity=".8"/>`; }
    s += `<path d="M${x} ${y} m-18 0 a18 18 0 0 1 36 0" fill="none" stroke="#e6cb8a" stroke-width="1.2"/>`;
  }
  return svgURL(80, 60, `<rect width="80" height="60" fill="#0f0d0b"/>${s}`);
}
function memphis() { // postmodern '86: squiggles, confetti, triangles in powdery brights
  return svgURL(160, 160, `<rect width="160" height="160" fill="#f6d9d4"/>
    <path d="M10 30 q10 -12 20 0 t20 0 t20 0" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"/>
    <path d="M90 120 q10 -12 20 0 t20 0" fill="none" stroke="#2fa79a" stroke-width="4" stroke-linecap="round"/>
    <path d="M110 20 l22 38 h-44z" fill="#f3c242"/><circle cx="40" cy="110" r="14" fill="#5b8de0"/><rect x="60" y="62" width="22" height="22" fill="#2fa79a" transform="rotate(18 71 73)"/>
    ${[[20, 70], [140, 90], [75, 140], [130, 150], [55, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#2b2b2b"/>`).join("")}`);
}
function damask(ink) {
  return svgURL(90, 120, `<rect width="90" height="120" fill="none"/><path d="M45 8 C60 30 75 40 60 62 C52 74 52 86 45 112 C38 86 38 74 30 62 C15 40 30 30 45 8Z" fill="${ink}" opacity=".35"/><circle cx="45" cy="60" r="6" fill="${ink}" opacity=".45"/>`);
}
function filigree(ink, flip = false) { // corner scrolls for the luxe frames (flip: the opposite corner)
  const s = (flip ? '<g transform="rotate(180 60 60)">' : "<g>") + `<path d="M8 60 C8 30 30 8 60 8 M18 60 C18 36 36 18 60 18 M30 60 C30 44 44 30 60 30" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="60" cy="60" r="4" fill="${ink}"/></g>`;
  return svgURL(120, 120, s);
}
const gingham = (c) => `repeating-linear-gradient(0deg, ${c}66 0 26px, transparent 26px 52px), repeating-linear-gradient(90deg, ${c}66 0 26px, transparent 26px 52px), #f7efe2`;
const plaid = `repeating-linear-gradient(0deg, rgba(0,0,0,.55) 0 30px, transparent 30px 60px), repeating-linear-gradient(90deg, rgba(0,0,0,.55) 0 30px, transparent 30px 60px), #9e2a24`;
const marble = svgURL(300, 300, `<filter id="m"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="4" seed="9"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .33  0 0 0 0 .31  0 0 0 -2.2 1.25"/></filter><rect width="300" height="300" fill="#f3efe8"/><rect width="300" height="300" filter="url(#m)"/>`);
const leather = (c) => `${lamp(0.16)}, radial-gradient(ellipse at 50% 40%, ${mix(c, "#ffffff", 0.08)} 0%, ${c} 55%, ${mix(c, "#000000", 0.45)} 100%)`;

// ---------------------------------------------------------------- the catalogue
// tier: free | classic ($2.99) | signature ($4.99) | luxe ($9.99). accent: paper (sheets), brass (buttons), line (rules)
const IVORY = { paper: "#fbf6ea", brass: "#c9a45c", line: "#ddcfae" };
export const THEMES = {
  walnut: { name: "Walnut", tier: "free", blurb: "A warm walnut table under the lamp.", table: `${lamp()}, ${vignette()}, ${grain("#7a4b2a", "#3a1e0c")}`, back: { base: "#7a1e24", ink: "#b9474b", motif: "lattice" }, accent: IVORY },
  green: { name: "Green felt", tier: "free", blurb: "The classic card-room green.", table: felt("#2f6b45"), back: { base: "#1f4a33", ink: "#4a8a62", motif: "lattice" }, accent: IVORY },
  blue: { name: "Blue felt", tier: "free", blurb: "Calm lake blue.", table: felt("#2b5c8a"), back: { base: "#1d3561", ink: "#4a6fa8", motif: "lattice" }, accent: IVORY },
  red: { name: "Red felt", tier: "free", blurb: "Deep cranberry.", table: felt("#8a2a2f"), back: { base: "#5e1a1e", ink: "#a5484c", motif: "lattice" }, accent: IVORY },
  orange: { name: "Orange felt", tier: "free", blurb: "Autumn pumpkin.", table: felt("#b5622a"), back: { base: "#7d3c16", ink: "#c97a45", motif: "lattice" }, accent: IVORY },
  pink: { name: "Pink felt", tier: "free", blurb: "Soft rose.", table: felt("#c27a8c"), back: { base: "#8e4a5c", ink: "#d49aaa", motif: "lattice" }, accent: IVORY },

  gingham: { name: "Sunday gingham", tier: "classic", blurb: "Red check tablecloth, pie cooling on the sill.", table: `${lamp(0.2)}, ${vignette(0.35)}, ${gingham("#c0392b")}`, back: { base: "#b23a33", ink: "#f7efe2", motif: "gingham" }, accent: IVORY },
  cabin: { name: "Lake cabin", tier: "classic", blurb: "Buffalo plaid and a crackling stove.", table: `${lamp(0.18)}, ${vignette(0.45)}, ${plaid}`, back: { base: "#1d3b2c", ink: "#c9a45c", motif: "pine" }, accent: { paper: "#f7efe0", brass: "#c08a4a", line: "#d8c49e" } },
  diner: { name: "Diner '57", tier: "classic", blurb: "Mint formica and a chrome edge.", table: `${lamp(0.2)}, radial-gradient(ellipse at 50% 42%, #cfeee0, #9fd4c0 70%, #7fb8a4)`, frame: frame("#8f979b", "#d9dfe2"), back: { base: "#2fa79a", ink: "#e9f4ef", motif: "starburst" }, accent: { paper: "#fdfaf3", brass: "#e07a6a", line: "#d6e3dd" } },
  garden: { name: "Garden party", tier: "classic", blurb: "Chintz roses on a linen cloth.", table: `${lamp(0.18)}, ${vignette(0.3)}, ${roses()}`, back: { base: "#8fa47c", ink: "#f4dcd8", motif: "rose" }, accent: { paper: "#fdf7ef", brass: "#c98a8a", line: "#e2d3c6" } },

  parlor: { name: "Antique parlor", tier: "signature", blurb: "Green leather, mahogany and gold tooling.", table: leather("#2e4a36"), frame: frame("#c9a45c", "#4a1f14", 14), back: { base: "#3a1d14", ink: "#c9a45c", motif: "damask" }, accent: { paper: "#f6efdf", brass: "#b8924c", line: "#d6c49c" } },
  leopard: { name: "Leopard lounge", tier: "signature", blurb: "A little wild, black lacquer edge.", table: `${lamp(0.14)}, ${vignette(0.45)}, ${leopard()}`, frame: frame("#c9a45c", "#111111", 12), back: { base: "#141414", ink: "#d9a86a", motif: "leopard" }, accent: { paper: "#fbf3e6", brass: "#c9a45c", line: "#dccdb0" } },
  midcentury: { name: "Mid-century", tier: "signature", blurb: "Teak, mustard and atomic stars.", table: `${lamp(0.16)}, ${vignette(0.4)}, ${atomic()}`, back: { base: "#4f8c86", ink: "#d9a43a", motif: "starburst" }, accent: { paper: "#fbf4e4", brass: "#d9a43a", line: "#dccaa2" } },
  leather: { name: "Leather & brass", tier: "signature", blurb: "Oxblood leather and brass studs, a quiet club.", table: leather("#5a1d1d"), frame: frame("#d8b56a", "#2b1410", 10), back: { base: "#4a1414", ink: "#d8b56a", motif: "studs" }, accent: { paper: "#f7efe1", brass: "#c9a45c", line: "#d8c7a4" } },

  gilded: { name: "Gilded", tier: "luxe", blurb: "Black velvet, gold leaf and gilt-edged backs.", table: `${filigree("#c9a45c")} top left no-repeat, ${filigree("#c9a45c", true)} bottom right no-repeat, ${leather("#151210")}`, frame: frame("#e6cb8a", "#8a6a2c", 6), back: { base: "#121010", ink: "#d4b062", motif: "filigree", gilt: true }, accent: { paper: "#fbf5e6", brass: "#d4b062", line: "#e2d2a8" } },
  sterling: { name: "Sterling", tier: "luxe", blurb: "Midnight velvet with silver filigree.", table: `${filigree("#c7ccd3")} top left no-repeat, ${filigree("#c7ccd3", true)} bottom right no-repeat, ${leather("#1b2433")}`, frame: frame("#e3e6ea", "#7d8592", 6), back: { base: "#1b2433", ink: "#c7ccd3", motif: "filigree", gilt: "#dfe3e8" }, accent: { paper: "#f7f7f5", brass: "#b7bec8", line: "#d9dde2" } },
  deco: { name: "Art deco", tier: "luxe", blurb: "1925: black lacquer and gold sunbursts.", table: `${lamp(0.12)}, ${decoFans()}`, frame: frame("#e6cb8a", "#0f0d0b", 8), back: { base: "#0f0d0b", ink: "#c9a45c", motif: "fan", gilt: true }, accent: { paper: "#faf4e4", brass: "#c9a45c", line: "#dfcfa3" } },
  memphis: { name: "Postmodern '86", tier: "luxe", blurb: "Squiggles and confetti, unapologetically fun.", table: `${memphis()}`, back: { base: "#2b2b2b", ink: "#f3c242", motif: "memphis" }, accent: { paper: "#fffaf5", brass: "#f3c242", line: "#ead8d2" } },
  marble: { name: "Marble & brass", tier: "luxe", blurb: "Carrara marble and a brushed brass rail.", table: `${lamp(0.1)}, ${marble}`, frame: frame("#b9965a", "#e6cf98", 8), back: { base: "#efe9de", ink: "#b9965a", motif: "lattice", gilt: true }, accent: { paper: "#ffffff", brass: "#b9965a", line: "#e5dccb" } },
};

// ---------------------------------------------------------------- card backs
export function themeBack(id) {
  const t = THEMES[id] || THEMES.walnut, { base, ink, motif, gilt } = t.back, uid = "b" + id;
  const edge = gilt ? (gilt === true ? "#d4b062" : gilt) : "#f6ead0";
  let m = "";
  if (motif === "lattice") for (let i = -6; i < 14; i++) m += `<path d="M${i * 12} 18 L${i * 12 + 104} 122 M${i * 12 + 104} 18 L${i * 12} 122" stroke="${ink}" stroke-width="3" opacity=".75"/>`;
  if (motif === "gingham") for (let i = 0; i < 9; i++) m += `<rect x="${10 + i * 10}" y="10" width="5" height="120" fill="${ink}" opacity=".35"/><rect x="10" y="${10 + i * 14}" width="80" height="7" fill="${ink}" opacity=".35"/>`;
  if (motif === "pine") for (let k = 0; k < 6; k++) { const x = 25 + (k % 3) * 25, y = 40 + Math.floor(k / 3) * 50; m += `<path d="M${x} ${y - 18} l12 22 h-7 l9 16 h-28 l9 -16 h-7z" fill="${ink}"/>`; }
  if (motif === "starburst") for (const [x, y, r] of [[50, 70, 22], [28, 34, 9], [72, 108, 9]]) for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; m += `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a) * r}" y2="${y + Math.sin(a) * r}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`; }
  if (motif === "rose") for (const [x, y] of [[35, 40], [65, 70], [35, 100]]) m += `<path d="${curve(ring(x, y, 12, 11, 12, 0.18, x + y))}" fill="${ink}"/><path d="${curve(ring(x + 1, y, 6, 5, 9, 0.3, x * y))}" fill="${mix(ink, base, 0.4)}"/>`;
  if (motif === "damask") m += `<path d="M50 18 C68 44 86 54 68 76 C58 90 58 104 50 124 C42 104 42 90 32 76 C14 54 32 44 50 18Z" fill="${ink}" opacity=".85"/><circle cx="50" cy="70" r="7" fill="${base}"/>`;
  if (motif === "leopard") { const r = rng(11); for (let i = 0; i < 14; i++) { const x = 14 + r() * 72, y = 14 + r() * 112; m += `<path d="${curve(ring(x, y, 6, 4.5, 8, 0.35, i + 3, r() * 3))}" fill="${ink}"/>`; } }
  if (motif === "studs") for (let i = 0; i < 8; i++) m += `<circle cx="${16 + i * 9.7}" cy="16" r="2.2" fill="${ink}"/><circle cx="${16 + i * 9.7}" cy="124" r="2.2" fill="${ink}"/>` + (i < 7 ? `<circle cx="16" cy="${30 + i * 13.5}" r="2.2" fill="${ink}"/><circle cx="84" cy="${30 + i * 13.5}" r="2.2" fill="${ink}"/>` : "") + (i === 0 ? `<path d="M50 50 l14 20 l-14 20 l-14 -20z" fill="none" stroke="${ink}" stroke-width="2"/>` : "");
  if (motif === "filigree") m += `<path d="M50 30 C70 30 74 52 50 70 C26 52 30 30 50 30Z M50 110 C70 110 74 88 50 70 C26 88 30 110 50 110Z" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="50" cy="70" r="4" fill="${ink}"/><rect x="16" y="16" width="68" height="108" rx="3" fill="none" stroke="${ink}" stroke-width="1"/>`;
  if (motif === "fan") for (const y of [40, 80, 120]) { m += `<path d="M20 ${y} a30 30 0 0 1 60 0" fill="none" stroke="${ink}" stroke-width="1.6"/>`; for (let k = 1; k < 8; k++) { const a = Math.PI + (k * Math.PI) / 8; m += `<line x1="50" y1="${y}" x2="${50 + Math.cos(a) * 28}" y2="${y + Math.sin(a) * 28}" stroke="${ink}" stroke-width="1"/>`; } }
  if (motif === "memphis") m += `<path d="M18 30 q8 -10 16 0 t16 0 t16 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><path d="M60 60 l16 28 h-32z" fill="#f6a5b4"/><circle cx="30" cy="100" r="9" fill="#5b8de0"/><rect x="58" y="100" width="16" height="16" fill="#2fa79a"/>`;
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${uid}"><rect x="10" y="10" width="80" height="120" rx="5"/></clipPath></defs>` +
    `<rect x="1" y="1" width="98" height="138" rx="9" fill="${edge}" stroke="${mix(edge, "#000000", 0.25)}" stroke-width="1.5"/><rect x="10" y="10" width="80" height="120" rx="5" fill="${base}"/>` +
    `<g clip-path="url(#${uid})">${m}</g></svg>`;
}

// the CSS a theme puts on the page (main.js applies it): the surface, its frame, and the accent variables
export function themeStyle(id) {
  const t = THEMES[id] || THEMES.walnut, a = t.accent;
  return { background: t.table, boxShadow: t.frame || "none", vars: { "--paper": a.paper, "--brass": a.brass, "--brass-d": mix(a.brass, "#000000", 0.32), "--rule": a.line } };
}
