/* ============================================================
   THE CAST -- story characters, one spec each.

   The seven operators are a table of faces in fatigues and kit: good
   for a multiplayer roster, and wrong for a story, whose people are
   particular. Payback is a woman in her own clothes under a plate
   carrier with a skull on her shoulder; Molotov has never been seen
   without a ski mask he painted with fire himself; Lincoln is bald and
   in camouflage with a pistol on his hip. None of that was buildable:
   operator() always dresses fatigues, every mask is plain black, there
   is no camouflage, no tattoo and no woman among the seven.

   castMember(spec) builds one of these from a single description. It
   is operator() with every choice opened up, and it reuses every piece
   operator() is made of -- the MakeHuman figure and head, the fitted
   kit (95c), the balaclava cut from the head's own surface (95b) --
   so a cast member stands, moves, speaks and is lit exactly the way
   an operator is.

   A SPEC
     id, name
     frame       'male' | 'female' | 'heavy'
     face        an operator face sculpt to start from ('alpha', ...)
     seed        varies the figure within the frame
     height      metres; build  1 = average, above is broader
     skin        an operator skin name ('tan', ...) or a hex colour
     hair        style name or null (bald); hairColor
     brows, browColor, beard, beardColor, eyeColor, eyeBlack (bool)

     outfit      civilian clothes: a name from the outfit table, or one
                 described as { top, under, bottom, shoes, belt }
     fatigues    OR a uniform: an operator cloth name, or a material
                 (e.g. { texture: 'camo', ... })
     gear        kit pieces: carrier pouches admin belt knees helmet ...
     gearOpts    { pouches, holster, nvg, kitColor }
     mask        'balaclava' (head with an eye port) | 'gaiter' (the
                 lower face, nose to chin) | null
     maskMaterial  what it is made of; plain black knit if not given
     mic         a boom microphone off the mask (or the head)
     tattoo      'skull' on the left shoulder
     voice       carried for the director: { pitch, rate, tract }
   ============================================================ */

/* Civilian outfits named in a spec are registered into the outfit table
   under their own key, because the clothed body builder (94c/94h) finds
   its outfit by name and caches the dressed body by it. */
function castOutfitKey(spec) {
  if (!spec.outfit) return null;
  if (typeof spec.outfit === 'string') return spec.outfit;
  const key = 'cast:' + spec.id;
  if (typeof OUTFITS !== 'undefined') {
    const o = spec.outfit;
    OUTFITS[key] = {
      top: Object.assign({ color: 0x8a8578, collar: 0.512, hem: -0.055, sleeve: 0.22, tears: 0 }, o.top || {}),
      under: o.under ? Object.assign({ collar: 0.500, hem: -0.08 }, o.under) : undefined,
      bottom: Object.assign({ color: 0x3e4a62, hem: 0.99, tears: 0, knees: false }, o.bottom || {}),
      shoes: Object.assign({ kind: 'boot', color: 0x2c241c }, o.shoes || {}),
      hat: null, wire: false,
      belt: o.belt, badge: o.badge,
    };
    if (!OUTFITS[key].under) delete OUTFITS[key].under;
  }
  return key;
}

/* A lower-face mask: nose to under the chin, all the way round the back
   of the head below the ears -- a gaiter pulled up, which is what a
   "long mask" with nothing over the eyes is. Same surface trick as the
   balaclava (offsetPatch), so it fits this face and moves with the jaw. */
function castGaiter(headGeo) {
  const keep = (u, w, xn) => {
    if (u < 0.02) return false;                  // down over the neck
    // Over the bridge of the nose in front, lower behind the ears.
    const top = 0.505 - (1 - w) * 0.10;
    return u < top;
  };
  return offsetPatch(headGeo, keep, 0.0058, null);
}

