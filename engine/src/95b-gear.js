/* ============================================================
   OPERATOR GEAR
   ============================================================

   "Each character has their own clothing and every piece of clothing is
   highly detailed. Every last thing is detailed on these characters."

   The game already has a garment system, and it is the wrong one for
   this: it dresses corpses, in shirts, sized off the zombie body's
   cross-sections. These seven are not wearing shirts. They are wearing
   load-bearing equipment, which is a different problem -- it is rigid,
   it sits ON the body rather than draping from it, and almost all of
   its detail is in the small hard objects bolted to it.

   So this builds gear, in pieces, against the LIVING torso's own
   profile, and each operator wears a list of them. Everything here is
   skinned to the same skeleton as the body and hung off the same
   controller, so a plate carrier rides a sprint and a holster swings
   with the thigh it is strapped to.

   The torso rings it fits over, from buildTorso in 94-human.js:

       y      half-width   half-depth
     0.528      0.079        0.067      trapezius
     0.487      0.189        0.103
     0.460      0.204        0.113      deltoid shelf -- the widest
     0.425      0.195        0.121      chest
     0.380      0.187        0.123
     0.320      0.176        0.118      lower ribs
     0.250      0.161        0.109
     0.175      0.150        0.100      waist -- the narrowest
     0.090      0.161        0.107

   Every number below is derived from those, times the wearer's build.
   ============================================================ */

const GEAR_MAT = {
  webbing:  { color: 0x4b4a41, texture: 'fabric', roughness: 0.92, metalness: 0, uvScale: 9 },
  coyote:   { color: 0x8a7350, texture: 'fabric', roughness: 0.90, metalness: 0, uvScale: 9 },
  black:    { color: 0x23241f, texture: 'fabric', roughness: 0.88, metalness: 0, uvScale: 9 },
  navy:     { color: 0x2b3340, texture: 'fabric', roughness: 0.90, metalness: 0, uvScale: 9 },
  olive:    { color: 0x44402c, texture: 'fabric', roughness: 0.91, metalness: 0, uvScale: 9 },
  rubber:   { color: 0x2a2b2c, texture: 'smooth', roughness: 0.76, metalness: 0, uvScale: 6 },
  steel:    { color: 0x8d9298, texture: 'metal',  roughness: 0.40, metalness: 1, uvScale: 5 },
  brass:    { color: 0xb08a3c, texture: 'metal',  roughness: 0.34, metalness: 1, uvScale: 5 },
  glass:    { color: 0x9fb4ad, texture: 'smooth', roughness: 0.10, metalness: 0, opacity: 0.55 },
  hazmat:   { color: 0xc9c033, texture: 'fabric', roughness: 0.62, metalness: 0, uvScale: 7 },
  kevlar:   { color: 0x33362e, texture: 'fabric', roughness: 0.84, metalness: 0, uvScale: 11 },
};

const _gz = new Vec3(0, 0, 1), _gx = new Vec3(1, 0, 0), _gy = new Vec3(0, 1, 0);

/* A slab: a rounded box given as two corners. The workhorse -- a plate,
   a pouch, a radio and a magazine are all slabs at different sizes, and
   building them from one primitive is what keeps the whole kit
   consistent instead of looking like seven separate models. */
function gearSlab(g, x0, y0, z0, x1, y1, z1, e) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const w = Math.abs(x1 - x0) / 2, h = Math.abs(y1 - y0) / 2;
  loftRings(g, [
    { p: new Vec3(cx, cy, z0), w, d: h, e: e || 3.0, right: _gx, fwd: _gy },
    { p: new Vec3(cx, cy, z1), w, d: h, e: e || 3.0, right: _gx, fwd: _gy },
  ], 16, true, true);
}

/* A strap running between two points, with a width and a thickness.
   Shoulder straps, cummerbunds, slings and rifle slings are all this. */
function gearStrap(g, a, b, w, t, e) {
  const dir = new Vec3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir.x /= len; dir.y /= len; dir.z /= len;
  // A frame square to the run.
  const up = Math.abs(dir.y) > 0.9 ? _gz : _gy;
  const right = new Vec3(
    dir.y * up.z - dir.z * up.y,
    dir.z * up.x - dir.x * up.z,
    dir.x * up.y - dir.y * up.x,
  );
  const rl = Math.hypot(right.x, right.y, right.z) || 1;
  right.x /= rl; right.y /= rl; right.z /= rl;
  const fwd = new Vec3(
    right.y * dir.z - right.z * dir.y,
    right.z * dir.x - right.x * dir.z,
    right.x * dir.y - right.y * dir.x,
  );
  const rings = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    rings.push({
      p: new Vec3(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s),
      w: w, d: t, e: e || 3.2, right, fwd, uv: s,
    });
  }
  loftRings(g, rings, 10, true, true);
}

