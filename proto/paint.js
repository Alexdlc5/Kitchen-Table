// Painterly sample: "Dibble finds a crystal vein". Hand-built shapes (jittered Catmull-Rom curves, tapered brush
// strokes), tinted variable-weight lines that vanish on the lit side, two-light shading (warm lantern right, cool cave
// light top-left), paper/brush texture. Nothing is a primitive circle, ellipse or rectangle.
let uid = 0;
export const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const f2 = (n) => n.toFixed(1);

// smooth closed curve through points (Catmull-Rom → cubic Bézier)
export function curve(pts, closed = true) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return d + (closed ? " Z" : "");
}
// irregular organic outline around a centre (radius varies per point, plus a lean)
export function ring(cx, cy, rx, ry, n, jit, seed, rot = 0, squash = (a) => 1) {
  const r = rng(seed);
  return [...Array(n)].map((_, k) => {
    const a = (k / n) * Math.PI * 2 + (r() - .5) * .18, j = 1 + (r() - .5) * jit, s = squash(a);
    const x = Math.cos(a) * rx * j * s, y = Math.sin(a) * ry * j * s;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });
}
// a painted shape: tinted line shows only where the shape turns away from the lantern (offset down-left), body on top
export const shape = (d, fill, line, off = [-1.8, 1.6], extra = "") =>
  `<path d="${d}" fill="${line}" transform="translate(${off[0]} ${off[1]})"/><path d="${d}" fill="${fill}" ${extra}/>`;
// a tapered brush stroke from (x,y) along angle a, length len, base width w
export function stroke(x, y, a, len, w, col, op = 1, bend = .25) {
  const nx = -Math.sin(a), ny = Math.cos(a), tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
  const mx = x + Math.cos(a) * len * .5 + nx * len * bend, my = y + Math.sin(a) * len * .5 + ny * len * bend;
  return `<path d="M${f2(x + nx * w)} ${f2(y + ny * w)} Q${f2(mx + nx * w * .6)} ${f2(my + ny * w * .6)} ${f2(tx)} ${f2(ty)} Q${f2(mx - nx * w * .6)} ${f2(my - ny * w * .6)} ${f2(x - nx * w)} ${f2(y - ny * w)} Z" fill="${col}" opacity="${op}"/>`;
}
// fur: tufts sprouting outward along an outline, colour and length varying
// a rounded clump of fur (smooth lobe, no sharp tip)
function lobe(x, y, a, len, w, col, op = 1) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const pts = [[x + nx * w, y + ny * w], [x + dx * len * .55 + nx * w * 1.05, y + dy * len * .55 + ny * w * 1.05], [x + dx * len + nx * w * .35, y + dy * len + ny * w * .35],
    [x + dx * len * 1.06, y + dy * len * 1.06], [x + dx * len - nx * w * .35, y + dy * len - ny * w * .35], [x + dx * len * .55 - nx * w * 1.05, y + dy * len * .55 - ny * w * 1.05], [x - nx * w, y - ny * w]];
  return `<path d="${curve(pts)}" fill="${col}" opacity="${op}"/>`;
}
export function furEdge(pts, cx, cy, cols, seed, len = 6, w = 3.2) {
  const r = rng(seed); let out = "";
  pts.forEach(([x, y]) => { for (let k = 0; k < 2; k++) {
    const a = Math.atan2(y - cy, x - cx) + (r() - .5) * .8, back = 4 + r() * 2;
    out += lobe(x - Math.cos(a) * back, y - Math.sin(a) * back, a, (len * .7 + back) * (.75 + r() * .4), w * (1.1 + r() * .5), cols[Math.floor(r() * cols.length)]); } });
  return out;
}
// tapered limb along a quadratic path: width w1 at the shoulder narrowing to w2
// cartoon pie-cut eye: cream eye with its darker edge peeking out down-left (no ink ring), big pupil with a wedge of
// light cut out of its top-right (the lantern side)
export function pieEye(cx, cy, seed, dur = 4.6, rx = 5.8, ry = 8, line = "#241812", lw = 1.4) {
  const k = rx / 5.8, px = cx + .9 * k, py = cy + 1.2 * ry / 8, pw = 4.3 * k, ph = 6 * ry / 8, a1 = -Math.PI * .42, a2 = -Math.PI * .08;
  return `<g transform="translate(${cx} ${cy})"><g><animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 .1;1 1" keyTimes="0;.94;.97;1" dur="${dur}s" repeatCount="indefinite"/><g transform="translate(${-cx} ${-cy})">
    ${shape(curve(ring(cx, cy, rx, ry, 10, .05, seed)), "#fbf3e6", line, [-lw * .8, lw * .8])}
    <path d="${curve(ring(px, py, pw, ph, 10, .04, seed + 1))}" fill="${line}"/>
    <path d="M${f2(px)} ${f2(py)} L${f2(px + Math.cos(a1) * pw)} ${f2(py + Math.sin(a1) * ph)} A${pw} ${ph} 0 0 1 ${f2(px + Math.cos(a2) * pw)} ${f2(py + Math.sin(a2) * ph)} Z" fill="#fbf3e6"/></g></g></g>`;
}
// tufts that belong to the silhouette: tinted outline copy goes under the shape, fill copy over it
export const tuftLine = (pts, cx, cy, line, seed, len, w, off = [-1.8, 1.6]) => `<g transform="translate(${off[0]} ${off[1]})">${furEdge(pts, cx, cy, [line], seed, len, w)}</g>`;
export function limb(x1, y1, cx, cy, x2, y2, w1, w2) {
  const L = [], R = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cx + t * t * x2, y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx), dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy), l = Math.hypot(dx, dy) || 1;
    const w = (w1 + (w2 - w1) * t) * (1 + Math.sin(t * Math.PI) * .12);
    L.push([x - dy / l * w, y + dx / l * w]); R.unshift([x + dy / l * w, y - dx / l * w]); }
  return curve([...L, ...R]);
}