/* A KNIT SHELL OVER THE HEAD, built properly. The ski mask was offsetPatch -- the head's own
   triangles, each vertex pushed 5.6 mm along its normal, a triangle dropped whole if any corner was
   in the eye port -- and it showed three faults on Molotov:
     - the ears came through it: the MakeHuman head's ears have normals that face into the skull in
       places, so their knit copy was pushed INSIDE the skin. Here the offset falls back to the
       direction out from the head's centre wherever the normal faces in.
     - the eye port was a staircase, because whole triangles went. Here every triangle is CLIPPED
       against a smooth field (an ellipse round both eyes), with new vertices on the cut, so the
       edge is a clean curve at any mesh density.
     - it stopped where the head mesh stops, a hand's width above the collar, and the neck showed
       front and back. Here a skirt of knit carries on down from the bottom edge, flaring a little,
       to tuck into the collar.
   `field(u, w, xn)` is >= 0 where the mask is. */
function castMaskShell(src, field, thick, skirt) {
  const P = src.positions, N = src.normals, I = src.indices, UV = src.uvs && src.uvs.length ? src.uvs : null;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const sx = Math.max(1e-6, hi[0] - lo[0]), sy = Math.max(1e-6, hi[1] - lo[1]), sz = Math.max(1e-6, hi[2] - lo[2]);
  const cx = (lo[0] + hi[0]) / 2, cy = lo[1] + sy * 0.55, cz = (lo[2] + hi[2]) / 2;
  const n = P.length / 3, fv = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const u = (P[v * 3 + 1] - lo[1]) / sy, w = (P[v * 3 + 2] - lo[2]) / sz, xn = Math.abs((P[v * 3] - lo[0]) / sx - 0.5) * 2;
    fv[v] = field(u, w, xn);
  }
  const g = new Geometry(), made = new Map();
  // One output vertex per source vertex, or per cut edge (shared, so the mesh stays closed).
  const emit = (key, p, nn, uv) => {
    let id = made.get(key);
    if (id !== undefined) return id;
    let dx = nn[0], dy = nn[1], dz = nn[2];
    const rx = p[0] - cx, ry = p[1] - cy, rz = p[2] - cz, rl = Math.hypot(rx, ry, rz) || 1;
    if ((dx * rx + dy * ry + dz * rz) / rl < 0.15) { dx = rx / rl; dy = ry / rl; dz = rz / rl; }
    id = g.positions.length / 3;
    /* Over the ears the knit stands off further, the way the fabric stretches across them rather
       than following every fold -- so no rim of ear comes through it. */
    const un = (p[1] - lo[1]) / sy, xq = Math.abs((p[0] - lo[0]) / sx - 0.5) * 2;
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const tk = thick + (skirt ? 0.0075 * sm(0.74, 0.90, xq) * (1 - sm(0.12, 0.20, Math.abs(un - 0.50))) : 0);
    g.positions.push(p[0] + dx * tk, p[1] + dy * tk, p[2] + dz * tk);
    g.normals.push(dx, dy, dz);
    g.uvs.push(uv[0], uv[1]);
    made.set(key, id);
    return id;
  };
  const V = (v) => ({ key: 'v' + v, p: [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n: [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]],
    uv: UV ? [UV[v * 2], UV[v * 2 + 1]] : [0, 0], f: fv[v] });
  const cut = (a, b) => {
    const t = a.f / (a.f - b.f), L = (x, y) => x + (y - x) * t;
    const k = a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key;
    return { key: k, p: [L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2])],
      n: [L(a.n[0], b.n[0]), L(a.n[1], b.n[1]), L(a.n[2], b.n[2])], uv: [L(a.uv[0], b.uv[0]), L(a.uv[1], b.uv[1])], f: 0 };
  };
  const edgeUse = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const tri = [V(I[t]), V(I[t + 1]), V(I[t + 2])];
    let poly;
    if (tri.every((q) => q.f >= 0)) poly = tri;
    else if (tri.every((q) => q.f < 0)) continue;
    else {
      poly = [];
      for (let i = 0; i < 3; i++) {
        const a = tri[i], b = tri[(i + 1) % 3];
        if (a.f >= 0) poly.push(a);
        if ((a.f >= 0) !== (b.f >= 0)) poly.push(cut(a, b));
      }
    }
    const ids = poly.map((q) => emit(q.key, q.p, q.n, q.uv));
    for (let i = 1; i + 1 < ids.length; i++) {
      g.indices.push(ids[0], ids[i], ids[i + 1]);
      for (const [x, y] of [[ids[0], ids[i]], [ids[i], ids[i + 1]], [ids[i + 1], ids[0]]]) {
        const k = x < y ? x + ',' + y : y + ',' + x;
        edgeUse.set(k, (edgeUse.get(k) || 0) + 1);
      }
    }
  }
  // The skirt: from every open edge low on the neck, a band of knit down and slightly out, both faces.
  if (skirt) {
    const Q = g.positions, low = lo[1] + sy * 0.30, drop = skirt.drop, flare = skirt.flare;
    const down = new Map();
    const lower = (i) => {
      if (down.has(i)) return down.get(i);
      const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2], rx = x - cx, rz = z - cz, rl = Math.hypot(rx, rz) || 1;
      const id = Q.length / 3;
      Q.push(x + rx / rl * flare, y - drop, z + rz / rl * flare);
      g.normals.push(rx / rl, 0, rz / rl);
      g.uvs.push(g.uvs[i * 2], g.uvs[i * 2 + 1] - 0.05);
      down.set(i, id);
      return id;
    };
    for (const [k, c] of edgeUse) {
      if (c !== 1) continue;
      const [a, b] = k.split(',').map(Number);
      if (Q[a * 3 + 1] > low || Q[b * 3 + 1] > low) continue;
      const a2 = lower(a), b2 = lower(b);
      g.indices.push(a, b, b2, a, b2, a2, b, a, a2, b, a2, b2);
    }
  }
  g.finalize ? g.finalize() : null;
  return g;
}

