/* ============================================================
   THE HEAD AS A FIELD.

   The sculpt it replaces (91-face.js) is a sphere of rings pushed in and
   out, with the features built separately and pressed onto it: a nose
   that was a cone stuck to the front, two lip lozenges, two ball bearings
   for eyes sitting proud of a face that had no sockets for them. Close up
   it read as a mannequin, because every one of those joins was a crease
   where two unrelated surfaces met, and because a face is almost entirely
   the transitions -- the way the brow turns under into the orbit, the
   nose rises out of the cheek, the lids wrap an eye that sits BEHIND
   them.

   So the head is built the way the body now is (94c-sdf-body.js): as
   masses blended with a smooth minimum, with the hollows CARVED by smooth
   subtraction -- the orbits, the nostrils, the line of the mouth, the
   bowl of the ear. The eyes are real balls in real sockets, with lids
   that are part of the face and an aperture cut through them. Meshed at
   two millimetres, projected onto the true surface, normals from the
   field.

   IT IS THE SAME PERSON. Every sculpt control the operators already carry
   (brow shelf, orbit depth, nose length / bridge / hump / width, cheek,
   malar hollow, jaw width and squareness, chin projection, width, cleft,
   a boxy vault) drives the masses here, so the seven stay seven.

   IT SITS WHERE THE OLD ONE SAT. Built in millimetres of a real head,
   then brought into the old sculpt's frame -- the same height, the same
   eye line, the same chin -- so the placement in Engine.character, the
   hair, brows and beard cut from its surface, and every helmet and mask
   authored around it all land where they always did.
   ============================================================ */

const SDF_HEAD_TO_UNITS = 1 / 0.378;     // metres of real head -> old sculpt units

