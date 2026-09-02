/* Where every thumb and every trigger finger actually ends up, against the
 * one line that settles it: the bore. A thumb above the bore is lying on
 * top of the slide. A trigger finger above the bore is not on a trigger. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const p = await b.newPage({ viewport: { width: 240, height: 150 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body style="margin:0"><canvas id="game" style="position:fixed;inset:0;width:100%;height:100%"></canvas></body>');
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/engine/legend-engine.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(R + 'site/games/bunker-nine.js', 'utf8') });
  const r = await p.evaluate(() => {
    window.B = BUNKER.start({ canvas: '#game', test: true, quality: 'low' });
    for (let i = 0; i < 8; i++) { B.S.toSpawn = 0; B.S.spawnT = 1e9; B.game.step(1/60); }
    const P = B.P, out = [];
    for (const [id, v] of Object.entries(P.view)) {
      const w = __T_WEAPONS[id];
      if (!w || w.melee) continue;
      const root = v.kind === 'single' ? v.actor : v.root;
      const bore = (root && root.boreAt != null) ? root.boreAt : null;
      const a = v.arms;
      if (!a || !a.digits || !a.digits.right || bore == null) continue;
      const dg = a.digits.right;
      // The trigger finger is the last of the four.
      const ds = dg.digits || [];
      const trig = ds.length ? ds[ds.length - 1] : null;
      /* Do the fingers overlap each other?
       *
       * Every grip carries its own knuckle spacing and the fingers carry
       * their own radius, and the two were separate numbers. When the
       * hands were scaled up to match the arms, four 21.2 mm fingers ended
       * up on a 19.4 mm pitch -- 1.8 mm inside each other, which welds
       * them into one continuous slab. A grip close up was a paddle with
       * grooves in it. Adjacent knuckles must be at least a finger apart. */
      let tight = 0, worstGap = 9;
      const wrap = ds.filter((d2, i2) => i2 < ds.length - (trig ? 1 : 0));
      for (let i2 = 1; i2 < wrap.length; i2++) {
        const a2 = wrap[i2 - 1].knuckle, b2 = wrap[i2].knuckle;
        const gap = Math.hypot(a2[0]-b2[0], a2[1]-b2[1], a2[2]-b2[2]) - (wrap[i2].r * 2);
        if (gap < worstGap) worstGap = gap;
        /* Touching is correct -- adjacent fingers on a grip are pressed
           together, and the knuckle row is CURVED round the object as
           well, which shortens the chord between neighbours by a few
           millimetres more. What is wrong is MERGING: two cylinders far
           enough inside each other that the surfaces weld and the pair
           reads as one slab. A quarter of a finger is the line. */
        if (gap < -wrap[i2].r * 0.5) tight++;
      }
      /* HOW MUCH OF EACH FINGER IS INSIDE THE GUN.
       *
       * Every hand regression this file has ever shipped passed every
       * check above it. Aiming the trigger finger at its guard put 29 per
       * cent of the Thompson's index and 17 of the MG 42's inside the
       * weapon and grip, map and pad all stayed green, because nothing
       * here was looking. A tip below the bore and four knuckles a finger
       * apart is a hand in roughly the right PLACE; it says nothing about
       * whether the hand is in the metal.
       *
       * Ray parity against the weapon's own triangles: a ray from a point
       * crosses a closed surface an odd number of times exactly when the
       * point is inside it. No distance field, no flood fill, no
       * occupancy grid -- all three of those were tried in the builder
       * and all three were fooled by the hollow shells and slotted tubes
       * these weapons are made of.
       *
       * WEAPON-ONLY triangles, gathered by skipping the arm actors. Twice
       * I have diagnosed hands against a field that included the hands,
       * because by this point the arms are parented to the weapon, and
       * both answers were fiction. */
      /* AND SKIPPING THE RELOAD PROP, which is a third fiction and the
       * biggest of the three.
       *
       * Every weapon builds its magazine, clip, belt or pair of shells at
       * start-up so a reload does not upload a mesh mid-fight, hangs it
       * off the same root as the gun, and hides it. It is not in the
       * scene, and it did not exist when the hand was solved -- the arms
       * are built before the props -- so the solver has never had a
       * chance to avoid it. This gather counted it anyway.
       *
       * Attributed per part, that is where most of the worst numbers in
       * this table came from: the Thompson's ring finger at 42 per cent
       * and its trigger finger at 17 are BOTH inside a magazine that is
       * not there, and so are the MP5's middle and index, the 1911's ring
       * and little, the Scattergun's index in a shell and the Arc's in a
       * battery cell. Skipping the prop, every one of those goes to
       * nothing.
       *
       * Which retires a bug: "the Thompson's trigger finger is a third
       * inside its receiver" was this, not a finger in a receiver. */
      const propSet = new Set((v.prop && v.prop.parts) || []);
      const armSet = new Set([a.sleeve, a.skin, a.lSleeve, a.lSkin, a.thumb,
        a.lThumb, a.index].concat(a.rFingers || []).concat(a.lFingers || [])
        .concat([...propSet]).filter(Boolean));
      const M4 = LegendEngine.Mat4;
      const tri = [];
      const gather = (act, m) => {
        if (!act || armSet.has(act)) return;
        if (act.mesh) {
          const g2 = B.game.geometryOf(act.mesh);
          if (g2 && g2.indices) {
            const P2 = g2.positions, I = g2.indices, e2 = m ? m.e : null;
            const tf = (i3) => {
              const x = P2[i3*3], y = P2[i3*3+1], z = P2[i3*3+2];
              return e2 ? [e2[0]*x+e2[4]*y+e2[8]*z+e2[12], e2[1]*x+e2[5]*y+e2[9]*z+e2[13],
                e2[2]*x+e2[6]*y+e2[10]*z+e2[14]] : [x, y, z];
            };
            for (let i3 = 0; i3 < I.length; i3 += 3) {
              tri.push(tf(I[i3]), tf(I[i3+1]), tf(I[i3+2]));
            }
          }
        }
        for (const c of (act.children || [])) {
          const cm = new M4(); cm.compose(c._position, c._rotation, c.scale);
          if (m) { const t2 = new M4(); t2.mulMatrices(m, cm); gather(c, t2); } else gather(c, cm);
        }
      };
      gather(root, null);
      // A direction with no axis aligned to the models, so a ray never
      // grazes a face edge-on and counts it twice or not at all.
      const DX = 0.5773, DY = 0.5774, DZ = 0.5771;
      const insideW = (ox, oy, oz) => {
        let n = 0;
        for (let t2 = 0; t2 < tri.length; t2 += 3) {
          const A = tri[t2], B2 = tri[t2+1], C = tri[t2+2];
          const e1x = B2[0]-A[0], e1y = B2[1]-A[1], e1z = B2[2]-A[2];
          const e2x = C[0]-A[0], e2y = C[1]-A[1], e2z = C[2]-A[2];
          const px = DY*e2z - DZ*e2y, py = DZ*e2x - DX*e2z, pz = DX*e2y - DY*e2x;
          const det = e1x*px + e1y*py + e1z*pz;
          if (det > -1e-12 && det < 1e-12) continue;
          const inv = 1/det;
          const tx = ox-A[0], ty = oy-A[1], tz = oz-A[2];
          const u = (tx*px + ty*py + tz*pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty*e1z - tz*e1y, qy = tz*e1x - tx*e1z, qz = tx*e1y - ty*e1x;
          const vv = (DX*qx + DY*qy + DZ*qz) * inv;
          if (vv < 0 || u + vv > 1) continue;
          if ((e2x*qx + e2y*qy + e2z*qz) * inv > 1e-7) n++;
        }
        return (n & 1) === 1;
      };
      /* AND HOW MUCH OF IT IS ON THE GUN.
       *
       * Burial alone can always be satisfied by moving the hand off the
       * weapon, and it was: sliding the forend row to the far flank took
       * the Kill Streak's support fingers to zero per cent buried and its
       * skin on the gun from 33 per cent to 4. Clean fingers in mid-air
       * beside a forend is the fault this all started from, so the two
       * numbers travel together and neither is allowed to move alone.
       *
       * Point-to-triangle distance, in the same pass as the parity ray --
       * within four millimetres of the skin is touching it. */
      const nearW = (ox, oy, oz) => {
        let best = 1e9;
        for (let t2 = 0; t2 < tri.length; t2 += 3) {
          const A = tri[t2], B2 = tri[t2+1], C = tri[t2+2];
          const abx = B2[0]-A[0], aby = B2[1]-A[1], abz = B2[2]-A[2];
          const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
          const apx = ox-A[0], apy = oy-A[1], apz = oz-A[2];
          const d1 = abx*apx + aby*apy + abz*apz;
          const d2 = acx*apx + acy*apy + acz*apz;
          let qx, qy, qz;
          if (d1 <= 0 && d2 <= 0) { qx = A[0]; qy = A[1]; qz = A[2]; } else {
            const bpx = ox-B2[0], bpy = oy-B2[1], bpz = oz-B2[2];
            const d3 = abx*bpx + aby*bpy + abz*bpz;
            const d4 = acx*bpx + acy*bpy + acz*bpz;
            if (d3 >= 0 && d4 <= d3) { qx = B2[0]; qy = B2[1]; qz = B2[2]; } else {
              const cpx = ox-C[0], cpy = oy-C[1], cpz = oz-C[2];
              const d5 = abx*cpx + aby*cpy + abz*cpz;
              const d6 = acx*cpx + acy*cpy + acz*cpz;
              if (d6 >= 0 && d5 <= d6) { qx = C[0]; qy = C[1]; qz = C[2]; } else {
                const vc = d1*d4 - d3*d2;
                if (vc <= 0 && d1 >= 0 && d3 <= 0) {
                  const w2 = d1 / (d1 - d3);
                  qx = A[0] + abx*w2; qy = A[1] + aby*w2; qz = A[2] + abz*w2;
                } else {
                  const vb = d5*d2 - d1*d6;
                  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
                    const w2 = d2 / (d2 - d6);
                    qx = A[0] + acx*w2; qy = A[1] + acy*w2; qz = A[2] + acz*w2;
                  } else {
                    const va = d3*d6 - d5*d4;
                    if (va <= 0 && (d4-d3) >= 0 && (d5-d6) >= 0) {
                      const w2 = (d4-d3) / ((d4-d3) + (d5-d6));
                      qx = B2[0] + (C[0]-B2[0])*w2; qy = B2[1] + (C[1]-B2[1])*w2;
                      qz = B2[2] + (C[2]-B2[2])*w2;
                    } else {
                      const den = 1 / (va + vb + vc);
                      const v2 = vb * den, w2 = vc * den;
                      qx = A[0] + abx*v2 + acx*w2; qy = A[1] + aby*v2 + acy*w2;
                      qz = A[2] + abz*v2 + acz*w2;
                    }
                  }
                }
              }
            }
          }
          const dx = ox-qx, dy = oy-qy, dz = oz-qz;
          const dd = dx*dx + dy*dy + dz*dz;
          if (dd < best) { best = dd; if (best < 1e-8) break; }
        }
        return Math.sqrt(best);
      };
      const buried = [], onGun = [];
      const digitMeshes = [];
      for (let f = 0; f < 4; f++) {
        if (a.rFingers && a.rFingers[f]) digitMeshes.push([(f === 3 ? 'index' : 'r' + f), a.rFingers[f]]);
        if (a.lFingers && a.lFingers[f]) digitMeshes.push(['l' + f, a.lFingers[f]]);
      }
      for (const [dn, act] of digitMeshes) {
        const g3 = B.game.geometryOf(act.mesh);
        if (!g3 || !g3.positions) continue;
        const m3 = new M4(); m3.compose(act._position, act._rotation, act.scale);
        const e3 = m3.e, P3 = g3.positions, n3 = P3.length / 3;
        // Every ninth vertex: enough to see a quarter of a finger buried,
        // cheap enough to run on twelve weapons in a test.
        let seen = 0, inN = 0, onN = 0;
        for (let i3 = 0; i3 < n3; i3 += 9) {
          const x = P3[i3*3], y = P3[i3*3+1], z = P3[i3*3+2];
          const wx = e3[0]*x+e3[4]*y+e3[8]*z+e3[12];
          const wy = e3[1]*x+e3[5]*y+e3[9]*z+e3[13];
          const wz = e3[2]*x+e3[6]*y+e3[10]*z+e3[14];
          seen++;
          if (insideW(wx, wy, wz)) inN++;
          else if (nearW(wx, wy, wz) < 0.004) onN++;
        }
        if (seen) {
          buried.push([dn, Math.round(inN * 100 / seen)]);
          onGun.push([dn, Math.round(onN * 100 / seen)]);
        }
      }
      out.push({ id, bore: +bore.toFixed(3), buried, onGun,
        tight, gap: worstGap > 8 ? null : +worstGap.toFixed(4),
        thumbY: dg.thumbTip ? +(dg.thumbTip[1] - bore).toFixed(3) : null,
        trigY: trig ? +(trig.tip[1] - bore).toFixed(3) : null,
        trigX: trig ? +trig.tip[0].toFixed(3) : null,
        knuckX: trig ? +trig.knuckle[0].toFixed(3) : null,
        plane: dg.indexPlane || '-', errs: dg.indexErr || null });
    }
    return out;
  });
  let passed = 0, failed = 0;
  const check = (name, cond, detail) => {
    if (cond) { passed++; console.log('  ok   ' + name); }
    else { failed++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
  };
  console.log('   weapon        thumb v bore  trigger v bore  tip-knuckle  plane  wrap/fwd err');
  for (const q of r) {
    const f = (v) => v == null ? '   -' : (v > 0 ? '+' : '') + (v * 1000).toFixed(0) + 'mm';
    const reach = (q.trigX != null && q.knuckX != null) ? (q.trigX - q.knuckX) : null;
    console.log('   ' + q.id.padEnd(13) + f(q.thumbY).padStart(12) + f(q.trigY).padStart(16)
      + (reach == null ? '   -' : ((reach > 0 ? '+' : '') + (reach * 1000).toFixed(0) + 'mm')).padStart(13)
      + ('  ' + q.plane).padStart(8) + ('  ' + (q.errs ? q.errs.join(' / ') : '-')).padStart(16));
  }
  console.log('');
  /* Above the bore is the top of the slide. A thumb there is a sausage
     lying in the sight line; a trigger finger there is not on a trigger. */
  const badT = r.filter((q) => q.thumbY != null && q.thumbY > 0.004);
  check('no thumb is lying on top of the weapon',
    r.length > 8 && badT.length === 0,
    badT.map((q) => q.id + ' +' + Math.round(q.thumbY * 1000) + 'mm').join(', '));
  const badF = r.filter((q) => q.trigY != null && q.trigY > 0.004);
  check('every trigger finger is below the bore',
    badF.length === 0, badF.map((q) => q.id + ' +' + Math.round(q.trigY * 1000) + 'mm').join(', '));
  /* And REACHING. A trigger finger scored against the nearest surface
     curls into the grip and makes a fist, which touches the gun perfectly
     and points at nothing -- eleven of thirteen finished behind their own
     knuckle before this was measured. */
  const curled = r.filter((q) => q.trigX != null && q.knuckX != null && (q.trigX - q.knuckX) < 0.012);
  check('every trigger finger reaches forward rather than curling into a fist',
    curled.length === 0,
    curled.map((q) => q.id + ' ' + Math.round((q.trigX - q.knuckX) * 1000) + 'mm').join(', '));
  /* AND NOT INSIDE THE GUN.
   *
   * The three checks above put a hand in roughly the right PLACE and say
   * nothing about whether it is in the metal, which is why every hand
   * regression this session passed all of them. Measured per digit by ray
   * parity: aiming the trigger finger at its guard took the Thompson's
   * index from 10 per cent buried to 29 and the MG 42's from 1 to 17,
   * with the suite green throughout.
   *
   * A fifth is the line. Some burial is real and right -- a fingertip
   * inside a trigger guard's bow reads as inside by parity, and so does
   * a pad pressed into a rubber grip -- but a fifth of a finger is not
   * pressed against anything, it is through it. The numbers are printed
   * whether they pass or not, because the trend matters more than the
   * threshold and a table nobody sees is a table nobody checks. */
  /* A BASELINE, not a target. Twenty-two digits are over a fifth buried
     today and pretending otherwise by picking a threshold they pass
     would be worse than useless. What this has to catch is the thing
     that actually went wrong: a change that makes one of them worse
     while every other check stays green. So the numbers as they stand
     are written down, the table is printed every run, and the test fails
     only when a digit gets materially worse than it was. Lower a number
     here when you improve it; that is what stops the ratchet slipping. */
  /* Moved twice, and the second time was not an improvement in the hands
     at all -- it was the measurement being wrong.
     
     First: when the march's crossing test was made to agree with what the
     march aims at. Sixteen digits improved and three got worse, and the
     fleet went 13.6 per cent buried to 11.9.
     
     Then: when this gather stopped counting the hidden RELOAD PROP as
     part of the weapon. Nothing about any hand changed -- not one vertex
     moved -- and the fleet read 11.8 per cent to 10.1 buried and 11.3 to
     10.3 touching, because a third of the worst numbers in this table
     were fingers inside magazines that are not in the scene. The
     Thompson's ring finger 42 per cent to 8 and its trigger finger 33 to
     17, the MP5's middle 25 to 8, the Arc's index 42 to 25.
     
     A few went UP, and that is real: parity counts crossings, so a prop's
     triangles standing in the ray's path could make the two directions
     disagree and report OUTSIDE. The Sawn-off's index 17 to 25 and the MG
     42's 25 to 33 are burial the magazine was hiding.
     
     The ratchet is only worth having if it moves when the fleet genuinely
     improves and records what it cost -- and if it moves when the
     instrument is corrected and says so. */
  const BASE = {
    m1911: { r0: 0, l0: 0, r1: 8, l1: 8, r2: 8, l2: 8, index: 0, l3: 8 },
    blaze: { r0: 0, l0: 0, r1: 8, l1: 8, r2: 8, l2: 8, index: 0, l3: 8 },
    thompson: { r0: 0, l0: 8, r1: 0, l1: 8, r2: 8, l2: 8, index: 17, l3: 8 },
    scatter: { r0: 0, l0: 0, r1: 0, l1: 8, r2: 8, l2: 8, index: 0, l3: 8 },
    arc: { r0: 0, l0: 0, r1: 0, l1: 0, r2: 0, l2: 0, index: 25, l3: 8 },
    obliterator: { r0: 8, l0: 0, r1: 8, l1: 0, r2: 8, l2: 0, index: 25, l3: 0 },
    mauser: { r0: 17, l0: 25, r1: 8, l1: 17, r2: 0, l2: 0, index: 17, l3: 8 },
    paralyzer: { r0: 0, l0: 33, r1: 0, l1: 42, r2: 8, l2: 25, index: 8, l3: 25 },
    mp5: { r0: 0, l0: 25, r1: 0, l1: 17, r2: 8, l2: 25, index: 8, l3: 8 },
    sawnoff: { r0: 0, l0: 17, r1: 0, l1: 17, r2: 17, l2: 25, index: 25, l3: 8 },
    remington: { r0: 0, l0: 17, r1: 0, l1: 8, r2: 8, l2: 8, index: 8, l3: 8 },
    killstreak: { r0: 0, l0: 33, r1: 0, l1: 33, r2: 8, l2: 42, index: 33, l3: 58 },
    mg42: { r0: 0, l0: 17, r1: 8, l1: 17, r2: 17, l2: 0, index: 33, l3: 8 },
  };
  // Eight points is about one sample in twelve: past the noise of which
  // vertices happen to land inside, and well under the 19 that aiming
  // the Thompson's trigger finger at its guard cost it.
  const worse = [], gone = [];
  let total = 0, n = 0;
  console.log('   weapon        digits inside the weapon (baseline in brackets when it moved)');
  for (const q of r) {
    const bl = BASE[q.id];
    const cells = (q.buried || []).map(([dn, pc]) => {
      total += pc; n++;
      const was = bl ? bl[dn] : null;
      if (was == null) { gone.push(q.id + ' ' + dn); return dn + ' ' + pc + '%'; }
      if (pc > was + 8) worse.push(q.id + ' ' + dn + ' ' + was + '% -> ' + pc + '%');
      return dn + ' ' + pc + '%' + (pc === was ? '' : ' [' + was + ']');
    });
    console.log('   ' + q.id.padEnd(13) + cells.join('  '));
  }
  console.log('   ' + (n ? (total / n).toFixed(1) : '-') + '% of the average digit is inside its weapon');
  /* The other half of the pair. No threshold on this one yet -- the point
     for now is that it is printed beside the burial figure, so a change
     that empties one column by filling the other cannot look like a win. */
  let onT = 0, onN2 = 0;
  console.log('   weapon        digits touching the weapon');
  for (const q of r) {
    for (const [, pc] of (q.onGun || [])) { onT += pc; onN2++; }
    console.log('   ' + q.id.padEnd(13)
      + (q.onGun || []).map(([dn, pc]) => dn + ' ' + pc + '%').join('  '));
  }
  console.log('   ' + (onN2 ? (onT / onN2).toFixed(1) : '-') + '% of the average digit is touching it');
  console.log('');
  check('no finger got deeper into the weapon than it already was',
    worse.length === 0 && gone.length === 0,
    worse.concat(gone.map((g4) => g4 + ' has no baseline')).join(', '));
  const merged = r.filter((q) => q.tight > 0);
  check('the fingers of a hand do not overlap into one slab',
    merged.length === 0,
    merged.map((q) => q.id + ' ' + q.tight + ' pairs, worst ' + Math.round(q.gap * 1000) + 'mm').join(', '));
  const noPlane = r.filter((q) => q.plane === '-');
  check('every weapon has a finger on its trigger',
    noPlane.length === 0, noPlane.map((q) => q.id).join(', '));
  const real = errs.filter((e) => !/SwiftShader|Fallback|favicon/i.test(e));
  check('nothing threw', real.length === 0, real.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
