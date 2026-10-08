// Weapon and tool models: real-scale silhouettes built from extruded side profiles, lathed tubes and
// bevelled boxes, with PBR gunmetal / polymer / wood. Every moving part is a named node so the
// first-person and third-person animation can work the action: mag, bolt / charging handle, slide,
// pump, hammer, trigger, revolver cylinder + crane, break-action barrel + top lever, dust cover.
//
// Gun space: -Z is forward along the bore, +Y up, +X right. Origin sits on the bore axis above the
// trigger. userData: muzzleZ, sightY, railY, railZ, grip (right hand), fore (left hand, or null),
// magWell, eject (ejection port), casing ('rifle' | 'pistol' | 'shell' | 'big' | null), parts, kind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS } from './data/catalog.js';

// ---------------------------------------------------------------- materials
let TEX = null;
const MATS = new Map();
export function setWeaponTextures(T) { TEX = T; MATS.clear(); }

let _wood = null;
function woodMap() {
  if (!TEX) return null;
  if (!_wood || _wood.image !== TEX.wood.map.image) { _wood = TEX.wood.map.clone(); _wood.repeat.set(5, 5); _wood.needsUpdate = true; }
  return _wood;
}

function M(kind, camo) {
  const key = kind + (camo ? camo.id : '');
  if (MATS.has(key)) return MATS.get(key);
  const T = TEX;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const nm = (name, s) => (T && T[name] ? { normalMap: T[name].nr, normalScale: new THREE.Vector2(s, s) } : {});
  let m;
  const metalCamo = camo && camo.metal;
  switch (kind) {
    case 'steel': m = std({ color: metalCamo ? camo.skin : 0x34373c, metalness: 0.92, roughness: metalCamo ? 0.22 : 0.36, ...nm('metal', 0.25), roughnessMap: T ? T.metal.rough : null }); break;
    case 'blued': m = std({ color: metalCamo ? camo.skin : 0x1d2026, metalness: 0.85, roughness: metalCamo ? 0.25 : 0.3, ...nm('metal', 0.15) }); break;
    case 'park': m = std({ color: camo && !metalCamo ? camo.skin : metalCamo ? camo.skin : 0x23262a, metalness: metalCamo ? 0.95 : 0.55, roughness: metalCamo ? 0.25 : 0.55, ...nm('metal', 0.35) }); break;
    case 'poly': m = std({ color: camo ? camo.skin : 0x1e2125, metalness: metalCamo ? 0.95 : 0, roughness: metalCamo ? 0.25 : 0.62, ...nm('fabric', 0.18) }); break;
    case 'tan': m = std({ color: camo ? camo.skin : 0x8a7a5c, metalness: metalCamo ? 0.95 : 0, roughness: 0.6, ...nm('fabric', 0.18) }); break;
    case 'wood': m = std({ color: camo ? camo.skin : 0xb0703e, map: camo ? null : woodMap(), metalness: metalCamo ? 0.95 : 0, roughness: metalCamo ? 0.25 : 0.48, ...nm('wood', 0.5) }); break;
    case 'rubber': m = std({ color: 0x141414, roughness: 0.92, ...nm('fabric', 0.6) }); break;
    case 'brass': m = std({ color: 0xc09a3a, metalness: 1, roughness: 0.28 }); break;
    case 'shell': m = std({ color: 0x9a1e1a, roughness: 0.5 }); break;
    case 'blade': m = std({ color: 0xd0d4d8, metalness: 1, roughness: 0.16, ...nm('metal', 0.08) }); break;
    case 'orange': m = std({ color: 0xff5a10, roughness: 0.5 }); break;
    case 'bore': m = std({ color: 0x050505, roughness: 0.9 }); break;
    case 'lens': m = new THREE.MeshPhysicalMaterial({ color: 0x1a2a3a, metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.85 }); break;
    case 'glass': m = new THREE.MeshPhysicalMaterial({ color: 0x9ab0c0, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, depthWrite: false }); break;
    case 'reticle': m = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }); break;
    case 'cord': m = std({ color: 0x3a4a2a, roughness: 0.95, ...nm('fabric', 1) }); break;
    case 'tape': m = std({ color: 0x2a2a2a, roughness: 0.8, ...nm('fabric', 0.6) }); break;
    case 'gold': m = std({ color: 0xd4af37, metalness: 1, roughness: 0.25 }); break;
    default: m = std({ color: 0xff00ff });
  }
  MATS.set(key, m);
  return m;
}

// ---------------------------------------------------------------- geometry helpers
const GEO = new Map();
const cached = (key, fn) => { if (!GEO.has(key)) GEO.set(key, fn()); return GEO.get(key); };

// Side profile in gun space ([z, y] points, z negative forward), extruded across X.
// A point can be ['q', cz, cy, z, y] for a quadratic curve to (z, y).
function profile(key, pts, width, bevel = 0.0025) {
  return cached('p' + key + width, () => {
    const s = new THREE.Shape();
    s.moveTo(-pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] === 'q') s.quadraticCurveTo(-p[1], p[2], -p[3], p[4]); else s.lineTo(-p[0], p[1]);
    }
    const b = Math.min(bevel, width * 0.3);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, width - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 8 });
    g.translate(0, 0, -(width - 2 * b) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

// Rounded box.
function rbox(w, h, d, r = 0.003) {
  return cached(`rb${w},${h},${d},${r}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
      const d2 = v.sub(c);
      if (d2.lengthSq() > 0) d2.setLength(r);
      p.setXYZ(i, c.x + d2.x, c.y + d2.y, c.z + d2.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Tube along Z (front radius, back radius, length), centered.
function tube(rf, rb, len, seg = 16, open = false) {
  return cached(`t${rf},${rb},${len},${seg},${open}`, () => { const g = new THREE.CylinderGeometry(rf, rb, len, seg, 1, open); g.rotateX(-Math.PI / 2); return g; });
}
// Lathe along Z: points [radius, forward-distance] from the back (0) towards the muzzle.
function lathe(key, pts, seg = 20) {
  return cached('l' + key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, f]) => new THREE.Vector2(r, f)), seg);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}
function cylX(r, len, seg = 12) { return cached(`cx${r},${len},${seg}`, () => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; }); }
function cylY(r, len, seg = 12) { return cached(`cy${r},${len},${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)); }

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, name = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (name) m.name = name;
  parent.add(m);
  return m;
}
function part(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// picatinny rail: base + cross slots
function rail(g, mat, z0, z1, y, w = 0.021) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  add(g, rbox(w, 0.006, len, 0.001), mat, 0, y + 0.003, zc);
  const n = Math.floor(len / 0.01);
  for (let i = 0; i < n; i++) add(g, rbox(w * 1.05, 0.004, 0.0052, 0.0008), mat, 0, y + 0.008, Math.min(z0, z1) + 0.005 + i * 0.01);
}

