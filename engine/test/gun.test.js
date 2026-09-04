/* Every gun, checked on its own.
 *
 * The full sweep boots the whole game and takes a long time. This builds
 * ONLY the weapons -- world models and viewmodels -- and asks the
 * questions a machine can answer about a gun:
 *
 *   is any of it not a number
 *   does every index point at a vertex that exists
 *   is every normal a unit vector
 *   is any part paper-thin (a card standing in for a solid)
 *   is any part FLOATING -- clear of every other part of the same gun
 *   is the whole thing the length the real one is
 */
const { chromium } = require('playwright');
const fs = require('fs'), R = '/home/user/Untitled-new-game-project/';

/* Overall length of the real weapon, millimetres, with the tolerance
   this is checked to.
 *
 * Two of these were wrong the first time and the guns were right. The
 * Scattergun is a COACH gun -- 472 mm barrels, which is an 18 inch
 * side-by-side and a real thing -- not the 1120 mm field gun I first
 * wrote down. And a sawn-off is sawn off: 350 to 500 mm is the whole
 * point of one, not the 610 mm legal-minimum I used. */
const REAL_MM = {
  m1911: 216, blaze: 216, thompson: 857, mp5: 680, scatter: 890,
  sawnoff: 400, mauser: 288, remington: 1092, mg42: 1220, obliterator: 300,
};

/* Parts that are MEANT to be paper-thin, by name. The thinness rule
   exists to catch a 2D card standing in for a solid object; a scope's
   reticle is not standing in for anything, it is a wire, and a duplex
   cross four millimetres thick is a set of steel bars across the sight
   picture. Exempted by what it is, not by how thin it happens to be. */
