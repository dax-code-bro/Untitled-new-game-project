/* ============================================================
   NARROWPHASE — separating-axis tests and contact manifolds.
   Produces up to 4 contact points per pair with a shared normal,
   which is what a sequential-impulse solver needs to make stacks
   stand still instead of vibrating.
   ============================================================ */

class Contact {
  constructor() {
    this.point = new Vec3();
    this.normal = new Vec3();   // points from A toward B
    this.depth = 0;
    this.normalImpulse = 0;
    this.tangentImpulse = [0, 0];
    this.id = 0;                // feature id, for warm-start matching
  }
}

/* Manifolds are pooled: collision runs every frame for every pair, and
   allocating fresh contact objects each time is a measurable GC cost. */
class ManifoldPool {
  constructor() { this.pool = []; this.used = 0; }
  reset() { this.used = 0; }
  get() {
    if (this.used < this.pool.length) return this.pool[this.used++];
    const c = new Contact();
    this.pool.push(c);
    this.used++;
    return c;
  }
}

const _cp = {
  v: [], q: new Quat(),
};
for (let i = 0; i < 24; i++) _cp.v.push(new Vec3());

function localToWorld(body, local, out) {
  return out.copy(local).applyQuat(body.quaternion).add(body.position);
}
function worldToLocal(body, world, out) {
  return out.copy(world).sub(body.position).applyQuatInv(body.quaternion);
}
function dirToWorld(body, local, out) {
  return out.copy(local).applyQuat(body.quaternion);
}
function dirToLocal(body, world, out) {
  return out.copy(world).applyQuatInv(body.quaternion);
}

/* Support point of a body along a world-space direction. */
function supportWorld(body, worldDir, out) {
  const ld = dirToLocal(body, worldDir, _cp.v[20]);
  body.shape.supportLocal(ld, out);
  return out.applyQuat(body.quaternion).add(body.position);
}

/* World-space vertex cache, refreshed once per body per step.

   SAT evaluates ~40 support mappings per pair. Rotating every vertex by the
   body quaternion inside each of those was the single largest cost in the
   whole step; hoisting the transform out makes each axis test a plain dot
   product loop. */
function ensureWorldVerts(body, stamp) {
  const V = body.shape.vertices;
  if (!V) return null;
  if (body._wvStamp === stamp && body._worldVerts && body._worldVerts.length === V.length) {
    return body._worldVerts;
  }
  let W = body._worldVerts;
  if (!W || W.length !== V.length) {
    W = new Array(V.length);
    for (let i = 0; i < V.length; i++) W[i] = new Vec3();
    body._worldVerts = W;
  }
  const q = body.quaternion, p = body.position;
  for (let i = 0; i < V.length; i++) W[i].copy(V[i]).applyQuat(q).add(p);
  body._wvStamp = stamp;
  return W;
}

/* Separation of B from A along a world axis oriented from A toward B.
   Positive means the axis separates them.

   Only the extreme *projections* matter, never the extreme points, so this
   returns a scalar and skips building support points entirely. */
function axisSeparationCached(axis, WA, WB) {
  const ax = axis.x, ay = axis.y, az = axis.z;
  let maxA = -Infinity;
  for (let i = 0; i < WA.length; i++) {
    const v = WA[i];
    const d = v.x * ax + v.y * ay + v.z * az;
    if (d > maxA) maxA = d;
  }
  let minB = Infinity;
  for (let i = 0; i < WB.length; i++) {
    const v = WB[i];
    const d = v.x * ax + v.y * ay + v.z * az;
    if (d < minB) minB = d;
  }
  return minB - maxA;
}

/* ---------------- closest point helpers ---------------- */