// detachable box magazine with feed lips and base plate; curve > 0 bends it forward (AK)
function boxMag(g, key, { z, y, len, depth, width, curve = 0, mat, base, ribs = 0, tilt = 0 }) {
  const n = 8, pts = [];
  // front edge down, rear edge back up
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([z - depth / 2 - curve * t * t, y - len * t]); }
  for (let i = n; i >= 0; i--) { const t = i / n; pts.push([z + depth / 2 - curve * t * t, y - len * t + (i === n ? 0.004 : 0)]); }
  const mag = part(g, 'mag');
  add(mag, profile(key, pts, width, 0.002), mat);
  add(mag, rbox(width * 1.25, 0.008, depth * 1.12, 0.002), base || mat, 0, y - len - 0.002, z - curve * 0.98);
  for (let i = 1; i <= ribs; i++) { const t = i / (ribs + 1); add(mag, rbox(width * 1.08, 0.004, depth * 0.85, 0.001), mat, 0, y - len * t, z - curve * t * t); }
  // the top round, visible in the feed lips
  add(mag, tube(0.0035, 0.0045, depth * 0.8, 8), M('brass'), 0, y + 0.002, z);
  mag.rotation.x = tilt;
  return mag;
}

function drumMag(g, z, y, mat) {
  const mag = part(g, 'mag');
  add(mag, rbox(0.024, 0.05, 0.045, 0.003), mat, 0, y - 0.02, z);
  add(mag, cylX(0.065, 0.05, 28), mat, 0, y - 0.1, z - 0.01);
  add(mag, cylX(0.05, 0.056, 28), M('park'), 0, y - 0.1, z - 0.01);
  add(mag, cylX(0.012, 0.06, 10), M('steel'), 0, y - 0.1, z - 0.01);
  return mag;
}

function trigger(g, z, y, s = 1) {
  const t = part(g, 'trigger', 0, y, z);
  add(t, profile('trig', [[0.0, 0], [-0.004, 0], ['q', -0.012, -0.012, -0.004, -0.024], [-0.001, -0.024], ['q', -0.006, -0.012, 0.0, 0]], 0.006, 0.001), M('steel'));
  t.scale.setScalar(s);
  return t;
}

function triggerGuard(g, mat, z0, z1, y0, depth, w = 0.012) {
  const pts = [[z0, y0], [z0, y0 - depth + 0.006], ['q', z0, y0 - depth, z0 - 0.008, y0 - depth], [z1 + 0.006, y0 - depth], ['q', z1, y0 - depth, z1, y0 - depth + 0.012], [z1, y0], [z1 + 0.005, y0], [z1 + 0.005, y0 - depth + 0.012], ['q', z1 + 0.005, y0 - depth + 0.005, z1 + 0.01, y0 - depth + 0.005], [z0 - 0.006, y0 - depth + 0.005], ['q', z0 - 0.005, y0 - depth + 0.005, z0 - 0.005, y0 - depth + 0.01], [z0 - 0.005, y0]];
  add(g, profile(`tg${z0},${z1},${y0},${depth}`, pts, w, 0.0015), mat);
}

function pistolGrip(g, mat, key, z, y, h = 0.11, angle = 0.3, w = 0.03, d = 0.04) {
  const k = Math.tan(angle);
  const pts = [[z - d / 2, y], [z + d / 2 + 0.004, y], ['q', z + d / 2 + 0.012, y - h * 0.5, z + d / 2 + h * k, y - h], [z - d / 2 + h * k, y - h - 0.004],
    ['q', z - d / 2 + h * k * 0.6 - 0.004, y - h * 0.62, z - d / 2 + h * k * 0.5, y - h * 0.5], ['q', z - d / 2 + h * k * 0.35 - 0.005, y - h * 0.32, z - d / 2 + h * k * 0.2, y - h * 0.2], [z - d / 2, y]];
  add(g, profile('pg' + key, pts, w, 0.004), mat);
}

function ironSights(g, frontZ, rearZ, y, mat, h = 0.02) {
  add(g, rbox(0.012, h * 0.6, 0.012, 0.002), mat, 0, y + h * 0.3, frontZ);
  add(g, rbox(0.003, h * 0.5, 0.003, 0.001), mat, 0, y + h * 0.8, frontZ);
  for (const s of [-1, 1]) add(g, rbox(0.004, h, 0.006, 0.001), mat, s * 0.006, y + h * 0.5, rearZ);
  add(g, rbox(0.016, h * 0.4, 0.006, 0.001), mat, 0, y + h * 0.2, rearZ);
}

// ---------------------------------------------------------------- optics
function addOptic(g, optic, railY, railZ) {
  const ring = M('park'), body = M('blued');
  if (optic === 'reddot') {
    const y = railY + 0.022;
    add(g, rbox(0.018, 0.012, 0.03, 0.002), ring, 0, railY + 0.008, railZ);
    add(g, tube(0.017, 0.017, 0.07, 18), body, 0, y, railZ);
    add(g, cylX(0.006, 0.01, 10), body, 0.02, y, railZ);
    add(g, cylY(0.006, 0.008, 10), body, 0, y + 0.02, railZ);
    add(g, tube(0.0145, 0.0145, 0.002, 18), M('lens'), 0, y, railZ - 0.034);
    add(g, tube(0.0145, 0.0145, 0.002, 18), M('lens'), 0, y, railZ + 0.034);
    add(g, new THREE.SphereGeometry(0.0012, 6, 4), M('reticle'), 0, y, railZ - 0.02);
    return y;
  }
  if (optic === 'holo') {
    const y = railY + 0.03;
    add(g, rbox(0.03, 0.02, 0.1, 0.003), body, 0, railY + 0.012, railZ + 0.01);
    // hood frame around the window
    add(g, rbox(0.004, 0.034, 0.05, 0.001), body, 0.017, y, railZ - 0.012);
    add(g, rbox(0.004, 0.034, 0.05, 0.001), body, -0.017, y, railZ - 0.012);
    add(g, rbox(0.038, 0.004, 0.05, 0.001), body, 0, y + 0.017, railZ - 0.012);
    add(g, new THREE.PlaneGeometry(0.03, 0.03), M('glass'), 0, y, railZ - 0.03, 0, Math.PI);
    add(g, new THREE.TorusGeometry(0.0055, 0.0005, 4, 20), M('reticle'), 0, y, railZ - 0.031);
    add(g, new THREE.SphereGeometry(0.0008, 6, 4), M('reticle'), 0, y, railZ - 0.031);
    return y;
  }
  // magnified scopes: tube + objective/ocular bells + turrets + rings
  const mag = optic === 'scope10' ? 10 : optic === 'scope6' ? 6 : optic === 'scope4' ? 4 : 1.5;
  const len = 0.16 + mag * 0.017, tr = mag >= 6 ? 0.015 : 0.0127, obj = mag >= 6 ? 0.028 : mag >= 4 ? 0.022 : 0.017;
  const y = railY + 0.012 + obj + 0.004;
  const pts = [[0, 0], [0.019, 0], [0.02, 0.012], [0.017, 0.04], [tr, 0.055], [tr, len - 0.07], [obj, len - 0.03], [obj, len], [obj * 0.92, len], [0, len - 0.002]];
  add(g, lathe('scope' + optic, pts, 24), body, 0, y, railZ + len / 2 - 0.02);
  add(g, tube(obj * 0.88, obj * 0.88, 0.002, 20), M('lens'), 0, y, railZ - len / 2 - 0.021);
  add(g, tube(0.016, 0.016, 0.002, 20), M('lens'), 0, y, railZ + len / 2 - 0.019);
  add(g, cylY(0.011, 0.02, 14), body, 0, y + tr + 0.01, railZ - 0.005);
  add(g, cylX(0.011, 0.02, 14), body, tr + 0.01, y, railZ - 0.005);
  for (const dz of [-0.045, 0.04]) {
    add(g, tube(tr + 0.004, tr + 0.004, 0.014, 18), ring, 0, y, railZ + dz);
    add(g, rbox(0.02, y - railY - tr, 0.014, 0.002), ring, 0, railY + (y - railY - tr) / 2, railZ + dz);
  }
  return y;
}