const WIRE_PARTS = /reticle|hair|wire|strand/i;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.setContent('<body style="margin:0"><canvas id="game"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });

  const out = await p.evaluate(() => {
    /* Capture every geometry as it is uploaded -- the GpuMesh drops the
       CPU arrays afterwards, so this is the only moment they exist. */
    const geos = new Map();
    const E = LE.Engine.prototype, real = E._mesh;
    E._mesh = function (key, build) {
      if (!this.meshCache.get(key)) {
        let g = null;
        const m = real.call(this, key, () => (g = build()));
        if (g && g.positions) geos.set(m, g);
        return m;
      }
      return real.call(this, key, build);
    };

    const B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 4; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1/60); }

    const ids = Object.keys(BUNKER.WEAPONS);
    const report = [];

    /* Walk a viewmodel's actors and gather the geometry of each, with the
       part's own local transform, so a part's place on the gun is known. */
    const partsOf = (root, R, T) => {
      const acc = [];
      const walk = (n) => {
        const g = geos.get(n.mesh);
        const m = n.matrix && n.matrix.e;
        if (g && m) {
          const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
          let nan = 0, badIdx = 0, badNorm = 0, degen = 0;
          const P = g.positions, I = g.indices, N = g.normals;
          /* Into the WEAPON'S own frame, from the real vertices.
             A box round a tilted object is its diagonal, and projecting
             an already-axis-aligned box onto the object's axes inflates
             it a second time -- both of which I did before getting
             here. R is the root's rotation, T its translation, and the
             inverse of a rigid transform is R-transpose times (w - T). */
          for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i+1], z = P[i+2];
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { nan++; continue; }
            const wx = m[0]*x + m[4]*y + m[8]*z + m[12] - T[0];
            const wy = m[1]*x + m[5]*y + m[9]*z + m[13] - T[1];
            const wz = m[2]*x + m[6]*y + m[10]*z + m[14] - T[2];
            const w = [wx*R[0][0] + wy*R[0][1] + wz*R[0][2],
                       wx*R[1][0] + wy*R[1][1] + wz*R[1][2],
                       wx*R[2][0] + wy*R[2][1] + wz*R[2][2]];
            for (let k = 0; k < 3; k++) { if (w[k] < lo[k]) lo[k] = w[k]; if (w[k] > hi[k]) hi[k] = w[k]; }
          }
          const nv = P.length / 3;
          if (I) for (let i = 0; i < I.length; i++) if (I[i] >= nv) badIdx++;
          if (N) for (let i = 0; i < N.length; i += 3) {
            const L = Math.hypot(N[i], N[i+1], N[i+2]);
            if (!Number.isFinite(L) || Math.abs(L - 1) > 0.02) badNorm++;
          }
          if (I) for (let i = 0; i + 2 < I.length; i += 3) {
            const a = I[i]*3, b2 = I[i+1]*3, c = I[i+2]*3;
            const ux = P[b2]-P[a], uy = P[b2+1]-P[a+1], uz = P[b2+2]-P[a+2];
            const vx = P[c]-P[a], vy = P[c+1]-P[a+1], vz = P[c+2]-P[a+2];
            const cx = uy*vz - uz*vy, cy = uz*vx - ux*vz, cz = ux*vy - uy*vx;
            if (Math.hypot(cx, cy, cz) < 1e-12) degen++;
          }
          acc.push({ name: n.name || (n.mesh && n.mesh.__key) || '?',
            lo, hi, nan, badIdx, badNorm, degen, tris: I ? I.length/3 : 0, verts: nv });
        }
        for (const c of (n.children || [])) walk(c);
      };
      walk(root);
      return acc;
    };

    for (const id of ids) {
      const v = B.P.view[id];
      if (!v) { report.push({ id, err: 'no viewmodel' }); continue; }
      const root = v.kind === 'single' ? v.actor : v.root;
      if (!root) { report.push({ id, err: 'no root' }); continue; }
      // Only the weapon: the arms and the hidden reload props are not it.
      const skip = new Set();
      const a = v.arms || {};
      for (const k of ['sleeve','skin','lSleeve','lSkin','thumb','lThumb','index']) if (a[k]) skip.add(a[k]);
      for (const q of (a.rFingers || [])) skip.add(q);
      for (const q of (a.lFingers || [])) skip.add(q);
      for (const q of ((v.prop && v.prop.parts) || [])) skip.add(q);
      const rm0 = root.matrix && root.matrix.e;
      if (!rm0) { report.push({ id, err: 'no matrix' }); continue; }
      const RR = [[rm0[0], rm0[1], rm0[2]], [rm0[4], rm0[5], rm0[6]], [rm0[8], rm0[9], rm0[10]]];
      for (const a2 of RR) {
        const L = Math.hypot(a2[0], a2[1], a2[2]) || 1;
        a2[0] /= L; a2[1] /= L; a2[2] /= L;
      }
      const TT = [rm0[12], rm0[13], rm0[14]];
      const all = partsOf(root, RR, TT);
      // Drop anything whose actor is in the skip set -- partsOf lost the
      // actor, so filter by rebuilding with a guard instead.
      const parts = [];
      const walk2 = (n) => {
        if (!skip.has(n)) {
          const g = geos.get(n.mesh);
          if (g && n.matrix) parts.push(n);
        }
        for (const c of (n.children || [])) if (!skip.has(c)) walk2(c);
      };
      walk2(root);
      const keep = new Set(parts.map((n) => n.name || (n.mesh && n.mesh.__key) || '?'));
      const rows = all.filter((q) => keep.has(q.name));

      /* Everything above is already in the gun's own frame, so the
         whole-gun box is a plain union of the parts. */
      const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
      for (const q of rows) for (let k = 0; k < 3; k++) {
        if (q.lo[k] < lo[k]) lo[k] = q.lo[k];
        if (q.hi[k] > hi[k]) hi[k] = q.hi[k];
      }
      const size = hi.map((h, k) => +(h - lo[k]).toFixed(4));

      const nan = rows.reduce((s, q) => s + q.nan, 0);
      const badIdx = rows.reduce((s, q) => s + q.badIdx, 0);
      const badNorm = rows.reduce((s, q) => s + q.badNorm, 0);
      const empty = rows.filter((q) => q.verts === 0 || q.tris === 0).map((q) => q.name);
      const thin = rows.filter((q) => {
        // Defined here rather than outside: this runs in the page.
        if (/reticle|hair|wire|strand/i.test(q.name)) return false;
        const s2 = [q.hi[0]-q.lo[0], q.hi[1]-q.lo[1], q.hi[2]-q.lo[2]];
        return Math.min.apply(null, s2) < 0.0015 && Math.max.apply(null, s2) > 0.040;
      }).map((q) => q.name + ' (' + [q.hi[0]-q.lo[0], q.hi[1]-q.lo[1], q.hi[2]-q.lo[2]]
        .map((v) => (v * 1000).toFixed(1)).join('x') + ' mm)');
      const degenHeavy = rows.filter((q) => q.tris > 40 && q.degen / q.tris > 0.06)
        .map((q) => q.name + ' ' + q.degen + '/' + q.tris);

      /* Floating parts: a piece whose box is clear of EVERY other piece
         of the same gun by more than 4 mm is not attached to it. */
      const floats = [];
      for (let i = 0; i < rows.length; i++) {
        let near = false;
        for (let j = 0; j < rows.length && !near; j++) {
          if (i === j) continue;
          let gap = 0;
          for (let k = 0; k < 3; k++) {
            gap = Math.max(gap, rows[i].lo[k] - rows[j].hi[k], rows[j].lo[k] - rows[i].hi[k]);
          }
          if (gap <= 0.004) near = true;
        }
        if (!near && rows.length > 1) floats.push(rows[i].name + ' ');
      }

      report.push({ id, parts: rows.length, size, nan, badIdx, badNorm,
        empty, thin, degenHeavy, floats, lengthMm: Math.round(Math.max.apply(null, size) * 1000),
        detail: (id === 'm1911' || id === 'blaze' || id === 'killstreak' || id === 'scatter')
          ? rows.map((q) => ({ n: q.name,
              lo: q.lo.map((v) => +(v * 1000).toFixed(1)),
              hi: q.hi.map((v) => +(v * 1000).toFixed(1)),
              sz: q.hi.map((v, k) => +((v - q.lo[k]) * 1000).toFixed(1)) }))
          : null });
    }
    return report;
  });

  let fails = 0;
  console.log('gun'.padEnd(13) + 'parts  len(mm)  real   notes');
  for (const r of out) {
    if (r.err) { console.log('  ' + r.id.padEnd(11) + 'ERROR ' + r.err); fails++; continue; }
    const real = REAL_MM[r.id];
    const notes = [];
    if (r.nan) { notes.push(r.nan + ' non-finite'); fails++; }
    if (r.badIdx) { notes.push(r.badIdx + ' bad indices'); fails++; }
    if (r.badNorm) { notes.push(r.badNorm + ' bad normals'); fails++; }
    if (r.empty.length) { notes.push('empty: ' + r.empty.join(',')); fails++; }
    if (r.thin.length) { notes.push('paper-thin: ' + r.thin.join(',')); fails++; }
    if (r.degenHeavy.length) { notes.push('degenerate: ' + r.degenHeavy.join(',')); fails++; }
    if (r.floats.length) { notes.push('FLOATING: ' + r.floats.join(',')); fails++; }
    let lenNote = '';
    if (real) {
      const err = (r.lengthMm - real) / real;
      lenNote = real + (Math.abs(err) > 0.20 ? '  OFF BY ' + Math.round(err * 100) + '%' : '  ok');
      if (Math.abs(err) > 0.20) fails++;
    } else lenNote = '  --';
    console.log('  ' + r.id.padEnd(11) + String(r.parts).padStart(4)
      + String(r.lengthMm).padStart(8) + '  ' + lenNote + '   ' + notes.join(' | '));
  }
  for (const r of out) if (r.detail) {
    console.log('\n' + r.id + ' parts (mm):');
    for (const q of r.detail) {
      console.log('   ' + String(q.n).slice(0, 22).padEnd(23)
        + 'lo ' + q.lo.join(',').padEnd(22) + 'hi ' + q.hi.join(',').padEnd(22)
        + 'size ' + q.sz.join(' x '));
    }
  }
  console.log('\n' + (fails ? fails + ' findings' : 'nothing found'));
  await b.close();
  console.log('ALLDONE');
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
