const { leg, curve, settleAnkle, solvePelvis, FLOOR, LEG, anklePath } = require('./gait-solve.js');
const G = require('./gait-defs.js');
const r1 = (v) => +v.toFixed(1);
const r3 = (v) => +v.toFixed(3);
function rot(keys, fn, indent) {
  return '[' + keys.map((p) => { const v = fn(p); return `[${p.toFixed(2)}, ${r1(v[0])}, ${r1(v[1])}, ${r1(v[2])}]`; }).join(', ') + ']';
}
function wrapList(s, lead, width = 96) {
  const parts = s.slice(1, -1).split('], ').map((x, i, a) => (i < a.length - 1 ? x + '], ' : x));
  const out = []; let line = '[';
  for (const p of parts) {
    if (line.length + p.length > width && line !== '[') { out.push(line.trimEnd()); line = ' '.repeat(lead.length + 1); }
    line += p;
  }
  out.push(line + ']');
  return out.join('\n' + lead);
}
const want = process.argv.slice(2);
for (const name in G.GAITS) {
  if (want.length && !want.includes(name)) continue;
  const g = G.GAITS[name], keys = G.KEYS[name], a = G.ARMS[name], tr = G.TRUNK[name];
  g.hipsPitch = tr.pitch;
  settleAnkle(g);
  const L = leg(g, 0, keys), R = leg(g, 0.5, keys);
  const ind = '    ';
  const P = (t) => `[${t.toFixed(2)}`;
  const legTrack = (o) => wrapList('[' + o.map(([p, v]) => `[${p.toFixed(2)}, ${v}, 0, 0]`).join(', ') + ']', ind + '  ');
  const out = [];
  out.push(`  clips.push(buildClip('${name}', ${g.T}, {`);
  // hips: solved bob + authored sway, pelvic rotation and list
  /* The pelvis gets its OWN key times, sixteen of them evenly spaced.
     It has to: the bob happens TWICE a cycle while the pelvic rotation
     happens once, and sampling both on the legs' key times -- which are
     placed for the legs' phases -- stepped straight over the bob's
     extremes and turned a smooth 57 mm rise into a 30 mm jump between
     two adjacent keys. One bone, one time array, so the array has to
     suit the faster of the two channels. */
  const hk = Array.from({ length: 17 }, (_, i) => i / 16);
  out.push(`${ind}hips: {`);
  out.push(`${ind}  keys: ` + wrapList('[' + hk.map((p) =>
    `[${p.toFixed(2)}, ${r1(curve(tr.pitch, p))}, ${r1(curve(tr.pelvisY, p))}, ${r1(curve(tr.list, p))}]`).join(', ') + ']', ind + '    ') + ',');
  out.push(`${ind}  pos: ` + wrapList('[' + hk.map((p) =>
    `[${p.toFixed(2)}, ${r3(curve(tr.sway, p))}, ${r3(curve(g.hipsY, p))}, 0]`).join(', ') + ']', ind + '    ') + ',');
  out.push(`${ind}},`);
  for (const [bone, c] of [['spine', tr.spine], ['chest', tr.chest], ['neck', tr.neck], ['head', tr.head]])
    out.push(`${ind}${bone}: { keys: ` + rot(tr.keys || [0, 0.25, 0.5, 0.75, 1], (p) => c(p)) + ' },');
  out.push(`${ind}upperLegL: { keys: ${legTrack(L.hip)} },`);
  out.push(`${ind}lowerLegL: { keys: ${legTrack(L.knee)} },`);
  out.push(`${ind}footL: { keys: ${legTrack(L.foot)} },`);
  out.push(`${ind}upperLegR: { keys: ${legTrack(R.hip)} },`);
  out.push(`${ind}lowerLegR: { keys: ${legTrack(R.knee)} },`);
  out.push(`${ind}footR: { keys: ${legTrack(R.foot)} },`);
  for (const side of ['L', 'R']) {
    const ph = side === 'L' ? 0 : 0.5, sgn = side === 'L' ? 1 : -1;
    out.push(`${ind}shoulder${side}: { keys: ` + rot(a.keys, (p) => a.shoulder(((p + ph) % 1), sgn)) + ' },');
  }
  for (const side of ['L', 'R']) {
    const ph = side === 'L' ? 0 : 0.5, sgn = side === 'L' ? 1 : -1;
    out.push(`${ind}upperArm${side}: { keys: ` + rot(a.keys, (p) => a.upper(((p + ph) % 1), sgn)) + ' },');
    out.push(`${ind}lowerArm${side}: { keys: ` + rot(a.keys, (p) => a.lower(((p + ph) % 1), sgn)) + ' },');
    out.push(`${ind}hand${side}: { keys: ` + rot(a.keys, (p) => a.hand(((p + ph) % 1), sgn)) + ' },');
  }
  out.push(`  }, { stride: ${g.stride} }));`);
  console.log(out.join('\n'));
  console.log('');
}
