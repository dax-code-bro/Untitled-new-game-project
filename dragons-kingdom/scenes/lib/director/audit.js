// Shot director - pure measurements for the realism audits (no three.js: unit-testable in Node).
//
// faceReadability: how readable a face is to the lens. Until approved faces and lip-sync exist
// (shotlist realism_strategy), a SPEAKING face must be soft, turned (profile or further), small or
// backlit; stage.js measures every speaking actor per frame and reports the shots that break it.

export const SENSOR_HEIGHT_MM = { super35: 14.0, fullframe: 20.25, alexa65: 30.44 };
export const FACE_LIMITS = { angleDeg: 70, faceFrac: 0.06, blurFrac: 0.006 };

/**
 * fwd: the face's forward unit vector (head bone -> mid-eyes), toCam: unit vector from the eyes to the
 * camera, dist: eyes-to-camera metres, lens: { focalLength (mm), fstop, focus (m), sensor }.
 * Returns { angle (deg between face and lens), faceFrac (face height / frame height), blurFrac
 * (circle of confusion / frame height), readable (all three limits broken) }.
 */
export function faceReadability(fwd, toCam, dist, lens = {}, limits = FACE_LIMITS) {
  const dot = fwd[0] * toCam[0] + fwd[1] * toCam[1] + fwd[2] * toCam[2];
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  const f = lens.focalLength || 35, N = lens.fstop || 2.8;
  const S = (lens.focus || dist) * 1000, d = Math.max(1, dist * 1000);
  const sensorH = typeof lens.sensor === 'number' ? (lens.sensor * 9) / 16 : (SENSOR_HEIGHT_MM[lens.sensor || 'super35'] ?? 14.0);
  const faceFrac = (240 * f) / d / sensorH;                                   // a face ~24 cm chin to crown
  const blurFrac = ((f * f) / (N * Math.max(1, S - f))) * (Math.abs(d - S) / d) / sensorH;
  const readable = angle < limits.angleDeg && faceFrac > limits.faceFrac && blurFrac < limits.blurFrac;
  return { angle, faceFrac, blurFrac, readable };
}

// ------------------------------------------------------------- edit check ---
export const CUT_LIMITS = { angleDeg: 25, sizeRatio: 1.6, mainFrac: 0.04, lineDeg: 20 };

/**
 * The cut A -> B (A: the outgoing shot's last frame, B: the incoming one's first), each
 * { cam: { pos: [x, y, z] }, actors: [{ name, inFrame, head: [x, y, z], sizePx (head height in a 540-line
 * frame), x (screen -1..1), x3, z3 (ground position), lookAt (the actor it looks at, or null) }] }.
 * Flags a JUMP CUT (the largest subject both frames hold seen from less than 25 deg apart at less than
 * 1.6x the size: the 30-degree rule) and a crossed EYE-LINE (one subject looks at the other in either
 * shot and the cameras stand on both sides of the line between them; a camera within 20 deg of the line
 * itself does not flip it; a reverse across a group flips its members' order legitimately, so only a
 * looked-at pair is checked). 'reverse' / 'declared' in B's staging marks an intended crossing.
 * Returns { flags: [string], rows: [{ name, angle, ratio }] }.
 */
export function cutCheck(A, B, stagingB = '', L = CUT_LIMITS) {
  const flags = [], rows = [];
  if (A.skip || B.skip) return { flags, rows, skip: A.skip || B.skip };
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
  const inA = new Map(A.actors.filter((a) => a.inFrame).map((a) => [a.name, a]));
  const shared = B.actors.filter((b) => b.inFrame && inA.has(b.name)).map((b) => [inA.get(b.name), b]);
  for (const [a, b] of shared) {
    const va = unit(sub(A.cam.pos, a.head)), vb = unit(sub(B.cam.pos, b.head));
    const ang = (Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))) * 180) / Math.PI;
    rows.push({ name: a.name, angle: Math.round(ang), ratio: +(b.sizePx / Math.max(1e-6, a.sizePx)).toFixed(2), size: Math.max(a.sizePx, b.sizePx) });
  }
  const main = rows.slice().sort((p, q) => q.size - p.size)[0];
  if (main && main.size / 540 > L.mainFrac && main.angle < L.angleDeg && main.ratio < L.sizeRatio && main.ratio > 1 / L.sizeRatio)
    flags.push(`JUMP CUT on ${main.name}: ${main.angle} deg apart, ${main.ratio.toFixed(2)}x the size (move the camera 30+ deg or change the size ${L.sizeRatio}x+)`);
  const declared = /reverse|declared/i.test(stagingB);
  const cross = (cam, p, q) => (q.x3 - p.x3) * (cam[2] - p.z3) - (q.z3 - p.z3) * (cam[0] - p.x3);
  const onLine = (cam, p, q) => Math.abs(cross(cam, p, q)) / ((Math.hypot(q.x3 - p.x3, q.z3 - p.z3) * Math.hypot(cam[0] - p.x3, cam[2] - p.z3)) || 1) < Math.sin((L.lineDeg * Math.PI) / 180);
  for (let i = 0; i < shared.length; i++) for (let j = i + 1; j < shared.length; j++) {
    const [pa, pb] = shared[i], [qa, qb] = shared[j];
    if (![pa, pb].some((x) => x.lookAt === qa.name) && ![qa, qb].some((x) => x.lookAt === pa.name)) continue;
    if (onLine(A.cam.pos, pa, qa) || onLine(B.cam.pos, pb, qb)) continue;
    if (Math.sign(cross(A.cam.pos, pa, qa)) * Math.sign(cross(B.cam.pos, pb, qb)) < 0) flags.push(`the eye-line ${pa.name} - ${qa.name} is crossed (the cameras stand on both sides of it)${declared ? ' - declared in the staging' : ''}`);
  }
  return { flags, rows: rows.map(({ size, ...r }) => r) };
}