function makeSdfHeadGeometry(opts = {}) {
  const T = opts.type || 'male';
  const F = Object.assign({
    boxy: 0.75, brow: T === 'female' ? 0.026 : 0.040, browShelf: 0, browWide: 0.150,
    orbit: 0.085, cheek: T === 'female' ? 0.024 : T === 'heavy' ? 0.030 : 0.019, cheekX: 0.150,
    malarHollow: 0, jaw: 0.135, jawSquare: 0, gonialX: 0.026, chin: T === 'female' ? 0.050 : 0.062,
    chinWide: 0.072, chinCleft: 0, noseLen: 1, noseBridge: 1, noseHump: 0, noseWide: 1, noseBend: 0,
    orbitX: 0.091, orbitY: 0.034, orbitWide: 0.072, orbitTall: 0.062, browTall: 0.058, glabella: 0.014,
    temple: 0.014, cheekY: -0.020, cheekZ: 0.012, jawDepth: 0.055, gonialLow: -0.212, chinY: -0.282,
    mental: 0.022, nasolabial: 0.017, philtrum: 0.015, vaultTaperX: 0.115, vaultTaperZ: 0.070,
    parietal: 0.085, backFull: 0.035, backWide: 0.030, forehead: 0.022, crownFlat: 0.028,
    occiputHigh: 0.022, lidFold: 0.014,
  }, opts.face || {});
  const seed = opts.seed || 5;
  const vary = ((seed * 7919) % 97) / 97 - 0.5;           // a per-head nudge
  const fem = T === 'female' ? 1 : 0, heavy = T === 'heavy' ? 1 : 0;
  const h = opts.resolution || 0.0021;

  // Scalars from the controls, around 1 at the default head.
  const wide = 1 + (F.boxy - 0.75) * 0.10 + heavy * 0.05 - fem * 0.04;
  const browR = 0.0085 + (F.brow - 0.040) * 0.16 + F.browShelf * 0.0025;
  const browZ = 0.083 + F.browShelf * 0.004 + (F.brow - 0.040) * 0.06;
  const orbitD = 0.015 * (F.orbit / 0.085);
  const cheekK = 1 + (F.cheek - 0.019) * 14;
  const gonX = (0.045 + (F.gonialX - 0.026) * 0.45 + heavy * 0.004 - fem * 0.004) * wide;
  const jawR = 0.0125 + F.jawSquare * 0.0035 + heavy * 0.002;
  const chinZ = 0.064 + (F.chin - 0.062) * 0.35;
  const chinW = 0.019 * (F.chinWide / 0.072);
  const nL = F.noseLen, nB = F.noseBridge, nW = F.noseWide;

  /* Every sculpt control, mapped onto the masses. The old sculpt's units
     are 0.378 m, so a control that moved a feature by 0.01 there moves it
     3.8 mm here; the gains below are that, adjusted by eye where a mass
     answers differently from a ring displacement. */
  const U2M = 0.378;
  const EYE = [0.0318 * (F.orbitX / 0.091), 0.011 + (F.orbitY - 0.034) * U2M * 0.9, 0.0745], EYE_R = 0.0120;
  const oW = F.orbitWide / 0.072, oT = F.orbitTall / 0.062;
  const vaultX = 1 - (F.vaultTaperX - 0.115) * 0.9 + (F.parietal - 0.085) * 0.5;
  const vaultY = 1 - (F.crownFlat - 0.028) * 1.2;
  const faceLen = (F.chinY + 0.282) * U2M * 1.2;          // negative = longer face
  const cheekY = (F.cheekY + 0.020) * U2M, cheekZ = (F.cheekZ - 0.012) * U2M;
  const jawTaper = 1 - (F.jaw - 0.135) * 0.55;            // a higher 'jaw' tapers the mandible in
  const P = [];
  const U = (prim) => { P.push(prim); return prim; };
  const S = (prim) => { prim.op = 's'; P.push(prim); return prim; };
  const mirror = (fn) => { fn(1); fn(-1); };

  /* ---- the vault ---- */
  U(_ell([0, 0.036, -0.012], [0.073 * wide * vaultX, 0.086 * vaultY, 0.097 * (1 + (F.backFull - 0.035) * 1.2)]));
  // A boxy vault is flatter on the top and the sides: a rounded box blended in.
  if (F.boxy > 0.8) U(_box([0, 0.040, -0.014], [1, 0, 0], [0, 1, 0], [0.062 * wide, 0.070, 0.082], 0.040, 0.02));
  U(_ell([0, 0.060 + (F.forehead - 0.022) * 0.3, 0.040 + (F.forehead - 0.022) * 0.35], [0.060 * wide * vaultX, 0.052, 0.046]));   // forehead
  U(_ell([0, -0.030 + (F.occiputHigh - 0.022) * 0.5, -0.052 - (F.backFull - 0.035) * 0.3], [0.058 * wide * (1 + (F.backWide - 0.030) * 1.5), 0.050, 0.050]));   // occiput / nape
  mirror((s) => U(_ell([s * 0.050 * wide, 0.024, 0.002], [0.030, 0.052, 0.058], 0.03))); // temples / sides

  /* ---- brow ---- */
  const bW = 0.040 * wide * (F.browWide / 0.150), bT = F.browTall / 0.058;
  U(_cone([-bW, EYE[1] + 0.017 * bT, browZ - 0.010], [0, EYE[1] + 0.020 * bT, browZ + 0.003], browR, browR * 1.05, 0.010));
  U(_cone([bW, EYE[1] + 0.017 * bT, browZ - 0.010], [0, EYE[1] + 0.020 * bT, browZ + 0.003], browR, browR * 1.05, 0.010));
  U(_ell([0, EYE[1] + 0.012, 0.081 + F.glabella * 0.15], [0.012, 0.012, 0.010]));   // glabella

  /* ---- midface, cheekbones, the orbits carved into them ---- */
  U(_ell([0, -0.028, 0.058], [0.040 * wide, 0.042, 0.036]));                      // maxilla
  mirror((s) => {
    U(_ell([s * 0.047 * wide * (F.cheekX / 0.150), -0.007 + cheekY, 0.050 + cheekZ], [0.021 * cheekK, 0.018, 0.021 * cheekK], 0.022));   // zygomatic arch
    U(_ell([s * 0.036 * wide, -0.030, 0.052], [0.022, 0.024, 0.022], 0.022));                    // cheek fat
    if (F.malarHollow > 0) S(_ell([s * 0.047 * wide, -0.040, 0.056], [0.016, 0.015, 0.012 * F.malarHollow], 0.012));
    // The orbit: a socket carved under the brow, deeper at the top.
    S(_ell([s * EYE[0], EYE[1] + 0.0025, EYE[2] + 0.011], [0.0195 * oW, 0.0150 * oT, orbitD + 0.004], 0.012));
    if (F.temple > 0.02) S(_ell([s * 0.062 * wide, EYE[1] + 0.010, 0.034], [0.012, 0.022, 0.018 * (F.temple / 0.03)], 0.014));   // hollow temples
    // The eyelids: a shell round the ball, with the aperture cut through it.
    /* 1.6 mm off the ball, and the cornea (below) stands only 5 per cent
       proud of it: at 1.2 mm and 10 per cent the cornea came straight
       through the lids, so every iris showed whole with white all round
       it -- a stare on every face. Now the upper lid takes the top of the
       iris and the lower one meets its bottom edge, as they do. */
    U({ t: 'e', c: [s * EYE[0], EYE[1] + 0.0006, EYE[2] - 0.0006], r: [EYE_R + 0.0016, EYE_R + 0.0015, EYE_R + 0.0015], k: 0.009 });
    S(_ell([s * (EYE[0] + 0.0008), EYE[1] - 0.0008, EYE[2] + 0.012], [0.0142, 0.0043 + fem * 0.0007, 0.012], 0.0018));
    // The fold of the upper lid and the crease under the eye.
    U(_cone([s * (EYE[0] - 0.011), EYE[1] + 0.0080, EYE[2] + 0.0066], [s * (EYE[0] + 0.011), EYE[1] + 0.0072, EYE[2] + 0.0046], 0.0015 * (F.lidFold / 0.014), 0.0012 * (F.lidFold / 0.014), 0.004));
    S(_cone([s * (EYE[0] - 0.008), EYE[1] - 0.0175, EYE[2] + 0.0090], [s * (EYE[0] + 0.013), EYE[1] - 0.0160, EYE[2] + 0.0055], 0.0012, 0.0010, 0.008));
  });

  /* ---- nose ---- */
  const tip = [0, -0.028 - (nL - 1) * 0.012, 0.104 + (nL - 1) * 0.006 + (nB - 1) * 0.004];
  const root = [0, EYE[1] + 0.006, 0.083 + (nB - 1) * 0.003];
  U(_cone(root, [tip[0] + F.noseBend * 0.004, tip[1] + 0.008, tip[2] - 0.004], 0.0062, 0.0074 * (0.85 + 0.15 * nW), 0.006));  // bridge
  if (F.noseHump > 0) U(_ell(_lerp3(root, tip, 0.45).map((v, i) => v + [0, 0, 0.0035 * F.noseHump][i]), [0.0058, 0.009, 0.0045], 0.004));
  U(_ell(tip, [0.0105 * (0.8 + 0.2 * nW), 0.0098, 0.0092], 0.005));                               // tip
  mirror((s) => {
    U(_ell([s * 0.0118 * nW, tip[1] - 0.004, tip[2] - 0.012], [0.0085 * nW, 0.0078, 0.0085], 0.006));   // alae
    S(_ell([s * 0.0060 * nW, tip[1] - 0.0100, tip[2] - 0.0090], [0.0030 * nW, 0.0020, 0.0048], 0.0025)); // nostril
  });

  if (F.nasolabial > 0.012) mirror((s) => S(_cone([s * 0.0185 * nW, tip[1] - 0.002, tip[2] - 0.019], [s * 0.030, -0.070, 0.064],
    0.0034 * (F.nasolabial / 0.017), 0.0030, 0.016)));   // nasolabial fold, soft

  /* ---- mouth ---- */
  const mouthY = -0.068;
  U(_ell([0, -0.061, 0.058], [0.033, 0.028, 0.027]));                                             // muzzle
  U(_ell([0, mouthY + 0.0055, 0.0815], [0.0235 + fem * 0.002, 0.0062 + fem * 0.0012, 0.0085], 0.004));   // upper lip
  U(_ell([0, mouthY - 0.0072, 0.0790], [0.0215 + fem * 0.002, 0.0075 + fem * 0.0012, 0.0088], 0.004));   // lower lip
  S(_cone([-0.019, mouthY, 0.0885], [0.019, mouthY, 0.0885], 0.0016, 0.0016, 0.0035));             // where the lips meet
  mirror((s) => S(_ell([s * 0.0228, mouthY, 0.0775], [0.0030, 0.0030, 0.0045], 0.006)));              // corners, soft
  S(_cone([0, -0.050, 0.0925 + (0.015 - F.philtrum) * 0.05], [0, mouthY + 0.010, 0.0915 + (0.015 - F.philtrum) * 0.05], 0.0034, 0.0040, 0.008));                 // philtrum
  S(_ell([0, mouthY - 0.019, 0.080], [0.014, 0.004, 0.006], 0.006));                                 // mentolabial sulcus

  /* ---- jaw and chin ---- */
  const chin = [0, -0.104 + faceLen, chinZ + (F.mental - 0.022) * 0.25];
  mirror((s) => {
    const gon = [s * gonX * jawTaper, -0.074 + F.jawSquare * 0.003 + (F.gonialLow + 0.212) * U2M + faceLen * 0.5, -0.012 - (F.jawDepth - 0.055) * 0.25];
    U(_cone(gon, [s * 0.016, chin[1], chin[2] - 0.008], jawR * 0.9, 0.012, 0.022));                          // mandible body
    U(_cone([s * (gonX + 0.003), -0.018, -0.014], gon, 0.011, jawR * 0.9, 0.02));                        // ramus
  });
  U(_ell(chin, [chinW * wide, 0.015, 0.0125], 0.016));
  if (F.chinCleft > 0) S(_cone([0, -0.094, chinZ + 0.011], [0, -0.108, chinZ + 0.009], 0.0022, 0.0022, 0.003));

  /* ---- ears ---- */
  mirror((s) => {
    const e = [s * 0.075 * wide, -0.004, -0.012];
    U({ t: 'e', c: e, r: [0.0072, 0.029, 0.017], k: 0.004 });
    S({ t: 'e', c: [e[0] + s * 0.006, e[1] - 0.002, e[2] + 0.002], r: [0.0055, 0.018, 0.010], k: 0.003 });  // concha
    S({ t: 'e', c: [e[0] + s * 0.004, e[1] - 0.010, e[2] + 0.006], r: [0.004, 0.006, 0.005], k: 0.002 });   // canal
  });

  // The masseters: the jaw's corner is muscle, not a hollow.
  mirror((s) => U(_ell([s * 0.046 * wide, -0.052, 0.012], [0.016, 0.028, 0.026], 0.022)));
  /* Under the jaw: the floor of the mouth and the muscles running down to
     the neck, so the jaw's angle sits on something instead of over a pit. */
  U(_ell([0, -0.096, 0.012], [0.040 * wide, 0.020, 0.046], 0.022));
  mirror((s) => U(_cone([s * 0.052 * wide, -0.030, -0.030], [s * 0.020, -0.125, 0.020], 0.013, 0.012, 0.022)));  // sternomastoid

  /* ---- neck stub, to overlap the body's neck ----
     It used to stop at -0.132, cut flat by the mesher's box, exactly
     where the body's neck stopped too -- two open ends butted together
     and read as a ring under every jaw. Now it runs 3.5 cm further down
     INSIDE the body's neck, whose top tapers in under it (94c): the two
     surfaces cross, so the only thing on show is a soft crease. */
  U(_cone([0, -0.058, -0.024], [0, -0.160, -0.017], 0.058 * wide, 0.044 * wide, 0.02));

  const R = _region(P, 0.016);
  R.bmin = [-0.105 * wide, -0.167, -0.125]; R.bmax = [0.105 * wide, 0.130, 0.125];
  R.bandScale = 0.4;
  const g = new Geometry();
  // UVs 0..1 over the head, as the old sculpt had them, so a skin material's uvScale means the same thing.
  const t0 = g.indices.length;
  _meshRegion(g, R, h, PART.NECK, (x, y, z, out) => { out[0] = Math.atan2(x, z) / (2 * Math.PI) + 0.5; out[1] = (y + 0.167) / 0.297; });
  _fixUvSeams(g, t0, g.indices.length, 1);

  /* SKIN IS NOT ONE COLOUR. Blood near the surface reddens the cheeks,
     the nose, the ears and the lips; the skin under the eyes is thinner
     and darker; a man's shaved jaw carries a grey-blue shadow. All of it
     as vertex colour under the material's tint, then the cavity bake
     multiplied on top. */
  const Pp = g.positions, n = Pp.length / 3;
  const col = new Float32Array(n * 3);
  const bump = (x, y, z, c, r) => { const d = ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2; return Math.exp(-d * 1.6); };
  for (let v = 0; v < n; v++) {
    const x = Pp[v * 3], y = Pp[v * 3 + 1], z = Pp[v * 3 + 2];
    let r = 1, gg = 1, b = 1;
    const red = Math.max(bump(x, y, z, [0.040, -0.028, 0.060], [0.028, 0.024, 0.03]), bump(x, y, z, [-0.040, -0.028, 0.060], [0.028, 0.024, 0.03]),
      bump(x, y, z, tip, [0.014, 0.016, 0.02]) * 0.9, bump(Math.abs(x), y, z, [0.075, 0, -0.012], [0.014, 0.03, 0.02]) * 0.8);
    r *= 1 + red * 0.05; gg *= 1 - red * 0.07; b *= 1 - red * 0.06;
    const lip = Math.max(bump(x, y, z, [0, mouthY + 0.005, 0.082], [0.022, 0.007, 0.012]), bump(x, y, z, [0, mouthY - 0.007, 0.080], [0.020, 0.008, 0.012]));
    r *= 1 - lip * 0.06; gg *= 1 - lip * 0.24; b *= 1 - lip * 0.18;
    const line = Math.exp(-(((y - mouthY) / 0.0014) ** 2)) * (1 - _ss(0.018, 0.024, Math.abs(x))) * (z > 0.080 ? 1 : 0);
    r *= 1 - line * 0.55; gg *= 1 - line * 0.60; b *= 1 - line * 0.58;
    const under = Math.max(bump(x, y, z, [EYE[0], EYE[1] - 0.013, EYE[2] + 0.005], [0.016, 0.006, 0.012]), bump(x, y, z, [-EYE[0], EYE[1] - 0.013, EYE[2] + 0.005], [0.016, 0.006, 0.012]));
    r *= 1 - under * 0.12; gg *= 1 - under * 0.13; b *= 1 - under * 0.08;
    if (!fem && opts.shave !== false) {
      const jaw = Math.max(0, Math.min(1, (-0.040 - y) / 0.03)) * (z > -0.02 ? 1 : 0) * (1 - lip);
      const upper = bump(x, y, z, [0, -0.051, 0.084], [0.024, 0.006, 0.012]);
      const sh = Math.max(jaw, upper) * 0.10;
      r *= 1 - sh * 1.2; gg *= 1 - sh * 1.0; b *= 1 - sh * 0.6;
    }
    col[v * 3] = r; col[v * 3 + 1] = gg; col[v * 3 + 2] = b;
  }
  g.colors = Array.from(col);

  // Into the old sculpt's frame.
  for (let i = 0; i < Pp.length; i++) Pp[i] *= SDF_HEAD_TO_UNITS;
  g.finalize();
  if (!(g.colors instanceof Float32Array)) g.colors = new Float32Array(g.colors);
  bakeCavityAO(g, { radius: 0.040, strength: 0.75, floor: 0.42, samples: 1400 });

  /* HAIR THAT IS PAINTED, NOT BUILT. Brows, stubble and a shorn scalp
     were shells cut from the surface and pushed out a few millimetres:
     solid slabs with a stair-stepped edge, which is exactly how they read.
     Real ones are density -- skin showing through hair -- so on this head
     they are soft masks over the SAME regions the shells used (the style
     tables in 91-face.js, in the same normalised space), multiplied into
     the skin as the hair's colour relative to the skin's, with a per-vertex
     jitter for the grain. Full beards and longer hair keep their shells;
     under them the paint closes any gap at the edge. */
  paintHeadHair(g, opts);

  // The same measurements the old sculpt reported, so the caller places it the same way.
  {
    let lo = 1e9, hi = -1e9, chinY = 1e9;
    const Q = g.positions;
    for (let i = 0; i < Q.length; i += 3) {
      if (Q[i + 1] < lo) lo = Q[i + 1];
      if (Q[i + 1] > hi) hi = Q[i + 1];
      if (Q[i + 2] > 0.10 && Math.abs(Q[i]) < 0.06 && Q[i + 1] < chinY) chinY = Q[i + 1];
    }
    // Measured from where the stub USED to end, so lengthening it does not shrink the head.
    lo = Math.max(lo, -0.132 * SDF_HEAD_TO_UNITS);
    g.headBounds = { loY: lo, hiY: hi, height: hi - lo, chinY: chinY < 1e8 ? chinY : lo };
  }

  /* ---- the eyes: sclera, iris, pupil and a cornea that bulges ---- */
  const eg = new Geometry();
  eg.colors = [];
  const iris = opts.eyeColor != null ? opts.eyeColor : 0x5a4632;
  const ir = ((iris >> 16) & 255) / 255, ig = ((iris >> 8) & 255) / 255, ib = (iris & 255) / 255;
  const RINGS = 22, SECT = 28;
  mirror((s) => {
    const c = [s * EYE[0], EYE[1], EYE[2]];
    const base = eg.positions.length / 3;
    for (let a = 0; a <= RINGS; a++) {
      const th = (a / RINGS) * Math.PI;           // from the front pole (0) to the back
      for (let b = 0; b <= SECT; b++) {
        const ph = (b / SECT) * Math.PI * 2;
        let nx = Math.sin(th) * Math.cos(ph), ny = Math.sin(th) * Math.sin(ph), nz = Math.cos(th);
        // The cornea: the front cap stands proud of the ball.
        const bulge = th < 0.62 ? 1 + 0.05 * Math.cos(th / 0.62 * Math.PI * 0.5) : 1;
        const px = c[0] + nx * EYE_R * bulge, py = c[1] + ny * EYE_R * bulge, pz = c[2] + nz * EYE_R * bulge;
        let cr, cg, cb;
        if (th < 0.17) { cr = 0.03; cg = 0.025; cb = 0.025; }                     // pupil
        else if (th < 0.50) {                                                     // iris, darker at its rim
          const f = (th - 0.17) / 0.33, rim = f > 0.82 ? 0.55 : 1, fib = 0.85 + 0.15 * Math.sin(ph * 23 + a);
          cr = ir * rim * fib; cg = ig * rim * fib; cb = ib * rim * fib;
        } else {                                                                  // sclera, a little warm and veined at the corners
          const edge = Math.min(1, Math.max(0, (th - 0.9) / 0.6));
          cr = 0.93 - edge * 0.05; cg = 0.90 - edge * 0.10; cb = 0.87 - edge * 0.10;
        }
        eg.setColor(cr, cg, cb);
        eg.vert(px * SDF_HEAD_TO_UNITS, py * SDF_HEAD_TO_UNITS, pz * SDF_HEAD_TO_UNITS, nx, ny, nz, b / SECT, a / RINGS);
      }
    }
    for (let a = 0; a < RINGS; a++) for (let b = 0; b < SECT; b++) {
      const i0 = base + a * (SECT + 1) + b, i1 = i0 + SECT + 1;
      eg.tri(i0, i1, i0 + 1); eg.tri(i0 + 1, i1, i1 + 1);
    }
  });
  eg.setColor(null);
  eg.finalize();
  g.eyes = eg;
  g.sdf = true;
  return g;
}

