// Table sounds, synthesised (no audio files) and deliberately soft: airy, breathy, like a card brushing felt in a quiet
// room. Everything is filtered noise or a low sine with slow attacks, through one gentle low-pass, so nothing clicks.
// iOS: Web Audio follows the ring/silent switch ("ambient") unless Options asks for a "playback" session.
let ctx = null, out = null, on = true;
const ac = () => {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    out = ctx.createBiquadFilter(); out.type = "lowpass"; out.frequency.value = 3200; out.Q.value = 0.4; // takes the edge off everything
    const g = ctx.createGain(); g.gain.value = 0.8;
    out.connect(g).connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
};
addEventListener("visibilitychange", () => { if (document.hidden && ctx) { ctx.close().catch(() => {}); ctx = null; } }); // rebuilt on the next sound

let noiseBuf = null;
function noise(a) {
  if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
  const len = a.sampleRate * 2; noiseBuf = a.createBuffer(1, len, a.sampleRate);
  const d = noiseBuf.getChannelData(0); let b = 0;
  for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; } // brown-ish: softer than white noise
  return noiseBuf;
}
// a breath of air: noise through a band-pass that drifts from f0 to f1, rising gently and fading out
function breath(dur, f0, f1, gain, { attack = 0.03, q = 0.8, t0 = 0, pan = 0 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + t0, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise(a); f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = src.connect(f).connect(g);
  if (pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
// a soft round tone with a slow swell, for the chimes
function tone(freq, dur, gain, { t0 = 0, attack = 0.06, glide = 1 } = {}) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(freq, t); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

export const sound = {
  set enabled(v) { on = !!v; }, get enabled() { return on; },
  setIgnoreSilent(v) { try { if (navigator.audioSession) navigator.audioSession.type = v ? "playback" : "ambient"; } catch {} },
  card() { if (on) breath(0.22, 2200, 900, 0.05, { attack: 0.025, q: 0.6, pan: (Math.random() - 0.5) * 0.4 }); },
  shuffle() { if (on) for (let i = 0; i < 7; i++) breath(0.28, 1600 + Math.random() * 600, 700, 0.03, { t0: i * 0.07, attack: 0.04, q: 0.5, pan: i % 2 ? 0.25 : -0.25 }); },
  sweep() { if (on) breath(0.6, 700, 260, 0.06, { attack: 0.12, q: 0.45 }); },
  made() { if (on) { [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 1.4, 0.022, { t0: i * 0.11, attack: 0.08 })); breath(0.9, 3000, 1800, 0.012, { attack: 0.2, q: 1.2 }); } },
  set() { if (on) { tone(196, 1.1, 0.035, { attack: 0.1, glide: 0.85 }); breath(0.8, 500, 220, 0.03, { attack: 0.15, q: 0.5 }); } },
};