/* A band right round the trunk at a height, following the torso's own
   cross-section so a belt sits ON the waist rather than hovering in a
   circle around it. */
function gearBand(g, y0, y1, w, d, out, e) {
  loftRings(g, [
    { p: new Vec3(0, y0, 0), w: w + out, d: d + out, e: e || 2.5 },
    { p: new Vec3(0, (y0 + y1) / 2, 0), w: w + out * 1.06, d: d + out * 1.06, e: e || 2.5 },
    { p: new Vec3(0, y1, 0), w: w + out, d: d + out, e: e || 2.5 },
  ], 22, false, false);
}

/* A short cylinder: a canister, a light body, a magazine, an optic tube. */
function gearTube(g, p, axis, r, len, seg) {
  const a = new Vec3(p[0], p[1], p[2]);
  const b = new Vec3(p[0] + axis[0] * len, p[1] + axis[1] * len, p[2] + axis[2] * len);
  const up = Math.abs(axis[1]) > 0.9 ? _gz : _gy;
  const right = new Vec3(
    axis[1] * up.z - axis[2] * up.y,
    axis[2] * up.x - axis[0] * up.z,
    axis[0] * up.y - axis[1] * up.x,
  );
  const rl = Math.hypot(right.x, right.y, right.z) || 1;
  right.x /= rl; right.y /= rl; right.z /= rl;
  const fwd = new Vec3(
    right.y * axis[2] - right.z * axis[1],
    right.z * axis[0] - right.x * axis[2],
    right.x * axis[1] - right.y * axis[0],
  );
  loftRings(g, [
    { p: a, w: r, d: r, e: 2.0, right, fwd },
    { p: b, w: r, d: r, e: 2.0, right, fwd },
  ], seg || 14, true, true);
}

/* ---------------- the pieces ---------------- */

/* A plate carrier. Front plate, back plate, a cummerbund joining them
   round the ribs, and two shoulder straps over the trapezius. The
   plates are FLAT and the cummerbund is not, which is the whole read:
   body armour makes a torso into a box, and that box is why a man in
   one looks like a man in one. */
function gearPlateCarrier(g, k, o) {
  const s = o.scale || 1;
  const W = 0.158 * k * s, D = 0.128 * k * s;
  /* The plate stops at the STERNAL NOTCH, not at the collarbone.
     Running it to 0.452 put its top edge level with the deltoid shelf
     at 0.460, which is where the shoulder is -- so it read as a bib up
     to the chin and buried the neck it is supposed to sit below. A real
     front plate covers the sternum and the ribs and leaves the upper
     chest open, which is the whole reason a plate carrier has a visible
     yoke of strap across the collarbones. */
  gearSlab(g, -W, 0.196 * s, D * 0.96, W, 0.408 * s, D * 1.30, 3.6);
  // Back plate, a little longer and a little higher -- it always is.
  gearSlab(g, -W, 0.176 * s, -D * 1.30, W, 0.424 * s, -D * 0.96, 3.6);
  // Cummerbund, round the ribs, joining the two.
  gearBand(g, 0.214 * s, 0.318 * s, 0.170 * k * s, 0.116 * k * s, 0.020 * s, 2.7);
  // Shoulder straps, over the trapezius and down onto both plates.
  for (const sx of [1, -1]) {
    gearStrap(g,
      [sx * 0.078 * k * s, 0.396 * s, D * 1.12],
      [sx * 0.090 * k * s, 0.492 * s, 0],
      0.038 * s, 0.013 * s);
    gearStrap(g,
      [sx * 0.090 * k * s, 0.492 * s, 0],
      [sx * 0.078 * k * s, 0.410 * s, -D * 1.12],
      0.038 * s, 0.013 * s);
  }
}

/* Magazine pouches across the front of the carrier. Three is the number
   that reads: two looks sparse and four turns the chest into a wall. */