// ---------------------------------------------------------------- the guns
function buildAR(g, P, o) {
  const { lower, upper, furn } = o;
  // lower receiver with magwell and trigger guard
  add(g, profile('arlow', [[0.065, -0.034], [-0.175, -0.034], [-0.175, -0.07], [-0.165, -0.1], [-0.105, -0.1], [-0.1, -0.074], [0.03, -0.074], [0.065, -0.05]], 0.03), lower);
  // upper receiver, flat top rail
  add(g, profile('arup', [[0.075, -0.034], [0.075, 0.016], [-0.205, 0.016], [-0.205, -0.034]], 0.032), upper);
  rail(g, upper, 0.072, -0.2, 0.016);
  // ejection port + dust cover, forward assist, brass deflector
  add(g, rbox(0.002, 0.016, 0.05, 0.0005), M('bore'), 0.0165, -0.006, -0.06);
  P.dust = add(g, rbox(0.003, 0.018, 0.052, 0.0008), upper, 0.0175, -0.006, -0.06, 0, 0, 0, 'dust');
  add(g, cylX(0.007, 0.022, 12), upper, 0.02, 0.004, 0.02);
  add(g, rbox(0.01, 0.014, 0.012, 0.002), upper, 0.02, 0.005, -0.03);
  // charging handle
  P.bolt = part(g, 'bolt', 0, 0.01, 0.075);
  add(P.bolt, rbox(0.012, 0.008, 0.02, 0.001), upper, 0, 0, 0.004);
  add(P.bolt, rbox(0.045, 0.008, 0.012, 0.002), upper, 0, 0, 0.012);
  // handguard (free-float octagon with M-LOK slots)
  const hgLen = o.hgLen || 0.31;
  add(g, tube(0.026, 0.027, hgLen, 8), furn, 0, -0.008, -0.205 - hgLen / 2, 0, 0, Math.PI / 8);
  for (let i = 0; i < Math.floor(hgLen / 0.05); i++) for (const s of [-1, 1]) add(g, rbox(0.002, 0.008, 0.03, 0.001), M('bore'), s * 0.0265, -0.008, -0.23 - i * 0.05);
  rail(g, upper, -0.205, -0.205 - hgLen, 0.016, 0.019);
  // barrel, gas block, flash hider
  const bEnd = -0.205 - hgLen - 0.09;
  add(g, tube(0.0085, 0.0095, -0.205 - hgLen - bEnd + 0.02, 14), M('blued'), 0, 0, (-0.205 - hgLen + bEnd) / 2);
  add(g, lathe('a2fh', [[0, 0], [0.011, 0], [0.011, 0.055], [0.0045, 0.055], [0, 0.054]], 16), M('park'), 0, 0, bEnd);
  for (let i = 0; i < 6; i++) add(g, rbox(0.0024, 0.0024, 0.03, 0.0005), M('bore'), Math.cos(i * 1.047) * 0.0105, Math.sin(i * 1.047) * 0.0105, bEnd - 0.035);
  // buffer tube + collapsible stock
  add(g, tube(0.0145, 0.0145, 0.2, 14), M('park'), 0, -0.005, 0.17);
  add(g, profile('arstock', [[0.17, 0.02], [0.3, 0.025], [0.315, 0.02], [0.32, -0.085], [0.3, -0.09], [0.26, -0.03], [0.17, -0.025]], 0.042, 0.005), furn);
  add(g, rbox(0.044, 0.112, 0.012, 0.004), M('rubber'), 0, -0.032, 0.322);
  pistolGrip(g, furn, 'ar', 0.065, -0.05, 0.1, 0.32, 0.03, 0.036);
  triggerGuard(g, lower, 0.035, -0.035, -0.074, 0.03);
  P.trigger = trigger(g, -0.002, -0.068);
  add(g, rbox(0.006, 0.01, 0.01, 0.001), lower, 0.017, -0.05, -0.098); // mag release
  add(g, rbox(0.004, 0.014, 0.016, 0.001), lower, -0.017, -0.045, -0.085); // bolt catch
  add(g, rbox(0.004, 0.012, 0.02, 0.001), lower, -0.017, -0.05, 0.035); // safety
  return bEnd - 0.055;
}

