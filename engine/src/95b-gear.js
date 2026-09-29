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
  /* The goggles: the same rubber, casting no shadow. Their lenses stand
     three centimetres off the forehead, and the shadow lookup's normal
     offset carried points on the cheeks, the lip and the jaw into their
     shadow -- black blotches across the face at every sun angle. A few
     square centimetres of kit on the brow is not worth that. */
  goggle:   { color: 0x2a2b2c, texture: 'smooth', roughness: 0.76, metalness: 0, uvScale: 6, castShadow: false },
  steel:    { color: 0x8d9298, texture: 'metal',  roughness: 0.40, metalness: 1, uvScale: 5 },
  brass:    { color: 0xb08a3c, texture: 'metal',  roughness: 0.34, metalness: 1, uvScale: 5 },
  glass:    { color: 0x9fb4ad, texture: 'smooth', roughness: 0.10, metalness: 0, opacity: 0.55 },
  hazmat:   { color: 0xc9c033, texture: 'fabric', roughness: 0.62, metalness: 0, uvScale: 7 },
  kevlar:   { color: 0x33362e, texture: 'fabric', roughness: 0.84, metalness: 0, uvScale: 11 },
};

const _gz = new Vec3(0, 0, 1), _gx = new Vec3(1, 0, 0), _gy = new Vec3(0, 1, 0);

/* THE BODY IT IS ON, MEASURED. The numbers in the table above are the old field-built torso's, and
   on the MakeHuman figure (94g) -- fuller in the chest, the spine further back, a real waist -- a
   carrier built to them sank into the shirt until only its pouches showed. So when the body is
   there to measure, every trunk piece is fitted to it: this reads the dressed body's bind pose into
   a profile, in stature-1 units like everything else here (buildGear scales the kit afterwards).

     at(y0, y1)      the trunk between two heights: widest half-width, frontmost and backmost
     shoulderTop(x)  the top of the shoulder at that distance from the midline
     thighOuter(y)   the outside of the thigh at a height
     kneeFront(S)    the front of the knee, per side */
