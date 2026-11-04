// What's bolted to each gun.
//
// Every catalogue gun leaves the factory with its own fittings, so two guns on
// the same base model don't look alike: optics (a red dot tube, a holographic
// window, a variable scope on rings, a slide-mounted micro dot on pistols),
// iron sights when there's no glass, muzzle devices (birdcage flash hider,
// compensator, brake, suppressor can), under-barrel parts (vertical or angled
// grip, weapon light, folded bipod, hand stop), a sling on long guns and a shell
// carrier on shotguns. Attachments you buy at a gunsmith replace the factory
// part in their slot and show on the gun. Parts mount on the model's own
// anchor points (muzzle, sight line, handguard) in the gun's hold frame
// (+Z toward the muzzle, +Y up, +X the gun's left side).
import * as THREE from 'three';

const M = new Map();
const mat = (c, r = 0.5, m = 0.6) => { const k = `${c}|${r}|${m}`; if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })); return M.get(k); };
const BLACK = () => mat(0x111113, 0.45, 0.55), POLY = () => mat(0x1a1a1c, 0.75, 0.1), STEEL = () => mat(0x3a3b3e, 0.3, 0.9);
const GLASS = () => { if (!M.has('glass')) M.set('glass', new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x0a1418 })); return M.get('glass'); };
const DOT = () => { if (!M.has('dot')) M.set('dot', new THREE.MeshBasicMaterial({ color: 0xff2a1a })); return M.get('dot'); };

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// parts, built along +Z from z = 0
const tubeZ = (r, len, m, seg = 16, r2 = r) => { const g = new THREE.CylinderGeometry(r2, r, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return new THREE.Mesh(g, m); };
const box = (x, y, z, m) => new THREE.Mesh(new THREE.BoxGeometry(x, y, z), m);
const put = (parent, mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh; };

function optic(kind, power = 4) {
  const g = new THREE.Group();
  let eye = 0.03; // height of the sight line above the mount base
  if (kind === 'reddot') {
    put(g, box(0.026, 0.012, 0.032, BLACK()), 0, 0.006, 0.02);
    put(g, tubeZ(0.017, 0.062, BLACK(), 20), 0, 0.03, -0.01);
    put(g, tubeZ(0.0175, 0.004, mat(0x202022, 0.4, 0.7), 20), 0, 0.03, 0.05);
    put(g, new THREE.Mesh(new THREE.CircleGeometry(0.014, 18), GLASS()), 0, 0.03, 0.051);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.0012, 6, 4), DOT()), 0, 0.03, 0.0);
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10), BLACK()), 0, 0.047, 0.02); // turret
    eye = 0.03;
  } else if (kind === 'holo') {
    put(g, box(0.034, 0.014, 0.085, BLACK()), 0, 0.007, 0.02);
    for (const s of [-1, 1]) put(g, box(0.004, 0.034, 0.05, BLACK()), s * 0.016, 0.031, 0.04);
    put(g, box(0.036, 0.004, 0.05, BLACK()), 0, 0.049, 0.04);
    put(g, box(0.028, 0.028, 0.002, GLASS()), 0, 0.032, 0.062);
    put(g, box(0.028, 0.028, 0.002, GLASS()), 0, 0.032, 0.02);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.0013, 6, 4), DOT()), 0, 0.032, 0.03);
    put(g, box(0.02, 0.012, 0.02, BLACK()), 0.022, 0.02, -0.005); // battery cap
    eye = 0.032;
  } else if (kind === 'micro') { // pistol slide dot
    put(g, box(0.024, 0.006, 0.038, BLACK()), 0, 0.003, 0);
    put(g, box(0.024, 0.02, 0.006, BLACK()), 0, 0.012, 0.016);
    for (const s of [-1, 1]) put(g, box(0.003, 0.016, 0.03, BLACK()), s * 0.0105, 0.012, 0.0, -0.25);
    put(g, box(0.018, 0.014, 0.002, GLASS()), 0, 0.013, 0.012, -0.2);
    eye = 0.013;
  } else { // variable scope on rings
    const L = 0.2 + Math.min(power, 12) * 0.012;
    put(g, tubeZ(0.0135, L, BLACK(), 20), 0, 0.045, -L * 0.45);
    put(g, tubeZ(0.0135, 0.06, BLACK(), 20, 0.024), 0, 0.045, L * 0.55 - 0.06); // objective bell
    put(g, tubeZ(0.02, 0.055, BLACK(), 20, 0.0135), 0, 0.045, -L * 0.45 - 0.055); // eyepiece
    put(g, new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), GLASS()), 0, 0.045, L * 0.55 + 0.001);
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 12), BLACK()), 0, 0.065, 0.0);
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 12), BLACK()), -0.022, 0.045, 0.0, 0, 0, Math.PI / 2);
    for (const z of [-L * 0.3, L * 0.25]) { put(g, tubeZ(0.017, 0.012, BLACK(), 16), 0, 0.045, z); put(g, box(0.02, 0.03, 0.014, BLACK()), 0, 0.017, z + 0.006); }
    eye = 0.045;
  }
  g.userData.eye = eye;
  return g;
}
function irons(len) {
  const g = new THREE.Group();
  put(g, box(0.016, 0.02, 0.022, BLACK()), 0, 0.01, 0); // rear sight
  put(g, box(0.004, 0.012, 0.004, BLACK()), -0.005, 0.024, 0); put(g, box(0.004, 0.012, 0.004, BLACK()), 0.005, 0.024, 0);
  put(g, box(0.012, 0.012, 0.016, BLACK()), 0, 0.006, len * 0.42); // front post base
  put(g, box(0.003, 0.02, 0.003, BLACK()), 0, 0.02, len * 0.42);
  return g;
}
function muzzleDevice(kind, pistol) {
  const g = new THREE.Group();
  let L = 0;
  if (kind === 'can') {
    L = pistol ? 0.14 : 0.17; const r = pistol ? 0.015 : 0.019;
    put(g, tubeZ(r * 0.8, 0.012, STEEL(), 18), 0, 0, 0);
    put(g, tubeZ(r, L - 0.012, mat(0x18191b, 0.6, 0.4), 22), 0, 0, 0.012);
    put(g, tubeZ(r * 0.4, 0.002, mat(0x050505, 0.9, 0), 12), 0, 0, L);
  } else if (kind === 'brake') {
    L = 0.06;
    put(g, tubeZ(0.016, L, STEEL(), 6), 0, 0, 0);
    for (const z of [0.015, 0.03, 0.045]) for (const s of [-1, 1]) put(g, box(0.003, 0.012, 0.008, mat(0x050505, 0.9, 0)), s * 0.0155, 0, z);
  } else if (kind === 'comp') {
    L = pistol ? 0.03 : 0.05;
    put(g, tubeZ(pistol ? 0.012 : 0.013, L, STEEL(), pistol ? 4 : 10), 0, 0, 0, 0, 0, pistol ? Math.PI / 4 : 0);
    for (let k = 0; k < 3; k++) put(g, box(0.006, 0.004, 0.005, mat(0x050505, 0.9, 0)), 0, pistol ? 0.012 : 0.013, 0.008 + k * 0.012);
  } else { // birdcage flash hider
    L = 0.045;
    put(g, tubeZ(0.0105, L, BLACK(), 10), 0, 0, 0);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; put(g, box(0.002, 0.004, 0.022, mat(0x050505, 0.9, 0)), Math.cos(a) * 0.0103, Math.sin(a) * 0.0103, 0.024, 0, 0, a); }
  }
  g.userData.len = L;
  return g;
}
function under(kind) {
  const g = new THREE.Group();
  if (kind === 'vgrip') { put(g, box(0.02, 0.012, 0.03, POLY()), 0, -0.006, 0); put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.085, 12), POLY()), 0, -0.05, 0.004, 0.12); }
  else if (kind === 'agrip') { const w = box(0.02, 0.03, 0.07, POLY()); put(g, w, 0, -0.017, 0.0, -0.45); }
  else if (kind === 'light') { put(g, box(0.014, 0.012, 0.03, BLACK()), 0.016, -0.004, 0); put(g, tubeZ(0.012, 0.07, BLACK(), 14, 0.014), 0.028, -0.008, -0.03); put(g, new THREE.Mesh(new THREE.CircleGeometry(0.0125, 14), mat(0xf4f0e0, 0.1, 0)), 0.028, -0.008, 0.041); }
  else if (kind === 'bipod') { put(g, box(0.03, 0.014, 0.02, BLACK()), 0, -0.007, 0); for (const s of [-1, 1]) put(g, tubeZ(0.005, 0.17, STEEL(), 8), s * 0.009, -0.016, 0.0, 0, s * 0.05, 0); }
  else if (kind === 'stop') put(g, box(0.016, 0.022, 0.016, POLY()), 0, -0.011, 0, -0.3);
  else if (kind === 'plight') { put(g, box(0.026, 0.024, 0.05, BLACK()), 0, -0.012, 0); put(g, new THREE.Mesh(new THREE.CircleGeometry(0.009, 14), mat(0xf4f0e0, 0.1, 0)), 0, -0.012, 0.0255); }
  return g;
}
function sling(a, b) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= 0.12;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const g = new THREE.TubeGeometry(curve, 16, 0.006, 5);
  g.scale(1, 1, 1);
  return new THREE.Mesh(g, mat(0x2e2a22, 0.95, 0));
}
function shells(n) {
  const g = new THREE.Group();
  put(g, box(0.004, 0.035, 0.022 * n + 0.01, POLY()), 0, 0, 0);
  for (let k = 0; k < n; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.04, 10), mat(k % 2 ? 0xa01e1a : 0x9a1a16, 0.6, 0)); put(g, s, 0.009, 0, (k - (n - 1) / 2) * 0.022); const brass = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 10), mat(0xb08a3a, 0.3, 0.9)); put(g, brass, 0.009, -0.024, (k - (n - 1) / 2) * 0.022); }
  return g;
}

