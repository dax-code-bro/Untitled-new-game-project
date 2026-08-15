/* ============================================================
   PHYSICS SHAPES — spheres, convex polyhedra, planes.
   Boxes, hulls and fracture chunks all become the same convex
   representation, so there is one collision code path to get
   right instead of one per shape pair.
   ============================================================ */

const SHAPE = { SPHERE: 0, CONVEX: 1, PLANE: 2 };

class Shape {
  constructor(type) {
    this.type = type;
    this.radius = 0;
    this.vertices = null;   // Vec3[] in local space
    this.faces = null;      // [{ normal, offset, verts:[idx] }]
    this.edges = null;      // [{ a, b, dir }] unique directions only
    this.normal = null;     // planes
    this.offset = 0;        // planes
    this.boundRadius = 0;   // local bounding sphere, for broadphase
    this.volume = 1;
    this.localInertia = new Vec3(1, 1, 1); // diagonal, per unit mass
  }

  static sphere(radius = 0.5) {
    const s = new Shape(SHAPE.SPHERE);
    s.radius = radius;
    s.boundRadius = radius;
    s.volume = (4 / 3) * PI * radius * radius * radius;
    const i = 0.4 * radius * radius;
    s.localInertia.set(i, i, i);
    return s;
  }

  static plane(normal = [0, 1, 0], offset = 0) {
    const s = new Shape(SHAPE.PLANE);
    s.normal = Vec3.from(normal).normalize();
    s.offset = offset;
    s.boundRadius = Infinity;
    s.volume = Infinity;
    return s;
  }

  /* Boxes get their faces built exactly rather than going through the hull
     builder — no floating-point slop in the most common shape in any game. */
  static box(hx = 0.5, hy = 0.5, hz = 0.5) {
    const s = new Shape(SHAPE.CONVEX);
    s.vertices = [
      new Vec3(-hx, -hy, -hz), new Vec3(hx, -hy, -hz), new Vec3(hx, hy, -hz), new Vec3(-hx, hy, -hz),
      new Vec3(-hx, -hy, hz), new Vec3(hx, -hy, hz), new Vec3(hx, hy, hz), new Vec3(-hx, hy, hz),
    ];
    s.faces = [
      { normal: new Vec3(0, 0, 1), offset: hz, verts: [4, 5, 6, 7] },
      { normal: new Vec3(0, 0, -1), offset: hz, verts: [1, 0, 3, 2] },
      { normal: new Vec3(1, 0, 0), offset: hx, verts: [5, 1, 2, 6] },
      { normal: new Vec3(-1, 0, 0), offset: hx, verts: [0, 4, 7, 3] },
      { normal: new Vec3(0, 1, 0), offset: hy, verts: [7, 6, 2, 3] },
      { normal: new Vec3(0, -1, 0), offset: hy, verts: [0, 1, 5, 4] },
    ];
    // A box has only three unique edge directions.
    s.edges = [
      { a: 0, b: 1, dir: new Vec3(1, 0, 0) },
      { a: 1, b: 2, dir: new Vec3(0, 1, 0) },
      { a: 0, b: 4, dir: new Vec3(0, 0, 1) },
    ];
    s.boundRadius = Math.sqrt(hx * hx + hy * hy + hz * hz);
    s.volume = 8 * hx * hy * hz;
    s.localInertia.set(
      (hy * hy + hz * hz) / 3,
      (hx * hx + hz * hz) / 3,
      (hx * hx + hy * hy) / 3,
    );
    s.halfExtents = new Vec3(hx, hy, hz);
    return s;
  }

  static capsuleApprox(radius = 0.4, height = 1.6, segments = 8) {
    // The solver has no capsule primitive; an octagonal prism with rounded
    // ends approximates one closely enough for character collision and keeps
    // everything on the convex path.
    const pts = [];
    const hh = Math.max(0.01, height / 2 - radius);
    for (const y of [-hh, hh]) {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * TAU;
        pts.push(new Vec3(Math.cos(a) * radius, y, Math.sin(a) * radius));
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU;
      const r = radius * 0.55;
      pts.push(new Vec3(Math.cos(a) * r, hh + radius * 0.84, Math.sin(a) * r));
      pts.push(new Vec3(Math.cos(a) * r, -hh - radius * 0.84, Math.sin(a) * r));
    }
    const s = Shape.convex(pts);
    s.isCapsule = true;
    return s;
  }

