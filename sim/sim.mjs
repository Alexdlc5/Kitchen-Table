// Plays the real game code (proto/) bot against bot and reports the AI_SPEC §8 numbers.
//   node sim/sim.mjs --game spades --level standard --hands 100000        one game, one level, all four seats
//   node sim/sim.mjs --ladder --games 2000                                  stronger level vs weaker, sides swapped
//   node sim/sim.mjs --all --hands 100000                                   everything RELEASE_REVIEW.md needs
//   --preset kitchen   --custom minBid=0,jokers=false   --workers 8   --check (fail if a Standard target is missed)
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { rulesFor, team, partner } from "../proto/cards.js";
import { encode } from "../proto/dealer.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";
import { decide, sins, nilRisk, nilForbidden } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
const GAMES = { spades, hearts };

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
}

// one worker's share: whole games until `hands` hands are played. levels[seat]
function run({ game, levels, preset, custom = {}, hands, seed }) {
  const g = GAMES[game], rules = rulesFor(cfg, game, preset, custom), rng = mulberry(seed);
  const seedRng = () => encode([0, 1, 2, 3].map(() => (rng() * 2 ** 32) >>> 0)); // reproducible seeds for the sim
  const m = { hands: 0, games: 0, wins: [0, 0, 0, 0], decisions: 0, guarded: 0, rawSins: {}, shippedSins: 0,
    contracts: 0, made: 0, exact: 0, set: 0, bags: 0, nilBids: 0, nilMade: 0, blindBids: 0, blindMade: 0, nilChances: 0,
    besideNil: 0, besideNilSet: 0, moons: 0, moonAttempts: 0, moonStops: 0, points: [0, 0, 0, 0], qsSeat0: 0, bidSum: 0, bidErr: 0 };
  while (m.hands < hands) {
    let totals = game === "spades" ? { score: [0, 0], bags: [0, 0] } : { score: [0, 0, 0, 0] }, handNo = 0, w = null;
    while (w === null && handNo < 80 && m.hands < hands) {
      const st = g.newHand(rules, seedRng(), handNo % 4, totals, handNo);
      if (game === "hearts" && st.hands[0].includes("QS")) m.qsSeat0++;
      if (game === "spades") for (let s = 0; s < 4; s++) if (!nilForbidden(st.hands[s], rules) && nilRisk(st.hands[s], rules) <= 0.22) m.nilChances++;
      let attempt = false;
      while (st.phase !== "done") {
        const v = g.view(st, st.turn), d = decide(v, levels[st.turn], rng, cfg.ai);
        m.decisions++;
        if (d.guarded) { m.guarded++; const raw = d.reason.split(":")[0]; m.rawSins[raw] = (m.rawSins[raw] || 0) + 1; }
        if (st.phase === "play" && sins(v, d.action).length) m.shippedSins++;
        g.apply(st, d.action);
        if (game === "hearts" && st.history.length === 24 && !st.trick.length && !attempt) { // halfway: one seat has every point so far
          const pts = st.taken.map((t) => t.filter((c) => c[1] === "H" || c === "QS").reduce((a, c) => a + (c === "QS" ? 13 : 1), 0));
          const takers = pts.filter((x) => x > 0).length;
          if (takers === 1 && Math.max(...pts) >= 10) { attempt = true; m.moonAttempts++; }
        }
      }
      if (attempt && st.moon === null) m.moonStops++;
      if (game === "spades") {
        for (const t of [0, 1]) {
          let B = 0, T = 0;
          for (const s of [t, t + 2]) {
            if (st.bids[s] === 0) {
              if (st.blind[s]) { m.blindBids++; if (!st.tricks[s]) m.blindMade++; } else { m.nilBids++; if (!st.tricks[s]) m.nilMade++; }
              if (rules.nilTricksCount) T += st.tricks[s];
            } else { B += st.bids[s]; T += st.tricks[s]; }
          }
          if (B > 0) {
            m.contracts++; m.bidSum += B; m.bidErr += Math.abs(T - B);
            if (T >= B) { m.made++; m.bags += T - B; if (T - B <= 2) m.exact++; } else m.set++;
            if (st.bids[t] === 0 || st.bids[t + 2] === 0) { m.besideNil++; if (T < B) m.besideNilSet++; }
          }
        }
      } else if (st.moon !== null) m.moons++;
      if (st.phase === "moon") g.apply(st, decide(g.view(st, st.turn), levels[st.turn], rng).action);
      const sc = g.score(st);
      if (game === "hearts") sc.lines.forEach((l) => (m.points[l.seat] += l.pts));
      totals = sc.totals; handNo++; m.hands++;
      w = g.winner(totals, rules);
    }
    if (w !== null) { m.games++; m.wins[w]++; }
  }
  return m;
}

function merge(ms) {
  const out = structuredClone(ms[0]);
  for (const m of ms.slice(1))
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "number") out[k] += v;
      else if (Array.isArray(v)) v.forEach((x, i) => (out[k][i] += x));
      else for (const [a, b] of Object.entries(v)) out[k][a] = (out[k][a] || 0) + b;
    }
  return out;
}

async function parallel(job, workers) {
  const per = Math.ceil(job.hands / workers);
  const parts = await Promise.all(Array.from({ length: workers }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { ...job, hands: per, seed: (job.seed || 1) * 1000 + i } });
    w.once("message", res); w.once("error", rej);
  })));
  return merge(parts);
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "—");