function buildRifle(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const drum = inst && inst.att && inst.att.mag === 'drum';
  const magMul = inst && inst.att && inst.att.mag && !drum ? ITEMS[inst.att.mag].magMul || 1 : 1;
  const ud = g.userData;
  if (def.id === 'ka43' || def.shape === 'rifle_wood') {
    const steel = M('park', camo), wood = M('wood', camo);
    // stamped receiver with ribbed dust cover
    add(g, profile('akrec', [[0.06, -0.05], [0.06, 0.004], ['q', 0.06, 0.022, 0.04, 0.022], [-0.2, 0.022], [-0.205, 0.0], [-0.205, -0.05], [-0.175, -0.06], [-0.12, -0.06], [-0.115, -0.05]], 0.036), steel);
    for (let i = 0; i < 4; i++) add(g, rbox(0.03, 0.003, 0.004, 0.001), steel, 0, 0.023, 0.03 - i * 0.008);
    P.dust = add(g, rbox(0.034, 0.004, 0.18, 0.002), steel, 0, 0.022, -0.09, 0, 0, 0, 'dust');
    // charging handle on the right
    P.bolt = part(g, 'bolt', 0.021, 0.004, -0.06);
    add(P.bolt, rbox(0.006, 0.008, 0.06, 0.001), steel, 0, 0, 0.02);
    add(P.bolt, cylX(0.006, 0.02, 10), steel, 0.012, 0, -0.005);
    add(g, rbox(0.004, 0.022, 0.09, 0.001), steel, 0.019, -0.02, -0.03, 0.06); // safety lever
    // furniture
    add(g, profile('akhgl', [[-0.215, -0.006], [-0.39, -0.006], ['q', -0.4, -0.02, -0.39, -0.042], [-0.23, -0.046], ['q', -0.215, -0.044, -0.212, -0.03]], 0.044, 0.006), wood);
    add(g, profile('akhgu', [[-0.215, 0.008], [-0.37, 0.008], [-0.37, 0.026], ['q', -0.29, 0.036, -0.215, 0.028]], 0.032, 0.005), wood);
    add(g, tube(0.0095, 0.0095, 0.08, 12), steel, 0, 0.018, -0.41);
    add(g, tube(0.009, 0.0095, 0.25, 14), M('blued', camo), 0, 0, -0.5);
    add(g, rbox(0.022, 0.05, 0.03, 0.003), steel, 0, 0.012, -0.53); // front sight block
    add(g, rbox(0.003, 0.016, 0.003, 0.001), steel, 0, 0.044, -0.53);
    add(g, profile('akbrake', [[-0.6, -0.012], [-0.6, 0.012], [-0.64, 0.012], [-0.65, -0.004], [-0.65, -0.012]], 0.022, 0.002), steel);
    add(g, rbox(0.02, 0.012, 0.03, 0.002), steel, 0, 0.026, -0.17); // rear sight base
    add(g, rbox(0.016, 0.004, 0.05, 0.001), steel, 0, 0.034, -0.16, 0.08);
    add(g, profile('akstock', [[0.06, 0.004], [0.4, -0.02], [0.405, -0.13], [0.39, -0.135], ['q', 0.24, -0.09, 0.1, -0.05], [0.06, -0.05]], 0.042, 0.006), wood);
    add(g, rbox(0.044, 0.118, 0.008, 0.002), steel, 0, -0.07, 0.407, -0.2);
    pistolGrip(g, M('poly', camo), 'ak', 0.07, -0.05, 0.1, 0.3, 0.028, 0.034);
    triggerGuard(g, steel, 0.04, -0.03, -0.055, 0.03);
    P.trigger = trigger(g, 0.002, -0.05);
    if (drum) P.mag = drumMag(g, -0.15, -0.06, steel);
    else P.mag = boxMag(g, 'ak' + magMul, { z: -0.145, y: -0.055, len: 0.2 * (0.55 + 0.45 * magMul), depth: 0.055, width: 0.026, curve: 0.07 * magMul, mat: M('park', camo), ribs: 3 });
    Object.assign(ud, { muzzleZ: -0.65, sightY: 0.045, railY: 0.038, railZ: -0.06, grip: new THREE.Vector3(0, -0.075, 0.085), fore: new THREE.Vector3(0, -0.035, -0.3), magWell: new THREE.Vector3(0, -0.06, -0.145), eject: new THREE.Vector3(0.02, 0.005, -0.08), casing: 'rifle' });
    return;
  }
  const isPatriot = def.shape === 'rifle_pump';
  const muzzle = buildAR(g, P, { lower: M('park', camo), upper: M('park', camo), furn: M('poly', camo), hgLen: isPatriot ? 0.17 : 0.31 });
  if (isPatriot) {
    // 12-gauge under-tube and its pump
    add(g, tube(0.013, 0.013, 0.34, 14), M('park', camo), 0, -0.05, -0.37);
    add(g, tube(0.006, 0.006, 0.003, 10), M('bore'), 0, -0.05, -0.541);
    add(g, rbox(0.03, 0.02, 0.05, 0.003), M('park', camo), 0, -0.03, -0.2);
    P.pump = part(g, 'pump', 0, -0.05, -0.33);
    add(P.pump, tube(0.022, 0.022, 0.13, 14), M('poly', camo));
    for (let i = 0; i < 6; i++) add(P.pump, tube(0.0235, 0.0235, 0.006, 14), M('rubber'), 0, 0, -0.05 + i * 0.02);
  } else ironSights(g, -0.49, 0.055, 0.022, M('park', camo));
  if (drum) P.mag = drumMag(g, -0.137, -0.07, M('park', camo));
  else P.mag = boxMag(g, 'ar' + magMul, { z: -0.137, y: -0.07, len: 0.175 * (0.55 + 0.45 * magMul), depth: 0.058, width: 0.024, curve: 0.012, mat: M('steel', camo), base: M('poly'), ribs: 2 });
  Object.assign(ud, { muzzleZ: muzzle, sightY: 0.05, railY: 0.03, railZ: -0.04, grip: new THREE.Vector3(0, -0.075, 0.08), fore: isPatriot ? new THREE.Vector3(0, -0.06, -0.33) : new THREE.Vector3(0, -0.035, -0.33), magWell: new THREE.Vector3(0, -0.07, -0.137), eject: new THREE.Vector3(0.02, -0.006, -0.06), casing: 'rifle' });
}

function buildShotgun(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const ud = g.userData;
  if (def.shape === 'shotgun') {
    // trench gun: exposed hammer, heat shield, wooden pump and straight stock
    const steel = M('blued', camo), wood = M('wood', camo);
    add(g, profile('trrec', [[0.045, -0.045], [0.045, 0.012], ['q', 0.03, 0.024, 0.0, 0.024], [-0.15, 0.024], [-0.15, -0.04], [-0.06, -0.048]], 0.034), steel);
    add(g, rbox(0.002, 0.02, 0.06, 0.0005), M('bore'), 0.0171, 0.005, -0.08);
    P.hammer = part(g, 'hammer', 0, 0.01, 0.04);
    add(P.hammer, profile('hamr', [[0, 0], [0.008, 0], [0.018, 0.028], [0.01, 0.03], [-0.002, 0.008]], 0.008, 0.001), steel);
    add(g, tube(0.0125, 0.0125, 0.52, 18), steel, 0, 0.008, -0.41);
    add(g, tube(0.0055, 0.0055, 0.002, 12), M('bore'), 0, 0.008, -0.671);
    add(g, tube(0.011, 0.011, 0.42, 14), steel, 0, -0.022, -0.36);
    // heat shield with vent holes
    const hs = new THREE.CylinderGeometry(0.019, 0.019, 0.3, 18, 1, true, -Math.PI * 0.7, Math.PI * 1.4); hs.rotateX(-Math.PI / 2); hs.rotateZ(Math.PI);
    add(g, hs, steel, 0, 0.008, -0.36);
    for (let i = 0; i < 8; i++) for (const a of [-0.6, 0, 0.6]) add(g, new THREE.SphereGeometry(0.004, 6, 4), M('bore'), Math.sin(a) * 0.019, 0.008 + Math.cos(a) * 0.019, -0.23 - i * 0.035);
    add(g, rbox(0.016, 0.03, 0.025, 0.002), steel, 0, -0.012, -0.6); // bayonet lug
    add(g, rbox(0.003, 0.006, 0.003, 0.001), steel, 0, 0.024, -0.665); // bead
    P.pump = part(g, 'pump', 0, -0.024, -0.3);
    add(P.pump, profile('trpump', [[0.06, 0.01], [-0.07, 0.01], [-0.07, -0.022], [0.06, -0.022]], 0.04, 0.008), wood);
    for (let i = 0; i < 9; i++) add(P.pump, rbox(0.042, 0.002, 0.004, 0.001), M('bore'), 0, -0.022, -0.06 + i * 0.014);
    add(g, profile('trstock', [[0.045, 0.012], [0.4, -0.03], [0.405, -0.13], [0.39, -0.135], ['q', 0.2, -0.07, 0.07, -0.058], [0.045, -0.045]], 0.04, 0.006), wood);
    add(g, rbox(0.042, 0.112, 0.008, 0.002), steel, 0, -0.08, 0.407, -0.25);
    triggerGuard(g, steel, 0.035, -0.03, -0.044, 0.028);
    P.trigger = trigger(g, 0.0, -0.04);
    Object.assign(ud, { muzzleZ: -0.67, sightY: 0.028, railY: 0.024, railZ: -0.06, grip: new THREE.Vector3(0, -0.06, 0.085), fore: new THREE.Vector3(0, -0.04, -0.3), magWell: new THREE.Vector3(0, -0.045, -0.05), eject: new THREE.Vector3(0.02, 0.005, -0.08), casing: 'shell' });
    return;
  }
  // semi-auto tactical: polymer, ghost rings, side saddle
  const park = M('park', camo), poly = M('poly', camo);
  add(g, profile('ssrec', [[0.05, -0.045], [0.05, 0.02], [-0.16, 0.02], [-0.16, -0.045]], 0.036), park);
  rail(g, park, 0.045, -0.15, 0.02);
  add(g, rbox(0.002, 0.022, 0.07, 0.0005), M('bore'), 0.0181, -0.005, -0.06);
  P.bolt = part(g, 'bolt', 0.022, -0.005, -0.05);
  add(P.bolt, rbox(0.012, 0.012, 0.02, 0.003), M('steel'));
  add(g, tube(0.0125, 0.0125, 0.48, 18), park, 0, 0.004, -0.4);
  add(g, tube(0.0055, 0.0055, 0.002, 12), M('bore'), 0, 0.004, -0.641);
  add(g, tube(0.012, 0.012, 0.38, 14), park, 0, -0.026, -0.34);
  add(g, profile('sshg', [[-0.16, 0.0], [-0.36, 0.0], [-0.36, -0.045], [-0.16, -0.045]], 0.044, 0.008), poly);
  for (let i = 0; i < 6; i++) add(g, rbox(0.046, 0.003, 0.004, 0.001), M('bore'), 0, -0.045, -0.18 - i * 0.03);
  ironSights(g, -0.6, 0.03, 0.02, park, 0.024);
  // side saddle with shells
  add(g, rbox(0.006, 0.03, 0.09, 0.002), poly, -0.021, -0.012, -0.06);
  for (let i = 0; i < 4; i++) { add(g, cylY(0.0105, 0.05, 10), M('shell'), -0.03, -0.012, -0.025 - i * 0.023); add(g, cylY(0.011, 0.012, 10), M('brass'), -0.03, -0.042, -0.025 - i * 0.023); }
  add(g, tube(0.0145, 0.0145, 0.19, 14), park, 0, -0.01, 0.14);
  add(g, profile('ssstock', [[0.13, 0.02], [0.3, 0.025], [0.31, -0.09], [0.29, -0.095], [0.24, -0.03], [0.13, -0.03]], 0.04, 0.005), poly);
  add(g, rbox(0.044, 0.12, 0.014, 0.004), M('rubber'), 0, -0.035, 0.315);
  pistolGrip(g, poly, 'ss', 0.065, -0.045, 0.1, 0.3, 0.03, 0.036);
  triggerGuard(g, park, 0.035, -0.035, -0.045, 0.03);
  P.trigger = trigger(g, -0.002, -0.04);
  Object.assign(ud, { muzzleZ: -0.64, sightY: 0.048, railY: 0.026, railZ: -0.05, grip: new THREE.Vector3(0, -0.07, 0.08), fore: new THREE.Vector3(0, -0.04, -0.26), magWell: new THREE.Vector3(0, -0.05, -0.08), eject: new THREE.Vector3(0.02, -0.005, -0.06), casing: 'shell' });
}

