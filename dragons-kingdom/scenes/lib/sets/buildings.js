// Stone buildings for sets: halls, stables, towers, walls - weathered pale
// stone (CC0 photo-scanned brick/block sets, projected in world space) under
// stone-slate roofs (a procedural slate shader: staggered courses, per-slate
// tint, lichen and moss), with real door openings and deep window reveals so
// the walls have thickness and cast proper shadows.
//
//   const kit = await buildingKit(ctx);
//   const hall = kit.hall({ w: 24, d: 11, h: 7, pitch: 0.75, door: { w: 4.2, h: 4.8 }, windows: 3 });
//   hall.position.set(x, y, z); hall.rotation.y = yaw; scene.add(hall);
import * as THREE from 'three';
import { worldMaterial, GLSL_NOISE } from './materials.js';

export function slateMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(opts.color || [0.11, 0.105, 0.1])), roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  const U = { dkCourse: { value: opts.course ?? 0.22 }, dkSlateW: { value: opts.slateWidth ?? 0.32 }, dkLichen: { value: opts.lichen ?? 0.5 }, dkMossLow: { value: opts.moss ?? 0.3 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRoofUv; varying vec3 vRW;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoofUv = uv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vRoofUv; varying vec3 vRW; uniform float dkCourse, dkSlateW, dkLichen, dkMossLow;
${GLSL_NOISE}
float dkSlH, dkSlR; vec3 dkSlC;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // uv: x along the ridge (m), y down the slope from the ridge (m)
  float row = floor(vRoofUv.y / dkCourse);
  float fy = fract(vRoofUv.y / dkCourse);
  float off = dkH21(vec2(row, 3.1)) * dkSlateW;
  float u = (vRoofUv.x + off + mod(row, 2.0) * dkSlateW * 0.5) / dkSlateW;
  float col = floor(u), fx = fract(u);
  float id = dkH21(vec2(col, row));
  float wJit = 0.04 + 0.05 * dkH21(vec2(col + 7.0, row));
  float gap = smoothstep(0.0, wJit, fx) * smoothstep(1.0, 1.0 - wJit, fx);
  // pixel footprint in slates/courses: fade the per-slate pattern to its average before it
  // gets smaller than a pixel (otherwise long roofs alias into moire lines and stipple)
  float fwS = max(fwidth(vRoofUv.y / dkCourse), fwidth(vRoofUv.x / dkSlateW));
  float aa = 1.0 - smoothstep(0.2, 0.6, fwS);
  // the lower edge of each course overlaps the next: a step in height
  dkSlH = (fy * 0.012 + (1.0 - gap) * -0.004) * aa;
  float tint = mix(1.0, 0.75 + 0.5 * id, aa) + 0.15 * (dkVN2(vRoofUv * 2.3) - 0.5);
  vec3 c = diffuseColor.rgb * tint;
  c *= mix(0.84, mix(0.55, 1.0, gap) * mix(0.7, 1.0, smoothstep(0.0, 0.15, fy)), aa);
  // lichen (pale grey-yellow rosettes) and moss toward the eaves
  float lich = smoothstep(0.7, 0.85, dkVN2(vRoofUv * 9.0 + 11.0) * 0.55 + mix(0.5, dkVN2(vRoofUv * 31.0), aa) * 0.45) * dkLichen;
  c = mix(c, vec3(0.24, 0.23, 0.16), lich * 0.5);
  float eave = smoothstep(0.4, 1.0, vRoofUv.y / max(1.0, 6.0));
  float moss = smoothstep(0.5, 0.75, dkVN2(vRoofUv * 1.3 + 4.0)) * dkMossLow * eave;
  c = mix(c, vec3(0.05, 0.065, 0.025), moss);
  diffuseColor.rgb = c;
  dkSlR = 0.7 + 0.25 * mix(0.5, id, aa) - lich * 0.1;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = dkSlR;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(dkSlH), hy = dFdy(dkSlH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad);
}`);
  };
  mat.customProgramCacheKey = () => 'dk-slate';
  return mat;
}

/** A pitched roof: two slabs with overhang and thickness, UVs in metres (x along the ridge, y down the slope). */
function roofGeometry(w, d, pitchH, over = 0.5, thick = 0.18) {
  const half = d / 2 + over;
  const run = half, rise = pitchH * (half / (d / 2));
  const slope = Math.hypot(run, rise);
  const g = new THREE.BoxGeometry(w + 2 * over, thick, slope, 1, 1, 1);
  // UVs in metres on the top/bottom faces
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + w, p.getZ(i) + slope / 2);
  return { g, slope, rise, run };
}

export async function buildingKit(ctx, opts = {}) {
  const stone = await worldMaterial(ctx, opts.stone || 'pbr/ph_white_sandstone_bricks_03', {
    mode: 'box', scale: opts.stoneScale ?? 1.4, tint: opts.stoneTint || [0.8, 0.79, 0.74], saturation: opts.saturation ?? 0.55,
    macro: 0.7, antiTile: 0.4, grime: { height: 1.8, strength: 0.55, streaks: 0.8, base: opts.groundY ?? 0 }, moss: opts.moss ?? 0.25, roughness: 1.05, normalScale: opts.normalScale ?? 2.0,
  });
  const timber = await worldMaterial(ctx, 'pbr/acg_planks21', { mode: 'box', scale: 1.0, tint: [0.36, 0.3, 0.24], saturation: 0.6, macro: 0.4 });
  const slate = slateMaterial(opts.slate);
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.011, 0.01), roughness: 1 });

  const box = (w, h, d, x, y, z, mat = stone) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true;
    return m;
  };

  /** A wall in the x-y plane (thickness along z) with rectangular / arched openings [{x, y, w, h, arch}] (x = centre). */
  function wall(w, h, t, openings = []) {
    const g = new THREE.Group();
    // split into vertical strips between openings, then fill above/below each opening
    const xs = [-w / 2];
    const ops = [...openings].sort((a, b) => a.x - b.x);
    for (const o of ops) xs.push(o.x - o.w / 2, o.x + o.w / 2);
    xs.push(w / 2);
    for (let i = 0; i < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.01) g.add(box(xs[i + 1] - xs[i], h, t, (xs[i] + xs[i + 1]) / 2, 0, 0));
    for (const o of ops) {
      const top = o.y + o.h;                     // for arches: the crown; the springing line is top - w/2
      if (o.y > 0.01) g.add(box(o.w, o.y, t, o.x, 0, 0));                       // sill
      if (top < h - 0.01) g.add(box(o.w, h - top, t, o.x, top, 0));            // above
      if (o.arch) {                                                             // smooth round arch head (masonry with a semicircular hole)
        const r = o.w / 2;
        // the spandrel masonry: rectangle above the springing line minus the semicircle (one simple polygon)
        const pts = [new THREE.Vector2(-r, 0), new THREE.Vector2(-r, r + 0.02), new THREE.Vector2(r, r + 0.02), new THREE.Vector2(r, 0)];
        for (let k = 1; k < 32; k++) { const a = (k / 32) * Math.PI; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
        const sh = new THREE.Shape(pts);
        const ag = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 32 });
        ag.translate(0, 0, -t / 2);
        const am = new THREE.Mesh(ag, stone);
        am.position.set(o.x, top - r, 0); am.castShadow = am.receiveShadow = true;
        g.add(am);
      }
      // the dark interior seen through the opening (a deep reveal, no back-face peeking)
      const inner = box(o.w, o.h, 0.05, o.x, o.y, -t / 2 - 2.5, dark);
      inner.castShadow = false;
      g.add(inner);
    }
    return g;
  }

  /** A rectangular hall/stable with a pitched slate roof; front = +z face. */
  function hall({ w = 20, d = 10, h = 6, pitch = 0.7, t = 0.7, door = null, windows = 0, gableDoor = false, chimney = false } = {}) {
    const g = new THREE.Group();
    const ops = [];
    if (door) ops.push({ x: door.x ?? 0, y: 0, w: door.w ?? 3.5, h: door.h ?? 4, arch: door.arch ?? true });
    for (let i = 0; i < windows; i++) {
      const x = -w / 2 + (w / (windows + 1)) * (i + 1);
      if (door && Math.abs(x - (door.x ?? 0)) < (door.w ?? 3.5) / 2 + 1.2) continue;
      ops.push({ x, y: h * 0.45, w: 0.7, h: 1.3, arch: false });
    }
    const front = wall(w, h, t, ops); front.position.z = d / 2 - t / 2; g.add(front);
    const back = wall(w, h, t, []); back.position.z = -d / 2 + t / 2; g.add(back);
    const sideOps = gableDoor ? [{ x: 0, y: 0, w: 2.2, h: 3, arch: true }] : [];
    const left = wall(d - 2 * t, h, t, sideOps); left.rotation.y = -Math.PI / 2; left.position.x = -w / 2 + t / 2; g.add(left);
    const right = wall(d - 2 * t, h, t, []); right.rotation.y = Math.PI / 2; right.position.x = w / 2 - t / 2; g.add(right);
    // gables (triangular prisms of masonry)
    const rise = (d / 2) * pitch;
    const gs = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const gg = new THREE.ExtrudeGeometry(gs, { depth: t, bevelEnabled: false });
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(gg, stone);
      m.rotation.y = Math.PI / 2; m.position.set(sx * (w / 2) - (sx > 0 ? t : 0), h, 0);
      m.castShadow = m.receiveShadow = true; g.add(m);
    }
    // roof slabs: local +z runs down the slope (UV y = metres from the ridge)
    const over = 0.45, thick = 0.2;
    const { g: rg, rise: rr } = roofGeometry(w, d, rise, over, thick);
    const ang = Math.atan2(rise, d / 2);
    const half = d / 2 + over;
    const yc = h + rise - rr / 2 + (thick / 2) / Math.cos(ang);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(rg, slate);
      m.rotation.set(ang, s > 0 ? 0 : Math.PI, 0, 'YXZ');
      m.position.set(0, yc, s * half / 2);
      m.castShadow = m.receiveShadow = true; g.add(m);
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, w + 0.9, 8), slate);
    ridge.rotation.z = Math.PI / 2; ridge.position.set(0, h + rise + 0.18, 0); g.add(ridge);
    if (chimney) g.add(box(1.2, rise + 2.2, 1.2, w / 2 - 2.5, h, -d / 4));
    return g;
  }

  /** A round tower with a corbelled parapet ring, slit windows and a conical slate cap. */
  function tower({ r = 3, h = 16, capH = 5, slits = 3 } = {}) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 32), stone);
    m.position.y = h / 2; m.castShadow = m.receiveShadow = true; g.add(m);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.0, 0.9, 32), stone);
    ring.position.y = h - 0.45; ring.castShadow = ring.receiveShadow = true; g.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.16, 1.4, 32), stone);
    base.position.y = 0.7; base.castShadow = base.receiveShadow = true; g.add(base);
    for (let i = 0; i < slits; i++) {
      for (const a of [0.15, 0.15 + Math.PI * 0.7]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.5), dark);
        const ang = a + i * 0.4, y = 3.5 + i * (h - 6) / Math.max(1, slits - 1) * 0.9;
        w.position.set(Math.sin(ang) * (r - 0.12), y, Math.cos(ang) * (r - 0.12)); w.rotation.y = ang;
        g.add(w);
      }
    }
    const capGeo = new THREE.ConeGeometry(r * 1.18, capH, 32, 1, true);
    const uv = capGeo.attributes.uv, p = capGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); uv.setXY(i, a * r * 1.18, (capH / 2 - p.getY(i)) * 1.15); }
    const cap = new THREE.Mesh(capGeo, slate);
    cap.position.y = h + capH / 2 - 0.1; cap.castShadow = true; g.add(cap);
    return g;
  }

  /** A dry-stone boundary wall following points [[x, z], ...] at ground heights groundAt(x, z). */
  function fieldWall(points, groundAt, { h = 1.2, t = 0.7 } = {}) {
    const g = new THREE.Group();
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / 3));
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n;
        const xa = x0 + (x1 - x0) * f0, za = z0 + (z1 - z0) * f0, xb = x0 + (x1 - x0) * f1, zb = z0 + (z1 - z0) * f1;
        const xm = (xa + xb) / 2, zm = (za + zb) / 2, y = groundAt(xm, zm);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len / n + 0.05, h, t), stone);
        m.position.set(xm, y + h / 2 - 0.15, zm); m.rotation.y = -Math.atan2(zb - za, xb - xa);
        m.castShadow = m.receiveShadow = true; g.add(m);
      }
    }
    return g;
  }

  return { stone, timber, slate, dark, box, wall, hall, tower, fieldWall };
}
