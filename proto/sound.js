// Table sounds, synthesised (no audio files): card snap, shuffle riffle, trick sweep, a chime for a made bid, a low thud
// for a set. iOS: Web Audio follows the ring/silent switch ("ambient") unless Options asks for a "playback" session.
let ctx = null, on = true;
const ac = () => {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
};
addEventListener("visibilitychange", () => { if (document.hidden && ctx) { ctx.close().catch(() => {}); ctx = null; } }); // rebuilt on the next sound

function noise(dur, freq, q, gain, t0 = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + t0, len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}
function tone(freq, dur, gain, t0 = 0, type = "sine") {
  const a = ac(); if (!a) return;
  const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const sound = {
  set enabled(v) { on = !!v; }, get enabled() { return on; },
  setIgnoreSilent(v) { try { if (navigator.audioSession) navigator.audioSession.type = v ? "playback" : "ambient"; } catch {} },
  card() { if (on) noise(0.07, 2400, 0.9, 0.35); },
  shuffle() { if (on) for (let i = 0; i < 14; i++) noise(0.05, 1800 + Math.random() * 900, 1.2, 0.12, i * 0.035); },
  sweep() { if (on) noise(0.22, 900, 0.6, 0.18); },
  made() { if (on) [523, 659, 784].forEach((f, i) => tone(f, 0.5, 0.12, i * 0.09)); },
  set() { if (on) tone(110, 0.45, 0.25, 0, "triangle"); },
};
