// Small props for style frames and sets (procedural, deterministic): leather straps, market
// food (loaves, rolls, apples, onions, cheeses, fish, pies), baskets of goods, trestles.
//
// Everything is built once in setup() except strapRibbon (rebuilt per frame where a strap follows
// a moving body). Materials are three.js physical materials (the cinematic stack patches them).
import * as THREE from 'three';

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();

/**
 * A flat leather strap along a curve: width w, thickness th, `n` segments. faceRef (world vector,
 * optional) is the direction the strap's broad face looks toward (it lies flat against a body
 * whose surface faces that way); without it the strap lies flat to the curve's own bend.
 */
export function strapRibbon(curve, w, th, n = 48, faceRef = null) {
  const pos = [], nor = [], uv = [], idx = [];
  const P = curve.getSpacedPoints(n);
  let prevB = null;
  for (let i = 0; i <= n; i++) {
    const p = P[i];
    _t.copy(P[Math.min(n, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    // width axis: perpendicular to the tangent and to the face direction
    if (faceRef) _b.copy(faceRef).cross(_t);
    else _b.set(0, 1, 0).cross(_t);
    if (_b.lengthSq() < 1e-6) _b.copy(prevB || new THREE.Vector3(1, 0, 0));
    _b.normalize();
    if (prevB && _b.dot(prevB) < 0) _b.negate();
    prevB = _b.clone();
    _n.copy(_t).cross(_b).normalize();
    // 4 corners of the section (a thin rectangle), with a slight edge bevel in the normals
    const corners = [[-w / 2, -th / 2], [w / 2, -th / 2], [w / 2, th / 2], [-w / 2, th / 2]];
    const ns = [[-0.3, -1], [0.3, -1], [0.3, 1], [-0.3, 1]];
    for (let k = 0; k < 4; k++) {
      const [a, c] = corners[k];
      pos.push(p.x + _b.x * a + _n.x * c, p.y + _b.y * a + _n.y * c, p.z + _b.z * a + _n.z * c);
      const nn = new THREE.Vector3().addScaledVector(_b, ns[k][0]).addScaledVector(_n, ns[k][1]).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(k / 4, i / n * curve.getLength() / w);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ food --
function rng32(seed) { let a = seed >>> 0 || 1; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }

/** Displace a sphere-ish geometry with low-frequency lumps (seeded). */
function lumpy(g, amp, seed, freq = 3) {
  const r = rng32(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const k = 1 + amp * (Math.sin(x / l * freq + ph[0]) * Math.sin(y / l * freq * 1.3 + ph[1]) + 0.5 * Math.sin(z / l * freq * 2.1 + ph[2]) * Math.sin(x / l * freq * 1.7 + ph[3]));
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Materials for market food (linear colours; crust, apple skin, onion skin, rind ...). */
export function foodMaterials() {
  const M = (c, rough, o = {}) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...c), roughness: rough, ...o });
  return {
    crust: M([0.32, 0.16, 0.055], 0.72, { sheen: 0.3, sheenColor: new THREE.Color(0.6, 0.4, 0.2), sheenRoughness: 0.6 }),
    crustPale: M([0.46, 0.3, 0.13], 0.8),
    crumb: M([0.62, 0.52, 0.36], 0.9),
    appleRed: M([0.32, 0.035, 0.02], 0.38, { clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    appleGreen: M([0.25, 0.3, 0.05], 0.4, { clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    onion: M([0.42, 0.22, 0.08], 0.55, { sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.6, 0.4) }),
    cheese: M([0.55, 0.38, 0.12], 0.6),
    rind: M([0.36, 0.2, 0.06], 0.55),
    fish: M([0.28, 0.3, 0.31], 0.25, { metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    cabbage: M([0.16, 0.24, 0.07], 0.6),
    turnip: M([0.6, 0.55, 0.45], 0.6),
    wicker: M([0.34, 0.24, 0.12], 0.85),
    cloth: M([0.55, 0.5, 0.42], 0.92, { sheen: 0.4, sheenColor: new THREE.Color(0.8, 0.78, 0.72), sheenRoughness: 0.7 }),
    board: M([0.2, 0.13, 0.075], 0.78),
    clay: M([0.36, 0.17, 0.08], 0.75),
  };
}

/**
 * A market tray / basket of goods as one group: kind 'bread' | 'rolls' | 'apples' | 'onions' |
 * 'cheese' | 'fish' | 'veg'. Sized for a stall counter (about 0.5 x 0.35 m).
 */
export function goods(kind, mats, seed = 1, o = {}) {
  const r = rng32(seed * 7919 + kind.length * 31);
  const grp = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(...s);
    m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
  };
  const W = o.w ?? 0.55, D = o.d ?? 0.38;
  // a shallow basket (wicker) or a board, under the goods
  const basket = kind !== 'cheese' && kind !== 'fish';
  if (basket) {
    const prof = [[0, 0], [0.5, 0], [0.52, 0.02], [0.56, 0.11], [0.54, 0.115], [0.5, 0.025], [0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
    const b = add(new THREE.LatheGeometry(prof, 28), mats.wicker, 0, 0, 0);
    b.scale.set(W, 1, D);
  } else add(new THREE.BoxGeometry(W, 0.03, D), mats.board, 0, 0.015, 0);
  const n = o.n ?? (kind === 'bread' ? 7 : kind === 'cheese' ? 3 : kind === 'fish' ? 6 : 26);
  for (let i = 0; i < n; i++) {
    const u = (r() - 0.5) * W * 0.78, v = (r() - 0.5) * D * 0.7, layer = i / n;
    const y0 = basket ? 0.04 + layer * 0.06 : 0.03;
    if (kind === 'bread') {
      const g = lumpy(new THREE.SphereGeometry(0.075, 18, 12), 0.08, seed + i);
      const m = add(g, r() < 0.4 ? mats.crustPale : mats.crust, u, y0 + 0.035, v, 0, r() * 6, 0, [1.25 + r() * 0.4, 0.6 + r() * 0.15, 0.95]);
      void m;
    } else if (kind === 'rolls') {
      add(lumpy(new THREE.SphereGeometry(0.04, 14, 10), 0.08, seed + i), mats.crust, u, y0 + 0.02, v, 0, r() * 6, 0, [1.1, 0.72, 1]);
    } else if (kind === 'apples') {
      add(lumpy(new THREE.SphereGeometry(0.036, 14, 10), 0.05, seed + i, 2), r() < 0.6 ? mats.appleRed : mats.appleGreen, u, y0 + 0.03, v, r(), r() * 6, r(), [1, 0.9, 1]);
    } else if (kind === 'onions') {
      add(lumpy(new THREE.SphereGeometry(0.035, 12, 10), 0.06, seed + i, 2), mats.onion, u, y0 + 0.03, v, r(), r() * 6, r(), [1, 0.85, 1]);
    } else if (kind === 'veg') {
      if (i % 3 === 0) add(lumpy(new THREE.SphereGeometry(0.075, 14, 10), 0.12, seed + i, 4), mats.cabbage, u, y0 + 0.05, v, r(), r() * 6, 0);
      else add(lumpy(new THREE.SphereGeometry(0.035, 12, 8), 0.06, seed + i), mats.turnip, u, y0 + 0.03, v, r(), r() * 6, r(), [1, 1.2, 1]);
    } else if (kind === 'cheese') {
      const R0 = 0.09 + r() * 0.04;
      add(new THREE.CylinderGeometry(R0, R0 * 1.02, 0.07, 28), mats.rind, u * 0.7, 0.065 + (i ? 0 : 0), v * 0.6, 0, 0, 0);
    } else if (kind === 'fish') {
      const g = new THREE.SphereGeometry(0.03, 14, 8); g.scale(5.5, 0.9, 1.6);
      add(g, mats.fish, (i - n / 2) * 0.07, 0.045, (r() - 0.5) * 0.05, 0, Math.PI / 2 + (r() - 0.5) * 0.3, 0.05);
    }
  }
  return grp;
}
