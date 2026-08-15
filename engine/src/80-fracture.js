/* ============================================================
   FRACTURE — 3D Voronoi shattering with stress accumulation.

   An object is pre-fractured the moment it is created: the chunk
   set is computed once and kept dormant. On a hard enough impact
   the whole shape is swapped for its chunks, each inheriting the
   parent's motion plus a kick away from the impact point.
   Pre-computing is what makes destruction instant instead of a
   frame-long hitch at the worst possible moment.
   ============================================================ */

/* Clip a convex polytope by a half-space, keeping the side where
   dot(n, p) <= offset.

   The cut points must come from the polytope's *edges*, not from every pair
   of vertices. Using all pairs adds O(inside x outside) points per cut, so
   the vertex count multiplies with every one of the N-1 bisector planes and
   a 12-piece fracture balloons into tens of thousands of points. Walking
   real edges keeps each cell at its true vertex count.

   Returns null when the plane removes nothing (a very common case worth
   detecting, since it skips the hull rebuild entirely) and an empty array
   when it removes everything. */
function clipConvexByPlane(verts, faces, normal, offset) {
  const n = verts.length;
  const d = new Float64Array(n);
  let anyOutside = false, anyInside = false;
  for (let i = 0; i < n; i++) {
    d[i] = verts[i].dot(normal) - offset;
    if (d[i] > 1e-9) anyOutside = true; else anyInside = true;
  }
  if (!anyOutside) return null;    // nothing cut away
  if (!anyInside) return [];       // cell fully removed

  const kept = [];
  for (let i = 0; i < n; i++) if (d[i] <= 1e-9) kept.push(verts[i]);

  // Each undirected edge contributes at most one crossing point.
  const seen = new Set();
  for (const f of faces) {
    const L = f.verts.length;
    for (let i = 0; i < L; i++) {
      const a = f.verts[i], b = f.verts[(i + 1) % L];
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      const da = d[a], db = d[b];
      if ((da > 1e-9) === (db > 1e-9)) continue;
      const t = da / (da - db);
      if (!Number.isFinite(t) || t < 0 || t > 1) continue;
      kept.push(new Vec3(
        verts[a].x + (verts[b].x - verts[a].x) * t,
        verts[a].y + (verts[b].y - verts[a].y) * t,
        verts[a].z + (verts[b].z - verts[a].z) * t,
      ));
    }
  }
  return kept;
}

