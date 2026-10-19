// The whole fair deal. This file imports nothing and reads nothing but its arguments (asserted in sim/test_sim.mjs).
// A seed is 128 random bits, written as 26 Crockford base-32 characters. deal(seed, n) is a Fisher-Yates shuffle of
// 0..n-1 driven by xoshiro128** (seeded through SplitMix32), with rejection sampling so no card is favoured.
// site/verify.html runs this same file.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newSeed() {
  return encode(globalThis.crypto.getRandomValues(new Uint32Array(4)));
}

export function encode(words) {
  let n = 0n;
  for (const w of words) n = (n << 32n) | BigInt(w >>> 0);
  let s = "";
  for (let i = 0; i < 26; i++) { s = ALPHABET[Number(n & 31n)] + s; n >>= 5n; }
  return s.match(/.{1,4}/g).join("-");
}

export function decode(seed) {
  const s = String(seed).toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (s.length !== 26) throw new Error("A seed has 26 letters and digits");
  let n = 0n;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`"${ch}" is not used in seeds`);
    n = (n << 5n) | BigInt(v);
  }
  if (n >> 128n) throw new Error("This seed is out of range");
  return [96n, 64n, 32n, 0n].map((k) => Number((n >> k) & 0xffffffffn));
}

function rng(words) {
  const s = new Uint32Array(4);
  let x = 0;
  for (let i = 0; i < 4; i++) { // SplitMix32 over each word, so similar seeds give unrelated streams
    x = (x + words[i] + 0x9e3779b9) | 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    s[i] = z ^ (z >>> 16);
  }
  if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
  const rotl = (v, k) => (v << k) | (v >>> (32 - k));
  return () => { // xoshiro128**
    const out = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
    return out;
  };
}

export function deal(seed, n) {
  const next = rng(decode(seed)), p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const m = i + 1, limit = Math.floor(0x100000000 / m) * m;
    let x;
    do x = next(); while (x >= limit);
    const j = x % m;
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
