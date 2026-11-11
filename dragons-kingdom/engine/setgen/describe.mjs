// Engine set generator (engine/DESIGN.md section 4): a shot list's SET block -> a set description.
//   SET CLING_BAKERY
//   template: interior-room
//   size: 6 x 5 x 3.2                                   (w x d x h metres; a square: w x d)
//   world: CLING at [-14, 0, 9] facing east             (the world frame, where the set stands in it, its front)
//   features: oven on north wall; counter across the middle; window east; door south; two oil lamps
//   tod: 2A morning, sun az 110 el 18                   (scene, time of day, sun azimuth / elevation in degrees)
// Every feature phrase is matched against the TEMPLATE's vocabulary (templates/<t>.mjs VOCAB): a phrase with no
// vocabulary word is returned in `unmatched` (the plan flags it; nothing is guessed).
const NUM = { a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, three: 3, four: 4, five: 5, six: 6, several: 3, some: 2 };
const WALL = { north: 'north', south: 'south', east: 'east', west: 'west', n: 'north', s: 'south', e: 'east', w: 'west' };

export function parseSize(s) {
  if (!s) return null;
  const n = String(s).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  if (n.length < 2) return null;
  return { w: n[0], d: n[1], h: n[2] ?? null };
}

export function parseWorld(s) {
  if (!s) return null;
  const m = /^\s*([A-Z][A-Z0-9_]*)?\s*(?:at\s*\[([^\]]+)\])?\s*(?:facing\s+(north|south|east|west))?/i.exec(String(s));
  const at = m?.[2] ? m[2].split(',').map((x) => +x.trim()) : null;
  return { frame: m?.[1] ? m[1].toUpperCase() : null, at: at && at.every(Number.isFinite) ? at : null, facing: m?.[3]?.toLowerCase() || null, text: String(s) };
}

export function parseTod(s) {
  if (!s) return null;
  const t = String(s);
  const scene = /^\s*([0-9A-Z][0-9A-Z+]*)\b(?=\s*[a-z,])/.exec(t)?.[1] || null;
  const az = /\baz(?:imuth)?\s*(-?\d+(\.\d+)?)/i.exec(t), el = /\bel(?:evation)?\s*(-?\d+(\.\d+)?)/i.exec(t);
  const word = /\b(dawn|first light|early morning|morning|midday|noon|afternoon|late afternoon|evening|dusk|sunset|night)\b/i.exec(t)?.[1]?.toLowerCase() || null;
  // a time-of-day word without a sun: a default sun (the east in the morning, the west in the evening)
  const def = { dawn: [95, 3], 'first light': [92, -2], 'early morning': [105, 10], morning: [115, 22], midday: [180, 55], noon: [180, 55], afternoon: [225, 38], 'late afternoon': [250, 20], evening: [270, 8], dusk: [280, 1], sunset: [280, 2], night: [0, -30] };
  const sun = az && el ? [+az[1], +el[1]] : word ? def[word] : null;
  return { scene, tod: word, az: sun?.[0] ?? null, el: sun?.[1] ?? null, night: word === 'night', text: t };
}

/** Match feature phrases against a template vocabulary { kind: [words...] }. */
export function matchFeatures(features, vocab) {
  const matched = [], unmatched = [];
  const words = Object.entries(vocab).flatMap(([kind, ws]) => ws.map((w) => [kind, w.toLowerCase()])).sort((a, b) => b[1].length - a[1].length);
  for (const phrase of features || []) {
    const p = ` ${String(phrase).toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim()} `;
    const hit = words.find(([, w]) => p.includes(` ${w} `));
    if (!hit) { unmatched.push(phrase); continue; }
    const [kind] = hit;
    const tokens = p.trim().split(' ');
    const wall = tokens.map((x) => WALL[x]).find(Boolean) || null;
    const n = tokens.map((x) => (/^\d+$/.test(x) ? +x : NUM[x])).find((x) => x != null) ?? (/s$/.test(hit[1]) && !/(ss|ues)$/.test(hit[1]) ? 2 : 1);
    const place = /\b(middle|centre|center)\b/.test(p) ? 'middle' : /\bcorner\b/.test(p) ? 'corner' : null;
    const not = /\b(no|without|none)\b/.test(p);
    matched.push({ phrase, kind, wall, n, place, ...(not ? { not: true } : {}) });
  }
  return { matched, unmatched };
}

/** A SET block of sets.plan.json + its template module -> { id, template, size, world, tod, features, unmatched } */
export function describeSet(block, tpl) {
  const { matched, unmatched } = matchFeatures(block.features || [], tpl?.VOCAB || {});
  return { id: block.id, template: block.template, size: parseSize(block.size), world: parseWorld(block.world), tod: parseTod(block.tod),
    features: matched, unmatched, about: block.about || null, dressing: block.dressing || null, source_line: block.source_line ?? null };
}
