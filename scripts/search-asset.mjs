// The App Store "Search Results" asset, 3840x2560: wordmark, tagline and the title still life on the left, a phone with a
// staged Hearts hand on the right. Painted fresh at 1920x1280 CSS px x2 (never captured over the running game, which once
// gave Glimmerwood's asset black bands). Check it at full size before uploading.
//   node scripts/search-asset.mjs        writes docs/store/search-asset.png
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { serve, stage, paint, FRAME_CSS, SHOTS } from "./store-shots.mjs";
import { titleProps, face } from "../proto/art.js";

// the title screen's still life and its fan of aces (main.js renderTitle)
const fan = ["AS", "AH", "AD", "AC"].map((c, i) => `<span style="transform: rotate(${(i - 1.5) * 12}deg) translateY(${Math.abs(i - 1.5) * 6}px)">${face(c)}</span>`).join("");

const srv = serve(), browser = await chromium.launch();
const hearts = await stage(browser, srv.base(), SHOTS.find((s) => s.game === "hearts"), { w: 402, h: 874, dpr: 3 });
const html = `<!doctype html><meta charset="utf-8"><style>${FRAME_CSS}
  body { background-size: auto, auto, 1200px 1200px, auto; }
  .left { position: absolute; left: 130px; top: 0; bottom: 0; width: 1000px; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
  .kicker { font: italic 400 54px/1 Alegreya, serif; color: #e8cf94; text-align: center; }
  h1 { font-size: 150px; } .rule { width: 520px; } p { font-size: 56px; }
  .props { position: relative; width: 760px; margin: 10px auto 0; filter: drop-shadow(0 20px 30px rgba(20,10,4,.35)); } .props > svg { width: 100%; height: auto; display: block; }
  .fan { position: absolute; left: 0; right: 0; top: 2%; display: flex; justify-content: center; } .fan span { width: 128px; margin: 0 -22px; transform-origin: 50% 120%; filter: drop-shadow(0 6px 8px rgba(20,10,4,.35)); } .fan svg { display: block; width: 100%; }
  .device { left: auto; right: 210px; transform: none; top: 110px; width: ${480 + 28}px; height: ${480 * 874 / 402 + 28}px; padding: 14px; border-radius: 74px; }
  .device img { border-radius: 60px; }</style>
  <div class="left"><div class="kicker">Play a game of cards at…</div><h1>The Kitchen Table</h1><span class="rule"></span>
    <p>Hearts, Spades, Euchre, Oh Hell and Whist.<br>No ads, ever. A fair deal you can check.</p><div class="props">${titleProps()}<div class="fan">${fan}</div></div></div>
  <div class="device"><img src="data:image/png;base64,${hearts.toString("base64")}"></div>`;
const png = await paint(browser, srv, html, 1920, 1280, 2);
mkdirSync("docs/store", { recursive: true });
writeFileSync("docs/store/search-asset.png", png);
console.log("docs/store/search-asset.png  3840x2560");
await browser.close(); srv.server.close();
