// Town set pieces (Cling): timber-framed townhouses on grey stone ground
// storeys, market stalls with cloth awnings, bunting and hanging banners, a
// fountain with a central pillar.
//
//   const town = await townKit(ctx, buildingKit);
//   scene.add(town.house({ w: 7, d: 9, storeys: 2, roof: 'gable-front' }));
//
// Everything is real geometry with world-projected CC0 photo textures (stone,
// timber, lime plaster) and procedural cloth shaders; no alpha cards.
import * as THREE from 'three';
import { worldMaterial, GLSL_NOISE } from './materials.js';

/** Cloth with woven stripes / plain dye, sheen, and darker folds; colours linear. */
export function clothMaterial(opts = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1) });
  const U = {
    dkC1: { value: new THREE.Color(...(opts.color || [0.3, 0.06, 0.04])) },
    dkC2: { value: new THREE.Color(...(opts.color2 || opts.color || [0.42, 0.37, 0.29])) },
    dkStripe: { value: opts.stripe ?? 0 },            // stripes per metre (0 = plain)
    dkWear: { value: opts.wear ?? 0.25 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCUv; varying vec3 vCW;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCUv = uv;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 w = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
#endif
  vCW = (modelMatrix * w).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vCUv; varying vec3 vCW; uniform vec3 dkC1, dkC2; uniform float dkStripe, dkWear;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float st = dkStripe > 0.0 ? step(0.5, fract(vCUv.x * dkStripe)) : 0.0;
  vec3 c = mix(dkC1, dkC2, st);
  float weave = 0.92 + 0.08 * dkVN2(vCUv * vec2(900.0, 900.0));
  float fade = 1.0 + dkWear * (dkVN2(vCW.xz * 1.3 + vCW.y) - 0.5);
  float dirt = 1.0 - dkWear * 0.5 * smoothstep(0.6, 0.0, vCUv.y) * dkVN2(vCUv * 9.0);
  diffuseColor.rgb = c * weave * fade * dirt;
}`);
  };
  mat.customProgramCacheKey = () => 'dk-cloth';
  return mat;
}

/** A hanging sheet (banner / awning) as a grid with sag and wind ripples; uv in metres. */
export function clothSheet(w, h, opts = {}) {
  const nx = opts.nx ?? 24, ny = opts.ny ?? 24;
  const g = new THREE.PlaneGeometry(w, h, nx, ny);
  const p = g.attributes.position, uv = g.attributes.uv;
  const sag = opts.sag ?? 0, ripple = opts.ripple ?? 0.04, seed = opts.seed ?? 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / w + 0.5, v = y / h + 0.5;
    const folds = opts.folds ?? 0;           // hanging folds: vertical pleats from the top bar, deepening downward
    const z = sag * Math.sin(Math.PI * u) * (opts.sagAlongY ? Math.sin(Math.PI * v) : 1) +
      ripple * Math.sin(u * 9 + seed + v * 2.5) * (1 - v) + ripple * 0.5 * Math.sin(u * 23 + seed * 2 - v * 7) * (1 - v) +
      folds * (Math.sin(u * Math.PI * 5 + seed * 1.3 + (1 - v) * 1.2) * 0.7 + Math.sin(u * Math.PI * 11 + seed * 0.7) * 0.3) * (0.35 + 0.65 * (1 - v)) +
      (opts.lift ?? 0) * Math.pow(1 - v, 2);            // the wind lifts the lower part away from the wall
    p.setZ(i, z);
    if (folds) p.setX(i, x * (1 - 0.06 * (1 - v)) + folds * 0.3 * Math.sin(v * 3 + seed) * (1 - v));
    uv.setXY(i, u * w, v * h);
  }
  g.computeVertexNormals();
  return g;
}

export async function townKit(ctx, kit, opts = {}) {
  const greyStone = await worldMaterial(ctx, 'pbr/ph_sandstone_blocks_04', {
    mode: 'box', scale: 0.9, tint: [0.5, 0.49, 0.47], saturation: 0.2, macro: 0.8, normalScale: 2.0, antiTile: 0.5,
    grime: { height: 1.2, strength: 0.5, streaks: 0.6, base: opts.groundY ?? 0 }, moss: 0.12,
  });
  // lime-washed plaster: procedural (washes of tint, faint trowel undulation, rain streaks under
  // the timbers, a damp grey band at the bottom, fine sand grain in the bump)
  const plaster0 = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  {
    const U = { dkTint: { value: new THREE.Vector3(1, 0.97, 0.9) }, dkSeed: { value: 0 } };
    plaster0.userData.dkUniforms = U;
    plaster0.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, plaster0.userData.dkUniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; varying vec3 vPN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz; vPN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vPW; varying vec3 vPN; uniform vec3 dkTint; uniform float dkSeed;
${GLSL_NOISE}
float dkPH;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vPW + dkSeed;
  float wash = dkFbm3(p * 0.35) * 0.6 + dkFbm3(p * 1.7) * 0.4;
  float streak = smoothstep(0.55, 0.85, dkVN2(vec2((vPW.x + vPW.z) * 3.1, vPW.y * 0.25))) * (1.0 - abs(vPN.y));
  float grain = dkVN3(p * 140.0);
  float dirt = smoothstep(0.35, 0.8, dkFbm3(p * vec3(0.8, 0.25, 0.8) + 4.0));
  float low = 1.0 - smoothstep(0.0, 1.4, fract(vPW.y / 2.8));      // grime collects above each sill beam
  // older coats showing through where the wash has flaked (warm, darker), soot and weather
  float flake = smoothstep(0.58, 0.72, dkFbm3(p * 0.9 + 11.0)) * (0.6 + 0.4 * dkVN3(p * 9.0));
  vec3 c = vec3(0.5, 0.485, 0.445) * dkTint * (0.72 + 0.5 * wash) * (1.0 - 0.34 * streak) * (1.0 - 0.26 * dirt) * (1.0 - 0.2 * low) * (0.95 + 0.1 * grain);
  c = mix(c, c * vec3(0.78, 0.68, 0.55), flake * 0.7);
  diffuseColor.rgb = c;
  dkPH = grain * 0.0006 + dkFbm3(p * 4.0) * 0.003;
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(dkPH), hy = dFdy(dkPH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2));
}`);
    };
    plaster0.customProgramCacheKey = () => 'dk-plaster';
  }
  const timber = await worldMaterial(ctx, 'pbr/acg_wood35', { mode: 'box', scale: 1.0, tint: [0.42, 0.36, 0.3], saturation: 0.6, macro: 0.4 });
  const slate = kit.slate;
  const dark = kit.dark;
  // small glazed (horn / thin glass) windows: dark, but they reflect the sky like real ones do
  const glazing = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.018, 0.018, 0.02), roughness: 0.14, metalness: 0 });
  // the dim interior behind open doors and ground-floor windows (a bounce card: daylight from the
  // street lights the room faintly - never a black void)
  const interior = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.032, 0.026, 0.019) });

  const add = (g, geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  /**
   * A townhouse, front facing +z, ground at y = 0. w (frontage), d (depth), hs (stone storey height),
   * ht (timber storey height), storeys (timber storeys), jetty (overhang per storey), roof 'front' (gable to
   * the street) or 'side' (eaves to the street), pitch, seed, door (true/false).
   */
  function house({ w = 7, d = 9, hs = 3.4, ht = 2.8, storeys = 1, jetty = 0.35, roof = 'front', pitch = 1.1, seed = 1, door = true, shutters = true, plasterTint = null } = {}) {
    const g = new THREE.Group();
    // per-house lime wash: a tinted copy of the plaster material (same shader program)
    let plaster = plaster0;
    if (plasterTint) { plaster = plaster0.clone(); plaster.onBeforeCompile = plaster0.onBeforeCompile; plaster.customProgramCacheKey = plaster0.customProgramCacheKey;
      plaster.userData.dkUniforms = { ...plaster0.userData.dkUniforms, dkTint: { value: new THREE.Vector3(...plasterTint) }, dkSeed: { value: seed * 1.7 } };
      const ob = plaster0.onBeforeCompile; plaster.onBeforeCompile = (sh, r) => { ob(sh, r); sh.uniforms.dkTint = plaster.userData.dkUniforms.dkTint; sh.uniforms.dkSeed = plaster.userData.dkUniforms.dkSeed; }; }
    let a = seed * 9973 >>> 0;
    const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    const t = 0.55;
    // stone ground storey with a door and a window in the front
    const ops = [];
    if (door) ops.push({ x: -w * 0.18 + rnd() * 0.4, y: 0, w: 1.3, h: 2.4, arch: true });
    ops.push({ x: w * 0.22, y: 1.0, w: 1.1, h: 1.2, arch: false });
    const front = kit.wall(w, hs, t, ops); front.position.z = d / 2 - t / 2;
    add(g, new THREE.PlaneGeometry(w - 2 * t, hs * 0.98), interior, 0, hs / 2, d / 2 - t - 0.9);
    front.traverse((o) => { if (o.isMesh && o.material === kit.stone) o.material = greyStone; });
    g.add(front);
    add(g, B(w, hs, t), greyStone, 0, hs / 2, -d / 2 + t / 2);
    add(g, B(t, hs, d - 2 * t), greyStone, -w / 2 + t / 2, hs / 2, 0);
    add(g, B(t, hs, d - 2 * t), greyStone, w / 2 - t / 2, hs / 2, 0);
    // jettied timber-framed storeys: plaster box + timbers on the street face and the sides
    let y = hs, jw = w, jd = d;
    for (let k = 0; k < storeys; k++) {
      const front0 = d / 2 + jetty * (k + 1);
      jd = d + jetty * (k + 1);
      const cz = front0 - jd / 2;
      add(g, B(jw, ht, jd), plaster, 0, y + ht / 2, cz);
      // sill and head beams, corner posts, studs, braces (proud of the plaster)
      const fz = front0 + 0.06;
      add(g, B(jw + 0.1, 0.24, 0.16), timber, 0, y + 0.12, fz);
      add(g, B(jw + 0.1, 0.2, 0.16), timber, 0, y + ht - 0.1, fz);
      const nStud = Math.max(3, Math.round(jw / 0.95));
      for (let i = 0; i <= nStud; i++) {
        const x = -jw / 2 + 0.08 + (jw - 0.16) * i / nStud;
        add(g, B(0.16, ht - 0.4, 0.14), timber, x, y + ht / 2, fz);
      }
      add(g, B(jw, 0.14, 0.12), timber, 0, y + ht * 0.55, fz + 0.01);              // mid rail
      for (const sx of [-1, 1]) {                                                   // braces at the ends
        const br = add(g, B(0.12, Math.hypot(ht * 0.5, jw / nStud) * 1.05, 0.12), timber, sx * (jw / 2 - jw / nStud * 0.5 - 0.08), y + ht * 0.3, fz + 0.015);
        br.rotation.z = sx * Math.atan2(jw / nStud, ht * 0.5);
      }
      // windows with dark glazing and shutters
      const nWin = Math.max(1, Math.floor(jw / 2.6));
      for (let i = 0; i < nWin; i++) {
        const x = -jw / 2 + jw * (i + 0.5) / nWin;
        add(g, B(0.8, 1.0, 0.1), glazing, x, y + ht * 0.55 + 0.2, fz + 0.02);
        if (shutters && rnd() < 0.7) for (const sx of [-1, 1]) {
          const sh = add(g, B(0.42, 1.0, 0.05), timber, x + sx * 0.66, y + ht * 0.55 + 0.2, fz + 0.12);
          sh.rotation.y = sx * (0.3 + rnd() * 0.9);
        }
      }
      // floor joist ends under the jetty
      for (let i = 0; i < Math.round(jw / 0.6); i++) add(g, B(0.14, 0.16, 0.5), timber, -jw / 2 + 0.3 + i * 0.6, y - 0.06, front0 - 0.2);
      y += ht;
    }
    // roof
    const over = 0.5;
    if (roof === 'front') {
      // ridge runs front-back: the gable faces the street
      const span = jw, rise = (span / 2) * pitch, len = jd + over * 2;
      const half = span / 2 + over;
      const slope = Math.hypot(half, rise * (half / (span / 2)));
      const ang = Math.atan2(rise, span / 2);
      const geo = new THREE.BoxGeometry(slope, 0.2, len);
      const uvA = geo.attributes.uv, pA = geo.attributes.position;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getZ(i) + len, pA.getX(i) + slope / 2);
      const zc = d / 2 + jetty * storeys - jd / 2;
      for (const s of [1, -1]) {
        const m = add(g, geo, slate, s * half / 2, y + rise - rise * (half / (span / 2)) / 2 + 0.12, zc);
        m.rotation.set(0, 0, -s * ang);
      }
      const gs = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
      const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.3, bevelEnabled: false });
      add(g, gg, plaster, 0, y, zc + jd / 2 - 0.3);
      add(g, gg, plaster, 0, y, zc - jd / 2);
      // gable timbers: a king post and the barge boards
      add(g, B(0.16, rise * 0.9, 0.12), timber, 0, y + rise * 0.45, zc + jd / 2 + 0.06);
      for (const s of [1, -1]) {
        const bb = add(g, B(Math.hypot(span / 2, rise) + 0.6, 0.22, 0.08), timber, s * span / 4, y + rise / 2 + 0.12, zc + jd / 2 + 0.25);
        bb.rotation.z = -s * ang;
      }
    } else {
      const span = jd, rise = (span / 2) * pitch, len = jw + over * 2;
      const half = span / 2 + over;
      const slope = Math.hypot(half, rise * (half / (span / 2)));
      const ang = Math.atan2(rise, span / 2);
      const geo = new THREE.BoxGeometry(len, 0.2, slope);
      const uvA = geo.attributes.uv, pA = geo.attributes.position;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pA.getX(i) + len, pA.getZ(i) + slope / 2);
      const zc = d / 2 + jetty * storeys - jd / 2;
      for (const s of [1, -1]) {
        const m = add(g, geo, slate, 0, y + rise - rise * (half / (span / 2)) / 2 + 0.12, zc + s * half / 2);
        m.rotation.set(s * ang, 0, 0);
      }
      const gs = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
      const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.3, bevelEnabled: false });
      for (const s of [1, -1]) { const m = add(g, gg, plaster, s * (jw / 2) - (s > 0 ? 0.3 : 0), y, zc); m.rotation.y = Math.PI / 2; }
      if (rnd() < 0.6) add(g, B(0.9, rise + 1.6, 0.9), greyStone, jw * 0.25, y, zc - jd * 0.2);   // chimney
    }
    g.userData.height = y;
    return g;
  }

  /** A market stall: four posts, a counter, a sagging striped awning, goods on the counter. */
  function stall({ w = 3.2, d = 1.8, h = 2.4, color = [0.32, 0.06, 0.04], color2 = [0.45, 0.4, 0.3], stripe = 2.5, seed = 1, goods } = {}) {
    const g = new THREE.Group();
    let a = seed * 7919 >>> 0;
    const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (const [x, z, hh] of [[-w / 2, d / 2, h], [w / 2, d / 2, h], [-w / 2, -d / 2, h + 0.4], [w / 2, -d / 2, h + 0.4]]) add(g, B(0.1, hh, 0.1), timber, x, hh / 2, z);
    add(g, B(w + 0.1, 0.07, d * 0.6), timber, 0, 0.9, d * 0.18);                    // counter
    add(g, B(w, 0.85, 0.04), timber, 0, 0.45, d / 2 - 0.02);                         // front board
    const awn = clothSheet(w + 0.4, Math.hypot(d + 0.4, 0.4), { sag: -0.12, ripple: 0.03, seed, nx: 20, ny: 8 });
    const am = add(g, awn, clothMaterial({ color, color2, stripe, wear: 0.35 }), 0, h + 0.2, 0);
    am.rotation.x = -Math.PI / 2 + Math.atan2(0.4, d + 0.4);
    // valance along the front
    const val = add(g, clothSheet(w + 0.4, 0.3, { ripple: 0.02, seed: seed + 3, nx: 20, ny: 3 }), clothMaterial({ color, color2, stripe, wear: 0.35 }), 0, h + 0.02, d / 2 + 0.2);
    void val;
    // goods: baskets, crates, round produce, cloth bundles
    const baskets = goods?.basket;
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.45 + (w - 0.9) * i / 3 + (rnd() - 0.5) * 0.2;
      if (rnd() < 0.5 && baskets) {
        const b = add(g, new THREE.CylinderGeometry(0.26, 0.2, 0.2, 18, 1, true), baskets, x, 1.04, d * 0.18 + (rnd() - 0.5) * 0.2);
        const fill = add(g, new THREE.SphereGeometry(0.24, 14, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(...[[0.35, 0.05, 0.02], [0.4, 0.25, 0.03], [0.12, 0.2, 0.03], [0.3, 0.18, 0.08]][i % 4]), roughness: 0.5 }), x, 1.08, b.position.z);
        fill.scale.y = 0.35;
      } else {
        const c = add(g, B(0.5, 0.25 + rnd() * 0.15, 0.4), timber, x, 1.06, d * 0.18 + (rnd() - 0.5) * 0.2);
        c.rotation.y = (rnd() - 0.5) * 0.4;
      }
    }
    // a crate and a sack on the ground beside it
    add(g, B(0.55, 0.45, 0.45), timber, w / 2 + 0.4, 0.22, d * 0.2).rotation.y = 0.3;
    const sack = add(g, new THREE.SphereGeometry(0.3, 14, 10), clothMaterial({ color: [0.4, 0.34, 0.24], wear: 0.4 }), -w / 2 - 0.35, 0.25, 0.3);
    sack.scale.set(0.9, 1.1, 0.8);
    return g;
  }

  /** A fountain: a round stone basin with water and a central pillar. */
  function fountain({ r = 3.2, h = 0.75, pillarH = 3.6 } = {}) {
    const g = new THREE.Group();
    const prof = [[0, 0], [r + 0.1, 0], [r + 0.15, 0.08], [r + 0.05, h - 0.12], [r + 0.15, h], [r - 0.35, h], [r - 0.4, h - 0.1], [r - 0.42, 0.12], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y));
    add(g, new THREE.LatheGeometry(prof, 64), greyStone, 0, 0, 0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.4, 64), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.02, 0.025, 0.025), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.33 }));
    water.rotation.x = -Math.PI / 2; water.position.y = h - 0.18; g.add(water);
    // an octagonal shaft on a stepped base, a moulded capital, and a pyramidal stone spire with a finial
    const ped = [[0, 0], [0.8, 0], [0.8, 0.35], [0.62, 0.35], [0.62, 0.62], [0.42, 0.7], [0.36, 0.78], [0.33, pillarH - 0.55], [0.4, pillarH - 0.45], [0.36, pillarH - 0.38], [0.52, pillarH - 0.22], [0.52, pillarH], [0, pillarH]].map(([x, y]) => new THREE.Vector2(x, y));
    const shaft = add(g, new THREE.LatheGeometry(ped, 8), greyStone, 0, 0, 0); shaft.rotation.y = Math.PI / 8;
    const spire = add(g, new THREE.ConeGeometry(0.42, 1.5, 4), greyStone, 0, pillarH + 0.75, 0); spire.rotation.y = Math.PI / 4;
    add(g, new THREE.SphereGeometry(0.11, 12, 8), greyStone, 0, pillarH + 1.55, 0);
    return g;
  }

  /** A string of bunting between two points with a catenary sag; pennants in the given colours. */
  function bunting(p0, p1, { sag = 1.2, every = 0.55, size = 0.42, colors } = {}) {
    const g = new THREE.Group();
    const cols = colors || [[0.35, 0.05, 0.03], [0.42, 0.3, 0.05], [0.05, 0.09, 0.2], [0.42, 0.37, 0.28], [0.12, 0.17, 0.06]];
    const len = p0.distanceTo(p1), n = Math.max(2, Math.floor(len / every));
    const pts = [];
    for (let i = 0; i <= 40; i++) { const f = i / 40; const p = p0.clone().lerp(p1, f); p.y -= sag * 4 * f * (1 - f); pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(g, new THREE.TubeGeometry(curve, 60, 0.008, 4, false), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }), 0, 0, 0);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-size / 2, 0, 0, size / 2, 0, 0, 0, -size * 1.3, 0.04], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
    tri.computeVertexNormals();
    const mats = cols.map((c) => clothMaterial({ color: c, wear: 0.3 }));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, p = curve.getPointAt(f), tg = curve.getTangentAt(f);
      const m = new THREE.Mesh(tri, mats[i % mats.length]);
      m.position.copy(p);
      m.lookAt(p.clone().add(new THREE.Vector3(-tg.z, 0, tg.x)));
      m.rotateZ(Math.atan2(tg.y, Math.hypot(tg.x, tg.z)) * (tg.x >= 0 ? 1 : -1) * 0.0);
      m.rotateX(0.35 * Math.sin(i * 1.7) + 0.15);          // the breeze lifts them unevenly
      m.rotateY(0.25 * Math.sin(i * 2.3 + 0.5));
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  /** A long vertical banner hanging from a pole bracket (front = +z). */
  function banner({ w = 1.1, h = 4.5, color = [0.35, 0.05, 0.03], color2, stripe = 0, seed = 1 } = {}) {
    const g = new THREE.Group();
    add(g, B(w + 0.3, 0.08, 0.08), timber, 0, 0, 0.6);
    add(g, B(0.08, 0.08, 0.6), timber, 0, 0, 0.3);
    const s = add(g, clothSheet(w, h, { ripple: 0.09, folds: 0.045, lift: 0.25, seed, nx: 24, ny: 36 }), clothMaterial({ color, color2, stripe, wear: 0.3 }), 0, -h / 2 - 0.04, 0.6);
    void s;
    return g;
  }

  return { greyStone, plaster: plaster0, timber, house, stall, fountain, bunting, banner };
}