function buildBreaker(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const steel = M('blued', camo), wood = M('wood', camo);
  add(g, profile('brrec', [[0.04, -0.045], [0.04, 0.018], [-0.1, 0.018], [-0.105, -0.03], [-0.05, -0.05]], 0.04), steel);
  add(g, cylX(0.007, 0.046, 12), M('steel'), 0, -0.028, -0.1);
  P.lever = part(g, 'lever', 0, 0.02, 0.02);
  add(P.lever, profile('brlever', [[0, 0], [0.04, 0], [0.045, 0.006], [0, 0.008]], 0.012, 0.002), M('steel'));
  P.hammer = part(g, 'hammer', 0, 0.01, 0.03);
  add(P.hammer, profile('hamr', [[0, 0], [0.008, 0], [0.018, 0.028], [0.01, 0.03], [-0.002, 0.008]], 0.008, 0.001), steel);
  // the barrel assembly pivots on the hinge pin
  P.barrel = part(g, 'barrel', 0, -0.028, -0.1);
  add(P.barrel, tube(0.0145, 0.016, 0.62, 18), steel, 0, 0.03, -0.31);
  add(P.barrel, tube(0.0075, 0.0075, 0.002, 12), M('bore'), 0, 0.03, -0.621);
  add(P.barrel, rbox(0.008, 0.006, 0.58, 0.001), steel, 0, 0.047, -0.31);
  add(P.barrel, rbox(0.004, 0.005, 0.004, 0.001), M('brass'), 0, 0.052, -0.6);
  add(P.barrel, tube(0.0075, 0.0075, 0.004, 12), M('bore'), 0, 0.03, 0.002);
  add(P.barrel, profile('brfore', [[0.0, 0.016], [-0.23, 0.016], ['q', -0.25, 0.0, -0.23, -0.012], [-0.01, -0.016]], 0.04, 0.007), wood);
  add(g, profile('brstock', [[0.04, 0.016], [0.42, -0.025], [0.425, -0.135], [0.41, -0.14], ['q', 0.23, -0.1, 0.12, -0.09], ['q', 0.1, -0.11, 0.07, -0.1], [0.04, -0.045]], 0.042, 0.006), wood);
  add(g, rbox(0.044, 0.115, 0.012, 0.004), M('rubber'), 0, -0.08, 0.428, -0.25);
  triggerGuard(g, steel, 0.03, -0.035, -0.045, 0.028);
  P.trigger = trigger(g, -0.003, -0.04);
  Object.assign(g.userData, { muzzleZ: -0.72, sightY: 0.03, railY: 0.022, railZ: -0.04, grip: new THREE.Vector3(0, -0.075, 0.09), fore: new THREE.Vector3(0, -0.05, -0.24), magWell: new THREE.Vector3(0, 0.0, -0.1), eject: new THREE.Vector3(0, 0.0, -0.1), casing: null });
}

function buildSniper(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const park = M('park', camo), poly = M('poly', camo);
  const magMul = inst && inst.att && inst.att.mag ? ITEMS[inst.att.mag].magMul || 1 : 1;
  add(g, profile('bgrec', [[0.09, -0.055], [0.09, 0.034], [-0.3, 0.034], [-0.3, -0.03], [-0.12, -0.06], [0.02, -0.06]], 0.062, 0.004), park);
  rail(g, park, 0.085, -0.29, 0.034, 0.024);
  add(g, rbox(0.002, 0.03, 0.09, 0.0005), M('bore'), 0.0315, 0.0, -0.03);
  // fluted heavy barrel + double-chamber brake
  add(g, tube(0.02, 0.022, 0.6, 8), M('blued', camo), 0, 0, -0.6, 0, 0, Math.PI / 8);
  const b = part(g, 'brake', 0, 0, -0.95);
  add(b, rbox(0.06, 0.04, 0.09, 0.006), park);
  for (const s of [-1, 1]) for (const dz of [-0.022, 0.018]) add(b, rbox(0.004, 0.028, 0.026, 0.002), M('bore'), s * 0.029, 0, dz);
  add(b, tube(0.009, 0.009, 0.002, 10), M('bore'), 0, 0, -0.046);
  // bipod, folded forward
  for (const s of [-1, 1]) add(g, tube(0.006, 0.007, 0.26, 8), M('steel'), s * 0.025, -0.04, -0.42, 0.06);
  add(g, rbox(0.06, 0.02, 0.03, 0.004), park, 0, -0.03, -0.29);
  // bolt
  P.bolt = part(g, 'bolt', 0.032, 0.012, 0.02);
  add(P.bolt, tube(0.012, 0.012, 0.09, 12), M('steel'), -0.02, 0, -0.02);
  add(P.bolt, cylX(0.005, 0.04, 8), M('steel'), 0.02, 0, 0.0);
  add(P.bolt, new THREE.SphereGeometry(0.011, 12, 8), M('poly'), 0.042, 0, 0.0);
  P.mag = boxMag(g, 'bg' + magMul, { z: -0.08, y: -0.058, len: 0.1 * (0.6 + 0.4 * magMul), depth: 0.1, width: 0.05, mat: park, ribs: 1 });
  pistolGrip(g, poly, 'bg', 0.115, -0.055, 0.105, 0.28, 0.032, 0.04);
  triggerGuard(g, park, 0.08, 0.01, -0.058, 0.03, 0.014);
  P.trigger = trigger(g, 0.044, -0.054);
  // skeleton stock, cheek riser, monopod
  add(g, profile('bgstock', [[0.09, 0.03], [0.45, 0.03], [0.46, -0.11], [0.43, -0.115], [0.38, -0.04], [0.16, -0.04], [0.09, -0.05]], 0.04, 0.005), park);
  add(g, rbox(0.03, 0.05, 0.16, 0.006), poly, 0, 0.06, 0.36);
  add(g, rbox(0.048, 0.15, 0.02, 0.006), M('rubber'), 0, -0.04, 0.47);
  add(g, tube(0.007, 0.007, 0.08, 8), M('steel'), 0, -0.09, 0.4, Math.PI / 2);
  Object.assign(g.userData, { muzzleZ: -1.0, sightY: 0.09, railY: 0.044, railZ: -0.1, grip: new THREE.Vector3(0, -0.08, 0.13), fore: new THREE.Vector3(0, -0.06, 0.38), magWell: new THREE.Vector3(0, -0.06, -0.08), eject: new THREE.Vector3(0.032, 0.0, -0.03), casing: 'big' });
}

