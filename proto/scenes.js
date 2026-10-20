// The places around the house where the menus live (docs/TABLE.md "Scenes"): the game cupboard, the community-hall
// corkboard, the fridge, the dealer's ledger desk. Every picture here is decoration (aria-hidden); the controls on top
// are ordinary labelled buttons, and all motion stops when the phone asks for reduced motion (style.css).
import { curve, ring, shape, mix, rng } from "./paint.js";
import { PIP } from "./art.js";

const svgURL = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`;

// backgrounds for #scene, one per menu that has its own place; the rest show the table theme underneath
export const SCENES = {
  // a walnut cupboard: dark back wall, two shelves with a lit edge
  picker: `linear-gradient(180deg, transparent 0 41%, #2a160b 41% 42%, #c08a52 42% 43%, #8c5a31 43% 46%, #3a2010 46% 47%, transparent 47% 79%, #2a160b 79% 80%, #c08a52 80% 81%, #8c5a31 81% 84%, #3a2010 84% 85%, transparent 85%),
    radial-gradient(ellipse 80% 60% at 50% 30%, rgba(255,214,160,.22), transparent 70%), linear-gradient(90deg, #3d2413, #54331c 50%, #3d2413)`,
  // cork wall at the community hall
  boards: `radial-gradient(ellipse 80% 60% at 50% 35%, rgba(255,230,190,.25), transparent 70%), ${svgURL(240, 240, `<filter id="c"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .1  0 0 0 1.2 -.55"/></filter><rect width="240" height="240" fill="#c49a6c"/><rect width="240" height="240" filter="url(#c)"/>`)}`,
  // the fridge door: warm enamel with a chrome handle down the right side
  caregiver: `linear-gradient(90deg, transparent calc(100% - 26px), #c9ced3 calc(100% - 26px), #f4f6f7 calc(100% - 18px), #9aa1a8 calc(100% - 12px), transparent calc(100% - 12px)),
    linear-gradient(100deg, rgba(255,255,255,.55), transparent 30%, rgba(255,255,255,.25) 60%, transparent 75%), #ece7da`,
  // the dealer's desk: green leather blotter with brass corners
  stats: `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(255,222,170,.18), transparent 70%), radial-gradient(ellipse at 50% 45%, #2f5a43, #1f3d2d 75%, #15291f)`,
};

// a card tuck box standing on the shelf. lid swings open when tapped (class "open" on the button)
const BOXES = {
  hearts: { body: "#a3232f", trim: "#e8cf94", pip: "H", pipCol: "#a3232f" },
  spades: { body: "#1f2f52", trim: "#d8c08a", pip: "S", pipCol: "#1f2f52" },
  euchre: { body: "#2c5a3e", trim: "#d8c08a", pip: "C", pipCol: "#2c5a3e" },
  ohhell: { body: "#9a6a1f", trim: "#f0dca6", pip: "D", pipCol: "#9a6a1f" },
  whist: { body: "#5b2d4f", trim: "#d8c08a", pip: "S", pipCol: "#5b2d4f" },
  bidwhist: { body: "#2f4f6f", trim: "#e8cf94", pip: "S", pipCol: "#2f4f6f" },
  // coming to the table: closed, ribboned
  cribbage: { body: "#7a3b2a", trim: "#e8cf94", pip: "C", pipCol: "#7a3b2a" },
  ginrummy: { body: "#2d6466", trim: "#d8c08a", pip: "D", pipCol: "#2d6466" },
  pinochle: { body: "#3a4a7a", trim: "#d8c08a", pip: "S", pipCol: "#3a4a7a" },
  canasta: { body: "#8a2f45", trim: "#e8cf94", pip: "H", pipCol: "#8a2f45" },
};
export function tuckBox(game, name, { locked = false, soon = false } = {}) {
  const b = BOXES[game], dark = mix(b.body, "#000000", 0.35), light = mix(b.body, "#ffffff", 0.18);
  const label = `<ellipse cx="58" cy="92" rx="40" ry="30" fill="#f6ecd6" stroke="${b.trim}" stroke-width="2.4"/>
    <path d="${PIP[b.pip]}" transform="translate(48 66) scale(.2)" fill="${b.pipCol}"/>
    ${name.length > 10 && name.includes(" ") // a two-word name over two lines ("Classic / Whist"), so it stays inside the label
      ? `<text x="58" y="103" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="600" font-size="11" fill="#2a2118">${name.slice(0, name.lastIndexOf(" "))}</text><text x="58" y="117" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="600" font-size="15" fill="#2a2118">${name.slice(name.lastIndexOf(" ") + 1)}</text>`
      : `<text x="58" y="110" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="600" font-size="15" fill="#2a2118">${name}</text>`}`;
  const ribbon = soon ? `<rect x="0" y="134" width="116" height="12" fill="#c9a45c"/><path d="M22 140 l-14 -10 v20z M22 140 l14 -10 v20z" fill="#b8924c"/><circle cx="22" cy="140" r="5" fill="#e8cf94"/>` : "";
  const lock = locked ? `<g transform="translate(86 128)"><path d="M4 0 a8 8 0 0 1 16 0 v6 h-4 v-6 a4 4 0 0 0 -8 0 v6 h-4z" fill="#c9a45c"/><rect x="0" y="6" width="24" height="18" rx="3" fill="#c9a45c" stroke="#8a6f3e"/><circle cx="12" cy="15" r="2.5" fill="#5a4320"/></g>` : "";
  return `<svg viewBox="-6 -40 140 214" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="66" cy="168" rx="70" ry="7" fill="#000" opacity=".35"/>
    <path d="M116 22 L128 14 L128 156 L116 164Z" fill="${dark}"/>
    <rect x="0" y="22" width="116" height="142" rx="4" fill="${b.body}"/>
    <rect x="6" y="28" width="104" height="130" rx="3" fill="none" stroke="${b.trim}" stroke-width="1.4" opacity=".9"/>
    <path d="M0 22 L116 22 L116 30 L0 30Z" fill="${light}" opacity=".5"/>
    ${label}${ribbon}${lock}
    <g class="lid"><path d="M0 22 L12 4 L128 4 L116 22Z" fill="${light}"/><path d="M116 22 L128 4 L128 14 L116 22Z" fill="${dark}"/>
      <path d="M40 22 Q58 34 76 22" fill="${dark}" opacity=".55"/></g>
    <g class="peek">${[0, 1, 2].map((i) => `<rect x="${18 + i * 26}" y="${6 - i * 3}" width="34" height="40" rx="3" fill="#fffdf7" stroke="#c9bfa8" transform="rotate(${-10 + i * 10} ${35 + i * 26} 26)"/>`).join("")}</g>
  </svg>`;
}

// a county-fair rosette for the winner
export function rosette(text = "1st") {
  const r = rng(8);
  let petals = "";
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; petals += `<ellipse cx="${60 + Math.cos(a) * 30}" cy="${56 + Math.sin(a) * 30}" rx="12" ry="7" transform="rotate(${(a * 180) / Math.PI} ${60 + Math.cos(a) * 30} ${56 + Math.sin(a) * 30})" fill="${i % 2 ? "#2f5fa8" : "#3a6fc0"}"/>`; }
  return `<svg viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="rosette">
    <path d="M44 80 L30 160 L46 148 L56 166 L62 86Z" fill="#2a5596"/><path d="M76 80 L90 160 L74 148 L64 166 L58 86Z" fill="#3a6fc0"/>
    ${petals}<circle cx="60" cy="56" r="26" fill="#f6ecd6" stroke="#c9a45c" stroke-width="3"/>
    <text x="60" y="64" text-anchor="middle" font-family="Alegreya, Georgia, serif" font-weight="600" font-size="22" fill="#2a5596">${text}</text></svg>`;
}

// a rubber stamp for the score sheet ("Made it!", "Set", "Moon!")
export const stamp = (text, ink = "#b03a2e") => `<span class="stamp" style="--ink:${ink}" aria-hidden="true">${text}</span>`;
