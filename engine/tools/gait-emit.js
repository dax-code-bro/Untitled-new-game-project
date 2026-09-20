/* Print the keyframe tables for every gait, to paste into
   engine/src/90-animation.js and engine/src/99-zombie-anim.js.
   `node engine/tools/gait-emit.js [name ...]` */
const S = require('./gait-solve.js');
const G = require('./gait-defs.js');
const r1 = (v) => +v.toFixed(1);
const r3 = (v) => +v.toFixed(3);
function wrapList(str, lead, width = 92) {
  const parts = str.slice(1, -1).split('], ').map((x, i, a) => (i < a.length - 1 ? x + '], ' : x));
  const out = []; let line = '[';
  for (const p of parts) {
    if (line.length + p.length > width && line !== '[') { out.push(line.trimEnd()); line = ' '.repeat(lead.length + 1); }
    line += p;
  }
  out.push(line + ']');
  return out.join('\n' + lead);
}
const rot = (keys, fn) => '[' + keys.map((p) => {
  const v = fn(p); return `[${p.toFixed(2)}, ${r1(v[0])}, ${r1(v[1])}, ${r1(v[2])}]`;
}).join(', ') + ']';

const want = process.argv.slice(2);
for (const name in G.GAITS) {
  if (want.length && !want.includes(name)) continue;
  const g = G.GAITS[name], keys = G.KEYS[name], tr = G.TRUNK[name], a = G.ARMS[name];
  g.hipsPitch = tr.pitch;
  S.prepare(g);
  const L = S.legTracks(g, 'L', keys), R = S.legTracks(g, 'R', keys);
  const ind = '    ';
  const legTrack = (o) => wrapList('[' + o.map(([p, v]) => `[${p.toFixed(2)}, ${v}, 0, 0]`).join(', ') + ']', ind + '  ');
  const out = [`  clips.push(buildClip('${name}', ${g.T}, {`];
  /* The pelvis on the SAME key times as the legs. See gait-defs. */
  const hk = keys;
  out.push(`${ind}hips: {`);
  out.push(`${ind}  keys: ` + wrapList('[' + hk.map((p) =>
    `[${p.toFixed(2)}, ${r1(S.curve(tr.pitch, p))}, ${r1(S.curve(tr.pelvisY, p))}, ${r1(S.curve(tr.list, p))}]`).join(', ') + ']', ind + '    ') + ',');
  out.push(`${ind}  pos: ` + wrapList('[' + hk.map((p) =>
    `[${p.toFixed(2)}, ${r3(S.curve(tr.sway, p))}, ${r3(S.curve(g.hipsY, p))}, 0]`).join(', ') + ']', ind + '    ') + ',');
  out.push(`${ind}},`);
  for (const [bone, c] of [['spine', tr.spine], ['chest', tr.chest], ['neck', tr.neck], ['head', tr.head]])
    out.push(`${ind}${bone}: { keys: ` + rot(tr.keys, (p) => c(p)) + ' },');
  out.push(`${ind}upperLegL: { keys: ${legTrack(L.hip)} },`);
  out.push(`${ind}lowerLegL: { keys: ${legTrack(L.knee)} },`);
  out.push(`${ind}footL: { keys: ${legTrack(L.foot)} },`);
  out.push(`${ind}upperLegR: { keys: ${legTrack(R.hip)} },`);
  out.push(`${ind}lowerLegR: { keys: ${legTrack(R.knee)} },`);
  out.push(`${ind}footR: { keys: ${legTrack(R.foot)} },`);
  for (const side of ['L', 'R']) {
    const ph = side === 'L' ? 0 : 0.5, sgn = side === 'L' ? 1 : -1;
    out.push(`${ind}shoulder${side}: { keys: ` + rot(a.keys, (p) => a.shoulder((p + ph) % 1, sgn)) + ' },');
  }
  for (const side of ['L', 'R']) {
    const ph = side === 'L' ? 0 : 0.5, sgn = side === 'L' ? 1 : -1;
    out.push(`${ind}upperArm${side}: { keys: ` + rot(a.keys, (p) => a.upper((p + ph) % 1, sgn)) + ' },');
    out.push(`${ind}lowerArm${side}: { keys: ` + rot(a.keys, (p) => a.lower((p + ph) % 1, sgn)) + ' },');
    out.push(`${ind}hand${side}: { keys: ` + rot(a.keys, (p) => a.hand((p + ph) % 1, sgn)) + ' },');
  }
  out.push(`  }, { stride: ${g.stride} }));`);
  console.log(out.join('\n'));
  console.log('');
}