function buildPistol(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const drum = inst && inst.att && inst.att.mag === 'drum';
  const magMul = inst && inst.att && inst.att.mag && !drum ? ITEMS[inst.att.mag].magMul || 1 : 1;
  const ud = g.userData;
  if (def.id === 'zip22') {
    // a scrap single-shot: pipe barrel, bent sheet frame, tape-wrapped grip
    const steel = M('steel');
    add(g, tube(0.008, 0.008, 0.14, 10), steel, 0, 0.01, -0.07);
    add(g, tube(0.004, 0.004, 0.002, 8), M('bore'), 0, 0.01, -0.141);
    add(g, profile('zipf', [[0.03, 0.0], [-0.05, 0.0], [-0.05, -0.012], [0.0, -0.012], [0.045, -0.1], [0.025, -0.105], [-0.012, -0.03], [0.03, -0.012]], 0.016, 0.001), steel);
    for (let i = 0; i < 6; i++) add(g, rbox(0.02, 0.012, 0.022, 0.004), M('tape'), 0, -0.035 - i * 0.012, 0.012 + i * 0.006, -0.45);
    add(g, cylX(0.004, 0.024, 8), steel, 0, 0.012, 0.02);
    P.barrel = part(g, 'barrel', 0, 0.01, 0.0);
    triggerGuard(g, steel, 0.008, -0.03, -0.012, 0.022, 0.006);
    P.trigger = trigger(g, -0.012, -0.012, 0.8);
    Object.assign(ud, { muzzleZ: -0.145, sightY: 0.03, railY: 0.02, railZ: -0.04, grip: new THREE.Vector3(0, -0.05, 0.03), fore: null, magWell: new THREE.Vector3(0, 0.01, 0.0), eject: new THREE.Vector3(0, 0.01, 0.0), casing: null });
    return;
  }
  const big = def.shape === 'pistol_big', s = big ? 1.25 : 1;
  const steel = M(def.id === 'm1911' ? 'blued' : 'park', camo), poly = M('poly', camo);
  if (big) {
    // .50 AE: triangular barrel with top rail, big slide
    add(g, profile('deb', [[-0.01, 0.0], [-0.2, 0.0], [-0.2, 0.034], [-0.03, 0.034]], 0.03, 0.003), steel);
    add(g, tube(0.007, 0.007, 0.002, 10), M('bore'), 0, 0.016, -0.201);
    rail(g, steel, -0.04, -0.19, 0.034, 0.016);
    P.slide = part(g, 'slide');
    add(P.slide, profile('des', [[0.06, 0.0], [-0.012, 0.0], [-0.012, 0.03], [0.055, 0.03], [0.062, 0.02]], 0.032, 0.003), steel);
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) add(P.slide, rbox(0.002, 0.022, 0.003, 0.0005), M('bore'), sx * 0.016, 0.015, 0.025 + i * 0.005);
  } else {
    P.slide = part(g, 'slide');
    const sl = def.id === 'gg60' ? [[0.035, -0.002], [-0.15, -0.002], [-0.15, 0.026], [0.035, 0.026]] : [[0.04, -0.002], [-0.165, -0.002], [-0.165, 0.022], ['q', -0.165, 0.028, -0.155, 0.028], [0.035, 0.028], [0.042, 0.018]];
    add(P.slide, profile('sl' + def.id, sl, 0.024, 0.002), steel);
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) add(P.slide, rbox(0.0015, 0.02, 0.0025, 0.0005), M('bore'), sx * 0.0122, 0.013, 0.01 + i * 0.0045);
    add(P.slide, rbox(0.0015, 0.012, 0.04, 0.0005), M('bore'), 0.0122, 0.012, -0.03); // ejection port
    add(P.slide, rbox(0.004, 0.006, 0.004, 0.001), steel, 0, 0.031, -0.15);
    for (const sx of [-1, 1]) add(P.slide, rbox(0.004, 0.006, 0.006, 0.001), steel, sx * 0.005, 0.031, 0.03);
    if (def.id === 'gg60') {
      add(g, rbox(0.024, 0.026, 0.04, 0.003), steel, 0, 0.012, -0.17);
      for (let i = 0; i < 3; i++) add(g, rbox(0.012, 0.004, 0.006, 0.001), M('bore'), 0, 0.026, -0.158 - i * 0.012);
    }
    add(g, tube(0.0065, 0.0065, 0.002, 10), M('bore'), 0, 0.012, def.id === 'gg60' ? -0.191 : -0.166);
  }
  // frame + dust cover + grip
  const frameMat = def.id === 'gg60' ? poly : steel;
  add(g, profile('fr' + def.id, [[0.04, -0.002], [-0.14 * s, -0.002], [-0.14 * s, -0.018], [-0.03, -0.02], [0.04, -0.018]], 0.022 * s, 0.002), frameMat);
  triggerGuard(g, frameMat, 0.008, -0.045 * s, -0.018, 0.028 * s, 0.01);
  P.trigger = trigger(g, -0.012, -0.018, 0.85);
  const gripPts = [[0.044, -0.018], [0.07 * s, -0.115 * s], [0.032, -0.122 * s], [0.006, -0.02]];
  add(g, profile('gr' + def.id, gripPts, 0.026 * s, 0.003), frameMat);
  if (def.id === 'm1911') for (const sx of [-1, 1]) add(g, profile('gp1911', [[0.04, -0.03], [0.064, -0.105], [0.038, -0.11], [0.014, -0.034]], 0.004, 0.001), M('wood', camo), sx * 0.0135, 0, 0);
  if (def.id === 'm1911' || big) {
    P.hammer = part(g, 'hammer', 0, 0.012, 0.042);
    add(P.hammer, profile('phamr', [[0, 0], [0.006, -0.004], [0.016, 0.012], [0.01, 0.016], [0, 0.006]], 0.007, 0.001), steel);
  }
  // magazine in the grip; extended ones stick out
  const ml = (0.1 + (magMul - 1) * 0.05) * s;
  P.mag = part(g, 'mag');
  add(P.mag, profile('pm' + def.id + magMul, [[0.04, -0.02], [0.06 * s + (ml - 0.1 * s) * 0.28, -0.02 - ml], [0.03 + (ml - 0.1 * s) * 0.28, -0.022 - ml], [0.012, -0.022]], 0.018 * s, 0.001), M('steel'));
  add(P.mag, rbox(0.024 * s, 0.008, 0.034 * s, 0.002), def.id === 'gg60' ? poly : steel, 0, -0.024 - ml, 0.046 * s + (ml - 0.1 * s) * 0.28);
  if (drum) { add(P.mag, cylX(0.045, 0.04, 22), poly, 0, -0.17, 0.05); }
  Object.assign(ud, { muzzleZ: big ? -0.205 : def.id === 'gg60' ? -0.195 : -0.17, sightY: 0.037 * s, railY: big ? 0.034 : 0.028, railZ: -0.06, grip: new THREE.Vector3(0, -0.055 * s, 0.045 * s), fore: null, magWell: new THREE.Vector3(0, -0.12 * s, 0.05 * s), eject: new THREE.Vector3(0.014, 0.014, -0.03), casing: 'pistol' });
}

