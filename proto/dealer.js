// The whole fair deal. This file imports nothing and reads nothing but its arguments (asserted in sim/test_sim.mjs).
// A seed is 128 random bits, written as 26 Crockford base-32 characters. deal(seed, n) is a Fisher-Yates shuffle of
// 0..n-1 driven by xoshiro128** (seeded through SplitMix32), with rejection sampling so no card is favoured.
// fingerprint(seed) is shown before the deal, so the seed is fixed before the player cuts (cards.js mixes the cut in).
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

// The first 16 hex digits (64 bits) of SHA-256 over the seed's 16 bytes, as "A1B2 C3D4 E5F6 7788". Any SHA-256 tool
// gives the same answer.
export function fingerprint(seed) {
  return sha256(seedBytes(seed)).slice(0, 16).toUpperCase().match(/.{4}/g).join(" ");
}

export function seedBytes(seed) { // the 128 bits, most significant byte first
  const b = new Uint8Array(16);
  decode(seed).forEach((w, i) => { b[4 * i] = w >>> 24; b[4 * i + 1] = w >>> 16; b[4 * i + 2] = w >>> 8; b[4 * i + 3] = w; });
  return b;
}

// SHA-256 (FIPS 180-4) of a byte array, as 64 hex digits
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(bytes) {
  const len = bytes.length, m = new Uint8Array(((len + 72) >> 6) << 6), w = new Uint32Array(64);
  m.set(bytes); m[len] = 0x80; // pad: a 1 bit, zeros, then the length in bits
  new DataView(m.buffer).setUint32(m.length - 4, len * 8);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const ror = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < m.length; o += 64) {
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      else {
        const x = w[i - 15], y = w[i - 2];
        w[i] = (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10)) + w[i - 7] + w[i - 16];
      }
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, k].forEach((v, i) => (h[i] = (h[i] + v) | 0));
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
}