function closestPointOnSegment(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  if (denom < 1e-12) return out.copy(a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / denom;
  t = clamp(t, 0, 1);
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}

/* Closest point on a convex polygon (given in local space, planar). */
function closestPointOnPolygon(p, verts, indices, normal, offset, out) {
  // Project onto the plane first.
  const d = p.dot(normal) - offset;
  const proj = _cp.v[0].copy(p).addScaled(normal, -d);

  // Inside test: the projection must be on the inner side of every edge.
  let inside = true;
  const L = indices.length;
  for (let i = 0; i < L; i++) {
    const a = verts[indices[i]], b = verts[indices[(i + 1) % L]];
    const edge = _cp.v[1].subVectors(b, a);
    const toP = _cp.v[2].subVectors(proj, a);
    const cross = _cp.v[3].crossVectors(edge, toP);
    if (cross.dot(normal) < 0) { inside = false; break; }
  }
  if (inside) { out.copy(proj); return Math.abs(d); }

  // Otherwise the closest point lies on one of the boundary edges.
  let bestD = Infinity;
  const cand = _cp.v[4];
  for (let i = 0; i < L; i++) {
    const a = verts[indices[i]], b = verts[indices[(i + 1) % L]];
    closestPointOnSegment(p, a, b, cand);
    const dist = cand.distanceToSq(p);
    if (dist < bestD) { bestD = dist; out.copy(cand); }
  }
  return Math.sqrt(bestD);
}

/* Closest points between two segments — the contact for an edge-edge case. */
function closestPointsSegments(p1, q1, p2, q2, c1, c2) {
  const d1 = _cp.v[5].subVectors(q1, p1);
  const d2 = _cp.v[6].subVectors(q2, p2);
  const r = _cp.v[7].subVectors(p1, p2);
  const a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) { c1.copy(p1); c2.copy(p2); return; }
  if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      // Parallel segments: any point works, so pin s and solve for t.
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  c1.copy(p1).addScaled(d1, s);
  c2.copy(p2).addScaled(d2, t);
}

/* ---------------- sphere pairs ---------------- */

function collideSphereSphere(a, b, out, pool) {
  const ra = a.shape.radius, rb = b.shape.radius;
  const n = _cp.v[8].subVectors(b.position, a.position);
  const dist = n.length();
  const sum = ra + rb;
  if (dist >= sum) return 0;
  if (dist < 1e-8) n.set(0, 1, 0); else n.scale(1 / dist);
  const c = pool.get();
  c.normal.copy(n);
  c.depth = sum - dist;
  c.point.copy(a.position).addScaled(n, ra - c.depth * 0.5);
  c.id = 0;
  out.push(c);
  return 1;
}

function collideSpherePlane(sphere, plane, out, pool, flip) {
  // `plane` is a static infinite half-space.
  const n = dirToWorld(plane, plane.shape.normal, _cp.v[8]);
  const offset = plane.shape.offset + n.dot(plane.position);
  const d = n.dot(sphere.position) - offset;
  const r = sphere.shape.radius;
  if (d >= r) return 0;
  const c = pool.get();
  // Normal must point from A to B; caller tells us which one the plane is.
  c.normal.copy(n);
  if (flip) c.normal.negate();
  c.depth = r - d;
  c.point.copy(sphere.position).addScaled(n, -r);
  c.id = 0;
  out.push(c);
  return 1;
}

function collideConvexPlane(convex, plane, out, pool, flip, stamp) {
  const n = dirToWorld(plane, plane.shape.normal, _cp.v[8]);
  const offset = plane.shape.offset + n.dot(plane.position);
  const V = ensureWorldVerts(convex, stamp);
  if (!V) return 0;
  // Keep the four deepest vertices — more than that adds no stability and
  // costs solver time.
  const found = [];
  for (let i = 0; i < V.length; i++) {
    const wp = V[i];
    const d = n.dot(wp) - offset;
    if (d < 0) found.push({ d, x: wp.x, y: wp.y, z: wp.z, i });
  }
  if (!found.length) return 0;
  found.sort((p, q) => p.d - q.d);
  const n2 = Math.min(4, found.length);
  for (let k = 0; k < n2; k++) {
    const f = found[k];
    const c = pool.get();
    c.normal.copy(n);
    if (!flip) c.normal.negate();  // A is the convex: normal points A→B = toward plane
    c.depth = -f.d;
    c.point.set(f.x, f.y, f.z);
    c.id = f.i;
    out.push(c);
  }
  return n2;
}