/* A ski mask: the whole head, crown included -- a balaclava cut for a
   helmet stops at the crown, and on a man who wears no helmet that left
   a bald patch of scalp on top -- and down over the neck, with the eye
   port the balaclava has. */
function castSkiMask(headGeo) {
  // Outside an ellipse round both eyes (brow to the top of the nose), or anywhere behind the face.
  const field = (u, w, xn) => {
    const e = Math.pow((u - 0.583) / 0.060, 2) + Math.pow(xn / 0.60, 2) - 1;
    return Math.max(e, (0.79 - w) * 12);
  };
  return castMaskShell(headGeo, field, 0.0058, { drop: 0.080, flare: 0.012 });
}

/* A boom microphone: a thin arm from below the ear round to the corner
   of the mouth, with a foam head on the end. In the head's frame, scaled
   with it. */
function castMic(s) {
  const g = new Geometry();
  const pts = [[0.090, -0.010, 0.000], [0.094, -0.030, 0.042], [0.078, -0.054, 0.088], [0.048, -0.064, 0.116]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i].map((v) => v * s), b = pts[i + 1].map((v) => v * s);
    const st = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz) || 1;
      const t = new Vec3(dx / L, dy / L, dz / L);
      const up = Math.abs(t.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
      const u = new Vec3().crossVectors(up, t).normalize(), v = new Vec3().crossVectors(t, u).normalize();
      return { u, v };
    };
    const f = st(a, b);
    sweepPath(g, [
      { o: new Vec3(a[0], a[1], a[2]), u: f.u, v: f.v, pts: ringOutline(0.0021 * s, 8) },
      { o: new Vec3(b[0], b[1], b[2]), u: f.u, v: f.v, pts: ringOutline(0.0021 * s, 8) },
    ], i === 0, false);
  }
  // The pivot at the ear and the foam at the mouth.
  const ear = pts[0].map((v) => v * s), tip = pts[pts.length - 1].map((v) => v * s);
  sweepPath(g, [
    { o: new Vec3(ear[0] - 0.014 * s, ear[1], ear[2]), u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1), pts: ringOutline(0.030 * s, 16) },
    { o: new Vec3(ear[0] + 0.004 * s, ear[1], ear[2]), u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1), pts: ringOutline(0.027 * s, 16) },
  ], true, true);
  const fo = (dx) => ({ o: new Vec3(tip[0] + dx * 0.010 * s, tip[1], tip[2] + dx * 0.004 * s), u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1),
    pts: ringOutline((dx === 0 ? 0.0075 : 0.0055) * s, 12) });
  sweepPath(g, [fo(-1), fo(0), fo(1)], true, true);
  g.finalize();
  return g;
}

