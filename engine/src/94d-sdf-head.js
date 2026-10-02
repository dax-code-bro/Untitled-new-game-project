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
const SDF_HEAD_SEAT = 0.021;             // how far below the head bone the chin sits (95-engine, 95b-gear)

const FACE_DAMPED = new Set(['brow', 'browShelf', 'orbit', 'temple', 'malarHollow', 'nasolabial', 'chinCleft', 'lidFold', 'glabella', 'philtrum']);

function makeSdfHeadGeometry(opts = {}) {
  const T = opts.type || 'male';
  /* A woman's face is not the man's with a flag set: a narrower, more
     tapered jaw and a smaller chin, a lower brow ridge, a shorter and
     finer nose, fuller cheeks. Defaults only -- a faceShape still wins. */
  const FEM = T === 'female' ? { jaw: 0.160, gonialX: 0.017, chinWide: 0.058, chin: 0.046, noseLen: 0.90,
    noseWide: 0.86, noseBridge: 0.92, browShelf: 0, cheek: 0.026, boxy: 0.62, glabella: 0.008, jawDepth: 0.050 } : {};
  const BASE = Object.assign({
    boxy: 0.75, brow: T === 'female' ? 0.026 : 0.040, browShelf: 0, browWide: 0.150,
    orbit: 0.085, cheek: T === 'female' ? 0.024 : T === 'heavy' ? 0.030 : 0.019, cheekX: 0.150,
    malarHollow: 0, jaw: 0.135, jawSquare: 0, gonialX: 0.026, chin: T === 'female' ? 0.050 : 0.062,
    chinWide: 0.072, chinCleft: 0, noseLen: 1, noseBridge: 1, noseHump: 0, noseWide: 1, noseBend: 0,
    orbitX: 0.091, orbitY: 0.034, orbitWide: 0.072, orbitTall: 0.062, browTall: 0.058, glabella: 0.014,
    temple: 0.014, cheekY: -0.020, cheekZ: 0.012, jawDepth: 0.055, gonialLow: -0.212, chinY: -0.282,
    mental: 0.022, nasolabial: 0.017, philtrum: 0.015, vaultTaperX: 0.115, vaultTaperZ: 0.070,
    parietal: 0.085, backFull: 0.035, backWide: 0.030, forehead: 0.022, crownFlat: 0.028,
    occiputHigh: 0.022, lidFold: 0.009,
  }, FEM);
  /* EACH FACE'S OWN CONTROLS, AT A LITTLE OVER HALF STRENGTH. They were
     tuned on the ring sculpt, where a control moved a ring; here the same
     number moves a whole mass, and every operator came out a caricature
     of himself -- a swollen jaw, a shelf of brow, hollow cheeks, a chin a
     hand long. Pulled 45 per cent of the way back to the average face,
     they are still seven different men, and none of them is a cartoon. */
  const F = Object.assign({}, BASE);
  for (const k in (opts.face || {})) {
    const v = opts.face[k];
    /* Only the controls that made a face frightening are pulled toward the average: a shelf of brow,
       deep orbits, hollow temples and cheeks, hard folds, a cleft. The skull, the jaw, the nose and
       the cheekbones pass at full strength -- damped too, the seven operators came out too alike to
       tell apart (operators.test.js). */
    F[k] = (typeof v === 'number' && typeof BASE[k] === 'number' && FACE_DAMPED.has(k)) ? BASE[k] + (v - BASE[k]) * 0.55 : v;
  }
  const seed = opts.seed || 5;
  const vary = ((seed * 7919) % 97) / 97 - 0.5;           // a per-head nudge
  const fem = T === 'female' ? 1 : 0, heavy = T === 'heavy' ? 1 : 0;
  const h = opts.resolution || 0.0021;

  // Scalars from the controls, around 1 at the default head.
  // Squareness and build widen the head by at most ~7 per cent: at 11 the heavy faces measured 16 cm
  // across the cheekbones and 14 at the jaw, outside the range of real adults.
  const wide = 1 + (F.boxy - 0.75) * 0.06 + heavy * 0.03 - fem * 0.04;
  const browR = 0.0085 + (F.brow - 0.040) * 0.16 + F.browShelf * 0.0025;
  const browZ = 0.083 + F.browShelf * 0.004 + (F.brow - 0.040) * 0.06;
  const orbitD = 0.015 * (F.orbit / 0.085);
  const cheekK = 1 + (F.cheek - 0.019) * 14;
  const gonX = (0.040 + (F.gonialX - 0.026) * 0.45 + heavy * 0.004 - fem * 0.004) * wide;
  const jawR = 0.0125 + F.jawSquare * 0.0035 + heavy * 0.002;
  const chinZ = 0.067 + (F.chin - 0.062) * 0.35;   // 3 mm further forward: with the chin raised, the old projection read as receding
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
  // Set back and in: level with the cheekbones it made the face as wide as the skull (16 cm, against 14).
  mirror((s) => U(_ell([s * 0.044 * wide, 0.030, -0.010], [0.027, 0.048, 0.054], 0.03))); // temples / sides

  /* ---- brow ---- */
  const bW = 0.040 * wide * (F.browWide / 0.150), bT = F.browTall / 0.058;
  U(_cone([-bW, EYE[1] + 0.017 * bT, browZ - 0.010], [0, EYE[1] + 0.020 * bT, browZ + 0.003], browR, browR * 1.05, 0.016));
  U(_cone([bW, EYE[1] + 0.017 * bT, browZ - 0.010], [0, EYE[1] + 0.020 * bT, browZ + 0.003], browR, browR * 1.05, 0.016));
  // Level with the brow ridge, not standing off it: 1.5 mm proud, it was a knob between the brows on every face.
  U(_ell([0, EYE[1] + 0.012, 0.0805 + F.glabella * 0.15], [0.012, 0.012, 0.010], 0.016));   // glabella

  /* ---- midface, cheekbones, the orbits carved into them ---- */
  U(_ell([0, -0.028, 0.058], [0.040 * wide, 0.042, 0.036]));                      // maxilla
  mirror((s) => {
    // The cheekbone softened and the fat under it fuller: a ridge with a hollow below is a gaunt face.
    U(_ell([s * 0.047 * wide * (F.cheekX / 0.150), -0.007 + cheekY, 0.049 + cheekZ], [0.020 * cheekK, 0.017, 0.019 * cheekK], 0.028));   // zygomatic arch
    U(_ell([s * 0.037 * wide, -0.032, 0.053], [0.025, 0.027, 0.024], 0.028));                    // cheek fat
    /* The hollow under the cheekbone, as a rounded pocket whose front reaches the same depth. It was an
       ellipsoid 1.3 mm thick: the distance estimate for a disc that flat is wrong across its whole plane,
       and it scored a crack down the side of every face, in front of the ear. */
    if (F.malarHollow > 0) {
      /* Placed from the cheek's actual surface, found by marching in along z through the masses so far:
         a pocket at a fixed depth sat behind a full cheek and dented the side of the face instead. */
      const hx = s * 0.047 * wide, tmp = _region(P.slice(), 0.020);
      let sz = 0.12;
      while (sz > 0 && _evalRegion(tmp, hx, -0.040, sz) > 0) sz -= 0.0005;
      S(_ell([hx, -0.040, sz + 0.010 - Math.min(0.006, 0.0035 * F.malarHollow)], [0.016, 0.015, 0.010], 0.018));
    }
    // The orbit: a socket carved under the brow, deeper at the top.
    // Round and soft-edged: a tighter, harder socket framed every eye in a sunken box.
    S(_ell([s * EYE[0], EYE[1] + 0.0040, EYE[2] + 0.012], [0.0175 * oW, 0.0130 * oT, orbitD * 0.56 + 0.002], 0.030));
    if (F.temple > 0.02) S(_ell([s * 0.062 * wide, EYE[1] + 0.010, 0.034], [0.012, 0.022, 0.018 * (F.temple / 0.03)], 0.014));   // hollow temples
    // The eyelids: a shell round the ball, with the aperture cut through it.
    /* 1.6 mm off the ball, and the cornea (below) stands only 5 per cent
       proud of it: at 1.2 mm and 10 per cent the cornea came straight
       through the lids, so every iris showed whole with white all round
       it -- a stare on every face. Now the upper lid takes the top of the
       iris and the lower one meets its bottom edge, as they do. */
    U({ t: 'e', c: [s * EYE[0], EYE[1] + 0.0006, EYE[2] - 0.0006], r: [EYE_R + 0.0016, EYE_R + 0.0015, EYE_R + 0.0015], k: 0.009 });
    /* The lid margin rounded over 3 mm, not 1.8: a blend under the 2.1 mm cell is a hard edge the
       mesh can only draw as a saw, and every eye had a serrated rim. */
    /* And the opening centred 1.4 mm under the ball, so the upper lid takes the top of the iris: with
       the whole iris showing, white above it, every face stared. */
    S(_ell([s * (EYE[0] + 0.0008), EYE[1] - 0.0014, EYE[2] + 0.012], [0.0146, 0.0043 + fem * 0.0007, 0.012], 0.0032)).keep = true;
    // The fold of the upper lid and the crease under the eye.
    U(_cone([s * (EYE[0] - 0.008), EYE[1] + 0.0080, EYE[2] + 0.0060], [s * (EYE[0] + 0.011), EYE[1] + 0.0072, EYE[2] + 0.0046], 0.0013 * (F.lidFold / 0.014), 0.0011 * (F.lidFold / 0.014), 0.006));
    /* No crease cut under the eye, and the hollow between the lower lid and the cheek filled: the cut
       outlined the lid's bulb, and a round bag under each eye read as ill, not as a man. */
    U(_ell([s * EYE[0], EYE[1] - 0.0165, EYE[2] + 0.0005], [0.0150, 0.0065, 0.0095], 0.014));
  });

  /* ---- nose ---- */
  const tip = [0, -0.028 - (nL - 1) * 0.012, 0.107 + (nL - 1) * 0.006 + (nB - 1) * 0.004];
  const root = [0, EYE[1] + 0.006, 0.086 + (nB - 1) * 0.003];   // the bridge 9 mm proud of the cornea, as measured on people: at 6 it read flat
  U(_cone(root, [tip[0] + F.noseBend * 0.004, tip[1] + 0.008, tip[2] - 0.004], 0.0062, 0.0074 * (0.85 + 0.15 * nW), 0.010));  // bridge
  if (F.noseHump > 0) U(_ell(_lerp3(root, tip, 0.45).map((v, i) => v + [0, 0, 0.0035 * F.noseHump][i]), [0.0058, 0.009, 0.0045], 0.004));
  U(_ell(tip, [0.0105 * (0.8 + 0.2 * nW), 0.0098, 0.0092], 0.008));                               // tip
  mirror((s) => {
    U(_ell([s * 0.0108 * nW, tip[1] - 0.0045, tip[2] - 0.0145], [0.0068 * nW, 0.0060, 0.0086], 0.014));   // alae: flat wings grown into the tip, not balls stuck on
    S(_ell([s * 0.0058 * nW, tip[1] - 0.0104, tip[2] - 0.0120], [0.0024 * nW, 0.0010, 0.0034], 0.0045)); // nostril, a shadowed slot under the tip, not a punched hole
  });

  if (F.nasolabial > 0.012) mirror((s) => S(_cone([s * 0.0185 * nW, tip[1] - 0.002, tip[2] - 0.019], [s * 0.030, -0.070, 0.064],
    0.0020 * (F.nasolabial / 0.017), 0.0018, 0.022)));   // nasolabial fold, soft (a line, not a gash)

  /* ---- mouth ---- */
  /* THE LOWER FACE, MEASURED. Against adult averages (subnasale to mouth 2.1 cm, mouth to chin 4.6,
     nasion to chin 12.1) the mouth sat 7 mm and the chin 14 mm too low: a long, heavy lower face
     under normal eyes, which is most of why these read as something other than ordinary people. */
  const LIFT_MOUTH = 0.007, LIFT_CHIN = 0.014;
  const mouthY = -0.068 + LIFT_MOUTH;
  U(_ell([0, -0.061 + LIFT_MOUTH, 0.058], [0.033, 0.028, 0.027]));                                             // muzzle
  /* THE LIPS FOLLOW THE TEETH. They were two straight ellipsoids across a muzzle that curves back
     round the dental arch, so their ends stood proud of the face at the corners -- two pale knobs
     either side of the mouth, read as fangs. Now each lip is a centre and two side pieces set back
     onto the arch (`az`, the muzzle's own front), and the line between them follows it too. */
  const az = (x) => 0.058 + 0.027 * Math.sqrt(Math.max(0, 1 - (x / 0.033) ** 2));
  const lw = 1 + fem * 0.08;
  U(_ell([0, mouthY + 0.0050, az(0) + 0.0006], [0.0140 * lw, 0.0050 + fem * 0.0012, 0.0062], 0.010));   // upper lip
  U(_ell([0, mouthY - 0.0066, az(0) - 0.0012], [0.0130 * lw, 0.0062 + fem * 0.0012, 0.0060], 0.012));   // lower lip
  mirror((s) => {
    U(_ell([s * 0.0115 * lw, mouthY + 0.0040, az(0.0115) - 0.0005], [0.0105 * lw, 0.0038 + fem * 0.001, 0.0052], 0.014));
    U(_ell([s * 0.0100 * lw, mouthY - 0.0052, az(0.0100) - 0.0018], [0.0095 * lw, 0.0044 + fem * 0.001, 0.0052], 0.014));   // thinner at the sides: a lip is a crescent
    // Where the lips meet, thinning to nothing at the corner: a round end left a dark dot there.
    S(_cone([0, mouthY, az(0) + 0.0056], [s * 0.0215 * lw, mouthY, az(0.0215 * lw) + 0.0030], 0.0010, 0.0003, 0.0040));
    // No pit cut at the corner: seen from three quarters it read as a knob, not a crease.
  });
  S(_cone([0, -0.045, 0.0925 + (0.015 - F.philtrum) * 0.05], [0, mouthY + 0.0135, 0.0915 + (0.015 - F.philtrum) * 0.05], 0.0034, 0.0030, 0.008));                 // philtrum, stopping short of the lip: its end notched the lip's top

  /* ---- jaw and chin ---- */
  const chin = [0, -0.104 + LIFT_CHIN + faceLen, chinZ + (F.mental - 0.022) * 0.25];
  mirror((s) => {
    const gon = [s * gonX * jawTaper, -0.074 + LIFT_CHIN * 0.6 + F.jawSquare * 0.003 + (F.gonialLow + 0.212) * U2M + faceLen * 0.5, -0.012 - (F.jawDepth - 0.055) * 0.25];
    U(_cone(gon, [s * 0.016, chin[1], chin[2] - 0.008], jawR * 0.9, 0.012, 0.022));                          // mandible body
    U(_cone([s * (gonX + 0.003), -0.018, -0.014], gon, 0.011, jawR * 0.9, 0.02));                        // ramus
  });
  U(_ell(chin, [chinW * wide, 0.015, 0.0125], 0.016));
  /* The fold between the lower lip and the chin, 4-5 mm deep as on people. With the chin raised it had
     filled in, and the profile ran from the nose to the chin in one smooth slope with no mouth in it. */
  // (After the chin: cut before it, the chin's own mass filled it straight back in.)
  S(_ell([0, mouthY - 0.021, 0.0890], [0.016, 0.0048, 0.0048], 0.010));                                 // mentolabial sulcus
  /* A cleft chin is a soft dimple a millimetre or two deep, not a groove: the cut line it was drew a
     seam from the lip to the point of the chin, with a dot at the end. */
  if (F.chinCleft > 0) S(_ell([0, chin[1] + 0.003, chin[2] + 0.0125 + 0.0045 - 0.0016 * Math.min(1, F.chinCleft)], [0.0045, 0.0080, 0.0045], 0.010));

  /* ---- ears ---- */
  mirror((s) => {
    const e = [s * 0.075 * wide, -0.004, -0.012];
    U({ t: 'e', c: e, r: [0.0072, 0.029, 0.017], k: 0.004 });
    S({ t: 'e', c: [e[0] + s * 0.006, e[1] - 0.002, e[2] + 0.002], r: [0.0055, 0.018, 0.010], k: 0.003 });  // concha
    S({ t: 'e', c: [e[0] + s * 0.004, e[1] - 0.010, e[2] + 0.006], r: [0.004, 0.006, 0.005], k: 0.002 });   // canal
  });

  // The masseters: the jaw's corner is muscle, not a hollow.
  mirror((s) => U(_ell([s * 0.041 * wide, -0.048, 0.012], [0.013, 0.024, 0.022], 0.030)));
  /* Under the jaw: the floor of the mouth and the muscles running down to
     the neck, so the jaw's angle sits on something instead of over a pit. */
  U(_ell([0, -0.096 + LIFT_CHIN, 0.012], [0.036 * wide, 0.020, 0.046], 0.022));
  mirror((s) => U(_cone([s * 0.048 * wide, -0.030, -0.030], [s * 0.020, -0.125, 0.020], 0.012, 0.011, 0.022)));  // sternomastoid

  /* ---- neck stub, to overlap the body's neck ----
     It used to stop at -0.132, cut flat by the mesher's box, exactly
     where the body's neck stopped too -- two open ends butted together
     and read as a ring under every jaw. Now it runs 3.5 cm further down
     INSIDE the body's neck, whose top tapers in under it (94c): the two
     surfaces cross, so the only thing on show is a soft crease. */
  // 10.4 cm across at the top, not 11.6: as wide as the jaw, the neck left no jawline to see.
  U(_cone([0, -0.058, -0.024], [0, -0.160, -0.017], 0.052 * wide, 0.044 * wide, 0.02));

  /* THE COARSE LEVELS OF DETAIL (95-engine meshes the same field again at 4.2, 7.5 and 12 mm for
     distance). A cut thinner than a cell -- the line of the lips, the corners, the nostrils, the
     philtrum, the lid fold -- is not drawn at that size, it is sampled: it comes out as a dark gash
     or a dot wherever a cell happens to straddle it, and at play distance every mouth was a grimace
     of teeth and every eye a stare. On those levels the features under two cells go (the paint still
     carries the lip line and the nostrils) and no blend is sharper than the cell. */
  if (h > 0.003) {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      const thin = p.t === 'c' ? Math.max(p.r1, p.r2) : p.t === 'e' ? Math.min(p.r[0], p.r[1], p.r[2]) : 1;
      if (p.op === 's' && thin < h * 1.1 && !p.keep) P.splice(i, 1);
      else if (p.k != null && p.k < h * 1.1) p.k = h * 1.1;
    }
  }
  const R = _region(P, 0.020);
  // Wide enough that no cheek or ear is clipped by the box (a clip reads as a crack down the side of the face).
  R.bmin = [-0.118 * wide, -0.167, -0.132]; R.bmax = [0.118 * wide, 0.134, 0.132];
  R.bandScale = 0.4;
  const g = new Geometry();
  // UVs 0..1 over the head, as the old sculpt had them, so a skin material's uvScale means the same thing.
  const t0 = g.indices.length;
  _meshRegion(g, R, h, PART.NECK, (x, y, z, out) => { out[0] = Math.atan2(x, z) / (2 * Math.PI) + 0.5; out[1] = (y + 0.167) / 0.297; });
  _fixUvSeams(g, t0, g.indices.length, 1);

  return _headFinish(g, { EYE, EYE_R, tip, mouthY, nW, fem, lipZ: 0.093 }, opts);
}