class Fracture {
  /* Build a Voronoi decomposition of a box-shaped volume.

     `pattern` shapes where the sites go, and it matters more than the count:
     - 'uniform'  evenly scattered, for glass and generic rubble
     - 'radial'   clustered near a focus, for impact craters
     - 'slab'     layered, for concrete and masonry that breaks in courses
     - 'splinter' elongated along one axis, for wood */
  static shatterBox(halfExtents, opts = {}) {
    const count = clamp(opts.pieces || 12, 2, 96);
    const rng = new Rng(opts.seed || 12345);
    const pattern = opts.pattern || 'uniform';
    const focus = opts.focus ? Vec3.from(opts.focus) : null;
    const hx = halfExtents.x, hy = halfExtents.y, hz = halfExtents.z;

    /* --- site placement --- */
    const sites = [];
    for (let i = 0; i < count; i++) {
      let p;
      if (pattern === 'radial' && focus) {
        // Bias toward the impact: cube of a uniform gives dense centre,
        // sparse edges, which is what a real impact crater looks like.
        const t = Math.pow(rng.next(), 2.2);
        const dir = rng.unitVec3();
        p = new Vec3(
          clamp(focus.x + dir.x * t * hx * 2.4, -hx, hx),
          clamp(focus.y + dir.y * t * hy * 2.4, -hy, hy),
          clamp(focus.z + dir.z * t * hz * 2.4, -hz, hz),
        );
      } else if (pattern === 'slab') {
        // Layers in Y with jitter inside each layer.
        const layers = Math.max(2, Math.round(Math.cbrt(count)));
        const layer = i % layers;
        const y = -hy + (layer + 0.5) * (2 * hy / layers) + rng.range(-0.18, 0.18) * (2 * hy / layers);
        p = new Vec3(rng.range(-hx, hx), clamp(y, -hy, hy), rng.range(-hz, hz));
      } else if (pattern === 'splinter') {
        // Tight in X and Z, spread along Y: long shards.
        p = new Vec3(rng.range(-hx, hx), rng.range(-hy, hy) * 0.35, rng.range(-hz, hz));
      } else {
        p = new Vec3(rng.range(-hx, hx), rng.range(-hy, hy), rng.range(-hz, hz));
      }
      sites.push(p);
    }

    /* --- build each cell by half-space intersection --- */
    const boxShape = Shape.box(hx, hy, hz);

    const chunks = [];
    const normal = new Vec3();
    for (let i = 0; i < sites.length; i++) {
      let verts = boxShape.vertices.map((v) => v.clone());
      let faces = boxShape.faces;
      let empty = false;

      for (let j = 0; j < sites.length; j++) {
        if (i === j) continue;
        normal.subVectors(sites[j], sites[i]);
        const len = normal.length();
        if (len < 1e-6) continue;
        normal.scale(1 / len);
        // Bisector: the plane midway between the two sites.
        const mid = (sites[i].dot(normal) + sites[j].dot(normal)) * 0.5;

        const clipped = clipConvexByPlane(verts, faces, normal, mid);
        if (clipped === null) continue;          // plane misses this cell
        if (clipped.length < 4) { empty = true; break; }

        // Rebuild so the next cut has real faces and edges to work from.
        const rebuilt = Shape.convex(clipped);
        if (!rebuilt || !rebuilt.vertices || rebuilt.vertices.length < 4) { empty = true; break; }
        verts = rebuilt.vertices;
        faces = rebuilt.faces;
      }
      if (empty || verts.length < 4) continue;

      const shape = Shape.convex(verts);
      if (!shape || !shape.vertices || shape.volume < 1e-7) continue;

      // Cells come out in the parent's local frame; re-centre each one so
      // its body origin sits at its centre of mass.
      const centroid = shape.centroid ? shape.centroid.clone() : new Vec3();
      const local = shape.vertices.map((v) => new Vec3().subVectors(v, centroid));
      const centred = Shape.convex(local);
      if (!centred || centred.volume < 1e-7) continue;

      chunks.push({ shape: centred, offset: centroid, volume: centred.volume, site: sites[i] });
    }

    return chunks;
  }

  /* Fracture a sphere-ish or arbitrary object by shattering its bounding
     box and discarding cells whose centre falls outside the original
     radius — good enough for rocks, barrels and pots. */
  static shatterRadial(radius, opts = {}) {
    const half = new Vec3(radius, radius, radius);
    const all = Fracture.shatterBox(half, opts);
    return all.filter((c) => c.offset.length() <= radius * 1.02);
  }
}

/* ---------------- runtime destruction manager ---------------- */

/* Tracks which actors are breakable, accumulates damage from contact
   impulses, and performs the swap when a threshold is crossed. */
class Destructible {
  constructor(actor, opts = {}) {
    this.actor = actor;
    this.health = opts.health != null ? opts.health : 1;
    this.maxHealth = this.health;
    // Impulse below this never registers, so a resting stack does not
    // slowly grind itself to dust under its own weight.
    this.threshold = opts.threshold != null ? opts.threshold : 900;
    this.pieces = opts.pieces || 10;
    this.pattern = opts.pattern || 'uniform';
    this.seed = opts.seed || 1;
    this.generation = opts.generation || 0;
    this.maxGeneration = opts.maxGeneration != null ? opts.maxGeneration : 1;
    this.chunkLifetime = opts.chunkLifetime != null ? opts.chunkLifetime : 14;
    this.spawnDust = opts.dust !== false;
    this.onBreak = opts.onBreak || null;
    this.broken = false;
    this.cached = null;
  }

  /* Impulse in, damage out. Returns true if this hit broke the object. */
  damage(impulse, point) {
    if (this.broken) return false;
    if (impulse < this.threshold) return false;
    // Normalise so `health: 1` means "breaks on one solid hit".
    this.health -= (impulse - this.threshold) / (this.threshold * 4);
    if (this.health > 0) return false;
    this.broken = true;
    this.breakPoint = point ? point.clone() : null;
    return true;
  }
}