function gearMagPouches(g, k, o) {
  const s = o.scale || 1, D = 0.128 * k * s;
  const n = o.pouches || 3;
  const span = 0.104 * k * s;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (-span + (2 * span * i) / (n - 1));
    gearSlab(g, x - 0.032 * s, 0.228 * s, D * 1.28, x + 0.032 * s, 0.322 * s, D * 1.46, 3.4);
    // The flap over the top of it, which is where a pouch stops being a box.
    gearSlab(g, x - 0.034 * s, 0.312 * s, D * 1.26, x + 0.034 * s, 0.334 * s, D * 1.50, 3.2);
  }
}

/* An admin pouch and a radio, off to one side -- the asymmetry is the
   point. Kit is never symmetric on a real person, and a chest rig that
   is reads as a uniform rather than as somebody's. */
function gearAdmin(g, k, o) {
  const s = o.scale || 1, D = 0.128 * k * s, side = o.leftHanded ? -1 : 1;
  // Radio, high on the off side, with a stub antenna.
  gearSlab(g, side * 0.104 * k * s, 0.312 * s, -D * 1.34,
    side * 0.152 * k * s, 0.400 * s, -D * 1.06, 3.4);
  gearTube(g, [side * 0.140 * k * s, 0.398 * s, -D * 1.18], [0.06, 0.99, 0.02],
    0.006 * s, 0.098 * s, 8);
  // Utility pouch on the other hip.
  gearSlab(g, -side * 0.100 * k * s, 0.206 * s, D * 1.10,
    -side * 0.158 * k * s, 0.290 * s, D * 1.36, 3.4);
}

/* Belt, buckle and a thigh holster. The holster is dropped on a strap
   and canted, because that is how one hangs and a holster flat against
   a hip reads as a pocket. */
function gearBelt(g, k, o) {
  const s = o.scale || 1, side = o.leftHanded ? -1 : 1;
  gearBand(g, 0.130 * s, 0.176 * s, 0.150 * k * s, 0.100 * k * s, 0.012 * s, 2.6);
  gearSlab(g, -0.030 * s, 0.138 * s, 0.108 * k * s + 0.012 * s,
    0.030 * s, 0.170 * s, 0.108 * k * s + 0.024 * s, 3.4);
  if (o.holster) {
    const hx = side * 0.136 * k * s;
    gearStrap(g, [hx, 0.150 * s, 0.020 * s], [hx + side * 0.010 * s, -0.020 * s, 0.026 * s],
      0.020 * s, 0.009 * s);
    gearSlab(g, hx - 0.036 * s, -0.126 * s, 0.018 * s,
      hx + 0.036 * s, -0.008 * s, 0.084 * s, 3.5);
    // The grip standing out of it.
    gearSlab(g, hx - 0.018 * s, -0.020 * s, 0.030 * s,
      hx + 0.018 * s, 0.038 * s, 0.070 * s, 3.2);
  }
}

/* Kneepads, on the leg bones rather than on a guessed height -- they
   have to be ON the knee or they read as shin guards. */
function gearKnees(g, skeleton, k, o) {
  const s = o.scale || 1;
  for (const S of ['L', 'R']) {
    const ki = skeleton.index('lowerLeg' + S);
    if (ki < 0) continue;
    const p = new Vec3();
    skeleton.bones[ki].bindMatrix.getTranslation(p);
    loftRings(g, [
      { p: new Vec3(p.x, p.y + 0.052 * s, p.z + 0.026 * s), w: 0.058 * k * s, d: 0.030 * s, e: 3.0 },
      { p: new Vec3(p.x, p.y + 0.004 * s, p.z + 0.040 * s), w: 0.066 * k * s, d: 0.036 * s, e: 3.2 },
      { p: new Vec3(p.x, p.y - 0.048 * s, p.z + 0.030 * s), w: 0.058 * k * s, d: 0.028 * s, e: 3.0 },
    ], 14, true, true);
  }
}

/* A ballistic helmet: a shell that is NOT a hemisphere -- it comes down
   over the occiput and cuts away over the ears -- plus a rail either
   side and a shroud on the front for the night-vision mount. */
