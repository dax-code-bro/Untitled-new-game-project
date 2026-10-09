// The prologue island ("an island whose high ground disappears into morning cloud", P-03): a
// high volcanic island built of stacked lava flows - the stepped "trap" landscape of the Faroes or
// Skye: grassy benches between dark basalt scarps, thin red-brown bole layers between flows, deep
// gullies cut by streams, sheer sea cliffs on the weather side, stacks off the headlands.
// It is a different place from Verdor (whose coast is pale limestone), seen only from the sea at
// dawn, mostly as a silhouette in mist.
//
// Frame: the island's centre at (cx, cz) (style frame F1 uses x 960, z -2000), sea level y = 0.
import { makeNoise, mulberry, smoothstep, clamp, lerp } from './noise.js';

export const ISLAND = { cx: 960, cz: -2000, rx: 950, rz: 650, peak: 680, grid: { half: [1500, 1150], cell: 2.5 } };

export function createIslandWorld(opts = {}) {
  const I = { ...ISLAND, ...opts };
  const N = makeNoise(611), N2 = makeNoise(612), N3 = makeNoise(613);
  // the lava pile: flows 6-26 m thick, harder massive cores with softer scoriaceous tops and
  // thin red bole (weathered soil) between some flows
  const beds = [];
  { const r = mulberry(77); let s = -60; while (s < 900) { const t = 6 + 20 * r() * r() + 4 * r(); beds.push({ b0: s, b1: s + t, hard: 0.75 + 0.25 * r(), tint: r(), bole: r() < 0.45 }); s += t; } }
  const bedAt = (s) => { let lo = 0, hi = beds.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (beds[m].b1 <= s) lo = m + 1; else hi = m; } return lo; };
  /** the flows dip gently to the south-east */
  const dipH = (x, z) => 0.012 * (x - I.cx) - 0.008 * (z - I.cz);
  // a stratigraphic "hardness" profile: scarps where flows are hard, benches on their tops
  const hardAt = (s) => { const k = bedAt(s), b = beds[k]; const t = (s - b.b0) / (b.b1 - b.b0); return t > 0.82 ? 0.2 : b.hard; };
  const recessAt = (s) => (1 - hardAt(s)) * 2.5;

  function radial(x, z) {
    const dx = (x - I.cx) / I.rx, dz = (z - I.cz) / I.rz;
    const a = Math.atan2(dz, dx);
    const wob = 1 + 0.16 * N.fbm2(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 4) + 0.07 * N2.fbm2(x / 260, z / 260, 3);
    return Math.hypot(dx, dz) * wob;
  }
  /** base (uneroded) height: a plateau island ringed by sea cliffs, a jagged mountain interior */
  function base(x, z) {
    const r = radial(x, z);
    if (r > 1.25) return -40 - 30 * smoothstep(1.25, 1.6, r);
    const ux = (x - I.cx) / I.rx, uz = (z - I.cz) / I.rz;
    const weather = 0.5 + 0.5 * Math.cos(Math.atan2(uz, ux) - 2.4);
    const cliffTop = 45 + 150 * weather * (0.55 + 0.45 * N2.fbm2(x / 220, z / 220, 3));
    const land = smoothstep(1.03, 0.985, r);
    // the interior: a NW-SE main ridge with summits and cols, spurs, a corrie bitten out of its NE side
    const along = ux * 0.6 + uz * 0.8, across = -ux * 0.8 + uz * 0.6;
    const ridge = Math.exp(-((across + 0.08 * Math.sin(along * 5)) ** 2) / 0.12);
    const summits = 0.65 + 0.35 * N3.fbm2(along * 3.2 + 7, 0.3, 3);
    const jag = 0.55 * N3.ridged2(x / 520 + 1, z / 520, 4) + 0.45 * (0.5 + 0.5 * N.fbm2(x / 700, z / 700, 3));
    const inner = smoothstep(0.99, 0.62, r);
    let h = cliffTop * land + (I.peak - 60) * Math.pow(inner, 0.7) * (0.5 * ridge * summits + 0.5 * jag + 0.25) * (0.88 + 0.12 * N.fbm2(x / 150, z / 150, 3));
    // the old lava plateau: summits are flat-topped remnants, not needles
    const plat = I.peak * 0.82;
    if (h > plat) h = plat + (h - plat) * 0.25;
    const corrie = Math.exp(-(((ux - 0.18) ** 2) / 0.02 + ((uz + 0.22) ** 2) / 0.015));
    h -= 220 * corrie * inner;
    return lerp(-30, Math.max(h, cliffTop * land * 0.92), land);
  }
  /** terraced (trap) relief: benches on flow tops, scarps on the hard cores */
  function terrace(x, z, h, slope) {
    if (h < 2) return h;
    const s = h + dipH(x, z);
    const k = bedAt(s), b = beds[k];
    const t = (s - b.b0) / (b.b1 - b.b0);
    // within a flow the ground is pulled toward the flow top on gentle slopes (a bench) and
    // steepened into a scarp on the hard core
    const step = b.b0 + (b.b1 - b.b0) * smoothstep(0.1, 0.9, t) ** (1.6 - 0.8 * b.hard);
    const amt = smoothstep(0.1, 0.4, slope) * (0.35 + 0.45 * smoothstep(-0.3, 0.4, N.fbm2(x / 300, z / 300, 2)));
    return lerp(h, step - dipH(x, z), amt);
  }
  return { I, N, N2, N3, beds, bedAt, hardAt, recessAt, dipH, radial, base, terrace, VERDOR: { tide: { high: 1.6, low: -1.6 }, beachBay: { z: 1e6 }, point: { z: 1e6 } }, xc: () => 1e6 };
}