function gearProfile(geo, stature) {
  if (!geo || !geo.positions || !geo.parts) return null;
  const P = geo.positions, parts = geo.parts, n = P.length / 3, st = stature || 1;
  const trunk = [], legs = [];
  for (let i = 0; i < n; i++) {
    const x = P[i * 3] / st, y = P[i * 3 + 1] / st, z = P[i * 3 + 2] / st;
    if (parts[i] === PART.BODY) trunk.push(x, y, z);
    else if (parts[i] === PART.LEG_L || parts[i] === PART.LEG_R) legs.push(x, y, z);
  }
  const at = (y0, y1) => {
    let w = 0, zf = -1, zb = 1;
    for (let i = 0; i < trunk.length; i += 3) {
      const y = trunk[i + 1];
      if (y < y0 || y > y1) continue;
      w = Math.max(w, Math.abs(trunk[i])); zf = Math.max(zf, trunk[i + 2]); zb = Math.min(zb, trunk[i + 2]);
    }
    return { w, zf, zb, d: (zf - zb) / 2, cz: (zf + zb) / 2 };
  };
  const shoulderTop = (x) => {
    let y = 0;
    for (let i = 0; i < trunk.length; i += 3) if (Math.abs(Math.abs(trunk[i]) - x) < 0.012 && Math.abs(trunk[i + 2]) < 0.04) y = Math.max(y, trunk[i + 1]);
    return y;
  };
  const thighOuter = (y) => {
    let x = 0;
    for (let i = 0; i < legs.length; i += 3) if (Math.abs(legs[i + 1] - y) < 0.012) x = Math.max(x, Math.abs(legs[i]));
    return x;
  };
  const kneeFront = (S, ky) => {
    let z = -1;
    for (let i = 0; i < legs.length; i += 3) if ((S === 'L' ? legs[i] > 0 : legs[i] < 0) && Math.abs(legs[i + 1] - ky) < 0.02) z = Math.max(z, legs[i + 2]);
    return z;
  };
  return { at, shoulderTop, thighOuter, kneeFront };
}

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
function gearBand(g, y0, y1, w, d, out, e, cz = 0) {
  loftRings(g, [
    { p: new Vec3(0, y0, cz), w: w + out, d: d + out, e: e || 2.5 },
    { p: new Vec3(0, (y0 + y1) / 2, cz), w: w + out * 1.06, d: d + out * 1.06, e: e || 2.5 },
    { p: new Vec3(0, y1, cz), w: w + out, d: d + out, e: e || 2.5 },
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
  const T = o.torso;
  if (T) {
    /* Fitted: the plates stand just clear of the chest and the back over their own height, the
       cummerbund round the ribs as they are, the straps over the shoulders where they are. A plate
       is a standard size (25 x 32 cm, about), whatever the chest behind it. */
    const Fr = T.at(0.19 * s, 0.41 * s), Bk = T.at(0.17 * s, 0.43 * s), Rb = T.at(0.21 * s, 0.32 * s);
    const W = Math.min(0.128 * s, Fr.w * 0.80);
    const zf = Fr.zf + 0.006 * s, zb = Bk.zb - 0.006 * s;
    o._plate = { zf: zf + 0.024 * s, zb: zb - 0.024 * s, W };
    const top = Math.max(0.40 * s, T.shoulderTop(0.060 * s) - 0.075 * s);
    gearSlab(g, -W, 0.196 * s, zf, W, top, zf + 0.024 * s, 3.6);
    gearSlab(g, -W, 0.176 * s, zb - 0.024 * s, W, top + 0.016 * s, zb, 3.6);
    gearBand(g, 0.214 * s, 0.318 * s, Rb.w, Rb.d, 0.014 * s, 2.7, Rb.cz);
    for (const sx of [1, -1]) {
      const xs = 0.085 * s, ys = T.shoulderTop(xs) + 0.008 * s;
      gearStrap(g, [sx * W * 0.62, top - 0.012 * s, zf + 0.018 * s], [sx * xs, ys, (zf + zb) * 0.5], 0.038 * s, 0.013 * s);
      gearStrap(g, [sx * xs, ys, (zf + zb) * 0.5], [sx * W * 0.62, top + 0.004 * s, zb - 0.018 * s], 0.038 * s, 0.013 * s);
    }
    return;
  }
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
  const pl = o.torso && o._plate;
  const span = pl ? Math.min(0.104 * s, pl.W - 0.034 * s) : 0.104 * k * s;
  const z0 = pl ? pl.zf - 0.002 * s : D * 1.28, z1 = pl ? pl.zf + 0.022 * s : D * 1.46;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (-span + (2 * span * i) / (n - 1));
    gearSlab(g, x - 0.032 * s, 0.228 * s, z0, x + 0.032 * s, 0.322 * s, z1, 3.4);
    // The flap over the top of it, which is where a pouch stops being a box.
    gearSlab(g, x - 0.034 * s, 0.312 * s, z0 - 0.002 * s, x + 0.034 * s, 0.334 * s, z1 + 0.004 * s, 3.2);
  }
}

/* An admin pouch and a radio, off to one side -- the asymmetry is the
   point. Kit is never symmetric on a real person, and a chest rig that
   is reads as a uniform rather than as somebody's. */
function gearAdmin(g, k, o) {
  const s = o.scale || 1, D = 0.128 * k * s, side = o.leftHanded ? -1 : 1;
  const pl = o.torso && o._plate;
  if (pl) {
    // Radio on the back plate, high on the off side; utility pouch on the front, low.
    gearSlab(g, side * 0.060 * s, 0.312 * s, pl.zb - 0.030 * s, side * 0.108 * s, 0.400 * s, pl.zb + 0.002 * s, 3.4);
    gearTube(g, [side * 0.096 * s, 0.398 * s, pl.zb - 0.016 * s], [0.06, 0.99, 0.02], 0.006 * s, 0.098 * s, 8);
    gearSlab(g, -side * (pl.W - 0.060 * s), 0.206 * s, pl.zf - 0.004 * s, -side * (pl.W + 0.002 * s), 0.290 * s, pl.zf + 0.024 * s, 3.4);
    return;
  }
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
  if (o.torso) {
    /* The battle belt, over the trouser belt at the waist (94h puts that at 0.06-0.10), padded
       and standing off it; the holster dropped from it onto the outside of the thigh. */
    const Wb = o.torso.at(0.050 * s, 0.108 * s);
    gearBand(g, 0.054 * s, 0.104 * s, Wb.w, Wb.d, 0.010 * s, 2.6, Wb.cz);
    gearSlab(g, -0.030 * s, 0.062 * s, Wb.zf + 0.006 * s, 0.030 * s, 0.096 * s, Wb.zf + 0.018 * s, 3.4);
    if (o.holster) {
      const hx = side * (o.torso.thighOuter(-0.07 * s) + 0.008 * s);
      gearStrap(g, [hx, 0.075 * s, Wb.cz + 0.02 * s], [hx + side * 0.010 * s, -0.020 * s, 0.026 * s], 0.020 * s, 0.009 * s);
      gearSlab(g, hx - side * 0.004 * s - 0.022 * s, -0.126 * s, 0.000 * s, hx + side * 0.004 * s + 0.022 * s, -0.008 * s, 0.070 * s, 3.5);
      gearSlab(g, hx - 0.016 * s, -0.020 * s, 0.014 * s, hx + 0.016 * s, 0.038 * s, 0.056 * s, 3.2);
    }
    return;
  }
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
    if (o.torso) {
      // On the front of THIS knee: the pad's middle ring 12 mm clear of the trouser.
      const zf = o.torso.kneeFront(S, p.y / (o.stature || 1)) * (o.stature || 1);
      if (zf > -0.5) p.z = zf - 0.040 * s + 0.012 * s;
    }
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
function gearGoggles(g, headY, s, pts) {
  /* FITTED TO THE SKULL, when the caller hands one over (o.headPts). The
     band was a straight bar 0.232 wide, authored for a nominal head: on a
     field-built skull its ends stood 4 cm clear of the temples like horns,
     and the sun dropped their shadows onto the cheeks and the jaw as
     black blotches. Now the band ends at the scalp, and the lenses sit on
     the forehead that is actually there. */
  const band = headY + 0.086 * s;
  let hw = 0.116 * s, zf = 0.100 * s;
  if (pts) {
    let mx = 0, fz = -1e9;
    for (let i = 0; i < pts.length; i += 3) {
      if (Math.abs(pts[i + 1] - band) > 0.012 * s) continue;
      mx = Math.max(mx, Math.abs(pts[i]));
      if (Math.abs(pts[i]) < 0.040 * s) fz = Math.max(fz, pts[i + 2]);
    }
    if (mx > 0) hw = mx + 0.004 * s;
    if (fz > -1e9) zf = fz - 0.004 * s;
  }
  gearStrap(g, [-hw, band, 0.028 * s], [hw, band, 0.028 * s], 0.020 * s, 0.009 * s);
  for (const sx of [1, -1]) {
    gearSlab(g, sx * 0.014 * s, headY + 0.060 * s, zf,
      sx * Math.min(0.086 * s, hw - 0.006 * s), headY + 0.112 * s, zf + 0.030 * s, 3.0);
  }
  // The band round the back.
  for (const sx of [1, -1]) {
    gearStrap(g, [sx * (hw - 0.004 * s), band, 0.020 * s],
      [sx * 0.070 * s, headY + 0.104 * s, -0.118 * s], 0.018 * s, 0.006 * s);
  }
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
  goggles:    { mat: 'goggle',  fn: (g, c) => gearGoggles(g, c.headY, c.s, c.o.headPts || null) },
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
  const HEAD_SEAT = (opts && opts.headPts ? SDF_HEAD_SEAT : 0.011) * s;   // a field-built head sits lower (94d)
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
    if (Math.abs(s - 1) > 1e-6 && mat !== 'kevlar' && mat !== 'rubber' && mat !== 'goggle' && mat !== 'hazmat'
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