function gearHelmet(g, headY, s, o) {
  /* A SHELL, NOT A STACK OF RINGS. The old one lofted six level rings,
     so its lower edge was the same height all the way round -- five
     centimetres above the chin, which put the brim across the eyes. A
     real helmet's edge rises to the forehead at the front, clears the
     ears at the side and drops to the occiput at the back, and the shell
     has a thickness you can see at that edge. So: an outer ellipsoid
     minus an inner one, cut along that sloping line, meshed by the same
     field mesher as the bodies (94c-sdf-body.js). */
  /* FITTED TO THE SKULL IT SITS ON, when the caller hands one over
     (o.headPts: the head's vertices in the same bind space as the kit).
     The shell was sized for a nominal 0.252 m head, and two field-built
     skulls came out of it: SWAT's crown 26 mm above the top of the
     shell, Delta's and Alpha's parietals 8 per cent through its sides.
     So: lift the whole helmet until the crown clears the lining, then
     grow the shell until no point of the scalp above the brim is outside
     it. Everything below is placed from the lifted headY, so the rails,
     the shroud and the straps come with it. */
  let k = 1;
  const pts = o.headPts || null;
  if (pts) {
    let top = -1e9;
    for (let i = 1; i < pts.length; i += 3) top = Math.max(top, pts[i]);
    const inTop0 = headY + 0.030 * s - 0.004 * s + (0.101 - 0.0095) * s;
    headY += Math.max(0, top + 0.004 * s - inTop0);
    const cy0 = headY + 0.030 * s - 0.004 * s, cz0 = -0.006 * s;
    const ri = [(0.096 - 0.0095) * s, (0.101 - 0.0095) * s, (0.109 - 0.0095) * s];
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2];
      const cut = headY + s * (0.030 * Math.max(-1, Math.min(1, (z - cz0) / (0.10 * s))) - 0.004);
      if (y < cut) continue;
      k = Math.max(k, 1.012 * Math.hypot(x / ri[0], (y - cy0) / ri[1], (z - cz0) / ri[2]));
    }
    k = Math.min(k, 1.25);
  }
  const cy = headY + 0.030 * s, cz = -0.006 * s;
  const th = 0.0095 * s;
  const ro = [0.096 * s * k, 0.101 * s * k, 0.109 * s * k];
  const R = _region([
    { t: 'e', c: [0, cy, cz], r: ro },
    { t: 'e', c: [0, cy - 0.004 * s, cz], r: [ro[0] - th, ro[1] - th, ro[2] - th], op: 's', k: 0.002 },
  ], 0.004);
  // The edge: forehead in front, top of the ear at the side, occiput behind.
  R.cut = (x, y, z) => (headY + s * (0.030 * Math.max(-1, Math.min(1, (z - cz) / (0.10 * s))) - 0.004)) - y;
  R.bmin = [-0.11 * s * k, headY - 0.06 * s, -0.13 * s * k];
  R.bmax = [0.11 * s * k, cy + ro[1] + 0.012 * s, 0.13 * s * k];
  _meshRegion(g, R, 0.0048 * s, g.part, (x, y, z, out) => {
    out[0] = Math.atan2(x, z) / (2 * Math.PI) + 0.5; out[1] = (y - headY) / (0.25 * s);
  });
  /* The hardware sits on the shell, so it moves out with it when the
     shell was grown to fit (k > 1): each point scaled about the shell's
     own centre. Left where it was, the NVG mount and both tubes ended up
     inside a fitted helmet. */
  const H = (x, y, z) => [x * k, cy + (y - cy) * k, cz + (z - cz) * k];
  // Side rails, along the edge.
  for (const sx of [1, -1]) {
    gearStrap(g, H(sx * 0.090 * s, headY + 0.022 * s, 0.050 * s),
      H(sx * 0.088 * s, headY - 0.012 * s, -0.070 * s), 0.012 * s, 0.008 * s);
  }
  // NVG shroud, on the front of the shell.
  const s0 = H(-0.022 * s, headY + 0.050 * s, 0.078 * s), s1 = H(0.022 * s, headY + 0.086 * s, 0.098 * s);
  gearSlab(g, s0[0], s0[1], s0[2], s1[0], s1[1], s1[2], 3.4);
  if (o.nvg) {
    // Mount arm and two tubes, flipped up.
    gearTube(g, H(0, headY + 0.086 * s, 0.090 * s), [0, 0.92, 0.39], 0.010 * s, 0.058 * s, 10);
    for (const sx of [1, -1]) {
      gearTube(g, H(sx * 0.026 * s, headY + 0.138 * s, 0.108 * s), [0, 0.34, 0.94],
        0.017 * s, 0.066 * s, 12);
    }
  }
  // Chin strap, from the edge past the ear to under the jaw.
  if (pts) {
    /* LAID ON THE FACE. A straight bar from the brim to the jaw hung a
       centimetre off every cheek, which from the front read as a cage
       round the face. So the run is sampled, and each sample is pushed
       out from the middle of the skull to 3 mm off the scalp -- cast
       against the head's own points, the widest one in a narrow cone. */
    const C = [0, headY - 0.030 * s, -0.004 * s];
    const hug = (p) => {
      const d = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
      const dl = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= dl; d[1] /= dl; d[2] /= dl;
      let best = -1;
      for (let i = 0; i < pts.length; i += 3) {
        const qx = pts[i] - C[0], qy = pts[i + 1] - C[1], qz = pts[i + 2] - C[2];
        const ql = Math.hypot(qx, qy, qz) || 1;
        const dot = (qx * d[0] + qy * d[1] + qz * d[2]) / ql;
        if (dot > 0.9965 && ql > best) best = ql;          // within ~4.8 degrees
      }
      if (best < 0) return p;
      const r = best + 0.003 * s;
      return [C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r];
    };
    for (const sx of [1, -1]) {
      const run = [];
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // Brim in front of the ear, down the back of the cheek, round under the chin.
        const x = sx * s * (0.086 - 0.060 * t * t);
        const y = headY - s * (0.006 + 0.132 * t);
        const z = s * (0.004 + 0.040 * t * t);
        run.push(hug([x, y, z]));
      }
      /* One loft through the whole run, framed at each sample by the
         surface: thickness along the outward normal, width across it.
         Nine separate straight straps each picked their own frame, so
         the run was a chain of flat pieces twisting against each other. */
      const rings = run.map((p, i) => {
        const a = run[Math.max(0, i - 1)], b = run[Math.min(N, i + 1)];
        const dir = _norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
        let nrm = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
        const dd = nrm[0] * dir[0] + nrm[1] * dir[1] + nrm[2] * dir[2];
        nrm = _norm3([nrm[0] - dir[0] * dd, nrm[1] - dir[1] * dd, nrm[2] - dir[2] * dd]);
        const rt = _norm3(_cross3(dir, nrm));
        return { p: new Vec3(p[0] - nrm[0] * 0.001 * s, p[1] - nrm[1] * 0.001 * s, p[2] - nrm[2] * 0.001 * s),
          w: 0.010 * s, d: 0.004 * s, e: 3.2,
          right: new Vec3(rt[0], rt[1], rt[2]), fwd: new Vec3(nrm[0], nrm[1], nrm[2]), uv: i / N };
      });
      loftRings(g, rings, 10, true, true);
    }
  } else {
    for (const sx of [1, -1]) {
      gearStrap(g, [sx * 0.090 * s, headY - 0.004 * s, -0.004 * s],
        [sx * 0.052 * s, headY - 0.124 * s, -0.012 * s], 0.010 * s, 0.005 * s);
    }
  }
}