/* A tattoo, as a skinned patch of the body's own surface lifted a hair
   off it: the triangles of the upper arm's outside face round the
   deltoid, carried with the body's skin weights so it rides the arm,
   and laid out flat so the inked recipe (40-material.js `skulltattoo`)
   lands on it the right way up. */
function castTattooPatch(bgeo, skeleton, side) {
  const P = bgeo.positions, N = bgeo.normals, I = bgeo.indices;
  const J = bgeo.joints, Wt = bgeo.weights;
  if (!P || !N || !I || !J || !Wt) return null;
  /* Found by the SKIN WEIGHTS, not by where the skeleton says the arm is: the dressed body's arm
     does not sit exactly on the bone line, and a box placed off the bones found no skin at all. The
     upper arm is every vertex bound mostly to it; the patch is the top of that, on its outside. */
  const arm = skeleton.index(side > 0 ? 'upperArmL' : 'upperArmR');
  const n = P.length / 3;
  const wOn = (v) => { let w = 0; for (let q = 0; q < 4; q++) if (J[v * 4 + q] === arm) w += Wt[v * 4 + q]; return w; };
  let yTop = -1e9, yBot = 1e9, cx = 0, cz = 0, cn = 0;
  const onArm = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (wOn(v) < 0.55) continue;
    onArm[v] = 1;
    const y = P[v * 3 + 1];
    if (y > yTop) yTop = y;
    if (y < yBot) yBot = y;
    cx += P[v * 3]; cz += P[v * 3 + 2]; cn++;
  }
  if (cn < 20) return null;
  cx /= cn; cz /= cn;
  const len = yTop - yBot;
  const yc = yTop - len * 0.30, R = Math.max(0.035, len * 0.22);
  const inside = new Uint8Array(n), U = new Float32Array(n), V = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    if (!onArm[v] && wOn(v) < 0.3) continue;
    const y = P[v * 3 + 1], z = P[v * 3 + 2];
    const facing = N[v * 3] * side;
    if (Math.abs(y - yc) < R && Math.abs(z - cz) < R && facing > 0.2 && (P[v * 3] - cx) * side > 0) {
      inside[v] = 1;
      U[v] = 0.5 + (z - cz) / (2 * R);
      V[v] = 0.5 + (yc - y) / (2 * R);
    }
  }
  if (typeof window !== 'undefined') { let k = 0; for (let v = 0; v < n; v++) k += inside[v]; window.__tattooVerts = k; }
  const g = new Geometry();
  const remap = new Int32Array(n).fill(-1);
  const joints = [], weights = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], cc = I[t + 2];
    if (!inside[a] || !inside[b] || !inside[cc]) continue;
    for (const v of [a, b, cc]) {
      if (remap[v] < 0) {
        remap[v] = g.positions.length / 3;
        const k = 0.0007;
        g.positions.push(P[v * 3] + N[v * 3] * k, P[v * 3 + 1] + N[v * 3 + 1] * k, P[v * 3 + 2] + N[v * 3 + 2] * k);
        g.normals.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        // Seen from outside the left arm, +Z (the front) is on the viewer's right.
        g.uvs.push(side > 0 ? 1 - U[v] : U[v], V[v]);
        for (let q = 0; q < 4; q++) { joints.push(J[v * 4 + q]); weights.push(Wt[v * 4 + q]); }
      }
      g.indices.push(remap[v]);
    }
  }
  if (!g.indices.length) return null;
  g.finalize();
  g.joints = new Float32Array(joints);
  g.weights = new Float32Array(weights);
  return g;
}