// the factory fit for a catalogue gun (deterministic: the same gun always looks the same)
export function factoryFit(w, G) {
  const r = rng(hash(w.id) ^ 0x51ed);
  const pistol = w.cat === 'pistol', scoped = !!(G && G.scoped);
  const f = { optic: null, muzzle: null, under: null, sling: false, shells: false, irons: false };
  if (pistol) {
    if (!(G && G.revolver)) { if (r() < 0.32) f.optic = 'micro'; if (r() < 0.28) f.under = 'plight'; if (r() < 0.16) f.muzzle = 'comp'; }
    else if (w.platform === 'target' && r() < 0.4) f.optic = 'scope';
  } else if (w.cat === 'rifle') {
    const o = r(); f.optic = scoped ? null : o < 0.36 ? 'reddot' : o < 0.62 ? 'holo' : o < 0.76 ? 'scope' : null;
    f.irons = !f.optic && !scoped;
    const m = r(); f.muzzle = m < 0.5 ? 'hider' : m < 0.75 ? 'comp' : m < 0.88 ? 'brake' : 'can';
    const u = r(); f.under = u < 0.3 ? 'vgrip' : u < 0.48 ? 'agrip' : u < 0.7 ? 'light' : u < 0.8 ? 'stop' : null;
    f.sling = r() < 0.55;
  } else if (w.cat === 'shotgun') {
    f.shells = r() < 0.5; if (r() < 0.3) f.under = 'light'; if (!scoped && r() < 0.2) f.optic = 'reddot'; f.sling = r() < 0.4;
  } else if (w.cat === 'sniper' || w.cat === 'marksman') {
    if (!scoped && w.scope >= 2) f.optic = 'scope';
    f.muzzle = r() < 0.5 ? 'brake' : r() < 0.6 ? 'hider' : 'can';
    if (r() < 0.6) f.under = 'bipod';
    f.sling = r() < 0.6;
  }
  return f;
}
// a bought attachment's look
const FITTED = [
  [/red dot|reflex/i, 'optic', 'reddot'], [/holographic/i, 'optic', 'holo'], [/scope/i, 'optic', 'scope'],
  [/suppressor/i, 'muzzle', 'can'], [/compensator/i, 'muzzle', 'comp'], [/flash hider/i, 'muzzle', 'hider'], [/brake/i, 'muzzle', 'brake'],
  [/vertical grip/i, 'under', 'vgrip'], [/angled grip/i, 'under', 'agrip'], [/bipod/i, 'under', 'bipod'], [/flashlight/i, 'under', 'light'], [/handstop/i, 'under', 'stop'],
];

