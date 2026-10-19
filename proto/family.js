// Family tables, the GameKit spike (docs/DESIGN.md §9). Host-authoritative: the host (lowest player id) makes every seed,
// runs the rules and the bots, and tells the table each action ("did"); a guest only sends its own choices ("act") and
// applies what the host says. Both run the same pure rules engine, so every trick (and every pass) carries a state hash;
// a guest that disagrees asks for the host's state ("resync"). A player who drops is played by a bot from then on.
// ponytail: a guest's engine holds every hand in memory; fine between family members, a server-dealt view if strangers ever play.
// Messages: start { seed, game, rules, preset, seats, dealer, handNo, totals } · act { seat, a } · did { seat, a, seq, h } · resync · state { st, seq }

export function hash(st) { // FNV-1a over what both sides must agree on
  let h = 2166136261;
  for (const ch of JSON.stringify([st.hands, st.taken, st.turn, st.phase, st.totals])) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

let current = null; // one table at a time; the native listeners are added once and follow it
const wired = new WeakSet();

// Signs in and listens. onMatched(net) runs once, when Game Center (or the other browser tab) has seated everyone.
export async function joinTable(table, onMatched) {
  current?.leave();
  const me = await table?.authenticate().catch(() => null);
  if (!me?.ok) return null;
  const net = current = {
    me: me.player.id, name: me.player.name, host: false, hostId: null, players: [], queue: [], gone: new Set(), seq: 0, desyncs: 0, cur: null, wake: null, onMatched,
    send: (m) => table.send(JSON.stringify(m)).catch(() => {}),
    alive: (id) => net.players.some((p) => p.id === id) && !net.gone.has(id),
    leave() { if (current === net) current = null; net.gone = new Set(net.players.map((p) => p.id)); net.wake?.(); table.leave().catch(() => {}); },
    async take(pred, from) { // the next message from `from` that matches, or null once that player has gone
      for (;;) {
        const i = net.queue.findIndex((x) => pred(x) && (!from || x.from === from));
        if (i >= 0) return net.queue.splice(i, 1)[0];
        if (from && net.gone.has(from)) return null;
        await new Promise((r) => (net.wake = r));
      }
    },
    async intent(seat, from, ok) { // host: the guest's choice for its seat, once it is legal
      for (;;) { const x = await net.take((x) => x.t === "act" && x.seat === seat, from); if (!x) return null; if (ok(x.a)) return x.a; }
    },
    async did(seat) { // guest: what the host says happened at this seat
      const x = await net.take((x) => x.t === "did" && x.seat === seat, net.hostId);
      net.h = x?.h; if (x) net.seq = x.seq;
      return x ? x.a : null;
    },
    async applied(st, seat, a) { // after every action: the host tells the table; a guest checks the hash and resyncs if it differs
      const h = st.trick.length ? undefined : hash(st);
      if (net.host) { net.seq++; net.cur = st; return net.send({ t: "did", seat, a, seq: net.seq, h }); }
      if (net.h === undefined || net.h === h) return;
      net.desyncs++; net.send({ t: "resync" });
      const s = await net.take((x) => x.t === "state", net.hostId);
      if (!s) return;
      Object.assign(st, s.st); net.seq = s.seq;
      net.queue = net.queue.filter((x) => x.t !== "did" || x.seq > s.seq);
    },
  };
  if (!wired.has(table)) {
    wired.add(table);
    table.on("data", ({ from, data }) => {
      const n = current; if (!n) return;
      let m; try { m = JSON.parse(data); } catch { return; }
      if (m.t === "resync" && n.host) return n.send({ t: "state", st: n.cur, seq: n.seq });
      m.from = from; n.queue.push(m); n.wake?.();
    });
    table.on("playerState", ({ player, state }) => { const n = current; if (n && state === "disconnected") { n.gone.add(player); n.wake?.(); } });
    table.on("matched", (m) => {
      const n = current; if (!n || n.players.length) return;
      n.players = m.players; n.hostId = m.host; n.host = m.host === n.me;
      n.onMatched(n);
    });
  }
  return net;
}