// Dibble in the approved painterly style, in his own 400x500 "sample" coordinates (feet at y 418).
// o = { fur, hat (svg in the old 100-box hat coords, or null for the painted leaf), lantern (svg in the old
// lantern coords, or null for the painted amber one), scarf (colour or "none") }. Returns { defs, body }.
export function dibbleBody(id, o = {}) {
  const f = o.fur || "#7b5844", r = rng(29);
  const C = { fur: f, furWarm: mix(f, "#e8a868", .32), furCool: mix(f, "#454056", .3), furDeep: mix(f, "#1a0f08", .5), line: mix(f, "#1a0f08", .62),
    cream: mix(f, "#f3e2c6", .72), nose: "#c48690", leaf: "#7f9a5e", leafDeep: "#4f6a3d" };
  C.creamCool = mix(C.cream, "#7a7a80", .25);
  const head = ring(150, 246, 50, 47, 18, .05, 3, -.14), body = ring(146, 330, 46, 50, 22, .1, 5, -.08, (a) => a > 0 && a < Math.PI ? 1.06 : .98);
  const belly = ring(150, 350, 26, 28, 14, .12, 9, -.1), snout = ring(172, 256, 17, 13, 12, .12, 13, -.25);
  { const k = snout.reduce((m, q, i) => q[1] < snout[m][1] ? i : m, 0); snout[k] = [165, 238]; }
  return { defs: `<filter id="${id}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="${id}blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <clipPath id="${id}H"><path d="${curve(head)}"/></clipPath><clipPath id="${id}B"><path d="${curve(body)}"/></clipPath>
  `, body: `    <g>
      <path d="${curve(ring(150, 412, 50, 7, 12, .2, 40))}" fill="#0f0e0b" opacity=".45" filter="url(#${id}blur2)"/>
      ${shape(limb(126, 368, 118, 392, 113, 406, 13, 9), C.fur, C.line)}
      ${shape(limb(166, 368, 174, 392, 179, 406, 13, 9), C.fur, C.line)}
      <path d="${limb(130, 372, 124, 392, 118, 404, 5, 3)}" fill="${C.furCool}" opacity=".5" filter="url(#${id}blur2)"/>
      ${shape(curve(ring(112, 410, 15, 7, 10, .14, 63, -.1)), "#c99a8c", "#6a4038", [-1.3, 1.2])}
      ${shape(curve(ring(180, 410, 15, 7, 10, .14, 65, .08)), "#d9aa98", "#6a4038", [-1.3, 1.2])}
      ${[[[105, 403], [112, 405], [119, 404]], [[172, 404], [179, 405], [186, 403]]].map((pts, k) => { const cx = pts[1][0];
        return tuftLine(pts, cx, 394, C.line, 71 + k, 4, 2.6, [-1.2, 1.2]) + furEdge(pts, cx, 394, [C.fur], 71 + k, 4, 2.6); }).join("")}
      ${[[100, 414], [106, 416], [112, 416.5]].map(([x, y]) => stroke(x, y, 2.2, 3, 1, "#efe2d2", .9)).join("")}
      ${tuftLine(body.filter((_, k) => [0, 1, 6, 7, 12, 15, 16, 19].includes(k)), 146, 330, C.line, 23, 6, 3.2)}
      ${shape(curve(body), C.fur, C.line)}
      ${furEdge(body.filter((_, k) => [0, 1, 6, 7, 12, 15, 16, 19].includes(k)), 146, 330, [C.fur], 23)}
      <g clip-path="url(#${id}B)">
        <path d="${curve(ring(120, 362, 42, 46, 10, .2, 17))}" fill="${C.furCool}" opacity=".7" filter="url(#${id}soft)"/>
        <path d="${curve(ring(182, 322, 30, 40, 10, .2, 19))}" fill="${C.furWarm}" opacity=".75" filter="url(#${id}soft)"/>
        ${shape(curve(belly), C.cream, mix(C.cream, C.line, .35), [-1.2, 1])}
        <path d="${curve(ring(140, 362, 18, 16, 8, .2, 21))}" fill="${C.creamCool}" opacity=".55" filter="url(#${id}soft)"/>
        ${[...Array(9)].map((_, k) => stroke(132 + r() * 36, 330 + r() * 46, 1.4 + (r() - .5) * .6, 5 + r() * 4, 1.1, C.furDeep, .25)).join("")}
      </g>

      <path d="${curve(body.slice(1, 7), false)}" stroke="#ffc98a" stroke-width="2.6" fill="none" opacity=".5" stroke-linecap="round" filter="url(#${id}blur2)"/>
      ${tuftLine([[104, 340], [98, 356]], 128, 352, C.line, 61, 5, 3)}
      ${shape(limb(112, 324, 88, 350, 100, 382, 12, 7.5), C.fur, C.line)}
      ${furEdge([[104, 340], [98, 356]], 128, 352, [C.fur], 61, 5, 3)}
      ${shape(curve(ring(101, 386, 9, 7.5, 9, .18, 25, .3)), "#d9a99c", "#7a4a42", [-1.3, 1.2])}
      ${[[94, 391], [100, 393.5], [106.5, 392.5]].map(([x, y]) => stroke(x, y, 1.8, 3.2, 1.1, "#efe2d2")).join("")}
      <g transform="translate(0 10) rotate(-9 150 236)">
        ${tuftLine(head.filter((_, k) => [2, 6, 7, 9, 13, 16].includes(k)), 150, 246, C.line, 37, 7, 3.4, [-2, 1.8])}
        ${shape(curve(head), C.fur, C.line, [-2, 1.8])}
        ${furEdge(head.filter((_, k) => [2, 6, 7, 9, 13, 16].includes(k)), 150, 246, [C.fur], 37, 7, 3.4)}
        <g clip-path="url(#${id}H)">
          <path d="${curve(ring(122, 262, 40, 40, 10, .2, 31))}" fill="${C.furCool}" opacity=".65" filter="url(#${id}soft)"/>
          <path d="${curve(ring(186, 222, 30, 46, 10, .2, 33))}" fill="${C.furWarm}" opacity=".8" filter="url(#${id}soft)"/>
          <path d="${curve(ring(130, 200, 26, 14, 8, .25, 35))}" fill="#9aa59a" opacity=".22" filter="url(#${id}soft)"/>
          ${[...Array(12)].map((_, k) => stroke(116 + r() * 70, 206 + r() * 60, -2.2 + (r() - .5) * .8, 5 + r() * 5, 1, C.furDeep, .2)).join("")}
        </g>
        <path d="${curve(ring(150, 212, 44, 9, 10, .2, 53))}" fill="${C.furDeep}" opacity=".55" filter="url(#${id}blur2)" clip-path="url(#${id}H)"/>
        <path d="${curve(head.slice(2, 7), false)}" stroke="#ffc98a" stroke-width="2.4" fill="none" opacity=".55" stroke-linecap="round" filter="url(#${id}blur2)"/>
        ${shape(curve(snout), C.cream, mix(C.cream, C.line, .4), [-1.4, 1.2])}
        <path d="${curve(ring(166, 262, 11, 7, 8, .2, 41))}" fill="${C.creamCool}" opacity=".5" filter="url(#${id}blur2)"/>
        ${shape(curve(ring(180, 248, 6.4, 4.8, 9, .15, 43, -.3)), C.nose, "#7a3f48", [-1, 1])}
        <path d="M177.8 245.6 q2 -1.2 3.6 .2" stroke="#f3dcd8" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".85"/>
        <!-- cartoon eyes, one brow raised in curiosity -->
        ${pieEye(150, 234, 45, 4.6, 6.6, 9)}${pieEye(178, 232, 47, 4.6, 6.6, 9)}
        <path d="M140.6 220.2 Q148 216 156.6 218.4" stroke="#2a1a14" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M170.8 217.6 Q177.4 212.4 184.4 216.2" stroke="#2a1a14" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${shape(`M164 266 Q170 272.4 178.6 266.8 Q176 272.8 169.4 273.2 Q165.4 272.4 164 266 Z`, "#5e2f2c", "#2a1512", [-.6, .6])}
        <path d="M168.6 271.6 Q171.4 270 174.4 271.4 Q172 273 168.6 271.6 Z" fill="#c9767a"/>
        <path d="${curve(ring(130, 252, 9, 5, 8, .3, 47))}" fill="#d98f8f" opacity=".38" filter="url(#${id}blur2)"/>
        <path d="${curve(ring(186, 240, 7, 4, 8, .3, 49))}" fill="#e39a8c" opacity=".4" filter="url(#${id}blur2)"/>
        ${[[184, 258, -.2], [185, 263, .1], [186, 268, .35]].map(([x, y, a]) => stroke(x, y, a, 15, .55, "#2a1a14", .45, .02)).join("")}
        ${o.hat ? `<g transform="translate(150 214) scale(2.1) translate(-50 -28)">${o.hat}</g>` : leafCap(id)}
      </g>
      ${o.scarf && o.scarf !== "none" ? `<path d="M110 300 Q150 324 194 294" stroke="${mix(o.scarf, "#1a0f08", .55)}" stroke-width="15" fill="none" stroke-linecap="round" transform="translate(-1.6 1.6)"/>
        <path d="M110 300 Q150 324 194 294" stroke="${o.scarf}" stroke-width="15" fill="none" stroke-linecap="round"/>
        <path d="M116 300 Q150 318 188 296" stroke="${mix(o.scarf, "#ffffff", .35)}" stroke-width="2" stroke-dasharray="2.5 4" fill="none" opacity=".5"/>
        ${shape(limb(164, 310, 168, 326, 174, 344, 7, 6), mix(o.scarf, "#1a0f08", .12), mix(o.scarf, "#1a0f08", .55), [-1.4, 1.2])}` : ""}
      <!-- lantern arm reaching toward the vein, lantern swinging a little -->
      <path d="${limb(180, 332, 208, 342, 224, 350, 9, 4)}" fill="${C.furDeep}" opacity=".22" filter="url(#${id}blur2)"/>
      ${tuftLine([[204, 330], [212, 336]], 198, 320, mix(C.fur, C.line, .45), 67, 4.5, 2.6)}
      ${shape(limb(182, 318, 212, 326, 228, 342, 12.5, 5.5), C.fur, mix(C.fur, C.line, .45))}
      ${furEdge([[204, 330], [212, 336]], 198, 320, [C.fur], 67, 4.5, 2.6)}
      <path d="${limb(186, 313, 212, 320, 226, 337, 3.5, 1.4)}" fill="${C.furWarm}" opacity=".75" filter="url(#${id}blur2)"/>
      <g><animateTransform attributeName="transform" type="rotate" values="-4 231 344;4 231 344;-4 231 344" dur="3.4s" repeatCount="indefinite"/><g transform="translate(0 72)">
        <path d="M222 289 Q231 266 240 289" stroke="#4a3a2a" stroke-width="1.5" fill="none"/>
        ${o.lantern ? `<g transform="translate(231 287) scale(1.9) translate(-80 -54)">${o.lantern}</g>` : amberLantern(id)}
      </g></g>
      ${shape(curve(ring(231, 342, 8, 7, 9, .18, 55, .2)), "#d9a99c", "#7a4a42", [-1.3, 1.2])}
      <path d="M233 337 q3 3 1 7" stroke="#ffe0b0" stroke-width="1.2" fill="none" opacity=".8" stroke-linecap="round"/>
    </g>` };
}