Engine.prototype.castMember = function (spec, opts = {}) {
  const frame = spec.frame || 'male';
  const height = spec.height || (frame === 'female' ? 1.68 : 1.79);
  const scale = spec.scale || height / 1.80;
  const build = spec.build || 1;
  const skinCol = typeof spec.skin === 'number' ? spec.skin : (OP_SKIN[spec.skin] || OP_SKIN.tan);
  const skin = { preset: 'skin', color: skinCol, roughness: 0.95, metalness: 0, uvScale: 12, subsurface: 0.50 };
  const civ = castOutfitKey(spec);
  const gear = (spec.gear || []).slice();
  const covered = gear.includes('helmet') || spec.mask === 'balaclava';
  const hairStyle = spec.hair === undefined ? 'crop' : spec.hair;
  const base = Object.assign({}, opts, {
    name: opts.name || ('cast-' + spec.id),
    height: height * 0.985, radius: 0.32 * scale, scale, build,
    faceType: frame,
    faceShape: OP_FACE[spec.face] || OP_FACE.alpha,
    faceKey: 'cast:' + spec.id,
    hair: !!hairStyle,
    hairStyle: hairStyle && covered ? 'crop' : hairStyle,
    hairColor: spec.hairColor != null ? spec.hairColor : 0x1a1512,
    beard: spec.beard || null, beardColor: spec.beardColor != null ? spec.beardColor : spec.hairColor,
    brows: spec.brows, browColor: spec.browColor != null ? spec.browColor : spec.hairColor,
    age: spec.age,
    eyeColor: spec.eyeColor != null ? spec.eyeColor : 0x3b2a1c,
    eyeBlack: !!spec.eyeBlack,
    seed: spec.seed || 5,
    skin,
  });
  if (civ) {
    /* The clothed builder at zero decay: the same route Bunker Nine dresses its heroes by. `zombie`
       picks the builder and `rot: 0` says alive -- see heroModel in bunker-nine.js. */
    Object.assign(base, {
      zombie: true, rot: 0, blood: false, face: opts.face || 'static',
      zombieBuild: frame, girth: 1 + (build - 1) * 0.55, outfit: civ,
      material: skin,
      clothMaterial: { color: 0xffffff, texture: 'fabric', roughness: 0.95, metalness: 0, uvScale: 2.4 },
    });
  } else {
    const cloth = typeof spec.fatigues === 'string' ? OP_CLOTH[spec.fatigues] : spec.fatigues;
    Object.assign(base, {
      fit: 'fatigues',
      material: cloth || OP_CLOTH.black,
      boots: { color: 0x2c2c2d, texture: 'fabric', roughness: 0.92, metalness: 0, uvScale: 14 },
    });
  }
  const c = this.character(base);
  if (!c) return c;
  c.cast = spec.id;
  c.castSpec = spec;

  /* The kit, fitted to the dressed body -- operator()'s own route. */
  if (gear.length) {
    let headPts = null;
    const hgeo = c.head && c.head.__geo;
    if (hgeo && hgeo.sdf) {
      const hb = c.skeleton.bones[c.skeleton.index('head')].bindMatrix.e;
      const off = c.head.localOffset || { x: 0, y: 0, z: 0 };
      const sc = typeof c.head.scale === 'number' ? c.head.scale : (c.head.scale ? c.head.scale.x : 1);
      const P = hgeo.positions, n = Math.floor(P.length / 12);
      headPts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        headPts[i * 3] = hb[12] + (off.x || 0) + P[i * 12] * sc;
        headPts[i * 3 + 1] = hb[13] + (off.y || 0) + P[i * 12 + 1] * sc;
        headPts[i * 3 + 2] = hb[14] + (off.z || 0) + P[i * 12 + 2] * sc;
      }
    }
    const bgeo = c.mesh && this.geometryOf(c.mesh);
    const torso = bgeo && bgeo.mh ? gearProfile(bgeo, scale) : null;
    const kopts = Object.assign({ build, stature: scale, headPts, torso,
      outfit: typeof spec.fatigues === 'string' ? spec.fatigues : 'black' }, spec.gearOpts || {});
    const kit = torso ? buildKit(c.skeleton, gear, Object.assign(kopts, { body: bgeo }))
      : buildGear(c.skeleton, gear, kopts);
    c.gear = [];
    for (const part of kit) {
      const gm = new GpuMesh(this.gl, part.geometry);
      gm.__key = 'gear:cast:' + spec.id + ':' + part.name;
      (this._geoByKey || (this._geoByKey = new Map())).set(gm.__key, part.geometry);
      const ga = new Actor(this, {
        name: 'gear-' + part.name, mesh: gm, material: this.material(part.material),
        skeleton: c.skeleton, animator: c.animator, controller: c.controller, body: c.controller.body,
        boundRadius: 1.4 * scale,
      });
      ga.visualOffset = new Vec3(0, 0, 0);
      ga.__geo = part.geometry;
      if (part.far && part.vfar) {
        const lodMesh = (geo, tag) => { const m = new GpuMesh(this.gl, geo); m.__key = gm.__key + tag; return m; };
        ga.lods = [{ mesh: gm, from: 0 }, { mesh: lodMesh(part.far, ':far'), from: 6 }, { mesh: lodMesh(part.vfar, ':vfar'), from: 16 }];
      }
      this.actors.push(ga);
      c.gear.push(ga);
      (c.rigged || (c.rigged = [])).push(ga);
    }
  }

  /* Head pieces cut from the head's own surface, or hung on the head bone. */
  const onHead = (geo, key, material, lodFrom) => {
    const m = new GpuMesh(this.gl, geo);
    m.__key = key;
    (this._geoByKey || (this._geoByKey = new Map())).set(key, geo);
    m.setupInstancing(20);
    const a = new Actor(this, {
      name: key.split(':')[0], mesh: m, material: this.material(material),
      parent: c, parentBone: c.skeleton.index('head'),
      offset: c.head.localOffset, scale: c.head.scale,
      boundRadius: 0.45 * scale,
    });
    if (lodFrom && c.head.lods) {
      a.lods = c.head.lods.map((l, i) => {
        if (i === 0) return { mesh: m, from: l.from };
        const lg = this.geometryOf(l.mesh);
        const lb = lg ? lodFrom(lg) : null;
        if (!lb || !lb.indices.length) return { mesh: m, from: l.from };
        const lm = new GpuMesh(this.gl, lb);
        lm.__key = key + ':' + i;
        lm.setupInstancing(20);
        return { mesh: lm, from: l.from };
      });
    }
    this.actors.push(a);
    return a;
  };
  if (spec.mask && c.head) {
    const hg = this.geometryOf(c.head.mesh);
    const cut = spec.mask === 'gaiter' ? (g) => castGaiter(g) : (g) => castSkiMask(g);
    const mg = hg ? cut(hg) : null;
    if (mg && mg.indices.length) {
      c.mask = onHead(mg, 'mask:cast:' + spec.id, spec.maskMaterial || GEAR_MAT.black, cut);
      if (spec.mask === 'balaclava') c.balaclava = c.mask;
    }
  }
  if (spec.mic && c.head) {
    const hs = typeof c.head.scale === 'number' ? c.head.scale : (c.head.scale ? c.head.scale.x : 1);
    c.mic = onHead(castMic(1 / Math.max(0.2, hs)), 'mic:cast:' + spec.id,
      { color: 0x1d1e20, texture: 'polymer', roughness: 0.55, metalness: 0, uvScale: 4 });
  }

  /* The tattoo, on the left shoulder. */
  if (spec.tattoo && c.mesh) {
    /* The bare skin of a clothed body is not in the body mesh -- that is the garment -- but in the
       `neck` piece the dresser cuts for everything the clothes leave showing (94h), arms included. */
    const skinGeo = (c.neck && c.neck.mesh && this.geometryOf(c.neck.mesh)) || this.geometryOf(c.mesh);
    const tg = skinGeo ? castTattooPatch(skinGeo, c.skeleton, 1) : null;
    if (tg) {
      const tm = new GpuMesh(this.gl, tg);
      tm.__key = 'tattoo:cast:' + spec.id;
      (this._geoByKey || (this._geoByKey = new Map())).set(tm.__key, tg);
      const ta = new Actor(this, {
        name: 'tattoo', mesh: tm,
        material: this.material({ color: skinCol, texture: 'skulltattoo', roughness: 0.92, metalness: 0, uvScale: 1, subsurface: 0.45 }),
        skeleton: c.skeleton, animator: c.animator, controller: c.controller, body: c.controller.body,
        boundRadius: 1.4 * scale,
      });
      ta.visualOffset = new Vec3(0, 0, 0);
      this.actors.push(ta);
      c.tattoo = ta;
      (c.rigged || (c.rigged = [])).push(ta);
    }
  }
  return c;
};
