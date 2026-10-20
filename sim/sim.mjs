// Plays the real game code (proto/) bot against bot and reports the AI_SPEC §10 numbers.
//   node sim/sim.mjs --game spades --level standard --hands 100000        one game, one level, all four seats
//   node sim/sim.mjs --ladder --games 2000                                  stronger level vs weaker, sides swapped
//   node sim/sim.mjs --ladder --game euchre --steps extreme:expert           only these match-ups
//   node sim/sim.mjs --all --hands 100000                                   everything RELEASE_REVIEW.md needs
//   node sim/sim.mjs --game ohhell (or whist) --check                         Oh Hell: exact bids; Whist: tricks over the book
//   --preset kitchen   --custom minBid=0,jokers=false   --workers 8   --check (fail if a Standard target is missed)
// The work is cut into chunks, each with its own seed, so any number of workers plays exactly the same hands.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { rulesFor, team, partner } from "../proto/cards.js";
import { encode } from "../proto/dealer.js";
import * as spades from "../proto/spades.js";
import * as hearts from "../proto/hearts.js";
import * as euchre from "../proto/euchre.js";
import * as ohhell from "../proto/ohhell.js";
import * as whist from "../proto/whist.js";
import { decide, sins, nilRisk, nilForbidden } from "../proto/ai.js";

const cfg = JSON.parse(readFileSync(new URL("generator.json", import.meta.url)));
const GAMES = { spades, hearts, euchre, ohhell, whist };
const TEAMS = (game) => cfg.games[game].teams;

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
}