/* A respirator. The filter canister on one cheek is what makes it read
   as a gas mask rather than as a scarf -- and it is on ONE cheek,
   because that is where a real one goes. */
function gearRespirator(g, headY, s, o) {
  // The face piece, cupping the nose and mouth.
  loftRings(g, [
    { p: new Vec3(0, headY - 0.020 * s, 0.074 * s), w: 0.078 * s, d: 0.050 * s, e: 2.6 },
    { p: new Vec3(0, headY - 0.056 * s, 0.092 * s), w: 0.082 * s, d: 0.058 * s, e: 2.5 },
    { p: new Vec3(0, headY - 0.104 * s, 0.086 * s), w: 0.074 * s, d: 0.054 * s, e: 2.6 },
    { p: new Vec3(0, headY - 0.140 * s, 0.050 * s), w: 0.058 * s, d: 0.040 * s, e: 2.8 },
  ], 18, true, true);
  // Filter, on the left cheek, angled down and out.
  const fx = -0.062 * s;
  gearTube(g, [fx, headY - 0.062 * s, 0.078 * s], [-0.52, -0.26, 0.81], 0.030 * s, 0.062 * s, 14);
  // Exhale valve, dead centre and low.
  gearTube(g, [0, headY - 0.112 * s, 0.074 * s], [0, -0.28, 0.96], 0.019 * s, 0.024 * s, 12);
  // Head harness: four straps back over the skull.
  for (const sx of [1, -1]) {
    gearStrap(g, [sx * 0.072 * s, headY - 0.030 * s, 0.070 * s],
      [sx * 0.086 * s, headY + 0.030 * s, -0.108 * s], 0.013 * s, 0.005 * s);
    gearStrap(g, [sx * 0.074 * s, headY - 0.090 * s, 0.060 * s],
      [sx * 0.082 * s, headY - 0.070 * s, -0.104 * s], 0.013 * s, 0.005 * s);
  }
  void o;
}