  static cylinder(radius = 0.5, height = 1, segments = 12) {
    const pts = [];
    for (const y of [-height / 2, height / 2]) {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * TAU;
        pts.push(new Vec3(Math.cos(a) * radius, y, Math.sin(a) * radius));
      }
    }
    return Shape.convex(pts);
  }

  /* Build a convex shape from a point cloud: hull, then merge coplanar
     triangles into real polygon faces. The merge matters — clipping against
     12 triangle faces instead of 6 quad faces produces unstable manifolds
     and boxes that will not stack. */
  static convex(points) {
    const s = new Shape(SHAPE.CONVEX);
    const hull = convexHull(points);
    if (!hull) {
      // Degenerate cloud (coplanar or fewer than 4 points): fall back to a
      // box around it so the object still collides with something sane.
      const b = new Aabb();
      for (const p of points) b.expandPoint(p);
      const e = b.extents();
      const box = Shape.box(Math.max(e.x, 0.02), Math.max(e.y, 0.02), Math.max(e.z, 0.02));
      const c = b.center();
      for (const v of box.vertices) v.add(c);
      for (const f of box.faces) f.offset += f.normal.dot(c);
      box.centerOffset = c;
      return box;
    }

    // Keep only vertices the hull actually references, remapped densely.
    const remap = new Map();
    const verts = [];
    const tris = [];
    for (let i = 0; i < hull.indices.length; i += 3) {
      const t = [];
      for (let k = 0; k < 3; k++) {
        const oi = hull.indices[i + k];
        let ni = remap.get(oi);
        if (ni === undefined) {
          ni = verts.length;
          remap.set(oi, ni);
          verts.push(hull.points[oi].clone());
        }
        t.push(ni);
      }
      tris.push(t);
    }
    s.vertices = verts;
    s.faces = mergeCoplanarFaces(verts, tris);
    s.edges = uniqueEdgeDirections(verts, s.faces);

    let br = 0;
    for (const v of verts) br = Math.max(br, v.length());
    s.boundRadius = br;

    const vc = meshVolume(verts, hull.indices.map((i) => remap.get(i)));
    s.volume = Math.max(vc.volume, 1e-6);
    s.centroid = vc.centroid;

    // Inertia via the tight AABB, scaled toward the true volume. Exact
    // polyhedral inertia is overkill for debris that lives for two seconds.
    const b = new Aabb();
    for (const v of verts) b.expandPoint(v);
    const e = b.extents();
    const boxVol = Math.max(8 * e.x * e.y * e.z, 1e-9);
    const k = clamp(s.volume / boxVol, 0.35, 1);
    s.localInertia.set(
      k * (e.y * e.y + e.z * e.z) / 3,
      k * (e.x * e.x + e.z * e.z) / 3,
      k * (e.x * e.x + e.y * e.y) / 3,
    );
    return s;
  }

  /* Furthest point along a local-space direction. */
  supportLocal(dir, out = new Vec3()) {
    if (this.type === SHAPE.SPHERE) return out.copy(dir).normalize().scale(this.radius);
    let best = -Infinity, bi = 0;
    const V = this.vertices;
    for (let i = 0; i < V.length; i++) {
      const d = V[i].dot(dir);
      if (d > best) { best = d; bi = i; }
    }
    return out.copy(V[bi]);
  }
}

/* Group hull triangles that share a plane, then walk each group's boundary
   into an ordered polygon. */
function mergeCoplanarFaces(verts, tris, angleEps = 0.999, distEps = 1e-4) {
  const triNormals = tris.map((t) => {
    const a = verts[t[0]], b = verts[t[1]], c = verts[t[2]];
    return new Vec3().subVectors(b, a).cross(new Vec3().subVectors(c, a)).normalize();
  });
  const triOffsets = tris.map((t, i) => triNormals[i].dot(verts[t[0]]));

  const used = new Array(tris.length).fill(false);
  const faces = [];

  for (let i = 0; i < tris.length; i++) {
    if (used[i]) continue;
    const group = [i];
    used[i] = true;
    const n = triNormals[i], off = triOffsets[i];
    for (let j = i + 1; j < tris.length; j++) {
      if (used[j]) continue;
      if (triNormals[j].dot(n) > angleEps && Math.abs(triOffsets[j] - off) < distEps) {
        used[j] = true;
        group.push(j);
      }
    }

    // Boundary edges appear exactly once across the group.
    const edgeUse = new Map();
    for (const gi of group) {
      const t = tris[gi];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const fwd = `${a},${b}`, rev = `${b},${a}`;
        if (edgeUse.has(rev)) edgeUse.delete(rev);
        else edgeUse.set(fwd, [a, b]);
      }
    }
    if (edgeUse.size < 3) continue;

    // Walk the directed boundary edges into a loop.
    const next = new Map();
    for (const [a, b] of edgeUse.values()) next.set(a, b);
    const start = edgeUse.values().next().value[0];
    const loop = [start];
    let cur = next.get(start);
    let guard = 0;
    while (cur !== undefined && cur !== start && guard++ < 256) {
      loop.push(cur);
      cur = next.get(cur);
    }
    // An unclosed walk means non-manifold input; drop this face rather than
    // feeding a broken polygon to the clipper.
    if (cur !== start || loop.length < 3) continue;

    faces.push({ normal: n.clone(), offset: off, verts: loop });
  }

  if (!faces.length) {
    // Nothing merged cleanly — fall back to raw triangles so the shape is
    // still usable, just with a poorer manifold.
    for (let i = 0; i < tris.length; i++) {
      faces.push({ normal: triNormals[i].clone(), offset: triOffsets[i], verts: tris[i].slice() });
    }
  }
  return faces;
}

/* SAT only needs one representative per unique edge direction; a cube has
   3, not 12, and skipping the duplicates is a big constant-factor win. */
function uniqueEdgeDirections(verts, faces, eps = 0.999) {
  const dirs = [];
  const seen = [];
  for (const f of faces) {
    const L = f.verts.length;
    for (let i = 0; i < L; i++) {
      const a = f.verts[i], b = f.verts[(i + 1) % L];
      const dir = new Vec3().subVectors(verts[b], verts[a]);
      const len = dir.length();
      if (len < 1e-7) continue;
      dir.scale(1 / len);
      let dup = false;
      for (const s of seen) {
        if (Math.abs(s.dot(dir)) > eps) { dup = true; break; }
      }
      if (dup) continue;
      seen.push(dir);
      dirs.push({ a, b, dir });
      if (dirs.length > 64) return dirs; // guard on pathological hulls
    }
  }
  return dirs;
}
