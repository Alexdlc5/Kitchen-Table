// Regenerate the app icon and splash from the title art (proto/art.js): four aces fanned over the still life, on walnut.
// Run: node scripts/app-art.mjs. Writes the source SVGs and a 1024px icon to assets/, and the iOS asset catalog.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync, crc32 } from "node:zlib";
import { tmpdir } from "node:os";
import { Resvg } from "@resvg/resvg-js";
import { face, titleProps } from "../proto/art.js";

// resvg reads TTF/OTF only; unpack the bundled WOFF (zlib per table) into a plain TTF. (Glimmerwood's app-art.mjs)
function woffToTtf(w) {
  const n = w.readUInt16BE(12), head = Buffer.alloc(12 + 16 * n), parts = [head];
  head.writeUInt32BE(w.readUInt32BE(4), 0); head.writeUInt16BE(n, 4);
  const es = Math.floor(Math.log2(n)); head.writeUInt16BE(16 << es, 6); head.writeUInt16BE(es, 8); head.writeUInt16BE(n * 16 - (16 << es), 10);
  let off = head.length;
  for (let i = 0; i < n; i++) {
    const e = 44 + 20 * i, at = w.readUInt32BE(e + 4), comp = w.readUInt32BE(e + 8), orig = w.readUInt32BE(e + 12);
    const data = comp < orig ? inflateSync(w.subarray(at, at + comp)) : w.subarray(at, at + orig);
    w.copy(head, 12 + 16 * i, e, e + 4); head.writeUInt32BE(w.readUInt32BE(e + 16), 16 + 16 * i);
    head.writeUInt32BE(off, 20 + 16 * i); head.writeUInt32BE(orig, 24 + 16 * i);
    const padded = Buffer.alloc((orig + 3) & ~3); data.copy(padded); parts.push(padded); off += padded.length;
  }
  return Buffer.concat(parts);
}
// resvg-js 2.6 ignores fontBuffers, so hand it files: the card indices (Alegreya Sans) and the wordmark (Alegreya)
const fontFiles = [["alegreya-sans", 700], ["alegreya", 700]].map(([f, w]) => {
  const path = `${tmpdir()}/kitchentable-${f}-${w}.ttf`;
  writeFileSync(path, woffToTtf(readFileSync(`node_modules/@fontsource/${f}/files/${f}-latin-${w}-normal.woff`)));
  return path;
});

// walnut under the lamp, like themes.js walnut: wood grain (stretched noise tinted #3a1e0c), warm light, dark edges
const walnut = (w, h, k) => `<defs>
  <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#83563a"/><stop offset="1" stop-color="#7a4b2a"/></linearGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${0.09 / k} ${0.006 / k}" numOctaves="3" seed="4"/>
    <feColorMatrix values="0 0 0 0 .227  0 0 0 0 .118  0 0 0 0 .047  0 0 0 .9 -.22"/></filter>
  <radialGradient id="lamp" cx=".5" cy=".38" r=".6"><stop offset="0" stop-color="#ffdeaa" stop-opacity=".34"/><stop offset="1" stop-color="#ffdeaa" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#140a04" stop-opacity="0"/><stop offset="1" stop-color="#140a04" stop-opacity=".55"/></radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${6 * k}"/></filter></defs>
  <rect width="${w}" height="${h}" fill="url(#wood)"/><rect width="${w}" height="${h}" filter="url(#grain)"/>
  <rect width="${w}" height="${h}" fill="url(#lamp)"/><rect width="${w}" height="${h}" fill="url(#vig)"/>`;

// the title's fan (main.js renderTitle + style.css .ace): cards overlap to 36% of a width, each turned 12° more than
// the last around a point below the card, the outer ones a little lower. cw = card width, (cx, top) = where the fan sits.
const fan = (cx, top, cw) => ["AS", "AH", "AD", "AC"].map((c, i) => {
  const ch = cw * 1.4, x = cx + (i - 1.5) * 0.36 * cw - cw / 2, y = top + Math.abs(i - 1.5) * 0.085 * cw;
  const card = face(c).replace(/^<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${cw}" height="${ch}" viewBox="0 0 100 140">`);
  const shadow = `<rect x="${x + cw * 0.02}" y="${y + cw * 0.06}" width="${cw}" height="${ch}" rx="${cw * 0.09}" fill="#1a0c04" opacity=".38" filter="url(#soft)"/>`;
  return `<g transform="rotate(${(i - 1.5) * 12} ${x + cw / 2} ${y + ch * 1.2})">${shadow}${card}</g>`;
}).join("");
// the still life (400 x 250) scaled to width w with its top-left at (x, y)
const props = (x, y, w) => titleProps().replace(/^<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${w}" height="${w * 0.625}" viewBox="0 0 400 250">`);
const doc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

const icon = doc(1024, 1024, walnut(1024, 1024, 2.4) + props(12, 372, 1000) + fan(512, 110, 285));
// square splash, shown "aspect fill": keep everything in the middle 1100 x 1700 so an iPhone (portrait) and an iPad
// (landscape) both see all of it
const S = 2732, splash = doc(S, S, walnut(S, S, 5) +
  `<text x="${S / 2}" y="${S / 2 - 560}" text-anchor="middle" font-family="Alegreya" font-weight="700" font-size="130" fill="#f6ead0">The Kitchen Table</text>` +
  props(S / 2 - 550, S / 2 - 260, 1100) + fan(S / 2, S / 2 - 400, 300));

const put = (path, data) => { mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true }); writeFileSync(path, data); };
// App Store rejects an icon with an alpha channel, so write plain 8-bit RGB
function rgbPng(svg, width) {
  const img = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Alegreya Sans" } }).render();
  const { width: w, height: h, pixels } = img, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = pixels[i]; raw[o + 1] = pixels[i + 1]; raw[o + 2] = pixels[i + 2]; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

put("assets/icon.svg", icon); put("assets/splash.svg", splash);
const iconPng = rgbPng(icon, 1024);
put("assets/icon-1024.png", iconPng);
const ios = "ios/App/App/Assets.xcassets";
put(`${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, iconPng);
put(`${ios}/Splash.imageset/splash-2732x2732.png`, rgbPng(splash, S)); // one image, any scale: the launch screen fills with it
console.log("assets/ and the iOS icon and splash regenerated");