// Dibble's own leaf cap (sample coords; needs the ${id}blur2 filter): one big irregular leaf with veins, a curled sprout
export function leafCap(id, leaf = "#7f9a5e", deep = "#4f6a3d") {
  return `${shape(curve([[98, 218], [112, 194], [146, 184], [180, 188], [202, 208], [186, 208], [150, 202], [114, 212]]), leaf, deep, [-1.6, 1.6])}
    <path d="M104 214 Q148 194 196 206" stroke="${deep}" stroke-width="1.2" fill="none" opacity=".7"/>
    ${[[122, 205, -.9], [140, 199, -1], [160, 197, -1.1], [178, 200, -1.2]].map(([x, y, a]) => stroke(x, y, a, 8, .7, deep, .6, .1)).join("")}
    <path d="${curve(ring(150, 196, 22, 5, 8, .3, 51))}" fill="#b6c98e" opacity=".35" filter="url(#${id}blur2)"/>
    ${shape(curve([[150, 190], [156, 172], [168, 162], [180, 164], [170, 176], [158, 188]]), "#93ad6c", deep, [-1.2, 1.2])}
    <path d="M152 188 Q164 174 176 166" stroke="${deep}" stroke-width=".9" fill="none" opacity=".8"/>`;
}
// Dibble's amber lantern (sample coords, hanging from (231, 287); needs the ${id}blur2 filter)
export const amberLantern = (id) => `${shape(curve([[220, 287], [242, 286], [244, 291], [218, 292]]), "#6a5236", "#2a1e14", [-1, 1])}
  ${shape(curve([[222, 292], [240, 292], [241, 312], [221, 312]]), "#ffd894", "#7a5226", [-1.2, 1.1])}
  <path d="${curve([[225, 296], [237, 296], [237, 309], [225, 309]])}" fill="#fff4d6" opacity=".9" filter="url(#${id}blur2)"/>
  ${stroke(226, 293, 1.57, 18, .65, "#5a4028", .8, .01)}${stroke(236, 293, 1.57, 18, .65, "#5a4028", .8, .01)}
  ${shape(curve([[219, 312], [243, 311], [242, 316], [220, 316]]), "#6a5236", "#2a1e14", [-1, 1])}`;