// one chunk: whole games until `hands` hands are played (the last game may be cut short), or exactly `games` games.
// levels[seat]
function run({ game, levels, preset, custom = {}, hands, games, seed }) {
  const g = GAMES[game], rules = rulesFor(cfg, game, preset, custom), rng = mulberry(seed);
  const seedRng = () => encode([0, 1, 2, 3].map(() => (rng() * 2 ** 32) >>> 0)); // reproducible seeds for the sim
  const m = { hands: 0, games: 0, wins: [0, 0, 0, 0], decisions: 0, guarded: 0, rawSins: {}, shippedSins: 0,
    contracts: 0, made: 0, exact: 0, set: 0, bags: 0, nilBids: 0, nilMade: 0, blindBids: 0, blindMade: 0, nilChances: 0, nilPlain: 0, unfinished: 0,
    besideNil: 0, besideNilSet: 0, moons: 0, moonAttempts: 0, moonStops: 0, moonPlain: 0, moonPlainStops: 0, points: [0, 0, 0, 0], qsSeat0: 0, bidSum: 0, bidErr: 0,
    calls: 0, euchred: 0, marches: 0, loners: 0, lonerMarch: 0, lonerEuchred: 0, thrown: 0, stuck: 0, round2: 0, makerPts: 0,
    bids: 0, exactBids: 0, overBids: 0, hooked: 0, overTables: 0, underTables: 0, teamTricks: [0, 0], honours: 0, trickPts: 0 };
  const S = (c) => spades.eff(c, rules.jokers) === "S", PTS = (c) => c[1] === "H" || c === "QS";
  // the plain rule players use (T3), next to the bots' own: at most 2 spades, none above the 9, no side ace
  const plainNil = (h) => h.filter(S).length <= 2 && h.filter(S).every((c) => spades.pow(c, rules.jokers) <= 9) && !h.some((c) => c[0] === "A" && !S(c));
  while (games ? m.games + m.unfinished < games : m.hands < hands) {
    let totals, handNo = 0, w = null; // undefined: each game starts from its own empty totals
    while (w === null && handNo < 80 && (games || m.hands < hands)) {
      const st = g.newHand(rules, seedRng(), handNo % 4, totals, handNo);
      if (game === "hearts" && st.hands[0].includes("QS")) m.qsSeat0++;
      if (game === "spades") for (let s = 0; s < 4; s++) { if (!nilForbidden(st.hands[s], rules) && nilRisk(st.hands[s], rules) <= 0.22) m.nilChances++; if (plainNil(st.hands[s])) m.nilPlain++; }
      let attempt = false, plain = false;
      while (st.phase !== "done") {
        const v = g.view(st, st.turn), d = decide(v, levels[st.turn], rng, cfg.ai);
        m.decisions++;
        if (d.guarded) { m.guarded++; const raw = d.reason.split(":")[0]; m.rawSins[raw] = (m.rawSins[raw] || 0) + 1; }
        if ((st.phase === "play" || game === "euchre" || game === "ohhell") && sins(v, d.action).length) m.shippedSins++;
        g.apply(st, d.action);
        if (game === "hearts" && st.history.length === 24 && !st.trick.length && !attempt) { // halfway: one seat has every point so far
          const pts = st.taken.map((t) => t.filter((c) => c[1] === "H" || c === "QS").reduce((a, c) => a + (c === "QS" ? 13 : 1), 0));
          const takers = pts.filter((x) => x > 0).length;
          if (takers === 1 && Math.max(...pts) >= 10) { attempt = true; m.moonAttempts++; }
        }
        if (game === "hearts" && st.history.length === 24 && !st.trick.length && !plain) { // plain: after trick 6, one player has every point card, 5 or more
          const cards = st.taken.map((t) => t.filter(PTS).length);
          if (cards.filter((x) => x > 0).length === 1 && Math.max(...cards) >= 5) { plain = true; m.moonPlain++; }
        }
      }
      if (attempt && st.moon === null) m.moonStops++;
      if (plain && st.moon === null) m.moonPlainStops++;
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
      } else if (game === "euchre") { euchreMetrics(m, st);
      } else if (game === "ohhell") {
        for (let s = 0; s < 4; s++) { m.bids++; if (st.bids[s] === st.tricks[s]) m.exactBids++; else if (st.tricks[s] < st.bids[s]) m.overBids++; m.bidErr += Math.abs(st.bids[s] - st.tricks[s]); }
        const total = st.bids.reduce((a, b) => a + b, 0);
        if (total > st.size) m.overTables++; else if (total < st.size) m.underTables++;
        if (st.rules.hook && st.bids.reduce((a, b) => a + b, 0) - st.bids[st.dealer] <= st.size) m.hooked++;
      } else if (game === "whist") {
        for (const t of [0, 1]) { const k = st.tricks[t] + st.tricks[t + 2]; m.teamTricks[t] += k; m.trickPts += Math.max(0, k - 6); }
        if (st.rules.honours && [0, 1].some((t) => whist.honoursHeld(st, t) >= 3)) m.honours++;
      } else if (st.moon !== null) m.moons++;
      if (st.phase === "moon") g.apply(st, decide(g.view(st, st.turn), levels[st.turn], rng).action);
      const sc = g.score(st);
      if (game === "hearts" || game === "ohhell") sc.lines.forEach((l) => (m.points[l.seat] += l.pts));
      totals = sc.totals; handNo++; m.hands++;
      w = g.winner(totals, rules);
    }
    if (w !== null) { m.games++; m.wins[w]++; } else if (games) m.unfinished++; // 80 hands without a winner
  }
  return m;
}

