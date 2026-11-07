// Where the made world meets the ground (G12): no more razor edge between asphalt and lawn.
//  - Road shoulders: along the highways and the outer lanes, a strip of packed gravel at the road's
//    edge turning to dirt, then broken up into the grass with a ragged edge; wider in some places
//    than others, as if cars had run off it.
//  - Footings: round the foot of houses, sheds and barns standing on open ground, a band of bare
//    soil and gravel (drip line, mower can't reach), ragged where it meets the lawn.
// Both use the photo-scanned Gravel004 and Dirt01 sets (colour, normal, roughness, ambient occlusion)
// mapped by world position, blended layer on layer, with a noisy cut-out edge (no sorting issues).
import * as THREE from 'three';

function decalMaterial(surf, mode) {
  const G = surf?.gravel?.real ? surf.gravel : null, D = surf?.dirt?.real ? surf.dirt : null;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGc = { value: G ? G.color : null }; sh.uniforms.tGn = { value: G ? G.normal : null }; sh.uniforms.tGa = { value: G ? G.ao : null };
    sh.uniforms.tDc = { value: D ? D.color : null }; sh.uniforms.tDn = { value: D ? D.normal : null };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDW; varying vec2 vDU;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vDW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vDW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
vDU = uv;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vDW; varying vec2 vDU; vec3 sbDN = vec3(0.0, 0.0, 1.0);
${G ? 'uniform sampler2D tGc, tGn, tGa;' : ''} ${D ? 'uniform sampler2D tDc, tDn;' : ''}
float sdH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sdN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sdH(i), sdH(i + vec2(1, 0)), f.x), mix(sdH(i + vec2(0, 1)), sdH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // out: 0 at the made edge (road or wall) .. 1 at the far side of the strip
  float out1 = vDU.x;
  float n = sdN(vDW.xz * 0.9) * 0.6 + sdN(vDW.xz * 3.1) * 0.3 + sdN(vDW.xz * 11.0) * 0.1;
  // a ragged edge into the grass: cut out (not blended), so nothing needs sorting
  if (out1 > 0.35 + n * 0.65 - ${mode === 'road' ? '0.05' : '0.12'}) discard;
  vec2 uv = vDW.xz;
  ${G ? `vec3 gc = texture2D(tGc, uv / ${G.size.toFixed(2)}).rgb * mix(1.0, texture2D(tGa, uv / ${G.size.toFixed(2)}).r, 0.7);` : 'vec3 gc = vec3(0.42, 0.4, 0.37) * (0.85 + 0.3 * n);'}
  ${D ? `vec3 dc = texture2D(tDc, uv / ${D.size.toFixed(2)}).rgb;` : 'vec3 dc = vec3(0.36, 0.29, 0.21) * (0.85 + 0.3 * n);'}
  // gravel at the edge, packed dirt further out, mixed by the noise
  float g = smoothstep(${mode === 'road' ? '0.55, 0.15' : '0.7, 0.2'}, out1 + (n - 0.5) * 0.5);
  diffuseColor.rgb = mix(dc, gc, g) * ${mode === 'road' ? '0.92' : '0.88'};
  ${G && D ? `sbDN = normalize(mix(texture2D(tDn, uv / ${D.size.toFixed(2)}).xyz, texture2D(tGn, uv / ${G.size.toFixed(2)}).xyz, g) * 2.0 - 1.0);` : ''}
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize((viewMatrix * vec4(normalize(vec3(sbDN.x, max(sbDN.z, 0.25), sbDN.y)), 0.0)).xyz);`);
  };
  m.customProgramCacheKey = () => 'sbground-' + mode;
  return m;
}

export function buildShoulders(graph, { scene, hm, surf, collision }) {
  const pos = [], uv = [], idx = [];
  let v0 = 0;
  const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (const e of graph.edges) {
    const rural = e.kind === 'highway' || (e.lane && !e.gravel);
    if (!rural) continue;
    const P = e.pts, hw = e.width / 2;
    // every ~4 m along the road (the terrain's own grid), both sides
    const S = [];
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const n = Math.max(1, Math.round(L / 4));
      for (let k = 0; k < n; k++) { const t = k / n, ya = e.ys ? e.ys[i - 1] : hm.height(ax, az), yb = e.ys ? e.ys[i] : hm.height(bx, bz); S.push([ax + (bx - ax) * t, az + (bz - az) * t, ya + (yb - ya) * t, (bx - ax) / L, (bz - az) / L]); }
    }
    const last = P[P.length - 1], prev = P[P.length - 2] || P[0];
    { const L = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1; S.push([last[0], last[1], e.ys ? e.ys[e.ys.length - 1] : hm.height(last[0], last[1]), (last[0] - prev[0]) / L, (last[1] - prev[1]) / L]); }
    for (const side of [-1, 1]) {
      let open = false;
      for (let k = 0; k < S.length; k++) {
        const [x, z, y, tx, tz] = S[k], nx = -tz * side, nz = tx * side;
        const w = 1.3 + hash(x * 0.05, z * 0.05 + side) * 1.4; // wider here and there
        const ix = x + nx * (hw - 0.15), iz = z + nz * (hw - 0.15), ox = x + nx * (hw + w), oz = z + nz * (hw + w);
        const gi = hm.height(ix, iz), go = hm.height(ox, oz);
        // not on bridges or embankments high above the ground, not into water
        const ok = y - gi < 0.9 && go > hm.waterLevel(ox, oz) + 0.15;
        if (!ok) { open = false; continue; }
        const yi = Math.max(y + 0.1, gi + 0.03) + 0.005, yo = go + 0.035;
        pos.push(ix, yi, iz, ox, yo, oz); uv.push(0, k, 1, k);
        if (open) { const a = v0 - 2, b = v0 - 1, c = v0, d = v0 + 1; idx.push(a, c, b, b, c, d); }
        v0 += 2; open = true;
      }
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // (normals face down for one side's winding: the shader uses its own up-facing normal)
  const mesh = new THREE.Mesh(g, decalMaterial(surf, 'road'));
  mesh.material.side = THREE.DoubleSide;
  mesh.receiveShadow = true; mesh.userData.noHit = true; mesh.userData.noReflect = true; mesh.userData.surf = 'gravel';
  scene.add(mesh);
  void collision;
  return { mesh, quads: idx.length / 6 };
}

// bare soil round the foot of buildings standing on open ground (not on a pavement)
export function buildFootings(B, { scene, hm, surf, collision }) {
  const mats = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const b of B) {
    if (b.style !== 3 && b.style !== 4) continue; // houses, sheds, barns, warehouses (the city's blocks stand on pavement)
    const g0 = hm.height(b.x, b.z);
    if (b.y - g0 > 1.0) continue;
    for (const [nx, nz, len, half] of [[0, 1, b.w, b.d / 2], [0, -1, b.w, b.d / 2], [1, 0, b.d, b.w / 2], [-1, 0, b.d, b.w / 2]]) {
      const D = 0.75 + ((b.x * 7 + b.z * 3 + nx * 5 + nz) % 1 + 1) % 1 * 0.5;
      const x = b.x + nx * (half + D / 2), z = b.z + nz * (half + D / 2);
      const gy = hm.height(x, z), sy = collision.surface(x, z, b.y + 1.0);
      if (sy > gy + 0.12) continue; // a pavement or a slab there already
      q.setFromAxisAngle(UP, Math.atan2(nx, nz));
      mats.push(m4.compose(p.set(x, gy + 0.03, z), q, s.set(len + 0.4, 1, D)).clone());
    }
  }
  if (!mats.length) return null;
  // the strip's u runs from the wall (0) out (1): built so local -z is the wall side
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv, P = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getZ(i) + 0.5, P.getX(i) + 0.5);
  const im = new THREE.InstancedMesh(geo, decalMaterial(surf, 'footing'), mats.length);
  mats.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.receiveShadow = true; im.userData.noHit = true; im.userData.noReflect = true;
  im.computeBoundingSphere();
  scene.add(im);
  return { count: mats.length };
}