/* A sealed hood over the whole head, with a flat visor. Decon kit, and
   the reason Biohazard reads from across a map. */
function gearHood(g, headY, s) {
  loftRings(g, [
    { p: new Vec3(0, headY + 0.152 * s, -0.006 * s), w: 0.052 * s, d: 0.056 * s, e: 2.3 },
    { p: new Vec3(0, headY + 0.106 * s, -0.008 * s), w: 0.120 * s, d: 0.126 * s, e: 2.4 },
    { p: new Vec3(0, headY + 0.020 * s, -0.008 * s), w: 0.134 * s, d: 0.140 * s, e: 2.4 },
    { p: new Vec3(0, headY - 0.080 * s, -0.004 * s), w: 0.130 * s, d: 0.136 * s, e: 2.4 },
    { p: new Vec3(0, headY - 0.166 * s, 0.004 * s), w: 0.118 * s, d: 0.120 * s, e: 2.5 },
    { p: new Vec3(0, headY - 0.236 * s, 0.006 * s), w: 0.116 * s, d: 0.118 * s, e: 2.6 },
  ], 22, true, false);
}

/* The visor, as its own piece so it can be glass. */
function gearVisor(g, headY, s) {
  loftRings(g, [
    { p: new Vec3(0, headY + 0.052 * s, 0.128 * s), w: 0.092 * s, d: 0.012 * s, e: 3.4 },
    { p: new Vec3(0, headY - 0.030 * s, 0.140 * s), w: 0.098 * s, d: 0.014 * s, e: 3.4 },
    { p: new Vec3(0, headY - 0.096 * s, 0.126 * s), w: 0.088 * s, d: 0.012 * s, e: 3.4 },
  ], 18, true, true);
}

/* A balaclava: the head, minus a hole for the eyes. Built off the head
   geometry's own surface like the hair is, so it hugs THIS skull. */
function gearBalaclava(headGeo, s) {
  void s;
  const keep = (u, w, xn) => {
    if (u > 0.760) return false;                 // the crown shows under a helmet
    if (u < 0.120) return false;                 // stops under the jaw
    // The eye port: brow to mid-nose, front of the face, both eyes.
    if (u > 0.520 && u < 0.640 && w > 0.80 && xn < 0.62) return false;
    return true;
  };
  return offsetPatch(headGeo, keep, 0.0052, null);
}

/* Goggles, on the brow rather than over the eyes -- pushed up is how
   they are worn nine tenths of the time. */
function gearGoggles(g, headY, s) {
  gearStrap(g, [-0.116 * s, headY + 0.086 * s, 0.028 * s],
    [0.116 * s, headY + 0.086 * s, 0.028 * s], 0.020 * s, 0.009 * s);
  for (const sx of [1, -1]) {
    gearSlab(g, sx * 0.014 * s, headY + 0.060 * s, 0.100 * s,
      sx * 0.086 * s, headY + 0.112 * s, 0.130 * s, 3.0);
  }
  // The band round the back.
  gearStrap(g, [-0.112 * s, headY + 0.086 * s, 0.020 * s],
    [-0.070 * s, headY + 0.104 * s, -0.118 * s], 0.018 * s, 0.006 * s);
  gearStrap(g, [0.112 * s, headY + 0.086 * s, 0.020 * s],
    [0.070 * s, headY + 0.104 * s, -0.118 * s], 0.018 * s, 0.006 * s);
}

/* ------------------------------------------------------------------
   ASSEMBLY
   ------------------------------------------------------------------
   One geometry per MATERIAL, not one per piece. A man in webbing,
   rubber, steel and glass is four draws however many pouches he has on
   -- and building it the other way round is how a character ends up
   costing thirty draw calls to put a radio on his back.

   Each returned geometry is skinned against the body's skeleton, so the
   kit rides the animation without a rig of its own. ------------------ */