function buildRevolver(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const big = def.shape === 'revolver_big', s = big ? 1.3 : 1, n = big ? 5 : 6;
  const steel = M(big ? 'steel' : 'blued', camo);
  add(g, profile('rvf' + big, [[0.05 * s, 0.0], [0.04 * s, 0.026 * s], [-0.045 * s, 0.026 * s], [-0.05 * s, 0.006], [-0.05 * s, -0.018 * s], [-0.02, -0.022 * s], [0.03 * s, -0.02 * s]], 0.026 * s, 0.002), steel);
  // barrel with top rib and ejector housing
  const bl = big ? 0.2 : 0.13;
  add(g, tube(0.009 * s, 0.01 * s, bl, 16), steel, 0, 0.012 * s, -0.05 * s - bl / 2);
  add(g, rbox(0.009 * s, 0.008 * s, bl, 0.002), steel, 0, 0.022 * s, -0.05 * s - bl / 2);
  add(g, tube(0.007 * s, 0.007 * s, bl * 0.55, 12), steel, 0, -0.004 * s, -0.05 * s - bl * 0.28);
  add(g, tube(0.0045 * s, 0.0045 * s, 0.002, 10), M('bore'), 0, 0.012 * s, -0.051 * s - bl);
  if (big) for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) add(g, rbox(0.002, 0.004, 0.006, 0.001), M('bore'), sx * 0.005, 0.03, -0.27 + i * 0.012, 0, 0, sx * 0.5);
  add(g, rbox(0.004, 0.008, 0.006, 0.001), steel, 0, 0.03 * s, -0.045 * s - bl);
  // swing-out crane + cylinder
  P.crane = part(g, 'crane', -0.012 * s, -0.012 * s, -0.04 * s);
  P.cylinder = part(P.crane, 'cylinder', 0.012 * s, 0.024 * s, 0.013 * s);
  const cyl = tube(0.021 * s, 0.021 * s, 0.042 * s, 24);
  add(P.cylinder, cyl, steel);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    add(P.cylinder, tube(0.0055 * s, 0.0055 * s, 0.002, 10), M('bore'), Math.cos(a) * 0.0125 * s, Math.sin(a) * 0.0125 * s, -0.0215 * s);
    add(P.cylinder, tube(0.0058 * s, 0.0058 * s, 0.002, 10), M('brass'), Math.cos(a) * 0.0125 * s, Math.sin(a) * 0.0125 * s, 0.0215 * s);
    add(P.cylinder, rbox(0.004 * s, 0.004 * s, 0.024 * s, 0.001), M('bore'), Math.cos(a + Math.PI / n) * 0.0205 * s, Math.sin(a + Math.PI / n) * 0.0205 * s, 0);
  }
  P.hammer = part(g, 'hammer', 0, 0.02 * s, 0.03 * s);
  add(P.hammer, profile('rhamr', [[0, -0.006], [0.008, -0.01], [0.022, 0.012], [0.014, 0.016], [0.0, 0.004]], 0.007, 0.001), steel);
  triggerGuard(g, steel, 0.02 * s, -0.025 * s, -0.02 * s, 0.026 * s, 0.009);
  P.trigger = trigger(g, -0.004, -0.02 * s, 0.85);
  add(g, profile('rgrip' + big, [[0.03 * s, -0.018 * s], [0.052 * s, -0.022 * s], ['q', 0.075 * s, -0.06 * s, 0.068 * s, -0.115 * s], [0.03 * s, -0.12 * s], ['q', 0.026 * s, -0.07 * s, 0.01 * s, -0.024 * s]], 0.03 * s, 0.006), M('wood', camo));
  Object.assign(g.userData, { muzzleZ: -0.05 * s - bl - 0.002, sightY: 0.034 * s, railY: 0.03 * s, railZ: -0.08 * s, grip: new THREE.Vector3(0, -0.055 * s, 0.05 * s), fore: null, magWell: new THREE.Vector3(0.0, 0.012 * s, -0.026 * s), eject: new THREE.Vector3(0, 0.012 * s, -0.03 * s), casing: null });
}

function buildDual(def, inst, g, P) {
  const camo = inst && inst.camo ? ITEMS[inst.camo] : null;
  const poly = M('poly', camo), park = M('park', camo);
  const mags = [];
  for (const side of [-1, 1]) {
    const h = part(g, side < 0 ? 'left' : 'right', side * 0.16, 0, 0);
    add(h, profile('smgr', [[0.06, -0.03], [0.06, 0.032], [-0.16, 0.032], [-0.16, -0.012], [-0.04, -0.03]], 0.034, 0.004), poly);
    rail(h, park, 0.05, -0.15, 0.032, 0.018);
    add(h, tube(0.016, 0.016, 0.1, 14), park, 0, 0.008, -0.21);
    add(h, tube(0.006, 0.006, 0.002, 10), M('bore'), 0, 0.008, -0.261);
    add(h, rbox(0.002, 0.014, 0.04, 0.0005), M('bore'), 0.0171, 0.012, -0.04);
    pistolGrip(h, poly, 'smg', 0.035, -0.03, 0.1, 0.18, 0.03, 0.038);
    triggerGuard(h, poly, 0.006, -0.04, -0.03, 0.026, 0.01);
    add(h, rbox(0.026, 0.05, 0.022, 0.004), poly, 0, -0.045, -0.12, 0.2); // folded vertical grip
    const mg = part(h, 'mag');
    add(mg, profile('smgm', [[0.02, -0.03], [0.042, -0.19], [0.018, -0.192], [-0.002, -0.03]], 0.022, 0.002), M('steel'));
    mags.push(mg);
    add(h, rbox(0.03, 0.03, 0.08, 0.004), park, 0, 0.0, 0.1); // collapsed stock
  }
  P.mag = mags[1]; P.magL = mags[0];
  Object.assign(g.userData, { muzzleZ: -0.262, sightY: 0.05, railY: 0.04, railZ: -0.04, grip: new THREE.Vector3(0.16, -0.06, 0.04), gripL: new THREE.Vector3(-0.16, -0.06, 0.04), fore: null, magWell: new THREE.Vector3(0.16, -0.03, 0.02), eject: new THREE.Vector3(0.18, 0.012, -0.04), casing: 'pistol' });
}