function report(game, level, m) {
  const rows = [["Hands", m.hands.toLocaleString("en-US")], ["Games finished", m.games.toLocaleString("en-US")]];
  if (game === "spades") {
    rows.push(["Bid accuracy (made with 0-2 bags)", pct(m.exact, m.contracts)], ["Set rate", pct(m.set, m.contracts)],
      ["Average miss (tricks off the bid)", (m.bidErr / m.contracts).toFixed(2)], ["Bags per team-hand", (m.bags / m.contracts).toFixed(2)],
      ["Nil bids per hand", (m.nilBids / m.hands).toFixed(3)], ["Nil success", pct(m.nilMade, m.nilBids)],
      ["Nil bids vs nil-able hands", (m.nilBids / Math.max(1, m.nilChances)).toFixed(2)],
      ["Set rate beside a nil", pct(m.besideNilSet, m.besideNil)], ["Blind nil bids", `${m.blindBids} (${pct(m.blindMade, m.blindBids)} made)`],
      ["Team 0 / team 1 wins", `${pct(m.wins[0], m.games)} / ${pct(m.wins[1], m.games)}`]);
  } else {
    rows.push(["Moon rate", pct(m.moons, m.hands)], ["Moon runs stopped (one seat had every point, 10+, after trick 6)", pct(m.moonStops, m.moonAttempts)],
      ["Average points per hand, seats 0-3", m.points.map((p) => (p / m.hands).toFixed(2)).join(" / ")],
      ["Q♠ dealt to seat 0", pct(m.qsSeat0, m.hands)], ["Wins, seats 0-3", m.wins.map((w) => pct(w, m.games)).join(" / ")]);
  }
  rows.push(["Partner-blame events shipped (sins played)", String(m.shippedSins)],
    ["Sins the guard caught in the raw heuristics", `${m.guarded} of ${m.decisions.toLocaleString("en-US")} decisions${m.guarded ? " (" + Object.entries(m.rawSins).map(([k, v]) => `${k} ${v}`).join(", ") + ")" : ""}`]);
  console.log(`\n### ${game}, ${level}, all four seats\n\n| Metric | Value |\n|---|---|\n${rows.map((r) => `| ${r[0]} | ${r[1]} |`).join("\n")}`);
  return m;
}

function check(game, m) {
  const fails = [];
  const need = (ok, what) => ok || fails.push(what);
  if (game === "spades") {
    need(m.exact / m.contracts >= 0.7, `bid accuracy ${pct(m.exact, m.contracts)} < 70%`);
    need(m.set / m.contracts <= 0.12, `set rate ${pct(m.set, m.contracts)} > 12%`);
    need(m.nilMade / m.nilBids >= 0.7, `nil success ${pct(m.nilMade, m.nilBids)} < 70%`);
    need(m.bags / m.contracts <= 1.5, "bags per hand > 1.5");
  } else {
    need(m.moons / m.hands >= 0.01 && m.moons / m.hands <= 0.04, `moon rate ${pct(m.moons, m.hands)} outside 1-4%`);
    need(m.moonStops / Math.max(1, m.moonAttempts) >= 0.6, "moon stops < 60%");
  }
  need(m.shippedSins === 0, `${m.shippedSins} sins shipped`);
  return fails;
}

async function ladder(game, strong, weak, games, preset, workers) {
  // strong side on seats 0 (+2 in spades), then swapped, so seat order can't flatter either level
  const lv = (a, b) => (game === "spades" ? [a, b, a, b] : [a, b, b, b]);
  const hands = games * (game === "spades" ? 9 : 14);
  const a = await parallel({ game, levels: lv(strong, weak), preset, hands: hands / 2, seed: 11 }, workers);
  const b = await parallel({ game, levels: game === "spades" ? lv(weak, strong) : [weak, strong, weak, weak], preset, hands: hands / 2, seed: 12 }, workers);
  const won = game === "spades" ? a.wins[0] + b.wins[1] : a.wins[0] + b.wins[1];
  const played = a.games + b.games, base = game === "spades" ? 0.5 : 0.25;
  console.log(`| ${game} | ${strong} vs ${weak} | ${played} | ${pct(won, played)} (even: ${base * 100}%) |`);
  return { won, played, base };
}

if (!isMainThread) parentPort.postMessage(run(workerData));
else {
  const args = process.argv.slice(2), opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const workers = +opt("workers", Math.max(1, availableParallelism() - 2)), preset = opt("preset", "standard");
  const hands = +opt("hands", 20000), all = args.includes("--all");
  const custom = Object.fromEntries(opt("custom", "").split(",").filter(Boolean).map((kv) => kv.split("=")).map(([k, v]) => [k, JSON.parse(v)]));
  const games = all ? ["spades", "hearts"] : [opt("game", "spades")];
  const levels = all ? ["easy", "standard", "expert", "extreme"] : [opt("level", "standard")];
  const fails = [];
  console.log(`Kitchen Table sim: preset ${preset}, ${workers} workers, ${new Date().toISOString().slice(0, 10)}`);
  if (!args.includes("--ladder") || all)
    for (const game of games) for (const level of levels) {
      const t0 = Date.now(), m = report(game, level, await parallel({ game, levels: [level, level, level, level], preset, custom, hands }, workers));
      console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      if (args.includes("--check") && level === "standard") fails.push(...check(game, m).map((f) => `${game}: ${f}`));
      if (args.includes("--check") && m.shippedSins) fails.push(`${game} ${level}: ${m.shippedSins} sins shipped`);
    }
  if (args.includes("--ladder") || all) {
    const n = +opt("games", 2000);
    console.log(`\n### Level ladder (${preset})\n\n| Game | Match-up | Games | Stronger side won |\n|---|---|---|---|`);
    for (const game of games) {
      await ladder(game, "extreme", "expert", n, preset, workers);
      await ladder(game, "expert", "standard", n, preset, workers);
      await ladder(game, "standard", "easy", n, preset, workers);
    }
  }
  if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
}