function _hex3(c) { return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
const _ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function paintHeadHair(g, opts) {
  const P = g.positions, C = g.colors, n = P.length / 3;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  // The style bands were laid out against a stub that ended at -0.132; the longer one must not move them.
  lo[1] = Math.max(lo[1], -0.132 * SDF_HEAD_TO_UNITS);
  const sx = hi[0] - lo[0], sy = hi[1] - lo[1], sz = hi[2] - lo[2];
  const skin = _hex3(opts.skinColor != null ? opts.skinColor : 0xc8a080);
  const ratio = (col) => { const c = _hex3(col); return c.map((v, i) => Math.max(0.04, Math.min(1.15, v / Math.max(0.05, skin[i])))); };
  const layers = [];
  const B = opts.brows && BROW_STYLES[opts.brows];
  if (B) layers.push({ col: ratio(opts.browColor != null ? opts.browColor : 0x2a2320), dens: 0.92, mask: (u, w, xn) => {
    const t = (xn - B.x[0]) / Math.max(1e-6, B.x[1] - B.x[0]);
    const rise = B.arch * Math.sin(Math.min(1, Math.max(0, t) / 0.68) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.68) / 0.32 * 0.5);
    const l = B.u[0] + rise + B.tilt * (1 - t), h2 = B.u[1] + rise + B.tilt * (1 - t);
    // Thicker at the inner end, feathered at the outer tail.
    return _ss(0.66, 0.74, w) * _ss(B.x[0] - 0.02, B.x[0] + 0.03, xn) * (1 - _ss(B.x[1] - 0.06, B.x[1] + 0.02, xn))
      * _ss(l - 0.004, l + 0.008, u) * (1 - _ss(h2 - 0.008, h2 + 0.004, u));
  } });
  const Bd = opts.beard && BEARD_STYLES[opts.beard];
  if (Bd) layers.push({ col: ratio(opts.beardColor != null ? opts.beardColor : 0x2a2320), dens: opts.beard === 'stubble' ? 0.42 : 0.90, mask: (u, w, xn) => {
    let m = _ss(Bd.u[0] - 0.01, Bd.u[0] + 0.02, u) * (1 - _ss(Bd.u[1] - 0.025, Bd.u[1] + 0.005, u))
      * _ss(Bd.w[0] - 0.04, Bd.w[0] + 0.04, w) * (1 - _ss(Bd.x - 0.08, Bd.x + 0.02, xn)) * _ss((Bd.xMin || 0) - 0.02, (Bd.xMin || 0) + 0.04, xn);
    if (!Bd.overLip) { const L = Bd.lips || [0.198, 0.272]; m *= 1 - _ss(0.84, 0.88, w) * _ss(L[0] - 0.005, L[0] + 0.01, u) * (1 - _ss(L[1] - 0.01, L[1] + 0.005, u)) * (1 - _ss(0.36, 0.42, xn)); }
    return m;
  } });
  const H = opts.hairStyle && HAIR_STYLES[opts.hairStyle];
  if (H) layers.push({ col: ratio(opts.hairColor != null ? opts.hairColor : 0x2a2320), dens: opts.hairStyle === 'crop' ? 0.86 : 0.95, mask: (u, w) => {
    const edge = H.back + (H.cut - H.back) * w;
    return _ss(edge - 0.012, edge + 0.010, u);
  } });
  if (!layers.length) return;
  for (let v = 0; v < n; v++) {
    const u = (P[v * 3 + 1] - lo[1]) / sy, w = (P[v * 3 + 2] - lo[2]) / sz;
    const xn = Math.abs((P[v * 3] - lo[0]) / sx - 0.5) * 2;
    const grain = 0.78 + 0.22 * (((Math.sin(v * 12.9898 + P[v * 3] * 78.233) * 43758.5453) % 1 + 1) % 1);
    for (const L of layers) {
      const m = L.mask(u, w, xn) * L.dens * grain;
      if (m <= 0.002) continue;
      for (let k = 0; k < 3; k++) C[v * 3 + k] *= 1 + (L.col[k] - 1) * m;
    }
  }
}
