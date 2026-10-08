// A small North-Sea trading ship of the 11th-12th century (a knarr / early
// cog type): double-ended clinker hull, one mast, one square sail of undyed
// wool, a side rudder on the starboard quarter, cargo under hides amidships.
// Built procedurally (no model of this period is in the free libraries this
// project can reach), dimensions after the Skuldelev 1 find: ~16 m long,
// ~4.6 m beam, ~2 m deep, mast ~12 m, sail ~10 x 8 m.
//
//   const ship = await knarr(ctx, { sailFill: 1.1 });
//   scene.add(ship.root);
//   // update(t): ship.root.position / quaternion from the swell; ship.setSailFill(f)
//
// Local frame: +x = bow, +y = up, +z = starboard; y = 0 is the design waterline.
import * as THREE from 'three';
import { loadPBR } from '../assets.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Hull surface: stations along x, girth parameter v from the keel (0) to the sheer (1), clinker laps. */
function hullGeometry(o) {
  const { L, B, keelDepth, sheer, strakes, lap } = o;
  const NS = 96, PER = 5;                    // stations; samples per strake
  const half = L / 2;
  const beam = (s) => (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.3)), 0.62);
  const keelY = (s) => -keelDepth * (1 - Math.pow(Math.abs(s), 3.2)) + 0.35 * Math.pow(Math.abs(s), 6);
  const sheerY = (s) => sheer + 1.15 * Math.pow(Math.abs(s), 3.4);
  // one side's section points (v from keel to sheer), with the clinker step: each strake's lower
  // edge stands proud of the top edge of the strake below it
  const pos = [], uv = [], idx = [];
  const rowLen = strakes * PER * 2;           // both sides; strakes duplicated at the lap (hard step)
  for (let i = 0; i <= NS; i++) {
    const s = -1 + (2 * i) / NS;
    const x = s * half;
    const b = beam(s), k = keelY(s), sh = sheerY(s);
    const girth = [];
    for (const side of [-1, 1]) {
      for (let st = 0; st < strakes; st++) {
        for (let j = 0; j < PER; j++) {
          const f = j / (PER - 1);
          const v = (st + f) / strakes;
          const a = v * Math.PI / 2;
          // flared section: full near the waterline, sides flaring out to the sheer
          const lat = b * Math.pow(Math.sin(a), 0.55) * (1 + 0.06 * v);
          let y = k + (sh - k) * Math.pow(1 - Math.cos(a), 0.85);
          const proud = lap * (1 - f) * Math.min(1, b / 0.25);   // laps vanish into the stem
          girth.push([x, y - proud * 0.3, side * (lat + proud), side, v]);
        }
      }
    }
    // order: port sheer -> keel -> starboard sheer
    const port = girth.filter((g) => g[3] < 0).reverse();
    const star = girth.filter((g) => g[3] > 0);
    const ring = port.concat(star);
    let acc = 0;
    ring.forEach((g, r) => {
      if (r > 0) acc += Math.hypot(g[1] - ring[r - 1][1], g[2] - ring[r - 1][2]);
      pos.push(g[0], g[1], g[2]);
      uv.push(x, acc);
    });
  }
  const nR = rowLen;
  for (let i = 0; i < NS; i++) for (let r = 0; r < nR - 1; r++) {
    const a = i * nR + r, b = a + 1, c = a + nR, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { g, beam, keelY, sheerY };
}

/**
 * A square sail hanging from the yard, filled by the wind (curved in both directions). Cloth under
 * load is never a smooth shell: tension lines run from each clew (the sheeted lower corners) up
 * toward the middle of the yard, the head puckers between the robands that lace it to the yard,
 * the leeches (the free side edges) shake a little, and the vertical seams of the sewn cloths
 * pull in (shallow troughs).
 */
