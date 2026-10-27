// Shot director - the P-17 meadow seen from 46 m up: a grazed pasture's patchwork. From that height one
// pixel is ~5 cm and the 10-40 cm grass tufts are a fine noise: the field read as an even green carpet
// (a sports pitch). What a real pasture shows from above: lusher and drier patches (2-10 m), dark
// tussocks and rosettes (0.3-1 m), clover patches, a sheep track worn across it, the odd molehill.
// Pure (Node + page): meadowPattern(seed) -> { color(x, z) multiplier [r, g, b], soil(x, z) 0..1 }.
// verdor-grounds.js lays it on a fine terrain card over the P-17 footprint, faded to the plain field
// at the card's edges; the grass geometry stays on top.
import { makeNoise, smooth } from '../../sets/terrain.js';

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function meadowPattern(seed = 31) {
  const N = makeNoise(seed);
  /** nearest jittered point of a `size` m grid: distance f1 (m) and the point's id hash */
  const cell = (x, z, size, k) => {
    const gx = Math.floor(x / size), gz = Math.floor(z / size);
    let f1 = 1e9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cz = gz + j;
      const px = (cx + 0.15 + 0.7 * N.hash(cx * 3 + k, cz * 7 - k)) * size, pz = (cz + 0.15 + 0.7 * N.hash(cx * 5 - k, cz * 11 + k)) * size;
      const d = Math.hypot(x - px, z - pz);
      if (d < f1) { f1 = d; id = N.hash(cx + 101 * k, cz - 37 * k); }
    }
    return { f1, id };
  };
  // a sheep track wandering across the meadow (z of its centre line at x), and a fainter second one
  const track = (x) => 44 + 9 * Math.sin(x / 23 + 0.7) + 3.5 * Math.sin(x / 8.7 + 2.1);
  const track2 = (x) => 18 + 0.35 * (x + 150) + 4 * Math.sin(x / 13 + 1.3);
  function worn(x, z) {
    // a trodden line, not a road: its width wanders, grass grows into it, it fades out in places
    const half = 0.32 + 0.16 * N.fbm(x * 0.15 + 2, 0.5, 2);
    const w1 = smooth(half + 0.25, half - 0.12, Math.abs(z - track(x)) + 0.18 * N.fbm(x * 1.1, z * 1.1, 3))
      * (0.35 + 0.65 * smooth(-0.35, 0.25, N.fbm(x * 0.06 + 9, 3.1, 2))) * (0.7 + 0.3 * smooth(-0.2, 0.2, N.fbm(x * 2.3, z * 2.3, 2)));
    const w2 = 0.55 * smooth(0.4, 0.1, Math.abs(z - track2(x)) + 0.1 * N.fbm(x * 0.8 + 3, z * 0.8, 2)) * smooth(-0.1, 0.3, N.fbm(x * 0.04 - 4, 1.7, 2));
    return Math.max(w1, w2);
  }
  function molehill(x, z) {
    const c = cell(x, z, 9, 5);
    return c.id < 0.14 ? smooth(0.42, 0.22, c.f1) : 0;
  }
  return {
    soil(x, z) { return Math.max(0.75 * worn(x, z), molehill(x, z)); },
    color(x, z) {
      const p = N.fbm(x * 0.11, z * 0.11, 4) + 0.15 * N.fbm(x * 0.6, z * 0.6, 2);
      const dry = smooth(0.02, 0.38, p), lush = smooth(-0.06, -0.38, p);
      let c = [1, 1, 1];
      c = mix(c, [1.32, 1.2, 0.84], 0.85 * dry);                         // drier, paler, yellower grass
      c = mix(c, [0.76, 0.9, 0.7], 0.8 * lush);                          // lush dark patches (dung-fed)
      const cl = smooth(0.25, 0.45, N.fbm(x * 0.27 + 7, z * 0.27 - 2, 3));
      c = mix(c, [0.84, 0.98, 0.9], 0.6 * cl);                           // clover: a bluer green
      const m = N.fbm(x * 1.4, z * 1.4, 3);
      c = c.map((v) => v * (0.9 + 0.2 * m));                             // the fine mottle
      // tussocks: irregular clumps (a warped distance), dark and green or pale with dead thatch, thicker
      // where the grass is rough (less grazed), few on the lush grazed patches
      const rough = smooth(-0.2, 0.3, N.fbm(x * 0.07 + 13, z * 0.07 - 5, 3));
      const wx = x + 0.35 * N.fbm(x * 1.7, z * 1.7, 2), wz = z + 0.35 * N.fbm(x * 1.7 + 4, z * 1.7 - 3, 2);
      const t = cell(wx, wz, 1.3, 1);
      if (t.id < 0.15 + 0.45 * rough) {
        const r = 0.18 + 0.3 * N.hash(Math.floor(t.id * 1e6), 3);
        const k = smooth(r, r * 0.3, t.f1) * (0.55 + 0.45 * rough);
        c = mix(c, t.id < 0.12 ? [1.15, 1.02, 0.8] : [0.66, 0.74, 0.54], k);
      }
      const ro = cell(wx, wz, 3.6, 2);                                    // thistle / dock rosettes
      if (ro.id < 0.08) c = mix(c, [0.55, 0.64, 0.46], smooth(0.36, 0.16, ro.f1));
      const w = worn(x, z), mh = molehill(x, z);
      c = mix(c, [1.2, 1.1, 0.86], 0.7 * w);                             // trodden: paler, flattened grass
      c = mix(c, [1.05, 0.9, 0.75], mh);
      return c;
    },
    track,
  };
}