export function sampleScene() {
  const id = "pt" + uid++, r = rng(11), D = dibbleBody(id + "d");
  // palette: muted, earthy, nothing straight from a swatch
  const C = { fur: "#7b5844", furWarm: "#a9774f", furCool: "#5a4a4e", furDeep: "#3f2c25", line: "#3a2620",
    cream: "#e2cdb0", creamCool: "#b9aa9a", nose: "#c48690", leaf: "#7f9a5e", leafDeep: "#4f6a3d",
    crystal: "#5fa99b", crystalLight: "#a9dccf", crystalDeep: "#2f5f5a", amberGlow: "#ffcf8a", rock: "#3c3a33", rockLight: "#5d5a4e" };
  const crystals = [[300, 402, 22, 80, -.18, C.crystal], [330, 404, 16, 62, .12, "#6fb4a3"], [276, 406, 13, 46, -.42, "#4e978c"],
    [352, 408, 12, 44, .38, "#5aa194"], [312, 408, 9, 32, .02, "#c9a061"], [292, 410, 7, 24, -.7, "#5fa99b"]];
  const crystal = ([x, y, w, h, a, c], k) => {
    const pts = [[-w * .55, 0], [-w * .62, -h * .55], [-w * .1, -h], [w * .5, -h * .62], [w * .58, 0]]
      .map(([px, py]) => { const j = 1 + (r() - .5) * .12; return [x + (px * Math.cos(a) - py * Math.sin(a)) * j, y + (px * Math.sin(a) + py * Math.cos(a)) * j]; });
    const [b1, s1, t, s2, b2] = pts, mid = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
    return `<path d="M${pts.map((p) => p.map(f2).join(" ")).join(" L")} Z" fill="${mix(c, "#0e1c1a", .45)}" transform="translate(-1.6 1.4)"/>
      <path d="M${pts.map((p) => p.map(f2).join(" ")).join(" L")} Z" fill="url(#${id}cr)" style="--c:${c}" />
      <path d="M${pts.map((p) => p.map(f2).join(" ")).join(" L")} Z" fill="${c}" opacity=".55"/>
      <path d="M${f2(t[0])} ${f2(t[1])} L${f2(s2[0])} ${f2(s2[1])} L${f2(b2[0])} ${f2(b2[1])} L${f2(mid[0])} ${f2(mid[1])} Z" fill="${C.amberGlow}" opacity=".22"/>
      <path d="M${f2(t[0])} ${f2(t[1])} L${f2(s1[0])} ${f2(s1[1])} L${f2(b1[0])} ${f2(b1[1])} L${f2(mid[0])} ${f2(mid[1])} Z" fill="${C.crystalDeep}" opacity=".35"/>
      <path d="M${f2(t[0])} ${f2(t[1])} L${f2(mid[0])} ${f2(mid[1])}" stroke="${C.crystalLight}" stroke-width="1.1" opacity=".55" stroke-linecap="round"/>
      ${k < 2 ? `<path d="M${f2(t[0] + 2)} ${f2(t[1] + 6)} l2.5 -6 l2.5 6 l-2.5 1.6 Z" fill="#f4fff8" opacity=".8"/>` : ""}`;
  };
  const roots = [[60, -10, 52, 70, 46, 140, 7], [104, -10, 118, 60, 98, 112, 5], [238, -10, 226, 70, 246, 128, 6], [338, -10, 354, 80, 330, 150, 8]]
    .map(([x1, y1, cx, cy, x2, y2, w]) => shape(limb(x1, y1, cx, cy, x2, y2, w, .8), "#4a3a2c", "#2a2018", [-1.4, 1]) +
      stroke(x2 - 1, y2 - 6, 1.9, 9, 2.6, "#6f8a52", .9) + stroke(x2 + 1, y2 - 14, 1.2, 8, 2.2, "#86a064", .8)).join("");
  const motes = [...Array(16)].map((_, k) => { const x = 200 + r() * 150, y = 220 + r() * 130, s = .8 + r() * 1.6;
    return `<path d="M${f2(x)} ${f2(y - s)} q${f2(s * .9)} ${f2(s * .4)} 0 ${f2(s * 2)} q${f2(-s * .9)} ${f2(-s * .4)} 0 ${f2(-s * 2)} Z" fill="#ffe4b0" opacity="${(.3 + r() * .5).toFixed(2)}">
      <animate attributeName="opacity" values=".1;.8;.1" dur="${(2 + r() * 3).toFixed(1)}s" begin="${(-r() * 3).toFixed(1)}s" repeatCount="indefinite"/></path>`; }).join("");
  const fern = (x, y, a, s, col) => { let o = ""; for (let k = 0; k < 9; k++) { const t = k / 9, px = x + Math.cos(a) * s * t, py = y + Math.sin(a) * s * t;
    o += stroke(px, py, a - 1.1, s * .32 * (1 - t * .6), 3.2 * (1 - t * .5), col) + stroke(px, py, a + 1.1, s * .3 * (1 - t * .6), 3 * (1 - t * .5), col); }
    return o + stroke(x, y, a, s, 2.6, col, 1, .05); };
  return `<svg viewBox="0 0 400 500" width="100%" style="display:block" aria-label="Dibble finds a crystal vein">
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#33463c"/><stop offset=".55" stop-color="#252e28"/><stop offset="1" stop-color="#1b1c18"/></linearGradient>
    <linearGradient id="${id}cr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.crystalLight}"/><stop offset=".55" stop-color="${C.crystal}"/><stop offset="1" stop-color="${C.crystalDeep}"/></linearGradient>
    <radialGradient id="${id}lamp" cx="231" cy="372" r="190" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd59a" stop-opacity=".75"/><stop offset=".3" stop-color="#e9a45a" stop-opacity=".26"/><stop offset="1" stop-color="#e9a45a" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}vein" cx="318" cy="370" r="90" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7fd6c2" stop-opacity=".4"/><stop offset="1" stop-color="#7fd6c2" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}shaft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe3d8" stop-opacity=".22"/><stop offset="1" stop-color="#cfe3d8" stop-opacity="0"/></linearGradient>
    <filter id="${id}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="${id}blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="${id}rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="turbulence" baseFrequency=".05" numOctaves="2" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3.2"/></filter>
    <filter id="${id}paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="7" result="n"/>
      <feColorMatrix in="n" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .44  0 0 0 .55 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>
      <feBlend in="SourceGraphic" in2="gi" mode="multiply"/></filter>
    <filter id="${id}brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .18" numOctaves="3" seed="2" result="b"/>
      <feColorMatrix in="b" values="0 0 0 0 .3  0 0 0 0 .26  0 0 0 0 .2  0 0 0 .5 -.12" result="bb"/><feComposite in="bb" in2="SourceGraphic" operator="in" result="bi"/>
      <feBlend in="SourceGraphic" in2="bi" mode="multiply"/></filter>
    ${D.defs}
  </defs>
  <g filter="url(#${id}paper)">
    <rect width="400" height="500" fill="url(#${id}bg)"/>
    <!-- cave walls framing an opening at the upper left -->
    <g filter="url(#${id}rough)">
      <path d="${curve([[-20, -20], [180, -20], [150, 30], [96, 52], [60, 120], [30, 230], [-20, 300]])}" fill="#1a1e1a"/>
      <path d="${curve([[160, -20], [420, -20], [420, 520], [380, 470], [400, 300], [360, 190], [300, 120], [240, 70]])}" fill="#22231e"/>
      <path d="${curve([[300, 150], [380, 170], [404, 300], [396, 420], [330, 400], [262, 330], [270, 230]])}" fill="#2b2a23"/>
    </g>
    <g filter="url(#${id}soft)">
      ${[...Array(14)].map((_, k) => { const right = k % 2, x = right ? 290 + r() * 100 : r() * 80, y = right ? 80 + r() * 320 : 20 + r() * 260;
        return `<path d="${curve(ring(x, y, 14 + r() * 18, 10 + r() * 14, 9, .3, 70 + k))}" fill="${["#3a382f", "#2a3029", "#191b17", "#403b30"][k % 4]}" opacity="${(.35 + r() * .3).toFixed(2)}"/>`; }).join("")}
    </g>
    <path d="${curve([[262, 330], [270, 230], [300, 150]], false)}" stroke="#d9a466" stroke-width="5" fill="none" opacity=".28" filter="url(#${id}soft)"/>
    <path d="M80 -10 L160 -10 L270 470 L180 470 Z" fill="url(#${id}shaft)" filter="url(#${id}soft)" opacity=".8"/>
    <path d="M100 -10 L130 -10 L230 440 L200 440 Z" fill="url(#${id}shaft)" filter="url(#${id}soft)" opacity=".6"/>
    <g filter="url(#${id}brush)">${roots}</g>
    <!-- crystal vein glowing in the far wall -->
    <circle cx="318" cy="370" r="95" fill="url(#${id}vein)"/>
    ${crystals.map(crystal).join("")}
    <!-- uneven ground, pebbles, a little moss -->
    <g filter="url(#${id}rough)">
      <path d="${curve([[-20, 420], [80, 398], [190, 404], [300, 392], [420, 410], [420, 520], [-20, 520]])}" fill="#262420"/>
      <path d="${curve([[250, 404], [290, 394], [340, 396], [380, 406], [330, 414], [280, 414]])}" fill="#2e2c26"/>
      <path d="${curve([[30, 432], [90, 420], [150, 426], [110, 440], [50, 442]])}" fill="#36352d" opacity=".8"/>
      ${[[238, 418, 7], [256, 424, 4], [96, 446, 5], [268, 404, 6], [296, 402, 5], [340, 404, 7], [366, 408, 5]].map(([x, y, s], k) => shape(curve(ring(x, y, s * 1.4, s, 7, .3, 30 + k)), C.rockLight, "#1a1914", [-1, 1])).join("")}
    </g>
    ${[...Array(10)].map((_, k) => stroke(60 + k * 28 + r() * 10, 404 + r() * 8, -1.6 + (r() - .5) * .8, 6 + r() * 6, 1.8, k % 2 ? "#5f7a46" : "#748f55", .85)).join("")}
    <!-- warm lantern light pooling over everything -->
    <circle cx="231" cy="372" r="200" fill="url(#${id}lamp)" style="mix-blend-mode:screen"/>
    ${D.body}
    ${motes}
    <!-- out-of-focus ferns in the foreground give depth -->
    <g filter="url(#${id}soft)" opacity=".92">${fern(-10, 500, -1.2, 150, "#0c120d")}${fern(40, 510, -1.5, 120, "#101710")}${fern(410, 500, -1.95, 140, "#0c120d")}</g>
    <rect width="400" height="500" fill="none" stroke="#0a0806" stroke-width="34" opacity=".22" filter="url(#${id}soft)"/>
  </g>
</svg>`;
}

// Old Puddock in the painterly style, 100x100 box (feet at y 97). Painted exactly like Dibble at Dibble's on-screen scale
// (Dibble sits in the same box at .37): the same edge offset, blur sizes, bumpy silhouette (warts where Dibble has fur),
// two-light shading clipped inside each part, a warm lantern rim on the right and brush-stroke texture. Returns { defs, body }.
export function puddockBody(id) {
  const r = rng(83), g = "#86a64e", gLine = mix(g, "#1a0f08", .62), gDeep = mix(g, "#1a2a10", .45);
  const C = { warm: mix(g, "#e8a868", .32), cool: mix(g, "#454056", .3), deep: mix(g, "#1a0f08", .5), cream: mix(g, "#f3e2c6", .72) };
  const coat = "#46598a", coatLine = mix(coat, "#0e1020", .6), straw = "#e2bf74", strawLine = mix(straw, "#3a2410", .6), O = [-.67, .6];
  const soft = `filter="url(#${id}soft)"`, blur = `filter="url(#${id}blur)"`;
  const head = ring(50, 45, 28.5, 18.6, 18, .05, 81), coatD = curve([[24, 80], [27, 64], [37, 57.4], [50, 68], [63, 57.4], [73, 64], [76, 80], [74.6, 92], [50, 95.2], [25.4, 92]]);
  const bump = (cx) => ring(cx, 33.5, 9.4, 9.2, 12, .05, 85 + cx);
  const lid = (cx) => shape(`M${cx - 6.2} 34 Q${cx} 26.6 ${cx + 6.2} 34 Q${cx} 30.8 ${cx - 6.2} 34 Z`, mix(g, "#c8d890", .15), gLine, [0, .5]);
  const patch = (x, y, w, h, a, c) => `<g transform="rotate(${a} ${x} ${y})">${shape(curve(ring(x, y, w, h, 8, .08, x | 0)), c, mix(c, "#1a0f08", .55), O)}
    <path d="${curve(ring(x + w * .3, y - h * .3, w * .45, h * .4, 7, .2, (x | 0) + 2))}" fill="${mix(c, "#fff3d0", .3)}" opacity=".45" ${blur}/>
    ${[...Array(6)].map((_, k) => { const a2 = k / 6 * Math.PI * 2; return stroke(x + Math.cos(a2) * (w - 1), y + Math.sin(a2) * (h - 1), a2 + 1.57, 1, .25, mix(c, "#ffffff", .6), .8, .05); }).join("")}</g>`;
  // webbed feet poking out under the coat: three rounded toes each, a lighter tip on the lit side
  const foot = (x, k) => shape(curve([[x - 7, 97.4], [x - 7.6, 94.6], [x - 4, 92.6], [x + 1, 92.4], [x + 6, 93.4], [x + 7.6, 96.2], [x + 5, 97.6], [x + 2.4, 96.6], [x, 97.8], [x - 2.4, 96.8], [x - 4.6, 97.8]]), k ? C.warm : g, gLine, O) +
    [-4.4, 0, 4.6].map((dx) => stroke(x + dx, 96.4, -1.57, 1.6, .35, C.cream, .55, .05)).join("");
  // a sleeve ending in a three-fingered hand, warts on the knuckles
  const arm = (x1, y1, cx, cy, x2, y2, hx, hy, flip, seed) => shape(limb(x1, y1, cx, cy, x2, y2, 4.4, 3.6), coat, coatLine, O) +
    `<path d="${limb(x1 + 1, y1 + 1, cx + 1, cy + 1, x2, y2, 1.6, .8)}" fill="${flip > 0 ? "#8fa8e0" : "#20283e"}" opacity=".45" ${blur}/>` +
    shape(curve([[hx - 3.6, hy - 2], [hx + 3.6, hy - 2.2], [hx + 4, hy + 1.6], [hx + 2.8, hy + 4], [hx + 1.4, hy + 3], [hx, hy + 4.4], [hx - 1.4, hy + 3], [hx - 2.8, hy + 4], [hx - 4, hy + 1.6]]), flip > 0 ? C.warm : g, gLine, O) +
    [-2.8, 0, 2.8].map((dx) => stroke(hx + dx, hy + 3.2, -1.57, 1.4, .3, C.cream, .5, .05)).join("");
  const headTufts = head.filter((_, k) => [1, 8, 16].includes(k));
  return { defs: `<filter id="${id}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="${id}blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".9"/></filter>
    <clipPath id="${id}H"><path d="${curve(head)}"/></clipPath><clipPath id="${id}C"><path d="${coatD}"/></clipPath>
    <clipPath id="${id}B"><path d="${curve(ring(50, 21.4, 32, 6.6, 18, .03, 113))}"/></clipPath>`,
  body: `
    <path d="${curve(ring(50, 97.4, 30, 2.6, 12, .2, 87))}" fill="#0f0e0b" opacity=".45" ${blur}/>
    ${foot(36, 0)}${foot(64, 1)}
    ${shape(coatD, coat, coatLine, O)}
    <g clip-path="url(#${id}C)">
      <path d="${curve(ring(30, 86, 16, 18, 9, .2, 89))}" fill="#20283e" opacity=".6" ${soft}/>
      <path d="${curve(ring(74, 72, 9, 16, 9, .2, 91))}" fill="#8fa8e0" opacity=".45" ${soft}/>
      <path d="${curve(ring(46, 62, 12, 5, 9, .2, 92))}" fill="#9aa5c8" opacity=".25" ${soft}/>
      ${[...Array(14)].map(() => stroke(28 + r() * 44, 66 + r() * 24, 1.5 + (r() - .5) * .3, 3 + r() * 4, .35, "#1e2848", .3, .06)).join("")}
      ${[[38, 70, 40, 82, 37, 93], [62, 70, 60, 82, 63, 93]].map(([a, b, c, d, e, f]) => `<path d="M${a} ${b} Q${c} ${d} ${e} ${f}" stroke="#2a3558" stroke-width=".8" fill="none" opacity=".5"/>`).join("")}
    </g>
    <path d="${curve([[73, 64], [76, 76], [75, 90]], false)}" stroke="#ffc98a" stroke-width="1" fill="none" opacity=".5" stroke-linecap="round" ${blur}/>
    ${shape("M37 57.6 L50 68.6 L63 57.6 Q50 62 37 57.6 Z", C.cream, mix(C.cream, gLine, .4), O)}
    <path d="M44 61 L50 66.6 L56 61" stroke="${mix(C.cream, "#7a7a80", .3)}" stroke-width="1.6" fill="none" opacity=".5" ${blur}/>
    ${patch(31.5, 84, 4.6, 4.2, -8, "#c8553d")}${patch(68, 87, 4.2, 3.7, 10, "#e0b44e")}
    <path d="M54 75 Q61 80 67 75" stroke="#d9b04a" stroke-width=".9" fill="none"/>
    ${shape(curve(ring(67.6, 75, 2.4, 2.4, 9, .05, 93)), "#f0c75a", strawLine, [-.45, .45])}${stroke(66.6, 74.2, -.6, 1.6, .35, "#fffbe8", .9, .2)}
    ${[77, 85].map((y) => shape(curve(ring(50, y, 1.7, 1.7, 8, .05, y)), "#f0c75a", strawLine, [-.4, .4]) + stroke(49.4, y - .6, -.6, 1, .3, "#fffbe8", .8, .2)).join("")}
    ${arm(29, 64, 22, 70, 23, 78, 22.4, 80.4, -1, 121)}
    ${arm(71, 64, 79, 70, 77.6, 77, 77.4, 79.6, 1, 123)}
    ${shape(curve(ring(80.6, 77.4, 2.6, 2.6, 10, .04, 125)), "#f0c75a", strawLine, [-.45, .45])}${stroke(79.6, 76.4, -.7, 1.8, .35, "#fffbe8", .9, .2)}
    ${shape(curve(bump(36)), g, gLine, O)}${shape(curve(bump(64)), g, gLine, O)}
    ${tuftLine(headTufts, 50, 45, gLine, 37, 1.1, 2.2, O)}
    ${shape(curve(head), g, gLine, O)}
    ${furEdge(headTufts, 50, 45, [g], 37, 1.1, 2.2)}
    <g clip-path="url(#${id}H)">
      <path d="${curve(ring(32, 55, 18, 12, 10, .2, 95))}" fill="${C.cool}" opacity=".65" ${soft}/>
      <path d="${curve(ring(70, 42, 13, 15, 10, .2, 97))}" fill="${C.warm}" opacity=".5" ${soft}/>
      <path d="${curve(ring(40, 32, 12, 5, 8, .25, 98))}" fill="#9aa59a" opacity=".22" ${soft}/>
      <path d="${curve(ring(50, 59, 18, 5, 10, .2, 99))}" fill="${C.cream}" opacity=".3" ${soft}/>
      ${[...Array(16)].map(() => stroke(26 + r() * 48, 30 + r() * 28, -2.2 + (r() - .5) * .8, 1.6 + r() * 2, .35, C.deep, .2, .1)).join("")}
      <path d="${curve(ring(50, 27.6, 26, 3.6, 10, .2, 53))}" fill="${C.deep}" opacity=".5" ${blur}/>
    </g>
    ${[[42, 47, 1.3], [58, 49.6, 1], [65, 43, 1.4], [35, 52, .9], [53, 41.6, .8], [70, 50, .8], [29, 45, .9]].map(([x, y, s], k) =>
      shape(curve(ring(x, y, s, s * .85, 7, .2, 40 + k)), mix(g, "#c8d890", .25), gDeep, [-.35, .3]) + stroke(x + s * .2, y - s * .5, -.6, s * .8, .25, "#f3f6d8", .6, .2)).join("")}
    <path d="${curve(head.slice(14, 18).concat(head.slice(0, 2)), false)}" stroke="#ffc98a" stroke-width="1" fill="none" opacity=".55" stroke-linecap="round" ${blur}/>
    ${pieEye(36, 35, 101, 5.5, 5.4, 5, "#241812", 1.1)}${pieEye(64, 35, 103, 5.9, 5.4, 5, "#241812", 1.1)}
    ${lid(36)}${lid(64)}
    <g fill="none" stroke="#b8902e" stroke-width="1.1"><path d="${curve(ring(36, 35, 7.4, 7.2, 12, .02, 105))}"/><path d="${curve(ring(64, 35, 7.4, 7.2, 12, .02, 107))}"/><path d="M43.4 35 Q50 32.2 56.6 35"/></g>
    <path d="M32 30.4 Q34 29 36.4 29.2 M62 30.4 Q64 29 66.4 29.2" stroke="#fffbe8" stroke-width=".7" opacity=".7" stroke-linecap="round"/>
    <path d="M61 30 L64 29" stroke="#fff" stroke-width="1.2" stroke-linecap="round"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.8;.85;1" dur="6s" repeatCount="indefinite"/></path>
    ${shape(curve([[26.4, 29.6], [30, 23.8], [37, 23.6], [42, 26.2], [37, 26.8], [34, 30], [30, 31.6]]), "#f3eee2", "#9a8e7a", [-.45, .45])}
    ${shape(curve([[73.6, 29.6], [70, 23.8], [63, 23.6], [58, 26.2], [63, 26.8], [66, 30], [70, 31.6]]), "#f3eee2", "#9a8e7a", [-.45, .45])}
    ${[[31, 26.6, -.5], [34.6, 25.8, -.3], [69, 26.6, -2.6], [65.4, 25.8, -2.8]].map(([x, y, a]) => stroke(x, y, a, 3, .4, "#c8bea8", .8, .1)).join("")}
    ${shape(`M34.6 53.4 Q50 60.6 65.4 53.4 Q58 58.4 50 58.8 Q42 58.4 34.6 53.4 Z`, "#4a2a22", "#2a1512", [-.3, .3])}
    ${stroke(34.6, 53, 2.2, 2.4, .35, gLine, .7, .2)}${stroke(65.4, 53, .9, 2.4, .35, gLine, .7, .2)}
    <path d="${curve(ring(27.4, 49, 4.6, 2.6, 8, .3, 109))}" fill="#d98f8f" opacity=".38" ${blur}/><path d="${curve(ring(72.6, 49, 4.4, 2.4, 8, .3, 111))}" fill="#e39a8c" opacity=".4" ${blur}/>
    ${shape(curve(ring(50, 21.4, 32, 6.6, 18, .03, 113)), straw, strawLine, O)}
    <g clip-path="url(#${id}B)">
      <path d="${curve(ring(30, 24, 14, 4, 9, .2, 114))}" fill="#a07a3a" opacity=".5" ${soft}/><path d="${curve(ring(70, 19, 12, 3, 9, .2, 115))}" fill="#fff0c4" opacity=".6" ${soft}/>
      ${[...Array(26)].map((_, k) => { const a = k / 26 * Math.PI * 2; return stroke(50 + Math.cos(a) * 22, 21.4 + Math.sin(a) * 4.4, a, 8, .3, "#b8893c", .55, .03); }).join("")}
    </g>
    ${shape(curve([[35.4, 20.6], [36.8, 10.6], [42, 7.2], [50, 6.4], [58, 7.2], [63.2, 10.6], [64.6, 20.6], [50, 22.2]]), mix(straw, "#fff3d0", .15), strawLine, O)}
    <path d="${curve(ring(57, 12, 6, 4, 8, .2, 119))}" fill="#fff6dc" opacity=".45" ${blur}/><path d="${curve(ring(40, 16, 5, 4, 8, .2, 120))}" fill="#a07a3a" opacity=".35" ${blur}/>
    ${[39.6, 44.6, 49.6, 54.6, 59.6].map((x) => stroke(x, 8.6, 1.57 + (x - 50) * .01, 10.6, .3, "#b8893c", .6, .02)).join("")}
    ${shape(curve([[36, 16.8], [50, 20.4], [64, 16.8], [64.2, 19.4], [50, 22.6], [35.8, 19.4]]), "#c8553d", mix("#c8553d", "#1a0f08", .55), [-.4, .4])}
    <path d="M38 17.6 Q50 20.6 62 17.6" stroke="#e8836a" stroke-width=".6" fill="none" opacity=".8"/>` };
}

