// Assemble www/ (the app's web bundle) from proto/ and the shared config. Offline-ready: fonts are bundled.
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const out = "www";
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/fonts`, { recursive: true });
for (const f of readdirSync("proto").filter((f) => /\.(js|css)$/.test(f))) copyFileSync(`proto/${f}`, `${out}/${f}`);
mkdirSync(`${out}/lang`); for (const f of readdirSync("proto/lang")) copyFileSync(`proto/lang/${f}`, `${out}/lang/${f}`); // translations (i18n.js)
copyFileSync("sim/generator.json", `${out}/generator.json`);
// one family: Alegreya (a warm book serif) for titles and numbers, Alegreya Sans for reading. [package, family, weight, style]
const FONTS = [["alegreya", "Alegreya", 500, "normal"], ["alegreya", "Alegreya", 700, "normal"], ["alegreya", "Alegreya", 400, "italic"],
  ["alegreya-sans", "Alegreya Sans", 400, "normal"], ["alegreya-sans", "Alegreya Sans", 500, "normal"], ["alegreya-sans", "Alegreya Sans", 700, "normal"], ["alegreya-sans", "Alegreya Sans", 800, "normal"]];
for (const [f, , w, s] of FONTS) copyFileSync(`node_modules/@fontsource/${f}/files/${f}-latin-${w}-${s}.woff2`, `${out}/fonts/${f}-${w}-${s}.woff2`);
let html = readFileSync("proto/index.html", "utf8");
const font = FONTS.map(([f, fam, w, s]) => `@font-face { font-family: "${fam}"; font-weight: ${w}; font-style: ${s}; font-display: swap; src: url(fonts/${f}-${w}-${s}.woff2) format("woff2"); }`).join("\n");
html = html.replace(/<link rel="preconnect"[^>]*>\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<style>${font}</style>`);
if (html.includes("fonts.googleapis.com")) throw new Error("Google Fonts link not replaced");
writeFileSync(`${out}/index.html`, html);
const main = readFileSync(`${out}/main.js`, "utf8");
if (!main.includes('"../sim/generator.json"')) throw new Error("config path not found");
writeFileSync(`${out}/main.js`, main.replace('"../sim/generator.json"', '"./generator.json"'));
// version shown in Options: MARKETING_VERSION from the Xcode project plus ios/BUILD (the number TestFlight shows)
const pbx = "ios/App/App.xcodeproj/project.pbxproj";
const ver = existsSync(pbx) ? readFileSync(pbx, "utf8").match(/MARKETING_VERSION = ([\d.]+);/)?.[1] || "0" : "0";
const build = process.env.KT_BUILD || (existsSync("ios/BUILD") ? readFileSync("ios/BUILD", "utf8").trim() : "dev");
const plat = readFileSync(`${out}/platform.js`, "utf8");
if (!plat.includes('export const VERSION = "dev";')) throw new Error("platform.js: VERSION line not found");
writeFileSync(`${out}/platform.js`, plat.replace('export const VERSION = "dev";', `export const VERSION = ${JSON.stringify(`${ver} (${build})`)};`));
// every relative import in the bundle must resolve, or the app boots to a blank screen on the phone
for (const f of readdirSync(out).filter((f) => /\.(js|html)$/.test(f)))
  for (const [, dep] of readFileSync(`${out}/${f}`, "utf8").matchAll(/(?:from\s+|src=|href=)"(?:\.\/)?([\w.-]+\.(?:js|css))"/g))
    if (!existsSync(`${out}/${dep}`)) throw new Error(`${f} imports ./${dep}, which is not in ${out}/`);
// a DOM id main.js asks for must exist in index.html, or be one main.js draws itself (otherwise "of null" at boot)
const mainSrc = readFileSync("proto/main.js", "utf8");
for (const [, id] of mainSrc.matchAll(/\$\("#([\w-]+)/g))
  if (!html.includes(`id="${id}"`) && !mainSrc.includes(`id="${id}"`)) throw new Error(`main.js uses #${id}, which is not in index.html`);
console.log("www/ ready");