function sailGeometry(wTop, wBot, h, depth, nu = 56, nv = 44) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;      // u across (port -> starboard), v up (foot -> head)
    const w = wBot + (wTop - wBot) * v;
    const z = (u - 0.5) * w;
    // belly: deepest a little below the middle; the head is held by the yard, the foot by the sheets
    const belly = depth * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + v * 0.95)), 0.8);
    // the leeches curl a little, the foot sags between the clews
    const curl = 0.12 * depth * Math.pow(Math.abs(u - 0.5) * 2, 4);
    const footSag = 0.35 * Math.sin(Math.PI * u) * Math.pow(1 - v, 6);
    // tension lines from each clew toward the yard's middle: ridges along those diagonals
    let crease = 0;
    for (const cu of [0, 1]) {
      const dx = u - cu, dy = v;                              // from the clew
      const dirx = 0.5 - cu, diry = 1;                        // toward the yard's middle
      const along = (dx * dirx + dy * diry) / Math.hypot(dirx, diry);
      const across = (dx * diry - dy * dirx) / Math.hypot(dirx, diry);
      crease += 0.05 * Math.sin(across * 46 + cu * 2.1) * Math.exp(-Math.abs(across) * 3.2) * Math.min(1, along * 3) * (1 - v * 0.6);
    }
    // puckers between the robands along the head, a shake in the leeches, the seams pulling in
    const head = 0.03 * Math.pow(v, 14) * Math.sin(u * Math.PI * 22);
    const shake = 0.06 * Math.pow(Math.abs(u - 0.5) * 2, 6) * Math.sin(v * 9.0 + u * 3.0);
    const seam = -0.012 * Math.pow(Math.cos(Math.PI * (z / 0.72)), 24);
    p.setXYZ(i, belly + curl + crease * depth + head + shake + seam, (v - 0.5) * h + footSag, z);
    uv.setXY(i, z, v * h);
  }
  g.computeVertexNormals();
  return g;
}

/** Rope between two points with a catenary-like sag (m), as a thin tube. */
function rope(a, b, sag, r, mat) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5, false), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * opts: { length 16, beam 4.6, sailFill 1 (belly depth multiplier), sailColor [r,g,b] linear,
 *         hullTint [r,g,b], crew (array of Object3D to stand on board, optional) }
 */