// painted crystal shard: base at (x, y), width w, height h, lean a; lit from the right, shaded left, faint ridge
export function shard(x, y, w, h, a, c, r, glint = false) {
  const pts = [[-w * .55, 0], [-w * .62, -h * .55], [-w * .1, -h], [w * .5, -h * .62], [w * .58, 0]]
    .map(([px, py]) => { const j = 1 + (r() - .5) * .12; return [x + (px * Math.cos(a) - py * Math.sin(a)) * j, y + (px * Math.sin(a) + py * Math.cos(a)) * j]; });
  const [b1, s1, t, s2, b2] = pts, mid = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2], P = (q) => q.map(f2).join(" ");
  const d = `M${pts.map(P).join(" L")} Z`, lw = Math.max(.4, w * .07);
  return `<path d="${d}" fill="${mix(c, "#0e1c1a", .5)}" transform="translate(${-lw} ${lw * .8})"/><path d="${d}" fill="${c}"/>
    <path d="M${P(t)} L${P(s2)} L${P(b2)} L${P(mid)} Z" fill="${mix(c, "#fff6e0", .45)}" opacity=".5"/>
    <path d="M${P(t)} L${P(s1)} L${P(b1)} L${P(mid)} Z" fill="${mix(c, "#0e1c1a", .4)}" opacity=".45"/>
    <path d="M${P(t)} L${P(mid)}" stroke="${mix(c, "#ffffff", .6)}" stroke-width="${f2(lw * .8)}" opacity=".55" stroke-linecap="round"/>
    ${glint ? `<path d="M${f2(t[0] + w * .1)} ${f2(t[1] + h * .1)} l${f2(w * .12)} ${f2(-h * .09)} l${f2(w * .12)} ${f2(h * .09)} l${f2(-w * .12)} ${f2(h * .03)} Z" fill="#f4fff8" opacity=".85"/>` : ""}`;
}
// a cluster growing out of a little mound: biggest shard in the middle, others leaning out
export function shardCluster(x, y, s, cols, ground, seed) {
  const r = rng(seed), C = (k) => cols[k % cols.length];
  const set = [[-.5, .42, .5, -.45, 1], [.42, .36, .62, .35, 2], [0, .55, 1, -.08, 0], [.15, .25, .35, .7, 3], [-.25, .2, .28, -.9, 4]];
  return set.map(([dx, w, h, a, k], i) => shard(x + dx * s, y + 1, s * w, s * h, a, C(k), r, i === 2)).join("") +
    shape(curve(ring(x, y + s * .06, s * .7, s * .14, 10, .2, seed + 7)), ground, mix(ground, "#000000", .4), [-.6, .5]);
}