// bolt the fittings onto a built gun model
export function dressGun(g, w, G) {
  const H = g.userData.hold;
  if (!H || w.melee || w.cat === 'bow' || w.cat === 'launcher') return;
  const old = g.getObjectByName('fittings'); if (old) g.remove(old);
  const f = factoryFit(w, G);
  for (const name of Object.values(w.fitted || {})) for (const [re, slot, look] of FITTED) if (re.test(name)) { f[slot] = look; if (slot === 'optic') f.irons = false; }
  if (f.under === 'light' && w.cat === 'pistol') f.under = 'plight';
  const P = new THREE.Group(); P.name = 'fittings';
  const pistol = w.cat === 'pistol';
  const at = H.at;
  if (!at) return;
  // optic on the sight line; the first-person sight moves up to it
  if (f.optic) {
    const o = optic(f.optic, w.scope || (f.optic === 'scope' ? 4 : 1));
    const base = f.optic === 'micro' ? at(0.18, 1) : at(pistol ? 0.3 : 0.45, 1);
    o.position.copy(base);
    P.add(o);
    H.sight = base.clone().add(new THREE.Vector3(0, o.userData.eye, 0));
    H.optic = f.optic;
  } else if (f.irons && !pistol) { const ir = irons(H.len); ir.position.copy(at(0.42, 1)); P.add(ir); }
  // muzzle device in line with the bore; the flash moves to its end
  if (f.muzzle && g.userData.muzzle) {
    const d = muzzleDevice(f.muzzle, pistol);
    d.position.copy(g.userData.muzzle).add(new THREE.Vector3(0, 0, -0.004));
    P.add(d);
    g.userData.muzzle = g.userData.muzzle.clone().add(new THREE.Vector3(0, 0, d.userData.len));
    if (f.muzzle === 'can') g.userData.suppressed = true;
  }
  // under the handguard (or the pistol's frame rail)
  if (f.under) {
    const u = under(f.under);
    u.position.copy(pistol ? at(0.7, 0.76) : H.fore.clone().add(new THREE.Vector3(-0.035, 0.03, f.under === 'bipod' ? 0.12 : 0.07)));
    P.add(u);
  }
  if (f.sling && !pistol) P.add(sling(at(0.72, 0.5).add(new THREE.Vector3(0.022, 0, 0)), at(0.05, 0.45).add(new THREE.Vector3(0.022, 0, 0))));
  if (f.shells) { const s = shells(6); s.position.copy(at(0.42, 0.55)).add(new THREE.Vector3(0.028, 0, 0)); P.add(s); }
  P.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  g.add(P);
  g.userData.fit = f;
}