function collideSphereConvex(sphere, convex, out, pool, flip) {
  // Work in the convex's local space so the polygon data needs no transform.
  const cLocal = worldToLocal(convex, sphere.position, _cp.v[10]);
  const shape = convex.shape;
  const V = shape.vertices;

  let maxDist = -Infinity, maxFace = null;
  for (const f of shape.faces) {
    const d = cLocal.dot(f.normal) - f.offset;
    if (d > maxDist) { maxDist = d; maxFace = f; }
  }
  const r = sphere.shape.radius;
  if (maxDist > r) return 0;

  const closest = _cp.v[11];
  let normalLocal = _cp.v[12];
  let depth;

  if (maxDist <= 0) {
    // Centre is inside the hull: push out along the least-penetrating face.
    normalLocal.copy(maxFace.normal);
    depth = r - maxDist;
    closest.copy(cLocal).addScaled(normalLocal, -maxDist);
  } else {
    // Outside: the true closest point lies on some face polygon. Checking
    // every face is exact for a convex hull and cheap at these face counts.
    let bestDist = Infinity;
    const cand = _cp.v[13];
    for (const f of shape.faces) {
      if (cLocal.dot(f.normal) - f.offset < -1e-4) continue;
      const d = closestPointOnPolygon(cLocal, V, f.verts, f.normal, f.offset, cand);
      const real = cand.distanceTo(cLocal);
      if (real < bestDist) { bestDist = real; closest.copy(cand); }
    }
    if (bestDist > r) return 0;
    normalLocal.subVectors(cLocal, closest);
    const l = normalLocal.length();
    if (l < 1e-7) normalLocal.copy(maxFace.normal);
    else normalLocal.scale(1 / l);
    depth = r - bestDist;
  }

  const c = pool.get();
  const nWorld = dirToWorld(convex, normalLocal, _cp.v[14]);
  // nWorld points from the convex toward the sphere.
  c.normal.copy(nWorld);
  if (!flip) c.normal.negate(); // A is the sphere → normal must point sphere→convex
  c.depth = depth;
  localToWorld(convex, closest, c.point);
  c.id = 0;
  out.push(c);
  return 1;
}

/* ---------------- convex vs convex ---------------- */

const _faceQueryA = { index: -1, separation: 0 };
const _faceQueryB = { index: -1, separation: 0 };

function queryFaceDirections(bodyA, bodyB, WB, result) {
  const faces = bodyA.shape.faces;
  let best = -Infinity, bestIdx = -1;
  const axis = _cp.v[15];
  const pos = bodyA.position;
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    dirToWorld(bodyA, f.normal, axis);
    // A's own extreme along its own face normal is exactly the face plane,
    // so it needs no support search: rotation preserves the dot product,
    // leaving offset + n·position.
    const maxA = f.offset + axis.x * pos.x + axis.y * pos.y + axis.z * pos.z;
    let minB = Infinity;
    for (let k = 0; k < WB.length; k++) {
      const v = WB[k];
      const d = v.x * axis.x + v.y * axis.y + v.z * axis.z;
      if (d < minB) minB = d;
    }
    const sep = minB - maxA;
    if (sep > best) { best = sep; bestIdx = i; }
    if (best > 0) break; // early out: found a separating axis
  }
  result.index = bestIdx;
  result.separation = best;
  return result;
}

const _edgeQuery = { separation: 0, axis: new Vec3(), ea: -1, eb: -1 };

function queryEdgeDirections(bodyA, bodyB, WA, WB, result) {
  const EA = bodyA.shape.edges, EB = bodyB.shape.edges;
  let best = -Infinity;
  result.ea = -1; result.eb = -1;
  const dA = _cp.v[16], dB = _cp.v[17], axis = _cp.v[18], toB = _cp.v[19];
  toB.subVectors(bodyB.position, bodyA.position);
  for (let i = 0; i < EA.length; i++) {
    dirToWorld(bodyA, EA[i].dir, dA);
    for (let j = 0; j < EB.length; j++) {
      dirToWorld(bodyB, EB[j].dir, dB);
      axis.crossVectors(dA, dB);
      const len2 = axis.lengthSq();
      // Near-parallel edges give a degenerate axis already covered by the
      // face tests, so skipping them avoids amplifying numerical noise.
      if (len2 < 1e-8) continue;
      axis.scale(1 / Math.sqrt(len2));
      if (axis.dot(toB) < 0) axis.negate();
      const sep = axisSeparationCached(axis, WA, WB);
      if (sep > best) {
        best = sep;
        result.axis.copy(axis);
        result.ea = i; result.eb = j;
      }
      if (best > 0) { result.separation = best; return result; }
    }
  }
  result.separation = best;
  return result;
}

