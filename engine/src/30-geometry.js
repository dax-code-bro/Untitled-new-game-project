/* ============================================================
   GEOMETRY — procedural meshes, tangents, convex hulls.
   Everything the engine draws is generated at runtime, so a game
   is one HTML file with no asset downloads.
   ============================================================ */

class Geometry {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.colors = null;
    this.tangents = null;
    this.joints = null;
    this.weights = null;
    this.bounds = null;
    /* Which body part is currently being emitted. Purely advisory: the skin
       solver uses it to stop a vertex binding to a bone it has no business
       binding to, however close that bone happens to pass. A builder sets
       `part` before a section and everything it emits is tagged. */
    this.part = 0;
    this.parts = [];
    this._color = null;
  }

  /* Start tinting subsequent vertices. Opt-in: a geometry that never calls
     this carries no colour buffer at all and costs nothing, and one that
     does gets a white shirt, blue jeans and brown boots out of a single
     mesh with a single material. Call with no arguments for white. */
  /* A per-vertex tint, in the SAME hex the materials use — and, unlike a
     material colour, NOT converted from sRGB to linear on the way in.
     
     That is an inconsistency and it is deliberate to leave alone. Material
     colours go through parseColor, which applies the sRGB curve; these do
     not, so a garment painted 0x3f4a53 arrives at the shader as 0.25
     rather than as 0.05 — about four times brighter than the same hex on a
     material. Every outfit palette in the zombie builder was authored by
     eye against that, so "correcting" the conversion here without
     re-tuning all five outfits would darken every dressed body in the game
     by a factor of four in one commit, and it would look like a lighting
     bug rather than a colour-space change. If it is ever fixed, the
     palettes have to move with it. */
  setColor(r, g, b) {
    if (!this.colors) {
      this.colors = [];
      // Anything already emitted was untinted.
      for (let i = this.positions.length / 3; i > 0; i--) this.colors.push(1, 1, 1);
    }
    if (r == null) this._color = null;
    else if (typeof r === 'number' && g == null) {
      this._color = [((r >> 16) & 255) / 255, ((r >> 8) & 255) / 255, (r & 255) / 255];
    } else this._color = [r, g, b];
    return this;
  }

  vert(px, py, pz, nx, ny, nz, u, v) {
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.parts.push(this.part);
    if (this.colors) {
      const c = this._color;
      if (c) this.colors.push(c[0], c[1], c[2]); else this.colors.push(1, 1, 1);
    }
    return this.positions.length / 3 - 1;
  }

  tri(a, b, c) { this.indices.push(a, b, c); return this; }
  quad(a, b, c, d) { this.indices.push(a, b, c, a, c, d); return this; }

  computeBounds() {
    const b = new Aabb();
    const p = this.positions;
    const v = new Vec3();
    for (let i = 0; i < p.length; i += 3) b.expandPoint(v.set(p[i], p[i + 1], p[i + 2]));
    this.bounds = b;
    return b;
  }

  /* Per-vertex tangents from UV derivatives. Normal mapping is what sells
     "every surface has real material detail", and it needs a tangent frame. */
  computeTangents() {
    const nv = this.positions.length / 3;
    const tan = new Float32Array(nv * 3);
    const bit = new Float32Array(nv * 3);
    const P = this.positions, U = this.uvs, I = this.indices;

    for (let i = 0; i < I.length; i += 3) {
      const i0 = I[i], i1 = I[i + 1], i2 = I[i + 2];
      const x0 = P[i0 * 3], y0 = P[i0 * 3 + 1], z0 = P[i0 * 3 + 2];
      const e1x = P[i1 * 3] - x0, e1y = P[i1 * 3 + 1] - y0, e1z = P[i1 * 3 + 2] - z0;
      const e2x = P[i2 * 3] - x0, e2y = P[i2 * 3 + 1] - y0, e2z = P[i2 * 3 + 2] - z0;
      const du1 = U[i1 * 2] - U[i0 * 2], dv1 = U[i1 * 2 + 1] - U[i0 * 2 + 1];
      const du2 = U[i2 * 2] - U[i0 * 2], dv2 = U[i2 * 2 + 1] - U[i0 * 2 + 1];
      const det = du1 * dv2 - du2 * dv1;
      // Degenerate UVs (seams, poles) contribute nothing rather than NaN.
      if (Math.abs(det) < 1e-12) continue;
      const r = 1 / det;
      const tx = (e1x * dv2 - e2x * dv1) * r, ty = (e1y * dv2 - e2y * dv1) * r, tz = (e1z * dv2 - e2z * dv1) * r;
      const bx = (e2x * du1 - e1x * du2) * r, by = (e2y * du1 - e1y * du2) * r, bz = (e2z * du1 - e1z * du2) * r;
      for (const idx of [i0, i1, i2]) {
        tan[idx * 3] += tx; tan[idx * 3 + 1] += ty; tan[idx * 3 + 2] += tz;
        bit[idx * 3] += bx; bit[idx * 3 + 1] += by; bit[idx * 3 + 2] += bz;
      }
    }

    const out = new Float32Array(nv * 4);
    const N = this.normals;
    for (let i = 0; i < nv; i++) {
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      let tx = tan[i * 3], ty = tan[i * 3 + 1], tz = tan[i * 3 + 2];
      // Gram-Schmidt against the normal.
      const d = nx * tx + ny * ty + nz * tz;
      tx -= nx * d; ty -= ny * d; tz -= nz * d;
      let l = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (l < 1e-8) {
        // No usable tangent: pick any vector orthogonal to the normal.
        if (Math.abs(nx) < 0.577) { tx = 0; ty = -nz; tz = ny; }
        else { tx = -nz; ty = 0; tz = nx; }
        l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      }
      out[i * 4] = tx / l; out[i * 4 + 1] = ty / l; out[i * 4 + 2] = tz / l;
      // Handedness: cross(N,T)·B tells us which way the bitangent runs.
      const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
      const dot = cx * bit[i * 3] + cy * bit[i * 3 + 1] + cz * bit[i * 3 + 2];
      out[i * 4 + 3] = dot < 0 ? -1 : 1;
    }
    this.tangents = out;
    return this;
  }

  /* Split every triangle into its own vertices so each face gets a flat
     normal. Fracture chunks and low-poly rock look right this way. */
  facetize() {
    const P = this.positions, I = this.indices, U = this.uvs;
    const np = [], nn = [], nu = [], ni = [];
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
      const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const base = np.length / 3;
      np.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      nn.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      if (U && U.length) nu.push(U[a * 2], U[a * 2 + 1], U[b * 2], U[b * 2 + 1], U[c * 2], U[c * 2 + 1]);
      else nu.push(0, 0, 1, 0, 0, 1);
      ni.push(base, base + 1, base + 2);
    }
    this.positions = np; this.normals = nn; this.uvs = nu; this.indices = ni;
    return this;
  }

  translate(x, y, z) {
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) { p[i] += x; p[i + 1] += y; p[i + 2] += z; }
    return this;
  }
  scaleBy(x, y, z = null) {
    if (z === null) { z = x; y = x; }
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) { p[i] *= x; p[i + 1] *= y; p[i + 2] *= z; }
    // Non-uniform scaling of positions requires inverse-scaling the normals.
    const n = this.normals;
    const ix = 1 / x, iy = 1 / y, iz = 1 / z;
    for (let i = 0; i < n.length; i += 3) {
      let a = n[i] * ix, b = n[i + 1] * iy, c = n[i + 2] * iz;
      const l = Math.sqrt(a * a + b * b + c * c) || 1;
      n[i] = a / l; n[i + 1] = b / l; n[i + 2] = c / l;
    }
    return this;
  }

  merge(other, offset = null) {
    const base = this.positions.length / 3;
    const op = other.positions;
    if (offset) {
      for (let i = 0; i < op.length; i += 3) this.positions.push(op[i] + offset.x, op[i + 1] + offset.y, op[i + 2] + offset.z);
    } else {
      for (let i = 0; i < op.length; i++) this.positions.push(op[i]);
    }
    for (let i = 0; i < other.normals.length; i++) this.normals.push(other.normals[i]);
    for (let i = 0; i < other.uvs.length; i++) this.uvs.push(other.uvs[i]);
    for (let i = 0; i < other.indices.length; i++) this.indices.push(other.indices[i] + base);
    return this;
  }

  /* Groups of vertex indices that occupy the same position.

     Every closed surface here duplicates its wrap-around column (s=0 and
     s=segments are the same point) so UVs can run 0..1. Per-vertex normal
     averaging therefore never crosses that column, and the seam shows as a
     hard crease down an otherwise smooth head or torso. Welding the
     normals afterwards fixes it without merging the vertices themselves,
     which would break the UVs. */
  computeWeldGroups(epsilon = 1e-5) {
    const P = this.positions;
    const n = P.length / 3;
    const buckets = new Map();
    const inv = 1 / epsilon;
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(P[i * 3] * inv)},${Math.round(P[i * 3 + 1] * inv)},${Math.round(P[i * 3 + 2] * inv)}`;
      let b = buckets.get(key);
      if (!b) { b = []; buckets.set(key, b); }
      b.push(i);
    }
    const groups = [];
    for (const b of buckets.values()) if (b.length > 1) groups.push(b);
    this.weldGroups = groups;
    return groups;
  }

  /* Throw away the triangles that have no area.

     Half the triangles in this game had none. The swept-profile builders
     put two vertices at every corner of an outline -- one carrying each
     adjoining edge's normal, at every corner whether it is sharp or
     smooth, because two stations of one outline must agree on their vertex
     count or the rows will not stitch -- and the quad between such a pair
     is a strip of zero width. The same thing happens at the poles of a
     revolve and at the seams of a loft.

     Nothing looked wrong, because a zero-area triangle rasterises nothing.
     But the vertex shader still runs over every one of them and the index
     buffer is twice the size it needs to be, and this game ships a low
     graphics tier for people whose machines need it. Dropping them cannot
     change a single pixel: these are indexed triangles, not strips, so no
     degenerate is load-bearing.

     Positions are untouched, so welding, normal smoothing and anything
     holding a vertex index of its own still line up. */
  dropDegenerateTriangles() {
    const I = this.indices, P = this.positions;
    if (!I || !P || !I.length) return this;
    const keep = [];
    for (let i = 0; i + 2 < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      // A millionth of a square millimetre. Real detail on these models is
      // a tenth of a millimetre across, which is a thousand times bigger.
      if (nx * nx + ny * ny + nz * nz < 1e-24) continue;
      keep.push(I[i], I[i + 1], I[i + 2]);
    }
    if (keep.length !== I.length) {
      this.indices = (I instanceof Uint32Array || I instanceof Uint16Array)
        ? new I.constructor(keep) : keep;
    }
    return this;
  }

  finalize() {
    this.positions = new Float32Array(this.positions);
    this.normals = new Float32Array(this.normals);
    this.uvs = new Float32Array(this.uvs);
    if (this.colors && !(this.colors instanceof Float32Array)) this.colors = new Float32Array(this.colors);
    this.dropDegenerateTriangles();
    if (!this.tangents) this.computeTangents();
    if (!this.bounds) this.computeBounds();
    return this;
  }
}

/* ---------------- baked cavity shading ----------------

   Why a well-sculpted head still renders as a potato.

   The face carries a real nose with real nostril pockets, two lids round
   a real eyeball, two lip volumes with a gap between them, and an ear
   with a canal. Under any light with a decent fill -- which is every
   light in this game, indoors under lamps or outdoors under an overcast
   sky -- none of it is visible, because a shading model with no occlusion
   term lights the inside of a nostril exactly as brightly as the end of
   the nose. Every recess on the face comes back the same flat colour as
   every prominence, and what is left is a smooth blob with dents in it.
   No amount of further sculpting fixes that; the detail is already there
   and is being erased at shading time.

   What a face actually reads by is its dark places. So bake them in:
   for every vertex, measure how enclosed it is, and multiply that into
   the vertex colour. Nostrils, eye apertures, the lip line, the ear
   canal, under the brow, the armpit, between the fingers, inside a
   collar -- all of them go dark, and the form appears.

   The measure is accessibility: sample other surface points nearby, and
   count how much of the hemisphere over this vertex they block. Against
   a subsampled point set so it stays linear enough to run at load time
   on a pooled character (a few milliseconds a head), and it only has to
   be approximately right -- this is contact shadow, not radiosity. */
function bakeCavityAO(g, opts = {}) {
  const P = g.positions, N = g.normals;
  const n = P.length / 3;
  if (!n) return g;
  const radius = opts.radius != null ? opts.radius : 0.09;
  const strength = opts.strength != null ? opts.strength : 0.85;
  const floor = opts.floor != null ? opts.floor : 0.30;
  /* Sample every Nth vertex. Enough of them to describe the shape of a
     cavity, few enough that this stays cheap on a 4000-vertex head. */
  const want = opts.samples || 700;
  const step = Math.max(1, Math.floor(n / want));
  const sx = [], sy = [], sz = [];
  for (let i = 0; i < n; i += step) { sx.push(P[i * 3]); sy.push(P[i * 3 + 1]); sz.push(P[i * 3 + 2]); }
  const m = sx.length;
  const r2 = radius * radius;

  if (!g.colors) {
    g.colors = new Float32Array(n * 3);
    for (let i = 0; i < g.colors.length; i++) g.colors[i] = 1;
  } else if (g.colors.length < n * 3) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < c.length; i++) c[i] = i < g.colors.length ? g.colors[i] : 1;
    g.colors = c;
  }

  for (let v = 0; v < n; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    let occ = 0, wsum = 0;
    for (let k = 0; k < m; k++) {
      const dx = sx[k] - px, dy = sy[k] - py, dz = sz[k] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2 || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      /* Only points ABOVE the surface occlude it. A neighbour lying in
         the tangent plane is the flat case and must contribute nothing,
         or every vertex on a sphere comes out equally grey. */
      const up = (dx * nx + dy * ny + dz * nz) / d;
      if (up <= 0) continue;
      // Nearer blocks more. Linear in distance is close enough here.
      const fall = 1 - d / radius;
      occ += up * fall;
      wsum += fall;
    }
    /* Normalised against how many samples were in range at all, so a
       sparse region is not darkened merely for being sparse. */
    const a = wsum > 1e-6 ? occ / wsum : 0;
    const ao = Math.max(floor, 1 - a * strength);
    g.colors[v * 3] *= ao;
    g.colors[v * 3 + 1] *= ao;
    g.colors[v * 3 + 2] *= ao;
  }
  return g;
}

/* Average per-vertex normals across coincident vertices. */
function weldNormals(normals, groups) {
  if (!groups) return;
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < grp.length; k++) {
      const i = grp[k] * 3;
      nx += normals[i]; ny += normals[i + 1]; nz += normals[i + 2];
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < grp.length; k++) {
      const i = grp[k] * 3;
      normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
    }
  }
}

/* ---------------- Primitive builders ---------------- */

const Shapes = {
  /* A box with proper per-face UVs and hard edges. */
  box(sx = 1, sy = 1, sz = 1, segments = 1) {
    const g = new Geometry();
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    // axis, normal dir, u axis, v axis, size along each
    const faces = [
      [[1, 0, 0], hx, [0, 0, -1], [0, 1, 0], sz, sy],
      [[-1, 0, 0], hx, [0, 0, 1], [0, 1, 0], sz, sy],
      [[0, 1, 0], hy, [1, 0, 0], [0, 0, 1], sx, sz],
      [[0, -1, 0], hy, [1, 0, 0], [0, 0, -1], sx, sz],
      [[0, 0, 1], hz, [1, 0, 0], [0, 1, 0], sx, sy],
      [[0, 0, -1], hz, [-1, 0, 0], [0, 1, 0], sx, sy],
    ];
    for (const [n, d, uA, vA, uS, vS] of faces) {
      const base = g.positions.length / 3;
      for (let j = 0; j <= segments; j++) {
        for (let i = 0; i <= segments; i++) {
          const fu = i / segments - 0.5, fv = j / segments - 0.5;
          g.vert(
            n[0] * d + uA[0] * fu * uS + vA[0] * fv * vS,
            n[1] * d + uA[1] * fu * uS + vA[1] * fv * vS,
            n[2] * d + uA[2] * fu * uS + vA[2] * fv * vS,
            n[0], n[1], n[2],
            (i / segments) * uS, (j / segments) * vS,
          );
        }
      }
      const row = segments + 1;
      for (let j = 0; j < segments; j++) {
        for (let i = 0; i < segments; i++) {
          const a = base + j * row + i;
          g.quad(a, a + 1, a + row + 1, a + row);
        }
      }
    }
    return g.finalize();
  },

  sphere(radius = 0.5, rings = 24, sectors = 36) {
    const g = new Geometry();
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let s = 0; s <= sectors; s++) {
        const theta = (s / sectors) * TAU;
        const st = Math.sin(theta), ct = Math.cos(theta);
        const nx = sp * ct, ny = cp, nz = sp * st;
        g.vert(nx * radius, ny * radius, nz * radius, nx, ny, nz, s / sectors * 2, r / rings);
      }
    }
    const row = sectors + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * row + s;
        // Skip the degenerate triangles at each pole.
        if (r !== 0) g.tri(a, a + 1, a + row);
        if (r !== rings - 1) g.tri(a + 1, a + row + 1, a + row);
      }
    }
    return g.finalize();
  },

  cylinder(radius = 0.5, height = 1, sectors = 24, capped = true) {
    const g = new Geometry();
    const hh = height / 2;
    for (let s = 0; s <= sectors; s++) {
      const th = (s / sectors) * TAU;
      const ct = Math.cos(th), st = Math.sin(th);
      g.vert(ct * radius, -hh, st * radius, ct, 0, st, s / sectors * 2, 0);
      g.vert(ct * radius, hh, st * radius, ct, 0, st, s / sectors * 2, height);
    }
    for (let s = 0; s < sectors; s++) {
      const a = s * 2;
      g.quad(a, a + 2, a + 3, a + 1);
    }
    if (capped) {
      for (const dir of [1, -1]) {
        const center = g.vert(0, hh * dir, 0, 0, dir, 0, 0.5, 0.5);
        const base = g.positions.length / 3;
        for (let s = 0; s <= sectors; s++) {
          const th = (s / sectors) * TAU;
          g.vert(Math.cos(th) * radius, hh * dir, Math.sin(th) * radius, 0, dir, 0,
            Math.cos(th) * 0.5 + 0.5, Math.sin(th) * 0.5 + 0.5);
        }
        for (let s = 0; s < sectors; s++) {
          if (dir > 0) g.tri(center, base + s, base + s + 1);
          else g.tri(center, base + s + 1, base + s);
        }
      }
    }
    return g.finalize();
  },

  cone(radius = 0.5, height = 1, sectors = 24) {
    const g = new Geometry();
    const hh = height / 2;
    const slope = radius / height;
    for (let s = 0; s <= sectors; s++) {
      const th = (s / sectors) * TAU;
      const ct = Math.cos(th), st = Math.sin(th);
      // Normal tilts outward by the cone's slope.
      const nl = Math.sqrt(1 + slope * slope);
      g.vert(ct * radius, -hh, st * radius, ct / nl, slope / nl, st / nl, s / sectors * 2, 0);
      g.vert(0, hh, 0, ct / nl, slope / nl, st / nl, s / sectors * 2, 1);
    }
    for (let s = 0; s < sectors; s++) g.tri(s * 2, s * 2 + 2, s * 2 + 1);
    const center = g.vert(0, -hh, 0, 0, -1, 0, 0.5, 0.5);
    const base = g.positions.length / 3;
    for (let s = 0; s <= sectors; s++) {
      const th = (s / sectors) * TAU;
      g.vert(Math.cos(th) * radius, -hh, Math.sin(th) * radius, 0, -1, 0, Math.cos(th) * 0.5 + 0.5, Math.sin(th) * 0.5 + 0.5);
    }
    for (let s = 0; s < sectors; s++) g.tri(center, base + s + 1, base + s);
    return g.finalize();
  },

  capsule(radius = 0.4, height = 1, rings = 8, sectors = 16) {
    const g = new Geometry();
    const hh = Math.max(0, height / 2 - radius);
    const rows = [];
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * (PI / 2);
      rows.push({ y: hh + Math.cos(phi) * radius, r: Math.sin(phi) * radius, ny: Math.cos(phi), nr: Math.sin(phi) });
    }
    for (let r = rings; r >= 0; r--) {
      const phi = (r / rings) * (PI / 2);
      rows.push({ y: -hh - Math.cos(phi) * radius, r: Math.sin(phi) * radius, ny: -Math.cos(phi), nr: Math.sin(phi) });
    }
    const row = sectors + 1;
    rows.forEach((rw, ri) => {
      for (let s = 0; s <= sectors; s++) {
        const th = (s / sectors) * TAU;
        const ct = Math.cos(th), st = Math.sin(th);
        g.vert(ct * rw.r, rw.y, st * rw.r, ct * rw.nr, rw.ny, st * rw.nr, s / sectors * 2, ri / rows.length * 2);
      }
    });
    for (let r = 0; r < rows.length - 1; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * row + s;
        g.quad(a, a + 1, a + row + 1, a + row);
      }
    }
    return g.finalize();
  },

  plane(width = 10, depth = 10, segX = 1, segZ = 1, uvScale = 1) {
    const g = new Geometry();
    for (let z = 0; z <= segZ; z++) {
      for (let x = 0; x <= segX; x++) {
        g.vert(
          (x / segX - 0.5) * width, 0, (z / segZ - 0.5) * depth,
          0, 1, 0,
          (x / segX) * width * uvScale, (z / segZ) * depth * uvScale,
        );
      }
    }
    const row = segX + 1;
    for (let z = 0; z < segZ; z++) {
      for (let x = 0; x < segX; x++) {
        const a = z * row + x;
        g.quad(a, a + row, a + row + 1, a + 1);
      }
    }
    return g.finalize();
  },

  torus(radius = 0.6, tube = 0.22, rings = 24, sectors = 36) {
    const g = new Geometry();
    for (let r = 0; r <= rings; r++) {
      const u = (r / rings) * TAU;
      const cu = Math.cos(u), su = Math.sin(u);
      for (let s = 0; s <= sectors; s++) {
        const v = (s / sectors) * TAU;
        const cv = Math.cos(v), sv = Math.sin(v);
        const nx = cu * cv, ny = sv, nz = su * cv;
        g.vert((radius + tube * cv) * cu, tube * sv, (radius + tube * cv) * su, nx, ny, nz, r / rings * 3, s / sectors);
      }
    }
    const row = sectors + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * row + s;
        g.quad(a, a + row, a + row + 1, a + 1);
      }
    }
    return g.finalize();
  },

  /* Terrain from a height function. Normals are taken from finite
     differences of the same function, so slopes light correctly. */
  terrain(size = 100, segments = 64, heightFn = () => 0, uvScale = 0.25) {
    const g = new Geometry();
    const step = size / segments;
    const h = step * 0.5;
    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const wx = (x / segments - 0.5) * size;
        const wz = (z / segments - 0.5) * size;
        const y = heightFn(wx, wz);
        const dx = heightFn(wx + h, wz) - heightFn(wx - h, wz);
        const dz = heightFn(wx, wz + h) - heightFn(wx, wz - h);
        const nx = -dx, ny = 2 * h, nz = -dz;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        g.vert(wx, y, wz, nx / l, ny / l, nz / l, wx * uvScale, wz * uvScale);
      }
    }
    const row = segments + 1;
    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const a = z * row + x;
        g.quad(a, a + row, a + row + 1, a + 1);
      }
    }
    return g.finalize();
  },

  /* An irregular rock: a sphere pushed around by ridged noise, then
     facetized so it catches light in flat planes like real stone. */
  rock(radius = 0.5, seed = 7, detail = 2) {
    const noise = new Noise(seed);
    const g = new Geometry();
    const rings = 14, sectors = 18;
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let s = 0; s <= sectors; s++) {
        const th = (s / sectors) * TAU;
        const nx = sp * Math.cos(th), ny = cp, nz = sp * Math.sin(th);
        const n = noise.fbm(nx * detail, ny * detail, nz * detail, 3);
        const rr = radius * (1 + n * 0.35);
        g.vert(nx * rr, ny * rr, nz * rr, nx, ny, nz, s / sectors * 2, r / rings);
      }
    }
    const row = sectors + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const a = r * row + s;
        if (r !== 0) g.tri(a, a + 1, a + row);
        if (r !== rings - 1) g.tri(a + 1, a + row + 1, a + row);
      }
    }
    return g.facetize().finalize();
  },

  /* A single grass blade: a tapered strip that bends along its length.
     Drawn thousands of times through instancing. */
  grassBlade(height = 0.5, width = 0.05, segments = 4) {
    const g = new Geometry();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = width * (1 - t * 0.9);
      const y = t * height;
      // Slight forward lean baked in so even still grass looks organic.
      const z = t * t * height * 0.15;
      g.vert(-w, y, z, 0, 0.3, -1, 0, t);
      g.vert(w, y, z, 0, 0.3, -1, 1, t);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      g.quad(a, a + 2, a + 3, a + 1);
    }
    return g.finalize();
  },
};

/* ---------------- Convex hull (quickhull) ---------------- */

/* Physics needs convex hulls for arbitrary shapes, and Voronoi fracture
   produces point clouds that must become renderable, collidable solids.
   This is an incremental quickhull with a conflict-free rebuild each
   iteration — simpler than the horizon-walk variant and fast enough for
   the few-hundred-point clouds fracture actually generates. */
function convexHull(points, epsilon = 1e-6) {
  const n = points.length;
  if (n < 4) return null;

  // Seed with a tetrahedron of maximal volume from extreme points.
  let minX = 0, maxX = 0;
  for (let i = 1; i < n; i++) {
    if (points[i].x < points[minX].x) minX = i;
    if (points[i].x > points[maxX].x) maxX = i;
  }
  if (minX === maxX) return null;
  const a = points[minX], b = points[maxX];
  const ab = new Vec3().subVectors(b, a);
  if (ab.lengthSq() < epsilon) return null;

  let ci = -1, bestD = epsilon;
  const tmp = new Vec3();
  for (let i = 0; i < n; i++) {
    tmp.subVectors(points[i], a).cross(ab);
    const d = tmp.length();
    if (d > bestD) { bestD = d; ci = i; }
  }
  if (ci < 0) return null;
  const c = points[ci];

  const normal = new Vec3().subVectors(b, a).cross(new Vec3().subVectors(c, a)).normalize();
  let di = -1; bestD = epsilon;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(new Vec3().subVectors(points[i], a).dot(normal));
    if (d > bestD) { bestD = d; di = i; }
  }
  if (di < 0) return null;
  const d0 = points[di];

  // Orient the seed tetra so every face normal points outward.
  let faces;
  if (new Vec3().subVectors(d0, a).dot(normal) > 0) {
    faces = [
      [minX, ci, maxX], [minX, maxX, di], [maxX, ci, di], [ci, minX, di],
    ];
  } else {
    faces = [
      [minX, maxX, ci], [minX, ci, di], [maxX, minX, di], [ci, maxX, di],
    ];
  }

  const faceNormal = (f) => {
    const p0 = points[f[0]], p1 = points[f[1]], p2 = points[f[2]];
    return new Vec3().subVectors(p1, p0).cross(new Vec3().subVectors(p2, p0));
  };

  const used = new Set([minX, maxX, ci, di]);

  for (let iter = 0; iter < n + 8; iter++) {
    // Find the point furthest outside any current face.
    let bestPt = -1, bestDist = epsilon;
    const normals = faces.map(faceNormal);
    const lens = normals.map((nv) => nv.length() || 1);
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue;
      for (let f = 0; f < faces.length; f++) {
        const dist = new Vec3().subVectors(points[i], points[faces[f][0]]).dot(normals[f]) / lens[f];
        if (dist > bestDist) { bestDist = dist; bestPt = i; }
      }
    }
    if (bestPt < 0) break;
    used.add(bestPt);

    // Remove all faces this point can see, then stitch the horizon to it.
    const visible = [];
    const keep = [];
    for (let f = 0; f < faces.length; f++) {
      const dist = new Vec3().subVectors(points[bestPt], points[faces[f][0]]).dot(normals[f]) / lens[f];
      if (dist > epsilon) visible.push(faces[f]); else keep.push(faces[f]);
    }
    if (!visible.length) break;

    // Horizon = edges belonging to exactly one visible face.
    const edgeCount = new Map();
    for (const f of visible) {
      for (let e = 0; e < 3; e++) {
        const u = f[e], v = f[(e + 1) % 3];
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        const rec = edgeCount.get(key);
        if (rec) rec.count++;
        else edgeCount.set(key, { count: 1, u, v });
      }
    }
    for (const rec of edgeCount.values()) {
      if (rec.count === 1) keep.push([rec.u, rec.v, bestPt]);
    }
    faces = keep;
    if (faces.length > 4000) break; // pathological input guard
  }

  // Re-orient every face outward from the hull centroid.
  const centroid = new Vec3();
  const uniq = new Set();
  for (const f of faces) for (const i of f) uniq.add(i);
  for (const i of uniq) centroid.add(points[i]);
  centroid.scale(1 / Math.max(1, uniq.size));

  const outIdx = [];
  for (const f of faces) {
    const nv = faceNormal(f);
    if (nv.lengthSq() < 1e-14) continue;
    const toFace = new Vec3().subVectors(points[f[0]], centroid);
    if (nv.dot(toFace) < 0) outIdx.push(f[0], f[2], f[1]);
    else outIdx.push(f[0], f[1], f[2]);
  }
  if (!outIdx.length) return null;

  return { points, indices: outIdx, centroid };
}

/* Turn a hull into a drawable Geometry with flat-shaded faces. */
function hullToGeometry(hull, uvScale = 1) {
  const g = new Geometry();
  const P = hull.points, I = hull.indices;
  for (let i = 0; i < I.length; i += 3) {
    const p0 = P[I[i]], p1 = P[I[i + 1]], p2 = P[I[i + 2]];
    const nv = new Vec3().subVectors(p1, p0).cross(new Vec3().subVectors(p2, p0)).normalize();
    // Project onto the dominant plane for stable, seam-free UVs.
    const ax = Math.abs(nv.x), ay = Math.abs(nv.y), az = Math.abs(nv.z);
    const uvOf = (p) => (ax > ay && ax > az) ? [p.z * uvScale, p.y * uvScale]
      : (ay > az) ? [p.x * uvScale, p.z * uvScale]
        : [p.x * uvScale, p.y * uvScale];
    const base = g.positions.length / 3;
    for (const p of [p0, p1, p2]) {
      const [u, v] = uvOf(p);
      g.vert(p.x, p.y, p.z, nv.x, nv.y, nv.z, u, v);
    }
    g.tri(base, base + 1, base + 2);
  }
  return g.finalize();
}

/* Volume and centroid of a closed triangle mesh via the divergence theorem.
   Fracture chunks need real masses or the debris floats or sinks wrongly. */
function meshVolume(points, indices) {
  let vol = 0;
  const cx = new Vec3();
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]], b = points[indices[i + 1]], c = points[indices[i + 2]];
    const v = (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
    vol += v;
    cx.x += (a.x + b.x + c.x) * 0.25 * v;
    cx.y += (a.y + b.y + c.y) * 0.25 * v;
    cx.z += (a.z + b.z + c.z) * 0.25 * v;
  }
  if (Math.abs(vol) > 1e-9) cx.scale(1 / vol);
  return { volume: Math.abs(vol), centroid: cx };
}