/* Everything after the surface exists, shared by the field-built head and the
   MakeHuman head (94f): skin colour variation, the cavity bake, painted hair,
   brows and beard, the measurements the caller places the head by, and the
   eyeballs. C carries the landmarks: EYE (centre of the left eyeball, metres),
   EYE_R, the nose tip, the mouth line, the lips' depth, nose width, fem. */
function _headFinish(g, C, opts) {
  const { EYE, EYE_R, tip, mouthY, nW, fem, lipZ } = C;
  const mirror = (fn) => { fn(1); fn(-1); };
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
    // Centred on the lips where they now stand (az, the arch), not 12 mm behind them: they read as bare skin.
    const lip = Math.max(bump(x, y, z, [0, mouthY + 0.004, lipZ], [0.023, 0.0055, 0.010]), bump(x, y, z, [0, mouthY - 0.0065, lipZ - 0.002], [0.021, 0.0065, 0.010]));
    r *= 1 - lip * 0.08; gg *= 1 - lip * 0.28; b *= 1 - lip * 0.22;
    const line = Math.exp(-(((y - mouthY) / 0.0014) ** 2)) * (1 - _ss(0.017, 0.025, Math.abs(x))) * (z > 0.074 ? 1 : 0);
    r *= 1 - line * 0.55; gg *= 1 - line * 0.60; b *= 1 - line * 0.58;
    const under = Math.max(bump(x, y, z, [EYE[0], EYE[1] - 0.013, EYE[2] + 0.005], [0.016, 0.006, 0.012]), bump(x, y, z, [-EYE[0], EYE[1] - 0.013, EYE[2] + 0.005], [0.016, 0.006, 0.012]));
    r *= 1 - under * 0.07; gg *= 1 - under * 0.08; b *= 1 - under * 0.05;
    /* Eye black: grease paint round the sockets, under a mask's eye port. A wide soft ring over the lids,
       the brow bone and the top of the cheek -- the eyes are their own mesh, so they stay clear. */
    /* AGE: what eighty years writes on a face that the shape alone does not -- creases across the
       forehead, crow's feet fanning from the outer corners of the eyes, hollows under them and down
       the cheeks, and the skin a little blotchier and paler. Scaled from fifty (nothing) up. */
    const aged = opts.age != null ? Math.max(0, Math.min(1, (opts.age - 50) / 30)) : 0;
    if (aged > 0) {
      const fy = (y - EYE[1] - 0.030) / 0.026;                 // 0 at the brow, 1 at the hairline
      if (fy > 0 && fy < 1 && z > 0.035 && Math.abs(x) < 0.050) {
        const crease = Math.pow(Math.abs(Math.sin(fy * Math.PI * 3.5 + x * 9)), 10) * (1 - Math.abs(x) / 0.05);
        r *= 1 - crease * 0.20 * aged; gg *= 1 - crease * 0.22 * aged; b *= 1 - crease * 0.20 * aged;
      }
      const ax = Math.abs(x) - EYE[0] - 0.020, ay = y - EYE[1];
      if (ax > 0 && ax < 0.018 && Math.abs(ay) < 0.014 && z > 0.02) {
        const fan = Math.pow(Math.abs(Math.sin(Math.atan2(ay, ax) * 7)), 8) * (1 - ax / 0.018);
        r *= 1 - fan * 0.22 * aged; gg *= 1 - fan * 0.24 * aged; b *= 1 - fan * 0.22 * aged;
      }
      const hol = Math.max(bump(Math.abs(x), y, z, [EYE[0], EYE[1] - 0.020, EYE[2] - 0.002], [0.020, 0.008, 0.014]),
        bump(Math.abs(x), y, z, [0.034, -0.036, 0.062], [0.012, 0.024, 0.02]) * 0.7);
      r *= 1 - hol * 0.14 * aged; gg *= 1 - hol * 0.16 * aged; b *= 1 - hol * 0.12 * aged;
      const spot = Math.max(0, Math.sin(x * 410) * Math.sin(y * 370) * Math.sin(z * 290) - 0.75) * 4;
      r *= 1 - spot * 0.10 * aged; gg *= 1 - spot * 0.13 * aged; b *= 1 - spot * 0.16 * aged;
    }
    if (opts.eyeBlack) {
      // bump() is 0.2 at one radius, so the radius here is the inner edge of the fade, not the outer.
      const eb = Math.min(1, 3.2 * Math.max(bump(Math.abs(x), y, z, [EYE[0], EYE[1] + 0.002, EYE[2]], [0.036, 0.026, 0.034]),
        bump(Math.abs(x), y, z, [EYE[0] * 0.5, EYE[1] - 0.004, EYE[2] + 0.008], [0.024, 0.018, 0.026])));
      r *= 1 - eb * 0.90; gg *= 1 - eb * 0.90; b *= 1 - eb * 0.88;
    }
    // Inside the nostrils: shade that the slot alone is too shallow to make.
    const nos = Math.max(bump(x, y, z, [0.0058 * nW, tip[1] - 0.0102, tip[2] - 0.0110], [0.0030, 0.0022, 0.0042]), bump(x, y, z, [-0.0058 * nW, tip[1] - 0.0102, tip[2] - 0.0110], [0.0030, 0.0022, 0.0042]));
    r *= 1 - nos * 0.55; gg *= 1 - nos * 0.62; b *= 1 - nos * 0.62;
    if (!fem && opts.shave !== false) {
      // Fading out under the jaw: carried down the neck stub it ended in a line where the body's neck takes over.
      const jaw = Math.max(0, Math.min(1, (-0.036 - y) / 0.03)) * (z > -0.02 ? 1 : 0) * (1 - lip) * (1 - _ss(0.086, 0.108, -y));
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
  /* Gentle. At 0.75 with a floor of 0.42 every fold went near black and the
     faces read as melted wax -- the single biggest thing that made them
     frightening rather than human. */
  bakeCavityAO(g, { radius: 0.036, strength: 0.38, floor: 0.68, samples: 1400 });

  /* HAIR THAT IS PAINTED, NOT BUILT. Brows, stubble and a shorn scalp
     were shells cut from the surface and pushed out a few millimetres:
     solid slabs with a stair-stepped edge, which is exactly how they read.
     Real ones are density -- skin showing through hair -- so on this head
     they are soft masks over the SAME regions the shells used (the style
     tables in 91-face.js, in the same normalised space), multiplied into
     the skin as the hair's colour relative to the skin's, with a per-vertex
     jitter for the grain. Full beards and longer hair keep their shells;
     under them the paint closes any gap at the edge. */
  paintHeadHair(g, Object.assign({}, opts, { _mouthY: mouthY * SDF_HEAD_TO_UNITS, _eyeY: EYE[1] * SDF_HEAD_TO_UNITS }));

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
    // A head that knows its own chin says so (94f): the search above can land on the front of a long neck.
    if (C.chinY != null) chinY = C.chinY * SDF_HEAD_TO_UNITS;
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
        if (th < 0.16) { cr = 0.03; cg = 0.025; cb = 0.025; }                     // pupil
        else if (th < 0.53) {                                                     // iris, darker at its rim
          const f = (th - 0.16) / 0.37, rim = f > 0.82 ? 0.55 : 1, fib = 0.85 + 0.15 * Math.sin(ph * 23 + a);
          cr = ir * rim * fib; cg = ig * rim * fib; cb = ib * rim * fib;
        } else {                                                                  // sclera, a little warm and veined at the corners
          const edge = Math.min(1, Math.max(0, (th - 0.9) / 0.6));
          // Off-white: a sclera paper-white in shade is what makes a stare.
          cr = 0.80 - edge * 0.05; cg = 0.76 - edge * 0.08; cb = 0.72 - edge * 0.08;
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

/* The brow tables were laid against the old sculpt's ridge. On this head that band lands in the
   crease between the lid and the ridge -- measured, 8 mm low -- and reads as a smudge of shadow on
   the lid. Up onto the ridge, where brows grow. */
const BROW_LIFT = 0.028;
/* The beard tables (91-face) are laid out against the old lower face. The mouth now sits 7 mm higher
   and the chin 14 mm higher (see LIFT_MOUTH, LIFT_CHIN), so the bare band left for the lips and the
   beard's lower edge move up with them -- in the normalised height of a ~0.25 m head, 0.028 and 0.05.
   Left where they were, a full beard grew over the lower lip. */
const LIP_LIFT = 0.028, BEARD_LIFT = 0.045;

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
  /* Everyone has eyebrows. A caller that names no style (the survivors never did) got a browless
     face, and nothing on a head is more alien than that; one is chosen from the seed, in the hair's
     colour. 'none' still means none. */
  const browStyle = opts.brows !== undefined ? opts.brows
    : (opts.type === 'female' ? ['arched', 'thin'] : ['straight', 'angled', 'heavy'])[(opts.seed || 5) % (opts.type === 'female' ? 2 : 3)];
  const browCol = opts.browColor != null ? opts.browColor : opts.hairColor != null ? opts.hairColor : 0x2a2320;
  const B = browStyle && BROW_STYLES[browStyle];
  /* Where the head says where its eyes are, the band is centred 2.2 cm above them -- on the ridge, on
     any skull -- rather than at a fixed fraction of the head's height, which put a woman's brows up at
     her hairline on a smaller head. */
  const browLift = B && opts._eyeY != null
    ? (opts._eyeY + 0.022 * SDF_HEAD_TO_UNITS - lo[1]) / sy - (B.u[0] + B.u[1]) / 2
    : BROW_LIFT;
  if (B) layers.push({ col: ratio(browCol), dens: 0.78, mask: (u, w, xn) => {
    const t = (xn - B.x[0]) / Math.max(1e-6, B.x[1] - B.x[0]);
    const rise = B.arch * Math.sin(Math.min(1, Math.max(0, t) / 0.68) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.68) / 0.32 * 0.5);
    /* THICKER AT THE INNER END, FEATHERED AT THE OUTER TAIL -- which the
       comment here always said and the band never did: it was the same
       height end to end with square ends, and read as a strip of tape.
       The top edge now comes down along the last two thirds to under half
       the height at the tail, the tail thins out, and the inner head is
       rounded and a little sparse, where the hairs stand up. */
    const tc = Math.max(0, Math.min(1, t));
    const taper = 1 - 0.58 * _ss(0.30, 1.0, tc);
    const l = B.u[0] + browLift + rise + B.tilt * (1 - t), h2 = l + (B.u[1] - B.u[0]) * taper;
    const mid = (l + h2) * 0.5, half = (h2 - l) * 0.5;
    const inner = _ss(B.x[0] - 0.015, B.x[0] + 0.05, xn) * (0.80 + 0.20 * _ss(0.0, 0.18, tc));
    const tail = 1 - _ss(B.x[1] - 0.09, B.x[1] + 0.015, xn);
    // A feathered edge, wider on top than below: the hairs lie up and out, and a hard edge reads as painted on.
    const band = 1 - _ss(half - 0.006, half + 0.008 + (u > mid ? 0.003 : 0), Math.abs(u - mid));
    return _ss(0.66, 0.74, w) * inner * tail * band * (1 - 0.25 * _ss(0.6, 1.0, tc));
  } });
  const Bd = opts.beard && BEARD_STYLES[opts.beard];
  const uMouth = opts._mouthY != null ? (opts._mouthY - lo[1]) / sy : null, duM = SDF_HEAD_TO_UNITS / sy;
  if (Bd) layers.push({ col: ratio(opts.beardColor != null ? opts.beardColor : 0x2a2320), dens: opts.beard === 'stubble' ? 0.42 : 0.90, mask: (u, w, xn) => {
    /* Soft on every side -- hair thins out at the edge of a beard, it does not stop -- and softest
       at the top and the front, where a sideburn or a pair of chops was a hard-edged rectangle. */
    // The top edge rises with the mouth wherever it is a moustache line (below the cheekbone), not a sideburn.
    const u1 = Bd.u[1] + (Bd.u[1] < 0.4 ? LIP_LIFT : 0), u0 = Bd.u[0] + (Bd.overLip ? LIP_LIFT : BEARD_LIFT);
    let m = _ss(u0 - 0.012, u0 + 0.025, u) * (1 - _ss(u1 - 0.060, u1 + 0.010, u))
      * _ss(Bd.w[0] - 0.04, Bd.w[0] + 0.04, w) * (1 - _ss(Bd.x - 0.08, Bd.x + 0.02, xn))
      /* Only a style that leaves the middle bare (a split) fades there: with no xMin this still took the
         beard to a quarter at the centre line, a bare stripe down the lip and chin. */
      * (Bd.xMin ? _ss(Bd.xMin - 0.09, Bd.xMin + 0.10, xn) : 1);
    if (!Bd.overLip) {
      // The bare band for the lips, from where the mouth actually is: 13.5 mm below the line to 10.5 above.
      const L = uMouth != null ? [uMouth - 0.0135 * duM, uMouth + 0.0105 * duM] : (Bd.lips || [0.198, 0.272]).map((v) => v + LIP_LIFT); m *= 1 - _ss(0.84, 0.88, w) * _ss(L[0] - 0.005, L[0] + 0.01, u) * (1 - _ss(L[1] - 0.01, L[1] + 0.005, u)) * (1 - _ss(0.36, 0.42, xn)); }
    return m;
  } });
  const H = opts.hairStyle && HAIR_STYLES[opts.hairStyle];
  if (H) layers.push({ col: ratio(opts.hairColor != null ? opts.hairColor : 0x2a2320), dens: opts.hairStyle === 'crop' ? 0.86 : 0.95, mask: (u, w, xn) => {
    const edge = sdfHairEdge(H, w, xn);
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