/* Sutherland-Hodgman clip of a polygon against a plane, keeping the side
   where dot(n, p) - offset <= 0. */
function clipPolygonToPlane(poly, count, normal, offset, out) {
  let n = 0;
  for (let i = 0; i < count; i++) {
    const a = poly[i], b = poly[(i + 1) % count];
    const da = normal.dot(a) - offset;
    const db = normal.dot(b) - offset;
    if (da <= 0) {
      out[n++].copy(a);
    }
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out[n++].copy(a).lerp(b, t);
    }
    if (n >= out.length - 1) break;
  }
  return n;
}

const _clipA = [], _clipB = [], _refPoly = [], _incPoly = [];
for (let i = 0; i < 32; i++) {
  _clipA.push(new Vec3()); _clipB.push(new Vec3());
  _refPoly.push(new Vec3()); _incPoly.push(new Vec3());
}

function collideConvexConvex(bodyA, bodyB, out, pool, stamp) {
  // Bounding-sphere reject before any axis work. The broadphase AABB test is
  // looser than this, so a real fraction of pairs die here for two dots.
  const sumR = bodyA.shape.boundRadius + bodyB.shape.boundRadius;
  if (bodyA.position.distanceToSq(bodyB.position) > sumR * sumR) return 0;

  const WA = ensureWorldVerts(bodyA, stamp);
  const WB = ensureWorldVerts(bodyB, stamp);
  if (!WA || !WB) return 0;

  const fa = queryFaceDirections(bodyA, bodyB, WB, _faceQueryA);
  if (fa.separation > 0) return 0;
  const fb = queryFaceDirections(bodyB, bodyA, WA, _faceQueryB);
  if (fb.separation > 0) return 0;
  const eq = queryEdgeDirections(bodyA, bodyB, WA, WB, _edgeQuery);
  if (eq.separation > 0) return 0;

  // Bias toward face contacts: they give multi-point manifolds, and without
  // the bias a near-tie flickers between face and edge, which visibly
  // destabilises resting stacks.
  const faceBias = 0.008;
  const edgeBias = 0.002;
  let useEdge = eq.ea >= 0 && eq.separation > Math.max(fa.separation, fb.separation) + faceBias + edgeBias;

  if (useEdge) {
    // Single contact at the closest points of the two edges.
    const ea = bodyA.shape.edges[eq.ea], eb = bodyB.shape.edges[eq.eb];
    const p1 = WA[ea.a], q1 = WA[ea.b];
    const p2 = WB[eb.a], q2 = WB[eb.b];
    const c1 = _clipA[4], c2 = _clipA[5];
    closestPointsSegments(p1, q1, p2, q2, c1, c2);
    const c = pool.get();
    c.normal.copy(eq.axis);
    c.depth = -eq.separation;
    c.point.copy(c1).lerp(c2, 0.5);
    c.id = 1000 + eq.ea * 64 + eq.eb;
    out.push(c);
    return 1;
  }

  // Face contact. The body with the larger (less negative) separation owns
  // the reference face.
  let refBody, incBody, refFaceIdx, flipNormal, refW, incW;
  if (fa.separation >= fb.separation - faceBias) {
    refBody = bodyA; incBody = bodyB; refFaceIdx = fa.index; flipNormal = false;
    refW = WA; incW = WB;
  } else {
    refBody = bodyB; incBody = bodyA; refFaceIdx = fb.index; flipNormal = true;
    refW = WB; incW = WA;
  }

  const refFace = refBody.shape.faces[refFaceIdx];
  const refNormal = dirToWorld(refBody, refFace.normal, _cp.v[15]);

  // Incident face: the one on the other body pointing most opposite.
  let incFace = null, minDot = Infinity;
  const tmpN = _cp.v[16];
  for (const f of incBody.shape.faces) {
    dirToWorld(incBody, f.normal, tmpN);
    const d = tmpN.dot(refNormal);
    if (d < minDot) { minDot = d; incFace = f; }
  }
  if (!incFace) return 0;

  // Both polygons into world space.
  const refCount = Math.min(refFace.verts.length, _refPoly.length);
  for (let i = 0; i < refCount; i++) _refPoly[i].copy(refW[refFace.verts[i]]);
  const incCount = Math.min(incFace.verts.length, _incPoly.length);
  for (let i = 0; i < incCount; i++) _incPoly[i].copy(incW[incFace.verts[i]]);

  // Clip the incident polygon against every side plane of the reference
  // face, ping-ponging between two scratch buffers so src and dst are never
  // the same array.
  let src = _incPoly, count = incCount, dst = _clipA;
  const sideNormal = _cp.v[17];
  for (let i = 0; i < refCount; i++) {
    const a = _refPoly[i], b = _refPoly[(i + 1) % refCount];
    const edge = _cp.v[18].subVectors(b, a);
    if (edge.lengthSq() < 1e-12) continue;
    // Outward side-plane normal: perpendicular to both the face normal and
    // this edge.
    sideNormal.crossVectors(edge, refNormal).normalize();
    const offset = sideNormal.dot(a);
    count = clipPolygonToPlane(src, count, sideNormal, offset, dst);
    if (count === 0) return 0;
    src = dst;
    dst = (dst === _clipA) ? _clipB : _clipA;
  }

  const refOffset = refNormal.dot(_refPoly[0]);
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const p = src[i];
    const sep = refNormal.dot(p) - refOffset;
    if (sep <= 0.002) candidates.push({ p, sep });
  }
  if (!candidates.length) return 0;

  // Keep the four deepest points, which is enough to fix all six degrees of
  // freedom for a resting face contact.
  candidates.sort((x, y) => x.sep - y.sep);
  const keep = Math.min(4, candidates.length);
  for (let i = 0; i < keep; i++) {
    const c = pool.get();
    c.normal.copy(refNormal);
    if (flipNormal) c.normal.negate();
    c.depth = -candidates[i].sep;
    c.point.copy(candidates[i].p);
    c.id = refFaceIdx * 32 + i;
    out.push(c);
  }
  return keep;
}