export async function knarr(ctx, opts = {}) {
  const L = opts.length ?? 16, B = opts.beam ?? 4.6;
  const root = new THREE.Group(); root.name = 'knarr';
  const hullTint = new THREE.Color(...(opts.hullTint || [0.32, 0.25, 0.19]));
  // tarred oak planking (CC0 photo wood, planks along the hull)
  const wood = await loadPBR('pbr/acg_wood35', ctx, { repeat: [1 / 2.2, 1 / 2.2], color: hullTint });
  wood.side = THREE.DoubleSide; wood.roughness = 0.9;
  const spar = await loadPBR('pbr/acg_wood35', ctx, { repeat: [1, 0.25], color: new THREE.Color(0.42, 0.34, 0.25) });
  const H = hullGeometry({ L, B, keelDepth: 1.05, sheer: 1.05, strakes: 9, lap: 0.035 });
  const hull = new THREE.Mesh(H.g, wood);
  hull.castShadow = true; hull.receiveShadow = true; hull.name = 'hull';
  root.add(hull);

  // keel, stem and stern posts rising and curling above the sheer
  const post = (sgn) => {
    // stem / stern post: sweeps up and out from the keel, then curls back in at the head
    const pts = [];
    const y0 = H.keelY(sgn * 0.86), y1 = H.sheerY(1) + 1.25;
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      const sweep = Math.sin(Math.min(1, f / 0.8) * Math.PI / 2);
      const curl = f > 0.78 ? -Math.pow((f - 0.78) / 0.22, 1.6) * 0.55 : 0;
      const x = sgn * (0.86 * L / 2 + (0.14 * L / 2 + 0.55) * sweep + curl);
      const y = y0 + (y1 - y0) * Math.pow(f, 0.85) - (f > 0.78 ? Math.pow((f - 0.78) / 0.22, 2) * 0.25 : 0);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.12, 8, false), spar);
    m.castShadow = m.receiveShadow = true; return m;
  };
  root.add(post(1), post(-1));
  const keelPts = [];
  for (let i = 0; i <= 24; i++) { const s = -0.9 + 1.8 * i / 24; keelPts.push(new THREE.Vector3(s * L / 2, H.keelY(s) - 0.08, 0)); }
  const keel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(keelPts), 48, 0.1, 6, false), spar);
  keel.castShadow = true; root.add(keel);
  // gunwale caps
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const s = -0.94 + 1.88 * i / 40; pts.push(new THREE.Vector3(s * L / 2, H.sheerY(s) + 0.03, side * (H.beam(s) * 1.06 + 0.03))); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.07, 6, false), spar);
    m.castShadow = true; root.add(m);
  }
  // half decks fore and aft, cargo under hides in the open hold
  const deckMat = await loadPBR('pbr/acg_planks21', ctx, { repeat: [2, 1], color: new THREE.Color(0.45, 0.38, 0.3) });
  for (const [x0, x1] of [[-7.0, -4.2], [4.6, 7.0]]) {
    const cx = (x0 + x1) / 2, s = cx / (L / 2);
    const d = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, H.beam(s) * 1.8), deckMat);
    d.position.set(cx, H.sheerY(s) - 0.35, 0); d.castShadow = d.receiveShadow = true; root.add(d);
  }
  // cargo: bales and casks lashed under greased hides (dark, lumpy)
  const hide = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.055, 0.04, 0.028), roughness: 0.75 });
  for (let i = 0; i < 9; i++) {
    const x = -3.6 + i * 0.85 + ((i * 37) % 5) * 0.06, s = x / (L / 2);
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {           // soften into a lumpy, lashed bale
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
      const r = v.length(); v.multiplyScalar((0.55 + 0.45 / Math.max(r, 0.5)) * (1 + 0.06 * Math.sin(k * 12.9898 + i)));
      p.setXYZ(k, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, hide);
    m.scale.set(0.7 + 0.2 * ((i * 3) % 4) / 3, 0.5 + 0.25 * ((i * 7) % 3) / 2, H.beam(s) * (1.1 + 0.2 * (i % 2)));
    m.position.set(x, 0.42 + 0.1 * (i % 3), ((i * 5) % 3 - 1) * 0.18);
    m.rotation.y = ((i * 11) % 5 - 2) * 0.06;
    m.castShadow = m.receiveShadow = true; root.add(m);
  }

  // mast, yard, sail
  const mastX = 0.6, mastH = 12.2, yardY = 10.9, yardL = 10.6;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, mastH, 10), spar);
  mast.position.set(mastX, mastH / 2 - 0.6, 0); mast.castShadow = mast.receiveShadow = true; root.add(mast);
  const rig = new THREE.Group(); rig.position.set(mastX, 0, 0); root.add(rig);      // turns with the yard (braced)
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, yardL, 8), spar);
  yard.rotation.x = Math.PI / 2; yard.position.set(0.18, yardY, 0); yard.castShadow = true; rig.add(yard);
  const sailCol = new THREE.Color(...(opts.sailColor || [0.5, 0.44, 0.35]));
  const sailMat = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [1 / 1.1, 1 / 1.1], color: sailCol });
  sailMat.side = THREE.DoubleSide; sailMat.roughness = 1;
  // seams of the woven cloths (~0.7 m wide strips sewn together) and weather staining; backlit
  // canvas lets some daylight through (thin wool: transmission, not glow)
  sailMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSailUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSailUv = uv;');
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vSailUv;
float skH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float skN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(skH(i), skH(i+vec2(1,0)), f.x), mix(skH(i+vec2(0,1)), skH(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float cl = vSailUv.x / 0.72;
  float seam = smoothstep(0.88, 0.97, abs(fract(cl) - 0.5) * 2.0);
  float aa = 1.0 - smoothstep(0.3, 0.8, fwidth(cl));
  float strip = skH(vec2(floor(cl), 3.0));
  diffuseColor.rgb *= (0.9 + 0.18 * strip * aa) * (1.0 - 0.25 * seam * aa);
  float stain = skN(vSailUv * vec2(0.6, 0.35)) * 0.6 + skN(vSailUv * 2.1) * 0.4;
  diffuseColor.rgb *= mix(1.0, 0.72, smoothstep(0.55, 0.85, stain) * (0.4 + 0.6 * smoothstep(3.0, 0.0, vSailUv.y)));
}`);
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const a0 = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
    const b0 = a0 >= 0 ? chunk.indexOf('#endif', chunk.indexOf('#pragma unroll_loop_end', a0)) : -1;
    if (a0 >= 0 && b0 > a0) {
      let block = chunk.slice(a0, b0 + '#endif'.length);
      block = block.replace(/RE_Direct\(\s*directLight[^;]*;/, 'reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * 0.35 * saturate(-dot(geometryNormal, directLight.direction)) * (0.4 + 1.2 * pow(saturate(dot(-geometryViewDir, directLight.direction)), 4.0)) * RECIPROCAL_PI;');
      fs = fs.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n{\n' + block + '\n}\n');
    }
    sh.fragmentShader = fs;
  };
  sailMat.customProgramCacheKey = () => 'dk-knarr-sail';
  const sailTop = yardY - 0.12, sailBot = 2.1, sailH = sailTop - sailBot;
  const fill = opts.sailFill ?? 1;
  const sail = new THREE.Mesh(sailGeometry(yardL * 0.92, yardL * 0.98, sailH, 1.25 * fill), sailMat);
  sail.position.set(0.3, (sailTop + sailBot) / 2, 0);
  sail.castShadow = true; sail.receiveShadow = true; sail.name = 'sail';
  rig.add(sail);

  // standing and running rigging (walrus-hide / bast rope, dark)
  const ropeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.045, 0.03), roughness: 0.9 });
  const top = new THREE.Vector3(mastX, mastH - 0.7, 0);
  const stemTop = new THREE.Vector3(L / 2 + 0.2, H.sheerY(1) + 0.6, 0);
  const sternTop = new THREE.Vector3(-L / 2 - 0.2, H.sheerY(1) + 0.4, 0);
  root.add(rope(top, stemTop, 0.25, 0.028, ropeMat));                   // forestay
  root.add(rope(top, sternTop, 0.3, 0.025, ropeMat));                   // backstay
  for (const side of [-1, 1]) for (const dx of [-0.6, -2.2]) {          // shrouds, a little aft of the mast
    const x = mastX + dx, s = x / (L / 2);
    root.add(rope(top.clone().add(new THREE.Vector3(0, -0.3, side * 0.12)), new THREE.Vector3(x, H.sheerY(s) + 0.05, side * H.beam(s) * 1.05), 0.08, 0.022, ropeMat));
  }
  const ropes = new THREE.Group(); root.add(ropes);
  const rigRopes = () => {
    // braces from the yard arms and sheets from the clews to the after part of the hull
    ropes.clear();
    rig.updateMatrixWorld(true); root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const W = (v) => v.clone().applyMatrix4(rig.matrixWorld).applyMatrix4(inv);
    for (const side of [-1, 1]) {
      const arm = W(new THREE.Vector3(0.18, yardY, side * yardL / 2 * 0.96));
      const clew = W(new THREE.Vector3(0.3 + 1.25 * fill * 0.15, sailBot + 0.2, side * yardL * 0.98 / 2));
      const aft = new THREE.Vector3(-L / 2 + 2.2, H.sheerY(-0.72) + 0.1, side * H.beam(-0.72) * 0.95);
      const mid = new THREE.Vector3(-1.5, H.sheerY(-0.2) + 0.1, side * H.beam(-0.2) * 1.0);
      ropes.add(rope(arm, aft, 0.6, 0.02, ropeMat), rope(clew, mid, 0.25, 0.022, ropeMat));
    }
    ropes.add(rope(W(new THREE.Vector3(0.18, yardY + 0.15, 0)), new THREE.Vector3(mastX - 0.25, mastH - 0.4, 0), 0.0, 0.025, ropeMat));
  };

  // side rudder on the starboard quarter, tiller across the after deck
  const rudderMat = spar;
  const rudder = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.6, 0.09), rudderMat);
  blade.position.set(-0.1, -0.7, 0); blade.castShadow = true; rudder.add(blade);
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), rudderMat);
  stock.position.set(0, 1.1, 0); stock.castShadow = true; rudder.add(stock);
  rudder.position.set(-L / 2 + 1.6, 0.3, H.beam(-0.8) + 0.25); rudder.rotation.z = -0.18; root.add(rudder);

  // crew (optional)
  if (opts.crew) for (const c of opts.crew) root.add(c);

  /** brace the yard round (radians about the mast) and set the belly of the sail (fill multiplier). */
  function setRig(braceAngle = 0) {
    rig.rotation.y = braceAngle;
    rigRopes();
  }
  setRig(opts.brace ?? 0);
  return { root, hull, sail, rig, setRig, length: L, beam: B, sheerY: H.sheerY, beamAt: H.beam };
}