// Euchre: who called, how it went (AI_SPEC §5: maker euchre rate, loner success = all five tricks)
function euchreMetrics(m, st) {
  if (st.maker === null) { m.thrown++; return; }
  const l = euchre.score(st).lines[0], round = st.calls.find((c) => c.seat === st.maker && c.call !== "pass").round;
  m.calls++; if (round === 2) m.round2++;
  if (round === 2 && st.maker === st.dealer && st.rules.stickDealer && st.calls.filter((c) => c.round === 2).length === 4) m.stuck++;
  if (l.kind === "euchre" || l.kind === "loneEuchre") { m.euchred++; if (st.alone) m.lonerEuchred++; } else m.makerPts += l.pts;
  if (l.kind === "march") m.marches++;
  if (st.alone) { m.loners++; if (l.kind === "lonerMarch") m.lonerMarch++; }
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

// T2: fixed chunks (500 hands, or 25 whole games), chunk k always seeded (seed * 100003 + k), dealt round-robin to workers
const CHUNK = { hands: 500, games: 25 };
function chunks(job) {
  const by = job.games ? "games" : "hands", total = job[by];
  return Array.from({ length: Math.ceil(total / CHUNK[by]) }, (_, k) => ({ ...job, [by]: Math.min(CHUNK[by], total - k * CHUNK[by]), seed: (job.seed || 1) * 100003 + k }));
}
async function parallel(job, workers) {
  const all = chunks(job), n = Math.min(workers, all.length);
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: all.filter((_, k) => k % n === i) });
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
      ["Nil bids vs nil-able hands", (m.nilBids / Math.max(1, m.nilChances)).toFixed(2), `${(m.nilBids / Math.max(1, m.nilPlain)).toFixed(2)} (${pct(m.nilPlain, 4 * m.hands)} of hands nil-able)`],
      ["Set rate beside a nil", pct(m.besideNilSet, m.besideNil)], ["Blind nil bids", `${m.blindBids} (${pct(m.blindMade, m.blindBids)} made)`],
      ["Team 0 / team 1 wins", `${pct(m.wins[0], m.games)} / ${pct(m.wins[1], m.games)}`]);
  } else if (game === "euchre") {
    const plain = m.calls - m.loners;
    rows.push(["Hands with a maker", pct(m.calls, m.hands)], ["Thrown in (everyone passed twice)", pct(m.thrown, m.hands)],
      ["Called in round two", pct(m.round2, m.calls)], ["Dealer stuck (forced call)", pct(m.stuck, m.calls)],
      ["Makers euchred", pct(m.euchred, m.calls)], ["Marches (all five, with partner)", pct(m.marches, plain)],
      ["Points per call (makers)", ((m.makerPts - 2 * m.euchred) / Math.max(1, m.calls)).toFixed(2)],
      ["Loners per 100 hands", ((100 * m.loners) / m.hands).toFixed(1)], ["Loner success (all five tricks)", pct(m.lonerMarch, m.loners)],
      ["Loners euchred", pct(m.lonerEuchred, m.loners)], ["Team 0 / team 1 wins", `${pct(m.wins[0], m.games)} / ${pct(m.wins[1], m.games)}`]);
  } else if (game === "ohhell") {
    rows.push(["Exact bids (took exactly what they bid)", pct(m.exactBids, m.bids)], ["Missed by taking too few / too many", `${pct(m.overBids, m.bids)} / ${pct(m.bids - m.exactBids - m.overBids, m.bids)}`],
      ["Average miss (tricks off the bid)", (m.bidErr / m.bids).toFixed(2)], ["Tables bid over / under the tricks", `${pct(m.overTables, m.hands)} / ${pct(m.underTables, m.hands)}`],
      ["Hands where the hook barred a bid", pct(m.hooked, m.hands)], ["Average points per hand, seats 0-3", m.points.map((p) => (p / m.hands).toFixed(2)).join(" / ")],
      ["Wins, seats 0-3", m.wins.map((w) => pct(w, m.games)).join(" / ")]);
  } else if (game === "whist") {
    rows.push(["Tricks per hand, team 0 / team 1", m.teamTricks.map((t) => (t / m.hands).toFixed(2)).join(" / ")], ["Points from tricks per hand", (m.trickPts / m.hands).toFixed(2)],
      ["Hands with honours (3+ to one side)", pct(m.honours, m.hands)], ["Team 0 / team 1 wins", `${pct(m.wins[0], m.games)} / ${pct(m.wins[1], m.games)}`]);
  } else {
    rows.push(["Moon rate", pct(m.moons, m.hands)], ["Moon runs stopped (one seat had every point, 10+, after trick 6)", pct(m.moonStops, m.moonAttempts), `${pct(m.moonPlainStops, m.moonPlain)} of ${m.moonPlain} (every point card taken, 5+, after trick 6)`],
      ["Average points per hand, seats 0-3", m.points.map((p) => (p / m.hands).toFixed(2)).join(" / ")],
      ["Q♠ dealt to seat 0", pct(m.qsSeat0, m.hands)], ["Wins, seats 0-3", m.wins.map((w) => pct(w, m.games)).join(" / ")]);
  }
  rows.push(["Partner-blame events shipped (sins played)", String(m.shippedSins)],
    ["Sins the guard caught in the raw heuristics", `${m.guarded} of ${m.decisions.toLocaleString("en-US")} decisions${m.guarded ? " (" + Object.entries(m.rawSins).map(([k, v]) => `${k} ${v}`).join(", ") + ")" : ""}`]);
  const plain = rows.some((r) => r[2]); // T3: the plain rule's column, where the bots' own definition is used
  console.log(`\n### ${game}, ${level}, all four seats\n\n| Metric | Value |${plain ? " Plain rule |" : ""}\n|---|---|${plain ? "---|" : ""}\n${rows.map((r) => `| ${r[0]} | ${r[1]} |${plain ? ` ${r[2] || ""} |` : ""}`).join("\n")}`);
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
  } else if (game === "euchre") {
    need(m.euchred / m.calls <= 0.2, `maker euchre rate ${pct(m.euchred, m.calls)} > 20%`);
    need(m.lonerMarch / Math.max(1, m.loners) >= 0.6, `loner success ${pct(m.lonerMarch, m.loners)} < 60%`);
    need(m.loners > 0, "nobody ever went alone");
  } else if (game === "ohhell") {
    need(m.exactBids / m.bids >= 0.5, `exact bids ${pct(m.exactBids, m.bids)} < 50%`);
    need(m.bidErr / m.bids <= 0.6, "average miss > 0.6 tricks");
  } else if (game === "whist") {
    need(Math.abs(m.teamTricks[0] - m.teamTricks[1]) / m.hands <= 0.15, "one team takes 0.15+ more tricks a hand with equal bots");
  } else {
    need(m.moons / m.hands >= 0.01 && m.moons / m.hands <= 0.04, `moon rate ${pct(m.moons, m.hands)} outside 1-4%`);
    need(m.moonStops / Math.max(1, m.moonAttempts) >= 0.6, "moon stops < 60%");
  }
  need(m.shippedSins === 0, `${m.shippedSins} sins shipped`);
  return fails;
}