/* ---------------- dispatch ---------------- */

/* Returns contacts with `normal` pointing from bodyA to bodyB. */
function collide(bodyA, bodyB, out, pool, stamp = 0) {
  const ta = bodyA.shape.type, tb = bodyB.shape.type;

  if (ta === SHAPE.SPHERE && tb === SHAPE.SPHERE) return collideSphereSphere(bodyA, bodyB, out, pool);

  if (ta === SHAPE.PLANE && tb === SHAPE.SPHERE) return collideSpherePlane(bodyB, bodyA, out, pool, false);
  if (ta === SHAPE.SPHERE && tb === SHAPE.PLANE) return collideSpherePlane(bodyA, bodyB, out, pool, true);

  if (ta === SHAPE.PLANE && tb === SHAPE.CONVEX) return collideConvexPlane(bodyB, bodyA, out, pool, true, stamp);
  if (ta === SHAPE.CONVEX && tb === SHAPE.PLANE) return collideConvexPlane(bodyA, bodyB, out, pool, false, stamp);

  if (ta === SHAPE.SPHERE && tb === SHAPE.CONVEX) return collideSphereConvex(bodyA, bodyB, out, pool, false);
  if (ta === SHAPE.CONVEX && tb === SHAPE.SPHERE) return collideSphereConvex(bodyB, bodyA, out, pool, true);

  if (ta === SHAPE.CONVEX && tb === SHAPE.CONVEX) return collideConvexConvex(bodyA, bodyB, out, pool, stamp);

  return 0; // plane-plane: two static half-spaces never need contacts
}

/* ---------------- raycasting ---------------- */

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

/* Slab method generalised to a convex polyhedron's face planes. */
function rayConvex(originLocal, dirLocal, shape, outNormal) {
  let tEnter = 0, tExit = Infinity;
  let enterFace = null;
  for (const f of shape.faces) {
    const denom = f.normal.dot(dirLocal);
    const dist = f.offset - f.normal.dot(originLocal);
    if (Math.abs(denom) < 1e-9) {
      // Parallel to this plane: a miss only if the origin is outside it.
      if (dist < 0) return -1;
      continue;
    }
    const t = dist / denom;
    if (denom < 0) {
      if (t > tEnter) { tEnter = t; enterFace = f; }
    } else if (t < tExit) {
      tExit = t;
    }
    if (tEnter > tExit) return -1;
  }
  if (enterFace && outNormal) outNormal.copy(enterFace.normal);
  return enterFace ? tEnter : -1;
}
