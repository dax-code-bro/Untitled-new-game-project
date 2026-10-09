// Riding tack geometry in 1400s materials (PROVISIONAL design): leather, wool, wood and iron.
//
//   saddle (Leaf, the scout): a wool saddle cloth with a rolled edge; a padded leather seat
//     with real thickness, a stitched welt round its edge, a raised cantle and pommel (a
//     wooden tree inside, leather over it); a girth with an iron buckle and a breast strap round
//     the chest; stirrup leathers with iron stirrups.
//   rig (Charcoal, Starlight - nobody straddles a 4.5 m back): a wooden frame of two rails and
//     cross bars on a thick felt pad, a padded leather seat with a backrest, a leather-wrapped
//     wooden grab bar on two uprights, broad girth bands with iron buckles, foot boards.
//
// Everything is built in the creature's rest pose from its distance field (`f`), so straps
// follow the real body cross-section; rider.js skins it to the trunk.
import * as THREE from 'three';

/** Grid (nI x nJ positions, flat array) -> indexed BufferGeometry with uv (i, j normalized). */
function gridGeo(P, nI, nJ, flip = false, extra = null) {
  const I = [], uv = [];
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) uv.push(i / (nI - 1), j / (nJ - 1));
  for (let i = 0; i < nI - 1; i++) for (let j = 0; j < nJ - 1; j++) {
    const a = i * nJ + j, b = a + nJ;
    if (flip) I.push(a, a + 1, b, a + 1, b + 1, b); else I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (extra) for (const [k, v] of Object.entries(extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(v, v.length / (nI * nJ)));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** Sweep a closed profile (list of [n, b] offsets) along a path with a given "up" hint per point. */
function sweep(path, profile, upAt = () => new THREE.Vector3(0, 1, 0), closedPath = false) {
  const P = [];
  const n = path.length, m = profile.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    const U = upAt(i).clone().addScaledVector(T, -upAt(i).dot(T)).normalize();
    const B = new THREE.Vector3().crossVectors(T, U);
    for (let k = 0; k <= m; k++) {
      const [pn, pb] = profile[k % m];
      const q = path[i].clone().addScaledVector(U, pn).addScaledVector(B, pb);
      P.push(q.x, q.y, q.z);
    }
  }
  const g = gridGeo(P, n, m + 1);
  return g;
}
const roundRect = (w, h, r = 0.25, seg = 3) => {
  // closed rounded-rectangle profile, [n (up), b (side)], w = side extent, h = up extent
  const out = [];
  const rr = Math.min(w, h) * r;
  const cs = [[h / 2 - rr, w / 2 - rr, 0], [h / 2 - rr, -w / 2 + rr, 1], [-h / 2 + rr, -w / 2 + rr, 2], [-h / 2 + rr, w / 2 - rr, 3]];
  for (const [cn, cb, q] of cs) for (let s = 0; s <= seg; s++) { const a = (q + s / seg) * Math.PI / 2; out.push([cn + Math.cos(a) * rr, cb + Math.sin(a) * rr]); }
  return out;
};
const circle = (r, seg = 8) => Array.from({ length: seg }, (_, k) => [Math.cos(k / seg * Math.PI * 2) * r, Math.sin(k / seg * Math.PI * 2) * r]);

/**
 * build(o): o = { L, kind, f(x,y,z) body distance, seatZ, seatY, halfBody }
 * Returns { geos: [[geometry, materialKey]], seatTop, seatLen, seatW, block }.
 */
export function buildTack(o) {
  const { L, kind, f, seatZ, seatY } = o;
  const rig = kind === 'rig';
  const geos = [];
  const cy = seatY - L * 0.04;
  // march from the body's centre line at height cy outward along angle a (0 = straight up) at z
  const surf = (a, z, off = 0) => {
    const dx = Math.sin(a), dy = Math.cos(a);
    let r = L * 0.2;
    for (let k = 0; k < 120; k++) { const d = f(dx * r, cy + dy * r, z); if (Math.abs(d) < L * 1e-4) break; r -= d * 0.9; if (r < 0) { r = 0; break; } }
    return new THREE.Vector3(dx * (r + off), cy + dy * (r + off), z);
  };
  // angle on the body contour (at z) that is `s` metres along the surface from the top
  const angleAt = (s, z) => {
    let a = 0, acc = 0, prev = surf(0, z);
    const sg = Math.sign(s) || 1, target = Math.abs(s), da = 0.03;
    while (Math.abs(a) < Math.PI * 0.95) {
      const p = surf(a + sg * da, z), dl = p.distanceTo(prev);
      if (acc + dl >= target) return a + sg * da * (target - acc) / Math.max(dl, 1e-6);
      acc += dl; prev = p; a += sg * da;
    }
    return a;
  };
  // a sheet lying on the body: z from z0 to z1, across from -halfW to +halfW metres of surface
  const sheet = (z0, z1, halfW, nZ, nA, offFn) => {
    const P = [], N = [];
    for (let i = 0; i < nZ; i++) {
      const u = i / (nZ - 1), z = z0 + (z1 - z0) * u;
      const aL = angleAt(-halfW(u), z), aR = angleAt(halfW(u), z);
      for (let j = 0; j < nA; j++) {
        const v = j / (nA - 1), a = aL + (aR - aL) * v;
        const p = surf(a, z, offFn(u, v));
        P.push(p); N.push(new THREE.Vector3(Math.sin(a), Math.cos(a), 0));
      }
    }
    return { P, N, nZ, nA };
  };
  // a slab (top sheet + under side + edges) from a sheet and a thickness function
  const slab = (S, thick, key, flipTop = false) => {
    const top = [], bot = [];
    S.P.forEach((p, k) => { const i = Math.floor(k / S.nA), j = k % S.nA; const t = thick(i / (S.nZ - 1), j / (S.nA - 1)); top.push(p.x, p.y, p.z); const q = p.clone().addScaledVector(S.N[k], -t); bot.push(q.x, q.y, q.z); });
    geos.push([gridGeo(top, S.nZ, S.nA, flipTop), key]);
    geos.push([gridGeo(bot, S.nZ, S.nA, !flipTop), key]);
    // edges: walk the perimeter, quads between top and bottom
    const per = [];
    for (let j = 0; j < S.nA; j++) per.push(j);
    for (let i = 1; i < S.nZ; i++) per.push(i * S.nA + S.nA - 1);
    for (let j = S.nA - 2; j >= 0; j--) per.push((S.nZ - 1) * S.nA + j);
    for (let i = S.nZ - 2; i >= 1; i--) per.push(i * S.nA);
    per.push(0);
    const E = [];
    for (const k of per) { E.push(bot[k * 3], bot[k * 3 + 1], bot[k * 3 + 2], top[k * 3], top[k * 3 + 1], top[k * 3 + 2]); }
    geos.push([gridGeo(E, per.length, 2, flipTop), key]);
    return { top, per };
  };
  // a strap round the body: a band with real thickness (inner/outer faces + edges) at z (+ tilt dz per unit height)
  const band = (z, width, thick, a0 = -Math.PI * 0.999, a1 = Math.PI * 0.999, tilt = 0, key = 'strap', n = 64) => {
    const path = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; const zz = z + tilt * (1 - Math.cos(a)) * 0.5; path.push({ p: surf(a, zz, 0.004), a }); }
    const prof = roundRect(width, thick, 0.35, 2);
    const g = sweep(path.map((q) => q.p.clone().add(new THREE.Vector3(Math.sin(q.a), Math.cos(q.a), 0).multiplyScalar(thick * 0.5))), prof,
      (i) => new THREE.Vector3(Math.sin(path[i].a), Math.cos(path[i].a), 0));
    geos.push([g, key]);
    return path;
  };
  // an iron buckle (a rectangular frame + tongue) lying on the strap at angle a, z
  const buckle = (a, z, w, sz = 1) => {
    const c = surf(a, z, 0.012 * sz);
    const nrm = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
    const tan = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0);    // along the strap
    const ax = new THREE.Vector3(0, 0, 1);                            // across the strap
    const hw = w * 0.62, hl = w * 0.45;
    const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]];
    const path = [];
    for (let k = 0; k < corners.length - 1; k++) for (let s = 0; s < 6; s++) {
      const t = s / 6, A = corners[k], B = corners[k + 1];
      path.push(c.clone().addScaledVector(tan, A[0] + (B[0] - A[0]) * t).addScaledVector(ax, A[1] + (B[1] - A[1]) * t));
    }
    path.push(path[0].clone());
    geos.push([sweep(path, circle(0.0055 * sz, 6), () => nrm), 'iron']);
    const tongue = [c.clone().addScaledVector(tan, -hl), c.clone().addScaledVector(tan, hl * 0.9).addScaledVector(nrm, 0.004 * sz)];
    geos.push([sweep([tongue[0], tongue[0].clone().lerp(tongue[1], 0.5), tongue[1]], circle(0.004 * sz, 6), () => nrm), 'iron']);
    // the strap end (billet) running through it, a short loose tail
    const tail = [];
    for (let k = 0; k <= 6; k++) tail.push(c.clone().addScaledVector(tan, hl * 0.6 + k * 0.03 * sz).addScaledVector(nrm, 0.009 * sz));
    geos.push([sweep(tail, roundRect(w * 0.9, 0.006 * sz, 0.3, 2).map(([pn, pb]) => [pn, pb]), () => nrm), 'strap']);
  };

  let seatTop, seatLen, seatW, block;
  if (!rig) {
    // ------------------------------------------------------------ saddle
    seatLen = 0.6; seatW = Math.min(0.48, Math.max(0.3, o.halfBody * 2.1)); block = 0;
    // wool saddle cloth: wider and longer than the seat, hanging a little down the flanks
    const clothHalf = (u) => seatW * 0.5 + 0.2 + 0.03 * Math.sin(Math.PI * u);
    const cloth = sheet(seatZ - seatLen * 0.62, seatZ + seatLen * 0.58, clothHalf, 18, 30, () => 0.006);
    slab(cloth, () => 0.012, 'wool');
    // the seat: padded leather on a wooden tree; dished, raised cantle and pommel, rolled edges
    const seatHalf = (u) => seatW * 0.5 * (1 - 0.3 * Math.pow(Math.abs(u - 0.5) * 2, 2.5));
    const lift = (u, v) => {
      const e = Math.sin(Math.PI * v), ee = Math.pow(e, 0.4);
      const cant = Math.exp(-Math.pow((u - 0.04) / 0.1, 2)) * 0.1 + Math.exp(-Math.pow((u - 0.95) / 0.07, 2)) * 0.075;
      return 0.02 + ee * (0.035 + cant * (0.55 + 0.45 * (1 - Math.abs(v - 0.5) * 2))) - 0.012 * Math.exp(-Math.pow((u - 0.45) / 0.25, 2)) * e;
    };
    const seat = sheet(seatZ - seatLen * 0.5, seatZ + seatLen * 0.5, seatHalf, 26, 22, lift);
    slab(seat, (u, v) => 0.03 + lift(u, v) * 0.6, 'seat');
    // the welt (piping) round the seat's top edge: a rolled leather cord
    const welt = [];
    const nZ = seat.nZ, nA = seat.nA;
    const idx = [];
    for (let j = 0; j < nA; j++) idx.push(j);
    for (let i = 1; i < nZ; i++) idx.push(i * nA + nA - 1);
    for (let j = nA - 2; j >= 0; j--) idx.push((nZ - 1) * nA + j);
    for (let i = nZ - 2; i >= 0; i--) idx.push(i * nA);
    for (const k of idx) welt.push(seat.P[k].clone());
    geos.push([sweep(welt, circle(0.007, 6), (i) => seat.N[idx[i]], true), 'seat']);
    // the cantle board and the pommel arch (wood inside, leather over it)
    for (const [u, h, r] of [[0.02, 0.12, 0.022], [0.97, 0.09, 0.02]]) {
      const z = seatZ - seatLen * 0.5 + seatLen * u;
      const arc = [];
      const hw = seatHalf(u) * 0.95;
      for (let k = 0; k <= 16; k++) { const v = k / 16; const s = -hw + 2 * hw * v; const a = angleAt(s, z); arc.push(surf(a, z, 0.03 + h * Math.pow(Math.sin(Math.PI * v), 0.6))); }
      geos.push([sweep(arc, roundRect(r * 2.2, r * 1.6, 0.45, 2), () => new THREE.Vector3(0, 0, 1)), 'seat']);
    }
    seatTop = seatY + lift(0.45, 0.5) + 0.01;
    // girth behind the forelegs with a buckle on the left side, a breast strap round the chest
    const gz = seatZ - Math.max(0.05, L * 0.012);
    band(gz, 0.075, 0.009, -Math.PI * 0.999, Math.PI * 0.999, 0, 'strap');
    buckle(Math.PI * 0.42, gz, 0.07);
    band(seatZ + seatLen * 0.48, 0.045, 0.007, -Math.PI * 0.62, Math.PI * 0.62, 0.32 * L * 0.03, 'strap');
    // stirrup leathers and iron stirrups
    for (const sd of [1, -1]) {
      const a = sd * Math.abs(angleAt(seatW * 0.5 + 0.06, seatZ));
      const top = surf(a, seatZ + 0.02, 0.02);
      const drop = 0.5;
      const bot = top.clone().add(new THREE.Vector3(sd * 0.1, -drop, 0.03));
      const lp = [top, top.clone().lerp(bot, 0.5).add(new THREE.Vector3(sd * 0.03, 0, 0)), bot];
      geos.push([sweep(lp, roundRect(0.03, 0.005, 0.3, 2), () => new THREE.Vector3(sd, 0, 0)), 'strap']);
      const st = [];
      for (let k = 0; k <= 14; k++) { const t = k / 14 * Math.PI; st.push(bot.clone().add(new THREE.Vector3(0, -0.02 - Math.sin(t) * 0.11, -Math.cos(t) * 0.065))); }
      geos.push([sweep(st, circle(0.007, 6), () => new THREE.Vector3(sd, 0, 0)), 'iron']);
      const tread = [st[0].clone(), st[st.length - 1].clone()];
      geos.push([sweep([tread[0], tread[0].clone().lerp(tread[1], 0.5).add(new THREE.Vector3(0, -0.006, 0)), tread[1]], roundRect(0.05, 0.01, 0.3, 2), () => new THREE.Vector3(0, 1, 0)), 'iron']);
    }
  } else {
    // --------------------------------------------------------------- rig
    seatLen = 1.25; seatW = 0.72; block = 0.32;
    // a thick felt pad under the frame
    const padHalf = (u) => 0.75 + 0.05 * Math.sin(Math.PI * u);
    const pad = sheet(seatZ - 1.1, seatZ + 1.0, padHalf, 18, 26, () => 0.01);
    slab(pad, () => 0.04, 'wool');
    // two timber rails along the back and three cross bars, on the pad
    const railY = (x, z) => surf(Math.atan2(x, 1.0) * 0, z).y;
    for (const sd of [1, -1]) {
      const rail = [];
      for (let k = 0; k <= 10; k++) { const z = seatZ - 1.0 + 2.0 * k / 10; const a = angleAt(sd * 0.42, z); rail.push(surf(a, z, 0.04 + 0.06)); }
      geos.push([sweep(rail, roundRect(0.09, 0.12, 0.25, 2), () => new THREE.Vector3(0, 1, 0)), 'wood']);
    }
    void railY;
    const bars = [];
    for (const dz of [-0.92, -0.05, 0.9]) {
      const z = seatZ + dz, bar = [];
      for (let k = 0; k <= 10; k++) { const s = -0.5 + k / 10; const a = angleAt(s, z); bar.push(surf(a, z, 0.04 + 0.13)); }
      geos.push([sweep(bar, roundRect(0.08, 0.08, 0.25, 2), () => new THREE.Vector3(0, 1, 0)), 'wood']);
      bars.push(bar);
    }
    // padded leather seat on the frame and a backrest
    const sTop = surf(0, seatZ, 0).y + 0.04 + 0.13 + 0.04;   // the seat rests on the cross bars
    const cushion = (cz, w, d, h, back = false) => {
      const nX = 14, nZ = 12, P = [];
      for (let i = 0; i < nZ; i++) for (let j = 0; j < nX; j++) {
        const u = i / (nZ - 1), v = j / (nX - 1);
        const x = (v - 0.5) * w, z = cz + (u - 0.5) * d;
        const puff = Math.pow(Math.sin(Math.PI * u) * Math.sin(Math.PI * v), 0.35);
        P.push(new THREE.Vector3(x, sTop + h * puff - (back ? 0 : 0.02 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)), z));
      }
      const top = [], bot = [];
      for (const p of P) { top.push(p.x, p.y, p.z); bot.push(p.x, sTop - 0.01, p.z); }
      geos.push([gridGeo(top, nZ, nX, true), 'seat']);
      return top;
    };
    cushion(seatZ - 0.05, 0.7, 0.75, 0.12);
    // backrest: an upright board with a pad, at the back of the seat
    {
      const bz = seatZ - 0.5, P = [];
      const nX = 12, nY = 8;
      for (let i = 0; i < nY; i++) for (let j = 0; j < nX; j++) {
        const u = i / (nY - 1), v = j / (nX - 1);
        P.push((v - 0.5) * 0.62, sTop + 0.05 + u * 0.42, bz - 0.08 * u + 0.03 * Math.pow(Math.sin(Math.PI * u) * Math.sin(Math.PI * v), 0.4));
      }
      geos.push([gridGeo(P, nY, nX, false), 'seat']);
      const back = [];
      for (let i = 0; i < nY; i++) for (let j = 0; j < nX; j++) { const k = (i * nX + j) * 3; back.push(P[k], P[k + 1], P[k + 2] - 0.05); }
      geos.push([gridGeo(back, nY, nX, true), 'wood']);
      for (const sd of [1, -1]) geos.push([sweep([new THREE.Vector3(sd * 0.31, sTop - 0.05, bz + 0.02), new THREE.Vector3(sd * 0.31, sTop + 0.25, bz - 0.04), new THREE.Vector3(sd * 0.31, sTop + 0.5, bz - 0.09)], roundRect(0.06, 0.06, 0.25, 2), () => new THREE.Vector3(0, 0, 1)), 'wood']);
    }
    // grab bar: a leather-wrapped wooden bar on two uprights at the front of the seat
    {
      const gz = seatZ + 0.5;
      for (const sd of [1, -1]) geos.push([sweep([new THREE.Vector3(sd * 0.26, sTop - 0.08, gz), new THREE.Vector3(sd * 0.26, sTop + 0.15, gz + 0.04), new THREE.Vector3(sd * 0.25, sTop + 0.34, gz + 0.06)], roundRect(0.05, 0.05, 0.3, 2), () => new THREE.Vector3(0, 0, 1)), 'wood']);
      geos.push([sweep([new THREE.Vector3(-0.3, sTop + 0.34, gz + 0.06), new THREE.Vector3(0, sTop + 0.35, gz + 0.065), new THREE.Vector3(0.3, sTop + 0.34, gz + 0.06)], circle(0.022, 10), () => new THREE.Vector3(0, 1, 0)), 'seat']);
    }
    seatTop = sTop + 0.1;
    // broad girth bands round the chest with iron buckles, a lighter band behind
    for (const [dz, w] of [[-0.75, 0.28], [0.7, 0.28], [1.7, 0.2]]) {
      band(seatZ + dz, w, 0.014, -Math.PI * 0.999, Math.PI * 0.999, 0, 'strap', 96);
      buckle(Math.PI * 0.3, seatZ + dz, w * 0.75, 2.2);
      buckle(-Math.PI * 0.3, seatZ + dz, w * 0.75, 2.2);
    }
    // foot boards hanging on leathers either side
    for (const sd of [1, -1]) {
      const a = sd * Math.abs(angleAt(0.75, seatZ + 0.1));
      const top = surf(a, seatZ + 0.1, 0.03);
      const bot = top.clone().add(new THREE.Vector3(sd * 0.12, -0.55, 0.05));
      geos.push([sweep([top, top.clone().lerp(bot, 0.5), bot], roundRect(0.05, 0.008, 0.3, 2), () => new THREE.Vector3(sd, 0, 0)), 'strap']);
      const bp = [bot.clone().add(new THREE.Vector3(0, -0.02, -0.17)), bot.clone().add(new THREE.Vector3(0, -0.02, 0)), bot.clone().add(new THREE.Vector3(0, -0.02, 0.17))];
      geos.push([sweep(bp, roundRect(0.16, 0.035, 0.2, 2), () => new THREE.Vector3(0, 1, 0)), 'wood']);
    }
  }
  return { geos, seatTop, seatLen, seatW, block };
}