async function ladder(game, strong, weak, games, preset, workers) {
  // strong side on seats 0 (+2 in spades), then swapped, so seat order can't flatter either level
  const teams = TEAMS(game), lv = (a, b) => (teams ? [a, b, a, b] : [a, b, b, b]);
  const a = await parallel({ game, levels: lv(strong, weak), preset, games: Math.ceil(games / 2), seed: 11 }, workers);
  const b = await parallel({ game, levels: teams ? lv(weak, strong) : [weak, strong, weak, weak], preset, games: Math.floor(games / 2), seed: 12 }, workers);
  const won = a.wins[0] + b.wins[1];
  const played = a.games + b.games, base = teams ? 0.5 : 0.25;
  console.log(`| ${game} | ${strong} vs ${weak} | ${played} | ${pct(won, played)} (even: ${base * 100}%) |`);
  return { won, played, base };
}

if (!isMainThread) parentPort.postMessage(merge(workerData.map(run)));
else {
  const args = process.argv.slice(2), opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const workers = +opt("workers", Math.max(1, availableParallelism() - 2)), preset = opt("preset", "standard");
  const hands = +opt("hands", 20000), all = args.includes("--all");
  const custom = Object.fromEntries(opt("custom", "").split(",").filter(Boolean).map((kv) => kv.split("=")).map(([k, v]) => [k, JSON.parse(v)]));
  const games = all ? ["spades", "hearts", "euchre", "ohhell", "whist"] : [opt("game", "spades")];
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
    for (const game of games) for (const step of opt("steps", "extreme:expert,expert:standard,standard:easy").split(",")) await ladder(game, ...step.split(":"), n, preset, workers);
  }
  if (fails.length) { console.error("\nFAILED:\n" + fails.join("\n")); process.exit(1); }
}