function buildMelee(def, inst, g) {
  const ud = g.userData;
  if (def.shape === 'hatchet') {
    add(g, profile('hth', [[0.06, 0.012], ['q', -0.12, 0.02, -0.32, 0.014], [-0.32, -0.012], ['q', -0.12, -0.006, 0.06, -0.014]], 0.024, 0.005), M('wood'));
    add(g, profile('hthead', [[-0.28, 0.02], [-0.34, 0.02], ['q', -0.37, 0.06, -0.36, 0.11], [-0.31, 0.105], ['q', -0.3, 0.05, -0.28, 0.035], [-0.28, -0.03], [-0.34, -0.03], [-0.34, 0.02]], 0.012, 0.002), M('steel'));
    add(g, profile('htedge', [[-0.36, 0.11], ['q', -0.374, 0.06, -0.345, 0.018], [-0.338, 0.022], ['q', -0.364, 0.06, -0.352, 0.106]], 0.006, 0.0008), M('blade'));
    Object.assign(ud, { muzzleZ: -0.36, sightY: 0.03, grip: new THREE.Vector3(0, 0, 0.03), fore: null, casing: null });
    return;
  }
  // knives: clip-point blade with fuller, guard, textured handle
  const throwing = def.id === 'throwknives', co2 = def.id === 'co2knife';
  const bl = throwing ? 0.13 : 0.17;
  add(g, profile('kb' + def.id, [[-0.005, 0.0], [-bl * 0.7, 0.002], ['q', -bl * 0.88, 0.0, -bl, 0.012], ['q', -bl * 0.6, 0.026, -0.005, 0.026]], throwing ? 0.003 : 0.0045, 0.0007), M('blade'));
  add(g, rbox(0.0049, 0.005, bl * 0.55, 0.001), M('steel'), 0, 0.017, -bl * 0.42);
  if (!throwing) add(g, rbox(0.016, 0.044, 0.008, 0.002), M('steel'), 0, 0.012, 0.002);
  const hl = 0.11;
  if (throwing) { add(g, rbox(0.006, 0.022, hl, 0.002), M('steel'), 0, 0.012, hl / 2); for (let i = 0; i < 9; i++) add(g, rbox(0.009, 0.025, 0.008, 0.003), M('cord'), 0, 0.012, 0.01 + i * 0.01); }
  else {
    add(g, profile('kh' + def.id, [[0.004, 0.034], ['q', 0.06, 0.03, hl, 0.034], [hl + 0.006, 0.0], ['q', 0.06, -0.006, 0.004, -0.008]], 0.026, 0.007), M('rubber'));
    for (let i = 0; i < 5; i++) add(g, rbox(0.027, 0.004, 0.006, 0.0015), M('rubber'), 0, 0.034, 0.02 + i * 0.018);
    add(g, rbox(0.024, 0.04, 0.012, 0.004), co2 ? M('gold') : M('steel'), 0, 0.013, hl + 0.006);
    if (co2) add(g, cylY(0.004, 0.012, 8), M('steel'), 0, -0.012, 0.03);
  }
  Object.assign(ud, { muzzleZ: -bl, sightY: 0.03, grip: new THREE.Vector3(0, 0.012, 0.05), fore: null, casing: null });
}

function buildFlare(def, inst, g, P) {
  const o = M('orange');
  P.barrel = part(g, 'barrel', 0, -0.012, -0.02);
  add(P.barrel, tube(0.02, 0.021, 0.16, 18), o, 0, 0.032, -0.08);
  add(P.barrel, tube(0.014, 0.014, 0.002, 14), M('bore'), 0, 0.032, -0.161);
  add(g, profile('flf', [[0.03, -0.012], [-0.03, -0.012], [-0.03, 0.03], [0.02, 0.034], [0.035, 0.02]], 0.03, 0.004), o);
  add(g, profile('flg', [[0.035, -0.01], [0.075, -0.11], [0.04, -0.115], [0.01, -0.012]], 0.03, 0.006), o);
  triggerGuard(g, o, 0.012, -0.03, -0.012, 0.026, 0.01);
  P.trigger = trigger(g, -0.008, -0.012, 0.85);
  P.hammer = part(g, 'hammer', 0, 0.026, 0.03);
  add(P.hammer, profile('phamr', [[0, 0], [0.006, -0.004], [0.016, 0.012], [0.01, 0.016], [0, 0.006]], 0.007, 0.001), M('steel'));
  Object.assign(g.userData, { muzzleZ: -0.18, sightY: 0.058, railY: 0.05, railZ: -0.05, grip: new THREE.Vector3(0, -0.05, 0.045), fore: null, magWell: new THREE.Vector3(0, 0.02, -0.02), eject: new THREE.Vector3(0, 0.02, -0.02), casing: null });
}

// Builds a weapon/tool model. inst (optional): {att: {mag, optic}, camo}
export function buildWeapon(def, inst = null) {
  const g = new THREE.Group();
  const P = {};
  g.userData = { muzzleZ: -0.3, sightY: 0.05, railY: 0.03, railZ: -0.04, grip: new THREE.Vector3(0, -0.05, 0.04), fore: null, magWell: null, eject: null, casing: null };
  const shape = def.shape || 'pistol';
  if (def.melee) buildMelee(def, inst, g);
  else if (shape === 'rifle' || shape === 'rifle_wood' || shape === 'rifle_pump') buildRifle(def, inst, g, P);
  else if (shape === 'shotgun' || shape === 'shotgun_semi') buildShotgun(def, inst, g, P);
  else if (shape === 'breaker') buildBreaker(def, inst, g, P);
  else if (shape === 'sniper') buildSniper(def, inst, g, P);
  else if (shape === 'revolver' || shape === 'revolver_big') buildRevolver(def, inst, g, P);
  else if (shape === 'dual') buildDual(def, inst, g, P);
  else if (shape === 'flaregun') buildFlare(def, inst, g, P);
  else buildPistol(def, inst, g, P);
  const optic = (inst && inst.att && inst.att.optic) || def.builtinOptic;
  if (optic && !def.melee && g.userData.railY !== undefined) g.userData.sightY = addOptic(g, optic, g.userData.railY, g.userData.railZ);
  // remember rest poses so animation can offset from them
  for (const k in P) if (P[k]) P[k].userData.rest = { p: P[k].position.clone(), r: P[k].rotation.clone() };
  g.userData.parts = P;
  g.userData.kind = def.melee ? 'melee' : shape === 'dual' ? 'dual' : ['pistol', 'pistol_big', 'revolver', 'revolver_big', 'flaregun'].includes(shape) ? 'pistol' : 'rifle';
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Reset all animated parts to rest.
export function restParts(P) {
  for (const k in P) { const p = P[k]; if (p && p.userData.rest) { p.position.copy(p.userData.rest.p); p.rotation.copy(p.userData.rest.r); p.visible = true; } }
}

// Merge each node's static meshes by material (a gun is ~60 little meshes; this makes it a handful
// of draw calls) while keeping the named moving parts as separate nodes.
export function compactWeapon(root) {
  const prep = (g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  };
  const visit = (node) => {
    const byMat = new Map();
    for (const m of [...node.children]) {
      if (!m.isMesh || m.children.length) continue;
      m.updateMatrix();
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(prep(m.geometry).applyMatrix4(m.matrix));
      node.remove(m);
    }
    for (const [mat, gs] of byMat) {
      const mm = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs, false) : gs[0], mat);
      mm.castShadow = mm.receiveShadow = true;
      node.add(mm);
    }
    for (const c of node.children) if (!c.isMesh) visit(c);
  };
  visit(root);
  return root;
}