const GEAR_PIECES = {
  carrier:    { mat: 'webbing', fn: (g, c) => gearPlateCarrier(g, c.k, c.o) },
  pouches:    { mat: 'webbing', fn: (g, c) => gearMagPouches(g, c.k, c.o) },
  admin:      { mat: 'black',   fn: (g, c) => gearAdmin(g, c.k, c.o) },
  belt:       { mat: 'black',   fn: (g, c) => gearBelt(g, c.k, c.o) },
  knees:      { mat: 'rubber',  fn: (g, c) => gearKnees(g, c.skeleton, c.k, c.o) },
  helmet:     { mat: 'kevlar',  fn: (g, c) => gearHelmet(g, c.headY, c.s, c.o) },
  respirator: { mat: 'rubber',  fn: (g, c) => gearRespirator(g, c.headY, c.s, c.o) },
  hood:       { mat: 'hazmat',  fn: (g, c) => gearHood(g, c.headY, c.s) },
  visor:      { mat: 'glass',   fn: (g, c) => gearVisor(g, c.headY, c.s) },
  goggles:    { mat: 'rubber',  fn: (g, c) => gearGoggles(g, c.headY, c.s) },
};

/* Build every piece on a list, grouped by material, skinned, and handed
   back as [{ material, geometry }]. */
function buildGear(skeleton, list, opts) {
  const k = opts.build != null ? opts.build : 1;
  const s = opts.stature != null ? opts.stature : 1;
  /* The head's own height on THIS skeleton -- the helmet and the mask
     have to sit on the man's actual skull, and the seven of them differ
     by nineteen centimetres of stature. Read, never assumed.

     AND THE BONE IS AT THE CHIN. Every head piece below is authored
     around the CENTRE of the skull -- the helmet shell runs from 7cm
     below it to 13cm above, the visor from the brow to the jaw, the
     hood past the crown -- and all of them were being handed the head
     BONE, which is where the character builder puts the chin. So the
     whole lot sat half a head too low: the shell's crown landed at
     eyebrow height and the skull came straight out of the top of it.
     "Their heads are poking out of their helmets" is this line.

     The head is 0.252m tall on a scale-1 rig (see makeHeadGeometry in
     95-engine) and its chin is on the bone, so its middle is half that
     above it. */
  const hi = skeleton.index('head');
  /* THE SAME ELEVEN MILLIMETRES THE HEAD ITSELF MOVED. The head actor
     is seated a centimetre below the head bone so the jaw overlaps the
     neck rather than balancing on it (see Engine.character). The kit
     rides the HEAD, not the bone, so it has to move with it -- and
     this is exactly the class of mistake that put every helmet in the
     game half a head too low the first time. One constant, both
     places, and a note at each end. */
  const HEAD_SEAT = 0.011 * s;
  const chinY = (hi >= 0 ? skeleton.bones[hi].bindMatrix.e[13] : 0.61 * s) - HEAD_SEAT;
  const HEAD_H = 0.252 * s;
  const headY = chinY + HEAD_H * 0.5;
  const ctx = { k, s, headY, chinY, headH: HEAD_H, skeleton, o: opts };

  const byMat = new Map();
  for (const name of list) {
    const piece = GEAR_PIECES[name];
    if (!piece) continue;
    let g = byMat.get(piece.mat);
    if (!g) { g = new Geometry(); g.part = PART.BODY; byMat.set(piece.mat, g); }
    /* Tagged BODY so the skin solver binds the kit to the trunk bones
       and not to whichever limb happens to be nearest in the bind pose
       -- the same trap that had every thigh in the game welded to a
       hand. A kneepad says so itself. */
    g.part = name === 'knees' ? PART.BODY : PART.BODY;
    piece.fn(g, ctx);
  }

  const out = [];
  for (const [mat, g] of byMat) {
    if (!g.indices.length) continue;
    g.finalize();
    if (Math.abs(s - 1) > 1e-6 && mat !== 'kevlar' && mat !== 'rubber' && mat !== 'hazmat'
      && mat !== 'glass') {
      // Trunk kit is authored at stature 1; head kit already took `s`.
      for (let i = 0; i < g.positions.length; i++) g.positions[i] *= s;
    }
    out.push({ material: GEAR_MAT[mat], geometry: solveSkinWeights(g, skeleton), name: mat });
  }
  return out;
}

Engine.prototype.gearMaterials = function () { return GEAR_MAT; };
Engine.prototype.gearPieceNames = function () { return Object.keys(GEAR_PIECES); };
