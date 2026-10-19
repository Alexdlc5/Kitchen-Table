// Play the current code on this PC and on a phone on the same Wi-Fi, no App Store round-trip:
//   npm run play            builds www/ and serves it; prints the URL to open on the phone
//   npm run play -- --watch rebuilds whenever proto/ or sim/generator.json changes (refresh the phone to pick it up)
// What it can't test: real purchases (the browser build has everything unlocked), haptics, Game Center, the silent switch.
// Everything else (table, bots, rules, Comfort mode, languages) is the same code the app ships.
import { createServer } from "node:http";
import { readFileSync, existsSync, watch } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";
import { networkInterfaces } from "node:os";

const PORT = +(process.env.PORT || 8812), ROOT = "www";
const build = () => { execFileSync(process.execPath, ["scripts/build-web.mjs"], { stdio: "inherit" }); };
build();
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]), f = join(ROOT, path === "/" ? "index.html" : path);
  if (!existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": "no-store" }); // always the latest build
  res.end(readFileSync(f));
}).listen(PORT, "0.0.0.0");
const lan = Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address;
console.log(`\nKitchen Table is serving the current code.\n  this PC:  http://localhost:${PORT}/\n  phone:    http://${lan || "<this PC's IP>"}:${PORT}/   (same Wi-Fi; add ?debug for the test hooks, ?lang=ja etc. for a language)\n`);
if (process.argv.includes("--watch")) {
  let t; const rebuild = () => { clearTimeout(t); t = setTimeout(() => { try { build(); console.log("rebuilt: refresh the phone"); } catch (e) { console.log("build failed:", e.message); } }, 300); };
  for (const d of ["proto", "sim"]) watch(d, { recursive: true }, rebuild);
  console.log("watching proto/ and sim/ for changes");
}
